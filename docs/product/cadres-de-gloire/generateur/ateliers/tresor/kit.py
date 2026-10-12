"""Atelier « Trésor » — le kit : filtres de matière, fenêtres, emblème (la pièce Meesh), inscription, manifeste."""

import json
import math
import random
import sys
from pathlib import Path

ATL = Path(__file__).resolve().parent
ROOT = ATL.parents[1]
sys.path.insert(0, str(ROOT / "lib"))

from base import (  # noqa: E402
    W, H, f, pt, esc, Card, photo, bird, mee_meo, MEE_LAYOUTS, sparkle, stars, nebula, rays, vignette, border,
    METALS, CINZEL, CINZEL_DECO, GARAMOND, FRAUNCES, SANS, HAND,
)

SLUG = "tresor"
OUT = ROOT / "out" / SLUG
DATE = "10 octobre 2026"

GOLD = ("#FFF4C2", "#E8B53C", "#8A5A12")
GOLD_RICH = ("#FFF8D6", "#F0C24B", "#7A4A0A")
BRASS = ("#FBE7B0", "#C9A24A", "#5E4614")
STEEL = ("#F4F7FA", "#A9B3BF", "#4A5361")
CHROME = ("#FFFFFF", "#C8D0DA", "#39424F")

from base import nid  # noqa: E402,F401  le compteur des identifiants vit dans Card


# ---------------------------------------------------------------- géométrie

def rrect(x0, y0, x1, y1, r):
    return (
        f"M{f(x0 + r)} {f(y0)} L{f(x1 - r)} {f(y0)} Q{f(x1)} {f(y0)} {f(x1)} {f(y0 + r)} L{f(x1)} {f(y1 - r)} "
        f"Q{f(x1)} {f(y1)} {f(x1 - r)} {f(y1)} L{f(x0 + r)} {f(y1)} Q{f(x0)} {f(y1)} {f(x0)} {f(y1 - r)} "
        f"L{f(x0)} {f(y0 + r)} Q{f(x0)} {f(y0)} {f(x0 + r)} {f(y0)} Z"
    )


def arch(x0, x1, spring, y1, r=16, apex=None):
    rx = (x1 - x0) / 2
    ry = rx if apex is None else spring - apex
    return (
        f"M{f(x0)} {f(spring)} A{f(rx)} {f(ry)} 0 0 1 {f(x1)} {f(spring)} L{f(x1)} {f(y1 - r)} Q{f(x1)} {f(y1)} {f(x1 - r)} {f(y1)} "
        f"L{f(x0 + r)} {f(y1)} Q{f(x0)} {f(y1)} {f(x0)} {f(y1 - r)} Z"
    )


def circle_path(cx, cy, r):
    return f"M{f(cx - r)} {f(cy)} A{f(r)} {f(r)} 0 1 1 {f(cx + r)} {f(cy)} A{f(r)} {f(r)} 0 1 1 {f(cx - r)} {f(cy)} Z"


def ellipse_path(cx, cy, rx, ry):
    return f"M{f(cx - rx)} {f(cy)} A{f(rx)} {f(ry)} 0 1 1 {f(cx + rx)} {f(cy)} A{f(rx)} {f(ry)} 0 1 1 {f(cx - rx)} {f(cy)} Z"


def poly(points, close=True):
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in points)
    return d + (" Z" if close else "")


def T(x, y, s=1.0, r=0.0, flip=False, sy=None):
    sy = s if sy is None else sy
    return f"translate({f(x)} {f(y)}) rotate({f(r)}) scale({f(-s if flip else s)} {f(sy)})"


def grp(markup, x=0, y=0, s=1.0, r=0.0, flip=False, filt=None, op=None, sy=None):
    a = f' filter="{filt}"' if filt else ""
    o = f' opacity="{f(op)}"' if op is not None else ""
    return f'<g transform="{T(x, y, s, r, flip, sy)}"{a}{o}>{markup}</g>'


# ---------------------------------------------------------------- dégradés

