"""Motifs de l'atelier « poses » : le temple de l'Olympe (marbre, or, laurier, ailes de la Victoire)."""

import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "lib"))

from base import W, H, f, pt  # noqa: E402

IVORY = "#FFF8EC"
GOLD_HI = "#FFF4C8"
GOLD = "#E9B847"
GOLD_MID = "#C8902C"
GOLD_LO = "#7A4C10"
LAPIS = "#102A66"
LAPIS_D = "#06112E"
TYRIAN = "#5E1650"
TYRIAN_D = "#2E0828"
RUBY = "#D8344A"
LAUREL = "#4E6B2C"
LAUREL_HI = "#A8C070"
INK = "#3A220E"


# ---------------------------------------------------------------- matières

def gold_v(c, name="gold-v"):
    return c.grad(name, [(0, "#FFF6D2"), (0.28, "#F4CC5C"), (0.5, "#C88A22"), (0.62, "#9A6214"), (0.8, "#E8B648"), (1, "#FFE9A6")])


def gold_d(c, name="gold-d"):
    return c.grad(name, [(0, "#FFF6D2"), (0.3, "#F0C14E"), (0.52, "#A86B16"), (0.7, "#E5B040"), (1, "#FFF0B8")], 0, 0, 1, 1)


def gold_h(c, name="gold-h"):
    return c.grad(name, [(0, "#8A5A12"), (0.2, "#E9B847"), (0.45, "#FFF4C8"), (0.62, "#E0A93A"), (0.85, "#9C6716"), (1, "#5E3A0C")], 0, 0, 1, 0)


def marble_h(c, name="marble-h"):
    """Fût de colonne : lumière de face, flancs en ombre chaude."""
    return c.grad(name, [(0, "#8E8170"), (0.12, "#C9BEAB"), (0.34, "#F2ECE0"), (0.5, "#FFFDF7"), (0.68, "#E9E1D2"), (0.88, "#B5A893"), (1, "#7C705F")], 0, 0, 1, 0)


def marble_v(c, name="marble-v", lit="#FFFCF5", shade="#CFC4B0"):
    return c.grad(name, [(0, lit), (0.55, "#EFE8DB"), (1, shade)])


def veins(c, name="veins", seed=4, freq="0.006 0.022", color="#6E7C93", strength=1.0):
    """Veines de marbre : bruit de turbulence dont on ne garde que les crêtes, dessinées dans la forme source."""
    a = 2.6 * strength
    c.def_once(
        name,
        f'<filter id="{c.id(name)}" x="0" y="0" width="{W}" height="{H}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="turbulence" baseFrequency="{freq}" numOctaves="5" seed="{seed}" result="t"/>'
        f'<feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -{a} 0 0 0 1" result="a"/>'
        f'<feComponentTransfer in="a" result="b"><feFuncA type="gamma" amplitude="1" exponent="3.2" offset="0"/></feComponentTransfer>'
        f'<feFlood flood-color="{color}" result="col"/>'
        f'<feComposite in="col" in2="b" operator="in" result="v"/>'
        f'<feComposite in="v" in2="SourceAlpha" operator="in"/></filter>',
    )
    return f"url(#{c.id(name)})"


def emboss(c, name="emboss", light="#FFF7DC", az=225, el=42, scale=2.6, k=0.85):
    """Relief repoussé : un éclat spéculaire sur les bords, comme une feuille d'or martelée."""
    c.def_once(
        name,
        f'<filter id="{c.id(name)}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">'
        f'<feGaussianBlur in="SourceAlpha" stdDeviation="1.1" result="b"/>'
        f'<feSpecularLighting in="b" surfaceScale="{scale}" specularConstant="1.05" specularExponent="16" lighting-color="{light}" result="s">'
        f'<feDistantLight azimuth="{az}" elevation="{el}"/></feSpecularLighting>'
        f'<feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>'
        f'<feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k1="0" k2="1" k3="{k}" k4="0"/></filter>',
    )
    return f"url(#{c.id(name)})"


def ushadow(c, name, dx=0, dy=3, sd=3, op=0.5, color="#000000"):
    return c.shadow(name, dx, dy, sd, color, op)


# ---------------------------------------------------------------- feuilles, ailes, volutes

