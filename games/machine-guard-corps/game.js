(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const W = 960;
  const H = 540;
  const LANE_Y = 352;
  const BASE_FRONT_X = 112;
  const HIVE_FRONT_X = 848;
  const PLAYER_SPAWN_X = 128;
  const ENEMY_SPAWN_X = 826;
  const PLAYER = "player";
  const ENEMY = "enemy";
  const THREAT_STEP_SECONDS = 50;
  const MAX_THREAT_LEVEL = 18;
  const FORTRESS_REGEN_DELAY = 8;
  const FORTRESS_REGEN_BASE_FACTOR = 0.00115;
  const FORTRESS_REGEN_COMMAND_FACTOR = 0.00065;
  const FORTRESS_SHIELD_HALF_RATIO = 0.5;
  const FORTRESS_SHIELD_CRITICAL_RATIO = 0.15;
  const FORTRESS_SHIELD_HALF_DURATION = 5;
  const FORTRESS_SHIELD_CRITICAL_DURATION = 10;

  const PLAYER_UNITS = {
    infantry: {
      label: "Robot Infantry",
      cost: 30,
      maxHp: 110,
      damage: 16,
      range: 38,
      cooldown: 0.82,
      speed: 35,
      heatBuild: 15,
      coolRate: 10,
      deployCooldown: 0.75,
      radius: 15,
      color: "#54d8ff",
      accent: "#dff8ff",
      projectileSpeed: 0
    },
    dog: {
      label: "Mech Dog",
      cost: 45,
      maxHp: 78,
      damage: 12,
      range: 35,
      cooldown: 0.48,
      speed: 64,
      heatBuild: 13,
      coolRate: 12,
      deployCooldown: 1.4,
      radius: 13,
      color: "#83f28f",
      accent: "#d8ffe0",
      projectileSpeed: 0
    },
    drone: {
      label: "Attack Drone",
      cost: 65,
      maxHp: 74,
      damage: 18,
      range: 165,
      cooldown: 1.06,
      speed: 38,
      heatBuild: 17,
      coolRate: 9,
      deployCooldown: 2.1,
      radius: 14,
      color: "#8cdcff",
      accent: "#ffffff",
      projectileSpeed: 430
    },
    tank: {
      label: "Big Fat Bot",
      cost: 105,
      maxHp: 430,
      damage: 12,
      range: 34,
      cooldown: 1.32,
      speed: 16,
      heatBuild: 10,
      coolRate: 8,
      deployCooldown: 4.2,
      radius: 27,
      color: "#ffcf5a",
      accent: "#fff1b1",
      projectileSpeed: 0,
      armor: 0.62
    },
    railgun: {
      label: "Railgun Walker",
      cost: 150,
      maxHp: 135,
      damage: 58,
      range: 230,
      cooldown: 2.0,
      speed: 24,
      heatBuild: 34,
      coolRate: 7,
      deployCooldown: 6.2,
      radius: 18,
      color: "#bc7cff",
      accent: "#f0d9ff",
      projectileSpeed: 640
    }
  };

  const ENEMY_UNITS = {
    grunt: {
      label: "Alien Grunt",
      cost: 26,
      maxHp: 90,
      damage: 14,
      range: 36,
      cooldown: 0.94,
      speed: 30,
      radius: 15,
      color: "#81f06b",
      accent: "#d5ffb9",
      reward: 15,
      projectileSpeed: 0,
      armor: 1
    },
    spitter: {
      label: "Acid Spitter",
      cost: 54,
      maxHp: 104,
      damage: 16,
      range: 150,
      cooldown: 1.38,
      speed: 22,
      radius: 16,
      color: "#b9ff5f",
      accent: "#7c49ff",
      reward: 23,
      projectileSpeed: 330,
      armor: 1
    },
    shieldbug: {
      label: "Shield Bug",
      cost: 82,
      maxHp: 228,
      damage: 10,
      range: 38,
      cooldown: 1.05,
      speed: 18,
      radius: 20,
      color: "#50d69b",
      accent: "#63f0ff",
      reward: 32,
      projectileSpeed: 0,
      armor: 0.78
    },
    brute: {
      label: "Alien Brute",
      cost: 124,
      maxHp: 380,
      damage: 32,
      range: 48,
      cooldown: 1.32,
      speed: 16,
      radius: 27,
      color: "#ff5b72",
      accent: "#ffd2d8",
      reward: 52,
      projectileSpeed: 0,
      armor: 0.95
    },
    sapper: {
      label: "Razor Skitter",
      cost: 42,
      maxHp: 82,
      damage: 35,
      range: 34,
      cooldown: 0.72,
      speed: 66,
      radius: 13,
      color: "#ffcf5a",
      accent: "#ff5b72",
      reward: 22,
      projectileSpeed: 0,
      armor: 1,
      baseRush: true
    },
    seer: {
      label: "Null Seer",
      cost: 96,
      maxHp: 172,
      damage: 14,
      range: 172,
      cooldown: 1.48,
      speed: 15,
      radius: 18,
      color: "#bc7cff",
      accent: "#d8ffe0",
      reward: 45,
      projectileSpeed: 300,
      armor: 0.96,
      auraRadius: 124,
      auraFactor: 0.62
    },
    boss: {
      label: "Hive Siege Core",
      cost: 285,
      maxHp: 2100,
      damage: 48,
      range: 126,
      cooldown: 1.05,
      speed: 9,
      radius: 48,
      color: "#ff3f99",
      accent: "#c8ff71",
      reward: 200,
      projectileSpeed: 350,
      armor: 0.9,
      bossTier: 1,
      bossShape: "siege"
    },
    broodmaw: {
      label: "Broodmaw Crusher",
      cost: 320,
      maxHp: 2600,
      damage: 66,
      range: 58,
      cooldown: 1.18,
      speed: 7,
      radius: 54,
      color: "#ff6a3d",
      accent: "#ffd36b",
      reward: 235,
      projectileSpeed: 0,
      armor: 0.82,
      bossTier: 2,
      bossShape: "maw"
    },
    voidtitan: {
      label: "Void Prism Tyrant",
      cost: 345,
      maxHp: 1900,
      damage: 76,
      range: 205,
      cooldown: 1.58,
      speed: 8,
      radius: 47,
      color: "#7c49ff",
      accent: "#54d8ff",
      reward: 260,
      projectileSpeed: 390,
      armor: 0.94,
      bossTier: 3,
      bossShape: "prism"
    },
    carapace: {
      label: "Carapace Sovereign",
      cost: 365,
      maxHp: 2350,
      damage: 42,
      range: 118,
      cooldown: 0.95,
      speed: 8,
      radius: 50,
      color: "#50d69b",
      accent: "#bc7cff",
      reward: 285,
      projectileSpeed: 280,
      armor: 0.78,
      auraRadius: 154,
      auraFactor: 0.7,
      bossTier: 4,
      bossShape: "crown"
    },
    dreadspire: {
      label: "Dreadspire Artillery",
      cost: 430,
      maxHp: 2850,
      damage: 92,
      range: 245,
      cooldown: 1.85,
      speed: 6,
      radius: 52,
      color: "#ffcf5a",
      accent: "#ff5b72",
      reward: 330,
      projectileSpeed: 360,
      armor: 0.84,
      splashRadius: 82,
      splashFactor: 0.42,
      bossTier: 5,
      bossShape: "artillery"
    },
    monarch: {
      label: "Star-Eater Monarch",
      cost: 490,
      maxHp: 3600,
      damage: 118,
      range: 188,
      cooldown: 1.34,
      speed: 6.5,
      radius: 58,
      color: "#dff8ff",
      accent: "#bc7cff",
      reward: 380,
      projectileSpeed: 440,
      armor: 0.72,
      auraRadius: 176,
      auraFactor: 0.66,
      splashRadius: 64,
      splashFactor: 0.36,
      bossTier: 6,
      bossShape: "monarch"
    }
  };

  const BOSS_TYPES = ["boss", "broodmaw", "voidtitan", "carapace", "dreadspire", "monarch"];

  const SUMMON_ORDER = ["infantry", "dog", "drone", "tank", "railgun"];
  const SUMMON_HOTKEYS = {
    infantry: "1",
    dog: "2",
    drone: "3",
    tank: "4",
    railgun: "5"
  };

  const SKILLS = {
    missile: {
      label: "Missile Strike",
      cooldown: 19,
      radius: 126,
      damage: 112
    },
    emp: {
      label: "EMP Pulse",
      cooldown: 26,
      duration: 3.6
    },
    repair: {
      label: "Repair Swarm",
      cooldown: 24,
      heal: 84
    }
  };
  const SKILL_HOTKEYS = {
    missile: "Q",
    emp: "W",
    repair: "E"
  };

  const UPGRADES = {
    command: {
      label: "Command Tower",
      hotkey: "Z",
      costs: [58, 112, 180, 280, 405],
      desc: "base HP, energy cap, energy output, and fortress repair"
    },
    turret: {
      label: "Base Turret",
      hotkey: "X",
      costs: [52, 105, 168, 260, 380],
      desc: "tower damage and fire rate"
    },
    coolant: {
      label: "Coolant Banks",
      hotkey: "C",
      costs: [50, 100, 160, 245, 355],
      desc: "heat control"
    },
    firmware: {
      label: "Combat Firmware",
      hotkey: "V",
      costs: [65, 120, 190, 285, 405],
      desc: "damage and armor"
    }
  };
  const ENEMY_UPGRADE_COSTS = {};
  const UPGRADE_ORDER = ["command", "turret", "coolant", "firmware"];
  const MIN_EVOLUTION_COST = 260;
  const EVOLUTION_HOTKEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
  const MOD_HOTKEY_LABEL = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "") ? "Cmd" : "Ctrl";

  const EVOLUTION_CHOICES = {
    infantry: {
      blast: {
        label: "Blast Infantry",
        short: "Blast",
        desc: "death explosion",
        cost: 290,
        stats: { maxHp: 120, damage: 18, color: "#ffcf5a", accent: "#ff5b72" },
        deathExplosion: { radius: 96, damage: 130 }
      },
      mechanic: {
        label: "Field Mechanic",
        short: "Mechanic",
        desc: "drops repair parts",
        cost: 260,
        stats: { maxHp: 100, damage: 12, cooldown: 0.95, color: "#83f28f", accent: "#d8ffe0" },
        deathPart: { heal: 105 }
      }
    },
    dog: {
      ghost: {
        label: "Ghost Dog",
        short: "Ghost",
        desc: "10s stealth",
        cost: 340,
        stats: { maxHp: 108, damage: 13, speed: 70, color: "#8cdcff", accent: "#ffffff" },
        stealthDuration: 10
      },
      roller: {
        label: "Razor Roller",
        short: "Roller",
        desc: "rolling lane damage",
        cost: 340,
        stats: { maxHp: 112, damage: 0, speed: 132, radius: 15, color: "#ffcf5a", accent: "#ff5b72", armor: 0.9 },
        rolling: { damage: 38, hitCooldown: 0.42, hiveDamage: 135 }
      }
    },
    drone: {
      highwing: {
        label: "Highwing Drone",
        short: "Highwing",
        desc: "air-only target",
        cost: 360,
        stats: { maxHp: 82, damage: 20, range: 182, speed: 42, color: "#54d8ff", accent: "#dff8ff" },
        flying: true
      },
      arcvolt: {
        label: "Arc Volt Caster",
        short: "Arc Volt",
        desc: "chains lightning",
        cost: 430,
        stats: { maxHp: 92, damage: 24, range: 174, cooldown: 1.32, projectileSpeed: 0, color: "#bc7cff", accent: "#54d8ff" },
        chain: { maxTargets: 4, range: 126, falloff: 0.68 }
      }
    },
    tank: {
      aegis: {
        label: "Aegis Fat Bot",
        short: "Aegis",
        desc: "reflect shield",
        cost: 460,
        stats: { maxHp: 455, damage: 10, armor: 0.6, color: "#ffcf5a", accent: "#83f28f" },
        shield: { hp: 230, reflectFactor: 0.7 }
      },
      pulse: {
        label: "Pulse Fat Bot",
        short: "Pulse",
        desc: "EMP shock aura",
        cost: 480,
        stats: { maxHp: 440, damage: 10, armor: 0.62, color: "#54d8ff", accent: "#bc7cff" },
        pulse: { radius: 108, damage: 18, cooldown: 2, stunChance: 0.36, stunDuration: 1 }
      }
    },
    railgun: {
      linebreaker: {
        label: "Linebreaker Walker",
        short: "Linebreaker",
        desc: "fixed beam pierce",
        cost: 520,
        stats: { maxHp: 140, damage: 78, range: 300, projectileSpeed: 0, cooldown: 2.12, color: "#bc7cff", accent: "#ffffff" },
        beam: { width: 28, fixedRange: 300 }
      },
      skyfall: {
        label: "Skyfall Cannon",
        short: "Skyfall",
        desc: "long-range orbital hit",
        cost: 640,
        stats: { maxHp: 128, damage: 109, range: 460, projectileSpeed: 0, cooldown: 3.85, heatBuild: 48, color: "#f0d9ff", accent: "#ffcf5a" },
        skyStrike: { radius: 66, splashFactor: 0.42 }
      }
    }
  };

  const EVOLUTION_HOTKEY_BINDINGS = SUMMON_ORDER.flatMap((type) =>
    Object.keys(EVOLUTION_CHOICES[type]).map((choice) => ({ type, choice }))
  );

  const TOWER_WEAPON = {
    player: { damage: 22, cooldown: 1.25, range: 260, color: "#54d8ff" },
    enemy: { damage: 25, cooldown: 1.08, range: 235, color: "#ff5b72" }
  };

  const UI = {
    energy: document.getElementById("energyText"),
    enemyEnergy: document.getElementById("enemyEnergyText"),
    scrap: document.getElementById("scrapText"),
    base: document.getElementById("baseText"),
    hive: document.getElementById("hiveText"),
    wave: document.getElementById("waveText"),
    status: document.getElementById("statusText"),
    summonButtons: document.getElementById("summonButtons"),
    skillButtons: document.getElementById("skillButtons"),
    upgradeButtons: document.getElementById("upgradeButtons"),
    pauseButton: document.getElementById("pauseButton"),
    restartButton: document.getElementById("restartButton"),
    startButton: document.getElementById("startButton"),
    tutorialOverlay: document.getElementById("tutorialOverlay"),
    endOverlay: document.getElementById("endOverlay"),
    endTitle: document.getElementById("endTitle"),
    endBody: document.getElementById("endBody"),
    endRestartButton: document.getElementById("endRestartButton"),
    stageWrap: document.getElementById("stageWrap")
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const rand = (min, max) => min + Math.random() * (max - min);
  const distance = (a, b, c, d) => Math.hypot(a - c, b - d);
  const fmt = (n) => Math.max(0, Math.ceil(n)).toString();
  const evolutionHotkeyLabel = (index) => `${MOD_HOTKEY_LABEL}+${EVOLUTION_HOTKEYS[index]}`;

  class SoundEngine {
    constructor() {
      this.audioCtx = null;
      this.enabled = true;
      this.lastHit = 0;
    }

    unlock() {
      if (!this.enabled) return;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) {
          this.enabled = false;
          return;
        }
        if (!this.audioCtx) this.audioCtx = new Ctx();
        if (this.audioCtx.state === "suspended") this.audioCtx.resume();
      } catch (err) {
        this.enabled = false;
      }
    }

    tone(freq, duration, type, gain, endFreq) {
      if (!this.audioCtx || !this.enabled) return;
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const vol = this.audioCtx.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, now);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), now + duration);
      vol.gain.setValueAtTime(0.0001, now);
      vol.gain.exponentialRampToValueAtTime(gain, now + 0.012);
      vol.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(vol).connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.03);
    }

    noise(duration, gain, filterFreq) {
      if (!this.audioCtx || !this.enabled) return;
      const now = this.audioCtx.currentTime;
      const length = Math.max(1, Math.floor(this.audioCtx.sampleRate * duration));
      const buffer = this.audioCtx.createBuffer(1, length, this.audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = rand(-1, 1) * (1 - i / length);
      const src = this.audioCtx.createBufferSource();
      const filter = this.audioCtx.createBiquadFilter();
      const vol = this.audioCtx.createGain();
      src.buffer = buffer;
      filter.type = "lowpass";
      filter.frequency.value = filterFreq || 900;
      vol.gain.setValueAtTime(gain, now);
      vol.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      src.connect(filter).connect(vol).connect(this.audioCtx.destination);
      src.start(now);
    }

    summon() {
      this.tone(320, 0.08, "square", 0.05, 520);
      this.tone(650, 0.12, "triangle", 0.03, 820);
    }

    hit() {
      if (!this.audioCtx || this.audioCtx.currentTime - this.lastHit < 0.045) return;
      this.lastHit = this.audioCtx.currentTime;
      this.tone(rand(140, 260), 0.05, "sawtooth", 0.025, rand(80, 140));
    }

    shot() {
      this.tone(rand(480, 760), 0.05, "square", 0.025, rand(260, 360));
    }

    explosion() {
      this.noise(0.38, 0.12, 700);
      this.tone(90, 0.25, "sawtooth", 0.06, 42);
    }

    emp() {
      this.tone(180, 0.16, "sine", 0.05, 760);
      this.tone(760, 0.2, "triangle", 0.035, 160);
    }

    repair() {
      this.tone(520, 0.08, "sine", 0.04, 740);
      this.tone(760, 0.12, "sine", 0.025, 980);
    }

    upgrade() {
      this.tone(260, 0.07, "square", 0.04, 420);
      setTimeout(() => this.tone(520, 0.08, "triangle", 0.035, 860), 60);
      setTimeout(() => this.tone(780, 0.12, "sine", 0.025, 1040), 120);
    }

    finish(win) {
      if (win) {
        this.tone(360, 0.12, "triangle", 0.05, 560);
        setTimeout(() => this.tone(520, 0.16, "triangle", 0.05, 880), 100);
      } else {
        this.tone(220, 0.18, "sawtooth", 0.06, 130);
        setTimeout(() => this.tone(120, 0.28, "sawtooth", 0.05, 60), 140);
      }
    }
  }

  class FloatingText {
    constructor(x, y, text, color, size) {
      this.x = x;
      this.y = y;
      this.text = text;
      this.color = color || "#ffffff";
      this.size = size || 16;
      this.life = 0.9;
      this.maxLife = this.life;
      this.vx = rand(-12, 12);
      this.vy = rand(-44, -28);
    }

    update(dt) {
      this.life -= dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += 16 * dt;
    }

    draw(ctx) {
      const alpha = clamp(this.life / this.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.color;
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 3;
      ctx.font = `800 ${this.size}px Trebuchet MS, Arial`;
      ctx.textAlign = "center";
      ctx.strokeText(this.text, this.x, this.y);
      ctx.fillText(this.text, this.x, this.y);
      ctx.restore();
    }
  }

  class Particle {
    constructor(x, y, vx, vy, color, radius, life, gravity) {
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.color = color;
      this.radius = radius;
      this.life = life;
      this.maxLife = life;
      this.gravity = gravity || 0;
    }

    update(dt) {
      this.life -= dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += this.gravity * dt;
    }

    draw(ctx) {
      const alpha = clamp(this.life / this.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, Math.max(0, this.radius * (0.4 + alpha * 0.6)), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  class VisualEffect {
    constructor(type, options) {
      this.type = type;
      this.options = options;
      this.life = options.life || 0.28;
      this.maxLife = this.life;
    }

    update(dt) {
      this.life -= dt;
    }

    draw(ctx) {
      const alpha = clamp(this.life / this.maxLife, 0, 1);
      const o = this.options;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (this.type === "beam") {
        ctx.strokeStyle = o.color;
        ctx.lineWidth = o.width || 6;
        ctx.shadowColor = o.color;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(o.x1, o.y1);
        ctx.lineTo(o.x2, o.y2);
        ctx.stroke();
        ctx.globalAlpha = alpha * 0.35;
        ctx.lineWidth = (o.width || 6) * 2.4;
        ctx.stroke();
      } else if (this.type === "sky") {
        ctx.strokeStyle = o.color;
        ctx.lineWidth = 7;
        ctx.shadowColor = o.color;
        ctx.shadowBlur = 22;
        ctx.beginPath();
        ctx.moveTo(o.x - 10, 24);
        ctx.lineTo(o.x, o.y);
        ctx.stroke();
        ctx.fillStyle = o.color;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.radius * (1.25 - alpha * 0.35), 0, Math.PI * 2);
        ctx.fill();
      } else if (this.type === "pulse") {
        ctx.strokeStyle = o.color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.radius * (1.1 - alpha * 0.1), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  class RepairPart {
    constructor(x, y, heal) {
      this.x = x;
      this.y = y;
      this.heal = heal;
      this.radius = 12;
      this.life = 9;
      this.dead = false;
      this.spin = rand(0, Math.PI * 2);
    }

    update(dt, game) {
      this.life -= dt;
      this.spin += dt * 4;
      if (this.life <= 0) this.dead = true;
      for (const unit of game.players) {
        if (unit.dead) continue;
        if (distance(this.x, this.y, unit.x, unit.y) <= this.radius + unit.radius + 4) {
          unit.heal(this.heal);
          unit.heat = Math.max(0, unit.heat - 8);
          game.addSparks(this.x, this.y, "#83f28f", 12, 72);
          game.floatingTexts.push(new FloatingText(this.x, this.y - 20, "PARTS", "#83f28f", 13));
          this.dead = true;
          return;
        }
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.spin);
      ctx.globalAlpha = clamp(this.life / 9, 0.35, 1);
      ctx.fillStyle = "#83f28f";
      ctx.strokeStyle = "#d8ffe0";
      ctx.lineWidth = 2;
      ctx.fillRect(-8, -5, 16, 10);
      ctx.strokeRect(-8, -5, 16, 10);
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(0, 11);
      ctx.moveTo(-11, 0);
      ctx.lineTo(11, 0);
      ctx.stroke();
      ctx.restore();
    }
  }

  class Projectile {
    constructor(game, source, target, damage, speed, color, radius) {
      this.game = game;
      this.source = source;
      this.target = target;
      this.damage = damage;
      this.speed = speed;
      this.color = color;
      this.radius = radius || 4;
      this.x = source.x + source.dir * (source.radius + 8);
      this.y = source.y - source.radius * 0.25;
      this.lastTargetX = target.x;
      this.lastTargetY = target.y;
      this.dead = false;
      this.trail = [];
      this.splashRadius = source.splashRadius || source.stats?.splashRadius || 0;
      this.splashFactor = source.splashFactor || source.stats?.splashFactor || 0;
    }

    update(dt) {
      if (this.dead) return;
      if (this.target && !this.target.dead) {
        this.lastTargetX = this.target.x;
        this.lastTargetY = this.target.y - (this.target.radius || 0) * 0.12;
      }
      const dx = this.lastTargetX - this.x;
      const dy = this.lastTargetY - this.y;
      const dist = Math.hypot(dx, dy) || 1;
      const step = this.speed * dt;
      this.trail.push([this.x, this.y]);
      if (this.trail.length > 7) this.trail.shift();
      if (dist <= step + this.radius + 3) {
        this.x = this.lastTargetX;
        this.y = this.lastTargetY;
        this.hit();
        return;
      }
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }

    hit() {
      if (this.dead) return;
      this.dead = true;
      this.game.applyDamage(this.target, this.damage, this.source, { projectile: this });
      if (this.splashRadius > 0) {
        const foes = this.source.side === PLAYER ? this.game.enemies : this.game.players;
        for (const foe of foes) {
          if (foe.dead || foe === this.target) continue;
          if (distance(this.x, this.y, foe.x, foe.y) <= this.splashRadius + foe.radius) {
            this.game.applyDamage(foe, this.damage * this.splashFactor, this.source, { projectile: this, splash: true });
          }
        }
      }
      this.game.addSparks(this.x, this.y, this.color, 7, 80);
      this.game.sound.hit();
    }

    draw(ctx) {
      ctx.save();
      ctx.lineCap = "round";
      for (let i = 0; i < this.trail.length; i++) {
        const p = this.trail[i];
        ctx.globalAlpha = (i + 1) / this.trail.length * 0.35;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.radius * 1.2;
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(this.x, this.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  class Unit {
    constructor(game, side, type, x, y, options = {}) {
      this.game = game;
      this.side = side;
      this.type = type;
      this.variant = options.variant || "normal";
      this.evolution = side === PLAYER ? game.getEvolutionFor(type) : null;
      this.evolutionDef = this.evolution ? EVOLUTION_CHOICES[type][this.evolution] : null;
      this.stats = side === PLAYER ? game.getPlayerUnitStats(type) : ENEMY_UNITS[type];
      this.isBoss = side === ENEMY && !!this.stats.bossTier;
      this.elite = side === ENEMY && this.variant === "elite" && !this.isBoss;
      this.label = this.elite ? `Elite ${this.stats.label}` : this.stats.label;
      this.x = x;
      this.y = y;
      this.baseY = y;
      this.dir = side === PLAYER ? 1 : -1;
      const hpMult = this.elite ? 1.55 : 1;
      const damageMult = this.elite ? 1.25 : 1;
      const speedMult = this.elite ? 1.06 : 1;
      const radiusMult = this.elite ? 1.12 : 1;
      const baseMaxHp = side === PLAYER ? game.getMachineMaxHp(this.stats.maxHp) : game.getEnemyUnitMaxHp(this.stats.maxHp);
      this.maxHp = Math.round(baseMaxHp * hpMult);
      this.hp = this.maxHp;
      const baseDamage = side === PLAYER ? this.stats.damage : game.getEnemyUnitDamage(this.stats.damage);
      this.damage = Math.round(baseDamage * damageMult);
      this.range = this.stats.range;
      this.cooldown = this.stats.cooldown;
      this.speed = this.stats.speed * speedMult;
      this.radius = this.stats.radius * radiusMult;
      this.armor = this.stats.armor || 1;
      this.reward = Math.round((this.stats.reward || 0) * (this.elite ? 1.65 : 1));
      this.attackTimer = rand(0, this.cooldown * 0.45);
      this.stealthTimer = this.evolutionDef?.stealthDuration || 0;
      this.shieldMax = this.evolutionDef?.shield?.hp || 0;
      this.shieldHp = this.shieldMax;
      this.pulseTimer = this.evolutionDef?.pulse?.cooldown || 0;
      this.rollingHits = new Map();
      this.heat = 0;
      this.shutdownTimer = 0;
      this.slowTimer = 0;
      this.stunTimer = 0;
      this.dead = false;
      this.flash = 0;
      this.shieldFlash = 0;
      this.walkTime = rand(0, Math.PI * 2);
    }

    get isMachine() {
      return this.side === PLAYER;
    }

    isStealthed() {
      return this.isMachine && this.stealthTimer > 0;
    }

    update(dt) {
      if (this.dead) return;
      this.walkTime += dt * (this.speed / 10);
      this.attackTimer -= dt;
      this.stealthTimer = Math.max(0, this.stealthTimer - dt);
      this.flash = Math.max(0, this.flash - dt);
      this.shieldFlash = Math.max(0, this.shieldFlash - dt);
      this.slowTimer = Math.max(0, this.slowTimer - dt);
      this.stunTimer = Math.max(0, this.stunTimer - dt);
      if (this.stunTimer > 0) return;

      if (this.isMachine) {
        const shutCooling = this.shutdownTimer > 0 ? 2.35 : 1;
        this.heat = Math.max(0, this.heat - this.game.getMachineCoolRate(this.stats.coolRate) * shutCooling * dt);
        if (this.shutdownTimer > 0) {
          this.shutdownTimer = Math.max(0, this.shutdownTimer - dt);
          if (Math.random() < dt * 7) {
            this.game.addSparks(this.x, this.y - this.radius, "#ffcf5a", 1, 45);
          }
          return;
        }
      }

      if (this.evolutionDef?.pulse) this.updatePulse(dt);
      if (this.evolutionDef?.rolling) {
        this.updateRolling(dt);
        return;
      }

      const target = this.game.findTargetFor(this);
      if (target && this.inRange(target)) {
        if (this.attackTimer <= 0) {
          this.attack(target);
          this.attackTimer = this.cooldown;
        }
        return;
      }

      const slowFactor = this.side === ENEMY && this.slowTimer > 0 ? 0.48 : 1;
      this.x += this.dir * this.speed * slowFactor * dt;
      if (this.side === PLAYER) this.x = Math.min(this.x, HIVE_FRONT_X - 8);
      else this.x = Math.max(this.x, BASE_FRONT_X + 8);
    }

    updateRolling(dt) {
      const roll = this.evolutionDef.rolling;
      this.x += this.dir * this.speed * dt;
      for (const enemy of this.game.enemies) {
        if (enemy.dead) continue;
        const readyAt = this.rollingHits.get(enemy) || 0;
        if (this.game.time < readyAt) continue;
        if (distance(this.x, this.y, enemy.x, enemy.y) <= this.radius + enemy.radius + 8) {
          enemy.takeDamage(roll.damage, this);
          this.rollingHits.set(enemy, this.game.time + roll.hitCooldown);
          this.game.addSparks(enemy.x, enemy.y - enemy.radius * 0.3, this.stats.accent, 9, 95);
        }
      }
      if (this.x >= HIVE_FRONT_X - 10) {
        this.game.damageHive(roll.hiveDamage, this);
        this.dead = true;
        this.game.addExplosion(this.x, this.y - 8, 48);
      }
    }

    updatePulse(dt) {
      this.pulseTimer -= dt;
      if (this.pulseTimer > 0) return;
      const pulse = this.evolutionDef.pulse;
      this.pulseTimer = pulse.cooldown;
      this.game.effects.push(new VisualEffect("pulse", {
        x: this.x,
        y: this.y - 6,
        radius: pulse.radius,
        color: this.stats.accent,
        life: 0.34
      }));
      for (const enemy of this.game.enemies) {
        if (enemy.dead) continue;
        if (distance(this.x, this.y, enemy.x, enemy.y) <= pulse.radius + enemy.radius) {
          enemy.takeDamage(pulse.damage, this);
          if (Math.random() < pulse.stunChance) {
            enemy.stunTimer = Math.max(enemy.stunTimer, pulse.stunDuration);
            this.game.floatingTexts.push(new FloatingText(enemy.x, enemy.y - enemy.radius - 20, "STUN", "#54d8ff", 13));
          }
        }
      }
      this.game.sound.emp();
    }

    inRange(target) {
      const forward = this.side === PLAYER ? target.x - this.x : this.x - target.x;
      return forward <= this.getRange() + (target.radius || 20) && forward > -this.radius - (target.radius || 20);
    }

    attack(target) {
      const attackDamage = this.isMachine ? this.game.getMachineDamage(this.stats.damage) : this.damage;
      if (this.isMachine) {
        this.heat = Math.min(100, this.heat + this.game.getMachineHeatBuild(this.stats.heatBuild));
      }

      if (this.evolutionDef?.chain) {
        this.game.arcChain(this, target, attackDamage, this.evolutionDef.chain);
        this.game.sound.emp();
      } else if (this.evolutionDef?.beam) {
        this.game.lineBeam(this, attackDamage, this.evolutionDef.beam);
        this.game.sound.shot();
      } else if (this.evolutionDef?.skyStrike) {
        this.game.skyStrike(target, attackDamage, this, this.evolutionDef.skyStrike);
        this.game.sound.explosion();
      } else if (this.stats.projectileSpeed > 0) {
        const color = this.side === PLAYER ? this.stats.accent : this.stats.color;
        this.game.projectiles.push(new Projectile(this.game, this, target, attackDamage, this.stats.projectileSpeed, color, this.type === "railgun" ? 5 : 4));
        this.game.sound.shot();
      } else {
        this.game.applyDamage(target, attackDamage, this);
        this.game.addSparks(
          this.x + this.dir * (this.radius + 8),
          this.y - 4,
          this.side === PLAYER ? this.stats.color : this.stats.accent,
          6,
          76
        );
        this.game.sound.hit();
      }

      if (this.isMachine && this.heat >= 100) {
        this.shutdownTimer = 2;
        this.heat = 100;
        this.game.floatingTexts.push(new FloatingText(this.x, this.y - this.radius - 18, "SHUTDOWN", "#ffcf5a", 13));
        this.game.addSparks(this.x, this.y - this.radius, "#ffcf5a", 16, 95);
      }
    }

    getRange() {
      if (this.evolutionDef?.beam?.fixedRange) return this.evolutionDef.beam.fixedRange;
      return this.isMachine ? this.game.getMachineRange(this.stats.range) : this.range;
    }

    takeDamage(amount, source, context = {}) {
      if (this.dead) return;
      if (this.evolutionDef?.flying && context.splash) {
        this.game.floatingTexts.push(new FloatingText(this.x, this.y - this.radius - 12, "EVADE", "#54d8ff", 13));
        return;
      }
      if (this.evolutionDef?.flying && source && source.side === ENEMY && !context.projectile && source.stats && (source.stats.projectileSpeed || 0) <= 0 && !source.stats.bossTier) {
        return;
      }

      if (this.shieldHp > 0 && source && source.side === ENEMY && context.projectile) {
        const absorbed = Math.min(this.shieldHp, amount);
        this.shieldHp -= absorbed;
        amount -= absorbed;
        this.shieldFlash = 0.24;
        this.game.floatingTexts.push(new FloatingText(this.x, this.y - this.radius - 24, "REFLECT", "#83f28f", 13));
        this.game.addSparks(this.x, this.y - this.radius * 0.3, "#83f28f", 12, 110);
        const reflected = source instanceof Unit ? source : this.game.findNearestEnemy(this.x, this.y, 260);
        if (reflected && !reflected.dead) {
          reflected.takeDamage(absorbed * (this.evolutionDef.shield.reflectFactor || 0.65), this);
        }
        if (amount <= 0) return;
      }

      const shieldFactor = this.side === ENEMY ? this.game.getEnemyDamageFactor(this) : 1;
      if (shieldFactor < 1) this.shieldFlash = 0.18;
      const finalDamage = Math.max(1, Math.round(amount * this.armor * shieldFactor));
      this.hp -= finalDamage;
      this.flash = 0.08;
      this.game.floatingTexts.push(new FloatingText(this.x, this.y - this.radius - 8, `-${finalDamage}`, source && source.side === PLAYER ? "#dff8ff" : "#ff9aaa", 15));
      if (this.hp <= 0) {
        this.dead = true;
        this.game.onUnitDeath(this);
      }
    }

    heal(amount) {
      if (this.dead || this.hp >= this.maxHp) return;
      const before = this.hp;
      this.hp = Math.min(this.maxHp, this.hp + amount);
      const healed = Math.round(this.hp - before);
      if (healed > 0) {
        this.game.floatingTexts.push(new FloatingText(this.x, this.y - this.radius - 10, `+${healed}`, "#83f28f", 15));
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      const bob = Math.sin(this.walkTime) * 1.5;
      ctx.translate(0, bob);
      if (this.side === ENEMY) ctx.scale(-1, 1);
      if (this.isStealthed()) ctx.globalAlpha = 0.42;

      const s = this.stats;
      if (this.side === PLAYER) {
        if (this.type === "infantry") drawInfantry(ctx, s, this);
        if (this.type === "dog") {
          if (this.evolution === "roller") drawRoller(ctx, s, this);
          else drawDog(ctx, s, this);
        }
        if (this.type === "drone") drawDrone(ctx, s, this);
        if (this.type === "tank") drawTank(ctx, s, this);
        if (this.type === "railgun") drawRailgun(ctx, s, this);
      } else {
        if (this.type === "grunt") drawGrunt(ctx, s, this);
        if (this.type === "spitter") drawSpitter(ctx, s, this);
        if (this.type === "shieldbug") drawShieldBug(ctx, s, this);
        if (this.type === "brute") drawBrute(ctx, s, this);
        if (this.type === "sapper") drawSapper(ctx, s, this);
        if (this.type === "seer") drawSeer(ctx, s, this);
        if (this.isBoss) drawBoss(ctx, s, this);
      }
      ctx.globalAlpha = 1;

      if (this.evolution) drawEvolutionMark(ctx, this);

      if (this.elite) {
        ctx.strokeStyle = "#ffcf5a";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(0, -this.radius * 0.15, this.radius + 9 + Math.sin(this.game.time * 7) * 1.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (this.flash > 0) {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(0, -this.radius * 0.2, this.radius + 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
          }

      if (this.shieldFlash > 0) {
        ctx.globalAlpha = 0.72;
        ctx.strokeStyle = this.shieldHp > 0 ? "#83f28f" : "#bc7cff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, -this.radius * 0.15, this.radius + 11, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      if (this.side === ENEMY && this.slowTimer > 0) {
        ctx.strokeStyle = "rgba(84,216,255,0.7)";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(0, -this.radius * 0.15, this.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (this.stunTimer > 0) {
        ctx.strokeStyle = "#54d8ff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, -this.radius * 0.15, this.radius + 13, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (this.shutdownTimer > 0) {
        ctx.strokeStyle = "#ffcf5a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -this.radius * 0.15, this.radius + 7 + Math.sin(this.game.time * 16) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
      this.drawBars(ctx);
    }

    drawBars(ctx) {
      const w = Math.max(32, this.radius * 2.15);
      const x = this.x - w / 2;
      const hpY = this.y - this.radius - 25;
      drawBar(ctx, x, hpY, w, 5, this.hp / this.maxHp, this.side === PLAYER ? "#83f28f" : "#ff5b72", "rgba(0,0,0,0.65)");
      if (this.isMachine) {
        const heatColor = this.heat >= 85 ? "#ff5b72" : this.heat >= 55 ? "#ffcf5a" : "#54d8ff";
        drawBar(ctx, x, hpY + 7, w, 4, this.heat / 100, heatColor, "rgba(0,0,0,0.55)");
        if (this.shieldMax > 0) {
          drawBar(ctx, x, hpY + 13, w, 4, this.shieldHp / this.shieldMax, "#83f28f", "rgba(0,0,0,0.55)");
        }
      }
    }
  }

  function drawBar(ctx, x, y, w, h, ratio, color, bg) {
    ctx.save();
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * clamp(ratio, 0, 1), h);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  function drawInfantry(ctx, s) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(-13, 9, 27, 5);
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 2;
    ctx.fillRect(-9, -20, 18, 19);
    ctx.strokeRect(-9, -20, 18, 19);
    ctx.fillStyle = "#bff4ff";
    ctx.fillRect(-7, -31, 14, 10);
    ctx.fillStyle = "#061019";
    ctx.fillRect(1, -28, 5, 3);
    ctx.strokeStyle = s.accent;
    ctx.beginPath();
    ctx.moveTo(8, -10);
    ctx.lineTo(21, -14);
    ctx.lineTo(24, -8);
    ctx.stroke();
    ctx.strokeStyle = s.color;
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(-9, 11);
    ctx.moveTo(6, 0);
    ctx.lineTo(10, 11);
    ctx.stroke();
  }

  function drawDog(ctx, s) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(-21, 9, 42, 5);
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-20, -13, 30, 15, 5);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(9, -11);
    ctx.lineTo(22, -7);
    ctx.lineTo(10, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = s.accent;
    for (let i = -14; i <= 8; i += 7) {
      ctx.beginPath();
      ctx.moveTo(i, 1);
      ctx.lineTo(i - 3, 11);
      ctx.moveTo(i + 3, 1);
      ctx.lineTo(i + 6, 11);
      ctx.stroke();
    }
    ctx.fillStyle = "#061019";
    ctx.fillRect(15, -8, 4, 3);
  }

  function drawRoller(ctx, s, unit) {
    const spin = unit.game.time * 18;
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.fillRect(-18, 13, 38, 5);
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -5, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#fff1b1";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = spin + i * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(Math.cos(a) * 15, -5 + Math.sin(a) * 15);
      ctx.stroke();
    }
    ctx.fillStyle = "#2d0b25";
    ctx.beginPath();
    ctx.arc(0, -5, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEvolutionMark(ctx, unit) {
    const s = unit.stats;
    ctx.save();
    ctx.strokeStyle = s.accent;
    ctx.fillStyle = s.accent;
    ctx.lineWidth = 2;

    if (unit.evolution === "blast") {
      ctx.beginPath();
      ctx.arc(0, -unit.radius - 6, 5 + Math.sin(unit.game.time * 10) * 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (unit.evolution === "mechanic") {
      ctx.beginPath();
      ctx.moveTo(-8, -unit.radius - 7);
      ctx.lineTo(8, -unit.radius - 7);
      ctx.moveTo(0, -unit.radius - 15);
      ctx.lineTo(0, -unit.radius + 1);
      ctx.stroke();
    } else if (unit.evolution === "ghost") {
      ctx.globalAlpha = 0.65;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(0, -unit.radius * 0.25, unit.radius + 10, 0, Math.PI * 2);
      ctx.stroke();
    } else if (unit.evolution === "highwing") {
      ctx.beginPath();
      ctx.moveTo(-25, -27);
      ctx.lineTo(-40, -36);
      ctx.moveTo(25, -27);
      ctx.lineTo(40, -36);
      ctx.stroke();
    } else if (unit.evolution === "arcvolt") {
      ctx.beginPath();
      ctx.moveTo(-4, -unit.radius - 14);
      ctx.lineTo(4, -unit.radius - 7);
      ctx.lineTo(-2, -unit.radius - 1);
      ctx.lineTo(7, -unit.radius + 6);
      ctx.stroke();
    } else if (unit.evolution === "aegis" && unit.shieldHp > 0) {
      ctx.globalAlpha = 0.36;
      ctx.beginPath();
      ctx.arc(0, -8, unit.radius + 18, 0, Math.PI * 2);
      ctx.stroke();
    } else if (unit.evolution === "pulse") {
      ctx.globalAlpha = 0.28 + Math.sin(unit.game.time * 5) * 0.08;
      ctx.beginPath();
      ctx.arc(0, -6, unit.radius + 22, 0, Math.PI * 2);
      ctx.stroke();
    } else if (unit.evolution === "linebreaker") {
      ctx.beginPath();
      ctx.moveTo(12, -24);
      ctx.lineTo(42, -24);
      ctx.stroke();
    } else if (unit.evolution === "skyfall") {
      ctx.beginPath();
      ctx.moveTo(17, -32);
      ctx.lineTo(31, -48);
      ctx.lineTo(42, -33);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawDrone(ctx, s, unit) {
    const hover = Math.sin(unit.game.time * 5 + unit.walkTime) * 3;
    ctx.translate(0, -23 + hover);
    ctx.strokeStyle = "rgba(140,220,255,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(-16, 0, 10, 4, 0, 0, Math.PI * 2);
    ctx.ellipse(16, 0, 10, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(16, 0);
    ctx.lineTo(0, 13);
    ctx.lineTo(-16, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#061019";
    ctx.fillRect(4, -3, 7, 6);
  }

  function drawTank(ctx, s) {
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.beginPath();
    ctx.ellipse(0, 14, 34, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-24, -32, 46, 42, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#533b11";
    ctx.beginPath();
    ctx.roundRect(-30, -18, 13, 31, 5);
    ctx.roundRect(17, -18, 13, 31, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#fff1b1";
    ctx.beginPath();
    ctx.roundRect(-13, -22, 20, 12, 4);
    ctx.fill();

    ctx.strokeStyle = "#fff1b1";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(12, -15);
    ctx.lineTo(26, -9);
    ctx.moveTo(-21, -12);
    ctx.lineTo(-34, -8);
    ctx.stroke();

    ctx.fillStyle = "#061019";
    ctx.beginPath();
    ctx.arc(-2, -15, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawRailgun(ctx, s) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(-16, 11, 36, 5);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-9, 2);
    ctx.lineTo(-15, 15);
    ctx.moveTo(8, 2);
    ctx.lineTo(15, 15);
    ctx.stroke();
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 2;
    ctx.fillRect(-9, -25, 18, 28);
    ctx.strokeRect(-9, -25, 18, 28);
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(7, -23);
    ctx.lineTo(35, -27);
    ctx.moveTo(7, -17);
    ctx.lineTo(35, -21);
    ctx.stroke();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(17, -25);
    ctx.lineTo(28, -22);
    ctx.stroke();
  }

  function drawGrunt(ctx, s) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(-17, 9, 34, 5);
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -9, 14, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#1b0813";
    ctx.beginPath();
    ctx.arc(6, -14, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = s.accent;
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(24, -5);
    ctx.lineTo(14, 4);
    ctx.moveTo(-8, 2);
    ctx.lineTo(-18, 10);
    ctx.stroke();
  }

  function drawSpitter(ctx, s) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(-18, 10, 38, 5);
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(-3, -8, 17, 14, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = s.accent;
    ctx.beginPath();
    ctx.moveTo(8, -12);
    ctx.lineTo(25, -8);
    ctx.lineTo(8, -3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#efffd0";
    ctx.beginPath();
    ctx.arc(14, -8, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawShieldBug(ctx, s) {
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.fillRect(-23, 11, 46, 6);
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -8, 22, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(99,240,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(7, -10, 16, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#eaffff";
    ctx.beginPath();
    ctx.moveTo(-13, -4);
    ctx.lineTo(16, -16);
    ctx.stroke();
  }

  function drawBrute(ctx, s) {
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.fillRect(-28, 15, 58, 7);
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, -13, 25, 31, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#331018";
    ctx.beginPath();
    ctx.arc(10, -22, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(14, -2);
    ctx.lineTo(34, 10);
    ctx.moveTo(-14, -2);
    ctx.lineTo(-30, 10);
    ctx.stroke();
  }

  function drawSapper(ctx, s, unit) {
    const twitch = Math.sin(unit.game.time * 14 + unit.walkTime) * 2;
    ctx.fillStyle = "rgba(0,0,0,0.36)";
    ctx.fillRect(-18, 10, 40, 5);
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, -5);
    ctx.lineTo(-2, -18);
    ctx.lineTo(16, -12 + twitch);
    ctx.lineTo(22, 0);
    ctx.lineTo(5, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#fff1b1";
    ctx.beginPath();
    ctx.moveTo(12, -10);
    ctx.lineTo(29, -16);
    ctx.moveTo(16, -4);
    ctx.lineTo(32, -1);
    ctx.moveTo(-8, 2);
    ctx.lineTo(-21, 11);
    ctx.stroke();
    ctx.fillStyle = "#2d0b25";
    ctx.beginPath();
    ctx.arc(9, -8, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSeer(ctx, s, unit) {
    const aura = s.auraRadius || 110;
    ctx.save();
    ctx.globalAlpha = 0.12 + Math.sin(unit.game.time * 4) * 0.035;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.arc(0, -8, aura, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    const hover = Math.sin(unit.game.time * 5 + unit.walkTime) * 4;
    ctx.translate(0, -18 + hover);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(0, 30, 25, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -2, 21, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#061019";
    ctx.beginPath();
    ctx.arc(7, -3, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = s.accent;
    ctx.beginPath();
    ctx.arc(9, -3, 4 + Math.sin(unit.game.time * 8) * 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(216,255,224,0.82)";
    ctx.beginPath();
    ctx.moveTo(-17, -11);
    ctx.lineTo(-28, -25);
    ctx.moveTo(-14, 8);
    ctx.lineTo(-27, 21);
    ctx.stroke();
  }

  function drawBoss(ctx, s, unit) {
    const pulse = 1 + Math.sin(unit.game.time * 4) * 0.05;
    ctx.scale(pulse, pulse);
    ctx.fillStyle = "rgba(0,0,0,0.46)";
    ctx.fillRect(-54, 31, 112, 12);

    if (s.bossShape === "maw") {
      ctx.strokeStyle = s.accent;
      ctx.lineWidth = 5;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(-24 + i * 8, 8);
        ctx.lineTo(-44 + i * 8, 24 + Math.sin(unit.game.time * 4 + i) * 4);
        ctx.stroke();
      }
      ctx.fillStyle = s.color;
      ctx.strokeStyle = s.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, -10, 54, 42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#2a0705";
      ctx.beginPath();
      ctx.ellipse(14, -8, 22, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff1b1";
      for (let i = -1; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(2 + i * 9, -17);
        ctx.lineTo(8 + i * 9, -5);
        ctx.lineTo(-3 + i * 9, -5);
        ctx.closePath();
        ctx.fill();
      }
      return;
    }

    if (s.bossShape === "prism") {
      ctx.strokeStyle = "rgba(84,216,255,0.58)";
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(0, -18, 44 + i * 10 + Math.sin(unit.game.time * 2 + i) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = s.color;
      ctx.strokeStyle = s.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -70);
      ctx.lineTo(38, -20);
      ctx.lineTo(18, 28);
      ctx.lineTo(-26, 22);
      ctx.lineTo(-42, -24);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = s.accent;
      ctx.beginPath();
      ctx.arc(4, -20, 9 + Math.sin(unit.game.time * 8) * 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (s.bossShape === "crown") {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = s.accent;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.arc(0, -12, s.auraRadius || 145, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = s.color;
      ctx.strokeStyle = s.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, -14, 48, 47, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#e9d7ff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-36, -54);
      ctx.lineTo(-18, -30);
      ctx.lineTo(0, -60);
      ctx.lineTo(16, -31);
      ctx.lineTo(38, -52);
      ctx.stroke();
      ctx.fillStyle = s.accent;
      ctx.beginPath();
      ctx.arc(11, -20, 10 + Math.sin(unit.game.time * 5) * 1.5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (s.bossShape === "artillery") {
      ctx.strokeStyle = "rgba(255,91,114,0.54)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-34, 26);
      ctx.lineTo(-8, -36);
      ctx.lineTo(30, 27);
      ctx.moveTo(0, -56);
      ctx.lineTo(55, -70);
      ctx.stroke();
      ctx.fillStyle = s.color;
      ctx.strokeStyle = s.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-28, -30);
      ctx.lineTo(2, -72);
      ctx.lineTo(34, -27);
      ctx.lineTo(24, 22);
      ctx.lineTo(-22, 24);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = s.accent;
      ctx.fillRect(12, -78, 50, 12);
      ctx.fillStyle = "#fff1b1";
      ctx.beginPath();
      ctx.arc(4, -36, 9 + Math.sin(unit.game.time * 7) * 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (s.bossShape === "monarch") {
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.strokeStyle = s.accent;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 7]);
      ctx.beginPath();
      ctx.arc(0, -14, s.auraRadius || 170, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = "rgba(188,124,255,0.28)";
      ctx.strokeStyle = s.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-52, -42);
      ctx.quadraticCurveTo(-92, -6, -46, 30);
      ctx.lineTo(-14, 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(52, -42);
      ctx.quadraticCurveTo(92, -6, 46, 30);
      ctx.lineTo(14, 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = s.color;
      ctx.strokeStyle = s.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, -16, 40, 55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-24, -62);
      ctx.lineTo(-8, -40);
      ctx.lineTo(0, -72);
      ctx.lineTo(9, -40);
      ctx.lineTo(26, -62);
      ctx.stroke();
      ctx.fillStyle = s.accent;
      ctx.beginPath();
      ctx.arc(0, -24, 13 + Math.sin(unit.game.time * 6) * 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.strokeStyle = "rgba(200,255,113,0.65)";
    ctx.lineWidth = 4;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.quadraticCurveTo(18 + i * 7, 22 + Math.sin(unit.game.time * 3 + i) * 7, 46, 18 + i * 7);
      ctx.stroke();
    }
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, -16, 46, 54, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#31051d";
    ctx.beginPath();
    ctx.ellipse(15, -27, 13, 18, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = s.accent;
    ctx.beginPath();
    ctx.arc(17, -28, 6 + Math.sin(unit.game.time * 6) * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffb8dd";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-35, -45);
    ctx.lineTo(-19, -31);
    ctx.moveTo(-8, -62);
    ctx.lineTo(-2, -40);
    ctx.moveTo(35, -42);
    ctx.lineTo(21, -30);
    ctx.stroke();
  }

  class Game {
    constructor() {
      this.sound = new SoundEngine();
      this.summonButtons = new Map();
      this.skillButtons = new Map();
      this.upgradeButtons = new Map();
      this.evolutionButtons = new Map();
      this.createButtons();
      this.reset(true);
      this.bindEvents();
    }

    createButtons() {
      UI.summonButtons.innerHTML = "";
      this.evolutionButtons.clear();
      let evolutionHotkeyIndex = 0;
      for (const type of SUMMON_ORDER) {
        const slot = document.createElement("div");
        slot.className = "summon-slot";
        slot.dataset.slot = type;

        const evolutionPair = document.createElement("div");
        evolutionPair.className = "evolution-pair";
        for (const [choice, evolution] of Object.entries(EVOLUTION_CHOICES[type])) {
          const hotkeyLabel = evolutionHotkeyLabel(evolutionHotkeyIndex);
          const evolutionCost = evolution.cost || MIN_EVOLUTION_COST;
          const evolutionBtn = document.createElement("button");
          evolutionBtn.type = "button";
          evolutionBtn.className = "evolution-btn";
          evolutionBtn.dataset.evolution = `${type}:${choice}`;
          evolutionBtn.dataset.hotkeyIndex = evolutionHotkeyIndex.toString();
          evolutionBtn.title = `${PLAYER_UNITS[type].label} evolution: ${evolution.label}, ${evolution.desc}. Hotkey ${hotkeyLabel}.`;
          evolutionBtn.setAttribute("aria-label", `${evolution.label}, evolves ${PLAYER_UNITS[type].label}, hotkey ${hotkeyLabel}`);
          evolutionBtn.innerHTML = `<span class="btn-name">${evolution.short}</span><span class="btn-meta">${hotkeyLabel} · ${evolutionCost}</span>`;
          evolutionBtn.addEventListener("click", () => {
            this.sound.unlock();
            this.buyEvolution(type, choice);
          });
          evolutionPair.appendChild(evolutionBtn);
          this.evolutionButtons.set(`${type}:${choice}`, evolutionBtn);
          evolutionHotkeyIndex += 1;
        }

        const s = PLAYER_UNITS[type];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "summon-btn";
        btn.dataset.type = type;
        btn.title = `${s.label}: ${s.cost} energy. Hotkey ${SUMMON_HOTKEYS[type]}.`;
        btn.setAttribute("aria-label", `${s.label}, costs ${s.cost} energy, hotkey ${SUMMON_HOTKEYS[type]}`);
        btn.innerHTML = `<span class="btn-name">${s.label}</span><span class="btn-meta">${SUMMON_HOTKEYS[type]} · ${s.cost} energy</span>`;
        btn.addEventListener("click", () => {
          this.sound.unlock();
          this.summon(type);
        });
        slot.appendChild(evolutionPair);
        slot.appendChild(btn);
        UI.summonButtons.appendChild(slot);
        this.summonButtons.set(type, btn);
      }

      UI.skillButtons.innerHTML = "";
      for (const [key, s] of Object.entries(SKILLS)) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "skill-btn";
        btn.dataset.skill = key;
        btn.title = `${s.label}. Hotkey ${SKILL_HOTKEYS[key]}. Command Tower improves effect; Coolant Banks slightly reduce cooldown.`;
        btn.setAttribute("aria-label", `${s.label}, hotkey ${SKILL_HOTKEYS[key]}, scales with Command Tower and Coolant Banks`);
        btn.innerHTML = `<span class="btn-name">${s.label}</span><span class="btn-meta">${SKILL_HOTKEYS[key]} · Ready</span>`;
        btn.addEventListener("click", () => {
          this.sound.unlock();
          this.useSkill(key);
        });
        UI.skillButtons.appendChild(btn);
        this.skillButtons.set(key, btn);
      }

      UI.upgradeButtons.innerHTML = "";
      for (const key of UPGRADE_ORDER) {
        const upgrade = UPGRADES[key];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "upgrade-btn";
        btn.dataset.upgrade = key;
        btn.title = `${upgrade.label}: improves ${upgrade.desc}. Hotkey ${upgrade.hotkey}.`;
        btn.setAttribute("aria-label", `${upgrade.label}, improves ${upgrade.desc}, hotkey ${upgrade.hotkey}`);
        btn.innerHTML = `<span class="btn-name">${upgrade.label}</span><span class="btn-meta">${upgrade.hotkey} · ${upgrade.costs[0]} scrap</span>`;
        btn.addEventListener("click", () => {
          this.sound.unlock();
          this.buyUpgrade(key);
        });
        UI.upgradeButtons.appendChild(btn);
        this.upgradeButtons.set(key, btn);
      }

    }

    bindEvents() {
      UI.startButton.addEventListener("click", () => {
        this.sound.unlock();
        this.start();
      });
      UI.pauseButton.addEventListener("click", () => {
        this.sound.unlock();
        this.togglePause();
      });
      UI.restartButton.addEventListener("click", () => {
        this.sound.unlock();
        this.reset(false);
        this.start();
      });
      UI.endRestartButton.addEventListener("click", () => {
        this.sound.unlock();
        this.reset(false);
        this.start();
      });
      window.addEventListener("pointerdown", () => this.sound.unlock());
      window.addEventListener("keydown", (event) => {
        if (event.repeat) return;
        if ((event.metaKey || event.ctrlKey) && !event.altKey) {
          const code = event.code || "";
          const hotkey = EVOLUTION_HOTKEYS.includes(event.key) ? event.key :
            /^Digit[0-9]$/.test(code) ? code.slice(5) :
            /^Numpad[0-9]$/.test(code) ? code.slice(6) : "";
          if (hotkey) {
            event.preventDefault();
            this.sound.unlock();
            this.buyEvolutionByHotkey(hotkey);
            return;
          }
        }
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (event.key === "f" || event.key === "F") this.toggleFullscreen();
        if (event.key === " " || event.key === "p" || event.key === "P") {
          event.preventDefault();
          this.togglePause();
        }
        if (event.key === "r" || event.key === "R") {
          this.reset(false);
          this.start();
        }
        const index = Number(event.key);
        if (index >= 1 && index <= 5) this.summon(SUMMON_ORDER[index - 1]);
        if (event.key === "q" || event.key === "Q") this.useSkill("missile");
        if (event.key === "w" || event.key === "W") this.useSkill("emp");
        if (event.key === "e" || event.key === "E") this.useSkill("repair");
        if (event.key === "z" || event.key === "Z") this.buyUpgrade("command");
        if (event.key === "x" || event.key === "X") this.buyUpgrade("turret");
        if (event.key === "c" || event.key === "C") this.buyUpgrade("coolant");
        if (event.key === "v" || event.key === "V") this.buyUpgrade("firmware");
      });
    }

    reset(showTutorial) {
      this.mode = showTutorial ? "tutorial" : "playing";
      this.time = 0;
      this.energy = 88;
      this.energyMax = 190;
      this.energyRate = 2.35;
      this.enemyEnergy = 116;
      this.enemyEnergyMax = 285;
      this.enemyEnergyRate = 2.85;
      this.enemyTech = 0;
      this.enemyThinkTimer = 1.2;
      this.enemyBossCooldown = 92;
      this.bossKills = 0;
      this.bossSpawnIndex = 0;
      this.bossRound = 0;
      this.enemyLastChoice = "";
      this.playerTowerTimer = 0.35;
      this.enemyTowerTimer = 0.2;
      this.scrap = 0;
      this.baseHpMax = 980;
      this.baseHp = this.baseHpMax;
      this.hiveHpMax = 1240;
      this.hiveHp = this.hiveHpMax;
      this.baseRegenTimer = 0;
      this.hiveRegenTimer = 0;
      this.baseShieldTimer = 0;
      this.hiveShieldTimer = 0;
      this.baseShieldTriggers = { half: false, critical: false };
      this.hiveShieldTriggers = { half: false, critical: false };
      this.players = [];
      this.enemies = [];
      this.projectiles = [];
      this.particles = [];
      this.parts = [];
      this.effects = [];
      this.floatingTexts = [];
      this.message = showTutorial ? "Standby" : "Deploy";
      this.messageTimer = showTutorial ? 0 : 2;
      this.shake = 0;
      this.empVisualTimer = 0;
      this.shieldTextTimer = 0;
      this.summonCooldowns = {};
      this.skillCooldowns = {};
      this.upgrades = {};
      this.enemyUpgrades = {};
      this.evolutions = {};
      this.enemySummonCooldowns = {};
      for (const type of SUMMON_ORDER) this.summonCooldowns[type] = 0;
      for (const type of Object.keys(ENEMY_UNITS)) this.enemySummonCooldowns[type] = 0;
      for (const key of Object.keys(SKILLS)) this.skillCooldowns[key] = 0;
      for (const key of UPGRADE_ORDER) this.upgrades[key] = 0;
      for (const key of UPGRADE_ORDER) this.enemyUpgrades[key] = 0;
      for (const type of SUMMON_ORDER) this.evolutions[type] = null;
      UI.tutorialOverlay.classList.toggle("visible", showTutorial);
      UI.endOverlay.classList.remove("visible");
      this.updateUi();
    }

    start() {
      if (this.mode === "win" || this.mode === "lose") return;
      UI.tutorialOverlay.classList.remove("visible");
      UI.endOverlay.classList.remove("visible");
      this.mode = "playing";
      this.message = "Enemy AI online";
      this.messageTimer = 2.2;
      this.updateUi();
    }

    togglePause() {
      if (this.mode === "tutorial" || this.mode === "win" || this.mode === "lose") return;
      this.mode = this.mode === "paused" ? "playing" : "paused";
      this.message = this.mode === "paused" ? "Paused" : "Resumed";
      this.messageTimer = 1.2;
      this.updateUi();
    }

    toggleFullscreen() {
      if (!document.fullscreenElement) {
        UI.stageWrap.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    }

    getUpgradeLevel(key) {
      return this.upgrades ? this.upgrades[key] || 0 : 0;
    }

    getEvolutionFor(type) {
      return this.evolutions ? this.evolutions[type] || null : null;
    }

    getPlayerUnitStats(type) {
      const base = PLAYER_UNITS[type];
      const evolutionKey = this.getEvolutionFor(type);
      const evolution = evolutionKey && EVOLUTION_CHOICES[type] ? EVOLUTION_CHOICES[type][evolutionKey] : null;
      return evolution ? { ...base, ...evolution.stats, label: evolution.label } : base;
    }

    getEnemyUpgradeLevel(key) {
      return this.enemyUpgrades ? this.enemyUpgrades[key] || 0 : 0;
    }

    getEnemyUpgradeCosts(key) {
      return ENEMY_UPGRADE_COSTS[key] || UPGRADES[key]?.costs || [];
    }

    getEvolutionCost(type, choice) {
      return EVOLUTION_CHOICES[type]?.[choice]?.cost || MIN_EVOLUTION_COST;
    }

    isBossType(type) {
      return !!(ENEMY_UNITS[type] && ENEMY_UNITS[type].bossTier);
    }

    getThreatLevel() {
      return clamp(1 + Math.floor(this.time / THREAT_STEP_SECONDS), 1, MAX_THREAT_LEVEL);
    }

    getEconomyRamp(side) {
      const threat = this.getThreatLevel();
      const base = side === ENEMY ? 1.08 : 0.95;
      const timeRamp = Math.min(0.74, this.time / 380);
      const threatRamp = Math.max(0, threat - 3) * 0.105 + Math.max(0, threat - 7) * 0.075;
      return base + timeRamp + threatRamp;
    }

    getMachineDamage(baseDamage) {
      return Math.round(baseDamage * (1 + this.getUpgradeLevel("firmware") * 0.09));
    }

    getMachineMaxHp(baseHp) {
      return Math.round(baseHp * (1 + this.getUpgradeLevel("firmware") * 0.06));
    }

    getMachineRange(baseRange) {
      const firmware = this.getUpgradeLevel("firmware");
      return baseRange + (baseRange >= 100 ? firmware * 10 : firmware * 2);
    }

    getMachineHeatBuild(baseHeat) {
      return Math.max(5, baseHeat * (1 - this.getUpgradeLevel("coolant") * 0.09));
    }

    getMachineCoolRate(baseCool) {
      return baseCool * (1 + this.getUpgradeLevel("coolant") * 0.17);
    }

    getSkillCooldown(key) {
      const skill = SKILLS[key];
      if (!skill) return 0;
      const coolant = this.getUpgradeLevel("coolant");
      return skill.cooldown * Math.max(0.8, 1 - coolant * 0.035);
    }

    getSkillPower(key) {
      const skill = SKILLS[key];
      if (!skill) return null;
      const command = this.getUpgradeLevel("command");
      const tuned = { ...skill, cooldown: this.getSkillCooldown(key) };
      if (key === "missile") {
        tuned.damage = Math.round(skill.damage * (1 + command * 0.12));
      }
      if (key === "emp") {
        tuned.duration = skill.duration + command * 0.35;
      }
      if (key === "repair") {
        tuned.heal = Math.round(skill.heal * (1 + command * 0.14));
      }
      return tuned;
    }

    getEnemyUnitDamage(baseDamage) {
      const threat = this.getThreatLevel();
      const threatScale = Math.max(0, threat - 3) * 0.038 + Math.max(0, threat - 7) * 0.018;
      return Math.round(baseDamage * (1 + this.getEnemyUpgradeLevel("firmware") * 0.1 + threatScale));
    }

    getEnemyUnitMaxHp(baseHp) {
      const threat = this.getThreatLevel();
      const threatScale = Math.max(0, threat - 4) * 0.045 + Math.max(0, threat - 8) * 0.02;
      return Math.round(baseHp * (1 + this.getEnemyUpgradeLevel("firmware") * 0.07 + threatScale));
    }

    getTowerStats(side) {
      const base = TOWER_WEAPON[side];
      const level = side === "player" ? this.getUpgradeLevel("turret") : this.getEnemyUpgradeLevel("turret");
      const command = side === "player" ? this.getUpgradeLevel("command") : this.getEnemyUpgradeLevel("command");
      const enemyThreat = side === "enemy" ? this.getThreatLevel() : 1;
      return {
        damage: Math.round(base.damage * (1 + level * 0.38 + command * 0.06 + (side === "enemy" ? Math.max(0, enemyThreat - 3) * 0.08 : 0))),
        cooldown: Math.max(0.45, base.cooldown * Math.pow(0.82, level)),
        range: side === "enemy" ? base.range + level * 18 + Math.max(0, enemyThreat - 6) * 5 : base.range + level * 28,
        splash: side === "enemy" ? (level > 0 ? 16 + level * 10 + Math.max(0, enemyThreat - 5) * 3 : 0) : (level >= 2 ? 18 + level * 8 : 0),
        color: base.color
      };
    }

    getEnemySummonCost(type, variant = "normal") {
      const stats = ENEMY_UNITS[type];
      if (!stats) return Infinity;
      let cost = stats.cost;
      if (type === "boss") {
        cost *= Math.max(0.64, 1 - Math.max(0, this.getThreatLevel() - 6) * 0.055);
      } else if (this.isBossType(type)) {
        cost *= Math.max(0.64, 1 - Math.max(0, this.getThreatLevel() - 7) * 0.05);
      }
      if (variant === "elite") cost *= 1.55;
      return Math.round(cost);
    }

    getEnemyDamageFactor(target) {
      if (!target || target.side !== ENEMY || target.dead) return 1;
      let factor = 1;
      for (const enemy of this.enemies) {
        if (enemy.dead || enemy === target || !enemy.stats.auraRadius || !enemy.stats.auraFactor) continue;
        if (distance(enemy.x, enemy.y, target.x, target.y) <= (enemy.stats.auraRadius || 0)) {
          factor *= enemy.stats.auraFactor || 0.72;
        }
      }
      return factor;
    }

    getFortressRegenRate(side) {
      const commandLevel = side === PLAYER ? this.getUpgradeLevel("command") : this.getEnemyUpgradeLevel("command");
      const maxHp = side === PLAYER ? this.baseHpMax : this.hiveHpMax;
      return maxHp * (FORTRESS_REGEN_BASE_FACTOR + commandLevel * FORTRESS_REGEN_COMMAND_FACTOR);
    }

    updateFortressRegen(dt) {
      this.baseRegenTimer = Math.max(0, this.baseRegenTimer - dt);
      this.hiveRegenTimer = Math.max(0, this.hiveRegenTimer - dt);
      this.baseShieldTimer = Math.max(0, this.baseShieldTimer - dt);
      this.hiveShieldTimer = Math.max(0, this.hiveShieldTimer - dt);

      if (this.baseRegenTimer <= 0 && this.baseHp > 0 && this.baseHp < this.baseHpMax) {
        this.baseHp = Math.min(this.baseHpMax, this.baseHp + this.getFortressRegenRate(PLAYER) * dt);
      }

      if (this.hiveRegenTimer <= 0 && this.hiveHp > 0 && this.hiveHp < this.hiveHpMax) {
        this.hiveHp = Math.min(this.hiveHpMax, this.hiveHp + this.getFortressRegenRate(ENEMY) * dt);
      }
    }

    getFortressShieldTrigger(side, beforeHp, nextHp) {
      const maxHp = side === PLAYER ? this.baseHpMax : this.hiveHpMax;
      const flags = side === PLAYER ? this.baseShieldTriggers : this.hiveShieldTriggers;
      const beforeRatio = beforeHp / maxHp;
      const nextRatio = nextHp / maxHp;
      if (!flags.critical && beforeRatio > FORTRESS_SHIELD_CRITICAL_RATIO && nextRatio <= FORTRESS_SHIELD_CRITICAL_RATIO) {
        return {
          key: "critical",
          ratio: FORTRESS_SHIELD_CRITICAL_RATIO,
          duration: FORTRESS_SHIELD_CRITICAL_DURATION,
          text: "EMERGENCY SHIELD",
          consumeHalf: beforeRatio > FORTRESS_SHIELD_HALF_RATIO && !flags.half
        };
      }
      if (!flags.half && beforeRatio > FORTRESS_SHIELD_HALF_RATIO && nextRatio <= FORTRESS_SHIELD_HALF_RATIO) {
        return {
          key: "half",
          ratio: FORTRESS_SHIELD_HALF_RATIO,
          duration: FORTRESS_SHIELD_HALF_DURATION,
          text: "FORTRESS SHIELD",
          consumeHalf: false
        };
      }
      return null;
    }

    activateFortressShield(side, trigger) {
      const flags = side === PLAYER ? this.baseShieldTriggers : this.hiveShieldTriggers;
      flags[trigger.key] = true;
      if (trigger.consumeHalf) flags.half = true;
      if (side === PLAYER) {
        this.baseShieldTimer = Math.max(this.baseShieldTimer, trigger.duration);
      } else {
        this.hiveShieldTimer = Math.max(this.hiveShieldTimer, trigger.duration);
        this.enemyEnergy = this.enemyEnergyMax;
      }
      const x = side === PLAYER ? BASE_FRONT_X : HIVE_FRONT_X;
      const y = LANE_Y - 92;
      const color = side === PLAYER ? "#54d8ff" : "#ffcf5a";
      this.floatingTexts.push(new FloatingText(x, y - 28, trigger.text, color, 17));
      if (side === ENEMY) {
        this.floatingTexts.push(new FloatingText(x, y - 50, "ENERGY FULL", "#ffcf5a", 15));
      }
      this.effects.push(new VisualEffect("pulse", {
        x,
        y: LANE_Y - 42,
        radius: side === PLAYER ? 94 : 118,
        color,
        life: 0.56
      }));
      this.addSparks(x, LANE_Y - 64, color, 34, 140);
      this.sound.emp();
    }

    buyUpgrade(key) {
      if (this.mode !== "playing") return false;
      const upgrade = UPGRADES[key];
      if (!upgrade) return false;
      const level = this.getUpgradeLevel(key);
      if (level >= upgrade.costs.length) return false;
      const cost = upgrade.costs[level];
      if (this.scrap < cost) {
        this.floatingTexts.push(new FloatingText(274, 92, "LOW SCRAP", "#ffcf5a", 14));
        return false;
      }
      this.scrap -= cost;
      this.upgrades[key] = level + 1;

      if (key === "command") {
        const hpGain = 150 + level * 55;
        this.baseHpMax += hpGain;
        this.baseHp = Math.min(this.baseHpMax, this.baseHp + hpGain);
        this.energyRate += 0.3;
        this.energyMax += 28;
        this.energy = Math.min(this.energyMax, this.energy + 18);
      }

      if (key === "turret") {
        this.playerTowerTimer = Math.min(this.playerTowerTimer, 0.2);
      }

      if (key === "firmware") {
        for (const unit of this.players) {
          const oldMax = unit.maxHp;
          unit.maxHp = this.getMachineMaxHp(unit.stats.maxHp);
          unit.hp = Math.min(unit.maxHp, unit.hp + Math.max(0, unit.maxHp - oldMax));
        }
      }

      if (key === "coolant") {
        for (const unit of this.players) unit.heat = Math.max(0, unit.heat - 18);
      }

      this.message = `${upgrade.label} level ${this.upgrades[key]}`;
      this.messageTimer = 2;
      this.floatingTexts.push(new FloatingText(296, 116, "UPGRADE ONLINE", "#83f28f", 20));
      this.addSparks(300, 122, "#83f28f", 26, 120);
      this.sound.upgrade();
      this.updateUi();
      return true;
    }

    buyEvolutionByHotkey(hotkey) {
      const index = EVOLUTION_HOTKEYS.indexOf(hotkey);
      const binding = EVOLUTION_HOTKEY_BINDINGS[index];
      if (!binding) return false;
      return this.buyEvolution(binding.type, binding.choice);
    }

    buyEvolution(type, choice) {
      if (this.mode !== "playing") return false;
      const evolution = EVOLUTION_CHOICES[type]?.[choice];
      if (!evolution) return false;
      if (this.evolutions[type]) return false;
      const cost = this.getEvolutionCost(type, choice);
      if (this.scrap < cost) {
        this.floatingTexts.push(new FloatingText(388, 112, "LOW SCRAP", "#ffcf5a", 14));
        return false;
      }
      this.scrap -= cost;
      this.evolutions[type] = choice;
      this.message = `${evolution.label} unlocked`;
      this.messageTimer = 2.5;
      this.floatingTexts.push(new FloatingText(W / 2, 118, "EVOLUTION ONLINE", "#83f28f", 20));
      this.addSparks(W / 2, LANE_Y - 40, evolution.stats.accent || "#83f28f", 42, 150);
      this.sound.upgrade();
      this.updateUi();
      return true;
    }

    buyEnemyUpgrade(key) {
      const upgrade = UPGRADES[key];
      if (!upgrade) return false;
      const level = this.getEnemyUpgradeLevel(key);
      const costs = this.getEnemyUpgradeCosts(key);
      if (level >= costs.length) return false;
      const cost = Math.round(costs[level] * 0.82);
      if (this.enemyTech < cost) return false;
      this.enemyTech -= cost;
      this.enemyUpgrades[key] = level + 1;

      if (key === "command") {
        const hpGain = 170 + level * 70;
        this.hiveHpMax += hpGain;
        this.hiveHp = Math.min(this.hiveHpMax, this.hiveHp + hpGain);
        this.enemyEnergyRate += 0.38;
        this.enemyEnergyMax += 56;
        this.enemyEnergy = Math.min(this.enemyEnergyMax, this.enemyEnergy + 26);
      }

      if (key === "turret") {
        this.enemyTowerTimer = Math.min(this.enemyTowerTimer, 0.15);
      }

      this.addSparks(HIVE_FRONT_X + 42, LANE_Y - 82, "#bc7cff", 22, 110);
      return true;
    }

    summon(type) {
      if (this.mode !== "playing") return false;
      const stats = this.getPlayerUnitStats(type);
      if (!stats) return false;
      if (this.energy < stats.cost || this.summonCooldowns[type] > 0) {
        this.floatingTexts.push(new FloatingText(190, 92, this.energy < stats.cost ? "LOW ENERGY" : "DEPLOY COOLING", "#ffcf5a", 14));
        return false;
      }
      if (this.players.length >= 22) {
        this.floatingTexts.push(new FloatingText(210, 92, "LANE FULL", "#ffcf5a", 14));
        return false;
      }
      this.energy -= stats.cost;
      this.summonCooldowns[type] = stats.deployCooldown;
      const y = type === "drone" ? LANE_Y - 5 + rand(-10, 8) : LANE_Y + rand(-15, 18);
      const unit = new Unit(this, PLAYER, type, PLAYER_SPAWN_X + rand(-8, 8), y);
      this.players.push(unit);
      this.addSparks(unit.x, unit.y - unit.radius, stats.color, 12, 82);
      this.sound.summon();
      this.updateUi();
      return true;
    }

    spawnEnemy(type, variant = "normal", formationIndex = 0, formationSize = 1) {
      const stats = ENEMY_UNITS[type];
      if (!stats) return;
      const isBoss = this.isBossType(type);
      const formation = formationSize > 1 ? formationIndex - (formationSize - 1) / 2 : 0;
      const y = isBoss ? LANE_Y + formation * 36 + rand(-6, 8) : LANE_Y + rand(-18, 18);
      const x = isBoss ? ENEMY_SPAWN_X + 6 + formationIndex * 50 + rand(-4, 4) : ENEMY_SPAWN_X + rand(-8, 10);
      const unit = new Unit(this, ENEMY, type, x, y, { variant });
      this.enemies.push(unit);
      this.addSparks(unit.x, unit.y - unit.radius, stats.color, isBoss ? 34 : 10, 95);
      if (unit.elite) {
        this.floatingTexts.push(new FloatingText(unit.x, unit.y - unit.radius - 18, "ELITE", "#ffcf5a", 14));
      }
      if (isBoss) {
        this.floatingTexts.push(new FloatingText(unit.x, unit.y - unit.radius - 26 - formationIndex * 18, stats.label.toUpperCase(), stats.accent, 16));
      }
    }

    summonEnemy(type, variant = "normal") {
      const stats = ENEMY_UNITS[type];
      if (!stats || this.mode !== "playing") return false;
      const cost = this.getEnemySummonCost(type, variant);
      if (this.enemyEnergy < cost || (this.enemySummonCooldowns[type] || 0) > 0) return false;
      if (this.enemies.length >= 30) return false;
      this.enemyEnergy -= cost;
      this.enemySummonCooldowns[type] = Math.max(0.55, (stats.cooldown || 1) * (this.isBossType(type) ? 18 : 1.0));
      this.spawnEnemy(type, variant);
      this.enemyLastChoice = variant === "elite" ? `elite ${type}` : type;
      return true;
    }

    getBossAliveCount() {
      return this.enemies.filter((unit) => this.isBossType(unit.type)).length;
    }

    getNextBossPlan() {
      if (this.bossSpawnIndex < BOSS_TYPES.length) {
        const type = BOSS_TYPES[this.bossSpawnIndex];
        return {
          types: [type],
          bossPlan: true,
          label: ENEMY_UNITS[type].label
        };
      }

      const first = BOSS_TYPES[this.bossRound % BOSS_TYPES.length];
      let second = BOSS_TYPES[(this.bossRound * 2 + 1) % BOSS_TYPES.length];
      if (second === first) second = BOSS_TYPES[(this.bossRound + 2) % BOSS_TYPES.length];
      return {
        types: [first, second],
        bossPlan: true,
        duo: true,
        costFactor: 0.82,
        label: "Boss Round"
      };
    }

    summonEnemyPlan(plan) {
      if (!plan) return false;
      if (!plan.types) return this.summonEnemy(plan.type, plan.variant || "normal");

      const types = plan.types;
      if (this.enemies.length + types.length > 30) return false;
      let totalCost = 0;
      for (const type of types) {
        const stats = ENEMY_UNITS[type];
        if (!stats || (this.enemySummonCooldowns[type] || 0) > 0) return false;
        totalCost += this.getEnemySummonCost(type);
      }
      totalCost = Math.round(totalCost * (plan.costFactor || 1));
      if (this.enemyEnergy < totalCost) return false;

      this.enemyEnergy -= totalCost;
      for (let i = 0; i < types.length; i++) {
        const type = types[i];
        const stats = ENEMY_UNITS[type];
        this.enemySummonCooldowns[type] = Math.max(0.55, (stats.cooldown || 1) * 18);
        this.spawnEnemy(type, "normal", i, types.length);
      }

      if (plan.bossPlan) {
        this.enemyBossCooldown = plan.duo ? Math.max(42, 84 - this.getThreatLevel() * 3) : Math.max(50, 96 - this.getThreatLevel() * 4);
        if (this.bossSpawnIndex < BOSS_TYPES.length) this.bossSpawnIndex += types.length;
        else this.bossRound += 1;
      }

      this.enemyLastChoice = plan.label || types.join(" + ");
      return true;
    }

    useSkill(key) {
      if (this.mode !== "playing") return false;
      const skill = this.getSkillPower(key);
      if (!skill || this.skillCooldowns[key] > 0) return false;
      this.skillCooldowns[key] = skill.cooldown;

      if (key === "missile") {
        let targetX = 700;
        let targetY = LANE_Y - 10;
        if (this.enemies.length > 0) {
          const front = this.enemies.reduce((best, unit) => unit.x < best.x ? unit : best, this.enemies[0]);
          targetX = front.x;
          targetY = front.y - 8;
        }
        this.missileStrike(targetX, targetY, skill.radius, skill.damage);
      }

      if (key === "emp") {
        for (const enemy of this.enemies) enemy.slowTimer = Math.max(enemy.slowTimer, skill.duration);
        this.empVisualTimer = 0.55;
        this.floatingTexts.push(new FloatingText(W / 2, 116, "EMP PULSE", "#54d8ff", 24));
        this.addSparks(W / 2, LANE_Y - 20, "#54d8ff", 60, 180);
        this.sound.emp();
      }

      if (key === "repair") {
        for (const unit of this.players) {
          unit.heal(skill.heal);
          unit.heat = Math.max(0, unit.heat - 8);
          this.addSparks(unit.x, unit.y - unit.radius, "#83f28f", 5, 58);
        }
        this.floatingTexts.push(new FloatingText(252, 116, "REPAIR SWARM", "#83f28f", 22));
        this.sound.repair();
      }

      this.updateUi();
      return true;
    }

    missileStrike(x, y, radius, damage) {
      this.shake = Math.max(this.shake, 18);
      this.addExplosion(x, y, radius);
      for (const enemy of [...this.enemies]) {
        const d = distance(x, y, enemy.x, enemy.y);
        if (d <= radius + enemy.radius) {
          const falloff = clamp(1 - d / (radius + enemy.radius), 0.38, 1);
          enemy.takeDamage(damage * falloff, { side: PLAYER });
        }
      }
      this.floatingTexts.push(new FloatingText(x, y - radius * 0.55, "MISSILE", "#ffcf5a", 22));
      this.sound.explosion();
    }

    update(dt) {
      dt = Math.min(dt, 0.05);
      this.time += dt;
      this.messageTimer = Math.max(0, this.messageTimer - dt);
      this.shake = Math.max(0, this.shake - 32 * dt);
      this.empVisualTimer = Math.max(0, this.empVisualTimer - dt);
      this.shieldTextTimer = Math.max(0, this.shieldTextTimer - dt);

      if (this.mode === "playing") {
        this.energy = Math.min(this.energyMax, this.energy + this.energyRate * this.getEconomyRamp(PLAYER) * dt);
        this.enemyEnergy = Math.min(this.enemyEnergyMax, this.enemyEnergy + this.enemyEnergyRate * this.getEconomyRamp(ENEMY) * dt);
        const threat = this.getThreatLevel();
        this.enemyTech += (0.46 + threat * 0.1 + Math.max(0, threat - 8) * 0.07) * dt;
        for (const key of Object.keys(this.summonCooldowns)) this.summonCooldowns[key] = Math.max(0, this.summonCooldowns[key] - dt);
        for (const key of Object.keys(this.enemySummonCooldowns)) this.enemySummonCooldowns[key] = Math.max(0, this.enemySummonCooldowns[key] - dt);
        for (const key of Object.keys(this.skillCooldowns)) this.skillCooldowns[key] = Math.max(0, this.skillCooldowns[key] - dt);
        this.updateFortressRegen(dt);
        this.updateTowerWeapons(dt);
        this.updateEnemyAI(dt);
        for (const unit of this.players) unit.update(dt);
        for (const unit of this.enemies) unit.update(dt);
        for (const projectile of this.projectiles) projectile.update(dt);
        for (const part of this.parts) part.update(dt, this);
        this.players = this.players.filter((unit) => !unit.dead);
        this.enemies = this.enemies.filter((unit) => !unit.dead);
        this.projectiles = this.projectiles.filter((projectile) => !projectile.dead);
        this.parts = this.parts.filter((part) => !part.dead);
      }

      for (const effect of this.effects) effect.update(dt);
      this.effects = this.effects.filter((effect) => effect.life > 0);
      for (const particle of this.particles) particle.update(dt);
      this.particles = this.particles.filter((particle) => particle.life > 0);
      for (const text of this.floatingTexts) text.update(dt);
      this.floatingTexts = this.floatingTexts.filter((text) => text.life > 0);
      this.updateUi();
    }

    updateTowerWeapons(dt) {
      this.playerTowerTimer -= dt;
      this.enemyTowerTimer -= dt;

      if (this.playerTowerTimer <= 0) {
        const stats = this.getTowerStats("player");
        const target = this.findTowerTarget(PLAYER, stats.range);
        if (target) {
          this.fireTower(PLAYER, target, stats);
          this.playerTowerTimer = stats.cooldown;
        } else {
          this.playerTowerTimer = Math.min(0.25, stats.cooldown);
        }
      }

      if (this.enemyTowerTimer <= 0) {
        const stats = this.getTowerStats("enemy");
        const target = this.findTowerTarget(ENEMY, stats.range);
        if (target) {
          this.fireTower(ENEMY, target, stats);
          this.enemyTowerTimer = stats.cooldown;
        } else {
          this.enemyTowerTimer = Math.min(0.25, stats.cooldown);
        }
      }
    }

    findTowerTarget(side, range) {
      const originX = side === PLAYER ? BASE_FRONT_X : HIVE_FRONT_X;
      const foes = side === PLAYER ? this.enemies : this.players;
      let best = null;
      let bestScore = Infinity;
      for (const foe of foes) {
        if (foe.dead) continue;
        if (side === ENEMY && foe.isStealthed && foe.isStealthed()) continue;
        const d = Math.abs(foe.x - originX);
        if (d > range + foe.radius) continue;
        const priority = foe.type === "sapper" ? -90 : foe.type === "seer" ? -40 : 0;
        const score = d + priority;
        if (score < bestScore) {
          best = foe;
          bestScore = score;
        }
      }
      return best;
    }

    fireTower(side, target, stats) {
      const source = {
        side,
        dir: side === PLAYER ? 1 : -1,
        radius: 16,
        x: side === PLAYER ? BASE_FRONT_X - 20 : HIVE_FRONT_X + 22,
        y: LANE_Y - 104,
        stats: { color: stats.color },
        splashRadius: stats.splash || 0,
        splashFactor: side === ENEMY ? 0.25 : 0.32
      };
      this.projectiles.push(new Projectile(this, source, target, stats.damage, 520, stats.color, 5));
      this.addSparks(source.x, source.y, stats.color, 5, 55);
      this.sound.shot();
    }

    updateEnemyAI(dt) {
      this.enemyThinkTimer -= dt;
      this.enemyBossCooldown = Math.max(0, this.enemyBossCooldown - dt);
      if (this.enemyThinkTimer > 0) return;
      this.enemyThinkTimer = rand(0.55, 1.05);

      this.enemyUpgradeDecision();

      const closePressure = this.players.some((unit) => unit.x > HIVE_FRONT_X - 280);
      let attempts = this.getThreatLevel() >= 8 ? 4 : this.getThreatLevel() >= 6 ? 3 : this.getThreatLevel() >= 3 ? 2 : 1;
      if (closePressure) attempts += 1;
      while (attempts-- > 0) {
        const plan = this.chooseEnemySummon();
        if (!plan) return;
        if (!this.summonEnemyPlan(plan)) return;
        if (plan.bossPlan) return;
      }
    }

    enemyUpgradeDecision() {
      const threat = this.getThreatLevel();
      const closePressure = this.players.some((unit) => unit.x > HIVE_FRONT_X - 260);
      const weakHive = this.hiveHp / this.hiveHpMax < 0.62;

      const priorities = [];
      if (weakHive || threat >= 4) priorities.push("command");
      if (closePressure || threat >= 3) priorities.push("turret");
      if (threat >= 7) priorities.push("firmware");
      if (this.players.length > this.enemies.length + 2 || threat >= 5) priorities.push("firmware");
      priorities.push("command", "turret", "firmware");

      for (const key of priorities) {
        if (this.buyEnemyUpgrade(key)) {
          this.enemyLastChoice = `upgrade ${key}`;
          return;
        }
      }
    }

    chooseEnemySummon() {
      const threat = this.getThreatLevel();
      const playerFront = this.players.length ? Math.max(...this.players.map((unit) => unit.x)) : PLAYER_SPAWN_X;
      const playerRanged = this.players.filter((unit) => unit.type === "drone" || unit.type === "railgun").length;
      const enemyFrontline = this.enemies.filter((unit) => unit.type === "shieldbug" || unit.type === "brute" || this.isBossType(unit.type)).length;
      const seerCount = this.enemies.filter((unit) => unit.type === "seer").length;
      const closeThreat = playerFront > HIVE_FRONT_X - 255;
      const eliteOkay = threat >= 4 && this.enemyEnergy > 120;
      const bossAliveCount = this.getBossAliveCount();

      if (threat >= 6 && this.enemyBossCooldown <= 0 && bossAliveCount === 0) {
        const bossPlan = this.getNextBossPlan();
        const bossCost = Math.round(bossPlan.types.reduce((sum, type) => sum + this.getEnemySummonCost(type), 0) * (bossPlan.costFactor || 1));
        if (this.enemyEnergy >= bossCost) {
          return bossPlan;
        }
        const emergencyDefense = closeThreat && (enemyFrontline < 2 || this.enemies.length < 6);
        if (!emergencyDefense || (this.enemyEnergy >= bossCost * 0.35 && this.enemies.length >= 5)) {
          this.enemyLastChoice = `saving for boss ${Math.floor(this.enemyEnergy)}/${bossCost}`;
          return null;
        }
      }

      if (closeThreat && enemyFrontline < 3 && this.enemyEnergy >= this.getEnemySummonCost("brute")) {
        return { type: threat >= 5 ? "brute" : "shieldbug", variant: eliteOkay ? "elite" : "normal" };
      }

      if (closeThreat && this.enemyEnergy >= this.getEnemySummonCost("sapper") && (this.enemySummonCooldowns.sapper || 0) <= 0) {
        return { type: "sapper", variant: threat >= 5 && eliteOkay ? "elite" : "normal" };
      }

      if (playerRanged >= 2 && seerCount < 2 && threat >= 3 && this.enemyEnergy >= this.getEnemySummonCost("seer")) {
        return { type: "seer" };
      }

      if (this.players.length === 0 && threat <= 2 && this.enemyEnergy >= this.getEnemySummonCost("grunt")) {
        return { type: this.enemyEnergy > 135 && threat >= 2 ? "spitter" : "grunt" };
      }

      if (this.enemies.length < 3 && this.enemyEnergy >= this.getEnemySummonCost("sapper")) {
        return { type: threat >= 2 && Math.random() < 0.45 ? "sapper" : "grunt" };
      }

      const pool = [];
      pool.push({ type: "grunt", weight: 5 });
      if (threat >= 2) pool.push({ type: "sapper", weight: closeThreat ? 2 : 5 });
      if (threat >= 2) pool.push({ type: "spitter", weight: playerRanged ? 4 : 3 });
      if (threat >= 3) pool.push({ type: "shieldbug", weight: enemyFrontline < 4 ? 4 : 1 });
      if (threat >= 3) pool.push({ type: "seer", weight: seerCount < 2 ? 3 : 0.6 });
      if (threat >= 4) pool.push({ type: "brute", weight: 3.5 });

      const affordable = pool.filter((entry) => this.enemyEnergy >= this.getEnemySummonCost(entry.type) && (this.enemySummonCooldowns[entry.type] || 0) <= 0);
      if (!affordable.length) return null;
      const total = affordable.reduce((sum, entry) => sum + entry.weight, 0);
      let roll = Math.random() * total;
      for (const entry of affordable) {
        roll -= entry.weight;
        if (roll <= 0) {
          const expensive = this.getEnemySummonCost(entry.type);
          const variant = eliteOkay && threat >= 5 && this.enemyEnergy > expensive * 1.8 && Math.random() < 0.22 ? "elite" : "normal";
          return { type: entry.type, variant };
        }
      }
      return { type: affordable[0].type };
    }

    canUnitTarget(unit, foe) {
      if (!unit || !foe || foe.dead) return false;
      if (unit.side === ENEMY && foe.side === PLAYER) {
        if (foe.isStealthed && foe.isStealthed()) return false;
        if (foe.evolutionDef?.flying) {
          return (unit.stats.projectileSpeed || 0) > 0 || unit.stats.range >= 110 || !!unit.stats.bossTier;
        }
      }
      return true;
    }

    findNearestEnemy(x, y, maxRange = Infinity, exclude = new Set()) {
      let best = null;
      let bestD = maxRange;
      for (const enemy of this.enemies) {
        if (enemy.dead || exclude.has(enemy)) continue;
        const d = distance(x, y, enemy.x, enemy.y);
        if (d < bestD) {
          best = enemy;
          bestD = d;
        }
      }
      return best;
    }

    arcChain(source, target, damage, chain) {
      let current = target;
      let currentDamage = damage;
      const hit = new Set();
      let lastX = source.x;
      let lastY = source.y - source.radius * 0.4;
      for (let i = 0; i < chain.maxTargets && current; i++) {
        this.applyDamage(current, currentDamage, source);
        const cx = current.x;
        const cy = current.y - (current.radius || 0) * 0.2;
        this.effects.push(new VisualEffect("beam", {
          x1: lastX,
          y1: lastY,
          x2: cx,
          y2: cy,
          color: source.stats.accent,
          width: Math.max(2, 6 - i),
          life: 0.18
        }));
        if (current.dead || !current.kind) hit.add(current);
        lastX = cx;
        lastY = cy;
        currentDamage *= chain.falloff;
        current = this.findNearestEnemy(lastX, lastY, chain.range, hit);
      }
    }

    lineBeam(source, damage, beam) {
      const x1 = source.x + source.radius * 0.6;
      const y1 = source.y - source.radius * 0.85;
      const x2 = source.x + beam.fixedRange;
      const y2 = y1;
      const half = beam.width / 2;
      this.effects.push(new VisualEffect("beam", {
        x1,
        y1,
        x2,
        y2,
        color: source.stats.accent,
        width: 7,
        life: 0.22
      }));
      for (const enemy of [...this.enemies]) {
        if (enemy.dead) continue;
        if (enemy.x >= x1 && enemy.x <= x2 + enemy.radius && Math.abs((enemy.y - enemy.radius * 0.25) - y1) <= half + enemy.radius) {
          enemy.takeDamage(damage, source);
        }
      }
      if (x2 >= HIVE_FRONT_X) this.damageHive(damage * 0.55, source);
    }

    skyStrike(target, damage, source, strike) {
      const x = target.x;
      const y = target.y - (target.radius || 0) * 0.2;
      this.effects.push(new VisualEffect("sky", {
        x,
        y,
        radius: strike.radius,
        color: source.stats.accent,
        life: 0.34
      }));
      this.applyDamage(target, damage, source);
      for (const enemy of [...this.enemies]) {
        if (enemy.dead || enemy === target) continue;
        if (distance(x, y, enemy.x, enemy.y) <= strike.radius + enemy.radius) {
          enemy.takeDamage(damage * strike.splashFactor, source);
        }
      }
      this.shake = Math.max(this.shake, 9);
      this.addSparks(x, y, source.stats.accent, 22, 160);
    }

    findTargetFor(unit) {
      if (unit.side === ENEMY && unit.stats.baseRush) {
        const forward = unit.x - BASE_FRONT_X;
        if (forward <= unit.getRange() + 20) {
          return { kind: "base", side: PLAYER, x: BASE_FRONT_X, y: LANE_Y - 8, radius: 48, dead: false };
        }
        return null;
      }

      const foes = unit.side === PLAYER ? this.enemies : this.players;
      let best = null;
      let bestForward = Infinity;
      const range = unit.getRange();
      for (const foe of foes) {
        if (foe.dead) continue;
        if (!this.canUnitTarget(unit, foe)) continue;
        const forward = unit.side === PLAYER ? foe.x - unit.x : unit.x - foe.x;
        if (forward < -unit.radius - foe.radius) continue;
        if (forward <= range + foe.radius + 4 && forward < bestForward) {
          best = foe;
          bestForward = forward;
        }
      }
      if (best) return best;

      if (unit.side === PLAYER) {
        const forward = HIVE_FRONT_X - unit.x;
        if (forward <= range + 20) {
          return { kind: "hive", side: ENEMY, x: HIVE_FRONT_X, y: LANE_Y - 12, radius: 46, dead: false };
        }
      } else {
        const forward = unit.x - BASE_FRONT_X;
        if (forward <= range + 20) {
          return { kind: "base", side: PLAYER, x: BASE_FRONT_X, y: LANE_Y - 8, radius: 48, dead: false };
        }
      }
      return null;
    }

    applyDamage(target, amount, source, context = {}) {
      if (!target || amount <= 0) return;
      if (target.kind === "base") {
        this.damageBase(amount, source);
        return;
      }
      if (target.kind === "hive") {
        this.damageHive(amount, source);
        return;
      }
      target.takeDamage(amount, source, context);
    }

    damageBase(amount, source) {
      const dmg = Math.max(1, Math.round(amount));
      if (this.baseShieldTimer > 0) {
        this.floatingTexts.push(new FloatingText(BASE_FRONT_X - 4, LANE_Y - 72, "SHIELD", "#54d8ff", 15));
        this.addSparks(BASE_FRONT_X, LANE_Y - 42, "#54d8ff", 7, 84);
        return;
      }
      const before = this.baseHp;
      let next = Math.max(0, before - dmg);
      const trigger = this.getFortressShieldTrigger(PLAYER, before, next);
      if (trigger) {
        next = Math.max(next, this.baseHpMax * trigger.ratio);
      }
      this.baseHp = next;
      const applied = Math.max(0, Math.round(before - this.baseHp));
      if (applied > 0) {
        this.baseRegenTimer = FORTRESS_REGEN_DELAY;
        this.floatingTexts.push(new FloatingText(BASE_FRONT_X - 4, LANE_Y - 72, `-${applied}`, "#ff9aaa", 16));
        this.addSparks(BASE_FRONT_X, LANE_Y - 24, source && source.stats ? source.stats.color : "#ff5b72", 6, 70);
      }
      if (trigger) this.activateFortressShield(PLAYER, trigger);
      if (this.baseHp <= 0) this.lose();
    }

    damageHive(amount, source) {
      if (this.hiveShieldTimer > 0) {
        this.floatingTexts.push(new FloatingText(HIVE_FRONT_X + 10, LANE_Y - 82, "SHIELD", "#ffcf5a", 15));
        this.addSparks(HIVE_FRONT_X, LANE_Y - 42, "#ffcf5a", 7, 84);
        return;
      }
      const before = this.hiveHp;
      let next = Math.max(0, before - Math.max(1, Math.round(amount)));
      const trigger = this.getFortressShieldTrigger(ENEMY, before, next);
      if (trigger) {
        next = Math.max(next, this.hiveHpMax * trigger.ratio);
      }
      this.hiveHp = next;
      const applied = Math.round(before - this.hiveHp);
      if (applied > 0) {
        this.hiveRegenTimer = FORTRESS_REGEN_DELAY;
        this.floatingTexts.push(new FloatingText(HIVE_FRONT_X + 10, LANE_Y - 82, `-${applied}`, "#dff8ff", 16));
        this.addSparks(HIVE_FRONT_X, LANE_Y - 26, source && source.stats ? source.stats.color : "#54d8ff", 6, 70);
      }
      if (trigger) this.activateFortressShield(ENEMY, trigger);
      if (this.hiveHp <= 0) this.win();
    }

    onUnitDeath(unit) {
      const isBoss = unit.side === ENEMY && this.isBossType(unit.type);
      this.addExplosion(unit.x, unit.y - unit.radius * 0.2, isBoss ? 95 : unit.radius * 2.2);
      if (unit.side === ENEMY) {
        const baseEnergyReward = unit.reward || unit.stats.reward || 0;
        let energyReward = baseEnergyReward;
        let scrapReward = Math.max(1, Math.round(baseEnergyReward * 0.24));
        if (isBoss) {
          const tier = unit.stats.bossTier || 1;
          energyReward += 90 + tier * 35;
          scrapReward += 70 + tier * 28;
          this.bossKills += 1;
          this.message = `${unit.stats.label} destroyed`;
          this.messageTimer = 3;
          this.floatingTexts.push(new FloatingText(unit.x, unit.y - unit.radius - 46, "BOSS CACHE", "#ffcf5a", 18));
        }
        this.energy = Math.min(this.energyMax, this.energy + energyReward);
        this.scrap += scrapReward;
        this.floatingTexts.push(new FloatingText(unit.x, unit.y - unit.radius - 26, `+${energyReward}E +${scrapReward}S`, "#ffcf5a", 14));
      } else {
        if (unit.evolutionDef?.deathExplosion) {
          const boom = unit.evolutionDef.deathExplosion;
          this.addExplosion(unit.x, unit.y - unit.radius * 0.25, boom.radius);
          for (const enemy of [...this.enemies]) {
            if (enemy.dead) continue;
            if (distance(unit.x, unit.y, enemy.x, enemy.y) <= boom.radius + enemy.radius) {
              enemy.takeDamage(boom.damage, unit);
            }
          }
          this.shake = Math.max(this.shake, 10);
        }
        if (unit.evolutionDef?.deathPart) {
          this.parts.push(new RepairPart(unit.x, unit.y - 8, unit.evolutionDef.deathPart.heal));
        }
        const bounty = Math.max(8, Math.round((unit.stats.cost || 35) * 0.35));
        this.enemyEnergy = Math.min(this.enemyEnergyMax, this.enemyEnergy + bounty);
        this.enemyTech += Math.max(3, bounty * 0.45);
      }
    }

    lose() {
      if (this.mode === "lose" || this.mode === "win") return;
      this.mode = "lose";
      this.message = "Base destroyed";
      this.messageTimer = 99;
      UI.endTitle.textContent = "Mission Failed";
      UI.endBody.textContent = "The command base fell before the hive core was destroyed.";
      UI.endOverlay.classList.add("visible");
      this.sound.finish(false);
      this.shake = 20;
    }

    win() {
      if (this.mode === "win" || this.mode === "lose") return;
      this.mode = "win";
      this.message = "Mission complete";
      this.messageTimer = 99;
      UI.endTitle.textContent = "Mission Complete";
      UI.endBody.textContent = "The final hive core has been destroyed and the lane is secure.";
      UI.endOverlay.classList.add("visible");
      this.sound.finish(true);
      this.shake = 22;
      this.addExplosion(HIVE_FRONT_X, LANE_Y - 36, 150);
    }

    addSparks(x, y, color, count, speed) {
      for (let i = 0; i < count; i++) {
        const angle = rand(0, Math.PI * 2);
        const v = rand(speed * 0.25, speed);
        this.particles.push(new Particle(
          x + rand(-4, 4),
          y + rand(-4, 4),
          Math.cos(angle) * v,
          Math.sin(angle) * v,
          color,
          rand(1.5, 4.2),
          rand(0.28, 0.68),
          rand(8, 36)
        ));
      }
    }

    addExplosion(x, y, radius) {
      const colors = ["#ffcf5a", "#ff7a50", "#54d8ff", "#ffffff"];
      const count = Math.round(clamp(radius / 2, 16, 76));
      for (let i = 0; i < count; i++) {
        const angle = rand(0, Math.PI * 2);
        const v = rand(radius * 0.7, radius * 2.2);
        this.particles.push(new Particle(
          x,
          y,
          Math.cos(angle) * v,
          Math.sin(angle) * v,
          colors[Math.floor(rand(0, colors.length))],
          rand(2, 6),
          rand(0.35, 0.9),
          32
        ));
      }
    }

    render() {
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      if (this.shake > 0) {
        ctx.translate(rand(-this.shake, this.shake), rand(-this.shake * 0.45, this.shake * 0.45));
      }
      this.drawBackground(ctx);
      this.drawBases(ctx);
      if (this.empVisualTimer > 0) this.drawEmpField(ctx);

      const allUnits = [...this.players, ...this.enemies].sort((a, b) => a.y - b.y);
      for (const part of this.parts) part.draw(ctx);
      for (const unit of allUnits) unit.draw(ctx);
      for (const effect of this.effects) effect.draw(ctx);
      for (const projectile of this.projectiles) projectile.draw(ctx);
      for (const particle of this.particles) particle.draw(ctx);
      for (const text of this.floatingTexts) text.draw(ctx);
      this.drawCanvasHud(ctx);
      ctx.restore();

      if (this.mode === "paused") {
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.42)";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#d9f4ff";
        ctx.font = "900 48px Trebuchet MS, Arial";
        ctx.textAlign = "center";
        ctx.fillText("PAUSED", W / 2, H / 2);
        ctx.restore();
      }
    }

    drawBackground(ctx) {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#06111b");
      sky.addColorStop(0.55, "#07131b");
      sky.addColorStop(1, "#05080d");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.globalAlpha = 0.28;
      for (let i = 0; i < 80; i++) {
        const x = (i * 131 + Math.sin(i) * 27) % W;
        const y = (i * 59) % 260;
        const blink = 0.45 + Math.sin(this.time * 1.5 + i) * 0.25;
        ctx.fillStyle = i % 4 === 0 ? `rgba(131,242,143,${blink})` : `rgba(84,216,255,${blink})`;
        ctx.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1);
      }
      ctx.restore();

      ctx.fillStyle = "#08131c";
      ctx.fillRect(0, 384, W, 156);
      ctx.fillStyle = "rgba(84,216,255,0.08)";
      ctx.fillRect(0, 345, W, 52);
      ctx.strokeStyle = "rgba(84,216,255,0.22)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 384);
      ctx.lineTo(W, 384);
      ctx.stroke();

      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = "rgba(84,216,255,0.12)";
      ctx.lineWidth = 1;
      const offset = (this.time * 18) % 48;
      for (let x = -48 + offset; x < W + 60; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 384);
        ctx.lineTo(x - 74, H);
        ctx.stroke();
      }
      for (let y = 404; y < H; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.restore();

      ctx.strokeStyle = "rgba(131,242,143,0.18)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(BASE_FRONT_X, LANE_Y + 28);
      ctx.lineTo(HIVE_FRONT_X, LANE_Y + 28);
      ctx.stroke();
    }

    drawBases(ctx) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.36)";
      ctx.fillRect(20, 365, 104, 16);
      ctx.fillStyle = "#102b3c";
      ctx.strokeStyle = "#54d8ff";
      ctx.lineWidth = 2;
      ctx.fillRect(28, 258, 60, 112);
      ctx.strokeRect(28, 258, 60, 112);
      ctx.fillStyle = "#173f54";
      ctx.fillRect(40, 218, 38, 42);
      ctx.strokeRect(40, 218, 38, 42);
      ctx.fillStyle = "#54d8ff";
      ctx.fillRect(52, 232, 14, 10);
      ctx.strokeStyle = "rgba(84,216,255,0.7)";
      ctx.beginPath();
      ctx.moveTo(88, 286);
      ctx.lineTo(BASE_FRONT_X, 306);
      ctx.lineTo(88, 330);
      ctx.stroke();
      const playerTurret = this.getUpgradeLevel("turret");
      ctx.strokeStyle = playerTurret > 0 ? "#83f28f" : "#54d8ff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(70, 268);
      ctx.lineTo(111 + playerTurret * 8, 260 - playerTurret * 3);
      ctx.stroke();
      ctx.fillStyle = playerTurret > 0 ? "#83f28f" : "#54d8ff";
      ctx.beginPath();
      ctx.arc(70, 268, 6 + playerTurret, 0, Math.PI * 2);
      ctx.fill();
      drawBar(ctx, 24, 246, 78, 8, this.baseHp / this.baseHpMax, "#83f28f", "rgba(0,0,0,0.65)");
      if (this.baseShieldTimer > 0) {
        const alpha = 0.28 + Math.sin(this.time * 9) * 0.08;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = "#54d8ff";
        ctx.fillStyle = "rgba(84,216,255,0.12)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(BASE_FRONT_X - 34, LANE_Y - 76, 58, 76, -0.08, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      ctx.fillStyle = "rgba(0,0,0,0.42)";
      ctx.fillRect(828, 366, 112, 16);
      ctx.fillStyle = "#2d0b25";
      ctx.strokeStyle = "#ff3f99";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(900, 220);
      ctx.bezierCurveTo(942, 250, 934, 330, 906, 370);
      ctx.bezierCurveTo(864, 354, 846, 288, 866, 240);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#c8ff71";
      ctx.beginPath();
      ctx.arc(895, 288, 18 + Math.sin(this.time * 5) * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(200,255,113,0.55)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(876, 318);
        ctx.quadraticCurveTo(850 - i * 6, 350 + Math.sin(this.time * 2 + i) * 8, 840 + i * 5, 378);
        ctx.stroke();
      }
      const enemyTurret = this.getEnemyUpgradeLevel("turret");
      ctx.strokeStyle = enemyTurret > 0 ? "#ffcf5a" : "#ff5b72";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(862, 266);
      ctx.lineTo(816 - enemyTurret * 8, 257 - enemyTurret * 4);
      ctx.stroke();
      ctx.fillStyle = enemyTurret > 0 ? "#ffcf5a" : "#ff5b72";
      ctx.beginPath();
      ctx.arc(862, 266, 7 + enemyTurret, 0, Math.PI * 2);
      ctx.fill();
      drawBar(ctx, 850, 246, 78, 8, this.hiveHp / this.hiveHpMax, "#ff5b72", "rgba(0,0,0,0.65)");
      if (this.hiveShieldTimer > 0) {
        const alpha = 0.26 + Math.sin(this.time * 9) * 0.08;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = "#ffcf5a";
        ctx.fillStyle = "rgba(255,207,90,0.12)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(HIVE_FRONT_X + 34, LANE_Y - 74, 72, 84, 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    drawEmpField(ctx) {
      const alpha = clamp(this.empVisualTimer / 0.55, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "#54d8ff";
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(W / 2, LANE_Y - 14, 95 + i * 85 + (1 - alpha) * 90, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawCanvasHud(ctx) {
      ctx.save();
      if (this.messageTimer > 0 || this.mode === "tutorial") {
        ctx.textAlign = "center";
        ctx.font = "900 25px Trebuchet MS, Arial";
        ctx.fillStyle = "rgba(4,9,14,0.7)";
        const text = this.mode === "tutorial" ? "Command link awaiting start" : this.message;
        const width = ctx.measureText(text).width + 42;
        ctx.fillRect(W / 2 - width / 2, 28, width, 42);
        ctx.strokeStyle = "rgba(84,216,255,0.35)";
        ctx.strokeRect(W / 2 - width / 2, 28, width, 42);
        ctx.fillStyle = "#d9f4ff";
        ctx.fillText(text, W / 2, 57);
      }

      if (this.mode === "playing" && this.messageTimer <= 0) {
        ctx.textAlign = "center";
        ctx.font = "800 16px Trebuchet MS, Arial";
        ctx.fillStyle = "rgba(255,207,90,0.85)";
        ctx.fillText(`Threat T${this.getThreatLevel()} · Alien AI: ${this.enemyLastChoice || "building energy"}`, W / 2, 88);
      }
      ctx.restore();
    }

    updateUi() {
      UI.energy.textContent = `${Math.floor(this.energy)} / ${this.energyMax}`;
      UI.enemyEnergy.textContent = `${Math.floor(this.enemyEnergy)} / ${this.enemyEnergyMax}`;
      UI.scrap.textContent = `${Math.floor(this.scrap)}`;
      UI.base.textContent = `${Math.ceil(this.baseHp)} / ${this.baseHpMax}`;
      UI.hive.textContent = `${Math.ceil(this.hiveHp)} / ${this.hiveHpMax}`;
      UI.wave.textContent = this.mode === "tutorial" ? "Ready" : `T${this.getThreatLevel()}`;
      UI.status.textContent = this.mode === "playing" ? "Online" :
        this.mode === "paused" ? "Paused" :
        this.mode === "tutorial" ? "Standby" :
        this.mode === "win" ? "Victory" : "Failed";
      UI.pauseButton.textContent = this.mode === "paused" ? "Resume" : "Pause";
      UI.pauseButton.disabled = this.mode === "tutorial" || this.mode === "win" || this.mode === "lose";

      for (const [type, btn] of this.summonButtons) {
        const stats = this.getPlayerUnitStats(type);
        const cd = this.summonCooldowns[type] || 0;
        const ready = this.mode === "playing" && this.energy >= stats.cost && cd <= 0;
        btn.disabled = !ready;
        const meta = cd > 0 ? `${fmt(cd)}s` : `${stats.cost} energy`;
        btn.innerHTML = `<span class="btn-name">${stats.label}</span><span class="btn-meta">${SUMMON_HOTKEYS[type]} · ${meta}</span>`;
      }

      for (const [key, btn] of this.skillButtons) {
        const skill = SKILLS[key];
        const cd = this.skillCooldowns[key] || 0;
        const readyCooldown = this.getSkillCooldown(key);
        btn.disabled = this.mode !== "playing" || cd > 0;
        btn.innerHTML = `<span class="btn-name">${skill.label}</span><span class="btn-meta">${SKILL_HOTKEYS[key]} · ${cd > 0 ? `${fmt(cd)}s` : `${fmt(readyCooldown)}s CD`}</span>`;
      }

      for (const [key, btn] of this.upgradeButtons) {
        const upgrade = UPGRADES[key];
        const level = this.getUpgradeLevel(key);
        const maxed = level >= upgrade.costs.length;
        const cost = maxed ? 0 : upgrade.costs[level];
        btn.disabled = this.mode !== "playing" || maxed || this.scrap < cost;
        const meta = maxed ? "MAX" : `${upgrade.hotkey} · ${cost} scrap`;
        btn.innerHTML = `<span class="btn-name">${upgrade.label} ${level}/${upgrade.costs.length}</span><span class="btn-meta">${meta}</span>`;
      }

      for (const [id, btn] of this.evolutionButtons) {
        const [type, choice] = id.split(":");
        const evolution = EVOLUTION_CHOICES[type][choice];
        const selected = this.evolutions[type] === choice;
        const lockedByOther = this.evolutions[type] && !selected;
        const cost = this.getEvolutionCost(type, choice);
        btn.disabled = this.mode !== "playing" || selected || lockedByOther || this.scrap < cost;
        const hotkeyIndex = Number(btn.dataset.hotkeyIndex);
        const hotkey = Number.isInteger(hotkeyIndex) ? evolutionHotkeyLabel(hotkeyIndex) : "";
        const state = selected ? "ACTIVE" : lockedByOther ? "LOCKED" : `${cost}`;
        const meta = hotkey ? `${hotkey} · ${state}` : state;
        btn.innerHTML = `<span class="btn-name">${evolution.short}</span><span class="btn-meta">${meta}</span>`;
      }
    }

    stateText() {
      const enemies = this.enemies.map((u) => ({
        type: u.type,
        label: u.label,
        variant: u.variant,
        x: Math.round(u.x),
        hp: Math.ceil(u.hp),
        bossTier: u.stats.bossTier || 0,
        slow: Number(u.slowTimer.toFixed(1)),
        stun: Number((u.stunTimer || 0).toFixed(1))
      }));
      const machines = this.players.map((u) => ({
        type: u.type,
        label: u.label,
        evolution: u.evolution,
        x: Math.round(u.x),
        hp: Math.ceil(u.hp),
        shield: Math.ceil(u.shieldHp || 0),
        stealth: Number((u.stealthTimer || 0).toFixed(1)),
        heat: Math.round(u.heat),
        shutdown: Number(u.shutdownTimer.toFixed(1))
      }));
      return JSON.stringify({
            note: "Canvas coordinates use origin top-left, x increases right, y increases down.",
        mode: this.mode,
        energy: Math.floor(this.energy),
        enemyEnergy: Math.floor(this.enemyEnergy),
        scrap: Math.floor(this.scrap),
        upgrades: { ...this.upgrades },
        enemyUpgrades: { ...this.enemyUpgrades },
        evolutions: { ...this.evolutions },
        baseHp: Math.ceil(this.baseHp),
        hiveHp: Math.ceil(this.hiveHp),
        threat: this.getThreatLevel(),
        bossKills: this.bossKills,
        bossSpawnIndex: this.bossSpawnIndex,
        bossRound: this.bossRound,
        baseRegen: {
          delay: Number((this.baseRegenTimer || 0).toFixed(1)),
          rate: Number(this.getFortressRegenRate(PLAYER).toFixed(1)),
          shield: Number((this.baseShieldTimer || 0).toFixed(1)),
          triggers: { ...this.baseShieldTriggers }
        },
        hiveRegen: {
          delay: Number((this.hiveRegenTimer || 0).toFixed(1)),
          rate: Number(this.getFortressRegenRate(ENEMY).toFixed(1)),
          shield: Number((this.hiveShieldTimer || 0).toFixed(1)),
          triggers: { ...this.hiveShieldTriggers }
        },
        enemyLastChoice: this.enemyLastChoice,
        machines,
        enemies,
        parts: this.parts.map((part) => ({ x: Math.round(part.x), y: Math.round(part.y), heal: part.heal })),
        skillPower: Object.fromEntries(Object.keys(SKILLS).map((key) => {
          const skill = this.getSkillPower(key);
          return [key, {
            cooldown: Number(skill.cooldown.toFixed(1)),
            damage: skill.damage || 0,
            duration: skill.duration ? Number(skill.duration.toFixed(1)) : 0,
            heal: skill.heal || 0
          }];
        })),
        skillCooldowns: Object.fromEntries(Object.entries(this.skillCooldowns).map(([k, v]) => [k, Number(v.toFixed(1))]))
      });
    }
  }

  const game = new Game();

  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
      const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
      this.beginPath();
      this.moveTo(x + radius, y);
      this.arcTo(x + w, y, x + w, y + h, radius);
      this.arcTo(x + w, y + h, x, y + h, radius);
      this.arcTo(x, y + h, x, y, radius);
      this.arcTo(x, y, x + w, y, radius);
      this.closePath();
      return this;
    };
  }

  let last = performance.now();
  function loop(now) {
    const dt = (now - last) / 1000;
    last = now;
    game.update(dt);
    game.render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  window.render_game_to_text = () => game.stateText();
  window.advanceTime = (ms) => {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i++) game.update(1 / 60);
    game.render();
    return game.stateText();
  };
  window.machineGuardGame = game;
})();
