"""Abysses - Mythe A, B, C : « du quark au quasar ». Toute l'échelle de l'univers dans un seul cadre ;
les motifs de l'océan deviennent constellations ou incrustations. Blason prisme, Mythe nº 42, Nº 42 / 100."""

import math
import random

from common import *  # noqa: F401,F403
from kit import ribbon
from sea import place, whale_outline, manta_path, jellyfish
from shells import nautilus_light, spiral_points
from cosmos import (starfield, constellation, cloud, nebula_cloud, spiral_galaxy, elliptical, galaxy_cluster, black_hole, quasar,
                    cosmic_web, supernova, atom, nucleus, dna, cell, wave_packet, quantum_foam, string_loop, open_string,
                    particle_tracks, diatom, moon)
from leg import star_whale, nebula_jelly, galaxies_scatter, deep_space, droplet, whale_constellation, jelly_constellation

TITLE = "Mythe nº 42"
NUM = "Nº 42 / 100"


def prism_rim(card, d, w=5, name="pr"):
    pr = card.prism(name, 0, 0, 1, 1)
    return (f'<path d="{d}" fill="none" stroke="{pr}" stroke-width="{f(w * 2.6)}" opacity="0.5" filter="{blur(card, name + "-b", 6)}"/>'
            f'<path d="{d}" fill="none" stroke="{pr}" stroke-width="{f(w)}"/>'
            f'<path d="{d}" fill="none" stroke="#FFFFFF" stroke-width="0.9" opacity="0.85"/>')


def myth_window(card, d, name="mw"):
    card.add(inner_shadow(card, d, 40, 14, 0.55, "#00060E", name + "-ish"))
    card.add(grade(card, d, "#C9B6FF", 0.5, 0.0, 0.18, name + "-gr", 0.9))
    card.add(prism_rim(card, d, 4.5, name + "-pr"))


def myth_crest(card, cy=150, s=0.86):
    card.add(halo(card, "mc-h", 270, cy + 4, 110 * s, "#FFFFFF", 0.35))
    return crest(card, 270, cy, s, "prism", None, ink="#FFFFFF")


from base import plate_layer  # noqa: E402  la couche « plate » et ses emplacements de texte


@plate_layer
def myth_plaque(card, message=None):
    return inscription(card, TITLE, message, style="cosmos", metal=("#FFFFFF", "#D9CCFF", "#6A5CC4"), accent="#CFC2FF",
                       panel=("#120A30", "#04030E"), numero=NUM, y=756)


def maelstrom(card, name, cx, cy, n=46, r_out=430, r_in=46, tilt=0.42, turns=1.25, seed=1, cols=("#BFFBFF", "#7FE7FF", "#FFFFFF", "#9FB8FF")):
    rnd = random.Random(seed)
    streaks, foam = [], []
    for i in range(n):
        a0 = 2 * math.pi * i / n + rnd.uniform(-0.1, 0.1)
        ro = r_out * rnd.uniform(0.75, 1.05)
        L = rnd.uniform(0.35, 0.9)
        t0 = rnd.uniform(0, 1 - L)
        spine = []
        for k in range(16):
            t = t0 + L * k / 15
            r = ro * (r_in / ro) ** t
            a = a0 + t * turns * 2 * math.pi
            spine.append((cx + r * math.cos(a), cy + r * math.sin(a) * tilt))
        w0 = rnd.uniform(1.2, 4.2)
        streaks.append(f'<path d="{ribbon(spine, [w0 * 0.4, w0, w0 * 0.7, 0.3], 4, 50)}" fill="{cols[i % len(cols)]}" opacity="{f(rnd.uniform(0.35, 0.85))}"/>')
        for _ in range(4):
            x, y = rnd.choice(spine)
            foam.append(f'<circle cx="{f(x + rnd.gauss(0, 3))}" cy="{f(y + rnd.gauss(0, 2))}" r="{f(rnd.uniform(0.5, 1.6))}" fill="#FFFFFF" opacity="0.8"/>')
    return f'<g filter="{glow(card, name + "-g", 2, 1)}">{"".join(streaks)}{"".join(foam)}</g>'


# ---------------------------------------------------------------- Mythe A : le maelström

