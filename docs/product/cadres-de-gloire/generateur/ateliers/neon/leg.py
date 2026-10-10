"""Atelier « Néon » : LÉGENDE V → I — l'immense et l'infime tissés ensemble ; de V à I, le cadre s'ouvre plus loin."""

import math
import random

from kit import *  # noqa: F401,F403
from cosmos import *  # noqa: F401,F403
from orc import space  # noqa: E402


def legend_crest(c, division, cy=150, s=0.9, edge=CYAN):
    c.add(glow_spot(c, 270, cy, 100, 100, edge, 0.35))
    crest(c, 270, cy, s, "obsidian", division=division, gem=MAGENTA, ink=light(edge, 0.3), edge=light(edge, 0.2))


def frame_window(c, win_d, outer_d, c1, kind="cool", w=1.8):
    c.add(spill(c, win_d, c1, 28, 0.32))
    c.add(chrome_stroke(c, outer_d, 5, kind))
    c.add(tube(c, f'<path d="{win_d}"/>', c1, w, 6))


def dna_rungs_label(x, y, text, color):
    return label(x, y, text, color, 7, "middle", 0.8, 1.2)


def orbital_cloud(card, kind, cx, cy, r, color, seed=1, n=260):
    """Une orbitale électronique en nuage de probabilité : 1s (sphère), 2p (haltère), 3d (trèfle)."""
    rnd = random.Random(seed)
    dots, geo = [], []
    if kind == "s":
        lobes = [(0, 0, r * 0.62, r * 0.62)]
        geo.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}"/>')
    elif kind == "p":
        lobes = [(0, -r * 0.55, r * 0.34, r * 0.42), (0, r * 0.55, r * 0.34, r * 0.42)]
        geo.append(f'<path d="{lobe_d(cx, cy, r * 1.05, 0, 0)}"/><path d="{lobe_d(cx, cy, r * 1.05, 0, 180)}"/>')
    else:
        lobes = [(math.sin(math.radians(a)) * r * 0.55, -math.cos(math.radians(a)) * r * 0.55, r * 0.26, r * 0.26) for a in (45, 135, 225, 315)]
        geo.append("".join(f'<path d="{lobe_d(cx, cy, r * 1.0, 0, a)}"/>' for a in (45, 135, 225, 315)))
    for _ in range(n):
        ox, oy, sx, sy = rnd.choice(lobes)
        x, y = cx + ox + rnd.gauss(0, sx * 0.55), cy + oy + rnd.gauss(0, sy * 0.55)
        dots.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(0.4, 1.2))}" fill="{rnd.choice(("#FFFFFF", light(color, 0.5), color))}" opacity="{f(rnd.uniform(0.35, 1))}"/>')
    return (glow_spot(card, cx, cy, r * 1.3, r * 1.3, color, 0.35) + "".join(dots)
            + tube(card, "".join(geo), color, 1.0, 4, op=0.75) + bulb(card, cx, cy, 2, "#FFFFFF"))


# ---------------------------------------------------------------- V : orbitales

