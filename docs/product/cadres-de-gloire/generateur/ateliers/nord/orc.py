"""Aurores du Nord - ORACLE A, B, C : le ciel s'ouvre, l'infime apparaît. Métal argent."""

import math
import random

from common import *  # noqa: F401,F403
from cosmos import (star_field, bright_stars, cstar, constellation, star_trails, nebula, milky_way, dendrite, plate_crystal,
                    ice_lattice, hex_geometry, pollen, cell, samara, corona_soft)
from beasts import WOLF_SIT

SILVER = ARGENT


def silver(c, name="silver", x1=0, y1=0, x2=1, y2=1):
    return metal_grad(c, name, SILVER, x1, y1, x2, y2)


DIPPER = [(0, 0), (4, 30), (42, 40), (48, 12), (78, 4), (106, -4), (132, 12)]
DIPPER_EDGES = [(0, 1), (1, 2), (2, 3), (3, 0), (3, 4), (4, 5), (5, 6)]
CASSIOPEIA = [(0, 0), (20, 24), (42, 10), (62, 30), (88, 14)]
CASS_EDGES = [(0, 1), (1, 2), (2, 3), (3, 4)]


def at(pts, x, y, s=1.0, rot=0):
    a = math.radians(rot)
    return [(x + s * (px * math.cos(a) - py * math.sin(a)), y + s * (px * math.sin(a) + py * math.cos(a))) for px, py in pts]


def lens(c, name, cx, cy, r, content, bg=("#0A1A30", "#02060E"), metal=None):
    """Un oculaire : un bouclier rond de métal clair devenu lentille, qui montre l'infime."""
    metal = metal or SILVER
    cid = c.id(name + "-c")
    c.def_once(name + "-c", f'<clipPath id="{cid}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}"/></clipPath>')
    g = c.rgrad(name + "-bg", [(0, bg[0], 1), (1, bg[1], 1)])
    glass = c.rgrad(name + "-gl", [(0, "#FFFFFF", 0.0), (0.8, "#FFFFFF", 0.0), (1, "#CFEFFF", 0.35)], 0.5, 0.5, 0.5)
    mg = metal_grad(c, name + "-m", metal)
    studs = "".join(f'<circle cx="{f(pt(cx, cy, r + 7, k * 30)[0])}" cy="{f(pt(cx, cy, r + 7, k * 30)[1])}" r="1.7" fill="{metal[0]}"/>' for k in range(12))
    return (f'<g filter="{c.shadow(name + "-sh", 0, 6, 8, "#000000", 0.6)}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r + 9)}" fill="{mg}"/></g>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/>'
            f'<g clip-path="url(#{cid})">{content}</g>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{glass}"/>'
            f'<path d="M{f(cx - r * 0.7)} {f(cy - r * 0.35)} A{f(r * 0.8)} {f(r * 0.8)} 0 0 1 {f(cx - r * 0.2)} {f(cy - r * 0.78)}" fill="none" stroke="#FFFFFF" stroke-width="2.4" opacity="0.6" stroke-linecap="round"/>'
            f'<g filter="{bevel(c, name + "-bv", 0.8, 2.2, shadow=False)}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r + 4.5)}" fill="none" stroke="{mg}" stroke-width="9"/></g>{studs}')


# =============================================================== A — le flocon-monde

