"""Aurores du Nord - le cosmos : l'immense (nébuleuses, galaxies, trous noirs, quasars, toile cosmique,
traînées d'étoiles, Bifröst) et l'infime (atomes, orbitales, ADN, neurones, cellules, maille de la glace,
flocon fractal, pollen, samare du frêne, ondes, traces de particules, mousse quantique, cordes).

Toutes les fonctions rendent du markup SVG ; celles qui prennent `card` y déclarent dégradés et filtres.
"""

import math
import random

from base import W, H, f, pt, sparkle
from kit import smooth, ribbon, resample, normals, ublur, noise_filter


# ================================================================ étoiles

def cstar(card, x, y, r, color="#FFFFFF", glow=None, spikes=True, op=1.0, name="cs"):
    """Une étoile brillante : cœur, halo, aigrettes de diffraction."""
    glow = glow or color
    g = card.rgrad(name + "-gl", [(0, glow, 0.85), (0.3, glow, 0.25), (1, glow, 0)])
    out = [f'<g opacity="{f(op)}"><circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 6)}" fill="{g}"/>']
    if spikes:
        out.append(sparkle(x, y, r * 7, color, 0.85))
        out.append(f'<path d="M{f(x - r * 3.2)} {f(y - r * 3.2)} L{f(x + r * 3.2)} {f(y + r * 3.2)} M{f(x + r * 3.2)} {f(y - r * 3.2)} L{f(x - r * 3.2)} {f(y + r * 3.2)}" stroke="{color}" stroke-width="{f(max(0.4, r * 0.25))}" opacity="0.5"/>')
    out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="#FFFFFF"/></g>')
    return "".join(out)


def star_field(seed, n, region=(0, 0, W, H), colors=("#FFFFFF", "#CFE6FF", "#FFE9C8"), rmax=1.6, keep=None, op=(0.3, 1.0)):
    """Champ d'étoiles ; `keep` = (x0, y0, x1, y1) zone laissée vide (la photo)."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if keep and keep[0] < x < keep[2] and keep[1] < y < keep[3]:
            continue
        r = rmax * rnd.random() ** 2.2 + 0.3
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{rnd.choice(colors)}" opacity="{f(rnd.uniform(*op))}"/>')
    return "".join(out)


def bright_stars(card, seed, n, region, colors=("#FFFFFF", "#BFE6FF"), rmin=0.8, rmax=1.8, keep=None, name="bs"):
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    tries = 0
    while len(out) < n and tries < n * 20:
        tries += 1
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if keep and keep[0] < x < keep[2] and keep[1] < y < keep[3]:
            continue
        out.append(cstar(card, x, y, rnd.uniform(rmin, rmax), rnd.choice(colors), op=rnd.uniform(0.7, 1), name=name))
    return "".join(out)


def constellation(card, stars_xy, edges, color="#DDF2FF", line_op=0.5, r=1.6, w=0.9, glow=True, name="cn", big=()):
    """Une constellation : traits fins entre les étoiles, étoiles à halo (`big` = indices plus brillants)."""
    out = []
    for a, b in edges:
        (x1, y1), (x2, y2) = stars_xy[a], stars_xy[b]
        out.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{color}" stroke-width="{f(w)}" opacity="{f(line_op)}" stroke-linecap="round"/>')
    for i, (x, y) in enumerate(stars_xy):
        if glow:
            out.append(cstar(card, x, y, r * (1.5 if i in big else 1.0), color, spikes=i in big, name=name))
        else:
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{color}"/>')
    return "".join(out)


def star_trails(card, name, cx, cy, r0, r1, n, a0, a1, seed=3, colors=("#BFE6FF", "#FFFFFF", "#FFE2B8", "#9FC8FF"), w=(0.5, 1.4), op=(0.25, 0.85)):
    """Les traînées d'étoiles autour de l'étoile polaire : des arcs concentriques (pose longue)."""
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        r = rnd.uniform(r0, r1)
        a = rnd.uniform(a0, a1)
        span = rnd.uniform(18, 46)
        xa, ya = pt(cx, cy, r, a)
        xb, yb = pt(cx, cy, r, a + span)
        out.append(f'<path d="M{f(xa)} {f(ya)} A{f(r)} {f(r)} 0 0 1 {f(xb)} {f(yb)}" fill="none" stroke="{rnd.choice(colors)}" '
                   f'stroke-width="{f(rnd.uniform(*w))}" opacity="{f(rnd.uniform(*op))}" stroke-linecap="round"/>')
    body = "".join(out)
    return f'<g filter="{ublur(card, name + "-b", 0.35)}">{body}</g>'


# ================================================================ nuages et nébuleuses

def nebula(card, name, cx, cy, rx, ry, c1, c2, op=0.9, freq="0.011", seed=5, a=2.6, b=-0.85, octaves=4, soft=True):
    """Une nébuleuse : un voile doux (flou) + sa texture fractale (bruit)."""
    g = card.rgrad(name + "-g", [(0, c1, op), (0.5, c2, op * 0.65), (1, c2, 0)])
    out = []
    if soft:
        gs = card.rgrad(name + "-gs", [(0, c1, op * 0.35), (0.6, c2, op * 0.15), (1, c2, 0)])
        out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx * 1.1)}" ry="{f(ry * 1.1)}" fill="{gs}"/>')
    filt = noise_filter(card, name + "-nf", freq, octaves, seed, a, b)
    out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{g}" filter="{filt}"/>')
    return "".join(out)


def dust_lane(card, name, pts, w, color="#02040C", op=0.7, seed=9):
    d = ribbon(pts, w, w * 0.4, n=40)
    filt = noise_filter(card, name + "-df", "0.03", 3, seed, 3.2, -1.1)
    return f'<path d="{d}" fill="{color}" opacity="{f(op)}" filter="{filt}"/>'


def milky_way(card, name, pts, width, seed=21, n=1400, glow="#CFE0FF", warm="#FFE2B8", rose="#FF9FD0", keep=None, op=1.0):
    """La Voie lactée : une écharpe d'étoiles serrées, une lueur, une veine sombre."""
    rnd = random.Random(seed)
    sp = resample(pts, 80)
    nm = normals(sp)
    out = [f'<g opacity="{f(op)}">']
    band = ribbon(pts, width * 1.2, width * 0.8, n=40)
    out.append(f'<path d="{band}" fill="{glow}" opacity="0.16" filter="{ublur(card, name + "-gb", width * 0.35)}"/>')
    out.append(f'<path d="{ribbon(pts, width * 0.55, width * 0.4, n=40)}" fill="{warm}" opacity="0.18" filter="{ublur(card, name + "-gw", width * 0.2)}"/>')
    tex = noise_filter(card, name + "-tx", "0.02", 4, seed, 2.8, -1.0)
    out.append(f'<g filter="{tex}" opacity="0.5"><path d="{band}" fill="{rose}" filter="{ublur(card, name + "-tb", width * 0.18)}"/></g>')
    dots = []
    for _ in range(n):
        i = rnd.randrange(80)
        (x, y), (nx, ny) = sp[i], nm[i]
        o = rnd.gauss(0, width * 0.32)
        px, py = x + nx * o, y + ny * o
        if keep and keep[0] < px < keep[2] and keep[1] < py < keep[3]:
            continue
        dots.append(f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(0.25 + 1.2 * rnd.random() ** 3)}" fill="#FFFFFF" opacity="{f(rnd.uniform(0.25, 0.95))}"/>')
    out.append("".join(dots))
    lane = [(x + nx * width * 0.08 * math.sin(i * 0.4), y + ny * width * 0.08 * math.sin(i * 0.4)) for i, ((x, y), (nx, ny)) in enumerate(zip(sp[::8], nm[::8]))]
    out.append(f'<path d="{ribbon(lane, width * 0.16, width * 0.08, n=40)}" fill="#02040C" opacity="0.55" filter="{ublur(card, name + "-lb", width * 0.06)}"/>')
    out.append("</g>")
    return "".join(out)


