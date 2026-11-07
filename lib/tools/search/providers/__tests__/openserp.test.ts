import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OpenserpSearchProvider } from '@/lib/tools/search/providers/openserp'

const originalFetch = globalThis.fetch
const originalUrl = process.env.OPENSERP_URL
const originalEngines = process.env.OPENSERP_ENGINES
const originalTimeout = process.env.OPENSERP_TIMEOUT_MS
const fetchMock = vi.fn()

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

let provider: OpenserpSearchProvider

beforeEach(() => {
  fetchMock.mockReset()
  globalThis.fetch = fetchMock
  process.env.OPENSERP_URL = 'http://localhost:7070'
  process.env.OPENSERP_ENGINES = 'google,bing'
  delete process.env.OPENSERP_TIMEOUT_MS
  provider = new OpenserpSearchProvider()
})

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalUrl === undefined) {
    delete process.env.OPENSERP_URL
  } else {
    process.env.OPENSERP_URL = originalUrl
  }
  if (originalEngines === undefined) {
    delete process.env.OPENSERP_ENGINES
  } else {
    process.env.OPENSERP_ENGINES = originalEngines
  }
  if (originalTimeout === undefined) {
    delete process.env.OPENSERP_TIMEOUT_MS
  } else {
    process.env.OPENSERP_TIMEOUT_MS = originalTimeout
  }
})

describe('OpenserpSearchProvider', () => {
  it('falls back to the second engine when google returns empty results', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            { rank: 1, type: 'organic', title: 'B', url: 'https://b.example/' }
          ]
        })
      )

    const result = await provider.search('query', 5)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.results[0]?.url).toBe('https://b.example/')
    expect(result.number_of_results).toBe(1)
  })

  it('falls back to bing when google errors out', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('nope', { status: 500 }))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            { rank: 1, type: 'organic', title: 'B', url: 'https://b.example/' }
          ]
        })
      )

    const result = await provider.search('query', 5)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.results[0]?.title).toBe('B')
  })

  it('filters to includeDomains when set', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        results: [
          {
            rank: 1,
            type: 'organic',
            title: 'keep',
            url: 'https://a.example/keep'
          },
          {
            rank: 2,
            type: 'organic',
            title: 'drop',
            url: 'https://z.example/drop'
          }
        ]
      })
    )

    const result = await provider.search('query', 5, 'basic', ['a.example'])

    expect(result.results.map(r => r.url)).toEqual(['https://a.example/keep'])
  })

  it('does not abort a request answered by a cold free-tier service', async () => {
    // Render free-tier services sleep after ~15min idle; the first request
    // after sleep took 35s in production and was aborted by the old 30s
    // default timeout, surfacing as a failed search to the user.
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    fetchMock.mockImplementation((_input: unknown, init: unknown) => {
      const signal = (init as { signal?: AbortSignal } | undefined)?.signal
      if (signal) signals.push(signal)
      return new Promise<Response>(() => {})
    })

    const pending = provider.search('query', 1)
    pending.catch(() => {})

    await vi.advanceTimersByTimeAsync(35_000)
    expect(signals[0]?.aborted).toBe(false)

    // The timeout still needs to fire eventually — 95s is far beyond any
    // real response time, so a hung connection must still be cut off.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(signals[0]?.aborted).toBe(true)

    vi.useRealTimers()
  })

  it('parses images from the image endpoint with thumbnail fallback', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        results: [
          {
            rank: 1,
            type: 'image',
            title: 'img',
            url: 'https://img.example/big.jpg',
            thumbnail: { src: '' }
          },
          {
            rank: 2,
            type: 'image',
            title: 'img2',
            url: 'https://img.example/two.jpg'
          }
        ]
      })
    )

    const result = await provider.search('query', 5, 'basic', [], [], {
      content_types: ['image']
    })

    expect(result.images).toEqual([
      'https://img.example/big.jpg',
      'https://img.example/two.jpg'
    ])
  })
})
