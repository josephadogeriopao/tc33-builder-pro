import { app, BrowserWindow, Menu, nativeImage, Notification, Tray } from 'electron'
import { join } from 'node:path'
import { getPreferences } from './settings'
import { channels } from '../shared/channels'

let tray: Tray | undefined
let quitting = false
export const isQuitting = (): boolean => quitting
export const hasTray = (): boolean => !!tray && !tray.isDestroyed()
app.on('before-quit', () => { quitting = true })
app.on('will-quit', () => { tray?.destroy(); tray = undefined })

export function notify(window: BrowserWindow, message: string): void {
  const fallback = () => {
    if (!window.isDestroyed()) window.webContents.send(channels.toast, message)
  }
  if (!getPreferences().notifications || !Notification.isSupported()) return fallback()
  try {
    const notification = new Notification({ title: 'TC33 Builder Pro', body: message })
    notification.on('failed', fallback)
    notification.on('click', () => { if (!window.isDestroyed()) { window.show(); window.focus() } })
    notification.show()
    // Always retain an in-app copy: some desktops silently suppress notifications.
    fallback()
  } catch { fallback() }
}

export function registerTray(window: BrowserWindow): void {
  if (hasTray()) return
  try {
    const image = nativeImage.createFromPath(join(app.getAppPath(), 'resources/icon.png')).resize({ width: 20, height: 20 })
    if (image.isEmpty()) return
    tray = new Tray(image)
    const show = () => { if (!window.isDestroyed()) { window.show(); window.restore(); window.focus() } }
    tray.setToolTip('TC33 Builder Pro')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show TC33 Builder Pro', click: show },
      { label: 'Quit', click: () => app.quit() }
    ]))
    tray.on('click', show)
    window.on('closed', () => { tray?.destroy(); tray = undefined })
  } catch { tray = undefined }
}

export function unregisterTray(): void {
  tray?.destroy()
  tray = undefined
}
