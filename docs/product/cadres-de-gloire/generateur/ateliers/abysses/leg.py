"""Abysses - Légende V..I : l'océan devient cosmos. L'immense (nébuleuses, galaxies, supernova) et l'infime
(cellules, ADN, molécules, neurones, atomes) se tissent aux méduses, laminaires, coraux et baleines.
De V à I, le cadre s'ouvre de plus en plus loin dans les deux sens. Blason d'obsidienne."""

import math
import random

from common import *  # noqa: F401,F403
from sea import place, whale, whale_outline, fluke_path, manta_path, jellyfish
from reef import seagrass, mix
from shells import nautilus_light
from orc import plankton_swirl
from cosmos import (starfield, constellation, cloud, nebula_cloud, spiral_galaxy, elliptical, galaxy_cluster, black_hole,
                    supernova, atom, nucleus, dna, h2o, hexring, cell, neuron, wave_packet, diatom, koch, quantum_foam, moon)

LEG = ("#F6F2FF", "#BDB4E8", "#4A4570")


def leg_crest(card, division, cy=146, halo_col="#B9A7FF", halo_op=0.42):
    return crest_block(card, 270, cy, 0.86, "obsidian", division, gem="#7FF6FF", halo_col=halo_col, halo_op=halo_op, ink="#9FF4FF")


from base import plate_layer  # noqa: E402  la couche « plate » et ses emplacements de texte


@plate_layer
def leg_plaque(card, title, message=None, accent="#BFA8FF"):
    return inscription(card, title, message, style="abysse", metal=LEG, accent=accent, panel=("#120E2E", "#05040F"))


def deep_space(card, name, top="#0B0A2E", mid="#08123A", bot="#030616"):
    return water(card, [(0, top), (0.5, mid), (1, bot)], name)


def _in_poly(x, y, poly_pts):
    inside = False
    n = len(poly_pts)
    j = n - 1
    for i in range(n):
        xi, yi = poly_pts[i]
        xj, yj = poly_pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi:
            inside = not inside
        j = i
    return inside


def star_whale(card, name, cx, cy, s, flip=False, rot=0, body="#3A4BC8", rimc="#BFE6FF", n=160, seed=3):
    """Une baleine à bosse faite d'étoiles : corps de lumière, poussière d'étoiles, constellation sur le contour."""
    outline = whale_outline()
    rnd = random.Random(seed)
    dust = []
    tries = 0
    while len(dust) < n and tries < n * 30:
        tries += 1
        x, y = rnd.uniform(-115, 130), rnd.uniform(-28, 30)
        if _in_poly(x, y, outline):
            dust.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(0.3, 1.3))}" fill="#FFFFFF" opacity="{f(rnd.uniform(0.4, 1))}"/>')
    nodes = [outline[i] for i in (0, 3, 5, 7, 9, 13, 16, 18, 20, 22)] + [(-152, -33), (-152, 31)]
    node_m = "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="2.2" fill="#FFFFFF"/><circle cx="{f(x)}" cy="{f(y)}" r="5" fill="{rimc}" opacity="0.35"/>' for x, y in nodes)
    inner = whale(card, name, "etoiles", body, "#6E93A8", rimc) + "".join(dust) + f'<g filter="{glow(card, name + "-ng", 1.6, 2)}">{node_m}</g>'
    return place(inner, cx, cy, s, rot, flip)


