const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');
const fs = require('fs');

class LocalTracker extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.currentTrack = {
      source: 'local',
      title: '',
      artist: '',
      album: '',
      isPlaying: false,
      status: 'Idle',
      position: 0,
      duration: 0,
      hasArt: false,
      artUrl: null
    };
    this.latestArtBuffer = null;
    this.buffer = '';
  }

  start() {
    const scriptPath = path.join(__dirname, 'local-tracker.ps1');
    const args = [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath
    ];

    try {
      this.process = spawn('powershell.exe', args, {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.process.stdout.on('data', (chunk) => {
        this.buffer += chunk.toString('utf8');
        let lines = this.buffer.split('\n');
        this.buffer = lines.pop(); // keep last incomplete chunk

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('{')) continue;
          try {
            const data = JSON.parse(trimmed);
            this.handleData(data);
          } catch (e) {
            // ignore non-json or malformed
          }
        }
      });

      this.process.stderr.on('data', (chunk) => {
        // Silent or debug
      });

      this.process.on('close', (code) => {
        console.log(`[LocalTracker] PowerShell process exited with code ${code}. Restarting in 3s...`);
        this.process = null;
        setTimeout(() => this.start(), 3000);
      });

      this.process.on('error', (err) => {
        console.error('[LocalTracker] Process error:', err.message);
      });

      console.log('[LocalTracker] Windows Media GSMTC background listener started.');
    } catch (err) {
      console.error('[LocalTracker] Failed to launch PowerShell tracker:', err);
    }
  }

  handleData(data) {
    if (data.type !== 'track_update') return;

    if (data.artBase64) {
      try {
        this.latestArtBuffer = Buffer.from(data.artBase64, 'base64');
      } catch (e) {
        console.error('[LocalTracker] Failed to decode artBase64');
      }
    } else if (data.hasArt === false) {
      this.latestArtBuffer = null;
    }

    const changed = (
      this.currentTrack.title !== data.title ||
      this.currentTrack.artist !== data.artist ||
      this.currentTrack.isPlaying !== data.isPlaying ||
      Math.abs(this.currentTrack.position - data.position) > 2
    );

    this.currentTrack = {
      source: 'local',
      app: data.app || 'Music',
      platform: data.platform || 'spotify',
      platformName: data.platformName || 'Spotify',
      brandColor: data.brandColor || '#1db954',
      title: data.title || '',
      artist: data.artist || '',
      album: data.album || '',
      isPlaying: Boolean(data.isPlaying),
      status: data.status || 'Idle',
      position: Number(data.position) || 0,
      duration: Number(data.duration) || 0,
      hasArt: Boolean(this.latestArtBuffer),
      artUrl: null,
      updatedAt: Date.now()
    };

    this.emit('update', this.currentTrack);
  }

  getArtBuffer() {
    return this.latestArtBuffer;
  }

  getCurrentTrack() {
    return this.currentTrack;
  }

  stop() {
    if (this.process) {
      try {
        this.process.kill();
      } catch (e) {}
      this.process = null;
    }
  }
}

module.exports = LocalTracker;
