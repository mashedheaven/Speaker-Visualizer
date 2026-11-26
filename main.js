const { app, BrowserWindow, globalShortcut, ipcMain, Tray, nativeImage, Menu, systemPreferences, session, safeStorage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

function isSafeExternalUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
        return false;
    }
}

// ── External Link Handler (validated http/https only) ────────────────
ipcMain.handle('open-external', (_event, url) => {
    if (typeof url === 'string' && isSafeExternalUrl(url)) {
        return shell.openExternal(url);
    }
    return false;
});

// ── Encrypted Settings IPC via Electron safeStorage ─────────────────
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

ipcMain.handle('save-settings', (_event, keys) => {
    try {
        const jsonStr = JSON.stringify(keys, null, 2);
        if (safeStorage && safeStorage.isEncryptionAvailable()) {
            const encrypted = safeStorage.encryptString(jsonStr);
            fs.writeFileSync(settingsPath(), encrypted);
        } else {
            fs.writeFileSync(settingsPath(), jsonStr, 'utf8');
        }
        return true;
    } catch (e) {
        console.error('Failed to encrypt/save settings:', e);
        return false;
    }
});

ipcMain.handle('load-settings', () => {
    try {
        if (fs.existsSync(settingsPath())) {
            const buffer = fs.readFileSync(settingsPath());
            if (safeStorage && safeStorage.isEncryptionAvailable()) {
                try {
                    const decrypted = safeStorage.decryptString(buffer);
                    return JSON.parse(decrypted);
                } catch {
                    // Fallback: file was saved in legacy plaintext
                    return JSON.parse(buffer.toString('utf8'));
                }
            } else {
                return JSON.parse(buffer.toString('utf8'));
            }
        }
    } catch (e) {
        console.error('Failed to load/decrypt settings:', e);
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
    
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isSafeExternalUrl(url)) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

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
    // Arc Reactor SVG icon with setTemplateImage for native macOS dark/light menu bar support
    const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
      <circle cx="9" cy="9" r="7" stroke="black" stroke-width="1.6" fill="none"/>
      <circle cx="9" cy="9" r="3.5" stroke="black" stroke-width="1.2" fill="none"/>
      <circle cx="9" cy="9" r="1.5" fill="black"/>
      <line x1="9" y1="2" x2="9" y2="4.5" stroke="black" stroke-width="1.2"/>
      <line x1="9" y1="13.5" x2="9" y2="16" stroke="black" stroke-width="1.2"/>
      <line x1="2" y1="9" x2="4.5" y2="9" stroke="black" stroke-width="1.2"/>
      <line x1="13.5" y1="9" x2="16" y2="9" stroke="black" stroke-width="1.2"/>
    </svg>`;
    const icon = nativeImage.createFromBuffer(Buffer.from(svgIcon));
    icon.setTemplateImage(true);

    tray = new Tray(icon);
    tray.setToolTip('JARVIS — Speaker Visualizer');
    
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show JARVIS HUD', click: () => showWindow() },
        { label: 'Toggle Voice (⌘⇧V)', click: () => toggleMicFromMain() },
        { type: 'separator' },
        { label: 'Quit JARVIS', click: () => { app.isQuiting = true; app.quit(); } }
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
                    "media-src 'self' https: blob: data:; " +
                    "connect-src 'self' https://generativelanguage.googleapis.com https://api.openweathermap.org https://en.wikipedia.org https://api.unsplash.com https://api.openai.com https://api.coingecko.com https://itunes.apple.com https://api.duckduckgo.com;"
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
