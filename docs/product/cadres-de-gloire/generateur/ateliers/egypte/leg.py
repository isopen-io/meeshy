"""Égypte solaire - Légende V à I : l'immense et l'infime tissés ensemble, de plus en plus loin dans les deux sens."""

import math
import random

from kit import *  # noqa: F401,F403
from motifs import *  # noqa: F401,F403
from scene import *  # noqa: F401,F403
from archi import *  # noqa: F401,F403
from cosmos import *  # noqa: F401,F403
from afrique import agrad, behedety_wing  # noqa: F401
from ciel import *  # noqa: F401,F403
from motifs import _poly  # noqa: F401

RANK = "Légende"
GEM = "#B98CFF"
PANEL = ("#140A2E", "#05030F")


def legende_crest(c, cx, cy, s, division):
    c.add(gem_backing(c, cx, cy, s, "#05030F", 0.8))
    crest(c, cx, cy, s, "obsidian", division=division, gem=GEM, ink=GOLD_HI, edge=GOLD)


def space(card, name, top="#03040F", mid="#0A0A2A", bot="#0A0418"):
    return f'<rect width="{W}" height="{H}" fill="{card.grad(name, [(0, top), (0.5, mid), (1, bot)])}"/>'


def orion_nebula(c, name, cx, cy, s=1.0):
    out = [nebula_cloud(c, name + "w", cx + 10 * s, cy - 10 * s, 260 * s, 200 * s, "#7A2AA8", "#1A1A6A", 0.65, seed=2, rot=-25),
           nebula_cloud(c, name + "a", cx, cy, 190 * s, 150 * s, "#FF4A7A", "#8A2AA8", 0.95, seed=3, rot=-20),
           nebula_cloud(c, name + "b", cx - 30 * s, cy - 28 * s, 130 * s, 100 * s, "#6FE0D8", "#1A4A8A", 0.7, seed=8, rot=10),
           nebula_cloud(c, name + "c", cx + 20 * s, cy + 20 * s, 80 * s, 60 * s, "#FFF0C8", "#FF7A6A", 0.95, seed=15)]
    for i, (x, y) in enumerate(((-4, 12), (2, 20), (8, 16), (0, 26))):
        out.append(bright_star(c, f"{name}t{i}", cx + 16 * s + x * s, cy + y * s, 3.6, "#FFFFFF", 0.5))
    return "".join(out)


# =============================================================== V - Les Étoiles de Sah

