"""Atelier « Néon » : la boîte à outils (au-dessus de lib/base.py).

Tubes de néon (halo, verre, âme), chromes, grille en perspective, soleil à bandes, skyline,
bitume mouillé, circuits imprimés, HUD, ondes, glitch, pixels, hologrammes, plaque néon.
"""

import json
import math
import random
import sys
from pathlib import Path

ATL = Path(__file__).resolve().parent
ROOT = ATL.parents[1]
sys.path.insert(0, str(ROOT / "lib"))
sys.path.insert(0, str(ATL))

from base import *  # noqa: E402,F401,F403
import base  # noqa: E402

SLUG = "neon"
OUT = ROOT / "out" / SLUG
KICK = "Nouveau rang · Néon"
DATE = "10 octobre 2026"

INK = "#04020B"
NIGHT = "#0B0622"
DUSK = "#1A0B3A"
VIOLET = "#9B4DFF"
MAGENTA = "#FF2BD6"
PINK = "#FF5FA8"
CYAN = "#29E7FF"
BLUE = "#3B7BFF"
YELLOW = "#FFE23B"
ORANGE = "#FF8A2B"
LIME = "#8CFF5A"
RED = "#FF3355"
WHITE = "#FFFFFF"
GOLD = "#F5C443"
GOLD_HI = "#FFF2B8"

from base import nid  # noqa: E402,F401  le compteur des identifiants vit dans Card


def rgb(c):
    return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))


def mix(c1, c2, t):
    a, b = rgb(c1), rgb(c2)
    return "#%02X%02X%02X" % tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def light(c, t=0.72):
    return mix(c, "#FFFFFF", t)


def dark(c, t=0.6):
    return mix(c, "#000000", t)


# ---------------------------------------------------------------- filtres (espace utilisateur : jamais de boîte nulle)

def ublur(card, sd):
    name = f"ub{str(sd).replace('.', '_')}"
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" filterUnits="userSpaceOnUse" x="-120" y="-120" width="780" height="1200" '
        f'color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="{sd}"/></filter>',
    )
    return f"url(#{card.id(name)})"


def lgrad(card, name, stops, x1=0, y1=0, x2=0, y2=1, user=None):
    st = "".join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops)
    units = ""
    if user:
        ux1, uy1, ux2, uy2 = user
        units = ' gradientUnits="userSpaceOnUse"'
        x1, y1, x2, y2 = ux1, uy1, ux2, uy2
    return card.def_once(name, f'<linearGradient id="{card.id(name)}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"{units}>{st}</linearGradient>')


def rgrad_user(card, name, cx, cy, r, stops):
    st = "".join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops)
    return card.def_once(name, f'<radialGradient id="{card.id(name)}" gradientUnits="userSpaceOnUse" cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}">{st}</radialGradient>')


def glow_spot(card, cx, cy, rx, ry, color, op=0.6, name=None):
    name = name or nid("gs")
    g = card.rgrad(name, [(0, color, op), (0.45, color, op * 0.35), (1, color, 0)])
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{g}"/>'


# ---------------------------------------------------------------- le tube de néon

def tube(card, geo, color, w=3.0, halo=9, core=None, op=1.0, glass=True, cap="round", dash=None):
    """Un tube de néon : halo large, lueur proche, verre coloré, âme presque blanche.
    `geo` : des éléments SVG SANS attribut de trait (path, line, circle, rect, polyline…)."""
    core = core or light(color, 0.78)
    da = f' stroke-dasharray="{dash}"' if dash else ""
    out = [f'<g fill="none" stroke-linecap="{cap}" stroke-linejoin="round" opacity="{op}"{da}>']
    out.append(f'<g stroke="{color}" stroke-width="{f(w * 3.4)}" opacity="0.5" filter="{ublur(card, halo)}">{geo}</g>')
    out.append(f'<g stroke="{color}" stroke-width="{f(w * 1.7)}" opacity="0.85" filter="{ublur(card, max(1.2, round(halo / 4, 1)))}">{geo}</g>')
    if glass:
        out.append(f'<g stroke="{color}" stroke-width="{f(w)}">{geo}</g>')
    out.append(f'<g stroke="{core}" stroke-width="{f(max(0.6, w * 0.42))}" opacity="0.95">{geo}</g>')
    out.append("</g>")
    return "".join(out)


def fine(geo, color, w=1.0, op=1.0, dash=None):
    da = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<g fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" opacity="{op}"{da}>{geo}</g>'


def glowing(card, markup, color=None, halo=5, op=0.9, glow_op=0.8):
    """Un dessin déjà coloré, doublé d'une lueur floue (pour les symboles tout faits)."""
    return f'<g opacity="{glow_op}" filter="{ublur(card, halo)}">{markup}</g><g opacity="{op}">{markup}</g>'


def neon_text(card, x, y, text, color, size, family=HAND, weight=700, anchor="middle", core=None, halo=5, ls=0, op=1, rotate=0):
    core = core or light(color, 0.7)
    tr = f' transform="rotate({rotate} {f(x)} {f(y)})"' if rotate else ""
    a = f'x="{f(x)}" y="{f(y)}" text-anchor="{anchor}" font-family="{family}" font-weight="{weight}" font-size="{size}" letter-spacing="{ls}"'
    t = esc(text)
    return (
        f'<g opacity="{op}"{tr}><text {a} fill="{color}" stroke="{color}" stroke-width="{f(size * 0.12)}" opacity="0.85" filter="{ublur(card, halo)}">{t}</text>'
        f'<text {a} fill="{core}" stroke="{color}" stroke-width="{f(size * 0.045)}" paint-order="stroke">{t}</text></g>'
    )


