"""Aurores du Nord - figures : le loup qui hurle, Fenrir, l'aigle, le cor de Heimdall, la halle d'Asgard,
le frêne-monde, Jörmungandr ; et les éclats d'Afrique fondus dans le Nord (kente, cauris, baobab).

Créations originales. Repère local : pieds / base à y = 0, face à droite, sauf mention.
"""

import math
import random

from base import W, H, f, pt, esc, sparkle, adinkrahene, nsoromma, dwennimmen, sankofa, akoma
from kit import (shape, ribbon, smooth, resample, normals, place, ublur, bevel, noise_filter, texture_filter,
                 metal_grad, OR, ARGENT)
from motifs import grow, limb_with_twigs, leaves, rune_line, rune, RUNE_KEYS, RUNE_W, beast_head


# ================================================================ loups

WOLF_SIT = (
    "M64 0 L46 0 C45 -14 45 -30 46 -44 C40 -48 34 -50 29 -49 C24 -40 22 -24 27 -10 C30 -5 35 -2 38 0 "
    "L8 0 C-8 0 -26 -1 -40 3 C-46 5 -48 1 -43 -3 C-32 -9 -18 -10 -7 -12 C-13 -30 -9 -56 3 -74 "
    "C11 -86 21 -97 29 -108 C31 -116 31 -123 29 -130 L24 -149 L37 -136 C43 -139 49 -145 55 -152 L71 -169 "
    "C71 -163 68 -158 63 -153 L66 -147 L58 -144 C54 -136 52 -130 52 -124 C56 -110 60 -96 60 -80 "
    "C60 -64 58 -50 56 -38 C56 -26 59 -12 64 0 Z"
)

WOLF_RUN = (
    "M0 -40 C12 -50 34 -54 58 -52 C70 -51 80 -56 88 -62 L92 -74 L98 -62 C104 -61 110 -58 114 -55 L126 -52 "
    "C128 -49 124 -46 118 -46 L112 -45 C106 -42 100 -36 96 -30 C102 -22 112 -16 124 -14 L126 -10 C112 -10 98 -16 88 -24 "
    "C76 -26 62 -26 50 -28 C42 -20 30 -12 16 -6 L12 -2 L8 -6 C18 -14 26 -22 30 -30 C20 -32 10 -34 2 -36 "
    "C-10 -34 -24 -30 -36 -24 C-40 -22 -42 -26 -38 -29 C-26 -36 -12 -40 0 -40 Z"
)

# Fenrir, la tête du loup géant, gueule ouverte (repère : centre du crâne à l'origine, museau vers la droite)
FENRIR_PTS = [
    (-70, 70), (-82, 20), (-74, -30), (-56, -66), (-48, -120), (-14, -82), (18, -88), (52, -78), (92, -60),
    (132, -44), (164, -34), (172, -24), (166, -16), (150, -14), (132, -12), (110, -6), (84, 4), (60, 14),
    (82, 28), (112, 44), (138, 60), (146, 70), (132, 78), (100, 74), (64, 66), (30, 72), (-6, 92), (-40, 104),
]
FENRIR_EYE = (40, -44)
FENRIR_EDGES = [(i, i + 1) for i in range(len(FENRIR_PTS) - 1)] + [(len(FENRIR_PTS) - 1, 0)]
FENRIR_FANGS = [((150, -14), (146, 2)), ((126, -12), (122, 6)), ((132, 60), (130, 44)), ((108, 48), (108, 34))]


def fenrir_path(s=1.0, ox=0, oy=0, flip=False):
    sx = -1 if flip else 1
    pts = [(ox + x * s * sx, oy + y * s) for x, y in FENRIR_PTS]
    return pts


# ================================================================ corbeaux, aigle

