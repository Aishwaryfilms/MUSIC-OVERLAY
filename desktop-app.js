const { app, BrowserWindow, ipcMain, Tray, Menu, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// Ensure background and off-screen windows continue rendering for OBS capture
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

// 1. Initialize trackers + StateManager directly
const LocalTracker = require('./lib/local-tracker');
const SpotifyTracker = require('./lib/spotify-api');
const StateManager = require('./lib/state-manager');

const localTracker = new LocalTracker();
const spotifyTracker = new SpotifyTracker();
const stateManager = new StateManager(localTracker, spotifyTracker);

// Initialize OAuth callback server
const createOAuthServer = require('./server');
try {
  createOAuthServer(spotifyTracker);
} catch (err) {
  console.log('[OAuth Server]', err.message);
}

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
  const windows = [mainWindow, desktopOverlayWindow];
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

// Window Creation & In-App OBS Overlay Functions
let isObsMode = false;
let savedStudioBounds = { width: 1024, height: 768 };

function enterObsMode() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  isObsMode = true;
  const currentBounds = mainWindow.getBounds();
  if (currentBounds.width > 700) {
    savedStudioBounds = currentBounds;
  }
  const isVertical = stateManager.settings && stateManager.settings.orientation === 'vertical';
  const targetW = isVertical ? 380 : 700;
  const targetH = isVertical ? 540 : 320;
  mainWindow.setMinimumSize(300, 200);
  mainWindow.setSize(targetW, targetH, true);
  mainWindow.setTitle('TMO Overlay [OBS]');
  mainWindow.webContents.send('obs-mode-change', { active: true });
  sendToAllWindows('overlay-status', { mode: 'obs', isOpen: true });
}

function exitObsMode() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  isObsMode = false;
  mainWindow.setMinimumSize(800, 600);
  const restoreW = Math.max(800, savedStudioBounds.width || 1024);
  const restoreH = Math.max(600, savedStudioBounds.height || 768);
  mainWindow.setSize(restoreW, restoreH, true);
  mainWindow.setTitle('TMO Studio');
  mainWindow.webContents.send('obs-mode-change', { active: false });
  sendToAllWindows('overlay-status', { mode: 'obs', isOpen: false });
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (isObsMode) exitObsMode();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 300,
    minHeight: 200,
    title: 'TMO Studio',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload-dashboard.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
    isObsMode = false;
  });
}

