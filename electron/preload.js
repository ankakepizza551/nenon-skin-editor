const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setDirty: (dirty) => ipcRenderer.send('set-dirty', dirty),
  savePng: (bytes, targetPath, defaultPath) => ipcRenderer.invoke('save-png', bytes, targetPath, defaultPath),
  getPathForFile: (file) => webUtils.getPathForFile(file),
});
