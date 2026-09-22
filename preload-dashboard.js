const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // State & Settings
  getState: () => ipcRenderer.invoke('get-state'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (data) => ipcRenderer.invoke('save-settings', data),
  getArtworkDataUrl: () => ipcRenderer.invoke('get-artwork'),

  // Live updates from main process
  onTrackUpdate: (callback) => {
    ipcRenderer.on('track-update', (_event, data) => callback(data));
  },
  onSettingsUpdate: (callback) => {
    ipcRenderer.on('settings-update', (_event, data) => callback(data));
  },

  // Overlay control
  launchDesktopOverlay: () => ipcRenderer.invoke('launch-desktop-overlay'),
  launchObsOverlay: () => ipcRenderer.invoke('launch-obs-overlay'),
  closeOverlay: (mode) => ipcRenderer.invoke('close-overlay', mode),
  isOverlayOpen: (mode) => ipcRenderer.invoke('is-overlay-open', mode),
  toggleObsPosition: () => ipcRenderer.invoke('toggle-obs-position'),

  // Send theme/settings changes to overlay windows (relayed by main)
  sendToOverlay: (channel, data) => ipcRenderer.send('relay-to-overlays', { channel, data }),

  // Window controls
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),

  // Simulator
  setSimulatorTrack: (index) => ipcRenderer.invoke('simulator-track', index),
  toggleSimulatorPlay: () => ipcRenderer.invoke('simulator-toggle'),

  // Spotify OAuth
  getSpotifyAuthUrl: () => ipcRenderer.invoke('get-spotify-auth-url'),
  saveSpotifyConfig: (config) => ipcRenderer.invoke('save-spotify-config', config)
});
