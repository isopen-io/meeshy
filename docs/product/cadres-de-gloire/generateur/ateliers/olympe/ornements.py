"""Ornements grecs de l'atelier « Olympe ».

Sources des formes (toutes redessinées, aucune copie d'œuvre) :
  - la grecque (méandre à double clé) des vases attiques et des frises de temples ;
  - les oves et dards (kymation ionique), les perles et pirouettes (astragale), les denticules ;
  - la palmette et le lotus enchaînés (anthémion) des corniches et des vases ;
  - les flots (postes, « chien courant ») ;
  - le laurier d'Apollon (couronne des Pythiques) et l'olivier d'Athéna (couronne des Olympiques, kotinos) ;
  - la rosette des stèles funéraires attiques.
Chaque motif rend une chaîne SVG, dans le repère absolu sauf mention contraire.
"""

import math
import random

from common import f, pt, nid


# ---------------------------------------------------------------- la grecque

def meander_d(x0, y0, length, u):
    """Méandre à double clé, horizontal : bande de hauteur 8u commençant en (x0, y0), période 10u."""
    n = max(1, round(length / (10 * u)))
    u = length / (10 * n)
    parts = [f"M{f(x0)} {f(y0 + 8 * u)}"]
    for k in range(n):
        ox = x0 + 10 * u * k
        parts.append(
            f"V{f(y0)} H{f(ox + 8 * u)} V{f(y0 + 6 * u)} H{f(ox + 4 * u)} V{f(y0 + 4 * u)} H{f(ox + 6 * u)} "
            f"V{f(y0 + 2 * u)} H{f(ox + 2 * u)} V{f(y0 + 8 * u)} H{f(ox + 10 * u)}"
        )
    parts.append(f"V{f(y0)}")
    return " ".join(parts), u


def meander(x0, y0, length, u, color, w=None, rails=True, vertical=False, op=1):
    """Une bande de grecque, avec ses deux filets. `vertical` : la bande descend à partir de (x0, y0)."""
    if vertical:
        inner = meander(0, 0, length, u, color, w, rails, False, op)
        return f'<g transform="translate({f(x0)} {f(y0)}) rotate(90) translate(0 {f(-8 * u)})">{inner}</g>'
    d, uu = meander_d(x0, y0, length, u)
    sw = w or uu * 0.95
    out = [f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(sw)}" stroke-linejoin="miter" stroke-linecap="square" opacity="{op}"/>']
    if rails:
        out.append(f'<path d="M{f(x0 - uu)} {f(y0 - 2 * uu)} H{f(x0 + length + uu)} M{f(x0 - uu)} {f(y0 + 10 * uu)} H{f(x0 + length + uu)}" '
                   f'stroke="{color}" stroke-width="{f(sw * 0.8)}" opacity="{op}"/>')
    return "".join(out)


def meander_frame(x0, y0, x1, y1, u, color, w=None):
    """Une grecque qui fait le tour d'un rectangle (quatre bandes et quatre carrés d'angle)."""
    band = 8 * u
    out = [
        meander(x0 + band + 2 * u, y0, x1 - x0 - 2 * band - 4 * u, u, color, w),
        meander(x0 + band + 2 * u, y1 - band, x1 - x0 - 2 * band - 4 * u, u, color, w),
        meander(x0 + band, y0 + band + 2 * u, y1 - y0 - 2 * band - 4 * u, u, color, w, vertical=True),
        meander(x1, y0 + band + 2 * u, y1 - y0 - 2 * band - 4 * u, u, color, w, vertical=True),
    ]
    for cx, cy in ((x0 + band / 2, y0 + band / 2), (x1 - band / 2, y0 + band / 2), (x0 + band / 2, y1 - band / 2), (x1 - band / 2, y1 - band / 2)):
        out.append(rosette(cx, cy, band * 0.52, color, petals=8))
    return "".join(out)


# ---------------------------------------------------------------- moulures

