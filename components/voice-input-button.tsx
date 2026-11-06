'use client'

import { useEffect, useRef, useState } from 'react'

import {
  IconMicrophone as Microphone,
  IconPlayerStop as Stop
} from '@tabler/icons-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'

type SpeechRecognitionCtor = new () => {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: any) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') {
    return null
  }
  const w = window as unknown as Record<string, unknown>
  return (
    (w.SpeechRecognition as SpeechRecognitionCtor | undefined) ??
    (w.webkitSpeechRecognition as SpeechRecognitionCtor | undefined) ??
    null
  )
}

export function VoiceInputButton({
  onTranscript,
  disabled = false
}: {
  onTranscript: (text: string) => void
  disabled?: boolean
}) {
  const recognitionRef = useRef<InstanceType<SpeechRecognitionCtor> | null>(
    null
  )
  const [listening, setListening] = useState(false)

  const supported = getSpeechRecognitionCtor() !== null

  const stop = () => {
    recognitionRef.current?.stop()
  }

  useEffect(
    () => () => {
      recognitionRef.current?.abort()
      recognitionRef.current = null
    },
    []
  )

  const start = () => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      toast.error('Voice input is not supported in this browser.')
      return
    }

    try {
      const recognition = new Ctor()
      recognition.lang = navigator.language || 'en-IN'
      recognition.continuous = false
      recognition.interimResults = false

      recognition.onresult = event => {
        const text = Array.from(event.results ?? [])
          .map((result: any) => result?.[0]?.transcript ?? '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (text) {
          onTranscript(text)
        }
      }

      recognition.onerror = event => {
        const code = event.error
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          toast.error('Microphone access is blocked. Allow it in browser site settings.')
        } else if (code === 'no-speech' || code === 'aborted') {
          // Silent — user simply did not speak or cancelled.
        } else {
          toast.error('Voice input failed. Please try again.')
        }
        setListening(false)
      }

      recognition.onend = () => {
        setListening(false)
      }

      recognitionRef.current = recognition
      recognition.start()
      setListening(true)
    } catch {
      setListening(false)
      toast.error('Voice input could not be started. Check microphone permissions.')
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      disabled={disabled}
      aria-pressed={listening}
      title={
        !supported
          ? 'Voice input is not supported in this browser'
          : listening
            ? 'Stop voice input'
            : 'Speak your search'
      }
      aria-label={listening ? 'Stop voice input' : 'Start voice input'}
      onClick={() => (listening ? stop() : start())}
      className={cn(
        'shrink-0 size-8 md:size-10 rounded-full transition-colors',
        listening &&
          'border-destructive text-destructive hover:text-destructive hover:border-destructive'
      )}
    >
      {listening ? (
        <Stop className="size-4" />
      ) : (
        <Microphone className="size-4" />
      )}
    </Button>
  )
}