def bulb(card, cx, cy, r, color, op=1):
    return (f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 3)}" fill="{color}" opacity="{f(0.45 * op)}" filter="{ublur(card, r * 1.4)}"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{light(color, 0.6)}" opacity="{op}"/>')


def star(card, cx, cy, r, color="#FFFFFF", op=1):
    return (f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 2.6)}" fill="{color}" opacity="{f(0.5 * op)}" filter="{ublur(card, r * 1.6)}"/>'
            + sparkle(cx, cy, r * 3.2, light(color, 0.6), op) + f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.7)}" fill="#FFFFFF" opacity="{op}"/>')


# ---------------------------------------------------------------- chromes

CHROME = {
    "cool": [(0, "#F2FBFF"), (0.32, "#86D2FF"), (0.47, "#FFFFFF"), (0.5, "#2A1150"), (0.6, "#7B2FD8"), (0.8, "#FF7AD9"), (1, "#FFE0F6")],
    "gold": [(0, "#FFFBE0"), (0.34, "#FFCF4A"), (0.47, "#FFFFFF"), (0.5, "#6A3204"), (0.62, "#D98A1E"), (0.84, "#FFDA70"), (1, "#FFF6CF")],
    "sunset": [(0, "#FFF7C2"), (0.3, "#FFC23B"), (0.47, "#FFFFFF"), (0.5, "#5A0F45"), (0.65, "#FF3D8B"), (0.85, "#FF9BD0"), (1, "#FFE6F3")],
    "ice": [(0, "#FFFFFF"), (0.35, "#BFE9FF"), (0.48, "#FFFFFF"), (0.5, "#16304F"), (0.66, "#3FA6FF"), (0.86, "#A9E6FF"), (1, "#FFFFFF")],
    "prism": [(0, "#FFFFFF"), (0.3, "#FFD36E"), (0.47, "#FFFFFF"), (0.5, "#32106A"), (0.62, "#6EA8FF"), (0.78, "#B36EFF"), (1, "#FF9FD0")],
}


def chrome(card, kind="cool", horizontal=False):
    stops = CHROME[kind]
    return card.grad(f"chr-{kind}{'-h' if horizontal else ''}", stops, 0, 0, (1 if horizontal else 0), (0 if horizontal else 1))


def chrome_stroke(card, d, w, kind="cool", edge="#0A0418"):
    g = card.grad(f"chs-{kind}", [(0, CHROME[kind][1][1]), (0.25, "#FFFFFF"), (0.45, CHROME[kind][3][1]), (0.7, CHROME[kind][5][1]), (1, "#FFFFFF")], 0, 0, 1, 1)
    return (f'<path d="{d}" fill="none" stroke="{edge}" stroke-width="{f(w + 2.4)}" stroke-linejoin="round"/>'
            f'<path d="{d}" fill="none" stroke="{g}" stroke-width="{f(w)}" stroke-linejoin="round"/>'
            f'<path d="{d}" fill="none" stroke="#FFFFFF" stroke-width="0.7" opacity="0.6" stroke-linejoin="round"/>')


# ---------------------------------------------------------------- fenêtre photo

def rrect_d(x0, y0, x1, y1, r):
    return (f"M{f(x0 + r)} {f(y0)} L{f(x1 - r)} {f(y0)} Q{f(x1)} {f(y0)} {f(x1)} {f(y0 + r)} L{f(x1)} {f(y1 - r)} "
            f"Q{f(x1)} {f(y1)} {f(x1 - r)} {f(y1)} L{f(x0 + r)} {f(y1)} Q{f(x0)} {f(y1)} {f(x0)} {f(y1 - r)} L{f(x0)} {f(y0 + r)} Q{f(x0)} {f(y0)} {f(x0 + r)} {f(y0)}Z")


def chamfer_d(x0, y0, x1, y1, c):
    return (f"M{f(x0 + c)} {f(y0)} L{f(x1 - c)} {f(y0)} L{f(x1)} {f(y0 + c)} L{f(x1)} {f(y1 - c)} L{f(x1 - c)} {f(y1)} "
            f"L{f(x0 + c)} {f(y1)} L{f(x0)} {f(y1 - c)} L{f(x0)} {f(y0 + c)} Z")


def arch_d(x0, y0, x1, y1, r=20):
    rx = (x1 - x0) / 2
    return (f"M{f(x0)} {f(y1 - r)} L{f(x0)} {f(y0 + rx)} A{f(rx)} {f(rx)} 0 0 1 {f(x1)} {f(y0 + rx)} L{f(x1)} {f(y1 - r)} "
            f"Q{f(x1)} {f(y1)} {f(x1 - r)} {f(y1)} L{f(x0 + r)} {f(y1)} Q{f(x0)} {f(y1)} {f(x0)} {f(y1 - r)}Z")


def hex_d(cx, cy, rx, ry):
    pts = [(cx, cy - ry), (cx + rx, cy - ry / 2), (cx + rx, cy + ry / 2), (cx, cy + ry), (cx - rx, cy + ry / 2), (cx - rx, cy - ry / 2)]
    return "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + "Z"


def window(card, d):
    name = nid("win")
    card.def_once(name, f'<mask id="{card.id(name)}" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}">'
                        f'<rect width="{W}" height="{H}" fill="#FFFFFF"/><path d="{d}" fill="#000000"/></mask>')
    return f"url(#{card.id(name)})"


def inside(card, d):
    name = nid("clip")
    card.def_once(name, f'<clipPath id="{card.id(name)}"><path d="{d}"/></clipPath>')
    return f"url(#{card.id(name)})"


