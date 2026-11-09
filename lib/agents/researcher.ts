import { isStepCount, tool, ToolLoopAgent } from 'ai'

import type { DraftVersion } from '@/lib/draft/draft'
import type { SearchResults } from '@/lib/types'
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
import { searchNewsRss } from '../tools/search/news-rss-lane'
import { gateResults, isFreshnessQuery } from '../tools/search/relevance'
import { createTodoTools } from '../tools/todo'
import { createWorldTools } from '../tools/world'
import { SearchMode } from '../types/search'
import {
  assignCitationLabels,
  type CitationLabelAllocator,
  createCitationLabelAllocator
} from '../utils/citation'
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
>(originalTool: T, labelAllocator?: CitationLabelAllocator): T {
  // Hard search budget for quick mode: ONE real search per request. The
  // prompt says "one search, then answer", but both medium and large
  // models kept re-searching after good results (4 searches for a date).
  // Words don't stop them, so the tool itself refuses a second call: the
  // model gets an empty result and must answer from the first one.
  let searchCalls = 0
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

      searchCalls += 1
      if (searchCalls > 1) {
        console.log(
          `[Researcher] Quick-mode search budget spent (call #${searchCalls}) — refusing re-search`
        )
        const budgetEmpty: SearchResults = {
          results: [],
          images: [],
          videos: [],
          query: typeof params.query === 'string' ? params.query : '',
          number_of_results: 0
        }
        yield {
          state: 'complete' as const,
          ...budgetEmpty,
          provider: 'news-rss' as const
        }
        return
      }

      // Fast lane: Google News RSS answers the freshness class of queries
      // (news, festivals, prices, matches, any explicit year) in ~1s with
      // real dated articles, while scraping providers need 3-20s and suffer
      // datacenter poison. Evergreen questions skip this lane: the feed
      // returns plausible topic-word noise instead of the right answer.
      // Whatever the feed returns still passes the same relevance gate the
      // slow-path lanes use, so a junk feed can never reach the model.
      const rssQuery = typeof params.query === 'string' ? params.query : ''
      const rssMax =
        typeof params.max_results === 'number' ? params.max_results : 10
      if (rssQuery && isFreshnessQuery(rssQuery)) {
        const rssResults = await searchNewsRss(rssQuery, rssMax)
        if (rssResults && rssResults.results.length > 0) {
          const verdict = gateResults(rssQuery, rssResults.results)
          if (verdict.quality !== 'fail' && verdict.passing.length > 0) {
            const gated = { ...rssResults, results: verdict.passing }
            if (labelAllocator) {
              const start = labelAllocator.reserve(gated.results.length)
              gated.results = assignCitationLabels(gated.results, start)
            }
            if (context?.toolCallId) {
              gated.toolCallId = context.toolCallId
            }
            yield { state: 'searching' as const, query: params.query }
            yield {
              state: 'complete' as const,
              ...gated,
              provider: 'news-rss'
            }
            return
          }
        }
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
          '[Researcher] Quick mode: maxSteps=4, tools=[search, knowledge, editDraft] (fetch removed, 1-search hard budget)'
        )
        systemPrompt = getQuickModePrompt(userPreferences)
        // Fetch is intentionally NOT active in quick mode: the prompt says
        // "fetch only URLs the user pasted", yet the model fetched Google
        // News redirect links twice in one run (results=1 junk) — pure
        // latency. Search snippets already cover the answer; adaptive mode
        // keeps fetch for deep dives.
        activeToolsList = [...knowledgeToolNames, 'editDraft']
        // Budget in steps, not seconds: the search lane is now ~1s, so the
        // loop is bounded by model turns, not backend time. 4 turns allow
        // search + one knowledge tool + answer (the search wrapper itself
        // refuses a second search), ending the 60s re-search loops.
        maxSteps = 4
        searchTool = wrapSearchToolForQuickMode(
          originalSearchTool,
          labelAllocator
        )
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
