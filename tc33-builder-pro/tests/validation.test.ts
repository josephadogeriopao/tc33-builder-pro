import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { preferencesSchema, saveFileSchema, safeExternalURL, updatePercent } from '../src/shared/validation'
import { extractXlsxFile } from '../src/etl/extract'
import { buildTc33Workbook } from '../src/etl/load'
import { extractPsrMetadata, transform } from '../src/etl/transform'
import { runValidationPipeline } from '../src/etl/pipeline'
import { buildMismatchExport } from '../src/main/mismatch-export'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveDroppedSource } from '../src/main/dropped-sources'

test('preferences preserve valid appearance and export defaults', () => {
  assert.deepEqual(preferencesSchema.parse({ theme: 'black', defaultDistrict: '3', defaultTaxYear: '2027' }), {
    theme: 'black', minimizeToTray: false, notifications: false, filename: 'tc33',
    dateFormat: 'none', defaultDistrict: '3', defaultTaxYear: '2027', jsonFilename: ''
  })
  assert.equal(preferencesSchema.safeParse({ theme: 'black', filename: '../report' }).success, false)
  assert.equal(preferencesSchema.safeParse({ theme: 'light', defaultTaxYear: '27' }).success, false)
  assert.equal(preferencesSchema.safeParse({ jsonFilename: '../report.json' }).success, false)
})

test('save dialog filename cannot contain a path', () => {
  assert.equal(saveFileSchema.safeParse(['report.txt', 'ok']).success, true)
  assert.equal(saveFileSchema.safeParse(['../report.txt', 'ok']).success, false)
})

test('external links accept safe web URLs only', () => {
  assert.equal(safeExternalURL('https://example.com/help'), 'https://example.com/help')
  assert.equal(safeExternalURL('javascript:alert(1)'), null)
  assert.equal(safeExternalURL('https://user:pass@example.com'), null)
})

test('download progress is finite and bounded', () => {
  assert.equal(updatePercent(45.2), 45)
  assert.equal(updatePercent(120), 100)
  assert.equal(updatePercent(-2), 0)
  assert.equal(updatePercent(Number.NaN), 0)
})

test('ExcelJS extracts rows and SQL metadata from workbook sheets', async () => {
  const workbook = new ExcelJS.Workbook()
  const recap = workbook.addWorksheet('Recap')
  recap.addRow(['GROUP', 'DESCRIPTION', 'UNITS', 'HOMESTEAD', 'VETERAN', 'FIRST', 'ASSESSED', 'TAXABLE'])
  recap.addRow(['1REAL ESTATE', '30 Residential', 1, 0, 0, 0, 1000, 800])
  const sql = workbook.addWorksheet('SQL')
  sql.addRow(["WHERE TAX_YEAR = '2027' AND FIPS_CODE = '22171'"])
  const buffer = await workbook.xlsx.writeBuffer()
  const source = new File([new Uint8Array(buffer).slice().buffer as ArrayBuffer], 'source.xlsx')
  const extracted = await extractXlsxFile(source)
  assert.equal(extracted.sheetName, 'Recap')
  assert.equal(extracted.rows[1][6], 1000)
  assert.match(extracted.sqlScript ?? '', /TAX_YEAR/)
  const result = transform(extracted.rows, extracted.sqlScript)
  assert.equal(result.report.district, '1')
  assert.equal(result.report.taxYear, '2027')
  assert.equal(result.report.groups.get('1')?.items[0].classCode, '30')
})

test('workbook export requires report metadata and produces an Excel file', async () => {
  const report = { groups: new Map(), summaryRows: {}, district: '1', taxYear: '2027' }
  await assert.rejects(() => buildTc33Workbook({ ...report, district: undefined }, 'test.xlsx'), /Missing required report metadata: District/)
  const bytes = await buildTc33Workbook(report, 'test.xlsx')
  assert.equal(bytes[0], 0x50)
  assert.equal(bytes[1], 0x4b)
})

