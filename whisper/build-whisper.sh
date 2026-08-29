#!/usr/bin/env bash
# Fetch the ONNX export of OpenAI Whisper (base, int8) from HuggingFace at a PINNED
# revision, verify every byte against whisper/checksums.txt, and stage it for this
# repo's GitHub Pages site.
#
# Consumer: freetoolonline.com/utility-tools/meeting-notes-taker.html - transcribes
# a recorded meeting in the reader's own browser with transformers.js. The published
# layout mirrors the HuggingFace repo layout, so transformers.js can be pointed at
# this CDN with env.remoteHost + env.remotePathTemplate and needs no other change.
#
# Weights are Apache-2.0 (openai/whisper-base); LICENSE + CREDITS.txt are published
# beside them. ~78 MB total, so the site repos never carry the bytes.
#
# Usage: bash whisper/build-whisper.sh   (writes out/whisper/)
set -euo pipefail

REPO_ID="onnx-community/whisper-base"
REVISION="1846881b6b3a3024392c1eea3ad983695bc23925"
MODEL_DIR="whisper-base"

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
out="$root/out/whisper/$MODEL_DIR"
base="https://huggingface.co/$REPO_ID/resolve/$REVISION"

mkdir -p "$out/onnx"

fetch() { # fetch <remote-path> <local-path>
  local rel="$1" dest="$2"
  if [ -s "$dest" ]; then echo "  cached  $rel"; return; fi
  echo "  fetch   $rel"
  curl -fsSL --retry 5 --retry-delay 3 -o "$dest.part" "$base/$rel"
  mv "$dest.part" "$dest"
}

echo "Whisper base (int8) <- $REPO_ID @ ${REVISION:0:12}"
for f in encoder_model_int8.onnx decoder_model_merged_int8.onnx; do
  fetch "onnx/$f" "$out/onnx/$f"
done
for f in config.json generation_config.json preprocessor_config.json tokenizer.json \
         tokenizer_config.json special_tokens_map.json added_tokens.json vocab.json \
         merges.txt normalizer.json; do
  fetch "$f" "$out/$f"
done

echo "Verifying checksums..."
sha_cmd="sha256sum"
command -v sha256sum >/dev/null 2>&1 || sha_cmd="shasum -a 256"
(cd "$out" && grep -v '^#' "$here/checksums.txt" | grep -v '^[[:space:]]*$' | $sha_cmd -c -)

cp "$here/LICENSE" "$out/LICENSE"
cp "$here/CREDITS.txt" "$out/CREDITS.txt"
node "$here/make-whisper-manifest.mjs" "$root/out/whisper" "$REPO_ID" "$REVISION" "$MODEL_DIR"

echo "Whisper assets staged at $out"
