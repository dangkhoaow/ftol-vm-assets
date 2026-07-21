# ftol-vm-assets - in-browser asset CDN for freetoolonline.com

Build pipelines for the large browser assets used by freetoolonline.com:

- **Linux Online** (`/utility-tools/linux-online.html`) - disk images + boot
  snapshots for real 32-bit Alpine Linux running in the reader's browser via
  the site's vendored [v86](https://github.com/copy/v86) emulator.
- **Retro FPS Online** (`/games/retro-fps-online.html`) - the Dwasm
  (PrBoom+/PrBoomX family, GPL-2.0) engine compiled to WebAssembly with the
  free [Freedoom](https://freedoom.github.io/) game data baked in. See
  "Retro FPS Online assets" below.
- **Space-3D visualizers** (`/space-3d/*.html`) - large REAL astronomical
  datasets/textures for the procedural three.js visualizer cluster. Most
  `/space-3d` pages render fully procedurally and use nothing here; this hosts
  only the minority whose value is a real published dataset too big to commit
  into the site repo (seed: the Mars MOLA elevation heightmap). See "Space-3D
  visualizer assets" below.

The built assets are published to this repository's **GitHub Pages site**
(deploy-from-artifact - they never enter git):

    https://dangkhoaow.github.io/ftol-vm-assets/manifest.json

Pages is the browser-facing CDN because it serves `access-control-allow-origin: *`
and honors `Range` requests. GitHub **Releases were measured to send no CORS
headers on either redirect hop** (2026-07-07) and therefore cannot be fetched
by browsers cross-origin - only the failure-log debug channel uses a release.
The tool page downloads each asset once, caches it in the reader's IndexedDB,
and works offline afterwards.

## What gets built

| Image | Contents | Boot |
|---|---|---|
| `terminal` | Alpine (32-bit x86) + OpenRC + vim/nano/htop, auto-login root on the VGA console | direct kernel boot (`vmlinuz` + `initramfs`), raw ext4 `image.img` (gzipped for transfer) |
| `desktop` | terminal base + Xorg (vesa) + eudev + dbus + a lean explicit Xfce set | same |

Each image also gets a **boot-state snapshot** (`state.bin.gz`): CI boots the
image headless under Node v86, waits for the ready marker on the serial
console, syncs, saves the machine state, and proves a restored copy still
answers. The tool page restores this state for a seconds-fast start.

`manifest.json` describes every asset (bytes raw + gz, sha256, memory size,
kernel cmdline); the tool page fetches it first.

## Layout

- `terminal/Dockerfile`, `desktop/Dockerfile` - image definitions (build context is the repo root)
- `common/` - shared inittab + motd
- `scripts/build-image.sh` - docker build/export -> `mke2fs -d` raw ext4 + kernel extraction
- `scripts/snapshot.mjs` - headless Node v86 boot -> ready marker -> save_state -> restore-verify
- `scripts/package-release.sh` + `scripts/make-manifest.mjs` + `scripts/make-index.sh` - gzip, sha256, manifest, site index
- `.github/workflows/build-and-publish.yml` - builds on every push, publishes the Pages site

## Versioning

Bump `VERSION` (v1, v2, ...) when the images change incompatibly - saved reader
sessions embed the image version, and the tool page refuses to restore a
session into a different image version. The manifest's `version` field is the
compatibility key; Pages always serves the latest build.

## Provenance + licenses

- Base OS: [Alpine Linux](https://alpinelinux.org/) 3.24, i386 - packages under
  their respective open-source licenses (MIT/GPL/BSD/...); package list is in
  the Dockerfiles. Redistribution of built images is permitted by Alpine.
- Emulator runtime used by CI: `v86` npm 0.5.424 (BSD 2-Clause).
- BIOS blobs fetched pinned from copy/v86 (SeaBIOS: LGPL; Bochs VGABios: LGPL) -
  sha256-verified in the workflow.
- No proprietary software, no distro trademarks or artwork are included in the
  images; the hostname and MOTD are house copy.

## Retro FPS Online assets

`retro-fps/build-retro-fps.sh` builds two self-contained Emscripten bundles
of the **Dwasm** engine (pinned commit of
[GMH-Code/Dwasm](https://github.com/GMH-Code/Dwasm), GPL-2.0 - the PrBoom+/
PrBoomX engine family): `phase1/` bakes the Freedoom Phase 1 IWAD into its
preload package, `phase2/` bakes Freedoom Phase 2. Each bundle is
`index.js.gz` + `index.wasm.gz` + `index.data.gz`; `retro-fps/manifest.json`
carries sizes and sha256s. The engine's internal `prboomx.wad` is generated
by the pinned commit's native `rdatawad` tool and sha256-verified against the
value documented upstream.

- Everything published is freely redistributable: the engine under GPL-2.0
  (complete corresponding source = the pinned commit + the build script in
  this public repo, see `retro-fps/licenses/SOURCES.txt`), the game data under
  Freedoom's free license (`licenses/FREEDOOM-COPYING.txt` + credits).
- **No commercial game content is ever hosted here.** Only Freedoom's free
  IWADs are accepted as game data.
- In-game saves/config live in the reader's browser (the engine mounts
  `/dwasm` as an Emscripten IDBFS); the tool page exports/imports that store
  as a session file. `retro-fps/VERSION` is the compatibility key, same rule
  as the VM images.
- The VM image build (~1h) is cached in CI on the hash of its inputs, so
  retro-fps pushes republish the combined Pages site in minutes.

## Space-3D visualizer assets

`space-3d/build-space-3d.sh <asset-id>` builds large REAL data assets for the
freetoolonline.com `/space-3d` cluster (procedural three.js astronomy
visualizers - see `prompts/space-3d-discovery-loop-runbook.md` in the site
repo). The cluster is **procedural-first**: the scene geometry is generated in
code and most pages need nothing from this repo. This pipeline exists only for
the minority whose whole value is a real published dataset/texture too large to
commit into the site repo.

Seeded with **`mars-terrain`**: the Mars MGS MOLA global elevation DEM (463 m/px,
~2.1 GB GeoTIFF, elevations referenced to the areoid) is fetched from USGS
Astrogeology (PDS), downsampled with GDAL to a `2048x1024` 16-bit grayscale
equirectangular heightmap PNG, and published with a decode formula so the scene
recovers true meters (Olympus Mons summit ~21 km above the areoid; Hellas basin
floor ~-8 km). NASA/USGS MOLA data are a U.S. Government work = **public domain**.

- Layout: `space-3d/build-space-3d.sh` (one asset per invocation; add a
  `build_<slug>` function + a `case` arm for each new asset),
  `space-3d/make-space-3d-manifest.mjs` (scans `out/space-3d/<slug>/descriptor.json`,
  hashes the published files, writes `space-3d/manifest.json`), `space-3d/VERSION`.
- `space-3d/manifest.json` (schema `ftol-space-3d/1`) carries, per asset, the
  published files with `bytes` + `sha256` + the scientific metadata (elevation
  extent, decode formula, source, license). The tool page fetches
  `https://dangkhoaow.github.io/ftol-vm-assets/space-3d/manifest.json` first,
  then downloads each asset once and caches it in IndexedDB (same pattern as
  retro-fps). Unlike retro-fps the files are **not gzipped** - images load in the
  browser directly (TextureLoader / fetch->blob) and JSON is gzipped on the wire
  by Pages automatically.
- **License gate:** every asset must be freely redistributable, verified
  per-file, with a `LICENSE`/`CREDITS.txt` under `space-3d/.../licenses/` and the
  source + license recorded in the asset's `descriptor.json`. Public-domain
  NASA/USGS data and CC-BY textures (attributed) are in; copyrighted, NC, or
  unlicensed assets are out.

The space-3d build is cached in CI on the hash of `space-3d/**`, so the ~2.1 GB
MOLA source is re-fetched only when the pipeline actually changes.

## Iterating

Push a change (or trigger `build-and-publish` via workflow_dispatch). Debug
levers: kernel `cmdline` + ready markers/timeouts in `scripts/snapshot.mjs`
(PROFILES table), package set in the Dockerfiles. Failed runs upload their
step logs to the `vm-assets-debug` prerelease for unauthenticated reading.

## Vendored FOSS game bundles (`games/`)

The 105 self-contained FOSS game bundles the freetoolonline.com `/games/*`
pages run in an iframe. Migrated here 2026-07-21 from the site repos'
`static/games/` (operator decision: game static bundles NEVER live in the
site repos - cumulative per-fire vendoring had bloated the staging repo to
~750 MB git-side). Each bundle keeps its upstream `LICENSE`; the site page
iframes `https://dangkhoaow.github.io/ftol-vm-assets/games/<dir>/index.html`
cross-origin (no CORS needed for iframes; each game saves progress in this
origin's localStorage). New game ships add the bundle HERE first, verify the
published URL returns 200, then point the page's `*_GAME_URL` constant at it.

## Vendored browser libraries (`vendor/`)

Version-pinned third-party libraries served to freetoolonline.com pages
cross-origin (classic `<script src>` - no CORS requirement), so the site
repos do not have to commit the bytes:

- `vendor/3d-force-graph/1.80.0/3d-force-graph.min.js` (MIT, license
  alongside) - UMD bundle (ThreeJS included) powering the homepage
  knowledge-graph explorer. sha256
  `d96e738edcca580edd524730c1c6b05ed2efce028c23ca95db1bf43033a72e42`.

Add new libraries under `vendor/<name>/<version>/...` - the version-pinned
path makes each URL immutable, so consumers never need cache-busting.
