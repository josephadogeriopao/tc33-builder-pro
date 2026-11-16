import { BrowserWindow } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { is } from '@electron-toolkit/utils'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const frame = event.senderFrame
  const expected = is.dev && process.env.ELECTRON_RENDERER_URL
    ? process.env.ELECTRON_RENDERER_URL
    : pathToFileURL(join(__dirname, '../renderer/index.html')).href
  const normalize = (value: string) => {
    const url = new URL(value)
    url.hash = ''
    return url.href
  }
  if (!BrowserWindow.fromWebContents(event.sender) || !frame ||
      frame !== event.sender.mainFrame || normalize(frame.url) !== normalize(expected)) {
    throw new Error('Untrusted IPC sender')
  }
}