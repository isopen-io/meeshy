"""L'infiniment grand et l'infiniment petit, dessinés pour l'Empire céleste : Voie lactée, trou noir, quasar, toile
cosmique, amas ; atomes, noyaux, quarks, ADN, cellules, neurones, pollen, flocons fractals, cristaux, mousse quantique."""

import math
import random

from motifs import *  # noqa: F401,F403


# ---------------------------------------------------------------- l'immense

def milky_way(card, ctrl, width, seed=1, n=900, color="#FFFFFF", glow=("#B9A7FF", "#FFD9F0", "#9FD8FF"), dust=True, op=1):
    """La Rivière céleste : un fleuve d'étoiles le long d'une courbe, voiles de nébuleuse, bande de poussière."""
    rnd = random.Random(seed)
    sp, L = spine(ctrl, 80)
    out = []
    pl = poly_d([(x, y) for x, y, _ in sp], False)
    out.append(f'<path d="{pl}" fill="none" stroke="{glow[0]}" stroke-width="{fmt(width * 1.6)}" opacity="0.28" filter="{card.blur("mw1", width * 0.45)}" stroke-linecap="round"/>')
    out.append(f'<path d="{pl}" fill="none" stroke="{glow[1]}" stroke-width="{fmt(width * 0.8)}" opacity="0.32" filter="{card.blur("mw2", width * 0.25)}" stroke-linecap="round"/>')
    out.append(f'<path d="{pl}" fill="none" stroke="#FFFFFF" stroke-width="{fmt(width * 0.25)}" opacity="0.35" filter="{card.blur("mw3", width * 0.15)}" stroke-linecap="round"/>')
    for _ in range(14):
        x, y, a = sp[rnd.randint(0, 79)]
        off = rnd.gauss(0, width * 0.25)
        out.append(f'<ellipse cx="{fmt(x - math.sin(a) * off)}" cy="{fmt(y + math.cos(a) * off)}" rx="{fmt(rnd.uniform(width * 0.2, width * 0.5))}" ry="{fmt(rnd.uniform(width * 0.1, width * 0.25))}" '
                   f'fill="{rnd.choice(glow)}" opacity="{fmt(rnd.uniform(0.15, 0.35))}" transform="rotate({fmt(math.degrees(a))} {fmt(x)} {fmt(y)})" filter="{card.blur("mw4", 8)}"/>')
    if dust:
        dl = poly_d(offset(sp, lambda t: width * 0.08 * math.sin(t * 9)), False)
        out.append(f'<path d="{dl}" fill="none" stroke="#05030C" stroke-width="{fmt(width * 0.12)}" opacity="0.55" filter="{card.blur("mw5", 4)}"/>')
    pts = []
    for _ in range(n):
        x, y, a = sp[rnd.randint(0, 79)]
        off = rnd.gauss(0, width * 0.3)
        px, py = x - math.sin(a) * off + rnd.uniform(-4, 4), y + math.cos(a) * off + rnd.uniform(-4, 4)
        r = rnd.uniform(0.3, 1.3) * (1.4 if rnd.random() < 0.04 else 1)
        pts.append(f'<circle cx="{fmt(px)}" cy="{fmt(py)}" r="{fmt(r)}" fill="{color}" opacity="{fmt(rnd.uniform(0.3, 1))}"/>')
    out.append("".join(pts))
    return f'<g opacity="{op}">{"".join(out)}</g>'


def constellation(pts, edges, color="#E9F0FF", line_op=0.55, r=2.2, lw=0.9, bright=()):
    out = [f'<path d="{" ".join(f"M{fmt(pts[a][0])} {fmt(pts[a][1])} L{fmt(pts[b][0])} {fmt(pts[b][1])}" for a, b in edges)}" stroke="{color}" stroke-width="{lw}" opacity="{line_op}"/>']
    for i, (x, y) in enumerate(pts):
        rr = r * (1.8 if i in bright else 1)
        out.append(f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(rr * 2.4)}" fill="{color}" opacity="0.18"/><circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(rr)}" fill="#FFFFFF"/>')
        if i in bright:
            out.append(sparkle(x, y, rr * 5, "#FFFFFF", 0.9))
    return "".join(out)


def black_hole(card, cx, cy, r, tilt=0.28, rot=-12, hot=("#FFFFFF", "#FFE2A0", "#FF9A40", "#C8401A")):
    """Trou noir : disque d'accrétion incliné, arc lenticulaire au-dessus de l'ombre, anneau de photons."""
    disk = card.rgrad("bh-disk", [(0, hot[0], 0), (0.32, hot[0], 0), (0.38, hot[1], 1), (0.55, hot[2], 0.9), (0.8, hot[3], 0.5), (1, hot[3], 0)])
    out = [f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r * 3.2)}" fill="{card.rgrad("bh-glow", [(0, hot[2], 0.35), (1, hot[3], 0)])}"/>']
    g = f'<g transform="rotate({rot} {fmt(cx)} {fmt(cy)})">'
    out.append(g + f'<ellipse cx="{fmt(cx)}" cy="{fmt(cy)}" rx="{fmt(r * 3)}" ry="{fmt(r * 3 * tilt)}" fill="{disk}"/></g>')
    out.append(g + f'<path d="M{fmt(cx - r * 1.45)} {fmt(cy)} A{fmt(r * 1.45)} {fmt(r * 1.35)} 0 0 1 {fmt(cx + r * 1.45)} {fmt(cy)}" fill="none" stroke="{hot[1]}" stroke-width="{fmt(r * 0.42)}" opacity="0.85" filter="{card.blur("bh-lens", r * 0.12)}"/></g>')
    out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r)}" fill="#000000"/>')
    out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r * 1.04)}" fill="none" stroke="#FFF6DA" stroke-width="{fmt(max(1, r * 0.06))}" opacity="0.9"/>')
    clipd = f"M{fmt(cx - r * 4)} {fmt(cy)} L{fmt(cx + r * 4)} {fmt(cy)} L{fmt(cx + r * 4)} {fmt(cy + r * 2)} L{fmt(cx - r * 4)} {fmt(cy + r * 2)}Z"
    out.append(f'<g clip-path="{clip(card, clipd)}">' + g + f'<ellipse cx="{fmt(cx)}" cy="{fmt(cy)}" rx="{fmt(r * 3)}" ry="{fmt(r * 3 * tilt)}" fill="{disk}"/></g></g>')
    return "".join(out)