def fade_mask(card, y0, y1, x0=0, x1=W, top_op=0.0, bot_op=1.0, mid=None):
    """Masque de fondu vertical (blanc = visible) entre y0 et y1."""
    name = nid("fm")
    stops = [(0, "#FFFFFF", top_op), (1, "#FFFFFF", bot_op)] if mid is None else [(0, "#FFFFFF", top_op), (mid[0], "#FFFFFF", mid[1]), (1, "#FFFFFF", bot_op)]
    g = lgrad(card, name + "g", stops, user=(0, y0, 0, y1))
    card.def_once(name, f'<mask id="{card.id(name)}" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}">'
                        f'<rect x="{x0}" y="{min(y0, y1) - 2000}" width="{x1 - x0}" height="4000" fill="{g}"/></mask>')
    return f"url(#{card.id(name)})"


def spill(card, d, color, w=26, op=0.32):
    """La lumière d'un tube qui déborde sur la photo (lueur à l'intérieur du bord)."""
    clip = inside(card, d)
    return f'<g clip-path="{clip}"><path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{op}" filter="{ublur(card, w * 0.5)}"/></g>'


def inner_shade(card, d, w=22, op=0.65):
    clip = inside(card, d)
    return f'<g clip-path="{clip}"><path d="{d}" fill="none" stroke="#000000" stroke-width="{w}" opacity="{op}" filter="{ublur(card, w * 0.45)}"/></g>'


# ---------------------------------------------------------------- départ d'un cadre

def start(uid, top="#2A1946", bottom="#0B0717", rim="#FF8FE0", glow=0.2):
    c = Card(uid)
    photo(c, top, bottom, rim, 2, glow)
    return c


def night(card, mask, stops=None, name=None):
    stops = stops or [(0, "#140A33"), (0.45, "#080418"), (1, "#020108")]
    g = card.grad(name or nid("sky"), stops)
    return f'<rect width="{W}" height="{H}" fill="{g}"/>'


def scanlines(card, op=0.18, gap=3):
    name = nid("scan")
    card.def_once(name, f'<pattern id="{card.id(name)}" width="8" height="{gap}" patternUnits="userSpaceOnUse"><rect width="8" height="1" fill="#000000"/></pattern>')
    return f'<rect width="{W}" height="{H}" fill="url(#{card.id(name)})" opacity="{op}"/>'


def grain(card, op=0.07, seed=4):
    name = nid("grain")
    card.def_once(name, f'<filter id="{card.id(name)}" filterUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}">'
                        f'<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="{seed}"/>'
                        f'<feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.4 -0.55"/></filter>')
    return f'<rect width="{W}" height="{H}" filter="url(#{card.id(name)})" opacity="{op}"/>'


def stardust(seed, n, region=(0, 0, W, H), colors=("#FFFFFF", "#FFFFFF", "#BFF5FF", "#FFD6F5", "#FFF3B0"), rmax=1.4, avoid=(80, 250, 460, 724)):
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if avoid and avoid[0] < x < avoid[2] and avoid[1] < y < avoid[3]:
            continue
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(0.3, rmax))}" fill="{rnd.choice(colors)}" opacity="{f(rnd.uniform(0.3, 1))}"/>')
    return "".join(out)


# ---------------------------------------------------------------- grille rétro-futuriste

def grid_geo(hy, vx=270, y_end=H, gap=46, nv=16, nh=13, depth=0.5, x_min=-400, x_max=940, t0=0.015, flip=False):
    """Grille au sol en perspective : point de fuite (vx, hy), lignes jusqu'à y_end.
    `flip` : un plafond (la grille s'ouvre vers le haut)."""
    out = []
    sign = -1 if flip else 1
    span = (y_end - hy)
    for k in range(-nv, nv + 1):
        xb = vx + k * gap
        if not (x_min <= xb <= x_max):
            continue
        x_s = vx + (xb - vx) * t0
        y_s = hy + span * t0
        out.append(f'<line x1="{f(x_s)}" y1="{f(y_s)}" x2="{f(xb)}" y2="{f(y_end)}"/>')
    for k in range(nh):
        z = 1 + depth * k ** 1.25
        y = hy + span / z
        out.append(f'<line x1="-20" y1="{f(y)}" x2="{W + 20}" y2="{f(y)}"/>')
    return "".join(out)


def grid(card, hy, color=MAGENTA, vx=270, y_end=H, gap=46, nv=16, nh=13, depth=0.5, w=1.4, halo=4, op=1.0, fade=True, flip=False):
    geo = grid_geo(hy, vx, y_end, gap, nv, nh, depth, flip=flip)
    body = tube(card, geo, color, w=w, halo=halo, op=op)
    if fade:
        m = fade_mask(card, hy, hy + (y_end - hy) * 0.55, top_op=0.0, bot_op=1.0)
        body = f'<g mask="{m}">{body}</g>'
    return body


def horizon_glow(card, y, color=MAGENTA, rx=360, ry=26, op=0.9):
    return (glow_spot(card, 270, y, rx, ry * 3, color, op * 0.6)
            + f'<line x1="0" y1="{f(y)}" x2="{W}" y2="{f(y)}" stroke="{light(color, 0.5)}" stroke-width="1.6" opacity="{op}" filter="{ublur(card, 1.5)}"/>'
            + f'<line x1="0" y1="{f(y)}" x2="{W}" y2="{f(y)}" stroke="#FFFFFF" stroke-width="0.6" opacity="{op * 0.8}"/>')


# ---------------------------------------------------------------- soleil à bandes

