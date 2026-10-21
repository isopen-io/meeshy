"""Paliers de niveau - de la lueur à la singularité. Motifs du ciel : lucioles, aurores, galaxies, nébuleuses,
supernova, trou noir ; l'emblème est un anneau de niveau gravé du nombre."""

import math
import random

from base import Card, W, H, f, pt, esc, photo, bird, mee_meo, sparkle, SANS, CINZEL, CINZEL_DECO, HAND
from kit import (group, rrect, arch, oval, circle_d, ring_d, ogive, octo, deco_mask, soft_mask, clip, bevel, noise, wobble,
                 metal_grad, rim, inner_shadow, grade, halo, ring_text, lgrad, dust, bright_stars, outer_frame, inscription, glints,
                 smooth_closed, smooth_open)

SILVER = ("#FFFFFF", "#C9D2DE", "#5E6A7C")
ICE = ("#F2FFFD", "#9FD8DA", "#3A6470")
GOLD = ("#FFF4C2", "#E8B53C", "#8A5A12")
ROSE = ("#FFE6DA", "#E8A08A", "#8B4A3A")
PLATINUM = ("#FFFFFF", "#DCE6FF", "#7E8BB0")
OBSIDIAN = ("#C8CCE0", "#3A3F55", "#07080F")


# ---------------------------------------------------------------- l'anneau de niveau

def level_ring(card, cx, cy, r, number, label, metal, name="lr", inner="", glow=None, glow_op=0.55, band=17,
               disc=("#1C1840", "#0A0818", "#030208"), num_fill=None, ink=None, rays_markup=""):
    """L'emblème des paliers : un anneau gravé (« NIVEAU 90 · GALAXIE · ») autour d'un disque où brille le nombre."""
    hi, mid, lo = metal
    out = []
    if glow:
        out.append(halo(card, cx, cy, r * 2.3, glow, glow_op, name + "-glow"))
    out.append(rays_markup)
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy + 6)}" r="{f(r)}" fill="#000000" opacity="0.5" filter="{card.blur(name + "-sh", 7)}"/>')
    dg = card.rgrad(name + "-disc", [(0, disc[0], 1), (0.7, disc[1], 1), (1, disc[2], 1)], 0.5, 0.38, 0.62)
    ri = r - band
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(ri)}" fill="{dg}"/>')
    if inner:
        out.append(f'<g clip-path="{clip(card, circle_d(cx, cy, ri), name + "-ic")}">{inner}</g>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(ri)}" fill="none" stroke="#000000" stroke-width="8" opacity="0.45" filter="{card.blur(name + "-is", 4)}"/>')
    g = metal_grad(card, name + "-band", metal)
    out.append(f'<g filter="{bevel(card, name + "-bv", 1.1, 2.6, sd=3, dy=2, sop=0.5)}"><path d="{ring_d(cx, cy, ri, r)}" fill-rule="evenodd" fill="{g}"/></g>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r - 2.2)}" fill="none" stroke="{lo}" stroke-width="0.7" opacity="0.7"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(ri + 2.2)}" fill="none" stroke="{lo}" stroke-width="0.7" opacity="0.7"/>')
    words = f"NIVEAU {number} · {label} · "
    txt = words * 2
    tr = ri + band / 2 - 3.1
    out.append(ring_text(card, name + "-tp", cx, cy + 0.7, tr, txt, size=8.6, fill=hi, weight=800, full=True, extra='opacity="0.55"'))
    out.append(ring_text(card, name + "-tp2", cx, cy, tr, txt, size=8.6, fill=ink or lo, weight=800, full=True))
    size = {1: 60, 2: 54, 3: 44, 4: 34}[len(str(number))]
    nf = num_fill or card.grad(name + "-num", [(0, "#FFFFFF"), (0.45, hi), (0.8, mid), (1, lo)], 0, 0, 0, 1)
    out.append(f'<text x="{f(cx)}" y="{f(cy - ri * 0.42)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="7.5" letter-spacing="2.6" fill="{hi}" opacity="0.85">NIVEAU</text>')
    out.append(
        f'<g filter="{bevel(card, name + "-nbv", 0.9, 2.2, sd=2, dy=2, sop=0.8)}"><text x="{f(cx)}" y="{f(cy + size * 0.36)}" text-anchor="middle" '
        f'font-family="{CINZEL}" font-weight="700" font-size="{size}" fill="{nf}">{esc(str(number))}</text></g>'
    )
    card.add("".join(out))