# ================================================================ galaxies

def spiral_galaxy(card, name, cx, cy, r, tilt=0.42, rot=0.0, seed=11, n=700, arms=2, core="#FFF4DC",
                  arm="#BFD4FF", pink="#FF9FD8", turns=1.25, glow_op=0.6, op=1.0):
    """Une galaxie spirale : bras logarithmiques en poussière d'étoiles, nœuds roses, bulbe doré, halo."""
    rnd = random.Random(seed)
    dots, knots = [], []
    for i in range(n):
        k = i % arms
        t = rnd.random() ** 0.8
        th = k * 2 * math.pi / arms + t * turns * 2 * math.pi + rnd.gauss(0, 0.28 * (1.1 - t))
        rr = r * (0.08 + 0.92 * t)
        x, y = rr * math.cos(th), rr * math.sin(th)
        x += rnd.gauss(0, r * 0.03)
        y += rnd.gauss(0, r * 0.03)
        dots.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.006 + rnd.random() ** 3 * r * 0.02)}" fill="{arm if rnd.random() < 0.7 else "#FFFFFF"}" opacity="{f(0.35 + 0.6 * (1 - t))}"/>')
        if rnd.random() < 0.05 and t > 0.3:
            knots.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.022)}" fill="{pink}" opacity="0.8"/>')
    halo = card.rgrad(name + "-h", [(0, core, 0.9 * glow_op), (0.18, core, 0.55 * glow_op), (0.5, arm, 0.18 * glow_op), (1, arm, 0)])
    bulge = card.rgrad(name + "-b", [(0, "#FFFFFF", 1), (0.35, core, 0.9), (1, core, 0)])
    inner = "".join(dots)
    return (
        f'<g opacity="{f(op)}" transform="translate({f(cx)} {f(cy)}) rotate({f(rot)}) scale(1 {f(tilt)})">'
        f'<circle r="{f(r * 1.15)}" fill="{halo}"/>'
        f'<g filter="{ublur(card, name + "-gb", 2.2)}" opacity="0.8">{inner}</g>{inner}{"".join(knots)}'
        f'<circle r="{f(r * 0.2)}" fill="{bulge}"/></g>'
    )


def elliptical(card, name, cx, cy, rx, ry, color="#FFE7C2", rot=0, op=0.9):
    g = card.rgrad(name, [(0, "#FFFFFF", op), (0.2, color, op * 0.7), (1, color, 0)])
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{g}" transform="rotate({f(rot)} {f(cx)} {f(cy)})"/>'


def globular(seed, cx, cy, r, n=160, color="#FFF1D6"):
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        a = rnd.uniform(0, 2 * math.pi)
        d = r * abs(rnd.gauss(0, 0.42))
        out.append(f'<circle cx="{f(cx + d * math.cos(a))}" cy="{f(cy + d * math.sin(a))}" r="{f(0.3 + rnd.random() ** 2 * 1.2)}" fill="{color}" opacity="{f(rnd.uniform(0.4, 1))}"/>')
    return "".join(out)


def galaxy_cluster(card, name, seed, cx, cy, r, n=9, colors=("#FFE2B8", "#CFE0FF", "#FFD0F0")):
    """Un amas de galaxies : quelques elliptiques et spirales minuscules, halo de gaz chaud."""
    rnd = random.Random(seed)
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.4)}" fill="{card.rgrad(name + "-gas", [(0, "#9FC8FF", 0.28), (1, "#9FC8FF", 0)])}"/>']
    for i in range(n):
        a = rnd.uniform(0, 2 * math.pi)
        d = r * rnd.random() ** 0.8
        x, y = cx + d * math.cos(a), cy + d * math.sin(a)
        s = rnd.uniform(1.5, 4.5)
        out.append(elliptical(card, f"{name}-e{i % 3}", x, y, s * rnd.uniform(1, 2), s, rnd.choice(colors), rnd.uniform(0, 180), 0.95))
    return "".join(out)


# ================================================================ trous noirs, quasars, supernovae

def black_hole(card, name, cx, cy, r, tilt=0.22, disk=3.3, hot="#FFF4D6", warm="#FFB65C", deep="#D2551E", rot=0, ring_op=1.0):
    """Un trou noir et son disque d'accrétion : l'ombre, l'anneau de photons, le disque vu par la tranche
    (le côté qui vient vers nous plus brillant) et sa face arrière que la gravité courbe en anneau."""
    R = r * disk
    lin = card.grad(name + "-lin", [(0, hot), (0.25, warm), (0.6, deep), (1, "#4A1406")], 0, 0, 1, 0)
    glow = card.rgrad(name + "-glow", [(0, warm, 0.55), (0.35, deep, 0.25), (1, deep, 0)])
    ring = card.rgrad(name + "-ring", [(0, hot, 0), (0.78, hot, 0), (0.86, hot, 0.95), (0.93, warm, 0.6), (1, deep, 0)])
    cid = card.id(name + "-front")
    card.def_once(name + "-front", f'<clipPath id="{cid}"><rect x="{f(cx - R * 1.3)}" y="{f(cy)}" width="{f(R * 2.6)}" height="{f(R)}"/></clipPath>')
    soft = ublur(card, name + "-sb", max(1.0, r * 0.12))
    softer = ublur(card, name + "-sb2", max(2.0, r * 0.35))
    disk_el = f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(R)}" ry="{f(R * tilt)}" fill="none" stroke="{lin}" stroke-width="{f(r * 0.55)}"/>'
    disk_in = f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(R * 0.72)}" ry="{f(R * 0.72 * tilt)}" fill="none" stroke="{hot}" stroke-width="{f(r * 0.18)}" opacity="0.9"/>'
    lens = (f'<ellipse cx="{f(cx)}" cy="{f(cy - r * 0.05)}" rx="{f(r * 1.32)}" ry="{f(r * 1.22)}" fill="none" stroke="{lin}" stroke-width="{f(r * 0.32)}" opacity="0.95"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.06)}" fill="none" stroke="{hot}" stroke-width="{f(max(0.8, r * 0.06))}"/>')
    tr = f' transform="rotate({f(rot)} {f(cx)} {f(cy)})"' if rot else ""
    return (
        f'<g{tr}><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R * 1.1)}" fill="{glow}"/>'
        f'<g filter="{softer}" opacity="0.8">{disk_el}</g><g filter="{soft}">{disk_el}{disk_in}</g>'
        f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.7)}" fill="{ring}" opacity="{f(ring_op)}"/>'
        f'<g filter="{soft}" opacity="{f(ring_op)}">{lens}</g>'
        f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="#000000"/>'
        f'<g clip-path="url(#{cid})"><g filter="{softer}" opacity="0.8">{disk_el}</g><g filter="{soft}">{disk_el}{disk_in}</g></g></g>'
    )