def sun(card, cx, cy, r, top=YELLOW, mid=ORANGE, bottom=MAGENTA, bands=7, clip_y=None, glow=0.75, band_from=0.0):
    """Le soleil couchant à bandes : les fentes s'épaississent vers l'horizon (de `band_from`·r sous le centre jusqu'au bas visible)."""
    name = nid("sun")
    g = card.grad(name + "g", [(0, top), (0.5, mid), (1, bottom)])
    y_a = cy + r * band_from
    y_b = clip_y if clip_y is not None else cy + r
    cuts = []
    for i in range(bands):
        t = i / bands
        yb = y_a + (y_b - y_a) * t ** 0.85
        hb = 1.4 + (i / max(1, bands - 1)) * 6.5
        cuts.append(f'<rect x="{f(cx - r - 5)}" y="{f(yb)}" width="{f(2 * r + 10)}" height="{f(hb)}" fill="#000000"/>')
    if clip_y is not None:
        cuts.append(f'<rect x="{f(cx - r - 5)}" y="{f(clip_y)}" width="{f(2 * r + 10)}" height="{f(2 * r)}" fill="#000000"/>')
    card.def_once(name + "m", f'<mask id="{card.id(name + "m")}" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}">'
                              f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="#FFFFFF"/>{"".join(cuts)}</mask>')
    halo = glow_spot(card, cx, cy, r * 1.9, r * 1.9, mid, glow * 0.55) + glow_spot(card, cx, cy, r * 1.25, r * 1.25, top, glow * 0.4)
    disc = f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}" mask="url(#{card.id(name + "m")})"/>'
    return halo + disc


# ---------------------------------------------------------------- skyline et bitume mouillé

def skyline(card, seed, x0, x1, base, hmin, hmax, body="#0B0720", rim=MAGENTA, wins=(YELLOW, CYAN, PINK, "#FFFFFF"),
            wmin=16, wmax=44, density=0.28, antenna=0.35, gapmax=4, rim_op=0.8, signs=0.0, sign_colors=(MAGENTA, CYAN, YELLOW)):
    """Une ligne de tours de nuit. Rend (silhouettes+lumières)."""
    rnd = random.Random(seed)
    out_b, out_w, out_r, out_s = [], [], [], []
    x = x0
    while x < x1:
        w = rnd.uniform(wmin, wmax)
        h = rnd.uniform(hmin, hmax)
        top = base - h
        kind = rnd.random()
        if kind < 0.18:
            d = f"M{f(x)} {f(base)} L{f(x)} {f(top + 14)} L{f(x + w * 0.25)} {f(top + 14)} L{f(x + w * 0.25)} {f(top)} L{f(x + w * 0.75)} {f(top)} L{f(x + w * 0.75)} {f(top + 14)} L{f(x + w)} {f(top + 14)} L{f(x + w)} {f(base)}Z"
        elif kind < 0.32:
            d = f"M{f(x)} {f(base)} L{f(x)} {f(top + w * 0.5)} L{f(x + w * 0.5)} {f(top)} L{f(x + w)} {f(top + w * 0.5)} L{f(x + w)} {f(base)}Z"
        elif kind < 0.44:
            d = f"M{f(x)} {f(base)} L{f(x)} {f(top)} L{f(x + w)} {f(top + w * 0.6)} L{f(x + w)} {f(base)}Z"
        else:
            d = f"M{f(x)} {f(base)} L{f(x)} {f(top)} L{f(x + w)} {f(top)} L{f(x + w)} {f(base)}Z"
        shade = mix(body, "#2A1B55", rnd.uniform(0, 0.35))
        out_b.append(f'<path d="{d}" fill="{shade}"/>')
        out_r.append(f'<line x1="{f(x + 1)}" y1="{f(top + (14 if kind < 0.18 else 0))}" x2="{f(x + 1)}" y2="{f(base)}" />')
        if rnd.random() < antenna:
            ax = x + w * rnd.uniform(0.3, 0.7)
            ah = rnd.uniform(10, 34)
            at = top - ah + (14 if kind < 0.18 and not (x + w * 0.25 < ax < x + w * 0.75) else 0)
            out_b.append(f'<line x1="{f(ax)}" y1="{f(top + 2)}" x2="{f(ax)}" y2="{f(at)}" stroke="{shade}" stroke-width="1.6"/>')
            out_w.append(bulb(card, ax, at, 1.3, RED, 0.95))
        cols = max(1, int((w - 6) // 6))
        rows = max(1, int((h - 10) // 8))
        for i in range(cols):
            for j in range(rows):
                if rnd.random() < density:
                    wx = x + 4 + i * 6
                    wy = top + 8 + j * 8 + (14 if kind < 0.18 else 0)
                    if wy > base - 4:
                        continue
                    out_w.append(f'<rect x="{f(wx)}" y="{f(wy)}" width="3" height="4" fill="{rnd.choice(wins)}" opacity="{f(rnd.uniform(0.35, 0.95))}"/>')
        if signs and rnd.random() < signs and h > 60:
            sc = rnd.choice(sign_colors)
            sy = top + rnd.uniform(14, h * 0.5)
            out_s.append((x + w * 0.5, sy, min(w * 0.7, 18), sc))
        x += w + rnd.uniform(0, gapmax)
    rimgeo = "".join(out_r)
    sil = "".join(out_b)
    lights = "".join(out_w)
    signs_m = "".join(tube(card, f'<rect x="{f(sx - sw / 2)}" y="{f(sy)}" width="{f(sw)}" height="{f(sw * 0.55)}" rx="2"/>', sc, 1.2, 3) for sx, sy, sw, sc in out_s)
    return sil + fine(rimgeo, rim, 0.9, rim_op) + lights + signs_m


def reflect(card, markup, axis, squash=0.7, blur=2.2, op=0.42, fade_to=None):
    """Reflet sur le bitume mouillé : le dessin renversé sous `axis`, écrasé, flouté, strié."""
    fade_to = fade_to or axis + 220
    m = fade_mask(card, axis, fade_to, top_op=1.0, bot_op=0.0)
    return (f'<g mask="{m}"><g opacity="{op}" filter="{ublur(card, blur)}">'
            f'<g transform="matrix(1 0 0 {-squash} 0 {f(axis * (1 + squash))})">{markup}</g></g></g>')


def ripples(seed, y0, y1, color="#000000", n=40, op=0.5, x0=0, x1=W):
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        y = rnd.uniform(y0, y1)
        xa = rnd.uniform(x0 - 40, x1)
        L = rnd.uniform(30, 180)
        out.append(f'<line x1="{f(xa)}" y1="{f(y)}" x2="{f(xa + L)}" y2="{f(y)}" stroke="{color}" stroke-width="{f(rnd.uniform(0.6, 2.2))}" opacity="{f(rnd.uniform(op * 0.4, op))}"/>')
    return "".join(out)


def streaks(card, seed, xs, y0, y1, colors, w=(2, 7), op=0.5):
    """Traînées verticales de lumière sur le sol mouillé."""
    rnd = random.Random(seed)
    out = []
    for x in xs:
        c = rnd.choice(colors)
        ww = rnd.uniform(*w)
        g = lgrad(card, nid("stk"), [(0, c, op), (1, c, 0)])
        out.append(f'<rect x="{f(x - ww / 2)}" y="{f(y0)}" width="{f(ww)}" height="{f(y1 - y0)}" fill="{g}" filter="{ublur(card, 1.6)}"/>')
    return "".join(out)


# ---------------------------------------------------------------- circuits imprimés

def traces(seed, x0, x1, y0, y1, n, step=(16, 54), jog=0.45, horizontal=False, end_via=True, mid_via=0.2):
    """Pistes de circuit imprimé dans une bande, segments droits et diagonales à 45°.
    Rend (geo des pistes, liste des vias)."""
    rnd = random.Random(seed)
    if horizontal:
        x0, y0, x1, y1 = y0, x0, y1, x1
    lane = (x1 - x0) / n
    paths, vias = [], []
    for i in range(n):
        x = x0 + (i + 0.5) * lane
        y = y0 + rnd.uniform(0, 20)
        stop = y1 - rnd.uniform(0, (y1 - y0) * 0.45)
        pts = [(x, y)]
        while y < stop:
            if rnd.random() < jog:
                dx = rnd.choice((-lane, lane)) * rnd.choice((0.5, 1))
                if not (x0 + lane * 0.3 < x + dx < x1 - lane * 0.3):
                    dx = -dx
                x += dx
                y += abs(dx)
            else:
                y += rnd.uniform(*step)
            y = min(y, stop)
            pts.append((x, y))
            if rnd.random() < mid_via:
                vias.append((x, y, 1.6))
        if end_via:
            vias.append((x, y, 2.6))
        if horizontal:
            pts = [(b, a) for a, b in pts]
        paths.append("M" + " L".join(f"{f(a)} {f(b)}" for a, b in pts))
    if horizontal:
        vias = [(b, a, r) for a, b, r in vias]
    geo = "".join(f'<path d="{d}"/>' for d in paths)
    return geo, vias


def vias_markup(card, vias, color, hole=INK):
    out = []
    for x, y, r in vias:
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r + 1.2)}" fill="{color}" opacity="0.9"/>'
                   f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.5)}" fill="{hole}"/>')
    return f'<g filter="{ublur(card, 0.4)}">{"".join(out)}</g>'


def circuit(card, seed, x0, x1, y0, y1, n, color=CYAN, w=1.1, halo=3, horizontal=False, op=1.0, **kw):
    geo, vias = traces(seed, x0, x1, y0, y1, n, horizontal=horizontal, **kw)
    return f'<g opacity="{op}">' + tube(card, geo, color, w=w, halo=halo) + vias_markup(card, vias, light(color, 0.4)) + "</g>"


def chip(card, cx, cy, s, body="#0E0A1E", pin=GOLD, label=None, pins=6):
    """Une puce : boîtier sombre, broches dorées sur les quatre côtés."""
    h = s / 2
    out = [f'<rect x="{f(cx - h)}" y="{f(cy - h)}" width="{f(s)}" height="{f(s)}" rx="{f(s * 0.06)}" fill="{body}" stroke="#3A2C66" stroke-width="1"/>']
    gap = s / (pins + 1)
    for i in range(pins):
        p = -h + gap * (i + 1)
        for x1, y1, x2, y2 in ((cx + p, cy - h, cx + p, cy - h - s * 0.12), (cx + p, cy + h, cx + p, cy + h + s * 0.12),
                               (cx - h, cy + p, cx - h - s * 0.12, cy + p), (cx + h, cy + p, cx + h + s * 0.12, cy + p)):
            out.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{pin}" stroke-width="{f(max(1, s * 0.04))}"/>')
    out.append(f'<rect x="{f(cx - h * 0.62)}" y="{f(cy - h * 0.62)}" width="{f(s * 0.62)}" height="{f(s * 0.62)}" fill="none" stroke="{pin}" stroke-width="0.6" opacity="0.6"/>')
    if label:
        out.append(f'<text x="{f(cx)}" y="{f(cy + s * 0.08)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="{f(s * 0.16)}" fill="{pin}" opacity="0.8">{esc(label)}</text>')
    return "".join(out)


# ---------------------------------------------------------------- HUD

def brackets_geo(x0, y0, x1, y1, L=26):
    return (f'<path d="M{f(x0)} {f(y0 + L)} L{f(x0)} {f(y0)} L{f(x0 + L)} {f(y0)}"/>'
            f'<path d="M{f(x1 - L)} {f(y0)} L{f(x1)} {f(y0)} L{f(x1)} {f(y0 + L)}"/>'
            f'<path d="M{f(x1)} {f(y1 - L)} L{f(x1)} {f(y1)} L{f(x1 - L)} {f(y1)}"/>'
            f'<path d="M{f(x0 + L)} {f(y1)} L{f(x0)} {f(y1)} L{f(x0)} {f(y1 - L)}"/>')


def ruler(x, y0, y1, step=8, major=5, L=(4, 10), side=1, color=CYAN, op=0.8, w=0.8):
    out = []
    i = 0
    y = y0
    while y <= y1:
        ln = L[1] if i % major == 0 else L[0]
        out.append(f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(x + side * ln)}" y2="{f(y)}"/>')
        y += step
        i += 1
    return fine("".join(out), color, w, op)


def hruler(y, x0, x1, step=8, major=5, L=(4, 10), side=1, color=CYAN, op=0.8, w=0.8):
    out = []
    i = 0
    x = x0
    while x <= x1:
        ln = L[1] if i % major == 0 else L[0]
        out.append(f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(x)}" y2="{f(y + side * ln)}"/>')
        x += step
        i += 1
    return fine("".join(out), color, w, op)


def label(x, y, text, color=CYAN, size=7.5, anchor="start", op=0.85, ls=1.6, weight=800, rotate=0):
    tr = f' transform="rotate({rotate} {f(x)} {f(y)})"' if rotate else ""
    return (f'<text x="{f(x)}" y="{f(y)}" text-anchor="{anchor}" font-family="{SANS}" font-weight="{weight}" font-size="{size}" '
            f'letter-spacing="{ls}" fill="{color}" opacity="{op}"{tr}>{esc(text)}</text>')


def arc_d(cx, cy, r, a0, a1):
    x0, y0 = pt(cx, cy, r, a0)
    x1, y1 = pt(cx, cy, r, a1)
    large = 1 if (a1 - a0) % 360 > 180 else 0
    return f"M{f(x0)} {f(y0)} A{f(r)} {f(r)} 0 {large} 1 {f(x1)} {f(y1)}"


def reticle_geo(cx, cy, r, gaps=4, tick=6):
    out = []
    seg = 360 / gaps
    for i in range(gaps):
        out.append(f'<path d="{arc_d(cx, cy, r, i * seg + 8, (i + 1) * seg - 8)}"/>')
    for a in range(0, 360, 90):
        x1, y1 = pt(cx, cy, r - tick, a)
        x2, y2 = pt(cx, cy, r + tick, a)
        out.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}"/>')
    return "".join(out)


