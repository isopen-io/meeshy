"""Afrique éternelle - bâtir : les constructions de terre, de pierre, de bois et de chaume du continent.

Huttes en ruche d'un umuzi zoulou (KwaZulu-Natal, Afrique du Sud), takienta des Batammariba (Koutammakou, Togo et Bénin),
Achum du palais de Bafut (Grassfields, Cameroun), stèles d'Aksoum (Éthiopie), maisons peintes ndebele (Afrique du Sud),
kgotla tswana (Botswana), bas-reliefs des palais royaux d'Abomey (Bénin), minaret de terre de Sankoré (Tombouctou, Mali).
Toutes sont des créations originales, dessinées d'après l'architecture, jamais d'après une œuvre.
"""

import math
import random

from base import W, H, f, pt
from motifs import bevel, lion, _mane, _taper, LION_HEAD_ROAR, LION_FANGS

# ---------------------------------------------------------------- matières

ADOBE = ("#F6C98A", "#C8834A", "#6A3418")
LATERITE = ("#E8A070", "#A8502A", "#4A1A0A")
GRANITE = ("#E8DCD0", "#A89488", "#4A3C38")
TUF = ("#F0B8A0", "#B86A52", "#5A2418")
CHAUME = ("#F8DE8E", "#C89A3E", "#5A3A10")


def earth(card, name="earth", freq="0.045", seed=4, scale=4, light="#FFF0DC", az=225, el=42, k1=0.72, k2=0.44):
    """Texture de terre crépie : bruit fractal éclairé, multiplié par la couleur de la forme."""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" filterUnits="userSpaceOnUse" x="-20" y="-20" width="{W + 40}" height="{H + 40}" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="4" seed="{seed}" result="n"/>'
        f'<feDiffuseLighting in="n" surfaceScale="{scale}" lighting-color="{light}" diffuseConstant="1.1" result="l"><feDistantLight azimuth="{az}" elevation="{el}"/></feDiffuseLighting>'
        f'<feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="{k1}" k2="{k2}" k3="0" k4="0" result="t"/>'
        f'<feComposite in="t" in2="SourceAlpha" operator="in"/></filter>',
    )
    return f"url(#{card.id(name)})"


def hshade(card, name, mat, lit=1):
    """Dégradé horizontal d'un volume rond éclairé de côté (lit = +1 : lumière à droite)."""
    hi, mid, lo = mat
    stops = [(0, lo), (0.35, mid), (0.78, hi), (1, mid)] if lit > 0 else [(0, mid), (0.22, hi), (0.65, mid), (1, lo)]
    return card.grad(name, stops, 0, 0, 1, 0)


# ---------------------------------------------------------------- takienta (Koutammakou)

def thatch_cone(card, name, cx, base_y, r, h, mat=CHAUME, lit=1, seed=5, tuft=True):
    """Toit conique de paille, rangs superposés, pointe nouée."""
    rnd = random.Random(seed)
    g = hshade(card, name + "-g", mat, lit)
    hi, mid, lo = mat
    out = []
    rows = 4
    for k in range(rows):
        t0 = k / rows
        y0 = base_y - h * t0
        rr = r * (1 - t0) * 1.04
        y1 = base_y - h
        d = f"M{f(cx - rr)} {f(y0)} L{f(cx)} {f(y1)} L{f(cx + rr)} {f(y0)} Q{f(cx)} {f(y0 + r * 0.16 * (1 - t0))} {f(cx - rr)} {f(y0)} Z"
        out.append(f'<path d="{d}" fill="{g}" stroke="{lo}" stroke-width="0.8" stroke-opacity="0.6"/>')
        strokes = []
        for _ in range(int(40 * (1 - t0) + 8)):
            u = rnd.uniform(-1, 1)
            sx = cx + u * rr
            sy = y0 + r * 0.14 * (1 - t0) * (1 - u * u) - rnd.uniform(0, 3)
            ex = cx + u * rr * 0.72
            ey = sy - h * 0.2
            strokes.append(f'<line x1="{f(sx)}" y1="{f(sy)}" x2="{f(ex)}" y2="{f(ey)}" stroke="{hi if (u * lit) > 0 else lo}" stroke-width="0.7" opacity="0.55"/>')
        out.append("".join(strokes))
    if tuft:
        out.append(f'<path d="M{f(cx - r * 0.06)} {f(base_y - h + 2)} L{f(cx)} {f(base_y - h - r * 0.35)} L{f(cx + r * 0.06)} {f(base_y - h + 2)} Z" fill="{mid}"/>')
    return "".join(out)


def tower(card, name, x, top, gy, w, mat=ADOBE, lit=1, taper=0.08, seed=3, door=None, rings=True):
    """Une tour de terre cylindrique (takienta, grenier) : volume ombré, enduit, cordons horizontaux."""
    hw0, hw1 = w / 2, w / 2 * (1 - taper)
    d = (f"M{f(x - hw0)} {f(gy)} L{f(x - hw1)} {f(top + w * 0.06)} Q{f(x)} {f(top - w * 0.04)} {f(x + hw1)} {f(top + w * 0.06)} "
         f"L{f(x + hw0)} {f(gy)} Q{f(x)} {f(gy + w * 0.08)} {f(x - hw0)} {f(gy)} Z")
    g = hshade(card, name + "-g", mat, lit)
    hi, mid, lo = mat
    out = [f'<g filter="{earth(card, name + "-e", "0.03", seed, 1.8)}"><path d="{d}" fill="{g}"/></g>']
    if rings:
        for t in (0.22, 0.58):
            y = top + (gy - top) * t
            hw = hw1 + (hw0 - hw1) * t
            out.append(f'<path d="M{f(x - hw)} {f(y)} Q{f(x)} {f(y + w * 0.09)} {f(x + hw)} {f(y)}" fill="none" stroke="{lo}" stroke-width="2.4" opacity="0.5"/>')
            out.append(f'<path d="M{f(x - hw)} {f(y - 2)} Q{f(x)} {f(y + w * 0.09 - 2)} {f(x + hw)} {f(y - 2)}" fill="none" stroke="{hi}" stroke-width="1.2" opacity="0.6"/>')
    if door:
        dy, dh = door
        dw = w * 0.24
        out.append(f'<path d="M{f(x - dw / 2)} {f(dy)} L{f(x - dw / 2)} {f(dy - dh + dw / 2)} A{f(dw / 2)} {f(dw / 2)} 0 0 1 {f(x + dw / 2)} {f(dy - dh + dw / 2)} L{f(x + dw / 2)} {f(dy)} Z" fill="#160804"/>')
    return "".join(out)


# ---------------------------------------------------------------- stèles d'Aksoum

