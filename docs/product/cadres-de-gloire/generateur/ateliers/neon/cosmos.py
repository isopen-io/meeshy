"""Atelier « Néon » : l'immense et l'infime, en fil de néon.

Constellations, galaxie en fil, trou noir et anneaux, quasar-laser, supernova, toile cosmique, nébuleuses ;
atome et orbitales, double hélice, neurone, molécules, cellule, pollen, flocon de Koch, géométrie sacrée,
polyèdre holographique, noyau, quarks, traces de particules, cordes, mousse quantique.
"""

import math
import random

from kit import *  # noqa: F401,F403


PHI = (1 + 5 ** 0.5) / 2


# ---------------------------------------------------------------- l'immense

def constellation(card, pts, edges, color, w=1.3, halo=5, star_r=None, op=0.95):
    geo = "".join(f'<line x1="{f(pts[a][0])}" y1="{f(pts[a][1])}" x2="{f(pts[b][0])}" y2="{f(pts[b][1])}"/>' for a, b in edges)
    out = [tube(card, geo, color, w, halo, op=op)]
    for i, (x, y) in enumerate(pts):
        r = (star_r[i] if star_r else 1.6)
        out.append(star(card, x, y, r, light(color, 0.4)))
    return "".join(out)


def nebula_cloud(card, cx, cy, rx, ry, c1, c2, op=0.8, seed=3, freq=0.012, disp=60, rot=0):
    name = nid("neb")
    card.def_once(name + "f", f'<filter id="{card.id(name + "f")}" filterUnits="userSpaceOnUse" x="-100" y="-100" width="740" height="1160" color-interpolation-filters="sRGB">'
                              f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="4" seed="{seed}" result="t"/>'
                              f'<feDisplacementMap in="SourceGraphic" in2="t" scale="{disp}" xChannelSelector="R" yChannelSelector="G" result="d"/>'
                              f'<feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.4 0 0 0 -0.6" result="ta"/>'
                              f'<feComposite in="d" in2="ta" operator="in" result="c"/><feGaussianBlur in="c" stdDeviation="2"/></filter>')
    g = card.rgrad(name + "g", [(0, c1, op), (0.45, c2, op * 0.7), (1, c2, 0)])
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{g}" filter="url(#{card.id(name + "f")})" transform="rotate({rot} {f(cx)} {f(cy)})"/>'


def galaxy_wire(card, cx, cy, r, arms=2, turns=1.15, tilt=0.55, rot=0, angle=0, colors=(MAGENTA, CYAN), strands=3, w=1.3,
                halo=5, r0=0.1, dots=140, seed=5, core=WHITE, spread=0.16, op=1.0):
    """Une galaxie spirale dessinée en fil de néon : chaque bras est une gerbe de tubes."""
    rnd = random.Random(seed)
    b = math.log(1 / r0) / (turns * 2 * math.pi)
    out = []
    dot_m = []
    for a in range(arms):
        geo = []
        for s in range(strands):
            off = (s - (strands - 1) / 2) * spread
            pts = []
            for i in range(90):
                th = i / 89 * turns * 2 * math.pi
                rr = r0 * r * math.exp(b * th) * (1 + off * 0.5)
                ang = th + rot + a * 2 * math.pi / arms + off
                pts.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang) * tilt))
            geo.append('<path d="M' + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + '"/>')
        col = colors[a % len(colors)]
        out.append(tube(card, "".join(geo[1:2]), col, w * 1.3, halo))
        out.append(tube(card, "".join(geo[:1] + geo[2:]), col, w * 0.7, halo * 0.6, op=0.75))
        for _ in range(dots // arms):
            th = rnd.uniform(0, turns * 2 * math.pi)
            rr = r0 * r * math.exp(b * th) * rnd.uniform(0.85, 1.15)
            ang = th + rot + a * 2 * math.pi / arms + rnd.gauss(0, 0.12)
            x, y = cx + rr * math.cos(ang), cy + rr * math.sin(ang) * tilt
            dot_m.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(0.4, 1.4))}" fill="{rnd.choice(("#FFFFFF", light(col, 0.5)))}" opacity="{f(rnd.uniform(0.4, 1))}"/>')
    core_m = (glow_spot(card, cx, cy, r * 0.42, r * 0.42 * tilt, core, 0.95) + glow_spot(card, cx, cy, r * 0.75, r * 0.75 * tilt, colors[0], 0.45)
              + f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 0.06)}" ry="{f(r * 0.06 * tilt)}" fill="#FFFFFF"/>')
    return f'<g opacity="{op}" transform="rotate({angle} {f(cx)} {f(cy)})">{core_m}{"".join(out)}{"".join(dot_m)}</g>'


def black_hole(card, cx, cy, r, rx, ry, colors=(ORANGE, YELLOW, MAGENTA, CYAN), rings=4, angle=0, w=2.0, lens=True, glow=0.75):
    """Un trou noir cerné d'anneaux de lumière : moitié arrière du disque, ombre et anneau de photons, arc lentillé, moitié avant."""
    back, front = [], []
    for i in range(rings):
        k = 1 + i * 0.16
        back.append((f'<path d="M{f(cx - rx * k)} {f(cy)} A{f(rx * k)} {f(ry * k)} 0 0 1 {f(cx + rx * k)} {f(cy)}"/>', colors[i % len(colors)]))
        front.append((f'<path d="M{f(cx - rx * k)} {f(cy)} A{f(rx * k)} {f(ry * k)} 0 0 0 {f(cx + rx * k)} {f(cy)}"/>', colors[i % len(colors)]))
    out = [glow_spot(card, cx, cy, rx * 1.4, rx * 0.7, colors[0], glow * 0.6), glow_spot(card, cx, cy, r * 2.4, r * 2.4, colors[1], glow * 0.5)]
    out += [tube(card, g, c, w * (1 - i * 0.15), 7, op=0.9 - i * 0.12) for i, (g, c) in enumerate(back)]
    if lens:
        out.append(tube(card, f'<path d="M{f(cx - r * 1.5)} {f(cy)} A{f(r * 1.5)} {f(r * 1.45)} 0 0 1 {f(cx + r * 1.5)} {f(cy)}"/>', colors[1], w * 0.9, 6, op=0.95))
        out.append(tube(card, f'<path d="M{f(cx - r * 1.32)} {f(cy)} A{f(r * 1.32)} {f(r * 1.2)} 0 0 0 {f(cx + r * 1.32)} {f(cy)}"/>', colors[0], w * 0.6, 4, op=0.7))
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="#000000"/>')
    out.append(tube(card, f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.04)}"/>', light(colors[1], 0.3), w * 0.8, 6))
    out += [tube(card, g, c, w * (1.1 - i * 0.15), 7, op=0.95 - i * 0.12) for i, (g, c) in enumerate(front)]
    return f'<g transform="rotate({angle} {f(cx)} {f(cy)})">{"".join(out)}</g>'


