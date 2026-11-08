import { SearchProvider } from './base'
import { BingScrapeSearchProvider } from './bing'
import { BraveSearchProvider } from './brave'
import { ExaSearchProvider } from './exa'
import { FirecrawlSearchProvider } from './firecrawl'
import { OpenserpSearchProvider } from './openserp'
import { SearXNGSearchProvider } from './searxng'
import { TavilySearchProvider } from './tavily'

export type SearchProviderType =
  | 'tavily'
  | 'exa'
  | 'searxng'
  | 'firecrawl'
  | 'brave'
  | 'openserp'
  | 'bing'
  | 'news-rss'
export const DEFAULT_PROVIDER: SearchProviderType = 'tavily'

export function createSearchProvider(
  type?: SearchProviderType
): SearchProvider {
  const providerType =
    type || (process.env.SEARCH_API as SearchProviderType) || DEFAULT_PROVIDER

  switch (providerType) {
    case 'tavily':
      return new TavilySearchProvider()
    case 'exa':
      return new ExaSearchProvider()
    case 'searxng':
      return new SearXNGSearchProvider()
    case 'brave':
      return new BraveSearchProvider()
    case 'openserp':
      return new OpenserpSearchProvider()
    case 'bing':
      return new BingScrapeSearchProvider()
    case 'news-rss':
      throw new Error('news-rss is a wrapper lane, not a standalone provider')
      return new OpenserpSearchProvider()
    case 'firecrawl':
      return new FirecrawlSearchProvider()
    default:
      // Default to TavilySearchProvider if an unknown provider is specified
      return new TavilySearchProvider()
  }
}

export { BingScrapeSearchProvider } from './bing'
export { BraveSearchProvider } from './brave'
export type { ExaSearchProvider } from './exa'
export type { FirecrawlSearchProvider } from './firecrawl'
export { OpenserpSearchProvider } from './openserp'
export { SearXNGSearchProvider } from './searxng'
export { TavilySearchProvider } from './tavily'
export type { SearchProvider }
