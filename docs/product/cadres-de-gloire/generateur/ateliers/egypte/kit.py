"""Égypte solaire - le kit de composition : palette, reliefs, fenêtres, masques, inscriptions, cadres."""

import json
import math
import random
import sys
from pathlib import Path

ATL = Path(__file__).resolve().parent
ROOT = ATL.parents[1]
sys.path.insert(0, str(ROOT / "lib"))
sys.path.insert(0, str(ATL))

from base import (  # noqa: E402,F401
    W, H, f, pt, esc, Card, photo, bird, crest, plaque, sparkle, galaxy, rays, METALS,
    CINZEL, CINZEL_DECO, GARAMOND, FRAUNCES, SANS, HAND,
)

SLUG = "egypte"
OUT = ROOT / "out" / SLUG
DATE = "10 octobre 2026"
KICK = "Nouveau rang · Égypte solaire"

GOLD3 = ("#FFF4C2", "#E8B53C", "#8A5A12")
GOLD = "#E8B53C"
GOLD_HI = "#FFF4C2"
GOLD_LO = "#8A5A12"
GOLD_D = "#5C3A0A"
LAPIS = "#1F3F9A"
LAPIS_D = "#0B1847"
LAPIS_L = "#4F7FE6"
TURQ = "#2FC6B5"
TURQ_L = "#9BEFE2"
TURQ_D = "#0B6E66"
CARN = "#C8432B"
CARN_L = "#F27E55"
CARN_D = "#6A170C"
SAND = "#EBCB8F"
SAND_M = "#C9974F"
SAND_D = "#7A5326"
EBONY = "#100906"
NIGHT = "#070A1F"
SILVER3 = ("#FFFFFF", "#C9D2DE", "#6D7889")

MANIFEST = []


def record(file, rank, division, option, name, story, layout, message):
    MANIFEST.append({"file": file, "rank": rank, "division": division, "option": option, "name": name,
                     "story": story, "layout": layout, "message": message})


def start(uid, top="#3A2A1E", bottom="#120C08", rim="#FFC27A", glow=0.22):
    c = Card(uid)
    photo(c, top, bottom, rim, 2, glow)
    return c


# ---------------------------------------------------------------- filtres

def bevel(card, name="bevel", blur=1.4, scale=3.0, light="#FFF6D8", spec=1.15, exp=20, shadow=True, sd=3, dy=3, sop=0.6, az=235, el=42):
    """Relief métallique : éclairage spéculaire sur l'alpha flouté, ombre portée en dessous."""
    sh = (
        f'<feGaussianBlur in="SourceAlpha" stdDeviation="{sd}" result="sb"/><feOffset in="sb" dy="{dy}" result="so"/>'
        f'<feComponentTransfer in="so" result="sop"><feFuncA type="linear" slope="{sop}"/></feComponentTransfer>'
        if shadow else ""
    )
    merge = '<feMergeNode in="sop"/>' if shadow else ""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">'
        f'<feGaussianBlur in="SourceAlpha" stdDeviation="{blur}" result="b"/>'
        f'<feSpecularLighting in="b" surfaceScale="{scale}" specularConstant="{spec}" specularExponent="{exp}" lighting-color="{light}" result="s">'
        f'<feDistantLight azimuth="{az}" elevation="{el}"/></feSpecularLighting>'
        f'<feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>'
        f'<feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k1="0" k2="1" k3="0.85" k4="0" result="lit"/>'
        f'{sh}<feMerge>{merge}<feMergeNode in="lit"/></feMerge></filter>',
    )
    return f"url(#{card.id(name)})"


def ublur(card, name, sd):
    """Flou dont la région couvre toute la carte."""
    card.def_once(name, f'<filter id="{card.id(name)}" filterUnits="userSpaceOnUse" x="-40" y="-40" width="{W + 80}" height="{H + 80}"><feGaussianBlur stdDeviation="{sd}"/></filter>')
    return f"url(#{card.id(name)})"