def leaf(x, y, ang, length, width, fill, vein=None, op=1.0):
    """Une feuille de laurier, base en (x, y), pointée vers `ang` (degrés depuis midi, sens horaire)."""
    l, w = length, width
    d = f"M0 0 C{f(w * 0.75)} {f(-l * 0.22)} {f(w * 0.62)} {f(-l * 0.72)} 0 {f(-l)} C{f(-w * 0.62)} {f(-l * 0.72)} {f(-w * 0.75)} {f(-l * 0.22)} 0 0 Z"
    v = f'<path d="M0 {f(-l * 0.08)} L0 {f(-l * 0.86)}" stroke="{vein}" stroke-width="{f(max(0.6, w * 0.09))}" stroke-linecap="round" opacity="0.75"/>' if vein else ""
    return f'<g transform="translate({f(x)} {f(y)}) rotate({f(ang)})" opacity="{op}"><path d="{d}" fill="{fill}"/>{v}</g>'


def laurel_branch(cx, cy, rx, ry, a0, a1, n, fill, vein, stem, berry=None, size=1.0, side=1, seed=3):
    """Une branche de laurier le long d'une ellipse, de l'angle a0 à a1 (degrés depuis midi). `side` = sens de pousse."""
    rnd = random.Random(seed)
    out = []
    pts = []
    for i in range(n + 1):
        t = i / n
        a = a0 + (a1 - a0) * t
        x, y = cx + rx * math.sin(math.radians(a)), cy - ry * math.cos(math.radians(a))
        pts.append((x, y, a, t))
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y, _, _ in pts)
    out.append(f'<path d="{d}" fill="none" stroke="{stem}" stroke-width="{f(2.6 * size)}" stroke-linecap="round"/>')
    for x, y, a, t in pts[1:]:
        tangent = a + (90 if a1 > a0 else -90)
        ln = (22 - 9 * t) * size
        wd = (8.5 - 2.5 * t) * size
        out.append(leaf(x, y, tangent - 38 + rnd.uniform(-6, 6), ln, wd, fill, vein))
        out.append(leaf(x, y, tangent + 38 + rnd.uniform(-6, 6), ln * 0.94, wd * 0.95, fill, vein))
        if berry and rnd.random() < 0.35:
            bx, by = x + rnd.uniform(-4, 4), y + rnd.uniform(-4, 4)
            out.append(f'<circle cx="{f(bx)}" cy="{f(by)}" r="{f(2.6 * size)}" fill="{berry}"/>')
    tip_x, tip_y, ta, _ = pts[-1]
    tangent = ta + (90 if a1 > a0 else -90)
    out.append(leaf(tip_x, tip_y, tangent, 15 * size, 6 * size, fill, vein))
    return "".join(out)


def feather(x, y, ang, length, width, fill, edge, op=1.0, edge_w=0.9):
    """Une plume, calamus en (x, y), pointée vers `ang` (degrés depuis midi, sens horaire)."""
    l, w = length, width
    d = (
        f"M0 0 C{f(w * 0.55)} {f(-l * 0.12)} {f(w * 0.62)} {f(-l * 0.62)} {f(w * 0.22)} {f(-l * 0.96)} "
        f"Q0 {f(-l * 1.02)} {f(-w * 0.16)} {f(-l * 0.95)} C{f(-w * 0.52)} {f(-l * 0.6)} {f(-w * 0.5)} {f(-l * 0.14)} 0 0 Z"
    )
    rach = f'<path d="M0 {f(-l * 0.04)} Q{f(w * 0.06)} {f(-l * 0.5)} {f(w * 0.05)} {f(-l * 0.9)}" stroke="{edge}" stroke-width="{f(edge_w * 0.9)}" fill="none" opacity="0.7"/>'
    return f'<g transform="translate({f(x)} {f(y)}) rotate({f(ang)})" opacity="{op}"><path d="{d}" fill="{fill}" stroke="{edge}" stroke-width="{f(edge_w)}"/>{rach}</g>'


def lerp(a, b, t):
    return a + (b - a) * t


