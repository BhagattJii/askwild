import { tool } from 'ai'
import { z } from 'zod'

/**
 * Free, no-key knowledge APIs. Every tool fails soft (returns a found/ok
 * flag instead of throwing) so the agent can fall back to web search or
 * its own knowledge instead of aborting the turn.
 */

const FAST_TIMEOUT_MS = 8000

function weatherCondition(code: number): string {
  if (code === 0) return 'Clear sky'
  if (code <= 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code === 45 || code === 48) return 'Fog'
  if (code >= 51 && code <= 57) return 'Drizzle'
  if (code >= 61 && code <= 67) return 'Rain'
  if (code >= 71 && code <= 77) return 'Snow'
  if (code >= 80 && code <= 82) return 'Rain showers'
  if (code === 85 || code === 86) return 'Snow showers'
  if (code >= 95) return 'Thunderstorm'
  return 'Unknown'
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Askwild/1.0 (free AI search)' },
    signal: AbortSignal.timeout(FAST_TIMEOUT_MS)
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response.json()
}

export function createWikiSummaryTool() {
  return tool({
    description:
      'Encyclopedia summary for any topic (people, places, countries, events, science, history, culture). Use INSTEAD of web search for "what is X", "who is Y", "explain Z" questions. Returns a concise factual answer with the Wikipedia URL.',
    inputSchema: z.object({
      topic: z.string().min(1).max(200).describe('Topic to look up')
    }),
    async execute({ topic }) {
      try {
        const data = (await fetchJson(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic.trim())}`
        )) as {
          title?: string
          description?: string | null
          extract?: string
          content_urls?: { desktop?: { page?: string } }
          thumbnail?: { source?: string }
        }
        if (!data?.extract) {
          return { found: false as const, topic }
        }
        return {
          found: true as const,
          title: data.title ?? topic,
          description: data.description ?? null,
          extract: data.extract,
          url:
            data.content_urls?.desktop?.page ??
            `https://en.wikipedia.org/?search=${encodeURIComponent(topic)}`,
          thumbnail: data.thumbnail?.source ?? null
        }
      } catch {
        return { found: false as const, topic }
      }
    }
  })
}

export function createWeatherTool() {
  return tool({
    description:
      'Live weather for any city (current conditions + 3-day forecast). Use for any weather/umbrella/temperature/"will it rain" question.',
    inputSchema: z.object({
      city: z.string().min(1).max(100).describe('City name, e.g. Mumbai')
    }),
    async execute({ city }) {
      try {
        const geo = (await fetchJson(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.trim())}&count=1&language=en`
        )) as {
          results?: Array<{
            name: string
            latitude: number
            longitude: number
            country_code?: string
            admin1?: string
          }>
        }
        const place = geo?.results?.[0]
        if (!place) {
          return { found: false as const, city }
        }
        const forecast = (await fetchJson(
          `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=3&timezone=auto`
        )) as {
          current_weather?: { temperature: number; windspeed: number; weathercode: number }
          daily?: {
            time: string[]
            temperature_2m_max: number[]
            temperature_2m_min: number[]
            weathercode: number[]
            precipitation_probability_max: number[]
          }
        }
        const current = forecast.current_weather
        const daily = forecast.daily
        return {
          found: true as const,
          city: place.name,
          region: place.admin1 ?? null,
          country: place.country_code ?? null,
          current: current
            ? {
                temperatureC: current.temperature,
                windKph: current.windspeed,
                condition: weatherCondition(current.weathercode)
              }
            : null,
          forecast: daily
            ? daily.time.map((date, i) => ({
                date,
                maxC: daily.temperature_2m_max[i],
                minC: daily.temperature_2m_min[i],
                condition: weatherCondition(daily.weathercode[i]),
                rainChancePercent: daily.precipitation_probability_max?.[i] ?? null
              }))
            : []
        }
      } catch {
        return { found: false as const, city }
      }
    }
  })
}

export function createCurrencyTool() {
  return tool({
    description:
      'Live currency conversion (mid-market rates, today). Use for any USD/INR/EUR/GBP-style conversion question.',
    inputSchema: z.object({
      from: z.string().length(3).describe('ISO 3-letter code, e.g. USD'),
      to: z.string().length(3).describe('ISO 3-letter code, e.g. INR'),
      amount: z.number().positive().default(1).describe('Amount to convert')
    }),
    async execute({ from, to, amount }) {
      try {
        const f = from.toUpperCase().trim()
        const t = to.toUpperCase().trim()
        const data = (await fetchJson(
          `https://api.frankfurter.dev/v1/latest?amount=${amount}&from=${f}&to=${t}`
        )) as { date?: string; rates?: Record<string, number> }
        const rate = data?.rates?.[t]
        if (rate === undefined) {
          return { ok: false as const, reason: 'Unsupported currency code' }
        }
        return {
          ok: true as const,
          amount,
          from: f,
          to: t,
          rate: rate / amount,
          converted: rate,
          date: data.date ?? null
        }
      } catch {
        return { ok: false as const, reason: 'Service unavailable' }
      }
    }
  })
}

