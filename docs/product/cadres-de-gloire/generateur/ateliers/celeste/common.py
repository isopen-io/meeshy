"""Socle de l'atelier « Empire céleste » : la carte, les fenêtres de la photo, l'inscription laquée, le manifeste."""

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
from base import nid as base_nid  # noqa: E402
from geo import *  # noqa: E402,F401,F403

SLUG = "celeste"
OUT = ROOT / "out" / SLUG
KICK = "Nouveau rang · Empire céleste"
DATE = "10 octobre 2026"

VERM = "#D23A26"
VERM_HI = "#F0643E"
VERM_D = "#7E140E"
LACQ = "#3A0807"
GOLD = "#E8B53C"
GOLD_HI = "#FFF1BE"
GOLD_LO = "#8A5A12"
JADE = "#3FB68B"
JADE_HI = "#BFF3DA"
JADE_D = "#0E5A43"
INK = "#0E0B10"
SAKURA = "#F8C3D2"
SAKURA_D = "#E27A9C"
INDIGO = "#1F2C66"
INDIGO_D = "#0A0F2E"
PAPER = "#F5ECD8"
SILVER = "#E9EEF6"

MANIFEST = []
def nid(p="u"):
    return base_nid(p)


def lg(card, stops, x1=0, y1=0, x2=0, y2=1, name=None, user=None):
    """Dégradé linéaire avec opacités : stops = [(offset, couleur, opacité)]. `user` = (x1, y1, x2, y2) en px."""
    name = name or nid("lg")
    st = "".join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops)
    if user:
        ux1, uy1, ux2, uy2 = user
        attrs = f'gradientUnits="userSpaceOnUse" x1="{fmt(ux1)}" y1="{fmt(uy1)}" x2="{fmt(ux2)}" y2="{fmt(uy2)}"'
    else:
        attrs = f'x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"'
    return card.def_once(name, f'<linearGradient id="{card.id(name)}" {attrs}>{st}</linearGradient>')


def rg(card, stops, cx=0.5, cy=0.5, r=0.5, name=None, user=None, fx=None, fy=None):
    name = name or nid("rg")
    st = "".join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops)
    if user:
        ucx, ucy, ur = user
        attrs = f'gradientUnits="userSpaceOnUse" cx="{fmt(ucx)}" cy="{fmt(ucy)}" r="{fmt(ur)}"'
        if fx is not None:
            attrs += f' fx="{fmt(fx)}" fy="{fmt(fy)}"'
    else:
        attrs = f'cx="{cx}" cy="{cy}" r="{r}"' + (f' fx="{fx}" fy="{fy}"' if fx is not None else "")
    return card.def_once(name, f'<radialGradient id="{card.id(name)}" {attrs}>{st}</radialGradient>')


def metal_grad(card, key, horizontal=True):
    hi, mid, lo = METALS[key]
    if horizontal:
        return card.grad(f"mh-{key}", [(0, lo), (0.18, mid), (0.36, hi), (0.52, mid), (0.7, lo), (0.86, mid), (1, hi)], 0, 0, 1, 0)
    return card.grad(f"mv-{key}", [(0, hi), (0.3, mid), (0.55, lo), (0.8, mid), (1, hi)], 0, 0, 0, 1)


def clip(card, d, name=None):
    name = name or nid("cl")
    card.def_once(name, f'<clipPath id="{card.id(name)}"><path d="{d}"/></clipPath>')
    return f"url(#{card.id(name)})"


def mask_out(card, d, name=None, feather=0):
    """Masque : tout sauf la forme `d` (pour garder la photo libre)."""
    name = name or nid("mk")
    filt = f' filter="{card.blur(name + "f", feather)}"' if feather else ""
    card.def_once(name, f'<mask id="{card.id(name)}" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}">'
                        f'<rect width="{W}" height="{H}" fill="#FFFFFF"/><path d="{d}" fill="#000000"{filt}/></mask>')
    return f"url(#{card.id(name)})"


