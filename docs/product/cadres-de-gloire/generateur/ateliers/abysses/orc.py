"""Abysses - Oracle A, B, C : le ciel s'ouvre au-dessus de la mer de nuit, et l'on entrevoit l'infime
(diatomées, radiolaires, cristaux de glace, géométrie sacrée). Métal platine."""

import math
import random

from common import *  # noqa: F401,F403
from sea import place, jellyfish, manta_path, school
from reef import seagrass, mix
from shells import nautilus_cut, nautilus_light
from cosmos import (starfield, constellation, diatom, pennate, radiolarian, snow_crystal, koch, flower_of_life,
                    golden_spiral, foraminifera, moon, cell)


def lens(card, name, cx, cy, r, inner):
    """Médaillon de microscope : verre sombre, bague de platine, réticule."""
    hi, mid, lo = PLATINUM
    ring = metal_grad(card, "lens-ring", PLATINUM)
    glass = card.rgrad("lens-glass", [(0, "#0E3A5A", 0.95), (0.8, "#061A33", 0.95), (1, "#020A18", 1)], 0.45, 0.4, 0.6)
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{glass}"/>',
           f'<line x1="{f(cx - r * 0.8)}" y1="{f(cy)}" x2="{f(cx + r * 0.8)}" y2="{f(cy)}" stroke="{mid}" stroke-width="0.4" opacity="0.4"/>',
           f'<line x1="{f(cx)}" y1="{f(cy - r * 0.8)}" x2="{f(cx)}" y2="{f(cy + r * 0.8)}" stroke="{mid}" stroke-width="0.4" opacity="0.4"/>',
           inner,
           f'<path d="M{f(cx - r * 0.7)} {f(cy - r * 0.45)} A{f(r * 0.85)} {f(r * 0.85)} 0 0 1 {f(cx - r * 0.1)} {f(cy - r * 0.84)}" fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" opacity="0.5"/>']
    rimg = f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r + 2.5)}" fill="none" stroke="{ring}" stroke-width="5"/>'
    ticks = "".join(f'<line x1="{f(pt(cx, cy, r + 5, a)[0])}" y1="{f(pt(cx, cy, r + 5, a)[1])}" x2="{f(pt(cx, cy, r + 9, a)[0])}" y2="{f(pt(cx, cy, r + 9, a)[1])}" stroke="{hi}" stroke-width="1.2"/>' for a in range(0, 360, 30))
    return "".join(out) + f'<g filter="{bevel(card, "lens-bv", 0.8, 2, 2, 3, 0.6)}">{rimg}</g>' + f'<g opacity="0.8">{ticks}</g>'


def coccolith(card, name, cx, cy, r, col="#E8FBFF"):
    rnd = random.Random(3)
    g = card.rgrad(name + "-g", [(0, "#FFFFFF", 0.4), (1, col, 0.15)])
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/>']
    for i in range(16):
        a = rnd.uniform(0, 360)
        d = r * (0.25 + 0.7 * rnd.random())
        x, y = pt(cx, cy, d, a)
        out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(r * 0.34)}" ry="{f(r * 0.22)}" fill="none" stroke="{col}" stroke-width="{f(r * 0.05)}" transform="rotate({f(a)} {f(x)} {f(y)})"/>'
                   f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(r * 0.14)}" ry="{f(r * 0.08)}" fill="none" stroke="{col}" stroke-width="{f(r * 0.03)}" transform="rotate({f(a)} {f(x)} {f(y)})"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="{col}" stroke-width="{f(r * 0.04)}"/>')
    return f'<g filter="{glow(card, name + "-gl", 1, 1)}">{"".join(out)}</g>'


