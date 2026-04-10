const { app, BrowserWindow, ipcMain, shell, session, protocol, net, powerMonitor } = require("electron");
const path = require("path");

let mainWindow = null;

const FULL_WIDTH = 360;
const FULL_HEIGHT = 560;
const MINI_WIDTH = 290;
const MINI_HEIGHT = 64;

const FIREBASE_ORIGINS = [
  "https://*.googleapis.com",
  "https://*.firebaseio.com",
  "wss://*.firebaseio.com",
  "https://*.firebasedatabase.app",
  "wss://*.firebasedatabase.app",
  "https://*.firebase.com",
  "https://*.firebaseapp.com",
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://apis.google.com",
];

// Must be called before app.whenReady — registers 'app://' as a
// fully-privileged secure scheme so it behaves like https://, not file://
// This fixes Mac App Translocation and file:// CSP/security restrictions.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: false,
    },
  },
]);

function setupSession() {
  const ses = session.defaultSession;

  const csp = [
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: app:",
    `connect-src 'self' app: ${FIREBASE_ORIGINS.join(" ")}`,
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' app: ${FIREBASE_ORIGINS.join(" ")}`,
    "style-src 'self' 'unsafe-inline' app: https://fonts.googleapis.com",
    "img-src 'self' data: https: app:",
    "font-src 'self' data: app: https://fonts.gstatic.com",
  ].join("; ");

  ses.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    headers["content-security-policy"] = [csp];
    delete headers["cross-origin-embedder-policy"];
    delete headers["cross-origin-opener-policy"];
    callback({ responseHeaders: headers });
  });

  ses.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(true);
  });
}

function registerAppProtocol() {
  // Serve files from the packaged dist/public directory via app://
  // Using app.getAppPath() is safe even under macOS App Translocation
  // (unlike __dirname which can be randomized for unsigned apps)
  const distDir = path.join(app.getAppPath(), "dist", "public");

  protocol.handle("app", (request) => {
    let urlPath = new URL(request.url).pathname;
    // Default to index.html for SPA routing
    if (!urlPath || urlPath === "/") urlPath = "/index.html";

    const filePath = path.join(distDir, urlPath);
    return net.fetch(`file://${filePath}`);
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
      webSecurity: false,        // Required for custom protocol + Firebase fetch
      sandbox: false,
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
    mainWindow.loadURL("app://./index.html");
  }

  // Fallback: if the custom protocol fails for any reason, try loadFile
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`[PMT] Load failed (${code} ${desc}) for ${url}`);
    if (!isDev && url.startsWith("app://")) {
      const fallback = path.join(app.getAppPath(), "dist", "public", "index.html");
      console.log("[PMT] Falling back to loadFile:", fallback);
      mainWindow.loadFile(fallback);
    }
  });

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

ipcMain.on("close-window", () => {
  if (!mainWindow) return;
  mainWindow.close();
});

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
  registerAppProtocol();
  createWindow();

  // Auto-pause the timer when the screen is locked or the system suspends
  function sendAutoPause() {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("auto-pause-timer");
    }
  }
  powerMonitor.on("lock-screen", sendAutoPause);
  powerMonitor.on("suspend", sendAutoPause);

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
