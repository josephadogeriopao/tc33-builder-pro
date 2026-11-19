import { ActivityInput, BatchGenerationResult, BatchSource, BatchValidationResult, DesktopAPI, DroppedSource, MismatchExportFormat, OpenedFile, Preferences, Settings, SourceFile, ThemePreference, UpdateState, WorkspaceState } from "./types";

// One request/response contract used by main handlers and preload callers.
export interface IPCContract {
  windowControl: { args: [action: Parameters<DesktopAPI['windowControl']>[0]]; result: void }
  getWorkspace: { args: []; result: WorkspaceState }
  setPreferences: { args: [preferences: Preferences]; result: Preferences }
  openSources: { args: [kind?: 'all' | 'json']; result: SourceFile[] }
  importDroppedSources: { args: [sources: DroppedSource[]]; result: SourceFile[] }
  reopenSource: { args: [path: string]; result: SourceFile }
  removeRecentFile: { args: [path: string]; result: WorkspaceState }
  recordActivity: { args: [entry: ActivityInput]; result: WorkspaceState }
  clearHistory: { args: []; result: WorkspaceState }
  saveExport: { args: [name: string, bytes: Uint8Array]; result: boolean }
  exportMismatches: { args: [format: MismatchExportFormat, name: string, issues: string[]]; result: boolean }
  validateSources: { args: [sources: BatchSource[]]; result: BatchValidationResult[] }
  generateSources: { args: [sources: BatchSource[], selectedIds: string[]]; result: BatchGenerationResult[] }
  rendererReady: { args: []; result: void }
  getVersion: { args: []; result: string }
  openFile: { args: []; result: OpenedFile | null }
  saveFile: { args: [defaultName: string, content: string]; result: boolean }
  getSettings: { args: []; result: Settings }
  setTheme: { args: [theme: ThemePreference]; result: Settings }
  getUpdateState: { args: []; result: UpdateState }
  checkForUpdates: { args: []; result: void }
  installUpdate: { args: []; result: void }
}