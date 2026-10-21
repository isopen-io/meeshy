"""Abysses - l'immense et l'infime : étoiles, nébuleuses, galaxies, trou noir, quasar, toile cosmique,
amas, supernova ; atomes, noyau, ADN, molécules, cellules, neurones, ondes, mousse quantique, cordes,
traces de particules ; diatomées, radiolaires, cristaux, géométrie sacrée, foraminifères."""

import math
import random

from base import W, H, f, pt, sparkle
from kit import catmull, poly, smooth, resample, normals, lerp, glow, blur, cloud_filter

WIN = (84, 246, 456, 722)


def _inside(x, y, avoid, pad=0):
    return avoid and avoid[0] - pad < x < avoid[2] + pad and avoid[1] - pad < y < avoid[3] + pad


# ---------------------------------------------------------------- étoiles

def starfield(card, seed, n, region=(0, 0, W, H), avoid=WIN, colors=("#FFFFFF", "#CFE6FF", "#FFE7C2", "#BFFBFF"), rmax=1.5, bright=6, bright_r=(5, 11), bright_color="#FFFFFF"):
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if _inside(x, y, avoid):
            continue
        r = 0.3 + rnd.random() ** 3 * rmax
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{rnd.choice(colors)}" opacity="{f(rnd.uniform(0.35, 1))}"/>')
    gl = []
    for _ in range(bright):
        for _try in range(20):
            x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
            if not _inside(x, y, avoid, 6):
                break
        r = rnd.uniform(*bright_r)
        gl.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.5)}" fill="{bright_color}" opacity="0.35"/>')
        gl.append(sparkle(x, y, r, bright_color, 0.95))
        gl.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.14)}" fill="#FFFFFF"/>')
    return "".join(out) + f'<g filter="{glow(card, "sf-gl", 1.6, 1)}">{"".join(gl)}</g>'


def constellation(card, pts, edges=None, color="#BFF6FF", star="#FFFFFF", w=0.9, op=0.7, r=(1.6, 3.2), seed=1, name="cst", dash=None):
    """Étoiles reliées : `pts` liste de (x, y) ; `edges` paires d'indices (défaut : la chaîne)."""
    rnd = random.Random(seed)
    edges = edges if edges is not None else [(i, i + 1) for i in range(len(pts) - 1)]
    da = f' stroke-dasharray="{dash}"' if dash else ""
    lines = "".join(
        f'<line x1="{f(pts[a][0])}" y1="{f(pts[a][1])}" x2="{f(pts[b][0])}" y2="{f(pts[b][1])}" stroke="{color}" stroke-width="{w}" opacity="{op}"{da}/>'
        for a, b in edges
    )
    stars = []
    for x, y in pts:
        rr = rnd.uniform(*r)
        stars.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rr * 2.2)}" fill="{color}" opacity="0.25"/>'
                     f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rr)}" fill="{star}"/>')
    return lines + f'<g filter="{glow(card, name + "-g", 2.2, 2)}">{"".join(stars)}</g>'


# ---------------------------------------------------------------- nébuleuses, galaxies

def cloud(card, name, cx, cy, rx, ry, c0, c1, seed=1, freq="0.014", octaves=4, gain=1.9, cut=0.42, op=1.0, rot=0, core=0.95):
    g = card.rgrad(name + "-g", [(0, c0, core), (0.45, c1, 0.75), (1, c1, 0)])
    filt = cloud_filter(card, name + "-f", freq, seed, octaves, gain, cut)
    return f'<g opacity="{f(op)}" transform="rotate({f(rot)} {f(cx)} {f(cy)})"><ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{g}" filter="{filt}"/></g>'


def nebula_cloud(card, name, cx, cy, rx, ry, cols=("#FF7AD9", "#7A5CFF", "#38E1FF"), seed=1, op=1.0, rot=0, stars=40):
    """Une nébuleuse : un voile doux, trois nappes de bruit colorées, des étoiles prises dedans."""
    a, b, c = cols
    out = [f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx * 0.9)}" ry="{f(ry * 0.9)}" fill="{card.rgrad(name + "-v", [(0, b, 0.42), (1, b, 0)])}" transform="rotate({f(rot)} {f(cx)} {f(cy)})"/>']
    out.append(cloud(card, name + "-1", cx, cy, rx, ry, a, b, seed, "0.012", 4, 2.1, 0.45, 0.95, rot))
    out.append(cloud(card, name + "-2", cx + rx * 0.18, cy - ry * 0.1, rx * 0.75, ry * 0.7, "#FFFFFF", c, seed + 7, "0.02", 4, 2.2, 0.55, 0.85, rot + 20))
    out.append(cloud(card, name + "-3", cx - rx * 0.2, cy + ry * 0.15, rx * 0.6, ry * 0.55, c, a, seed + 13, "0.03", 3, 2.0, 0.6, 0.6, rot - 15))
    rnd = random.Random(seed)
    st = []
    for _ in range(stars):
        ang, d = rnd.uniform(0, 6.283), rnd.random() ** 0.6
        x, y = cx + math.cos(ang) * rx * d * 0.8, cy + math.sin(ang) * ry * d * 0.8
        st.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(0.4, 1.4))}" fill="#FFFFFF" opacity="{f(rnd.uniform(0.5, 1))}"/>')
    out.append("".join(st))
    return f'<g opacity="{f(op)}">{"".join(out)}</g>'