def leg5():
    c = start("l5", "#22163E", "#0A0716", "#C9A8FF")
    win = rrect_d(88, 268, 452, 714, 14)
    m = window(c, win)
    body = [space(c, 101, "#120634", "#080320", clouds=((270, 140, 280, 150, "#5A1A9A", "#1A0840", 0.55, 6),))]
    body.append(galaxy_wire(c, 470, 70, 64, arms=2, tilt=0.5, angle=-20, colors=(PINK, CYAN), w=1.0, dots=80, seed=3))
    body.append(pow10(470, 128, "10", "21", light(CYAN, 0.4), 7.5, "middle", 0.8))
    body.append(grid(c, 640, MAGENTA, gap=40, nh=12, depth=0.55, w=1.2, halo=4))
    body.append(glow_spot(c, 270, 960, 360, 180, MAGENTA, 0.35))
    c.add(f'<g mask="{m}">{"".join(body)}</g>')
    rnd = random.Random(55)
    cloud_dots = []
    for _ in range(420):
        a = rnd.uniform(0, 2 * math.pi)
        d = abs(rnd.gauss(0, 0.5))
        x, y = 270 + 140 * d * math.cos(a), 150 + 95 * d * math.sin(a)
        cloud_dots.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(0.4, 1.2))}" fill="{rnd.choice(("#FFFFFF", "#FFB3E6", "#BFF5FF"))}" opacity="{f(rnd.uniform(0.3, 0.9))}"/>')
    c.add("".join(cloud_dots))
    c.add(atom(c, 270, 150, 132, 36, 3, (MAGENTA, CYAN, YELLOW), 1.7, 0, None, True, 6))
    # l'infime à gauche : les orbitales en nuages de probabilité ; l'immense à droite : une galaxie, une nébuleuse, un amas
    for kind, y, col, sd, name in (("s", 352, CYAN, 1, "1s"), ("p", 482, MAGENTA, 2, "2p"), ("d", 616, YELLOW, 3, "3d")):
        c.add(orbital_cloud(c, kind, 42, y, 30, col, sd))
        c.add(label(42, y + 46, name, light(col, 0.4), 8, "middle", 0.9, 1))
    c.add(galaxy_wire(c, 496, 372, 34, 2, 1.2, 0.62, 0.3, -30, (MAGENTA, CYAN), 3, 0.9, 3, dots=90, seed=13))
    c.add(nebula_cloud(c, 496, 500, 40, 52, "#FF6FB1", "#6A1A8A", 0.7, seed=17, freq=0.03, disp=30))
    c.add(star(c, 492, 496, 2.2, "#FFE6F6"))
    c.add(cluster(c, 19, 496, 620, 26))
    for y, txt in ((418, "GALAXIE"), (562, "NÉBULEUSE"), (660, "AMAS")):
        c.add(label(496, y, txt, light(CYAN, 0.4), 6.5, "middle", 0.85, 1.2))
    c.add(pow10(150, 238, "10", "-10", light(MAGENTA, 0.4), 7.5, "middle", 0.8))
    frame_window(c, win, rrect_d(82, 262, 458, 720, 18), MAGENTA)
    legend_crest(c, 5)
    plaque(c, "Légende V", None, c1=MAGENTA, c2=CYAN, chrome_kind="cool")
    birds(c, [("mee-jackpot", 94, 704, 130, False, -6), ("meo-muscles", 446, 704, 130, True, 6)], glow=MAGENTA)
    save(c, "legende-5")
    register("legende-5", "legende", 5, "V", "Orbitales",
             "Le blason devient le noyau d'un atome : trois orbites de néon tournent autour, chacune avec son électron. Sur le flanc gauche, l'infime — les orbitales 1s, 2p et 3d en nuages de probabilité ; sur le flanc droit, l'immense — une galaxie, une nébuleuse, un amas : 10⁻¹⁰ m d'un côté, 10²¹ m de l'autre.",
             "pied : Mee (jackpot) et Meo (muscles) sur la grille", None)


# ---------------------------------------------------------------- IV : la double hélice et la galaxie

def leg4():
    c = start("l4", "#24163F", "#0A0716", "#9FE8FF")
    win = rrect_d(90, 270, 450, 714, 14)
    m = window(c, win)
    body = [space(c, 111, "#0E0630", "#07031E", clouds=((120, 120, 200, 120, "#8A1A8A", "#2A0838", 0.55, 2), (430, 160, 220, 130, "#1A5A9A", "#081838", 0.55, 7)))]
    body.append(galaxy_wire(c, 270, 150, 230, arms=2, turns=1.3, tilt=0.42, angle=-8, colors=(MAGENTA, CYAN), w=1.3, dots=220, seed=8))
    # la planète qui se lève au pied du cadre
    body.append(f'<ellipse cx="270" cy="1240" rx="520" ry="380" fill="{c.rgrad("plb", [(0, "#2A1A6A", 1), (0.9, "#140A3A", 1), (1, "#4A2AA0", 1)])}"/>')
    body.append(tube(c, '<ellipse cx="270" cy="1240" rx="520" ry="380"/>', CYAN, 1.6, 10))
    body.append(glow_spot(c, 270, 860, 420, 60, CYAN, 0.45))
    c.add(f'<g mask="{m}">{"".join(body)}</g>')
    c.add(helix(c, 44, 262, 722, 20, 118, MAGENTA, CYAN, phase=0.4))
    c.add(helix(c, 496, 262, 722, 20, 118, CYAN, MAGENTA, phase=2.1))
    c.add(label(44, 254, "ADN · 2 nm", light(MAGENTA, 0.4), 7, "middle", 0.85, 1.2))
    c.add(label(496, 254, "ADN · 2 nm", light(CYAN, 0.4), 7, "middle", 0.85, 1.2))
    c.add(label(270, 40, "GALAXIE · 100 000 ANNÉES-LUMIÈRE", light(CYAN, 0.5), 7, "middle", 0.75, 1.6))
    frame_window(c, win, rrect_d(84, 264, 456, 720, 18), CYAN)
    legend_crest(c, 4, s=0.86)
    plaque(c, "Légende IV", "Main dans la main", c1=CYAN, c2=MAGENTA, chrome_kind="cool", msg_color=PINK)
    bird(c, "duo-main-dans-la-main", 440, 690, 150, flip=True)
    save(c, "legende-4")
    register("legende-4", "legende", 4, "IV", "Hélices",
             "Deux doubles hélices d'ADN montent en tubes de néon de part et d'autre de la photo, leurs paires de bases allumées ; au-dessus, une galaxie spirale en fil de lumière tourne autour du blason, et une planète se lève au pied du cadre.",
             "duo : Mee et Meo main dans la main, au coin de la photo", "Main dans la main")


