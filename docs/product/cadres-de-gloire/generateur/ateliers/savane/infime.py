"""Afrique éternelle - l'infiniment petit : atomes, noyaux, quarks, ADN, molécules, cellules, neurones,
ondes quantiques, orbitales, cristaux, flocons, pollen, mousse quantique, cordes, traces de particules,
et l'infiniment grand qui leur répond : la toile cosmique.

Chaque motif rend une chaîne SVG ; ceux qui ont besoin de dégradés reçoivent la carte et un nom unique.
"""

import math
import random

from base import W, H, f, pt, sparkle

from cosmos import ublur, cstar


def _halo(card, name, cx, cy, r, color, op):
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{card.rgrad(name, [(0, color, op), (0.45, color, op * 0.35), (1, color, 0)])}"/>'


def ball(card, name, cx, cy, r, hi, mid, lo, glow=None):
    """Une sphère éclairée en haut à gauche (nucléon, électron, perle, pollen)."""
    g = card.rgrad(name, [(0, hi, 1), (0.45, mid, 1), (1, lo, 1)], 0.5, 0.5, 0.6, 0.36, 0.3)
    out = ""
    if glow:
        out += _halo(card, name + "-g", cx, cy, r * 2.4, glow, 0.35)
    return out + f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/>'


# ---------------------------------------------------------------- l'atome

PROTON = ("#FFE2C8", "#F0603C", "#6A1408")
NEUTRON = ("#EAF4FF", "#7FA8E8", "#1A2E6A")


def nucleus(card, name, cx, cy, r, n=14, seed=3, glow="#FFB48A", palette=(PROTON, NEUTRON)):
    """Un noyau atomique : nucléons serrés en boule, protons et neutrons, l'avant devant l'arrière."""
    rnd = random.Random(seed)
    pts = []
    ga = math.pi * (3 - math.sqrt(5))
    for i in range(n):
        z = 1 - 2 * (i + 0.5) / n
        rr = math.sqrt(max(0, 1 - z * z))
        a = i * ga + rnd.uniform(-0.2, 0.2)
        pts.append((rr * math.cos(a), rr * math.sin(a), z, rnd.random() < 0.5))
    pts.sort(key=lambda p: p[2])
    rn = r * 0.42
    out = [_halo(card, name + "-h", cx, cy, r * 2.6, glow, 0.45)]
    for i, (x, y, z, proton) in enumerate(pts):
        hi, mid, lo = palette[0] if proton else palette[1]
        g = card.rgrad(f"{name}-{'p' if proton else 'n'}", [(0, hi, 1), (0.45, mid, 1), (1, lo, 1)], 0.5, 0.5, 0.6, 0.36, 0.3)
        k = 0.78 + 0.22 * (z + 1) / 2
        out.append(f'<circle cx="{f(cx + x * r * 0.62)}" cy="{f(cy + y * r * 0.62)}" r="{f(rn * k)}" fill="{g}"/>')
    return "".join(out)


def atom(card, name, cx, cy, r, tilt=0.3, orbits=3, rot0=-30, color="#BFE6FF", electron="#FFFFFF", w=1.3,
         nucleus_r=None, seed=5, nucleons=12, phase=0.0, glow=True):
    """L'atome : orbites inclinées, électrons lumineux, noyau de nucléons."""
    out = []
    if glow:
        out.append(_halo(card, name + "-ah", cx, cy, r * 1.25, color, 0.16))
    blur = ublur(card, name + "-ob", 2.2)
    for k in range(orbits):
        ang = rot0 + k * 180 / orbits
        el = f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r)}" ry="{f(r * tilt)}" transform="rotate({f(ang)} {f(cx)} {f(cy)})" fill="none" stroke="{color}"'
        out.append(el + f' stroke-width="{f(w * 3)}" opacity="0.35" filter="{blur}"/>')
        out.append(el + f' stroke-width="{f(w)}" opacity="0.9"/>')
    out.append(nucleus(card, name + "-nu", cx, cy, nucleus_r or r * 0.2, nucleons, seed))
    for k in range(orbits):
        ang = math.radians(rot0 + k * 180 / orbits)
        t = phase + 0.8 + k * 2.1
        ex, ey = r * math.cos(t), r * tilt * math.sin(t)
        x = cx + ex * math.cos(ang) - ey * math.sin(ang)
        y = cy + ex * math.sin(ang) + ey * math.cos(ang)
        out.append(_halo(card, name + "-eh", x, y, r * 0.16, electron, 0.8))
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(max(1.6, r * 0.035))}" fill="{electron}"/>')
    return "".join(out)


