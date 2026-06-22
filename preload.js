const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onToggleListen: (callback) => ipcRenderer.on('toggle-listen', callback),
    saveSettings: (keys) => ipcRenderer.sendSync('save-settings', keys),
    loadSettings: () => ipcRenderer.sendSync('load-settings')
});
