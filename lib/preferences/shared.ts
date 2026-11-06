export type ResponseLanguage = 'auto' | 'en' | 'hi' | 'hinglish'

export interface Preferences {
  responseLanguage: ResponseLanguage
  autosuggest: boolean
  bio: string
}

export const DEFAULT_PREFERENCES: Preferences = {
  responseLanguage: 'auto',
  autosuggest: true,
  bio: ''
}

export const MAX_BIO_LENGTH = 500

export interface PreferencesResult {
  success: boolean
  preferences?: Preferences
  error?: string
}
