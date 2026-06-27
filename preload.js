const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Async settings (invoke pattern — non-blocking)
    saveSettings: (keys) => ipcRenderer.invoke('save-settings', keys),
    loadSettings: () => ipcRenderer.invoke('load-settings'),
    
    // Global shortcut toggle from main process
    onToggleListen: (callback) => {
        // Remove any previous listener to prevent accumulation
        ipcRenderer.removeAllListeners('toggle-listen');
        ipcRenderer.on('toggle-listen', (_event) => callback());
    }
});
