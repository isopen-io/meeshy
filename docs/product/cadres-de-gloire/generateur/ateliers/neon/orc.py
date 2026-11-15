"""Atelier « Néon » : ORACLE A, B, C — le ciel s'ouvre, et l'on entrevoit le minuscule."""

import math
import random

from kit import *  # noqa: F401,F403
from cosmos import *  # noqa: F401,F403


def space(card, seed, top="#100630", mid="#070320", bottom="#020108", n=260, clouds=()):
    g = card.grad(nid("sp"), [(0, top), (0.5, mid), (1, bottom)])
    out = [f'<rect width="{W}" height="{H}" fill="{g}"/>']
    for cx, cy, rx, ry, c1, c2, op, s in clouds:
        out.append(nebula_cloud(card, cx, cy, rx, ry, c1, c2, op, seed=s))
    out.append(stardust(seed, n, avoid=None))
    return "".join(out)


def bird_constellation(cx, cy, s, kind="mee"):
    """Une constellation inventée : Mee (houppette en spirale) ou Meo (crête en pointes), ailes ouvertes, en vol."""
    P = lambda x, y: (cx + x * s, cy + y * s)  # noqa: E731
    pts = [P(0, -30), P(0, -14), P(0, 10), P(-9, 40), P(0, 44), P(9, 40),          # 0 tête, 1 cou, 2 corps, 3-5 queue en éventail
           P(-10, -6), P(-34, -28), P(-60, -36), P(-76, -22),                       # 6-9 aile gauche
           P(10, -6), P(34, -28), P(60, -36), P(76, -22),                           # 10-13 aile droite
           P(15, -27)]                                                              # 14 bec
    edges = [(0, 1), (1, 2), (2, 3), (2, 4), (2, 5), (1, 6), (6, 7), (7, 8), (8, 9), (1, 10), (10, 11), (11, 12), (12, 13), (0, 14), (6, 2), (10, 2)]
    if kind == "mee":
        pts += [P(-3, -46), P(6, -56), P(14, -49), P(8, -43)]
        edges += [(0, 15), (15, 16), (16, 17), (17, 18)]
    else:
        pts += [P(-10, -48), P(0, -56), P(10, -48)]
        edges += [(0, 15), (0, 16), (0, 17)]
    sizes = [2.2, 1.1, 2.0, 1.2, 1.4, 1.2, 1.1, 1.4, 1.6, 2.0, 1.1, 1.4, 1.6, 2.0, 1.4] + [1.2] * (len(pts) - 15)
    return pts, edges, sizes


def round_bird_constellation(cx, cy, R, kind="mee"):
    """Mee ou Meo en constellation, tels qu'on les connaît : un corps tout rond, deux petites ailes,
    les yeux et le bec en étoiles, et la houppette en spirale (Mee) ou la crête en trois pointes (Meo)."""
    pts, edges, sizes = [], [], []

    def add(x, y, s=1.3):
        pts.append((x, y))
        sizes.append(s)
        return len(pts) - 1

    ring = [add(cx + R * math.sin(math.radians(a)), cy - R * math.cos(math.radians(a)), 1.5 if a in (0, 180) else 1.2) for a in range(0, 360, 36)]
    edges += [(ring[i], ring[(i + 1) % len(ring)]) for i in range(len(ring))]
    for sgn in (-1, 1):
        a = add(cx + sgn * R * 1.75, cy - R * 0.3, 1.9)
        b = add(cx + sgn * R * 1.5, cy + R * 0.32, 1.3)
        k_up = ring[3] if sgn > 0 else ring[7]
        k_dn = ring[4] if sgn > 0 else ring[6]
        edges += [(k_up, a), (a, b), (b, k_dn)]
    add(cx - R * 0.36, cy - R * 0.22, 1.6)
    add(cx + R * 0.36, cy - R * 0.22, 1.6)
    beak = add(cx, cy + R * 0.12, 1.2)
    for sgn in (-1, 1):
        f0 = add(cx + sgn * R * 0.3, cy + R * 1.3, 1.0)
        edges.append((ring[5] if sgn > 0 else ring[5], f0))
    top = ring[0]
    if kind == "mee":
        c1 = add(cx - R * 0.12, cy - R * 1.5, 1.3)
        c2 = add(cx + R * 0.32, cy - R * 1.86, 1.4)
        c3 = add(cx + R * 0.58, cy - R * 1.5, 1.2)
        c4 = add(cx + R * 0.3, cy - R * 1.3, 1.0)
        edges += [(top, c1), (c1, c2), (c2, c3), (c3, c4)]
    else:
        for dx, h in ((-0.42, 1.62), (0.0, 1.85), (0.42, 1.62)):
            k = add(cx + R * dx, cy - R * h, 1.4)
            edges.append((top, k))
    return pts, edges, sizes


