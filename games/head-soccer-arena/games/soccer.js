/*
 * Head Soccer for Cursor Arcade.
 *
 * Monochrome, physics-driven 2-player soccer. Each player is a head + torso +
 * one leg that can extend to kick. Ball is a circle. Goals on each side have a
 * crossbar you can bounce off. Power-ups fall from the sky occasionally.
 *
 * Modes:
 *   - 1P: Player 1 (WASD + Q) vs a reactive CPU.
 *   - 2P: WASD + Q and Arrows + '/'.
 *
 * Physics:
 *   - Fixed 120 Hz step; semi-implicit Euler; gravity 1900 px/s^2.
 *   - Ball/head: elastic circle-circle (player mass 60, ball 1).
 *   - Ball/body: AABB with horizontal bounce.
 *   - Ball/foot (during kick): explicit impulse override.
 *   - Ground, ceiling, side walls: bounce with elasticity loss.
 *
 * Power-ups:
 *   - Fire:  next kick launches ball ~1.6x, leaves a trail.
 *   - Ice:   next kick freezes the opponent on contact for 1.1s.
 *   - Giant: your head radius doubles for 5s (wall of meat).
 *   - Multi: two extra balls spawn for 6s.
 *
 * Special shot (power bar):
 *   - Fills +12%/s while match is live.
 *   - At 100%, press power key to arm. Your next kick within 2.5s is a
 *     straight-line rocket shot.
 *
 * The shell already gives us: api.setStats, api.showOverlay, api.submitScore,
 * api.saveSettings, api.setTopbarControls. We use all of them.
 */
