"""Outils communs de l'atelier « Olympe » (au-dessus de lib/base.py).

Filtres (marbre veiné, relief repoussé, nuées), fenêtres photo, filets d'or, inscription, manifeste.
"""

import itertools
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
from base import f, pt, W, H, METALS, Card, photo, plaque, nebula, sparkle  # noqa: E402

SLUG = "olympe"
OUT = ROOT / "out" / SLUG
KICKER = "Nouveau rang · Olympe"

GOLD = "#E8B53C"
GOLD_HI = "#FFF4C2"
GOLD_LO = "#8A5A12"
MARBLE = "#F3EFE6"
MARBLE_SH = "#C9C2B4"
AEGEAN = "#1F5FA8"
AEGEAN_D = "#0B2447"
AEGEAN_L = "#7FB8E6"
PURPLE = "#5B1A4E"
PURPLE_D = "#2A0A26"
OLIVE = "#7E8C4A"
OLIVE_L = "#B9C48E"
TERRA = "#C8642E"
GLAZE = "#17110D"
SAPPHIRE = "#2F7BE0"

from base import nid  # noqa: E402,F401  le compteur des identifiants vit dans Card


def T(x, y, s=1.0, r=0.0, flip=False, sy=None):
    sx = -s if flip else s
    return f"translate({f(x)} {f(y)}) rotate({f(r)}) scale({f(sx)} {f(s if sy is None else sy)})"


def grp(markup, x=0, y=0, s=1.0, r=0.0, flip=False, filt=None, op=None, sy=None):
    a = f' filter="{filt}"' if filt else ""
    o = f' opacity="{op}"' if op is not None else ""
    return f'<g transform="{T(x, y, s, r, flip, sy)}"{a}{o}>{markup}</g>'


def start(uid, top="#3A2C22", bottom="#110C09", rim="#FFD49A", glow=0.22):
    c = Card(uid)
    photo(c, top, bottom, rim, 2, glow)
    return c


def lgrad(card, name, stops, x1=0, y1=0, x2=0, y2=1):
    """Dégradé linéaire avec opacité par arrêt : [(offset, couleur, opacité)]."""
    st = "".join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops)
    return card.def_once(name, f'<linearGradient id="{card.id(name)}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{st}</linearGradient>')


def ugrad(card, name, stops, x1, y1, x2, y2):
    """Dégradé linéaire en coordonnées absolues (userSpaceOnUse) : utile pour un même éclairage sur plusieurs formes."""
    st = "".join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops)
    return card.def_once(name, f'<linearGradient id="{card.id(name)}" gradientUnits="userSpaceOnUse" x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}">{st}</linearGradient>')


def urgrad(card, name, stops, cx, cy, r):
    st = "".join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops)
    return card.def_once(name, f'<radialGradient id="{card.id(name)}" gradientUnits="userSpaceOnUse" cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}">{st}</radialGradient>')


def halo(card, name, cx, cy, rx, ry, color, op):
    card.add(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{card.rgrad(name, [(0, color, op), (1, color, 0)])}"/>')


def gold_fill(card, key="gold"):
    """Un or à cinq bandes, plus vivant que le dégradé de base."""
    hi, mid, lo = METALS[key]
    return card.grad(f"g5-{key}", [(0, hi), (0.22, mid), (0.45, lo), (0.55, mid), (0.75, hi), (1, mid)], 0, 0, 0.6, 1)


def gold_h(card, key="gold"):
    hi, mid, lo = METALS[key]
    return card.grad(f"gh-{key}", [(0, lo), (0.18, mid), (0.5, hi), (0.82, mid), (1, lo)], 0, 0, 1, 0)


def gold_v(card, key="gold"):
    hi, mid, lo = METALS[key]
    return card.grad(f"gv-{key}", [(0, hi), (0.35, mid), (0.5, lo), (0.65, mid), (1, hi)], 0, 0, 0, 1)


# ---------------------------------------------------------------- filtres

def soft(card, sd):
    return card.blur(f"soft{sd}", sd)


def _spikes(levels, n=64, width=1):
    vals = [0.0] * n
    for lv, amp in levels:
        i = round(lv * (n - 1))
        for k in range(-width + 1, width):
            if 0 <= i + k < n:
                vals[i + k] = max(vals[i + k], amp * (1 - abs(k) / width))
    return " ".join(f"{v:.2f}" for v in vals)


def _rgb(hexc):
    return tuple(int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5))


