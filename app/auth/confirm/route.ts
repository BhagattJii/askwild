import { NextResponse } from 'next/server'

// Legacy Supabase callback routes: the Supabase provider is no longer
// selectable in cloud deployments, so these would only ever crash on a
// missing config. Send any stray traffic to the login screen instead.
export async function GET() {
  return NextResponse.redirect(
    new URL(
      '/auth/login',
      process.env.NEXT_PUBLIC_APP_URL ?? 'https://askwild.vercel.app'
    )
  )
}
