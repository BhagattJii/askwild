import type { SearchResultItem } from '@/lib/types'

import { extractQueryTerms } from './relevance'

/**
 * Keyless lane fetchers for the search pool.
 *
 * Each fetcher talks to one no-key HTTP source and returns plain
 * SearchResultItem[]; empty on any failure. The pool (providers/bing.ts)
 * runs these in parallel, filters them through the relevance gate, and
 * picks the first strong lane — so a source that is down or poisoned
 * costs time, never quality.
 *
 * Lane notes from live testing (Nov 2026):
 *  - Bing RSS (format=rss): machine-readable SERP, unbeatable for news /
 *    festival / freshness queries, garbage for evergreen encyclopedia
 *    queries (the gate handles that).
 *  - Wikipedia REST search: exact top hit for entity/encyclopedia
 *    queries, ~1s, no IP games by design (public API).
 */

const LANE_TIMEOUT_MS = 7000

function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

const RSS_ITEM = /<item>([\s\S]*?)<\/item>/g
const RSS_TITLE = /<title>([\s\S]*?)<\/title>/
const RSS_LINK = /<link>([\s\S]*?)<\/link>/
const RSS_DESCRIPTION = /<description>([\s\S]*?)<\/description>/

/**
 * Bing's syndication SERP: https://www.bing.com/search?q=...&format=rss
 * Called DIRECTLY (not through the scrape worker): behind Cloudflare
 * egress Bing redirects the RSS endpoint to a Microsoft sign-in page,
 * but from ordinary server IPs it answers with a clean XML feed.
 */
export async function fetchBingRss(
  query: string,
  maxResults: number = 10
): Promise<SearchResultItem[]> {
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query.trim())}&format=rss&count=${Math.max(maxResults, 15)}`
    const response = await fetch(url, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'accept-language': 'en-US,en;q=0.9'
      },
      signal: AbortSignal.timeout(LANE_TIMEOUT_MS)
    })
    if (!response.ok) return []
    const xml = await response.text()
    if (!xml.includes('<item>')) return []
    const items: SearchResultItem[] = []
    for (const match of xml.matchAll(RSS_ITEM)) {
      const block = match[1]
      const titleMatch = block.match(RSS_TITLE)
      const linkMatch = block.match(RSS_LINK)
      if (!titleMatch || !linkMatch) continue
      const title = decodeEntities(titleMatch[1])
      const link = linkMatch[1].trim()
      if (!title || !/^https?:\/\//i.test(link)) continue
      const description = block.match(RSS_DESCRIPTION)
      items.push({
        title,
        url: link,
        content: description ? decodeEntities(description[1]).slice(0, 500) : ''
      })
      if (items.length >= maxResults) break
    }
    return items
  } catch {
    return []
  }
}



/** Devanagari queries read best from the Hindi Wikipedia. */
function detectWikiLang(query: string): 'en' | 'hi' {
  return /[\u0900-\u097f]/.test(query) ? 'hi' : 'en'
}

/**
 * Wikipedia REST search (public API, no key, no scraping):
 * /w/rest.php/v1/search/page?q=...&limit=N — top-hit quality is exactly
 * the "who is X / what is Y" champion the model needs.
 */
export async function fetchWikipedia(
  query: string,
  maxResults: number = 5
): Promise<SearchResultItem[]> {
  try {
    const lang = detectWikiLang(query)
    const url = `https://${lang}.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query.trim())}&limit=${Math.max(maxResults, 5)}`
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Askwild/1.0 (free AI search)' },
      signal: AbortSignal.timeout(LANE_TIMEOUT_MS)
    })
    if (!response.ok) return []
    const data = (await response.json()) as {
      pages?: Array<{
        title?: string
        description?: string | null
        excerpt?: string | null
      }>
    }
    const pages = data.pages ?? []
    const candidates = pages
      .filter(page => page.title)
      .slice(0, maxResults)

    // Canonical-first ordering: for "who is albert einstein" the REST API
    // lists Hans / family / wife pages before the main article. A page is
    // canonical when the most query terms, IN ORDER, live inside its
    // title ("Albert Einstein" holds both; "Hans Albert Einstein" adds an
    // unasked-for word; "Einstein family" drops "albert"). Ties go to the
    // shorter title, and nobody matching keeps the API's own order.
    const terms = extractQueryTerms(query).any
    const termHits = (title: string): number => {
      if (terms.length === 0) return 0
      const words = title.toLowerCase().split(/[^\p{L}\p{N}]+/u)
      let matched = 0
      let cursor = 0
      for (const term of terms) {
        for (let index = cursor; index < words.length; index++) {
          if (words[index].startsWith(term)) {
            matched++
            cursor = index + 1
            break
          }
        }
      }
      return matched
    }

    return candidates
      .map(page => {
        const title = page.title as string
        const url = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
        const description = stripWikiTags(page.description ?? '')
        const excerpt = stripWikiTags(page.excerpt ?? '')
        const content = [description, excerpt].filter(Boolean).join(' — ')
        return { title, url, content: content.slice(0, 500) } as SearchResultItem
      })
      .sort(
        (a, b) =>
          termHits(b.title) - termHits(a.title) ||
          a.title.length - b.title.length
      )
  } catch {
    return []
  }
}

/** Excerpts carry <mark> and <wbr> markup; descriptions carry none. */
function stripWikiTags(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