def marble_filter(card, name="marble", seed=3, freq=(0.0045, 0.015), warp=70, vein="#6F6A63", vein_op=0.8,
                  cloud="#B5AC9C", cloud_op=0.45, gold=False, gold_color="#E2A93A", fine=True):
    """Marbre veiné : les veines sont des LIGNES DE NIVEAU d'un bruit fractal tordu (une table de transfert
    ne garde que quelques valeurs), posées sur la forme source avec un voile nuageux.
    `gold` ajoute un réseau de veines d'or (le marbre brisé réparé à l'or)."""
    fx, fy = freq
    vr, vg, vb = _rgb(vein)
    cr, cg, cb = _rgb(cloud)
    main = _spikes([(0.46, 1.0), (0.555, 0.65)], 84, 1)
    thin = _spikes([(0.44, 0.3), (0.6, 0.22)], 110, 1)
    golds = ""
    gold_merge = ""
    if gold:
        gr, gg, gb = _rgb(gold_color)
        golds = (
            f'<feTurbulence type="fractalNoise" baseFrequency="{fx * 0.8} {fy * 0.7}" numOctaves="3" seed="{seed + 21}" result="gt"/>'
            f'<feDisplacementMap in="gt" in2="w" scale="{warp * 1.4}" xChannelSelector="G" yChannelSelector="R" result="gtd"/>'
            f'<feColorMatrix in="gtd" type="matrix" values="0 0 0 0 {gr:.3f}  0 0 0 0 {gg:.3f}  0 0 0 0 {gb:.3f}  1 0 0 0 0" result="ga"/>'
            f'<feComponentTransfer in="ga" result="gv"><feFuncA type="table" tableValues="{_spikes([(0.5, 1.0)], 110, 1)}"/></feComponentTransfer>'
            f'<feComposite in="gv" in2="SourceAlpha" operator="in" result="gv2"/>'
            f'<feGaussianBlur in="gv2" stdDeviation="1.6" result="gglow"/>'
        )
        gold_merge = '<feMergeNode in="gglow"/><feMergeNode in="gv2"/>'
    fine_layer = ""
    fine_merge = ""
    if fine:
        fine_layer = (
            f'<feTurbulence type="fractalNoise" baseFrequency="{fx * 2.4} {fy * 2.0}" numOctaves="2" seed="{seed + 11}" result="ft"/>'
            f'<feDisplacementMap in="ft" in2="w" scale="{warp * 0.6}" xChannelSelector="R" yChannelSelector="G" result="ftd"/>'
            f'<feColorMatrix in="ftd" type="matrix" values="0 0 0 0 {vr:.3f}  0 0 0 0 {vg:.3f}  0 0 0 0 {vb:.3f}  1 0 0 0 0" result="fa"/>'
            f'<feComponentTransfer in="fa" result="fv"><feFuncA type="table" tableValues="{thin}"/></feComponentTransfer>'
            f'<feComposite in="fv" in2="SourceAlpha" operator="in" result="fv2"/>'
        )
        fine_merge = '<feMergeNode in="fv2"/>'
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{fx * 0.5} {fy * 0.5}" numOctaves="2" seed="{seed}" result="w"/>'
        f'<feTurbulence type="fractalNoise" baseFrequency="{fx} {fy}" numOctaves="3" seed="{seed + 5}" result="t"/>'
        f'<feDisplacementMap in="t" in2="w" scale="{warp}" xChannelSelector="R" yChannelSelector="G" result="td"/>'
        f'<feColorMatrix in="td" type="matrix" values="0 0 0 0 {vr:.3f}  0 0 0 0 {vg:.3f}  0 0 0 0 {vb:.3f}  1 0 0 0 0" result="va"/>'
        f'<feComponentTransfer in="va" result="v"><feFuncA type="table" tableValues="{main}"/></feComponentTransfer>'
        f'<feGaussianBlur in="v" stdDeviation="0.7" result="vb"/>'
        f'<feColorMatrix in="vb" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 {vein_op} 0" result="vo"/>'
        f'<feGaussianBlur in="vo" stdDeviation="2.6" result="vh"/>'
        f'<feComposite in="vo" in2="SourceAlpha" operator="in" result="v1"/>'
        f'<feComposite in="vh" in2="SourceAlpha" operator="in" result="vh2"/>'
        f'<feMerge result="v2"><feMergeNode in="vh2"/><feMergeNode in="v1"/></feMerge>'
        f'{fine_layer}'
        f'<feTurbulence type="fractalNoise" baseFrequency="{fx * 1.4} {fy * 1.1}" numOctaves="4" seed="{seed + 9}" result="c"/>'
        f'<feColorMatrix in="c" type="matrix" values="0 0 0 0 {cr:.3f}  0 0 0 0 {cg:.3f}  0 0 0 0 {cb:.3f}  {2.4 * cloud_op:.2f} 0 0 0 {-1.0 * cloud_op:.2f}" result="cl"/>'
        f'<feComposite in="cl" in2="SourceAlpha" operator="in" result="cl2"/>'
        f'{golds}'
        f'<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="cl2"/>{fine_merge}<feMergeNode in="v2"/>{gold_merge}</feMerge></filter>',
    )
    return f"url(#{card.id(name)})"


