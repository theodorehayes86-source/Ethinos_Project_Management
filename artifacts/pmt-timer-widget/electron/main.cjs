const { app, BrowserWindow, ipcMain, shell, session } = require("electron");
const path = require("path");

let mainWindow = null;

const FULL_WIDTH = 360;
const FULL_HEIGHT = 560;
const MINI_WIDTH = 290;
const MINI_HEIGHT = 64;

// Firebase domains the app needs to reach
const FIREBASE_ORIGINS = [
  "https://*.googleapis.com",
  "https://*.firebaseio.com",
  "wss://*.firebaseio.com",
  "https://*.firebase.com",
  "https://*.firebaseapp.com",
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://apis.google.com",
];

function setupSession() {
  const ses = session.defaultSession;

  // Allow Firebase network requests by removing any restrictive CSP
  // and injecting a permissive one for the domains we need
  ses.webRequest.onHeadersReceived((details, callback) => {
    const csp = [
      "default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:",
      `connect-src 'self' ${FIREBASE_ORIGINS.join(" ")}`,
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${FIREBASE_ORIGINS.join(" ")}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
    ].join("; ");

    const headers = { ...details.responseHeaders };
    // Override any upstream CSP that might block Firebase
    headers["content-security-policy"] = [csp];
    // Ensure cross-origin isolation is not enforced (breaks Firebase streams)
    delete headers["cross-origin-embedder-policy"];
    delete headers["cross-origin-opener-policy"];

    callback({ responseHeaders: headers });
  });

  // Allow all Firebase origins explicitly in the permission system
  ses.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(true);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: FULL_WIDTH,
    height: FULL_HEIGHT,
    minWidth: MINI_WIDTH,
    minHeight: MINI_HEIGHT,
    resizable: false,
    alwaysOnTop: true,
    frame: false,
    titleBarStyle: "hidden",
    transparent: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: false,           // Allow renderer to use fetch/XMLHttpRequest for Firebase
      preload: path.join(__dirname, "preload.cjs"),
      spellcheck: false,
    },
    backgroundColor: "#0f1629",
    show: false,
    skipTaskbar: false,
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173/");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/public/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.on("minimize-to-clock", () => {
  if (!mainWindow) return;
  const [x, y] = mainWindow.getPosition();
  mainWindow.setResizable(true);
  mainWindow.setSize(MINI_WIDTH, MINI_HEIGHT, true);
  mainWindow.setResizable(false);
  mainWindow.setPosition(x, y);
  mainWindow.webContents.send("mini-mode-changed", true);
});

ipcMain.on("restore-window", () => {
  if (!mainWindow) return;
  const [x, y] = mainWindow.getPosition();
  mainWindow.setResizable(true);
  mainWindow.setSize(FULL_WIDTH, FULL_HEIGHT, true);
  mainWindow.setResizable(false);
  mainWindow.setPosition(x, y);
  mainWindow.webContents.send("mini-mode-changed", false);
});

app.whenReady().then(() => {
  setupSession();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