def quasar(card, cx, cy, r, ang=-30, color="#BFE8FF", jet=4.5):
    """Quasar : cœur aveuglant, disque, deux jets relativistes opposés."""
    out = [f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r * 4)}" fill="{card.rgrad("q-glow", [(0, "#FFFFFF", 0.7), (0.25, color, 0.35), (1, color, 0)])}"/>']
    jg = card.grad("q-jet", [(0, "#FFFFFF", ), (1, color)], 0, 0, 1, 0)
    for k in (0, 180):
        a = ang + k
        p1, p2 = pt(cx, cy, r * jet, a), pt(cx, cy, r * jet * 0.55, a)
        l1, l2 = pt(cx, cy, r * 0.5, a - 90), pt(cx, cy, r * 0.5, a + 90)
        w1, w2 = pt(p2[0], p2[1], r * 0.7, a - 90), pt(p2[0], p2[1], r * 0.7, a + 90)
        out.append(f'<path d="M{fmt(l1[0])} {fmt(l1[1])} Q{fmt(w1[0])} {fmt(w1[1])} {fmt(p1[0])} {fmt(p1[1])} Q{fmt(w2[0])} {fmt(w2[1])} {fmt(l2[0])} {fmt(l2[1])}Z" fill="{color}" opacity="0.55" filter="{card.blur("q-jb", 3)}"/>')
        out.append(f'<line x1="{fmt(cx)}" y1="{fmt(cy)}" x2="{fmt(p1[0])}" y2="{fmt(p1[1])}" stroke="#FFFFFF" stroke-width="{fmt(r * 0.12)}" opacity="0.9"/>')
    out.append(f'<ellipse cx="{fmt(cx)}" cy="{fmt(cy)}" rx="{fmt(r * 1.6)}" ry="{fmt(r * 0.4)}" fill="#FFD9A0" opacity="0.8" transform="rotate({ang + 90} {fmt(cx)} {fmt(cy)})" filter="{card.blur("q-d", 1.5)}"/>')
    out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r * 0.55)}" fill="#FFFFFF"/>')
    out.append(sparkle(cx, cy, r * 2.6, "#FFFFFF", 0.95))
    return "".join(out)


