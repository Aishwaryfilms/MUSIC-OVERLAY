const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');

const LocalTracker = require('./lib/local-tracker');
const SpotifyApiTracker = require('./lib/spotify-api');
const StateManager = require('./lib/state-manager');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize trackers & state
const localTracker = new LocalTracker();
const spotifyTracker = new SpotifyApiTracker();
const stateManager = new StateManager(localTracker, spotifyTracker);

// Start trackers
localTracker.start();
spotifyTracker.startPolling();

// WebSocket connection handling
wss.on('connection', (ws) => {
  // Send immediate current state
  const current = stateManager.getCurrentTrack();
  ws.send(JSON.stringify({
    type: 'init',
    track: {
      ...current,
      activeMode: stateManager.mode,
      settings: stateManager.settings
    }
  }));

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (e) {}
  });
});

function broadcast(data) {
  const json = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      client.send(json);
    }
  });
}

stateManager.on('track', (track) => {
  broadcast({
    type: 'track_update',
    track: track
  });
});

// Serve artwork image
const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
  <rect width="300" height="300" fill="#18181b"/>
  <circle cx="150" cy="150" r="70" fill="#27272a"/>
  <circle cx="150" cy="150" r="24" fill="#09090b"/>
  <path d="M142 135v30a12 12 0 1 0 8 11.3V145h20v-10h-28z" fill="#71717a"/>
</svg>`;

app.get('/api/current-art', (req, res) => {
  const artBuffer = localTracker.getArtBuffer();
  if (artBuffer && artBuffer.length > 0) {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=5');
    return res.send(artBuffer);
  }
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(FALLBACK_SVG);
});

// API Routes
app.get('/api/state', (req, res) => {
  const track = stateManager.getCurrentTrack();
  res.json({
    track: {
      ...track,
      activeMode: stateManager.mode,
      settings: stateManager.settings
    },
    spotifyConnected: spotifyTracker.isConnected(),
    localActive: localTracker.getCurrentTrack().status !== 'Closed'
  });
});

app.get('/api/settings', (req, res) => {
  res.json({
    settings: stateManager.settings,
    spotifyConnected: spotifyTracker.isConnected(),
    spotifyConfig: {
      clientId: spotifyTracker.config.clientId ? `${spotifyTracker.config.clientId.substring(0, 6)}...` : '',
      redirectUri: spotifyTracker.config.redirectUri
    }
  });
});

app.post('/api/settings', (req, res) => {
  stateManager.saveSettings(req.body);
  res.json({ success: true, settings: stateManager.settings });
});

app.post('/api/simulator/track', (req, res) => {
  const { index } = req.body;
  stateManager.setSimulatorTrack(Number(index) || 0);
  res.json({ success: true, track: stateManager.simulatorState });
});

app.post('/api/simulator/toggle-play', (req, res) => {
  stateManager.toggleSimulatorPlay();
  res.json({ success: true, track: stateManager.simulatorState });
});

// Spotify Developer Auth
app.get('/api/spotify/auth-url', (req, res) => {
  const url = spotifyTracker.getAuthUrl();
  if (!url) {
    return res.status(400).json({ error: 'Please save your Spotify Client ID first.' });
  }
  res.json({ url });
});

app.post('/api/spotify/config', (req, res) => {
  const { clientId, clientSecret, redirectUri } = req.body;
  spotifyTracker.saveConfig({
    clientId: clientId || spotifyTracker.config.clientId,
    clientSecret: clientSecret || spotifyTracker.config.clientSecret,
    redirectUri: redirectUri || 'http://localhost:3000/callback'
  });
  res.json({ success: true, isConnected: spotifyTracker.isConnected() });
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.send(`<h3>Authorization failed: no code returned.</h3><a href="/">Back to Dashboard</a>`);
  }
  try {
    await spotifyTracker.handleAuthCode(code);
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Spotify Connected</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #09090b; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
          .card { background: #18181b; padding: 40px; border-radius: 16px; border: 1px solid #27272a; max-width: 420px; }
          h2 { color: #10b981; margin-top: 0; }
          a { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #10b981; color: #000; text-decoration: none; border-radius: 8px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>✓ Spotify Connected!</h2>
          <p>Your Spotify Web API is linked. Cloud playback tracking is now active.</p>
          <a href="/">Open Overlay Dashboard</a>
        </div>
        <script>
          setTimeout(() => { window.location.href = "/"; }, 1500);
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`<h3>Error connecting to Spotify: ${err.message}</h3><a href="/">Back</a>`);
  }
});

// Explicit Overlay route
app.get('/overlay', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

// Launch true transparent desktop HUD window or stationary OBS Capture window
app.post('/api/hud/launch', (req, res) => {
  const electronExe = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');
  const appScript = path.join(__dirname, 'desktop-app.js');
  const shouldFloat = req.body && req.body.float !== undefined ? Boolean(req.body.float) : false;
  const args = [appScript, '--hud-only', shouldFloat ? '--float' : '--no-float'];

  try {
    const { spawn } = require('child_process');
    const child = spawn(electronExe, args, {
      detached: true,
      stdio: 'ignore',
      cwd: __dirname
    });
    child.on('error', (err) => {
      console.error('[HUD Launch Error]', err.message);
    });
    child.unref();
    res.json({ success: true, floating: shouldFloat });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[Server] Port ${PORT} already active, reusing existing instance.`);
  } else {
    console.error('[Server Error]', err);
  }
});

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🎵 TMO (Throttl Music Overlay) Engine is Running!`);
  console.log(`- Dashboard:          http://localhost:${PORT}`);
  console.log(`- OBS Browser Source: http://localhost:${PORT}/overlay`);
  console.log(`==================================================\n`);
});

process.on('uncaughtException', (err) => {
  console.error('[Server Error]', err.message);
});

process.on('SIGINT', () => {
  localTracker.stop();
  spotifyTracker.stopPolling();
  process.exit(0);
});