def aksum_stela(card, name, x, top, gy, w, mat=GRANITE, storeys=6, lit=1, seed=1, glow=None):
    """Stèle d'Aksoum : fût de granit sculpté comme une tour à étages - fausse porte, fausses fenêtres,
    rangs de « têtes de singe » (bouts de poutres), tête arrondie."""
    hi, mid, lo = mat
    wt = w * 0.9
    head = wt * 0.5
    body_top = top + head
    d = (f"M{f(x - w / 2)} {f(gy)} L{f(x - wt / 2)} {f(body_top)} A{f(wt / 2)} {f(head)} 0 0 1 {f(x + wt / 2)} {f(body_top)} L{f(x + w / 2)} {f(gy)} Z")
    g = hshade(card, name + "-g", mat, lit)
    out = []
    if glow:
        out.append(f'<path d="{d}" fill="none" stroke="{glow}" stroke-width="10" opacity="0.4" filter="{card.blur(name + "-gl", 6)}"/>')
    out.append(f'<g filter="{earth(card, name + "-e", "0.08", seed, 1.4, "#FFF4EC")}"><path d="{d}" fill="{g}"/></g>')
    shade = "#000000"
    usable = gy - body_top
    door_h = usable * 0.2
    sh = (usable - door_h) / storeys
    hw = lambda y: (w / 2) - (w - wt) / 2 * (gy - y) / (gy - body_top)
    dy0 = gy - door_h
    dw = w * 0.42
    out.append(f'<rect x="{f(x - dw / 2)}" y="{f(dy0 + door_h * 0.12)}" width="{f(dw)}" height="{f(door_h * 0.82)}" fill="{lo}" opacity="0.75"/>')
    out.append(f'<rect x="{f(x - dw / 2 + 3)}" y="{f(dy0 + door_h * 0.12 + 3)}" width="{f(dw - 6)}" height="{f(door_h * 0.82 - 3)}" fill="none" stroke="{hi}" stroke-width="1" opacity="0.5"/>')
    out.append(f'<circle cx="{f(x + dw * 0.22)}" cy="{f(dy0 + door_h * 0.55)}" r="{f(w * 0.03)}" fill="{hi}" opacity="0.8"/>')
    for k in range(storeys):
        yb = dy0 - k * sh
        yt = yb - sh
        half = hw(yb) - 3
        band = sh * 0.24
        out.append(f'<rect x="{f(x - half)}" y="{f(yb - band)}" width="{f(2 * half)}" height="{f(band)}" fill="{shade}" opacity="0.18"/>')
        nb = 5
        for i in range(nb):
            bx = x - half + (i + 0.5) * 2 * half / nb
            by = yb - band / 2
            out.append(f'<circle cx="{f(bx)}" cy="{f(by)}" r="{f(band * 0.36)}" fill="{lo}" opacity="0.5"/>'
                       f'<circle cx="{f(bx - band * 0.06)}" cy="{f(by - band * 0.06)}" r="{f(band * 0.3)}" fill="{mid}"/>'
                       f'<circle cx="{f(bx - band * 0.12)}" cy="{f(by - band * 0.12)}" r="{f(band * 0.12)}" fill="{hi}" opacity="0.8"/>')
        win_h = sh - band - 10
        ww = half * 0.56
        for s_ in (-1, 1):
            wx = x + s_ * half * 0.5 - ww / 2
            wy = yt + 5
            out.append(f'<rect x="{f(wx - 2)}" y="{f(wy - 2)}" width="{f(ww + 4)}" height="{f(win_h + 4)}" fill="{shade}" opacity="0.16"/>')
            out.append(f'<rect x="{f(wx)}" y="{f(wy)}" width="{f(ww)}" height="{f(win_h)}" fill="{lo}" opacity="0.8"/>')
            out.append(f'<rect x="{f(wx + ww * 0.22)}" y="{f(wy + win_h * 0.18)}" width="{f(ww * 0.56)}" height="{f(win_h * 0.64)}" fill="{shade}" opacity="0.55"/>')
            for cx_, cy_ in ((wx, wy), (wx + ww, wy), (wx, wy + win_h), (wx + ww, wy + win_h)):
                out.append(f'<circle cx="{f(cx_)}" cy="{f(cy_)}" r="{f(ww * 0.13)}" fill="{mid}"/><circle cx="{f(cx_ - 0.6)}" cy="{f(cy_ - 0.6)}" r="{f(ww * 0.05)}" fill="{hi}" opacity="0.8"/>')
            out.append(f'<line x1="{f(wx)}" y1="{f(wy + win_h + 1)}" x2="{f(wx + ww)}" y2="{f(wy + win_h + 1)}" stroke="{hi}" stroke-width="0.9" opacity="0.6"/>')
        out.append(f'<line x1="{f(x - half)}" y1="{f(yt)}" x2="{f(x + half)}" y2="{f(yt)}" stroke="{hi}" stroke-width="1" opacity="0.4"/>')
    out.append(f'<circle cx="{f(x)}" cy="{f(top + head * 0.62)}" r="{f(wt * 0.16)}" fill="{lo}" opacity="0.6"/>'
               f'<circle cx="{f(x)}" cy="{f(top + head * 0.62)}" r="{f(wt * 0.1)}" fill="{mid}"/>')
    return "".join(out)


# ---------------------------------------------------------------- peinture ndebele

NDEBELE = {"blanc": "#F7F2E6", "noir": "#141414", "jaune": "#F2B21E", "bleu": "#2A62B8", "rouge": "#C8282A", "vert": "#1E8A4A", "rose": "#E6608A", "ciel": "#5AB4E0"}


