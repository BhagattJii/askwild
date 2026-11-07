import type { Metadata, Viewport } from 'next'
import { Inter as FontSans } from 'next/font/google'

import { ClerkProvider } from '@clerk/nextjs'
import { Analytics } from '@vercel/analytics/next'

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getAuthProvider, withShareOptIn } from '@/lib/auth/provider'
import { AppUserProvider } from '@/lib/contexts/app-user-context'
import { UserProvider } from '@/lib/contexts/user-context'
import {
  ENFORCEMENT,
  getUsageBudget,
  isUsageBudgetAvailable,
  UI_ENABLED
} from '@/lib/usage-budget'
import { cn } from '@/lib/utils'

import { SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'

import AppSidebar from '@/components/app-sidebar'
import ArtifactRoot from '@/components/artifact/artifact-root'
import Header from '@/components/header'
import { KeyboardShortcutHandler } from '@/components/keyboard-shortcut-handler'
import { LibraryProvider } from '@/components/library/library-context'
import { PostHogProvider } from '@/components/posthog-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { UsageBudgetProvider } from '@/components/usage-budget-provider'

import './globals.css'

const fontSans = FontSans({
  subsets: ['latin'],
  variable: '--font-sans'
})

const title = 'Askwild'
const description =
  'Askwild — fast, private, AI-powered search built for India. Answers with live sources, citations and images.'

export const metadata: Metadata = {
  metadataBase: new URL('https://askwild.vercel.app'),
  title,
  description,
  openGraph: {
    title,
    description
  },
  twitter: {
    title,
    description,
    card: 'summary_large_image'
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1
}

/**
 * Mounts Clerk's provider only when the Clerk provider is active. Clerk
 * throws without a publishable key, so better-auth/anonymous deployments
 * must keep their previous provider-less tree.
 */
export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  const user = await getCurrentUser()
  // Sharing is opt-in for Better Auth (ENABLE_SHARE=true); the flag is
  // folded into the capabilities on the server so a prebuilt image can
  // still toggle it at runtime. Supabase shares without the flag, as it
  // always has. shareChat enforces the same rule again.
  const authProvider = getAuthProvider()
  const capabilities = withShareOptIn(
    authProvider.capabilities,
    authProvider.name
  )

  const userId = user?.id
  const isCloudDeployment = process.env.ASKWILD_CLOUD_DEPLOYMENT === 'true'
  const usageBudgetEnabled = Boolean(
    user &&
      isCloudDeployment &&
      isUsageBudgetAvailable() &&
      ENFORCEMENT === 'on' &&
      UI_ENABLED
  )
  const usageSnapshot =
    usageBudgetEnabled && user
      ? await getUsageBudget({
          userId: user.id,
          userCreatedAt: user.createdAt
        })
      : null
  const initialUsage = usageSnapshot
    ? {
        remaining: usageSnapshot.remaining,
        limit: usageSnapshot.limit,
        costs: usageSnapshot.costs,
        resetAt: new Date(usageSnapshot.resetAt).toISOString(),
        ...(usageSnapshot.refreshAt && {
          refreshAt: new Date(usageSnapshot.refreshAt).toISOString()
        })
      }
    : null

  const clerkEnabled =
    authProvider.name === 'clerk' &&
    Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

  const appTree = (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <PostHogProvider userId={user?.id ?? null}>
        <AppUserProvider user={user} capabilities={capabilities}>
          <UserProvider hasUser={!!userId}>
            <SidebarProvider defaultOpen={false}>
              <LibraryProvider>
                <UsageBudgetProvider
                  key={user?.id ?? 'guest'}
                  initialUsage={initialUsage}
                  enabled={usageBudgetEnabled}
                >
                  <AppSidebar user={user} />
                  <KeyboardShortcutHandler />
                  <div className="flex flex-col flex-1 min-w-0">
                    <Header user={user} />
                    <main className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
                      <ArtifactRoot>{children}</ArtifactRoot>
                    </main>
                  </div>
                </UsageBudgetProvider>
              </LibraryProvider>
            </SidebarProvider>
          </UserProvider>
        </AppUserProvider>
      </PostHogProvider>
      <Toaster />
      {isCloudDeployment && <Analytics />}
    </ThemeProvider>
  )

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          'fixed inset-0 flex flex-col font-sans antialiased overflow-hidden',
          fontSans.variable
        )}
      >
        {clerkEnabled ? (
          <ClerkProvider
            dynamic
            publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
            signInUrl="/auth/login"
            signUpUrl="/auth/login"
          >
            {appTree}
          </ClerkProvider>
        ) : (
          appTree
        )}
      </body>
    </html>
  )
}