def my_a():
    c = start("ma")
    win = rrect(84, 262, 456, 726, 24)
    web, nodes = cosmic_web(c, "cw", 4, (8, 330, 80, 560), 14, "#B69CFF", "#FFE9F7", 3, 0.6, 0.7)
    parts = [
        deep_space(c, "bg", "#06061E", "#081A3E", "#02040E"),
        cloud(c, "neb", 270, 130, 320, 160, "#2A9FCF", "#1A2A7A", 5, "0.01", 4, 2.0, 0.5, 0.65),
        starfield(c, 3, 380, (0, 0, W, H), WIN, bright=8),
        maelstrom(c, "ms", 270, 128, 54, 470, 60, 0.42, 1.3, 2),
        black_hole(c, "bh", 270, 128, 30, 0.26, -6),
        cloud(c, "nebL", 40, 470, 90, 220, "#B69CFF", "#3A2ACF", 15, "0.02", 4, 2.0, 0.5, 0.8),
        web,
        galaxy_cluster(c, "gcl", 3, 46, 600, 30, 14),
        spiral_galaxy(c, "gl1", 44, 300, 22, 0.5, 30, "#CFE0FF", "#FFF1CF", "#7FA8FF", 2, 260),
        quasar(c, "qs", 46, 690, 7, -12, 150),
        cloud(c, "nebR", 500, 470, 90, 220, "#7FE7FF", "#2A3ACF", 16, "0.02", 4, 2.0, 0.5, 0.6),
        particle_tracks(c, "pt", 7, 498, 420, 11, 0.8, a0=180, spread=220),
        nucleus(c, "nu", 498, 560, 20, 3),
        quantum_foam(c, "qf", 5, (462, 268, 536, 360), 70, avoid=None),
        f'<g filter="{glow(c, "st", 1.6, 2)}">{string_loop(80, 924, 16, 5, 0.22, 0.3, "#FFD36E", 1.3)}{string_loop(460, 920, 14, 3, 0.25, 1, "#FF8AD8", 1.3)}'
        f'{open_string(150, 930, 210, 912, 3, 5, "#7FF6FF", 1.1)}{open_string(330, 912, 392, 930, 4, 5, "#FFD36E", 1.1)}</g>',
        quantum_foam(c, "qf2", 8, (0, 890, W, 960), 70, "#9FB8FF", avoid=None),
        whale_constellation(c, "wc", 92, 52, 0.42),
        jelly_constellation(c, "jc", 470, 60, 0.7),
    ]
    deco(c, win, parts)
    myth_window(c, win)
    myth_crest(c, 166, 0.82)
    myth_plaque(c, "Du quark au quasar")
    bird(c, "duo-mee-selfie", 440, 652, 190, True, 0)
    c.add(outer_frame(c, ("#FFFFFF", "#CFC2FF", "#6A5CC4"), 10, 3, 24, "of"))
    c.add(f'<rect x="10" y="10" width="520" height="940" rx="24" fill="none" stroke="{c.prism("ofp", 0, 0, 1, 1)}" stroke-width="2" opacity="0.9"/>')
    save(c, "mythe-a")
    register("mythe-a", "mythe", None, "A", "Le Maelström",
             "Un tourbillon océanique s'enroule jusqu'à devenir un trou noir et son disque d'accrétion, d'où monte le blason prisme ; "
             "à gauche l'immense — toile cosmique, amas de galaxies, quasar et ses jets —, à droite l'infime — traces de particules en bulles, "
             "noyau atomique, mousse quantique —, des cordes vibrent au pied du cadre, une baleine et une méduse brillent en constellations.",
             "selfie : Mee et Meo se prennent en photo", "Du quark au quasar")


# ---------------------------------------------------------------- Mythe B : le nautile-galaxie