def lg(card, name, stops, x1=0, y1=0, x2=0, y2=1, units=None):
    """Dégradé linéaire ; stops = [(offset, couleur)] ou [(offset, couleur, opacité)]."""
    st = "".join(
        f'<stop offset="{s[0]}" stop-color="{s[1]}" stop-opacity="{s[2] if len(s) > 2 else 1}"/>' for s in stops
    )
    u = f' gradientUnits="userSpaceOnUse"' if units == "user" else ""
    return card.def_once(name, f'<linearGradient id="{card.id(name)}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"{u}>{st}</linearGradient>')


def rg(card, name, stops, cx=0.5, cy=0.5, r=0.5, fx=None, fy=None, units=None):
    st = "".join(
        f'<stop offset="{s[0]}" stop-color="{s[1]}" stop-opacity="{s[2] if len(s) > 2 else 1}"/>' for s in stops
    )
    focal = f' fx="{fx}" fy="{fy}"' if fx is not None else ""
    u = f' gradientUnits="userSpaceOnUse"' if units == "user" else ""
    return card.def_once(name, f'<radialGradient id="{card.id(name)}" cx="{cx}" cy="{cy}" r="{r}"{focal}{u}>{st}</radialGradient>')


def metal_lin(card, name, m, x1=0, y1=0, x2=1, y2=1, bands=1):
    hi, mid, lo = m
    stops = []
    for k in range(bands):
        o = k / bands
        span = 1 / bands
        stops += [(o, hi), (o + span * 0.35, mid), (o + span * 0.55, lo), (o + span * 0.75, mid)]
    stops.append((1, hi))
    return lg(card, name, stops, x1, y1, x2, y2)


def cyl_grad(card, name, m, horizontal=False):
    """Un cylindre (colonne, pêne, lingot) éclairé de face : sombre, clair, reflet, sombre."""
    hi, mid, lo = m
    stops = [(0, lo), (0.18, mid), (0.36, hi), (0.46, "#FFFFFF"), (0.56, hi), (0.8, mid), (1, lo)]
    if horizontal:
        return lg(card, name, stops, 0, 0, 0, 1)
    return lg(card, name, stops, 0, 0, 1, 0)


# ---------------------------------------------------------------- filtres de matière

def bevel(card, name="bv", blur=1.4, scale=3.0, spec=1.0, exp=20, az=225, el=40, light="#FFFFFF", shadow=(0, 3, 3, 0.55)):
    """Biseau : éclairage spéculaire sur l'alpha flouté, ajouté à la couleur ; ombre portée optionnelle."""
    sh = ""
    if shadow:
        dx, dy, sd, op = shadow
        sh = f'<feDropShadow in="lit" dx="{dx}" dy="{dy}" stdDeviation="{sd}" flood-color="#000000" flood-opacity="{op}"/>'
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">'
        f'<feGaussianBlur in="SourceAlpha" stdDeviation="{blur}" result="b"/>'
        f'<feSpecularLighting in="b" surfaceScale="{scale}" specularConstant="{spec}" specularExponent="{exp}" lighting-color="{light}" result="s">'
        f'<feDistantLight azimuth="{az}" elevation="{el}"/></feSpecularLighting>'
        f'<feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>'
        f'<feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lit"/>{sh}</filter>',
    )
    return f"url(#{card.id(name)})"


def emboss(card, name="emb", blur=1.2, scale=2.4, az=225, el=50, op=0.6):
    """Relief doux (cuir repoussé, gravure) : lumière diffuse sur l'alpha, multipliée par la couleur."""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">'
        f'<feGaussianBlur in="SourceAlpha" stdDeviation="{blur}" result="b"/>'
        f'<feDiffuseLighting in="b" surfaceScale="{scale}" diffuseConstant="1.15" lighting-color="#FFFFFF" result="d">'
        f'<feDistantLight azimuth="{az}" elevation="{el}"/></feDiffuseLighting>'
        f'<feComposite in="SourceGraphic" in2="d" operator="arithmetic" k1="1.1" k2="0" k3="0" k4="0" result="m"/>'
        f'<feComposite in="m" in2="SourceAlpha" operator="in"/></filter>',
    )
    return f"url(#{card.id(name)})"


