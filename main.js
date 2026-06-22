const { app, BrowserWindow, globalShortcut, ipcMain, Tray, nativeImage, Menu, systemPreferences, session } = require('electron');
const path = require('path');
const fs = require('fs');

ipcMain.on('save-settings', (event, keys) => {
    const p = path.join(app.getPath('userData'), 'settings.json');
    fs.writeFileSync(p, JSON.stringify(keys));
    event.returnValue = true;
});

ipcMain.on('load-settings', (event) => {
    const p = path.join(app.getPath('userData'), 'settings.json');
    try {
        if (fs.existsSync(p)) {
            event.returnValue = JSON.parse(fs.readFileSync(p, 'utf8'));
            return;
        }
    } catch(e) {}
    event.returnValue = null;
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

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function createTray() {
    const icon = nativeImage.createEmpty();
    tray = new Tray(icon);
    tray.setTitle('🎙️ SV'); // Mic emoji + SV for Speaker Visualizer
    tray.setToolTip('Speaker Visualizer');
    
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Toggle Visualizer (Cmd+Shift+V)', click: toggleWindow },
        { type: 'separator' },
        { label: 'Quit', click: () => { app.isQuiting = true; app.quit(); } }
    ]);
    
    tray.setContextMenu(contextMenu);
}

function toggleWindow() {
    if (mainWindow) {
        if (mainWindow.isVisible()) {
            mainWindow.hide();
        } else {
            mainWindow.show();
            mainWindow.focus();
        }
    }
}

app.whenReady().then(async () => {
    // Automatically allow microphone permission requests
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

    await checkPermissions();
    createWindow();
    createTray();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