def cloud_filter(card, name, freq="0.012", octaves=4, seed=3, a=2.4, b=-0.9):
    """La forme filtrée ne garde sa couleur que là où le bruit fractal est dense (nuages, nébuleuses, sable)."""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" filterUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="{octaves}" seed="{seed}" result="n"/>'
        f'<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  {a} 0 0 0 {b}" result="m"/>'
        f'<feComposite in="SourceGraphic" in2="m" operator="in"/></filter>',
    )
    return f"url(#{card.id(name)})"


def stone_filter(card, name="stone", freq="0.9 0.35", seed=4, scale=1.6, light="#FFF2DC", el=48, k1=1.25):
    """Grain de pierre / de sable : relief diffus d'un bruit fin, multiplié sur la forme."""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" filterUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="3" seed="{seed}" result="n"/>'
        f'<feDiffuseLighting in="n" surfaceScale="{scale}" lighting-color="{light}" diffuseConstant="1.1" result="l"><feDistantLight azimuth="225" elevation="{el}"/></feDiffuseLighting>'
        f'<feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="{k1}" k2="0" k3="0" k4="0" result="t"/>'
        f'<feComposite in="t" in2="SourceAlpha" operator="in"/></filter>',
    )
    return f"url(#{card.id(name)})"


def metal_grad(card, name, metal=GOLD3, x1=0, y1=0, x2=1, y2=1):
    hi, mid, lo = metal
    return card.grad(name, [(0, hi), (0.28, mid), (0.5, lo), (0.72, mid), (1, hi)], x1, y1, x2, y2)


def vgold(card, name="vgold", metal=GOLD3):
    """Or vertical, pour les colonnes, les bandeaux et les lettres."""
    hi, mid, lo = metal
    return card.grad(name, [(0, hi), (0.45, mid), (0.75, lo), (1, mid)], 0, 0, 0, 1)


def hgold(card, name="hgold", metal=GOLD3):
    hi, mid, lo = metal
    return card.grad(name, [(0, lo), (0.2, mid), (0.5, hi), (0.8, mid), (1, lo)], 0, 0, 1, 0)


# ---------------------------------------------------------------- fenêtres

def rrect(x0, y0, x1, y1, r):
    return (
        f"M{f(x0 + r)} {f(y0)} L{f(x1 - r)} {f(y0)} Q{f(x1)} {f(y0)} {f(x1)} {f(y0 + r)} L{f(x1)} {f(y1 - r)} "
        f"Q{f(x1)} {f(y1)} {f(x1 - r)} {f(y1)} L{f(x0 + r)} {f(y1)} Q{f(x0)} {f(y1)} {f(x0)} {f(y1 - r)} "
        f"L{f(x0)} {f(y0 + r)} Q{f(x0)} {f(y0)} {f(x0 + r)} {f(y0)} Z"
    )


def arch(x0, x1, spring, apex, y1, r=16):
    rx = (x1 - x0) / 2
    ry = spring - apex
    return (
        f"M{f(x0)} {f(spring)} A{f(rx)} {f(ry)} 0 0 1 {f(x1)} {f(spring)} L{f(x1)} {f(y1 - r)} Q{f(x1)} {f(y1)} {f(x1 - r)} {f(y1)} "
        f"L{f(x0 + r)} {f(y1)} Q{f(x0)} {f(y1)} {f(x0)} {f(y1 - r)} Z"
    )


def pyramid_win(x0, x1, shoulder, apex, y1, r=14):
    """Fenêtre au sommet en pyramide (le pyramidion se pose sur l'apex)."""
    cx = (x0 + x1) / 2
    return (
        f"M{f(x0)} {f(shoulder)} L{f(cx)} {f(apex)} L{f(x1)} {f(shoulder)} L{f(x1)} {f(y1 - r)} Q{f(x1)} {f(y1)} {f(x1 - r)} {f(y1)} "
        f"L{f(x0 + r)} {f(y1)} Q{f(x0)} {f(y1)} {f(x0)} {f(y1 - r)} Z"
    )


