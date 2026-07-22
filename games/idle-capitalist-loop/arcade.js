(function () {
  'use strict';

  // Static-host stub: replaces VS Code webview acquireVsCodeApi + postMessage
  // persistence with namespaced localStorage (ftol:idlecapitalistloop:storage).
  function acquireVsCodeApi() {
    const KEY = 'ftol:idlecapitalistloop:storage';
    function load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return { highScores: {}, settings: {} };
        const parsed = JSON.parse(raw);
        return {
          highScores: parsed.highScores || {},
          settings: parsed.settings || {},
        };
      } catch (e) {
        return { highScores: {}, settings: {} };
      }
    }
    function save(storage) {
      try { localStorage.setItem(KEY, JSON.stringify(storage)); } catch (e) {}
    }
    return {
      postMessage(msg) {
        if (!msg || typeof msg !== 'object') return;
        const storage = load();
        if (msg.type === 'submitScore') {
          const key = msg.key;
          const score = msg.score;
          if (!storage.highScores[key] || score > storage.highScores[key]) {
            storage.highScores[key] = score;
            save(storage);
            window.postMessage({ type: 'storage', storage }, '*');
          }
        } else if (msg.type === 'saveSettings') {
          storage.settings[msg.game] = msg.settings;
          save(storage);
          window.postMessage({ type: 'storage', storage }, '*');
        } else if (msg.type === 'resetHighScores') {
          storage.highScores = {};
          save(storage);
          window.postMessage({ type: 'storage', storage }, '*');
        } else if (msg.type === 'toast') {
          // no-op in static iframe
        }
      },
    };
  }

  const vscode = acquireVsCodeApi();
  const R = (window.CursorArcade = window.CursorArcade || {});
  R.games = R.games || {};

  const GAME_ORDER = ['capitalist'];
  const GAME_META = {
    snake: {
      id: 'snake',
      name: 'Snake',
      tagline: 'Eat, grow, don\'t bite yourself.',
      hsKey: 'snake:classic',
    },
    twenty48: {
      id: 'twenty48',
      name: '2048',
      tagline: 'Slide, merge, chase the 2048 tile.',
      hsKey: 'twenty48',
    },
    blocks: {
      id: 'blocks',
      name: 'Blocks',
      tagline: 'Stack tetrominoes, clear lines, feel time dilate.',
      hsKey: 'blocks',
    },
    sweeper: {
      id: 'sweeper',
      name: 'Minefield',
      tagline: 'Clear the grid. Flag the mines. Beat your best score.',
      hsKey: 'sweeper:medium',
    },
    pong: {
      id: 'pong',
      name: 'Paddle Duel',
      tagline: 'Two paddles, one ball. 1P vs CPU or hotseat 2P.',
      hsKey: 'pong',
    },
    tictactoe: {
      id: 'tictactoe',
      name: 'Tic-Tac-Toe',
      tagline: 'Three in a row. Hard mode is solved — try anyway.',
      hsKey: 'tictactoe:wins:hard',
    },
    soccer: {
      id: 'soccer',
      name: 'Head Soccer',
      tagline: 'Two heads. One ball. Power-ups. Hotseat or CPU.',
      hsKey: 'soccer:goals-1p',
    },
    capitalist: {
      id: 'capitalist',
      name: 'Capitalist',
      tagline: 'Build an empire from a lemonade stand to Mars.',
      hsKey: 'capitalist',
    },
  };

  const state = {
    view: 'menu',
    currentGame: null,
    storage: { highScores: {}, settings: {} },
    pending: null,
    theme: 'light',
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    stats: $('stats'),
    menu: $('menu'),
    stage: $('stage'),
    host: $('gameHost'),
    grid: $('gameGrid'),
    overlay: $('overlay'),
    overlayTitle: $('overlayTitle'),
    overlaySub: $('overlaySub'),
    overlayPrimary: $('overlayPrimary'),
    overlaySecondary: $('overlaySecondary'),
    btnMenu: $('btnMenu'),
    btnPause: $('btnPause'),
    btnRestart: $('btnRestart'),
    btnSettings: $('btnSettings'),
    btnCloseSettings: $('btnCloseSettings'),
    btnResetHS: $('btnResetHS'),
    settings: $('settings'),
    settingsBody: $('settingsBody'),
  };

  // ------- Public API exposed to game modules -------

  R.api = {
    submitScore(key, score) {
      vscode.postMessage({ type: 'submitScore', key, score });
    },
    saveSettings(game, settings) {
      vscode.postMessage({ type: 'saveSettings', game, settings });
    },
    toast(message) {
      vscode.postMessage({ type: 'toast', message });
    },
    getHighScore(key) {
      return state.storage.highScores[key] || 0;
    },
    getSettings(game) {
      return state.storage.settings[game] || null;
    },
    setStats(obj) {
      renderStats(obj || {});
    },
    setTopbarControls(opts) {
      opts = opts || {};
      els.btnPause.classList.toggle('hidden', !opts.pause);
      els.btnRestart.classList.toggle('hidden', !opts.restart);
    },
    showOverlay(opts) {
      opts = opts || {};
      els.overlayTitle.textContent = opts.title || '';
      els.overlaySub.textContent = opts.subtitle || '';
      els.overlayPrimary.textContent = opts.primaryLabel || 'Continue';
      els.overlaySecondary.textContent = opts.secondaryLabel || 'Back to menu';
      els.overlayPrimary.onclick = () => {
        hideOverlay();
        opts.onPrimary && opts.onPrimary();
      };
      els.overlaySecondary.onclick = () => {
        hideOverlay();
        opts.onSecondary ? opts.onSecondary() : navigate('menu');
      };
      els.overlay.classList.remove('hidden');
    },
    hideOverlay,
    setTheme(t) {
      state.theme = t === 'dark' ? 'dark' : 'light';
      document.documentElement.dataset.theme = state.theme;
    },
    getTheme() {
      return state.theme;
    },
  };

  function renderStats(obj) {
    els.stats.innerHTML = '';
    const entries = Object.entries(obj);
    if (!entries.length) return;
    for (const [k, v] of entries) {
      const s = document.createElement('span');
      s.className = 'stat';
      s.innerHTML = `${escapeHtml(k)}<b>${escapeHtml(String(v))}</b>`;
      els.stats.appendChild(s);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  }

  function hideOverlay() {
    els.overlay.classList.add('hidden');
  }

  // ------- View switching -------

  function renderMenu() {
    els.grid.innerHTML = '';
    GAME_ORDER.forEach((id, i) => {
      const meta = GAME_META[id];
      const card = document.createElement('button');
      card.className = 'game-card';
      card.setAttribute('role', 'listitem');
      card.setAttribute('data-game', id);
      const hs = state.storage.highScores[meta.hsKey] || 0;
      card.innerHTML = `
        <div class="glyph">${glyphFor(id)}</div>
        <span class="num">${i + 1}</span>
        <h3>${escapeHtml(meta.name)}</h3>
        <p>${escapeHtml(meta.tagline)}</p>
        <div class="hs">Best <b>${hs.toLocaleString()}</b></div>
      `;
      card.addEventListener('click', () => navigate(id));
      els.grid.appendChild(card);
    });
  }

  function glyphFor(id) {
    const s = 'stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"';
    switch (id) {
      case 'snake':
        return `<svg width="48" height="48" viewBox="0 0 48 48" ${s}>
          <path d="M8 14h10a4 4 0 0 1 4 4v4a4 4 0 0 0 4 4h10a4 4 0 0 1 4 4v4" />
          <circle cx="38" cy="34" r="2" fill="currentColor" stroke="none" />
        </svg>`;
      case 'twenty48':
        return `<svg width="48" height="48" viewBox="0 0 48 48" ${s}>
          <rect x="6" y="6" width="16" height="16" rx="2" />
          <rect x="26" y="6" width="16" height="16" rx="2" fill="currentColor" />
          <rect x="6" y="26" width="16" height="16" rx="2" fill="currentColor" />
          <rect x="26" y="26" width="16" height="16" rx="2" />
        </svg>`;
      case 'blocks':
        return `<svg width="48" height="48" viewBox="0 0 48 48" ${s}>
          <rect x="6" y="6" width="10" height="10" />
          <rect x="16" y="6" width="10" height="10" fill="currentColor" />
          <rect x="16" y="16" width="10" height="10" />
          <rect x="16" y="26" width="10" height="10" fill="currentColor" />
          <rect x="26" y="26" width="10" height="10" />
        </svg>`;
      case 'sweeper':
        return `<svg width="48" height="48" viewBox="0 0 48 48" ${s}>
          <rect x="6" y="6" width="12" height="12" rx="1" />
          <rect x="18" y="6" width="12" height="12" rx="1" />
          <rect x="30" y="6" width="12" height="12" rx="1" fill="currentColor" />
          <rect x="6" y="18" width="12" height="12" rx="1" fill="currentColor" />
          <rect x="18" y="18" width="12" height="12" rx="1" />
          <rect x="30" y="18" width="12" height="12" rx="1" />
          <rect x="6" y="30" width="12" height="12" rx="1" />
          <rect x="18" y="30" width="12" height="12" rx="1" fill="currentColor" />
          <rect x="30" y="30" width="12" height="12" rx="1" />
        </svg>`;
      case 'pong':
        return `<svg width="48" height="48" viewBox="0 0 48 48" ${s}>
          <rect x="6" y="16" width="4" height="16" fill="currentColor" stroke="none" />
          <rect x="38" y="16" width="4" height="16" fill="currentColor" stroke="none" />
          <circle cx="24" cy="24" r="2.5" fill="currentColor" stroke="none" />
          <path d="M24 8 L24 40" stroke-dasharray="3 3" />
        </svg>`;
      case 'tictactoe':
        return `<svg width="48" height="48" viewBox="0 0 48 48" ${s}>
          <path d="M18 8 L18 40 M30 8 L30 40 M8 18 L40 18 M8 30 L40 30" />
          <path d="M11 11 L15 15 M15 11 L11 15" />
          <circle cx="24" cy="24" r="3.5" />
          <path d="M33 33 L37 37 M37 33 L33 37" />
        </svg>`;
      case 'soccer':
        return `<svg width="48" height="48" viewBox="0 0 48 48" ${s}>
          <circle cx="24" cy="24" r="12" fill="currentColor" />
          <path d="M24 16 L30 20 L28 27 L20 27 L18 20 Z" stroke="#fff" fill="none" stroke-width="1.2" />
          <path d="M6 38 L42 38" />
          <path d="M8 38 L8 28 L14 28 L14 38" />
          <path d="M40 38 L40 28 L34 28 L34 38" />
        </svg>`;
      case 'capitalist':
        return `<svg width="48" height="48" viewBox="0 0 48 48" ${s}>
          <path d="M8 40 L8 18 M16 40 L16 12 M24 40 L24 22 M32 40 L32 8 M40 40 L40 16" />
          <path d="M6 40 L42 40" />
          <circle cx="34" cy="12" r="3" fill="currentColor" stroke="none" />
        </svg>`;
    }
    return '';
  }

  function navigate(target, opts) {
    opts = opts || {};
    // Tear down current
    if (state.currentGame && state.currentGame.destroy) {
      try {
        state.currentGame.destroy();
      } catch (_) {}
    }
    state.currentGame = null;
    hideOverlay();
    closeSettings();
    els.host.innerHTML = '';
    renderStats({});
    R.api.setTopbarControls({});

    if (target === 'menu') {
      state.view = 'menu';
      els.menu.classList.remove('hidden');
      els.stage.classList.add('hidden');
      renderMenu();
      return;
    }

    const meta = GAME_META[target];
    const module = R.games[target];
    if (!meta || !module) {
      console.warn('Unknown game:', target);
      return navigate('menu');
    }

    state.view = 'game';
    state.currentGame = module.create({
      host: els.host,
      api: R.api,
      meta,
      options: opts,
    });

    els.menu.classList.add('hidden');
    els.stage.classList.remove('hidden');
  }

  // ------- Settings drawer -------

  function openSettings() {
    buildSettings();
    els.settings.classList.remove('hidden');
    els.settings.setAttribute('aria-hidden', 'false');
  }

  function closeSettings() {
    els.settings.classList.add('hidden');
    els.settings.setAttribute('aria-hidden', 'true');
  }

  function buildSettings() {
    const body = els.settingsBody;
    body.innerHTML = '';

    // Global: theme toggle
    const themeField = document.createElement('div');
    themeField.className = 'toggle';
    themeField.innerHTML = `<label>Dark theme</label>`;
    const themeInput = document.createElement('input');
    themeInput.type = 'checkbox';
    themeInput.checked = state.theme === 'dark';
    themeInput.addEventListener('change', () => {
      R.api.setTheme(themeInput.checked ? 'dark' : 'light');
      R.api.saveSettings('global', { theme: state.theme });
    });
    themeField.appendChild(themeInput);
    body.appendChild(themeField);

    // Game-specific settings, if game exposes buildSettings
    if (state.currentGame && typeof state.currentGame.buildSettings === 'function') {
      const sep = document.createElement('div');
      sep.style.borderTop = '1px solid var(--line)';
      sep.style.margin = '6px 0';
      body.appendChild(sep);
      state.currentGame.buildSettings(body);
    }
  }

  // ------- Global UI wiring -------

  els.btnMenu.addEventListener('click', () => navigate('menu'));
  els.btnPause.addEventListener('click', () => {
    if (state.currentGame && state.currentGame.togglePause) state.currentGame.togglePause();
  });
  els.btnRestart.addEventListener('click', () => {
    if (state.currentGame && state.currentGame.restart) state.currentGame.restart();
  });
  els.btnSettings.addEventListener('click', () => {
    if (els.settings.classList.contains('hidden')) openSettings();
    else closeSettings();
  });
  els.btnCloseSettings.addEventListener('click', closeSettings);
  els.btnResetHS.addEventListener('click', () => {
    vscode.postMessage({ type: 'resetHighScores' });
  });

  // ------- Keyboard dispatch -------

  document.addEventListener(
    'keydown',
    (e) => {
      // Global keys
      if (e.key === 'Escape') {
        if (!els.settings.classList.contains('hidden')) {
          closeSettings();
          e.preventDefault();
          return;
        }
        if (!els.overlay.classList.contains('hidden')) {
          hideOverlay();
          e.preventDefault();
          return;
        }
        if (state.view === 'game') {
          navigate('menu');
          e.preventDefault();
          return;
        }
      }

      if (state.view === 'menu') {
        const idx = parseInt(e.key, 10);
        if (idx >= 1 && idx <= GAME_ORDER.length) {
          navigate(GAME_ORDER[idx - 1]);
          e.preventDefault();
          return;
        }
      }

      if (state.view === 'game' && state.currentGame && state.currentGame.onKey) {
        state.currentGame.onKey(e);
      }
    },
    { capture: true },
  );

  // Bubble click/contextmenu for minesweeper etc.
  document.addEventListener('contextmenu', (e) => {
    if (state.view === 'game' && state.currentGame && state.currentGame.onContextMenu) {
      state.currentGame.onContextMenu(e);
    }
  });

  // ------- Extension messages -------

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'hydrate': {
        state.storage = msg.storage || { highScores: {}, settings: {} };
        const g = state.storage.settings && state.storage.settings.global;
        if (g && g.theme) R.api.setTheme(g.theme);
        if (msg.nav && msg.nav.game) {
          navigate(msg.nav.game, { daily: !!msg.nav.daily });
        } else {
          navigate('menu');
        }
        break;
      }
      case 'storage': {
        state.storage = msg.storage || state.storage;
        if (state.view === 'menu') renderMenu();
        if (state.currentGame && state.currentGame.onStorage) {
          state.currentGame.onStorage(state.storage);
        }
        break;
      }
      case 'navigate': {
        navigate(msg.game, { daily: !!msg.daily });
        break;
      }
    }
  });

  // Static boot: hydrate from localStorage, then open head soccer.
  (function boot() {
    try {
      const raw = localStorage.getItem('ftol:idlecapitalistloop:storage');
      if (raw) {
        const parsed = JSON.parse(raw);
        state.storage = {
          highScores: parsed.highScores || {},
          settings: parsed.settings || {},
        };
        const g = state.storage.settings && state.storage.settings.global;
        if (g && g.theme) R.api.setTheme(g.theme);
      }
    } catch (e) {}
    navigate('capitalist');
  })();
})();