def since(card, n, attrs):
    seg = "".join(card.body[n:])
    del card.body[n:]
    card.add(f"<g {attrs}>{seg}</g>")


def start(uid, top="#2E2420", bottom="#0E0A0A", rim="#FFC98A", glow=0.2):
    c = Card(uid)
    photo(c, top, bottom, rim, 2, glow)
    return c


# ---------------------------------------------------------------- fenêtres de la photo

def win_rect(x0=78, y0=246, x1=462, y1=724, r=18):
    return (f"M{x0 + r} {y0} L{x1 - r} {y0} Q{x1} {y0} {x1} {y0 + r} L{x1} {y1 - r} Q{x1} {y1} {x1 - r} {y1} "
            f"L{x0 + r} {y1} Q{x0} {y1} {x0} {y1 - r} L{x0} {y0 + r} Q{x0} {y0} {x0 + r} {y0}Z")


def win_arch(x0=78, y0=236, x1=462, y1=724, r=16):
    rx = (x1 - x0) / 2
    return (f"M{x0} {y1 - r} L{x0} {y0 + rx} A{rx} {rx} 0 0 1 {x1} {y0 + rx} L{x1} {y1 - r} "
            f"Q{x1} {y1} {x1 - r} {y1} L{x0 + r} {y1} Q{x0} {y1} {x0} {y1 - r}Z")


def win_moon(cx=270, cy=486, rx=206, ry=252):
    return f"M{cx - rx} {cy} A{rx} {ry} 0 1 1 {cx + rx} {cy} A{rx} {ry} 0 1 1 {cx - rx} {cy}Z"


def win_octa(x0=78, y0=246, x1=462, y1=724, c=56):
    return (f"M{x0 + c} {y0} L{x1 - c} {y0} L{x1} {y0 + c} L{x1} {y1 - c} L{x1 - c} {y1} L{x0 + c} {y1} "
            f"L{x0} {y1 - c} L{x0} {y0 + c}Z")


def win_begonia(x0=74, y0=240, x1=466, y1=730, k=34, bulge=14):
    """Fenêtre en fleur de pommier (haitang) : quatre côtés bombés, coins creusés en quart de cercle."""
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    return (f"M{x0 + k} {y0} Q{mx} {y0 - bulge} {x1 - k} {y0} A{k} {k} 0 0 0 {x1} {y0 + k} "
            f"Q{x1 + bulge} {my} {x1} {y1 - k} A{k} {k} 0 0 0 {x1 - k} {y1} "
            f"Q{mx} {y1 + bulge} {x0 + k} {y1} A{k} {k} 0 0 0 {x0} {y1 - k} "
            f"Q{x0 - bulge} {my} {x0} {y0 + k} A{k} {k} 0 0 0 {x0 + k} {y0}Z")


def win_kato(x0=80, y0=226, x1=460, y1=724, r=14):
    """Fenêtre en cloche (katōmado) : flancs droits, épaules évasées, sommet en accolade."""
    cx = (x0 + x1) / 2
    w = x1 - x0
    s = y0 + 150
    return (f"M{x0} {y1 - r} L{x0} {s} C{x0} {s - 26} {x0 - 14} {s - 38} {x0 - 6} {s - 58} "
            f"C{x0 + 6} {s - 86} {x0 + w * 0.2} {s - 92} {x0 + w * 0.3} {s - 104} "
            f"C{x0 + w * 0.4} {s - 116} {cx - 18} {y0 + 14} {cx} {y0} "
            f"C{cx + 18} {y0 + 14} {x1 - w * 0.4} {s - 116} {x1 - w * 0.3} {s - 104} "
            f"C{x1 - w * 0.2} {s - 92} {x1 - 6} {s - 86} {x1 + 6} {s - 58} C{x1 + 14} {s - 38} {x1} {s - 26} {x1} {s} "
            f"L{x1} {y1 - r} Q{x1} {y1} {x1 - r} {y1} L{x0 + r} {y1} Q{x0} {y1} {x0} {y1 - r}Z")


