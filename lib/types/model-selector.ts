import { Model } from '@/lib/types/models'

export interface ModelSelectorData {
  enabled: boolean
  modelsByProvider: Record<string, Model[]>
  selectedModelKey: string
  hasAvailableModels: boolean
  /** Model keys a guest cannot select (shown locked with a sign-in prompt). */
  guestLockedKeys?: string[]
}
