"""Égypte solaire - l'infiniment grand et l'infiniment petit : nébuleuses, galaxies, trou noir, quasar, toile cosmique ;
atomes, noyaux et quarks, ADN, cellules, neurones, pollen, cristaux, géométrie sacrée, fractales, ondes, cordes."""

import math
import random

from kit import W, H, f, pt, cloud_filter, bevel, ublur, GOLD3, GOLD, GOLD_HI, GOLD_LO, LAPIS, LAPIS_L, TURQ, TURQ_L, CARN, CARN_L  # noqa: F401
from motifs import sba_star, _poly  # noqa: F401


# ---------------------------------------------------------------- l'immense

def nebula_cloud(card, name, cx, cy, rx, ry, c1, c2, op=0.9, freq="0.012", seed=5, a=2.6, b=-0.85, rot=0, octaves=4):
    """Une nébuleuse : un halo coloré découpé par un bruit fractal (filaments, piliers, voiles)."""
    g = card.rgrad(name + "-g", [(0, c1, op), (0.45, c2, op * 0.7), (1, c2, 0)])
    filt = cloud_filter(card, name + "-f", freq, octaves, seed, a, b)
    return (f'<g filter="{filt}"><ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{g}" transform="rotate({rot} {f(cx)} {f(cy)})"/></g>'
            f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx * 0.6)}" ry="{f(ry * 0.6)}" fill="{card.rgrad(name + "-h", [(0, c1, op * 0.35), (1, c1, 0)])}" transform="rotate({rot} {f(cx)} {f(cy)})"/>')


def star_field(seed, n, region, color="#FFFFFF", rmax=1.4, keep=None, tint=None):
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if keep and keep[0] < x < keep[2] and keep[1] < y < keep[3]:
            continue
        r = rnd.uniform(0.25, rmax) ** 1.3
        c = color if not tint or rnd.random() > 0.25 else rnd.choice(tint)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{c}" opacity="{f(rnd.uniform(0.35, 1))}"/>')
    return "".join(out)


def star_flare(cx, cy, r, color="#FFFFFF", op=1, thin=0.06, rot=0):
    """Une étoile brillante : quatre aigrettes de diffraction et un cœur."""
    k = r * thin
    d = (f"M{f(cx)} {f(cy - r)} L{f(cx + k)} {f(cy - k)} L{f(cx + r)} {f(cy)} L{f(cx + k)} {f(cy + k)} L{f(cx)} {f(cy + r)} "
         f"L{f(cx - k)} {f(cy + k)} L{f(cx - r)} {f(cy)} L{f(cx - k)} {f(cy - k)} Z")
    return (f'<g opacity="{op}" transform="rotate({rot} {f(cx)} {f(cy)})"><path d="{d}" fill="{color}"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.16)}" fill="#FFFFFF"/></g>')


def bright_star(card, name, cx, cy, r, color="#FFFFFF", glow=0.7):
    return (f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.4)}" fill="{card.rgrad(name, [(0, color, glow), (1, color, 0)])}"/>'
            + star_flare(cx, cy, r, color))


def _bez(p0, p1, p2, t):
    return ((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1])


def milky_way(card, name, p0, p1, p2, width, seed=21, n=1400, glow="#CFE0FF", warm="#FFE2B8", dust_color="#03040C", op=1.0, keep=None):
    """La Voie lactée le long d'une courbe : nuage d'étoiles dense au centre, lueur, et la bande sombre des poussières."""
    rnd = random.Random(seed)
    out = []
    samples = [_bez(p0, p1, p2, i / 40) for i in range(41)]
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in samples)
    out.append(f'<path d="{d}" fill="none" stroke="{glow}" stroke-width="{f(width * 1.6)}" stroke-linecap="round" opacity="{f(0.16 * op)}" filter="{ublur(card, name + "-b1", width * 0.5)}"/>')
    out.append(f'<path d="{d}" fill="none" stroke="{warm}" stroke-width="{f(width * 0.7)}" stroke-linecap="round" opacity="{f(0.22 * op)}" filter="{ublur(card, name + "-b2", width * 0.3)}"/>')
    pts = []
    for _ in range(n):
        t = rnd.random()
        x, y = _bez(p0, p1, p2, t)
        dx, dy = _bez(p0, p1, p2, min(1, t + 0.01))
        ang = math.atan2(dy - y, dx - x)
        off = rnd.gauss(0, width * 0.32)
        px, py = x - math.sin(ang) * off, y + math.cos(ang) * off
        if keep and keep[0] < px < keep[2] and keep[1] < py < keep[3]:
            continue
        r = rnd.uniform(0.25, 1.15) ** 1.4
        c = warm if rnd.random() < 0.3 else "#FFFFFF"
        pts.append(f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(r)}" fill="{c}" opacity="{f(rnd.uniform(0.3, 0.95) * op)}"/>')
    out.append("".join(pts))
    filt = cloud_filter(card, name + "-dust", "0.02 0.05", 3, seed + 3, 3.0, -1.4)
    out.append(f'<g filter="{filt}" opacity="{f(0.7 * op)}"><path d="{d}" fill="none" stroke="{dust_color}" stroke-width="{f(width * 0.32)}"/></g>')
    return "".join(out)


