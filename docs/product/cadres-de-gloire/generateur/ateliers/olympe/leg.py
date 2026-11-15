"""Légende : cinq cadres, de V à I — l'Olympe flotte dans une nébuleuse, puis le cadre s'ouvre de plus en plus loin
dans les deux sens : l'immense (nébuleuses, galaxies, supernova, trou noir, amas) et l'infime (atomes de Démocrite,
orbitales, ADN, cellules, neurones, ondes, fractales), tissés avec les motifs grecs."""

import math
import random

from cadre import *  # noqa: F401,F403
from archi import column, TONES, pediment, entablature, cypress
from figures import smooth, horse, lyre
from cosmos import (star_field, outside, ublur, neb, constellation, thread, night, snowflake, koch, flower_of_life, hex_lattice,
                    diatom, pollen, flare, concentric, spiral_galaxy, small_galaxy, galaxy_cluster, supernova, black_hole, jet,
                    cosmic_web, atom, nucleus_balls, p_orbital, quarks, dna, neuron, cell, standing_wave, wave_packet, string_loop, nebula_field, milky_band)

GEM = "#B36EFF"
GOLD = ("#FFF4C2", "#E8B53C", "#8A5A12")
THREAD = "#FFE6A0"


def leg_crest(c, cx, cy, s, division):
    crest(c, cx, cy, s, "obsidian", division=division, gem=GEM, ink=GOLD[0], edge=GOLD[1])


def floating_olympus(card, seed=3):
    """Le mont Olympe arraché à la Terre, qui flotte : deux cimes enneigées (le Mytikas et le Trône de Zeus), le blason
    dans la selle entre elles, des temples sur les épaules, et deux racines de roche qui pendent le long de la photo."""
    rnd = random.Random(seed)
    ridge = [(40, 214), (58, 170), (76, 120), (96, 72), (112, 38), (128, 64), (150, 92), (176, 118), (206, 150), (238, 186), (270, 212),
             (302, 188), (332, 154), (362, 124), (392, 96), (414, 66), (428, 48), (446, 76), (466, 118), (484, 166), (500, 214)]
    under = [(492, 236), (480, 286), (470, 338), (458, 286), (432, 252), (370, 258), (300, 264), (240, 264), (176, 258), (110, 252), (84, 284), (70, 336),
             (58, 288), (46, 238)]
    pts = []
    for i, (x, y) in enumerate(ridge):
        j = rnd.uniform(-3, 3) if 0 < i < len(ridge) - 1 else 0
        pts.append((x + j, y + j))
    poly = pts + under
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in poly) + "Z"
    rock = ugrad(card, "fo-rock", [(0, "#8A7AB0", 1), (0.4, "#4A3A72", 1), (0.75, "#22163E", 1), (1, "#0A0618", 1)], 0, 40, 0, 340)
    out = [f'<path d="{d}" fill="{rock}"/>']
    facets = []
    for (px, py), base in (((112, 38), [(40, 214), (76, 214), (112, 218), (150, 216), (190, 214), (238, 210)]),
                           ((428, 48), [(302, 210), (350, 214), (392, 216), (428, 218), (466, 214), (500, 214)])):
        for i in range(len(base) - 1):
            (ax, ay), (bx, by) = base[i], base[i + 1]
            shade = ("#FFFFFF", "#000000")[i % 2]
            op = 0.1 + 0.06 * (i % 3)
            facets.append(f'<path d="M{f(px)} {f(py)} L{f(ax)} {f(ay)} L{f(bx)} {f(by)}Z" fill="{shade}" opacity="{f(op)}"/>')
    clip = f"{card.uid}-fo-clip"
    card.def_once("fo-clip", f'<clipPath id="{clip}"><path d="{d}"/></clipPath>')
    out.append(f'<g clip-path="url(#{clip})">{"".join(facets)}'
               f'<rect x="0" y="214" width="540" height="140" fill="{ugrad(card, "fo-under", [(0, "#000000", 0.2), (1, "#000000", 0.75)], 0, 214, 0, 340)}"/>'
               f'<path d="M80 250 Q120 230 170 246 T270 250 T380 244 T470 252 M110 236 L84 290 M440 238 L468 300" fill="none" stroke="#FFD36E" stroke-width="1.2" opacity="0.7"/></g>')
    snow = card.grad("fo-snow", [(0, "#FFFFFF"), (0.6, "#F0E8FF"), (1, "#C8B8F0")])
    for px, py, sgn in ((112, 38, -1), (428, 48, 1)):
        cap = (f"M{f(px - 34)} {f(py + 52)} L{f(px - 18)} {f(py + 26)} L{f(px)} {f(py)} L{f(px + 18)} {f(py + 28)} L{f(px + 36)} {f(py + 54)} "
               f"L{f(px + 22)} {f(py + 46)} L{f(px + 10)} {f(py + 58)} L{f(px - 4)} {f(py + 42)} L{f(px - 18)} {f(py + 56)}Z")
        out.append(f'<path d="{cap}" fill="{snow}"/>')
        out.append(f'<path d="M{f(px)} {f(py)} L{f(px + 18)} {f(py + 28)} L{f(px + 36)} {f(py + 54)} L{f(px + 22)} {f(py + 46)}Z" fill="#9A8AC8" opacity="0.55"/>')
    for k in range(50):
        t = rnd.random()
        x = 50 + t * 440
        y = 250 + rnd.uniform(0, 60) * (1 - abs(t - 0.5))
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(0.5, 1.6))}" fill="#FFE6F4" opacity="{f(rnd.uniform(0.3, 0.9))}"/>')
    return "".join(out)