def nebula_jelly(card, name, cx, cy, r, cols=("#FF7AD9", "#7A5CFF", "#38E1FF"), seed=1, tent=3.4, n_tent=9, rot=0):
    """Une méduse dont l'ombrelle est une nébuleuse et les tentacules des traînées d'étoiles."""
    rnd = random.Random(seed)
    h = r * 0.95
    lobes = 8
    d = f"M{f(-r)} 0 C{f(-r * 1.02)} {f(-h * 1.32)} {f(r * 1.02)} {f(-h * 1.32)} {f(r)} 0"
    for i in range(lobes):
        xa = r - 2 * r * i / lobes
        xb = r - 2 * r * (i + 1) / lobes
        d += f" Q{f((xa + xb) / 2)} {f(r * 0.18)} {f(xb)} 0"
    d += " Z"
    cid = card.id(name + "-bc")
    card.def_once(name + "-bc", f'<clipPath id="{cid}"><path d="{d}"/></clipPath>')
    out = [f'<ellipse cx="0" cy="{f(-h * 0.4)}" rx="{f(r * 1.6)}" ry="{f(r * 1.3)}" fill="{card.rgrad(name + "-gl", [(0, cols[0], 0.45), (0.5, cols[1], 0.18), (1, cols[1], 0)])}"/>']
    streams = []
    for i in range(n_tent):
        x = -r * 0.9 + 1.8 * r * i / max(1, n_tent - 1)
        L = r * tent * rnd.uniform(0.7, 1.2)
        ph = rnd.uniform(0, 6.28)
        for k in range(26):
            t = k / 25
            px = x + r * 0.14 * math.sin(ph + t * 5) + rnd.gauss(0, 0.8)
            py = r * 0.1 + L * t
            streams.append(f'<circle cx="{f(px)}" cy="{f(py)}" r="{f((1.6 - t * 1.2) * rnd.uniform(0.6, 1.2))}" fill="{rnd.choice(cols + ("#FFFFFF",))}" opacity="{f(0.95 - t * 0.7)}"/>')
    out.append(f'<g filter="{glow(card, name + "-sg", 1.4, 2)}">{"".join(streams)}</g>')
    for i in range(3):
        x = -r * 0.25 + r * 0.25 * i
        pts = [(x + r * 0.12 * math.sin(i + k * 0.9), r * 0.05 + r * tent * 0.5 * k / 6) for k in range(7)]
        out.append(f'<path d="{smooth(pts, False, 5)}" fill="none" stroke="{cols[i % 3]}" stroke-width="{f(r * 0.22)}" stroke-linecap="round" opacity="0.35" filter="{blur(card, name + "-ab", r * 0.08)}"/>')
    out.append(f'<path d="{d}" fill="{card.rgrad(name + "-bf", [(0, "#FFFFFF", 0.55), (0.35, cols[0], 0.45), (0.8, cols[1], 0.35), (1, cols[2], 0.55)], 0.5, 0.75, 0.75)}"/>')
    neb = nebula_cloud(card, name + "-nb", 0, -h * 0.5, r * 1.15, h * 0.95, cols, seed, 1.0, 0, 30)
    out.append(f'<g clip-path="url(#{cid})">{neb}</g>')
    out.append(f'<path d="{d}" fill="none" stroke="#FFFFFF" stroke-width="{f(r / 30)}" opacity="0.75" filter="{glow(card, name + "-rg", 2, 2)}"/>')
    out.append(f'<path d="M{f(-r * 0.6)} {f(-h * 0.6)} Q{f(-r * 0.45)} {f(-h * 1.0)} {f(-r * 0.02)} {f(-h * 0.98)}" fill="none" stroke="#FFFFFF" stroke-width="{f(r / 16)}" stroke-linecap="round" opacity="0.5"/>')
    return f'<g transform="translate({f(cx)} {f(cy)}) rotate({f(rot)})">{"".join(out)}</g>'


def whale_constellation(card, name, cx, cy, s, flip=False, col="#BFE6FF"):
    o = whale_outline()
    idx = [0, 2, 5, 7, 9, 10, 12, 13, 15, 18, 21, 23, 0]
    pts = [o[i] for i in idx] + [(-150, -30), (-128, -1), (-150, 30)]
    m = -1 if flip else 1
    P = [(cx + m * x * s, cy + y * s) for x, y in pts]
    edges = [(i, i + 1) for i in range(len(idx) - 1)] + [(13, 14), (14, 15)]
    return constellation(card, P, edges, col, "#FFFFFF", 0.8, 0.6, (1.2, 2.4), 4, name)