def spiral_galaxy(card, name, cx, cy, r, tilt=0.42, rot=-18, arm="#CFE0FF", core="#FFF1CF", haloc="#7FA8FF", seed=3, n=520, arms=2, dust=True, op=1.0):
    rnd = random.Random(seed)
    out = [f'<ellipse cx="0" cy="0" rx="{f(r * 1.25)}" ry="{f(r * 1.25 * tilt)}" fill="{card.rgrad(name + "-h", [(0, haloc, 0.55), (0.4, haloc, 0.22), (1, haloc, 0)])}"/>']
    arm_paths = []
    for k in range(arms):
        pts = []
        for i in range(60):
            t = i / 59
            a = k * 2 * math.pi / arms + t * 3.6
            rr = r * (0.12 + 0.9 * t)
            pts.append((rr * math.cos(a), rr * math.sin(a) * tilt))
        arm_paths.append(poly(pts, closed=False))
    out.append(f'<g filter="{blur(card, name + "-ab", r * 0.06)}">' + "".join(f'<path d="{p}" fill="none" stroke="{arm}" stroke-width="{f(r * 0.16)}" stroke-linecap="round" opacity="0.35"/>' for p in arm_paths) + "</g>")
    if dust:
        out.append(f'<g filter="{blur(card, name + "-db", r * 0.02)}">' + "".join(f'<path d="{p}" fill="none" stroke="#1A0F2E" stroke-width="{f(r * 0.035)}" stroke-linecap="round" opacity="0.5" transform="rotate(14)"/>' for p in arm_paths) + "</g>")
    dots = []
    for i in range(n):
        k = i % arms
        t = rnd.random() ** 0.8
        a = k * 2 * math.pi / arms + t * 3.6 + rnd.gauss(0, 0.2)
        rr = r * (0.1 + 0.92 * t) + rnd.gauss(0, r * 0.04)
        x, y = rr * math.cos(a), rr * math.sin(a) * tilt
        col = "#FFFFFF" if rnd.random() < 0.3 else (arm if rnd.random() < 0.8 else "#FFB8E6")
        dots.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(0.35, 1.4) * (1.25 - t * 0.6))}" fill="{col}" opacity="{f(0.35 + 0.6 * (1 - t))}"/>')
    out.append("".join(dots))
    out.append(f'<ellipse cx="0" cy="0" rx="{f(r * 0.32)}" ry="{f(r * 0.32 * tilt * 1.3)}" fill="{card.rgrad(name + "-c", [(0, "#FFFFFF", 1), (0.3, core, 0.9), (1, core, 0)])}"/>')
    return f'<g transform="translate({f(cx)} {f(cy)}) rotate({f(rot)})" opacity="{f(op)}">{"".join(out)}</g>'


def elliptical(card, name, cx, cy, r, tilt=0.7, rot=0, col="#FFE2B8", op=1.0):
    g = card.rgrad(name, [(0, "#FFFFFF", 0.95), (0.18, col, 0.75), (0.6, col, 0.2), (1, col, 0)])
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r)}" ry="{f(r * tilt)}" fill="{g}" opacity="{f(op)}" transform="rotate({f(rot)} {f(cx)} {f(cy)})"/>'


def galaxy_cluster(card, name, seed, cx, cy, r, n=14, cols=("#FFE2B8", "#CFE0FF", "#FFD0F0")):
    rnd = random.Random(seed)
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{card.rgrad(name + "-icm", [(0, "#9C7BFF", 0.28), (1, "#9C7BFF", 0)])}"/>']
    for i in range(n):
        a, d = rnd.uniform(0, 6.283), r * rnd.random() ** 0.7
        x, y = cx + math.cos(a) * d, cy + math.sin(a) * d
        s = rnd.uniform(2, 7) * (1.4 if i == 0 else 1)
        out.append(elliptical(card, f"{name}-e{i % 3}", x if i else cx, y if i else cy, s, rnd.uniform(0.35, 0.9), rnd.uniform(0, 180), cols[i % 3]))
    return "".join(out)


def black_hole(card, name, cx, cy, r, tilt=0.26, rot=-10, hot="#FFF6DE", warm="#FFB04A", deep="#FF4D1A", disk=3.1, lensing=True):
    """Trou noir et disque d'accrétion : moitié arrière, anneau lentillé, horizon, moitié avant."""
    R = r * disk
    gid = name + "-dg"
    dg = card.grad(gid, [(0, deep), (0.25, warm), (0.5, hot), (0.75, warm), (1, deep)], 0, 0, 1, 0)
    card.def_once(name + "-front", f'<clipPath id="{card.id(name + "-front")}"><rect x="{f(-R * 1.4)}" y="0" width="{f(R * 2.8)}" height="{f(R * 2)}"/></clipPath>')
    card.def_once(name + "-back", f'<clipPath id="{card.id(name + "-back")}"><rect x="{f(-R * 1.4)}" y="{f(-R * 2)}" width="{f(R * 2.8)}" height="{f(R * 2)}"/></clipPath>')

    def ring(sw_scale=1.0, op=1.0):
        rings = []
        for k, (rr, sw, o) in enumerate(((1.0, 0.34, 0.95), (0.78, 0.22, 1.0), (1.22, 0.2, 0.55), (1.42, 0.08, 0.35))):
            rings.append(f'<ellipse cx="0" cy="0" rx="{f(R * rr * 0.8)}" ry="{f(R * rr * 0.8 * tilt)}" fill="none" stroke="{dg}" stroke-width="{f(r * sw * sw_scale)}" opacity="{f(o * op)}"/>')
        return "".join(rings)

    gl = glow(card, name + "-gl", r * 0.22, 2)
    out = [f'<circle cx="0" cy="0" r="{f(R * 1.25)}" fill="{card.rgrad(name + "-amb", [(0, warm, 0.35), (0.5, deep, 0.12), (1, deep, 0)])}"/>']
    out.append(f'<g clip-path="url(#{card.id(name + "-back")})" filter="{gl}">{ring(1, 0.85)}</g>')
    if lensing:
        lg = card.rgrad(name + "-lens", [(0, hot, 0), (0.62, hot, 0), (0.7, hot, 0.95), (0.8, warm, 0.6), (1, deep, 0)])
        out.append(f'<circle cx="0" cy="0" r="{f(r * 1.75)}" fill="{lg}" filter="{blur(card, name + "-lb", r * 0.05)}"/>')
    out.append(f'<circle cx="0" cy="0" r="{f(r * 1.08)}" fill="#000000"/>')
    out.append(f'<circle cx="0" cy="0" r="{f(r * 1.12)}" fill="none" stroke="{hot}" stroke-width="{f(r * 0.05)}" opacity="0.95" filter="{blur(card, name + "-pr", r * 0.03)}"/>')
    out.append(f'<g clip-path="url(#{card.id(name + "-front")})" filter="{gl}">{ring(1.1, 1)}</g>')
    out.append(f'<ellipse cx="0" cy="0" rx="{f(R * 0.8 * 0.78)}" ry="{f(R * 0.8 * 0.78 * tilt)}" fill="none" stroke="#FFFFFF" stroke-width="{f(r * 0.04)}" opacity="0.8" clip-path="url(#{card.id(name + "-front")})"/>')
    return f'<g transform="translate({f(cx)} {f(cy)}) rotate({f(rot)})">{"".join(out)}</g>'