def mini_temple(card, cx, by, s, tone="marble", gold=None):
    li, cl, mo, om, pr, dk, lt = TONES[tone]
    out = []
    w = 60 * s
    out.append(f'<rect x="{f(cx - w / 2 - 4 * s)}" y="{f(by - 6 * s)}" width="{f(w + 8 * s)}" height="{f(6 * s)}" fill="{cl}"/>')
    for k in range(5):
        x = cx - w / 2 + 4 * s + k * (w - 8 * s) / 4
        out.append(f'<rect x="{f(x - 2.4 * s)}" y="{f(by - 34 * s)}" width="{f(4.8 * s)}" height="{f(28 * s)}" fill="{li}"/>'
                   f'<rect x="{f(x + 0.6 * s)}" y="{f(by - 34 * s)}" width="{f(1.8 * s)}" height="{f(28 * s)}" fill="{mo}"/>')
    out.append(f'<rect x="{f(cx - w / 2 - 2 * s)}" y="{f(by - 40 * s)}" width="{f(w + 4 * s)}" height="{f(6 * s)}" fill="{cl}"/>')
    out.append(f'<path d="M{f(cx - w / 2 - 4 * s)} {f(by - 40 * s)} L{f(cx)} {f(by - 54 * s)} L{f(cx + w / 2 + 4 * s)} {f(by - 40 * s)}Z" fill="{li}"/>')
    if gold:
        out.append(f'<path d="M{f(cx - w / 2 - 4 * s)} {f(by - 40 * s)} L{f(cx)} {f(by - 54 * s)} L{f(cx + w / 2 + 4 * s)} {f(by - 40 * s)}" fill="none" stroke="{gold}" stroke-width="{f(1.2 * s)}"/>')
    return "".join(out)


def stardust_fall(card, name, x, y0, y1, w, color="#FFE6F4", seed=1, n=70):
    """Une cascade de poussière d'étoiles qui tombe d'une racine de l'île : un fil de lumière et des grains qui s'égrènent."""
    rnd = random.Random(seed)
    g = ugrad(card, name, [(0, color, 0.55), (0.6, color, 0.18), (1, color, 0)], x, y0, x, y1)
    out = [f'<path d="M{f(x)} {f(y0)} Q{f(x + w * 0.3)} {f((y0 + y1) / 2)} {f(x - w * 0.2)} {f(y1)}" fill="none" stroke="{g}" stroke-width="{f(w * 0.35)}" filter="{ublur(card, name + "-b", 4)}"/>',
           f'<path d="M{f(x)} {f(y0)} Q{f(x + w * 0.3)} {f((y0 + y1) / 2)} {f(x - w * 0.2)} {f(y1)}" fill="none" stroke="{g}" stroke-width="1"/>']
    for _ in range(n):
        t = rnd.random() ** 1.4
        yy = y0 + (y1 - y0) * t
        cx = x + w * 0.3 * 2 * t * (1 - t) - w * 0.2 * t * t
        xx = cx + rnd.gauss(0, w * 0.25 * (0.4 + t))
        r = rnd.uniform(0.4, 1.5)
        out.append(f'<circle cx="{f(xx)}" cy="{f(yy)}" r="{f(r)}" fill="#FFFFFF" opacity="{f((1 - t) * rnd.uniform(0.5, 1))}"/>')
        if rnd.random() < 0.06:
            out.append(sparkle(xx, yy, r * 5, color, 0.8 * (1 - t)))
    return "".join(out)


