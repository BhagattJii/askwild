import { cookies } from 'next/headers'
import { type NextRequest,NextResponse } from 'next/server'

import { auth, clerkClient } from '@clerk/nextjs/server'

import type { AppUser, AuthActionResult, AuthProvider } from '@/lib/auth/types'
import { parseAdminEmails } from '@/lib/version/admins'

function isClerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
  )
}

function roleFor(email: string | null): string {
  const allowlist = parseAdminEmails(process.env)
  return email && allowlist.has(email.toLowerCase()) ? 'admin' : 'user'
}

export const clerkAuthProvider: AuthProvider = {
  name: 'clerk',
  capabilities: {
    signUp: true,
    // Password-reset emails are sent by Clerk itself; no SMTP required.
    passwordReset: true,
    deleteUser: true,
    // Social logins (Google and friends) are configured in the Clerk
    // dashboard; no OIDC_* variables are used.
    oauth: true,
    oauthProvider: 'Google',
    // Clerk enforces email verification; no bootstrap flow is needed and
    // AUTH_SIGNUP_MODE is always treated as open.
    emailVerification: true,
    share: true
  },

  getCurrentUser(): Promise<AppUser | null> {
    return resolveUser()
  },

  getCurrentUserId(): Promise<string | undefined> {
    return resolveUserId()
  },

  async handleSession(request: NextRequest): Promise<NextResponse> {
    // Session refresh is owned by clerkMiddleware(); the provider seam stays
    // neutral so shared relay/guest paths are never redirected.
    return NextResponse.next({ request })
  },

  async signInWithOAuth(provider: string): Promise<AuthActionResult> {
    // Clerk social buttons live on the hosted <SignIn> component.
    return {
      success: false,
      error:
        `Sign-in with ${provider} is handled by the Askwild sign-in screen. ` +
        'Open /auth/login and choose the provider there.',
      redirectTo: '/auth/login'
    }
  },

  async signUp(): Promise<AuthActionResult> {
    return {
      success: false,
      error: 'Sign-up is handled by the Askwild sign-in screen.',
      redirectTo: '/auth/login'
    }
  },

  async signOut(): Promise<AuthActionResult> {
    try {
      const { userId, sessionId } = await auth()
      const client = await clerkClient()
      if (sessionId) {
        await client.sessions.revokeSession(sessionId)
      } else if (userId) {
        const sessions = await client.sessions.getSessionList({
          userId,
          status: 'active'
        })
        for (const session of sessions.data) {
          await client.sessions.revokeSession(session.id)
        }
      }
      // Drop the browser session cookie as well, so the next request is
      // treated as signed out immediately.
      const cookieStore = await cookies()
      cookieStore.delete('__session')
      return { success: true, redirectTo: '/' }
    } catch {
      return { success: false, error: 'Sign out failed. Please try again.' }
    }
  },

  async requestPasswordReset(): Promise<AuthActionResult> {
    return {
      success: false,
      error:
        "Password reset is handled by Clerk. Open /auth/login and use 'Forgot password?' inside the sign-in screen.",
      redirectTo: '/auth/login'
    }
  },

  async deleteUser(userId: string): Promise<AuthActionResult> {
    try {
      const client = await clerkClient()
      await client.users.deleteUser(userId)
      return { success: true }
    } catch {
      return { success: false, error: 'Could not delete the account.' }
    }
  },

  validateDeleteUserConfig(): string | null {
    return isClerkConfigured()
      ? null
      : 'Clerk credentials are not configured.'
  },

  async canDeleteUser(): Promise<string | null> {
    return null
  }
}

// Process-local profile cache. The Clerk backend profile endpoint is a
// network call on every page request; without this the whole app waits on
// it and, worse, flips to the signed-out UI whenever the call hiccups.
const PROFILE_TTL_MS = 10 * 60 * 1000
const PROFILE_CACHE_MAX = 500
const profileCache = new Map<string, { user: AppUser; expires: number }>()

function readProfileCache(userId: string): AppUser | null {
  const entry = profileCache.get(userId)
  if (!entry) {
    return null
  }
  if (entry.expires <= Date.now()) {
    profileCache.delete(userId)
    return null
  }
  return entry.user
}

function writeProfileCache(userId: string, user: AppUser) {
  if (profileCache.size >= PROFILE_CACHE_MAX) {
    const oldest = profileCache.keys().next().value
    if (oldest !== undefined) {
      profileCache.delete(oldest)
    }
  }
  profileCache.set(userId, { user, expires: Date.now() + PROFILE_TTL_MS })
}

function buildFallbackUser(userId: string): AppUser {
  return {
    id: userId,
    email: null,
    name: null,
    image: null,
    createdAt: new Date(),
    role: 'user'
  }
}

/**
 * Resolves the AppUser from the Clerk session. Falls back to null when
 * Clerk is not active (another provider selected) or outside an HTTP
 * request context (build-time prerendering), so the identity seam keeps
 * behaving like the anonymous case instead of failing the page.
 */
async function resolveUser(): Promise<AppUser | null> {
  if (!isClerkConfigured()) {
    return null
  }
  try {
    const { userId } = await auth()
    if (!userId) {
      return null
    }

    const cached = readProfileCache(userId)
    if (cached) {
      return cached
    }

    try {
      const user = await (await clerkClient()).users.getUser(userId)
      const email =
        user.primaryEmailAddress?.emailAddress ??
        user.emailAddresses[0]?.emailAddress ??
        null
      const resolved = {
        id: user.id,
        email,
        name: user.fullName ?? user.username ?? null,
        image: user.imageUrl ?? null,
        createdAt: new Date(user.createdAt),
        role: roleFor(email)
      }
      writeProfileCache(userId, resolved)
      return resolved
    } catch (error) {
      // The session is valid but the profile lookup failed — do not flip
      // the UI to signed-out, which makes the header show "Sign in"
      // for authenticated users on every transient Clerk hiccup. Serve a
      // minimal profile and let the cache refill on the next request.
      console.warn('[clerk] users.getUser failed, using fallback', error)
      return buildFallbackUser(userId)
    }
  } catch {
    return null
  }
}

async function resolveUserId(): Promise<string | undefined> {
  if (!isClerkConfigured()) {
    return undefined
  }
  try {
    const { userId } = await auth()
    return userId ?? undefined
  } catch {
    return undefined
  }
}