# ---------------------------------------------------------------- motifs du ciel

def lucioles(seed, paths, color="#FFF3A6", glow="#FFD45A"):
    """Des lucioles qui montent en spirale le long de trajectoires (listes de points)."""
    rnd = random.Random(seed)
    out_glow, out_core = [], []
    for pts in paths:
        n = len(pts)
        for i, (x, y) in enumerate(pts):
            k = 1 - i / max(1, n - 1)
            r = 0.6 + 1.9 * (k ** 1.4) * rnd.uniform(0.7, 1.1)
            out_glow.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 4.2)}" fill="{glow}" opacity="{f(0.18 + 0.32 * k)}"/>')
            out_core.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{color}" opacity="{f(0.45 + 0.55 * k)}"/>')
    return out_glow, out_core


def spiral_path(x0, y0, x1, y1, turns, amp, n, phase=0.0):
    pts = []
    for i in range(n):
        t = i / (n - 1)
        x = x0 + (x1 - x0) * t + amp * (0.4 + 0.6 * t) * math.sin(phase + t * turns * 2 * math.pi)
        y = y0 + (y1 - y0) * t + 6 * math.cos(phase + t * turns * 2 * math.pi)
        pts.append((x, y))
    return pts


def grass(seed, x0, x1, base, hmin, hmax, color, n=90, lean=6):
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        x = rnd.uniform(x0, x1)
        h = rnd.uniform(hmin, hmax)
        bend = rnd.uniform(-lean, lean)
        w = rnd.uniform(1.6, 3.4)
        out.append(f'<path d="M{f(x - w)} {f(base)} Q{f(x + bend * 0.4)} {f(base - h * 0.6)} {f(x + bend)} {f(base - h)} Q{f(x + bend * 0.3 + 0.6)} {f(base - h * 0.55)} {f(x + w)} {f(base)} Z" fill="{color}"/>')
    return "".join(out)


def ridge(seed, x0, x1, base, peaks, rough=14, step=10):
    """Une ligne de crêtes : `peaks` = [(x, y)] et de l'irrégularité entre eux."""
    rnd = random.Random(seed)
    pts = []
    for (ax, ay), (bx, by) in zip(peaks, peaks[1:]):
        steps = max(2, int(abs(bx - ax) / step))
        for i in range(steps):
            t = i / steps
            pts.append((ax + (bx - ax) * t, ay + (by - ay) * t + rnd.uniform(-rough, rough) * math.sin(math.pi * t)))
    pts.append(peaks[-1])
    return pts


def aurora(card, name, seed, x0, x1, base_fn, height_fn, colors=("#46FFB4", "#2EE6C8", "#B26BFF"), strip=3.2, op=0.85):
    """Un rideau d'aurore : des rayons verticaux serrés, verts à la base, violets au sommet."""
    rnd = random.Random(seed)
    g = lgrad(card, name + "-g", [(0, colors[2], 0), (0.35, colors[2], 0.35 * op), (0.7, colors[1], 0.7 * op), (0.92, colors[0], op), (1, colors[0], 0)])
    out = []
    x = x0
    while x < x1:
        b = base_fn(x)
        h = height_fn(x) * rnd.uniform(0.75, 1.15)
        a = rnd.uniform(0.35, 1.0)
        out.append(f'<rect x="{f(x)}" y="{f(b - h)}" width="{f(strip + 0.6)}" height="{f(h)}" fill="{g}" opacity="{f(a)}"/>')
        x += strip
    body = "".join(out)
    return (
        f'<g filter="{card.blur(name + "-gl", 9)}" opacity="0.8">{body}</g>'
        f'<g filter="{card.blur(name + "-sh", 1.1)}">{body}</g>'
    )