def quarks(card, name, cx, cy, r, rot=0, colors=(("#FFD0D0", "#FF3A4A", "#6A0010"), ("#D8FFD8", "#2FD06A", "#00501A"), ("#D8E6FF", "#3A7AFF", "#001A6A"))):
    """Trois quarks (rouge, vert, bleu) liés par des gluons - un proton vu de très près."""
    out = [_halo(card, name + "-h", cx, cy, r * 2.2, "#FFFFFF", 0.22)]
    pos = [pt(cx, cy, r, rot + i * 120) for i in range(3)]
    for i in range(3):
        (x0, y0), (x1, y1) = pos[i], pos[(i + 1) % 3]
        L = math.hypot(x1 - x0, y1 - y0)
        ux, uy = (x1 - x0) / L, (y1 - y0) / L
        nx, ny = -uy, ux
        pts = []
        loops = 7
        for j in range(loops * 12 + 1):
            t = j / (loops * 12)
            ph = t * loops * 2 * math.pi
            along = t * L + math.sin(ph) * r * 0.08 - r * 0.0
            off = math.cos(ph) * r * 0.12
            pts.append((x0 + ux * along + nx * off, y0 + uy * along + ny * off))
        d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts)
        out.append(f'<path d="{d}" fill="none" stroke="#FFF4C8" stroke-width="{f(r * 0.05)}" opacity="0.85"/>')
    for i, (x, y) in enumerate(pos):
        hi, mid, lo = colors[i]
        out.append(ball(card, f"{name}-q{i}", x, y, r * 0.3, hi, mid, lo, glow=mid))
    return "".join(out)


# ---------------------------------------------------------------- la vie

def dna(x, y0, y1, amp, period, c1="#9FE8FF", c2="#FFB0E0", rungs=("#FFD36E", "#6EF0C2", "#FF6FB1", "#6EA8FF"), w=3.0, phase=0.0, rung_step=None, op=1.0):
    """La double hélice d'ADN, verticale : deux brins en profondeur, paires de bases colorées."""
    n = max(2, int(abs(y1 - y0) / 1.5))
    step = rung_step or period / 10
    back, front, rg = [], [], []

    def strand(off, col):
        for i in range(n):
            ya, yb = y0 + (y1 - y0) * i / n, y0 + (y1 - y0) * (i + 1) / n
            aa = 2 * math.pi * (ya - y0) / period + phase + off
            ab = 2 * math.pi * (yb - y0) / period + phase + off
            z = math.cos((aa + ab) / 2)
            seg = (f'<line x1="{f(x + amp * math.sin(aa))}" y1="{f(ya)}" x2="{f(x + amp * math.sin(ab))}" y2="{f(yb)}" '
                   f'stroke="{col}" stroke-width="{f(w * (0.55 + 0.45 * (z + 1) / 2))}" stroke-linecap="round" opacity="{f((0.3 + 0.7 * (z + 1) / 2) * op)}"/>')
            (front if z >= 0 else back).append(seg)

    strand(0, c1)
    strand(math.pi, c2)
    k = 0
    yy = y0 + step / 2
    while (yy < y1) if y1 > y0 else (yy > y1):
        a = 2 * math.pi * (yy - y0) / period + phase
        xa, xb = x + amp * math.sin(a), x + amp * math.sin(a + math.pi)
        xm = (xa + xb) / 2
        z = abs(math.cos(a))
        o = (0.35 + 0.5 * (1 - z)) * op
        ca, cb = rungs[k % 4], rungs[(k + 2) % 4]
        rg.append(f'<line x1="{f(xa)}" y1="{f(yy)}" x2="{f(xm)}" y2="{f(yy)}" stroke="{ca}" stroke-width="{f(w * 0.55)}" opacity="{f(o)}"/>'
                  f'<line x1="{f(xm)}" y1="{f(yy)}" x2="{f(xb)}" y2="{f(yy)}" stroke="{cb}" stroke-width="{f(w * 0.55)}" opacity="{f(o)}"/>')
        k += 1
        yy += step if y1 > y0 else -step
    return "".join(back) + "".join(rg) + "".join(front)


def molecule(x, y, s, rot=0, bond="#E8F4FF", atoms=("#3A3A44", "#E04848", "#4A7AFF", "#F4F4F4"), seed=2, rings=2, glow_card=None):
    """Une molécule en boules et bâtonnets : cycles hexagonaux accolés et leurs substituants."""
    rnd = random.Random(seed)
    L = 14 * s
    nodes, edges = [], []

    def add(px, py):
        for i, (qx, qy) in enumerate(nodes):
            if math.hypot(px - qx, py - qy) < L * 0.3:
                return i
        nodes.append((px, py))
        return len(nodes) - 1

    centers = [(0, 0)]
    for k in range(1, rings):
        cx_, cy_ = centers[-1]
        a = math.radians(30 + 60 * rnd.choice((0, 1, 5)))
        centers.append((cx_ + math.sqrt(3) * L * math.cos(a), cy_ + math.sqrt(3) * L * math.sin(a)))
    for cx_, cy_ in centers:
        ids = [add(cx_ + L * math.cos(math.radians(60 * i + 30)), cy_ + L * math.sin(math.radians(60 * i + 30))) for i in range(6)]
        for i in range(6):
            e = tuple(sorted((ids[i], ids[(i + 1) % 6])))
            if e not in edges:
                edges.append(e)
    base = list(range(len(nodes)))
    for i in base:
        if rnd.random() < 0.45:
            nx, ny = nodes[i]
            cx_, cy_ = min(centers, key=lambda c: math.hypot(c[0] - nx, c[1] - ny))
            a = math.atan2(ny - cy_, nx - cx_)
            j = add(nx + L * 0.9 * math.cos(a), ny + L * 0.9 * math.sin(a))
            edges.append((i, j))
    cr, sr = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    P = [(x + px * cr - py * sr, y + px * sr + py * cr) for px, py in nodes]
    out = [f'<g stroke="{bond}" stroke-width="{f(2.2 * s)}" stroke-linecap="round" opacity="0.85">']
    out += [f'<line x1="{f(P[a][0])}" y1="{f(P[a][1])}" x2="{f(P[b][0])}" y2="{f(P[b][1])}"/>' for a, b in edges]
    out.append("</g>")
    for i, (px, py) in enumerate(P):
        col = atoms[0] if i < len(base) and rnd.random() < 0.8 else rnd.choice(atoms[1:])
        r = 4.2 * s if col == atoms[0] else 3.4 * s
        out.append(f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(r)}" fill="{col}" stroke="{bond}" stroke-width="{f(0.8 * s)}"/>')
        out.append(f'<circle cx="{f(px - r * 0.3)}" cy="{f(py - r * 0.35)}" r="{f(r * 0.35)}" fill="#FFFFFF" opacity="0.7"/>')
    return "".join(out)