def quasar(card, cx, cy, L, angle, color=CYAN, w=7, core="#FFFFFF", glow=1.0, L2=None):
    """Un quasar : un cœur aveuglant et deux jets relativistes comme des faisceaux laser."""
    L2 = L2 or L
    name = nid("qz")
    g = lgrad(card, name, [(0, color, 0), (0.42, color, 0.9), (0.5, "#FFFFFF", 1), (0.58, color, 0.9), (1, color, 0)], user=(cx - L2, 0, cx + L, 0))
    beam = (f'<path d="M{f(cx - L2)} {f(cy)} L{f(cx)} {f(cy - w)} L{f(cx + L)} {f(cy)} L{f(cx)} {f(cy + w)}Z" fill="{g}" filter="{ublur(card, 2)}"/>'
            f'<path d="M{f(cx - L2)} {f(cy)} L{f(cx)} {f(cy - w * 3)} L{f(cx + L)} {f(cy)} L{f(cx)} {f(cy + w * 3)}Z" fill="{g}" opacity="0.4" filter="{ublur(card, 9)}"/>'
            f'<line x1="{f(cx - L2 * 0.8)}" y1="{f(cy)}" x2="{f(cx + L * 0.8)}" y2="{f(cy)}" stroke="#FFFFFF" stroke-width="1" opacity="0.9"/>')
    knots = "".join(f'<ellipse cx="{f(cx + s * L * t)}" cy="{f(cy)}" rx="{f(6 * (1 - t))}" ry="{f(3 * (1 - t))}" fill="#FFFFFF" opacity="{f(0.8 * (1 - t))}" filter="{ublur(card, 1.2)}"/>' for s in (-1, 1) for t in (0.18, 0.33, 0.52))
    heart = (glow_spot(card, cx, cy, 70 * glow, 70 * glow, color, 0.8) + glow_spot(card, cx, cy, 28, 28, core, 1)
             + sparkle(cx, cy, 34, "#FFFFFF", 0.95) + f'<circle cx="{f(cx)}" cy="{f(cy)}" r="4" fill="#FFFFFF"/>')
    disk = tube(card, f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="9" ry="26"/>', light(color, 0.2), 1.4, 5)
    return f'<g transform="rotate({angle} {f(cx)} {f(cy)})">{beam}{knots}{disk}</g>{heart}'


def supernova(card, cx, cy, r, colors=(MAGENTA, YELLOW, CYAN, ORANGE), seed=7, n=44):
    rnd = random.Random(seed)
    spikes = []
    for i in range(n):
        a = i * 360 / n + rnd.uniform(-3, 3)
        L = r * rnd.uniform(0.55, 1.15)
        x1, y1 = pt(cx, cy, r * 0.18, a)
        x2, y2 = pt(cx, cy, L, a)
        spikes.append((f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}"/>', colors[i % len(colors)]))
    out = [glow_spot(card, cx, cy, r * 1.3, r * 1.3, colors[0], 0.55), glow_spot(card, cx, cy, r * 0.55, r * 0.55, colors[1], 0.9)]
    by_col = {}
    for g, c in spikes:
        by_col.setdefault(c, []).append(g)
    out += [tube(card, "".join(gs), c, 0.9, 4, op=0.8) for c, gs in by_col.items()]
    for k, (rr, c) in enumerate(((r * 0.62, CYAN), (r * 0.9, MAGENTA), (r * 1.18, VIOLET))):
        out.append(tube(card, f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(rr)}"/>', c, 1.2 - k * 0.2, 5, op=0.75 - k * 0.15, dash=f"{f(rr * 0.3)} {f(rr * 0.08)}"))
    out.append(glow_spot(card, cx, cy, r * 0.22, r * 0.22, "#FFFFFF", 1))
    return "".join(out)


def cosmic_web(card, seed, x0, y0, x1, y1, n=14, color=VIOLET, node=PINK, k=2, w=1.0, op=1.0):
    rnd = random.Random(seed)
    nodes = [(rnd.uniform(x0, x1), rnd.uniform(y0, y1)) for _ in range(n)]
    edges = set()
    for i, (ax, ay) in enumerate(nodes):
        near = sorted(range(n), key=lambda j: (nodes[j][0] - ax) ** 2 + (nodes[j][1] - ay) ** 2)[1:k + 1 + rnd.randint(0, 1)]
        for j in near:
            edges.add(tuple(sorted((i, j))))
    geo = []
    for i, j in edges:
        (ax, ay), (bx, by) = nodes[i], nodes[j]
        mx, my = (ax + bx) / 2 + rnd.uniform(-14, 14), (ay + by) / 2 + rnd.uniform(-14, 14)
        geo.append(f'<path d="M{f(ax)} {f(ay)} Q{f(mx)} {f(my)} {f(bx)} {f(by)}"/>')
    g = "".join(geo)
    out = [f'<g fill="none" stroke="{color}" stroke-width="7" opacity="0.35" filter="{ublur(card, 5)}">{g}</g>', tube(card, g, color, w, 3, op=0.85)]
    for x, y in nodes:
        s = rnd.uniform(0.8, 1.8)
        out.append(glow_spot(card, x, y, 10 * s, 10 * s, node, 0.8))
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(1.4 * s)}" fill="#FFFFFF"/>')
    return f'<g opacity="{op}">{"".join(out)}</g>'


def cluster(card, seed, cx, cy, r, n=22, colors=("#FFE6B0", "#BFE9FF", "#FFC2EC")):
    """Un amas de galaxies : de petites ellipses lumineuses, inclinées au hasard."""
    rnd = random.Random(seed)
    out = [glow_spot(card, cx, cy, r * 1.2, r * 1.2, VIOLET, 0.35)]
    for _ in range(n):
        a = rnd.uniform(0, 360)
        d = r * rnd.random() ** 0.6
        x, y = pt(cx, cy, d, a)
        s = rnd.uniform(1.5, 5)
        col = rnd.choice(colors)
        out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(s * 1.8)}" ry="{f(s * 0.7)}" fill="{col}" opacity="0.5" filter="{ublur(card, 1.5)}" transform="rotate({f(rnd.uniform(0, 180))} {f(x)} {f(y)})"/>')
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(s * 0.35)}" fill="#FFFFFF"/>')
    return "".join(out)