def galaxy_rich(card, name, cx, cy, r, tilt=0.42, pa=-18, arms=2, seed=5, n=900, core="#FFF2D2",
                arm_color="#9FC2FF", knot="#FF7FC8", dust_color="#140A1E", wind=3.6):
    """Une galaxie spirale : halo, bras nébuleux, poussières sombres, amas roses, étoiles, bulbe."""
    rnd = random.Random(seed)
    cp, sp = math.cos(math.radians(pa)), math.sin(math.radians(pa))

    def proj(rr, ang):
        x, y = rr * math.cos(ang), rr * math.sin(ang) * tilt
        return cx + x * cp - y * sp, cy + x * sp + y * cp

    out = [f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 1.05)}" ry="{f(r * 1.05 * tilt)}" transform="rotate({pa} {f(cx)} {f(cy)})" '
           f'fill="{card.rgrad(name + "-halo", [(0, core, 0.5), (0.25, arm_color, 0.22), (1, arm_color, 0)])}"/>']
    neb, dst, st, kn = [], [], [], []
    for i in range(n):
        arm = i % arms
        t = rnd.random() ** 0.8
        ang = arm * 2 * math.pi / arms + t * wind + rnd.gauss(0, 0.2 + 0.1 * t)
        rr = (0.08 + 0.92 * t) * r
        x, y = proj(rr, ang)
        if i % 3 == 0:
            neb.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(5, 13) * (1.2 - t * 0.5))}" fill="{arm_color}" opacity="{f(0.07 + 0.08 * (1 - t))}"/>')
        if i % 4 == 1:
            dx, dy = proj(rr * 0.94, ang - 0.12)
            dst.append(f'<circle cx="{f(dx)}" cy="{f(dy)}" r="{f(rnd.uniform(2, 5) * (1.1 - t * 0.5))}" fill="{dust_color}" opacity="{f(0.35 * (1 - t * 0.6))}"/>')
        if i % 17 == 2 and t > 0.25:
            kn.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(1.2, 2.6))}" fill="{knot}" opacity="0.85"/>')
        col = rnd.choice(("#FFFFFF", "#DCE8FF", arm_color, "#FFF0D0"))
        st.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(0.35, 1.5) * (1.25 - t * 0.6))}" fill="{col}" opacity="{f(0.45 + 0.5 * (1 - t))}"/>')
    out.append(f'<g filter="{card.blur(name + "-nb", 4)}">{"".join(neb)}</g>')
    out.append(f'<g filter="{card.blur(name + "-ds", 1.6)}">{"".join(dst)}</g>')
    out.append("".join(st))
    out.append(f'<g filter="{card.blur(name + "-kn", 0.8)}">{"".join(kn)}</g>')
    out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 0.24)}" ry="{f(r * 0.24 * tilt * 1.2)}" transform="rotate({pa} {f(cx)} {f(cy)})" '
               f'fill="{card.rgrad(name + "-bulge", [(0, "#FFFFFF", 1), (0.3, core, 0.85), (1, core, 0)])}"/>')
    return "".join(out)


def gas(card, name, cx, cy, rx, ry, color, op=0.85, freq="0.011", seed=3, a=2.6, b=-0.95, octaves=5, rot=0):
    """Une nappe de gaz : ellipse colorée dégradée, découpée dans un bruit fractal."""
    g = card.rgrad(name + "-g", [(0, color, op), (0.55, color, op * 0.55), (1, color, 0)])
    tr = f' transform="rotate({rot} {f(cx)} {f(cy)})"' if rot else ""
    return f'<g filter="{noise(card, name + "-n", freq, octaves, seed, a, b)}"><ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}"{tr} fill="{g}"/></g>'


