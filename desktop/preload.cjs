const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('inLLM', {
  platform: process.platform,
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  pickModel: () => ipcRenderer.invoke('pick-model'),
  transcribe: (id, locale) => ipcRenderer.invoke('transcribe', id, locale),
});