# ---------------------------------------------------------------- III : supernova et neurones

def leg3():
    c = start("l3", "#26163C", "#0A0716", "#FFB3E6")
    win = rrect_d(90, 270, 450, 714, 14)
    m = window(c, win)
    body = [space(c, 121, "#140630", "#08031E", n=320, clouds=((270, 150, 300, 170, "#A0207A", "#2A0838", 0.5, 9),))]
    body.append(supernova(c, 270, 150, 150))
    body.append(cluster(c, 4, 70, 80, 50))
    body.append(cluster(c, 9, 476, 90, 44, colors=("#BFE9FF", "#FFE6B0", "#FFFFFF")))
    body.append(neuron(c, 3, 44, 380, 120, CYAN, axon_to=(40, 560)))
    body.append(neuron(c, 7, 46, 600, 100, MAGENTA, axon_to=(70, 700)))
    body.append(neuron(c, 5, 496, 420, 120, MAGENTA, axon_to=(500, 600)))
    body.append(neuron(c, 11, 494, 640, 90, CYAN, axon_to=(470, 720)))
    body.append(molecule(c, 40, 760, 14, rings=((0, 0), (1, 0), (0, 1)), color=LIME, atoms=MAGENTA, rot=0))
    body.append(molecule(c, 470, 770, 14, rings=((0, 0), (1, 0)), color=YELLOW, atoms=CYAN, rot=30))
    body.append(grid(c, 680, VIOLET, gap=40, nh=10, depth=0.6, w=1.0, halo=3, op=0.8))
    c.add(f'<g mask="{m}">{"".join(body)}</g>')
    c.add(label(44, 470, "NEURONE · 0,1 mm", light(CYAN, 0.4), 6.5, "middle", 0.85, 1).replace('x="44"', 'x="46"'))
    c.add(label(270, 34, "SUPERNOVA · 10 ANNÉES-LUMIÈRE", light(MAGENTA, 0.5), 7, "middle", 0.8, 1.6))
    frame_window(c, win, rrect_d(84, 264, 456, 720, 18), MAGENTA)
    legend_crest(c, 3, s=0.86, edge=MAGENTA)
    plaque(c, "Légende III", "Plus loin que les étoiles", c1=MAGENTA, c2=CYAN, chrome_kind="cool", msg_color=YELLOW, style="hud")
    birds(c, [("mee-wow", 94, 706, 126, False, -6), ("meo-bravo", 446, 706, 126, True, 6)], glow=MAGENTA)
    save(c, "legende-3")
    register("legende-3", "legende", 3, "III", "Supernova",
             "Une étoile explose derrière le blason en gerbe de rayons et d'anneaux de choc ; sur les bords, des neurones de néon se tendent leurs axones comme les pistes d'un circuit, des molécules aromatiques s'allument au pied du cadre, et deux amas d'étoiles veillent aux coins.",
             "pied : Mee (wow) et Meo (bravo) au bord de la grille", "Plus loin que les étoiles")


# ---------------------------------------------------------------- II : l'amas, l'onde et l'orbitale