def jelly_constellation(card, name, cx, cy, s, col="#FFD6F0"):
    bell = [(-30, 0), (-26, -22), (-12, -34), (0, -36), (12, -34), (26, -22), (30, 0)]
    tent = [(-16, 0), (-20, 26), (-12, 52), (0, 0), (2, 34), (-4, 66), (16, 0), (20, 30), (14, 58)]
    P = [(cx + x * s, cy + y * s) for x, y in bell + tent]
    edges = [(i, i + 1) for i in range(6)] + [(0, 6), (7, 8), (8, 9), (10, 11), (11, 12), (13, 14), (14, 15)]
    return constellation(card, P, edges, col, "#FFFFFF", 0.8, 0.6, (1.0, 2.0), 6, name)


def galaxies_scatter(card, name, seed, n, region, avoid=WIN):
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    k = 0
    for i in range(n * 6):
        if k >= n:
            break
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if avoid and avoid[0] - 10 < x < avoid[2] + 10 and avoid[1] - 10 < y < avoid[3] + 10:
            continue
        r = rnd.uniform(7, 16)
        if rnd.random() < 0.6:
            out.append(spiral_galaxy(card, f"{name}{k}", x, y, r, rnd.uniform(0.3, 0.7), rnd.uniform(0, 180), rnd.choice(("#CFE0FF", "#FFD0F0", "#BFFBFF")), "#FFF1CF", "#7FA8FF", seed + k, 90, 2, False))
        else:
            out.append(elliptical(card, f"{name}e{k % 2}", x, y, r * 0.7, rnd.uniform(0.4, 0.8), rnd.uniform(0, 180), rnd.choice(("#FFE2B8", "#FFD0F0"))))
        k += 1
    return "".join(out)


def droplet(card, name, cx, cy, r, inner):
    """Une bulle qui contient un monde : l'infime vu à travers une goutte."""
    g = card.rgrad("drop", [(0, "#0A1240", 0.75), (0.82, "#0A1240", 0.6), (0.95, "#BFE6FF", 0.5), (1, "#FFFFFF", 0.85)])
    return (f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/>{inner}'
            f'<path d="M{f(cx - r * 0.62)} {f(cy - r * 0.3)} A{f(r * 0.7)} {f(r * 0.7)} 0 0 1 {f(cx - r * 0.1)} {f(cy - r * 0.72)}" fill="none" stroke="#FFFFFF" stroke-width="{f(r * 0.08)}" stroke-linecap="round" opacity="0.85"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="#DFF4FF" stroke-width="1" opacity="0.9"/>')


# ---------------------------------------------------------------- Légende V : constellations du large

