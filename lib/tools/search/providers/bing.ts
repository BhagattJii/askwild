import { SearchResults } from '@/lib/types'

import { BaseSearchProvider } from './base'
import { getCachedResults, putCachedResults } from './openserp-cache'
import { SearXNGSearchProvider } from './searxng'

/**
 * Keyless Bing lane. Bing serves server-rendered SERP markup to plain
 * HTTP requests — no browser, no API key. The provider is deliberately
 * self-contained (single fetch, tolerant parse, cache for repeats) so a
 * Bing-side structure change degrades to an empty result set that the
 * caller treats as "no lane available" instead of failing the request.
 */

const BING_TIMEOUT_MS = 8000
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export interface ParsedBingPage {
  results: Array<{ title: string; url: string; content: string }>
}

export function parseBingHtml(html: string): ParsedBingPage {
  const results: ParsedBingPage['results'] = []
  // Result blocks wear the b_algo class; the page ships as one long line,
  // so work over the whole body and cut at each block start.
  const blocks = html.split('<li class="b_algo')
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].slice(0, 12000)
    const anchor =
      /<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block)
    if (!anchor) continue
    const title = stripTags(anchor[2])
    const url = unwrapBingRedirect(anchor[1])
    if (!title || !url) continue
    const snippet = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block)?.[1] ?? ''
    results.push({ title, url, content: stripTags(snippet).slice(0, 500) })
    if (results.length >= 50) break
  }
  return { results }
}

/** Bing wraps organic links in /ck/a trackers; the real URL hides in the
 *  u=a1<base64url> parameter when present, otherwise the href is direct. */
export function unwrapBingRedirect(href: string): string | null {
  // Attribute values arrive HTML-escaped; &amp;u=a1 would otherwise read
  // as an "amp;u" query parameter and the real URL would be invisible.
  const decoded = htmlUnescape(href)
  if (!/^https?:\/\//i.test(decoded)) return null
  try {
    const url = new URL(decoded)
    if (!isBingHost(url.hostname)) return decoded
    if (url.pathname !== '/ck/a') return null
    const inner = url.searchParams.get('u') ?? ''
    if (inner.startsWith('a1')) {
      const real = Buffer.from(inner.slice(2), 'base64url').toString('utf8')
      if (/^https?:\/\//i.test(real)) return real
    }
    return null
  } catch {
    return null
  }
}

function htmlUnescape(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
}

function isBingHost(hostname: string): boolean {
  return hostname === 'www.bing.com' || hostname.endsWith('.bing.com')
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export class BingScrapeSearchProvider extends BaseSearchProvider {
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
    const requestedTypes = new Set(
      options?.content_types?.length
        ? options.content_types
        : (['web'] as const)
    )

    const cacheKeyEnv = {
      engines: 'bing-scrape',
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

    if (!requestedTypes.has('web') || !query.trim()) {
      return results
    }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), BING_TIMEOUT_MS)
      const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${Math.max(maxResults, 10)}&setlang=en`
      const scraperUrl = process.env.BING_SCRAPER_URL
      const workerKey = process.env.BING_WORKER_KEY
      const fetchUrl = scraperUrl
        ? `${scraperUrl}${scraperUrl.includes('?') ? '&' : '?'}u=${encodeURIComponent(bingUrl)}${workerKey ? `&key=${encodeURIComponent(workerKey)}` : ''}`
        : bingUrl
      const response = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: {
          'user-agent': UA,
          'accept-language': 'en-US,en;q=0.9'
        }
      }).finally(() => clearTimeout(timer))
      if (response.ok) {
        const html = await response.text()
        const parsed = parseBingHtml(html)
        const include = (includeDomains ?? []).filter(Boolean)
        const exclude = (excludeDomains ?? []).map(d => d.toLowerCase())
        results.results = parsed.results
          .filter(item => {
            if (include.length > 0 && !matchesDomains(item.url, include)) {
              return false
            }
            return !excludeHost(item.url, exclude)
          })
          .slice(0, maxResults)
      } else {
        console.error(`Bing scrape web search failed: HTTP ${response.status}`)
      }
    } catch (error) {
      console.error('Bing scrape web search failed:', error)
    }

    results.number_of_results = results.results.length

    // Secondary lane: when Bing yields almost nothing (soft block, layout
    // change), the configured SearXNG API mirrors the query instead so the
    // answer never degrades to "no lane available" while a host keyless.
    if (results.results.length < 2 && requestedTypes.has('web')) {
      const searxngUrl = process.env.SEARXNG_API_URL
      if (searxngUrl) {
        try {
          const fallback = new SearXNGSearchProvider()
          const secondary = await fallback.search(
            query,
            maxResults,
            _searchDepth === 'advanced' ? 'advanced' : 'basic',
            includeDomains ?? [],
            excludeDomains ?? []
          )
          if (secondary.results.length > 0) {
            results.results = secondary.results.slice(0, maxResults)
            results.number_of_results = results.results.length
          }
        } catch (error) {
          console.error('SearXNG secondary lane failed:', error)
        }
      }
    }

    if (results.results.length > 0) {
      void putCachedResults(cacheKeyEnv, results)
    }
    return results
  }
}

function excludeHost(url: string, exclude: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return exclude.some(domain => host.endsWith(domain))
  } catch {
    return false
  }
}

function matchesDomains(url: string, domains: string[]): boolean {
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
