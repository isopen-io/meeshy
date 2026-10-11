"""Afrique éternelle · Savane - ORATEUR A, B, C : la parole et la lumière, dans ce que l'Afrique a bâti (or rouge)."""

from common import *  # noqa: F401,F403
from motifs import _taper  # noqa: F401


# =============================================================== A

def orateur_a():
    c = Card("oa")
    photo(c, "#4E2A16", "#160806", "#FFB070", glow=0.24)
    win = rrect(78, 300, 462, 744, 16)
    m = deco_mask(c, win)
    hz = 298
    sky = c.grad("sky", [(0, "#2A0A22"), (0.1, "#6A1A30"), (0.2, "#D2502A"), (0.27, "#FF9A3A"), (0.305, "#FFD27A"), (0.31, "#FFE6B0"),
                         (0.312, "#B85A2A"), (0.45, "#6A2A10"), (1, "#1E0A04")])
    d = [f'<rect width="{W}" height="{H}" fill="{sky}"/>']
    d.append(noise_layer(c, "clouds", (0, 0, 540, 200), "0.006 0.035", 4, 17, 2.6, -1.25, c.grad("cl", [(0, "#A03A4A"), (0.7, "#FF9A5A"), (1, "#FFC890")])))
    d.append(light_rays(c, "rays", 270, hz - 4, 44, 900, "#FFE6A8", -180, 180, 4, 0.36))
    d.append(sky_glow(c, "sunh", 270, hz - 4, 230, "#FFF0C0", 0.85))
    d.append(sun(c, "sun", 270, hz - 4, 44, haze=False))
    d.append(waves(270, hz - 4, 70, 9, 26, "#FFF4D0", 1.6, 0.5))
    d.append(acacia(448, hz - 26, 78, "#1E0C08", seed=11, width=220))
    d.append(acacia(96, hz - 22, 50, "#1E0C08", seed=5, width=140))
    d.append(f'<path d="M-10 {hz + 2} Q140 {hz - 4} 270 {hz} Q400 {hz - 4} 550 {hz + 2} L550 {H} L-10 {H} Z" fill="{c.grad("sand", [(0, "#C8642A"), (0.2, "#7A2E12"), (1, "#2A0E06")])}"/>')
    for i in range(-6, 7):
        bx = 270 + i * 120
        d.append(f'<path d="M270 {hz} L{bx - 22} {H} L{bx + 22} {H} Z" fill="#1A0804" opacity="0.28"/>')
    d.append(palisade(-10, 550, hz + 6, 22, 34, 6, 10, "#1E0C08", rim="#FFC880", seed=7, gap=(1.0, 3.2), slope=1.6))
    d.append(dust(17, 200, (0, 0, 540, 960), "#FFF0C0", 0.4, 1.8))
    masked(c, m, d)
    c.add(light_grade(c, win, "#FF9A3A", 0.5, 0.0, 0.3))
    c.add(inner_shadow(c, win))
    c.add(gold_rim(c, win, REDGOLD, 4))
    for x, top, w, sd, lit, fork, cut in ((30, 70, 46, 1, 1, False, 0.3), (64, 188, 30, 2, 1, True, 0), (510, 82, 46, 3, -1, False, -0.25), (476, 196, 30, 4, -1, True, 0)):
        c.add(f'<ellipse cx="{x}" cy="800" rx="{w}" ry="8" fill="#000000" opacity="0.5" filter="{c.blur("psh", 5)}"/>')
        c.add(kgotla_post(c, f"p{x}", x, top, 804, w, mat=("#9A7458", "#3E2C20", "#120A06"), lit=lit, seed=sd, fork=fork, cut=cut, rim="#FFD7A0"))
    c.add(outer_frame(c, REDGOLD, 12, 3.5))
    c.add(crest_halo(c, 270, 126, 120, "#FFF0C0", 0.5))
    crest(c, 270, 126, 0.92, "redgold", division=None)
    birds(c, [("mee-courage", 66, 146, 92, False, -6), ("meo-serenade", 474, 154, 92, True, 6)])
    inscription(c, KICKER, "Orateur", "Ma voix porte loin", y=790, style="soleil", metal=REDGOLD)
    save(c, "orateur-a", "Orateur", None, "A", "La Parole du kgotla",
         "Au Botswana, le kgotla est à la fois l'assemblée du village et l'enceinte qui l'abrite : un fer à cheval de troncs plantés, souvent à l'ombre d'un grand arbre, où chacun peut prendre la parole devant le chef sans être interrompu. "
         "« Mafoko a kgotla a mantle otlhe », dit le proverbe tswana : toutes les paroles du kgotla sont belles. Le jour se lève sur le Kalahari et passe en rais d'or entre les troncs.",
         "perchés sur les troncs (Mee courage, Meo sérénade)", "Ma voix porte loin")


# =============================================================== B