def spiral_galaxy(card, name, cx, cy, r, tilt=0.42, rot=0.3, seed=11, n=900, core="#FFF4D6", arm="#B9C8FF", pink="#FF8FD0", blue="#8FB8FF", turns=3.2, arms=2, glow_op=0.6, arm_op=0.32):
    """Une galaxie spirale vue de biais : bulbe d'or, bras lumineux (lueur diffuse + étoiles bleues), bandes de poussière, nébuleuses roses."""
    rnd = random.Random(seed)
    k = 0.28
    span = turns * 1.1

    def arm_pts(a0, off=0.0, steps=60):
        pts = []
        for i in range(steps + 1):
            t = i / steps
            th = a0 + t * span
            rr = r * (0.12 + 0.88 * (math.exp(k * th - k * a0) - 1) / (math.exp(k * span) - 1)) + off
            pts.append((rr * math.cos(th), rr * math.sin(th)))
        return pts

    body = [f'<circle cx="0" cy="0" r="{f(r * 1.08)}" fill="{card.rgrad(name + "-d", [(0, core, glow_op), (0.25, arm, glow_op * 0.45), (0.7, arm, glow_op * 0.12), (1, arm, 0)])}"/>']
    lanes = []
    for a_i in range(arms):
        a0 = a_i * 2 * math.pi / arms
        pts = arm_pts(a0)
        d = _poly(pts, False)
        body.append(f'<path d="{d}" fill="none" stroke="{arm}" stroke-width="{f(r * 0.2)}" stroke-linecap="round" opacity="{arm_op}" filter="{card.blur(name + "-ab", r * 0.06)}"/>')
        body.append(f'<path d="{d}" fill="none" stroke="{pink}" stroke-width="{f(r * 0.05)}" stroke-linecap="round" opacity="{f(arm_op * 0.6)}" stroke-dasharray="{f(r * 0.03)} {f(r * 0.12)}" filter="{card.blur(name + "-ab3", r * 0.012)}"/>')
        body.append(f'<path d="{d}" fill="none" stroke="#FFFFFF" stroke-width="{f(r * 0.06)}" stroke-linecap="round" opacity="0.35" filter="{card.blur(name + "-ab2", r * 0.025)}"/>')
        lane = _poly(arm_pts(a0 - 0.25, -r * 0.02), False)
        lanes.append(f'<path d="{lane}" fill="none" stroke="#05030C" stroke-width="{f(r * 0.035)}" stroke-linecap="round" opacity="0.55"/>')
    body += lanes
    pts = []
    for i in range(n):
        a_i = i % arms
        t = rnd.random() ** 0.9
        th = a_i * 2 * math.pi / arms + t * span
        rr = r * (0.12 + 0.88 * (math.exp(k * t * span) - 1) / (math.exp(k * span) - 1))
        th += rnd.gauss(0, 0.16 + 0.1 * (1 - t))
        rr *= 1 + rnd.gauss(0, 0.08)
        x, y = rr * math.cos(th), rr * math.sin(th)
        s_ = rnd.uniform(0.3, 1.2) * (1.2 - t * 0.5)
        c = rnd.choice((blue, "#FFFFFF", arm)) if t > 0.25 else rnd.choice((core, "#FFFFFF"))
        pts.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(s_ / max(tilt, 0.3) * tilt + s_ * 0.3)}" fill="{c}" opacity="{f(0.35 + 0.6 * rnd.random())}"/>')
        if t > 0.3 and rnd.random() < 0.03:
            pts.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(s_ * 2.6)}" fill="{pink}" opacity="0.6"/>')
    for i in range(int(n * 0.25)):
        th = rnd.uniform(0, 2 * math.pi)
        rr = abs(rnd.gauss(0, r * 0.35))
        pts.append(f'<circle cx="{f(rr * math.cos(th))}" cy="{f(rr * math.sin(th))}" r="{f(rnd.uniform(0.25, 0.8))}" fill="#FFF0D0" opacity="{f(rnd.uniform(0.2, 0.7))}"/>')
    body.append("".join(pts))
    body.append(f'<circle cx="0" cy="0" r="{f(r * 0.22)}" fill="{card.rgrad(name + "-c", [(0, "#FFFFFF", 1), (0.35, core, 0.9), (1, core, 0)])}"/>')
    inner = "".join(body)
    deg = math.degrees(rot)
    return f'<g transform="translate({f(cx)} {f(cy)}) rotate({f(deg)}) scale(1 {f(tilt)})">{inner}</g>'


def elliptical_galaxy(card, name, cx, cy, r, tilt=0.6, rot=20, color="#FFE6C0", op=0.85):
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r)}" ry="{f(r * tilt)}" fill="{card.rgrad(name, [(0, "#FFFFFF", op), (0.25, color, op * 0.7), (1, color, 0)])}" transform="rotate({rot} {f(cx)} {f(cy)})"/>'


def galaxy_cluster(card, name, cx, cy, r, n=14, seed=4, arcs=True):
    """Un amas de galaxies : elliptiques dorées, spirales lointaines, et les arcs bleus d'une lentille gravitationnelle."""
    rnd = random.Random(seed)
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.2)}" fill="{card.rgrad(name + "-icm", [(0, "#FFE8C8", 0.25), (1, "#FFE8C8", 0)])}"/>']
    out.append(elliptical_galaxy(card, name + "-bcg", cx, cy, r * 0.32, 0.7, rnd.uniform(0, 90), "#FFE0B0", 0.95))
    for i in range(n):
        ang = rnd.uniform(0, 2 * math.pi)
        rr = r * rnd.random() ** 0.7
        x, y = cx + rr * math.cos(ang), cy + rr * math.sin(ang)
        gr = rnd.uniform(3, 9)
        out.append(elliptical_galaxy(card, f"{name}-g{i % 3}", x, y, gr, rnd.uniform(0.3, 0.9), rnd.uniform(0, 180), ("#FFE0B0", "#FFF0D8", "#D8E4FF")[i % 3], 0.9))
    if arcs:
        for k in range(4):
            a0 = rnd.uniform(0, 360)
            rr = r * rnd.uniform(0.55, 0.85)
            x1, y1 = pt(cx, cy, rr, a0)
            x2, y2 = pt(cx, cy, rr, a0 + rnd.uniform(25, 45))
            out.append(f'<path d="M{f(x1)} {f(y1)} A{f(rr)} {f(rr)} 0 0 1 {f(x2)} {f(y2)}" fill="none" stroke="#9FC8FF" stroke-width="{f(rnd.uniform(1.2, 2.2))}" stroke-linecap="round" opacity="0.85"/>')
    return "".join(out)


def black_hole(card, name, cx, cy, r, tilt=0.22, hot="#FFF4D8", warm="#FFB347", deep="#C2410C", ring="#FFE9C0", disk=3.2, rot=0):
    """Trou noir : disque d'accrétion incliné, anneau de photons, le bord lointain du disque replié par la lumière au-dessus de l'ombre."""
    R = r * disk
    g = card.rgrad(name + "-disk", [(0, hot, 0), (0.28, hot, 0.0), (0.3, hot, 1), (0.45, warm, 0.95), (0.75, deep, 0.6), (1, deep, 0)])
    ug = card.rgrad(name + "-up", [(0, hot, 0), (0.6, hot, 0), (0.7, hot, 0.95), (0.82, warm, 0.8), (1, deep, 0)])
    card.def_once(name + "-top", f'<clipPath id="{card.id(name + "-top")}"><rect x="{f(cx - R - 10)}" y="{f(cy - R - 10)}" width="{f(2 * R + 20)}" height="{f(R + 10)}"/></clipPath>')
    card.def_once(name + "-bot", f'<clipPath id="{card.id(name + "-bot")}"><rect x="{f(cx - R - 10)}" y="{f(cy)}" width="{f(2 * R + 20)}" height="{f(R + 10)}"/></clipPath>')
    out = [f'<g transform="rotate({rot} {f(cx)} {f(cy)})">']
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R * 0.8)}" fill="{card.rgrad(name + "-gl", [(0, warm, 0.45), (1, warm, 0)])}"/>')
    out.append(f'<g clip-path="url(#{card.id(name + "-top")})"><ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(R)}" ry="{f(R * tilt)}" fill="{g}"/></g>')
    out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy - r * 0.05)}" rx="{f(r * 1.55)}" ry="{f(r * 1.4)}" fill="{ug}" filter="{card.blur(name + "-ub", r * 0.06)}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="#000000"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.04)}" fill="none" stroke="{ring}" stroke-width="{f(max(1.2, r * 0.05))}" opacity="0.95"/>')
    out.append(f'<g clip-path="url(#{card.id(name + "-bot")})"><ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(R)}" ry="{f(R * tilt)}" fill="{g}"/></g>')
    out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(R * 0.5)}" ry="{f(R * tilt * 0.35)}" fill="{hot}" opacity="0.35" filter="{card.blur(name + "-hb", 2)}"/>')
    out.append("</g>")
    return "".join(out)