def cosmic_web(card, region, seed, n=40, color="#9FB8FF", knots="#FFE9F7", k=3, op=0.6, avoid=None):
    """Toile cosmique : nœuds (amas) reliés à leurs plus proches voisins par des filaments flous."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    pts = []
    while len(pts) < n:
        p = (rnd.uniform(x0, x1), rnd.uniform(y0, y1))
        if avoid and avoid[0] < p[0] < avoid[2] and avoid[1] < p[1] < avoid[3]:
            continue
        pts.append(p)
    segs = set()
    for i, p in enumerate(pts):
        near = sorted(range(len(pts)), key=lambda j: math.dist(p, pts[j]))[1:k + 1]
        for j in near:
            segs.add((min(i, j), max(i, j)))
    d = " ".join(f"M{fmt(pts[a][0])} {fmt(pts[a][1])} Q{fmt((pts[a][0] + pts[b][0]) / 2 + rnd.uniform(-8, 8))} {fmt((pts[a][1] + pts[b][1]) / 2 + rnd.uniform(-8, 8))} {fmt(pts[b][0])} {fmt(pts[b][1])}" for a, b in segs)
    out = [f'<path d="{d}" fill="none" stroke="{color}" stroke-width="3" opacity="{op * 0.5}" filter="{card.blur("cw1", 2.5)}"/>',
           f'<path d="{d}" fill="none" stroke="{color}" stroke-width="0.8" opacity="{op}"/>']
    for x, y in pts:
        r = rnd.uniform(1.2, 3.4)
        out.append(f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(r * 3)}" fill="{knots}" opacity="0.18"/><circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(r)}" fill="{knots}" opacity="0.9"/>')
    return "".join(out)


def galaxy_cluster(cx, cy, r, seed, colors=("#FFE7C2", "#FFFFFF", "#CFE0FF")):
    rnd = random.Random(seed)
    out = []
    for _ in range(26):
        a, d = rnd.uniform(0, 360), abs(rnd.gauss(0, r * 0.45))
        x, y = pt(cx, cy, d, a)
        rx = rnd.uniform(1.5, 4.5)
        out.append(f'<ellipse cx="{fmt(x)}" cy="{fmt(y)}" rx="{fmt(rx)}" ry="{fmt(rx * rnd.uniform(0.4, 0.9))}" fill="{rnd.choice(colors)}" opacity="{fmt(rnd.uniform(0.5, 1))}" transform="rotate({rnd.randint(0, 180)} {fmt(x)} {fmt(y)})"/>')
    return "".join(out)


def supernova(card, cx, cy, r, seed=3, c1="#FFB0E0", c2="#7FD8FF", flare=True):
    """Rémanent de supernova : coquille filamenteuse bicolore, cœur blanc, éclat."""
    rnd = random.Random(seed)
    out = [f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r * 1.6)}" fill="{card.rgrad("sn-g", [(0, "#FFFFFF", 0.5), (0.5, c1, 0.2), (1, c2, 0)])}"/>']
    fil = []
    for k in range(70):
        a = rnd.uniform(0, 360)
        r0 = r * rnd.uniform(0.75, 0.95)
        r1 = r * rnd.uniform(1.0, 1.25)
        p1, p2 = pt(cx, cy, r0, a), pt(cx, cy, r1, a + rnd.uniform(-6, 6))
        fil.append(f'<path d="M{fmt(p1[0])} {fmt(p1[1])} L{fmt(p2[0])} {fmt(p2[1])}" stroke="{c1 if k % 2 else c2}" stroke-width="{fmt(rnd.uniform(0.6, 1.8))}" opacity="{fmt(rnd.uniform(0.4, 0.9))}" stroke-linecap="round"/>')
    out.append(f'<g filter="{card.blur("sn-b", 0.6)}">{"".join(fil)}</g>')
    out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r)}" fill="none" stroke="{c2}" stroke-width="{fmt(r * 0.08)}" opacity="0.5" filter="{card.blur("sn-r", 3)}"/>')
    if flare:
        out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r * 0.12)}" fill="#FFFFFF"/>' + sparkle(cx, cy, r * 0.7, "#FFFFFF", 0.9))
    return "".join(out)


def planet(card, cx, cy, r, c1, c2, ring=None, name=None, bands=True):
    g = card.rgrad(name or nid("pl"), [(0, c1, 1), (1, c2, 1)], 0.35, 0.35, 0.75)
    out = []
    if ring:
        out.append(f'<ellipse cx="{fmt(cx)}" cy="{fmt(cy)}" rx="{fmt(r * 2)}" ry="{fmt(r * 0.5)}" fill="none" stroke="{ring}" stroke-width="{fmt(r * 0.22)}" opacity="0.8" transform="rotate(-18 {fmt(cx)} {fmt(cy)})"/>')
    out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r)}" fill="{g}"/>')
    if bands:
        cid = clip(card, f"M{fmt(cx - r)} {fmt(cy)} A{fmt(r)} {fmt(r)} 0 1 1 {fmt(cx + r)} {fmt(cy)} A{fmt(r)} {fmt(r)} 0 1 1 {fmt(cx - r)} {fmt(cy)}Z")
        out.append(f'<g clip-path="{cid}" opacity="0.35">' + "".join(f'<ellipse cx="{fmt(cx)}" cy="{fmt(cy + k * r * 0.3)}" rx="{fmt(r * 1.1)}" ry="{fmt(r * 0.08)}" fill="{c2}" transform="rotate(-18 {fmt(cx)} {fmt(cy)})"/>' for k in (-2, -1, 1, 2)) + "</g>")
    if ring:
        front = f"M{fmt(cx - r * 2)} {fmt(cy)} A{fmt(r * 2)} {fmt(r * 0.5)} 0 0 0 {fmt(cx + r * 2)} {fmt(cy)}"
        out.append(f'<path d="{front}" fill="none" stroke="{ring}" stroke-width="{fmt(r * 0.22)}" opacity="0.9" transform="rotate(-18 {fmt(cx)} {fmt(cy)})"/>')
    return "".join(out)


# ---------------------------------------------------------------- l'infime

def atom(card, cx, cy, r, color="#9FE8FF", nucleus_c=("#FF8A6A", "#6AA8FF"), n_orb=3, rot=0, electrons=True, lw=1.2):
    out = [f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r * 1.1)}" fill="{card.rgrad("at-g", [(0, color, 0.25), (1, color, 0)])}"/>']
    for k in range(n_orb):
        a = rot + k * 180 / n_orb
        out.append(f'<ellipse cx="{fmt(cx)}" cy="{fmt(cy)}" rx="{fmt(r)}" ry="{fmt(r * 0.34)}" fill="none" stroke="{color}" stroke-width="{lw}" opacity="0.9" transform="rotate({fmt(a)} {fmt(cx)} {fmt(cy)})"/>')
        if electrons:
            ex = cx + r * math.cos(math.radians(a)) * math.cos(0.9 + k) - r * 0.34 * math.sin(math.radians(a)) * math.sin(0.9 + k)
            ey = cy + r * math.sin(math.radians(a)) * math.cos(0.9 + k) + r * 0.34 * math.cos(math.radians(a)) * math.sin(0.9 + k)
            out.append(f'<circle cx="{fmt(ex)}" cy="{fmt(ey)}" r="{fmt(max(1.4, r * 0.07))}" fill="#FFFFFF"/>')
    out.append(nucleus(card, cx, cy, r * 0.18, nucleus_c, 7))
    return "".join(out)


def nucleus(card, cx, cy, r, cols=("#FF7A5A", "#5A9AFF"), n=9, seed=4):
    """Noyau atomique : protons et neutrons serrés, modelés en sphères."""
    rnd = random.Random(seed)
    out = []
    gs = [card.rgrad(f"nu-{c}", [(0, "#FFFFFF", 1), (0.35, c, 1), (1, mix(c, "#000000", 0.5), 1)], 0.35, 0.35, 0.7) for c in cols]
    pts = [(0, 0)] + [(math.cos(i * 2.4) * (0.4 + 0.25 * (i % 3)), math.sin(i * 2.4) * (0.4 + 0.25 * (i % 3))) for i in range(1, n)]
    pts.sort(key=lambda p: p[1] - p[0] * 0.3)
    for i, (x, y) in enumerate(pts):
        out.append(f'<circle cx="{fmt(cx + x * r)}" cy="{fmt(cy + y * r)}" r="{fmt(r * 0.42)}" fill="{gs[i % 2]}"/>')
    return "".join(out)


def quarks(card, cx, cy, r, ring="#E9DDFF"):
    """Trois quarks (rouge, vert, bleu) liés par des gluons en ressort, dans la bulle du nucléon."""
    out = [f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r)}" fill="{card.rgrad("qk-b", [(0, "#FFFFFF", 0.12), (1, ring, 0.05)])}" stroke="{ring}" stroke-width="0.9" opacity="0.9"/>']
    pts = [pt(cx, cy, r * 0.48, a) for a in (0, 120, 240)]
    for i in range(3):
        a, b = pts[i], pts[(i + 1) % 3]
        L = math.dist(a, b)
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        wv = []
        for k in range(41):
            t = k / 40
            x = a[0] + (b[0] - a[0]) * t
            y = a[1] + (b[1] - a[1]) * t
            o = math.sin(t * math.pi * 10) * r * 0.06
            wv.append((x - math.sin(ang) * o, y + math.cos(ang) * o))
        out.append(f'<path d="{poly_d(wv, False)}" fill="none" stroke="#FFF1BE" stroke-width="1" opacity="0.85"/>')
    for (x, y), c in zip(pts, ("#FF5A6A", "#4AE08A", "#5A8AFF")):
        g = card.rgrad(f"qk-{c}", [(0, "#FFFFFF", 1), (0.4, c, 1), (1, mix(c, "#000000", 0.4), 1)], 0.35, 0.35, 0.7)
        out.append(f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(r * 0.2)}" fill="{g}"/>')
    return "".join(out)


def dna(card, x0, y0, x1, y1, turns=3, w=16, cols=("#7FD8FF", "#FF9AD5"), rungs=("#FFE27A", "#7AF0B0", "#FF8A8A", "#9FA8FF"), lw=2.4, op=1):
    """Double hélice d'ADN le long d'un segment : brin arrière plus sombre, barreaux de paires de bases."""
    L = math.dist((x0, y0), (x1, y1))
    ang = math.atan2(y1 - y0, x1 - x0)
    ca, sa = math.cos(ang), math.sin(ang)
    N = 120
    s1, s2 = [], []
    for i in range(N + 1):
        t = i / N
        ph = t * turns * 2 * math.pi
        bx, by = x0 + ca * L * t, y0 + sa * L * t
        s1.append((bx - sa * math.sin(ph) * w, by + ca * math.sin(ph) * w, math.cos(ph)))
        s2.append((bx - sa * math.sin(ph + math.pi) * w, by + ca * math.sin(ph + math.pi) * w, math.cos(ph + math.pi)))
    out = []
    for i in range(0, N + 1, 4):
        a, b = s1[i], s2[i]
        out.append(f'<line x1="{fmt(a[0])}" y1="{fmt(a[1])}" x2="{fmt(b[0])}" y2="{fmt(b[1])}" stroke="{rungs[(i // 4) % 4]}" stroke-width="{fmt(lw * 0.8)}" opacity="0.8"/>')
    for strand, col in ((s1, cols[0]), (s2, cols[1])):
        for i in range(N):
            a, b = strand[i], strand[i + 1]
            front = (a[2] + b[2]) > 0
            out.append(f'<line x1="{fmt(a[0])}" y1="{fmt(a[1])}" x2="{fmt(b[0])}" y2="{fmt(b[1])}" stroke="{col if front else mix(col, "#000000", 0.45)}" stroke-width="{fmt(lw * (1.2 if front else 0.9))}" stroke-linecap="round"/>')
    return f'<g opacity="{op}">{"".join(out)}</g>'


def benzene(cx, cy, r, color="#BFE8FF", atom_c="#FFFFFF", rot=0):
    pts = [pt(cx, cy, r, rot + k * 60) for k in range(6)]
    out = [f'<path d="{poly_d(pts)}" fill="none" stroke="{color}" stroke-width="1.6"/>',
           f'<path d="{poly_d([pt(cx, cy, r * 0.72, rot + k * 60) for k in range(6)])}" fill="none" stroke="{color}" stroke-width="0.8" stroke-dasharray="3 2" opacity="0.8"/>']
    for k, (x, y) in enumerate(pts):
        hx, hy = pt(cx, cy, r * 1.55, rot + k * 60)
        out.append(f'<line x1="{fmt(x)}" y1="{fmt(y)}" x2="{fmt(hx)}" y2="{fmt(hy)}" stroke="{color}" stroke-width="1.2"/>')
        out.append(f'<circle cx="{fmt(hx)}" cy="{fmt(hy)}" r="{fmt(r * 0.13)}" fill="{atom_c}" opacity="0.8"/>')
        out.append(f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(r * 0.2)}" fill="#3A3A4A" stroke="{color}" stroke-width="1"/>')
    return "".join(out)


def cell(card, cx, cy, r, seed=2, membrane="#7FF0C8", cyto=("#1E6A5A", "#0A2A26"), nuc="#C8A0FF"):
    """Cellule : membrane ondulante, cytoplasme, noyau et nucléole, mitochondries, réticulum."""
    rnd = random.Random(seed)
    pts = [(cx + math.cos(a) * r * (1 + 0.05 * math.sin(a * 5 + seed)), cy + math.sin(a) * r * (1 + 0.05 * math.sin(a * 5 + seed))) for a in [i * 2 * math.pi / 60 for i in range(60)]]
    d = poly_d(pts)
    out = [f'<path d="{d}" fill="{card.rgrad(nid("cy"), [(0, cyto[0], 0.9), (1, cyto[1], 0.95)])}" stroke="{membrane}" stroke-width="{fmt(max(1.2, r * 0.06))}"/>',
           f'<path d="{d}" fill="none" stroke="{membrane}" stroke-width="{fmt(r * 0.22)}" opacity="0.2" filter="{card.blur("cell-g", 3)}"/>']
    nx, ny = cx + r * 0.12, cy - r * 0.08
    out.append(f'<circle cx="{fmt(nx)}" cy="{fmt(ny)}" r="{fmt(r * 0.36)}" fill="{card.rgrad(nid("nu"), [(0, "#FFFFFF", 0.6), (0.5, nuc, 0.9), (1, mix(nuc, "#000000", 0.4), 1)])}" stroke="#FFFFFF" stroke-width="0.8" opacity="0.95"/>')
    out.append(f'<circle cx="{fmt(nx + r * 0.08)}" cy="{fmt(ny - r * 0.06)}" r="{fmt(r * 0.1)}" fill="#3A1A6A" opacity="0.8"/>')
    for k in range(3):
        a = rnd.uniform(0, 360)
        mx, my = pt(cx, cy, r * 0.62, a)
        out.append(f'<ellipse cx="{fmt(mx)}" cy="{fmt(my)}" rx="{fmt(r * 0.16)}" ry="{fmt(r * 0.07)}" fill="#FF9A6A" stroke="#FFE0C8" stroke-width="0.6" transform="rotate({fmt(a + 90)} {fmt(mx)} {fmt(my)})"/>')
        out.append(f'<path d="M{fmt(mx - r * 0.1)} {fmt(my)} q{fmt(r * 0.03)} {fmt(-r * 0.05)} {fmt(r * 0.06)} 0 t{fmt(r * 0.06)} 0 t{fmt(r * 0.06)} 0" fill="none" stroke="#FFE0C8" stroke-width="0.6" transform="rotate({fmt(a + 90)} {fmt(mx)} {fmt(my)})"/>')
    for k in range(10):
        a = rnd.uniform(0, 360)
        px, py = pt(cx, cy, r * rnd.uniform(0.45, 0.85), a)
        out.append(f'<circle cx="{fmt(px)}" cy="{fmt(py)}" r="{fmt(r * 0.03)}" fill="#FFF1BE" opacity="0.8"/>')
    return "".join(out)


def neuron(card, cx, cy, s, seed=1, color="#9FD8FF", glow="#7FB8FF", depth=4, angle0=0, n_dend=5, axon=None, synapse="#FFC8E8"):
    """Neurone : soma lumineux, dendrites qui se ramifient, axone, boutons synaptiques en fleur."""
    rnd = random.Random(seed)
    segs = []
    tips = []

    def grow(x, y, a, L, w, d):
        x2, y2 = x + math.cos(a) * L, y + math.sin(a) * L
        mx, my = (x + x2) / 2 + rnd.uniform(-L * 0.15, L * 0.15), (y + y2) / 2 + rnd.uniform(-L * 0.15, L * 0.15)
        segs.append((f"M{fmt(x)} {fmt(y)} Q{fmt(mx)} {fmt(my)} {fmt(x2)} {fmt(y2)}", w))
        if d == 0:
            tips.append((x2, y2))
            return
        for da in (-rnd.uniform(0.3, 0.6), rnd.uniform(0.3, 0.6)):
            grow(x2, y2, a + da, L * rnd.uniform(0.6, 0.8), w * 0.62, d - 1)

    for k in range(n_dend):
        a = math.radians(angle0) + k * 2 * math.pi / n_dend + rnd.uniform(-0.3, 0.3)
        grow(cx, cy, a, 26 * s * rnd.uniform(0.8, 1.2), 4 * s, depth - 1)
    if axon:
        sp, _ = spine([(cx, cy)] + axon, 60)
        segs.append((poly_d([(x, y) for x, y, _ in sp], False), 2.6 * s))
        ex, ey, ea = sp[-1]
        for da in (-0.6, 0, 0.6):
            x2, y2 = ex + math.cos(ea + da) * 14 * s, ey + math.sin(ea + da) * 14 * s
            segs.append((f"M{fmt(ex)} {fmt(ey)} L{fmt(x2)} {fmt(y2)}", 1.2 * s))
            tips.append((x2, y2))
    out = [f'<g filter="{card.blur("nr-g", 2.5)}" opacity="0.6">' + "".join(f'<path d="{d}" fill="none" stroke="{glow}" stroke-width="{fmt(w * 2.2)}" stroke-linecap="round"/>' for d, w in segs) + "</g>"]
    out.append("".join(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{fmt(max(0.5, w))}" stroke-linecap="round"/>' for d, w in segs))
    for x, y in tips:
        out.append(f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(2.2 * s)}" fill="{synapse}" opacity="0.9"/><circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(5 * s)}" fill="{synapse}" opacity="0.18"/>')
    out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(16 * s)}" fill="{card.rgrad("soma-g", [(0, "#FFFFFF", 0.7), (1, glow, 0)])}"/>')
    out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(7 * s)}" fill="{card.rgrad("soma", [(0, "#FFFFFF", 1), (0.5, color, 1), (1, glow, 1)])}"/>')
    return "".join(out), tips


def pollen(card, cx, cy, r, color="#FFD36A", seed=1):
    """Grain de pollen : sphère hérissée d'épines, pores sombres."""
    rnd = random.Random(seed)
    g = card.rgrad(f"po-{color}", [(0, "#FFFFFF", 1), (0.45, color, 1), (1, mix(color, "#000000", 0.5), 1)], 0.38, 0.35, 0.7)
    out = [f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r * 1.8)}" fill="{card.rgrad("po-gl", [(0, color, 0.35), (1, color, 0)])}"/>']
    sp = []
    for k in range(28):
        a = k * 360 / 28 + rnd.uniform(-4, 4)
        p1, p2 = pt(cx, cy, r * 0.9, a), pt(cx, cy, r * 1.32, a)
        sp.append(f"M{fmt(p1[0])} {fmt(p1[1])} L{fmt(p2[0])} {fmt(p2[1])}")
    out.append(f'<path d="{" ".join(sp)}" stroke="{color}" stroke-width="{fmt(max(1, r * 0.1))}" stroke-linecap="round"/>')
    out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r)}" fill="{g}"/>')
    for k in range(9):
        a, d = rnd.uniform(0, 360), rnd.uniform(0, r * 0.7)
        px, py = pt(cx, cy, d, a)
        out.append(f'<circle cx="{fmt(px)}" cy="{fmt(py)}" r="{fmt(r * 0.1)}" fill="{mix(color, "#000000", 0.55)}" opacity="0.7"/>')
    return "".join(out)