def _clip_poly(poly, px, py, nx, ny):
    out = []
    n = len(poly)
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        da = (ax - px) * nx + (ay - py) * ny
        db = (bx - px) * nx + (by - py) * ny
        if da <= 0:
            out.append((ax, ay))
        if (da < 0 < db) or (db < 0 < da):
            t = da / (da - db)
            out.append((ax + (bx - ax) * t, ay + (by - ay) * t))
    return out


def voronoi(sites, box):
    x0, y0, x1, y1 = box
    cells = []
    for i, (sx, sy) in enumerate(sites):
        poly = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
        for j, (tx, ty) in enumerate(sites):
            if i == j or not poly:
                continue
            poly = _clip_poly(poly, (sx + tx) / 2, (sy + ty) / 2, tx - sx, ty - sy)
        cells.append(poly)
    return cells


def rounded(poly, k=0.5):
    """Polygone aux angles arrondis (milieux des arêtes reliés par des quadratiques)."""
    n = len(poly)
    if n < 3:
        return ""
    mids = [((poly[i][0] + poly[(i + 1) % n][0]) / 2, (poly[i][1] + poly[(i + 1) % n][1]) / 2) for i in range(n)]
    d = [f"M{f(mids[-1][0])} {f(mids[-1][1])}"]
    for i in range(n):
        d.append(f"Q{f(poly[i][0])} {f(poly[i][1])} {f(mids[i][0])} {f(mids[i][1])}")
    return " ".join(d) + " Z"


