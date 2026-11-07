'use client'

import type { AppUser } from '@/lib/auth/types'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

import { useUsageBudget } from '@/components/usage-budget-provider'

import { Button } from './ui/button'
import { AccountMenu } from './account-menu'

interface UserProfileProps {
  user: AppUser
}

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

export default function UserProfile({ user }: UserProfileProps) {
  const { usage, isLow } = useUsageBudget()
  const userName = user.name || 'User'
  const avatarUrl = user.image ?? undefined

  return (
    <div className="px-2 py-1.5">
      <AccountMenu
        user={user}
        trigger={
          <Button
            variant="ghost"
            className="h-auto w-full min-w-0 justify-start gap-3 p-1.5"
            aria-label="Account settings"
          >
            <div className="relative shrink-0">
              <Avatar className="size-9">
                <AvatarImage src={avatarUrl} alt={userName} />
                <AvatarFallback>
                  {getInitials(userName, user.email)}
                </AvatarFallback>
              </Avatar>
              {isLow && (
                <span
                  className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-destructive ring-2 ring-background"
                  aria-hidden="true"
                  data-testid="usage-status-dot"
                />
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
              <p className="truncate text-sm font-medium leading-none">
                {userName}
              </p>
              <p className="truncate text-xs leading-none text-muted-foreground">
                {user.email}
              </p>
              {usage && (
                <p
                  className={
                    isLow
                      ? 'text-xs leading-none text-destructive tabular-nums'
                      : 'text-xs leading-none text-muted-foreground tabular-nums'
                  }
                >
                  {usage.remaining} / {usage.limit}
                </p>
              )}
            </div>
          </Button>
        }
      />
    </div>
  )
}
