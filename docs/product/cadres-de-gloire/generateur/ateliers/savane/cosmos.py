"""Savane d'or - le ciel : Voie lactée, nébuleuses, galaxies, trous noirs, supernovæ, quasars, constellations."""

import math
import random

from base import W, H, f, pt, sparkle, galaxy

from motifs import LION_BODY, ELEPHANT, GIRAFFE


def ublur(card, name, sd):
    """Flou dont la région couvre toute la carte (les tracés fins ne sont jamais rognés)."""
    card.def_once(name, f'<filter id="{card.id(name)}" filterUnits="userSpaceOnUse" x="-40" y="-40" width="{W + 80}" height="{H + 80}"><feGaussianBlur stdDeviation="{sd}"/></filter>')
    return f"url(#{card.id(name)})"


def cloud_filter(card, name, freq="0.012", octaves=4, seed=3, a=2.4, b=-0.9):
    """Filtre : la forme filtrée ne garde sa couleur que là où le bruit fractal est dense (nuages, nébuleuses)."""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" filterUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="{octaves}" seed="{seed}" result="n"/>'
        f'<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  {a} 0 0 0 {b}" result="m"/>'
        f'<feComposite in="SourceGraphic" in2="m" operator="in"/></filter>',
    )
    return f"url(#{card.id(name)})"


def nebula_cloud(card, name, cx, cy, rx, ry, c1, c2, op=0.9, freq="0.011", seed=5, rot=0, a=2.6, b=-0.85):
    g = card.rgrad(name + "-g", [(0, c1, op), (0.45, c2, op * 0.75), (1, c2, 0)])
    filt = cloud_filter(card, name + "-f", freq, 5, seed, a, b)
    tr = f' transform="rotate({rot} {f(cx)} {f(cy)})"' if rot else ""
    return f'<g filter="{filt}"><ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{g}"{tr}/></g>'


def _bez(p0, p1, p2, t):
    x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
    y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
    dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0])
    dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1])
    n = math.hypot(dx, dy) or 1
    return x, y, -dy / n, dx / n


def milky_way(card, name, p0, p1, p2, width, seed=21, n=1600, glow="#CFE0FF", warm="#FFE2B8", dust_color="#03040C", rose="#FF8FB8", keep=None, op=1.0):
    """La Voie lactée - « la colonne vertébrale de la nuit » des San du Kalahari."""
    rnd = random.Random(seed)
    d = f"M{f(p0[0])} {f(p0[1])} Q{f(p1[0])} {f(p1[1])} {f(p2[0])} {f(p2[1])}"
    out = [f'<g opacity="{f(op)}">']
    out.append(f'<path d="{d}" fill="none" stroke="{glow}" stroke-width="{f(width * 2.4)}" stroke-linecap="round" opacity="0.13" filter="{ublur(card, name + "-b1", width * 0.7)}"/>')
    soft = ublur(card, name + "-b3", width * 0.28)
    out.append(f'<g filter="{cloud_filter(card, name + "-cf", "0.016", 5, seed, 2.0, -0.45)}"><path d="{d}" fill="none" stroke="{warm}" stroke-width="{f(width * 1.1)}" stroke-linecap="round" opacity="0.7" filter="{soft}"/></g>')
    out.append(f'<path d="{d}" fill="none" stroke="{warm}" stroke-width="{f(width * 0.32)}" stroke-linecap="round" opacity="0.32" filter="{ublur(card, name + "-b2", width * 0.2)}"/>')
    pts = []
    for _ in range(n):
        t = rnd.random()
        x, y, nx, ny = _bez(p0, p1, p2, t)
        off = rnd.gauss(0, width * 0.36)
        sx, sy = x + nx * off, y + ny * off
        if keep and keep(sx, sy):
            continue
        r = rnd.uniform(0.25, 0.95) if rnd.random() < 0.94 else rnd.uniform(1.0, 1.8)
        pts.append(f'<circle cx="{f(sx)}" cy="{f(sy)}" r="{f(r)}" fill="#FFFFFF" opacity="{f(rnd.uniform(0.3, 1))}"/>')
    out.append("".join(pts))
    out.append(f'<g filter="{cloud_filter(card, name + "-df", "0.028 0.02", 4, seed + 3, 3.0, -1.05)}"><path d="{d}" fill="none" stroke="{dust_color}" stroke-width="{f(width * 0.4)}" stroke-linecap="round" opacity="0.9" filter="{ublur(card, name + "-b4", width * 0.08)}" transform="translate({f(width * 0.06)} {f(width * 0.03)})"/></g>')
    if rose:
        x, y, _, _ = _bez(p0, p1, p2, 0.42)
        out.append(nebula_cloud(card, name + "-rose", x, y, width * 0.55, width * 0.38, rose, "#B03A7A", 0.75, "0.03", seed + 7))
    out.append("</g>")
    return "".join(out)


