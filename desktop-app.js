const { app, BrowserWindow, screen, ipcMain, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

app.setAppUserModelId('Throttl.MusicOverlay.TMO');

const boundsFile = path.join(__dirname, '.widget-bounds.json');
const iconPath = path.join(__dirname, 'assets', 'icon.png');

let splashWindow = null;
let hudWindow = null;
let mainWindow = null;
let tray = null;
let isHudFloating = false;

function loadSavedBounds() {
  try {
    if (fs.existsSync(boundsFile)) {
      return JSON.parse(fs.readFileSync(boundsFile, 'utf8'));
    }
  } catch (e) {}
  return null;
}

function saveBounds(bounds) {
  try {
    fs.writeFileSync(boundsFile, JSON.stringify(bounds), 'utf8');
  } catch (e) {}
}

function createTray() {
  if (tray) return;

  try {
    const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray = new Tray(trayIcon);
    tray.setToolTip('TMO — Throttl Music Overlay');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'TMO Studio',
        click: () => {
          createMainWindow();
        }
      },
      {
        label: 'Float on Desktop',
        click: () => {
          createDesktopHud({ float: true });
        }
      },
      { type: 'separator' },
      {
        label: 'Copy OBS Link',
        click: () => {
          const { clipboard } = require('electron');
          clipboard.writeText('http://localhost:3000/overlay');
        }
      },
      { type: 'separator' },
      {
        label: 'Exit TMO',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      createMainWindow();
    });
  } catch (e) {}
}

function showSplashScreen(onDone) {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 290,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    center: true,
    skipTaskbar: true,
    hasShadow: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const splashFile = path.join(__dirname, 'public', 'splash.html');
  splashWindow.loadFile(splashFile);

  // Display for 1800ms (1.8 seconds) so branding and creator name are clearly appreciated
  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    if (typeof onDone === 'function') onDone();
  }, 1800);
}

function createDesktopHud(options = {}) {
  const shouldFloat = options.float !== undefined ? Boolean(options.float) : isHudFloating;
  isHudFloating = shouldFloat;

  if (hudWindow && !hudWindow.isDestroyed()) {
    hudWindow.setAlwaysOnTop(shouldFloat);
    hudWindow.show();
    hudWindow.focus();
    return hudWindow;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const saved = loadSavedBounds();
  const defaultWidth = 540;
  const defaultHeight = 220;

  hudWindow = new BrowserWindow({
    title: 'TMO — Throttl Music Overlay',
    icon: iconPath,
    width: saved ? saved.width : defaultWidth,
    height: saved ? saved.height : defaultHeight,
    x: saved ? saved.x : Math.max(20, screenWidth - defaultWidth - 40),
    y: saved ? saved.y : Math.max(20, screenHeight - defaultHeight - 60),
    frame: false,
    transparent: true,
    alwaysOnTop: shouldFloat,
    skipTaskbar: false,
    hasShadow: false,
    resizable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  hudWindow.loadURL('http://localhost:3000/overlay');

  hudWindow.on('moved', () => {
    if (hudWindow) saveBounds(hudWindow.getBounds());
  });

  hudWindow.on('resize', () => {
    if (hudWindow) saveBounds(hudWindow.getBounds());
  });

  hudWindow.webContents.on('context-menu', (e, params) => {
    const isTop = hudWindow.isAlwaysOnTop();
    const contextMenu = Menu.buildFromTemplate([
      { label: 'TMO — Throttl Music Overlay', enabled: false },
      { type: 'separator' },
      {
        label: isTop ? '✓ Float on Desktop (Always on Top)' : 'Float on Desktop (Always on Top)',
        type: 'checkbox',
        checked: isTop,
        click: () => {
          isHudFloating = !isTop;
          hudWindow.setAlwaysOnTop(isHudFloating);
        }
      },
      {
        label: 'Open TMO Studio',
        click: () => createMainWindow()
      },
      { type: 'separator' },
      {
        label: 'Reset Position',
        click: () => {
          hudWindow.setPosition(screenWidth - defaultWidth - 40, screenHeight - defaultHeight - 60);
          saveBounds(hudWindow.getBounds());
        }
      },
      { type: 'separator' },
      { label: 'Close Overlay', role: 'close' }
    ]);
    contextMenu.popup();
  });

  hudWindow.on('closed', () => {
    hudWindow = null;
  });

  return hudWindow;
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    title: 'TMO — Throttl Music Overlay',
    icon: iconPath,
    width: 1060,
    height: 720,
    minWidth: 900,
    minHeight: 620,
    frame: false,
    backgroundColor: '#0c0c0e',
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadURL('http://localhost:3000');

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (!hudWindow) {
      app.quit();
    }
  });

  return mainWindow;
}

// Native Window Controls IPC
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => {
  app.isQuitting = true;
  app.quit();
});

ipcMain.on('launch-desktop-hud', (event, opts) => {
  createDesktopHud(opts || { float: true });
});

ipcMain.on('set-hud-float', (event, shouldFloat) => {
  isHudFloating = Boolean(shouldFloat);
  if (hudWindow && !hudWindow.isDestroyed()) {
    hudWindow.setAlwaysOnTop(isHudFloating);
  }
});

app.whenReady().then(() => {
  try {
    require('./server');
  } catch (e) {
    // Port 3000 may already be running from external server instance
  }

  createTray();

  const args = process.argv;
  if (args.includes('--hud-only')) {
    createDesktopHud({ float: args.includes('--float') });
  } else {
    // Show splash screen for ~0.9s before opening the main studio window
    showSplashScreen(() => {
      createMainWindow();
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (!hudWindow) {
    app.quit();
  }
});