def lobe_d(cx, cy, L, wdt, angle):
    """Un lobe d'orbitale en goutte arrondie, de (cx, cy) vers `angle` (degrés depuis midi)."""
    pts = [(0, 0), (-0.4, -0.28), (-0.46, -1.02), (0, -1.04), (0.46, -1.02), (0.4, -0.28), (0, 0)]
    a = math.radians(angle)
    tr = [(cx + L * (u * math.cos(a) - v * math.sin(a)), cy + L * (u * math.sin(a) + v * math.cos(a))) for u, v in pts]
    (x0, y0), (a1x, a1y), (a2x, a2y), (x3, y3), (b1x, b1y), (b2x, b2y), (x6, y6) = tr
    return f"M{f(x0)} {f(y0)} C{f(a1x)} {f(a1y)} {f(a2x)} {f(a2y)} {f(x3)} {f(y3)} C{f(b1x)} {f(b1y)} {f(b2x)} {f(b2y)} {f(x6)} {f(y6)}Z"


def leg2():
    c = start("l2", "#1E163E", "#090716", "#BFE9FF")
    win = rrect_d(90, 272, 450, 714, 14)
    m = window(c, win)
    body = [space(c, 131, "#0C0630", "#06031C", n=340, clouds=((100, 90, 200, 140, "#3A1AAA", "#0A0840", 0.6, 3), (450, 120, 200, 150, "#AA1A6A", "#3A0828", 0.5, 12)))]
    # interférences : deux sources d'ondes dont les cercles se croisent (les fentes de Young)
    rings_a = "".join(f'<circle cx="-70" cy="140" r="{r}"/>' for r in range(40, 700, 11))
    rings_b = "".join(f'<circle cx="610" cy="140" r="{r}"/>' for r in range(40, 700, 11))
    fm = fade_mask(c, 0, 270, top_op=0.5, bot_op=0.0)
    body.append(f'<g mask="{fm}">' + fine(rings_a, CYAN, 0.7, 0.28) + fine(rings_b, MAGENTA, 0.7, 0.28) + "</g>")
    # l'immense : un amas de galaxies et ses arcs de lentille gravitationnelle, un trou noir
    body.append(cluster(c, 21, 462, 74, 62, colors=("#FFE6B0", "#BFE9FF", "#FFC2EC", "#FFFFFF")))
    lens = "".join(f'<path d="{arc_d(462, 74, r, a0, a0 + sp)}"/>' for r, a0, sp in ((70, 200, 50), (64, 20, 46), (78, 300, 34), (58, 110, 30)))
    body.append(tube(c, lens, "#9FD8FF", 1.2, 4, op=0.9))
    body.append(black_hole(c, 80, 98, 19, 64, 11, (ORANGE, YELLOW, MAGENTA), 3, angle=-16, w=1.5))
    # ondes quantiques : paquets d'ondes le long des bords
    body.append(tube(c, f'<path d="{vwave_d(30, 296, 560, 16, 5, 0, "bell")}"/>', CYAN, 1.3, 4))
    body.append(tube(c, f'<path d="{vwave_d(60, 316, 540, 9, 8, 1.2, "bell")}"/>', VIOLET, 1.0, 3, op=0.8))
    body.append(tube(c, f'<path d="{vwave_d(510, 296, 560, 16, 5, 2, "bell")}"/>', MAGENTA, 1.3, 4))
    body.append(tube(c, f'<path d="{vwave_d(480, 316, 540, 9, 8, 0.4, "bell")}"/>', VIOLET, 1.0, 3, op=0.8))
    body.append(grid(c, 700, MAGENTA, gap=42, nh=10, depth=0.6, w=1.0, halo=3, op=0.75))
    c.add(f'<g mask="{m}">{"".join(body)}</g>')
    # l'orbitale d en trèfle derrière le blason
    lobe_fill = c.rgrad("lobe", [(0, "#FFFFFF", 0.0), (0.5, MAGENTA, 0.18), (1, MAGENTA, 0.38)], 0.5, 0.5, 0.6)
    for k, a in enumerate((45, 135, 225, 315)):
        col = MAGENTA if k % 2 == 0 else CYAN
        d = lobe_d(270, 152, 124, 22, a)
        c.add(f'<path d="{d}" fill="{col}" opacity="0.13"/>')
        c.add(tube(c, f'<path d="{d}"/>', col, 1.4, 6, op=0.9))
    ring = '<ellipse cx="270" cy="152" rx="150" ry="26"/>'
    c.add(tube(c, ring, CYAN, 1.4, 6, op=0.8))
    c.add(tube(c, f'<path d="{wave_d(96, 444, 248, 12, 7, 0)}"/>', LIME, 1.2, 4))
    c.add(label(30, 286, "ψ", light(CYAN, 0.4), 12, "middle", 0.9, 0, 700))
    c.add(label(510, 286, "ψ", light(MAGENTA, 0.4), 12, "middle", 0.9, 0, 700))
    c.add(pow10(462, 162, "10", "24", light(YELLOW, 0.5), 7.5, "middle", 0.85, " m · amas"))
    c.add(loupe(c, 44, 616, 30, YELLOW, tube(c, sierpinski_geo(44, 620, 24, 4), YELLOW, 0.6, 2), "SIERPIŃSKI".replace("Ń", "N")))
    c.add(loupe(c, 496, 616, 30, CYAN, tube(c, f'<path d="{koch_d(496, 616, 21, 3)}"/>', CYAN, 0.8, 2), "KOCH"))
    frame_window(c, win, rrect_d(84, 266, 456, 720, 18), CYAN)
    legend_crest(c, 2, s=0.82)
    plaque(c, "Légende II", None, c1=CYAN, c2=MAGENTA, chrome_kind="cool")
    birds(c, [("mee-lettre", 94, 706, 126, False, -6), ("meo-trophee", 446, 706, 126, True, 6)], glow=CYAN)
    save(c, "legende-2")
    register("legende-2", "legende", 2, "II", "L'Onde et l'Amas",
             "Derrière le blason s'ouvre une orbitale d en trèfle, cerclée d'un anneau ; des paquets d'ondes quantiques (ψ) longent la photo, un triangle de Sierpiński et un flocon de Koch — deux fractales — s'allument au pied, et dans le ciel un amas de galaxies voisine avec un petit trou noir et son disque.",
             "pied : Mee (clin d'œil) et Meo (trophée) sur la grille", None)