def pillar(seed, x_base, w_base, top_x, top_y, base_y=980, wav=10):
    """Un pilier de poussière : un doigt de gaz sombre qui monte, ondulant."""
    rnd = random.Random(seed)
    left, right = [], []
    n = 9
    for i in range(n + 1):
        t = i / n
        cx = x_base + (top_x - x_base) * t + rnd.uniform(-wav, wav) * math.sin(math.pi * t)
        y = base_y + (top_y - base_y) * t
        w = w_base * (1 - t) ** 0.8 + 10 * (1 - t) + 6
        left.append((cx - w / 2 + rnd.uniform(-4, 4), y))
        right.append((cx + w / 2 + rnd.uniform(-4, 4), y))
    pts = left + [(top_x + rnd.uniform(-3, 3), top_y - 12)] + right[::-1]
    return smooth_closed(pts)


def shards(seed, n, center, rmin, rmax, avoid, colors, size=(5, 16)):
    """Des éclats de cristal projetés depuis `center`, avec leur traînée."""
    rnd = random.Random(seed)
    cx, cy = center
    out = []
    for _ in range(n):
        a = rnd.uniform(0, 360)
        rr = rnd.uniform(rmin, rmax)
        x, y = pt(cx, cy, rr, a)
        if avoid[0] < x < avoid[2] and avoid[1] < y < avoid[3]:
            continue
        if not (-10 < x < W + 10 and -10 < y < H + 10):
            continue
        s = rnd.uniform(*size)
        col = rnd.choice(colors)
        tx, ty = pt(cx, cy, rr - s * 5, a)
        out.append(f'<line x1="{f(tx)}" y1="{f(ty)}" x2="{f(x)}" y2="{f(y)}" stroke="{col}" stroke-width="{f(s * 0.22)}" stroke-linecap="round" opacity="0.35"/>')
        p1 = pt(x, y, s, a)
        p2 = pt(x, y, s * 0.45, a + 110)
        p3 = pt(x, y, s * 0.5, a - 120)
        out.append(f'<path d="M{f(p1[0])} {f(p1[1])} L{f(p2[0])} {f(p2[1])} L{f(p3[0])} {f(p3[1])} Z" fill="{col}" opacity="0.92"/>')
        out.append(f'<path d="M{f(p1[0])} {f(p1[1])} L{f(p2[0])} {f(p2[1])} L{f(x)} {f(y)} Z" fill="#FFFFFF" opacity="0.55"/>')
    return "".join(out)


# ---------------------------------------------------------------- la terre d'en bas

def baobab(seed, x, base, trunk_w, trunk_h, color, crown=1.0, lean=0.0, reach=None, n=7, spread=150):
    """Un baobab en silhouette : tronc ventru, couronne de branches courtes et noueuses, comme des racines au ciel."""
    rnd = random.Random(seed)
    top = base - trunk_h
    tw = trunk_w
    reach = reach or trunk_h * 0.36
    trunk = (
        f"M{f(x - tw * 0.6)} {f(base)} C{f(x - tw * 0.66)} {f(base - trunk_h * 0.5)} {f(x - tw * 0.46)} {f(top + trunk_h * 0.22)} {f(x - tw * 0.3 + lean)} {f(top)} "
        f"L{f(x + tw * 0.3 + lean)} {f(top)} C{f(x + tw * 0.46)} {f(top + trunk_h * 0.22)} {f(x + tw * 0.66)} {f(base - trunk_h * 0.5)} {f(x + tw * 0.6)} {f(base)} Z"
    )
    out = [f'<path d="{trunk}" fill="{color}"/>']

    def branch(bx, by, ang, length, width, depth):
        ex, ey = pt(bx, by, length, ang)
        mx, my = pt(bx, by, length * 0.5, ang + rnd.uniform(-16, 16))
        out.append(f'<path d="M{f(bx)} {f(by)} Q{f(mx)} {f(my)} {f(ex)} {f(ey)}" fill="none" stroke="{color}" stroke-width="{f(width)}" stroke-linecap="round"/>')
        if depth == 0:
            return
        for k in range(rnd.choice((2, 3, 3))):
            branch(ex, ey, ang + rnd.uniform(-42, 42), length * rnd.uniform(0.42, 0.62), width * 0.5, depth - 1)

    for i in range(n):
        ang = -spread / 2 + spread * i / (n - 1) + rnd.uniform(-7, 7)
        sx = x + lean + tw * 0.5 * (i / (n - 1) - 0.5)
        branch(sx, top + tw * 0.08, ang, reach * rnd.uniform(0.75, 1.15) * crown, tw * 0.17, 3)
    return "".join(out)