def jet(card, name, x, y, length, angle, width=10, color="#BFE6FF", core="#FFFFFF"):
    x2, y2 = pt(x, y, length, angle)
    lx, ly = pt(x2, y2, width, angle - 90)
    rx, ry = pt(x2, y2, width, angle + 90)
    g = card.def_once(name + "-jg", f'<linearGradient id="{card.id(name + "-jg")}" gradientUnits="userSpaceOnUse" x1="{f(x)}" y1="{f(y)}" x2="{f(x2)}" y2="{f(y2)}">'
                      f'<stop offset="0" stop-color="{core}" stop-opacity="1"/><stop offset="0.35" stop-color="{color}" stop-opacity="0.8"/><stop offset="1" stop-color="{color}" stop-opacity="0"/></linearGradient>')
    cone = f'<path d="M{f(x)} {f(y)} L{f(lx)} {f(ly)} L{f(rx)} {f(ry)} Z" fill="{g}"/>'
    beam = f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{g}" stroke-width="{f(max(1, width * 0.18))}" stroke-linecap="round"/>'
    return f'<g filter="{ublur(card, name + "-jb", width * 0.4)}">{cone}</g>{beam}'


def quasar(card, name, cx, cy, r, length, angle=-20, color="#BFE6FF", tilt=0.25):
    """Un quasar : un trou noir géant qui crache deux jets de lumière opposés."""
    return (jet(card, name + "-j1", cx, cy, length, angle, r * 1.2, color)
            + jet(card, name + "-j2", cx, cy, length * 0.85, angle + 180, r * 1.1, color)
            + black_hole(card, name + "-bh", cx, cy, r, tilt, 3.0, rot=angle, hot="#FFFFFF", warm="#BFE6FF", deep="#5A7CFF")
            + f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 2.2)}" fill="{card.rgrad(name + "-core", [(0, "#FFFFFF", 0.9), (0.3, color, 0.4), (1, color, 0)])}"/>')


def supernova(card, name, cx, cy, r, seed=31, c1="#FFE8A8", c2="#FF6A3D", c3="#7A3CFF", n=110):
    """Un reste de supernova : coquille de filaments déchirés autour d'un cœur éblouissant, vide entre les deux."""
    rnd = random.Random(seed)
    fil = []
    for _ in range(n):
        a = rnd.uniform(0, 360)
        r0 = r * rnd.uniform(0.55, 0.8)
        r1 = r * rnd.uniform(0.85, 1.05)
        x1, y1 = pt(cx, cy, r0, a)
        xm, ym = pt(cx, cy, (r0 + r1) / 2, a + rnd.uniform(-10, 10))
        x2, y2 = pt(cx, cy, r1, a + rnd.uniform(-6, 6))
        fil.append(f'<path d="M{f(x1)} {f(y1)} Q{f(xm)} {f(ym)} {f(x2)} {f(y2)}" stroke="{rnd.choice((c1, c2, c2, c3))}" stroke-width="{f(rnd.uniform(0.4, 1.4))}" fill="none" opacity="{f(rnd.uniform(0.3, 0.85))}" stroke-linecap="round"/>')
    shell = card.rgrad(name + "-sh", [(0, c1, 0.0), (0.45, c3, 0.0), (0.68, c3, 0.3), (0.86, c2, 0.6), (0.96, c1, 0.35), (1, c2, 0)])
    filt = noise_filter(card, name + "-nf", "0.045", 4, seed, 3.0, -0.8)
    core = card.rgrad(name + "-co", [(0, "#FFFFFF", 1), (0.12, c1, 0.8), (0.4, c3, 0.15), (1, c3, 0)])
    body = "".join(fil)
    return (f'<g style="mix-blend-mode:screen"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.08)}" fill="{shell}"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.05)}" fill="{shell}" filter="{filt}"/>'
            f'<g filter="{ublur(card, name + "-fb", 1.6)}">{body}</g>{body}'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.5)}" fill="{core}"/>'
            + sparkle(cx, cy, r * 0.32, "#FFFFFF", 0.95) + "</g>")


def eye_nebula(card, name, cx, cy, r, seed=7, iris=("#5FE3FF", "#2E7BFF"), rim=("#FF6A3D", "#FFB65C"), pupil="#000000"):
    """Une nébuleuse planétaire en forme d'œil : iris de gaz bleu, paupière rouge, étoile mourante au centre."""
    rnd = random.Random(seed)
    out = []
    g1 = card.rgrad(name + "-g1", [(0, "#FFFFFF", 0.0), (0.3, iris[0], 0.0), (0.45, iris[0], 0.75), (0.68, iris[1], 0.55), (0.82, rim[0], 0.7), (0.92, rim[1], 0.35), (1, rim[0], 0)])
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g1}"/>')
    filt = noise_filter(card, name + "-nf", "0.035", 4, seed, 2.6, -0.7)
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g1}" filter="{filt}"/>')
    rays = []
    for _ in range(120):
        a = rnd.uniform(0, 360)
        x1, y1 = pt(cx, cy, r * rnd.uniform(0.32, 0.45), a)
        x2, y2 = pt(cx, cy, r * rnd.uniform(0.62, 0.9), a)
        rays.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{rnd.choice((iris[0], "#FFFFFF", rim[1]))}" stroke-width="{f(rnd.uniform(0.3, 1.1))}" opacity="{f(rnd.uniform(0.2, 0.6))}"/>')
    out.append(f'<g style="mix-blend-mode:screen">{"".join(rays)}</g>')
    return "".join(out)


# ================================================================ toile cosmique

