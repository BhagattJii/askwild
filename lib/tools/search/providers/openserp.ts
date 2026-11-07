import { SearchResults } from '@/lib/types'

import { BaseSearchProvider } from './base'
import { getCachedResults, putCachedResults } from './openserp-cache'

interface OpenserpWebResult {
  rank: number
  type: string
  engine?: string
  title: string
  url: string
  snippet?: string
  description?: string
  content?: string
  published_date?: string | null
}

interface OpenserpImageResult {
  rank: number
  type: string
  engine?: string
  title: string
  url: string
  thumbnail?: {
    src?: string
    width?: number
    height?: number
  }
  width?: number
  height?: number
}

interface OpenserpSearchResponse {
  query?: {
    text?: string
    engines_requested?: string[]
  }
  meta?: {
    took_ms?: number
    engines_failed?: string[]
    version?: string
  }
  results?: OpenserpWebResult[]
}

interface OpenserpImageResponse {
  query?: {
    text?: string
    engines_requested?: string[]
  }
  meta?: {
    took_ms?: number
    engines_failed?: string[]
  }
  results?: OpenserpImageResult[]
}

const DEFAULT_ENGINES = ['google', 'bing', 'duckduckgo']

function imageUrl(item: OpenserpImageResult): string {
  const src = item.thumbnail?.src?.trim()
  if (src) {
    return src
  }
  return typeof item.url === 'string' ? item.url : ''
}

function excludeHost(url: string, exclude: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return exclude.some(domain => host.endsWith(domain))
  } catch {
    return false
  }
}

export class OpenserpSearchProvider extends BaseSearchProvider {
  private baseUrl: string | undefined
  private engines: string[]
  private timeoutMs: number

  constructor() {
    super()
    this.baseUrl = process.env.OPENSERP_URL?.replace(/\/+$/, '')
    this.engines = (
      process.env.OPENSERP_ENGINES?.trim() || DEFAULT_ENGINES.join(',')
    )
      .split(',')
      .map(engine => engine.trim())
      .filter(Boolean)

    if (this.engines.length === 0) {
      this.engines = [...DEFAULT_ENGINES]
    }

    // Render free-tier services sleep after ~15 minutes of inactivity and
    // take 30s+ to answer the first request. The old 30s default aborted
    // those cold-start responses, so the timeout tolerates a cold boot and
    // still cuts genuinely hung connections.
    const timeout = Number(process.env.OPENSERP_TIMEOUT_MS ?? '90000')
    this.timeoutMs = Number.isFinite(timeout) && timeout > 0 ? timeout : 90000
  }

  isAvailable(): boolean {
    return Boolean(this.baseUrl)
  }