def plankton_swirl(card, name, seed, cx, cy, r, n=220, cols=("#7FF6FF", "#BFFBFF", "#9FB8FF"), arms=3, tilt=0.35):
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        k = i % arms
        t = rnd.random()
        a = k * 2 * math.pi / arms + t * 4 + rnd.gauss(0, 0.18)
        rr = r * t
        x, y = cx + rr * math.cos(a), cy + rr * math.sin(a) * tilt
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(0.5, 1.8))}" fill="{rnd.choice(cols)}" opacity="{f(rnd.uniform(0.4, 1))}"/>')
    return f'<g filter="{glow(card, name, 1.6, 2)}">{"".join(out)}</g>'


def manta_stars(cx, cy, s, rot=0):
    pts = manta_path(100, 0.25, 0.0)
    idx = [0, 4, 7, 8, 9, 11, 14, 16, 18, 20, 23, 25, 27, 30, 31]
    sel = [pts[i] for i in idx if i < len(pts)]
    ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    return [(cx + (x * ca - y * sa) * s, cy + (x * sa + y * ca) * s) for x, y in sel]


# ---------------------------------------------------------------- Oracle A : le plancton d'étoiles

def orc_a():
    c = start("ra")
    win = ogive(84, 456, 252, 372, 724, 22)
    mp = manta_stars(270, 132, 2.05)
    n = len(mp)
    edges = [(i, (i + 1) % n) for i in range(n)]
    parts = [
        water(c, [(0, "#10285A"), (0.35, "#081A42"), (0.7, "#050F2A"), (1, "#020618")]),
        radial(c, "moonlight", 92, 30, 220, 160, "#CFE6FF", 0.45),
        moon(c, "mo", 70, 40, 20),
        starfield(c, 3, 260, (0, 0, W, 330), bright=7),
        f'<path d="{smooth(manta_path(100, 0.25, 0.0), True, 6)}" transform="translate(270 132) scale(2.05)" fill="#7FF6FF" opacity="0.07"/>',
        f'<path d="{smooth(manta_path(100, 0.25, 0.0), True, 6)}" transform="translate(270 132) scale(2.05)" fill="none" stroke="#9FF4FF" stroke-width="0.5" stroke-dasharray="1 3" opacity="0.6"/>',
        constellation(c, mp, edges, "#9FF4FF", "#FFFFFF", 0.9, 0.55, (1.4, 2.8), 5, "mc"),
        plankton_swirl(c, "ps1", 4, 270, 905, 300, 260),
        plankton_swirl(c, "ps2", 9, 40, 560, 120, 90, arms=2, tilt=1.6),
        plankton_swirl(c, "ps3", 11, 500, 470, 120, 90, arms=2, tilt=1.6),
        marine_snow(41, 100, "#BFE6FF"),
    ]
    deco(c, win, parts)
    window_finish(c, win, PLATINUM, 5, tint="#9FD8FF", tint_op=0.16, glow_col="#7FF6FF")
    meds = [
        (46, 330, lambda x, y: diatom(c, "d1", x, y, 26, "#BFFBFF", 24)),
        (494, 330, lambda x, y: radiolarian(c, "r1", x, y, 13, "#E6FCFF", 12)),
        (46, 474, lambda x, y: snow_crystal(x, y, 24, "#E8FBFF", 1.1)),
        (494, 474, lambda x, y: pennate(c, "p1", x, y, 52, "#BFFBFF", 60)),
        (46, 618, lambda x, y: coccolith(c, "co", x, y, 20)),
        (494, 618, lambda x, y: diatom(c, "d2", x, y, 24, "#FFE7A8", 18, rot=10)),
    ]
    for x, y, fn in meds:
        c.add(lens(c, "ln", x, y, 32, fn(x, y)))
    c.add(f'<g opacity="0.7">{"".join(f"<line x1=\'46\' y1=\'{y + 34}\' x2=\'46\' y2=\'{y + 110}\' stroke=\'#C9D3E0\' stroke-width=\'1\' stroke-dasharray=\'2 4\'/>" for y in (330, 474))}'
          f'{"".join(f"<line x1=\'494\' y1=\'{y + 34}\' x2=\'494\' y2=\'{y + 110}\' stroke=\'#C9D3E0\' stroke-width=\'1\' stroke-dasharray=\'2 4\'/>" for y in (330, 474))}</g>')
    crest_block(c, 270, 146, 0.86, "platinum", None, halo_col="#9FD8FF", halo_op=0.4)
    inscription(c, "Oracle", "Jusqu'aux étoiles", style="abysse", metal=PLATINUM, accent="#9FF4FF")
    mee_meo(c, "ruban", "mee-wow", "meo-feu-artifice")
    c.add(outer_frame(c, PLATINUM, 10, 3, 24, "of"))
    save(c, "oracle-a")
    register("oracle-a", "oracle", None, "A", "Le Plancton d'étoiles",
             "La mer de nuit s'ouvre sur le ciel : les étoiles dessinent une raie manta au-dessus du blason et le plancton bioluminescent tourbillonne "
             "comme des galaxies ; sur les côtés, six lentilles de microscope révèlent l'infime de l'océan — diatomées, radiolaire, coccolithe, cristal de glace.",
             "ruban : Mee (wow) et Meo (feu d'artifice) aux coins de la plaque", "Jusqu'aux étoiles")


