"""Égypte solaire - Ambassadeur V à I : la remontée du Nil, de Gizeh à l'or de Nubie (constructions africaines)."""

import math
import random

from kit import *  # noqa: F401,F403
from motifs import *  # noqa: F401,F403
from scene import *  # noqa: F401,F403
from archi import *  # noqa: F401,F403
from afrique import *  # noqa: F401,F403
from cosmos import star_field  # noqa: F401

GEM = CARN
RANK = "Ambassadeur"


def gem_fill(card, key, light, mid, dark):
    """Un émail cloisonné : couleur pleine, éclat de lumière en haut à gauche."""
    return card.rgrad(f"gem-{key}", [(0, light, 1), (0.5, mid, 1), (1, dark, 1)], 0.35, 0.3, 0.8)


def nile_strip(card, name, y0, y1, sun_x=270, glitter="#FFD98A", water=("#3A2340", "#120A18")):
    """Le Nil au couchant : une bande d'eau sombre, la traînée du soleil en paillettes."""
    g = card.grad(name + "-w", [(0, water[0]), (1, water[1])])
    out = [f'<rect x="0" y="{f(y0)}" width="{W}" height="{f(y1 - y0)}" fill="{g}"/>']
    rnd = random.Random(5)
    for i in range(70):
        y = rnd.uniform(y0 + 2, y1 - 2)
        spread = 16 + (y - y0) * 1.1
        x = sun_x + rnd.gauss(0, spread)
        ln = rnd.uniform(6, 22)
        out.append(f'<rect x="{f(x - ln / 2)}" y="{f(y)}" width="{f(ln)}" height="1.4" rx="0.7" fill="{glitter}" opacity="{f(rnd.uniform(0.3, 0.9))}"/>')
    return "".join(out)


# =============================================================== V - L'Aube de Gizeh