def cosmic_web(card, name, seed, region, n=26, k=3, color="#9FC8FF", node="#FFE2B8", keep=None, w=1.2, op=0.7):
    """La toile cosmique : des filaments de matière entre des nœuds où s'agglutinent les amas de galaxies."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    nodes = []
    tries = 0
    while len(nodes) < n and tries < n * 40:
        tries += 1
        p = (rnd.uniform(x0, x1), rnd.uniform(y0, y1))
        if keep and keep[0] < p[0] < keep[2] and keep[1] < p[1] < keep[3]:
            continue
        if all(math.dist(p, q) > 26 for q in nodes):
            nodes.append(p)
    edges = set()
    for i, p in enumerate(nodes):
        near = sorted(range(len(nodes)), key=lambda j: math.dist(p, nodes[j]))[1:k + 1]
        for j in near:
            edges.add((min(i, j), max(i, j)))
    fils = []
    for i, j in edges:
        (ax, ay), (bx, by) = nodes[i], nodes[j]
        mx, my = (ax + bx) / 2 + rnd.uniform(-12, 12), (ay + by) / 2 + rnd.uniform(-12, 12)
        if keep and keep[0] < mx < keep[2] and keep[1] < my < keep[3]:
            continue
        fils.append(f"M{f(ax)} {f(ay)} Q{f(mx)} {f(my)} {f(bx)} {f(by)}")
    d = " ".join(fils)
    dots = []
    for (x, y) in nodes:
        rr = rnd.uniform(2, 6)
        dots.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rr * 2.6)}" fill="{card.rgrad(name + "-n", [(0, node, 0.9), (0.4, node, 0.3), (1, node, 0)])}"/>'
                    + globular(rnd.randrange(999), x, y, rr * 1.2, 14, "#FFFFFF"))
    return (f'<g opacity="{f(op)}"><path d="{d}" fill="none" stroke="{color}" stroke-width="{f(w * 5)}" opacity="0.35" filter="{ublur(card, name + "-fb", 4)}"/>'
            f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(w)}" opacity="0.8"/>{"".join(dots)}</g>')


# ================================================================ l'infime : atomes, orbitales

def nucleus(seed, cx, cy, r, n=14, p="#FF5A6E", nn="#7FB2FF", hl="#FFFFFF"):
    """Un noyau atomique : protons et neutrons serrés, éclairés."""
    rnd = random.Random(seed)
    balls = []
    for i in range(n):
        a = rnd.uniform(0, 2 * math.pi)
        d = r * 0.62 * rnd.random() ** 0.6
        balls.append((cx + d * math.cos(a), cy + d * math.sin(a), rnd.random() < 0.5))
    balls.sort(key=lambda b: b[1])
    rb = r * 0.38
    out = []
    for x, y, isp in balls:
        col = p if isp else nn
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rb)}" fill="{col}" stroke="#1A0A14" stroke-width="0.5"/>'
                   f'<circle cx="{f(x - rb * 0.3)}" cy="{f(y - rb * 0.3)}" r="{f(rb * 0.35)}" fill="{hl}" opacity="0.55"/>')
    return "".join(out)


def atom(card, name, cx, cy, r, n_orbits=3, rot=20, color="#9FE8FF", electron="#FFFFFF", nucleus_seed=4, tilt=0.32, w=1.1, op=1.0):
    """Un atome de Bohr stylisé : noyau, orbites elliptiques, électrons lumineux."""
    out = [f'<g opacity="{f(op)}">', f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.2)}" fill="{card.rgrad(name + "-h", [(0, color, 0.3), (1, color, 0)])}"/>']
    els = []
    for k in range(n_orbits):
        a = rot + k * 180 / n_orbits
        out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r)}" ry="{f(r * tilt)}" fill="none" stroke="{color}" stroke-width="{f(w)}" opacity="0.85" transform="rotate({f(a)} {f(cx)} {f(cy)})"/>')
        t = math.radians(40 + k * 97)
        ex, ey = r * math.cos(t), r * tilt * math.sin(t)
        ra = math.radians(a)
        x, y = cx + ex * math.cos(ra) - ey * math.sin(ra), cy + ex * math.sin(ra) + ey * math.cos(ra)
        els.append(cstar(card, x, y, max(1.0, r * 0.045), electron, color, spikes=False, name=name + "-e"))
    out.append(f'<g filter="{ublur(card, name + "-ob", 2.2)}" opacity="0.6">' + "".join(
        f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r)}" ry="{f(r * tilt)}" fill="none" stroke="{color}" stroke-width="{f(w * 2.5)}" transform="rotate({f(rot + k * 180 / n_orbits)} {f(cx)} {f(cy)})"/>' for k in range(n_orbits)) + "</g>")
    out.append(nucleus(nucleus_seed, cx, cy, r * 0.2))
    out.extend(els)
    out.append("</g>")
    return "".join(out)


def orbital(card, name, cx, cy, size, kind="p", rot=0, c1="#7CF7FF", c2="#B07CFF", op=0.85):
    """Une orbitale électronique : nuage de probabilité en lobes (s, p, d)."""
    g = card.def_once(name + "-g", f'<radialGradient id="{card.id(name + "-g")}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="{f(size * 1.15)}">'
                      f'<stop offset="0" stop-color="#FFFFFF" stop-opacity="{op}"/><stop offset="0.35" stop-color="{c1}" stop-opacity="{op}"/>'
                      f'<stop offset="0.75" stop-color="{c2}" stop-opacity="{op * 0.6}"/><stop offset="1" stop-color="{c2}" stop-opacity="0"/></radialGradient>')
    lobes = []
    if kind == "s":
        lobes.append(f'<circle cx="0" cy="0" r="{f(size)}" fill="{g}"/>')
    else:
        n = 2 if kind == "p" else 4
        for k in range(n):
            a = k * 360 / n
            lobes.append(f'<g transform="rotate({f(a)})"><path d="M0 0 C{f(size * 0.55)} {f(-size * 0.25)} {f(size * 1.05)} {f(-size * 0.42)} {f(size * 1.1)} 0 '
                         f'C{f(size * 1.05)} {f(size * 0.42)} {f(size * 0.55)} {f(size * 0.25)} 0 0 Z" fill="{g}"/></g>')
        if kind == "dz":
            lobes.append(f'<ellipse cx="0" cy="0" rx="{f(size * 0.55)}" ry="{f(size * 0.2)}" fill="none" stroke="{c1}" stroke-width="{f(size * 0.12)}" opacity="0.6" transform="rotate(90)"/>')
    body = "".join(lobes)
    return (f'<g transform="translate({f(cx)} {f(cy)}) rotate({f(rot)})" style="mix-blend-mode:screen">'
            f'<g filter="{ublur(card, name + "-b", size * 0.08)}">{body}</g>'
            f'<circle r="{f(size * 0.06)}" fill="#FFFFFF"/></g>')


# ================================================================ l'infime : la vie

def dna(card, name, x0, y0, x1, y1, turns=3.5, amp=14, w=2.4, c1="#7CF7FF", c2="#FF8FD0", rungs=("#FFE27A", "#4DFFB4", "#FF6FC8", "#7CB8FF"), seed=2, op=1.0):
    """La double hélice d'ADN : deux brins en torsade, barreaux de paires de bases, profondeur avant/arrière."""
    rnd = random.Random(seed)
    L = math.dist((x0, y0), (x1, y1))
    ang = math.degrees(math.atan2(y1 - y0, x1 - x0))
    steps = 160
    a_pts, b_pts, depth_a = [], [], []
    for i in range(steps + 1):
        t = i / steps
        ph = 2 * math.pi * turns * t
        a_pts.append((L * t, amp * math.sin(ph)))
        b_pts.append((L * t, amp * math.sin(ph + math.pi)))
        depth_a.append(math.cos(ph))
    rungs_svg = []
    nr = int(turns * 10)
    for k in range(nr + 1):
        t = k / nr
        ph = 2 * math.pi * turns * t
        ya, yb = amp * math.sin(ph), amp * math.sin(ph + math.pi)
        x = L * t
        col = rnd.choice(rungs)
        o = 0.45 + 0.4 * abs(math.cos(ph))
        rungs_svg.append(f'<line x1="{f(x)}" y1="{f(ya)}" x2="{f(x)}" y2="{f((ya + yb) / 2)}" stroke="{col}" stroke-width="{f(w * 0.7)}" opacity="{f(o)}"/>'
                         f'<line x1="{f(x)}" y1="{f((ya + yb) / 2)}" x2="{f(x)}" y2="{f(yb)}" stroke="{rnd.choice(rungs)}" stroke-width="{f(w * 0.7)}" opacity="{f(o)}"/>')

    def segs(pts, front):
        out = []
        for i in range(steps):
            d = depth_a[i] if pts is a_pts else -depth_a[i]
            if (d >= 0) == front:
                (xa, ya), (xb, yb) = pts[i], pts[i + 1]
                out.append(f"M{f(xa)} {f(ya)} L{f(xb)} {f(yb)}")
        return " ".join(out)

    back = (f'<path d="{segs(a_pts, False)}" stroke="{c1}" stroke-width="{f(w * 0.8)}" opacity="0.45" stroke-linecap="round" fill="none"/>'
            f'<path d="{segs(b_pts, False)}" stroke="{c2}" stroke-width="{f(w * 0.8)}" opacity="0.45" stroke-linecap="round" fill="none"/>')
    front = (f'<path d="{segs(a_pts, True)}" stroke="{c1}" stroke-width="{f(w)}" stroke-linecap="round" fill="none"/>'
             f'<path d="{segs(b_pts, True)}" stroke="{c2}" stroke-width="{f(w)}" stroke-linecap="round" fill="none"/>')
    body = back + "".join(rungs_svg) + front
    return (f'<g opacity="{f(op)}" transform="translate({f(x0)} {f(y0)}) rotate({f(ang)})">'
            f'<g filter="{ublur(card, name + "-b", 3)}" opacity="0.7">{front}</g>{body}</g>')


