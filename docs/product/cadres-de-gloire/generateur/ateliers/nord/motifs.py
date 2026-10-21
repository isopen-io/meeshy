"""Aurores du Nord - motifs : aurores, montagnes, sapins, runes, entrelacs, boucliers, cornes,
drakkar, loups, corbeaux, frêne-monde, glace.

Silhouettes définies dans un repère local (pieds ou ligne de flottaison à y = 0, face à droite),
posées par `place()`. Créations originales inspirées des arts vikings (styles de Borre et d'Urnes)
et des paysages boréaux.
"""

import math
import random

from base import W, H, f, pt, esc, sparkle
from kit import (shape, ribbon, smooth, resample, normals, place, ublur, bevel, noise_filter, texture_filter,
                 metal_grad, OR, ARGENT, GLACE_CLAIR, GLACE, GLACE_MOY, GLACE_FONCE, NUIT, AURORE_V, AURORE_P)


# ================================================================ aurores

def aurora(card, name, pts, h=180, top="#B07CFF", mid="#4DFFB4", low="#C9FFE6", seed=1, density=2.4,
           ray_w=(1.6, 4.2), op=(0.18, 0.62), hvar=0.45, glow=True, skew=0, blend=True, base_line=True, mid_op=0.75):
    """Un rideau d'aurore : des rayons verticaux posés le long d'une courbe (le bord inférieur, net et lumineux),
    du vert vif en bas au violet qui s'évanouit en haut."""
    rnd = random.Random(seed)
    g = card.grad(name + "-g", [(0, top + "00"), (0.38, top + "55"), (0.72, mid + hex(int(255 * mid_op))[2:].zfill(2)),
                                 (0.95, mid), (1, low)])
    length = sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
    n = max(8, int(length / density))
    sp = resample(pts, n)
    rays = []
    ph1, ph2 = rnd.uniform(0, 6), rnd.uniform(0, 6)
    for i, (x, y) in enumerate(sp):
        t = i / (n - 1)
        env = math.sin(math.pi * min(1, max(0, t))) ** 0.35
        hh = h * env * (1 - hvar + hvar * (0.5 + 0.25 * math.sin(t * 17 + ph1) + 0.25 * math.sin(t * 41 + ph2))) * rnd.uniform(0.8, 1.15)
        w = rnd.uniform(*ray_w)
        o = rnd.uniform(*op) * (0.55 + 0.45 * env)
        rays.append(f'<rect x="{f(x - w / 2)}" y="{f(y - hh)}" width="{f(w)}" height="{f(hh + 2)}" fill="{g}" opacity="{f(o)}"/>')
    sk = f' transform="skewX({skew})"' if skew else ""
    style = ' style="mix-blend-mode:screen"' if blend else ""
    out = [f"<g{style}>"]
    if glow:
        out.append(f'<g filter="{ublur(card, name + "-gb", 9)}" opacity="0.9"{sk}>{"".join(rays)}</g>')
    out.append(f'<g filter="{ublur(card, name + "-sb", 0.9)}"{sk}>{"".join(rays)}</g>')
    if base_line:
        d = smooth(sp[:: max(1, n // 60)] + [sp[-1]])
        out.append(f'<path d="{d}" fill="none" stroke="{low}" stroke-width="3" opacity="0.55" filter="{ublur(card, name + "-lb", 2.5)}"{sk}/>')
    out.append("</g>")
    return "".join(out)


def aurora_path(x0, x1, y, amp=30, waves=1.5, phase=0.0, fold=0.0, folds=3, steps=40):
    """La courbe d'un rideau : une onde, avec éventuellement des replis (le rideau qui revient sur lui-même)."""
    pts = []
    for i in range(steps + 1):
        t = i / steps
        x = x0 + (x1 - x0) * t + fold * math.sin(2 * math.pi * folds * t)
        yy = y + amp * math.sin(2 * math.pi * waves * t + phase)
        pts.append((x, yy))
    return pts


def corona(card, name, cx, cy, r0, r1, n=90, colors=("#4DFFB4", "#B07CFF"), seed=4, a0=0, a1=360, op=(0.12, 0.5)):
    """La couronne d'aurore : quand l'aurore passe au zénith, ses rayons convergent vers un point."""
    rnd = random.Random(seed)
    g = card.rgrad(name + "-g", [(0, colors[1], 0.0), (0.25, colors[1], 0.55), (0.6, colors[0], 0.9), (1, colors[0], 0.0)], cx / W, cy / H, max(r1 / W, r1 / H))
    card.def_once(name + "-gu", f'<radialGradient id="{card.id(name + "-gu")}" gradientUnits="userSpaceOnUse" cx="{f(cx)}" cy="{f(cy)}" r="{f(r1)}">'
                  f'<stop offset="0" stop-color="{colors[1]}" stop-opacity="0"/><stop offset="{f(r0 / r1)}" stop-color="{colors[1]}" stop-opacity="0.5"/>'
                  f'<stop offset="0.55" stop-color="{colors[0]}" stop-opacity="0.95"/><stop offset="1" stop-color="{colors[0]}" stop-opacity="0"/></radialGradient>')
    gu = f"url(#{card.id(name + '-gu')})"
    out = []
    for i in range(n):
        a = a0 + (a1 - a0) * (i + rnd.uniform(-0.4, 0.4)) / n
        w = rnd.uniform(1.0, 4.5)
        rr0 = r0 * rnd.uniform(0.9, 1.4)
        rr1 = r1 * rnd.uniform(0.55, 1.0)
        x1, y1 = pt(cx, cy, rr0, a - w * 0.05)
        x2, y2 = pt(cx, cy, rr1, a - w * 0.6)
        x3, y3 = pt(cx, cy, rr1, a + w * 0.6)
        x4, y4 = pt(cx, cy, rr0, a + w * 0.05)
        out.append(f'<path d="M{f(x1)} {f(y1)} L{f(x2)} {f(y2)} L{f(x3)} {f(y3)} L{f(x4)} {f(y4)} Z" fill="{gu}" opacity="{f(rnd.uniform(*op))}"/>')
    rays = "".join(out)
    return (f'<g style="mix-blend-mode:screen"><g filter="{ublur(card, name + "-b1", 7)}">{rays}</g>'
            f'<g filter="{ublur(card, name + "-b2", 0.8)}">{rays}</g></g>')


# ================================================================ relief

def ridge(seed, x0, x1, keys, rough=0.35, depth=6):
    """Une ligne de crête par déplacement du point milieu entre des points-clés [(x, y)…]."""
    rnd = random.Random(seed)
    pts = [keys[0]]
    for a, b in zip(keys, keys[1:]):
        seg = [a, b]
        for _ in range(depth):
            nxt = [seg[0]]
            for p, q in zip(seg, seg[1:]):
                d = math.dist(p, q)
                m = ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + rnd.uniform(-1, 1) * d * rough * 0.5)
                nxt += [m, q]
            seg = nxt
        pts += seg[1:]
    return pts


def mountains(card, name, keys, base, seed=3, fill=("#2A4A72", "#0B1A30"), snow=("#F4FBFF", "#9CC4E4"),
              snow_depth=70, snowline=None, rough=0.38, shade=0.42, op=1, rim_light=None):
    """Une chaîne de montagnes enneigées : crête fractale, neiges en coulées, faces à l'ombre."""
    pts = ridge(seed, keys[0][0], keys[-1][0], keys, rough)
    body = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + f" L{f(pts[-1][0])} {f(base)} L{f(pts[0][0])} {f(base)} Z"
    rnd = random.Random(seed + 7)
    top_y = min(y for _, y in pts)
    sl = snowline if snowline is not None else top_y + snow_depth * 1.3
    lower = []
    for i, (x, y) in enumerate(pts):
        gully = snow_depth * (0.55 + 0.45 * math.sin(x * 0.21 + seed) * math.sin(x * 0.053 + seed * 2)) + rnd.uniform(-8, 8)
        b = min(y + max(0, gully), sl + rnd.uniform(-10, 10) + 14 * math.sin(x * 0.31))
        lower.append((x, max(y, b)))
    snow_d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + " L" + " L".join(f"{f(x)} {f(y)}" for x, y in lower[::-1]) + " Z"
    clip = card.def_once(name + "-cl", f'<clipPath id="{card.id(name + "-cl")}"><path d="{body}"/></clipPath>')
    fg = card.grad(name + "-f", [(0, fill[0]), (1, fill[1])], 0, 0, 0, 1)
    sg = card.grad(name + "-s", [(0, snow[0]), (1, snow[1])], 0, 0, 0, 1)
    shades = []
    for i in range(1, len(pts) - 1):
        x, y = pts[i]
        if y <= pts[i - 1][1] and y <= pts[i + 1][1]:
            j = i
            while j < len(pts) - 1 and pts[j + 1][1] >= pts[j][1]:
                j += 1
            if pts[j][0] - x < 8:
                continue
            vx, vy = pts[j]
            shades.append(f"M{f(x)} {f(y)} L{f(vx)} {f(vy)} L{f(vx - (vy - y) * 0.18)} {f(base)} L{f(x - (base - y) * 0.12)} {f(base)} Z")
    out = [f'<g opacity="{f(op)}">', f'<path d="{body}" fill="{fg}"/>',
           f'<g clip-path="{clip}"><path d="{snow_d}" fill="{sg}"/>',
           f'<path d="{" ".join(shades)}" fill="#020814" opacity="{f(shade)}"/></g>']
    if rim_light:
        out.append(f'<path d="M{" L".join(f"{f(x)} {f(y)}" for x, y in pts)}" fill="none" stroke="{rim_light}" stroke-width="1.2" opacity="0.7"/>')
    out.append("</g>")
    return "".join(out)


def fir(x, y, h, color="#08131F", snow="#EAF6FF", seed=1, snow_op=0.9, w_ratio=0.36, trunk=True):
    """Un sapin sous la neige : étages en dents de scie, neige posée sur chaque étage."""
    rnd = random.Random(seed)
    tiers = max(4, int(h / 11))
    top = y - h
    foot = y - h * 0.07
    step = (foot - top) / tiers
    left, right, caps = [], [], []
    for i in range(1, tiers + 1):
        ty = top + step * i
        wi = h * w_ratio * (0.18 + 0.82 * i / tiers) * rnd.uniform(0.9, 1.08)
        ni = wi * 0.42
        left += [(x - wi, ty + rnd.uniform(-1, 1.5)), (x - ni, ty - step * 0.28)]
        right += [(x + ni, ty - step * 0.28), (x + wi * rnd.uniform(0.92, 1.06), ty + rnd.uniform(-1, 1.5))]
        if rnd.random() < 0.82:
            cw = wi * rnd.uniform(0.6, 0.95)
            sy = ty - step * 0.62
            th = step * rnd.uniform(0.16, 0.26)
            caps.append(
                f"M{f(x - cw)} {f(ty)} Q{f(x - cw * 0.55)} {f(sy + step * 0.2)} {f(x - cw * 0.12)} {f(sy)} L{f(x + cw * 0.12)} {f(sy + 1)} Q{f(x + cw * 0.55)} {f(sy + step * 0.25)} {f(x + cw)} {f(ty)} "
                f"Q{f(x + cw * 0.5)} {f(sy + step * 0.25 + th)} {f(x)} {f(sy + th * 1.3)} Q{f(x - cw * 0.5)} {f(sy + step * 0.2 + th)} {f(x - cw)} {f(ty)} Z"
            )
    poly = [(x, top - 2)] + left + [(x - h * 0.03, foot), (x - h * 0.03, y), (x + h * 0.03, y), (x + h * 0.03, foot)] + right[::-1]
    if not trunk:
        poly = [(x, top - 2)] + left + right[::-1]
    d = "M" + " L".join(f"{f(px)} {f(py)}" for px, py in poly) + " Z"
    return f'<path d="{d}" fill="{color}"/><path d="{" ".join(caps)}" fill="{snow}" opacity="{f(snow_op)}"/>'


def forest(seed, x0, x1, y, hmin, hmax, n, color, snow, snow_op=0.85, jitter=8):
    rnd = random.Random(seed)
    trees = []
    for i in range(n):
        x = x0 + (x1 - x0) * (i + rnd.uniform(-0.4, 0.4)) / max(1, n - 1)
        trees.append((x, y + rnd.uniform(-jitter, jitter * 0.4), rnd.uniform(hmin, hmax)))
    trees.sort(key=lambda t: t[1])
    return "".join(fir(x, yy, hh, color, snow, seed=i + seed, snow_op=snow_op) for i, (x, yy, hh) in enumerate(trees))


def snowfall(seed, n, region=(0, 0, W, H), color="#FFFFFF", rmax=2.2, keep_clear=True):
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if keep_clear and 100 < x < 440 and 300 < y < 690:
            continue
        r = rnd.uniform(0.5, rmax)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{color}" opacity="{f(rnd.uniform(0.3, 0.9))}"/>')
    return "".join(out)


def snowflake(cx, cy, r, color, w=1.4, op=1):
    out = []
    for k in range(6):
        a = k * 60
        x1, y1 = pt(cx, cy, r, a)
        out.append(f"M{f(cx)} {f(cy)} L{f(x1)} {f(y1)}")
        for fr, br in ((0.45, 0.32), (0.72, 0.22)):
            bx, by = pt(cx, cy, r * fr, a)
            for s in (-1, 1):
                ex, ey = pt(bx, by, r * br, a + s * 45)
                out.append(f"M{f(bx)} {f(by)} L{f(ex)} {f(ey)}")
    return f'<path d="{" ".join(out)}" stroke="{color}" stroke-width="{f(w)}" stroke-linecap="round" fill="none" opacity="{f(op)}"/>'


def ground_snow(x0, x1, y, amp, color, seed=1, step=14):
    rnd = random.Random(seed)
    pts = []
    x = x0
    while x <= x1 + step:
        pts.append((x, y - amp * (0.5 + 0.5 * math.sin(x / 60 + seed)) - rnd.uniform(0, amp * 0.25)))
        x += step
    return f'<path d="{smooth(pts)} L{f(pts[-1][0])} {H + 10} L{f(pts[0][0])} {H + 10} Z" fill="{color}"/>'


# ================================================================ glace

def shard(cx, cy, length, width, angle, light="#F2FBFF", mid="#9FD8F0", dark="#2C6C9C", op=0.95):
    """Un éclat de glace : prisme hexagonal effilé, deux faces et une arête de lumière."""
    tx, ty = pt(cx, cy, length, angle)
    sx, sy = pt(cx, cy, length * 0.22, angle)
    lx, ly = pt(sx, sy, width / 2, angle - 90)
    rx, ry = pt(sx, sy, width / 2, angle + 90)
    bx, by = pt(cx, cy, -length * 0.04, angle)
    blx, bly = pt(bx, by, width * 0.3, angle - 90)
    brx, bry = pt(bx, by, width * 0.3, angle + 90)
    return (
        f'<g opacity="{f(op)}">'
        f'<path d="M{f(blx)} {f(bly)} L{f(lx)} {f(ly)} L{f(tx)} {f(ty)} L{f(sx)} {f(sy)} L{f(bx)} {f(by)} Z" fill="{light}"/>'
        f'<path d="M{f(brx)} {f(bry)} L{f(rx)} {f(ry)} L{f(tx)} {f(ty)} L{f(sx)} {f(sy)} L{f(bx)} {f(by)} Z" fill="{mid}"/>'
        f'<path d="M{f(brx)} {f(bry)} L{f(rx)} {f(ry)} L{f(tx)} {f(ty)}" fill="none" stroke="{dark}" stroke-width="0.9" opacity="0.8"/>'
        f'<path d="M{f(sx)} {f(sy)} L{f(tx)} {f(ty)}" stroke="#FFFFFF" stroke-width="0.9" opacity="0.95"/></g>'
    )


def ice_cluster(seed, cx, cy, n, a0, a1, lmin, lmax, wmin=7, wmax=16, **kw):
    rnd = random.Random(seed)
    items = []
    for i in range(n):
        a = a0 + (a1 - a0) * (i + rnd.uniform(-0.35, 0.35)) / max(1, n - 1)
        items.append((rnd.uniform(lmin, lmax), a, rnd.uniform(wmin, wmax)))
    items.sort(key=lambda t: -t[0])
    return "".join(shard(cx, cy, l, w, a, **kw) for l, a, w in items)


# ================================================================ runes

RUNES = {
    "f": [(0, 0, 0, 1), (0, 0.32, 0.5, 0.06), (0, 0.58, 0.5, 0.32)],
    "u": [(0, 0, 0, 1), (0, 0, 0.5, 0.28), (0.5, 0.28, 0.5, 1)],
    "th": [(0, 0, 0, 1), (0, 0.24, 0.45, 0.5), (0.45, 0.5, 0, 0.76)],
    "a": [(0, 0, 0, 1), (0, 0, 0.45, 0.26), (0, 0.3, 0.45, 0.56)],
    "r": [(0, 0, 0, 1), (0, 0, 0.45, 0.22), (0.45, 0.22, 0, 0.48), (0, 0.48, 0.48, 1)],
    "k": [(0.45, 0.12, 0, 0.5), (0, 0.5, 0.45, 0.88)],
    "g": [(0, 0, 0.6, 1), (0.6, 0, 0, 1)],
    "w": [(0, 0, 0, 1), (0, 0, 0.45, 0.22), (0.45, 0.22, 0, 0.46)],
    "h": [(0, 0, 0, 1), (0.55, 0, 0.55, 1), (0, 0.32, 0.55, 0.6)],
    "n": [(0.3, 0, 0.3, 1), (0.05, 0.36, 0.55, 0.62)],
    "i": [(0.3, 0, 0.3, 1)],
    "j": [(0.28, 0.06, 0.02, 0.3), (0.02, 0.3, 0.28, 0.54), (0.32, 0.46, 0.58, 0.7), (0.58, 0.7, 0.32, 0.94)],
    "ei": [(0.3, 0, 0.3, 1), (0.3, 0, 0.56, 0.2), (0.3, 1, 0.04, 0.8)],
    "p": [(0, 0, 0, 1), (0, 0.04, 0.45, 0.26), (0, 0.96, 0.45, 0.74), (0.45, 0.26, 0.45, 0.36), (0.45, 0.74, 0.45, 0.64)],
    "b": [(0, 0, 0, 1), (0, 0, 0.45, 0.25), (0.45, 0.25, 0, 0.5), (0, 0.5, 0.45, 0.75), (0.45, 0.75, 0, 1)],
    "e": [(0, 0, 0, 1), (0.6, 0, 0.6, 1), (0, 0, 0.3, 0.3), (0.3, 0.3, 0.6, 0)],
    "m": [(0, 0, 0, 1), (0.6, 0, 0.6, 1), (0, 0, 0.6, 0.4), (0.6, 0, 0, 0.4)],
    "l": [(0, 0, 0, 1), (0, 0, 0.45, 0.26)],
    "ng": [(0.3, 0.22, 0.58, 0.5), (0.58, 0.5, 0.3, 0.78), (0.3, 0.78, 0.02, 0.5), (0.02, 0.5, 0.3, 0.22)],
    "d": [(0, 0, 0, 1), (0.6, 0, 0.6, 1), (0, 0, 0.6, 1), (0.6, 0, 0, 1)],
}
RUNE_KEYS = list(RUNES)
RUNE_W = {"i": 0.6, "g": 0.6, "e": 0.6, "m": 0.6, "d": 0.6, "h": 0.55, "ng": 0.6, "n": 0.6, "j": 0.6, "ei": 0.56}


def rune(key, x, y, size, color, w=1.6):
    """Une rune du Futhark ancien, en traits gravés (repère : haut-gauche (x, y), hauteur size)."""
    segs = RUNES[key]
    d = " ".join(f"M{f(x + a * size)} {f(y + b * size)} L{f(x + c * size)} {f(y + e * size)}" for a, b, c, e in segs)
    return f'<path d="{d}" stroke="{color}" stroke-width="{f(w)}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'


def rune_line(seed, x0, y, x1, size, color, w=1.6, gap=0.42, sep_every=(3, 6), sep="dots"):
    """Une ligne d'inscription runique (des mots séparés par des points, comme sur les pierres levées)."""
    rnd = random.Random(seed)
    out = []
    x = x0
    word = rnd.randint(*sep_every)
    while True:
        k = rnd.choice(RUNE_KEYS)
        cw = RUNE_W.get(k, 0.5) * size
        if x + cw > x1:
            break
        out.append(rune(k, x, y, size, color, w))
        x += cw + gap * size
        word -= 1
        if word == 0:
            if x + 0.3 * size > x1:
                break
            if sep == "dots":
                out.append(f'<circle cx="{f(x + 0.08 * size)}" cy="{f(y + 0.35 * size)}" r="{f(w * 0.75)}" fill="{color}"/>'
                           f'<circle cx="{f(x + 0.08 * size)}" cy="{f(y + 0.65 * size)}" r="{f(w * 0.75)}" fill="{color}"/>')
            else:
                out.append(f'<path d="M{f(x - 0.05 * size)} {f(y + 0.4 * size)} l{f(0.26 * size)} {f(0.2 * size)} M{f(x + 0.21 * size)} {f(y + 0.4 * size)} l{f(-0.26 * size)} {f(0.2 * size)}" stroke="{color}" stroke-width="{f(w * 0.8)}"/>')
            x += gap * size + 0.2 * size
            word = rnd.randint(*sep_every)
    return "".join(out)


def rune_ring(seed, cx, cy, r, size, color, w=1.4, a0=0, a1=360):
    """Des runes disposées en couronne (chaque rune pointe vers le centre)."""
    rnd = random.Random(seed)
    out = []
    step = (size * 0.95) / r * 180 / math.pi
    a = a0 + step / 2
    i = 0
    while a < a1 - step / 2:
        k = rnd.choice(RUNE_KEYS)
        x, y = pt(cx, cy, r, a)
        g = rune(k, -RUNE_W.get(k, 0.5) * size / 2, -size / 2, size, color, w)
        if i % 5 == 4:
            g = f'<circle cx="0" cy="-{f(size * 0.15)}" r="{f(w * 0.7)}" fill="{color}"/><circle cx="0" cy="{f(size * 0.15)}" r="{f(w * 0.7)}" fill="{color}"/>'
        out.append(f'<g transform="translate({f(x)} {f(y)}) rotate({f(a)})">{g}</g>')
        a += step
        i += 1
    return "".join(out)


# ================================================================ entrelacs

def plait(card, name, x0, y, x1, amp, period, w, fill, edge="#120A04", strands=2, vertical=False, bev=True, phase=0.0):
    """Une tresse à deux brins, dessus-dessous alterné (entrelacs de style de Borre, création originale)."""
    L = x1 - x0

    def strand(sign, a, b):
        pts = []
        steps = max(4, int((b - a) / 3))
        for i in range(steps + 1):
            x = a + (b - a) * i / steps
            yy = y + sign * amp * math.sin(2 * math.pi * (x - x0) / period + phase)
            pts.append((yy, x) if vertical else (x, yy))
        return "M" + " L".join(f"{f(px)} {f(py)}" for px, py in pts)

    def draw(d, cap="butt"):
        return (f'<path d="{d}" fill="none" stroke="{edge}" stroke-width="{f(w + 3)}" stroke-linecap="{cap}"/>'
                f'<path d="{d}" fill="none" stroke="{fill}" stroke-width="{f(w)}" stroke-linecap="{cap}"/>')

    out = [draw(strand(1, x0, x1), "round"), draw(strand(-1, x0, x1), "round")]
    k = 0
    c = x0 + ((-phase / (2 * math.pi)) % 0.5) * period
    while c <= x1:
        if x0 < c < x1:
            a, b = max(x0, c - period / 4), min(x1, c + period / 4)
            out.append(draw(strand(1 if k % 2 == 0 else -1, a, b)))
        c += period / 2
        k += 1
    body = "".join(out)
    if bev:
        return f'<g filter="{bevel(card, name + "-bv", 0.8, 2.0, sd=2, dy=1.5, sop=0.6)}">{body}</g>'
    return body


def ring_chain(card, name, x0, y, x1, r, w, fill, edge="#120A04", vertical=False):
    """Chaîne d'anneaux de Borre : des anneaux noués à une bande qui les traverse (création originale)."""
    n = max(2, int((x1 - x0) / (r * 2.6)))
    step = (x1 - x0) / n
    out = []
    for i in range(n + 1):
        c = x0 + i * step
        cx, cy = (y, c) if vertical else (c, y)
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="{edge}" stroke-width="{f(w + 3)}"/>'
                   f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="{fill}" stroke-width="{f(w)}"/>')
        if i < n:
            m = c + step / 2
            mx, my = (y, m) if vertical else (m, y)
            s = r * 0.62
            out.append(f'<path d="M{f(mx - s)} {f(my)} L{f(mx)} {f(my - s)} L{f(mx + s)} {f(my)} L{f(mx)} {f(my + s)} Z" fill="none" stroke="{edge}" stroke-width="{f(w + 3)}"/>'
                       f'<path d="M{f(mx - s)} {f(my)} L{f(mx)} {f(my - s)} L{f(mx + s)} {f(my)} L{f(mx)} {f(my + s)} Z" fill="none" stroke="{fill}" stroke-width="{f(w)}"/>')
    a, b = (x0 - r, x1 + r)
    for off in (-r * 0.28, r * 0.28):
        d = f"M{f(y + off)} {f(a)} L{f(y + off)} {f(b)}" if vertical else f"M{f(a)} {f(y + off)} L{f(b)} {f(y + off)}"
        out.append(f'<path d="{d}" stroke="{edge}" stroke-width="{f(w * 0.9 + 2)}"/><path d="{d}" stroke="{fill}" stroke-width="{f(w * 0.9)}"/>')
    for i in range(n + 1):
        c = x0 + i * step
        for sgn in (-1, 1):
            if vertical:
                d = f'M{f(y - r * 0.95 * sgn)} {f(c - r * 0.3)} A{f(r)} {f(r)} 0 0 {1 if sgn > 0 else 0} {f(y - r * 0.95 * sgn)} {f(c + r * 0.3)}'
            else:
                d = f'M{f(c - r * 0.3)} {f(y - r * 0.95 * sgn)} A{f(r)} {f(r)} 0 0 {1 if sgn > 0 else 0} {f(c + r * 0.3)} {f(y - r * 0.95 * sgn)}'
            out.append(f'<path d="{d}" fill="none" stroke="{edge}" stroke-width="{f(w + 3)}"/><path d="{d}" fill="none" stroke="{fill}" stroke-width="{f(w)}"/>')
    return f'<g filter="{bevel(card, name + "-bv", 0.8, 2.0, sd=2, dy=1.5, sop=0.6)}">{"".join(out)}</g>'


def beast_head(fill, edge="#120A04", eye="#FFFFFF", w=1.2, jaw_open=1.0, crest=True):
    """Tête de bête à la manière d'Urnes (repère : cou à l'origine, regard à droite, longueur ≈ 62)."""
    o = jaw_open
    d = (
        f"M0 -8 C4 -14 8 -19 14 -20 C24 -22 36 -19 46 -15 C51 -14 55 -16 59 -20 C63 -22 66 -18 63 -13 "
        f"C61 -9 57 -7 52 -7 L36 {f(-3 + 1 * o)} L50 {f(2 + 3 * o)} C55 {f(4 + 3 * o)} 58 {f(8 + 3 * o)} 54 {f(11 + 3 * o)} "
        f"C48 {f(14 + 2 * o)} 38 12 26 11 C16 10 8 10 0 8 Z"
    )
    out = [f'<path d="{d}" fill="{fill}" stroke="{edge}" stroke-width="{f(w)}" stroke-linejoin="round"/>']
    out.append(f'<path d="M20 -11 Q27 -16 34 -11 Q27 -6 20 -11 Z" fill="{eye}" stroke="{edge}" stroke-width="0.8"/>'
               f'<circle cx="28" cy="-11" r="1.6" fill="{edge}"/>')
    if crest:
        out.append(f'<path d="M12 -19 C2 -40 -22 -40 -22 -24 C-22 -14 -10 -14 -10 -22 C-10 -26 -14 -27 -16 -24" fill="none" stroke="{edge}" stroke-width="{f(5.2)}" stroke-linecap="round"/>'
                   f'<path d="M12 -19 C2 -40 -22 -40 -22 -24 C-22 -14 -10 -14 -10 -22 C-10 -26 -14 -27 -16 -24" fill="none" stroke="{fill}" stroke-width="{f(3)}" stroke-linecap="round"/>')
        out.append(f'<path d="M40 {f(12 + 2 * o)} C38 24 28 28 22 22" fill="none" stroke="{edge}" stroke-width="4.4" stroke-linecap="round"/>'
                   f'<path d="M40 {f(12 + 2 * o)} C38 24 28 28 22 22" fill="none" stroke="{fill}" stroke-width="2.4" stroke-linecap="round"/>')
    return "".join(out)


def serpent(card, name, pts, w_mid, fill, edge="#120A04", head=True, head_s=1.0, n=90, runes_seed=None, rune_color=None, rune_size=None, bev=True):
    """Le serpent runique : un ruban qui s'enfle puis s'effile, tête de bête à une extrémité (pierres levées)."""
    d = ribbon(pts, w_mid, n=n, wfn=lambda t: w_mid * (0.55 + 0.45 * math.sin(math.pi * min(1, t * 1.15))) if t < 0.87 else w_mid * max(0.08, (1 - t) / 0.13 * 0.6))
    out = [f'<path d="{d}" fill="{fill}" stroke="{edge}" stroke-width="2.2" stroke-linejoin="round"/>']
    if runes_seed is not None:
        sp = resample(pts, n)
        nm = normals(sp)
        rnd = random.Random(runes_seed)
        size = rune_size or w_mid * 0.55
        acc = 0
        i = 4
        while i < int(n * 0.8):
            x, y = sp[i]
            nx, ny = nm[i]
            ang = math.degrees(math.atan2(ny, nx)) - 90
            k = rnd.choice(RUNE_KEYS)
            g = rune(k, -RUNE_W.get(k, 0.5) * size / 2, -size / 2, size, rune_color or edge, 1.5)
            out.append(f'<g transform="translate({f(x)} {f(y)}) rotate({f(ang + 90)})">{g}</g>')
            seg = math.dist(sp[i], sp[min(n - 1, i + 1)]) or 1
            i += max(1, int(size * 0.95 / seg))
            acc += 1
    if head:
        (x0, y0), (x1, y1) = pts[0], pts[1]
        ang = math.degrees(math.atan2(y0 - y1, x0 - x1))
        out.append(f'<g transform="translate({f(x0)} {f(y0)}) rotate({f(ang)}) scale({f(head_s)})">{beast_head(fill, edge)}</g>')
    body = "".join(out)
    if bev:
        return f'<g filter="{bevel(card, name + "-bv", 0.9, 2.2, sd=3, dy=2, sop=0.6)}">{body}</g>'
    return body


# ================================================================ boucliers, cornes

SHIELD_PAINTS = [("#B3261E", "#F2E6CF"), ("#1F4E8C", "#F2E6CF"), ("#E8B53C", "#1A1410"), ("#2E7D5B", "#F2E6CF"),
                 ("#F2E6CF", "#7A1F1A"), ("#14324F", "#E8B53C")]


def round_shield(card, cx, cy, r, colors=("#B3261E", "#F2E6CF"), pattern="quart", metal=OR, name="sh", studs=10, rot=0):
    """Un bouclier rond peint : planches, motif, umbo de fer, cerclage clouté."""
    c1, c2 = colors
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{c1}"/>']
    if pattern == "quart":
        for k in (0, 2):
            a0, a1 = rot + k * 90, rot + k * 90 + 90
            x0, y0 = pt(cx, cy, r, a0)
            x1, y1 = pt(cx, cy, r, a1)
            out.append(f'<path d="M{f(cx)} {f(cy)} L{f(x0)} {f(y0)} A{f(r)} {f(r)} 0 0 1 {f(x1)} {f(y1)} Z" fill="{c2}"/>')
    elif pattern in ("rayons", "spirale"):
        n = 8 if pattern == "rayons" else 6
        for k in range(0, n, 2):
            a0, a1 = rot + k * 360 / n, rot + (k + 1) * 360 / n
            x0, y0 = pt(cx, cy, r, a0)
            x1, y1 = pt(cx, cy, r, a1)
            if pattern == "rayons":
                out.append(f'<path d="M{f(cx)} {f(cy)} L{f(x0)} {f(y0)} A{f(r)} {f(r)} 0 0 1 {f(x1)} {f(y1)} Z" fill="{c2}"/>')
            else:
                m0x, m0y = pt(cx, cy, r * 0.6, a0 - 32)
                m1x, m1y = pt(cx, cy, r * 0.6, a1 - 32)
                out.append(f'<path d="M{f(cx)} {f(cy)} Q{f(m0x)} {f(m0y)} {f(x0)} {f(y0)} A{f(r)} {f(r)} 0 0 1 {f(x1)} {f(y1)} Q{f(m1x)} {f(m1y)} {f(cx)} {f(cy)} Z" fill="{c2}"/>')
    elif pattern == "anneau":
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.62)}" fill="none" stroke="{c2}" stroke-width="{f(r * 0.2)}"/>')
    clip_id = card.id(f"{name}-cl")
    card.def_once(f"{name}-cl", f'<clipPath id="{clip_id}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}"/></clipPath>')
    planks = "".join(f'<line x1="{f(cx - r + i * r / 3)}" y1="{f(cy - r)}" x2="{f(cx - r + i * r / 3)}" y2="{f(cy + r)}" stroke="#000000" stroke-width="0.7" opacity="0.22"/>' for i in range(1, 6))
    shade = card.rgrad("sh-shade", [(0, "#FFFFFF", 0.18), (0.6, "#FFFFFF", 0), (1, "#000000", 0.45)], 0.38, 0.32, 0.75)
    out.append(f'<g clip-path="url(#{clip_id})">{planks}<rect x="{f(cx - r)}" y="{f(cy - r)}" width="{f(2 * r)}" height="{f(2 * r)}" fill="{shade}"/></g>')
    mg = metal_grad(card, "sh-metal", metal)
    boss = card.rgrad("sh-boss", [(0, "#FFFFFF", 1), (0.25, metal[1], 1), (0.75, metal[2], 1), (1, "#1A1208", 1)], 0.35, 0.3, 0.7)
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="{mg}" stroke-width="{f(r * 0.1)}"/>')
    for k in range(studs):
        sx, sy = pt(cx, cy, r * 0.95, k * 360 / studs + rot)
        out.append(f'<circle cx="{f(sx)}" cy="{f(sy)}" r="{f(max(0.8, r * 0.045))}" fill="{metal[0]}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy + r * 0.03)}" r="{f(r * 0.25)}" fill="#000000" opacity="0.45"/>'
               f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.23)}" fill="{boss}"/>')
    return "".join(out)