def leg5():
    c = start("l5", top="#241A38", bottom="#0C0816", rim="#E8D0FF")
    wp = window_path(92, 268, 448, 732, 16)
    m = window(c, "l5-win", wp)
    nebula_field(c, m, 5, [(150, 120, 220, 170, "#FF5AC8", "#6A1A9A", 0.9), (420, 160, 200, 160, "#5AD8FF", "#1A2A8A", 0.8),
                           (50, 560, 140, 300, "#B46AFF", "#2A0A6A", 0.75), (500, 600, 130, 300, "#FF7AA8", "#5A0A4A", 0.7),
                           (270, 900, 300, 120, "#7A6AFF", "#1A0A5A", 0.7)],
                 band=((-40, 980), (120, 500), (580, 60), 70))
    from retouche import floating_island, temple_small
    c.add(f'<g mask="{m}"><g filter="{c.shadow("l5-isl", 0, 10, 12, "#000000", 0.55)}">{floating_island(c, "l5-fo", seed=4)}</g></g>')
    c.add(f'<g filter="{c.shadow("l5-tp", 0, 2, 2, "#000000", 0.5)}">{temple_small(c, 192, 150, 0.7)}{temple_small(c, 350, 148, 0.7)}</g>')
    c.add(cloud(c, "l5-cl1", 110, 262, 120, 26, "#FFFFFF", "#F0C8FF", 0.85, seed=7, freq=0.025, disp=30))
    c.add(cloud(c, "l5-cl2", 430, 262, 120, 26, "#FFFFFF", "#C8F0FF", 0.85, seed=9, freq=0.025, disp=30))
    c.add(f'<g mask="{m}">{stardust_fall(c, "l5-f1", 70, 376, 760, 34, "#FFD0F0", seed=2, n=140)}{stardust_fall(c, "l5-f2", 470, 376, 760, 34, "#D0F4FF", seed=3, n=140)}</g>')
    inner_shadow(c, wp, 22, 0.8)
    gold_line(c, wp, 2.2)
    for x, y, r, rot in ((30, 450, 16, 20), (510, 420, 14, -30), (26, 640, 13, 60), (512, 660, 17, 10)):
        c.add(atom(c, f"l5-at{x}", x, y, r, "#FFE6F8", rot=rot, w=0.8, op=0.9, seed=x))
    c.add(f'<circle cx="270" cy="150" r="80" fill="{c.rgrad("l5-halo", [(0, "#FFE6F8", 0.7), (1, "#FFE6F8", 0)])}"/>')
    orb = "".join(f'<ellipse cx="270" cy="146" rx="96" ry="24" fill="none" stroke="{THREAD}" stroke-width="1.1" opacity="0.85" transform="rotate({k * 60 - 60} 270 146)"/>' for k in range(3))
    c.add(f'<g filter="{ublur(c, "l5-og", 2)}" opacity="0.6">{orb}</g>{orb}')
    for k, a in enumerate((20, 140, 260)):
        ex, ey = 270 + 96 * math.cos(math.radians(a)), 146 + 24 * math.sin(math.radians(a))
        ca, sa = math.cos(math.radians(k * 60 - 60)), math.sin(math.radians(k * 60 - 60))
        px, py = 270 + (ex - 270) * ca - (ey - 146) * sa, 146 + (ex - 270) * sa + (ey - 146) * ca
        c.add(f'<circle cx="{f(px)}" cy="{f(py)}" r="7" fill="#FFE6A0" opacity="0.35"/><circle cx="{f(px)}" cy="{f(py)}" r="2.6" fill="#FFFFFF"/>')
    leg_crest(c, 270, 142, 0.84, 5)
    bird(c, "mee-jackpot", 60, 214, 100, False, -8)
    bird(c, "meo-champagne", 482, 214, 100, True, 8)
    stele(c, "obsidienne", y=794, title="Légende V", orn="stars", x0=100, x1=440)
    frame_border(c, "gold", 8, 2.2)
    c.save(OUT / f"{SLUG}-legende-5.svg")
    register("legende-5", "legende", 5, "V", "L'Olympe flottant",
             "Le mont Olympe s'est arraché à la Terre et flotte dans une nébuleuse rose et turquoise traversée par la Voie lactée : "
             "ses deux cimes enneigées encadrent le blason, des temples éclairés sur les épaules ; sous sa roche luisent des cristaux, et de ses racines "
             "tombe une poussière d'étoiles ; autour du blason tournent les orbites d'un atome — l'« insécable » de Démocrite.",
             "libre : Mee (jackpot) et Meo (champagne) au bord de l'île flottante", None)


