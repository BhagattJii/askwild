'use server'

import { eq } from 'drizzle-orm'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { db } from '@/lib/db'
import { userPreferences } from '@/lib/db/schema'
import { withRLS } from '@/lib/db/with-rls'
import {
  DEFAULT_PREFERENCES,
  MAX_BIO_LENGTH,
  type Preferences,
  type PreferencesResult,
  type ResponseLanguage
} from '@/lib/preferences/shared'

function normalize(
  row: typeof userPreferences.$inferSelect | undefined
): Preferences {
  if (!row) {
    return { ...DEFAULT_PREFERENCES }
  }
  return {
    responseLanguage: (row.responseLanguage ??
      DEFAULT_PREFERENCES.responseLanguage) as ResponseLanguage,
    autosuggest: row.autosuggest ?? DEFAULT_PREFERENCES.autosuggest,
    bio: row.bio ?? ''
  }
}

async function readPreferencesByUserId(userId: string): Promise<Preferences> {
  try {
    const rows = await withRLS(userId, tx =>
      tx
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId))
        .limit(1)
    )
    return normalize(rows[0])
  } catch (error) {
    console.error('Failed to read preferences:', error)
    return { ...DEFAULT_PREFERENCES }
  }
}

/** Read the signed-in user's preferences (defaults when unset). */
export async function getPreferences(): Promise<Preferences> {
  const user = await getCurrentUser()
  if (!user?.id) {
    return { ...DEFAULT_PREFERENCES }
  }
  return readPreferencesByUserId(user.id)
}

/**
 * Read preferences with a known user id (skips the auth roundtrip). Used on
 * the hot path of every chat request — keep it to one indexed primary-key
 * read and fail open to defaults on any error.
 */
export async function getPreferencesByUserId(
  userId: string
): Promise<Preferences> {
  return readPreferencesByUserId(userId)
}

/** Upsert the signed-in user's preferences. */
export async function updatePreferences(
  patch: Partial<Preferences>
): Promise<PreferencesResult> {
  const user = await getCurrentUser()
  if (!user?.id) {
    return { success: false, error: 'Sign in to change preferences.' }
  }

  const next: Partial<Preferences> = {}

  if (patch.responseLanguage !== undefined) {
    if (!['auto', 'en', 'hi', 'hinglish'].includes(patch.responseLanguage)) {
      return { success: false, error: 'Unsupported response language.' }
    }
    next.responseLanguage = patch.responseLanguage
  }

  if (patch.autosuggest !== undefined) {
    next.autosuggest = Boolean(patch.autosuggest)
  }

  if (patch.bio !== undefined) {
    if (typeof patch.bio !== 'string') {
      return { success: false, error: 'Bio must be text.' }
    }
    const trimmed = patch.bio.trim()
    if (trimmed.length > MAX_BIO_LENGTH) {
      return {
        success: false,
        error: `Bio must be ${MAX_BIO_LENGTH} characters or fewer.`
      }
    }
    next.bio = trimmed
  }

  try {
    await withRLS(user.id, tx =>
      tx
        .insert(userPreferences)
        .values({
          userId: user.id,
          ...next,
          responseLanguage:
            next.responseLanguage ?? DEFAULT_PREFERENCES.responseLanguage,
          autosuggest: next.autosuggest ?? DEFAULT_PREFERENCES.autosuggest,
          bio: next.bio ?? DEFAULT_PREFERENCES.bio,
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: userPreferences.userId,
          set: { ...next, updatedAt: new Date() }
        })
    )

    const preferences = await getPreferences()
    return { success: true, preferences }
  } catch (error) {
    console.error('Failed to update preferences:', error)
    return { success: false, error: 'Failed to save preferences.' }
  }
}
