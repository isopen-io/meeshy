#!/usr/bin/env bash
#
# generate-call-ringtones.sh
#
# Synthesizes the two .caf ringtone files used by the iOS calls subsystem:
#   - Ringtone.caf       → CXProviderConfiguration.ringtoneSound (callee
#                          incoming-call ringtone). 1s ring + 4s silence × 6.
#   - RingbackTone.caf   → AVAudioPlayer-driven caller ringback while waiting
#                          for the callee to pick up. 2s ring + 4s silence × 5.
#
# Both files are 22050 Hz mono 16-bit PCM, packaged in CAF. The dual-tone
# (440 Hz + 480 Hz at -6 dBFS) is the US/CA standard ring frequency pair.
#
# Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §3.3
#
# Usage:
#   ./scripts/generate-call-ringtones.sh
#
# Output:
#   apps/ios/Meeshy/Resources/Ringtone.caf
#   apps/ios/Meeshy/Resources/RingbackTone.caf

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/apps/ios/Meeshy/Resources"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

mkdir -p "${OUT_DIR}"

generate_wav() {
    local out_path="$1"
    local ring_seconds="$2"   # duration of dual-tone ring chunk
    local silence_seconds="$3" # silence between rings
    local repeats="$4"         # number of (ring + silence) cycles

    python3 - "$out_path" "$ring_seconds" "$silence_seconds" "$repeats" <<'PY'
import math
import struct
import sys
import wave

out_path        = sys.argv[1]
ring_seconds    = float(sys.argv[2])
silence_seconds = float(sys.argv[3])
repeats         = int(sys.argv[4])

SAMPLE_RATE = 22050
F1 = 440.0   # standard US/CA ring tone pair (lower)
F2 = 480.0   # standard US/CA ring tone pair (upper)
# -6 dBFS on the SUM (not each tone), to leave headroom and avoid clipping.
# Each tone amplitude = 0.5 / 2 = 0.25 of full-scale.
AMP_PER_TONE = 0.25
ENVELOPE_MS = 10  # smooth fade-in/out to avoid clicks at boundaries
TWO_PI = 2.0 * math.pi

def ring_samples(duration_seconds: float):
    n = int(round(duration_seconds * SAMPLE_RATE))
    fade_n = int(round((ENVELOPE_MS / 1000.0) * SAMPLE_RATE))
    fade_n = min(fade_n, n // 2)
    out = []
    for i in range(n):
        t = i / SAMPLE_RATE
        # Two pure sines summed.
        s = AMP_PER_TONE * (math.sin(TWO_PI * F1 * t) + math.sin(TWO_PI * F2 * t))
        # Linear fade-in / fade-out envelope to kill click artifacts.
        if i < fade_n:
            s *= i / fade_n
        elif i > n - fade_n:
            s *= (n - i) / fade_n
        # Clamp to [-1, 1] just in case of float drift, then scale to int16.
        if s > 1.0: s = 1.0
        if s < -1.0: s = -1.0
        out.append(int(round(s * 32767)))
    return out

def silence_samples(duration_seconds: float):
    n = int(round(duration_seconds * SAMPLE_RATE))
    return [0] * n

samples = []
for _ in range(repeats):
    samples.extend(ring_samples(ring_seconds))
    samples.extend(silence_samples(silence_seconds))

# Pack as little-endian signed 16-bit PCM.
packed = struct.pack(f"<{len(samples)}h", *samples)

with wave.open(out_path, "wb") as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)        # 16-bit
    wf.setframerate(SAMPLE_RATE)
    wf.writeframes(packed)

print(f"wrote {out_path}: {len(samples)} samples ({len(samples)/SAMPLE_RATE:.2f}s)")
PY
}

convert_to_caf() {
    local wav_path="$1"
    local caf_path="$2"
    afconvert "${wav_path}" \
        -f caff \
        -d LEI16@22050 \
        -c 1 \
        "${caf_path}"
}

# Ringtone.caf: 1s ring + 4s silence × 6 = 30s total
RINGTONE_WAV="${TMP_DIR}/Ringtone.wav"
RINGTONE_CAF="${OUT_DIR}/Ringtone.caf"
generate_wav "${RINGTONE_WAV}" 1.0 4.0 6
convert_to_caf "${RINGTONE_WAV}" "${RINGTONE_CAF}"

# RingbackTone.caf: 2s ring + 4s silence × 5 = 30s total
RINGBACK_WAV="${TMP_DIR}/RingbackTone.wav"
RINGBACK_CAF="${OUT_DIR}/RingbackTone.caf"
generate_wav "${RINGBACK_WAV}" 2.0 4.0 5
convert_to_caf "${RINGBACK_WAV}" "${RINGBACK_CAF}"

echo "---"
echo "Ringtone:"
afinfo "${RINGTONE_CAF}" | head -8
echo "---"
echo "RingbackTone:"
afinfo "${RINGBACK_CAF}" | head -8
