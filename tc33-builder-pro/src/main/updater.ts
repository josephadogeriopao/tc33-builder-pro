import log from 'electron-log'
import { app, BrowserWindow } from 'electron'
import updater from 'electron-updater'
import { channels } from '../shared/channels'
import { UpdateState } from '../shared/types'
import { updatePercent } from '../shared/validation'
import { handle } from './handle'
import { assertTrustedSender } from './trust'
import { createUpdateErrorReporter, performUpdateCheck } from './update-errors'


const { autoUpdater } = updater

let registered = false
let state: UpdateState = { status: 'idle' }

function sendState(next: UpdateState): void {
  state = next
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channels.updateStatus, state)
  }
}

const reportUpdateError = createUpdateErrorReporter(sendState, log)

export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) {
    sendState({ status: 'not-available' })
    return
  }
  await performUpdateCheck(() => autoUpdater.checkForUpdates(), reportUpdateError)
}

export function registerUpdater(_mainWindow: BrowserWindow): void {
  if (registered) return
  registered = true
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = log
  autoUpdater.on('checking-for-update', () => sendState({ status: 'checking' }))
  autoUpdater.on('update-available', (info) => sendState({ status: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => sendState({ status: 'not-available' }))
  autoUpdater.on('download-progress', (progress) =>
    sendState({ status: 'downloading', percent: updatePercent(progress.percent) }))
  autoUpdater.on('update-downloaded', (info) => sendState({ status: 'downloaded', version: info.version }))
  // A failed check both emits an error event and rejects its promise.
  // Both paths must classify the empty-feed case identically.
  autoUpdater.on('error', (error) =>
    reportUpdateError(error, state.status === 'checking' ? 'check' : 'update'))

  handle('getUpdateState', (event) => { assertTrustedSender(event); return state })
  handle('checkForUpdates', (event) => {
    assertTrustedSender(event)
    return checkForUpdates()
  })
  handle('installUpdate', async (event) => {
    assertTrustedSender(event)
    if (!app.isPackaged || state.status !== 'downloaded') throw new Error('No downloaded update is ready')
    const previous = state
    sendState({ status: 'installing' })
    // Let the renderer paint the restart notice; installation continues in the native installer after exit.
    await new Promise((resolve) => setTimeout(resolve, 400))
    try { autoUpdater.quitAndInstall() }
    catch {
      sendState(previous)
      throw new Error('Unable to restart for installation')
    }
  })
  if (app.isPackaged) void checkForUpdates()
}