def planet(card, cx, cy, r, c1, c2, ring=None, ring_tilt=-14, ring_rx=None):
    g = card.rgrad(nid("pl"), [(0, light(c1, 0.3), 1), (0.7, c1, 1), (1, c2, 1)], 0.35, 0.3, 0.75)
    out = []
    if ring:
        rx = ring_rx or r * 2
        out.append(tube(card, f'<path d="M{f(cx - rx)} {f(cy)} A{f(rx)} {f(rx * 0.26)} 0 0 1 {f(cx + rx)} {f(cy)}"/>', ring, 1.3, 4, op=0.8).replace("<g fill", f'<g transform="rotate({ring_tilt} {f(cx)} {f(cy)})"><g fill', 1) + "</g>")
    out.append(glow_spot(card, cx, cy, r * 1.8, r * 1.8, c1, 0.35))
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/>')
    out.append(tube(card, f'<path d="{arc_d(cx, cy, r, -120, 40)}"/>', light(c1, 0.4), 0.9, 3, op=0.8))
    if ring:
        rx = ring_rx or r * 2
        out.append(tube(card, f'<path d="M{f(cx - rx)} {f(cy)} A{f(rx)} {f(rx * 0.26)} 0 0 0 {f(cx + rx)} {f(cy)}"/>', ring, 1.6, 4).replace("<g fill", f'<g transform="rotate({ring_tilt} {f(cx)} {f(cy)})"><g fill', 1) + "</g>")
    return "".join(out)


# ---------------------------------------------------------------- l'infime

def atom(card, cx, cy, rx, ry, n=3, colors=(MAGENTA, CYAN, YELLOW), w=1.5, rot0=0, nucleus_r=None, electrons=True, halo=5, op=1.0):
    out = []
    for i in range(n):
        a = rot0 + i * 180 / n
        out.append(tube(card, f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" transform="rotate({f(a)} {f(cx)} {f(cy)})"/>', colors[i % len(colors)], w, halo, op=op))
        if electrons:
            t = math.radians(40 + i * 97)
            ex, ey = rx * math.cos(t), ry * math.sin(t)
            ra = math.radians(a)
            x = cx + ex * math.cos(ra) - ey * math.sin(ra)
            y = cy + ex * math.sin(ra) + ey * math.cos(ra)
            out.append(bulb(card, x, y, max(1.6, w * 1.3), light(colors[i % len(colors)], 0.3), op))
    if nucleus_r:
        out.append(nucleus(card, cx, cy, nucleus_r, 9, seed=int(cx + cy)))
    return "".join(out)


def nucleus(card, cx, cy, r, n=14, seed=3, cols=(("#FF5FC8", "#8A0F6A"), ("#5FE8FF", "#0D5E86"))):
    rnd = random.Random(seed)
    balls = []
    for i in range(n):
        a = rnd.uniform(0, 2 * math.pi)
        d = r * 0.62 * rnd.random() ** 0.5
        z = rnd.uniform(-1, 1)
        balls.append((z, cx + d * math.cos(a), cy + d * math.sin(a), i % 2))
    balls.sort()
    out = [glow_spot(card, cx, cy, r * 2.2, r * 2.2, MAGENTA, 0.45)]
    for z, x, y, k in balls:
        hi, lo = cols[k]
        g = card.rgrad(f"nuc{k}", [(0, "#FFFFFF", 1), (0.35, hi, 1), (1, lo, 1)], 0.35, 0.32, 0.7)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.36)}" fill="{g}"/>')
    return "".join(out)


def quarks(card, cx, cy, r, w=1.2):
    """Trois quarks (rouge, vert, bleu — la « couleur » de l'interaction forte) liés par des gluons en ressort."""
    pts = [pt(cx, cy, r, a) for a in (0, 120, 240)]
    cols = ("#FF3B5C", "#3BFF8A", "#3B8BFF")
    springs = []
    for i in range(3):
        (ax, ay), (bx, by) = pts[i], pts[(i + 1) % 3]
        L = math.hypot(bx - ax, by - ay)
        ux, uy = (bx - ax) / L, (by - ay) / L
        nx, ny = -uy, ux
        p = []
        for k in range(61):
            t = k / 60
            off = math.sin(t * math.pi * 14) * 3.2 * math.sin(math.pi * t)
            p.append(f"{f(ax + ux * L * t + nx * off)} {f(ay + uy * L * t + ny * off)}")
        springs.append('<path d="M' + " L".join(p) + '"/>')
    out = [glow_spot(card, cx, cy, r * 2, r * 2, VIOLET, 0.5), tube(card, "".join(springs), YELLOW, w, 3, op=0.85)]
    for (x, y), c in zip(pts, cols):
        out.append(bulb(card, x, y, r * 0.24, c))
    return "".join(out)


