#!/usr/bin/env node
/**
 * assert-places-3d-quality.mjs - PUBLISH GATE for /places-3d terrain assets.
 *
 * WHY THIS EXISTS (2026-08-29). The first 9 migrated places all built green, the
 * render probe passed on every one, and three separate defects still reached
 * production - because every existing check asked "did it render?" and none asked
 * "is what it rendered any good?":
 *
 *   RC-B  mount-everest texture 77.9% pure black, lake-baikal 59.4% - Sentinel-2
 *         swath-edge granules. Scene selection trusted the granule STAC bbox.
 *   RC-C  iguazu-falls 52 garbage DEM samples (0.003%) pulled min to -9897 m,
 *         compressing 177 m of real relief into 1.7% of the mesh range: a FLAT
 *         PLATE shipped. amazon-rainforest the same at 10%.
 *   RC-D  Sentinel-2 TCI carries no display stretch, so vegetated/high-latitude
 *         scenes shipped at mean luminance 22-40/255 vs 84 for a bright desert.
 *
 * The builder now prevents all three, but a prevention with no gate behind it is
 * one refactor away from regressing silently. This asserts the OUTPUT.
 *
 * TWO MODES - and the second one exists because of a mistake this file made on the
 * day it was written (2026-08-29). Wired as a hard fail between build and publish,
 * its first real failure skipped the `deploy` job, so the last successful publish
 * was GitHub's built-in branch-deploy of the git tree - which contains none of the
 * built asset trees. Result: places-3d AND space-3d AND retro-fps manifests all
 * 404'd. A places-3d quality problem must never take the whole CDN down; that is
 * this repo's own documented failure shape ("blocking on pre-existing debt stops
 * every lane at once, which is how a well-meant gate becomes an outage").
 *
 *   node places-3d/assert-places-3d-quality.mjs out/places-3d
 *     ASSERT mode. Exit 0 = all publishable, 1 = at least one FAIL. For local use.
 *
 *   node places-3d/assert-places-3d-quality.mjs out/places-3d --quarantine
 *     CI mode. Failing asset dirs are MOVED to out/places-3d-quarantine/ so the
 *     good ones still publish, the manifest is regenerated without them, and a
 *     marker file records what was pulled. ALWAYS exits 0 so the deploy proceeds.
 *     A later CI step reads the marker and fails the workflow AFTER publishing, so
 *     the signal is kept without an outage. A quarantined place simply finds no
 *     asset in the manifest and keeps its procedural scene - the designed fallback.
 *
 * Env overrides: PLACES_GATE_MIN_FILLED, PLACES_GATE_MIN_LUM,
 *                PLACES_GATE_MAX_DESPIKE_PCT, PLACES_GATE_MIN_RELIEF_FRAC.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import url from "node:url";

const args = process.argv.slice(2);
const QUARANTINE = args.includes("--quarantine");
const OUT = path.resolve(args.find((a) => !a.startsWith("--")) || "out/places-3d");
const MIN_FILLED = Number(process.env.PLACES_GATE_MIN_FILLED || 0.98);
const MIN_LUM = Number(process.env.PLACES_GATE_MIN_LUM || 55);
const MAX_DESPIKE_PCT = Number(process.env.PLACES_GATE_MAX_DESPIKE_PCT || 0.5);
// A place whose robust relief is a tiny slice of its min..max range is the
// flat-plate defect: the viewer normalises by (h-min)/(max-min), so this ratio IS
// the fraction of the mesh height range that real terrain gets to use.
const MIN_RELIEF_FRAC = Number(process.env.PLACES_GATE_MIN_RELIEF_FRAC || 0.5);

function readHeights(dir, grid) {
  const p = path.join(dir, "heights.bin");
  const buf = fs.readFileSync(p);
  const a = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
  if (grid && a.length !== grid.width_px * grid.height_px) {
    return { err: `heights.bin has ${a.length} samples, descriptor says ${grid.width_px}x${grid.height_px}=${grid.width_px * grid.height_px}` };
  }
  return { a };
}

const slugs = fs.existsSync(OUT)
  ? fs.readdirSync(OUT, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(OUT, d.name, "descriptor.json"))).map((d) => d.name).sort()
  : [];

if (!slugs.length) {
  console.error(`[places-3d-gate] FATAL: no <slug>/descriptor.json under ${OUT}`);
  process.exit(1);
}

let fails = 0, warns = 0;
const failed = [];
console.log(`[places-3d-gate] ${slugs.length} asset(s) | filled>=${(MIN_FILLED * 100).toFixed(0)}% lum>=${MIN_LUM} despike<=${MAX_DESPIKE_PCT}% relief>=${(MIN_RELIEF_FRAC * 100).toFixed(0)}%`);

for (const slug of slugs) {
  const dir = path.join(OUT, slug);
  const d = JSON.parse(fs.readFileSync(path.join(dir, "descriptor.json"), "utf8"));
  const g = d.grid || {};
  const problems = [], notes = [];

  // --- DEM: despike volume + relief usable fraction (RC-C) -------------------
  const { a, err } = readHeights(dir, g);
  if (err) problems.push(err);
  else {
    const despikePct = (g.despiked_samples || 0) / a.length * 100;
    if (despikePct > MAX_DESPIKE_PCT) {
      problems.push(`despiked ${g.despiked_samples} samples = ${despikePct.toFixed(3)}% > ${MAX_DESPIKE_PCT}% - the DEM window is not just spiky, it is wrong (check bbox / dem_zoom)`);
    }
    const sorted = Int16Array.from(a).sort();
    const at = (q) => sorted[Math.floor(q * (sorted.length - 1))];
    const robust = at(0.995) - at(0.005);
    const span = (g.max_h_m ?? at(1)) - (g.min_h_m ?? at(0));
    const frac = span > 0 ? robust / span : 0;
    if (frac < MIN_RELIEF_FRAC) {
      problems.push(`FLAT-PLATE RISK: robust relief ${robust} m is only ${(frac * 100).toFixed(1)}% of the ${span} m min..max span - outliers still dominate the normalisation`);
    }
    if (robust < 25) notes.push(`very low relief (${robust} m robust) - genuinely flat place; BODYWELCOME must say so`);
  }

  // --- Texture: filled fraction + display luminance (RC-B, RC-D) ------------
  const t = d.texture;
  if (!t) {
    notes.push("texture:null - hypsometric fallback (acceptable; page must not claim satellite imagery)");
  } else {
    if (!fs.existsSync(path.join(dir, "texture.jpg"))) problems.push("descriptor lists a texture but texture.jpg is missing");
    if (t.filled_frac === undefined) {
      problems.push("texture has no filled_frac - built by a pre-2026-08-29 pipeline that could not detect swath-edge nodata; rebuild");
    } else if (t.filled_frac < MIN_FILLED) {
      problems.push(`texture only ${(t.filled_frac * 100).toFixed(1)}% filled (< ${(MIN_FILLED * 100).toFixed(0)}%) - swath-edge nodata would render as black holes`);
    }
    if (t.mean_luminance === undefined) {
      problems.push("texture has no mean_luminance - pre-2026-08-29 pipeline, no display stretch applied; rebuild");
    } else if (t.mean_luminance < MIN_LUM) {
      problems.push(`texture mean luminance ${t.mean_luminance} < ${MIN_LUM} - too dark to read on screen even after stretch; pick a different season or set texture:null`);
    }
  }

  const status = problems.length ? "FAIL" : (notes.length ? "PASS*" : "PASS");
  if (problems.length) { fails += 1; failed.push({ slug, problems }); }
  if (notes.length) warns += 1;
  console.log(`  ${status.padEnd(5)} ${slug}` +
    (t ? ` tex filled=${t.filled_frac !== undefined ? (t.filled_frac * 100).toFixed(1) + "%" : "?"} lum=${t.mean_luminance ?? "?"}` : " tex=null") +
    ` despiked=${g.despiked_samples ?? "?"}`);
  for (const p of problems) console.log(`        FAIL: ${p}`);
  for (const n of notes) console.log(`        note: ${n}`);
}

console.log(`[places-3d-gate] ${slugs.length - fails}/${slugs.length} publishable, ${fails} FAIL, ${warns} with notes`);

const MARKER = path.join(path.dirname(OUT), "places-3d-quarantined.json");
fs.rmSync(MARKER, { force: true });

if (!fails) process.exit(0);

if (!QUARANTINE) {
  console.error("[places-3d-gate] REFUSING publish - fix the builder inputs (bbox / dem_zoom / cloud_lt / season) and rebuild. Do NOT relax the thresholds to get green.");
  process.exit(1);
}

// CI mode: pull the bad assets out, keep publishing the good ones.
const QDIR = path.join(path.dirname(OUT), "places-3d-quarantine");
fs.mkdirSync(QDIR, { recursive: true });
for (const { slug } of failed) {
  const from = path.join(OUT, slug), to = path.join(QDIR, slug);
  fs.rmSync(to, { recursive: true, force: true });
  fs.renameSync(from, to);
  console.log(`[places-3d-gate] QUARANTINED ${slug} -> ${path.relative(process.cwd(), to)} (not published)`);
}
// Regenerate the manifest so it lists only what actually ships. The maker exits
// non-zero when NO asset dir remains, which is a legitimate state here.
const maker = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "make-places-3d-manifest.mjs");
const remaining = fs.readdirSync(OUT, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(OUT, d.name, "descriptor.json")));
if (remaining.length) {
  execFileSync("node", [maker, OUT], { stdio: "inherit" });
} else {
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({ schema: "ftol-places-3d/1", version: "quarantined", assets: {} }, null, 2) + "\n");
  console.log("[places-3d-gate] every asset quarantined - wrote an empty manifest (all pages keep their procedural scenes)");
}
fs.writeFileSync(MARKER, JSON.stringify({ quarantined_iso: new Date().toISOString(), count: failed.length, assets: failed }, null, 2) + "\n");
console.log(`[places-3d-gate] marker: ${MARKER}`);
console.log("[places-3d-gate] deploy PROCEEDS with the passing assets; a later CI step fails this workflow so the signal is not lost.");
process.exit(0);
