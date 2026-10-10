"""Afrique éternelle · Savane - LÉGENDE V → I : l'immense et l'infime tissés avec la savane (obsidienne et or).

V  galaxie et Voie lactée  / molécule d'ADN
IV nébuleuse et amas      / atome (les perles deviennent électrons) et molécules
III supernova              / orbitales et ondes quantiques
II trou noir               / cellules (la robe de la girafe), noyau atomique et quarks
I  quasar et toile cosmique / tout l'éventail : ADN, neurones, atome, quarks
"""

from common import *  # noqa: F401,F403
from motifs import _taper  # noqa: F401


def glow_dna(c, name, x, y0, y1, amp, period, c1="#9FE8FF", c2="#FFB0E0", w=2.6, phase=0.0, op=1.0):
    helix = dna(x, y0, y1, amp, period, c1, c2, w=w, phase=phase, op=op)
    return f'<g opacity="0.55" filter="{ublur(c, name, 3)}">{helix}</g>{helix}'


def bead_atom(c, cx, cy, orbits, n=72, beads=3.2, phase=0.0, electron="#FFFFFF"):
    """Les rangs de perles maasaï en orbite autour du blason - chaque rang porte son électron de lumière."""
    back, front = [], []
    for k, (rx, ry, rot) in enumerate(orbits):
        for i in range(n):
            a = 2 * math.pi * i / n
            x, y = rx * math.cos(a), ry * math.sin(a)
            xr = cx + x * math.cos(math.radians(rot)) - y * math.sin(math.radians(rot))
            yr = cy + x * math.sin(math.radians(rot)) + y * math.cos(math.radians(rot))
            col = MAASAI[(i // 4 + k * 2) % len(MAASAI)]
            m_ = f'<circle cx="{f(xr)}" cy="{f(yr)}" r="{f(beads)}" fill="{col}"/><circle cx="{f(xr - 0.9)}" cy="{f(yr - 1)}" r="{f(beads * 0.33)}" fill="#FFFFFF" opacity="0.6"/>'
            (back if math.sin(a) < 0 else front).append(m_)
        a = phase + 1.1 + k * 2.2
        x, y = rx * math.cos(a), ry * math.sin(a)
        xr = cx + x * math.cos(math.radians(rot)) - y * math.sin(math.radians(rot))
        yr = cy + x * math.sin(math.radians(rot)) + y * math.cos(math.radians(rot))
        e = (f'<circle cx="{f(xr)}" cy="{f(yr)}" r="13" fill="{c.rgrad("el", [(0, electron, 0.95), (0.3, "#9FE8FF", 0.5), (1, "#9FE8FF", 0)])}"/>'
             f'<circle cx="{f(xr)}" cy="{f(yr)}" r="3.6" fill="#FFFFFF"/>' + sparkle(xr, yr, 9, "#FFFFFF", 0.9))
        (back if math.sin(a) < 0 else front).append(e)
    return "".join(back), "".join(front)


# =============================================================== V

def legende_5():
    c = Card("l5")
    photo(c, "#262446", "#0A0A16", "#C8B8FF", glow=0.2)
    win = rrect(66, 250, 474, 704, 20)
    m = deco_mask(c, win)
    sky = c.grad("sky", [(0, "#020210"), (0.4, "#0C0C34"), (0.66, "#241A54"), (0.76, "#5A2E6A"), (0.818, "#E07A4A"), (0.82, "#07040A"), (1, "#040206")])
    d = [f'<rect width="{W}" height="{H}" fill="{sky}"/>']
    d.append(star_field(11, 800, (0, 0, 540, 790)))
    d.append(nebula_cloud(c, "nl", 30, 520, 110, 260, "#FF6FA8", "#5A1A8A", 0.8, "0.013", 14, a=2.4, b=-0.7))
    d.append(nebula_cloud(c, "nr", 510, 520, 110, 260, "#6EA8FF", "#2A1A8A", 0.8, "0.013", 15, a=2.4, b=-0.7))
    d.append(milky_way(c, "mw", (-50, 700), (270, -300), (590, 700), 104, seed=3, n=2600))
    d.append(nebula_cloud(c, "lag", 400, 150, 120, 80, "#FF6FA8", "#9A2A8A", 0.9, "0.016", 4, a=2.2, b=-0.55))
    d.append(spiral_galaxy(c, "g1", 104, 70, 40, rot=1.2, tilt=0.5, seed=4))
    d.append(glow_dna(c, "dnaL", 34, 716, 262, 13, 92, phase=0.0))
    d.append(glow_dna(c, "dnaR", 506, 716, 262, 13, 92, "#FFE6A8", "#9FE8FF", phase=1.6))
    masked(c, m, d)
    c.add(light_grade(c, win, "#B8A0FF", 0.5, 0.0, 0.22))
    c.add(horizon_glow(c, win, 620, 704, "#E07A4A", 0.6))
    c.add(inner_shadow(c, win))
    c.add(gold_rim(c, win, GOLD, 3.5))
    road = c.grad("road", [(0, "#E8B07A"), (1, "#3A2010")], 0, 0, 0, 1)
    c.add('<path d="M-10 990 L250 786 L290 786 L550 990 Z" fill="#06030A"/>')
    c.add(f'<path d="M120 990 L262 786 L278 786 L420 990 Z" fill="{road}" opacity="0.5"/>')
    for i, (x, h, w) in enumerate(((238, 30, 5), (218, 42, 7), (190, 58, 10), (148, 82, 14), (84, 112, 19), (302, 28, 5), (322, 40, 7), (350, 54, 9), (392, 78, 13), (454, 108, 18))):
        c.add(grandidieri(x, 787 + (h - 30) * 0.42, h, w, "#06030A", seed=i + 3))
    c.add(f'<rect x="0" y="788" width="{W}" height="200" fill="#06030A" opacity="0.6"/>')
    c.add(outer_frame(c, GOLD, 10, 3))
    for x, y in ((24, 24), (516, 24), (24, 936), (516, 936)):
        c.add(f'<path d="M{x} {y - 9} L{x + 9} {y} L{x} {y + 9} L{x - 9} {y} Z" fill="{GOLD[1]}"/>')
    c.add(crest_halo(c, 270, 124, 110, "#FFE6C0", 0.4))
    legende_crest(c, 270, 124, 0.95, 5)
    bird(c, "duo-main-dans-la-main", 270, 744, 120)
    legende_plaque(c, "Légende V", None, 800)
    save(c, "legende-5", "Légende", 5, "V", "L'Allée des baobabs",
         "L'arche de la Voie lactée se courbe au-dessus de l'Allée des baobabs de Morondava (Madagascar), où les baobabs de Grandidier montent comme des colonnes vers les étoiles. "
         "Sur les deux bords, l'infiniment petit leur répond : deux doubles hélices d'ADN, le plan de chaque arbre et de chaque étoile vivante, montent de l'allée jusqu'au ciel.",
         "duo main dans la main, au bout de l'allée", None)


# =============================================================== IV

def legende_4():
    c = Card("l4")
    photo(c, "#24304A", "#0A0C16", "#9EE8E0", glow=0.2)
    win = arch(62, 478, 410, 256, 724)
    m = deco_mask(c, win)
    sky = c.grad("sky", [(0, "#02040E"), (0.4, "#08163A"), (0.66, "#123A5A"), (0.76, "#3A6A7A"), (0.8, "#FFB070"), (0.802, "#05080A"), (1, "#030405")])
    d = [f'<rect width="{W}" height="{H}" fill="{sky}"/>']
    d.append(nebula_cloud(c, "n1", 430, 160, 210, 170, "#3FD0C9", "#1A4A8A", 0.85, "0.011", 3, a=2.4, b=-0.7))
    d.append(nebula_cloud(c, "n2", 90, 420, 150, 260, "#FF6FB1", "#5A2A9A", 0.75, "0.013", 8, a=2.4, b=-0.75))
    d.append(star_field(21, 800, (0, 0, 540, 780)))
    d.append(cluster(5, 70, 120, 34, 220))
    d.append(spiral_galaxy(c, "g1", 486, 470, 40, rot=0.3, tilt=0.6, seed=9, color="#E0F0FF"))
    d.append(constellation(c, "ce", "elephant", 318, 236, 1.05, "#E8FFF8", "#BFFFF0", ghost=0.07, line_op=0.6))
    d.append(f'<g opacity="0.9">{molecule(40, 330, 0.95, rot=20, seed=3, rings=2)}</g>')
    d.append(f'<g opacity="0.9">{molecule(500, 600, 0.85, rot=-30, seed=6, rings=3)}</g>')
    d.append(dust(4, 90, (0, 0, 540, 780), "#BFFFF0", 0.4, 1.4))
    masked(c, m, d)
    c.add(light_grade(c, win, "#3FD0C9", 0.5, 0.0, 0.2))
    c.add(horizon_glow(c, win, 640, 724, "#FFB070", 0.65))
    c.add(inner_shadow(c, win))
    c.add(gold_rim(c, win, GOLD, 3.5))
    c.add(f'<rect x="0" y="768" width="{W}" height="220" fill="#05080A"/>')
    for x, s_ in ((404, 0.36), (338, 0.4), (288, 0.21), (254, 0.37), (186, 0.33)):
        c.add(place(elephant("#05080A", "#BFFFF0", tusk="#E8F4F0"), x, 770, s_, flip=True))
    c.add(grass(0, 540, 771, 3, 14, "#05080A", seed=6, n=200, width=1.2))
    back, front = bead_atom(c, 270, 126, ((158, 36, -18), (146, 30, 22), (110, 62, 90)), n=70, beads=3.1, phase=0.4)
    c.add(back)
    c.add(nucleus(c, "nuc", 270, 126, 44, 18, seed=4, glow="#BFFFF0"))
    c.add(outer_frame(c, GOLD, 10, 3))
    legende_crest(c, 270, 126, 0.86, 4)
    c.add(front)
    mee_meo(c, "pied", "mee-amoureuse", "meo-trophee")
    legende_plaque(c, "Légende IV", None, 784)
    save(c, "legende-4", "Légende", 4, "IV", "L'Atome des éléphants",
         "Un éléphant d'étoiles s'élève dans une nébuleuse turquoise pendant que la harde marche sur l'horizon. Autour du blason, trois rangs de perles maasaï sont devenus les orbites d'un atome : "
         "le blason en est le noyau, chaque rang porte son électron de lumière, et deux molécules flottent comme des constellations.",
         "pied (Mee amoureuse, Meo trophée)", None)


# =============================================================== III

def legende_3():
    c = Card("l3")
    photo(c, "#2E2448", "#0C0A16", "#FFB8D8", glow=0.22)
    win = oval(270, 490, 204, 252)
    m = deco_mask(c, win)
    sky = c.grad("sky", [(0, "#06020E"), (0.35, "#1A0A34"), (0.62, "#3A1450"), (0.76, "#7A2A5A"), (0.8, "#FF8A4A"), (0.802, "#07030A"), (1, "#040206")])
    d = [f'<rect width="{W}" height="{H}" fill="{sky}"/>']
    d.append(nebula_cloud(c, "n1", 270, 140, 300, 200, "#FF6A3D", "#7A3CFF", 0.7, "0.01", 12, a=2.2, b=-0.6))
    d.append(star_field(31, 800, (0, 0, 540, 790)))
    d.append(waves(270, 128, 120, 9, 34, "#FFD0A0", 1.4, 0.55))
    d.append(supernova(c, "sn", 270, 128, 96))
    d.append(constellation(c, "cl", "lion", 10, 304, 0.94, "#FFE6C8", "#FFD0A0", ghost=0.08, line_op=0.65))
    d.append(spiral_galaxy(c, "g1", 470, 290, 42, rot=2.2, tilt=0.55, seed=12, color="#FFE0F0", arm_tint="#FF9AD0"))
    d.append(nebula_cloud(c, "n2", 470, 640, 90, 160, "#7A3CFF", "#2A1A6A", 0.7, "0.02", 5))
    for x, ph in ((30, 0.0), (510, 1.4)):
        for k, (amp, col, op) in enumerate(((16, "#FFD0A0", 0.9), (11, "#9FE8FF", 0.7))):
            d.append(wave_packet(340, 700, x, amp, 0.32 + k * 0.08, 90, col, 1.4, op, vertical=True, phase=ph + k))
    masked(c, m, d)
    c.add(light_grade(c, win, "#FF9A7A", 0.5, 0.0, 0.25))
    c.add(horizon_glow(c, win, 650, 742, "#FF8A4A", 0.6))
    c.add(inner_shadow(c, win))
    c.add(gold_rim(c, win, GOLD, 4))
    for i, a in enumerate(range(45, 360, 45)):
        x, y = 270 + 206 * math.sin(math.radians(a)), 490 - 254 * math.cos(math.radians(a))
        if a in (45, 135, 225, 315):
            kind = "d" if a in (45, 315) else "f"
            c.add(orbital(c, f"orb{a}", x, y, 22, kind, rot=a))
        else:
            c.add(f'<g filter="{bevel(c, "ns-bv", 0.8, 2)}">{nsoromma(x, y, 0.42, GOLD[0])}</g>')
    c.add(f'<rect x="0" y="768" width="{W}" height="220" fill="#07030A"/>')
    c.add(kopje(452, 772, 150, 40, "#07030A", seed=5))
    c.add(place(lion("#07030A", "#FFB08A"), 520, 744, 0.72, flip=True))
    c.add(acacia(70, 772, 62, "#07030A", seed=8, width=150))
    c.add(grass(0, 540, 773, 3, 16, "#07030A", seed=6, n=200, width=1.2))
    c.add(outer_frame(c, GOLD, 10, 3))
    legende_crest(c, 270, 128, 0.92, 3)
    birds(c, [("mee-jackpot", 48, 470, 118, False, 14), ("meo-muscles", 492, 500, 118, True, -14)])
    legende_plaque(c, "Légende III", "Pour toi, maman", 786)
    save(c, "legende-3", "Légende", 3, "III", "Le Lion de la supernova",
         "Une supernova éclate derrière le blason et ses ondes de choc balaient le ciel ; le lion d'étoiles s'y dessine pendant que son double de chair le regarde du haut d'un kopje. "
         "Autour de la photo, les Nsoromma d'or des Akan, « l'enfant des cieux », alternent avec les orbitales d'un électron, et sur les bords l'électron devient onde.",
         "côtés (Mee jackpot, Meo muscles)", "Pour toi, maman")


# =============================================================== II

def legende_2():
    c = Card("l2")
    photo(c, "#302438", "#0C0A12", "#FFC890", glow=0.22)
    win = rrect(72, 252, 468, 722, 20)
    m = deco_mask(c, win)
    sky = c.grad("sky", [(0, "#03020A"), (0.36, "#140A2A"), (0.62, "#2A1240"), (0.76, "#6A2A4A"), (0.8, "#FFA050"), (0.802, "#07040A"), (1, "#040206")])
    d = [f'<rect width="{W}" height="{H}" fill="{sky}"/>']
    d.append(nebula_cloud(c, "n1", 100, 300, 140, 220, "#FF6FB1", "#5A1A8A", 0.7, "0.014", 3))
    d.append(nebula_cloud(c, "n2", 470, 520, 120, 240, "#FFB347", "#8A2A3A", 0.55, "0.014", 7))
    d.append(star_field(41, 900, (0, 0, 540, 790)))
    d.append(spiral_galaxy(c, "g1", 64, 70, 40, rot=0.8, tilt=0.45, seed=21))
    d.append(spiral_galaxy(c, "g2", 476, 60, 30, rot=2.0, tilt=0.7, seed=22, color="#FFE0C0", arm_tint="#FFB070"))
    d.append(black_hole(c, "bh", 270, 74, 32, tilt=0.24, disk=4.2))
    for r_, a0, a1 in ((150, 200, 250), (176, 110, 150), (164, 285, 320)):
        x0_, y0_ = pt(270, 74, r_, a0)
        x1_, y1_ = pt(270, 74, r_, a1)
        d.append(f'<path d="M{f(x0_)} {f(y0_)} A{r_} {r_} 0 0 1 {f(x1_)} {f(y1_)}" fill="none" stroke="#CFE0FF" stroke-width="2.2" opacity="0.55" filter="{c.blur("arc", 1)}"/>')
    masked(c, m, d)
    c.add(light_grade(c, win, "#FFB070", 0.5, 0.0, 0.25))
    c.add(horizon_glow(c, win, 640, 722, "#FFA050", 0.65))
    c.add(inner_shadow(c, win))
    for x in (34, 506):
        c.def_once(f"colc{x}", f'<clipPath id="{c.id(f"colc{x}")}"><rect x="{x - 17}" y="310" width="34" height="400" rx="6"/></clipPath>')
        c.add(f'<rect x="{x - 17}" y="310" width="34" height="400" rx="6" fill="#F6E3B8"/>')
        c.add(f'<g clip-path="url(#{c.id(f"colc{x}")})">{tissue(c, f"ts{x}", (x - 17, 310, x + 17, 710), 26, seed=x, fill=("#E8A040", "#9A4A14"), membrane="#FFF4D8", nucleus_c="#4A1A06", gap=0.84)}</g>')
        c.add(f'<rect x="{x - 17}" y="310" width="34" height="400" rx="6" fill="none" stroke="{GOLD[1]}" stroke-width="1.6"/>')
    c.add(gold_rim(c, win, GOLD, 4))
    c.add(lens(c, "lnu", 34, 276, 24, nucleus(c, "nu2", 34, 276, 26, 16, seed=8, glow="#FFB48A"), GOLD))
    c.add(lens(c, "lqk", 506, 276, 24, quarks(c, "qk", 506, 276, 15), GOLD))
    c.add(constellation(c, "cg", "giraffe", 402, 244, 0.7, "#FFF0D0", "#FFE0B0", ghost=0.07, line_op=0.75, star_r=1.6))
    c.add(f'<rect x="0" y="768" width="{W}" height="220" fill="#07040A"/>')
    c.add(acacia(90, 770, 56, "#07040A", seed=3, width=150))
    c.add(place(giraffe("#07040A", "#FFB070"), 150, 770, 0.3))
    c.add(place(giraffe("#07040A", "#FFB070"), 380, 770, 0.24, flip=True))
    c.add(acacia(470, 770, 40, "#07040A", seed=9, width=110))
    c.add(grass(0, 540, 771, 3, 14, "#07040A", seed=16, n=200, width=1.2))
    c.add(outer_frame(c, GOLD, 10, 3))
    legende_crest(c, 270, 158, 0.8, 2)
    legende_plaque(c, "Légende II", None, 786)
    mee_meo(c, "ruban", "mee-bisou-vole", "meo-cool")
    save(c, "legende-2", "Légende", 2, "II", "Le Puits et le Noyau",
         "Au zénith, un trou noir - l'objet le plus dense du ciel - courbe en arcs la lumière des galaxies lointaines, et une girafe d'étoiles tend le cou vers lui. "
         "Sur les montants, la robe de la girafe se révèle tissu de cellules ; à leur sommet, deux lentilles d'or montrent le plus dense de la matière : un noyau atomique et les trois quarks d'un proton.",
         "ruban (Mee bisou volé, Meo cool)", None)


# =============================================================== I

def legende_1():
    c = Card("l1")
    photo(c, "#2A2244", "#0A0812", "#FFD0A0", glow=0.22)
    win = rrect(70, 254, 470, 722, 20)
    m = deco_mask(c, win)
    sky = c.grad("sky", [(0, "#03020C"), (0.3, "#120A30"), (0.6, "#2A1250"), (0.76, "#6A2A5A"), (0.8, "#FFB060"), (0.802, "#06030A"), (1, "#030206")])
    d = [f'<rect width="{W}" height="{H}" fill="{sky}"/>']
    d.append(nebula_cloud(c, "n1", 420, 200, 220, 190, "#3FD0C9", "#1A3A8A", 0.7, "0.011", 13, a=2.4, b=-0.7))
    d.append(nebula_cloud(c, "n2", 90, 300, 170, 240, "#FF6FB1", "#6A1A9A", 0.75, "0.012", 15, a=2.4, b=-0.7))
    d.append(nebula_cloud(c, "n3", 270, 40, 260, 90, "#FFD36E", "#C2410C", 0.55, "0.016", 17))
    d.append(star_field(51, 1000, (0, 0, 540, 790)))
    d.append(cosmic_web(c, "cw", (12, 12, 210, 220), 11, seed=4, op=0.75))
    d.append(quasar(c, "q", 452, 64, 230, -28, "#BFE6FF"))
    d.append(spiral_galaxy(c, "g2", 500, 300, 30, rot=1.4, tilt=0.4, seed=32, color="#FFE0F0", arm_tint="#FF9AD0"))
    d.append(supernova(c, "sn", 48, 640, 40, c2="#FF6FB1", c3="#3FD0C9"))
    d.append(constellation(c, "ce", "elephant", 304, 248, 0.82, "#E8FFF8", "#BFFFF0", ghost=0.06, line_op=0.6, star_r=1.4))
    d.append(glow_dna(c, "dna", 32, 300, 590, 12, 84, phase=0.6))
    d.append(neuron(c, "ne1", 504, 384, 0.95, seed=3, axon_angle=180, axon_len=96))
    d.append(neuron(c, "ne2", 510, 560, 0.8, seed=6, axon_angle=200, axon_len=70, color="#FFD0F0", glow="#FF8FD0"))
    d.append(dust(8, 140, (0, 0, 540, 780), "#FFE6B0", 0.4, 1.5))
    masked(c, m, d)
    c.add(light_grade(c, win, "#C8A0FF", 0.5, 0.0, 0.24))
    c.add(horizon_glow(c, win, 640, 722, "#FFB060", 0.65))
    c.add(inner_shadow(c, win))
    c.add(gold_rim(c, win, GOLD, 5))
    c.add(f'<rect x="0" y="768" width="{W}" height="220" fill="#06030A"/>')
    c.add(baobab(60, 772, 110, "#06030A", seed=7))
    for x, s_ in ((470, 0.3), (430, 0.18), (520, 0.26)):
        c.add(place(elephant("#06030A", "#FFC890"), x, 770, s_, flip=True))
    c.add(place(lion("#06030A", "#FFC890"), 150, 770, 0.36))
    c.add(place(giraffe("#06030A", "#FFC890"), 330, 770, 0.26))
    c.add(grass(0, 540, 771, 3, 14, "#06030A", seed=26, n=220, width=1.2))
    back, front = bead_atom(c, 270, 128, ((150, 38, -14), (132, 28, 12), (164, 50, 2)), n=74, beads=3, phase=1.0)
    c.add(back)
    rings = "".join(f'<circle cx="270" cy="128" r="{r}" fill="none" stroke="{GOLD[0]}" stroke-width="{w}"/>' for r, w in ((86, 2.6), (96, 1.2)))
    c.add(f'<g filter="{bevel(c, "rg-bv", 1, 2.2)}">{rings}</g>')
    c.add(outer_frame(c, GOLD, 10, 5))
    jewels = (
        lens(c, "j1", 40, 40, 20, quarks(c, "jq", 40, 40, 12), GOLD, w=5),
        lens(c, "j2", 500, 40, 20, atom(c, "ja", 500, 40, 17, nucleus_r=4, nucleons=8, w=0.9), GOLD, w=5),
        lens(c, "j3", 40, 920, 20, spiral_galaxy(c, "jg", 40, 920, 18, rot=0.6, tilt=0.55, seed=5, n=200), GOLD, w=5),
        lens(c, "j4", 500, 920, 20, f'<g filter="{ublur(c, "jb", 0.6)}">{black_hole(c, "jbh", 500, 920, 5, disk=3.2)}</g>', GOLD, w=5),
    )
    c.add("".join(jewels))
    c.add(crest_halo(c, 270, 128, 120, "#FFE6C0", 0.45))
    legende_crest(c, 270, 128, 0.95, 1)
    c.add(front)
    bird(c, "duo-meo-selfie", 404, 664, 196)
    legende_plaque(c, "Légende I", "Écrit dans les étoiles", 786)
    save(c, "legende-1", "Légende", 1, "I", "Le Quasar des rois",
         "Tout le ciel se lève sur la savane : un quasar tire ses jets à travers les nébuleuses, la toile cosmique tend ses filaments dans l'angle, une supernova fleurit, l'éléphant est devenu constellation. "
         "Et tout l'infime y répond : une double hélice d'ADN, deux neurones qui s'allument, les perles maasaï en orbite d'atome autour du blason serti de l'Adinkrahene, et quatre lentilles d'or aux angles - quarks, atome, galaxie, trou noir.",
         "selfie en duo (Meo selfie)", "Écrit dans les étoiles")


FRAMES = [legende_5, legende_4, legende_3, legende_2, legende_1]
