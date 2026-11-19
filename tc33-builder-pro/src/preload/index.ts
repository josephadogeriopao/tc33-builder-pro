import { contextBridge, ipcRenderer } from 'electron'
import { channels } from '../shared/channels'
import type { DesktopAPI } from '../shared/types'
import type { IPCContract } from '../shared/ipc-contract'

function invoke<K extends keyof IPCContract>(key: K, ...args: IPCContract[K]['args']): Promise<IPCContract[K]['result']> {
  return ipcRenderer.invoke(channels[key], ...args)
}
function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: T) => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}
const api: DesktopAPI = {
  getAppVersion: () => invoke('getVersion'),
  openFile: () => invoke('openFile'),
  saveFile: (name, content) => invoke('saveFile', name, content),
  getSettings: () => invoke('getSettings'),
  setTheme: (theme) => invoke('setTheme', theme),
  getUpdateState: () => invoke('getUpdateState'),
  checkForUpdates: () => invoke('checkForUpdates'),
  installUpdate: () => invoke('installUpdate'),
  onCommand: (cb) => subscribe(channels.command, cb),
  onUpdateStatus: (cb) => subscribe(channels.updateStatus, cb),
  onThemeChanged: (cb) => subscribe(channels.themeChanged, cb),
  onToast: (cb) => subscribe(channels.toast, cb),
  windowControl: (action) => invoke('windowControl', action),
  getWorkspace: () => invoke('getWorkspace'),
  setPreferences: (preferences) => invoke('setPreferences', preferences),
  openSources: (kind) => invoke('openSources', kind),
  importDroppedSources: (sources) => invoke('importDroppedSources', sources),
  reopenSource: (path) => invoke('reopenSource', path),
  removeRecentFile: (path) => invoke('removeRecentFile', path),
  recordActivity: (entry) => invoke('recordActivity', entry),
  clearHistory: () => invoke('clearHistory'),
  saveExport: (name, bytes) => invoke('saveExport', name, bytes),
  exportMismatches: (format, name, issues) => invoke('exportMismatches', format, name, issues),
  validateSources: (sources) => invoke('validateSources', sources),
  generateSources: (sources, selectedIds) => invoke('generateSources', sources, selectedIds),
  rendererReady: () => invoke('rendererReady')
}
contextBridge.exposeInMainWorld('api', api)
