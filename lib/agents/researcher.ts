import { isStepCount, tool, ToolLoopAgent } from 'ai'

import type { DraftVersion } from '@/lib/draft/draft'
import type {
  ResearcherRuntimeContext,
  ResearcherTools
} from '@/lib/types/agent'
import { type Model } from '@/lib/types/models'

import { createDraftTools } from '../tools/draft'
import { createFetchTool } from '../tools/fetch'
import { createKnowledgeTools } from '../tools/knowledge'
import { createQuestionTool } from '../tools/question'
import { createSearchTool } from '../tools/search'
import { createTodoTools } from '../tools/todo'
import { createWorldTools } from '../tools/world'
import { SearchMode } from '../types/search'
import { createCitationLabelAllocator } from '../utils/citation'
import { getModel } from '../utils/registry'
import { isTracingEnabled } from '../utils/telemetry'

import {
  getAdaptiveModePrompt,
  getQuickModePrompt,
  type UserPromptPreferences
} from './prompts/search-mode-prompts'

// Enhanced wrapper function with better type safety and streaming support
function wrapSearchToolForQuickMode<
  T extends ReturnType<typeof createSearchTool>
>(originalTool: T): T {
  return tool({
    description: originalTool.description,
    inputSchema: originalTool.inputSchema,
    // Preserve the original tool's model-output trimming (strips the duplicated
    // citationMap / UI-only images) so quick mode gets the same payload savings.
    toModelOutput: originalTool.toModelOutput,
    async *execute(params, context) {
      const executeFunc = originalTool.execute
      if (!executeFunc) {
        throw new Error('Search tool execute function is not defined')
      }

      // Force optimized type for quick mode
      const modifiedParams = {
        ...params,
        type: 'optimized' as const
      }

      // Execute the original tool and pass through all yielded values
      const result = executeFunc(modifiedParams, context)

      // Handle AsyncIterable (streaming) case
      if (
        result &&
        typeof result === 'object' &&
        Symbol.asyncIterator in result
      ) {
        for await (const chunk of result) {
          yield chunk
        }
      } else {
        // Fallback for non-streaming (shouldn't happen with new implementation)
        const finalResult = await result
        yield finalResult || {
          state: 'complete' as const,
          results: [],
          images: [],
          query: params.query,
          number_of_results: 0
        }
      }
    }
  }) as T
}

// Enhanced researcher function with improved type safety using ToolLoopAgent
// Note: abortSignal should be passed to agent.stream() or agent.generate() calls, not to the agent constructor
export function createResearcher({
  model,
  modelConfig,
  chatId,
  searchMode = 'adaptive',
  citationLabelSeed,
  currentDraft = null,
  userPreferences
}: {
  model: string
  modelConfig?: Model
  chatId?: string
  searchMode?: SearchMode
  citationLabelSeed?: number
  currentDraft?: DraftVersion | null
  userPreferences?: UserPromptPreferences
}) {
  try {
    // Date only: a second-precision timestamp sits at the head of the prompt
    // prefix and changes on every request, which alone voids the prompt cache.
    const currentDate = new Date().toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Kolkata'
    })

    // Create model-specific tools with proper typing
    const knowledgeToolNames = [
      'dynamic__wikiSummary',
      'dynamic__weather',
      'dynamic__currencyRate',
      'dynamic__stockQuote',
      'dynamic__newsSearch',
      'dynamic__academicSearch',
      'dynamic__cryptoPrice',
      'dynamic__commodity',
      'dynamic__worldEvents'
    ] as Array<keyof ResearcherTools>
    const labelAllocator = createCitationLabelAllocator(citationLabelSeed)
    const originalSearchTool = createSearchTool(model, {
      labelAllocator
    })
    const fetchTool = createFetchTool({ labelAllocator })
    const knowledgeTools = createKnowledgeTools()
    const worldTools = createWorldTools()
    const askQuestionTool = createQuestionTool(model)
    const todoTools = createTodoTools()
    const draftTools = createDraftTools(currentDraft)

    let systemPrompt: string
    let activeToolsList: (keyof ResearcherTools)[] = []
    let maxSteps: number
    let searchTool = originalSearchTool

    // Configure based on search mode
    switch (searchMode) {
      case 'quick':
        console.log(
          '[Researcher] Quick mode: maxSteps=20, tools=[search, fetch, knowledge, editDraft]'
        )
        systemPrompt = getQuickModePrompt(userPreferences)
        activeToolsList = [
          'search',
          'fetch',
          ...knowledgeToolNames,
          'editDraft'
        ]
        maxSteps = 20
        searchTool = wrapSearchToolForQuickMode(originalSearchTool)
        break

      case 'adaptive':
      default:
        systemPrompt = getAdaptiveModePrompt(userPreferences)
        activeToolsList = [
          'search',
          'fetch',
          ...knowledgeToolNames,
          'todoWrite',
          'editDraft'
        ]
        console.log(
          `[Researcher] Adaptive mode: maxSteps=50, tools=[${activeToolsList.join(', ')}]`
        )
        maxSteps = 50
        searchTool = originalSearchTool
        break
    }

    // Build tools object with proper typing
    const tools: ResearcherTools = {
      search: searchTool,
      fetch: fetchTool,
      ...knowledgeTools,
      ...worldTools,
      askQuestion: askQuestionTool,
      ...todoTools,
      ...draftTools
    } as ResearcherTools

    const providerOptions =
      modelConfig?.providerId === 'openai' && chatId
        ? {
            ...modelConfig.providerOptions,
            openai: {
              ...modelConfig.providerOptions?.openai,
              promptCacheKey: chatId
            }
          }
        : modelConfig?.providerOptions

    // Create ToolLoopAgent with all configuration
    const agent = new ToolLoopAgent({
      model: getModel(model),
      instructions: `${systemPrompt}\nCurrent date: ${currentDate} (IST). When the user asks about today, recent events, news, dates, prices, or anything time-sensitive, answer from fresh search results (mention result dates when available) instead of training-dataset knowledge.`,
      tools,
      activeTools: activeToolsList,
      stopWhen: isStepCount(maxSteps),
      ...(providerOptions && { providerOptions }),
      runtimeContext: {
        modelId: model,
        agentType: 'researcher',
        searchMode
      } satisfies ResearcherRuntimeContext,
      // Spans join the parent Langfuse trace via OTel context propagation
      telemetry: {
        isEnabled: isTracingEnabled(),
        functionId: 'research-agent',
        includeRuntimeContext: {
          modelId: true,
          agentType: true,
          searchMode: true
        }
      }
    })

    return agent
  } catch (error) {
    console.error('Error in createResearcher:', error)
    throw error
  }
}

// Helper function to access agent tools
export function getResearcherTools(
  agent: ToolLoopAgent<never, ResearcherTools, ResearcherRuntimeContext>
): ResearcherTools {
  return agent.tools
}

// Export the legacy function name for backward compatibility
export const researcher = createResearcher