def quasar(card, name, cx, cy, r, angle=-35, jet=150, col="#9FE8FF", core="#FFFFFF"):
    jg = card.def_once(
        name + "-jg",
        f'<linearGradient id="{card.id(name + "-jg")}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="{f(-jet)}">'
        f'<stop offset="0" stop-color="{core}" stop-opacity="1"/><stop offset="0.3" stop-color="{col}" stop-opacity="0.8"/>'
        f'<stop offset="1" stop-color="{col}" stop-opacity="0"/></linearGradient>',
    )
    jets = "".join(
        f'<path d="M{f(-r * 0.22)} 0 L0 {f(-jet)} L{f(r * 0.22)} 0 Z" fill="{jg}" transform="rotate({a})"/>'
        f'<path d="M{f(-r * 0.6)} {f(-jet * 0.25)} Q0 {f(-jet * 0.9)} {f(r * 0.6)} {f(-jet * 0.25)}" fill="none" stroke="{col}" stroke-width="0.8" opacity="0.4" transform="rotate({a})"/>'
        for a in (0, 180)
    )
    out = [f'<circle cx="0" cy="0" r="{f(r * 3)}" fill="{card.rgrad(name + "-h", [(0, col, 0.55), (0.3, col, 0.18), (1, col, 0)])}"/>']
    out.append(f'<g filter="{glow(card, name + "-gl", 3, 2)}">{jets}</g>')
    out.append(f'<ellipse cx="0" cy="0" rx="{f(r * 1.4)}" ry="{f(r * 0.32)}" fill="{card.rgrad(name + "-d", [(0, "#FFFFFF", 1), (0.5, "#FFC36E", 0.8), (1, "#FF6A3D", 0)])}" transform="rotate(90)"/>')
    out.append(f'<circle cx="0" cy="0" r="{f(r * 0.5)}" fill="{core}"/>')
    out.append(sparkle(0, 0, r * 2.2, "#FFFFFF", 0.9))
    return f'<g transform="translate({f(cx)} {f(cy)}) rotate({f(angle)})">{"".join(out)}</g>'


