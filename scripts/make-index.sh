#!/usr/bin/env bash
# Write a minimal index.html into the Pages site dir - a human-readable
# listing of the published assets (the tool page itself reads manifest.json).
set -euo pipefail
REL="${1:?usage: make-index.sh <release-dir>}"
{
  echo '<!doctype html><meta charset="utf-8"><title>ftol-vm-assets</title>'
  echo '<h1>Linux Online VM assets</h1>'
  echo '<p>Disk images + v86 boot-state snapshots for the Linux Online tool page on freetoolonline.com. Built by CI from the ftol-vm-assets repository; see its README for provenance and licenses.</p><ul>'
  for f in "$REL"/*; do
    b="$(basename "$f")"
    [ "$b" = "index.html" ] && continue
    s="$(du -h "$f" | cut -f1)"
    echo "<li><a href=\"./$b\">$b</a> ($s)</li>"
  done
  echo '</ul>'
} >"$REL/index.html"
echo "[make-index] wrote $REL/index.html"