RAVEN_SOAR = shape([
    (70, -2, 1), (58, -8), (46, -10), (34, -8, 1), (26, -18), (12, -40), (-6, -58), (-24, -72), (-40, -80, 1),
    (-36, -70, 1), (-46, -72, 1), (-40, -62, 1), (-52, -62, 1), (-42, -52, 1), (-54, -48, 1), (-38, -40), (-20, -24), (-8, -12, 1),
    (-30, -10), (-50, -14, 1), (-44, -6, 1), (-58, -2, 1), (-44, 2, 1), (-52, 8, 1), (-28, 4, 1),
    (-8, 8), (12, 10), (30, 8), (44, 5), (56, 3, 1),
])


# ================================================================ le cor de Heimdall

def gjallarhorn(card, name, pts, w_bell, w_tip, metal=OR, horn=("#FFF6DC", "#E9C98E", "#8A5A22"), bands=(0.08, 0.3, 0.55, 0.78), n=70):
    """Le Gjallarhorn : une corne immense au pavillon évasé, bagues d'or ciselées d'entrelacs."""
    hi, mid, lo = metal

    def wfn(t):
        return w_tip + (w_bell - w_tip) * (1 - t) ** 2.2 + w_bell * 0.35 * max(0, 0.08 - t) / 0.08

    d = ribbon(pts, w_bell, n=n, wfn=wfn)
    (ax, ay), (bx, by) = pts[0], pts[-1]
    hg = card.def_once(name + "-hg", f'<linearGradient id="{card.id(name + "-hg")}" gradientUnits="userSpaceOnUse" x1="{f(ax)}" y1="{f(ay)}" x2="{f(bx)}" y2="{f(by)}">'
                       f'<stop offset="0" stop-color="{horn[0]}"/><stop offset="0.5" stop-color="{horn[1]}"/><stop offset="1" stop-color="{horn[2]}"/></linearGradient>')
    sp = resample(pts, n)
    nm = normals(sp)
    out = [f'<path d="{d}" fill="{hg}"/>']
    hl = [(x + nx * wfn(i / (n - 1)) * 0.25, y + ny * wfn(i / (n - 1)) * 0.25) for i, ((x, y), (nx, ny)) in enumerate(zip(sp, nm))]
    out.append(f'<path d="{smooth(hl[3:-3])}" fill="none" stroke="#FFFFFF" stroke-width="2.4" opacity="0.6" stroke-linecap="round"/>')
    sh = [(x - nx * wfn(i / (n - 1)) * 0.3, y - ny * wfn(i / (n - 1)) * 0.3) for i, ((x, y), (nx, ny)) in enumerate(zip(sp, nm))]
    out.append(f'<path d="{smooth(sh[3:-3])}" fill="none" stroke="{horn[2]}" stroke-width="3" opacity="0.35" stroke-linecap="round"/>')
    mg = metal_grad(card, name + "-mg", metal)
    for t in bands:
        i = int(t * (n - 1))
        j = min(n - 1, i + 3)
        wi, wj = wfn(i / (n - 1)) + 5, wfn(j / (n - 1)) + 5
        (x0, y0), (n0x, n0y) = sp[i], nm[i]
        (x1, y1), (n1x, n1y) = sp[j], nm[j]
        poly = [(x0 + n0x * wi / 2, y0 + n0y * wi / 2), (x1 + n1x * wj / 2, y1 + n1y * wj / 2), (x1 - n1x * wj / 2, y1 - n1y * wj / 2), (x0 - n0x * wi / 2, y0 - n0y * wi / 2)]
        out.append(f'<path d="M{" L".join(f"{f(px)} {f(py)}" for px, py in poly)} Z" fill="{mg}" stroke="{lo}" stroke-width="0.7"/>')
        k = (i + j) // 2
        (xm, ym), (nmx, nmy) = sp[k], nm[k]
        wm = wfn(k / (n - 1)) * 0.5
        out.append(f'<line x1="{f(xm + nmx * wm)}" y1="{f(ym + nmy * wm)}" x2="{f(xm - nmx * wm)}" y2="{f(ym - nmy * wm)}" stroke="{lo}" stroke-width="0.8" stroke-dasharray="2 2"/>')
    # le pavillon : une ellipse d'or vue de biais
    (x0, y0), (nx, ny) = sp[0], nm[0]
    wb = wfn(0)
    ang = math.degrees(math.atan2(ny, nx))
    out.append(f'<ellipse cx="{f(x0)}" cy="{f(y0)}" rx="{f(wb / 2 + 3)}" ry="{f(wb * 0.16 + 3)}" transform="rotate({f(ang)} {f(x0)} {f(y0)})" fill="{mg}" stroke="{lo}" stroke-width="1"/>')
    out.append(f'<ellipse cx="{f(x0)}" cy="{f(y0)}" rx="{f(wb / 2 - 3)}" ry="{f(wb * 0.16 - 1)}" transform="rotate({f(ang)} {f(x0)} {f(y0)})" fill="#2A1606"/>')
    x, y = sp[-1]
    out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(w_tip + 3)}" fill="{mg}" stroke="{lo}" stroke-width="0.7"/>')
    tip_head = f'<g transform="translate({f(x)} {f(y)}) rotate({f(math.degrees(math.atan2(sp[-1][1] - sp[-3][1], sp[-1][0] - sp[-3][0])))}) scale(0.42)">{beast_head(hi, lo)}</g>'
    out.append(tip_head)
    return f'<g filter="{bevel(card, name + "-bv", 0.9, 2.2, sd=4, dy=3, sop=0.55)}">{"".join(out)}</g>', sp[0], ang


