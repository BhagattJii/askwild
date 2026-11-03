import { Model } from '@/lib/types/models'

const configuredModelId = process.env.DEFAULT_MODEL_ID
const configuredProviderId =
  process.env.DEFAULT_MODEL_PROVIDER_ID || 'openai-compatible'
const configuredModelName =
  process.env.DEFAULT_MODEL_NAME || process.env.DEFAULT_MODEL_ID
const configuredProviderName =
  process.env.DEFAULT_MODEL_PROVIDER_NAME || 'OpenAI Compatible'

export const DEFAULT_MODEL: Model = configuredModelId
  ? {
      id: configuredModelId,
      name: configuredModelName || configuredModelId,
      provider: configuredProviderName,
      providerId: configuredProviderId
    }
  : {
      id: 'gpt-5.4-mini',
      name: 'GPT-5.4 mini',
      provider: 'OpenAI',
      providerId: 'openai'
    }