def cartouche_win(x0, y0, x1, y1):
    """Fenêtre en cartouche vertical : la photo est inscrite comme un nom royal."""
    r = (x1 - x0) / 2
    cx = (x0 + x1) / 2
    ry = min(r, 120)
    return (
        f"M{f(x0)} {f(y0 + ry)} A{f(r)} {f(ry)} 0 0 1 {f(x1)} {f(y0 + ry)} L{f(x1)} {f(y1 - ry)} "
        f"A{f(r)} {f(ry)} 0 0 1 {f(x0)} {f(y1 - ry)} Z"
    )


def deco_mask(card, d, name="dm"):
    card.def_once(
        name,
        f'<mask id="{card.id(name)}" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}">'
        f'<rect width="{W}" height="{H}" fill="#FFFFFF"/><path d="{d}" fill="#000000"/></mask>',
    )
    return f"url(#{card.id(name)})"


def win_clip(card, d, name="wc"):
    card.def_once(name, f'<clipPath id="{card.id(name)}"><path d="{d}"/></clipPath>')
    return f"url(#{card.id(name)})"


def inner_shadow(card, d, w=30, sd=12, op=0.6, color="#000000"):
    return f'<g clip-path="{win_clip(card, d)}"><path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{op}" filter="{card.blur("ish", sd)}"/></g>'


def light_grade(card, d, color="#FFB257", cx=0.5, cy=0.0, op=0.32, name="lg", r=0.9):
    """Une lumière d'ambiance sur la photo (étalonnage), dans la fenêtre seulement."""
    g = card.rgrad(name, [(0, color, op), (0.6, color, op * 0.35), (1, color, 0)], cx, cy, r)
    return f'<g clip-path="{win_clip(card, d)}" style="mix-blend-mode:screen"><rect width="{W}" height="{H}" fill="{g}"/></g>'


def rim(card, d, metal=GOLD3, w=5, name="rim", inner=True):
    hi, mid, lo = metal
    g = card.grad(name + "-g", [(0, hi), (0.3, mid), (0.5, lo), (0.7, mid), (1, hi)], 0, 0, 1, 1)
    out = f'<g filter="{bevel(card, name + "-bv", 1.0, 2.4, sd=4, dy=3, sop=0.7)}"><path d="{d}" fill="none" stroke="{g}" stroke-width="{w}"/></g>'
    if inner:
        out += f'<path d="{d}" fill="none" stroke="{hi}" stroke-width="0.8" opacity="0.65"/>'
    return out


def wrap_since(card, n, attrs):
    seg = "".join(card.body[n:])
    del card.body[n:]
    card.add(f"<g {attrs}>{seg}</g>")


# ---------------------------------------------------------------- inscription

def stadium(x0, y0, x1, y1):
    r = (y1 - y0) / 2
    return (
        f"M{f(x0 + r)} {f(y0)} L{f(x1 - r)} {f(y0)} A{f(r)} {f(r)} 0 0 1 {f(x1 - r)} {f(y1)} "
        f"L{f(x0 + r)} {f(y1)} A{f(r)} {f(r)} 0 0 1 {f(x0 + r)} {f(y0)} Z"
    )


