'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { toast } from 'sonner'

import { updatePreferences } from '@/lib/actions/preferences'
import type { Preferences, ResponseLanguage } from '@/lib/preferences/shared'
import { cn } from '@/lib/utils'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import { AppearancePicker } from '@/components/settings/appearance-picker'

const languageOptions: { value: ResponseLanguage; label: string }[] = [
  { value: 'auto', label: 'Auto (match my question)' },
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'hinglish', label: 'Hinglish' }
]

const MAX_BIO = 500

export function PreferencesRow({
  title,
  description,
  children,
  htmlFor
}: {
  title: string
  description: string
  children: React.ReactNode
  htmlFor?: string
}) {
  return (
    <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function usePreferences(initial: Preferences) {
  const router = useRouter()
  const [preferences, setPreferences] = useState(initial)
  const [isSaving, startTransition] = useTransition()

  const save = (patch: Partial<Preferences>, successMessage = 'Saved') => {
    const previous = preferences
    setPreferences(current => ({ ...current, ...patch }))

    startTransition(async () => {
      const result = await updatePreferences(patch)
      if (result.success && result.preferences) {
        setPreferences(result.preferences)
        toast.success(successMessage)
        router.refresh()
        return
      }
      setPreferences(previous)
      toast.error(result.error ?? 'Could not save preferences')
    })
  }

  return { preferences, isSaving, save }
}

export function PreferencesPanel({ initial }: { initial: Preferences }) {
  const { preferences, isSaving, save } = usePreferences(initial)

  return (
    <>
      <PreferencesRow
        title="Appearance"
        description="Choose between bright or dark theme."
        htmlFor="appearance"
      >
        <AppearancePicker />
      </PreferencesRow>

      <PreferencesRow
        title="Preferred response language"
        description="Askwild will answer in the language you pick."
        htmlFor="response-language"
      >
        <Select
          value={preferences.responseLanguage}
          onValueChange={value =>
            save({ responseLanguage: value as ResponseLanguage })
          }
          disabled={isSaving}
        >
          <SelectTrigger
            id="response-language"
            className="h-9 w-[180px] text-sm"
          >
            <SelectValue placeholder="Auto" />
          </SelectTrigger>
          <SelectContent align="end">
            {languageOptions.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PreferencesRow>

      <PreferencesRow
        title="Autosuggest"
        description="Suggest completions for the questions you type."
        htmlFor="autosuggest"
      >
        <Switch
          id="autosuggest"
          checked={preferences.autosuggest}
          onCheckedChange={checked => save({ autosuggest: checked })}
          disabled={isSaving}
          aria-label="Autosuggest"
        />
      </PreferencesRow>

      <PreferencesRow
        title="Related questions"
        description="Suggested follow-ups after each answer."
        htmlFor="related-questions"
      >
        <Switch
          id="related-questions"
          checked={preferences.autosuggest}
          onCheckedChange={checked => save({ autosuggest: checked })}
          disabled={isSaving}
          aria-label="Related questions"
        />
      </PreferencesRow>
    </>
  )
}

export function PersonalizePanel({ initial }: { initial: Preferences }) {
  const { preferences, isSaving, save } = usePreferences(initial)
  const [bio, setBio] = useState(initial.bio)
  const bioDirty = bio.trim() !== preferences.bio.trim()

  return (
    <div className="py-5">
      <p className="text-sm font-medium">Introduce yourself</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Write a short bio so the AI can tailor answers to you — your work,
        interests, or how you like answers. Stored to your account.
      </p>
      <label htmlFor="bio" className="sr-only">
        Introduce yourself
      </label>
      <Textarea
        id="bio"
        value={bio}
        maxLength={MAX_BIO + 1}
        onChange={event => setBio(event.target.value)}
        placeholder="e.g. I'm a developer in Pune preparing for cloud architecture. Keep answers short and technical."
        className="mt-3 min-h-[112px]"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span
          className={cn(
            'text-xs tabular-nums',
            bio.trim().length > MAX_BIO
              ? 'text-destructive'
              : 'text-muted-foreground'
          )}
        >
          {bio.trim().length} / {MAX_BIO}
        </span>
        <button
          type="button"
          disabled={!bioDirty || isSaving || bio.trim().length > MAX_BIO}
          onClick={() => save({ bio }, 'Profile saved')}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        >
          {isSaving ? <Spinner className="size-4" /> : null}
          Save
        </button>
      </div>
    </div>
  )
}
