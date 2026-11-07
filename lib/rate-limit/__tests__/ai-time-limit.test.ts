import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  addAiTimeUsed,
  checkAiTimeLimit,
  checkAndEnforceAiTimeLimit,
  getDailyAiSecondsLimit,
  withAiTimeTracking
} from '@/lib/rate-limit/ai-time-limit'

const mockRedisGet = vi.fn()
const mockRedisIncrby = vi.fn()
const mockRedisExpire = vi.fn()

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(function () {
    return {
      get: mockRedisGet,
      incrby: mockRedisIncrby,
      expire: mockRedisExpire
    }
  })
}))

describe('ai time limit', () => {
  beforeEach(() => {
    mockRedisGet.mockReset()
    mockRedisIncrby.mockReset()
    mockRedisExpire.mockReset()
    process.env.ASKWILD_CLOUD_DEPLOYMENT = 'true'
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'
    delete process.env.AI_CHAT_DAILY_SECONDS
  })

  it('defaults to one hour of active AI time per day', () => {
    expect(getDailyAiSecondsLimit()).toBe(3600)
  })

  it('uses the configured limit when set', () => {
    process.env.AI_CHAT_DAILY_SECONDS = '900'
    expect(getDailyAiSecondsLimit()).toBe(900)
  })

  it('ignores invalid configured limits', () => {
    process.env.AI_CHAT_DAILY_SECONDS = 'not-a-number'
    expect(getDailyAiSecondsLimit()).toBe(3600)
  })

  it('allows the request when no time has been used', async () => {
    mockRedisGet.mockResolvedValue(0)

    const result = await checkAiTimeLimit('user-1')
    expect(result.allowed).toBe(true)
    expect(result.used).toBe(0)
    expect(result.remaining).toBe(3600)
    expect(result.enforced).toBe(true)
  })

  it('blocks once the daily budget is spent', async () => {
    mockRedisGet.mockResolvedValue(3600)

    const result = await checkAiTimeLimit('user-1')
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('fails open when Redis is not configured', async () => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    const result = await checkAiTimeLimit('user-1')
    expect(result.allowed).toBe(true)
    expect(result.enforced).toBe(false)
  })

  it('fails open when the cloud deployment flag is off', async () => {
    process.env.ASKWILD_CLOUD_DEPLOYMENT = 'false'

    const result = await checkAiTimeLimit('user-1')
    expect(result.allowed).toBe(true)
    expect(result.enforced).toBe(false)
  })

  it('returns a 429 response when the budget is spent', async () => {
    mockRedisGet.mockResolvedValue(3600)

    const response = await checkAndEnforceAiTimeLimit('user-1')
    expect(response).not.toBeNull()
    expect(response?.status).toBe(429)
    const body = await response!.json()
    expect(body.code).toBe('ai_time_limit_reached')
    expect(body.limitSeconds).toBe(3600)
    expect(body.retryable).toBe(false)
  })

  it('returns null while budget remains', async () => {
    mockRedisGet.mockResolvedValue(120)

    const response = await checkAndEnforceAiTimeLimit('user-1')
    expect(response).toBeNull()
  })

  it('records used seconds with a midnight expiry', async () => {
    mockRedisIncrby.mockResolvedValue(12)
    mockRedisExpire.mockResolvedValue(1)

    await addAiTimeUsed('user-1', 12.2)

    expect(mockRedisIncrby).toHaveBeenCalledTimes(1)
    expect(mockRedisIncrby.mock.calls[0][1]).toBe(13)
    expect(mockRedisExpire).toHaveBeenCalledTimes(1)
  })

  it('ignores empty windows', async () => {
    await addAiTimeUsed('user-1', 0)
    await addAiTimeUsed('user-1', Number.NaN)

    expect(mockRedisIncrby).not.toHaveBeenCalled()
  })

  it('charges the streamed time to the user budget', async () => {
    mockRedisIncrby.mockResolvedValue(5)
    mockRedisExpire.mockResolvedValue(1)

    const original = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: hello\n\n'))
        controller.close()
      }
    })

    const response = withAiTimeTracking(
      new Response(original, { status: 200 }),
      'user-1'
    )

    const text = await response.text()
    expect(text).toContain('hello')

    // The budget charge lands on the async continuation after the stream
    // closes; slow CI runners need more than the 1s default window.
    await vi.waitFor(() => expect(mockRedisIncrby).toHaveBeenCalledTimes(1), {
      timeout: 5000
    })
  })

  it('keeps the original response status and headers', async () => {
    const original = new Response('body', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    })

    const response = withAiTimeTracking(original, 'user-1')

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/plain')
    await response.text()
  })
})
