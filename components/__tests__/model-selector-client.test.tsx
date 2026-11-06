import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppUser } from '@/lib/auth/types'
import { AppUserProvider } from '@/lib/contexts/app-user-context'

import { ModelSelectorClient } from '@/components/model-selector-client'

// jsdom lacks ResizeObserver, which cmdk requires
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver =
  ResizeObserverStub as unknown as typeof ResizeObserver
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

vi.mock('next/image', () => ({
  default: ({ alt, ...rest }: any) => <img alt={alt} {...rest} />
}))

const { mockRefresh } = vi.hoisted(() => ({ mockRefresh: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh })
}))

const modelSmall = {
  id: 'nvidia/nemotron-3.5-bolt-e4b',
  name: 'Nemotron 3.5 Bolt',
  provider: 'NVIDIA',
  providerId: 'openai-compatible'
}

const modelMedium = {
  id: 'nvidia/nemotron-3.5-lightning-30b-a3b',
  name: 'Nemotron 3.5 Lightning',
  provider: 'NVIDIA',
  providerId: 'openai-compatible'
}

const modelLarge = {
  id: 'nvidia/nemotron-3-ultra-550b-a55b',
  name: 'Nemotron 3 Ultra 550B',
  provider: 'NVIDIA',
  providerId: 'openai-compatible'
}

const baseData = {
  enabled: true,
  modelsByProvider: {
    'openai-compatible': [modelSmall, modelMedium, modelLarge]
  },
  selectedModelKey: 'openai-compatible:nvidia/nemotron-3.5-bolt-e4b',
  hasAvailableModels: true,
  guestLockedKeys: [
    'openai-compatible:nvidia/nemotron-3.5-lightning-30b-a3b',
    'openai-compatible:nvidia/nemotron-3-ultra-550b-a55b'
  ]
}

const signedInData = {
  ...baseData,
  selectedModelKey: 'openai-compatible:nvidia/nemotron-3-ultra-550b-a55b'
}

const capabilities = {
  signUp: true,
  passwordReset: true,
  deleteUser: false,
  oauth: false,
  emailVerification: false,
  share: true
}

const signedInUser: AppUser = {
  id: 'user-1',
  email: 'person@example.com',
  name: 'Test Person'
}

function renderSelector(
  data: typeof baseData,
  onLockedModelClick?: () => void,
  user: AppUser | null = null
) {
  return render(
    <AppUserProvider user={user} capabilities={capabilities}>
      <ModelSelectorClient
        data={data}
        onLockedModelClick={onLockedModelClick}
      />
    </AppUserProvider>
  )
}

describe('ModelSelectorClient guest gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.cookie.split(';').forEach(entry => {
      const [key] = entry.split('=')
      document.cookie = `${key.trim()}=; Max-Age=0; path=/`
    })
  })

  it('shows every model to guests but locks medium and large', () => {
    renderSelector(baseData)

    fireEvent.click(screen.getByRole('combobox'))

    expect(
      screen.getByRole('option', { name: 'Nemotron 3.5 Bolt' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('option', {
        name: 'Nemotron 3.5 Lightning (sign in to unlock)'
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('option', {
        name: 'Nemotron 3 Ultra 550B (sign in to unlock)'
      })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Sign in' })
    ).toBeInTheDocument()
  })

  it('opens the sign-in prompt when a guest clicks a locked model', () => {
    const onLockedModelClick = vi.fn()
    renderSelector(baseData, onLockedModelClick)

    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(
      screen.getByRole('option', {
        name: 'Nemotron 3.5 Lightning (sign in to unlock)'
      })
    )

    expect(onLockedModelClick).toHaveBeenCalledTimes(1)
    expect(document.cookie).not.toContain('selectedModel')
  })

  it('lets a signed-in user pick a locked-list model and sets the cookie', async () => {
    renderSelector(signedInData, undefined, signedInUser)

    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: 'Nemotron 3.5 Lightning' }))

    await waitFor(() => {
      expect(document.cookie).toContain('selectedModel')
    })
    expect(mockRefresh).toHaveBeenCalled()
  })
})
