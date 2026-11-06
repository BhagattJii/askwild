'use client'

import { useState } from 'react'
import Link from 'next/link'

import { IconArrowLeft as ArrowLeft } from '@tabler/icons-react'

import type { AppUser } from '@/lib/auth/types'
import type { Preferences } from '@/lib/preferences/shared'
import { cn } from '@/lib/utils'

import {
  Avatar,
  AvatarFallback,
  AvatarImage
} from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

import {
  PersonalizePanel,
  PreferencesPanel
} from '@/components/settings/preferences-editor'

const tabs = [
  { id: 'account', label: 'My Account' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'personalize', label: 'Personalize' }
] as const

type TabId = (typeof tabs)[number]['id']

export type { TabId }

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
  initialTab?: TabId
}

export function SettingsView({
  user,
  initialPreferences,
  initialTab = 'account'
}: SettingsViewProps) {
  const [tab, setTab] = useState<TabId>(initialTab)

  const selectTab = (id: TabId) => {
    setTab(id)
    window.history.replaceState(null, '', `?tab=${id}`)
  }

  const activeTab = tabs.find(item => item.id === tab) ?? tabs[0]

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-y-contain bg-background">
      <main className="mx-auto w-full max-w-4xl px-4 pb-16 pt-6 sm:px-6 md:pt-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Askwild
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Settings</h1>

        <div className="mt-6 flex flex-col gap-6 md:flex-row md:gap-10">
          <nav
            aria-label="Settings categories"
            className="overflow-x-auto md:w-48 md:shrink-0"
          >
            <ul className="flex gap-2 md:flex-col md:gap-1">
              {tabs.map(item => {
                const selected = item.id === activeTab.id
                return (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      aria-current={selected ? 'page' : undefined}
                      onClick={event => {
                        event.preventDefault()
                        selectTab(item.id)
                      }}
                      className={cn(
                        'block whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors',
                        selected
                          ? 'bg-muted font-medium text-foreground'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      )}
                    >
                      {item.label}
                    </a>
                  </li>
                )
              })}
            </ul>
          </nav>

          <section
            key={activeTab.id}
            aria-labelledby="settings-panel-heading"
            className="min-w-0 flex-1"
          >
            <h2
              id="settings-panel-heading"
              className="pb-3 text-lg font-semibold tracking-tight"
            >
              {activeTab.label}
            </h2>

            {activeTab.id === 'account' && user && (
              <div className="divide-y border-t">
                <div className="flex items-center gap-4 py-5">
                  <Avatar className="size-14 shrink-0">
                    <AvatarImage src={user.image ?? undefined} alt={user.name || user.email || 'User'} />
                    <AvatarFallback className="font-medium">
                      {getInitials(user.name || 'User', user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-medium leading-tight">
                      {user.name || 'User'}
                    </p>
                    {user.email && (
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {user.email}
                      </p>
                    )}
                  </div>
                </div>

                {user.name && (
                  <div className="flex items-center justify-between gap-6 py-5">
                    <p className="text-sm font-medium">Full name</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {user.name}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between gap-6 py-5">
                  <p className="text-sm font-medium">Email</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {user.email}
                  </p>
                </div>
              </div>
            )}

            {activeTab.id === 'account' && !user && (
              <div className="border-t pt-5">
                <p className="text-sm text-muted-foreground">
                  You are browsing without an account. Sign in to sync
                  Askwild across devices.
                </p>
                <Button asChild className="mt-3">
                  <Link href="/auth/login">Sign in</Link>
                </Button>
              </div>
            )}

            {activeTab.id === 'preferences' &&
              (user ? (
                <PreferencesPanel initial={initialPreferences} />
              ) : (
                <div className="border-t pt-5">
                  <p className="text-sm text-muted-foreground">
                    Sign in to choose how Askwild answers you.
                  </p>
                  <Button asChild className="mt-3">
                    <Link href="/auth/login">Sign in</Link>
                  </Button>
                </div>
              ))}

            {activeTab.id === 'personalize' &&
              (user ? (
                <PersonalizePanel initial={initialPreferences} />
              ) : (
                <div className="border-t pt-5">
                  <p className="text-sm text-muted-foreground">
                    Sign in to personalize your answers.
                  </p>
                  <Button asChild className="mt-3">
                    <Link href="/auth/login">Sign in</Link>
                  </Button>
                </div>
              ))}
          </section>
        </div>
      </main>
    </div>
  )
}
