import { tool } from 'ai'
import { z } from 'zod'

/**
 * Free, no-key live incident feeds (USGS + NASA EONET). Fails soft per half
 * — one outage must not kill the other.
 */

const FAST_TIMEOUT_MS = 8000

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Askwild/1.0 (free AI search)' },
    signal: AbortSignal.timeout(FAST_TIMEOUT_MS)
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response.json()
}

export function createWorldEventsTool() {
  return tool({
    description:
      'Live world incidents right now — significant earthquakes (USGS) and active natural disasters (NASA: wildfires, storms, volcanoes, floods, icebergs). Use for "any disaster/earthquake/happening now" questions.',
    inputSchema: z.object({
      scope: z
        .enum(['all', 'earthquakes', 'natural-disasters'])
        .default('all')
        .describe('Which feed(s) to check'),
      window: z
        .enum(['1h', '1d', '7d'])
        .default('1d')
        .describe('Look-back window for earthquakes')
    }),
    async execute({ scope, window }) {
      const usgsDepth =
        window === '1h' ? 'hour' : window === '7d' ? 'week' : 'day'
      const result: {
        earthquakes: Array<{
          magnitude: number | null
          place: string | null
          time: string | null
          url: string | null
          tsunami: number
        }>
        disasters: Array<{
          title: string
          category: string | null
          date: string | null
          url: string | null
        }>
      } = { earthquakes: [], disasters: [] }

      if (scope === 'all' || scope === 'earthquakes') {
        try {
          const data = (await fetchJson(
            `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_${usgsDepth}.geojson`
          )) as {
            features?: Array<{
              properties?: {
                mag?: number
                place?: string
                time?: number
                url?: string
                tsunami?: number
              }
            }>
          }
          result.earthquakes = (data?.features ?? []).slice(0, 10).map(f => ({
            magnitude: f.properties?.mag ?? null,
            place: f.properties?.place ?? null,
            time: f.properties?.time
              ? new Date(f.properties.time).toISOString()
              : null,
            url: f.properties?.url ?? null,
            tsunami: f.properties?.tsunami ?? 0
          }))
        } catch {
          // Feed unavailable — keep the other half.
        }
      }

      if (scope === 'all' || scope === 'natural-disasters') {
        try {
          const data = (await fetchJson(
            'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=8'
          )) as {
            events?: Array<{
              title?: string
              categories?: Array<{ title?: string }>
              geometries?: Array<{ date?: string }>
              link?: string
            }>
          }
          result.disasters = (data?.events ?? []).map(e => ({
            title: e.title ?? 'Unknown event',
            category: e.categories?.[0]?.title ?? null,
            date: e.geometries?.at(-1)?.date ?? null,
            url: e.link ?? null
          }))
        } catch {
          // Feed unavailable — keep the earthquakes half.
        }
      }

      return {
        ok: true as const,
        scope,
        window,
        earthquakes: result.earthquakes,
        naturalDisasters: result.disasters
      }
    }
  })
}

export function createWorldTools() {
  return {
    dynamic__worldEvents: createWorldEventsTool()
  }
}