def orcA():
    c = start("cA", "#1E2C44", "#060A14", "#DFF4FF", 0.2)
    win = "M80 352 L148 280 L392 280 L460 352 L460 716 Q460 732 444 732 L96 732 Q80 732 80 716 Z"
    m = deco_mask(c, win)
    d = [sky(c, "sky", [(0, "#010310"), (0.35, "#061630"), (0.7, "#0C2A4C"), (1, "#081A30")])]
    d.append(star_field(61, 380, keep=KEEP))
    d.append(nebula(c, "nb1", 120, 120, 140, 90, "#4FA6D6", "#2A3C8C", 0.55, seed=4))
    d.append(nebula(c, "nb2", 440, 220, 120, 80, "#B07CFF", "#3A2A7A", 0.45, seed=9))
    d.append(constellation(c, at(DIPPER, 360, 64, 1.05, 8), DIPPER_EDGES, "#DDF2FF", 0.45, 1.5, big=(0,)))
    d.append(cstar(c, 64, 64, 2.6, "#FFFFFF", "#BFE6FF", name="polaris"))
    d.append(constellation(c, at(CASSIOPEIA, 30, 214, 0.9, -20), CASS_EDGES, "#DDF2FF", 0.4, 1.3))
    d.append(moon(c, "mn", 474, 300, 16, glow=3.5, phase=0.55))
    d.append(f'<circle cx="270" cy="150" r="190" fill="{c.rgrad("flglow", [(0, "#BFE8FF", 0.45), (0.5, "#4FA6D6", 0.12), (1, "#4FA6D6", 0)])}"/>')
    d.append(f'<g filter="{ublur(c, "flb", 5)}" opacity="0.85">{dendrite(270, 150, 132, "#9FE8FF", 5, 3)}</g>')
    d.append(dendrite(270, 150, 132, "#F4FBFF", 2.4, 3))
    d.append(hex_geometry(270, 150, 26, "#DDF2FF", 0.7, 0.35, 2, 30))
    rnd = random.Random(5)
    for _ in range(14):
        x, y = rnd.choice([(rnd.uniform(20, 70), rnd.uniform(360, 700)), (rnd.uniform(470, 520), rnd.uniform(360, 700))])
        d.append(plate_crystal(x, y, rnd.uniform(5, 11), "#E8F7FF", rnd.uniform(0, 60), 0.75))
    d.append(curtains(c, "au1", 330, 170, amp=26, waves=1.2, phase=0.6, fold=30, seed=44, op=(0.08, 0.34)))
    d.append(mountains(c, "mt", [(-20, 760), (60, 700), (130, 740), (200, 716), (270, 744), (340, 712), (420, 736), (480, 694), (560, 730)], 820, seed=17,
                       fill=("#3A6090", "#16304E"), snow_depth=30))
    d.append(water(c, "lake", 800, 960, "#16406A", "#061426", "#BFE6FF", seed=9, glint_n=70))
    d.append(reflect(dendrite(270, 150, 132, "#9FE8FF", 2.4, 3), 800, 0.3, "lrb", c, 2, 0.6))
    d.append(forest(41, -10, 130, 812, 34, 80, 6, "#03101C", "#DDEEFF", 0.75))
    d.append(forest(42, 410, 560, 812, 34, 80, 6, "#03101C", "#DDEEFF", 0.75))
    c.add(f'<g mask="{m}">{"".join(d)}</g>')
    c.add(grade(c, win, "#9FE8FF", 0.5, 0.0, 0.2, "gr"))
    c.add(inner_shadow(c, win, 30, 12, 0.6))
    c.add(gold_rim(c, win, SILVER, 5))
    lattice = ice_lattice(c, "il", 74, 640, 64, 13, 0)
    c.add(lens(c, "l1", 74, 640, 48, lattice + f'<rect x="20" y="590" width="110" height="110" fill="{c.rgrad("l1v", [(0.6, "#000000", 0), (1, "#000000", 0.5)])}"/>'))
    flake = f'<g filter="{ublur(c, "l2b", 2)}" opacity="0.7">{dendrite(466, 600, 40, "#9FE8FF", 3, 3)}</g>' + dendrite(466, 600, 40, "#FFFFFF", 1.2, 3)
    c.add(lens(c, "l2", 466, 600, 48, flake))
    c.add(outer_frame(c, SILVER, 12, 3.5))
    crest_block(c, 270, 150, 0.84, "silver", None)
    birds(c, [("meo-selfie", 424, 694, 160, True, 0)])
    inscription(c, "Oracle", None, y=772, style="glace", metal=SILVER, panel=("#0E2640", "#040A16"), kicker=kicker(), title_size=44)
    save(c, "oracle-a", "Oracle", None, "A", "Le Flocon-monde",
         "Le ciel boréal s'ouvre - l'étoile polaire, le Grand Chariot, Cassiopée, une lune en croissant - et un flocon dendritique géant s'y déploie derrière le blason. "
         "Deux boucliers ronds deviennent des oculaires : l'un montre la maille hexagonale des molécules d'eau qui donne au flocon ses six branches, "
         "l'autre un cristal de neige, au-dessus d'une crête de glace.",
         "selfie : Meo (selfie) dans la photo", None)


# =============================================================== B — la roue du ciel

