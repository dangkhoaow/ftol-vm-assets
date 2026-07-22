// Write space-3d/manifest.json - the /space-3d visualizer pages that use a
// large real asset fetch this first: per-asset published files with bytes +
// sha256 (progress + storage checks + reader-side integrity), plus the
// scientific metadata (elevation extent + decode formula, source, license).
// Mirrors retro-fps/make-fps-manifest.mjs and scripts/make-manifest.mjs.
//
// It scans every OUT/<slug>/descriptor.json written by build-space-3d.sh,
// hashes each file the descriptor lists, and emits one manifest for the whole
// space-3d asset set. Add a new asset by teaching build-space-3d.sh to emit its
// slug dir + descriptor.json - no change needed here.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import url from "node:url";

const OUT = path.resolve(process.argv[2] || ".");
const here = path.dirname(url.fileURLToPath(import.meta.url));
const VERSION = fs.readFileSync(path.join(here, "VERSION"), "utf8").trim();

const sha256 = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

const slugDirs = fs
  .readdirSync(OUT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "licenses")
  .map((d) => d.name)
  .filter((name) => fs.existsSync(path.join(OUT, name, "descriptor.json")))
  .sort();

if (slugDirs.length === 0) {
  console.error("[make-space-3d-manifest] FATAL: no <slug>/descriptor.json found under " + OUT);
  process.exit(1);
}

const assets = {};
for (const slug of slugDirs) {
  const desc = JSON.parse(fs.readFileSync(path.join(OUT, slug, "descriptor.json"), "utf8"));
  desc.files = desc.files.map((f) => {
    const abs = path.join(OUT, f.file);
    if (!fs.existsSync(abs)) {
      console.error(`[make-space-3d-manifest] FATAL: ${slug} lists missing file ${f.file}`);
      process.exit(1);
    }
    return { ...f, bytes: fs.statSync(abs).size, sha256: sha256(abs) };
  });
  assets[slug] = desc;
}

const manifest = {
  schema: "ftol-space-3d/1",
  version: VERSION,
  built_iso: new Date().toISOString(),
  note: "Large real-data assets for freetoolonline.com /space-3d procedural visualizers. Most /space-3d pages render fully procedurally and use nothing here.",
  assets,
};

fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`[make-space-3d-manifest] wrote manifest.json (version ${VERSION}, ${slugDirs.length} asset(s): ${slugDirs.join(", ")})`);
