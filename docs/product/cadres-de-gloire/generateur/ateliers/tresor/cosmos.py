"""Atelier « Trésor » — le sommet cosmique : la galaxie dont la Meesh est le cœur, et les deux échelles de loupes
(l'infiniment grand : toile cosmique, galaxie, Soleil, Terre ; l'infiniment petit : lingot, cristal d'or, atome d'or, noyau)."""

import math
import random

from kit import W, H, f, pt, lg, rg, metal_lin, bevel, soft, halo, GOLD_RICH, SANS, CINZEL
from base import galaxy


# ---------------------------------------------------------------- le ciel profond

def deep_space(card, key, seed=7):
    """Un ciel profond : dégradé indigo-violet, voiles de nébuleuse, champ d'étoiles dense et étoiles colorées."""
    out = [f'<rect width="{W}" height="{H}" fill="{lg(card, key, [(0, "#05030F"), (0.35, "#0E0A2C"), (0.7, "#1A0F3A"), (1, "#07051A")])}"/>']
    clouds = [(120, 300, 260, 160, "#6A2AC8", 0.30), (430, 220, 240, 150, "#2A5AD8", 0.26), (300, 560, 320, 200, "#B0306A", 0.16),
              (80, 640, 200, 160, "#2A7AC8", 0.18), (470, 600, 200, 180, "#7A2AC8", 0.22), (270, 120, 300, 140, "#E8A040", 0.22)]
    for k, (cx, cy, rx, ry, col, op) in enumerate(clouds):
        out.append(halo(card, f"{key}-n{k}", cx, cy, rx, ry, col, op, 0.35))
    rnd = random.Random(seed)
    st = []
    for _ in range(520):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        r = rnd.uniform(0.25, 1.2) if rnd.random() < 0.92 else rnd.uniform(1.2, 2.0)
        col = rnd.choice(("#FFFFFF", "#FFFFFF", "#FFFFFF", "#CFE0FF", "#FFE8C8", "#FFD0E8"))
        st.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{col}" opacity="{f(rnd.uniform(0.3, 1))}"/>')
    out.append("".join(st))
    return "".join(out)


def golden_galaxy(card, cx, cy, r, key="gx", tilt=0.36, rot=0.4, seed=11):
    """La galaxie spirale vue de trois quarts : bras de poussière d'or, de rose et de bleu, voile, bulbe."""
    out = [halo(card, key + "-disc", cx, cy, r * 1.05, r * tilt * 1.25, "#C88AFF", 0.25, 0.45)]
    out.append(halo(card, key + "-bulge", cx, cy, r * 0.42, r * 0.42 * tilt * 1.6, "#FFD27A", 0.75, 0.3))
    arms = []
    rnd = random.Random(seed)
    for i in range(3):
        a0 = rot + i * 2 * math.pi / 3
        pts = []
        for k in range(40):
            t = k / 39
            ang = a0 + t * 3.6
            rr = r * (0.12 + 0.9 * t)
            pts.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang) * tilt))
        d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts)
        arms.append(f'<path d="{d}" fill="none" stroke="#FFC2E8" stroke-width="{f(r * 0.12)}" stroke-linecap="round" opacity="0.18"/>')
        arms.append(f'<path d="{d}" fill="none" stroke="#FFE2A8" stroke-width="{f(r * 0.05)}" stroke-linecap="round" opacity="0.28"/>')
    out.append(f'<g filter="{soft(card, r * 0.035)}" style="mix-blend-mode:screen">{"".join(arms)}</g>')
    out.append(f'<g style="mix-blend-mode:screen">{galaxy(cx, cy, r, "#FFE6B8", 3, tilt, rot, seed, 900, "#FFF4D8")}</g>')
    out.append(f'<g style="mix-blend-mode:screen" opacity="0.8">{galaxy(cx, cy, r * 0.96, "#9EC2FF", 3, tilt, rot + 0.18, seed + 3, 420, "#FFFFFF")}</g>')
    out.append(f'<g style="mix-blend-mode:screen" opacity="0.7">{galaxy(cx, cy, r * 0.9, "#FF9AD8", 3, tilt, rot - 0.16, seed + 5, 300, "#FFFFFF")}</g>')
    lane = (f'<path d="M{f(cx - r * 0.95)} {f(cy + r * tilt * 0.12)} A{f(r * 0.95)} {f(r * tilt * 0.62)} 0 0 0 {f(cx + r * 0.95)} {f(cy + r * tilt * 0.12)}" '
            f'fill="none" stroke="#120626" stroke-width="{f(r * 0.06)}" opacity="0.45" filter="{soft(card, r * 0.02)}"/>')
    out.append(lane)
    out.append(f'<g style="mix-blend-mode:screen">{halo(card, key + "-core", cx, cy, r * 0.55, r * 0.34, "#FFE6A8", 0.8, 0.25)}</g>')
    hii = []
    for _ in range(26):
        t = rnd.random() ** 0.8
        arm = rnd.randrange(3)
        ang = rot + arm * 2 * math.pi / 3 + t * 3.6 + rnd.gauss(0, 0.12)
        rr = r * (0.12 + 0.9 * t)
        x, y = cx + rr * math.cos(ang), cy + rr * math.sin(ang) * tilt
        hii.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(1.4, 3.2))}" fill="{rnd.choice(("#FF7AB8", "#FFB0D8", "#9AC8FF"))}" opacity="0.7"/>')
    out.append(f'<g filter="{soft(card, 1.2)}" style="mix-blend-mode:screen">{"".join(hii)}</g>')
    return "".join(out)


