export interface OpenedFile {
  path: string
  name: string
  text: string
}
export interface InputFile {
  name: string
  arrayBuffer(): Promise<ArrayBuffer>
  text(): Promise<string>
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
  windowControl: (action: 'minimize' | 'maximize' | 'close') => Promise<void>
  getWorkspace: () => Promise<WorkspaceState>
  setPreferences: (preferences: Preferences) => Promise<Preferences>
  openSources: (kind?: 'all' | 'json') => Promise<SourceFile[]>
  importDroppedSources: (sources: DroppedSource[]) => Promise<SourceFile[]>
  reopenSource: (path: string) => Promise<SourceFile>
  removeRecentFile: (path: string) => Promise<WorkspaceState>
  recordActivity: (entry: ActivityInput) => Promise<WorkspaceState>
  clearHistory: () => Promise<WorkspaceState>
  saveExport: (name: string, bytes: Uint8Array) => Promise<boolean>
  exportMismatches: (format: MismatchExportFormat, name: string, issues: string[]) => Promise<boolean>
  validateSources: (sources: BatchSource[]) => Promise<BatchValidationResult[]>
  generateSources: (sources: BatchSource[], selectedIds: string[]) => Promise<BatchGenerationResult[]>
  rendererReady: () => Promise<void>
}

export type ThemePreference = 'light' | 'dark' | 'black' | 'system'
export interface Settings { theme: ThemePreference }
export interface Preferences {
  theme: ThemePreference
  minimizeToTray: boolean
  notifications: boolean
  filename: string
  dateFormat: 'none' | 'YYYY-MM-DD' | 'MM-DD-YYYY' | 'YYYYMMDD'
  defaultDistrict: string
  defaultTaxYear: string
  jsonFilename: string
}
export interface JsonMetadata { parishName?: string; fipsCode?: string; district?: string; taxYear?: string }
export interface SourceFile { name: string; path: string; bytes: Uint8Array; metadata?: JsonMetadata }
export interface RecentFile { name: string; path: string; openedAt: string }
export interface ActivityInput { action: string; file: string; detail: string }
export interface Activity extends ActivityInput { id: string; at: string }
export interface WorkspaceState {
  preferences: Preferences
  recent: RecentFile[]
  activity: Activity[]
}
export interface DroppedSource { name: string; bytes: Uint8Array }
export interface BatchSource { name: string; bytes: Uint8Array; id?: string }
export type MismatchExportFormat = 'pdf' | 'docx' | 'xlsx' | 'csv' | 'json' | 'txt'
export interface BatchValidationResult {
  file: string
  comparedTo: string
  isValid: boolean
  summaryLog: string
  sourceLog: string
  errors: string[]
}
export interface BatchGenerationResult { file: string; saved: boolean; message: string }

export type CellValue = string | number | boolean | null
export type SheetRow = CellValue[]
export type Headers = Record<string, string>

export interface ExtractedSheet {
  fileName: string
  sheetName: string
  rows: SheetRow[]
  sqlScript?: string
  formattedLog: string
}