def tissue(card, name, box, n, seed=4, fill=("#F2B24A", "#B8601C"), membrane="#FFF2D0", nucleus_c="#5A2408", gap=0.86, op=1.0, keep=None, organelles=True, jitter=1.0):
    """Un tissu de cellules (diagramme de Voronoï) - lu de près, c'est aussi la robe de la girafe."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = box
    sites = []
    tries = 0
    while len(sites) < n and tries < n * 40:
        tries += 1
        p = (rnd.uniform(x0, x1), rnd.uniform(y0, y1))
        if keep and keep(*p):
            continue
        dmin = math.sqrt((x1 - x0) * (y1 - y0) / n) * 0.62 * jitter
        if all(math.hypot(p[0] - q[0], p[1] - q[1]) > dmin for q in sites):
            sites.append(p)
    cells = voronoi(sites, (x0 - 30, y0 - 30, x1 + 30, y1 + 30))
    g = card.rgrad(name + "-cy", [(0, fill[0], 1), (0.7, fill[1], 1), (1, fill[1], 1)], 0.5, 0.5, 0.62, 0.4, 0.35)
    out = [f'<g opacity="{f(op)}">']
    for (sx, sy), poly in zip(sites, cells):
        if len(poly) < 3:
            continue
        cxp = sum(p[0] for p in poly) / len(poly)
        cyp = sum(p[1] for p in poly) / len(poly)
        shrunk = [(cxp + (p[0] - cxp) * gap, cyp + (p[1] - cyp) * gap) for p in poly]
        d = rounded(shrunk)
        out.append(f'<path d="{d}" fill="{g}" stroke="{membrane}" stroke-width="1.1" stroke-opacity="0.75"/>')
        rr = math.sqrt(abs(sum(shrunk[i][0] * shrunk[(i + 1) % len(shrunk)][1] - shrunk[(i + 1) % len(shrunk)][0] * shrunk[i][1] for i in range(len(shrunk))) / 2) / math.pi)
        nr = rr * rnd.uniform(0.26, 0.34)
        nx, ny = cxp + rnd.uniform(-rr * 0.18, rr * 0.18), cyp + rnd.uniform(-rr * 0.18, rr * 0.18)
        out.append(f'<ellipse cx="{f(nx)}" cy="{f(ny)}" rx="{f(nr)}" ry="{f(nr * 0.85)}" fill="{nucleus_c}" opacity="0.85"/>')
        out.append(f'<circle cx="{f(nx - nr * 0.25)}" cy="{f(ny - nr * 0.2)}" r="{f(nr * 0.32)}" fill="{membrane}" opacity="0.55"/>')
        if organelles:
            for _ in range(rnd.randint(2, 4)):
                a = rnd.uniform(0, 2 * math.pi)
                dd = rr * rnd.uniform(0.45, 0.62)
                ox, oy = cxp + dd * math.cos(a), cyp + dd * math.sin(a)
                out.append(f'<ellipse cx="{f(ox)}" cy="{f(oy)}" rx="{f(rr * 0.12)}" ry="{f(rr * 0.06)}" transform="rotate({f(math.degrees(a) + 90)} {f(ox)} {f(oy)})" fill="{membrane}" opacity="0.45"/>')
    out.append("</g>")
    return "".join(out)


def neuron(card, name, x, y, s, seed=3, color="#BFE6FF", glow="#7FB8FF", axon_angle=90, axon_len=120, dendrites=6, sparks=True):
    """Un neurone : corps cellulaire, dendrites ramifiées, axone et boutons synaptiques qui s'allument."""
    rnd = random.Random(seed)
    lines = []
    tips = []

    def branch(x0, y0, ang, ln, wd, depth):
        a1 = ang + rnd.uniform(-22, 22)
        xm, ym = pt(x0, y0, ln * 0.5, ang)
        x1, y1 = pt(xm, ym, ln * 0.5, a1)
        lines.append(f'<path d="M{f(x0)} {f(y0)} Q{f(xm)} {f(ym)} {f(x1)} {f(y1)}" fill="none" stroke-width="{f(wd)}"/>')
        if depth > 0:
            for _ in range(2):
                branch(x1, y1, a1 + rnd.uniform(-38, 38), ln * rnd.uniform(0.55, 0.75), wd * 0.62, depth - 1)
        else:
            tips.append((x1, y1))

    for i in range(dendrites):
        a = axon_angle + 180 + (i - (dendrites - 1) / 2) * (250 / dendrites) + rnd.uniform(-10, 10)
        branch(*pt(x, y, 5 * s, a), a, 26 * s * rnd.uniform(0.8, 1.2), 2.4 * s, 2)
    ax_pts = []
    for i in range(13):
        t = i / 12
        bx, by = pt(x, y, 5 * s + axon_len * s * t, axon_angle + 9 * math.sin(t * 5 + seed))
        ax_pts.append((bx, by))
    d = "M" + " L".join(f"{f(px)} {f(py)}" for px, py in ax_pts)
    lines.append(f'<path d="{d}" fill="none" stroke-width="{f(1.8 * s)}"/>')
    ex, ey = ax_pts[-1]
    bout = []
    for i in range(4):
        tx, ty = pt(ex, ey, 12 * s * rnd.uniform(0.7, 1.2), axon_angle + (i - 1.5) * 26)
        lines.append(f'<line x1="{f(ex)}" y1="{f(ey)}" x2="{f(tx)}" y2="{f(ty)}" stroke-width="{f(1 * s)}"/>')
        bout.append((tx, ty))
    body = "".join(lines)
    out = [
        f'<g stroke="{glow}" stroke-linecap="round" opacity="0.55" filter="{ublur(card, name + "-gl", 2.5 * s)}">{body}</g>',
        f'<g stroke="{color}" stroke-linecap="round">{body}</g>',
        _halo(card, name + "-sh", x, y, 18 * s, glow, 0.55),
        ball(card, name + "-so", x, y, 6.5 * s, "#FFFFFF", color, glow),
    ]
    for bx, by in bout:
        out.append(f'<circle cx="{f(bx)}" cy="{f(by)}" r="{f(2 * s)}" fill="{color}"/>')
        if sparks:
            out.append(sparkle(bx, by, 5 * s, "#FFFFFF", 0.85))
    for tx, ty in tips[::3]:
        out.append(f'<circle cx="{f(tx)}" cy="{f(ty)}" r="{f(1.1 * s)}" fill="#FFFFFF" opacity="0.8"/>')
    return "".join(out)


# ---------------------------------------------------------------- le quantique

def wave_packet(x0, x1, y, amp, k, sigma, color, w=1.6, op=1.0, center=None, vertical=False, phase=0.0):
    """Un paquet d'ondes : une oscillation sous une enveloppe gaussienne - l'électron vu comme une onde."""
    xm = center if center is not None else (x0 + x1) / 2
    n = int(abs(x1 - x0) / 1.2) + 2
    pts = []
    for i in range(n + 1):
        xx = x0 + (x1 - x0) * i / n
        v = amp * math.exp(-((xx - xm) / sigma) ** 2) * math.cos(k * (xx - xm) + phase)
        pts.append((y + v, xx) if vertical else (xx, y + v))
    d = "M" + " L".join(f"{f(px)} {f(py)}" for px, py in pts)
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(w)}" stroke-linejoin="round" opacity="{f(op)}"/>'