def helix(card, x, y0, y1, amp, period, c1=MAGENTA, c2=CYAN, rung=(YELLOW, LIME, PINK, CYAN), phase=0, w=1.7, halo=5, horizontal=False, op=1.0):
    """La double hélice de l'ADN : deux brins de néon et leurs paires de bases."""
    def P(u, v):
        return (v, u) if horizontal else (u, v)
    a, b, rungs = [], [], []
    n = int(abs(y1 - y0) / 2)
    for i in range(n + 1):
        y = y0 + (y1 - y0) * i / n
        th = 2 * math.pi * (y - y0) / period + phase
        a.append(P(x + amp * math.sin(th), y))
        b.append(P(x + amp * math.sin(th + math.pi), y))
    k = 0
    y = y0 + period / 16
    while y < y1:
        th = 2 * math.pi * (y - y0) / period + phase
        xa, xb = x + amp * math.sin(th), x + amp * math.sin(th + math.pi)
        xm = (xa + xb) / 2
        c = rung[k % len(rung)]
        c_ = rung[(k + 2) % len(rung)]
        (p1x, p1y), (pmx, pmy), (p2x, p2y) = P(xa, y), P(xm, y), P(xb, y)
        rungs.append(f'<line x1="{f(p1x)}" y1="{f(p1y)}" x2="{f(pmx)}" y2="{f(pmy)}" stroke="{c}"/><line x1="{f(pmx)}" y1="{f(pmy)}" x2="{f(p2x)}" y2="{f(p2y)}" stroke="{c_}"/>')
        y += period / 9
        k += 1
    da = "M" + " L".join(f"{f(px)} {f(py)}" for px, py in a)
    db = "M" + " L".join(f"{f(px)} {f(py)}" for px, py in b)
    r = "".join(rungs)
    return (f'<g opacity="{op}"><g stroke-width="1.6" opacity="0.85" stroke-linecap="round">{r}</g>'
            f'<g stroke-width="4" opacity="0.4" filter="{ublur(card, 3)}">{r}</g>'
            + tube(card, f'<path d="{da}"/>', c1, w, halo) + tube(card, f'<path d="{db}"/>', c2, w, halo) + "</g>")


def neuron(card, seed, cx, cy, r, color=CYAN, axon_to=None, w=1.2, n=6, soma=None):
    """Un neurone : corps cellulaire, dendrites ramifiées, axone et ses boutons synaptiques."""
    rnd = random.Random(seed)
    geo = []
    tips = []

    def branch(x, y, ang, ln, depth):
        ex, ey = pt(x, y, ln, ang)
        bend = rnd.uniform(-18, 18)
        mx, my = pt(x, y, ln * 0.5, ang + bend)
        geo.append(f'<path d="M{f(x)} {f(y)} Q{f(mx)} {f(my)} {f(ex)} {f(ey)}"/>')
        if depth > 0:
            for da in (-rnd.uniform(18, 34), rnd.uniform(18, 34)):
                branch(ex, ey, ang + da, ln * rnd.uniform(0.55, 0.72), depth - 1)
        else:
            tips.append((ex, ey))

    for i in range(n):
        a = i * 360 / n + rnd.uniform(-15, 15)
        sx, sy = pt(cx, cy, r * 0.14, a)
        branch(sx, sy, a, r * rnd.uniform(0.32, 0.42), 2)
    bout = []
    if axon_to:
        tx, ty = axon_to
        mx, my = (cx + tx) / 2 + rnd.uniform(-30, 30), (cy + ty) / 2 + rnd.uniform(-30, 30)
        geo.append(f'<path d="M{f(cx)} {f(cy)} Q{f(mx)} {f(my)} {f(tx)} {f(ty)}"/>')
        for k in range(4):
            a = rnd.uniform(0, 360)
            bx, by = pt(tx, ty, rnd.uniform(10, 18), a)
            geo.append(f'<path d="M{f(tx)} {f(ty)} L{f(bx)} {f(by)}"/>')
            bout.append((bx, by))
    out = [tube(card, "".join(geo), color, w, 4)]
    sr = soma or r * 0.13
    out.append(glow_spot(card, cx, cy, sr * 3, sr * 3, color, 0.7))
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(sr)}" fill="{dark(color, 0.55)}"/>')
    out.append(tube(card, f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(sr)}"/>', color, w * 1.2, 4))
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(sr * 0.4)}" fill="{light(color, 0.6)}"/>')
    out += [bulb(card, x, y, 1.8, light(color, 0.3)) for x, y in bout]
    out += [f'<circle cx="{f(x)}" cy="{f(y)}" r="1.1" fill="{light(color, 0.6)}"/>' for x, y in tips[::2]]
    return "".join(out)


def hexagon_pts(cx, cy, s, rot=0):
    return [pt(cx, cy, s, rot + 30 + 60 * i) for i in range(6)]