# ---------------------------------------------------------------- Oracle B : la lune des méduses

def moon_jelly(card, name, r, seed, op=1.0, bell="#DCD6FF", core="#FFB8E0"):
    """Méduse-lune (Aurelia) : ombrelle translucide, quatre gonades en fer à cheval, franges courtes."""
    return f'<g opacity="{f(op)}">{jellyfish(card, name, r, bell, core, seed, 1.5, 34, 4, 0.6)}</g>'


def moon_phase(card, cx, cy, r, p, lit="#F6F2FF", dark="#1A1A48", name="mp"):
    """Une phase de la lune : p dans [0, 1), 0 = nouvelle, 0.5 = pleine."""
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{dark}" stroke="{lit}" stroke-width="0.6" opacity="0.95"/>']
    if 0.02 < p < 0.98:
        waxing = p < 0.5
        q = p if waxing else 1 - p
        rx = abs(math.cos(2 * math.pi * q)) * r
        side = 1 if waxing else 0
        sweep_t = (0 if q < 0.25 else 1) if waxing else (1 if q < 0.25 else 0)
        d = (f"M{f(cx)} {f(cy - r)} A{f(r)} {f(r)} 0 0 {side} {f(cx)} {f(cy + r)} "
             f"A{f(max(0.01, rx))} {f(r)} 0 0 {sweep_t} {f(cx)} {f(cy - r)} Z")
        g = card.rgrad("mp-lit", [(0, "#FFFFFF", 1), (0.7, lit, 1), (1, "#B9B6E8", 1)], 0.45, 0.4, 0.7)
        out.append(f'<path d="{d}" fill="{g}"/>')
    return "".join(out)


def ice_plate(cx, cy, r, col="#EAF6FF", rot=0, op=0.9):
    """Cristal de glace « à secteurs » : six pétales de glace autour d'un cœur hexagonal, nervures et dentelures."""
    out = []
    for i in range(6):
        a = rot + 60 * i
        tip = pt(cx, cy, r, a)
        l1, r1 = pt(cx, cy, r * 0.42, a - 17), pt(cx, cy, r * 0.42, a + 17)
        l2, r2 = pt(cx, cy, r * 0.78, a - 9), pt(cx, cy, r * 0.78, a + 9)
        out.append(f'<path d="{poly([pt(cx, cy, r * 0.2, a - 30), l1, l2, tip, r2, r1, pt(cx, cy, r * 0.2, a + 30)])}" fill="{col}" fill-opacity="0.22" stroke="{col}" stroke-width="0.9" stroke-linejoin="round"/>')
        out.append(f'<line x1="{f(pt(cx, cy, r * 0.2, a)[0])}" y1="{f(pt(cx, cy, r * 0.2, a)[1])}" x2="{f(tip[0])}" y2="{f(tip[1])}" stroke="#FFFFFF" stroke-width="0.8" opacity="0.9"/>')
        for t in (0.5, 0.66):
            bx, by = pt(cx, cy, r * t, a)
            for da in (-60, 60):
                ex, ey = pt(bx, by, r * 0.12, a + da)
                out.append(f'<line x1="{f(bx)}" y1="{f(by)}" x2="{f(ex)}" y2="{f(ey)}" stroke="#FFFFFF" stroke-width="0.6" opacity="0.8"/>')
    out.append(f'<path d="{poly([pt(cx, cy, r * 0.22, rot + 60 * i + 30) for i in range(6)])}" fill="{col}" fill-opacity="0.45" stroke="#FFFFFF" stroke-width="0.8"/>')
    return f'<g opacity="{f(op)}">{"".join(out)}</g>'


