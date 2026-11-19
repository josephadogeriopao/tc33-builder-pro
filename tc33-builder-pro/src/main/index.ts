import { app, BrowserWindow, nativeTheme } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { createMainWindow } from './window'
import { registerIPC } from './ipc'
import { registerAppMenu } from './menu'
import { registerUpdater } from './updater'
import { getPreferences } from './settings'
import { registerTray } from './desktop'
import { registerLogger } from './logger'
import fs from 'fs'

process.on('uncaughtException', (err) => {
  fs.writeFileSync('crash.txt', `UNCAUGHT EXCEPTION:\n${err.stack || err}`)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  fs.writeFileSync('crash.txt', `UNHANDLED REJECTION:\n${reason instanceof Error ? reason.stack || reason.message : String(reason)}`)
  process.exit(1)
})



function initWindow(): void {
  const mainWindow = createMainWindow()
  registerAppMenu(mainWindow)
  registerUpdater(mainWindow)
  if (getPreferences().minimizeToTray) registerTray(mainWindow)
}

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  registerLogger()
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'TC33 Builder Pro')
    if (!window) {
      if (app.isReady()) initWindow()
      return
    }
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.josephadogeridev.electronapp')
    const theme = getPreferences().theme
    nativeTheme.themeSource = theme === 'black' ? 'dark' : theme
    registerIPC()
    initWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) initWindow()
      else BrowserWindow.getAllWindows().forEach((window) => window.show())
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})