"""Le cosmos de l'atelier « Olympe » : l'immense (constellations nées des mythes grecs, nébuleuses, galaxies,
amas, supernova, trou noir, quasar, toile cosmique) et l'infime (cristaux, flocon fractal, géométrie sacrée,
grains de pollen, diatomées, cellules, neurones, ADN, atomes et orbitales, noyau, quarks, traces de particules,
mousse quantique, cordes, ondes).
"""

import math
import random

from common import f, pt, W, H, sparkle, galaxy


def ublur(card, name, sd):
    card.def_once(name, f'<filter id="{card.id(name)}" filterUnits="userSpaceOnUse" x="-60" y="-60" width="{W + 120}" height="{H + 120}"><feGaussianBlur stdDeviation="{sd}"/></filter>')
    return f"url(#{card.id(name)})"


def ucloud(card, name, freq=0.012, octaves=4, seed=3, a=2.4, b=-0.9):
    """Filtre nuée en repère absolu : la forme ne garde sa couleur que là où le bruit est dense."""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" filterUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="{octaves}" seed="{seed}" result="n"/>'
        f'<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  {a} 0 0 0 {b}" result="m"/>'
        f'<feComposite in="SourceGraphic" in2="m" operator="in"/></filter>',
    )
    return f"url(#{card.id(name)})"


def neb(card, name, cx, cy, rx, ry, c1, c2, op=0.9, freq=0.011, seed=5, rot=0, a=2.6, b=-0.85):
    g = card.rgrad(name + "-g", [(0, c1, op), (0.45, c2, op * 0.75), (1, c2, 0)])
    tr = f' transform="rotate({rot} {f(cx)} {f(cy)})"' if rot else ""
    return f'<g filter="{ucloud(card, name + "-f", freq, 5, seed, a, b)}"><ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{g}"{tr}/></g>'


def star_field(seed, n, region=(0, 0, W, H), color="#FFFFFF", rmax=1.5, keep=None, bright=0.05, warm="#FFE6B8", cold="#BFD8FF"):
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if keep and not keep(x, y):
            continue
        r = rnd.uniform(0.25, rmax) * (rnd.random() ** 1.6 + 0.3)
        col = rnd.choice((color, color, warm, cold))
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{col}" opacity="{f(rnd.uniform(0.35, 1))}"/>')
        if rnd.random() < bright:
            out.append(sparkle(x, y, r * rnd.uniform(4, 7), col, 0.85))
    return "".join(out)


def outside(x0=80, y0=246, x1=460, y1=726, pad=0):
    return lambda x, y: not (x0 - pad < x < x1 + pad and y0 - pad < y < y1 + pad)


def flare(cx, cy, r, color, op=1, thin=0.05):
    return (
        f'<g opacity="{f(op)}">'
        f'<path d="M{f(cx - r)} {f(cy)} Q{f(cx)} {f(cy - r * thin)} {f(cx + r)} {f(cy)} Q{f(cx)} {f(cy + r * thin)} {f(cx - r)} {f(cy)} Z" fill="{color}"/>'
        f'<path d="M{f(cx)} {f(cy - r)} Q{f(cx + r * thin)} {f(cy)} {f(cx)} {f(cy + r)} Q{f(cx - r * thin)} {f(cy)} {f(cx)} {f(cy - r)} Z" fill="{color}"/>'
        f'{sparkle(cx, cy, r * 0.3, color, 1)}</g>'
    )


# ---------------------------------------------------------------- constellations en fils d'or

# étoiles (x, y, magnitude 1 = brillante … 3 = faible) et traits, repère normalisé (≈ 0..1)
CONST = {
    "orion": ([(0.5, 0.0, 3), (0.24, 0.17, 1), (0.74, 0.22, 2), (0.42, 0.52, 2), (0.5, 0.5, 2), (0.58, 0.47, 2), (0.3, 0.9, 2), (0.8, 0.86, 1),
               (0.14, 0.02, 3), (0.1, -0.12, 3), (0.92, 0.06, 3), (0.98, 0.18, 3), (0.97, 0.3, 3), (0.92, 0.4, 3), (0.5, 0.66, 3)],
              [(0, 1), (0, 2), (1, 3), (2, 5), (3, 4), (4, 5), (3, 6), (5, 7), (1, 8), (8, 9), (2, 10), (10, 11), (11, 12), (12, 13), (4, 14)]),
    "ursa": ([(0.86, 0.22, 1), (0.84, 0.46, 2), (0.62, 0.52, 2), (0.6, 0.3, 3), (0.42, 0.26, 2), (0.26, 0.22, 2), (0.06, 0.34, 2),
              (1.02, 0.2, 3), (1.12, 0.36, 3), (1.0, 0.72, 3), (0.92, 0.86, 3), (0.66, 0.78, 3), (0.6, 0.92, 3)],
             [(0, 1), (1, 2), (2, 3), (3, 0), (3, 4), (4, 5), (5, 6), (0, 7), (7, 8), (1, 9), (9, 10), (2, 11), (11, 12)]),
    "cassiopeia": ([(0.0, 0.32, 2), (0.24, 0.62, 2), (0.48, 0.36, 1), (0.72, 0.7, 2), (1.0, 0.42, 2)], [(0, 1), (1, 2), (2, 3), (3, 4)]),
    "pegasus": ([(0.32, 0.3, 2), (0.72, 0.3, 1), (0.72, 0.68, 2), (0.32, 0.68, 2), (0.14, 0.8, 3), (0.02, 0.74, 2), (-0.1, 0.8, 3),
                 (0.16, 0.2, 3), (0.02, 0.1, 3), (0.2, 0.42, 3), (0.06, 0.5, 3), (0.9, 0.22, 2), (1.06, 0.12, 2), (1.2, 0.1, 3)],
                [(0, 1), (1, 2), (2, 3), (3, 0), (3, 4), (4, 5), (5, 6), (0, 7), (7, 8), (0, 9), (9, 10), (1, 11), (11, 12), (12, 13)]),
    "perseus": ([(0.5, 0.0, 3), (0.46, 0.2, 2), (0.42, 0.38, 1), (0.6, 0.48, 2), (0.76, 0.62, 3), (0.82, 0.82, 3), (0.26, 0.5, 2), (0.14, 0.66, 3), (0.2, 0.86, 3), (0.3, 0.24, 3)],
                [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (2, 6), (6, 7), (7, 8), (1, 9)]),
    "lyra": ([(0.3, 0.1, 1), (0.48, 0.02, 3), (0.42, 0.3, 3), (0.6, 0.5, 2), (0.42, 0.7, 2), (0.24, 0.5, 2)], [(0, 1), (0, 2), (2, 3), (3, 4), (4, 5), (5, 2)]),
    "aquila": ([(0.5, 0.45, 1), (0.44, 0.34, 2), (0.56, 0.56, 3), (0.2, 0.22, 3), (0.02, 0.12, 3), (0.8, 0.7, 3), (0.96, 0.82, 3), (0.62, 0.9, 2), (0.36, 0.7, 3)],
               [(1, 0), (0, 2), (1, 3), (3, 4), (2, 5), (5, 6), (0, 7), (0, 8)]),
    "pleiades": ([(0.4, 0.3, 2), (0.55, 0.35, 2), (0.5, 0.5, 1), (0.66, 0.52, 3), (0.34, 0.55, 3), (0.62, 0.7, 3), (0.45, 0.66, 3)], [(0, 1), (1, 2), (2, 3), (2, 4), (3, 5), (4, 6)]),
    "andromeda": ([(0.0, 0.5, 1), (0.22, 0.44, 2), (0.46, 0.4, 1), (0.72, 0.3, 2), (0.3, 0.26, 3), (0.5, 0.18, 3)], [(0, 1), (1, 2), (2, 3), (1, 4), (4, 5)]),
    "cygnus": ([(0.5, 0.0, 1), (0.5, 0.3, 2), (0.5, 0.62, 3), (0.5, 0.95, 2), (0.15, 0.24, 2), (0.0, 0.42, 3), (0.85, 0.36, 2), (1.0, 0.52, 3)],
               [(0, 1), (1, 2), (2, 3), (1, 4), (4, 5), (1, 6), (6, 7)]),
}