# ================================================================ Asgard, halles

def hall(x, y, w, h, color, roof=None, gold=None, finials=True):
    """Une grande halle à toit courbe (repère : centre-bas). Toit en carène renversée, pignons à têtes de dragon."""
    roof = roof or color
    x0, x1 = x - w / 2, x + w / 2
    wall = h * 0.42
    out = [f'<path d="M{f(x0 + w * 0.06)} {f(y)} L{f(x0 + w * 0.06)} {f(y - wall)} L{f(x1 - w * 0.06)} {f(y - wall)} L{f(x1 - w * 0.06)} {f(y)} Z" fill="{color}"/>',
           f'<path d="M{f(x0)} {f(y - wall + 2)} Q{f(x)} {f(y - h * 1.08)} {f(x1)} {f(y - wall + 2)} Q{f(x)} {f(y - wall - h * 0.18)} {f(x0)} {f(y - wall + 2)} Z" fill="{roof}"/>']
    if finials:
        for sx in (-1, 1):
            ex = x + sx * w * 0.5
            out.append(f'<path d="M{f(ex)} {f(y - wall + 2)} q{f(sx * 6)} {f(-h * 0.22)} {f(sx * 2)} {f(-h * 0.36)} q{f(sx * -4)} {f(-4)} {f(sx * -7)} {f(2)}" fill="none" stroke="{roof}" stroke-width="{f(max(1.2, w * 0.02))}" stroke-linecap="round"/>')
    if gold:
        out.append(f'<path d="M{f(x0)} {f(y - wall + 2)} Q{f(x)} {f(y - h * 1.08)} {f(x1)} {f(y - wall + 2)}" fill="none" stroke="{gold}" stroke-width="{f(max(0.8, w * 0.012))}"/>')
        for k in range(3):
            wx = x + (k - 1) * w * 0.22
            out.append(f'<rect x="{f(wx - w * 0.03)}" y="{f(y - wall * 0.7)}" width="{f(w * 0.06)}" height="{f(wall * 0.45)}" rx="{f(w * 0.02)}" fill="{gold}" opacity="0.9"/>')
    return "".join(out)


