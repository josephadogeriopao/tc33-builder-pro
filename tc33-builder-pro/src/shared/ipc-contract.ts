import { OpenedFile, Settings, ThemePreference, UpdateState } from "./types";

// One request/response contract used by main handlers and preload callers.
export interface IPCContract {
  getVersion: { args: []; result: string }
  openFile: { args: []; result: OpenedFile | null }
  saveFile: { args: [defaultName: string, content: string]; result: boolean }
  getSettings: { args: []; result: Settings }
  setTheme: { args: [theme: ThemePreference]; result: Settings }
  getUpdateState: { args: []; result: UpdateState }
  checkForUpdates: { args: []; result: void }
  installUpdate: { args: []; result: void }
}