def drinking_horn(card, name, pts, w0, w1=3.0, metal=OR, horn=("#F6E7C8", "#B88A55", "#3A220E"), bands=(0.0, 0.33, 0.62), tip=True):
    """Une corne à boire : corne d'ivoire veinée, bagues de métal ciselé, embout."""
    hi, mid, lo = metal
    d = ribbon(pts, w0, w1, n=50)
    (ax, ay), (bx, by) = pts[0], pts[-1]
    hg = card.def_once(name + "-hg", f'<linearGradient id="{card.id(name + "-hg")}" gradientUnits="userSpaceOnUse" x1="{f(ax)}" y1="{f(ay)}" x2="{f(bx)}" y2="{f(by)}">'
                       f'<stop offset="0" stop-color="{horn[0]}"/><stop offset="0.55" stop-color="{horn[1]}"/><stop offset="1" stop-color="{horn[2]}"/></linearGradient>')
    out = [f'<path d="{d}" fill="{hg}"/>']
    sp = resample(pts, 50)
    nm = normals(sp)
    hl = [(x + nx * (w0 + (w1 - w0) * i / 49) * 0.28, y + ny * (w0 + (w1 - w0) * i / 49) * 0.28) for i, ((x, y), (nx, ny)) in enumerate(zip(sp, nm))]
    out.append(f'<path d="{smooth(hl[2:-4])}" fill="none" stroke="#FFFFFF" stroke-width="{f(max(1, w0 * 0.08))}" opacity="0.55" stroke-linecap="round"/>')
    mg = metal_grad(card, name + "-mg", metal)
    for t in bands:
        i = int(t * 49)
        j = min(49, i + max(2, int(4 * (1 - t))))
        wi = w0 + (w1 - w0) * i / 49 + 3
        wj = w0 + (w1 - w0) * j / 49 + 3
        (x0, y0), (n0x, n0y) = sp[i], nm[i]
        (x1, y1), (n1x, n1y) = sp[j], nm[j]
        poly = [(x0 + n0x * wi / 2, y0 + n0y * wi / 2), (x1 + n1x * wj / 2, y1 + n1y * wj / 2), (x1 - n1x * wj / 2, y1 - n1y * wj / 2), (x0 - n0x * wi / 2, y0 - n0y * wi / 2)]
        out.append(f'<path d="M{" L".join(f"{f(px)} {f(py)}" for px, py in poly)} Z" fill="{mg}" stroke="{lo}" stroke-width="0.6"/>')
    if tip:
        x, y = sp[-1]
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(w1 + 2.2)}" fill="{mg}" stroke="{lo}" stroke-width="0.6"/>')
    return f'<g filter="{bevel(card, name + "-bv", 0.8, 2.0, sd=3, dy=2, sop=0.55)}">{"".join(out)}</g>'