def amb5():
    c = start("a5", "#3E2A2A", "#140A08", "#FFC27A", 0.22)
    win = rrect(66, 262, 474, 734, 20)
    hz = 252
    sky = c.grad("sky", [(0, "#120A2C"), (0.09, "#3C1B4E"), (0.17, "#9A3A5A"), (0.225, "#EE7E44"), (0.258, "#FFD58A"),
                         (0.2625, "#7A4420"), (0.33, "#4A2410"), (0.7, "#24100A"), (1, "#0C0503")])
    d = [f'<rect width="{W}" height="{H}" fill="{sky}"/>']
    d.append(noise_layer(c, "cl", (0, 40, 540, 230), "0.004 0.04", 4, 7, 2.6, -1.25,
                         c.grad("clg", [(0, "#7A3A7A"), (0.5, "#E0706A"), (1, "#FFB070")]), op=0.75))
    d.append(sunburst(c, "sb", 270, 214, 90, 330, 40, "#FFE3A0", 0.4, -96, 96, 7))
    d.append(rising_sun(c, "sun", 270, 214, 92, horizon=hz))
    d.append(f'<ellipse cx="270" cy="{hz}" rx="360" ry="120" fill="{c.rgrad("spill", [(0, "#FFC070", 0.55), (0.5, "#E06A30", 0.18), (1, "#E06A30", 0)])}"/>')
    d.append(giza_group(c, "gl", 64, hz + 1, 0.95, light="right"))
    d.append(giza_group(c, "gr", 476, hz + 1, 0.95, light="left", flip=True))
    d.append(sphinx(118, hz + 2, 0.3, "#2A140A", nemes="#FFB45A"))
    d.append(palm(30, hz + 4, 46, -0.05, "#1E0E06", seed=3))
    d.append(palm(512, hz + 4, 40, 0.06, "#1E0E06", seed=5))
    d.append(f'<rect x="0" y="{hz}" width="{W}" height="1.6" fill="#FFE2A0" opacity="0.7"/>')
    for i, (x, y, s) in enumerate(((150, 92, 0.7), (176, 104, 0.6), (128, 112, 0.55), (395, 70, 0.6), (420, 84, 0.5))):
        d.append(ibis_flight(x, y, s, "#2A1020", flip=i > 2, phase=i % 2, op=0.85))
    d.append(dust(3, 60, (0, 0, W, hz), "#FFE9B8", 0.5, 1.1, keep=(200, 60, 340, 250)))
    d.append(f'<rect x="0" y="{hz}" width="{W}" height="660" fill="{c.rgrad("sidelight", [(0, "#FFB060", 0.55), (0.45, "#D06028", 0.28), (1, "#C05020", 0.05)], 0.5, 0.0, 0.95)}"/>')
    d.append(sand_ripples(5, 0, hz + 10, W, 900, "#FFC27A", 14, 2.4, 0.9, 0.18))
    d.append(nile_strip(c, "nile", 896, 960))
    d.append(f'<rect x="0" y="895" width="{W}" height="1.4" fill="#FFD27A" opacity="0.7"/>')
    d.append(felucca(476, 930, 0.3, "#0E0604", "#3A2016"))
    d.append(felucca(70, 926, 0.24, "#0E0604", "#3A2016", flip=True))
    decorate(c, win, d)
    finish_window(c, win, "#FFB257", 0.5, 0.0, 0.32)
    c.add(papyrus_stand(11, 34, 900, 470, 13, "#100503", "#FFC27A", spread=60, rim_side=1, umbel=(20, 32), w=2.6, lean=0.16, xlim=(0, 92)))
    c.add(papyrus_stand(12, 506, 900, 450, 13, "#100503", "#FFC27A", spread=60, rim_side=-1, umbel=(20, 32), w=2.6, lean=0.16, xlim=(448, 540)))
    c.add(outer_frame(c))
    c.add(gem_backing(c, 270, 140, 0.92))
    crest(c, 270, 140, 0.92, "gold", division=5, gem=GEM)
    birds(c, [("mee-wow", 102, 700, 140, False, -6), ("meo-salut", 438, 700, 140, True, 6)])
    inscription(c, KICK, "Ambassadeur V", y=772, style="cartouche")
    save(c, "ambassadeur-5", RANK, 5, "V", "L'Aube de Gizeh",
         "Première construction africaine de la collection : le soleil se lève au milieu du plateau de Gizeh (Égypte), entre Khéops, Khéphren "
         "et Mykérinos, le sphinx couché à leurs pieds et les ibis qui rentrent du fleuve. Au premier plan, les papyrus du Nil prennent la "
         "lumière : le voyage commence à l'embouchure.",
         "pied (Mee wow, Meo salut)", None)


# =============================================================== IV - La Porte de Méroé