export function createStockQuoteTool() {
  return tool({
    description:
      'Live stock/index price with daily change. Use for any share/index/Nifty/Sensex question. Tickers: Indian stocks use .NS (e.g. RELIANCE.NS, TCS.NS), indices are ^NSEI (Nifty 50) and ^BSESN (Sensex); US stocks plain (AAPL), US indices ^GSPC/^DJI/^IXIC.',
    inputSchema: z.object({
      symbol: z.string().min(1).max(20).describe('Yahoo Finance ticker symbol')
    }),
    async execute({ symbol }) {
      try {
        const s = symbol.trim().toUpperCase()
        const data = (await fetchJson(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=5d&interval=1d`
        )) as {
          chart?: {
            result?: Array<{
              meta?: {
                symbol?: string
                currency?: string
                exchangeName?: string
                regularMarketPrice?: number
                previousClose?: number
                chartPreviousClose?: number
                regularMarketTime?: number
              }
            }>
            error?: { description?: string } | null
          }
        }
        const meta = data?.chart?.result?.[0]?.meta
        if (!meta?.regularMarketPrice) {
          return { found: false as const, symbol: s }
        }
        const previousClose = meta.previousClose ?? meta.chartPreviousClose ?? null
        const change = previousClose ? meta.regularMarketPrice - previousClose : null
        const changePercent =
          previousClose && previousClose !== 0
            ? (change! / previousClose) * 100
            : null
        return {
          found: true as const,
          symbol: meta.symbol ?? s,
          exchange: meta.exchangeName ?? null,
          currency: meta.currency ?? null,
          price: meta.regularMarketPrice,
          previousClose,
          change,
          changePercent,
          updated: meta.regularMarketTime
            ? new Date(meta.regularMarketTime * 1000).toISOString()
            : null
        }
      } catch {
        return { found: false as const, symbol: symbol.trim().toUpperCase() }
      }
    }
  })
}

const RSS_ITEM = /<item>([\s\S]*?)<\/item>/g
const RSS_TITLE = /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/
const RSS_LINK = /<link>([\s\S]*?)<\/link>/
const RSS_PUBDATE = /<pubDate>([\s\S]*?)<\/pubDate>/
const RSS_SOURCE = /<source[^>]*>([\s\S]*?)<\/source>/

function stripCdata(text: string): string {
  return text.replace(/^<!\[CDATA\[|\]\]>$/g, '').trim()
}

export function createNewsSearchTool() {
  return tool({
    description:
      'Latest news headlines with source and publication time. Use for any news/today/breaking/what happened question. Defaults to Indian outlets.',
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .max(200)
        .describe('News topic, e.g. "India budget"'),
      maxResults: z.number().int().min(1).max(10).default(6)
    }),
    async execute({ query, maxResults }) {
      try {
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query.trim())}&hl=en-IN&gl=IN&ceid=IN:en`
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Askwild/1.0 (free AI search)' },
          signal: AbortSignal.timeout(FAST_TIMEOUT_MS)
        })
        if (!response.ok) {
          return { ok: false as const, reason: `HTTP ${response.status}` }
        }
        const xml = await response.text()
        const items: Array<{
          title: string
          link: string
          published: string | null
          source: string | null
        }> = []
        for (const match of xml.matchAll(RSS_ITEM)) {
          const block = match[1]
          const titleMatch = block.match(RSS_TITLE)
          const linkMatch = block.match(RSS_LINK)
          const dateMatch = block.match(RSS_PUBDATE)
          const sourceMatch = block.match(RSS_SOURCE)
          const title = titleMatch
            ? stripCdata(titleMatch[1] ?? titleMatch[2] ?? '')
            : ''
          const link = linkMatch ? linkMatch[1].trim() : ''
          if (!title || !link) continue
          items.push({
            title,
            link,
            published: dateMatch ? dateMatch[1].trim() : null,
            source: sourceMatch ? stripCdata(sourceMatch[1]) : null
          })
          if (items.length >= maxResults) break
        }
        return { ok: true as const, query, items }
      } catch {
        return { ok: false as const, reason: 'Service unavailable' }
      }
    }
  })
}