# ---------------------------------------------------------------- le contenu des loupes (repère : rayon 30, centré en 0)

def _earth(card, key):
    sea = rg(card, key + "-sea", [(0, "#8FD8FF"), (0.45, "#2A78D8"), (1, "#081A4A")], 0.36, 0.32, 0.75)
    rnd = random.Random(4)
    land = []
    for cx, cy, s in ((-8, -6, 9), (6, 8, 7), (10, -12, 5), (-12, 12, 5), (14, 2, 4)):
        pts = []
        for i in range(10):
            a = 36 * i
            rr = s * rnd.uniform(0.6, 1.2)
            pts.append(pt(cx, cy, rr, a))
        land.append(f'<path d="M{" L".join(f"{f(x)} {f(y)}" for x, y in pts)} Z" fill="#4AA866" opacity="0.9"/>')
    clouds = "".join(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(rx)}" ry="2" fill="#FFFFFF" opacity="0.7" transform="rotate({f(a)} {f(x)} {f(y)})"/>'
                     for x, y, rx, a in ((-4, -16, 9, -10), (10, 14, 8, 14), (-14, 4, 6, 30), (6, -2, 6, -24)))
    night = rg(card, key + "-night", [(0, "#000000", 0), (0.55, "#000000", 0.0), (1, "#000310", 0.85)], 0.25, 0.25, 0.85)
    return (f'<circle r="21" fill="#4A9AFF" opacity="0.45" filter="{soft(card, 3)}"/>'
            f'<circle r="18" fill="{sea}"/><g filter="{soft(card, 0.5)}">{"".join(land)}{clouds}</g>'
            f'<circle r="18" fill="{night}"/><circle r="18" fill="none" stroke="#BDE6FF" stroke-width="1" opacity="0.7"/>')


def _solar(card, key):
    sun = rg(card, key + "-sun", [(0, "#FFFFFF"), (0.35, "#FFE48A"), (0.7, "#FF9A2A"), (1, "#FF6A00", 0)], 0.5, 0.5, 0.5)
    out = [f'<circle r="11" fill="{sun}"/>']
    planets = ((7, 0.9, "#C8B8A8", 40), (10.5, 1.2, "#FFD8A0", 200), (14.5, 1.4, "#5AB8FF", 300), (18.5, 1.1, "#FF7A5A", 120),
               (23, 2.6, "#E8C890", 20), (27.5, 2.2, "#F0DCA8", 250))
    for rr, pr, col, a in planets:
        out.append(f'<ellipse rx="{f(rr)}" ry="{f(rr * 0.42)}" fill="none" stroke="#FFE2B0" stroke-width="0.45" opacity="0.55"/>')
        x = rr * math.cos(math.radians(a))
        y = rr * 0.42 * math.sin(math.radians(a))
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(pr)}" fill="{col}"/>')
    sx, sy = 27.5 * math.cos(math.radians(250)), 27.5 * 0.42 * math.sin(math.radians(250))
    out.append(f'<ellipse cx="{f(sx)}" cy="{f(sy)}" rx="4.6" ry="1.4" fill="none" stroke="#F0DCA8" stroke-width="0.6" opacity="0.9"/>')
    return "".join(out)


def _spiral(card, key):
    return (f'<ellipse rx="24" ry="12" fill="{rg(card, key + "-v", [(0, "#FFE2A8", 0.6), (1, "#9A6AFF", 0)])}"/>'
            f'<g style="mix-blend-mode:screen">{galaxy(0, 0, 27, "#FFE6C0", 2, 0.5, 0.6, 21, 260, "#FFFFFF")}'
            f'{galaxy(0, 0, 25, "#9EC2FF", 2, 0.5, 0.8, 23, 120, "#FFFFFF")}</g>')


