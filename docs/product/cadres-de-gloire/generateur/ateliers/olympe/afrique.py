"""L'Afrique fondue dans l'Olympe : bandes de kente, cauris, baobab, palmiers, pyramides de Méroé, Adinkra.

Les Grecs connaissaient l'Afrique : Homère fait descendre les dieux festoyer chez les « Éthiopiens irréprochables »
au bord de l'Océan, Cassiopée et Andromède sont reine et princesse d'Éthiopie dans le mythe, et le phare
d'Alexandrie s'élevait sur la rive africaine. Ces motifs sont redessinés, jamais copiés.
"""

import math
import random

from common import f, pt
from base import adinkrahene, nsoromma, dwennimmen, sankofa, akoma, nkyinkyim

KENTE = ("#E8B53C", "#1E6B3C", "#A51F1F", "#14100C")


def kente(x, y, w, h, seed=0, palette=KENTE, vertical=False, cell=None):
    """Une bande de kente ashanti : blocs tissés alternés (rayures de chaîne et damiers de trame), filet d'or."""
    rnd = random.Random(seed)
    gold, green, red, black = palette
    out = [f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="{black}"/>']
    L, T = (h, w) if vertical else (w, h)
    cell = cell or T * 1.2
    n = max(1, int(L / cell))
    u = L / n

    def R(a, b, la, lb, col, op=1):
        if vertical:
            return f'<rect x="{f(x + b)}" y="{f(y + a)}" width="{f(lb)}" height="{f(la)}" fill="{col}" opacity="{op}"/>'
        return f'<rect x="{f(x + a)}" y="{f(y + b)}" width="{f(la)}" height="{f(lb)}" fill="{col}" opacity="{op}"/>'

    for i in range(n):
        a = i * u
        kind = i % 4
        if kind == 0:
            out.append(R(a, 0, u, T, gold))
            for k in range(4):
                out.append(R(a, T * (0.12 + 0.22 * k), u, T * 0.08, green if k % 2 else red))
        elif kind == 1:
            out.append(R(a, 0, u, T, green))
            q = T / 4
            for r in range(4):
                for c in range(3):
                    if (r + c) % 2 == 0:
                        out.append(R(a + c * u / 3, r * q, u / 3, q, gold))
        elif kind == 2:
            out.append(R(a, 0, u, T, red))
            for k in range(5):
                out.append(R(a + u * (0.1 + 0.18 * k), 0, u * 0.06, T, gold))
            out.append(R(a, T * 0.42, u, T * 0.16, black))
        else:
            out.append(R(a, 0, u, T, gold))
            out.append(R(a + u * 0.2, T * 0.2, u * 0.6, T * 0.6, black))
            out.append(R(a + u * 0.35, T * 0.35, u * 0.3, T * 0.3, green))
        out.append(R(a, 0, u * 0.03, T, black, 0.6))
    if vertical:
        out.append(f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="none" stroke="{gold}" stroke-width="1"/>')
    else:
        out.append(f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="none" stroke="{gold}" stroke-width="1"/>')
    return "".join(out)


def cowrie(card, x, y, s=1.0, r=0.0, tone=("#FFF8EC", "#E9DCC2", "#A8957A")):
    """Un cauri : coquille ovoïde nacrée, fente dentelée."""
    li, mi, lo = tone
    g = card.rgrad("cowrie-g", [(0, li, 1), (0.6, mi, 1), (1, lo, 1)], 0.4, 0.35, 0.7)
    teeth = "".join(
        f'<path d="M{f(-2.2 * s)} {f(k * 2.6 * s)} L{f(2.2 * s)} {f(k * 2.6 * s)}" stroke="{lo}" stroke-width="{f(0.7 * s)}"/>' for k in range(-3, 4)
    )
    return (f'<g transform="translate({f(x)} {f(y)}) rotate({f(r)})">'
            f'<ellipse cx="0" cy="0" rx="{f(6.4 * s)}" ry="{f(9.6 * s)}" fill="{g}" stroke="{lo}" stroke-width="{f(0.6 * s)}"/>'
            f'<path d="M0 {f(-8 * s)} C{f(1.6 * s)} {f(-3 * s)} {f(-1.6 * s)} {f(3 * s)} 0 {f(8 * s)}" fill="none" stroke="#5A4A36" stroke-width="{f(1.4 * s)}" stroke-linecap="round"/>'
            f'{teeth}<ellipse cx="{f(-2.4 * s)}" cy="{f(-3.6 * s)}" rx="{f(1.6 * s)}" ry="{f(3 * s)}" fill="#FFFFFF" opacity="0.7"/></g>')


def baobab(x, by, h, color, seed=2, lean=0):
    """Un baobab : tronc-bouteille massif, couronne de branches nues en racines tendues vers le ciel."""
    rnd = random.Random(seed)
    tw = h * 0.2
    trunk = (f"M{f(x - tw * 0.9)} {f(by)} C{f(x - tw * 1.05)} {f(by - h * 0.25)} {f(x - tw * 0.8)} {f(by - h * 0.5)} {f(x - tw * 0.45)} {f(by - h * 0.62)} "
             f"L{f(x + tw * 0.45)} {f(by - h * 0.62)} C{f(x + tw * 0.8)} {f(by - h * 0.5)} {f(x + tw * 1.05)} {f(by - h * 0.25)} {f(x + tw * 0.9)} {f(by)}Z")
    out = [f'<path d="{trunk}" fill="{color}"/>']

    def br(x0, y0, ang, L, wd, d):
        x1, y1 = pt(x0, y0, L, ang)
        out.append(f'<path d="M{f(x0)} {f(y0)} L{f(x1)} {f(y1)}" stroke="{color}" stroke-width="{f(wd)}" stroke-linecap="round"/>')
        if d:
            for da in (-28, 26):
                br(x1, y1, ang + da + rnd.uniform(-10, 10), L * 0.6, wd * 0.58, d - 1)

    for ang in (-64, -34, -6, 22, 50, 74):
        br(x + ang * tw * 0.006, by - h * 0.6, ang + lean, h * 0.22, tw * 0.32, 2)
    return "".join(out)


def palm(x, by, h, color, seed=1, lean=6):
    """Un palmier dattier : stipe courbe annelé, palmes retombantes."""
    rnd = random.Random(seed)
    tx, ty = pt(x, by, h, lean)
    mx, my = pt(x, by, h * 0.5, lean * 0.3)
    out = [f'<path d="M{f(x - 3)} {f(by)} Q{f(mx)} {f(my)} {f(tx)} {f(ty)} Q{f(mx + 4)} {f(my)} {f(x + 4)} {f(by)}Z" fill="{color}"/>']
    out.append(f'<path d="M{f(x)} {f(by)} Q{f(mx)} {f(my)} {f(tx)} {f(ty)}" stroke="{color}" stroke-width="5" fill="none"/>')
    for k in range(9):
        a = -110 + k * 27 + rnd.uniform(-6, 6)
        L = h * rnd.uniform(0.32, 0.45)
        ex, ey = pt(tx, ty, L, a)
        cx_, cy_ = pt(tx, ty, L * 0.6, a - 14 * (1 if a > 0 else -1))
        cy_ -= L * 0.2
        out.append(f'<path d="M{f(tx)} {f(ty)} Q{f(cx_)} {f(cy_)} {f(ex)} {f(ey + L * 0.25)}" stroke="{color}" stroke-width="{f(h * 0.035)}" fill="none" stroke-linecap="round"/>')
        for j in range(1, 7):
            t = j / 7
            px = (1 - t) ** 2 * tx + 2 * (1 - t) * t * cx_ + t * t * ex
            py = (1 - t) ** 2 * ty + 2 * (1 - t) * t * cy_ + t * t * (ey + L * 0.25)
            for sd in (-1, 1):
                qx, qy = pt(px, py, L * 0.16 * (1 - t * 0.5), a + sd * 60 + 90)
                out.append(f'<path d="M{f(px)} {f(py)} L{f(qx)} {f(qy)}" stroke="{color}" stroke-width="1.4" stroke-linecap="round"/>')
    return "".join(out)


def meroe_pyramid(x, by, h, color, lit=None):
    """Une pyramide nubienne de Méroé : flancs raides, chapelle à pylône au pied."""
    w = h * 0.36
    out = [f'<path d="M{f(x - w)} {f(by)} L{f(x)} {f(by - h)} L{f(x + w)} {f(by)}Z" fill="{color}"/>']
    if lit:
        out.append(f'<path d="M{f(x)} {f(by - h)} L{f(x + w)} {f(by)} L{f(x + w * 0.2)} {f(by)}Z" fill="{lit}" opacity="0.35"/>')
    out.append(f'<path d="M{f(x - w * 0.6)} {f(by)} L{f(x - w * 0.5)} {f(by - h * 0.22)} L{f(x - w * 0.2)} {f(by - h * 0.22)} L{f(x - w * 0.1)} {f(by)}Z" fill="{color}"/>')
    return "".join(out)


ADINKRA = {"adinkrahene": adinkrahene, "nsoromma": nsoromma, "dwennimmen": dwennimmen, "sankofa": sankofa, "akoma": akoma}


def adinkra(name, cx, cy, s, color):
    fn = ADINKRA[name]
    if name == "adinkrahene":
        return fn(cx, cy, s, color, 4)
    return fn(cx, cy, s, color)


# ---------------------------------------------------------------- pièces raffinées (retouche 2026-10-10)

def dwennimmen_horns(cx, cy, s, color, w=3.6):
    """Dwennimmen — les cornes du bélier (force et humilité) : quatre cornes qui s'enroulent vers l'extérieur,
    deux vers le haut, deux vers le bas, nouées au centre par une barre."""
    out = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            d = (f"M{f(cx + sx * 3 * s)} {f(cy + sy * 2 * s)} "
                 f"C{f(cx + sx * 6 * s)} {f(cy + sy * 20 * s)} {f(cx + sx * 26 * s)} {f(cy + sy * 24 * s)} {f(cx + sx * 27 * s)} {f(cy + sy * 10 * s)} "
                 f"C{f(cx + sx * 28 * s)} {f(cy + sy * 1 * s)} {f(cx + sx * 17 * s)} {f(cy + sy * 0 * s)} {f(cx + sx * 16 * s)} {f(cy + sy * 8 * s)} "
                 f"C{f(cx + sx * 15.5 * s)} {f(cy + sy * 13 * s)} {f(cx + sx * 21 * s)} {f(cy + sy * 13 * s)} {f(cx + sx * 21 * s)} {f(cy + sy * 9 * s)}")
            out.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(w * s)}" stroke-linecap="round"/>')
    out.append(f'<rect x="{f(cx - 4 * s)}" y="{f(cy - 7 * s)}" width="{f(8 * s)}" height="{f(14 * s)}" rx="{f(2 * s)}" fill="{color}"/>')
    return "".join(out)


def gye_nyame_free(cx, cy, s, color):
    """Une étoile d'Akan à huit rais (redessinée) : alternative fine au Nsoromma pour les petits formats."""
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(4 * s)}" fill="{color}"/>']
    for i in range(8):
        x1, y1 = pt(cx, cy, 6 * s, i * 45)
        x2, y2 = pt(cx, cy, (12 if i % 2 == 0 else 9) * s, i * 45)
        out.append(f'<path d="M{f(x1)} {f(y1)} L{f(x2)} {f(y2)}" stroke="{color}" stroke-width="{f(1.8 * s)}" stroke-linecap="round"/>')
    return "".join(out)


def meroe(card, x, by, h, dark="#2A1428", lit="#FF9A4A", rim="#FFD9A0", light_from=1, chapel=True, courses=True):
    """Une pyramide de Méroé (royaume de Koush) : flancs très raides (~70°), sommet à petite plate-forme,
    assises de pierre, chapelle à pylône adossée ; éclairée par un couchant situé du côté `light_from` (+1 = droite)."""
    w = h * 0.36
    top = by - h
    plat = w * 0.06
    out = []
    body = f"M{f(x - w)} {f(by)} L{f(x - plat)} {f(top)} L{f(x + plat)} {f(top)} L{f(x + w)} {f(by)}Z"
    out.append(f'<path d="{body}" fill="{dark}"/>')
    lx = x + light_from * w
    face = f"M{f(x + light_from * plat)} {f(top)} L{f(lx)} {f(by)} L{f(x + light_from * w * 0.12)} {f(by)} L{f(x)} {f(top + 2)}Z"
    gid = card.grad(f"meroe-face-{light_from}", [(0, lit), (1, dark)], 0, 0, 0, 1)
    out.append(f'<path d="{face}" fill="{gid}" opacity="0.55"/>')
    if courses:
        n = max(4, int(h / 7))
        for k in range(1, n):
            yy = top + h * k / n
            half = plat + (w - plat) * k / n
            out.append(f'<path d="M{f(x - half)} {f(yy)} L{f(x + half)} {f(yy)}" stroke="{rim}" stroke-width="0.45" opacity="0.22"/>')
    out.append(f'<path d="M{f(x + light_from * plat)} {f(top)} L{f(lx)} {f(by)}" stroke="{rim}" stroke-width="1.1" opacity="0.85"/>')
    if chapel:
        cw, ch = w * 0.62, h * 0.24
        cxp = x - light_from * w * 0.05
        py = by
        out.append(f'<path d="M{f(cxp - cw / 2)} {f(py)} L{f(cxp - cw / 2 + cw * 0.08)} {f(py - ch)} L{f(cxp + cw / 2 - cw * 0.08)} {f(py - ch)} L{f(cxp + cw / 2)} {f(py)}Z" fill="{dark}"/>')
        out.append(f'<rect x="{f(cxp - cw * 0.1)}" y="{f(py - ch * 0.62)}" width="{f(cw * 0.2)}" height="{f(ch * 0.62)}" fill="{lit}" opacity="0.5"/>')
        out.append(f'<path d="M{f(cxp - cw / 2 + cw * 0.08)} {f(py - ch)} L{f(cxp + cw / 2 - cw * 0.08)} {f(py - ch)}" stroke="{rim}" stroke-width="0.9" opacity="0.7"/>')
    return "".join(out)


def dunes(x0, x1, by, h, color, seed=3, n=3):
    """Une ligne de dunes douces (silhouette)."""
    rnd = random.Random(seed)
    pts = [(x0, by)]
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        pts.append((x, by - h * rnd.uniform(0.35, 1.0)))
    pts.append((x1, by))
    d = f"M{f(x0)} {f(by)} L{f(x0)} {f(pts[1][1])}"
    for i in range(1, len(pts) - 2):
        xa, ya = pts[i]
        xb, yb = pts[i + 1]
        mx = (xa + xb) / 2
        d += f" Q{f(mx)} {f(min(ya, yb) - h * 0.25)} {f(xb)} {f(yb)}"
    d += f" L{f(x1)} {f(by)}Z"
    return f'<path d="{d}" fill="{color}"/>'


def kente_sash(card, cx, y, w, h, seed=0, bulge=4):
    """Une bande de kente ceinte autour d'un fût : bande tissée courbée par la colonne, ombrée sur les flancs."""
    inner = kente(cx - w / 2, y, w, h, seed=seed, cell=h * 1.3)
    clip = card.def_once(f"sash-{f(cx)}-{f(y)}", f'<clipPath id="{card.id(f"sash-{f(cx)}-{f(y)}")}"><path d="M{f(cx - w / 2)} {f(y)} Q{f(cx)} {f(y + bulge)} {f(cx + w / 2)} {f(y)} L{f(cx + w / 2)} {f(y + h)} Q{f(cx)} {f(y + h + bulge)} {f(cx - w / 2)} {f(y + h)}Z"/></clipPath>')
    shade = card.grad("sash-shade", [(0, "#000000"), (0.25, "#000000"), (0.4, "#FFFFFF"), (0.7, "#000000"), (1, "#000000")], 0, 0, 1, 0)
    sh_op = card.grad("sash-op", [(0, "#000000"), (1, "#000000")])
    return (f'<g clip-path="{clip}"><g transform="translate(0 {f(bulge * 0.5)})">{inner}</g>'
            f'<rect x="{f(cx - w / 2)}" y="{f(y - 2)}" width="{f(w)}" height="{f(h + bulge + 4)}" fill="{card.grad("sash-cyl", [(0, "#000000"), (0.3, "#000000"), (0.42, "#FFFFFF"), (0.75, "#000000"), (1, "#000000")], 0, 0, 1, 0)}" opacity="0.28"/></g>'
            f'<path d="M{f(cx - w / 2)} {f(y)} Q{f(cx)} {f(y + bulge)} {f(cx + w / 2)} {f(y)}" fill="none" stroke="#E8B53C" stroke-width="1"/>'
            f'<path d="M{f(cx - w / 2)} {f(y + h)} Q{f(cx)} {f(y + h + bulge)} {f(cx + w / 2)} {f(y + h)}" fill="none" stroke="#E8B53C" stroke-width="1"/>')


def baobab_rich(card, x, by, h, dark="#120A12", rim="#FFB060", seed=2, lean=0, light_from=1, rim_op=0.8):
    """Un baobab en contre-jour : tronc-bouteille aux contreforts, écorce plissée, couronne de branches tortueuses
    (des racines tendues vers le ciel) ; un liseré de lumière du côté `light_from`."""
    rnd = random.Random(seed)
    tw = h * 0.21
    ty = by - h * 0.58
    trunk = (f"M{f(x - tw * 1.15)} {f(by)} C{f(x - tw * 0.9)} {f(by - h * 0.06)} {f(x - tw * 1.18)} {f(by - h * 0.3)} {f(x - tw * 0.92)} {f(by - h * 0.44)} "
             f"C{f(x - tw * 0.72)} {f(by - h * 0.53)} {f(x - tw * 0.5)} {f(ty)} {f(x - tw * 0.42)} {f(ty - h * 0.02)} "
             f"L{f(x + tw * 0.42)} {f(ty - h * 0.02)} C{f(x + tw * 0.5)} {f(ty)} {f(x + tw * 0.74)} {f(by - h * 0.53)} {f(x + tw * 0.94)} {f(by - h * 0.44)} "
             f"C{f(x + tw * 1.2)} {f(by - h * 0.3)} {f(x + tw * 0.92)} {f(by - h * 0.06)} {f(x + tw * 1.18)} {f(by)}Z")
    out = []
    branches = []

    def br(x0, y0, ang, L, wd, d):
        bend = rnd.uniform(-14, 14)
        mx, my = pt(x0, y0, L * 0.55, ang + bend)
        x1, y1 = pt(x0, y0, L, ang - bend * 0.5)
        branches.append((x0, y0, mx, my, x1, y1, wd))
        if d:
            k = 2 if d > 1 else 3
            for j in range(k):
                da = (-30 + 60 * j / max(1, k - 1)) + rnd.uniform(-9, 9)
                br(x1, y1, ang + da, L * rnd.uniform(0.5, 0.66), wd * 0.55, d - 1)

    for ang in (-70, -44, -18, 6, 30, 56, 78):
        sx = x + (ang / 80) * tw * 0.4
        br(sx, ty + 4, ang + lean, h * rnd.uniform(0.2, 0.27), tw * 0.36, 3)
    for (x0, y0, mx, my, x1, y1, wd) in branches:
        out.append(f'<path d="M{f(x0)} {f(y0)} Q{f(mx)} {f(my)} {f(x1)} {f(y1)}" stroke="{dark}" stroke-width="{f(wd)}" fill="none" stroke-linecap="round"/>')
    out.append(f'<path d="{trunk}" fill="{dark}"/>')
    for (x0, y0, mx, my, x1, y1, wd) in branches:
        if (x1 - x0) * light_from > 0 and wd > 1.2:
            out.append(f'<path d="M{f(x0 + light_from * wd * 0.35)} {f(y0)} Q{f(mx + light_from * wd * 0.35)} {f(my)} {f(x1)} {f(y1)}" stroke="{rim}" stroke-width="{f(max(0.5, wd * 0.16))}" fill="none" opacity="{rim_op * 0.7}" stroke-linecap="round"/>')
    edge = (f"M{f(x + light_from * tw * 1.18)} {f(by)} C{f(x + light_from * tw * 0.92)} {f(by - h * 0.06)} {f(x + light_from * tw * 1.2)} {f(by - h * 0.3)} "
            f"{f(x + light_from * tw * 0.94)} {f(by - h * 0.44)} C{f(x + light_from * tw * 0.74)} {f(by - h * 0.53)} {f(x + light_from * tw * 0.5)} {f(ty)} {f(x + light_from * tw * 0.42)} {f(ty - h * 0.02)}")
    out.append(f'<path d="{edge}" fill="none" stroke="{rim}" stroke-width="1.6" opacity="{rim_op}"/>')
    for k in range(5):
        fx = x + (k - 2) * tw * 0.34
        out.append(f'<path d="M{f(fx)} {f(by - 4)} Q{f(fx + rnd.uniform(-4, 4))} {f(by - h * 0.3)} {f(fx * 0.7 + x * 0.3)} {f(ty + 6)}" stroke="#000000" stroke-width="0.9" fill="none" opacity="0.35"/>')
    return "".join(out)


def felucca(x, y, s, dark, sail="#F3E2C2", sail_op=0.9):
    """Une felouque du Nil : coque effilée, grande voile latine triangulaire."""
    return (f'<path d="M{f(x - 30 * s)} {f(y)} Q{f(x)} {f(y + 9 * s)} {f(x + 32 * s)} {f(y - 3 * s)} L{f(x + 26 * s)} {f(y + 2 * s)} Q{f(x)} {f(y + 6 * s)} {f(x - 26 * s)} {f(y + 1 * s)}Z" fill="{dark}"/>'
            f'<path d="M{f(x - 2 * s)} {f(y + 1 * s)} L{f(x)} {f(y - 40 * s)}" stroke="{dark}" stroke-width="{f(1.4 * s)}"/>'
            f'<path d="M{f(x - 26 * s)} {f(y - 4 * s)} L{f(x + 8 * s)} {f(y - 58 * s)} Q{f(x + 12 * s)} {f(y - 24 * s)} {f(x + 4 * s)} {f(y - 3 * s)}Z" fill="{sail}" opacity="{sail_op}"/>'
            f'<path d="M{f(x - 26 * s)} {f(y - 4 * s)} L{f(x + 8 * s)} {f(y - 58 * s)}" stroke="{dark}" stroke-width="{f(1.2 * s)}"/>')


def adinkra_cloth(card, x0, y0, x1, y1, cell, color, op=0.35, seed=1):
    """Un champ d'étoffe adinkra : symboles estampés en grille, séparés de filets (comme les toiles d'Asante)."""
    names = ["nsoromma", "akoma", "adinkrahene", "dwennimmen"]
    out = []
    cols = int((x1 - x0) / cell)
    rows = int((y1 - y0) / cell)
    for r in range(rows):
        for c_ in range(cols):
            cx = x0 + (c_ + 0.5) * cell
            cy = y0 + (r + 0.5) * cell
            nm = names[(r + c_ + seed) % len(names)]
            s = cell / 70
            if nm == "dwennimmen":
                out.append(dwennimmen_horns(cx, cy, s * 0.9, color, 3.0))
            elif nm == "adinkrahene":
                out.append(adinkrahene(cx, cy, s * 0.95, color, 3))
            else:
                out.append(adinkra(nm, cx, cy, s, color))
    for c_ in range(cols + 1):
        out.append(f'<path d="M{f(x0 + c_ * cell)} {f(y0)} L{f(x0 + c_ * cell)} {f(y1)}" stroke="{color}" stroke-width="0.6"/>')
    for r in range(rows + 1):
        out.append(f'<path d="M{f(x0)} {f(y0 + r * cell)} L{f(x1)} {f(y0 + r * cell)}" stroke="{color}" stroke-width="0.6"/>')
    return f'<g opacity="{op}">{"".join(out)}</g>'