def orateur_b():
    c = Card("ob")
    photo(c, "#4E2A1E", "#160A08", "#FFC0A0", glow=0.26)
    win = rrect(82, 270, 458, 744, 10)
    m = deco_mask(c, win)
    wall = c.grad("wall", [(0, "#D86E42"), (0.45, "#B04A28"), (1, "#7A2A14")], 0, 0, 1, 0.5)
    d = [f'<g filter="{earth(c, "wl-e", "0.018 0.05", 7, 2.4, "#FFEEDC")}"><rect width="{W}" height="{H}" fill="{wall}"/></g>']
    rnd = random.Random(4)
    streaks = "".join(f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(x + rnd.uniform(-2, 2))}" y2="{f(y + rnd.uniform(40, 160))}" stroke="#5A1A08" stroke-width="{f(rnd.uniform(0.6, 1.6))}" opacity="0.25"/>'
                      for x, y in [(rnd.uniform(0, 540), rnd.uniform(60, 860)) for _ in range(60)])
    d.append(streaks)
    d.append(f'<rect width="{W}" height="{H}" fill="{c.rgrad("dawn", [(0, "#FFE0B0", 0.55), (0.55, "#FFB080", 0.18), (1, "#FFB080", 0)], 0.05, 0.1, 0.95)}" style="mix-blend-mode:screen"/>')
    d.append(f'<rect x="0" y="40" width="{W}" height="54" fill="{c.grad("esh", [(0, "#000000AA"), (1, "#00000000")])}"/>')
    d.append(thatch_courses(c, "eave", -10, 550, [-40, -16, 8, 32, 50], ("#E8C27A", "#8E6430", "#2E1A08"), seed=3, fringe=7, lit=-1))
    niches = (
        (18, "#BFD3D2", emblem_shark(0.82)),
        (120, "#F0E4C8", emblem_lion(0.98)),
        (332, "#E9C27A", emblem_buffalo(0.8)),
        (434, "#F0E4C8", emblem_jar(1.18)),
    )
    for x, bg, art in niches:
        d.append(abomey_niche(c, f"n{x}", x, 104, 88, 92, bg=bg, content=art))
    for y in (220, 230):
        d.append(f'<line x1="0" y1="{y}" x2="{W}" y2="{y}" stroke="#FFD0B0" stroke-width="1.4" opacity="0.45"/><line x1="0" y1="{y + 2}" x2="{W}" y2="{y + 2}" stroke="#4A1406" stroke-width="1.6" opacity="0.45"/>')
    d.append(f'<g filter="{earth(c, "fl-e", "0.02 0.07", 4, 1.6)}"><rect x="0" y="744" width="{W}" height="230" fill="{c.grad("floor", [(0, "#9A4424"), (0.3, "#5A2010"), (1, "#1E0804")])}"/></g>')
    d.append(f'<rect x="0" y="742" width="{W}" height="3" fill="#FFD0B0" opacity="0.4"/>')
    d.append(light_rays(c, "beams", -90, -110, 13, 1300, "#FFF2D0", 122, 156, 5, 0.3))
    masked(c, m, d)
    c.add(f'<path d="{rrect(70, 258, 470, 756, 16)}" fill="none" stroke="#9A3A1C" stroke-width="14" filter="{bevel(c, "dbv", 1.4, 2.6, light="#FFF0DC", spec=0.6, exp=12, sd=3, dy=3, sop=0.55)}"/>')
    c.add(light_grade(c, win, "#FFC890", 0.1, 0.0, 0.34))
    c.add(inner_shadow(c, win, 34, 14, 0.65))
    c.add(gold_rim(c, win, REDGOLD, 4))
    c.add(dust(29, 160, (0, 0, 540, 960), "#FFF4D8", 0.4, 1.6))
    c.add(outer_frame(c, REDGOLD, 12, 3.5))
    c.add(crest_halo(c, 270, 144, 110, "#FFE6C0", 0.45))
    crest(c, 270, 144, 0.9, "redgold", division=None)
    birds(c, [("mee-lettre", 38, 610, 86, False, -5), ("meo-serenade", 502, 616, 86, True, 5)])
    inscription(c, KICKER, "Orateur", y=792, style="ebene", metal=REDGOLD, panel=("#3A1410", "#120504"))
    save(c, "orateur-b", "Orateur", None, "B", "Les Murs parlants d'Abomey",
         "Aux palais royaux d'Abomey (Bénin), les murs parlent : chaque roi du Danhomè prenait à son avènement un « nom fort », une devise, que les artisans modelaient en bas-reliefs d'argile peinte. "
         "Le requin de Béhanzin, le lion de Glèlè, le buffle de Guézo et sa jarre percée - que chacun doit boucher d'un doigt pour qu'elle garde l'eau - sortent du mur dans la lumière rasante du matin.",
         "côtés, à mi-hauteur (Mee lettre, Meo sérénade)", None)


# =============================================================== C

