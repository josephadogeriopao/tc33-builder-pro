import { app, BrowserWindow, Menu, shell } from 'electron'
import { checkForUpdates } from './updater'
import { channels } from '../shared/channels'

export function registerAppMenu(mainWindow: BrowserWindow): void {
  const isMac = process.platform === 'darwin'
  const sendCommand = (value: string) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channels.command, value)
    }
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'Import Excel / JSON…', accelerator: 'CmdOrCtrl+O', click: () => sendCommand('open') },
        { label: 'Validate batch', click: () => sendCommand('validate') },
        { type: 'separator' },
        { label: 'Generate TC-33 workbook(s)', accelerator: 'CmdOrCtrl+Shift+G', click: () => sendCommand('generate') },
        { label: 'Preferences…', accelerator: 'CmdOrCtrl+,', click: () => sendCommand('preferences') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' as const },
              { role: 'delete' as const },
              { role: 'selectAll' as const }
            ]
          : [
              { role: 'delete' as const },
              { type: 'separator' as const },
              { role: 'selectAll' as const }
            ]),
        { type: 'separator' },
        { label: 'Command palette', accelerator: 'CmdOrCtrl+K', click: () => sendCommand('palette') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
              { type: 'separator' as const },
              { role: 'window' as const }
            ]
          : [{ role: 'close' as const }])
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://electronjs.org')
        },
        {
          label: 'Check for Updates…',
          click: () => { void checkForUpdates() }
        },
        ...(!isMac
          ? [
              { type: 'separator' as const },
              { role: 'about' as const }
            ]
          : [])
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}