def supernova(card, name, cx, cy, r, core="#FFFFFF", c1="#FFE8A8", c2="#FF6A3D", c3="#7A3CFF", seed=31):
    """Supernova : coquille filamenteuse en expansion (bruit fractal), lueur, cœur aveuglant, aigrettes."""
    filt = cloud_filter(card, name + "-cf", "0.05", 4, seed, 3.2, -1.15)
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.9)}" fill="{card.rgrad(name + "-h", [(0, c1, 0.25), (0.45, c3, 0.22), (0.7, c2, 0.12), (1, c2, 0)])}"/>']
    shell = (f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{card.rgrad(name + "-sh", [(0, c1, 0.0), (0.55, c1, 0.15), (0.8, c2, 1), (0.92, c3, 0.9), (1, c3, 0)])}"/>')
    out.append(f'<g filter="{ublur(card, name + "-gb", r * 0.08)}" opacity="0.7">{shell}</g>')
    out.append(f'<g filter="{filt}">{shell}{shell}</g>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.6)}" fill="{card.rgrad(name + "-c", [(0, core, 1), (0.25, c1, 0.85), (0.7, c2, 0.2), (1, c2, 0)])}"/>')
    out.append(star_flare(cx, cy, r * 1.35, "#FFFFFF", 0.9, 0.03))
    out.append(star_flare(cx, cy, r * 0.75, c1, 0.7, 0.05, 45))
    return "".join(out)


def quasar(card, name, cx, cy, length, angle=0, color="#BFE6FF", core="#FFFFFF", width=10):
    """Quasar : un noyau aveuglant et deux jets opposés qui s'effilent sur des milliers d'années-lumière."""
    jg = card.def_once(name + "-jg", f'<linearGradient id="{card.id(name + "-jg")}" x1="0" y1="0" x2="1" y2="0">'
                                     f'<stop offset="0" stop-color="{color}" stop-opacity="0"/><stop offset="0.5" stop-color="{core}" stop-opacity="1"/>'
                                     f'<stop offset="1" stop-color="{color}" stop-opacity="0"/></linearGradient>')
    L = length
    jet = f"M{f(-L)} 0 L{f(-width * 0.3)} {f(-width / 2)} L{f(width * 0.3)} {f(-width / 2)} L{f(L)} 0 L{f(width * 0.3)} {f(width / 2)} L{f(-width * 0.3)} {f(width / 2)} Z"
    return (f'<g transform="translate({f(cx)} {f(cy)}) rotate({angle})">'
            f'<path d="{jet}" fill="{jg}" filter="{card.blur(name + "-jb", 2.5)}"/>'
            f'<path d="{jet}" fill="{jg}" transform="scale(1 0.3)"/>'
            f'<ellipse cx="{f(-L * 0.92)}" cy="0" rx="{f(width * 1.6)}" ry="{f(width * 1.1)}" fill="{color}" opacity="0.35" filter="{card.blur(name + "-lb", 4)}"/>'
            f'<ellipse cx="{f(L * 0.92)}" cy="0" rx="{f(width * 1.6)}" ry="{f(width * 1.1)}" fill="{color}" opacity="0.35" filter="{card.blur(name + "-lb", 4)}"/>'
            f'<ellipse cx="0" cy="0" rx="{f(width * 2.4)}" ry="{f(width * 0.5)}" fill="#FFD9A0" opacity="0.8"/>'
            f'<circle cx="0" cy="0" r="{f(width * 3)}" fill="{card.rgrad(name + "-cg", [(0, core, 1), (0.25, color, 0.6), (1, color, 0)])}"/>'
            f'</g>' + star_flare(cx, cy, width * 3.6, "#FFFFFF", 0.95, 0.04, angle))


def cosmic_web(card, name, region, seed=3, n=34, k=3, color="#C9B8FF", knot="#FFFFFF", keep=None, op=0.85, glow=True):
    """La toile cosmique : des filaments de galaxies tendus entre des nœuds, les amas aux croisements."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    nodes = []
    tries = 0
    while len(nodes) < n and tries < n * 30:
        tries += 1
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if keep and keep[0] < x < keep[2] and keep[1] < y < keep[3]:
            continue
        nodes.append((x, y))
    edges = set()
    for i, (x, y) in enumerate(nodes):
        near = sorted(range(len(nodes)), key=lambda j: (nodes[j][0] - x) ** 2 + (nodes[j][1] - y) ** 2)[1:k + 1]
        for j in near:
            edges.add((min(i, j), max(i, j)))
    deg = [0] * len(nodes)
    lines = []
    for i, j in edges:
        deg[i] += 1
        deg[j] += 1
        (xa, ya), (xb, yb) = nodes[i], nodes[j]
        mx, my = (xa + xb) / 2 + rnd.uniform(-10, 10), (ya + yb) / 2 + rnd.uniform(-10, 10)
        lines.append(f'<path d="M{f(xa)} {f(ya)} Q{f(mx)} {f(my)} {f(xb)} {f(yb)}" fill="none" stroke="{color}" stroke-width="{f(rnd.uniform(0.6, 1.6))}" opacity="{f(rnd.uniform(0.4, 0.9))}"/>')
        for _ in range(int(math.hypot(xb - xa, yb - ya) / 7)):
            t = rnd.random()
            px = (1 - t) ** 2 * xa + 2 * (1 - t) * t * mx + t * t * xb + rnd.gauss(0, 1.6)
            py = (1 - t) ** 2 * ya + 2 * (1 - t) * t * my + t * t * yb + rnd.gauss(0, 1.6)
            lines.append(f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(rnd.uniform(0.3, 0.9))}" fill="#FFFFFF" opacity="{f(rnd.uniform(0.3, 0.9))}"/>')
    knots = []
    for (x, y), dg in zip(nodes, deg):
        rr = 1.2 + dg * 0.9
        knots.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rr * 3.2)}" fill="{card.rgrad(name + "-kg", [(0, color, 0.75), (1, color, 0)])}"/>')
        knots.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rr * 0.6)}" fill="{knot}"/>')
    halo = f'<g filter="{card.blur(name + "-wb", 2.2)}" opacity="0.7">{"".join(lines[::3])}</g>' if glow else ""
    return f'<g opacity="{op}">{halo}{"".join(lines)}{"".join(knots)}</g>'


def constellation(points, links, color="#FFE9B0", line=None, r=1.8, lw=0.9, line_op=0.55, glow_color=None, big=()):
    """Une constellation : des étoiles reliées par des traits fins."""
    line = line or color
    out = [f'<path d="{" ".join(f"M{f(points[a][0])} {f(points[a][1])} L{f(points[b][0])} {f(points[b][1])}" for a, b in links)}" stroke="{line}" stroke-width="{lw}" opacity="{line_op}" fill="none"/>']
    for i, (x, y) in enumerate(points):
        rr = r * (1.8 if i in big else 1)
        if glow_color:
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rr * 3)}" fill="{glow_color}" opacity="0.25"/>')
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rr)}" fill="{color}"/>')
        if i in big:
            out.append(star_flare(x, y, rr * 4, color, 0.9))
    return "".join(out)


def shape_constellation(kind, cx, cy, s, color="#FFE9B0", line=None, r=1.8, line_op=0.55, glow_color=None):
    """Les motifs de l'atmosphère devenus constellations : scarabée, ankh, œil, barque, Sah (Orion)."""
    shapes = {
        "scarab": ([(0, -60), (-14, -46), (14, -46), (-26, -24), (26, -24), (-30, 10), (30, 10), (-20, 44), (20, 44), (0, 60), (0, -30), (0, 20),
                    (-46, -50), (46, -50), (-54, 4), (54, 4), (-46, 52), (46, 52)],
                   [(0, 1), (0, 2), (1, 3), (2, 4), (3, 5), (4, 6), (5, 7), (6, 8), (7, 9), (8, 9), (1, 10), (2, 10), (10, 11), (11, 9),
                    (3, 12), (4, 13), (5, 14), (6, 15), (7, 16), (8, 17)], (0, 9)),
        "ankh": ([(0, -60), (-16, -48), (16, -48), (-14, -30), (14, -30), (0, -22), (-36, -18), (36, -18), (0, 10), (0, 40), (0, 64)],
                 [(0, 1), (0, 2), (1, 3), (2, 4), (3, 5), (4, 5), (5, 6), (5, 7), (5, 8), (8, 9), (9, 10)], (0, 10)),
        "eye": ([(-50, 0), (-24, -14), (10, -16), (40, -4), (14, 8), (-20, 10), (0, -4), (-40, -26), (0, -30), (46, -26), (-4, 12), (-10, 44), (12, 14), (32, 34), (40, 24)],
                [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (5, 0), (7, 8), (8, 9), (5, 10), (10, 11), (4, 12), (12, 13), (13, 14)], (6,)),
        "barque": ([(-70, -26), (-56, 0), (-20, 10), (20, 10), (56, 0), (72, -30), (-12, -2), (-12, -30), (12, -30), (12, -2), (0, -50)],
                   [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (6, 7), (7, 8), (8, 9), (8, 10), (7, 10)], (10,)),
        "sah": ([(-22, -46), (24, -40), (-8, -4), (0, -2), (8, 0), (-26, 44), (28, 40), (-2, -62), (-6, 18)],
                [(0, 2), (1, 4), (2, 3), (3, 4), (2, 5), (4, 6), (0, 7), (1, 7), (3, 8)], (0, 6)),
    }
    pts, links, big = shapes[kind]
    p = [(cx + x * s, cy + y * s) for x, y in pts]
    return constellation(p, links, color, line, r, 0.9, line_op, glow_color, big)


# ---------------------------------------------------------------- l'infime

def atom(card, name, cx, cy, r, orbits=3, tilt=0.3, color="#9FE8FF", electron="#FFFFFF", nucleus=("#FF8A6A", "#7FB8FF"), rot0=0, w=1.2, op=0.9, n_nuc=7):
    """Un atome : orbites d'électrons inclinées, électrons lumineux, noyau de protons et de neutrons."""
    out = []
    for k in range(orbits):
        a = rot0 + k * 180 / orbits
        out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r)}" ry="{f(r * tilt)}" fill="none" stroke="{color}" stroke-width="{f(w)}" opacity="{op}" transform="rotate({f(a)} {f(cx)} {f(cy)})"/>')
        t = math.radians(40 + k * 97)
        ex, ey = r * math.cos(t), r * tilt * math.sin(t)
        ar = math.radians(a)
        px, py = cx + ex * math.cos(ar) - ey * math.sin(ar), cy + ex * math.sin(ar) + ey * math.cos(ar)
        out.append(f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(r * 0.09)}" fill="{card.rgrad(name + "-e", [(0, electron, 1), (0.4, color, 0.8), (1, color, 0)])}"/>')
    out.append(nucleus_ball(card, name + "-n", cx, cy, r * 0.17, n_nuc, nucleus))
    return "".join(out)


