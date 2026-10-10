"""Les constructions aux deux infinis : des pièces d'architecture de l'Empire céleste faites de la matière de l'infime
(réseau cristallin, double hélice, givre dendritique) et ouvertes sur l'immense (ciel étoilé, astérismes)."""

import math
import random

from cosmos import *  # noqa: F401,F403


def ellipse_pts(cx, cy, rx, ry, n=240, a0=0.0):
    """Points d'une ellipse, sens horaire depuis midi, fermée (le dernier point répète le premier)."""
    return [(cx + rx * math.sin(a0 + 2 * math.pi * i / n), cy - ry * math.cos(a0 + 2 * math.pi * i / n)) for i in range(n + 1)]


def helix_along(card, pts, turns, w, cols=("#7FD8FF", "#FF9AD5"), rungs=("#FFE27A", "#7AF0B0", "#FF8A8A", "#9FA8FF"),
                lw=2.2, n=360, glow=None, op=1.0, rung_every=3, dense=False, phase=0.0):
    """Double hélice d'ADN qui suit une courbe quelconque : brins avant/arrière, barreaux de bases, halo optionnel."""
    sp, _ = resample(pts, n) if dense else spine(pts, n)
    s1, s2 = [], []
    for i, (x, y, a) in enumerate(sp):
        t = i / (n - 1)
        ph = phase + t * turns * 2 * math.pi
        nx, ny = -math.sin(a), math.cos(a)
        s1.append((x + nx * math.sin(ph) * w, y + ny * math.sin(ph) * w, math.cos(ph)))
        s2.append((x - nx * math.sin(ph) * w, y - ny * math.sin(ph) * w, -math.cos(ph)))
    out = []
    if glow:
        out.append(f'<path d="{poly_d([(x, y) for x, y, _ in sp], False)}" fill="none" stroke="{glow}" stroke-width="{fmt(w * 3.2)}" '
                   f'opacity="0.32" stroke-linecap="round" filter="{card.blur("hx-glow", w * 0.9)}"/>')
    back, front = [], []
    for strand, col in ((s1, cols[0]), (s2, cols[1])):
        for i in range(n - 1):
            a, b = strand[i], strand[i + 1]
            seg = f'<line x1="{fmt(a[0])}" y1="{fmt(a[1])}" x2="{fmt(b[0])}" y2="{fmt(b[1])}" stroke="{{c}}" stroke-width="{{w}}" stroke-linecap="round"/>'
            if a[2] + b[2] > 0:
                front.append(seg.replace("{c}", col).replace("{w}", fmt(lw * 1.15)))
            else:
                back.append(seg.replace("{c}", mix(col, "#05040F", 0.5)).replace("{w}", fmt(lw * 0.8)))
    rg = []
    for i in range(0, n, rung_every):
        a, b = s1[i], s2[i]
        if math.dist(a[:2], b[:2]) < w * 0.25:
            continue
        rg.append(f'<line x1="{fmt(a[0])}" y1="{fmt(a[1])}" x2="{fmt(b[0])}" y2="{fmt(b[1])}" stroke="{rungs[(i // rung_every) % len(rungs)]}" '
                  f'stroke-width="{fmt(lw * 0.7)}" opacity="0.75"/>')
    out.append("".join(back) + "".join(rg) + "".join(front))
    return f'<g opacity="{fmt(op)}">{"".join(out)}</g>'


def lattice(card, name, r, line="#BFE6FF", node="#FFFFFF", lw=0.7, node_r=None, bg=None, halo=0.35):
    """Réseau cristallin en nid d'abeille (le graphène, la glace) : liaisons fines, un atome lumineux à chaque nœud."""
    w = r * math.sqrt(3)
    h = r * 3
    centers = ((0, 0), (w, 0), (w / 2, 1.5 * r), (0, 3 * r), (w, 3 * r))

    def verts(cx, cy):
        return [(cx + r * math.sin(math.radians(60 * i)), cy - r * math.cos(math.radians(60 * i))) for i in range(6)]

    d = " ".join("M" + " L".join(f"{fmt(x)} {fmt(y)}" for x, y in verts(cx, cy)) + "Z" for cx, cy in centers)
    nr = node_r or r * 0.2
    nodes = "".join(f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(nr * 2.4)}" fill="{node}" opacity="{halo * 0.45}"/>'
                    f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(nr)}" fill="{node}"/>' for cx, cy in centers for x, y in verts(cx, cy))
    b = f'<rect width="{fmt(w)}" height="{fmt(h)}" fill="{bg}"/>' if bg else ""
    card.def_once(name, f'<pattern id="{card.id(name)}" width="{fmt(w)}" height="{fmt(h)}" patternUnits="userSpaceOnUse">{b}'
                        f'<path d="{d}" fill="none" stroke="{line}" stroke-width="{lw}"/>{nodes}</pattern>')
    return f"url(#{card.id(name)})"


