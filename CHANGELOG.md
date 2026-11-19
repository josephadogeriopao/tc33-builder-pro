# Changelog

This file records implemented changes, not a promise that an installer has been
released or signed. Package version is currently `1.0.0`.

## - 2026-11-19

### Interface and recent-files follow-up

- Merged the reload action and icon directly into the theme-aware `Reopen`
  button so text and icons remain legible across light, dark, and black views.
- Restored office copyright in the persistent workspace footer.
- Updated Playwright UI regression tests to verify recent-file reopening,
  run-log feedback, navigation back to `Recent & activity`, and entry removal.

### Build, packaging, and CI

- Added `vite.web.config.ts` and `npm run dev:web` for browser-based renderer
  development and testing.
- Configured `electron-vite` main-process dependency bundling for `exceljs`,
  `docx`, and `zod` so packaged Windows builds include all nested runtime modules.
- Configured Windows packaging scripts (`build:portable`, `build:installer`,
  `build:win`) using `electron-builder` for both NSIS setup installers and
  unpacked directory builds.
- Updated GitHub Actions test workflows to target `tc33-builder-pro/`, install
  Electron binaries cleanly, and run unit, typecheck, build, and Playwright UI tests.

### Documentation

- Added `README.md` with quick-start instructions, command reference, and
  screenshot placeholders.
- Added `SECURITY.md` documenting local data handling, sandboxing boundaries,
  and vulnerability reporting, along with `AUTHORS.md` and `CHANGELOG.md`.

### Version 1.0.0 baseline

- Built the local-first Electron, Vite, and React workspace for TC-33 recap
  workbook generation and PSR JSON validation.
- Added batch import for up to 50 Excel workbooks (`.xlsx`, `.xls`) and PSR
  JSON schemas with automatic parish, FIPS code, district, and tax year
  metadata extraction.
- Added spreadsheet-to-JSON discrepancy validation with mismatch exports in six
  formats (`.xlsx`, `.csv`, `.json`, `.pdf`, `.docx`, `.txt`).
- Added pinned sidebar navigation (`Overview`, `Recent & activity`,
  `Preferences`, `Team`), `Ctrl+K` command palette, appearance themes, and
  schema-validated local preferences (`electron-store` and `zod`).
- Added sandboxed renderer boundaries, typed `contextBridge` preload API, and
  Node ETL/validation unit tests alongside Playwright browser tests.