def wing(root, wrist, tip_dir_a, tip_dir_b, fills, edge, mirror=False, scale=1.0):
    """Une aile de la Victoire déployée (héraldique). root → wrist = l'avant-bras ; les rémiges partent du poignet.

    Angles en degrés depuis midi (sens horaire) pour l'aile GAUCHE ; `mirror` la retourne autour de x=270."""
    fp, fs, fc = fills
    out = []

    def place(x, y, ang):
        if mirror:
            return 540 - x, y, -ang
        return x, y, ang

    rx, ry = root
    wx, wy = wrist
    # rémiges primaires : en éventail depuis le poignet vers l'angle
    n = 8
    for i in range(n):
        t = i / (n - 1)
        x, y = lerp(wx, wx + 22, t), lerp(wy, wy + 10, t)
        ang = lerp(tip_dir_a, tip_dir_b, t)
        ln = lerp(150, 92, t) * scale
        out.append(feather(*place(x, y, ang), ln, 15 * scale, fp, edge))
    # rémiges secondaires : le long de l'avant-bras, vers le bas
    n2 = 7
    for i in range(n2):
        t = i / (n2 - 1)
        x, y = lerp(wx + 26, rx - 4, t), lerp(wy + 8, ry + 6, t)
        ang = lerp(tip_dir_b - 8, 186, t)
        ln = lerp(84, 70, t) * scale
        out.append(feather(*place(x, y, ang), ln, 17 * scale, fs, edge))
    # couvertures : deux rangs plus courts, par-dessus
    for row, (k, lw, off) in enumerate(((0.55, 15, 0), (0.32, 12, 6))):
        n3 = 9
        for i in range(n3):
            t = i / (n3 - 1)
            x, y = lerp(wx - 8 + off, rx + 2, t), lerp(wy - 6 - off, ry - 6 - off * 0.4, t)
            ang = lerp(tip_dir_a + 10, 192, t)
            ln = lerp(120, 64, t) * k * scale
            out.append(feather(*place(x, y, ang), ln, lw * scale, fc, edge))
    # le bras de l'aile, bord d'attaque
    ax0, ay0 = place(rx + 6, ry - 2, 0)[:2]
    ax1, ay1 = place(wx - 14, wy - 4, 0)[:2]
    mx, my = place(lerp(rx, wx, 0.5), lerp(ry, wy, 0.5) - 16, 0)[:2]
    out.append(f'<path d="M{f(ax0)} {f(ay0)} Q{f(mx)} {f(my)} {f(ax1)} {f(ay1)}" fill="none" stroke="{fc}" stroke-width="{f(9 * scale)}" stroke-linecap="round"/>')
    out.append(f'<path d="M{f(ax0)} {f(ay0 - 3)} Q{f(mx)} {f(my - 3)} {f(ax1)} {f(ay1 - 3)}" fill="none" stroke="{GOLD_HI}" stroke-width="{f(1.6 * scale)}" stroke-linecap="round" opacity="0.8"/>')
    return "".join(out)


def volute(cx, cy, r, turns, color, w, mirror=False):
    """Volute ionique : une spirale qui s'enroule vers son œil."""
    pts = []
    steps = int(60 * turns)
    for i in range(steps + 1):
        t = i / steps
        a = math.radians(-90 + 360 * turns * t) * (-1 if mirror else 1)
        rr = r * (1 - 0.82 * t)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts)
    return (
        f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(w)}" stroke-linecap="round"/>'
        f'<circle cx="{f(pts[-1][0])}" cy="{f(pts[-1][1])}" r="{f(w * 0.9)}" fill="{color}"/>'
    )


def meander(x0, x1, y, h, color, w=None):
    """Grecque (méandre) entre deux filets : un crochet en spirale par module carré."""
    u = h / 5
    w = w or u * 0.62
    top, bot = y, y + h
    out = [
        f'<line x1="{f(x0)}" y1="{f(top + u * 0.5)}" x2="{f(x1)}" y2="{f(top + u * 0.5)}" stroke="{color}" stroke-width="{f(w)}"/>',
        f'<line x1="{f(x0)}" y1="{f(bot - u * 0.5)}" x2="{f(x1)}" y2="{f(bot - u * 0.5)}" stroke="{color}" stroke-width="{f(w)}"/>',
    ]
    period = 5 * u
    x = x0 + u * 0.5
    g = u  # pas de la grille intérieure
    yb = bot - u * 0.5
    while x + 4 * g <= x1:
        d = (
            f"M{f(x)} {f(yb)} L{f(x)} {f(top + 1.5 * g)} L{f(x + 3.4 * g)} {f(top + 1.5 * g)} L{f(x + 3.4 * g)} {f(top + 3.5 * g)} "
            f"L{f(x + 1.2 * g)} {f(top + 3.5 * g)} L{f(x + 1.2 * g)} {f(top + 2.5 * g)} L{f(x + 2.3 * g)} {f(top + 2.5 * g)}"
        )
        out.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(w)}" stroke-linejoin="miter"/>')
        x += period * 0.9
    return "".join(out)