def snowflake(cx, cy, r, color="#E9F4FF", lw=1.4, depth=3, rot=0, op=1, seed=0):
    """Flocon fractal : six bras, chaque bras porte des branches qui se ramifient à leur tour."""
    rnd = random.Random(seed)
    segs = []

    def arm(x, y, a, L, d, w):
        x2, y2 = x + math.cos(a) * L, y + math.sin(a) * L
        segs.append((x, y, x2, y2, w))
        if d == 0:
            return
        for t in (0.35, 0.62, 0.85) if d > 1 else (0.5,):
            bx, by = x + math.cos(a) * L * t, y + math.sin(a) * L * t
            for side in (-1, 1):
                arm(bx, by, a + side * math.pi / 3, L * (0.42 - 0.12 * t) * (1 + rnd.uniform(-0.05, 0.05)), d - 1, w * 0.7)

    for k in range(6):
        arm(cx, cy, math.radians(rot + k * 60), r, depth, lw)
    out = "".join(f'<line x1="{fmt(a)}" y1="{fmt(b)}" x2="{fmt(c)}" y2="{fmt(d)}" stroke="{color}" stroke-width="{fmt(w)}" stroke-linecap="round"/>' for a, b, c, d, w in segs)
    hexa = poly_d([pt(cx, cy, r * 0.16, rot + 30 + k * 60) for k in range(6)])
    return f'<g opacity="{op}">{out}<path d="{hexa}" fill="{color}" opacity="0.8"/></g>'