def asgard(card, name, x, y, s=1.0, color="#0B1426", gold="#FFD36E", glow=True):
    """Asgard : une citadelle de halles sur un piton, ses fenêtres d'or (repère : centre-bas)."""
    out = []
    if glow:
        out.append(f'<ellipse cx="{f(x)}" cy="{f(y - 40 * s)}" rx="{f(110 * s)}" ry="{f(70 * s)}" fill="{card.rgrad(name + "-gl", [(0, gold, 0.5), (1, gold, 0)])}"/>')
    rock = f"M{f(x - 90 * s)} {f(y)} C{f(x - 70 * s)} {f(y - 20 * s)} {f(x - 50 * s)} {f(y - 34 * s)} {f(x - 40 * s)} {f(y - 40 * s)} L{f(x + 44 * s)} {f(y - 42 * s)} C{f(x + 56 * s)} {f(y - 30 * s)} {f(x + 74 * s)} {f(y - 16 * s)} {f(x + 92 * s)} {f(y)} Z"
    out.append(f'<path d="{rock}" fill="{color}"/>')
    out.append(hall(x, y - 40 * s, 70 * s, 40 * s, color, gold=gold))
    out.append(hall(x - 46 * s, y - 34 * s, 34 * s, 24 * s, color, gold=gold))
    out.append(hall(x + 44 * s, y - 36 * s, 38 * s, 26 * s, color, gold=gold))
    out.append(f'<rect x="{f(x - 1.2 * s)}" y="{f(y - 112 * s)}" width="{f(2.4 * s)}" height="{f(36 * s)}" fill="{color}"/>')
    out.append(sparkle(x, y - 114 * s, 8 * s, gold, 0.95))
    return "".join(out)


# ================================================================ le frêne-monde

def world_tree(card, name, seed=7, base=(270, 930), spread=1.0, height=840, w0=46, crown_y=120, side_x=(58, 482),
               waist=(300, 600), twig_len=48, depth=3, roots=True, crown=True):
    """Yggdrasil : un tronc qui se fend en deux maîtresses branches autour de la photo, se rejoint en couronne
    au-dessus du blason, et plonge ses racines sous l'inscription. Rend (segments, pointes)."""
    rnd = random.Random(seed)
    bx, by = base
    out, tips = [], []
    for side in (-1, 1):
        sx = side_x[0] if side < 0 else side_x[1]
        pts = [(bx + side * 8, by), (bx + side * 60 * spread, by - 90), (sx + side * 6, waist[1]), (sx - side * 4, waist[0]),
               (sx + side * 22, crown_y + 70), (bx + side * 120, crown_y - 10)]
        limb_with_twigs(rnd, pts, w0 * 0.55, 6, side, twig_every=0.09, twig_len=twig_len, twig_depth=depth, spread=34, out=out, tips=tips, min_w=0.8, start=0.28)
    if crown:
        for side in (-1, 1):
            for k in range(3):
                ang = side * (18 + k * 26)
                grow(rnd, bx + side * 40, crown_y + 40 - k * 6, ang, 56 - k * 8, 7 - k, 3, spread=36, out=out, tips=tips, min_w=0.7)
    if roots:
        for side in (-1, 1):
            for k in range(3):
                rp = [(bx + side * 10, by - 20), (bx + side * (70 + k * 40), by + 6 + k * 4), (bx + side * (150 + k * 50), by - 10 + k * 18), (bx + side * (230 + k * 30), by + 30 + k * 10)]
                out.append(ribbon(rp, 18 - k * 4, 2, n=30))
    out.append(ribbon([(bx - 34, by + 40), (bx - 26, by - 40), (bx, by - 60), (bx + 26, by - 40), (bx + 34, by + 40)], 30, 30, n=20))
    return out, tips


# ================================================================ Jörmungandr