# ================================================================ silhouettes (repère local, face à droite)

WOLF_HOWL = shape([
    (-34, -3, 1), (-24, -12), (-8, -15), (6, -22), (10, -36), (17, -50), (27, -63), (36, -76), (42, -90), (48, -103),
    (52, -112, 1), (53, -127, 1), (61, -116), (68, -119), (76, -127), (84, -137, 1), (85, -132), (79, -128, 1),
    (73, -123, 1), (79, -124, 1), (75, -117), (69, -110), (66, -101, 1), (68, -93, 1), (64, -88, 1), (67, -81, 1),
    (63, -74, 1), (65, -64), (64, -48), (63, -26), (63, -10), (66, -3), (72, -1, 1), (71, 0, 1), (55, 0, 1),
    (56, -12), (55, -30), (51, -38, 1), (45, -33), (40, -24), (43, -9), (49, -2, 1), (48, 0, 1), (22, 0, 1),
    (8, -2), (-12, -2),
])

WOLF_STAND = (
    "M0 -52 C10 -58 30 -60 52 -58 C62 -58 70 -62 76 -68 L80 -80 L86 -70 C90 -70 94 -68 96 -66 "
    "C102 -64 108 -61 112 -58 C114 -55 111 -52 106 -52 C102 -52 98 -50 95 -48 C90 -44 86 -40 82 -38 "
    "C80 -32 79 -24 80 -14 L82 -2 L85 0 L74 0 L74 -3 C72 -12 70 -22 68 -32 C58 -32 44 -32 32 -33 "
    "C30 -26 28 -18 27 -8 L28 -2 L31 0 L20 0 L20 -4 C18 -14 16 -24 14 -33 C10 -36 6 -40 3 -44 "
    "C-6 -42 -16 -36 -24 -28 C-26 -26 -28 -28 -26 -31 C-18 -40 -8 -48 0 -52 Z"
)