def nucleus_ball(card, name, cx, cy, r, n=7, colors=("#FF8A6A", "#7FB8FF"), seed=2):
    """Un noyau atomique : des sphères serrées (protons rouges, neutrons bleus)."""
    rnd = random.Random(seed)
    ga = card.rgrad(name + "-a", [(0, "#FFFFFF", 1), (0.35, colors[0], 1), (1, "#7A1A0A", 1)], 0.35, 0.3, 0.75)
    gb = card.rgrad(name + "-b", [(0, "#FFFFFF", 1), (0.35, colors[1], 1), (1, "#0A2A6A", 1)], 0.35, 0.3, 0.75)
    balls = []
    for i in range(n):
        a = i * 137.5
        rr = r * 0.62 * math.sqrt(i / n)
        x, y = pt(cx, cy, rr, a)
        balls.append((y + rnd.uniform(-0.2, 0.2), x, y))
    balls.sort()
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 2.2)}" fill="{card.rgrad(name + "-g", [(0, "#FFE6D0", 0.5), (1, "#FFE6D0", 0)])}"/>']
    for k, (_, x, y) in enumerate(balls):
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.42)}" fill="{ga if k % 2 else gb}"/>')
    return "".join(out)


def proton_quarks(card, name, cx, cy, r, colors=("#FF4D6D", "#3DDC84", "#4D8BFF")):
    """Un proton ouvert : trois quarks (rouge, vert, bleu) liés par des gluons en ressort."""
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{card.rgrad(name + "-p", [(0, "#FFFFFF", 0.18), (0.8, "#FFB0C8", 0.12), (1, "#FFB0C8", 0)])}" stroke="#FFD0E0" stroke-width="0.8" stroke-dasharray="2 3" opacity="0.9"/>']
    q = [pt(cx, cy, r * 0.5, a) for a in (0, 120, 240)]
    for i in range(3):
        (xa, ya), (xb, yb) = q[i], q[(i + 1) % 3]
        L = math.hypot(xb - xa, yb - ya)
        ang = math.atan2(yb - ya, xb - xa)
        pts = []
        for k in range(41):
            t = k / 40
            off = math.sin(t * math.pi * 10) * r * 0.06
            pts.append((xa + (xb - xa) * t - math.sin(ang) * off, ya + (yb - ya) * t + math.cos(ang) * off))
        out.append(f'<path d="{_poly(pts, False)}" fill="none" stroke="#FFE9A8" stroke-width="{f(max(0.6, r * 0.03))}" opacity="0.85"/>')
        _ = L
    for (x, y), c in zip(q, colors):
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.17)}" fill="{card.rgrad(name + c[1:], [(0, "#FFFFFF", 1), (0.35, c, 1), (1, c, 0.6)])}"/>')
    return "".join(out)


