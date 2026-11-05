import type { Metadata } from 'next'

import { getCurrentUser } from '@/lib/auth/get-current-user'

import { SettingsView } from '@/components/settings/settings-view'

// The settings page is user-specific and must never be cached.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Settings — Askwild',
  description: 'Manage your Askwild account and preferences.'
}

export default async function SettingsPage() {
  const user = await getCurrentUser()
  return <SettingsView user={user} />
}
