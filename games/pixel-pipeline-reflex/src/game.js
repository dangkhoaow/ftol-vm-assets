export const STAGES = [
  {
    id: "fetch",
    label: "Fetch tile",
    short: "F",
    color: "#41d6a1",
    ink: "#07120d",
    hint: "Pull the next tile byte."
  },
  {
    id: "fifo",
    label: "FIFO queue",
    short: "Q",
    color: "#ffd166",
    ink: "#1f1500",
    hint: "Keep the pixel train fed."
  },
  {
    id: "mix",
    label: "Mix shade",
    short: "M",
    color: "#ef476f",
    ink: "#210008",
    hint: "Blend the right shade."
  },
  {
    id: "light",
    label: "Light LCD",
    short: "L",
    color: "#5cc8ff",
    ink: "#001520",
    hint: "Push it onto glass."
  }
];

export const DIFFICULTIES = {
  chill: {
    label: "Chill",
    targetFrames: 10,
    maxGlitches: 6,
    totalTime: 56,
    baseBeam: 7.3,
    minBeam: 4.7,
    lengthBump: 0
  },
  arcade: {
    label: "Arcade",
    targetFrames: 12,
    maxGlitches: 5,
    totalTime: 45,
    baseBeam: 6.2,
    minBeam: 3.4,
    lengthBump: 1
  },
  meltdown: {
    label: "Meltdown",
    targetFrames: 14,
    maxGlitches: 4,
    totalTime: 40,
    baseBeam: 5.1,
    minBeam: 2.8,
    lengthBump: 2
  }
};

const GLITCH_CELL = {
  stage: "glitch",
  short: "!",
  color: "#f8f4e3",
  ink: "#26130c"
};

export function getShanghaiDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