def leg5():
    c = start("l5")
    win = rrect(84, 256, 456, 724, 24)
    hz = 232
    mp = [(430 + x * 0.6, 116 + y * 0.6) for x, y in manta_path(100, 0.2)[::3]]
    rnd = random.Random(5)
    glitter = "".join(f'<rect x="{f(168 + rnd.gauss(0, 22 + i * 4))}" y="{f(hz + 3 + i * 2.2)}" width="{f(rnd.uniform(4, 14))}" height="1.2" fill="#E6F0FF" opacity="{f(0.85 - i * 0.025)}"/>' for i in range(24))
    parts = [
        f'<rect width="{W}" height="{hz}" fill="{c.grad("sky", [(0, "#070A26"), (0.6, "#16245A"), (1, "#34488A")])}"/>',
        cloud(c, "mw", 270, 124, 360, 84, "#F0E6FF", "#7A6CFF", 3, "0.012", 4, 2.2, 0.44, 1.0, -24),
        cloud(c, "mw2", 300, 110, 260, 50, "#FFE2C2", "#FF7AB8", 8, "0.016", 4, 2.2, 0.5, 0.55, -24),
        starfield(c, 5, 360, (0, 0, W, hz), None, bright=9),
        moon(c, "mo", 168, 204, 15, "#F4F1FF", "#9A96C0", "#CFE6FF"),
        f'<g opacity="0.22" filter="{blur(c, "wsil", 2)}">{place(whale(c, "ws", "silhouette", "#BFE6FF", "#BFE6FF", "#BFE6FF"), 104, 86, 0.6, -4)}</g>',
        whale_constellation(c, "wc", 104, 86, 0.6),
        f'<path d="{smooth(manta_path(100, 0.2), True, 6)}" transform="translate(430 116) scale(0.6)" fill="#FFD6F0" opacity="0.16"/>',
        constellation(c, mp, [(i, (i + 1) % len(mp)) for i in range(len(mp))], "#FFD6F0", "#FFFFFF", 0.9, 0.7, (1.0, 2.2), 4, "mc"),
        f'<rect x="0" y="{hz}" width="{W}" height="{H - hz}" fill="{c.grad("sea", [(0, "#164480"), (0.3, "#0A2350"), (1, "#030A1E")])}"/>',
        f'<rect x="0" y="{hz - 1}" width="{W}" height="2" fill="#BFE6FF" opacity="0.85"/>',
        glitter,
        starfield(c, 6, 320, (0, hz + 10, W, H), WIN, colors=("#7FF6FF", "#BFFBFF", "#9FB8FF"), rmax=1.7, bright=6, bright_color="#BFFBFF"),
        spiral_galaxy(c, "pg1", 40, 520, 74, 0.9, 30, "#7FF6FF", "#DFFFFF", "#2AA8C8", 13, 520, 2, False, 0.95),
        spiral_galaxy(c, "pg2", 502, 400, 62, 0.9, -40, "#9FB8FF", "#E6E0FF", "#5A6CFF", 14, 420, 2, False, 0.9),
        plankton_swirl(c, "ps", 7, 270, 930, 300, 300),
        place(jellyfish(c, "j1", 20, "#7FF6FF", "#BFA8FF", 3, 2.6, 10, 3), 486, 600, 1.0, -6),
        place(jellyfish(c, "j2", 15, "#FF9FE8", "#7FF6FF", 4, 2.6, 9, 3), 506, 290, 1.0, -8),
        place(jellyfish(c, "j3", 16, "#BFA8FF", "#7FF6FF", 5, 2.6, 9, 3), 46, 330, 1.0, 6),
        place(jellyfish(c, "j4", 13, "#FFE7A8", "#FF9FE8", 6, 2.6, 8, 3), 54, 690, 1.0, 4),
    ]
    deco(c, win, parts)
    window_finish(c, win, LEG, 5, tint="#9FB8FF", tint_op=0.16, glow_col="#9FB8FF")
    for x, y, fn in ((50, 898, lambda x, y: diatom(c, "d1", x, y, 26, "#BFFBFF", 22)), (490, 898, lambda x, y: cell(c, "ce", x, y, 24, 2))):
        c.add(droplet(c, "dl", x, y, 32, fn(x, y)))
    leg_crest(c, 5)
    mee_meo(c, "pied", "mee-coucou", "meo-yo")
    leg_plaque(c, "Légende V")
    c.add(outer_frame(c, LEG, 10, 3, 24, "of"))
    save(c, "legende-5")
    register("legende-5", "legende", 5, "V", "Constellations du large",
             "La nuit tombe sur le large : la Voie lactée se lève au-dessus de l'horizon, une baleine et une raie manta s'y dessinent en constellations ; "
             "sous la surface, le plancton bioluminescent s'enroule en deux galaxies spirales et dérive en voie lactée au pied du cadre, "
             "et deux gouttes révèlent l'infime — une diatomée, une cellule.",
             "pied : Mee (coucou) et Meo (yo)", None)


