import { z } from 'zod'

export const themeSchema = z.enum(['light', 'dark', 'system'])
export const settingsSchema = z.object({ theme: themeSchema.default('system') })
export const windowStateSchema = z.object({
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  width: z.number().int().min(600).max(16384).default(1000),
  height: z.number().int().min(500).max(16384).default(800),
  maximized: z.boolean().default(false)
})
export const saveFileSchema = z.tuple([
  z.string().min(1).max(255).refine((name) => !/[\\/\0]/.test(name), 'Use a filename, not a path'),
  z.string().max(10 * 1024 * 1024)
])

export function safeExternalURL(value: string): string | null {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href : null
  } catch { return null }
}

export function updatePercent(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0
}