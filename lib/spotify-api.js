const EventEmitter = require('events');
const https = require('https');
const fs = require('fs');
const path = require('path');

class SpotifyApiTracker extends EventEmitter {
  constructor(configPath) {
    super();
    this.configPath = configPath || path.join(__dirname, '..', 'config.json');
    this.config = this.loadConfig();
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.pollingInterval = null;
    this.currentTrack = null;
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      }
    } catch (e) {
      console.error('[SpotifyAPI] Failed to read config:', e.message);
    }
    return {
      clientId: '',
      clientSecret: '',
      refreshToken: '',
      redirectUri: 'http://localhost:3000/callback'
    };
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
    } catch (e) {
      console.error('[SpotifyAPI] Failed to save config:', e.message);
    }
  }

  getAuthUrl() {
    if (!this.config.clientId) return null;
    const scope = encodeURIComponent('user-read-currently-playing user-read-playback-state');
    const redirect = encodeURIComponent(this.config.redirectUri || 'http://localhost:3000/callback');
    return `https://accounts.spotify.com/authorize?response_type=code&client_id=${this.config.clientId}&scope=${scope}&redirect_uri=${redirect}`;
  }

  async handleAuthCode(code) {
    const creds = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
    const postData = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: this.config.redirectUri || 'http://localhost:3000/callback'
    }).toString();

    const data = await this.makePostRequest('accounts.spotify.com', '/api/token', postData, {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    });

    if (data.access_token) {
      this.accessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + (data.expires_in * 1000) - 30000;
      if (data.refresh_token) {
        this.saveConfig({ refreshToken: data.refresh_token });
      }
      this.startPolling();
      return { success: true };
    } else {
      throw new Error(data.error_description || 'Failed to exchange authorization code');
    }
  }

  async refreshAccessToken() {
    if (!this.config.refreshToken || !this.config.clientId || !this.config.clientSecret) {
      return false;
    }
    try {
      const creds = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
      const postData = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.config.refreshToken
      }).toString();

      const data = await this.makePostRequest('accounts.spotify.com', '/api/token', postData, {
        'Authorization': `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      });

      if (data.access_token) {
        this.accessToken = data.access_token;
        this.tokenExpiresAt = Date.now() + (data.expires_in * 1000) - 30000;
        if (data.refresh_token) {
          this.saveConfig({ refreshToken: data.refresh_token });
        }
        return true;
      }
    } catch (err) {
      console.error('[SpotifyAPI] Token refresh error:', err.message);
    }
    return false;
  }

  async getValidToken() {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }
    if (await this.refreshAccessToken()) {
      return this.accessToken;
    }
    return null;
  }

  async pollCurrentlyPlaying() {
    const token = await this.getValidToken();
    if (!token) return;

    try {
      const res = await this.makeGetRequest('api.spotify.com', '/v1/me/player/currently-playing', {
        'Authorization': `Bearer ${token}`
      });

      if (!res || !res.item) {
        // No song or 204 No Content
        this.currentTrack = {
          source: 'spotify',
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
        this.emit('update', this.currentTrack);
        return;
      }

      const item = res.item;
      const artists = (item.artists || []).map(a => a.name).join(', ');
      const album = item.album ? item.album.name : '';
      const artUrl = (item.album && item.album.images && item.album.images.length > 0)
        ? item.album.images[0].url
        : null;

      this.currentTrack = {
        source: 'spotify',
        app: 'Spotify Web API',
        title: item.name || '',
        artist: artists,
        album: album,
        isPlaying: Boolean(res.is_playing),
        status: res.is_playing ? 'Playing' : 'Paused',
        position: Math.round((res.progress_ms || 0) / 1000),
        duration: Math.round((item.duration_ms || 0) / 1000),
        hasArt: Boolean(artUrl),
        artUrl: artUrl,
        updatedAt: Date.now()
      };

      this.emit('update', this.currentTrack);
    } catch (err) {
      // ignore transient polling errors
    }
  }

  startPolling() {
    if (this.pollingInterval) clearInterval(this.pollingInterval);
    if (!this.config.refreshToken) return;
    this.pollCurrentlyPlaying();
    this.pollingInterval = setInterval(() => this.pollCurrentlyPlaying(), 1200);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  isConnected() {
    return Boolean(this.config.refreshToken && this.config.clientId);
  }

  makeGetRequest(hostname, path, headers) {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname,
        path,
        method: 'GET',
        headers
      }, (res) => {
        if (res.statusCode === 204) return resolve(null);
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve(null);
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  makePostRequest(hostname, path, postData, headers) {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname,
        path,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve({ error: 'invalid_json', raw: body });
          }
        });
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }
}

module.exports = SpotifyApiTracker;