# ---------------------------------------------------------------- Légende IV : les méduses-nébuleuses

def leg4():
    c = start("l4")
    win = arch(84, 456, 256, 724, 24, 140)
    rnd = random.Random(14)
    mols = []
    for i, (x, y) in enumerate(((44, 340), (498, 420), (40, 520), (500, 760), (60, 720), (486, 300))):
        mols.append(h2o(c, "h2o", x, y, 1.3, rnd.uniform(0, 360)))
    lattice = "".join(hexring(x, y, 14, "#9FD8FF", 0.8, 0.35, 30, True) for x in range(14, 140, 24) for y in range(880, 980, 21) if (x + y) % 2 == 0)
    lattice2 = "".join(hexring(x, y, 14, "#9FD8FF", 0.8, 0.35, 30, True) for x in range(410, 540, 24) for y in range(880, 980, 21) if (x + y) % 2 == 0)
    parts = [
        deep_space(c, "bg", "#120A3A", "#0A1446", "#030616"),
        nebula_cloud(c, "neb1", 90, 260, 200, 200, ("#FF7AD9", "#5A3CCF", "#FFD36E"), 7, 0.85, 20, 40),
        nebula_cloud(c, "neb2", 460, 600, 190, 230, ("#38E1FF", "#3A3CCF", "#BFFBFF"), 9, 0.8, -15, 40),
        nebula_cloud(c, "neb3", 270, 940, 300, 90, ("#B98CFF", "#3A2ACF", "#FF9BD2"), 15, 0.7, 0, 30),
        starfield(c, 8, 340, (0, 0, W, H), WIN, bright=7),
        f'<g opacity="1" filter="{glow(c, "lat", 1.2, 1)}">{lattice}{lattice2}</g>',
        f'<g filter="{glow(c, "mol", 1.2, 1)}">{"".join(mols)}</g>',
        nebula_jelly(c, "nj3", 498, 560, 30, ("#38E1FF", "#3A5CFF", "#BFFBFF"), 5, 2.6, 8, -8),
        nebula_jelly(c, "nj4", 42, 600, 26, ("#FFD36E", "#FF7AD9", "#FFFFFF"), 6, 2.6, 7, 6),
    ]
    deco(c, win, parts)
    window_finish(c, win, LEG, 5, tint="#C9A7FF", tint_op=0.18, glow_col="#C9A7FF")
    c.add(nebula_jelly(c, "nj1", 90, 128, 50, ("#FF7AD9", "#7A5CFF", "#38E1FF"), 1, 3.0, 10, 8))
    c.add(nebula_jelly(c, "nj2", 452, 150, 44, ("#38E1FF", "#7A5CFF", "#FFD36E"), 2, 3.2, 10, -8))
    leg_crest(c, 4)
    mee_meo(c, "cotes", "mee-amoureuse", "meo-love")
    leg_plaque(c, "Légende IV", "Ma perle, c'est vous")
    c.add(outer_frame(c, LEG, 10, 3, 24, "of"))
    save(c, "legende-4")
    register("legende-4", "legende", 4, "IV", "Les Méduses-nébuleuses",
             "Les méduses sont devenues nébuleuses : leurs ombrelles de gaz rose et bleu flottent de part et d'autre du blason, "
             "leurs tentacules traînent des poussières d'étoiles ; entre elles dérivent des molécules d'eau et le réseau hexagonal de la glace.",
             "cotes : Mee (amoureuse) et Meo (amoureux) se penchent dans l'arche", "Ma perle, c'est vous")


# ---------------------------------------------------------------- Légende III : la double hélice