def constellation(card, kind, x, y, s, color="#FFE6A0", line=None, rot=0, flip=False, w=1.1, star=2.4, op=0.85, glow=True, name=None):
    """Une constellation tracée en fils d'or : traits lumineux (halo flou + fil fin), étoiles scintillantes."""
    stars, edges = CONST[kind]
    line = line or color
    a = math.radians(rot)

    def tp(p):
        px, py = (1 - p[0]) if flip else p[0], p[1]
        px, py = (px - 0.5) * s, (py - 0.5) * s
        return x + px * math.cos(a) - py * math.sin(a), y + px * math.sin(a) + py * math.cos(a)

    P = [tp(p) for p in stars]
    d = " ".join(f"M{f(P[i][0])} {f(P[i][1])} L{f(P[j][0])} {f(P[j][1])}" for i, j in edges)
    out = []
    if glow:
        out.append(f'<path d="{d}" fill="none" stroke="{line}" stroke-width="{f(w * 4)}" stroke-linecap="round" opacity="{f(op * 0.35)}" filter="{ublur(card, "cst-glow", 2.2)}"/>')
    out.append(f'<path d="{d}" fill="none" stroke="{line}" stroke-width="{f(w)}" stroke-linecap="round" opacity="{f(op)}"/>')
    for (sx, sy), (_, _, mag) in zip(P, stars):
        r = star * (1.6 if mag == 1 else 1.0 if mag == 2 else 0.65)
        out.append(f'<circle cx="{f(sx)}" cy="{f(sy)}" r="{f(r * 3.4)}" fill="{color}" opacity="0.22"/>')
        out.append(f'<circle cx="{f(sx)}" cy="{f(sy)}" r="{f(r)}" fill="#FFFFFF"/>')
        if mag == 1:
            out.append(flare(sx, sy, r * 6, "#FFFFFF", 0.9, 0.06))
        elif mag == 2:
            out.append(sparkle(sx, sy, r * 3.2, color, 0.9))
    return "".join(out)


def thread_figure(card, markup, op=0.5, color="#FFE6A0", w=0.9):
    """Une figure mythologique dessinée en fil d'or (contour seulement), comme sur les atlas célestes."""
    return (f'<g fill="none" stroke="{color}" stroke-width="{f(w)}" opacity="{f(op)}" stroke-linejoin="round" stroke-linecap="round">'
            f'{markup}</g>')


# ---------------------------------------------------------------- l'immense

def spiral_galaxy(card, name, cx, cy, r, tilt=0.42, rot=0.3, seed=42, core="#FFF6E8", arm="#B9A7FF", pink="#FF8FD0", blue="#7FB8FF", n=1600, turns=4.2, op=1.0):
    """Galaxie spirale : halo, disque marbré, deux bras effilés roses et bleus, régions HII, bulbe d'or, aigrette."""
    rnd = random.Random(seed)
    out = [f'<g opacity="{f(op)}">']
    out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 1.3)}" ry="{f(r * 1.3 * tilt)}" fill="{card.rgrad(name + "-halo", [(0, core, 0.85), (0.16, pink, 0.45), (0.45, arm, 0.25), (1, blue, 0)])}" transform="rotate({f(math.degrees(0))} {f(cx)} {f(cy)})"/>')
    out.append(f'<g filter="{ucloud(card, name + "-df", 0.02, 4, seed + 1, 1.8, -0.3)}"><ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r)}" ry="{f(r * tilt)}" fill="{card.rgrad(name + "-disk", [(0, "#FFE6F4", 0.9), (0.5, arm, 0.55), (1, blue, 0)])}"/></g>')
    filt = ucloud(card, name + "-af", 0.035, 4, seed, 2.0, -0.45)
    soft = ublur(card, name + "-ab", max(0.6, r * 0.03))
    segs = 7
    for k in range(2):
        for j in range(segs):
            t0, t1 = j / segs, (j + 1.15) / segs
            pts = []
            for i in range(12):
                t = t0 + (t1 - t0) * i / 11
                ang = rot + k * math.pi + t * turns
                rr = r * (0.1 + 0.9 * t)
                pts.append((cx + rr * math.cos(ang), cy + rr * math.sin(ang) * tilt))
            d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts)
            tm = (t0 + t1) / 2
            wd = r * 0.2 * (1 - 0.65 * tm)
            o = 0.95 * (1 - 0.55 * tm)
            co, ci = (arm, pink) if k == 0 else (blue, "#FFD0F0")
            out.append(f'<g filter="{filt}"><path d="{d}" fill="none" stroke="{co}" stroke-width="{f(wd)}" stroke-linecap="round" opacity="{f(o)}" filter="{soft}"/></g>')
            out.append(f'<path d="{d}" fill="none" stroke="{ci}" stroke-width="{f(wd * 0.33)}" stroke-linecap="round" opacity="{f(o * 0.5)}" filter="{ublur(card, name + "-ab2", max(0.8, r * 0.02))}"/>')
    out.append(galaxy(cx, cy, r, "#FFFFFF", 2, tilt, rot, seed, n, core))
    for _ in range(24):
        t = rnd.uniform(0.2, 0.9)
        k = rnd.choice((0, 1))
        ang = rot + k * math.pi + t * turns + rnd.gauss(0, 0.06)
        rr = r * (0.1 + 0.9 * t)
        x, y = cx + rr * math.cos(ang), cy + rr * math.sin(ang) * tilt
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(1.2, 3.2) * r / 120)}" fill="{rnd.choice((pink, "#FF6FB1", "#FFD0F0"))}" opacity="0.75"/>')
    out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 0.32)}" ry="{f(r * 0.32 * tilt * 1.2)}" fill="{card.rgrad(name + "-bulge", [(0, "#FFFFFF", 1), (0.3, core, 0.95), (0.7, "#FFD9A0", 0.4), (1, "#FFD9A0", 0)])}"/>')
    out.append(flare(cx, cy, r * 0.55, "#FFFFFF", 0.9, 0.025))
    out.append("</g>")
    return "".join(out)


def small_galaxy(cx, cy, r, color, rot=0, tilt=0.45, kind="spiral", seed=1):
    if kind == "elliptic":
        return (f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r)}" ry="{f(r * tilt)}" fill="{color}" opacity="0.35" transform="rotate({f(rot)} {f(cx)} {f(cy)})"/>'
                f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 0.45)}" ry="{f(r * tilt * 0.45)}" fill="#FFFFFF" opacity="0.8" transform="rotate({f(rot)} {f(cx)} {f(cy)})"/>')
    return f'<g transform="rotate({f(rot)} {f(cx)} {f(cy)})">{galaxy(cx, cy, r, color, 2, tilt, 0.3 + seed, seed, max(40, int(r * 6)), "#FFFFFF")}</g>'


