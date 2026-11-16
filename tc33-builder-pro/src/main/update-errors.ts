import type { UpdateState } from '../shared/types'

type UpdatePhase = 'check' | 'update'
type UpdateLogger = {
  info: (entry: { event: string }) => void
  warn: (entry: { event: string }) => void
}

/**
 * electron-updater 6.8.11 throws ERR_XML_MISSED_ELEMENT for an empty GitHub
 * Atom feed before it reaches its own NO_PUBLISHED_VERSIONS error.
 * Do not classify arbitrary XML failures, HTTP 404s, or wrapped latest-version
 * errors as an empty feed: those can be real network/configuration problems.
 */
export function isEmptyReleaseFeed(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  return code === 'ERR_UPDATER_NO_PUBLISHED_VERSIONS' ||
    (code === 'ERR_XML_MISSED_ELEMENT' && message === 'No published versions on GitHub')
}

export function createUpdateErrorReporter(
  sendState: (state: UpdateState) => void,
  logger: UpdateLogger
) {
  return (error: unknown, phase: UpdatePhase): void => {
    if (isEmptyReleaseFeed(error)) {
      logger.info({ event: 'update-feed-not-configured' })
      sendState({ status: 'not-configured' })
      return
    }
    logger.warn({ event: phase === 'check' ? 'update-check-failed' : 'update-failed' })
    sendState({
      status: 'error',
      message: phase === 'check'
        ? 'Unable to check for updates. Please try again later.'
        : 'The update could not finish. Please try again later.'
    })
  }
}

export async function performUpdateCheck(
  check: () => Promise<unknown>,
  reportError: (error: unknown, phase: UpdatePhase) => void
): Promise<void> {
  try { await check() }
  catch (error) { reportError(error, 'check') }
}