export function normalizeSeedText(seedText, fallback = getShanghaiDateKey()) {
  const normalized = String(seedText ?? "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_:-]/g, "")
    .slice(0, 36);

  return normalized || fallback;
}

export function buildRound(seedText, roundIndex, difficulty = "arcade") {
  const settings = getDifficulty(difficulty);
  const random = mulberry32(hashString(`${seedText}:${difficulty}:${roundIndex}`));
  const length = Math.min(9, 4 + settings.lengthBump + Math.floor(roundIndex / 3) + Math.floor(random() * 3));
  const sequence = [];

  let previous = "";
  for (let index = 0; index < length; index += 1) {
    let stage = STAGES[Math.floor(random() * STAGES.length)];
    if (stage.id === previous && random() > 0.35) {
      stage = STAGES[(STAGES.findIndex((candidate) => candidate.id === previous) + 1 + Math.floor(random() * 3)) % STAGES.length];
    }

    sequence.push(stage.id);
    previous = stage.id;
  }

  const palette = Array.from({ length: 16 }, (_, index) => {
    const stage = STAGES[(index + roundIndex) % STAGES.length];
    const jitter = Math.floor(random() * 32);
    return tintHex(stage.color, 0.86 + jitter / 260);
  });

  return {
    id: `frame-${roundIndex + 1}`,
    label: `Frame ${roundIndex + 1}`,
    sequence,
    palette,
    beamLimit: getBeamLimit(roundIndex, difficulty)
  };
}

export function createGame({ seedText = getShanghaiDateKey(), difficulty = "arcade" } = {}) {
  const cleanSeedText = normalizeSeedText(seedText);
  const settings = getDifficulty(difficulty);
  const round = buildRound(cleanSeedText, 0, difficulty);

  return {
    seedText: cleanSeedText,
    difficulty,
    settings,
    mode: "ready",
    roundIndex: 0,
    round,
    position: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    glitches: 0,
    completedFrames: 0,
    totalRemaining: settings.totalTime,
    beamRemaining: round.beamLimit,
    beamLimit: round.beamLimit,
    outputCells: [],
    lastEvent: "Ready. Press Start, then match the lit stages.",
    result: null
  };
}

export function startGame(game) {
  const fresh = createGame({ seedText: game.seedText, difficulty: game.difficulty });
  Object.assign(game, fresh, { mode: "running", lastEvent: "Pipeline armed. Feed the first packet." });
  return game;
}

export function setDifficulty(game, difficulty) {
  if (!DIFFICULTIES[difficulty]) {
    throw new Error(`Unknown difficulty: ${difficulty}`);
  }

  Object.assign(game, createGame({ seedText: game.seedText, difficulty }));
  return game;
}

export function togglePause(game) {
  if (game.mode === "running") {
    game.mode = "paused";
    game.lastEvent = "Paused. The beam is holding.";
    return true;
  }

  if (game.mode === "paused") {
    game.mode = "running";
    game.lastEvent = "Beam released.";
    return true;
  }

  return false;
}

export function pressStage(game, stageId) {
  if (game.mode === "ready" || game.mode === "ended") {
    startGame(game);
  }

  if (game.mode !== "running") {
    return false;
  }

  const expected = getCurrentStage(game);
  if (!expected) {
    completeRound(game);
    return true;
  }

  if (stageId === expected.id) {
    const streakBonus = Math.min(160, game.combo * 8);
    const timeBonus = Math.round(game.beamRemaining * 10);
    game.combo += 1;
    game.bestCombo = Math.max(game.bestCombo, game.combo);
    game.score += 90 + streakBonus + timeBonus;
    game.outputCells.push({
      stage: expected.id,
      short: expected.short,
      color: expected.color,
      ink: expected.ink
    });
    game.position += 1;
    game.lastEvent = `${expected.label} locked.`;

    if (game.position >= game.round.sequence.length) {
      completeRound(game);
    }

    return true;
  }

  addGlitch(game, `Wrong stage. Expected ${expected.label}.`, { advance: false });
  game.score = Math.max(0, game.score - 80);
  game.beamRemaining = Math.max(0.45, game.beamRemaining - 0.9);
  return false;
}

export function tick(game, dt) {
  if (game.mode !== "running") {
    return game;
  }

  const step = Math.max(0, dt);
  game.totalRemaining = Math.max(0, game.totalRemaining - step);
  game.beamRemaining = Math.max(0, game.beamRemaining - step);

  if (game.totalRemaining <= 0) {
    endGame(game, "time", "Time called. The display froze on your best signal.");
    return game;
  }

  if (game.beamRemaining <= 0) {
    addGlitch(game, "Scan beam caught the packet.", { advance: true });
  }

  return game;
}

export function getCurrentStage(game) {
  const stageId = game.round.sequence[game.position];
  return STAGES.find((stage) => stage.id === stageId) ?? null;
}

export function getUpcomingStages(game) {
  return game.round.sequence.slice(game.position).map((stageId) => STAGES.find((stage) => stage.id === stageId));
}

export function buildShareText(game) {
  const difficulty = DIFFICULTIES[game.difficulty]?.label ?? game.difficulty;
  const outcome = game.result?.headline ?? getLiveHeadline(game);
  return `Scanline Sprint ${game.seedText} ${difficulty}: ${outcome}, ${game.completedFrames}/${game.settings.targetFrames} frames, ${game.score} pts, best combo x${game.bestCombo}.`;
}

export function buildChallengeUrl(currentUrl, seedText) {
  let url;
  try {
    url = new URL(currentUrl);
  } catch {
    return "";
  }

  if (!["http:", "https:"].includes(url.protocol) || isLocalHost(url.hostname)) {
    return "";
  }

  url.searchParams.set("seed", normalizeSeedText(seedText));
  return url.toString();
}

export function getLiveHeadline(game) {
  if (game.mode === "ready") {
    return "ready to feed the beam";
  }

  if (game.mode === "paused") {
    return "paused with the beam held";
  }

  if (game.result?.type === "stable") {
    return "signal stable";
  }

  if (game.result?.type === "crashed") {
    return "signal crashed";
  }

  if (game.result?.type === "time") {
    return "time up";
  }

  return "pipeline live";
}

function completeRound(game) {
  const clearBonus = Math.round(260 + game.beamRemaining * 35 + game.combo * 6);
  game.score += clearBonus;
  game.completedFrames += 1;
  game.lastEvent = `${game.round.label} stabilized. +${clearBonus}`;

  if (game.completedFrames >= game.settings.targetFrames) {
    endGame(game, "stable", "Signal stable. The full frame survived.");
    return;
  }

  game.roundIndex += 1;
  game.round = buildRound(game.seedText, game.roundIndex, game.difficulty);
  game.position = 0;
  game.beamLimit = game.round.beamLimit;
  game.beamRemaining = game.round.beamLimit;
}

function addGlitch(game, message, { advance }) {
  game.glitches += 1;
  game.combo = 0;
  game.outputCells.push(GLITCH_CELL);
  game.lastEvent = message;

  if (game.glitches >= game.settings.maxGlitches) {
    endGame(game, "crashed", "Signal crashed. Too many bad pixels hit the glass.");
    return;
  }

  if (advance) {
    game.roundIndex += 1;
    game.round = buildRound(game.seedText, game.roundIndex, game.difficulty);
    game.position = 0;
    game.beamLimit = game.round.beamLimit;
    game.beamRemaining = game.round.beamLimit;
  }
}

function endGame(game, type, message) {
  const headlineByType = {
    stable: "signal stable",
    crashed: "signal crashed",
    time: "time up"
  };

  game.mode = "ended";
  game.result = {
    type,
    headline: headlineByType[type] ?? "run ended",
    message
  };
  game.lastEvent = message;
}

function getDifficulty(difficulty) {
  return DIFFICULTIES[difficulty] ?? DIFFICULTIES.arcade;
}

function getBeamLimit(roundIndex, difficulty) {
  const settings = getDifficulty(difficulty);
  return Math.max(settings.minBeam, settings.baseBeam - roundIndex * 0.18);
}

function hashString(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function mulberry32(seed) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function tintHex(hex, amount) {
  const clean = hex.replace("#", "");
  const red = clampColor(parseInt(clean.slice(0, 2), 16) * amount);
  const green = clampColor(parseInt(clean.slice(2, 4), 16) * amount);
  const blue = clampColor(parseInt(clean.slice(4, 6), 16) * amount);
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function clampColor(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function toHex(value) {
  return value.toString(16).padStart(2, "0");
}

function isLocalHost(hostname) {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname);
}
