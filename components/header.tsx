'use client'

import React from 'react'
import { useRouter } from 'next/navigation'

import { IconMessageCirclePlus as MessageCirclePlus } from '@tabler/icons-react'

import type { AppUser } from '@/lib/auth/types'
import { SHORTCUT_EVENTS } from '@/lib/keyboard-shortcuts'
import { cn } from '@/lib/utils'

import { useSidebar } from '@/components/ui/sidebar'

import GuestMenu from './guest-menu'

interface HeaderProps {
  user: AppUser | null
}

export const Header: React.FC<HeaderProps> = ({ user }) => {
  const { open } = useSidebar()
  const router = useRouter()

  const startNewChat = () => {
    window.dispatchEvent(
      new CustomEvent(SHORTCUT_EVENTS.newChat, { cancelable: true })
    )
    router.push('/')
  }

  return (
    <header
      className={cn(
        'absolute top-0 right-0 p-2 md:p-3 flex justify-between items-center z-10 backdrop-blur-sm lg:backdrop-blur-none bg-background/80 lg:bg-transparent transition-[width] duration-200 ease-linear',
        open ? 'md:w-[calc(100%-var(--sidebar-width))]' : 'md:w-full',
        'w-full'
      )}
    >
      {/* This div can be used for a logo or title on the left if needed */}
      <div></div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={startNewChat}
          aria-label="New chat"
          title="New chat (Ctrl+Shift+O)"
          className="inline-flex size-9 items-center justify-center rounded-lg border border-muted bg-background/90 text-muted-foreground shadow-none transition-colors hover:bg-muted hover:text-foreground"
        >
          <MessageCirclePlus className="size-5" />
        </button>
        {user ? null : <GuestMenu />}
      </div>
    </header>
  )
}

export default Header