def win_ruyi(x0=84, y0=232, x1=456, y1=718, r=12):
    """Fenêtre au sommet en nuage de ruyi : trois lobes, le central plus haut."""
    w = x1 - x0
    cx = (x0 + x1) / 2
    s1 = y0 + 92
    return (f"M{x0} {y1 - r} L{x0} {s1} C{x0} {s1 - 40} {x0 + w * 0.06} {s1 - 64} {x0 + w * 0.2} {s1 - 64} "
            f"C{x0 + w * 0.26} {s1 - 64} {x0 + w * 0.3} {s1 - 60} {x0 + w * 0.32} {s1 - 56} "
            f"C{x0 + w * 0.3} {y0 + 10} {cx - 30} {y0} {cx} {y0} C{cx + 30} {y0} {x1 - w * 0.3} {y0 + 10} {x1 - w * 0.32} {s1 - 56} "
            f"C{x1 - w * 0.3} {s1 - 60} {x1 - w * 0.26} {s1 - 64} {x1 - w * 0.2} {s1 - 64} C{x1 - w * 0.06} {s1 - 64} {x1} {s1 - 40} {x1} {s1} "
            f"L{x1} {y1 - r} Q{x1} {y1} {x1 - r} {y1} L{x0 + r} {y1} Q{x0} {y1} {x0} {y1 - r}Z")


def outside(card, d, fill, extra=""):
    card.add(f'<path d="M0 0H{W}V{H}H0Z {d}" fill-rule="evenodd" fill="{fill}" {extra}/>')


def inner_shadow(card, d, sd=14, op=0.85, color="#000000"):
    card.add(f'<g clip-path="{clip(card, d)}"><path d="{d}" fill="none" stroke="{color}" stroke-width="{sd * 2.2}" '
             f'opacity="{op}" filter="{card.blur(nid("is"), sd / 1.6)}"/></g>')


def metal_line(card, d, w=3, key="gold", op=1, under=True):
    hi, mid, lo = METALS[key]
    g = metal_grad(card, key, True)
    if under:
        card.add(f'<path d="{d}" fill="none" stroke="#000000" stroke-width="{w + 3}" opacity="{0.45 * op}"/>')
    card.add(f'<path d="{d}" fill="none" stroke="{g}" stroke-width="{w}" opacity="{op}"/>')
    card.add(f'<path d="{d}" fill="none" stroke="{hi}" stroke-width="{max(0.6, w * 0.22)}" opacity="{0.55 * op}"/>')


def frame_window(card, d, key="gold", w=3.2, sd=16, op=0.8, double=None):
    inner_shadow(card, d, sd, op)
    metal_line(card, d, w, key)
    if double:
        card.add(f'<path d="{double}" fill="none" stroke="{METALS[key][1]}" stroke-width="1" opacity="0.7"/>')


# ---------------------------------------------------------------- l'inscription

def ruyi(cx, cy, s, fill, stroke=None, rot=0):
    """Une tête de ruyi : le nuage à trois lobes des sceptres et des angles chinois."""
    d = ("M0 -9 C5 -16 14 -11 10 -3 C17 -1 14 10 6 7 C5 13 -5 13 -6 7 C-14 10 -17 -1 -10 -3 C-14 -11 -5 -16 0 -9Z "
         "M0 -2 C3 -5 6 -1 3 2 C1 4 -1 4 -3 2 C-6 -1 -3 -5 0 -2Z")
    st = f' stroke="{stroke}" stroke-width="{fmt(1.2 / s)}"' if stroke else ""
    return tf(f'<path d="{d}" fill="{fill}" fill-rule="evenodd"{st}/>', cx, cy, rot, s)


