# ftol-vm-assets - Linux Online VM images

Build pipeline for the disk images behind freetoolonline.com's **Linux Online**
tool page (`/utility-tools/linux-online.html`), which runs real 32-bit Alpine
Linux in the reader's browser via the site's vendored
[v86](https://github.com/copy/v86) emulator.

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

## Iterating

Push a change (or trigger `build-and-publish` via workflow_dispatch). Debug
levers: kernel `cmdline` + ready markers/timeouts in `scripts/snapshot.mjs`
(PROFILES table), package set in the Dockerfiles. Failed runs upload their
step logs to the `vm-assets-debug` prerelease for unauthenticated reading.