def galaxy_cluster(seed, cx, cy, r, n, colors=("#FFE6B8", "#CFE0FF", "#FFD0E8")):
    """Un amas de galaxies : des dizaines de petites spirales et elliptiques autour d'une géante."""
    rnd = random.Random(seed)
    out = [small_galaxy(cx, cy, r * 0.22, "#FFF0D0", 20, 0.6, "elliptic")]
    for i in range(n):
        a = rnd.uniform(0, 360)
        d = r * rnd.random() ** 0.7
        x, y = pt(cx, cy, d, a)
        rr = rnd.uniform(2, 7) * (1.2 - d / r)
        out.append(small_galaxy(x, y, rr, rnd.choice(colors), rnd.uniform(0, 180), rnd.uniform(0.3, 0.7), rnd.choice(("spiral", "elliptic", "elliptic")), i))
    return "".join(out)


def supernova(card, name, cx, cy, r, core="#FFFFFF", c1="#FFE8A8", c2="#FF6A3D", c3="#7A3CFF", seed=31):
    shell = card.rgrad(name + "-shell", [(0, c1, 0), (0.45, c1, 0.25), (0.72, c2, 0.95), (0.86, c3, 0.8), (1, c3, 0)])
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 2.2)}" fill="{card.rgrad(name + "-h", [(0, c1, 0.4), (0.3, c2, 0.18), (0.7, c3, 0.08), (1, c3, 0)])}"/>']
    out.append(f'<g filter="{ucloud(card, name + "-f1", 0.045, 4, seed, 2.6, -0.7)}"><ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 1.08)}" ry="{f(r)}" fill="{shell}"/></g>')
    out.append(f'<g filter="{ucloud(card, name + "-f2", 0.09, 3, seed + 1, 3.4, -1.6)}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.95)}" fill="{shell}"/></g>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.4)}" fill="{card.rgrad(name + "-c", [(0, core, 1), (0.3, c1, 0.85), (1, c1, 0)])}"/>')
    out.append(flare(cx, cy, r * 1.5, core, 1, 0.04))
    return "".join(out)


def black_hole(card, name, cx, cy, r, tilt=0.26, hot="#FFF2D0", warm="#FFB347", deep="#C2410C", ring="#FFE3B0", disk=3.4, rot=0):
    """Trou noir : disque d'accrétion incliné, anneau de photons, arc lentillé au-dessus de l'horizon."""
    rx, ry = r * disk, r * disk * tilt
    dg = card.grad(name + "-dg", [(0, hot), (0.2, "#FFFFFF"), (0.42, hot), (0.7, warm), (1, deep)], 0, 0, 1, 0)
    halo = card.rgrad(name + "-halo", [(0, warm, 0.55), (0.4, deep, 0.22), (1, deep, 0)])
    out = [f'<g transform="rotate({f(rot)} {f(cx)} {f(cy)})">']
    out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx * 1.5)}" ry="{f(r * 2.6)}" fill="{halo}"/>')
    card.def_once(name + "-top", f'<clipPath id="{card.id(name + "-top")}"><rect x="-200" y="-200" width="{W + 400}" height="{f(cy + 200)}"/></clipPath>')
    card.def_once(name + "-bot", f'<clipPath id="{card.id(name + "-bot")}"><rect x="-200" y="{f(cy)}" width="{W + 400}" height="{f(H - cy + 200)}"/></clipPath>')
    rings = "".join(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx * k)}" ry="{f(ry * k)}" fill="none" stroke="{dg}" stroke-width="{f(wd)}" opacity="{o}"/>'
                    for k, wd, o in ((1.0, r * 0.55, 0.95), (0.8, r * 0.35, 0.9), (1.2, r * 0.25, 0.6), (0.62, r * 0.2, 0.8)))
    blur = card.blur(name + "-db", r * 0.06)
    out.append(f'<g clip-path="url(#{card.id(name + "-top")})" filter="{blur}">{rings}</g>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.32)}" fill="none" stroke="{ring}" stroke-width="{f(r * 0.22)}" opacity="0.9" filter="{card.blur(name + "-rb", r * 0.08)}"/>')
    out.append(f'<path d="M{f(cx - r * 1.6)} {f(cy)} A{f(r * 1.6)} {f(r * 1.5)} 0 0 1 {f(cx + r * 1.6)} {f(cy)}" fill="none" stroke="{dg}" stroke-width="{f(r * 0.42)}" opacity="0.85" filter="{blur}"/>')
    out.append(f'<path d="M{f(cx - r * 1.45)} {f(cy)} A{f(r * 1.45)} {f(r * 1.25)} 0 0 0 {f(cx + r * 1.45)} {f(cy)}" fill="none" stroke="{warm}" stroke-width="{f(r * 0.12)}" opacity="0.7" filter="{blur}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="#000000"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.04)}" fill="none" stroke="{hot}" stroke-width="{f(r * 0.05)}" opacity="0.9"/>')
    out.append(f'<g clip-path="url(#{card.id(name + "-bot")})" filter="{blur}">{rings}</g>')
    out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx * 0.95)}" ry="{f(ry * 0.3)}" fill="{hot}" opacity="0.35" filter="{card.blur(name + "-lb", r * 0.15)}"/>')
    out.append("</g>")
    return "".join(out)


def jet(card, name, x0, y0, x1, y1, width, color="#BFE6FF", core="#FFFFFF"):
    """Un jet relativiste, de (x0, y0) vers (x1, y1), qui s'évase et se dissout en nœuds lumineux."""
    L = math.hypot(x1 - x0, y1 - y0)
    ang = math.degrees(math.atan2(y1 - y0, x1 - x0))
    g = card.grad(name + "-jg", [(0, core), (0.3, color), (1, color + "00")], 0, 0, 1, 0)
    out = [f'<g transform="translate({f(x0)} {f(y0)}) rotate({f(ang)})">']
    out.append(f'<path d="M0 0 L{f(L)} {f(-width * 1.4)} L{f(L)} {f(width * 1.4)}Z" fill="{g}" opacity="0.55" filter="{card.blur(name + "-jb", width * 0.5)}"/>')
    out.append(f'<path d="M0 {f(-width * 0.15)} L{f(L * 0.85)} {f(-width * 0.4)} L{f(L * 0.85)} {f(width * 0.4)} L0 {f(width * 0.15)}Z" fill="{g}"/>')
    rnd = random.Random(len(name))
    for k in range(5):
        t = 0.25 + 0.14 * k
        out.append(f'<ellipse cx="{f(L * t)}" cy="{f(rnd.uniform(-1, 1) * width * 0.2)}" rx="{f(width * 0.7)}" ry="{f(width * 0.35)}" fill="{core}" opacity="{f(0.7 - 0.1 * k)}" filter="{card.blur(name + "-kb", 1.2)}"/>')
    out.append("</g>")
    return "".join(out)


