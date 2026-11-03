import cloudConfig from '@/config/models/cloud.json'

import { getAdaptiveModePrompt } from '@/lib/agents/prompts/search-mode-prompts'

import {
  type AnswerOutput,
  type ProviderOptions,
  runAnswerTask
} from './run-answer-task'

const ADAPTIVE = cloudConfig.models.adaptive

export const DEFAULT_MODEL = `${ADAPTIVE.providerId}:${ADAPTIVE.id}`
export const DEFAULT_PROVIDER_OPTIONS = ADAPTIVE.providerOptions

// Production allows 50 steps in adaptive mode. The fixture search returns the
// same results every time, so a healthy run converges in a handful of steps;
// this cap only bounds a loop that is going nowhere. A run that hits it is
// rejected rather than measured, see the finish reason check in the runner.
const MAX_STEPS = 20

// The provider intermittently returns a response the SDK cannot parse, at a few
// percent of calls. The experiment runner drops an item whose task throws, so
// without a retry that noise lands directly in the measured rates. The SDK's own
// retry does not cover this error class.
const DEFAULT_RETRIES = 2

export type AdaptiveAnswerOutput = AnswerOutput

/**
 * Replay one query against the deployed adaptive configuration with the search
 * results pinned.
 *
 * Production faithfulness is the point: the same prompt builder, the same
 * providerOptions, and the same `toModelOutput` trimming the real search tool
 * applies. Reasoning effort in particular has moved emission rates before, so a
 * run without providerOptions would measure something the product does not do.
 */
export function createAdaptiveAnswerTask({
  model = DEFAULT_MODEL,
  providerOptions = DEFAULT_PROVIDER_OPTIONS,
  tracingEnabled = true,
  retries = DEFAULT_RETRIES
}: {
  model?: string
  providerOptions?: ProviderOptions
  tracingEnabled?: boolean
  retries?: number
} = {}) {
  return runAnswerTask({
    model,
    providerOptions,
    tracingEnabled,
    retries,
    maxSteps: MAX_STEPS,
    getPrompt: getAdaptiveModePrompt,
    includeTodoWrite: true,
    telemetryFunctionId: 'eval-adaptive-answer'
  })
}