(function () {
  'use strict';

  const R = (window.CursorArcade = window.CursorArcade || {});
  R.games = R.games || {};

  // ---------------- World / physics constants ----------------

  const W = 900;
  const H = 520;
  const GROUND_Y = H - 22;
  const CEIL_Y = 0;

  const GRAVITY = 1900;
  const BALL_R = 14;
  const BALL_MASS = 1;
  const BALL_ELAST_WALL = 0.82;
  const BALL_ELAST_GROUND = 0.7;
  const BALL_DRAG_AIR = 0.9995;
  const BALL_DRAG_GROUND_X = 0.985;

  const HEAD_R = 26;
  const BODY_W = 26;
  const BODY_H = 44;
  const LEG_H = 36;
  const FOOT_R = 9;
  const PLAYER_MASS = 60;
  const HEAD_ELAST = 0.9;

  // Y (head center) required for feet to rest exactly on the ground.
  const BODY_OFFSET_Y = HEAD_R * 0.55;
  const PLAYER_REST_Y = GROUND_Y - (BODY_OFFSET_Y + BODY_H + LEG_H + FOOT_R);

  const WALK_ACCEL_GROUND = 3600;
  const WALK_ACCEL_AIR = 1800;
  const WALK_MAX = 330;
  const GROUND_FRICTION = 0.82;
  const JUMP_SPEED = 720;

  const KICK_ACTIVE_MS = 150;
  const KICK_COOLDOWN_MS = 240;
  const KICK_GROUND_V = { x: 780, y: -420 };
  const KICK_AIR_V = { x: 560, y: -560 };
  const POWER_SHOT_V = { x: 1500, y: -120 };

  const GOAL_W = 82;
  const GOAL_H = 200;
  const CROSSBAR_T = 8;

  const POWER_FILL_PER_SEC = 12;
  const POWER_ARMED_MS = 2500;

  const POWERUP_R = 16;
  const POWERUP_SPAWN_MIN = 6;
  const POWERUP_SPAWN_MAX = 12;
  const POWERUP_FALL_ACC = 260;
  const POWERUP_FALL_MAX = 200;
  const EFFECT_FIRE_MS = 7000; // charge window
  const EFFECT_ICE_MS = 7000;
  const EFFECT_GIANT_MS = 5000;
  const EFFECT_MULTIBALL_MS = 6000;
  const ICE_STUN_MS = 1100;

  const MATCH_SECONDS_DEFAULT = 90;
  const GOALS_TO_WIN_DEFAULT = 5;

  // ---------------- Key maps ----------------

  const KEYMAP_P1 = {
    left: ['a', 'A'],
    right: ['d', 'D'],
    jump: ['w', 'W'],
    kick: ['s', 'S'],
    power: ['q', 'Q'],
  };
  const KEYMAP_P2 = {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    jump: ['ArrowUp'],
    kick: ['ArrowDown'],
    power: ['/', '?'],
  };

  // ---------------- Utilities ----------------

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sign(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function choose(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function rectCircleIntersect(rx, ry, rw, rh, cx, cy, cr) {
    const nx = clamp(cx, rx, rx + rw);
    const ny = clamp(cy, ry, ry + rh);
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy <= cr * cr;
  }

  // ---------------- Registration ----------------

  R.games.soccer = {
    create(c) { return new SoccerGame(c); },
  };

  const POWERUP_KINDS = ['fire', 'ice', 'giant', 'multi'];

  class SoccerGame {
    constructor({ host, api, meta, options }) {
      this.host = host;
      this.api = api;
      this.meta = meta;

      const saved = api.getSettings('soccer') || {};
      this.mode = saved.mode || '1p';
      this.matchSeconds = saved.matchSeconds || MATCH_SECONDS_DEFAULT;
      this.goalsToWin = saved.goalsToWin || GOALS_TO_WIN_DEFAULT;

      this.wrap = document.createElement('div');
      this.wrap.style.display = 'flex';
      this.wrap.style.alignItems = 'center';
      this.wrap.style.justifyContent = 'center';
      this.wrap.style.width = '100%';
      this.wrap.style.height = '100%';

      this.canvas = document.createElement('canvas');
      this.canvas.width = W;
      this.canvas.height = H;
      this.canvas.style.maxWidth = '100%';
      this.canvas.style.maxHeight = '100%';
      this.canvas.style.width = 'auto';
      this.canvas.style.height = 'auto';
      this.canvas.style.border = '1px solid var(--line-strong)';
      this.canvas.style.borderRadius = '4px';
      this.canvas.style.background = 'var(--bg)';
      this.wrap.appendChild(this.canvas);
      host.appendChild(this.wrap);
      this.ctx = this.canvas.getContext('2d');

      this.keys = new Set();

      this.api.setTopbarControls({ pause: true, restart: true });

      this.rafId = null;
      this.lastT = 0;
      this.accT = 0;
      this.paused = false;

      this._installKeyupBridge();

      this.reset();
      this.loop = this.loop.bind(this);
      this.rafId = requestAnimationFrame(this.loop);
    }

    // ---------------- Lifecycle ----------------

    reset() {
      this.state = 'countdown';     // 'countdown' | 'playing' | 'goal' | 'ended'
      this.countdownT = 3.0;
      this.goalPauseT = 0;
      this.matchTimeLeft = this.matchSeconds;
      this.timeSinceLastPowerup = 0;
      this.nextPowerupAt = rand(POWERUP_SPAWN_MIN, POWERUP_SPAWN_MAX);

      this.score = [0, 0];
      this.lastScorer = -1;

      this.players = [
        makePlayer({ idx: 0, facing: 1, x: W * 0.25, keys: KEYMAP_P1, ai: false }),
        makePlayer({
          idx: 1,
          facing: -1,
          x: W * 0.75,
          keys: KEYMAP_P2,
          ai: this.mode === '1p',
        }),
      ];
      for (const p of this.players) p.y = PLAYER_REST_Y;
      this.balls = [makeBall(W / 2, H * 0.25, this.lastScorer === -1 ? 0 : (this.lastScorer === 0 ? 1 : -1))];
      this.powerups = [];
      this.multiballUntil = 0;

      this.effects = { hitFlash: 0, goalFlash: 0, shake: 0 };

      this.api.hideOverlay();
      this.updateStats();
    }

    togglePause() {
      if (this.state === 'ended') return;
      this.paused = !this.paused;
      if (this.paused) {
        this.api.showOverlay({
          title: 'Paused',
          subtitle: 'Press Space or click Resume.',
          primaryLabel: 'Resume',
          onPrimary: () => { this.paused = false; this.lastT = performance.now(); },
        });
      } else {
        this.api.hideOverlay();
        this.lastT = performance.now();
      }
    }

    restart() {
      this.reset();
    }

    destroy() {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = null;
      this._uninstallKeyupBridge();
      if (this.wrap && this.wrap.parentNode) this.wrap.parentNode.removeChild(this.wrap);
    }

    // ---------------- Input ----------------

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
      this.keys.add(e.key);
      // Edge-triggered actions: jump, kick, power
      for (const p of this.players) {
        if (p.ai) continue;
        if (p.keys.jump.includes(e.key)) this.tryJump(p);
        else if (p.keys.kick.includes(e.key)) this.tryKick(p);
        else if (p.keys.power.includes(e.key)) this.tryArmPower(p);
      }
      // Prevent arrow-scroll etc.
      if (isGameKey(e.key)) e.preventDefault();
    }

    onKeyUp(e) {
      this.keys.delete(e.key);
    }

    // Hook onKey-up into the shell: arcade.js only dispatches keydown, so we
    // install a window-level keyup listener ourselves.
    _installKeyupBridge() {
      this._keyupHandler = (e) => this.onKeyUp(e);
      window.addEventListener('keyup', this._keyupHandler, true);
    }
    _uninstallKeyupBridge() {
      if (this._keyupHandler) {
        window.removeEventListener('keyup', this._keyupHandler, true);
        this._keyupHandler = null;
      }
    }

    // ---------------- Game loop ----------------

    loop(t) {
      if (!this.lastT) this.lastT = t;
      let dt = (t - this.lastT) / 1000;
      this.lastT = t;
      if (dt > 0.1) dt = 0.1;

      if (!this.paused) {
        this.accT += dt;
        const FIXED = 1 / 120;
        let iters = 0;
        while (this.accT >= FIXED && iters < 8) {
          this.step(FIXED);
          this.accT -= FIXED;
          iters++;
        }
      }

      this.render();
      this.rafId = requestAnimationFrame(this.loop);
    }

    step(dt) {
      // Timers always tick
      if (this.effects.hitFlash > 0) this.effects.hitFlash -= dt;
      if (this.effects.goalFlash > 0) this.effects.goalFlash -= dt;
      if (this.effects.shake > 0) this.effects.shake -= dt;

      if (this.state === 'countdown') {
        this.countdownT -= dt;
        if (this.countdownT <= 0) {
          this.state = 'playing';
        }
        return;
      }
      if (this.state === 'goal') {
        this.goalPauseT -= dt;
        if (this.goalPauseT <= 0) {
          this.resetField();
          this.state = 'countdown';
          this.countdownT = 1.25;
        }
        return;
      }
      if (this.state === 'ended') {
        return;
      }

      // Match clock
      this.matchTimeLeft -= dt;
      if (this.matchTimeLeft <= 0) {
        this.matchTimeLeft = 0;
        this.endMatch(null);
        return;
      }

      // Power bar fill
      for (const p of this.players) {
        if (p.power < 100 && p.armedUntil <= 0) {
          p.power = Math.min(100, p.power + POWER_FILL_PER_SEC * dt);
        }
      }

      // Input sampling (continuous)
      for (const p of this.players) {
        if (p.ai) {
          this.aiControl(p, dt);
        } else {
          p.input.left = p.keys.left.some((k) => this.keys.has(k));
          p.input.right = p.keys.right.some((k) => this.keys.has(k));
        }
      }

      // Tick timers on players
      for (const p of this.players) {
        if (p.kickActive > 0) p.kickActive -= dt * 1000;
        if (p.kickCooldown > 0) p.kickCooldown -= dt * 1000;
        if (p.armedUntil > 0) p.armedUntil -= dt * 1000;
        if (p.stun > 0) p.stun -= dt * 1000;
        if (p.effects.fire > 0) p.effects.fire -= dt * 1000;
        if (p.effects.ice > 0) p.effects.ice -= dt * 1000;
        if (p.effects.giant > 0) p.effects.giant -= dt * 1000;
      }

      // Multiball expiry
      if (this.multiballUntil > 0) {
        this.multiballUntil -= dt * 1000;
        if (this.multiballUntil <= 0) {
          // Keep only the primary ball
          this.balls = [this.balls[0]];
        }
      }

      // Powerup spawning
      this.timeSinceLastPowerup += dt;
      if (this.timeSinceLastPowerup >= this.nextPowerupAt && this.powerups.length < 1) {
        this.spawnPowerup();
        this.timeSinceLastPowerup = 0;
        this.nextPowerupAt = rand(POWERUP_SPAWN_MIN, POWERUP_SPAWN_MAX);
      }

      // Physics
      for (const p of this.players) this.integratePlayer(p, dt);
      for (const b of this.balls) this.integrateBall(b, dt);
      for (const pu of this.powerups) this.integratePowerup(pu, dt);

      // Collisions (several iterations help with stacked-contact cases)
      for (let iter = 0; iter < 2; iter++) {
        for (const p of this.players) {
          for (const b of this.balls) this.resolveBallPlayer(b, p);
        }
        for (const p of this.players) {
          for (const pu of this.powerups) this.collectPowerupIfTouch(pu, p);
        }
      }

      // Goal detection after collisions
      for (let i = this.balls.length - 1; i >= 0; i--) {
        const b = this.balls[i];
        const scorerIdx = this.goalDetect(b);
        if (scorerIdx >= 0) {
          if (this.balls.length === 1) {
            this.onGoal(scorerIdx);
            return;
          } else {
            // Multiball ball that scored: award goal, remove just that ball
            this.score[scorerIdx] += 1;
            this.effects.goalFlash = 0.4;
            this.effects.shake = 0.25;
            this.balls.splice(i, 1);
            this.updateStats();
            if (this.score[0] >= this.goalsToWin || this.score[1] >= this.goalsToWin) {
              this.endMatch(this.score[0] >= this.goalsToWin ? 0 : 1);
              return;
            }
          }
        }
      }

      this.updateStats();
    }

    // ---------------- Player physics ----------------

    integratePlayer(p, dt) {
      // Walking
      let accX = 0;
      if (p.stun <= 0) {
        const walkAcc = p.onGround ? WALK_ACCEL_GROUND : WALK_ACCEL_AIR;
        if (p.input.left && !p.input.right) accX -= walkAcc;
        if (p.input.right && !p.input.left) accX += walkAcc;
      }
      p.vx += accX * dt;

      // Gravity
      p.vy += GRAVITY * dt;

      // Friction (ground only, and only when no input)
      if (p.onGround && !p.input.left && !p.input.right && p.stun <= 0) {
        p.vx *= Math.pow(GROUND_FRICTION, dt * 60);
        if (Math.abs(p.vx) < 4) p.vx = 0;
      }

      // Speed cap (horizontal)
      if (p.vx > WALK_MAX) p.vx = WALK_MAX;
      if (p.vx < -WALK_MAX) p.vx = -WALK_MAX;

      // Integrate
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Ground
      const feetY = p.y + p.bodyOffsetY + BODY_H + LEG_H + FOOT_R;
      if (feetY >= GROUND_Y) {
        const overshoot = feetY - GROUND_Y;
        p.y -= overshoot;
        if (p.vy > 0) p.vy = 0;
        p.onGround = true;
      } else {
        p.onGround = false;
      }

      // Side walls (absolute field extents; goalkeepers can walk to their own post)
      const leftLimit = p.idx === 0 ? HEAD_R : GOAL_W + HEAD_R;
      const rightLimit = p.idx === 1 ? W - HEAD_R : W - GOAL_W - HEAD_R;
      if (p.x < leftLimit) { p.x = leftLimit; if (p.vx < 0) p.vx = 0; }
      if (p.x > rightLimit) { p.x = rightLimit; if (p.vx > 0) p.vx = 0; }

      // Ceiling
      if (p.y - HEAD_R < CEIL_Y) {
        p.y = CEIL_Y + HEAD_R;
        if (p.vy < 0) p.vy = 0;
      }
    }

    tryJump(p) {
      if (p.stun > 0) return;
      if (!p.onGround) return;
      p.vy = -JUMP_SPEED;
      p.onGround = false;
    }

    tryKick(p) {
      if (p.stun > 0) return;
      if (p.kickCooldown > 0) return;
      p.kickActive = KICK_ACTIVE_MS;
      p.kickCooldown = KICK_COOLDOWN_MS;
    }

    tryArmPower(p) {
      if (p.stun > 0) return;
      if (p.power < 100) return;
      p.armedUntil = POWER_ARMED_MS;
    }

    // ---------------- Ball physics ----------------

    integrateBall(b, dt) {
      b.vy += GRAVITY * dt * (b.lowGrav > 0 ? 0.35 : 1);
      if (b.lowGrav > 0) b.lowGrav -= dt * 1000;

      // Air drag
      b.vx *= Math.pow(BALL_DRAG_AIR, dt * 60);
      b.vy *= Math.pow(BALL_DRAG_AIR, dt * 60);

      // Ground rolling drag
      if (b.y + b.r >= GROUND_Y - 1 && Math.abs(b.vy) < 40) {
        b.vx *= Math.pow(BALL_DRAG_GROUND_X, dt * 60);
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Ground bounce
      if (b.y + b.r > GROUND_Y) {
        b.y = GROUND_Y - b.r;
        if (b.vy > 0) b.vy = -b.vy * BALL_ELAST_GROUND;
        if (Math.abs(b.vy) < 70) b.vy = 0;
      }

      // Ceiling
      if (b.y - b.r < CEIL_Y) {
        b.y = CEIL_Y + b.r;
        if (b.vy < 0) b.vy = -b.vy * BALL_ELAST_WALL;
      }

      // Side walls (but only above the crossbar opening; below that is the goal mouth)
      const goalTopY = GROUND_Y - GOAL_H;
      // Left wall
      if (b.x - b.r < 0) {
        if (b.y < goalTopY - b.r) {
          b.x = b.r;
          if (b.vx < 0) b.vx = -b.vx * BALL_ELAST_WALL;
        }
        // else: ball entering the goal mouth, leave position alone -> detected later
      }
      // Right wall
      if (b.x + b.r > W) {
        if (b.y < goalTopY - b.r) {
          b.x = W - b.r;
          if (b.vx > 0) b.vx = -b.vx * BALL_ELAST_WALL;
        }
      }

      // Crossbars: top of each goal is a solid bar you can bounce off.
      // Left crossbar rect: x in [0, GOAL_W], y in [goalTopY, goalTopY+CROSSBAR_T]
      this._resolveBallRect(b, 0, goalTopY, GOAL_W, CROSSBAR_T);
      // Right crossbar
      this._resolveBallRect(b, W - GOAL_W, goalTopY, GOAL_W, CROSSBAR_T);

      // Trail (for effects)
      if (b.trail.length >= 14) b.trail.shift();
      b.trail.push({ x: b.x, y: b.y });
      if (b.onFire > 0) b.onFire -= dt * 1000;
    }

    _resolveBallRect(b, rx, ry, rw, rh) {
      if (!rectCircleIntersect(rx, ry, rw, rh, b.x, b.y, b.r)) return;
      // Pick the side with the shallowest overlap and push out.
      const leftOverlap = b.x + b.r - rx;
      const rightOverlap = rx + rw - (b.x - b.r);
      const topOverlap = b.y + b.r - ry;
      const bottomOverlap = ry + rh - (b.y - b.r);
      const minO = Math.min(leftOverlap, rightOverlap, topOverlap, bottomOverlap);
      if (minO === leftOverlap) {
        b.x = rx - b.r;
        if (b.vx > 0) b.vx = -b.vx * BALL_ELAST_WALL;
      } else if (minO === rightOverlap) {
        b.x = rx + rw + b.r;
        if (b.vx < 0) b.vx = -b.vx * BALL_ELAST_WALL;
      } else if (minO === topOverlap) {
        b.y = ry - b.r;
        if (b.vy > 0) b.vy = -b.vy * BALL_ELAST_WALL;
      } else {
        b.y = ry + rh + b.r;
        if (b.vy < 0) b.vy = -b.vy * BALL_ELAST_WALL;
      }
    }

    // ---------------- Ball <-> Player ----------------

    resolveBallPlayer(b, p) {
      const headR = HEAD_R * (p.effects.giant > 0 ? 1.8 : 1.0);
      const headX = p.x;
      const headY = p.y;

      // Head: elastic circle-circle
      const dhx = b.x - headX;
      const dhy = b.y - headY;
      const distH = Math.hypot(dhx, dhy);
      const minDistH = b.r + headR;
      if (distH > 0 && distH < minDistH) {
        const nx = dhx / distH;
        const ny = dhy / distH;
        const rvx = b.vx - p.vx;
        const rvy = b.vy - p.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          const m1 = BALL_MASS;
          const m2 = PLAYER_MASS;
          const j = -(1 + HEAD_ELAST) * vn / (1 / m1 + 1 / m2);
          b.vx += (j * nx) / m1;
          b.vy += (j * ny) / m1;
          // Heads don't move vertically from ball impact -- it would feel weird.
          p.vx -= (j * nx) / m2;
        }
        const overlap = minDistH - distH;
        b.x += nx * overlap;
        b.y += ny * overlap;
        this.onBallHitsPlayer(b, p);
      }

      // Body: rect AABB
      const bx = p.x - BODY_W / 2;
      const by = p.y + HEAD_R * 0.55;
      if (rectCircleIntersect(bx, by, BODY_W, BODY_H, b.x, b.y, b.r)) {
        // Shallowest-edge push-out
        const l = b.x + b.r - bx;
        const r = bx + BODY_W - (b.x - b.r);
        const t = b.y + b.r - by;
        const bt = by + BODY_H - (b.y - b.r);
        const m = Math.min(l, r, t, bt);
        if (m === l) { b.x = bx - b.r; if (b.vx > 0) b.vx = -b.vx * 0.5; }
        else if (m === r) { b.x = bx + BODY_W + b.r; if (b.vx < 0) b.vx = -b.vx * 0.5; }
        else if (m === t) { b.y = by - b.r; if (b.vy > 0) b.vy = -b.vy * 0.4; }
        else { b.y = by + BODY_H + b.r; if (b.vy < 0) b.vy = -b.vy * 0.4; }
        this.onBallHitsPlayer(b, p);
      }

      // Foot (kick). When kick is active, anywhere in the wider kick zone
      // in front of the player counts.
      if (p.kickActive > 0) {
        const z = this._kickZoneRect(p);
        if (rectCircleIntersect(z.x, z.y, z.w, z.h, b.x, b.y, b.r)) {
          this._applyKickImpulse(b, p);
        }
      }
    }

    // Narrow rectangle used only for rendering the extended leg sprite.
    _legRect(p) {
      const forward = p.facing;
      const lw = HEAD_R * 1.6;
      const lh = HEAD_R * 0.55;
      const legY = p.y + HEAD_R * 2.5;
      const legX = forward > 0 ? p.x + HEAD_R * 0.1 : p.x - HEAD_R * 0.1 - lw;
      return { x: legX, y: legY, w: lw, h: lh };
    }

    // Wide forward arc used for actual kick collision. Covers anywhere in
    // front of the player from above the head down to just below the feet.
    _kickZoneRect(p) {
      const forward = p.facing;
      const kw = HEAD_R * 1.9;
      const kh = HEAD_R * 4.4;
      const ky = p.y - HEAD_R * 0.6;
      const kx = forward > 0 ? p.x - HEAD_R * 0.25 : p.x - kw + HEAD_R * 0.25;
      return { x: kx, y: ky, w: kw, h: kh };
    }

    _applyKickImpulse(b, p) {
      // Prevent re-applying in the same active window
      p.kickActive = 0;
      const base = p.onGround ? KICK_GROUND_V : KICK_AIR_V;
      let vx = p.facing * base.x + p.vx * 0.4;
      let vy = base.y;

      // Apply fire effect (boost the kick)
      if (p.effects.fire > 0) {
        vx *= 1.55;
        vy *= 1.25;
        p.effects.fire = 0;
        b.onFire = 900;
      }

      // Arm ice: tag the ball so the next time it hits a player, stun them
      if (p.effects.ice > 0) {
        b.iceArmedBy = p.idx;
        p.effects.ice = 0;
      }

      // Power shot?
      if (p.armedUntil > 0) {
        vx = p.facing * POWER_SHOT_V.x;
        vy = POWER_SHOT_V.y;
        b.powerFlash = 700;
        p.armedUntil = 0;
        p.power = 0;
        this.effects.shake = 0.15;
      }

      b.vx = vx;
      b.vy = vy;
      this.effects.hitFlash = 0.08;
    }

    onBallHitsPlayer(b, p) {
      // Ice-armed ball stuns the player it touches next (if it's not the shooter)
      if (b.iceArmedBy >= 0 && b.iceArmedBy !== p.idx) {
        p.stun = ICE_STUN_MS;
        p.vx = 0;
        b.iceArmedBy = -1;
      }
    }

    // ---------------- Power-ups ----------------

    spawnPowerup() {
      const kind = choose(POWERUP_KINDS);
      const x = rand(W * 0.3, W * 0.7);
      this.powerups.push({
        kind,
        x,
        y: 40,
        vx: rand(-30, 30),
        vy: 0,
        alive: true,
      });
    }

    integratePowerup(pu, dt) {
      pu.vy = Math.min(POWERUP_FALL_MAX, pu.vy + POWERUP_FALL_ACC * dt);
      pu.x += pu.vx * dt;
      pu.y += pu.vy * dt;
      if (pu.x - POWERUP_R < GOAL_W) pu.vx = Math.abs(pu.vx);
      if (pu.x + POWERUP_R > W - GOAL_W) pu.vx = -Math.abs(pu.vx);
      if (pu.y + POWERUP_R >= GROUND_Y) {
        pu.y = GROUND_Y - POWERUP_R;
        pu.vy = 0;
      }
    }

    collectPowerupIfTouch(pu, p) {
      if (!pu.alive) return;
      // Compare to player bounding circle (head + body)
      const cx = p.x;
      const cy = p.y + HEAD_R;
      const dx = pu.x - cx;
      const dy = pu.y - cy;
      if (dx * dx + dy * dy <= (POWERUP_R + HEAD_R + 6) ** 2) {
        pu.alive = false;
        this.applyPowerup(pu.kind, p);
      }
    }

    applyPowerup(kind, p) {
      if (kind === 'fire') p.effects.fire = EFFECT_FIRE_MS;
      else if (kind === 'ice') p.effects.ice = EFFECT_ICE_MS;
      else if (kind === 'giant') p.effects.giant = EFFECT_GIANT_MS;
      else if (kind === 'multi') {
        // Spawn two extra balls
        this.multiballUntil = EFFECT_MULTIBALL_MS;
        for (let i = 0; i < 2; i++) {
          const nb = makeBall(W / 2 + (i ? 30 : -30), H * 0.3, i ? 1 : -1);
          nb.lowGrav = 600;
          this.balls.push(nb);
        }
      }
    }

    // ---------------- Goal + match flow ----------------

    goalDetect(b) {
      // Returns the index of the scoring player (0 = P1, 1 = P2), or -1 for no goal.
      // Ball is in a goal if its center is below the crossbar and inside the
      // goal mouth on one side.
      const goalTopY = GROUND_Y - GOAL_H + CROSSBAR_T;
      if (b.y > goalTopY && b.y < GROUND_Y) {
        // Ball in P1's left goal -> P2 scored.
        if (b.x + b.r < GOAL_W - 4) return 1;
        // Ball in P2's right goal -> P1 scored.
        if (b.x - b.r > W - GOAL_W + 4) return 0;
      }
      return -1;
    }

    onGoal(scorerIdx) {
      this.score[scorerIdx] += 1;
      this.lastScorer = scorerIdx;
      this.state = 'goal';
      this.goalPauseT = 1.5;
      this.effects.goalFlash = 0.6;
      this.effects.shake = 0.35;
      this.updateStats();
      if (this.score[scorerIdx] >= this.goalsToWin) {
        this.endMatch(scorerIdx);
      }
    }

    resetField() {
      // Keep score, reset positions / ball. Spawn with feet on ground.
      this.players[0].x = W * 0.25;
      this.players[0].y = PLAYER_REST_Y;
      this.players[0].vx = 0; this.players[0].vy = 0;
      this.players[0].onGround = true;
      this.players[0].kickActive = 0; this.players[0].kickCooldown = 0;
      this.players[0].stun = 0;
      this.players[0].input.left = false;
      this.players[0].input.right = false;
      this.players[1].x = W * 0.75;
      this.players[1].y = PLAYER_REST_Y;
      this.players[1].vx = 0; this.players[1].vy = 0;
      this.players[1].onGround = true;
      this.players[1].kickActive = 0; this.players[1].kickCooldown = 0;
      this.players[1].stun = 0;
      this.players[1].input.left = false;
      this.players[1].input.right = false;
      // Ball is kicked off toward whoever just conceded (the non-scorer).
      const towardSide = this.lastScorer === 0 ? 1 : this.lastScorer === 1 ? -1 : 0;
      this.balls = [makeBall(W / 2, H * 0.25, towardSide)];
      this.powerups = [];
      this.multiballUntil = 0;
    }

    endMatch(winnerIdx) {
      this.state = 'ended';
      const you = this.mode === '1p' ? 'You' : 'Player 1';
      const them = this.mode === '1p' ? 'CPU' : 'Player 2';
      let title;
      let subtitle = `Final ${this.score[0]} — ${this.score[1]}. Press R to rematch.`;
      if (winnerIdx === null) {
        if (this.score[0] === this.score[1]) title = "Time's up. Draw.";
        else if (this.score[0] > this.score[1]) title = `${you} win on time.`;
        else title = `${them} ${this.mode === '1p' ? 'wins' : 'wins'} on time.`;
      } else if (winnerIdx === 0) {
        title = `${you} win.`;
      } else {
        title = `${them} ${this.mode === '1p' ? 'wins' : 'wins'}.`;
      }
      this.api.submitScore('soccer:goals-' + this.mode, this.score[0]);
      this.api.showOverlay({
        title,
        subtitle,
        primaryLabel: 'Rematch',
        secondaryLabel: 'Back to menu',
        onPrimary: () => this.restart(),
      });
    }

    updateStats() {
      const modeLabel = this.mode === '1p' ? '1P vs CPU' : '2P hotseat';
      const clockLabel = Math.max(0, Math.ceil(this.matchTimeLeft)) + 's';
      const scoreLabel = this.score[0] + ' — ' + this.score[1];
      this.api.setStats({
        mode: modeLabel,
        score: scoreLabel,
        clock: clockLabel,
        best: this.api.getHighScore('soccer:goals-' + this.mode),
      });
    }

    // ---------------- AI ----------------

    aiControl(p, dt) {
      const ball = this.balls[0] || { x: W / 2, y: H / 2, vx: 0, vy: 0 };

      p.input.left = false;
      p.input.right = false;

      if (p.stun > 0) return;

      // Chase the ball by default, with a small offset so the AI stays on the
      // goal side of the ball (positions its body to strike toward opponent).
      let targetX = ball.x + p.facing * 14;
      targetX = clamp(targetX, GOAL_W + HEAD_R, W - GOAL_W - HEAD_R);

      const dx = targetX - p.x;
      if (dx < -6) p.input.left = true;
      else if (dx > 6) p.input.right = true;

      const horizDist = Math.abs(ball.x - p.x);
      const vertDelta = p.y - ball.y;
      const inFrontX = p.idx === 0 ? ball.x > p.x - HEAD_R * 0.5 : ball.x < p.x + HEAD_R * 0.5;

      // Jump to head a high ball or to clear a cross
      if (
        p.onGround &&
        horizDist < HEAD_R * 3.2 &&
        vertDelta > HEAD_R * 0.3 &&
        ball.vy > -200 &&
        Math.random() < 0.18
      ) {
        this.tryJump(p);
      }

      // Jump defensively if ball is heading toward my goal and close
      const ballHeadingToMyGoal =
        (p.idx === 0 && ball.vx < -60) || (p.idx === 1 && ball.vx > 60);
      if (
        p.onGround &&
        horizDist < HEAD_R * 2.5 &&
        ballHeadingToMyGoal &&
        ball.y < p.y + HEAD_R * 2 &&
        Math.random() < 0.4
      ) {
        this.tryJump(p);
      }

      // Kick aggressively when ball is close and in front
      if (p.kickCooldown <= 0 && horizDist < HEAD_R * 3.3 && inFrontX) {
        // Higher chance the closer and more dangerous it is
        const closeness = 1 - horizDist / (HEAD_R * 3.3);
        if (Math.random() < 0.35 + closeness * 0.45) {
          this.tryKick(p);
        }
      }

      // Use power shot when we're in a decent offensive spot
      const nearOpponentHalf =
        (p.idx === 0 && p.x > W * 0.35) || (p.idx === 1 && p.x < W * 0.65);
      if (
        p.power >= 100 &&
        p.armedUntil <= 0 &&
        horizDist < HEAD_R * 4 &&
        inFrontX &&
        nearOpponentHalf &&
        Math.random() < 0.08
      ) {
        this.tryArmPower(p);
      }
    }

    // ---------------- Rendering ----------------

    render() {
      const ctx = this.ctx;
      const cs = getComputedStyle(document.documentElement);
      const bg = cs.getPropertyValue('--bg').trim() || '#ffffff';
      const fg = cs.getPropertyValue('--fg').trim() || '#0a0a0a';
      const line = cs.getPropertyValue('--line').trim() || '#e8e8e8';
      const mute = cs.getPropertyValue('--fg-mute').trim() || '#a0a0a0';

      // Camera shake
      let shakeX = 0, shakeY = 0;
      if (this.effects.shake > 0) {
        const mag = Math.min(this.effects.shake * 18, 6);
        shakeX = (Math.random() - 0.5) * mag;
        shakeY = (Math.random() - 0.5) * mag;
      }

      ctx.save();
      ctx.translate(shakeX, shakeY);

      // Background
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Center line (dashed)
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(W / 2 + 0.5, 10);
      ctx.lineTo(W / 2 + 0.5, GROUND_Y - 10);
      ctx.stroke();
      ctx.setLineDash([]);

      // Ground
      ctx.strokeStyle = fg;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y + 0.5);
      ctx.lineTo(W, GROUND_Y + 0.5);
      ctx.stroke();

      // Goals (frames)
      this._drawGoal(0, fg);
      this._drawGoal(1, fg);

      // Powerups
      for (const pu of this.powerups) this._drawPowerup(pu, fg, bg);

      // Balls (trail first, then balls)
      for (const b of this.balls) this._drawBallTrail(b, fg, mute);
      for (const b of this.balls) this._drawBall(b, fg, bg);

      // Players
      for (const p of this.players) this._drawPlayer(p, fg, bg, mute);

      // HUD
      this._drawHUD(fg, bg, mute);

      // Overlays (countdown / goal)
      if (this.state === 'countdown') {
        const n = Math.ceil(this.countdownT);
        const label = n <= 0 ? 'GO!' : String(n);
        this._drawBigText(label, fg);
      } else if (this.state === 'goal') {
        this._drawBigText('GOAL!', fg);
      }

      // Hit flash
      if (this.effects.hitFlash > 0) {
        ctx.fillStyle = fg;
        ctx.globalAlpha = Math.min(0.12, this.effects.hitFlash * 2);
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    }

    _drawGoal(side, fg) {
      const ctx = this.ctx;
      const x = side === 0 ? 0 : W - GOAL_W;
      const y = GROUND_Y - GOAL_H;
      // Net pattern (faint)
      ctx.save();
      ctx.strokeStyle = fg;
      ctx.globalAlpha = 0.12;
      ctx.lineWidth = 1;
      const step = 10;
      for (let i = 0; i <= GOAL_W; i += step) {
        ctx.beginPath();
        ctx.moveTo(x + i + 0.5, y + CROSSBAR_T);
        ctx.lineTo(x + i + 0.5, GROUND_Y);
        ctx.stroke();
      }
      for (let j = 0; j <= GOAL_H - CROSSBAR_T; j += step) {
        ctx.beginPath();
        ctx.moveTo(x, y + CROSSBAR_T + j + 0.5);
        ctx.lineTo(x + GOAL_W, y + CROSSBAR_T + j + 0.5);
        ctx.stroke();
      }
      ctx.restore();
      // Crossbar (solid)
      ctx.fillStyle = fg;
      ctx.fillRect(x, y, GOAL_W, CROSSBAR_T);
      // Vertical post on the field side
      const postX = side === 0 ? GOAL_W - 2 : W - GOAL_W;
      ctx.fillRect(postX, y, 2, GOAL_H);
    }

    _drawBall(b, fg, bg) {
      const ctx = this.ctx;
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      // Power-flash ring
      if (b.powerFlash > 0) {
        ctx.strokeStyle = fg;
        ctx.lineWidth = 2;
        ctx.globalAlpha = Math.min(0.6, b.powerFlash / 700);
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        b.powerFlash -= 16;
      }
      // Pentagon marking so spin is visible
      ctx.strokeStyle = bg;
      ctx.lineWidth = 1.5;
      const a = (performance.now() / 300) * (b.vx >= 0 ? 1 : -1) % (Math.PI * 2);
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const th = a + (i * Math.PI * 2) / 5;
        const px = b.x + Math.cos(th) * (b.r - 4);
        const py = b.y + Math.sin(th) * (b.r - 4);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }

    _drawBallTrail(b, fg, mute) {
      if (!b.trail || b.trail.length < 2) return;
      const ctx = this.ctx;
      const isHot = b.onFire > 0 || b.powerFlash > 0;
      if (!isHot) return;
      ctx.strokeStyle = fg;
      ctx.lineCap = 'round';
      for (let i = 1; i < b.trail.length; i++) {
        const a = i / b.trail.length;
        ctx.globalAlpha = a * 0.55;
        ctx.lineWidth = 2 + a * 4;
        ctx.beginPath();
        ctx.moveTo(b.trail[i - 1].x, b.trail[i - 1].y);
        ctx.lineTo(b.trail[i].x, b.trail[i].y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    _drawPlayer(p, fg, bg, mute) {
      const ctx = this.ctx;
      const headR = HEAD_R * (p.effects.giant > 0 ? 1.8 : 1.0);

      // Stun / ice halo
      if (p.stun > 0) {
        ctx.strokeStyle = fg;
        ctx.globalAlpha = 0.3;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, headR + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }

      // Power-ready glow (just the outline thickened)
      const powerReady = p.power >= 100;
      const powerArmed = p.armedUntil > 0;

      // Head
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(p.x, p.y, headR, 0, Math.PI * 2);
      ctx.fill();

      // Cheek dot (bg) so head reads as a "face" looking forward
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(p.x + p.facing * headR * 0.35, p.y - headR * 0.15, headR * 0.12, 0, Math.PI * 2);
      ctx.fill();

      // Player index number on the forehead
      ctx.fillStyle = bg;
      ctx.font = `600 ${Math.floor(headR * 0.7)}px var(--mono, monospace)`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(p.idx + 1), p.x - p.facing * headR * 0.15, p.y + headR * 0.25);

      // Body
      ctx.fillStyle = fg;
      ctx.fillRect(p.x - BODY_W / 2, p.y + HEAD_R * 0.55, BODY_W, BODY_H);

      // Leg (idle or kicking)
      if (p.kickActive > 0) {
        const rect = this._legRect(p);
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        // Foot ball at end
        const fx = p.facing > 0 ? rect.x + rect.w : rect.x;
        ctx.beginPath();
        ctx.arc(fx, rect.y + rect.h / 2, FOOT_R, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Idle leg: narrow vertical bar + foot
        ctx.fillRect(p.x - BODY_W * 0.2, p.y + HEAD_R * 0.55 + BODY_H, BODY_W * 0.4, LEG_H);
        ctx.beginPath();
        ctx.arc(p.x + p.facing * FOOT_R * 0.6, p.y + HEAD_R * 0.55 + BODY_H + LEG_H, FOOT_R, 0, Math.PI * 2);
        ctx.fill();
      }

      // Power-ready halo
      if (powerArmed) {
        ctx.strokeStyle = fg;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, headR + 4, 0, Math.PI * 2);
        ctx.stroke();
      } else if (powerReady) {
        ctx.strokeStyle = fg;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, headR + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Effects indicators (small marks above head)
      const effLabels = [];
      if (p.effects.fire > 0) effLabels.push('F');
      if (p.effects.ice > 0) effLabels.push('I');
      if (p.effects.giant > 0) effLabels.push('G');
      if (effLabels.length) {
        ctx.fillStyle = fg;
        ctx.font = `600 11px var(--mono, monospace)`;
        ctx.textAlign = 'center';
        ctx.fillText(effLabels.join(' '), p.x, p.y - headR - 8);
      }
    }

    _drawPowerup(pu, fg, bg) {
      const ctx = this.ctx;
      // Diamond badge
      ctx.save();
      ctx.translate(pu.x, pu.y);
      ctx.fillStyle = bg;
      ctx.strokeStyle = fg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -POWERUP_R);
      ctx.lineTo(POWERUP_R, 0);
      ctx.lineTo(0, POWERUP_R);
      ctx.lineTo(-POWERUP_R, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = fg;
      ctx.font = '700 14px var(--mono, monospace)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = pu.kind[0].toUpperCase();
      ctx.fillText(label, 0, 1);
      ctx.restore();
    }

    _drawHUD(fg, bg, mute) {
      const ctx = this.ctx;
      // Power bars
      this._drawPowerBar(18, 16, 220, 10, this.players[0].power / 100, fg, mute);
      this._drawPowerBar(W - 18 - 220, 16, 220, 10, this.players[1].power / 100, fg, mute);

      // Player labels
      ctx.fillStyle = mute;
      ctx.font = '600 11px var(--mono, monospace)';
      ctx.textAlign = 'left';
      ctx.fillText(this.mode === '1p' ? 'P1 (you)' : 'P1 (WASD + Q)', 18, 42);
      ctx.textAlign = 'right';
      ctx.fillText(this.mode === '1p' ? 'CPU' : 'P2 (Arrows + /)', W - 18, 42);

      // Score and clock (top-center)
      ctx.textAlign = 'center';
      ctx.fillStyle = fg;
      ctx.font = '700 26px var(--mono, monospace)';
      ctx.fillText(`${this.score[0]} — ${this.score[1]}`, W / 2, 34);
      ctx.fillStyle = mute;
      ctx.font = '500 12px var(--mono, monospace)';
      const seconds = Math.max(0, Math.ceil(this.matchTimeLeft));
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      ctx.fillText(`${mins}:${String(secs).padStart(2, '0')}`, W / 2, 52);
    }

    _drawPowerBar(x, y, w, h, pct, fg, mute) {
      const ctx = this.ctx;
      ctx.strokeStyle = mute;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w, h);
      const p = clamp(pct, 0, 1);
      ctx.fillStyle = fg;
      ctx.fillRect(x + 1, y + 1, (w - 1) * p, h - 1);
    }

    _drawBigText(label, fg) {
      const ctx = this.ctx;
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 96px var(--mono, monospace)';
      ctx.globalAlpha = 0.85;
      ctx.fillText(label, W / 2, H / 2 - 20);
      ctx.globalAlpha = 1;
    }

    // ---------------- Settings drawer ----------------

    buildSettings(container) {
      const modeField = document.createElement('div');
      modeField.className = 'field';
      modeField.innerHTML = `<label>Mode</label>`;
      const modeSel = document.createElement('select');
      [['1p', '1P vs CPU'], ['2p', '2P hotseat']].forEach(([v, l]) => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = l;
        modeSel.appendChild(o);
      });
      modeSel.value = this.mode;
      modeSel.addEventListener('change', () => {
        this.mode = modeSel.value;
        this.api.saveSettings('soccer', {
          mode: this.mode,
          matchSeconds: this.matchSeconds,
          goalsToWin: this.goalsToWin,
        });
        this.reset();
      });
      modeField.appendChild(modeSel);
      container.appendChild(modeField);

      const timeField = document.createElement('div');
      timeField.className = 'field';
      timeField.innerHTML = `<label>Match length</label>`;
      const timeSel = document.createElement('select');
      [60, 90, 120, 180].forEach((v) => {
        const o = document.createElement('option');
        o.value = String(v);
        o.textContent = v + 's';
        timeSel.appendChild(o);
      });
      timeSel.value = String(this.matchSeconds);
      timeSel.addEventListener('change', () => {
        this.matchSeconds = Number(timeSel.value);
        this.api.saveSettings('soccer', {
          mode: this.mode,
          matchSeconds: this.matchSeconds,
          goalsToWin: this.goalsToWin,
        });
      });
      timeField.appendChild(timeSel);
      container.appendChild(timeField);

      const winField = document.createElement('div');
      winField.className = 'field';
      winField.innerHTML = `<label>Goals to win</label>`;
      const winSel = document.createElement('select');
      [3, 5, 7, 10].forEach((v) => {
        const o = document.createElement('option');
        o.value = String(v);
        o.textContent = String(v);
        winSel.appendChild(o);
      });
      winSel.value = String(this.goalsToWin);
      winSel.addEventListener('change', () => {
        this.goalsToWin = Number(winSel.value);
        this.api.saveSettings('soccer', {
          mode: this.mode,
          matchSeconds: this.matchSeconds,
          goalsToWin: this.goalsToWin,
        });
      });
      winField.appendChild(winSel);
      container.appendChild(winField);

      const controls = document.createElement('div');
      controls.className = 'field';
      controls.innerHTML = `
        <label>Controls</label>
        <div style="font-family: var(--mono); font-size: 12px; color: var(--fg-soft); line-height: 1.6;">
          <div><b>P1</b>: A/D move · W jump · S kick · Q power shot</div>
          <div><b>P2</b>: ← → move · ↑ jump · ↓ kick · / power shot</div>
          <div style="margin-top:4px">Pick up a dropped <b>F</b> (fire), <b>I</b> (ice), <b>G</b> (giant head), or <b>M</b> (multi-ball) to boost your next kick or buff yourself.</div>
        </div>
      `;
      container.appendChild(controls);
    }
  }

  // ---------------- Factories & helpers ----------------

  function makePlayer({ idx, facing, x, keys, ai }) {
    return {
      idx,
      facing,
      x,
      y: 0,
      vx: 0,
      vy: 0,
      onGround: false,
      input: { left: false, right: false },
      keys,
      ai: !!ai,
      kickActive: 0,
      kickCooldown: 0,
      stun: 0,
      power: 0,
      armedUntil: 0,
      effects: { fire: 0, ice: 0, giant: 0 },
      bodyOffsetY: HEAD_R * 0.55,
    };
  }

  function makeBall(x, y, towardSide /* -1, 0, +1 */) {
    const vx = towardSide === 0 ? rand(-60, 60) : towardSide * rand(120, 200);
    return {
      x,
      y,
      vx,
      vy: 0,
      r: BALL_R,
      trail: [],
      onFire: 0,
      iceArmedBy: -1,
      powerFlash: 0,
      lowGrav: 0,
    };
  }

  // Keys that should never bubble to VS Code (arrow-scroll, /-to-find, etc.).
  function isGameKey(k) {
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') return true;
    if (k === ' ' || k === 'Tab') return true;
    if (k === '/' || k === '?') return true;
    return false;
  }
})();
