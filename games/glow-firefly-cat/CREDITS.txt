# Nyx Felis & Lampyris

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub commit activity](https://img.shields.io/github/commit-activity/t/aftongauntlett/js13k-2025)](https://github.com/aftongauntlett/js13k-2025/commits/main)
[![js13k](https://img.shields.io/badge/js13k-2025-orange.svg)](https://js13kgames.com/)
[![Submission](https://img.shields.io/badge/submission-12.5KB-brightgreen.svg)](#)
[![Enhanced](https://img.shields.io/badge/enhanced-22KB-blue.svg)](#)

A timing-based firefly collector built in vanilla JavaScript for js13kGames 2025. Guide fireflies, master shield timing, and keep Nyx Felis curious long enough to survive the night.

**Tech Stack**: Vanilla JS • Canvas 2D • Web Audio API • Roadroller • Firebase

**[JS13k 2025 Official Entry](https://js13kgames.com/2025/games/nyx-felis-and-lampyris)** 

*See also: [Orbital Order](https://github.com/aftongauntlett/js13k-demo) - the demo game I built as practice.*

## Motivation

JS13k's strict size constraints force decisions and keep scope tight. I wanted to build a small game and finish it.

The theme was **Black Cats**, which made me happy because I love cats. Fireflies were already on my mind from evening walks, so the pairing came naturally. The goal was calm, cozy, a little mysterious. And particles.

The game shifted from a "cozy screensaver" to something with structure when I added the curiosity bar and shield mechanic. Constraints forced choices and kept ideas from sprawling.

## Game Overview

**Core Loop**: Summon fireflies, collect them, shield at the right moment to evolve them, then deliver to keep Nyx Felis curious. Evolution chain progresses through four tiers: Green → Purple → Gold → Rainbow. Perfect shield timing on the third warning flash grants 100% evolution and protection. Survive for 3 minutes to win.

## Architecture

**Stack**: Vanilla JavaScript organized into modular systems for rendering, audio, timing, and state management. Compressed to 12.5KB for competition, 22KB for enhanced version.

### Core Systems

- **Rendering**: Canvas 2D with composite operations (`lighter`, `screen`) for glow effects without shaders
- **Audio**: Procedural Web Audio (oscillators, filters, envelopes) for all sounds and background music
- **Timing**: Frame-based shield mechanics with three-phase warning system
- **Particles**: Lightweight pooled system for trails, explosions, and glow effects
- **Cat Rendering**: Procedural face with reactive eyes, whiskers, and proximity-based animations

### Technical Decisions

**Canvas 2D over WebGL**: Gradients and composite operations created glow effects without shaders. Performance stayed at 60fps with hundreds of particles.

**Procedural Audio**: All sounds generated with Web Audio. No audio files means more space for code.

**Frame-Based Timing**: `requestAnimationFrame` loop with frame counters for predictable, repeatable shield windows.

**State Caching**: Canvas properties cached to minimize redundant API calls during particle rendering.

### Build & Compression

Four-stage pipeline: Terser → Roadroller → inline script → ZIP. Roadroller reduced minified JS by ~40%. Variable aliasing (`Math.sin` → `sin`) and selective font loading kept size under 13KB.

```bash
npm install        # Install dependencies
npm start          # Start dev server (http://localhost:8000)
npm run build      # Full build pipeline
npm run size       # Check against 13,312 byte limit
```

## UX & Accessibility

- **Three-flash warning system**: Third flash signals optimal shield moment
- **Color-coded evolution**: Green → Purple → Gold → Rainbow with distinct glows
- **Keyboard shortcuts**: Space (shield), X (drop), Esc (help), M (audio), L (leaderboard)
- **Task-based tutorial**: Learn by doing, not reading
- **Responsive feedback**: Score popups, shield outlines, particle bursts confirm actions
- **60fps target**: Maintained with hundreds of particles on modern hardware

## Challenges & Lessons Learned

**Timing Clarity**: Changed shield cues so the third flash signals action moment. Some players initially confused warning flashes with attacks.

**Canvas Tricks**: `globalCompositeOperation = 'lighter'` + layered gradients + shadow blur created WebGL-like glow. Several people thought it was shader-based.

**Constraints Ship Games**: 13KB limit forced cuts. Features that didn't serve the core loop were eliminated. This kept scope manageable.

**UX > Features**: Clarifying shield timing improved gameplay more than adding mechanics.

**Missed Deadline**: Mixed up CST and CT. Finished enhanced version anyway. Learned to keep scope tight and move on.

## Next Steps

- Try Unity for future game projects
- Potentially rebuild one of these js13kGames concepts
- Stars and sparkles will probably show up

## License

MIT License. Built by [Afton Gauntlett](https://www.aftongauntlett.com/).
