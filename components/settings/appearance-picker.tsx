'use client'

import {
  IconCheck as Check,
  IconMoon as Moon,
  IconSun as Sun
} from '@tabler/icons-react'

import { cn } from '@/lib/utils'

import { useTheme } from '@/components/theme-provider'

const options = [
  {
    value: 'light',
    label: 'Bright',
    icon: Sun,
    tile: 'bg-[#fbfbfb]',
    tileText: 'text-[#0b2833]'
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: Moon,
    tile: 'bg-[#15171b]',
    tileText: 'text-[#dbdee3]'
  }
] as const

export function AppearancePicker() {
  const { theme, setTheme } = useTheme()
  const active = theme === 'dark' ? 'dark' : 'light'

  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="flex gap-3"
    >
      {options.map(option => {
        const Icon = option.icon
        const selected = active === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            onClick={() => setTheme(option.value)}
            className={cn(
              'group relative flex h-[72px] w-32 flex-col items-start justify-between rounded-xl border p-3 text-left transition-colors hover:border-foreground/30',
              selected
                ? 'border-foreground shadow-sm'
                : 'border-border text-muted-foreground'
            )}
          >
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md',
                option.tile,
                option.tileText
              )}
            >
              <Icon className="size-4" />
            </span>
            <span className="flex w-full items-center justify-between">
              <span
                className={cn(
                  'text-sm',
                  selected
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {option.label}
              </span>
              {selected && <Check className="size-4 text-foreground" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