def noise(card, name, freq="0.8", octaves=2, seed=3, color=(0, 0, 0), a=1.6, bias=-0.7, kind="fractalNoise", channel=0):
    """Remplit la forme filtrée d'un bruit coloré (grain du cuir, brossage de l'acier, veines…)."""
    r, g, b = color
    row = ["0", "0", "0", "0"]
    row[channel] = str(a)
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="{kind}" baseFrequency="{freq}" numOctaves="{octaves}" seed="{seed}" result="n"/>'
        f'<feColorMatrix in="n" type="matrix" values="0 0 0 0 {r} 0 0 0 0 {g} 0 0 0 0 {b} {" ".join(row)} {bias}" result="c"/>'
        f'<feComposite in="c" in2="SourceAlpha" operator="in"/></filter>',
    )
    return f"url(#{card.id(name)})"


def veins(card, name, freq="0.006 0.014", octaves=5, seed=4, color=(0.35, 0.33, 0.36), table="0 0 0 0 0.85 0 0 0 0", fuzz=0.0):
    """Veines de marbre : la bande médiane d'un bruit fractal, en lignes fines."""
    r, g, b = color
    blur = f'<feGaussianBlur stdDeviation="{fuzz}"/>' if fuzz else ""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="{octaves}" seed="{seed}" result="n"/>'
        f'<feColorMatrix in="n" type="matrix" values="0 0 0 0 {r} 0 0 0 0 {g} 0 0 0 0 {b} 1 0 0 0 0" result="c"/>'
        f'<feComponentTransfer in="c" result="v"><feFuncA type="table" tableValues="{table}"/></feComponentTransfer>{blur}'
        f'<feComposite in2="SourceAlpha" operator="in"/></filter>',
    )
    return f"url(#{card.id(name)})"


def nacre(card, name="nacre", freq="0.022 0.03", seed=7, octaves=3, sat=1.6, light=0.55):
    """La nacre : un bruit de turbulence en couleurs, éclairci et saturé en reflets irisés."""
    k = 1 - light
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="turbulence" baseFrequency="{freq}" numOctaves="{octaves}" seed="{seed}" result="n"/>'
        f'<feColorMatrix in="n" type="matrix" values="{k} 0 0 0 {light} 0 {k} 0 0 {light} 0 0 {k} 0 {light + 0.05} 0 0 0 0 1" result="c"/>'
        f'<feColorMatrix in="c" type="saturate" values="{sat}" result="s"/>'
        f'<feComposite in="s" in2="SourceAlpha" operator="in"/></filter>',
    )
    return f"url(#{card.id(name)})"


def soft(card, sd):
    return card.blur(f"soft{str(sd).replace('.', '_')}", sd)


def screen(markup):
    return f'<g style="mix-blend-mode:screen">{markup}</g>'


def multiply(markup):
    return f'<g style="mix-blend-mode:multiply">{markup}</g>'


def overlay(markup):
    return f'<g style="mix-blend-mode:overlay">{markup}</g>'


# ---------------------------------------------------------------- fenêtre photo

def deco_mask(card, d, name="dm", feather=0):
    blur = ""
    if feather:
        blur = f' filter="{soft(card, feather)}"'
    card.def_once(
        name,
        f'<mask id="{card.id(name)}" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}">'
        f'<rect width="{W}" height="{H}" fill="#FFFFFF"/><path d="{d}" fill="#000000"{blur}/></mask>',
    )
    return f"url(#{card.id(name)})"


def clip(card, d, name):
    card.def_once(name, f'<clipPath id="{card.id(name)}"><path d="{d}"/></clipPath>')
    return f"url(#{card.id(name)})"


def inner_shadow(card, d, w=34, sd=12, op=0.7, color="#000000", name="ish"):
    c = clip(card, d, name + "-c")
    return f'<g clip-path="{c}"><path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{op}" filter="{soft(card, sd)}"/></g>'


def grade(card, d, color="#FFB257", cx=0.5, cy=0.0, op=0.3, r=0.9, name="grade"):
    """Une lumière d'ambiance posée sur la photo (dans la fenêtre seulement)."""
    c = clip(card, d, name + "-c")
    g = rg(card, name, [(0, color, op), (0.6, color, op * 0.35), (1, color, 0)], cx, cy, r)
    return f'<g clip-path="{c}" style="mix-blend-mode:screen"><rect width="{W}" height="{H}" fill="{g}"/></g>'


# ---------------------------------------------------------------- lumière

