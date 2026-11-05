import React from 'react'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppUser } from '@/lib/auth/types'
import { AppUserProvider } from '@/lib/contexts/app-user-context'

import UserProfile from '@/components/user-profile'

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

vi.mock('@/components/account-menu', () => ({
  AccountMenu: ({ trigger }: { trigger: React.ReactNode }) => (
    <div data-testid="account-menu">{trigger}</div>
  )
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

  it('shows the user profile information with an account menu trigger', () => {
    render(
      <AppUserProvider user={user} capabilities={capabilities}>
        <UserProfile user={user} />
      </AppUserProvider>
    )

    expect(screen.getByText('Test Person')).toBeInTheDocument()
    expect(screen.getByText('person@example.com')).toBeInTheDocument()
    expect(screen.getByTestId('account-menu')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Account settings' })
    ).toBeInTheDocument()
  })
})
