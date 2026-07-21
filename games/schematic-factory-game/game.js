/* ========== BLUEPRINT · v0.9.9 · Phase 4+5 (Redesign) ==========
   Prestige-driven tree with Schematics currency. Leveled + unlock nodes.
   MK-IV / MK-V machines (10 new). New mechanics: momentum, lossless,
   bulk-buy, auto-buy, auto-click, double-pay.
*/

(() => {
  'use strict';

  // ---------- CONSTANTS ----------
  const SAVE_KEY = 'ftol:schematicfactorygame:save.v1';
  // Rolling backup slot. Mirrored from the primary save no more than once
  // per minute. If the primary save is ever unreadable (partial write /
  // quota-exceeded corruption / JSON.parse throw) load() falls back here
  // and the player resumes from a state at most ~60 s older instead of
  // being reset to a fresh game.
  const SAVE_BACKUP_KEY = 'ftol:schematicfactorygame:save.v1.backup';
  const SAVE_BACKUP_INTERVAL_MS = 60 * 1000;
  const SAVE_INTERVAL = 5000;
  const OFFLINE_CAP_MS = 8 * 3600 * 1000;
  const OFFLINE_REPORT_MS = 30_000;
  const VERSION = '0.9.10';
  const LOG_MAX = 20;
  const MOMENTUM_CAP = 0.5;          // +50% max from momentum
  const LOSSLESS_FLOOR = 0.5;        // bottlenecked production floor
  const AUTO_BUY_INTERVAL_MS = 250;  // how often auto-buy attempts per machine

  // Manual click recipes — each click adds `baseMul` progress; when progress >= goal
  // and input is available, 1 unit is produced (and inputCost of prev-tier consumed).
  // Click research (Heavy Hands, Strength, Critical, Double Strike, Transcend) reduces
  // effective clicks-to-completion by boosting baseMul.
  //
  // Tier goals scale ~5×–10× per tier so late-game clicks can't trivialize upper tiers.
  // Machines remain the dominant production path; clicking is a bootstrap / emergency tool.
  const CLICK_RECIPE = {
    ore:       { goal: 1,       inRes: null,      inputCost: 0 },
    ingot:     { goal: 50,      inRes: 'ore',     inputCost: 3 },
    part:      { goal: 250,     inRes: 'ingot',   inputCost: 3 },
    circuit:   { goal: 2000,    inRes: 'part',    inputCost: 3 },
    core:      { goal: 20000,   inRes: 'circuit', inputCost: 3 },
    prototype: { goal: 200000,  inRes: 'core',    inputCost: 3 },
  };

  // ---------- TIERS ----------
  const TIERS = [
    { id: 1, name: 'EXTRACTION',  resource: 'ore'       },
    { id: 2, name: 'SMELTING',    resource: 'ingot'     },
    { id: 3, name: 'FABRICATION', resource: 'part'      },
    { id: 4, name: 'ASSEMBLY',    resource: 'circuit'   },
    { id: 5, name: 'CORE FORGE',  resource: 'core'      },
    { id: 6, name: 'REFINEMENT',  resource: 'prototype' },
  ];

  // Tier unlocks: purchased with Schematics. Permanent across prestige.
  // T6 is intentionally steep — gates the meta-prestige loop.
  // v0.7.0 balance: doubled tier-unlock costs so later tiers require several
  // more publishes of mature production rather than being available on run 2-3.
  const TIER_UNLOCKS = {
    2: { cost: 6,    name: 'T2 · SMELTING' },
    3: { cost: 30,   name: 'T3 · FABRICATION' },
    4: { cost: 120,  name: 'T4 · ASSEMBLY' },
    5: { cost: 500,  name: 'T5 · CORE FORGE' },
    6: { cost: 2500, name: 'T6 · REFINEMENT' },
  };

  // ---------- ICONS ----------
  const ICONS = {
    drill:       `<svg viewBox="0 0 32 32"><rect x="6" y="14" width="20" height="14"/><path d="M 10 14 L 16 6 L 22 14"/><line x1="13" y1="22" x2="13" y2="26"/><line x1="19" y1="22" x2="19" y2="26"/></svg>`,
    miner:       `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="10"/><circle cx="16" cy="16" r="3" fill="currentColor" stroke="none"/></svg>`,
    excavator:   `<svg viewBox="0 0 32 32"><polygon points="16,4 28,10 28,22 16,28 4,22 4,10"/><line x1="10" y1="16" x2="22" y2="16"/></svg>`,
    deep_drill:  `<svg viewBox="0 0 32 32"><rect x="5" y="12" width="22" height="16"/><path d="M 8 12 L 16 4 L 24 12"/><line x1="11" y1="20" x2="11" y2="28"/><line x1="16" y1="20" x2="16" y2="28"/><line x1="21" y1="20" x2="21" y2="28"/></svg>`,
    core_extractor: `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12"/><circle cx="16" cy="16" r="7"/><circle cx="16" cy="16" r="2" fill="currentColor" stroke="none"/><line x1="2" y1="16" x2="6" y2="16"/><line x1="26" y1="16" x2="30" y2="16"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="16" y1="26" x2="16" y2="30"/></svg>`,
    furnace:     `<svg viewBox="0 0 32 32"><rect x="8" y="10" width="16" height="16"/><path d="M 12 10 Q 16 4 20 10"/><path d="M 13 22 Q 16 16 19 22"/></svg>`,
    smelter:     `<svg viewBox="0 0 32 32"><polygon points="8,8 24,8 20,26 12,26"/><line x1="12" y1="16" x2="20" y2="16"/></svg>`,
    foundry:     `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="10"/><line x1="8" y1="16" x2="24" y2="16"/><line x1="16" y1="8" x2="16" y2="24"/></svg>`,
    crucible:    `<svg viewBox="0 0 32 32"><path d="M 6 8 L 26 8 L 22 28 L 10 28 Z"/><ellipse cx="16" cy="10" rx="10" ry="2"/><line x1="12" y1="20" x2="20" y2="20"/></svg>`,
    arc_forge:   `<svg viewBox="0 0 32 32"><polygon points="6,20 14,4 14,14 22,14 18,28 18,18 10,18"/></svg>`,
    press:       `<svg viewBox="0 0 32 32"><rect x="6" y="12" width="20" height="10"/><circle cx="11" cy="17" r="2.5" fill="currentColor" stroke="none"/><circle cx="21" cy="17" r="2.5" fill="currentColor" stroke="none"/><line x1="6" y1="26" x2="26" y2="26"/></svg>`,
    fabricator:  `<svg viewBox="0 0 32 32"><rect x="6" y="6" width="20" height="20"/><rect x="11" y="11" width="10" height="10" fill="currentColor" stroke="none"/></svg>`,
    lathe:       `<svg viewBox="0 0 32 32"><polygon points="16,6 26,26 6,26"/><line x1="11" y1="20" x2="21" y2="20"/></svg>`,
    mill:        `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="8"/><line x1="16" y1="4" x2="16" y2="10"/><line x1="16" y1="22" x2="16" y2="28"/><line x1="4" y1="16" x2="10" y2="16"/><line x1="22" y1="16" x2="28" y2="16"/><line x1="8" y1="8" x2="12" y2="12"/><line x1="20" y1="20" x2="24" y2="24"/><line x1="24" y1="8" x2="20" y2="12"/><line x1="12" y1="20" x2="8" y2="24"/></svg>`,
    injector:    `<svg viewBox="0 0 32 32"><rect x="12" y="4" width="8" height="18"/><polygon points="10,22 22,22 16,30"/><line x1="14" y1="10" x2="18" y2="10"/><line x1="14" y1="14" x2="18" y2="14"/></svg>`,
    assembler:   `<svg viewBox="0 0 32 32"><rect x="5" y="10" width="22" height="14"/><rect x="10" y="14" width="5" height="6"/><rect x="17" y="14" width="5" height="6"/></svg>`,
    wirer:       `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="9"/><line x1="7" y1="16" x2="25" y2="16"/><line x1="16" y1="7" x2="16" y2="25"/><line x1="10" y1="10" x2="22" y2="22"/></svg>`,
    printer:     `<svg viewBox="0 0 32 32"><rect x="6" y="8" width="20" height="6"/><rect x="6" y="17" width="20" height="6"/><circle cx="10" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="10" cy="20" r="1" fill="currentColor" stroke="none"/></svg>`,
    modulator:   `<svg viewBox="0 0 32 32"><rect x="6" y="10" width="20" height="12"/><line x1="10" y1="4" x2="10" y2="10"/><line x1="16" y1="4" x2="16" y2="10"/><line x1="22" y1="4" x2="22" y2="10"/><line x1="10" y1="22" x2="10" y2="28"/><line x1="22" y1="22" x2="22" y2="28"/></svg>`,
    quantum_wire:`<svg viewBox="0 0 32 32"><path d="M 4 16 Q 8 8 12 16 T 20 16 T 28 16" fill="none"/><circle cx="4" cy="16" r="1.5" fill="currentColor" stroke="none"/><circle cx="28" cy="16" r="1.5" fill="currentColor" stroke="none"/><circle cx="16" cy="16" r="2.5"/></svg>`,
    forge:       `<svg viewBox="0 0 32 32"><polygon points="16,4 28,16 16,28 4,16"/><circle cx="16" cy="16" r="3" fill="currentColor" stroke="none"/></svg>`,
    compiler:    `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="10"/><circle cx="16" cy="16" r="5"/><circle cx="16" cy="16" r="1.5" fill="currentColor" stroke="none"/></svg>`,
    synthesizer: `<svg viewBox="0 0 32 32"><polygon points="16,4 19,13 28,13 21,19 24,28 16,22 8,28 11,19 4,13 13,13"/></svg>`,
    resonator:   `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="3"/><circle cx="16" cy="16" r="7" opacity="0.7"/><circle cx="16" cy="16" r="11" opacity="0.4"/></svg>`,
    star_forge:  `<svg viewBox="0 0 32 32"><polygon points="16,2 18,10 26,6 22,14 30,16 22,18 26,26 18,22 16,30 14,22 6,26 10,18 2,16 10,14 6,6 14,10" stroke-linejoin="round"/></svg>`,
  };

  // ---------- MACHINES ----------
  // slot: position within the 5-wide tier row. mk: base | mk4 | mk5 (gates on tree unlock).
  // v0.6.3 balance pass: slots 1-3 costMul +0.02 across T1-T5 so base machines
  // hit their exponential wall sooner. The 51st drill used to cost ~30K ore —
  // the same as a single MK-IV deep_drill (5× the output). With the tighter
  // curve, that break-even point moves to ~43 drills, pushing the upgrade
  // decision naturally. MK-IV / MK-V costs unchanged — making them cheaper
  // only accelerates runs, which was the other half of the feedback. T6
  // untouched (no MK slots, already steep costMul).
  const MACHINES = {
    // T1 · Extraction
    drill:          { tier: 1, slot: 1, mk: 'base', name: 'DRILL',          produces: { ore: 1 },        consumes: {},                cost: { ore: 10 },          costMul: 1.19, icon: ICONS.drill },
    miner:          { tier: 1, slot: 2, mk: 'base', name: 'MINER',          produces: { ore: 6 },        consumes: {},                cost: { ore: 120 },         costMul: 1.21, icon: ICONS.miner },
    excavator:      { tier: 1, slot: 3, mk: 'base', name: 'EXCAVATOR',      produces: { ore: 40 },       consumes: {},                cost: { ore: 2000 },        costMul: 1.23, icon: ICONS.excavator },
    deep_drill:     { tier: 1, slot: 4, mk: 'mk4',  name: 'DEEP DRILL',     produces: { ore: 200 },      consumes: {},                cost: { ore: 30000 },       costMul: 1.24, icon: ICONS.deep_drill },
    core_extractor: { tier: 1, slot: 5, mk: 'mk5',  name: 'CORE EXTRACTOR', produces: { ore: 1000 },     consumes: {},                cost: { ore: 500000 },      costMul: 1.27, icon: ICONS.core_extractor },

    // T2 · Smelting
    furnace:        { tier: 2, slot: 1, mk: 'base', name: 'FURNACE',        produces: { ingot: 1 },      consumes: { ore: 3 },        cost: { ore: 100 },         costMul: 1.21, icon: ICONS.furnace },
    smelter:        { tier: 2, slot: 2, mk: 'base', name: 'SMELTER',        produces: { ingot: 6 },      consumes: { ore: 18 },       cost: { ore: 1000, ingot: 10 },          costMul: 1.23, icon: ICONS.smelter },
    foundry:        { tier: 2, slot: 3, mk: 'base', name: 'FOUNDRY',        produces: { ingot: 40 },     consumes: { ore: 120 },      cost: { ore: 15000, ingot: 200 },        costMul: 1.25, icon: ICONS.foundry },
    crucible:       { tier: 2, slot: 4, mk: 'mk4',  name: 'CRUCIBLE',       produces: { ingot: 200 },    consumes: { ore: 600 },      cost: { ore: 200000, ingot: 3000 },      costMul: 1.25, icon: ICONS.crucible },
    arc_forge:      { tier: 2, slot: 5, mk: 'mk5',  name: 'ARC FORGE',      produces: { ingot: 1000 },   consumes: { ore: 3000 },     cost: { ore: 3000000, ingot: 50000 },    costMul: 1.27, icon: ICONS.arc_forge },

    // T3 · Fabrication
    press:          { tier: 3, slot: 1, mk: 'base', name: 'PRESS',          produces: { part: 1 },       consumes: { ingot: 3 },      cost: { ingot: 200 },       costMul: 1.22, icon: ICONS.press },
    fabricator:     { tier: 3, slot: 2, mk: 'base', name: 'FABRICATOR',     produces: { part: 6 },       consumes: { ingot: 18 },     cost: { ingot: 2000, part: 20 },         costMul: 1.24, icon: ICONS.fabricator },
    lathe:          { tier: 3, slot: 3, mk: 'base', name: 'LATHE',          produces: { part: 40 },      consumes: { ingot: 120 },    cost: { ingot: 30000, part: 500 },       costMul: 1.26, icon: ICONS.lathe },
    mill:           { tier: 3, slot: 4, mk: 'mk4',  name: 'MILL',           produces: { part: 200 },     consumes: { ingot: 600 },    cost: { ingot: 500000, part: 10000 },    costMul: 1.25, icon: ICONS.mill },
    injector:       { tier: 3, slot: 5, mk: 'mk5',  name: 'INJECTOR',       produces: { part: 1000 },    consumes: { ingot: 3000 },   cost: { ingot: 8000000, part: 150000 },  costMul: 1.27, icon: ICONS.injector },

    // T4 · Assembly
    assembler:      { tier: 4, slot: 1, mk: 'base', name: 'ASSEMBLER',      produces: { circuit: 1 },    consumes: { part: 3 },       cost: { part: 400 },        costMul: 1.23, icon: ICONS.assembler },
    wirer:          { tier: 4, slot: 2, mk: 'base', name: 'WIRER',          produces: { circuit: 6 },    consumes: { part: 18 },      cost: { part: 4000, circuit: 30 },         costMul: 1.25, icon: ICONS.wirer },
    printer:        { tier: 4, slot: 3, mk: 'base', name: 'PRINTER',        produces: { circuit: 40 },   consumes: { part: 120 },     cost: { part: 70000, circuit: 800 },       costMul: 1.27, icon: ICONS.printer },
    modulator:      { tier: 4, slot: 4, mk: 'mk4',  name: 'MODULATOR',      produces: { circuit: 200 },  consumes: { part: 600 },     cost: { part: 1000000, circuit: 15000 },   costMul: 1.26, icon: ICONS.modulator },
    quantum_wire:   { tier: 4, slot: 5, mk: 'mk5',  name: 'QUANTUM WIRE',   produces: { circuit: 1000 }, consumes: { part: 3000 },    cost: { part: 20000000, circuit: 250000 }, costMul: 1.28, icon: ICONS.quantum_wire },

    // T5 · Core Forge
    forge:          { tier: 5, slot: 1, mk: 'base', name: 'FORGE',          produces: { core: 1 },       consumes: { circuit: 3 },    cost: { circuit: 800 },     costMul: 1.24, icon: ICONS.forge },
    compiler:       { tier: 5, slot: 2, mk: 'base', name: 'COMPILER',       produces: { core: 6 },       consumes: { circuit: 18 },   cost: { circuit: 8000, core: 50 },           costMul: 1.26, icon: ICONS.compiler },
    synthesizer:    { tier: 5, slot: 3, mk: 'base', name: 'SYNTHESIZER',    produces: { core: 40 },      consumes: { circuit: 120 },  cost: { circuit: 150000, core: 1200 },       costMul: 1.28, icon: ICONS.synthesizer },
    resonator:      { tier: 5, slot: 4, mk: 'mk4',  name: 'RESONATOR',      produces: { core: 200 },     consumes: { circuit: 600 },  cost: { circuit: 2000000, core: 25000 },     costMul: 1.27, icon: ICONS.resonator },
    star_forge:     { tier: 5, slot: 5, mk: 'mk5',  name: 'STAR FORGE',     produces: { core: 1000 },    consumes: { circuit: 3000 }, cost: { circuit: 35000000, core: 400000 },   costMul: 1.29, icon: ICONS.star_forge },

    // T6 · Refinement (feeds the meta-prestige Publish loop)
    // v0.9.2 balance: output halved across the tier. Player feedback was that
    // the first run to produce prototypes already stockpiled enough for most
    // of the mastery library. Halving T6 rates doubles the time to accumulate
    // prototypes without changing consumption ratios or costs.
    refiner:        { tier: 6, slot: 1, mk: 'base', name: 'REFINER',        produces: { prototype: 0.005 }, consumes: { core: 1 },     cost: { core: 1000000 },   costMul: 1.27, icon: ICONS.compiler },
    compactor:      { tier: 6, slot: 2, mk: 'base', name: 'COMPACTOR',      produces: { prototype: 0.025 }, consumes: { core: 5 },     cost: { core: 10000000 },  costMul: 1.3, icon: ICONS.fabricator },
    prototyper:     { tier: 6, slot: 3, mk: 'base', name: 'PROTOTYPER',     produces: { prototype: 0.1 },   consumes: { core: 20 },    cost: { core: 100000000 }, costMul: 1.32, icon: ICONS.forge },
  };

  // ---------- SUPPORTS ----------
  const SUPPORTS = {
    power: { id: 'power', name: 'POWER NODE',  desc: 'Each unit: <b>+10%</b> global production.',                   cost: { circuit: 50 }, costMul: 1.35, unlockTier: 4, effect: { prodMul: 0.10 } },
    relay: { id: 'relay', name: 'BOOST RELAY', desc: 'Each unit: <b>+15%</b> production, <b>-5%</b> consumption.', cost: { core: 3 },     costMul: 1.5,  unlockTier: 5, effect: { prodMul: 0.15, consMul: -0.05 } },
  };

  // ---------- TREE NODES ----------
  // type: 'leveled' | 'unlock' | 'origin'
  // leveled: costForLevel(nextLevel) → schematics cost to buy that level
  // unlock: cost → one-time schematics cost
  // Progressive reveal: leveled node predecessor needs 50%+ levels; unlock predecessor needs to be owned.
  const TREE_NODES = {
    origin: {
      type: 'origin', name: 'ORIGIN', desc: 'The seed of all research. <b>Free</b> — click to begin.',
      branch: 'origin', pos: { angle: 0, r: 0 }, requires: [],
    },

    // ═══════════════════ SPEED (60°) ═══════════════════
    speed_1:   { type: 'leveled', name: 'SWIFT MECHANISM', desc: '<b>+10% production</b> per level.',
                 branch: 'speed', pos: { angle: 60, r: 1 }, requires: ['origin'],
                 maxLevel: 5, costForLevel: (L) => L * 6,
                 applyEffect: (m, L) => { m.prodMul *= (1 + 0.10 * L); } },
    momentum:  { type: 'unlock',  name: 'MOMENTUM', desc: '<b>+0.5% production per machine owned</b> (capped at +50%).',
                 branch: 'speed', pos: { angle: 60, r: 2 }, requires: ['speed_1'], cost: 35,
                 applyEffect: (m) => { m.momentum += 0.005; } },
    speed_2:   { type: 'leveled', name: 'ACCELERATE', desc: '<b>+15% production</b> per level.',
                 branch: 'speed', pos: { angle: 60, r: 3 }, requires: ['momentum'],
                 maxLevel: 5, costForLevel: (L) => L * 15,
                 applyEffect: (m, L) => { m.prodMul *= (1 + 0.15 * L); } },
    catalyst:  { type: 'leveled', name: 'CATALYST', desc: '<b>+25% production</b> per level.',
                 branch: 'speed', pos: { angle: 60, r: 4 }, requires: ['speed_2'],
                 maxLevel: 3, costForLevel: (L) => L * 36,
                 applyEffect: (m, L) => { m.prodMul *= (1 + 0.25 * L); } },
    speed_3:   { type: 'leveled', name: 'OVERCLOCK', desc: '<b>+30% production</b> per level.',
                 branch: 'speed', pos: { angle: 60, r: 5 }, requires: ['catalyst'],
                 maxLevel: 5, costForLevel: (L) => L * 60,
                 applyEffect: (m, L) => { m.prodMul *= (1 + 0.30 * L); } },
    apex:      { type: 'unlock',  name: 'APEX SPEED', desc: '<b>+100% production</b>. One-time flat boost.',
                 branch: 'speed', pos: { angle: 60, r: 6 }, requires: ['speed_3'], cost: 500,
                 applyEffect: (m) => { m.prodMul *= 2; } },
    infinity:  { type: 'leveled', name: 'INFINITY', desc: '<b>+75% production</b> per level.',
                 branch: 'speed', pos: { angle: 60, r: 7 }, requires: ['apex'],
                 maxLevel: 3, costForLevel: (L) => L * 360,
                 applyEffect: (m, L) => { m.prodMul *= (1 + 0.75 * L); } },
    perpetual_motion: { type: 'unlock', name: 'PERPETUAL MOTION',
                 desc: 'Machines produce at <b>100% rate</b> even when input-starved. Overrides Lossless.',
                 branch: 'speed', pos: { angle: 60, r: 8 }, requires: ['infinity'], cost: 800,
                 applyEffect: (m) => { m.perpetualMotion = true; } },

    // ═══════════════════ LOGISTICS (120°) ═══════════════════
    heavy_hands:  { type: 'leveled', name: 'HEAVY HANDS', desc: '<b>+5 click power</b> per level.',
                    branch: 'logistics', pos: { angle: 120, r: 1 }, requires: ['origin'],
                    maxLevel: 8, costForLevel: (L) => L * 3,
                    applyEffect: (m, L) => { m.clickAdd += 5 * L; } },
    auto_click:   { type: 'unlock',  name: 'AUTO-CLICK', desc: '<b>1 auto-click per second</b>.',
                    branch: 'logistics', pos: { angle: 120, r: 2 }, requires: ['heavy_hands'], cost: 45,
                    applyEffect: (m) => { m.autoClickPerSec += 1; } },
    click_speed:  { type: 'leveled', name: 'RAPID FIRE', desc: '<b>+1 auto-click/sec</b> per level.',
                    branch: 'logistics', pos: { angle: 120, r: 3 }, requires: ['auto_click'],
                    maxLevel: 5, costForLevel: (L) => L * 15,
                    applyEffect: (m, L) => { m.autoClickPerSec += L; } },
    click_power:  { type: 'leveled', name: 'STRENGTH', desc: '<b>+15 click power</b> per level.',
                    branch: 'logistics', pos: { angle: 120, r: 4 }, requires: ['click_speed'],
                    maxLevel: 5, costForLevel: (L) => L * 18,
                    applyEffect: (m, L) => { m.clickAdd += 15 * L; } },
    critical:     { type: 'unlock',  name: 'CRITICAL HIT', desc: '<b>10% chance</b> each click to land a <b>×3 critical</b>.',
                    branch: 'logistics', pos: { angle: 120, r: 5 }, requires: ['click_power'], cost: 150,
                    applyEffect: (m) => { m.critChance = 0.10; m.critMul = 3; } },
    double_click: { type: 'unlock',  name: 'DOUBLE STRIKE', desc: 'Each click counts <b>twice</b>.',
                    branch: 'logistics', pos: { angle: 120, r: 6 }, requires: ['critical'], cost: 400,
                    applyEffect: (m) => { m.clickMul += 1.0; } },
    transcend:    { type: 'leveled', name: 'TRANSCEND', desc: '<b>+75 click power</b> per level.',
                    branch: 'logistics', pos: { angle: 120, r: 7 }, requires: ['double_click'],
                    maxLevel: 3, costForLevel: (L) => L * 240,
                    applyEffect: (m, L) => { m.clickAdd += 75 * L; } },
    crit_cascade: { type: 'unlock', name: 'CRIT CASCADE',
                    desc: 'Critical clicks trigger a <b>3-second ×2 production burst</b>.',
                    branch: 'logistics', pos: { angle: 120, r: 8 }, requires: ['transcend'], cost: 650,
                    applyEffect: (m) => { m.critCascade = true; } },

    // ═══════════════════ YIELD (180°) ═══════════════════
    yield_1:     { type: 'leveled', name: 'ORE WELL', desc: '<b>+3 ore/s passive</b> per level.',
                   branch: 'yield', pos: { angle: 180, r: 1 }, requires: ['origin'],
                   maxLevel: 5, costForLevel: (L) => L * 6,
                   applyEffect: (m, L) => { m.freeRes.ore += 3 * L; } },
    double_pay:  { type: 'unlock',  name: 'DOUBLE PAY', desc: 'Cores count <b>1.5×</b> for Schematics on prestige.',
                   branch: 'yield', pos: { angle: 180, r: 2 }, requires: ['yield_1'], cost: 90,
                   applyEffect: (m) => { m.doublePay = Math.max(m.doublePay, 1.5); } },
    yield_2:     { type: 'leveled', name: 'INGOT VEIN', desc: '<b>+1 ingot/s passive</b> per level.',
                   branch: 'yield', pos: { angle: 180, r: 3 }, requires: ['double_pay'],
                   maxLevel: 5, costForLevel: (L) => L * 18,
                   applyEffect: (m, L) => { m.freeRes.ingot += 1 * L; } },
    yield_3:     { type: 'leveled', name: 'PART STREAM', desc: '<b>+0.2 part/s passive</b> per level.',
                   branch: 'yield', pos: { angle: 180, r: 4 }, requires: ['yield_2'],
                   maxLevel: 5, costForLevel: (L) => L * 36,
                   applyEffect: (m, L) => { m.freeRes.part += 0.2 * L; } },
    triple_pay:  { type: 'unlock',  name: 'TRIPLE PAY', desc: 'Cores count <b>2×</b> for Schematics.',
                   branch: 'yield', pos: { angle: 180, r: 5 }, requires: ['yield_3'], cost: 300,
                   applyEffect: (m) => { m.doublePay = Math.max(m.doublePay, 2); } },
    yield_4:     { type: 'leveled', name: 'CIRCUIT FLOW', desc: '<b>+0.05 circuit/s passive</b> per level.',
                   branch: 'yield', pos: { angle: 180, r: 6 }, requires: ['triple_pay'],
                   maxLevel: 3, costForLevel: (L) => L * 90,
                   applyEffect: (m, L) => { m.freeRes.circuit += 0.05 * L; } },
    abundance:   { type: 'unlock',  name: 'ABUNDANCE', desc: '<b>Doubles</b> all Yield passive effects.',
                   branch: 'yield', pos: { angle: 180, r: 7 }, requires: ['yield_4'], cost: 800,
                   applyEffect: (m) => { for (const r in m.freeRes) m.freeRes[r] *= 2; } },
    golden_tick: { type: 'unlock',  name: 'GOLDEN TICK',
                   desc: 'Every <b>60 seconds</b>, a random tier surges <b>×10 production for 5 seconds</b>.',
                   branch: 'yield', pos: { angle: 180, r: 8 }, requires: ['abundance'], cost: 900,
                   applyEffect: (m) => { m.goldenTick = true; } },

    // ═══════════════════ AUTOMATION (240°) ═══════════════════
    auto_1:   { type: 'leveled', name: 'CHEAP PARTS', desc: '<b>-7% machine cost</b> per level.',
                branch: 'automation', pos: { angle: 240, r: 1 }, requires: ['origin'],
                maxLevel: 5, costForLevel: (L) => L * 6,
                applyEffect: (m, L) => { m.costMul *= Math.pow(0.93, L); } },
    bulk_buy: { type: 'unlock',  name: 'BULK BUY', desc: '<b>×10</b> / <b>×100</b> buy modes.',
                branch: 'automation', pos: { angle: 240, r: 2 }, requires: ['auto_1'], cost: 35,
                applyEffect: (m) => { m.bulkBuy = true; } },
    auto_2:   { type: 'leveled', name: 'STREAMLINE', desc: '<b>-5% machine cost</b> per level.',
                branch: 'automation', pos: { angle: 240, r: 3 }, requires: ['bulk_buy'],
                maxLevel: 5, costForLevel: (L) => L * 15,
                applyEffect: (m, L) => { m.costMul *= Math.pow(0.95, L); } },
    auto_buy: { type: 'unlock',  name: 'AUTO-BUY', desc: '<b>Right-click</b> a machine to toggle auto-purchase.',
                branch: 'automation', pos: { angle: 240, r: 4 }, requires: ['auto_2'], cost: 150,
                applyEffect: (m) => { m.autoBuy = true; } },
    auto_3:   { type: 'leveled', name: 'MASS PRODUCTION', desc: '<b>-5% machine cost</b> per level.',
                branch: 'automation', pos: { angle: 240, r: 5 }, requires: ['auto_buy'],
                maxLevel: 5, costForLevel: (L) => L * 30,
                applyEffect: (m, L) => { m.costMul *= Math.pow(0.95, L); } },
    max_buy:  { type: 'unlock',  name: 'MAX BUY', desc: 'Unlock <b>×1000</b> and <b>MAX</b> buy modes.',
                branch: 'automation', pos: { angle: 240, r: 6 }, requires: ['auto_3'], cost: 300,
                applyEffect: (m) => { m.maxBuy = true; } },
    miniaturization: { type: 'leveled', name: 'MINIATURIZATION', desc: '<b>-8% machine cost</b> per level.',
                       branch: 'automation', pos: { angle: 240, r: 7 }, requires: ['max_buy'],
                       maxLevel: 3, costForLevel: (L) => L * 180,
                       applyEffect: (m, L) => { m.costMul *= Math.pow(0.92, L); } },
    blueprint_memory: { type: 'unlock', name: 'BLUEPRINT MEMORY',
                        desc: 'On prestige, rebuild machines to <b>80% of last run</b> for free. Skips the grind.',
                        branch: 'automation', pos: { angle: 240, r: 8 }, requires: ['miniaturization'], cost: 500,
                        applyEffect: (m) => { m.blueprintMemory = true; } },

    // ═══════════════════ EFFICIENCY (300°) ═══════════════════
    eff_1:       { type: 'leveled', name: 'FRUGAL DESIGN', desc: '<b>-5% consumption</b> per level.',
                   branch: 'efficiency', pos: { angle: 300, r: 1 }, requires: ['origin'],
                   maxLevel: 5, costForLevel: (L) => L * 3,
                   applyEffect: (m, L) => { m.consMul *= Math.pow(0.95, L); } },
    lossless:    { type: 'unlock',  name: 'LOSSLESS', desc: 'Bottlenecked machines still produce at <b>50% rate</b>.',
                   branch: 'efficiency', pos: { angle: 300, r: 2 }, requires: ['eff_1'], cost: 60,
                   applyEffect: (m) => { m.lossless = true; } },
    eff_2:       { type: 'leveled', name: 'TIGHT FLOW', desc: '<b>-4% consumption</b> per level.',
                   branch: 'efficiency', pos: { angle: 300, r: 3 }, requires: ['lossless'],
                   maxLevel: 5, costForLevel: (L) => L * 12,
                   applyEffect: (m, L) => { m.consMul *= Math.pow(0.96, L); } },
    recycling:   { type: 'leveled', name: 'RECYCLING', desc: '<b>-4% consumption</b> per level.',
                   branch: 'efficiency', pos: { angle: 300, r: 4 }, requires: ['eff_2'],
                   maxLevel: 3, costForLevel: (L) => L * 36,
                   applyEffect: (m, L) => { m.consMul *= Math.pow(0.96, L); } },
    eff_3:       { type: 'leveled', name: 'COMPRESSION', desc: '<b>-5% consumption</b> per level.',
                   branch: 'efficiency', pos: { angle: 300, r: 5 }, requires: ['recycling'],
                   maxLevel: 3, costForLevel: (L) => L * 75,
                   applyEffect: (m, L) => { m.consMul *= Math.pow(0.95, L); } },
    zero_waste:  { type: 'unlock',  name: 'ZERO WASTE', desc: '<b>-25% consumption</b>. One-time flat.',
                   branch: 'efficiency', pos: { angle: 300, r: 6 }, requires: ['eff_3'], cost: 400,
                   applyEffect: (m) => { m.consMul *= 0.75; } },
    perfection:  { type: 'leveled', name: 'PERFECTION', desc: '<b>-6% consumption</b> per level.',
                   branch: 'efficiency', pos: { angle: 300, r: 7 }, requires: ['zero_waste'],
                   maxLevel: 3, costForLevel: (L) => L * 240,
                   applyEffect: (m, L) => { m.consMul *= Math.pow(0.94, L); } },
    chain_reaction: { type: 'unlock', name: 'CHAIN REACTION',
                      desc: 'When all 5 tiers are actively producing, <b>+30% global production</b>.',
                      branch: 'efficiency', pos: { angle: 300, r: 8 }, requires: ['perfection'], cost: 800,
                      applyEffect: (m) => { m.chainReaction = true; } },

    // ═══════════════════ POWER (0°) ═══════════════════
    mk4:          { type: 'unlock',  name: 'MK-IV MACHINES', desc: 'Unlock the <b>4th machine</b> in each tier (5 new).',
                    branch: 'power', pos: { angle: 0, r: 1 }, requires: ['origin'], cost: 120,
                    applyEffect: () => {} },
    overdrive_1:  { type: 'leveled', name: 'OVERDRIVE I', desc: '<b>+20% support effect</b> per level.',
                    branch: 'power', pos: { angle: 0, r: 2 }, requires: ['mk4'],
                    maxLevel: 5, costForLevel: (L) => L * 15,
                    applyEffect: (m, L) => { m.powerBoost *= (1 + 0.20 * L); } },
    mk5:          { type: 'unlock',  name: 'MK-V MACHINES', desc: 'Unlock the <b>5th machine</b> in each tier (5 more).',
                    branch: 'power', pos: { angle: 0, r: 3 }, requires: ['overdrive_1'], cost: 400,
                    applyEffect: () => {} },
    overdrive_2:  { type: 'leveled', name: 'OVERDRIVE II', desc: '<b>+20% support effect</b> per level.',
                    branch: 'power', pos: { angle: 0, r: 4 }, requires: ['mk5'],
                    maxLevel: 5, costForLevel: (L) => L * 36,
                    applyEffect: (m, L) => { m.powerBoost *= (1 + 0.20 * L); } },
    power_surge:  { type: 'leveled', name: 'POWER SURGE', desc: '<b>-8% support cost</b> per level.',
                    branch: 'power', pos: { angle: 0, r: 5 }, requires: ['overdrive_2'],
                    maxLevel: 5, costForLevel: (L) => L * 24,
                    applyEffect: (m, L) => { m.supportCostMul *= Math.pow(0.92, L); } },
    power_cell:   { type: 'leveled', name: 'POWER CELL', desc: '<b>+30% support effect</b> per level.',
                    branch: 'power', pos: { angle: 0, r: 6 }, requires: ['power_surge'],
                    maxLevel: 3, costForLevel: (L) => L * 120,
                    applyEffect: (m, L) => { m.powerBoost *= (1 + 0.30 * L); } },
    unity:        { type: 'unlock',  name: 'UNITY', desc: 'Support effects <b>doubled</b>.',
                    branch: 'power', pos: { angle: 0, r: 7 }, requires: ['power_cell'], cost: 1000,
                    applyEffect: (m) => { m.powerBoost *= 2; } },
    symbiosis:    { type: 'unlock',  name: 'SYMBIOSIS',
                    desc: '<b>+3% production</b> per unique machine type you own (rewards diverse builds).',
                    branch: 'power', pos: { angle: 0, r: 8 }, requires: ['unity'], cost: 800,
                    applyEffect: (m) => { m.symbiosis = 0.03; } },

    // ═══════════════════ CAPSTONE NODES (r9–r10) ═══════════════════
    // Late-game unique mechanics. These are the "game-altering" tier —
    // every one introduces a new system rather than a flat % bump.

    // SPEED
    flash:             { type: 'unlock',  name: 'FLASH',
                         desc: 'Every <b>30s</b>, a random machine-tier gets <b>×5 production</b> for 8s. Independent of Golden Tick.',
                         branch: 'speed', pos: { angle: 60, r: 9 }, requires: ['perpetual_motion'], cost: 1500,
                         applyEffect: (m) => { m.flash = true; } },
    momentum_plus:     { type: 'leveled', name: 'MOMENTUM+',
                         desc: 'Momentum cap <b>+15%</b> per level. Base cap is +50%.',
                         branch: 'speed', pos: { angle: 60, r: 10 }, requires: ['flash'],
                         maxLevel: 3, costForLevel: (L) => L * 900,
                         applyEffect: (m, L) => { m.momentumCapAdd += 0.15 * L; } },

    // LOGISTICS
    triple_strike:     { type: 'unlock',  name: 'TRIPLE STRIKE',
                         desc: 'Each click counts <b>3×</b> total (stacks with Double Strike → 4×).',
                         branch: 'logistics', pos: { angle: 120, r: 9 }, requires: ['crit_cascade'], cost: 1500,
                         applyEffect: (m) => { m.clickMul += 1.0; } },
    click_storm:       { type: 'unlock',  name: 'CLICK STORM',
                         desc: '<b>10 clicks in 3s</b> triggers a <b>×2 production storm for 5s</b>. Re-armable. Rewards active play.',
                         branch: 'logistics', pos: { angle: 120, r: 10 }, requires: ['triple_strike'], cost: 2500,
                         applyEffect: (m) => { m.clickStorm = true; } },

    // YIELD
    compound_interest: { type: 'unlock',  name: 'COMPOUND INTEREST',
                         desc: 'Passive Yield scales with run duration: <b>+2% per minute</b>, capped at <b>+200%</b>.',
                         branch: 'yield', pos: { angle: 180, r: 9 }, requires: ['golden_tick'], cost: 1500,
                         applyEffect: (m) => { m.compoundInterest = true; } },
    alchemy:           { type: 'unlock',  name: 'ALCHEMY',
                         desc: 'Every 5s, <b>1% of your largest resource</b> converts up one tier (ore→ingot→part…).',
                         branch: 'yield', pos: { angle: 180, r: 10 }, requires: ['compound_interest'], cost: 3000,
                         applyEffect: (m) => { m.alchemy = true; } },

    // AUTOMATION
    blueprint_library: { type: 'leveled', name: 'BLUEPRINT LIBRARY',
                         desc: 'Blueprint Memory rebuild <b>+5% per level</b> (85% → 90%). Requires Blueprint Memory.',
                         branch: 'automation', pos: { angle: 240, r: 9 }, requires: ['blueprint_memory'],
                         maxLevel: 2, costForLevel: (L) => L * 1000,
                         applyEffect: (m, L) => { m.blueprintPct = 0.80 + 0.05 * L; } },
    distributed:       { type: 'unlock',  name: 'DISTRIBUTED',
                         desc: 'Each machine gains <b>+0.5% production</b> per other machine of the same tier you own.',
                         branch: 'automation', pos: { angle: 240, r: 10 }, requires: ['blueprint_library'], cost: 2500,
                         applyEffect: (m) => { m.distributed = 0.005; } },

    // EFFICIENCY
    thermal_runaway:   { type: 'leveled', name: 'THERMAL RUNAWAY',
                         desc: '<b>+15% production</b> but <b>+3% consumption</b> per level. High-risk multiplier.',
                         branch: 'efficiency', pos: { angle: 300, r: 9 }, requires: ['chain_reaction'],
                         maxLevel: 5, costForLevel: (L) => L * 400,
                         applyEffect: (m, L) => { m.prodMul *= (1 + 0.15 * L); m.consMul *= (1 + 0.03 * L); } },
    zero_point:        { type: 'unlock',  name: 'ZERO POINT',
                         desc: '<b>Consumption halved</b> again (applied after all other bonuses). Combos into Frugal + Lossless.',
                         branch: 'efficiency', pos: { angle: 300, r: 10 }, requires: ['thermal_runaway'], cost: 3000,
                         applyEffect: (m) => { m.consMul *= 0.5; } },

    // POWER
    nexus:             { type: 'leveled', name: 'NEXUS',
                         desc: 'Every tier actively producing gives <b>+5% global production</b> per level (max +30% at L3 × 6 tiers).',
                         branch: 'power', pos: { angle: 0, r: 9 }, requires: ['symbiosis'],
                         maxLevel: 3, costForLevel: (L) => L * 500,
                         applyEffect: (m, L) => { m.nexus += 0.05 * L; } },
    ascendance:        { type: 'unlock',  name: 'ASCENDANCE',
                         desc: 'Support buildings count as <b>1.5×</b> their true count. Ultimate Power payoff.',
                         branch: 'power', pos: { angle: 0, r: 10 }, requires: ['nexus'], cost: 2500,
                         applyEffect: (m) => { m.supportCountMul = 1.5; } },
  };

  // ---------- PATENTS (meta-prestige library) ----------
  // Earned by Publishing. Persist through prestige and publish.
  // Startup effects applied on prestige/publish reset via applyStartupBonuses().
  const PATENTS = {
    draft_inheritance: {
      type: 'unlock', name: 'DRAFT INHERITANCE',
      desc: 'Start every run with <b>T2 · Smelting</b> already unlocked.',
      cost: 2, requires: [], applyEffect: () => {},
    },
    fast_start: {
      type: 'leveled', name: 'FAST START',
      desc: 'Start every run with <b>+1 free Drill</b> per level.',
      maxLevel: 5, costForLevel: (L) => L * 3, requires: [], applyEffect: () => {},
    },
    worldwide_fame: {
      type: 'leveled', name: 'WORLDWIDE FAME',
      desc: '<b>+10% Schematic gain</b> per level on every prestige.',
      maxLevel: 5, costForLevel: (L) => L * 8, requires: [],
      applyEffect: (m, L) => { m.schematicMul *= (1 + 0.10 * L); },
    },
    legacy_wealth: {
      type: 'unlock', name: 'LEGACY WEALTH',
      desc: 'Start every run with <b>10K ore</b> banked.',
      cost: 8, requires: [], applyEffect: () => {},
    },
    schematic_inheritance: {
      type: 'unlock', name: 'SCHEMATIC INHERITANCE',
      desc: 'Start every run with <b>T3 · Fabrication</b> unlocked.',
      cost: 5, requires: ['draft_inheritance'], applyEffect: () => {},
    },
    tailwind: {
      type: 'leveled', name: 'TAILWIND',
      desc: '<b>+4h offline cap</b> per level (max +16h on top of 8h).',
      maxLevel: 4, costForLevel: (L) => L * 8, requires: [],
      applyEffect: (m, L) => { m.offlineHoursAdd += 4 * L; },
    },
    institutional_backing: {
      type: 'unlock', name: 'INSTITUTIONAL BACKING',
      desc: 'Start every run with <b>T4 · Assembly</b> unlocked.',
      cost: 12, requires: ['schematic_inheritance'], applyEffect: () => {},
    },
    tenure: {
      type: 'leveled', name: 'TENURE',
      desc: '<b>+20% permanent production</b> per level. Stacks with research.',
      maxLevel: 5, costForLevel: (L) => L * 10, requires: [],
      applyEffect: (m, L) => { m.prodMul *= (1 + 0.20 * L); },
    },
    mass_production: {
      type: 'leveled', name: 'MASS PRODUCTION',
      desc: '<b>-7% machine cost</b> per level.',
      maxLevel: 5, costForLevel: (L) => L * 8, requires: [],
      applyEffect: (m, L) => { m.costMul *= Math.pow(0.93, L); },
    },
    industrial_empire: {
      type: 'unlock', name: 'INDUSTRIAL EMPIRE',
      desc: 'Start every run with <b>T5 · Core Forge</b> unlocked.',
      cost: 35, requires: ['institutional_backing'], applyEffect: () => {},
    },
    archive: {
      type: 'unlock', name: 'ARCHIVE',
      desc: 'All tier unlock costs <b>halved</b>.',
      cost: 50, requires: ['institutional_backing'],
      applyEffect: (m) => { m.tierUnlockMul *= 0.5; },
    },
    prototype_engine: {
      type: 'leveled', name: 'PROTOTYPE ENGINE',
      desc: '<b>+50% Prototype production</b> per level.',
      maxLevel: 3, costForLevel: (L) => L * 25, requires: ['tenure'],
      applyEffect: (m, L) => { m.prototypeMul *= (1 + 0.50 * L); },
    },
    academia: {
      type: 'unlock', name: 'ACADEMIA',
      desc: 'Reveal the <b>entire Research tree</b> from the start of each run.',
      cost: 40, requires: ['tenure'], applyEffect: () => {},
    },
    dynasty: {
      type: 'leveled', name: 'DYNASTY',
      desc: '<b>+25% Schematic gain</b> per level (stacks with Worldwide Fame).',
      maxLevel: 3, costForLevel: (L) => L * 40, requires: ['worldwide_fame'],
      applyEffect: (m, L) => { m.schematicMul *= (1 + 0.25 * L); },
    },
    nobel_prize: {
      type: 'unlock', name: 'NOBEL PRIZE',
      desc: '<b>Double</b> Prototype production. Accelerates every future Publish.',
      cost: 80, requires: ['prototype_engine'],
      applyEffect: (m) => { m.prototypeMul *= 2; },
    },
    prestige_streak: {
      type: 'unlock', name: 'PRESTIGE STREAK',
      desc: 'Prestige within <b>3 minutes</b> of your last = <b>+20% Schematics</b>.',
      cost: 25, requires: [], applyEffect: () => {},
    },
    rising_tide: {
      type: 'unlock', name: 'RISING TIDE',
      desc: 'Each Tier unlocked beyond T1 gives <b>+5% production</b> to every lower Tier.',
      cost: 40, requires: [], applyEffect: () => {},
    },
    recursive: {
      type: 'unlock', name: 'RECURSIVE',
      desc: 'On Publish, earn <b>+1 Patent per 40 research levels</b> owned.',
      cost: 60, requires: ['worldwide_fame'], applyEffect: () => {},
    },
    auto_prestige_pat: {
      type: 'unlock', name: 'AUTO-PRESTIGE',
      desc: 'Toggle in Mastery. Game auto-prestiges at a Schematics threshold you set.',
      cost: 120, requires: ['tenure'], applyEffect: (m) => { m.autoPrestige = true; },
    },
    auto_publish_pat: {
      type: 'unlock', name: 'AUTO-PUBLISH',
      desc: 'Toggle in Mastery. Game auto-publishes at a Prototype threshold you set.',
      cost: 225, requires: ['auto_prestige_pat'], applyEffect: (m) => { m.autoPublish = true; },
    },
    omnitap: {
      type: 'unlock', name: 'OMNITAP',
      desc: 'Auto-click fires on <b>every unlocked resource</b>, not just Ore.',
      cost: 100, requires: [], applyEffect: (m) => { m.omnitap = true; },
    },
  };

  // ---------- CHALLENGE MODES ----------
  // Alternate run types: each starts a fresh prestige run with a constraint
  // active. Reaching the goal before prestiging grants a permanent reward.
  // Failure (prestige without goal, or blitz timer expiring) clears the flag
  // with no penalty — players can retry indefinitely.
  //
  // goalSchematics is evaluated against schematicsForPrestige() at the moment
  // the run ends (via doPrestige or a blitz timer). Constraints are enforced
  // inline at the relevant call sites (clickResource, researchBuy, buy, tick).
  const CHALLENGES = {
    pacifist: {
      name: 'PACIFIST',
      desc: 'No manual clicking the whole run. Auto-mine and machines only.',
      constraintLabel: 'NO CLICKING',
      rewardLabel: '+1 base auto-click/s',
      goalSchematics: 30,
      goalLabel: 'Earn 30 schematics without a click',
      timerMs: 0,
      applyReward: (m) => { m.autoClickPerSec += 1; },
      // v0.9.8 — Early-available so pre-publish players have something to
      // attempt. No patent-system dependency; teaches automation.
      earlyAvailable: true,
    },
    blitz: {
      name: 'BLITZ',
      desc: 'You have 5 minutes. Earn as many schematics as you can.',
      constraintLabel: '5:00 TIMER',
      rewardLabel: '+10% schematic gain',
      goalSchematics: 25,
      goalLabel: 'Earn 25 schematics in 5 minutes',
      timerMs: 5 * 60 * 1000,
      // v0.9.10 — power-anchored goals (see challengePowerGoal). A 5-minute
      // window can't match a full run's earn, so the fraction is lower.
      powerFactor: 0.12,
      applyReward: (m) => { m.schematicMul *= 1.10; },
    },
    blackout: {
      name: 'BLACKOUT',
      desc: 'No research purchases allowed. Tiers may still be unlocked.',
      constraintLabel: 'NO RESEARCH',
      rewardLabel: '+15% production',
      goalSchematics: 40,
      goalLabel: 'Earn 40 schematics with an empty tree',
      timerMs: 0,
      // v0.9.10 — the research tree is the largest share of late-cycle power;
      // banning it justifies a smaller fraction of the average run.
      powerFactor: 0.15,
      applyReward: (m) => { m.prodMul *= 1.15; },
    },
    tall: {
      name: 'TALL',
      desc: 'You may own at most 3 of each machine type. Go tall, not wide.',
      constraintLabel: 'MAX 3 PER TYPE',
      rewardLabel: '+2% production per unique machine type',
      goalSchematics: 45,
      goalLabel: 'Earn 45 schematics with ≤ 3 per machine',
      timerMs: 0,
      applyReward: (m) => { m.symbiosis += 0.02; },
      // v0.9.8 — Early-available. Self-contained constraint; teaches
      // diversification across machine types.
      earlyAvailable: true,
    },
    monoculture: {
      name: 'MONOCULTURE',
      desc: 'Only the slot-1 base machine of each tier is available. No higher-slot variants, no MK-IV or MK-V.',
      constraintLabel: 'SLOT-1 ONLY',
      rewardLabel: '+5% production',
      goalSchematics: 50,
      goalLabel: 'Earn 50 schematics with base machines only',
      timerMs: 0,
      applyReward: (m) => { m.prodMul *= 1.05; },
    },
    purist: {
      name: 'PURIST',
      desc: 'Support buildings (Power Node, Boost Relay) are locked. No global multipliers from supports.',
      constraintLabel: 'NO SUPPORTS',
      rewardLabel: '+8% support effects',
      goalSchematics: 40,
      goalLabel: 'Earn 40 schematics without a single support',
      timerMs: 0,
      applyReward: (m) => { m.powerBoost *= 1.08; },
    },
    ironman: {
      name: 'IRONMAN',
      desc: 'Patent startup bonuses (inheritance, Fast Start, Legacy Wealth, etc.) do not apply this run.',
      constraintLabel: 'NO HEIRLOOMS',
      rewardLabel: '+8% schematic gain',
      goalSchematics: 35,
      goalLabel: 'Earn 35 schematics without patent heirlooms',
      timerMs: 0,
      applyReward: (m) => { m.schematicMul *= 1.08; },
    },
    slow_burn: {
      name: 'SLOW BURN',
      desc: 'Prestige is locked for the first 10 minutes of the run. Play deep, not fast.',
      constraintLabel: 'MIN 10:00',
      rewardLabel: '+2h offline cap',
      goalSchematics: 35,
      goalLabel: 'Earn 35 schematics after a 10-minute wait',
      timerMs: 0,
      minRunMs: 10 * 60 * 1000,
      applyReward: (m) => { m.offlineHoursAdd += 2; },
      // v0.9.8 — Early-available. Teaches patience and that long runs
      // produce more; good early lesson before players discover publish.
      earlyAvailable: true,
    },
    chaos: {
      name: 'CHAOS',
      desc: 'Every 30s, a random tier is knocked to 10% production for 8s. Plan around the randomness.',
      constraintLabel: 'TIER BLACKOUTS',
      rewardLabel: '+10 click power',
      goalSchematics: 40,
      goalLabel: 'Earn 40 schematics under rolling blackouts',
      timerMs: 0,
      applyReward: (m) => { m.clickAdd += 10; },
    },
    // ---------- v0.7.0 challenges ----------
    austere: {
      name: 'AUSTERE',
      desc: 'All machine costs are doubled. Spend wisely.',
      constraintLabel: 'COSTS ×2',
      rewardLabel: '-5% machine cost',
      goalSchematics: 40,
      goalLabel: 'Earn 40 schematics with doubled costs',
      timerMs: 0,
      applyDuring: (m) => { m.costMul *= 2; },
      applyReward: (m) => { m.costMul *= 0.95; },
    },
    glassware: {
      name: 'GLASSWARE',
      desc: 'Every 60 seconds, you lose 50% of your most-held resource. Nothing is safe.',
      constraintLabel: 'FRAGILE · 60S',
      rewardLabel: '+10% schematic gain',
      goalSchematics: 45,
      goalLabel: 'Earn 45 schematics while fragile',
      timerMs: 0,
      applyReward: (m) => { m.schematicMul *= 1.10; },
    },
    overclock: {
      name: 'OVERCLOCK',
      desc: 'Production ×3 — consumption ×4. Scale upstream tiers or starve downstream.',
      constraintLabel: 'PROD×3 / CONS×4',
      rewardLabel: '+10% production, permanent',
      goalSchematics: 50,
      goalLabel: 'Earn 50 schematics while overclocked',
      timerMs: 0,
      applyDuring: (m) => { m.prodMul *= 3; m.consMul *= 4; },
      applyReward: (m) => { m.prodMul *= 1.10; },
    },
    echo: {
      name: 'ECHO',
      desc: 'After buying a machine, that type is locked for 5 seconds. One voice at a time.',
      constraintLabel: '5S COOLDOWN',
      rewardLabel: 'Blueprint pool rolls 4 options instead of 3',
      goalSchematics: 45,
      goalLabel: 'Earn 45 schematics with machine cooldowns',
      timerMs: 0,
      applyReward: (m) => { m.extraBlueprintRoll = true; },
    },
    famine: {
      name: 'FAMINE',
      desc: 'All production is halved. Earn schematics the hard way.',
      constraintLabel: 'PROD ÷2',
      rewardLabel: '+25% schematic gain',
      goalSchematics: 40,
      goalLabel: 'Earn 40 schematics through famine',
      timerMs: 0,
      applyDuring: (m) => { m.prodMul *= 0.5; },
      applyReward: (m) => { m.schematicMul *= 1.25; },
    },
  };

  // ---------- BLUEPRINTS (per-run modifiers) ----------
  // After each prestige (once the player has 3+ under their belt), three random
  // Blueprints are rolled and the player picks one. The selected modifier lasts
  // that single run. Blueprints change *rules*, not just scale numbers — the
  // goal is run-to-run variance, not more stacking %.
  //
  // effect keys used by rm() + tick(): see applyEffect. Rarity is cosmetic
  // (display colour); all ten roll uniformly.
  const BLUEPRINTS = {
    overdrive: {
      name: 'OVERDRIVE', rarity: 'common',
      desc: 'Production <b>×2</b>. Consumption <b>×1.5</b>.',
      applyEffect: (m) => { m.prodMul *= 2; m.consMul *= 1.5; },
    },
    frugal: {
      name: 'FRUGAL', rarity: 'common',
      desc: 'Machine costs <b>halved</b>. Production <b>×0.8</b>.',
      applyEffect: (m) => { m.costMul *= 0.5; m.prodMul *= 0.8; },
    },
    inert: {
      name: 'INERT', rarity: 'rare',
      desc: 'Supports do <b>nothing</b>. Base production <b>+40%</b>.',
      applyEffect: (m) => { m.inertSupports = true; m.prodMul *= 1.40; },
    },
    jumpstart: {
      name: 'JUMPSTART', rarity: 'common',
      desc: 'Start with <b>500 ingots</b>. All production <b>×0.8</b>.',
      applyEffect: (m) => { m.prodMul *= 0.8; },
      applyStartup: (st) => { st.resources.ingot = Math.max(500, st.resources.ingot || 0); },
    },
    clicker: {
      name: 'CLICKER', rarity: 'rare',
      desc: 'Click power <b>×20</b>. Auto-click <b>disabled</b>. A clicker run.',
      applyEffect: (m) => { m.clickMul += 19; m.autoClickPerSec = 0; m.autoClickDisabled = true; },
    },
    windfall: {
      name: 'WINDFALL', rarity: 'rare',
      desc: 'Schematic gain <b>×2</b>. Cores count as <b>0</b> for score.',
      applyEffect: (m) => { m.schematicMul *= 2; m.noCoreScore = true; },
    },
    fusion: {
      name: 'FUSION', rarity: 'rare',
      // v0.9.10 balance: 0.02 → 0.01 and the drip no longer scales with the
      // global production multiplier (see tick()). Cores carry the top score
      // weight (6.25M), so the old prodMul-scaled drip turned cheap T2
      // machines into the dominant schematic strategy at 20-50× late-game
      // multipliers — players reported it trivialised the whole run. Flat
      // means the blueprint stays a strong early/mid shortcut (cores long
      // before forges) and fades once the real chain is industrial.
      desc: 'Ingot machines also produce <b>+0.01 cores/s</b> directly. Shortcut the chain.',
      applyEffect: (m) => { m.fusionPath = 0.01; },
    },
    mirror: {
      name: 'MIRROR', rarity: 'mythic',
      desc: 'Machines consume <b>nothing</b>. Production <b>×0.5</b>. Pure output.',
      applyEffect: (m) => { m.consFree = true; m.prodMul *= 0.5; },
    },
    lucky_fifth: {
      name: 'LUCKY FIFTH', rarity: 'mythic',
      desc: 'Every <b>5th</b> machine of each type is <b>free</b>. No other cost change.',
      applyEffect: (m) => { m.luckyFifth = true; },
    },
    patient: {
      name: 'PATIENT', rarity: 'rare',
      desc: 'Production <b>+100%</b>. Prestige locked for <b>5 minutes</b>.',
      minRunMs: 5 * 60 * 1000,
      applyEffect: (m) => { m.prodMul *= 2; },
    },
    // ---------- v0.7.0 blueprints ----------
    vanguard: {
      name: 'VANGUARD', rarity: 'common',
      desc: 'The first <b>3 machines</b> of every type are <b>free</b>. No other cost change.',
      applyEffect: (m) => { m.freeFirst3 = true; },
    },
    harvest: {
      name: 'HARVEST', rarity: 'common',
      desc: 'Start with <b>100 ingots</b>, <b>20 parts</b>, and <b>5 circuits</b>.',
      applyEffect: (m) => {},
      applyStartup: (st) => {
        st.resources.ingot   = Math.max(100, st.resources.ingot   || 0);
        st.resources.part    = Math.max(20,  st.resources.part    || 0);
        st.resources.circuit = Math.max(5,   st.resources.circuit || 0);
      },
    },
    parallel: {
      name: 'PARALLEL', rarity: 'rare',
      desc: 'Support effects <b>doubled</b>. Support costs <b>×10</b>.',
      applyEffect: (m) => { m.powerBoost *= 2; m.supportCostMul *= 10; },
    },
    critical: {
      name: 'CRITICAL', rarity: 'rare',
      desc: 'Click crit chance <b>doubled</b>. Auto-click <b>halved</b>. Reward the hands, punish the idle.',
      applyEffect: (m) => { m.critChance *= 2; m.autoClickPerSec *= 0.5; },
    },
    archivist: {
      name: 'ARCHIVIST', rarity: 'mythic',
      desc: 'Research costs <b>halved</b>. All production <b>×0.5</b>.',
      applyEffect: (m) => { m.researchCostMul = 0.5; m.prodMul *= 0.5; },
    },
  };

  // ---------- EXHIBITIONS (v0.8.0 · the third prestige layer) ----------
  // Unlocks once the player has earned 30 lifetime Patents. Each exhibition is
  // a run-spanning goal: pick one after a prestige, attempt it during the next
  // run, and on prestige we check the goal against the run's totals. Success
  // grants 1 Legacy Mark; failure just clears the active flag with no penalty.
  // Legacy Marks are spent in the Archive to buy permanent upgrades that
  // persist through every reset (prestige AND publish).
  //
  // Each exhibition's check(state) runs AT the moment of prestige, before the
  // run state is wiped. totalProduced / totalClicks / machines / supports all
  // reflect the run that just ended.
  const EXHIBITIONS = {
    scale_show: {
      name: 'SCALE SHOW',
      // desc/goalLabel are static fallbacks — the UI renders the scaled
      // numbers via exhibitionDesc()/exhibitionGoalLabel() (v0.9.10).
      desc: 'Produce <b>10 M ore</b> in a single prestige run.',
      goalLabel: 'Produce 10M ore in one run',
      check: (s) => (s.meta.totalProduced.ore || 0) >= exhibitionTarget('scale_show'),
    },
    miniature_works: {
      name: 'MINIATURE WORKS',
      desc: 'Prestige with <b>≤ 20 total machines</b>.',
      goalLabel: 'Prestige with ≤ 20 machines',
      check: (s) => {
        let total = 0;
        for (const id in s.machines) total += s.machines[id] || 0;
        return total <= 20;
      },
    },
    long_haul: {
      name: 'THE LONG HAUL',
      desc: 'Prestige after a run lasting at least <b>1 hour</b>.',
      goalLabel: 'Prestige after a 1h+ run',
      check: (s) => (Date.now() - (s.meta.currentRunStartAt || Date.now())) >= 3_600_000,
    },
    exhibition_match: {
      name: 'EXHIBITION MATCH',
      desc: 'Earn <b>5K schematics</b> in a single prestige.',
      goalLabel: 'Earn 5K+ schematics in one run',
      check: (s) => schematicsForPrestige() >= exhibitionTarget('exhibition_match'),
    },
    grand_tour: {
      name: 'THE GRAND TOUR',
      desc: 'Prestige owning at least <b>1 of every MK-V</b> machine.',
      goalLabel: 'Own all five MK-V at prestige',
      check: (s) => {
        for (const id in MACHINES) {
          if (MACHINES[id].mk === 'mk5' && (s.machines[id] || 0) === 0) return false;
        }
        return true;
      },
    },
    silent_exhibition: {
      name: 'SILENT EXHIBITION',
      desc: 'Prestige without a <b>single manual click</b>.',
      goalLabel: 'Earn schematics with 0 clicks',
      check: (s) => (s.meta.totalClicks || 0) === 0,
    },
    empty_stage: {
      name: 'EMPTY STAGE',
      desc: 'Prestige without buying <b>any research</b> this run.',
      goalLabel: 'Earn schematics with an empty tree',
      check: (s) => !s.meta.currentRunResearchBought,
    },
    heavy_artillery: {
      name: 'HEAVY ARTILLERY',
      desc: 'Own <b>10+ of every slot-1 base machine</b> (T1–T5) at prestige.',
      goalLabel: '10+ drill / furnace / press / assembler / forge',
      check: (s) => {
        const SLOT_1 = ['drill', 'furnace', 'press', 'assembler', 'forge'];
        const n = exhibitionTarget('heavy_artillery');
        return SLOT_1.every(id => (s.machines[id] || 0) >= n);
      },
    },
  };

  // LEGACY_UPGRADES — the Archive shop. Each is a one-time purchase that
  // applies its effect via researchMultipliers() through a new legacy layer.
  // Costs total 28 Legacy Marks; at ~1 LM per completed exhibition run, a
  // completionist will do ~28+ prestiges worth of exhibition work.
  const LEGACY_UPGRADES = {
    endowment: {
      name: 'ENDOWMENT',
      desc: '<b>+5 %</b> global production, permanent across every reset.',
      cost: 1,
      applyEffect: (m) => { m.prodMul *= 1.05; },
    },
    drafting_heirloom: {
      name: 'DRAFTING HEIRLOOM',
      desc: 'Start every run with <b>+1 additional Drill</b>, stacks with FAST START.',
      cost: 1,
      applyEffect: () => { /* startup grant applied in applyStartupBonuses */ },
    },
    open_archive: {
      name: 'OPEN ARCHIVE',
      desc: 'Reveal the entire <b>research tree</b> from the start of each run. (Redundant with ACADEMIA.)',
      cost: 2,
      applyEffect: () => { /* checked by nodeRevealed */ },
    },
    patrons: {
      name: 'PATRONS',
      desc: '<b>+10 % patent gain</b> on every publish, permanent.',
      cost: 2,
      applyEffect: (m) => { m.patentMul = (m.patentMul || 1) * 1.10; },
    },
    efficient_mind: {
      name: 'EFFICIENT MIND',
      desc: '<b>-20 % research cost</b> permanently.',
      cost: 2,
      applyEffect: (m) => { m.researchCostMul *= 0.80; },
    },
    amplifier: {
      name: 'AMPLIFIER',
      desc: 'Challenge rewards <b>×1.5</b> — applies to every completed challenge\'s permanent bonus.',
      cost: 3,
      applyEffect: () => { /* handled inline via m.challengeRewardMul */ },
    },
    fourth_blueprint: {
      name: 'FOURTH BLUEPRINT',
      desc: 'Roll <b>4 Blueprints</b> per prestige instead of 3, for the whole career.',
      cost: 3,
      applyEffect: (m) => { m.extraBlueprintRoll = true; },
    },
    wider_net: {
      name: 'WIDER NET',
      desc: '<b>+6 h offline cap</b> permanently (stacks with TAILWIND).',
      cost: 3,
      applyEffect: (m) => { m.offlineHoursAdd += 6; },
    },
    annotated_schematic: {
      name: 'ANNOTATED SCHEMATIC',
      desc: '<b>+20 % schematic gain</b> permanently.',
      cost: 4,
      applyEffect: (m) => { m.schematicMul *= 1.20; },
    },
    grand_archive: {
      name: 'GRAND ARCHIVE',
      desc: 'All <b>tier unlock costs -25 %</b> permanently.',
      cost: 5,
      applyEffect: (m) => { m.tierUnlockMul *= 0.75; },
    },
  };

  function exhibitionsUnlocked() {
    return (state.meta.totalPatents || 0) >= 30;
  }
  function activeExhibition() {
    const e = state.meta.exhibitions;
    return (e && e.active) || null;
  }
  // v0.9.10 — numeric exhibition goals scale with demonstrated power instead
  // of sitting at fixed values a late-game factory rolls past by accident.
  // SCALE SHOW and EXHIBITION MATCH anchor to the player's best run this
  // publish cycle (bestRunOre / bestRunSchematics, reset at publish, so the
  // floors return while a fresh cycle rebuilds); HEAVY ARTILLERY grows its
  // machine count with lifetime patents. Behavioural exhibitions (no clicks,
  // ≤20 machines, 1 h run, empty tree, all MK-V) stay fixed — they're
  // constraint goals, not number goals.
  function exhibitionTargetFor(id) {
    if (id === 'scale_show')       return Math.max(10_000_000, Math.ceil((state.meta.bestRunOre || 0) * 0.6));
    if (id === 'exhibition_match') return Math.max(5000, Math.ceil((state.meta.bestRunSchematics || 0) * 0.75));
    if (id === 'heavy_artillery')  return 10 + Math.floor(Math.sqrt(state.meta.totalPatents || 0) / 2);
    return null;
  }
  // Frozen-at-select target for the active exhibition (the number the player
  // signed up for is the number they're judged on); live value otherwise.
  function exhibitionTarget(id) {
    const e = state.meta.exhibitions || {};
    if (e.active === id && e.activeTargets && e.activeTargets[id] != null) return e.activeTargets[id];
    return exhibitionTargetFor(id);
  }
  function exhibitionDesc(id) {
    const ex = EXHIBITIONS[id];
    if (!ex) return '';
    const t = exhibitionTarget(id);
    if (id === 'scale_show')       return `Produce <b>${fmt(t)} ore</b> in a single prestige run.`;
    if (id === 'exhibition_match') return `Earn <b>${fmt(t)} schematics</b> in a single prestige.`;
    if (id === 'heavy_artillery')  return `Own <b>${t}+ of every slot-1 base machine</b> (T1–T5) at prestige.`;
    return ex.desc;
  }
  function exhibitionGoalLabel(id) {
    const ex = EXHIBITIONS[id];
    if (!ex) return '';
    const t = exhibitionTarget(id);
    if (id === 'scale_show')       return `Produce ${fmt(t)} ore in one run`;
    if (id === 'exhibition_match') return `Earn ${fmt(t)}+ schematics in one run`;
    if (id === 'heavy_artillery')  return `${t}+ drill / furnace / press / assembler / forge`;
    return ex.goalLabel;
  }
  function rollExhibitionPool() {
    const ids = Object.keys(EXHIBITIONS);
    const shuffled = ids.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 3);
  }
  function selectExhibition(id) {
    if (!EXHIBITIONS[id]) return false;
    if (!state.meta.exhibitions) {
      state.meta.exhibitions = { active: null, completed: {}, failed: {}, pool: [], activeTargets: {} };
    }
    state.meta.exhibitions.active = id;
    state.meta.exhibitions.pool = [];
    // v0.9.10 — freeze the scaled target at selection so the goal the player
    // saw on the card is the goal the run is judged against, even if this
    // run pushes the per-cycle bests higher before it ends.
    const t = exhibitionTargetFor(id);
    state.meta.exhibitions.activeTargets = (t != null) ? { [id]: t } : {};
    invalidateRM();
    save();
    return true;
  }
  function skipExhibitions() {
    if (state.meta.exhibitions) state.meta.exhibitions.pool = [];
    save();
  }
  function evaluateExhibition() {
    const id = activeExhibition();
    if (!id) return null;
    const ex = EXHIBITIONS[id];
    if (!ex) return null;
    return ex.check(state) ? 'won' : 'lost';
  }
  function legacyLevel(id) {
    const up = state.meta.legacyUpgrades || {};
    return up[id] || 0;
  }
  function buyLegacyUpgrade(id) {
    const u = LEGACY_UPGRADES[id];
    if (!u) return false;
    if (legacyLevel(id) >= 1) return false;
    if ((state.meta.legacyMarks || 0) < u.cost) return false;
    state.meta.legacyMarks -= u.cost;
    state.meta.legacyUpgrades = state.meta.legacyUpgrades || {};
    state.meta.legacyUpgrades[id] = 1;
    invalidateRM();
    audio.research && audio.research();
    // Archive-complete celebration — fires once when the player owns all 10
    // Legacy Upgrades. Biggest banner the game ships: this is the endgame
    // completion moment.
    const archiveOwned = Object.keys(LEGACY_UPGRADES).every(k => state.meta.legacyUpgrades[k]);
    if (archiveOwned && !state.meta.archiveCompleteCelebrated) {
      state.meta.archiveCompleteCelebrated = true;
      setTimeout(() => {
        celebrate('publish', {
          bannerKind: '◆◆◆ ARCHIVE COMPLETE',
          bannerMain: 'MASTER ENGINEER',
          bannerSub: `Every Legacy Upgrade acquired · ${Object.keys(LEGACY_UPGRADES).length} / ${Object.keys(LEGACY_UPGRADES).length}`,
          particles: 200,
        });
      }, 250);
    }
    save();
    return true;
  }

  function activeBlueprint() {
    const b = state.meta.blueprints;
    return (b && b.active) || null;
  }
  function blueprintsUnlocked() {
    return (state.meta.prestigeCount || 0) >= 3;
  }
  function rollBlueprintPool() {
    const ids = Object.keys(BLUEPRINTS);
    // Fisher-Yates shuffle, then take 3 (or 4 if the ECHO challenge reward is
    // active). extraBlueprintRoll flips in from the completed-challenge layer
    // of researchMultipliers, so it survives prestige but resets on publish.
    const shuffled = ids.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const take = rm().extraBlueprintRoll ? 4 : 3;
    return shuffled.slice(0, take);
  }
  function selectBlueprint(id) {
    if (!BLUEPRINTS[id]) return false;
    state.meta.blueprints.active = id;
    state.meta.blueprints.pool = [];
    state.meta.blueprints.timesUsed[id] = (state.meta.blueprints.timesUsed[id] || 0) + 1;
    state.meta.blueprints.seen[id] = true;
    // Re-apply startup in case the chosen Blueprint grants starter resources
    // (e.g. JUMPSTART). Safe to call again — startup bonuses are idempotent.
    applyStartupBonuses();
    invalidateRM();
    save();
    renderBlueprintChip();
    toast(`<b>⧉ BLUEPRINT</b><br>${BLUEPRINTS[id].name} — ${BLUEPRINTS[id].desc}`, { duration: 5000 });
    return true;
  }
  function skipBlueprint() {
    state.meta.blueprints.active = null;
    state.meta.blueprints.pool = [];
    invalidateRM();
    save();
    renderBlueprintChip();
    return true;
  }
  function showBlueprintChoiceModal() {
    const pool = (state.meta.blueprints && state.meta.blueprints.pool) || [];
    if (!pool.length) return;
    const cardsHtml = pool.map(id => {
      const b = BLUEPRINTS[id];
      const uses = (state.meta.blueprints.timesUsed && state.meta.blueprints.timesUsed[id]) || 0;
      return `
        <button class="blueprint-card rarity-${b.rarity}" data-blueprint="${id}">
          <div class="bp-rarity">${b.rarity.toUpperCase()}</div>
          <div class="bp-name">${b.name}</div>
          <div class="bp-desc">${b.desc}</div>
          ${uses > 0 ? `<div class="bp-uses">used ${uses}×</div>` : ''}
        </button>
      `;
    }).join('');
    const bg = document.createElement('div');
    bg.className = 'modal-bg blueprint-modal-bg';
    bg.innerHTML = `
      <div class="modal blueprint-modal">
        <h3>⧉ CHOOSE A BLUEPRINT</h3>
        <p>This modifier is active for your next run. Rerolls on your next prestige.</p>
        <div class="blueprint-grid">${cardsHtml}</div>
        <div class="actions">
          <button class="btn" data-bp-skip>PLAY WITHOUT MODIFIER</button>
        </div>
      </div>
    `;
    document.body.appendChild(bg);
    bg.querySelectorAll('[data-blueprint]').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.blueprint;
        selectBlueprint(id);
        bg.remove();
      });
    });
    bg.querySelector('[data-bp-skip]').addEventListener('click', () => {
      skipBlueprint();
      bg.remove();
    });
  }
  // Topbar chip — tiny indicator that a Blueprint is active this run.
  let blueprintChipEl = null;
  function renderBlueprintChip() {
    const id = activeBlueprint();
    // Reuse the existing topbar — place the chip between logo and res-bar.
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    if (!id) {
      if (blueprintChipEl && blueprintChipEl.parentNode) blueprintChipEl.parentNode.removeChild(blueprintChipEl);
      blueprintChipEl = null;
      return;
    }
    const b = BLUEPRINTS[id];
    if (!blueprintChipEl) {
      blueprintChipEl = document.createElement('div');
      blueprintChipEl.className = 'blueprint-chip';
      // Insert after the logo
      const logo = topbar.querySelector('.logo');
      if (logo && logo.nextSibling) topbar.insertBefore(blueprintChipEl, logo.nextSibling);
      else topbar.appendChild(blueprintChipEl);
    }
    blueprintChipEl.className = `blueprint-chip rarity-${b.rarity}`;
    blueprintChipEl.innerHTML = `<span class="bc-tag">⧉</span><span class="bc-name">${b.name}</span>`;
    blueprintChipEl.title = b.desc.replace(/<[^>]+>/g, '');
  }

  // Challenge helpers. Kept inside the IIFE so they close over state; the
  // actual enforcement lives at the relevant call sites (clickResource etc).
  function activeChallenge() {
    const c = state.meta && state.meta.challenge;
    return (c && c.active) || null;
  }
  function challengeUnlocked() {
    // v0.9.8 — section becomes visible after 2 lifetime prestiges OR after
    // first publish. The prestige gate lets pre-publish players see the
    // three "early-available" challenges (PACIFIST / TALL / SLOW BURN)
    // instead of nothing. Other challenges stay publish-gated via
    // challengeAvailable(id) — they'll appear but as LOCKED cards until
    // the player publishes for the first time.
    return (state.meta.publishCount || 0) >= 1
        || (state.meta.lifetimePrestiges || 0) >= 2;
  }
  function challengeAvailable(id) {
    // Per-challenge availability. Early-available challenges unlock after
    // 2 prestiges. Every other challenge needs a publish first — most
    // reference patent-era systems (heirloom suppression, support bans,
    // etc.) that don't make sense without a meta-layer to suppress.
    const ch = CHALLENGES[id];
    if (!ch) return false;
    if ((state.meta.publishCount || 0) >= 1) return true;
    if (ch.earlyAvailable && (state.meta.lifetimePrestiges || 0) >= 2) return true;
    return false;
  }
  // v0.9.7 — challenge goals scale with lifetime patents so they don't go
  // trivial once you've stacked FAST_START / DRAFTING_HEIRLOOM / blueprints.
  //
  // v0.9.10 — patents alone weren't enough. The patent curve tops out around
  // 7-8× while the multiplicative stack (achievements × patents × challenge
  // rewards × legacies) pushes actual earning power to 30-80×, so a late
  // player reported every challenge "solving itself within seconds". Goals
  // are now ALSO anchored to demonstrated power: a fraction of the player's
  // average schematic earn per prestige this publish cycle (totalSchematics /
  // prestigeCount — both reset at publish, so goals relax after the big
  // wipe and tighten again as the cycle's power rebuilds). Whichever of the
  // two scales is higher wins. The patent floor keeps post-publish runs
  // honest (heirloom starts), the power anchor keeps late-cycle runs honest.
  //
  // The goal is FROZEN into state.meta.challenge.goal when the run starts —
  // the number the player signed up for is the number they're judged on.
  function challengePowerGoal(ch) {
    const count = state.meta.prestigeCount || 0;
    if (count < 1) return 0;
    const avg = (state.meta.totalSchematics || 0) / count;
    // Default: earn 30% of a typical unconstrained run, under the constraint.
    // Tighter windows get a lower fraction (BLITZ only has 5 minutes; a late
    // tree is most of your power, so BLACKOUT banning research cuts deepest).
    const factor = ch.powerFactor != null ? ch.powerFactor : 0.30;
    return Math.ceil(avg * factor);
  }
  function effectiveChallengeGoal(idOrCh) {
    const ch = typeof idOrCh === 'string' ? CHALLENGES[idOrCh] : idOrCh;
    if (!ch) return 0;
    // Active run: the goal was frozen at start — report that, always.
    const c = state.meta.challenge || {};
    if (c.active && CHALLENGES[c.active] === ch && (c.goal || 0) > 0) return c.goal;
    const base = ch.goalSchematics || 0;
    const patents = state.meta.totalPatents || 0;
    const scale = 1 + Math.sqrt(patents) * 0.25;
    return Math.max(Math.ceil(base * scale), challengePowerGoal(ch));
  }
  function evaluateChallenge(id) {
    const ch = CHALLENGES[id];
    if (!ch) return false;
    const sch = schematicsForPrestige();
    if (sch < effectiveChallengeGoal(ch)) return false;
    if (id === 'pacifist')  return (state.meta.totalClicks || 0) === 0;
    if (id === 'blackout')  return !state.meta.currentRunResearchBought;
    if (id === 'tall') {
      for (const mid in state.machines) {
        if ((state.machines[mid] || 0) > 3) return false;
      }
      return true;
    }
    if (id === 'blitz') {
      const started = state.meta.challenge.startedAt || Date.now();
      return (Date.now() - started) <= (CHALLENGES.blitz.timerMs || Infinity);
    }
    if (id === 'monoculture') {
      for (const mid in state.machines) {
        if ((state.machines[mid] || 0) > 0 && MACHINES[mid].slot !== 1) return false;
      }
      return true;
    }
    if (id === 'purist') {
      for (const sid in state.supports) {
        if ((state.supports[sid] || 0) > 0) return false;
      }
      return true;
    }
    if (id === 'slow_burn') {
      const elapsed = Date.now() - (state.meta.currentRunStartAt || Date.now());
      return elapsed >= (CHALLENGES.slow_burn.minRunMs || 0);
    }
    // ironman & chaos just need the schematic threshold — no additional check
    return true;
  }
  function startChallenge(id) {
    if (!CHALLENGES[id]) return false;
    if (activeChallenge()) return false;
    // v0.9.8 — per-challenge gate. Previously gated on challengeUnlocked()
    // (the whole section); now each challenge has its own availability so
    // pre-publish players can start early challenges while publish-gated
    // ones stay locked.
    if (!challengeAvailable(id)) return false;
    // Credit pending schematics if any (mirrors a normal prestige payout) BEFORE
    // the reset, so players don't lose progress by starting a challenge early.
    if (canPrestige()) {
      const gained = schematicsForPrestige();
      state.meta.schematics += gained;
      state.meta.totalSchematics = (state.meta.totalSchematics || 0) + gained;
      state.meta.lifetimeSchematics = (state.meta.lifetimeSchematics || 0) + gained;
      state.meta.prestigeCount += 1;
      state.meta.lifetimePrestiges = (state.meta.lifetimePrestiges || 0) + 1;
      state.meta.lastPrestigeAt = Date.now();
      // v0.9.10 — per-cycle bests feed exhibition goal scaling.
      state.meta.bestRunOre = Math.max(state.meta.bestRunOre || 0, state.meta.totalProduced.ore || 0);
      state.meta.bestRunSchematics = Math.max(state.meta.bestRunSchematics || 0, gained);
    }
    // Manual reset — avoids doPrestige's "is a challenge ending?" evaluation
    // path. The new challenge is about to start, not ending.
    state.resources = emptyResources();
    state.machines = emptyMachines();
    state.supports = emptySupports();
    state.meta.totalProduced = emptyResources();
    state.meta.currentRunCores = 0;
    state.meta.currentRunStartAt = Date.now();
    state.meta.totalClicks = 0;
    state.meta.clickProgress = { ore: 0, ingot: 0, part: 0, circuit: 0, core: 0, prototype: 0 };
    state.meta.currentRunResearchBought = false;
    state.settings.autoBuy = {};

    // v0.9.10 — freeze the goal BEFORE flagging the challenge active (the
    // frozen-goal branch in effectiveChallengeGoal keys off the active id).
    // Computed after the pending-schematics credit above so the just-banked
    // run counts toward the power average the goal is anchored to.
    const frozenGoal = effectiveChallengeGoal(id);
    // Activate challenge flag BEFORE applyStartupBonuses so Ironman can skip
    // the patent heirlooms for this run.
    state.meta.challenge.active = id;
    state.meta.challenge.startedAt = Date.now();
    state.meta.challenge.goal = frozenGoal;
    applyStartupBonuses();

    invalidateRM();
    save();
    rebuildAll();
    setTab('factory');
    toast(`<b>⚠ CHALLENGE STARTED</b><br>${CHALLENGES[id].name} · ${CHALLENGES[id].constraintLabel}`, { duration: 5000 });
    return true;
  }
  function abandonChallenge() {
    if (!activeChallenge()) return false;
    state.meta.challenge.active = null;
    state.meta.challenge.startedAt = 0;
    state.meta.challenge.goal = 0;
    invalidateRM();
    save();
    rebuildAll();
    return true;
  }
  function completeChallenge(id) {
    const ch = CHALLENGES[id];
    if (!ch) return false;
    state.meta.challenge.completed[id] = Date.now();
    state.meta.challenge.active = null;
    state.meta.challenge.startedAt = 0;
    state.meta.challenge.goal = 0;
    invalidateRM();
    audio.achievement();
    celebrate('milestone', {
      bannerKind: 'CHALLENGE COMPLETE',
      bannerMain: ch.name,
      bannerSub: ch.rewardLabel,
      particles: 100,
    });
    checkAchievements(true);
    return true;
  }
  function failChallenge(id) {
    // Silent fail — just drop the flag. No penalty, player can retry.
    state.meta.challenge.active = null;
    state.meta.challenge.startedAt = 0;
    state.meta.challenge.goal = 0;
    invalidateRM();
    if (id) toast(`<b>Challenge failed</b> — ${(CHALLENGES[id] || {}).name || id}. Try again.`, { duration: 4000 });
    return true;
  }

  // ---------- ACHIEVEMENTS ----------
  // One-time milestones. Persist across prestige & publish. Each grants a small
  // permanent bonus scaled to the game stage at which it's earned.
  //
  // bonus keys: prodMul, consMul, costMul, clickAdd, schematicMul, prototypeMul (all additive-stacked)
  const ACHIEVEMENT_BONUSES = {
    // Progress (early-game, small nudges)
    first_machine:   { clickAdd: 1,          label: '+1 click power' },
    first_t2:        { prodMul: 0.02,        label: '+2% production' },
    first_t3:        { consMul: -0.02,       label: '-2% consumption' },
    first_t4:        { costMul: -0.02,       label: '-2% machine cost' },
    first_t5:        { prodMul: 0.05,        label: '+5% production' },
    first_t6:        { prototypeMul: 0.10,   label: '+10% prototype production' },
    first_core:      { prodMul: 0.03,        label: '+3% production' },
    first_proto:     { prototypeMul: 0.05,   label: '+5% prototype production' },

    // Meta (prestige / publish)
    first_prestige:  { schematicMul: 0.05,   label: '+5% schematics gain' },
    first_publish:   { prototypeMul: 0.10,   label: '+10% prototype production' },
    prestige_10:     { schematicMul: 0.05,   label: '+5% schematics gain' },
    prestige_50:     { schematicMul: 0.10,   label: '+10% schematics gain' },
    publish_5:       { prototypeMul: 0.10,   label: '+10% prototype production' },
    publish_25:      { prototypeMul: 0.20,   label: '+20% prototype production' },
    schematics_100:  { schematicMul: 0.05,   label: '+5% schematics gain' },
    schematics_1000: { schematicMul: 0.10,   label: '+10% schematics gain' },
    patents_10:      { prodMul: 0.05,        label: '+5% production' },
    patents_100:     { prodMul: 0.15,        label: '+15% production' },

    // Scale (numbers milestones)
    machines_10:     { costMul: -0.02,       label: '-2% machine cost' },
    machines_100:    { costMul: -0.03,       label: '-3% machine cost' },
    machines_1000:   { costMul: -0.05,       label: '-5% machine cost' },
    ore_million:     { prodMul: 0.03,        label: '+3% production' },
    ore_billion:     { prodMul: 0.10,        label: '+10% production' },
    clicks_100:      { clickAdd: 5,          label: '+5 click power' },
    clicks_1000:     { clickAdd: 25,         label: '+25 click power' },

    // Special (late game)
    mk4:             { prodMul: 0.03,        label: '+3% production' },
    mk5:             { prodMul: 0.05,        label: '+5% production' },
    golden_witness:  { prodMul: 0.05,        label: '+5% production' },
    all_tiers:       { prodMul: 0.10,        label: '+10% production' },
    scholar:         { costMul: -0.10,       label: '-10% machine cost' },
    origin:          { clickAdd: 2,          label: '+2 click power' },

    // Manual clicking (per-resource bootstrap)
    click_ingot:     { clickAdd: 2,          label: '+2 click power' },
    click_part:      { clickAdd: 5,          label: '+5 click power' },
    click_circuit:   { clickAdd: 15,         label: '+15 click power' },
    click_core:      { clickAdd: 50,         label: '+50 click power' },

    // CHALLENGE — big payoffs for hard/hidden runs
    speed_demon:     { schematicMul: 0.25,   label: '+25% schematics gain' },
    pacifist:        { prodMul: 0.15,        label: '+15% production' },
    ascetic:         { schematicMul: 0.20,   label: '+20% schematics gain' },
    minimalist:      { prodMul: 0.20,        label: '+20% production' },
    completionist:   { schematicMul: 0.50,   label: '+50% schematics gain' },
    nirvana:         { prototypeMul: 0.50,   label: '+50% prototype production' },
    quantum:         { schematicMul: 0.25,   label: '+25% schematics gain' },
    ghost:           { prototypeMul: 0.25,   label: '+25% prototype production' },
    master_clicker:  { clickAdd: 100,        label: '+100 click power' },
    flash_witness:   { prodMul: 0.08,        label: '+8% production' },
    overlord:        { prodMul: 0.15,        label: '+15% production' },
    marathoner:      { prodMul: 0.10,        label: '+10% production' },

    // CHALLENGE MODES — one per completion, plus a Grandmaster capstone
    ch_pacifist:     { prodMul: 0.05,        label: '+5% production' },
    ch_blitz:        { schematicMul: 0.05,   label: '+5% schematics gain' },
    ch_blackout:     { prodMul: 0.05,        label: '+5% production' },
    ch_tall:         { prodMul: 0.05,        label: '+5% production' },
    ch_monoculture:  { prodMul: 0.05,        label: '+5% production' },
    ch_purist:       { prodMul: 0.05,        label: '+5% production' },
    ch_ironman:      { schematicMul: 0.05,   label: '+5% schematics gain' },
    ch_slow_burn:    { prodMul: 0.05,        label: '+5% production' },
    ch_chaos:        { prodMul: 0.05,        label: '+5% production' },
    ch_grandmaster:  { prodMul: 0.20, schematicMul: 0.20, label: '+20% production · +20% schematics' },

    // BLUEPRINT — variety/commitment achievements tied to the per-run modifier system.
    bp_variety:      { schematicMul: 0.10,   label: '+10% schematics gain' },
    bp_believer:     { prodMul: 0.10,        label: '+10% production' },

    // v0.7.0 new challenge-mode completions
    ch_austere:      { prodMul: 0.05,        label: '+5% production' },
    ch_glassware:    { prodMul: 0.05,        label: '+5% production' },
    ch_overclock:    { prodMul: 0.05,        label: '+5% production' },
    ch_echo:         { schematicMul: 0.05,   label: '+5% schematics gain' },
    ch_famine:       { prodMul: 0.05,        label: '+5% production' },

    // v0.8.1 endgame achievements — stacked bonuses since these take a long time.
    first_exhibition:  { schematicMul: 0.10,  label: '+10% schematics gain' },
    legacy_5:          { schematicMul: 0.05,  label: '+5% schematics gain' },
    legacy_10:         { schematicMul: 0.10,  label: '+10% schematics gain' },
    archive_half:      { prodMul: 0.10,       label: '+10% production' },
    archive_complete:  { prodMul: 0.25,       label: '+25% production' },
    exh_variety:       { schematicMul: 0.25,  label: '+25% schematics gain' },

    // Capstone — earn every other achievement.
    perfectionist:     { prodMul: 0.50, schematicMul: 0.50, prototypeMul: 0.50, label: '+50% production · +50% schematics · +50% prototype' },
  };

  const ACHIEVEMENTS = {
    first_machine:    { name: 'FIRST STEPS',       desc: 'Build your first machine.',               group: 'progress' },
    first_t2:         { name: 'SMELTER',           desc: 'Unlock T2 · Smelting.',                    group: 'progress' },
    first_t3:         { name: 'FABRICATOR',        desc: 'Unlock T3 · Fabrication.',                 group: 'progress' },
    first_t4:         { name: 'ASSEMBLY LINE',     desc: 'Unlock T4 · Assembly.',                    group: 'progress' },
    first_t5:         { name: 'CORE WORKER',       desc: 'Unlock T5 · Core Forge.',                  group: 'progress' },
    first_t6:         { name: 'REFINER',           desc: 'Unlock T6 · Refinement.',                  group: 'progress' },
    first_core:       { name: 'THE FIRST CORE',    desc: 'Produce your first Core.',                 group: 'progress' },
    first_proto:      { name: 'PROTOTYPED',        desc: 'Produce your first Prototype.',            group: 'progress' },

    first_prestige:   { name: 'EARLY ADOPTER',     desc: 'Complete your first Prestige.',            group: 'meta' },
    first_publish:    { name: 'PUBLISHED',         desc: 'Complete your first Publish.',             group: 'meta' },
    prestige_10:      { name: 'EXPERIENCED',       desc: 'Complete 10 prestiges (lifetime).',        group: 'meta' },
    prestige_50:      { name: 'VETERAN',           desc: 'Complete 50 prestiges (lifetime).',        group: 'meta' },
    publish_5:        { name: 'WELL-PUBLISHED',    desc: 'Complete 5 Publishes.',                    group: 'meta' },
    publish_25:       { name: 'CITED WORKS',       desc: 'Complete 25 Publishes.',                   group: 'meta' },
    schematics_100:   { name: 'SCHEMATIST',        desc: 'Earn 100 lifetime Schematics.',            group: 'meta' },
    schematics_1000:  { name: 'IP LAWYER',         desc: 'Earn 1,000 lifetime Schematics.',          group: 'meta' },
    patents_10:       { name: 'PATENT HOLDER',     desc: 'Earn 10 lifetime Patents.',                group: 'meta' },
    patents_100:      { name: 'PATENT MOGUL',      desc: 'Earn 100 lifetime Patents.',               group: 'meta' },

    machines_10:      { name: 'GROWING',           desc: 'Own 10 machines.',                          group: 'scale' },
    machines_100:     { name: 'FACTORY FLOOR',     desc: 'Own 100 machines.',                         group: 'scale' },
    machines_1000:    { name: 'INDUSTRY LEADER',   desc: 'Own 1,000 machines.',                       group: 'scale' },
    ore_million:      { name: 'MILLIONAIRE',       desc: 'Produce 1M Ore (lifetime).',                group: 'scale' },
    ore_billion:      { name: 'BILLIONAIRE',       desc: 'Produce 1B Ore (lifetime).',                group: 'scale' },
    clicks_100:       { name: 'CLICKER',           desc: 'Mine 100 times.',                           group: 'scale' },
    clicks_1000:      { name: 'RSI',               desc: 'Mine 1,000 times.',                         group: 'scale' },

    mk4:              { name: 'MK-IV CERTIFIED',   desc: 'Unlock MK-IV Machines research.',          group: 'special' },
    mk5:              { name: 'MK-V CERTIFIED',    desc: 'Unlock MK-V Machines research.',           group: 'special' },
    golden_witness:   { name: 'GOLDEN AGE',        desc: 'Witness the Golden Tick in action.',        group: 'special' },
    all_tiers:        { name: 'TYCOON',            desc: 'Have T1-T6 all unlocked.',                  group: 'special' },
    scholar:          { name: 'SCHOLAR',           desc: 'Purchase 30 research nodes.',               group: 'special' },
    origin:           { name: 'THE ORIGIN',        desc: 'Purchase the Origin node.',                 group: 'special' },

    // Clicking milestones
    click_ingot:      { name: 'CRAFTSMAN',         desc: 'Click-earn 10 Ingot.',                      group: 'scale' },
    click_part:       { name: 'ARTISAN',           desc: 'Click-earn 10 Part.',                       group: 'scale' },
    click_circuit:    { name: 'SPECIALIST',        desc: 'Click-earn 10 Circuit.',                    group: 'scale' },
    click_core:       { name: 'MAESTRO',           desc: 'Click-earn 10 Core.',                       group: 'scale' },

    // CHALLENGE — hard, hidden, or speedrun-style achievements. Big rewards.
    speed_demon:      { name: 'SPEED DEMON',       desc: 'Complete a prestige within 5 minutes of starting a run.', group: 'challenge' },
    pacifist:         { name: 'PACIFIST',          desc: 'Prestige without a single manual click this run.',         group: 'challenge' },
    ascetic:          { name: 'ASCETIC',           desc: 'Prestige without purchasing any research this run.',       group: 'challenge' },
    minimalist:       { name: 'MINIMALIST',        desc: 'Prestige while owning fewer than 10 total machines.',      group: 'challenge' },
    completionist:    { name: 'COMPLETIONIST',     desc: 'Max out every research node simultaneously.',              group: 'challenge' },
    nirvana:          { name: 'NIRVANA',           desc: 'Max out every Patent.',                                     group: 'challenge' },
    quantum:          { name: 'QUANTUM',           desc: 'Earn 1B lifetime Schematics.',                              group: 'challenge' },
    ghost:            { name: 'GHOST',             desc: 'Publish without a single Support built.',                   group: 'challenge' },
    master_clicker:   { name: 'MASTER CLICKER',    desc: 'Mine 10,000 times (lifetime).',                             group: 'challenge' },
    flash_witness:    { name: 'FLASH',             desc: 'Witness 10 Flash events.',                                  group: 'challenge' },
    overlord:         { name: 'OVERLORD',          desc: 'Own 1,000 machines at once.',                               group: 'challenge' },
    marathoner:       { name: 'MARATHONER',        desc: 'Play for 24 cumulative hours.',                             group: 'challenge' },

    ch_pacifist:      { name: '◆ PACIFIST MODE',   desc: 'Complete the Pacifist challenge.',                          group: 'challenge' },
    ch_blitz:         { name: '◆ BLITZ MODE',      desc: 'Complete the Blitz challenge.',                             group: 'challenge' },
    ch_blackout:      { name: '◆ BLACKOUT MODE',   desc: 'Complete the Blackout challenge.',                          group: 'challenge' },
    ch_tall:          { name: '◆ TALL MODE',       desc: 'Complete the Tall challenge.',                              group: 'challenge' },
    ch_monoculture:   { name: '◆ MONOCULTURE MODE',desc: 'Complete the Monoculture challenge.',                       group: 'challenge' },
    ch_purist:        { name: '◆ PURIST MODE',     desc: 'Complete the Purist challenge.',                            group: 'challenge' },
    ch_ironman:       { name: '◆ IRONMAN MODE',    desc: 'Complete the Ironman challenge.',                           group: 'challenge' },
    ch_slow_burn:     { name: '◆ SLOW BURN MODE',  desc: 'Complete the Slow Burn challenge.',                         group: 'challenge' },
    ch_chaos:         { name: '◆ CHAOS MODE',      desc: 'Complete the Chaos challenge.',                             group: 'challenge' },
    ch_grandmaster:   { name: '◆ GRANDMASTER',     desc: 'Complete every challenge mode.',                            group: 'challenge' },

    bp_variety:       { name: '◆ BLUEPRINTER',     desc: 'Try every unique Blueprint at least once.',                 group: 'challenge' },
    bp_believer:      { name: '◆ TRUE BELIEVER',   desc: 'Prestige with the same Blueprint 5 times.',                 group: 'challenge' },

    // v0.7.0 new challenge-mode completions
    ch_austere:       { name: '◆ AUSTERE MODE',    desc: 'Complete the Austere challenge.',                           group: 'challenge' },
    ch_glassware:     { name: '◆ GLASSWARE MODE',  desc: 'Complete the Glassware challenge.',                         group: 'challenge' },
    ch_overclock:     { name: '◆ OVERCLOCK MODE',  desc: 'Complete the Overclock challenge.',                         group: 'challenge' },
    ch_echo:          { name: '◆ ECHO MODE',       desc: 'Complete the Echo challenge.',                              group: 'challenge' },
    ch_famine:        { name: '◆ FAMINE MODE',     desc: 'Complete the Famine challenge.',                            group: 'challenge' },

    // v0.8.1 endgame — Exhibitions + Archive progression
    first_exhibition: { name: '◆ DEBUT',           desc: 'Complete your first Exhibition.',                           group: 'meta' },
    legacy_5:         { name: '◆ LEGACY LADDER',   desc: 'Earn 5 lifetime Legacy Marks.',                             group: 'meta' },
    legacy_10:        { name: '◆ LASTING LEGACY',  desc: 'Earn 10 lifetime Legacy Marks.',                            group: 'meta' },
    archive_half:     { name: '◆ CURATOR',         desc: 'Own 5 Archive upgrades.',                                   group: 'meta' },
    archive_complete: { name: '◆ ARCHIVE COMPLETE', desc: 'Own every Archive upgrade.',                               group: 'meta' },
    exh_variety:      { name: '◆ EXHIBITIONIST',   desc: 'Complete every unique Exhibition.',                         group: 'challenge' },

    // v0.9.9 — higher-tier milestones. Player feedback (itch.io) was that
    // most achievements could be earned in under an hour and the rest of
    // the run had nothing to chase. These eight push the meta and scale
    // groups up an order of magnitude so a full play-arc has actual
    // long-term targets to shoot for.
    ore_trillion:     { name: '◆ ORE TRILLIONAIRE', desc: 'Produce 1T Ore (lifetime).',                                group: 'scale' },
    proto_million:    { name: '◆ MASS PRODUCTION',  desc: 'Produce 1M Prototypes (lifetime).',                         group: 'scale' },
    machines_2500:    { name: '◆ INDUSTRIAL PARK',  desc: 'Own 2,500 machines at once.',                               group: 'scale' },
    prestige_250:     { name: "◆ LIFE'S WORK",     desc: 'Complete 250 prestiges (lifetime).',                        group: 'meta' },
    publish_50:       { name: '◆ PROLIFIC',         desc: 'Complete 50 Publishes.',                                    group: 'meta' },
    patents_1000:     { name: '◆ PATENT EMPIRE',    desc: 'Earn 1,000 lifetime Patents.',                              group: 'meta' },
    legacy_25:        { name: '◆ ARCHIVIST',        desc: 'Earn 25 lifetime Legacy Marks.',                            group: 'meta' },
    long_run:         { name: '◆ THE LONG HAUL',    desc: 'Stay in a single run for 4 hours.',                         group: 'challenge' },

    // Capstone
    perfectionist:    { name: '◆◆◆ PERFECTIONIST', desc: 'Earn every other achievement.',                             group: 'challenge' },
  };

  // Returns { current, goal } for any achievement so progress bars can render.
  function achieveProgress(id) {
    const m = state.meta;
    const s = state;
    const totalMachines = () => { let c = 0; for (const k in s.machines) c += s.machines[k]||0; return c; };
    const researchOwned = () => { let c = 0; for (const k in s.research.levels) if (k !== 'origin') c += s.research.levels[k] > 0 ? 1 : 0; return c; };
    switch (id) {
      case 'first_machine':   return { current: totalMachines(), goal: 1 };
      case 'first_t2':        return { current: s.research.tiersUnlocked[2] ? 1 : 0, goal: 1 };
      case 'first_t3':        return { current: s.research.tiersUnlocked[3] ? 1 : 0, goal: 1 };
      case 'first_t4':        return { current: s.research.tiersUnlocked[4] ? 1 : 0, goal: 1 };
      case 'first_t5':        return { current: s.research.tiersUnlocked[5] ? 1 : 0, goal: 1 };
      case 'first_t6':        return { current: s.research.tiersUnlocked[6] ? 1 : 0, goal: 1 };
      case 'first_core':      return { current: (m.lifetimeProduced && m.lifetimeProduced.core)      || 0, goal: 1 };
      case 'first_proto':     return { current: (m.lifetimeProduced && m.lifetimeProduced.prototype) || 0, goal: 1 };
      case 'first_prestige':  return { current: (m.lifetimePrestiges || m.prestigeCount || 0),          goal: 1 };
      case 'first_publish':   return { current: (m.publishCount || 0),                                  goal: 1 };
      case 'prestige_10':     return { current: (m.lifetimePrestiges || 0),                             goal: 10 };
      case 'prestige_50':     return { current: (m.lifetimePrestiges || 0),                             goal: 50 };
      case 'publish_5':       return { current: (m.publishCount || 0),                                  goal: 5 };
      case 'publish_25':      return { current: (m.publishCount || 0),                                  goal: 25 };
      case 'schematics_100':  return { current: (m.lifetimeSchematics || 0),                            goal: 100 };
      case 'schematics_1000': return { current: (m.lifetimeSchematics || 0),                            goal: 1000 };
      case 'patents_10':      return { current: (m.totalPatents || 0),                                  goal: 10 };
      case 'patents_100':     return { current: (m.totalPatents || 0),                                  goal: 100 };
      case 'machines_10':     return { current: totalMachines(),                                        goal: 10 };
      case 'machines_100':    return { current: totalMachines(),                                        goal: 100 };
      case 'machines_1000':   return { current: totalMachines(),                                        goal: 1000 };
      case 'ore_million':     return { current: (m.lifetimeProduced && m.lifetimeProduced.ore) || 0,    goal: 1e6 };
      case 'ore_billion':     return { current: (m.lifetimeProduced && m.lifetimeProduced.ore) || 0,    goal: 1e9 };
      case 'clicks_100':      return { current: (m.totalClicks || 0),                                   goal: 100 };
      case 'clicks_1000':     return { current: (m.totalClicks || 0),                                   goal: 1000 };
      case 'mk4':             return { current: nodeLevel('mk4') >= 1 ? 1 : 0,                          goal: 1 };
      case 'mk5':             return { current: nodeLevel('mk5') >= 1 ? 1 : 0,                          goal: 1 };
      case 'golden_witness':  return { current: (m.goldenTicksSeen || 0),                               goal: 1 };
      case 'all_tiers':       return { current: [2,3,4,5,6].filter(t => s.research.tiersUnlocked[t]).length, goal: 5 };
      case 'scholar':         return { current: researchOwned(),                                        goal: 30 };
      case 'origin':          return { current: nodeLevel('origin') >= 1 ? 1 : 0,                       goal: 1 };
      case 'click_ingot':     return { current: (m.clicksByRes && m.clicksByRes.ingot)   || 0,          goal: 10 };
      case 'click_part':      return { current: (m.clicksByRes && m.clicksByRes.part)    || 0,          goal: 10 };
      case 'click_circuit':   return { current: (m.clicksByRes && m.clicksByRes.circuit) || 0,          goal: 10 };
      case 'click_core':      return { current: (m.clicksByRes && m.clicksByRes.core)    || 0,          goal: 10 };

      // CHALLENGE
      case 'speed_demon':     return { current: (m.fastestPrestigeSec && m.fastestPrestigeSec <= 300) ? 1 : 0, goal: 1 };
      case 'pacifist':        return { current: m.noClickPrestige    ? 1 : 0, goal: 1 };
      case 'ascetic':         return { current: m.noResearchPrestige ? 1 : 0, goal: 1 };
      case 'minimalist':      return { current: m.minMachinePrestige ? 1 : 0, goal: 1 };
      case 'completionist': {
        let total = 0, maxed = 0;
        for (const id in TREE_NODES) {
          const n = TREE_NODES[id];
          if (n.type !== 'leveled' && n.type !== 'unlock') continue;
          total++;
          const lvl = nodeLevel(id);
          const max = (n.type === 'leveled') ? (n.maxLevel || 1) : 1;
          if (lvl >= max) maxed++;
        }
        return { current: maxed, goal: total };
      }
      case 'nirvana': {
        let total = 0, maxed = 0;
        for (const id in PATENTS) {
          const p = PATENTS[id];
          total++;
          const lvl = patentLevel(id);
          const max = (p.type === 'leveled') ? (p.maxLevel || 1) : 1;
          if (lvl >= max) maxed++;
        }
        return { current: maxed, goal: total };
      }
      case 'quantum':         return { current: (m.lifetimeSchematics || 0),                              goal: 1e9 };
      case 'ghost':           return { current: m.noSupportPublish ? 1 : 0,                                goal: 1 };
      case 'master_clicker':  return { current: (m.lifetimeClicks || 0),                                  goal: 10000 };
      case 'flash_witness':   return { current: (m.flashesSeen || 0),                                     goal: 10 };
      case 'overlord':        return { current: (m.peakMachines || 0),                                    goal: 1000 };
      case 'marathoner':      return { current: (m.totalPlaytimeMs || 0),                                 goal: 24 * 3600 * 1000 };
      // v0.9.9 — higher-tier milestones (see ACHIEVEMENTS dict above).
      case 'ore_trillion':    return { current: (m.lifetimeProduced && m.lifetimeProduced.ore) || 0,       goal: 1e12 };
      case 'proto_million':   return { current: (m.lifetimeProduced && m.lifetimeProduced.prototype) || 0, goal: 1e6 };
      case 'machines_2500':   return { current: Math.max(totalMachines(), m.peakMachines || 0),            goal: 2500 };
      case 'prestige_250':    return { current: (m.lifetimePrestiges || 0),                                goal: 250 };
      case 'publish_50':      return { current: (m.publishCount || 0),                                     goal: 50 };
      case 'patents_1000':    return { current: (m.totalPatents || 0),                                     goal: 1000 };
      case 'legacy_25': {
        // Total exhibitions ever completed — each grants 1 LM, so this is
        // the lifetime-marks total even after the player spends them.
        const c = (m.exhibitions && m.exhibitions.completed) || {};
        let total = 0; for (const k in c) total += c[k] || 0;
        return { current: total, goal: 25 };
      }
      case 'long_run':        return { current: m.longRunAchieved ? 1 : 0,                                 goal: 1 };

      case 'ch_pacifist':     return { current: (m.challenge && m.challenge.completed && m.challenge.completed.pacifist) ? 1 : 0, goal: 1 };
      case 'ch_blitz':        return { current: (m.challenge && m.challenge.completed && m.challenge.completed.blitz)    ? 1 : 0, goal: 1 };
      case 'ch_blackout':     return { current: (m.challenge && m.challenge.completed && m.challenge.completed.blackout) ? 1 : 0, goal: 1 };
      case 'ch_tall':         return { current: (m.challenge && m.challenge.completed && m.challenge.completed.tall)     ? 1 : 0, goal: 1 };
      case 'ch_monoculture':  return { current: (m.challenge && m.challenge.completed && m.challenge.completed.monoculture) ? 1 : 0, goal: 1 };
      case 'ch_purist':       return { current: (m.challenge && m.challenge.completed && m.challenge.completed.purist)   ? 1 : 0, goal: 1 };
      case 'ch_ironman':      return { current: (m.challenge && m.challenge.completed && m.challenge.completed.ironman)  ? 1 : 0, goal: 1 };
      case 'ch_slow_burn':    return { current: (m.challenge && m.challenge.completed && m.challenge.completed.slow_burn) ? 1 : 0, goal: 1 };
      case 'ch_chaos':        return { current: (m.challenge && m.challenge.completed && m.challenge.completed.chaos)    ? 1 : 0, goal: 1 };
      case 'ch_grandmaster': {
        const done = (m.challenge && m.challenge.completed) || {};
        let c = 0; const total = Object.keys(CHALLENGES).length;
        for (const k in CHALLENGES) if (done[k]) c++;
        return { current: c, goal: total };
      }
      case 'bp_variety': {
        const seen = (m.blueprints && m.blueprints.seen) || {};
        let c = 0; const total = Object.keys(BLUEPRINTS).length;
        for (const k in BLUEPRINTS) if (seen[k]) c++;
        return { current: c, goal: total };
      }
      case 'bp_believer': {
        const uses = (m.blueprints && m.blueprints.timesUsed) || {};
        let best = 0;
        for (const k in uses) if (uses[k] > best) best = uses[k];
        return { current: best, goal: 5 };
      }
      // v0.7.0 challenge-mode completions
      case 'ch_austere':      return { current: (m.challenge && m.challenge.completed && m.challenge.completed.austere)   ? 1 : 0, goal: 1 };
      case 'ch_glassware':    return { current: (m.challenge && m.challenge.completed && m.challenge.completed.glassware) ? 1 : 0, goal: 1 };
      case 'ch_overclock':    return { current: (m.challenge && m.challenge.completed && m.challenge.completed.overclock) ? 1 : 0, goal: 1 };
      case 'ch_echo':         return { current: (m.challenge && m.challenge.completed && m.challenge.completed.echo)      ? 1 : 0, goal: 1 };
      case 'ch_famine':       return { current: (m.challenge && m.challenge.completed && m.challenge.completed.famine)    ? 1 : 0, goal: 1 };
      // v0.8.1 endgame — Exhibitions + Archive
      case 'first_exhibition': {
        const c = (m.exhibitions && m.exhibitions.completed) || {};
        let total = 0; for (const k in c) total += c[k] || 0;
        return { current: total > 0 ? 1 : 0, goal: 1 };
      }
      case 'legacy_5':
      case 'legacy_10': {
        // Sum total exhibitions ever completed — each grants 1 LM, so this is
        // the lifetime-marks total even after the player spends them.
        const c = (m.exhibitions && m.exhibitions.completed) || {};
        let total = 0; for (const k in c) total += c[k] || 0;
        return { current: total, goal: id === 'legacy_5' ? 5 : 10 };
      }
      case 'archive_half':
      case 'archive_complete': {
        const up = m.legacyUpgrades || {};
        let owned = 0; for (const k in up) if (up[k]) owned++;
        const total = Object.keys(LEGACY_UPGRADES).length;
        return { current: owned, goal: id === 'archive_half' ? Math.ceil(total / 2) : total };
      }
      case 'exh_variety': {
        const c = (m.exhibitions && m.exhibitions.completed) || {};
        let uniq = 0; const total = Object.keys(EXHIBITIONS).length;
        for (const k in EXHIBITIONS) if (c[k]) uniq++;
        return { current: uniq, goal: total };
      }
      case 'perfectionist': {
        const earned = m.achievements || {};
        const total = Object.keys(ACHIEVEMENTS).length - 1; // exclude self
        let c = 0;
        for (const k in ACHIEVEMENTS) {
          if (k === 'perfectionist') continue;
          if (earned[k]) c++;
        }
        return { current: c, goal: total };
      }
    }
    return { current: 0, goal: 1 };
  }
  function achieveCheck(id) {
    const p = achieveProgress(id);
    return p.current >= p.goal;
  }

  let lastAchCheck = 0;
  function checkAchievements(force) {
    const now = Date.now();
    if (!force && now - lastAchCheck < 1000) return;
    lastAchCheck = now;
    if (!state.meta.achievements) state.meta.achievements = {};
    if (!state.meta.newAchievements) state.meta.newAchievements = {};
    const earnedNow = [];
    for (const id in ACHIEVEMENTS) {
      if (state.meta.achievements[id]) continue;
      if (achieveCheck(id)) {
        state.meta.achievements[id] = now;
        state.meta.newAchievements[id] = true;
        earnedNow.push(id);
      }
    }
    if (earnedNow.length) {
      invalidateRM();    // bonuses apply immediately
      audio.achievement();
      prevAchSig = '';   // force achievements panel to re-render
      // Banner celebrate — suppressed during boot's catch-up pass to avoid a
      // storm, and staggered 800ms after any other celebrate so the banners
      // don't overlap with a concurrent prestige/publish/challenge banner.
      if (!runtime.suppressAchievementCelebrate) {
        const fire = () => {
          if (earnedNow.length === 1) {
            const id = earnedNow[0];
            const a = ACHIEVEMENTS[id];
            const bonus = ACHIEVEMENT_BONUSES[id];
            celebrate('milestone', {
              bannerKind: 'ACHIEVEMENT',
              bannerMain: (a.name || '').replace(/^[◆◇]\s*/, ''),
              bannerSub: (bonus && bonus.label) ? bonus.label : (a.desc || ''),
              particles: 70,
              skipShake: true,
            });
          } else {
            celebrate('milestone', {
              bannerKind: 'ACHIEVEMENTS',
              bannerMain: `×${earnedNow.length} EARNED`,
              bannerSub: 'Check the Achievements tab for details',
              particles: 90,
              skipShake: true,
            });
          }
        };
        // If something else was just shown (challenge complete / prestige
        // banner etc.), wait for it to clear. Otherwise fire right away.
        const concurrent = document.querySelector('.celebrate-banner');
        setTimeout(fire, concurrent ? 2400 : 200);
      }
    }
  }
  function dismissAchievement(id) {
    if (state.meta.newAchievements && state.meta.newAchievements[id]) {
      delete state.meta.newAchievements[id];
    }
  }
  function dismissAllAchievements() {
    state.meta.newAchievements = {};
  }
  function hasNewAchievements() {
    const n = state.meta.newAchievements;
    if (!n) return 0;
    return Object.keys(n).length;
  }

  const BRANCH_GLYPHS = {
    origin:     '<polygon class="glyph" points="-6,0 0,-6 6,0 0,6"/>',
    speed:      '<polygon class="glyph" points="-5,3 5,3 0,-5"/>',
    logistics:  '<polygon class="glyph" points="-5,-3 -5,3 5,0"/>',
    yield:      '<circle class="glyph" cx="0" cy="0" r="3.5"/>',
    automation: '<rect class="glyph" x="-4" y="-4" width="8" height="8"/>',
    efficiency: '<polygon class="glyph" points="-5,0 0,-5 5,0 0,5"/>',
    power:      '<polygon class="glyph" points="-2,-6 2,-6 -1,0 3,0 -2,6 1,1 -3,1"/>',
  };

  // Per-node glyphs — hand-crafted so each research node reads as distinct
  // instead of all nodes in a branch wearing the same icon. Falls back to
  // BRANCH_GLYPHS if an id isn't here. Shapes use viewBox -10..10 with class
  // "glyph" to pick up the branch-colour fill.
  const NODE_GLYPHS = {
    // SPEED — angular / dynamic shapes
    speed_1:          '<polygon class="glyph" points="-3,-5 -3,5 5,0"/>',
    momentum:         '<polygon class="glyph" points="-5,3 -2,-3 2,-3 5,3"/>',
    speed_2:          '<polygon class="glyph" points="-6,-4 -2,0 -6,4 -3,4 1,0 -3,-4"/><polygon class="glyph" points="-1,-4 3,0 -1,4 2,4 6,0 2,-4"/>',
    catalyst:         '<polygon class="glyph" points="0,-6 2,-2 6,0 2,2 0,6 -2,2 -6,0 -2,-2"/>',
    speed_3:          '<circle class="glyph" cx="0" cy="0" r="5.5"/><circle cx="0" cy="0" r="2.5" fill="var(--bg-deep)"/><line x1="0" y1="0" x2="0" y2="-3" stroke="var(--bg-deep)" stroke-width="1"/>',
    apex:             '<polygon class="glyph" points="-6,5 0,-5 6,5 3,5 0,-1 -3,5"/>',
    infinity:         '<circle class="glyph" cx="-2.8" cy="0" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><circle class="glyph" cx="2.8" cy="0" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    perpetual_motion: '<polygon class="glyph" points="0,-6 5,-3 5,3 0,6 -5,3 -5,-3"/><circle cx="0" cy="0" r="1.5" fill="var(--bg-deep)"/>',

    // LOGISTICS — hand / click / strike shapes
    heavy_hands:      '<rect class="glyph" x="-4" y="-2" width="8" height="6"/><rect class="glyph" x="-3" y="-5" width="6" height="3"/>',
    auto_click:       '<polygon class="glyph" points="-3,-4 5,0 0,1 3,6 1,6 -2,2 -3,3"/>',
    click_speed:      '<polygon class="glyph" points="-6,-4 -2,0 -6,4 -4,4 0,0 -4,-4"/><polygon class="glyph" points="-1,-4 3,0 -1,4 1,4 5,0 1,-4"/>',
    click_power:      '<polygon class="glyph" points="-2,-6 2,-6 -1,0 3,0 -2,6 -1,1 -4,1"/>',
    critical:         '<polygon class="glyph" points="0,-6 1.6,-1.6 6,-1.6 2.4,1 3.6,6 0,3 -3.6,6 -2.4,1 -6,-1.6 -1.6,-1.6"/>',
    double_click:     '<circle class="glyph" cx="-2.5" cy="0" r="2.8"/><circle class="glyph" cx="3" cy="0" r="2.2"/>',
    transcend:        '<polygon class="glyph" points="0,-6 5,-1 2.5,-1 2.5,6 -2.5,6 -2.5,-1 -5,-1"/>',
    crit_cascade:     '<polygon class="glyph" points="-3,-6 1,-2 -2,-2 2,2 -1,2 3,6 -1,2 1,0 -3,-1"/>',

    // YIELD — resource blocks / diamonds
    yield_1:          '<polygon class="glyph" points="-5,-3 5,-3 6,0 5,3 -5,3 -6,0"/>',
    double_pay:       '<polygon class="glyph" points="-5,0 -2,-4 1,0 -2,4"/><polygon class="glyph" points="1,-1 3.5,-4 6,-1 3.5,2"/>',
    yield_2:          '<polygon class="glyph" points="-5,4 -3,-4 3,-4 5,4"/>',
    yield_3:          '<polygon class="glyph" points="-3,-6 3,-6 6,-3 6,3 3,6 -3,6 -6,3 -6,-3"/><circle cx="0" cy="0" r="2" fill="var(--bg-deep)"/>',
    triple_pay:       '<polygon class="glyph" points="-6,0 -4,-2 -2,0 -4,2"/><polygon class="glyph" points="-1,-1 1,-3 3,-1 1,1"/><polygon class="glyph" points="2,0 4,-2 6,0 4,2"/>',
    yield_4:          '<path class="glyph" d="M -6 -2 L -2 -2 L -2 -5 L 2 -5 L 2 2 L 6 2 L 6 5"  fill="none" stroke="currentColor" stroke-width="1.4"/><circle class="glyph" cx="-6" cy="-2" r="1.2"/><circle class="glyph" cx="6" cy="5" r="1.2"/>',
    abundance:        '<polygon class="glyph" points="0,-6 4,-2 6,0 4,2 0,6 -4,2 -6,0 -4,-2"/>',
    golden_tick:      '<polygon class="glyph" points="0,-6 1.2,-1.2 6,0 1.2,1.2 0,6 -1.2,1.2 -6,0 -1.2,-1.2"/>',

    // AUTOMATION — machinery / boxes
    auto_1:           '<rect class="glyph" x="-5" y="-4" width="10" height="8"/><rect x="-3" y="-0.8" width="6" height="1.6" fill="var(--bg-deep)"/>',
    bulk_buy:         '<rect class="glyph" x="-6" y="-1" width="6" height="6"/><rect class="glyph" x="0" y="-5" width="6" height="6"/>',
    auto_2:           '<polygon class="glyph" points="-6,-4 6,-4 3,0 6,4 -6,4 -3,0"/>',
    auto_buy:         '<circle class="glyph" cx="0" cy="0" r="5"/><circle cx="0" cy="0" r="2.2" fill="var(--bg-deep)"/><rect x="-1" y="-6" width="2" height="1.6" class="glyph"/><rect x="-1" y="4.4" width="2" height="1.6" class="glyph"/>',
    auto_3:           '<rect class="glyph" x="-6" y="-5" width="3" height="10"/><rect class="glyph" x="-1.5" y="-5" width="3" height="10"/><rect class="glyph" x="3" y="-5" width="3" height="10"/>',
    max_buy:          '<polygon class="glyph" points="-6,-4 -3,-4 0,0 3,-4 6,-4 6,4 3,4 3,-1 0,3 -3,-1 -3,4 -6,4"/>',
    miniaturization:  '<rect class="glyph" x="-6" y="-6" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1"/><rect class="glyph" x="-2.5" y="-2.5" width="5" height="5"/>',
    blueprint_memory: '<rect class="glyph" x="-5" y="-6" width="10" height="12"/><line x1="-5" y1="-2" x2="5" y2="-2" stroke="var(--bg-deep)" stroke-width="1"/><line x1="-5" y1="2" x2="5" y2="2" stroke="var(--bg-deep)" stroke-width="1"/>',

    // EFFICIENCY — loops / leaves / compression
    eff_1:            '<polygon class="glyph" points="0,-6 6,0 0,6 -6,0"/><polygon points="-2.5,0 0,-2.5 2.5,0 0,2.5" fill="var(--bg-deep)"/>',
    lossless:         '<polygon class="glyph" points="-5,-5 5,-5 5,1 0,6 -5,1"/>',
    eff_2:            '<polygon class="glyph" points="-6,-4 6,-4 1.5,0 6,4 -6,4 -1.5,0"/>',
    recycling:        '<polygon class="glyph" points="0,-6 6,4 -6,4"/><polygon points="-2.5,-1.5 2.5,-1.5 0,2.5" fill="var(--bg-deep)"/>',
    eff_3:            '<rect class="glyph" x="-6" y="-2" width="12" height="4"/><rect class="glyph" x="-4" y="-5" width="8" height="1.5"/><rect class="glyph" x="-4" y="3.5" width="8" height="1.5"/>',
    zero_waste:       '<circle class="glyph" cx="0" cy="0" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><line x1="-4" y1="-4" x2="4" y2="4" stroke="currentColor" stroke-width="1.8"/>',
    perfection:       '<polygon class="glyph" points="-6,5 -4,-3 0,2 4,-3 6,5"/>',
    chain_reaction:   '<circle class="glyph" cx="-2.5" cy="0" r="3.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle class="glyph" cx="2.5" cy="0" r="3.5" fill="none" stroke="currentColor" stroke-width="1.6"/>',

    // POWER — numerals / bolts / batteries
    mk4:              '<rect class="glyph" x="-5" y="-5" width="2" height="10"/><polygon class="glyph" points="-1.5,-5 0.5,-5 2.5,5 0.5,5"/><rect class="glyph" x="3" y="-5" width="2" height="10"/>',
    overdrive_1:      '<polygon class="glyph" points="-2,-6 2,-6 0,0 3,0 -1,6 0,1 -2,1"/>',
    mk5:              '<polygon class="glyph" points="-5,-5 -3,-5 0,3 3,-5 5,-5 1.5,5 -1.5,5"/>',
    overdrive_2:      '<polygon class="glyph" points="-6,-6 -2,-6 -4,0 -1,0 -5,6 -4,1 -6,1"/><polygon class="glyph" points="1,-6 5,-6 3,0 6,0 2,6 3,1 1,1"/>',
    power_surge:      '<polygon class="glyph" points="-3,-6 3,-6 1,-1 4,-1 0,6 -4,-1 -1,-1"/>',
    power_cell:       '<rect class="glyph" x="-5" y="-3" width="8" height="6"/><rect class="glyph" x="3" y="-1.5" width="2" height="3"/>',
    unity:            '<circle class="glyph" cx="0" cy="0" r="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle class="glyph" cx="0" cy="0" r="1.5"/>',
    symbiosis:        '<polygon class="glyph" points="-6,0 0,-6 6,0 0,6"/><polygon points="-2.5,0 0,-2.5 2.5,0 0,2.5" fill="var(--bg-deep)"/>',

    // CAPSTONE — unique shapes for each r9/r10 node
    flash:             '<polygon class="glyph" points="-1,-6 3,-1 0,-1 2,6 -3,1 0,1"/>',
    momentum_plus:     '<polygon class="glyph" points="-6,3 -2,-3 2,-3 6,3"/><rect class="glyph" x="-0.8" y="-6" width="1.6" height="4"/><rect class="glyph" x="-3" y="-4.8" width="6" height="1.6"/>',
    triple_strike:     '<polygon class="glyph" points="-6,-4 -3,0 -6,4 -4,4 -1,0 -4,-4"/><polygon class="glyph" points="-2,-4 1,0 -2,4 0,4 3,0 0,-4"/><polygon class="glyph" points="2,-4 5,0 2,4 4,4 7,0 4,-4"/>',
    click_storm:       '<polygon class="glyph" points="-3,-6 1,-1 -1,-1 3,6 -1,2 1,2"/><circle class="glyph" cx="-5" cy="4" r="1"/><circle class="glyph" cx="5" cy="-4" r="1"/>',
    compound_interest: '<circle class="glyph" cx="0" cy="0" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="0" y1="0" x2="0" y2="-5" stroke="currentColor" stroke-width="1.5"/><line x1="0" y1="0" x2="4" y2="2" stroke="currentColor" stroke-width="1.5"/>',
    alchemy:           '<circle class="glyph" cx="-3" cy="0" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/><circle class="glyph" cx="3" cy="0" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/><polygon class="glyph" points="-1,-1 1,-1 0,1"/>',
    blueprint_library: '<rect class="glyph" x="-6" y="-5" width="3.5" height="10"/><rect class="glyph" x="-1.5" y="-5" width="3.5" height="10"/><rect class="glyph" x="3" y="-5" width="3" height="10"/>',
    distributed:       '<circle class="glyph" cx="-4" cy="-3" r="1.8"/><circle class="glyph" cx="4" cy="-3" r="1.8"/><circle class="glyph" cx="-4" cy="3" r="1.8"/><circle class="glyph" cx="4" cy="3" r="1.8"/><circle class="glyph" cx="0" cy="0" r="1.8"/><line x1="-4" y1="-3" x2="4" y2="3" stroke="currentColor" stroke-width="0.8"/><line x1="4" y1="-3" x2="-4" y2="3" stroke="currentColor" stroke-width="0.8"/>',
    thermal_runaway:   '<polygon class="glyph" points="0,-6 3,0 0,6 -3,0"/><polygon class="glyph" points="-1,-3 1,-3 1,3 -1,3" fill="var(--bg-deep)"/>',
    zero_point:        '<circle class="glyph" cx="0" cy="0" r="5.5" fill="none" stroke="currentColor" stroke-width="1.4"/><circle class="glyph" cx="0" cy="0" r="2"/>',
    nexus:             '<polygon class="glyph" points="0,-6 5,-3 5,3 0,6 -5,3 -5,-3"/><circle cx="0" cy="0" r="2.5" fill="var(--bg-deep)"/><circle class="glyph" cx="0" cy="0" r="1.2"/>',
    ascendance:        '<polygon class="glyph" points="0,-6 2,-1 6,0 2,1 0,6 -2,1 -6,0 -2,-1"/><circle class="glyph" cx="0" cy="0" r="2"/>',
  };

  // ---------- STATE ----------
  function emptyResources() { return { ore: 0, ingot: 0, part: 0, circuit: 0, core: 0, prototype: 0 }; }
  function emptyMachines()  { return Object.fromEntries(Object.keys(MACHINES).map(k => [k, 0])); }
  function emptySupports()  { return Object.fromEntries(Object.keys(SUPPORTS).map(k => [k, 0])); }
  function freshResearch()  { return { levels: { origin: 1 }, tiersUnlocked: { 2: false, 3: false, 4: false, 5: false, 6: false }, patentLevels: {} }; }

  function freshState() {
    return {
      version: VERSION,
      resources: emptyResources(),
      machines: emptyMachines(),
      supports: emptySupports(),
      research: freshResearch(),
      settings: {
        autoBuy: {},
        volume: 0.5,
        muted: false,
        notation: 'si',      // 'si' = K/M/B, 'sci' = scientific
        hintsShown: {},
        buyMode: '1',        // '1' | '10' | '100' | '1000' | 'max'
        autoPrestige: { enabled: false, threshold: 10 },
        autoPublish:  { enabled: false, threshold: 10 },
        tipsMuted: false,
        achievementsExpanded: false,
        autoMine: { ore: true, ingot: false, part: false, circuit: false, core: false, prototype: false },
        haptics: true,
        // Accessibility — default to honouring the OS preference; a user toggle
        // in Settings overrides. `reduceMotion` disables celebrate animations,
        // particle bursts, screen shake, and the mythic chip pulse.
        reduceMotion: null,          // null = auto (prefers-reduced-motion), true/false = user choice
        colorblindMode: false,       // false = default palette, true = IBM cb-safe palette
        // v0.9.10 — global text scale (1.0–1.5). Drives the --fs CSS variable;
        // every font-size in style.css is calc(Npx * var(--fs, 1)), so this
        // scales all text including modals, tooltips, and toasts.
        fontScale: 1,
      },
      meta: {
        // v0.9.8 — first-run welcome schematic so the research tree is
        // immediately interactable instead of needing a full prestige to
        // open. Migration code preserves existing players at their
        // current count; this default only affects brand-new games.
        schematics: 1,
        totalSchematics: 0,
        prestigeCount: 0,
        firstPlay: Date.now(),
        totalPlaytimeMs: 0,
        totalClicks: 0,
        totalProduced: emptyResources(),
        lifetimeProduced: emptyResources(),
        currentRunCores: 0,
        currentRunStartAt: Date.now(),
        currentTab: 'factory',
        patents: 0,
        totalPatents: 0,
        publishCount: 0,
        lifetimePrestiges: 0,
        lifetimeSchematics: 0,
        // v0.9.10 — best single-run numbers this publish cycle (reset at
        // publish). Exhibition goals scale from these.
        bestRunOre: 0,
        bestRunSchematics: 0,
        lastPrestigeAt: 0,
        achievements: {},
        newAchievements: {},
        goldenTicksSeen: 0,
        clickProgress: { ore: 0, ingot: 0, part: 0, circuit: 0, core: 0, prototype: 0 },
        onboarding: { step: 0, done: false },
        // Per-run history buckets for the Stats tab graphs. Each sample: { t, ore, ingot, part, circuit, core, proto, score, sch, pat }.
        history: [],
        historyLastAt: 0,
        // Hard-achievement tracking (see ACHIEVEMENTS). Persists across all prestiges.
        lifetimeClicks: 0,
        flashesSeen: 0,
        peakMachines: 0,
        fastestPrestigeSec: Infinity,
        noClickPrestige: false,
        noResearchPrestige: false,
        minMachinePrestige: false,
        noSupportPublish: false,
        // v0.9.9 — latched on the first time any single run reaches 4 h
        // wall-clock since currentRunStartAt. Survives prestige / publish
        // because the achievement is "I've ever had a run that long."
        longRunAchieved: false,
        // Challenge modes — active run flag + completion ledger. Purchases of
        // research during a run toggle currentRunResearchBought so a Blackout
        // run that broke its own rule mid-way auto-fails. `goal` is the
        // schematic target frozen at startChallenge (0 = none active).
        challenge: { active: null, startedAt: 0, completed: {}, goal: 0 },
        currentRunResearchBought: false,
        // Fires once when the first Prototype ever produced crosses ≥1 so
        // the gateway-to-meta-prestige moment gets the celebrate treatment.
        firstPrototypeCelebrated: false,
        // Blueprints — per-run modifier rolled from BLUEPRINTS. `pool` holds
        // three rolled ids awaiting player choice; `timesUsed` tracks repeat
        // picks for the TRUE BELIEVER achievement; `seen` counts all unique
        // ids ever selected for BLUEPRINTER.
        blueprints: { active: null, pool: [], timesUsed: {}, seen: {} },
        // v0.8.0 — Exhibitions (third prestige layer). legacyMarks is the
        // currency, legacyUpgrades is the Archive ownership ledger. Exhibitions
        // mirror the Blueprint pool/active/ledger shape; `active` persists
        // across prestige-eligible runs until the goal is evaluated.
        legacyMarks: 0,
        legacyUpgrades: {},
        exhibitions: { active: null, completed: {}, failed: {}, pool: [], activeTargets: {} },
        // One-shot celebrate gates — flipped true after their banner fires so
        // the endgame discovery moments don't re-trigger on reload.
        firstLegacyMarkCelebrated: false,
        archiveCompleteCelebrated: false,
      },
      log: [],
      lastSaveAt: Date.now(),
      lastTickAt: Date.now(),
    };
  }

  let state = freshState();
  let sessionStartAt = Date.now();

  const runtime = {
    machineRatio: {}, bottleneck: {}, tierRate: {},
    totalProdPerSec: 0,
    prodRate: { ore: 0, ingot: 0, part: 0, circuit: 0, core: 0, prototype: 0 },
    consRate: { ore: 0, ingot: 0, part: 0, circuit: 0, core: 0, prototype: 0 },
    rm: null,
    autoBuyAccum: 0,
    // Boot-time flag so the first checkAchievements() call after load doesn't
    // spam a banner for every milestone the player already earned. Flipped to
    // false at the end of boot().
    suppressAchievementCelebrate: true,
    // Per-session gate so the backup-suggested toast fires at most once per load.
    backupNudged: false,
    // v0.9.1 — worker background-tick budget. Accumulates real-ms applied
    // from sim-worker ticks while the tab is hidden. Capped at the offline
    // limit so leaving the tab open hidden for 24 h doesn't earn more than
    // leaving it closed for 24 h. Reset to 0 on visibility-visible.
    hiddenTickAppliedMs: 0,
    // v0.9.5 — save hardening. lastBackupWriteAt throttles the rolling
    // backup slot write to once a minute. saveRecoveredFromBackup is set
    // when load() falls back to the backup slot because the primary save
    // couldn't be parsed — boot() surfaces a toast once the toast system
    // is live so the player knows their last ~60 s of work was rolled back.
    lastBackupWriteAt: 0,
    saveRecoveredFromBackup: false,
  };

  // ---------- AUDIO ----------
  // Procedural Web Audio — no external files. Every sound synthesized on demand.
  // Architecture: master gain → soft-knee compressor → destination, so layered
  // events (e.g. ten machine buys at once) don't peak harshly. Voices use a
  // proper attack/decay envelope; bigger events stack two harmonic oscillators
  // (sine + triangle) plus an optional filtered noise transient.
  const audio = (() => {
    let ctx = null, master = null, comp = null;

    function init() {
      if (ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      // master → compressor → destination
      master = ctx.createGain();
      master.gain.value = (state.settings && state.settings.volume != null) ? state.settings.volume : 0.5;
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.18;
      master.connect(comp).connect(ctx.destination);
      return true;
    }
    function setVolume(v) {
      if (master) master.gain.setValueAtTime(v, ctx.currentTime);
    }
    function silent() {
      return state.settings && (state.settings.muted || (state.settings.volume || 0) <= 0);
    }
    function now() { return ctx.currentTime; }

    // Single-voice tone with attack-release envelope.
    function voice(freq, dur, opts = {}) {
      const t = opts.start != null ? opts.start : now();
      const type = opts.type || 'sine';
      const vol = opts.vol != null ? opts.vol : 0.18;
      const attack = opts.attack != null ? opts.attack : 0.005;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (opts.detune) o.detune.value = opts.detune;
      if (opts.bend) o.frequency.exponentialRampToValueAtTime(opts.bend, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const dest = opts.dest || master;
      o.connect(g).connect(dest);
      o.start(t); o.stop(t + dur + 0.05);
      return { osc: o, gain: g };
    }
    // Two-osc unison for a fuller note (sine fundamental + triangle harmonic).
    function chime(freq, dur, opts = {}) {
      const t = opts.start != null ? opts.start : now();
      const vol = opts.vol != null ? opts.vol : 0.16;
      voice(freq, dur, { ...opts, start: t, type: 'sine',     vol: vol });
      voice(freq * 2, dur * 0.85, { ...opts, start: t, type: 'triangle', vol: vol * 0.45 });
    }
    function chord(freqs, dur, opts = {}) {
      const t = opts.start != null ? opts.start : now();
      const per = (opts.vol || 0.16) / Math.sqrt(freqs.length);
      freqs.forEach(f => chime(f, dur, { ...opts, start: t, vol: per }));
    }
    // Quick filtered-noise transient — adds bite to clicks and buys.
    function noise(dur, opts = {}) {
      const t = opts.start != null ? opts.start : now();
      const vol = opts.vol != null ? opts.vol : 0.10;
      const lp = opts.lp || 1800;
      const hp = opts.hp || 0;
      const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const lpFilt = ctx.createBiquadFilter(); lpFilt.type = 'lowpass'; lpFilt.frequency.value = lp;
      let chain = src.connect(lpFilt);
      if (hp > 0) {
        const hpFilt = ctx.createBiquadFilter(); hpFilt.type = 'highpass'; hpFilt.frequency.value = hp;
        chain = chain.connect(hpFilt);
      }
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      chain.connect(g).connect(master);
      src.start(t); src.stop(t + dur + 0.05);
    }
    function sweep(f1, f2, dur, opts = {}) {
      const t = opts.start != null ? opts.start : now();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = opts.type || 'sine';
      o.frequency.setValueAtTime(f1, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(opts.vol || 0.20, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + dur + 0.05);
    }

    // Tier-pitched mining frequencies (ore → ingot → … → prototype).
    const MINE_PITCH = [220, 277, 330, 392, 466, 554];

    function play(fn) { return (...args) => { if (silent()) return; if (!init()) return; fn(...args); }; }

    return {
      init, setVolume,

      // ---- UI ----
      // light click — used by settings preview
      click: play(() => {
        const t = now();
        noise(0.025, { lp: 4000, hp: 1500, vol: 0.05, start: t });
        voice(880, 0.04, { type: 'square', vol: 0.06, start: t });
      }),
      // softer dismiss / tap
      tap: play(() => voice(520, 0.03, { type: 'sine', vol: 0.05 })),
      // tab switch — barely-there whoosh
      tab: play(() => {
        const t = now();
        noise(0.10, { lp: 1400, hp: 400, vol: 0.04, start: t });
      }),
      // toast appearing — gentle pop
      toast: play(() => {
        const t = now();
        voice(720, 0.05, { type: 'sine', vol: 0.06, start: t });
        voice(1080, 0.04, { type: 'sine', vol: 0.04, start: t + 0.02 });
      }),
      // error / refused click — low buzz
      error: play(() => {
        const t = now();
        voice(140, 0.10, { type: 'sawtooth', vol: 0.08, start: t });
        voice(95, 0.10,  { type: 'sawtooth', vol: 0.05, start: t });
      }),

      // ---- MINING ----
      // Per-tier pitch so progressing tiers feels audibly different.
      mine: play((tierIdx) => {
        const t = now();
        const f = MINE_PITCH[Math.max(0, Math.min(MINE_PITCH.length - 1, tierIdx | 0))];
        noise(0.04, { lp: 3000, hp: 600, vol: 0.07, start: t });
        voice(f, 0.07, { type: 'square', vol: 0.10, start: t, bend: f * 1.15 });
        voice(f * 2, 0.05, { type: 'sine', vol: 0.05, start: t + 0.005 });
      }),
      crit: play(() => {
        const t = now();
        chime(1568, 0.18, { vol: 0.16, start: t });
        chime(2093, 0.22, { vol: 0.14, start: t + 0.04 });
        noise(0.04, { lp: 6000, hp: 3000, vol: 0.06, start: t });
      }),

      // ---- BUYING ----
      // Single machine — soft 2-note rise.
      buy: play(() => {
        const t = now();
        noise(0.025, { lp: 2400, hp: 800, vol: 0.05, start: t });
        chime(523, 0.08, { vol: 0.13, start: t });          // C5
        chime(784, 0.10, { vol: 0.13, start: t + 0.05 });   // G5
      }),
      // Bulk / max buy — quick ascending arpeggio.
      buyMax: play(() => {
        const t = now();
        const notes = [523, 659, 784, 988, 1175];           // C E G B D
        notes.forEach((f, i) => chime(f, 0.10, { vol: 0.10, start: t + i * 0.045 }));
        noise(0.04, { lp: 3000, hp: 1000, vol: 0.05, start: t });
      }),
      // Support building — slightly heavier than a machine.
      buyHeavy: play(() => {
        const t = now();
        noise(0.04, { lp: 1800, hp: 300, vol: 0.07, start: t });
        chime(330, 0.12, { vol: 0.14, start: t });
        chime(440, 0.14, { vol: 0.12, start: t + 0.06 });
      }),
      // Auto-buy toggled ON / OFF — different polarity.
      autoOn: play(() => {
        const t = now();
        voice(440, 0.06, { type: 'triangle', vol: 0.10, start: t });
        voice(659, 0.10, { type: 'triangle', vol: 0.10, start: t + 0.05 });
      }),
      autoOff: play(() => {
        const t = now();
        voice(523, 0.06, { type: 'triangle', vol: 0.10, start: t });
        voice(330, 0.10, { type: 'triangle', vol: 0.10, start: t + 0.05 });
      }),

      // ---- RESEARCH / PROGRESSION ----
      researchArm: play(() => voice(660, 0.05, { type: 'triangle', vol: 0.08 })),
      research: play(() => {
        const t = now();
        chord([523, 659, 784], 0.20, { vol: 0.16, start: t });
        chime(1047, 0.12, { vol: 0.10, start: t + 0.10 });
        noise(0.05, { lp: 5000, hp: 2000, vol: 0.04, start: t });
      }),
      // Tier unlocked — celebratory chord cascade.
      tierUnlock: play(() => {
        const t = now();
        sweep(220, 660, 0.25, { type: 'triangle', vol: 0.14, start: t });
        chord([523, 659, 784], 0.35, { vol: 0.18, start: t + 0.20 });
        chord([784, 988, 1175], 0.45, { vol: 0.16, start: t + 0.40 });
        noise(0.10, { lp: 4000, hp: 1500, vol: 0.06, start: t + 0.20 });
      }),
      // Achievement earned — short rewarding arpeggio.
      achievement: play(() => {
        const t = now();
        const notes = [523, 659, 784, 1047];                // C major arpeggio
        notes.forEach((f, i) => chime(f, 0.18, { vol: 0.13, start: t + i * 0.06 }));
        noise(0.04, { lp: 6000, hp: 3000, vol: 0.05, start: t });
      }),
      achievementDismiss: play(() => voice(420, 0.04, { type: 'square', vol: 0.05 })),
      // Patent purchased — heavier than a single research node.
      patent: play(() => {
        const t = now();
        chord([392, 523, 659], 0.22, { vol: 0.17, start: t });
        chord([784, 988], 0.32, { vol: 0.13, start: t + 0.12 });
        noise(0.06, { lp: 3000, hp: 800, vol: 0.06, start: t });
      }),

      // ---- PRESTIGE / PUBLISH (big moments) ----
      prestige: play(() => {
        const t = now();
        sweep(160, 880, 0.45, { type: 'triangle', vol: 0.22, start: t });
        chord([392, 523, 659], 0.40, { vol: 0.18, start: t + 0.30 });
        chord([784, 988, 1175], 0.50, { vol: 0.18, start: t + 0.55 });
        noise(0.18, { lp: 3500, hp: 600, vol: 0.07, start: t });
      }),
      // Publish — deeper, more resonant. The big payoff.
      publish: play(() => {
        const t = now();
        sweep(120, 660, 0.55, { type: 'sawtooth', vol: 0.18, start: t });
        chord([262, 330, 392], 0.55, { vol: 0.20, start: t + 0.35 });   // C E G
        chord([523, 659, 784], 0.65, { vol: 0.18, start: t + 0.65 });
        chord([784, 988, 1175], 0.80, { vol: 0.16, start: t + 0.95 });
        noise(0.30, { lp: 2500, hp: 200, vol: 0.08, start: t });
      }),

      // ---- SPECIAL ----
      goldenTick: play(() => {
        const t = now();
        const notes = [1047, 1319, 1568, 2093, 2637];
        notes.forEach((f, i) => chime(f, 0.22, { vol: 0.10, start: t + i * 0.05 }));
        noise(0.06, { lp: 8000, hp: 4000, vol: 0.05, start: t });
      }),
      welcome: play(() => {
        const t = now();
        chord([262, 330, 392], 0.5, { vol: 0.15, start: t });
        chord([523, 659, 784], 0.6, { vol: 0.13, start: t + 0.30 });
      }),
    };
  })();

  // ---------- TIPS / HINTS (routed to toast popups) ----------
  function toast(html, opts = {}) {
    if (state.settings && state.settings.tipsMuted) return;
    // showToast might not exist yet during early boot — fall back to console in that window.
    if (typeof showToast === 'function') showToast(html, opts);
  }
  function hint(id, html) {
    if (!state.settings.hintsShown) state.settings.hintsShown = {};
    if (state.settings.hintsShown[id]) return;
    state.settings.hintsShown[id] = true;
    if (state.settings && state.settings.tipsMuted) return;
    if (typeof showToast === 'function') showToast(html, { duration: 6000 });
  }

  // ---------- ACCESSIBILITY ----------
  // Reduce Motion: tri-state (null = auto via media query, true/false = user override).
  // Applies a `.reduce-motion` class to <body> so CSS can neutralise animations.
  // Colorblind mode: body class flip swaps branch hues to a cb-safe palette.
  function effectiveReduceMotion() {
    const v = state.settings && state.settings.reduceMotion;
    if (v === true) return true;
    if (v === false) return false;
    // auto — respect OS
    if (typeof window !== 'undefined' && window.matchMedia) {
      try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
      catch { return false; }
    }
    return false;
  }
  function applyA11yClasses() {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('reduce-motion', effectiveReduceMotion());
    document.body.classList.toggle('cb-palette', !!(state.settings && state.settings.colorblindMode));
    // Font scale lives on <html> so it reaches everything, including the
    // toast stack and modals that mount outside #app.
    const fs = (state.settings && state.settings.fontScale) || 1;
    document.documentElement.style.setProperty('--fs', fs);
    // Scaled text needs more room than the viewport-width media queries
    // know about (they can't read --fs). Treat the viewport as if it were
    // proportionally narrower and switch the topbar to its compact tab
    // labels when full labels would no longer fit — same degradation the
    // ≤720px mobile layer uses. 950 ≈ the unscaled width at which the full
    // six-tab topbar stops fitting.
    const effW = (typeof window !== 'undefined' ? window.innerWidth : 1280) / fs;
    document.body.classList.toggle('fs-compact', fs > 1 && effW < 950);
  }

  // ---------- ONBOARDING ----------
  // One-time guided tour for first-time players. Steps auto-advance as the
  // corresponding in-game condition becomes true, so the tutorial never blocks
  // a fast player and never nags a slow one. Dismissable and replayable from
  // Settings. The state flag `meta.onboarding.done` locks it off across every
  // future prestige and publish.
  const ONBOARD_STEPS = [
    { id: 'welcome',  title: 'WELCOME TO BLUEPRINT',
      body: 'Click <b>MINE ORE</b> to extract your first ore. This is the start of a long factory.',
      target: '[data-mine-res="ore"]',
      check: () => (state.resources.ore || 0) >= 1 },
    { id: 'drill',    title: 'AUTOMATE',
      body: 'Buy a <b>DRILL</b> so ore flows without clicking. Stack them — every drill multiplies output.',
      target: '[data-machine="drill"]',
      check: () => (state.machines.drill || 0) >= 1 },
    { id: 'expand',   title: 'SCALE UP',
      body: 'Keep buying drills. When you can <b>PRESTIGE</b>, a new tab will appear to spend <b>SCHEMATICS</b>.',
      target: null,
      check: () => (state.meta.prestigeCount || 0) >= 1 || (state.meta.schematics || 0) >= 1 },
    { id: 'research', title: 'SPEND SCHEMATICS',
      body: 'Open <b>RESEARCH</b>. Schematics unlock new tiers (T2, T3…) and permanent upgrades.',
      target: '#tab-tree',
      check: () => state.research.tiersUnlocked[2] || Object.values(state.research.levels || {}).some((v, i) => i > 0 && v > 0) },
    { id: 'publish',  title: 'THE LONG GAME',
      body: 'Reach <b>T6 · REFINEMENT</b> to produce <b>PROTOTYPES</b>. Publishing them earns <b>PATENTS</b> — a meta-currency that persists forever.',
      target: null,
      check: () => (state.meta.publishCount || 0) >= 1,
      autoAdvanceMs: 9000 },
    { id: 'done',     title: "YOU'RE ROLLING",
      body: 'Tour complete. Re-enable anytime from <b>SETTINGS → ONBOARDING</b>.',
      target: null,
      check: () => false,  // never auto-advances; dismissed by button
      final: true },
  ];

  let onboardEl = null;
  let onboardTargetEl = null;
  let onboardAutoTimer = null;

  function onboardActive() {
    const o = state.meta.onboarding || {};
    if (o.done) return false;
    if (state.settings.tipsMuted) return false;
    return true;
  }
  function currentOnboardStep() {
    const o = state.meta.onboarding || { step: 0, done: false };
    return ONBOARD_STEPS[o.step] || null;
  }
  function onboardAdvance() {
    const o = state.meta.onboarding;
    if (!o || o.done) return;
    o.step = (o.step || 0) + 1;
    if (o.step >= ONBOARD_STEPS.length || (ONBOARD_STEPS[o.step] && ONBOARD_STEPS[o.step].final)) {
      // reach the final step but do not dismiss yet — player clicks "GOT IT"
      if (o.step >= ONBOARD_STEPS.length) { o.done = true; o.step = ONBOARD_STEPS.length; }
    }
    renderOnboarding(true);
  }
  function onboardDismiss() {
    const o = state.meta.onboarding;
    if (!o) return;
    o.done = true;
    if (onboardEl && onboardEl.parentNode) onboardEl.parentNode.removeChild(onboardEl);
    onboardEl = null;
    clearOnboardTarget();
    if (onboardAutoTimer) { clearTimeout(onboardAutoTimer); onboardAutoTimer = null; }
    save();
  }
  function onboardRestart() {
    state.meta.onboarding = { step: 0, done: false };
    if (state.settings) state.settings.tipsMuted = false;
    save();
    renderOnboarding(true);
  }
  function clearOnboardTarget() {
    if (onboardTargetEl) {
      onboardTargetEl.classList.remove('onboard-target');
      onboardTargetEl = null;
    }
  }
  function setOnboardTarget(selector) {
    clearOnboardTarget();
    if (!selector) return;
    const el = document.querySelector(selector);
    if (!el) return;
    el.classList.add('onboard-target');
    onboardTargetEl = el;
  }

  function renderOnboarding(force) {
    if (!onboardActive()) {
      if (onboardEl && onboardEl.parentNode) onboardEl.parentNode.removeChild(onboardEl);
      onboardEl = null;
      clearOnboardTarget();
      return;
    }
    const step = currentOnboardStep();
    if (!step) { onboardDismiss(); return; }

    // Check auto-advance on non-final steps
    if (!step.final && step.check && step.check()) {
      onboardAdvance();
      return;
    }

    // Build the card if missing or the step changed
    if (!onboardEl || force || onboardEl.dataset.step !== step.id) {
      if (onboardEl && onboardEl.parentNode) onboardEl.parentNode.removeChild(onboardEl);
      onboardEl = document.createElement('div');
      onboardEl.className = 'onboard-card';
      onboardEl.dataset.step = step.id;
      const idx = state.meta.onboarding.step;
      const total = ONBOARD_STEPS.length;
      onboardEl.innerHTML = `
        <div class="ob-head">
          <span class="ob-step">STEP ${Math.min(idx + 1, total)} / ${total}</span>
          <button class="ob-skip" aria-label="Skip tutorial">SKIP</button>
        </div>
        <div class="ob-title">${step.title}</div>
        <div class="ob-body">${step.body}</div>
        <div class="ob-actions">
          ${step.final ? '<button class="ob-next">GOT IT</button>' : '<button class="ob-next">NEXT</button>'}
        </div>
      `;
      document.body.appendChild(onboardEl);
      onboardEl.querySelector('.ob-skip').addEventListener('click', onboardDismiss);
      onboardEl.querySelector('.ob-next').addEventListener('click', () => {
        if (step.final) onboardDismiss();
        else onboardAdvance();
      });
      setOnboardTarget(step.target);
      if (onboardAutoTimer) { clearTimeout(onboardAutoTimer); onboardAutoTimer = null; }
      if (step.autoAdvanceMs) {
        onboardAutoTimer = setTimeout(() => { if (currentOnboardStep() === step) onboardAdvance(); }, step.autoAdvanceMs);
      }
    }
  }

  // ---------- CELEBRATIONS ----------
  // Fire-and-forget "big moment" feedback. Stacks a radial screen-flash, a large
  // banner with the headline number, a burst of particles, brief screen-shake,
  // and haptic on mobile. Each layer cleans itself up via CSS animation timing.
  //
  // The CELEBRATE_PALETTE exists so we can match particle colours to the flash
  // colour — prestige = gold, publish = cyan, tier = green, milestone = pink.
  const CELEBRATE_PALETTE = {
    prestige:  ['#ffd670', '#ffb347', '#fff4c2'],
    publish:   ['#78c8ff', '#b4e4ff', '#ffffff'],
    tier:      ['#7effb4', '#b4ffce', '#ffffff'],
    milestone: ['#ff77b4', '#ffc2dc', '#ffd670'],
  };
  const CELEBRATE_KIND_LABEL = {
    prestige: 'PRESTIGE',
    publish: 'PUBLISH',
    tier: 'TIER UNLOCKED',
    milestone: 'MILESTONE',
  };

  function celebrate(kind, opts = {}) {
    kind = kind || 'prestige';
    const colors = CELEBRATE_PALETTE[kind] || CELEBRATE_PALETTE.prestige;
    const reduced = effectiveReduceMotion();

    // Radial flash
    const flash = document.createElement('div');
    flash.className = `celebrate-flash ${kind}`;
    document.body.appendChild(flash);
    setTimeout(() => { if (flash.parentNode) flash.parentNode.removeChild(flash); }, 1700);

    // Centered banner (skip on 'tier' since those happen repeatedly)
    if (opts.bannerMain || opts.bannerKind || opts.bannerSub) {
      const banner = document.createElement('div');
      banner.className = 'celebrate-banner';
      banner.innerHTML = `
        <div class="cb-inner">
          ${opts.bannerKind ? `<div class="cb-kind">${opts.bannerKind}</div>` : ''}
          ${opts.bannerMain ? `<div class="cb-main">${opts.bannerMain}</div>` : ''}
          ${opts.bannerSub  ? `<div class="cb-sub">${opts.bannerSub}</div>`   : ''}
        </div>
      `;
      document.body.appendChild(banner);
      setTimeout(() => { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 2300);
    }

    // Particle burst — fewer on mobile to stay smooth, zero when reduceMotion.
    const isMobile = window.matchMedia('(max-width: 720px)').matches;
    let particleCount = opts.particles != null ? opts.particles : (isMobile ? 40 : 80);
    if (reduced) particleCount = 0;
    if (particleCount > 0) {
      const field = document.createElement('div');
      field.className = 'celebrate-particles';
      const frag = document.createDocumentFragment();
      for (let i = 0; i < particleCount; i++) {
        const p = document.createElement('div');
        p.className = 'cp';
        const angle = (Math.random() * 360);
        const dist = 180 + Math.random() * (isMobile ? 260 : 420);
        const color = colors[(Math.random() * colors.length) | 0];
        const size = 4 + Math.random() * 8;
        p.style.setProperty('--a', angle + 'deg');
        p.style.setProperty('--d', dist + 'px');
        p.style.background = color;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.animationDelay = (Math.random() * 0.08) + 's';
        frag.appendChild(p);
      }
      field.appendChild(frag);
      document.body.appendChild(field);
      setTimeout(() => { if (field.parentNode) field.parentNode.removeChild(field); }, 1600);
    }

    // Screen shake on the #app container — suppressed when reduceMotion.
    if (!opts.skipShake && !reduced) {
      const app = document.getElementById('app');
      if (app) {
        app.classList.remove('screen-shake');
        void app.offsetWidth;
        app.classList.add('screen-shake');
        setTimeout(() => app.classList.remove('screen-shake'), 650);
      }
    }

    haptic(opts.hapticMs || 40);
  }

  // Check for milestone triggers after gain events. Returns the banner text to
  // fire, or null if no milestone was crossed this call. Thresholds are
  // log-spaced so the game drops one every couple of orders of magnitude.
  const SCHEMATIC_MILESTONES = [100, 1000, 10000, 100000, 1000000, 10000000, 1000000000];
  const PATENT_MILESTONES = [10, 100, 1000];
  function checkMilestones(before, after, kind) {
    const list = kind === 'schematics' ? SCHEMATIC_MILESTONES : PATENT_MILESTONES;
    for (const t of list) {
      if (before < t && after >= t) {
        return {
          bannerKind: kind === 'schematics' ? `${fmt(t)} SCHEMATICS` : `${fmt(t)} PATENTS`,
          bannerMain: 'MILESTONE',
          bannerSub: kind === 'schematics' ? 'lifetime' : 'lifetime',
        };
      }
    }
    return null;
  }

  // ---------- FORMATTERS ----------
  const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  function fmt(n) {
    if (!isFinite(n)) return '∞';
    if (n < 0) return '-' + fmt(-n);
    if (n < 1000) return (n < 10 && n % 1 !== 0) ? n.toFixed(1) : Math.floor(n).toString();
    if (state.settings && state.settings.notation === 'sci') {
      return n.toExponential(2).replace('e+', 'e');
    }
    const tier = Math.min(Math.floor(Math.log10(n) / 3), SUFFIXES.length - 1);
    const scaled = n / Math.pow(1000, tier);
    const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    return scaled.toFixed(digits) + SUFFIXES[tier];
  }
  function fmtDuration(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ' + (s % 60) + 's';
    const h = Math.floor(m / 60);
    return h + 'h ' + (m % 60) + 'm';
  }
  // Backup reminder — fires once per session after prestige/publish if the player
  // has at least 30 minutes of playtime AND hasn't exported in the last hour.
  // Keeps long runs safe without nagging brand-new players.
  function maybeNudgeBackup() {
    if (runtime.backupNudged) return;
    if ((state.meta.totalPlaytimeMs || 0) < 30 * 60 * 1000) return;
    const last = state.meta.lastExportAt || 0;
    if (last && Date.now() - last < 60 * 60 * 1000) return;
    runtime.backupNudged = true;
    setTimeout(() => {
      const hint = last
        ? `Last backup was ${fmtAgo(Date.now() - last)}.`
        : `You haven't backed up yet.`;
      toast(`<b>◆ BACKUP SUGGESTED</b><br>${hint} Export from Settings ◆ to keep progress safe.`, { duration: 6000 });
    }, 3500);
  }

  function fmtAgo(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's ago';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    return h + 'h ago';
  }

  // ---------- LOG (routes to toast popups) ----------
  function log(text) {
    if (state.settings && state.settings.tipsMuted) return;
    if (typeof showToast === 'function') showToast(text);
  }

  // ---------- UNLOCK / VISIBILITY ----------
  function tierUnlocked(tierId) {
    if (tierId === 1) return true;
    return !!state.research.tiersUnlocked[tierId];
  }
  function tierUnlockAvailable(tierId) {
    if (tierId === 2) return true;
    return !!state.research.tiersUnlocked[tierId - 1];
  }
  function tierUnlockCost(tierId) {
    const base = TIER_UNLOCKS[tierId] ? TIER_UNLOCKS[tierId].cost : 0;
    const mul = rm().tierUnlockMul || 1;
    return Math.max(1, Math.ceil(base * mul));
  }
  function canBuyTierUnlock(tierId) {
    if (tierUnlocked(tierId)) return false;
    if (!tierUnlockAvailable(tierId)) return false;
    return state.meta.schematics >= tierUnlockCost(tierId);
  }
  function buyTierUnlock(tierId) {
    if (!canBuyTierUnlock(tierId)) return false;
    state.meta.schematics -= tierUnlockCost(tierId);
    state.research.tiersUnlocked[tierId] = true;
    audio.tierUnlock();
    const tierName = (TIERS.find(t => t.id === tierId) || {}).name || `T${tierId}`;
    celebrate('tier', {
      bannerKind: 'TIER UNLOCKED',
      bannerMain: `T${tierId} · ${tierName}`,
      particles: 50,
      skipShake: true,
    });
    if (tierId === 2) hint('post_t2', '<b>TIP</b> — T2 machines consume Ore. Build enough Drills to keep them fed.');
    prevUnlockSig = '';
    return true;
  }
  function resourceVisible(res) {
    const tier = TIERS.find(t => t.resource === res);
    return tier ? tierUnlocked(tier.id) : false;
  }
  function supportUnlocked(id) { return tierUnlocked(SUPPORTS[id].unlockTier); }
  function anySupportUnlocked() { for (const id in SUPPORTS) if (supportUnlocked(id)) return true; return false; }
  function sidebarVisible() {
    // Only render the sidebar once it has something meaningful to display:
    // either supports are unlocked (T4+) or a publish/prototype flow is in
    // play. Previously it popped out as soon as the player bought a single
    // machine, leaving an empty panel for most of the early game.
    if (anySupportUnlocked()) return true;
    if ((state.resources.prototype || 0) > 0) return true;
    if ((state.meta.publishCount || 0) > 0) return true;
    return false;
  }
  function machineUnlocked(id) {
    const m = MACHINES[id];
    // MONOCULTURE challenge — only the slot-1 base machine of each tier is available.
    if (activeChallenge() === 'monoculture' && m.slot !== 1) return false;
    if (m.mk === 'mk4') return (state.research.levels.mk4 || 0) > 0;
    if (m.mk === 'mk5') return (state.research.levels.mk5 || 0) > 0;
    return true;
  }
  function canPrestige() {
    if (schematicsForPrestige() < 1) return false;
    // SLOW BURN challenge — forced minimum run length before prestige allowed.
    const cid = activeChallenge();
    if (cid && CHALLENGES[cid] && CHALLENGES[cid].minRunMs) {
      const elapsed = Date.now() - (state.meta.currentRunStartAt || Date.now());
      if (elapsed < CHALLENGES[cid].minRunMs) return false;
    }
    // PATIENT blueprint — same idea, different source.
    const bid = activeBlueprint();
    if (bid && BLUEPRINTS[bid] && BLUEPRINTS[bid].minRunMs) {
      const elapsed = Date.now() - (state.meta.currentRunStartAt || Date.now());
      if (elapsed < BLUEPRINTS[bid].minRunMs) return false;
    }
    return true;
  }
  function treeTabVisible() {
    // prestigeCount and schematics both reset on Publish, which used to hide
    // the Research tab after a player's first publish — confusing, because they
    // already know it exists. The lifetime gates keep the tab visible forever
    // once the player has done their first prestige or publish.
    return canPrestige()
        || state.meta.prestigeCount > 0
        || state.meta.schematics > 0
        || (state.meta.lifetimePrestiges || 0) > 0
        || (state.meta.publishCount || 0) > 0;
  }

  // ---------- RESEARCH ----------
  function nodeLevel(id) { return state.research.levels[id] || 0; }
  function nodeMax(id) {
    const n = TREE_NODES[id];
    if (!n) return 0;
    if (n.type === 'origin') return 1;
    if (n.type === 'unlock') return 1;
    return n.maxLevel;
  }
  function nodeNextCost(id) {
    const n = TREE_NODES[id];
    if (!n || n.type === 'origin') return 0;
    // ARCHIVIST blueprint: research costs halved during the run.
    const mul = rm().researchCostMul || 1;
    if (n.type === 'unlock') return Math.ceil(n.cost * mul);
    const nextLevel = nodeLevel(id) + 1;
    if (nextLevel > n.maxLevel) return Infinity;
    return Math.ceil(n.costForLevel(nextLevel) * mul);
  }
  function nodePrereqsMet(id) {
    const n = TREE_NODES[id];
    if (!n) return false;
    for (const req of n.requires) {
      if (nodeLevel(req) < 1) return false;
    }
    return true;
  }
  // Progressive reveal: node visible only when predecessors hit their reveal threshold.
  // Leveled: 50%+ of maxLevel. Unlock/origin: owned (level 1+).
  function nodeRevealed(id) {
    const n = TREE_NODES[id];
    if (!n) return false;
    if (n.requires.length === 0) return true;  // origin always revealed
    if (patentLevel('academia') > 0) return true; // ACADEMIA patent reveals whole tree
    // OPEN ARCHIVE legacy upgrade — same effect, cheaper entry point (endgame).
    if ((state.meta.legacyUpgrades || {}).open_archive) return true;
    for (const req of n.requires) {
      const reqNode = TREE_NODES[req];
      if (!reqNode) return false;
      const lvl = state.research.levels[req] || 0;
      if (reqNode.type === 'leveled') {
        const threshold = Math.ceil(reqNode.maxLevel * 0.5);
        if (lvl < threshold) return false;
      } else {
        if (lvl < 1) return false;  // origin or unlock
      }
    }
    return true;
  }
  function canResearch(id) {
    const n = TREE_NODES[id];
    if (!n) return false;
    if (nodeLevel(id) >= nodeMax(id)) return false;
    if (!nodePrereqsMet(id)) return false;
    const cost = nodeNextCost(id);
    if (state.meta.schematics < cost) return false;
    return true;
  }
  // ---------- PATENTS ----------
  function patentLevel(id) { return (state.research.patentLevels && state.research.patentLevels[id]) || 0; }
  function patentMax(id) {
    const p = PATENTS[id];
    if (!p) return 0;
    return p.type === 'unlock' ? 1 : p.maxLevel;
  }
  function patentNextCost(id) {
    const p = PATENTS[id];
    if (!p) return Infinity;
    if (p.type === 'unlock') return p.cost;
    const next = patentLevel(id) + 1;
    if (next > p.maxLevel) return Infinity;
    return p.costForLevel(next);
  }
  function patentPrereqsMet(id) {
    const p = PATENTS[id];
    if (!p) return false;
    for (const req of p.requires) if (patentLevel(req) < 1) return false;
    return true;
  }
  function canBuyPatent(id) {
    const p = PATENTS[id];
    if (!p) return false;
    if (patentLevel(id) >= patentMax(id)) return false;
    if (!patentPrereqsMet(id)) return false;
    return state.meta.patents >= patentNextCost(id);
  }
  function buyPatent(id) {
    if (!canBuyPatent(id)) return false;
    const cost = patentNextCost(id);
    state.meta.patents -= cost;
    state.research.patentLevels[id] = (state.research.patentLevels[id] || 0) + 1;
    invalidateRM();
    audio.patent();
    return true;
  }

  // ---------- PUBLISH (meta-prestige) ----------
  function canPublish() { return (state.resources.prototype || 0) >= 1; }
  function patentsForPublish() {
    // v0.9.2 balance pass: tightened from cbrt*3 to cbrt*2 after players
    // reported the first prestige already unlocked most of mastery.
    //
    // v0.9.4 softcap pass: cbrt alone is unbounded, so stockpile runs
    // (leaving the tab open 24-48 h so prototypes accumulate into the
    // trillions) were still producing tens of thousands of patents per
    // publish. The cbrt curve is preserved up to 100 patents (normal
    // play), then compressed so extreme proto counts can no longer
    // inflate beyond a few hundred patents per publish.
    //
    // v0.9.10: exponent tightened 0.65 → 0.5. A player reported earning
    // near-full mastery (~904 patents) in just 2 publishes — the 0.65
    // curve still paid ~450/publish at FUSION-era proto counts (~7e10).
    // At 0.5 the same run pays ~190, putting full mastery back in the
    // designed 8–12 publish range even for heavy farming.
    //
    //      proto      raw (cbrt*2)   softcapped (0.5)
    //      10         4              4
    //      1K         20             20
    //      100K       92             92
    //      1M         200            110
    //      1B         2 000          144
    //      1T         20 000         241
    //      1e14       92 831         404
    //      1e15       200 000        547
    //
    // Full unlock cost (~904 patents) takes 8–12 normal publishes,
    // matching the 10–20 h target play arc. A stockpile exploit now
    // shaves at most 2–3 publishes off that, instead of collapsing the
    // whole meta-layer into a single overnight run.
    // (Target arc revised from 25–40 h after multiple player reports
    // showed the game finishing well under that range; stack of
    // multiplicative bonuses compounds faster than originally modelled.)
    const proto = state.resources.prototype || 0;
    let raw = proto > 0 ? Math.cbrt(proto) * 2 : 0;
    const SOFTCAP = 100;
    if (raw > SOFTCAP) raw = SOFTCAP + Math.pow(raw - SOFTCAP, 0.5);
    let base = Math.floor(raw);
    // RECURSIVE patent: +1 per 40 research levels owned (excluding origin)
    if (patentLevel('recursive') > 0) {
      let lvls = 0;
      for (const id in state.research.levels) {
        if (id === 'origin') continue;
        lvls += state.research.levels[id] || 0;
      }
      base += Math.floor(lvls / 40);
    }
    // PATRONS legacy upgrade — permanent +10% patent gain.
    const mul = rm().patentMul || 1;
    return Math.floor(base * mul);
  }
  function doPublish() {
    const gained = patentsForPublish();
    state.meta.patents += gained;
    state.meta.totalPatents += gained;
    state.meta.publishCount += 1;

    // GHOST — no supports at publish time counts
    let supportsCount = 0;
    for (const id in state.supports) supportsCount += state.supports[id] || 0;
    if (supportsCount === 0) state.meta.noSupportPublish = true;

    // WIPE: everything except patents + patent levels + player prefs + lifetime stats.
    state.resources = emptyResources();
    state.machines = emptyMachines();
    state.supports = emptySupports();
    // Origin stays at level 1 after Publish — it's the "enable research" gate
    // and has no cost. Wiping it to 0 (previous behaviour) left every tree
    // node saying "origin required" with no hint that the player needed to
    // re-click the centre node. freshResearch() gives new games origin: 1
    // for the same reason; Publish just re-applies that baseline.
    state.research.levels = { origin: 1 };
    state.research.tiersUnlocked = { 2: false, 3: false, 4: false, 5: false, 6: false };
    state.meta.schematics = 0;
    state.meta.totalSchematics = 0;
    state.meta.prestigeCount = 0;
    state.meta.totalProduced = emptyResources();
    state.meta.currentRunCores = 0;
    state.meta.currentRunStartAt = Date.now();
    state.meta.totalClicks = 0;
    state.meta.lastPrestigeAt = 0;
    state.meta.clickProgress = { ore: 0, ingot: 0, part: 0, circuit: 0, core: 0, prototype: 0 };
    state.settings.autoBuy = {};
    // v0.9.10 — per-cycle bests reset with the cycle. Exhibition goals are
    // anchored to them, so post-publish goals relax back to their floors
    // while the player rebuilds.
    state.meta.bestRunOre = 0;
    state.meta.bestRunSchematics = 0;
    // Goals frozen against pre-publish power would be unreachable (or
    // trivial) after the wipe — re-freeze them against the fresh cycle.
    if (state.meta.challenge && state.meta.challenge.active) {
      state.meta.challenge.goal = 0; // drop the stale frozen goal so the recompute below doesn't echo it back
      state.meta.challenge.goal = effectiveChallengeGoal(state.meta.challenge.active);
    }
    if (state.meta.exhibitions && state.meta.exhibitions.active) {
      const exId = state.meta.exhibitions.active;
      const t = exhibitionTargetFor(exId);
      state.meta.exhibitions.activeTargets = (t != null) ? { [exId]: t } : {};
    }

    applyStartupBonuses();
    invalidateRM();
    prevUnlockSig = '';
    audio.publish();
    const patentsBefore = (state.meta.totalPatents || 0) - gained;
    const patentsAfter = state.meta.totalPatents || 0;
    if (state.meta.publishCount === 1) {
      celebrate('publish', {
        bannerKind: 'FIRST PUBLISH',
        bannerMain: `+${fmt(gained)}`,
        bannerSub: 'Patents earned · Mastery unlocked',
        particles: 120,
      });
    } else {
      celebrate('publish', {
        bannerKind: 'PUBLISHED',
        bannerMain: `+${fmt(gained)}`,
        bannerSub: 'Patents',
      });
    }
    const ms = checkMilestones(patentsBefore, patentsAfter, 'patents');
    if (ms) setTimeout(() => celebrate('milestone', ms), 1400);
    // Endgame unlock — first publish that crosses the 30-lifetime-patent
    // threshold. Fires a dedicated banner so the player SEES the new tab
    // appear rather than discovering it silently.
    if (patentsBefore < 30 && patentsAfter >= 30) {
      setTimeout(() => {
        celebrate('publish', {
          bannerKind: '◆ EXHIBITIONS UNLOCKED',
          bannerMain: 'THE ARCHIVE',
          bannerSub: 'A third prestige layer — earn Legacy Marks, buy permanent upgrades',
          particles: 140,
        });
      }, ms ? 2800 : 1400);
    }
    maybeNudgeBackup();
    save();
    rebuildAll();
    setTab('mastery');
  }

  function applyStartupBonuses() {
    // Blueprint startup — e.g. JUMPSTART adds starting ingots. Runs even if
    // Ironman skips patent heirlooms, since Blueprints are per-run modifiers.
    const bpId = activeBlueprint();
    if (bpId && BLUEPRINTS[bpId] && BLUEPRINTS[bpId].applyStartup) {
      BLUEPRINTS[bpId].applyStartup(state);
    }
    // IRONMAN challenge: patent heirlooms are suppressed for this run.
    if (activeChallenge() === 'ironman') return;
    const lvls = state.research.patentLevels || {};
    if ((lvls.draft_inheritance || 0) > 0)        state.research.tiersUnlocked[2] = true;
    if ((lvls.schematic_inheritance || 0) > 0)    state.research.tiersUnlocked[3] = true;
    if ((lvls.institutional_backing || 0) > 0)    state.research.tiersUnlocked[4] = true;
    if ((lvls.industrial_empire || 0) > 0)        state.research.tiersUnlocked[5] = true;
    if ((lvls.fast_start || 0) > 0) {
      // TALL caps machine counts at 3. fast_start at level 4 or 5 would seed
      // the run already over-cap and make TALL literally unwinnable. Clamp the
      // starting drill grant to the TALL cap - 1 so the player still gets a
      // head-start but can place additional drills up to the limit.
      const ch = activeChallenge();
      const grant = (ch === 'tall')
        ? Math.min(lvls.fast_start, 2)
        : lvls.fast_start;
      if (grant > 0) state.machines.drill = Math.max(state.machines.drill || 0, grant);
    }
    if ((lvls.legacy_wealth || 0) > 0) {
      state.resources.ore = Math.max(state.resources.ore || 0, 10000);
    }
    // DRAFTING HEIRLOOM legacy — +1 starting drill, stacks on top of fast_start.
    // Clamp against TALL's per-type cap so future changes to fast_start /
    // heirloom values can't push the opening state over-cap. Currently
    // fast_start clamps to 2 under TALL, +1 heirloom = 3 = exactly at cap;
    // this guard keeps it at the cap even if one side gets bumped later.
    if ((state.meta.legacyUpgrades || {}).drafting_heirloom) {
      const current = state.machines.drill || 0;
      const target = current + 1;
      const tallCap = activeChallenge() === 'tall' ? 3 : Infinity;
      state.machines.drill = Math.min(target, tallCap);
    }
  }

  // Internal — buys one research level. No audio, no challenge gate. Used by
  // the bulk paths so they fire one sound for the whole batch and only show
  // the BLACKOUT toast once when blocked.
  function researchBuyInner(id) {
    if (!canResearch(id)) return false;
    const cost = nodeNextCost(id);
    state.meta.schematics -= cost;
    state.research.levels[id] = (state.research.levels[id] || 0) + 1;
    state.meta.currentRunResearchBought = true;
    invalidateRM();
    return true;
  }
  function researchBuy(id) {
    // BLACKOUT: refuse the purchase outright rather than marking the run
    // tainted. Tier unlocks remain allowed (they're a different currency flow).
    if (activeChallenge() === 'blackout') {
      toast('<b>BLACKOUT</b> — research is locked this run.', { duration: 2500 });
      audio.error();
      return false;
    }
    const ok = researchBuyInner(id);
    if (ok) audio.research();
    return ok;
  }
  // v0.9.9 — bulk research buy. Mirrors machine / support buy structure.
  // count = number of levels to buy. The inner loop stops when the node
  // is maxed, the player runs out of schematics, or count is reached.
  function researchBuyMultiple(id, count) {
    if (activeChallenge() === 'blackout') {
      toast('<b>BLACKOUT</b> — research is locked this run.', { duration: 2500 });
      audio.error();
      return 0;
    }
    let bought = 0;
    for (let i = 0; i < count; i++) {
      if (!researchBuyInner(id)) break;
      bought++;
    }
    if (bought > 0) audio.research();
    return bought;
  }
  function researchBuyMax(id) {
    if (activeChallenge() === 'blackout') {
      toast('<b>BLACKOUT</b> — research is locked this run.', { duration: 2500 });
      audio.error();
      return 0;
    }
    let bought = 0;
    // Same 10000 sanity cap as buyMax for machines / supports.
    while (bought < 10000 && researchBuyInner(id)) bought++;
    if (bought > 0) audio.research();
    return bought;
  }

  // ---------- RESEARCH MULTIPLIERS ----------
  function researchMultipliers() {
    const m = {
      prodMul: 1, consMul: 1, costMul: 1, supportCostMul: 1,
      clickAdd: 0, clickMul: 0, autoClickPerSec: 0,
      critChance: 0, critMul: 1,
      freeRes: { ore: 0, ingot: 0, part: 0, circuit: 0, core: 0 },
      powerBoost: 1,
      momentum: 0,
      lossless: false,
      doublePay: 1,
      bulkBuy: false,
      autoBuy: false,
      maxBuy: false,
      // patent-level fields
      schematicMul: 1,
      prototypeMul: 1,
      offlineHoursAdd: 0,
      tierUnlockMul: 1,
      autoPrestige: false,
      autoPublish: false,
      omnitap: false,
      // new late-game tree fields
      perpetualMotion: false,
      critCascade: false,
      goldenTick: false,
      blueprintMemory: false,
      chainReaction: false,
      symbiosis: 0,
      // capstone (r9–r10) fields
      flash: false,
      momentumCapAdd: 0,
      clickStorm: false,
      compoundInterest: false,
      alchemy: false,
      blueprintPct: 0.80,
      distributed: 0,
      nexus: 0,
      supportCountMul: 1,
      // blueprint modifier fields
      inertSupports: false,
      autoClickDisabled: false,
      noCoreScore: false,
      fusionPath: 0,
      consFree: false,
      luckyFifth: false,
      // v0.7.0 — blueprint + challenge fields
      freeFirst3: false,         // VANGUARD blueprint: first 3 of each type free
      researchCostMul: 1,        // ARCHIVIST blueprint + EFFICIENT MIND legacy: scales research node cost
      extraBlueprintRoll: false, // ECHO challenge reward + FOURTH BLUEPRINT legacy: pool rolls 4 instead of 3
      // v0.8.0 — legacy (exhibition shop) fields
      patentMul: 1,              // PATRONS legacy: extra patents per publish
      challengeRewardMul: 1,     // AMPLIFIER legacy: scales every challenge's reward
    };
    for (const id in TREE_NODES) {
      const lvl = nodeLevel(id);
      if (lvl <= 0) continue;
      const node = TREE_NODES[id];
      if (node.applyEffect) node.applyEffect(m, lvl);
    }
    // patent layer — permanent meta-boosts
    for (const id in PATENTS) {
      const lvl = patentLevel(id);
      if (lvl <= 0) continue;
      const p = PATENTS[id];
      if (p.applyEffect) p.applyEffect(m, lvl);
    }
    // achievement layer — small permanent bonuses, stacking additively per stat
    const achs = state.meta.achievements || {};
    for (const id in achs) {
      const b = ACHIEVEMENT_BONUSES[id];
      if (!b) continue;
      if (b.prodMul)       m.prodMul *= (1 + b.prodMul);
      if (b.consMul)       m.consMul *= (1 + b.consMul);
      if (b.costMul)       m.costMul *= (1 + b.costMul);
      if (b.schematicMul)  m.schematicMul *= (1 + b.schematicMul);
      if (b.prototypeMul)  m.prototypeMul *= (1 + b.prototypeMul);
      if (b.clickAdd)      m.clickAdd += b.clickAdd;
    }
    // legacy layer — Archive upgrades, persist through every reset. Applied
    // BEFORE challenges so AMPLIFIER can scale challenge rewards.
    const lu = state.meta.legacyUpgrades || {};
    for (const id in lu) {
      if (!lu[id]) continue;
      const u = LEGACY_UPGRADES[id];
      if (u && u.applyEffect) u.applyEffect(m);
    }
    // challenge layer — each completed challenge grants a permanent bonus.
    // AMPLIFIER legacy (if owned) scales each reward proportionally.
    const cc = (state.meta.challenge && state.meta.challenge.completed) || {};
    const hasAmplifier = (state.meta.legacyUpgrades || {}).amplifier;
    for (const id in cc) {
      const ch = CHALLENGES[id];
      if (!ch || !ch.applyReward) continue;
      if (hasAmplifier) {
        // Apply 1.5x by calling the reward twice with a partial proxy — simpler:
        // just apply once, then mutate the common bonus fields by +50%.
        const before = {
          prodMul: m.prodMul, consMul: m.consMul, costMul: m.costMul,
          schematicMul: m.schematicMul, powerBoost: m.powerBoost,
          symbiosis: m.symbiosis, clickAdd: m.clickAdd,
          offlineHoursAdd: m.offlineHoursAdd, autoClickPerSec: m.autoClickPerSec,
        };
        ch.applyReward(m);
        // Boost the delta by 50%
        if (m.prodMul !== before.prodMul)             m.prodMul       = before.prodMul       * (1 + (m.prodMul       / before.prodMul       - 1) * 1.5);
        if (m.consMul !== before.consMul)             m.consMul       = before.consMul       * (1 + (m.consMul       / before.consMul       - 1) * 1.5);
        if (m.costMul !== before.costMul)             m.costMul       = before.costMul       * (1 + (m.costMul       / before.costMul       - 1) * 1.5);
        if (m.schematicMul !== before.schematicMul)   m.schematicMul  = before.schematicMul  * (1 + (m.schematicMul  / before.schematicMul  - 1) * 1.5);
        if (m.powerBoost !== before.powerBoost)       m.powerBoost    = before.powerBoost    * (1 + (m.powerBoost    / before.powerBoost    - 1) * 1.5);
        if (m.symbiosis !== before.symbiosis)         m.symbiosis     = before.symbiosis     + (m.symbiosis     - before.symbiosis)     * 0.5;
        if (m.clickAdd !== before.clickAdd)           m.clickAdd      = before.clickAdd      + (m.clickAdd      - before.clickAdd)      * 0.5;
        if (m.offlineHoursAdd !== before.offlineHoursAdd) m.offlineHoursAdd = before.offlineHoursAdd + (m.offlineHoursAdd - before.offlineHoursAdd) * 0.5;
        if (m.autoClickPerSec !== before.autoClickPerSec) m.autoClickPerSec = before.autoClickPerSec + (m.autoClickPerSec - before.autoClickPerSec) * 0.5;
      } else {
        ch.applyReward(m);
      }
    }
    // blueprint layer — single active modifier for the current run only.
    const bpId = activeBlueprint();
    if (bpId && BLUEPRINTS[bpId] && BLUEPRINTS[bpId].applyEffect) {
      BLUEPRINTS[bpId].applyEffect(m);
    }
    // active challenge "during" layer — modifiers that bite only while the
    // challenge is in progress (cost / prod / cons multipliers). Challenge
    // rewards are applied separately above via the completed layer.
    const aid = activeChallenge();
    if (aid && CHALLENGES[aid] && CHALLENGES[aid].applyDuring) {
      CHALLENGES[aid].applyDuring(m);
    }
    return m;
  }
  function invalidateRM() { runtime.rm = null; }
  function rm() { return runtime.rm || (runtime.rm = researchMultipliers()); }

  // ---------- GLOBAL MULTIPLIERS ----------
  function globalProdMul(totalMachines) {
    const r = rm();
    let mul = r.prodMul;
    const sMul = r.supportCountMul || 1;
    // INERT blueprint — supports contribute nothing
    if (!r.inertSupports) {
      for (const id in SUPPORTS) {
        const count = (state.supports[id] || 0) * sMul;
        const eff = (SUPPORTS[id].effect.prodMul || 0) * r.powerBoost;
        mul *= (1 + eff * count);
      }
    }
    const cap = MOMENTUM_CAP + (r.momentumCapAdd || 0);
    const momentumBonus = Math.min(cap, (totalMachines || 0) * r.momentum);
    mul *= (1 + momentumBonus);
    return mul;
  }
  function globalConsMul() {
    const r = rm();
    // MIRROR blueprint — consumption floored to 0
    if (r.consFree) return 0;
    let mul = r.consMul;
    const sMul = r.supportCountMul || 1;
    if (!r.inertSupports) {
      for (const id in SUPPORTS) {
        const count = (state.supports[id] || 0) * sMul;
        const eff = (SUPPORTS[id].effect.consMul || 0) * r.powerBoost;
        mul *= Math.max(0.05, 1 + eff * count);
      }
    }
    return mul;
  }

  // ---------- PURCHASE ----------
  function machineCost(id) {
    const m = MACHINES[id];
    const owned = state.machines[id] || 0;
    const mul = rm().costMul;
    const out = {};
    for (const res in m.cost) out[res] = m.cost[res] * Math.pow(m.costMul, owned) * mul;
    return out;
  }
  function supportCost(id) {
    const s = SUPPORTS[id];
    const owned = state.supports[id] || 0;
    const mul = rm().supportCostMul;
    const out = {};
    for (const res in s.cost) out[res] = s.cost[res] * Math.pow(s.costMul, owned) * mul;
    return out;
  }
  function canAfford(cost) {
    for (const res in cost) if ((state.resources[res] || 0) < cost[res]) return false;
    return true;
  }
  // Internal buy-once — used by the buyMultiple/buyMax loops. Doesn't play sound;
  // the caller plays a single appropriate sound for the whole batch.
  function buy(id) {
    if (!machineUnlocked(id)) return false;
    // TALL: hard cap at 3 per machine type. Bulk buys stop early at the cap.
    if (activeChallenge() === 'tall' && (state.machines[id] || 0) >= 3) return false;
    // ECHO: 5-second per-type cooldown after each purchase.
    if (activeChallenge() === 'echo') {
      runtime.echoCooldown = runtime.echoCooldown || {};
      const until = runtime.echoCooldown[id] || 0;
      if (Date.now() < until) return false;
    }
    const r = rm();
    const nextCount = (state.machines[id] || 0) + 1;
    // Free-purchase paths:
    //   - LUCKY FIFTH blueprint: every 5th purchase of a type is free.
    //   - VANGUARD blueprint: the first 3 of every type are free.
    const luckyFree = r.luckyFifth && nextCount % 5 === 0;
    const vanguardFree = r.freeFirst3 && nextCount <= 3;
    const free = luckyFree || vanguardFree;
    const cost = machineCost(id);
    if (!free) {
      if (!canAfford(cost)) return false;
      for (const res in cost) state.resources[res] -= cost[res];
    }
    state.machines[id] = nextCount;
    if (activeChallenge() === 'echo') {
      runtime.echoCooldown = runtime.echoCooldown || {};
      runtime.echoCooldown[id] = Date.now() + 5000;
    }
    return true;
  }
  function buyOne(id) {
    const ok = buy(id);
    if (ok) audio.buy();
    return ok;
  }
  function buyMultiple(id, count) {
    let bought = 0;
    for (let i = 0; i < count; i++) {
      if (!buy(id)) break;
      bought++;
    }
    if (bought > 0) (bought >= 5 ? audio.buyMax : audio.buy)();
    return bought;
  }
  function buyMax(id) {
    let bought = 0;
    while (bought < 10000 && canAfford(machineCost(id))) {
      if (!buy(id)) break;
      bought++;
    }
    if (bought > 0) (bought >= 5 ? audio.buyMax : audio.buy)();
    return bought;
  }
  function buyModeCount(mode, r) {
    // returns numeric count or 'max'; respects what's actually unlocked
    if (mode === '10'   && r.bulkBuy) return 10;
    if (mode === '100'  && r.bulkBuy) return 100;
    if (mode === '1000' && r.maxBuy)  return 1000;
    if (mode === 'max'  && r.maxBuy)  return 'max';
    return 1;
  }
  // Internal single-support purchase. No sound, no toast, no challenge gate.
  // Used by the bulk paths so they only play one sound for the whole batch
  // and only show the PURIST toast once when blocked.
  function buySupportInner(id) {
    const cost = supportCost(id);
    if (!canAfford(cost)) return false;
    for (const res in cost) state.resources[res] -= cost[res];
    state.supports[id] = (state.supports[id] || 0) + 1;
    return true;
  }
  function buySupport(id) {
    // PURIST challenge — supports are locked this run.
    if (activeChallenge() === 'purist') {
      toast('<b>PURIST</b> — no supports this run.', { duration: 2500 });
      audio.error();
      return false;
    }
    const ok = buySupportInner(id);
    if (ok) audio.buyHeavy();
    return ok;
  }
  function buySupportMultiple(id, count) {
    if (activeChallenge() === 'purist') {
      toast('<b>PURIST</b> — no supports this run.', { duration: 2500 });
      audio.error();
      return 0;
    }
    let bought = 0;
    for (let i = 0; i < count; i++) {
      if (!buySupportInner(id)) break;
      bought++;
    }
    if (bought > 0) (bought >= 5 ? audio.buyMax : audio.buyHeavy)();
    return bought;
  }
  function buySupportMax(id) {
    if (activeChallenge() === 'purist') {
      toast('<b>PURIST</b> — no supports this run.', { duration: 2500 });
      audio.error();
      return 0;
    }
    let bought = 0;
    // Same 10000 sanity cap as buyMax for machines.
    while (bought < 10000 && canAfford(supportCost(id))) {
      if (!buySupportInner(id)) break;
      bought++;
    }
    if (bought > 0) (bought >= 5 ? audio.buyMax : audio.buyHeavy)();
    return bought;
  }

  // ---------- TICK ----------
  function tick(dt) {
    const r = rm();

    for (const t of TIERS) runtime.tierRate[t.id] = 0;
    for (const res in runtime.prodRate) runtime.prodRate[res] = 0;
    for (const res in runtime.consRate) runtime.consRate[res] = 0;
    runtime.totalProdPerSec = 0;

    // roll-up manual click rate (sum of gains in last 1s) into prodRate per resource
    if (runtime.clickSamples) {
      const cutoff = Date.now() - 1000;
      for (const res in runtime.clickSamples) {
        runtime.clickSamples[res] = runtime.clickSamples[res].filter(s => s.t >= cutoff);
        let sum = 0;
        for (const s of runtime.clickSamples[res]) sum += s.amt;
        if (sum > 0) runtime.prodRate[res] = (runtime.prodRate[res] || 0) + sum;
      }
    }

    let totalMachines = 0;
    for (const id in state.machines) totalMachines += state.machines[id] || 0;

    let prodMul = globalProdMul(totalMachines);
    const consMul = globalConsMul();

    // ◆ CRIT CASCADE — 2× production while burst active
    if (r.critCascade && runtime.critCascadeEndAt && Date.now() < runtime.critCascadeEndAt) {
      prodMul *= 2;
    }

    // ◆ CHAIN REACTION — global +30% if all 5 base tiers have machines owned
    if (r.chainReaction) {
      let allActive = true;
      for (let t = 1; t <= 5; t++) {
        let any = false;
        for (const id in MACHINES) {
          if (MACHINES[id].tier === t && (state.machines[id] || 0) > 0) { any = true; break; }
        }
        if (!any) { allActive = false; break; }
      }
      if (allActive) prodMul *= 1.30;
    }

    // ◆ SYMBIOSIS — +N% per unique machine type owned
    if (r.symbiosis > 0) {
      let uniq = 0;
      for (const id in state.machines) if ((state.machines[id] || 0) > 0) uniq++;
      if (uniq > 0) prodMul *= (1 + r.symbiosis * uniq);
    }

    // ◆ NEXUS — +5%/lvl per actively-producing tier (up to 6)
    if (r.nexus > 0) {
      let activeTiers = 0;
      for (let t = 1; t <= 6; t++) {
        for (const id in MACHINES) {
          if (MACHINES[id].tier === t && (state.machines[id] || 0) > 0) { activeTiers++; break; }
        }
      }
      if (activeTiers > 0) prodMul *= (1 + r.nexus * activeTiers);
    }

    // ◆ CLICK STORM — active if 10 clicks landed within any 3s window recently
    if (r.clickStorm && runtime.clickStormEndAt && Date.now() < runtime.clickStormEndAt) {
      prodMul *= 2;
    }

    // ◆ COMPOUND INTEREST — yield-only bonus scales with current run duration
    let compoundYieldBonus = 1;
    if (r.compoundInterest) {
      const runMin = (Date.now() - (state.meta.currentRunStartAt || Date.now())) / 60000;
      compoundYieldBonus = 1 + Math.min(2.0, runMin * 0.02); // cap +200%
    }

    // ◆ FLASH — independent random-tier burst every 30s, 8s duration, ×5
    if (r.flash) {
      if (!runtime.flash) runtime.flash = { active: false, tierId: null, endAt: 0, nextAt: Date.now() + 30000 };
      const f = runtime.flash;
      const now = Date.now();
      if (f.active && now >= f.endAt) { f.active = false; f.nextAt = now + 30000; }
      else if (!f.active && now >= f.nextAt) {
        f.tierId = 1 + Math.floor(Math.random() * 6);
        f.active = true; f.endAt = now + 8000;
        state.meta.flashesSeen = (state.meta.flashesSeen || 0) + 1;
        log(`⚡ FLASH · T${f.tierId} surges ×5 for 8s`);
        audio.goldenTick();
      }
    }

    // ◆ ALCHEMY — every 5s, 1% of top unlocked resource converts up one tier
    if (r.alchemy) {
      if (!runtime.alchemyNextAt) runtime.alchemyNextAt = Date.now() + 5000;
      if (Date.now() >= runtime.alchemyNextAt) {
        runtime.alchemyNextAt = Date.now() + 5000;
        const chain = ['ore', 'ingot', 'part', 'circuit', 'core', 'prototype'];
        // find the largest qty resource whose next tier up is also unlocked
        let bestRes = null, bestQty = 0;
        for (let i = 0; i < chain.length - 1; i++) {
          const r1 = chain[i], r2 = chain[i+1];
          if (!resourceVisible(r2)) continue;
          const q = state.resources[r1] || 0;
          if (q > bestQty) { bestQty = q; bestRes = r1; }
        }
        if (bestRes) {
          const idx = chain.indexOf(bestRes);
          const up = chain[idx + 1];
          const delta = bestQty * 0.01;
          state.resources[bestRes] = Math.max(0, (state.resources[bestRes] || 0) - delta);
          state.resources[up] = (state.resources[up] || 0) + delta;
          state.meta.totalProduced[up] = (state.meta.totalProduced[up] || 0) + delta;
          state.meta.lifetimeProduced[up] = (state.meta.lifetimeProduced[up] || 0) + delta;
        }
      }
    }

    // ◆ GOLDEN TICK — scheduler
    if (r.goldenTick) {
      if (!runtime.goldenTick) runtime.goldenTick = { active: false, tierId: null, endAt: 0, nextAt: Date.now() + 60000 };
      const gt = runtime.goldenTick;
      const now = Date.now();
      if (gt.active && now >= gt.endAt) { gt.active = false; gt.nextAt = now + 60000; }
      else if (!gt.active && now >= gt.nextAt) {
        gt.tierId = 1 + Math.floor(Math.random() * 5);
        gt.active = true; gt.endAt = now + 5000;
        state.meta.goldenTicksSeen = (state.meta.goldenTicksSeen || 0) + 1;
        log(`✦ GOLDEN TICK · T${gt.tierId} surges ×10 for 5s`);
        audio.goldenTick();
      }
    }

    // ◆ RISING TIDE — precompute per-tier bonus
    const risingTideOn = patentLevel('rising_tide') > 0;
    const risingTideBonus = {};
    if (risingTideOn) {
      for (let t = 1; t <= 6; t++) {
        let higher = 0;
        for (let h = t + 1; h <= 6; h++) if (tierUnlocked(h)) higher++;
        risingTideBonus[t] = 1 + (0.05 * higher);
      }
    }

    // Auto-mine: per-resource toggle. Progress accumulates per tick at autoClickPerSec × baseMul.
    //  - ore: needs auto_click tree node unlocked
    //  - others: needs omnitap patent unlocked
    //  - production happens when progress crosses the recipe goal; input cost deducted per unit.
    if (r.autoClickPerSec > 0) {
      const baseMul = (1 + r.clickAdd) * (1 + (r.clickMul || 0));
      if (!state.meta.clickProgress) state.meta.clickProgress = {};
      for (const res in CLICK_RECIPE) {
        if (!isAutoMining(res)) continue;
        const recipe = CLICK_RECIPE[res];
        // Skip tick if input resource is below the inputCost — don't accumulate unredeemable progress
        if (recipe.inRes && (state.resources[recipe.inRes] || 0) < recipe.inputCost) continue;
        const progressPerSec = r.autoClickPerSec * baseMul;
        state.meta.clickProgress[res] = (state.meta.clickProgress[res] || 0) + progressPerSec * dt;

        // units produced this tick (continuous — may be fractional over time)
        const inRes = recipe.inRes;
        const inputCost = recipe.inputCost || 0;
        let produced = 0;
        while (state.meta.clickProgress[res] >= recipe.goal) {
          if (inRes && (state.resources[inRes] || 0) < inputCost) break;
          if (inRes) state.resources[inRes] -= inputCost;
          state.meta.clickProgress[res] -= recipe.goal;
          produced++;
          if (produced > 10000) break; // safety guard
        }

        if (produced > 0) {
          state.resources[res] = (state.resources[res] || 0) + produced;
          state.meta.totalProduced[res] = (state.meta.totalProduced[res] || 0) + produced;
          state.meta.lifetimeProduced[res] = (state.meta.lifetimeProduced[res] || 0) + produced;
        }
        // display rate (effective production/sec from this auto-mine)
        const effRate = progressPerSec / recipe.goal;
        runtime.prodRate[res] = (runtime.prodRate[res] || 0) + effRate;
        if (inRes && effRate > 0) {
          runtime.consRate[inRes] = (runtime.consRate[inRes] || 0) + effRate * inputCost;
        }
      }
    }

    // free resources from Yield (Compound Interest scales these with run duration)
    for (const res in r.freeRes) {
      const ratePerSec = r.freeRes[res] * compoundYieldBonus;
      if (ratePerSec > 0) {
        const amt = ratePerSec * dt;
        state.resources[res] = (state.resources[res] || 0) + amt;
        state.meta.totalProduced[res] = (state.meta.totalProduced[res] || 0) + amt;
        state.meta.lifetimeProduced[res] = (state.meta.lifetimeProduced[res] || 0) + amt;
        runtime.prodRate[res] = (runtime.prodRate[res] || 0) + ratePerSec;
      }
    }

    // machines
    for (const id in MACHINES) {
      const count = state.machines[id] || 0;
      if (count === 0) { runtime.machineRatio[id] = 1; runtime.bottleneck[id] = null; continue; }
      const m = MACHINES[id];

      let ratio = 1, bottleneck = null;
      for (const res in m.consumes) {
        const need = m.consumes[res] * count * dt * consMul;
        if (need <= 0) continue;
        const avail = state.resources[res] || 0;
        const rr = avail / need;
        if (rr < ratio) { ratio = rr; bottleneck = res; }
      }
      ratio = Math.max(0, Math.min(1, ratio));
      const consumeRatio = ratio;
      let produceRatio = ratio;
      if (r.perpetualMotion) produceRatio = 1;
      else if (r.lossless && ratio < LOSSLESS_FLOOR) produceRatio = LOSSLESS_FLOOR;

      runtime.machineRatio[id] = produceRatio;
      runtime.bottleneck[id] = ratio < 0.999 ? bottleneck : null;

      if (consumeRatio > 0) {
        for (const res in m.consumes) {
          const consumeRate = m.consumes[res] * count * consumeRatio * consMul;
          // Floor at zero — consumeRatio clamps over-consumption but fp slop can still leave a
          // tiny negative (e.g. -1e-13) that renders as "-0.0" in the top bar.
          state.resources[res] = Math.max(0, (state.resources[res] || 0) - consumeRate * dt);
          runtime.consRate[res] = (runtime.consRate[res] || 0) + consumeRate;
        }
      }

      if (produceRatio > 0) {
        // Per-machine multipliers: Golden Tick surge, Flash burst, Chaos blackout, Rising Tide lower-tier bonus, Distributed same-tier bonus
        const goldenMul = (runtime.goldenTick && runtime.goldenTick.active && runtime.goldenTick.tierId === m.tier) ? 10 : 1;
        const flashMul = (runtime.flash && runtime.flash.active && runtime.flash.tierId === m.tier) ? 5 : 1;
        const chaosMul = (runtime.chaos && runtime.chaos.endAt > Date.now() && runtime.chaos.tierId === m.tier) ? 0.1 : 1;
        const tideMul = risingTideOn ? (risingTideBonus[m.tier] || 1) : 1;
        let distributedMul = 1;
        if (r.distributed > 0) {
          let sameTier = 0;
          for (const oid in MACHINES) {
            if (oid !== id && MACHINES[oid].tier === m.tier) sameTier += (state.machines[oid] || 0);
          }
          distributedMul = 1 + r.distributed * sameTier;
        }
        for (const res in m.produces) {
          const extra = (res === 'prototype') ? r.prototypeMul : 1;
          const rate = m.produces[res] * count * produceRatio * prodMul * extra * goldenMul * flashMul * chaosMul * tideMul * distributedMul;
          const amt = rate * dt;
          state.resources[res] += amt;
          state.meta.totalProduced[res] = (state.meta.totalProduced[res] || 0) + amt;
          state.meta.lifetimeProduced[res] = (state.meta.lifetimeProduced[res] || 0) + amt;
          if (res === 'core') state.meta.currentRunCores = (state.meta.currentRunCores || 0) + amt;
          runtime.tierRate[m.tier] = (runtime.tierRate[m.tier] || 0) + rate;
          runtime.prodRate[res] = (runtime.prodRate[res] || 0) + rate;
          runtime.totalProdPerSec += rate;
        }
        // FUSION blueprint — ingot producers drip cores directly (shortcut the chain).
        // v0.9.10: flat per-machine rate (count × power state only). Deliberately
        // NOT multiplied by prodMul — cores' 6.25M score weight × a 20-50×
        // late-game prodMul made this drip outearn the entire real chain.
        if (r.fusionPath > 0 && m.produces.ingot) {
          const fusionRate = r.fusionPath * count * produceRatio;
          const fusionAmt = fusionRate * dt;
          state.resources.core = (state.resources.core || 0) + fusionAmt;
          state.meta.totalProduced.core = (state.meta.totalProduced.core || 0) + fusionAmt;
          state.meta.lifetimeProduced.core = (state.meta.lifetimeProduced.core || 0) + fusionAmt;
          state.meta.currentRunCores = (state.meta.currentRunCores || 0) + fusionAmt;
          runtime.prodRate.core = (runtime.prodRate.core || 0) + fusionRate;
        }
      }
    }

    // auto-buy (throttled)
    if (r.autoBuy) {
      runtime.autoBuyAccum += dt * 1000;
      if (runtime.autoBuyAccum >= AUTO_BUY_INTERVAL_MS) {
        runtime.autoBuyAccum = 0;
        for (const id in state.settings.autoBuy) {
          if (!state.settings.autoBuy[id] || !machineUnlocked(id)) continue;
          if (canAfford(machineCost(id))) buy(id);
        }
      }
    }

    state.meta.totalPlaytimeMs += dt * 1000;

    // OVERLORD achievement — track highest machine-count ever held
    if (totalMachines > (state.meta.peakMachines || 0)) state.meta.peakMachines = totalMachines;

    // v0.9.9 — THE LONG HAUL achievement. Latched the first time any
    // single run sits in currentRunStartAt for 4 cumulative wall-clock
    // hours. Once true, it stays true through prestige / publish — the
    // achievement is "I've had at least one 4 h+ run."
    if (!state.meta.longRunAchieved
        && Date.now() - (state.meta.currentRunStartAt || Date.now()) >= 4 * 3600 * 1000) {
      state.meta.longRunAchieved = true;
    }

    // BLITZ timer — auto-fail if the 5-minute window expires without a prestige.
    // Prestige within the window finalises the result via doPrestige().
    if (activeChallenge() === 'blitz') {
      const started = state.meta.challenge.startedAt || Date.now();
      const limit = CHALLENGES.blitz.timerMs;
      if (Date.now() - started >= limit) {
        failChallenge('blitz');
      }
    }

    // CHAOS challenge — every 30s, pick a random tier and cut its production
    // to 10% for 8s. Multiplier is applied in the per-machine production loop
    // above via runtime.chaos (see around the `goldenMul`/`flashMul` setup).
    if (activeChallenge() === 'chaos') {
      if (!runtime.chaos) runtime.chaos = { tierId: null, endAt: 0, nextAt: Date.now() + 15000 };
      const c = runtime.chaos;
      const now2 = Date.now();
      if (c.endAt < now2 && now2 >= c.nextAt) {
        c.tierId = 1 + Math.floor(Math.random() * 6);
        c.endAt = now2 + 8000;
        c.nextAt = now2 + 30000;
        log(`⚠ CHAOS · T${c.tierId} blackout for 8s`);
      }
    } else if (runtime.chaos) {
      runtime.chaos = null;
    }

    // GLASSWARE challenge — every 60s, halve the most-held resource. First
    // strike lands 60s after the run starts, not immediately.
    if (activeChallenge() === 'glassware') {
      if (!runtime.glassware) runtime.glassware = { nextAt: Date.now() + 60_000 };
      const g = runtime.glassware;
      const nowG = Date.now();
      if (nowG >= g.nextAt) {
        let bestRes = null, bestAmt = 0;
        for (const k in state.resources) {
          const v = state.resources[k] || 0;
          if (v > bestAmt) { bestAmt = v; bestRes = k; }
        }
        if (bestRes && bestAmt > 1) {
          state.resources[bestRes] = bestAmt * 0.5;
          toast(`<b>⚠ GLASSWARE</b> — lost 50% of ${bestRes}`, { duration: 2200 });
          log(`⚠ GLASSWARE · -50% ${bestRes}`);
        }
        g.nextAt = nowG + 60_000;
      }
    } else if (runtime.glassware) {
      runtime.glassware = null;
    }

    // HISTORY SAMPLER — record a small snapshot every 15s so the Stats tab can
    // plot curves. Ring-buffered at 240 samples (~1h of wall-clock data).
    const now = Date.now();
    if (now - (state.meta.historyLastAt || 0) >= 15000) {
      state.meta.historyLastAt = now;
      if (!Array.isArray(state.meta.history)) state.meta.history = [];
      const h = state.meta.history;
      const res = state.resources;
      h.push({
        t: now,
        o: res.ore || 0,
        i: res.ingot || 0,
        p: res.part || 0,
        c: res.circuit || 0,
        k: res.core || 0,
        r: res.prototype || 0,
        s: state.meta.schematics || 0,
        a: state.meta.patents || 0,
        pr: runtime.totalProdPerSec || 0,
      });
      while (h.length > 240) h.shift();
    }

    // ◆ AUTO-PRESTIGE
    // Run-time floor prevents an instant-ramp build from soft-locking the game
    // into a prestige loop every tick. 30s minimum gives the player time to see
    // the factory between resets and manually toggle auto-prestige off if they
    // want to stop. Threshold still gates on schematic gain on top.
    if (r.autoPrestige && state.settings.autoPrestige && state.settings.autoPrestige.enabled) {
      const threshold = state.settings.autoPrestige.threshold || 10;
      const runElapsed = Date.now() - (state.meta.currentRunStartAt || Date.now());
      if (runElapsed >= 30_000 && schematicsForPrestige() >= threshold && canPrestige()) {
        doPrestige();
        return; // state has been reset
      }
    }
    // ◆ AUTO-PUBLISH — same soft-lock guard, with a longer floor since publish
    // is the bigger reset and a rapid auto-publish loop would be worse.
    if (r.autoPublish && state.settings.autoPublish && state.settings.autoPublish.enabled) {
      const threshold = state.settings.autoPublish.threshold || 10;
      const runElapsed = Date.now() - (state.meta.currentRunStartAt || Date.now());
      if (runElapsed >= 60_000 && (state.resources.prototype || 0) >= threshold && canPublish()) {
        doPublish();
        return;
      }
    }

    // first-run hints (throttled via hintsShown once-off)
    const ore = state.meta.totalProduced.ore || 0;
    if (ore >= 10 && (state.machines.drill || 0) === 0) {
      hint('buy_drill', '<b>TIP</b> — buy a <b>DRILL</b> to automate mining.');
    }
    if (canPrestige() && state.meta.prestigeCount === 0) {
      hint('first_prestige', '<b>TIP</b> — you can now <b>PRESTIGE</b>! Earn Schematics to unlock tiers.');
    }
  }

  // Can the player toggle an auto-mine pickaxe on this resource?
  //   Ore: requires auto_click tree node
  //   Others: requires omnitap patent
  function canAutoMine(res) {
    if (!resourceVisible(res)) return false;
    if (res === 'ore') return nodeLevel('auto_click') >= 1;
    return patentLevel('omnitap') >= 1;
  }
  function isAutoMining(res) {
    return canAutoMine(res) && !!(state.settings.autoMine && state.settings.autoMine[res]);
  }

  function clickResource(res) {
    if (!resourceVisible(res)) return false;
    // PACIFIST: clicks are silently refused. Show a toast once per attempt so
    // players aren't confused into thinking the button is broken.
    if (activeChallenge() === 'pacifist') {
      if (!runtime.pacifistWarnedAt || Date.now() - runtime.pacifistWarnedAt > 3000) {
        runtime.pacifistWarnedAt = Date.now();
        toast('<b>PACIFIST</b> — no manual clicking this run.', { duration: 2200 });
      }
      audio.error();
      return false;
    }
    const recipe = CLICK_RECIPE[res];
    if (!recipe) return false;
    // Refuse the click if input is unavailable — matches the red "unaffordable" UI state
    // and prevents users from building up unredeemable progress they can't act on.
    if (recipe.inRes && (state.resources[recipe.inRes] || 0) < recipe.inputCost) return false;
    const r = rm();
    let baseMul = (1 + r.clickAdd) * (1 + (r.clickMul || 0));
    let crit = false;
    if (r.critChance > 0 && Math.random() < r.critChance) {
      baseMul *= r.critMul;
      crit = true;
    }
    // accumulate progress
    if (!state.meta.clickProgress) state.meta.clickProgress = {};
    state.meta.clickProgress[res] = (state.meta.clickProgress[res] || 0) + baseMul;

    // produce units while progress >= goal and input is available
    const goal = recipe.goal;
    const inRes = recipe.inRes;
    const inputCost = recipe.inputCost || 0;
    let produced = 0;
    while (state.meta.clickProgress[res] >= goal) {
      if (inRes && (state.resources[inRes] || 0) < inputCost) break; // starved — progress stays pending
      if (inRes) state.resources[inRes] -= inputCost;
      state.meta.clickProgress[res] -= goal;
      produced++;
    }

    state.meta.totalClicks = (state.meta.totalClicks || 0) + 1;
    state.meta.lifetimeClicks = (state.meta.lifetimeClicks || 0) + 1;
    if (produced > 0) {
      state.resources[res] = (state.resources[res] || 0) + produced;
      state.meta.totalProduced[res] = (state.meta.totalProduced[res] || 0) + produced;
      state.meta.lifetimeProduced[res] = (state.meta.lifetimeProduced[res] || 0) + produced;
      state.meta.clicksByRes = state.meta.clicksByRes || {};
      state.meta.clicksByRes[res] = (state.meta.clicksByRes[res] || 0) + produced;
      runtime.clickSamples = runtime.clickSamples || {};
      runtime.clickSamples[res] = runtime.clickSamples[res] || [];
      runtime.clickSamples[res].push({ t: Date.now(), amt: produced });
    }
    // Pitch the mining sound by tier so each resource sounds distinct.
    const tierIdx = TIERS.findIndex(t => t.resource === res);
    audio.mine(tierIdx >= 0 ? tierIdx : 0);
    if (crit) audio.crit();
    if (crit && r.critCascade) runtime.critCascadeEndAt = Date.now() + 3000;

    // ◆ CLICK STORM — 10 clicks within 3s triggers 5s x2 prod burst
    if (r.clickStorm) {
      runtime.clickStormTimes = runtime.clickStormTimes || [];
      const cutoff = Date.now() - 3000;
      runtime.clickStormTimes = runtime.clickStormTimes.filter(t => t >= cutoff);
      runtime.clickStormTimes.push(Date.now());
      if (runtime.clickStormTimes.length >= 10 && (!runtime.clickStormEndAt || Date.now() > runtime.clickStormEndAt)) {
        runtime.clickStormEndAt = Date.now() + 5000;
        runtime.clickStormTimes = [];
        log('⚡ CLICK STORM · ×2 production for 5s');
        audio.goldenTick();
      }
    }
    return true;
  }
  function clickMine() { clickResource('ore'); }

  // ---------- PRESTIGE ----------
  // Weighted score across all resources produced this run (totalProduced resets per prestige).
  // Each tier worth roughly 50× the previous, so reaching a new tier dramatically boosts payout.
  const TIER_SCORE_WEIGHTS = { ore: 1, ingot: 50, part: 2500, circuit: 125000, core: 6250000 };
  function schematicsForPrestige() {
    const p = state.meta.totalProduced || {};
    const r = rm();
    let score = 0;
    for (const res in TIER_SCORE_WEIGHTS) {
      // WINDFALL blueprint — cores do not contribute to score.
      if (r.noCoreScore && res === 'core') continue;
      score += (p[res] || 0) * TIER_SCORE_WEIGHTS[res];
    }
    // v0.7.0 balance: divisor bumped 150 → 250 (~18% fewer schematics per
    // run at equal production) so each run advances progression less.
    const base = Math.floor(Math.cbrt(score * r.doublePay / 250));
    let schem = Math.floor(base * r.schematicMul);
    // PRESTIGE STREAK patent: +20% if within 3 min of last prestige
    if (patentLevel('prestige_streak') > 0 && state.meta.lastPrestigeAt) {
      if (Date.now() - state.meta.lastPrestigeAt < 3 * 60 * 1000) {
        schem = Math.floor(schem * 1.20);
      }
    }
    return schem;
  }

  function doPrestige() {
    // Resolve any active challenge FIRST — evaluation has to run against the
    // pre-reset state (totalClicks, machine counts, currentRunResearchBought
    // all get zeroed below).
    const ch = activeChallenge();
    let challengeResolved = null;
    if (ch) {
      if (evaluateChallenge(ch)) {
        // Complete it after normal prestige housekeeping to avoid the
        // celebrate banner stacking on top of the prestige banner. Remember
        // the id here and finalise at the end.
        challengeResolved = { id: ch, win: true };
      } else {
        challengeResolved = { id: ch, win: false };
      }
    }

    // Exhibition evaluation — same shape as challenges, separate currency.
    // Runs before state reset so the check() sees the finished run.
    const ex = activeExhibition();
    let exhibitionResolved = null;
    if (ex) {
      const outcome = evaluateExhibition();
      exhibitionResolved = { id: ex, win: outcome === 'won' };
      if (!state.meta.exhibitions) state.meta.exhibitions = { active: null, completed: {}, failed: {}, pool: [] };
      if (exhibitionResolved.win) {
        state.meta.legacyMarks = (state.meta.legacyMarks || 0) + 1;
        state.meta.exhibitions.completed[ex] = (state.meta.exhibitions.completed[ex] || 0) + 1;
      } else {
        state.meta.exhibitions.failed[ex] = (state.meta.exhibitions.failed[ex] || 0) + 1;
      }
      state.meta.exhibitions.active = null;
    }

    const gained = schematicsForPrestige();
    state.meta.schematics += gained;
    state.meta.totalSchematics = (state.meta.totalSchematics || 0) + gained;
    state.meta.lifetimeSchematics = (state.meta.lifetimeSchematics || 0) + gained;
    state.meta.prestigeCount += 1;
    state.meta.lifetimePrestiges = (state.meta.lifetimePrestiges || 0) + 1;
    // v0.9.10 — per-cycle bests (reset at publish) anchor exhibition goal
    // scaling. Updated AFTER the exhibition evaluation above so "beat 60% of
    // your best" is judged against the best at pick time, not against the
    // numbers this very run just posted.
    state.meta.bestRunOre = Math.max(state.meta.bestRunOre || 0, state.meta.totalProduced.ore || 0);
    state.meta.bestRunSchematics = Math.max(state.meta.bestRunSchematics || 0, gained);

    // ---- Challenge-achievement snapshots (computed pre-reset, persist across the wipe) ----
    const runSec = Math.max(1, Math.floor((Date.now() - (state.meta.currentRunStartAt || Date.now())) / 1000));
    if (!isFinite(state.meta.fastestPrestigeSec) || runSec < state.meta.fastestPrestigeSec) state.meta.fastestPrestigeSec = runSec;
    if ((state.meta.totalClicks || 0) === 0) state.meta.noClickPrestige = true;
    let researchOwnedCount = 0;
    for (const k in state.research.levels) if (k !== 'origin' && state.research.levels[k] > 0) researchOwnedCount++;
    if (researchOwnedCount === 0) state.meta.noResearchPrestige = true;
    let totalMachinesAtPrestige = 0;
    for (const id in state.machines) totalMachinesAtPrestige += state.machines[id] || 0;
    if (totalMachinesAtPrestige > 0 && totalMachinesAtPrestige < 10) state.meta.minMachinePrestige = true;

    // BLUEPRINT MEMORY: snapshot machine counts before reset
    const memorySnapshot = rm().blueprintMemory ? { ...state.machines } : null;

    // RESET run
    state.resources = emptyResources();
    state.machines = emptyMachines();
    state.supports = emptySupports();
    state.meta.totalProduced = emptyResources();
    state.meta.currentRunCores = 0;
    state.meta.currentRunStartAt = Date.now();
    state.meta.totalClicks = 0;
    state.meta.clickProgress = { ore: 0, ingot: 0, part: 0, circuit: 0, core: 0, prototype: 0 };
    state.meta.currentRunResearchBought = false;
    state.settings.autoBuy = {};

    applyStartupBonuses();

    // BLUEPRINT MEMORY: restore a pct of previous machine counts for free
    if (memorySnapshot) {
      const pct = rm().blueprintPct || 0.8;
      for (const id in memorySnapshot) {
        const restored = Math.floor((memorySnapshot[id] || 0) * pct);
        if (restored > 0) state.machines[id] = Math.max(state.machines[id] || 0, restored);
      }
    }

    state.meta.lastPrestigeAt = Date.now();
    invalidateRM();
    prevUnlockSig = '';
    audio.prestige();
    const prestigeBefore = (state.meta.lifetimeSchematics || 0) - gained;
    const prestigeAfter = state.meta.lifetimeSchematics || 0;
    // Firsts, milestones, and normal prestige all get the celebrate treatment.
    if (state.meta.prestigeCount === 1) {
      celebrate('prestige', {
        bannerKind: 'FIRST PRESTIGE',
        bannerMain: `+${fmt(gained)}`,
        bannerSub: 'Schematics earned · Research unlocked',
        particles: 100,
      });
      hint('post_first_prestige', '<b>TIP</b> — open the <b>RESEARCH</b> tab to spend Schematics on tier unlocks.');
    } else {
      celebrate('prestige', {
        bannerKind: 'PRESTIGE',
        bannerMain: `+${fmt(gained)}`,
        bannerSub: 'Schematics',
      });
    }
    const ms = checkMilestones(prestigeBefore, prestigeAfter, 'schematics');
    if (ms) {
      setTimeout(() => celebrate('milestone', ms), 1400);
    }
    // Finalise challenge resolution after the prestige celebration so banners
    // stack cleanly (prestige → then challenge result).
    if (challengeResolved) {
      setTimeout(() => {
        if (challengeResolved.win) completeChallenge(challengeResolved.id);
        else failChallenge(challengeResolved.id);
        save();
      }, ms ? 2800 : 1400);
    }
    // Exhibition resolution toast + celebrate on success. Stagger after any
    // challenge banner so all three don't collide on a big run. The first
    // Legacy Mark earned gets a louder banner than subsequent ones so the
    // player understands they've unlocked a new currency.
    if (exhibitionResolved) {
      const exMeta = EXHIBITIONS[exhibitionResolved.id];
      const isFirstMark = exhibitionResolved.win && !state.meta.firstLegacyMarkCelebrated;
      setTimeout(() => {
        if (exhibitionResolved.win) {
          if (isFirstMark) {
            state.meta.firstLegacyMarkCelebrated = true;
            celebrate('publish', {
              bannerKind: '◆ FIRST LEGACY MARK',
              bannerMain: 'ARCHIVE OPEN',
              bannerSub: `${exMeta ? exMeta.name : exhibitionResolved.id} · spend in the Exhibitions tab`,
              particles: 120,
            });
          } else {
            celebrate('publish', {
              bannerKind: '◆ EXHIBITION',
              bannerMain: `+1 LEGACY MARK`,
              bannerSub: exMeta ? exMeta.name : exhibitionResolved.id,
              particles: 50,
            });
          }
        } else {
          toast(`<b>⚠ EXHIBITION LOST</b> — ${exMeta ? exMeta.name : exhibitionResolved.id}. Try again.`, { duration: 4000 });
        }
      }, ms ? 3800 : 2400);
    }
    // Blueprint: clear last-run's active Blueprint, then (once the player has
    // ≥3 lifetime prestiges) roll 3 new options and queue the choice modal.
    // Challenges override Blueprints — if one is active, skip this.
    if (state.meta.blueprints) state.meta.blueprints.active = null;
    if (blueprintsUnlocked() && !activeChallenge()) {
      state.meta.blueprints.pool = rollBlueprintPool();
      // Stagger behind the prestige celebrate banner so the modal doesn't
      // collide with it. Milestones add extra delay.
      const delay = ms ? 3200 : 1800;
      setTimeout(() => {
        if (state.meta.blueprints.pool && state.meta.blueprints.pool.length) {
          showBlueprintChoiceModal();
        }
      }, delay);
    }
    maybeNudgeBackup();
    save();
    rebuildAll();
    renderBlueprintChip();
    setTab('tree');
  }

  // ---------- SAVE / LOAD ----------
  function save() {
    state.lastSaveAt = Date.now();
    let payload;
    try { payload = JSON.stringify(state); }
    catch (e) { console.error('[blueprint] save serialize failed', e); return; }
    try { localStorage.setItem(SAVE_KEY, payload); }
    catch (e) { console.error('[blueprint] save failed', e); return; }
    // Mirror the just-written payload to the backup slot at most once a
    // minute. Rationale: the primary slot takes every autosave (every 5 s,
    // plus pagehide / visibilitychange). Writing the backup on every save
    // doubles our localStorage write pressure for no benefit — a 60 s
    // rollback window is fine for an incremental. If a write fails (quota,
    // private-browsing eviction), we swallow silently rather than spam the
    // console: the backup is best-effort and the primary save is the
    // source of truth.
    const now = Date.now();
    if (now - runtime.lastBackupWriteAt >= SAVE_BACKUP_INTERVAL_MS) {
      try { localStorage.setItem(SAVE_BACKUP_KEY, payload); runtime.lastBackupWriteAt = now; }
      catch {}
    }
  }
  // Apply every version-to-version fixup, default-filling, and
  // shape-normalising pass needed to bring a parsed save into sync with the
  // current freshState() shape. Shared between load() (localStorage) and
  // importSave() (base64 paste) so both paths converge on identical state.
  function migrateState(parsed) {
    // migrate old Phase 4 research.owned → new levels
    if (parsed.research && parsed.research.owned && !parsed.research.levels) {
      console.log('[blueprint] migrating research to v0.6.0');
      parsed.research = { levels: { origin: 1 } };
    }

    // migrate pre-v0.7.0 saves: grant tier unlocks based on past production
    if (parsed.research && !parsed.research.tiersUnlocked) {
      console.log('[blueprint] granting tier unlocks from prior progress');
      parsed.research.tiersUnlocked = { 2: false, 3: false, 4: false, 5: false };
      const t = (parsed.meta && parsed.meta.totalProduced) || {};
      if ((t.ore     || 0) >= 50) parsed.research.tiersUnlocked[2] = true;
      if ((t.ingot   || 0) >= 30) parsed.research.tiersUnlocked[3] = true;
      if ((t.part    || 0) >= 25) parsed.research.tiersUnlocked[4] = true;
      if ((t.circuit || 0) >= 15) parsed.research.tiersUnlocked[5] = true;
    }

    const s = Object.assign(freshState(), parsed);
    s.resources = Object.assign(emptyResources(), s.resources || {});
    s.machines  = Object.assign(emptyMachines(),  s.machines  || {});
    s.supports  = Object.assign(emptySupports(),  s.supports  || {});
    s.research  = Object.assign(freshResearch(),  s.research  || {});
    s.research.levels = Object.assign({ origin: 1 }, s.research.levels || {});
    if (!s.research.levels.origin) s.research.levels.origin = 1;
    s.research.tiersUnlocked = Object.assign({ 2: false, 3: false, 4: false, 5: false, 6: false }, s.research.tiersUnlocked || {});
    s.research.patentLevels = s.research.patentLevels || {};
    s.settings = Object.assign(freshState().settings, s.settings || {});
    s.settings.autoBuy = s.settings.autoBuy || {};
    s.settings.hintsShown = s.settings.hintsShown || {};
    s.settings.autoPrestige = s.settings.autoPrestige || { enabled: false, threshold: 10 };
    s.settings.autoPublish  = s.settings.autoPublish  || { enabled: false, threshold: 10 };
    if (s.settings.tipsMuted == null) s.settings.tipsMuted = false;
    if (s.settings.achievementsExpanded == null) s.settings.achievementsExpanded = false;
    if (s.settings.haptics == null) s.settings.haptics = true;
    if (s.settings.reduceMotion === undefined) s.settings.reduceMotion = null;
    if (s.settings.colorblindMode == null) s.settings.colorblindMode = false;
    // v0.9.10 — clamp guards against hand-edited saves; out-of-range scales
    // break layout badly enough to soft-lock the settings button.
    s.settings.fontScale = Math.min(1.5, Math.max(1, Number(s.settings.fontScale) || 1));
    s.settings.autoMine = Object.assign({ ore: true, ingot: false, part: false, circuit: false, core: false, prototype: false }, s.settings.autoMine || {});
    s.meta.achievements = s.meta.achievements || {};
    s.meta.newAchievements = s.meta.newAchievements || {};
    if (s.meta.goldenTicksSeen == null) s.meta.goldenTicksSeen = 0;
    s.meta.clickProgress = Object.assign({ ore: 0, ingot: 0, part: 0, circuit: 0, core: 0, prototype: 0 }, s.meta.clickProgress || {});
    s.meta.onboarding = Object.assign({ step: 0, done: false }, s.meta.onboarding || {});
    if (!s.meta.onboarding.done) {
      const alreadyPlayed = (s.meta.prestigeCount || 0) > 0
        || (s.meta.publishCount || 0) > 0
        || (s.meta.lifetimeSchematics || 0) > 0;
      if (alreadyPlayed) s.meta.onboarding.done = true;
    }
    s.meta.history = Array.isArray(s.meta.history) ? s.meta.history : [];
    if (s.meta.lifetimeClicks == null) s.meta.lifetimeClicks = s.meta.totalClicks || 0;
    if (s.meta.flashesSeen == null) s.meta.flashesSeen = 0;
    if (s.meta.peakMachines == null) s.meta.peakMachines = 0;
    if (s.meta.fastestPrestigeSec == null) s.meta.fastestPrestigeSec = Infinity;
    if (!isFinite(s.meta.fastestPrestigeSec)) s.meta.fastestPrestigeSec = Infinity;
    if (s.meta.noClickPrestige == null) s.meta.noClickPrestige = false;
    if (s.meta.noResearchPrestige == null) s.meta.noResearchPrestige = false;
    if (s.meta.minMachinePrestige == null) s.meta.minMachinePrestige = false;
    if (s.meta.noSupportPublish == null) s.meta.noSupportPublish = false;
    if (s.meta.longRunAchieved == null) s.meta.longRunAchieved = false;
    s.meta.challenge = Object.assign({ active: null, startedAt: 0, completed: {}, goal: 0 }, s.meta.challenge || {});
    if (s.meta.currentRunResearchBought == null) s.meta.currentRunResearchBought = false;
    if (s.meta.firstPrototypeCelebrated == null) {
      const lp = (s.meta.lifetimeProduced && s.meta.lifetimeProduced.prototype) || 0;
      s.meta.firstPrototypeCelebrated = lp >= 1;
    }
    s.meta.blueprints = Object.assign(
      { active: null, pool: [], timesUsed: {}, seen: {} },
      s.meta.blueprints || {}
    );
    // v0.8.0 — Exhibitions / Archive defaults for saves from before the endgame shipped.
    if (s.meta.legacyMarks == null) s.meta.legacyMarks = 0;
    s.meta.legacyUpgrades = s.meta.legacyUpgrades || {};
    s.meta.exhibitions = Object.assign(
      { active: null, completed: {}, failed: {}, pool: [], activeTargets: {} },
      s.meta.exhibitions || {}
    );
    if (s.meta.firstLegacyMarkCelebrated == null) s.meta.firstLegacyMarkCelebrated = false;
    if (s.meta.archiveCompleteCelebrated == null) s.meta.archiveCompleteCelebrated = false;
    s.meta = Object.assign(freshState().meta, s.meta || {});
    // v0.9.8 — retroactive welcome schematic for players who loaded an
    // older save but have never prestiged / published / earned a schematic.
    // Gives them the same "research tree is usable immediately" experience
    // that brand-new games get. Doesn't touch anyone who has ever earned a
    // schematic — all four conditions must be true for the grant to apply.
    if ((s.meta.lifetimePrestiges || 0) === 0
        && (s.meta.publishCount || 0) === 0
        && (s.meta.totalSchematics || 0) === 0
        && (s.meta.schematics || 0) === 0) {
      s.meta.schematics = 1;
    }
    s.meta.totalProduced = Object.assign(emptyResources(), s.meta.totalProduced || {});
    s.meta.lifetimeProduced = Object.assign(emptyResources(), s.meta.lifetimeProduced || {});
    for (const r in s.meta.lifetimeProduced) {
      if (s.meta.lifetimeProduced[r] === 0 && s.meta.totalProduced[r] > 0) {
        s.meta.lifetimeProduced[r] = s.meta.totalProduced[r];
      }
    }
    return s;
  }

  function load() {
    // Try the primary slot first, then the rolling backup slot written by
    // save() every ~60 s. If the primary is unreadable (partial write /
    // corrupted JSON / quota error during setItem / an older tab's truncated
    // payload) we recover from backup rather than resetting the player to
    // freshState(). The toast that tells the player this happened is raised
    // in boot() once the toast system is live.
    const slots = [];
    const primary = localStorage.getItem(SAVE_KEY);
    const backup  = localStorage.getItem(SAVE_BACKUP_KEY);
    if (primary) slots.push(['primary', primary]);
    if (backup)  slots.push(['backup',  backup]);
    if (slots.length === 0) return false;
    for (let i = 0; i < slots.length; i++) {
      const [slot, raw] = slots[i];
      try {
        const parsed = JSON.parse(raw);
        state = migrateState(parsed);
        invalidateRM();
        if (slot === 'backup') {
          console.warn('[blueprint] primary save unreadable, recovered from backup slot');
          runtime.saveRecoveredFromBackup = true;
        }
        return true;
      } catch (e) {
        console.error('[blueprint] load from ' + slot + ' slot failed', e);
      }
    }
    return false;
  }
  function exportSave() { return btoa(unescape(encodeURIComponent(JSON.stringify(state)))); }
  function importSave(b64) {
    try {
      const parsed = JSON.parse(decodeURIComponent(escape(atob(b64.trim()))));
      // Run the same migration pipeline as load() so a v0.6 export imported
      // into v0.9 picks up every new field / default just like a reload would.
      state = migrateState(parsed);
      invalidateRM();
      save(); return true;
    } catch { return false; }
  }
  function wipe() {
    // Clear both the primary and the rolling backup slot — otherwise a
    // wipe would leave the backup around and the next load() would
    // "recover" the old state the player just asked us to throw away.
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(SAVE_BACKUP_KEY);
    runtime.lastBackupWriteAt = 0;
    state = freshState();
    sessionStartAt = Date.now();
    prevUnlockSig = '';
    invalidateRM();
    rebuildAll();
  }
  function applyOffline(maxCatchupMs) {
    const now = Date.now();
    // Default cap = offline limit + patent / legacy bonuses. Callers can
    // pass a tighter cap if they've already applied some ticks (e.g. the
    // sim-worker consumed part of the background budget already).
    const defaultCapMs = OFFLINE_CAP_MS + (rm().offlineHoursAdd || 0) * 3600 * 1000;
    const capMs = Math.min(typeof maxCatchupMs === 'number' ? maxCatchupMs : defaultCapMs, defaultCapMs);
    const elapsed = Math.min(now - state.lastTickAt, capMs);
    let report = null;
    if (elapsed > 1000) {
      const before = { ...state.resources };
      tick(elapsed / 1000);
      const earned = {};
      for (const res in state.resources) {
        const diff = state.resources[res] - (before[res] || 0);
        if (diff > 0.01) earned[res] = diff;
      }
      report = { elapsed, earned };
    }
    state.lastTickAt = now;
    return report;
  }

  // ========== DOM ==========
  const resBarEl    = document.getElementById('res-bar');
  const factoryEl   = document.getElementById('factory');
  const sidebarEl   = document.getElementById('sidebar');
  const factoryViewEl = document.getElementById('view-factory');
  const treeTip     = document.getElementById('tree-tip');
  const rpValueEl   = document.getElementById('rp-value');
  const rpRateEl    = document.getElementById('rp-rate');
  const prestigeCountEl = document.getElementById('prestige-count');
  const treePrestigeEl = document.getElementById('tree-prestige');
  const treePrestigeGainEl = document.getElementById('tree-prestige-gain');
  const treePrestigeBtn = document.getElementById('tree-prestige-btn');
  const treeTabBadgeEl = document.getElementById('tree-tab-badge');
  const tabTreeEl    = document.getElementById('tab-tree');
  const tabStatsEl   = document.getElementById('tab-stats');
  const tabMasteryEl = document.getElementById('tab-mastery');
  const tabExhibitionsEl = document.getElementById('tab-exhibitions');
  const exhTabBadgeEl = document.getElementById('exh-tab-badge');
  const masteryBodyEl = document.getElementById('mastery-body');
  const exhibitionsBodyEl = document.getElementById('exhibitions-body');
  const achievementsBodyEl = document.getElementById('achievements-body');
  const toastStackEl = document.getElementById('toast-stack');
  const statsBodyEl = document.getElementById('stats-body');
  // Runtime touch tracking. Static matchMedia('(hover: none)') lies on hybrid devices
  // and under DevTools emulation — so instead we watch for real touchstart events and
  // suppress the synthetic mouseenter that fires right after a tap.
  let lastTouchTime = 0;
  document.addEventListener('touchstart', () => {
    lastTouchTime = Date.now();
  }, { passive: true, capture: true });
  function isSyntheticMouseFromTouch() {
    return Date.now() - lastTouchTime < 700;
  }
  const dom = { tiers: {}, mineCard: null, side: {}, railNodes: {}, railProgress: {}, railBackboneFills: {}, railRails: {}, tierRailNodes: {} };

  // ---------- TABS ----------
  function setTab(name) {
    const wasTab = state.meta.currentTab;
    state.meta.currentTab = name;
    // Expose active tab on <body> so CSS can pause animations outside it.
    document.body.dataset.tab = name;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === name));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    if (name === 'stats') renderStats();
    if (name === 'mastery') renderMastery();
    if (name === 'exhibitions') renderExhibitions();
    if (name === 'achievements') { prevAchSig = ''; renderAchievementsSection(); }
    // Subtle whoosh on actual tab changes (not initial render)
    if (wasTab && wasTab !== name) audio.tab();
  }
  function bindTabs() {
    document.querySelectorAll('.tab').forEach(t => {
      t.addEventListener('click', () => setTab(t.dataset.tab));
    });
  }

  // ---------- RES BAR ----------
  function buildResBar() {
    resBarEl.innerHTML = '';
    TIERS.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'res clickable'; row.dataset.res = t.resource;
      row.title = `Click to mine ${t.resource}`;
      row.innerHTML = `
        <button class="res-auto-btn" data-auto-btn title="Toggle auto-mine" aria-label="Auto-mine">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M 1.5 4 Q 8 1.5 14.5 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            <line x1="8" y1="2.7" x2="8" y2="14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
        </button>
        <div class="body">
          <div class="l">${t.resource.toUpperCase()}</div>
          <div class="v" data-v>0</div>
          <div class="rates">
            <span class="rate prod" data-prod></span>
            <span class="rate cons" data-cons></span>
          </div>
        </div>
      `;
      row.addEventListener('click', (e) => {
        // Ignore clicks originating on the auto-mine button
        if (e.target.closest('[data-auto-btn]')) return;
        if (!resourceVisible(t.resource)) return;
        clickResource(t.resource);
        row.classList.remove('res-pulse');
        void row.offsetWidth;
        row.classList.add('res-pulse');
      });
      row.querySelector('[data-auto-btn]').addEventListener('click', (e) => {
        e.stopPropagation();
        if (!canAutoMine(t.resource)) return;
        state.settings.autoMine[t.resource] = !state.settings.autoMine[t.resource];
        (state.settings.autoMine[t.resource] ? audio.autoOn : audio.autoOff)();
      });
      resBarEl.appendChild(row);
    });
  }
  function renderResBar() {
    resBarEl.querySelectorAll('.res').forEach((el) => {
      const res = el.dataset.res;
      if (!resourceVisible(res)) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      el.querySelector('[data-v]').textContent = fmt(state.resources[res] || 0);
      // auto-mine pickaxe button visibility + state
      const autoBtn = el.querySelector('[data-auto-btn]');
      if (autoBtn) {
        const canAuto = canAutoMine(res);
        autoBtn.style.display = canAuto ? '' : 'none';
        autoBtn.classList.toggle('on', canAuto && !!state.settings.autoMine[res]);
      }

      const prod = runtime.prodRate[res] || 0;
      const cons = runtime.consRate[res] || 0;
      const pEl = el.querySelector('[data-prod]');
      const cEl = el.querySelector('[data-cons]');

      if (prod < 0.05 && cons < 0.05) {
        pEl.textContent = '—';
        pEl.classList.add('zero');
        cEl.textContent = '';
        cEl.style.display = 'none';
      } else {
        pEl.classList.remove('zero');
        pEl.textContent = prod >= 0.05 ? '▲ ' + fmt(prod) + '/s' : '';
        pEl.style.display = prod >= 0.05 ? '' : 'none';
        cEl.textContent = cons >= 0.05 ? '▼ ' + fmt(cons) + '/s' : '';
        cEl.style.display = cons >= 0.05 ? '' : 'none';
      }
    });
  }

  // ---------- FACTORY ----------
  // Drafting corner ticks — reused on tier rows and the mine block so each
  // section reads as its own labelled schematic card.
  function addCornerTicks(el) {
    ['tl','tr','bl','br'].forEach(pos => {
      const c = document.createElement('div');
      c.className = `sheet-corner sheet-corner-${pos}`;
      c.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18"><line x1="0" y1="0" x2="12" y2="0"/><line x1="0" y1="0" x2="0" y2="12"/></svg>';
      el.appendChild(c);
    });
  }

  function buildFactory() {
    factoryEl.innerHTML = '';
    dom.tiers = {};

    // BUY MODE BAR — FIRST child of factoryEl, OUTSIDE the scroll wrapper. Stays pinned at top.
    const buyBar = document.createElement('div');
    buyBar.className = 'buy-mode-bar';
    buyBar.innerHTML = `
      <div class="label">◆ BUY MODE</div>
      <div class="bm-btns">
        <button class="bm-btn" data-mode="1">×1</button>
        <button class="bm-btn" data-mode="10">×10</button>
        <button class="bm-btn" data-mode="100">×100</button>
        <button class="bm-btn" data-mode="1000">×1000</button>
        <button class="bm-btn" data-mode="max">MAX</button>
      </div>
      <div class="bm-hint" data-bm-hint></div>
    `;
    factoryEl.appendChild(buyBar);
    dom.buyBar = buyBar;
    buyBar.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('locked')) return;
        state.settings.buyMode = btn.dataset.mode;
      });
    });

    // Scroll wrapper — mine-card, tier rows, achievements all go here
    const scrollEl = document.createElement('div');
    scrollEl.className = 'factory-scroll';
    factoryEl.appendChild(scrollEl);
    dom.factoryScroll = scrollEl;

    // Mine block — wraps the mine-card as a "source" schematic panel with a
    // labelled callout + drafting corners, so the page opens like an engineering sheet.
    const mineBlock = document.createElement('div');
    mineBlock.className = 'mine-block';
    scrollEl.appendChild(mineBlock);
    addCornerTicks(mineBlock);

    const sourceLabel = document.createElement('div');
    sourceLabel.className = 'source-label';
    sourceLabel.innerHTML = `
      <span class="sl-pip">◆ SOURCE</span>
      <span class="sl-rule"></span>
      <span class="sl-tag">MANUAL EXTRACTION</span>
    `;
    mineBlock.appendChild(sourceLabel);

    // Mine bar — one big clickable button per unlocked resource.
    // Populated/updated by renderMineBar() on each frame.
    const mineCard = document.createElement('div');
    mineCard.className = 'mine-card';
    mineBlock.appendChild(mineCard);
    dom.mineCard = mineCard;
    prevMineSig = ''; // force renderMineBar to repopulate the fresh empty container

    TIERS.forEach((tier, tierIdx) => {
      const unlocked = tierUnlocked(tier.id);
      const row = document.createElement('div');
      row.className = 'tier' + (unlocked ? '' : ' locked');
      row.dataset.tier = tier.id;

      const appendFlowAfter = () => {
        if (tierIdx < TIERS.length - 1) {
          const flow = document.createElement('div');
          flow.className = 'tier-flow';
          flow.innerHTML = `<span class="tf-label">↓ ${tier.resource}</span>`;
          scrollEl.appendChild(flow);
        }
      };

      if (!unlocked) {
        const canBuy = canBuyTierUnlock(tier.id);
        const avail = tierUnlockAvailable(tier.id);
        const cost = tierUnlockCost(tier.id);
        const firstRun = state.meta.prestigeCount === 0 && state.meta.schematics === 0;
        let hint;
        if (!avail) {
          hint = `◆ LOCKED · UNLOCK T${tier.id - 1} FIRST`;
        } else if (firstRun) {
          hint = `◆ LOCKED · MINE ORE, THEN ◆ PRESTIGE TO EARN SCHEMATICS`;
        } else if (canBuy) {
          hint = `◆ UNLOCK FOR ${cost} SCHEMATIC${cost > 1 ? 'S' : ''} · OPEN RESEARCH TAB ▲`;
        } else {
          hint = `◆ LOCKED · ${cost} SCHEMATIC${cost > 1 ? 'S' : ''} NEEDED · HAVE ${fmt(state.meta.schematics)} · PRESTIGE FOR MORE`;
        }
        row.innerHTML = `
          <div class="tier-head">
            <span class="tier-pip locked">T${tier.id}</span>
            <b>${tier.name}</b>
            <span class="tier-rule"></span>
            <div class="unlock-hint">${hint}</div>
          </div>
        `;
        scrollEl.appendChild(row);
        addCornerTicks(row);
        dom.tiers[tier.id] = row;
        appendFlowAfter();
        return;
      }

      row.innerHTML = `
        <div class="tier-head">
          <span class="tier-pip">T${tier.id}</span>
          <b>${tier.name}</b>
          <span class="tier-rule"></span>
          <div class="rate" data-rate>+0 ${tier.resource}/s</div>
        </div>
        <div class="slots"></div>
      `;
      const slotsEl = row.querySelector('.slots');

      for (let i = 1; i <= 5; i++) {
        const entry = Object.entries(MACHINES).find(([, m]) => m.tier === tier.id && m.slot === i);
        if (!entry) {
          const s = document.createElement('div');
          s.className = 'slot locked';
          s.innerHTML = `<div class="name">—</div>`;
          slotsEl.appendChild(s);
          continue;
        }
        const [id, m] = entry;
        const slot = document.createElement('button');
        slot.className = 'slot'; slot.dataset.machine = id;
        slot.innerHTML = `
          <span class="count" data-count>×0</span>
          <span class="bottleneck" data-bn title="">◇</span>
          <span class="auto-buy" data-auto>●AUTO</span>
          <button class="auto-chip" data-auto-chip title="Toggle auto-buy" aria-label="Toggle auto-buy">A</button>
          <div class="ico">${m.icon}</div>
          <div class="name">${m.name}</div>
          <div class="cost" data-cost></div>
        `;
        slot.addEventListener('click', (e) => {
          if (slot.__suppressNextClick) { slot.__suppressNextClick = false; return; }
          if (!machineUnlocked(id)) return;
          // Once the user has clicked the slot, suppress the hover-info toast
          // for this hover session — they know what the machine is. The toast
          // feels cheap during spam-clicks of an unaffordable machine.
          if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
          hoverSuppressed = true;
          const r = rm();
          // Modifiers override current buy-mode (quick one-off)
          let count = null;
          if (r.bulkBuy) {
            if (r.maxBuy && e.shiftKey && e.ctrlKey) count = 1000;
            else if (e.shiftKey && e.altKey) count = 100;
            else if (e.shiftKey) count = 10;
          }
          if (count === null) count = buyModeCount(state.settings.buyMode || '1', r);
          const bought = (count === 'max') ? buyMax(id) : buyMultiple(id, count);
          if (bought > 0) { pulse(slot); haptic(12); }
        });
        slot.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (!rm().autoBuy || !machineUnlocked(id)) return;
          state.settings.autoBuy[id] = !state.settings.autoBuy[id];
          (state.settings.autoBuy[id] ? audio.autoOn : audio.autoOff)();
        });
        const autoChip = slot.querySelector('[data-auto-chip]');
        if (autoChip) {
          autoChip.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!rm().autoBuy || !machineUnlocked(id)) return;
            state.settings.autoBuy[id] = !state.settings.autoBuy[id];
            (state.settings.autoBuy[id] ? audio.autoOn : audio.autoOff)();
          });
        }
        // Hover on desktop with a 500ms dwell before showing an info toast — so
        // flitting the mouse across rows doesn't spam the stack. Only one toast
        // per hover window; we track it so we can cancel if the user leaves early.
        // hoverSuppressed flips on click and resets on mouseleave, so spam-clicks
        // of an unaffordable slot don't get interrupted by the info toast.
        let hoverTimer = null;
        let hoverSuppressed = false;
        slot.addEventListener('mouseenter', () => {
          if (isSyntheticMouseFromTouch()) return;
          if (hoverSuppressed) return;
          hoverTimer = setTimeout(() => {
            hoverTimer = null;
            showToast(machineInfoHtml(id), { silent: true });
          }, 500);
        });
        slot.addEventListener('mouseleave', () => {
          if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
          hoverSuppressed = false;
        });

        // Long-press on touch pops the same toast. Wired unconditionally —
        // touch events just never fire on mouse-only machines.
        let pressTimer = null, longPressed = false, pressX = 0, pressY = 0;
        slot.addEventListener('touchstart', (e) => {
          const t = e.touches && e.touches[0];
          if (!t) return;
          pressX = t.clientX; pressY = t.clientY;
          longPressed = false;
          pressTimer = setTimeout(() => {
            longPressed = true;
            pressTimer = null;
            showToast(machineInfoHtml(id), { silent: true });
            haptic(20);
          }, 450);
        }, { passive: true });
        slot.addEventListener('touchmove', (e) => {
          const t = e.touches && e.touches[0];
          if (!t || !pressTimer) return;
          if (Math.hypot(t.clientX - pressX, t.clientY - pressY) > 10) {
            clearTimeout(pressTimer); pressTimer = null;
          }
        }, { passive: true });
        slot.addEventListener('touchend', (e) => {
          if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
          if (longPressed) {
            // Suppress the synthetic click that would otherwise buy after a long-press.
            e.preventDefault && e.preventDefault();
            slot.__suppressNextClick = true;
          }
        });
        slot.addEventListener('touchcancel', () => {
          if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        }, { passive: true });
        slotsEl.appendChild(slot);
      }

      scrollEl.appendChild(row);
      addCornerTicks(row);
      dom.tiers[tier.id] = row;
      appendFlowAfter();
    });

    // Achievements now live on their own tab — no inline section in the factory view.
  }

  // ACHIEVEMENTS VIEW — rendered into #achievements-body, wired once at startup.
  function buildAchievementsView() {
    if (!achievementsBodyEl || dom.achBody) return; // already wired
    achievementsBodyEl.innerHTML = `
      <div class="ach-page-header">
        <div class="ach-page-title">ACHIEVEMENTS</div>
        <div class="ach-page-stats">
          <span class="ach-page-progress" data-ach-progress>0 / 0</span>
          <span class="ach-page-new" data-ach-new-badge style="display:none">!</span>
        </div>
      </div>
      <div class="ach-page-body" data-ach-body></div>
    `;
    dom.achProgress  = achievementsBodyEl.querySelector('[data-ach-progress]');
    dom.achNewBadge  = achievementsBodyEl.querySelector('[data-ach-new-badge]');
    dom.achBody      = achievementsBodyEl.querySelector('[data-ach-body]');
    dom.achTabBadge  = document.getElementById('ach-tab-badge');
    // Event delegation — dismiss any earned+new card on tap. Survives inner innerHTML rebuilds.
    dom.achBody.addEventListener('click', (e) => {
      const card = e.target.closest('.ach.earned.new');
      if (!card || !card.dataset.achId) return;
      dismissAchievement(card.dataset.achId);
      audio.achievementDismiss();
      prevAchSig = '';
      renderAchievementsSection();
    });
    prevAchSig = '';
  }
  function pulse(el) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
  // Haptic feedback — no-op on non-touch devices. Honors state.settings.haptics.
  function haptic(ms) {
    if (!navigator.vibrate) return;
    if (state.settings && state.settings.haptics === false) return;
    // Android haptic motors have a 10–15 ms startup latency, so anything under
    // ~20 ms typically fires without being felt. Floor every call at 20 ms so
    // every haptic event actually actuates the motor.
    const dur = Array.isArray(ms) ? ms : Math.max(ms | 0, 20);
    try { navigator.vibrate(dur); } catch (e) { /* ignore */ }
  }

  // ---------- MINE BAR (per-resource manual click buttons) ----------
  const MINE_ICON_KEY = { ore: 'drill', ingot: 'furnace', part: 'press', circuit: 'assembler', core: 'forge', prototype: 'compiler' };
  const MINE_LABEL = {
    ore:       'MINE ORE',
    ingot:     'SMELT INGOT',
    part:      'CRAFT PART',
    circuit:   'ASSEMBLE CIRCUIT',
    core:      'FORGE CORE',
    prototype: 'REFINE PROTOTYPE',
  };
  let prevMineSig = '';
  function renderMineBar() {
    if (!dom.mineCard) return;
    const visible = Object.keys(CLICK_RECIPE).filter(resourceVisible);
    const sig = visible.join(',');
    if (sig !== prevMineSig) {
      prevMineSig = sig;
      dom.mineCard.innerHTML = '';
      for (const res of visible) {
        const recipe = CLICK_RECIPE[res];
        const btn = document.createElement('button');
        btn.className = 'mine-btn';
        btn.dataset.mineRes = res;
        // Only show progress bar for multi-click recipes (goal > 1)
        const progHtml = recipe.goal > 1 ? `
          <div class="mine-progress">
            <div class="mine-progress-bar"><div class="mine-progress-fill" data-mine-fill></div></div>
            <div class="mine-progress-text" data-mine-prog>…</div>
          </div>
        ` : '';
        btn.innerHTML = `
          <span class="mine-auto-badge">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M 1.5 4 Q 8 1.5 14.5 4" />
              <line x1="8" y1="2.7" x2="8" y2="14" />
            </svg>
            AUTO
          </span>
          <div class="mine-ico">${ICONS[MINE_ICON_KEY[res]]}</div>
          <div class="mine-label">
            <div class="n">${MINE_LABEL[res]}</div>
            <div class="d" data-mine-desc>…</div>
            ${progHtml}
          </div>
        `;
        btn.addEventListener('click', () => {
          if (clickResource(res)) { pulse(btn); haptic(6); }
        });
        dom.mineCard.appendChild(btn);
      }
    }
    // live update — reflects click research bonuses + current progress + affordability
    const r = rm();
    const baseMul = (1 + r.clickAdd) * (1 + (r.clickMul || 0));
    dom.mineCard.querySelectorAll('.mine-btn').forEach(btn => {
      const res = btn.dataset.mineRes;
      const recipe = CLICK_RECIPE[res];
      const inRes = recipe.inRes;
      const inputCost = recipe.inputCost || 0;
      const goal = recipe.goal;
      const progress = (state.meta.clickProgress && state.meta.clickProgress[res]) || 0;

      // Description line — short cost/yield hint. Details live in the progress bar + tooltips.
      const descEl = btn.querySelector('[data-mine-desc]');
      if (descEl) {
        if (goal === 1) {
          descEl.textContent = `+${fmt(baseMul)}/CLICK`;
        } else {
          descEl.textContent = `-${inputCost} ${inRes.toUpperCase()}`;
          const progEl = btn.querySelector('[data-mine-prog]');
          if (progEl) progEl.textContent = `${fmt(progress)} / ${goal}`;
        }
      }
      // Progress bar fill
      const fillEl = btn.querySelector('[data-mine-fill]');
      if (fillEl && goal > 1) {
        fillEl.style.width = Math.min(100, (progress / goal) * 100) + '%';
      }

      // Affordability: can we produce the NEXT unit? Needs enough input for at least one.
      const canAfford = !inRes || (state.resources[inRes] || 0) >= inputCost;
      btn.classList.toggle('unaffordable', !canAfford);
      btn.classList.toggle('auto-on', isAutoMining(res));
    });
  }

  let prevAchSig = '';
  function renderAchievementsSection() {
    if (!dom.achBody) return;
    const achMap = state.meta.achievements || {};
    const newMap = state.meta.newAchievements || {};
    let earned = 0, total = 0;
    for (const id in ACHIEVEMENTS) { total++; if (achMap[id]) earned++; }

    // Header + tab badge updates — cheap, always run
    if (dom.achProgress) dom.achProgress.textContent = `${earned} / ${total}`;
    const newCount = Object.keys(newMap).length;
    if (dom.achNewBadge) {
      dom.achNewBadge.style.display = newCount > 0 ? '' : 'none';
      dom.achNewBadge.textContent = newCount > 1 ? `! ${newCount}` : '!';
    }
    if (dom.achTabBadge) {
      dom.achTabBadge.style.display = newCount > 0 ? '' : 'none';
      dom.achTabBadge.textContent = newCount > 1 ? newCount : '!';
    }

    // Throttle innerHTML rebuild — only when earned set or new set changes.
    // (Rebuilding every frame kills click handlers between mousedown and mouseup.)
    const sig = 'e' + Object.keys(achMap).sort().join(',') + '|n' + Object.keys(newMap).sort().join(',');
    if (sig === prevAchSig) return;
    prevAchSig = sig;

    const groups = { progress: [], meta: [], scale: [], special: [], challenge: [] };
    for (const id in ACHIEVEMENTS) {
      const a = ACHIEVEMENTS[id];
      (groups[a.group || 'special'] || (groups[a.group] = [])).push({ id, ...a });
    }
    const groupOrder = ['progress', 'meta', 'scale', 'special', 'challenge'];
    const groupLabels = { progress: 'PROGRESS', meta: 'PRESTIGE & PUBLISH', scale: 'SCALE', special: 'SPECIAL', challenge: 'CHALLENGE' };
    dom.achBody.innerHTML = groupOrder.map(g => `
      <div class="ach-group" data-ach-group="${g}">
        <div class="ach-group-label">${groupLabels[g]}</div>
        <div class="ach-grid">
          ${groups[g].map(a => {
            const e = !!achMap[a.id];
            const isNew = !!newMap[a.id];
            const bonus = ACHIEVEMENT_BONUSES[a.id];
            const bonusLabel = bonus ? bonus.label : '';
            const pr = achieveProgress(a.id);
            // Progress bar on EVERY card for visual consistency. Earned cards show full bars.
            const cur = e ? pr.goal : pr.current;
            const pct = e ? 100 : Math.min(100, (pr.current / pr.goal) * 100);
            const progBar = `
              <div class="ach-progress-wrap">
                <div class="ach-progress-bar"><div class="ach-progress-fill" data-ach-fill style="width:${pct}%"></div></div>
                <div class="ach-progress-text" data-ach-text>${fmt(cur)} / ${fmt(pr.goal)}</div>
              </div>
            `;
            return `
              <div class="ach ${e ? 'earned' : 'locked'}${isNew ? ' new' : ''}" data-ach-id="${a.id}">
                ${isNew ? '<span class="ach-new-dot" title="Click anywhere on this card to dismiss">!</span>' : ''}
                <div class="ach-name">${e ? '◆' : '◇'} ${a.name}</div>
                <div class="ach-desc">${a.desc}</div>
                ${progBar}
                ${bonusLabel ? `<div class="ach-bonus ${e ? 'active' : ''}">${bonusLabel}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `).join('');
    dom.achBody.querySelectorAll('.ach-group').forEach(addCornerTicks);
    // Click handler is delegated from dom.achBody itself (see buildFactory) — survives rebuilds.
  }

  // Cheap per-frame update for achievement progress bars (no DOM rebuild).
  function updateAchievementProgress() {
    if (!dom.achBody) return;
    const achMap = state.meta.achievements || {};
    dom.achBody.querySelectorAll('.ach[data-ach-id]').forEach(card => {
      const fillEl = card.querySelector('[data-ach-fill]');
      if (!fillEl) return;
      const id = card.dataset.achId;
      const pr = achieveProgress(id);
      const earned = !!achMap[id];
      const cur = earned ? pr.goal : pr.current;
      const pct = earned ? 100 : Math.min(100, (pr.current / pr.goal) * 100);
      fillEl.style.width = pct + '%';
      const textEl = card.querySelector('[data-ach-text]');
      if (textEl) textEl.textContent = `${fmt(cur)} / ${fmt(pr.goal)}`;
    });
  }

  // ---------- SIDEBAR ----------
  function buildSidebar() {
    sidebarEl.innerHTML = '';
    dom.side = {};

    // STATUS and PRESTIGE lived here previously; they've moved to the RESEARCH tab
    // (tab badge + header prestige button) and the STATS tab (run-time/playtime/etc.),
    // which keeps the factory view focused on building the factory.

    // PUBLISH box (shown when prototypes exist or have published)
    const publishBox = document.createElement('div');
    publishBox.className = 'side-box publish';
    publishBox.innerHTML = `
      <h3>⧉⧉ PUBLISH</h3>
      <div class="big">+<span data-publish-gain>0</span> <span class="unit">patents</span></div>
      <div class="row"><span>PROTOTYPES · RUN</span><b data-run-protos>0</b></div>
      <button class="publish-link-btn" data-publish-link>◆ OPEN MASTERY</button>
    `;
    sidebarEl.appendChild(publishBox);
    addCornerTicks(publishBox);
    dom.side.publishBox = publishBox;
    dom.side.publishGain = publishBox.querySelector('[data-publish-gain]');
    dom.side.publishRunProtos = publishBox.querySelector('[data-run-protos]');
    publishBox.querySelector('[data-publish-link]').addEventListener('click', () => setTab('mastery'));

    // SUPPORT
    const supportBox = document.createElement('div');
    supportBox.className = 'side-box';
    supportBox.innerHTML = `
      <h3>SUPPORT · GLOBAL</h3>
      <div class="support-grid" data-support-grid></div>
      <div class="support-desc" data-support-hint></div>
    `;
    sidebarEl.appendChild(supportBox);
    addCornerTicks(supportBox);
    dom.side.supportBox  = supportBox;
    dom.side.supportGrid = supportBox.querySelector('[data-support-grid]');
    dom.side.supportHint = supportBox.querySelector('[data-support-hint]');
    for (const id in SUPPORTS) {
      const s = SUPPORTS[id];
      const btn = document.createElement('button');
      btn.className = 'support-btn'; btn.dataset.support = id;
      btn.innerHTML = `
        <div class="s-name">${s.name}</div>
        <div class="s-count" data-count>×0</div>
        <div class="s-cost" data-cost></div>
      `;
      btn.addEventListener('click', () => {
        // v0.9.7 — supports honour the BUY MODE bar (×1 / ×10 / ×100 / ×1000 / MAX)
        // the same way machine slots do. Player request: it's annoying to
        // click Power Node 30 times in a row late game.
        const r = rm();
        const mode = state.settings.buyMode || '1';
        const count = buyModeCount(mode, r);
        let bought;
        if (count === 'max')      bought = buySupportMax(id);
        else if (count > 1)       bought = buySupportMultiple(id, count);
        else                      bought = buySupport(id) ? 1 : 0;
        if (bought > 0) pulse(btn);
      });
      dom.side.supportGrid.appendChild(btn);
    }

    // Tips/hints now fire as toast popups instead of accumulating in a sidebar list.
  }
  function renderSidebar() {
    factoryViewEl.classList.toggle('has-sidebar', sidebarVisible());
    if (!sidebarVisible()) return;

    // PUBLISH visibility (any prototypes, or has published before)
    const proto = state.resources.prototype || 0;
    const showPublish = proto > 0 || (state.meta.publishCount || 0) > 0;
    dom.side.publishBox.style.display = showPublish ? '' : 'none';
    if (showPublish) {
      dom.side.publishGain.textContent = patentsForPublish();
      dom.side.publishRunProtos.textContent = fmt(proto);
    }

    const showSupportBox = anySupportUnlocked();
    dom.side.supportBox.style.display = showSupportBox ? '' : 'none';
    if (showSupportBox) {
      dom.side.supportGrid.querySelectorAll('[data-support]').forEach((btn) => {
        const id = btn.dataset.support;
        const s = SUPPORTS[id];
        const unlocked = supportUnlocked(id);
        const owned = state.supports[id] || 0;
        const cost = supportCost(id);
        const afford = canAfford(cost);
        btn.querySelector('[data-count]').textContent = '×' + owned;
        const costText = Object.entries(cost).map(([r, a]) => fmt(a) + ' ' + r).join(' · ');
        btn.querySelector('[data-cost]').textContent = unlocked ? costText : `T${s.unlockTier}+`;
        btn.classList.toggle('owned', owned > 0);
        btn.classList.toggle('unaffordable', unlocked && !afford);
        btn.classList.toggle('locked', !unlocked);
      });
      let hintHtml = '';
      for (const id in SUPPORTS) {
        if (supportUnlocked(id)) hintHtml += `<div><b>${SUPPORTS[id].name}:</b> ${SUPPORTS[id].desc}</div>`;
      }
      dom.side.supportHint.innerHTML = hintHtml;
    }
  }

  // ---------- TIER UNLOCKS BAR ----------
  // ---------- RESEARCH TREE (parallel rails) ----------
  // Each branch becomes a horizontal "assembly track" — 8 tier slots laid out
  // left→right, with a backbone line running through them and a progress
  // counter at the end. Read-at-a-glance layout that scales cleanly to mobile.
  const RAILS_TIERS = 10;
  const BRANCH_DISPLAY_ORDER = ['speed', 'logistics', 'yield', 'automation', 'efficiency', 'power'];

  function nodeState(id) {
    const lvl = nodeLevel(id);
    const max = nodeMax(id);
    if (lvl >= max) return 'owned';
    if (!nodePrereqsMet(id)) return 'locked';
    return 'available';
  }

  // Flash a rail node on successful purchase.
  function pulseNode(el) {
    if (!el) return;
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }

  // Two-click confirmation for research purchases — first tap arms, second confirms.
  let armedNode = null;
  let armedResetTimeout = null;
  const ARMED_WINDOW_MS = 3000;
  function armNode(id) {
    armedNode = id;
    if (armedResetTimeout) clearTimeout(armedResetTimeout);
    armedResetTimeout = setTimeout(() => {
      armedNode = null;
      renderRails();
    }, ARMED_WINDOW_MS);
  }
  function disarmNode() {
    armedNode = null;
    if (armedResetTimeout) { clearTimeout(armedResetTimeout); armedResetTimeout = null; }
  }

  function buildRails() {
    const sheet = document.getElementById('rails-sheet');
    if (!sheet) return;
    sheet.innerHTML = '';
    // Reset DOM lookups early so anything we register below (origin node,
    // rail nodes, etc.) isn't wiped by a later initialisation.
    dom.railNodes = {};
    dom.railBackboneFills = {};
    dom.railProgress = {};
    dom.railRails = {};

    // Drafting-sheet corner ticks.
    ['tl','tr','bl','br'].forEach(pos => {
      const c = document.createElement('div');
      c.className = `sheet-corner sheet-corner-${pos}`;
      c.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18"><line x1="0" y1="0" x2="12" y2="0"/><line x1="0" y1="0" x2="0" y2="12"/></svg>';
      sheet.appendChild(c);
    });

    // Ring-bar — tier column headers aligned with node columns below.
    const ringbar = document.createElement('div');
    ringbar.className = 'rails-ringbar';
    const tierCols = Array.from({ length: RAILS_TIERS }, (_, i) =>
      `<div class="rb-col">R${i + 1}</div>`
    ).join('');
    ringbar.innerHTML = `
      <div class="rb-left">DISCIPLINE</div>
      <div class="rb-tiers">${tierCols}</div>
      <div class="rb-right">OWNED</div>
    `;
    sheet.appendChild(ringbar);

    const body = document.createElement('div');
    body.className = 'rails-body';
    sheet.appendChild(body);

    // Group TREE_NODES by branch, sorted by ring.
    const byBranch = {};
    for (const id in TREE_NODES) {
      const n = TREE_NODES[id];
      if (!n.branch || n.branch === 'origin') continue;
      (byBranch[n.branch] = byBranch[n.branch] || []).push({ id, r: n.pos.r });
    }
    for (const b in byBranch) byBranch[b].sort((a, b) => a.r - b.r);

    // Tier-unlocks rail — factory tier gates sit at the top of the rails,
    // in the same visual language as the research nodes. T2..T6 drop into
    // columns R1..R5, leaving R6..R8 empty (they only go up to six).
    {
      const rail = document.createElement('div');
      rail.className = 'rail rail-tiers br-tiers';
      rail.dataset.branch = 'tiers';

      const label = document.createElement('div');
      label.className = 'rail-label';
      label.innerHTML = `
        <span class="rl-glyph"></span>
        <span class="rl-name">TIER UNLOCKS</span>
      `;
      rail.appendChild(label);

      const track = document.createElement('div');
      track.className = 'rail-track';
      const backbone = document.createElement('div');
      backbone.className = 'rail-backbone';
      const bbFill = document.createElement('div');
      bbFill.className = 'rail-backbone-fill';
      backbone.appendChild(bbFill);
      track.appendChild(backbone);
      dom.railBackboneFills['tiers'] = bbFill;

      // Tier unlocks don't share the research ring scheme — they're their
      // own thing. Spread the 5 nodes evenly across the full track width
      // instead of leaving a gaping empty third on the right.
      track.classList.add('rail-track-tiers');
      dom.tierRailNodes = {};
      for (let tid = 2; tid <= 6; tid++) {
        const cell = document.createElement('div');
        cell.className = 'rail-cell has-node';
        cell.dataset.tier = tid;
        const node = buildTierUnlockNode(tid);
        cell.appendChild(node);
        dom.tierRailNodes[tid] = node;
        track.appendChild(cell);
      }
      rail.appendChild(track);

      const prog = document.createElement('div');
      prog.className = 'rail-progress';
      prog.innerHTML = `<b data-prog-owned>0</b><span class="rp-sep">/</span><span class="rp-max">5</span>`;
      rail.appendChild(prog);
      dom.railProgress['tiers'] = prog;

      body.appendChild(rail);
    }

    BRANCH_DISPLAY_ORDER.forEach(branchId => {
      if (!byBranch[branchId]) return;
      const rail = document.createElement('div');
      rail.className = `rail br-${branchId}`;
      rail.dataset.branch = branchId;

      // Label: branch glyph + branch name.
      const label = document.createElement('div');
      label.className = 'rail-label';
      label.innerHTML = `
        <span class="rl-glyph"></span>
        <span class="rl-name">${branchId.toUpperCase()}</span>
      `;
      rail.appendChild(label);

      // Track: backbone + 8 tier cells (may contain a node or be empty).
      const track = document.createElement('div');
      track.className = 'rail-track';

      const backbone = document.createElement('div');
      backbone.className = 'rail-backbone';
      const bbFill = document.createElement('div');
      bbFill.className = 'rail-backbone-fill';
      backbone.appendChild(bbFill);
      track.appendChild(backbone);
      dom.railBackboneFills[branchId] = bbFill;

      for (let r = 1; r <= RAILS_TIERS; r++) {
        const cell = document.createElement('div');
        cell.className = 'rail-cell';
        cell.dataset.ring = r;
        const entry = byBranch[branchId].find(e => e.r === r);
        if (entry) {
          cell.classList.add('has-node');
          const node = buildRailNode(entry.id, branchId);
          cell.appendChild(node);
          dom.railNodes[entry.id] = node;
        }
        track.appendChild(cell);
      }
      rail.appendChild(track);

      const prog = document.createElement('div');
      prog.className = 'rail-progress';
      prog.innerHTML = `<b data-prog-owned>0</b><span class="rp-sep">/</span><span class="rp-max">${RAILS_TIERS}</span>`;
      rail.appendChild(prog);
      dom.railProgress[branchId] = prog;

      body.appendChild(rail);
      dom.railRails[branchId] = rail;
    });

    renderRails();
    bindRailsInteractions();
  }

  function buildRailNode(id, branchId) {
    const n = TREE_NODES[id];
    const el = document.createElement('div');
    el.className = `rail-node br-${branchId}`;
    el.dataset.node = id;

    const name = document.createElement('div');
    name.className = 'rn-name';
    name.textContent = n.name;
    el.appendChild(name);

    const circle = document.createElement('div');
    circle.className = 'rn-circle';
    // Progress ring for leveled nodes: SVG arc that fills as the player
    // levels up. Radius 15.5 on a viewBox of 20 so the stroke sits just
    // inside the 32px circle border. stroke-dasharray is set at render.
    const ringSvg = n.type === 'leveled'
      ? `<svg class="rn-progress" viewBox="-20 -20 40 40"><circle class="rn-progress-arc" cx="0" cy="0" r="17"/></svg>`
      : '';
    const burst = `<div class="rn-burst"></div>`;
    const glyph = `<svg viewBox="-10 -10 20 20" class="rn-glyph">${(NODE_GLYPHS[id] || BRANCH_GLYPHS[n.branch] || '')}</svg>`;
    circle.innerHTML = ringSvg + glyph + burst;
    el.appendChild(circle);

    // Level + cost wrap as one block under the circle. The node uses a
    // 1fr-auto-1fr grid so the circle always sits at the vertical centre
    // of the track (and therefore on the backbone) regardless of whether
    // a node has level text or not.
    const sub = document.createElement('div');
    sub.className = 'rn-sub';
    const lvl = document.createElement('div');
    lvl.className = 'rn-level';
    sub.appendChild(lvl);
    const cost = document.createElement('div');
    cost.className = 'rn-cost';
    sub.appendChild(cost);
    el.appendChild(sub);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof e.clientX === 'number' && (e.clientX || e.clientY)) {
        lastTipMouse.x = e.clientX; lastTipMouse.y = e.clientY;
      } else {
        const r = el.getBoundingClientRect();
        lastTipMouse.x = r.left + r.width / 2;
        lastTipMouse.y = r.top + r.height / 2;
      }
      // Unpurchasable states: just show the tooltip, skip the arm/confirm flow.
      if (nodeState(id) !== 'available' || state.meta.schematics < nodeNextCost(id)) {
        disarmNode(); renderRails(); renderTooltipFor(id); return;
      }

      // v0.9.9 — bulk research buying. The BUY MODE bar at the top of the
      // factory now applies to research the same way it applies to machines
      // and supports. When mode > 1 the player has explicitly opted into
      // bulk purchasing, so we skip the arm/confirm safety prompt — its
      // only purpose is to prevent ×1 misclicks. Modifier keys also work as
      // one-shot bulk requests, mirroring the machine slot scheme:
      //   Shift           → ×10
      //   Shift + Alt     → ×100
      //   Ctrl + Shift    → ×1000 (requires Max Buy research)
      const r = rm();
      let count = null;
      if (r.bulkBuy) {
        if (r.maxBuy && e.shiftKey && e.ctrlKey)   count = 1000;
        else if (e.shiftKey && e.altKey)            count = 100;
        else if (e.shiftKey)                        count = 10;
      }
      if (count === null) count = buyModeCount(state.settings.buyMode || '1', r);

      if (count !== 1) {
        let bought;
        if (count === 'max') bought = researchBuyMax(id);
        else                 bought = researchBuyMultiple(id, count);
        if (bought > 0) { pulseNode(el); haptic(20); }
        disarmNode();
      } else if (armedNode === id) {
        if (researchBuy(id)) { pulseNode(el); haptic(20); }
        disarmNode();
      } else {
        armNode(id);
        audio.researchArm();
        haptic(4);
      }
      renderRails();
      renderTooltipFor(id);
    });
    el.addEventListener('mouseenter', () => {
      if (isSyntheticMouseFromTouch()) return;
      const r = el.getBoundingClientRect();
      lastTipMouse.x = r.left + r.width / 2;
      lastTipMouse.y = r.top + r.height / 2;
      renderTooltipFor(id);
    });
    el.addEventListener('mouseleave', () => {
      if (isSyntheticMouseFromTouch()) return;
      hideTooltip();
    });
    el.addEventListener('mousemove', moveTooltip);

    return el;
  }

  // Tier-unlock node: same visual language as research nodes but wired to
  // the tier-unlock buy flow. One click purchases when affordable; no arm
  // step since tier unlocks are one-way and the cost is always visible.
  function buildTierUnlockNode(tid) {
    const tu = TIER_UNLOCKS[tid];
    const el = document.createElement('div');
    el.className = 'rail-node tier-unlock-node br-tiers';
    el.dataset.tier = tid;

    const name = document.createElement('div');
    name.className = 'rn-name';
    // "T2 · SMELTING" — split onto two lines for compactness
    name.textContent = tu.name.replace(/^T\d+ · /, '');
    el.appendChild(name);

    const circle = document.createElement('div');
    circle.className = 'rn-circle';
    // Tier nodes share the rail-node progress ring + burst so owned/unowned
    // reads the same way as research nodes (full arc = owned).
    const C = 2 * Math.PI * 17;
    circle.innerHTML =
      `<svg class="rn-progress" viewBox="-20 -20 40 40"><circle class="rn-progress-arc" cx="0" cy="0" r="17"/></svg>` +
      `<span class="rn-tier">T${tid}</span>` +
      `<div class="rn-burst"></div>`;
    el.appendChild(circle);

    // Match the research-node sub-wrap layout so tier nodes align on the
    // same backbone.
    const sub = document.createElement('div');
    sub.className = 'rn-sub';
    const lvl = document.createElement('div');
    lvl.className = 'rn-level';
    sub.appendChild(lvl);
    const cost = document.createElement('div');
    cost.className = 'rn-cost';
    sub.appendChild(cost);
    el.appendChild(sub);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof e.clientX === 'number' && (e.clientX || e.clientY)) {
        lastTipMouse.x = e.clientX; lastTipMouse.y = e.clientY;
      }
      if (tierUnlocked(tid)) return;
      if (!tierUnlockAvailable(tid)) return;
      if (state.meta.schematics < tierUnlockCost(tid)) { haptic(8); return; }
      if (buyTierUnlock(tid)) {
        pulseNode(el);
        haptic(20);
        renderRails();
        buildFactory();
        buildResBar();
      }
    });

    return el;
  }

  function renderRails() {
    if (!dom.railNodes) return;

    const branchOwned = {};

    for (const id in dom.railNodes) {
      const n = TREE_NODES[id];
      const el = dom.railNodes[id];
      const revealed = nodeRevealed(id);
      // v0.9.8 — always show every node. Previously unrevealed nodes were
      // set visibility:hidden, which hid the whole horizon of the tree from
      // new players. They now render as dashed / dimmed "locked" cards so
      // the player can see what's coming even before they can work toward
      // it. The existing .locked CSS (45% opacity, dashed border) handles
      // the visual dimming; nothing else needed.
      el.style.visibility = '';

      el.classList.remove('owned', 'available', 'locked', 'affordable', 'armed', 'unrevealed');
      const st = nodeState(id);
      el.classList.add(st);
      // Extra class on nodes whose prerequisites aren't even close yet so
      // CSS can optionally style them more subtly than "almost-unlockable"
      // locked nodes (where prereqs are at >=50%).
      if (!revealed) el.classList.add('unrevealed');
      if (st === 'available' && state.meta.schematics >= nodeNextCost(id)) {
        el.classList.add('affordable');
      }
      if (id === armedNode) el.classList.add('armed');

      // Level text — always "#/#" for leveled nodes (no "LV" / "MAX" prefix).
      // Unlock / origin nodes don't have meaningful level counts, so leave
      // their slot blank.
      const lvl = nodeLevel(id);
      const max = nodeMax(id);
      const lvlEl = el.querySelector('.rn-level');
      if (lvlEl) {
        if (n.type === 'leveled') {
          lvlEl.textContent = `${lvl}/${max === 999 ? '∞' : max}`;
        } else {
          lvlEl.textContent = '';
        }
      }
      // Progress arc — leveled nodes show lvl/max fill; unlock / origin
      // show 0 or 100% (a full arc means "owned"). Same visual language
      // across every node type.
      const arc = el.querySelector('.rn-progress-arc');
      if (arc) {
        const C = 2 * Math.PI * 17;
        let pct = 0;
        if (n.type === 'leveled') pct = max > 0 ? Math.min(1, lvl / max) : 0;
        else pct = lvl > 0 ? 1 : 0;
        arc.setAttribute('stroke-dasharray', `${pct * C} ${C}`);
      }

      const costEl = el.querySelector('.rn-cost');
      if (costEl) {
        if (st === 'owned') costEl.textContent = '';
        else if (st === 'locked') costEl.textContent = 'LOCKED';
        else {
          const c = nodeNextCost(id);
          costEl.textContent = `${c}◆`;
        }
      }

      if (nodeLevel(id) > 0) {
        branchOwned[n.branch] = (branchOwned[n.branch] || 0) + 1;
      }
    }

    BRANCH_DISPLAY_ORDER.forEach(branchId => {
      const owned = branchOwned[branchId] || 0;
      const prog = dom.railProgress[branchId];
      if (prog) {
        const b = prog.querySelector('[data-prog-owned]');
        if (b) b.textContent = owned;
        prog.classList.toggle('complete', owned >= RAILS_TIERS);
      }
      const fill = dom.railBackboneFills[branchId];
      if (fill) {
        // Backbone fill reaches the center of the last owned node.
        const pct = owned === 0 ? 0 : ((owned - 0.5) / RAILS_TIERS) * 100;
        fill.style.width = pct + '%';
      }
    });

    // Tier-unlock rail — separate loop because tier nodes aren't in TREE_NODES
    // and use the tier-unlock state machine (owned / available / locked /
    // unaffordable) rather than the research one.
    if (dom.tierRailNodes) {
      let tiersOwned = 0;
      for (const tidStr in dom.tierRailNodes) {
        const tid = +tidStr;
        const el = dom.tierRailNodes[tid];
        const owned = tierUnlocked(tid);
        const avail = tierUnlockAvailable(tid);
        const cost = tierUnlockCost(tid);
        const afford = state.meta.schematics >= cost;
        el.classList.remove('owned', 'available', 'locked', 'affordable', 'armed', 'unaffordable');
        if (owned) { el.classList.add('owned'); tiersOwned++; }
        else if (!avail) el.classList.add('locked');
        else el.classList.add('available');
        if (!owned && avail && afford) el.classList.add('affordable');
        else if (!owned && avail && !afford) el.classList.add('unaffordable');
        const costEl = el.querySelector('.rn-cost');
        if (costEl) {
          if (owned) costEl.textContent = '';
          else if (!avail) costEl.textContent = `REQ T${tid - 1}`;
          else costEl.textContent = `${cost}◆`;
        }
        // Progress arc — same language as research nodes: owned = full ring.
        const arc = el.querySelector('.rn-progress-arc');
        if (arc) {
          const C = 2 * Math.PI * 17;
          arc.setAttribute('stroke-dasharray', `${(owned ? 1 : 0) * C} ${C}`);
        }
      }
      const prog = dom.railProgress['tiers'];
      if (prog) {
        const b = prog.querySelector('[data-prog-owned]');
        if (b) b.textContent = tiersOwned;
        prog.classList.toggle('complete', tiersOwned >= 5);
      }
      const fill = dom.railBackboneFills['tiers'];
      if (fill) {
        // 5 tiers occupy the first 5 of 8 columns — fill up to the last
        // owned node's column center.
        const pct = tiersOwned === 0 ? 0 : ((tiersOwned - 0.5) / RAILS_TIERS) * 100;
        fill.style.width = pct + '%';
      }
    }

  }

  function bindRailsInteractions() {
    if (bindRailsInteractions.__bound) return;
    bindRailsInteractions.__bound = true;
    // Dismiss tooltip and disarm any pending confirm on any tap outside a node.
    const dismissIfOutside = (e) => {
      const t = e.target;
      if (!t || typeof t.closest !== 'function') return;
      if (t.closest('.rail-node') || t.closest('.tree-tooltip')) return;
      if (treeTip && treeTip.style.display !== 'none') hideTooltip();
      if (armedNode !== null) { disarmNode(); renderRails(); }
    };
    document.addEventListener('click', dismissIfOutside, true);
    document.addEventListener('touchend', dismissIfOutside, true);
  }

  // ---------- TOOLTIP ----------
  let lastTipMouse = { x: 0, y: 0 };
  function renderTooltipFor(id) {
    const n = TREE_NODES[id];
    const st = nodeState(id);
    const lvl = nodeLevel(id);
    const max = nodeMax(id);
    const cost = nodeNextCost(id);
    const canAff = state.meta.schematics >= cost;

    treeTip.classList.remove('cant', 'owned');
    if (st === 'owned') treeTip.classList.add('owned');
    else if (!canAff || st === 'locked') treeTip.classList.add('cant');

    let reqHtml = '';
    if (st === 'locked') {
      const missing = n.requires.filter(r => nodeLevel(r) < 1).map(r => TREE_NODES[r].name).join(', ');
      reqHtml = `<div class="tip-req">REQUIRES · ${missing}</div>`;
    }

    let costHtml = '';
    if (st === 'owned') {
      if (n.type === 'leveled') costHtml = `<div class="tip-cost">◆ MAX LEVEL · ${lvl}/${max === 999 ? '∞' : max}</div>`;
      else costHtml = `<div class="tip-cost">◆ OWNED</div>`;
    } else if (n.type === 'leveled') {
      costHtml = `
        <div class="tip-cost">CURRENT · Lv ${lvl}/${max === 999 ? '∞' : max}</div>
        <div class="tip-cost" style="margin-top:4px">NEXT LEVEL · ${cost} schematic${cost !== 1 ? 's' : ''}</div>
      `;
    } else {
      costHtml = `<div class="tip-cost">COST · ${cost} schematic${cost !== 1 ? 's' : ''}</div>`;
    }

    const typeTag = n.type === 'leveled' ? '<span style="color:#78e08f">LEVELED</span>' : n.type === 'unlock' ? '<span style="color:#ffd670">UNLOCK</span>' : '';

    const confirmHint = (id === armedNode) ? `<div class="tip-confirm">◆ CLICK AGAIN TO CONFIRM</div>` : '';
    treeTip.innerHTML = `
      <div class="tip-name">${n.name} ${typeTag}</div>
      <div class="tip-desc">${n.desc}</div>
      ${costHtml}
      ${reqHtml}
      ${confirmHint}
    `;
    treeTip.style.display = 'block';
    positionTooltip();
  }
  function moveTooltip(e) { lastTipMouse.x = e.clientX; lastTipMouse.y = e.clientY; positionTooltip(); }
  function positionTooltip() {
    const pad = 16, edge = 8;
    let x = lastTipMouse.x + pad, y = lastTipMouse.y + pad;
    const rect = treeTip.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = lastTipMouse.x - rect.width - pad;
    if (y + rect.height > window.innerHeight) y = lastTipMouse.y - rect.height - pad;
    // Final clamp: keep tooltip fully on-screen even when both flips overflow (narrow phones).
    x = Math.max(edge, Math.min(x, window.innerWidth - rect.width - edge));
    y = Math.max(edge, Math.min(y, window.innerHeight - rect.height - edge));
    treeTip.style.left = x + 'px'; treeTip.style.top = y + 'px';
  }
  function hideTooltip() { treeTip.style.display = 'none'; }

  // ---------- TOASTS ----------
  // Fire-and-forget info popups that slide in from the side, linger a few
  // seconds, and fade on their own. Replaces the persistent hover tooltip
  // on machine slots so info comes and goes instead of sticking around.
  function showToast(html, opts = {}) {
    if (!toastStackEl) return null;
    const el = document.createElement('div');
    el.className = 'toast' + (opts.kind ? ' ' + opts.kind : '');
    el.innerHTML = html;
    // Tap/click anywhere on the toast to dismiss early.
    el.addEventListener('click', () => el.remove());
    toastStackEl.appendChild(el);
    // Soft tick when a tip/info toast appears — opt-out for hover info popups
    // that fire on every machine hover (would be too chatty).
    if (opts.silent !== true) audio.toast();
    // CSS animation handles the fade-out timing; remove from DOM when it ends.
    const drop = () => { if (el.parentNode) el.remove(); };
    setTimeout(drop, opts.duration || 4200);
    return el;
  }

  function machineInfoHtml(id) {
    const m = MACHINES[id];
    if (!m) return '';
    const count = state.machines[id] || 0;
    const unlocked = machineUnlocked(id);
    if (!unlocked) {
      return `<b>${m.name}</b><br><span class="warn">LOCKED · Unlock ${m.mk.toUpperCase()} in Research</span>`;
    }
    let totalMachines = 0;
    for (const mid in state.machines) totalMachines += state.machines[mid] || 0;
    const prodMul = globalProdMul(totalMachines);
    const consMul = globalConsMul();
    const ratio = runtime.machineRatio[id] ?? 1;
    const bn = runtime.bottleneck[id];
    const cost = machineCost(id);
    const afford = canAfford(cost);

    const prodParts = Object.entries(m.produces).map(([res, rate]) => `+${fmt(rate * prodMul)} ${res}/s`);
    const consParts = Object.entries(m.consumes).map(([res, rate]) => `-${fmt(rate * consMul)} ${res}/s`);
    const costStr = Object.entries(cost).map(([res, amt]) => `${fmt(amt)} ${res}`).join(' + ');
    const totalOut = count > 0
      ? Object.entries(m.produces).map(([res, rate]) => `+${fmt(rate * count * prodMul * ratio)} ${res}/s`).join(' · ')
      : '';

    let lines = [];
    lines.push(`<b>${m.name}</b>${count > 0 ? ' ×' + count : ''}`);
    if (prodParts.length) lines.push(prodParts.join(' · ') + (totalOut ? ` <span class="dim">(total ${totalOut})</span>` : ''));
    if (consParts.length) lines.push(consParts.join(' · '));
    if (bn && count > 0)  lines.push(`<span class="warn">Starved of ${bn}</span>`);
    lines.push(`Next: <span class="${afford ? 'ok' : 'warn'}">${costStr}</span>`);
    return lines.join('<br>');
  }

  // ---------- UNLOCK WATCHER ----------
  let prevUnlockSig = '';
  function checkUnlockChanges() {
    const tierSig = TIERS.map(t => tierUnlocked(t.id) ? '1' : '0').join('');
    const mkSig = (state.research.levels.mk4 ? 'A' : 'a') + (state.research.levels.mk5 ? 'B' : 'b');
    const sig = tierSig + '/' + mkSig;
    if (sig !== prevUnlockSig) {
      prevUnlockSig = sig;
      buildResBar(); buildFactory();
    }
    tabTreeEl.classList.toggle('hidden', !treeTabVisible());
    tabStatsEl.classList.toggle('hidden', !statsTabVisible());
    tabMasteryEl.classList.toggle('hidden', !masteryTabVisible());
    if (tabExhibitionsEl) tabExhibitionsEl.classList.toggle('hidden', !exhibitionsUnlocked());
  }

  function rebuildAll() {
    buildResBar(); buildFactory(); buildSidebar(); buildRails();
    buildAchievementsView();
    tabTreeEl.classList.toggle('hidden', !treeTabVisible());
    tabStatsEl.classList.toggle('hidden', !statsTabVisible());
    tabMasteryEl.classList.toggle('hidden', !masteryTabVisible());
    if (tabExhibitionsEl) tabExhibitionsEl.classList.toggle('hidden', !exhibitionsUnlocked());
  }

  // Stats becomes relevant the moment the player owns any machine, independent
  // of whether the sidebar has content.
  function statsTabVisible() {
    for (const id in state.machines) if ((state.machines[id] || 0) > 0) return true;
    return state.meta.prestigeCount > 0 || state.meta.schematics > 0;
  }
  function masteryTabVisible() {
    return (state.resources.prototype || 0) > 0
        || (state.meta.patents || 0) > 0
        || (state.meta.publishCount || 0) > 0
        || tierUnlocked(6);
  }

  // ---------- STATS VIEW ----------
  // Build an SVG multi-line chart from history samples. log-scale y for
  // quantities that span many orders of magnitude. Very small and dependency-
  // free — custom viewBox stretches to fit whatever aspect the container has.
  function buildChart(opts) {
    const { title, series, samples, yLog, width = 720, height = 180, sub = '' } = opts;
    if (!samples || samples.length < 2) {
      return `<div class="stats-chart"><div class="chart-head"><h4>${title}</h4>${sub ? `<span class="chart-sub">${sub}</span>` : ''}</div><div class="chart-empty">Collecting data — checks back in a minute.</div></div>`;
    }
    const n = samples.length;
    const tFirst = samples[0].t, tLast = samples[n - 1].t;
    const tSpan = Math.max(1, tLast - tFirst);

    // Y bounds: max over all series, min (for log) clamped at 1
    let yMin = Infinity, yMax = -Infinity;
    for (const s of series) {
      for (let i = 0; i < n; i++) {
        const v = s.get(samples[i]);
        if (v == null || !isFinite(v)) continue;
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
    }
    if (!isFinite(yMax) || yMax <= 0) yMax = 1;
    if (!isFinite(yMin)) yMin = 0;
    if (yLog) { yMin = 1; yMax = Math.max(10, yMax); }

    const pad = { l: 44, r: 10, t: 6, b: 22 };
    const plotW = width - pad.l - pad.r;
    const plotH = height - pad.t - pad.b;

    const xAt = (t) => pad.l + ((t - tFirst) / tSpan) * plotW;
    const yAt = (v) => {
      if (yLog) {
        const lv = Math.max(Math.log10(Math.max(1, v)), 0);
        const hi = Math.log10(yMax);
        return pad.t + plotH - (lv / (hi || 1)) * plotH;
      }
      return pad.t + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
    };

    // Path per series
    const paths = series.map(s => {
      let d = '';
      let first = true;
      for (let i = 0; i < n; i++) {
        const v = s.get(samples[i]);
        if (v == null || !isFinite(v)) continue;
        const x = xAt(samples[i].t), y = yAt(v);
        d += (first ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
        first = false;
      }
      return `<path d="${d}" stroke="${s.color}" stroke-width="1.8" fill="none" opacity="0.95"/>`;
    }).join('');

    // Y-axis labels — 4 gridlines
    let gridLines = '';
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (plotH * i) / 4;
      let label;
      if (yLog) {
        const lv = Math.log10(yMax) * (1 - i / 4);
        label = fmt(Math.pow(10, lv));
      } else {
        const v = yMax - (yMax - yMin) * (i / 4);
        label = fmt(v);
      }
      gridLines += `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${width - pad.r}" y2="${y.toFixed(1)}" stroke="rgba(74,159,207,0.08)" stroke-width="1"/>`;
      gridLines += `<text x="${pad.l - 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" fill="rgba(176,208,228,0.55)" font-size="10" font-family="Consolas, monospace">${label}</text>`;
    }

    // Time axis — start / middle / end labels relative to now
    const ago = (ms) => {
      const s = Math.round(ms / 1000);
      if (s < 60) return s + 's';
      const m = Math.round(s / 60);
      if (m < 60) return m + 'm';
      const h = (m / 60);
      return h.toFixed(1) + 'h';
    };
    const now = Date.now();
    const xLabels = [
      { t: tFirst, label: ago(now - tFirst) + ' ago' },
      { t: tFirst + tSpan / 2, label: ago(now - (tFirst + tSpan/2)) + ' ago' },
      { t: tLast, label: 'now' },
    ].map(l => `<text x="${xAt(l.t).toFixed(1)}" y="${height - 6}" text-anchor="middle" fill="rgba(176,208,228,0.55)" font-size="10" font-family="Consolas, monospace">${l.label}</text>`).join('');

    const legend = series.map(s =>
      `<span class="chart-legend-item"><span class="chart-swatch" style="background:${s.color}"></span>${s.name}</span>`
    ).join('');

    return `
      <div class="stats-chart">
        <div class="chart-head">
          <h4>${title}</h4>
          ${sub ? `<span class="chart-sub">${sub}</span>` : ''}
          <div class="chart-legend">${legend}</div>
        </div>
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="chart-svg">
          ${gridLines}
          ${paths}
          ${xLabels}
        </svg>
      </div>
    `;
  }

  function renderStats() {
    if (!statsBodyEl) return;
    const m = state.meta;
    const run = m.currentRunStartAt ? (Date.now() - m.currentRunStartAt) : 0;
    const samples = Array.isArray(m.history) ? m.history : [];

    let machineRows = '';
    let totalMachines = 0;
    for (const id in state.machines) {
      const c = state.machines[id] || 0;
      totalMachines += c;
      if (c > 0) machineRows += `<div class="r"><span class="k">${MACHINES[id].name}</span><span class="v">×${fmt(c)}</span></div>`;
    }
    if (!machineRows) machineRows = `<div class="r"><span class="k">— no machines built yet —</span><span class="v"></span></div>`;

    let supportRows = '';
    for (const id in state.supports) {
      const c = state.supports[id] || 0;
      if (c > 0) supportRows += `<div class="r"><span class="k">${SUPPORTS[id].name}</span><span class="v">×${fmt(c)}</span></div>`;
    }

    let researchRows = '';
    for (const id in state.research.levels) {
      const lvl = state.research.levels[id];
      if (id === 'origin' || lvl <= 0) continue;
      const node = TREE_NODES[id];
      if (!node) continue;
      const max = nodeMax(id);
      researchRows += `<div class="r"><span class="k">${node.name}</span><span class="v ${lvl >= max ? 'ok' : 'hi'}">Lv ${lvl}${max < 999 ? '/' + max : ''}</span></div>`;
    }
    if (!researchRows) researchRows = `<div class="r"><span class="k">— no research purchased —</span><span class="v"></span></div>`;

    const lifetime = m.lifetimeProduced || emptyResources();
    const thisRun = m.totalProduced || emptyResources();

    // Achievements are now shown below the factory tiers (collapsible section).
    // The stats view keeps only an earned-count summary.
    const achMap = m.achievements || {};
    let earnedCount = 0, totalCount = 0;
    for (const id in ACHIEVEMENTS) { totalCount++; if (achMap[id]) earnedCount++; }

    const chartResources = buildChart({
      title: 'RESOURCES · LAST HOUR',
      sub: 'log scale',
      yLog: true,
      samples,
      series: [
        { name: 'ORE',       color: '#b7d4e3', get: s => s.o },
        { name: 'INGOT',     color: '#f3b45a', get: s => s.i },
        { name: 'PART',      color: '#7ed2c8', get: s => s.p },
        { name: 'CIRCUIT',   color: '#a89fff', get: s => s.c },
        { name: 'CORE',      color: '#ffd670', get: s => s.k },
        { name: 'PROTOTYPE', color: '#ff9ad1', get: s => s.r },
      ],
    });
    const chartProd = buildChart({
      title: 'TOTAL PRODUCTION /s',
      sub: 'log scale',
      yLog: true,
      samples,
      series: [
        { name: 'PROD/s', color: '#4a9fcf', get: s => s.pr || 0 },
      ],
    });
    const chartMeta = buildChart({
      title: 'SCHEMATICS & PATENTS',
      sub: 'current held',
      samples,
      series: [
        { name: 'SCHEMATICS', color: '#ffd670', get: s => s.s || 0 },
        { name: 'PATENTS',    color: '#78c8ff', get: s => s.a || 0 },
      ],
    });

    statsBodyEl.innerHTML = `
      <div class="stats-block">
        <h3>◆ TREND</h3>
        ${chartResources}
        ${chartProd}
        ${chartMeta}
      </div>
      <div class="stats-block">
        <h3>◆ ALL-TIME</h3>
        <div class="rows">
          <div class="r"><span class="k">ACHIEVEMENTS</span><span class="v hi">${earnedCount} / ${totalCount}</span></div>
          <div class="r"><span class="k">PUBLISHES</span><span class="v hi">${fmt(m.publishCount || 0)}</span></div>
          <div class="r"><span class="k">PATENTS EARNED</span><span class="v hi">${fmt(m.totalPatents || 0)}</span></div>
          <div class="r"><span class="k">PATENTS NOW</span><span class="v ok">${fmt(m.patents || 0)}</span></div>
          <div class="r"><span class="k">PRESTIGES (EPOCH)</span><span class="v hi">${fmt(m.prestigeCount)}</span></div>
          <div class="r"><span class="k">PRESTIGES (LIFETIME)</span><span class="v">${fmt(m.lifetimePrestiges || m.prestigeCount || 0)}</span></div>
          <div class="r"><span class="k">SCHEMATICS (LIFETIME)</span><span class="v">${fmt(m.lifetimeSchematics || m.totalSchematics || 0)}</span></div>
          <div class="r"><span class="k">SCHEMATICS NOW</span><span class="v ok">${fmt(m.schematics)}</span></div>
          <div class="r"><span class="k">TOTAL PLAYTIME</span><span class="v">${fmtDuration(m.totalPlaytimeMs)}</span></div>
          <div class="r"><span class="k">TOTAL CLICKS</span><span class="v">${fmt(m.totalClicks)}</span></div>
        </div>
      </div>
      <div class="stats-block">
        <h3>◆ LIFETIME PRODUCTION</h3>
        <div class="rows">
          <div class="r"><span class="k">ORE</span><span class="v">${fmt(lifetime.ore || 0)}</span></div>
          <div class="r"><span class="k">INGOT</span><span class="v">${fmt(lifetime.ingot || 0)}</span></div>
          <div class="r"><span class="k">PART</span><span class="v">${fmt(lifetime.part || 0)}</span></div>
          <div class="r"><span class="k">CIRCUIT</span><span class="v">${fmt(lifetime.circuit || 0)}</span></div>
          <div class="r"><span class="k">CORE</span><span class="v">${fmt(lifetime.core || 0)}</span></div>
          <div class="r"><span class="k">PROTOTYPE</span><span class="v hi">${fmt(lifetime.prototype || 0)}</span></div>
        </div>
      </div>
      <div class="stats-block">
        <h3>◆ THIS RUN</h3>
        <div class="rows">
          <div class="r"><span class="k">DURATION</span><span class="v">${fmtDuration(run)}</span></div>
          <div class="r"><span class="k">ORE</span><span class="v">${fmt(thisRun.ore || 0)}</span></div>
          <div class="r"><span class="k">INGOT</span><span class="v">${fmt(thisRun.ingot || 0)}</span></div>
          <div class="r"><span class="k">PART</span><span class="v">${fmt(thisRun.part || 0)}</span></div>
          <div class="r"><span class="k">CIRCUIT</span><span class="v">${fmt(thisRun.circuit || 0)}</span></div>
          <div class="r"><span class="k">CORE</span><span class="v ok">${fmt(thisRun.core || 0)}</span></div>
          <div class="r"><span class="k">PROTOTYPE</span><span class="v hi">${fmt(state.resources.prototype || 0)}</span></div>
          <div class="r"><span class="k">NEXT PRESTIGE</span><span class="v">+${schematicsForPrestige()} schematics</span></div>
          <div class="r"><span class="k">NEXT PUBLISH</span><span class="v hi">+${patentsForPublish()} patents</span></div>
        </div>
      </div>
      <div class="stats-block">
        <h3>◆ MACHINES · ${fmt(totalMachines)} TOTAL</h3>
        <div class="rows">${machineRows}</div>
      </div>
      ${supportRows ? `<div class="stats-block"><h3>◆ SUPPORTS</h3><div class="rows">${supportRows}</div></div>` : ''}
      <div class="stats-block">
        <h3>◆ RESEARCH</h3>
        <div class="rows">${researchRows}</div>
      </div>
    `;
    statsBodyEl.querySelectorAll('.stats-block').forEach(addCornerTicks);
  }

  // ---------- MASTERY VIEW ----------
  // ---------- CHALLENGE UI HELPERS ----------
  function buildChallengesSectionHtml() {
    if (!challengeUnlocked()) return '';
    const active = activeChallenge();
    const completed = (state.meta.challenge && state.meta.challenge.completed) || {};
    const cards = Object.entries(CHALLENGES).map(([id, ch]) => {
      const isActive = active === id;
      const isDone = !!completed[id];
      // v0.9.8 — per-challenge availability. An unavailable challenge gets
      // a LOCKED status card with the unlock hint surfaced in place of the
      // start button, so pre-publish players see what's coming.
      const available = challengeAvailable(id);
      let status = 'AVAILABLE';
      if (isActive) status = 'ACTIVE';
      else if (isDone) status = 'COMPLETED';
      else if (!available) status = 'LOCKED';
      // Show the scaled goal alongside the original label whenever the
      // player's accumulated patents have moved the needle. Prevents
      // surprises like "I started CONSTRAINED expecting to need 25
      // schematics, but it actually needs 50."
      const scaled = effectiveChallengeGoal(ch);
      const goalLine = scaled !== ch.goalSchematics
        ? `${ch.goalLabel} <span class="ch-goal-scaled">(now ${scaled})</span>`
        : ch.goalLabel;
      // Action slot — which button / label the card closes with.
      let actions;
      if (isActive) {
        actions = '<button class="ch-btn abandon" data-ch-abandon>ABANDON</button>';
      } else if (isDone) {
        actions = '<span class="ch-done-tag">◆ COMPLETED</span>';
      } else if (!available) {
        actions = '<span class="ch-lock-tag">UNLOCKS AFTER FIRST PUBLISH</span>';
      } else {
        const startDisabled = !(canPrestige() || state.meta.prestigeCount === 0);
        actions = `<button class="ch-btn start" data-ch-start="${id}" ${startDisabled ? 'disabled' : ''}>START</button>`;
      }
      return `
        <div class="challenge-card ${status.toLowerCase()}" data-ch="${id}">
          <div class="ch-head">
            <div class="ch-name">◆ ${ch.name}</div>
            <div class="ch-status ${status.toLowerCase()}">${status}</div>
          </div>
          <div class="ch-desc">${ch.desc}</div>
          <div class="ch-goal">${goalLine}</div>
          <div class="ch-reward"><span class="ch-reward-label">REWARD</span> ${ch.rewardLabel}</div>
          <div class="ch-actions">${actions}</div>
        </div>
      `;
    }).join('');
    const completedCount = Object.keys(completed).length;
    const total = Object.keys(CHALLENGES).length;
    return `
      <div class="section-title">◆ CHALLENGES · <span class="section-dim">${completedCount} / ${total} COMPLETED</span></div>
      <div class="challenges-grid">${cards}</div>
    `;
  }

  // Pinned banner on the factory view while a challenge is running.
  // v0.9.6: scaffold DOM built once (on challenge start), per-frame render
  // only mutates the dynamic children via textContent. Previously the entire
  // banner innerHTML was replaced every ~66 ms (15 Hz), which destroyed and
  // recreated the ABANDON button on every frame. If the player's cursor was
  // hovering that button, the browser repeatedly re-evaluated cursor state
  // and the cursor flashed between hand and arrow. Reported from itch.io
  // during challenge runs.
  let challengeBannerEl = null;
  let challengeBannerRefs = null;
  function renderChallengeBanner() {
    const active = activeChallenge();
    if (!active) {
      if (challengeBannerEl) {
        challengeBannerEl.remove();
        challengeBannerEl = null;
        challengeBannerRefs = null;
      }
      return;
    }
    const ch = CHALLENGES[active];
    if (!ch) return;
    // Build the static scaffold once per challenge session. activeChallenge()
    // returns null between challenges (abandon / complete both clear it) so
    // the presence of challengeBannerEl alone is enough to tell "same session".
    if (!challengeBannerEl) {
      challengeBannerEl = document.createElement('div');
      challengeBannerEl.className = 'challenge-banner';
      challengeBannerEl.innerHTML = `
        <span class="cb-tag">⚠ CHALLENGE</span>
        <span class="cb-name"></span>
        <span class="cb-constraint"></span>
        <span class="cb-timer" style="display:none"></span>
        <span class="cb-chaos" style="display:none"></span>
        <span class="cb-progress"></span>
        <button class="cb-abandon" data-ch-abandon>ABANDON</button>
      `;
      document.body.appendChild(challengeBannerEl);
      challengeBannerRefs = {
        name:       challengeBannerEl.querySelector('.cb-name'),
        constraint: challengeBannerEl.querySelector('.cb-constraint'),
        timer:      challengeBannerEl.querySelector('.cb-timer'),
        chaos:      challengeBannerEl.querySelector('.cb-chaos'),
        progress:   challengeBannerEl.querySelector('.cb-progress'),
        abandon:    challengeBannerEl.querySelector('[data-ch-abandon]'),
      };
      challengeBannerRefs.name.textContent = ch.name;
      challengeBannerRefs.constraint.textContent = ch.constraintLabel;
      challengeBannerRefs.abandon.onclick = () => {
        showModal('ABANDON CHALLENGE?',
          `<p>Quit <b>${ch.name}</b>. Your current run continues, but no reward.</p>`,
          { confirmLabel: 'ABANDON', onConfirm: (bg) => { bg.remove(); abandonChallenge(); } });
      };
    }
    const refs = challengeBannerRefs;
    // Per-frame dynamic updates only — textContent + class/display toggles,
    // no DOM replacement. Keeps the ABANDON button's identity stable so
    // hover / cursor state doesn't flicker.
    // BLITZ — countdown timer.
    if (ch.timerMs > 0) {
      const elapsed = Date.now() - (state.meta.challenge.startedAt || Date.now());
      const remainMs = Math.max(0, ch.timerMs - elapsed);
      const rm2 = Math.floor(remainMs / 60000);
      const rs = Math.floor((remainMs % 60000) / 1000);
      refs.timer.textContent = `${rm2}:${rs.toString().padStart(2, '0')}`;
      refs.timer.style.display = '';
      refs.timer.classList.remove('ok');
    } else if (ch.minRunMs) {
      // SLOW BURN — count-up elapsed / minimum.
      const runStart = state.meta.currentRunStartAt || Date.now();
      const elapsed = Date.now() - runStart;
      const minS = Math.ceil(ch.minRunMs / 1000);
      const elS = Math.min(minS, Math.floor(elapsed / 1000));
      const fm = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
      const done = elapsed >= ch.minRunMs;
      refs.timer.textContent = `${fm(elS)} / ${fm(minS)}`;
      refs.timer.style.display = '';
      refs.timer.classList.toggle('ok', done);
    } else {
      refs.timer.style.display = 'none';
    }
    // CHAOS — show which tier is currently blacked out (if any).
    if (active === 'chaos' && runtime.chaos && runtime.chaos.endAt > Date.now()) {
      refs.chaos.textContent = `T${runtime.chaos.tierId} ◌ BLACKOUT`;
      refs.chaos.style.display = '';
    } else {
      refs.chaos.style.display = 'none';
    }
    const sch = schematicsForPrestige();
    refs.progress.textContent = `${sch} / ${effectiveChallengeGoal(active)} ◆`;
  }

  function renderMastery() {
    if (!masteryBodyEl) return;
    const prototypes = state.resources.prototype || 0;
    const patents = state.meta.patents || 0;
    const publishes = state.meta.publishCount || 0;
    const gain = patentsForPublish();
    const canPub = canPublish();

    const intro = publishes === 0
      ? `<div class="mastery-intro">
          <h4>◆ WHAT IS THIS?</h4>
          <div>Your <b>Refinery</b> machines (T6) convert Cores into <b>Prototypes</b> — the perfected final product of your factory. Once you have Prototypes, you can <b>Publish</b> your work as Patents. Publishing <b>wipes everything</b> (resources, machines, Schematics, the research tree, tier unlocks) but Patents and their permanent upgrades persist forever. Every Publish accelerates your next run.</div>
          <div style="margin-top:8px">Earn <b>30 lifetime Patents</b> to unlock <b>Exhibitions</b> — a third prestige layer that grants <b>Legacy Marks</b>. Legacy Marks buy permanent upgrades in the Archive that survive every reset, including Publish.</div>
         </div>`
      : '';

    const patentCards = Object.entries(PATENTS).map(([id, p]) => {
      const lvl = patentLevel(id);
      const max = patentMax(id);
      const cost = patentNextCost(id);
      const prereqMet = patentPrereqsMet(id);
      const owned = lvl > 0 && p.type === 'unlock';
      const maxed = lvl >= max;
      const canBuy = canBuyPatent(id);
      const afford = patents >= cost && prereqMet && !maxed;

      let cls = 'patent';
      if (maxed) cls += ' maxed';
      else if (!prereqMet) cls += ' locked';
      else if (!afford) cls += ' unaffordable';
      else cls += ' affordable';

      let levelLabel;
      if (p.type === 'unlock') levelLabel = owned ? '◆ OWNED' : '◆ UNLOCK';
      else levelLabel = maxed ? `MAX · ${max}/${max}` : `Lv ${lvl}/${max}`;

      let costLabel;
      if (maxed) costLabel = 'FULLY RESEARCHED';
      else if (p.type === 'leveled') costLabel = `NEXT · ${cost} patent${cost !== 1 ? 's' : ''}`;
      else costLabel = `${cost} patent${cost !== 1 ? 's' : ''}`;

      let reqLabel = '';
      if (!prereqMet) {
        const missing = p.requires.filter(r => patentLevel(r) < 1).map(r => PATENTS[r].name).join(', ');
        reqLabel = `<div class="preq">REQUIRES · ${missing}</div>`;
      }

      return `<button class="${cls}" data-patent="${id}" ${canBuy ? '' : 'disabled'}>
        <div class="plevel">${levelLabel}</div>
        <div class="ptitle">${p.name}</div>
        <div class="pdesc">${p.desc}</div>
        <div class="pcost">${costLabel}</div>
        ${reqLabel}
      </button>`;
    }).join('');

    masteryBodyEl.innerHTML = `
      <div class="mastery-header">
        <div class="mastery-title">MASTERY · PATENT LIBRARY</div>
        <div class="mastery-stats">
          <div class="st"><div class="k">PROTOTYPES</div><div class="v">${fmt(prototypes)}</div></div>
          <div class="st"><div class="k">PATENTS</div><div class="v patents">${fmt(patents)}</div></div>
          <div class="st"><div class="k">PUBLISHES</div><div class="v patents">${fmt(publishes)}</div></div>
        </div>
      </div>

      ${intro}

      <div class="publish-bar ${canPub ? '' : 'locked'}">
        <div class="pb-info">
          <div class="pbt">${canPub ? '◆ READY TO PUBLISH' : '◆ PUBLISH LOCKED'}</div>
          <div class="pbd">${canPub
            ? 'Wipes all Schematics, research tree, tier unlocks, and factory state. Keeps only Patents and Patent upgrades.'
            : 'Produce <b>Prototypes</b> via T6 Refinement machines to Publish.'}</div>
        </div>
        <div class="pb-gain">
          <div class="k">YOU WILL EARN</div>
          <div class="v">+${fmt(gain)} PATENT${gain !== 1 ? 'S' : ''}</div>
        </div>
        <button class="publish-btn" data-publish-btn ${canPub ? '' : 'disabled'}>◆ PUBLISH</button>
      </div>

      ${(patentLevel('auto_prestige_pat') > 0 || patentLevel('auto_publish_pat') > 0) ? `
        <div class="auto-section">
          <div class="section-title">◆ AUTOMATION</div>
          ${patentLevel('auto_prestige_pat') > 0 ? `
            <div class="auto-row">
              <label><input type="checkbox" data-auto-prestige-toggle ${state.settings.autoPrestige.enabled ? 'checked' : ''}> AUTO-PRESTIGE</label>
              <span class="auto-hint">when gain ≥</span>
              <input type="number" min="1" value="${state.settings.autoPrestige.threshold}" data-auto-prestige-thr class="auto-num">
              <span class="auto-hint">schematics</span>
            </div>
          ` : ''}
          ${patentLevel('auto_publish_pat') > 0 ? `
            <div class="auto-row">
              <label><input type="checkbox" data-auto-publish-toggle ${state.settings.autoPublish.enabled ? 'checked' : ''}> AUTO-PUBLISH</label>
              <span class="auto-hint">when prototypes ≥</span>
              <input type="number" min="1" value="${state.settings.autoPublish.threshold}" data-auto-publish-thr class="auto-num">
            </div>
          ` : ''}
        </div>
      ` : ''}

      ${buildChallengesSectionHtml()}

      <div class="section-title">◆ PATENT LIBRARY · SPEND PATENTS FOR PERMANENT BOOSTS</div>
      <div class="patents-grid">${patentCards}</div>
    `;
    masteryBodyEl.querySelectorAll('.publish-bar').forEach(addCornerTicks);

    // wire up handlers (delegate)
    masteryBodyEl.querySelector('[data-publish-btn]')?.addEventListener('click', () => {
      if (!canPublish()) return;
      const g = patentsForPublish();
      showModal('◆ CONFIRM PUBLISH',
        `<p>Publish your work for <b style="color:#ffd670">${g} Patent${g !== 1 ? 's' : ''}</b>.</p>
         <p>This will <b style="color:#ff7e5f">wipe</b>: resources, machines, supports, Schematics, research tree, tier unlocks, current prestige progress.</p>
         <p>Kept: Patents, Patent upgrades, <b>Legacy Marks</b>, <b>Archive upgrades</b>, playtime stats, settings.</p>`,
        { confirmLabel: 'PUBLISH', onConfirm: (bg) => { bg.remove(); doPublish(); } });
    });
    masteryBodyEl.querySelectorAll('[data-patent]').forEach((btn) => {
      const id = btn.dataset.patent;
      btn.addEventListener('click', () => {
        if (buyPatent(id)) renderMastery();
      });
    });
    // Challenge start / abandon buttons
    masteryBodyEl.querySelectorAll('[data-ch-start]').forEach((btn) => {
      const id = btn.dataset.chStart;
      btn.addEventListener('click', () => {
        const ch = CHALLENGES[id];
        const scaled = effectiveChallengeGoal(ch);
        const scaledLine = scaled !== ch.goalSchematics
          ? `<p><b>Scaled goal:</b> ${scaled} schematics — challenge goals scale with your patents and your typical run power so they don't go trivial late. The goal locks in when you start.</p>`
          : '';
        showModal(`START · ${ch.name}`,
          `<p>${ch.desc}</p><p><b>Goal:</b> ${ch.goalLabel}</p>${scaledLine}<p><b>Reward:</b> ${ch.rewardLabel}</p>
           <p style="color:var(--warn)">This will end your current run and start a fresh one with the constraint active.</p>`,
          { confirmLabel: 'START', onConfirm: (bg) => { bg.remove(); startChallenge(id); } });
      });
    });
    masteryBodyEl.querySelectorAll('[data-ch-abandon]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ch = CHALLENGES[activeChallenge()];
        if (!ch) return;
        showModal('ABANDON CHALLENGE?',
          `<p>Quit <b>${ch.name}</b>? Your current run continues but no reward is granted.</p>`,
          { confirmLabel: 'ABANDON', onConfirm: (bg) => { bg.remove(); abandonChallenge(); } });
      });
    });

    // auto-prestige / auto-publish toggles
    const apTog = masteryBodyEl.querySelector('[data-auto-prestige-toggle]');
    const apThr = masteryBodyEl.querySelector('[data-auto-prestige-thr]');
    if (apTog) apTog.addEventListener('change', (e) => { state.settings.autoPrestige.enabled = e.target.checked; });
    if (apThr) apThr.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      if (!isNaN(v) && v > 0) state.settings.autoPrestige.threshold = v;
    });
    const apuTog = masteryBodyEl.querySelector('[data-auto-publish-toggle]');
    const apuThr = masteryBodyEl.querySelector('[data-auto-publish-thr]');
    if (apuTog) apuTog.addEventListener('change', (e) => { state.settings.autoPublish.enabled = e.target.checked; });
    if (apuThr) apuThr.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      if (!isNaN(v) && v > 0) state.settings.autoPublish.threshold = v;
    });
  }

  // ---------- EXHIBITIONS VIEW ----------
  function renderExhibitions() {
    if (!exhibitionsBodyEl) return;
    if (!exhibitionsUnlocked()) {
      const need = Math.max(0, 30 - (state.meta.totalPatents || 0));
      exhibitionsBodyEl.innerHTML = `
        <div class="exh-header">
          <div class="exh-title">EXHIBITIONS · THE ARCHIVE</div>
        </div>
        <div class="exh-locked">
          <h3>◆ LOCKED</h3>
          <p>Earn <b>30 lifetime Patents</b> to unlock this tab. Currently: <b>${fmt(state.meta.totalPatents || 0)}</b> / 30 (<b>${fmt(need)}</b> more).</p>
          <p>Exhibitions are the third prestige layer — publish-spanning goals that reward <b>Legacy Marks</b>, a currency you spend in this Archive on permanent upgrades that persist through every reset.</p>
        </div>`;
      return;
    }

    const marks = state.meta.legacyMarks || 0;
    const active = activeExhibition();
    const exs = state.meta.exhibitions || { pool: [], completed: {}, failed: {} };
    const pool = exs.pool || [];
    const completedCount = Object.keys(exs.completed || {}).length;
    const archiveOwned = Object.keys(state.meta.legacyUpgrades || {}).filter(k => state.meta.legacyUpgrades[k]).length;
    const archiveTotal = Object.keys(LEGACY_UPGRADES).length;

    // Active card or pool picker
    let activeBlock = '';
    if (active && EXHIBITIONS[active]) {
      const ex = EXHIBITIONS[active];
      activeBlock = `
        <div class="exh-active">
          <div class="exh-active-head">◆ ACTIVE · ${ex.name}</div>
          <div class="exh-active-desc">${exhibitionDesc(active)}</div>
          <div class="exh-active-goal">Goal: <b>${exhibitionGoalLabel(active)}</b> · evaluated on next Prestige</div>
          <button class="btn warn" data-exh-abandon>ABANDON</button>
        </div>`;
    } else if (pool.length) {
      activeBlock = `
        <div class="exh-pool">
          <div class="exh-pool-head">◆ SELECT AN EXHIBITION · ${pool.length} on offer</div>
          <div class="exh-pool-grid">
            ${pool.map(id => {
              const ex = EXHIBITIONS[id];
              if (!ex) return '';
              const done = (exs.completed[id] || 0);
              return `
                <div class="exh-card" data-exh-id="${id}">
                  <div class="exh-card-name">${ex.name}</div>
                  <div class="exh-card-desc">${exhibitionDesc(id)}</div>
                  <div class="exh-card-goal">${exhibitionGoalLabel(id)}</div>
                  <div class="exh-card-meta">Completed ${done}× · reward +1 LM</div>
                  <button class="btn" data-exh-select="${id}">SELECT</button>
                </div>`;
            }).join('')}
          </div>
          <button class="btn" data-exh-skip>SKIP THIS POOL</button>
        </div>`;
    } else {
      activeBlock = `
        <div class="exh-pool">
          <div class="exh-pool-head">◆ NO ACTIVE EXHIBITION</div>
          <div class="exh-pool-hint">Roll a new pool of three to pick one for your next run.</div>
          <button class="btn" data-exh-roll>◆ ROLL EXHIBITION POOL</button>
        </div>`;
    }

    // Archive grid
    const archiveCards = Object.entries(LEGACY_UPGRADES).map(([id, u]) => {
      const owned = legacyLevel(id) >= 1;
      const afford = !owned && marks >= u.cost;
      const cls = owned ? 'owned' : (afford ? 'affordable' : 'unaffordable');
      return `
        <div class="archive-card ${cls}" data-archive-id="${id}">
          <div class="archive-name">${owned ? '◆' : '◇'} ${u.name}</div>
          <div class="archive-desc">${u.desc}</div>
          <div class="archive-cost">${owned ? 'OWNED' : `${u.cost} ${u.cost === 1 ? 'MARK' : 'MARKS'}`}</div>
          ${owned ? '' : `<button class="btn" data-archive-buy="${id}" ${afford ? '' : 'disabled'}>ACQUIRE</button>`}
        </div>`;
    }).join('');

    exhibitionsBodyEl.innerHTML = `
      <div class="exh-header">
        <div class="exh-title">EXHIBITIONS · THE ARCHIVE</div>
        <div class="exh-stats">
          <div class="st"><div class="k">LEGACY MARKS</div><div class="v lm">${fmt(marks)}</div></div>
          <div class="st"><div class="k">COMPLETED</div><div class="v">${completedCount} / ${Object.keys(EXHIBITIONS).length}</div></div>
          <div class="st"><div class="k">ARCHIVE</div><div class="v">${archiveOwned} / ${archiveTotal}</div></div>
        </div>
      </div>
      ${activeBlock}
      <div class="section-title">◆ THE ARCHIVE · SPEND LEGACY MARKS FOR PERMANENT UPGRADES</div>
      <div class="archive-grid">${archiveCards}</div>
    `;

    // Wire up event handlers
    const rollBtn = exhibitionsBodyEl.querySelector('[data-exh-roll]');
    if (rollBtn) rollBtn.addEventListener('click', () => {
      if (!state.meta.exhibitions) state.meta.exhibitions = { active: null, completed: {}, failed: {}, pool: [] };
      state.meta.exhibitions.pool = rollExhibitionPool();
      save();
      renderExhibitions();
    });
    const abandonBtn = exhibitionsBodyEl.querySelector('[data-exh-abandon]');
    if (abandonBtn) abandonBtn.addEventListener('click', () => {
      showModal('ABANDON EXHIBITION?',
        `<p>Clear the active exhibition? No penalty — you can roll a new one immediately.</p>`,
        { confirmLabel: 'ABANDON', onConfirm: (bg) => {
          if (state.meta.exhibitions) state.meta.exhibitions.active = null;
          bg.remove(); save(); renderExhibitions();
        }});
    });
    exhibitionsBodyEl.querySelectorAll('[data-exh-select]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectExhibition(btn.dataset.exhSelect);
        renderExhibitions();
      });
    });
    const skipBtn = exhibitionsBodyEl.querySelector('[data-exh-skip]');
    if (skipBtn) skipBtn.addEventListener('click', () => {
      skipExhibitions();
      renderExhibitions();
    });
    exhibitionsBodyEl.querySelectorAll('[data-archive-buy]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (buyLegacyUpgrade(btn.dataset.archiveBuy)) renderExhibitions();
      });
    });
  }

  // ---------- SETTINGS MODAL ----------
  function showSettings() {
    const s = state.settings;
    const bg = showModal('SETTINGS', `
      <div class="settings-group">
        <h4>AUDIO</h4>
        <div class="settings-row">
          <span class="label">VOLUME</span>
          <input type="range" id="set-vol" min="0" max="1" step="0.05" value="${s.volume}">
          <span class="val" id="set-vol-val">${Math.round(s.volume * 100)}%</span>
        </div>
        <div class="settings-row">
          <span class="label">MUTED</span>
          <div class="seg">
            <button id="set-mute-off" class="${!s.muted ? 'on' : ''}">OFF</button>
            <button id="set-mute-on"  class="${ s.muted ? 'on' : ''}">ON</button>
          </div>
        </div>
      </div>
      <div class="settings-group">
        <h4>DISPLAY</h4>
        <div class="settings-row">
          <span class="label">NOTATION</span>
          <div class="seg">
            <button id="set-not-si"  class="${s.notation !== 'sci' ? 'on' : ''}">K / M / B</button>
            <button id="set-not-sci" class="${s.notation === 'sci' ? 'on' : ''}">SCIENTIFIC</button>
          </div>
        </div>
      </div>
      <div class="settings-group">
        <h4>ACCESSIBILITY</h4>
        <div class="settings-row">
          <span class="label">FONT SIZE</span>
          <input type="range" id="set-fs" min="1" max="1.5" step="0.05" value="${s.fontScale || 1}">
          <span class="val" id="set-fs-val">${Math.round((s.fontScale || 1) * 100)}%</span>
        </div>
        <div class="settings-row">
          <span class="label">REDUCE MOTION</span>
          <div class="seg">
            <button id="set-rm-auto" class="${s.reduceMotion == null ? 'on' : ''}">AUTO</button>
            <button id="set-rm-on"   class="${s.reduceMotion === true ? 'on' : ''}">ON</button>
            <button id="set-rm-off"  class="${s.reduceMotion === false ? 'on' : ''}">OFF</button>
          </div>
        </div>
        <div class="settings-row">
          <span class="label">COLORBLIND PALETTE</span>
          <div class="seg">
            <button id="set-cb-off" class="${!s.colorblindMode ? 'on' : ''}">OFF</button>
            <button id="set-cb-on"  class="${s.colorblindMode ? 'on' : ''}">ON</button>
          </div>
        </div>
      </div>
      ${navigator.vibrate ? `
      <div class="settings-group">
        <h4>TOUCH</h4>
        <div class="settings-row">
          <span class="label">HAPTIC FEEDBACK</span>
          <div class="seg">
            <button id="set-hap-on"  class="${s.haptics !== false ? 'on' : ''}">ON</button>
            <button id="set-hap-off" class="${s.haptics === false ? 'on' : ''}">OFF</button>
          </div>
        </div>
      </div>` : ''}
      <div class="settings-group">
        <h4>ONBOARDING</h4>
        <div class="settings-row">
          <span class="label">TIP POPUPS</span>
          <div class="seg">
            <button id="set-tips-on"  class="${!s.tipsMuted ? 'on' : ''}">ON</button>
            <button id="set-tips-off" class="${ s.tipsMuted ? 'on' : ''}">OFF</button>
          </div>
        </div>
        <div class="settings-row">
          <span class="label">RESET ALL HINTS</span>
          <button class="btn" id="set-reset-hints">CLEAR</button>
        </div>
        <div class="settings-row">
          <span class="label">REPLAY TUTORIAL</span>
          <button class="btn" id="set-replay-tutorial">REPLAY</button>
        </div>
      </div>
      <div class="settings-group">
        <h4>SAVE &amp; SYSTEM</h4>
        ${fsSupported ? `
        <div class="settings-row">
          <span class="label">FULLSCREEN</span>
          <button class="btn" id="set-fullscreen">${inFullscreen() ? 'EXIT' : 'ENTER'}</button>
        </div>` : ''}
        <div class="settings-row">
          <span class="label">EXPORT SAVE</span>
          <span style="display:flex; align-items:center; gap:8px;">
            <span class="last-backup-pill ${(() => {
              const last = state.meta.lastExportAt || 0;
              if (!last) return 'stale';
              return (Date.now() - last > 60 * 60 * 1000) ? 'stale' : 'fresh';
            })()}">${(() => {
              const last = state.meta.lastExportAt || 0;
              if (!last) return 'LAST · NEVER';
              return 'LAST · ' + fmtAgo(Date.now() - last);
            })()}</span>
            <button class="btn" id="set-export">EXPORT</button>
          </span>
        </div>
        <div class="settings-row">
          <span class="label">IMPORT SAVE</span>
          <button class="btn" id="set-import">IMPORT</button>
        </div>
        <div class="settings-row">
          <span class="label">RESET GAME</span>
          <button class="btn warn" id="set-reset">WIPE</button>
        </div>
      </div>
      <div class="settings-group">
        <h4>CONTROLS</h4>
        <div style="font-family: var(--font-ui); font-size: calc(11px * var(--fs, 1)); color: var(--text); line-height: 1.8;">
          ${lastTouchTime > 0 ? `
            <div><b style="color:var(--accent)">TAP</b> a machine to buy one</div>
            <div><b style="color:var(--accent)">LONG-PRESS</b> a machine to see its details</div>
            <div><b style="color:var(--accent)">TAP</b> the <b style="color:var(--accent)">A</b> chip to toggle auto-buy (requires Auto-Buy)</div>
            <div>Use the <b style="color:var(--accent)">BUY MODE</b> bar for ×10 / ×100 / ×1000 / MAX (requires Bulk Buy)</div>
            <div><b style="color:var(--accent)">DRAG</b> on research tree to pan · <b style="color:var(--accent)">PINCH</b> to zoom</div>
            <div><b style="color:var(--accent)">TAP</b> a research node to arm, <b style="color:var(--accent)">TAP AGAIN</b> to confirm</div>
          ` : `
            <div><b style="color:var(--accent)">CLICK</b> machine to buy 1</div>
            <div><b style="color:var(--accent)">SHIFT+CLICK</b> to buy ×10 (requires Bulk Buy)</div>
            <div><b style="color:var(--accent)">SHIFT+ALT+CLICK</b> to buy ×100</div>
            <div><b style="color:var(--accent)">CTRL+SHIFT+CLICK</b> to buy ×1000 (requires Max Buy)</div>
            <div><b style="color:var(--accent)">RIGHT-CLICK</b> to toggle auto-buy (requires Auto-Buy)</div>
            <div><b style="color:var(--accent)">DRAG</b> on research tree to pan · <b style="color:var(--accent)">SCROLL</b> to zoom</div>
          `}
        </div>
      </div>
      <div class="settings-footer">
        <span class="sf-brand">◆ BLUEPRINT</span>
        <a class="sf-version" href="https://github.com/Real-Fruit-Snacks/blueprint/blob/main/CHANGELOG.md" target="_blank" rel="noopener">v${VERSION} · CHANGELOG</a>
      </div>
    `);

    const vol = bg.querySelector('#set-vol');
    const volVal = bg.querySelector('#set-vol-val');
    vol.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      s.volume = v;
      volVal.textContent = Math.round(v * 100) + '%';
      audio.setVolume(v);
      if (v > 0) audio.click();
    });
    bg.querySelector('#set-mute-off').addEventListener('click', () => { s.muted = false; save(); showSettings(); bg.remove(); });
    bg.querySelector('#set-mute-on').addEventListener('click',  () => { s.muted = true;  save(); showSettings(); bg.remove(); });
    bg.querySelector('#set-not-si').addEventListener('click',  () => { s.notation = 'si';  save(); showSettings(); bg.remove(); });
    bg.querySelector('#set-not-sci').addEventListener('click', () => { s.notation = 'sci'; save(); showSettings(); bg.remove(); });
    // A11y
    // FONT SIZE — live preview while dragging (the modal itself scales, so
    // the player sees the result immediately); persist on release.
    const fsRange = bg.querySelector('#set-fs');
    const fsVal = bg.querySelector('#set-fs-val');
    fsRange.addEventListener('input', (e) => {
      const v = Math.min(1.5, Math.max(1, parseFloat(e.target.value) || 1));
      s.fontScale = v;
      fsVal.textContent = Math.round(v * 100) + '%';
      applyA11yClasses();
    });
    fsRange.addEventListener('change', () => save());
    bg.querySelector('#set-rm-auto').addEventListener('click', () => { s.reduceMotion = null;  applyA11yClasses(); save(); showSettings(); bg.remove(); });
    bg.querySelector('#set-rm-on').addEventListener('click',   () => { s.reduceMotion = true;  applyA11yClasses(); save(); showSettings(); bg.remove(); });
    bg.querySelector('#set-rm-off').addEventListener('click',  () => { s.reduceMotion = false; applyA11yClasses(); save(); showSettings(); bg.remove(); });
    bg.querySelector('#set-cb-off').addEventListener('click',  () => { s.colorblindMode = false; applyA11yClasses(); save(); showSettings(); bg.remove(); });
    bg.querySelector('#set-cb-on').addEventListener('click',   () => { s.colorblindMode = true;  applyA11yClasses(); save(); showSettings(); bg.remove(); });
    const hapOn = bg.querySelector('#set-hap-on');
    const hapOff = bg.querySelector('#set-hap-off');
    if (hapOn)  hapOn.addEventListener('click',  () => { s.haptics = true;  haptic(20); save(); showSettings(); bg.remove(); });
    if (hapOff) hapOff.addEventListener('click', () => { s.haptics = false; save(); showSettings(); bg.remove(); });
    bg.querySelector('#set-reset-hints').addEventListener('click', () => {
      s.hintsShown = {};
      toast('<b>Hints cleared.</b> They will appear again as you play.');
    });
    bg.querySelector('#set-replay-tutorial').addEventListener('click', () => {
      bg.remove();
      onboardRestart();
    });
    bg.querySelector('#set-tips-on').addEventListener('click',  () => { s.tipsMuted = false; save(); showSettings(); bg.remove(); });
    bg.querySelector('#set-tips-off').addEventListener('click', () => { s.tipsMuted = true;  save(); showSettings(); bg.remove(); });
    const fsBtn = bg.querySelector('#set-fullscreen');
    if (fsBtn) fsBtn.addEventListener('click', () => {
      toggleFullscreen();
      // Refresh the label — the state flip is async, so give the event a tick.
      setTimeout(() => { fsBtn.textContent = inFullscreen() ? 'EXIT' : 'ENTER'; }, 100);
    });
    bg.querySelector('#set-export').addEventListener('click', () => { bg.remove(); actionExport(); });
    bg.querySelector('#set-import').addEventListener('click', () => { bg.remove(); actionImport(); });
    bg.querySelector('#set-reset').addEventListener('click',  () => { bg.remove(); actionReset(); });
  }

  // ---------- RENDER ----------
  let frameCount = 0, fpsAccum = 0, fpsDisplay = 0;

  function renderFactory() {
    renderMineBar();

    // buy-mode bar state
    if (dom.buyBar) {
      const r = rm();
      // The bar itself is pointless until Bulk Buy research is owned — hide it entirely
      // so new players don't see a row of locked buttons they can't interact with.
      const showBar = !!r.bulkBuy;
      dom.buyBar.style.display = showBar ? '' : 'none';
      if (showBar) {
        const allow = {
          '1':    true,
          '10':   !!r.bulkBuy,
          '100':  !!r.bulkBuy,
          '1000': !!r.maxBuy,
          'max':  !!r.maxBuy,
        };
        if (!allow[state.settings.buyMode || '1']) state.settings.buyMode = '1';
        const current = state.settings.buyMode || '1';
        dom.buyBar.querySelectorAll('[data-mode]').forEach(btn => {
          const m = btn.dataset.mode;
          btn.classList.toggle('locked', !allow[m]);
          btn.classList.toggle('on', allow[m] && m === current);
        });
        const hint = dom.buyBar.querySelector('[data-bm-hint]');
        if (hint) {
          if (!r.maxBuy) hint.textContent = 'Unlock MAX BUY for ×1000 / MAX';
          else hint.textContent = '';
        }
      } else {
        // Drop any stale bulk-mode setting so buying still works if the player somehow picked ×10 before.
        if ((state.settings.buyMode || '1') !== '1') state.settings.buyMode = '1';
      }
    }

    TIERS.forEach((tier) => {
      const row = dom.tiers[tier.id];
      if (!row) return;
      const unlocked = tierUnlocked(tier.id);
      if (!unlocked) return;  // static hint, rebuilt on unlock change
      const rateEl = row.querySelector('[data-rate]');
      if (rateEl) rateEl.textContent = '+' + fmt(runtime.tierRate[tier.id] || 0) + ' ' + tier.resource + '/s';

      row.querySelectorAll('.slot[data-machine]').forEach((slot) => {
        const id = slot.dataset.machine;
        const owned = state.machines[id] || 0;
        const unlocked = machineUnlocked(id);
        const cost = machineCost(id);
        const afford = canAfford(cost);

        slot.querySelector('[data-count]').textContent = '×' + owned;
        let lockedLabel;
        if (activeChallenge() === 'monoculture' && MACHINES[id].slot !== 1) lockedLabel = 'SLOT-1 ONLY';
        else if (MACHINES[id].mk === 'mk4') lockedLabel = 'MK-IV LOCKED';
        else lockedLabel = 'MK-V LOCKED';
        slot.querySelector('[data-cost]').textContent = unlocked
          ? Object.entries(cost).map(([r, a]) => fmt(a) + ' ' + r).join(' · ')
          : lockedLabel;

        slot.classList.toggle('owned', owned > 0);
        slot.classList.toggle('affordable', unlocked && afford);
        slot.classList.toggle('unaffordable', unlocked && !afford);
        slot.classList.toggle('locked', !unlocked);

        const bn = runtime.bottleneck[id];
        slot.classList.toggle('bottlenecked', owned > 0 && !!bn);
        const bnEl = slot.querySelector('[data-bn]');
        if (bnEl) bnEl.title = bn ? 'starved of ' + bn : '';

        const autoOn = !!state.settings.autoBuy[id];
        slot.classList.toggle('auto-buy-on', autoOn && unlocked);
        slot.classList.toggle('show-auto-chip', !!rm().autoBuy && unlocked);
      });
    });
  }

  function renderTreeHeader() {
    if (rpValueEl) rpValueEl.textContent = fmt(state.meta.schematics);
    if (prestigeCountEl) prestigeCountEl.textContent = state.meta.prestigeCount || 0;

    // Prestige panel: only appears on the research page when a prestige is ready
    const canP = canPrestige();
    const gain = canP ? schematicsForPrestige() : 0;
    if (treePrestigeEl) {
      treePrestigeEl.style.display = canP ? '' : 'none';
      if (canP && treePrestigeGainEl) treePrestigeGainEl.textContent = gain;
      if (treePrestigeBtn) treePrestigeBtn.classList.toggle('dim', gain < 1);
    }

    // Tab badge priority:
    //   1. If a prestige is ready, show the gain ("+N") so the player can weigh it
    //      from any screen without switching to the research tab
    //   2. Otherwise, if they have unspent schematics, show that count
    //   3. Otherwise, hide
    if (treeTabBadgeEl) {
      const schem = state.meta.schematics || 0;
      if (canP && gain > 0) {
        treeTabBadgeEl.style.display = '';
        treeTabBadgeEl.textContent = '+' + fmt(gain);
        treeTabBadgeEl.classList.remove('tab-badge-count');
      } else if (schem > 0) {
        treeTabBadgeEl.style.display = '';
        treeTabBadgeEl.textContent = fmt(schem);
        treeTabBadgeEl.classList.add('tab-badge-count');
      } else {
        treeTabBadgeEl.style.display = 'none';
      }
    }

    // Tier-unlock state is part of the rails; render it there.
    if (state.meta.currentTab === 'tree') renderRails();
  }

  function render() {
    const tab = state.meta.currentTab;
    renderResBar();                 // always visible in topbar
    renderTreeHeader();             // updates RESEARCH tab badge + prestige bar
    // Tab-gated renders — no point updating DOM the user can't see.
    if (tab === 'factory') {
      renderFactory();
      renderSidebar();
    }
    if (tab === 'achievements') {
      renderAchievementsSection();
      updateAchievementProgress();
    }
    if (tab === 'stats' && Date.now() - lastStatsRender > 500) {
      renderStats();
      lastStatsRender = Date.now();
    }
    if (tab === 'mastery' && Date.now() - lastMasteryRender > 500) {
      renderMastery();
      lastMasteryRender = Date.now();
    }
    renderOnboarding();
    renderChallengeBanner();
  }
  let lastStatsRender = 0;
  let lastMasteryRender = 0;

  // ---------- MAIN LOOP ----------
  // tick() runs every RAF for smooth number accumulation; render() is
  // throttled to ~15fps since UI updates don't need 60fps on a phone and the
  // constant DOM work was a major heat source. When the tab is hidden we
  // skip rendering entirely (browsers auto-throttle RAF but the extra guard
  // keeps the loop's own work flat).
  let lastFrameAt = performance.now();
  let lastSaveCheck = Date.now();
  let lastRenderAt = 0;
  const RENDER_INTERVAL_MS = 66; // ~15 FPS UI
  function loop(nowPerf) {
    // Tab hidden — skip the rAF-driven tick. The sim-worker heartbeat posts
    // tick messages at 1 Hz from a separate thread and drives the simulation
    // while hidden, so production keeps accumulating. Rendering stays paused
    // (the browser wouldn't paint anyway). applyOffline on visibilitychange
    // stays as a safety net if the browser deep-suspends the worker.
    if (document.visibilityState === 'hidden') {
      lastFrameAt = nowPerf;
      requestAnimationFrame(loop);
      return;
    }
    const dtMs = nowPerf - lastFrameAt;
    lastFrameAt = nowPerf;
    const dt = Math.min(dtMs / 1000, 1/15);
    tick(dt);
    state.lastTickAt = Date.now();
    frameCount++; fpsAccum += dtMs;
    if (fpsAccum >= 500) { fpsDisplay = Math.round((frameCount * 1000) / fpsAccum); frameCount = 0; fpsAccum = 0; }
    if (Date.now() - lastSaveCheck > SAVE_INTERVAL) { lastSaveCheck = Date.now(); save(); }
    checkUnlockChanges();
    checkAchievements();
    // First Prototype — one-time celebrate when the gateway to the Publish
    // meta-loop unlocks. Uses lifetimeProduced to survive mid-run prestige.
    if (!state.meta.firstPrototypeCelebrated && ((state.meta.lifetimeProduced && state.meta.lifetimeProduced.prototype) || 0) >= 1) {
      state.meta.firstPrototypeCelebrated = true;
      celebrate('publish', {
        bannerKind: 'FIRST PROTOTYPE',
        bannerMain: 'THE MASTERWORK',
        bannerSub: 'Publish it in the Mastery tab to earn Patents',
        particles: 110,
      });
      save();
    }
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    if (!hidden && nowPerf - lastRenderAt >= RENDER_INTERVAL_MS) {
      lastRenderAt = nowPerf;
      render();
    }
    requestAnimationFrame(loop);
  }

  // ---------- MODALS ----------
  function showModal(title, body, opts = {}) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    // Confirm buttons for destructive/irreversible actions (reset, prestige, etc.)
    // default to the warn style so they stand out from the neutral close button.
    const confirmClass = opts.confirmClass || 'warn';
    const closeLabel = opts.closeLabel || (opts.confirmLabel ? 'CANCEL' : 'CLOSE');
    bg.innerHTML = `
      <div class="modal">
        <h3>${title}</h3>
        ${body}
        <div class="actions">
          <button class="btn" data-action="close">${closeLabel}</button>
          ${opts.confirmLabel ? `<button class="btn ${confirmClass}" data-action="confirm">${opts.confirmLabel}</button>` : ''}
        </div>
      </div>
    `;
    document.body.appendChild(bg);
    bg.addEventListener('click', (e) => {
      if (e.target === bg || e.target.dataset.action === 'close') { bg.remove(); opts.onClose && opts.onClose(); }
      else if (e.target.dataset.action === 'confirm') { opts.onConfirm && opts.onConfirm(bg); }
    });
    return bg;
  }
  function showWelcomeBack(report) {
    const entries = Object.entries(report.earned);
    const list = entries.length
      ? entries.map(([r, v]) => `<li>${fmt(v)} ${r}</li>`).join('')
      : `<li class="none">No production while you were away.</li>`;
    showModal('◆ WELCOME BACK',
      `<p>You were away for <b>${fmtDuration(report.elapsed)}</b>${report.elapsed >= OFFLINE_CAP_MS - 1000 ? ' (capped at 8h)' : ''}.</p>
       <ul class="earned-list">${list}</ul>`);
    audio.welcome();
  }
  // ---------- SYSTEM ACTIONS (wired from the Settings modal) ----------
  const fsSupported = !!(document.documentElement.requestFullscreen
    || document.documentElement.webkitRequestFullscreen);
  function inFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }
  function toggleFullscreen() {
    const doc = document;
    if (inFullscreen()) {
      if (doc.exitFullscreen) doc.exitFullscreen();
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
    } else {
      const el = doc.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
  }
  function actionExport() {
    state.meta.lastExportAt = Date.now();
    save();
    const code = exportSave();
    const bg = showModal('EXPORT SAVE',
      `<p>Copy this string. Paste it into IMPORT to restore your game.</p>
       <textarea readonly data-export-code>${code}</textarea>
       <div class="export-copy-row">
         <button class="btn" data-action="copy">◆ COPY TO CLIPBOARD</button>
         <span class="export-copy-status" data-copy-status></span>
       </div>`);
    const copyBtn = bg.querySelector('[data-action="copy"]');
    const status = bg.querySelector('[data-copy-status]');
    const textarea = bg.querySelector('[data-export-code]');
    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation(); // the modal-bg listener treats bare clicks as close
      let ok = false;
      // Try modern clipboard API first; it's allowed on a real user gesture in
      // secure contexts. Fall back to execCommand if it throws (insecure origin,
      // permission denied, older browser).
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(code);
          ok = true;
        }
      } catch (_) { /* fall through to legacy path */ }
      if (!ok) {
        try {
          textarea.focus();
          textarea.select();
          ok = document.execCommand && document.execCommand('copy');
          textarea.setSelectionRange(0, 0);
        } catch (_) { ok = false; }
      }
      const okText = 'COPIED ✓';
      const failText = 'COPY FAILED — select + copy manually';
      status.textContent = ok ? okText : failText;
      status.className = 'export-copy-status ' + (ok ? 'ok' : 'warn');
      if (ok && audio.click) audio.click();
      setTimeout(() => {
        if (status.textContent === (ok ? okText : failText)) {
          status.textContent = '';
          status.className = 'export-copy-status';
        }
      }, 2400);
    });
  }
  function actionImport() {
    showModal('IMPORT SAVE',
      `<p>Paste an exported save string. This will overwrite your current progress.</p>
       <textarea placeholder="paste save string..."></textarea>`,
      { confirmLabel: 'IMPORT', onConfirm: (bg) => {
        const code = bg.querySelector('textarea').value;
        if (importSave(code)) {
          bg.remove(); prevUnlockSig = ''; rebuildAll();
          showModal('◆ IMPORT OK', `<p>Save restored.</p>`);
        } else showModal('◆ IMPORT FAILED', `<p>That save string isn't valid.</p>`);
      }});
  }
  function actionReset() {
    showModal('RESET GAME', `<p>Wipe all progress (including Schematics and tree)?</p>`,
      { confirmLabel: 'WIPE', onConfirm: (bg) => { wipe(); bg.remove(); }});
  }

  function bindUI() {
    const setBtn = document.getElementById('btn-settings');
    if (setBtn) setBtn.addEventListener('click', showSettings);

    // Prestige button lives on the RESEARCH page header now, not the factory sidebar
    if (treePrestigeBtn) treePrestigeBtn.addEventListener('click', () => {
      if (!canPrestige()) return;
      const gain = schematicsForPrestige();
      // If an exhibition is active, preview the outcome so players don't
      // accidentally prestige and lose the slot.
      let exhLine = '';
      const ex = activeExhibition();
      if (ex && EXHIBITIONS[ex]) {
        const outcome = evaluateExhibition();
        const ok = outcome === 'won';
        exhLine = `<p style="color:${ok ? '#78e08f' : '#ff7e5f'}">
          <b>Exhibition:</b> ${EXHIBITIONS[ex].name} — ${ok ? '✓ GOAL MET (+1 Legacy Mark)' : '✗ GOAL NOT MET (slot clears)'}
        </p>`;
      }
      showModal('◆ CONFIRM PRESTIGE',
        `<p>Reset this run. You'll earn <b style="color:#ffd670">${gain} Schematics</b>.</p>
         ${exhLine}
         <p>Wiped: resources, machines, supports, auto-buy toggles.</p>
         <p>Kept: Schematics, tree levels, prestige count, Legacy Marks, Archive upgrades.</p>`,
        { confirmLabel: 'PRESTIGE', onConfirm: (bg) => { bg.remove(); doPrestige(); } });
    });
  }

  // ---------- BOOT ----------
  function boot() {
    const loaded = load();
    let offlineReport = null;
    if (loaded) offlineReport = applyOffline();
    else state.lastTickAt = Date.now();
    sessionStartAt = Date.now();

    applyStartupBonuses();
    applyA11yClasses();
    // Watch for OS prefers-reduced-motion changes so "auto" mode stays live.
    if (typeof window !== 'undefined' && window.matchMedia) {
      try {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const onChange = () => applyA11yClasses();
        if (mq.addEventListener) mq.addEventListener('change', onChange);
        else if (mq.addListener) mq.addListener(onChange);
      } catch {}
    }
    // fs-compact (font-scale topbar degradation) depends on viewport width.
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => applyA11yClasses());
    }
    rebuildAll();
    renderBlueprintChip();
    setTab(state.meta.currentTab === 'tree' && treeTabVisible() ? 'tree' : 'factory');
    prevUnlockSig = '';
    bindTabs(); bindUI();
    requestAnimationFrame(loop);

    // v0.9.0 — sim-worker heartbeat. Drives simulation ticks while the tab
    // is hidden so the game actually runs in the background, not just
    // catches up on return. Try/catch because some iframe sandboxes or
    // file:// contexts refuse to construct Workers; we degrade gracefully
    // to the rAF + applyOffline path.
    let simWorker = null;
    if (typeof Worker !== 'undefined') {
      try {
        simWorker = new Worker('sim-worker.js');
        simWorker.onmessage = (e) => {
          if (!e.data || e.data.type !== 'tick') return;
          // Only apply the worker tick while the tab is hidden — when
          // visible, the rAF loop is already running and adding a 1 Hz
          // tick on top would double-count.
          if (document.visibilityState !== 'hidden') return;
          // Enforce the offline cap in background. Without this, a tab left
          // hidden for 24 h would earn 24 h of production while a tab
          // closed for 24 h caps at 8 h (+ patent / legacy bonuses). Match
          // the two so background and closed-tab reward the same amount.
          const capMs = OFFLINE_CAP_MS + (rm().offlineHoursAdd || 0) * 3600 * 1000;
          if (runtime.hiddenTickAppliedMs >= capMs) return;
          const dt = Math.min(Math.max(e.data.dtSec || 0, 0), 5); // clamp 0..5s
          if (dt <= 0) return;
          tick(dt);
          runtime.hiddenTickAppliedMs += dt * 1000;
          state.lastTickAt = Date.now();
          // Let achievements surface on return rather than mid-hidden to
          // avoid firing banners nobody's watching. checkUnlockChanges()
          // mutates DOM — skip while hidden; it'll run on the next visible
          // frame anyway.
        };
        simWorker.onerror = () => { /* worker failed — applyOffline fallback handles it */ };
      } catch (err) {
        // Worker constructor unavailable — no-op, applyOffline picks up the slack.
      }
    }

    window.addEventListener('beforeunload', save);
    // `pagehide` is the reliable lifecycle event on mobile — iOS Safari
    // and Chrome-on-Android frequently fire `pagehide` without ever firing
    // `beforeunload` (e.g. when the user swipes the app away or the OS
    // suspends the tab for memory). Listening to both catches every exit
    // path and closes the worst-case 5-second autosave window down to ~0.
    window.addEventListener('pagehide', save);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        // Start a fresh background-tick budget for the upcoming hidden
        // window. Worker ticks will count against this until it hits the
        // offline cap, at which point they no-op — keeping background-tab
        // gains identical to closed-tab gains.
        runtime.hiddenTickAppliedMs = 0;
        save();
      } else if (document.visibilityState === 'visible') {
        // Tab came back from background. If the sim-worker was ticking, the
        // budget already applied up to the offline cap and state.lastTickAt
        // is recent — applyOffline below sees a tiny dt and no-ops. If the
        // worker was suspended / blocked, applyOffline picks up the slack
        // with its own cap (OFFLINE_CAP_MS minus what the worker did
        // apply, so the two paths can't stack past the cap).
        runtime.suppressAchievementCelebrate = true;
        const remainingBudgetMs = Math.max(
          0,
          (OFFLINE_CAP_MS + (rm().offlineHoursAdd || 0) * 3600 * 1000) - (runtime.hiddenTickAppliedMs || 0)
        );
        const report = applyOffline(remainingBudgetMs);
        lastFrameAt = performance.now();
        if (report && report.elapsed >= OFFLINE_REPORT_MS) {
          log(`Welcome back — away ${fmtDuration(report.elapsed)}`);
          setTimeout(() => showWelcomeBack(report), 400);
        }
        // Reset the budget so rAF-driven visible ticks aren't affected by
        // the stale counter on the next hidden window.
        runtime.hiddenTickAppliedMs = 0;
        setTimeout(() => { runtime.suppressAchievementCelebrate = false; }, 1500);
      }
    });

    if (offlineReport && offlineReport.elapsed >= OFFLINE_REPORT_MS) {
      log(`Welcome back — away ${fmtDuration(offlineReport.elapsed)}`);
      setTimeout(() => showWelcomeBack(offlineReport), 400);
    }

    // Allow achievement banners once the initial catchup checkAchievements()
    // pass is out of the way. Small delay so any achievements awarded during
    // applyOffline's tick-replay are processed without a banner storm.
    setTimeout(() => { runtime.suppressAchievementCelebrate = false; }, 1500);

    // v0.9.5 — ask the browser to mark our storage as persistent so it
    // isn't evicted under low-storage pressure. Huge on iOS Safari, which
    // otherwise evicts localStorage / IndexedDB from sites the user hasn't
    // visited in ~7 days. Desktop Chrome grants it based on engagement
    // heuristics (PWA install, bookmark, etc.) without prompting. Best-
    // effort — if the API is missing or the browser says no, we fall back
    // to the old behaviour (which was already the only behaviour we had).
    try {
      if (navigator && navigator.storage && typeof navigator.storage.persist === 'function') {
        navigator.storage.persist().then((granted) => {
          if (!granted) console.log('[blueprint] persistent storage not granted — save may be evicted under pressure');
        }).catch(() => {});
      }
    } catch {}

    // If load() recovered from the backup slot because the primary save
    // was unreadable, tell the player once the toast system is up. This
    // also clears the flag so a subsequent tab-switch doesn't re-raise it.
    if (runtime.saveRecoveredFromBackup) {
      runtime.saveRecoveredFromBackup = false;
      setTimeout(() => {
        toast('<b>Save recovered from backup.</b><br>Your last ~60 seconds of progress may have been rolled back — the primary save slot was unreadable.', { duration: 9000, kind: 'warn' });
      }, 1200);
    }

    // First-play heads-up: saves live in this browser's localStorage.
    // People routinely lose progress by switching between the itch.io
    // embed and the GitHub Pages build (different origin = different
    // bucket) or by clearing cookies. This is a one-shot hint — hint()
    // records the id in state.settings.hintsShown so it never repeats.
    // Delayed so it appears after the initial paint and doesn't compete
    // with the onboarding bubble on a truly fresh install.
    setTimeout(() => {
      hint('save_location_v095',
        '<b>Your save lives in this browser.</b><br>' +
        'Switching browsers, devices, or clearing cookies will wipe progress. ' +
        'Use <b>Settings → Export</b> to back it up.');
    }, 3500);

    // Service worker — enables installable PWA + offline play. Registered
    // only when running from http(s); file:// and about:blank are skipped so
    // local-file opens don't spam the console.
    // service worker stripped for iframe embed

    console.log('[blueprint] v' + VERSION + ' · redesigned prestige tree · loaded=' + loaded);
  }
  boot();
})();