def loupe(card, cx, cy, r, color, content, tag=None, tag2=None, bg="#06031A"):
    """Une loupe de HUD : disque sombre, contenu (le minuscule), anneau à graduations, étiquette."""
    clip = nid("lp")
    card.def_once(clip, f'<clipPath id="{card.id(clip)}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}"/></clipPath>')
    ticks = "".join(
        f'<line x1="{f(pt(cx, cy, r + 3, a)[0])}" y1="{f(pt(cx, cy, r + 3, a)[1])}" x2="{f(pt(cx, cy, r + (8 if a % 30 == 0 else 5), a)[0])}" y2="{f(pt(cx, cy, r + (8 if a % 30 == 0 else 5), a)[1])}"/>'
        for a in range(0, 360, 10))
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{bg}" opacity="0.92"/>',
           f'<g clip-path="url(#{card.id(clip)})">{content}</g>',
           tube(card, f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}"/>', color, 1.6, 5),
           fine(ticks, color, 0.8, 0.8)]
    if tag:
        lines = tag.split("\n")
        tw = max(len(t) for t in lines) * 5.6 + 12
        th = 13 + 10 * (len(lines) - 1)
        tx = min(max(cx, tw / 2 + 4), W - tw / 2 - 4)
        out.append(f'<rect x="{f(tx - tw / 2)}" y="{f(cy + r + 9)}" width="{f(tw)}" height="{th}" rx="6.5" fill="#05020F" opacity="0.85" stroke="{color}" stroke-width="0.6"/>')
        for k, t in enumerate(lines):
            out.append(label(tx, cy + r + 18.5 + k * 10, t, light(color, 0.45) if k == 0 else light(color, 0.7), 7 if k == 0 else 6.5, "middle", 1 if k == 0 else 0.85, 1.1))
    if tag2:
        out.append(label(cx, cy - r - 11, tag2, light(color, 0.3), 7, "middle", 0.7))
    return "".join(out)


