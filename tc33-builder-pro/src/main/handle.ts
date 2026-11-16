import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { IPCContract } from '../shared/ipc-contract'
import { assertTrustedSender } from './trust'
import { channels } from '../shared/channels'

export function handle<K extends keyof IPCContract>(
  name: K,
  handler: (event: IpcMainInvokeEvent, ...args: IPCContract[K]['args']) =>
    IPCContract[K]['result'] | Promise<IPCContract[K]['result']>
): void {
  ipcMain.handle(channels[name], (event, ...args: unknown[]) => {
    assertTrustedSender(event)
    // Runtime value validation belongs in each handler; types alone are not a security boundary.
    return handler(event, ...args as IPCContract[K]['args'])
  })
}