def ndebele_panel(x, y, w, h, motif, colors, k=NDEBELE, lw=3.2):
    """Une case de mur ndebele : fond blanc, cernes noirs épais, aplats de couleur géométriques."""
    c1, c2 = colors
    cx, cy = x + w / 2, y + h / 2
    out = [f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="{k["blanc"]}" stroke="{k["noir"]}" stroke-width="{f(lw)}"/>']
    st = f'stroke="{k["noir"]}" stroke-width="{f(lw)}" stroke-linejoin="miter"'
    if motif == "marches":
        steps = 4
        sw, shh = w * 0.8 / (2 * steps), h * 0.7 / steps
        pts = [(cx - w * 0.4, y + h * 0.85)]
        for i in range(steps):
            px, py = pts[-1]
            pts += [(px, py - shh), (px + sw, py - shh)]
        for i in range(steps):
            px, py = pts[-1]
            pts += [(px, py + shh), (px + sw, py + shh)] if i < steps - 1 else [(px, py + shh)]
        pts.append((cx + w * 0.4, y + h * 0.85))
        d = "M" + " L".join(f"{f(a)} {f(b)}" for a, b in pts) + " Z"
        out.append(f'<path d="{d}" fill="{c1}" {st}/>')
        out.append(f'<rect x="{f(cx - w * 0.08)}" y="{f(y + h * 0.42)}" width="{f(w * 0.16)}" height="{f(h * 0.43)}" fill="{c2}" {st}/>')
    elif motif == "lame":
        out.append(f'<path d="M{f(x + w * 0.12)} {f(cy - h * 0.18)} L{f(cx - w * 0.12)} {f(cy - h * 0.18)} L{f(cx)} {f(cy - h * 0.02)} L{f(cx + w * 0.12)} {f(cy - h * 0.18)} '
                   f'L{f(x + w * 0.88)} {f(cy - h * 0.18)} L{f(x + w * 0.88)} {f(cy + h * 0.18)} L{f(cx + w * 0.12)} {f(cy + h * 0.18)} L{f(cx)} {f(cy + h * 0.02)} '
                   f'L{f(cx - w * 0.12)} {f(cy + h * 0.18)} L{f(x + w * 0.12)} {f(cy + h * 0.18)} Z" fill="{c1}" {st}/>')
        out.append(f'<rect x="{f(x + w * 0.2)}" y="{f(cy - h * 0.06)}" width="{f(w * 0.12)}" height="{f(h * 0.12)}" fill="{c2}" {st}/>')
        out.append(f'<rect x="{f(x + w * 0.68)}" y="{f(cy - h * 0.06)}" width="{f(w * 0.12)}" height="{f(h * 0.12)}" fill="{c2}" {st}/>')
    elif motif == "maison":
        bx0, bx1 = x + w * 0.18, x + w * 0.82
        out.append(f'<path d="M{f(bx0)} {f(y + h * 0.88)} L{f(bx0)} {f(y + h * 0.42)} L{f(cx)} {f(y + h * 0.12)} L{f(bx1)} {f(y + h * 0.42)} L{f(bx1)} {f(y + h * 0.88)} Z" fill="{c1}" {st}/>')
        out.append(f'<path d="M{f(cx - w * 0.1)} {f(y + h * 0.88)} L{f(cx - w * 0.1)} {f(y + h * 0.58)} L{f(cx + w * 0.1)} {f(y + h * 0.58)} L{f(cx + w * 0.1)} {f(y + h * 0.88)}" fill="{c2}" {st}/>')
        out.append(f'<path d="M{f(cx - w * 0.14)} {f(y + h * 0.4)} L{f(cx)} {f(y + h * 0.27)} L{f(cx + w * 0.14)} {f(y + h * 0.4)} Z" fill="{k["noir"]}"/>')
    elif motif == "chevrons":
        for i in range(3):
            off = i * h * 0.22
            out.append(f'<path d="M{f(x + w * 0.12)} {f(y + h * 0.3 + off)} L{f(cx)} {f(y + h * 0.12 + off)} L{f(x + w * 0.88)} {f(y + h * 0.3 + off)} L{f(x + w * 0.88)} {f(y + h * 0.42 + off)} '
                       f'L{f(cx)} {f(y + h * 0.24 + off)} L{f(x + w * 0.12)} {f(y + h * 0.42 + off)} Z" fill="{(c1, c2, c1)[i]}" {st}/>')
    elif motif == "lampe":
        out.append(f'<path d="M{f(cx)} {f(y + h * 0.1)} L{f(cx + w * 0.24)} {f(y + h * 0.36)} L{f(cx + w * 0.24)} {f(y + h * 0.9)} L{f(cx - w * 0.24)} {f(y + h * 0.9)} L{f(cx - w * 0.24)} {f(y + h * 0.36)} Z" fill="{c1}" {st}/>')
        out.append(f'<rect x="{f(cx - w * 0.1)}" y="{f(y + h * 0.48)}" width="{f(w * 0.2)}" height="{f(h * 0.26)}" fill="{c2}" {st}/>')
        for s_ in (-1, 1):
            out.append(f'<rect x="{f(cx + s_ * w * 0.36 - w * 0.05)}" y="{f(y + h * 0.3)}" width="{f(w * 0.1)}" height="{f(h * 0.5)}" fill="{k["noir"]}"/>')
    elif motif == "carres":
        for i, (r, col) in enumerate(((0.4, c1), (0.27, k["blanc"]), (0.15, c2))):
            out.append(f'<rect x="{f(cx - w * r)}" y="{f(cy - h * r)}" width="{f(2 * w * r)}" height="{f(2 * h * r)}" fill="{col}" {st}/>')
    return "".join(out)


# ---------------------------------------------------------------- Sankoré (Tombouctou)

def toron(x0, x1, y, step, length, color, shadow="#000000", w=2.8, tip="#E8B880"):
    """Les toron : bouts de poutres de palmier qui hérissent les murs de terre (échafaudage permanent)."""
    out = []
    x = x0
    while x <= x1:
        out.append(f'<line x1="{f(x)}" y1="{f(y + 1)}" x2="{f(x + length * 0.5)}" y2="{f(y + length * 0.9)}" stroke="{shadow}" stroke-width="{f(w * 1.1)}" opacity="0.3" stroke-linecap="round"/>')
        out.append(f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(x - length * 0.35)}" y2="{f(y - length * 0.1)}" stroke="{color}" stroke-width="{f(w)}" stroke-linecap="round"/>')
        out.append(f'<circle cx="{f(x - length * 0.35)}" cy="{f(y - length * 0.1)}" r="{f(w * 0.42)}" fill="{tip}"/>')
        x += step
    return "".join(out)


def sankore(card, name, cx, gy, h, w, mat=ADOBE, lit=1, seed=7, toron_c="#5A3418"):
    """Le minaret de terre de Sankoré : pyramide tronquée, arêtes adoucies, hérissée de toron."""
    hi, mid, lo = mat
    tw = w * 0.32
    top = gy - h
    d = (f"M{f(cx - w / 2)} {f(gy)} C{f(cx - w * 0.46)} {f(gy - h * 0.4)} {f(cx - tw * 0.7)} {f(top + h * 0.2)} {f(cx - tw / 2)} {f(top)} "
         f"L{f(cx + tw / 2)} {f(top)} C{f(cx + tw * 0.7)} {f(top + h * 0.2)} {f(cx + w * 0.46)} {f(gy - h * 0.4)} {f(cx + w / 2)} {f(gy)} Z")
    g = card.grad(name + "-g", [(0, lo), (0.3, mid), (0.5, mid), (0.5, hi), (0.85, hi), (1, mid)] if lit > 0 else [(0, mid), (0.15, hi), (0.5, hi), (0.5, mid), (0.7, mid), (1, lo)], 0, 0, 1, 0)
    out = [f'<g filter="{earth(card, name + "-e", "0.03", seed, 1.8)}"><path d="{d}" fill="{g}"/></g>']
    rows = 7
    for k in range(1, rows):
        y = gy - h * k / rows
        t = k / rows
        hw = (w / 2) * (1 - t) + (tw / 2) * t
        out.append(toron(cx - hw * 0.75, cx + hw * 0.75, y, max(16, hw / 2.2), 11, toron_c, w=3))
    for s_ in (-1, 0, 1):
        px = cx + s_ * tw * 0.36
        out.append(f'<path d="M{f(px - 5)} {f(top + 1)} L{f(px - 4)} {f(top - 12)} Q{f(px)} {f(top - 18)} {f(px + 4)} {f(top - 12)} L{f(px + 5)} {f(top + 1)} Z" fill="{mid}"/>')
        out.append(f'<ellipse cx="{f(px)}" cy="{f(top - 19)}" rx="2.6" ry="3.2" fill="#FFF8EC"/>')
    return "".join(out)


def pinnacle(card, name, x, top, gy, w, mat=ADOBE, lit=1, egg=True, seed=2):
    """Contrefort de façade soudano-sahélienne : pilastre de terre effilé en cône, coiffé d'un œuf d'autruche."""
    hi, mid, lo = mat
    h = gy - top
    d = (f"M{f(x - w / 2)} {f(gy)} C{f(x - w * 0.5)} {f(gy - h * 0.45)} {f(x - w * 0.3)} {f(top + h * 0.22)} {f(x - w * 0.08)} {f(top + 2)} "
         f"Q{f(x)} {f(top - 2)} {f(x + w * 0.08)} {f(top + 2)} C{f(x + w * 0.3)} {f(top + h * 0.22)} {f(x + w * 0.5)} {f(gy - h * 0.45)} {f(x + w / 2)} {f(gy)} Z")
    g = hshade(card, name + "-g", mat, lit)
    out = [f'<g filter="{earth(card, name + "-e", "0.035", seed, 1.6)}"><path d="{d}" fill="{g}"/></g>']
    if egg:
        out.append(f'<ellipse cx="{f(x)}" cy="{f(top - w * 0.12)}" rx="{f(w * 0.13)}" ry="{f(w * 0.17)}" fill="#FFF8EC"/>')
    return "".join(out)


def manuscript(card, name, x, y, w, h, rot=0, ink="#3A1A08", gold="#C8902A", paper=("#F8EBCB", "#E2C890"), seed=4, diagram="astro"):
    """Un feuillet de manuscrit de Tombouctou : papier ambré, cadre enluminé, diagramme astronomique à l'encre d'or."""
    rnd = random.Random(seed)
    pg = card.grad(name + "-pg", [(0, paper[0]), (1, paper[1])], 0, 0, 1, 1)
    out = [f'<g transform="rotate({f(rot)} {f(x + w / 2)} {f(y + h / 2)})">']
    out.append(f'<rect x="{f(x + 3)}" y="{f(y + 5)}" width="{f(w)}" height="{f(h)}" rx="3" fill="#000000" opacity="0.4" filter="{card.blur(name + "-sh", 3)}"/>')
    out.append(f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="3" fill="{pg}"/>')
    out.append(f'<rect x="{f(x + 5)}" y="{f(y + 5)}" width="{f(w - 10)}" height="{f(h - 10)}" fill="none" stroke="{gold}" stroke-width="1.6"/>')
    out.append(f'<rect x="{f(x + 8)}" y="{f(y + 8)}" width="{f(w - 16)}" height="{f(h - 16)}" fill="none" stroke="{ink}" stroke-width="0.6" opacity="0.6"/>')
    cx, cy = x + w / 2, y + h * 0.42
    r = min(w, h) * 0.3
    if diagram == "astro":
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="{gold}" stroke-width="1.4"/>')
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.72)}" fill="none" stroke="{ink}" stroke-width="0.8"/>')
        for i in range(12):
            x1, y1 = pt(cx, cy, r * 0.72, i * 30)
            x2, y2 = pt(cx, cy, r, i * 30)
            out.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{ink}" stroke-width="0.7"/>')
        star = " L".join(f"{f(pt(cx, cy, r * (0.68 if i % 2 == 0 else 0.3), i * 22.5)[0])} {f(pt(cx, cy, r * (0.68 if i % 2 == 0 else 0.3), i * 22.5)[1])}" for i in range(16))
        out.append(f'<path d="M{star} Z" fill="{gold}" opacity="0.85"/>')
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.12)}" fill="{ink}"/>')
    else:
        for i in range(8):
            x1, y1 = pt(cx, cy, r, i * 45)
            x2, y2 = pt(cx, cy, r, i * 45 + 135)
            out.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{gold}" stroke-width="1.2"/>')
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="{ink}" stroke-width="0.8"/>')
    for j in range(5):
        ly = y + h * 0.72 + j * h * 0.045
        if ly > y + h - 12:
            break
        xx = x + 12
        while xx < x + w - 14:
            ln = rnd.uniform(5, 14)
            out.append(f'<line x1="{f(xx)}" y1="{f(ly)}" x2="{f(min(xx + ln, x + w - 12))}" y2="{f(ly)}" stroke="{ink}" stroke-width="1.1" opacity="0.6" stroke-linecap="round"/>')
            xx += ln + rnd.uniform(2, 4)
    out.append("</g>")
    return "".join(out)