def acacia(seed, x, base, h, w, color):
    """Un acacia parasol : tronc fin qui se divise, couronne plate et large."""
    rnd = random.Random(seed)
    top = base - h
    out = [f'<path d="M{f(x - 2)} {f(base)} Q{f(x - 1)} {f(base - h * 0.5)} {f(x - w * 0.18)} {f(top + 6)} M{f(x + 2)} {f(base)} Q{f(x + 2)} {f(base - h * 0.55)} {f(x + w * 0.2)} {f(top + 6)}" '
           f'fill="none" stroke="{color}" stroke-width="2.2" stroke-linecap="round"/>']
    pts = []
    for i in range(14):
        t = i / 13
        pts.append((x - w / 2 + w * t, top + 4 - 7 * math.sin(math.pi * t) + rnd.uniform(-1.5, 1.5)))
    pts += [(x + w / 2 - 6, top + 8), (x - w / 2 + 6, top + 8)]
    out.append(f'<path d="{smooth_closed(pts)}" fill="{color}"/>')
    return "".join(out)


def milky_way(card, name, x0, y0, x1, y1, width, seed, n=900, tint=("#E6DCFF", "#FFE6C8", "#BFD4FF")):
    """La Voie lactée : une bande de gaz laiteux, une rivière d'étoiles fines, une ligne de poussière sombre."""
    rnd = random.Random(seed)
    ang = math.degrees(math.atan2(y1 - y0, x1 - x0))
    L = math.hypot(x1 - x0, y1 - y0)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    out = [gas(card, name + "-a", cx, cy, L / 2, width * 0.6, tint[0], 0.45, "0.012", seed, rot=ang),
           gas(card, name + "-b", cx, cy, L / 2.2, width * 0.32, tint[1], 0.5, "0.02", seed + 1, rot=ang)]
    st = []
    ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    for _ in range(n):
        u = rnd.uniform(-L / 2, L / 2)
        v = rnd.gauss(0, width * 0.24)
        x, y = cx + u * ca - v * sa, cy + u * sa + v * ca
        st.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(0.3, 1.1))}" fill="{rnd.choice(tint + ("#FFFFFF",))}" opacity="{f(rnd.uniform(0.3, 0.95))}"/>')
    out.append("".join(st))
    lane = gas(card, name + "-d", cx, cy, L / 2.4, width * 0.08, "#05030C", 0.8, "0.03", seed + 2, rot=ang, a=3.2, b=-1.1)
    out.append(lane)
    return "".join(out)


def spruce(seed, x, base, h, w, color):
    """Un épicéa boréal en silhouette : étages de branches tombantes, pointe fine."""
    rnd = random.Random(seed)
    tiers = max(5, int(h / 9))
    left, right = [], []
    for i in range(tiers + 1):
        t = i / tiers
        y = base - h * t
        half = w / 2 * (1 - t) ** 0.95 + 1
        jag = rnd.uniform(0.75, 1.15)
        left += [(x - half * jag, y), (x - half * 0.45, y - h / tiers * 0.55)]
        right += [(x + half * jag, y), (x + half * 0.45, y - h / tiers * 0.55)]
    pts = left + [(x, base - h - 4)] + right[::-1]
    d = "M" + " L".join(f"{f(px)} {f(py)}" for px, py in pts) + " Z"
    return f'<path d="{d}" fill="{color}"/><line x1="{f(x)}" y1="{f(base)}" x2="{f(x)}" y2="{f(base + 6)}" stroke="{color}" stroke-width="2"/>'


