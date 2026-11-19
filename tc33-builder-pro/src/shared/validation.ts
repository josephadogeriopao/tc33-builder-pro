import { z } from 'zod'

export const themeSchema = z.enum(['light', 'dark', 'black', 'system'])
export const preferencesSchema = z.object({
  theme: themeSchema.default('light'),
  minimizeToTray: z.boolean().default(false),
  notifications: z.boolean().default(false),
  filename: z.string().trim().min(1).max(100)
    .refine((name) => !/[\\/:*?"<>|\0]/.test(name) && !name.endsWith('.'), 'Use a valid filename without an extension').default('tc33'),
  dateFormat: z.enum(['none', 'YYYY-MM-DD', 'MM-DD-YYYY', 'YYYYMMDD']).default('none'),
  defaultDistrict: z.string().regex(/^\d?$/, 'District must be one digit').default(''),
  defaultTaxYear: z.string().regex(/^(|\d{4})$/, 'Tax year must be four digits').default(''),
  jsonFilename: z.string().trim().max(100).refine(
    (name) => !/[\\/:*?"<>|\0]/.test(name) && !name.endsWith('.'),
    'Use a valid filename without an extension'
  ).default('')
})
export const activitySchema = z.object({
  action: z.string().max(80), file: z.string().max(255), detail: z.string().max(500)
})
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