def neuron(card, name, seed, x, y, size, color="#9FE8FF", soma="#FFFFFF", axon_angle=180, axon_len=None, dendrites=6, w=3.2, glow=True):
    """Un neurone : corps cellulaire, arborisation de dendrites, axone et ses boutons synaptiques."""
    from motifs import grow
    rnd = random.Random(seed)
    out, tips = [], []
    for k in range(dendrites):
        a = axon_angle + 180 + (k - (dendrites - 1) / 2) * (300 / dendrites) + rnd.uniform(-12, 12)
        grow(rnd, x, y, a, size * rnd.uniform(0.28, 0.42), w * rnd.uniform(0.8, 1.1), 3, spread=38, decay=0.7, wdecay=0.62, bend=18, out=out, tips=tips, min_w=0.45)
    L = axon_len or size * 1.1
    pts = [(x, y)]
    for i in range(1, 6):
        px, py = pt(x, y, L * i / 5, axon_angle + math.sin(i * 1.3 + seed) * 8)
        pts.append((px, py))
    out.append(ribbon(pts, w * 0.75, w * 0.45, n=30))
    ex, ey = pts[-1]
    term_tips = []
    for k in range(4):
        grow(rnd, ex, ey, axon_angle + (k - 1.5) * 26, size * 0.14, w * 0.4, 1, spread=30, out=out, tips=term_tips, min_w=0.3)
    d = " ".join(out)
    sg = card.rgrad(name + "-s", [(0, soma, 1), (0.45, color, 0.95), (1, color, 0.0)])
    bout = "".join(f'<circle cx="{f(tx)}" cy="{f(ty)}" r="{f(w * 0.75)}" fill="{soma}"/>' for tx, ty, _ in term_tips)
    sparks = "".join(f'<circle cx="{f(tx)}" cy="{f(ty)}" r="{f(w * 0.45)}" fill="{color}" opacity="0.9"/>' for tx, ty, _ in tips[::3])
    g = f'<g filter="{ublur(card, name + "-g", 3.5)}" opacity="0.75"><path d="{d}" fill="{color}"/></g>' if glow else ""
    return (f'{g}<path d="{d}" fill="{color}" opacity="0.92"/>{sparks}{bout}'
            f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(w * 3.2)}" fill="{sg}"/>'
            f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(w * 1.1)}" fill="{soma}"/>')


def cell(card, name, cx, cy, r, seed=3, membrane="#7CF7FF", plasm="#1A6B8A", nucleus_c="#B07CFF", mito="#FF8FB8", op=0.95):
    """Une cellule : membrane double, cytoplasme translucide, noyau et nucléole, mitochondries, réticulum."""
    rnd = random.Random(seed)
    pts = []
    for i in range(24):
        a = 2 * math.pi * i / 24
        rr = r * (1 + 0.05 * math.sin(3 * a + seed) + 0.03 * math.sin(7 * a))
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d = smooth(pts, closed=True)
    g = card.rgrad(name + "-p", [(0, plasm, 0.25), (0.8, plasm, 0.45), (1, membrane, 0.6)])
    out = [f'<g opacity="{f(op)}"><path d="{d}" fill="{g}"/>',
           f'<path d="{d}" fill="none" stroke="{membrane}" stroke-width="2.2"/>',
           f'<path d="{d}" fill="none" stroke="{membrane}" stroke-width="7" opacity="0.18" filter="{ublur(card, name + "-mb", 3)}"/>']
    nx, ny = cx + r * 0.12, cy - r * 0.05
    out.append(f'<circle cx="{f(nx)}" cy="{f(ny)}" r="{f(r * 0.36)}" fill="{card.rgrad(name + "-n", [(0, nucleus_c, 0.5), (0.85, nucleus_c, 0.7), (1, "#FFFFFF", 0.9)])}" stroke="{nucleus_c}" stroke-width="1.2"/>')
    out.append(f'<circle cx="{f(nx + r * 0.08)}" cy="{f(ny - r * 0.06)}" r="{f(r * 0.1)}" fill="{nucleus_c}" opacity="0.95"/>')
    for k in range(4):
        a = rnd.uniform(0, 360)
        mx, my = pt(cx, cy, r * rnd.uniform(0.55, 0.75), a)
        out.append(f'<g transform="translate({f(mx)} {f(my)}) rotate({f(a + 90)})"><ellipse rx="{f(r * 0.16)}" ry="{f(r * 0.07)}" fill="{mito}" opacity="0.85"/>'
                   f'<path d="M{f(-r * 0.11)} 0 q{f(r * 0.03)} {f(-r * 0.05)} {f(r * 0.05)} 0 t{f(r * 0.05)} 0 t{f(r * 0.05)} 0 t{f(r * 0.05)} 0" fill="none" stroke="#FFFFFF" stroke-width="0.8" opacity="0.8"/></g>')
    for k in range(3):
        a = rnd.uniform(0, 360)
        ex, ey = pt(nx, ny, r * 0.46, a)
        out.append(f'<path d="M{f(ex)} {f(ey)} q{f(r * 0.1)} {f(r * 0.08)} {f(r * 0.2)} 0 t{f(r * 0.2)} 0" fill="none" stroke="{membrane}" stroke-width="1" opacity="0.6" transform="rotate({f(a)} {f(ex)} {f(ey)})"/>')
    for _ in range(14):
        a = rnd.uniform(0, 360)
        px, py = pt(cx, cy, r * rnd.uniform(0.2, 0.85), a)
        out.append(f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(rnd.uniform(0.6, 1.6))}" fill="#FFFFFF" opacity="0.6"/>')
    out.append("</g>")
    return "".join(out)


