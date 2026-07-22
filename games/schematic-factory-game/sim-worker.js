/* Blueprint — simulation heartbeat worker.
 *
 * When the main tab is hidden, browsers throttle rAF / setInterval to ~1 Hz
 * (or pause them entirely), which previously paused the game's tick loop.
 * A Web Worker runs on its own thread, independent of the main tab's
 * visibility throttling, so it can keep a reliable clock even when the tab
 * is backgrounded.
 *
 * This worker does the minimum useful thing: post a tick message every
 * second with the wall-clock delta since the last post. The main thread's
 * message handler processes the tick only when the tab is actually hidden
 * (rAF handles it at full speed when visible), so the worker is effectively
 * a background-only heartbeat.
 *
 * Keeping simulation state on the main thread (rather than moving it into
 * the worker) avoids a massive refactor of every buy / prestige / publish
 * path. The cost is that the background tick rate is capped at 1 Hz instead
 * of matching rAF's 60 Hz — fine for an incremental game where production
 * rates are continuous and event triggers are coarse-grained.
 */
const INTERVAL_MS = 1000;
let lastPostAt = performance.now();

setInterval(() => {
  const now = performance.now();
  const dtSec = (now - lastPostAt) / 1000;
  lastPostAt = now;
  self.postMessage({ type: 'tick', dtSec });
}, INTERVAL_MS);
