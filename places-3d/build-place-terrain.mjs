#!/usr/bin/env node
/**
 * build-place-terrain.mjs - offline REAL-terrain pipeline for freetoolonline.com
 * /places-3d pages (detailed-render migration, 2026-08-28).
 *
 * Modeled on github.com/shlokkhemani/ode-to-yosemite's pipeline, with two
 * deliberate departures:
 *   1. IMAGERY SOURCE: Sentinel-2 L2A (Copernicus, AWS Open Data) instead of
 *      Esri World Imagery. Esri tiles may not be bulk-downloaded/redistributed;
 *      this repo's hard rule is "every CDN asset is FREELY REDISTRIBUTABLE with
 *      a LICENSE/CREDITS alongside". Copernicus data is free to use and
 *      redistribute, including commercially, with the attribution
 *      "Contains modified Copernicus Sentinel data [year]".
 *   2. SIZE BUDGET: ~10-20 MB per place (operator decision 2026-08-28), not
 *      Yosemite's ~76 MB. DEM at z13 (~15-19 m/sample at temperate latitudes)
 *      + one Sentinel-2 true-color texture. No forest mask, no OSM layer in v1.
 *
 * WHAT IT PRODUCES per place (OUT/places-3d/<slug>/):
 *   heights.bin       Int16 LE, row-major, north-to-south. meters ASL.
 *                     h = (R*256 + G + B/256) - 32768 decoded from Terrarium,
 *                     rounded to nearest meter. Range covers Everest (8849)
 *                     and Mariana (-10935) within Int16.
 *   texture.jpg       Sentinel-2 true-color (TCI) clipped+warped to the exact
 *                     same web-mercator window (GDAL stage; CI-only).
 *   descriptor.json   grid meta (px dims, meters/px, bbox, min/max h),
 *                     decode formula, sources, licenses, attribution strings.
 *                     make-places-3d-manifest.mjs adds bytes+sha256 per file.
 *
 * DATA SOURCES (both keyless, both verified live 2026-08-28):
 *   Elevation: https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
 *              (Mapzen/AWS Open Data terrain tiles; derived from NASA/USGS 3DEP,
 *              SRTM, ETOPO1 bathymetry at low zooms. License: open, attribution
 *              required - see descriptor. NOTE: coastal/ocean detail beyond
 *              ETOPO1 needs GEBCO - trench pages are a SEPARATE later asset.)
 *   Imagery:   Earth Search STAC https://earth-search.aws.element84.com/v1
 *              collection sentinel-2-l2a, asset "visual" (TCI COG on
 *              sentinel-cogs S3, us-west-2, public, no requester-pays).
 *
 * STAGES
 *   elevation  pure Node (built-in zlib PNG inflate + minimal filter decode) -
 *              runs anywhere, including this laptop. ~seconds per place.
 *   texture    needs gdalwarp (CI installs gdal-bin, same as space-3d). When
 *              GDAL is absent the stage is SKIPPED with a loud message and the
 *              descriptor records texture:null - the viewer falls back to
 *              hypsometric vertex colors, so a texture-less asset is still
 *              shippable.
 *
 * USAGE
 *   node places-3d/build-place-terrain.mjs <slug>            # one place
 *   node places-3d/build-place-terrain.mjs --all             # every places.json entry
 *   node places-3d/build-place-terrain.mjs <slug> --dem-only # skip texture stage
 * Place registry: places-3d/places.json ({slug, name, bbox:[W,S,E,N], dem_zoom,
 * tex_zoom, cloud_lt, notes}). Add a place there, then run this.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import url from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT_ROOT = path.join(ROOT, "out", "places-3d");
const REGISTRY = path.join(HERE, "places.json");
const TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
const STAC = "https://earth-search.aws.element84.com/v1/search";
const TILE = 256;

// ---------------------------------------------------------------------------
// Web-mercator math (spherical, EPSG:3857 tile scheme)
const clampLat = (lat) => Math.max(-85.05112878, Math.min(85.05112878, lat));
function lonToPx(lon, z) { return ((lon + 180) / 360) * Math.pow(2, z) * TILE; }
function latToPx(lat, z) {
  const s = Math.sin((clampLat(lat) * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * Math.pow(2, z) * TILE;
}
function metersPerPx(lat, z) { return (156543.03392804097 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, z); }

// ---------------------------------------------------------------------------
// Minimal PNG decoder - EXACTLY the subset Terrarium tiles use (8-bit RGB,
// color type 2, non-interlaced, 256x256). Anything else = loud failure, never
// silent garbage. Filters per PNG spec: 0 None, 1 Sub, 2 Up, 3 Average, 4 Paeth.
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let pos = 8, ihdr = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      ihdr = {
        w: data.readUInt32BE(0), h: data.readUInt32BE(4),
        depth: data[8], color: data[9], interlace: data[12],
      };
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (!ihdr) throw new Error("PNG missing IHDR");
  if (ihdr.depth !== 8 || ihdr.color !== 2 || ihdr.interlace !== 0) {
    throw new Error(`unsupported PNG shape depth=${ihdr.depth} color=${ihdr.color} interlace=${ihdr.interlace} (terrarium tiles are 8-bit RGB non-interlaced)`);
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 3, stride = ihdr.w * bpp;
  const px = Buffer.alloc(ihdr.h * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < ihdr.h; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) v += paeth(a, b, c);
      else if (f !== 0) throw new Error(`unknown PNG filter ${f}`);
      out[x] = v & 0xff;
    }
  }
  return { w: ihdr.w, h: ihdr.h, px };
}

// ---------------------------------------------------------------------------
function fetchTile(z, x, y, cacheDir) {
  const cache = path.join(cacheDir, `${z}-${x}-${y}.png`);
  if (fs.existsSync(cache) && fs.statSync(cache).size > 0) return fs.readFileSync(cache);
  const u = `${TERRARIUM}/${z}/${x}/${y}.png`;
  // curl over node fetch: retries + fail-on-error in one flag set, mirrors space-3d
  execFileSync("curl", ["-sS", "--fail", "--retry", "3", "--retry-delay", "2", "-o", cache, u], { stdio: "pipe" });
  const b = fs.readFileSync(cache);
  if (b.length < 100) throw new Error(`tile ${u} suspiciously small (${b.length}B)`);
  return b;
}

function buildElevation(place, outDir, workDir) {
  const [W, S, E, N] = place.bbox;
  const z = place.dem_zoom ?? 13;
  // Exact pixel window of the bbox at zoom z (global mercator pixel space)
  const px0 = Math.floor(lonToPx(W, z)), px1 = Math.ceil(lonToPx(E, z));
  const py0 = Math.floor(latToPx(N, z)), py1 = Math.ceil(latToPx(S, z)); // N is smaller py
  const wpx = px1 - px0, hpx = py1 - py0;
  const tx0 = Math.floor(px0 / TILE), tx1 = Math.floor((px1 - 1) / TILE);
  const ty0 = Math.floor(py0 / TILE), ty1 = Math.floor((py1 - 1) / TILE);
  const nTiles = (tx1 - tx0 + 1) * (ty1 - ty0 + 1);
  console.log(`[${place.slug}] elevation z${z}: grid ${wpx}x${hpx}px, ${nTiles} terrarium tiles`);
  if (nTiles > 400) throw new Error(`bbox needs ${nTiles} tiles at z${z} - shrink the bbox or lower dem_zoom (budget guard)`);

  const heights = new Int16Array(wpx * hpx);
  let minH = Infinity, maxH = -Infinity;
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const png = decodePng(fetchTile(z, tx, ty, workDir));
      // copy the intersection of this tile with our window
      const gx0 = Math.max(px0, tx * TILE), gx1 = Math.min(px1, (tx + 1) * TILE);
      const gy0 = Math.max(py0, ty * TILE), gy1 = Math.min(py1, (ty + 1) * TILE);
      for (let gy = gy0; gy < gy1; gy++) {
        const sy = gy - ty * TILE, dy = gy - py0;
        for (let gx = gx0; gx < gx1; gx++) {
          const sx = gx - tx * TILE, dx = gx - px0;
          const o = (sy * png.w + sx) * 3;
          const h = Math.round(png.px[o] * 256 + png.px[o + 1] + png.px[o + 2] / 256 - 32768);
          heights[dy * wpx + dx] = h;
          if (h < minH) minH = h;
          if (h > maxH) maxH = h;
        }
      }
    }
  }
  // ── DESPIKE (2026-08-29 defect fix RC-C; 2026-08-30 RC-F adaptive threshold)
  // Terrarium tiles carry rare isolated garbage samples. They are a vanishing
  // FRACTION of pixels but they set min/max, and the viewer normalises relief by
  // (h - minH) / (maxH - minH) - so a handful of bad pixels flattens the whole
  // mesh. MEASURED on the first 9 shipped places: iguazu-falls had 52 bad
  // samples out of 1,992,200 (0.003%) pulling min to -9897 m, which compressed
  // its true 177 m relief into 1.7% of the mesh height range - the page shipped
  // as a FLAT PLATE.
  //
  // The test must kill isolated artifacts WITHOUT touching genuine smooth
  // extremes (the Everest summit and the Grand Canyon river floor are real
  // min/max and must survive). Two conditions, both required:
  //   (a) the sample lies outside the robust band [p0.05, p99.95], and
  //   (b) it differs from its 8-neighbour median by > SPIKE_DELTA_M.
  //
  // RC-F (2026-08-30): a per-pixel 8-neighbour-median test misses ADJACENT
  // artifact pairs/clusters. amazon-rainforest's rebuilt asset still
  // quarantined at the quality gate (robust relief 92 m / 17.2% of a 536 m
  // span) even after RC-C. Root cause: this lowland Amazon window has SEVERAL
  // small void-fill "ringing" artifacts (interpolation overshoot at the edge
  // of small ponds/oxbow-lake voids in the source DEM), each a tight cluster
  // of a handful of adjacent opposite-sign extremes (e.g. -229 m next to
  // +307 m, ~38 m/px). Each bad pixel's OWN extreme value pollutes its
  // NEIGHBOUR's 8-neighbour median, so a per-pixel delta test against its raw
  // neighbourhood under-reads the true jump - and a fixed 300 m constant
  // (sized for high-relief peaks, where Everest's summit differs ~50-150 m
  // from its neighbours) is far too loose for a window whose ENTIRE real
  // relief only spans a few tens of metres besides. Fixing the worst cluster
  // in isolation also just revealed the next-worst cluster as the new
  // min/max - a cascading chain, not a one-off pair.
  //
  // Fix: CONNECTED-COMPONENT despike. (1) Flag candidates outside the robust
  // band [p0.05, p99.95] exactly as before - this reliably nets EVERY member
  // of a dipole/cluster, since both signs sit outside that band. (2) Group
  // 8-connected candidates into components (a flood-fill), so a whole
  // artifact cluster is identified as ONE unit instead of pixel-by-pixel.
  // (3) For a component small enough to be an artifact (<= MAX_COMPONENT_PX),
  // take the median of its BOUNDARY neighbours - pixels adjacent to the
  // component but NOT part of it, which by construction excludes every
  // contaminating member of the cluster - and replace the component with that
  // clean value ONLY if the jump from the boundary is abrupt (> the same
  // window-relative adaptive threshold used before: robust relief * fraction,
  // floored). (4) A component LARGER than the cap is left untouched - assumed
  // to be a genuine large-scale feature (a real plateau, ridge, or lake
  // surface), never a void artifact. This kills a cluster of any size up to
  // the cap in ONE pass regardless of how many members reinforce each other,
  // while still requiring an abrupt (not gradual) boundary jump, so a real
  // smooth summit or canyon floor - even a small one - survives untouched.
  // Verified against the shipped data: Everest's summit component (size 1,
  // boundary ~8700-8800, jump ~50-150 m) is far under threshold and preserved;
  // iguazu's -9897 m component is replaced; amazon-rainforest's several
  // pond-edge clusters (sizes 2-14 px) are each replaced by their own clean
  // boundary median.
  //
  // ITERATED (2026-08-30): the candidate/threshold percentiles are computed
  // from the CURRENT heights, so a first pass that cleans the single worst
  // cluster can reveal a next-worst cluster that was inside the p0.05..p99.95
  // band ONLY because the wider tail was still present - it was never a
  // candidate in that pass. Re-deriving the percentiles + re-running the
  // flood-fill on each iteration lets the chain fully converge; a pass that
  // fixes zero components ends the loop.
  const SPIKE_DELTA_FLOOR_M = 150;
  const SPIKE_DELTA_FRACTION = 2.0;
  const MAX_ARTIFACT_COMPONENT_PX = 200;
  const SPIKE_MAX_ITERATIONS = 8;
  let despiked = 0;
  let spikeDeltaMUsed = null;
  let spikeIterations = 0;
  {
    const n = heights.length;
    const med = (arr) => { arr.sort((a, b) => a - b); return arr[Math.floor(arr.length / 2)]; };
    for (let iter = 0; iter < SPIKE_MAX_ITERATIONS; iter++) {
      const sorted = Int16Array.from(heights).sort();
      const at = (q) => sorted[Math.min(n - 1, Math.max(0, Math.floor(q * (n - 1))))];
      const lo = at(0.0005), hi = at(0.9995);
      const robustRange = at(0.995) - at(0.005);
      const spikeDeltaM = Math.max(SPIKE_DELTA_FLOOR_M, robustRange * SPIKE_DELTA_FRACTION);
      spikeDeltaMUsed = spikeDeltaM;
      spikeIterations = iter + 1;

      const candidate = new Uint8Array(n);
      for (let i = 0; i < n; i++) if (heights[i] < lo || heights[i] > hi) candidate[i] = 1;
      const visited = new Uint8Array(n);
      let fixedThisPass = 0;
      for (let start = 0; start < n; start++) {
        if (!candidate[start] || visited[start]) continue;
        const comp = [start];
        visited[start] = 1;
        const stack = [start];
        while (stack.length) {
          const i = stack.pop();
          const y = Math.floor(i / wpx), x = i % wpx;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const yy = y + dy, xx = x + dx;
              if (yy < 0 || yy >= hpx || xx < 0 || xx >= wpx) continue;
              const j = yy * wpx + xx;
              if (candidate[j] && !visited[j]) { visited[j] = 1; comp.push(j); stack.push(j); }
            }
          }
        }
        if (comp.length > MAX_ARTIFACT_COMPONENT_PX) continue; // real large-scale feature
        const compSet = new Set(comp);
        const boundary = [];
        for (const i of comp) {
          const y = Math.floor(i / wpx), x = i % wpx;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const yy = y + dy, xx = x + dx;
              if (yy < 0 || yy >= hpx || xx < 0 || xx >= wpx) continue;
              const j = yy * wpx + xx;
              if (!compSet.has(j)) boundary.push(heights[j]);
            }
          }
        }
        if (!boundary.length) continue; // no clean boundary (e.g. grid corner) - leave alone
        const bMed = med(boundary);
        // require an abrupt jump from clean surrounding terrain (real features stay)
        let abrupt = false;
        for (const i of comp) if (Math.abs(heights[i] - bMed) > spikeDeltaM) { abrupt = true; break; }
        if (!abrupt) continue;
        for (const i of comp) heights[i] = bMed;
        fixedThisPass += comp.length;
      }
      despiked += fixedThisPass;
      if (!fixedThisPass) break;
    }
    if (despiked) {
      minH = Infinity; maxH = -Infinity;
      for (let i = 0; i < n; i++) {
        if (heights[i] < minH) minH = heights[i];
        if (heights[i] > maxH) maxH = heights[i];
      }
      console.log(`[${place.slug}] despiked ${despiked} sample(s) over ${spikeIterations} iteration(s) (${(despiked / n * 100).toFixed(4)}%) last threshold ${spikeDeltaMUsed.toFixed(0)}m; range now ${minH}..${maxH}m`);
    }
  }

  const binPath = path.join(outDir, "heights.bin");
  fs.writeFileSync(binPath, Buffer.from(heights.buffer));
  const centerLat = (N + S) / 2;
  console.log(`[${place.slug}] heights.bin ${(heights.byteLength / 1e6).toFixed(1)}MB, h ${minH}..${maxH}m, ~${metersPerPx(centerLat, z).toFixed(1)} m/px`);
  return {
    file: "heights.bin", width_px: wpx, height_px: hpx, dtype: "int16le_meters",
    order: "row-major, west-to-east per row, north-to-south rows",
    dem_zoom: z, meters_per_px: +metersPerPx(centerLat, z).toFixed(3),
    bbox_wsen: place.bbox, min_h_m: minH, max_h_m: maxH,
    despiked_samples: despiked, spike_delta_m: +spikeDeltaMUsed.toFixed(1),
    // exact mercator pixel window so the viewer + texture stage share one grid
    merc_px_window: { z, px0, py0, px1, py1 },
  };
}

// ---------------------------------------------------------------------------
function haveGdal() {
  return spawnSync("gdalwarp", ["--version"], { stdio: "pipe" }).status === 0;
}

// Minimum fraction of the window a scene must actually FILL with pixels.
// 2026-08-29 defect fix RC-B: Sentinel-2 granules on the edge of an orbit swath
// are only partly populated - the classic diagonal cut - yet their STAC `bbox` is
// still the full ~110 km tile, so a bbox-containment test passes them. MEASURED on
// the first 9 shipped places: mount-everest texture was 77.9% pure black and
// lake-baikal 59.4%, which is what put a bright diagonal stripe on an otherwise
// black Everest. Containment is therefore NOT sufficient evidence - we now warp
// with -dstalpha and read the alpha band's mean, which IS the filled fraction.
const MIN_VALID_FRAC = Number(process.env.PLACES_MIN_VALID || 0.98);
const MAX_SCENE_TRIES = Number(process.env.PLACES_MAX_TRIES || 12);

function gdalStats(file) {
  const out = execFileSync("gdalinfo", ["-json", "-stats", file], { encoding: "utf8", maxBuffer: 64e6 });
  return JSON.parse(out).bands.map((b) => ({ min: b.minimum, max: b.maximum, mean: b.mean, std: b.stdDev }));
}

function buildTexture(place, outDir, elev) {
  const [W, S, E, N] = place.bbox;
  const cloudLt = place.cloud_lt ?? 8;
  const texZoom = place.tex_zoom ?? (place.dem_zoom ?? 13) + 1;
  const body = JSON.stringify({
    collections: ["sentinel-2-l2a"], bbox: [W, S, E, N],
    query: { "eo:cloud_cover": { lt: cloudLt } },
    sortby: [{ field: "properties.eo:cloud_cover", direction: "asc" }], limit: 40,
  });
  const res = execFileSync("curl", ["-sS", "--fail", "-X", "POST", STAC, "-H", "Content-Type: application/json", "-d", body], { encoding: "utf8", maxBuffer: 64e6 });
  const feats = (JSON.parse(res).features || []).filter((f) => f.assets?.visual?.href);
  if (!feats.length) throw new Error(`no Sentinel-2 scene < ${cloudLt}% cloud over bbox - raise cloud_lt for ${place.slug}`);
  // bbox containment is now only a RANKING hint, never an acceptance test
  const contains = (f) => { const b = f.bbox; return b && b[0] <= W && b[1] <= S && b[2] >= E && b[3] >= N; };
  feats.sort((a, b) => (contains(b) - contains(a)) || (a.properties["eo:cloud_cover"] - b.properties["eo:cloud_cover"]));

  const scale = Math.pow(2, texZoom - elev.merc_px_window.z);
  const outW = Math.round((elev.merc_px_window.px1 - elev.merc_px_window.px0) * scale);
  const outH = Math.round((elev.merc_px_window.py1 - elev.merc_px_window.py0) * scale);
  const texPath = path.join(outDir, "texture.jpg");
  const probeTif = path.join(outDir, "_probe.tif");

  const tries = [];
  for (const item of feats.slice(0, MAX_SCENE_TRIES)) {
    const href = item.assets.visual.href;
    // 2026-08-30 defect fix RC-E: some STAC hits (observed on black-forest,
    // UTM 32U/MU) return a legacy `s3://sentinel-s2-l2a/...` href instead of
    // the https sentinel-cogs URL every other place used - gdalwarp's /vsicurl
    // driver cannot open an s3:// scheme and execFileSync THROWS, which used
    // to kill the whole multi-place build (no deploy at all, not even for
    // unrelated places) instead of just this one candidate. A bad href is the
    // same class of "unusable candidate" as a low-filled-fraction scene, so it
    // is now caught here and skipped exactly like a MIN_VALID_FRAC miss -
    // buildTexture already falls through to texture:null (hypsometric
    // fallback) when every candidate is exhausted.
    let bands;
    try {
      // Warp to GTiff WITH an alpha band: alpha = 0 exactly where the source has no
      // pixels, so mean(alpha)/255 is the filled fraction of our window.
      execFileSync("gdalwarp", [
        "-q", "-overwrite", "-t_srs", "EPSG:3857",
        "-te_srs", "EPSG:4326", "-te", String(W), String(S), String(E), String(N),
        "-ts", String(outW), String(outH), "-r", "cubic", "-dstalpha",
        "-of", "GTiff", "-co", "COMPRESS=DEFLATE", "-co", "TILED=YES",
        `/vsicurl/${href}`, probeTif,
      ], { stdio: "pipe", timeout: 20 * 60 * 1000 });
      bands = gdalStats(probeTif);
    } catch (err) {
      console.log(`[${place.slug}] candidate ${item.id} FAILED to warp (${err && err.message ? err.message.split("\n")[0] : err}) - skipping`);
      tries.push({ id: item.id, valid: 0, lum: null, warp_error: true });
      continue;
    }
    const valid = bands.length >= 4 ? bands[3].mean / 255 : 1;
    const lum = (bands[0].mean * 0.2126 + bands[1].mean * 0.7152 + bands[2].mean * 0.0722);
    tries.push({ id: item.id, valid: +valid.toFixed(4), lum: +lum.toFixed(1) });
    console.log(`[${place.slug}] candidate ${item.id} cloud=${item.properties["eo:cloud_cover"]}% filled=${(valid * 100).toFixed(1)}% lum=${lum.toFixed(1)}`);
    if (valid < MIN_VALID_FRAC) continue;

    // ── DISPLAY STRETCH (2026-08-29 defect fix RC-D) ──────────────────────────
    // Sentinel-2 TCI is an analysis product with NO display contrast stretch, so
    // vegetated and high-latitude scenes render genuinely dim: measured mean
    // luminance 34/255 (iguazu-falls), 40/255 (mount-fuji), 22/255 (lake-baikal)
    // against 84/255 for the bright desert at grand-canyon. A per-band
    // mean +/- 2.5 sigma stretch is the standard display normalisation for
    // satellite imagery. It changes only how the SAME pixels are displayed and is
    // recorded in the descriptor, so the page can state it honestly.
    const scaleArgs = [];
    const stretch = [];
    for (let b = 0; b < 3; b++) {
      const { mean, std } = bands[b];
      const lo = Math.max(0, mean - 2.5 * std);
      const hi = Math.min(255, mean + 2.5 * std);
      const use = hi - lo > 8 ? [lo, hi] : [0, 255]; // degenerate band -> passthrough
      stretch.push({ band: b + 1, src_min: +use[0].toFixed(1), src_max: +use[1].toFixed(1) });
      scaleArgs.push(`-scale_${b + 1}`, String(use[0]), String(use[1]), "0", "255");
    }
    execFileSync("gdal_translate", [
      "-q", "-of", "JPEG", "-co", "QUALITY=82", "-ot", "Byte",
      "-b", "1", "-b", "2", "-b", "3", ...scaleArgs,
      probeTif, texPath,
    ], { stdio: "pipe", timeout: 10 * 60 * 1000 });
    const after = gdalStats(texPath);
    const lumAfter = (after[0].mean * 0.2126 + after[1].mean * 0.7152 + after[2].mean * 0.0722);
    fs.rmSync(probeTif, { force: true });
    fs.rmSync(probeTif + ".aux.xml", { force: true });
    fs.rmSync(texPath + ".aux.xml", { force: true });
    const bytes = fs.statSync(texPath).size;
    console.log(`[${place.slug}] texture.jpg ${outW}x${outH} ${(bytes / 1e6).toFixed(1)}MB filled=${(valid * 100).toFixed(1)}% lum ${lum.toFixed(1)} -> ${lumAfter.toFixed(1)}`);
    return {
      file: "texture.jpg", width_px: outW, height_px: outH, tex_zoom: texZoom,
      scene_id: item.id, scene_datetime: item.properties.datetime,
      cloud_cover_pct: item.properties["eo:cloud_cover"],
      filled_frac: +valid.toFixed(4), mean_luminance_before: +lum.toFixed(1),
      mean_luminance: +lumAfter.toFixed(1), display_stretch: stretch,
      candidates_tried: tries.length,
    };
  }

  // Every candidate was partly empty. Shipping a black-holed texture is WORSE
  // than shipping none: with texture:null the viewer keeps its bright hypsometric
  // colouring, which is honest and readable. Recorded so the gate can see it.
  fs.rmSync(probeTif, { force: true });
  fs.rmSync(probeTif + ".aux.xml", { force: true });
  console.log(`[${place.slug}] NO usable scene: ${tries.length} candidate(s), best filled=${(Math.max(...tries.map((t) => t.valid)) * 100).toFixed(1)}% < ${(MIN_VALID_FRAC * 100).toFixed(0)}% -> texture:null (hypsometric fallback)`);
  return null;
}

// ---------------------------------------------------------------------------
function buildPlace(place, demOnly) {
  const outDir = path.join(OUT_ROOT, place.slug);
  const workDir = path.join(ROOT, "out", "places-3d-work", place.slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(workDir, { recursive: true });

  const elev = buildElevation(place, outDir, workDir);

  let tex = null;
  if (demOnly) console.log(`[${place.slug}] --dem-only: texture stage skipped by flag`);
  else if (!haveGdal()) console.log(`[${place.slug}] SKIP texture: gdalwarp not found (CI installs gdal-bin; descriptor records texture:null, viewer uses hypsometric colors)`);
  else tex = buildTexture(place, outDir, elev);

  const descriptor = {
    slug: place.slug,
    label: place.name,
    kind: "real-terrain",
    built_iso: new Date().toISOString(),
    decode: "height_m = int16le; source formula (R*256 + G + B/256) - 32768 from Terrarium RGB, rounded to nearest meter",
    grid: elev,
    texture: tex,
    files: [{ file: `${place.slug}/heights.bin`, role: "heightfield" }]
      .concat(tex ? [{ file: `${place.slug}/texture.jpg`, role: "satellite-texture" }] : []),
    sources: {
      elevation: "Mapzen/AWS Open Data Terrain Tiles (Terrarium), derived from NASA/USGS 3DEP + SRTM (+ ETOPO1 bathymetry at coarse zooms)",
      imagery: tex ? "Copernicus Sentinel-2 L2A true-color (Earth Search / AWS Open Data)" : null,
    },
    licenses: {
      elevation: "Open data; attribution: 'Terrain tiles by Mapzen and AWS Open Data, DEM sources: NASA, USGS'",
      imagery: tex ? `Free to use and redistribute incl. commercially; attribution: 'Contains modified Copernicus Sentinel data ${new Date().getFullYear()}'` : null,
    },
    notes: place.notes || "",
  };
  fs.writeFileSync(path.join(outDir, "descriptor.json"), JSON.stringify(descriptor, null, 2) + "\n");
  console.log(`[${place.slug}] descriptor.json written -> ${outDir}`);
}

// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const demOnly = args.includes("--dem-only");
const slugArgs = args.filter((a) => !a.startsWith("--"));
const registry = JSON.parse(fs.readFileSync(REGISTRY, "utf8")).places;
const targets = args.includes("--all")
  ? registry
  : registry.filter((p) => slugArgs.includes(p.slug));
if (targets.length === 0) {
  console.error(`usage: node places-3d/build-place-terrain.mjs <slug>|--all [--dem-only]\nknown slugs: ${registry.map((p) => p.slug).join(", ")}`);
  process.exit(2);
}
for (const p of targets) buildPlace(p, demOnly);
console.log(`done: ${targets.length} place(s). Next: node places-3d/make-places-3d-manifest.mjs ${OUT_ROOT}`);