def amb4():
    c = start("a4", "#3A2420", "#120806", "#FFB27A", 0.22)
    win = rrect(92, 300, 448, 736, 12)
    hz = 318
    sky = c.grad("sky", [(0, "#060824"), (0.1, "#1A1650"), (0.2, "#4A2068"), (0.28, "#B4406A"), (0.318, "#F47A50"), (0.331, "#FFCB80"),
                         (0.3315, "#9A3E28"), (0.42, "#B8583A"), (0.7, "#7A2E18"), (1, "#2A0C04")])
    d = [f'<rect width="{W}" height="{H}" fill="{sky}"/>']
    d.append(star_field(8, 160, (0, 0, W, 230), "#FFFFFF", 1.3, keep=(196, 40, 344, 250), tint=("#FFD9B0", "#BFD4FF")))
    d.append(noise_layer(c, "cl", (0, 150, 540, 320), "0.004 0.05", 4, 19, 2.6, -1.35,
                         c.grad("clg", [(0, "#6A2A7E"), (0.6, "#E06A6A"), (1, "#FFB070")]), op=0.55))
    d.append(crescent(c, "moon", 418, 62, 12))
    d.append(sba_star(470, 104, 6, "#FFF6DC", 0.95))
    d.append(f'<ellipse cx="270" cy="{hz}" rx="380" ry="120" fill="{c.rgrad("spill", [(0, "#FFC070", 0.6), (0.6, "#E06A30", 0.15), (1, "#E06A30", 0)])}"/>')
    rnd = random.Random(12)
    far = []
    for i in range(22):
        x = 10 + i * 25 + rnd.uniform(-6, 6)
        far.append((rnd.uniform(22, 46), x))
    for i, (h, x) in enumerate(sorted(far)):
        d.append(meroe_tall(c, f"fa{i}", x, hz + 1, h * 0.5, h, "left" if x > 270 else "right", ("#B65A5A", "#8A3A44"), ("#4A1A30", "#2A0C1A"), steps=4, chapel=False))
    d.append(f'<rect x="0" y="{hz - 30}" width="{W}" height="32" fill="{agrad(c, "haze", [(0, "#F07A60", 0), (1, "#F8A070", 0.45)])}"/>')
    lit_c, dark_c = ("#FFB878", "#D2683A"), ("#6E2A26", "#2E0E0C")
    mids = [(150, 120), (390, 120), (205, 92), (335, 92), (112, 150), (428, 150)]
    for i, (x, h) in enumerate(mids):
        d.append(meroe_tall(c, f"md{i}", x, hz + 2, h * 0.5, h, "right" if x < 270 else "left", lit_c, dark_c, steps=10, chapel=True))
    d.append(meroe_tall(c, "gp", 270, hz + 4, 158, 296, "left", ("#FFC890", "#E07A40"), ("#7A3026", "#341010"), steps=22, chapel=False))
    d.append(f'<circle cx="270" cy="{hz - 296}" r="10" fill="{c.rgrad("apx", [(0, "#FFFFFF", 0.9), (1, "#FFD7A0", 0)])}"/>')
    for side in (-1, 1):
        x = 270 + side * 222
        d.append(meroe_tall(c, f"near{side}", x, hz + 30, 128, 250, "right" if side < 0 else "left", lit_c, dark_c, steps=20, chapel=True))
    d.append(dune_layer(c, "du1", hz + 40, 18, 70, 1.2, "#C8643E", crest="#FFC08A"))
    d.append(dune_layer(c, "du2", hz + 110, 26, 90, 2.6, "#A84A2C", crest="#F49A68"))
    d.append(dune_layer(c, "du3", hz + 250, 30, 110, 0.4, "#86361E", crest="#E0804E"))
    d.append(sand_ripples(9, 0, hz + 60, W, 960, "#FFD0A0", 11, 3, 0.9, 0.22))
    for x, fl in ((28, False), (52, False), (76, False)):
        d.append(camel(x, hz + 46, 0.36, "#4A1A10", flip=fl, rider=x == 52))
    d.append(dust(9, 120, (0, 300, W, 960), "#FFD7A0", 0.3, 1.1))
    decorate(c, win, d)
    c.add(light_grade(c, win, "#FF9A50", 0.5, 0.0, 0.34))
    c.add(inner_shadow(c, win))
    for side in (-1, 1):
        x = 92 if side < 0 else 448
        c.add(torus(c, f"to{side}", x + side * -1, 300, x + side * -1, 738, 8))
    c.add(rim(c, win, GOLD3, 3.4))
    c.add(cornice_band(c, "cor", 86, 454, 270, 26, cols=(CARN, GOLD, LAPIS, GOLD, TURQ, GOLD), flare=14))
    c.add(f'<g filter="{c.shadow("wds", 0, 3, 3, "#000000", 0.5)}">{winged_disk(c, "wd", 270, 283, 150, 9, thick=12, bend=6, uraei=False)}</g>')
    hi = "#FFE2A8"
    lion_g = c.grad("lion", [(0, "#F8D49A"), (0.5, "#D59A58"), (1, "#7A4A22")], 0, 0, 0, 1)
    for side in (-1, 1):
        px = 20 if side < 0 else 520
        c.add(f'<rect x="{f(min(px, px + side * -112))}" y="742" width="112" height="16" rx="2" fill="{c.grad("plinth", [(0, "#E8B07A"), (1, "#6A3418")])}" filter="{c.shadow("pls", 0, 4, 4, "#000000", 0.6)}"/>')
        c.add(f'<g filter="{c.shadow("lsh", 0, 4, 5, "#000000", 0.55)}">{recumbent_lion(px + 4 if side < 0 else px - 4, 742, 0.66, lion_g, "#B87A40", hi, flip=side > 0, face="#E8B47A")}</g>')
    c.add(outer_frame(c))
    c.add(gem_backing(c, 270, 128, 0.88))
    crest(c, 270, 128, 0.88, "gold", division=4, gem=GEM)
    birds(c, [("mee-sourire", 48, 128, 96, False, -4), ("meo-yo", 492, 128, 96, True, 4)])
    inscription(c, KICK, "Ambassadeur IV", y=776, style="stele", panel=("#2A0E06", "#0E0402"))
    save(c, "ambassadeur-4", RANK, 4, "IV", "La Porte de Méroé",
         "On remonte le Nil jusqu'au Soudan : à Méroé, capitale du royaume de Koush, des dizaines de pyramides nubiennes pointues et raides "
         "se dressent sur les dunes roses. La photo s'ouvre dans la porte d'une chapelle funéraire, bordée du tore et de la gorge peinte, "
         "gardée par deux lions couchés comme ceux de Soleb ; Mee et Meo se posent au sommet des pyramides, sous le croissant du soir.",
         "perchés au sommet des pyramides (Mee sourire, Meo yo)", None)