def leg5():
    c = start("l5", "#2A2238", "#0A0812", "#D8C2FF", 0.2)
    win = rrect(94, 298, 446, 736, 18)
    d = [space(c, "bg")]
    d.append(star_field(11, 700, (0, 0, W, H), "#FFFFFF", 1.3, tint=("#FFE9C0", "#BFD8FF", "#FFC0D8")))
    d.append(orion_nebula(c, "m42", 136, 210))
    d.append(nebula_cloud(c, "rnb", 440, 190, 160, 130, "#3A6AFF", "#1A1A5A", 0.55, seed=19))
    d.append(shape_constellation("sah", 128, 150, 1.25, "#FFF2D8", r=2.1, line_op=0.6, glow_color="#FFE9C0"))
    d.append(bright_star(c, "bet", 128 - 22 * 1.25, 150 - 46 * 1.25, 7, "#FFB070", 0.8))
    d.append(bright_star(c, "rig", 128 + 28 * 1.25, 150 + 40 * 1.25, 7, "#BFD8FF", 0.8))
    d.append(bright_star(c, "sir", 412, 86, 15, "#CFE8FF"))
    d.append(elliptical_galaxy(c, "eg1", 470, 250, 16, 0.4, 30, "#FFE6C0"))
    d.append(f'<rect x="0" y="292" width="{W}" height="10" fill="#07040F"/>')
    d.append(giza_group(c, "gz", 64, 294, 0.5, "right", lit=("#6A5A9A", "#3E2E6A"), dark=("#1A1230", "#0C0818"), cap="#FFE2B0"))
    d.append(giza_group(c, "gz2", 486, 294, 0.42, "left", flip=True, lit=("#6A5A9A", "#3E2E6A"), dark=("#1A1230", "#0C0818"), cap="#BFD8FF"))
    d.append(f'<rect x="0" y="292" width="{W}" height="1.2" fill="#C8A8FF" opacity="0.6"/>')
    for side in (-1, 1):
        x0 = 30 if side < 0 else 470
        c.def_once(f"pil{side}", f'<clipPath id="l5-pil{side}"><rect x="{x0}" y="352" width="40" height="384" rx="20"/></clipPath>')
        d.append(f'<rect x="{x0}" y="352" width="40" height="384" rx="20" fill="#04100A"/>')
        d.append(f'<g clip-path="url(#l5-pil{side})" opacity="0.85">{plant_cells(c, f"pc{side}", x0 - 10, 344, x0 + 50, 744, 11, "#B8F0A0", "#0E3422", seed=4 + side)}</g>')
        d.append(f'<rect x="{x0}" y="352" width="40" height="384" rx="20" fill="{agrad(c, f"pilv{side}", [(0, "#000000", 0.7), (0.5, "#000000", 0), (1, "#000000", 0.7)], 0, 0, 1, 0)}"/>')
        d.append(f'<rect x="{x0}" y="352" width="40" height="384" rx="20" fill="none" stroke="{GOLD}" stroke-width="1.8"/>')
        d.append(papyrus_capital(c, f"cap{side}", x0 + 20, 314, 54, 36))
    d.append(f'<rect x="0" y="896" width="{W}" height="70" fill="{c.grad("nile", [(0, "#140A30"), (1, "#04020A")])}"/>')
    rnd = random.Random(4)
    d.append("".join(f'<rect x="{f(rnd.gauss(150, 70))}" y="{f(rnd.uniform(900, 950))}" width="{f(rnd.uniform(4, 14))}" height="1.2" fill="#FFC8E0" opacity="{f(rnd.uniform(0.3, 0.8))}"/>' for _ in range(40)))
    d.append("".join(f'<rect x="{f(rnd.gauss(412, 30))}" y="{f(rnd.uniform(900, 950))}" width="{f(rnd.uniform(4, 10))}" height="1.2" fill="#CFE8FF" opacity="{f(rnd.uniform(0.3, 0.9))}"/>' for _ in range(24)))
    decorate(c, win, d)
    finish_window(c, win, "#C8A8FF", 0.3, 0.0, 0.26, GOLD3, 4)
    c.add(f'<circle cx="474" cy="218" r="66" fill="{c.rgrad("clg", [(0, "#7FE0C8", 0.35), (1, "#7FE0C8", 0)])}"/>')
    c.add(cell(c, "cl", 474, 218, 44, seed=7))
    c.add(outer_frame(c))
    legende_crest(c, 270, 132, 0.9, 5)
    birds(c, [("mee-sourire", 102, 704, 132, False, -6), ("meo-salut", 438, 704, 132, True, 6)])
    inscription(c, KICK, "Légende V", y=774, style="nuit", panel=PANEL)
    save(c, "legende-5", RANK, 5, "V", "Les Étoiles de Sah",
         "Sah, l'Orion des Égyptiens, l'étoile d'Osiris, se lève au-dessus de Gizeh, son épée noyée dans la grande nébuleuse ; à droite brille "
         "Sopdet (Sirius), qui annonçait la crue du Nil. Le ciel s'ouvre à mille années-lumière, et le regard plonge aussi vers l'infime : "
         "les montants du cadre sont tissés des cellules du papyrus, et une cellule vivante dérive comme une planète.",
         "pied (Mee sourire, Meo salut)", None)


# =============================================================== IV - Le Souffle de vie