def relief(card, name="relief", light="#FFF6DD", scale=3.0, blur=1.2, spec=0.9, exp=20, az=225, el=40,
           diffuse=1.45, drop=0.5, dy=3, sd=3):
    """Relief repoussé : l'alpha de la forme devient une hauteur éclairée de biais (or, marbre sculpté)."""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">'
        f'<feGaussianBlur in="SourceAlpha" stdDeviation="{blur}" result="hb"/>'
        f'<feDiffuseLighting in="hb" surfaceScale="{scale}" diffuseConstant="1" lighting-color="#FFFFFF" result="df">'
        f'<feDistantLight azimuth="{az}" elevation="{el}"/></feDiffuseLighting>'
        f'<feComposite in="SourceGraphic" in2="df" operator="arithmetic" k1="{diffuse}" k2="0" k3="0" k4="0" result="shade"/>'
        f'<feSpecularLighting in="hb" surfaceScale="{scale}" specularConstant="{spec}" specularExponent="{exp}" lighting-color="{light}" result="sp">'
        f'<feDistantLight azimuth="{az}" elevation="{el}"/></feSpecularLighting>'
        f'<feComposite in="sp" in2="SourceAlpha" operator="in" result="sp2"/>'
        f'<feComposite in="shade" in2="sp2" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lit"/>'
        f'<feComposite in="lit" in2="SourceAlpha" operator="in" result="lit2"/>'
        f'<feGaussianBlur in="SourceAlpha" stdDeviation="{sd}" result="sb"/><feOffset in="sb" dx="0" dy="{dy}" result="so"/>'
        f'<feFlood flood-color="#000000" flood-opacity="{drop}"/><feComposite in2="so" operator="in" result="shadow"/>'
        f'<feMerge><feMergeNode in="shadow"/><feMergeNode in="lit2"/></feMerge></filter>',
    )
    return f"url(#{card.id(name)})"


def cloud_filter(card, name, freq=0.011, octaves=4, seed=3, disp=70, sharp=2.2, bias=-0.55):
    """Nuée : la forme est déchirée par un bruit fractal et son opacité modulée en volutes."""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="{octaves}" seed="{seed}" result="t"/>'
        f'<feDisplacementMap in="SourceGraphic" in2="t" scale="{disp}" xChannelSelector="R" yChannelSelector="G" result="d"/>'
        f'<feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  {sharp} 0 0 0 {bias}" result="ta"/>'
        f'<feComposite in="d" in2="ta" operator="in"/></filter>',
    )
    return f"url(#{card.id(name)})"


def cloud(card, name, cx, cy, rx, ry, c1, c2, op=0.9, seed=3, freq=0.011, disp=70, rot=0, sharp=2.2, bias=-0.55):
    """Une nuée à volutes (dégradé déchiré par le filtre de nuage) : nébuleuse, fumée, brume."""
    g = card.rgrad(name + "-g", [(0, c1, op), (0.45, c2, op * 0.75), (1, c2, 0)])
    filt = cloud_filter(card, name + "-f", freq, 4, seed, disp, sharp, bias)
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{g}" filter="{filt}" transform="rotate({rot} {f(cx)} {f(cy)})"/>'