def orbital_lobe(cx, cy, length, width, angle, fill, stroke=None, op=1.0):
    x1, y1 = pt(cx, cy, length, angle)
    a = math.radians(angle)
    ux, uy = math.sin(a), -math.cos(a)
    nx, ny = -uy, ux
    c1 = (cx + ux * length * 0.25 + nx * width, cy + uy * length * 0.25 + ny * width)
    c2 = (cx + ux * length * 1.05 + nx * width * 1.25, cy + uy * length * 1.05 + ny * width * 1.25)
    c3 = (cx + ux * length * 1.05 - nx * width * 1.25, cy + uy * length * 1.05 - ny * width * 1.25)
    c4 = (cx + ux * length * 0.25 - nx * width, cy + uy * length * 0.25 - ny * width)
    d = (f"M{f(cx)} {f(cy)} C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(x1)} {f(y1)} "
         f"C{f(c3[0])} {f(c3[1])} {f(c4[0])} {f(c4[1])} {f(cx)} {f(cy)} Z")
    st = f' stroke="{stroke}" stroke-width="0.9"' if stroke else ""
    return f'<path d="{d}" fill="{fill}"{st} opacity="{f(op)}"/>'


def orbital(card, name, cx, cy, size, kind="d", rot=0, plus=("#FFE6A8", "#E8B53C"), minus=("#BFE6FF", "#3A7AE0"), op=0.9):
    """Orbitales atomiques : p (deux lobes), d (trèfle à quatre), f (rosace à six) - phases en or et en bleu."""
    gp = card.rgrad(name + "-p", [(0, "#FFFFFF", 0.95), (0.35, plus[0], 0.9), (1, plus[1], 0.55)], 0.5, 0.5, 0.7)
    gm = card.rgrad(name + "-m", [(0, "#FFFFFF", 0.95), (0.35, minus[0], 0.9), (1, minus[1], 0.55)], 0.5, 0.5, 0.7)
    lobes = {"p": 2, "d": 4, "f": 6}[kind]
    out = [_halo(card, name + "-h", cx, cy, size * 1.4, plus[0], 0.18)]
    for i in range(lobes):
        a = rot + i * 360 / lobes
        out.append(orbital_lobe(cx, cy, size, size * (0.42 if kind != "f" else 0.3), a, gp if i % 2 == 0 else gm, "#FFFFFF", op))
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(size * 0.07)}" fill="#FFFFFF"/>')
    return "".join(out)


def interference(cx, y0, y1, half_w, fringes, color, op=0.6, w=2.2):
    """Des franges d'interférence : la figure des fentes de Young, la lumière qui se sait onde."""
    out = []
    for i in range(-fringes, fringes + 1):
        x = cx + i * half_w / fringes
        env = math.exp(-(i / (fringes * 0.62)) ** 2)
        out.append(f'<line x1="{f(x)}" y1="{f(y0)}" x2="{f(x)}" y2="{f(y1)}" stroke="{color}" stroke-width="{f(w * (0.4 + env))}" opacity="{f(op * env)}" stroke-linecap="round"/>')
    return "".join(out)