def molecule(card, cx, cy, s, rings=((0, 0), (1, 0)), color=LIME, atoms=MAGENTA, w=1.3, rot=0, side=True):
    """Une molécule aromatique : cycles hexagonaux fusionnés, doubles liaisons, quelques atomes en bout de chaîne."""
    geo = []
    vertices = {}
    h = s * math.sqrt(3)
    for i, (q, r) in enumerate(rings):
        ox = cx + h * (q + r * 0.5)
        oy = cy + s * 1.5 * r
        pts = hexagon_pts(ox, oy, s, rot)
        geo.append("<path d=\"M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + 'Z"/>')
        for k in (0, 2, 4):
            (ax, ay), (bx, by) = pts[k], pts[(k + 1) % 6]
            mx, my = (ax + bx) / 2, (ay + by) / 2
            ix, iy = ax + (ox - mx) * 0.22, ay + (oy - my) * 0.22
            jx, jy = bx + (ox - mx) * 0.22, by + (oy - my) * 0.22
            geo.append(f'<line x1="{f(ix + (jx - ix) * 0.15)}" y1="{f(iy + (jy - iy) * 0.15)}" x2="{f(ix + (jx - ix) * 0.85)}" y2="{f(iy + (jy - iy) * 0.85)}"/>')
        for x, y in pts:
            vertices[(round(x), round(y))] = (x, y)
    out = [tube(card, "".join(geo), color, w, 4)]
    if side:
        vs = sorted(vertices.values(), key=lambda p: (p[1], p[0]))
        ends = [vs[0], vs[-1]]
        for x, y in ends:
            ex, ey = x + (x - cx) * 0.35, y + (y - cy) * 0.35
            out.append(tube(card, f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(ex)}" y2="{f(ey)}"/>', color, w, 3))
            out.append(bulb(card, ex, ey, 3, atoms))
    return "".join(out)


def koch_d(cx, cy, r, depth=3, rot=0):
    pts = [pt(cx, cy, r, rot + a) for a in (0, 120, 240)]
    pts.append(pts[0])
    for _ in range(depth):
        new = []
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            dx, dy = (bx - ax) / 3, (by - ay) / 3
            p1 = (ax + dx, ay + dy)
            p3 = (ax + 2 * dx, ay + 2 * dy)
            ang = math.atan2(dy, dx) - math.pi / 3
            L = math.hypot(dx, dy)
            p2 = (p1[0] + L * math.cos(ang), p1[1] + L * math.sin(ang))
            new += [(ax, ay), p1, p2, p3]
        new.append(pts[-1])
        pts = new
    return "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + "Z"


def snowflake_geo(cx, cy, r, rot=0):
    """Un flocon à six branches, ramifié (le cristal de glace)."""
    geo = []
    for i in range(6):
        a = rot + i * 60
        x1, y1 = pt(cx, cy, r, a)
        geo.append(f'<line x1="{f(cx)}" y1="{f(cy)}" x2="{f(x1)}" y2="{f(y1)}"/>')
        for t, L in ((0.35, 0.3), (0.6, 0.24), (0.82, 0.14)):
            bx, by = pt(cx, cy, r * t, a)
            for s in (-1, 1):
                ex, ey = pt(bx, by, r * L, a + s * 55)
                geo.append(f'<line x1="{f(bx)}" y1="{f(by)}" x2="{f(ex)}" y2="{f(ey)}"/>')
    geo.append("<path d=\"M" + " L".join(f"{f(x)} {f(y)}" for x, y in hexagon_pts(cx, cy, r * 0.18, rot)) + 'Z"/>')
    return "".join(geo)


def sierpinski_geo(cx, cy, r, depth=4):
    out = []

    def tri(a, b, c, d):
        if d == 0:
            out.append(f'<path d="M{f(a[0])} {f(a[1])} L{f(b[0])} {f(b[1])} L{f(c[0])} {f(c[1])}Z"/>')
            return
        ab = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        bc = ((b[0] + c[0]) / 2, (b[1] + c[1]) / 2)
        ca = ((c[0] + a[0]) / 2, (c[1] + a[1]) / 2)
        tri(a, ab, ca, d - 1)
        tri(ab, b, bc, d - 1)
        tri(ca, bc, c, d - 1)

    tri(pt(cx, cy, r, 0), pt(cx, cy, r, 120), pt(cx, cy, r, 240), depth)
    return "".join(out)


def flower_geo(cx, cy, r, rings=1):
    centers = {(0.0, 0.0)}
    for ring in range(1, rings + 1):
        for i in range(6):
            a = math.radians(60 * i)
            for k in range(ring):
                b = math.radians(60 * (i + 2))
                x = ring * r * math.cos(a) + k * r * math.cos(b)
                y = ring * r * math.sin(a) + k * r * math.sin(b)
                centers.add((round(x, 2), round(y, 2)))
    return "".join(f'<circle cx="{f(cx + x)}" cy="{f(cy + y)}" r="{f(r)}"/>' for x, y in centers) + f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * (rings + 1))}"/>'


def icosa_geo(cx, cy, R, ax=0.5, ay=0.35, az=0.0):
    v = []
    for s1 in (-1, 1):
        for s2 in (-1, 1):
            v += [(0, s1, s2 * PHI), (s1, s2 * PHI, 0), (s2 * PHI, 0, s1)]

    def rot(p):
        x, y, z = p
        y, z = y * math.cos(ax) - z * math.sin(ax), y * math.sin(ax) + z * math.cos(ax)
        x, z = x * math.cos(ay) + z * math.sin(ay), -x * math.sin(ay) + z * math.cos(ay)
        x, y = x * math.cos(az) - y * math.sin(az), x * math.sin(az) + y * math.cos(az)
        return x, y, z

    k = R / math.sqrt(1 + PHI ** 2)
    pr = [rot(p) for p in v]
    front, back = [], []
    for i in range(12):
        for j in range(i + 1, 12):
            d = sum((a - b) ** 2 for a, b in zip(v[i], v[j]))
            if abs(d - 4) < 1e-6:
                (x1, y1, z1), (x2, y2, z2) = pr[i], pr[j]
                line = f'<line x1="{f(cx + x1 * k)}" y1="{f(cy + y1 * k)}" x2="{f(cx + x2 * k)}" y2="{f(cy + y2 * k)}"/>'
                (front if z1 + z2 > -0.4 else back).append(line)
    verts = [(cx + x * k, cy + y * k, z) for x, y, z in pr]
    return "".join(front), "".join(back), verts