# =============================================================== III - La Maison peinte de Nubie

def amb3():
    c = start("a3", "#3A2C26", "#120C0A", "#FFD08A", 0.24)
    win = arch(98, 442, 372, 292, 736)
    top = 150
    sky = c.grad("sky", [(0, "#0E3E8E"), (0.6, "#2F86D2"), (1, "#8FD3F2")])
    d = [f'<rect width="{W}" height="{top + 10}" fill="{sky}"/>']
    d.append(noise_layer(c, "cl", (0, 20, 540, 150), "0.006 0.03", 4, 3, 2.2, -1.25, "#FFFFFF", op=0.55))
    d.append(mud_dome(c, "dm1", 112, top + 4, 50))
    d.append(mud_dome(c, "dm2", 446, top + 4, 42))
    d.append(mud_dome(c, "dm3", 368, top + 4, 24, "#F0C08A", "#9A5E34"))
    d.append(palm(60, top + 6, 140, 0.06, "#1F5A3A", seed=11))
    d.append(palm(500, top + 6, 120, -0.08, "#1F5A3A", seed=4))
    wall = c.grad("wall", [(0, "#62C8D6"), (0.5, "#3FA6BE"), (1, "#2A86A2")])
    d.append(f'<rect x="0" y="{top}" width="{W}" height="{H - top}" fill="{wall}" filter="{stone_filter(c, "plaster", "1.1 0.9", 8, 0.7, "#FFFFFF", 60, 1.1)}"/>')
    d.append(f'<path d="M0 {top} L540 {top} L540 {top + 90} L0 {top + 40} Z" fill="#0A3A5A" opacity="0.16"/>')
    d.append(openwork_parapet(-4, 548, top - 22, 30, 24, "#F6F0E2", "#2F86D2"))
    d.append(f'<rect x="0" y="{top + 6}" width="{W}" height="5" fill="#E8B53C"/>')
    d.append(triangle_row(0, 540, top + 11, 16, 18, ("#F6F0E2", "#C8432B", "#F6F0E2", "#E8A23C"), down=True))
    d.append(f'<rect x="0" y="{top + 27}" width="{W}" height="3" fill="#1F3F9A"/>')
    dado = 700
    d.append(f'<rect x="0" y="{dado}" width="{W}" height="{H - dado}" fill="{c.grad("dado", [(0, "#F0B254"), (1, "#C67A2A")])}" filter="{stone_filter(c, "plaster2", "1.1 0.9", 9, 0.7, "#FFFFFF", 60, 1.08)}"/>')
    d.append(triangle_row(0, 540, dado - 14, 14, 16, ("#F6F0E2", "#1F3F9A"), outline=None))
    d.append(f'<rect x="0" y="{dado - 2}" width="{W}" height="4" fill="#F6F0E2"/>')
    d.append(diamond_chain(0, 540, dado + 22, 16, 30, "#C8432B", "#F6F0E2"))
    d.append(triangle_row(0, 540, 922, 14, 16, ("#1F3F9A", "#F6F0E2", "#C8432B", "#F6F0E2")))
    for side in (-1, 1):
        x = 270 + side * 232
        for k, (yy, r, sd) in enumerate(((330, 21, 2), (446, 21, 5), (556, 17, 8))):
            d.append(f'<line x1="{x}" y1="{yy - r - 14}" x2="{x}" y2="{yy - r}" stroke="#6A4A22" stroke-width="1.2"/><circle cx="{x}" cy="{yy - r - 15}" r="2" fill="#6A4A22"/>')
            d.append(woven_plate(c, f"tb{side}{k}", x, yy, r, seed=sd + (side > 0)))
        d.append(vertical_zigzag(x, 600, dado - 26, 7, 14, "#F6F0E2", 3.0, 0.95))
        d.append(vertical_zigzag(x, 600, dado - 26, 7, 14, "#C8432B", 1.1, 0.9))
    d.append(stepped_arch(98, 442, 372, 292, 736, 7, ["#F6F0E2", "#C8432B", "#F6F0E2", "#E8A23C", "#1F3F9A"]))
    d.append(painted_croc(270, 238, 0.82, "#173A7A", "#F6F0E2"))
    for x, y, r in ((124, 216, 17), (416, 216, 17), (70, 240, 12), (470, 240, 12)):
        d.append(nubian_plate(c, f"pl{x}", x, y, r))
    for x, y in ((176, 206), (364, 206)):
        d.append(sba_star(x, y, 8, "#F6F0E2", 0.95, dot=False))
    for side in (-1, 1):
        bx = 270 + side * 214
        d.append(f'<rect x="{f(bx - 30)}" y="{dado - 26}" width="60" height="34" rx="3" fill="#E8C690" stroke="#F6F0E2" stroke-width="1.4"/>')
        d.append(f'<rect x="{f(bx - 26)}" y="{dado - 30}" width="52" height="6" rx="2" fill="#C8432B"/>')
        d.append("".join(f'<rect x="{f(bx - 26 + i * 6.5)}" y="{dado - 30}" width="3.2" height="6" fill="#F2B23C"/>' for i in range(8)))
        d.append(f'<rect x="{f(bx - 30)}" y="{dado + 4}" width="60" height="5" fill="#000000" opacity="0.25"/>')
    decorate(c, win, d)
    finish_window(c, win, "#FFD58A", 0.3, 0.0, 0.3, w=4)
    c.add(outer_frame(c))
    c.add(gem_backing(c, 270, 100, 0.84))
    crest(c, 270, 100, 0.84, "gold", division=3, gem=GEM)
    birds(c, [("mee-coucou", 82, 662, 132, False, -4), ("meo-bravo", 458, 662, 132, True, 4)])
    inscription(c, KICK, "Ambassadeur III", "Bienvenue chez nous", y=770, style="cartouche", panel=("#16304A", "#08121E"))
    save(c, "ambassadeur-3", RANK, 3, "III", "La Maison peinte de Nubie",
         "Une maison nubienne de Gharb Soheil, près d'Assouan : façade passée à la chaux turquoise, parapet ajouré, coupoles de terre, "
         "assiettes de faïence et crocodile peint au-dessus de la porte pour garder le seuil, plateaux tressés pendus aux murs. "
         "La photo est la porte grande ouverte, Mee et Meo sur les banquettes de l'accueil : l'hospitalité nubienne, construction africaine vivante.",
         "pied, sur les banquettes (Mee coucou, Meo bravo)", "Bienvenue chez nous")