def ephyra(cx, cy, r, col="#FFD0EC", rot=0, op=0.9):
    """Éphyrule : la méduse-lune à sa naissance, une étoile de huit bras aux pointes fendues, grande comme un grain de sel."""
    pts = []
    for i in range(8):
        a = rot + 45 * i
        pts += [pt(cx, cy, r * 0.42, a - 22.5), pt(cx, cy, r * 0.95, a - 9), pt(cx, cy, r * 0.78, a), pt(cx, cy, r * 0.95, a + 9)]
    core = f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.22)}" fill="#FFFFFF" opacity="0.8"/>'
    return f'<g opacity="{f(op)}"><path d="{smooth(pts, True, 3)}" fill="{col}" fill-opacity="0.35" stroke="{col}" stroke-width="0.8"/>{core}</g>'


def orc_b():
    c = start("rb")
    win = oval(270, 492, 186, 234)
    rnd = random.Random(12)
    flakes = []
    for i in range(18):
        x, y = rnd.uniform(14, 526), rnd.uniform(300, 940)
        if 70 < x < 470 and 240 < y < 740:
            continue
        r = rnd.uniform(4, 9)
        flakes.append(snow_crystal(x, y, r, "#EAF6FF", 0.7, rnd.uniform(0, 60), rnd.uniform(0.35, 0.7)) if i % 2 else koch(x, y, r, 3, rnd.uniform(0, 60), "#EAF6FF", 0.6, 0.6))
    cp = [(36, 64), (70, 40), (112, 58), (150, 34)]
    cp2 = [(392, 36), (430, 60), (470, 34), (506, 58)]
    phases = []
    for i in range(9):
        a = -128 + 256 * i / 8
        x, y = pt(270, 150, 124, a)
        phases.append(moon_phase(c, x, y, 9.5, 0.06 + 0.88 * i / 8))
    parts = [
        water(c, [(0, "#22205E"), (0.3, "#141A5E"), (0.65, "#0A1238"), (1, "#03061C")]),
        starfield(c, 7, 240, (0, 0, W, 330), bright=6),
        constellation(c, cp, None, "#CFC6FF", "#FFFFFF", 0.8, 0.6, (1.3, 2.4), 2, "c1"),
        constellation(c, cp2, None, "#CFC6FF", "#FFFFFF", 0.8, 0.6, (1.3, 2.4), 3, "c2"),
        radial(c, "moonneb", 270, 150, 300, 240, "#8A6CFF", 0.34),
        shafts(c, "sh", 270, -160, 150, 840, 11, 17, spread=28, color="#DCD6FF", op=(0.06, 0.18)),
        f'<g opacity="0.45" filter="{blur(c, "farj", 2.2)}">{place(moon_jelly(c, "jf1", 30, 21), 40, 470, 1.0, 8)}{place(moon_jelly(c, "jf2", 26, 22), 500, 560, 1.0, -10)}'
        f'{place(moon_jelly(c, "jf3", 20, 23), 60, 800, 1.0, 4)}{place(moon_jelly(c, "jf4", 22, 24), 480, 830, 1.0, -6)}</g>',
        f'<g filter="{glow(c, "cr", 1.2, 1)}">{"".join(flakes)}</g>',
        f'<g filter="{glow(c, "eph", 1.6, 2)}">' + "".join(ephyra(x, y, r, col, rot) for x, y, r, col, rot in (
            (34, 360, 9, "#FFD0EC", 10), (506, 420, 8, "#DCD6FF", 30), (66, 520, 7, "#FFD0EC", 0), (472, 640, 8, "#FFD0EC", 20),
            (30, 700, 7, "#DCD6FF", 5), (110, 912, 11, "#FFD0EC", 12), (192, 930, 8, "#DCD6FF", 40), (296, 916, 10, "#FFD0EC", 8),
            (378, 934, 8, "#DCD6FF", 18), (452, 910, 11, "#FFD0EC", 33), (246, 946, 6, "#FFD0EC", 3), (40, 930, 8, "#DCD6FF", 21), (504, 940, 7, "#FFD0EC", 14))) + "</g>",
        f'<ellipse cx="270" cy="930" rx="260" ry="40" fill="{c.rgrad("botg", [(0, "#B9A7FF", 0.3), (1, "#B9A7FF", 0)])}"/>',
        place(moon_jelly(c, "j3", 22, 3), 46, 612, 1.0, 6),
        place(moon_jelly(c, "j4", 18, 4), 494, 700, 1.0, -8),
        place(moon_jelly(c, "j5", 14, 5, 0.85), 488, 330, 1.0, 10),
        marine_snow(51, 120, "#DCD6FF"),
    ]
    deco(c, win, parts)
    c.add(f'<circle cx="270" cy="150" r="124" fill="none" stroke="#DCD6FF" stroke-width="6" opacity="0.2" filter="{blur(c, "ring22", 3)}"/>')
    c.add(f'<circle cx="270" cy="150" r="124" fill="none" stroke="#FFFFFF" stroke-width="0.8" opacity="0.45"/>')
    c.add(moon(c, "mo", 270, 150, 80, "#C9C6F0", "#6A66A8", "#CFC6FF"))
    c.add(flower_of_life(270, 150, 40, "#FFFFFF", 0.7, 0.35, 1))
    c.add(f'<ellipse cx="270" cy="156" rx="58" ry="70" fill="{c.rgrad("crest-dk", [(0, "#0A0830", 0.7), (1, "#0A0830", 0)])}"/>')
    c.add(f'<g filter="{glow(c, "ph", 1.6, 1)}">{"".join(phases)}</g>')
    for (x, y, r, rot) in ((58, 270, 28, 0), (482, 270, 28, 15), (56, 742, 22, 10), (484, 742, 22, 0)):
        c.add(f'<g filter="{glow(c, "bigcr", 2.2, 2)}">{ice_plate(x, y, r, "#F2F8FF", rot)}{koch(x, y, r * 0.38, 3, rot, "#BFE6FF", 0.8, 0.9)}</g>')
    window_finish(c, win, PLATINUM, 5, tint="#CFC6FF", tint_op=0.2, glow_col="#B9A7FF")
    c.add(place(moon_jelly(c, "j1", 40, 1), 78, 168, 1.0, 10))
    c.add(place(moon_jelly(c, "j2", 32, 2), 466, 196, 1.0, -12))
    crest_block(c, 270, 146, 0.86, "platinum", None, halo_col=None)
    mee_meo(c, "cotes", "mee-montee-au-ciel", "meo-love")
    inscription(c, "Oracle", None, style="abysse", metal=PLATINUM, accent="#CFC6FF")
    c.add(outer_frame(c, PLATINUM, 10, 3, 24, "of"))
    save(c, "oracle-b")
    register("oracle-b", "oracle", None, "B", "La Lune des méduses",
             "La pleine lune se lève derrière le blason, gravée d'une fleur de vie, et ses neuf phases tournent autour d'elle comme une horloge du ciel ; "
             "des méduses-lunes aux quatre anneaux la traversent, deux constellations s'allument au-dessus de la mer, "
             "et l'on entrevoit l'infime : des éphyrules, méduses-lunes nouveau-nées grandes comme un grain de sel, des cristaux de glace à secteurs "
             "et des flocons fractals qui dérivent comme une neige d'étoiles.",
             "cotes : Mee (montée au ciel) et Meo (amoureux) se penchent dans l'ovale", None)


