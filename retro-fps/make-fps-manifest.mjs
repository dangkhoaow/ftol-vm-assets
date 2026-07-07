// Write retro-fps/manifest.json - the Retro FPS Online tool page fetches
// this first: per-phase file URLs, gz + raw sizes (progress + storage
// checks), and sha256s. Mirrors scripts/make-manifest.mjs for the VM images.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import url from "node:url";

const OUT = path.resolve(process.argv[2] || ".");
const DWASM_COMMIT = process.argv[3] || "unknown";
const FREEDOOM_VERSION = process.argv[4] || "unknown";
const here = path.dirname(url.fileURLToPath(import.meta.url));
const VERSION = fs.readFileSync(path.join(here, "VERSION"), "utf8").trim();

const sha256 = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const asset = (phase, name) => ({
  file: `${phase}/${name}.gz`,
  bytes: fs.statSync(path.join(OUT, phase, `${name}.gz`)).size,
  bytes_raw: Number(fs.readFileSync(path.join(OUT, phase, `${name}.size`), "utf8").trim()),
  sha256: sha256(path.join(OUT, phase, `${name}.gz`)),
});
const phaseEntry = (phase, label, iwad, levels) => ({
  label,
  iwad,
  levels,
  assets: {
    js: asset(phase, "index.js"),
    wasm: asset(phase, "index.wasm"),
    data: asset(phase, "index.data"),
  },
});

const manifest = {
  schema: "ftol-retro-fps/1",
  version: VERSION,
  built_iso: new Date().toISOString(),
  engine: { project: "Dwasm (PrBoom+/PrBoomX family)", license: "GPL-2.0", commit: DWASM_COMMIT },
  game_data: { project: "Freedoom", version: FREEDOOM_VERSION, license: "free (BSD-style), see licenses/" },
  idbfs_mount: "/dwasm",
  phases: {
    phase1: phaseEntry("phase1", "Campaign 1", "freedoom1.wad", "4 episodes, 36 levels"),
    phase2: phaseEntry("phase2", "Campaign 2", "freedoom2.wad", "32 levels"),
  },
};

fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`[make-fps-manifest] wrote manifest.json (version ${VERSION})`);
