'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

import {
  IconCheck as Check,
  IconChevronDown as ChevronDown,
  IconLock as Lock
} from '@tabler/icons-react'

import {
  MODEL_SELECTION_COOKIE,
  serializeModelSelectionCookie
} from '@/lib/config/model-selection-cookie'
import { useAppUser } from '@/lib/contexts/app-user-context'
import { ModelSelectorData } from '@/lib/types/model-selector'
import { Model } from '@/lib/types/models'
import { cn } from '@/lib/utils'
import { setCookie } from '@/lib/utils/cookies'

import { Button } from './ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from './ui/command'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

function modelKey(model: Model): string {
  return `${model.providerId}:${model.id}`
}

const PROVIDER_LOGO_BY_ID: Record<string, string> = {
  openai: '/providers/logos/openai.svg',
  anthropic: '/providers/logos/anthropic.svg',
  google: '/providers/logos/google.svg',
  gateway: '/providers/logos/gateway.svg',
  'openai-compatible': '/providers/logos/openai-compatible.svg',
  ollama: '/providers/logos/ollama.svg'
}

function ProviderLogo({ providerId }: { providerId: string }) {
  const logoSrc = PROVIDER_LOGO_BY_ID[providerId]
  if (!logoSrc) {
    return <span className="size-4 rounded-full bg-muted-foreground/30" />
  }

  return (
    <Image
      src={logoSrc}
      alt={`${providerId} logo`}
      width={16}
      height={16}
      className="size-4 shrink-0 object-contain"
    />
  )
}

interface ModelSelectorClientProps {
  data: ModelSelectorData
  /** Called when a guest clicks a locked model (opens the sign-in prompt). */
  onLockedModelClick?: () => void
}

export function ModelSelectorClient({
  data,
  onLockedModelClick
}: ModelSelectorClientProps) {
  const router = useRouter()
  const user = useAppUser()
  const isGuest = !user
  const [open, setOpen] = useState(false)
  const [selectedModelKey, setSelectedModelKey] = useState<string>(
    data.selectedModelKey
  )

  const providerEntries = useMemo(
    () =>
      Object.entries(data.modelsByProvider).sort(([providerA], [providerB]) =>
        providerA.localeCompare(providerB)
      ),
    [data.modelsByProvider]
  )

  const selectableModels = useMemo(
    () => providerEntries.flatMap(([, models]) => models),
    [providerEntries]
  )

  const selectableByKey = useMemo(
    () =>
      Object.fromEntries(
        selectableModels.map(model => [modelKey(model), model])
      ) as Record<string, Model>,
    [selectableModels]
  )

  const selectedModel = selectableByKey[selectedModelKey]

  const lockedKeys = new Set(data.guestLockedKeys ?? [])
  const lockedModelsCount = isGuest
    ? selectableModels.filter(model => lockedKeys.has(modelKey(model))).length
    : 0

  if (!data.enabled) {
    return null
  }

  if (!data.hasAvailableModels) {
    return (
      <Button
        variant="outline"
        className="h-auto gap-1 rounded-full border-none bg-muted px-3 py-2 text-sm shadow-none transition-[background-color,color,box-shadow,transform]"
        disabled
        title="No enabled models are available"
      >
        <span className="truncate max-w-52 text-xs font-medium">
          No enabled model available
        </span>
      </Button>
    )
  }

  if (!selectedModel) {
    return null
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-auto gap-1 rounded-full border-none bg-muted px-3 py-2 text-sm shadow-none transition-[background-color,color,box-shadow,transform]"
        >
          <ProviderLogo providerId={selectedModel.providerId} />
          <span className="truncate max-w-40 text-xs font-medium">
            {selectedModel.name}
          </span>
          <ChevronDown
            className={cn(
              'ml-0.5 h-3 w-3 opacity-50 transition-transform duration-[160ms] ease-[var(--motion-ease-out)]',
              open && 'rotate-180'
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[300px] p-0"
        align="end"
        side="top"
        sideOffset={6}
      >
        <Command>
          <CommandInput placeholder="Search models..." />
          <CommandList>
            <CommandEmpty>No model found.</CommandEmpty>
            {providerEntries.map(([provider, models]) => (
              <CommandGroup key={provider} heading={provider}>
                {models.map(model => {
                  const value = modelKey(model)
                  const isSelected = selectedModelKey === value
                  const isLocked = isGuest && lockedKeys.has(value)
                  return (
                    <CommandItem
                      key={value}
                      value={`${value} ${model.name} ${provider}`}
                      aria-label={
                        isLocked
                          ? `${model.name} (sign in to unlock)`
                          : model.name
                      }
                      onSelect={() => {
                        if (isLocked) {
                          setOpen(false)
                          onLockedModelClick?.()
                          return
                        }

                        const nextModel = selectableByKey[value]
                        if (!nextModel) {
                          return
                        }

                        setSelectedModelKey(value)
                        setCookie(
                          MODEL_SELECTION_COOKIE,
                          serializeModelSelectionCookie({
                            providerId: nextModel.providerId,
                            modelId: nextModel.id
                          })
                        )
                        setOpen(false)
                        router.refresh()
                      }}
                      className={cn('cursor-pointer', isLocked && 'opacity-80')}
                    >
                      <Check
                        className={cn(
                          'h-4 w-4',
                          isSelected ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <ProviderLogo providerId={model.providerId} />
                      <span className="flex-1 truncate">{model.name}</span>
                      {isLocked && (
                        <Lock
                          aria-label="Locked — sign in to unlock"
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                        />
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
            {lockedModelsCount > 0 && (
              <div className="border-t px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                You&apos;re using the free model.{' '}
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onLockedModelClick?.()
                  }}
                  className="font-medium text-foreground underline-offset-2 hover:underline"
                >
                  Sign in
                </button>{' '}
                to unlock {lockedModelsCount} larger{' '}
                {lockedModelsCount === 1 ? 'model' : 'models'}.
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
