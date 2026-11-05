import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { signOut } from '@/lib/actions/auth'
import type { AppUser } from '@/lib/auth/types'
import { chatStore } from '@/lib/chat-store'
import { AppUserProvider } from '@/lib/contexts/app-user-context'

import { AccountMenu } from '@/components/account-menu'

vi.mock('@/lib/actions/auth', () => ({
  signOut: vi.fn()
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
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

  it('shows the user name, email and plain account links', () => {
    openMenu()

    expect(screen.getByText('Test Person')).toBeInTheDocument()
    expect(screen.getByText('person@example.com')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /My Account/ })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Preferences/ })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Help Center/ })
    ).toHaveAttribute('href', 'https://github.com/BhagattJii/askwild/issues')
  })

  it('navigates to the settings sections', () => {
    openMenu()

    fireEvent.click(screen.getByRole('button', { name: /My Account/ }))
    expect(mockPush).toHaveBeenCalledWith('/settings#account')

    fireEvent.click(screen.getByRole('button', { name: 'Open profile' }))
    fireEvent.click(screen.getByRole('button', { name: /Preferences/ }))
    expect(mockPush).toHaveBeenCalledWith('/settings#preferences')

    fireEvent.click(screen.getByRole('button', { name: 'Open profile' }))
    fireEvent.click(screen.getByRole('link', { name: /Help Center/ }))
    expect(
      screen.getByRole('link', { name: /Help Center/ })
    ).toHaveAttribute('target', '_blank')
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

})