def _web(card, key):
    rnd = random.Random(31)
    nodes = [(rnd.uniform(-26, 26), rnd.uniform(-26, 26)) for _ in range(26)]
    nodes = [(x, y) for x, y in nodes if x * x + y * y < 27 * 27]
    out = []
    for i, (x, y) in enumerate(nodes):
        near = sorted(nodes, key=lambda p: (p[0] - x) ** 2 + (p[1] - y) ** 2)[1:3]
        for nx, ny in near:
            out.append(f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(nx)}" y2="{f(ny)}" stroke="#B89AFF" stroke-width="0.9" opacity="0.6"/>')
    glow = "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(1.6, 3.4))}" fill="{rnd.choice(("#FFD8A0", "#C8B0FF", "#9AD0FF"))}"/>' for x, y in nodes)
    dots = "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="0.9" fill="#FFFFFF"/>' for x, y in nodes)
    return f'<g filter="{soft(card, 0.6)}">{"".join(out)}</g><g filter="{soft(card, 1.4)}" opacity="0.9">{glow}</g>{dots}'


def _ingot(card, key):
    from banque import lingot
    return (f'<rect x="-30" y="-30" width="60" height="60" fill="{rg(card, key + "-bg", [(0, "#5A3A10"), (1, "#140A02")])}"/>'
            + lingot(card, -2, 12, 46, 13, 22, key + "-lg", GOLD_RICH, True))


