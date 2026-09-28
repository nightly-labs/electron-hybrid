const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hybrid', {
  onQr: callback => ipcRenderer.on('qr', (_event, value) => callback(value)),
  onStatus: callback => ipcRenderer.on('status', (_event, value) => callback(value)),
  cancel: () => ipcRenderer.send('cancel-hybrid')
});