def cosmic_web(card, name, seed, region, n=22, col="#B69CFF", node="#FFE9F7", k=3, w=1.0, op=0.7, node_scale=1.0):
    """La toile cosmique : filaments entre amas, nœuds lumineux."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    pts = [(rnd.uniform(x0, x1), rnd.uniform(y0, y1)) for _ in range(n)]
    edges = set()
    for i, p in enumerate(pts):
        near = sorted(range(n), key=lambda j: (pts[j][0] - p[0]) ** 2 + (pts[j][1] - p[1]) ** 2)[1:k + 1]
        for j in near:
            edges.add((min(i, j), max(i, j)))
    fil = []
    for a, b in edges:
        (ax, ay), (bx, by) = pts[a], pts[b]
        mx, my = (ax + bx) / 2 + rnd.uniform(-12, 12), (ay + by) / 2 + rnd.uniform(-12, 12)
        fil.append(f'<path d="M{f(ax)} {f(ay)} Q{f(mx)} {f(my)} {f(bx)} {f(by)}" fill="none"/>')
    fils = "".join(fil)
    out = [f'<g stroke="{col}" stroke-width="{f(w * 5)}" opacity="{f(op * 0.45)}" filter="{blur(card, name + "-fb", 3.5)}">{fils}</g>',
           f'<g stroke="{col}" stroke-width="{f(w)}" opacity="{f(op)}">{fils}</g>']
    nodes = []
    for i, (x, y) in enumerate(pts):
        deg = sum(1 for e in edges if i in e)
        r = (1.2 + deg * 0.7) * node_scale
        nodes.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 2.6)}" fill="{col}" opacity="0.3"/><circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{node}"/>')
    out.append(f'<g filter="{glow(card, name + "-ng", 2.5, 2)}">{"".join(nodes)}</g>')
    rnd2 = random.Random(seed + 1)
    dust = []
    for a, b in list(edges):
        (ax, ay), (bx, by) = pts[a], pts[b]
        for _ in range(5):
            t = rnd2.random()
            dust.append(f'<circle cx="{f(lerp(ax, bx, t) + rnd2.gauss(0, 3))}" cy="{f(lerp(ay, by, t) + rnd2.gauss(0, 3))}" r="{f(rnd2.uniform(0.3, 0.9))}" fill="{node}" opacity="0.8"/>')
    out.append("".join(dust))
    return "".join(out), pts


def supernova(card, name, cx, cy, r, col="#FF9BD2", hot="#FFF4D6", ring="#7FE7FF", seed=4):
    rnd = random.Random(seed)
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.6)}" fill="{card.rgrad(name + "-h", [(0, hot, 0.9), (0.18, col, 0.55), (0.55, col, 0.12), (1, col, 0)])}"/>']
    shell = []
    for i in range(70):
        a = 360 * i / 70 + rnd.uniform(-2, 2)
        r0 = r * rnd.uniform(0.75, 0.95)
        r1 = r * rnd.uniform(1.0, 1.25)
        x0_, y0_ = pt(cx, cy, r0, a)
        x1_, y1_ = pt(cx, cy, r1, a)
        shell.append(f'<line x1="{f(x0_)}" y1="{f(y0_)}" x2="{f(x1_)}" y2="{f(y1_)}" stroke="{ring if i % 3 else col}" stroke-width="{f(rnd.uniform(0.6, 1.8))}" stroke-linecap="round" opacity="{f(rnd.uniform(0.4, 0.9))}"/>')
    out.append(f'<g filter="{glow(card, name + "-g", 2, 2)}">{"".join(shell)}</g>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="{ring}" stroke-width="1.2" opacity="0.6" filter="{blur(card, name + "-rb", 1.5)}"/>')
    out.append(sparkle(cx, cy, r * 0.75, "#FFFFFF", 1) + f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.12)}" fill="#FFFFFF"/>')
    return "".join(out)


# ---------------------------------------------------------------- atomes, noyau

def nucleus(card, name, cx, cy, r, seed=1, n=13, p="#FF6B7A", nn="#7FC8FF"):
    rnd = random.Random(seed)
    gp = card.rgrad(name + "-p", [(0, "#FFFFFF", 1), (0.35, p, 1), (1, "#8A1F2E", 1)], 0.4, 0.38, 0.65)
    gn = card.rgrad(name + "-n", [(0, "#FFFFFF", 1), (0.35, nn, 1), (1, "#1F4A8A", 1)], 0.4, 0.38, 0.65)
    balls = []
    for i in range(n):
        a, d = rnd.uniform(0, 6.283), r * 0.62 * rnd.random() ** 0.5
        balls.append((d, cx + math.cos(a) * d, cy + math.sin(a) * d, gp if i % 2 else gn))
    balls.sort(key=lambda b: -b[0])
    rb = r * 0.42
    return "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rb)}" fill="{g}"/>' for _, x, y, g in balls)


def atom(card, name, cx, cy, r, col="#9FF4FF", orbits=3, electron="#FFFFFF", seed=2, nuc=True, w=1.1, rot=0):
    rnd = random.Random(seed)
    orb = []
    els = []
    for k in range(orbits):
        a = rot + 180 * k / orbits
        orb.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r)}" ry="{f(r * 0.32)}" fill="none" stroke="{col}" stroke-width="{f(w)}" opacity="0.85" transform="rotate({f(a)} {f(cx)} {f(cy)})"/>')
        t = rnd.uniform(0, 6.283)
        ex, ey = r * math.cos(t), r * 0.32 * math.sin(t)
        ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
        els.append(f'<circle cx="{f(cx + ex * ca - ey * sa)}" cy="{f(cy + ex * sa + ey * ca)}" r="{f(max(1.4, r * 0.06))}" fill="{electron}"/>')
    core = nucleus(card, name + "-nu", cx, cy, r * 0.2, seed) if nuc else f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.1)}" fill="{electron}"/>'
    return f'<g filter="{glow(card, name + "-g", 1.8, 1)}">{"".join(orb)}{"".join(els)}</g>{core}'


def orbital_cloud(card, name, cx, cy, r, col="#7FE3FF", rot=0):
    """Orbitale p : deux lobes de probabilité."""
    g = card.rgrad(name, [(0, "#FFFFFF", 0.7), (0.4, col, 0.45), (1, col, 0)])
    return "".join(f'<ellipse cx="{f(cx)}" cy="{f(cy - r * 0.55)}" rx="{f(r * 0.32)}" ry="{f(r * 0.55)}" fill="{g}" transform="rotate({f(rot + a)} {f(cx)} {f(cy)})"/>' for a in (0, 180))


# ---------------------------------------------------------------- vivant

def dna(card, name, x, y0, y1, amp=16, turns=4, c1="#7FF6FF", c2="#FF8AD8", rung=("#FFD36E", "#7FFFC2", "#FF8A6B", "#9FB8FF"), w=2.6, phase=0.0, rungs_per_turn=10):
    """Double hélice verticale en x, de y0 à y1."""
    n = 220
    def strand(ph):
        return [(x + amp * math.sin(2 * math.pi * turns * i / n + ph), lerp(y0, y1, i / n), math.cos(2 * math.pi * turns * i / n + ph)) for i in range(n + 1)]
    s1, s2 = strand(phase), strand(phase + math.pi)
    back, front = [], []
    for s, col in ((s1, c1), (s2, c2)):
        seg = []
        cur_front = s[0][2] > 0
        for (px, py, z) in s:
            if (z > 0) != cur_front and len(seg) > 1:
                (front if cur_front else back).append((col, seg))
                seg = [seg[-1]]
                cur_front = z > 0
            seg.append((px, py))
        (front if cur_front else back).append((col, seg))
    rungs = []
    m = int(turns * rungs_per_turn)
    for k in range(m):
        i = int((k + 0.5) / m * n)
        (ax, ay, _), (bx, by, _) = s1[i], s2[i]
        mx = (ax + bx) / 2
        col_a, col_b = rung[k % len(rung)], rung[(k + 2) % len(rung)]
        rungs.append(f'<line x1="{f(ax)}" y1="{f(ay)}" x2="{f(mx)}" y2="{f(by)}" stroke="{col_a}" stroke-width="{f(w * 0.7)}" opacity="0.8"/>'
                     f'<line x1="{f(mx)}" y1="{f(ay)}" x2="{f(bx)}" y2="{f(by)}" stroke="{col_b}" stroke-width="{f(w * 0.7)}" opacity="0.8"/>')
    bk = "".join(f'<path d="{poly(seg, False)}" fill="none" stroke="{col}" stroke-width="{f(w)}" stroke-linecap="round" opacity="0.45"/>' for col, seg in back)
    fr = "".join(f'<path d="{poly(seg, False)}" fill="none" stroke="{col}" stroke-width="{f(w * 1.25)}" stroke-linecap="round"/>' for col, seg in front)
    return f'<g filter="{glow(card, name + "-g", 2.2, 1)}">{bk}{"".join(rungs)}{fr}</g>'


def h2o(card, name, cx, cy, s=1.0, rot=0, o="#FF6B6B", hcol="#F4F8FF"):
    go = card.rgrad(name + "-o", [(0, "#FFFFFF", 1), (0.35, o, 1), (1, "#7A1020", 1)], 0.38, 0.35, 0.7)
    gh = card.rgrad(name + "-h", [(0, "#FFFFFF", 1), (0.5, hcol, 1), (1, "#8A9AB8", 1)], 0.38, 0.35, 0.7)
    out = []
    for a in (-52, 52):
        hx, hy = pt(0, 0, 15, 180 + a)
        out.append(f'<line x1="0" y1="0" x2="{f(hx)}" y2="{f(hy)}" stroke="#DDEBFF" stroke-width="2.4" opacity="0.8"/>')
        out.append(f'<circle cx="{f(hx)}" cy="{f(hy)}" r="5" fill="{gh}"/>')
    out.append(f'<circle cx="0" cy="0" r="8" fill="{go}"/>')
    return f'<g transform="translate({f(cx)} {f(cy)}) rotate({f(rot)}) scale({f(s)})">{"".join(out)}</g>'


def hexring(cx, cy, r, col="#9FF4FF", w=1.2, op=0.8, rot=0, dots=True):
    pts = [pt(cx, cy, r, rot + 60 * i) for i in range(6)]
    inner = [pt(cx, cy, r * 0.68, rot + 60 * i) for i in range(0, 6, 2)]
    d = poly(pts)
    out = f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{w}" opacity="{op}"/>'
    out += "".join(f'<line x1="{f(inner[i][0])}" y1="{f(inner[i][1])}" x2="{f(pts[(2 * i + 1) % 6][0] * 0.68 + cx * 0.32)}" y2="{f(pts[(2 * i + 1) % 6][1] * 0.68 + cy * 0.32)}" stroke="{col}" stroke-width="{w}" opacity="{op * 0.7}"/>' for i in range(3))
    if dots:
        out += "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(w * 1.8)}" fill="{col}" opacity="{op}"/>' for x, y in pts)
    return out


def cell(card, name, cx, cy, r, seed=3, mem="#7FF6E8", plasm="#1E6A7A", nuc="#B57CFF", op=1.0):
    rnd = random.Random(seed)
    pts = [pt(cx, cy, r * (1 + 0.06 * math.sin(i * 1.7 + seed) + rnd.uniform(-0.03, 0.03)), i * 30) for i in range(12)]
    d = smooth(pts, closed=True, n=6)
    g = card.rgrad(name + "-pl", [(0, plasm, 0.2), (0.75, plasm, 0.45), (0.95, mem, 0.55), (1, mem, 0.9)])
    gn = card.rgrad(name + "-nu", [(0, "#FFFFFF", 0.6), (0.4, nuc, 0.75), (1, nuc, 0.95)], 0.45, 0.4, 0.6)
    nx, ny = cx + r * 0.12, cy - r * 0.08
    out = [f'<path d="{d}" fill="{g}"/>', f'<path d="{d}" fill="none" stroke="{mem}" stroke-width="{f(r * 0.05)}" opacity="0.9"/>',
           f'<path d="{d}" fill="none" stroke="#FFFFFF" stroke-width="{f(r * 0.012)}" opacity="0.7" transform="translate({f(cx * 0.06)} {f(cy * 0.06)}) scale(0.94)"/>']
    for k in range(3):
        rr = r * (0.48 + 0.08 * k)
        out.append(f'<path d="M{f(nx - rr)} {f(ny)} A{f(rr)} {f(rr * 0.9)} 0 0 1 {f(nx + rr * 0.6)} {f(ny - rr * 0.75)}" fill="none" stroke="#9FD8FF" stroke-width="{f(r * 0.018)}" opacity="0.55"/>')
    out.append(f'<circle cx="{f(nx)}" cy="{f(ny)}" r="{f(r * 0.32)}" fill="{gn}"/><circle cx="{f(nx + r * 0.08)}" cy="{f(ny - r * 0.04)}" r="{f(r * 0.1)}" fill="#E8D4FF" opacity="0.9"/>')
    for k in range(4):
        a = rnd.uniform(0, 360)
        mx, my = pt(cx, cy, r * rnd.uniform(0.55, 0.75), a)
        out.append(f'<g transform="rotate({f(a)} {f(mx)} {f(my)})"><ellipse cx="{f(mx)}" cy="{f(my)}" rx="{f(r * 0.06)}" ry="{f(r * 0.14)}" fill="#FF9E7A" opacity="0.85"/>'
                   f'<path d="M{f(mx - r * 0.04)} {f(my - r * 0.08)} q{f(r * 0.06)} {f(r * 0.03)} 0 {f(r * 0.05)} q{f(-r * 0.06)} {f(r * 0.03)} 0 {f(r * 0.05)} q{f(r * 0.06)} {f(r * 0.03)} 0 {f(r * 0.05)}" fill="none" stroke="#7A2A1A" stroke-width="{f(r * 0.012)}"/></g>')
    for k in range(9):
        a = rnd.uniform(0, 360)
        vx, vy = pt(cx, cy, r * rnd.uniform(0.2, 0.85), a)
        out.append(f'<circle cx="{f(vx)}" cy="{f(vy)}" r="{f(r * rnd.uniform(0.02, 0.05))}" fill="#DFFFF8" opacity="0.8"/>')
    return f'<g opacity="{f(op)}">{"".join(out)}</g>'


def neuron(card, name, seed, cx, cy, s=1.0, col="#7FF6FF", spark="#FFFFFF", axon=None, branches=6, depth=3, length=34):
    """Neurone : soma, dendrites ramifiées, axone (optionnel : liste de points) gainé de myéline."""
    rnd = random.Random(seed)
    segs, tips = [], []

    def grow(x0, y0, a, L, w, d):
        x1, y1 = pt(x0, y0, L, a + rnd.uniform(-14, 14))
        mx, my = pt(x0, y0, L * 0.55, a + rnd.uniform(-20, 20))
        segs.append(f'<path d="M{f(x0)} {f(y0)} Q{f(mx)} {f(my)} {f(x1)} {f(y1)}" fill="none" stroke-width="{f(w)}" stroke-linecap="round"/>')
        if d == 0:
            tips.append((x1, y1))
            return
        for da in (-26, 24):
            grow(x1, y1, a + da + rnd.uniform(-8, 8), L * 0.68, w * 0.65, d - 1)

    for k in range(branches):
        a = 360 * k / branches + rnd.uniform(-15, 15)
        x0, y0 = pt(cx, cy, 5 * s, a)
        grow(x0, y0, a, length * s * rnd.uniform(0.8, 1.15), 3.2 * s, depth)
    out = [f'<g stroke="{col}" opacity="0.9">{"".join(segs)}</g>']
    if axon:
        sm = catmull(axon, 8)
        out.append(f'<path d="{poly(sm, False)}" fill="none" stroke="{col}" stroke-width="{f(2.2 * s)}" stroke-linecap="round" opacity="0.9"/>')
        beads = resample(sm, max(3, int(len(sm) / 6)))
        for i, (bx, by) in enumerate(beads[1:-1]):
            j = sm.index(min(sm, key=lambda q: (q[0] - bx) ** 2 + (q[1] - by) ** 2))
            ax_, ay_ = sm[max(0, j - 1)]
            bx2, by2 = sm[min(len(sm) - 1, j + 1)]
            ang = math.degrees(math.atan2(by2 - ay_, bx2 - ax_))
            out.append(f'<ellipse cx="{f(bx)}" cy="{f(by)}" rx="{f(6 * s)}" ry="{f(3 * s)}" fill="{col}" opacity="0.55" transform="rotate({f(ang)} {f(bx)} {f(by)})"/>')
        ex, ey = axon[-1]
        for k in range(4):
            tx, ty = pt(ex, ey, 12 * s, rnd.uniform(0, 360))
            out.append(f'<line x1="{f(ex)}" y1="{f(ey)}" x2="{f(tx)}" y2="{f(ty)}" stroke="{col}" stroke-width="{f(1 * s)}"/><circle cx="{f(tx)}" cy="{f(ty)}" r="{f(2 * s)}" fill="{spark}"/>')
    sg = card.rgrad(name + "-so", [(0, "#FFFFFF", 1), (0.4, col, 0.9), (1, col, 0.4)])
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(9 * s)}" fill="{sg}"/>')
    out.append("".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(1.6 * s)}" fill="{spark}"/>' for x, y in tips))
    return f'<g filter="{glow(card, name + "-g", 2.4 * s, 2)}">{"".join(out)}</g>'


# ---------------------------------------------------------------- quantique

def wave_packet(x0, x1, y, amp, k=0.35, sigma=None, col="#7FF6FF", w=1.4, op=0.9, env=True, vertical=False):
    xc = (x0 + x1) / 2
    sigma = sigma or (x1 - x0) / 5
    pts = []
    envp, envn = [], []
    n = int((x1 - x0) / 2)
    for i in range(n + 1):
        x = lerp(x0, x1, i / n)
        e = amp * math.exp(-((x - xc) / sigma) ** 2)
        yy = y + e * math.sin(k * (x - xc))
        pts.append((yy, x) if vertical else (x, yy))
        envp.append((y - e, x) if vertical else (x, y - e))
        envn.append((y + e, x) if vertical else (x, y + e))
    out = f'<path d="{poly(pts, False)}" fill="none" stroke="{col}" stroke-width="{w}" opacity="{op}"/>'
    if env:
        out += f'<path d="{poly(envp, False)}" fill="none" stroke="{col}" stroke-width="0.6" stroke-dasharray="2 3" opacity="{op * 0.6}"/>'
        out += f'<path d="{poly(envn, False)}" fill="none" stroke="{col}" stroke-width="0.6" stroke-dasharray="2 3" opacity="{op * 0.6}"/>'
    return out


def quantum_foam(card, name, seed, region, n=90, col="#B9A7FF", hi="#FFFFFF", avoid=WIN):
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    g = card.rgrad(name + "-b", [(0, hi, 0.0), (0.7, col, 0.12), (0.95, col, 0.6), (1, hi, 0.9)])
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if _inside(x, y, avoid):
            continue
        r = rnd.uniform(1.5, 9) * rnd.random() ** 0.5
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{g}" opacity="{f(rnd.uniform(0.5, 1))}"/>')
    return f'<g filter="{glow(card, name + "-g", 1.5, 1)}">{"".join(out)}</g>'


def string_loop(cx, cy, R, n=5, amp=0.18, phase=0.0, col="#FFD36E", w=1.3, op=0.95, tilt=1.0, rot=0):
    pts = []
    for i in range(121):
        a = 2 * math.pi * i / 120
        rr = R * (1 + amp * math.sin(n * a + phase))
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a) * tilt))
    return f'<path d="{poly(pts)}" fill="none" stroke="{col}" stroke-width="{w}" opacity="{op}" transform="rotate({f(rot)} {f(cx)} {f(cy)})"/>'


def open_string(x0, y0, x1, y1, n=3, amp=6, col="#FFD36E", w=1.2, op=0.9):
    L = math.hypot(x1 - x0, y1 - y0)
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    pts = []
    for i in range(61):
        t = i / 60
        o = amp * math.sin(math.pi * n * t)
        pts.append((x0 + ux * L * t - uy * o, y0 + uy * L * t + ux * o))
    return f'<path d="{poly(pts, False)}" fill="none" stroke="{col}" stroke-width="{w}" opacity="{op}" stroke-linecap="round"/>' + \
        f'<circle cx="{f(x0)}" cy="{f(y0)}" r="{f(w * 1.6)}" fill="{col}"/><circle cx="{f(x1)}" cy="{f(y1)}" r="{f(w * 1.6)}" fill="{col}"/>'


def particle_tracks(card, name, seed, cx, cy, n=9, scale=1.0, cols=("#9FF4FF", "#FFD36E", "#FF8AD8", "#FFFFFF"), dotted=True, spread=360, a0=0):
    """Traces dans une chambre à bulles : spirales (électrons) et arcs (particules rapides), en pointillés de bulles."""
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        a = math.radians(a0 + spread * i / n + rnd.uniform(-10, 10))
        curv = rnd.choice((-1, 1)) * rnd.uniform(0.004, 0.02) / scale
        spiral = rnd.random() < 0.45
        x, y = cx, cy
        pts = [(x, y)]
        L = rnd.uniform(60, 130) * scale
        step = 2.0
        dist = 0
        k = curv
        while dist < L * (2.2 if spiral else 1):
            a += k * step
            if spiral:
                k *= 1.012
            x += math.cos(a) * step
            y += math.sin(a) * step
            pts.append((x, y))
            dist += step
        col = cols[i % len(cols)]
        dash = ' stroke-dasharray="0.1 3.2" stroke-linecap="round"' if dotted else ""
        out.append(f'<path d="{poly(pts, False)}" fill="none" stroke="{col}" stroke-width="{f(1.8 if dotted else 1)}" opacity="0.9"{dash}/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="3" fill="#FFFFFF"/>')
    return f'<g filter="{glow(card, name + "-g", 1.4, 1)}">{"".join(out)}</g>'


# ---------------------------------------------------------------- l'infime marin et la géométrie sacrée

def diatom(card, name, cx, cy, r, col="#BFFBFF", ribs=24, op=1.0, rot=0):
    """Diatomée centrique : un vitrail de silice, côtes rayonnantes, couronnes de pores."""
    g = card.rgrad(name + "-g", [(0, "#FFFFFF", 0.25), (0.6, col, 0.1), (0.9, col, 0.3), (1, col, 0.65)])
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/>']
    for k in (1.0, 0.82, 0.5, 0.2):
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * k)}" fill="none" stroke="{col}" stroke-width="{f(r * (0.035 if k == 1 else 0.018))}" opacity="0.9"/>')
    for i in range(ribs):
        a = rot + 360 * i / ribs
        x0_, y0_ = pt(cx, cy, r * 0.2, a)
        x1_, y1_ = pt(cx, cy, r * 0.82, a)
        out.append(f'<line x1="{f(x0_)}" y1="{f(y0_)}" x2="{f(x1_)}" y2="{f(y1_)}" stroke="{col}" stroke-width="{f(r * 0.016)}" opacity="0.75"/>')
        for kk, rr in enumerate((0.3, 0.4, 0.5, 0.6, 0.7)):
            if (i + kk) % 2:
                continue
            px, py = pt(cx, cy, r * rr, a + 180 / ribs)
            out.append(f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(r * 0.022)}" fill="{col}" opacity="0.85"/>')
        px, py = pt(cx, cy, r * 0.91, a)
        out.append(f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(r * 0.035)}" fill="none" stroke="{col}" stroke-width="{f(r * 0.012)}"/>')
    for i in range(6):
        a = rot + 60 * i
        px, py = pt(cx, cy, r * 0.1, a)
        out.append(f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(r * 0.045)}" fill="{col}"/>')
    return f'<g opacity="{f(op)}" filter="{glow(card, name + "-gl", max(1, r * 0.04), 1)}">{"".join(out)}</g>'


def pennate(card, name, cx, cy, L, col="#BFFBFF", rot=0, op=1.0):
    """Diatomée pennée : une navette de verre striée."""
    rx, ry = L / 2, L * 0.13
    g = card.rgrad(name + "-g", [(0, "#FFFFFF", 0.3), (0.8, col, 0.15), (1, col, 0.5)])
    out = [f'<ellipse cx="0" cy="0" rx="{f(rx)}" ry="{f(ry)}" fill="{g}" stroke="{col}" stroke-width="{f(L * 0.012)}"/>',
           f'<line x1="{f(-rx * 0.85)}" y1="0" x2="{f(rx * 0.85)}" y2="0" stroke="{col}" stroke-width="{f(L * 0.008)}"/>',
           f'<circle cx="0" cy="0" r="{f(ry * 0.25)}" fill="{col}"/>']
    for i in range(1, 22):
        x = -rx + 2 * rx * i / 22
        h = ry * math.sqrt(max(0, 1 - (x / rx) ** 2)) * 0.85
        out.append(f'<line x1="{f(x)}" y1="{f(-h)}" x2="{f(x)}" y2="{f(-ry * 0.15)}" stroke="{col}" stroke-width="{f(L * 0.006)}" opacity="0.8"/>'
                   f'<line x1="{f(x)}" y1="{f(ry * 0.15)}" x2="{f(x)}" y2="{f(h)}" stroke="{col}" stroke-width="{f(L * 0.006)}" opacity="0.8"/>')
    return f'<g transform="translate({f(cx)} {f(cy)}) rotate({f(rot)})" opacity="{f(op)}" filter="{glow(card, name + "-gl", 1.2, 1)}">{"".join(out)}</g>'


def radiolarian(card, name, cx, cy, r, col="#E6FCFF", spines=14, seed=2, op=1.0):
    """Radiolaire : une sphère de dentelle de silice hérissée d'épines."""
    rnd = random.Random(seed)
    clipid = card.id(name + "-c")
    card.def_once(name + "-c", f'<clipPath id="{clipid}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}"/></clipPath>')
    hexes = []
    hr = r * 0.17
    for row in range(-7, 8):
        for colm in range(-7, 8):
            hx = cx + colm * hr * 1.75 + (row % 2) * hr * 0.875
            hy = cy + row * hr * 1.5
            dd = math.hypot(hx - cx, hy - cy) / r
            if dd > 1.1:
                continue
            s = hr * (0.78 - 0.3 * dd)
            hexes.append(f'<path d="{poly([pt(hx, hy, s, 60 * i + 30) for i in range(6)])}" fill="none" stroke="{col}" stroke-width="{f(r * 0.02)}" opacity="{f(0.95 - 0.4 * dd)}"/>')
    g = card.rgrad(name + "-g", [(0, "#FFFFFF", 0.1), (0.8, col, 0.12), (1, col, 0.45)])
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/>', f'<g clip-path="url(#{clipid})">{"".join(hexes)}</g>',
           f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="{col}" stroke-width="{f(r * 0.04)}"/>']
    for i in range(spines):
        a = 360 * i / spines + rnd.uniform(-6, 6)
        L = r * rnd.uniform(1.45, 1.9)
        x0_, y0_ = pt(cx, cy, r, a)
        x1_, y1_ = pt(cx, cy, L, a)
        out.append(f'<line x1="{f(x0_)}" y1="{f(y0_)}" x2="{f(x1_)}" y2="{f(y1_)}" stroke="{col}" stroke-width="{f(r * 0.035)}" stroke-linecap="round"/>')
        for t in (0.45, 0.7):
            bx, by = pt(cx, cy, lerp(r, L, t), a)
            for da in (-35, 35):
                ex, ey = pt(bx, by, r * 0.13, a + da)
                out.append(f'<line x1="{f(bx)}" y1="{f(by)}" x2="{f(ex)}" y2="{f(ey)}" stroke="{col}" stroke-width="{f(r * 0.018)}" stroke-linecap="round"/>')
    return f'<g opacity="{f(op)}" filter="{glow(card, name + "-gl", max(1, r * 0.05), 1)}">{"".join(out)}</g>'


