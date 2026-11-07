'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import {
  IconChevronRight as ChevronRight,
  IconLifebuoy as Lifebuoy,
  IconLogout as LogOut,
  IconUser as User
} from '@tabler/icons-react'

import { signOut } from '@/lib/actions/auth'
import type { AppUser } from '@/lib/auth/types'
import { chatStore } from '@/lib/chat-store'
import { useAuthCapabilities } from '@/lib/contexts/app-user-context'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'

import { DeleteAccountButton } from '@/components/settings/delete-account-button'

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

const accountLinks = [
  {
    icon: User,
    label: 'My Account',
    href: '/settings?tab=account'
  }
]

interface AccountMenuProps {
  user: AppUser
  trigger: React.ReactNode
}

export function AccountMenu({ user, trigger }: AccountMenuProps) {
  const router = useRouter()
  const capabilities = useAuthCapabilities()
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [isSigningOut, startSignOutTransition] = useTransition()

  const userName = user.name || 'User'
  const avatarUrl = user.image ?? undefined

  const go = (href: string) => {
    setIsPopoverOpen(false)
    router.push(href)
  }

  const signOutAndLeave = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Failed to sign out:', error)
    }
    chatStore.setUser(null)
    setConfirmSignOut(false)
    setIsPopoverOpen(false)
    router.push('/')
    router.refresh()
  }

  const handleSignOut = () => {
    startSignOutTransition(signOutAndLeave)
  }

  return (
    <>
      <Popover
        open={isPopoverOpen}
        onOpenChange={nextOpen => {
          if (!isSigningOut) {
            setIsPopoverOpen(nextOpen)
          }
        }}
      >
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-64 rounded-2xl p-2 shadow-xl"
        >
          <div className="flex items-center gap-3 rounded-xl px-2 py-2.5">
            <Avatar className="size-11 shrink-0">
              <AvatarImage src={avatarUrl} alt={userName} />
              <AvatarFallback className="text-sm font-medium">
                {getInitials(userName, user.email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight">
                {userName}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
          </div>

          <Separator className="my-1.5" />

          {accountLinks.map(link => {
            const Icon = link.icon
            return (
              <button
                key={link.label}
                type="button"
                onClick={() => go(link.href)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Icon className="size-4 text-muted-foreground" />
                <span className="flex-1 truncate text-left">{link.label}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            )
          })}

          <a
            href="https://github.com/BhagattJii/askwild/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Lifebuoy className="size-4 text-muted-foreground" />
            <span className="flex-1 truncate text-left">Help Center</span>
          </a>

          <Separator className="my-1.5" />

          <button
            type="button"
            onClick={() => setConfirmSignOut(true)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="size-4 text-muted-foreground" />
            Sign out
          </button>

          {capabilities.deleteUser && (
            <>
              <Separator className="my-1.5" />
              <DeleteAccountButton appearance="menu" />
            </>
          )}
        </PopoverContent>
      </Popover>

      <AlertDialog
        open={confirmSignOut}
        onOpenChange={nextOpen => {
          if (!isSigningOut) {
            setConfirmSignOut(nextOpen)
          }
        }}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out of Askwild?</AlertDialogTitle>
            <AlertDialogDescription>
              You can sign back in anytime with the same account. Your chat
              history stays safe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSigningOut}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isSigningOut}
              onClick={event => {
                event.preventDefault()
                handleSignOut()
              }}
            >
              {isSigningOut ? <Spinner /> : 'Sign out'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