# ---------------------------------------------------------------- chaume en rangs (Bafut, Abomey)

def thatch_courses(card, name, x0, x1, ys, mat=CHAUME, seed=5, fringe=6.0, lit=-1, shade=0.3):
    """Des rangs de chaume superposés : chaque rang a sa frange qui recouvre le haut du rang du dessous.
    `ys` : les lignes de rang, de haut en bas ; le dessin commence par le rang du bas."""
    rnd = random.Random(seed)
    hi, mid, lo = mat
    stops = [(0, hi), (0.45, mid), (1, lo)] if lit < 0 else [(0, lo), (0.55, mid), (1, hi)]
    g = card.grad(name + "-h", stops, 0, 0, 1, 0)
    sh = card.grad(name + "-s", [(0, "#000000AA"), (0.45, "#00000033"), (1, "#00000000")], 0, 0, 0, 1)
    out = []
    for k in range(len(ys) - 2, -1, -1):
        ya, yb = ys[k], ys[k + 1]
        fr = fringe * (1.6 if k == len(ys) - 2 else 1.0)
        pts = [f"{f(x0)} {f(ya - 1)}", f"{f(x1)} {f(ya - 1)}"]
        x = x1
        while x > x0:
            pts.append(f"{f(x)} {f(yb + rnd.uniform(0.2, 1) * fr)}")
            x -= rnd.uniform(1.6, 3.4)
            pts.append(f"{f(x)} {f(yb + rnd.uniform(-0.2, 0.3) * fr)}")
            x -= rnd.uniform(1.2, 2.6)
        d = "M" + " L".join(pts) + " Z"
        out.append(f'<path d="{d}" fill="{g}"/>')
        out.append(f'<rect x="{f(x0)}" y="{f(ya)}" width="{f(x1 - x0)}" height="{f((yb - ya) * 0.55)}" fill="{sh}" opacity="{f(shade / 0.3 * 0.55)}"/>')
        st = []
        for _ in range(int((x1 - x0) * (yb - ya) / 9)):
            sx = rnd.uniform(x0, x1)
            sy = rnd.uniform(ya + (yb - ya) * 0.15, yb + fr * 0.6)
            ln = rnd.uniform(4, 10)
            col = hi if rnd.random() < 0.45 else lo
            st.append(f'<line x1="{f(sx)}" y1="{f(sy - ln)}" x2="{f(sx + rnd.uniform(-0.8, 0.8))}" y2="{f(sy)}" stroke="{col}" stroke-width="{f(rnd.uniform(0.5, 1.0))}" opacity="0.5"/>')
        out.append("".join(st))
    return "".join(out)


# ---------------------------------------------------------------- huttes en ruche zouloues (iqhugwane)

HERBE = ("#F4D08A", "#B8843C", "#3E2410")


def _ruche_pt(x, gy, w, h, u, t):
    hw = w / 2 * max(0.0, 1 - t ** 2.1) ** 0.5 * (1 + 0.06 * (1 - t) ** 10)
    return x + u * hw, gy - h * t


def beehive_hut(card, name, x, gy, w, h, mat=HERBE, lit=1, seed=3, door=True, rope=None, rim=None, net=True):
    """Hutte en ruche zouloue (iqhugwane) : une armature de jeunes branches couverte de chaume, que retient un filet de cordes d'herbe."""
    rnd = random.Random(seed)
    hi, mid, lo = mat
    n = 32
    left = [_ruche_pt(x, gy, w, h, -1, i / n) for i in range(n + 1)]
    right = [_ruche_pt(x, gy, w, h, 1, i / n) for i in range(n, -1, -1)]
    d = "M" + " L".join(f"{f(px)} {f(py)}" for px, py in left + right) + f" Q{f(x)} {f(gy + h * 0.07)} {f(left[0][0])} {f(left[0][1])} Z"
    out = []
    if rim:
        out.append(f'<path d="{d}" fill="{rim}" transform="translate({f(1.6 * lit)} -1.2)"/>')
    out.append(f'<g filter="{earth(card, name + "-e", "0.09 0.025", seed, 1.4)}"><path d="{d}" fill="{hshade(card, name + "-g", mat, lit)}"/></g>')
    out.append(f'<path d="{d}" fill="{card.grad(name + "-v", [(0, "#FFFFFF1A"), (0.5, "#00000000"), (1, "#00000070")], 0, 0, 0, 1)}"/>')
    sw = max(0.7, w / 110)
    st = []
    for _ in range(int(min(560, w * h / 12))):
        u = math.sin(math.radians(rnd.uniform(-86, 86)))
        t = rnd.uniform(0.02, 0.93)
        x1, y1 = _ruche_pt(x, gy, w, h, u, t)
        x2, y2 = _ruche_pt(x, gy, w, h, u, min(0.99, t + rnd.uniform(0.05, 0.12)))
        bright = u * lit > 0.1
        st.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{hi if bright else lo}" stroke-width="{f(rnd.uniform(0.5, 0.9) * sw)}" opacity="{0.55 if bright else 0.4}"/>')
    out.append(f'<g stroke-linecap="round">{"".join(st)}</g>')
    if net:
        rc = rope or lo
        segs = []
        for sgn in (1, -1):
            for phi0 in range(-330, 331, 34):
                pts = []
                for k in range(41):
                    t = 0.03 + 0.9 * k / 40
                    phi = phi0 + sgn * 150 * t
                    if -84 < phi < 84:
                        pts.append(_ruche_pt(x, gy, w, h, math.sin(math.radians(phi)), t))
                if len(pts) > 1:
                    segs.append("M" + " L".join(f"{f(px)} {f(py)}" for px, py in pts))
        rw = max(0.6, w * 0.013)
        out.append(f'<path d="{" ".join(segs)}" fill="none" stroke="{rc}" stroke-width="{f(rw * 1.6)}" opacity="0.55" stroke-linejoin="round"/>')
        out.append(f'<path d="{" ".join(segs)}" fill="none" stroke="{hi}" stroke-width="{f(rw * 0.6)}" opacity="0.4" transform="translate({f(-0.5 * lit)} -0.5)"/>')
    if door:
        dw, dh = w * 0.2, h * 0.3
        out.append(f'<path d="M{f(x - dw / 2)} {f(gy + 1)} L{f(x - dw / 2)} {f(gy - dh + dw / 2)} A{f(dw / 2)} {f(dw / 2)} 0 0 1 {f(x + dw / 2)} {f(gy - dh + dw / 2)} L{f(x + dw / 2)} {f(gy + 1)} Z" fill="#140804"/>')
        for i in range(9):
            fx = x - dw * 0.55 + i * dw * 0.14
            out.append(f'<line x1="{f(fx)}" y1="{f(gy - dh - 1)}" x2="{f(fx + 0.6)}" y2="{f(gy - dh + dw * 0.18)}" stroke="{lo}" stroke-width="{f(sw)}" opacity="0.7"/>')
    out.append(f'<ellipse cx="{f(x)}" cy="{f(gy - h + 1.5)}" rx="{f(w * 0.05)}" ry="{f(w * 0.03)}" fill="{mid}"/>')
    out.append(f'<path d="M{f(x - w * 0.025)} {f(gy - h + 1)} L{f(x)} {f(gy - h - w * 0.07)} L{f(x + w * 0.025)} {f(gy - h + 1)} Z" fill="{mid}"/>')
    return "".join(out)