def cosmic_web(seed, region, n, color="#B9A7FF", node="#FFFFFF", w=0.8, op=0.55, k=3, keep=None, card=None, name="web"):
    """La toile cosmique : nœuds (amas) reliés par des filaments aux plus proches voisins, en fils de lumière."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    pts = []
    while len(pts) < n:
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if keep and not keep(x, y):
            continue
        pts.append((x, y))
    edges = set()
    for i, (x, y) in enumerate(pts):
        near = sorted(range(len(pts)), key=lambda j: (pts[j][0] - x) ** 2 + (pts[j][1] - y) ** 2)[1:k + 1]
        for j in near:
            edges.add((min(i, j), max(i, j)))
    out = []
    segs = []
    for i, j in edges:
        (ax, ay), (bx, by) = pts[i], pts[j]
        mx, my = (ax + bx) / 2 + rnd.uniform(-8, 8), (ay + by) / 2 + rnd.uniform(-8, 8)
        segs.append(f"M{f(ax)} {f(ay)} Q{f(mx)} {f(my)} {f(bx)} {f(by)}")
    d = " ".join(segs)
    if card:
        out.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(w * 4)}" opacity="{f(op * 0.45)}" filter="{ublur(card, name + "-wb", 2.5)}"/>')
    out.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(w)}" opacity="{f(op)}"/>')
    deg = {}
    for i, j in edges:
        deg[i] = deg.get(i, 0) + 1
        deg[j] = deg.get(j, 0) + 1
    for i, (x, y) in enumerate(pts):
        r = 0.8 + 0.6 * deg.get(i, 1)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 2.4)}" fill="{color}" opacity="0.25"/><circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.7)}" fill="{node}" opacity="0.95"/>')
    return "".join(out)


# ---------------------------------------------------------------- l'infime

def snowflake(cx, cy, r, color, depth=3, w=1.2, rot=0, op=1):
    """Un flocon dendritique à six branches, ramifié récursivement (fractale)."""
    segs = []

    def branch(x, y, ang, L, d):
        x2, y2 = pt(x, y, L, ang)
        segs.append(f"M{f(x)} {f(y)} L{f(x2)} {f(y2)}")
        if d == 0:
            return
        for k in (0.35, 0.62, 0.85):
            bx, by = pt(x, y, L * k, ang)
            for s in (-60, 60):
                branch(bx, by, ang + s, L * (1 - k) * 0.62, d - 1)

    for i in range(6):
        branch(cx, cy, rot + 60 * i, r, depth)
    hexa = " L".join(f"{f(pt(cx, cy, r * 0.18, rot + 60 * i + 30)[0])} {f(pt(cx, cy, r * 0.18, rot + 60 * i + 30)[1])}" for i in range(6))
    return (f'<g opacity="{f(op)}"><path d="{" ".join(segs)}" fill="none" stroke="{color}" stroke-width="{f(w)}" stroke-linecap="round"/>'
            f'<path d="M{hexa}Z" fill="none" stroke="{color}" stroke-width="{f(w)}"/></g>')


def koch(cx, cy, r, color, depth=3, w=1, rot=0, fill="none", op=1):
    """Le flocon de Koch : un triangle dont chaque côté se replie en étoile, à l'infini."""
    pts = [pt(cx, cy, r, rot + 120 * i) for i in range(3)]

    def kseg(a, b, d):
        if d == 0:
            return [a]
        (ax, ay), (bx, by) = a, b
        dx, dy = (bx - ax) / 3, (by - ay) / 3
        p1 = (ax + dx, ay + dy)
        p3 = (ax + 2 * dx, ay + 2 * dy)
        ang = math.atan2(dy, dx) - math.pi / 3
        L = math.hypot(dx, dy)
        p2 = (p1[0] + L * math.cos(ang), p1[1] + L * math.sin(ang))
        return kseg(a, p1, d - 1) + kseg(p1, p2, d - 1) + kseg(p2, p3, d - 1) + kseg(p3, b, d - 1)

    poly = []
    for i in range(3):
        poly += kseg(pts[i], pts[(i + 1) % 3], depth)
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in poly) + "Z"
    return f'<path d="{d}" fill="{fill}" stroke="{color}" stroke-width="{f(w)}" stroke-linejoin="round" opacity="{f(op)}"/>'


def flower_of_life(cx, cy, r, color, rings=2, w=0.8, op=1, outer=True):
    """La fleur de vie : cercles de même rayon centrés sur un réseau hexagonal."""
    centers = {(0.0, 0.0)}
    for ring in range(1, rings + 1):
        for i in range(6):
            a = math.radians(60 * i)
            b = math.radians(60 * (i + 2))
            for k in range(ring):
                x = ring * math.cos(a) + k * math.cos(b)
                y = ring * math.sin(a) + k * math.sin(b)
                centers.add((round(x, 4), round(y, 4)))
    out = [f'<circle cx="{f(cx + x * r)}" cy="{f(cy + y * r)}" r="{f(r)}" fill="none" stroke="{color}" stroke-width="{f(w)}"/>' for x, y in centers]
    if outer:
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * (rings + 1))}" fill="none" stroke="{color}" stroke-width="{f(w * 1.6)}"/>')
    return f'<g opacity="{f(op)}">{"".join(out)}</g>'


def hex_lattice(x0, y0, x1, y1, a, color, w=0.8, op=0.6, atoms=None, keep=None):
    """Un réseau cristallin hexagonal (graphène, glace) : liaisons et atomes aux nœuds."""
    out = []
    dx = a * math.sqrt(3)
    dy = a * 1.5
    rows = int((y1 - y0) / dy) + 2
    cols = int((x1 - x0) / dx) + 2
    segs = []
    nodes = []
    for j in range(rows):
        for i in range(cols):
            cx = x0 + i * dx + (dx / 2 if j % 2 else 0)
            cy = y0 + j * dy
            if keep and not keep(cx, cy):
                continue
            hexp = [pt(cx, cy, a, 60 * k) for k in range(6)]
            segs.append("M" + " L".join(f"{f(x)} {f(y)}" for x, y in hexp) + "Z")
            nodes += hexp
    out.append(f'<path d="{" ".join(segs)}" fill="none" stroke="{color}" stroke-width="{f(w)}" opacity="{f(op)}"/>')
    if atoms:
        seen = set()
        for x, y in nodes:
            k = (round(x), round(y))
            if k in seen:
                continue
            seen.add(k)
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(a * 0.16)}" fill="{atoms}" opacity="{f(min(1, op * 1.4))}"/>')
    return "".join(out)


def pollen(card, name, cx, cy, r, base="#FFD36E", dark="#A86A10", spikes=0, colpi=3, rot=0):
    """Un grain de pollen au microscope : sphère réticulée ; l'olivier a trois sillons (tricolpé), d'autres des épines."""
    g = card.rgrad(name, [(0, "#FFFFFF", 1), (0.35, base, 1), (1, dark, 1)], 0.4, 0.35, 0.65)
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/>']
    rnd = random.Random(int(cx * 7 + cy))
    for _ in range(int(r * 1.6)):
        a = rnd.uniform(0, 360)
        d = r * rnd.random() ** 0.6 * 0.9
        x, y = pt(cx, cy, d, a)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.07)}" fill="none" stroke="{dark}" stroke-width="{f(r * 0.025)}" opacity="0.55"/>')
    for k in range(colpi):
        a = rot + 360 * k / colpi
        x1, y1 = pt(cx, cy, r * 0.95, a - 14)
        x2, y2 = pt(cx, cy, r * 0.95, a + 14)
        xm, ym = pt(cx, cy, r * 0.25, a)
        out.append(f'<path d="M{f(x1)} {f(y1)} Q{f(xm)} {f(ym)} {f(x2)} {f(y2)}" fill="none" stroke="{dark}" stroke-width="{f(r * 0.1)}" stroke-linecap="round" opacity="0.8"/>')
    for k in range(spikes):
        a = 360 * k / spikes
        x1, y1 = pt(cx, cy, r * 0.95, a)
        x2, y2 = pt(cx, cy, r * 1.3, a)
        out.append(f'<path d="M{f(x1)} {f(y1)} L{f(x2)} {f(y2)}" stroke="{base}" stroke-width="{f(r * 0.08)}" stroke-linecap="round"/>')
    out.append(f'<ellipse cx="{f(cx - r * 0.3)}" cy="{f(cy - r * 0.35)}" rx="{f(r * 0.3)}" ry="{f(r * 0.18)}" fill="#FFFFFF" opacity="0.45" transform="rotate(-30 {f(cx - r * 0.3)} {f(cy - r * 0.35)})"/>')
    return "".join(out)