def leg4():
    c = start("l4", "#2A2238", "#0A0812", "#D8C2FF", 0.2)
    win = arch(104, 436, 404, 304, 736)
    d = [space(c, "bg", "#04030E", "#0C0A2E", "#0A0418")]
    d.append(star_field(13, 700, (0, 0, W, H), "#FFFFFF", 1.3, tint=("#FFE9C0", "#BFD8FF")))
    d.append(nebula_cloud(c, "nb1", 380, 160, 220, 160, "#FF5AA8", "#4A1A8A", 0.55, seed=4, rot=-30))
    d.append(nebula_cloud(c, "nb2", 120, 520, 160, 260, "#5A6AFF", "#1A1A6A", 0.5, seed=6))
    d.append(milky_way(c, "mw", (-60, -20), (250, 330), (600, 980), 110, seed=41, n=2600))
    d.append(spiral_galaxy(c, "and", 452, 96, 64, tilt=0.36, rot=-0.5, seed=12, n=700))
    d.append(f'<circle cx="96" cy="128" r="80" fill="{c.rgrad("ankhglow", [(0, "#FFE9B0", 0.3), (1, "#FFE9B0", 0)])}"/>')
    d.append(shape_constellation("ankh", 96, 128, 1.25, "#FFF2D0", r=2.2, line_op=0.75, glow_color="#FFE9C0"))
    d.append(dust(2, 80, (0, 0, W, 300), "#FFE9C0", 0.6, 1.0))
    decorate(c, win, d)
    finish_window(c, win, "#C8A8FF", 0.5, 0.0, 0.26, GOLD3, 4)
    for side in (-1, 1):
        x = 270 + side * 214
        c.add(f'<rect x="{x - 24}" y="262" width="48" height="500" rx="6" fill="#05040F" opacity="0.55"/>')
        c.add(dna_helix(c, f"dna{side}", x, 290, 752, 17, 92, GOLD3, ((LAPIS_L, LAPIS, LAPIS_D)), w=3.6))
        c.add(papyrus_capital(c, f"cap{side}", x, 236, 68, 46))
        c.add(f'<rect x="{x - 30}" y="752" width="60" height="12" rx="3" fill="{c.grad("base", [(0, GOLD_HI), (1, GOLD_LO)])}"/>')
        for k in range(4):
            c.add(f'<circle cx="{x + side * -2}" cy="{f(320 + k * 120)}" r="1.4" fill="#FFFFFF"/>')
    c.add(f'<circle cx="270" cy="134" r="92" fill="{c.rgrad("ag", [(0, "#FFE9B0", 0.55), (0.5, "#FFB0E0", 0.15), (1, "#FFB0E0", 0)])}"/>')
    c.add(outer_frame(c))
    legende_crest(c, 270, 120, 0.82, 4)
    birds(c, [("mee-amoureuse", 108, 704, 132, False, -6), ("meo-love", 432, 704, 132, True, 6)])
    inscription(c, KICK, "Légende IV", "Pour toi, maman", y=774, style="nuit", panel=PANEL)
    save(c, "legende-4", RANK, 4, "IV", "Le Souffle de vie",
         "La Voie lactée traverse le cadre en diagonale, le corps de Nout vu de l'intérieur, et la galaxie d'Andromède brille au loin ; "
         "l'ankh, la clé de vie, s'allume en constellation. Les deux colonnes papyriformes qui portent le ciel ont pour fût une double hélice "
         "d'ADN d'or et de lapis : la vie, de la galaxie jusqu'à la molécule qui la transmet.",
         "pied (Mee amoureuse, Meo love)", "Pour toi, maman")


# =============================================================== III - Le Scarabée de la supernova