def leg4():
    c = start("l4", top="#20182E", bottom="#0A0812", rim="#E8D0FF")
    wp = window_path(90, 278, 450, 734, 8)
    m = window(c, "l4-win", wp)
    nebula_field(c, m, 41, [(270, 120, 300, 160, "#8A6AFF", "#1A0A6A", 0.85), (60, 520, 120, 320, "#FF6AB8", "#4A0A3A", 0.7),
                            (490, 520, 120, 320, "#4AC8FF", "#0A1A5A", 0.7), (270, 880, 300, 120, "#FFB04A", "#4A1A0A", 0.6)],
                 band=((-20, 300), (270, 40), (560, 300), 50))
    c.add(f'<g mask="{m}">{spiral_galaxy(c, "l4-g0", 270, 112, 170, tilt=0.36, rot=0.6, seed=9, n=1700)}</g>')
    tone = "night"
    ent, ybot, fr0 = entablature(c, 12, 528, 206, tone, arch_h=18, frieze_h=36, frieze=lambda a, b, cc, d: "", dentil=True)
    mf = marble_filter(c, "l4-mb", seed=14, freq=(0.006, 0.02), warp=60, vein="#C9B8F0", vein_op=0.35, cloud="#3A2A6A", cloud_op=0.35, gold=True, gold_color="#E8B53C")
    c.add(f'<g filter="{mf}">{ent}</g>')
    items = []
    for k in range(11):
        x = 34 + k * 47.2
        y = fr0 + 18
        if k % 2 == 0:
            items.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="15" fill="{c.rgrad("l4-fg", [(0, "#FFE6C8", 0.6), (1, "#FFE6C8", 0)])}"/>' + small_galaxy(x, y, 14, "#FFE6C8", rot=k * 30, tilt=0.5, seed=k))
        else:
            items.append(atom(c, f"l4-fa{k}", x, y, 14, "#FFE6A0", rot=k * 20, w=0.8, seed=k))
    c.add(f'<rect x="12" y="{f(fr0)}" width="516" height="36" fill="#070514" opacity="0.9"/>' + "".join(items))
    c.add(f'<rect x="12" y="{f(fr0)}" width="516" height="36" fill="none" stroke="#E8B53C" stroke-width="1"/>')
    cols = "".join(column(c, x, ybot, 740, 52, "ionic", tone, flutes=12) for x in (44, 496))
    c.add(f'<g filter="{mf}">{cols}</g>')
    c.add(f'<g mask="{m}" opacity="0.9">{star_field(77, 260, (18, ybot + 40, 70, 720), rmax=1.0, bright=0.08)}{star_field(78, 260, (470, ybot + 40, 522, 720), rmax=1.0, bright=0.08)}</g>')
    for x in (44 - 36, 496 + 36):
        c.add(spiral_galaxy(c, f"l4-v{x}", x, ybot + 20, 52, tilt=0.95, rot=0.2 if x < 270 else 2.6, seed=x, n=420, turns=3.6))
    for x in (44, 496):
        c.add(atom(c, f"l4-ba{x}", x, 722, 46, "#FFE6A0", tilt=0.2, rot=0, orbits=2, w=1.1, op=0.95, seed=x))
        c.add(p_orbital(c, f"l4-po{x}", x, 640, 30, "#B9A7FF", 0, 0.5))
    floor = c.grad("l4-floor", [(0, "#241A48"), (0.3, "#120C2A"), (1, "#05030C")])
    c.add(f'<rect x="0" y="740" width="540" height="220" fill="{floor}"/>')
    for k, y in enumerate((740, 754, 768)):
        c.add(f'<rect x="0" y="{y}" width="540" height="14" fill="{c.grad(f"l4-st{k}", [(0, "#3A2C6A"), (1, "#140C2A")])}"/><rect x="0" y="{y}" width="540" height="1.4" fill="#E8B53C" opacity="0.9"/>')
    c.add(f'<g opacity="0.35" transform="translate(0 1640) scale(1 -1)">{spiral_galaxy(c, "l4-gr", 270, 860, 150, tilt=0.3, rot=0.6, seed=9, n=500)}</g>')
    inner_shadow(c, wp, 22, 0.8)
    gold_line(c, wp, 2.2)
    leg_crest(c, 270, 126, 0.84, 4)
    mee_meo(c, "pied", "mee-amoureuse", "meo-trophee")
    stele(c, "obsidienne", y=794, title="Légende IV", orn="palmette", x0=96, x1=444)
    frame_border(c, "gold", 8, 2.2)
    c.save(OUT / f"{SLUG}-legende-4.svg")
    register("legende-4", "legende", 4, "IV", "La Volute et la Galaxie",
             "La volute du chapiteau ionique et la galaxie spirale ont la même forme : ici les colonnes de marbre de nuit veiné "
             "d'or portent des galaxies en guise de volutes, leurs bases tournent comme des atomes sous des orbitales, et la "
             "frise alterne galaxies et atomes sous une immense spirale qui couronne le blason et se reflète dans les degrés.",
             "pied : Mee (amoureuse) et Meo (trophée) au pied des colonnes", None)


