"""Les deux infinis : l'infiniment petit (atomes, orbitales, ADN, molécules, cristaux, cellules, neurones, diatomées,
pollen, traces de particules, mousse quantique, cordes) et l'infiniment grand (toile cosmique, amas de galaxies).
Chaque motif rend du SVG dans le repère de la carte ; ceux qui ont besoin de dégradés prennent la carte."""

import math
import random

from base import f, pt, sparkle
from motifs import nid, grp, soft, spikes


def _rg(card, name, stops, cx=0.5, cy=0.5, r=0.5, fx=None, fy=None):
    return card.rgrad(name, stops, cx, cy, r, fx, fy)


# ---------------------------------------------------------------- atomes et orbitales

def atom(card, cx, cy, r, color="#9FE8FF", core=("#FFE2A0", "#E0602B"), orbits=3, rot=0, electrons=True, w=1.2, op=0.9, glow=True):
    """Atome de Bohr : un noyau de nucléons et des orbites inclinées, chaque électron une étincelle."""
    uid = nid("at")
    out = []
    if glow:
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.25)}" fill="{_rg(card, uid + "-h", [(0, color, 0.28), (1, color, 0)])}"/>')
    for i in range(orbits):
        a = rot + i * 180 / orbits
        out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r)}" ry="{f(r * 0.34)}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{op}" transform="rotate({f(a)} {f(cx)} {f(cy)})"/>')
        if electrons:
            t = math.radians(40 + i * 77)
            ex, ey = r * math.cos(t), r * 0.34 * math.sin(t)
            ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
            x, y = cx + ex * ca - ey * sa, cy + ex * sa + ey * ca
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.09)}" fill="{color}" opacity="0.35"/><circle cx="{f(x)}" cy="{f(y)}" r="{f(max(1.2, r * 0.04))}" fill="#FFFFFF"/>')
    out.append(nucleus(card, cx, cy, r * 0.17, seed=int(cx + cy) % 97, tones=core, n=9))
    return "".join(out)


def nucleus(card, cx, cy, r, seed=3, tones=("#FFE2A0", "#E0602B"), n=14, neutron=("#CFE6FF", "#3A5A9A")):
    """Un noyau : protons et neutrons serrés, éclairés comme des perles."""
    rnd = random.Random(seed)
    p = _rg(card, "nuc-p", [(0, "#FFFFFF", 1), (0.35, tones[0], 1), (1, tones[1], 1)], 0.35, 0.3, 0.7)
    q = _rg(card, "nuc-n", [(0, "#FFFFFF", 1), (0.35, neutron[0], 1), (1, neutron[1], 1)], 0.35, 0.3, 0.7)
    balls = []
    for i in range(n):
        a = rnd.uniform(0, 2 * math.pi)
        d = r * 0.62 * math.sqrt(rnd.random())
        balls.append((cx + d * math.cos(a), cy + d * math.sin(a), rnd.random() < 0.5))
    balls.sort(key=lambda b: b[1])
    rb = r * 0.46
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.5)}" fill="{_rg(card, "nuc-g", [(0, tones[0], 0.5), (1, tones[0], 0)])}"/>' + "".join(
        f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rb)}" fill="{p if prot else q}"/>' for x, y, prot in balls)


def quarks(card, cx, cy, r, w=1.0):
    """Un nucléon ouvert : trois quarks (rouge, vert, bleu) liés par des gluons en ressort."""
    pts = [pt(cx, cy, r * 0.5, a) for a in (0, 120, 240)]
    cols = ("#FF5A6E", "#5AF0A0", "#5A9CFF")
    springs = []
    for i in range(3):
        (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % 3]
        n = 9
        d = [f"M{f(x1)} {f(y1)}"]
        L = math.hypot(x2 - x1, y2 - y1)
        nx, ny = -(y2 - y1) / L, (x2 - x1) / L
        for k in range(1, n * 2):
            t = k / (n * 2)
            amp = r * 0.08 * (1 if k % 2 else -1)
            d.append(f"L{f(x1 + (x2 - x1) * t + nx * amp)} {f(y1 + (y2 - y1) * t + ny * amp)}")
        d.append(f"L{f(x2)} {f(y2)}")
        springs.append(f'<path d="{" ".join(d)}" fill="none" stroke="#FFF4C2" stroke-width="{w}" opacity="0.85"/>')
    shell = _rg(card, "qk-shell", [(0, "#FFFFFF", 0.05), (0.8, "#B9A7FF", 0.18), (1, "#B9A7FF", 0.5)])
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{shell}" stroke="#E9DDFF" stroke-width="{w}" opacity="0.95"/>']
    out += springs
    for (x, y), c in zip(pts, cols):
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.3)}" fill="{c}" opacity="0.35"/><circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.15)}" fill="{c}"/><circle cx="{f(x - r * 0.04)}" cy="{f(y - r * 0.05)}" r="{f(r * 0.05)}" fill="#FFFFFF"/>')
    return "".join(out)


