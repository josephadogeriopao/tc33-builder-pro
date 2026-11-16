import { app, BrowserWindow, nativeTheme } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { createMainWindow } from './window'
import { registerIPC } from './ipc'
import { registerAppMenu } from './menu'
import { registerUpdater } from './updater'
import { getSettings } from './settings'
import { registerLogger } from './logger'


function initWindow(): void {
  const mainWindow = createMainWindow()
  registerAppMenu(mainWindow)
  registerUpdater(mainWindow)
}

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  registerLogger()
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0]
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
    nativeTheme.themeSource = getSettings().theme
    registerIPC()
    initWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) initWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})