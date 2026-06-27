const { app, BrowserWindow, globalShortcut, ipcMain, Tray, nativeImage, Menu, systemPreferences, session } = require('electron');
const path = require('path');
const fs = require('fs');

// ── Settings IPC (async handle pattern) ─────────────────────────
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

ipcMain.handle('save-settings', (_event, keys) => {
    fs.writeFileSync(settingsPath(), JSON.stringify(keys, null, 2));
    return true;
});

ipcMain.handle('load-settings', () => {
    try {
        if (fs.existsSync(settingsPath())) {
            return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
    return null;
});

let mainWindow;
let tray;

async function checkPermissions() {
    if (process.platform === 'darwin') {
        const microphoneAccess = await systemPreferences.askForMediaAccess('microphone');
        console.log('Microphone access:', microphoneAccess);
        if (!microphoneAccess) {
            const { dialog } = require('electron');
            dialog.showErrorBox(
                'Microphone Access Required',
                'Speaker Visualizer needs microphone access to transcribe your speech. Please open System Settings -> Privacy & Security -> Microphone, grant access to your Terminal/App, and restart.'
            );
        }
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        transparent: true,
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    
    mainWindow.loadFile('index.html');

    // Hide to tray on close instead of quitting
    mainWindow.on('close', (e) => {
        if (!app.isQuiting) {
            e.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function createTray() {
    const icon = nativeImage.createEmpty();
    tray = new Tray(icon);
    tray.setTitle('🎙️ SV');
    tray.setToolTip('Speaker Visualizer');
    
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show Window', click: () => showWindow() },
        { label: 'Toggle Mic (⌘⇧V)', click: () => toggleMicFromMain() },
        { type: 'separator' },
        { label: 'Quit', click: () => { app.isQuiting = true; app.quit(); } }
    ]);
    
    tray.setContextMenu(contextMenu);
    
    // Click tray icon to show/hide
    tray.on('click', () => toggleWindow());
}

function showWindow() {
    if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
    }
}

function toggleWindow() {
    if (mainWindow) {
        if (mainWindow.isVisible()) {
            mainWindow.hide();
        } else {
            showWindow();
        }
    }
}

function toggleMicFromMain() {
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('toggle-listen');
    }
}

function registerGlobalShortcut() {
    const ret = globalShortcut.register('CommandOrControl+Shift+V', () => {
        toggleMicFromMain();
        // Also show window if hidden
        if (mainWindow && !mainWindow.isVisible()) {
            showWindow();
        }
    });
    if (!ret) {
        console.warn('Global shortcut Cmd+Shift+V registration failed');
    }
}

app.whenReady().then(async () => {
    // Auto-allow microphone permission requests from renderer
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'media') {
            callback(true);
        } else {
            callback(false);
        }
    });

    session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
        if (permission === 'media') {
            return true;
        }
        return false;
    });

    // Set basic CSP
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self'; " +
                    "script-src 'self'; " +
                    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
                    "font-src 'self' https://fonts.gstatic.com; " +
                    "img-src 'self' https: data:; " +
                    "connect-src 'self' https://generativelanguage.googleapis.com https://api.openweathermap.org https://en.wikipedia.org https://api.unsplash.com https://api.openai.com;"
                ]
            }
        });
    });

    await checkPermissions();
    createWindow();
    createTray();
    registerGlobalShortcut();

    app.on('activate', () => {
        if (mainWindow) {
            showWindow();
        } else {
            createWindow();
        }
    });
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
