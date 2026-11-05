import { redirect } from 'next/navigation'

import { getAuthProvider } from '@/lib/auth/provider'

import { UpdatePasswordForm } from '@/components/update-password-form'

// Password updates are provider-specific: the better-auth form must not
// render under Clerk (Clerk owns the password flow), and a build without
// the provider known would otherwise prerender the form statically.
export const dynamic = 'force-dynamic'

export default async function UpdatePasswordPage({
  searchParams
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const provider = getAuthProvider()
  if (provider.name === 'clerk') {
    redirect('/auth/login')
  }

  const { token } = await searchParams

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <UpdatePasswordForm token={token} />
      </div>
    </div>
  )
}
