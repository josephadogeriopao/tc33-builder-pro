import log from 'electron-log/main'
import { app, dialog } from 'electron'
import { join } from 'node:path'

export function registerLogger(): void {
  log.initialize()
  log.transports.file.resolvePathFn = () => join(app.getPath('logs'), 'main.log')
  log.transports.file.maxSize = 5 * 1024 * 1024
  const level = import.meta.env.MAIN_VITE_LOG_LEVEL
  if (level === 'info' || level === 'warn' || level === 'error') log.transports.file.level = level
  // Log event codes, not arbitrary payloads, filenames, credentials, or user data.
  const fatalError = (event: string) => {
    log.error({ event })
    dialog.showErrorBox('Application error', 'The application encountered an unexpected error and must close. Reopen it to try again.')
    app.exit(1)
  }
  process.on('unhandledRejection', () => fatalError('unhandled-rejection'))
  process.on('uncaughtException', () => fatalError('main-process-crash'))
  app.on('render-process-gone', (_event, _contents, details) => {
    log.error({ event: 'renderer-process-gone', reason: details.reason })
  })
}

export { log }