def crystal(card, cx, base, s=1.0, cols=("#F4FBFF", "#B9E2FF", "#6A9AD8"), seed=1, n=5):
    """Grappe de cristaux de quartz : prismes hexagonaux pointus, facettes claires et sombres."""
    rnd = random.Random(seed)
    out = []
    for k in range(n):
        a = rnd.uniform(-38, 38)
        L = rnd.uniform(40, 80) * s * (1.25 if k == n // 2 else 1)
        w = rnd.uniform(9, 14) * s
        x = cx + rnd.uniform(-18, 18) * s
        body = f"M{fmt(-w)} 0 L{fmt(-w)} {fmt(-L)} L0 {fmt(-L - w * 1.6)} L{fmt(w)} {fmt(-L)} L{fmt(w)} 0Z"
        out.append(tf(f'<path d="{body}" fill="{cols[1]}" opacity="0.85"/><path d="M0 0 L0 {fmt(-L - w * 1.6)} L{fmt(w)} {fmt(-L)} L{fmt(w)} 0Z" fill="{cols[2]}" opacity="0.6"/>'
                      f'<path d="M{fmt(-w)} {fmt(-L)} L0 {fmt(-L - w * 1.6)} L0 {fmt(-L * 0.9)}Z" fill="{cols[0]}" opacity="0.9"/>'
                      f'<path d="{body}" fill="none" stroke="#FFFFFF" stroke-width="0.8" opacity="0.8"/>', x, base, a))
    out.append(sparkle(cx + 6 * s, base - 70 * s, 9 * s, "#FFFFFF", 0.9))
    return "".join(out)


def flower_of_life(cx, cy, r, color, lw=0.8, rings=1, op=0.8):
    cs = [(cx, cy)]
    for k in range(6):
        cs.append(pt(cx, cy, r, k * 60))
    if rings > 1:
        for k in range(6):
            cs.append(pt(cx, cy, r * 2, k * 60))
            cs.append(pt(cx, cy, r * math.sqrt(3), k * 60 + 30))
    return f'<g opacity="{op}">' + "".join(f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(r)}" fill="none" stroke="{color}" stroke-width="{lw}"/>' for x, y in cs) + f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r * (rings + 1))}" fill="none" stroke="{color}" stroke-width="{lw * 1.4}"/></g>'


def diatom(cx, cy, r, color="#BFF3FF", n=18, op=0.9):
    """Diatomée : micro-algue à coque de verre, rosace rayonnante (l'infime dans l'étang)."""
    out = [f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r)}" fill="{color}" fill-opacity="0.08" stroke="{color}" stroke-width="1.2"/>',
           f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r * 0.3)}" fill="none" stroke="{color}" stroke-width="0.8"/>']
    for k in range(n):
        a = k * 360 / n
        p1, p2 = pt(cx, cy, r * 0.3, a), pt(cx, cy, r * 0.95, a)
        out.append(f'<line x1="{fmt(p1[0])}" y1="{fmt(p1[1])}" x2="{fmt(p2[0])}" y2="{fmt(p2[1])}" stroke="{color}" stroke-width="0.7"/>')
        for t in (0.45, 0.6, 0.75, 0.88):
            p = pt(cx, cy, r * t, a + 180 / n)
            out.append(f'<circle cx="{fmt(p[0])}" cy="{fmt(p[1])}" r="{fmt(r * 0.03)}" fill="{color}"/>')
    return f'<g opacity="{op}">{"".join(out)}</g>'


