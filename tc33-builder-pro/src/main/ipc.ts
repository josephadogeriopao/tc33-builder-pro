import { app, BrowserWindow, dialog, nativeTheme } from 'electron'
import { basename, join } from 'node:path'
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { channels } from '../shared/channels'
import { getSettings, setTheme, getWorkspace, setPreferences, rememberFile, removeRecentFile, recordActivity, clearHistory } from './settings'
import { notify, registerTray, unregisterTray } from './desktop'
import { z } from 'zod'
import { assertTrustedSender } from './trust'
import { saveFileSchema, themeSchema } from '../shared/validation'
import { handle } from './handle'
import { generateSources, validateSources } from './tasks'
import { extractPsrMetadata } from '../etl/transform'
import type { DroppedSource, MismatchExportFormat } from '../shared/types'
import { buildMismatchExport } from './mismatch-export'
import { saveDroppedSource } from './dropped-sources'

export function registerIPC(): void {
  async function readSource(filePath: string, displayName?: string) {
    if (!/\.(xlsx|json)$/i.test(filePath)) throw new Error('Select .xlsx or .json files')
    const info = await stat(filePath)
    if (!info.isFile() || info.size > 25 * 1024 * 1024) throw new Error('Each source must be smaller than 25 MB')
    const bytes = await readFile(filePath)
    const name = displayName ?? basename(filePath)
    let metadata
    if (/\.json$/i.test(name)) {
      try { metadata = extractPsrMetadata(JSON.parse(bytes.toString('utf8'))) }
      catch { metadata = undefined }
    }
    rememberFile({ name, path: filePath, openedAt: new Date().toISOString() })
    return { name, path: filePath, bytes: new Uint8Array(bytes), ...(metadata ? { metadata } : {}) }
  }
  handle('getWorkspace', () => getWorkspace())
  handle('setPreferences', (event, input) => {
    const preferences = setPreferences(input)
    const window = BrowserWindow.fromWebContents(event.sender)
    if (preferences.minimizeToTray && window) registerTray(window)
    else unregisterTray()
    return preferences
  })
  handle('windowControl', (event, action) => {
    z.enum(['minimize', 'maximize', 'close']).parse(action)
    const window = BrowserWindow.fromWebContents(event.sender)!
    if (action === 'minimize') window.minimize()
    if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize()
    if (action === 'close') window.close()
  })
  handle('rendererReady', () => {})
  handle('validateSources', (_event, sources) => validateSources(sources))
  handle('generateSources', (event, sources, selectedIds) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('The app window is unavailable.')
    z.array(z.string().max(4096)).min(1).max(50).parse(selectedIds)
    return generateSources(window, sources, selectedIds)
  })
  handle('openSources', async (event, kind = 'all') => {
    z.enum(['all', 'json']).parse(kind)
    const window = BrowserWindow.fromWebContents(event.sender)!
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: kind === 'json' ? 'PSR JSON schema' : 'TC33 sources', extensions: kind === 'json' ? ['json'] : ['xlsx', 'json'] }]
    })
    if (result.canceled) return []
    if (result.filePaths.length > 50) throw new Error('Import at most 50 files at once')
    const filesInfo = await Promise.all(result.filePaths.map((path) => stat(path)))
    if (filesInfo.reduce((total, file) => total + file.size, 0) > 100 * 1024 * 1024) {
      throw new Error('Select files with a combined size under 100 MB')
    }
    const files = []
    for (const path of result.filePaths) files.push(await readSource(path))
    return files
  })
  handle('importDroppedSources', async (_event, input: DroppedSource[]) => {
    if (!Array.isArray(input) || input.length > 50) throw new Error('Drop at most 50 source files at once.')
    let totalBytes = 0
    for (const source of input) {
      if (!source || typeof source.name !== 'string' || source.name.length > 255 ||
          !/\.(xlsx|json)$/i.test(source.name) || !(source.bytes instanceof Uint8Array)) {
        throw new Error('Drop valid .xlsx and .json source files.')
      }
      if (source.bytes.byteLength > 25 * 1024 * 1024) throw new Error('Each source file must be smaller than 25 MB.')
      totalBytes += source.bytes.byteLength
    }
    if (totalBytes > 100 * 1024 * 1024) throw new Error('Select files with a combined size under 100 MB.')
    const importDirectory = join(app.getPath('userData'), 'dropped-sources')
    await mkdir(importDirectory, { recursive: true })
    const files = []
    for (const source of input) {
      const filePath = await saveDroppedSource(importDirectory, source)
      files.push(await readSource(filePath, basename(source.name)))
    }
    return files
  })
  handle('reopenSource', (_event, filePath) => {
    z.string().max(4096).parse(filePath)
    if (!getWorkspace().recent.some((file) => file.path === filePath)) throw new Error('File is not in recent history. Import it again.')
    return readSource(filePath)
  })
  handle('removeRecentFile', (_event, filePath) => {
    z.string().min(1).max(4096).parse(filePath)
    return removeRecentFile(filePath)
  })
  handle('recordActivity', (event, input) => {
    const state = recordActivity(input)
    notify(BrowserWindow.fromWebContents(event.sender)!, `${input.action}: ${input.file}`)
    return state
  })
  handle('clearHistory', () => clearHistory())
  handle('saveExport', async (event, name, bytes) => {
    z.string().min(1).max(180).regex(/^[^\\/:*?"<>|\0]+\.(xlsx|pdf|docx)$/i).parse(name)
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > 100 * 1024 * 1024) throw new Error('Invalid export data')
    const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender)!, { defaultPath: name })
    if (result.canceled || !result.filePath) return false
    await writeFile(result.filePath, bytes)
    return true
  })
  handle('exportMismatches', async (event, format, name, issues) => {
    const supportedFormats = ['pdf', 'docx', 'xlsx', 'csv', 'json', 'txt'] as const
    z.enum(supportedFormats).parse(format)
    z.string().min(1).max(180).regex(/^[^\\/:*?"<>|\0]+\.(pdf|docx|xlsx|csv|json|txt)$/i).parse(name)
    z.array(z.string().max(2000)).max(1000).parse(issues)
    const window = BrowserWindow.fromWebContents(event.sender)!
    const bytes = await buildMismatchExport(format, issues)
    const result = await dialog.showSaveDialog(window, { defaultPath: name })
    if (result.canceled || !result.filePath) return false
    await writeFile(result.filePath, bytes)
    return true
  })

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