PLATES = {
    "laque": dict(top="#4A0B09", bot="#1A0303", ink="#FFF1D0", accent="#F2C46A", edge="gold"),
    "encre": dict(top="#1A1620", bot="#07060A", ink="#FFF1D0", accent="#EFC46E", edge="gold"),
    "jade": dict(top="#0F3F33", bot="#04160F", ink="#F2FFF8", accent="#F2D27A", edge="gold"),
    "indigo": dict(top="#18235A", bot="#070A22", ink="#F4F1FF", accent="#E9CF8A", edge="gold"),
    "soie": dict(top="#F7EEDC", bot="#E6D3AE", ink="#3A1408", accent="#9A2A16", edge="gold"),
    "argent": dict(top="#141A3A", bot="#05071A", ink="#F4F7FF", accent="#C9D7F2", edge="silver"),
    "obsidienne": dict(top="#16112C", bot="#05030C", ink="#FFF3EA", accent="#F2C987", edge="gold"),
    "prisme": dict(top="#120E2A", bot="#04030B", ink="#FFFFFF", accent="#E7DCFF", edge="prism"),
    "laque-or": dict(top="#4A0B09", bot="#1A0303", ink="#FFF1D0", accent="#F2C46A", edge="redgold"),
}


from base import plate_layer  # noqa: E402  la couche « plate » et ses emplacements de texte