def orcB():
    c = start("cB", "#1C2A40", "#060A14", "#D8ECFF", 0.2)
    win = arch(78, 462, 392, 276, 730)
    m = deco_mask(c, win)
    d = [sky(c, "sky", [(0, "#02030C"), (0.4, "#08122A"), (0.75, "#10244A"), (1, "#0A1630")])]
    d.append(star_field(71, 200, keep=KEEP))
    d.append(star_trails(c, "st", 270, 148, 30, 560, 520, -180, 180, seed=5))
    d.append(f'<circle cx="270" cy="148" r="260" fill="{c.rgrad("pglow", [(0, "#BFE6FF", 0.35), (1, "#BFE6FF", 0)])}"/>')
    d.append(curtains(c, "au1", 420, 220, amp=40, waves=0.9, phase=2.0, fold=40, seed=33, op=(0.08, 0.4)))
    d.append(f'<path d="M-20 790 C70 740 150 728 230 748 C300 766 380 726 470 720 C520 716 545 730 560 740 L560 960 L-20 960 Z" fill="{c.grad("hill", [(0, "#DFF4FF"), (1, "#5F88B0")])}"/>')
    d.append(standing_stone(c, "ss1", 470, 744, 34, 82, seed=3, runes_color="#BFE6FF", tilt=4))
    d.append(standing_stone(c, "ss2", 64, 772, 30, 70, seed=6, runes_color="#BFE6FF", tilt=-5))
    c.add(f'<g mask="{m}">{"".join(d)}</g>')
    c.add(grade(c, win, "#BFE6FF", 0.5, 0.0, 0.18, "gr"))
    c.add(inner_shadow(c, win, 30, 12, 0.6))
    c.add(gold_rim(c, win, SILVER, 5))
    c.add(f'<circle cx="270" cy="148" r="112" fill="none" stroke="{silver(c, "rr")}" stroke-width="1.4" opacity="0.8"/>')
    c.add(rune_ring(31, 270, 148, 98, 12, "#DDF2FF", 1.3))
    c.add(f'<circle cx="270" cy="148" r="84" fill="none" stroke="{silver(c, "rr")}" stroke-width="1" opacity="0.6"/>')
    c.add(hex_geometry(270, 148, 28, "#BFE6FF", 0.6, 0.3, 1, 0))
    for x, y, r, rot in ((48, 330, 22, 10), (494, 360, 18, 30), (40, 520, 14, 0), (500, 560, 20, 15)):
        c.add(f'<g filter="{ublur(c, "pcb", 2.5)}" opacity="0.6">{plate_crystal(x, y, r, "#9FE8FF", rot, 1, 2)}</g>' + plate_crystal(x, y, r, "#F4FBFF", rot, 0.95, 1))
        c.add(dendrite(x, y, r * 0.55, "#FFFFFF", 0.8, 1, 0.9, rot=rot))
    c.add(outer_frame(c, SILVER, 12, 3.5))
    crest_block(c, 270, 144, 0.8, "silver", None, glow="#DDF2FF", glow_r=70)
    birds(c, [("mee-amoureuse", 94, 712, 138, False, -6), ("meo-love", 446, 712, 138, True, 6)])
    inscription(c, "Oracle", "Sous la même étoile", y=780, style="nuit", metal=SILVER, panel=("#0C1830", "#03060E"), kicker=kicker(), title_size=44)
    save(c, "oracle-b", "Oracle", None, "B", "La Roue du ciel",
         "Une pose longue sous le ciel du Nord : toutes les étoiles tournent autour de l'étoile polaire, et c'est le blason qui en tient la place, "
         "cerclé d'une roue de runes et d'une rosace de glace. Aux bords de la photo, des cristaux de neige en plaquettes hexagonales "
         "révèlent l'infime ; sur la colline, deux pierres levées gravées regardent tourner le ciel.",
         "pied : Mee (amoureuse) et Meo (love) dans la neige", "Sous la même étoile")


# =============================================================== C — la graine du frêne