def kraal(x, gy, rx, ry, color, seed=4, hmin=7, hmax=12, step=3.0):
    """L'isibaya : l'enclos rond du bétail, une haie de pieux et de branchages au cœur de l'umuzi. Rend (arrière, avant)."""
    rnd = random.Random(seed)
    back, front = [], []
    n = int(2 * math.pi * rx / step)
    for i in range(n):
        a = 2 * math.pi * i / n
        px, py = x + rx * math.cos(a), gy + ry * math.sin(a)
        depth = math.sin(a)
        h = rnd.uniform(hmin, hmax) * (0.82 + 0.18 * depth)
        lean = rnd.uniform(-1.4, 1.4)
        s = [f'<line x1="{f(px)}" y1="{f(py)}" x2="{f(px + lean)}" y2="{f(py - h)}" stroke-width="{f(rnd.uniform(1.1, 2.0) * (0.85 + 0.15 * depth))}"/>']
        if rnd.random() < 0.4:
            tx, ty = px + lean * 0.7, py - h * rnd.uniform(0.5, 0.9)
            s.append(f'<line x1="{f(tx)}" y1="{f(ty)}" x2="{f(tx + rnd.uniform(-5, 5))}" y2="{f(ty - rnd.uniform(2, 5))}" stroke-width="0.8"/>')
        (front if depth > 0 else back).append("".join(s))
    wrap = f'<g stroke="{color}" stroke-linecap="round">'
    return wrap + "".join(back) + "</g>", wrap + "".join(front) + "</g>"


def nguni(fill):
    """Vache nguni de profil : bosse légère, fanon, cornes en lyre (repère local, pieds à y = 0, face à droite)."""
    body = ("M30 -58 C28 -84 46 -94 72 -94 L128 -96 C138 -104 152 -106 160 -98 C166 -92 172 -88 178 -86 "
            "L196 -84 C204 -82 206 -74 201 -68 L190 -62 C184 -60 178 -62 172 -64 C166 -58 160 -54 154 -52 "
            "C140 -48 120 -48 100 -48 C80 -48 58 -50 44 -52 C38 -54 32 -56 30 -58 Z")
    legs = "".join(f'<path d="M{a} -56 L{a + 10} -56 L{a + 8} 0 L{a + 2} 0 Z"/>' for a in (36, 52, 128, 144))
    lines = ('<path d="M176 -90 C168 -104 176 -118 190 -120 M184 -90 C192 -104 204 -110 212 -104 M31 -80 C22 -70 20 -48 22 -22" '
             'fill="none" stroke-width="4.5" stroke-linecap="round"/>')
    return f'<g fill="{fill}" stroke="{fill}"><path d="{body}"/>{legs}{lines}<ellipse cx="22" cy="-18" rx="3.4" ry="6.5" stroke="none"/></g>'


ILALA = ("#F6E2B0", "#C9A262", "#6A4418")


def ilala_column(card, name, x0, x1, y0, y1, lit=1, cell=54, ink="#4A2410", mat=ILALA):
    """Un montant de vannerie zouloue en palmier ilala : spires cousues, losanges et dents de scie teints."""
    hi, mid, lo = mat
    w = x1 - x0
    cx = (x0 + x1) / 2
    card.def_once(name + "-c", f'<clipPath id="{card.id(name + "-c")}"><rect x="{f(x0)}" y="{f(y0)}" width="{f(w)}" height="{f(y1 - y0)}" rx="9"/></clipPath>')
    out = [f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(w)}" height="{f(y1 - y0)}" fill="{hshade(card, name + "-g", mat, lit)}"/>']
    s = 4.4
    motif, coils, stitches = [], [], []
    for r in range(int((y1 - y0) / s) + 1):
        y = y0 + r * s
        k = ((y - y0) % cell) / cell
        c = abs(k - 0.5) * 2
        hw = (1 - c) * w * 0.42
        if hw > 1.2:
            motif.append(f'<rect x="{f(cx - hw)}" y="{f(y)}" width="{f(2 * hw)}" height="{f(s)}" fill="{ink}"/>')
            inner = hw - w * 0.15
            if inner > 1:
                motif.append(f'<rect x="{f(cx - inner)}" y="{f(y)}" width="{f(2 * inner)}" height="{f(s)}" fill="{mid}"/>')
        if k < 2.1 * s / cell:
            for i in range(int(w / 5.5) + 1):
                if (i + r) % 2:
                    motif.append(f'<rect x="{f(x0 + i * 5.5)}" y="{f(y)}" width="5.5" height="{f(s)}" fill="{ink}"/>')
        coils.append(f'<line x1="{f(x0)}" y1="{f(y + s)}" x2="{f(x1)}" y2="{f(y + s)}" stroke="{lo}" stroke-width="0.9" opacity="0.55"/>'
                     f'<line x1="{f(x0)}" y1="{f(y + 0.9)}" x2="{f(x1)}" y2="{f(y + 0.9)}" stroke="{hi}" stroke-width="0.6" opacity="0.5"/>')
        xs = x0 + (r % 2) * 2.6
        while xs < x1:
            stitches.append(f'<line x1="{f(xs)}" y1="{f(y + 0.8)}" x2="{f(xs + 1.3)}" y2="{f(y + s - 0.5)}"/>')
            xs += 5.2
    out.append(f'<g opacity="0.88">{"".join(motif)}</g>{"".join(coils)}<g stroke="{lo}" stroke-width="0.8" opacity="0.35">{"".join(stitches)}</g>')
    body = f'<g clip-path="url(#{card.id(name + "-c")})">{"".join(out)}</g>'
    edge = (f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(w)}" height="{f(y1 - y0)}" rx="9" fill="none" stroke="{lo}" stroke-width="1.6"/>'
            f'<line x1="{f(x1 - 3 if lit > 0 else x0 + 3)}" y1="{f(y0 + 10)}" x2="{f(x1 - 3 if lit > 0 else x0 + 3)}" y2="{f(y1 - 10)}" stroke="{hi}" stroke-width="1.4" opacity="0.7"/>')
    return f'<rect x="{f(x0 + 3)}" y="{f(y0 + 5)}" width="{f(w)}" height="{f(y1 - y0)}" rx="9" fill="#000000" opacity="0.4" filter="{card.blur(name + "-sh", 4)}"/>' + body + edge


# ---------------------------------------------------------------- l'Achum de Bafut (Grassfields, Cameroun)

GF_THATCH = ("#EAC57E", "#9E7236", "#3A2410")
GF_WOOD = ("#E2B07A", "#94592C", "#3A1A0A")


