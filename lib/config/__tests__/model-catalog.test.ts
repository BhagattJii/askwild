import { describe, expect, it } from 'vitest'

import {
  getDefaultGuestSignedInModel,
  getGuestLockedModelKeys,
  getGuestModel,
  getModelCatalog,
  selectCatalogModel
} from '@/lib/config/model-catalog'
import {
  MODEL_SELECTION_COOKIE,
  serializeModelSelectionCookie
} from '@/lib/config/model-selection-cookie'

// openai-compatible enablement is keyed off env vars — stub them so the
// provider resolution passes in the test environment.
process.env.OPENAI_COMPATIBLE_API_KEY = 'test-key'
process.env.OPENAI_COMPATIBLE_API_BASE_URL = 'http://localhost:9999'

function cookieStoreWith(value: string | null) {
  return {
    get: (key: string) => {
      if (key === MODEL_SELECTION_COOKIE && value !== null) {
        return { name: key, value }
      }
      return undefined
    }
  } as never
}

describe('model catalog', () => {
  it('exposes exactly three tiers ordered small to large', () => {
    const catalog = getModelCatalog()

    expect(catalog.map(model => model.tier)).toEqual([
      'small',
      'medium',
      'large'
    ])
    expect(catalog[0].id).toBe('nvidia/nemotron-3.5-bolt-e4b')
    expect(catalog[2].id).toBe('nvidia/nemotron-3-ultra-550b-a55b')
  })

  it('guest-locks nothing: guests default to the large model', () => {
    expect(getGuestLockedModelKeys()).toEqual([])
    expect(getGuestModel().tier).toBe('large')
    expect(getDefaultGuestSignedInModel().tier).toBe('large')
  })

  it('pins guests to the large model even when a smaller one is saved in the cookie', () => {
    const store = cookieStoreWith(
      serializeModelSelectionCookie({
        providerId: 'openai-compatible',
        modelId: 'nvidia/nemotron-3.5-bolt-e4b'
      })
    )

    const selected = selectCatalogModel({ cookieStore: store, isGuest: true })

    expect(selected.tier).toBe('large')
    expect(selected.id).toBe('nvidia/nemotron-3-ultra-550b-a55b')
  })

  it('gives signed-in users their saved catalog model', () => {
    const store = cookieStoreWith(
      serializeModelSelectionCookie({
        providerId: 'openai-compatible',
        modelId: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'
      })
    )

    const selected = selectCatalogModel({ cookieStore: store, isGuest: false })

    expect(selected.id).toBe('nvidia/nemotron-3-nano-omni-30b-a3b-reasoning')
  })

  it('falls back to the large model for unknown or expired cookie values', () => {
    const store = cookieStoreWith(
      serializeModelSelectionCookie({
        providerId: 'openai-compatible',
        modelId: 'nvidia/does-not-exist'
      })
    )

    const selected = selectCatalogModel({ cookieStore: store, isGuest: false })

    expect(selected.id).toBe('nvidia/nemotron-3-ultra-550b-a55b')
  })

  it('falls back to the large model when no cookie is present at all', () => {
    const selected = selectCatalogModel({
      cookieStore: cookieStoreWith(null),
      isGuest: false
    })

    expect(selected.id).toBe('nvidia/nemotron-3-ultra-550b-a55b')
  })
})
