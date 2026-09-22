const { app, BrowserWindow, ipcMain, Tray, Menu, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// 1. Initialize trackers + StateManager directly
const LocalTracker = require('./lib/local-tracker');
const SpotifyTracker = require('./lib/spotify-api');
const StateManager = require('./lib/state-manager');

const localTracker = new LocalTracker();
const spotifyTracker = new SpotifyTracker();
const stateManager = new StateManager(localTracker, spotifyTracker);

// Start tracking immediately
localTracker.start();
spotifyTracker.startPolling();

// 13. Set App User Model ID
app.setAppUserModelId('Throttl.MusicOverlay.TMO');

// Global references to prevent garbage collection
let mainWindow = null;
let desktopOverlayWindow = null;
let obsOverlayWindow = null;
let tray = null;
let splashWindow = null;

// 14. Helper: Get artwork as Data URL
function getArtDataUrl() {
  const artBuffer = localTracker.getArtBuffer();
  if (artBuffer && artBuffer.length > 0) {
    return 'data:image/jpeg;base64,' + artBuffer.toString('base64');
  }
  // Return a fallback SVG as data URI
  const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="#18181b"/><circle cx="150" cy="150" r="70" fill="#27272a"/><circle cx="150" cy="150" r="24" fill="#09090b"/><path d="M142 135v30a12 12 0 1 0 8 11.3V145h20v-10h-28z" fill="#71717a"/></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(FALLBACK_SVG).toString('base64');
}

// Helper: Broadcast to all active windows
function sendToAllWindows(channel, data) {
  const windows = [mainWindow, desktopOverlayWindow, obsOverlayWindow];
  for (const win of windows) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}

// 7. Track update broadcasting
stateManager.on('track', (track) => {
  const artDataUrl = getArtDataUrl();
  sendToAllWindows('track-update', { track, artDataUrl });
});

// 8. Settings update broadcasting
stateManager.on('settings_update', (settings) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings-update', settings);
  }
});

// Window Creation Functions

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    title: 'TMO Studio',
    frame: false,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-dashboard.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 3. Load via loadFile
  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createDesktopOverlay() {
  if (desktopOverlayWindow && !desktopOverlayWindow.isDestroyed()) {
    desktopOverlayWindow.focus();
    return;
  }

  // Calculate default bounds or load from saved settings
  const boundsFile = path.join(app.getPath('userData'), '.widget-bounds.json');
  let bounds = { width: 540, height: 220 };
  
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  bounds.x = width - bounds.width - 20;
  bounds.y = height - bounds.height - 20;

  try {
    if (fs.existsSync(boundsFile)) {
      const savedBounds = JSON.parse(fs.readFileSync(boundsFile, 'utf8'));
      bounds = { ...bounds, ...savedBounds };
    }
  } catch (err) {
    console.error('Failed to load desktop overlay bounds:', err);
  }

  desktopOverlayWindow = new BrowserWindow({
    ...bounds,
    title: 'TMO Overlay',
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: true,
    hasShadow: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-overlay.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  desktopOverlayWindow.loadFile(path.join(__dirname, 'public', 'overlay.html'));

  // Save bounds on close
  desktopOverlayWindow.on('close', () => {
    try {
      if (!desktopOverlayWindow.isDestroyed()) {
        const finalBounds = desktopOverlayWindow.getBounds();
        fs.writeFileSync(boundsFile, JSON.stringify(finalBounds));
      }
    } catch (err) {
      console.error('Failed to save desktop overlay bounds:', err);
    }
  });

  desktopOverlayWindow.on('closed', () => {
    desktopOverlayWindow = null;
  });

  // Right-click context menu
  desktopOverlayWindow.webContents.on('context-menu', () => {
    const ctxMenu = Menu.buildFromTemplate([
      {
        label: 'Toggle Always On Top',
        type: 'checkbox',
        checked: desktopOverlayWindow.isAlwaysOnTop(),
        click: () => {
          desktopOverlayWindow.setAlwaysOnTop(!desktopOverlayWindow.isAlwaysOnTop());
        }
      },
      {
        label: 'Open TMO Studio',
        click: () => createMainWindow()
      },
      {
        label: 'Reset Position',
        click: () => {
          const disp = screen.getPrimaryDisplay();
          desktopOverlayWindow.setBounds({
            width: 540,
            height: 220,
            x: disp.workAreaSize.width - 540 - 20,
            y: disp.workAreaSize.height - 220 - 20
          });
        }
      },
      {
        label: 'Close Overlay',
        click: () => desktopOverlayWindow.close()
      }
    ]);
    ctxMenu.popup({ window: desktopOverlayWindow });
  });
}

function createObsOverlay() {
  if (obsOverlayWindow && !obsOverlayWindow.isDestroyed()) {
    obsOverlayWindow.focus();
    return;
  }

  obsOverlayWindow = new BrowserWindow({
    width: 600,
    height: 250,
    title: 'TMO Overlay [OBS]',
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    alwaysOnTop: false,
    resizable: true,
    hasShadow: false,
    skipTaskbar: true,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-overlay.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Click-through functionality for OBS
  obsOverlayWindow.setIgnoreMouseEvents(true, { forward: true });

  obsOverlayWindow.loadFile(path.join(__dirname, 'public', 'overlay.html'));

  obsOverlayWindow.on('closed', () => {
    obsOverlayWindow = null;
  });
}

function showSplashScreen(callback) {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 500,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'public', 'splash.html'));
  
  // Minimal dummy logic to represent loading phase
  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    if (callback) callback();
  }, 2000);
}

