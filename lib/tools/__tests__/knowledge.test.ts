import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createAcademicSearchTool,
  createCommodityTool,
  createCryptoPriceTool,
  createCurrencyTool,
  createNewsSearchTool,
  createStockQuoteTool,
  createWeatherTool,
  createWikiSummaryTool,
  detectNewsEdition
} from '@/lib/tools/knowledge'

const originalFetch = globalThis.fetch
const fetchMock = vi.fn()

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

function textResponse(data: string): Response {
  return new Response(data, {
    status: 200,
    headers: { 'Content-Type': 'application/rss+xml' }
  })
}

function toolCall(tool: object, args: object): Promise<any> {
  const t = tool as any
  return t.execute(args)
}

beforeEach(() => {
  fetchMock.mockReset()
  globalThis.fetch = fetchMock
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('dynamic__wikiSummary', () => {
  it('returns the extract and url for a known topic', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        title: 'India',
        description: 'Country in South Asia',
        extract: 'India is a country...',
        content_urls: {
          desktop: { page: 'https://en.wikipedia.org/wiki/India' }
        }
      })
    )

    const result = await toolCall(createWikiSummaryTool(), { topic: 'India' })

    expect(result.found).toBe(true)
    expect(result.title).toBe('India')
    expect(result.url).toBe('https://en.wikipedia.org/wiki/India')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('fails soft when the topic is unknown', async () => {
    fetchMock.mockResolvedValue(new Response('not found', { status: 404 }))

    const result = await toolCall(createWikiSummaryTool(), {
      topic: 'xyzzy-no-such-topic-123'
    })

    expect(result.found).toBe(false)
  })
})

describe('dynamic__weather', () => {
  it('geocodes the city and returns current + forecast', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              name: 'Mumbai',
              latitude: 19.07,
              longitude: 72.88,
              country_code: 'IN'
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          current_weather: { temperature: 31, windspeed: 14, weathercode: 2 },
          daily: {
            time: ['2026-11-06', '2026-11-07', '2026-11-08'],
            temperature_2m_max: [33, 34, 33],
            temperature_2m_min: [25, 26, 25],
            weathercode: [1, 61, 3],
            precipitation_probability_max: [10, 80, 20]
          }
        })
      )

    const result = await toolCall(createWeatherTool(), { city: 'mumbai' })

    expect(result.found).toBe(true)
    expect(result.city).toBe('Mumbai')
    expect(result.current.temperatureC).toBe(31)
    expect(result.forecast).toHaveLength(3)
    expect(result.forecast[1].condition).toBe('Rain')
  })
})

describe('dynamic__currencyRate', () => {
  it('returns converted amount and rate', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ date: '2026-11-05', rates: { INR: 94.48 } })
    )

    const result = await toolCall(createCurrencyTool(), {
      from: 'usd',
      to: 'inr',
      amount: 10
    })

    expect(result.ok).toBe(true)
    expect(result.converted).toBeCloseTo(94.48, 2)
    expect(result.rate).toBeCloseTo(9.448, 2)
  })

  it('fails soft on unsupported currency', async () => {
    fetchMock.mockRejectedValue(new Error('HTTP 422'))

    const result = await toolCall(createCurrencyTool(), {
      from: 'USD',
      to: 'XXX',
      amount: 1
    })

    expect(result.ok).toBe(false)
  })
})

describe('dynamic__stockQuote', () => {
  it('returns price and daily change', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        chart: {
          result: [
            {
              meta: {
                symbol: '^NSEI',
                currency: 'INR',
                exchangeName: 'NSI',
                regularMarketPrice: 24550.3,
                previousClose: 24480.1,
                regularMarketTime: 1793943032
              }
            }
          ]
        }
      })
    )

    const result = await toolCall(createStockQuoteTool(), { symbol: '^NSEI' })

    expect(result.found).toBe(true)
    expect(result.price).toBeCloseTo(24550.3)
    expect(result.change).toBeCloseTo(70.2, 0)
    expect(result.changePercent).toBeGreaterThan(0)
  })
})

describe('detectNewsEdition', () => {
  it('detects a named country in its local language edition', () => {
    expect(detectNewsEdition('japan earthquake').ceid).toBe('JP:ja')
    expect(detectNewsEdition('france greves').ceid).toBe('FR:fr')
    expect(detectNewsEdition('noticias de mexico').ceid).toBe('MX:es-419')
    expect(detectNewsEdition('brasil eleicoes').ceid).toBe('BR:pt-BR')
  })

  it('keeps English editions for English-speaking countries', () => {
    expect(detectNewsEdition('australia floods').ceid).toBe('AU:en')
    expect(detectNewsEdition('united states election').ceid).toBe('US:en')
    expect(detectNewsEdition('usa shutdown').ceid).toBe('US:en')
  })

  it('still resolves India when the query names India', () => {
    expect(detectNewsEdition('india markets').ceid).toBe('IN:en')
  })

  it('uses the first named country when several appear', () => {
    expect(detectNewsEdition('india vs australia cricket').ceid).toBe('IN:en')
  })

  it('falls back to the neutral global edition, not India', () => {
    expect(detectNewsEdition('top news').ceid).toBe('US:en')
    expect(detectNewsEdition('breaking').gl).toBe('US')
    expect(detectNewsEdition('climate summit').ceid).toBe('US:en')
  })

  it('uses full locale codes because bare hl=en returns no items', () => {
    expect(detectNewsEdition('top news').hl).toBe('en-US')
    expect(detectNewsEdition('silicon valley ai').hl).toBe('en-US')
    expect(detectNewsEdition('india markets').hl).toBe('en-IN')
    expect(detectNewsEdition('australia floods').hl).toBe('en-AU')
  })

  it('gives Devanagari queries the Hindi India edition', () => {
    expect(detectNewsEdition('आज की खबर')).toEqual({
      hl: 'hi',
      gl: 'IN',
      ceid: 'IN:hi'
    })
  })
})

