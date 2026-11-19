import { dialog, BrowserWindow } from 'electron'
import { File } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import { runValidationPipeline, runBuildPipeline } from '../etl/pipeline'
import { extractXlsxFile } from '../etl/extract'
import { transform } from '../etl/transform'
import type { AssessmentReport } from '../renderer/src/types/tc33'
import type { BatchGenerationResult, BatchSource, BatchValidationResult } from '../shared/types'
import { getPreferences } from './settings'

function validateBatch(sources: BatchSource[]): void {
  if (!Array.isArray(sources) || sources.length > 50) throw new Error('Choose at most 50 source files.')
  let totalBytes = 0
  for (const source of sources) {
    if (!source || typeof source.name !== 'string' || source.name.length > 255 ||
      !/\.(xlsx|json)$/i.test(source.name) || !(source.bytes instanceof Uint8Array)) {
      throw new Error('Choose valid .xlsx and .json source files.')
    }
    if (source.bytes.byteLength > 25 * 1024 * 1024) throw new Error('Each source file must be smaller than 25 MB.')
    totalBytes += source.bytes.byteLength
  }
  if (totalBytes > 100 * 1024 * 1024) throw new Error('Select files with a combined size under 100 MB.')
}

function asFile(source: BatchSource): File {
  return new File([Buffer.from(source.bytes)], source.name)
}

function matchingJson(excel: BatchSource, jsonFiles: BatchSource[]): BatchSource {
  const matching = jsonFiles.find((source) =>
    source.name.replace(/\.json$/i, '').toLowerCase() === excel.name.replace(/\.xlsx$/i, '').toLowerCase()
  )
  return matching ?? jsonFiles[0]
}

export async function validateSources(sources: BatchSource[]): Promise<BatchValidationResult[]> {
  validateBatch(sources)
  const excelFiles = sources.filter((source) => /\.xlsx$/i.test(source.name))
  const jsonFiles = sources.filter((source) => /\.json$/i.test(source.name))
  if (!excelFiles.length || !jsonFiles.length) throw new Error('Import at least one Excel workbook and one JSON comparison file.')
  const results: BatchValidationResult[] = []
  for (const excel of excelFiles) {
    const json = matchingJson(excel, jsonFiles)
    try {
      const result = await runValidationPipeline(asFile(excel), asFile(json))
      results.push({
        file: excel.name,
        comparedTo: json.name,
        isValid: result.isValid,
        summaryLog: result.summaryLog,
        sourceLog: result.sourceLog,
        errors: result.errors
      })
    } catch (error) {
      let sourceLog = ''
      try { sourceLog = (await extractXlsxFile(asFile(excel))).formattedLog } catch { /* the workbook itself could not be read */ }
      results.push({
        file: excel.name,
        comparedTo: json.name,
        isValid: false,
        summaryLog: String(error),
        sourceLog,
        errors: [String(error)]
      })
    }
  }
  return results
}

function buildName(base: string, source: BatchSource, count: number): string {
  const date = getPreferences().dateFormat
  let dateSuffix = ''
  if (date !== 'none') {
    const now = new Date()
    const y = String(now.getFullYear()), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0')
    dateSuffix = date === 'YYYY-MM-DD' ? `-${y}-${m}-${d}` : date === 'MM-DD-YYYY' ? `-${m}-${d}-${y}` : `-${y}${m}${d}`
  }
  const safeBase = base.trim().replace(/[\\/:*?"<>|\0]/g, '').slice(0, 100) || 'tc33'
  const safeSource = source.name.replace(/\.xlsx$/i, '').replace(/[\\/:*?"<>|\0]/g, '-').slice(0, 100)
  return `${safeBase}${dateSuffix}${count > 1 ? `-${safeSource}` : ''}.xlsx`
}

export async function generateSources(
  window: BrowserWindow,
  sources: BatchSource[],
  selectedIds: string[]
): Promise<BatchGenerationResult[]> {
  validateBatch(sources)
  if (!selectedIds.length) throw new Error('Select at least one Excel workbook.')
  const selected = new Set(selectedIds)
  const excelFiles = sources.filter((source) =>
    /\.xlsx$/i.test(source.name) && Boolean(source.id && selected.has(source.id))
  )
  if (!excelFiles.length) throw new Error('No selected Excel workbooks were found in the imported batch.')
  const preferences = getPreferences()
  const results: BatchGenerationResult[] = []
  for (const source of excelFiles) {
    try {
      const extracted = await extractXlsxFile(asFile(source))
      const transformed = transform(extracted.rows, extracted.sqlScript)
      if (transformed.errors.length || !transformed.report.groups.size) {
        results.push({ file: source.name, saved: false, message: transformed.errors.join('; ') || 'No property groups found.' })
        continue
      }
      const report: AssessmentReport = {
        ...transformed.report,
        district: transformed.report.district || preferences.defaultDistrict,
        taxYear: transformed.report.taxYear || preferences.defaultTaxYear
      }
      if (!report.district || !report.taxYear) {
        results.push({ file: source.name, saved: false, message: 'Set a default District and Tax Year in Preferences, or add them to the workbook SQL tab.' })
        continue
      }
      const name = buildName(preferences.filename, source, excelFiles.length)
      const bytes = await runBuildPipeline(report, name)
      const selection = await dialog.showSaveDialog(window, { defaultPath: name })
      if (selection.canceled || !selection.filePath) {
        results.push({ file: source.name, saved: false, message: 'Save cancelled.' })
        continue
      }
      await writeFile(selection.filePath, bytes)
      results.push({ file: source.name, saved: true, message: `Saved TC-33 workbook for District ${report.district}, Tax Year ${report.taxYear}.` })
    } catch (error) {
      results.push({ file: source.name, saved: false, message: String(error) })
    }
  }
  return results
}