def godrays(card, name, cx, cy, angles, length, width, color, op=0.5, blur=6, seed=3):
    """Faisceaux de lumière qui partent d'un point (angles en degrés depuis midi, sens horaire)."""
    rnd = random.Random(seed)
    g = rg(card, name, [(0, color, op), (0.55, color, op * 0.45), (1, color, 0)], cx, cy, length, units="user")
    out = []
    for a in angles:
        wa = width * rnd.uniform(0.6, 1.4)
        L = length * rnd.uniform(0.75, 1.0)
        x1, y1 = pt(cx, cy, L, a - wa / 2)
        x2, y2 = pt(cx, cy, L, a + wa / 2)
        out.append(f'<path d="M{f(cx)} {f(cy)} L{f(x1)} {f(y1)} L{f(x2)} {f(y2)} Z" fill="{g}"/>')
    return f'<g filter="{soft(card, blur)}" style="mix-blend-mode:screen">{"".join(out)}</g>'


def glint(cx, cy, r, color="#FFFFFF", op=1.0, cross=True):
    """Un éclat : étoile à quatre branches, cœur, et fines aigrettes."""
    out = [sparkle(cx, cy, r, color, op)]
    if cross:
        out.append(
            f'<path d="M{f(cx - r * 2.2)} {f(cy)} L{f(cx + r * 2.2)} {f(cy)} M{f(cx)} {f(cy - r * 2.2)} L{f(cx)} {f(cy + r * 2.2)}" '
            f'stroke="{color}" stroke-width="{f(max(0.5, r * 0.08))}" opacity="{f(op * 0.55)}"/>'
        )
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.22)}" fill="#FFFFFF" opacity="{f(op)}"/>')
    return "".join(out)


def dust(seed, n, region, colors=("#FFE7A0",), rmin=0.4, rmax=1.8, keep=True, opmin=0.3, opmax=0.95):
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if keep and 96 < x < 444 and 290 < y < 700:
            continue
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(rmin, rmax))}" fill="{rnd.choice(colors)}" opacity="{f(rnd.uniform(opmin, opmax))}"/>')
    return "".join(out)


def halo(card, name, cx, cy, rx, ry, color, op, mid=0.4):
    g = rg(card, name, [(0, color, op), (mid, color, op * 0.4), (1, color, 0)])
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{g}"/>'


# ---------------------------------------------------------------- la pièce Meesh

def signature_bars(cx, cy, s, fill, w=7.0):
    out = []
    for dx, h in ((-14, 16), (0, 26), (14, 16)):
        out.append(
            f'<rect x="{f(cx + dx * s - w * s / 2)}" y="{f(cy - h * s)}" width="{f(w * s)}" height="{f(2 * h * s)}" rx="{f(w * s / 2)}" fill="{fill}"/>'
        )
    return "".join(out)


def coin_face_def(card, m=GOLD, key="cf"):
    """Le symbole de la face d'une Meesh (rayon 50), réutilisé par <use> dans les tas et les pluies de pièces."""
    sid = card.id(key)
    if key in card._ids:
        return sid
    hi, mid, lo = m
    rim = lg(card, key + "-rim", [(0, hi), (0.35, mid), (0.62, lo), (1, mid)], 0.15, 0, 0.85, 1)
    field = lg(card, key + "-field", [(0, lo), (0.45, mid), (1, hi)], 0.2, 0, 0.8, 1)
    bars_hi = lg(card, key + "-bar", [(0, "#FFFFFF"), (0.5, hi), (1, mid)], 0, 0, 1, 1)
    shine = rg(card, key + "-sh", [(0, "#FFFFFF", 0.75), (1, "#FFFFFF", 0)], 0.32, 0.26, 0.5)
    beads = "".join(
        f'<circle cx="{f(39 * math.sin(math.radians(a)))}" cy="{f(-39 * math.cos(math.radians(a)))}" r="1.5" fill="{hi}"/>'
        for a in range(0, 360, 10)
    )
    reeds = "".join(
        f'<line x1="{f(46.5 * math.sin(math.radians(a)))}" y1="{f(-46.5 * math.cos(math.radians(a)))}" x2="{f(50 * math.sin(math.radians(a)))}" y2="{f(-50 * math.cos(math.radians(a)))}" stroke="{lo}" stroke-width="1.1" opacity="0.55"/>'
        for a in range(0, 360, 6)
    )
    card.def_once(
        key,
        f'<g id="{sid}">'
        f'<circle r="50" fill="{rim}"/>{reeds}'
        f'<circle r="43" fill="{field}"/>'
        f'<circle r="43" fill="none" stroke="{lo}" stroke-width="2" opacity="0.55"/>'
        f'<circle r="44.5" fill="none" stroke="{hi}" stroke-width="1" opacity="0.7"/>'
        f'{beads}'
        f'<g transform="translate(1.6 2)" opacity="0.55">{signature_bars(0, 2, 0.95, lo)}</g>'
        f'{signature_bars(0, 2, 0.95, bars_hi)}'
        f'<circle r="50" fill="{shine}"/></g>',
    )
    return sid


