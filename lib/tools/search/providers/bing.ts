import { SearchResults, SearchResultItem } from '@/lib/types'

import { BaseSearchProvider } from './base'
import { getCachedResults, putCachedResults } from './openserp-cache'
import { SearXNGSearchProvider } from './searxng'
import { gateResults, type RelevanceVerdict } from '../relevance'
import { searchNewsRss } from '../news-rss-lane'

/**
 * Keyless Bing lane with a relevance-gated ladder.
 *
 * Bing serves server-rendered SERP markup to plain HTTP requests — no
 * browser, no API key. But from datacenter egress IPs (Cloudflare Workers,
 * Render) it intermittently serves a random cached SERP — car rankings,
 * dictionary entries, LinkedIn profiles — for an unrelated query. The
 * SearXNG mirror degrades the same way under rate limits.
 *
 * So this provider no longer trusts any single lane. Every lane's results
 * pass through a query-term relevance gate (lib/tools/search/relevance.ts)
 * and the ladder walks: Bing → Bing with a second parameter variant →
 * SearXNG → Google News RSS. The first strong lane wins; weaker evidence is
 * returned untouched but never cached, so junk results can't poison later
 * requests.
 */

const BING_TIMEOUT_MS = 8000
const SEARXNG_LADDER_CAP_MS = 12000
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

/** Rejects a promise after `ms`; the loser keeps running but is ignored. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>(resolve => {
    const timer = setTimeout(() => resolve(fallback), ms)
    promise
      .then(value => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch(() => {
        clearTimeout(timer)
        resolve(fallback)
      })
  })
}

interface LaneResult {
  lane: string
  verdict: RelevanceVerdict
}

/** Best lane by (quality, passing count); earlier lanes win ties. */
function pickBest(lanes: LaneResult[]): LaneResult | null {
  const rank = { strong: 3, weak: 2, fail: 1 } as const
  return lanes.reduce<LaneResult | null>(
    (best, current) => {
      if (!best) return current
      const currentScore = rank[current.verdict.quality] * 100 + current.verdict.passing.length
      const bestScore = rank[best.verdict.quality] * 100 + best.verdict.passing.length
      return currentScore > bestScore ? current : best
    },
    null
  )
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

    const include = (includeDomains ?? []).filter(Boolean)
    const exclude = (excludeDomains ?? []).map(d => d.toLowerCase())
    const domainOk = (item: { url: string }): boolean => {
      if (include.length > 0 && !matchesDomains(item.url, include)) return false
      return !excludeHost(item.url, exclude)
    }

    const bingSerpUrl = (params: string): string =>
      `https://www.bing.com/search?q=${encodeURIComponent(query)}&${params}`

    const attemptBing = async (params: string): Promise<LaneResult> => {
      const html = await fetchBingHtml(bingSerpUrl(params))
      if (!html) return { lane: 'bing', verdict: { passing: [], quality: 'fail' } }
      const parsed = parseBingHtml(html).results.filter(domainOk)
      const verdict = gateResults(query, parsed)
      console.log(
        `[SearchLadder] bing(${params.slice(0, 24)}…) → ${verdict.quality}, ${verdict.passing.length}/${parsed.length} relevant`
      )
      return { lane: 'bing', verdict }
    }

    const attemptSearxng = async (): Promise<LaneResult> => {
      const searxngUrl = process.env.SEARXNG_API_URL
      if (!searxngUrl) {
        return { lane: 'searxng', verdict: { passing: [], quality: 'fail' } }
      }
      try {
        const fallback = new SearXNGSearchProvider()
        const secondary = await withTimeout(
          fallback.search(
            query,
            maxResults,
            _searchDepth === 'advanced' ? 'advanced' : 'basic',
            includeDomains ?? [],
            excludeDomains ?? []
          ),
          SEARXNG_LADDER_CAP_MS,
          null
        )
        if (!secondary || !Array.isArray(secondary.results)) {
          return { lane: 'searxng', verdict: { passing: [], quality: 'fail' } }
        }
        const parsed = secondary.results
          .filter(domainOk)
          .slice(0, maxResults) as SearchResultItem[]
        const verdict = gateResults(query, parsed)
        console.log(
          `[SearchLadder] searxng → ${verdict.quality}, ${verdict.passing.length}/${parsed.length} relevant`
        )
        return { lane: 'searxng', verdict }
      } catch (error) {
        console.error('SearXNG secondary lane failed:', error)
        return { lane: 'searxng', verdict: { passing: [], quality: 'fail' } }
      }
    }

    const attemptNewsRss = async (): Promise<LaneResult> => {
      try {
        const rss = await searchNewsRss(query, maxResults)
        if (!rss || !Array.isArray(rss.results)) {
          return { lane: 'news-rss', verdict: { passing: [], quality: 'fail' } }
        }
        const parsed = rss.results.filter(domainOk).slice(0, maxResults)
        const verdict = gateResults(query, parsed)
        console.log(
          `[SearchLadder] news-rss → ${verdict.quality}, ${verdict.passing.length}/${parsed.length} relevant`
        )
        return { lane: 'news-rss', verdict }
      } catch (error) {
        console.error('News RSS ladder lane failed:', error)
        return { lane: 'news-rss', verdict: { passing: [], quality: 'fail' } }
      }
    }

    // Ladder: primary Bing pass → parameter-variant pass (datacenter IPs
    // get random cached SERPs, so a second variant is a real second chance,
    // not a duplicate call) → SearXNG → News RSS. First strong lane wins,
    // otherwise the best weak set is handed to the model uncached.
    const lanes: LaneResult[] = []

    lanes.push(await attemptBing(`count=${Math.max(maxResults, 10)}&setlang=en`))
    let best = pickBest(lanes)
    if (best?.verdict.quality !== 'strong') {
      lanes.push(
        await attemptBing(
          `count=${Math.max(maxResults, 10)}&mkt=en-IN&setlang=en&cc=in`
        )
      )
      best = pickBest(lanes)
    }
    if (best?.verdict.quality !== 'strong') {
      lanes.push(await attemptSearxng())
      best = pickBest(lanes)
    }
    if (best?.verdict.quality !== 'strong') {
      lanes.push(await attemptNewsRss())
      best = pickBest(lanes)
    }

    if (best && best.verdict.passing.length > 0) {
      results.results = best.verdict.passing.slice(0, maxResults)
      results.number_of_results = results.results.length
    }

    // Only strong, query-consistent result sets enter the shared cache;
    // a poisoned random SERP must not live for 30 minutes in Upstash.
    if (best?.verdict.quality === 'strong' && results.results.length > 0) {
      void putCachedResults(cacheKeyEnv, results)
    }

    return results
  }
}

async function fetchBingHtml(bingQueryUrl: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BING_TIMEOUT_MS)
  try {
    const scraperUrl = process.env.BING_SCRAPER_URL
    const workerKey = process.env.BING_WORKER_KEY
    const fetchUrl = scraperUrl
      ? `${scraperUrl}${scraperUrl.includes('?') ? '&' : '?'}u=${encodeURIComponent(bingQueryUrl)}${workerKey ? `&key=${encodeURIComponent(workerKey)}` : ''}`
      : bingQueryUrl
    const response = await fetch(fetchUrl, {
      signal: controller.signal,
      headers: {
        'user-agent': UA,
        'accept-language': 'en-US,en;q=0.9'
      }
    })
    if (!response.ok) {
      console.error(`Bing scrape web search failed: HTTP ${response.status}`)
      return null
    }
    return await response.text()
  } catch (error) {
    console.error('Bing scrape web search failed:', error)
    return null
  } finally {
    clearTimeout(timer)
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