const ENTRY = /<entry>([\s\S]*?)<\/entry>/g
const ID_LINK = /<id>http:\/\/arxiv\.org\/abs\/([^<]+)<\/id>/
const ENTRY_TITLE = /<title>([\s\S]*?)<\/title>/
const ENTRY_SUMMARY = /<summary>([\s\S]*?)<\/summary>/
const ENTRY_PUBLISHED = /<published>([\s\S]*?)<\/published>/
const ENTRY_AUTHOR = /<name>([\s\S]*?)<\/name>/g

export function createAcademicSearchTool() {
  return tool({
    description:
      'Research papers from arXiv (title, authors, abstract, link). Use for any science/research/paper/study question — especially on AI, physics, math, CS, economics.',
    inputSchema: z.object({
      query: z.string().min(1).max(150).describe('Paper topic, e.g. "quantum error correction"'),
      maxResults: z.number().int().min(1).max(8).default(5)
    }),
    async execute({ query, maxResults }) {
      try {
        const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query.trim())}&max_results=${maxResults}`
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Askwild/1.0 (free AI search)' },
          signal: AbortSignal.timeout(FAST_TIMEOUT_MS)
        })
        if (!response.ok) {
          return { ok: false as const, reason: `HTTP ${response.status}` }
        }
        const xml = await response.text()
        const papers: Array<{
          id: string
          title: string
          authors: string[]
          abstract: string
          published: string
          link: string
        }> = []
        for (const match of xml.matchAll(ENTRY)) {
          const block = match[1]
          const idMatch = block.match(ID_LINK)
          const titleMatch = block.match(ENTRY_TITLE)
          const summaryMatch = block.match(ENTRY_SUMMARY)
          const publishedMatch = block.match(ENTRY_PUBLISHED)
          const authors = [...block.matchAll(ENTRY_AUTHOR)].map(m => m[1].trim())
          const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : ''
          if (!title) continue
          papers.push({
            id: idMatch ? idMatch[1] : 'unknown',
            title,
            authors: authors.slice(0, 6),
            abstract: summaryMatch
              ? summaryMatch[1].replace(/\s+/g, ' ').trim().slice(0, 400)
              : '',
            published: publishedMatch ? publishedMatch[1].trim() : '',
            link: idMatch ? `https://arxiv.org/abs/${idMatch[1]}` : 'https://arxiv.org'
          })
        }
        return { ok: true as const, query, papers }
      } catch {
        return { ok: false as const, reason: 'Service unavailable' }
      }
    }
  })
}

/** Aggregates the knowledge tools as one object for spreading into the agent. */
export function createKnowledgeTools() {
  return {
    dynamic__wikiSummary: createWikiSummaryTool(),
    dynamic__weather: createWeatherTool(),
    dynamic__currencyRate: createCurrencyTool(),
    dynamic__stockQuote: createStockQuoteTool(),
    dynamic__newsSearch: createNewsSearchTool(),
    dynamic__academicSearch: createAcademicSearchTool()
  }
}
