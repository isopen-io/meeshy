"""Abysses - le récif et les coquillages : coraux branchus, gorgones, anémones, laminaires,
coquille Saint-Jacques, nautile (spirale logarithmique, coupe nacrée à cloisons)."""

import math
import random

from base import W, H, f, pt
from kit import catmull, poly, smooth, ribbon, resample, normals, lerp, glow, blur, bevel, metal_grad, nacre_grad, GOLD, NACRE


# ---------------------------------------------------------------- corail branchu

def coral(seed, x, y, length, angle=0, width=9, depth=5, color="#FF7A6B", tip="#FFD2C4", spread=28, shrink=0.74, polyps=True):
    """Corail branchu (récursif) : segments effilés à bouts arrondis, polypes clairs aux extrémités."""
    rnd = random.Random(seed)
    segs, tips = [], []

    def grow(x0, y0, a, L, w, d):
        bend = rnd.uniform(-12, 12)
        x1, y1 = pt(x0, y0, L, a + bend * 0.5)
        mx, my = pt(x0, y0, L * 0.5, a + bend)
        segs.append((d, f'<path d="M{f(x0)} {f(y0)} Q{f(mx)} {f(my)} {f(x1)} {f(y1)}" fill="none" stroke-width="{f(w)}" stroke-linecap="round"/>'))
        if d == 0:
            tips.append((x1, y1, w))
            return
        n = 2 if rnd.random() < 0.75 else 3
        for i in range(n):
            da = (-spread + 2 * spread * i / (n - 1)) + rnd.uniform(-8, 8)
            grow(x1, y1, a + da, L * rnd.uniform(shrink - 0.08, shrink + 0.06), w * 0.72, d - 1)

    grow(x, y, angle, length, width, depth)
    out = []
    for d in range(depth, -1, -1):
        t = 1 - d / max(1, depth)
        col = _mix(color, tip, t * 0.6)
        out.append(f'<g stroke="{col}">' + "".join(s for dd, s in segs if dd == d) + "</g>")
    if polyps:
        out.append("".join(f'<circle cx="{f(tx)}" cy="{f(ty)}" r="{f(max(1.2, tw * 0.62))}" fill="{tip}"/>' for tx, ty, tw in tips))
    return "".join(out)


def _hex(c):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def _mix(a, b, t):
    ra, ga, ba = _hex(a)
    rb, gb, bb = _hex(b)
    return "#%02X%02X%02X" % (round(lerp(ra, rb, t)), round(lerp(ga, gb, t)), round(lerp(ba, bb, t)))


def mix(a, b, t):
    return _mix(a, b, t)


# ---------------------------------------------------------------- gorgone (éventail de mer)

def seafan(seed, x, y, h, w, color="#E0485A", op=0.9, angle=0, sw=1.2):
    rnd = random.Random(seed)
    out = []
    branches = []
    for i in range(13):
        a = -w / 2 + w * i / 12
        pts = [(x, y)]
        cx, cy = x, y
        for k in range(1, 7):
            t = k / 6
            cx = x + a * t * 1.0 + rnd.uniform(-4, 4)
            cy = y - h * t + rnd.uniform(-4, 4) + abs(a) * t * t * 0.25
            pts.append((cx, cy))
        branches.append(pts)
        out.append(f'<path d="{smooth(pts, closed=False, n=4)}" fill="none" stroke="{color}" stroke-width="{f(sw * (2.2 - abs(a) / w))}" stroke-linecap="round"/>')
    for k in range(2, 7):
        for i in range(12):
            if rnd.random() < 0.65:
                p, q = branches[i][k], branches[i + 1][k]
                out.append(f'<path d="M{f(p[0])} {f(p[1])} Q{f((p[0] + q[0]) / 2)} {f((p[1] + q[1]) / 2 + rnd.uniform(-5, 5))} {f(q[0])} {f(q[1])}" fill="none" stroke="{color}" stroke-width="{f(sw * 0.6)}"/>')
    return f'<g opacity="{op}" transform="rotate({angle} {f(x)} {f(y)})">{"".join(out)}</g>'


# ---------------------------------------------------------------- anémone

