const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Get initial state when overlay loads
  getInitialState: () => ipcRenderer.invoke('get-initial-state'),

  // Live track updates pushed from main process
  onTrackUpdate: (callback) => {
    ipcRenderer.on('track-update', (_event, data) => callback(data));
  },

  // Theme switch commands relayed from dashboard
  onSwitchTheme: (callback) => {
    ipcRenderer.on('switch-theme', (_event, data) => callback(data));
  },

  // Settings updates relayed from dashboard
  onUpdateSettings: (callback) => {
    ipcRenderer.on('update-settings', (_event, data) => callback(data));
  }
});