def _lattice(card, key):
    """La maille cubique à faces centrées de l'or : huit sommets, six centres de face, en perspective cavalière."""
    a = 26
    ox, oy = -a * 0.62, a * 0.42
    dx, dy = a * 0.42, -a * 0.3

    def P(i, j, k):
        return ox + i * a + k * dx, oy - j * a + k * dy

    corners = [(i, j, k) for i in (0, 1) for j in (0, 1) for k in (0, 1)]
    edges = []
    for p in corners:
        for q in corners:
            if p < q and sum(abs(u - v) for u, v in zip(p, q)) == 1:
                edges.append((P(*p), P(*q)))
    faces = [(0.5, 0.5, 0), (0.5, 0.5, 1), (0.5, 0, 0.5), (0.5, 1, 0.5), (0, 0.5, 0.5), (1, 0.5, 0.5)]
    atom = rg(card, key + "-at", [(0, "#FFFFFF"), (0.3, "#FFE7A0"), (0.75, "#D9A23A"), (1, "#6A4410")], 0.35, 0.3, 0.7)
    out = [f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="#FFE2A0" stroke-width="0.7" opacity="0.75"/>' for (x1, y1), (x2, y2) in edges]
    pts = [(P(*p), 3.4) for p in corners] + [(P(*q), 3.0) for q in faces]
    pts.sort(key=lambda t: -t[0][1])
    out += [f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{atom}"/>' for (x, y), r in pts]
    return "".join(out)


def _atom(card, key):
    """L'atome d'or : 79 électrons en six couches (2, 8, 18, 32, 18, 1) autour du noyau."""
    shells = (2, 8, 18, 32, 18, 1)
    out = [f'<circle r="3.2" fill="{rg(card, key + "-nu", [(0, "#FFFFFF"), (0.4, "#FFD27A"), (1, "#C86A1A")], 0.4, 0.35, 0.7)}"/>',
           f'<circle r="6" fill="#FFD27A" opacity="0.35" filter="{soft(card, 2)}"/>']
    for k, n in enumerate(shells):
        rr = 6.2 + k * 4.2
        out.append(f'<circle r="{f(rr)}" fill="none" stroke="#9AC8FF" stroke-width="0.45" opacity="0.6"/>')
        for i in range(n):
            a = 360 * i / n + k * 17
            x, y = pt(0, 0, rr, a)
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="0.95" fill="#DDF0FF"/>')
    out.append(f'<text x="15" y="-17" font-family="{CINZEL}" font-weight="700" font-size="7" fill="#FFE7A0">Au</text>')
    return "".join(out)


def _nucleus(card, key):
    """Le noyau : protons et neutrons serrés en grappe (79 + 118, ramenés à une grappe lisible)."""
    pg = rg(card, key + "-p", [(0, "#FFE0C8"), (0.35, "#FF7A5A"), (1, "#7A1A0A")], 0.35, 0.3, 0.7)
    ng = rg(card, key + "-n", [(0, "#FFFFFF"), (0.35, "#C8D6F0"), (1, "#3A4A6A")], 0.35, 0.3, 0.7)
    rnd = random.Random(5)
    balls = []
    golden = math.pi * (3 - math.sqrt(5))
    for i in range(62):
        rr = 20 * math.sqrt((i + 0.5) / 62)
        a = i * golden
        z = math.sqrt(max(0.0, 1 - (rr / 21) ** 2))
        balls.append((rr * math.cos(a), rr * math.sin(a), z, rnd.random() < 0.42))
    balls.sort(key=lambda b: b[2])
    out = [f'<circle r="24" fill="#FF9A6A" opacity="0.25" filter="{soft(card, 3)}"/>']
    for x, y, z, proton in balls:
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(3.4 + 1.2 * z)}" fill="{pg if proton else ng}"/>')
    return "".join(out)


CONTENT = {"terre": _earth, "soleil": _solar, "galaxie": _spiral, "toile": _web,
           "lingot": _ingot, "cristal": _lattice, "atome": _atom, "noyau": _nucleus}


def roundel(card, cx, cy, r, kind, key, rim=GOLD_RICH):
    """Une loupe : disque de ciel, contenu, lunette d'or biseautée, reflet de verre."""
    s = r / 30
    cid = card.id(key + "-clip")
    card.def_once(key + "-clip", f'<clipPath id="{cid}"><circle cx="0" cy="0" r="30"/></clipPath>')
    bgc = rg(card, key + "-bg", [(0, "#1C1640"), (0.7, "#0A0820"), (1, "#04030E")], 0.5, 0.45, 0.6)
    glass = lg(card, key + "-gl", [(0, "#FFFFFF", 0.28), (0.35, "#FFFFFF", 0.0), (0.7, "#FFFFFF", 0.0), (1, "#FFFFFF", 0.1)], 0, 0, 1, 1)
    ring = metal_lin(card, key + "-rim", rim, 0, 0, 1, 1, 2)
    bv = bevel(card, key + "-bv", 0.8, 2.6, 1.0, 22, shadow=(0, 2, 3, 0.7))
    inner = CONTENT[kind](card, key)
    body = (f'<circle r="36" fill="#FFD27A" opacity="0.18" filter="{soft(card, 6)}"/>'
            f'<g clip-path="url(#{cid})"><circle r="30" fill="{bgc}"/>{inner}</g>'
            f'<circle r="30" fill="{glass}"/>'
            f'<g filter="{bv}"><circle r="32" fill="none" stroke="{ring}" stroke-width="4.4"/></g>'
            f'<circle r="29.6" fill="none" stroke="#3A2006" stroke-width="0.8" opacity="0.8"/>'
            f'<path d="M-22 -14 A26 26 0 0 1 -8 -25" fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>')
    return f'<g transform="translate({f(cx)} {f(cy)}) scale({f(s)})">{body}</g>'


def zoom_cone(card, src, focus_r, dst, r, key, color="#FFE2A0"):
    """Les deux traits d'une loupe : du petit cercle visé dans la loupe du dessus vers les bords de la loupe du dessous."""
    fx, fy = src
    tx, ty = dst
    g = lg(card, key, [(0, color, 0.85), (1, color, 0.25)], 0, 0, 0, 1)
    ang = math.atan2(ty - fy, tx - fx)
    nx, ny = -math.sin(ang), math.cos(ang)
    a1 = (fx + nx * focus_r, fy + ny * focus_r)
    a2 = (fx - nx * focus_r, fy - ny * focus_r)
    b1 = (tx + nx * r * 1.07, ty + ny * r * 1.07)
    b2 = (tx - nx * r * 1.07, ty - ny * r * 1.07)
    fill = lg(card, key + "-f", [(0, color, 0.18), (1, color, 0.03)], 0, 0, 0, 1)
    return (f'<path d="M{f(a1[0])} {f(a1[1])} L{f(b1[0])} {f(b1[1])} L{f(b2[0])} {f(b2[1])} L{f(a2[0])} {f(a2[1])} Z" fill="{fill}"/>'
            f'<line x1="{f(a1[0])}" y1="{f(a1[1])}" x2="{f(b1[0])}" y2="{f(b1[1])}" stroke="{g}" stroke-width="0.9"/>'
            f'<line x1="{f(a2[0])}" y1="{f(a2[1])}" x2="{f(b2[0])}" y2="{f(b2[1])}" stroke="{g}" stroke-width="0.9"/>'
            f'<circle cx="{f(fx)}" cy="{f(fy)}" r="{f(focus_r)}" fill="none" stroke="{color}" stroke-width="1.1"/>')


def scale_label(x, y, mant, exp, color="#F6D99A", anchor="middle"):
    """Une échelle « 10^n m » en petites capitales, l'exposant en vrai exposant."""
    return (f'<text x="{f(x)}" y="{f(y)}" text-anchor="{anchor}" font-family="{SANS}" font-weight="700" font-size="9" letter-spacing="0.6" fill="{color}">'
            f'{mant}<tspan font-size="6.4" dy="-4">{exp}</tspan><tspan dy="4"> m</tspan></text>')