def cornice_band(card, name, x0, x1, y, h, cols=(LAPIS, GOLD, TURQ, GOLD, CARN, GOLD), flare=10, metal=GOLD3, leaf=9):
    """La gorge égyptienne : un cavet évasé, rayé de palmes peintes, sur un tore lié."""
    hi, mid, lo = metal
    out = []
    top0, top1 = x0 - flare, x1 + flare
    body = f"M{f(x0)} {f(y + h)} L{f(top0)} {f(y + 2)} Q{f((top0 + top1) / 2)} {f(y - 2)} {f(top1)} {f(y + 2)} L{f(x1)} {f(y + h)} Z"
    cid = card.id(name + "-cl")
    card.def_once(name + "-cl", f'<clipPath id="{cid}"><path d="{body}"/></clipPath>')
    out.append(f'<path d="{body}" fill="{GOLD_D}"/>')
    stripes = []
    n = int((top1 - top0) / leaf) + 1
    for i in range(n):
        xa = top0 + i * leaf
        c = cols[i % len(cols)]
        stripes.append(f'<path d="M{f(xa + 1)} {f(y + h)} L{f(xa + 1)} {f(y + 6)} Q{f(xa + leaf / 2)} {f(y + 1)} {f(xa + leaf - 1)} {f(y + 6)} L{f(xa + leaf - 1)} {f(y + h)} Z" fill="{c}"/>')
    shade = card.grad(name + "-sh", [(0, "#000000"), (0.35, "#000000"), (1, "#FFFFFF")], 0, 0, 0, 1)
    out.append(f'<g clip-path="url(#{cid})">{"".join(stripes)}<rect x="{f(top0)}" y="{f(y)}" width="{f(top1 - top0)}" height="{f(h)}" fill="{shade}" opacity="0.28" style="mix-blend-mode:multiply"/></g>')
    out.append(f'<path d="{body}" fill="none" stroke="{hi}" stroke-width="1.2"/>')
    ty = y + h
    tg = card.grad(name + "-tor", [(0, hi), (0.5, mid), (1, lo)], 0, 0, 0, 1)
    out.append(f'<rect x="{f(x0 - 2)}" y="{f(ty)}" width="{f(x1 - x0 + 4)}" height="7" rx="3.5" fill="{tg}"/>')
    ties = "".join(f'<line x1="{f(x0 + 4 + i * 7)}" y1="{f(ty + 6.5)}" x2="{f(x0 + 8 + i * 7)}" y2="{f(ty + 0.5)}" stroke="{lo}" stroke-width="1.1"/>' for i in range(int((x1 - x0) / 7)))
    out.append(f'<g opacity="0.75">{ties}</g>')
    return "".join(out)


from base import plate_layer  # noqa: E402  la couche « plate » et ses emplacements de texte