def palmette(cx, cy, s, fill, edge):
    """Anthémion : sept lobes en goutte, dont les extrêmes s'enroulent vers l'extérieur, sur deux volutes en S."""
    out = []

    def lobe(ang, L, w, curl):
        d = (
            f"M0 0 C{f(w * 0.12)} {f(-L * 0.3)} {f(w * 0.62 + curl)} {f(-L * 0.52)} {f(w * 0.52 + curl * 1.4)} {f(-L * 0.82)} "
            f"C{f(w * 0.4 + curl * 1.6)} {f(-L * 1.04)} {f(-w * 0.42 + curl * 1.4)} {f(-L * 1.02)} {f(-w * 0.5 + curl)} {f(-L * 0.8)} "
            f"C{f(-w * 0.58 + curl * 0.6)} {f(-L * 0.52)} {f(-w * 0.12)} {f(-L * 0.3)} 0 0 Z"
        )
        return f'<path transform="translate({f(cx)} {f(cy)}) rotate({f(ang)})" d="{d}" fill="{fill}" stroke="{edge}" stroke-width="{f(0.7 * s)}"/>'

    spec = [(-62, 17, 7.5, -3), (-41, 22, 8.5, -2), (-20, 27, 9.5, -1), (0, 31, 10.5, 0), (20, 27, 9.5, 1), (41, 22, 8.5, 2), (62, 17, 7.5, 3)]
    for ang, L, w, curl in spec:
        out.append(lobe(ang, L * s, w * s, curl * s))
    for m in (-1, 1):
        out.append(
            f'<path d="M{f(cx)} {f(cy + 1 * s)} C{f(cx + m * 10 * s)} {f(cy + 2 * s)} {f(cx + m * 18 * s)} {f(cy - 2 * s)} {f(cx + m * 17 * s)} {f(cy - 9 * s)} '
            f'C{f(cx + m * 16 * s)} {f(cy - 14 * s)} {f(cx + m * 10 * s)} {f(cy - 13 * s)} {f(cx + m * 10 * s)} {f(cy - 9 * s)}" fill="none" stroke="{fill}" stroke-width="{f(3 * s)}" stroke-linecap="round"/>'
        )
    out.append(f'<path d="M{f(cx - 7 * s)} {f(cy + 4 * s)} Q{f(cx)} {f(cy - 6 * s)} {f(cx + 7 * s)} {f(cy + 4 * s)} Z" fill="{fill}" stroke="{edge}" stroke-width="{f(0.7 * s)}"/>')
    return "".join(out)


def rosette(cx, cy, r, fill, edge, petals=8):
    out = []
    for i in range(petals):
        a = 360 / petals * i
        x2, y2 = pt(cx, cy, r, a)
        lx, ly = pt(cx, cy, r * 0.6, a - 20)
        rx, ry = pt(cx, cy, r * 0.6, a + 20)
        out.append(f'<path d="M{f(cx)} {f(cy)} Q{f(lx)} {f(ly)} {f(x2)} {f(y2)} Q{f(rx)} {f(ry)} {f(cx)} {f(cy)} Z" fill="{fill}" stroke="{edge}" stroke-width="0.7"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.3)}" fill="{GOLD_HI}" stroke="{edge}" stroke-width="0.7"/>')
    return "".join(out)