def diatom(cx, cy, r, color, kind=0, w=0.8, op=1, rot=0):
    """Une diatomée ou un radiolaire : coque de silice à symétrie rayonnante, percée de pores."""
    out = []
    if kind == 0:
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="{color}" stroke-width="{f(w * 1.6)}"/>')
        for ring, n in ((0.82, 24), (0.62, 18), (0.42, 12), (0.22, 6)):
            for k in range(n):
                x, y = pt(cx, cy, r * ring, rot + 360 * k / n)
                out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.055 * (1 + ring))}" fill="none" stroke="{color}" stroke-width="{f(w)}"/>')
        for k in range(12):
            x1, y1 = pt(cx, cy, r * 0.12, rot + 30 * k)
            x2, y2 = pt(cx, cy, r * 0.95, rot + 30 * k)
            out.append(f'<path d="M{f(x1)} {f(y1)} L{f(x2)} {f(y2)}" stroke="{color}" stroke-width="{f(w * 0.6)}" opacity="0.6"/>')
    elif kind == 1:
        out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r)}" ry="{f(r * 0.32)}" fill="none" stroke="{color}" stroke-width="{f(w * 1.5)}" transform="rotate({f(rot)} {f(cx)} {f(cy)})"/>')
        g = []
        for k in range(-9, 10):
            x = cx + k * r * 0.1
            hh = r * 0.3 * math.sqrt(max(0, 1 - (k / 10) ** 2))
            g.append(f"M{f(x)} {f(cy - hh)} L{f(x)} {f(cy + hh)}")
        out.append(f'<path d="{" ".join(g)}" stroke="{color}" stroke-width="{f(w * 0.7)}" transform="rotate({f(rot)} {f(cx)} {f(cy)})"/>')
        out.append(f'<path d="M{f(cx - r * 0.9)} {f(cy)} L{f(cx + r * 0.9)} {f(cy)}" stroke="{color}" stroke-width="{f(w)}" transform="rotate({f(rot)} {f(cx)} {f(cy)})"/>')
    else:
        for k in range(16):
            x1, y1 = pt(cx, cy, r * 0.55, rot + 22.5 * k)
            x2, y2 = pt(cx, cy, r * (1.3 if k % 2 else 1.0), rot + 22.5 * k)
            out.append(f'<path d="M{f(x1)} {f(y1)} L{f(x2)} {f(y2)}" stroke="{color}" stroke-width="{f(w)}"/>')
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.55)}" fill="none" stroke="{color}" stroke-width="{f(w * 1.4)}"/>')
        out.append(hex_lattice(cx - r * 0.5, cy - r * 0.5, cx + r * 0.5, cy + r * 0.5, r * 0.11, color, w * 0.6, 0.8, keep=lambda x, y: (x - cx) ** 2 + (y - cy) ** 2 < (r * 0.42) ** 2))
    return f'<g opacity="{f(op)}">{"".join(out)}</g>'


def cell(card, name, cx, cy, r, mem="#7FE0C8", nuc="#FF8FD0", inner="#0E2A3A", seed=4, op=0.9):
    """Une cellule : membrane double, cytoplasme, noyau et nucléole, mitochondries, vésicules."""
    rnd = random.Random(seed)
    pts = []
    for i in range(14):
        a = 360 * i / 14
        pts.append(pt(cx, cy, r * rnd.uniform(0.9, 1.06), a))
    from figures import smooth
    d = smooth(pts, closed=True)
    g = card.rgrad(name, [(0, mem, 0.18), (0.8, inner, 0.55), (1, mem, 0.6)])
    out = [f'<g opacity="{f(op)}"><path d="{d}" fill="{g}" stroke="{mem}" stroke-width="{f(r * 0.04)}"/>']
    out.append(f'<path d="{d}" fill="none" stroke="{mem}" stroke-width="{f(r * 0.012)}" transform="translate({f(cx * 0.06)} {f(cy * 0.06)}) scale(0.94)" opacity="0.6"/>')
    nx, ny = cx + r * 0.1, cy - r * 0.05
    out.append(f'<circle cx="{f(nx)}" cy="{f(ny)}" r="{f(r * 0.34)}" fill="{card.rgrad(name + "-n", [(0, nuc, 0.95), (1, nuc, 0.35)])}" stroke="{nuc}" stroke-width="{f(r * 0.02)}"/>')
    out.append(f'<circle cx="{f(nx + r * 0.08)}" cy="{f(ny - r * 0.06)}" r="{f(r * 0.1)}" fill="#FFFFFF" opacity="0.75"/>')
    for k in range(3):
        a = rnd.uniform(0, 360)
        mx, my = pt(cx, cy, r * rnd.uniform(0.5, 0.7), a)
        out.append(f'<ellipse cx="{f(mx)}" cy="{f(my)}" rx="{f(r * 0.16)}" ry="{f(r * 0.07)}" fill="#FFB86B" opacity="0.85" transform="rotate({f(a)} {f(mx)} {f(my)})"/>'
                   f'<path d="M{f(mx - r * 0.12)} {f(my)} q{f(r * 0.03)} {f(-r * 0.05)} {f(r * 0.06)} 0 t{f(r * 0.06)} 0 t{f(r * 0.06)} 0 t{f(r * 0.06)} 0" fill="none" stroke="#8A4A10" stroke-width="{f(r * 0.012)}" transform="rotate({f(a)} {f(mx)} {f(my)})"/>')
    for k in range(8):
        a = rnd.uniform(0, 360)
        vx, vy = pt(cx, cy, r * rnd.uniform(0.45, 0.8), a)
        out.append(f'<circle cx="{f(vx)}" cy="{f(vy)}" r="{f(r * rnd.uniform(0.03, 0.06))}" fill="none" stroke="{mem}" stroke-width="{f(r * 0.012)}"/>')
    out.append("</g>")
    return "".join(out)