def frost(seeds, color="#EEF7FF", lw=1.5, seed=1, avoid=None, decay=0.72):
    """Givre dendritique : chaque germe pousse une aiguille qui se ramifie à 60°, comme la glace sur une vitre.
    `seeds` = [(x, y, angle en degrés, longueur, profondeur)] ; `avoid(x, y)` arrête une aiguille qui entrerait dans le visage."""
    rnd = random.Random(seed)
    segs = []

    def arm(x, y, a, L, d, w):
        steps = 6
        px, py = x, y
        for k in range(1, steps + 1):
            nx_, ny_ = x + math.cos(a) * L * k / steps, y + math.sin(a) * L * k / steps
            if avoid and avoid(nx_, ny_):
                break
            segs.append((px, py, nx_, ny_, w * (1 - 0.5 * k / steps)))
            px, py = nx_, ny_
        else:
            k = steps
        reach = k / steps
        if d == 0 or reach < 0.3:
            return
        for t in (0.22, 0.42, 0.6, 0.78):
            if t > reach:
                break
            bx, by = x + math.cos(a) * L * t, y + math.sin(a) * L * t
            for side in (-1, 1):
                if rnd.random() < 0.82:
                    arm(bx, by, a + side * math.pi / 3, L * (0.5 - 0.42 * t) * rnd.uniform(0.85, 1.15), d - 1, w * decay)

    for x, y, ang, L, d in seeds:
        arm(x, y, math.radians(ang), L, d, lw)
    lines = "".join(f'<line x1="{fmt(a)}" y1="{fmt(b)}" x2="{fmt(c)}" y2="{fmt(e)}" stroke-width="{fmt(max(0.35, w))}"/>' for a, b, c, e, w in segs)
    return f'<g stroke="{color}" stroke-linecap="round" fill="none">{lines}</g>'


def asterism(pts, edges, color="#E9F0FF", glow="#9FC8FF", r=2.0, lw=0.8, line_op=0.5, mags=None, label=None, label_at=None, font=None):
    """Astérisme : étoiles de magnitudes diverses (halo + éclat), tracé fin, nom gravé en capitales."""
    out = [f'<path d="{" ".join(f"M{fmt(pts[a][0])} {fmt(pts[a][1])} L{fmt(pts[b][0])} {fmt(pts[b][1])}" for a, b in edges)}" '
           f'stroke="{color}" stroke-width="{lw}" opacity="{line_op}" fill="none"/>']
    for i, (x, y) in enumerate(pts):
        m = mags[i] if mags else 1.0
        rr = r * m
        out.append(f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(rr * 3.2)}" fill="{glow}" opacity="0.16"/>'
                   f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(rr)}" fill="#FFFFFF"/>')
        if m >= 1.5:
            out.append(sparkle(x, y, rr * 4.2, "#FFFFFF", 0.85))
    if label and label_at:
        out.append(f'<text x="{fmt(label_at[0])}" y="{fmt(label_at[1])}" text-anchor="middle" font-family="{font or CINZEL}" font-size="8.5" '
                   f'letter-spacing="2.2" fill="{color}" opacity="0.75">{esc(label)}</text>')
    return "".join(out)


def gu_spirals(card, d_outer, d_inner, cx, cy, rx0, ry0, rx1, ry1, color="#E8FFF4", n_rings=2, per=26, s=5.0, op=0.75, seed=3):
    """Les grains du disque de jade bi (guwen) : de petites spirales en relief — vues de loin, des galaxies."""
    rnd = random.Random(seed)
    out = []
    for k in range(n_rings):
        t = (k + 0.5) / n_rings
        rx, ry = lerp(rx0, rx1, t), lerp(ry0, ry1, t)
        cnt = per + k * 6
        for i in range(cnt):
            a = 2 * math.pi * (i + 0.5 * (k % 2)) / cnt
            x, y = cx + rx * math.sin(a), cy - ry * math.cos(a)
            rot = math.degrees(a) + rnd.uniform(-30, 30)
            sp = spiral_pts(0, 0, 0.6, s, 0, 1.5, 22)
            out.append(f'<g transform="translate({fmt(x)} {fmt(y)}) rotate({fmt(rot)})">'
                       f'<path d="{poly_d(sp, False)}" fill="none" stroke="#062A1E" stroke-width="2.4" opacity="0.35" transform="translate(0.6 0.9)"/>'
                       f'<path d="{poly_d(sp, False)}" fill="none" stroke="{color}" stroke-width="1.5" stroke-linecap="round"/>'
                       f'<circle r="{fmt(s * 0.32)}" fill="{color}"/></g>')
    return f'<g opacity="{op}">{"".join(out)}</g>'


def star_body(sp, rnd, spread=8, every=1, rmax=1.8, color="#FFFFFF"):
    """Une poussière d'étoiles le long d'un corps (spline échantillonnée)."""
    return "".join(f'<circle cx="{fmt(x + rnd.gauss(0, spread))}" cy="{fmt(y + rnd.gauss(0, spread))}" r="{fmt(rnd.uniform(0.4, rmax))}" fill="{color}" '
                   f'opacity="{fmt(rnd.uniform(0.45, 1))}"/>' for x, y, _ in sp[::every])