def oves(x0, y0, length, h, egg, shell, dart=None, unit=None):
    """Oves et dards (kymation ionique) : bande de hauteur h."""
    unit = unit or h * 0.9
    n = max(1, round(length / unit))
    unit = length / n
    dart = dart or shell
    out = []
    for i in range(n):
        cx = x0 + unit * (i + 0.5)
        out.append(
            f'<path d="M{f(cx - unit * 0.44)} {f(y0)} C{f(cx - unit * 0.46)} {f(y0 + h * 1.02)} {f(cx + unit * 0.46)} {f(y0 + h * 1.02)} {f(cx + unit * 0.44)} {f(y0)} Z" fill="{shell}"/>'
            f'<ellipse cx="{f(cx)}" cy="{f(y0 + h * 0.4)}" rx="{f(unit * 0.31)}" ry="{f(h * 0.4)}" fill="{egg}"/>'
        )
        dx = x0 + unit * (i + 1)
        if i < n - 1:
            out.append(f'<path d="M{f(dx - unit * 0.07)} {f(y0)} L{f(dx + unit * 0.07)} {f(y0)} L{f(dx + unit * 0.05)} {f(y0 + h * 0.55)} '
                       f'L{f(dx)} {f(y0 + h * 0.92)} L{f(dx - unit * 0.05)} {f(y0 + h * 0.55)} Z" fill="{dart}"/>')
    return "".join(out)


def beads(x0, y, length, h, color, unit=None):
    """Perles et pirouettes (astragale)."""
    unit = unit or h * 2.2
    n = max(1, round(length / unit))
    unit = length / n
    out = []
    for i in range(n):
        cx = x0 + unit * (i + 0.5)
        out.append(f'<ellipse cx="{f(cx)}" cy="{f(y)}" rx="{f(unit * 0.3)}" ry="{f(h / 2)}" fill="{color}"/>')
        rx = x0 + unit * (i + 1)
        if i < n - 1:
            out.append(f'<ellipse cx="{f(rx - unit * 0.09)}" cy="{f(y)}" rx="{f(unit * 0.05)}" ry="{f(h * 0.36)}" fill="{color}"/>'
                       f'<ellipse cx="{f(rx + unit * 0.09)}" cy="{f(y)}" rx="{f(unit * 0.05)}" ry="{f(h * 0.36)}" fill="{color}"/>')
    return "".join(out)


def dentils(x0, y0, length, h, color, unit=None):
    unit = unit or h * 0.9
    n = max(1, round(length / unit))
    unit = length / n
    return "".join(f'<rect x="{f(x0 + unit * i + unit * 0.14)}" y="{f(y0)}" width="{f(unit * 0.72)}" height="{f(h)}" fill="{color}"/>' for i in range(n))


def waves(x0, yb, length, h, color, w=None, period=None):
    """Les flots (postes) : vagues qui s'enroulent, sur une ligne de base."""
    period = period or h * 1.6
    n = max(1, round(length / period))
    period = length / n
    w = w or h * 0.16
    out = [f'<path d="M{f(x0)} {f(yb)} H{f(x0 + length)}" stroke="{color}" stroke-width="{f(w)}"/>']
    for k in range(n):
        ox = x0 + period * k
        cx, cy = ox + period * 0.58, yb - h * 0.52
        pts = []
        for i in range(46):
            t = i / 45
            ang = math.radians(200 + t * 470)
            r = h * 0.46 * (1 - t * 0.78)
            pts.append((cx + r * math.cos(ang) * 1.1, cy + r * math.sin(ang)))
        d = f"M{f(ox)} {f(yb)} Q{f(ox + period * 0.12)} {f(yb - h * 0.05)} {f(pts[0][0])} {f(pts[0][1])} " + " ".join(f"L{f(x)} {f(y)}" for x, y in pts[1:])
        out.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(w)}" stroke-linecap="round" stroke-linejoin="round"/>')
    return "".join(out)


# ---------------------------------------------------------------- palmettes