# ---------------------------------------------------------------- A : la grille céleste

def orc_a():
    c = start("ra", "#22184A", "#0A0718", "#9FE8FF")
    win = rrect_d(86, 266, 454, 714, 14)
    m = window(c, win)
    body = [space(c, 71, clouds=((120, 160, 220, 140, "#5A1A9A", "#1A0840", 0.6, 3), (430, 130, 220, 150, "#16508A", "#0A1A40", 0.55, 8)))]
    body.append(galaxy(470, 300, 46, "#BFE9FF", 2, 0.4, 0.6, 3, 160))
    body.append(grid(c, 600, CYAN, gap=42, nh=12, depth=0.55, w=1.2, halo=4))
    body.append(glow_spot(c, 270, 960, 360, 180, VIOLET, 0.5))
    c.add(f'<g mask="{m}">{"".join(body)}</g>')
    # les figures fantômes, comme dans les vieux atlas célestes, puis les étoiles de Mee et Meo
    for x, col in ((104, MAGENTA), (436, CYAN)):
        c.add(f'<circle cx="{x}" cy="150" r="40" fill="{col}" opacity="0.13" filter="{ublur(c, 6)}"/>')
        c.add(f'<ellipse cx="{x - 52}" cy="150" rx="22" ry="12" fill="{col}" opacity="0.08" filter="{ublur(c, 6)}"/><ellipse cx="{x + 52}" cy="150" rx="22" ry="12" fill="{col}" opacity="0.08" filter="{ublur(c, 6)}"/>')
    p, e, s = round_bird_constellation(104, 150, 36, "mee")
    c.add(constellation(c, p, e, MAGENTA, 1.2, 5, s))
    p, e, s = round_bird_constellation(436, 150, 36, "meo")
    c.add(constellation(c, p, e, CYAN, 1.2, 5, s))
    c.add(label(104, 226, "MEE", light(MAGENTA, 0.4), 7.5, "middle", 0.85, 3))
    c.add(label(436, 226, "MEO", light(CYAN, 0.4), 7.5, "middle", 0.85, 3))
    c.add(planet(c, 34, 46, 12, "#FF9BD0", "#5A0F45", ring=YELLOW, ring_rx=26))
    # une comète, et la pluie d'étoiles filantes sur le flanc gauche
    comet = lgrad(c, "comet", [(0, "#FFFFFF", 0), (1, "#BFF5FF", 0.95)], user=(360, 20, 500, 70))
    c.add(f'<path d="M360 20 L500 66 L496 72Z" fill="{comet}" filter="{ublur(c, 1.2)}"/>' + star(c, 498, 69, 2.2, "#BFF5FF"))
    rnd = random.Random(5)
    meteors = "".join(f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(x + 16)}" y2="{f(y + 9)}"/>' for x, y in ((rnd.uniform(4, 60), rnd.uniform(560, 700)) for _ in range(5)))
    c.add(tube(c, meteors, "#BFF5FF", 0.7, 3, op=0.8))
    # sur les flancs : un croissant de lune, et l'amas des Pléiades
    c.add(glow_spot(c, 42, 340, 40, 40, "#BFE9FF", 0.35))
    c.add(f'<path d="M52 312 A30 30 0 1 0 52 368 A24 24 0 1 1 52 312Z" fill="#BFE9FF" opacity="0.18"/>')
    c.add(tube(c, '<path d="M52 312 A30 30 0 1 0 52 368 A24 24 0 1 1 52 312Z"/>', "#BFE9FF", 1.3, 5))
    ple = [(486, 560), (500, 552), (512, 566), (496, 574), (522, 548), (506, 588), (480, 582)]
    c.add(glow_spot(c, 500, 568, 44, 36, "#9FC8FF", 0.4))
    c.add("".join(star(c, x, y, r, "#D6ECFF") for (x, y), r in zip(ple, (1.6, 1.9, 1.5, 1.3, 1.4, 1.2, 1.1))))
    c.add(fine('<path d="M486 560 L500 552 L512 566 L496 574Z M512 566 L522 548"/>', "#BFE9FF", 0.6, 0.45, "2 2"))
    c.add(label(500, 610, "PLÉIADES", light(CYAN, 0.5), 6.5, "middle", 0.8, 1.6))
    # le réticule du télescope autour du blason
    c.add(fine(reticle_geo(270, 150, 96, 4, 7) + f'<circle cx="270" cy="150" r="108"/>', "#BFE9FF", 0.9, 0.55))
    c.add(label(270, 36, "AR 04h 47m · DÉC +22°", light(CYAN, 0.5), 7, "middle", 0.75, 1.6))
    # les loupes du minuscule
    c.add(spill(c, win, CYAN, 26, 0.3))
    c.add(chrome_stroke(c, rrect_d(80, 260, 460, 720, 18), 5, "ice"))
    c.add(tube(c, f'<path d="{rrect_d(88, 268, 452, 712, 12)}"/>', CYAN, 1.8, 6))
    flake = tube(c, snowflake_geo(46, 470, 26, 0), CYAN, 1.1, 3)
    c.add(loupe(c, 46, 470, 34, CYAN, flake, "FLOCON\n2 mm"))
    quartz = tube(c, crystal_geo(494, 444, 44, 16, 4, 3), VIOLET, 1.1, 3)
    c.add(loupe(c, 494, 420, 34, VIOLET, quartz, "QUARTZ\n1 mm"))
    c.add(glow_spot(c, 270, 150, 110, 110, "#BFE9FF", 0.45))
    crest(c, 270, 150, 0.9, "silver", division=None, ink="#4A5468")
    plaque(c, "Oracle", None, c1=CYAN, c2=MAGENTA, chrome_kind="ice")
    birds(c, [("mee-montee-au-ciel", 94, 704, 130, False, -4), ("meo-love", 446, 704, 130, True, 4)], glow=CYAN)
    save(c, "oracle-a")
    register("oracle-a", "oracle", None, "A", "La Grille céleste",
             "La grille de lumière file sous la photo jusqu'à l'horizon, et au-dessus le ciel s'est ouvert : deux constellations inventées y dessinent Mee et Meo — le corps rond, les petites ailes, la houppette en spirale et la crête à trois pointes — dans le réticule d'un télescope, et une comète passe ; un croissant de lune et les Pléiades veillent sur les flancs ; et dans les loupes du HUD, on entrevoit le minuscule — un flocon de glace à six branches et une druse de quartz.",
             "pied : Mee (montée au ciel) et Meo (love) sur la grille", None)


