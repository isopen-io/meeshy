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
Etendu par #5604 (travail « shells ») pour les CIBLES DE COQUE : icone et
splash des projets natifs Android et iOS generes par `bunx cap add`. Meme
source, meme discipline — on ETEND ce generateur, on n'en installe pas un
second (directive porteur : le pipeline s'etend, il ne se double pas). Rendu
CONDITIONNEL : si `android/`/`ios/` n'existent pas encore (coque non generee),
les cibles PWA seules sont ecrites, comme avant #5604 — ce script reste
rejouable a tout moment du cycle de vie de la coque.
"""
import struct
import sys
import zlib
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SOURCE = REPO / "apps/ios/Meeshy/Assets.xcassets/AppIcon.appiconset/Icon-Light-1024x1024.png"
APP = Path(__file__).resolve().parent.parent
PUBLIC = APP / "public"
ANDROID = APP / "android"
IOS = APP / "ios"

TARGETS = {
    "icon-192.png": 192,
    "icon-512.png": 512,
    "icon-512-maskable.png": 512,
}

# --- Cibles de coque (#5604) -------------------------------------------------

# Le fond du splash des DEUX coques : le MEME que `capacitor.config.ts`
# (backgroundColor Android/iOS) et `background_color` du manifest PWA
# (vite.config.ts) — directive porteur 2026-09-07 soir, qui le nomme
# explicitement plutot que le bleu `AccentColor` du launch screen iOS natif
# (ce dernier ferait un flash devant une application sombre).
SPLASH_BACKGROUND = (0x0B, 0x0C, 0x14, 0xFF)

# Part du plus petit cote du canevas qu'occupe l'icone reduite et centree —
# un logo de splash, pas un icone plein-bord une seconde fois.
SPLASH_LOGO_FRACTION = 0.4

# Densites Android : cote en px de `ic_launcher` / `ic_launcher_round`
# (mesure dans le gabarit genere par `bunx cap add android`).
ANDROID_ICON_SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

# `ic_launcher_foreground` : la couche que l'icone adaptative Android (API 26+)
# rogne jusqu'a 20 % de chaque bord — memes proportions que la maskable PWA,
# meme raison (icone plein-bord, glyphe dans la zone sure).
ANDROID_FOREGROUND_SIZES = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}

# `android:background="@drawable/splash"` (styles.xml, theme
# AppTheme.NoActionBarLaunch) : PAS de calque separe, l'image EST l'ecran
# entier — d'ou la composition fond+logo par variante, la ou l'icone n'a
# besoin que d'une reduction.
ANDROID_SPLASH_SIZES = {
    "drawable": (320, 480),
    "drawable-port-mdpi": (320, 480),
    "drawable-port-hdpi": (480, 800),
    "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (960, 1600),
    "drawable-port-xxxhdpi": (1280, 1920),
    "drawable-land-mdpi": (480, 320),
    "drawable-land-hdpi": (800, 480),
    "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1600, 960),
    "drawable-land-xxxhdpi": (1920, 1280),
}

# iOS : LaunchScreen.storyboard affiche l'image nommee "Splash" en
# `scaleAspectFill` plein ecran (pas de calque de fond separe non plus) — les
# TROIS entrees de Contents.json (1x/2x/3x) sont la MEME image 2732x2732
# (verifie : trois fichiers identiques dans le gabarit genere).
IOS_SPLASH_SIZE = 2732
IOS_SPLASH_FILES = ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png")

# Nom lu dans AppIcon.appiconset/Contents.json (`bunx cap add ios` le fixe) ;
# l'entree UNIQUE attendue est 1024x1024 malgre le nom historique "@2x".
IOS_ICON_FILE = "AppIcon-512@2x.png"


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


def write_png_rect(path, width, height, lines, *, quiet=False):
    """Encode des lignes RGBA en PNG WxH. Seule fonction qui ecrit un PNG —
    `write_png` (carre) en est desormais la projection la plus courante."""

    def chunk(kind, body):
        payload = kind + body
        return struct.pack(">I", len(body)) + payload + struct.pack(">I", zlib.crc32(payload))

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    raw = b"".join(b"\x00" + line for line in lines)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)
    if not quiet:
        print(f"  {path.relative_to(REPO)}  {width}x{height}  {len(png)} octets")


def write_png(path, size, lines):
    write_png_rect(path, size, size, lines)


def make_canvas(width, height, rgba):
    """Un canevas RGBA uni — le fond de splash, avant d'y centrer un logo."""
    row = bytes(rgba) * width
    return [row for _ in range(height)]


def paste_centered(canvas_lines, canvas_width, canvas_height, logo_lines, logo_size):
    """Compose-alpha (source-over) un carre logo_size x logo_size au CENTRE
    d'un canevas WxH. `canvas_lines` n'est pas mute — une copie est rendue."""
    offset_x = (canvas_width - logo_size) // 2
    offset_y = (canvas_height - logo_size) // 2
    out = [bytearray(row) for row in canvas_lines]
    for y in range(logo_size):
        cy = offset_y + y
        if cy < 0 or cy >= canvas_height:
            continue
        src_row = logo_lines[y]
        dst_row = out[cy]
        for x in range(logo_size):
            cx = offset_x + x
            if cx < 0 or cx >= canvas_width:
                continue
            si, di = x * 4, cx * 4
            alpha = src_row[si + 3]
            if alpha == 0:
                continue
            if alpha == 255:
                dst_row[di : di + 3] = src_row[si : si + 3]
            else:
                for c in range(3):
                    dst_row[di + c] = (src_row[si + c] * alpha + dst_row[di + c] * (255 - alpha)) // 255
    return [bytes(row) for row in out]


def splash_lines(width, height, source_width, source_height, source_lines):
    """Fond `SPLASH_BACKGROUND` + icone reduite a `SPLASH_LOGO_FRACTION` du
    plus petit cote, centree — la composition que les DEUX coques partagent."""
    canvas = make_canvas(width, height, SPLASH_BACKGROUND)
    logo_size = round(min(width, height) * SPLASH_LOGO_FRACTION)
    logo = downscale(source_width, source_height, source_lines, logo_size)
    return paste_centered(canvas, width, height, logo, logo_size)


def generate_android_assets(width, height, lines):
    """Icones (lanceur + rond + avant-plan adaptatif) et splash Android — pas
    de rendu si la coque n'est pas encore generee (`bunx cap add android`)."""
    if not ANDROID.exists():
        return
    res = ANDROID / "app/src/main/res"
    for density, size in ANDROID_ICON_SIZES.items():
        icon = downscale(width, height, lines, size)
        write_png(res / f"mipmap-{density}/ic_launcher.png", size, icon)
        write_png(res / f"mipmap-{density}/ic_launcher_round.png", size, icon)
    for density, size in ANDROID_FOREGROUND_SIZES.items():
        write_png(res / f"mipmap-{density}/ic_launcher_foreground.png", size, downscale(width, height, lines, size))
    for qualifier, (w, h) in ANDROID_SPLASH_SIZES.items():
        write_png_rect(res / qualifier / "splash.png", w, h, splash_lines(w, h, width, height, lines))
    print(
        f"  Android : {len(ANDROID_ICON_SIZES) * 2} icones, {len(ANDROID_FOREGROUND_SIZES)} avant-plans, "
        f"{len(ANDROID_SPLASH_SIZES)} splashs"
    )


def generate_ios_assets(width, height, lines):
    """Icone (copie OCTET POUR OCTET — directive 2026-09-07 : on recupere, on
    ne redessine pas) et splash iOS — rien si la coque n'existe pas encore."""
    if not IOS.exists():
        return
    assets = IOS / "App/App/Assets.xcassets"
    icon_target = assets / "AppIcon.appiconset" / IOS_ICON_FILE
    icon_target.write_bytes(SOURCE.read_bytes())
    print(f"  {icon_target.relative_to(REPO)}  copie octet pour octet de {SOURCE.name}")
    splash = splash_lines(IOS_SPLASH_SIZE, IOS_SPLASH_SIZE, width, height, lines)
    for filename in IOS_SPLASH_FILES:
        write_png(assets / "Splash.imageset" / filename, IOS_SPLASH_SIZE, splash)
    print(f"  iOS : 1 icone, {len(IOS_SPLASH_FILES)} splashs")


# Une entree par coque, chacune gardee par l'existence de son projet natif —
# c'est ce qui rend ce script rejouable AVANT comme APRES `bunx cap add`.
SHELL_TARGETS = {
    "android": generate_android_assets,
    "ios": generate_ios_assets,
}


def main():
    if not SOURCE.exists():
        raise SystemExit(f"source introuvable : {SOURCE}")
    width, height, lines = read_png_rgba(SOURCE)
    print(f"source : {SOURCE.relative_to(REPO)} ({width}x{height})")
    for name, size in TARGETS.items():
        write_png(PUBLIC / name, size, downscale(width, height, lines, size))
    for generate in SHELL_TARGETS.values():
        generate(width, height, lines)


if __name__ == "__main__":
    sys.exit(main())
