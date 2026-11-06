import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { deleteAccount } from '@/lib/actions/account'
import { signOut } from '@/lib/actions/auth'
import type { AppUser } from '@/lib/auth/types'
import { chatStore } from '@/lib/chat-store'
import { AppUserProvider } from '@/lib/contexts/app-user-context'
import { DEFAULT_PREFERENCES } from '@/lib/preferences/shared'

import { SettingsView } from '@/components/settings/settings-view'

vi.mock('@/lib/actions/preferences', () => ({
  updatePreferences: vi.fn(async () => ({
    success: true,
    preferences: {
      responseLanguage: 'auto',
      autosuggest: true,
      bio: ''
    }
  }))
}))

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

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  )
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh })
}))

const user: AppUser = {
  id: 'user-1',
  email: 'person@example.com',
  name: 'Test Person',
  createdAt: '2025-03-01T00:00:00.000Z'
}

const capabilities = {
  signUp: true,
  passwordReset: true,
  deleteUser: true,
  oauth: false,
  emailVerification: false,
  share: true
}

function renderSettings(
  userProp: AppUser | null = user,
  override: Partial<typeof capabilities> = {}
) {
  return render(
    <AppUserProvider
      user={userProp}
      capabilities={{ ...capabilities, ...override }}
    >
      <SettingsView
        user={userProp}
        initialPreferences={DEFAULT_PREFERENCES}
      />
    </AppUserProvider>
  )
}

describe('SettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the account section and the appearance selector', () => {
    renderSettings()

    expect(screen.getByText('Test Person')).toBeInTheDocument()
    expect(screen.getByText('person@example.com')).toBeInTheDocument()
    expect(screen.getByText('Appearance')).toBeInTheDocument()
    expect(screen.getByText('Response language')).toBeInTheDocument()
    expect(screen.getByText('Related questions')).toBeInTheDocument()
  })

  it('deletes the account and clears the session', async () => {
    vi.mocked(deleteAccount).mockResolvedValue({ success: true })
    vi.mocked(signOut).mockResolvedValue({ success: true })
    renderSettings()

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

  it('hides the danger zone when sign-out is the provider default', () => {
    renderSettings(user, { deleteUser: false })

    expect(
      screen.queryByRole('button', { name: 'Delete account' })
    ).not.toBeInTheDocument()
  })

  it('renders a signed-out view with a sign-in prompt instead', () => {
    renderSettings(null)

    expect(screen.queryByText('person@example.com')).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Sign in' })
    ).toBeInTheDocument()
  })
})