def coin_use(card, x, y, r, tilt=1.0, rot=0.0, m=GOLD, key="cf", edge=True, op=1.0, thick=0.16):
    """Une Meesh posée : vue de face (tilt=1) ou couchée en perspective (tilt<1), avec sa tranche."""
    sid = coin_face_def(card, m, key)
    hi, mid, lo = m
    s = r / 50
    th = r * thick * (1 - tilt) + (r * 0.05 if tilt < 0.98 else 0)
    parts = []
    if edge and th > 0.4:
        eg = lg(card, key + "-edge", [(0, lo), (0.3, mid), (0.5, hi), (0.7, mid), (1, lo)], 0, 0, 1, 0)
        parts.append(
            f'<path d="M{f(-r)} 0 L{f(-r)} {f(th)} A{f(r)} {f(r * tilt)} 0 0 0 {f(r)} {f(th)} L{f(r)} 0 Z" fill="{eg}"/>'
            f'<path d="M{f(-r)} {f(th)} A{f(r)} {f(r * tilt)} 0 0 0 {f(r)} {f(th)}" fill="none" stroke="{lo}" stroke-width="0.6" opacity="0.8"/>'
        )
    parts.append(f'<use href="#{sid}" transform="scale({f(s)} {f(s * tilt)})"/>')
    o = f' opacity="{f(op)}"' if op < 1 else ""
    return f'<g transform="translate({f(x)} {f(y)}) rotate({f(rot)})"{o}>{"".join(parts)}</g>'


def coin_on_edge(card, x, y, r, rot=0.0, m=GOLD, key="cf"):
    """Une pièce vue presque de profil (qui roule, qui tombe) : une ellipse étroite et sa tranche crénelée."""
    hi, mid, lo = m
    w = r * 0.32
    eg = lg(card, key + "-oe", [(0, lo), (0.25, mid), (0.45, hi), (0.6, mid), (1, lo)], 0, 0, 1, 0)
    face = lg(card, key + "-oef", [(0, hi), (0.6, mid), (1, lo)], 0, 0, 1, 1)
    teeth = "".join(f'<line x1="{f(w * 0.55)}" y1="{f(-r + k)}" x2="{f(w)}" y2="{f(-r + k)}" stroke="{lo}" stroke-width="0.7" opacity="0.6"/>' for k in range(int(r * 0.3), int(r * 1.7), 3))
    return (
        f'<g transform="translate({f(x)} {f(y)}) rotate({f(rot)})">'
        f'<ellipse cx="{f(w * 0.45)}" cy="0" rx="{f(w * 0.75)}" ry="{f(r)}" fill="{eg}"/>{teeth}'
        f'<ellipse cx="0" cy="0" rx="{f(w * 0.75)}" ry="{f(r)}" fill="{face}" stroke="{hi}" stroke-width="0.6"/>'
        f'<ellipse cx="{f(-w * 0.1)}" cy="{f(-r * 0.2)}" rx="{f(w * 0.18)}" ry="{f(r * 0.5)}" fill="#FFFFFF" opacity="0.35"/></g>'
    )