def anemone(card, name, x, y, s=1.0, body="#B83A8E", tent="#FF8AD8", tipc="#9FFBFF", n=26, seed=2, lit=True):
    rnd = random.Random(seed)
    out = []
    bg = card.grad(name + "-bd", [(0, _mix(body, "#FFFFFF", 0.2)), (1, _mix(body, "#000000", 0.5))])
    out.append(f'<path d="M{f(x - 16 * s)} {f(y)} Q{f(x - 18 * s)} {f(y - 18 * s)} {f(x - 22 * s)} {f(y - 30 * s)} L{f(x + 22 * s)} {f(y - 30 * s)} Q{f(x + 18 * s)} {f(y - 18 * s)} {f(x + 16 * s)} {f(y)} Z" fill="{bg}"/>')
    tg = card.grad(name + "-tg", [(0, tipc), (0.35, tent), (1, _mix(tent, body, 0.5))])
    ts = []
    for i in range(n):
        a = -82 + 164 * i / (n - 1) + rnd.uniform(-5, 5)
        L = (34 + rnd.uniform(-6, 10)) * s * (1 - abs(a) / 300)
        x0 = x + a / 82 * 18 * s
        y0 = y - 30 * s
        x1, y1 = pt(x0, y0, L, a * 0.9)
        cx, cy = pt(x0, y0, L * 0.6, a * 0.9 - 18 * math.copysign(1, a or 1) + rnd.uniform(-10, 10))
        ts.append((y1, f'<path d="M{f(x0)} {f(y0)} Q{f(cx)} {f(cy)} {f(x1)} {f(y1)}" fill="none" stroke="{tg}" stroke-width="{f(3.6 * s)}" stroke-linecap="round"/>'
                       f'<circle cx="{f(x1)}" cy="{f(y1)}" r="{f(2.6 * s)}" fill="{tipc}"/>'))
    ts.sort(key=lambda t: -t[0])
    body_m = "".join(m for _, m in ts)
    if lit:
        out.append(f'<g filter="{glow(card, name + "-gl", 3 * s, 1)}">{body_m}</g>')
    else:
        out.append(body_m)
    return "".join(out)


# ---------------------------------------------------------------- laminaires, herbiers

def kelp(card, name, seed, x, y, h, color="#C9B24A", op=0.85, sway=22, blades=9, w=5, dark="#3D4A1C"):
    rnd = random.Random(seed)
    spine = [(x + sway * math.sin(k * 0.9 + seed) * (k / 8), y - h * k / 8) for k in range(9)]
    stipe = ribbon(spine, [w, w * 0.8, w * 0.6, w * 0.4], n=6, count=60)
    sm = resample(catmull(spine, 6), blades + 2)
    g = card.grad(name + "-kg", [(0, color), (1, dark)], 0, 0, 1, 0)
    out = [f'<path d="{stipe}" fill="{dark}"/>']
    for i, (bx, by) in enumerate(sm[1:-1]):
        side = 1 if i % 2 == 0 else -1
        L = rnd.uniform(26, 46) * (1 - i / (blades + 4))
        a = side * rnd.uniform(40, 70)
        x1, y1 = pt(bx, by, L, a)
        c1 = pt(bx, by, L * 0.5, a - side * 30)
        c2 = pt(bx, by, L * 0.5, a + side * 30)
        out.append(f'<path d="M{f(bx)} {f(by)} Q{f(c1[0])} {f(c1[1])} {f(x1)} {f(y1)} Q{f(c2[0])} {f(c2[1])} {f(bx)} {f(by)} Z" fill="{g}"/>')
        out.append(f'<path d="M{f(bx)} {f(by)} L{f(x1)} {f(y1)}" stroke="{dark}" stroke-width="0.6" opacity="0.6"/>')
    return f'<g opacity="{op}">{"".join(out)}</g>'


def seagrass(seed, x0, x1, y, h, color="#2F6F5E", n=40, op=0.9):
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        x = rnd.uniform(x0, x1)
        L = h * rnd.uniform(0.4, 1)
        bend = rnd.uniform(-L * 0.35, L * 0.35)
        out.append(f'<path d="M{f(x - 1.6)} {f(y)} Q{f(x + bend * 0.4)} {f(y - L * 0.6)} {f(x + bend)} {f(y - L)} Q{f(x + bend * 0.4 + 2)} {f(y - L * 0.6)} {f(x + 1.6)} {f(y)} Z" fill="{color}" opacity="{f(rnd.uniform(0.6, 1) * op)}"/>')
    return "".join(out)


# ---------------------------------------------------------------- coquille Saint-Jacques

