import { headers } from 'next/headers'

import { isIP } from 'node:net'

/**
 * Extracts the client IP for rate limiting.
 *
 * On Vercel the edge rewrites x-forwarded-for so the first entry is the
 * connecting client's real IP. Anywhere else the header is fully
 * client-supplied and untrustworthy, so the answer is a shared 'unknown'
 * bucket (guest traffic is rate-limited by IP and a spoofed header must
 * not mint unlimited quota).
 */
export async function getClientIp(): Promise<string> {
  try {
    if (!trustsForwardedFor()) {
      return 'unknown'
    }
    const h = await headers()
    const xff = h.get('x-forwarded-for')?.split(',')[0]?.trim()
    if (xff && isIP(xff)) {
      return xff
    }
    const real = h.get('x-real-ip')
    if (real && isIP(real)) {
      return real
    }
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

function trustsForwardedFor(): boolean {
  const setting = process.env.SUPABASE_FORWARD_CLIENT_IP?.trim()
  if (setting === 'true') return true
  if (setting === 'false') return false
  return (
    process.env.VERCEL === '1' &&
    (process.env.VERCEL_ENV === 'production' ||
      process.env.VERCEL_ENV === 'preview')
  )
}