def cell(card, cx, cy, r, color=LIME, nuc=MAGENTA, seed=2, w=1.4):
    rnd = random.Random(seed)
    pts = []
    ph = [rnd.uniform(0, 6.28) for _ in range(3)]
    for i in range(73):
        a = i / 72 * 2 * math.pi
        rr = r * (1 + 0.05 * math.sin(3 * a + ph[0]) + 0.03 * math.sin(5 * a + ph[1]))
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    mem = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + "Z"
    out = [f'<path d="{mem}" fill="{color}" opacity="0.08"/>', tube(card, f'<path d="{mem}"/>', color, w, 5)]
    out.append(fine(f'<path d="{mem}" transform="translate({f(cx)} {f(cy)}) scale(0.9) translate({f(-cx)} {f(-cy)})"/>', color, 0.6, 0.5))
    nx, ny = cx + r * 0.12, cy - r * 0.08
    out.append(f'<circle cx="{f(nx)}" cy="{f(ny)}" r="{f(r * 0.32)}" fill="{nuc}" opacity="0.18"/>')
    out.append(tube(card, f'<circle cx="{f(nx)}" cy="{f(ny)}" r="{f(r * 0.32)}"/>', nuc, w * 0.9, 4))
    out.append(bulb(card, nx + r * 0.06, ny + r * 0.04, r * 0.07, light(nuc, 0.3)))
    mito = []
    for k in range(3):
        a = rnd.uniform(0, 360)
        mx, my = pt(cx, cy, r * 0.62, a)
        ang = a + 90
        L = r * 0.22
        x1, y1 = pt(mx, my, L / 2, ang)
        x2, y2 = pt(mx, my, L / 2, ang + 180)
        mito.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke-width="{f(r * 0.1)}" stroke="{ORANGE}" stroke-linecap="round" opacity="0.8"/>')
    out.append("".join(mito))
    er = "".join(f'<path d="{arc_d(nx, ny, r * (0.42 + 0.07 * k), 200 + 15 * k, 300 + 10 * k)}"/>' for k in range(3))
    out.append(fine(er, CYAN, 0.8, 0.7))
    out += [f'<circle cx="{f(pt(cx, cy, r * rnd.uniform(0.3, 0.8), rnd.uniform(0, 360))[0])}" cy="{f(pt(cx, cy, r * rnd.uniform(0.3, 0.8), rnd.uniform(0, 360))[1])}" r="1.2" fill="#FFFFFF" opacity="0.7"/>' for _ in range(10)]
    return "".join(out)


def pollen(card, cx, cy, r, color=YELLOW, spikes=26, seed=4, w=1.2):
    rnd = random.Random(seed)
    g = card.rgrad(nid("pol"), [(0, light(color, 0.5), 0.5), (1, dark(color, 0.5), 0.3)], 0.4, 0.35, 0.7)
    out = [glow_spot(card, cx, cy, r * 1.8, r * 1.8, color, 0.4), f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/>']
    sp = []
    for i in range(spikes):
        a = i * 360 / spikes + rnd.uniform(-4, 4)
        x1, y1 = pt(cx, cy, r, a)
        x2, y2 = pt(cx, cy, r * 1.32, a)
        sp.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}"/>')
    out.append(tube(card, f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}"/>' + "".join(sp), color, w, 4))
    for i in range(18):
        a, d = rnd.uniform(0, 360), r * rnd.uniform(0, 0.8)
        x, y = pt(cx, cy, d, a)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.07)}" fill="none" stroke="{light(color, 0.4)}" stroke-width="0.7" opacity="0.8"/>')
    return "".join(out)


def crystal_geo(cx, base, h, w, n=5, seed=6):
    """Une grappe de cristaux (prismes hexagonaux à pointe)."""
    rnd = random.Random(seed)
    geo = []
    for i in range(n):
        a = -38 + i * 76 / max(1, n - 1) + rnd.uniform(-6, 6)
        hh = h * rnd.uniform(0.5, 1)
        ww = w * rnd.uniform(0.6, 1)
        ox = cx + (i - (n - 1) / 2) * w * 0.55
        tx, ty = pt(ox, base, hh, a)
        sx, sy = pt(ox, base, hh * 0.78, a)
        lx, ly = pt(sx, sy, ww / 2, a - 90)
        rx, ry = pt(sx, sy, ww / 2, a + 90)
        bl, br = pt(ox, base, ww / 2, a - 90), pt(ox, base, ww / 2, a + 90)
        geo.append(f'<path d="M{f(bl[0])} {f(bl[1])} L{f(lx)} {f(ly)} L{f(tx)} {f(ty)} L{f(rx)} {f(ry)} L{f(br[0])} {f(br[1])}"/>')
        geo.append(f'<path d="M{f(ox)} {f(base)} L{f(sx)} {f(sy)} L{f(tx)} {f(ty)}"/>')
    return "".join(geo)


def tracks(card, seed, cx, cy, n=9, colors=(CYAN, MAGENTA, YELLOW, LIME), steps=110, w=1.0, scale=1.0):
    """Traces de particules dans une chambre à bulles : des spirales qui s'enroulent en perdant leur énergie."""
    rnd = random.Random(seed)
    by = {}
    for i in range(n):
        x, y = cx, cy
        d = rnd.uniform(0, 2 * math.pi)
        k = rnd.choice((-1, 1)) * rnd.uniform(0.012, 0.05)
        p = [f"{f(x)} {f(y)}"]
        for s in range(steps):
            d += k * 2.2
            k *= 1.022
            x += 2.2 * scale * math.cos(d)
            y += 2.2 * scale * math.sin(d)
            p.append(f"{f(x)} {f(y)}")
            if abs(k) > 0.5:
                break
        by.setdefault(colors[i % len(colors)], []).append('<path d="M' + " L".join(p) + '"/>')
    out = [tube(card, "".join(g), c, w, 3, op=0.9) for c, g in by.items()]
    out.append(bulb(card, cx, cy, 2.6, "#FFFFFF"))
    return "".join(out)


def string_loop_d(cx, cy, r, k=5, amp=0.16, phase=0.0, n=120, tilt=1.0):
    pts = []
    for i in range(n + 1):
        a = i / n * 2 * math.pi
        rr = r * (1 + amp * math.sin(k * a + phase))
        pts.append(f"{f(cx + rr * math.cos(a))} {f(cy + rr * math.sin(a) * tilt)}")
    return "M" + " L".join(pts) + "Z"


def foam(card, seed, cx, cy, r, n=46, color=VIOLET):
    """La mousse quantique : des bulles d'espace-temps qui naissent et meurent à l'échelle de Planck."""
    rnd = random.Random(seed)
    geo = []
    for _ in range(n):
        a, d = rnd.uniform(0, 360), r * rnd.random() ** 0.7
        x, y = pt(cx, cy, d, a)
        rr = rnd.uniform(2, 9) * (1 - d / r * 0.5)
        geo.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rr)}"/>')
    return glow_spot(card, cx, cy, r * 1.2, r * 1.2, color, 0.35) + tube(card, "".join(geo), color, 0.8, 3, op=0.85)