RAVEN_FLY = shape([
    (62, 1, 1), (52, -5), (43, -9), (34, -8), (26, -8, 1),
    (24, -26), (18, -44), (6, -60), (-4, -70, 1), (-8, -79, 1), (-12, -67, 1), (-19, -76, 1), (-21, -63, 1),
    (-30, -70, 1), (-28, -57, 1), (-38, -61, 1), (-33, -50, 1), (-44, -51, 1), (-35, -41), (-28, -32), (-22, -22), (-14, -10, 1),
    (-24, -6), (-34, -7, 1), (-52, -10, 1), (-47, -3, 1), (-56, 1, 1), (-47, 5, 1), (-52, 11, 1), (-32, 5, 1),
    (-16, 8), (4, 10), (22, 9), (36, 6), (46, 3, 1),
])

RAVEN_WING_FAR = shape([
    (32, -8, 1), (40, -28), (42, -46), (38, -60, 1), (34, -66, 1), (31, -56, 1), (25, -62, 1), (24, -50, 1),
    (17, -54, 1), (18, -42), (16, -28), (14, -12, 1),
])

RAVEN_PERCH = (
    "M-38 -4 L-30 -12 C-24 -18 -14 -26 -4 -34 C2 -40 8 -44 14 -46 C18 -48 23 -47 27 -45 C31 -43 34 -42 40 -40 "
    "L45 -37 L36 -35 C32 -35 29 -34 27 -32 C26 -28 26 -24 24 -20 C22 -12 18 -8 12 -6 L12 -1 L18 0 L5 0 L7 -5 "
    "C2 -6 -4 -6 -10 -6 L-34 -2 Z"
)