def orbital_cloud(card, cx, cy, r, color="#B48AFF", rot=0, lobes=3, op=0.75):
    """Orbitales p : des lobes de probabilité, nuages d'électron autour du noyau."""
    uid = nid("orb")
    g = _rg(card, uid, [(0, "#FFFFFF", op), (0.35, color, op * 0.7), (1, color, 0)], 0.5, 0.5, 0.5)
    out = []
    for i in range(lobes):
        a = rot + i * 180 / lobes
        for s in (1, -1):
            x, y = pt(cx, cy, r * 0.5, a + (0 if s > 0 else 180))
            out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(r * 0.22)}" ry="{f(r * 0.5)}" fill="{g}" transform="rotate({f(a)} {f(x)} {f(y)})"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.06)}" fill="#FFFFFF"/>')
    return "".join(out)


# ---------------------------------------------------------------- ADN et molécules

def dna(x0, y0, x1, y1, amp, turns, c1="#7FE0FF", c2="#FF8FD0", rung=("#FFE08A", "#9FFFD0", "#FF9A7A", "#B9A7FF"), w=2.2, steps=None, op=1.0):
    """Double hélice d'ADN entre deux points : deux brins en opposition de phase, paires de bases en barreaux.
    Le brin qui passe derrière est assombri : la profondeur se lit d'un coup d'œil."""
    L = math.hypot(x1 - x0, y1 - y0)
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    nx, ny = -uy, ux
    steps = steps or int(turns * 10)
    N = max(40, int(L / 2))

    def P(t, ph):
        s = math.sin(2 * math.pi * turns * t + ph)
        return x0 + ux * L * t + nx * amp * s, y0 + uy * L * t + ny * amp * s, math.cos(2 * math.pi * turns * t + ph)

    segs_back, segs_front, rungs = [], [], []
    for ph, col in ((0, c1), (math.pi, c2)):
        for i in range(N):
            ta, tb = i / N, (i + 1) / N
            xa, ya, za = P(ta, ph)
            xb, yb, _ = P(tb, ph)
            seg = f'<line x1="{f(xa)}" y1="{f(ya)}" x2="{f(xb)}" y2="{f(yb)}" stroke="{col}" stroke-width="{f(w if za > 0 else w * 0.8)}" stroke-linecap="round" opacity="{f(op if za > 0 else op * 0.4)}"/>'
            (segs_front if za > 0 else segs_back).append(seg)
    for k in range(steps):
        t = (k + 0.5) / steps
        xa, ya, _ = P(t, 0)
        xb, yb, _ = P(t, math.pi)
        mx, my = (xa + xb) / 2, (ya + yb) / 2
        ca, cb = rung[k % len(rung)], rung[(k + 2) % len(rung)]
        rungs.append(f'<line x1="{f(xa)}" y1="{f(ya)}" x2="{f(mx)}" y2="{f(my)}" stroke="{ca}" stroke-width="{f(w * 0.75)}" opacity="{f(op * 0.8)}"/>'
                     f'<line x1="{f(mx)}" y1="{f(my)}" x2="{f(xb)}" y2="{f(yb)}" stroke="{cb}" stroke-width="{f(w * 0.75)}" opacity="{f(op * 0.8)}"/>')
    return "".join(segs_back) + "".join(rungs) + "".join(segs_front)


def molecule(cx, cy, s, color="#9FE8FF", atoms=("#FFFFFF", "#FF8FA0", "#9FC8FF"), rot=0, kind="ring"):
    """Une molécule en boules et bâtonnets : un cycle à six sommets et ses ramifications."""
    out = []
    pts = [pt(cx, cy, 14 * s, rot + 30 + 60 * i) for i in range(6)]
    bonds = [(pts[i], pts[(i + 1) % 6]) for i in range(6)]
    extra = []
    if kind == "ring":
        for i in (0, 2, 4):
            x, y = pts[i]
            ex, ey = pt(cx, cy, 30 * s, rot + 30 + 60 * i)
            extra.append(((x, y), (ex, ey), atoms[1 + i % 2]))
    else:
        for i in range(6):
            x, y = pts[i]
            ex, ey = pt(cx, cy, 28 * s, rot + 30 + 60 * i)
            extra.append(((x, y), (ex, ey), atoms[i % 3]))
    for (a, b) in bonds:
        out.append(f'<line x1="{f(a[0])}" y1="{f(a[1])}" x2="{f(b[0])}" y2="{f(b[1])}" stroke="{color}" stroke-width="{f(2.2 * s)}" opacity="0.85"/>')
    for i in (0, 2, 4):
        a, b = pts[i], pts[(i + 1) % 6]
        mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        kx, ky = (mx - cx) * 0.78 + cx, (my - cy) * 0.78 + cy
        dx, dy = (b[0] - a[0]) * 0.3, (b[1] - a[1]) * 0.3
        out.append(f'<line x1="{f(kx - dx)}" y1="{f(ky - dy)}" x2="{f(kx + dx)}" y2="{f(ky + dy)}" stroke="{color}" stroke-width="{f(1.4 * s)}" opacity="0.7"/>')
    for (a, b, col) in extra:
        out.append(f'<line x1="{f(a[0])}" y1="{f(a[1])}" x2="{f(b[0])}" y2="{f(b[1])}" stroke="{color}" stroke-width="{f(2 * s)}" opacity="0.8"/>')
        out.append(f'<circle cx="{f(b[0])}" cy="{f(b[1])}" r="{f(5.4 * s)}" fill="{col}" opacity="0.25"/><circle cx="{f(b[0])}" cy="{f(b[1])}" r="{f(3.4 * s)}" fill="{col}"/>')
    for x, y in pts:
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(3.6 * s)}" fill="{atoms[0]}"/><circle cx="{f(x)}" cy="{f(y)}" r="{f(6 * s)}" fill="{color}" opacity="0.2"/>')
    return "".join(out)


