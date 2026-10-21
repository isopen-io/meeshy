"""Égypte solaire - Oracle A, B, C : le ciel s'ouvre (Nout, le zodiaque de Dendera, la barque de nuit) et l'on entrevoit le minuscule."""

import math
import random

from kit import *  # noqa: F401,F403
from motifs import *  # noqa: F401,F403
from scene import *  # noqa: F401,F403
from archi import *  # noqa: F401,F403
from cosmos import *  # noqa: F401,F403
from afrique import agrad, foliage  # noqa: F401
from ciel import *  # noqa: F401,F403

RANK = "Oracle"
METAL = "silver"
SILVER3 = METALS["silver"]
NIGHT_PANEL = ("#0E1838", "#04081A")


def night_bg(card, name, top="#040922", mid="#0B1A44", bot="#120828"):
    return f'<rect width="{W}" height="{H}" fill="{card.grad(name, [(0, top), (0.5, mid), (1, bot)])}"/>'


def quartz_cluster(card, name, x, base_y, s, flip=False, seed=2):
    rnd = random.Random(seed)
    out = []
    for i in range(5):
        dx = (i - 2) * 9 * s * (-1 if flip else 1)
        out.append(crystal(card, f"{name}{i}", x + dx, base_y - rnd.uniform(4, 12) * s, s * rnd.uniform(0.35, 0.6), rot=(i - 2) * 14 + rnd.uniform(-6, 6)))
    return "".join(out)


# =============================================================== A - Le Corps de Nout

def ora_a():
    c = start("ra", "#2A2440", "#0A0814", "#C9D2FF", 0.2)
    cx, base = 270, 780
    rxo, ryo, rxi, ryi = 258, 622, 214, 556
    win = ell_window(cx, base, rxi - 8, ryi - 8, 736)
    d = [night_bg(c, "bg", "#030716", "#0A1640", "#100626")]
    d.append(nebula_cloud(c, "nb1", 90, 160, 170, 140, "#6E4AFF", "#1A2A8A", 0.75, seed=5))
    d.append(nebula_cloud(c, "nb2", 460, 150, 160, 130, "#FF6FB1", "#3A1A7A", 0.6, seed=9))
    d.append(nebula_cloud(c, "nb3", 270, 60, 220, 70, "#4AD0FF", "#1A2A8A", 0.35, seed=12))
    d.append(star_field(3, 700, (0, 0, W, 800), "#FFFFFF", 1.3, tint=("#FFE9C0", "#BFD8FF")))
    d.append(shape_constellation("sah", 82, 118, 0.95, "#FFE9C0", r=1.9, glow_color="#FFE9C0"))
    d.append(bright_star(c, "sop", 150, 222, 10, "#CFE8FF"))
    dip = [(388, 60), (410, 48), (436, 50), (456, 64), (462, 92), (492, 100), (500, 74)]
    d.append(constellation(dip, [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (5, 6), (6, 3)], "#FFE9C0", r=1.9, glow_color="#FFE9C0"))
    d.append(f'<rect x="0" y="770" width="{W}" height="200" fill="{c.grad("geb", [(0, "#0E1A1A"), (1, "#03060A")])}"/>')
    d.append(f'<ellipse cx="270" cy="772" rx="300" ry="26" fill="{c.rgrad("hzg", [(0, "#7FE0C8", 0.35), (1, "#7FE0C8", 0)])}"/>')
    d.append(quartz_cluster(c, "qz", 40, 948, 1.3))
    d.append(quartz_cluster(c, "qz2", 500, 948, 1.2, flip=True, seed=5))
    for i, (x, y, r, col) in enumerate(((96, 928, 7, "#FFD36E"), (118, 916, 4, "#B7A6FF"), (424, 922, 6, "#FFD36E"), (444, 934, 4, "#9FE8C8"))):
        d.append(pollen(c, f"fp{i}", x, y, r, col, seed=i))
    d.append(nout_body(c, "nut", cx, base, rxo, ryo, rxi, ryi))
    decorate(c, win, d)
    finish_window(c, win, "#9FB8FF", 0.5, 0.0, 0.22, SILVER3, 4)
    hg = c.grad("hand", [(0, GOLD_HI), (0.5, GOLD), (1, GOLD_LO)], 0, 0, 1, 1)
    c.add(f'<g filter="{c.shadow("hs", 0, 0, 4, "#FFD890", 0.8)}">{limb_hands(c, 34, 790, 1.8, hg, GOLD_LO)}</g>')
    c.add(f'<g filter="{c.shadow("fs", 0, 0, 4, "#FFD890", 0.8)}">{feet(498, 778, 1.2, hg, GOLD_LO)}</g>')
    pol = "".join(pollen(c, f"po{i}", x, y, r, col, seed=i) for i, (x, y, r, col) in enumerate(((54, 292, 15, "#FFD36E"), (78, 314, 9, "#B7A6FF"), (46, 320, 7, "#9FE8C8"))))
    c.add(lens(c, "lnl", 60, 302, 32, pol, SILVER3, "#0A1430"))
    cry = koch_snowflake(480, 302, 24, 4, "#DFF4FF", 0.9, 0.95) + koch_snowflake(480, 302, 12, 3, "#9FD8FF", 0.7, 0.8, 60)
    c.add(lens(c, "lnr", 480, 302, 32, cry, SILVER3, "#0A1430"))
    c.add(outer_frame(c, SILVER3))
    c.add(f'<circle cx="270" cy="176" r="74" fill="{c.rgrad("cg", [(0, "#FFF2C0", 0.6), (1, "#FFD080", 0)])}"/>')
    crest(c, 270, 172, 0.86, METAL)
    birds(c, [("mee-lettre", 118, 704, 128, False, -6), ("meo-love", 424, 704, 128, True, 6)])
    inscription(c, KICK, "Oracle", "Sous le même ciel", y=774, style="nuit", metal=SILVER3, panel=NIGHT_PANEL, ink="#F2F6FF")
    save(c, "oracle-a", RANK, None, "A", "Le Corps de Nout",
         "Nout, la déesse du ciel, s'arque au-dessus du monde, les mains posées à l'ouest et les pieds à l'est, le corps couvert d'étoiles et "
         "traversé par la Voie lactée : elle avale le soleil du soir et le remet au monde au matin, et le blason brille sur son ventre à midi. "
         "Autour d'elle, Sah (Orion), Sopdet (Sirius) et la Grande Ourse ; dans deux oculaires, l'infime : le pollen du lotus et un flocon de neige fractal.",
         "pied (Mee lettre, Meo love)", "Sous le même ciel")