def palmette(cx, by, h, color, petals=9, spread=150, volutes=True, w=None):
    """Une palmette : un éventail de pétales sur deux volutes, la base en (cx, by)."""
    w = w or h * 0.13
    out = []
    for i in range(petals):
        a = -spread / 2 + spread * i / (petals - 1)
        L = h * (0.72 + 0.28 * math.cos(math.radians(a) * 0.9))
        tx, ty = pt(cx, by - h * 0.12, L, a)
        bx, by2 = pt(cx, by - h * 0.12, L * 0.2, a)
        nx, ny = math.cos(math.radians(a)), math.sin(math.radians(a))
        k = w * (0.85 if i % 2 == 0 else 0.7)
        mx, my = pt(cx, by - h * 0.12, L * 0.62, a)
        out.append(
            f'<path d="M{f(bx)} {f(by2)} Q{f(mx - nx * k * 1.4)} {f(my - ny * k * 1.4)} {f(tx)} {f(ty)} '
            f'Q{f(mx + nx * k * 1.4)} {f(my + ny * k * 1.4)} {f(bx)} {f(by2)} Z" fill="{color}"/>'
        )
    if volutes:
        for m in (-1, 1):
            out.append(spiral(cx + m * h * 0.2, by - h * 0.04, h * 0.14, color, w * 0.5, m))
    out.append(f'<path d="M{f(cx - h * 0.1)} {f(by)} Q{f(cx)} {f(by - h * 0.22)} {f(cx + h * 0.1)} {f(by)} Z" fill="{color}"/>')
    return "".join(out)


def lotus(cx, by, h, color, w=None):
    """Le lotus de l'anthémion : un pétale central et deux sépales qui s'écartent."""
    w = w or h * 0.16
    return (
        f'<path d="M{f(cx)} {f(by - h)} Q{f(cx + w * 1.3)} {f(by - h * 0.45)} {f(cx + w * 0.4)} {f(by - h * 0.1)} L{f(cx - w * 0.4)} {f(by - h * 0.1)} '
        f'Q{f(cx - w * 1.3)} {f(by - h * 0.45)} {f(cx)} {f(by - h)} Z" fill="{color}"/>'
        f'<path d="M{f(cx - w * 0.3)} {f(by - h * 0.12)} Q{f(cx - h * 0.45)} {f(by - h * 0.4)} {f(cx - h * 0.5)} {f(by - h * 0.82)} '
        f'Q{f(cx - h * 0.3)} {f(by - h * 0.42)} {f(cx - w * 0.1)} {f(by - h * 0.02)} Z" fill="{color}"/>'
        f'<path d="M{f(cx + w * 0.3)} {f(by - h * 0.12)} Q{f(cx + h * 0.45)} {f(by - h * 0.4)} {f(cx + h * 0.5)} {f(by - h * 0.82)} '
        f'Q{f(cx + h * 0.3)} {f(by - h * 0.42)} {f(cx + w * 0.1)} {f(by - h * 0.02)} Z" fill="{color}"/>'
    )


def anthemion(x0, by, length, h, color, unit=None, lotus_too=True):
    """Frise de palmettes (et lotus) reliées par des rinceaux en S."""
    unit = unit or h * 1.15
    n = max(1, round(length / unit))
    unit = length / n
    out = []
    for i in range(n):
        cx = x0 + unit * (i + 0.5)
        if lotus_too and i % 2 == 1:
            out.append(lotus(cx, by, h * 0.82, color))
        else:
            out.append(palmette(cx, by, h, color, petals=7, spread=140, volutes=False))
    d = []
    for i in range(n - 1):
        a = x0 + unit * (i + 0.5)
        b = a + unit
        d.append(f"M{f(a)} {f(by)} C{f(a + unit * 0.3)} {f(by + h * 0.22)} {f(b - unit * 0.3)} {f(by - h * 0.22)} {f(b)} {f(by)}")
    out.append(f'<path d="{" ".join(d)}" fill="none" stroke="{color}" stroke-width="{f(h * 0.07)}" stroke-linecap="round"/>')
    out.append(f'<path d="M{f(x0)} {f(by + h * 0.18)} H{f(x0 + length)}" stroke="{color}" stroke-width="{f(h * 0.06)}"/>')
    return "".join(out)


def spiral(cx, cy, r, color, w, sense=1, turns=1.6, start=0):
    """Une volute (spirale d'Archimède) qui s'enroule vers son œil."""
    pts = []
    n = 60
    for i in range(n + 1):
        t = i / n
        a = math.radians(start + sense * t * 360 * turns)
        rr = r * (1 - 0.82 * t)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts)
    return (f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(w)}" stroke-linecap="round"/>'
            f'<circle cx="{f(pts[-1][0])}" cy="{f(pts[-1][1])}" r="{f(w * 0.9)}" fill="{color}"/>')