@plate_layer
def inscription(card, kicker, title, message=None, y=750, style="cartouche", metal=GOLD3, panel=("#1D0F08", "#070302"),
                ink="#FFF4DC", accent=None, title_size=38, w=424, date=DATE, msg_color=None, title_font=CINZEL, extra="",
                cornice_cols=None, badge=None):
    """L'inscription du moment : sur-titre, titre en métal, message manuscrit de l'auteur, date.

    styles : cartouche (le nom royal, ovale lié) | corniche (panneau sous une gorge égyptienne) |
             stele (stèle cintrée) | nuit (filet d'or et étoiles) | prisme (Mythe)."""
    hi, mid, lo = metal
    accent = accent or mid
    h = 132 if message else 110
    x0, x1 = 270 - w / 2, 270 + w / 2
    pg = card.grad("ins-pan", [(0, panel[0]), (1, panel[1])])
    out = []
    shadow = card.shadow("ins-sh", 0, 8, 10, "#000000", 0.6)
    frame_g = card.grad("ins-frame", [(0, hi), (0.35, mid), (0.5, lo), (0.65, mid), (1, hi)], 0, 0, 1, 1)
    bv = bevel(card, "ins-bv", 0.8, 2.0, shadow=False)
    if style == "cartouche":
        d = stadium(x0, y, x1, y + h)
        out.append(f'<path d="{d}" fill="{pg}" opacity="0.94" filter="{shadow}"/>')
        out.append(f'<g filter="{bv}"><path d="{d}" fill="none" stroke="{frame_g}" stroke-width="4"/></g>')
        out.append(f'<path d="{stadium(x0 + 8, y + 8, x1 - 8, y + h - 8)}" fill="none" stroke="{mid}" stroke-width="1" opacity="0.8" stroke-dasharray="1.2 3.2" stroke-linecap="round"/>')
        out.append(f'<path d="{stadium(x0 + 13, y + 13, x1 - 13, y + h - 13)}" fill="none" stroke="{mid}" stroke-width="0.7" opacity="0.5"/>')
        bx = x1 + 5
        out.append(f'<g filter="{bv}"><rect x="{f(bx)}" y="{f(y + 14)}" width="9" height="{f(h - 28)}" rx="3" fill="{frame_g}"/></g>')
        out.append(f'<g filter="{bv}"><rect x="{f(x0 - 14)}" y="{f(y + 14)}" width="9" height="{f(h - 28)}" rx="3" fill="{frame_g}"/></g>')
    elif style == "corniche":
        ch = 24
        d = rrect(x0, y, x1, y + h, 10)
        out.append(f'<path d="{d}" fill="{pg}" opacity="0.93" filter="{shadow}"/>')
        out.append(f'<g filter="{bv}"><path d="{d}" fill="none" stroke="{frame_g}" stroke-width="3"/></g>')
        out.append(f'<path d="{rrect(x0 + 8, y + 8, x1 - 8, y + h - 8, 6)}" fill="none" stroke="{mid}" stroke-width="0.8" opacity="0.65"/>')
        out.append(cornice_band(card, "ins-cor", x0 + 6, x1 - 6, y - ch - 4, ch, cols=cornice_cols or (LAPIS, GOLD, TURQ, GOLD, CARN, GOLD), metal=metal))
    elif style == "stele":
        d = (f"M{f(x0)} {f(y + h)} L{f(x0)} {f(y + 30)} Q{f(x0)} {f(y)} {f(x0 + 40)} {f(y - 4)} Q{f(270)} {f(y - 26)} {f(x1 - 40)} {f(y - 4)} "
             f"Q{f(x1)} {f(y)} {f(x1)} {f(y + 30)} L{f(x1)} {f(y + h)} Z")
        out.append(f'<path d="{d}" fill="{pg}" opacity="0.9" filter="{shadow}"/>')
        out.append(f'<g filter="{bv}"><path d="{d}" fill="none" stroke="{frame_g}" stroke-width="2.6"/></g>')
    else:
        r = 18
        d = rrect(x0, y, x1, y + h, r)
        out.append(f'<path d="{d}" fill="{pg}" opacity="0.82" filter="{shadow}"/>')
        if style == "prisme":
            pr = card.prism("ins-prism", 0, 0, 1, 1)
            out.append(f'<path d="{d}" fill="none" stroke="{pr}" stroke-width="2.4"/>')
            out.append(f'<path d="{rrect(x0 + 7, y + 7, x1 - 7, y + h - 7, 12)}" fill="none" stroke="{hi}" stroke-width="0.7" opacity="0.5"/>')
        else:
            out.append(f'<path d="{d}" fill="none" stroke="{frame_g}" stroke-width="1.8"/>')
            out.append(f'<path d="{rrect(x0 + 7, y + 7, x1 - 7, y + h - 7, 12)}" fill="none" stroke="{hi}" stroke-width="0.7" opacity="0.45"/>')
            for sx, sy in ((x0 + 22, y + 22), (x1 - 22, y + 22), (x0 + 22, y + h - 22), (x1 - 22, y + h - 22)):
                out.append(sparkle(sx, sy, 6, hi, 0.9))
    out.append(extra)
    if badge:
        out.append(numero_badge(card, 270, y - 2, badge))
    tg = card.grad("ins-title", [(0, hi), (0.55, hi), (1, mid)], 0, 0, 0, 1)
    tsh = card.shadow("ins-tsh", 0, 2, 2, "#000000", 0.75)
    ky = y + (30 if not badge else 32)
    out.append(f'<text x="270" y="{f(ky)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="12" letter-spacing="3.8" fill="{accent}">{esc(kicker.upper())}</text>')
    out.append(f'<text x="270" y="{f(y + 71)}" text-anchor="middle" font-family="{title_font}" font-weight="700" font-size="{title_size}" fill="{tg}" filter="{tsh}">{esc(title)}</text>')
    if message:
        out.append(f'<text x="270" y="{f(y + 104)}" text-anchor="middle" font-family="{HAND}" font-weight="700" font-size="28" fill="{msg_color or ink}">{esc(message)}</text>')
        out.append(f'<text x="270" y="{f(y + 123)}" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="11.5" letter-spacing="1.2" fill="{accent}" opacity="0.92">{esc(date)}</text>')
    else:
        out.append(f'<text x="270" y="{f(y + 95)}" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="12.5" letter-spacing="1.2" fill="{accent}" opacity="0.92">{esc(date)}</text>')
    card.add("".join(out))
    return y + h


