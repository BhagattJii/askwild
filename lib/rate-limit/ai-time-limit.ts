import { Redis } from '@upstash/redis'

/**
 * Daily budget of *active AI time* for signed-in users.
 *
 * Only the time the model actually spends working counts: the window opens
 * when the request reaches the model and closes when the stream ends, errors
 * out, or is aborted. Time the visitor spends reading an answer, thinking, or
 * typing is never counted, because no request is running in that window.
 *
 * The budget resets at midnight UTC and is stored in Redis so it survives
 * serverless cold starts and applies across every instance.
 */
const DEFAULT_DAILY_AI_SECONDS = 60 * 60

/** Redis reads and writes fail open: a Redis outage must not block chat. */
const REDIS_TIMEOUT_MS = 3000

export function getDailyAiSecondsLimit(): number {
  const raw = process.env.AI_CHAT_DAILY_SECONDS
  const parsed = raw ? Number(raw) : DEFAULT_DAILY_AI_SECONDS
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_DAILY_AI_SECONDS
  }
  return Math.floor(parsed)
}

function getSecondsUntilMidnight(): number {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setUTCHours(24, 0, 0, 0)
  return Math.floor((midnight.getTime() - now.getTime()) / 1000)
}

function getNextMidnightTimestamp(): number {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setUTCHours(24, 0, 0, 0)
  return midnight.getTime()
}

function getDateKey(): string {
  return new Date().toISOString().split('T')[0]
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    return null
  }
  return new Redis({ url, token })
}

function buildKey(userId: string): string {
  return `ai_time:${userId}:${getDateKey()}`
}

export interface AiTimeCheckResult {
  allowed: boolean
  /** Seconds of active AI time already spent today. */
  used: number
  /** Seconds still available today. */
  remaining: number
  /** Active-time budget in seconds for the day. */
  limit: number
  /** Timestamp of the next reset (midnight UTC). */
  resetAt: number
  /** True when the check ran against Redis. */
  enforced: boolean
}

/**
 * Reads the active-time counter for the user. The counter is only written
 * after a stream finishes, so this read is the current state of the day.
 */
export async function checkAiTimeLimit(
  userId: string
): Promise<AiTimeCheckResult> {
  const limit = getDailyAiSecondsLimit()

  if (process.env.ASKWILD_CLOUD_DEPLOYMENT !== 'true') {
    return {
      allowed: true,
      used: 0,
      remaining: Infinity,
      limit,
      resetAt: 0,
      enforced: false
    }
  }

  const redis = getRedis()
  if (!redis) {
    return {
      allowed: true,
      used: 0,
      remaining: Infinity,
      limit,
      resetAt: 0,
      enforced: false
    }
  }

  try {
    const used = await Promise.race([
      redis.get<number>(buildKey(userId)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Redis timeout')), REDIS_TIMEOUT_MS)
      )
    ])

    const usedSeconds = Number(used ?? 0)
    return {
      allowed: usedSeconds < limit,
      used: usedSeconds,
      remaining: Math.max(0, limit - usedSeconds),
      limit,
      resetAt: getNextMidnightTimestamp(),
      enforced: true
    }
  } catch (error) {
    console.error('AI time limit check failed:', error)
    return {
      allowed: true,
      used: 0,
      remaining: Infinity,
      limit,
      resetAt: 0,
      enforced: false
    }
  }
}

/**
 * Adds the seconds the model spent working on this turn to the user's
 * daily counter. Rounds up to whole seconds and ignores empty windows.
 */
export async function addAiTimeUsed(
  userId: string,
  seconds: number
): Promise<void> {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return
  }

  if (process.env.ASKWILD_CLOUD_DEPLOYMENT !== 'true') {
    return
  }

  const redis = getRedis()
  if (!redis) {
    return
  }

  const rounded = Math.ceil(seconds)

  try {
    const key = buildKey(userId)
    await Promise.race([
      redis.incrby(key, rounded),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Redis timeout')), REDIS_TIMEOUT_MS)
      )
    ])

    // Always (re)set the expiry so the key disappears at the next midnight
    // UTC even if the process died between the increment and the expiry.
    await redis.expire(key, getSecondsUntilMidnight())
  } catch (error) {
    console.error('Failed to record AI active time:', error)
  }
}

/**
 * Returns a 429 response when the user's active-time budget for the day is
 * spent, or null when the request may proceed.
 */
export async function checkAndEnforceAiTimeLimit(
  userId: string
): Promise<Response | null> {
  const result = await checkAiTimeLimit(userId)

  if (!result.enforced || result.allowed) {
    return null
  }

  return new Response(
    JSON.stringify({
      error: `You have used your ${Math.round(result.limit / 60)} minutes of AI time for today. It resets at midnight UTC.`,
      code: 'ai_time_limit_reached',
      remainingSeconds: result.remaining,
      resetAt: result.resetAt,
      limitSeconds: result.limit,
      retryable: false
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.resetAt),
        'X-RateLimit-Unit': 'seconds'
      }
    }
  )
}

/**
 * Wraps a streaming response so the time the model spends producing the
 * answer is charged to the user's daily active-time budget.
 *
 * The window covers the whole stream: it starts when the response is handed
 * to the client and closes when the stream finishes or is aborted. Time the
 * user spends reading an answer, typing the next question, or thinking is
 * never inside this window, so it is never charged.
 */
export function withAiTimeTracking(
  response: Response,
  userId: string
): Response {
  if (!response.body) {
    return response
  }

  const startedAt = Date.now()
  let recorded = false

  const record = () => {
    if (recorded) {
      return
    }
    recorded = true
    const elapsedSeconds = (Date.now() - startedAt) / 1000
    void addAiTimeUsed(userId, elapsedSeconds).catch(() => {})
  }

  const reader = response.body.getReader()
  const tracked = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          record()
          controller.close()
          return
        }
        if (value) {
          controller.enqueue(value)
        }
      } catch (error) {
        record()
        controller.error(error)
      }
    },
    cancel(reason) {
      record()
      return reader.cancel(reason)
    }
  })

  return new Response(tracked, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  })
}
