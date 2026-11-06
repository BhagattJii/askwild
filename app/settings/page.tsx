import type { Metadata } from 'next'

import { getPreferencesByUserId } from '@/lib/actions/preferences'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { DEFAULT_PREFERENCES } from '@/lib/preferences/shared'

import type { TabId } from '@/components/settings/settings-view'
import { SettingsView } from '@/components/settings/settings-view'

// The settings page is user-specific and must never be cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Settings — Askwild',
  description: 'Manage your Askwild account and preferences.'
}

const SETTINGS_TABS = ['account', 'preferences', 'personalize'] as const

export default async function SettingsPage({
  searchParams
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const user = await getCurrentUser()
  const initialPreferences = user?.id
    ? await getPreferencesByUserId(user.id)
    : DEFAULT_PREFERENCES
  const { tab } = await searchParams
  const initialTab: TabId = SETTINGS_TABS.includes(tab as (typeof SETTINGS_TABS)[number])
    ? (tab as TabId)
    : 'account'
  return (
    <SettingsView
      user={user}
      initialPreferences={initialPreferences}
      initialTab={initialTab}
    />
  )
}
