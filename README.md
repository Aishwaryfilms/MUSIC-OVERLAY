# TMO — Throttl Music Overlay

> **Created by Throttl**
> Clean, modern desktop audio widget & stream overlay for Windows.

TMO captures real-time playback from **Spotify**, **Apple Music**, and **YouTube Music** via native Windows Media Session (GSMTC) listeners. It provides both a **100% transparent floating desktop widget** and an **OBS Browser Source overlay**.

---

## ✨ Features

- **True Transparent Desktop Overlay**: Frameless, borderless, and 100% transparent. Draggable anywhere across your monitors and automatically saves its position.
- **Universal Local Capture**:
  - **Spotify**: Native desktop app and web player.
  - **Apple Music**: Windows App and iTunes.
  - **YouTube Music**: Desktop PWA and Chrome/Edge browser sessions (automatically sanitizes messy video titles into clean Title and Artist).
- **5 Built-in Themes**:
  1. **Floating Vinyl**: Rotating vinyl disc with album art center and spinning groove animation.
  2. **Card Banner**: Sleek modern album card with live dynamic wave visualizer.
  3. **Vertical Dock**: Compact vertical stream overlay.
  4. **Capsule / Pill**: Ultra-compact rounded pill with rotating circular cover art.
  5. **Cassette Tape**: Retro cassette with rotating spools and vintage tape aesthetics.
- **AI Style Injector**:
  - Includes a built-in copyable **AI Context Template** for ChatGPT, Claude, and Gemini detailing all DOM selectors and CSS parameters.
  - Generates custom themes that instantly appear in the bottom layout switcher as **AI Custom**.
- **Auto-Hide When Paused**: Disappears cleanly when you pause music or start gaming, and reappears smoothly when playback resumes.
- **Single Universal OBS Link**: `http://localhost:3000/overlay` dynamically syncs with whichever theme or customization you choose.

---

## 🚀 Quick Start

### Running the App
- **Option 1**: Double-click **`TMO.exe`** (embedded icon, starts engine and opens Studio).
- **Option 2**: Run via command line:
  ```bash
  npm install
  npm start
  ```

### Adding to OBS Studio
1. Open **OBS Studio**.
2. Under **Sources**, click **`+`** $\rightarrow$ **Browser**.
3. Enter URL: `http://localhost:3000/overlay`
4. Set Width: `600`, Height: `240` (or adjust to your preferred layout).
5. Done! Changes made in TMO Studio update live in OBS with zero latency.

---

## 🛠️ Tech Stack
- **Engine**: Node.js, Express, WebSockets
- **Audio Capture**: Windows 10/11 GSMTC via PowerShell Media Session Listener
- **Desktop Client**: Electron (Frameless, Hardware Accelerated)
- **Launcher**: Native C# executable (`TMO.exe`)

---

## 📄 License
MIT License. Created with ❤️ by **Throttl**.