def pollen(card, name, cx, cy, r, seed=5, c1="#FFE27A", c2="#C98A1E", op=1.0):
    """Un grain de pollen de frêne vu au microscope : sphère réticulée à trois sillons (tricolpé)."""
    rnd = random.Random(seed)
    g = card.rgrad(name + "-g", [(0, "#FFFFFF", 1), (0.35, c1, 1), (1, c2, 1)], 0.38, 0.32, 0.75)
    cid = card.id(name + "-c")
    card.def_once(name + "-c", f'<clipPath id="{cid}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}"/></clipPath>')
    net = []
    step = r * 0.24
    for i in range(-6, 7):
        for j in range(-6, 7):
            x = cx + i * step + (j % 2) * step / 2
            y = cy + j * step * 0.87
            dx, dy = (x - cx) / r, (y - cy) / r
            if dx * dx + dy * dy > 1.1:
                continue
            k = 1 - 0.45 * (dx * dx + dy * dy)
            net.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(step * 0.36 * k)}" fill="{c2}" opacity="0.55"/>')
    furrows = "".join(
        f'<path d="M{f(cx + r * 0.9 * math.cos(a) * 0.2)} {f(cy - r * 0.95)} Q{f(cx + r * 0.9 * math.cos(a))} {f(cy)} {f(cx + r * 0.9 * math.cos(a) * 0.2)} {f(cy + r * 0.95)}" '
        f'fill="none" stroke="#5A3A0A" stroke-width="{f(r * 0.08)}" opacity="0.6" stroke-linecap="round"/>' for a in (0.4, 2.4, 4.4))
    return (f'<g opacity="{f(op)}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.5)}" fill="{card.rgrad(name + "-h", [(0, c1, 0.45), (1, c1, 0)])}"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/>'
            f'<g clip-path="url(#{cid})">{"".join(net)}{furrows}<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{card.rgrad(name + "-sh", [(0.6, "#000000", 0), (1, "#000000", 0.45)], 0.42, 0.4, 0.62)}"/></g>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="#FFF4C2" stroke-width="0.8" opacity="0.7"/></g>')


def samara(card, x, y, s=1.0, rot=0, wing="#E8D9A8", seed_c="#8A6A2A", vein="#7A5A1E", op=1.0, name="sam"):
    """La samare du frêne : la graine ailée qui tournoie en tombant."""
    d = "M0 0 C6 -6 9 -22 8 -46 C7 -62 4 -76 0 -82 C-4 -76 -7 -62 -7 -46 C-8 -22 -5 -6 0 0 Z"
    g = card.grad(name + "-w", [(0, wing), (1, "#B8A06A")], 0, 0, 1, 0)
    return (f'<g transform="translate({f(x)} {f(y)}) rotate({f(rot)}) scale({f(s)})" opacity="{f(op)}">'
            f'<path d="{d}" fill="{g}" stroke="{vein}" stroke-width="0.7"/>'
            f'<path d="M0 -4 L0 -78 M0 -30 L5 -44 M0 -30 L-5 -44 M0 -52 L4 -64 M0 -52 L-4 -64" stroke="{vein}" stroke-width="0.5" opacity="0.7"/>'
            f'<ellipse cx="0" cy="-10" rx="3.6" ry="10" fill="{seed_c}"/></g>')


# ================================================================ l'infime : glace et géométrie

def dendrite(cx, cy, r, color, w=1.4, depth=3, op=1.0, branch=(0.32, 0.55, 0.78), blen=0.34, rot=0):
    """Un flocon dendritique fractal : six bras, chaque bras porte des branches qui en portent d'autres."""
    segs = []

    def arm(x, y, length, ang, lvl, width):
        x2, y2 = pt(x, y, length, ang)
        segs.append((x, y, x2, y2, width))
        if lvl <= 0 or length < 3:
            return
        for fr in branch:
            bx, by = pt(x, y, length * fr, ang)
            bl = length * blen * (1.15 - fr * 0.6)
            for sgn in (-1, 1):
                arm(bx, by, bl, ang + sgn * 60, lvl - 1, width * 0.65)

    for k in range(6):
        arm(cx, cy, r, rot + k * 60, depth, w)
    out = [f'<g opacity="{f(op)}" stroke="{color}" stroke-linecap="round" fill="none">']
    for wbin in sorted(set(round(s[4], 2) for s in segs), reverse=True):
        d = " ".join(f"M{f(a)} {f(b)} L{f(c)} {f(e)}" for a, b, c, e, ww in segs if round(ww, 2) == wbin)
        out.append(f'<path d="{d}" stroke-width="{f(wbin)}"/>')
    out.append("</g>")
    return "".join(out)


def plate_crystal(cx, cy, r, color="#E8F7FF", rot=0, op=0.9, w=1.0):
    """Un cristal de glace en plaquette hexagonale, avec ses facettes intérieures."""
    hexo = " L".join(f"{f(x)} {f(y)}" for x, y in (pt(cx, cy, r, rot + 30 + k * 60) for k in range(6)))
    hexi = " L".join(f"{f(x)} {f(y)}" for x, y in (pt(cx, cy, r * 0.58, rot + 30 + k * 60) for k in range(6)))
    spokes = " ".join(f"M{f(x1)} {f(y1)} L{f(x2)} {f(y2)}" for x1, y1, x2, y2 in
                      (pt(cx, cy, r * 0.58, rot + 30 + k * 60) + pt(cx, cy, r, rot + 30 + k * 60) for k in range(6)))
    return (f'<g opacity="{f(op)}"><path d="M{hexo} Z" fill="{color}" fill-opacity="0.12" stroke="{color}" stroke-width="{f(w)}"/>'
            f'<path d="M{hexi} Z" fill="none" stroke="{color}" stroke-width="{f(w * 0.7)}" opacity="0.8"/>'
            f'<path d="{spokes}" stroke="{color}" stroke-width="{f(w * 0.6)}" opacity="0.7"/></g>')


def ice_lattice(card, name, cx, cy, r, cell_r=9, rot=0, o_col="#FF6A6A", h_col="#FFFFFF", bond="#9FE8FF", op=0.95):
    """La maille de la glace : molécules d'eau en anneaux hexagonaux reliées par liaisons hydrogène
    (c'est elle qui donne aux flocons leurs six branches)."""
    pts = set()
    out_b, out_m = [], []
    rng = int(r / cell_r) + 2
    a = cell_r
    for i in range(-rng, rng + 1):
        for j in range(-rng, rng + 1):
            hx = cx + a * math.sqrt(3) * (i + j / 2)
            hy = cy + a * 1.5 * j
            for k in range(6):
                vx, vy = pt(hx, hy, a, rot + k * 60)
                if math.dist((vx, vy), (cx, cy)) < r:
                    pts.add((round(vx, 1), round(vy, 1)))
    pts = sorted(pts)
    for p in pts:
        for q in pts:
            if p < q and abs(math.dist(p, q) - a) < 0.6:
                fade = 1 - math.dist(((p[0] + q[0]) / 2, (p[1] + q[1]) / 2), (cx, cy)) / r
                out_b.append(f'<line x1="{f(p[0])}" y1="{f(p[1])}" x2="{f(q[0])}" y2="{f(q[1])}" stroke="{bond}" stroke-width="0.8" stroke-dasharray="1.6 1.6" opacity="{f(0.3 + 0.6 * fade)}"/>')
    for k, (x, y) in enumerate(pts):
        fade = 1 - math.dist((x, y), (cx, cy)) / r
        ang = rot + (k * 47) % 360
        h1 = pt(x, y, a * 0.32, ang)
        h2 = pt(x, y, a * 0.32, ang + 104.5)
        out_m.append(f'<g opacity="{f(0.35 + 0.65 * fade)}"><circle cx="{f(h1[0])}" cy="{f(h1[1])}" r="{f(a * 0.14)}" fill="{h_col}"/>'
                     f'<circle cx="{f(h2[0])}" cy="{f(h2[1])}" r="{f(a * 0.14)}" fill="{h_col}"/>'
                     f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(a * 0.24)}" fill="{o_col}"/>'
                     f'<circle cx="{f(x - a * 0.07)}" cy="{f(y - a * 0.07)}" r="{f(a * 0.08)}" fill="#FFFFFF" opacity="0.6"/></g>')
    return f'<g opacity="{f(op)}">{"".join(out_b)}{"".join(out_m)}</g>'


