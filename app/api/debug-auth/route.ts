import { NextResponse } from 'next/server'

import { auth } from '@clerk/nextjs/server'

export const dynamic = 'force-dynamic'

const TOKEN = process.env.ASKWILD_DEBUG_AUTH_TOKEN

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (!TOKEN || url.searchParams.get('key') !== TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const headers = request.headers
  const clerkHeaders: Record<string, string | null> = {
    'x-clerk-auth-status': headers.get('x-clerk-auth-status'),
    'x-clerk-auth-reason': headers.get('x-clerk-auth-reason'),
    'x-clerk-auth-user-id': headers.get('x-clerk-auth-user-id'),
    'x-clerk-auth-session-id': headers.get('x-clerk-auth-session-id')
  }

  let clerkAuth: string
  let clerkUserId: string | null = null
  try {
    const result = await auth()
    clerkUserId = result.userId ?? null
    clerkAuth = 'ok'
  } catch (error) {
    clerkAuth = `threw: ${error instanceof Error ? error.message : 'unknown'}`
  }

  const cookies = headers.get('cookie') ?? ''
  const cookieNames = cookies
    .split(';')
    .map(part => part.trim().split('=')[0])
    .filter(Boolean)
    .filter(name => name.includes('clerk') || name.includes('session'))

  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ''
  const secretKey = process.env.CLERK_SECRET_KEY ?? ''

  let backendStatus = 'not-configured'
  if (secretKey) {
    try {
      const response = await fetch(
        'https://api.clerk.com/v1/users?limit=1&fields=id',
        { headers: { Authorization: `Bearer ${secretKey}` } }
      )
      backendStatus = `http-${response.status}`
    } catch (error) {
      backendStatus = `error: ${
        error instanceof Error ? error.message : 'unknown'
      }`
    }
  }

  return NextResponse.json({
    clerkHeaders,
    clerkAuth,
    clerkUserId,
    cookieNames,
    publishableKeyPrefix: publishableKey.slice(0, 12),
    secretKeyPrefix: secretKey.slice(0, 10),
    secretKeyLength: secretKey.length,
    backendStatus
  })
}