def achum_roof(card, name, cx, apex, eave, half, mat=GF_THATCH, rows=13, seed=5, lit=-1, bulge=0.06, side=-1, side_w=26):
    """Le toit de l'Achum, la case sacrée du palais de Bafut : une pyramide de chaume très pentue, montée en rangs."""
    hi, mid, lo = mat
    hb = half * bulge
    lx, rx = cx - half, cx + half
    d = (f"M{f(cx)} {f(apex)} Q{f((cx + lx) / 2 - hb)} {f((apex + eave) / 2)} {f(lx)} {f(eave)} "
         f"Q{f(cx)} {f(eave + 7)} {f(rx)} {f(eave)} Q{f((cx + rx) / 2 + hb)} {f((apex + eave) / 2)} {f(cx)} {f(apex)} Z")
    card.def_once(name + "-c", f'<clipPath id="{card.id(name + "-c")}"><path d="{d}"/></clipPath>')
    ys = [apex - 10 + (eave + 12 - apex + 10) * (k / rows) ** 0.92 for k in range(rows + 1)]
    out = [f'<path d="{d}" fill="#000000" opacity="0.45" transform="translate(0 10)" filter="{card.blur(name + "-sh", 8)}"/>']
    if side:
        sx = lx if side < 0 else rx
        sd = f"M{f(cx)} {f(apex)} L{f(sx + side * side_w)} {f(eave - side_w * 0.5)} L{f(sx)} {f(eave + 2)} Z"
        card.def_once(name + "-sc", f'<clipPath id="{card.id(name + "-sc")}"><path d="{sd}"/></clipPath>')
        out.append(f'<g clip-path="url(#{card.id(name + "-sc")})"><rect x="{f(min(sx, sx + side * side_w) - 10)}" y="{f(apex - 20)}" width="{f(side_w + 20)}" height="{f(eave - apex + 40)}" fill="{mid}"/>'
                   f'{thatch_courses(card, name + "-st", min(sx, sx + side * side_w) - 10, max(sx, sx + side * side_w) + 10, ys, mat, seed + 3, fringe=4, lit=lit)}'
                   f'<path d="{sd}" fill="{"#FFF2D0" if side * lit > 0 else "#000000"}" opacity="{0.24 if side * lit > 0 else 0.35}"/></g>')
    out.append(f'<g clip-path="url(#{card.id(name + "-c")})"><rect x="{f(lx - 20)}" y="{f(apex - 20)}" width="{f(2 * half + 40)}" height="{f(eave - apex + 40)}" fill="{mid}"/>'
               f'{thatch_courses(card, name + "-t", lx - 20, rx + 20, ys, mat, seed, fringe=5, lit=lit)}'
               f'<rect x="{f(lx - 20)}" y="{f(apex - 20)}" width="{f(2 * half + 40)}" height="{f(eave - apex + 40)}" fill="{card.grad(name + "-b", [(0, "#FFF4D820"), (0.5, "#00000000"), (1, "#00000055")], 0, 0, 1, 0)}"/></g>')
    out.append(f'<path d="M{f(cx)} {f(apex)} Q{f((cx + lx) / 2 - hb)} {f((apex + eave) / 2)} {f(lx)} {f(eave)}" fill="none" stroke="{hi}" stroke-width="2.2" opacity="0.75"/>')
    out.append(f'<path d="M{f(cx)} {f(apex)} Q{f((cx + rx) / 2 + hb)} {f((apex + eave) / 2)} {f(rx)} {f(eave)}" fill="none" stroke="{lo}" stroke-width="2.4" opacity="0.8"/>')
    out.append(f'<path d="M{f(cx - 7)} {f(apex + 12)} L{f(cx - 2)} {f(apex - 22)} L{f(cx + 1)} {f(apex - 28)} L{f(cx + 3)} {f(apex - 21)} L{f(cx + 7)} {f(apex + 12)} Z" fill="{mid}"/>'
               f'<path d="M{f(cx - 7)} {f(apex + 12)} L{f(cx - 2)} {f(apex - 22)} L{f(cx + 1)} {f(apex - 28)}" fill="none" stroke="{hi}" stroke-width="1.2" opacity="0.8"/>'
               f'<rect x="{f(cx - 6)}" y="{f(apex - 2)}" width="12" height="4" rx="2" fill="{lo}"/><rect x="{f(cx - 5)}" y="{f(apex - 12)}" width="10" height="3" rx="1.5" fill="{lo}"/>')
    return "".join(out)


def raffia_palm(x, gy, h, color, seed=3, lean=0.0, fronds=8):
    """Palmier raphia : un stipe court et d'immenses palmes pennées qui retombent en gerbe (les vallées des Grassfields)."""
    rnd = random.Random(seed)
    tx, top = x + lean * h, gy - h * 0.3
    out = [_taper(x, gy, tx, top, h * 0.06, h * 0.045, color)]
    lw = max(0.55, h * 0.0045)
    for i in range(fronds):
        a = -78 + i * 156 / (fronds - 1) + rnd.uniform(-8, 8)
        ln = h * rnd.uniform(0.62, 0.86)
        c1 = pt(tx, top, ln * 0.6, a * 0.55)
        e = pt(tx, top, ln, a * 1.15)
        e = (e[0], e[1] + ln * 0.5 * (abs(a) / 80) ** 1.4)
        out.append(f'<path d="M{f(tx)} {f(top)} Q{f(c1[0])} {f(c1[1])} {f(e[0])} {f(e[1])}" fill="none" stroke="{color}" stroke-width="{f(h * 0.01)}" stroke-linecap="round"/>')
        leaves = []
        for j in range(3, 36):
            s = j / 36
            px = (1 - s) ** 2 * tx + 2 * (1 - s) * s * c1[0] + s * s * e[0]
            py = (1 - s) ** 2 * top + 2 * (1 - s) * s * c1[1] + s * s * e[1]
            dx = 2 * (1 - s) * (c1[0] - tx) + 2 * s * (e[0] - c1[0])
            dy = 2 * (1 - s) * (c1[1] - top) + 2 * s * (e[1] - c1[1])
            ang = math.atan2(dy, dx)
            ll = h * (0.02 + 0.12 * math.sin(math.pi * min(1.0, s * 1.08)) ** 0.6) * rnd.uniform(0.85, 1.1)
            for side in (-1, 1):
                b2 = ang + side * 0.95
                ex, ey = px + ll * math.cos(b2), py + ll * math.sin(b2) + ll * 0.6
                mx, my = px + ll * 0.5 * math.cos(b2), py + ll * 0.5 * math.sin(b2) + ll * 0.08
                leaves.append(f"M{f(px)} {f(py)} Q{f(mx)} {f(my)} {f(ex)} {f(ey)}")
        out.append(f'<path d="{" ".join(leaves)}" fill="none" stroke="{color}" stroke-width="{f(lw)}" stroke-linecap="round" opacity="0.92"/>')
    return "".join(out)


def raffia_wall(x0, x1, y0, y1, mat=("#C8A06A", "#7A5432", "#2E1A0C"), step=5.0, tie=44, seed=4):
    """Un mur des Grassfields en nervures de palmier raphia : tiges verticales serrées, liens horizontaux."""
    rnd = random.Random(seed)
    hi, mid, lo = mat
    out = [f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(x1 - x0)}" height="{f(y1 - y0)}" fill="{lo}"/>']
    x = x0 + 1
    while x < x1:
        w = rnd.uniform(step * 0.6, step * 0.85)
        out.append(f'<rect x="{f(x)}" y="{f(y0)}" width="{f(w)}" height="{f(y1 - y0)}" fill="{mid}"/><line x1="{f(x + w * 0.3)}" y1="{f(y0)}" x2="{f(x + w * 0.3)}" y2="{f(y1)}" stroke="{hi}" stroke-width="0.8" opacity="0.6"/>')
        x += step
    y = y0 + tie * 0.5
    while y < y1:
        out.append(f'<rect x="{f(x0)}" y="{f(y - 2)}" width="{f(x1 - x0)}" height="4" fill="{lo}"/><line x1="{f(x0)}" y1="{f(y - 1.4)}" x2="{f(x1)}" y2="{f(y - 1.4)}" stroke="{hi}" stroke-width="0.7" opacity="0.5"/>')
        y += tie
    return "".join(out)


def gf_spider(color):
    """Araignée de terre des Grassfields (celle qu'on consulte en divination), repère centré, ~36 px."""
    legs = []
    for side in (-1, 1):
        for a, kn, ft in ((-62, -40, -18), (-28, -14, 0), (18, 8, 26), (52, 40, 70)):
            k = pt(0, 0, 11, side * (90 + a))
            fo = pt(0, 0, 18, side * (90 + a + (ft - a)))
            legs.append(f"M{f(side * 4)} {f(a * 0.08)} L{f(k[0])} {f(k[1] - 3)} L{f(fo[0])} {f(fo[1])}")
    return (f'<path d="{" ".join(legs)}" fill="none" stroke="{color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>'
            f'<ellipse cx="0" cy="-5" rx="4.6" ry="4.2" fill="{color}"/><ellipse cx="0" cy="5.5" rx="6.6" ry="8" fill="{color}"/>')


def gf_frog(color):
    """Grenouille vue de dessus, emblème de fécondité des Grassfields, repère centré, ~36 px."""
    return (f'<path d="M0 -13 C6 -13 9 -7 9 0 C9 8 5 13 0 13 C-5 13 -9 8 -9 0 C-9 -7 -6 -13 0 -13 Z" fill="{color}"/>'
            f'<circle cx="-4.5" cy="-11" r="2.6" fill="{color}"/><circle cx="4.5" cy="-11" r="2.6" fill="{color}"/>'
            f'<path d="M6 -5 L13 -9 L14 -16 M-6 -5 L-13 -9 L-14 -16 M7 7 L16 2 L18 13 L12 17 M-7 7 L-16 2 L-18 13 L-12 17" '
            f'fill="none" stroke="{color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>')


def gf_lizard(color):
    """Lézard des portes sculptées des Grassfields, repère centré, ~40 px."""
    return (f'<path d="M0 -19 C3 -19 4 -15 3 -11 C5 -4 4 4 2 9 C1 14 4 18 8 20" fill="none" stroke="{color}" stroke-width="5" stroke-linecap="round"/>'
            f'<ellipse cx="0.5" cy="-15" rx="3.4" ry="4.6" fill="{color}"/>'
            f'<path d="M2 -8 L9 -11 L11 -16 M2 -8 L-6 -11 L-8 -16 M2 5 L9 8 L11 13 M2 5 L-6 8 L-8 13" fill="none" stroke="{color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>')


