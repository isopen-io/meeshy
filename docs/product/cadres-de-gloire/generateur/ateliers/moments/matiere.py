"""L'infiniment petit : noyaux, éléments forgés, éclats en traînée, réseaux d'atomes, toile cosmique."""

import math
import random

from base import W, H, f, pt, esc, SANS, CINZEL, FRAUNCES
from kit import halo, clip, circle_d, rrect, lgrad


def nucleus(card, cx, cy, r, seed, name="nu", glow="#BFF4FF"):
    """Un noyau d'atome : protons (rouges) et neutrons (gris-bleu) serrés en grappe, éclairés d'en haut."""
    rnd = random.Random(seed)
    pro = card.rgrad("nuc-p", [(0, "#FFE0D6", 1), (0.5, "#FF6A50", 1), (1, "#8A1A10", 1)], 0.35, 0.3, 0.75)
    neu = card.rgrad("nuc-n", [(0, "#FFFFFF", 1), (0.5, "#A8B8D8", 1), (1, "#3A4A6A", 1)], 0.35, 0.3, 0.75)
    balls = []
    k = 14
    for i in range(k):
        a = i * 137.5
        rr = r * 0.2 * math.sqrt(i)
        x, y = pt(cx, cy, rr, a)
        balls.append((y - rr * 0.3, f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.3)}" fill="{pro if rnd.random() < 0.5 else neu}"/>'))
    balls.sort(key=lambda b: -b[0])
    return halo(card, cx, cy, r * 2.4, glow, 0.5, name + "-h") + "".join(b for _, b in balls)


def element_tile(card, cx, cy, s, symbol, z, color, rot=0, name="el", trail_from=None):
    """Une case d'élément forgé, comme sur un tableau périodique : verre sombre, liseré de couleur, symbole et numéro."""
    x0, y0 = cx - s / 2, cy - s / 2
    tail = ""
    if trail_from:
        fx, fy = trail_from
        L = math.hypot(cx - fx, cy - fy)
        ux, uy = (cx - fx) / L, (cy - fy) / L
        tx, ty = cx - ux * s * 2.6, cy - uy * s * 2.6
        nx, ny = -uy * s * 0.42, ux * s * 0.42
        tg = card.def_once(name + "-tg", f'<linearGradient id="{card.id(name + "-tg")}" gradientUnits="userSpaceOnUse" x1="{f(tx)}" y1="{f(ty)}" x2="{f(cx)}" y2="{f(cy)}">'
                           f'<stop offset="0" stop-color="{color}" stop-opacity="0"/><stop offset="1" stop-color="{color}" stop-opacity="0.75"/></linearGradient>')
        tail = f'<path d="M{f(tx)} {f(ty)} L{f(cx + nx)} {f(cy + ny)} L{f(cx - nx)} {f(cy - ny)} Z" fill="{tg}" filter="{card.blur(name + "-tb", 2)}"/>'
    d = rrect(x0, y0, x0 + s, y0 + s, s * 0.14)
    glass = lgrad(card, "elg", [(0, "#FFFFFF", 0.28), (0.45, "#FFFFFF", 0.06), (1, "#FFFFFF", 0.0)], 0, 0, 1, 1)
    return (
        tail + f'<g transform="rotate({f(rot)} {f(cx)} {f(cy)})">'
        + halo(card, cx, cy, s * 1.1, color, 0.5, name + "-h")
        + f'<path d="{d}" fill="#0A0C24" opacity="0.82"/>'
        f'<path d="{d}" fill="{glass}"/>'
        f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(s * 0.05)}"/>'
        f'<text x="{f(x0 + s * 0.12)}" y="{f(y0 + s * 0.27)}" font-family="{SANS}" font-weight="800" font-size="{f(s * 0.2)}" fill="{color}">{z}</text>'
        f'<text x="{f(cx)}" y="{f(cy + s * 0.3)}" text-anchor="middle" font-family="{FRAUNCES}" font-weight="700" font-size="{f(s * 0.5)}" fill="#FFFFFF">{esc(symbol)}</text>'
        f'</g>'
    )


