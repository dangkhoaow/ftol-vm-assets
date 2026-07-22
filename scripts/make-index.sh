#!/usr/bin/env bash
# Write a minimal index.html into the Pages site dir - a human-readable
# listing of the published assets (tool pages read the manifest.json files).
# Lists the root files plus one level of subdirectories (retro-fps/...).
set -euo pipefail
REL="${1:?usage: make-index.sh <release-dir>}"
{
  echo '<!doctype html><meta charset="utf-8"><title>ftol-vm-assets</title>'
  echo '<h1>freetoolonline.com in-browser asset CDN</h1>'
  echo '<p>Linux Online VM images (v86 boot-state snapshots), Retro FPS Online engine/game data, and Space-3D visualizer datasets (e.g. Mars MOLA elevation). Built by CI from the ftol-vm-assets repository; see its README and the licenses/ folders for provenance and licenses.</p><ul>'
  for f in "$REL"/*; do
    b="$(basename "$f")"
    [ "$b" = "index.html" ] && continue
    if [ -d "$f" ]; then
      echo "<li>$b/<ul>"
      find "$f" -type f | sort | while read -r sub; do
        rel="${sub#"$REL"/}"
        s="$(du -h "$sub" | cut -f1)"
        echo "<li><a href=\"./$rel\">$rel</a> ($s)</li>"
      done
      echo "</ul></li>"
    else
      s="$(du -h "$f" | cut -f1)"
      echo "<li><a href=\"./$b\">$b</a> ($s)</li>"
    fi
  done
  echo '</ul>'
} >"$REL/index.html"
echo "[make-index] wrote $REL/index.html"