def kelp_helix(card, name, x, y0, y1, flip=False, seed=1):
    rnd = random.Random(seed)
    blades = []
    for k in range(9):
        y = lerp(y0, y1, (k + 0.5) / 9)
        side = (1 if k % 2 else -1) * (-1 if flip else 1)
        L = rnd.uniform(26, 40)
        a = side * rnd.uniform(48, 70)
        x1, y1_ = pt(x, y, L, a)
        c1 = pt(x, y, L * 0.5, a - side * 30)
        c2 = pt(x, y, L * 0.5, a + side * 30)
        blades.append(f'<path d="M{f(x)} {f(y)} Q{f(c1[0])} {f(c1[1])} {f(x1)} {f(y1_)} Q{f(c2[0])} {f(c2[1])} {f(x)} {f(y)} Z" fill="{card.grad("kb", [(0, "#FFE7A8"), (1, "#3FBF8A")], 0, 0, 1, 0)}" opacity="0.8"/>')
    return f'<g filter="{glow(card, name + "-bg", 2, 1)}">{"".join(blades)}</g>' + dna(card, name, x, y0, y1, 15, 7, "#7FF6FF", "#FFD36E", phase=seed)


def leg3():
    c = start("l3")
    win = rrect(84, 256, 456, 724, 22)
    rnd = random.Random(3)
    atoms = "".join(atom(c, f"at{i % 2}", x, y, r, ("#9FF4FF", "#FFD6F0")[i % 2], 3, "#FFFFFF", i, i % 2 == 0, 0.9, rnd.uniform(0, 60))
                    for i, (x, y, r) in enumerate(((44, 210, 18), (500, 236, 16), (24, 780, 14), (516, 840, 15), (500, 470, 14))))
    parts = [
        deep_space(c, "bg", "#0A0B30", "#081A44", "#020814"),
        nebula_cloud(c, "neb", 270, 130, 260, 120, ("#9F7AFF", "#2A3CCF", "#38E1FF"), 4, 0.8, -6, 30),
        starfield(c, 9, 300, (0, 0, W, H), WIN, bright=6),
        spiral_galaxy(c, "gal", 270, 136, 200, 0.42, -14, "#CFE0FF", "#FFF1CF", "#9FB8FF", 6, 1400, 2),
        spiral_galaxy(c, "gal2", 270, 136, 200, 0.42, -14, "#FFD6F0", "#FFF1CF", "#FF9BD2", 9, 500, 2, False, 0.7),
        galaxies_scatter(c, "gs", 4, 5, (0, 0, W, 250)),
        kelp_helix(c, "hl", 42, 960, 250, False, 1),
        kelp_helix(c, "hr", 498, 960, 250, True, 2),
        f'<g opacity="0.95">{atoms}</g>',
        star_whale(c, "sm", 480, 70, 0.32, True, -8, "#3A4BC8", "#FFD6F0", 60, 5),
    ]
    deco(c, win, parts)
    window_finish(c, win, LEG, 5, tint="#9FB8FF", tint_op=0.16, glow_col="#7FF6FF")
    leg_crest(c, 3, halo_col="#FFF1CF", halo_op=0.35)
    bird(c, "mee-bravo", 66, 82, 108, False, -10)
    bird(c, "meo-champagne", 474, 82, 108, True, 10)
    leg_plaque(c, "Légende III")
    c.add(outer_frame(c, LEG, 10, 3, 24, "of"))
    save(c, "legende-3")
    register("legende-3", "legende", 3, "III", "La Double Hélice",
             "Les laminaires montent le long de la photo en se tordant en doubles hélices d'ADN, leurs lames d'or accrochées aux brins ; "
             "au sommet, elles rejoignent une galaxie spirale qui tourne derrière le blason, et des atomes remontent comme des bulles.",
             "perches : Mee (bravo) et Meo (champagne) dans les coins du ciel", None)


# ---------------------------------------------------------------- Légende II : le récif des neurones

