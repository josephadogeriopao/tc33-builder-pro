"use strict";
const electron = require("electron");
const channels = {
  openFile: "app:open-file",
  saveFile: "app:save-file",
  command: "app:command",
  updateStatus: "update:status",
  installUpdate: "update:install",
  getVersion: "app:get-version",
  checkForUpdates: "update:check",
  getUpdateState: "update:get-state",
  getSettings: "settings:get",
  setTheme: "settings:set-theme",
  themeChanged: "theme:changed",
  toast: "app:toast",
  windowControl: "window:control",
  getWorkspace: "workspace:get",
  setPreferences: "workspace:preferences",
  openSources: "workspace:open",
  importDroppedSources: "workspace:import-dropped",
  reopenSource: "workspace:reopen",
  removeRecentFile: "workspace:remove-recent",
  recordActivity: "workspace:activity",
  clearHistory: "workspace:clear",
  saveExport: "workspace:export",
  exportMismatches: "workspace:export-mismatches",
  validateSources: "workspace:validate-sources",
  generateSources: "workspace:generate-sources",
  rendererReady: "window:ready"
};
function invoke(key, ...args) {
  return electron.ipcRenderer.invoke(channels[key], ...args);
}
function subscribe(channel, callback) {
  const listener = (_event, value) => callback(value);
  electron.ipcRenderer.on(channel, listener);
  return () => electron.ipcRenderer.removeListener(channel, listener);
}
const api = {
  getAppVersion: () => invoke("getVersion"),
  openFile: () => invoke("openFile"),
  saveFile: (name, content) => invoke("saveFile", name, content),
  getSettings: () => invoke("getSettings"),
  setTheme: (theme) => invoke("setTheme", theme),
  getUpdateState: () => invoke("getUpdateState"),
  checkForUpdates: () => invoke("checkForUpdates"),
  installUpdate: () => invoke("installUpdate"),
  onCommand: (cb) => subscribe(channels.command, cb),
  onUpdateStatus: (cb) => subscribe(channels.updateStatus, cb),
  onThemeChanged: (cb) => subscribe(channels.themeChanged, cb),
  onToast: (cb) => subscribe(channels.toast, cb),
  windowControl: (action) => invoke("windowControl", action),
  getWorkspace: () => invoke("getWorkspace"),
  setPreferences: (preferences) => invoke("setPreferences", preferences),
  openSources: (kind) => invoke("openSources", kind),
  importDroppedSources: (sources) => invoke("importDroppedSources", sources),
  reopenSource: (path) => invoke("reopenSource", path),
  removeRecentFile: (path) => invoke("removeRecentFile", path),
  recordActivity: (entry) => invoke("recordActivity", entry),
  clearHistory: () => invoke("clearHistory"),
  saveExport: (name, bytes) => invoke("saveExport", name, bytes),
  exportMismatches: (format, name, issues) => invoke("exportMismatches", format, name, issues),
  validateSources: (sources) => invoke("validateSources", sources),
  generateSources: (sources, selectedIds) => invoke("generateSources", sources, selectedIds),
  rendererReady: () => invoke("rendererReady")
};
electron.contextBridge.exposeInMainWorld("api", api);
