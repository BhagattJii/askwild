import React from 'react'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import type { AppUser } from '@/lib/auth/types'

import {
  UsageBudgetProvider,
  UsageBudgetWarning,
  useUsageBudget
} from '@/components/usage-budget-provider'
import { UsageDialog } from '@/components/usage-dialog'
import { UsageLimitDialog } from '@/components/usage-limit-dialog'
import UserProfile from '@/components/user-profile'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() })
}))

vi.mock('@/components/account-menu', () => ({
  AccountMenu: ({ trigger }: { trigger: React.ReactNode }) => (
    <>{trigger}</>
  )
}))

vi.mock('@/components/external-link-items', () => ({
  ExternalLinkItems: () => null
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => children,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div role="menu">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
    onClick
  }: {
    children: React.ReactNode
    onSelect?: (event: { preventDefault: () => void }) => void
    onClick?: () => void
  }) => (
    <button
      role="menuitem"
      onClick={() => {
        onSelect?.({ preventDefault: vi.fn() })
        onClick?.()
      }}
    >
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => children,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => children,
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) =>
    children,
  DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => children
}))

const user: AppUser = {
  id: 'user-1',
  email: 'person@example.com',
  name: 'Test Person'
}

const initialUsage = {
  remaining: 82,
  limit: 100,
  resetAt: '2026-10-01T00:00:00.000Z'
}

function UsageHarness() {
  const { usage, consume, showUsageLimit } = useUsageBudget()

  return (
    <>
      <output>{usage?.remaining ?? 'hidden'}</output>
      <button onClick={() => consume(2)}>Consume</button>
      <button onClick={() => showUsageLimit()}>Show limit</button>
    </>
  )
}

describe('usage budget UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  test('optimistically updates usage and exposes the limit dialog', () => {
    render(
      <UsageBudgetProvider initialUsage={initialUsage}>
        <UsageHarness />
      </UsageBudgetProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Consume' }))
    expect(screen.getByText('80')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show limit' }))
    expect(
      screen.getByRole('heading', {
        name: "You've reached your monthly usage limit"
      })
    ).toBeInTheDocument()
  })

  test('keeps usage UI disabled when the provider is disabled', () => {
    render(
      <UsageBudgetProvider initialUsage={initialUsage} enabled={false}>
        <UsageHarness />
      </UsageBudgetProvider>
    )

    expect(screen.getByText('hidden')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show limit' }))
    expect(
      screen.queryByText("You've reached your monthly usage limit")
    ).not.toBeInTheDocument()
  })

  test('clears one account usage and adopts the next account snapshot', () => {
    const { rerender } = render(
      <UsageBudgetProvider initialUsage={initialUsage} enabled>
        <UsageHarness />
      </UsageBudgetProvider>
    )

    expect(screen.getByText('82')).toBeInTheDocument()

    rerender(
      <UsageBudgetProvider initialUsage={null} enabled={false}>
        <UsageHarness />
      </UsageBudgetProvider>
    )
    expect(screen.getByText('hidden')).toBeInTheDocument()

    rerender(
      <UsageBudgetProvider
        initialUsage={{ ...initialUsage, remaining: 47 }}
        enabled
      >
        <UsageHarness />
      </UsageBudgetProvider>
    )
    expect(screen.getByText('47')).toBeInTheDocument()
  })

  test('shows the remaining usage inline in the profile without syncing', () => {
    const fetchMock = vi.mocked(fetch)

    render(
      <UsageBudgetProvider initialUsage={initialUsage}>
        <UserProfile user={user} />
      </UsageBudgetProvider>
    )

    expect(screen.getByText('82 / 100')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test.each([20, 0])(
    'shows a persistent status dot at %i remaining',
    (remaining: number) => {
      render(
        <UsageBudgetProvider initialUsage={{ ...initialUsage, remaining }}>
          <UserProfile user={user} />
        </UsageBudgetProvider>
      )

      expect(screen.getByTestId('usage-status-dot')).toBeInTheDocument()
      expect(screen.getByText(`${remaining} / 100`)).toBeInTheDocument()
    }
  )

  test('shows the English composer warning only when usage is low', () => {
    const { rerender } = render(
      <UsageBudgetProvider initialUsage={{ ...initialUsage, remaining: 21 }}>
        <UsageBudgetWarning />
      </UsageBudgetProvider>
    )

    expect(
      screen.queryByText(/running low on monthly usage/i)
    ).not.toBeInTheDocument()

    rerender(
      <UsageBudgetProvider
        key="low-usage"
        initialUsage={{ ...initialUsage, remaining: 18 }}
      >
        <UsageBudgetWarning />
      </UsageBudgetProvider>
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      "You're running low on monthly usage. 18 remaining."
    )
  })

  test('shows configured per-mode costs', () => {
    render(
      <UsageDialog
        open
        onOpenChange={vi.fn()}
        usage={{
          ...initialUsage,
          costs: { quick: 3, adaptive: 5 }
        }}
      />
    )

    expect(screen.getByText('Adaptive')).toBeInTheDocument()
    expect(screen.getByText(/Renews October 1/)).toBeInTheDocument()
    expect(
      screen.getByText(
        'Usage renews monthly based on when your account was created.'
      )
    ).toBeInTheDocument()
    expect(screen.getByText('3 per message')).toBeInTheDocument()
    expect(screen.getByText('5 per message')).toBeInTheDocument()
  })

  test('records interest from the limit dialog', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    render(
      <UsageLimitDialog
        open
        onOpenChange={vi.fn()}
        resetAt={initialUsage.resetAt}
      />
    )

    expect(
      screen.getByText(/Your usage renews on October 1/)
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'I need more usage' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/usage/interest', {
        method: 'POST'
      })
    })
    expect(screen.getByRole('button', { name: 'Recorded' })).toBeDisabled()
  })
})
