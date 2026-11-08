import { describe, expect, test } from 'vitest'

import {
  BingScrapeSearchProvider,
  parseBingHtml,
  unwrapBingRedirect
} from '../bing'

describe('unwrapBingRedirect', () => {
  test('decodes the /ck/a u=a1 base64url parameter to the real URL', () => {
    const real = 'https://en.wikipedia.org/wiki/Indian_Railways'
    const encoded = Buffer.from(real).toString('base64url')
    const href = `https://www.bing.com/ck/a?!&u=a1${encoded}&ntb=1`
    expect(unwrapBingRedirect(href)).toBe(real)
  })

  test('passes through direct external links', () => {
    const direct = 'https://www.example.gov/article/page'
    expect(unwrapBingRedirect(direct)).toBe(direct)
  })

  test('rejects bare bing tracker paths without a decodable u parameter', () => {
    expect(unwrapBingRedirect('https://www.bing.com/ck/a?u=zzz')).toBe(null)
    expect(unwrapBingRedirect('not a url')).toBe(null)
  })
})

describe('parseBingHtml', () => {
  const fixture = [
    '<li class="b_algo"><h2><a href="https://www.bing.com/ck/a?u=a1' +
      Buffer.from('https://en.wikipedia.org/wiki/Train').toString('base64url') +
      '">Train “ Wikipedia</a></h2><p>Wikipedia article about trains.</p></li">',
    '<li class="b_algo"><h2><a href="https://news.example.site/story/trains" ' +
      'class="b_title">Seven new trains announced</a></h2>' +
      '<p>Indian Railways will add seven new trains.</p></li>',
    '<li class="b_nope"><h2><a href="https://ads.example.com/x">Ad</a></h2></li>'
  ].join('')

  test('extracts titles, content and unwrapped URLs from b_algo blocks', () => {
    const parsed = parseBingHtml(fixture)
    expect(parsed.results).toHaveLength(2)
    expect(parsed.results[0].url).toBe('https://en.wikipedia.org/wiki/Train')
    expect(parsed.results[0].title).toContain('Train')
    expect(parsed.results[0].content).toContain('Wikipedia article')
    expect(parsed.results[1].url).toBe('https://news.example.site/story/trains')
    expect(parsed.results[1].content).toContain('Indian Railways')
  })

  test('decodes entities and collapses whitespace', () => {
    const parsed = parseBingHtml(
      '<li class="b_algo"><h2><a href="https://a.example.com">A &amp; B</a></h2>' +
        '<p>Line1&lt;x&gt;&nbsp;&nbsp;  Line2</p></li>'
    )
    expect(parsed.results[0].title).toBe('A & B')
    expect(parsed.results[0].content).toBe('Line1<x> Line2')
  })
})

describe('BingScrapeSearchProvider', () => {
  test('fails open with an empty result set when Bing is unreachable', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (() =>
      Promise.reject(new Error('network down'))) as typeof fetch
    try {
      const provider = new BingScrapeSearchProvider()
      const results = await provider.search('query', 5)
      expect(results.results).toEqual([])
      expect(results.number_of_results).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('returns parsed results when the SERP is reachable', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(
          '<li class="b_algo"><h2><a href="https://direct.example.com/g1">G1</a></h2>' +
            '<p>First general result.</p></li>',
          { status: 200 }
        )
      )) as typeof fetch
    try {
      const provider = new BingScrapeSearchProvider()
      const results = await provider.search('general query', 5)
      expect(results.results).toHaveLength(1)
      expect(results.results[0].title).toBe('G1')
      expect(results.number_of_results).toBe(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