def forest(seed, x0, x1, base_fn, hmin, hmax, color, step=(9, 16)):
    rnd = random.Random(seed)
    out = []
    x = x0
    while x < x1:
        h = rnd.uniform(hmin, hmax)
        out.append(spruce(rnd.randint(0, 9999), x, base_fn(x), h, h * rnd.uniform(0.3, 0.38), color))
        x += rnd.uniform(*step)
    return "".join(out)


def edge_on(card, name, cx, cy, r, rot, color="#CFE0FF", core="#FFF0D0"):
    """Une galaxie vue par la tranche : un fuseau d'étoiles, un bulbe, une ligne de poussière qui la coupe en deux."""
    tr = f'transform="rotate({rot} {f(cx)} {f(cy)})"'
    halo_g = card.rgrad(name + "-h", [(0, core, 0.9), (0.25, color, 0.45), (1, color, 0)])
    bul = card.rgrad(name + "-b", [(0, "#FFFFFF", 1), (0.4, core, 0.9), (1, core, 0)])
    return (
        f'<g {tr}><ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r)}" ry="{f(r * 0.16)}" fill="{halo_g}"/>'
        f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 0.28)}" ry="{f(r * 0.14)}" fill="{bul}"/>'
        f'<ellipse cx="{f(cx)}" cy="{f(cy + r * 0.012)}" rx="{f(r * 0.86)}" ry="{f(r * 0.022)}" fill="#08040E" opacity="0.8" filter="{card.blur(name + "-l", 0.8)}"/></g>'
    )


def globular(seed, cx, cy, r, color="#FFE9C8", n=160):
    """Un amas globulaire : une boule d'étoiles serrées au cœur."""
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        d = abs(rnd.gauss(0, r * 0.38))
        a = rnd.uniform(0, 2 * math.pi)
        out.append(f'<circle cx="{f(cx + d * math.cos(a))}" cy="{f(cy + d * math.sin(a))}" r="{f(rnd.uniform(0.3, 1.1))}" fill="{color}" opacity="{f(rnd.uniform(0.5, 1))}"/>')
    return "".join(out)