# ---------------------------------------------------------------- Oracle C : le nombre d'or

PHI = (1 + 5 ** 0.5) / 2


def platonic(cx, cy, r, kind="ico", rx=0.5, ry=0.3, col="#E6EEF8", w=1.0, op=0.9):
    """Solide de Platon en fil de fer (icosaèdre ou dodécaèdre), projeté."""
    if kind == "ico":
        v = [(0, s1, s2 * PHI) for s1 in (-1, 1) for s2 in (-1, 1)] + [(s1, s2 * PHI, 0) for s1 in (-1, 1) for s2 in (-1, 1)] + [(s2 * PHI, 0, s1) for s1 in (-1, 1) for s2 in (-1, 1)]
        target = 2.0
    else:
        v = [(a, b, c) for a in (-1, 1) for b in (-1, 1) for c in (-1, 1)]
        v += [(0, s1 / PHI, s2 * PHI) for s1 in (-1, 1) for s2 in (-1, 1)] + [(s1 / PHI, s2 * PHI, 0) for s1 in (-1, 1) for s2 in (-1, 1)] + [(s2 * PHI, 0, s1 / PHI) for s1 in (-1, 1) for s2 in (-1, 1)]
        target = 2 / PHI
    edges = [(i, j) for i in range(len(v)) for j in range(i + 1, len(v)) if abs(math.dist(v[i], v[j]) - target) < 1e-6]
    ca, sa, cb, sb = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry)
    def proj(p):
        x, y, z = p
        y, z = y * ca - z * sa, y * sa + z * ca
        x, z = x * cb + z * sb, -x * sb + z * cb
        return (cx + x * r / 1.9, cy + y * r / 1.9, z)
    pv = [proj(p) for p in v]
    out = []
    for i, j in edges:
        z = (pv[i][2] + pv[j][2]) / 2
        out.append(f'<line x1="{f(pv[i][0])}" y1="{f(pv[i][1])}" x2="{f(pv[j][0])}" y2="{f(pv[j][1])}" stroke="{col}" stroke-width="{f(w * (1.2 if z > 0 else 0.6))}" opacity="{f(op if z > 0 else op * 0.45)}"/>')
    out += [f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(1.6 if z > 0 else 1)}" fill="#FFFFFF" opacity="{f(1 if z > 0 else 0.5)}"/>' for x, y, z in pv]
    return "".join(out)


