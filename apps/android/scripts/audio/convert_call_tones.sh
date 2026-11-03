#!/usr/bin/env bash
# Convertit RingbackTone.caf (iOS) en res/raw/call_ringback.ogg (durée et boucle conservées) et
# produit les deux signaux courts par synthèse. Reproductible : ./scripts/audio/convert_call_tones.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
SRC="${RINGBACK_CAF:-$ROOT/apps/ios/Meeshy/Resources/RingbackTone.caf}"
RAW="$HERE/../../feature/calls/src/main/res/raw"
mkdir -p "$RAW"
ffmpeg -y -loglevel error -i "$SRC" -c:a libvorbis -q:a 3 "$RAW/call_ringback.ogg"
TMP="$(mktemp -d)"
python3 "$HERE/generate_call_cues.py" "$TMP"
for cue in connected ended; do
  ffmpeg -y -loglevel error -i "$TMP/$cue.wav" -c:a libvorbis -q:a 3 "$RAW/call_cue_$cue.ogg"
done
rm -rf "$TMP"