# ---------------------------------------------------------------- laurier et olivier

def leaf_d(L, w):
    """Une feuille lancéolée pointée vers le haut, attachée en (0, 0)."""
    return (f"M0 0 C{f(w * 0.62)} {f(-L * 0.22)} {f(w * 0.58)} {f(-L * 0.72)} 0 {f(-L)} "
            f"C{f(-w * 0.58)} {f(-L * 0.72)} {f(-w * 0.62)} {f(-L * 0.22)} 0 0Z")


def quad_points(p0, p1, p2, n):
    out = []
    for i in range(n):
        t = i / max(1, n - 1)
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
        dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0])
        dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1])
        out.append((x, y, math.degrees(math.atan2(dx, -dy)), t))
    return out


def branch(p0, p1, p2, n, L, w, fill, rib=None, stem=None, berries=None, under=None, angle=38, seed=1, taper=0.45, stem_w=None):
    """Un rameau (laurier, olivier) le long d'une courbe quadratique ; feuilles alternées, plus petites vers la pointe.
    `under` : la couleur du revers argenté (olivier) posée sur une feuille sur trois."""
    rnd = random.Random(seed)
    pts = quad_points(p0, p1, p2, n)
    stem = stem or fill
    sw = stem_w or w * 0.18
    d = f"M{f(p0[0])} {f(p0[1])} Q{f(p1[0])} {f(p1[1])} {f(p2[0])} {f(p2[1])}"
    out = [f'<path d="{d}" fill="none" stroke="{stem}" stroke-width="{f(sw)}" stroke-linecap="round"/>']
    for i, (x, y, a, t) in enumerate(pts[1:], 1):
        k = 1 - taper * t
        side = 1 if i % 2 else -1
        rot = a + side * (angle + rnd.uniform(-6, 6))
        col = under if (under and i % 3 == 0) else fill
        out.append(f'<g transform="translate({f(x)} {f(y)}) rotate({f(rot)})"><path d="{leaf_d(L * k, w * k)}" fill="{col}"/>'
                   + (f'<path d="M0 {f(-L * k * 0.08)} L0 {f(-L * k * 0.86)}" stroke="{rib}" stroke-width="{f(w * k * 0.09)}" stroke-linecap="round" opacity="0.7"/>' if rib else "")
                   + "</g>")
        if berries and i % 3 == 1 and t < 0.85:
            bx, by = pt(x, y, w * 0.9, a - side * 70)
            out.append(f'<circle cx="{f(bx)}" cy="{f(by)}" r="{f(w * 0.36 * k)}" fill="{berries}"/>'
                       f'<circle cx="{f(bx - w * 0.1)}" cy="{f(by - w * 0.12)}" r="{f(w * 0.12 * k)}" fill="#FFFFFF" opacity="0.55"/>')
    tx, ty, ta, _ = pts[-1]
    out.append(f'<g transform="translate({f(tx)} {f(ty)}) rotate({f(ta)})"><path d="{leaf_d(L * (1 - taper) * 0.95, w * (1 - taper))}" fill="{fill}"/></g>')
    return "".join(out)