def spiral_galaxy(card, name, cx, cy, r, color="#CFE0FF", tilt=0.42, rot=0.0, seed=11, n=520, core="#FFF4D6", arm_tint="#9FB8FF", glow_op=0.55):
    out = [f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 1.05)}" ry="{f(r * 1.05 * tilt)}" fill="{card.rgrad(name + "-gl", [(0, core, glow_op), (0.25, arm_tint, glow_op * 0.45), (1, arm_tint, 0)])}"/>']
    out.append(f'<g filter="{card.blur(name + "-sb", 0.35)}">{galaxy(cx, cy, r, color, 2, tilt, rot, seed, n, core)}</g>')
    out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 0.22)}" ry="{f(r * 0.22 * tilt)}" fill="{card.rgrad(name + "-c", [(0, "#FFFFFF", 1), (0.5, core, 0.8), (1, core, 0)])}"/>')
    return "".join(out)


def black_hole(card, name, cx, cy, r, tilt=0.26, hot="#FFF2D0", warm="#FFB347", deep="#C2410C", ring="#FFE3B0", disk=3.4):
    """Trou noir : disque d'accrétion incliné, anneau de photons, arc lentillé au-dessus de l'horizon."""
    rx, ry = r * disk, r * disk * tilt
    dg = card.grad(name + "-dg", [(0, hot), (0.2, "#FFFFFF"), (0.42, hot), (0.7, warm), (1, deep)], 0, 0, 1, 0)
    halo = card.rgrad(name + "-halo", [(0, warm, 0.55), (0.4, deep, 0.22), (1, deep, 0)])
    out = [f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx * 1.5)}" ry="{f(r * 2.6)}" fill="{halo}"/>']
    back = f'<clipPath id="{card.id(name + "-top")}"><rect x="0" y="0" width="{W}" height="{f(cy)}"/></clipPath>'
    front = f'<clipPath id="{card.id(name + "-bot")}"><rect x="0" y="{f(cy)}" width="{W}" height="{f(H - cy)}"/></clipPath>'
    card.def_once(name + "-top", back)
    card.def_once(name + "-bot", front)
    rings = []
    for i, (k, w, op) in enumerate(((1.0, r * 0.55, 0.95), (0.8, r * 0.35, 0.9), (1.2, r * 0.25, 0.6), (0.62, r * 0.2, 0.8))):
        rings.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx * k)}" ry="{f(ry * k)}" fill="none" stroke="{dg}" stroke-width="{f(w)}" opacity="{op}"/>')
    disk_m = "".join(rings)
    blur = card.blur(name + "-db", r * 0.06)
    out.append(f'<g clip-path="url(#{card.id(name + "-top")})" filter="{blur}">{disk_m}</g>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.32)}" fill="none" stroke="{ring}" stroke-width="{f(r * 0.22)}" opacity="0.9" filter="{card.blur(name + "-rb", r * 0.08)}"/>')
    out.append(f'<path d="M{f(cx - r * 1.6)} {f(cy)} A{f(r * 1.6)} {f(r * 1.5)} 0 0 1 {f(cx + r * 1.6)} {f(cy)}" fill="none" stroke="{dg}" stroke-width="{f(r * 0.42)}" opacity="0.85" filter="{blur}"/>')
    out.append(f'<path d="M{f(cx - r * 1.45)} {f(cy)} A{f(r * 1.45)} {f(r * 1.25)} 0 0 0 {f(cx + r * 1.45)} {f(cy)}" fill="none" stroke="{warm}" stroke-width="{f(r * 0.12)}" opacity="0.7" filter="{blur}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="#000000"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.04)}" fill="none" stroke="{hot}" stroke-width="{f(r * 0.05)}" opacity="0.9"/>')
    out.append(f'<g clip-path="url(#{card.id(name + "-bot")})" filter="{blur}">{disk_m}</g>')
    out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx * 0.95)}" ry="{f(ry * 0.3)}" fill="{hot}" opacity="0.35" filter="{card.blur(name + "-lb", r * 0.15)}"/>')
    return "".join(out)