def orbital_lobes(card, name, cx, cy, r, color="#7FD8FF", n=3, rot=0, op=0.55):
    """Les orbitales p d'un électron : des lobes de probabilité, comme les pétales d'un lotus."""
    g = card.rgrad(name, [(0, "#FFFFFF", op), (0.4, color, op * 0.8), (1, color, 0)], 0.5, 0.5, 0.5)
    out = []
    for k in range(n):
        a = rot + k * 180 / n
        for sgn in (-1, 1):
            x, y = pt(cx, cy, r * 0.55, a + (0 if sgn > 0 else 180))
            out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(r * 0.28)}" ry="{f(r * 0.55)}" fill="{g}" transform="rotate({f(a)} {f(x)} {f(y)})"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.08)}" fill="#FFFFFF"/>')
    return "".join(out)


def dna_helix(card, name, x, y0, y1, amp, period, strand=GOLD3, strand2=None, bases=(TURQ, CARN, LAPIS_L, GOLD), w=3.2, rungs=True, heads=False, op=1):
    """La double hélice : deux brins qui s'enroulent, les paires de bases en barreaux colorés, le brin arrière assombri."""
    hi, mid, lo = strand
    s2 = strand2 or strand
    g1 = card.grad(name + "-s1", [(0, hi), (0.5, mid), (1, lo)], 0, 0, 1, 0)
    g2 = card.grad(name + "-s2", [(0, s2[0]), (0.5, s2[1]), (1, s2[2])], 0, 0, 1, 0)
    n = int((y1 - y0) / 2)
    back, front, rung = [], [], []
    for strand_i, ph in ((0, 0.0), (1, math.pi)):
        seg = []
        prev_front = None
        for i in range(n + 1):
            y = y0 + (y1 - y0) * i / n
            t = (y - y0) / period * 2 * math.pi + ph
            xx = x + amp * math.sin(t)
            is_front = math.cos(t) > 0
            if prev_front is None or is_front == prev_front:
                seg.append((xx, y))
            else:
                (front if prev_front else back).append((strand_i, seg))
                seg = [seg[-1], (xx, y)]
            prev_front = is_front
        (front if prev_front else back).append((strand_i, seg))
    if rungs:
        k = 0
        y = y0 + period * 0.06
        while y < y1:
            t = (y - y0) / period * 2 * math.pi
            xa, xb = x + amp * math.sin(t), x + amp * math.sin(t + math.pi)
            depth = 0.45 + 0.55 * abs(math.sin(t))
            ca, cb = bases[k % 4], bases[(k + 2) % 4]
            xm = (xa + xb) / 2
            rung.append(f'<line x1="{f(xa)}" y1="{f(y)}" x2="{f(xm)}" y2="{f(y)}" stroke="{ca}" stroke-width="{f(w * 0.75)}" opacity="{f(depth * op)}" stroke-linecap="round"/>'
                        f'<line x1="{f(xm)}" y1="{f(y)}" x2="{f(xb)}" y2="{f(y)}" stroke="{cb}" stroke-width="{f(w * 0.75)}" opacity="{f(depth * op)}" stroke-linecap="round"/>')
            y += period / 10
            k += 1
    out = []
    for si, seg in back:
        out.append(f'<path d="{_poly(seg, False)}" fill="none" stroke="{g1 if si == 0 else g2}" stroke-width="{f(w * 0.8)}" opacity="{f(0.45 * op)}" stroke-linecap="round"/>')
    out.append("".join(rung))
    for si, seg in front:
        out.append(f'<path d="{_poly(seg, False)}" fill="none" stroke="{g1 if si == 0 else g2}" stroke-width="{f(w)}" opacity="{op}" stroke-linecap="round"/>')
        out.append(f'<path d="{_poly(seg, False)}" fill="none" stroke="#FFFFFF" stroke-width="{f(w * 0.25)}" opacity="{f(0.45 * op)}" stroke-linecap="round" transform="translate(-0.6 0)"/>')
    return "".join(out)


def cell(card, name, cx, cy, r, membrane="#7FE0C8", plasm="#1A5A5A", nucleus_c="#7A5AE0", seed=3, organelles=True):
    """Une cellule : membrane double, cytoplasme, noyau et nucléole, mitochondries, réticulum, vésicules."""
    rnd = random.Random(seed)
    g = card.rgrad(name + "-c", [(0, plasm, 0.35), (0.85, plasm, 0.6), (1, membrane, 0.8)], 0.45, 0.45, 0.55)
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}" stroke="{membrane}" stroke-width="{f(r * 0.04)}"/>',
           f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.93)}" fill="none" stroke="{membrane}" stroke-width="{f(r * 0.015)}" opacity="0.6"/>']
    nx, ny = cx + r * 0.12, cy - r * 0.08
    out.append(f'<circle cx="{f(nx)}" cy="{f(ny)}" r="{f(r * 0.34)}" fill="{card.rgrad(name + "-n", [(0, "#FFFFFF", 0.5), (0.3, nucleus_c, 0.9), (1, nucleus_c, 0.6)], 0.4, 0.4, 0.6)}" stroke="#D0C0FF" stroke-width="{f(r * 0.02)}"/>')
    out.append(f'<circle cx="{f(nx - r * 0.06)}" cy="{f(ny + r * 0.05)}" r="{f(r * 0.1)}" fill="#3A1A9A" opacity="0.8"/>')
    if organelles:
        for i in range(5):
            a = rnd.uniform(0, 360)
            rr = r * rnd.uniform(0.55, 0.78)
            x, y = pt(cx, cy, rr, a)
            out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(r * 0.13)}" ry="{f(r * 0.06)}" fill="#FF9A6A" stroke="#FFD0A0" stroke-width="{f(r * 0.012)}" transform="rotate({f(a + 90)} {f(x)} {f(y)})"/>')
            out.append(f'<path d="M{f(x - r * 0.08)} {f(y)} q{f(r * 0.03)} {f(-r * 0.04)} {f(r * 0.05)} 0 t{f(r * 0.05)} 0 t{f(r * 0.05)} 0" fill="none" stroke="#FFE0C0" stroke-width="{f(r * 0.01)}" transform="rotate({f(a + 90)} {f(x)} {f(y)})"/>')
        for i in range(3):
            a = rnd.uniform(0, 360)
            x, y = pt(nx, ny, r * 0.45, a)
            out.append(f'<path d="M{f(x)} {f(y)} q{f(r * 0.06)} {f(-r * 0.04)} {f(r * 0.12)} 0 t{f(r * 0.12)} 0" fill="none" stroke="#9FE8FF" stroke-width="{f(r * 0.018)}" opacity="0.8" transform="rotate({f(a)} {f(x)} {f(y)})"/>')
        for i in range(9):
            a = rnd.uniform(0, 360)
            x, y = pt(cx, cy, r * rnd.uniform(0.3, 0.85), a)
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * rnd.uniform(0.02, 0.045))}" fill="#E8FFF6" opacity="0.8"/>')
    return "".join(out)


