'use client'

import Link from 'next/link'

import { IconLogin as LogIn } from '@tabler/icons-react'

import { Button } from '@/components/ui/button'

export default function GuestMenu() {
  return (
    <Button
      variant="outline"
      size="sm"
      className="rounded-full gap-1.5"
      asChild
    >
      <Link href="/auth/login">
        <LogIn className="size-4" />
        <span>Sign In</span>
      </Link>
    </Button>
  )
}
