const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

const DEFAULT_SIMULATOR_TRACKS = [
  {
    title: "Starboy",
    artist: "The Weeknd, Daft Punk",
    album: "Starboy",
    duration: 230,
    position: 45,
    isPlaying: true,
    artUrl: "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=500&auto=format&fit=crop&q=80"
  },
  {
    title: "Midnight City",
    artist: "M83",
    album: "Hurry Up, We're Dreaming",
    duration: 243,
    position: 88,
    isPlaying: true,
    artUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80"
  },
  {
    title: "Redbone",
    artist: "Childish Gambino",
    album: "\"Awaken, My Love!\"",
    duration: 326,
    position: 120,
    isPlaying: true,
    artUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=80"
  },
  {
    title: "Resonance",
    artist: "HOME",
    album: "Odyssey",
    duration: 212,
    position: 95,
    isPlaying: false,
    artUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&auto=format&fit=crop&q=80"
  }
];

class StateManager extends EventEmitter {
  constructor(localTracker, spotifyTracker) {
    super();
    this.localTracker = localTracker;
    this.spotifyTracker = spotifyTracker;
    this.settingsPath = path.join(__dirname, '..', 'settings.json');
    this.settings = this.loadSettings();

    this.mode = this.settings.mode || 'auto'; // 'auto' | 'local' | 'spotify' | 'simulator'
    this.simulatorIndex = 0;
    this.simulatorState = {
      ...DEFAULT_SIMULATOR_TRACKS[0],
      source: 'simulator',
      app: 'Simulator Engine',
      status: 'Playing',
      hasArt: true
    };

    // Listen to local tracker
    this.localTracker.on('update', (track) => {
      if (this.mode === 'local' || (this.mode === 'auto' && !this.isSpotifyApiActive())) {
        this.emitUpdate(track);
      }
    });

    // Listen to spotify API tracker
    this.spotifyTracker.on('update', (track) => {
      if (this.mode === 'spotify' || (this.mode === 'auto' && this.isSpotifyApiActive())) {
        this.emitUpdate(track);
      }
    });

    // Simulator tick
    setInterval(() => {
      if (this.mode === 'simulator' && this.simulatorState.isPlaying) {
        this.simulatorState.position += 1;
        if (this.simulatorState.position >= this.simulatorState.duration) {
          this.simulatorIndex = (this.simulatorIndex + 1) % DEFAULT_SIMULATOR_TRACKS.length;
          this.setSimulatorTrack(this.simulatorIndex);
        } else {
          this.emitUpdate(this.simulatorState);
        }
      }
    }, 1000);
  }

  loadSettings() {
    try {
      if (fs.existsSync(this.settingsPath)) {
        return JSON.parse(fs.readFileSync(this.settingsPath, 'utf8'));
      }
    } catch (e) {
      console.error('[StateManager] Failed reading settings:', e.message);
    }
    return {
      mode: 'auto', // 'auto', 'local', 'spotify', 'simulator'
      activeTheme: 'vinyl',
      orientation: 'horizontal',
      autoHideWhenPaused: false,
      visualizerStyle: 'wave',
      showProgressBar: true,
      showVisualizer: true,
      showTimecode: true,
      customCss: '',
      customJs: '',
      accentColor: '#1db954',
      scale: 1.0,
      floatOnDesktop: false,
      backgroundMode: 'transparent' // 'transparent', 'chroma-green', 'chroma-magenta'
    };
  }

  saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    if (newSettings.mode) {
      this.mode = newSettings.mode;
    }
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf8');
    } catch (e) {
      console.error('[StateManager] Failed saving settings:', e.message);
    }
    this.emit('settings_update', this.settings);
    this.emitCurrentState();
  }

  isSpotifyApiActive() {
    const track = this.spotifyTracker.currentTrack;
    return this.spotifyTracker.isConnected() && track && track.title;
  }

  getCurrentTrack() {
    if (this.mode === 'simulator') {
      return this.simulatorState;
    }
    if (this.mode === 'spotify') {
      return this.spotifyTracker.currentTrack || { source: 'spotify', isPlaying: false, title: '' };
    }
    if (this.mode === 'local') {
      return this.localTracker.getCurrentTrack();
    }
    // Auto mode
    if (this.isSpotifyApiActive()) {
      return this.spotifyTracker.currentTrack;
    }
    return this.localTracker.getCurrentTrack();
  }

  setMode(mode) {
    this.mode = mode;
    this.saveSettings({ mode });
  }

  setSimulatorTrack(index) {
    const track = DEFAULT_SIMULATOR_TRACKS[index % DEFAULT_SIMULATOR_TRACKS.length];
    this.simulatorIndex = index % DEFAULT_SIMULATOR_TRACKS.length;
    this.simulatorState = {
      ...track,
      source: 'simulator',
      app: 'Simulator Engine',
      status: track.isPlaying ? 'Playing' : 'Paused',
      hasArt: Boolean(track.artUrl),
      updatedAt: Date.now()
    };
    this.emitUpdate(this.simulatorState);
  }

  toggleSimulatorPlay() {
    this.simulatorState.isPlaying = !this.simulatorState.isPlaying;
    this.simulatorState.status = this.simulatorState.isPlaying ? 'Playing' : 'Paused';
    this.emitUpdate(this.simulatorState);
  }

  emitUpdate(track) {
    const enriched = {
      ...track,
      activeMode: this.mode,
      settings: this.settings
    };
    this.emit('track', enriched);
  }

  emitCurrentState() {
    this.emitUpdate(this.getCurrentTrack());
  }
}

module.exports = StateManager;
