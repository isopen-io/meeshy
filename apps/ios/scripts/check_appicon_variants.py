#!/usr/bin/env python3
"""Contrôle d'intégrité des variantes d'AppIcon (dark / tinted).

Pourquoi un contrôle de dépôt et pas un XCTest : dans le `Assets.car` compilé,
`AppIcon` est de type *Icon Image* / *MultiSized Image*, pas *Image*. Il n'est
donc pas récupérable par `UIImage(named:)`, et la sélection d'apparence suppose
un `UIImageAsset` que ce type n'expose pas. Le bundle ne contient en clair que
les rasters de la variante claire. Le seul endroit où le sujet existe vraiment,
c'est le fichier sur disque.

Ce que le contrôle attrape (cas vécu, 2026-07-31) : `Icon-Dark-1024x1024.png`
livré comme un carré noir uni — une seule couleur sur 1 048 576 pixels — parce
que le rasteriseur avait perdu le dégradé appliqué sur un `stroke` SVG.

Décodeur PNG en pure stdlib : ni PIL ni ImageMagick ne sont garantis en CI.
"""

import struct
import sys
import zlib
from pathlib import Path

CHANNELS = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}


def _paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    return b if pb <= pc else c


def _unfilter(raw: bytes, width: int, height: int, bpp: int, stride: int) -> bytearray:
    out = bytearray()
    prev = bytearray(stride)
    pos = 0
    for _ in range(height):
        filter_type = raw[pos]
        pos += 1
        line = bytearray(raw[pos:pos + stride])
        pos += stride
        if filter_type == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 0xFF
        elif filter_type == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif filter_type == 3:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif filter_type == 4:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                upleft = prev[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + _paeth(left, prev[i], upleft)) & 0xFF
        elif filter_type != 0:
            raise ValueError(f"filtre PNG inconnu : {filter_type}")
        out += line
        prev = line
    return out


def read_pixels(path: Path):
    """Retourne (largeur, hauteur, [(r, g, b, a), ...]). Non-interlacé, 8 bits."""
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("signature PNG absente")

    pos = 8
    idat = b""
    palette = None
    trns = None
    width = height = depth = color_type = interlace = 0

    while pos < len(data):
        length, ctype = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if ctype == b"IHDR":
            width, height, depth, color_type, _, _, interlace = struct.unpack(">IIBBBBB", body)
        elif ctype == b"PLTE":
            palette = body
        elif ctype == b"tRNS":
            trns = body
        elif ctype == b"IDAT":
            idat += body
        elif ctype == b"IEND":
            break

    if depth != 8:
        raise ValueError(f"profondeur {depth} non gérée (attendu 8)")
    if interlace:
        raise ValueError("PNG entrelacé non géré")

    nch = CHANNELS[color_type]
    stride = width * nch
    flat = _unfilter(zlib.decompress(idat), width, height, nch, stride)

    pixels = []
    for i in range(0, len(flat), nch):
        chunk = flat[i:i + nch]
        if color_type == 6:
            pixels.append(tuple(chunk))
        elif color_type == 2:
            pixels.append((chunk[0], chunk[1], chunk[2], 255))
        elif color_type == 0:
            g = chunk[0]
            pixels.append((g, g, g, 255))
        elif color_type == 4:
            g = chunk[0]
            pixels.append((g, g, g, chunk[1]))
        elif color_type == 3:
            idx = chunk[0]
            r, g, b = palette[idx * 3:idx * 3 + 3]
            a = trns[idx] if trns and idx < len(trns) else 255
            pixels.append((r, g, b, a))
    return width, height, pixels


def luminance(px) -> float:
    return 0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2]


def check_not_uniform(path: Path, label: str, errors: list) -> list:
    """Un asset d'icône qui n'a qu'une couleur ne porte aucun glyphe."""
    if not path.exists():
        errors.append(f"{label} : fichier absent ({path.name})")
        return []
    try:
        _, _, pixels = read_pixels(path)
    except ValueError as exc:
        errors.append(f"{label} : PNG illisible — {exc}")
        return []

    distinct = set(pixels)
    if len(distinct) < 2:
        only = distinct.pop() if distinct else None
        errors.append(
            f"{label} : image UNICOLORE {only} sur {len(pixels)} pixels — aucun glyphe. "
            f"Régénérer depuis le SVG source (le dégradé sur stroke est perdu par "
            f"certains rasteriseurs)."
        )
    return pixels


def check_tinted_polarity(pixels: list, label: str, errors: list) -> None:
    """iOS teinte l'icône d'après sa LUMINANCE : le glyphe doit être le clair.

    Un glyphe sombre sur fond clair (l'inverse) donne une icône teintée en
    négatif. Heuristique : la couleur majoritaire est le fond ; il doit être
    plus sombre que la moyenne des pixels qui s'en écartent nettement.
    """
    if not pixels:
        return
    counts = {}
    for px in pixels:
        counts[px] = counts.get(px, 0) + 1
    background = max(counts, key=counts.get)
    bg_lum = luminance(background)

    glyph = [luminance(px) for px in counts if abs(luminance(px) - bg_lum) > 32]
    if not glyph:
        errors.append(f"{label} : aucun pixel ne se détache du fond — glyphe absent")
        return

    if sum(glyph) / len(glyph) < bg_lum:
        errors.append(
            f"{label} : polarité INVERSÉE — glyphe plus sombre (moy. luminance "
            f"{sum(glyph) / len(glyph):.0f}) que le fond ({bg_lum:.0f}). iOS teinte "
            f"d'après la luminance : le glyphe doit être le clair."
        )


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: check_appicon_variants.py <AppIcon.appiconset>", file=sys.stderr)
        return 2

    iconset = Path(sys.argv[1])
    errors: list = []

    check_not_uniform(iconset / "Icon-Dark-1024x1024.png", "AppIcon (dark)", errors)
    tinted = check_not_uniform(iconset / "Icon-Tinted-1024x1024.png", "AppIcon (tinted)", errors)
    check_tinted_polarity(tinted, "AppIcon (tinted)", errors)

    if errors:
        for err in errors:
            print(f"FAIL  {err}")
        return 1

    print("OK    variantes AppIcon dark + tinted : glyphe présent, polarité correcte")
    return 0


if __name__ == "__main__":
    sys.exit(main())