def meesh_coin(card, cx, cy, r, m=GOLD_RICH, legend="MEESHY", sub="TRÉSOR", key="mc", halo_op=0.55, glints=True):
    """L'EMBLÈME : la grande Meesh frappée de la Signature, en or, avec sa légende et sa lumière."""
    hi, mid, lo = m
    out = []
    if halo_op:
        out.append(halo(card, key + "-halo", cx, cy, r * 2.3, r * 2.3, "#FFD877", halo_op, 0.3))
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy + r * 0.12)}" r="{f(r * 1.02)}" fill="#000000" opacity="0.55" filter="{soft(card, r * 0.12)}"/>')
    edge = lg(card, key + "-edge", [(0, hi), (0.25, mid), (0.5, lo), (0.75, mid), (1, hi)], 0, 0, 1, 1)
    rim = lg(card, key + "-rim", [(0, "#FFFFFF"), (0.2, hi), (0.5, mid), (0.75, lo), (1, mid)], 0.2, 0, 0.8, 1)
    field = rg(card, key + "-field", [(0, "#FFE9A6"), (0.45, mid), (0.85, "#B07A1E"), (1, lo)], 0.36, 0.3, 0.85)
    bars = lg(card, key + "-bars", [(0, "#FFFFFF"), (0.3, hi), (0.7, "#F6D272"), (1, mid)], 0, 0, 1, 1)
    bv = bevel(card, key + "-bv", blur=r * 0.03, scale=3.2, spec=0.9, exp=24, shadow=None)
    teeth = "".join(
        f'<line x1="{f(cx + r * 0.955 * math.sin(math.radians(a)))}" y1="{f(cy - r * 0.955 * math.cos(math.radians(a)))}" '
        f'x2="{f(cx + r * math.sin(math.radians(a)))}" y2="{f(cy - r * math.cos(math.radians(a)))}" stroke="{lo}" stroke-width="{f(r * 0.022)}" opacity="0.6"/>'
        for a in range(0, 360, 4)
    )
    pid = card.id(key + "-arc")
    pid2 = card.id(key + "-arc2")
    ra = r * 0.66
    card.def_once(key + "-arc", f'<path id="{pid}" d="M{f(cx - ra)} {f(cy)} A{f(ra)} {f(ra)} 0 0 1 {f(cx + ra)} {f(cy)}"/>')
    rb = r * 0.75
    card.def_once(key + "-arc2", f'<path id="{pid2}" d="M{f(cx - rb)} {f(cy)} A{f(rb)} {f(rb)} 0 0 0 {f(cx + rb)} {f(cy)}"/>')
    beads = "".join(
        f'<circle cx="{f(cx + r * 0.84 * math.sin(math.radians(a)))}" cy="{f(cy - r * 0.84 * math.cos(math.radians(a)))}" r="{f(r * 0.022)}" fill="{hi}"/>'
        for a in range(0, 360, 6)
    )
    out.append(
        f'<g filter="{bv}">'
        f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{edge}"/>'
        f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.9)}" fill="{rim}"/>'
        f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.79)}" fill="{field}"/>'
        f'</g>{teeth}'
        f'<g opacity="0.75" filter="{soft(card, max(0.6, r * 0.018))}">{signature_bars(cx + r * 0.035, cy + r * 0.065, r * 0.0125, "#5A3606", w=7.4)}</g>'
        f'<g filter="{bv}">{signature_bars(cx, cy + r * 0.02, r * 0.0125, bars, w=7.4)}</g>'
        f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.79)}" fill="none" stroke="{lo}" stroke-width="{f(r * 0.02)}" opacity="0.7"/>'
        f'{beads}'
    )
    if legend:
        out.append(
            f'<text font-family="{CINZEL}" font-weight="900" font-size="{f(r * 0.17)}" letter-spacing="{f(r * 0.05)}" fill="{lo}" opacity="0.85">'
            f'<textPath href="#{pid}" startOffset="50%" text-anchor="middle">{esc(legend)}</textPath></text>'
        )
    if sub:
        out.append(
            f'<text font-family="{CINZEL}" font-weight="700" font-size="{f(r * 0.12)}" letter-spacing="{f(r * 0.06)}" fill="{lo}" opacity="0.8">'
            f'<textPath href="#{pid2}" startOffset="50%" text-anchor="middle">{esc(sub)}</textPath></text>'
        )
    sh = rg(card, key + "-shine", [(0, "#FFFFFF", 0.55), (0.5, "#FFFFFF", 0.12), (1, "#FFFFFF", 0)], 0.3, 0.22, 0.55)
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{sh}"/>')
    out.append(
        f'<path d="M{f(cx - r * 0.86)} {f(cy - r * 0.2)} A{f(r * 0.88)} {f(r * 0.88)} 0 0 1 {f(cx - r * 0.2)} {f(cy - r * 0.86)}" '
        f'fill="none" stroke="#FFFFFF" stroke-width="{f(r * 0.035)}" stroke-linecap="round" opacity="0.8"/>'
    )
    if glints:
        out.append(glint(cx + r * 0.62, cy - r * 0.66, r * 0.2, "#FFFFFF", 0.95))
        out.append(glint(cx - r * 0.74, cy + r * 0.5, r * 0.1, "#FFF4C2", 0.8, cross=False))
    return "".join(out)


