/**
 * Result cache for the OpenSERP provider.
 *
 * A fresh query costs 20-38s on the free-tier Render service (it re-renders
 * the Google SERP through an anti-bot pipeline), while a repeat of the same
 * query is served in under a second. Every later ask of the same topic is
 * therefore cached in two layers:
 *
 * 1. In-process Map — the warm-lambda hit, TTL 5 minutes, bounded size.
 * 2. Upstash Redis REST — shared across lambda instances, TTL 30 minutes.
 *
 * Both layers are best-effort: every failure is swallowed and the search
 * proceeds as if the cache were absent.
 */

import type { SearchResults } from '@/lib/types'

const MEMORY_TTL_MS = 5 * 60 * 1000
const MEMORY_MAX_ENTRIES = 100
const UPSTASH_TTL_SECONDS = 30 * 60
const UPSTASH_TIMEOUT_MS = 150

interface MemoryEntry {
  value: SearchResults
  expiresAt: number
}

const memory = new Map<string, MemoryEntry>()

function cacheKey(parts: {
  engines: string
  query: string
  maxResults: number
  types: string[]
  include: string
  exclude: string
}): string {
  const raw = [
    parts.engines,
    parts.types.join('+'),
    parts.query.trim().toLowerCase(),
    parts.maxResults,
    parts.include,
    parts.exclude
  ].join('|')
  return `aw:search:v1:${encodeURIComponent(raw).slice(0, 512)}`
}

function cacheable(value: SearchResults): boolean {
  return value.results.length > 0 || value.images.length > 0
}

function memoryGet(key: string): SearchResults | undefined {
  const entry = memory.get(key)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    memory.delete(key)
    return undefined
  }
  return entry.value
}

function memorySet(key: string, value: SearchResults): void {
  if (memory.size >= MEMORY_MAX_ENTRIES) {
    const oldest = memory.keys().next().value
    if (oldest !== undefined) memory.delete(oldest)
  }
  memory.set(key, { value, expiresAt: Date.now() + MEMORY_TTL_MS })
}

async function upstashRequest(
  path: string
): Promise<{ ok: boolean; body?: string }> {
  const base = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!base || !token) return { ok: false }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTASH_TIMEOUT_MS)
  try {
    const response = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    })
    return { ok: response.ok, body: await response.text() }
  } catch {
    return { ok: false }
  } finally {
    clearTimeout(timer)
  }
}

async function upstashGet(key: string): Promise<SearchResults | undefined> {
  const { ok, body } = await upstashRequest(`/get/${key}`)
  if (!ok || !body) return undefined
  try {
    const parsed = JSON.parse(body) as { result?: string }
    if (!parsed.result) return undefined
    return JSON.parse(parsed.result) as SearchResults
  } catch {
    return undefined
  }
}

async function upstashSet(key: string, json: string): Promise<void> {
  const base = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!base || !token) return

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTASH_TIMEOUT_MS)
  try {
    await fetch(`${base}/set/${key}?EX=${UPSTASH_TTL_SECONDS}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/plain'
      },
      body: json,
      signal: controller.signal
    })
  } catch {
    // best effort
  } finally {
    clearTimeout(timer)
  }
}

export function resetSearchCacheForTests(): void {
  memory.clear()
}

export async function getCachedResults(
  parts: Parameters<typeof cacheKey>[0]
): Promise<SearchResults | undefined> {
  const key = cacheKey(parts)
  const local = memoryGet(key)
  if (local) return local
  return upstashGet(key)
}

export async function putCachedResults(
  parts: Parameters<typeof cacheKey>[0],
  value: SearchResults
): Promise<void> {
  if (!cacheable(value)) return
  const key = cacheKey(parts)
  memorySet(key, value)
  await upstashSet(key, JSON.stringify(value))
}

export function makeSearchCacheKey(parts: Parameters<typeof cacheKey>[0]) {
  return cacheKey(parts)
}
