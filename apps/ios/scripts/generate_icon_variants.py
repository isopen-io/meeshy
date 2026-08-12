#!/usr/bin/env python3
"""Régénère les variantes d'icône Meeshy depuis la géométrie du logo.

Contexte : `Icon-Dark-1024x1024.png` était livré comme un carré noir uni et
`Icon-Tinted-1024x1024.png` en polarité inversée. Les SVG sources sont corrects ;
c'est l'export PNG qui était cassé — le rasteriseur employé à l'époque a perdu le
dégradé appliqué sur un `stroke`, ne gardant que le `<rect>` de fond.

La géométrie est donc reprise ici en dur plutôt que rasterisée depuis le SVG :
aucun rasteriseur n'est garanti sur la machine, et trois traits à bouts ronds se
dessinent exactement. Elle reflète `apps/ios/logo_dark.svg` — toute évolution du
logo doit toucher les deux.

Requiert Pillow (générateur ponctuel, lancé par un dev). Le contrôle d'intégrité
qui tourne en CI, lui, est en stdlib pur : `check_appicon_variants.py`.

    python3 generate_icon_variants.py
"""

import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("Pillow requis : python3 -m pip install Pillow")

# Géométrie de apps/ios/logo_dark.svg (viewBox 1024)
CANVAS = 1024
STROKE = 80
DASHES = [(262, 762, 384), (262, 662, 512), (262, 562, 640)]

# Palette Indigo du design system (CLAUDE.md) : indigo500 → indigo700
GRADIENT_START = (0x63, 0x66, 0xF1)
GRADIENT_END = (0x43, 0x38, 0xCA)

SUPERSAMPLE = 4  # anti-aliasing par rendu 4× puis réduction


def dash_mask(size: int) -> Image.Image:
    """Masque 8 bits des trois traits à bouts ronds, anti-aliasé."""
    hi = size * SUPERSAMPLE
    scale = hi / CANVAS
    mask = Image.new("L", (hi, hi), 0)
    draw = ImageDraw.Draw(mask)
    radius = (STROKE / 2) * scale
    for x1, x2, y in DASHES:
        draw.rounded_rectangle(
            [x1 * scale - radius, y * scale - radius, x2 * scale + radius, y * scale + radius],
            radius=radius,
            fill=255,
        )
    return mask.resize((size, size), Image.LANCZOS)


def diagonal_gradient(size: int) -> Image.Image:
    """Dégradé linéaire (0,0) → (size,size), comme le linearGradient du SVG."""
    img = Image.new("RGB", (size, size))
    pixels = img.load()
    span = 2 * (size - 1)
    for y in range(size):
        for x in range(size):
            t = (x + y) / span
            pixels[x, y] = tuple(
                round(start + (end - start) * t)
                for start, end in zip(GRADIENT_START, GRADIENT_END)
            )
    return img


def write_dark(path: Path) -> None:
    """Fond noir opaque + dashes en dégradé indigo."""
    canvas = Image.new("RGB", (CANVAS, CANVAS), (0, 0, 0))
    canvas.paste(diagonal_gradient(CANVAS), (0, 0), dash_mask(CANVAS))
    canvas.save(path, "PNG")


def write_tinted(path: Path) -> None:
    """Fond noir opaque + dashes BLANCS.

    iOS teinte l'icône d'après sa luminance : le glyphe doit être la partie
    claire. L'asset précédent était noir sur blanc — teinté en négatif.
    """
    canvas = Image.new("RGB", (CANVAS, CANVAS), (0, 0, 0))
    canvas.paste(Image.new("RGB", (CANVAS, CANVAS), (255, 255, 255)), (0, 0), dash_mask(CANVAS))
    canvas.save(path, "PNG")


CALLKIT_PT = 40
CALLKIT_FILL = 0.92  # part de la largeur occupée par le glyphe


def write_callkit_template(directory: Path) -> None:
    """Template CallKit 40×40 pt : dashes OPAQUES sur fond TRANSPARENT.

    `CXProviderConfiguration.iconTemplateImageData` ignore les canaux couleur et
    ne lit que l'alpha. Un PNG opaque y produirait un rectangle plein.

    Le glyphe est recadré sur sa bounding box puis remis à l'échelle : dans le
    canvas 1024 du logo il n'occupe que ~57 % de la largeur et ~33 % de la
    hauteur — marge voulue pour une icône d'app, illisible à 40 pt.
    """
    x_min = min(x1 for x1, _, _ in DASHES) - STROKE / 2
    x_max = max(x2 for _, x2, _ in DASHES) + STROKE / 2
    y_min = min(y for _, _, y in DASHES) - STROKE / 2
    y_max = max(y for _, _, y in DASHES) + STROKE / 2
    glyph_w, glyph_h = x_max - x_min, y_max - y_min

    for scale in (1, 2, 3):
        size = CALLKIT_PT * scale
        # Rendu à pleine résolution puis recadrage sur la bbox, pour ne pas
        # perdre l'anti-aliasing dans une réduction en deux temps.
        full = dash_mask(CANVAS)
        cropped = full.crop((round(x_min), round(y_min), round(x_max), round(y_max)))

        target_w = round(size * CALLKIT_FILL)
        target_h = max(1, round(target_w * glyph_h / glyph_w))
        cropped = cropped.resize((target_w, target_h), Image.LANCZOS)

        mask = Image.new("L", (size, size), 0)
        mask.paste(cropped, ((size - target_w) // 2, (size - target_h) // 2))

        img = Image.new("RGBA", (size, size), (255, 255, 255, 0))
        img.putalpha(mask)
        suffix = "" if scale == 1 else f"@{scale}x"
        img.save(directory / f"CallKitIcon{suffix}.png", "PNG")


def main() -> int:
    ios_root = Path(__file__).resolve().parent.parent
    appicon = ios_root / "Meeshy/Assets.xcassets/AppIcon.appiconset"
    callkit = ios_root / "Meeshy/Assets.xcassets/CallKitIcon.imageset"

    if not appicon.is_dir():
        return print(f"introuvable : {appicon}", file=sys.stderr) or 1
    callkit.mkdir(parents=True, exist_ok=True)

    write_dark(appicon / "Icon-Dark-1024x1024.png")
    write_tinted(appicon / "Icon-Tinted-1024x1024.png")
    write_callkit_template(callkit)

    print(f"écrit  {appicon}/Icon-Dark-1024x1024.png")
    print(f"écrit  {appicon}/Icon-Tinted-1024x1024.png")
    print(f"écrit  {callkit}/CallKitIcon{{,@2x,@3x}}.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())