# =============================================================== II - La Salle hypostyle

def amb2():
    c = start("a2", "#3E2C22", "#120A06", "#FFC27A", 0.24)
    win = rrect(100, 276, 440, 732, 14)
    d = [f'<rect width="{W}" height="{H}" fill="{c.grad("bg", [(0, "#1A0E14"), (0.25, "#2E1810"), (0.6, "#1A0C06"), (1, "#0C0503")])}"/>']
    d.append(star_ceiling(0, 0, W, 200, 30, GOLD, ground=LAPIS_D, op=0.9))
    d.append(f'<rect x="0" y="0" width="{W}" height="200" fill="{agrad(c, "ceil", [(0, "#000000", 0.35), (1, "#000000", 0)])}"/>')
    d.append(f'<ellipse cx="270" cy="120" rx="310" ry="180" fill="{c.rgrad("gl", [(0, "#FFB860", 0.6), (0.6, "#C0602A", 0.15), (1, "#C0602A", 0)])}"/>')
    for i, (x, w) in enumerate(((122, 24), (418, 24), (178, 20), (362, 20), (222, 16), (318, 16))):
        d.append(papyrus_column(c, f"far{i}", x, 238 + i * 4, 780, w, stone=("#A87A4E", "#7A5230", "#3E2814"), paint=("#2A3A6A", "#2A6A62", "#7A2A1A", "#8A6A2A"), lit=False))
    d.append(f'<rect x="0" y="230" width="{W}" height="560" fill="#120804" opacity="0.4"/>')
    for k, (x0, x1) in enumerate(((60, 330), (150, 470), (-30, 220))):
        d.append(beam(c, f"bm{k}", x0, 0, x1, 780, 40, 160, "#FFD58A", 0.34, 8))
    d.append(dust(4, 200, (0, 0, W, 780), "#FFE2A8", 0.6, 1.3))
    d.append(f'<rect x="0" y="198" width="{W}" height="42" fill="{c.grad("arch", [(0, "#F2D3A0"), (0.5, "#D2A468"), (1, "#8A5E32")])}" filter="{stone_filter(c, "arst", "0.9 0.3", 4, 1.0, "#FFF2DC", 50, 1.12)}"/>')
    d.append(block_border(0, 198, W, 210, 12, (LAPIS, GOLD, CARN, GOLD, TURQ, GOLD)))
    for x, gl in ((150, [0, 1, 3]), (390, [6, 5, 1])):
        d.append(f'<g transform="rotate(-90 {x} 225)">{cartouche_v(c, f"ca{x}", x, 225, 22, 96, gl, bv=False)}</g>')
    d.append(f'<rect x="0" y="238" width="{W}" height="3" fill="{GOLD_LO}"/>')
    d.append(f'<rect x="0" y="880" width="{W}" height="80" fill="{c.grad("floor", [(0, "#3A2410"), (1, "#120804")])}"/>')
    d.append(lotus_frieze(c, "lf", 10, 540, 934, 0.9))
    decorate(c, win, d)
    finish_window(c, win, "#FFB257", 0.3, 0.0, 0.34)
    for k, (x0, x1) in enumerate(((80, 250), (420, 330))):
        c.add(f'<g style="mix-blend-mode:screen">{beam(c, f"fb{k}", x0, 240, x1, 740, 30, 90, "#FFD58A", 0.16, 10)}</g>')
    for side, cx in ((-1, 44), (1, 496)):
        c.add(f'<g filter="{c.shadow("colsh", 0, 6, 8, "#000000", 0.6)}">{papyrus_column(c, f"col{side}", cx, 240, 756, 62)}</g>')
        c.add(cartouche_v(c, f"cc{side}", cx, 456, 28, 142, [0, 1, 6] if side < 0 else [3, 5, 1], fill="#14306A", ink=GOLD_HI))
        c.add(ankh(cx, 590, 0.4, GOLD_LO, op=0.85))
        c.add(f'<rect x="{f(cx - 24)}" y="360" width="48" height="3" fill="{CARN}" opacity="0.8"/><rect x="{f(cx - 24)}" y="366" width="48" height="2" fill="{LAPIS}" opacity="0.8"/>')
        for k in range(3):
            c.add(lotus_flower(c, f"of{side}{k}", cx + (k - 1) * 16, 752 - (6 if k == 1 else 0), 0.34))
    c.add(sunburst(c, "sb", 270, 112, 60, 190, 32, "#FFE3A0", 0.55, 0, 360, 4))
    lap = gem_fill(c, "lapis", LAPIS_L, LAPIS, LAPIS_D)
    tur = gem_fill(c, "turq", TURQ_L, TURQ, TURQ_D)
    car = gem_fill(c, "carn", "#FFB08A", CARN, CARN_D)
    gld = gem_fill(c, "gold", GOLD_HI, GOLD, GOLD_LO)
    c.add(f'<g filter="{c.shadow("wsh", 0, 5, 6, "#000000", 0.5)}">{winged_sun(c, "wd", 270, 116, 520, 58, 72, [lap, tur, car, lap], (car, tur, lap, gld), rise=16)}</g>')
    c.add(outer_frame(c))
    c.add(gem_backing(c, 270, 112, 0.9))
    crest(c, 270, 112, 0.9, "gold", division=2, gem=GEM)
    birds(c, [("mee-bisou-vole", 104, 698, 136, False, -6), ("meo-love", 436, 698, 136, True, 6)])
    inscription(c, KICK, "Ambassadeur II", "Merci la famille", y=772, style="corniche")
    save(c, "ambassadeur-2", RANK, 2, "II", "La Salle hypostyle",
         "Karnak, à Thèbes (Égypte) : deux colonnes papyriformes aux liens peints portent l'architrave et ses cartouches, une forêt de colonnes "
         "se perd dans l'ombre sous le plafond de lapis semé d'étoiles, et la lumière tombe des claustras en longs faisceaux poussiéreux. "
         "Le blason prend la place du disque solaire entre les ailes de Behedety, le faucon d'Edfou ; des lotus sont offerts au pied des colonnes.",
         "pied (Mee bisou volé, Meo love)", "Merci la famille")