def tree_constellation(c, name, seed, cx, cy, color="#DDF2FF"):
    """La couronne d'Yggdrasil tracée en constellation : des branches d'étoiles autour du blason."""
    rnd = random.Random(seed)
    nodes, edges = [], []

    def branch(x, y, ang, length, depth, parent):
        x2, y2 = pt(x, y, length, ang)
        nodes.append((x2, y2))
        i = len(nodes) - 1
        edges.append((parent, i))
        if depth == 0:
            return
        for s in (-1, 1):
            branch(x2, y2, ang + s * rnd.uniform(18, 34), length * rnd.uniform(0.62, 0.8), depth - 1, i)

    nodes.append((cx, cy + 120))
    nodes.append((cx, cy + 40))
    edges.append((0, 1))
    for a in (-62, -28, 28, 62):
        branch(cx, cy + 40, a, 82, 3, 1)
    big = tuple(i for i in range(len(nodes)) if rnd.random() < 0.07)
    return constellation(c, nodes, edges, color, 0.45, 1.3, big=big, name=name), nodes


def orcC():
    c = start("cC", "#232A3E", "#080A14", "#E8F0FF", 0.2)
    win = oval(270, 500, 188, 228)
    m = deco_mask(c, win)
    d = [sky(c, "sky", [(0, "#03030E"), (0.4, "#0C1030"), (0.8, "#141C44"), (1, "#0A0E24")])]
    d.append(milky_way(c, "mw", [(-40, 620), (140, 300), (380, 120), (580, 20)], 70, seed=8, keep=KEEP, op=0.85))
    d.append(star_field(81, 260, keep=KEEP))
    tc, nodes = tree_constellation(c, "tc", 6, 270, 150)
    d.append(tc)
    d.append(moon(c, "mn", 70, 92, 20, glow=3.6, phase=0.5))
    rnd = random.Random(12)
    for _ in range(16):
        side = rnd.choice((-1, 1))
        x = 270 + side * rnd.uniform(205, 250)
        y = rnd.uniform(300, 730)
        d.append(samara(c, x, y, rnd.uniform(0.5, 0.85), rnd.uniform(0, 360), op=rnd.uniform(0.7, 1)))
    d.append(sky(c, "snow", [(0, "#DFF4FF"), (1, "#7FA8CC")], 760, 960))
    d.append(forest(19, -10, 140, 778, 40, 100, 7, "#050C18", "#DDEEFF", 0.75))
    d.append(forest(29, 400, 560, 778, 40, 100, 7, "#050C18", "#DDEEFF", 0.75))
    c.add(f'<g mask="{m}">{"".join(d)}</g>')
    c.add(grade(c, win, "#BFD8FF", 0.5, 0.0, 0.2, "gr"))
    c.add(inner_shadow(c, win, 30, 12, 0.6))
    c.add(gold_rim(c, win, SILVER, 5))
    c.add(f'<path d="{oval(270, 500, 198, 238)}" fill="none" stroke="{SILVER[1]}" stroke-width="1" opacity="0.6" stroke-dasharray="1 6" stroke-linecap="round"/>')
    pol = pollen(c, "po", 84, 650, 30) + "".join(pollen(c, f"po{k}", 84 + dx, 650 + dy, 9, seed=k) for k, (dx, dy) in enumerate(((-30, -26), (32, 28))))
    c.add(lens(c, "l1", 84, 650, 50, pol, bg=("#2A2410", "#0A0804")))
    c.add(lens(c, "l2", 456, 650, 50, cell(c, "ce", 456, 650, 40, seed=4, membrane="#7CFFB8", plasm="#1A6B4A", nucleus_c="#B07CFF"), bg=("#0A2418", "#020A06")))
    c.add(outer_frame(c, SILVER, 12, 3.5))
    crest_block(c, 270, 150, 0.84, "silver", None, glow="#DDF2FF", glow_r=70)
    birds(c, [("mee-montee-au-ciel", 92, 300, 120, False, -4), ("meo-feu-artifice", 450, 300, 120, True, 4)])
    inscription(c, "Oracle", None, y=772, style="pierre", metal=SILVER, panel=("#2A3240", "#10141C"), kicker=kicker(), title_size=44)
    save(c, "oracle-c", "Oracle", None, "C", "La Graine du frêne",
         "La couronne d'Yggdrasil est tracée en constellation autour du blason, sous la Voie lactée et une lune en croissant ; "
         "ses samares - les graines ailées du frêne - tournoient le long de la photo. Deux oculaires d'argent montrent ce que l'arbre cache : "
         "un grain de pollen de frêne et sa paroi réticulée, et une cellule vivante avec son noyau.",
         "perches : Mee (montée au ciel) et Meo (feu d'artifice) dans les étoiles", None)


ALL = [orcA, orcB, orcC]
