const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");

let mainWindow = null;
let isMini = false;

const FULL_WIDTH = 360;
const FULL_HEIGHT = 560;
const MINI_WIDTH = 290;
const MINI_HEIGHT = 64;

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
      preload: path.join(__dirname, "preload.cjs"),
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
  isMini = true;
  const [x, y] = mainWindow.getPosition();
  mainWindow.setResizable(true);
  mainWindow.setSize(MINI_WIDTH, MINI_HEIGHT, true);
  mainWindow.setResizable(false);
  mainWindow.setPosition(x, y);
  mainWindow.webContents.send("mini-mode-changed", true);
});

ipcMain.on("restore-window", () => {
  if (!mainWindow) return;
  isMini = false;
  const [x, y] = mainWindow.getPosition();
  mainWindow.setResizable(true);
  mainWindow.setSize(FULL_WIDTH, FULL_HEIGHT, true);
  mainWindow.setResizable(false);
  mainWindow.setPosition(x, y);
  mainWindow.webContents.send("mini-mode-changed", false);
});

app.whenReady().then(() => {
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
