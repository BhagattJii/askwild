'use client'

import Link from 'next/link'

import { IconArrowLeft as ArrowLeft } from '@tabler/icons-react'

import type { AppUser } from '@/lib/auth/types'
import { useAuthCapabilities } from '@/lib/contexts/app-user-context'
import type { Preferences } from '@/lib/preferences/shared'
import { cn } from '@/lib/utils'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

import { DeleteAccountButton } from '@/components/settings/delete-account-button'
import { PreferencesEditor } from '@/components/settings/preferences-editor'

function getInitials(name: string, email: string | null | undefined): string {
  if (name && name !== 'User') {
    const names = name.split(' ')
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }
  if (email) {
    return email.split('@')[0].substring(0, 2).toUpperCase()
  }
  return 'U'
}

interface SettingsViewProps {
  user: AppUser | null
  initialPreferences: Preferences
}

export function SettingsView({
  user,
  initialPreferences
}: SettingsViewProps) {
  const capabilities = useAuthCapabilities()
  const userName = user?.name || 'User'
  const avatarUrl = user?.image ?? undefined

  return (
    <div className="min-h-svh bg-background">
      <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6 sm:px-6 md:pt-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Askwild
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Settings</h1>

        {user && (
          <section
            id="account"
            aria-labelledby="account-heading"
            className="mt-6 scroll-mt-6 rounded-2xl border bg-card p-5 sm:p-6"
          >
            <p
              id="account-heading"
              className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              Account
            </p>
            <div className="mt-4 flex items-center gap-4">
              <Avatar className="size-16 shrink-0">
                <AvatarImage src={avatarUrl} alt={userName} />
                <AvatarFallback className="text-lg font-medium">
                  {getInitials(userName, user.email)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-base font-medium leading-tight">
                  {userName}
                </p>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {user.email}
                </p>
              </div>
            </div>
          </section>
        )}


        {user ? (
          <PreferencesEditor initial={initialPreferences} />
        ) : (
          <section className="mt-6 rounded-2xl border bg-card p-5 sm:p-6">
            <p className="text-sm font-medium">Preferences</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Sign in to choose how Askwild answers you.
            </p>
            <Link
              href="/auth/login"
              className="mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Sign in
            </Link>
          </section>
        )}

        {user && capabilities.deleteUser && (
          <section
            id="danger-zone"
            aria-labelledby="danger-zone-heading"
            className="mt-6 scroll-mt-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-5 sm:p-6"
          >
            <p
              id="danger-zone-heading"
              className="text-[11px] font-medium uppercase tracking-wider text-destructive"
            >
              Danger zone
            </p>
            <p className="mt-3 text-sm font-medium">Delete account</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Permanently delete your account, chat history, and uploaded
              files. This action cannot be undone.
            </p>
            <div className="mt-4">
              <DeleteAccountButton />
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