def pow10(x, y, mant, exp, color=CYAN, size=8, anchor="start", op=0.9, unit=" m"):
    """« 10⁻³⁵ m » sans dépendre des glyphes en exposant."""
    e = exp.replace("-", "−")
    return (f'<text x="{f(x)}" y="{f(y)}" text-anchor="{anchor}" font-family="{SANS}" font-weight="800" font-size="{size}" letter-spacing="0.6" fill="{color}" opacity="{op}">'
            f'{esc(mant)}<tspan dy="{f(-size * 0.42)}" font-size="{f(size * 0.72)}">{esc(e)}</tspan><tspan dy="{f(size * 0.42)}">{esc(unit)}</tspan></text>')


# ---------------------------------------------------------------- la galaxie-ADN (Légende I)

def helix_arm(card, cx, cy, r_in, r_out, turns, base, tilt=1.0, c1=MAGENTA, c2=CYAN, rung=(YELLOW, LIME, PINK, CYAN),
              amp=(3.5, 0.034), lam=(22, 0.07), w=1.5, halo=5, glow=VIOLET, seed=1, dots=420, knots=10):
    """Un bras de galaxie spirale dont le fil est une double hélice d'ADN : deux brins de néon qui s'enroulent
    le long de la spirale logarithmique, reliés par leurs paires de bases ; autour, la poussière d'étoiles du bras."""
    rnd = random.Random(seed)
    b = math.log(r_out / r_in) / (turns * 2 * math.pi)
    n = 900
    P = []
    for i in range(n + 1):
        th = i / n * turns * 2 * math.pi
        r = r_in * math.exp(b * th)
        ph = th + base
        P.append((cx + r * math.cos(ph), cy + r * math.sin(ph) * tilt, r))
    sa, sb, rungs = [], [], []
    phase = 0.0
    next_rung = 0.0
    for i in range(n + 1):
        x, y, r = P[i]
        j0, j1 = max(0, i - 1), min(n, i + 1)
        tx, ty = P[j1][0] - P[j0][0], P[j1][1] - P[j0][1]
        L = math.hypot(tx, ty) or 1
        nx, ny = -ty / L, tx / L
        A = amp[0] + amp[1] * r
        if i:
            ds = math.hypot(x - P[i - 1][0], y - P[i - 1][1])
            phase += 2 * math.pi * ds / (lam[0] + lam[1] * r)
        ax, ay = x + nx * A * math.sin(phase), y + ny * A * math.sin(phase)
        bx, by = x - nx * A * math.sin(phase), y - ny * A * math.sin(phase)
        sa.append(f"{f(ax)} {f(ay)}")
        sb.append(f"{f(bx)} {f(by)}")
        if phase >= next_rung:
            k = len(rungs)
            mx, my = (ax + bx) / 2, (ay + by) / 2
            rungs.append(f'<line x1="{f(ax)}" y1="{f(ay)}" x2="{f(mx)}" y2="{f(my)}" stroke="{rung[k % len(rung)]}"/>'
                         f'<line x1="{f(mx)}" y1="{f(my)}" x2="{f(bx)}" y2="{f(by)}" stroke="{rung[(k + 2) % len(rung)]}"/>')
            next_rung += math.pi / 4.5
    center = "M" + " L".join(f"{f(x)} {f(y)}" for x, y, _ in P[::6])
    out = [f'<path d="{center}" fill="none" stroke="{glow}" stroke-width="64" opacity="0.2" filter="{ublur(card, 24)}"/>',
           f'<path d="{center}" fill="none" stroke="{light(glow, 0.3)}" stroke-width="16" opacity="0.22" filter="{ublur(card, 8)}"/>']
    dm = []
    for _ in range(dots):
        i = int(rnd.random() ** 0.8 * n)
        x, y, r = P[i]
        s = amp[0] + amp[1] * r
        dm.append(f'<circle cx="{f(x + rnd.gauss(0, s * 1.6))}" cy="{f(y + rnd.gauss(0, s * 1.6))}" r="{f(rnd.uniform(0.35, 1.5))}" '
                  f'fill="{rnd.choice(("#FFFFFF", "#FFFFFF", light(c1, 0.5), light(c2, 0.5)))}" opacity="{f(rnd.uniform(0.35, 1))}"/>')
    out.append("".join(dm))
    r_ = "".join(rungs)
    out.append(f'<g stroke-width="3.4" opacity="0.4" filter="{ublur(card, 2.5)}">{r_}</g><g stroke-width="1.3" opacity="0.9" stroke-linecap="round">{r_}</g>')
    out.append(tube(card, '<path d="M' + " L".join(sa) + '"/>', c1, w, halo))
    out.append(tube(card, '<path d="M' + " L".join(sb) + '"/>', c2, w, halo))
    for _ in range(knots):
        i = int(rnd.uniform(0.12, 0.95) * n)
        x, y, r = P[i]
        out.append(bulb(card, x + rnd.gauss(0, 4), y + rnd.gauss(0, 4), rnd.uniform(1.6, 2.8), rnd.choice((PINK, "#FFB3E6", "#BFF5FF"))))
    return "".join(out)


# ---------------------------------------------------------------- toile cosmique dense, cordes ouvertes (Mythe)