def serpent_ring(card, name, pts, w, fill=("#3FE0B0", "#0E6E5A", "#03261F"), scale_c="#B9FFE8", edge="#021712", head_at_end=True, n=220):
    """Le serpent-monde : un ruban qui fait le tour d'un contour fermé, de la queue (effilée) à la tête."""
    def wfn(t):
        return w * (0.12 + 0.88 * min(1, t / 0.35)) if t < 0.96 else w * (1 + (t - 0.96) * 6)

    d = ribbon(pts, w, n=n, wfn=wfn)
    g = card.grad(name + "-g", [(0, fill[0]), (0.5, fill[1]), (1, fill[2])], 0, 0, 1, 1)
    sp = resample(pts, n)
    nm = normals(sp)
    scales = []
    for i in range(4, n - 4, 2):
        (x, y), (nx, ny) = sp[i], nm[i]
        ww = wfn(i / (n - 1)) * 0.32
        a = math.degrees(math.atan2(ny, nx))
        scales.append(f'<path d="M{f(x + nx * ww)} {f(y + ny * ww)} Q{f(x + (sp[i + 1][0] - x) * 2)} {f(y + (sp[i + 1][1] - y) * 2)} {f(x - nx * ww)} {f(y - ny * ww)}" fill="none" stroke="{scale_c}" stroke-width="0.7" opacity="0.5"/>')
    spine = smooth([(x + nx * wfn(i / (n - 1)) * 0.18, y + ny * wfn(i / (n - 1)) * 0.18) for i, ((x, y), (nx, ny)) in enumerate(zip(sp, nm))][2:-6:3])
    return (f'<path d="{d}" fill="{g}" stroke="{edge}" stroke-width="1.6"/>'
            f'<path d="{spine}" fill="none" stroke="#FFFFFF" stroke-width="1.6" opacity="0.4"/>'
            f'{"".join(scales)}'), sp, nm


# ================================================================ éclats d'Afrique

KENTE = ("#E8B53C", "#1E7A46", "#B3261E", "#121010", "#F2E6CF")


def kente(x, y, w, h, seed=0, palette=KENTE, cell=None, vertical=False):
    """Une bande de kente (création originale) : blocs tissés or, vert, rouge et noir, motifs de navette."""
    rnd = random.Random(seed)
    gold, green, red, black, cream = palette
    L, T = (h, w) if vertical else (w, h)
    cell = cell or T * 1.1
    out = []
    k = 0
    pos = 0.0
    while pos < L:
        cw = cell * (0.6 if k % 3 == 2 else 1.0)
        kind = k % 3
        if kind == 0:
            stripes = [(gold, 0.22), (black, 0.08), (green, 0.4), (black, 0.08), (gold, 0.22)]
        elif kind == 1:
            stripes = [(red, 0.3), (gold, 0.1), (black, 0.2), (gold, 0.1), (red, 0.3)]
        else:
            stripes = [(gold, 1.0)]
        acc = 0.0
        for col, frac in stripes:
            if vertical:
                out.append(f'<rect x="{f(x + acc * T)}" y="{f(y + pos)}" width="{f(frac * T + 0.4)}" height="{f(cw + 0.4)}" fill="{col}"/>')
            else:
                out.append(f'<rect x="{f(x + pos)}" y="{f(y + acc * T)}" width="{f(cw + 0.4)}" height="{f(frac * T + 0.4)}" fill="{col}"/>')
            acc += frac
        if kind == 2:
            for j in range(3):
                cx = pos + cw / 2
                cy = T * (0.25 + 0.25 * j)
                s = min(cw, T) * 0.12
                px, py = (x + cy, y + cx) if vertical else (x + cx, y + cy)
                out.append(f'<path d="M{f(px - s)} {f(py)} L{f(px)} {f(py - s)} L{f(px + s)} {f(py)} L{f(px)} {f(py + s)} Z" fill="{black}"/>')
        else:
            for j in range(int(cw / 3)):
                px = pos + 1.5 + j * 3
                if vertical:
                    out.append(f'<line x1="{f(x)}" y1="{f(y + px)}" x2="{f(x + T)}" y2="{f(y + px)}" stroke="#000000" stroke-width="0.4" opacity="0.18"/>')
                else:
                    out.append(f'<line x1="{f(x + px)}" y1="{f(y)}" x2="{f(x + px)}" y2="{f(y + T)}" stroke="#000000" stroke-width="0.4" opacity="0.18"/>')
        pos += cw
        k += 1
    cid = f"kc{seed}{int(x)}{int(y)}"
    return f'<g><clipPath id="{cid}"><rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}"/></clipPath><g clip-path="url(#{cid})">{"".join(out)}</g></g>'


