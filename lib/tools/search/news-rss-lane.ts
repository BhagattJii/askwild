/**
 * Fast web lane for quick mode.
 *
 * The primary provider (OpenSERP on Render free tier) spends 20-38s per
 * fresh query behind its anti-bot SERP pipeline. Google News RSS answers
 * in ~1s with real, dated articles, no key and no scraping. For the
 * class of queries the quick-mode model asks (current events, prices,
 * projects, world news) RSS is both faster and more reliable.
 *
 * This lane runs first inside the quick-mode wrapper; a weak or empty
 * result falls through to the original provider untouched.
 */

import type { SearchResults } from '@/lib/types'

import { extractQueryTerms, isFreshnessQuery } from './relevance'

const RSS_TIMEOUT_MS = 6000
const MIN_RSS_RESULTS = 2

function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
}

function matchGroup(source: string, tag: string): string {
  const found = source.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))
  return found ? decodeEntities(found[1]) : ''
}

/** Best-effort edition for the query; India leads for generic queries. */
function detectEdition(query: string): {
  hl: string
  gl: string
  ceid: string
} {
  if (/[\u0900-\u097f]/.test(query)) {
    return { hl: 'hi', gl: 'IN', ceid: 'IN:hi' }
  }
  const q = query.toLowerCase()
  if (
    /\b(united states|u\.s\.|usa|washington|new york|california|american)\b/.test(
      q
    )
  ) {
    return { hl: 'en-US', gl: 'US', ceid: 'US:en' }
  }
  if (/\b(united kingdom|britain|london|england|british)\b/.test(q)) {
    return { hl: 'en-GB', gl: 'GB', ceid: 'GB:en' }
  }
  return { hl: 'en-IN', gl: 'IN', ceid: 'IN:en' }
}

function hostOf(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, '')
  } catch {
    return 'news.google.com'
  }
}

/**
 * Returns RSS-derived results when the feed carries at least two items,
 * otherwise null so the caller falls back to the regular provider.
 */
export async function searchNewsRss(
  query: string,
  maxResults: number = 10
): Promise<SearchResults | null> {
  const edition = detectEdition(query)
  // Google News search is poisoned by Hinglish glue words: "Bhai Dooj 2026
  // kab hai" returns 12 mostly-stale items while the cleaned "Bhai Dooj
  // 2026" returns 69 with the top 8 all fresh. Search with the query's own
  // distinctive terms only (falls back to the raw query if none survive).
  const cleaned = extractQueryTerms(query).any.join(' ')
  const searchQuery = cleaned || query
  const url = new URL('https://news.google.com/rss/search')
  url.searchParams.set('q', searchQuery)
  url.searchParams.set('hl', edition.hl)
  url.searchParams.set('gl', edition.gl)
  url.searchParams.set('ceid', edition.ceid)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RSS_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
      signal: controller.signal
    })
    if (!response.ok) return null

    const xml = await response.text()
    if (!xml.includes('<item>')) return null

    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(
      match => match[1]
    )

    const results: SearchResults = {
      results: [],
      images: [],
      videos: [],
      query,
      number_of_results: 0
    }

    interface ParsedItem {
      title: string
      url: string
      content: string
      publishedDate?: string
      timestamp: number
    }

    const parsed: ParsedItem[] = []

    for (const item of items.slice(0, Math.max(maxResults, 20))) {
      const title = matchGroup(item, 'title')
      const link = matchGroup(item, 'link')
      if (!title || !link) continue

      const description = matchGroup(item, 'description')
      const source = matchGroup(item, 'source')
      const pubDate = matchGroup(item, 'pubDate')

      // Google News RSS links are redirect URLs, so the readable publisher
      // goes into the content the model reads.
      const host = hostOf(link)
      const content = [description || title, source || host, host]
        .filter(Boolean)
        .join(' — ')

      parsed.push({
        title,
        url: link,
        content,
        publishedDate: pubDate || undefined,
        timestamp: pubDate ? Date.parse(pubDate) : Number.NaN
      })
    }

    // Google News ranks by keyword match, NOT by recency — so "Bhai Dooj
    // 2026" happily returns March's Holi Bhai Dooj articles months later.
    // For freshness/festival queries, keep only the last 90 days (sorted
    // newest-first). If that leaves too little, return null so the caller
    // can try another lane instead of serving the wrong festival.
    let candidates = parsed
    if (isFreshnessQuery(query)) {
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000
      const recent = parsed
        .filter(entry => !Number.isNaN(entry.timestamp) && entry.timestamp >= cutoff)
        .sort((a, b) => b.timestamp - a.timestamp)
      if (recent.length < MIN_RSS_RESULTS) return null
      candidates = recent
    }

    for (const entry of candidates.slice(0, maxResults)) {
      results.results.push({
        title: entry.title,
        url: entry.url,
        content: entry.content,
        ...(entry.publishedDate
          ? { publishedDate: entry.publishedDate }
          : {})
      })
    }

    results.number_of_results = results.results.length
    if (results.results.length < MIN_RSS_RESULTS) return null
    return results
  } catch (error) {
    console.error('News RSS fast lane failed:', error)
    return null
  } finally {
    clearTimeout(timer)
  }
}
