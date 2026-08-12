#!/usr/bin/env python3
"""Generates the legacy (pre-API-26) launcher icon PNG fallbacks.

`minSdk = 26` (app/build.gradle.kts) means the OS always resolves
`mipmap-anydpi-v26/ic_launcher.xml` (the real adaptive icon —
`drawable/ic_launcher_{background,foreground,monochrome}.xml`) on every device
this app can run on; these rasters are pure fallback for tooling/launchers that
still read the classic `mipmap-<density>/ic_launcher.png` path directly
(recent-apps surfaces on some OEM skins, App Info before an adaptive-icon
redraw, third-party home-screen pickers). They are DERIVED from the exact same
geometry as the vector layers — not hand-drawn, not screenshotted — so the two
can never visually drift.

Source of truth for the geometry: the three bar bounding boxes measured
directly off the iOS brand asset
`apps/ios/Meeshy/Assets.xcassets/AppIcon.appiconset/Icon-Light-1024x1024.png`
(white-pixel connected-component scan), and the gradient endpoints measured
off that same PNG's corners — top-left (99,102,241) == Indigo500 `#6366F1`,
bottom-right (67,56,202) == Indigo700 `#4338CA` — confirming CLAUDE.md's
documented "Indigo gradient #6366F1 -> #4338CA" brand identity. Do not re-hue
or re-derive these numbers by eye; the measurement is reproducible by re-running
the same scan against the source PNG.

Requires Pillow (`pip install pillow`) — not a repo dependency, run manually
when regenerating (e.g. after a genuine brand-icon change upstream on iOS).

Usage:
    python3 apps/android/scripts/generate_legacy_launcher_icons.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

REPO_ROOT = Path(__file__).resolve().parents[3]
RES_DIR = REPO_ROOT / "apps/android/app/src/main/res"

INDIGO_500 = (0x63, 0x66, 0xF1)  # gradient start (top-left) — apps/ios/CLAUDE.md brand identity
INDIGO_700 = (0x43, 0x38, 0xCA)  # gradient end (bottom-right)

# Bar bounding boxes measured on the 1024x1024 iOS source PNG (x0, y0, x1, y1).
BARS_1024 = [
    (222, 344, 801, 423),
    (222, 472, 701, 551),
    (222, 600, 601, 679),
]
CENTER_1024 = 511.5  # bbox of all three bars is centered within ~0.5px of the 1024 canvas center

# Shrinks the 1:1 (108dp adaptive canvas / 1024px iOS canvas) port so every bar
# corner lands inside the 66dp adaptive-icon safe-zone circle (33dp radius) —
# the unscaled port's farthest corner sits at ~35.3dp; 0.85 brings it to ~30dp,
# a 3dp margin. Kept identical to drawable/ic_launcher_foreground.xml so the
# vector (API 26+) and these rasters (fallback) render the same composition.
SAFE_SCALE = 0.85

# (density qualifier, legacy launcher icon side length in px) — standard Android buckets.
DENSITIES = [
    ("mdpi", 48),
    ("hdpi", 72),
    ("xhdpi", 96),
    ("xxhdpi", 144),
    ("xxxhdpi", 192),
]

SUPERSAMPLE = 4  # render at 4x then Lanczos-downsample for anti-aliased edges at small sizes


def _bar_px(x0: float, y0: float, x1: float, y1: float, size: int) -> tuple[float, float, float, float]:
    def scaled(v: float) -> float:
        return size * (0.5 + (v - CENTER_1024) * SAFE_SCALE / 1024)

    return scaled(x0), scaled(y0), scaled(x1), scaled(y1)


def render(size: int, round_variant: bool) -> Image.Image:
    n = size * SUPERSAMPLE
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    pixels = img.load()
    for y in range(n):
        for x in range(n):
            t = max(0.0, min(1.0, (x + y) / (2 * n)))
            r = round(INDIGO_500[0] + (INDIGO_700[0] - INDIGO_500[0]) * t)
            g = round(INDIGO_500[1] + (INDIGO_700[1] - INDIGO_500[1]) * t)
            b = round(INDIGO_500[2] + (INDIGO_700[2] - INDIGO_500[2]) * t)
            pixels[x, y] = (r, g, b, 255)

    draw = ImageDraw.Draw(img)
    for x0, y0, x1, y1 in BARS_1024:
        bx0, by0, bx1, by1 = _bar_px(x0, y0, x1, y1, n)
        radius = (by1 - by0) / 2
        draw.rounded_rectangle([bx0, by0, bx1, by1], radius=radius, fill=(255, 255, 255, 255))

    if round_variant:
        mask = Image.new("L", (n, n), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, n, n], fill=255)
        img.putalpha(mask)

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    for qualifier, size in DENSITIES:
        out_dir = RES_DIR / f"mipmap-{qualifier}"
        out_dir.mkdir(parents=True, exist_ok=True)
        render(size, round_variant=False).save(out_dir / "ic_launcher.png")
        render(size, round_variant=True).save(out_dir / "ic_launcher_round.png")
        print(f"wrote mipmap-{qualifier}/ic_launcher{{,_round}}.png ({size}x{size})")


if __name__ == "__main__":
    main()
