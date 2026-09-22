(function () {
  const container = document.getElementById('overlay-container');
  let currentTheme = null;
  let currentOrientation = null;
  let currentTrack = null;
  let visualizer = null;
  let currentArtDataUrl = null;

  function formatTime(seconds) {
    const s = Math.floor(seconds || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
  }

  function isCustomThemeId(th) {
    return th === 'custom' || (typeof th === 'string' && th.startsWith('custom-'));
  }

  function getArtSrc() {
    return currentArtDataUrl || '';
  }

  function renderShell(theme, orientation) {
    if (visualizer) {
      visualizer.destroy();
      visualizer = null;
    }

    currentTheme = theme;
    currentOrientation = orientation || 'horizontal';
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.id = 'theme-root';

    const artSrc = getArtSrc();

    if (theme === 'vinyl') {
      wrapper.className = 'theme-vinyl';
      wrapper.innerHTML = `
        <div class="vinyl-record" id="vinyl-disc">
          <div class="vinyl-grooves"></div>
          <div class="vinyl-center">
            <img id="track-art" src="${artSrc}" alt="Cover" />
            <div class="spindle"></div>
          </div>
        </div>
        <div class="vinyl-info">
          <div class="track-title" id="track-title">Waiting for track...</div>
          <div class="track-artist" id="track-artist">Connecting audio...</div>
          <div class="vinyl-meta">
            <span class="platform-badge" id="platform-badge">MUSIC</span>
            <div class="live-pill" id="live-pill">
              <span class="dot"></span>
              <span id="status-text">OFFLINE</span>
            </div>
            <span class="timecode" id="timecode">0:00 / 0:00</span>
          </div>
          <div class="vinyl-bar-wrap">
            <div class="vinyl-bar-fill" id="progress-fill"></div>
          </div>
        </div>
      `;
    } else if (theme === 'card') {
      wrapper.className = `theme-card orientation-${currentOrientation}`;
      wrapper.innerHTML = `
        <div class="card-art">
          <img id="track-art" src="${artSrc}" alt="Cover" />
        </div>
        <div class="card-content">
          <div class="track-title" id="track-title">Waiting for track...</div>
          <div class="track-artist" id="track-artist">Spotify Desktop / API</div>
          <div class="progress-container">
            <div class="progress-fill" id="progress-fill"></div>
          </div>
          <div class="card-meta-row">
            <span class="timecode" id="timecode">0:00 / 0:00</span>
          </div>
          <div class="wave-container">
            <canvas class="wave-canvas" id="wave-canvas"></canvas>
          </div>
        </div>
      `;
    } else if (theme === 'pill') {
      wrapper.className = 'theme-pill';
      wrapper.innerHTML = `
        <div class="pill-art" id="pill-art-disc">
          <img id="track-art" src="${artSrc}" alt="Cover" />
        </div>
        <div class="pill-text">
          <span class="pill-title" id="track-title">Waiting for track...</span>
          <span class="pill-sep">/</span>
          <span class="pill-artist" id="track-artist">Spotify</span>
        </div>
        <div class="mini-eq" id="mini-eq">
          <span></span><span></span><span></span><span></span>
        </div>
      `;
    } else if (theme === 'cassette') {
      wrapper.className = 'theme-cassette';
      wrapper.innerHTML = `
        <div class="cassette-head">
          <div class="cassette-label-art">
            <img id="track-art-mini" src="${artSrc}" alt="Thumb" />
          </div>
          <div class="cassette-info">
            <div class="track-title" id="track-title">Waiting for track...</div>
            <div class="track-artist" id="track-artist">Spotify Desktop / API</div>
          </div>
          <div class="cassette-side">SIDE A</div>
        </div>
        <div class="cassette-chassis">
          <div class="cassette-chassis-art">
            <img id="track-art-bg" src="${artSrc}" alt="Art Backing" />
          </div>
          <div class="spool-gear spool-spinning" id="spool-left">
            <div class="spool-teeth"></div>
          </div>
          <div class="tape-bridge">
            <span class="tape-time" id="timecode">0:00 / 0:00</span>
          </div>
          <div class="spool-gear spool-spinning" id="spool-right">
            <div class="spool-teeth"></div>
          </div>
        </div>
        <div class="cassette-bottom">
          <span class="cassette-spec">STEREO 44.1kHz</span>
          <span class="cassette-spec" id="status-text">OFFLINE</span>
        </div>
      `;
    } else if (isCustomThemeId(theme)) {
      wrapper.className = 'theme-custom theme-card orientation-horizontal';
      wrapper.innerHTML = `
        <div class="card-art">
          <img id="track-art" src="${artSrc}" alt="Cover" />
        </div>
        <div class="card-content">
          <div class="track-title" id="track-title">Waiting for track...</div>
          <div class="track-artist" id="track-artist">Connecting audio...</div>
          <div class="progress-container">
            <div class="progress-fill" id="progress-fill"></div>
          </div>
          <div class="card-meta-row">
            <span class="platform-badge" id="platform-badge">MUSIC</span>
            <div class="live-pill" id="live-pill">
              <span class="dot"></span>
              <span id="status-text">OFFLINE</span>
            </div>
            <span class="timecode" id="timecode">0:00 / 0:00</span>
          </div>
          <div class="wave-container">
            <canvas class="wave-canvas" id="wave-canvas"></canvas>
          </div>
        </div>
      `;
    }

    container.appendChild(wrapper);

    // Wave Visualizer
    const canvas = document.getElementById('wave-canvas');
    if (canvas && window.FluidWaveVisualizer) {
      visualizer = new FluidWaveVisualizer(canvas, {
        lineColor: '#1db954',
        secondaryColor: 'rgba(255, 255, 255, 0.25)',
        isPlaying: false
      });
      window.addEventListener('resize', () => visualizer && visualizer.resize());
    }

    if (currentTrack) {
      applyTrackToDOM(currentTrack);
    }
  }

  function applyTrackToDOM(track) {
    const rootEl = document.getElementById('theme-root');
    if (!rootEl) return;

    const settings = track.settings || {};
    const autoHide = Boolean(settings.autoHideWhenPaused);
    const isPlaying = Boolean(track.isPlaying);

    // Auto-hide when paused toggle
    if (autoHide && !isPlaying) {
      rootEl.classList.add('overlay-hidden');
    } else {
      rootEl.classList.remove('overlay-hidden');
    }

    // Layout toggles
    rootEl.classList.toggle('hide-progress', settings.showProgressBar === false);
    rootEl.classList.toggle('hide-wave', settings.showVisualizer === false);
    rootEl.classList.toggle('hide-timecode', settings.showTimecode === false);

    // Scale
    const activeScale = settings.scale || 1.0;
    if (activeScale !== 1.0) {
      container.style.transform = `scale(${activeScale})`;
      container.style.transformOrigin = 'center center';
    } else {
      container.style.transform = '';
    }

    // Accent color
    const activeAccent = settings.accentColor || '#1db954';
    document.documentElement.style.setProperty('--accent', activeAccent);
    if (visualizer) visualizer.setColor(activeAccent);

    // Custom CSS injection: STRICTLY isolated to custom theme only
    let styleTag = document.getElementById('user-injected-style');
    const isCustom = isCustomThemeId(currentTheme);
    let activeCss = '';

    if (isCustom) {
      if (settings.customThemes && Array.isArray(settings.customThemes)) {
        const found = settings.customThemes.find((t) => t.id === currentTheme || t.id === settings.activeCustomThemeId);
        if (found && found.css) {
          activeCss = found.css;
        }
      }
      if (!activeCss && settings.customCss) {
        activeCss = settings.customCss;
      }
    }

    if (isCustom && activeCss && activeCss.trim().length > 0) {
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'user-injected-style';
        document.head.appendChild(styleTag);
      }
      styleTag.textContent = activeCss;
    } else if (styleTag) {
      styleTag.textContent = '';
      if (styleTag.parentNode) {
        styleTag.parentNode.removeChild(styleTag);
      }
    }

    const titleEl = document.getElementById('track-title');
    const artistEl = document.getElementById('track-artist');
    const artEl = document.getElementById('track-art');
    const artMiniEl = document.getElementById('track-art-mini');
    const artBgEl = document.getElementById('track-art-bg');
    const livePill = document.getElementById('live-pill');
    const statusText = document.getElementById('status-text');
    const timecodeEl = document.getElementById('timecode');
    const progressFill = document.getElementById('progress-fill');
    const vinylDisc = document.getElementById('vinyl-disc');
    const miniEq = document.getElementById('mini-eq');
    const spoolLeft = document.getElementById('spool-left');
    const spoolRight = document.getElementById('spool-right');
    const pillArtDisc = document.getElementById('pill-art-disc');

    // Title & Artist
    if (titleEl) titleEl.textContent = track.title || 'No Track Playing';
    if (artistEl) artistEl.textContent = track.artist || (track.isPlaying ? 'Unknown Artist' : 'Paused / Idle');

    // Artwork — use base64 data URI from IPC
    const artSrc = currentArtDataUrl || '';
    if (artEl && artSrc) artEl.src = artSrc;
    if (artMiniEl && artSrc) artMiniEl.src = artSrc;
    if (artBgEl && artSrc) artBgEl.src = artSrc;

    // Expose live artwork URL as CSS custom property on root and theme element
    if (artSrc) {
      rootEl.style.setProperty('--track-art-url', `url("${artSrc}")`);
      document.documentElement.style.setProperty('--track-art-url', `url("${artSrc}")`);
    }

    // Status pill & Platform Badge
    const platformBadge = document.getElementById('platform-badge');
    if (platformBadge) {
      const pName = track.platformName || (track.source === 'spotify' ? 'Spotify' : 'Music');
      const pId = track.platform || 'spotify';
      platformBadge.textContent = pName.toUpperCase();
      platformBadge.className = `platform-badge platform-${pId}`;
    }

    if (livePill) {
      livePill.className = `live-pill ${isPlaying ? 'active' : ''}`;
    }
    if (statusText) {
      statusText.textContent = isPlaying ? 'PLAYING' : 'PAUSED';
    }

    // Timecode & Progress
    const pos = track.position || 0;
    const dur = track.duration || 0;
    if (timecodeEl) {
      timecodeEl.textContent = `${formatTime(pos)} / ${formatTime(dur)}`;
    }
    if (progressFill && dur > 0) {
      const pct = Math.min(100, Math.max(0, (pos / dur) * 100));
      progressFill.style.width = `${pct}%`;
    }

    // Vinyl spinning
    if (vinylDisc) {
      if (isPlaying) {
        vinylDisc.classList.add('vinyl-spinning');
        vinylDisc.classList.remove('vinyl-paused');
      } else {
        vinylDisc.classList.add('vinyl-paused');
      }
    }

    // Pill Disc
    if (pillArtDisc) {
      if (isPlaying) {
        pillArtDisc.classList.add('vinyl-spinning');
        pillArtDisc.classList.remove('vinyl-paused');
      } else {
        pillArtDisc.classList.add('vinyl-paused');
      }
    }

    // Mini EQ
    if (miniEq) {
      if (isPlaying) {
        miniEq.classList.add('playing');
      } else {
        miniEq.classList.remove('playing');
      }
    }

    // Cassette spools
    if (spoolLeft && spoolRight) {
      if (isPlaying) {
        spoolLeft.classList.remove('spool-paused');
        spoolRight.classList.remove('spool-paused');
      } else {
        spoolLeft.classList.add('spool-paused');
        spoolRight.classList.add('spool-paused');
      }
    }

    if (visualizer) {
      visualizer.setPlaying(isPlaying);
    }
  }

  function handleStateUpdate(track, artDataUrl) {
    if (!track) return;
    if (artDataUrl !== undefined) {
      currentArtDataUrl = artDataUrl;
    }
    currentTrack = track;

    const settings = track.settings || {};
    const activeTheme = settings.activeTheme || 'vinyl';
    const activeOrientation = settings.orientation || 'horizontal';

    const bgMode = settings.backgroundMode || 'transparent';
    document.body.classList.remove('bg-chroma-green', 'bg-chroma-magenta');
    if (bgMode === 'chroma-green') document.body.classList.add('bg-chroma-green');
    if (bgMode === 'chroma-magenta') document.body.classList.add('bg-chroma-magenta');

    if (currentTheme !== activeTheme || currentOrientation !== activeOrientation) {
      renderShell(activeTheme, activeOrientation);
    } else {
      applyTrackToDOM(track);
    }
  }

  // === IPC-BASED COMMUNICATION (replaces WebSocket + fetch) ===

  // Listen for live track updates from main process
  if (window.electronAPI) {
    window.electronAPI.onTrackUpdate((data) => {
      handleStateUpdate(data.track, data.artDataUrl);
    });

    // Listen for theme switch commands relayed from dashboard
    window.electronAPI.onSwitchTheme((data) => {
      if (currentTrack) {
        currentTrack.settings = currentTrack.settings || {};
        if (data.customCss !== undefined) {
          currentTrack.settings.customCss = data.customCss;
        }
        if (data.customThemes !== undefined) {
          currentTrack.settings.customThemes = data.customThemes;
        }
        if (data.customThemeId !== undefined) {
          currentTrack.settings.activeCustomThemeId = data.customThemeId;
        }
      }
      renderShell(data.theme, data.orientation || 'horizontal');
      if (currentTrack) applyTrackToDOM(currentTrack);
    });

    // Listen for settings updates relayed from dashboard
    window.electronAPI.onUpdateSettings((data) => {
      if (currentTrack) {
        currentTrack.settings = { ...currentTrack.settings, ...data.settings };
        applyTrackToDOM(currentTrack);
      }
    });

    // Get initial state on load
    window.electronAPI.getInitialState().then((data) => {
      if (data && data.track) {
        handleStateUpdate(data.track, data.artDataUrl);
      }
    }).catch(() => {});
  }

  // Initial render
  renderShell('vinyl', 'horizontal');
})();