def particle_tracks(cx, cy, seed=1, n=8, color="#9FE8FF", scale=1.0, op=0.85, colors=None):
    """Traces de particules dans une chambre à bulles : chaque particule perd son énergie et s'enroule en spirale."""
    rnd = random.Random(seed)
    out = []
    for k in range(n):
        x, y = cx, cy
        a = rnd.uniform(0, 2 * math.pi)
        cw = rnd.choice((1, -1))
        curv = rnd.uniform(0.004, 0.02) / scale
        grow = rnd.uniform(1.02, 1.05)
        step = 2.2 * scale
        pts = [(x, y)]
        for i in range(rnd.randint(90, 200)):
            a += cw * curv
            curv = min(curv * grow, 0.6)
            x += math.cos(a) * step
            y += math.sin(a) * step
            pts.append((x, y))
        col = (colors[k % len(colors)] if colors else color)
        out.append(f'<path d="{poly_d(pts, False)}" fill="none" stroke="{col}" stroke-width="{fmt(rnd.uniform(0.7, 1.3))}" stroke-dasharray="{fmt(rnd.uniform(1.6, 3))} 1.1" opacity="{fmt(op)}" stroke-linecap="round"/>')
    out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="2.6" fill="#FFFFFF"/>' + sparkle(cx, cy, 9, "#FFFFFF", 0.9))
    return "".join(out)