FENRIR_HEAD = shape([
    (0, 60, 1), (-10, 44, 1), (-4, 32, 1), (-16, 18, 1), (-4, 8, 1), (-12, -6, 1), (2, -12, 1), (-2, -26, 1), (12, -32),
    (18, -44), (20, -52, 1), (12, -100, 1), (34, -70), (44, -64, 1), (60, -64), (76, -60), (88, -54),
    (110, -47), (134, -41), (150, -38), (158, -31, 1), (154, -24, 1), (146, -23, 1), (142, -10, 1), (137, -21, 1),
    (126, -19, 1), (122, -12, 1), (118, -18, 1), (104, -14), (92, -4, 1), (106, 8, 1), (113, 3, 1), (117, 17, 1),
    (124, 22, 1), (136, 34, 1), (130, 44), (110, 48), (86, 46), (70, 52, 1), (64, 66, 1), (52, 60, 1), (44, 76, 1),
    (32, 66, 1), (22, 82, 1), (12, 68, 1),
])
FENRIR_EYE = (78, -44)


def silhouette(d, fill, rim=None, dx=1.4, dy=0.8, op=1):
    o = f' opacity="{f(op)}"' if op != 1 else ""
    if not rim:
        return f'<path d="{d}" fill="{fill}"{o}/>'
    return f'<g{o}><path d="{d}" fill="{rim}"/><path d="{d}" fill="{fill}" transform="translate({f(dx)} {f(dy)})"/></g>'


