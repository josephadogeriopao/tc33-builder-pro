import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { BatchGenerationResult, BatchValidationResult, MismatchExportFormat, Preferences, RecentFile, SourceFile, WorkspaceState } from '../../shared/types'
import './App.css'
import './AppExtras.css'
import CopyrightNotice from './components/CopyRightNotice'

type Section = 'workspace' | 'history' | 'settings' | 'team'
type ResultsTab = 'log' | 'issues'
const defaultPreferences: Preferences = {
  theme: 'light', minimizeToTray: false, notifications: false, filename: 'tc33', dateFormat: 'none',
  defaultDistrict: '', defaultTaxYear: '', jsonFilename: ''
}
const people = [
  { name: 'Jun Bause', role: 'IT Manager', phone: '504-754-8846', email: 'jbausa@orleansassessors.com' },
  { name: 'Joseph Adogeri', role: 'Software Developer', phone: '504-754-8862', email: 'joseph.adogeri@orleansassessors.com' },
  { name: 'Jason Lee', role: 'Computer Programmer', phone: '504-754-8851', email: 'jason.lee@orleansassessors.com' }
]
const printableDate = (format: Preferences['dateFormat']) => {
  if (format === 'none') return ''
  const date = new Date()
  const y = String(date.getFullYear()), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0')
  return format === 'YYYY-MM-DD' ? `${y}-${m}-${d}` : format === 'MM-DD-YYYY' ? `${m}-${d}-${y}` : `${y}${m}${d}`
}
const filenameFor = (preferences: Preferences) => {
  const date = printableDate(preferences.dateFormat)
  return `${preferences.filename.trim()}${date ? `-${date}` : ''}`
}

