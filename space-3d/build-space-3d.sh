#!/usr/bin/env bash
# Build large REAL data assets for the freetoolonline.com /space-3d cluster
# (procedural three.js visualizers - see prompts/space-3d-discovery-loop-runbook.md
# in the site repo). Most /space-3d pages render 100% procedurally and need
# NOTHING from here; this pipeline exists only for the minority whose value is a
# real published dataset/texture too large to commit into the site repo.
#
# Each asset is FREELY REDISTRIBUTABLE, verified per-file, and published to this
# repo's GitHub Pages site (deploy-from-artifact - the bytes never enter git),
# described by space-3d/manifest.json. The tool page fetches the manifest, then
# downloads each asset once and caches it in the reader's IndexedDB (same pattern
# as retro-fps). Unlike retro-fps we do NOT gzip the published files: images
# (PNG) are already compressed and are loaded by the browser directly (TextureLoader
# / fetch->blob), and JSON is gzipped on the wire by Pages automatically.
#
# Usage:  bash space-3d/build-space-3d.sh <asset-id>        (default: mars-terrain)
# Requires: curl, node, sha256sum, and GDAL (gdalinfo + gdal_translate) for the
#           raster assets. CI installs gdal-bin; see build-and-publish.yml.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$HERE/out/space-3d"
WORK="$HERE/out/space-3d-work"
ASSET="${1:-mars-terrain}"

mkdir -p "$OUT" "$WORK"

# ---------------------------------------------------------------------------
build_mars_terrain() {
  local SLUG="mars-terrain"
  local LABEL="Mars global elevation (MOLA)"
  local W=2048 H=1024
  local HEIGHT_FILE="mola-height-${W}.png"

  # Source: Mars MGS MOLA DEM global mosaic, 463 m/px (~2.1 GB GeoTIFF),
  # elevations referenced to the Mars areoid. NASA MGS MOLA science team /
  # USGS Astrogeology (PDS). US Government work = public domain.
  local MARS_MOLA_URL="https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif"
  # Optional integrity pin. The full mosaic is ~2.1 GB, so its sha256 is NOT
  # pre-pinned here; the build CAPTURES it into licenses/SOURCES.txt for the
  # record, and reader-facing integrity is the manifest sha256 of the produced
  # PNG. Set MARS_MOLA_SHA256=<hex> (env) to hard-verify the source download.
  local MARS_MOLA_SHA256="${MARS_MOLA_SHA256:-}"

  command -v gdalinfo >/dev/null && command -v gdal_translate >/dev/null \
    || { echo "FATAL: GDAL not found (need gdalinfo + gdal_translate)"; exit 1; }

  rm -rf "$OUT/$SLUG"
  mkdir -p "$OUT/$SLUG" "$WORK/$SLUG"
  local SRC="$WORK/$SLUG/mola_dem_463m.tif"

  echo "[space-3d/$SLUG] fetch MOLA DEM mosaic (~2.1 GB)"
  curl -fL --retry 3 -o "$SRC" "$MARS_MOLA_URL"
  local SRCSHA
  SRCSHA="$(sha256sum "$SRC" | cut -d' ' -f1)"
  if [ -n "$MARS_MOLA_SHA256" ]; then
    echo "$MARS_MOLA_SHA256  $SRC" | sha256sum -c -
  else
    echo "[space-3d/$SLUG] source sha256 (captured, not pre-pinned): $SRCSHA"
  fi

  echo "[space-3d/$SLUG] read elevation extent (meters, areoid datum)"
  local MM MIN MAX
  MM="$(gdalinfo -mm "$SRC" | sed -n 's/.*Computed Min\/Max=\([-0-9.]*\),\([-0-9.]*\).*/\1 \2/p' | head -1)"
  MIN="${MM% *}"; MAX="${MM#* }"
  [ -n "$MIN" ] && [ -n "$MAX" ] || { echo "FATAL: could not read min/max from gdalinfo"; exit 1; }
  echo "[space-3d/$SLUG] elevation min=${MIN} m  max=${MAX} m"

  echo "[space-3d/$SLUG] downsample -> ${W}x${H} 16-bit grayscale heightmap PNG"
  # Map [MIN,MAX] meters linearly onto [0,65535]; the meta.json decode formula
  # lets the scene recover true meters. -r average avoids aliasing on downscale.
  gdal_translate -q -ot UInt16 -scale "$MIN" "$MAX" 0 65535 \
    -outsize "$W" "$H" -r average -of PNG \
    "$SRC" "$OUT/$SLUG/$HEIGHT_FILE"
  rm -f "$OUT/$SLUG/$HEIGHT_FILE.aux.xml" "$OUT/$SLUG/"*.wld 2>/dev/null || true
  [ -s "$OUT/$SLUG/$HEIGHT_FILE" ] || { echo "FATAL: heightmap not produced"; exit 1; }

  echo "[space-3d/$SLUG] write asset descriptor"
  SLUG="$SLUG" LABEL="$LABEL" WIDTH="$W" HEIGHT="$H" HEIGHT_FILE="$SLUG/$HEIGHT_FILE" \
  ELEV_MIN="$MIN" ELEV_MAX="$MAX" SRC_URL="$MARS_MOLA_URL" SRC_SHA="$SRCSHA" \
  RETRIEVED="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  node -e '
    const fs = require("fs");
    const e = process.env;
    const d = {
      slug: e.SLUG,
      label: e.LABEL,
      kind: "heightmap",
      files: [{
        role: "heightmap",
        file: e.HEIGHT_FILE,
        width: Number(e.WIDTH),
        height: Number(e.HEIGHT),
        projection: "equirectangular (simple cylindrical), lon -180..180, lat -90..90",
        encoding: "grayscale 16-bit, value linearly normalized across the elevation extent",
      }],
      elevation: {
        datum: "MOLA areoid (Mars)",
        unit: "m",
        min_m: Number(e.ELEV_MIN),
        max_m: Number(e.ELEV_MAX),
        decode: "elev_m = min_m + (pixel/65535)*(max_m-min_m)",
        note: "Real MOLA elevations. Cite figures honestly (e.g. Olympus Mons summit ~21 km above the areoid; Hellas basin floor ~-8 km).",
      },
      source: {
        project: "Mars MGS MOLA DEM global mosaic (463 m/px)",
        provider: "NASA MGS MOLA science team / USGS Astrogeology (PDS)",
        url: e.SRC_URL,
        sha256: e.SRC_SHA || null,
        retrieved_iso: e.RETRIEVED,
      },
      license: { id: "PD-USGS-NASA", note: "Public domain (US Government work); see licenses/" },
    };
    fs.writeFileSync(process.argv[1], JSON.stringify(d, null, 2) + "\n");
  ' "$OUT/$SLUG/descriptor.json"

  write_licenses "$SLUG" "$MARS_MOLA_URL" "$SRCSHA"
}