def leg2():
    c = start("l2")
    win = f"M{84 + 30} 256 L{456 - 30} 256 L456 {256 + 30} L456 {724 - 30} L{456 - 30} 724 L{84 + 30} 724 L84 {724 - 30} L84 {256 + 30} Z"
    parts = [
        deep_space(c, "bg", "#140A30", "#0A1440", "#030614"),
        cloud(c, "nebL", 60, 120, 160, 120, "#FF9BD2", "#6A3CCF", 11, "0.012", 4, 2.0, 0.5, 0.7),
        cloud(c, "nebR", 480, 110, 160, 120, "#7FE7FF", "#3A3CCF", 13, "0.012", 4, 2.0, 0.5, 0.7),
        starfield(c, 10, 300, (0, 0, W, H), WIN, bright=6),
        galaxies_scatter(c, "gs", 9, 7, (0, 0, W, 960)),
        supernova(c, "sn", 270, 146, 96, "#FF9BD2", "#FFF4D6", "#7FE7FF", 4),
        neuron(c, "n1", 3, 36, 860, 1.25, "#7FF6FF", "#FFFFFF", [(36, 860), (40, 780), (30, 680), (44, 560), (30, 430), (50, 320)], 6, 3, 30),
        neuron(c, "n2", 5, 504, 880, 1.25, "#FF8AD8", "#FFFFFF", [(504, 880), (500, 790), (512, 680), (496, 560), (510, 420), (490, 300)], 6, 3, 30),
        neuron(c, "n3", 7, 270, 960, 1.1, "#FFD36E", "#FFFFFF", None, 7, 3, 34),
        neuron(c, "n4", 8, 40, 300, 0.7, "#BFA8FF", "#FFFFFF", None, 5, 2, 24),
        neuron(c, "n5", 9, 500, 260, 0.7, "#7FF6FF", "#FFFFFF", None, 5, 2, 24),
        cell(c, "c1", 46, 610, 20, 3, op=0.9),
        cell(c, "c2", 494, 520, 18, 5, "#FFB3E6", "#5A2A7A", "#FFD36E", 0.9),
    ]
    deco(c, win, parts)
    window_finish(c, win, LEG, 5, tint="#FFB3E6", tint_op=0.14, glow_col="#FF9BD2")
    leg_crest(c, 2, halo_col=None)
    leg_plaque(c, "Légende II", "Merci d'y avoir cru")
    mee_meo(c, "ruban", "mee-lettre", "meo-muscles")
    c.add(outer_frame(c, LEG, 10, 3, 24, "of"))
    save(c, "legende-2")
    register("legende-2", "legende", 2, "II", "Le Récif des neurones",
             "Les coraux se sont faits neurones : leurs branches deviennent dendrites, leurs troncs des axones gainés de myéline qui s'allument "
             "d'étincelles le long de la photo ; au-dessus, une supernova explose derrière le blason, entre deux nébuleuses et des galaxies lointaines.",
             "ruban : Mee (lettre) et Meo (muscles) aux coins de la plaque", "Merci d'y avoir cru")


# ---------------------------------------------------------------- Légende I : la baleine des galaxies

