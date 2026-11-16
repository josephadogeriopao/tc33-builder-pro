import Store from 'electron-store'
import { nativeTheme } from 'electron'
import { settingsSchema, themeSchema, windowStateSchema } from '../shared/validation'
import type { Settings, ThemePreference } from '../shared/types'

const store = new Store({ name: 'preferences', clearInvalidConfig: true })

export function getSettings(): Settings {
  const result = settingsSchema.safeParse(store.get('settings', {}))
  return result.success ? result.data : { theme: 'system' }
}

export function setTheme(theme: ThemePreference): Settings {
  const settings = { ...getSettings(), theme: themeSchema.parse(theme) }
  store.set('settings', settings)
  nativeTheme.themeSource = settings.theme
  return settings
}

export function getWindowState() {
  const result = windowStateSchema.safeParse(store.get('window', {}))
  return result.success ? result.data : windowStateSchema.parse({})
}

export function saveWindowState(state: unknown): void {
  store.set('window', windowStateSchema.parse(state))
}