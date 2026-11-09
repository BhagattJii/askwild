import type { SearchResultItem } from '@/lib/types'

/**
 * Relevance gate for keyless search lanes.
 *
 * The keyless LLMGSER lanes (Bing scrape through a datacenter IP, SearXNG
 * mirrors behind rate limits) intermittently serve a completely unrelated
 * cached SERP — car rankings, random LinkedIn profiles, ChatGPT chatter
 * — for an artisanal query. Downstream, the model cannot tell "these ten
 * results are junk" from "these are my sources" and fabricates a confident
 * non-answer on top of them.
 *
 * The gate scores every result against the query's own terms: a result is
 * relevant when a distinctive query term appears in its title or URL and
 * again in its snippet. Lanes are graded by how many results pass, so the
 * caller can drop a poisoned lane and try the next one instead of feeding
 * the model random SERPs.
 */

const STOPWORDS = new Set([
  // English glue + meta-words that carry no topical signal
  'the', 'what', 'who', 'whom', 'whose', 'when', 'where', 'which', 'why',
  'how', 'this', 'that', 'these', 'those', 'with', 'from', 'for', 'and',
  'about', 'tell', 'give', 'show', 'find', 'know', 'please', 'now',
  'today', 'tonight', 'tomorrow', 'yesterday', 'there', 'here', 'its',
  // Hinglish glue ("kab ki hai", "kya hai", "batao na")
  'kab', 'kya', 'kaisa', 'kaise', 'kahan', 'kaun', 'kon', 'hai', 'hain',
  'tha', 'thi', 'ki', 'ka', 'ke', 'ko', 'ne', 'se', 'me', 'par',
  'bhi', 'aur', 'ek', 'nahi', 'na', 'bata', 'batao', 'batai', 'batana',
  'jara', 'zara', 'mujhe', 'mera', 'meri', 'apna', 'apni', 'kis', 'kiska',
  'liye', 'wala', 'wali', 'sab', 'kuch', 'aur', 'ya', 'phir', 'abhi'
])

interface QueryTerms {
  latin: string[]
  any: string[] // latin + Devanagari, all normalized
}

export function extractQueryTerms(query: string): QueryTerms {
  const seen = new Set<string>()
  const latin: string[] = []

  for (const raw of query.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (!raw) continue
    const isDevanagari = /[\u0900-\u097f]/.test(raw)
    if (isDevanagari ? raw.length < 2 : raw.length < 3) continue
    if (STOPWORDS.has(raw)) continue
    if (seen.has(raw)) continue
    seen.add(raw)
    if (!isDevanagari) latin.push(raw)
    if (seen.size >= 10) break
  }

  return { latin, any: [...seen] }
}

function resultHaystack(result: SearchResultItem): string {
  // The URL is part of the signal: decoded Bing redirect paths read like
  // ".../bhai-dooj-2026-date" even when the <title> is marketing fluff.
  let url = ''
  try {
    const parsed = new URL(result.url)
    url = `${parsed.hostname} ${decodeURIComponent(parsed.pathname)} ${parsed.search}`
  } catch {
    url = result.url
  }
  return `${result.title}\n${url}`.toLowerCase()
}

function countTermHits(haystack: string, terms: string[]): number {
  let hits = 0
  for (const term of terms) {
    if (haystack.includes(term)) hits++
  }
  return hits
}

/**
 * A result is relevant when DISTINCT query terms bind to it. Counting the
 * same term once per field is exactly how a Suniel-Shetty movie page
 * ("Bhai ... Bhai ..." in title and snippet) passes a Bhai Dooj query —
 * one lucky word repeated is not relevance.
 */
export function isResultRelevant(
  result: SearchResultItem,
  terms: QueryTerms
): boolean {
  const distinctTerms = (haystack: string): Set<string> => {
    const found = new Set<string>()
    for (const term of terms.any) {
      if (haystack.includes(term)) found.add(term)
    }
    return found
  }

  const strong = distinctTerms(resultHaystack(result))
  const content = distinctTerms((result.content ?? '').toLowerCase())

  if (terms.any.length === 1) {
    return strong.size >= 1
  }
  const union = new Set([...strong, ...content])
  return union.size >= 2 && strong.size >= 1
}

export interface RelevanceVerdict {
  passing: SearchResultItem[]
  quality: 'strong' | 'weak' | 'fail'
}

/**
 * Split a lane's results into query-relevant entries and a verdict.
 *  - strong: enough passing results to trust the lane as a source set
 *  - weak:   some signal, usable only as a last-resort answer base
 *  - fail:   the lane is describing a different world than the query
 */
export function gateResults(
  query: string,
  results: SearchResultItem[]
): RelevanceVerdict {
  const clean = (results ?? []).filter(
    r => r && typeof r.title === 'string' && typeof r.url === 'string'
  )
  const terms = extractQueryTerms(query)
  if (terms.any.length === 0) {
    // Nothing distinctive to judge against: trust the lane but say so by
    // grading strong only when there are results at all.
    return { passing: clean, quality: clean.length > 0 ? 'strong' : 'fail' }
  }
  const passing = clean.filter(result => isResultRelevant(result, terms))
  const quality: RelevanceVerdict['quality'] =
    passing.length >= 4 ? 'strong' : passing.length >= 2 ? 'weak' : 'fail'
  return { passing, quality }
}

const FRESHNESS_PATTERN =
  /\b(news|breaking|latest|aaj|abhi|today|price|bhav|rate|stock|share|market|nifty|sensex|crypto|bitcoin|gold|silver|petrol|diesel|weather|mausam|forecast|score|match|election|exit poll|result|results|live|update|released?|launch(ed)?|holiday|festival|tyohar|parv|puja|vrat|dates?|kab hai|kab ki|muhurat|shubh|panchang|tithi|hoga|hogi|aayega|manaya|celebrat\w*|when is|what time|who won|fixtures)\b/i

/**
 * Queries whose best fresh source is dated news (festivals, prices,
 * matches, politics) rather than evergreen encyclopedia text. The quick
 * wrapper can then lead with the ~1s Google News RSS lane instead of
 * waiting for a scraping provider.
 */
export function isFreshnessQuery(query: string): boolean {
  if (/\b(19|20)\d{2}\b/.test(query)) return true // an explicit year
  return FRESHNESS_PATTERN.test(query)
}