def labyrinth(cx, cy, r0, r1, rings, color, w=2.2, seed=3):
    """Un labyrinthe circulaire : anneaux concentriques ouverts, murs radiaux qui les relient."""
    rnd = random.Random(seed)
    out = []
    step = (r1 - r0) / rings
    for i in range(rings + 1):
        r = r0 + step * i
        gap = rnd.uniform(0, 360)
        g2 = 24 if i < rings else 30
        x1, y1 = pt(cx, cy, r, gap + g2 / 2)
        x2, y2 = pt(cx, cy, r, gap + 360 - g2 / 2)
        out.append(f'<path d="M{f(x1)} {f(y1)} A{f(r)} {f(r)} 0 1 1 {f(x2)} {f(y2)}" fill="none" stroke="{color}" stroke-width="{f(w)}" stroke-linecap="round"/>')
        if i < rings:
            for k in range(rnd.randint(1, 3)):
                a = rnd.uniform(0, 360)
                xa, ya = pt(cx, cy, r, a)
                xb, yb = pt(cx, cy, r + step, a)
                out.append(f'<path d="M{f(xa)} {f(ya)} L{f(xb)} {f(yb)}" stroke="{color}" stroke-width="{f(w)}" stroke-linecap="round"/>')
    return "".join(out)


def leg3():
    c = start("l3", top="#221A2E", bottom="#0A0810", rim="#FFD0E8")
    wp = window_path(96, 270, 444, 732, 18)
    m = window(c, "l3-win", wp)
    nebula_field(c, m, 33, [(270, 140, 300, 180, "#FF4A7A", "#5A0A3A", 0.85), (40, 520, 130, 320, "#5A8AFF", "#0A1A6A", 0.7),
                            (500, 520, 130, 320, "#FF8A4A", "#5A1A0A", 0.65), (270, 880, 300, 120, "#B46AFF", "#2A0A5A", 0.6)],
                 band=((560, 980), (420, 480), (-20, 40), 56))
    c.add(f'<g mask="{m}">{supernova(c, "l3-sn", 478, 868, 56, seed=12)}{galaxy_cluster(5, 62, 878, 66, 30)}</g>')
    glow = ublur(c, "l3-lg", 3)
    lab = labyrinth(270, 140, 72, 116, 4, "#FFE6A0", 2.4, seed=7)
    c.add(f'<circle cx="270" cy="140" r="132" fill="{c.rgrad("l3-labg", [(0, "#0A0618", 0.2), (0.55, "#0A0618", 0.7), (0.9, "#0A0618", 0.45), (1, "#0A0618", 0)])}"/>')
    c.add(f'<g opacity="0.6" filter="{glow}">{lab}</g><g>{lab}</g>')
    pts = [(560, 40), (480, 70), (420, 104), (396, 150), (380, 196), (340, 236), (290, 248), (230, 242), (182, 210), (166, 160), (174, 110), (206, 74), (252, 56), (300, 60), (338, 86), (352, 130), (336, 172), (300, 192)]
    d = smooth(pts)
    c.add(f'<path d="{d}" fill="none" stroke="#FF3A5A" stroke-width="7" opacity="0.45" filter="{glow}"/><path d="{d}" fill="none" stroke="#FF7A8A" stroke-width="2"/>')
    c.add(f'<circle cx="270" cy="140" r="74" fill="{c.rgrad("l3-halo", [(0, "#FFE6F0", 0.6), (1, "#FFE6F0", 0)])}"/>')
    for x, ph in ((44, 0.0), (496, math.pi)):
        c.add(f'<g filter="{glow}" opacity="0.7">{dna(x, 232, 770, 21, 128, "#FF6A7A", "#7FE0FF", phase=ph, w=3.2)}</g>')
        c.add(dna(x, 232, 770, 21, 128, "#FF6A7A", "#7FE0FF", phase=ph, w=2.8))
    for x, y, r in ((22, 330, 16), (518, 640, 18), (520, 300, 11), (18, 700, 12)):
        c.add(cell(c, f"l3-c{x}{y}", x, y, r, seed=x + y))
    inner_shadow(c, wp, 22, 0.8)
    gold_line(c, wp, 2.2, "rosegold")
    leg_crest(c, 270, 136, 0.82, 3)
    mee_meo(c, "selfie", "mee-fete", "meo-selfie")
    stele(c, "obsidienne", y=786, title="Légende III", message="Merci d'être là", orn="rosettes", x0=96, x1=444)
    frame_border(c, "rosegold", 8, 2.2)
    c.save(OUT / f"{SLUG}-legende-3.svg")
    register("legende-3", "legende", 3, "III", "Le Fil d'Ariane",
             "Le blason est au cœur du labyrinthe de Crète, tracé en fil d'or dans une nébuleuse ; le fil rouge d'Ariane y entre "
             "et devient, de chaque côté de la photo, un brin d'une double hélice d'ADN — le plus ancien fil qui nous guide —, "
             "avec des cellules, la Voie lactée, une supernova et un amas de galaxies au pied de la stèle.",
             "selfie : Meo prend la pose en grand dans la photo", "Merci d'être là")