def foam(card, name, box, n, seed=8, color="#CFE0FF", hot="#FFFFFF", keep=None, rmin=1.5, rmax=12):
    """La mousse quantique : des bulles d'espace-temps qui naissent et meurent à l'échelle de Planck."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = box
    g = card.rgrad(name + "-b", [(0, color, 0.0), (0.7, color, 0.12), (0.93, hot, 0.85), (1, hot, 0)])
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if keep and keep(x, y):
            continue
        r = rmin + (rmax - rmin) * rnd.random() ** 2.6
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{g}" opacity="{f(rnd.uniform(0.45, 1))}"/>')
    return "".join(out)


def strings(x, y, r, seed=4, color="#FFD0F0", w=1.4, n=3, op=0.95):
    """Des cordes : boucles qui vibrent sur leurs modes propres."""
    rnd = random.Random(seed)
    out = []
    for k in range(n):
        cx, cy = x + rnd.uniform(-r, r), y + rnd.uniform(-r, r)
        rr = r * rnd.uniform(0.25, 0.5)
        mode = rnd.choice((3, 4, 5, 6))
        ph = rnd.uniform(0, 6.28)
        amp = rr * rnd.uniform(0.12, 0.22)
        pts = []
        for i in range(97):
            t = 2 * math.pi * i / 96
            rad = rr + amp * math.sin(mode * t + ph)
            pts.append((cx + rad * math.cos(t), cy + rad * math.sin(t) * 0.8))
        d = "M" + " L".join(f"{f(px)} {f(py)}" for px, py in pts) + " Z"
        out.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(w)}" opacity="{f(op)}"/>')
    return "".join(out)


def open_string(x0, y0, x1, y1, mode, amp, color, w=1.4, op=0.95):
    L = math.hypot(x1 - x0, y1 - y0)
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    nx, ny = -uy, ux
    pts = []
    for i in range(81):
        t = i / 80
        v = amp * math.sin(mode * math.pi * t)
        pts.append((x0 + ux * L * t + nx * v, y0 + uy * L * t + ny * v))
    d = "M" + " L".join(f"{f(px)} {f(py)}" for px, py in pts)
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(w)}" opacity="{f(op)}" stroke-linecap="round"/>'


def tracks(card, name, x, y, n=9, seed=6, colors=("#FFE6A8", "#9FE8FF", "#FFB0E0", "#D8FFE8"), length=120, w=1.2, spread=(0, 360)):
    """Traces de particules dans une chambre à bulles : spirales qui se resserrent, droites qui fuient."""
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        a = math.radians(rnd.uniform(*spread))
        curv = rnd.choice((-1, 1)) * (rnd.uniform(0.002, 0.03) if i % 3 else 0.0005)
        speed = rnd.uniform(0.6, 1.0) * length
        px, py = x, y
        pts = [(px, py)]
        steps = 140
        ds = speed / 60
        for s_ in range(steps):
            a += curv
            curv *= 1.022
            ds *= 0.99
            px += math.cos(a) * ds
            py += math.sin(a) * ds
            pts.append((px, py))
        d = "M" + " L".join(f"{f(qx)} {f(qy)}" for qx, qy in pts)
        col = colors[i % len(colors)]
        out.append(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{f(w)}" opacity="0.9" stroke-linecap="round"/>')
        dots = "".join(f'<circle cx="{f(qx)}" cy="{f(qy)}" r="{f(w * 0.9)}" fill="{col}" opacity="0.7"/>' for qx, qy in pts[::9])
        out.append(dots)
    out.append(_halo(card, name + "-v", x, y, 16, "#FFFFFF", 0.8))
    out.append(sparkle(x, y, 10, "#FFFFFF", 1))
    return f'<g>{"".join(out)}</g>'


# ---------------------------------------------------------------- la matière qui s'ordonne

def koch(cx, cy, r, depth=3, rot=0):
    pts = [pt(cx, cy, r, rot + i * 120) for i in range(3)]
    for _ in range(depth):
        new = []
        for i in range(len(pts)):
            (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % len(pts)]
            dx, dy = (x1 - x0) / 3, (y1 - y0) / 3
            a = (x0 + dx, y0 + dy)
            b = (x0 + 2 * dx, y0 + 2 * dy)
            px = a[0] + dx * 0.5 + dy * math.sqrt(3) / 2
            py = a[1] + dy * 0.5 - dx * math.sqrt(3) / 2
            new += [(x0, y0), a, (px, py), b]
        pts = new
    return "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + " Z"


def snowflake(cx, cy, r, color, w=1.4, rot=0, seed=1, op=1.0):
    """Un flocon dendritique à six branches : la symétrie de la glace, fractale."""
    rnd = random.Random(seed)
    out = []
    side = [(rnd.uniform(0.3, 0.42), rnd.uniform(0.28, 0.4)), (rnd.uniform(0.55, 0.65), rnd.uniform(0.2, 0.3)), (rnd.uniform(0.76, 0.84), rnd.uniform(0.12, 0.18))]
    for i in range(6):
        a = rot + i * 60
        x1, y1 = pt(cx, cy, r, a)
        out.append(f'<line x1="{f(cx)}" y1="{f(cy)}" x2="{f(x1)}" y2="{f(y1)}"/>')
        for t, ln in side:
            bx, by = pt(cx, cy, r * t, a)
            for s_ in (-1, 1):
                ex, ey = pt(bx, by, r * ln, a + s_ * 60)
                out.append(f'<line x1="{f(bx)}" y1="{f(by)}" x2="{f(ex)}" y2="{f(ey)}"/>')
        hx, hy = pt(cx, cy, r * 0.18, a)
        out.append(f'<line x1="{f(hx)}" y1="{f(hy)}" x2="{f(pt(cx, cy, r * 0.18, a + 60)[0])}" y2="{f(pt(cx, cy, r * 0.18, a + 60)[1])}"/>')
    return f'<g stroke="{color}" stroke-width="{f(w)}" stroke-linecap="round" opacity="{f(op)}">{"".join(out)}</g>'


def hex_prism(card, name, cx, cy, r, h, tilt=0.42, rot=0, tint="#CFE6FF", edge="#FFFFFF", op=0.85):
    """Un prisme hexagonal de glace (ou de quartz) : faces translucides, arêtes vives."""
    top = [(cx + r * math.cos(math.radians(rot + 60 * i)), cy + r * tilt * math.sin(math.radians(rot + 60 * i))) for i in range(6)]
    bot = [(x, y + h) for x, y in top]
    gs = card.grad(name + "-s", [(0, "#FFFFFF"), (0.5, tint), (1, "#5A7AB0")], 0, 0, 1, 0)
    out = []
    for i in range(6):
        a, b = top[i], top[(i + 1) % 6]
        if (a[1] + b[1]) / 2 < cy:
            continue
        d = f"M{f(a[0])} {f(a[1])} L{f(b[0])} {f(b[1])} L{f(bot[(i + 1) % 6][0])} {f(bot[(i + 1) % 6][1])} L{f(bot[i][0])} {f(bot[i][1])} Z"
        out.append(f'<path d="{d}" fill="{gs}" opacity="{f(op * (0.45 + 0.1 * i))}" stroke="{edge}" stroke-width="0.8" stroke-opacity="0.8"/>')
    dtop = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in top) + " Z"
    out.append(f'<path d="{dtop}" fill="{tint}" opacity="{f(op * 0.7)}" stroke="{edge}" stroke-width="1"/>')
    out.append(f'<path d="{dtop}" fill="none" stroke="#FFFFFF" stroke-width="0.6" transform="translate(0 {f(h * 0.5)})" opacity="0.25"/>')
    return "".join(out)


def crystal(card, name, x, gy, h, w, angle=0, light="#FFFFFF", mid="#B8D8FF", dark="#2A4A8A", op=0.92):
    """Une pointe de quartz : prisme hexagonal terminé en pyramide, trois faces visibles."""
    tip = h * 0.24
    xl, xm, xr = -w / 2, w * 0.08, w / 2
    faces = [
        (f"M{f(xl)} 0 L{f(xl)} {f(-h + tip)} L0 {f(-h)} L{f(xm)} {f(-h + tip * 0.9)} L{f(xm)} 0 Z", light, 0.9),
        (f"M{f(xm)} 0 L{f(xm)} {f(-h + tip * 0.9)} L0 {f(-h)} L{f(xr)} {f(-h + tip)} L{f(xr)} 0 Z", dark, 0.85),
    ]
    g1 = card.grad(name + "-l", [(0, light), (1, mid)], 0, 0, 1, 0)
    g2 = card.grad(name + "-d", [(0, mid), (1, dark)], 0, 0, 1, 0)
    out = [f'<g transform="translate({f(x)} {f(gy)}) rotate({f(angle)})" opacity="{f(op)}">']
    out.append(f'<path d="{faces[0][0]}" fill="{g1}" stroke="#FFFFFF" stroke-width="0.9" stroke-opacity="0.9"/>')
    out.append(f'<path d="{faces[1][0]}" fill="{g2}" stroke="#FFFFFF" stroke-width="0.9" stroke-opacity="0.7"/>')
    out.append(f'<path d="M{f(xl + w * 0.12)} {f(-h * 0.1)} L{f(xl + w * 0.12)} {f(-h + tip * 1.3)}" stroke="#FFFFFF" stroke-width="{f(w * 0.08)}" opacity="0.6" stroke-linecap="round"/>')
    out.append("</g>")
    return "".join(out)


def flower_of_life(cx, cy, r, color, w=1.0, rings=2, op=0.7):
    """La fleur de vie : des cercles égaux qui se croisent - géométrie sacrée commune à de nombreuses cultures."""
    centers = {(0.0, 0.0)}
    frontier = [(0.0, 0.0)]
    for _ in range(rings):
        nxt = []
        for x, y in frontier:
            for i in range(6):
                a = math.radians(60 * i + 30)
                p = (round(x + r * math.cos(a), 3), round(y + r * math.sin(a), 3))
                if all(math.hypot(p[0] - q[0], p[1] - q[1]) > r * 0.5 for q in centers):
                    centers.add(p)
                    nxt.append(p)
        frontier = nxt
    out = "".join(f'<circle cx="{f(cx + x)}" cy="{f(cy + y)}" r="{f(r)}"/>' for x, y in centers)
    return f'<g fill="none" stroke="{color}" stroke-width="{f(w)}" opacity="{f(op)}">{out}<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * (rings + 1))}"/></g>'


def pollen(card, name, cx, cy, r, seed=3, hi="#FFF6D0", mid="#F2C04A", lo="#7A4A10", spikes=34, glow="#FFE08A"):
    """Un grain de pollen échinulé (hérissé de pointes), comme celui que les chauves-souris portent de fleur de baobab en fleur de baobab."""
    rnd = random.Random(seed)
    out = [_halo(card, name + "-h", cx, cy, r * 2.2, glow, 0.35)]
    sp = []
    for i in range(spikes):
        a = i * 360 / spikes + rnd.uniform(-3, 3)
        x0, y0 = pt(cx, cy, r * 0.94, a - 3.5)
        x1, y1 = pt(cx, cy, r * (1.2 + rnd.uniform(-0.03, 0.05)), a)
        x2, y2 = pt(cx, cy, r * 0.94, a + 3.5)
        sp.append(f"M{f(x0)} {f(y0)} L{f(x1)} {f(y1)} L{f(x2)} {f(y2)} Z")
    out.append(f'<path d="{" ".join(sp)}" fill="{mid}"/>')
    out.append(ball(card, name + "-b", cx, cy, r, hi, mid, lo))
    ga = math.pi * (3 - math.sqrt(5))
    for i in range(int(spikes * 1.6)):
        z = 1 - 2 * (i + 0.5) / (spikes * 1.6)
        if z < 0.05:
            continue
        rr = math.sqrt(1 - z * z)
        a = i * ga
        x, y = cx + r * 0.9 * rr * math.cos(a), cy + r * 0.9 * rr * math.sin(a)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.055 * (0.5 + z))}" fill="{hi}" opacity="{f(0.4 + 0.5 * z)}"/>')
    for a in (40, 160, 280):
        x, y = pt(cx, cy, r * 0.45, a)
        out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(r * 0.14)}" ry="{f(r * 0.09)}" fill="{lo}" opacity="0.6"/>')
    return "".join(out)


# ---------------------------------------------------------------- l'immense qui leur répond

def cosmic_web(card, name, box, n, seed=5, color="#9FB8FF", node="#FFE6F4", keep=None, link=2.5, op=0.9):
    """La toile cosmique : amas de galaxies reliés par des filaments de matière noire et de gaz."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = box
    nodes = []
    tries = 0
    while len(nodes) < n and tries < n * 50:
        tries += 1
        p = (rnd.uniform(x0, x1), rnd.uniform(y0, y1))
        if keep and keep(*p):
            continue
        if all(math.hypot(p[0] - q[0], p[1] - q[1]) > math.sqrt((x1 - x0) * (y1 - y0) / n) * 0.55 for q in nodes):
            nodes.append(p)
    edges = set()
    for i, p in enumerate(nodes):
        near = sorted(range(len(nodes)), key=lambda j: math.hypot(p[0] - nodes[j][0], p[1] - nodes[j][1]))[1:4]
        for j in near[: int(link) + (1 if rnd.random() < link % 1 else 0)]:
            edges.add(tuple(sorted((i, j))))
    wide = ublur(card, name + "-wb", 4)
    out_w, out_t, dots = [], [], []
    for a, b in edges:
        (ax, ay), (bx, by) = nodes[a], nodes[b]
        mx, my = (ax + bx) / 2 + rnd.uniform(-14, 14), (ay + by) / 2 + rnd.uniform(-14, 14)
        d = f"M{f(ax)} {f(ay)} Q{f(mx)} {f(my)} {f(bx)} {f(by)}"
        out_w.append(f'<path d="{d}"/>')
        out_t.append(f'<path d="{d}"/>')
        for _ in range(int(math.hypot(bx - ax, by - ay) / 6)):
            t = rnd.random()
            qx = (1 - t) ** 2 * ax + 2 * (1 - t) * t * mx + t * t * bx + rnd.gauss(0, 2.2)
            qy = (1 - t) ** 2 * ay + 2 * (1 - t) * t * my + t * t * by + rnd.gauss(0, 2.2)
            dots.append(f'<circle cx="{f(qx)}" cy="{f(qy)}" r="{f(rnd.uniform(0.3, 1.0))}" fill="#FFFFFF" opacity="{f(rnd.uniform(0.4, 0.9))}"/>')
    out = [f'<g opacity="{f(op)}">',
           f'<g fill="none" stroke="{color}" stroke-width="7" opacity="0.32" filter="{wide}">{"".join(out_w)}</g>',
           f'<g fill="none" stroke="{color}" stroke-width="0.9" opacity="0.75">{"".join(out_t)}</g>',
           "".join(dots)]
    for i, (x, y) in enumerate(nodes):
        r = rnd.uniform(3, 7)
        out.append(_halo(card, name + "-n", x, y, r * 3, node, 0.55))
        for _ in range(int(r * 4)):
            rr = abs(rnd.gauss(0, r * 0.5))
            a = rnd.uniform(0, 6.28)
            out.append(f'<circle cx="{f(x + rr * math.cos(a))}" cy="{f(y + rr * math.sin(a))}" r="{f(rnd.uniform(0.3, 0.9))}" fill="#FFFFFF"/>')
    out.append("</g>")
    return "".join(out)


