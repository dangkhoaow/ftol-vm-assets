# dinosaur-3d assets

Free-licensed 3D models for the freetoolonline.com **/dinosaur-3d** cluster
(procedural three.js dinosaur viewers - see
`prompts/dinosaur-3d-discovery-loop-runbook.md` in the site repo).

**Procedural-first.** Every `/dinosaur-3d/*` viewer first-paints a procedural
model built from three.js primitives (the G16 synchronous render pass). These
assets are an OPTIONAL enhancement: after first paint the page fetches
`dinosaur-3d/manifest.json`, and if it lists the current species it downloads the
glTF once (IndexedDB-cached, sha256-verified) and swaps it in for the procedural
body. A species with no manifest entry simply stays procedural - nothing breaks.

**Why committed (not CI-built).** Unlike the VM images / retro-fps / space-3d
datasets (hundreds of MB, built in CI, never in git), these models are tiny
(~0.3 MB each) and CC0, so they are committed to git and shipped as-is - the same
rationale as `vendor/`. The Assemble step in `.github/workflows/build-and-publish.yml`
copies `dinosaur-3d/` into the published site, so they serve from
`https://gh-static.freetool.online/dinosaur-3d/...` with CORS (ACAO *).

## Layout

- `sources.json` - hand-authored per-model metadata (slug -> file, kind, license,
  credit, source_url, targetLenUnits).
- `make-dinosaur-3d-manifest.mjs` - hashes each `.glb` + writes `manifest.json`
  (schema `ftol-dinosaur-3d/1`).
- `build-dinosaur-3d.sh` - provenance tool: re-fetch from origin + verify +
  regenerate manifest. Not wired into CI.
- `manifest.json` - what the viewer fetches first. Per model: `file`, `bytes`,
  `sha256`, `kind`, `targetLenUnits`, `license`, `credit`, `source_url`.
- `<slug>.glb` - the committed model files.
- `licenses/CREDITS.txt` + `licenses/LICENSE` - per-file source + license record.

## License gate (a real ship gate)

Every model MUST be freely redistributable and verified PER-FILE: CC0 /
public-domain / CC-BY (with attribution) / museum open-access. REJECT anything
copyrighted, NonCommercial (CC-BY-NC), unlicensed, or a franchise/game rip whose
underlying studio copyright the uploader's CC label cannot override (e.g. models
labelled "Jurassic World / Jurassic Park"). CC-BY models ship their attribution
in `manifest.json.credit`, which the viewer shows in the info panel.

## Adding a model

1. Obtain a license-clean `.glb` (verify the license PER FILE). Drop it in as
   `<slug>.glb` (slug = the `/dinosaur-3d/<slug>.html` route slug).
2. Add its entry to `sources.json` (file, kind, license, credit, source_url).
3. Append the source + license to `licenses/CREDITS.txt`.
4. `node dinosaur-3d/make-dinosaur-3d-manifest.mjs` to regenerate `manifest.json`.
5. Commit + push -> CI republishes the Pages site -> the viewer auto-upgrades.

## Seed models (v1.0.0)

- `tyrannosaurus-rex.glb` - T. rex by **Quaternius**, CC0, via Poly Pizza.
- `velociraptor.glb` - Velociraptor by **Quaternius**, CC0, via Poly Pizza.

Both are stylised low-poly reconstructions (not photoreal / not fossil-accurate);
the viewer's info panel discloses this. Higher-fidelity CC-BY candidates are
tracked for review in the site repo's runbook ledger.
