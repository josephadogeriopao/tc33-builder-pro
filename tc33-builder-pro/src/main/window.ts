import { app, BrowserWindow, screen, shell, session, dialog } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { is } from '@electron-toolkit/utils'
import { safeExternalURL } from '../shared/validation'
import { getWindowState, saveWindowState, getPreferences } from './settings'
import { hasTray, isQuitting } from './desktop'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function createMainWindow(): BrowserWindow {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

  const resourcesDir = join(app.getAppPath(), 'resources')

  const appIcon =
    process.platform === 'win32'
      ? join(resourcesDir, 'icon.ico')
      : join(resourcesDir, 'icon.png')

  const saved = getWindowState()
  const visible = saved.x !== undefined && saved.y !== undefined &&
    screen.getAllDisplays().some(({ workArea: a }) =>
      saved.x! >= a.x && saved.y! >= a.y && saved.x! < a.x + a.width - 80 && saved.y! < a.y + a.height - 80)
  const mainWindow = new BrowserWindow({
    width: Math.min(saved.width, screenWidth),
    height: Math.min(saved.height, screenHeight),
    ...(visible ? { x: saved.x, y: saved.y } : {}),
    minWidth: 600,
    minHeight: 500,
    maxWidth: Math.round(screenWidth / 1.5),
    maxHeight: screenHeight,
    show: false,
    frame: false,
    title: 'TC33 Builder Pro',
    backgroundColor: '#182c40',
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (saved.maximized) mainWindow.maximize()
  const splash = new BrowserWindow({
    width: 420, height: 260, frame: false, resizable: false, show: false,
    backgroundColor: '#182c40',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  const splashStartedAt = Date.now()
  let revealRequested = false
  let revealDelay: ReturnType<typeof setTimeout> | undefined
  void splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
    '<!doctype html><html lang="en"><title>Starting TC33</title><body style="background:#182c40;color:#fff;font:20px system-ui;text-align:center;padding:60px 10px"><h1 style="color:#ffb45e">TC33 Builder Pro</h1><p role="status">Opening your workspace…</p></body></html>'
  ))
  splash.once('ready-to-show', () => { if (!splash.isDestroyed()) splash.show() })
  const showMainWindow = () => {
    clearTimeout(timeout)
    if (!splash.isDestroyed()) splash.destroy()
    if (!mainWindow.isDestroyed()) mainWindow.show()
  }
  const reveal = () => {
    if (revealRequested) return
    revealRequested = true
    const remaining = Math.max(0, 2500 - (Date.now() - splashStartedAt))
    if (remaining) revealDelay = setTimeout(showMainWindow, remaining)
    else showMainWindow()
  }
  const timeout = setTimeout(reveal, 8000)
  mainWindow.once('ready-to-show', reveal)
  mainWindow.once('closed', () => {
    clearTimeout(timeout)
    if (revealDelay) clearTimeout(revealDelay)
    if (!splash.isDestroyed()) splash.destroy()
  })
  mainWindow.webContents.once('did-fail-load', reveal)
  mainWindow.webContents.on('render-process-gone', () => {
    if (mainWindow.isDestroyed()) return
    void dialog.showMessageBox(mainWindow, {
      type: 'error', title: 'Display process stopped',
      message: 'The application display stopped unexpectedly.',
      detail: 'Reload the window to recover, or close the application.',
      buttons: ['Reload', 'Close'], defaultId: 0, cancelId: 1
    }).then(({ response }) => {
      if (mainWindow.isDestroyed()) return
      if (response === 0) mainWindow.reload()
      else mainWindow.close()
    }).catch(() => {})
  })
  mainWindow.on('close', (event) => {
    saveWindowState({ ...mainWindow.getNormalBounds(), maximized: mainWindow.isMaximized() })
    if (!isQuitting() && getPreferences().minimizeToTray && hasTray()) {
      event.preventDefault()
      mainWindow.hide()
    }
  })
  mainWindow.on('minimize', () => {
    if (getPreferences().minimizeToTray && hasTray()) mainWindow.hide()
  })

  const openExternal = (value: string) => {
    const url = safeExternalURL(value)
    if (url) void shell.openExternal(url).catch(() => {})
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] !== mainWindow.webContents.getURL().split('#')[0]) {
      event.preventDefault()
      openExternal(url)
    }
  })

  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const development = is.dev && !!process.env.ELECTRON_RENDERER_URL
    const devOrigin = development ? new URL(process.env.ELECTRON_RENDERER_URL!).origin : ''
    const devSocket = devOrigin.replace(/^http/, 'ws')
    const policy = [
      "default-src 'self'", `script-src 'self'${development ? " 'unsafe-inline'" : ''}`,
      "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "font-src 'self'",
      `connect-src 'self'${development ? ` ${devOrigin} ${devSocket}` : ''}`,
      "object-src 'none'", "base-uri 'none'", "frame-src 'none'", "form-action 'none'"
    ].join('; ')
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [policy] } })
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}