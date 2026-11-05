'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import {
  IconCheck as Check,
  IconCopy as Copy,
  IconDeviceLaptop as Laptop,
  IconLogout as LogOut,
  IconMoon as Moon,
  IconSun as Sun,
  IconTrash as Trash2
} from '@tabler/icons-react'
import { toast } from 'sonner'

import { deleteAccount } from '@/lib/actions/account'
import { signOut } from '@/lib/actions/auth'
import type { AppUser } from '@/lib/auth/types'
import { chatStore } from '@/lib/chat-store'
import { useAuthCapabilities } from '@/lib/contexts/app-user-context'
import { cn } from '@/lib/utils'

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

import { useTheme } from '@/components/theme-provider'

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

interface AccountMenuProps {
  user: AppUser
  trigger: React.ReactNode
  onNavigate?: () => void
}

export function AccountMenu({ user, trigger, onNavigate }: AccountMenuProps) {
  const router = useRouter()
  const { setTheme, theme } = useTheme()
  const capabilities = useAuthCapabilities()
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isSigningOut, startSignOutTransition] = useTransition()
  const [isDeleting, startDeleteTransition] = useTransition()
  const activeTheme = theme ?? 'system'

  const userName = user.name || 'User'
  const avatarUrl = user.image ?? undefined
  const isBusy = isSigningOut || isDeleting

  const copyEmail = async () => {
    if (!user.email) {
      return
    }
    try {
      await navigator.clipboard.writeText(user.email)
      toast.success('Email copied')
    } catch {
      toast.error('Could not copy email')
    }
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
    onNavigate?.()
    router.push('/')
    router.refresh()
  }

  const handleSignOut = () => {
    startSignOutTransition(signOutAndLeave)
  }

  const handleDeleteAccount = () => {
    startDeleteTransition(async () => {
      const result = await deleteAccount()

      if (result.success) {
        chatStore.setUser(null)
        try {
          await signOut()
        } catch (error) {
          console.error('Failed to clear client session:', error)
        }

        toast.success('Account deleted')
        setConfirmDelete(false)
        setIsPopoverOpen(false)
        onNavigate?.()
        router.push('/')
        router.refresh()
        return
      }

      toast.error(result.error ?? 'Failed to delete account')
    })
  }

  return (
    <>
      <Popover
        open={isPopoverOpen}
        onOpenChange={nextOpen => {
          if (!isBusy) {
            setIsPopoverOpen(nextOpen)
          }
        }}
      >
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-72 rounded-2xl p-3 shadow-xl"
        >
          <div className="flex items-center gap-3 p-2">
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
              <div className="mt-0.5 flex items-center gap-1">
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
                {user.email && (
                  <button
                    type="button"
                    onClick={copyEmail}
                    aria-label="Copy email"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <Copy className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <Separator className="my-2" />

          <div className="px-2 pb-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Appearance
            </p>
          </div>
          <div
            className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1"
            role="group"
            aria-label="Theme"
          >
            {themeOptions.map(option => {
              const Icon = option.icon
              const selected = activeTheme === option.value

              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium text-muted-foreground transition-all hover:text-foreground',
                    selected &&
                      'bg-background text-foreground shadow-sm ring-1 ring-border'
                  )}
                >
                  <span className="relative flex items-center">
                    <Icon className="size-4" />
                    {selected && (
                      <Check
                        aria-hidden="true"
                        className="absolute -right-4 top-0 size-3 text-foreground"
                      />
                    )}
                  </span>
                  {option.label}
                </button>
              )
            })}
          </div>

          <Separator className="my-2" />

          <button
            type="button"
            onClick={() => setConfirmSignOut(true)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="size-4 text-muted-foreground" />
            Sign out
          </button>

          {capabilities.deleteUser && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="size-4" />
              Delete account
            </button>
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
            <AlertDialogCancel disabled={isSigningOut}>Cancel</AlertDialogCancel>
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

      <AlertDialog
        open={confirmDelete}
        onOpenChange={nextOpen => {
          if (!isDeleting) {
            setConfirmDelete(nextOpen)
          }
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Your account, chat history, and
              uploaded files will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={event => {
                event.preventDefault()
                handleDeleteAccount()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Spinner /> : 'Delete account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