# ================================================================ drakkar

def dragon_head(fill, edge, eye="#FFD36E", s=1.0):
    """La tête de proue (repère : cou à l'origine, regard à droite, longueur ≈ 70)."""
    d = (
        "M0 -9 C2 -18 8 -25 18 -27 C28 -29 40 -26 50 -21 C56 -19 62 -21 66 -26 C70 -28 74 -24 71 -18 "
        "C69 -13 64 -11 58 -11 L44 -7 L60 -2 C66 0 70 4 66 8 C60 10 52 8 46 8 L40 9 C34 13 26 14 18 13 "
        "C10 12 4 11 0 9 Z"
    )
    teeth = "M44 -7 L47 -3 L50 -6 L53 -2 L56 -5 L58 -1"
    out = [f'<path d="{d}" fill="{fill}" stroke="{edge}" stroke-width="1.6" stroke-linejoin="round"/>',
           f'<path d="{teeth}" fill="none" stroke="{edge}" stroke-width="1.2"/>',
           f'<path d="M24 -18 Q31 -24 38 -18 Q31 -13 24 -18 Z" fill="{eye}" stroke="{edge}" stroke-width="1"/><circle cx="31" cy="-18" r="1.8" fill="{edge}"/>',
           f'<path d="M14 -26 C6 -48 -18 -52 -22 -34 C-24 -24 -12 -22 -12 -30" fill="none" stroke="{edge}" stroke-width="6" stroke-linecap="round"/>',
           f'<path d="M14 -26 C6 -48 -18 -52 -22 -34 C-24 -24 -12 -22 -12 -30" fill="none" stroke="{fill}" stroke-width="3.6" stroke-linecap="round"/>',
           f'<path d="M30 12 C30 24 20 30 12 26" fill="none" stroke="{edge}" stroke-width="5" stroke-linecap="round"/>',
           f'<path d="M30 12 C30 24 20 30 12 26" fill="none" stroke="{fill}" stroke-width="3" stroke-linecap="round"/>',
           f'<path d="M6 -14 C14 -16 20 -12 22 -6 M6 0 C14 -2 22 2 26 8" fill="none" stroke="{edge}" stroke-width="1" opacity="0.7"/>']
    return "".join(out)