def grain(card, name="grain", op=0.08):
    """Un grain fin pour tuer l'aplat numérique."""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="0" y="0" width="100%" height="100%">'
        f'<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n"/>'
        f'<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 {op * 6} {-op * 2.4}"/>'
        f'<feComposite in2="SourceAlpha" operator="in"/></filter>',
    )
    return f"url(#{card.id(name)})"


# ---------------------------------------------------------------- fenêtres

def window_path(x0=60, y0=240, x1=480, y1=736, r=18, arch=None):
    if arch == "round":
        rx = (x1 - x0) / 2
        return (f"M{f(x0)} {f(y1 - r)} L{f(x0)} {f(y0 + rx)} A{f(rx)} {f(rx)} 0 0 1 {f(x1)} {f(y0 + rx)} L{f(x1)} {f(y1 - r)} "
                f"Q{f(x1)} {f(y1)} {f(x1 - r)} {f(y1)} L{f(x0 + r)} {f(y1)} Q{f(x0)} {f(y1)} {f(x0)} {f(y1 - r)}Z")
    if arch == "flat":
        rx = (x1 - x0) / 2
        k = rx * 0.55
        return (f"M{f(x0)} {f(y1 - r)} L{f(x0)} {f(y0 + k)} Q{f(x0)} {f(y0)} {f(x0 + rx)} {f(y0)} Q{f(x1)} {f(y0)} {f(x1)} {f(y0 + k)} L{f(x1)} {f(y1 - r)} "
                f"Q{f(x1)} {f(y1)} {f(x1 - r)} {f(y1)} L{f(x0 + r)} {f(y1)} Q{f(x0)} {f(y1)} {f(x0)} {f(y1 - r)}Z")
    if arch == "oval":
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        rx, ry = (x1 - x0) / 2, (y1 - y0) / 2
        return f"M{f(cx - rx)} {f(cy)} A{f(rx)} {f(ry)} 0 1 1 {f(cx + rx)} {f(cy)} A{f(rx)} {f(ry)} 0 1 1 {f(cx - rx)} {f(cy)}Z"
    return (f"M{f(x0 + r)} {f(y0)} L{f(x1 - r)} {f(y0)} Q{f(x1)} {f(y0)} {f(x1)} {f(y0 + r)} L{f(x1)} {f(y1 - r)} Q{f(x1)} {f(y1)} {f(x1 - r)} {f(y1)} "
            f"L{f(x0 + r)} {f(y1)} Q{f(x0)} {f(y1)} {f(x0)} {f(y1 - r)} L{f(x0)} {f(y0 + r)} Q{f(x0)} {f(y0)} {f(x0 + r)} {f(y0)}Z")


def window(card, name, path):
    """Masque qui garde la photo visible dans `path` et laisse dessiner partout ailleurs."""
    card.def_once(name, f'<mask id="{card.id(name)}"><rect width="{W}" height="{H}" fill="#FFFFFF"/><path d="{path}" fill="#000000"/></mask>')
    return f"url(#{card.id(name)})"


def inside(card, name, path):
    """Clip qui ne garde que l'intérieur de `path` (lumières posées sur la photo)."""
    card.def_once(name, f'<clipPath id="{card.id(name)}"><path d="{path}"/></clipPath>')
    return f"url(#{card.id(name)})"


def inner_shadow(card, path, w=18, op=0.7, color="#000000"):
    """Ombre intérieure : la photo semble enchâssée sous le cadre."""
    uid = nid("is")
    card.def_once(uid, f'<clipPath id="{card.id(uid)}"><path d="{path}"/></clipPath>')
    card.add(f'<g clip-path="url(#{card.id(uid)})"><path d="{path}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{op}" filter="{card.blur("is-blur" + str(w), w * 0.45)}"/></g>')


def gold_line(card, path, w=3, key="gold", inner=True, op=1):
    hi, mid, lo = METALS[key]
    g = card.grad(f"gl-{key}", [(0, hi), (0.3, mid), (0.5, lo), (0.7, mid), (1, hi)], 0, 0, 1, 1)
    card.add(f'<g opacity="{op}"><path d="{path}" fill="none" stroke="{lo}" stroke-width="{w + 2}" opacity="0.85"/>'
             f'<path d="{path}" fill="none" stroke="{g}" stroke-width="{w}"/>'
             + (f'<path d="{path}" fill="none" stroke="{hi}" stroke-width="0.8" opacity="0.75"/>' if inner else "") + "</g>")