def plant_cells(card, name, x0, y0, x1, y1, cs, wall="#9FE89A", fill="#1F5A3A", seed=4, op=1):
    """Les cellules du papyrus au microscope : un pavage d'hexagones, un noyau dans chacune."""
    rnd = random.Random(seed)
    out = []
    h = cs * math.sqrt(3) / 2
    row = 0
    y = y0
    while y < y1 + h:
        x = x0 + (cs * 0.75 if row % 2 else 0)
        while x < x1 + cs:
            pts = [(x + cs * 0.5 * math.cos(math.radians(60 * k)) + rnd.uniform(-1, 1), y + cs * 0.5 * math.sin(math.radians(60 * k)) + rnd.uniform(-1, 1)) for k in range(6)]
            out.append(f'<path d="{_poly(pts)}" fill="{fill}" stroke="{wall}" stroke-width="{f(cs * 0.06)}" opacity="{op}"/>')
            out.append(f'<circle cx="{f(x + rnd.uniform(-cs * 0.1, cs * 0.1))}" cy="{f(y + rnd.uniform(-cs * 0.1, cs * 0.1))}" r="{f(cs * 0.09)}" fill="#E8FFB0" opacity="{f(op * 0.85)}"/>')
            x += cs * 1.5
        y += h / 2
        row += 1
    return "".join(out)


def neuron(seed, cx, cy, s, color="#9FD8FF", glow=None, axon_dir=150, axon_len=120, depth=4):
    """Un neurone : le corps, des dendrites qui se ramifient, un axone gainé de myéline et ses terminaisons."""
    rnd = random.Random(seed)
    out = []

    def branch(x, y, ang, ln, w, d):
        if d == 0 or ln < 3:
            return
        x2, y2 = pt(x, y, ln, ang)
        mx, my = pt(x, y, ln * 0.5, ang + rnd.uniform(-18, 18))
        out.append(f'<path d="M{f(x)} {f(y)} Q{f(mx)} {f(my)} {f(x2)} {f(y2)}" fill="none" stroke="{color}" stroke-width="{f(w)}" stroke-linecap="round"/>')
        for _ in range(2):
            branch(x2, y2, ang + rnd.uniform(-38, 38), ln * rnd.uniform(0.55, 0.75), w * 0.62, d - 1)

    for i in range(6):
        a = i * 60 + rnd.uniform(-15, 15)
        if abs(((a - axon_dir) + 180) % 360 - 180) < 40:
            continue
        branch(cx, cy, a, 22 * s, 3 * s, depth)
    ax, ay = cx, cy
    seg = 9
    for k in range(seg):
        nx, ny = pt(ax, ay, axon_len * s / seg, axon_dir + math.sin(k) * 8)
        if k % 2:
            out.append(f'<line x1="{f(ax)}" y1="{f(ay)}" x2="{f(nx)}" y2="{f(ny)}" stroke="{color}" stroke-width="{f(5 * s)}" stroke-linecap="round" opacity="0.75"/>')
        out.append(f'<line x1="{f(ax)}" y1="{f(ay)}" x2="{f(nx)}" y2="{f(ny)}" stroke="{color}" stroke-width="{f(1.6 * s)}"/>')
        ax, ay = nx, ny
    for _ in range(4):
        branch(ax, ay, axon_dir + rnd.uniform(-50, 50), 12 * s, 1.2 * s, 2)
        tx, ty = pt(ax, ay, 14 * s, axon_dir + rnd.uniform(-50, 50))
        out.append(f'<circle cx="{f(tx)}" cy="{f(ty)}" r="{f(1.8 * s)}" fill="#FFFFFF"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(7 * s)}" fill="{color}"/><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(3 * s)}" fill="#FFFFFF" opacity="0.8"/>')
    gl = f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(30 * s)}" fill="{glow}" opacity="0.25"/>' if glow else ""
    return gl + "".join(out)


def pollen(card, name, cx, cy, r, color="#FFD36E", spikes=26, seed=5):
    """Un grain de pollen au microscope : une sphère hérissée d'épines, des pores."""
    rnd = random.Random(seed)
    g = card.rgrad(name, [(0, "#FFFFFF", 1), (0.35, color, 1), (1, "#8A4A0A", 1)], 0.35, 0.3, 0.75)
    out = []
    for i in range(spikes):
        a = i * 360 / spikes + rnd.uniform(-4, 4)
        x1, y1 = pt(cx, cy, r * 0.92, a - 5)
        x2, y2 = pt(cx, cy, r * 0.92, a + 5)
        x3, y3 = pt(cx, cy, r * 1.28, a)
        out.append(f'<path d="M{f(x1)} {f(y1)} L{f(x3)} {f(y3)} L{f(x2)} {f(y2)} Z" fill="{color}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/>')
    for i in range(12):
        a = rnd.uniform(0, 360)
        rr = r * rnd.uniform(0.1, 0.75)
        x, y = pt(cx, cy, rr, a)
        out.append(f'<path d="M{f(x - r * 0.08)} {f(y)} L{f(x)} {f(y - r * 0.14)} L{f(x + r * 0.08)} {f(y)} Z" fill="#8A4A0A" opacity="0.45"/>')
    for a in (40, 160, 280):
        x, y = pt(cx, cy, r * 0.5, a)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.12)}" fill="#6A3008" opacity="0.6"/>')
    return "".join(out)


