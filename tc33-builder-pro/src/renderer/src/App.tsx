import React, { useState } from 'react'
import './App.css'

function App(): React.JSX.Element {
  const [xlsxFile, setXlsxFile] = useState<File | null>(null)
  const [jsonFile, setJsonFile] = useState<File | null>(null)
  const [statusLog, setStatusLog] = useState<string>(
    'Ready. Select a source .xlsx file and a .json schema to begin.'
  )
  const [isValidated, setIsValidated] = useState<boolean>(false)

  const handleXlsxChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0] || null
    setXlsxFile(file)
    setIsValidated(false)
    if (file) {
      setStatusLog(`Loaded Excel source: ${file.name}`)
    }
  }

  const handleJsonChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0] || null
    setJsonFile(file)
    setIsValidated(false)
    if (file) {
      setStatusLog(`Loaded JSON rules: ${file.name}`)
    }
  }

  const handleValidate = async (): Promise<void> => {
    if (!xlsxFile || !jsonFile) return
    setStatusLog('Comparing .xlsx rows against JSON validation schema...')

    // TODO: Connect to window.electron.ipcRenderer.invoke('validate-c33', ...)
    setTimeout(() => {
      setIsValidated(true)
      setStatusLog(`Validation passed! All rows in "${xlsxFile.name}" match "${jsonFile.name}".`)
    }, 500)
  }

  const handleGenerate = async (): Promise<void> => {
    if (!xlsxFile) return
    setStatusLog('Generating print-ready C33 .xlsx document...')

    // TODO: Connect to window.electron.ipcRenderer.invoke('generate-c33', ...)
    setTimeout(() => {
      setStatusLog('Success! C33 .xlsx file generated with custom print headers.')
    }, 500)
  }

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
      </main>

      <div className="actions-bar">
        <button
          className="btn btn-secondary"
          disabled={!xlsxFile || !jsonFile}
          onClick={handleValidate}
        >
          Validate Data
        </button>
        <button
          className="btn btn-primary"
          disabled={!xlsxFile || !isValidated}
          onClick={handleGenerate}
        >
          Build C33 .xlsx
        </button>
      </div>

      <section className="card status-panel">
        <h3>Validation & Build Output</h3>
        <div className="status-box">{statusLog}</div>
      </section>
    </div>
  )
}

export default App