function App(): React.JSX.Element {
  const [section, setSection] = useState<Section>('workspace')
  const [sources, setSources] = useState<SourceFile[]>([])
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set())
  const [validationResults, setValidationResults] = useState<BatchValidationResult[]>([])
  const [resultsTab, setResultsTab] = useState<ResultsTab>('log')
  const [state, setState] = useState<WorkspaceState>({ preferences: defaultPreferences, recent: [], activity: [] })
  const [message, setMessage] = useState('Choose one or more Excel workbooks and an optional JSON comparison file.')
  const [busy, setBusy] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [palette, setPalette] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [paletteIndex, setPaletteIndex] = useState(0)
  const [showHistoryConfirm, setShowHistoryConfirm] = useState(false)
  const paletteInput = useRef<HTMLInputElement>(null)
  const runLogTab = useRef<HTMLButtonElement>(null)
  const issuesTab = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const [showSidebarScrollTop, setShowSidebarScrollTop] = useState(false)
  const commandActions = useRef<Record<string, () => void>>({})
  const api = window.api

  const setWorkspace = useCallback((next: WorkspaceState) => setState(next), [])
  useEffect(() => {
    void api?.getWorkspace().then(setWorkspace).catch((error) => setMessage(`Could not load preferences: ${String(error)}`))
    void api?.rendererReady()
    const stopCommands = api?.onCommand((command) => {
      commandActions.current[command]?.()
    })
    const stopToasts = api?.onToast((text) => setMessage(text))
    const onKeys = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPalette((open) => !open) }
      if (event.key === 'Escape') setPalette(false)
    }
    window.addEventListener('keydown', onKeys)
    return () => { stopCommands?.(); stopToasts?.(); window.removeEventListener('keydown', onKeys) }
  }, [api])
  useEffect(() => { if (palette) paletteInput.current?.focus() }, [palette])
  const updatePreferences = async (update: Partial<Preferences>) => {
    const preferences = { ...state.preferences, ...update }
    if (api) {
      try { preferences.theme = (await api.setPreferences(preferences)).theme; setWorkspace(await api.getWorkspace()) }
      catch (error) { setMessage(`Could not save preferences: ${String(error)}`); return }
    } else setState((prev) => ({ ...prev, preferences }))
  }
  const cycleTheme = () => {
    const themes: Preferences['theme'][] = ['light', 'dark', 'black']
    const current = themes.indexOf(state.preferences.theme)
    void updatePreferences({ theme: themes[(current + 1 + themes.length) % themes.length] })
  }

  function mergeImported(picked: SourceFile[]) {
    setValidationResults([])
    setSources((prev) => {
      const next = [...prev]
      for (const source of picked) {
        const existing = next.findIndex((item) => item.path === source.path)
        if (existing >= 0) next.splice(existing, 1)
        next.push(source)
      }
      return next
    })
    setSelectedSourceIds((prev) => {
      const next = new Set(prev)
      for (const source of picked) if (/\.xlsx$/i.test(source.name)) next.add(source.path)
      return next
    })
  }

  async function importSources(kind: 'all' | 'json' = 'all') {
    setBusy(true)
    try {
      if (!api) { setMessage('Run the desktop app to import files.'); return }
      const picked = await api.openSources(kind)
      if (!picked.length) return
      mergeImported(picked)
      setWorkspace(await api.getWorkspace())
      setMessage(`Imported ${picked.length} source file${picked.length === 1 ? '' : 's'}.`)
      setSection('workspace')
    } catch (error) { setMessage(`Import failed: ${String(error)}`) }
    finally { setBusy(false) }
  }

  async function importDropped(files: FileList) {
    setDragActive(false)
    const supported = Array.from(files).filter((file) => /\.(xlsx|json)$/i.test(file.name))
    if (!supported.length) { setMessage('Drop .xlsx or .json files to add them to the batch.'); return }
    if (!api) { setMessage('Run the desktop app to import dropped files.'); return }
    setBusy(true)
    try {
      const dropped = await Promise.all(supported.map(async (file) => ({
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer())
      })))
      const imported = await api.importDroppedSources(dropped)
      mergeImported(imported)
      setWorkspace(await api.getWorkspace())
      setMessage(`Imported ${imported.length} dropped source file${imported.length === 1 ? '' : 's'}.`)
      setSection('workspace')
    } catch (error) { setMessage(`Drop import failed: ${String(error)}`) }
    finally { setBusy(false) }
  }

  function removeSource(path: string) {
    setSources((prev) => prev.filter((source) => source.path !== path))
    setSelectedSourceIds((prev) => {
      const next = new Set(prev)
      next.delete(path)
      return next
    })
    setValidationResults([])
    setMessage('Source removed from this batch. The original file was not deleted.')
  }

  async function loadRecent(file: RecentFile, navigateToWorkspace: boolean) {
    if (!api) return
    try {
      const source = await api.reopenSource(file.path)
      setSources((prev) => [...prev.filter((item) => item.path !== source.path), source])
      setSelectedSourceIds((prev) => /\.xlsx$/i.test(source.name) ? new Set(prev).add(source.path) : prev)
      setValidationResults([])
      if (navigateToWorkspace) {
        setSection('workspace')
        setMessage(`Reopened ${file.name}.`)
      } else {
        setMessage(`Reloaded ${file.name} from disk.`)
      }
      setWorkspace(await api.getWorkspace())
    } catch (error) { setMessage(`Could not ${navigateToWorkspace ? 'reopen' : 'reload'} file: ${String(error)}`) }
  }

  const reopenRecent = (file: RecentFile) => loadRecent(file, true)
  const reloadRecent = (file: RecentFile) => loadRecent(file, false)

  async function removeRecent(file: RecentFile) {
    if (!window.confirm(`Remove ${file.name} from recent files? The source file and any imported batch will remain unchanged.`)) return
    try {
      if (api) setWorkspace(await api.removeRecentFile(file.path))
      else setState((prev) => ({ ...prev, recent: prev.recent.filter((item) => item.path !== file.path) }))
      setMessage(`${file.name} removed from recent files. The source file was not deleted.`)
    } catch (error) { setMessage(`Could not remove recent file: ${String(error)}`) }
  }

  const excelSources = useMemo(() => sources.filter((source) => /\.xlsx$/i.test(source.name)), [sources])
  const jsonSources = useMemo(() => sources.filter((source) => /\.json$/i.test(source.name)), [sources])
  const selectedExcelSources = useMemo(
    () => excelSources.filter((source) => selectedSourceIds.has(source.path)),
    [excelSources, selectedSourceIds]
  )
  const issueCount = useMemo(
    () => validationResults.reduce((count, result) => count + (result.isValid ? 0 : Math.max(1, result.errors.length)), 0),
    [validationResults]
  )
  const issueLines = useMemo(() => validationResults.flatMap((result) => {
    if (result.isValid) return []
    return result.errors.length ? result.errors.map((error) => `${result.file}: ${error}`) : [`${result.file}: ${result.summaryLog}`]
  }), [validationResults])
  async function record(action: string, file: string, detail: string) {
    if (api) setWorkspace(await api.recordActivity({ action, file, detail }))
    else setState((prev) => ({ ...prev, activity: [{ id: String(Date.now()), at: new Date().toISOString(), action, file, detail }, ...prev.activity] }))
  }
  async function validateAll() {
    if (!excelSources.length || !jsonSources.length) { setMessage('Import at least one Excel workbook and one JSON comparison file.'); return }
    if (!api) { setMessage('Run the desktop app to validate your files.'); return }
    setBusy(true)
    try {
      const batch = sources.map((source) => ({ id: source.path, name: source.name, bytes: source.bytes }))
      const results: BatchValidationResult[] = await api.validateSources(batch)
      setValidationResults(results)
      setResultsTab('log')
      const passed = results.filter((result) => result.isValid).length
      for (const result of results) {
        await record(result.isValid ? 'Validation passed' : 'Validation found mismatches', result.file, `${result.comparedTo}; ${result.errors.length} issue(s)`)
      }
      setMessage(`Batch validation: ${passed}/${results.length} workbooks passed.\n\n${results.map((result) =>
        `${result.sourceLog ? `${result.sourceLog}\n\n` : ''}${result.isValid ? 'PASS' : 'MISMATCH'}  ${result.file}  ↔  ${result.comparedTo}\n${result.summaryLog}`
      ).join('\n\n────────────────────────────────\n\n')}`)
    } catch (error) { setMessage(`Batch validation failed: ${String(error)}`) }
    finally { setBusy(false) }
  }
  async function buildAll() {
    if (!selectedExcelSources.length) { setMessage('Select at least one Excel workbook to generate.'); return }
    if (!api) { setMessage('Run the desktop app to generate your workbooks.'); return }
    setBusy(true)
    try {
      const batch = sources.map((source) => ({ id: source.path, name: source.name, bytes: source.bytes }))
      const results: BatchGenerationResult[] = await api.generateSources(batch, selectedExcelSources.map((source) => source.path))
      for (const result of results.filter((item) => item.saved)) await record('TC33 workbook exported', result.file, result.message)
      setMessage(`Generated ${results.filter((result) => result.saved).length} of ${results.length} selected TC-33 workbooks.\n\n${results.map((result) => `${result.file}: ${result.message}`).join('\n')}`)
    } catch (error) { setMessage(`Workbook generation failed: ${String(error)}`) }
    finally { setBusy(false) }
  }
  async function exportMismatches(format: MismatchExportFormat) {
    if (!validationResults.length) { setMessage('Run batch validation before exporting the invalid report.'); return }
    const ext = format === 'txt' ? 'txt' : format
    const defaultStem = filenameFor(state.preferences)
    const jsonStem = state.preferences.jsonFilename.trim() || defaultStem
    const stem = `${format === 'json' ? jsonStem : defaultStem}-validation-mismatches`
    try {
      const filename = `${stem}.${ext}`
      if (!api) { setMessage('Run the desktop app to export the invalid report.'); return }
      if (await api.exportMismatches(format, filename, issueLines.length ? issueLines : ['No validation issues were found.'])) {
        setMessage(`Saved ${filename}.`)
        await record('Mismatch report exported', filename, `${issueLines.length} validation issue(s)`)
      }
    } catch (error) { setMessage(`Could not export mismatch report: ${String(error)}`) }
  }

  commandActions.current = {
    open: () => void importSources(),
    palette: () => setPalette(true),
    preferences: () => setSection('settings'),
    validate: () => void validateAll(),
    generate: () => void buildAll()
  }
  const commands = [
    { label: 'Import Excel and JSON files', action: () => void importSources() },
    { label: 'Validate batch', action: () => void validateAll() },
    { label: 'Generate TC33 workbooks', action: () => void buildAll() },
    { label: 'Open recent files and activity', action: () => setSection('history') },
    { label: 'Open preferences', action: () => setSection('settings') }
  ].filter((command) => command.label.toLowerCase().includes(paletteQuery.toLowerCase()))
  const activeCommandIndex = Math.min(paletteIndex, Math.max(0, commands.length - 1))

  return <div className="app-shell" data-theme={state.preferences.theme}>
    <header className="titlebar">
      <div className="brand"><img src={new URL('../../../resources/icon.png', import.meta.url).href} alt="" /><span>TC33 Builder <b>Pro</b></span></div>
      <button
        className="theme-toggle"
        type="button"
        title={`Theme: ${state.preferences.theme === 'black' ? 'contrast' : state.preferences.theme}. Switch theme`}
        aria-label={`Theme: ${state.preferences.theme === 'black' ? 'contrast' : state.preferences.theme}. Switch theme`}
        onClick={cycleTheme}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
        </svg>
      </button>
      <div className="window-actions" aria-label="Window controls">
        <button aria-label="Minimize window" onClick={() => void api?.windowControl('minimize')}>−</button>
        <button aria-label="Maximize or restore window" onClick={() => void api?.windowControl('maximize')}>□</button>
        <button aria-label="Close window" className="close-window" onClick={() => void api?.windowControl('close')}>×</button>
      </div>
    </header>
    <div className="app-body">
      <aside
        ref={sidebarRef}
        className="sidebar"
        aria-label="Main navigation"
        onScroll={(event) => {
          const sidebar = event.currentTarget
          setShowSidebarScrollTop(sidebar.scrollHeight > sidebar.clientHeight && sidebar.scrollTop > 24)
        }}
      >
        <div className="sidebar-label">WORKSPACE</div>
        {([['workspace','◫','Overview'],['history','◷','Recent & activity'],['settings','⚙','Preferences'],['team','♙','Team']] as const).map(([id,icon,label]) =>
          <button key={id} className={`nav-item ${section === id ? 'selected' : ''}`} onClick={() => setSection(id)} aria-current={section === id ? 'page' : undefined}><span>{icon}</span>{label}</button>)}
        <button
          type="button"
          className="sidebar-scroll-top"
          aria-label="Scroll sidebar to top"
          hidden={!showSidebarScrollTop}
          onClick={() => sidebarRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          ↑ <span>Back to top</span>
        </button>
        <div className="sidebar-foot"><span className="status-dot" /><span className="sidebar-foot-label">Files stay on this device</span><span className="sidebar-version">v1</span></div>
      </aside>
      <motion.main
        className="main-content flex-1"
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragActive(true) } }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false) }}
        onDrop={(event) => { event.preventDefault(); void importDropped(event.dataTransfer.files) }}
      >
        {dragActive && <div className="drop-overlay" role="status">Drop Excel workbooks and JSON files to add them to this batch</div>}
        {section === 'workspace' && <div className="page">
          <div className="page-heading"><div><p className="eyebrow">Orleans Parish Assessor's Office</p><h1>TC33 Builder Pro</h1><p>Build clean recap workbooks and compare source data to your PSR JSON.</p></div><button className="button quiet" onClick={() => setPalette(true)}>⌘K <span>Quick actions</span></button></div>
          <section className="hero-card"><div className="hero-copy"><span className="eyebrow">YOUR LOCAL WORKSPACE</span><h2>Move from source data to a finished recap.</h2><p>Import spreadsheets in batches, validate against your JSON, and export print-ready TC-33 workbooks.</p><div className="inline-actions"><button className="button primary" disabled={busy} onClick={() => void importSources()}>＋ &nbsp;Import files</button><button className="button hero-secondary" disabled={busy} onClick={() => void importSources('json')}>Select JSON schema</button></div></div><div className="hero-mark" aria-hidden="true">33</div></section>
          <div className="stats-row"><div className="stat-card"><span>Excel workbooks</span><strong>{excelSources.length}</strong></div><div className="stat-card"><span>JSON comparisons</span><strong>{jsonSources.length}</strong></div><div className="stat-card"><span>Recent files</span><strong>{state.recent.length}</strong></div></div>
          <div className="section-heading"><div><h2>Batch workflow</h2><p>Each workbook uses a same-name JSON file when available; otherwise, the first imported JSON is used.</p></div></div>
          <section className="card workflow">
            <div className="workflow-step"><span className="step-number">01</span><div><h3>Import source files</h3><p>Choose files or drop up to 50 Excel workbooks and JSON schemas. JSON parish, FIPS, district, and tax year appear below.</p></div><div className="inline-actions"><button className="button outline" disabled={busy} onClick={() => void importSources()}>Choose files</button><button className="button outline" disabled={busy} onClick={() => void importSources('json')}>Select JSON schema</button></div></div>
            <div className="workflow-step"><span className="step-number">02</span><div><h3>Validate your batch</h3><p>Find differences between spreadsheet rows and the matching PSR data.</p></div><button className="button outline" disabled={busy || !excelSources.length || !jsonSources.length} onClick={() => void validateAll()}>Validate batch</button></div>
            <div className="workflow-step"><span className="step-number">03</span><div><h3>Generate TC-33 workbooks</h3><p>Select one or more source spreadsheets, or use Select all to export the whole batch.</p></div><button className="button primary" disabled={busy || !selectedExcelSources.length} onClick={() => void buildAll()}>Generate selected ({selectedExcelSources.length})</button></div>
          </section>
          {sources.length > 0 && <section className="card source-card"><div className="card-heading"><div><h2>Imported sources</h2><p>Sources are processed locally and are not uploaded.</p></div><div className="inline-actions">{excelSources.length > 0 && <label className="select-all"><input type="checkbox" aria-label="Select all TC-33 workbooks" checked={selectedExcelSources.length === excelSources.length} onChange={(event) => setSelectedSourceIds((prev) => { const next = new Set(prev); for (const source of excelSources) event.target.checked ? next.add(source.path) : next.delete(source.path); return next })} />Select all TC-33</label>}<button className="button quiet" onClick={() => { setSources([]); setSelectedSourceIds(new Set()); setValidationResults([]) }}>Clear list</button></div></div><ul className="source-list">{sources.map((source) => { const isExcel = /\.xlsx$/i.test(source.name); const metadata = source.metadata; return <li key={source.path}>{isExcel && <input type="checkbox" aria-label={`Select ${source.name} for TC-33 export`} checked={selectedSourceIds.has(source.path)} onChange={(event) => setSelectedSourceIds((prev) => { const next = new Set(prev); event.target.checked ? next.add(source.path) : next.delete(source.path); return next })} />}<span className="file-icon">{source.name.toLowerCase().endsWith('.json') ? '{ }' : 'XLS'}</span><div><strong>{source.name}</strong><small>{metadata ? [metadata.parishName, metadata.fipsCode && `FIPS ${metadata.fipsCode}`, metadata.district && `District ${metadata.district}`, metadata.taxYear && `Tax Year ${metadata.taxYear}`].filter(Boolean).join(' · ') || 'JSON loaded; no parish metadata found' : source.name.toLowerCase().endsWith('.json') ? 'JSON loaded; no parish metadata found' : source.path}</small></div><span className="file-type">{source.name.split('.').pop()?.toUpperCase()}</span><button className="button remove-source" aria-label={`Remove ${source.name}`} title={`Remove ${source.name} from this batch`} onClick={() => removeSource(source.path)}>🗑</button></li> })}</ul></section>}
          <section className="card result-card" aria-live="polite"><div className="card-heading"><div><h2>Workspace activity</h2><p>Workbook extraction logs, validation summaries, and export results</p></div>{busy && <span className="running"><i />Working</span>}</div><div className="result-tabs" role="tablist" aria-label="Validation output" onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); const next = resultsTab === 'log' ? 'issues' : 'log'; setResultsTab(next); (next === 'issues' ? issuesTab : runLogTab).current?.focus() } }}><button ref={runLogTab} id="run-log-tab" role="tab" tabIndex={resultsTab === 'log' ? 0 : -1} aria-controls="run-log-panel" aria-selected={resultsTab === 'log'} onClick={() => setResultsTab('log')}>Run log</button><button ref={issuesTab} id="validation-issues-tab" role="tab" tabIndex={resultsTab === 'issues' ? 0 : -1} aria-controls="validation-issues-panel" aria-selected={resultsTab === 'issues'} onClick={() => setResultsTab('issues')}>Validation issues ({issueCount})</button></div>{resultsTab === 'log' ? <pre id="run-log-panel" role="tabpanel" aria-labelledby="run-log-tab" className="result-output">{message}</pre> : <div id="validation-issues-panel" role="tabpanel" aria-labelledby="validation-issues-tab"><ul className="issue-list">{validationResults.map((result) => <li key={`${result.file}:${result.comparedTo}`} className={result.isValid ? 'valid' : 'invalid'}><strong>{result.isValid ? 'PASS' : 'ISSUES'} · {result.file}</strong><small>Compared with {result.comparedTo}</small>{!result.isValid && <ul>{(result.errors.length ? result.errors : [result.summaryLog]).map((issue, index) => <li key={`${index}:${issue}`}>{issue}</li>)}</ul>}</li>)}{!validationResults.length && <li className="empty-row">Run batch validation to see issues by file.</li>}</ul></div>}</section>
          {issueLines.length > 0 && <section className="card source-card"><div className="card-heading"><div><h2>Export invalid report</h2><p>Save validation issues as PDF, Excel, CSV, JSON, text, or Word.</p></div></div><div className="export-formats">{([['pdf','PDF'],['xlsx','Excel'],['csv','CSV'],['json','JSON'],['txt','Text'],['docx','Word']] as const).map(([format,label]) => <button className="button outline" key={format} onClick={() => void exportMismatches(format)}>Export {label}</button>)}</div></section>}
        </div>}
        {section === 'history' && <div className="page"><div className="page-heading"><div><p className="eyebrow">LOCAL HISTORY</p><h1>Recent files & activity</h1><p>Reopen recent sources and review saved validation and export actions.</p></div><button className="button outline" disabled={!state.recent.length && !state.activity.length} onClick={() => setShowHistoryConfirm(true)}>Clear history</button></div>
<section className="card source-card"><div className="card-heading"><div><h2>Recent source files</h2><p>Up to 30 file paths are kept on this device.</p></div></div><ul className="source-list">{state.recent.map((file) => <li key={file.path}><span className="file-icon">{file.name.toLowerCase().endsWith('.json') ? '{ }' : 'XLS'}</span><div><strong>{file.name}</strong><small>{file.openedAt ? new Date(file.openedAt).toLocaleString() : file.path}</small></div><div className="recent-actions"><button className="button quiet" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }} aria-label={`Reopen ${file.name} from disk`} title={`Reopen ${file.name} from disk`} onClick={() => void reopenRecent(file)}>Reopen <svg style={{ width: '1em', height: '1em' }} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9A7 7 0 0 1 18 6.5L20 12M4 12l2 5.5A7 7 0 0 0 18.4 15" /></svg></button><button className="button quiet remove-recent" aria-label={`Remove ${file.name} from recent files`} title={`Remove ${file.name} from recent files`} onClick={() => void removeRecent(file)}>Remove <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3" /></svg></button></div></li>)}{!state.recent.length && <li className="empty-row">No recent files yet.</li>}</ul></section>
          <section className="card source-card"><div className="card-heading"><div><h2>Activity log</h2><p>Most recent actions appear first.</p></div></div><ul className="source-list">{state.activity.map((item) => <li key={item.id}><span className="activity-check">✓</span><div><strong>{item.action} · {item.file}</strong><small>{item.detail} · {new Date(item.at).toLocaleString()}</small></div></li>)}{!state.activity.length && <li className="empty-row">No activity recorded yet.</li>}</ul></section>
        </div>}
        {section === 'settings' && <div className="page"><div className="page-heading"><div><p className="eyebrow">WORKSPACE</p><h1>Preferences</h1><p>Choose how TC-33 Builder Pro looks and names your exports.</p></div></div>
          <section className="card settings-card"><div className="settings-row"><div><h2>Appearance</h2><p>Pick a contrast level for your workspace.</p></div><div className="theme-options" role="group" aria-label="Color theme">{(['light','dark','black','system'] as const).map((theme) => <button key={theme} aria-pressed={state.preferences.theme === theme} className={`theme-option ${state.preferences.theme === theme ? 'chosen' : ''}`} onClick={() => void updatePreferences({ theme })}><i className={`theme-swatch ${theme}`} />{theme === 'black' ? 'Black' : theme[0].toUpperCase() + theme.slice(1)}</button>)}</div></div>
            <div className="settings-row"><div><h2>Report defaults</h2><p>Used when District and Tax Year are missing from an imported workbook’s SQL metadata.</p></div><div className="preference-inputs"><label className="input-control"><span>Default district</span><input inputMode="numeric" pattern="[0-9]" maxLength={1} placeholder="e.g. 1" value={state.preferences.defaultDistrict} onChange={(event) => void updatePreferences({ defaultDistrict: event.target.value.replace(/\D/g, '').slice(0, 1) })} /></label><label className="input-control"><span>Default tax year</span><input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="e.g. 2027" value={state.preferences.defaultTaxYear} onChange={(event) => void updatePreferences({ defaultTaxYear: event.target.value.replace(/\D/g, '').slice(0, 4) })} /></label></div></div>
            <div className="settings-row"><div><h2>Export filename</h2><p>Base name used for generated TC-33 and mismatch reports.</p></div><label className="input-control"><span>File name</span><input value={state.preferences.filename} maxLength={100} onChange={(event) => void updatePreferences({ filename: event.target.value.replace(/[\\/:*?"<>|\0]/g, '').trim() || 'tc33' })} /></label></div>
            <div className="settings-row"><div><h2>JSON report filename</h2><p>Optional custom name for JSON mismatch exports. Leave blank to reuse the standard report name.</p></div><label className="input-control"><span>Optional JSON filename</span><input value={state.preferences.jsonFilename} maxLength={100} placeholder="Use standard filename" onChange={(event) => void updatePreferences({ jsonFilename: event.target.value.replace(/[\\/:*?"<>|\0]/g, '').trim() })} /></label></div>
            <div className="settings-row"><div><h2>Date suffix</h2><p>Optionally append today’s date to export filenames.</p></div><label className="input-control"><span>Date format</span><select value={state.preferences.dateFormat} onChange={(event) => void updatePreferences({ dateFormat: event.target.value as Preferences['dateFormat'] })}><option value="none">No date</option><option value="YYYY-MM-DD">YYYY-MM-DD</option><option value="MM-DD-YYYY">MM-DD-YYYY</option><option value="YYYYMMDD">YYYYMMDD</option></select></label></div>
            <div className="settings-row"><div><h2>Desktop notifications</h2><p>Show system notifications for completed actions; an in-app message is also kept.</p></div><label className="switch"><input type="checkbox" checked={state.preferences.notifications} onChange={(event) => void updatePreferences({ notifications: event.target.checked })}/><span /></label></div>
            <div className="settings-row"><div><h2>Minimize to tray</h2><p>Hide the window when minimized or closed. A tray icon provides a way to restore it; turn this off to quit normally.</p></div><label className="switch"><input type="checkbox" checked={state.preferences.minimizeToTray} onChange={(event) => void updatePreferences({ minimizeToTray: event.target.checked })}/><span /></label></div>
          </section></div>}
        {section === 'team' && <div className="page"><div className="page-heading"><div><p className="eyebrow">ABOUT YOUR TEAM</p><h1>Team</h1><p>Contact your parish assessment software support team.</p></div></div><section className="team-grid">{people.map((person) => <article className="card person-card" key={person.email}><div className="person-avatar">{person.name.split(' ').map((part) => part[0]).join('')}</div><h2>{person.name}</h2><p className="person-role">{person.role}</p><a href={`tel:${person.phone}`}>☎ &nbsp;{person.phone}</a><a href={`mailto:${person.email}`}>✉ &nbsp;{person.email}</a></article>)}</section></div>}
        <footer className="app-footer">
          <span className="footer-status"><span className="status-dot" />{busy ? 'Working' : 'Ready'} · Files stay on this device</span>
          <CopyrightNotice />
        </footer>
      </motion.main>
    </div>
    {palette && <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPalette(false) }}><section className="command-dialog" role="dialog" aria-modal="true" aria-label="Quick actions"><input ref={paletteInput} role="combobox" aria-expanded="true" aria-controls="quick-action-list" aria-activedescendant={commands.length ? `quick-action-${activeCommandIndex}` : undefined} value={paletteQuery} onChange={(event) => { setPaletteQuery(event.target.value); setPaletteIndex(0) }} placeholder="Search actions…" aria-label="Search quick actions" onKeyDown={(event) => { if (event.key === 'Escape') setPalette(false); if (event.key === 'ArrowDown') { event.preventDefault(); setPaletteIndex((index) => Math.min(commands.length - 1, index + 1)) } if (event.key === 'ArrowUp') { event.preventDefault(); setPaletteIndex((index) => Math.max(0, index - 1)) } if (event.key === 'Enter' && commands[activeCommandIndex]) { commands[activeCommandIndex].action(); setPalette(false) } }} /><div className="command-list" id="quick-action-list" role="listbox">{commands.map((command, index) => <button id={`quick-action-${index}`} key={command.label} role="option" aria-selected={index === activeCommandIndex} onMouseEnter={() => setPaletteIndex(index)} onClick={() => { command.action(); setPalette(false) }}>{command.label}<span>↵</span></button>)}{!commands.length && <p>No matching actions.</p>}</div><footer><span>↑↓ Navigate</span><span>Enter Select</span><span>Esc Close</span></footer></section></div>}
    {showHistoryConfirm && <div className="modal-scrim"><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-title"><h2 id="clear-title">Clear saved history?</h2><p>This removes recent file paths and activity from this device. Source workbooks are not deleted.</p><div><button className="button outline" onClick={() => setShowHistoryConfirm(false)}>Cancel</button><button className="button danger" onClick={async () => { const next = api ? await api.clearHistory() : { ...state, recent: [], activity: [] }; setWorkspace(next); setShowHistoryConfirm(false) }}>Clear history</button></div></section></div>}
  </div>
}
export default App
