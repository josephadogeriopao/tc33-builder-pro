import * as XLSX from 'xlsx'
import { ExtractedSheet, SheetRow } from '../shared/types'
import { readFileBuffer, readJsonFile } from '../utils/fileHelpers'

export async function extractXlsxFile(file: File): Promise<ExtractedSheet> {
  const buffer = await readFileBuffer(file)
  const workbook = XLSX.read(buffer, { type: 'array' })

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error(`No worksheets found in "${file.name}".`)
  }

  const worksheet = workbook.Sheets[sheetName]

  const rows = XLSX.utils.sheet_to_json<SheetRow>(worksheet, {
    header: 1,
    defval: ''
  })

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
    formattedLog: outputLines.join('\n')
  }
}

export async function extractJsonSchema<T = Record<string, unknown>>(file: File): Promise<T> {
  return await readJsonFile<T>(file)
}
