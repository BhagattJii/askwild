'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import {
  IconDeviceLaptop as Laptop,
  IconMoon as Moon,
  IconSun as Sun
} from '@tabler/icons-react'
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

import { useTheme } from '@/components/theme-provider'

const themeOptions = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Laptop }
]

const languageOptions: { value: ResponseLanguage; label: string }[] = [
  { value: 'auto', label: 'Auto (match my question)' },
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'hinglish', label: 'Hinglish' }
]

const MAX_BIO = 500

function Row({
  title,
  hint,
  htmlFor,
  children
}: {
  title: string
  hint?: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-3">
      <div className="min-w-0">
        <p className="text-sm" id={htmlFor ? undefined : undefined}>
          <label htmlFor={htmlFor}>{title}</label>
        </p>
        {hint && (
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

interface PreferencesEditorProps {
  initial: Preferences
}

export function PreferencesEditor({ initial }: PreferencesEditorProps) {
  const router = useRouter()
  const { setTheme, theme } = useTheme()
  const [preferences, setPreferences] = useState(initial)
  const [bio, setBio] = useState(initial.bio)
  const [isSaving, startTransition] = useTransition()
  const activeTheme = theme ?? 'system'
  const bioDirty = bio.trim() !== preferences.bio.trim()

  const save = (patch: Partial<Preferences>, successMessage = 'Saved') => {
    const previous = preferences
    setPreferences(prev => ({ ...prev, ...patch }))

    startTransition(async () => {
      const result = await updatePreferences(patch)
      if (result.success && result.preferences) {
        setPreferences(result.preferences)
        toast.success(successMessage)
        router.refresh()
        return
      }
      setPreferences(previous)
      toast.error(result.error)
    })
  }

  const saveBio = () => {
    save({ bio }, 'Profile saved')
  }

  return (
    <>
      <section
        id="preferences"
        aria-labelledby="preferences-heading"
        className="mt-6 scroll-mt-6 rounded-2xl border bg-card p-5 sm:p-6"
      >
        <p
          id="preferences-heading"
          className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
        >
          Preferences
        </p>
        <div className="mt-4 divide-y rounded-xl border">
          <Row title="Appearance" hint="Light, dark or follow your system." htmlFor="appearance">
            <Select
              value={activeTheme}
              onValueChange={value => setTheme(value)}
            >
              <SelectTrigger id="appearance" className="h-9 w-[132px] text-sm">
                <SelectValue placeholder="Appearance" />
              </SelectTrigger>
              <SelectContent align="end">
                {themeOptions.map(option => {
                  const Icon = option.icon
                  return (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="inline-flex items-center gap-2">
                        <Icon className="size-4" />
                        {option.label}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </Row>

          <Row
            title="Response language"
            hint="Askwild answers in this language."
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
          </Row>

          <Row
            title="Related questions"
            hint="Suggested follow-ups after each substantive answer."
            htmlFor="related-questions"
          >
            <Switch
              id="related-questions"
              checked={preferences.autosuggest}
              onCheckedChange={checked => save({ autosuggest: checked })}
              disabled={isSaving}
              aria-label="Related questions"
            />
          </Row>
        </div>
      </section>

      <section
        id="personalize"
        aria-labelledby="personalize-heading"
        className="mt-6 scroll-mt-6 rounded-2xl border bg-card p-5 sm:p-6"
      >
        <p
          id="personalize-heading"
          className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
        >
          Personalize
        </p>
        <p className="mt-4 text-sm font-medium">Introduce yourself</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          The AI sees this as context about you when answering — your job,
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
          className="mt-3 min-h-[96px]"
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
            onClick={saveBio}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {isSaving ? <Spinner className="size-4" /> : null}
            Save
          </button>
        </div>
      </section>
    </>
  )
}
