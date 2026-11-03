import { type NextRequest } from 'next/server'

import {
  exceedsRelayBodyCap,
  relayTarget
} from '@/lib/analytics/relay-target'
import { cappedBody, PayloadTooLargeError } from '@/lib/analytics/capped-body'

/**
 * Same-origin PostHog relay for Better Auth. A proxy rewrite forwards the
 * incoming request headers to the external host, so this handler builds
 * the upstream request from an explicit allowlist instead: the session
 * cookie is structurally never forwarded. Other providers are rewritten
 * in proxy.ts and do not reach this handler.
 */
async function relay(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path } = await params
  // Segments arrive decoded: one holding a slash would shift the path
  // boundaries the host selection relies on.
  const target = path.some(segment => segment.includes('/'))
    ? null
    : relayTarget(`/${path.join('/')}`, request.nextUrl.search)
  if (!target) {
    return new Response('Not found', { status: 404 })
  }

  if (exceedsRelayBodyCap(request.headers)) {
    return new Response('Payload too large', { status: 413 })
  }

  const headers = new Headers()
  const contentType = request.headers.get('content-type')
  if (contentType) {
    headers.set('content-type', contentType)
  }
  // PostHog derives geo/device stats from these; the old next.config
  // rewrites forwarded them too. Cookie and Authorization are
  // deliberately not forwarded: session credentials must never reach
  // the analytics provider.
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    headers.set('x-forwarded-for', forwardedFor)
  }
  const userAgent = request.headers.get('user-agent')
  if (userAgent) {
    headers.set('user-agent', userAgent)
  }

  // The body is streamed through rather than buffered: /relay is
  // reachable without a session, so materializing an attacker-sized
  // POST in memory would be a denial-of-service vector. cappedBody
  // bounds the forwarded bytes even when no content-length was sent.
  const body =
    request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : cappedBody(request.body)

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      duplex: 'half'
    } as RequestInit & { duplex?: 'half' })
  } catch (error) {
    if (
      error instanceof PayloadTooLargeError ||
      (error instanceof Error && error.cause instanceof PayloadTooLargeError)
    ) {
      return new Response('Payload too large', { status: 413 })
    }
    throw error
  }

  const responseHeaders = new Headers()
  const upstreamContentType = upstream.headers.get('content-type')
  if (upstreamContentType) {
    responseHeaders.set('content-type', upstreamContentType)
  }
  const cacheControl = upstream.headers.get('cache-control')
  if (cacheControl) {
    responseHeaders.set('cache-control', cacheControl)
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders
  })
}

export { relay as GET, relay as POST }