// 6. IPC Handlers Registration
function registerIpcHandlers() {
  ipcMain.handle('get-state', () => {
    const track = stateManager.getCurrentTrack();
    return {
      track: { ...track, activeMode: stateManager.mode, settings: stateManager.settings },
      spotifyConnected: spotifyTracker.isConnected(),
      localActive: localTracker.getCurrentTrack().status !== 'Closed',
      artDataUrl: getArtDataUrl()
    };
  });

  ipcMain.handle('get-settings', () => {
    return {
      settings: stateManager.settings,
      spotifyConnected: spotifyTracker.isConnected(),
      spotifyConfig: {
        clientId: spotifyTracker.config.clientId ? `${spotifyTracker.config.clientId.substring(0, 6)}...` : '',
        redirectUri: spotifyTracker.config.redirectUri
      }
    };
  });

  ipcMain.handle('save-settings', (event, data) => {
    stateManager.saveSettings(data);
    sendToAllWindows('settings-update', stateManager.settings);
    return { success: true, settings: stateManager.settings };
  });

  ipcMain.handle('get-artwork', () => {
    return getArtDataUrl();
  });

  ipcMain.handle('get-initial-state', () => {
    const track = stateManager.getCurrentTrack();
    return {
      track: { ...track, activeMode: stateManager.mode, settings: stateManager.settings },
      settings: stateManager.settings,
      artDataUrl: getArtDataUrl()
    };
  });

  ipcMain.handle('launch-desktop-overlay', () => {
    createDesktopOverlay();
    return { success: true };
  });

  ipcMain.handle('launch-obs-overlay', () => {
    createObsOverlay();
    return { success: true };
  });

  ipcMain.handle('close-overlay', (event, mode) => {
    if (mode === 'desktop' && desktopOverlayWindow && !desktopOverlayWindow.isDestroyed()) {
      desktopOverlayWindow.close();
    } else if (mode === 'obs' && obsOverlayWindow && !obsOverlayWindow.isDestroyed()) {
      obsOverlayWindow.close();
    }
    return { success: true };
  });

  ipcMain.handle('is-overlay-open', (event, mode) => {
    if (mode === 'desktop') return !!(desktopOverlayWindow && !desktopOverlayWindow.isDestroyed());
    if (mode === 'obs') return !!(obsOverlayWindow && !obsOverlayWindow.isDestroyed());
    return false;
  });

  ipcMain.handle('simulator-track', (event, index) => {
    if (typeof stateManager.setSimulatorTrack === 'function') {
      stateManager.setSimulatorTrack(index);
    }
    return { success: true, track: stateManager.getCurrentTrack() };
  });

  ipcMain.handle('simulator-toggle', () => {
    if (typeof stateManager.toggleSimulatorPlay === 'function') {
      stateManager.toggleSimulatorPlay();
    }
    return { success: true, track: stateManager.getCurrentTrack() };
  });

  ipcMain.handle('get-spotify-auth-url', () => {
    return { url: spotifyTracker.getAuthUrl() };
  });

  ipcMain.handle('save-spotify-config', (event, config) => {
    if (typeof spotifyTracker.saveConfig === 'function') {
      spotifyTracker.saveConfig(config);
    }
    return { success: true };
  });

  ipcMain.on('relay-to-overlays', (event, { channel, data }) => {
    if (desktopOverlayWindow && !desktopOverlayWindow.isDestroyed()) {
      desktopOverlayWindow.webContents.send(channel, data);
    }
    if (obsOverlayWindow && !obsOverlayWindow.isDestroyed()) {
      obsOverlayWindow.webContents.send(channel, data);
    }
  });

  // Window control handlers for dashboard
  ipcMain.on('window-minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
  });

  ipcMain.on('window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
  });

  ipcMain.on('window-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });
}

// 11. App Startup
app.whenReady().then(() => {
  // Start minimal OAuth server
  const startServer = require('./server');
  startServer(spotifyTracker);

  // 9. Tray Menu
  try {
    const iconPath = path.join(__dirname, 'assets', 'icon.png');
    const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray = new Tray(trayIcon);
    const contextMenu = Menu.buildFromTemplate([
      { label: 'TMO Studio', click: () => createMainWindow() },
      { label: 'Desktop Overlay', click: () => createDesktopOverlay() },
      { label: 'OBS Overlay', click: () => createObsOverlay() },
      { type: 'separator' },
      { label: 'Exit TMO', click: () => app.quit() }
    ]);
    tray.setToolTip('TMO — Throttl Music Overlay');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => createMainWindow());
  } catch (err) {
    console.error('Failed to create tray icon:', err);
  }

  registerIpcHandlers();

  // Handle command line arguments
  if (process.argv.includes('--hud-only')) {
    createDesktopOverlay();
  } else {
    showSplashScreen(() => {
      createMainWindow();
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 12. Cleanup on quit
app.on('before-quit', () => {
  localTracker.stop();
  spotifyTracker.stopPolling();
});