def scallop(card, name, cx, cy, R, metal=GOLD, ribs=15, span=74, ears=True, fill=None):
    """Coquille dont la charnière est en (cx, cy) et qui s'ouvre vers le haut, rayon R."""
    hi, mid, lo = metal
    rib = card.grad(name + "-rib", [(0, lo), (0.3, mid), (0.5, hi), (0.7, mid), (1, lo)], 0, 0, 1, 0)
    out = []
    for i in range(ribs):
        a0 = -span + 2 * span * i / ribs
        a1 = -span + 2 * span * (i + 1) / ribs
        am = (a0 + a1) / 2
        p0 = pt(cx, cy, R, a0)
        p1 = pt(cx, cy, R, a1)
        pm = pt(cx, cy, R * 1.07, am)
        h0 = pt(cx, cy, R * 0.08, a0)
        h1 = pt(cx, cy, R * 0.08, a1)
        d = f"M{f(h0[0])} {f(h0[1])} L{f(p0[0])} {f(p0[1])} Q{f(pm[0])} {f(pm[1])} {f(p1[0])} {f(p1[1])} L{f(h1[0])} {f(h1[1])} Z"
        out.append(f'<path d="{d}" fill="{fill or rib}" transform="rotate(0)"/>')
        out.append(f'<path d="{d}" fill="none" stroke="{lo}" stroke-width="0.7" opacity="0.6"/>')
    for k in (0.35, 0.55, 0.75, 0.9):
        a0, a1 = -span, span
        p0, p1 = pt(cx, cy, R * k, a0), pt(cx, cy, R * k, a1)
        out.append(f'<path d="M{f(p0[0])} {f(p0[1])} A{f(R * k)} {f(R * k)} 0 0 1 {f(p1[0])} {f(p1[1])}" fill="none" stroke="{lo}" stroke-width="0.6" opacity="0.35"/>')
    if ears:
        g = metal_grad(card, name + "-ear", metal)
        out.append(f'<path d="M{f(cx)} {f(cy + R * 0.06)} L{f(cx - R * 0.3)} {f(cy + R * 0.02)} L{f(cx - R * 0.26)} {f(cy - R * 0.16)} L{f(cx)} {f(cy - R * 0.1)} Z" fill="{g}"/>')
        out.append(f'<path d="M{f(cx)} {f(cy + R * 0.06)} L{f(cx + R * 0.3)} {f(cy + R * 0.02)} L{f(cx + R * 0.26)} {f(cy - R * 0.16)} L{f(cx)} {f(cy - R * 0.1)} Z" fill="{g}"/>')
    return f'<g filter="{bevel(card, name + "-bv", 1.0, 2.4, 3, 4, 0.55)}">{"".join(out)}</g>'


# ---------------------------------------------------------------- nautile

B_NAUT = math.log(3.0) / (2 * math.pi)


def naut_pt(cx, cy, a, th, rot=0.0, mirror=False):
    r = a * math.exp(B_NAUT * th)
    ang = th + rot
    x = r * math.cos(ang)
    return (cx + (-x if mirror else x), cy + r * math.sin(ang))


