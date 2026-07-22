#!/usr/bin/env bash
# Gzip the raw images, collect kernel/initramfs/state files, and write
# manifest.json - everything the Linux Online tool page needs to know.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)" # vm-images/
REL="$HERE/out/release"
mkdir -p "$REL"

for KIND in terminal desktop; do
  O="$HERE/out/$KIND"
  gzip -6 -c "$O/image.img" >"$REL/$KIND.img.gz"
  stat -c '%s' "$O/image.img" >"$REL/$KIND.img.size"
  cp "$O/state.bin.gz" "$REL/$KIND.state.bin.gz"
  cp "$O/state.size" "$REL/$KIND.state.size"
  cp "$O/vmlinuz" "$REL/$KIND.vmlinuz"
  cp "$O/initramfs" "$REL/$KIND.initramfs"
done

node "$HERE/scripts/make-manifest.mjs" "$REL"
rm -f "$REL"/*.size
echo "[package-release] assets:"
ls -la "$REL"
