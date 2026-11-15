#!/usr/bin/env python3
"""Synthétise les deux signaux courts de marque (aucun échantillon tiers : droits propres à Meeshy).
connected : deux notes montantes brèves ; ended : deux notes descendantes douces."""
import math, struct, sys, wave

RATE = 22050

def tone(freq, ms, gain=0.5):
    n = int(RATE * ms / 1000)
    fade = int(RATE * 0.01)
    out = []
    for i in range(n):
        env = min(1.0, i / fade, (n - i) / fade) if fade else 1.0
        out.append(gain * env * math.sin(2 * math.pi * freq * i / RATE))
    return out

def write(path, samples):
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 32767)) for s in samples))

out = sys.argv[1]
write(f"{out}/connected.wav", tone(880, 70) + tone(1320, 110))
write(f"{out}/ended.wav", tone(988, 90) + tone(659, 160))