def hex_geometry(cx, cy, r, color, w=0.8, op=0.7, rings=2, rot=0):
    """Géométrie de la glace : cercles entrelacés en maille hexagonale (fleur de cristal)."""
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}"/>']
    for ring in range(1, rings + 1):
        for k in range(6 * ring):
            side, pos = divmod(k, ring)
            a0 = rot + side * 60
            x0, y0 = pt(cx, cy, r * ring, a0)
            x1, y1 = pt(cx, cy, r * ring, a0 + 60)
            t = pos / ring
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * (rings + 1))}"/>')
    return f'<g fill="none" stroke="{color}" stroke-width="{f(w)}" opacity="{f(op)}">{"".join(out)}</g>'


# ================================================================ l'infime : quantique

def wave_packet(x0, y0, x1, y1, amp, cycles, color, w=1.2, op=0.9, sigma=0.22, phase=0.0):
    """Un paquet d'onde : une sinusoïde sous enveloppe gaussienne (la particule-onde)."""
    L = math.dist((x0, y0), (x1, y1))
    ang = math.degrees(math.atan2(y1 - y0, x1 - x0))
    pts = []
    for i in range(161):
        t = i / 160
        env = math.exp(-((t - 0.5) ** 2) / (2 * sigma ** 2))
        pts.append((L * t, amp * env * math.sin(2 * math.pi * cycles * t + phase)))
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts)
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(w)}" opacity="{f(op)}" transform="translate({f(x0)} {f(y0)}) rotate({f(ang)})"/>'


def interference(cx, cy, r, n, step, color, w=1.0, op=0.5, sep=18, rot=0):
    """Deux sources, deux familles d'ondes concentriques : les franges de l'interférence."""
    out = []
    for s in (-1, 1):
        sx, sy = pt(cx, cy, sep / 2, rot + 90 * s)
        for k in range(1, n + 1):
            rr = k * step
            if rr > r:
                break
            out.append(f'<circle cx="{f(sx)}" cy="{f(sy)}" r="{f(rr)}" opacity="{f(op * (1 - rr / r) ** 0.6)}"/>')
    return f'<g fill="none" stroke="{color}" stroke-width="{f(w)}">{"".join(out)}</g>'


def particle_tracks(card, name, seed, cx, cy, r, n=10, colors=("#7CF7FF", "#FF8FD0", "#FFE27A", "#4DFFB4"), w=1.0, op=0.85):
    """Traces de particules dans une chambre à bulles : spirales qui s'enroulent, droites, vertex en V."""
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        a = rnd.uniform(0, 360)
        kind = rnd.random()
        col = rnd.choice(colors)
        if kind < 0.55:
            sgn = rnd.choice((-1, 1))
            L = rnd.uniform(0.5, 1.0) * r
            pts = []
            ang = a
            x, y = cx, cy
            curv = rnd.uniform(1.5, 4.5)
            step = L / 60
            for k in range(140):
                pts.append((x, y))
                ang += sgn * curv * (1 + k * 0.035)
                x, y = pt(x, y, step * max(0.15, 1 - k / 150), ang)
            out.append(f'<path d="M{" L".join(f"{f(px)} {f(py)}" for px, py in pts)}" fill="none" stroke="{col}" stroke-width="{f(w)}" opacity="{f(op)}" stroke-linecap="round"/>')
        elif kind < 0.85:
            x2, y2 = pt(cx, cy, r * rnd.uniform(0.6, 1.0), a)
            out.append(f'<path d="M{f(cx)} {f(cy)} Q{f((cx + x2) / 2 + rnd.uniform(-8, 8))} {f((cy + y2) / 2 + rnd.uniform(-8, 8))} {f(x2)} {f(y2)}" fill="none" stroke="{col}" stroke-width="{f(w * 0.8)}" opacity="{f(op * 0.8)}"/>')
        else:
            vx, vy = pt(cx, cy, r * rnd.uniform(0.3, 0.6), a)
            for s in (-1, 1):
                x2, y2 = pt(vx, vy, r * rnd.uniform(0.25, 0.45), a + s * rnd.uniform(14, 28))
                out.append(f'<line x1="{f(vx)}" y1="{f(vy)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{col}" stroke-width="{f(w * 0.8)}" opacity="{f(op)}"/>')
    body = "".join(out)
    return (f'<g style="mix-blend-mode:screen"><g filter="{ublur(card, name + "-b", 1.8)}" opacity="0.8">{body}</g>{body}'
            + cstar(card, cx, cy, 1.6, "#FFFFFF", colors[0], name=name + "-v") + "</g>")


