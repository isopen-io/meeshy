#!/usr/bin/env python3
"""Derive les icones PNG de la PWA depuis le LOGO D'APPLICATION iOS.

La source de verite de la marque est l'icone de l'app iOS —
`apps/ios/Meeshy/Assets.xcassets/AppIcon.appiconset/Icon-Light-1024x1024.png`
(degrade indigo #6366F1 -> #4338CA, trois barres blanches empilees ; voir
`apps/ios/CLAUDE.md` § Brand Identity). Directive porteur 2026-09-07 : les
logos existants se RECUPERENT, ils ne se redessinent pas — l'ancienne version
de ce script dessinait un « M » synthetique qui n'etait pas la marque.

Pourquoi un generateur plutot que trois binaires poses a la main : une icone
posee a la main derive en silence de sa source. Ici les trois fichiers sont des
PROJECTIONS (reduction par moyenne de surface, sans dependance hors stdlib),
rejouables par `python3 scripts/generate-icons.py`.

`maskable` : Android rogne jusqu'a 20 % de chaque bord. L'icone iOS est
plein-bord avec le glyphe dans la zone sure (~60 % du centre) — la meme image
reduite convient, et c'est verifie a l'oeil sur les captures d'emulateur.
"""
import struct
import sys
import zlib
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SOURCE = REPO / "apps/ios/Meeshy/Assets.xcassets/AppIcon.appiconset/Icon-Light-1024x1024.png"
PUBLIC = Path(__file__).resolve().parent.parent / "public"

TARGETS = {
    "icon-192.png": 192,
    "icon-512.png": 512,
    "icon-512-maskable.png": 512,
}


def read_png_rgba(path):
    """Decode un PNG 8 bits (RGB ou RGBA, non entrelace) en lignes RGBA."""
    raw = path.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"{path} n'est pas un PNG")
    pos, width, height, channels, idat = 8, 0, 0, 0, b""
    while pos < len(raw):
        (length,) = struct.unpack(">I", raw[pos : pos + 4])
        kind = raw[pos + 4 : pos + 8]
        body = raw[pos + 8 : pos + 8 + length]
        if kind == b"IHDR":
            width, height, depth, color, _, _, interlace = struct.unpack(">IIBBBBB", body)
            if depth != 8 or interlace != 0:
                raise SystemExit("source inattendue : PNG 8 bits non entrelace requis")
            channels = {0: 1, 2: 3, 4: 2, 6: 4}[color]
        elif kind == b"IDAT":
            idat += body
        elif kind == b"IEND":
            break
        pos += 12 + length
    flat = zlib.decompress(idat)
    stride = width * channels
    lines, previous = [], bytearray(stride)
    offset = 0
    for _ in range(height):
        filter_type = flat[offset]
        line = bytearray(flat[offset + 1 : offset + 1 + stride])
        offset += 1 + stride
        if filter_type == 1:  # Sub
            for i in range(channels, stride):
                line[i] = (line[i] + line[i - channels]) & 0xFF
        elif filter_type == 2:  # Up
            for i in range(stride):
                line[i] = (line[i] + previous[i]) & 0xFF
        elif filter_type == 3:  # Average
            for i in range(stride):
                left = line[i - channels] if i >= channels else 0
                line[i] = (line[i] + ((left + previous[i]) >> 1)) & 0xFF
        elif filter_type == 4:  # Paeth
            for i in range(stride):
                left = line[i - channels] if i >= channels else 0
                up = previous[i]
                up_left = previous[i - channels] if i >= channels else 0
                p = left + up - up_left
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - up_left)
                predictor = left if pa <= pb and pa <= pc else up if pb <= pc else up_left
                line[i] = (line[i] + predictor) & 0xFF
        previous = line
        if channels == 4:
            lines.append(bytes(line))
        elif channels == 3:
            rgba = bytearray()
            for i in range(0, stride, 3):
                rgba += line[i : i + 3] + b"\xff"
            lines.append(bytes(rgba))
        else:
            raise SystemExit("source inattendue : RGB ou RGBA requis")
    return width, height, lines


def downscale(width, height, lines, size):
    """Moyenne de surface (box filter a bornes fractionnaires) vers size x size."""
    ratio = width / size
    out_lines = []
    for oy in range(size):
        y0, y1 = oy * ratio, (oy + 1) * ratio
        row = bytearray()
        for ox in range(size):
            x0, x1 = ox * ratio, (ox + 1) * ratio
            acc = [0.0, 0.0, 0.0, 0.0]
            area = 0.0
            sy = int(y0)
            while sy < y1 and sy < height:
                wy = min(y1, sy + 1) - max(y0, sy)
                sx = int(x0)
                base = lines[sy]
                while sx < x1 and sx < width:
                    wx = min(x1, sx + 1) - max(x0, sx)
                    weight = wx * wy
                    i = sx * 4
                    acc[0] += base[i] * weight
                    acc[1] += base[i + 1] * weight
                    acc[2] += base[i + 2] * weight
                    acc[3] += base[i + 3] * weight
                    area += weight
                    sx += 1
                sy += 1
            row += bytes(min(255, round(component / area)) for component in acc)
        out_lines.append(bytes(row))
    return out_lines


def write_png(path, size, lines):
    def chunk(kind, body):
        payload = kind + body
        return struct.pack(">I", len(body)) + payload + struct.pack(">I", zlib.crc32(payload))

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    raw = b"".join(b"\x00" + line for line in lines)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)
    print(f"  {path.name}  {size}x{size}  {len(png)} octets")


def main():
    if not SOURCE.exists():
        raise SystemExit(f"source introuvable : {SOURCE}")
    width, height, lines = read_png_rgba(SOURCE)
    print(f"source : {SOURCE.relative_to(REPO)} ({width}x{height})")
    for name, size in TARGETS.items():
        write_png(PUBLIC / name, size, downscale(width, height, lines, size))


if __name__ == "__main__":
    sys.exit(main())
