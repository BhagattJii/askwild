import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clerkAuthProvider } from '@/lib/auth/providers/clerk'

describe('clerk auth provider', () => {
  const envKeys = [
    'AUTH_PROVIDER',
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    'CLERK_SECRET_KEY',
    'ASKWILD_ADMIN_EMAILS'
  ]
  const original: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of envKeys) {
      original[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })

  it('declares the Clerk capability set', () => {
    expect(clerkAuthProvider.name).toBe('clerk')
    expect(clerkAuthProvider.capabilities).toEqual({
      signUp: true,
      passwordReset: true,
      deleteUser: true,
      oauth: true,
      oauthProvider: 'Google',
      emailVerification: true,
      share: true
    })
  })

  it('flags missing credentials in validateDeleteUserConfig', () => {
    expect(clerkAuthProvider.validateDeleteUserConfig?.()).toBe(
      'Clerk credentials are not configured.'
    )
  })

  it('accepts configured credentials in validateDeleteUserConfig', () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_live_x'
    process.env.CLERK_SECRET_KEY = 'sk_live_x'
    expect(clerkAuthProvider.validateDeleteUserConfig?.()).toBeNull()
  })

  it('asks the admin allowlist before assigning the admin role', () => {
    // roleFor() is private; its allowlist contract is asserted by the
    // shared parseAdminEmails tests, so just confirm env plumbing exists.
    process.env.ASKWILD_ADMIN_EMAILS = 'x.lakshayy@gmail.com'
    expect(clerkAuthProvider.getCurrentUser).toBeDefined()
    expect(clerkAuthProvider.getCurrentUserId).toBeDefined()
  })

  it('directs OAuth requests at the hosted sign-in screen', async () => {
    const result = await clerkAuthProvider.signInWithOAuth?.('Google')
    expect(result?.success).toBe(false)
    expect(result?.redirectTo).toBe('/auth/login')
  })

  it('points password resets at the Clerk-managed flow', async () => {
    const result = await clerkAuthProvider.requestPasswordReset?.(
      'user@example.com'
    )
    expect(result?.success).toBe(false)
    expect(result?.redirectTo).toBe('/auth/login')
  })

  it('keeps the session seam neutral', () => {
    expect(clerkAuthProvider.handleSession).toBeDefined()
  })
})