def lattice(cx, cy, s, n=3, color="#FFE08A", node="#FFF4C2", w=1.0, op=0.85, face=True):
    """Réseau cristallin cubique à faces centrées (celui de l'or), en perspective cavalière."""
    a = 26 * s
    ox, oy = 0.5 * a, -0.36 * a

    def P(i, j, k):
        return cx + (i - n / 2) * a + k * ox - n * ox / 2, cy + (j - n / 2) * a + k * oy - n * oy / 2

    lines, nodes = [], []
    for i in range(n + 1):
        for j in range(n + 1):
            for k in range(n + 1):
                x, y = P(i, j, k)
                if i < n:
                    x2, y2 = P(i + 1, j, k)
                    lines.append((x, y, x2, y2, k))
                if j < n:
                    x2, y2 = P(i, j + 1, k)
                    lines.append((x, y, x2, y2, k))
                if k < n:
                    x2, y2 = P(i, j, k + 1)
                    lines.append((x, y, x2, y2, k))
                nodes.append((x, y, k, 1.0))
                if face and i < n and j < n:
                    fx, fy = P(i + 0.5, j + 0.5, k)
                    nodes.append((fx, fy, k, 0.7))
    out = []
    for x, y, x2, y2, k in lines:
        o = op * (0.35 + 0.65 * (1 - k / max(1, n)))
        out.append(f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{color}" stroke-width="{w}" opacity="{f(o * 0.7)}"/>')
    for x, y, k, sz in sorted(nodes, key=lambda t: -t[2]):
        o = op * (0.45 + 0.55 * (1 - k / max(1, n)))
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(3.4 * s * sz)}" fill="{node}" opacity="{f(o)}"/>')
    return "".join(out)


# ---------------------------------------------------------------- cristaux, flocons, géométrie sacrée

def crystal(card, cx, cy, s=1.0, tones=("#F4E8FF", "#B48AFF", "#4A2A8A"), n=5, seed=4, rot=0):
    """Une druse de cristaux : prismes hexagonaux à pointe, facettes claires et sombres, éclat sur l'arête."""
    rnd = random.Random(seed)
    hi, mid, lo = tones
    uid = nid("cr")
    lit = card.grad(uid + "a", [(0, hi), (1, mid)], 0, 0, 1, 1)
    dark = card.grad(uid + "b", [(0, mid), (1, lo)], 0, 0, 1, 1)
    out = [f'<ellipse cx="{f(cx)}" cy="{f(cy + 4 * s)}" rx="{f(46 * s)}" ry="{f(18 * s)}" fill="{_rg(card, uid + "g", [(0, mid, 0.55), (1, mid, 0)])}"/>']
    specs = sorted(((rnd.uniform(-34, 34), rnd.uniform(40, 96), rnd.uniform(9, 15), rnd.uniform(-34, 34)) for _ in range(n)), key=lambda t: -t[1])
    for dx, hgt, wd, ang in specs:
        a = rot + ang * 0.8
        body = (f"M{f(-wd)} 0 L{f(-wd)} {f(-hgt)} L0 {f(-hgt - wd * 1.4)} L{f(wd)} {f(-hgt)} L{f(wd)} 0Z")
        left = f"M{f(-wd)} 0 L{f(-wd)} {f(-hgt)} L0 {f(-hgt - wd * 1.4)} L0 0Z"
        m = (f'<path d="{body}" fill="{dark}" stroke="{hi}" stroke-width="0.6" stroke-opacity="0.7"/>'
             f'<path d="{left}" fill="{lit}" opacity="0.9"/>'
             f'<path d="M0 0 L0 {f(-hgt - wd * 1.4)}" stroke="#FFFFFF" stroke-width="0.8" opacity="0.8"/>'
             f'<path d="M{f(-wd)} {f(-hgt)} L{f(wd)} {f(-hgt)}" stroke="{hi}" stroke-width="0.6" opacity="0.6"/>')
        out.append(grp(m, cx + dx * s, cy, s, a))
    out.append(sparkle(cx - 10 * s, cy - 70 * s, 7 * s, "#FFFFFF", 0.95))
    return "".join(out)


