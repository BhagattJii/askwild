import type { SearchResults, SearchResultItem } from '@/lib/types'

import { BaseSearchProvider } from './base'
import { getCachedResults, putCachedResults } from './openserp-cache'
import { SearXNGSearchProvider } from './searxng'
import { fetchBingRss, fetchWikipedia } from '../keyless-lanes'
import { gateResults, isFreshnessQuery, type RelevanceVerdict } from '../relevance'
import { searchNewsRss } from '../news-rss-lane'

/**
 * Keyless search POOL (the "unlimited, free, no-IP-fear" engine).
 *
 * No single keyless source is honest all the time: Bing's HTML SERP
 * occasionally serves a random cached page to datacenter IPs, its RSS
 * pipeline is brilliant for freshness queries and garbage for evergreen
 * ones, SearXNG mirrors degrade under rate limits, and Wikipedia holds
 * entity facts but not the day's news. So instead of ONE primary
 * provider, the pool races several cheap keyless lanes at once, filters
 * every lane through the query-term relevance gate, and hands the model
 * the first STRONG lane's results:
 *
 *   phase 1 (parallel, ~7s): Bing-HTML (scrape worker) + Bing-RSS
 *                            (direct) + Wikipedia (direct)
 *   phase 2 (only if weak):  Bing-HTML with mkt=en-IN + SearXNG
 *   phase 3 (only if weak):  Google News RSS
 *
 * Lanes that repeatedly return weak/fail sets take a 10-minute cooldown
 * (in-memory circuit breaker), so poison can't slow the happy path.
 * Only STRONG result sets enter the shared cache; freshness queries are
 * cached 25 minutes, evergreen 6 hours — repeats answer instantly with
 * zero external calls.
 */

const BING_TIMEOUT_MS = 7000
const SEARXNG_LADDER_CAP_MS = 12000
const NEWS_RSS_CAP_MS = 6000
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const FRESHNESS_TTL_SECONDS = 25 * 60
const EVERGREEN_TTL_SECONDS = 6 * 60 * 60
const BREAKER_COOLDOWN_MS = 10 * 60 * 1000

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

// Circuit breaker state per lambda instance: two consecutive weak/fail
// outcomes earn the lane a 10-minute cooldown so the pool stops paying
// for (and waiting on) a temporarily-poisoned source.
const laneHealth = new Map<string, { softStreak: number; cooldownUntil: number }>()

function laneReady(lane: string): boolean {
  const entry = laneHealth.get(lane)
  if (!entry) return true
  return Date.now() > entry.cooldownUntil
}

function recordLaneOutcome(lane: string, quality: RelevanceVerdict['quality']): void {
  const entry = laneHealth.get(lane) ?? { softStreak: 0, cooldownUntil: 0 }
  if (quality === 'strong') {
    entry.softStreak = 0
    entry.cooldownUntil = 0
  } else {
    entry.softStreak += 1
    if (entry.softStreak >= 2) {
      entry.cooldownUntil = Date.now() + BREAKER_COOLDOWN_MS
    }
  }
  laneHealth.set(lane, entry)
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

    const laneAttempt = async (
      lane: string,
      fetchItems: () => Promise<SearchResultItem[]>
    ): Promise<LaneResult> => {
      const items = (await fetchItems()).filter(domainOk)
      const verdict = gateResults(query, items)
      console.log(
        `[SearchPool] ${lane} → ${verdict.quality}, ${verdict.passing.length}/${items.length} relevant`
      )
      return { lane, verdict }
    }

    const bingHtml = (params: string) =>
      laneAttempt('bing-html', async () => {
        const html = await fetchBingHtml(
          `https://www.bing.com/search?q=${encodeURIComponent(query)}&${params}`
        )
        if (!html) return []
        return parseBingHtml(html).results
      })

    const bingRss = () =>
      laneAttempt('bing-rss', () => fetchBingRss(query, maxResults))

    const wikipedia = () =>
      laneAttempt('wikipedia', () => fetchWikipedia(query, maxResults))

    const searxng = async (): Promise<LaneResult> => {
      const searxngUrl = process.env.SEARXNG_API_URL
      if (!searxngUrl) {
        return { lane: 'searxng', verdict: { passing: [], quality: 'fail' } }
      }
      return laneAttempt('searxng', async () => {
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
        if (!secondary || !Array.isArray(secondary.results)) return []
        return secondary.results.slice(0, maxResults) as SearchResultItem[]
      })
    }

    const newsRss = () =>
      laneAttempt('news-rss', async () => {
        const rss = await searchNewsRss(query, maxResults)
        return rss && Array.isArray(rss.results) ? rss.results : []
      })

    // ---- THE POOL ----
    const lanes: LaneResult[] = []

    // Phase 1: three independent views of the web, raced in parallel.
    const phase1 = [
      { lane: 'bing-html', cap: BING_TIMEOUT_MS, run: () => bingHtml(`count=${Math.max(maxResults, 10)}&setlang=en`) },
      { lane: 'bing-rss', cap: BING_TIMEOUT_MS, run: bingRss },
      { lane: 'wikipedia', cap: BING_TIMEOUT_MS, run: wikipedia }
    ].filter(candidate => laneReady(candidate.lane))

    const phase1Results = await Promise.all(
      phase1.map(candidate => withTimeout(candidate.run(), candidate.cap, null))
    )
    phase1Results.forEach((result, index) => {
      if (!result) return
      recordLaneOutcome(phase1[index].lane, result.verdict.quality)
      lanes.push(result)
    })
    let best = pickBest(lanes)

    // Phase 2: market-variant Bing + SearXNG mirror.
    if (best?.verdict.quality !== 'strong') {
      const phase2 = [
        { lane: 'bing-html', cap: BING_TIMEOUT_MS, run: () => bingHtml(`count=${Math.max(maxResults, 10)}&mkt=en-IN&setlang=en&cc=in`) },
        { lane: 'searxng', cap: SEARXNG_LADDER_CAP_MS, run: searxng }
      ].filter(candidate => laneReady(candidate.lane))
      const phase2Results = await Promise.all(
        phase2.map(candidate => withTimeout(candidate.run(), candidate.cap, null))
      )
      phase2Results.forEach((result, index) => {
        if (!result) return
        recordLaneOutcome(phase2[index].lane, result.verdict.quality)
        lanes.push(result)
      })
      best = pickBest(lanes)
    }

    // Phase 3: freshness-grade Google News RSS as the final keyless view.
    if (best?.verdict.quality !== 'strong' && laneReady('news-rss')) {
      const final = await withTimeout(newsRss(), NEWS_RSS_CAP_MS, null)
      if (final) {
        recordLaneOutcome('news-rss', final.verdict.quality)
        lanes.push(final)
        best = pickBest(lanes)
      }
    }

    if (best && best.verdict.passing.length > 0) {
      results.results = best.verdict.passing.slice(0, maxResults)
      results.number_of_results = results.results.length
    }

    // Only strong, query-consistent result sets enter the shared cache:
    // freshness sets stay 25 minutes, evergreen sets 6 hours, so repeats
    // are instant and never cost another external call.
    if (best?.verdict.quality === 'strong' && results.results.length > 0) {
      const ttl = isFreshnessQuery(query)
        ? FRESHNESS_TTL_SECONDS
        : EVERGREEN_TTL_SECONDS
      void putCachedResults(cacheKeyEnv, results, ttl)
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
