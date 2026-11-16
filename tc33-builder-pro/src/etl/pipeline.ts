import { AssessmentReport } from '../renderer/src/types/tc33'
import { extractJsonSchema, extractXlsxFile } from './extract'
import { buildTc33Workbook } from './load'
import { transform, TransformResult } from './transform'

export interface ValidationPipelineResult extends TransformResult {
  summaryLog: string
}

export async function runValidationPipeline(
  xlsxFile: File,
  jsonFile: File
): Promise<ValidationPipelineResult> {
  // 1. Extract raw rows from Excel and rules from JSON
  const sheet = await extractXlsxFile(xlsxFile)
  const schema = await extractJsonSchema(jsonFile)
  console.log('Loaded JSON schema:', schema)

  // 2. Transform raw rows into a structured AssessmentReport
  const result = transform(sheet.rows)

  // 3. Build a readable summary for the UI status box
  const logLines: string[] = []

  if (!result.isValid) {
    logLines.push('Validation Failed:')
    result.errors.forEach((err) => logLines.push(`- ${err}`))
  } else {
    logLines.push(`Validation Passed! Parsed ${result.report.groups.size} property groups:\n`)

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
    ...result,
    summaryLog: logLines.join('\n')
  }
}

export async function runBuildPipeline(
  report: AssessmentReport,
  sourceFileName: string,
  isBlockBorder = true
): Promise<string> {
  const outputFileName = 'tc33.xlsx'
  await buildTc33Workbook(report)
  return `Success! Exported "${outputFileName}" from "${sourceFileName}" (${report.groups.size} groups) with bold text and thick block borders.`
}