function createDesktopOverlay() {
  if (desktopOverlayWindow && !desktopOverlayWindow.isDestroyed()) {
    desktopOverlayWindow.setAlwaysOnTop(true, 'screen-saver');
    desktopOverlayWindow.show();
    desktopOverlayWindow.focus();
    return desktopOverlayWindow;
  }

  const isVertical = stateManager.settings && stateManager.settings.orientation === 'vertical';
  const defaultWidth = isVertical ? 380 : 700;
  const defaultHeight = isVertical ? 540 : 320;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  let bounds = {
    width: defaultWidth,
    height: defaultHeight,
    x: Math.max(20, width - defaultWidth - 30),
    y: Math.max(20, height - defaultHeight - 30)
  };

  try {
    if (fs.existsSync(boundsFile)) {
      const savedBounds = JSON.parse(fs.readFileSync(boundsFile, 'utf8'));
      if (savedBounds.width && savedBounds.height) {
        // Enforce safe minimum bounds so old cached tiny window sizes never crop
        bounds.width = Math.max(savedBounds.width, isVertical ? 360 : 680);
        bounds.height = Math.max(savedBounds.height, isVertical ? 500 : 300);
      }
      if (savedBounds.x !== undefined && savedBounds.y !== undefined) {
        const onAnyScreen = screen.getAllDisplays().some(d => {
          return savedBounds.x >= d.bounds.x - 50 &&
                 savedBounds.x <= (d.bounds.x + d.bounds.width - 50) &&
                 savedBounds.y >= d.bounds.y - 50 &&
                 savedBounds.y <= (d.bounds.y + d.bounds.height - 50);
        });
        if (onAnyScreen) {
          bounds.x = savedBounds.x;
          bounds.y = savedBounds.y;
        }
      }
    }
  } catch (err) {}

  desktopOverlayWindow = new BrowserWindow({
    ...bounds,
    minWidth: isVertical ? 300 : 540,
    minHeight: isVertical ? 420 : 240,
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
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  desktopOverlayWindow.setAlwaysOnTop(true, 'screen-saver');
  desktopOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  desktopOverlayWindow.loadFile(path.join(__dirname, 'public', 'overlay.html'));

  desktopOverlayWindow.on('moved', () => {
    if (desktopOverlayWindow && !desktopOverlayWindow.isDestroyed()) {
      try { fs.writeFileSync(boundsFile, JSON.stringify(desktopOverlayWindow.getBounds())); } catch (e) {}
    }
  });
  desktopOverlayWindow.on('resize', () => {
    if (desktopOverlayWindow && !desktopOverlayWindow.isDestroyed()) {
      try { fs.writeFileSync(boundsFile, JSON.stringify(desktopOverlayWindow.getBounds())); } catch (e) {}
    }
  });

  desktopOverlayWindow.on('closed', () => {
    desktopOverlayWindow = null;
    sendToAllWindows('overlay-status', { mode: 'desktop', isOpen: false });
  });

  sendToAllWindows('overlay-status', { mode: 'desktop', isOpen: true });

  // Right-click context menu
  desktopOverlayWindow.webContents.on('context-menu', () => {
    const isTop = desktopOverlayWindow.isAlwaysOnTop();
    const ctxMenu = Menu.buildFromTemplate([
      { label: 'TMO — Desktop Overlay', enabled: false },
      { type: 'separator' },
      {
        label: isTop ? '✓ Always On Top' : 'Always On Top',
        type: 'checkbox',
        checked: isTop,
        click: () => {
          desktopOverlayWindow.setAlwaysOnTop(!isTop, 'screen-saver');
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
            width: defaultWidth,
            height: defaultHeight,
            x: disp.workAreaSize.width - defaultWidth - 30,
            y: disp.workAreaSize.height - defaultHeight - 30
          });
        }
      },
      { type: 'separator' },
      {
        label: 'Close Overlay',
        click: () => desktopOverlayWindow.close()
      }
    ]);
    ctxMenu.popup({ window: desktopOverlayWindow });
  });

  return desktopOverlayWindow;
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
    if (isObsMode && mainWindow && !mainWindow.isDestroyed()) {
      const isVertical = stateManager.settings && stateManager.settings.orientation === 'vertical';
      mainWindow.setSize(isVertical ? 380 : 700, isVertical ? 540 : 320, true);
    }
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
    enterObsMode();
    return { success: true };
  });

  ipcMain.handle('enter-obs-mode', () => {
    enterObsMode();
    return { success: true };
  });

  ipcMain.handle('exit-obs-mode', () => {
    exitObsMode();
    return { success: true };
  });

  ipcMain.handle('close-overlay', (event, mode) => {
    if (mode === 'desktop' && desktopOverlayWindow && !desktopOverlayWindow.isDestroyed()) {
      desktopOverlayWindow.close();
    } else if (mode === 'obs') {
      exitObsMode();
    }
    return { success: true };
  });

  ipcMain.handle('is-overlay-open', (event, mode) => {
    if (mode === 'desktop') return !!(desktopOverlayWindow && !desktopOverlayWindow.isDestroyed());
    if (mode === 'obs') return isObsMode;
    return false;
  });

  ipcMain.handle('toggle-obs-position', () => {
    return { success: true };
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
    if (channel === 'switch-theme' && data && data.orientation) {
      const isVert = data.orientation === 'vertical';
      const targetW = isVert ? 380 : 700;
      const targetH = isVert ? 540 : 320;
      if (desktopOverlayWindow && !desktopOverlayWindow.isDestroyed()) {
        desktopOverlayWindow.setSize(targetW, targetH, true);
      }
      if (isObsMode && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setSize(targetW, targetH, true);
      }
    }
    if (desktopOverlayWindow && !desktopOverlayWindow.isDestroyed()) {
      desktopOverlayWindow.webContents.send(channel, data);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
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
      { label: 'TMO Studio', click: () => { if (isObsMode) exitObsMode(); createMainWindow(); } },
      { label: 'Desktop Overlay', click: () => createDesktopOverlay() },
      { label: 'Toggle OBS Mode', click: () => { if (!isObsMode) enterObsMode(); else exitObsMode(); } },
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