def orateur_c():
    c = Card("oc")
    photo(c, "#4E2A1A", "#160A06", "#FFC890", glow=0.26)
    win = rrect(70, 300, 470, 744, 18)
    m = deco_mask(c, win)
    sky = c.grad("sky", [(0, "#4A1030"), (0.1, "#C0402A"), (0.2, "#FF9A3A"), (0.28, "#FFD27A"), (0.32, "#FFF0C0")])
    d = [f'<rect width="{W}" height="{H}" fill="{sky}"/>']
    d.append(light_rays(c, "rays", 270, 128, 48, 900, "#FFF4D0", -180, 180, 4, 0.42))
    d.append(sky_glow(c, "sunh", 270, 128, 250, "#FFF8E0", 0.85))
    d.append(sun(c, "sun", 270, 128, 84, haze=False))
    d.append(waves(270, 128, 110, 9, 30, "#FFF4D0", 1.6, 0.55))
    mat = ("#FFD39A", "#C07838", "#4A2008")
    d.append(acacia(84, 232, 64, "#3A1206", seed=6, width=170))
    d.append(flock(130, 100, 7, 80, 4, "#3A1206", 0.45, 0.8))
    d.append(sankore(c, "mn", 432, 300, 276, 190, mat, lit=-1))
    fac = "M-10 300 L-10 228 L548 228 L548 300 Z"
    d.append(f'<g filter="{earth(c, "fa-e", "0.03", 8, 1.8)}"><path d="{fac}" fill="{c.grad("fa", [(0, mat[2]), (0.25, mat[1]), (0.5, mat[0]), (0.75, mat[1]), (1, mat[2])], 0, 0, 1, 0)}"/></g>')
    for x in range(-6, 560, 44):
        d.append(f'<rect x="{x}" y="228" width="16" height="72" fill="{c.grad("pil", [(0, mat[0]), (1, mat[1])], 0, 0, 1, 0)}" opacity="0.55"/>')
    d.append(toron(30, 534, 262, 44, 13, "#3A1A08", w=3.2))
    for x in (18, 62, 106, 150):
        d.append(pinnacle(c, f"pn{x}", x, 176, 232, 22, mat, lit=1, seed=x))
    for x in (340, 520):
        d.append(pinnacle(c, f"pn{x}", x, 176, 232, 22, mat, lit=-1, seed=x))
    d.append(f'<path d="M-10 230 L548 230" stroke="{mat[0]}" stroke-width="2" opacity="0.7"/>')
    for x0, x1, lit in ((-10, 66, 1), (474, 550, -1)):
        d.append(f'<g filter="{earth(c, f"bw{x0}", "0.03", x1, 1.8)}"><rect x="{x0}" y="300" width="{x1 - x0}" height="460" fill="{hshade(c, f"bwg{x0}", mat, lit)}"/></g>')
        for y in range(352, 760, 92):
            d.append(toron(x0 + 30, x1 - 12, y, 30, 12, "#3A1A08", w=3.2))
    floor = c.grad("floor", [(0, "#E8B070"), (0.25, "#9A5A2A"), (1, "#2A1206")])
    d.append(f'<g filter="{earth(c, "fl-e", "0.02 0.07", 4, 1.4)}"><rect x="0" y="744" width="{W}" height="230" fill="{floor}"/></g>')
    d.append(dust(41, 220, (0, 0, 540, 960), "#FFF8E0", 0.4, 1.8))
    masked(c, m, d)
    c.add(light_grade(c, win, "#FFC870", 0.5, 0.0, 0.32))
    c.add(inner_shadow(c, win))
    c.add(gold_rim(c, win, REDGOLD, 4))
    c.add(manuscript(c, "ms1", 6, 420, 80, 108, -8, seed=4))
    c.add(manuscript(c, "ms2", 454, 470, 80, 108, 7, seed=7, diagram="geo"))
    c.add(outer_frame(c, REDGOLD, 12, 3.5))
    c.add(crest_halo(c, 270, 132, 120, "#FFF8E0", 0.6))
    crest(c, 270, 132, 0.92, "redgold", division=None)
    birds(c, [("mee-danse", 94, 712, 138, False, -6), ("meo-feu-artifice", 446, 706, 140, True, 6)])
    inscription(c, KICKER, "Orateur", "On l'a fait ensemble", y=790, style="soleil", metal=REDGOLD)
    save(c, "orateur-c", "Orateur", None, "C", "Le Soleil de Sankoré",
         "Le soleil se lève sur Tombouctou (Mali), à côté du minaret de terre de Sankoré, hérissé de ses toron, ces poutres de palmier qui servent d'échafaudage quand on recrépit après les pluies ; la façade aligne ses contreforts coiffés d'œufs d'autruche. "
         "Sur les murs, deux feuillets des manuscrits de Tombouctou portent leurs cartes du ciel à l'encre d'or : la parole écrite, qui porte plus loin que la voix.",
         "pied (Mee danse, Meo feu d'artifice)", "On l'a fait ensemble")


FRAMES = [orateur_a, orateur_b, orateur_c]
