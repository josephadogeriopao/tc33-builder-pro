import {
  AssessmentReport,
  AssessmentValues,
  PropertyClassItem,
  PropertyGroup
} from '../renderer/src/types/tc33'
import { CellValue, SheetRow } from '../shared/types'
import log from 'electron-log/renderer'

export interface TransformResult {
  isValid: boolean
  report: AssessmentReport
  errors: string[]
}

function toNullableNumber(val: CellValue): number | null {
  if (val === null || val === undefined) return null
  const str = String(val).trim()
  if (str === '') return null
  const num = Number(str.replace(/,/g, ''))
  return Number.isNaN(num) ? null : num
}

function createEmptyValues(): AssessmentValues {
  return {
    homesteadCredit: 0,
    veteranCredit: 0,
    firstResponderCredit: 0,
    totalAssessed: 0,
    taxableValue: 0
  }
}

function addAssessmentValues(target: AssessmentValues, source?: AssessmentValues): void {
  if (!source) return
  target.homesteadCredit = (target.homesteadCredit ?? 0) + (source.homesteadCredit ?? 0)
  target.veteranCredit = (target.veteranCredit ?? 0) + (source.veteranCredit ?? 0)
  target.firstResponderCredit =
    (target.firstResponderCredit ?? 0) + (source.firstResponderCredit ?? 0)
  target.totalAssessed = (target.totalAssessed ?? 0) + (source.totalAssessed ?? 0)
  target.taxableValue = (target.taxableValue ?? 0) + (source.taxableValue ?? 0)
}

function parseAssessmentValues(row: SheetRow): AssessmentValues {
  return {
    homesteadCredit: toNullableNumber(row[3]),
    veteranCredit: toNullableNumber(row[4]),
    firstResponderCredit: toNullableNumber(row[5]),
    totalAssessed: toNullableNumber(row[6]),
    taxableValue: toNullableNumber(row[7])
  }
}

function parseGroupLabel(rawGroup: string): { groupCode: string; groupName: string } {
  const match = rawGroup.match(/^(\d+)\s*(.+)$/)
  if (match) {
    return {
      groupCode: match[1],
      groupName: match[2].trim()
    }
  }
  return {
    groupCode: '',
    groupName: rawGroup.trim()
  }
}

function parseDescription(rawDesc: string): { classCode: string; className: string } {
  const trimmed = rawDesc.trim()
  log.info(`Parsing description: ${trimmed}`)
  const match = trimmed.match(/^(\d+)\s+(.+)$/)
  if (match) {
    return {
      classCode: match[1],
      className: match[2].trim()
    }
  }
  return {
    classCode: '',
    className: trimmed
  }
}

export function transform(extractedRows: SheetRow[]): TransformResult {
  const groups = new Map<string, PropertyGroup>()
  const errors: string[] = []

  if (extractedRows.length < 2) {
    return {
      isValid: false,
      report: { groups, summaryRows: {} },
      errors: ['Spreadsheet has no data rows.']
    }
  }

  let currentGroupCode: string | null = null

  // Skip index 0 (header row: GROUP, DESCRIPTION, UNITS, HOMESTEAD, ...)
  for (let i = 1; i < extractedRows.length; i++) {
    const row = extractedRows[i]
    const rawGroup = String(row[0] ?? '').trim()
    const rawDescription = String(row[1] ?? '').trim()
    const units = String(row[2] ?? '').trim()
    const values = parseAssessmentValues(row)

    // Skip completely empty separator rows (e.g. ",,,,,,,")
    const isRowEmpty =
      !rawGroup &&
      !rawDescription &&
      values.homesteadCredit === null &&
      values.veteranCredit === null &&
      values.firstResponderCredit === null &&
      values.totalAssessed === null &&
      values.taxableValue === null

    if (isRowEmpty) {
      continue
    }

    // Skip pre-existing cross-group summary rows if re-importing a formatted TC33 sheet
    if (!rawGroup && rawDescription.toUpperCase().startsWith('TOTAL')) {
      continue
    }

    // 1. Ensure the PropertyGroup exists whenever rawGroup is present
    if (rawGroup) {
      const cleanLabel = rawGroup.replace(/\s*TOTAL$/i, '').trim()
      const { groupCode, groupName } = parseGroupLabel(cleanLabel)
      const key = groupCode || groupName
      currentGroupCode = key

      if (!groups.has(key)) {
        groups.set(key, {
          groupCode,
          groupName,
          rawGroupLabel: cleanLabel,
          items: [],
          calculatedTotals: createEmptyValues()
        })
      }
    }

    if (!currentGroupCode || !groups.has(currentGroupCode)) {
      errors.push(`Row ${i + 1}: Found item "${rawDescription}" outside of any active group.`)
      continue
    }

    const group = groups.get(currentGroupCode)!

    // 2. Check for SQL ROLLUP Total Row:
    // In your raw SQL output, GROUP is populated ("1REAL ESTATE") and DESCRIPTION is empty ("")
    const isRollupTotalRow =
      (rawGroup !== '' && rawDescription === '') || rawGroup.toUpperCase().endsWith('TOTAL')

    if (isRollupTotalRow) {
      group.sheetTotalRow = values

      // Compare SQL ROLLUP total vs calculated item sum
      if (
        values.totalAssessed !== null &&
        group.calculatedTotals.totalAssessed !== values.totalAssessed
      ) {
        errors.push(
          `Group "${group.rawGroupLabel}" Total Assessed mismatch: sheet=${values.totalAssessed}, calculated=${group.calculatedTotals.totalAssessed}`
        )
      }
      currentGroupCode = null
      continue
    }

    // 3. Add PropertyClassItem to the active group
    const { classCode, className } = parseDescription(rawDescription)
    const item: PropertyClassItem = {
      classCode,
      className,
      rawDescription,
      units: units || undefined,
      ...values
    }

    group.items.push(item)
    addAssessmentValues(group.calculatedTotals, values)
  }

  // 4. Calculate Cross-Group Summary Rows (TOTAL PERSONAL PROPERTY, TOTAL ACTIVE, TOTAL EXEMPT)
  const totalPersonalProperty = createEmptyValues()
  const g2 = groups.get('2')
  const g3 = groups.get('3')
  addAssessmentValues(totalPersonalProperty, g2?.sheetTotalRow ?? g2?.calculatedTotals)
  addAssessmentValues(totalPersonalProperty, g3?.sheetTotalRow ?? g3?.calculatedTotals)

  const totalActive = createEmptyValues()
  for (const code of ['1', '2', '3', '4']) {
    const grp = groups.get(code)
    addAssessmentValues(totalActive, grp?.sheetTotalRow ?? grp?.calculatedTotals)
  }

  const totalExempt = createEmptyValues()
  for (const code of ['6', '7', '8']) {
    const grp = groups.get(code)
    addAssessmentValues(totalExempt, grp?.sheetTotalRow ?? grp?.calculatedTotals)
  }
  totalExempt.taxableValue = null

  const summaryRows: AssessmentReport['summaryRows'] = {
    totalPersonalProperty: g2 || g3 ? totalPersonalProperty : undefined,
    totalActive: groups.size > 0 ? totalActive : undefined,
    totalExempt: groups.get('6') || groups.get('7') || groups.get('8') ? totalExempt : undefined
  }

  return {
    isValid: errors.length === 0 && groups.size > 0,
    report: {
      groups,
      summaryRows
    },
    errors
  }
}