# ---------------------------------------------------------------------------
write_licenses() {
  local SLUG="$1" URL="$2" SRCSHA="$3"
  mkdir -p "$OUT/licenses"
  cat >"$OUT/licenses/MOLA-NASA-USGS-PD.txt" <<'EOF'
Mars MGS MOLA global DEM - license
==================================
Source data are a product of the NASA Mars Global Surveyor (MGS) Mars Orbiter
Laser Altimeter (MOLA) science team, mosaicked and distributed by the USGS
Astrogeology Science Center via the Planetary Data System (PDS).

As works of the U.S. Government, NASA/USGS MOLA data are in the PUBLIC DOMAIN
and are freely redistributable. NASA/USGS request (do not require) credit; see
CREDITS.txt. No endorsement is implied.
EOF
  cat >"$OUT/licenses/CREDITS.txt" <<'EOF'
Space-3D visualizer assets - credits
====================================
Mars elevation: NASA / JPL / GSFC - Mars Global Surveyor MOLA science team;
mosaic by USGS Astrogeology Science Center (PDS). Public domain.
EOF
  {
    echo "Space-3D visualizer assets - source and license provenance"
    echo
    echo "Asset: $SLUG"
    echo "  source url: $URL"
    echo "  source sha256 (captured at build): $SRCSHA"
    echo "  license: public domain (US Government work) - see MOLA-NASA-USGS-PD.txt"
    echo "  build script: this repository (space-3d/build-space-3d.sh)"
    echo
    echo "Reader-facing integrity is the sha256 of the published PNG recorded in"
    echo "space-3d/manifest.json (the tool page verifies it before caching)."
  } >"$OUT/licenses/SOURCES.txt"
}

# ---------------------------------------------------------------------------
case "$ASSET" in
  mars-terrain) build_mars_terrain ;;
  *) echo "FATAL: unknown asset '$ASSET' (known: mars-terrain)"; exit 1 ;;
esac

node "$HERE/space-3d/make-space-3d-manifest.mjs" "$OUT"
echo "[space-3d] done:"
find "$OUT" -type f -exec du -h {} + | sort
