import { RELAY_MAX_BODY_BYTES } from '@/lib/analytics/relay-target'

export class PayloadTooLargeError extends Error {}

/**
 * Passes the stream through while counting bytes, erroring the stream
 * when the cap is exceeded: a declared content-length can be absent
 * (chunked) or a lie, so the actual bytes must be counted as they flow.
 * Nothing is buffered; the cap only bounds how much is forwarded.
 */
export function cappedBody(
  body: ReadableStream<Uint8Array> | null,
  max: number = RELAY_MAX_BODY_BYTES
): ReadableStream<Uint8Array> | null {
  if (!body) {
    return null
  }
  let total = 0
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        total += chunk.byteLength
        if (total > max) {
          controller.error(new PayloadTooLargeError())
          return
        }
        controller.enqueue(chunk)
      }
    })
  )
}