# ---------------------------------------------------------------- B : le cristal-oracle

def honeycomb_geo(x0, y0, x1, y1, s):
    out = []
    h = s * math.sqrt(3)
    row = 0
    y = y0
    while y < y1 + s:
        off = (h / 2) if row % 2 else 0
        x = x0 + off
        while x < x1 + h:
            pts = hexagon_pts(x, y, s, 0)
            out.append("<path d=\"M" + " L".join(f"{f(a)} {f(b)}" for a, b in pts[:4]) + '"/>')
            x += h
        y += s * 1.5
        row += 1
    return "".join(out)


def orc_b():
    c = start("rb", "#2A1846", "#0C0718", "#D9B3FF")
    win = rrect_d(86, 266, 454, 714, 14)
    m = window(c, win)
    body = [space(c, 81, "#160838", "#0A0424", clouds=((270, 120, 300, 170, "#7A2AC8", "#2A0C5A", 0.6, 5), (60, 700, 160, 220, "#B02A8A", "#3A0838", 0.4, 11), (480, 640, 160, 220, "#2A6AC8", "#0A2040", 0.4, 13)))]
    lattice = honeycomb_geo(-10, 260, 90, 740, 13) + honeycomb_geo(450, 260, 560, 740, 13)
    fm = fade_mask(c, 270, 740, top_op=0.9, bot_op=0.1)
    body.append(f'<g mask="{fm}">{tube(c, lattice, VIOLET, 0.8, 3, op=0.8)}</g>')
    body.append(tube(c, flower_geo(270, 150, 30, 2), GOLD, 0.8, 3, op=0.55))
    body.append(planet(c, 470, 70, 16, "#7FEFFF", "#0D3A6A", ring=MAGENTA, ring_rx=34))
    body.append(planet(c, 64, 92, 10, "#FFD27A", "#7A3A0A"))
    body.append(tube(c, crystal_geo(58, 726, 120, 30, 5, 2), VIOLET, 1.5, 6))
    body.append(tube(c, crystal_geo(486, 726, 104, 28, 4, 9), MAGENTA, 1.4, 6))
    c.add(f'<g mask="{m}">{"".join(body)}</g>')
    fg, bg, verts = icosa_geo(270, 150, 86, 0.42, 0.3, 0.1)
    c.add(tube(c, bg, CYAN, 0.9, 3, op=0.55))
    c.add(glow_spot(c, 270, 150, 120, 120, VIOLET, 0.6))
    c.add(spill(c, win, VIOLET, 26, 0.32))
    c.add(chrome_stroke(c, rrect_d(80, 260, 460, 720, 18), 5, "cool"))
    c.add(tube(c, f'<path d="{rrect_d(88, 268, 452, 712, 12)}"/>', VIOLET, 1.8, 6))
    crest(c, 270, 152, 0.86, "silver", division=None, ink="#4A5468")
    c.add(tube(c, fg, CYAN, 1.3, 5))
    c.add("".join(bulb(c, x, y, 1.6, "#BFF5FF") for x, y, z in verts if z > -0.3))
    c.add(loupe(c, 46, 404, 33, YELLOW, pollen(c, 46, 404, 15, YELLOW, 24, seed=6), "POLLEN\n30 µm"))
    c.add(loupe(c, 494, 404, 33, LIME, cell(c, 494, 404, 23, LIME, MAGENTA, seed=4), "CELLULE\n20 µm"))
    plaque(c, "Oracle", "Le futur est à nous", c1=VIOLET, c2=CYAN, chrome_kind="ice", msg_color=PINK)
    c.add(f'<ellipse cx="466" cy="676" rx="64" ry="52" fill="{VIOLET}" opacity="0.32" filter="{ublur(c, 12)}"/>')
    bird(c, "duo-meo-selfie", 466, 668, 150, flip=True)
    save(c, "oracle-b")
    register("oracle-b", "oracle", None, "B", "Le Cristal-Oracle",
             "Le blason flotte dans un icosaèdre holographique, sur une rosace de cercles entrelacés (la géométrie sacrée) ; un réseau cristallin en nid d'abeille monte le long des bords, des améthystes de néon poussent au pied du cadre, et les loupes révèlent un grain de pollen hérissé et une cellule vivante.",
             "selfie : Mee et Meo se prennent en photo dans le coin", "Le futur est à nous")


