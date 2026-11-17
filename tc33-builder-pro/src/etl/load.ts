import ExcelJS from 'exceljs'
import log from 'electron-log/renderer'
import { AssessmentReport, AssessmentValues } from '../renderer/src/types/tc33'

export interface WorkbookHeaderOptions {
  district?: string
  taxYear?: string
}

export async function buildTc33Workbook(
  report: AssessmentReport,
  outputFileName = 'tc33.xlsx',
  headerOptions?: WorkbookHeaderOptions
): Promise<void> {
  // Resolve from user input or SQL-parsed metadata (no hardcoded defaults)
  const district = (headerOptions?.district ?? report.district ?? '').trim()
  const taxYear = (headerOptions?.taxYear ?? report.taxYear ?? '').trim()

  if (!district || !taxYear) {
    const missing: string[] = []
    if (!district) missing.push('District')
    if (!taxYear) missing.push('Tax Year')
    throw new Error(`Missing required report metadata: ${missing.join(' and ')}. Please enter them before exporting.`)
  }

  log.info(`Building TC33 workbook for District ${district}, Tax Year ${taxYear}... (Total groups: ${report.groups.size})`)

  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('TC33 Report', {
    views: [
      {
        state: 'frozen',
        ySplit: 1
      }
    ],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: '1:1',
      margins: {
        left: 0.5,
        right: 0.5,
        top: 1.0,
        bottom: 0.75,
        header: 0.3,
        footer: 0.3
      }
    },
    headerFooter: {
      oddHeader:
        '&L&"Aptos Narrow,Bold"&11&K000000ORLEANS PARISH ASSESSOR\'S OFFICE\n' +
        '&"Aptos Narrow,Bold"&11&K000000TC-33 ACTIVE RECAP\n' +
        `&"Aptos Narrow,Bold"&11&K000000DISTRICT ${district}- TAX YEAR ${taxYear}`
    }
  })

  // Column widths matching
  worksheet.columns = [
    { width: 34 }, // A: GROUP
    { width: 42 }, // B: DESCRIPTION
    { width: 8 },  // C: UNITS
    { width: 15 }, // D: HOMESTEAD_CREDIT
    { width: 16 }, // E: VETERAN_CREDIT
    { width: 22 }, // F: FIRSTRESPONDER_CREDIT
    { width: 18 }, // G: TOTAL ASSESSED
    { width: 18 }  // H: TAXABLE_VALUE
  ]

  const baseFont: Partial<ExcelJS.Font> = { name: 'Aptos Narrow', size: 11 }
  const boldFont: Partial<ExcelJS.Font> = { name: 'Aptos Narrow', size: 11, bold: true }

  const applyNumberFormat = (row: ExcelJS.Row): void => {
    for (let col = 4; col <= 8; col++) {
      const cell = row.getCell(col)
      if (typeof cell.value === 'number') {
        cell.numFmt = '#,##0'
      }
      cell.alignment = { horizontal: 'right' }
    }
  }

  // Helper to apply a bold box border only around non-zero, non-dash value cells
  const applyValueBlockBorder = (row: ExcelJS.Row, startCol = 4, endCol = 8): void => {
    const borderStyle: Partial<ExcelJS.Border> = { style: 'medium', color: { argb: 'FF000000' } }

    for (let col = startCol; col <= endCol; col++) {
      const cell = row.getCell(col)
      const val = cell.value

      if (val === null || val === undefined) continue
      const strVal = String(val).trim()
      if (strVal === '' || strVal === '-') continue

      cell.border = {
        top: borderStyle,
        bottom: borderStyle,
        left: borderStyle,
        right: borderStyle
      }
    }
  }

  // 1. Header Row (Bold, no borders)
  const headerRow = worksheet.addRow([
    'GROUP',
    'DESCRIPTION',
    'UNITS',
    'HOMESTEAD',
    'VETERAN_CREDIT',
    'FIRSTRESPONDER_CREDIT',
    'TOTAL ASSESED',
    'TAXABLE_VALUE'
  ])
  headerRow.eachCell((cell, colNumber) => {
    cell.font = boldFont
    cell.alignment = { horizontal: colNumber >= 4 ? 'right' : 'left' }
  })

  const addBlankRow = (): void => {
    worksheet.addRow(['', '', '', '', '', '', '', ''])
  }

  // 2. Helper to write each Group block
  const appendGroupBlock = (groupCode: string, hasBlockBorder = false): void => {
    const group = report.groups.get(groupCode)
    if (!group) return

    group.items.forEach((item, index) => {
      const dataRow = worksheet.addRow([
        index === 0 ? group.rawGroupLabel : '',
        item.rawDescription,
        item.units ?? ' ',
        item.homesteadCredit,
        item.veteranCredit,
        item.firstResponderCredit,
        item.totalAssessed,
        item.taxableValue
      ])

      dataRow.font = baseFont
      if (index === 0) {
        dataRow.getCell(1).font = boldFont // Bold group label
      }
      applyNumberFormat(dataRow)
    })

    // Blank spacer row before group total
    addBlankRow()

    // <GROUP> TOTAL Row (Bold only, optional value block border)
    const totals = group.sheetTotalRow ?? group.calculatedTotals
    const totalRow = worksheet.addRow([
      `${group.rawGroupLabel} TOTAL`,
      ' ',
      ' ',
      totals.homesteadCredit,
      totals.veteranCredit,
      totals.firstResponderCredit,
      totals.totalAssessed,
      totals.taxableValue
    ])

    totalRow.font = boldFont
    applyNumberFormat(totalRow)

    if (hasBlockBorder) {
      applyValueBlockBorder(totalRow)
    }

    // Blank spacer row after group total
    addBlankRow()
  }

  // 3. Helper to write Cross-Group Summary Rows
  const appendSummaryRow = (
    label: string,
    vals?: AssessmentValues,
    includeTaxable = true,
    addTrailingBlankRow = true,
    hasBlockBorder = true
  ): void => {
    if (!vals) return
    const summaryRow = worksheet.addRow([
      '',
      label,
      '',
      '',
      '',
      '',
      vals.totalAssessed,
      includeTaxable ? vals.taxableValue : ''
    ])

    summaryRow.font = boldFont
    applyNumberFormat(summaryRow)

    if (hasBlockBorder) {
      applyValueBlockBorder(summaryRow)
    }

    if (addTrailingBlankRow) {
      addBlankRow()
    }
  }

  // 4. Write Sections in Exact TC33 Order
  appendGroupBlock('1', true) // 1REAL ESTATE TOTAL -> value borders
  appendGroupBlock('2')
  appendGroupBlock('3')
  appendSummaryRow('TOTAL PERSONAL PROPERTY ', report.summaryRows.totalPersonalProperty, true, true, true)

  appendGroupBlock('4', true) // 4PUBLIC SERVICE TOTAL -> value borders
  appendSummaryRow('TOTAL ACTIVE', report.summaryRows.totalActive, true, true, true)

  appendGroupBlock('6')
  appendGroupBlock('7', true) // 7EXEMPT - PERSONAL PROPERTY TOTAL -> value borders
  appendGroupBlock('8', true) // 8EXEMPT TOTAL -> value borders
  appendSummaryRow('TOTAL EXEMPT', report.summaryRows.totalExempt, false, false, true)

  // 5. Append SQL Tab from Input File if Present
  if (report.sqlScript) {
    const sqlSheet = workbook.addWorksheet('SQL')
    sqlSheet.columns = [{ width: 120 }]

    report.sqlScript.split(/\r?\n/).forEach((line) => {
      const row = sqlSheet.addRow([line])
      row.font = { name: 'Consolas', size: 10 }
    })
  }

  // 6. Generate Buffer and Download tc33.xlsx
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = outputFileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  log.info(`Successfully exported ${outputFileName}`)
}
