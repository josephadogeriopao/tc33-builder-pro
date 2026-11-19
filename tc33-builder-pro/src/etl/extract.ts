import ExcelJS from 'exceljs'
import { CellValue, ExtractedSheet, InputFile, SheetRow } from '../shared/types'
import { readFileBuffer, readJsonFile } from '../utils/fileHelpers'

export async function extractXlsxFile(file: InputFile): Promise<ExtractedSheet> {
  const buffer = await readFileBuffer(file)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as ArrayBuffer)
  const worksheet = workbook.worksheets[0]
  const sheetName = worksheet?.name
  if (!worksheet || !sheetName) {
    throw new Error(`No worksheets found in "${file.name}".`)
  }

  const normalizeCell = (value: ExcelJS.CellValue): CellValue => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
    if (value instanceof Date) return value.toISOString()
    if ('result' in value && value.result !== undefined) return normalizeCell(value.result as ExcelJS.CellValue)
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('richText' in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('')
    return String(value)
  }
  const readRows = (sheet: ExcelJS.Worksheet): SheetRow[] => {
    const rows: SheetRow[] = []
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      rows[rowNumber - 1] = Array.from({ length: sheet.columnCount }, (_, index) =>
        normalizeCell(row.getCell(index + 1).value)
      )
    })
    return rows
  }
  const rows = readRows(worksheet)

  // Scan all tabs in the workbook for the SQL query
  let sqlScript = ''
  for (const candidateSheet of workbook.worksheets) {
    const name = candidateSheet.name
    const sheetRows = readRows(candidateSheet)

    const isSqlTab =
      name.trim().toUpperCase().includes('SQL') ||
      (name !== sheetName &&
        sheetRows.some((r) =>
          r.some((cell) => /SELECT\s+[\s\S]*TROLL_AVALUE/i.test(String(cell)))
        ))

    if (isSqlTab) {
      sqlScript = sheetRows
        .map((r) =>
          r
            .map((cell) => (cell === null || cell === undefined ? '' : String(cell)))
            .join(' ')
            .trimEnd()
        )
        .join('\n')
        .trim()
      break
    }
  }

  const outputLines: string[] = [
    `Loaded: ${file.name} | Sheet: ${sheetName} (${rows.length} rows)`,
    '----------------------------------------'
  ]

  rows.forEach((row, rowIndex) => {
    const columnsText = row
      .map((cellValue, colIndex) => `Col ${colIndex + 1}: "${cellValue}"`)
      .join(' | ')

    outputLines.push(`Row ${rowIndex + 1}: ${columnsText}`)
  })

  return {
    fileName: file.name,
    sheetName,
    rows,
    sqlScript,
    formattedLog: outputLines.join('\n')
  }
}

export async function extractJsonSchema<T = Record<string, unknown>>(file: InputFile): Promise<T> {
  return await readJsonFile<T>(file)
}