# =============================================================== I - L'Or de Nubie

def amb1():
    c = start("a1", "#2E2430", "#0E0A12", "#FFC890", 0.24)
    win = rrect(76, 300, 464, 732, 18)
    d = [f'<rect width="{W}" height="{H}" fill="{c.grad("bg", [(0, "#0A1440"), (0.5, "#0B1847"), (1, "#060B26")])}"/>']
    d.append(star_ceiling(0, 0, W, H, 34, GOLD, op=0.3))
    d.append(f'<ellipse cx="270" cy="170" rx="320" ry="250" fill="{c.rgrad("gl", [(0, "#FFC060", 0.55), (0.5, "#C06020", 0.16), (1, "#C06020", 0)])}"/>')
    d.append(sunburst(c, "sb", 270, 150, 70, 320, 56, "#FFE3A0", 0.55, 0, 360, 5))
    d.append(dust(6, 160, (0, 0, W, H), "#FFE8B0", 0.6, 1.4))
    decorate(c, win, d)
    finish_window(c, win, "#FFB257", 0.5, 0.0, 0.3, w=5)
    inlay = (LAPIS, GOLD, TURQ, GOLD, CARN, GOLD)
    c.add(f'<g filter="{bevel(c, "cbv", 0.7, 1.5, sd=3, dy=2)}">{block_border(62, 286, 478, 298, 10, inlay)}'
          f'{block_border(62, 734, 478, 746, 10, inlay)}'
          f'{block_border(62, 298, 74, 734, 10, inlay, vertical=True)}'
          f'{block_border(466, 298, 478, 734, 10, inlay, vertical=True)}</g>')
    for x, y in ((68, 292), (472, 292), (68, 740), (472, 740)):
        c.add(f'<circle cx="{x}" cy="{y}" r="9" fill="{gem_fill(c, "carn", "#FFB08A", CARN, CARN_D)}" stroke="{GOLD}" stroke-width="2.4"/>')
    strands = []
    for k, x in enumerate((20, 33, 46)):
        cols = [(LAPIS_L, "gold", TURQ, "gold"), (CARN, "gold", LAPIS, "gold"), (TURQ, "gold", CARN, "gold")][k]
        strands.append(bead_strand(c, f"bl{k}", x, 306, 730, cols, 3.6, 0.8, cowrie_every=7 if k == 1 else 0))
        strands.append(bead_strand(c, f"br{k}", W - x, 306, 730, cols, 3.6, 0.8, cowrie_every=7 if k == 1 else 0))
    c.add(f'<g filter="{c.shadow("bsh", 0, 2, 2, "#000000", 0.6)}">{"".join(strands)}</g>')
    for i in range(31):
        x = 80 + i * 12.7
        col = (gem_fill(c, "carn", "#FFB08A", CARN, CARN_D), gem_fill(c, "turq", TURQ_L, TURQ, TURQ_D), gem_fill(c, "lapis", LAPIS_L, LAPIS, LAPIS_D))[i % 3]
        ln = 22 if i % 2 == 0 else 16
        c.add(f'<path d="M{f(x)} 747 Q{f(x - 5)} {747 + ln * 0.55} {f(x)} {747 + ln} Q{f(x + 5)} {747 + ln * 0.55} {f(x)} 747 Z" fill="{col}" stroke="{GOLD}" stroke-width="0.9"/>')
    lap = gem_fill(c, "lapis", LAPIS_L, LAPIS, LAPIS_D)
    tur = gem_fill(c, "turq", TURQ_L, TURQ, TURQ_D)
    car = gem_fill(c, "carn", "#FFB08A", CARN, CARN_D)
    gld = gem_fill(c, "gold", GOLD_HI, GOLD, GOLD_LO)
    tiers = [(0.58, 1.0, 12, (lap, tur)), (0.34, 0.64, 10, (tur, car)), (0.0, 0.4, 8, (gld, car))]
    c.add(pectoral_wings(c, "pw", 270, 252, 244, a0=46, a1=120, tiers=tiers, sw=1.6))
    c.add(f'<circle cx="270" cy="128" r="96" fill="{c.rgrad("sun", [(0, "#FFB27A", 1), (0.55, CARN, 1), (1, CARN_D, 1)], 0.38, 0.3, 0.8)}" stroke="{GOLD}" stroke-width="6" filter="{bevel(c, "sbv", 1.2, 2.6, sd=5, dy=4)}"/>')
    c.add(f'<circle cx="270" cy="128" r="87" fill="none" stroke="{GOLD_HI}" stroke-width="1" opacity="0.6"/>')
    c.add("".join(f'<circle cx="{f(pt(270, 128, 92, a)[0])}" cy="{f(pt(270, 128, 92, a)[1])}" r="1.5" fill="{GOLD_HI}"/>' for a in range(0, 360, 6)))
    for side in (-1, 1):
        c.add(uraeus(c, 270 + side * 100, 216, 1.2, c.grad("ug", [(0, GOLD_HI), (0.6, GOLD), (1, GOLD_LO)]), GOLD_LO, flip=side < 0))
    c.add(scarab(c, "sc", 270, 262, 1.0, legs=True))
    c.add(f'<g filter="{c.shadow("shsh", 0, 3, 3, "#000000", 0.5)}">{shen(c, "shen", 270, 334, 11, fill=CARN)}</g>')
    c.add(outer_frame(c))
    c.add(gem_backing(c, 270, 122, 0.82, CARN_D))
    crest(c, 270, 122, 0.82, "gold", division=1, gem=TURQ_L)
    c.add(lotus_frieze(c, "lfb", 20, 530, 936, 0.8))
    birds(c, [("mee-jackpot", 52, 476, 126, False, 14), ("meo-trophee", 488, 506, 126, True, -14)])
    inscription(c, KICK, "Ambassadeur I", "On l'a fait ensemble", y=774, style="cartouche", panel=("#0E1A4A", "#050A20"))
    c.motif("afrique")
    save(c, "ambassadeur-1", RANK, 1, "I", "L'Or de Nubie",
         "Le cadre devient un pectoral royal : Khépri, le scarabée de lapis, pousse le soleil de cornaline où se lève le blason, entre deux ailes "
         "cloisonnées de turquoise et de cornaline, l'anneau shen d'éternité entre ses pattes ; la photo est sertie d'incrustations et suspendue "
         "à des rangs de perles de faïence, de cornaline et de cauris. Nubie viendrait de nub, l'or : celui des pharaons sortait des mines du désert "
         "nubien, et les cauris furent la monnaie de toute l'Afrique.",
         "côtés, sur les rangs de perles (Mee jackpot, Meo trophée)", "On l'a fait ensemble")
