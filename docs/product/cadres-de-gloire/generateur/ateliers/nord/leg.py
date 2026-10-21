"""Aurores du Nord - LÉGENDE V..I : l'immense et l'infime tissés aux motifs du Nord ; de V à I le cadre s'ouvre
de plus en plus loin dans les deux sens. Blason d'obsidienne liseré de glace."""

import math
import random

from common import *  # noqa: F401,F403
from cosmos import (star_field, bright_stars, cstar, constellation, star_trails, nebula, milky_way, spiral_galaxy, elliptical,
                    globular, galaxy_cluster, black_hole, quasar, supernova, eye_nebula, cosmic_web, atom, orbital, nucleus,
                    dna, neuron, cell, dendrite, plate_crystal, ice_lattice, hex_geometry, wave_packet, interference,
                    particle_tracks, quantum_foam, string_loop, SPECTRUM, light_beam, ice_prism, corona_soft, mini_galaxy)
from beasts import RAVEN_SOAR, world_tree, asgard, dragon_head2, WOLF_SIT

EDGE = "#DDF2FF"


def legend_crest(c, cx, cy, s, division, glow="#9F7CFF", r=90):
    crest_block(c, cx, cy, s, "obsidian", division, GEM_AURORE, glow=glow, backing="#02040A", glow_r=r, edge=EDGE, ink="#BFE6FF")


def space(c, name, seed, stops=("#02020A", "#0A0A24", "#141038", "#07061A"), n=380, keep=KEEP):
    return sky(c, name, [(0, stops[0]), (0.35, stops[1]), (0.7, stops[2]), (1, stops[3])]) + star_field(seed, n, keep=keep)


def luminous(c, name, d, color, core="#FFFFFF", glow=6, op=1.0):
    return (f'<g opacity="{f(op)}"><g filter="{ublur(c, name + "-g", glow)}" opacity="0.8"><path d="{d}" fill="{color}"/></g>'
            f'<path d="{d}" fill="{color}" opacity="0.9"/></g>')


# =============================================================== V — le Bifröst