# =============================================================== B - Le Zodiaque de Dendera

def ora_b():
    c = start("rb", "#262444", "#0A0816", "#C9D2FF", 0.2)
    win = rrect(96, 332, 444, 736, 22)
    dcx, dcy = 270, 186
    d = [night_bg(c, "bg", "#040718", "#101848", "#0A0620")]
    d.append(nebula_cloud(c, "nb1", 270, 200, 280, 230, "#7A4AFF", "#1A2A8A", 0.7, seed=14))
    d.append(nebula_cloud(c, "nb2", 120, 520, 140, 200, "#2AC8C0", "#0A2A5A", 0.5, seed=17))
    d.append(nebula_cloud(c, "nb3", 430, 560, 140, 200, "#FF7AB8", "#3A1A6A", 0.45, seed=19))
    d.append(star_field(6, 600, (0, 0, W, 960), "#FFFFFF", 1.3, tint=("#FFE9C0", "#BFD8FF")))
    d.append(flower_of_life(270, 560, 34, 6, "#9FB8FF", 0.6, 0.22))
    d.append(f'<circle cx="{dcx}" cy="{dcy}" r="232" fill="{c.rgrad("dglow", [(0.7, "#FFD890", 0.25), (1, "#FFD890", 0)])}"/>')
    d.append(f'<g filter="{c.shadow("dsh", 0, 6, 10, "#000000", 0.6)}">{decan_ring(c, "dr", dcx, dcy, 172, 210)}</g>')
    inner = c.rgrad("din", [(0, "#1E3A9A", 1), (0.7, "#0B1847", 1), (1, "#070F30", 1)])
    d.append(f'<circle cx="{dcx}" cy="{dcy}" r="172" fill="{inner}"/>')
    d.append(star_field(9, 260, (dcx - 172, dcy - 172, dcx + 172, dcy + 172), "#FFFFFF", 1.1))
    d.append(f'<g clip-path="url(#rb-dc)">{flower_of_life(dcx, dcy, 24, 6, GOLD_HI, 0.7, 0.35)}{hex_lattice(dcx, dcy, 168, 7, "#9FD8FF", 0.4, 0.12)}</g>')
    c.def_once("dc", f'<clipPath id="rb-dc"><circle cx="{dcx}" cy="{dcy}" r="168"/></clipPath>')
    d.append(shape_constellation("sah", dcx - 104, dcy + 30, 0.7, "#FFE9C0", r=1.6, glow_color="#FFE9C0"))
    d.append(shape_constellation("eye", dcx + 104, dcy + 34, 0.62, "#FFE9C0", r=1.5, glow_color="#FFE9C0"))
    d.append(shape_constellation("scarab", dcx - 70, dcy - 98, 0.45, "#FFE9C0", r=1.3, glow_color="#FFE9C0"))
    d.append(shape_constellation("ankh", dcx + 74, dcy - 96, 0.5, "#FFE9C0", r=1.3, glow_color="#FFE9C0"))
    d.append(f'<circle cx="{dcx}" cy="{dcy}" r="172" fill="none" stroke="{GOLD}" stroke-width="2"/>')
    d.append(f'<circle cx="{dcx}" cy="{dcy}" r="120" fill="none" stroke="{GOLD}" stroke-width="0.8" opacity="0.5" stroke-dasharray="2 5"/>')
    d.append(quartz_cluster(c, "qz", 36, 948, 1.3))
    d.append(quartz_cluster(c, "qz2", 504, 948, 1.3, flip=True, seed=5))
    decorate(c, win, d)
    finish_window(c, win, "#9FB8FF", 0.5, 0.0, 0.22, SILVER3, 4)
    for side in (-1, 1):
        x = 270 + side * 236
        c.add(was_tall(c, f"was{side}", x, 70, 772, GOLD3, flip=side > 0, w=7))
    sn = koch_snowflake(52, 570, 26, 4, "#DFF4FF", 0.9, 0.95) + koch_snowflake(52, 570, 13, 3, "#9FD8FF", 0.7, 0.8, 60)
    c.add(lens(c, "lnl", 52, 570, 34, sn, SILVER3, "#0A1430"))
    hx = hex_lattice(488, 570, 40, 6, "#BFE8FF", 0.8, 0.85) + crystal(c, "lc", 488, 578, 0.42)
    c.add(lens(c, "lnr", 488, 570, 34, hx, SILVER3, "#0A1430"))
    c.add(outer_frame(c, SILVER3))
    c.add(f'<circle cx="{dcx}" cy="{dcy}" r="70" fill="{c.rgrad("cg", [(0, "#FFF2C0", 0.55), (1, "#FFD080", 0)])}"/>')
    crest(c, dcx, dcy - 4, 0.9, METAL)
    birds(c, [("mee-wow", 104, 702, 132, False, -6), ("meo-bravo", 436, 702, 132, True, 6)])
    inscription(c, KICK, "Oracle", "Le ciel nous attend", y=774, style="nuit", metal=SILVER3, panel=NIGHT_PANEL, ink="#F2F6FF")
    save(c, "oracle-b", RANK, None, "B", "Le Zodiaque de Dendera",
         "Le ciel rond du temple de Dendera (Égypte) tourne au-dessus de la photo : sur son anneau, les trente-six décans voguent chacun sur sa "
         "barque, l'horloge des étoiles des prêtres ; au centre, Sah, l'œil, le scarabée et l'ankh sont devenus constellations, et deux sceptres "
         "ouas portent le ciel. Derrière le blason, la fleur de vie d'Abydos et le réseau du quartz ; dans les oculaires, un flocon fractal et les alvéoles d'un cristal.",
         "pied (Mee wow, Meo bravo)", "Le ciel nous attend")


