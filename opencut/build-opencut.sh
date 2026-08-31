#!/usr/bin/env bash
# Builds the FreeToolOnline self-hosted OpenCut editor (the in-browser video
# editor behind https://freetoolonline.com/video-tools/video-editor.html) and
# leaves the static site in out/opencut/.
#
# Upstream: https://github.com/opencut-app/opencut-classic (MIT) pinned at
# OPENCUT_REV. opencut-freetool.patch (generated with `git diff --binary`
# against that exact revision) does five things, and nothing else:
#   1. removes the databuddy analytics script + BotId (operator instruction),
#   2. removes the backend surface (better-auth/drizzle/redis API routes, blog
#      and marketing pages that fetch external CMSes at build time) so the
#      whole app static-exports - the editor itself never used any of it,
#   3. moves /editor/[project_id] to /editor/?project=<id> (a static host
#      cannot route arbitrary dynamic segments),
#   4. points the Freesound sounds-library proxy at our own service host,
#   5. ADDS src/copilot/ - an on-device WebLLM copilot that turns typed
#      instructions into schema-validated edit operations applied through the
#      editor's normal undoable command stack, plus title/caption suggestions.
#
# The result keeps upstream's whole editing feature set: multi-track timeline,
# WebCodecs export (mediabunny, MPL-2.0 - file-level licence preserved,
# unmodified), in-browser Whisper captions, effects, masks, stickers,
# keyframes, IndexedDB+OPFS project storage. Everything runs in the visitor's
# tab; this CDN serves only static files.
set -euo pipefail

OPENCUT_REV="cf5e79e919144200294fb9fed22a222592a0aeea" # opencut-classic main, 2026-08
OPENCUT_URL="https://github.com/opencut-app/opencut-classic"
BUN_VERSION="1.4.0"

here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "==> clone ${OPENCUT_URL} @ ${OPENCUT_REV}"
git clone --filter=blob:limit=2m "$OPENCUT_URL" "$work/opencut"
git -C "$work/opencut" checkout --quiet "$OPENCUT_REV"
[ "$(git -C "$work/opencut" rev-parse HEAD)" = "$OPENCUT_REV" ]

echo "==> apply the freetool patch"
git -C "$work/opencut" apply --binary "$here/opencut-freetool.patch"

echo "==> bun ${BUN_VERSION}"
if ! command -v bun >/dev/null || [ "$(bun --version)" != "$BUN_VERSION" ]; then
    curl -fsSL https://bun.sh/install | BUN_INSTALL="$work/bun" bash -s "bun-v${BUN_VERSION}"
    export PATH="$work/bun/bin:$PATH"
fi

echo "==> install + build"
(cd "$work/opencut" && bun install --frozen-lockfile || bun install)
(cd "$work/opencut/apps/web" && NODE_ENV=production bun run build)

echo "==> stage out/opencut"
rm -rf out/opencut
mkdir -p out/opencut
cp -a "$work/opencut/apps/web/out/." out/opencut/
cp "$work/opencut/LICENSE" out/opencut/LICENSE
cp "$here/CREDITS.txt" out/opencut/CREDITS.txt

du -sh out/opencut
echo "opencut build OK (rev ${OPENCUT_REV})"