def pentagram(cx, cy, r, col="#FFE7A8", w=1.1, op=0.9):
    pts = [pt(cx, cy, r, 72 * i) for i in range(5)]
    star = [pts[(2 * i) % 5] for i in range(5)]
    return (f'<path d="{poly(pts)}" fill="none" stroke="{col}" stroke-width="{w}" opacity="{op}"/>'
            f'<path d="{poly(star)}" fill="none" stroke="{col}" stroke-width="{w}" opacity="{op}"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="{col}" stroke-width="{f(w * 0.6)}" opacity="{op * 0.6}"/>')


def orc_c():
    c = start("rc")
    win = rrect(84, 256, 456, 724, 18)
    gs_x, gs_y, gs_w = 26, 26, 290
    corners = [(gs_x, gs_y), (gs_x + gs_w, gs_y), (gs_x + gs_w, gs_y + gs_w / PHI), (gs_x, gs_y + gs_w / PHI)]
    parts = [
        water(c, [(0, "#081A3C"), (0.3, "#0A2C55"), (0.7, "#061A36"), (1, "#030A1C")]),
        radial(c, "glowtop", 270, 120, 340, 220, "#3A5AA8", 0.35),
        starfield(c, 13, 240, (0, 0, W, 300), bright=6),
        golden_spiral(gs_x, gs_y, gs_w, "#E6EEF8", 1.0, 0.75),
        constellation(c, corners, [], "#E6EEF8", "#FFFFFF", 0.0, 0.0, (1.6, 3.0), 4, "gc"),
        flower_of_life(270, 146, 30, "#E6EEF8", 0.7, 0.4, 2),
        moon(c, "mo", 36, 236, 11),
        sand(c, "sand", 896, ("#C8B48A", "#7A6448", "#3A2E22")),
        marine_snow(61, 120),
    ]
    deco(c, win, parts)
    c.add(nautilus_cut(c, "nau", 444, 122, 124, 135, False))
    window_finish(c, win, PLATINUM, 5, tint="#FFE7A8", tint_op=0.14)
    ticks = []
    for x in (84 + 372 / PHI, 456 - 372 / PHI):
        ticks.append(f'<line x1="{f(x)}" y1="242" x2="{f(x)}" y2="252" stroke="#FFFFFF" stroke-width="1.4"/><line x1="{f(x)}" y1="728" x2="{f(x)}" y2="738" stroke="#FFFFFF" stroke-width="1.4"/>')
    for y in (256 + 468 / PHI, 724 - 468 / PHI):
        ticks.append(f'<line x1="70" y1="{f(y)}" x2="80" y2="{f(y)}" stroke="#FFFFFF" stroke-width="1.4"/><line x1="460" y1="{f(y)}" x2="470" y2="{f(y)}" stroke="#FFFFFF" stroke-width="1.4"/>')
    c.add(f'<g opacity="0.85">{"".join(ticks)}</g>')
    sizes = [8, 10, 13, 16, 20, 25]
    y = 290
    for i, s in enumerate(sizes):
        c.add(nautilus_light(c, f"ns{i}", 44, y, s, 135 + i * 12, False, "#FFE7A8", 10, 0.8, 0.95))
        y += s * 2 + 26
    geo = [
        (500, 300, lambda x, y: pentagram(x, y, 20)),
        (500, 380, lambda x, y: platonic(x, y, 24, "ico", 0.5, 0.35)),
        (500, 462, lambda x, y: koch(x, y, 20, 3, 0, "#E8FBFF", 0.9)),
        (500, 544, lambda x, y: platonic(x, y, 24, "dodeca", 0.4, 0.6, "#FFE7A8")),
        (500, 626, lambda x, y: flower_of_life(x, y, 9, "#E6EEF8", 0.7, 0.8, 1)),
    ]
    c.add(f'<g filter="{glow(c, "geo", 1.4, 1)}">' + "".join(fn(x, y) for x, y, fn in geo) + "</g>")
    for i, (x, y, s, r) in enumerate(((40, 928, 10, 30), (150, 936, 7, 200), (390, 934, 8, 90), (500, 926, 11, 300))):
        c.add(nautilus_light(c, f"nb{i}", x, y, s, r, i % 2 == 1, "#FFE2C2", 10, 0.7, 0.85))
    crest_block(c, 270, 146, 0.86, "platinum", None, halo_col="#E6EEF8", halo_op=0.3)
    mee_meo(c, "pied", "mee-jackpot", "meo-cool")
    inscription(c, "Oracle", "Tout est lié", style="abysse", metal=PLATINUM, accent="#FFE7A8")
    c.add(outer_frame(c, PLATINUM, 10, 3, 24, "of"))
    save(c, "oracle-c")
    register("oracle-c", "oracle", None, "C", "Le Nombre d'or",
             "Un nautile d'or et de nacre surgit au-dessus de la photo, face aux rectangles d'or et à la spirale de Fibonacci tracés en platine dans le ciel, "
             "étoiles à leurs sommets ; une fleur de vie auréole le blason, des nautiles de lumière grands comme un grain de sable croissent selon la même spirale le long de la photo "
             "face au pentagramme, aux solides de Platon et au flocon fractal.",
             "pied : Mee (jackpot) et Meo (cool)", "Tout est lié")


ALL = [orc_a, orc_b, orc_c]