def gf_serpent(x0, x1, y, amp, color, w=5.0, waves=3.5, dots="#F4D9A8"):
    """Le serpent à deux têtes des Grassfields, qui ondule sur un linteau : le pouvoir qui veille des deux côtés."""
    n = 80
    P = [(x0 + (x1 - x0) * i / n, y + amp * math.sin(math.pi * 2 * waves * i / n)) for i in range(n + 1)]
    d = "M" + " L".join(f"{f(px)} {f(py)}" for px, py in P)
    out = [f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(w)}" stroke-linecap="round"/>']
    for (hx, hy), (qx, qy) in ((P[0], P[2]), (P[-1], P[-3])):
        a = math.degrees(math.atan2(hy - qy, hx - qx))
        out.append(f'<g transform="translate({f(hx)} {f(hy)}) rotate({f(a)})"><path d="M-2 {f(-w * 0.9)} C4 {f(-w * 1.1)} 9 {f(-w * 0.5)} 10 0 C9 {f(w * 0.5)} 4 {f(w * 1.1)} -2 {f(w * 0.9)} Z" fill="{color}"/>'
                   f'<circle cx="4" cy="{f(-w * 0.35)}" r="1.1" fill="{dots}"/></g>')
    out.append("".join(f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(w * 0.17)}" fill="{dots}" opacity="0.8"/>' for px, py in P[4:-4:3]))
    return "".join(out)


# ---------------------------------------------------------------- le kgotla (Botswana)

WOOD = ("#D9B48C", "#6E5240", "#1E140E")


def kgotla_post(card, name, x, top, gy, w, mat=WOOD, lit=1, seed=3, cut=0.0, fork=False, rim=None):
    """Un tronc du kgotla : un pieu de mopane écorcé et fendu, planté droit dans le sable."""
    rnd = random.Random(seed)
    hi, mid, lo = mat
    n = 10
    L, R = [], []
    for i in range(n + 1):
        t = i / n
        y = gy - (gy - top) * t
        hw = w / 2 * (1 - 0.12 * t)
        L.append((x - hw + rnd.uniform(-1, 1) * w * 0.05, y))
        R.append((x + hw + rnd.uniform(-1, 1) * w * 0.05, y))
    L[-1] = (L[-1][0], top + cut * w)
    R[-1] = (R[-1][0], top - cut * w)
    crown = []
    if fork:
        crown = [(x - w * 0.36, top - w * 1.1), (x - w * 0.12, top - w * 1.0), (x, top + w * 0.2), (x + w * 0.14, top - w * 0.8), (x + w * 0.38, top - w * 0.86)]
    pts = L + crown + list(reversed(R))
    d = "M" + " L".join(f"{f(px)} {f(py)}" for px, py in pts) + " Z"
    out = [f'<g filter="{earth(card, name + "-e", "0.3 0.012", seed, 2.4, "#FFF4E4")}"><path d="{d}" fill="{hshade(card, name + "-g", mat, lit)}"/></g>']
    cracks = []
    for _ in range(3):
        cx_ = x + rnd.uniform(-0.3, 0.3) * w
        y0 = rnd.uniform(top + 10, gy - 40)
        ln = rnd.uniform(30, 120)
        cracks.append(f'<path d="M{f(cx_)} {f(y0)} L{f(cx_ + rnd.uniform(-2, 2))} {f(y0 + ln * 0.5)} L{f(cx_ + rnd.uniform(-2, 2))} {f(min(gy, y0 + ln))}" fill="none" stroke="{lo}" stroke-width="1.3" opacity="0.6"/>')
    for _ in range(rnd.choice((1, 2))):
        ky = rnd.uniform(top + 30, gy - 40)
        kx = x + rnd.uniform(-0.2, 0.2) * w
        cracks.append(f'<ellipse cx="{f(kx)}" cy="{f(ky)}" rx="{f(w * 0.13)}" ry="{f(w * 0.2)}" fill="none" stroke="{lo}" stroke-width="1.6" opacity="0.6"/><ellipse cx="{f(kx)}" cy="{f(ky)}" rx="{f(w * 0.05)}" ry="{f(w * 0.08)}" fill="{lo}" opacity="0.6"/>')
    out.append("".join(cracks))
    edge = R if lit > 0 else L
    if rim:
        out.append(f'<path d="M{" L".join(f"{f(px)} {f(py)}" for px, py in edge)}" fill="none" stroke="{rim}" stroke-width="2" opacity="0.85"/>')
    return "".join(out)


def palisade(x0, x1, gy, hmin, hmax, wmin, wmax, color, rim=None, seed=5, gap=(1.0, 3.5), cx=270, slope=0.0):
    """Le fond du kgotla : une haie de troncs plantés serrés, en contre-jour ; `slope` les fait grandir vers les bords."""
    rnd = random.Random(seed)
    out = []
    x = x0
    while x < x1:
        k = 1 + slope * abs(x - cx) / 270
        w = rnd.uniform(wmin, wmax) * (0.8 + 0.2 * k)
        h = rnd.uniform(hmin, hmax) * k
        g = gy + slope * abs(x - cx) * 0.08
        lean = rnd.uniform(-1.2, 1.2) * k
        t = g - h
        if rnd.random() < 0.2:
            top = (f"L{f(x + lean - w * 0.25)} {f(t - w * 1.3)} L{f(x + lean + w * 0.2)} {f(t - w * 0.3)} "
                   f"L{f(x + lean + w * 0.5)} {f(t + w * 0.3)} L{f(x + lean + w * 0.8)} {f(t - w * 0.25)} L{f(x + lean + w * 1.25)} {f(t - w * 1.1)} ")
        else:
            cut = rnd.uniform(-0.5, 0.5) * w
            top = f"Q{f(x + lean + w * 0.5)} {f(t - w * 0.45 - cut * 0.5)} {f(x + lean + w)} {f(t - cut)} "
        d = (f"M{f(x)} {f(g)} C{f(x - w * 0.06)} {f(g - h * 0.5)} {f(x + lean * 0.5)} {f(t + h * 0.2)} {f(x + lean)} {f(t + cut if False else t)} "
             f"{top}C{f(x + lean * 0.5 + w)} {f(t + h * 0.2)} {f(x + w * 1.06)} {f(g - h * 0.5)} {f(x + w)} {f(g)} Z")
        out.append(f'<path d="{d}" fill="{color}"/>')
        if rim:
            right = x + w / 2 < cx
            ex = x + w + lean if right else x + lean
            out.append(f'<path d="M{f(ex)} {f(t + 1)} L{f(x + w if right else x)} {f(g)}" stroke="{rim}" stroke-width="{f(0.9 + 0.3 * k)}" opacity="0.85"/>')
        x += w + rnd.uniform(*gap)
    return "".join(out)


# ---------------------------------------------------------------- les bas-reliefs d'Abomey (Bénin)

BARRE = ("#E8906A", "#B0482A", "#4E180A")


def abomey_niche(card, name, x, y, w, h, bg="#EFE2C4", content="", depth=7, wall=BARRE):
    """Une niche des palais d'Abomey : un cadre modelé dans la terre de barre, et dans son creux un bas-relief peint.
    La lumière vient d'en haut à gauche : parois haute et gauche dans l'ombre, relief qui porte son ombre en bas à droite."""
    hi, mid, lo = wall
    m = 6
    out = [f'<rect x="{f(x - m + 2)}" y="{f(y - m + 3)}" width="{f(w + 2 * m)}" height="{f(h + 2 * m)}" rx="3" fill="#000000" opacity="0.4" filter="{card.blur("nsh", 3)}"/>',
           f'<rect x="{f(x - m)}" y="{f(y - m)}" width="{f(w + 2 * m)}" height="{f(h + 2 * m)}" rx="3" fill="{mid}"/>',
           f'<path d="M{f(x - m)} {f(y + h + m)} L{f(x - m)} {f(y - m)} L{f(x + w + m)} {f(y - m)}" fill="none" stroke="{hi}" stroke-width="2" opacity="0.8"/>',
           f'<path d="M{f(x + w + m)} {f(y - m)} L{f(x + w + m)} {f(y + h + m)} L{f(x - m)} {f(y + h + m)}" fill="none" stroke="{lo}" stroke-width="2" opacity="0.8"/>',
           f'<g filter="{earth(card, name + "-e", "0.06", 5, 1.2, "#FFFFFF")}"><rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="{bg}"/></g>',
           f'<path d="M{f(x)} {f(y)} L{f(x + w)} {f(y)} L{f(x + w - depth)} {f(y + depth)} L{f(x + depth)} {f(y + depth)} Z" fill="#000000" opacity="0.32"/>',
           f'<path d="M{f(x)} {f(y)} L{f(x + depth)} {f(y + depth)} L{f(x + depth)} {f(y + h - depth)} L{f(x)} {f(y + h)} Z" fill="#000000" opacity="0.42"/>',
           f'<path d="M{f(x + w)} {f(y)} L{f(x + w)} {f(y + h)} L{f(x + w - depth)} {f(y + h - depth)} L{f(x + w - depth)} {f(y + depth)} Z" fill="#FFFFFF" opacity="0.22"/>',
           f'<path d="M{f(x)} {f(y + h)} L{f(x + w)} {f(y + h)} L{f(x + w - depth)} {f(y + h - depth)} L{f(x + depth)} {f(y + h - depth)} Z" fill="#FFFFFF" opacity="0.14"/>']
    rel = bevel(card, "relief-bv", 1.4, 2.6, light="#FFF2DC", spec=0.7, exp=14, shadow=False)
    sh = card.shadow("relief-sh", 2.6, 2.2, 1.2, "#2A0C04", 0.6)
    out.append(f'<g filter="{sh}"><g filter="{rel}" transform="translate({f(x + w / 2)} {f(y + h / 2 + 2)})">{content}</g></g>')
    return "".join(out)


def emblem_lion(s=1.0, body="#E8A82E", mane="#A8521A"):
    """Le lion de Glèlè : « le lion qui a des dents ». Repère centré."""
    k = 0.4 * s
    head = f'<path d="{LION_HEAD_ROAR}" fill="{body}"/><path d="{LION_FANGS}" fill="#FFF6E4" transform="translate(1.4 0.8)"/><circle cx="182" cy="-104" r="2.6" fill="#1A0A04"/>'
    return (f'<g transform="translate({f(-104 * k)} {f(66 * k)}) scale({f(k)})">{lion(body, roar=True)}'
            f'<path d="{_mane(148, -86, 34, 40, n=17, k=0.24, rot=-40, seed=5)}" fill="{mane}"/>{head}'
            f'<path d="M60 -60 Q90 -66 120 -62" fill="none" stroke="{mane}" stroke-width="3" opacity="0.6"/></g>')


def emblem_shark(s=1.0, body="#3E5F8F", belly="#D2DDEA"):
    """Le requin de Béhanzin, « le requin irrité qui trouble la barre ». Repère centré."""
    d = ("M-58 -22 L-40 -4 C-26 -12 -12 -16 -4 -15 Q-2 -24 2 -34 Q10 -26 16 -15 C30 -14 42 -10 50 -3 "
         "C48 2 42 5 34 6 L20 8 L8 24 Q8 14 6 9 C-10 9 -26 6 -38 3 L-54 13 L-46 0 Z")
    bel = "M50 -3 C48 2 42 5 34 6 L20 8 L6 9 C-10 9 -26 6 -38 3 L-30 0 C-12 2 14 2 30 0 C40 -1 46 -2 50 -3 Z"
    gills = "".join(f'<path d="M{24 + i * 3.4} -8 Q{22 + i * 3.4} -3 {24 + i * 3.4} 2" fill="none" stroke="#1A2A44" stroke-width="1.3"/>' for i in range(4))
    return (f'<g transform="scale({f(s)})"><path d="{d}" fill="{body}"/><path d="{bel}" fill="{belly}"/>{gills}'
            f'<circle cx="38" cy="-6" r="1.8" fill="#0A0A14"/><path d="M-40 -4 C-20 -10 10 -12 40 -8" fill="none" stroke="#9FB6D6" stroke-width="1.2" opacity="0.7"/></g>')


def emblem_buffalo(s=1.0, body="#2A1A16", hl="#7A4A30", horn="#E8D8B8"):
    """Le buffle de Guézo. Repère centré, face à droite."""
    d = ("M6 -44 C20 -50 44 -52 62 -56 C72 -60 80 -56 84 -48 L92 -44 L100 -30 C101 -25 97 -22 92 -24 L84 -30 "
         "C78 -26 74 -22 72 -18 L72 0 L64 0 L63 -14 L58 -14 L58 0 L50 0 L48 -18 C36 -16 24 -16 16 -18 L18 0 L10 0 "
         "L8 -14 L4 -14 L4 0 L-4 0 C-4 -16 -2 -34 6 -44 Z")
    return (f'<g transform="scale({f(s)}) translate(-48 28)"><path d="M6 -42 C0 -34 -3 -24 -1 -14" fill="none" stroke="{body}" stroke-width="2.6" stroke-linecap="round"/>'
            f'<ellipse cx="-1" cy="-12" rx="2.4" ry="4" fill="{body}"/><path d="{d}" fill="{body}"/>'
            f'<path d="M20 -46 C36 -50 52 -52 64 -56" fill="none" stroke="{hl}" stroke-width="3" opacity="0.8"/>'
            f'<path d="M86 -50 C82 -40 78 -33 73 -35 C69 -37 67 -43 68 -50" fill="none" stroke="{horn}" stroke-width="5.2" stroke-linecap="round"/>'
            f'<path d="M71 -40 C68 -43 67 -47 67 -52" fill="none" stroke="{horn}" stroke-width="3" stroke-linecap="round"/>'
            f'<ellipse cx="84" cy="-51" rx="6" ry="3.4" fill="{horn}"/>'
            f'<circle cx="90" cy="-38" r="1.6" fill="#F4E6CC"/></g>')


def emblem_jar(s=1.0, body="#C4622E", lip="#EAC9A0", hole="#1C0A04", band="#F2E6CC", water="#5AA8D8"):
    """La jarre percée de Guézo : pour qu'elle garde l'eau, chacun doit en boucher un trou de son doigt - l'unité du royaume."""
    jar = ("M-6 -27 L6 -27 L6 -18 C16 -15 21 -5 20 7 C19 20 11 28 0 28 C-11 28 -19 20 -20 7 C-21 -5 -16 -15 -6 -18 Z")
    holes = [(-13, 2), (-5, 5), (4, 3), (12, 6), (-9, 14), (8, 15)]
    drops = "".join(
        f'<path d="M{x + 1} {y + 3} C{x + 3} {y + 7} {x + 4} {y + 10} {x + 6} {y + 12}" fill="none" stroke="{water}" stroke-width="1.6" stroke-linecap="round"/>'
        f'<path d="M{x + 7} {y + 14} C{x + 9} {y + 17} {x + 9} {y + 19} {x + 7} {y + 20} C{x + 5} {y + 19} {x + 5} {y + 17} {x + 7} {y + 14} Z" fill="{water}"/>'
        for x, y in ((-13, 2), (12, 6)))
    zig = " L".join(f"{f(-16 + i * 3.2)} {f(-9 + (2.6 if i % 2 else -1.2))}" for i in range(11))
    return (f'<g transform="scale({f(s)}) translate(0 -2)"><path d="{jar}" fill="{body}"/>'
            f'<path d="M-9 -29 L9 -29 L7 -25 L-7 -25 Z" fill="{lip}"/><ellipse cx="0" cy="-29" rx="9" ry="2.4" fill="{lip}"/><ellipse cx="0" cy="-29" rx="5" ry="1.3" fill="{hole}"/>'
            f'<path d="M{zig}" fill="none" stroke="{band}" stroke-width="1.8"/>'
            f'{"".join(f"<circle cx=\"{x}\" cy=\"{y}\" r=\"2.1\" fill=\"{hole}\"/>" for x, y in holes)}'
            f'{drops}<path d="M-15 -2 C-16 10 -10 20 -2 24" fill="none" stroke="#FFFFFF" stroke-width="1.8" opacity="0.28"/></g>')