def snow_crystal(cx, cy, r, col="#E8FBFF", w=1.4, rot=0, op=1.0):
    """Cristal de glace dendritique à six branches."""
    out = []
    for i in range(6):
        a = rot + 60 * i
        x1_, y1_ = pt(cx, cy, r, a)
        out.append(f'<line x1="{f(cx)}" y1="{f(cy)}" x2="{f(x1_)}" y2="{f(y1_)}" stroke="{col}" stroke-width="{w}" stroke-linecap="round"/>')
        for t, L in ((0.35, 0.32), (0.58, 0.26), (0.78, 0.17)):
            bx, by = pt(cx, cy, r * t, a)
            for da in (-60, 60):
                ex, ey = pt(bx, by, r * L, a + da)
                out.append(f'<line x1="{f(bx)}" y1="{f(by)}" x2="{f(ex)}" y2="{f(ey)}" stroke="{col}" stroke-width="{f(w * 0.8)}" stroke-linecap="round"/>')
                if t == 0.35:
                    mx, my = pt(bx, by, r * L * 0.55, a + da)
                    fx, fy = pt(mx, my, r * 0.09, a)
                    out.append(f'<line x1="{f(mx)}" y1="{f(my)}" x2="{f(fx)}" y2="{f(fy)}" stroke="{col}" stroke-width="{f(w * 0.6)}" stroke-linecap="round"/>')
    out.append(f'<path d="{poly([pt(cx, cy, r * 0.16, rot + 60 * i + 30) for i in range(6)])}" fill="none" stroke="{col}" stroke-width="{f(w * 0.8)}"/>')
    return f'<g opacity="{f(op)}">{"".join(out)}</g>'