test('PSR JSON metadata exposes parish, FIPS code, district, and tax year', () => {
  assert.deepEqual(extractPsrMetadata({
    PSR: { ParishInformation: [{ ParishName: 'ORLEANS', ParishFipsCode: '22171', TaxYear: 2027 }] }
  }), { parishName: 'ORLEANS', fipsCode: '22171', district: '1', taxYear: '2027' })
})

test('batch validation keeps the source workbook log and reports mismatches', async () => {
  const workbook = new ExcelJS.Workbook()
  const recap = workbook.addWorksheet('Export Worksheet')
  recap.addRow(['GROUP', 'DESCRIPTION', 'UNITS', 'HOMESTEAD', 'VETERAN', 'FIRST', 'ASSESSED', 'TAXABLE'])
  recap.addRow(['1REAL ESTATE', '30 Residential', 1, 0, 0, 0, 1000, 800])
  recap.addRow(['', '31 Commercial', 1, 0, 0, 0, 500, 400])
  workbook.addWorksheet('SQL').addRow(["WHERE TAX_YEAR = '2027' AND FIPS_CODE = '22171'"])
  const workbookBytes = await workbook.xlsx.writeBuffer()
  const excel = new File([new Uint8Array(workbookBytes).slice().buffer as ArrayBuffer], 'dist-1-data.xlsx')
  const json = new File([JSON.stringify({
    PSR: {
      ParishInformation: [{ ParishName: 'ORLEANS', ParishFipsCode: '22171', TaxYear: 2027 }],
      ActiveRecap: [{
        Class: '30', PropertyDescription: 'Residential', AssessedValue: '950',
        HomesteadCredit: 0, DisabledVeteranCredit: 0, FirstResponderCredit: 0,
        TaxableValue: 800, Exemption: 0, AcresUnits: 1
      }]
    }
  })], 'dist-1-data.json')

  const result = await runValidationPipeline(excel, json)
  assert.equal(result.isValid, false)
  assert.match(result.sourceLog, /Loaded: dist-1-data\.xlsx \| Sheet: Export Worksheet/)
  assert.match(result.summaryLog, /Validation Failed/)
  assert.ok(result.errors.some((issue) => /totalAssessed/.test(issue)))
  assert.ok(result.errors.some((issue) => /Class 31 missing in JSON/.test(issue)))
})

test('batch validation preserves workbook logs when the JSON is malformed', async () => {
  const workbook = new ExcelJS.Workbook()
  const recap = workbook.addWorksheet('Export Worksheet')
  recap.addRow(['GROUP', 'DESCRIPTION', 'UNITS', 'HOMESTEAD', 'VETERAN', 'FIRST', 'ASSESSED', 'TAXABLE'])
  recap.addRow(['1REAL ESTATE', '30 Residential', 1, 0, 0, 0, 1000, 800])
  const workbookBytes = await workbook.xlsx.writeBuffer()
  const excel = new File([new Uint8Array(workbookBytes).slice().buffer as ArrayBuffer], 'source.xlsx')
  const json = new File(['{ invalid json'], 'broken.json')

  const result = await runValidationPipeline(excel, json)
  assert.equal(result.isValid, false)
  assert.match(result.sourceLog, /Loaded: source\.xlsx/)
  assert.match(result.summaryLog, /could not be read/)
})

test('batch validation rejects a JSON object without the recap array', async () => {
  const workbook = new ExcelJS.Workbook()
  const recap = workbook.addWorksheet('Export Worksheet')
  recap.addRow(['GROUP', 'DESCRIPTION', 'UNITS', 'HOMESTEAD', 'VETERAN', 'FIRST', 'ASSESSED', 'TAXABLE'])
  recap.addRow(['1REAL ESTATE', '30 Residential', 1, 0, 0, 0, 1000, 800])
  const workbookBytes = await workbook.xlsx.writeBuffer()
  const excel = new File([new Uint8Array(workbookBytes).slice().buffer as ArrayBuffer], 'source.xlsx')
  const json = new File([JSON.stringify({ PSR: {} })], 'empty-schema.json')
  const result = await runValidationPipeline(excel, json)
  assert.equal(result.isValid, false)
  assert.match(result.summaryLog, /ActiveRecap array/)
})