def leg3():
    c = start("l3", "#2A2238", "#0A0812", "#D8C2FF", 0.2)
    win = rrect(96, 330, 444, 736, 22)
    d = [space(c, "bg", "#05030E", "#120A30", "#0A0418")]
    d.append(star_field(17, 700, (0, 0, W, H), "#FFFFFF", 1.3, tint=("#FFE9C0", "#FFC8A0")))
    d.append(nebula_cloud(c, "nb1", 270, 160, 300, 220, "#FF6A3D", "#3A1A7A", 0.55, seed=26))
    d.append(nebula_cloud(c, "nb2", 90, 640, 140, 260, "#3A8AFF", "#1A1A5A", 0.45, seed=27))
    d.append(nebula_cloud(c, "nb3", 460, 640, 140, 260, "#B04AFF", "#2A1A5A", 0.45, seed=29))
    d.append(spiral_galaxy(c, "g1", 74, 70, 46, tilt=0.5, rot=0.6, seed=3, n=420))
    d.append(spiral_galaxy(c, "g2", 470, 300, 40, tilt=0.4, rot=-0.4, seed=5, n=380, arm="#FFD0B0", pink="#FF9A6A"))
    d.append(supernova(c, "sn", 270, 150, 112, seed=31))
    for side in (-1, 1):
        x = 270 + side * 220
        d.append(f'<g filter="{c.blur("nglow", 3)}" opacity="0.7">{neuron(8 + side, x, 300, 1.05, "#9FD8FF" if side < 0 else "#D0A8FF", None, axon_dir=180, axon_len=320, depth=5)}</g>')
        d.append(neuron(8 + side, x, 300, 1.05, "#E0F2FF" if side < 0 else "#EEDCFF", None, axon_dir=180, axon_len=320, depth=5))
    for i, (x, y, s, r) in enumerate(((40, 470, 0.9, 20), (500, 520, 0.8, -30), (60, 230, 0.7, 60), (482, 420, 0.7, 10), (30, 600, 0.6, -40))):
        d.append(water_molecule(x, y, s, r))
    d.append(benzene(496, 610, 12, GOLD_HI, 1.4, 0.8))
    d.append(benzene(44, 380, 10, GOLD_HI, 1.2, 0.7, 30))
    decorate(c, win, d)
    finish_window(c, win, "#FFB890", 0.5, 0.0, 0.26, GOLD3, 4)
    c.add(f'<g filter="{c.shadow("scs", 0, 6, 8, "#000000", 0.55)}">{scarab(c, "sc", 270, 300, 1.12, legs=True)}</g>')
    c.add(outer_frame(c))
    legende_crest(c, 270, 142, 0.86, 3)
    birds(c, [("mee-bravo", 104, 704, 132, False, -6), ("meo-muscles", 436, 704, 132, True, 6)])
    inscription(c, KICK, "Légende III", "Le voyage continue", y=774, style="nuit", panel=PANEL)
    save(c, "legende-3", RANK, 3, "III", "Le Scarabée de la supernova",
         "Khépri ne pousse plus le soleil du matin mais une étoile qui explose : le blason naît au cœur d'une supernova, d'où sortent l'or et "
         "le fer de nos corps, entre deux galaxies spirales. Le long de la photo, deux neurones s'allument comme des arbres de lumière, et des "
         "molécules d'eau et des cycles d'atomes dérivent : l'étoile morte et la pensée vivante sont faites de la même matière.",
         "pied (Mee bravo, Meo muscles)", "Le voyage continue")


# =============================================================== II - L'Horizon noir

def leg2():
    c = start("l2", "#2A2238", "#0A0812", "#D8C2FF", 0.2)
    win = pyramid_win(96, 444, 372, 300, 736, 14)
    d = [space(c, "bg", "#02020A", "#0A0822", "#0A0418")]
    d.append(star_field(19, 760, (0, 0, W, H), "#FFFFFF", 1.3, tint=("#FFE9C0", "#BFD8FF")))
    d.append(nebula_cloud(c, "nb1", 270, 150, 320, 160, "#FF8A3D", "#4A1A6A", 0.4, seed=33))
    d.append(galaxy_cluster(c, "gc1", 70, 80, 58, n=14, seed=4))
    d.append(galaxy_cluster(c, "gc2", 474, 84, 54, n=12, seed=8))
    d.append(deep_field(c, "df", (0, 0, W, 300), 70, seed=3, keep=(150, 60, 390, 250), op=0.8))
    for side in (-1, 1):
        x = 270 + side * 222
        for k, (y, r, rot) in enumerate(((420, 46, 0), (590, 40, 30))):
            d.append(f'<path d="M{x} {y + r + 4} C{x + side * 6} {y + r + 60} {x - side * 4} {y + r + 90} {x} 760" fill="none" stroke="#3FB68B" stroke-width="2.4" opacity="0.8"/>')
            d.append(orbital_lobes(c, f"ol{side}{k}", x, y, r * 1.15, ("#5FB8FF", "#B98CFF")[k], 3, rot, 0.85))
            d.append(atom(c, f"at{side}{k}", x, y, r, 3, 0.32, "#BFE8FF", "#FFFFFF", rot0=rot + 15, w=1.0, op=0.85))
    for k in range(5):
        y = 752 + k * 10
        d.append(wave_packet(14, 526, y, 7 - k, 22 + k * 2, 140, ("#7FD8FF", "#B9A8FF", "#FFE9B0", "#7FD8FF", "#B9A8FF")[k], 1.3, 0.75, k * 1.3, 270))
    d.append(f'<rect x="0" y="880" width="{W}" height="80" fill="{c.grad("noun", [(0, "#080A24"), (1, "#020208")])}"/>')
    for k in range(4):
        d.append(wave_packet(0, 540, 906 + k * 12, 5, 18, 220, ("#7FD8FF", "#B9A8FF")[k % 2], 1.2, 0.6, k, 270))
    decorate(c, win, d)
    finish_window(c, win, "#FFB890", 0.5, 0.0, 0.26, GOLD3, 4)
    lap = c.rgrad("gl", [(0, LAPIS_L, 1), (0.5, LAPIS, 1), (1, LAPIS_D, 1)], 0.35, 0.3, 0.8)
    tur = c.rgrad("gt", [(0, TURQ_L, 1), (0.5, TURQ, 1), (1, TURQ_D, 1)], 0.35, 0.3, 0.8)
    car = c.rgrad("gc", [(0, "#FFB08A", 1), (0.5, CARN, 1), (1, CARN_D, 1)], 0.35, 0.3, 0.8)
    gld = c.rgrad("gg", [(0, GOLD_HI, 1), (0.5, GOLD, 1), (1, GOLD_LO, 1)], 0.35, 0.3, 0.8)
    wings = (behedety_wing(c, "wr", 270, 150, 1, 60, 266, 66, [lap, tur, car, lap], (car, tur, lap, gld), rise=14)
             + behedety_wing(c, "wl", 270, 150, -1, 60, 266, 66, [lap, tur, car, lap], (car, tur, lap, gld), rise=14))
    c.add(f'<g filter="{c.shadow("wsh", 0, 5, 6, "#000000", 0.55)}"><g filter="{bevel(c, "wbv", 0.8, 1.6, sd=3, dy=3)}">{wings}</g></g>')
    c.add(black_hole(c, "bh", 270, 148, 58, tilt=0.2, disk=3.0))
    c.add(outer_frame(c))
    legende_crest(c, 270, 144, 0.74, 2)
    birds(c, [("mee-courage", 102, 700, 132, False, -6), ("meo-yo", 438, 704, 132, True, 6)])
    inscription(c, KICK, "Légende II", y=774, style="nuit", panel=PANEL)
    save(c, "legende-2", RANK, 2, "II", "L'Horizon noir",
         "Le disque ailé d'Edfou est devenu un trou noir : ses ailes d'or, de lapis et de cornaline prolongent le disque d'accrétion, et le blason "
         "se tient au bord de l'horizon des événements, entre deux amas de galaxies aux arcs de lumière. Le long de la photo, des atomes ouvrent "
         "leurs orbitales comme des lotus sur leur tige, et au pied du cadre les eaux du Noun sont devenues des ondes quantiques.",
         "pied (Mee courage, Meo yo)", None)