def wrap_since(card, n, filt=None, mask=None, op=None):
    seg = "".join(card.body[n:])
    del card.body[n:]
    a = (f' filter="{filt}"' if filt else "") + (f' mask="{mask}"' if mask else "") + (f' opacity="{op}"' if op is not None else "")
    card.add(f'<g{a}>{seg}</g>')


# ---------------------------------------------------------------- inscription

from base import plate_layer  # noqa: E402  la couche « plate » et ses emplacements de texte


@plate_layer
def inscription(card, title, message=None, y=752, style="nu", shadow=True, kicker=KICKER, **kw):
    """La plaque de base avec une ombre portée sur le texte, pour qu'elle tienne sur n'importe quel fond."""
    n = len(card.body)
    plaque(card, kicker, title, message=message, y=y, style=style, **kw)
    if shadow:
        wrap_since(card, n, card.shadow("txt", 0, 1.5, 2.2, "#000000", 0.85))


def seal(card, x, y, text1="Nº 42", text2="/ 100", r=34):
    """Le sceau numéroté de la série limitée du Mythe."""
    fill = card.prism("seal-prism", 0, 0, 1, 1)
    card.add(
        f'<g filter="{card.shadow("seal-sh", 0, 3, 4, "#000000", 0.6)}">'
        f'<circle cx="{f(x)}" cy="{f(y)}" r="{r}" fill="{fill}"/>'
        f'<circle cx="{f(x)}" cy="{f(y)}" r="{r - 6}" fill="#0B0814" opacity="0.9"/>'
        f'<circle cx="{f(x)}" cy="{f(y)}" r="{r - 9}" fill="none" stroke="{fill}" stroke-width="0.8" stroke-dasharray="1.5 2.5"/>'
        f'<text x="{f(x)}" y="{f(y - 3)}" text-anchor="middle" font-family="{CINZEL}" font-weight="700" font-size="13" fill="#FFFFFF">{esc(text1)}</text>'
        f'<text x="{f(x)}" y="{f(y + 12)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="9" letter-spacing="1.5" fill="#E9DDFF">{esc(text2)}</text></g>'
    )


def pill(card, x, y, text, stroke, fill="#0B0814", color="#FFFFFF", w=None):
    w = w or (len(text) * 7.4 + 30)
    card.add(
        f'<g filter="{card.shadow("pill-sh", 0, 2, 3, "#000000", 0.5)}">'
        f'<rect x="{f(x - w / 2)}" y="{f(y - 12)}" width="{f(w)}" height="24" rx="12" fill="{fill}" opacity="0.92"/>'
        f'<rect x="{f(x - w / 2)}" y="{f(y - 12)}" width="{f(w)}" height="24" rx="12" fill="none" stroke="{stroke}" stroke-width="1.4"/>'
        f'<text x="{f(x)}" y="{f(y + 4.5)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="11.5" letter-spacing="2" fill="{color}">{esc(text)}</text></g>'
    )


# ---------------------------------------------------------------- manifeste

MANIFEST = []
ORDER = ["ambassadeur-5", "ambassadeur-4", "ambassadeur-3", "ambassadeur-2", "ambassadeur-1", "orateur-a", "orateur-b", "orateur-c",
         "oracle-a", "oracle-b", "oracle-c", "legende-5", "legende-4", "legende-3", "legende-2", "legende-1", "mythe-a", "mythe-b", "mythe-c"]


def register(stem, rank, division, option, name, story, layout, message):
    MANIFEST.append({"file": f"{SLUG}-{stem}.jpg", "rank": rank, "division": division, "option": option, "name": name,
                     "story": story, "layout": layout, "message": message})


def write_manifest():
    path = OUT / "manifest.json"
    existing = []
    if path.exists():
        mine = {x["file"] for x in MANIFEST}
        existing = [m for m in json.loads(path.read_text()) if m["file"] not in mine]

    def key(m):
        stem = m["file"].replace(SLUG + "-", "").replace(".jpg", "")
        return ORDER.index(stem) if stem in ORDER else 99

    path.write_text(json.dumps(sorted(existing + MANIFEST, key=key), ensure_ascii=False, indent=2))
