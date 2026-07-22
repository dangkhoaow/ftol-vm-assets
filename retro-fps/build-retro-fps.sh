#!/usr/bin/env bash
# Build the Retro FPS Online engine + game data for freetoolonline.com.
#
# Engine: Dwasm (GMH-Code) - a WebAssembly build of the PrBoom+/PrBoomX
# engine family, GPL-2.0. Pinned by commit; built with a pinned emsdk.
# Game data: Freedoom Phase 1 + Phase 2 IWADs (BSD-3-style free license),
# pinned release + sha256. One self-contained Emscripten build per phase
# (the IWAD is baked into that phase's preload package index.data).
#
# Requires: cmake, make, gcc, libsdl2-dev (native prboomx.wad generation),
# an ACTIVATED emsdk in the environment (emcmake on PATH), curl, unzip.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$HERE/out/retro-fps"
WORK="$HERE/out/retro-fps-work"

DWASM_REPO=https://github.com/GMH-Code/Dwasm.git
DWASM_COMMIT=ddf0347a4fc115b11ffb1c5710768b7c47c46698
FREEDOOM_VERSION=0.13.0
FREEDOOM_URL="https://github.com/freedoom/freedoom/releases/download/v${FREEDOOM_VERSION}/freedoom-${FREEDOOM_VERSION}.zip"
FREEDOOM_ZIP_SHA256=3f9b264f3e3ce503b4fb7f6bdcb1f419d93c7b546f4df3e874dd878db9688f59
FREEDOOM1_SHA256=7323bcc168c5a45ff10749b339960e98314740a734c30d4b9f3337001f9e703d
FREEDOOM2_SHA256=a8772e088847032510d97ba2312406a6998f21cbab44d4ff10696faa9c0ecd4b
# From the Dwasm README ("should match exactly")
PRBOOMX_WAD_SHA256=506fe7159eaf0a6cb479f866131ec7653638bb08928029cb8dabe1b3b1c9474d

command -v emcmake >/dev/null || { echo "FATAL: emsdk not activated (emcmake not on PATH)"; exit 1; }

rm -rf "$WORK" "$OUT"
mkdir -p "$WORK" "$OUT"

echo "[retro-fps] fetch pinned sources"
git init -q "$WORK/dwasm"
git -C "$WORK/dwasm" fetch -q --depth 1 "$DWASM_REPO" "$DWASM_COMMIT"
git -C "$WORK/dwasm" checkout -q FETCH_HEAD

curl -sL -o "$WORK/freedoom.zip" "$FREEDOOM_URL"
echo "$FREEDOOM_ZIP_SHA256  $WORK/freedoom.zip" | sha256sum -c -
unzip -q "$WORK/freedoom.zip" -d "$WORK"
FD="$WORK/freedoom-$FREEDOOM_VERSION"
echo "$FREEDOOM1_SHA256  $FD/freedoom1.wad" | sha256sum -c -
echo "$FREEDOOM2_SHA256  $FD/freedoom2.wad" | sha256sum -c -

echo "[retro-fps] native build: prboomx.wad (rdatawad only)"
mkdir -p "$WORK/dwasm/build_native"
(cd "$WORK/dwasm/build_native" \
  && cmake .. -DCMAKE_BUILD_TYPE=Release >cmake-native.log 2>&1 \
  && make prboomwad -j"$(nproc)" >make-native.log 2>&1)
PRWAD="$WORK/dwasm/build_native/prboomx.wad"
[ -f "$PRWAD" ] || PRWAD="$(find "$WORK/dwasm/build_native" -name prboomx.wad | head -1)"
[ -n "$PRWAD" ] && [ -f "$PRWAD" ] || { echo "FATAL: prboomx.wad not produced"; exit 1; }
echo "$PRBOOMX_WAD_SHA256  $PRWAD" | sha256sum -c -

for PHASE in phase1 phase2; do
  IWAD="freedoom1.wad"; [ "$PHASE" = "phase2" ] && IWAD="freedoom2.wad"
  echo "[retro-fps] emscripten build: $PHASE ($IWAD)"
  # --preload-file points at wasm/fs; swap its contents per phase
  rm -rf "$WORK/dwasm/wasm/fs"
  mkdir -p "$WORK/dwasm/wasm/fs"
  cp "$PRWAD" "$WORK/dwasm/wasm/fs/prboomx.wad"
  cp "$FD/$IWAD" "$WORK/dwasm/wasm/fs/$IWAD"

  BUILD="$WORK/dwasm/build_$PHASE"
  mkdir -p "$BUILD"
  (cd "$BUILD" \
    && emcmake cmake .. -DCMAKE_BUILD_TYPE=Release >cmake-$PHASE.log 2>&1 \
    && make -j"$(nproc)" >make-$PHASE.log 2>&1)

  for f in index.js index.wasm index.data; do
    [ -f "$BUILD/$f" ] || { echo "FATAL: $BUILD/$f missing"; ls -la "$BUILD"; exit 1; }
  done
  # Sanity: the preload package must actually contain the IWAD
  DATA_BYTES=$(stat -c '%s' "$BUILD/index.data")
  [ "$DATA_BYTES" -gt 25000000 ] || { echo "FATAL: index.data only $DATA_BYTES bytes - IWAD missing?"; exit 1; }

  mkdir -p "$OUT/$PHASE"
  for f in index.js index.wasm index.data; do
    stat -c '%s' "$BUILD/$f" >"$OUT/$PHASE/$f.size"
    gzip -9 -c "$BUILD/$f" >"$OUT/$PHASE/$f.gz"
  done
done

echo "[retro-fps] licenses + provenance"
mkdir -p "$OUT/licenses"
cp "$WORK/dwasm/COPYING" "$OUT/licenses/DWASM-ENGINE-GPL2.txt"
cp "$FD/COPYING.txt" "$OUT/licenses/FREEDOOM-COPYING.txt"
cp "$FD/CREDITS.txt" "$OUT/licenses/FREEDOOM-CREDITS.txt"
{
  echo "Retro FPS Online assets - source and license provenance"
  echo
  echo "Engine: Dwasm (PrBoom+/PrBoomX family), GPL-2.0"
  echo "  source: $DWASM_REPO @ $DWASM_COMMIT"
  echo "  build scripts: this repository (retro-fps/build-retro-fps.sh)"
  echo "Game data: Freedoom $FREEDOOM_VERSION (free content, see FREEDOOM-COPYING.txt)"
  echo "  source: https://github.com/freedoom/freedoom"
  echo
  echo "Complete corresponding source for the GPL-2.0 engine build is the"
  echo "pinned commit above plus the build script in this public repository."
} >"$OUT/licenses/SOURCES.txt"

node "$HERE/retro-fps/make-fps-manifest.mjs" "$OUT" "$DWASM_COMMIT" "$FREEDOOM_VERSION"
rm -f "$OUT"/*/*.size
echo "[retro-fps] done:"
find "$OUT" -type f -exec du -h {} + | sort