def supernova(card, name, cx, cy, r, core="#FFFFFF", c1="#FFE8A8", c2="#FF6A3D", c3="#7A3CFF", seed=31):
    """Supernova : coquille filamenteuse en expansion, cœur aveuglant, aigrettes."""
    shell = card.rgrad(name + "-shell", [(0, c1, 0), (0.45, c1, 0.25), (0.72, c2, 0.95), (0.86, c3, 0.8), (1, c3, 0)])
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 2.2)}" fill="{card.rgrad(name + "-h", [(0, c1, 0.4), (0.3, c2, 0.18), (0.7, c3, 0.08), (1, c3, 0)])}"/>']
    out.append(f'<g filter="{cloud_filter(card, name + "-f1", "0.045", 4, seed, 2.6, -0.7)}"><ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 1.08)}" ry="{f(r)}" fill="{shell}"/></g>')
    out.append(f'<g filter="{cloud_filter(card, name + "-f2", "0.09", 3, seed + 1, 3.4, -1.6)}" style="mix-blend-mode:screen"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.95)}" fill="{shell}"/></g>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.4)}" fill="{card.rgrad(name + "-c", [(0, core, 1), (0.3, c1, 0.85), (1, c1, 0)])}"/>')
    out.append(star_flare(cx, cy, r * 1.5, core, 1, 0.04))
    return "".join(out)


def star_flare(cx, cy, r, color, op=1, thin=0.05):
    return (
        f'<g opacity="{f(op)}">'
        f'<path d="M{f(cx - r)} {f(cy)} Q{f(cx)} {f(cy - r * thin)} {f(cx + r)} {f(cy)} Q{f(cx)} {f(cy + r * thin)} {f(cx - r)} {f(cy)} Z" fill="{color}"/>'
        f'<path d="M{f(cx)} {f(cy - r)} Q{f(cx + r * thin)} {f(cy)} {f(cx)} {f(cy + r)} Q{f(cx - r * thin)} {f(cy)} {f(cx)} {f(cy - r)} Z" fill="{color}"/>'
        f'{sparkle(cx, cy, r * 0.3, color, 1)}</g>'
    )


def quasar(card, name, cx, cy, length, angle=0, color="#BFE6FF", core="#FFFFFF", width=10):
    """Quasar : noyau aveuglant, deux jets opposés qui s'effilent."""
    g = card.grad(name + "-j", [(0, color + "00"), (0.5, color), (1, color + "00")], 0, 0, 1, 0)
    out = [f'<g transform="rotate({angle} {f(cx)} {f(cy)})" style="mix-blend-mode:screen">']
    out.append(f'<path d="M{f(cx - length)} {f(cy)} Q{f(cx)} {f(cy - width)} {f(cx + length)} {f(cy)} Q{f(cx)} {f(cy + width)} {f(cx - length)} {f(cy)} Z" fill="{g}" opacity="0.85" filter="{card.blur(name + "-jb", 2.5)}"/>')
    out.append(f'<path d="M{f(cx - length * 0.8)} {f(cy)} Q{f(cx)} {f(cy - width * 0.25)} {f(cx + length * 0.8)} {f(cy)} Q{f(cx)} {f(cy + width * 0.25)} {f(cx - length * 0.8)} {f(cy)} Z" fill="{core}" opacity="0.9"/>')
    out.append("</g>")
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(width * 3)}" fill="{card.rgrad(name + "-c", [(0, core, 1), (0.25, color, 0.7), (1, color, 0)])}"/>')
    out.append(star_flare(cx, cy, width * 4.5, core, 0.95))
    return "".join(out)


def cstar(x, y, r, color="#FFFFFF", glow=None):
    g = f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 3.2)}" fill="{glow or color}" opacity="0.18"/>' if r > 1.4 else ""
    return g + f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{color}"/>' + (sparkle(x, y, r * 3.2, color, 0.9) if r > 2.2 else "")


