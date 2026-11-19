# Security and privacy

**TC33 Builder Pro** processes tax-roll spreadsheets, recap workbooks, and PSR
JSON data locally on the user's device. Local processing reduces external
exposure but does not constitute encryption, identity verification, or a
regulatory compliance guarantee.

## Data handling

- Source spreadsheets (`.xlsx`, `.xls`) and PSR JSON schemas are processed in
  local memory and are not uploaded to any application server. Operating-system
  memory, swap, crash dumps, and device backups are outside this guarantee.
- Source files and generated TC-33 workbooks or validation mismatch exports
  remain on disk under the user's control. Clearing workspace lists or
  removing recent history entries does not delete those files from disk.
- Appearance theme, export defaults (district, tax year, filename formats),
  and user preferences persist locally in Electron's user-data directory.
- Recent file paths and workspace activity logs persist unencrypted in
  Electron's user-data directory. File paths, parish/district identifiers, and
  batch event metadata may be sensitive.
- Validation issue logs record file names, class/group discrepancies, and
  summary messages rather than dumping entire source workbooks.
- The packaged application uses no backend API or external CDN assets.
  Dependency installation (`npm install`) and Playwright/Electron binary
  downloads may use the network during development and CI testing.

Property descriptions, parcel/class figures, parish metadata, and source
filenames may contain sensitive assessment or organizational information. Use
approved storage, access controls, backup policies, and retention procedures
for both inputs and exported reports.

## Implemented protections

- The renderer process is sandboxed and context-isolated with Node integration
  disabled (`nodeIntegration: false`, `contextIsolation: true`).
- A narrow `contextBridge` preload API handles native file dialogs, recent-file
  reloads, and file exports.
- External navigation and unauthorized window creation are blocked, and the
  renderer enforces a Content Security Policy (CSP).
- Input parameters, file paths, and preference schemas are validated in the
  main process (including path-traversal checks on export filenames and URL
  scheme validation on external links).
- Spreadsheet text fields are sanitized to prevent formula injection when
  generating output workbooks and reports.

These controls do not replace dependency review, endpoint security, disk
encryption, or testing on the operating systems where the application is
deployed. Someone with physical or OS-level access to the running application
and device must be treated as having access to its local data.

## Reporting a vulnerability

Report suspected vulnerabilities privately to the repository maintainer
(**Joseph Adogeri**, `joseph.adogeri@orleansassessors.com`) or through GitHub's
private security advisory flow at
<https://github.com>.

Do not post real assessment data, confidential workbooks, internal network
details, or credentials in public GitHub issues or pull requests. Provide a
minimal synthetic reproduction, affected version or commit hash, operating
system, and expected impact. There is no published response-time or SLA
commitment in this repository.

## Distribution and policy

Keep Electron and npm dependencies reviewed and up to date, and verify code
signing and installer behavior before distributing builds. Notice that
repository logs (`electron-crash.log`, `error.log`) should not be committed
with sensitive local paths.

This repository is maintained for **Orleans Parish Assessor's Office** (`© 2026
Orleans Parish Assessor's Office. All rights reserved.`). Unless a separate
license file is added by the rights holder, the in-app copyright notice does not
grant open-source redistribution or modification rights.