def crystal(card, name, cx, cy, s, colors=("#E8F8FF", "#9FD8F2", "#4A8AB8"), rot=0, op=1):
    """Un cristal de quartz : prisme hexagonal à pointe, faces éclairées, reflets."""
    a, b, c = colors
    faces = [
        (f"M0 -60 L-14 -40 L-14 40 L0 52 Z", a),
        (f"M0 -60 L14 -40 L14 40 L0 52 Z", b),
        (f"M14 -40 L22 -30 L22 36 L14 40 Z", c),
        (f"M-14 -40 L-22 -30 L-22 36 L-14 40 Z", b),
    ]
    out = [f'<g transform="translate({f(cx)} {f(cy)}) rotate({rot}) scale({f(s)})" opacity="{op}">']
    for d, col in faces:
        out.append(f'<path d="{d}" fill="{col}" stroke="#FFFFFF" stroke-width="{f(0.8 / s)}" stroke-opacity="0.8"/>')
    out.append(f'<path d="M-8 -40 L-8 30" stroke="#FFFFFF" stroke-width="{f(1.4 / s)}" opacity="0.7"/>')
    out.append("</g>")
    return "".join(out)


def koch_snowflake(cx, cy, r, depth, color, w=1.0, op=1, rot=0):
    """Le flocon de Koch : chaque côté se replie en quatre, à l'infini."""
    pts = [pt(cx, cy, r, rot + a) for a in (0, 120, 240)]

    def split(p, q, d):
        if d == 0:
            return [p]
        (x1, y1), (x2, y2) = p, q
        dx, dy = (x2 - x1) / 3, (y2 - y1) / 3
        a = (x1 + dx, y1 + dy)
        b = (x1 + 2 * dx, y1 + 2 * dy)
        ang = math.atan2(dy, dx) - math.pi / 3
        L = math.hypot(dx, dy)
        peak = (a[0] + L * math.cos(ang), a[1] + L * math.sin(ang))
        return split(p, a, d - 1) + split(a, peak, d - 1) + split(peak, b, d - 1) + split(b, q, d - 1)

    poly = []
    for i in range(3):
        poly += split(pts[i], pts[(i + 1) % 3], depth)
    return f'<path d="{_poly(poly)}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{op}" stroke-linejoin="round"/>'


def flower_of_life(cx, cy, r, rings, color, w=0.8, op=0.6, clip_r=None):
    """La fleur de vie, gravée au temple d'Abydos : des cercles égaux dont chacun passe par le centre de ses voisins."""
    centers = {(0.0, 0.0)}
    frontier = [(0.0, 0.0)]
    for _ in range(rings):
        nxt = []
        for x, y in frontier:
            for k in range(6):
                a = math.radians(60 * k)
                p = (round(x + r * math.cos(a), 3), round(y + r * math.sin(a), 3))
                if p not in centers:
                    centers.add(p)
                    nxt.append(p)
        frontier = nxt
    out = [f'<circle cx="{f(cx + x)}" cy="{f(cy + y)}" r="{f(r)}" fill="none" stroke="{color}" stroke-width="{w}"/>' for x, y in centers
           if clip_r is None or math.hypot(x, y) <= clip_r]
    return f'<g opacity="{op}">{"".join(out)}</g>'


def sierpinski(cx, base_y, size, depth, colors, outline=None, op=1, min_fill=0):
    """La pyramide infinie : un triangle de Sierpiński, chaque pyramide faite de pyramides plus petites."""
    out = []
    h = size * math.sqrt(3) / 2

    def tri(x, y, s, d):
        hh = s * math.sqrt(3) / 2
        if d == 0:
            col = colors[int((y - (base_y - h)) / h * len(colors)) % len(colors)]
            st = f' stroke="{outline}" stroke-width="0.4"' if outline else ""
            out.append(f'<path d="M{f(x - s / 2)} {f(y)} L{f(x)} {f(y - hh)} L{f(x + s / 2)} {f(y)} Z" fill="{col}"{st}/>')
            return
        tri(x - s / 4, y, s / 2, d - 1)
        tri(x + s / 4, y, s / 2, d - 1)
        tri(x, y - hh / 2, s / 2, d - 1)

    tri(cx, base_y, size, depth)
    return f'<g opacity="{op}">{"".join(out)}</g>'