# Constellations animales : sommets anatomiques (repère des silhouettes de motifs.py) et tracés.
CONST = {
    "lion": {
        "path": LION_BODY,
        "pts": {"nez": (197, -72), "front": (181, -96), "criniere": (152, -116), "garrot": (124, -84), "croupe": (36, -72),
                 "queue": (5, -22), "jarret": (45, -30), "pied_ar": (36, 0), "poitrail": (166, -40), "pied_av": (160, 0), "ventre": (100, -38)},
        "lines": [("queue", "croupe"), ("croupe", "garrot"), ("garrot", "criniere"), ("criniere", "front"), ("front", "nez"),
                  ("nez", "poitrail"), ("poitrail", "pied_av"), ("croupe", "jarret"), ("jarret", "pied_ar"), ("ventre", "jarret"), ("poitrail", "ventre"), ("garrot", "poitrail")],
        "big": ("criniere", "nez", "croupe"),
    },
    "elephant": {
        "path": ELEPHANT,
        "pts": {"trompe": (194, -2), "front": (180, -96), "tete": (160, -126), "dos": (108, -124), "croupe": (22, -104),
                 "queue": (13, -60), "pied_ar": (52, 0), "pied_av": (148, 0), "ventre": (98, -50), "defense": (196, -58), "oreille": (138, -86)},
        "lines": [("trompe", "front"), ("front", "tete"), ("tete", "dos"), ("dos", "croupe"), ("croupe", "queue"), ("croupe", "pied_ar"),
                  ("pied_ar", "ventre"), ("ventre", "pied_av"), ("pied_av", "oreille"), ("oreille", "tete"), ("front", "defense")],
        "big": ("tete", "trompe", "croupe"),
    },
    "giraffe": {
        "path": GIRAFFE,
        "pts": {"museau": (142, -238), "corne": (116, -264), "nuque": (110, -248), "garrot": (70, -162), "croupe": (16, -138),
                 "queue": (6, -92), "pied_ar": (20, 0), "pied_av": (80, 0), "poitrail": (82, -128), "gorge": (100, -208), "ventre": (44, -112)},
        "lines": [("museau", "nuque"), ("nuque", "corne"), ("nuque", "garrot"), ("garrot", "croupe"), ("croupe", "queue"), ("croupe", "pied_ar"),
                  ("museau", "gorge"), ("gorge", "poitrail"), ("poitrail", "pied_av"), ("poitrail", "ventre"), ("ventre", "croupe")],
        "big": ("museau", "garrot", "croupe"),
    },
}


def constellation(card, name, kind, x, y, s, color="#FFE9B0", line="#FFE9B0", flip=False, ghost=0.08, line_op=0.55, star_r=1.6, rot=0):
    """Un animal devenu constellation : silhouette fantôme, traits fins, étoiles aux articulations."""
    spec = CONST[kind]
    sx = -s if flip else s
    cr, sr = math.cos(math.radians(rot)), math.sin(math.radians(rot))

    def tp(p):
        px, py = p[0] * sx, p[1] * s
        return x + px * cr - py * sr, y + px * sr + py * cr

    out = []
    if ghost:
        out.append(f'<g transform="translate({f(x)} {f(y)}) rotate({rot}) scale({f(sx)} {f(s)})"><path d="{spec["path"]}" fill="{color}" opacity="{ghost}" stroke="{color}" stroke-width="{f(1.2 / s)}" stroke-opacity="{ghost * 2.6}"/></g>')
    pts = {k: tp(v) for k, v in spec["pts"].items()}
    ln = "".join(f'<line x1="{f(pts[a][0])}" y1="{f(pts[a][1])}" x2="{f(pts[b][0])}" y2="{f(pts[b][1])}"/>' for a, b in spec["lines"])
    out.append(f'<g stroke="{line}" stroke-width="1" opacity="{line_op}" stroke-linecap="round">{ln}</g>')
    for k, (px, py) in pts.items():
        out.append(cstar(px, py, star_r * (1.8 if k in spec["big"] else 1), color))
    return "".join(out)


def star_field(seed, n, region, color="#FFFFFF", rmax=1.5, keep=None, bright=0.04):
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if keep and keep(x, y):
            continue
        if rnd.random() < bright:
            out.append(cstar(x, y, rnd.uniform(1.6, 2.6), color))
        else:
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(0.3, rmax))}" fill="{color}" opacity="{f(rnd.uniform(0.3, 1))}"/>')
    return "".join(out)


