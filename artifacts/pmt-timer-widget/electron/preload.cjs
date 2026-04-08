const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  minimizeToClock: () => ipcRenderer.send("minimize-to-clock"),
  restoreWindow: () => ipcRenderer.send("restore-window"),
  onMiniModeChange: (cb) => {
    const handler = (_event, isMini) => cb(isMini);
    ipcRenderer.on("mini-mode-changed", handler);
    return () => ipcRenderer.removeListener("mini-mode-changed", handler);
  },
  isElectron: true,
});
