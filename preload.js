const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('store:load'),
  save: (payload) => ipcRenderer.invoke('store:save', payload),
  setTopmost: (value) => ipcRenderer.invoke('win:topmost', value),
  close: () => ipcRenderer.invoke('win:close'),
  setSize: (size) => ipcRenderer.invoke('win:set-size', size),
  reservePanel: (delta) => ipcRenderer.invoke('win:reserve-panel', delta),
  menu: (payload) => ipcRenderer.invoke('ui:menu', payload),
  stickerPick: () => ipcRenderer.invoke('sticker:pick'),
  stickerSet: (p) => ipcRenderer.invoke('sticker:set', p),
  stickerClear: () => ipcRenderer.invoke('sticker:clear'),
  onMenuAction: (cb) => ipcRenderer.on('menu:action', (_e, data) => cb(data))
});