# =============================================================== C - La Barque de nuit

def ora_c():
    c = start("rc", "#2A2240", "#0A0814", "#C9D2FF", 0.2)
    win = rrect(96, 302, 444, 736, 18)
    d = [night_bg(c, "bg", "#06041A", "#140A3A", "#0A0618")]
    d.append(nebula_cloud(c, "nb1", 120, 140, 200, 150, "#B04AFF", "#2A1A7A", 0.6, seed=21))
    d.append(nebula_cloud(c, "nb2", 440, 120, 180, 140, "#4A9AFF", "#1A1A6A", 0.55, seed=23))
    d.append(star_field(11, 700, (0, 0, W, 960), "#FFFFFF", 1.3, tint=("#FFE9C0", "#D8C8FF")))
    d.append(milky_way(c, "mw", (-60, 330), (270, 130), (600, 330), 70, seed=31, n=1800, glow="#D8C8FF", warm="#FFE2B8"))
    d.append(milky_way(c, "mw2", (40, 980), (-30, 600), (60, 300), 46, seed=33, n=700, glow="#D8C8FF", op=0.7))
    d.append(milky_way(c, "mw3", (500, 980), (570, 600), (480, 300), 46, seed=35, n=700, glow="#D8C8FF", op=0.7))
    d.append(shape_constellation("eye", 92, 72, 0.8, "#FFE9C0", r=1.7, glow_color="#FFE9C0"))
    d.append(shape_constellation("ankh", 458, 78, 0.62, "#FFE9C0", r=1.7, glow_color="#FFE9C0"))
    coil = [(-30, 770), (40, 730), (70, 800), (100, 870), (40, 900), (-10, 930), (100, 952), (270, 972), (440, 952), (550, 930), (500, 900),
            (440, 870), (470, 800), (500, 730), (570, 770)]
    d.append(serpent_coils(c, "apo", coil, 24))
    decorate(c, win, d)
    finish_window(c, win, "#B9A8FF", 0.5, 0.0, 0.22, SILVER3, 4)
    for side in (-1, 1):
        x = 270 + side * 222
        ys = [336 + k * 66 for k in range(6)]
        c.add(f'<line x1="{x}" y1="{ys[0]}" x2="{x}" y2="{ys[-1]}" stroke="{GOLD}" stroke-width="1" opacity="0.6" stroke-dasharray="2 4"/>')
        for k, y in enumerate(ys):
            ph = k if side < 0 else 11 - k
            c.add(hour_sun(c, f"hs{side}{k}", x, y, 11, ph))
    c.add(f'<g filter="{c.shadow("bqs", 0, 6, 6, "#000000", 0.5)}">{barque(c, "bq", 270, 248, 1.0, sun=False, cabin=None)}</g>')
    c.add(f'<circle cx="270" cy="150" r="86" fill="{c.rgrad("sg", [(0, "#FFE6A0", 0.6), (0.5, "#FF9A50", 0.18), (1, "#FF9A50", 0)])}"/>')
    frac = wedjat_spiral(28, 160, 56, 36, 7, GOLD_HI, 1.1, 0.95) + wedjat(56, 178, 0.38, "#FFE9C0", w=3, op=0.55)
    c.add(lens(c, "lnl", 54, 180, 32, frac, SILVER3, "#0A1430"))
    c.add(lens(c, "lnr", 486, 180, 32, cell(c, "cl", 486, 180, 24), SILVER3, "#0A1430"))
    c.add(outer_frame(c, SILVER3))
    crest(c, 270, 146, 0.86, METAL)
    birds(c, [("mee-montee-au-ciel", 104, 704, 128, False, -4), ("meo-feu-artifice", 436, 704, 128, True, 4)])
    inscription(c, KICK, "Oracle", "On ira plus loin", y=774, style="nuit", metal=SILVER3, panel=NIGHT_PANEL, ink="#F2F6FF")
    save(c, "oracle-c", RANK, None, "C", "La Barque de nuit",
         "Chaque nuit, la barque de Rê traverse le fleuve d'étoiles de la Douat ; le blason y tient la place du soleil. Les douze portes des heures "
         "de la nuit s'allument le long de la photo, et en bas Apophis, le serpent du chaos, enroule ses anneaux sans pouvoir l'arrêter. "
         "L'œil et l'ankh sont devenus constellations ; les oculaires montrent l'infime : les fractions de l'œil qui se divisent sans fin, et une cellule.",
         "pied (Mee montée au ciel, Meo feu d'artifice)", "On ira plus loin")