def quantum_foam(card, name, seed, region, n=60, colors=("#7CF7FF", "#B07CFF", "#FF8FD0"), rmax=9, keep=None, op=0.7):
    """La mousse quantique : à l'échelle de Planck, l'espace-temps bouillonne de bulles."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if keep and keep[0] < x < keep[2] and keep[1] < y < keep[3]:
            continue
        rr = rmax * rnd.random() ** 1.6 + 1.2
        col = rnd.choice(colors)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rr)}" fill="{col}" fill-opacity="0.08" stroke="{col}" stroke-width="0.7" opacity="{f(rnd.uniform(0.4, 1) * op)}"/>'
                   f'<circle cx="{f(x - rr * 0.35)}" cy="{f(y - rr * 0.35)}" r="{f(rr * 0.18)}" fill="#FFFFFF" opacity="{f(0.5 * op)}"/>')
    return f'<g>{"".join(out)}</g>'


def string_loop(cx, cy, r, k, amp, color, w=1.2, rot=0, op=0.9):
    """Une corde fermée qui vibre (mode k)."""
    pts = []
    for i in range(121):
        th = 2 * math.pi * i / 120
        rr = r + amp * math.sin(k * th + rot)
        pts.append((cx + rr * math.cos(th), cy + rr * math.sin(th)))
    return f'<path d="M{" L".join(f"{f(x)} {f(y)}" for x, y in pts)} Z" fill="none" stroke="{color}" stroke-width="{f(w)}" opacity="{f(op)}"/>'


def open_string(x0, y0, x1, y1, amp, k, color, w=1.2, op=0.9):
    """Une corde ouverte qui vibre entre deux points (mode k), avec son fuseau."""
    L = math.dist((x0, y0), (x1, y1))
    ang = math.degrees(math.atan2(y1 - y0, x1 - x0))
    a = "M" + " L".join(f"{f(L * i / 80)} {f(amp * math.sin(math.pi * k * i / 80))}" for i in range(81))
    b = "M" + " L".join(f"{f(L * i / 80)} {f(-amp * math.sin(math.pi * k * i / 80))}" for i in range(81))
    return (f'<g transform="translate({f(x0)} {f(y0)}) rotate({f(ang)})" fill="none" stroke="{color}">'
            f'<path d="{a}" stroke-width="{f(w)}" opacity="{f(op)}"/><path d="{b}" stroke-width="{f(w * 0.6)}" opacity="{f(op * 0.45)}"/></g>')


# ================================================================ le Bifröst

SPECTRUM = ("#FF4F6E", "#FF9A3D", "#FFE45C", "#4DFFB4", "#4FC3FF", "#6E7BFF", "#B07CFF")


def bifrost_arc(card, name, cx, cy, r, width, a0=-90, a1=90, colors=SPECTRUM, op=0.85, aurora_tex=True):
    """Le pont arc-en-ciel : bandes spectrales concentriques, voile d'aurore, frange d'étoiles."""
    n = len(colors)
    out = []
    band_w = width / n
    for i, col in enumerate(colors):
        rr = r + width / 2 - band_w * (i + 0.5)
        xa, ya = pt(cx, cy, rr, a0)
        xb, yb = pt(cx, cy, rr, a1)
        large = 1 if (a1 - a0) > 180 else 0
        out.append(f'<path d="M{f(xa)} {f(ya)} A{f(rr)} {f(rr)} 0 {large} 1 {f(xb)} {f(yb)}" fill="none" stroke="{col}" stroke-width="{f(band_w + 0.6)}"/>')
    body = "".join(out)
    res = [f'<g style="mix-blend-mode:screen" opacity="{f(op)}">',
           f'<g filter="{ublur(card, name + "-gb", width * 0.45)}" opacity="0.7">{body}</g>',
           f'<g filter="{ublur(card, name + "-sb", 1.2)}">{body}</g>']
    if aurora_tex:
        tex = noise_filter(card, name + "-tx", "0.008 0.06", 3, 7, 2.6, -0.6)
        res.append(f'<g filter="{tex}" opacity="0.6">{body}</g>')
    res.append("</g>")
    return "".join(res)


def light_beam(card, name, x0, y0, x1, y1, w, color="#FFFFFF", op=0.9):
    return (f'<line x1="{f(x0)}" y1="{f(y0)}" x2="{f(x1)}" y2="{f(y1)}" stroke="{color}" stroke-width="{f(w * 4)}" opacity="{f(op * 0.35)}" filter="{ublur(card, name + "-b", w * 2)}"/>'
            f'<line x1="{f(x0)}" y1="{f(y0)}" x2="{f(x1)}" y2="{f(y1)}" stroke="{color}" stroke-width="{f(w)}" opacity="{f(op)}"/>')


def ice_prism(card, name, cx, cy, s, rot=0):
    """Un prisme de glace taillé (triangle de cristal à facettes)."""
    p1, p2, p3 = pt(cx, cy, s, rot), pt(cx, cy, s, rot + 120), pt(cx, cy, s, rot + 240)
    g = card.grad(name + "-g", [(0, "#FFFFFF"), (0.5, "#BFE8FF"), (1, "#5FA8D8")], 0, 0, 1, 1)
    return (f'<path d="M{f(p1[0])} {f(p1[1])} L{f(p2[0])} {f(p2[1])} L{f(p3[0])} {f(p3[1])} Z" fill="{g}" opacity="0.75" stroke="#FFFFFF" stroke-width="1.2"/>'
            f'<path d="M{f(p1[0])} {f(p1[1])} L{f(cx)} {f(cy)} L{f(p2[0])} {f(p2[1])} M{f(cx)} {f(cy)} L{f(p3[0])} {f(p3[1])}" stroke="#FFFFFF" stroke-width="0.7" opacity="0.6" fill="none"/>')


def corona_soft(card, name, cx, cy, r0, r1, n=160, colors=("#4DFFB4", "#B07CFF"), seed=4, a0=0, a1=360, op=(0.15, 0.6), w=(0.6, 2.4)):
    """La couronne boréale : des rayons fins qui convergent au zénith, verts à la base, violets en haut."""
    rnd = random.Random(seed)
    g = card.def_once(name + "-g", f'<radialGradient id="{card.id(name + "-g")}" gradientUnits="userSpaceOnUse" cx="{f(cx)}" cy="{f(cy)}" r="{f(r1)}">'
                      f'<stop offset="0" stop-color="{colors[1]}" stop-opacity="0"/><stop offset="{f(r0 / r1)}" stop-color="{colors[1]}" stop-opacity="0.35"/>'
                      f'<stop offset="0.45" stop-color="{colors[0]}" stop-opacity="0.9"/><stop offset="0.8" stop-color="{colors[0]}" stop-opacity="0.35"/>'
                      f'<stop offset="1" stop-color="{colors[0]}" stop-opacity="0"/></radialGradient>')
    out = []
    for i in range(n):
        a = a0 + (a1 - a0) * (i + rnd.uniform(-0.5, 0.5)) / n
        rr0 = r0 * rnd.uniform(0.8, 1.6)
        rr1 = r1 * rnd.uniform(0.5, 1.0)
        x1, y1 = pt(cx, cy, rr0, a)
        x2, y2 = pt(cx, cy, rr1, a)
        out.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{g}" stroke-width="{f(rnd.uniform(*w))}" opacity="{f(rnd.uniform(*op))}" stroke-linecap="round"/>')
    body = "".join(out)
    return (f'<g style="mix-blend-mode:screen"><g filter="{ublur(card, name + "-b1", 6)}">{body}</g>'
            f'<g filter="{ublur(card, name + "-b2", 0.7)}">{body}</g></g>')


def mini_galaxy(card, name, cx, cy, r, tilt=0.5, rot=0, arm="#BFD4FF", core="#FFF4DC", pink="#FF9FD8", seed=1, turns=1.1, op=1.0):
    """Une petite galaxie lisible de loin : deux bras effilés lumineux, un bulbe, quelques nœuds roses."""
    rnd = random.Random(seed)
    arms = []
    for k in range(2):
        pts = []
        for i in range(30):
            t = i / 29
            th = k * math.pi + t * turns * 2 * math.pi
            rr = r * (0.1 + 0.9 * t)
            pts.append((rr * math.cos(th), rr * math.sin(th)))
        arms.append(ribbon(pts, r * 0.34, r * 0.04, n=40))
    d = " ".join(arms)
    knots = "".join(f'<circle cx="{f(r * rnd.uniform(-0.8, 0.8))}" cy="{f(r * rnd.uniform(-0.8, 0.8))}" r="{f(r * 0.05)}" fill="{pink}" opacity="0.9"/>' for _ in range(5))
    bulge = card.rgrad(name + "-b", [(0, "#FFFFFF", 1), (0.3, core, 0.9), (1, core, 0)])
    halo = card.rgrad(name + "-h", [(0, arm, 0.5), (1, arm, 0)])
    return (f'<g opacity="{f(op)}" transform="translate({f(cx)} {f(cy)}) rotate({f(rot)}) scale(1 {f(tilt)})">'
            f'<circle r="{f(r * 1.3)}" fill="{halo}"/>'
            f'<path d="{d}" fill="{arm}" opacity="0.8" filter="{ublur(card, name + "-g", max(1.0, r * 0.12))}"/>'
            f'<path d="{d}" fill="{arm}" opacity="0.55"/>{knots}'
            f'<circle r="{f(r * 0.32)}" fill="{bulge}"/></g>')