# ---------------------------------------------------------------- I : la galaxie en fil de néon

def grand_galaxy(card, cx, cy, r_in, r_out, arms=3, turns=0.95, colors=(MAGENTA, CYAN, VIOLET), seed=12, strands=5, tilt=1.0, rot=0.0):
    """Une galaxie dont la photo est le cœur : ses bras, gerbes de tubes, s'enroulent autour du cadre."""
    rnd = random.Random(seed)
    b = math.log(r_out / r_in) / (turns * 2 * math.pi)
    glows, tubes, dots, knots = [], [], [], []
    for a in range(arms):
        col = colors[a % len(colors)]
        base = rot + a * 2 * math.pi / arms
        geo_main, geo_side = [], []
        for st in range(strands):
            off = (st - (strands - 1) / 2) * 0.075
            pts = []
            for i in range(140):
                th = i / 139 * turns * 2 * math.pi
                rr = r_in * math.exp(b * th) * (1 + off)
                ang = th + base + off * 0.9
                pts.append(f"{f(cx + rr * math.cos(ang))} {f(cy + rr * math.sin(ang) * tilt)}")
            d = "M" + " L".join(pts)
            (geo_main if st == strands // 2 else geo_side).append(f'<path d="{d}"/>')
        glows.append(f'<g fill="none" stroke="{col}" stroke-width="46" opacity="0.2" filter="{ublur(card, 20)}">{geo_main[0]}</g>')
        tubes.append(tube(card, "".join(geo_side), col, 0.9, 4, op=0.7))
        tubes.append(tube(card, geo_main[0], col, 2.2, 8))
        for _ in range(520):
            th = rnd.uniform(0, turns * 2 * math.pi)
            rr = r_in * math.exp(b * th) * rnd.gauss(1, 0.07)
            ang = th + base + rnd.gauss(0, 0.06)
            x, y = cx + rr * math.cos(ang), cy + rr * math.sin(ang) * tilt
            dots.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(0.35, 1.5))}" fill="{rnd.choice(("#FFFFFF", "#FFFFFF", light(col, 0.5)))}" opacity="{f(rnd.uniform(0.35, 1))}"/>')
        for _ in range(9):
            th = rnd.uniform(0.1, turns * 2 * math.pi)
            rr = r_in * math.exp(b * th)
            ang = th + base + rnd.gauss(0, 0.04)
            knots.append(bulb(card, cx + rr * math.cos(ang), cy + rr * math.sin(ang) * tilt, rnd.uniform(1.4, 2.6), rnd.choice((PINK, "#FFB3E6", "#BFF5FF"))))
    return "".join(glows) + "".join(tubes) + "".join(dots) + "".join(knots)