def snowflake(cx, cy, r, color="#DDF6FF", w=1.4, depth=3, rot=0, op=0.95):
    """Flocon fractal : six bras, chaque bras porte des branches qui portent des branches."""
    out = []

    def arm(x, y, ang, L, d):
        x2, y2 = pt(x, y, L, ang)
        out.append(f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{color}" stroke-width="{f(max(0.5, w * (0.55 + 0.15 * d)))}" stroke-linecap="round" opacity="{op}"/>')
        if d <= 0:
            return
        for t in (0.38, 0.66):
            bx, by = pt(x, y, L * t, ang)
            for s in (-60, 60):
                arm(bx, by, ang + s, L * (0.42 if t < 0.5 else 0.3), d - 1)

    for i in range(6):
        arm(cx, cy, rot + 60 * i, r, depth)
    out.append(f'<polygon points="{" ".join(f"{f(pt(cx, cy, r * 0.16, rot + 30 + 60 * i)[0])},{f(pt(cx, cy, r * 0.16, rot + 30 + 60 * i)[1])}" for i in range(6))}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{op}"/>')
    return "".join(out)


def flower_of_life(cx, cy, r, color="#F2C76A", w=0.9, rings=1, op=0.6):
    """Fleur de vie : des cercles de même rayon centrés sur les intersections des autres (géométrie sacrée)."""
    centers = {(0.0, 0.0)}
    for ring in range(1, rings + 1):
        for i in range(6):
            for k in range(ring):
                a1, a2 = math.radians(60 * i), math.radians(60 * (i + 1))
                x = ring * r * math.cos(a1) + k * r * (math.cos(a2) - math.cos(a1))
                y = ring * r * math.sin(a1) + k * r * (math.sin(a2) - math.sin(a1))
                centers.add((round(x, 2), round(y, 2)))
    out = [f'<circle cx="{f(cx + x)}" cy="{f(cy + y)}" r="{f(r)}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{op}"/>' for x, y in centers]
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * (rings + 1))}" fill="none" stroke="{color}" stroke-width="{f(w * 1.4)}" opacity="{op}"/>')
    return "".join(out)


def star_polygon(cx, cy, r, n, k, color, w=1.0, op=0.8, rot=0):
    """Polygone étoilé {n/k} (rosace de géométrie sacrée)."""
    pts = [pt(cx, cy, r, rot + 360 * i / n) for i in range(n)]
    out = []
    for i in range(n):
        a, b = pts[i], pts[(i + k) % n]
        out.append(f'<line x1="{f(a[0])}" y1="{f(a[1])}" x2="{f(b[0])}" y2="{f(b[1])}" stroke="{color}" stroke-width="{w}" opacity="{op}"/>')
    return "".join(out)


# ---------------------------------------------------------------- le vivant minuscule

def cell(card, cx, cy, r, tone=("#9FFFE0", "#2AAE8A", "#0B4A40"), seed=2, op=0.9):
    """Une cellule : membrane double, noyau et nucléole, mitochondries, réticulum en volutes."""
    rnd = random.Random(seed)
    hi, mid, lo = tone
    uid = nid("cell")
    body = _rg(card, uid, [(0, hi, 0.18), (0.75, mid, 0.28), (0.95, hi, 0.55), (1, hi, 0)])
    pts = []
    for i in range(24):
        a = 2 * math.pi * i / 24
        rr = r * (1 + 0.06 * math.sin(3 * a + seed) + 0.03 * math.sin(7 * a))
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d = "M" + " ".join(f"{f(x)} {f(y)}" for x, y in pts) + "Z"
    out = [f'<path d="{d}" fill="{body}" stroke="{hi}" stroke-width="1.4" opacity="{op}" stroke-linejoin="round"/>',
           f'<path d="{d}" fill="none" stroke="{hi}" stroke-width="0.6" opacity="0.5" transform="translate({f(cx * 0.06)} {f(cy * 0.06)}) scale(0.94)"/>']
    nx, ny = cx + r * 0.12, cy - r * 0.08
    out.append(f'<circle cx="{f(nx)}" cy="{f(ny)}" r="{f(r * 0.34)}" fill="{_rg(card, uid + "n", [(0, "#FFFFFF", 0.4), (0.6, mid, 0.55), (1, lo, 0.8)])}" stroke="{hi}" stroke-width="1"/>')
    out.append(f'<circle cx="{f(nx + r * 0.06)}" cy="{f(ny - r * 0.05)}" r="{f(r * 0.1)}" fill="{hi}" opacity="0.9"/>')
    for _ in range(4):
        a = rnd.uniform(0, 360)
        mx, my = pt(cx, cy, r * rnd.uniform(0.5, 0.72), a)
        out.append(f'<ellipse cx="{f(mx)}" cy="{f(my)}" rx="{f(r * 0.13)}" ry="{f(r * 0.06)}" fill="#FF9A7A" opacity="0.8" stroke="#FFD2B8" stroke-width="0.6" transform="rotate({f(a + 90)} {f(mx)} {f(my)})"/>')
    for _ in range(3):
        a = rnd.uniform(0, 360)
        sx, sy = pt(cx, cy, r * 0.55, a)
        ex, ey = pt(cx, cy, r * 0.62, a + 40)
        out.append(f'<path d="M{f(sx)} {f(sy)} q{f(r * 0.06)} {f(-r * 0.08)} {f((ex - sx) / 2)} {f((ey - sy) / 2)} t{f((ex - sx) / 2)} {f((ey - sy) / 2)}" fill="none" stroke="{hi}" stroke-width="0.9" opacity="0.6"/>')
    for _ in range(14):
        a = rnd.uniform(0, 360)
        gx, gy = pt(cx, cy, r * rnd.uniform(0.2, 0.85), a)
        out.append(f'<circle cx="{f(gx)}" cy="{f(gy)}" r="{f(rnd.uniform(0.6, 1.4))}" fill="{hi}" opacity="0.7"/>')
    return "".join(out)


