import { app, BrowserWindow, dialog, nativeTheme } from 'electron'
import { basename } from 'node:path'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { channels } from '../shared/channels'
import { getSettings, setTheme } from './settings'
import { assertTrustedSender } from './trust'
import { saveFileSchema, themeSchema } from '../shared/validation'
import { handle } from './handle'

export function registerIPC(): void {

  handle('getVersion', (event) => { assertTrustedSender(event); return app.getVersion() })
  handle('getSettings', (event) => { assertTrustedSender(event); return getSettings() })
  handle('setTheme', (event, theme: unknown) => {
    assertTrustedSender(event)
    return setTheme(themeSchema.parse(theme))
  })
  nativeTheme.on('updated', () => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(channels.themeChanged, nativeTheme.shouldUseDarkColors)
    }
  })

  handle('openFile', async (event) => {
    assertTrustedSender(event)
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null

    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const filePath = result.filePaths[0]
    const info = await stat(filePath)
    if (!info.isFile() || info.size > 10 * 1024 * 1024) throw new Error('Select a text file smaller than 10 MB')
    event.sender.send(channels.toast, 'File opened successfully')
    return {
      path: filePath,
      name: basename(filePath),
      text: await readFile(filePath, 'utf8')
    }
  })

  handle('saveFile', async (event, defaultName: string, content: string) => {
    assertTrustedSender(event)
    saveFileSchema.parse([defaultName, content])
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return false

    const result = await dialog.showSaveDialog(window, { defaultPath: defaultName })
    if (result.canceled || !result.filePath) return false

    await writeFile(result.filePath, content, 'utf8')
    return true
  })
}