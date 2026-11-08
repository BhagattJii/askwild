const ALLOWED = /^https:\/\/(www\.)?(bing|cn\.bing)\.com\//

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET',
  'access-control-allow-headers': 'content-type',
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (request.method !== 'GET') return new Response('method not allowed', { status: 405, headers: CORS })
    if (env.ACCESS_KEY && url.searchParams.get('key') !== env.ACCESS_KEY) {
      return new Response('forbidden', { status: 403, headers: CORS })
    }
    const target = url.searchParams.get('u')
    if (!target || !ALLOWED.test(target)) return new Response('bad target', { status: 400, headers: CORS })

    const upstream = await fetch(target, {
      headers: {
        'user-agent': env.USER_AGENT || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': url.searchParams.get('hl') || 'en-US,en;q=0.9',
        'accept-encoding': 'identity',
      },
      redirect: 'follow',
    })
    const html = await upstream.text()
    return new Response(html, {
      status: upstream.status,
      headers: { ...CORS, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=120' },
    })
  },
}
