import {
  AssessmentReport,
  AssessmentValues,
  PsrJsonPayload
} from '../renderer/src/types/tc33'
import { extractJsonSchema, extractXlsxFile } from './extract'
import { buildTc33Workbook } from './load'
import {
  mapPsrJsonToAssessmentReport,
  transform,
  TransformResult
} from './transform'
import log from 'electron-log/renderer'

export interface ValidationPipelineResult extends TransformResult {
  summaryLog: string
}

const toNum = (val: number | string | null | undefined): number =>
  typeof val === 'number' ? val : 0

export function compareReports(
  excelReport: AssessmentReport,
  jsonReport: AssessmentReport
): string[] {
  const discrepancies: string[] = []
  log.info('Comparing Excel report against JSON report.')
  log.info('Excel report tax year:', excelReport.taxYear)
  log.info('Excel report district:', excelReport.district)
  log.info('JSON report tax year:', jsonReport.taxYear)
  log.info('JSON report district:', jsonReport.district)

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
    const excelGroup = excelReport.groups.get(groupCode)
    if (!excelGroup) {
      discrepancies.push(`Missing Group ${groupCode} in Excel report.`)
      return
    }

    for (const jsonItem of jsonGroup.items) {
      const excelItem = excelGroup.items.find((i) => i.classCode === jsonItem.classCode)
      if (!excelItem) {
        discrepancies.push(`Group ${groupCode}: Class ${jsonItem.classCode} missing in Excel.`)
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

  return discrepancies
}

export async function runValidationPipeline(
  xlsxFile: File,
  jsonFile: File
): Promise<ValidationPipelineResult> {
  // 1. Extract raw rows (and SQL tab) from Excel and PSR payload from JSON
  const sheet = await extractXlsxFile(xlsxFile)
  const rawJson = await extractJsonSchema<PsrJsonPayload>(jsonFile)

  // 2. Transform Excel rows and map JSON payload into AssessmentReport structures
  const result = transform(sheet.rows, sheet.sqlScript)
  const jsonReport = mapPsrJsonToAssessmentReport(rawJson)

  // 3. Compare Excel values against JSON values
  const jsonDiscrepancies = compareReports(result.report, jsonReport)
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
    summaryLog: logLines.join('\n')
  }
}

export async function runBuildPipeline(
  report: AssessmentReport,
  sourceFileName: string
): Promise<string> {
  const outputFileName = 'tc33.xlsx'
  await buildTc33Workbook(report, outputFileName)
  return `Success! Exported "${outputFileName}" from "${sourceFileName}" (${report.groups.size} groups) for District ${report.district}, Tax Year ${report.taxYear}.`
}
