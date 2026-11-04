import { count, eq } from 'drizzle-orm'

import { getAuth } from '@/lib/auth/better-auth/config'
import { db } from '@/lib/db'

import * as authSchema from '@/lib/auth/better-auth/schema'

// One-time bootstrap endpoint: creates the first admin account when none
// exists. Guarded by SETUP_SECRET; remove this route after provisioning.

export async function POST(request: Request) {
  const secret = request.headers.get('x-setup-secret') ?? ''
  if (!process.env.SETUP_SECRET || secret !== process.env.SETUP_SECRET) {
    return Response.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  try {
    const result = await getAuth().api.signUpEmail({
      body: await request.json()
    })
    return Response.json({ ok: true, user: result?.user ?? null })
  } catch (error) {
    return Response.json(
      { ok: false, error: String((error as Error)?.message || error) },
      { status: 400 }
    )
  }
}
