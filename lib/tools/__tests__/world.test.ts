import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createWorldEventsTool } from '@/lib/tools/world'

const originalFetch = globalThis.fetch
const fetchMock = vi.fn()

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

function toolCall(tool: object, args: object): Promise<any> {
  return (tool as any).execute(args)
}

beforeEach(() => {
  fetchMock.mockReset()
  globalThis.fetch = fetchMock
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('dynamic__worldEvents', () => {
  it('returns earthquakes and disasters from both feeds', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          features: [
            {
              properties: {
                mag: 5.2,
                place: '100 km SE of Delhi, India',
                time: 1793943032000,
                url: 'https://earthquake.usgs.gov/events/us/123',
                tsunami: 0
              }
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          events: [
            {
              title: 'Tropical Cyclone Murasu',
              categories: [{ title: 'Severe Storms' }],
              geometries: [{ date: '2026-11-05T00:00:00Z' }],
              link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_1'
            }
          ]
        })
      )

    const result = await toolCall(createWorldEventsTool(), {
      scope: 'all',
      window: '1d'
    })

    expect(result.ok).toBe(true)
    expect(result.earthquakes).toHaveLength(1)
    expect(result.earthquakes[0].magnitude).toBe(5.2)
    expect(result.naturalDisasters[0].title).toBe('Tropical Cyclone Murasu')
  })

  it('keeps the other half when one feed fails', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(
        jsonResponse({
          events: [
            {
              title: 'Wildfire somewhere',
              categories: [{ title: 'Wildfires' }],
              geometries: [],
              link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_2'
            }
          ]
        })
      )

    const result = await toolCall(createWorldEventsTool(), {
      scope: 'all',
      window: '1h'
    })

    expect(result.earthquakes).toEqual([])
    expect(result.naturalDisasters).toHaveLength(1)
  })

  it('marks both halves empty when the network is down entirely', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))

    const result = await toolCall(createWorldEventsTool(), {
      scope: 'all',
      window: '7d'
    })

    expect(result.earthquakes).toEqual([])
    expect(result.naturalDisasters).toEqual([])
  })
})