@plate_layer
def plate(card, title, message=None, y=752, style="laque", w=424, kicker=KICK, numero=None, title_size=38,
          ornament="ruyi", rollers=False, opacity=0.94, h=None):
    """L'inscription : un panneau de laque à double filet de métal, têtes de ruyi aux flancs."""
    p = PLATES[style]
    if p["edge"] == "prism":
        edge, hi, mid, lo = card.prism("pl-prism"), "#FFFFFF", "#B9A7FF", "#4C3BC4"
    else:
        hi, mid, lo = METALS[p["edge"]]
        edge = card.grad(f"pl-edge-{p['edge']}", [(0, hi), (0.25, mid), (0.5, lo), (0.75, mid), (1, hi)], 0, 0, 1, 0)
    h = h or (136 if message else 112)
    x0 = (W - w) / 2
    fill = card.grad(f"pl-fill-{style}", [(0, p["top"]), (1, p["bot"])])
    card.add(f'<rect x="{fmt(x0)}" y="{fmt(y + 8)}" width="{fmt(w)}" height="{fmt(h)}" rx="14" fill="#000000" opacity="0.6" filter="{card.blur("pl-sh", 10)}"/>')
    if rollers:
        for rx in (x0 - 14, x0 + w - 4):
            card.add(f'<rect x="{fmt(rx)}" y="{fmt(y - 10)}" width="18" height="{fmt(h + 20)}" rx="7" fill="{card.grad("pl-roll", [(0, "#2A0E06"), (0.5, "#6A2E14"), (1, "#1A0804")], 0, 0, 1, 0)}"/>')
            for yy in (y - 12, y + h + 4):
                card.add(f'<rect x="{fmt(rx - 2)}" y="{fmt(yy)}" width="22" height="8" rx="3" fill="{edge}"/>')
    card.add(f'<rect x="{fmt(x0)}" y="{fmt(y)}" width="{fmt(w)}" height="{fmt(h)}" rx="14" fill="{fill}" opacity="{opacity}"/>')
    card.add(f'<rect x="{fmt(x0)}" y="{fmt(y)}" width="{fmt(w)}" height="{fmt(h * 0.42)}" rx="14" fill="{lg(card, [(0, "#FFFFFF", 0.1), (1, "#FFFFFF", 0)], name="pl-gloss")}"/>')
    card.add(f'<rect x="{fmt(x0)}" y="{fmt(y)}" width="{fmt(w)}" height="{fmt(h)}" rx="14" fill="none" stroke="{lo}" stroke-width="4.5" opacity="0.75"/>')
    card.add(f'<rect x="{fmt(x0)}" y="{fmt(y)}" width="{fmt(w)}" height="{fmt(h)}" rx="14" fill="none" stroke="{edge}" stroke-width="2.4"/>')
    card.add(f'<rect x="{fmt(x0 + 7)}" y="{fmt(y + 7)}" width="{fmt(w - 14)}" height="{fmt(h - 14)}" rx="9" fill="none" stroke="{edge}" stroke-width="0.8" opacity="0.8"/>')
    if ornament == "ruyi":
        card.add(ruyi(x0 + 2, y + h / 2, 0.95, edge, lo, -90), ruyi(x0 + w - 2, y + h / 2, 0.95, edge, lo, 90))
        card.add(ruyi(270, y - 1, 0.8, edge, lo, 0))
    elif ornament == "perle":
        for cx in (x0 + 2, x0 + w - 2):
            card.add(f'<circle cx="{fmt(cx)}" cy="{fmt(y + h / 2)}" r="7" fill="{edge}" stroke="{lo}" stroke-width="1"/>'
                     f'<circle cx="{fmt(cx - 2)}" cy="{fmt(y + h / 2 - 2)}" r="2.2" fill="#FFFFFF" opacity="0.8"/>')
    if numero:
        pw = 110
        card.add(f'<rect x="{fmt(270 - pw / 2)}" y="{fmt(y - 12)}" width="{pw}" height="23" rx="11.5" fill="#0B0814" stroke="{edge}" stroke-width="1.8"/>')
        card.add(f'<text x="270" y="{fmt(y + 4)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="11" letter-spacing="2" fill="#FFFFFF">{esc(numero)}</text>')
    n = len(card.body)
    if message:
        ky, ty, my, dy = y + 31, y + 72, y + 104, y + 124
    else:
        ky, ty, dy = y + 33, y + 76, y + 98
    card.add(f'<text x="270" y="{fmt(ky)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="11" letter-spacing="2.6" fill="{p["accent"]}">{esc(kicker.upper())}</text>')
    card.add(f'<text x="270" y="{fmt(ty)}" text-anchor="middle" font-family="{CINZEL}" font-weight="700" font-size="{title_size}" fill="{p["ink"]}">{esc(title)}</text>')
    if message:
        card.add(f'<text x="270" y="{fmt(my)}" text-anchor="middle" font-family="{HAND}" font-weight="700" font-size="26" fill="{p["ink"]}">{esc(message)}</text>')
    card.add(f'<text x="270" y="{fmt(dy)}" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="11.5" letter-spacing="1.2" fill="{p["accent"]}" opacity="0.92">{esc(DATE)}</text>')
    if style != "soie":
        since(card, n, f'filter="{card.shadow("txt", 0, 1.4, 1.8, "#000000", 0.85)}"')
    return y + h


# ---------------------------------------------------------------- Mee et Meo, manifeste

def duo(card, spots, mee, meo):
    """`spots` = [(x, y, taille, flip, rotation)] pour Mee puis Meo."""
    for (x, y, s, flip, rot), pose in zip(spots, (mee, meo)):
        bird(card, pose, x, y, s, flip=flip, rotate=rot)


def finish(card, short, rank, division, option, name, story, layout, message):
    card.save(OUT / f"{SLUG}-{short}.svg")
    MANIFEST.append(dict(file=f"{SLUG}-{short}.jpg", rank=rank, division=division, option=option, name=name,
                         story=story, layout=layout, message=message))


def write_manifest():
    order = {"ambassadeur": 0, "orateur": 1, "oracle": 2, "legende": 3, "mythe": 4}
    items = sorted(MANIFEST, key=lambda m: (order[m["rank"]], -(m["division"] or 0), m["option"]))
    (OUT / "manifest.json").write_text(json.dumps(items, ensure_ascii=False, indent=2))