def quantum_foam(card, region, seed=1, n=70, color="#B9A7FF", avoid=None, op=0.6):
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if avoid and avoid[0] < x < avoid[2] and avoid[1] < y < avoid[3]:
            continue
        r = rnd.uniform(2, 11)
        out.append(f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(r)}" fill="{color}" fill-opacity="0.08" stroke="{color}" stroke-width="0.7"/>')
        out.append(f'<circle cx="{fmt(x - r * 0.35)}" cy="{fmt(y - r * 0.35)}" r="{fmt(r * 0.2)}" fill="#FFFFFF" opacity="0.6"/>')
    return f'<g opacity="{op}">{"".join(out)}</g>'


def string_loop(cx, cy, r, k=7, amp=0.12, color="#FFB0E8", lw=1.3, rot=0, op=0.9):
    """Une corde vibrante fermée : un cercle modulé par ses harmoniques."""
    pts = [(cx + math.cos(a) * r * (1 + amp * math.sin(k * a + rot)), cy + math.sin(a) * r * (1 + amp * math.sin(k * a + rot))) for a in [i * 2 * math.pi / 120 for i in range(120)]]
    return f'<path d="{poly_d(pts)}" fill="none" stroke="{color}" stroke-width="{lw}" opacity="{op}"/>'


def wave_packet(x0, y, x1, amp, k=0.25, color="#9FE8FF", lw=1.4, op=0.9, angle=0):
    mid = (x0 + x1) / 2
    sig = (x1 - x0) / 5
    pts = [(x, y - amp * math.exp(-((x - mid) / sig) ** 2) * math.sin(k * (x - x0))) for x in [x0 + (x1 - x0) * i / 160 for i in range(161)]]
    env = [(x, y - amp * math.exp(-((x - mid) / sig) ** 2)) for x in [x0 + (x1 - x0) * i / 60 for i in range(61)]]
    env2 = [(x, y + amp * math.exp(-((x - mid) / sig) ** 2)) for x in [x0 + (x1 - x0) * i / 60 for i in range(61)]]
    g = (f'<path d="{poly_d(env, False)}" fill="none" stroke="{color}" stroke-width="0.6" stroke-dasharray="2 2" opacity="0.6"/>'
         f'<path d="{poly_d(env2, False)}" fill="none" stroke="{color}" stroke-width="0.6" stroke-dasharray="2 2" opacity="0.6"/>'
         f'<path d="{poly_d(pts, False)}" fill="none" stroke="{color}" stroke-width="{lw}"/>')
    return f'<g opacity="{op}" transform="rotate({angle} {fmt(mid)} {fmt(y)})">{g}</g>'