def neuron(card, name, cx, cy, s, color="#FFD36E", glow="#FFB0E0", seed=3, axon=(0, 140), depth=4, op=1):
    """Un neurone : soma lumineux, dendrites ramifiées, axone gainé de myéline, boutons synaptiques qui brillent."""
    rnd = random.Random(seed)
    segs = []
    tips = []

    def grow(x, y, ang, L, d, wd):
        x2, y2 = pt(x, y, L, ang)
        mx, my = pt((x + x2) / 2, (y + y2) / 2, L * 0.12, ang + rnd.choice((-90, 90)))
        segs.append((f"M{f(x)} {f(y)} Q{f(mx)} {f(my)} {f(x2)} {f(y2)}", wd))
        if d == 0:
            tips.append((x2, y2))
            return
        for k in range(2):
            grow(x2, y2, ang + rnd.uniform(-38, 38) + (-22 if k == 0 else 22), L * rnd.uniform(0.62, 0.8), d - 1, wd * 0.62)

    for k in range(5):
        a = 360 * k / 5 + rnd.uniform(-20, 20)
        if abs(((a - axon[0]) + 180) % 360 - 180) < 40:
            continue
        grow(cx, cy, a, 26 * s, depth, 4.2 * s)
    ax_a, ax_L = axon
    x2, y2 = pt(cx, cy, ax_L * s, ax_a)
    out = [f'<g opacity="{f(op)}">']
    paths = "".join(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(wd)}" stroke-linecap="round"/>' for d, wd in segs)
    out.append(f'<g filter="{ublur(card, name + "-ng", 3)}" opacity="0.5">{paths.replace(color, glow)}</g>')
    out.append(paths)
    out.append(f'<path d="M{f(cx)} {f(cy)} L{f(x2)} {f(y2)}" stroke="{color}" stroke-width="{f(2.2 * s)}"/>')
    for k in range(1, 7):
        t = k / 7.5
        mx, my = cx + (x2 - cx) * t, cy + (y2 - cy) * t
        out.append(f'<ellipse cx="{f(mx)}" cy="{f(my)}" rx="{f(7 * s)}" ry="{f(3.2 * s)}" fill="{color}" opacity="0.85" transform="rotate({f(ax_a - 90)} {f(mx)} {f(my)})"/>')
    for k in range(5):
        a = ax_a + (k - 2) * 22
        tx, ty = pt(x2, y2, 16 * s, a)
        out.append(f'<path d="M{f(x2)} {f(y2)} L{f(tx)} {f(ty)}" stroke="{color}" stroke-width="{f(1.2 * s)}"/>'
                   f'<circle cx="{f(tx)}" cy="{f(ty)}" r="{f(2.6 * s)}" fill="#FFFFFF"/><circle cx="{f(tx)}" cy="{f(ty)}" r="{f(7 * s)}" fill="{glow}" opacity="0.3"/>')
    for tx, ty in tips[::3]:
        out.append(f'<circle cx="{f(tx)}" cy="{f(ty)}" r="{f(1.6 * s)}" fill="#FFFFFF" opacity="0.9"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(22 * s)}" fill="{card.rgrad(name + "-sg", [(0, "#FFFFFF", 0.9), (0.3, glow, 0.5), (1, glow, 0)])}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(9 * s)}" fill="{color}"/><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(4 * s)}" fill="#FFFFFF"/>')
    out.append("</g>")
    return "".join(out)


def dna(x, y0, y1, amp, period, c1="#FFD36E", c2="#7FE0FF", rung="#FFFFFF", w=2.4, phase=0.0, op=1, vertical=True):
    """La double hélice d'ADN : deux brins qui s'enroulent (le brin d'arrière s'efface), barreaux de paires de bases."""
    n = int(abs(y1 - y0) / 2)
    back, front, rungs = [], [], []
    rnd = random.Random(int(x + y0))
    for i in range(n + 1):
        t = i / n
        y = y0 + (y1 - y0) * t
        a = phase + 2 * math.pi * (y - y0) / period
        for k, col in ((0, c1), (1, c2)):
            aa = a + k * math.pi
            px = x + amp * math.sin(aa)
            depth = math.cos(aa)
            (front if depth > 0 else back).append((px, y, col, depth))
    for i in range(0, n + 1, 4):
        y = y0 + (y1 - y0) * i / n
        a = phase + 2 * math.pi * (y - y0) / period
        xa, xb = x + amp * math.sin(a), x + amp * math.sin(a + math.pi)
        col = rnd.choice(("#FF8FD0", "#7FE0C8", "#FFD36E", "#9FB8FF"))
        rungs.append(f'<path d="M{f(xa)} {f(y)} L{f((xa + xb) / 2)} {f(y)}" stroke="{col}" stroke-width="{f(w * 0.7)}" opacity="0.8"/>'
                     f'<path d="M{f((xa + xb) / 2)} {f(y)} L{f(xb)} {f(y)}" stroke="{rung}" stroke-width="{f(w * 0.7)}" opacity="0.6"/>')
    out = [f'<g opacity="{f(op)}">']
    out += [f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(w * (0.55 + 0.25 * depth))}" fill="{col}" opacity="{f(0.35 + 0.3 * (1 + depth))}"/>' for px, py, col, depth in back]
    out += rungs
    out += [f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(w * (0.6 + 0.4 * depth))}" fill="{col}"/>' for px, py, col, depth in front]
    out.append("</g>")
    g = "".join(out)
    return g if vertical else f'<g transform="rotate(-90 {f(x)} {f(y0)})">{g}</g>'


def atom(card, name, cx, cy, r, color="#9FD8FF", nucleus=("#FF7A6A", "#7AA8FF"), orbits=3, tilt=0.32, rot=0, electrons=True, w=1.1, op=1, seed=2):
    """L'atome (le « insécable » de Démocrite) : noyau de nucléons, orbites inclinées, électrons qui brillent."""
    rnd = random.Random(seed)
    out = [f'<g opacity="{f(op)}">']
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.35)}" fill="{card.rgrad(name + "-ng", [(0, "#FFFFFF", 0.7), (1, color, 0)])}"/>')
    for k in range(orbits):
        a = rot + 180 * k / orbits
        out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r)}" ry="{f(r * tilt)}" fill="none" stroke="{color}" stroke-width="{f(w)}" transform="rotate({f(a)} {f(cx)} {f(cy)})"/>')
        if electrons:
            t = rnd.uniform(0, 2 * math.pi)
            ex, ey = r * math.cos(t), r * tilt * math.sin(t)
            ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
            px, py = cx + ex * ca - ey * sa, cy + ex * sa + ey * ca
            out.append(f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(r * 0.12)}" fill="{color}" opacity="0.35"/><circle cx="{f(px)}" cy="{f(py)}" r="{f(r * 0.05)}" fill="#FFFFFF"/>')
    out.append(nucleus_balls(cx, cy, r * 0.13, nucleus, seed))
    out.append("</g>")
    return "".join(out)


def nucleus_balls(cx, cy, r, colors=("#FF7A6A", "#7AA8FF"), seed=2, n=None):
    """Un noyau : protons et neutrons serrés, ombrés comme des perles."""
    rnd = random.Random(seed)
    n = n or 9
    out = []
    pts = [(0, 0)]
    for i in range(1, n):
        a = i * 137.5
        d = 0.48 * math.sqrt(i)
        pts.append((d * math.cos(math.radians(a)), d * math.sin(math.radians(a))))
    pts.sort(key=lambda p: -p[1])
    for i, (px, py) in enumerate(pts):
        col = colors[(i + seed) % 2]
        x, y = cx + px * r * 0.9, cy + py * r * 0.9
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.5)}" fill="{col}"/>'
                   f'<circle cx="{f(x - r * 0.15)}" cy="{f(y - r * 0.15)}" r="{f(r * 0.18)}" fill="#FFFFFF" opacity="0.6"/>')
    return "".join(out)