# ---------------------------------------------------------------- C : la lune de silicium

def si_lattice(cx, cy, s, n=3):
    geo, dots = [], []
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            x = cx + i * s + (j % 2) * s / 2
            y = cy + j * s * 0.86
            dots.append((x, y))
            geo.append(f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(x + s)}" y2="{f(y)}"/><line x1="{f(x)}" y1="{f(y)}" x2="{f(x + s / 2)}" y2="{f(y + s * 0.86)}"/>')
    return "".join(geo), dots


def orc_c():
    c = start("rc", "#20183E", "#0A0716", "#BFE9FF")
    win = rrect_d(86, 266, 454, 714, 14)
    m = window(c, win)
    body = [space(c, 91, "#0A0526", "#060318", clouds=((90, 80, 160, 100, "#3A1A8A", "#0A0830", 0.5, 4),))]
    body.append(glow_spot(c, 270, 150, 230, 230, "#9FE8FF", 0.35))
    # la lune-circuit
    clip = nid("moon")
    c.def_once(clip, f'<clipPath id="{c.id(clip)}"><circle cx="270" cy="150" r="128"/></clipPath>')
    mg = c.rgrad("moon", [(0, "#2A2A52", 1), (0.8, "#141238", 1), (1, "#0A0A24", 1)], 0.42, 0.38, 0.7)
    body.append(f'<circle cx="270" cy="150" r="128" fill="{mg}"/>')
    lane_geo = []
    rnd = random.Random(4)
    moon_inner = [circuit(c, 3, 140, 400, 22, 280, 14, CYAN, 0.9, 3, op=0.75), circuit(c, 8, 22, 280, 140, 400, 12, GOLD, 0.8, 2, horizontal=True, op=0.6)]
    craters = "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="#0A0A24" opacity="0.5"/>' for x, y, r in ((210, 92, 16), (330, 210, 22), (190, 210, 10), (350, 86, 9)))
    crater_rings = "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}"/>' for x, y, r in ((210, 92, 16), (330, 210, 22), (190, 210, 10), (350, 86, 9)))
    body.append(f'<g clip-path="url(#{c.id(clip)})">{craters}{"".join(moon_inner)}{fine(crater_rings, "#BFE9FF", 1, 0.6)}</g>')
    body.append(tube(c, '<circle cx="270" cy="150" r="128"/>', "#BFE9FF", 1.6, 9))
    # pistes qui descendent de la lune le long des bords
    body.append(circuit(c, 12, 6, 80, 270, 724, 6, CYAN, 1.0, 3))
    body.append(circuit(c, 13, 460, 534, 270, 724, 6, MAGENTA, 1.0, 3))
    # la ville au pied de la nuit
    sky = skyline(c, 41, -10, 550, 728, 20, 90, body="#0A0620", rim=CYAN, density=0.3)
    body.append(sky)
    body.append(f'<rect y="728" width="{W}" height="232" fill="{c.grad("wet", [(0, "#0A0620"), (1, "#020106")])}"/>')
    body.append(reflect(c, sky, 728, 0.6, 2.2, 0.45, 900))
    body.append(ripples(31, 732, 958, "#020106", 40, 0.7))
    c.add(f'<g mask="{m}">{"".join(body)}</g>')
    p = [(28, 300 - 40), (60, 230), (40, 180), (90, 140), (130, 60)]
    c.add(constellation(c, [(130, 40), (100, 76), (60, 70), (36, 110), (70, 128)], [(0, 1), (1, 2), (2, 3), (3, 4), (4, 1)], VIOLET, 1.1, 4))
    c.add(constellation(c, [(420, 36), (456, 58), (500, 44), (510, 92), (470, 110)], [(0, 1), (1, 2), (2, 3), (3, 4), (4, 1)], PINK, 1.1, 4))
    c.add(spill(c, win, CYAN, 26, 0.3))
    c.add(chrome_stroke(c, rrect_d(80, 260, 460, 720, 18), 5, "ice"))
    c.add(tube(c, f'<path d="{rrect_d(88, 268, 452, 712, 12)}"/>', MAGENTA, 1.8, 6))
    geo, dots = si_lattice(46, 470, 12, 3)
    si = fine(geo, CYAN, 0.9, 0.85) + "".join(bulb(c, x, y, 1.6, "#BFF5FF") for x, y in dots)
    c.add(loupe(c, 46, 470, 34, CYAN, si, "SILICIUM\n0,5 nm"))
    gates = "".join(f'<rect x="{f(494 - 26 + i * 9)}" y="{f(470 - 26 + j * 9)}" width="5" height="5" fill="none" stroke="{GOLD}" stroke-width="0.8"/>' for i in range(6) for j in range(6))
    gates += fine("".join(f'<line x1="{f(464 + i * 9)}" y1="438" x2="{f(464 + i * 9)}" y2="502"/>' for i in range(8)), MAGENTA, 0.6, 0.6)
    c.add(loupe(c, 494, 470, 34, GOLD, gates, "TRANSISTOR\n3 nm"))
    c.add(chip(c, 270, 152, 96, "#0E0A26", GOLD))
    crest(c, 270, 150, 0.8, "silver", division=None, ink="#4A5468")
    plaque(c, "Oracle", "Jusqu'à la lune", c1=CYAN, c2=GOLD, chrome_kind="ice", msg_color=CYAN, style="hud")
    birds(c, [("mee-amoureuse", 92, 704, 128, False, -6), ("meo-salut", 448, 704, 128, True, 6)], glow="#9FE8FF")
    save(c, "oracle-c")
    register("oracle-c", "oracle", None, "C", "La Lune de silicium",
             "Une pleine lune gravée comme une galette de silicium : ses cratères sont des vias, ses mers des pistes de cuivre, et le blason y est posé comme une puce ; les circuits en descendent le long des bords jusqu'à la ville mouillée, et deux loupes montrent le réseau d'atomes de silicium et la grille des transistors.",
             "pied : Mee (amoureuse) et Meo (salut) au bord de la ville", "Jusqu'à la lune")


ALL = [orc_a, orc_b, orc_c]
