import { cookies } from 'next/headers'

import { DEFAULT_MODEL } from '@/lib/config/default-model'
import { isCloudDeployment } from '@/lib/config/load-models-config'
import {
  getDefaultGuestSignedInModel,
  getGuestLockedModelKeys,
  getGuestModel,
  getModelCatalog
} from '@/lib/config/model-catalog'
import {
  MODEL_SELECTION_COOKIE,
  parseModelSelectionCookie
} from '@/lib/config/model-selection-cookie'
import { fetchAvailableModels } from '@/lib/models/fetch-models'
import { ModelSelectorData } from '@/lib/types/model-selector'
import { Model } from '@/lib/types/models'
import { isProviderEnabled } from '@/lib/utils/registry'

import 'server-only'

function modelKey(model: Model): string {
  return `${model.providerId}:${model.id}`
}

function pickFirstAvailableModel(
  modelsByProvider: Record<string, Model[]>
): Model | null {
  const providers = Object.keys(modelsByProvider).sort((a, b) =>
    a.localeCompare(b)
  )

  for (const provider of providers) {
    const firstModel = modelsByProvider[provider]?.[0]
    if (firstModel) {
      return firstModel
    }
  }

  return null
}

function resolveSelectedModelKey(
  modelsByProvider: Record<string, Model[]>,
  fallbackModel: Model | null,
  cookieValue?: string
): string {
  const parsedCookie = parseModelSelectionCookie(cookieValue)
  if (!parsedCookie) {
    return fallbackModel ? modelKey(fallbackModel) : ''
  }

  const matched = Object.values(modelsByProvider)
    .flat()
    .some(
      model =>
        model.providerId === parsedCookie.providerId &&
        model.id === parsedCookie.modelId
    )

  return matched
    ? `${parsedCookie.providerId}:${parsedCookie.modelId}`
    : fallbackModel
      ? modelKey(fallbackModel)
      : ''
}

export async function getModelSelectorData({
  isGuest = false
}: { isGuest?: boolean } = {}): Promise<ModelSelectorData> {
  if (isCloudDeployment()) {
    const catalog = getModelCatalog()
    const smallKey = modelKey(getGuestModel())
    const largeKey = modelKey(getDefaultGuestSignedInModel())
    const modelsByProvider: Record<string, Model[]> = {
      'openai-compatible': catalog
    }
    const cookieStore = await cookies()
    const parsedCookie = parseModelSelectionCookie(
      cookieStore.get(MODEL_SELECTION_COOKIE)?.value
    )
    const matchedKey =
      parsedCookie &&
      catalog.some(
        model =>
          model.id === parsedCookie.modelId &&
          model.providerId === parsedCookie.providerId
      )
        ? `${parsedCookie.providerId}:${parsedCookie.modelId}`
        : undefined

    return {
      enabled: true,
      modelsByProvider,
      selectedModelKey: isGuest ? smallKey : (matchedKey ?? largeKey),
      hasAvailableModels: catalog.length > 0,
      guestLockedKeys: getGuestLockedModelKeys()
    }
  }

  const modelsByProvider = await fetchAvailableModels()
  const fallbackModel = pickFirstAvailableModel(modelsByProvider)
  const hasAvailableModels =
    fallbackModel !== null || isProviderEnabled(DEFAULT_MODEL.providerId)
  const cookieStore = await cookies()
  const selectedModelKey = resolveSelectedModelKey(
    modelsByProvider,
    fallbackModel,
    cookieStore.get(MODEL_SELECTION_COOKIE)?.value
  )

  return {
    enabled: true,
    modelsByProvider,
    selectedModelKey,
    hasAvailableModels
  }
}
