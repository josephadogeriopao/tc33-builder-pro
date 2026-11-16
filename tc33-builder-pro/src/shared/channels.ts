export const channels = {
  openFile: 'app:open-file',
  saveFile: 'app:save-file',
  command: 'app:command',
  updateStatus: 'update:status',
  installUpdate: 'update:install',
  getVersion: 'app:get-version',
  checkForUpdates: 'update:check',
  getUpdateState: 'update:get-state',
  getSettings: 'settings:get',
  setTheme: 'settings:set-theme',
  themeChanged: 'theme:changed',
  toast: 'app:toast'
} as const