# ---------------------------------------------------------------- l'inscription

COUNTS = {
    "Bourse": "1 Meesh gardée",
    "Escarcelle": "10 Meeshes gardées",
    "Coffret": "50 Meeshes gardées",
    "Coffre": "100 Meeshes gardées",
    "Trésor": "500 Meeshes gardées",
    "Réserve": "1 000 Meeshes gardées",
}


from base import plate_layer  # noqa: E402  la couche « plate » et ses emplacements de texte


@plate_layer(title="palier")
def inscription(card, palier, message=None, y=744, ink="#FFF4C2", accent="#E8B53C", sub_color=None, title_fill=None,
                title_font=CINZEL_DECO, title_size=40, kicker="Trésor", date=DATE, panel=None, shadow=True, msg_color=None):
    """Le texte de la plaque (le support est dessiné par le cadre) : sur-titre, palier, sous-ligne, message, date."""
    count = COUNTS[palier]
    tf = title_fill or ink
    out = [
        f'<text x="270" y="{y + 26}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="12.5" letter-spacing="6" fill="{accent}">{esc(kicker.upper())}</text>',
        f'<text x="270" y="{y + 68}" text-anchor="middle" font-family="{title_font}" font-weight="900" font-size="{title_size}" fill="{tf}">{esc(palier)}</text>',
        f'<text x="270" y="{y + 94}" text-anchor="middle" font-family="{GARAMOND}" font-style="italic" font-weight="500" font-size="20" fill="{sub_color or ink}" opacity="0.92">{esc(count)}</text>',
    ]
    if message:
        out.append(f'<text x="270" y="{y + 126}" text-anchor="middle" font-family="{HAND}" font-weight="700" font-size="29" fill="{msg_color or ink}">{esc(message)}</text>')
        out.append(f'<text x="270" y="{y + 146}" text-anchor="middle" font-family="{SANS}" font-weight="500" font-size="11" letter-spacing="1.5" fill="{accent}" opacity="0.9">{esc(date)}</text>')
    else:
        out.append(f'<text x="270" y="{y + 116}" text-anchor="middle" font-family="{SANS}" font-weight="500" font-size="11" letter-spacing="1.5" fill="{accent}" opacity="0.9">{esc(date)}</text>')
    body = "".join(out)
    if shadow:
        return f'<g filter="{card.shadow("txt", 0, 1.5, 2.2, "#000000", 0.85)}">{body}</g>'
    return body


def plaque_height(message):
    return 158 if message else 128


# ---------------------------------------------------------------- manifeste

MANIFEST = []


def register(file, palier, option, name, story, layout, message):
    MANIFEST.append({"file": file, "rank": palier, "division": None, "option": option, "name": name,
                     "story": story, "layout": layout, "message": message})


ORDER = ["bourse", "escarcelle", "coffret", "coffre", "tresor", "reserve"]


def write_manifest():
    path = OUT / "manifest.json"
    existing = []
    if path.exists():
        names = {x["file"] for x in MANIFEST}
        existing = [m for m in json.loads(path.read_text()) if m["file"] not in names]
    allm = existing + MANIFEST

    def key(m):
        stem = m["file"].replace("tresor-", "", 1).replace(".jpg", "")
        pal, opt = stem.rsplit("-", 1)
        return (ORDER.index(pal) if pal in ORDER else 99, opt)

    path.write_text(json.dumps(sorted(allm, key=key), ensure_ascii=False, indent=2) + "\n")