# =============================================================== I - La Pyramide infinie

def earth(c, name, cx, cy, r):
    g = c.rgrad(name, [(0, "#9FD8FF", 1), (0.6, "#2A6ACA", 1), (1, "#0A1A4A", 1)], 0.38, 0.32, 0.75)
    return (f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/>'
            f'<path d="M{f(cx - r * 0.1)} {f(cy - r * 0.62)} C{f(cx + r * 0.3)} {f(cy - r * 0.6)} {f(cx + r * 0.36)} {f(cy - r * 0.2)} {f(cx + r * 0.3)} {f(cy + r * 0.05)} '
            f'C{f(cx + r * 0.2)} {f(cy + r * 0.3)} {f(cx + r * 0.1)} {f(cy + r * 0.62)} {f(cx)} {f(cy + r * 0.66)} C{f(cx - r * 0.12)} {f(cy + r * 0.3)} {f(cx - r * 0.16)} {f(cy + r * 0.1)} '
            f'{f(cx - r * 0.36)} {f(cy - r * 0.02)} C{f(cx - r * 0.48)} {f(cy - r * 0.2)} {f(cx - r * 0.36)} {f(cy - r * 0.5)} {f(cx - r * 0.1)} {f(cy - r * 0.62)} Z" fill="#D8B868" opacity="0.92"/>'
            f'<path d="M{f(cx - r * 0.02)} {f(cy - r * 0.6)} L{f(cx + r * 0.04)} {f(cy - r * 0.2)}" stroke="#2A8A9A" stroke-width="1" opacity="0.9"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="#9FD8FF" stroke-width="1.4" opacity="0.6"/>')


