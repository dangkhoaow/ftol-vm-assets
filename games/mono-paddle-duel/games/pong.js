/* =========================================================================
   Mono Paddle Duel — Pong extract
   Classic 1972 Pong, monochrome. 1P vs CPU or hotseat 2P.

   Physics:
   - Ball reflects off top/bottom walls.
   - Paddle deflection angle depends on where the ball hits the paddle
     (centre = straight, edge = ~60° off-axis). Speed is preserved and
     ramped up by a small factor per paddle hit to keep rallies escalating.
   - CPU paddle uses predictive tracking with a reaction delay based on
     difficulty, and slight error jitter so it's beatable.

   Controls:
   - 1P:  W/S or Up/Down move right paddle. CPU plays left.
          (Or: left paddle, flipped — user picks their side in settings.)
   - 2P:  P1 = W/S  (left), P2 = Up/Down (right).
   - Space pauses, R restarts.
   ========================================================================= */

(function () {
  'use strict';

  const R = (window.CursorArcade = window.CursorArcade || {});
  R.games = R.games || {};

  // ---------- constants ----------
  const W = 800;
  const H = 500;
  const PADDLE_W = 10;
  const PADDLE_H = 80;
  const PADDLE_MARGIN = 24;
  const PADDLE_SPEED = 520;   // px / sec
  const BALL_R = 7;
  const BALL_START_SPEED = 380;
  const BALL_MAX_SPEED = 900;
  const BALL_SPEEDUP = 1.045;  // per paddle hit
  const MAX_BOUNCE_ANGLE = (Math.PI / 180) * 55; // 55° off horizontal
  const SERVE_DELAY_MS = 650;

  const DIFFICULTY = {
    easy:   { react: 0.28, jitter: 34, maxSpeedMul: 0.78, label: 'Easy' },
    normal: { react: 0.14, jitter: 18, maxSpeedMul: 0.93, label: 'Normal' },
    hard:   { react: 0.06, jitter: 8,  maxSpeedMul: 1.02, label: 'Hard' },
    insane: { react: 0.02, jitter: 2,  maxSpeedMul: 1.10, label: 'Insane' },
  };

  R.games.pong = {
    create(c) { return new PongGame(c); },
  };

  class PongGame {
    constructor({ host, api, meta }) {
      this.api = api;
      this.meta = meta;
      this.host = host;

      const saved = api.getSettings('pong') || {};
      this.mode = saved.mode === '2p' ? '2p' : '1p';
      this.difficulty = DIFFICULTY[saved.difficulty] ? saved.difficulty : 'normal';
      this.target = saved.target || 11;
      this.playerSide = saved.playerSide === 'left' ? 'left' : 'right';

      this.canvas = document.createElement('canvas');
      this.canvas.width = W;
      this.canvas.height = H;
      this.canvas.style.border = '1px solid var(--line-strong)';
      this.canvas.style.borderRadius = '4px';
      this.canvas.style.maxWidth = '100%';
      this.canvas.style.height = 'auto';
      this.canvas.tabIndex = 0;
      host.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');

      this.keys = new Set();
      this._onKeyDown = (e) => this.keys.add(e.key);
      this._onKeyUp = (e) => this.keys.delete(e.key);
      window.addEventListener('keyup', this._onKeyUp);
      // keydown is dispatched through arcade.js onKey already, but we also
      // want to capture raw held-down state for continuous paddle motion.
      window.addEventListener('keydown', this._onKeyDown);

      api.setTopbarControls({ pause: true, restart: true });

      this.rafId = null;
      this.last = 0;
      this.paused = false;
      this.state = 'serve'; // 'serve' | 'playing' | 'gameover'
      this.serveAt = 0;
      this.lastScorer = Math.random() < 0.5 ? 'left' : 'right';

      this.reset(true);
      this.loop = this.loop.bind(this);
      this.rafId = requestAnimationFrame(this.loop);
    }

    destroy() {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = null;
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('keyup', this._onKeyUp);
      if (this.canvas && this.canvas.parentNode) {
        this.canvas.parentNode.removeChild(this.canvas);
      }
    }

    reset(full) {
      this.leftY = (H - PADDLE_H) / 2;
      this.rightY = (H - PADDLE_H) / 2;
      if (full) {
        this.scoreL = 0;
        this.scoreR = 0;
        this.lastScorer = Math.random() < 0.5 ? 'left' : 'right';
      }
      this.serveBall();
      this.updateStats();
    }

    serveBall() {
      this.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, speed: BALL_START_SPEED };
      this.state = 'serve';
      this.serveAt = performance.now() + SERVE_DELAY_MS;
      // Serve toward the player who just got scored on.
      this._serveDir = this.lastScorer === 'left' ? -1 : 1;
    }

    launchBall() {
      const angle = (Math.random() * 0.4 - 0.2) * Math.PI; // ±36°
      this.ball.speed = BALL_START_SPEED;
      this.ball.vx = Math.cos(angle) * this.ball.speed * this._serveDir;
      this.ball.vy = Math.sin(angle) * this.ball.speed;
      this.state = 'playing';
    }

    togglePause() {
      if (this.state === 'gameover') return;
      this.paused = !this.paused;
      if (this.paused) {
        this.api.showOverlay({
          title: 'Paused',
          subtitle: 'Space to resume, R to restart.',
          primaryLabel: 'Resume',
          secondaryLabel: 'Back to menu',
          onPrimary: () => { this.paused = false; this.last = performance.now(); },
        });
      } else {
        this.api.hideOverlay();
        this.last = performance.now();
      }
    }

    restart() {
      this.paused = false;
      this.state = 'playing';
      this.api.hideOverlay();
      this.reset(true);
    }

    onKey(e) {
      if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
        this.togglePause();
        e.preventDefault();
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        this.restart();
        e.preventDefault();
        return;
      }
    }

    buildSettings(container) {
      const mk = (labelText) => {
        const f = document.createElement('div');
        f.className = 'field';
        const l = document.createElement('label');
        l.textContent = labelText;
        f.appendChild(l);
        return f;
      };

      const modeField = mk('Mode');
      const modeSel = document.createElement('select');
      [
        ['1p', '1 player vs CPU'],
        ['2p', '2 players (hotseat)'],
      ].forEach(([v, t]) => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = t;
        modeSel.appendChild(o);
      });
      modeSel.value = this.mode;
      modeSel.addEventListener('change', () => {
        this.mode = modeSel.value;
        this.save();
        this.reset(true);
      });
      modeField.appendChild(modeSel);
      container.appendChild(modeField);

      const diffField = mk('CPU difficulty');
      const diffSel = document.createElement('select');
      Object.entries(DIFFICULTY).forEach(([k, v]) => {
        const o = document.createElement('option');
        o.value = k;
        o.textContent = v.label;
        diffSel.appendChild(o);
      });
      diffSel.value = this.difficulty;
      diffSel.addEventListener('change', () => {
        this.difficulty = diffSel.value;
        this.save();
      });
      diffField.appendChild(diffSel);
      container.appendChild(diffField);

      const sideField = mk('Your side (1P)');
      const sideSel = document.createElement('select');
      [['right', 'Right'], ['left', 'Left']].forEach(([v, t]) => {
        const o = document.createElement('option');
        o.value = v; o.textContent = t;
        sideSel.appendChild(o);
      });
      sideSel.value = this.playerSide;
      sideSel.addEventListener('change', () => {
        this.playerSide = sideSel.value;
        this.save();
      });
      sideField.appendChild(sideSel);
      container.appendChild(sideField);

      const targetField = mk('First to');
      const targetSel = document.createElement('select');
      [5, 7, 11, 21].forEach((n) => {
        const o = document.createElement('option');
        o.value = String(n);
        o.textContent = String(n);
        targetSel.appendChild(o);
      });
      targetSel.value = String(this.target);
      targetSel.addEventListener('change', () => {
        this.target = parseInt(targetSel.value, 10);
        this.save();
        this.reset(true);
      });
      targetField.appendChild(targetSel);
      container.appendChild(targetField);
    }

    save() {
      this.api.saveSettings('pong', {
        mode: this.mode,
        difficulty: this.difficulty,
        target: this.target,
        playerSide: this.playerSide,
      });
    }

    updateStats() {
      const best = this.api.getHighScore('pong') || 0;
      const stats = {
        mode: this.mode === '2p' ? '2P hotseat' : 'vs CPU (' + DIFFICULTY[this.difficulty].label + ')',
        score: this.scoreL + ' : ' + this.scoreR,
        target: this.target,
      };
      if (best > 0 && this.mode === '1p') stats.streak = best;
      this.api.setStats(stats);
    }

    // ---------- AI ----------
    aiUpdate(dt, whichSide) {
      const diff = DIFFICULTY[this.difficulty];
      const paddleY = whichSide === 'left' ? this.leftY : this.rightY;
      const targetY = this._predictBallY(whichSide) - PADDLE_H / 2;
      const jitteredTarget = targetY + (Math.random() - 0.5) * diff.jitter;

      // react smoothly using exponential approach
      const k = 1 - Math.pow(diff.react, dt);
      let next = paddleY + (jitteredTarget - paddleY) * k;
      // but cap motion to a max speed so it still looks paddle-like
      const maxDelta = PADDLE_SPEED * diff.maxSpeedMul * dt;
      const delta = Math.max(-maxDelta, Math.min(maxDelta, next - paddleY));
      next = paddleY + delta;
      next = Math.max(0, Math.min(H - PADDLE_H, next));
      if (whichSide === 'left') this.leftY = next;
      else this.rightY = next;
    }

    _predictBallY(whichSide) {
      const b = this.ball;
      if (this.state !== 'playing') return H / 2;
      const targetX = whichSide === 'left'
        ? PADDLE_MARGIN + PADDLE_W + BALL_R
        : W - PADDLE_MARGIN - PADDLE_W - BALL_R;
      if ((whichSide === 'left' && b.vx >= 0) || (whichSide === 'right' && b.vx <= 0)) {
        // ball moving away — drift toward centre
        return H / 2;
      }
      // Simulate wall bounces until ball reaches paddle column.
      let x = b.x;
      let y = b.y;
      let vx = b.vx;
      let vy = b.vy;
      for (let i = 0; i < 8 && ((whichSide === 'left' && x > targetX) || (whichSide === 'right' && x < targetX)); i++) {
        const dx = targetX - x;
        const t = vx === 0 ? 0 : dx / vx;
        if (t <= 0) break;
        let ny = y + vy * t;
        // unfold wall reflections
        const range = H - 2 * BALL_R;
        ny = ny - BALL_R;
        ny = ((ny % (2 * range)) + 2 * range) % (2 * range);
        if (ny > range) ny = 2 * range - ny;
        ny = ny + BALL_R;
        return ny;
      }
      return b.y;
    }

    // ---------- physics ----------
    step(dt) {
      if (this.state === 'serve') {
        if (performance.now() >= this.serveAt) this.launchBall();
      }

      // Player input — depends on mode/side
      const up1 = this.keys.has('w') || this.keys.has('W');
      const dn1 = this.keys.has('s') || this.keys.has('S');
      const up2 = this.keys.has('ArrowUp');
      const dn2 = this.keys.has('ArrowDown');

      if (this.mode === '2p') {
        // P1 left (W/S), P2 right (arrows)
        this.leftY += ((dn1 ? 1 : 0) - (up1 ? 1 : 0)) * PADDLE_SPEED * dt;
        this.rightY += ((dn2 ? 1 : 0) - (up2 ? 1 : 0)) * PADDLE_SPEED * dt;
      } else {
        // 1P vs CPU. Player controls their chosen side with BOTH W/S and arrows.
        const up = up1 || up2;
        const dn = dn1 || dn2;
        if (this.playerSide === 'right') {
          this.rightY += ((dn ? 1 : 0) - (up ? 1 : 0)) * PADDLE_SPEED * dt;
          this.aiUpdate(dt, 'left');
        } else {
          this.leftY += ((dn ? 1 : 0) - (up ? 1 : 0)) * PADDLE_SPEED * dt;
          this.aiUpdate(dt, 'right');
        }
      }

      // Clamp paddles.
      this.leftY = Math.max(0, Math.min(H - PADDLE_H, this.leftY));
      this.rightY = Math.max(0, Math.min(H - PADDLE_H, this.rightY));

      if (this.state !== 'playing') return;

      // Integrate ball (sub-step to avoid tunneling at high speed).
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(this.ball.vx), Math.abs(this.ball.vy)) * dt / 12));
      const sdt = dt / steps;
      for (let i = 0; i < steps; i++) {
        if (this._ballStep(sdt)) break; // point scored; stop sub-stepping
      }
    }

    _ballStep(dt) {
      const b = this.ball;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // top / bottom walls
      if (b.y - BALL_R < 0 && b.vy < 0) {
        b.y = BALL_R;
        b.vy = -b.vy;
      } else if (b.y + BALL_R > H && b.vy > 0) {
        b.y = H - BALL_R;
        b.vy = -b.vy;
      }

      // paddles
      const leftRect = { x: PADDLE_MARGIN, y: this.leftY, w: PADDLE_W, h: PADDLE_H };
      const rightRect = { x: W - PADDLE_MARGIN - PADDLE_W, y: this.rightY, w: PADDLE_W, h: PADDLE_H };

      // left paddle hit
      if (b.vx < 0 && b.x - BALL_R <= leftRect.x + leftRect.w && b.x - BALL_R > leftRect.x - 14) {
        if (b.y + BALL_R >= leftRect.y && b.y - BALL_R <= leftRect.y + leftRect.h) {
          this._bounceOffPaddle(leftRect, 1);
        }
      }
      // right paddle hit
      if (b.vx > 0 && b.x + BALL_R >= rightRect.x && b.x + BALL_R < rightRect.x + rightRect.w + 14) {
        if (b.y + BALL_R >= rightRect.y && b.y - BALL_R <= rightRect.y + rightRect.h) {
          this._bounceOffPaddle(rightRect, -1);
        }
      }

      // score detection
      if (b.x + BALL_R < 0) {
        this.onPoint('right');
        return true;
      } else if (b.x - BALL_R > W) {
        this.onPoint('left');
        return true;
      }
      return false;
    }

    _bounceOffPaddle(rect, dirX) {
      const b = this.ball;
      const rel = (b.y - (rect.y + rect.h / 2)) / (rect.h / 2); // -1..1
      const clamped = Math.max(-1, Math.min(1, rel));
      const angle = clamped * MAX_BOUNCE_ANGLE;
      const newSpeed = Math.min(BALL_MAX_SPEED, b.speed * BALL_SPEEDUP);
      b.speed = newSpeed;
      b.vx = Math.cos(angle) * newSpeed * dirX;
      b.vy = Math.sin(angle) * newSpeed;
      // Nudge ball out so we don't re-collide next frame.
      if (dirX === 1) b.x = rect.x + rect.w + BALL_R + 0.5;
      else b.x = rect.x - BALL_R - 0.5;
    }

    onPoint(winner) {
      if (winner === 'left') this.scoreL++;
      else this.scoreR++;
      this.lastScorer = winner;
      this.updateStats();

      if (this.scoreL >= this.target || this.scoreR >= this.target) {
        this.endMatch(winner);
      } else {
        this.serveBall();
      }
    }

    endMatch(winner) {
      this.state = 'gameover';

      // Track "streak" in 1P: consecutive wins vs CPU are recorded per difficulty.
      if (this.mode === '1p') {
        const userWon =
          (this.playerSide === 'right' && winner === 'right') ||
          (this.playerSide === 'left' && winner === 'left');
        if (userWon) {
          const key = 'pong:streak:' + this.difficulty;
          const cur = this.api.getHighScore(key) || 0;
          this.api.submitScore(key, cur + 1);
          this.api.submitScore('pong', (this.api.getHighScore('pong') || 0) + 1);
        } else {
          // reset streak
          this.api.submitScore('pong:streak:' + this.difficulty, 0);
        }
      }

      const names =
        this.mode === '2p'
          ? { left: 'Player 1', right: 'Player 2' }
          : this.playerSide === 'right'
          ? { left: 'CPU', right: 'You' }
          : { left: 'You', right: 'CPU' };

      this.api.showOverlay({
        title: names[winner] + ' wins',
        subtitle:
          `${this.scoreL} — ${this.scoreR}.  Press R to play again, Esc for menu.`,
        primaryLabel: 'Rematch',
        secondaryLabel: 'Back to menu',
        onPrimary: () => this.restart(),
      });
    }

    loop(t) {
      if (this.rafId === null) return;
      if (!this.last) this.last = t;
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      if (!this.paused) this.step(dt);
      this.render();
      this.rafId = requestAnimationFrame(this.loop);
    }

    render() {
      const ctx = this.ctx;
      const cs = getComputedStyle(document.documentElement);
      const bg = cs.getPropertyValue('--bg').trim() || '#ffffff';
      const fg = cs.getPropertyValue('--fg').trim() || '#0a0a0a';
      const line = cs.getPropertyValue('--line').trim() || '#ececec';

      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // centre dashed line
      ctx.strokeStyle = line;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 10]);
      ctx.beginPath();
      ctx.moveTo(W / 2, 12);
      ctx.lineTo(W / 2, H - 12);
      ctx.stroke();
      ctx.setLineDash([]);

      // scores
      ctx.fillStyle = fg;
      ctx.font = '600 48px ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'right';
      ctx.fillText(String(this.scoreL), W / 2 - 28, 22);
      ctx.textAlign = 'left';
      ctx.fillText(String(this.scoreR), W / 2 + 28, 22);

      // paddles
      ctx.fillRect(PADDLE_MARGIN, this.leftY, PADDLE_W, PADDLE_H);
      ctx.fillRect(W - PADDLE_MARGIN - PADDLE_W, this.rightY, PADDLE_W, PADDLE_H);

      // ball
      ctx.beginPath();
      ctx.arc(this.ball.x, this.ball.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();

      // serve countdown
      if (this.state === 'serve') {
        const remaining = Math.max(0, this.serveAt - performance.now());
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '500 14px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
        ctx.fillStyle = fg;
        ctx.globalAlpha = 0.6;
        const msg = this.mode === '2p'
          ? 'P1: W/S   ·   P2: ↑/↓   ·   First to ' + this.target
          : (this.playerSide === 'right' ? 'You: W/S or ↑/↓ (right side)' : 'You: W/S or ↑/↓ (left side)') +
            '   ·   First to ' + this.target;
        ctx.fillText(msg, W / 2, H / 2 + 40);
        if (remaining > 0) {
          ctx.font = '600 20px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
          ctx.fillText(Math.ceil(remaining / 1000) + '…', W / 2, H / 2 + 74);
        }
        ctx.globalAlpha = 1;
      }
    }
  }
})();
