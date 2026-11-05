import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { deleteAccount } from '@/lib/actions/account'
import { signOut } from '@/lib/actions/auth'
import type { AppUser } from '@/lib/auth/types'
import { chatStore } from '@/lib/chat-store'
import { AppUserProvider } from '@/lib/contexts/app-user-context'

import { AccountMenu } from '@/components/account-menu'

vi.mock('@/lib/actions/account', () => ({
  deleteAccount: vi.fn()
}))

vi.mock('@/lib/actions/auth', () => ({
  signOut: vi.fn()
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}))

const setThemeMock = vi.hoisted(() => vi.fn())

vi.mock('@/components/theme-provider', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: setThemeMock })
}))

const { mockPush, mockRefresh } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockRefresh: vi.fn()
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh })
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

function renderMenu(override: Partial<typeof capabilities> = {}) {
  return render(
    <AppUserProvider
      user={user}
      capabilities={{ ...capabilities, ...override }}
    >
      <AccountMenu user={user} trigger={<button>Open profile</button>} />
    </AppUserProvider>
  )
}

function openMenu(override?: Partial<typeof capabilities>) {
  renderMenu(override)
  fireEvent.click(screen.getByRole('button', { name: 'Open profile' }))
}

describe('AccountMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the user name, email and a copy action', () => {
    openMenu()

    expect(screen.getByText('Test Person')).toBeInTheDocument()
    expect(screen.getByText('person@example.com')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Copy email' })
    ).toBeInTheDocument()
  })

  it('switches the theme from the appearance selector', () => {
    openMenu()

    fireEvent.click(screen.getByRole('button', { name: 'Light' }))
    expect(setThemeMock).toHaveBeenCalledWith('light')
  })

  it('asks for confirmation before signing out and signs out on confirm', async () => {
    vi.mocked(signOut).mockResolvedValue({ success: true })
    openMenu()

    chatStore.getOrCreate('cached', { messages: [] })

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(
      screen.getByText('Sign out of Askwild?')
    ).toBeInTheDocument()

    const confirmButtons = screen.getAllByRole('button', { name: 'Sign out' })
    fireEvent.click(confirmButtons.at(-1)!)

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledTimes(1)
      expect(chatStore.get('cached')).toBeUndefined()
      expect(mockPush).toHaveBeenCalledWith('/')
      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  it('does not sign out when the confirmation is cancelled', () => {
    openMenu()

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(signOut).not.toHaveBeenCalled()
    expect(
      screen.queryByText('Sign out of Askwild?')
    ).not.toBeInTheDocument()
  })

  it('shows the delete-account entry point when the provider supports it', () => {
    openMenu()
    expect(
      screen.getByRole('button', { name: 'Delete account' })
    ).toBeInTheDocument()
  })

  it('hides the delete-account entry point when the provider lacks the capability', () => {
    openMenu({ deleteUser: false })
    expect(
      screen.queryByRole('button', { name: 'Delete account' })
    ).not.toBeInTheDocument()
  })

  it('deletes the account and clears the session', async () => {
    vi.mocked(deleteAccount).mockResolvedValue({ success: true })
    vi.mocked(signOut).mockResolvedValue({ success: true })
    openMenu()

    chatStore.getOrCreate('cached', { messages: [] })

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Delete account' }).at(-1)!
    )

    await waitFor(() => {
      expect(deleteAccount).toHaveBeenCalledTimes(1)
      expect(signOut).toHaveBeenCalledTimes(1)
      expect(chatStore.get('cached')).toBeUndefined()
      expect(mockPush).toHaveBeenCalledWith('/')
      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  it('surfaces deletion errors', async () => {
    vi.mocked(deleteAccount).mockResolvedValue({
      success: false,
      error: 'Account deletion is unavailable in anonymous mode.'
    })
    openMenu()

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Delete account' }).at(-1)!
    )

    await waitFor(() => {
      expect(deleteAccount).toHaveBeenCalledTimes(1)
      expect(signOut).not.toHaveBeenCalled()
    })
  })
})