def cluster(seed, cx, cy, r, n, color="#FFFFFF"):
    """Un amas globulaire : densité qui croît vers le cœur."""
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        rr = abs(rnd.gauss(0, r * 0.45))
        a = rnd.uniform(0, 2 * math.pi)
        out.append(f'<circle cx="{f(cx + rr * math.cos(a))}" cy="{f(cy + rr * math.sin(a))}" r="{f(rnd.uniform(0.3, 1.1))}" fill="{color}" opacity="{f(rnd.uniform(0.5, 1))}"/>')
    return "".join(out)


def waves(cx, cy, r0, n, step, color, w=1.2, op=0.5, ry=None):
    """Ondes (gravitationnelles, sonores) : anneaux concentriques qui s'estompent."""
    out = []
    for i in range(n):
        r = r0 + i * step
        o = op * (1 - i / n)
        if ry:
            out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r)}" ry="{f(r * ry)}" fill="none" stroke="{color}" stroke-width="{f(w)}" opacity="{f(o)}"/>')
        else:
            out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="{color}" stroke-width="{f(w)}" opacity="{f(o)}"/>')
    return "".join(out)


def grand_galaxy(card, name, cx, cy, r, tilt=0.4, rot=0.3, seed=42, core="#FFF6E8", arm="#B9A7FF", pink="#FF8FD0", blue="#7FB8FF", n=2400, turns=4.6):
    """Une galaxie spirale immense : disque diffus marbré, bras effilés roses et bleus, régions HII, bulbe d'or, aigrette."""
    rnd = random.Random(seed)
    out = []
    out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 1.3)}" ry="{f(r * 1.3 * tilt)}" fill="{card.rgrad(name + "-halo", [(0, core, 0.9), (0.15, pink, 0.5), (0.45, arm, 0.28), (1, blue, 0)])}"/>')
    disk_f = cloud_filter(card, name + "-df", "0.02", 4, seed + 1, 1.8, -0.3)
    out.append(f'<g filter="{disk_f}"><ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r)}" ry="{f(r * tilt)}" fill="{card.rgrad(name + "-disk", [(0, "#FFE6F4", 0.9), (0.5, arm, 0.55), (1, blue, 0)])}"/></g>')
    filt = cloud_filter(card, name + "-af", "0.035", 4, seed, 2.0, -0.45)
    soft = ublur(card, name + "-ab", r * 0.03)
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
            w = r * 0.2 * (1 - 0.65 * tm)
            op = 0.95 * (1 - 0.55 * tm)
            col_out, col_in = (arm, pink) if k == 0 else (blue, "#FFD0F0")
            out.append(f'<g filter="{filt}"><path d="{d}" fill="none" stroke="{col_out}" stroke-width="{f(w)}" stroke-linecap="round" opacity="{f(op)}" filter="{soft}"/></g>')
            out.append(f'<path d="{d}" fill="none" stroke="{col_in}" stroke-width="{f(w * 0.35)}" stroke-linecap="round" opacity="{f(op * 0.55)}" filter="{ublur(card, name + "-ab2", 2.5)}"/>')
    out.append(galaxy(cx, cy, r, "#FFFFFF", 2, tilt, rot, seed, n, core))
    for _ in range(30):
        t = rnd.uniform(0.2, 0.9)
        k = rnd.choice((0, 1))
        ang = rot + k * math.pi + t * turns + rnd.gauss(0, 0.06)
        rr = r * (0.1 + 0.9 * t)
        x, y = cx + rr * math.cos(ang), cy + rr * math.sin(ang) * tilt
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(1.6, 4))}" fill="{rnd.choice((pink, "#FF6FB1", "#FFD0F0"))}" opacity="0.75" filter="{card.blur(name + "-hii", 1.2)}"/>')
    out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 0.34)}" ry="{f(r * 0.34 * tilt * 1.2)}" fill="{card.rgrad(name + "-bulge", [(0, "#FFFFFF", 1), (0.3, core, 0.95), (0.7, "#FFD9A0", 0.4), (1, "#FFD9A0", 0)])}"/>')
    out.append(star_flare(cx, cy, r * 0.6, "#FFFFFF", 0.95, 0.025))
    return "".join(out)
