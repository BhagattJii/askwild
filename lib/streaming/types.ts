import { UIMessage } from '@ai-sdk/react'

import type { UserPromptPreferences } from '../agents/prompts/search-mode-prompts'
import { Model } from '../types/models'
import { SearchMode } from '../types/search'

export interface BaseStreamConfig {
  message: UIMessage | null
  model: Model
  chatId: string
  userId: string
  trigger?: 'submit-user-message' | 'regenerate-assistant-message'
  messageId?: string
  abortSignal?: AbortSignal
  isNewChat?: boolean
  searchMode?: SearchMode
  onZeroPartError?: () => Promise<void>
  userPreferences?: UserPromptPreferences
}
