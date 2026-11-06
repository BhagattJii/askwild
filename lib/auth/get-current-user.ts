import { cache } from 'react'

import { getAuthProvider } from '@/lib/auth/provider'
import { perfLog } from '@/lib/utils/perf-logging'
import { incrementAuthCallCount } from '@/lib/utils/perf-tracking'

import type { AppUser } from './types'

// Deduped per request: layout, page and every child component share the
// same result, so a page never hits the provider more than once.
export const getCurrentUser = cache(
  async (): Promise<AppUser | null> => getAuthProvider().getCurrentUser()
)

export async function getCurrentUserId() {
  const count = incrementAuthCallCount()
  perfLog(`getCurrentUserId called - count: ${count}`)

  const provider = getAuthProvider()
  if (provider.getCurrentUserId) {
    return provider.getCurrentUserId()
  }

  const user = await provider.getCurrentUser()
  return user?.id
}