def koch(cx, cy, r, depth=3, rot=0, col="#E8FBFF", w=1.0, op=0.9, fill="none"):
    pts = [pt(cx, cy, r, rot + 120 * i) for i in range(3)]
    for _ in range(depth):
        new = []
        for i in range(len(pts)):
            (ax, ay), (bx, by) = pts[i], pts[(i + 1) % len(pts)]
            dx, dy = (bx - ax) / 3, (by - ay) / 3
            p1 = (ax + dx, ay + dy)
            p2 = (ax + 2 * dx, ay + 2 * dy)
            px = p1[0] + dx * 0.5 - dy * math.sqrt(3) / 2 * -1
            py = p1[1] + dy * 0.5 + dx * math.sqrt(3) / 2 * -1
            new += [(ax, ay), p1, (px, py), p2]
        pts = new
    return f'<path d="{poly(pts)}" fill="{fill}" stroke="{col}" stroke-width="{w}" opacity="{op}" stroke-linejoin="round"/>'


def flower_of_life(cx, cy, r, col="#E8FBFF", w=0.8, op=0.6, rings=1):
    centers = [(cx, cy)]
    for ring_ in range(1, rings + 1):
        for i in range(6):
            for j in range(ring_):
                a0 = pt(cx, cy, r * ring_, 60 * i)
                a1 = pt(cx, cy, r * ring_, 60 * (i + 1))
                t = j / ring_
                centers.append((lerp(a0[0], a1[0], t), lerp(a0[1], a1[1], t)))
    out = "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="none" stroke="{col}" stroke-width="{w}"/>' for x, y in centers)
    out += f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * (rings + 1))}" fill="none" stroke="{col}" stroke-width="{f(w * 1.4)}"/>'
    return f'<g opacity="{op}">{out}</g>'


