export interface AssessmentValues {
  homesteadCredit: number | null
  veteranCredit: number | null
  firstResponderCredit: number | null
  totalAssessed: number | null
  taxableValue: number | null
}

export interface PropertyClassItem extends AssessmentValues {
  classCode: string
  className: string
  rawDescription: string
  units?: string
}

export interface PropertyGroup {
  groupCode: string
  groupName: string
  rawGroupLabel: string
  items: PropertyClassItem[]
  /** Matches the "<GROUP> TOTAL" row produced by SQL ROLLUP */
  sheetTotalRow?: AssessmentValues
  /** Calculated sum of all items in this group */
  calculatedTotals: AssessmentValues
}

export interface AssessmentReport {
  groups: Map<string, PropertyGroup>
  /** Cross-group summary rows from the CSV */
  summaryRows: {
    totalPersonalProperty?: AssessmentValues
    totalActive?: AssessmentValues
    totalExempt?: AssessmentValues
  }
}