def wedjat_spiral(x, y, w, h, n, color, w_line=1.2, op=0.9, arcs=True):
    """Les fractions de l'œil d'Horus (1/2, 1/4 … 1/64) : un rectangle partagé en deux, puis en deux, sans fin."""
    out = [f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="none" stroke="{color}" stroke-width="{w_line}"/>']
    cx, cy, cw, ch = x, y, w, h
    for k in range(n):
        side = k % 4
        if side == 0:
            out.append(f'<line x1="{f(cx + cw / 2)}" y1="{f(cy)}" x2="{f(cx + cw / 2)}" y2="{f(cy + ch)}" stroke="{color}" stroke-width="{w_line}"/>')
            if arcs:
                out.append(f'<path d="M{f(cx)} {f(cy + ch)} A{f(cw / 2)} {f(ch)} 0 0 1 {f(cx + cw / 2)} {f(cy)}" fill="none" stroke="{color}" stroke-width="{f(w_line * 1.4)}"/>')
            cx, cw = cx + cw / 2, cw / 2
        elif side == 1:
            out.append(f'<line x1="{f(cx)}" y1="{f(cy + ch / 2)}" x2="{f(cx + cw)}" y2="{f(cy + ch / 2)}" stroke="{color}" stroke-width="{w_line}"/>')
            if arcs:
                out.append(f'<path d="M{f(cx)} {f(cy)} A{f(cw)} {f(ch / 2)} 0 0 1 {f(cx + cw)} {f(cy + ch / 2)}" fill="none" stroke="{color}" stroke-width="{f(w_line * 1.4)}"/>')
            cy, ch = cy + ch / 2, ch / 2
        elif side == 2:
            out.append(f'<line x1="{f(cx + cw / 2)}" y1="{f(cy)}" x2="{f(cx + cw / 2)}" y2="{f(cy + ch)}" stroke="{color}" stroke-width="{w_line}"/>')
            if arcs:
                out.append(f'<path d="M{f(cx + cw)} {f(cy)} A{f(cw / 2)} {f(ch)} 0 0 1 {f(cx + cw / 2)} {f(cy + ch)}" fill="none" stroke="{color}" stroke-width="{f(w_line * 1.4)}"/>')
            cw = cw / 2
        else:
            out.append(f'<line x1="{f(cx)}" y1="{f(cy + ch / 2)}" x2="{f(cx + cw)}" y2="{f(cy + ch / 2)}" stroke="{color}" stroke-width="{w_line}"/>')
            if arcs:
                out.append(f'<path d="M{f(cx + cw)} {f(cy + ch)} A{f(cw)} {f(ch / 2)} 0 0 1 {f(cx)} {f(cy + ch / 2)}" fill="none" stroke="{color}" stroke-width="{f(w_line * 1.4)}"/>')
            ch = ch / 2
    return f'<g opacity="{op}">{"".join(out)}</g>'


def wave_packet(x0, x1, y, amp, wavelength, sigma, color, w=1.4, op=0.9, phase=0, center=None):
    """Une onde quantique : une sinusoïde sous une enveloppe en cloche."""
    c = center if center is not None else (x0 + x1) / 2
    pts = []
    n = int((x1 - x0) / 1.5)
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        env = math.exp(-((x - c) ** 2) / (2 * sigma ** 2))
        pts.append((x, y - amp * env * math.sin((x - c) / wavelength * 2 * math.pi + phase)))
    return f'<path d="{_poly(pts, False)}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{op}" stroke-linecap="round"/>'


def particle_tracks(seed, cx, cy, n, colors, rmax=90, w=1.1, op=0.85, a0=0, a1=360):
    """Les traces d'une collision dans une chambre à bulles : des spirales qui s'enroulent dans le champ magnétique."""
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        ang = math.radians(rnd.uniform(a0, a1))
        curl = rnd.choice((-1, 1)) * rnd.uniform(0.01, 0.06)
        decay = rnd.uniform(0.985, 0.998)
        speed = rnd.uniform(2.0, 4.0)
        x, y = cx, cy
        pts = [(x, y)]
        L = rnd.uniform(0.4, 1.0) * rmax
        dist = 0
        while dist < L * 3 and len(pts) < 400:
            ang += curl
            curl *= 1.012
            speed *= decay
            x += math.cos(ang) * speed
            y += math.sin(ang) * speed
            dist += speed
            pts.append((x, y))
            if speed < 0.4:
                break
        c = colors[i % len(colors)]
        out.append(f'<path d="{_poly(pts, False)}" fill="none" stroke="{c}" stroke-width="{f(w * rnd.uniform(0.6, 1.2))}" opacity="{f(op * rnd.uniform(0.5, 1))}" stroke-linecap="round"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="3" fill="#FFFFFF"/>')
    return "".join(out)


def string_loop(cx, cy, r, modes, amp, color, w=1.4, op=0.9, rot=0, seed=1):
    """Une corde qui vibre : une boucle fermée dont le rayon ondule selon quelques modes."""
    rnd = random.Random(seed)
    phases = [rnd.uniform(0, 6.28) for _ in modes]
    pts = []
    for i in range(121):
        t = 2 * math.pi * i / 120
        rr = r + sum(amp / (k + 1) * math.sin(m * t + p) for k, (m, p) in enumerate(zip(modes, phases)))
        pts.append((cx + rr * math.cos(t + rot), cy + rr * math.sin(t + rot) * 0.8))
    return f'<path d="{_poly(pts)}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{op}"/>'


def quantum_foam(card, name, region, seed=6, n=120, color="#B9A7FF", rmax=7, op=0.7):
    """La mousse quantique : des bulles d'espace-temps qui naissent et s'annulent à l'échelle de Planck."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        r = rnd.uniform(1, rmax) ** 1.1
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="none" stroke="{color}" stroke-width="{f(rnd.uniform(0.4, 1.0))}" opacity="{f(rnd.uniform(0.3, 1) * op)}"/>')
        if rnd.random() < 0.3:
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.3)}" fill="#FFFFFF" opacity="{f(rnd.uniform(0.3, 0.9) * op)}"/>')
    return "".join(out)


def lens(card, name, cx, cy, r, inner, ring=GOLD3, ground="#06101E", glass=True, ticks=True):
    """Un oculaire : le minuscule vu dans un cercle de métal (la loupe du savant, l'œil du dieu)."""
    hi, mid, lo = ring
    card.def_once(name + "-cl", f'<clipPath id="{card.id(name + "-cl")}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}"/></clipPath>')
    g = card.grad(name + "-rg", [(0, hi), (0.3, mid), (0.5, lo), (0.7, mid), (1, hi)], 0, 0, 1, 1)
    out = [f'<circle cx="{f(cx)}" cy="{f(cy + 4)}" r="{f(r + 6)}" fill="#000000" opacity="0.45" filter="{card.blur(name + "-sh", 5)}"/>',
           f'<g clip-path="url(#{card.id(name + "-cl")})"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{ground}"/>{inner}'
           f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{card.rgrad(name + "-vg", [(0.6, "#000000", 0), (1, "#000000", 0.6)])}"/></g>']
    if glass:
        out.append(f'<path d="M{f(cx - r * 0.7)} {f(cy - r * 0.35)} A{f(r * 0.8)} {f(r * 0.8)} 0 0 1 {f(cx - r * 0.1)} {f(cy - r * 0.78)}" fill="none" stroke="#FFFFFF" stroke-width="{f(r * 0.06)}" stroke-linecap="round" opacity="0.35"/>')
    out.append(f'<g filter="{bevel(card, name + "-bv", 0.8, 2, sd=2, dy=2)}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r + 3)}" fill="none" stroke="{g}" stroke-width="6"/></g>')
    if ticks:
        for k in range(24):
            x1, y1 = pt(cx, cy, r + 7, k * 15)
            x2, y2 = pt(cx, cy, r + (12 if k % 6 == 0 else 9.5), k * 15)
            out.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{mid}" stroke-width="1.2"/>')
    return "".join(out)


def open_string(x0, y0, x1, y1, modes, amp, color, w=1.4, op=0.9, glow=None):
    """Une corde ouverte qui vibre entre deux points : plusieurs modes superposés, deux extrémités brillantes."""
    L = math.hypot(x1 - x0, y1 - y0)
    ang = math.atan2(y1 - y0, x1 - x0)
    out = []
    for k, m in enumerate(modes):
        pts = []
        for i in range(81):
            t = i / 80
            off = amp / (k + 1) * math.sin(m * math.pi * t) * (1 if k % 2 == 0 else -1)
            pts.append((x0 + (x1 - x0) * t - math.sin(ang) * off, y0 + (y1 - y0) * t + math.cos(ang) * off))
        out.append(f'<path d="{_poly(pts, False)}" fill="none" stroke="{color}" stroke-width="{f(w * (1 - k * 0.2))}" opacity="{f(op * (1 - k * 0.25))}"/>')
    out.append(f'<circle cx="{f(x0)}" cy="{f(y0)}" r="{f(w * 1.6)}" fill="#FFFFFF"/><circle cx="{f(x1)}" cy="{f(y1)}" r="{f(w * 1.6)}" fill="#FFFFFF"/>')
    _ = L
    return "".join(out)