def leg1():
    c = start("l1", "#2A2238", "#0A0812", "#D8C2FF", 0.2)
    win = pyramid_win(100, 440, 400, 318, 736, 14)
    d = [space(c, "bg", "#02020A", "#08061E", "#0A0418")]
    d.append(deep_field(c, "df", (0, 0, W, H), 260, seed=9, op=0.9))
    d.append(star_field(23, 600, (0, 0, W, H), "#FFFFFF", 1.2, tint=("#FFE9C0", "#BFD8FF")))
    d.append(cosmic_web(c, "cw", (0, 0, W, 330), seed=5, n=26, k=3, color="#C9B8FF", op=0.55))
    d.append(nebula_cloud(c, "nb1", 270, 200, 300, 200, "#7A4AFF", "#1A1A6A", 0.45, seed=37))
    pyr = sierpinski(270, 400, 470, 5, [GOLD_HI, GOLD, "#FFD9A0"], outline=GOLD, op=0.42)
    d.append(f'<g filter="{c.glow(6)}" opacity="0.7">{pyr}</g>{pyr}')
    d.append(spiral_galaxy(c, "pg", 270, 238, 46, tilt=0.4, rot=0.2, seed=17, n=380))
    d.append(wedjat_spiral(150, 760, 240, 150, 8, GOLD, 0.8, 0.25))
    decorate(c, win, d)
    finish_window(c, win, "#C8A8FF", 0.5, 0.0, 0.26, GOLD3, 4)
    up = [("10⁷ m", lambda n, x, y: earth(c, n, x, y, 16)),
          ("10⁹ m", lambda n, x, y: sun_disk(c, n, x, y, 13, glow=0.7)),
          ("10²¹ m", lambda n, x, y: spiral_galaxy(c, n, x, y, 22, tilt=0.5, rot=0.4, seed=3, n=260)),
          ("10²³ m", lambda n, x, y: galaxy_cluster(c, n, x, y, 20, n=10, seed=6)),
          ("10²⁶ m", lambda n, x, y: cosmic_web(c, n, (x - 26, y - 26, x + 26, y + 26), seed=2, n=12, k=3, op=0.95))]
    down = [("10⁻⁵ m", lambda n, x, y: cell(c, n, x, y, 19, seed=3)),
            ("10⁻⁹ m", lambda n, x, y: dna_helix(c, n, x, y - 26, y + 26, 9, 34, GOLD3, w=2.2)),
            ("10⁻¹⁰ m", lambda n, x, y: atom(c, n, x, y, 18, 3, 0.32, "#BFE8FF", w=0.9)),
            ("10⁻¹⁴ m", lambda n, x, y: nucleus_ball(c, n, x, y, 14, 9)),
            ("10⁻¹⁸ m", lambda n, x, y: proton_quarks(c, n, x, y, 20))]
    ys = [606, 528, 450, 372, 294]
    for side, chain in ((-1, up), (1, down)):
        x = 270 + side * 226
        c.add(f'<line x1="{x}" y1="{ys[-1]}" x2="{x}" y2="{ys[0]}" stroke="{GOLD}" stroke-width="1.4" opacity="0.7"/>')
        order = list(zip(ys, chain)) if side < 0 else list(zip(reversed(ys), chain))
        for k, (y, (label, fn)) in enumerate(order):
            c.add(pow10_lens(c, f"p{side}{k}", x, y, 24, fn(f"in{side}{k}", x, y), label))
    c.add(f'<text x="270" y="300" text-anchor="middle" font-family="{SANS}" font-weight="700" font-size="9.5" letter-spacing="0.6" fill="#FFE9C0" opacity="0.9">10⁰ m</text>')
    c.add(outer_frame(c))
    legende_crest(c, 270, 120, 0.86, 1)
    birds(c, [("mee-jackpot", 104, 706, 128, False, -6), ("meo-champagne", 436, 706, 128, True, 6)])
    inscription(c, KICK, "Légende I", "Merci d'y avoir cru", y=774, style="nuit", panel=PANEL)
    save(c, "legende-1", RANK, 1, "I", "La Pyramide infinie",
         "Le cadre s'ouvre le plus loin dans les deux sens : derrière le blason, une pyramide faite de pyramides (le triangle de Sierpiński) "
         "renferme une galaxie, sur le fond d'un champ profond de mille galaxies et de la toile cosmique. À gauche, les puissances de dix "
         "montent de la Terre au Soleil, à la Voie lactée, aux amas et à la toile ; à droite elles descendent de la cellule à l'ADN, à l'atome, "
         "au noyau et aux quarks ; en filigrane, les fractions de l'œil d'Horus se divisent à l'infini.",
         "pied (Mee jackpot, Meo champagne)", "Merci d'y avoir cru")
