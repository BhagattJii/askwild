import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { searchNewsRss } from '@/lib/tools/search/news-rss-lane'

const originalFetch = globalThis.fetch
const fetchMock = vi.fn()

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<item>
  <title>Railways to invest Rs 14,000 crore in depots</title>
  <link>https://news.google.com/rss/articles/CBMi1?hl=en-IN</link>
  <description>&lt;img src="x"&gt;Indian Railways announced new maintenance depots.</description>
  <source url="https://www.business-standard.com">Business Standard</source>
  <pubDate>Fri, 12 Dec 2025 08:00:00 GMT</pubDate>
</item>
<item>
  <title>Western Railway plans Rs 307-crore hub</title>
  <link>https://news.google.com/rss/articles/CBMi2?hl=en-IN</link>
  <description>WR floats tender for maintenance hub.</description>
  <source url="https://timesofindia.indiatimes.com">Times of India</source>
  <pubDate>Mon, 19 Oct 2026 07:00:00 GMT</pubDate>
</item>
</channel></rss>`

beforeEach(() => {
  fetchMock.mockReset()
  globalThis.fetch = fetchMock
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('searchNewsRss', () => {
  it('parses items into search results with publisher in content', async () => {
    fetchMock.mockResolvedValue(
      new Response(xml, {
        status: 200,
        headers: { 'Content-Type': 'application/rss+xml' }
      })
    )

    const result = await searchNewsRss('railways depot crore', 10)

    expect(result?.number_of_results).toBe(2)
    expect(result?.results[0].title).toBe(
      'Railways to invest Rs 14,000 crore in depots'
    )
    expect(result?.results[0].publishedDate).toBe(
      'Fri, 12 Dec 2025 08:00:00 GMT'
    )
    // The redirect URL host and publisher name are kept in content so the
    // model can cite something readable.
    expect(result?.results[0].content).toContain('Business Standard')
    expect(result?.results[0].content).toContain(
      'Indian Railways announced new maintenance depots.'
    )
    expect(result?.results[0].url).toContain('news.google.com/rss/articles')
  })

  it('returns null when the feed carries fewer than two items', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        '<rss><channel><item><title>x</title></item></channel></rss>'
      )
    )
    expect(await searchNewsRss('lonely query')).toBeNull()
  })

  it('returns null when the feed responds not-ok', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }))
    expect(await searchNewsRss('anything')).toBeNull()
  })

  it('returns null when the request throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    expect(await searchNewsRss('anything')).toBeNull()
  })

  it('requests the Hindi edition for Devanagari queries', async () => {
    fetchMock.mockResolvedValue(new Response('<rss><channel></channel></rss>'))
    await searchNewsRss('भारत में ट्रेन')
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('hl')).toBe('hi')
    expect(url.searchParams.get('ceid')).toBe('IN:hi')
  })

  it('requests the US edition for US queries', async () => {
    fetchMock.mockResolvedValue(new Response('<rss><channel></channel></rss>'))
    await searchNewsRss('united states senate vote')
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('gl')).toBe('US')
  })

  it('defaults to the India edition', async () => {
    fetchMock.mockResolvedValue(new Response('<rss><channel></channel></rss>'))
    await searchNewsRss('vande bharat cost')
    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get('ceid')).toBe('IN:en')
  })
})