def cowrie(x, y, s=1.0, rot=0, shell=("#FFF8EA", "#E9D8B8", "#9C8462"), slit="#3A2A18"):
    """Un cauri, côté fente (repère : centre)."""
    a, b, c = shell
    return (f'<g transform="translate({f(x)} {f(y)}) rotate({f(rot)}) scale({f(s)})">'
            f'<ellipse cx="0" cy="0" rx="7" ry="10" fill="{c}"/>'
            f'<ellipse cx="-0.6" cy="-0.6" rx="6.4" ry="9.3" fill="{b}"/>'
            f'<ellipse cx="-1.6" cy="-2" rx="3.4" ry="6" fill="{a}" opacity="0.9"/>'
            f'<path d="M0 -8 C1.6 -4 -1.6 0 0 4 C1.2 6 0.4 7.4 0 8.4" fill="none" stroke="{slit}" stroke-width="1.5" stroke-linecap="round"/>'
            + "".join(f'<line x1="{f(-1.6 if k % 2 else 1.6)}" y1="{f(-6 + k * 2.4)}" x2="{f(-0.4 if k % 2 else 0.4)}" y2="{f(-6 + k * 2.4)}" stroke="{slit}" stroke-width="0.7"/>' for k in range(6))
            + "</g>")


def baobab(x, y, h, color, seed=3, snow=None, w=None):
    """Un baobab en silhouette (repère : pied du tronc) : tronc-bouteille, couronne de branches trapues."""
    rnd = random.Random(seed)
    w = w or h * 0.32
    top = y - h * 0.62
    trunk = (f"M{f(x - w * 0.55)} {f(y)} C{f(x - w * 0.62)} {f(y - h * 0.25)} {f(x - w * 0.5)} {f(y - h * 0.45)} {f(x - w * 0.32)} {f(top)} "
             f"L{f(x + w * 0.32)} {f(top)} C{f(x + w * 0.5)} {f(y - h * 0.45)} {f(x + w * 0.64)} {f(y - h * 0.25)} {f(x + w * 0.56)} {f(y)} Z")
    out = [f'<path d="{trunk}" fill="{color}"/>']
    branches = []
    tips = []
    for k in range(7):
        a = -70 + k * 23 + rnd.uniform(-6, 6)
        sx = x + (k - 3) * w * 0.1
        grow(rnd, sx, top + 4, a, h * rnd.uniform(0.18, 0.26), w * 0.16, 2, spread=40, decay=0.6, wdecay=0.6, bend=10, out=branches, tips=tips, min_w=1.0)
    out.append(f'<path d="{" ".join(branches)}" fill="{color}"/>')
    if snow:
        caps = []
        for tx, ty, a in tips:
            caps.append(f'<ellipse cx="{f(tx)}" cy="{f(ty - 1)}" rx="3" ry="1.4" fill="{snow}" opacity="0.85"/>')
        out.append("".join(caps))
        out.append(f'<path d="M{f(x - w * 0.34)} {f(top + 2)} Q{f(x)} {f(top - 6)} {f(x + w * 0.34)} {f(top + 2)} Q{f(x)} {f(top + 3)} {f(x - w * 0.34)} {f(top + 2)} Z" fill="{snow}" opacity="0.8"/>')
    return "".join(out)


def adinkra(kind, x, y, s, color):
    return {"adinkrahene": adinkrahene, "nsoromma": nsoromma, "dwennimmen": dwennimmen, "sankofa": sankofa, "akoma": akoma}[kind](x, y, s, color)


# ================================================================ la tête de dragon (proue, pignon)

