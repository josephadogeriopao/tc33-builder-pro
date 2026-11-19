import { writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { DroppedSource } from '../shared/types'

const windowsReservedName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

export async function saveDroppedSource(directory: string, source: DroppedSource): Promise<string> {
  const extension = extname(source.name)
  if (
    !extension ||
    !/\.(xlsx|json)$/i.test(extension) ||
    /[\\/:*?"<>|\0-\x1f]/.test(source.name) ||
    windowsReservedName.test(source.name)
  ) {
    throw new Error('Dropped source filename is not safe to save.')
  }

  const stem = source.name.slice(0, -extension.length)
  for (let duplicate = 1; duplicate <= 10_000; duplicate += 1) {
    const suffix = duplicate === 1 ? '' : ` (${duplicate})`
    const availableStemLength = Math.max(1, 255 - extension.length - suffix.length)
    const candidateName = `${stem.slice(0, availableStemLength)}${suffix}${extension}`
    const filePath = join(directory, candidateName)
    try {
      await writeFile(filePath, Buffer.from(source.bytes), { flag: 'wx' })
      return filePath
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
  throw new Error(`Could not create a unique filename for ${source.name}.`)
}
