import { log } from '../main/logger'
import {
  AssessmentReport,
  AssessmentValues,
  PsrJsonPayload
} from '../renderer/src/types/tc33'
import type { InputFile } from '../shared/types'
import { extractJsonSchema, extractXlsxFile } from './extract'
import { buildTc33Workbook } from './load'
import {
  mapPsrJsonToAssessmentReport,
  transform,
  TransformResult
} from './transform'

const omitGroups: Set<string> = new Set()
omitGroups.add('7') // EXEMPT - PERSONAL PROPERTY
omitGroups.add('8') // EXEMPT - REAL ESTATE CATEGORY

export interface ValidationPipelineResult extends TransformResult {
  summaryLog: string
  sourceLog: string
}

const toNum = (val: number | string | null | undefined): number => {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0
  if (typeof val !== 'string') return 0
  const parsed = Number(val.replace(/[$,\s]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function compareReports(
  excelReport: AssessmentReport,
  jsonReport: AssessmentReport
): string[] {
  const discrepancies: string[] = []
  // Compare Parish Metadata
  if (jsonReport.district && excelReport.district !== jsonReport.district) {
    discrepancies.push(
      `District mismatch: Excel="${excelReport.district ?? 'none'}", JSON="${jsonReport.district}"`
    )
  }
  if (jsonReport.taxYear && excelReport.taxYear !== jsonReport.taxYear) {
    discrepancies.push(
      `Tax Year mismatch: Excel="${excelReport.taxYear ?? 'none'}", JSON="${jsonReport.taxYear}"`
    )
  }

  // Compare Class Items Group by Group
  jsonReport.groups.forEach((jsonGroup, groupCode) => {
    const cleanCode = String(groupCode).trim()
    log.info("Json group :", JSON.stringify(jsonGroup, null, 2))
    if (omitGroups.has(cleanCode)) {
      log.info(`Omitting group ${cleanCode} from comparison.`)
      return
    }
    const excelGroup = excelReport.groups.get(groupCode)
    log.info("Excel group :", JSON.stringify(excelGroup, null, 2))

    if (!excelGroup) {
      discrepancies.push(`Missing Group line 60 ${cleanCode} in Excel report.`)
      return
    }

    for (const jsonItem of jsonGroup.items) {
      const excelItem = excelGroup.items.find((i) => i.classCode === jsonItem.classCode)
      if (!excelItem) {
        discrepancies.push(`Group ${cleanCode}: Class ${jsonItem.classCode} missing in Excel.`)
        continue
      }

      const fields: (keyof AssessmentValues)[] = [
        'homesteadCredit',
        'veteranCredit',
        'firstResponderCredit',
        'totalAssessed',
        'taxableValue'
      ]

      for (const field of fields) {
        const excelVal = toNum(excelItem[field])
        const jsonVal = toNum(jsonItem[field])
        if (excelVal !== jsonVal) {
          discrepancies.push(
            `Class ${jsonItem.classCode} (${field}): Excel=${excelVal.toLocaleString()} vs JSON=${jsonVal.toLocaleString()}`
          )
        }
      }
    }
  })

  for (const [groupCode, excelGroup] of excelReport.groups) {
    const cleanCode = String(groupCode).trim()
    if (omitGroups.has(cleanCode)) {
      log.info(`Omitting group ${cleanCode} from comparison.`)
      continue
    }
    const jsonGroup = jsonReport.groups.get(groupCode)
    if (!jsonGroup) {
      discrepancies.push(`Missing Group line 94 ${cleanCode} in JSON report.`)
      continue
    }
    const jsonClassCodes = new Set(jsonGroup.items.map((item) => item.classCode))
    for (const excelItem of excelGroup.items) {
      if (!jsonClassCodes.has(excelItem.classCode)) {
        discrepancies.push(`Group ${cleanCode}: Class ${excelItem.classCode} missing in JSON.`)
      }
    }
  }

  return discrepancies
}

export async function runValidationPipeline(
  xlsxFile: InputFile,
  jsonFile: InputFile
): Promise<ValidationPipelineResult> {
  // 1. Extract raw rows (and SQL tab) from Excel and PSR payload from JSON
  const sheet = await extractXlsxFile(xlsxFile)
  const result = transform(sheet.rows, sheet.sqlScript)
  let rawJson: PsrJsonPayload
  try {
    rawJson = await extractJsonSchema<PsrJsonPayload>(jsonFile)
    if (!rawJson || typeof rawJson !== 'object' || !rawJson.PSR || !Array.isArray(rawJson.PSR.ActiveRecap)) {
      throw new Error('The JSON file must contain a PSR object with an ActiveRecap array.')
    }
    if (rawJson.PSR.ActiveRecap.some((item) => !item || typeof item !== 'object' || !String(item.Class ?? '').trim())) {
      throw new Error('Every ActiveRecap entry must include a class code.')
    }
  } catch (error) {
    const errors = [...result.errors, `JSON comparison file could not be read: ${error instanceof Error ? error.message : String(error)}`]
    return {
      ...result,
      isValid: false,
      errors,
      sourceLog: sheet.formattedLog,
      summaryLog: `Validation Failed (${errors.length} issue(s) found):\n${errors.map((item) => `- ${item}`).join('\n')}`
    }
  }

  // 2. Transform Excel rows and map JSON payload into AssessmentReport structures
  const jsonReport = mapPsrJsonToAssessmentReport(rawJson)

  // 3. Compare Excel values against JSON values
  const jsonDiscrepancies = compareReports(result.report, jsonReport)
  log.info(`Found ${jsonDiscrepancies.length} discrepancies between Excel and JSON reports.`)
  log.info("jsonReport: ", jsonReport)
  const allErrors = [...result.errors, ...jsonDiscrepancies]
  const isValid = allErrors.length === 0 && result.report.groups.size > 0

  // 4. Build a readable summary for the UI status box
  const logLines: string[] = []

  if (!isValid) {
    logLines.push(`Validation Failed (${allErrors.length} issue(s) found):`)
    allErrors.forEach((err) => logLines.push(`- ${err}`))
  } else {
    logLines.push(`Validation Passed! All Excel values match JSON (${result.report.groups.size} groups):\n`)

    result.report.groups.forEach((group) => {
      const totalAssessed = group.calculatedTotals.totalAssessed?.toLocaleString() ?? '0'
      const taxableValue = group.calculatedTotals.taxableValue?.toLocaleString() ?? '0'
      logLines.push(
        `Group ${group.groupCode} (${group.groupName}): ${group.items.length} classes | Total Assessed: $${totalAssessed} | Taxable: $${taxableValue}`
      )
    })

    if (result.report.summaryRows.totalActive) {
      logLines.push(
        `\nTotal Active Assessed: $${result.report.summaryRows.totalActive.totalAssessed?.toLocaleString()}`
      )
    }
    if (result.report.summaryRows.totalExempt) {
      logLines.push(
        `Total Exempt Assessed: $${result.report.summaryRows.totalExempt.totalAssessed?.toLocaleString()}`
      )
    }
  }

  return {
    isValid,
    report: result.report,
    errors: allErrors,
    sourceLog: sheet.formattedLog,
    summaryLog: logLines.join('\n')
  }
}

export async function runBuildPipeline(
  report: AssessmentReport,
  outputFileName = 'tc33.xlsx'
): Promise<Uint8Array> {
  return await buildTc33Workbook(report, outputFileName)
}