def neuron(cx, cy, s, color="#FFD27A", seed=4, axon=(0, 120), branches=6, w=1.6, op=0.9):
    """Un neurone : le soma, des dendrites qui se ramifient, l'axon et ses boutons synaptiques."""
    rnd = random.Random(seed)
    out = []

    def branch(x, y, ang, L, d, ww):
        x2, y2 = pt(x, y, L, ang)
        mx, my = pt(x, y, L * 0.5, ang + rnd.uniform(-14, 14))
        out.append(f'<path d="M{f(x)} {f(y)} Q{f(mx)} {f(my)} {f(x2)} {f(y2)}" fill="none" stroke="{color}" stroke-width="{f(ww)}" stroke-linecap="round" opacity="{op}"/>')
        if d <= 0:
            out.append(f'<circle cx="{f(x2)}" cy="{f(y2)}" r="{f(ww * 1.1)}" fill="#FFFFFF" opacity="0.8"/>')
            return
        for da in (-28, 26):
            branch(x2, y2, ang + da + rnd.uniform(-10, 10), L * rnd.uniform(0.55, 0.75), d - 1, ww * 0.68)

    for i in range(branches):
        a = 360 * i / branches + rnd.uniform(-18, 18)
        if abs(((a - axon[0]) + 180) % 360 - 180) < 30:
            continue
        branch(cx, cy, a, 16 * s * rnd.uniform(0.8, 1.2), 2, w * s)
    ang, L = axon
    if L:
        x, y = cx, cy
        segs = 6
        pts_ = []
        for k in range(segs + 1):
            px, py = pt(cx, cy, L * s * k / segs, ang + 10 * math.sin(k * 1.3 + seed))
            pts_.append((px, py))
        d = "M" + " L".join(f"{f(px)} {f(py)}" for px, py in pts_)
        out.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(w * s * 0.9)}" stroke-linecap="round" stroke-linejoin="round" opacity="{op}"/>')
        for px, py in pts_[1:-1]:
            out.append(f'<ellipse cx="{f(px)}" cy="{f(py)}" rx="{f(3.2 * s)}" ry="{f(1.8 * s)}" fill="{color}" opacity="0.55" transform="rotate({f(ang - 90)} {f(px)} {f(py)})"/>')
        ex, ey = pts_[-1]
        for da in (-35, 0, 35):
            tx, ty = pt(ex, ey, 12 * s, ang + da)
            out.append(f'<line x1="{f(ex)}" y1="{f(ey)}" x2="{f(tx)}" y2="{f(ty)}" stroke="{color}" stroke-width="{f(w * s * 0.6)}" opacity="{op}"/>'
                       f'<circle cx="{f(tx)}" cy="{f(ty)}" r="{f(2.4 * s)}" fill="#FFFFFF" opacity="0.9"/><circle cx="{f(tx)}" cy="{f(ty)}" r="{f(6 * s)}" fill="{color}" opacity="0.25"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(13 * s)}" fill="{color}" opacity="0.22"/>')
    out.append(f'<path d="M{f(cx - 7 * s)} {f(cy + 5 * s)} Q{f(cx)} {f(cy - 12 * s)} {f(cx + 8 * s)} {f(cy + 4 * s)} Q{f(cx)} {f(cy + 9 * s)} {f(cx - 7 * s)} {f(cy + 5 * s)}Z" fill="{color}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(2.4 * s)}" fill="#FFFFFF"/>')
    return "".join(out)