  private async fetchJson(
    engine: string,
    path: string,
    params: Record<string, string | number>
  ): Promise<unknown> {
    const url = new URL(`${this.baseUrl}/${engine}/${path}`)
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value))
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        throw new Error(
          `OpenSERP search failed: HTTP ${response.status} ${response.statusText}${
            errorText ? ` - ${errorText.slice(0, 160)}` : ''
          }`
        )
      }

      return response.json()
    } finally {
      clearTimeout(timer)
    }
  }

  private async webSearchOn(
    engine: string,
    query: string,
    maxResults: number
  ): Promise<OpenserpSearchResponse> {
    return (await this.fetchJson(engine, 'search', {
      text: query,
      limit: Math.min(maxResults, 50),
      format: 'json'
    })) as OpenserpSearchResponse
  }

  private async imageSearchOn(
    engine: string,
    query: string,
    maxResults: number
  ): Promise<OpenserpImageResponse> {
    return (await this.fetchJson(engine, 'image', {
      text: query,
      limit: Math.min(maxResults, 50),
      format: 'json'
    })) as OpenserpImageResponse
  }

  private splitContentTypes(options?: {
    type?: 'general' | 'optimized'
    content_types?: Array<'web' | 'video' | 'image' | 'news'>
  }): Array<'web' | 'image'> {
    const contentTypes = options?.content_types ?? ['web']
    const out: Array<'web' | 'image'> = []
    if (contentTypes.includes('web') || contentTypes.includes('news')) {
      out.push('web')
    }
    if (contentTypes.includes('image')) {
      out.push('image')
    }
    return out.length > 0 ? out : ['web']
  }

  private matchesDomains(url: string, domains: string[]): boolean {
    if (domains.length === 0) return true
    try {
      const host = new URL(url).hostname
      return domains.some(domain =>
        domain.startsWith('.')
          ? host.endsWith(domain)
          : host === domain || host.endsWith(`.${domain}`)
      )
    } catch {
      return false
    }
  }

  async search(
    query: string,
    maxResults: number = 10,
    _searchDepth?: 'basic' | 'advanced',
    includeDomains?: string[],
    excludeDomains?: string[],
    options?: {
      type?: 'general' | 'optimized'
      content_types?: Array<'web' | 'video' | 'image' | 'news'>
    }
  ): Promise<SearchResults> {
    this.validateApiUrl(this.baseUrl, 'OPENSERP')

    const requestedTypes = this.splitContentTypes(options)

    // Repeat queries hit the anti-bot pipeline behind the rendered SERP;
    // a cache of completed result sets saves the 20-38s scrape on every
    // later ask of the same topic.
    const cacheKeyEnv = {
      engines: this.engines.join(','),
      query,
      maxResults,
      types: [...requestedTypes],
      include: (includeDomains ?? []).filter(Boolean).join(','),
      exclude: (excludeDomains ?? []).map(d => d.toLowerCase()).join(',')
    }
    const cachedResults = await getCachedResults(cacheKeyEnv)
    if (cachedResults) {
      return { ...cachedResults, query, fromCache: true }
    }

    const results: SearchResults = {
      results: [],
      images: [],
      videos: [],
      query,
      number_of_results: 0
    }

    const include = (includeDomains ?? []).filter(Boolean)
    const exclude = (excludeDomains ?? []).map(domain => domain.toLowerCase())
    const inDomains = new Set(include)

    const tasks: Promise<void>[] = []

    if (requestedTypes.includes('web')) {
      tasks.push(
        (async () => {
          for (const engine of this.engines) {
            try {
              const data = await this.webSearchOn(engine, query, maxResults)
              const list = Array.isArray(data?.results) ? data.results : []
              const filtered = list.filter(
                item =>
                  item &&
                  typeof item.url === 'string' &&
                  item.url.length > 0 &&
                  (inDomains.size === 0 ||
                    this.matchesDomains(item.url, include)) &&
                  !excludeHost(item.url, exclude)
              )
              if (filtered.length > 0) {
                results.results = filtered.map((item, index) => ({
                  title: item.title ?? '',
                  url: item.url,
                  content: item.snippet ?? item.description ?? '',
                  ...(item.published_date
                    ? { publishedDate: item.published_date }
                    : {})
                }))
                return
              }
            } catch (error) {
              console.error(`OpenSERP ${engine} web search failed:`, error)
            }
          }
        })()
      )
    }

    if (requestedTypes.includes('image')) {
      tasks.push(
        (async () => {
          for (const engine of this.engines) {
            try {
              const data = await this.imageSearchOn(engine, query, maxResults)
              const list = Array.isArray(data?.results) ? data.results : []
              const filtered = list
                .map(item => imageUrl(item))
                .filter(url => {
                  if (!/^https?:\/\//i.test(url)) return false
                  if (inDomains.size > 0 && !this.matchesDomains(url, include))
                    return false
                  try {
                    const host = new URL(url).hostname.toLowerCase()
                    return !exclude.some(domain => host.endsWith(domain))
                  } catch {
                    return false
                  }
                })
              if (filtered.length > 0) {
                results.images = Array.from(new Set(filtered)).slice(
                  0,
                  maxResults
                )
                return
              }
            } catch (error) {
              console.error(`OpenSERP ${engine} image search failed:`, error)
            }
          }
        })()
      )
    }

    await Promise.all(tasks)
    results.number_of_results = results.results.length
    void putCachedResults(cacheKeyEnv, results)
    return results
  }
}