test('batch validation compares formatted numeric strings without false mismatches', async () => {
  const workbook = new ExcelJS.Workbook()
  const recap = workbook.addWorksheet('Export Worksheet')
  recap.addRow(['GROUP', 'DESCRIPTION', 'UNITS', 'HOMESTEAD', 'VETERAN', 'FIRST', 'ASSESSED', 'TAXABLE'])
  recap.addRow(['1REAL ESTATE', '30 Residential', 1, 0, 0, 0, 1000, 800])
  workbook.addWorksheet('SQL').addRow(["WHERE TAX_YEAR = '2027' AND FIPS_CODE = '22171'"])
  const workbookBytes = await workbook.xlsx.writeBuffer()
  const excel = new File([new Uint8Array(workbookBytes).slice().buffer as ArrayBuffer], 'source.xlsx')
  const json = new File([JSON.stringify({
    PSR: {
      ParishInformation: [{ ParishFipsCode: '22171', TaxYear: 2027 }],
      ActiveRecap: [{
        Class: '30', PropertyDescription: 'Residential', AssessedValue: '1,000',
        HomesteadCredit: '0', DisabledVeteranCredit: '0', FirstResponderCredit: '0',
        TaxableValue: '800', Exemption: '0', AcresUnits: 1
      }]
    }
  })], 'source.json')

  const result = await runValidationPipeline(excel, json)
  assert.equal(result.isValid, true)
  assert.deepEqual(result.errors, [])
})

test('invalid reports export in all six requested formats', async () => {
  const issues = ['source.xlsx: Class 30, field "totalAssessed": expected 950, found 1,000']
  const csv = await buildMismatchExport('csv', issues)
  assert.match(csv.toString('utf8'), /^"Issue"\r\n/)
  assert.match(csv.toString('utf8'), /""totalAssessed""/)
  assert.match((await buildMismatchExport('json', issues)).toString('utf8'), /"issues"/)
  assert.match((await buildMismatchExport('txt', issues)).toString('utf8'), /source\.xlsx/)
  assert.equal((await buildMismatchExport('xlsx', issues)).subarray(0, 2).toString('hex'), '504b')
  assert.equal((await buildMismatchExport('docx', issues)).subarray(0, 2).toString('hex'), '504b')
  assert.match((await buildMismatchExport('pdf', issues)).toString('utf8', 0, 8), /^%PDF-/)
})

test('dropped JSON and Excel files keep their names and avoid overwriting collisions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tc33-dropped-sources-'))
  try {
    const json = { name: 'parish-report.json', bytes: new Uint8Array([1, 2, 3]) }
    const excel = { name: 'parish-report.xlsx', bytes: new Uint8Array([4, 5, 6]) }
    const jsonPath = await saveDroppedSource(directory, json)
    const excelPath = await saveDroppedSource(directory, excel)
    const duplicatePath = await saveDroppedSource(directory, { ...json, bytes: new Uint8Array([7]) })

    assert.equal(jsonPath, join(directory, 'parish-report.json'))
    assert.equal(excelPath, join(directory, 'parish-report.xlsx'))
    assert.equal(duplicatePath, join(directory, 'parish-report (2).json'))
    assert.deepEqual(await readFile(jsonPath), Buffer.from([1, 2, 3]))
    assert.deepEqual(await readFile(duplicatePath), Buffer.from([7]))
    await assert.rejects(
      () => saveDroppedSource(directory, { name: '../outside.xlsx', bytes: new Uint8Array([8]) }),
      /filename is not safe/
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