# ---------------------------------------------------------------- ondes, égaliseur, glitch, pixels

def wave_d(x0, x1, y, amp, cycles, phase=0.0, env="bell", n=160):
    pts = []
    for i in range(n + 1):
        t = i / n
        e = math.sin(math.pi * t) ** 1.5 if env == "bell" else (1 if env == "flat" else (1 - t))
        x = x0 + (x1 - x0) * t
        yy = y + amp * e * math.sin(2 * math.pi * cycles * t + phase)
        pts.append(f"{f(x)} {f(yy)}")
    return "M" + " L".join(pts)


def vwave_d(x, y0, y1, amp, cycles, phase=0.0, env="flat", n=160):
    pts = []
    for i in range(n + 1):
        t = i / n
        e = math.sin(math.pi * t) ** 1.5 if env == "bell" else 1
        y = y0 + (y1 - y0) * t
        xx = x + amp * e * math.sin(2 * math.pi * cycles * t + phase)
        pts.append(f"{f(xx)} {f(y)}")
    return "M" + " L".join(pts)


def eq_column(card, seed, x, y_base, w, nseg, seg_h, gap, level, colors=(LIME, YELLOW, ORANGE, MAGENTA), up=True, dim=0.1):
    rnd = random.Random(seed)
    out = []
    for i in range(nseg):
        t = i / max(1, nseg - 1)
        c = colors[min(len(colors) - 1, int(t * len(colors)))]
        y = y_base - (i + 1) * (seg_h + gap) if up else y_base + i * (seg_h + gap)
        on = i < level
        out.append(f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(seg_h)}" rx="1" fill="{c}" opacity="{1 if on else dim}"/>')
    lit = "".join(out)
    return f'<g filter="{ublur(card, 3)}" opacity="0.7">{lit}</g>{lit}'