def leg1():
    c = start("l1", "#22163E", "#0A0716", "#FFB3E6")
    win = rrect_d(92, 274, 448, 712, 16)
    m = window(c, win)
    body = [space(c, 141, "#0A0428", "#05021A", n=420, clouds=((90, 300, 220, 300, "#8A1A9A", "#2A0838", 0.5, 4), (460, 560, 220, 300, "#1A5AAA", "#081838", 0.5, 9), (270, 110, 300, 140, "#AA2A8A", "#3A0838", 0.45, 14)))]
    body.append(glow_spot(c, 270, 490, 330, 420, "#FFD6F5", 0.55))
    body.append(glow_spot(c, 270, 490, 420, 520, MAGENTA, 0.35))
    # la galaxie, dont la photo est le cœur : deux bras, et chaque bras est une double hélice
    body.append(f'<ellipse cx="270" cy="490" rx="330" ry="420" fill="{c.rgrad("disk", [(0, "#FFE6F6", 0.35), (0.5, "#B03AA8", 0.18), (1, "#2A0838", 0)])}"/>')
    for gx, gy, gr, ga, sd in ((40, 214, 16, -30, 21), (500, 300, 12, 40, 22), (60, 860, 14, 10, 23), (480, 900, 18, -50, 24)):
        body.append(galaxy_wire(c, gx, gy, gr, 2, 1.0, 0.5, 0.3, ga, ("#FFB3E6", "#BFE9FF"), 1, 0.6, 2, dots=24, seed=sd, op=0.75))
    body.append(f'<g opacity="0.9">{grand_galaxy(c, 270, 490, 150, 1100, arms=2, turns=1.15, colors=(VIOLET, "#6A8CFF"), seed=31, strands=3, tilt=1.22, rot=math.radians(-20))}</g>')
    body.append(helix_arm(c, 270, 490, 140, 1000, 1.15, math.radians(-110), 1.22, MAGENTA, CYAN, amp=(4, 0.022), lam=(28, 0.045), seed=3, w=1.7, dots=700, knots=14))
    body.append(helix_arm(c, 270, 490, 140, 1000, 1.15, math.radians(70), 1.22, CYAN, MAGENTA, amp=(4, 0.022), lam=(28, 0.045), seed=7, glow="#3A6AFF", w=1.7, dots=700, knots=14))
    body.append(grid(c, 790, VIOLET, gap=44, nh=7, depth=0.75, w=1.0, halo=3, op=0.5))
    c.add(f'<g mask="{m}">{"".join(body)}</g>')
    # le bulbe, aveuglant, derrière le blason
    c.add(glow_spot(c, 270, 150, 120, 110, MAGENTA, 0.5))
    # l'infime, en incrustations
    c.add(loupe(c, 50, 64, 32, MAGENTA, atom(c, 50, 64, 24, 8, 3, (MAGENTA, CYAN, YELLOW), 1.0, 20, 5, True, 3), "ATOME\n0,1 nm"))
    c.add(loupe(c, 490, 64, 32, LIME, neuron(c, 9, 490, 64, 44, LIME, w=0.9, axon_to=(504, 84)), "NEURONE\n0,1 mm"))
    frame_window(c, win, rrect_d(86, 268, 454, 718, 20), MAGENTA, "prism", 2)
    c.add(fine(brackets_geo(74, 256, 466, 730, 30), CYAN, 1.6, 0.9))
    legend_crest(c, 1, s=0.92, edge=MAGENTA)
    plaque(c, "Légende I", "Écrit dans les étoiles", c1=MAGENTA, c2=CYAN, chrome_kind="prism", msg_color=CYAN, style="hud")
    birds(c, [("mee-fete", 92, 704, 130, False, -6), ("meo-roi", 448, 704, 130, True, 6)], glow=MAGENTA)
    save(c, "legende-1")
    register("legende-1", "legende", 1, "I", "La Galaxie-ADN",
             "Une galaxie spirale dont le blason est le bulbe : ses deux bras, larges de cent mille années-lumière, sont chacun une double hélice d'ADN de néon, paires de bases allumées, qui s'enroule autour de la photo — 10²¹ m et 10⁻⁹ m dans le même trait. Dans les coins du ciel, deux loupes ouvrent sur l'infime : un atome et un neurone.",
             "pied : Mee (fête) et Meo (roi) au pied de la galaxie", "Écrit dans les étoiles")


ALL = [leg5, leg4, leg3, leg2, leg1]
