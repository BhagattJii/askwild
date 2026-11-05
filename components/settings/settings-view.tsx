'use client'

import Link from 'next/link'

import {
  IconArrowLeft as ArrowLeft,
  IconCheck as Check,
  IconCopy as Copy,
  IconDeviceLaptop as Laptop,
  IconInfoCircle as Info,
  IconLifebuoy as Lifebuoy,
  IconMail as Mail,
  IconMoon as Moon,
  IconSun as Sun
} from '@tabler/icons-react'
import { toast } from 'sonner'

import type { AppUser } from '@/lib/auth/types'
import { useAuthCapabilities } from '@/lib/contexts/app-user-context'
import { cn } from '@/lib/utils'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

import { DeleteAccountButton } from '@/components/settings/delete-account-button'
import { useTheme } from '@/components/theme-provider'

import packageJson from '../../package.json'

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

const themeOptions = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Laptop }
]

const HELP_LINKS = [
  {
    icon: Lifebuoy,
    label: 'Help & support',
    hint: 'Browse issues or ask a question',
    href: 'https://github.com/BhagattJii/askwild/issues',
    external: true
  },
  {
    icon: Mail,
    label: 'Send feedback',
    hint: 'Tell us what to improve',
    href: 'mailto:x.lakshayy@gmail.com',
    external: false
  }
]

interface SettingsViewProps {
  user: AppUser | null
}

export function SettingsView({ user }: SettingsViewProps) {
  const { setTheme, theme } = useTheme()
  const capabilities = useAuthCapabilities()
  const activeTheme = theme ?? 'system'

  const userName = user?.name || 'User'
  const avatarUrl = user?.image ?? undefined
  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : null

  const copyEmail = async () => {
    if (!user?.email) {
      return
    }
    try {
      await navigator.clipboard.writeText(user.email)
      toast.success('Email copied')
    } catch {
      toast.error('Could not copy email')
    }
  }

  return (
    <div className="min-h-svh bg-background">
      <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6 sm:px-6 md:pt-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Askwild
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
                <button
                  type="button"
                  onClick={copyEmail}
                  aria-label="Copy email"
                  className="group mt-1 inline-flex max-w-full items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span className="truncate">{user.email}</span>
                  <Copy className="size-3.5 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" />
                </button>
                {memberSince && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Member since {memberSince}
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        <section
          id="preferences"
          aria-labelledby="preferences-heading"
          className="mt-6 scroll-mt-6 rounded-2xl border bg-card p-5 sm:p-6"
        >
          <p
            id="preferences-heading"
            className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
          >
            Preferences
          </p>
          <p className="mt-4 text-sm font-medium">Appearance</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose how Askwild looks on this device.
          </p>
          <div className="mt-3 divide-y rounded-xl border" role="radiogroup" aria-label="Theme">
            {themeOptions.map(option => {
              const Icon = option.icon
              const selected = activeTheme === option.value

              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTheme(option.value)}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-accent/50 first:rounded-t-xl last:rounded-b-xl"
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-muted/60">
                    <Icon className="size-4" />
                  </span>
                  <span className="flex-1 text-sm">{option.label}</span>
                  <span
                    className={cn(
                      'flex size-5 items-center justify-center rounded-full border transition-colors',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/30 text-transparent'
                    )}
                  >
                    <Check className="size-3" />
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section
          id="help"
          aria-labelledby="help-heading"
          className="mt-6 scroll-mt-6 rounded-2xl border bg-card p-5 sm:p-6"
        >
          <p
            id="help-heading"
            className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
          >
            Help & about
          </p>
          <div className="mt-4 divide-y rounded-xl border">
            {HELP_LINKS.map(link => {
              const Icon = link.icon
              return (
                <a
                  key={link.label}
                  href={link.href}
                  {...(link.external
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                  className="flex w-full items-center gap-3 px-3 py-3 transition-colors hover:bg-accent/50 first:rounded-t-xl last:rounded-b-xl"
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-muted/60">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{link.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {link.hint}
                    </span>
                  </span>
                </a>
              )
            })}
            <div className="flex w-full items-center gap-3 px-3 py-3 first:rounded-t-xl last:rounded-b-xl">
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted/60">
                <Info className="size-4" />
              </span>
              <span className="flex-1 text-sm text-muted-foreground">
                Askwild v{packageJson.version}
              </span>
            </div>
          </div>
        </section>

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