def drakkar(card, name, wood=("#6B4426", "#2A160A"), edge="#0E0704", metal=OR, shields=True, oars=True,
            shield_seed=2, rim_light=None, prow_fill=None):
    """Le drakkar (repère : flottaison y = 0, x de 0 à 400, proue à GAUCHE). Proue en dragon, poupe en volute."""
    hi, mid, lo = metal
    wg = card.grad(name + "-wg", [(0, wood[0]), (1, wood[1])], 0, 0, 0, 1)
    out = []
    hull = (
        "M58 -2 C40 -8 26 -24 20 -48 L36 -50 C60 -46 120 -42 200 -42 C280 -42 340 -46 364 -50 L380 -48 "
        "C374 -24 360 -8 342 -2 C300 6 250 8 200 8 C150 8 100 6 58 -2 Z"
    )
    prow = [(64, -4), (34, -18), (20, -50), (16, -90), (22, -122), (36, -146)]
    stern = [(336, -4), (366, -18), (380, -50), (386, -90), (378, -116), (360, -120), (352, -106), (360, -96), (368, -102)]
    if oars:
        for i in range(10):
            x = 92 + i * 24
            out.append(f'<line x1="{f(x)}" y1="-34" x2="{f(x - 30)}" y2="16" stroke="{edge}" stroke-width="2.4"/>'
                       f'<line x1="{f(x)}" y1="-34" x2="{f(x - 30)}" y2="16" stroke="{wood[0]}" stroke-width="1.2"/>')
    out.append(f'<path d="{ribbon(prow, 22, 12, n=40)}" fill="{prow_fill or wg}" stroke="{edge}" stroke-width="1.6"/>')
    out.append(f'<path d="{ribbon(stern, 22, 5, n=50)}" fill="{wg}" stroke="{edge}" stroke-width="1.6"/>')
    out.append(f'<path d="{hull}" fill="{wg}" stroke="{edge}" stroke-width="1.8"/>')
    for k, yy in enumerate((-32, -22, -12)):
        out.append(f'<path d="M{f(40 + k * 8)} {f(yy - 6)} C120 {f(yy + 2)} 280 {f(yy + 2)} {f(360 - k * 8)} {f(yy - 6)}" fill="none" stroke="{edge}" stroke-width="1.1" opacity="0.75"/>')
        out.append(f'<path d="M{f(40 + k * 8)} {f(yy - 5)} C120 {f(yy + 3)} 280 {f(yy + 3)} {f(360 - k * 8)} {f(yy - 5)}" fill="none" stroke="#FFFFFF" stroke-width="0.6" opacity="0.12"/>')
    out.append(f'<path d="M36 -50 C60 -46 120 -42 200 -42 C280 -42 340 -46 364 -50" fill="none" stroke="{metal_grad(card, name + "-gm", metal)}" stroke-width="3"/>')
    if shields:
        rnd = random.Random(shield_seed)
        for i in range(12):
            x = 76 + i * 22.5
            yy = -44 + 2 * math.sin(i)
            cols = SHIELD_PAINTS[rnd.randrange(len(SHIELD_PAINTS))]
            out.append(round_shield(card, x, yy, 11.5, cols, rnd.choice(["quart", "rayons", "spirale", "anneau"]), metal, name=f"{name}-s{i}", studs=6, rot=rnd.uniform(0, 90)))
    hx, hy = prow[-1]
    out.append(f'<g transform="translate({f(hx)} {f(hy)}) rotate(-38) scale(-1 1)">{dragon_head(prow_fill or wood[0], edge, hi)}</g>')
    if rim_light:
        out.append(f'<path d="M58 -2 C40 -8 26 -24 20 -48" fill="none" stroke="{rim_light}" stroke-width="1.2" opacity="0.6"/>')
    return "".join(out)