def numero_badge(card, cx, cy, text="Nº 42 / 100", name="nb"):
    pr = card.prism(name + "-p", 0, 0, 1, 0)
    return (
        f'<rect x="{f(cx - 62)}" y="{f(cy - 13)}" width="124" height="26" rx="13" fill="#07060F" opacity="0.92"/>'
        f'<rect x="{f(cx - 62)}" y="{f(cy - 13)}" width="124" height="26" rx="13" fill="none" stroke="{pr}" stroke-width="1.6"/>'
        f'<text x="{f(cx)}" y="{f(cy + 5)}" text-anchor="middle" font-family="{CINZEL}" font-weight="700" font-size="14" letter-spacing="1.5" fill="#FFFFFF">{esc(text)}</text>'
    )


# ---------------------------------------------------------------- cadres

def outer_frame(card, metal=GOLD3, m=12, w=4, r=22, inner=True, name="of", prism=False):
    hi, mid, lo = metal
    g = card.prism(name + "-p", 0, 0, 1, 1) if prism else card.grad(name + "-g", [(0, hi), (0.25, mid), (0.5, lo), (0.75, mid), (1, hi)], 0, 0, 1, 1)
    out = [f'<g filter="{bevel(card, name + "-bv", 1.0, 2.6, sd=3, dy=2, sop=0.6)}"><rect x="{m}" y="{m}" width="{W - 2 * m}" height="{H - 2 * m}" rx="{r}" fill="none" stroke="{g}" stroke-width="{w}"/></g>']
    if inner:
        out.append(f'<rect x="{m + 7}" y="{m + 7}" width="{W - 2 * m - 14}" height="{H - 2 * m - 14}" rx="{r - 5}" fill="none" stroke="{mid if not prism else hi}" stroke-width="0.9" opacity="0.7"/>')
    return "".join(out)


def halo(card, cx, cy, r, color, op=0.6, name="halo"):
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{card.rgrad(name, [(0, color, op), (0.5, color, op * 0.35), (1, color, 0)])}"/>'


def sky(card, name, stops, y0=0, y1=H):
    g = card.grad(name, stops)
    return f'<rect x="0" y="{f(y0)}" width="{W}" height="{f(y1 - y0)}" fill="{g}"/>'


def sand_dunes(card, name, y, amp, colors, seed=3, x0=-10, x1=W + 10, layers=3, step=26):
    """Dunes : crêtes douces superposées, de la plus lointaine (claire) à la plus proche (sombre)."""
    rnd = random.Random(seed)
    out = []
    for k in range(layers):
        yy = y + k * amp * 0.55
        ph = rnd.uniform(0, 6)
        pts = []
        x = x0
        while x <= x1 + step:
            pts.append((x, yy - amp * (0.5 + 0.5 * math.sin(x / (90 + 30 * k) + ph)) * (1 - 0.18 * k)))
            x += step
        d = f"M{f(x0)} {H + 10} L" + " L".join(f"{f(px)} {f(py)}" for px, py in pts) + f" L{f(x1 + step)} {H + 10} Z"
        out.append(f'<path d="{d}" fill="{colors[min(k, len(colors) - 1)]}"/>')
    return "".join(out)
