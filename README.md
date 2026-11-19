

# TC33 Builder Pro

A local-first TypeScript desktop application built with Electron, Vite, and React for generating TC-33 recap workbooks and validating source spreadsheets against PSR JSON data.

- **Author:** Joseph Adogeri (<joseph.adogeri@orleansassessors.com>)
- **Version:** `1.0.0`
- **Since:** November 2026

## Quick start

Requires Node.js 22+ and a desktop OS for Electron.

```bash
git clone https://github.com
cd tc33-builder-pro/tc33-builder-pro
npm ci
npm run dev
```

All spreadsheet extraction, PSR JSON comparison, and report generation run locally on your device without uploading files to external servers.

## Core features

- **Batch workbook import & TC-33 generation:** Import up to 50 `.xlsx` / `.xls` workbooks and generate formatted TC-33 Excel workbooks (`ExcelJS`).
- **PSR JSON validation:** Compare spreadsheet recap rows against matching parish PSR JSON schemas (parish name, FIPS code, district, tax year, assessed/taxable values, and exemptions) and export validation mismatch reports in six formats (`.xlsx`, `.csv`, `.json`, `.pdf`, `.docx`, `.txt`).
- **Workspace shell & quick actions:** Pinned navigation (`Overview`, `Recent & activity`, `Preferences`, `Team`), `Ctrl+K` keyboard command palette, and recent-file history stored locally on disk.
- **Appearance & preferences:** Light, dark, and black themes with schema-validated user preferences (`electron-store` and `zod`) for default district, tax year, and output filenames.
- **Security & reliability:** Sandboxed renderer with context isolation, narrow `contextBridge` preload API, Content Security Policy (CSP), path-traversal guards, rotating logs (`electron-log`), and GitHub release auto-updates (`electron-updater`).

## Commands

Run inside `tc33-builder-pro/`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Launch Electron with Vite HMR |
| `npm run dev:web` | Run the renderer in a browser via `vite.web.config.ts` |
| `npm run preview` | Preview the production Electron build locally |
| `npm run typecheck` | Type-check main, preload, renderer, and tests (`tsc --noEmit`) |
| `npm test` | Run Node unit and ETL validation tests (`tsx --test`) |
| `npm run test:ui` | Run Playwright browser UI tests against the workspace |
| `npm run build` | Build main, preload, and renderer production bundles |
| `npm run build:portable` | Package the unpacked Windows directory build (`dist/win-unpacked`) |
| `npm run build:installer` | Package the Windows NSIS setup installer (`dist/TC33 Builder Pro Setup 1.0.0.exe`) |
| `npm run build:win` | Build both the Windows NSIS installer and unpacked portable directory |

Before the first UI test run, install Playwright's browser binary with `npx playwright install chromium` (on Linux CI, use `npx playwright install --with-deps chromium`).


## Packaging and updates

1. Verify `appId`, `productName`, icons (`resources/icon.ico`), and version in `tc33-builder-pro/package.json`.
2. Update the package version and `package-lock.json` together before tagging a release (for example, `v1.0.0`).
3. Run `npm run build:win` to produce the Windows NSIS installer and `win-unpacked` portable directory in `tc33-builder-pro/dist/`.
4. Default Windows artifacts are built with `signAndEditExecutable: false` (unsigned). Test installers on target Windows machines before distributing.

## Documentation 

## Documentation

See [SECURITY.md](SECURITY.md) for local data handling, sandboxing, and vulnerability reporting, and [AUTHORS.md](AUTHORS.md) for maintainer information.

Place project documentation and screenshot assets in the following repository paths:

- **Changelog:** [`CHANGELOG.md`](./CHANGELOG.md) (root)
- **Security Policy:** [`SECURITY.md`](./SECURITY.md) (root)
- **Authors:** [`AUTHORS.md`](./AUTHORS.md) (root)
- **Additional Guides:** [`docs/`](./docs/)

## Screenshots

- **Screenshots:** [`docs/screenshots/`](./docs/screenshots/)
  - `docs/screenshots/overview-workspace.png`
  - `docs/screenshots/validation-report.png`
  - `docs/screenshots/recent-activity.png`
  - `docs/screenshots/preferences-dark.png`

## Licensing

© 2026 **Orleans Parish Assessor's Office**. All rights reserved. No open-source license has been granted; third-party npm packages retain their respective licenses.
