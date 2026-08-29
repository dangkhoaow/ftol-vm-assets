#!/usr/bin/env bash
# Fetch the Supertonic 3 on-device TTS model set from HuggingFace at a PINNED
# revision, verify every byte against supertonic/checksums.txt, and stage it for
# this repo's GitHub Pages site.
#
# Why here and not in the site repos: the four ONNX graphs total ~398 MB and two
# of them exceed GitHub's 100 MB per-file push limit, so they can never enter
# freetoolonline-web / -web-test. Pages is the browser-facing CDN (sends
# access-control-allow-origin: * and honors Range); the tool page downloads each
# file once and caches it in the reader's Cache Storage.
#
# Model weights are licensed BigScience OpenRAIL-M (redistribution allowed; the
# license text + its use-based restrictions MUST travel with the weights). The
# LICENSE file is published next to them and the tool page links to it.
#
# Usage: bash supertonic/build-supertonic.sh   (writes out/supertonic/)
set -euo pipefail

REPO_ID="Supertone/supertonic-3"
REVISION="3cadd1ee6394adea1bd021217a0e650ede09a323"
VERSION="v3"

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
out="$root/out/supertonic/$VERSION"
base="https://huggingface.co/$REPO_ID/resolve/$REVISION"

mkdir -p "$out/onnx" "$out/voice_styles"

fetch() { # fetch <remote-path> <local-path>
  local rel="$1" dest="$2"
  if [ -s "$dest" ]; then
    echo "  cached  $rel"
    return
  fi
  echo "  fetch   $rel"
  curl -fsSL --retry 5 --retry-delay 3 -o "$dest.part" "$base/$rel"
  mv "$dest.part" "$dest"
}

echo "Supertonic $VERSION <- $REPO_ID @ ${REVISION:0:12}"
for f in duration_predictor.onnx text_encoder.onnx vector_estimator.onnx vocoder.onnx tts.json unicode_indexer.json; do
  fetch "onnx/$f" "$out/onnx/$f"
done
for v in M1 M2 M3 M4 M5 F1 F2 F3 F4 F5; do
  fetch "voice_styles/$v.json" "$out/voice_styles/$v.json"
done
fetch "LICENSE" "$out/LICENSE"

echo "Verifying checksums..."
sha_cmd="sha256sum"
command -v sha256sum >/dev/null 2>&1 || sha_cmd="shasum -a 256"
(cd "$out" && grep -v '^#' "$here/checksums.txt" | grep -v '^[[:space:]]*$' | $sha_cmd -c -)

cp "$here/CREDITS.txt" "$out/CREDITS.txt"
node "$here/make-supertonic-manifest.mjs" "$out" "$REPO_ID" "$REVISION" "$VERSION"

echo "Supertonic assets staged at $out"