def golden_spiral(x, y, size, col="#FFE7A8", w=1.0, op=0.8, squares=True, flip=False, turns=8):
    """Rectangles d'or et spirale de Fibonacci ; (x, y) coin haut-gauche, largeur `size` (hauteur size/φ)."""
    phi = (1 + 5 ** 0.5) / 2
    out = []
    X, Y, Wd, Hd = x, y, size, size / phi
    if squares:
        out.append(f'<rect x="{f(X)}" y="{f(Y)}" width="{f(Wd)}" height="{f(Hd)}" fill="none" stroke="{col}" stroke-width="{w}"/>')
    arcs = []
    for i in range(turns):
        k = i % 4
        if k == 0:
            s = Hd
            sq = (X, Y, s, s)
            arcs.append((X + s, Y + s, s, 180, 270))
            X += s
            Wd -= s
        elif k == 1:
            s = Wd
            sq = (X, Y, s, s)
            arcs.append((X, Y + s, s, 270, 360))
            Y += s
            Hd -= s
        elif k == 2:
            s = Hd
            sq = (X + Wd - s, Y, s, s)
            arcs.append((X + Wd - s, Y, s, 0, 90))
            Wd -= s
        else:
            s = Wd
            sq = (X, Y + Hd - s, s, s)
            arcs.append((X + s, Y + Hd - s, s, 90, 180))
            Hd -= s
        if squares:
            out.append(f'<rect x="{f(sq[0])}" y="{f(sq[1])}" width="{f(sq[2])}" height="{f(sq[3])}" fill="none" stroke="{col}" stroke-width="{f(w * 0.7)}" opacity="0.7"/>')
    d = ""
    for (ax, ay, r, a0, a1) in arcs:
        p0 = (ax + r * math.cos(math.radians(a0)), ay + r * math.sin(math.radians(a0)))
        p1 = (ax + r * math.cos(math.radians(a1)), ay + r * math.sin(math.radians(a1)))
        d += (f"M{f(p0[0])} {f(p0[1])} " if not d else "") + f"A{f(r)} {f(r)} 0 0 1 {f(p1[0])} {f(p1[1])} "
    out.append(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{f(w * 1.6)}" stroke-linecap="round"/>')
    tr = f' transform="translate({f(2 * x + size)} 0) scale(-1 1)"' if flip else ""
    return f'<g opacity="{op}"{tr}>{"".join(out)}</g>'


def foraminifera(card, name, cx, cy, r, col="#FFE2C2", n=13, rot=0, op=1.0):
    """Foraminifère : la spirale du nautile, à l'échelle du grain de sable (loges en planispirale)."""
    g = card.rgrad(name + "-g", [(0, "#FFFFFF", 0.95), (0.6, col, 0.85), (1, "#B9876A", 0.95)], 0.4, 0.38, 0.7)
    out = []
    b = math.log(2.6) / (2 * math.pi)
    span = 2 * math.pi * 1.55
    for i in range(n):
        th = span * i / (n - 1)
        rr = r * 0.55 * math.exp(b * (th - span))
        a = th + math.radians(rot)
        x, y = cx + rr * math.cos(a), cy + rr * math.sin(a)
        cr = max(0.8, rr * 0.62)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(cr)}" fill="{g}" stroke="#7A4A2A" stroke-width="{f(max(0.35, cr * 0.07))}"/>')
        out.append(f'<circle cx="{f(x - cr * 0.3)}" cy="{f(y - cr * 0.32)}" r="{f(cr * 0.2)}" fill="#FFFFFF" opacity="0.75"/>')
    return f'<g opacity="{f(op)}">{"".join(out)}</g>'