def orbital_p(card, cx, cy, r, color="#9FD8FF", rot=0, op=0.8):
    """Orbitales p : trois haltères de probabilité, lumière diffuse."""
    out = []
    for k in range(3):
        a = rot + k * 60
        for sgn in (-1, 1):
            p = pt(cx, cy, r * 0.55 * sgn, a)
            out.append(f'<ellipse cx="{fmt(p[0])}" cy="{fmt(p[1])}" rx="{fmt(r * 0.22)}" ry="{fmt(r * 0.48)}" fill="{color}" opacity="0.22" transform="rotate({fmt(a)} {fmt(p[0])} {fmt(p[1])})"/>')
            out.append(f'<ellipse cx="{fmt(p[0])}" cy="{fmt(p[1])}" rx="{fmt(r * 0.22)}" ry="{fmt(r * 0.48)}" fill="none" stroke="{color}" stroke-width="0.8" opacity="0.7" transform="rotate({fmt(a)} {fmt(p[0])} {fmt(p[1])})"/>')
    out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r * 0.08)}" fill="#FFFFFF"/>')
    return f'<g opacity="{op}">{"".join(out)}</g>'


def feynman(cx, cy, s, color="#FFE7A0", photon="#9FE8FF"):
    out = []
    for dx, dy in ((-1, -1), (-1, 1)):
        out.append(f'<line x1="{fmt(cx + dx * 30 * s)}" y1="{fmt(cy + dy * 22 * s)}" x2="{fmt(cx - 10 * s)}" y2="{fmt(cy)}" stroke="{color}" stroke-width="1.4"/>')
        out.append(f'<line x1="{fmt(cx + 30 * s)}" y1="{fmt(cy + dy * 22 * s)}" x2="{fmt(cx + 10 * s + 20 * s)}" y2="{fmt(cy)}" stroke="{color}" stroke-width="1.4" opacity="0"/>')
    for dy in (-1, 1):
        out.append(f'<line x1="{fmt(cx + 10 * s)}" y1="{fmt(cy)}" x2="{fmt(cx + 30 * s)}" y2="{fmt(cy + dy * 22 * s)}" stroke="{color}" stroke-width="1.4"/>')
    wv = [(cx - 10 * s + 20 * s * i / 40, cy + math.sin(i / 40 * math.pi * 6) * 3 * s) for i in range(41)]
    out.append(f'<path d="{poly_d(wv, False)}" fill="none" stroke="{photon}" stroke-width="1.4"/>')
    for x in (cx - 10 * s, cx + 10 * s):
        out.append(f'<circle cx="{fmt(x)}" cy="{fmt(cy)}" r="2" fill="#FFFFFF"/>')
    return "".join(out)


def scale_medallion(card, cx, cy, r, content, label=None, sub=None, ring="#E9DDFF", bg=("#1A1440", "#06040F"), font=None):
    """Médaillon d'échelle : une vignette ronde, son objet et sa puissance de dix."""
    out = [f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r + 3)}" fill="#000000" opacity="0.4" filter="{card.blur("med-sh", 3)}"/>',
           f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r)}" fill="{card.rgrad("med-bg", [(0, bg[0], 1), (1, bg[1], 1)])}" stroke="{ring}" stroke-width="1.6"/>']
    cid = clip(card, f"M{fmt(cx - r + 1)} {fmt(cy)} A{fmt(r - 1)} {fmt(r - 1)} 0 1 1 {fmt(cx + r - 1)} {fmt(cy)} A{fmt(r - 1)} {fmt(r - 1)} 0 1 1 {fmt(cx - r + 1)} {fmt(cy)}Z")
    out.append(f'<g clip-path="{cid}">{content}</g>')
    out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r - 3.5)}" fill="none" stroke="{ring}" stroke-width="0.6" opacity="0.6"/>')
    if label:
        out.append(f'<text x="{fmt(cx)}" y="{fmt(cy + r + 12)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="8.5" letter-spacing="1.2" fill="#FFFFFF">{esc(label)}</text>')
    if sub:
        out.append(f'<text x="{fmt(cx)}" y="{fmt(cy + r + 22)}" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="8" fill="{ring}">{sub}</text>')
    return "".join(out)