def leg2():
    c = start("l2", top="#1E1A30", bottom="#0A0812", rim="#FFE0B0")
    wp = window_path(96, 270, 444, 732, 120, arch="oval")
    m = window(c, "l2-win", wp)
    nebula_field(c, m, 22, [(270, 140, 300, 180, "#FFB04A", "#6A1A3A", 0.85), (60, 600, 140, 330, "#B46AFF", "#1A0A5A", 0.75),
                            (490, 600, 140, 330, "#4AC8FF", "#0A1A5A", 0.75), (270, 900, 300, 110, "#FF6AB8", "#3A0A3A", 0.6)],
                 band=((-20, 820), (270, 560), (560, 820), 60))
    c.add(f'<g mask="{m}">{supernova(c, "l2-sn", 270, 140, 92, c1="#FFE8A8", c2="#FF5A8A", c3="#6A4AFF", seed=21)}</g>')
    c.add(f'<g mask="{m}">{galaxy_cluster(8, 66, 878, 72, 34)}{galaxy_cluster(9, 474, 878, 72, 34)}</g>')
    for x, ax, seed in ((62, 168, 3), (478, -168, 5)):
        c.add(f'<g mask="{m}">{neuron(c, f"l2-n{x}", x, 226, 1.35, "#FFD36E", "#FFB0E0", seed=seed, axon=(ax, 330), depth=4)}</g>')
    nine = [pt(270, 140, 112, 360 * k / 9) for k in range(9)]
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in nine) + "Z"
    c.add(f'<path d="{d}" fill="none" stroke="{THREAD}" stroke-width="5" opacity="0.25" filter="{ublur(c, "l2-ng", 2)}"/><path d="{d}" fill="none" stroke="{THREAD}" stroke-width="1" opacity="0.85"/>')
    for x, y in nine:
        c.add(f'<circle cx="{f(x)}" cy="{f(y)}" r="8" fill="{THREAD}" opacity="0.25"/><circle cx="{f(x)}" cy="{f(y)}" r="2.4" fill="#FFFFFF"/>{flare(x, y, 11, "#FFFFFF", 0.9, 0.08)}')
    for x, y, r in ((28, 470, 17), (512, 420, 15), (34, 700, 14), (508, 690, 12)):
        c.add(cell(c, f"l2-c{x}", x, y, r, mem="#FFC8E8", nuc="#FFD36E", seed=x))
    for x, y, rot in ((510, 560, 30), (30, 580, -20)):
        c.add(p_orbital(c, f"l2-po{x}", x, y, 22, "#B9A7FF", rot))
    inner_shadow(c, wp, 24, 0.8)
    gold_line(c, wp, 2.4)
    leg_crest(c, 270, 136, 0.84, 2)
    mee_meo(c, "cotes", "mee-bisou-vole", "meo-muscles")
    stele(c, "obsidienne", y=790, title="Légende II", orn="palmette", x0=96, x1=444)
    frame_border(c, "gold", 8, 2.4)
    c.save(OUT / f"{SLUG}-legende-2.svg")
    register("legende-2", "legende", 2, "II", "Mnémosyne",
             "Mnémosyne, la Mémoire, mère des neuf Muses : deux neurones d'or déploient leurs dendrites comme des oliviers et "
             "font descendre leurs axones le long de la photo ; neuf étoiles — les Muses — font une ronde autour du blason posé "
             "sur une supernova, avec des cellules, des orbitales, la Voie lactée et deux amas de galaxies.",
             "cotes : Mee (bisou volé) et Meo (muscles) se penchent par les côtés", None)