describe('dynamic__newsSearch', () => {
  it('parses google news rss items', async () => {
    fetchMock.mockResolvedValue(
      textResponse(`<?xml version="1.0"?>
<rss version="2.0"><channel><title>news</title>
<item><title><![CDATA[Market rallies on policy hopes]]></title><link>https://example.com/1</link><pubDate>Thu, 05 Nov 2026 10:00:00 GMT</pubDate><source url="https://example.com">Example News</source></item>
<item><title>Plain title story</title><link>https://example.com/2</link><pubDate>Thu, 05 Nov 2026 09:00:00 GMT</pubDate></item>
</channel></rss>`)
    )

    const result = await toolCall(createNewsSearchTool(), {
      query: 'india markets',
      maxResults: 5
    })

    expect(result.ok).toBe(true)
    expect(result.items).toHaveLength(2)
    expect(result.items[0].title).toBe('Market rallies on policy hopes')
    expect(result.items[0].source).toBe('Example News')
  })

  it('queries the detected country edition instead of India', async () => {
    fetchMock.mockResolvedValue(
      textResponse(`<?xml version="1.0"?>
<rss version="2.0"><channel><title>news</title>
<item><title><![CDATA[Typhoon warning issued]]></title><link>https://example.com/jp</link><pubDate>Thu, 05 Nov 2026 10:00:00 GMT</pubDate><source url="https://example.jp">NHK</source></item>
</channel></rss>`)
    )

    const result = await toolCall(createNewsSearchTool(), {
      query: 'japan typhoon',
      maxResults: 3
    })

    expect(result.ok).toBe(true)
    const calledUrl = String(fetchMock.mock.calls[0][0])
    expect(calledUrl).toContain('ceid=JP%3Aja')
    expect(calledUrl).not.toContain('ceid=IN%3Aen')
  })
})

describe('dynamic__academicSearch', () => {
  it('parses arxiv atom entries', async () => {
    fetchMock.mockResolvedValue(
      textResponse(`<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
  <id>http://arxiv.org/abs/2604.12345v1</id>
  <title>Quantum Error Correction at Scale</title>
  <summary>We present a new surface code scheme that\n          reduces overhead.</summary>
  <published>2026-10-30T00:00:00Z</published>
  <author><name>Alice Researcher</name></author>
  <author><name>Bob Scientist</name></author>
</entry>
</feed>`)
    )

    const result = await toolCall(createAcademicSearchTool(), {
      query: 'quantum error correction',
      maxResults: 1
    })

    expect(result.ok).toBe(true)
    expect(result.papers).toHaveLength(1)
    expect(result.papers[0].title).toBe('Quantum Error Correction at Scale')
    expect(result.papers[0].link).toBe('https://arxiv.org/abs/2604.12345v1')
    expect(result.papers[0].authors).toContain('Alice Researcher')
  })
})

describe('dynamic__cryptoPrice', () => {
  it('resolves a common alias and returns INR price', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        bitcoin: {
          inr: 7097945,
          usd: 75549,
          inr_24h_change: -6.47,
          usd_24h_change: -6.03,
          inr_24h_vol: 4240711131216.1113,
          usd_24h_vol: 45136955567.07609
        }
      })
    )

    const result = await toolCall(createCryptoPriceTool(), {
      coin: 'BTC',
      vs: 'INR'
    })

    expect(result.found).toBe(true)
    expect(result.coin).toBe('bitcoin')
    expect(result.price).toBe(7097945)
    expect(result.change24hPercent).toBeLessThan(0)
  })

  it('fails soft for an unknown coin', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))

    const result = await toolCall(createCryptoPriceTool(), {
      coin: 'zzznosuchcoin',
      vs: 'INR'
    })

    expect(result.found).toBe(false)
  })
})

describe('dynamic__commodity', () => {
  it('returns usd price and INR conversion', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          chart: {
            result: [
              {
                meta: {
                  symbol: 'GC=F',
                  exchangeName: 'COMEX',
                  regularMarketPrice: 2387.5,
                  previousClose: 2371.2,
                  regularMarketTime: 1793943032
                }
              }
            ]
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ date: '2026-11-05', rates: { INR: 94.48 } })
      )

    const result = await toolCall(createCommodityTool(), { commodity: 'gold' })

    expect(result.found).toBe(true)
    expect(result.usd).toBe(2387.5)
    expect(result.inr).toBeCloseTo(2387.5 * 94.48, 0)
    expect(result.change).toBeCloseTo(16.3, 1)
  })
})