def web_strip(card, seed, x0, y0, x1, y1, n=26, color=VIOLET, node=PINK, w=0.9):
    """La toile cosmique en bande : des filaments de gaz lumineux, des nœuds où s'amassent les galaxies."""
    rnd = random.Random(seed)
    nodes = []
    for i in range(n):
        nodes.append((rnd.uniform(x0, x1), y0 + (y1 - y0) * (i + rnd.uniform(0, 1)) / n))
    edges = set()
    for i, (ax, ay) in enumerate(nodes):
        near = sorted(range(n), key=lambda j: (nodes[j][0] - ax) ** 2 + (nodes[j][1] - ay) ** 2)[1:4]
        for j in near:
            edges.add(tuple(sorted((i, j))))
    geo = []
    for i, j in edges:
        (ax, ay), (bx, by) = nodes[i], nodes[j]
        mx, my = (ax + bx) / 2 + rnd.uniform(-10, 10), (ay + by) / 2 + rnd.uniform(-10, 10)
        geo.append(f'<path d="M{f(ax)} {f(ay)} Q{f(mx)} {f(my)} {f(bx)} {f(by)}"/>')
    g = "".join(geo)
    out = [f'<g fill="none" stroke="{color}" stroke-width="12" opacity="0.3" filter="{ublur(card, 7)}">{g}</g>',
           f'<g fill="none" stroke="{light(color, 0.2)}" stroke-width="3" opacity="0.45" filter="{ublur(card, 2)}">{g}</g>',
           tube(card, g, light(color, 0.15), w, 2.5, op=0.85)]
    for x, y in nodes:
        s = rnd.uniform(0.7, 1.7)
        out.append(glow_spot(card, x, y, 12 * s, 12 * s, node, 0.75))
        for _ in range(int(3 * s)):
            gx, gy = x + rnd.gauss(0, 3 * s), y + rnd.gauss(0, 3 * s)
            out.append(f'<ellipse cx="{f(gx)}" cy="{f(gy)}" rx="{f(rnd.uniform(1, 2.2))}" ry="{f(rnd.uniform(0.5, 1))}" fill="#FFF3E0" opacity="0.9" transform="rotate({f(rnd.uniform(0, 180))} {f(gx)} {f(gy)})"/>')
    return "".join(out)


def open_strings(card, x0, y0, x1, y1, n=4, colors=(MAGENTA, CYAN, YELLOW, VIOLET), w=1.2):
    """Des cordes ouvertes qui vibrent en ondes stationnaires (2, 3, 4… ventres), fixées à leurs extrémités."""
    out = []
    for k in range(n):
        x = x0 + (x1 - x0) * (k + 0.5) / n
        modes = k + 2
        pts = []
        for i in range(81):
            t = i / 80
            y = y0 + (y1 - y0) * t
            xx = x + 7 * math.sin(math.pi * modes * t)
            pts.append(f"{f(xx)} {f(y)}")
        ghost = []
        for i in range(81):
            t = i / 80
            y = y0 + (y1 - y0) * t
            ghost.append(f"{f(x - 7 * math.sin(math.pi * modes * t))} {f(y)}")
        col = colors[k % len(colors)]
        out.append(fine('<path d="M' + " L".join(ghost) + '"/>', col, 0.7, 0.35, "2 2"))
        out.append(tube(card, '<path d="M' + " L".join(pts) + '"/>', col, w, 4))
        out.append(bulb(card, x, y0, 1.8, light(col, 0.4)) + bulb(card, x, y1, 1.8, light(col, 0.4)))
    return "".join(out)


def feynman(card, cx, cy, h=150, w=58, c_in=CYAN, c_ph=YELLOW, c_out=MAGENTA, lw=1.3):
    """Un diagramme de Feynman, vertical : un électron et un positon s'annihilent (en bas), un photon monte,
    une paire quark-antiquark en naît (en haut)."""
    v1 = (cx, cy + h * 0.2)
    v2 = (cx, cy - h * 0.2)
    a_in = [(cx - w / 2, cy + h / 2), (cx + w / 2, cy + h / 2)]
    a_out = [(cx - w / 2, cy - h / 2), (cx + w / 2, cy - h / 2)]
    geo_in = "".join(f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(v1[0])}" y2="{f(v1[1])}"/>' for x, y in a_in)
    geo_out = "".join(f'<line x1="{f(v2[0])}" y1="{f(v2[1])}" x2="{f(x)}" y2="{f(y)}"/>' for x, y in a_out)
    pts = []
    for i in range(61):
        t = i / 60
        y = v1[1] + (v2[1] - v1[1]) * t
        pts.append(f"{f(cx + 5 * math.sin(t * math.pi * 8))} {f(y)}")
    ph = '<path d="M' + " L".join(pts) + '"/>'

    def arrow(x1, y1, x2, y2, col, rev=False):
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        ang = math.degrees(math.atan2(y2 - y1, x2 - x1)) + (180 if rev else 0)
        return f'<path d="M5 0 L-4 -4 L-4 4Z" fill="{light(col, 0.4)}" transform="translate({f(mx)} {f(my)}) rotate({f(ang)})"/>'
    arrows = (arrow(*a_in[0], *v1, c_in) + arrow(*a_in[1], *v1, c_in, True)
              + arrow(*v2, *a_out[0], c_out) + arrow(*v2, *a_out[1], c_out, True))
    out = [tube(card, geo_in, c_in, lw, 4), tube(card, geo_out, c_out, lw, 4), tube(card, ph, c_ph, lw * 0.9, 4), arrows,
           bulb(card, *v1, 2.6, "#FFFFFF"), bulb(card, *v2, 2.6, "#FFFFFF")]
    return "".join(out)


def elliptical(card, cx, cy, rx, ry, color="#FFE6B0", seed=3, n=120, rot=0):
    """Une galaxie elliptique : un essaim d'étoiles vieilles, dorées, sans bras."""
    rnd = random.Random(seed)
    out = [f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{card.rgrad(nid("ell"), [(0, "#FFFFFF", 0.9), (0.3, color, 0.55), (1, color, 0)])}" transform="rotate({rot} {f(cx)} {f(cy)})"/>']
    for _ in range(n):
        a = rnd.uniform(0, 2 * math.pi)
        d = abs(rnd.gauss(0, 0.45))
        x, y = rx * d * math.cos(a), ry * d * math.sin(a)
        ra = math.radians(rot)
        out.append(f'<circle cx="{f(cx + x * math.cos(ra) - y * math.sin(ra))}" cy="{f(cy + x * math.sin(ra) + y * math.cos(ra))}" r="{f(rnd.uniform(0.3, 1))}" fill="#FFFFFF" opacity="{f(rnd.uniform(0.4, 1))}"/>')
    return "".join(out)