def dragon_head2(fill, edge="#1A0C04", eye="#7CF7FF", mouth="#5A0E0A", tongue="#E0483C", w=1.6, horn=True, mane=True):
    """Tête de dragon de proue (création originale) : gueule ouverte et dentée, museau qui s'enroule,
    corne rabattue, crinière en épines. Repère : cou à l'origine, regard à droite, longueur ≈ 96."""
    out = []
    if horn:
        out.append(f'<path d="M30 -29 C20 -46 2 -56 -22 -60 C-6 -50 6 -42 14 -29 Z" fill="{fill}" stroke="{edge}" stroke-width="{f(w)}" stroke-linejoin="round"/>')
        out.append(f'<path d="M20 -27 C10 -37 -2 -42 -16 -42 C-4 -35 2 -30 6 -24 Z" fill="{fill}" stroke="{edge}" stroke-width="{f(w * 0.9)}" stroke-linejoin="round"/>')
    if mane:
        out.append(f'<path d="M6 -18 L-4 -32 L-2 -18 L-14 -28 L-10 -14 L-22 -20 L-14 -8 Z" fill="{fill}" stroke="{edge}" stroke-width="{f(w * 0.8)}" stroke-linejoin="round"/>')
    out.append(f'<path d="M44 -8 L81 -13 L77 4 Z" fill="{mouth}"/>')
    out.append(f'<path d="M48 -6 C58 -4 70 -6 86 -2 M86 -2 L93 -6 M86 -2 L92 3" fill="none" stroke="{tongue}" stroke-width="{f(w * 1.3)}" stroke-linecap="round"/>')
    head = ("M0 -16 C8 -22 16 -28 26 -30 C34 -32 40 -30 46 -27 C52 -25 60 -24 70 -24 C78 -24 84 -28 88 -34 "
            "C91 -38 96 -36 94 -31 C92 -26 88 -20 84 -17 L81 -13 L44 -8 L77 4 C81 6 82 10 78 13 "
            "C66 16 50 16 38 14 C26 12 12 14 0 16 Z")
    out.append(f'<path d="{head}" fill="{fill}" stroke="{edge}" stroke-width="{f(w)}" stroke-linejoin="round"/>')
    out.append(f'<path d="M44 -8 L81 -13 L77 4 L44 -8" fill="{mouth}" stroke="{edge}" stroke-width="{f(w * 0.8)}" stroke-linejoin="round"/>')
    teeth_u = " ".join(f"M{f(78 - k * 6)} {f(-12.6 + k * 0.7)} L{f(76 - k * 6)} {f(-7 + k * 0.6)} L{f(74 - k * 6)} {f(-12.2 + k * 0.7)}" for k in range(5))
    teeth_l = " ".join(f"M{f(74 - k * 6)} {f(2.6 - k * 1.2)} L{f(72 - k * 6)} {f(-3 - k * 1.1)} L{f(70 - k * 6)} {f(2 - k * 1.2)}" for k in range(4))
    out.append(f'<path d="{teeth_u} {teeth_l}" fill="#FFF8E8" stroke="{edge}" stroke-width="0.5"/>')
    out.append(f'<path d="M50 15 C46 25 38 29 28 27 C36 22 40 18 40 14 Z" fill="{fill}" stroke="{edge}" stroke-width="{f(w * 0.8)}"/>')
    out.append(f'<path d="M30 -19 Q40 -28 50 -19 Q40 -13 30 -19 Z" fill="{eye}" stroke="{edge}" stroke-width="{f(w * 0.8)}"/><circle cx="41" cy="-19.5" r="2.4" fill="{edge}"/>'
               f'<circle cx="39.6" cy="-21" r="0.9" fill="#FFFFFF"/>')
    out.append(f'<path d="M26 -30 C34 -34 44 -30 52 -25" fill="none" stroke="{edge}" stroke-width="{f(w)}" stroke-linecap="round"/>')
    out.append(f'<path d="M86 -27 c3 -2 5 1 2 3" fill="none" stroke="{edge}" stroke-width="{f(w * 0.8)}" stroke-linecap="round"/>')
    out.append(f'<path d="M14 2 c-2 -8 6 -12 10 -8 c4 4 -2 9 -5 6 c-2 -2 0 -4 2 -3 M24 8 C34 6 44 4 56 2 M6 -4 C12 -10 20 -12 28 -10" fill="none" stroke="{edge}" stroke-width="{f(w * 0.7)}" stroke-linecap="round" opacity="0.85"/>')
    return "".join(out)