def p_orbital(card, name, cx, cy, L, color="#9FD8FF", rot=0, op=0.7):
    """Une orbitale p : deux lobes en goutte opposés (là où l'électron a des chances d'être)."""
    g = card.rgrad(name, [(0, "#FFFFFF", op), (0.5, color, op * 0.6), (1, color, 0)], 0.5, 0.35, 0.6)
    lobe = f"M{f(cx)} {f(cy)} C{f(cx - L * 0.55)} {f(cy - L * 0.4)} {f(cx - L * 0.45)} {f(cy - L)} {f(cx)} {f(cy - L)} C{f(cx + L * 0.45)} {f(cy - L)} {f(cx + L * 0.55)} {f(cy - L * 0.4)} {f(cx)} {f(cy)}Z"
    return (f'<g transform="rotate({f(rot)} {f(cx)} {f(cy)})"><path d="{lobe}" fill="{g}"/>'
            f'<path d="{lobe}" fill="{g}" transform="rotate(180 {f(cx)} {f(cy)})"/></g>')


def quarks(cx, cy, r, w=1.0, op=1):
    """Un proton : trois quarks (rouge, vert, bleu) liés par des gluons en ressorts."""
    cols = ("#FF5A6E", "#5AE08A", "#5A9CFF")
    P = [pt(cx, cy, r, 120 * k) for k in range(3)]
    out = [f'<g opacity="{f(op)}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.7)}" fill="none" stroke="#FFFFFF" stroke-width="{f(w * 0.6)}" opacity="0.4" stroke-dasharray="2 3"/>']
    for i in range(3):
        (ax, ay), (bx, by) = P[i], P[(i + 1) % 3]
        L = math.hypot(bx - ax, by - ay)
        ang = math.degrees(math.atan2(by - ay, bx - ax))
        n = 7
        d = f"M0 0 " + " ".join(f"q{f(L / n / 2)} {f((-1) ** k * r * 0.35)} {f(L / n)} 0" for k in range(n))
        out.append(f'<path d="{d}" fill="none" stroke="#FFE6A0" stroke-width="{f(w)}" transform="translate({f(ax)} {f(ay)}) rotate({f(ang)})"/>')
    for (x, y), c in zip(P, cols):
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.42)}" fill="{c}"/><circle cx="{f(x - r * 0.12)}" cy="{f(y - r * 0.12)}" r="{f(r * 0.14)}" fill="#FFFFFF" opacity="0.7"/>')
    out.append("</g>")
    return "".join(out)


def particle_tracks(card, name, cx, cy, n, seed=5, color="#9FE8FF", warm="#FFD36E", L=160, w=0.9, op=0.85, spread=(0, 360)):
    """Les traces d'une collision en chambre à bulles : droites, spirales qui s'enroulent, gerbes en V."""
    rnd = random.Random(seed)
    out = [f'<g opacity="{f(op)}">']
    for i in range(n):
        a0 = math.radians(rnd.uniform(*spread) - 90)
        kind = rnd.random()
        col = color if rnd.random() < 0.6 else warm
        pts = []
        x, y = cx, cy
        ang = a0
        curv = rnd.uniform(0.01, 0.05) * rnd.choice((-1, 1))
        steps = int(L * rnd.uniform(0.4, 1.0) / 3)
        for k in range(steps):
            pts.append((x, y))
            if kind < 0.45:
                curv *= 1.045
            ang += curv
            x += 3 * math.cos(ang)
            y += 3 * math.sin(ang)
        d = "M" + " L".join(f"{f(px)} {f(py)}" for px, py in pts)
        out.append(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{f(w)}" stroke-linecap="round"/>')
        if kind < 0.2 and len(pts) > 6:
            px, py = pts[len(pts) // 2]
            out.append(f'<circle cx="{f(px)}" cy="{f(py)}" r="1.4" fill="#FFFFFF"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="10" fill="{card.rgrad(name + "-v", [(0, "#FFFFFF", 1), (0.4, color, 0.5), (1, color, 0)])}"/>')
    out.append("</g>")
    return "".join(out)


def quantum_foam(card, name, region, n, seed=9, color="#B9A7FF", keep=None, rmin=2, rmax=11, op=0.7):
    """La mousse quantique : bulles d'espace-temps qui naissent et s'annihilent, translucides et irisées."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    g = card.rgrad(name, [(0, "#FFFFFF", 0.0), (0.7, color, 0.12), (0.92, "#FFFFFF", 0.55), (1, color, 0.0)])
    out = [f'<g opacity="{f(op)}">']
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if keep and not keep(x, y):
            continue
        r = rnd.uniform(rmin, rmax) * rnd.random() ** 0.5 + rmin
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{g}"/>')
        out.append(f'<path d="M{f(x - r * 0.5)} {f(y - r * 0.55)} A{f(r * 0.75)} {f(r * 0.75)} 0 0 1 {f(x + r * 0.3)} {f(y - r * 0.7)}" fill="none" stroke="#FFFFFF" stroke-width="{f(max(0.4, r * 0.08))}" opacity="0.7"/>')
    out.append("</g>")
    return "".join(out)


def string_loop(cx, cy, r, color, modes=5, amp=0.18, w=1.2, rot=0, op=1, closed=True):
    """Une corde qui vibre : boucle fermée (ou ouverte) ondulant selon un mode harmonique."""
    pts = []
    n = 120
    for i in range(n + 1):
        t = 2 * math.pi * i / n
        rr = r * (1 + amp * math.sin(modes * t + rot))
        pts.append((cx + rr * math.cos(t), cy + rr * math.sin(t) * 0.8))
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + ("Z" if closed else "")
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(w)}" opacity="{f(op)}" stroke-linejoin="round"/>'


def standing_wave(x0, x1, y, amp, harmonic, color, w=1.2, op=1, envelope=False):
    """Une corde vibrante : le n-ième harmonique (Pythagore : les intervalles sont des rapports d'entiers)."""
    n = 140
    pts = []
    for i in range(n + 1):
        t = i / n
        a = amp * math.sin(math.pi * harmonic * t)
        if envelope:
            a *= math.exp(-((t - 0.5) ** 2) / 0.04)
        pts.append((x0 + (x1 - x0) * t, y + a))
    d = "M" + " L".join(f"{f(a)} {f(b)}" for a, b in pts)
    mirror = "M" + " L".join(f"{f(a)} {f(2 * y - b)}" for a, b in pts)
    return f'<path d="{d} {mirror}" fill="none" stroke="{color}" stroke-width="{f(w)}" opacity="{f(op)}"/>'


def wave_packet(x0, x1, y, amp, k, color, w=1.2, op=1, sigma=0.12, vertical=False):
    """Un paquet d'ondes (la particule vue comme une onde) ; `vertical` : il court de haut en bas, centré sur x = y."""
    n = 220
    pts = []
    for i in range(n + 1):
        t = i / n
        a = amp * math.cos(2 * math.pi * k * t) * math.exp(-((t - 0.5) ** 2) / (2 * sigma ** 2))
        along = x0 + (x1 - x0) * t
        pts.append((y + a, along) if vertical else (along, y + a))
    d = "M" + " L".join(f"{f(a)} {f(b)}" for a, b in pts)
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(w)}" opacity="{f(op)}"/>'


def concentric(cx, cy, r0, step, n, color, w=1.0, op=0.6, a0=None, a1=None, fade=True, dash=None):
    """Ondes concentriques (la voix, les orbites)."""
    out = []
    for i in range(n):
        r = r0 + step * i
        o = op * (1 - i / n) if fade else op
        da = f' stroke-dasharray="{dash}"' if dash else ""
        if a0 is None:
            out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="{color}" stroke-width="{f(w)}" opacity="{f(o)}"{da}/>')
        else:
            x1, y1 = pt(cx, cy, r, a0)
            x2, y2 = pt(cx, cy, r, a1)
            big = 1 if (a1 - a0) > 180 else 0
            out.append(f'<path d="M{f(x1)} {f(y1)} A{f(r)} {f(r)} 0 {big} 1 {f(x2)} {f(y2)}" fill="none" stroke="{color}" stroke-width="{f(w)}" opacity="{f(o)}"{da}/>')
    return "".join(out)


def thread(card, name, w=1.0, color="#FFE6A0", fill_op=0.1, glow=2.0):
    """Filtre « fil d'or » : la silhouette d'une forme devient un contour lumineux sur un voile translucide
    (comme les figures des atlas célestes tracées autour des étoiles)."""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" filterUnits="userSpaceOnUse" x="-40" y="-40" width="{W + 80}" height="{H + 80}" color-interpolation-filters="sRGB">'
        f'<feMorphology in="SourceAlpha" operator="erode" radius="{w}" result="e"/>'
        f'<feComposite in="SourceAlpha" in2="e" operator="out" result="ring"/>'
        f'<feFlood flood-color="{color}"/><feComposite in2="ring" operator="in" result="line"/>'
        f'<feGaussianBlur in="line" stdDeviation="{glow}" result="gl"/>'
        f'<feFlood flood-color="{color}" flood-opacity="{fill_op}"/><feComposite in2="SourceAlpha" operator="in" result="veil"/>'
        f'<feMerge><feMergeNode in="veil"/><feMergeNode in="gl"/><feMergeNode in="gl"/><feMergeNode in="line"/></feMerge></filter>',
    )
    return f"url(#{card.id(name)})"


def night(card, mask, seed=1, top="#04061A", mid="#0E1640", low="#1A1030", n=420, region=(0, 0, W, H)):
    """Un ciel de nuit profonde : dégradé, poussière d'étoiles, quelques astres scintillants."""
    card.add(f'<g mask="{mask}"><rect width="{W}" height="{H}" fill="{card.grad(f"night-{seed}", [(0, top), (0.5, mid), (1, low)])}"/></g>')
    card.add(f'<g mask="{mask}">{star_field(seed, n, region, rmax=1.5, bright=0.04)}</g>')


def _qb(p0, p1, p2, t):
    x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
    y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
    dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0])
    dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1])
    n = math.hypot(dx, dy) or 1
    return x, y, -dy / n, dx / n