# ================================================================ le frêne-monde

def grow(rnd, x, y, ang, length, width, depth, spread=34, decay=0.72, wdecay=0.66, bend=14, out=None, tips=None, min_w=0.9, bias=0.0, kids=(2, 3)):
    """Une branche qui se divise (angle en degrés depuis le haut, sens horaire)."""
    out = [] if out is None else out
    tips = [] if tips is None else tips
    b = rnd.uniform(-bend, bend)
    p1 = pt(x, y, length * 0.36, ang + b)
    p2 = pt(x, y, length * 0.7, ang - b * 0.5)
    end = pt(x, y, length, ang + b * 0.2)
    w_end = max(min_w * 0.7, width * wdecay)
    out.append(ribbon([(x, y), p1, p2, end], width, w_end, n=12))
    if depth <= 0 or w_end < min_w:
        tips.append((end[0], end[1], ang))
        return out, tips
    k = rnd.randint(*kids)
    for i in range(k):
        off = (i - (k - 1) / 2) * spread * (2 / max(1, k - 1)) * rnd.uniform(0.7, 1.1) if k > 1 else rnd.uniform(-spread, spread) * 0.4
        grow(rnd, end[0], end[1], ang + off + bias, length * decay * rnd.uniform(0.8, 1.1), w_end * rnd.uniform(0.9, 1.0), depth - 1,
             spread, decay, wdecay, bend, out, tips, min_w, bias, kids)
    return out, tips


def limb_with_twigs(rnd, pts, w0, w1, side, twig_every=0.14, twig_len=46, twig_depth=3, spread=30, out=None, tips=None, min_w=0.8, start=0.25):
    """Une maîtresse branche le long d'un tracé, d'où partent des rameaux vers l'extérieur."""
    out = [] if out is None else out
    tips = [] if tips is None else tips
    out.append(ribbon(pts, w0, w1, n=60))
    sp = resample(pts, 60)
    t = start
    while t < 0.98:
        i = int(t * 59)
        x, y = sp[i]
        a, b = sp[max(0, i - 1)], sp[min(59, i + 1)]
        direction = math.degrees(math.atan2(b[0] - a[0], -(b[1] - a[1])))
        ang = direction + side * rnd.uniform(28, 62)
        wi = (w0 + (w1 - w0) * t) * 0.55
        grow(rnd, x, y, ang, twig_len * rnd.uniform(0.7, 1.2) * (1.1 - 0.4 * t), wi, twig_depth, spread=spread, out=out, tips=tips, min_w=min_w)
        t += twig_every * rnd.uniform(0.75, 1.25)
    tips.append((sp[-1][0], sp[-1][1], 0))
    return out, tips


def leaves(seed, tips, color, r=3.2, n=5, spread=7, op=(0.5, 1.0), alt=None):
    rnd = random.Random(seed)
    out = []
    for x, y, a in tips:
        for _ in range(n):
            lx, ly = x + rnd.gauss(0, spread), y + rnd.gauss(0, spread)
            rot = rnd.uniform(0, 180)
            col = alt if (alt and rnd.random() < 0.3) else color
            out.append(f'<ellipse cx="{f(lx)}" cy="{f(ly)}" rx="{f(r)}" ry="{f(r * 0.45)}" transform="rotate({f(rot)} {f(lx)} {f(ly)})" fill="{col}" opacity="{f(rnd.uniform(*op))}"/>')
    return "".join(out)


# ================================================================ pierres, lune

def standing_stone(card, name, x, y, w, h, seed=1, fill=("#5E6B78", "#1C232C"), lichen="#9FD8C0", runes_color=None, tilt=0):
    rnd = random.Random(seed)
    pts = [(x - w * 0.5, y), (x - w * 0.52 + rnd.uniform(-3, 3), y - h * 0.4), (x - w * 0.42, y - h * 0.82), (x - w * 0.12, y - h),
           (x + w * 0.2, y - h * 0.97), (x + w * 0.45, y - h * 0.78), (x + w * 0.52, y - h * 0.4), (x + w * 0.5, y)]
    d = smooth(pts, closed=True)
    g = card.grad(name + "-g", [(0, fill[0]), (1, fill[1])], 0, 0, 1, 1)
    out = [f'<path d="{d}" fill="{g}"/>',
           f'<path d="{d}" fill="#B8C4D0" opacity="0.22" filter="{texture_filter(card, name + "-tx", "0.08", seed, 3, "#FFFFFF", 1.3, 4)}"/>']
    if runes_color:
        out.append(f'<g opacity="0.85">{rune_line(seed, x - w * 0.12, y - h * 0.82, x + w * 0.12, w * 0.22, runes_color, 1.3)}</g>')
    tr = f' transform="rotate({tilt} {f(x)} {f(y)})"' if tilt else ""
    return f'<g{tr}>{"".join(out)}</g>'


def moon(card, name, cx, cy, r, tint="#EAF4FF", glow_c="#9FD8FF", glow=2.4, phase=None):
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * glow)}" fill="{card.rgrad(name + "-gl", [(0, glow_c, 0.45), (0.4, glow_c, 0.12), (1, glow_c, 0)])}"/>']
    mg = card.rgrad(name + "-m", [(0, "#FFFFFF", 1), (0.7, tint, 1), (1, "#B9CDE3", 1)], 0.4, 0.38, 0.65)
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{mg}"/>')
    rnd = random.Random(5)
    for _ in range(7):
        a, d = rnd.uniform(0, 360), rnd.uniform(0, r * 0.7)
        x, y = pt(cx, cy, d, a)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(r * 0.06, r * 0.18))}" fill="#9DB2CC" opacity="0.35"/>')
    if phase:
        out.append(f'<circle cx="{f(cx + r * phase)}" cy="{f(cy - r * 0.1)}" r="{f(r)}" fill="#050B1A" opacity="0.92"/>')
    return "".join(out)