def comets(card, name, seed, n, center, rmin, rmax, avoid, colors, length=(14, 46), width=(1.2, 3.4)):
    """Des éclats projetés : une tête brillante et une traînée effilée qui pointe vers le cœur de l'explosion."""
    rnd = random.Random(seed)
    cx, cy = center
    body, heads = [], []
    for _ in range(n):
        a = rnd.uniform(0, 360)
        rr = rnd.uniform(rmin, rmax)
        x, y = pt(cx, cy, rr, a)
        if avoid[0] < x < avoid[2] and avoid[1] < y < avoid[3]:
            continue
        if not (-10 < x < W + 10 and -10 < y < H + 10):
            continue
        L = rnd.uniform(*length)
        w = rnd.uniform(*width)
        col = rnd.choice(colors)
        tx, ty = pt(cx, cy, rr - L, a)
        l, r = pt(x, y, w / 2, a - 90), pt(x, y, w / 2, a + 90)
        body.append(f'<path d="M{f(tx)} {f(ty)} L{f(l[0])} {f(l[1])} L{f(x + (x - tx) * 0.02)} {f(y + (y - ty) * 0.02)} L{f(r[0])} {f(r[1])} Z" fill="{col}" opacity="{f(rnd.uniform(0.45, 0.85))}"/>')
        heads.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(w * 0.6)}" fill="#FFFFFF"/>')
    return f'<g filter="{card.blur(name + "-g", 2.2)}">{"".join(body)}</g>{"".join(body)}<g filter="{card.blur(name + "-hg", 1.4)}">{"".join(heads)}</g>{"".join(heads)}'


def cosmic_web(card, name, seed, region, n=46, color="#FFB070", node="#FFE6C8", op=0.7):
    """La toile cosmique : des filaments de galaxies tendus entre des nœuds brillants (l'infiniment grand)."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    nodes = [(rnd.uniform(x0, x1), rnd.uniform(y0, y1), rnd.uniform(0.6, 1.4)) for _ in range(n)]
    fil, dots, blobs = [], [], []
    for i, (x, y, s) in enumerate(nodes):
        near = sorted(nodes, key=lambda p: (p[0] - x) ** 2 + (p[1] - y) ** 2)[1:4]
        for (px, py, _) in near[: rnd.choice((2, 3))]:
            mx, my = (x + px) / 2 + rnd.uniform(-10, 10), (y + py) / 2 + rnd.uniform(-10, 10)
            fil.append(f'<path d="M{f(x)} {f(y)} Q{f(mx)} {f(my)} {f(px)} {f(py)}" fill="none" stroke="{color}" stroke-width="{f(rnd.uniform(0.6, 1.6))}" opacity="{f(op * rnd.uniform(0.4, 0.9))}"/>')
            for _ in range(5):
                t = rnd.random()
                qx = (1 - t) ** 2 * x + 2 * (1 - t) * t * mx + t * t * px
                qy = (1 - t) ** 2 * y + 2 * (1 - t) * t * my + t * t * py
                dots.append(f'<circle cx="{f(qx + rnd.gauss(0, 1.5))}" cy="{f(qy + rnd.gauss(0, 1.5))}" r="{f(rnd.uniform(0.4, 1.1))}" fill="{node}" opacity="{f(rnd.uniform(0.4, 1))}"/>')
        blobs.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(2.2 * s)}" fill="{node}"/>')
    return (
        f'<g filter="{card.blur(name + "-fg", 2.4)}">{"".join(fil)}</g>{"".join(fil)}{"".join(dots)}'
        f'<g filter="{card.blur(name + "-ng", 3)}">{"".join(blobs)}</g>{"".join(blobs)}'
    )


def lattice(card, name, region, step=26, color="#8FD8FF", op=0.6, rot=0, center=None):
    """Un réseau d'atomes (graphène) : hexagones réguliers, un atome à chaque sommet (l'infiniment petit)."""
    x0, y0, x1, y1 = region
    h = step * math.sqrt(3) / 2
    edges, atoms = [], []
    cx, cy = center or ((x0 + x1) / 2, (y0 + y1) / 2)
    j = 0
    y = y0 - h
    while y < y1 + h:
        x = x0 - step * 2 + (step * 1.5 if j % 2 else 0)
        while x < x1 + step * 2:
            hexpts = [(x + step * math.cos(math.radians(60 * k)), y + step * math.sin(math.radians(60 * k))) for k in range(6)]
            for k in range(6):
                a, b = hexpts[k], hexpts[(k + 1) % 6]
                edges.append(f'M{f(a[0])} {f(a[1])} L{f(b[0])} {f(b[1])}')
            atoms.extend(hexpts)
            x += step * 3
        y += h
        j += 1
    uniq = {(round(px, 1), round(py, 1)) for px, py in atoms}
    dots = "".join(f'<circle cx="{f(px)}" cy="{f(py)}" r="2.2" fill="{color}"/>' for px, py in uniq)
    return (
        f'<g transform="rotate({rot} {f(cx)} {f(cy)})" opacity="{op}"><path d="{" ".join(edges)}" fill="none" stroke="{color}" stroke-width="0.9"/>'
        f'<g filter="{card.blur(name + "-ag", 1.6)}">{dots}</g>{dots}</g>'
    )
