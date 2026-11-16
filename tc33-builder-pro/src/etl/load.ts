import * as XLSX from 'xlsx'
import log from 'electron-log/renderer'
import { AssessmentReport, AssessmentValues } from '../renderer/src/types/tc33'
import { SheetRow } from '../shared/types'

export function buildTc33Workbook(report: AssessmentReport, outputFileName = 'tc33.xlsx'): void {
  const sheetRows: SheetRow[] = []

  log.info(`Building TC33 workbook... (Total groups: ${report.groups.size})`)

  // 1. Exact Column Headers from valid file
  sheetRows.push([
    'GROUP',
    'DESCRIPTION',
    'UNITS',
    'HOMESTEAD',
    'VETERAN_CREDIT',
    'FIRSTRESPONDER_CREDIT',
    'TOTAL ASSESED',
    'TAXABLE_VALUE'
  ])

  const blankRow: SheetRow = ['', '', '', '', '', '', '', '']

  // Helper to write a Group block with exact spacer rows
  const appendGroupBlock = (groupCode: string): void => {
    const group = report.groups.get(groupCode)
    if (!group) return

    group.items.forEach((item, index) => {
      sheetRows.push([
        index === 0 ? group.rawGroupLabel : '',
        item.rawDescription,
        item.units ?? ' ',
        item.homesteadCredit,
        item.veteranCredit,
        item.firstResponderCredit,
        item.totalAssessed,
        item.taxableValue
      ])
    })

    // Blank spacer row BEFORE the <GROUP> TOTAL row
    sheetRows.push([...blankRow])

    // <GROUP> TOTAL row
    const totals = group.sheetTotalRow ?? group.calculatedTotals
    sheetRows.push([
      `${group.rawGroupLabel} TOTAL`,
      ' ',
      ' ',
      totals.homesteadCredit,
      totals.veteranCredit,
      totals.firstResponderCredit,
      totals.totalAssessed,
      totals.taxableValue
    ])

    // Blank spacer row AFTER the <GROUP> TOTAL row
    sheetRows.push([...blankRow])
  }

  // Helper to write a Cross-Group Summary row with blank credit columns
  const appendSummaryRow = (
    label: string,
    vals?: AssessmentValues,
    includeTaxable = true,
    addTrailingBlankRow = true
  ): void => {
    if (!vals) return
    sheetRows.push([
      '',
      label,
      '',
      '',
      '',
      '',
      vals.totalAssessed,
      includeTaxable ? vals.taxableValue : ''
    ])

    if (addTrailingBlankRow) {
      sheetRows.push([...blankRow])
    }
  }

  // 2. Active Real Estate & Personal Property (Groups 1, 2, 3)
  appendGroupBlock('1')
  appendGroupBlock('2')
  appendGroupBlock('3')

  // Summary row placed immediately after Group 3
  appendSummaryRow('TOTAL PERSONAL PROPERTY', report.summaryRows.totalPersonalProperty, true, true)

  // 3. Public Service (Group 4)
  appendGroupBlock('4')

  // Summary row placed immediately after Group 4
  appendSummaryRow('TOTAL ACTIVE', report.summaryRows.totalActive, true, true)

  // 4. Exempt Groups (Groups 6, 7, 8)
  appendGroupBlock('6')
  appendGroupBlock('7')
  appendGroupBlock('8')

  // Summary row placed at the bottom after Group 8 (no taxable value, no extra trailing row)
  appendSummaryRow('TOTAL EXEMPT', report.summaryRows.totalExempt, false, false)

  // 5. Create Worksheet, Set Column Widths, and Write tc33.xlsx
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows)
  worksheet['!cols'] = [
    { wch: 34 }, // GROUP
    { wch: 42 }, // DESCRIPTION
    { wch: 8 },  // UNITS
    { wch: 15 }, // HOMESTEAD
    { wch: 16 }, // VETERAN_CREDIT
    { wch: 22 }, // FIRSTRESPONDER_CREDIT
    { wch: 18 }, // TOTAL ASSESED
    { wch: 18 }  // TAXABLE_VALUE
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'TC33 Report')
  XLSX.writeFile(workbook, outputFileName)

  log.info(`Successfully exported ${outputFileName}`)
}
