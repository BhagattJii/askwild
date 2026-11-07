import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { VoiceInputButton } from '@/components/voice-input-button'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}))
import { toast } from 'sonner'

const fake = vi.hoisted(() => ({
  instances: [] as any[],
  start: vi.fn(),
  stop: vi.fn(),
  abort: vi.fn()
}))

class FakeSpeechRecognition {
  constructor() {
    fake.instances.push(this)
  }

  lang = ''
  continuous = false
  interimResults = false
  onresult: null | ((event: unknown) => void) = null
  onerror: null | ((event: { error?: string }) => void) = null
  onend: null | (() => void) = null

  start = fake.start
  stop = fake.stop
  abort = fake.abort
}

function installFakeRecognition() {
  ;(window as unknown as Record<string, unknown>).SpeechRecognition =
    FakeSpeechRecognition
}

function uninstallFakeRecognition() {
  delete (window as unknown as Record<string, unknown>).SpeechRecognition
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition
}

describe('VoiceInputButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fake.instances.length = 0
    uninstallFakeRecognition()
  })

  it('starts listening and forwards the transcript', () => {
    installFakeRecognition()
    const onTranscript = vi.fn()
    render(<VoiceInputButton onTranscript={onTranscript} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start voice input' }))

    expect(fake.start).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('button', { name: 'Stop voice input' })
    ).toBeInTheDocument()

    const recognition = fake.instances.at(-1)!
    recognition.onresult?.({
      results: [{ 0: { transcript: 'how to bake bread' }, isFinal: true }]
    })

    expect(onTranscript).toHaveBeenCalledWith('how to bake bread')
  })

  it('stops listening on a second click', () => {
    installFakeRecognition()
    render(<VoiceInputButton onTranscript={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start voice input' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stop voice input' }))

    expect(fake.stop).toHaveBeenCalled()
  })

  it('shows a toast instead of crashing when speech recognition is unavailable', () => {
    render(<VoiceInputButton onTranscript={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start voice input' }))

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining('not supported')
    )
    expect(fake.start).not.toHaveBeenCalled()
  })
})
