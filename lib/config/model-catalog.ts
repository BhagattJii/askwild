import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'

import catalogConfig from '@/config/models/catalog.json'

import {
  MODEL_SELECTION_COOKIE,
  parseModelSelectionCookie
} from '@/lib/config/model-selection-cookie'
import type { Model } from '@/lib/types/models'
import { isProviderEnabled } from '@/lib/utils/registry'

export type CatalogTier = 'small' | 'medium' | 'large'

/**
 * Guests run on the medium tier: the small tier's 4B-class model ignores
 * system-prompt rules (asks "which year?" with the date in the prompt,
 * answers English to a Hindi question) — the exact failure mode that
 * makes an answer engine feel broken. Medium reasoning keeps latency
 * reasonable while actually following instructions.
 */
export const GUEST_MAX_TIER: CatalogTier = 'medium'
export const GUEST_UNLOCK_TIERS: CatalogTier[] = ['medium', 'large']

const TIER_RANK: Record<CatalogTier, number> = {
  small: 1,
  medium: 2,
  large: 3
}

export interface CatalogModel extends Model {
  tier: CatalogTier
}

const models: CatalogModel[] = (catalogConfig as { models: CatalogModel[] })
  .models

const modelsById: Map<string, CatalogModel> = new Map(
  models.map(model => [model.id, model])
)

function modelKeyOf(model: Model): string {
  return `${model.providerId}:${model.id}`
}

/** All models in the guest-visible catalog, small to large. */
export function getModelCatalog(): CatalogModel[] {
  return [...models].sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier])
}

/**
 * Keys a guest may not switch to (medium and large tiers). The selector
 * renders these with a lock and opens the sign-in prompt on click.
 */
export function getGuestLockedModelKeys(): string[] {
  return getModelCatalog()
    .filter(model => TIER_RANK[model.tier] > TIER_RANK[GUEST_MAX_TIER])
    .map(modelKeyOf)
}

export function getGuestModel(): CatalogModel {
  const guestModel = getModelCatalog().find(
    model => model.tier === GUEST_MAX_TIER
  )
  if (!guestModel) {
    throw new Error('Model catalog is missing the smallest unlocked tier.')
  }
  return guestModel
}

export function getDefaultGuestSignedInModel(): CatalogModel {
  const largeModel = getModelCatalog().find(model => model.tier === 'large')
  const fallback = getModelCatalog().at(-1)
  if (!largeModel && !fallback) {
    throw new Error('Model catalog is empty.')
  }
  return largeModel ?? (fallback as CatalogModel)
}

function getCatalogModelByCookie(
  providerId: string,
  modelId: string
): CatalogModel | undefined {
  const candidate = modelsById.get(modelId)
  if (!candidate || candidate.providerId !== providerId) {
    return undefined
  }
  if (!isProviderEnabled(candidate.providerId)) {
    return undefined
  }
  return candidate
}

interface SelectCatalogModelParams {
  cookieStore?: ReadonlyRequestCookies
  isGuest?: boolean
}

/**
 * Resolve the model for a cloud-deployment request. Guests are always
 * pinned to the smallest tier; signed-in users keep their explicit
 * cookie choice from the catalog, falling back to the large tier.
 */
export function selectCatalogModel({
  cookieStore,
  isGuest = false
}: SelectCatalogModelParams): CatalogModel {
  if (isGuest) {
    return getGuestModel()
  }

  const parsedCookie = parseModelSelectionCookie(
    cookieStore?.get(MODEL_SELECTION_COOKIE)?.value
  )

  const fromCookie = parsedCookie
    ? getCatalogModelByCookie(parsedCookie.providerId, parsedCookie.modelId)
    : undefined

  return fromCookie ?? getDefaultGuestSignedInModel()
}

export function isCatalogModelKey(key: string): boolean {
  return getModelCatalog().some(model => modelKeyOf(model) === key)
}