def diatom(card, cx, cy, r, kind="centric", tone=("#E6FFFB", "#7FF0E0", "#1E7A80"), rot=0):
    """Diatomées et radiolaires : les joyaux de verre du plancton, géométrie pure à l'échelle du micron."""
    hi, mid, lo = tone
    uid = nid("dia")
    glass = _rg(card, uid, [(0, hi, 0.55), (0.6, mid, 0.3), (0.92, hi, 0.75), (1, hi, 0)])
    out = []
    if kind == "centric":
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{glass}" stroke="{hi}" stroke-width="1.1"/>')
        for ring in range(1, 5):
            rr = r * ring / 5
            n = 6 * ring
            out.append("".join(f'<circle cx="{f(pt(cx, cy, rr, rot + 360 * i / n)[0])}" cy="{f(pt(cx, cy, rr, rot + 360 * i / n)[1])}" r="{f(r * 0.045 * (1 + ring * 0.15))}" fill="{hi}" opacity="0.85"/>' for i in range(n)))
        out.append("".join(f'<line x1="{f(pt(cx, cy, r * 0.18, rot + 15 * i)[0])}" y1="{f(pt(cx, cy, r * 0.18, rot + 15 * i)[1])}" x2="{f(pt(cx, cy, r * 0.96, rot + 15 * i)[0])}" y2="{f(pt(cx, cy, r * 0.96, rot + 15 * i)[1])}" stroke="{hi}" stroke-width="0.5" opacity="0.5"/>' for i in range(24)))
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.16)}" fill="none" stroke="{hi}" stroke-width="1"/>')
    elif kind == "pennate":
        m = [f'<ellipse rx="{f(r)}" ry="{f(r * 0.28)}" fill="{glass}" stroke="{hi}" stroke-width="1"/>',
             f'<line x1="{f(-r * 0.86)}" y1="0" x2="{f(r * 0.86)}" y2="0" stroke="{hi}" stroke-width="0.9"/>',
             f'<circle r="{f(r * 0.06)}" fill="{hi}"/>']
        for i in range(-9, 10):
            x = i * r * 0.095
            hh = r * 0.26 * math.sqrt(max(0, 1 - (x / r) ** 2))
            m.append(f'<line x1="{f(x)}" y1="{f(-hh * 0.9)}" x2="{f(x)}" y2="{f(-r * 0.03)}" stroke="{hi}" stroke-width="0.7" opacity="0.75"/><line x1="{f(x)}" y1="{f(r * 0.03)}" x2="{f(x)}" y2="{f(hh * 0.9)}" stroke="{hi}" stroke-width="0.7" opacity="0.75"/>')
        out.append(grp("".join(m), cx, cy, 1, rot))
    else:
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.62)}" fill="{glass}" stroke="{hi}" stroke-width="1"/>')
        for i in range(12):
            a = rot + 30 * i
            x1, y1 = pt(cx, cy, r * 0.62, a)
            x2, y2 = pt(cx, cy, r * (1.0 if i % 2 == 0 else 0.84), a)
            out.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{hi}" stroke-width="1" stroke-linecap="round"/>')
        for i in range(7):
            a = rot + 360 * i / 7
            x, y = pt(cx, cy, r * 0.36, a)
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.17)}" fill="none" stroke="{hi}" stroke-width="0.8" opacity="0.85"/>')
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.17)}" fill="none" stroke="{hi}" stroke-width="0.8"/>')
    out.insert(0, f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.5)}" fill="{_rg(card, uid + "h", [(0, mid, 0.3), (1, mid, 0)])}"/>')
    return "".join(out)


def pollen(card, cx, cy, r, tone=("#FFF2B0", "#F2B33C", "#8A5A12"), seed=3, spikes_n=22):
    """Grain de pollen : une sphère grenue hérissée d'épines (comme celui du baobab ou du mil)."""
    rnd = random.Random(seed)
    hi, mid, lo = tone
    uid = nid("pol")
    body = _rg(card, uid, [(0, hi, 1), (0.6, mid, 1), (1, lo, 1)], 0.38, 0.32, 0.7)
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.7)}" fill="{_rg(card, uid + "g", [(0, mid, 0.35), (1, mid, 0)])}"/>']
    for i in range(spikes_n):
        a = 360 * i / spikes_n + rnd.uniform(-5, 5)
        x1, y1 = pt(cx, cy, r * 0.9, a)
        x2, y2 = pt(cx, cy, r * 1.32, a)
        out.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{mid}" stroke-width="{f(r * 0.09)}" stroke-linecap="round"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{body}"/>')
    for _ in range(int(r * 1.6)):
        a = rnd.uniform(0, 360)
        d = r * math.sqrt(rnd.random()) * 0.85
        x, y = pt(cx, cy, d, a)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.07)}" fill="{lo}" opacity="0.55"/>')
    for a in (0, 120, 240):
        x, y = pt(cx, cy, r * 0.45, a + 20)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.14)}" fill="{lo}" opacity="0.6"/>')
    return "".join(out)


def seed_spiral(card, cx, cy, s=1.0, tone=("#FFF0C2", "#E8B53C", "#7A4A0E"), turns=7, glow="#FFE08A"):
    """La graine po (le fonio) de la cosmogonie dogon : le monde y est enroulé en spirale avant d'éclore."""
    hi, mid, lo = tone
    uid = nid("po")
    body = _rg(card, uid, [(0, hi, 1), (0.6, mid, 1), (1, lo, 1)], 0.4, 0.35, 0.7)
    out = [f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(46 * s)}" ry="{f(62 * s)}" fill="{_rg(card, uid + "g", [(0, glow, 0.55), (1, glow, 0)])}"/>',
           f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(22 * s)}" ry="{f(32 * s)}" fill="{body}" stroke="{lo}" stroke-width="1"/>']
    d = []
    N = turns * 30
    for i in range(N):
        t = i / N
        a = t * turns * 2 * math.pi
        rr = 2 + t * 17 * s
        d.append(f"{f(cx + rr * math.cos(a) * 0.72)} {f(cy + rr * math.sin(a))}")
    out.append(f'<path d="M{" L".join(d)}" fill="none" stroke="{lo}" stroke-width="{f(1.1 * s)}" opacity="0.85"/>')
    out.append(f'<ellipse cx="{f(cx - 7 * s)}" cy="{f(cy - 14 * s)}" rx="{f(4 * s)}" ry="{f(8 * s)}" fill="#FFFFFF" opacity="0.55"/>')
    return "".join(out)


# ---------------------------------------------------------------- quantique

def wave_packet(x0, x1, y, amp, k, color, w=1.4, op=0.9, sigma=None, vertical=False):
    """Paquet d'ondes : une sinusoïde sous enveloppe gaussienne (la particule est aussi une onde)."""
    L = x1 - x0
    sigma = sigma or L / 5
    mid = (x0 + x1) / 2
    pts_ = []
    for i in range(0, int(L) + 1, 2):
        x = x0 + i
        e = math.exp(-((x - mid) ** 2) / (2 * sigma ** 2))
        yy = y + amp * e * math.sin(k * (x - mid))
        pts_.append((yy, x) if vertical else (x, yy))
    d = "M" + " L".join(f"{f(a)} {f(b)}" for a, b in pts_)
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{op}" stroke-linejoin="round"/>'


