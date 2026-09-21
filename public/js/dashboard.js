document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const previewFrame = document.getElementById('preview-frame');
  const stageBox = document.getElementById('stage-box');
  const toast = document.getElementById('toast');
  const liveDot = document.getElementById('live-dot');
  const liveStatusText = document.getElementById('live-status-text');

  // Banner Elements
  const bannerCover = document.getElementById('banner-cover');
  const bannerTitle = document.getElementById('banner-title');
  const bannerArtist = document.getElementById('banner-artist');
  const bannerServiceBadge = document.getElementById('banner-service-badge');
  const bannerServiceName = document.getElementById('banner-service-name');

  // Layout Chip Buttons
  const layoutChips = document.querySelectorAll('.chip-btn');

  // Source Buttons
  const sourceItems = document.querySelectorAll('.source-pill[data-source]');

  // Action Buttons
  const btnLaunchHud = document.getElementById('btn-launch-hud');
  const btnNavDesktopHud = document.getElementById('btn-nav-desktop-hud');
  const floatBtnText = document.getElementById('float-btn-text');
  const btnCopyMaster = document.getElementById('btn-copy-master');
  const btnNavCopyObs = document.getElementById('btn-nav-copy-obs');
  const copyBtnText = document.getElementById('copy-btn-text');

  // Drawer Elements
  const settingsDrawer = document.getElementById('settings-drawer');
  const drawerTitle = document.getElementById('drawer-title');
  const btnCloseDrawer = document.getElementById('btn-close-drawer');
  const btnOpenSettings = document.getElementById('btn-open-settings');
  const btnOpenScript = document.getElementById('btn-open-script');
  const drawerSettingsContent = document.getElementById('drawer-settings-content');
  const drawerScriptContent = document.getElementById('drawer-script-content');

  // Form Controls
  const toggleFloat = document.getElementById('toggle-float');
  const toggleAutoHide = document.getElementById('toggle-autohide');
  const toggleProgress = document.getElementById('toggle-progress');
  const toggleWave = document.getElementById('toggle-wave');
  const bgChips = document.querySelectorAll('.bg-chip');
  const swatchCircles = document.querySelectorAll('.swatch-circle');
  const btnSaveDrawer = document.getElementById('btn-save-drawer');
  const customCssInput = document.getElementById('custom-css-input');
  const customThemeNameInput = document.getElementById('custom-theme-name');
  const customChipsContainer = document.getElementById('custom-chips-container');
  const btnDeployScript = document.getElementById('btn-deploy-script');
  const btnSaveScript = document.getElementById('btn-save-script');
  const btnClearScript = document.getElementById('btn-clear-script');

  // Traffic Light Controls
  const btnWinClose = document.getElementById('btn-win-close');
  const btnWinMin = document.getElementById('btn-win-min');
  const btnWinMax = document.getElementById('btn-win-max');

  // State
  let customThemes = [];
  let currentTheme = 'vinyl';
  let currentOrientation = 'horizontal';
  let currentAccent = '#1db954';
  let currentBgMode = 'transparent';
  let isFloating = false;
  let autoHideWhenPaused = false;
  const masterObsUrl = `${window.location.origin}/overlay`;

  function showToast(msg) {
    toast.textContent = msg;
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 2500);
  }

  function sendIpc(channel) {
    try {
      if (window.require) {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send(channel);
        return true;
      }
    } catch (e) {}
    return false;
  }

  // Traffic Light actions
  btnWinClose.addEventListener('click', () => {
    if (!sendIpc('window-close')) window.close();
  });
  btnWinMin.addEventListener('click', () => {
    sendIpc('window-minimize');
  });
  btnWinMax.addEventListener('click', () => {
    if (!sendIpc('window-maximize')) {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  });

  // Sync with iframe on load
  previewFrame.addEventListener('load', () => {
    if (previewFrame.contentWindow) {
      previewFrame.contentWindow.postMessage({
        type: 'switch_theme',
        theme: currentTheme,
        orientation: currentOrientation
      }, '*');
    }
  });

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Dynamic Custom Theme Chips in Tray
  function renderCustomThemeChips() {
    if (!customChipsContainer) return;
    customChipsContainer.innerHTML = '';

    customThemes.forEach((theme) => {
      const btn = document.createElement('button');
      btn.className = 'chip-btn';
      btn.setAttribute('data-theme', theme.id);
      btn.setAttribute('data-custom-theme', 'true');
      btn.title = theme.name;

      if (currentTheme === theme.id) {
        btn.classList.add('active');
      }

      btn.innerHTML = `
        <span>${escapeHtml(theme.name)}</span>
        <span class="chip-delete" title="Delete theme" data-id="${theme.id}">✕</span>
      `;

      btn.addEventListener('click', (ev) => {
        // If delete clicked
        if (ev.target.classList.contains('chip-delete')) {
          ev.stopPropagation();
          const toDeleteId = ev.target.getAttribute('data-id');
          customThemes = customThemes.filter((t) => t.id !== toDeleteId);

          let nextTheme = currentTheme;
          let nextCss = '';
          if (currentTheme === toDeleteId) {
            nextTheme = 'vinyl';
            currentTheme = 'vinyl';
            document.querySelectorAll('.chip-btn:not([data-custom-theme="true"])').forEach((c) => {
              c.classList.toggle('active', c.getAttribute('data-theme') === 'vinyl');
            });
            if (previewFrame && previewFrame.contentWindow) {
              previewFrame.contentWindow.postMessage({
                type: 'switch_theme',
                theme: 'vinyl',
                orientation: 'horizontal',
                customCss: ''
              }, '*');
            }
          }

          renderCustomThemeChips();

          fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customThemes: customThemes,
              activeTheme: nextTheme,
              customCss: nextCss
            })
          }).then(() => showToast(`Theme "${theme.name}" removed from tray`));
          return;
        }

        // Activate this custom theme
        document.querySelectorAll('.chip-btn').forEach((c) => c.classList.remove('active'));
        btn.classList.add('active');

        currentTheme = theme.id;
        currentOrientation = 'horizontal';

        // 0ms instant preview update
        if (previewFrame && previewFrame.contentWindow) {
          previewFrame.contentWindow.postMessage({
            type: 'switch_theme',
            theme: 'custom',
            customThemeId: theme.id,
            orientation: currentOrientation,
            customCss: theme.css,
            customThemes: customThemes
          }, '*');
        }

        // Save active theme to settings
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activeTheme: theme.id,
            activeCustomThemeId: theme.id,
            customCss: theme.css
          })
        }).then(() => showToast(`✨ "${theme.name}" layout active`));
      });

      customChipsContainer.appendChild(btn);
    });
  }

  // Theme Switching for Built-In Chips
  function setupLayoutChips() {
    const staticChips = document.querySelectorAll('.chip-btn:not([data-custom-theme="true"])');
    staticChips.forEach((chip) => {
      chip.onclick = () => {
        document.querySelectorAll('.chip-btn').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');

        currentTheme = chip.getAttribute('data-theme');
        currentOrientation = chip.getAttribute('data-orientation') || 'horizontal';

        // 0ms instant preview update
        if (previewFrame && previewFrame.contentWindow) {
          previewFrame.contentWindow.postMessage({
            type: 'switch_theme',
            theme: currentTheme,
            orientation: currentOrientation,
            customCss: ''
          }, '*');
        }

        // Broadcast to OBS & Desktop HUD
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activeTheme: currentTheme,
            orientation: currentOrientation
          })
        }).then(() => showToast(`${currentTheme.toUpperCase()} layout active`));
      };
    });
  }
  setupLayoutChips();

  // Source Selection
  sourceItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      sourceItems.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const src = btn.getAttribute('data-source');
      showToast(src === 'auto' ? 'Auto-Detecting all audio sources' : `Filter set to ${src.toUpperCase()}`);
    });
  });

  // Float on Desktop Toggle (Always on Top)
  function toggleFloatOnDesktop() {
    isFloating = !isFloating;
    updateFloatUi();
    if (!sendIpc('launch-desktop-hud', { float: isFloating })) {
      fetch('/api/hud/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ float: isFloating })
      }).catch(() => {});
    }
    showToast(isFloating ? 'Float on Desktop active' : 'Desktop overlay hidden');
  }

  function updateFloatUi() {
    if (toggleFloat) toggleFloat.checked = isFloating;
    if (btnLaunchHud) {
      btnLaunchHud.classList.toggle('active', isFloating);
    }
    if (floatBtnText) {
      floatBtnText.textContent = isFloating ? 'Floating (On)' : 'Float on Desktop';
    }
  }

  if (btnLaunchHud) btnLaunchHud.addEventListener('click', toggleFloatOnDesktop);
  if (btnNavDesktopHud) btnNavDesktopHud.addEventListener('click', toggleFloatOnDesktop);

  if (toggleFloat) {
    toggleFloat.addEventListener('change', () => {
      isFloating = toggleFloat.checked;
      updateFloatUi();
      sendIpc('set-hud-float', isFloating);
      fetch('/api/hud/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ float: isFloating })
      }).catch(() => {});
    });
  }

  // Copy Master Link (Advanced / Optional)
  function copyObsLink() {
    navigator.clipboard.writeText(masterObsUrl).then(() => {
      copyBtnText.textContent = 'Copied Link!';
      btnCopyMaster.style.background = '#34c759';
      btnCopyMaster.style.color = '#fff';
      showToast('Link copied — paste into OBS Browser Source');
      setTimeout(() => {
        copyBtnText.textContent = 'Copy Link';
        btnCopyMaster.style.background = '';
        btnCopyMaster.style.color = '';
      }, 2000);
    });
  }

  btnCopyMaster.addEventListener('click', copyObsLink);
  btnNavCopyObs.addEventListener('click', copyObsLink);

  // Drawer Handlers
  function openDrawer(type) {
    settingsDrawer.classList.add('open');
    if (type === 'script') {
      drawerTitle.textContent = 'AI Style Injector';
      drawerSettingsContent.style.display = 'none';
      drawerScriptContent.style.display = 'flex';
    } else {
      drawerTitle.textContent = 'Widget Settings';
      drawerSettingsContent.style.display = 'block';
      drawerScriptContent.style.display = 'none';
    }
  }

  function closeDrawer() {
    settingsDrawer.classList.remove('open');
  }

  btnOpenSettings.addEventListener('click', () => openDrawer('settings'));
  btnOpenScript.addEventListener('click', () => openDrawer('script'));
  btnCloseDrawer.addEventListener('click', closeDrawer);

  // Background Mode Chips
  bgChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      bgChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      currentBgMode = chip.getAttribute('data-bg');
    });
  });

  // Swatches
  swatchCircles.forEach((sw) => {
    sw.addEventListener('click', () => {
      swatchCircles.forEach((s) => s.classList.remove('active'));
      sw.classList.add('active');
      currentAccent = sw.getAttribute('data-color');
    });
  });

  // Save Settings from Drawer
  btnSaveDrawer.addEventListener('click', () => {
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        floatOnDesktop: isFloating,
        autoHideWhenPaused: toggleAutoHide.checked,
        showProgressBar: toggleProgress.checked,
        showVisualizer: toggleWave.checked,
        backgroundMode: currentBgMode,
        accentColor: currentAccent
      })
    }).then(() => {
      showToast('Settings applied to OBS Capture and Desktop HUD');
      closeDrawer();
    });
  });

  // CSS Sanitizer: Automatically strips markdown backticks if user copies from ChatGPT/Claude
  function sanitizeCss(raw) {
    if (!raw) return '';
    let css = raw.trim();
    // Strip leading ```css or ```
    css = css.replace(/^```(?:css)?\s*\n?/i, '');
    // Strip trailing ```
    css = css.replace(/\n?```\s*$/i, '');
    return css.trim();
  }

  // AI Context Template definition for LLMs
  const AI_CONTEXT_TEMPLATE = `[SYSTEM DIRECTIVE: OBS OVERLAY CSS COMPILER ENGINE]
You are an automated CSS generator for TMO (Track Music Overlay), a transparent live stream overlay for OBS Studio and desktop HUD widgets.
Your objective: Take the user's style request (even if it is just a single short line like "make me a flowing river-like style") and produce a COMPLETE, PROPORTIONALLY BALANCED, STREAM-READY CSS THEME.

=== CRITICAL OUTPUT FORMAT RULE (NON-NEGOTIABLE) ===
1. Return ONLY pure, raw CSS inside a single \`\`\`css code block.
2. DO NOT write ANY conversational intro, greeting ("Sure, here is..."), explanation, breakdown, or outro text.
3. The user will click "Copy" directly on your code block and paste it into the software. ANY text outside the code block will break the user experience.

=== STRICT CONSTRAINTS & LIMITATIONS (WHAT YOU CANNOT DO) ===
1. NO SOLID VIEWPORT BACKGROUND: <html> and <body> MUST remain 100% transparent (background: transparent !important;). Do not apply background colors or full-screen overlays to body or html.
2. NO HTML OR JAVASCRIPT: You can only output CSS. You cannot add, delete, or modify DOM elements.
3. NO LOCAL FILE PATHS: Do NOT reference local files (C:\\... or file:///). Use pure CSS gradients, SVG data URIs, or public HTTPS URLs.
4. DO NOT SET WIDTH ON #progress-fill: The width percentage (0% to 100%) is continuously calculated in real-time by JavaScript. NEVER write "width: ... !important" on #progress-fill (you may style height, color, border-radius, background gradients, glow, etc.).
5. DO NOT HARDCODE SONG TEXT: Track titles and artists are dynamically rendered live streams. Do NOT use CSS content: "Song Title".
6. DO NOT TARGET BUILT-IN THEMES: Do NOT write selectors for .theme-vinyl, .theme-cassette, or .theme-pill. All rules MUST be scoped strictly to #theme-root.theme-custom or #theme-root.
7. DO NOT BREAK AUTO-HIDE: When paused with auto-hide enabled, #theme-root receives .overlay-hidden { opacity: 0; }. Do NOT write "!important" rules forcing opacity: 1 on .overlay-hidden.

=== COMPLETE PROPORTIONAL BLUEPRINT (YOU MUST STYLE ALL OF THESE) ===
To make the widget look stunning from a simple one-line request, you MUST proportionally style the entire element hierarchy:

1. ROOT CONTAINER (#theme-root.theme-custom):
   - Dimensions & Layout: width: 520px; display: flex; align-items: center; gap: 18px; padding: 18px 22px; box-sizing: border-box;
   - Aesthetics: Thematic background (smooth gradients, subtle animated flow, or frosted glass with backdrop-filter: blur(24px)), border (1px to 2px solid matching the palette), border-radius (e.g. 24px, or thematic fluid curves), box-shadow with colored ambient glow.
   - Thematic Animations: Keyframes (e.g. subtle float drift, shimmering flowing gradient background, gentle pulse).

2. ALBUM ARTWORK CONTAINER & IMAGE (.card-art and #track-art):
   - .card-art: width: 84px; height: 84px; border-radius: 16px; overflow: hidden; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.15); box-shadow: 0 10px 24px rgba(0,0,0,0.6);
   - #track-art: width: 100%; height: 100%; object-fit: cover; display: block;
   - (Optional) CSS Variable: The live album art is also available via var(--track-art-url) if you wish to use it as a background image.

3. CONTENT COLUMN (.card-content):
   - flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px;

4. TITLE & ARTIST (#track-title and #track-artist):
   - #track-title: font-size: 1.15rem; font-weight: 700; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 2px 10px rgba(0,0,0,0.8);
   - #track-artist: font-size: 0.85rem; font-weight: 500; color: var(--text-secondary, rgba(255,255,255,0.7)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;

5. TIMELINE PROGRESS BAR (.progress-container and #progress-fill):
   - .progress-container: width: 100%; height: 5px; background: rgba(255, 255, 255, 0.12); border-radius: 99px; overflow: hidden; margin-top: 6px;
   - #progress-fill: background: [Thematic gradient matching style]; border-radius: 99px; box-shadow: 0 0 10px [accent-glow]; transition: width 0.3s linear; (REMEMBER: Do NOT set width!).

6. METADATA ROW (.card-meta-row, #platform-badge, #live-pill, #timecode):
   - .card-meta-row: display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: 6px;
   - #platform-badge: padding: 3px 8px; border-radius: 6px; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #fff;
   - #live-pill: display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 6px; background: rgba(0,0,0,0.6); font-size: 0.65rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; border: 1px solid rgba(255,255,255,0.1);
   - #live-pill.active .dot: background: [Thematic accent color]; box-shadow: 0 0 8px [Thematic accent color];
   - #timecode: font-family: 'JetBrains Mono', monospace, sans-serif; font-size: 0.72rem; color: rgba(255,255,255,0.5);

7. AUDIO WAVE VISUALIZER (.wave-container and #wave-canvas):
   - .wave-container: width: 100%; height: 26px; margin-top: 2px;
   - #wave-canvas: width: 100%; height: 100%; display: block; filter: drop-shadow(0 0 6px [thematic glow color]);

8. THEMATIC FLUID ANIMATIONS (@keyframes):
   - Include 1 or 2 elegant keyframe animations tailored to the user's prompt (e.g. for water/flowing: animated shifting linear-gradients \`background-size: 200% 200%; animation: riverFlow 6s ease infinite;\`, subtle floating bobbing, or ethereal pulsing glow).

=== HOW TO TRANSLATE ANY SHORT USER PROMPT ===
When the user gives a short phrase (e.g. "make me a flowing river-like style", "cyberpunk neon grid", "cozy coffee lo-fi", "liquid mercury"):
- Synthesize a rich palette of 3-4 cohesive colors matching the mood (e.g. for river: deep aquatic navy #061826, bioluminescent cyan #00e5ff, river foam teal #00b4d8, mist translucent white).
- Craft the atmospheric background and keyframe animation specifically expressing that concept.
- Style every selector above with harmonious colors, fonts, and shadows so the widget looks completely custom and finished.

============================================================
USER STYLE / THEME REQUEST:
(Type your style below, e.g. "make me a flowing river-like style")
============================================================
`;

  const btnCopyAiPrompt = document.getElementById('btn-copy-ai-prompt');
  const copyPromptText = document.getElementById('copy-prompt-text');
  const chipCustomTheme = document.getElementById('chip-custom-theme');

  if (btnCopyAiPrompt) {
    btnCopyAiPrompt.addEventListener('click', () => {
      navigator.clipboard.writeText(AI_CONTEXT_TEMPLATE).then(() => {
        if (copyPromptText) copyPromptText.textContent = 'Copied Template!';
        btnCopyAiPrompt.style.background = '#34c759';
        btnCopyAiPrompt.style.color = '#fff';
        showToast('AI Context Template copied — paste into ChatGPT/Claude before your prompt');
        setTimeout(() => {
          if (copyPromptText) copyPromptText.textContent = 'Copy Context Prompt';
          btnCopyAiPrompt.style.background = '';
          btnCopyAiPrompt.style.color = '';
        }, 2000);
      });
    });
  }

  // Deploy AI Script and immediately activate
  if (btnDeployScript) {
    btnDeployScript.addEventListener('click', () => {
      const cssCode = sanitizeCss(customCssInput.value);
      if (!cssCode) {
        showToast('Please paste some CSS code first');
        return;
      }

      const styleName = (customThemeNameInput ? customThemeNameInput.value.trim() : '') ||
                        `Custom Theme ${customThemes.length + 1}`;
      const newThemeId = `custom-${Date.now()}`;
      const newTheme = {
        id: newThemeId,
        name: styleName,
        css: cssCode
      };

      customThemes.push(newTheme);
      currentTheme = newThemeId;

      // Clear the generator inputs so user can create another one immediately!
      if (customThemeNameInput) customThemeNameInput.value = '';
      customCssInput.value = '';

      document.querySelectorAll('.chip-btn').forEach((c) => c.classList.remove('active'));
      renderCustomThemeChips();

      // Broadcast instant 0ms preview update
      if (previewFrame && previewFrame.contentWindow) {
        previewFrame.contentWindow.postMessage({
          type: 'switch_theme',
          theme: 'custom',
          customThemeId: newThemeId,
          orientation: currentOrientation,
          customCss: cssCode,
          customThemes: customThemes
        }, '*');
      }

      // Save to settings
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customThemes: customThemes,
          activeTheme: newThemeId,
          activeCustomThemeId: newThemeId,
          customCss: cssCode
        })
      }).then(() => {
        showToast(`✨ "${styleName}" added to tray & activated!`);
        closeDrawer();
      });
    });
  }

  // Save AI Script as standalone layout without activating
  if (btnSaveScript) {
    btnSaveScript.addEventListener('click', () => {
      const cssCode = sanitizeCss(customCssInput.value);
      if (!cssCode) {
        showToast('Please paste some CSS code first');
        return;
      }

      const styleName = (customThemeNameInput ? customThemeNameInput.value.trim() : '') ||
                        `Custom Theme ${customThemes.length + 1}`;
      const newThemeId = `custom-${Date.now()}`;
      const newTheme = {
        id: newThemeId,
        name: styleName,
        css: cssCode
      };

      customThemes.push(newTheme);

      // Clear the generator inputs so user can create another one immediately!
      if (customThemeNameInput) customThemeNameInput.value = '';
      customCssInput.value = '';

      renderCustomThemeChips();

      // Save customThemes to settings without overriding current activeTheme
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customThemes: customThemes
        })
      }).then(() => {
        showToast(`💾 "${styleName}" saved to tray!`);
        closeDrawer();
      });
    });
  }

  // Clear Custom CSS inputs
  if (btnClearScript) {
    btnClearScript.addEventListener('click', () => {
      customCssInput.value = '';
      if (customThemeNameInput) customThemeNameInput.value = '';
      showToast('Cleared theme inputs');
    });
  }

  // Poll Playback State
  function pollState() {
    fetch('/api/state')
      .then((r) => r.json())
      .then((data) => {
        const track = data.track || {};
        if (track.title) {
          bannerTitle.textContent = track.title;
          bannerArtist.textContent = track.artist || 'Unknown Artist';
          bannerServiceName.textContent = (track.platformName || 'AUDIO').toUpperCase();
          if (track.artUrl) {
            bannerCover.src = track.artUrl;
          } else if (track.hasArt) {
            bannerCover.src = `/api/current-art?t=${Date.now()}`;
          }

          const isPlaying = Boolean(track.isPlaying);
          liveStatusText.textContent = `${(track.platformName || 'MUSIC').toUpperCase()} — ${isPlaying ? 'PLAYING' : 'PAUSED'}`;
          liveDot.style.background = isPlaying ? (track.brandColor || '#34c759') : '#f59e0b';
        } else {
          liveStatusText.textContent = 'LISTENING FOR AUDIO';
          liveDot.style.background = '#71717a';
        }
      })
      .catch(() => {});
  }

  // Load initial settings
  fetch('/api/settings')
    .then((r) => r.json())
    .then((data) => {
      const s = data.settings || {};
      if (s.customThemes && Array.isArray(s.customThemes) && s.customThemes.length > 0) {
        customThemes = s.customThemes;
      } else if (s.customCss && s.customCss.trim().length > 0) {
        customThemes = [{ id: 'custom-1', name: 'Custom Theme', css: s.customCss }];
      }
      renderCustomThemeChips();

      if (s.activeTheme) {
        currentTheme = s.activeTheme;
        currentOrientation = s.orientation || 'horizontal';
        document.querySelectorAll('.chip-btn').forEach((chip) => {
          const mTheme = chip.getAttribute('data-theme') === currentTheme;
          const mOrient = !chip.getAttribute('data-orientation') || chip.getAttribute('data-orientation') === currentOrientation;
          chip.classList.toggle('active', mTheme && mOrient);
        });
      }
      if (s.floatOnDesktop !== undefined) {
        isFloating = Boolean(s.floatOnDesktop);
        updateFloatUi();
      }
      if (s.backgroundMode) {
        currentBgMode = s.backgroundMode;
        bgChips.forEach((c) => {
          c.classList.toggle('active', c.getAttribute('data-bg') === currentBgMode);
        });
      }
      if (s.autoHideWhenPaused !== undefined) {
        toggleAutoHide.checked = Boolean(s.autoHideWhenPaused);
      }
      if (s.showProgressBar !== undefined) {
        toggleProgress.checked = Boolean(s.showProgressBar);
      }
      if (s.showVisualizer !== undefined) {
        toggleWave.checked = Boolean(s.showVisualizer);
      }
    });

  setInterval(pollState, 1200);
});