def milky_band(card, name, p0, p1, p2, width, seed=5, n=1400, warm="#FFE2C8", cool="#C8D8FF", rose="#FF8FC8", op=1.0):
    """Une bande de Voie lactée : lueur diffuse marbrée, poussière d'étoiles dense, nuages sombres de poussière."""
    rnd = random.Random(seed)
    d = f"M{f(p0[0])} {f(p0[1])} Q{f(p1[0])} {f(p1[1])} {f(p2[0])} {f(p2[1])}"
    out = [f'<g opacity="{f(op)}">']
    out.append(f'<path d="{d}" fill="none" stroke="{cool}" stroke-width="{f(width * 2.2)}" stroke-linecap="round" opacity="0.16" filter="{ublur(card, name + "-b1", width * 0.6)}"/>')
    out.append(f'<g filter="{ucloud(card, name + "-cf", 0.016, 5, seed, 2.0, -0.4)}"><path d="{d}" fill="none" stroke="{warm}" stroke-width="{f(width)}" stroke-linecap="round" opacity="0.8" filter="{ublur(card, name + "-b2", width * 0.25)}"/></g>')
    out.append(f'<g filter="{ucloud(card, name + "-rf", 0.022, 4, seed + 4, 2.4, -1.0)}"><path d="{d}" fill="none" stroke="{rose}" stroke-width="{f(width * 0.9)}" stroke-linecap="round" opacity="0.7" filter="{ublur(card, name + "-b5", width * 0.2)}"/></g>')
    pts = []
    for _ in range(n):
        t = rnd.random()
        x, y, nx, ny = _qb(p0, p1, p2, t)
        off = rnd.gauss(0, width * 0.34)
        r = rnd.uniform(0.25, 0.9) if rnd.random() < 0.95 else rnd.uniform(1.0, 1.7)
        pts.append(f'<circle cx="{f(x + nx * off)}" cy="{f(y + ny * off)}" r="{f(r)}" fill="#FFFFFF" opacity="{f(rnd.uniform(0.3, 1))}"/>')
    out.append("".join(pts))
    out.append(f'<g filter="{ucloud(card, name + "-df", 0.03, 4, seed + 3, 3.0, -1.1)}"><path d="{d}" fill="none" stroke="#04030C" stroke-width="{f(width * 0.35)}" stroke-linecap="round" opacity="0.85" filter="{ublur(card, name + "-b4", width * 0.07)}"/></g>')
    out.append("</g>")
    return "".join(out)


def nebula_field(card, mask, seed, clouds, band=None, base=("#04031A", "#100A36", "#08061C"), stars=520, flares=8):
    """Un champ cosmique dense : fond, lueurs colorées, nuées à volutes, Voie lactée, étoiles et astres scintillants."""
    rnd = random.Random(seed)
    out = [f'<rect width="{W}" height="{H}" fill="{card.grad(f"nf-{seed}", [(0, base[0]), (0.5, base[1]), (1, base[2])])}"/>']
    for i, (x, y, rx, ry, c1, c2, op) in enumerate(clouds):
        out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(rx * 1.2)}" ry="{f(ry * 1.2)}" fill="{card.rgrad(f"nf{seed}-glow{i}", [(0, c1, op * 0.45), (0.6, c2, op * 0.2), (1, c2, 0)])}"/>')
    for i, (x, y, rx, ry, c1, c2, op) in enumerate(clouds):
        g = card.rgrad(f"nf{seed}-c{i}", [(0, c1, min(1, op * 1.1)), (0.45, c2, op * 0.8), (1, c2, 0)])
        out.append(f'<g filter="{ucloud(card, f"nf{seed}-cf{i}", 0.013 + 0.004 * (i % 3), 5, seed + i * 7, 2.0, -0.45)}"><ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(rx)}" ry="{f(ry)}" fill="{g}"/></g>')
        out.append(f'<g filter="{ucloud(card, f"nf{seed}-hf{i}", 0.03, 4, seed + i * 11, 3.2, -1.5)}"><ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(rx * 0.7)}" ry="{f(ry * 0.7)}" fill="{card.rgrad(f"nf{seed}-h{i}", [(0, "#FFFFFF", 0.7), (0.5, c1, 0.5), (1, c1, 0)])}"/></g>')
    if band:
        out.append(milky_band(card, f"nf{seed}-mw", *band, seed=seed + 2))
    out.append(star_field(seed + 1, stars, (0, 0, W, H), rmax=1.4, bright=0.03))
    for _ in range(flares):
        x, y = rnd.uniform(10, W - 10), rnd.uniform(10, H - 10)
        out.append(flare(x, y, rnd.uniform(6, 14), "#FFFFFF", 0.9, 0.05))
    card.add(f'<g mask="{mask}">{"".join(out)}</g>')
