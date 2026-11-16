export interface OpenedFile {
  path: string
  name: string
  text: string
}

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'installing' }
  | { status: 'not-available' }
  | { status: 'not-configured' }
  | { status: 'error'; message: string }

export interface DesktopAPI {
  getAppVersion: () => Promise<string>
  openFile: () => Promise<{ path: string; name: string; text: string } | null>
  saveFile: (defaultName: string, content: string) => Promise<boolean>
  onCommand: (callback: (command: string) => void) => () => void
  onUpdateStatus: (callback: (state: UpdateState) => void) => () => void
  installUpdate: () => Promise<void>
  checkForUpdates: () => Promise<void>
  getUpdateState: () => Promise<UpdateState>
  getSettings: () => Promise<Settings>
  setTheme: (theme: ThemePreference) => Promise<Settings>
  onThemeChanged: (callback: (dark: boolean) => void) => () => void
  onToast: (callback: (message: string) => void) => () => void
}

export type ThemePreference = 'light' | 'dark' | 'system'
export interface Settings { theme: ThemePreference }

export type CellValue = string | number | boolean | null
export type SheetRow = CellValue[]
export type Headers = Record<string, string>

export interface ExtractedSheet {
  fileName: string
  sheetName: string
  rows: SheetRow[]
  formattedLog: string
}
