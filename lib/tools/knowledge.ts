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
          current_weather?: {
            temperature: number
            windspeed: number
            weathercode: number
          }
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
                rainChancePercent:
                  daily.precipitation_probability_max?.[i] ?? null
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
        const previousClose =
          meta.previousClose ?? meta.chartPreviousClose ?? null
        const change = previousClose
          ? meta.regularMarketPrice - previousClose
          : null
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
const RSS_TITLE =
  /<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/
const RSS_LINK = /<link>([\s\S]*?)<\/link>/
const RSS_PUBDATE = /<pubDate>([\s\S]*?)<\/pubDate>/
const RSS_SOURCE = /<source[^>]*>([\s\S]*?)<\/source>/

function stripCdata(text: string): string {
  return text.replace(/^<!\[CDATA\[|\]\]>$/g, '').trim()
}

interface NewsEdition {
  hl: string
  gl: string
  ceid: string
}

const GLOBAL_NEWS_EDITION: NewsEdition = {
  hl: 'en-US',
  gl: 'US',
  ceid: 'US:en'
}

const NEWS_EDITIONS: Array<NewsEdition & { names: string[] }> = [
  {
    names: ['united states', 'united states of america', 'usa', 'america'],
    hl: 'en-US',
    gl: 'US',
    ceid: 'US:en'
  },
  {
    names: ['united kingdom', 'great britain', 'britain', 'england', 'uk'],
    hl: 'en-GB',
    gl: 'GB',
    ceid: 'GB:en'
  },
  {
    names: ['india', 'bharat', 'hindustan'],
    hl: 'en-IN',
    gl: 'IN',
    ceid: 'IN:en'
  },
  { names: ['pakistan'], hl: 'en-PK', gl: 'PK', ceid: 'PK:en' },
  { names: ['bangladesh'], hl: 'bn', gl: 'BD', ceid: 'BD:bn' },
  { names: ['nepal'], hl: 'ne', gl: 'NP', ceid: 'NP:ne' },
  { names: ['sri lanka'], hl: 'en-LK', gl: 'LK', ceid: 'LK:en' },
  { names: ['australia'], hl: 'en-AU', gl: 'AU', ceid: 'AU:en' },
  { names: ['canada'], hl: 'en-CA', gl: 'CA', ceid: 'CA:en' },
  { names: ['ireland'], hl: 'en-IE', gl: 'IE', ceid: 'IE:en' },
  { names: ['new zealand'], hl: 'en-NZ', gl: 'NZ', ceid: 'NZ:en' },
  { names: ['south africa'], hl: 'en-ZA', gl: 'ZA', ceid: 'ZA:en' },
  { names: ['nigeria'], hl: 'en-NG', gl: 'NG', ceid: 'NG:en' },
  { names: ['kenya'], hl: 'en-KE', gl: 'KE', ceid: 'KE:en' },
  { names: ['japan', 'nihon', 'nippon'], hl: 'ja', gl: 'JP', ceid: 'JP:ja' },
  { names: ['china'], hl: 'zh-CN', gl: 'CN', ceid: 'CN:zh-CN' },
  { names: ['taiwan'], hl: 'zh-TW', gl: 'TW', ceid: 'TW:zh-TW' },
  { names: ['hong kong'], hl: 'zh-HK', gl: 'HK', ceid: 'HK:zh-HK' },
  { names: ['south korea', 'korea'], hl: 'ko', gl: 'KR', ceid: 'KR:ko' },
  { names: ['france'], hl: 'fr', gl: 'FR', ceid: 'FR:fr' },
  { names: ['germany', 'deutschland'], hl: 'de', gl: 'DE', ceid: 'DE:de' },
  { names: ['spain', 'espana'], hl: 'es', gl: 'ES', ceid: 'ES:es' },
  { names: ['mexico'], hl: 'es-419', gl: 'MX', ceid: 'MX:es-419' },
  { names: ['argentina'], hl: 'es-419', gl: 'AR', ceid: 'AR:es-419' },
  { names: ['colombia'], hl: 'es-419', gl: 'CO', ceid: 'CO:es-419' },
  { names: ['chile'], hl: 'es-419', gl: 'CL', ceid: 'CL:es-419' },
  { names: ['peru'], hl: 'es-419', gl: 'PE', ceid: 'PE:es-419' },
  { names: ['brazil', 'brasil'], hl: 'pt-BR', gl: 'BR', ceid: 'BR:pt-BR' },
  { names: ['portugal'], hl: 'pt-PT', gl: 'PT', ceid: 'PT:pt-PT' },
  { names: ['italy', 'italia'], hl: 'it', gl: 'IT', ceid: 'IT:it' },
  { names: ['netherlands', 'holland'], hl: 'nl', gl: 'NL', ceid: 'NL:nl' },
  { names: ['russia'], hl: 'ru', gl: 'RU', ceid: 'RU:ru' },
  { names: ['ukraine'], hl: 'uk', gl: 'UA', ceid: 'UA:uk' },
  { names: ['turkey', 'turkiye'], hl: 'tr', gl: 'TR', ceid: 'TR:tr' },
  { names: ['indonesia'], hl: 'id', gl: 'ID', ceid: 'ID:id' },
  { names: ['vietnam'], hl: 'vi', gl: 'VN', ceid: 'VN:vi' },
  { names: ['thailand'], hl: 'th', gl: 'TH', ceid: 'TH:th' },
  { names: ['philippines'], hl: 'en-PH', gl: 'PH', ceid: 'PH:en' },
  { names: ['malaysia'], hl: 'en-MY', gl: 'MY', ceid: 'MY:en' },
  { names: ['singapore'], hl: 'en-SG', gl: 'SG', ceid: 'SG:en' },
  { names: ['saudi arabia', 'saudi'], hl: 'ar', gl: 'SA', ceid: 'SA:ar' },
  { names: ['egypt'], hl: 'ar', gl: 'EG', ceid: 'EG:ar' },
  {
    names: ['united arab emirates', 'dubai'],
    hl: 'ar',
    gl: 'AE',
    ceid: 'AE:ar'
  },
  { names: ['israel'], hl: 'he', gl: 'IL', ceid: 'IL:he' },
  { names: ['iran'], hl: 'fa', gl: 'IR', ceid: 'IR:fa' },
  { names: ['poland'], hl: 'pl', gl: 'PL', ceid: 'PL:pl' },
  { names: ['sweden'], hl: 'sv', gl: 'SE', ceid: 'SE:sv' },
  { names: ['norway'], hl: 'no', gl: 'NO', ceid: 'NO:no' },
  { names: ['denmark'], hl: 'da', gl: 'DK', ceid: 'DK:da' },
  { names: ['greece'], hl: 'el', gl: 'GR', ceid: 'GR:el' }
]