def pollen(card, name, cx, cy, r, col="#FFD36E", spikes=22, op=1.0):
    g = card.rgrad(name + "-g", [(0, "#FFFFFF", 1), (0.4, col, 1), (1, "#9A6A12", 1)], 0.4, 0.35, 0.7)
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/>']
    for i in range(spikes):
        a = 360 * i / spikes
        x0_, y0_ = pt(cx, cy, r * 0.95, a)
        x1_, y1_ = pt(cx, cy, r * 1.25, a)
        out.append(f'<line x1="{f(x0_)}" y1="{f(y0_)}" x2="{f(x1_)}" y2="{f(y1_)}" stroke="{col}" stroke-width="{f(r * 0.08)}" stroke-linecap="round"/>')
    for i in range(7):
        a = 360 * i / 7 + 20
        px, py = pt(cx, cy, r * 0.55, a)
        out.append(f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(r * 0.1)}" fill="#7A4A08" opacity="0.6"/>')
    return f'<g opacity="{f(op)}">{"".join(out)}</g>'


def moon(card, name, cx, cy, r, col="#F4F1E6", shade="#8F96AA", glowc="#CFE6FF", phase=None):
    g = card.rgrad(name + "-g", [(0, "#FFFFFF", 1), (0.6, col, 1), (1, shade, 1)], 0.42, 0.4, 0.7)
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 2.8)}" fill="{card.rgrad(name + "-h", [(0, glowc, 0.5), (0.35, glowc, 0.15), (1, glowc, 0)])}"/>',
           f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/>']
    rnd = random.Random(9)
    for _ in range(7):
        a, d = rnd.uniform(0, 6.28), r * rnd.uniform(0.1, 0.75)
        out.append(f'<circle cx="{f(cx + math.cos(a) * d)}" cy="{f(cy + math.sin(a) * d)}" r="{f(r * rnd.uniform(0.06, 0.18))}" fill="{shade}" opacity="0.28"/>')
    if phase:
        out.append(f'<circle cx="{f(cx + r * phase)}" cy="{f(cy - r * 0.1)}" r="{f(r * 1.02)}" fill="#030A16" opacity="0.92"/>')
    return "".join(out)
