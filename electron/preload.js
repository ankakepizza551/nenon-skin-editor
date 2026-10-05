const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setDirty: (dirty) => ipcRenderer.send('set-dirty', dirty),
  savePng: (bytes) => ipcRenderer.invoke('save-png', bytes),
});
