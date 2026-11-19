import Store from 'electron-store'
import { nativeTheme } from 'electron'
import { settingsSchema, themeSchema, windowStateSchema, preferencesSchema, activitySchema } from '../shared/validation'
import type { ActivityInput, Preferences, RecentFile, WorkspaceState } from '../shared/types'
import { randomUUID } from 'node:crypto'
import type { Settings, ThemePreference } from '../shared/types'

const store = new Store({ name: 'preferences', clearInvalidConfig: true })

export function getSettings(): Settings {
  const result = settingsSchema.safeParse(store.get('settings', {}))
  return result.success ? result.data : { theme: 'system' }
}

export function setTheme(theme: ThemePreference): Settings {
  const settings = { ...getSettings(), theme: themeSchema.parse(theme) }
  store.set('settings', settings)
  nativeTheme.themeSource = settings.theme === 'black' ? 'dark' : settings.theme
  store.set('preferences', { ...getPreferences(), theme: settings.theme })
  return settings
}

export function getPreferences(): Preferences {
  const parsed = preferencesSchema.safeParse(store.get('preferences', { theme: getSettings().theme }))
  return parsed.success ? parsed.data : preferencesSchema.parse({})
}
export function setPreferences(input: unknown): Preferences {
  const preferences = preferencesSchema.parse(input)
  store.set('preferences', preferences)
  store.set('settings', { theme: preferences.theme })
  nativeTheme.themeSource = preferences.theme === 'black' ? 'dark' : preferences.theme
  return preferences
}
export function getWorkspace(): WorkspaceState {
  return {
    preferences: getPreferences(),
    recent: store.get('recent', []) as WorkspaceState['recent'],
    activity: store.get('activity', []) as WorkspaceState['activity']
  }
}
export function rememberFile(file: RecentFile): void {
  store.set('recent', [file, ...getWorkspace().recent.filter((r) => r.path !== file.path)].slice(0, 30))
}
export function removeRecentFile(filePath: string): WorkspaceState {
  const recent = getWorkspace().recent
  if (!recent.some((file) => file.path === filePath)) throw new Error('File is not in recent history.')
  store.set('recent', recent.filter((file) => file.path !== filePath))
  return getWorkspace()
}
export function recordActivity(input: ActivityInput): WorkspaceState {
  const entry = activitySchema.parse(input)
  store.set('activity', [{ ...entry, id: randomUUID(), at: new Date().toISOString() }, ...getWorkspace().activity].slice(0, 200))
  return getWorkspace()
}
export function clearHistory(): WorkspaceState {
  store.set('recent', [])
  store.set('activity', [])
  return getWorkspace()
}
export function getWindowState() {
  const result = windowStateSchema.safeParse(store.get('window', {}))
  return result.success ? result.data : windowStateSchema.parse({})
}

export function saveWindowState(state: unknown): void {
  store.set('window', windowStateSchema.parse(state))
}