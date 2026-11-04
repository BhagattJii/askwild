import React from 'react'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { signOut } from '@/lib/actions/auth'
import type { AppUser } from '@/lib/auth/types'
import { chatStore } from '@/lib/chat-store'
import { AppUserProvider } from '@/lib/contexts/app-user-context'

import UserProfile from '@/components/user-profile'

vi.mock('@/lib/actions/auth', () => ({
  signOut: vi.fn()
}))

const { mockPush, mockRefresh } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockRefresh: vi.fn()
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh })
}))

vi.mock('@/components/usage-budget-provider', () => ({
  useUsageBudget: () => ({
    usage: null,
    isLow: false,
    isExhausted: false,
    refreshUsage: vi.fn()
  })
}))

const user: AppUser = {
  id: 'user-1',
  email: 'person@example.com',
  name: 'Test Person'
}

const capabilities = {
  signUp: true,
  passwordReset: true,
  deleteUser: true,
  oauth: false,
  emailVerification: false,
  share: true
}

describe('UserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the user profile information without a link menu', () => {
    render(
      <AppUserProvider user={user} capabilities={capabilities}>
        <UserProfile user={user} />
      </AppUserProvider>
    )

    expect(screen.getByText('Test Person')).toBeInTheDocument()
    expect(screen.getByText('person@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
  })

  it('signs out through the auth server action and refreshes the router', async () => {
    vi.mocked(signOut).mockResolvedValue({ success: true })
    render(
      <AppUserProvider user={user} capabilities={capabilities}>
        <UserProfile user={user} />
      </AppUserProvider>
    )

    chatStore.getOrCreate('cached', { messages: [] })

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledTimes(1)
      expect(chatStore.get('cached')).toBeUndefined()
      expect(mockPush).toHaveBeenCalledWith('/')
      expect(mockRefresh).toHaveBeenCalled()
    })
  })
})