def leg1():
    c = start("l1", top="#1E1830", bottom="#0A0812", rim="#FFE0B0")
    wp = window_path(96, 270, 444, 728, 14)
    m = window(c, "l1-win", wp)
    nebula_field(c, m, 13, [(270, 140, 320, 190, "#6A5AFF", "#1A0A6A", 0.85), (110, 60, 170, 100, "#FF6AC8", "#5A0A4A", 0.7),
                            (60, 560, 120, 320, "#4AD8C8", "#0A3A4A", 0.6), (480, 560, 120, 320, "#FF9A5A", "#5A1A0A", 0.6),
                            (440, 900, 170, 90, "#FFB04A", "#5A1A0A", 0.6)],
                 band=((-30, 420), (300, 200), (580, -20), 60))
    orbits = []
    rnd = random.Random(3)
    for i, r in enumerate((128, 190, 262, 344, 436, 540)):
        orbits.append(f'<ellipse cx="270" cy="140" rx="{r}" ry="{f(r * 0.36)}" fill="none" stroke="{THREAD}" stroke-width="{f(1.3 - i * 0.1)}" opacity="{f(0.85 - i * 0.07)}"/>')
        a = rnd.uniform(0, 2 * math.pi)
        px, py = 270 + r * math.cos(a), 140 + r * 0.36 * math.sin(a)
        col = rnd.choice(("#FFD36E", "#9FD8FF", "#FF8A6A", "#C8B8FF", "#7FE0C8"))
        orbits.append(f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(5 + i * 1.4)}" fill="{c.rgrad(f"l1-pl{i}", [(0, "#FFFFFF", 1), (0.4, col, 1), (1, "#1A1030", 1)], 0.35, 0.35, 0.7)}"/>')
    c.add(f'<g mask="{m}" transform="rotate(-8 270 140)">{"".join(orbits)}</g>')
    c.add(f'<g mask="{m}">{spiral_galaxy(c, "l1-g", 470, 66, 66, tilt=0.42, rot=1.2, seed=31, n=800)}</g>')
    c.add(constellation(c, "lyra", 74, 82, 96, THREAD, rot=-10, w=1.0, star=2.4, op=0.95))
    from retouche import pythagoras_tree, lyre_bridge, quantum_atom, ringed_planet
    c.add(ringed_planet(c, "l1-sat", 470, 196, 9, "#FFC27A", "#FFE6A0"))
    for x0, flip in ((36, False), (482, True)):
        a, b = (x0, 266), (x0 + 20, 266)
        tree = pythagoras_tree(a[0], a[1], b[0], b[1], 8, "#FFD36E", angle=36.87 if not flip else 53.13, w=0.7, op=0.95)
        c.add(f'<g filter="{c.shadow("l1-pt", 0, 0, 2.5, "#FFB040", 0.8)}">{tree}</g>')
    glow = ublur(c, "l1-sg", 3)
    strings = []
    for k, (x, h) in enumerate(((22, 1), (44, 2), (66, 3), (474, 3), (496, 2), (518, 1))):
        sw = standing_wave(276, 736, 0, 9, h, "#FFE6A0", 1.5, 0.95)
        strings.append(f'<g transform="translate({x} 0) rotate(90)">{sw}</g><circle cx="{x}" cy="276" r="2.6" fill="#FFE6A0"/><circle cx="{x}" cy="736" r="2.6" fill="#FFE6A0"/>')
    sg = "".join(strings)
    c.add(f'<g mask="{m}"><g filter="{glow}" opacity="0.8">{sg}</g>{sg}</g>')
    for y in (272, 734):
        c.add(lyre_bridge(c, 12, 78, y, (22, 44, 66)))
        c.add(lyre_bridge(c, 462, 528, y, (474, 496, 518)))
    c.add(f'<g mask="{m}">{black_hole(c, "l1-bh", 270, 768, 40, tilt=0.16, disk=6.6)}</g>')
    for x, y in ((46, 872), (494, 872)):
        c.add(quantum_atom(c, f"l1-qa{x}", x, y, 34, "#9FD8FF", 0.8))
    c.add(wave_packet(10, 170, 936, 8, 10, "#9FD8FF", 1.2, 0.85), wave_packet(370, 530, 936, 8, 10, "#9FD8FF", 1.2, 0.85))
    inner_shadow(c, wp, 22, 0.8)
    gold_line(c, wp, 2.4)
    c.add(f'<circle cx="270" cy="140" r="90" fill="{c.rgrad("l1-halo", [(0, "#FFF2D0", 0.8), (0.5, "#FFD36E", 0.35), (1, "#FFD36E", 0)])}"/>')
    leg_crest(c, 270, 136, 0.9, 1)
    mee_meo(c, "ruban", "mee-montee-au-ciel", "meo-roi")
    stele(c, "obsidienne", y=796, title="Légende I", message="Écrit dans les étoiles", orn="stars", x0=104, x1=436)
    frame_border(c, "gold", 8, 2.6)
    c.save(OUT / f"{SLUG}-legende-1.svg")
    register("legende-1", "legende", 1, "I", "La Musique des sphères",
             "Pythagore entendait les astres chanter : le blason est le feu central autour duquel tournent les orbites et leurs "
             "planètes, la Lyre et Véga brillent, et les côtés du cadre deviennent une cithare d'or dont les cordes vibrent sur "
             "leurs harmoniques 1, 2, 3 ; sur ses chevalets poussent deux arbres de Pythagore, carrés et triangles 3-4-5 à l'infini ; "
             "un trou noir déploie son disque au pied de la stèle entre deux atomes quantiques aux orbitales p, et des paquets d'ondes.",
             "ruban : Mee (montée au ciel) et Meo (roi) au bord de la stèle", "Écrit dans les étoiles")


ALL = [leg5, leg4, leg3, leg2, leg1]
