#!/usr/bin/env bash
# Reproducibility / provenance tool for the /dinosaur-3d cluster photoreal-asset
# layer. Unlike the VM / retro-fps / space-3d pipelines (large binaries built in
# CI, never committed), these dinosaur models are TINY (~0.3 MB each) and CC0, so
# they are COMMITTED into git and shipped as-is (same rationale as vendor/). This
# script exists to PROVE provenance: it re-fetches each model from its documented
# origin URL and checks it against the committed copy, then regenerates the
# manifest. It is NOT wired into CI (the committed files are what deploy).
#
# Usage:  bash dinosaur-3d/build-dinosaur-3d.sh [--refetch]
#   (no args) verify committed files + regenerate manifest.json
#   --refetch re-download from origin into a temp dir and diff vs committed
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

node -e '
const s=require("./sources.json");
for(const [slug,m] of Object.entries(s.models)) console.log([slug, m.file, m.origin_download].join("\t"));
' | while IFS=$'\t' read -r slug file origin; do
  [ -f "$file" ] || { echo "MISSING committed $file"; exit 1; }
  echo "committed $slug -> $file ($(wc -c < "$file") bytes)"
  if [ "${1:-}" = "--refetch" ]; then
    tmp="$(mktemp)"
    curl -sL --max-time 120 -o "$tmp" "$origin"
    if cmp -s "$tmp" "$file"; then echo "  refetch OK: byte-identical to origin"; else
      echo "  WARNING: refetched bytes differ from committed (origin may have changed). committed sha stays authoritative."; fi
    rm -f "$tmp"
  fi
done

node make-dinosaur-3d-manifest.mjs
echo "done."
