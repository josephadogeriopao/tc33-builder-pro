import React, { useState } from 'react'
import { extractJsonSchema, extractXlsxFile } from '../../etl/extract'
import { runBuildPipeline, runValidationPipeline } from '../../etl/pipeline'
import { transform } from '../../etl/transform'
import { AssessmentReport } from './types/tc33'
import './App.css'

function App(): React.JSX.Element {
  const [xlsxFile, setXlsxFile] = useState<File | null>(null)
  const [jsonFile, setJsonFile] = useState<File | null>(null)
  const [jsonSchema, setJsonSchema] = useState<Record<string, unknown> | null>(null)
  const [report, setReport] = useState<AssessmentReport | null>(null)
  const [district, setDistrict] = useState<string>('')
  const [taxYear, setTaxYear] = useState<string>('')
  const [statusLog, setStatusLog] = useState<string>(
    'Ready. Select a source .xlsx file to parse rows and enable Generate TC33 .xlsx.'
  )
  const [isGenerating, setIsGenerating] = useState<boolean>(false)

  const handleXlsxChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.item(0) || null
    setXlsxFile(file)
    setReport(null)
    setDistrict('')
    setTaxYear('')

    if (!file) return

    setStatusLog(`Reading "${file.name}"...\n`)

    try {
      const extracted = await extractXlsxFile(file)
      // Pass extracted.sqlScript so transform extracts district and taxYear
      const transformed = transform(extracted.rows, extracted.sqlScript)

      const detectedDistrict = transformed.report.district ?? ''
      const detectedTaxYear = transformed.report.taxYear ?? ''

      setReport(transformed.report)
      setDistrict(detectedDistrict)
      setTaxYear(detectedTaxYear)
      console.log(extracted.formattedLog)

      const metaNote =
        detectedDistrict && detectedTaxYear
          ? `Auto-filled District ${detectedDistrict} and Tax Year ${detectedTaxYear} from SQL tab.`
          : 'SQL metadata not found—please enter District and Tax Year manually.'

      if (transformed.errors.length > 0) {
        setStatusLog(
          `${extracted.formattedLog}\n\n${metaNote}\n\nWarnings:\n${transformed.errors.join('\n')}`
        )
      } else {
        setStatusLog(
          `${extracted.formattedLog}\n\nParsed ${transformed.report.groups.size} groups. ${metaNote}`
        )
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setStatusLog(`Error reading Excel file: ${errorMessage}`)
    }
  }

  const handleJsonChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.item(0) || null
    setJsonFile(file)
    setJsonSchema(null)

    if (!file) return

    try {
      const parsedSchema = await extractJsonSchema(file)
      setJsonSchema(parsedSchema)
      setStatusLog((prev) => `${prev}\n\nLoaded JSON rules: ${file.name}`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setStatusLog((prev) => `${prev}\n\nError reading JSON file: ${errorMessage}`)
    }
  }

  const handleValidate = async (): Promise<void> => {
    if (!xlsxFile || !jsonFile || !jsonSchema) return
    setStatusLog(`Running validation pipeline on "${xlsxFile.name}"...`)

    try {
      const result = await runValidationPipeline(xlsxFile, jsonFile)
      setReport(result.report)
      setDistrict((prev) => prev || result.report.district || '')
      setTaxYear((prev) => prev || result.report.taxYear || '')
      setStatusLog(result.summaryLog)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setStatusLog(`Validation error: ${errorMessage}`)
    }
  }

  const handleGenerateFile = async (): Promise<void> => {
    if (!xlsxFile || !report || !district.trim() || !taxYear.trim()) return
    setIsGenerating(true)
    setStatusLog('Generating print-ready tc33.xlsx file...')

    try {
      const reportWithHeader: AssessmentReport = {
        ...report,
        district: district.trim(),
        taxYear: taxYear.trim()
      }

      const buildMessage = await runBuildPipeline(reportWithHeader, xlsxFile.name)
      setStatusLog((prev) => `${prev}\n\n${buildMessage}`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setStatusLog(`Error generating file: ${errorMessage}`)
    } finally {
      setIsGenerating(false)
    }
  }

  const isMetadataMissing = !district.trim() || !taxYear.trim()

  return (
    <div className="app-container">
      <header className="app-header">
        <div>
          <h1>TC33 Builder Pro</h1>
          <p>Validate spreadsheet data against JSON rules and export print-ready C33 reports.</p>
        </div>
        <span className="badge">v1.0.0</span>
      </header>

      <main className="upload-grid">
        <section className="card upload-card">
          <h3>1. Source Excel Data (.xlsx)</h3>
          <p>Select the raw spreadsheet containing your C33 records.</p>
          <input
            type="file"
            accept=".xlsx"
            onChange={handleXlsxChange}
            className="file-input"
          />
          {xlsxFile && <span className="file-name">Selected: {xlsxFile.name}</span>}
        </section>

        <section className="card upload-card">
          <h3>2. Validation Schema (.json)</h3>
          <p>Select the JSON rules file to verify spreadsheet accuracy.</p>
          <input
            type="file"
            accept=".json"
            onChange={handleJsonChange}
            className="file-input"
          />
          {jsonFile && <span className="file-name">Selected: {jsonFile.name}</span>}
        </section>

        <section className="card upload-card">
          <h3>3. Report Header Info (Required)</h3>
          <p>Auto-filled from the SQL tab if present, or enter manually.</p>
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <label style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px' }}>
                District *
              </span>
              <input
                type="text"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="e.g. 1"
                className="file-input"
                required
              />
            </label>
            <label style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px' }}>
                Tax Year *
              </span>
              <input
                type="text"
                value={taxYear}
                onChange={(e) => setTaxYear(e.target.value)}
                placeholder="e.g. 2027"
                className="file-input"
                required
              />
            </label>
          </div>
        </section>
      </main>

      <div className="actions-bar">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!xlsxFile || !jsonSchema || isGenerating}
          onClick={handleValidate}
        >
          Validate Data
        </button>

        <button
          type="button"
          className="btn btn-primary"
          disabled={!xlsxFile || !report || isMetadataMissing || isGenerating}
          onClick={handleGenerateFile}
        >
          {isGenerating ? 'Generating File...' : 'Generate TC33 .xlsx'}
        </button>
      </div>

      <section className="card status-panel">
        <h3>Validation & Build Output</h3>
        <div
          className="status-box"
          style={{ whiteSpace: 'pre-wrap', maxHeight: '320px', overflowY: 'auto' }}
        >
          {statusLog}
        </div>
      </section>
    </div>
  )
}

export default App
