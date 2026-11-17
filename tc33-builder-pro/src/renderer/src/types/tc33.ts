export interface AssessmentValues {
  homesteadCredit: number | null | string
  veteranCredit: number | null | string
  firstResponderCredit: number | null | string
  totalAssessed: number | null | string
  taxableValue: number | null | string
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
    //other summary rows can be added here as needed
    totalRealEstate?: AssessmentValues
    totalPersonalPropertyA?: AssessmentValues
    totalPersonalPropertyB?: AssessmentValues
    totalPublicService?: AssessmentValues
    totalExemptPersonalProperty?: AssessmentValues
    totalExemptRealEstate?: AssessmentValues
  }
  taxYear?: string
  district?: string
  sqlScript?: string
}

export interface PsrParishInfo {
  ParishName: string
  ParishFipsCode: string
  TaxYear: number
}

export interface PsrRecapItem {
  Class: string
  PropertyDescription: string
  AssessedValue: number
  HomesteadCredit: number
  DisabledVeteranCredit: number
  FirstResponderCredit: number
  Exemption: number
  TaxableValue: number
  AcresUnits: number
}

export interface PsrStatusSums{
  Status: string
  StatusDescription: string
  AssessedValue: number
  HomesteadCredit: number
  DisabledVeteranCredit: number
  FirstResponderCredit: number
  Exemption: number
  TaxableValue: number
  AcresUnits: number
}

export interface PsrJsonPayload {
  PSR: {
    ParishInformation?: PsrParishInfo[]
    ActiveRecap?: PsrRecapItem[]
    ExemptRecap?: PsrRecapItem[] // Add if your JSON includes exempt classes
    StatusSums?: PsrStatusSums[]
  }
}