def bifrost_frame(c, name, cx, cy, rx0, ry0, width, y_end, colors=SPECTRUM):
    n = len(colors)
    bw = width / n
    bands = []
    for i, col in enumerate(colors):
        rx = rx0 + width - bw * (i + 0.5)
        ry = ry0 + width - bw * (i + 0.5)
        d = f"M{f(cx - rx)} {f(y_end)} L{f(cx - rx)} {f(cy)} A{f(rx)} {f(ry)} 0 0 1 {f(cx + rx)} {f(cy)} L{f(cx + rx)} {f(y_end)}"
        bands.append(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{f(bw + 0.8)}"/>')
    body = "".join(bands)
    tex = noise_filter(c, name + "-tx", "0.01 0.05", 3, 7, 2.4, -0.4)
    rnd = random.Random(4)
    rays = []
    rx1, ry1 = rx0 + width, ry0 + width
    for i in range(150):
        t = rnd.uniform(0.02, 0.98) * math.pi
        x, y = cx - rx1 * math.cos(t), cy - ry1 * math.sin(t)
        nx, ny = -math.cos(t) * ry1, -math.sin(t) * rx1
        nn = math.hypot(nx, ny)
        L = rnd.uniform(20, 70)
        rays.append(f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(x + nx / nn * L)}" y2="{f(y + ny / nn * L)}" stroke-width="{f(rnd.uniform(1, 3.2))}" opacity="{f(rnd.uniform(0.15, 0.5))}"/>')
    for side in (-1, 1):
        for i in range(30):
            y = rnd.uniform(cy, y_end - 20)
            x = cx + side * rx1
            L = rnd.uniform(16, 50)
            rays.append(f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(x + side * L)}" y2="{f(y)}" stroke-width="{f(rnd.uniform(1, 3))}" opacity="{f(rnd.uniform(0.1, 0.4))}"/>')
    rg = c.grad(name + "-rg", [(0, "#4DFFB4"), (1, "#B07CFF")], 0, 0, 0, 1)
    return (f'<g style="mix-blend-mode:screen"><g stroke="{rg}" filter="{ublur(c, name + "-rb", 2.2)}">{"".join(rays)}</g>'
            f'<g filter="{ublur(c, name + "-gb", width * 0.5)}" opacity="0.55">{body}</g>'
            f'<g filter="{ublur(c, name + "-sb", 2.2)}" opacity="0.55">{body}</g><g filter="{tex}" opacity="0.5">{body}</g></g>')


def bifrost_bridge(c, name, cx, cy, rx0, ry0, width, y_end, colors=SPECTRUM, seed=4, strands=900):
    """Le Bifröst en pont de lumière : des milliers de brins d'aurore teints du spectre selon le rayon
    (rouge dehors, violet dedans), un voile lumineux, et le tablier - un fil blanc où l'on marche."""
    rnd = random.Random(seed)
    rx1, ry1 = rx0 + width, ry0 + width
    k = ry1 / rx1
    n = len(colors)
    stops = "".join(f'<stop offset="{f(rx0 / rx1 + (1 - rx0 / rx1) * (n - 1 - i) / (n - 1))}" stop-color="{col}"/>' for i, col in reversed(list(enumerate(colors))))
    rid = c.id(name + "-rg")
    c.def_once(name + "-rg", f'<radialGradient id="{rid}" gradientUnits="userSpaceOnUse" cx="{f(cx)}" cy="{f(cy)}" r="{f(rx1)}" '
                             f'gradientTransform="translate(0 {f(cy)}) scale(1 {f(k)}) translate(0 {f(-cy)})">'
                             f'<stop offset="0" stop-color="{colors[-1]}"/>{stops}</radialGradient>')
    lstops_l = "".join(f'<stop offset="{f(i / (n - 1))}" stop-color="{col}"/>' for i, col in enumerate(colors))
    c.def_once(name + "-ll", f'<linearGradient id="{c.id(name + "-ll")}" gradientUnits="userSpaceOnUse" x1="{f(cx - rx1)}" y1="0" x2="{f(cx - rx0)}" y2="0">{lstops_l}</linearGradient>')
    c.def_once(name + "-lr", f'<linearGradient id="{c.id(name + "-lr")}" gradientUnits="userSpaceOnUse" x1="{f(cx + rx1)}" y1="0" x2="{f(cx + rx0)}" y2="0">{lstops_l}</linearGradient>')
    rg, gl, gr = f"url(#{rid})", f"url(#{c.id(name + '-ll')})", f"url(#{c.id(name + '-lr')})"
    band_mid = (rx0 + rx1) / 2, (ry0 + ry1) / 2
    arc = f"M{f(cx - band_mid[0])} {f(cy)} A{f(band_mid[0])} {f(band_mid[1])} 0 0 1 {f(cx + band_mid[0])} {f(cy)}"
    out = [f'<g style="mix-blend-mode:screen">']
    out.append(f'<path d="{arc}" fill="none" stroke="{rg}" stroke-width="{f(width * 1.5)}" opacity="0.5" filter="{ublur(c, name + "-gb", width * 0.5)}"/>')
    for side, g in ((-1, gl), (1, gr)):
        x = cx + side * band_mid[0]
        out.append(f'<path d="M{f(x)} {f(cy)} L{f(x)} {f(y_end)}" fill="none" stroke="{g}" stroke-width="{f(width * 1.5)}" opacity="0.5" filter="{ublur(c, name + "-gb", width * 0.5)}"/>')
    out.append(f'<path d="{arc}" fill="none" stroke="{rg}" stroke-width="{f(width)}" opacity="0.32"/>')
    lines_a, lines_l, lines_r = [], [], []
    for _ in range(strands):
        t = rnd.uniform(0.0, 1.0) * math.pi
        a = rnd.uniform(0, 0.35)
        b = rnd.uniform(0.6, 1.0) if rnd.random() < 0.7 else rnd.uniform(0.4, 1.25)
        r_a, r_b = rx0 + width * a, rx0 + width * b
        x1, y1 = cx - r_a * math.cos(t), cy - r_a * k * math.sin(t)
        x2, y2 = cx - r_b * math.cos(t), cy - r_b * k * math.sin(t)
        lines_a.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke-width="{f(rnd.uniform(0.5, 1.8))}" opacity="{f(rnd.uniform(0.25, 0.9))}"/>')
    for _ in range(int(strands * 0.45)):
        y = rnd.uniform(cy, y_end)
        a = rnd.uniform(0, 0.35)
        b = rnd.uniform(0.6, 1.0) if rnd.random() < 0.7 else rnd.uniform(0.4, 1.25)
        fade = 1 - (y - cy) / (y_end - cy) * 0.5
        for side, bucket in ((-1, lines_l), (1, lines_r)):
            xa, xb = cx + side * (rx0 + width * a), cx + side * (rx0 + width * b)
            bucket.append(f'<line x1="{f(xa)}" y1="{f(y)}" x2="{f(xb)}" y2="{f(y)}" stroke-width="{f(rnd.uniform(0.5, 1.6))}" opacity="{f(rnd.uniform(0.2, 0.8) * fade)}"/>')
    out.append(f'<g stroke="{rg}" filter="{ublur(c, name + "-sb", 0.5)}">{"".join(lines_a)}</g>')
    out.append(f'<g stroke="{gl}" filter="{ublur(c, name + "-sb", 0.5)}">{"".join(lines_l)}</g>')
    out.append(f'<g stroke="{gr}" filter="{ublur(c, name + "-sb", 0.5)}">{"".join(lines_r)}</g>')
    deck = f"M{f(cx - rx0)} {f(y_end)} L{f(cx - rx0)} {f(cy)} A{f(rx0)} {f(ry0)} 0 0 1 {f(cx + rx0)} {f(cy)} L{f(cx + rx0)} {f(y_end)}"
    out.append(f'<path d="{deck}" fill="none" stroke="#FFFFFF" stroke-width="6" opacity="0.35" filter="{ublur(c, name + "-db", 3)}"/>')
    out.append(f'<path d="{deck}" fill="none" stroke="#FFFFFF" stroke-width="1.4" opacity="0.95"/>')
    sp = []
    for _ in range(70):
        t = rnd.uniform(0.02, 0.98) * math.pi
        r = rx0 + width * rnd.uniform(0, 1.1)
        x, y = cx - r * math.cos(t), cy - r * k * math.sin(t)
        sp.append(sparkle(x, y, rnd.uniform(1.5, 4.5), "#FFFFFF", rnd.uniform(0.5, 1)))
    out.append("".join(sp))
    out.append("</g>")
    return "".join(out)


def photon_on_arc(cx, cy, rx, ry, amp, k, color, w=1.2, op=0.9, t0=0.0, t1=math.pi):
    pts = []
    for i in range(241):
        t = t0 + (t1 - t0) * i / 240
        x, y = cx - rx * math.cos(t), cy - ry * math.sin(t)
        nx, ny = -math.cos(t) * ry, -math.sin(t) * rx
        nn = math.hypot(nx, ny) or 1
        a = amp * math.sin(k * t)
        pts.append((x + nx / nn * a, y + ny / nn * a))
    return f'<path d="M{" L".join(f"{f(x)} {f(y)}" for x, y in pts)}" fill="none" stroke="{color}" stroke-width="{f(w)}" opacity="{f(op)}"/>'


def leg5():
    c = start("l5", "#1E2240", "#080A16", "#E0E6FF", 0.2)
    win = arch(88, 452, 432, 276, 728)
    m = deco_mask(c, win)
    d = [space(c, "sky", 101)]
    d.append(nebula(c, "nb1", 90, 300, 150, 200, "#FF6FC8", "#5A2A9A", 0.6, seed=3))
    d.append(nebula(c, "nb2", 470, 420, 140, 220, "#4FC3FF", "#2A3C8C", 0.55, seed=8))
    d.append(spiral_galaxy(c, "g1", 82, 92, 54, 0.42, -24, seed=5, n=600))
    d.append(globular(9, 470, 70, 22, 160))
    d.append(asgard(c, "as", 270, 100, 0.7, "#0A0820", "#FFD36E"))
    d.append(f'<path d="M206 72 L270 34 L334 72" fill="none" stroke="#FFD36E" stroke-width="1" opacity="0.0"/>')
    d.append(bifrost_bridge(c, "bf", 270, 432, 194, 170, 50, 740))
    d.append(photon_on_arc(270, 432, 218, 194, 7, 46, "#FFFFFF", 1.1, 0.75, 0.05, math.pi - 0.05))
    d.append(f'<path d="M-20 790 C80 760 180 770 270 784 C360 770 460 756 560 774 L560 960 L-20 960 Z" fill="{c.grad("gr", [(0, "#DCE6FF"), (1, "#5A6A9A")])}"/>')
    c.add(f'<g mask="{m}">{"".join(d)}</g>')
    c.add(grade(c, win, "#B07CFF", 0.5, 0.0, 0.2, "gr2"))
    c.add(inner_shadow(c, win, 30, 12, 0.6))
    c.add(gold_rim(c, win, ARGENT, 4))
    c.add(light_beam(c, "lb", -10, 712, 46, 748, 1.8))
    c.add(f'<circle cx="52" cy="748" r="34" fill="{c.rgrad("pg", [(0, "#FFFFFF", 0.6), (1, "#BFE6FF", 0)])}"/>')
    c.add(ice_prism(c, "ip", 52, 750, 24, 0))
    for i, col in enumerate(SPECTRUM):
        c.add(f'<line x1="54" y1="742" x2="{f(52 + i * 3)}" y2="728" stroke="{col}" stroke-width="2" opacity="0.8"/>')
    c.add(plate_crystal(488, 744, 16, "#F4FBFF", 0, 0.95, 1.2))
    c.add(dendrite(488, 744, 9, "#FFFFFF", 0.8, 1))
    spec = []
    x0, x1, y = 150, 390, 904
    for i in range(60):
        t = i / 59
        col = SPECTRUM[min(6, int(t * 7))]
        spec.append(f'<rect x="{f(x0 + (x1 - x0) * i / 60)}" y="{y}" width="{f((x1 - x0) / 60 + 0.5)}" height="6" fill="{col}"/>')
    for t in (0.12, 0.31, 0.37, 0.55, 0.74, 0.86):
        spec.append(f'<rect x="{f(x0 + (x1 - x0) * t)}" y="{y}" width="1.6" height="6" fill="#05040E"/>')
    c.add(outer_frame(c, ARGENT, 12, 3.5))
    legend_crest(c, 270, 158, 0.82, 5, glow="#B07CFF", r=80)
    birds(c, [("mee-sourire", 130, 742, 120, False, -6), ("meo-yo", 410, 742, 120, True, 6)])
    inscription(c, "Légende V", None, y=782, style="cosmos", metal=ARGENT, panel=("#140E30", "#05040E"), kicker=kicker())
    c.add(f'<rect x="{x0 - 3}" y="{y - 3}" width="{x1 - x0 + 6}" height="12" rx="3" fill="#05040E" opacity="0.8"/>' + "".join(spec))
    save(c, "legende-5", "Légende", 5, "V", "Le Bifröst",
         "L'aurore devient le Bifröst, le pont arc-en-ciel qui mène à Asgard : des milliers de brins de lumière teints du spectre, rouges dehors, violets dedans, enjambent la photo jusqu'à la citadelle d'or, entre nébuleuses et galaxie spirale. "
         "À son pied, l'infime : un prisme de glace décompose un rayon d'étoile, un photon ondule le long du pont, "
         "et sous l'inscription le spectre de la lumière montre ses raies d'absorption.",
         "pied : Mee (sourire) et Meo (yo) au pied du pont", None)


# =============================================================== IV — les branches-galaxies

def leg4():
    c = start("l4", "#1C2440", "#070A16", "#D8F4FF", 0.2)
    win = "M270 262 C402 300 466 402 466 500 C466 604 400 700 270 740 C140 700 74 604 74 500 C74 402 138 300 270 262 Z"
    m = deco_mask(c, win)
    d = [space(c, "sky", 111, ("#01020A", "#071430", "#0E1E44", "#050816"))]
    d.append(nebula(c, "nb1", 120, 180, 180, 150, "#3FE8C8", "#1A3C8C", 0.5, seed=12))
    d.append(nebula(c, "nb2", 430, 160, 170, 140, "#B07CFF", "#3A1A7A", 0.55, seed=17))
    d.append(nebula(c, "nb3", 270, 900, 260, 120, "#4DFFB4", "#1A4C6C", 0.4, seed=21))
    c.add(f'<g mask="{m}">{"".join(d)}</g>')
    c.add(grade(c, win, "#7CF7FF", 0.5, 0.0, 0.2, "gr"))
    c.add(inner_shadow(c, win, 30, 12, 0.6))
    segs, tips = world_tree(c, "wt", seed=23, base=(270, 940), spread=1.0, crown_y=160, side_x=(70, 470), waist=(360, 600), twig_len=46, depth=3)
    body = " ".join(segs)
    tree = (f'<g filter="{ublur(c, "tgl", 6)}" opacity="0.75"><path d="{body}" fill="#5FE8FF"/></g>'
            f'<path d="{body}" fill="{c.grad("tf", [(0, "#F4FBFF"), (0.5, "#9FE8FF"), (1, "#4FA6D6")], 0, 0, 0, 1)}"/>')
    c.add(f'<g mask="{deco_mask(c, win, "tm")}">{tree}</g>')
    rnd = random.Random(7)
    out_tips = [t for t in tips if not (80 < t[0] < 460 and 270 < t[1] < 730) and t[1] < 760]
    rnd.shuffle(out_tips)
    pal = [("#BFD4FF", "#FF9FD8", "#FFF4DC"), ("#9FFFE0", "#7CB8FF", "#FFFFFF"), ("#FFD9A8", "#FF8FB8", "#FFF4DC"), ("#D8C4FF", "#FF9FD8", "#FFFFFF")]
    for i, (x, y, a) in enumerate(out_tips[:16]):
        arm, pink, core = pal[i % 4]
        r = rnd.uniform(9, 15) if i > 5 else rnd.uniform(15, 22)
        c.add(mini_galaxy(c, f"g{i % 4}", x, y, r, rnd.uniform(0.4, 0.85), rnd.uniform(0, 180), arm, core, pink, seed=i))
    c.add(leaves(4, out_tips[16:], "#BFFFF0", r=1.4, n=4, spread=5))
    for x, flip in ((64, False), (476, True)):
        c.add(neuron(c, "nr", 31 + int(x), x, 884, 150, "#7CF7FF", axon_angle=60 if not flip else -60, axon_len=90, dendrites=7, w=2.8))
    c.add(gold_rim(c, win, ARGENT, 4))
    c.add(outer_frame(c, ARGENT, 12, 3.5))
    legend_crest(c, 270, 148, 0.84, 4, glow="#7CF7FF", r=86)
    birds(c, [("mee-lettre", 74, 760, 116, False, -4), ("meo-salut", 466, 760, 116, True, 4)])
    inscription(c, "Légende IV", "Nos racines, nos étoiles", y=784, style="nuit", metal=ARGENT, panel=("#0A1430", "#03060E"), kicker=kicker())
    save(c, "legende-4", "Légende", 4, "IV", "Les Branches-galaxies",
         "Yggdrasil s'allume comme un arbre de lumière : au bout de ses branches éclosent des galaxies spirales de toutes les couleurs, "
         "tandis que ses racines, sous l'inscription, deviennent des neurones aux synapses étincelantes - la même ramure de l'arbre, du cerveau et du cosmos.",
         "ruban : Mee (lettre) et Meo (salut) au bord de l'inscription", "Nos racines, nos étoiles")


# =============================================================== III — pensée et mémoire

def cosmic_raven(c, name, x, y, s, flip, seed, colors):
    sx = -s if flip else s
    tr = f"translate({f(x)} {f(y)}) scale({f(sx)} {f(s)})"
    cid = c.id(name + "-c")
    c.def_once(name + "-c", f'<clipPath id="{cid}"><path d="{RAVEN_SOAR}" transform="{tr}"/></clipPath>')
    inner = (f'<rect x="{f(x - 160)}" y="{f(y - 160)}" width="320" height="260" fill="#04030E"/>'
             + f'<rect x="{f(x - 160)}" y="{f(y - 160)}" width="320" height="260" fill="{c.rgrad(name + "-base", [(0, colors[1], 1), (1, "#04030E", 1)])}"/>'
             + nebula(c, name + "-n1", x - 20 * (1 if not flip else -1), y - 40, 100, 80, colors[0], colors[1], 1.0, seed=seed)
             + nebula(c, name + "-n2", x + 40 * (1 if not flip else -1), y - 10, 80, 60, colors[2], colors[1], 0.9, seed=seed + 3)
             + star_field(seed, 260, (x - 150, y - 140, x + 150, y + 30), rmax=1.6))
    eye = pt(x, y, 0, 0)
    ex = x + (52 if not flip else -52) * s
    ey = y - 7 * s
    return (f'<path d="{RAVEN_SOAR}" transform="{tr}" fill="none" stroke="#BFE6FF" stroke-width="{f(5 / s)}" opacity="0.35" filter="{ublur(c, name + "-rg", 4)}"/>'
            f'<g clip-path="url(#{cid})">{inner}</g>'
            f'<path d="{RAVEN_SOAR}" transform="{tr}" fill="none" stroke="{EDGE}" stroke-width="{f(1.3 / s)}" opacity="0.9"/>'
            + cstar(c, ex, ey, 1.6, "#FFFFFF", "#7CF7FF", name=name + "-e"))


def leg3():
    c = start("l3", "#1E1E3C", "#08081A", "#E6E0FF", 0.2)
    win = rrect(96, 282, 444, 726, 28)
    m = deco_mask(c, win)
    d = [space(c, "sky", 121, ("#02010A", "#0C0828", "#16103A", "#07051A"))]
    d.append(milky_way(c, "mw", [(-60, 980), (180, 640), (380, 300), (600, -40)], 90, seed=31, keep=None, op=0.9))
    d.append(supernova(c, "sn", 474, 52, 30, seed=9))
    d.append(mini_galaxy(c, "g1", 62, 56, 30, 0.5, 30, "#FFD9A8", "#FFF4DC", "#FF8FB8", seed=13))
    d.append(nebula(c, "nb1", 270, 120, 220, 100, "#5A3CFF", "#1A1050", 0.45, seed=14))
    c.add(f'<g mask="{m}">{"".join(d)}</g>')
    c.add(grade(c, win, "#9F7CFF", 0.5, 0.0, 0.2, "gr"))
    c.add(inner_shadow(c, win, 30, 12, 0.6))
    c.add(gold_rim(c, win, ARGENT, 4))
    c.add(neuron(c, "nr", 41, 46, 478, 116, "#7CF7FF", axon_angle=9, axon_len=246, dendrites=7, w=2.6))
    c.add(dna(c, "dn", 470, 236, 482, 722, turns=6, amp=13, w=2.4))
    c.add(cosmic_raven(c, "hu", 96, 214, 1.5, False, 3, ("#7CF7FF", "#2A3C8C", "#B07CFF")))
    c.add(cosmic_raven(c, "mu", 444, 214, 1.5, True, 8, ("#FF8FD0", "#4A1A7A", "#FFD36E")))
    c.add(glow_text(c, 108, 262, "HUGINN", 10, EDGE, CINZEL, 0.85, ls=3, glow="#7CF7FF", name="t1"))
    c.add(glow_text(c, 432, 262, "MUNINN", 10, EDGE, CINZEL, 0.85, ls=3, glow="#FF8FD0", name="t2"))
    c.add(outer_frame(c, ARGENT, 12, 3.5))
    legend_crest(c, 270, 150, 0.84, 3, glow="#9F7CFF", r=84)
    birds(c, [("mee-courage", 112, 718, 132, False, -6), ("meo-muscles", 428, 718, 132, True, 6)])
    inscription(c, "Légende III", None, y=780, style="cosmos", metal=ARGENT, panel=("#140E30", "#05040E"), kicker=kicker())
    save(c, "legende-3", "Légende", 3, "III", "Pensée et Mémoire",
         "Huginn (la Pensée) et Muninn (la Mémoire), les corbeaux d'Odin, traversent la Voie lactée, découpés dans l'étoffe des nébuleuses. "
         "Pensée tient un neurone, Mémoire une double hélice d'ADN : ce que l'on pense et ce que l'on transmet, porté jusqu'aux étoiles, "
         "entre une supernova et une galaxie lointaine.",
         "pied : Mee (courage) et Meo (muscles) au pied de la photo", None)


# =============================================================== II — Skíðblaðnir

def leg2():
    c = start("l2", "#1A2240", "#060914", "#D8ECFF", 0.2)
    win = rrect(74, 276, 466, 706, 26)
    m = deco_mask(c, win)
    d = [space(c, "sky", 131, ("#01020A", "#080E2A", "#121A44", "#04060F"))]
    d.append(curtains(c, "au1", 262, 200, amp=34, waves=1.2, phase=0.4, fold=36, seed=71, op=(0.1, 0.48)))
    d.append(curtains(c, "au2", 200, 140, amp=22, waves=0.8, phase=2.4, fold=22, seed=72, top="#FF6FC8", mid="#B07CFF", low="#F0E0FF", op=(0.08, 0.32)))
    d.append(spiral_galaxy(c, "g1", 452, 108, 84, 0.46, -28, seed=21, n=900, arm="#BFD4FF", pink="#FF8FD0"))
    d.append(globular(17, 160, 60, 18, 140))
    d.append(nebula(c, "nb1", 60, 480, 120, 220, "#3FE8C8", "#1A2C6C", 0.45, seed=18))
    d.append(nebula(c, "nb2", 480, 500, 120, 220, "#FF8FD0", "#3A1A6A", 0.4, seed=19))
    d.append(milky_way(c, "mw", [(-60, 820), (180, 780), (380, 800), (600, 770)], 150, seed=41, keep=None, op=1.0))
    c.add(f'<g mask="{m}">{"".join(d)}</g>')
    c.add(grade(c, win, "#7CB8FF", 0.5, 0.0, 0.2, "gr"))
    c.add(inner_shadow(c, win, 30, 12, 0.6))
    c.add(gold_rim(c, win, ARGENT, 4))
    pocket = c.rgrad("pocket", [(0, "#4F6BFF", 0.25), (0.8, "#7CF7FF", 0.35), (1, "#FFFFFF", 0.7)])
    mini = drakkar(c, "mk", ("#DDF2FF", "#9FC8FF"), "#BFE6FF", ARGENT, shields=False, oars=False)
    c.add(f'<circle cx="84" cy="104" r="62" fill="{c.rgrad("pockh", [(0, "#7CF7FF", 0.35), (1, "#7CF7FF", 0)])}"/>')
    c.add(f'<circle cx="84" cy="104" r="44" fill="{pocket}" stroke="#DDF2FF" stroke-width="1.2"/>')
    c.add(f'<g filter="{ublur(c, "mkg", 2)}" opacity="0.8">{place(mini, 50, 116, 0.17)}</g>{place(mini, 50, 116, 0.17)}')
    c.add(f'<path d="M58 80 A34 34 0 0 1 96 72" fill="none" stroke="#FFFFFF" stroke-width="2" opacity="0.7" stroke-linecap="round"/>')
    c.add(f'<ellipse cx="84" cy="104" rx="60" ry="16" fill="none" stroke="#9FE8FF" stroke-width="1" opacity="0.7" transform="rotate(-20 84 104)"/>')
    c.add(cstar(c, 140, 84, 1.4, "#FFFFFF", "#7CF7FF", spikes=False, name="pe"))
    for name, x, y, sz, kind, rot, c1, c2 in (("o1", 40, 400, 40, "p", 20, "#7CF7FF", "#4F6BFF"), ("o2", 500, 420, 36, "d", 10, "#FFE27A", "#FF6FC8"),
                                              ("o3", 36, 610, 26, "d", 45, "#9FFFD8", "#B07CFF"), ("o4", 504, 620, 30, "p", -30, "#FF9FD0", "#B07CFF")):
        c.add(orbital(c, name, x, y, sz, kind, rot, c1, c2, op=1.0))
    hull = "M-10 752 C80 742 170 738 270 738 C370 738 460 742 550 752 L530 806 C450 836 360 846 270 846 C180 846 90 836 10 806 Z"
    hg = c.grad("hull", [(0, "#4A3CA8"), (0.45, "#24186A"), (1, "#0A0620")], 0, 0, 0, 1)
    mast_g = metal_grad(c, "mast", ARGENT, 0, 0, 1, 0)
    c.add(f'<line x1="270" y1="70" x2="270" y2="280" stroke="#0A0E20" stroke-width="9"/><line x1="270" y1="70" x2="270" y2="280" stroke="{mast_g}" stroke-width="5"/>')
    shrouds = "".join(f'<line x1="270" y1="74" x2="{x1}" y2="{580 if x1 < 270 else 574}" stroke="#BFE6FF" stroke-width="0.9" opacity="0.55"/>' for x1 in (40, 500))
    c.add(f'<g mask="{deco_mask(c, win, "shm")}">{shrouds}</g>')
    c.add(f'<g filter="{c.shadow("ysh", 0, 3, 4, "#000000", 0.6)}"><path d="{ribbon([(70, 270), (170, 262), (270, 260), (370, 262), (470, 270)], 10, 10, n=30, wfn=lambda t: 4 + 7 * math.sin(math.pi * t))}" fill="{mast_g}" stroke="#0A0E20" stroke-width="1.2"/></g>')
    c.add(f'<path d="M274 64 L330 70 L274 92 Z" fill="{c.grad("pen", [(0, "#7CF7FF"), (1, "#B07CFF")], 0, 0, 1, 0)}" opacity="0.9"/>')
    glowf = c.shadow("hglow", 0, 0, 12, "#7CB8FF", 0.7)
    prow = [(6, 790), (30, 750), (44, 690), (56, 630), (80, 596), (104, 584)]
    stern = [(534, 790), (512, 750), (498, 690), (494, 630), (504, 590), (524, 578), (536, 592), (526, 606)]
    ship = [f'<path d="{hull}" fill="{hg}" stroke="#BFE6FF" stroke-width="1.6"/>']
    ship.append(f'<path d="{hull}" fill="#7C6CFF" opacity="0.35" filter="{noise_filter(c, "hn", "0.03", 3, 5, 2.6, -1.0)}"/>')
    for pts, w0, w1 in ((prow, 28, 15), (stern, 28, 6)):
        ship.append(f'<path d="{ribbon(pts, w0, w1, n=50)}" fill="{hg}" stroke="#BFE6FF" stroke-width="1.4"/>')
        ship.append(f'<path d="{smooth(pts[:-1])}" fill="none" stroke="#DDF2FF" stroke-width="1.6" opacity="0.8"/>')
    rnd_h = random.Random(77)
    hstars = "".join(f'<circle cx="{f(rnd_h.uniform(0, 540))}" cy="{f(rnd_h.uniform(742, 846))}" r="{f(rnd_h.uniform(0.4, 1.6))}" fill="#FFFFFF" opacity="{f(rnd_h.uniform(0.3, 0.95))}"/>' for _ in range(160))
    ship.append(f'<g clip-path="{win_clip(c, hull, "hullc")}">{hstars}{nebula(c, "hneb", 200, 790, 220, 60, "#FF8FD0", "#5A2A9A", 0.55, seed=33)}</g>')
    c.add(f'<g filter="{glowf}">{"".join(ship)}</g>')
    for k, yy in enumerate((766, 786, 806)):
        c.add(f'<path d="M0 {yy} C120 {yy - 14 + k * 4} 420 {yy - 14 + k * 4} 540 {yy}" fill="none" stroke="#BFE6FF" stroke-width="0.8" opacity="0.45" stroke-dasharray="1 7" stroke-linecap="round"/>')
    c.add(f'<path d="M-10 752 C80 742 170 738 270 738 C370 738 460 742 550 752" fill="none" stroke="{metal_grad(c, "gw", ARGENT)}" stroke-width="3"/>')
    c.add(f'<g filter="{bevel(c, "dbv", 1.0, 2.4, sd=4, dy=3, sop=0.6)}"><g transform="translate(104 584) rotate(30) scale(-0.95 0.95)">{dragon_head2(metal_grad(c, "dh", ARGENT), "#1A2040", "#7CF7FF")}</g></g>')
    for i, x in enumerate(range(96, 460, 36)):
        col = ("#7CF7FF", "#FF9FD0", "#FFE27A")[i % 3]
        c.add(f'<circle cx="{x}" cy="745" r="15" fill="#05040E" opacity="0.85" stroke="#DDF2FF" stroke-width="1.2"/>')
        c.add(atom(c, f"at{i % 3}", x, 745, 13, 3, 20 + i * 17, col, nucleus_seed=i, tilt=0.34, w=0.9))
    rnd = random.Random(5)
    spray = "".join(f'<circle cx="{f(-4 + rnd.gauss(0, 18))}" cy="{f(800 + rnd.gauss(0, 14))}" r="{f(rnd.uniform(0.5, 2))}" fill="#FFFFFF" opacity="{f(rnd.uniform(0.4, 1))}"/>' for _ in range(50))
    c.add(f'<g filter="{ublur(c, "spb", 0.6)}">{spray}</g>')
    c.add(outer_frame(c, ARGENT, 12, 3.5))
    legend_crest(c, 270, 150, 0.84, 2, glow="#7CB8FF", r=84)
    birds(c, [("mee-jackpot", 96, 700, 108, False, -6), ("meo-champagne", 444, 700, 108, True, 6)])
    inscription(c, "Légende II", "Cap sur les étoiles", y=820, style="nuit", metal=ARGENT, panel=("#0A1430", "#03060E"), kicker=kicker(), w=410)
    save(c, "legende-2", "Légende", 2, "II", "Skíðblaðnir",
         "Skíðblaðnir, le navire des dieux qui trouve toujours le vent et se replie dans une poche, vogue sur la Voie lactée, coque taillée dans une nébuleuse, mât et vergue d'argent, proue de dragon, "
         "sous l'aurore, entre un amas d'étoiles et une galaxie spirale ; en haut, le même navire tient tout entier dans une bulle. Ses boucliers sont des atomes, et de chaque côté de la photo flottent des orbitales électroniques : "
         "le plus grand et le plus petit sur le même navire.",
         "pied : Mee (jackpot) et Meo (champagne) à la proue et à la poupe", "Cap sur les étoiles")


# =============================================================== I — le puits de Mímir

def leg1():
    c = start("l1", "#1C1C3A", "#070716", "#E8E4FF", 0.22)
    win = oval(270, 506, 196, 196)
    m = deco_mask(c, win)
    d = [space(c, "sky", 141, ("#02010A", "#0A0826", "#120E36", "#05040F"), 420)]
    d.append(nebula(c, "nb1", 90, 300, 150, 160, "#FF6FC8", "#3A1A7A", 0.5, seed=31))
    d.append(nebula(c, "nb2", 460, 330, 150, 160, "#3FE8C8", "#1A2C6C", 0.5, seed=33))
    rnd = random.Random(11)
    swirl = []
    for _ in range(420):
        r = rnd.uniform(205, 330)
        a0 = rnd.uniform(0, 360)
        span = rnd.uniform(6, 26) * (260 / r)
        xa, ya = pt(270, 506, r, a0)
        xb, yb = pt(270, 506, r * 0.97, a0 + span)
        col = rnd.choice(("#BFE6FF", "#FFFFFF", "#B07CFF", "#7CF7FF", "#FFD9A8"))
        swirl.append(f'<path d="M{f(xa)} {f(ya)} A{f(r)} {f(r)} 0 0 1 {f(xb)} {f(yb)}" fill="none" stroke="{col}" stroke-width="{f(rnd.uniform(0.4, 1.6))}" opacity="{f(rnd.uniform(0.2, 0.75))}" stroke-linecap="round"/>')
    d.append(f'<g filter="{ublur(c, "swb", 0.6)}">{"".join(swirl)}</g>')
    d.append(eye_nebula(c, "eye", 270, 148, 118, seed=5))
    d.append(black_hole(c, "bh", 76, 92, 14, 0.24, 3.0))
    d.append(galaxy_cluster(c, "gc", 4, 62, 196, 26, 9))
    d.append(supernova(c, "sn", 470, 96, 40, seed=12, c1="#FFE8A8", c2="#FF6A3D", c3="#FF3D8A"))
    c.add(f'<g mask="{m}">{"".join(d)}</g>')
    c.add(grade(c, win, "#9F7CFF", 0.5, 0.0, 0.22, "gr"))
    c.add(inner_shadow(c, win, 34, 14, 0.7))
    ring = c.grad("ring", [(0, "#5E6A88"), (0.5, "#2A3048"), (1, "#121626")], 0, 0, 1, 1)
    c.add(f'<g filter="{c.shadow("rsh", 0, 6, 10, "#000000", 0.7)}"><circle cx="270" cy="506" r="214" fill="none" stroke="{ring}" stroke-width="34"/></g>')
    c.add(f'<circle cx="270" cy="506" r="214" fill="none" stroke="#C8D2E8" stroke-width="34" opacity="0.18" filter="{texture_filter(c, "rtx", "0.07", 3, 3, "#FFFFFF", 1.3, 4)}"/>')
    c.add(rune_ring(51, 270, 506, 214, 15, "#BFE6FF", 1.5))
    c.add(f'<g filter="{ublur(c, "rrg", 3)}" opacity="0.7">{rune_ring(51, 270, 506, 214, 15, "#7CF7FF", 2.5)}</g>')
    c.add(gold_rim(c, win, ARGENT, 4))
    c.add(f'<circle cx="270" cy="506" r="232" fill="none" stroke="{EDGE}" stroke-width="1.2" opacity="0.8"/>')
    c.add(interference(56, 700, 70, 12, 6, "#9FE8FF", 0.9, 0.6, 16, 30))
    c.add(atom(c, "at", 58, 700, 26, 3, 30, "#9FE8FF"))
    c.add(orbital(c, "od", 488, 690, 30, "d", 15, "#FFE27A", "#FF6FC8"))
    c.add(f'<g filter="{ublur(c, "dfb", 3)}" opacity="0.7">{dendrite(492, 270, 28, "#9FE8FF", 2.5, 2)}</g>' + dendrite(492, 270, 28, "#FFFFFF", 1, 2))
    c.add(f'<g filter="{ublur(c, "dfb2", 3)}" opacity="0.7">{dendrite(48, 274, 22, "#FFB0E8", 2.5, 2)}</g>' + dendrite(48, 274, 22, "#FFFFFF", 1, 2))
    c.add(wave_packet(300, 760, 460, 700, 10, 9, "#7CF7FF", 1.3, 0.8))
    c.add(wave_packet(80, 300, 230, 250, 9, 8, "#FF9FD0", 1.2, 0.7))
    c.add(outer_frame(c, ARGENT, 12, 3.5))
    legend_crest(c, 270, 146, 0.8, 1, glow="#FFFFFF", r=60)
    birds(c, [("mee-wow", 74, 748, 118, False, -6), ("meo-trophee", 466, 748, 118, True, 6)])
    inscription(c, "Légende I", "Plus loin, ensemble", y=800, style="cosmos", metal=ARGENT, panel=("#140E30", "#05040E"), kicker=kicker(), w=390)
    save(c, "legende-1", "Légende", 1, "I", "Le Puits de Mímir",
         "Odin donna un œil pour boire au puits de Mímir, source de toute sagesse : la photo est au fond du puits, cerclée de runes, et le cosmos s'y engouffre en spirale. "
         "Au-dessus, l'œil d'Odin est une nébuleuse planétaire ; autour, un trou noir, un amas de galaxies, une supernova - et l'infime : franges d'interférence, "
         "atome, orbitale, paquets d'ondes et flocons fractals.",
         "pied : Mee (wow) et Meo (trophée) sur la margelle", "Plus loin, ensemble")


ALL = [leg5, leg4, leg3, leg2, leg1]