def glitch_bars(seed, region, n, colors=(MAGENTA, CYAN, "#FFFFFF"), hmax=4, op=(0.25, 0.8)):
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x = rnd.uniform(x0, x1)
        y = rnd.uniform(y0, y1)
        w = rnd.uniform(8, 70)
        h = rnd.uniform(1, hmax)
        out.append(f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="{rnd.choice(colors)}" opacity="{f(rnd.uniform(*op))}"/>')
    return "".join(out)


def pixel_cluster(seed, cx, cy, r, size=5, colors=(MAGENTA, CYAN, VIOLET), density=0.6):
    rnd = random.Random(seed)
    out = []
    n = int(r // size)
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            d = math.hypot(i, j) / max(1, n)
            if d <= 1 and rnd.random() < density * (1 - d) ** 0.7:
                out.append(f'<rect x="{f(cx + i * size)}" y="{f(cy + j * size)}" width="{f(size - 1)}" height="{f(size - 1)}" fill="{rnd.choice(colors)}" opacity="{f(rnd.uniform(0.3, 1))}"/>')
    return "".join(out)


def rgb_split(markup, dx=1.6, op=0.65):
    return (f'<g transform="translate({-dx} 0)" opacity="{op}" style="mix-blend-mode:screen">{markup.replace("CHAN", "#FF2BD6")}</g>'
            f'<g transform="translate({dx} 0)" opacity="{op}" style="mix-blend-mode:screen">{markup.replace("CHAN", "#29E7FF")}</g>')


# ---------------------------------------------------------------- hologramme

def holo_bird(card, pose, x, y, size, color=CYAN, flip=False, rotate=0, op=0.92, beam=True, beam_h=60):
    r, g, b = (v / 255 for v in rgb(color))
    fname = nid("holo")
    card.def_once(fname, f'<filter id="{card.id(fname)}" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">'
                         f'<feColorMatrix type="matrix" values="{r * .35} {r * .6} {r * .2} 0 {r * .15}  {g * .35} {g * .6} {g * .2} 0 {g * .15}  {b * .35} {b * .6} {b * .2} 0 {b * .15}  0 0 0 0.78 0" result="t"/>'
                         f'<feGaussianBlur in="t" stdDeviation="5" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="t"/></feMerge></filter>')
    sname = nid("hsl")
    card.def_once(sname, f'<pattern id="{card.id(sname)}" width="6" height="3" patternUnits="userSpaceOnUse"><rect width="6" height="2" fill="#FFFFFF"/><rect y="2" width="6" height="1" fill="#FFFFFF" opacity="0.25"/></pattern>')
    mname = nid("hm")
    card.def_once(mname, f'<mask id="{card.id(mname)}" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="url(#{card.id(sname)})"/></mask>')
    tr = f"translate({f(x)} {f(y)}) rotate({rotate})" + (" scale(-1 1)" if flip else "")
    out = []
    if beam:
        bg = lgrad(card, nid("hb"), [(0, color, 0.0), (1, color, 0.45)])
        out.append(f'<path d="M{f(x - size * 0.42)} {f(y + size * 0.1)} L{f(x + size * 0.42)} {f(y + size * 0.1)} L{f(x + 16)} {f(y + size * 0.42 + beam_h)} L{f(x - 16)} {f(y + size * 0.42 + beam_h)}Z" fill="{bg}"/>')
        out.append(f'<ellipse cx="{f(x)}" cy="{f(y + size * 0.42 + beam_h)}" rx="26" ry="6" fill="#120A26" stroke="{color}" stroke-width="1.4"/>')
        out.append(f'<ellipse cx="{f(x)}" cy="{f(y + size * 0.42 + beam_h - 1)}" rx="14" ry="3" fill="{light(color, 0.6)}" filter="{ublur(card, 2)}"/>')
    out.append(f'<g mask="url(#{card.id(mname)})" opacity="{op}"><g transform="{tr}" filter="url(#{card.id(fname)})">'
               f'<image href="{base._data_uri(pose)}" x="{f(-size / 2)}" y="{f(-size / 2)}" width="{f(size)}" height="{f(size)}" preserveAspectRatio="xMidYMid meet"/></g></g>')
    return "".join(out)


def birds(card, spots, glow=None):
    """Mee et Meo à des places libres : [(pose, x, y, size, flip, rot)]. `glow` : une lueur colorée sous chacun."""
    for pose, x, y, s, flip, rot in spots:
        if glow:
            card.add(f'<g data-follows-bird="{card.birds}"><ellipse cx="{f(x)}" cy="{f(y + s * 0.08)}" rx="{f(s * 0.42)}" ry="{f(s * 0.36)}" fill="{glow}" opacity="0.38" filter="{ublur(card, 12)}"/></g>')
        bird(card, pose, x, y, s, flip=flip, rotate=rot)


# ---------------------------------------------------------------- la plaque néon

from base import plate_layer  # noqa: E402  la couche « plate » et ses emplacements de texte


@plate_layer
def plaque(card, title, message=None, y=752, c1=MAGENTA, c2=CYAN, chrome_kind="cool", style="glass", kicker=KICK, date=DATE,
           badge=None, title_size=40, title_font=CINZEL, msg_color=YELLOW, panel=("#170B36", "#05020F"), split=True, x0=56, x1=484,
           kicker_color=None, bulbs=None):
    """L'inscription : verre sombre cerclé d'un tube, titre en chrome (dédoublé magenta/cyan), message en néon manuscrit."""
    h = 130 if message else 108
    if style == "hud":
        d = chamfer_d(x0, y, x1, y + h, 16)
    elif style == "pill":
        d = rrect_d(x0, y, x1, y + h, h / 2 - 6)
    else:
        d = rrect_d(x0, y, x1, y + h, 20)
    if style != "sign":
        pg = card.grad(nid("pg"), [(0, panel[0]), (1, panel[1])])
        card.add(f'<path d="{d}" fill="#000000" opacity="0.55" filter="{ublur(card, 10)}" transform="translate(0 8)"/>')
        card.add(f'<path d="{d}" fill="{pg}" opacity="0.9"/>')
        card.add(f'<path d="M{x0 + 24} {y + 3} L{x1 - 24} {y + 3}" stroke="#FFFFFF" stroke-width="1" opacity="0.18"/>')
        card.add(tube(card, f'<path d="{d}"/>', c1, 2.4, 8))
        inset = chamfer_d(x0 + 7, y + 7, x1 - 7, y + h - 7, 11) if style == "hud" else rrect_d(x0 + 7, y + 7, x1 - 7, y + h - 7, 14 if style != "pill" else h / 2 - 13)
        card.add(fine(f'<path d="{inset}"/>', c2, 0.9, 0.55))
        if style == "hud":
            card.add(fine(brackets_geo(x0 - 6, y - 6, x1 + 6, y + h + 6, 18), c2, 1.4, 0.9))
    else:
        card.add(f'<ellipse cx="270" cy="{y + h / 2}" rx="250" ry="{h * 0.62}" fill="#05020D" opacity="0.72" filter="{ublur(card, 14)}"/>')
    if bulbs:
        pts = []
        per = 2 * (x1 - x0) + 2 * h
        k = int(per // 15)
        for i in range(k):
            s = i * per / k
            if s < x1 - x0:
                px, py = x0 + s, y - 9
            elif s < x1 - x0 + h:
                px, py = x1 + 9, y + (s - (x1 - x0))
            elif s < 2 * (x1 - x0) + h:
                px, py = x1 - (s - (x1 - x0) - h), y + h + 9
            else:
                px, py = x0 - 9, y + h - (s - 2 * (x1 - x0) - h)
            pts.append(bulb(card, px, py, 2.1, bulbs, 1 if i % 2 == 0 else 0.55))
        card.add("".join(pts))
    if badge:
        bw = 104
        bd = rrect_d(270 - bw / 2, y - 13, 270 + bw / 2, y + 11, 12)
        card.add(f'<path d="{bd}" fill="#0A0518"/>' + tube(card, f'<path d="{bd}"/>', c2, 1.4, 4))
        card.add(label(270, y + 3, badge, "#FFFFFF", 10, "middle", 1, 2))
    kc = kicker_color or light(c2, 0.25)
    ky = y + (29 if message else 31)
    card.add(f'<text x="270" y="{ky}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="12" letter-spacing="4.2" fill="{kc}" filter="{ublur(card, 2.5)}" opacity="0.6">{esc(kicker.upper())}</text>')
    card.add(f'<text x="270" y="{ky}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="12" letter-spacing="4.2" fill="{kc}">{esc(kicker.upper())}</text>')
    ty = ky + (41 if message else 43)
    ta = f'x="270" y="{ty}" text-anchor="middle" font-family="{title_font}" font-weight="900" font-size="{title_size}"'
    t = esc(title)
    card.add(f'<text {ta} fill="{c1}" opacity="0.75" filter="{ublur(card, 8)}">{t}</text>')
    if split:
        card.add(f'<text {ta} fill="{MAGENTA}" opacity="0.8" transform="translate(-1.8 0.6)">{t}</text>')
        card.add(f'<text {ta} fill="{CYAN}" opacity="0.8" transform="translate(1.8 -0.4)">{t}</text>')
    card.add(f'<text {ta} fill="{chrome(card, chrome_kind)}" stroke="#12062A" stroke-width="0.9" paint-order="stroke">{t}</text>')
    if message:
        card.add(neon_text(card, 270, ty + 33, message, msg_color, 28, HAND, 700, halo=4.5))
        card.add(f'<text x="270" y="{ty + 52}" text-anchor="middle" font-family="{SANS}" font-weight="700" font-size="11.5" letter-spacing="1.4" fill="{light(c2, 0.55)}" opacity="0.85">{esc(date)}</text>')
    else:
        card.add(f'<text x="270" y="{ty + 27}" text-anchor="middle" font-family="{SANS}" font-weight="700" font-size="12" letter-spacing="1.4" fill="{light(c2, 0.55)}" opacity="0.85">{esc(date)}</text>')


# ---------------------------------------------------------------- manifeste

MANIFEST = []
ORDER = ["ambassadeur-5", "ambassadeur-4", "ambassadeur-3", "ambassadeur-2", "ambassadeur-1", "orateur-a", "orateur-b", "orateur-c",
         "oracle-a", "oracle-b", "oracle-c", "legende-5", "legende-4", "legende-3", "legende-2", "legende-1", "mythe-a", "mythe-b", "mythe-c"]


def register(stem, rank, division, option, name, story, layout, message):
    MANIFEST.append({"file": f"{SLUG}-{stem}.jpg", "rank": rank, "division": division, "option": option, "name": name,
                     "story": story, "layout": layout, "message": message})


def save(card, stem):
    card.save(OUT / f"{SLUG}-{stem}.svg")


def write_manifest():
    path = OUT / "manifest.json"
    mine = {m["file"] for m in MANIFEST}
    existing = []
    if path.exists():
        existing = [m for m in json.loads(path.read_text()) if m["file"] not in mine]
    allm = existing + MANIFEST

    def key(m):
        stem = m["file"].replace(SLUG + "-", "").replace(".jpg", "")
        return ORDER.index(stem) if stem in ORDER else 99

    path.write_text(json.dumps(sorted(allm, key=key), ensure_ascii=False, indent=2))
