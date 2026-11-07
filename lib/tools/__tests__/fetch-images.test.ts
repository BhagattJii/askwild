import { describe, expect, it } from 'vitest'

import { __private } from '@/lib/tools/fetch'

const { extractImages } = __private

describe('extractImages', () => {
  it('prefers og:image over plain img tags', () => {
    const html = `
      <html><head>
        <meta property="og:image" content="https://cdn.example.com/hero.jpg" />
        <meta property="og:image" content="https://cdn.example.com/second.jpg" />
      </head>
      <body><img src="https://fallback.example.com/big.jpg" /></body></html>`
    const images = extractImages(html)
    expect(images.slice(0, 2)).toEqual([
      'https://cdn.example.com/hero.jpg',
      'https://cdn.example.com/second.jpg'
    ])
    expect(images.at(-1)).toBe('https://fallback.example.com/big.jpg')
  })

  it('treats single-quoted content and twitter:image equally', () => {
    const html = `<meta name='twitter:image' content='https://cdn.example.com/t.jpg' />`
    expect(extractImages(html)).toEqual(['https://cdn.example.com/t.jpg'])
  })

  it('absolutizes protocol-relative and dedupes', () => {
    const html = `<meta property="og:image" content="//cdn.example.com/abs.jpg" /><img src="//cdn.example.com/abs.jpg" />`
    expect(extractImages(html)).toEqual(['https://cdn.example.com/abs.jpg'])
  })

  it('extracts markdown image links', () => {
    const md =
      'Read more. ![map](https://cdn.example.com/map.jpg) ![chart](https://cdn.example.com/chart.png)'
    expect(extractImages(md)).toEqual([
      'https://cdn.example.com/map.jpg',
      'https://cdn.example.com/chart.png'
    ])
  })

  it('drops tracking pixels and non-http URLs', () => {
    const html = `<meta property="og:image" content="https://cdn.example.com/1x1.gif" />
      <meta property="og:image" content="data:image/gif;base64,AAAA" />
      <meta property="og:image" content="https://cdn.example.com/real.jpg" />`
    expect(extractImages(html)).toEqual(['https://cdn.example.com/real.jpg'])
  })
})