def particle_tracks(cx, cy, r, seed=7, colors=("#9FE8FF", "#FFD27A", "#FF8FD0", "#B9A7FF"), n=14, w=1.1, op=0.85):
    """Traces de particules dans une chambre à bulles : spirales serrées des électrons, arcs des muons, droites des photons."""
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        col = rnd.choice(colors)
        a0 = rnd.uniform(0, 2 * math.pi)
        kind = rnd.random()
        if kind < 0.4:
            curv = rnd.choice((-1, 1)) * rnd.uniform(0.03, 0.06)
            d = [f"{f(cx)} {f(cy)}"]
            x, y, a = cx, cy, a0
            step = 2.2
            L = r * rnd.uniform(0.5, 0.9)
            s = 0
            while s < L * 2.4:
                x += step * math.cos(a)
                y += step * math.sin(a)
                a += curv * (1 + s / L * 1.8)
                step *= 0.996
                s += 2.2
                d.append(f"{f(x)} {f(y)}")
            out.append(f'<path d="M{" L".join(d)}" fill="none" stroke="{col}" stroke-width="{w}" opacity="{op}" stroke-linecap="round"/>')
        elif kind < 0.75:
            L = r * rnd.uniform(0.6, 1.0)
            curv = rnd.uniform(-0.6, 0.6)
            ex, ey = cx + L * math.cos(a0), cy + L * math.sin(a0)
            mx, my = cx + L * 0.5 * math.cos(a0 + curv * 0.5), cy + L * 0.5 * math.sin(a0 + curv * 0.5)
            out.append(f'<path d="M{f(cx)} {f(cy)} Q{f(mx)} {f(my)} {f(ex)} {f(ey)}" fill="none" stroke="{col}" stroke-width="{w}" opacity="{op}"/>')
        else:
            L = r * rnd.uniform(0.7, 1.05)
            ex, ey = cx + L * math.cos(a0), cy + L * math.sin(a0)
            out.append(f'<line x1="{f(cx)}" y1="{f(cy)}" x2="{f(ex)}" y2="{f(ey)}" stroke="{col}" stroke-width="{f(w * 0.8)}" stroke-dasharray="1.5 3" opacity="{op}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="3" fill="#FFFFFF"/><circle cx="{f(cx)}" cy="{f(cy)}" r="9" fill="#FFFFFF" opacity="0.25"/>')
    return "".join(out)


def quantum_foam(cx, cy, r, seed=5, color="#B9A7FF", n=90, w=0.7, op=0.75, shape="circle"):
    """Mousse quantique : à l'échelle de Planck, l'espace bouillonne en bulles qui naissent et s'effacent."""
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        a = rnd.uniform(0, 2 * math.pi)
        d = r * math.sqrt(rnd.random())
        x, y = cx + d * math.cos(a), cy + d * math.sin(a) * (1 if shape == "circle" else 0.6)
        rr = rnd.uniform(1.5, 9) * (1 - d / r * 0.6)
        o = op * (1 - d / r) ** 0.6
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rr)}" fill="{color}" fill-opacity="{f(o * 0.12)}" stroke="{color}" stroke-width="{w}" opacity="{f(o)}"/>')
    return "".join(out)


def string_loop(cx, cy, r, seed=1, color="#FF8FD0", w=1.3, harmonics=(3, 5, 7), op=0.95):
    """Une corde fermée qui vibre : la note jouée est la particule."""
    rnd = random.Random(seed)
    amps = [(h, rnd.uniform(0.04, 0.12), rnd.uniform(0, 6)) for h in harmonics]
    pts_ = []
    for i in range(121):
        a = 2 * math.pi * i / 120
        rr = r * (1 + sum(A * math.sin(h * a + p) for h, A, p in amps))
        pts_.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts_) + "Z"
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(w * 3)}" opacity="{f(op * 0.2)}"/><path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{op}"/>'


def open_string(x0, y0, x1, y1, n, amp, color="#9FE8FF", w=1.2, op=0.9):
    """Une corde ouverte qui vibre entre deux points (mode n)."""
    L = math.hypot(x1 - x0, y1 - y0)
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    nx, ny = -uy, ux
    pts_ = []
    for i in range(61):
        t = i / 60
        s = amp * math.sin(n * math.pi * t)
        pts_.append((x0 + ux * L * t + nx * s, y0 + uy * L * t + ny * s))
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts_)
    d2 = "M" + " L".join(f"{f(x0 + ux * L * (i / 60) - nx * amp * math.sin(n * math.pi * i / 60))} {f(y0 + uy * L * (i / 60) - ny * amp * math.sin(n * math.pi * i / 60))}" for i in range(61))
    return (f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{op}"/>'
            f'<path d="{d2}" fill="none" stroke="{color}" stroke-width="{f(w * 0.6)}" opacity="{f(op * 0.4)}"/>'
            f'<circle cx="{f(x0)}" cy="{f(y0)}" r="2" fill="#FFFFFF"/><circle cx="{f(x1)}" cy="{f(y1)}" r="2" fill="#FFFFFF"/>')