def galaxy_arms(card, name, cx, cy, size, rot, seed=6, arms=2):
    """Les bras d'une galaxie spirale qui suivent exactement la spirale du nautile."""
    rnd = random.Random(seed)
    stars, knots, lanes = [], [], []
    for k in range(arms):
        sp = spiral_points(cx, cy, size, rot + 360 * k / arms, False, 1.2, 4 * math.pi, 300)
        lanes.append(poly(sp, False))
        for i, (x, y) in enumerate(sp):
            t = i / len(sp)
            spread = 3 + 16 * t
            for _ in range(3):
                stars.append(f'<circle cx="{f(x + rnd.gauss(0, spread))}" cy="{f(y + rnd.gauss(0, spread))}" r="{f(rnd.uniform(0.35, 1.5))}" '
                             f'fill="{rnd.choice(("#FFFFFF", "#FFE7A8", "#BFFBFF", "#CFE0FF"))}" opacity="{f(rnd.uniform(0.45, 1))}"/>')
            if i % 23 == 7:
                knots.append(f'<circle cx="{f(x + rnd.gauss(0, spread * 0.5))}" cy="{f(y + rnd.gauss(0, spread * 0.5))}" r="{f(rnd.uniform(2, 4.5))}" fill="{rnd.choice(("#FF7AD9", "#FF9BD2", "#7FB8FF"))}" opacity="0.85"/>')
    arm_glow = "".join(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="30" stroke-linecap="round" opacity="0.3"/>' for d, col in zip(lanes, ("#9FB8FF", "#FF9BD2", "#9FB8FF")))
    return (f'<g filter="{blur(card, name + "-ab", 9)}">{arm_glow}</g>'
            f'<g filter="{glow(card, name + "-st", 1.3, 2)}">{"".join(stars)}</g>'
            f'<g filter="{glow(card, name + "-kn", 2.5, 2)}">{"".join(knots)}</g>')


def my_b():
    c = start("mb")
    win = arch(84, 456, 262, 726, 24, 130)
    jelly_strings = []
    for k in range(5):
        x0 = 456 + k * 9
        jelly_strings.append(open_string(x0, 878, x0 + 5 * (k - 2), 958, 3 + k % 3, 3.5, ("#7FF6FF", "#FFD36E", "#FF8AD8")[k % 3], 1.1))
    parts = [
        deep_space(c, "bg", "#0A0726", "#0C1640", "#03040F"),
        nebula_cloud(c, "nebg", 270, 150, 320, 230, ("#FFD36E", "#7A3CFF", "#38E1FF"), 8, 0.7, 0, 40),
        starfield(c, 5, 360, (0, 0, W, H), WIN, bright=8),
        galaxy_arms(c, "ga", 270, 150, 250, 120),
        nautilus_light(c, "nl", 270, 150, 250, 120, False, "#FFE7A8", 14, 1.4, 0.9),
        f'<circle cx="270" cy="150" r="96" fill="{c.rgrad("core", [(0, "#FFFFFF", 0.95), (0.25, "#FFF1CF", 0.75), (0.6, "#FFD36E", 0.2), (1, "#FFD36E", 0)])}"/>',
        cloud(c, "nebL", 40, 560, 100, 260, "#FF7AD9", "#4A2ACF", 21, "0.018", 4, 2.0, 0.5, 0.75),
        cloud(c, "nebR", 500, 520, 100, 260, "#38E1FF", "#2A3ACF", 23, "0.018", 4, 2.0, 0.5, 0.7),
        quasar(c, "qs", 42, 300, 7, 0, 130, "#9FE8FF"),
        galaxies_scatter(c, "gs", 12, 6, (0, 320, W, 880)),
        cosmic_web(c, "cwb", 17, (130, 896, 420, 952), 16, "#B69CFF", "#FFE9F7", 3, 0.6, 0.7, 0.5)[0],
        atom(c, "a1", 500, 360, 22, "#9FF4FF", 3, "#FFFFFF", 4, True, 1),
        atom(c, "a2", 498, 600, 15, "#FFD6F0", 3, "#FFFFFF", 6, False, 0.9, 40),
        f'<g filter="{glow(c, "js", 1.4, 2)}">{"".join(jelly_strings)}</g>',
        nebula_jelly(c, "njs", 474, 866, 28, ("#38E1FF", "#7A5CFF", "#FF7AD9"), 3, 0.0, 1, -4),
        whale_constellation(c, "wcb", 40, 860, 0.3),
    ]
    deco(c, win, parts)
    myth_window(c, win)
    c.add(droplet(c, "pearl-nu", 46, 664, 30, nucleus(c, "pn", 46, 664, 24, 5, 15)))
    myth_crest(c, 150, 0.84)
    mee_meo(c, "cotes", "mee-bisou-vole", "meo-trophee")
    myth_plaque(c, None)
    c.add(outer_frame(c, ("#FFFFFF", "#CFC2FF", "#6A5CC4"), 10, 3, 24, "of"))
    c.add(f'<rect x="10" y="10" width="520" height="940" rx="24" fill="none" stroke="{c.prism("ofp", 0, 0, 1, 1)}" stroke-width="2" opacity="0.9"/>')
    save(c, "mythe-b")
    register("mythe-b", "mythe", None, "B", "Le Nautile-galaxie",
             "La spirale du nautile, cloison après cloison, s'ouvre en galaxie spirale dont le blason prisme occupe le cœur : ses bras d'étoiles et ses nébuleuses roses "
             "suivent exactement la courbe de la coquille. Un quasar lance ses jets le long de la photo, une perle renferme un noyau d'atome, des atomes gravitent, "
             "une baleine brille en constellation et une méduse de lumière laisse pendre des cordes qui vibrent.",
             "cotes : Mee (bisou volé) et Meo (trophée) se penchent dans l'arche", None)


# ---------------------------------------------------------------- Mythe C : la sonde de l'univers

def scale_label(x, y, exp, unit="m", anchor="start"):
    if exp == "1":
        body = f'1 {unit}'
        return f'<text x="{f(x)}" y="{f(y)}" text-anchor="{anchor}" font-family="{base.SANS}" font-weight="800" font-size="10.5" fill="#BFFBFF">{body}</text>'
    return (f'<text x="{f(x)}" y="{f(y)}" text-anchor="{anchor}" font-family="{base.SANS}" font-weight="800" font-size="10.5" fill="#BFFBFF">10'
            f'<tspan dy="-4.5" font-size="7.5">{exp}</tspan><tspan dy="4.5"> {unit}</tspan></text>')


def sounding_lead(card, cx, cy, s=1.0):
    g = metal_grad(card, "lead-g", GOLD)
    d = f"M{f(cx - 9 * s)} {f(cy)} L{f(cx + 9 * s)} {f(cy)} L{f(cx + 13 * s)} {f(cy + 34 * s)} Q{f(cx)} {f(cy + 42 * s)} {f(cx - 13 * s)} {f(cy + 34 * s)} Z"
    return (f'<g filter="{bevel(card, "lead-bv", 1, 2.4, 3, 3, 0.6)}"><circle cx="{f(cx)}" cy="{f(cy - 4 * s)}" r="{f(5 * s)}" fill="none" stroke="{g}" stroke-width="{f(2.5 * s)}"/>'
            f'<path d="{d}" fill="{g}"/></g>')


def my_c():
    c = start("mc")
    win = rrect(96, 262, 452, 726, 22)
    rnd = random.Random(4)
    web, nodes = cosmic_web(c, "cw", 11, (14, 14, 526, 252), 48, "#C9B2FF", "#FFE9F7", 3, 0.9, 0.95, 0.6)
    rope = "".join(f'<path d="M30 {y} q4 5 0 10" fill="none" stroke="#E8D6A8" stroke-width="2.4"/>' for y in range(12, 880, 10))
    ticks = []
    labels = [(40, "26"), (200, "21"), (300, "9"), (420, "1"), (530, "-5"), (640, "-10"), (738, "-15"), (930, "-35")]
    for i, y in enumerate(list(range(30, 750, 18)) + [930]):
        major = any(abs(y - ly) < 9 for ly, _ in labels)
        ticks.append(f'<line x1="36" y1="{y}" x2="{50 if major else 43}" y2="{y}" stroke="#BFFBFF" stroke-width="{1.2 if major else 0.7}" opacity="0.9"/>')
    labs = "".join(scale_label(54, ly + 3, e) for ly, e in labels)
    icons = [
        (282, lambda x, y: galaxy_cluster(c, "ic1", 2, x, y, 17, 10)),
        (336, lambda x, y: spiral_galaxy(c, "ic2", x, y, 19, 0.5, 20, "#CFE0FF", "#FFF1CF", "#7FA8FF", 3, 200, 2, False)),
        (390, lambda x, y: f'<circle cx="{x}" cy="{y}" r="19" fill="{c.rgrad("sun", [(0, "#FFFFFF", 1), (0.3, "#FFE7A8", 1), (0.7, "#FF9A3C", 0.7), (1, "#FF9A3C", 0)])}"/>'),
        (444, lambda x, y: f'<circle cx="{x}" cy="{y}" r="15" fill="{c.rgrad("earth", [(0, "#BFFBFF", 1), (0.5, "#1F7FC0", 1), (1, "#0A2A6A", 1)], 0.4, 0.35, 0.7)}"/><path d="M{x - 9} {y - 5} q6 -7 10 -1 q3 5 -2 8 z" fill="#3FAF6E" opacity="0.85"/><path d="M{x + 3} {y + 6} q5 -2 8 2" fill="none" stroke="#3FAF6E" stroke-width="2.4" opacity="0.8"/>'),
        (498, lambda x, y: star_whale(c, "icw", x + 2, y, 0.15, False, -10, "#3A4BC8", "#BFE6FF", 40, 2)),
        (552, lambda x, y: place(jellyfish(c, "icj", 11, "#FF9FE8", "#BFA8FF", 3, 1.6, 8, 3), x, y - 2, 1.0)),
        (606, lambda x, y: cell(c, "icc", x, y, 16, 4)),
        (660, lambda x, y: dna(c, "icd", x, y - 17, y + 17, 7, 2, "#7FF6FF", "#FFD36E", w=1.4, rungs_per_turn=6)),
        (714, lambda x, y: atom(c, "ica", x, y, 16, "#9FF4FF", 3, "#FFFFFF", 2, False, 0.9)),
        (790, lambda x, y: nucleus(c, "icn", x, y, 14, 7, 11)),
        (850, lambda x, y: "".join(f'<circle cx="{f(x + dx)}" cy="{f(y + dy)}" r="4.6" fill="{col}"/>' for dx, dy, col in ((-5.5, 3.5, "#FF5A7A"), (5.5, 3.5, "#5AFF9A"), (0, -5.5, "#5A9AFF"))) + f'<circle cx="{x}" cy="{y}" r="12" fill="none" stroke="#FFFFFF" stroke-width="0.8" stroke-dasharray="2 2"/>'),
        (906, lambda x, y: string_loop(x, y, 11, 5, 0.25, 0, "#FFD36E", 1.4)),
    ]
    icon_m = "".join(droplet(c, "icb", 496, y, 24, fn(496, y)) for y, fn in icons)
    parts = [
        deep_space(c, "bg", "#07061E", "#0A1A40", "#03030E"),
        nebula_cloud(c, "neb", 300, 140, 280, 130, ("#B69CFF", "#2A3CCF", "#38E1FF"), 3, 0.7, 0, 30),
        starfield(c, 6, 340, (0, 0, W, H), (90, 256, 458, 730), bright=8),
        web,
        quantum_foam(c, "qf", 9, (60, 880, 470, 960), 80, "#9FB8FF", avoid=None),
        f'<g filter="{glow(c, "strs", 1.4, 2)}">{open_string(120, 930, 190, 914, 3, 5, "#7FF6FF", 1.1)}{open_string(360, 916, 430, 934, 4, 5, "#FFD36E", 1.1)}{string_loop(270, 930, 12, 4, 0.25, 0, "#FF8AD8", 1.2)}</g>',
        rope,
        f'<g>{"".join(ticks)}</g>',
        labs,
        f'<line x1="496" y1="250" x2="496" y2="930" stroke="#BFFBFF" stroke-width="1" opacity="0.5" filter="{glow(c, "chain", 1.5, 1)}"/>',
    ]
    deco(c, win, parts)
    c.add(icon_m)
    c.add(sounding_lead(c, 32, 884, 1.0))
    myth_window(c, win)
    myth_crest(c, 150, 0.84)
    mee_meo(c, "perches", "mee-danse", "meo-feu-artifice")
    myth_plaque(c, "À toutes les échelles")
    c.add(outer_frame(c, ("#FFFFFF", "#CFC2FF", "#6A5CC4"), 10, 3, 24, "of"))
    c.add(f'<rect x="10" y="10" width="520" height="940" rx="24" fill="none" stroke="{c.prism("ofp", 0, 0, 1, 1)}" stroke-width="2" opacity="0.9"/>')
    save(c, "mythe-c")
    register("mythe-c", "mythe", None, "C", "La Sonde de l'univers",
             "La ligne de sonde des marins plonge le long de la photo, graduée de 10²⁶ m à 10⁻³⁵ m : la toile cosmique couvre le ciel, "
             "puis l'échelle descend, chaque échelon enfermé dans une bulle de verre reliée à la suivante — amas, galaxie, soleil, planète océan, baleine, méduse, cellule, ADN, atome, noyau, quarks, corde — "
             "jusqu'à la mousse quantique où pend le plomb d'or.",
             "perches : Mee (danse) et Meo (feu d'artifice) de part et d'autre du blason", "À toutes les échelles")


ALL = [my_a, my_b, my_c]