def wreath(cx, cy, r, fill, rib=None, berries=None, under=None, n=13, L=None, w=None, gap=34, open_top=True, seed=5,
           ribbon=None, angle=36, bottom_gap=16):
    """Une couronne : deux rameaux qui montent depuis le nœud du bas et se rejoignent (ou presque) au sommet."""
    L = L or r * 0.42
    w = w or r * 0.16
    top = gap / 2 if open_top else 3
    out = []
    for m in (-1, 1):
        a0 = 180 + bottom_gap / 2 if m < 0 else 180 - bottom_gap / 2
        a1 = 360 - top if m < 0 else top
        angs = [a0 + (a1 - a0) * i / (n - 1) for i in range(n)]
        rnd = random.Random(seed + m)
        stem = [pt(cx, cy, r, a) for a in angs]
        d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in stem)
        out.append(f'<path d="{d}" fill="none" stroke="{fill}" stroke-width="{f(w * 0.2)}" stroke-linecap="round" stroke-linejoin="round"/>')
        for i, a in enumerate(angs):
            x, y = pt(cx, cy, r, a)
            tang = a + 90 if m < 0 else a - 90
            t = i / (n - 1)
            k = 1 - 0.38 * t
            for side in (-1, 1):
                rot = tang + side * (angle + rnd.uniform(-5, 5))
                sx, sy = pt(x, y, w * 0.22 * side * m, a)
                col = under if (under and (i + (side > 0)) % 3 == 0) else fill
                out.append(f'<g transform="translate({f(sx)} {f(sy)}) rotate({f(rot)})"><path d="{leaf_d(L * k, w * k)}" fill="{col}"/>'
                           + (f'<path d="M0 {f(-L * k * 0.1)} L0 {f(-L * k * 0.85)}" stroke="{rib}" stroke-width="{f(w * k * 0.09)}" opacity="0.7"/>' if rib else "")
                           + "</g>")
            if berries and i % 2 == 1 and t < 0.9:
                bx, by = pt(x, y, r * 0.1, a + 180)
                out.append(f'<circle cx="{f(bx)}" cy="{f(by)}" r="{f(w * 0.34 * k)}" fill="{berries}"/>')
        tx, ty = pt(cx, cy, r, a1)
        out.append(f'<g transform="translate({f(tx)} {f(ty)}) rotate({f(a1 + 90 if m < 0 else a1 - 90)})"><path d="{leaf_d(L * 0.62, w * 0.62)}" fill="{fill}"/></g>')
    if ribbon:
        bx, by = pt(cx, cy, r, 180)
        out.append(
            f'<path d="M{f(bx)} {f(by)} C{f(bx - r * 0.25)} {f(by + r * 0.1)} {f(bx - r * 0.34)} {f(by + r * 0.34)} {f(bx - r * 0.42)} {f(by + r * 0.5)} '
            f'L{f(bx - r * 0.3)} {f(by + r * 0.44)} L{f(bx - r * 0.3)} {f(by + r * 0.56)} C{f(bx - r * 0.2)} {f(by + r * 0.32)} {f(bx - r * 0.1)} {f(by + r * 0.12)} {f(bx)} {f(by + r * 0.04)} '
            f'C{f(bx + r * 0.1)} {f(by + r * 0.12)} {f(bx + r * 0.2)} {f(by + r * 0.32)} {f(bx + r * 0.3)} {f(by + r * 0.56)} L{f(bx + r * 0.3)} {f(by + r * 0.44)} '
            f'L{f(bx + r * 0.42)} {f(by + r * 0.5)} C{f(bx + r * 0.34)} {f(by + r * 0.34)} {f(bx + r * 0.25)} {f(by + r * 0.1)} {f(bx)} {f(by)}Z" fill="{ribbon}"/>'
            f'<ellipse cx="{f(bx)}" cy="{f(by + r * 0.02)}" rx="{f(r * 0.07)}" ry="{f(r * 0.06)}" fill="{ribbon}"/>'
        )
    return "".join(out)


def rosette(cx, cy, r, color, petals=8, center=None):
    """Rosette des stèles attiques."""
    out = []
    for i in range(petals):
        a = 360 * i / petals
        out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy - r * 0.52)}" rx="{f(r * 0.22)}" ry="{f(r * 0.46)}" fill="{color}" transform="rotate({f(a)} {f(cx)} {f(cy)})"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.24)}" fill="{center or color}"/>')
    return "".join(out)


def star8(cx, cy, r, color, op=1):
    """Étoile à huit branches (le soleil des boucliers et des stèles)."""
    out = []
    for i in range(8):
        a = 45 * i
        x1, y1 = pt(cx, cy, r, a)
        xl, yl = pt(cx, cy, r * 0.28, a - 22.5)
        xr, yr = pt(cx, cy, r * 0.28, a + 22.5)
        out.append(f"M{f(cx)} {f(cy)} L{f(xl)} {f(yl)} L{f(x1)} {f(y1)} L{f(xr)} {f(yr)}Z")
    return f'<path d="{" ".join(out)}" fill="{color}" opacity="{op}"/>'