export function detectNewsEdition(query: string): NewsEdition {
  if (/[\u0900-\u097f]/.test(query)) {
    return { hl: 'hi', gl: 'IN', ceid: 'IN:hi' }
  }

  const normalized = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')

  let best: { edition: NewsEdition; position: number } | null = null
  for (const edition of NEWS_EDITIONS) {
    for (const name of edition.names) {
      const position = normalized.indexOf(name)
      if (position === -1) continue
      if (!best || position < best.position) {
        best = {
          edition: { hl: edition.hl, gl: edition.gl, ceid: edition.ceid },
          position
        }
      }
    }
  }

  return best?.edition ?? GLOBAL_NEWS_EDITION
}

export function createNewsSearchTool() {
  return tool({
    description:
      'Latest news headlines with source and publication time, worldwide. The edition follows the country named in the query (Japan, France, Mexico in Spanish, Hindi-script queries, ...) and falls back to the neutral global edition. Use for any news/today/breaking/what happened question.',
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .max(200)
        .describe('News topic, e.g. "India budget"'),
      maxResults: z.number().int().min(1).max(10).default(6),
      when: z
        .enum(['1h', '1d', '7d', 'all'])
        .default('all')
        .describe('Restrict results to this window (all = no restriction)')
    }),
    async execute({ query, maxResults, when }) {
      try {
        const q = when === 'all' ? query.trim() : `${query.trim()} when:${when}`
        const edition = detectNewsEdition(query)
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${encodeURIComponent(edition.hl)}&gl=${edition.gl}&ceid=${encodeURIComponent(edition.ceid)}`
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
      query: z
        .string()
        .min(1)
        .max(150)
        .describe('Paper topic, e.g. "quantum error correction"'),
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
          const authors = [...block.matchAll(ENTRY_AUTHOR)].map(m =>
            m[1].trim()
          )
          const title = titleMatch
            ? titleMatch[1].replace(/\s+/g, ' ').trim()
            : ''
          if (!title) continue
          papers.push({
            id: idMatch ? idMatch[1] : 'unknown',
            title,
            authors: authors.slice(0, 6),
            abstract: summaryMatch
              ? summaryMatch[1].replace(/\s+/g, ' ').trim().slice(0, 400)
              : '',
            published: publishedMatch ? publishedMatch[1].trim() : '',
            link: idMatch
              ? `https://arxiv.org/abs/${idMatch[1]}`
              : 'https://arxiv.org'
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
/** Map of common symbols to CoinGecko ids. Unknown coins fall back to the
 * raw lowercase slug (works for exact CoinGecko slugs). */
const CRYPTO_ALIAS: Record<string, string> = {
  btc: 'bitcoin',
  bitcoin: 'bitcoin',
  eth: 'ethereum',
  ethereum: 'ethereum',
  sol: 'solana',
  solana: 'solana',
  bnb: 'binancecoin',
  xrp: 'ripple',
  ada: 'cardano',
  doge: 'dogecoin',
  dot: 'polkadot',
  trx: 'tron',
  ton: 'the-open-network',
  ltc: 'litecoin',
  link: 'chainlink',
  avax: 'avalanche-2',
  usdt: 'tether',
  usdc: 'usd-coin'
}

export function createCryptoPriceTool() {
  return tool({
    description:
      'Live crypto prices with 24h change (CoinGecko). Use for Bitcoin/Ethereum/any coin price question — INR and USD.',
    inputSchema: z.object({
      coin: z
        .string()
        .min(1)
        .max(40)
        .describe('Coin symbol or name, e.g. BTC, bitcoin, ETH'),
      vs: z.enum(['INR', 'USD']).default('INR').describe('Quote currency')
    }),
    async execute({ coin, vs }) {
      const key =
        CRYPTO_ALIAS[coin.trim().toLowerCase()] ??
        coin.trim().toLowerCase().replace(/\s+/g, '-')
      try {
        const data = (await fetchJson(
          `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(key)}&vs_currencies=inr,usd&include_24hr_change=true&include_24hr_vol=true`
        )) as Record<
          string,
          {
            inr?: number
            usd?: number
            inr_24h_change?: number
            usd_24h_change?: number
            inr_24h_vol?: number
            usd_24h_vol?: number
          }
        >
        const price = data?.[key]
        if (!price) {
          return { found: false as const, coin }
        }
        const quote = vs === 'USD' ? 'usd' : 'inr'
        return {
          found: true as const,
          coin: key,
          price: price[quote] ?? null,
          vs,
          inr: price.inr ?? null,
          usd: price.usd ?? null,
          change24hPercent:
            (quote === 'inr' ? price.inr_24h_change : price.usd_24h_change) ??
            null,
          volume24h:
            (quote === 'inr' ? price.inr_24h_vol : price.usd_24h_vol) ?? null
        }
      } catch {
        return { found: false as const, coin }
      }
    }
  })
}

const COMMODITIES: Record<string, { ticker: string; unit: string }> = {
  gold: { ticker: 'GC=F', unit: 'troy oz' },
  silver: { ticker: 'SI=F', unit: 'troy oz' },
  'crude-oil': { ticker: 'CL=F', unit: 'barrel (WTI)' },
  brent: { ticker: 'BZ=F', unit: 'barrel (Brent)' }
}

export function createCommodityTool() {
  return tool({
    description:
      'Live gold, silver, and crude oil futures prices (USD, converted to INR). Use for any gold price / crude oil / silver question.',
    inputSchema: z.object({
      commodity: z
        .enum(['gold', 'silver', 'crude-oil', 'brent'])
        .describe('Which commodity to price')
    }),
    async execute({ commodity }) {
      const meta = COMMODITIES[commodity]
      try {
        const [chartData, fxData] = await Promise.all([
          fetchJson(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(meta.ticker)}?range=5d&interval=1d`
          ) as Promise<{
            chart?: {
              result?: Array<{
                meta?: {
                  symbol?: string
                  exchangeName?: string
                  regularMarketPrice?: number
                  previousClose?: number
                  chartPreviousClose?: number
                  regularMarketTime?: number
                }
              }>
            }
          }>,
          fetchJson(
            'https://api.frankfurter.dev/v1/latest?from=USD&to=INR'
          ) as Promise<{ rates?: Record<string, number> }>
        ])
        const chartMeta = chartData?.chart?.result?.[0]?.meta
        if (!chartMeta?.regularMarketPrice) {
          return { found: false as const, commodity }
        }
        const previousClose =
          chartMeta.previousClose ?? chartMeta.chartPreviousClose ?? null
        const change = previousClose
          ? chartMeta.regularMarketPrice - previousClose
          : null
        const changePercent =
          previousClose && previousClose !== 0
            ? (change! / previousClose) * 100
            : null
        const usdInr = fxData?.rates?.INR ?? null
        return {
          found: true as const,
          commodity,
          ticker: chartMeta.symbol ?? meta.ticker,
          unit: meta.unit,
          usd: chartMeta.regularMarketPrice,
          inr:
            usdInr !== null
              ? Number((chartMeta.regularMarketPrice * usdInr).toFixed(2))
              : null,
          change,
          changePercent,
          updated: chartMeta.regularMarketTime
            ? new Date(chartMeta.regularMarketTime * 1000).toISOString()
            : null
        }
      } catch {
        return { found: false as const, commodity }
      }
    }
  })
}

export function createKnowledgeTools() {
  return {
    dynamic__wikiSummary: createWikiSummaryTool(),
    dynamic__weather: createWeatherTool(),
    dynamic__currencyRate: createCurrencyTool(),
    dynamic__stockQuote: createStockQuoteTool(),
    dynamic__newsSearch: createNewsSearchTool(),
    dynamic__academicSearch: createAcademicSearchTool(),
    dynamic__cryptoPrice: createCryptoPriceTool(),
    dynamic__commodity: createCommodityTool()
  }
}
