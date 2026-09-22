const express = require('express');
const http = require('http');

const PORT = process.env.PORT || 3000;

/**
 * Creates a minimal Express server for Spotify OAuth only.
 * No WebSocket. No static files. No overlay. No API.
 * @param {Object} spotifyTracker - SpotifyApiTracker instance
 * @returns {{ server: http.Server, app: express.Application }}
 */
function createOAuthServer(spotifyTracker) {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json());

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
      redirectUri: redirectUri || `http://localhost:${PORT}/callback`
    });
    res.json({ success: true, isConnected: spotifyTracker.isConnected() });
  });

  app.get('/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
      return res.send('<h3>Authorization failed: no code returned.</h3>');
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
            p { color: #a1a1aa; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>✓ Spotify Connected!</h2>
            <p>Your Spotify Web API is linked. You can close this tab and return to TMO.</p>
          </div>
          <script>setTimeout(() => { window.close(); }, 2000);</script>
        </body>
        </html>
      `);
    } catch (err) {
      res.status(500).send(`<h3>Error connecting to Spotify: ${err.message}</h3>`);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[OAuth Server] Port ${PORT} already in use.`);
    } else {
      console.error('[OAuth Server Error]', err);
    }
  });

  server.listen(PORT, () => {
    console.log(`[OAuth Server] Spotify callback listener on port ${PORT}`);
  });

  return { server, app };
}

module.exports = createOAuthServer;