def leg1():
    c = start("l1")
    win = arch(84, 456, 262, 724, 24, 120)
    worlds = [
        (40, 330, lambda x, y: atom(c, "da", x, y, 15, "#9FF4FF", 3, "#FFFFFF", 2, True, 0.8)),
        (500, 360, lambda x, y: cell(c, "dc", x, y, 15, 7)),
        (36, 470, lambda x, y: dna(c, "dd", x, y - 14, y + 14, 6, 2, "#7FF6FF", "#FFD36E", w=1.3, rungs_per_turn=6)),
        (504, 500, lambda x, y: h2o(c, "dh", x, y, 0.8, 30)),
        (44, 610, lambda x, y: diatom(c, "ddi", x, y, 15, "#BFFBFF", 18)),
        (496, 640, lambda x, y: koch(x, y, 13, 3, 0, "#E8FBFF", 0.8)),
        (30, 210, lambda x, y: nucleus(c, "dn", x, y, 12, 4)),
        (510, 236, lambda x, y: wave_packet(x - 14, x + 14, y, 9, 1.1, None, "#7FF6FF", 1, 0.95, False)),
    ]
    rnd = random.Random(8)
    parts = [
        deep_space(c, "bg", "#0C0626", "#0A1A4A", "#04122A"),
        nebula_cloud(c, "nebA", 110, 160, 240, 160, ("#FF7AD9", "#7A3CFF", "#38E1FF"), 2, 0.9, -10, 40),
        nebula_cloud(c, "nebB", 470, 80, 200, 130, ("#38E1FF", "#2A3CCF", "#FFD36E"), 6, 0.85, 12, 40),
        nebula_cloud(c, "nebC", 470, 740, 180, 220, ("#FF9BD2", "#5A2ACF", "#7FE7FF"), 9, 0.6, 20, 20),
        nebula_cloud(c, "nebD", 60, 660, 160, 200, ("#7FE7FF", "#3A2ACF", "#BFA8FF"), 12, 0.55, -20, 20),
        starfield(c, 11, 480, (0, 0, W, H), WIN, bright=10),
        galaxies_scatter(c, "gs", 21, 9, (0, 0, W, 900)),
        spiral_galaxy(c, "g1", 70, 70, 46, 0.45, 30, "#CFE0FF", "#FFF1CF", "#7FA8FF", 2, 300),
        galaxy_cluster(c, "cl", 3, 488, 300, 30, 12),
        black_hole(c, "bh", 470, 186, 8, 0.3, -12),
        f'<path d="M0 {H - 52} Q90 {H - 66} 180 {H - 54} T360 {H - 56} T540 {H - 50} L540 {H} L0 {H} Z" fill="{c.grad("sea", [(0, "#1A6AA8"), (1, "#04122A")])}" opacity="0.9"/>',
        f'<path d="M0 {H - 52} Q90 {H - 66} 180 {H - 54} T360 {H - 56} T540 {H - 50}" fill="none" stroke="#BFE6FF" stroke-width="1.6" opacity="0.9"/>',
        "".join(f'<circle cx="{f(rnd.uniform(0, W))}" cy="{f(rnd.uniform(H - 46, H))}" r="{f(rnd.uniform(0.6, 1.6))}" fill="#FFFFFF" opacity="{f(rnd.uniform(0.3, 0.9))}"/>' for _ in range(60)),
    ]
    deco(c, win, parts)
    window_finish(c, win, LEG, 5, tint="#C9A7FF", tint_op=0.18, glow_col="#BFA8FF")
    for x, y, fn in worlds:
        c.add(droplet(c, "dr", x, y, 22, fn(x, y)))
    c.add(star_whale(c, "sw", 262, 78, 1.0, False, -6, "#3A4BC8", "#BFE6FF", 220, 7))
    leg_crest(c, 1, cy=160, halo_col="#BFA8FF", halo_op=0.35)
    mee_meo(c, "pied", "mee-montee-au-ciel", "meo-roi")
    leg_plaque(c, "Légende I", "Plus loin que la mer")
    c.add(outer_frame(c, LEG, 10, 3.5, 24, "of"))
    save(c, "legende-1")
    register("legende-1", "legende", 1, "I", "La Baleine des galaxies",
             "L'océan s'est renversé en ciel : une baleine à bosse faite d'étoiles nage parmi les nébuleuses, les galaxies, un amas et un trou noir, "
             "la mer n'étant plus qu'un liseré au pied du cadre ; le long de la photo, des bulles portent chacune un monde infime — atome, noyau, cellule, ADN, "
             "molécule d'eau, diatomée, flocon fractal, onde quantique.",
             "pied : Mee (montée au ciel) et Meo (roi)", "Plus loin que la mer")


ALL = [leg5, leg4, leg3, leg2, leg1]