def galaxy_spiral(card, name, cx, cy, R, tilt=0.5, pa=-10, arms=2, turns=1.25, seed=5, r0=0.12,
                  arm_color="#AFC8FF", glow_color="#7F8CFF", knot="#FF7FC8", core="#FFE9C0", n_stars=1400, dust_op=0.55):
    """Une galaxie spirale lisible : bras logarithmiques nébuleux, couloir de poussière, régions roses, bulbe d'or."""
    rnd = random.Random(seed)
    cp, sp = math.cos(math.radians(pa)), math.sin(math.radians(pa))

    def proj(rr, ang):
        x, y = rr * math.cos(ang), rr * math.sin(ang) * tilt
        return cx + x * cp - y * sp, cy + x * sp + y * cp

    th_max = turns * 2 * math.pi
    b = math.log(1 / r0) / th_max
    wide, mid, lane, knots, stars = [], [], [], [], []
    for arm in range(arms):
        off = arm * 2 * math.pi / arms
        for i in range(160):
            t = i / 159
            th = t * th_max
            rr = R * r0 * math.exp(b * th)
            x, y = proj(rr, th + off)
            w = (1 - t * 0.55) * R * 0.075 * (0.6 + 0.4 * tilt)
            wide.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(w * 1.6)}" fill="{glow_color}" opacity="{f(0.10 + 0.08 * (1 - t))}"/>')
            mid.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(w * 0.7)}" fill="{arm_color}" opacity="{f(0.16 + 0.14 * (1 - t))}"/>')
            lx, ly = proj(rr * 0.9, th + off - 0.1)
            lane.append(f'<circle cx="{f(lx)}" cy="{f(ly)}" r="{f(w * 0.28)}" fill="#0A0614" opacity="{f(dust_op * (1 - t * 0.5))}"/>')
            if i % 7 == 3 and t > 0.15:
                kx, ky = proj(rr * rnd.uniform(0.96, 1.06), th + off + rnd.uniform(-0.05, 0.05))
                knots.append(f'<circle cx="{f(kx)}" cy="{f(ky)}" r="{f(rnd.uniform(1.4, 3.0))}" fill="{knot}" opacity="0.85"/>')
    for _ in range(n_stars):
        arm = rnd.randrange(arms)
        t = rnd.random() ** 0.9
        th = t * th_max
        rr = R * r0 * math.exp(b * th) * rnd.gauss(1, 0.12)
        x, y = proj(rr, th + arm * 2 * math.pi / arms + rnd.gauss(0, 0.16))
        col = rnd.choice(("#FFFFFF", "#DCE8FF", arm_color, "#FFF0D0"))
        stars.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(0.35, 1.3) * (1.25 - t * 0.5))}" fill="{col}" opacity="{f(0.45 + 0.5 * (1 - t))}"/>')
    disk = card.rgrad(name + "-disk", [(0, core, 0.55), (0.3, arm_color, 0.16), (1, arm_color, 0)])
    bulge = card.rgrad(name + "-bul", [(0, "#FFFFFF", 1), (0.25, core, 0.9), (1, core, 0)])
    return (
        f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(R * 1.1)}" ry="{f(R * 1.1 * tilt)}" transform="rotate({pa} {f(cx)} {f(cy)})" fill="{disk}"/>'
        f'<g filter="{card.blur(name + "-w", 9)}">{"".join(wide)}</g>'
        f'<g filter="{card.blur(name + "-m", 3.5)}">{"".join(mid)}</g>'
        f'<g filter="{card.blur(name + "-l", 2.2)}">{"".join(lane)}</g>'
        + "".join(stars)
        + f'<g filter="{card.blur(name + "-k", 0.9)}">{"".join(knots)}</g>'
        f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(R * 0.3)}" ry="{f(R * 0.3 * tilt * 1.15)}" transform="rotate({pa} {f(cx)} {f(cy)})" fill="{bulge}"/>'
    )


def spiked_star(card, name, cx, cy, r, color="#DCEBFF", op=1.0):
    """Une jeune étoile vue par un grand miroir : six aigrettes de diffraction, deux courtes, un halo bleuté."""
    out = [halo(card, cx, cy, r * 1.3, color, 0.55 * op, name + "-h")]
    spikes = []
    for a, k in ((0, 1), (60, 1), (120, 1), (180, 1), (240, 1), (300, 1), (90, 0.45), (270, 0.45)):
        x1, y1 = pt(cx, cy, r * k, a)
        x0, y0 = pt(cx, cy, r * k * 0.08, a + 90)
        x2, y2 = pt(cx, cy, r * k * 0.08, a - 90)
        spikes.append(f'<path d="M{f(x0)} {f(y0)} L{f(x1)} {f(y1)} L{f(x2)} {f(y2)} Z" fill="{color}" opacity="{f(0.9 * op)}"/>')
    out.append(f'<g filter="{card.blur(name + "-sb", 1.2)}">{"".join(spikes)}</g>')
    out.append("".join(spikes).replace(color, "#FFFFFF").replace(f'opacity="{f(0.9 * op)}"', f'opacity="{f(0.6 * op)}"'))
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.14)}" fill="#FFFFFF"/>')
    return "".join(out)
