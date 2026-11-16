"use strict";
const electron = require("electron");
const utils = require("@electron-toolkit/utils");
const node_path = require("node:path");
const node_url = require("node:url");
const zod = require("zod");
const Store = require("electron-store");
const promises = require("node:fs/promises");
const log = require("electron-log");
const updater = require("electron-updater");
const log$1 = require("electron-log/main");
const themeSchema = zod.z.enum(["light", "dark", "system"]);
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
  electron.nativeTheme.themeSource = settings.theme;
  return settings;
}
function getWindowState() {
  const result = windowStateSchema.safeParse(store.get("window", {}));
  return result.success ? result.data : windowStateSchema.parse({});
}
function saveWindowState(state2) {
  store.set("window", windowStateSchema.parse(state2));
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
    show: false,
    icon: appIcon,
    webPreferences: {
      preload: node_path.join(__dirname$2, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (saved.maximized) mainWindow.maximize();
  mainWindow.once("ready-to-show", () => mainWindow.show());
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
  mainWindow.on("close", () => {
    saveWindowState({ ...mainWindow.getNormalBounds(), maximized: mainWindow.isMaximized() });
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
  toast: "app:toast"
};
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
function registerIPC() {
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
const reportUpdateError = createUpdateErrorReporter(sendState, log);
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
  autoUpdater.logger = log;
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
        { label: "New", accelerator: "CmdOrCtrl+N", click: () => sendCommand("new") },
        { label: "Open…", accelerator: "CmdOrCtrl+O", click: () => sendCommand("open") },
        { type: "separator" },
        { label: "Save", accelerator: "CmdOrCtrl+S", click: () => sendCommand("save") },
        { label: "Save As…", accelerator: "CmdOrCtrl+Shift+S", click: () => sendCommand("save-as") },
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
        { label: "Find", accelerator: "CmdOrCtrl+F", click: () => sendCommand("find") }
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
function registerLogger() {
  log$1.initialize();
  log$1.transports.file.resolvePathFn = () => node_path.join(electron.app.getPath("logs"), "main.log");
  log$1.transports.file.maxSize = 5 * 1024 * 1024;
  const fatalError = (event) => {
    log$1.error({ event });
    electron.dialog.showErrorBox("Application error", "The application encountered an unexpected error and must close. Reopen it to try again.");
    electron.app.exit(1);
  };
  process.on("unhandledRejection", () => fatalError("unhandled-rejection"));
  process.on("uncaughtException", () => fatalError("main-process-crash"));
  electron.app.on("render-process-gone", (_event, _contents, details) => {
    log$1.error({ event: "renderer-process-gone", reason: details.reason });
  });
}
function initWindow() {
  const mainWindow = createMainWindow();
  registerAppMenu(mainWindow);
  registerUpdater();
}
const hasLock = electron.app.requestSingleInstanceLock();
if (!hasLock) {
  electron.app.quit();
} else {
  registerLogger();
  electron.app.on("second-instance", () => {
    const window = electron.BrowserWindow.getAllWindows()[0];
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
    electron.nativeTheme.themeSource = getSettings().theme;
    registerIPC();
    initWindow();
    electron.app.on("activate", () => {
      if (electron.BrowserWindow.getAllWindows().length === 0) initWindow();
    });
  });
}
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