def cloud_bank(c, name, y, x0, x1, seed, n, rmin, rmax, top_col, body_col, rim, dy=10, op=1.0, blur=1.4, lift=5, shade=None):
    """Un banc de nuées en volume : lisière de lumière au-dessus de chaque bulle, ventre ombré, éclat sur le dôme."""
    c.def_once(
        name,
        f'<linearGradient id="{c.id(name)}" gradientUnits="userSpaceOnUse" x1="0" y1="{f(y - rmax)}" x2="0" y2="{f(y + rmax * 0.7)}">'
        f'<stop offset="0" stop-color="{top_col}"/><stop offset="0.5" stop-color="{body_col}"/><stop offset="1" stop-color="{body_col}"/></linearGradient>',
    )
    rnd = random.Random(seed)
    blobs = []
    for i in range(n):
        t = (i + rnd.uniform(-0.35, 0.35)) / max(1, n - 1)
        x = x0 + (x1 - x0) * t
        r = rnd.uniform(rmin, rmax)
        cy = y + rnd.uniform(-dy, dy) + r * 0.3
        blobs.append((x, cy, r))
    blobs.sort(key=lambda b: -b[2])
    rims = "".join(f'<circle cx="{f(x - r * 0.06)}" cy="{f(cy - lift)}" r="{f(r)}"/>' for x, cy, r in blobs)
    body = "".join(f'<circle cx="{f(x)}" cy="{f(cy)}" r="{f(r * 0.985)}"/>' for x, cy, r in blobs)
    sh = shade or body_col
    shades = "".join(f'<ellipse cx="{f(x + r * 0.1)}" cy="{f(cy + r * 0.5)}" rx="{f(r * 0.85)}" ry="{f(r * 0.42)}"/>' for x, cy, r in blobs)
    lights = "".join(f'<ellipse cx="{f(x - r * 0.22)}" cy="{f(cy - r * 0.42)}" rx="{f(r * 0.5)}" ry="{f(r * 0.3)}"/>' for x, cy, r in blobs)
    clip = name + "-clip"
    c.def_once(clip, f'<clipPath id="{c.id(clip)}">{body}</clipPath>')
    c.add(
        f'<g opacity="{op}"><g fill="{rim}" filter="{c.blur(name + "-rb", blur * 1.4)}">{rims}</g>'
        f'<g fill="url(#{c.id(name)})" filter="{c.blur(name + "-b", blur)}">{body}</g>'
        f'<g clip-path="url(#{c.id(clip)})"><g fill="{sh}" opacity="0.55" filter="{c.blur(name + "-sh", rmin * 0.28)}">{shades}</g>'
        f'<g fill="{rim}" opacity="0.32" filter="{c.blur(name + "-li", rmin * 0.3)}">{lights}</g></g></g>'
    )


def ribbon_strip(points, width, front, back, edge, twist_at=None, fork=True, edge_w=0.8):
    """Un ruban qui suit une ligne médiane `points` ; il se vrille en `twist_at` (montrant son envers) et finit en queue d'aronde."""
    n = len(points)
    lefts, rights = [], []
    for i, (x, y) in enumerate(points):
        xa, ya = points[max(0, i - 1)]
        xb, yb = points[min(n - 1, i + 1)]
        dx, dy = xb - xa, yb - ya
        ln = math.hypot(dx, dy) or 1
        nx, ny = -dy / ln, dx / ln
        t = i / (n - 1)
        ww = width
        if twist_at is not None:
            ww = width * max(0.12, abs(t - twist_at) * 3.2) if abs(t - twist_at) < 0.3 else width
        lefts.append((x + nx * ww / 2, y + ny * ww / 2))
        rights.append((x - nx * ww / 2, y - ny * ww / 2))
    out = []
    split = n if twist_at is None else int(twist_at * (n - 1)) + 1

    def poly(a, b, fill):
        seg_l = lefts[a:b]
        seg_r = rights[a:b]
        d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in seg_l) + " L" + " L".join(f"{f(x)} {f(y)}" for x, y in reversed(seg_r)) + " Z"
        return f'<path d="{d}" fill="{fill}" stroke="{edge}" stroke-width="{edge_w}" stroke-linejoin="round"/>'

    out.append(poly(0, split, front))
    if split < n:
        out.append(poly(split - 1, n, back))
    if fork:
        (lx, ly), (rx, ry), (cx, cy) = lefts[-1], rights[-1], points[-1]
        xa, ya = points[-2]
        dx, dy = cx - xa, cy - ya
        ln = math.hypot(dx, dy) or 1
        ux, uy = dx / ln, dy / ln
        tail = back if split < n else front
        out.append(
            f'<path d="M{f(lx)} {f(ly)} L{f(lx + ux * width * 1.3)} {f(ly + uy * width * 1.3)} L{f(cx + ux * width * 0.35)} {f(cy + uy * width * 0.35)} '
            f'L{f(rx + ux * width * 1.3)} {f(ry + uy * width * 1.3)} L{f(rx)} {f(ry)} Z" fill="{tail}" stroke="{edge}" stroke-width="{edge_w}" stroke-linejoin="round"/>'
        )
    return "".join(out)