# ---------------------------------------------------------------- l'immense

def cosmic_web(card, x0, y0, x1, y1, seed=3, color="#B9A7FF", node="#FFE7F0", n=22, link=2.3, w=1.0, op=0.7, avoid=None):
    """La toile cosmique : des filaments de matière noire où perlent les galaxies, des amas à chaque nœud."""
    rnd = random.Random(seed)
    nodes = []
    tries = 0
    while len(nodes) < n and tries < 4000:
        tries += 1
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if avoid and avoid(x, y):
            continue
        nodes.append((x, y))
    out_l, out_n, out_c = [], [], []
    dmax = math.sqrt((x1 - x0) * (y1 - y0) / max(1, n)) * link * 0.7
    seen = set()
    for i, (xa, ya) in enumerate(nodes):
        ds = sorted(((math.hypot(xb - xa, yb - ya), j) for j, (xb, yb) in enumerate(nodes) if j != i))
        for dd, j in ds[:3]:
            if dd > dmax or (min(i, j), max(i, j)) in seen:
                continue
            seen.add((min(i, j), max(i, j)))
            xb, yb = nodes[j]
            mx, my = (xa + xb) / 2 + rnd.uniform(-12, 12), (ya + yb) / 2 + rnd.uniform(-12, 12)
            out_l.append(f'<path d="M{f(xa)} {f(ya)} Q{f(mx)} {f(my)} {f(xb)} {f(yb)}" fill="none" stroke="{color}" stroke-width="{f(w * 6)}" opacity="{f(op * 0.35)}"/>')
            out_c.append(f'<path d="M{f(xa)} {f(ya)} Q{f(mx)} {f(my)} {f(xb)} {f(yb)}" fill="none" stroke="{color}" stroke-width="{f(w * 0.5)}" opacity="{f(op * 0.35)}"/>')
            for k in range(14):
                t = rnd.random()
                px = (1 - t) ** 2 * xa + 2 * (1 - t) * t * mx + t * t * xb + rnd.gauss(0, 2.2)
                py = (1 - t) ** 2 * ya + 2 * (1 - t) * t * my + t * t * yb + rnd.gauss(0, 2.2)
                out_n.append(f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(rnd.uniform(0.3, 1.0))}" fill="{node}" opacity="{f(rnd.uniform(0.35, 0.95))}"/>')
    for x, y in nodes:
        rr = rnd.uniform(1.6, 3.6)
        out_n.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rr * 3.4)}" fill="{node}" opacity="0.16"/><circle cx="{f(x)}" cy="{f(y)}" r="{f(rr * 1.4)}" fill="{node}" opacity="0.35"/><circle cx="{f(x)}" cy="{f(y)}" r="{f(rr * 0.6)}" fill="#FFFFFF" opacity="0.95"/>')
    return f'<g filter="{soft(card, 2.5)}">{"".join(out_l)}</g>' + "".join(out_c) + "".join(out_n)


def galaxy_cluster(card, cx, cy, r, seed=9, n=40, color="#FFE2B0"):
    """Un amas de galaxies : une elliptique géante au centre, des dizaines de spirales vues de biais autour."""
    rnd = random.Random(seed)
    uid = nid("gc")
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.2)}" fill="{_rg(card, uid, [(0, color, 0.35), (1, "#B9A7FF", 0)])}"/>',
           f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 0.16)}" ry="{f(r * 0.11)}" fill="{_rg(card, uid + "c", [(0, "#FFFFFF", 1), (0.5, color, 0.8), (1, color, 0)])}"/>']
    for _ in range(n):
        a = rnd.uniform(0, 2 * math.pi)
        d = r * (rnd.random() ** 0.7)
        x, y = cx + d * math.cos(a), cy + d * math.sin(a) * 0.8
        rx = rnd.uniform(1.2, 4.2) * (1.2 - d / r * 0.6)
        out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(rx)}" ry="{f(rx * rnd.uniform(0.3, 0.8))}" fill="{rnd.choice((color, "#FFFFFF", "#CFE0FF", "#FFD0E0"))}" opacity="{f(rnd.uniform(0.55, 1))}" transform="rotate({f(rnd.uniform(0, 180))} {f(x)} {f(y)})"/>')
    return "".join(out)


def lens_ring(cx, cy, r, color="#F2C76A", w=2, ticks=True, op=1.0):
    """Une loupe : anneau de métal gradué (on regarde dedans l'infiniment petit)."""
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="#000000" stroke-width="{f(w + 3)}" opacity="0.4"/>',
           f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{op}"/>',
           f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r - 4)}" fill="none" stroke="{color}" stroke-width="0.6" opacity="{f(op * 0.6)}"/>']
    if ticks:
        for i in range(48):
            a = 360 * i / 48
            x1, y1 = pt(cx, cy, r + 2, a)
            x2, y2 = pt(cx, cy, r + (7 if i % 4 == 0 else 4.5), a)
            out.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{color}" stroke-width="0.8" opacity="{f(op * 0.85)}"/>')
    return "".join(out)