# ---------------------------------------------------------------- la loupe

def lens(card, name, cx, cy, r, content, metal=("#FFFFFF", "#C9D2DE", "#6D7889"), bg="#050812", w=4.5, glass="#9FD8FF"):
    """Une lentille ronde sertie : ce qu'on y voit est l'infiniment petit, grossi."""
    hi, mid, lo = metal
    card.def_once(name + "-c", f'<clipPath id="{card.id(name + "-c")}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}"/></clipPath>')
    rim = card.grad(name + "-r", [(0, hi), (0.35, mid), (0.5, lo), (0.65, mid), (1, hi)], 0, 0, 1, 1)
    bgf = card.rgrad(name + "-bg", [(0, glass, 0.28), (0.7, bg, 1), (1, bg, 1)], 0.5, 0.5, 0.6)
    return (
        f'<circle cx="{f(cx)}" cy="{f(cy + 3)}" r="{f(r + w)}" fill="#000000" opacity="0.5" filter="{card.blur(name + "-sh", 4)}"/>'
        f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{bgf}"/>'
        f'<g clip-path="url(#{card.id(name + "-c")})">{content}</g>'
        f'<path d="M{f(cx - r * 0.72)} {f(cy - r * 0.32)} A{f(r * 0.8)} {f(r * 0.8)} 0 0 1 {f(cx + r * 0.1)} {f(cy - r * 0.78)}" fill="none" stroke="#FFFFFF" stroke-width="{f(r * 0.06)}" stroke-linecap="round" opacity="0.35"/>'
        f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r + w / 2)}" fill="none" stroke="{rim}" stroke-width="{f(w)}"/>'
        f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r + w + 1.5)}" fill="none" stroke="{hi}" stroke-width="0.7" opacity="0.6"/>'
    )