def nautilus(card, name, cx, cy, size, rot=0.0, mirror=False, style="cut", metal=GOLD, chambers=26, stripe="#9A3F1E"):
    """Nautile : `size` = rayon de l'ouverture. style 'cut' (coupe nacrée à cloisons) | 'shell' (coquille tigrée)."""
    hi, mid, lo = metal
    te = 4 * math.pi
    a = size / math.exp(B_NAUT * te)
    P = lambda th: naut_pt(cx, cy, a, th, rot, mirror)
    outer = [P(te - 2 * math.pi + 2 * math.pi * i / 120) for i in range(121)]
    shape = poly(outer)
    out = []
    edge = metal_grad(card, name + "-edge", metal)
    if style == "cut":
        nac = nacre_grad(card, name + "-nac", 0, 0, 1, 1)
        out.append(f'<path d="{shape}" fill="{nac}"/>')
        step = math.radians(24)
        th = te - math.radians(120)
        k = 0
        sep = []
        while th > 0.6 and k < chambers:
            p_out, p_in = P(th), P(th - 2 * math.pi)
            q = P(th - 0.25)
            mx, my = (p_out[0] + p_in[0]) / 2, (p_out[1] + p_in[1]) / 2
            dx, dy = q[0] - P(th)[0], q[1] - P(th)[1]
            l = math.hypot(dx, dy) or 1
            dist = math.hypot(p_out[0] - p_in[0], p_out[1] - p_in[1])
            c = (mx + dx / l * dist * 0.32, my + dy / l * dist * 0.32)
            sep.append((th, p_out, c, p_in, dist))
            th -= step
            k += 1
        for i in range(len(sep) - 1):
            t0, po0, c0, pi0, d0 = sep[i]
            t1, po1, c1, pi1, d1 = sep[i + 1]
            arc_o = [P(t0 - (t0 - t1) * j / 6) for j in range(7)]
            arc_i = [P(t1 - 2 * math.pi + (t0 - t1) * j / 6) for j in range(7)]
            ch = poly(arc_o) + f" Q{f(c1[0])} {f(c1[1])} {f(pi1[0])} {f(pi1[1])} " + " ".join(f"L{f(x)} {f(y)}" for x, y in arc_i[1:]) + f" Q{f(c0[0])} {f(c0[1])} {f(po0[0])} {f(po0[1])} Z"
            ch = ch.replace(" Z Q", " Q").replace("Z Q", "Q")
            shade = card.rgrad(name + "-ch", [(0, "#FFFFFF", 0.0), (0.7, "#B78BD0", 0.18), (1, "#3A2A5A", 0.42)], 0.3, 0.5, 0.8)
            out.append(f'<path d="{_chamber(arc_o, c1, pi1, arc_i, c0, po0)}" fill="{shade}"/>')
        for th0, po, c, pi_, dist in sep:
            out.append(f'<path d="M{f(po[0])} {f(po[1])} Q{f(c[0])} {f(c[1])} {f(pi_[0])} {f(pi_[1])}" fill="none" stroke="{edge}" stroke-width="{f(max(0.6, dist * 0.07))}" stroke-linecap="round"/>')
        sip = [P(t - 2 * math.pi * 0.62) for t in [te - math.radians(120) - 0.15 * i for i in range(60)] if t > 2.2]
        if len(sip) > 2:
            out.append(f'<path d="{poly(sip, closed=False)}" fill="none" stroke="{mid}" stroke-width="1.1" stroke-dasharray="2 3" opacity="0.7"/>')
        spiral = [P(te * i / 240) for i in range(241)]
        out.append(f'<path d="{poly(spiral, closed=False)}" fill="none" stroke="{edge}" stroke-width="{f(size * 0.035)}" stroke-linecap="round"/>')
        out.append(f'<path d="{shape}" fill="none" stroke="{edge}" stroke-width="{f(size * 0.06)}" stroke-linejoin="round"/>')
    else:
        sg = card.rgrad(name + "-sh", [(0, "#FFF8EA", 1), (0.7, "#F1DDB8", 1), (1, "#C9A170", 1)], 0.55, 0.5, 0.6)
        out.append(f'<path d="{shape}" fill="{sg}"/>')
        rnd = random.Random(5)
        for i in range(16):
            th = te - 2 * math.pi + 0.2 + i * 0.27
            if th > te - 1.4:
                break
            p_o = P(th)
            p_i = P(th - 2 * math.pi)
            wob = [(lerp(p_i[0], p_o[0], t) + 3 * math.sin(t * 9 + i), lerp(p_i[1], p_o[1], t)) for t in [j / 8 for j in range(9)]]
            fade = 0.85 * (1 - (th - (te - 2 * math.pi)) / (2 * math.pi - 1.2))
            out.append(f'<path d="{smooth(wob, closed=False, n=4)}" fill="none" stroke="{stripe}" stroke-width="{f(size * 0.06 * (0.6 + 0.4 * fade))}" stroke-linecap="round" opacity="{f(max(0.1, fade))}"/>')
        ap_o, ap_i = P(te), P(te - 2 * math.pi)
        out.append(f'<path d="{shape}" fill="none" stroke="{edge}" stroke-width="{f(size * 0.05)}" stroke-linejoin="round"/>')
        out.append(f'<circle cx="{f(P(te - 2 * math.pi + 0.01)[0] * 0 + cx)}" cy="{f(cy)}" r="{f(size * 0.09)}" fill="{edge}"/>')
    return f'<g filter="{bevel(card, name + "-bv", 1.1, 2.6, 4, 6, 0.6)}">{"".join(out)}</g>'


def _chamber(arc_o, c1, pi1, arc_i, c0, po0):
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in arc_o)
    d += f" Q{f(c1[0])} {f(c1[1])} {f(pi1[0])} {f(pi1[1])}"
    d += "".join(f" L{f(x)} {f(y)}" for x, y in arc_i[1:])
    d += f" Q{f(c0[0])} {f(c0[1])} {f(po0[0])} {f(po0[1])} Z"
    return d


def naut_spiral_points(cx, cy, size, rot=0.0, mirror=False, turns=2.0, n=200):
    te = 4 * math.pi
    a = size / math.exp(B_NAUT * te)
    return [naut_pt(cx, cy, a, te - turns * 2 * math.pi * (1 - i / (n - 1)), rot, mirror) for i in range(n)]


# ---------------------------------------------------------------- étoile de mer

def starfish(cx, cy, r, color="#F2894E", rot=0, dots="#FFE0C4"):
    pts = []
    for i in range(10):
        rr = r if i % 2 == 0 else r * 0.42
        pts.append(pt(cx, cy, rr, rot + i * 36))
    d = smooth(pts, closed=True, n=5)
    dd = "".join(f'<circle cx="{f(pt(cx, cy, r * k, rot + i * 72)[0])}" cy="{f(pt(cx, cy, r * k, rot + i * 72)[1])}" r="{f(r * 0.06)}" fill="{dots}"/>' for i in range(5) for k in (0.3, 0.5, 0.7))
    return f'<path d="{d}" fill="{color}"/>{dd}'
