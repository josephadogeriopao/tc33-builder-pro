"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const electron = require("electron");
const utils = require("@electron-toolkit/utils");
const node_path = require("node:path");
const node_url = require("node:url");
const zod = require("zod");
const Store = require("electron-store");
const node_crypto = require("node:crypto");
const promises = require("node:fs/promises");
const node_buffer = require("node:buffer");
const log = require("electron-log/main");
const ExcelJS = require("exceljs");
const log$1 = require("electron-log");
const updater = require("electron-updater");
const fs = require("fs");
const themeSchema = zod.z.enum(["light", "dark", "black", "system"]);
const preferencesSchema = zod.z.object({
  theme: themeSchema.default("light"),
  minimizeToTray: zod.z.boolean().default(false),
  notifications: zod.z.boolean().default(false),
  filename: zod.z.string().trim().min(1).max(100).refine((name) => !/[\\/:*?"<>|\0]/.test(name) && !name.endsWith("."), "Use a valid filename without an extension").default("tc33"),
  dateFormat: zod.z.enum(["none", "YYYY-MM-DD", "MM-DD-YYYY", "YYYYMMDD"]).default("none"),
  defaultDistrict: zod.z.string().regex(/^\d?$/, "District must be one digit").default(""),
  defaultTaxYear: zod.z.string().regex(/^(|\d{4})$/, "Tax year must be four digits").default(""),
  jsonFilename: zod.z.string().trim().max(100).refine(
    (name) => !/[\\/:*?"<>|\0]/.test(name) && !name.endsWith("."),
    "Use a valid filename without an extension"
  ).default("")
});
const activitySchema = zod.z.object({
  action: zod.z.string().max(80),
  file: zod.z.string().max(255),
  detail: zod.z.string().max(500)
});
const settingsSchema = zod.z.object({ theme: themeSchema.default("system") });
const windowStateSchema = zod.z.object({
  x: zod.z.number().finite().optional(),
  y: zod.z.number().finite().optional(),
  width: zod.z.number().int().min(600).max(16384).default(1e3),
  height: zod.z.number().int().min(500).max(16384).default(800),
  maximized: zod.z.boolean().default(false)
});
const saveFileSchema = zod.z.tuple([
  zod.z.string().min(1).max(255).refine((name) => !/[\\/\0]/.test(name), "Use a filename, not a path"),
  zod.z.string().max(10 * 1024 * 1024)
]);
function safeExternalURL(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
function updatePercent(value) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0;
}
const store = new Store({ name: "preferences", clearInvalidConfig: true });
function getSettings() {
  const result = settingsSchema.safeParse(store.get("settings", {}));
  return result.success ? result.data : { theme: "system" };
}
function setTheme(theme) {
  const settings = { ...getSettings(), theme: themeSchema.parse(theme) };
  store.set("settings", settings);
  electron.nativeTheme.themeSource = settings.theme === "black" ? "dark" : settings.theme;
  store.set("preferences", { ...getPreferences(), theme: settings.theme });
  return settings;
}
function getPreferences() {
  const parsed = preferencesSchema.safeParse(store.get("preferences", { theme: getSettings().theme }));
  return parsed.success ? parsed.data : preferencesSchema.parse({});
}
function setPreferences(input) {
  const preferences = preferencesSchema.parse(input);
  store.set("preferences", preferences);
  store.set("settings", { theme: preferences.theme });
  electron.nativeTheme.themeSource = preferences.theme === "black" ? "dark" : preferences.theme;
  return preferences;
}
function getWorkspace() {
  return {
    preferences: getPreferences(),
    recent: store.get("recent", []),
    activity: store.get("activity", [])
  };
}
function rememberFile(file) {
  store.set("recent", [file, ...getWorkspace().recent.filter((r) => r.path !== file.path)].slice(0, 30));
}
function removeRecentFile(filePath) {
  const recent = getWorkspace().recent;
  if (!recent.some((file) => file.path === filePath)) throw new Error("File is not in recent history.");
  store.set("recent", recent.filter((file) => file.path !== filePath));
  return getWorkspace();
}
function recordActivity(input) {
  const entry = activitySchema.parse(input);
  store.set("activity", [{ ...entry, id: node_crypto.randomUUID(), at: (/* @__PURE__ */ new Date()).toISOString() }, ...getWorkspace().activity].slice(0, 200));
  return getWorkspace();
}
function clearHistory() {
  store.set("recent", []);
  store.set("activity", []);
  return getWorkspace();
}
function getWindowState() {
  const result = windowStateSchema.safeParse(store.get("window", {}));
  return result.success ? result.data : windowStateSchema.parse({});
}
function saveWindowState(state2) {
  store.set("window", windowStateSchema.parse(state2));
}
const channels = {
  openFile: "app:open-file",
  saveFile: "app:save-file",
  command: "app:command",
  updateStatus: "update:status",
  installUpdate: "update:install",
  getVersion: "app:get-version",
  checkForUpdates: "update:check",
  getUpdateState: "update:get-state",
  getSettings: "settings:get",
  setTheme: "settings:set-theme",
  themeChanged: "theme:changed",
  toast: "app:toast",
  windowControl: "window:control",
  getWorkspace: "workspace:get",
  setPreferences: "workspace:preferences",
  openSources: "workspace:open",
  importDroppedSources: "workspace:import-dropped",
  reopenSource: "workspace:reopen",
  removeRecentFile: "workspace:remove-recent",
  recordActivity: "workspace:activity",
  clearHistory: "workspace:clear",
  saveExport: "workspace:export",
  exportMismatches: "workspace:export-mismatches",
  validateSources: "workspace:validate-sources",
  generateSources: "workspace:generate-sources",
  rendererReady: "window:ready"
};
let tray;
let quitting = false;
const isQuitting = () => quitting;
const hasTray = () => !!tray && !tray.isDestroyed();
electron.app.on("before-quit", () => {
  quitting = true;
});
electron.app.on("will-quit", () => {
  tray?.destroy();
  tray = void 0;
});
function notify(window, message) {
  const fallback = () => {
    if (!window.isDestroyed()) window.webContents.send(channels.toast, message);
  };
  if (!getPreferences().notifications || !electron.Notification.isSupported()) return fallback();
  try {
    const notification = new electron.Notification({ title: "TC33 Builder Pro", body: message });
    notification.on("failed", fallback);
    notification.on("click", () => {
      if (!window.isDestroyed()) {
        window.show();
        window.focus();
      }
    });
    notification.show();
    fallback();
  } catch {
    fallback();
  }
}
function registerTray(window) {
  if (hasTray()) return;
  try {
    const image = electron.nativeImage.createFromPath(node_path.join(electron.app.getAppPath(), "resources/icon.png")).resize({ width: 20, height: 20 });
    if (image.isEmpty()) return;
    tray = new electron.Tray(image);
    const show = () => {
      if (!window.isDestroyed()) {
        window.show();
        window.restore();
        window.focus();
      }
    };
    tray.setToolTip("TC33 Builder Pro");
    tray.setContextMenu(electron.Menu.buildFromTemplate([
      { label: "Show TC33 Builder Pro", click: show },
      { label: "Quit", click: () => electron.app.quit() }
    ]));
    tray.on("click", show);
    window.on("closed", () => {
      tray?.destroy();
      tray = void 0;
    });
  } catch {
    tray = void 0;
  }
}
function unregisterTray() {
  tray?.destroy();
  tray = void 0;
}
const __dirname$2 = node_path.dirname(node_url.fileURLToPath(require("url").pathToFileURL(__filename).href));
function createMainWindow() {
  const { width: screenWidth, height: screenHeight } = electron.screen.getPrimaryDisplay().workAreaSize;
  const resourcesDir = node_path.join(electron.app.getAppPath(), "resources");
  const appIcon = process.platform === "win32" ? node_path.join(resourcesDir, "icon.ico") : node_path.join(resourcesDir, "icon.png");
  const saved = getWindowState();
  const visible = saved.x !== void 0 && saved.y !== void 0 && electron.screen.getAllDisplays().some(({ workArea: a }) => saved.x >= a.x && saved.y >= a.y && saved.x < a.x + a.width - 80 && saved.y < a.y + a.height - 80);
  const mainWindow = new electron.BrowserWindow({
    width: Math.min(saved.width, screenWidth),
    height: Math.min(saved.height, screenHeight),
    ...visible ? { x: saved.x, y: saved.y } : {},
    minWidth: 600,
    minHeight: 500,
    maxWidth: Math.round(screenWidth / 1.5),
    maxHeight: screenHeight,
    show: false,
    frame: false,
    title: "TC33 Builder Pro",
    backgroundColor: "#182c40",
    icon: appIcon,
    webPreferences: {
      preload: node_path.join(__dirname$2, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (saved.maximized) mainWindow.maximize();
  const splash = new electron.BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    resizable: false,
    show: false,
    backgroundColor: "#182c40",
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  });
  const splashStartedAt = Date.now();
  let revealRequested = false;
  let revealDelay;
  void splash.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(
    '<!doctype html><html lang="en"><title>Starting TC33</title><body style="background:#182c40;color:#fff;font:20px system-ui;text-align:center;padding:60px 10px"><h1 style="color:#ffb45e">TC33 Builder Pro</h1><p role="status">Opening your workspace…</p></body></html>'
  ));
  splash.once("ready-to-show", () => {
    if (!splash.isDestroyed()) splash.show();
  });
  const showMainWindow = () => {
    clearTimeout(timeout);
    if (!splash.isDestroyed()) splash.destroy();
    if (!mainWindow.isDestroyed()) mainWindow.show();
  };
  const reveal = () => {
    if (revealRequested) return;
    revealRequested = true;
    const remaining = Math.max(0, 2500 - (Date.now() - splashStartedAt));
    if (remaining) revealDelay = setTimeout(showMainWindow, remaining);
    else showMainWindow();
  };
  const timeout = setTimeout(reveal, 8e3);
  mainWindow.once("ready-to-show", reveal);
  mainWindow.once("closed", () => {
    clearTimeout(timeout);
    if (revealDelay) clearTimeout(revealDelay);
    if (!splash.isDestroyed()) splash.destroy();
  });
  mainWindow.webContents.once("did-fail-load", reveal);
  mainWindow.webContents.on("render-process-gone", () => {
    if (mainWindow.isDestroyed()) return;
    void electron.dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "Display process stopped",
      message: "The application display stopped unexpectedly.",
      detail: "Reload the window to recover, or close the application.",
      buttons: ["Reload", "Close"],
      defaultId: 0,
      cancelId: 1
    }).then(({ response }) => {
      if (mainWindow.isDestroyed()) return;
      if (response === 0) mainWindow.reload();
      else mainWindow.close();
    }).catch(() => {
    });
  });
  mainWindow.on("close", (event) => {
    saveWindowState({ ...mainWindow.getNormalBounds(), maximized: mainWindow.isMaximized() });
    if (!isQuitting() && getPreferences().minimizeToTray && hasTray()) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on("minimize", () => {
    if (getPreferences().minimizeToTray && hasTray()) mainWindow.hide();
  });
  const openExternal = (value) => {
    const url = safeExternalURL(value);
    if (url) void electron.shell.openExternal(url).catch(() => {
    });
  };
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.split("#")[0] !== mainWindow.webContents.getURL().split("#")[0]) {
      event.preventDefault();
      openExternal(url);
    }
  });
  electron.session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  electron.session.defaultSession.setPermissionCheckHandler(() => false);
  electron.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const development = utils.is.dev && !!process.env.ELECTRON_RENDERER_URL;
    const devOrigin = development ? new URL(process.env.ELECTRON_RENDERER_URL).origin : "";
    const devSocket = devOrigin.replace(/^http/, "ws");
    const policy = [
      "default-src 'self'",
      `script-src 'self'${development ? " 'unsafe-inline'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      `connect-src 'self'${development ? ` ${devOrigin} ${devSocket}` : ""}`,
      "object-src 'none'",
      "base-uri 'none'",
      "frame-src 'none'",
      "form-action 'none'"
    ].join("; ");
    callback({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [policy] } });
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(node_path.join(__dirname$2, "../renderer/index.html"));
  }
  return mainWindow;
}
const __dirname$1 = node_path.dirname(node_url.fileURLToPath(require("url").pathToFileURL(__filename).href));
function assertTrustedSender(event) {
  const frame = event.senderFrame;
  const expected = utils.is.dev && process.env.ELECTRON_RENDERER_URL ? process.env.ELECTRON_RENDERER_URL : node_url.pathToFileURL(node_path.join(__dirname$1, "../renderer/index.html")).href;
  const normalize = (value) => {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  };
  if (!electron.BrowserWindow.fromWebContents(event.sender) || !frame || frame !== event.sender.mainFrame || normalize(frame.url) !== normalize(expected)) {
    throw new Error("Untrusted IPC sender");
  }
}
function handle(name, handler) {
  electron.ipcMain.handle(channels[name], (event, ...args) => {
    assertTrustedSender(event);
    return handler(event, ...args);
  });
}
function registerLogger() {
  log.initialize();
  log.transports.file.resolvePathFn = () => node_path.join(electron.app.getPath("logs"), "main.log");
  log.transports.file.maxSize = 5 * 1024 * 1024;
  const fatalError = (event) => {
    log.error({ event });
    electron.dialog.showErrorBox("Application error", "The application encountered an unexpected error and must close. Reopen it to try again.");
    electron.app.exit(1);
  };
  process.on("unhandledRejection", () => fatalError("unhandled-rejection"));
  process.on("uncaughtException", () => fatalError("main-process-crash"));
  electron.app.on("render-process-gone", (_event, _contents, details) => {
    log.error({ event: "renderer-process-gone", reason: details.reason });
  });
}
async function readFileBuffer(file) {
  return await file.arrayBuffer();
}
async function readJsonFile(file) {
  const text = await file.text();
  return JSON.parse(text);
}
async function extractXlsxFile(file) {
  const buffer = await readFileBuffer(file);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  const sheetName = worksheet?.name;
  if (!worksheet || !sheetName) {
    throw new Error(`No worksheets found in "${file.name}".`);
  }
  const normalizeCell = (value) => {
    if (value === null || value === void 0) return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    if (value instanceof Date) return value.toISOString();
    if ("result" in value && value.result !== void 0) return normalizeCell(value.result);
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
    return String(value);
  };
  const readRows = (sheet) => {
    const rows2 = [];
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      rows2[rowNumber - 1] = Array.from(
        { length: sheet.columnCount },
        (_, index) => normalizeCell(row.getCell(index + 1).value)
      );
    });
    return rows2;
  };
  const rows = readRows(worksheet);
  let sqlScript = "";
  for (const candidateSheet of workbook.worksheets) {
    const name = candidateSheet.name;
    const sheetRows = readRows(candidateSheet);
    const isSqlTab = name.trim().toUpperCase().includes("SQL") || name !== sheetName && sheetRows.some(
      (r) => r.some((cell) => /SELECT\s+[\s\S]*TROLL_AVALUE/i.test(String(cell)))
    );
    if (isSqlTab) {
      sqlScript = sheetRows.map(
        (r) => r.map((cell) => cell === null || cell === void 0 ? "" : String(cell)).join(" ").trimEnd()
      ).join("\n").trim();
      break;
    }
  }
  const outputLines = [
    `Loaded: ${file.name} | Sheet: ${sheetName} (${rows.length} rows)`,
    "----------------------------------------"
  ];
  rows.forEach((row, rowIndex) => {
    const columnsText = row.map((cellValue, colIndex) => `Col ${colIndex + 1}: "${cellValue}"`).join(" | ");
    outputLines.push(`Row ${rowIndex + 1}: ${columnsText}`);
  });
  return {
    fileName: file.name,
    sheetName,
    rows,
    sqlScript,
    formattedLog: outputLines.join("\n")
  };
}
async function extractJsonSchema(file) {
  return await readJsonFile(file);
}
async function buildTc33Workbook(report, outputFileName = "tc33.xlsx", headerOptions) {
  const district = (report.district ?? "").trim();
  const taxYear = (report.taxYear ?? "").trim();
  if (!district || !taxYear) {
    const missing = [];
    if (!district) missing.push("District");
    if (!taxYear) missing.push("Tax Year");
    throw new Error(`Missing required report metadata: ${missing.join(" and ")}. Please enter them before exporting.`);
  }
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("TC33 Report", {
    views: [
      {
        state: "frozen",
        ySplit: 1
      }
    ],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: "1:1",
      margins: {
        left: 0.5,
        right: 0.5,
        top: 1,
        bottom: 0.75,
        header: 0.3,
        footer: 0.3
      }
    },
    headerFooter: {
      oddHeader: `&L&"Aptos Narrow,Bold"&11&K000000ORLEANS PARISH ASSESSOR'S OFFICE
&"Aptos Narrow,Bold"&11&K000000TC-33 ACTIVE RECAP
&"Aptos Narrow,Bold"&11&K000000DISTRICT ${district}- TAX YEAR ${taxYear}`
    }
  });
  worksheet.columns = [
    { width: 34 },
    // A: GROUP
    { width: 42 },
    // B: DESCRIPTION
    { width: 8 },
    // C: UNITS
    { width: 15 },
    // D: HOMESTEAD_CREDIT
    { width: 16 },
    // E: VETERAN_CREDIT
    { width: 22 },
    // F: FIRSTRESPONDER_CREDIT
    { width: 18 },
    // G: TOTAL ASSESSED
    { width: 18 }
    // H: TAXABLE_VALUE
  ];
  const baseFont = { name: "Aptos Narrow", size: 11 };
  const boldFont = { name: "Aptos Narrow", size: 11, bold: true };
  const applyNumberFormat = (row) => {
    for (let col = 4; col <= 8; col++) {
      const cell = row.getCell(col);
      if (typeof cell.value === "number") {
        cell.numFmt = "#,##0";
      }
      cell.alignment = { horizontal: "right" };
    }
  };
  const applyValueBlockBorder = (row, startCol = 4, endCol = 8) => {
    const borderStyle = { style: "medium", color: { argb: "FF000000" } };
    for (let col = startCol; col <= endCol; col++) {
      const cell = row.getCell(col);
      const val = cell.value;
      if (val === null || val === void 0) continue;
      const strVal = String(val).trim();
      if (strVal === "" || strVal === "-") continue;
      cell.border = {
        top: borderStyle,
        bottom: borderStyle,
        left: borderStyle,
        right: borderStyle
      };
    }
  };
  const headerRow = worksheet.addRow([
    "GROUP",
    "DESCRIPTION",
    "UNITS",
    "HOMESTEAD",
    "VETERAN_CREDIT",
    "FIRSTRESPONDER_CREDIT",
    "TOTAL ASSESED",
    "TAXABLE_VALUE"
  ]);
  headerRow.eachCell((cell, colNumber) => {
    cell.font = boldFont;
    cell.alignment = { horizontal: colNumber >= 4 ? "right" : "left" };
  });
  const addBlankRow = () => {
    worksheet.addRow(["", "", "", "", "", "", "", ""]);
  };
  const appendGroupBlock = (groupCode, hasBlockBorder = false) => {
    const group = report.groups.get(groupCode);
    if (!group) return;
    group.items.forEach((item, index) => {
      const dataRow = worksheet.addRow([
        index === 0 ? group.rawGroupLabel : "",
        item.rawDescription,
        item.units ?? " ",
        item.homesteadCredit,
        item.veteranCredit,
        item.firstResponderCredit,
        item.totalAssessed,
        item.taxableValue
      ]);
      dataRow.font = baseFont;
      if (index === 0) {
        dataRow.getCell(1).font = boldFont;
      }
      applyNumberFormat(dataRow);
    });
    addBlankRow();
    const totals = group.sheetTotalRow ?? group.calculatedTotals;
    const totalRow = worksheet.addRow([
      `${group.rawGroupLabel} TOTAL`,
      " ",
      " ",
      totals.homesteadCredit,
      totals.veteranCredit,
      totals.firstResponderCredit,
      totals.totalAssessed,
      totals.taxableValue
    ]);
    totalRow.font = boldFont;
    applyNumberFormat(totalRow);
    if (hasBlockBorder) {
      applyValueBlockBorder(totalRow);
    }
    addBlankRow();
  };
  const appendSummaryRow = (label, vals, includeTaxable = true, addTrailingBlankRow = true, hasBlockBorder = true) => {
    if (!vals) return;
    const summaryRow = worksheet.addRow([
      "",
      label,
      "",
      "",
      "",
      "",
      vals.totalAssessed,
      includeTaxable ? vals.taxableValue : ""
    ]);
    summaryRow.font = boldFont;
    applyNumberFormat(summaryRow);
    if (hasBlockBorder) {
      applyValueBlockBorder(summaryRow);
    }
    if (addTrailingBlankRow) {
      addBlankRow();
    }
  };
  appendGroupBlock("1", true);
  appendGroupBlock("2");
  appendGroupBlock("3");
  appendSummaryRow("TOTAL PERSONAL PROPERTY ", report.summaryRows.totalPersonalProperty, true, true, true);
  appendGroupBlock("4", true);
  appendSummaryRow("TOTAL ACTIVE", report.summaryRows.totalActive, true, true, true);
  appendGroupBlock("6");
  appendGroupBlock("7", true);
  appendGroupBlock("8", true);
  appendSummaryRow("TOTAL EXEMPT", report.summaryRows.totalExempt, false, false, true);
  if (report.sqlScript) {
    const sqlSheet = workbook.addWorksheet("SQL");
    sqlSheet.columns = [{ width: 120 }];
    report.sqlScript.split(/\r?\n/).forEach((line) => {
      const row = sqlSheet.addRow([line]);
      row.font = { name: "Consolas", size: 10 };
    });
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
function getDashValue() {
  return "-";
}
function toNullableNumber(val) {
  if (val === null || val === void 0) return null;
  const str = String(val).trim();
  if (str === "") return null;
  const num = Number(str.replace(/,/g, ""));
  if (Number.isNaN(num)) return null;
  return num === 0 ? getDashValue() : num;
}
function createEmptyValues() {
  return {
    homesteadCredit: 0,
    veteranCredit: 0,
    firstResponderCredit: 0,
    totalAssessed: 0,
    taxableValue: 0
  };
}
function addAssessmentValues(target, source) {
  if (!source) return;
  target.homesteadCredit = (typeof target.homesteadCredit === "number" ? target.homesteadCredit : 0) + (typeof source.homesteadCredit === "number" ? source.homesteadCredit : 0);
  target.veteranCredit = (typeof target.veteranCredit === "number" ? target.veteranCredit : 0) + (typeof source.veteranCredit === "number" ? source.veteranCredit : 0);
  target.firstResponderCredit = (typeof target.firstResponderCredit === "number" ? target.firstResponderCredit : 0) + (typeof source.firstResponderCredit === "number" ? source.firstResponderCredit : 0);
  target.totalAssessed = (typeof target.totalAssessed === "number" ? target.totalAssessed : 0) + (typeof source.totalAssessed === "number" ? source.totalAssessed : 0);
  target.taxableValue = (typeof target.taxableValue === "number" ? target.taxableValue : 0) + (typeof source.taxableValue === "number" ? source.taxableValue : 0);
}
function parseAssessmentValues(row) {
  return {
    homesteadCredit: toNullableNumber(row[3]),
    veteranCredit: toNullableNumber(row[4]),
    firstResponderCredit: toNullableNumber(row[5]),
    totalAssessed: toNullableNumber(row[6]),
    taxableValue: toNullableNumber(row[7])
  };
}
function parseGroupLabel(rawGroup) {
  const match = rawGroup.match(/^(\d+)\s*(.+)$/);
  if (match) {
    return {
      groupCode: match[1],
      groupName: match[2].trim()
    };
  }
  return {
    groupCode: "",
    groupName: rawGroup.trim()
  };
}
function parseDescription(rawDesc) {
  const trimmed = rawDesc.trim();
  const match = trimmed.match(/^(\d+)\s+(.+)$/);
  if (match) {
    return {
      classCode: match[1],
      className: match[2].trim()
    };
  }
  return {
    classCode: "",
    className: trimmed
  };
}
function parseSqlMetadata(sqlScript) {
  if (!sqlScript) return {};
  const activeLines = sqlScript.split(/\r?\n/).filter((line) => !line.trim().startsWith("--")).join("\n");
  const taxYearMatch = activeLines.match(/TAX_YEAR\s*=\s*'?(\d{4})'?/i);
  const fipsMatch = activeLines.match(/FIPS_CODE\s*=\s*'?(\d+)'?/i);
  const taxYear = taxYearMatch ? taxYearMatch[1] : void 0;
  const fipsCode = fipsMatch ? fipsMatch[1] : void 0;
  const district = fipsCode ? fipsCode.slice(-1) : void 0;
  return { district, taxYear };
}
function transform(extractedRows, sqlScript) {
  const groups = /* @__PURE__ */ new Map();
  const errors = [];
  const { district, taxYear } = parseSqlMetadata(sqlScript);
  if (extractedRows.length < 2) {
    return {
      isValid: false,
      report: { groups, summaryRows: {}, district, taxYear, sqlScript },
      errors: ["Spreadsheet has no data rows."]
    };
  }
  let currentGroupCode = null;
  for (let i = 1; i < extractedRows.length; i++) {
    const row = extractedRows[i];
    const rawGroup = String(row[0] ?? "").trim();
    const rawDescription = String(row[1] ?? "").trim();
    const units = String(row[2] ?? "").trim();
    const values = parseAssessmentValues(row);
    const isRowEmpty = !rawGroup && !rawDescription && values.homesteadCredit === null && values.veteranCredit === null && values.firstResponderCredit === null && values.totalAssessed === null && values.taxableValue === null;
    if (isRowEmpty) {
      continue;
    }
    if (!rawGroup && rawDescription.toUpperCase().startsWith("TOTAL")) {
      continue;
    }
    if (rawGroup) {
      const cleanLabel = rawGroup.replace(/\s*TOTAL$/i, "").trim();
      const { groupCode, groupName } = parseGroupLabel(cleanLabel);
      const key = groupCode || groupName;
      currentGroupCode = key;
      if (!groups.has(key)) {
        groups.set(key, {
          groupCode,
          groupName,
          rawGroupLabel: cleanLabel,
          items: [],
          calculatedTotals: createEmptyValues()
        });
      }
    }
    if (!currentGroupCode || !groups.has(currentGroupCode)) {
      errors.push(`Row ${i + 1}: Found item "${rawDescription}" outside of any active group.`);
      continue;
    }
    const group = groups.get(currentGroupCode);
    const isRollupTotalRow = rawGroup !== "" && rawDescription === "" || rawGroup.toUpperCase().endsWith("TOTAL");
    if (isRollupTotalRow) {
      group.sheetTotalRow = values;
      if (values.totalAssessed !== null && group.calculatedTotals.totalAssessed !== values.totalAssessed) {
        errors.push(
          `Group "${group.rawGroupLabel}" Total Assessed mismatch: sheet=${values.totalAssessed}, calculated=${group.calculatedTotals.totalAssessed}`
        );
      }
      currentGroupCode = null;
      continue;
    }
    const { classCode, className } = parseDescription(rawDescription);
    const item = {
      classCode,
      className,
      rawDescription,
      units: units || void 0,
      ...values
    };
    group.items.push(item);
    addAssessmentValues(group.calculatedTotals, values);
  }
  const totalPersonalProperty = createEmptyValues();
  const g2 = groups.get("2");
  const g3 = groups.get("3");
  addAssessmentValues(totalPersonalProperty, g2?.sheetTotalRow ?? g2?.calculatedTotals);
  addAssessmentValues(totalPersonalProperty, g3?.sheetTotalRow ?? g3?.calculatedTotals);
  const totalActive = createEmptyValues();
  for (const code of ["1", "2", "3", "4"]) {
    const grp = groups.get(code);
    addAssessmentValues(totalActive, grp?.sheetTotalRow ?? grp?.calculatedTotals);
  }
  const totalExempt = createEmptyValues();
  for (const code of ["6", "7", "8"]) {
    const grp = groups.get(code);
    addAssessmentValues(totalExempt, grp?.sheetTotalRow ?? grp?.calculatedTotals);
  }
  totalExempt.taxableValue = null;
  const summaryRows = {
    totalPersonalProperty: g2 || g3 ? totalPersonalProperty : void 0,
    totalActive: groups.size > 0 ? totalActive : void 0,
    totalExempt: groups.get("6") || groups.get("7") || groups.get("8") ? totalExempt : void 0
  };
  return {
    isValid: errors.length === 0 && groups.size > 0,
    report: {
      groups,
      summaryRows,
      district,
      taxYear,
      sqlScript
    },
    errors
  };
}
function extractPsrMetadata(payload) {
  if (!payload || typeof payload !== "object") return {};
  const psr = payload.PSR;
  if (!psr || typeof psr !== "object") return {};
  const parishInformation = psr.ParishInformation;
  if (!Array.isArray(parishInformation) || !parishInformation.length) return {};
  const parish = parishInformation[0];
  const rawFips = parish.ParishFipsCode;
  const fipsCode = typeof rawFips === "string" || typeof rawFips === "number" ? String(rawFips).trim() : "";
  const rawTaxYear = parish.TaxYear;
  const taxYear = typeof rawTaxYear === "string" || typeof rawTaxYear === "number" ? String(rawTaxYear).trim() : "";
  const rawParishName = parish.ParishName;
  const parishName = typeof rawParishName === "string" ? rawParishName.trim() : "";
  return {
    ...parishName ? { parishName } : {},
    ...fipsCode ? { fipsCode, district: fipsCode.slice(-1) } : {},
    ...taxYear ? { taxYear } : {}
  };
}
function mapClassToGroupCode(classCode) {
  const num = Number(classCode);
  if (num >= 30 && num <= 49) return "1";
  if (num >= 50 && num <= 59) return "2";
  if (num >= 60 && num <= 69) return "3";
  if (num >= 80 && num <= 89) return "4";
  return "";
}
function mapPsrJsonToAssessmentReport(payload) {
  const groups = /* @__PURE__ */ new Map();
  const safePayload = payload && typeof payload === "object" ? payload : { PSR: {} };
  const metadata = extractPsrMetadata(safePayload);
  for (const item of safePayload.PSR?.ActiveRecap ?? []) {
    const groupCode = mapClassToGroupCode(item.Class);
    if (!groupCode) continue;
    if (!groups.has(groupCode)) {
      groups.set(groupCode, {
        groupCode,
        groupName: "",
        rawGroupLabel: groupCode,
        items: [],
        calculatedTotals: {
          homesteadCredit: 0,
          veteranCredit: 0,
          firstResponderCredit: 0,
          totalAssessed: 0,
          taxableValue: 0
        }
      });
    }
    const group = groups.get(groupCode);
    group.items.push({
      classCode: item.Class,
      className: item.PropertyDescription,
      rawDescription: `${item.Class} ${item.PropertyDescription}`,
      homesteadCredit: item.HomesteadCredit,
      veteranCredit: item.DisabledVeteranCredit,
      firstResponderCredit: item.FirstResponderCredit,
      totalAssessed: item.AssessedValue,
      taxableValue: item.TaxableValue
    });
  }
  return {
    groups,
    summaryRows: {},
    district: metadata.district,
    taxYear: metadata.taxYear
  };
}
const omitGroups = /* @__PURE__ */ new Set();
omitGroups.add("7");
omitGroups.add("8");
const toNum = (val) => {
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (typeof val !== "string") return 0;
  const parsed = Number(val.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
function compareReports(excelReport, jsonReport) {
  const discrepancies = [];
  if (jsonReport.district && excelReport.district !== jsonReport.district) {
    discrepancies.push(
      `District mismatch: Excel="${excelReport.district ?? "none"}", JSON="${jsonReport.district}"`
    );
  }
  if (jsonReport.taxYear && excelReport.taxYear !== jsonReport.taxYear) {
    discrepancies.push(
      `Tax Year mismatch: Excel="${excelReport.taxYear ?? "none"}", JSON="${jsonReport.taxYear}"`
    );
  }
  jsonReport.groups.forEach((jsonGroup, groupCode) => {
    const cleanCode = String(groupCode).trim();
    log.info("Json group :", JSON.stringify(jsonGroup, null, 2));
    if (omitGroups.has(cleanCode)) {
      log.info(`Omitting group ${cleanCode} from comparison.`);
      return;
    }
    const excelGroup = excelReport.groups.get(groupCode);
    log.info("Excel group :", JSON.stringify(excelGroup, null, 2));
    if (!excelGroup) {
      discrepancies.push(`Missing Group line 60 ${cleanCode} in Excel report.`);
      return;
    }
    for (const jsonItem of jsonGroup.items) {
      const excelItem = excelGroup.items.find((i) => i.classCode === jsonItem.classCode);
      if (!excelItem) {
        discrepancies.push(`Group ${cleanCode}: Class ${jsonItem.classCode} missing in Excel.`);
        continue;
      }
      const fields = [
        "homesteadCredit",
        "veteranCredit",
        "firstResponderCredit",
        "totalAssessed",
        "taxableValue"
      ];
      for (const field of fields) {
        const excelVal = toNum(excelItem[field]);
        const jsonVal = toNum(jsonItem[field]);
        if (excelVal !== jsonVal) {
          discrepancies.push(
            `Class ${jsonItem.classCode} (${field}): Excel=${excelVal.toLocaleString()} vs JSON=${jsonVal.toLocaleString()}`
          );
        }
      }
    }
  });
  for (const [groupCode, excelGroup] of excelReport.groups) {
    const cleanCode = String(groupCode).trim();
    if (omitGroups.has(cleanCode)) {
      log.info(`Omitting group ${cleanCode} from comparison.`);
      continue;
    }
    const jsonGroup = jsonReport.groups.get(groupCode);
    if (!jsonGroup) {
      discrepancies.push(`Missing Group line 94 ${cleanCode} in JSON report.`);
      continue;
    }
    const jsonClassCodes = new Set(jsonGroup.items.map((item) => item.classCode));
    for (const excelItem of excelGroup.items) {
      if (!jsonClassCodes.has(excelItem.classCode)) {
        discrepancies.push(`Group ${cleanCode}: Class ${excelItem.classCode} missing in JSON.`);
      }
    }
  }
  return discrepancies;
}
async function runValidationPipeline(xlsxFile, jsonFile) {
  const sheet = await extractXlsxFile(xlsxFile);
  const result = transform(sheet.rows, sheet.sqlScript);
  let rawJson;
  try {
    rawJson = await extractJsonSchema(jsonFile);
    if (!rawJson || typeof rawJson !== "object" || !rawJson.PSR || !Array.isArray(rawJson.PSR.ActiveRecap)) {
      throw new Error("The JSON file must contain a PSR object with an ActiveRecap array.");
    }
    if (rawJson.PSR.ActiveRecap.some((item) => !item || typeof item !== "object" || !String(item.Class ?? "").trim())) {
      throw new Error("Every ActiveRecap entry must include a class code.");
    }
  } catch (error) {
    const errors = [...result.errors, `JSON comparison file could not be read: ${error instanceof Error ? error.message : String(error)}`];
    return {
      ...result,
      isValid: false,
      errors,
      sourceLog: sheet.formattedLog,
      summaryLog: `Validation Failed (${errors.length} issue(s) found):
${errors.map((item) => `- ${item}`).join("\n")}`
    };
  }
  const jsonReport = mapPsrJsonToAssessmentReport(rawJson);
  const jsonDiscrepancies = compareReports(result.report, jsonReport);
  log.info(`Found ${jsonDiscrepancies.length} discrepancies between Excel and JSON reports.`);
  log.info("jsonReport: ", jsonReport);
  const allErrors = [...result.errors, ...jsonDiscrepancies];
  const isValid = allErrors.length === 0 && result.report.groups.size > 0;
  const logLines = [];
  if (!isValid) {
    logLines.push(`Validation Failed (${allErrors.length} issue(s) found):`);
    allErrors.forEach((err) => logLines.push(`- ${err}`));
  } else {
    logLines.push(`Validation Passed! All Excel values match JSON (${result.report.groups.size} groups):
`);
    result.report.groups.forEach((group) => {
      const totalAssessed = group.calculatedTotals.totalAssessed?.toLocaleString() ?? "0";
      const taxableValue = group.calculatedTotals.taxableValue?.toLocaleString() ?? "0";
      logLines.push(
        `Group ${group.groupCode} (${group.groupName}): ${group.items.length} classes | Total Assessed: $${totalAssessed} | Taxable: $${taxableValue}`
      );
    });
    if (result.report.summaryRows.totalActive) {
      logLines.push(
        `
Total Active Assessed: $${result.report.summaryRows.totalActive.totalAssessed?.toLocaleString()}`
      );
    }
    if (result.report.summaryRows.totalExempt) {
      logLines.push(
        `Total Exempt Assessed: $${result.report.summaryRows.totalExempt.totalAssessed?.toLocaleString()}`
      );
    }
  }
  return {
    isValid,
    report: result.report,
    errors: allErrors,
    sourceLog: sheet.formattedLog,
    summaryLog: logLines.join("\n")
  };
}
async function runBuildPipeline(report, outputFileName = "tc33.xlsx") {
  return await buildTc33Workbook(report, outputFileName);
}
function validateBatch(sources) {
  if (!Array.isArray(sources) || sources.length > 50) throw new Error("Choose at most 50 source files.");
  let totalBytes = 0;
  for (const source of sources) {
    if (!source || typeof source.name !== "string" || source.name.length > 255 || !/\.(xlsx|json)$/i.test(source.name) || !(source.bytes instanceof Uint8Array)) {
      throw new Error("Choose valid .xlsx and .json source files.");
    }
    if (source.bytes.byteLength > 25 * 1024 * 1024) throw new Error("Each source file must be smaller than 25 MB.");
    totalBytes += source.bytes.byteLength;
  }
  if (totalBytes > 100 * 1024 * 1024) throw new Error("Select files with a combined size under 100 MB.");
}
function asFile(source) {
  return new node_buffer.File([Buffer.from(source.bytes)], source.name);
}
function matchingJson(excel, jsonFiles) {
  const matching = jsonFiles.find(
    (source) => source.name.replace(/\.json$/i, "").toLowerCase() === excel.name.replace(/\.xlsx$/i, "").toLowerCase()
  );
  return matching ?? jsonFiles[0];
}
async function validateSources(sources) {
  validateBatch(sources);
  const excelFiles = sources.filter((source) => /\.xlsx$/i.test(source.name));
  const jsonFiles = sources.filter((source) => /\.json$/i.test(source.name));
  if (!excelFiles.length || !jsonFiles.length) throw new Error("Import at least one Excel workbook and one JSON comparison file.");
  const results = [];
  for (const excel of excelFiles) {
    const json = matchingJson(excel, jsonFiles);
    try {
      const result = await runValidationPipeline(asFile(excel), asFile(json));
      results.push({
        file: excel.name,
        comparedTo: json.name,
        isValid: result.isValid,
        summaryLog: result.summaryLog,
        sourceLog: result.sourceLog,
        errors: result.errors
      });
    } catch (error) {
      let sourceLog = "";
      try {
        sourceLog = (await extractXlsxFile(asFile(excel))).formattedLog;
      } catch {
      }
      results.push({
        file: excel.name,
        comparedTo: json.name,
        isValid: false,
        summaryLog: String(error),
        sourceLog,
        errors: [String(error)]
      });
    }
  }
  return results;
}
function buildName(base, source, count) {
  const date = getPreferences().dateFormat;
  let dateSuffix = "";
  if (date !== "none") {
    const now = /* @__PURE__ */ new Date();
    const y = String(now.getFullYear()), m = String(now.getMonth() + 1).padStart(2, "0"), d = String(now.getDate()).padStart(2, "0");
    dateSuffix = date === "YYYY-MM-DD" ? `-${y}-${m}-${d}` : date === "MM-DD-YYYY" ? `-${m}-${d}-${y}` : `-${y}${m}${d}`;
  }
  const safeBase = base.trim().replace(/[\\/:*?"<>|\0]/g, "").slice(0, 100) || "tc33";
  const safeSource = source.name.replace(/\.xlsx$/i, "").replace(/[\\/:*?"<>|\0]/g, "-").slice(0, 100);
  return `${safeBase}${dateSuffix}${count > 1 ? `-${safeSource}` : ""}.xlsx`;
}
async function generateSources(window, sources, selectedIds) {
  validateBatch(sources);
  if (!selectedIds.length) throw new Error("Select at least one Excel workbook.");
  const selected = new Set(selectedIds);
  const excelFiles = sources.filter(
    (source) => /\.xlsx$/i.test(source.name) && Boolean(source.id && selected.has(source.id))
  );
  if (!excelFiles.length) throw new Error("No selected Excel workbooks were found in the imported batch.");
  const preferences = getPreferences();
  const results = [];
  for (const source of excelFiles) {
    try {
      const extracted = await extractXlsxFile(asFile(source));
      const transformed = transform(extracted.rows, extracted.sqlScript);
      if (transformed.errors.length || !transformed.report.groups.size) {
        results.push({ file: source.name, saved: false, message: transformed.errors.join("; ") || "No property groups found." });
        continue;
      }
      const report = {
        ...transformed.report,
        district: transformed.report.district || preferences.defaultDistrict,
        taxYear: transformed.report.taxYear || preferences.defaultTaxYear
      };
      if (!report.district || !report.taxYear) {
        results.push({ file: source.name, saved: false, message: "Set a default District and Tax Year in Preferences, or add them to the workbook SQL tab." });
        continue;
      }
      const name = buildName(preferences.filename, source, excelFiles.length);
      const bytes = await runBuildPipeline(report, name);
      const selection = await electron.dialog.showSaveDialog(window, { defaultPath: name });
      if (selection.canceled || !selection.filePath) {
        results.push({ file: source.name, saved: false, message: "Save cancelled." });
        continue;
      }
      await promises.writeFile(selection.filePath, bytes);
      results.push({ file: source.name, saved: true, message: `Saved TC-33 workbook for District ${report.district}, Tax Year ${report.taxYear}.` });
    } catch (error) {
      results.push({ file: source.name, saved: false, message: String(error) });
    }
  }
  return results;
}
async function buildMismatchExport(format, issues) {
  if (format === "json") {
    return Buffer.from(JSON.stringify({
      title: "TC33 Validation Mismatches",
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      issues
    }, null, 2));
  }
  if (format === "txt") {
    return Buffer.from(["TC33 Validation Mismatches", "", ...issues.map((line) => `- ${line}`)].join("\n"));
  }
  if (format === "csv") {
    const escape = (value) => `"${value.replace(/"/g, '""')}"`;
    return Buffer.from([["Issue"], ...issues.map((line) => [line])].map((row) => row.map(escape).join(",")).join("\r\n"));
  }
  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Validation Issues");
    sheet.addRow(["Validation issue"]);
    for (const issue of issues) sheet.addRow([issue]);
    sheet.getRow(1).font = { bold: true };
    sheet.columns = [{ width: 110 }];
    sheet.autoFilter = { from: "A1", to: `A${Math.max(1, issues.length + 1)}` };
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
  if (format === "docx") {
    const { Document, Packer, Paragraph, TextRun } = await import("docx");
    const document = new Document({ sections: [{ children: [
      new Paragraph({ children: [new TextRun({ text: "TC33 Validation Mismatches", bold: true, size: 30 })] }),
      ...issues.map((line) => new Paragraph({ text: line }))
    ] }] });
    return Buffer.from(await Packer.toBuffer(document));
  }
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF();
  pdf.setFontSize(16);
  pdf.text("TC33 Validation Mismatches", 14, 18);
  pdf.setFontSize(10);
  const text = pdf.splitTextToSize(issues.join("\n"), 180);
  const linesPerPage = Math.max(1, Math.floor((pdf.internal.pageSize.getHeight() - 36) / 5));
  for (let index = 0; index < text.length; index += linesPerPage) {
    if (index > 0) pdf.addPage();
    pdf.text(text.slice(index, index + linesPerPage), 14, 28);
  }
  return Buffer.from(pdf.output("arraybuffer"));
}
const windowsReservedName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
async function saveDroppedSource(directory, source) {
  const extension = node_path.extname(source.name);
  if (!extension || !/\.(xlsx|json)$/i.test(extension) || /[\\/:*?"<>|\0-\x1f]/.test(source.name) || windowsReservedName.test(source.name)) {
    throw new Error("Dropped source filename is not safe to save.");
  }
  const stem = source.name.slice(0, -extension.length);
  for (let duplicate = 1; duplicate <= 1e4; duplicate += 1) {
    const suffix = duplicate === 1 ? "" : ` (${duplicate})`;
    const availableStemLength = Math.max(1, 255 - extension.length - suffix.length);
    const candidateName = `${stem.slice(0, availableStemLength)}${suffix}${extension}`;
    const filePath = node_path.join(directory, candidateName);
    try {
      await promises.writeFile(filePath, Buffer.from(source.bytes), { flag: "wx" });
      return filePath;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  throw new Error(`Could not create a unique filename for ${source.name}.`);
}
function registerIPC() {
  async function readSource(filePath, displayName) {
    if (!/\.(xlsx|json)$/i.test(filePath)) throw new Error("Select .xlsx or .json files");
    const info = await promises.stat(filePath);
    if (!info.isFile() || info.size > 25 * 1024 * 1024) throw new Error("Each source must be smaller than 25 MB");
    const bytes = await promises.readFile(filePath);
    const name = displayName ?? node_path.basename(filePath);
    let metadata;
    if (/\.json$/i.test(name)) {
      try {
        metadata = extractPsrMetadata(JSON.parse(bytes.toString("utf8")));
      } catch {
        metadata = void 0;
      }
    }
    rememberFile({ name, path: filePath, openedAt: (/* @__PURE__ */ new Date()).toISOString() });
    return { name, path: filePath, bytes: new Uint8Array(bytes), ...metadata ? { metadata } : {} };
  }
  handle("getWorkspace", () => getWorkspace());
  handle("setPreferences", (event, input) => {
    const preferences = setPreferences(input);
    const window = electron.BrowserWindow.fromWebContents(event.sender);
    if (preferences.minimizeToTray && window) registerTray(window);
    else unregisterTray();
    return preferences;
  });
  handle("windowControl", (event, action) => {
    zod.z.enum(["minimize", "maximize", "close"]).parse(action);
    const window = electron.BrowserWindow.fromWebContents(event.sender);
    if (action === "minimize") window.minimize();
    if (action === "maximize") window.isMaximized() ? window.unmaximize() : window.maximize();
    if (action === "close") window.close();
  });
  handle("rendererReady", () => {
  });
  handle("validateSources", (_event, sources) => validateSources(sources));
  handle("generateSources", (event, sources, selectedIds) => {
    const window = electron.BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error("The app window is unavailable.");
    zod.z.array(zod.z.string().max(4096)).min(1).max(50).parse(selectedIds);
    return generateSources(window, sources, selectedIds);
  });
  handle("openSources", async (event, kind = "all") => {
    zod.z.enum(["all", "json"]).parse(kind);
    const window = electron.BrowserWindow.fromWebContents(event.sender);
    const result = await electron.dialog.showOpenDialog(window, {
      properties: ["openFile", "multiSelections"],
      filters: [{ name: kind === "json" ? "PSR JSON schema" : "TC33 sources", extensions: kind === "json" ? ["json"] : ["xlsx", "json"] }]
    });
    if (result.canceled) return [];
    if (result.filePaths.length > 50) throw new Error("Import at most 50 files at once");
    const filesInfo = await Promise.all(result.filePaths.map((path) => promises.stat(path)));
    if (filesInfo.reduce((total, file) => total + file.size, 0) > 100 * 1024 * 1024) {
      throw new Error("Select files with a combined size under 100 MB");
    }
    const files = [];
    for (const path of result.filePaths) files.push(await readSource(path));
    return files;
  });
  handle("importDroppedSources", async (_event, input) => {
    if (!Array.isArray(input) || input.length > 50) throw new Error("Drop at most 50 source files at once.");
    let totalBytes = 0;
    for (const source of input) {
      if (!source || typeof source.name !== "string" || source.name.length > 255 || !/\.(xlsx|json)$/i.test(source.name) || !(source.bytes instanceof Uint8Array)) {
        throw new Error("Drop valid .xlsx and .json source files.");
      }
      if (source.bytes.byteLength > 25 * 1024 * 1024) throw new Error("Each source file must be smaller than 25 MB.");
      totalBytes += source.bytes.byteLength;
    }
    if (totalBytes > 100 * 1024 * 1024) throw new Error("Select files with a combined size under 100 MB.");
    const importDirectory = node_path.join(electron.app.getPath("userData"), "dropped-sources");
    await promises.mkdir(importDirectory, { recursive: true });
    const files = [];
    for (const source of input) {
      const filePath = await saveDroppedSource(importDirectory, source);
      files.push(await readSource(filePath, node_path.basename(source.name)));
    }
    return files;
  });
  handle("reopenSource", (_event, filePath) => {
    zod.z.string().max(4096).parse(filePath);
    if (!getWorkspace().recent.some((file) => file.path === filePath)) throw new Error("File is not in recent history. Import it again.");
    return readSource(filePath);
  });
  handle("removeRecentFile", (_event, filePath) => {
    zod.z.string().min(1).max(4096).parse(filePath);
    return removeRecentFile(filePath);
  });
  handle("recordActivity", (event, input) => {
    const state2 = recordActivity(input);
    notify(electron.BrowserWindow.fromWebContents(event.sender), `${input.action}: ${input.file}`);
    return state2;
  });
  handle("clearHistory", () => clearHistory());
  handle("saveExport", async (event, name, bytes) => {
    zod.z.string().min(1).max(180).regex(/^[^\\/:*?"<>|\0]+\.(xlsx|pdf|docx)$/i).parse(name);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > 100 * 1024 * 1024) throw new Error("Invalid export data");
    const result = await electron.dialog.showSaveDialog(electron.BrowserWindow.fromWebContents(event.sender), { defaultPath: name });
    if (result.canceled || !result.filePath) return false;
    await promises.writeFile(result.filePath, bytes);
    return true;
  });
  handle("exportMismatches", async (event, format, name, issues) => {
    const supportedFormats = ["pdf", "docx", "xlsx", "csv", "json", "txt"];
    zod.z.enum(supportedFormats).parse(format);
    zod.z.string().min(1).max(180).regex(/^[^\\/:*?"<>|\0]+\.(pdf|docx|xlsx|csv|json|txt)$/i).parse(name);
    zod.z.array(zod.z.string().max(2e3)).max(1e3).parse(issues);
    const window = electron.BrowserWindow.fromWebContents(event.sender);
    const bytes = await buildMismatchExport(format, issues);
    const result = await electron.dialog.showSaveDialog(window, { defaultPath: name });
    if (result.canceled || !result.filePath) return false;
    await promises.writeFile(result.filePath, bytes);
    return true;
  });
  handle("getVersion", (event) => {
    assertTrustedSender(event);
    return electron.app.getVersion();
  });
  handle("getSettings", (event) => {
    assertTrustedSender(event);
    return getSettings();
  });
  handle("setTheme", (event, theme) => {
    assertTrustedSender(event);
    return setTheme(themeSchema.parse(theme));
  });
  electron.nativeTheme.on("updated", () => {
    for (const window of electron.BrowserWindow.getAllWindows()) {
      window.webContents.send(channels.themeChanged, electron.nativeTheme.shouldUseDarkColors);
    }
  });
  handle("openFile", async (event) => {
    assertTrustedSender(event);
    const window = electron.BrowserWindow.fromWebContents(event.sender);
    if (!window) return null;
    const result = await electron.dialog.showOpenDialog(window, {
      properties: ["openFile"]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const info = await promises.stat(filePath);
    if (!info.isFile() || info.size > 10 * 1024 * 1024) throw new Error("Select a text file smaller than 10 MB");
    event.sender.send(channels.toast, "File opened successfully");
    return {
      path: filePath,
      name: node_path.basename(filePath),
      text: await promises.readFile(filePath, "utf8")
    };
  });
  handle("saveFile", async (event, defaultName, content) => {
    assertTrustedSender(event);
    saveFileSchema.parse([defaultName, content]);
    const window = electron.BrowserWindow.fromWebContents(event.sender);
    if (!window) return false;
    const result = await electron.dialog.showSaveDialog(window, { defaultPath: defaultName });
    if (result.canceled || !result.filePath) return false;
    await promises.writeFile(result.filePath, content, "utf8");
    return true;
  });
}
function isEmptyReleaseFeed(error) {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error;
  return code === "ERR_UPDATER_NO_PUBLISHED_VERSIONS" || code === "ERR_XML_MISSED_ELEMENT" && message === "No published versions on GitHub";
}
function createUpdateErrorReporter(sendState2, logger) {
  return (error, phase) => {
    if (isEmptyReleaseFeed(error)) {
      logger.info({ event: "update-feed-not-configured" });
      sendState2({ status: "not-configured" });
      return;
    }
    logger.warn({ event: phase === "check" ? "update-check-failed" : "update-failed" });
    sendState2({
      status: "error",
      message: phase === "check" ? "Unable to check for updates. Please try again later." : "The update could not finish. Please try again later."
    });
  };
}
async function performUpdateCheck(check, reportError) {
  try {
    await check();
  } catch (error) {
    reportError(error, "check");
  }
}
const { autoUpdater } = updater;
let registered = false;
let state = { status: "idle" };
function sendState(next) {
  state = next;
  for (const window of electron.BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channels.updateStatus, state);
  }
}
const reportUpdateError = createUpdateErrorReporter(sendState, log$1);
async function checkForUpdates() {
  if (!electron.app.isPackaged) {
    sendState({ status: "not-available" });
    return;
  }
  await performUpdateCheck(() => autoUpdater.checkForUpdates(), reportUpdateError);
}
function registerUpdater(_mainWindow) {
  if (registered) return;
  registered = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = log$1;
  autoUpdater.on("checking-for-update", () => sendState({ status: "checking" }));
  autoUpdater.on("update-available", (info) => sendState({ status: "available", version: info.version }));
  autoUpdater.on("update-not-available", () => sendState({ status: "not-available" }));
  autoUpdater.on("download-progress", (progress) => sendState({ status: "downloading", percent: updatePercent(progress.percent) }));
  autoUpdater.on("update-downloaded", (info) => sendState({ status: "downloaded", version: info.version }));
  autoUpdater.on("error", (error) => reportUpdateError(error, state.status === "checking" ? "check" : "update"));
  handle("getUpdateState", (event) => {
    assertTrustedSender(event);
    return state;
  });
  handle("checkForUpdates", (event) => {
    assertTrustedSender(event);
    return checkForUpdates();
  });
  handle("installUpdate", async (event) => {
    assertTrustedSender(event);
    if (!electron.app.isPackaged || state.status !== "downloaded") throw new Error("No downloaded update is ready");
    const previous = state;
    sendState({ status: "installing" });
    await new Promise((resolve) => setTimeout(resolve, 400));
    try {
      autoUpdater.quitAndInstall();
    } catch {
      sendState(previous);
      throw new Error("Unable to restart for installation");
    }
  });
  if (electron.app.isPackaged) void checkForUpdates();
}
function registerAppMenu(mainWindow) {
  const isMac = process.platform === "darwin";
  const sendCommand = (value) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channels.command, value);
    }
  };
  const template = [
    ...isMac ? [
      {
        label: electron.app.name,
        submenu: [
          { role: "about" },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" }
        ]
      }
    ] : [],
    {
      label: "File",
      submenu: [
        { label: "Import Excel / JSON…", accelerator: "CmdOrCtrl+O", click: () => sendCommand("open") },
        { label: "Validate batch", click: () => sendCommand("validate") },
        { type: "separator" },
        { label: "Generate TC-33 workbook(s)", accelerator: "CmdOrCtrl+Shift+G", click: () => sendCommand("generate") },
        { label: "Preferences…", accelerator: "CmdOrCtrl+,", click: () => sendCommand("preferences") },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        ...isMac ? [
          { role: "pasteAndMatchStyle" },
          { role: "delete" },
          { role: "selectAll" }
        ] : [
          { role: "delete" },
          { type: "separator" },
          { role: "selectAll" }
        ],
        { type: "separator" },
        { label: "Command palette", accelerator: "CmdOrCtrl+K", click: () => sendCommand("palette") }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...isMac ? [
          { type: "separator" },
          { role: "front" },
          { type: "separator" },
          { role: "window" }
        ] : [{ role: "close" }]
      ]
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Documentation",
          click: () => electron.shell.openExternal("https://electronjs.org")
        },
        {
          label: "Check for Updates…",
          click: () => {
            void checkForUpdates();
          }
        },
        ...!isMac ? [
          { type: "separator" },
          { role: "about" }
        ] : []
      ]
    }
  ];
  electron.Menu.setApplicationMenu(electron.Menu.buildFromTemplate(template));
}
process.on("uncaughtException", (err) => {
  fs.writeFileSync("crash.txt", `UNCAUGHT EXCEPTION:
${err.stack || err}`);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  fs.writeFileSync("crash.txt", `UNHANDLED REJECTION:
${reason instanceof Error ? reason.stack || reason.message : String(reason)}`);
  process.exit(1);
});
function initWindow() {
  const mainWindow = createMainWindow();
  registerAppMenu(mainWindow);
  registerUpdater();
  if (getPreferences().minimizeToTray) registerTray(mainWindow);
}
const hasLock = electron.app.requestSingleInstanceLock();
if (!hasLock) {
  electron.app.quit();
} else {
  registerLogger();
  electron.app.on("second-instance", () => {
    const window = electron.BrowserWindow.getAllWindows().find((w) => w.getTitle() === "TC33 Builder Pro");
    if (!window) {
      if (electron.app.isReady()) initWindow();
      return;
    }
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  electron.app.whenReady().then(() => {
    utils.electronApp.setAppUserModelId("com.josephadogeridev.electronapp");
    const theme = getPreferences().theme;
    electron.nativeTheme.themeSource = theme === "black" ? "dark" : theme;
    registerIPC();
    initWindow();
    electron.app.on("activate", () => {
      if (electron.BrowserWindow.getAllWindows().length === 0) initWindow();
      else electron.BrowserWindow.getAllWindows().forEach((window) => window.show());
    });
  });
}
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
