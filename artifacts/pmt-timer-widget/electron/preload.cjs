const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  minimizeToClock: () => ipcRenderer.send("minimize-to-clock"),
  restoreWindow: () => ipcRenderer.send("restore-window"),
  closeWindow: () => ipcRenderer.send("close-window"),
  minimizeWindow: () => ipcRenderer.send("minimize-window"),
  toggleMaximize: () => ipcRenderer.send("toggle-maximize"),
  onMiniModeChange: (cb) => {
    const handler = (_event, isMini) => cb(isMini);
    ipcRenderer.on("mini-mode-changed", handler);
    return () => ipcRenderer.removeListener("mini-mode-changed", handler);
  },
  onAutoPause: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("auto-pause-timer", handler);
    return () => ipcRenderer.removeListener("auto-pause-timer", handler);
  },
  onUpdateStatus: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("update-status", handler);
    return () => ipcRenderer.removeListener("update-status", handler);
  },
  installUpdate: () => ipcRenderer.send("install-update"),
  isElectron: true,
  platform: process.platform,
});
