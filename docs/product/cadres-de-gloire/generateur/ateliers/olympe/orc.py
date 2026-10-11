"""Oracle : trois cadres où le ciel s'ouvre (constellations en fils d'or) et où l'on entrevoit le minuscule
(cristaux, flocon fractal, géométrie sacrée, diatomées, pollen, molécules d'eau), mêlés aux mythes grecs."""

import random

from cadre import *  # noqa: F401,F403
from archi import column, TONES
from figures import eagle, owl, horse, smooth, wing
from cosmos import (star_field, outside, ublur, neb, constellation, thread, night, snowflake, koch, flower_of_life, hex_lattice,
                    diatom, pollen, flare, concentric, nebula_field)

GEM = "#6EC8FF"
SILVER = "#DCE6F5"
THREAD = "#FFE6A0"


def tholos(card, x, by, s, tone="night"):
    """Les ruines du tholos de Delphes : socle circulaire, trois colonnes doriques debout, un fragment d'entablement."""
    li, cl, mo, om, pr, dk, lt = TONES[tone]
    out = [f'<ellipse cx="{f(x)}" cy="{f(by)}" rx="{f(70 * s)}" ry="{f(14 * s)}" fill="{om}"/>',
           f'<ellipse cx="{f(x)}" cy="{f(by - 6 * s)}" rx="{f(66 * s)}" ry="{f(12 * s)}" fill="{mo}"/>',
           f'<ellipse cx="{f(x)}" cy="{f(by - 10 * s)}" rx="{f(62 * s)}" ry="{f(10 * s)}" fill="{cl}" opacity="0.8"/>']
    cols = [(x - 40 * s, 170 * s), (x - 4 * s, 176 * s), (x + 34 * s, 120 * s)]
    for cx, h in cols:
        out.append(column(card, cx, by - 10 * s - h, by - 10 * s, 18 * s, "doric", tone, flutes=8, base=False))
    out.append(f'<path d="M{f(x - 54 * s)} {f(by - 10 * s - 176 * s)} L{f(x + 12 * s)} {f(by - 10 * s - 182 * s)} L{f(x + 16 * s)} {f(by - 10 * s - 168 * s)} '
               f'L{f(x - 52 * s)} {f(by - 10 * s - 162 * s)}Z" fill="{cl}"/>'
               f'<path d="M{f(x - 54 * s)} {f(by - 10 * s - 162 * s)} L{f(x + 16 * s)} {f(by - 10 * s - 168 * s)} L{f(x + 14 * s)} {f(by - 10 * s - 160 * s)} L{f(x - 52 * s)} {f(by - 10 * s - 154 * s)}Z" fill="{om}"/>')
    for k in range(4):
        out.append(f'<rect x="{f(x - 46 * s + k * 16 * s)}" y="{f(by - 10 * s - 166 * s - k * 1.2 * s)}" width="{f(4 * s)}" height="{f(9 * s)}" fill="{pr}" opacity="0.7"/>')
    out.append(f'<path d="M{f(x + 26 * s)} {f(by - 4 * s)} l{f(14 * s)} {f(-6 * s)} l{f(10 * s)} {f(4 * s)} l{f(-6 * s)} {f(8 * s)}Z" fill="{mo}"/>')
    return "".join(out)


def water_molecule(cx, cy, s, rot=0, o="#FF5A6E", h="#F4F8FF", bond="#DCE6F5"):
    """H₂O en boules et bâtonnets : l'oxygène et ses deux hydrogènes à 104,5°."""
    from common import pt as _pt
    out = []
    for da in (-52.25, 52.25):
        hx, hy = _pt(cx, cy, 13 * s, rot + da)
        out.append(f'<path d="M{f(cx)} {f(cy)} L{f(hx)} {f(hy)}" stroke="{bond}" stroke-width="{f(2.4 * s)}"/>')
        out.append(f'<circle cx="{f(hx)}" cy="{f(hy)}" r="{f(4.2 * s)}" fill="{h}"/><circle cx="{f(hx - 1.2 * s)}" cy="{f(hy - 1.2 * s)}" r="{f(1.4 * s)}" fill="#FFFFFF"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(6.4 * s)}" fill="{o}"/><circle cx="{f(cx - 2 * s)}" cy="{f(cy - 2 * s)}" r="{f(2.2 * s)}" fill="#FFFFFF" opacity="0.7"/>')
    return "".join(out)


def drop(card, cx, cy, r, inner=""):
    """Une goutte grossie comme une lentille : on y voit ce qui la compose."""
    g = card.rgrad("drop-g", [(0, "#FFFFFF", 0.08), (0.75, "#9FD8FF", 0.16), (0.95, "#E8F6FF", 0.75), (1, "#9FD8FF", 0)])
    return (f'<path d="M{f(cx)} {f(cy - r * 1.5)} C{f(cx + r * 0.3)} {f(cy - r)} {f(cx + r)} {f(cy - r * 0.4)} {f(cx + r)} {f(cy + r * 0.1)} '
            f'A{f(r)} {f(r)} 0 0 1 {f(cx - r)} {f(cy + r * 0.1)} C{f(cx - r)} {f(cy - r * 0.4)} {f(cx - r * 0.3)} {f(cy - r)} {f(cx)} {f(cy - r * 1.5)}Z" fill="{g}" stroke="#CFEAFF" stroke-width="0.8" opacity="0.95"/>'
            f'{inner}<ellipse cx="{f(cx - r * 0.4)}" cy="{f(cy - r * 0.3)}" rx="{f(r * 0.18)}" ry="{f(r * 0.32)}" fill="#FFFFFF" opacity="0.6" transform="rotate(30 {f(cx - r * 0.4)} {f(cy - r * 0.3)})"/>')


# ---------------------------------------------------------------- A — Les Deux Aigles de Delphes

def orc_a():
    c = start("ra", top="#1E2638", bottom="#0A0D16", rim="#CFE0FF")
    wp = window_path(92, 264, 448, 732, 14, arch="flat")
    m = window(c, "ra-win", wp)
    nebula_field(c, m, 2, [(270, 130, 300, 150, "#5A7AFF", "#1A1A6A", 0.7), (50, 560, 120, 300, "#8A5AD8", "#1A1050", 0.6),
                           (500, 600, 110, 290, "#3A9AE8", "#0A2050", 0.6), (270, 860, 300, 110, "#6A8AFF", "#0A1A4A", 0.5)],
                 band=((-20, 760), (270, 420), (560, 760), 46), base=("#03051A", "#0C1640", "#0A0C24"), stars=460, flares=6)
    tf = thread(c, "ra-thr", 1.1, THREAD, 0.12, 2.2)
    for x, flip in ((112, False), (428, True)):
        c.add(f'<g filter="{tf}">{eagle(x, 168, 0.74, THREAD, flip=flip, dark=THREAD, light=THREAD)}</g>')
        c.add(f'<g opacity="0.55">{eagle(x, 168, 0.74, "none", flip=flip, dark=THREAD, light="none")}</g>')
        c.add(constellation(c, "aquila", x + (8 if not flip else -8), 172, 70, THREAD, rot=-20 if not flip else 20, flip=flip, w=0.8, star=1.8, op=0.7))
    c.add(constellation(c, "orion", 46, 600, 110, THREAD, rot=0, w=0.9, star=2.0, op=0.85))
    c.add(constellation(c, "pleiades", 498, 340, 60, "#CFE0FF", w=0.6, star=1.6, op=0.6))
    c.add(constellation(c, "cassiopeia", 496, 610, 84, THREAD, rot=90, w=0.8, star=1.8, op=0.8))
    rnd = random.Random(4)
    for x, y, r, d in ((40, 300, 18, 3), (500, 250, 14, 2), (24, 700, 14, 3), (512, 700, 13, 3), (488, 360, 9, 2), (66, 520, 8, 2), (478, 790, 10, 2), (64, 790, 9, 2)):
        c.add(f'<g filter="{c.shadow("ra-snow", 0, 0, 3, "#9FD8FF", 0.9)}">{snowflake(x, y, r, SILVER, d, 0.9, rot=rnd.uniform(0, 30))}</g>')
    lat = hex_lattice(150, 50, 390, 240, 9, "#CFE0FF", 0.6, 0.4, atoms="#FFFFFF", keep=lambda x, y: (x - 270) ** 2 + ((y - 146) * 1.1) ** 2 < 96 ** 2)
    c.add(f'<g opacity="0.75">{lat}</g>')
    c.add(f'<circle cx="270" cy="146" r="108" fill="none" stroke="#CFE0FF" stroke-width="0.8" opacity="0.5"/>')
    c.add(f'<circle cx="270" cy="146" r="80" fill="{c.rgrad("ra-halo", [(0, "#E8F4FF", 0.65), (1, "#E8F4FF", 0)])}"/>')
    mt = "M0 790 L40 760 L76 772 L120 744 L170 768 L230 740 L290 766 L350 742 L400 764 L460 738 L510 760 L540 750 L540 960 L0 960Z"
    from retouche import rock_filter
    rk = rock_filter(c, "ra-rk", freq="0.03 0.06", seed=5, scale=3.0, az=220, el=50, k1=1.35)
    c.add(f'<g filter="{rk}"><path d="{mt}" fill="{c.grad("ra-mt", [(0, "#4A6094"), (0.35, "#22305A"), (1, "#070A18")])}"/></g>')
    c.add(f'<ellipse cx="270" cy="744" rx="300" ry="40" fill="{c.rgrad("ra-mglow", [(0, "#BFD8FF", 0.35), (1, "#BFD8FF", 0)])}"/>')
    c.add(f'<path d="M0 790 L40 760 L76 772 L120 744 L170 768 L230 740 L290 766 L350 742 L400 764 L460 738 L510 760 L540 750" fill="none" stroke="#9FB8E8" stroke-width="1.2" opacity="0.7"/>')
    c.add(f'<g filter="{c.shadow("ra-th2", 0, 4, 5, "#000000", 0.6)}">{tholos(c, 64, 790, 0.62)}</g>')
    inner_shadow(c, wp, 22, 0.8)
    gold_line(c, wp, 2.2, "silver")
    c.add(koch(64, 900, 26, SILVER, 3, 0.8, op=0.7), koch(476, 900, 26, SILVER, 3, 0.8, rot=60, op=0.7))
    crest(c, 270, 142, 0.9, "silver", division=None, gem=GEM)
    mee_meo(c, "cotes", "mee-montee-au-ciel", "meo-love")
    stele(c, "nuit", y=800, title="Oracle", orn="stars", x0=104, x1=436)
    frame_border(c, "silver", 8, 2.2)
    c.save(OUT / f"{SLUG}-oracle-a.svg")
    register("oracle-a", "oracle", None, "A", "Les Deux Aigles de Delphes",
             "Zeus lâcha deux aigles aux deux bouts du monde ; ils se rejoignirent à Delphes, le nombril de la Terre. Ici ils "
             "volent en fils d'or vers le blason, portant les étoiles de l'Aigle ; le filet de l'omphalos devient un réseau "
             "cristallin et la nuit est semée de flocons fractals, au-dessus des ruines du tholos et du Parnasse.",
             "cotes : Mee (montée au ciel) et Meo (love) se penchent par les côtés", None)


# ---------------------------------------------------------------- B — La Chouette d'Athéna

def orc_b():
    c = start("rb", top="#1E2A34", bottom="#0A0E12", rim="#CFE0FF")
    cx, cy, rx, ry = 270, 500, 178, 236
    wp = window_path(cx - rx, cy - ry, cx + rx, cy + ry, arch="oval")
    m = window(c, "rb-win", wp)
    night(c, m, 7, "#020812", "#0A2236", "#06121E")
    c.add(f'<g mask="{m}">{neb(c, "rb-n1", 270, 160, 280, 170, "#3AA8B8", "#0A2A4A", 0.5, seed=3)}{neb(c, "rb-n2", 270, 900, 300, 120, "#2A6AA8", "#081A30", 0.45, seed=5)}</g>')
    c.add(f'<g mask="{m}" opacity="0.5">{flower_of_life(270, 146, 26, "#CFE0FF", 3, 0.7)}</g>')
    c.add(f'<g mask="{m}" opacity="0.35">{concentric(cx, cy, ry + 16, 14, 6, "#CFE0FF", 0.8, 0.8)}</g>')
    c.add(constellation(c, "ursa", 446, 70, 120, THREAD, rot=-8, w=0.9, star=2.0, op=0.85))
    ux = [(0.0, 0.0, 1), (0.22, 0.12, 3), (0.42, 0.18, 3), (0.62, 0.3, 3), (0.62, 0.52, 2), (0.86, 0.6, 2), (0.84, 0.36, 3)]
    from cosmos import CONST
    CONST["ursa-min"] = (ux, [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (5, 6), (6, 3)])
    c.add(constellation(c, "ursa-min", 92, 70, 100, THREAD, rot=10, w=0.8, star=1.9, op=0.8))
    for i, (x, y, r, k, rot) in enumerate(((44, 330, 24, 0, 0), (500, 310, 20, 2, 10), (36, 470, 16, 1, 60), (506, 470, 26, 0, 20), (40, 600, 20, 2, 0),
                                           (504, 620, 15, 1, -40), (60, 410, 9, 0, 0), (480, 390, 10, 2, 0))):
        c.add(f'<g filter="{c.shadow("rb-dg", 0, 0, 3, "#7FE0E8", 0.9)}">{diatom(x, y, r, "#CFF4F8", k, 0.8, 0.9, rot)}</g>')
    for x, y, r in ((60, 720, 16), (486, 740, 14), (30, 410, 7)):
        c.add(pollen(c, "rb-pol", x, y, r, "#FFD36E", "#A86A10", 0, 3, rot=20))
    c.add(f'<circle cx="270" cy="146" r="86" fill="{c.rgrad("rb-halo", [(0, "#E8F4FF", 0.6), (1, "#E8F4FF", 0)])}"/>')
    inner_shadow(c, wp, 24, 0.8)
    gold_line(c, wp, 2.4, "silver")
    rel = relief(c, "rb-rel", scale=2.0, blur=0.8, spec=0.9, exp=22, drop=0.5, dy=2, sd=2, light="#F2F8FF")
    c.add(f'<g filter="{rel}">{branch((128, 330), (150, 300), (186, 286), 7, 22, 8, "#9FB0C8", rib="#3A4458", berries="#E8F0FF", under="#E2EAF5", seed=2)}</g>')
    c.add(f'<g filter="{c.shadow("rb-owl", 0, 6, 6, "#000000", 0.6)}"><g filter="{rel}">{owl(c, 110, 300, 0.92, body="#B9C3D6", dark="#3A4458", light="#F2F6FF", eye="#FFD24A")}</g></g>')
    moon = c.rgrad("rb-moon", [(0, "#FFFFFF", 1), (0.7, "#E8EEF8", 1), (1, "#AFC0DA", 1)])
    c.add(f'<circle cx="440" cy="296" r="56" fill="{c.rgrad("rb-mh", [(0, "#E8F4FF", 0.35), (1, "#E8F4FF", 0)])}"/>')
    c.add(f'<path d="M440 266 A30 30 0 1 0 440 326 A40 40 0 1 1 440 266Z" fill="{moon}" transform="rotate(-25 440 296)"/>')
    c.add(f'<g filter="{rel}">{branch((420, 340), (396, 316), (378, 296), 5, 22, 8, "#9FB0C8", rib="#3A4458", berries="#E8F0FF", under="#E2EAF5", seed=5)}</g>')
    c.add(f'<g filter="{rel}">{oval_wreath(cx, cy, rx + 12, ry + 10, "#AFC0DA", under="#E8EEF8", rib="#3A4458", berries="#F2F6FF", n=18, L=26, w=9, gap=120, bottom_gap=26, seed=3)}</g>')
    crest(c, 270, 144, 0.9, "silver", division=None, gem=GEM)
    mee_meo(c, "ruban", "mee-wow", "meo-cool")
    stele(c, "nuit", y=782, title="Oracle", message="Sous les mêmes étoiles", orn="rosettes", x0=96, x1=444)
    frame_border(c, "silver", 8, 2.2)
    c.save(OUT / f"{SLUG}-oracle-b.svg")
    register("oracle-b", "oracle", None, "B", "La Chouette d'Athéna",
             "Comme sur la tétradrachme d'Athènes, la chouette aux yeux d'or, un rameau d'olivier et un croissant de lune "
             "entourent la photo ; au ciel, la Grande et la Petite Ourse (Callisto et son fils Arcas) ; derrière le blason une "
             "fleur de vie, et des diatomées de verre et des grains de pollen d'olivier flottent comme des étoiles.",
             "ruban : Mee (wow) et Meo (cool) au bord de la stèle", "Sous les mêmes étoiles")


# ---------------------------------------------------------------- C — Pégase et la source Hippocrène

def orc_c():
    from retouche import loupe, zoom_lines
    from cosmos import atom, small_galaxy, spiral_galaxy
    c = start("rc", top="#221E38", bottom="#0C0A16", rim="#D8CCFF")
    wp = window_path(96, 258, 444, 730, 14)
    m = window(c, "rc-win", wp)
    night(c, m, 11, "#05031A", "#140C3A", "#0C0A24")
    c.add(f'<g mask="{m}">{neb(c, "rc-n1", 270, 140, 300, 150, "#B46AFF", "#2A0A5A", 0.55, seed=8)}{neb(c, "rc-n2", 480, 420, 120, 220, "#FF6AB8", "#3A0A3A", 0.4, seed=14)}'
          f'{neb(c, "rc-n3", 50, 420, 110, 220, "#6A8AFF", "#0A1450", 0.45, seed=17)}{neb(c, "rc-n4", 270, 930, 300, 90, "#5AC8FF", "#0A2A5A", 0.5, seed=21)}</g>')
    tf = thread(c, "rc-thr", 1.1, THREAD, 0.12, 2.2)
    c.add(f'<g filter="{tf}">{horse(112, 196, 0.6, THREAD, flip=False, wing_fill=THREAD, wing_dark=THREAD, wing_light=THREAD)}</g>')
    c.add(f'<g opacity="0.5">{wing(112 + 14 * 0.6, 196 - 18 * 0.6, 0.57, "none", THREAD, "none")}</g>')
    c.add(constellation(c, "pegasus", 420, 140, 118, THREAD, rot=-8, w=1.0, star=2.2, op=0.9))
    c.add(constellation(c, "andromeda", 486, 300, 84, "#FFD0F0", rot=-60, w=0.8, star=1.8, op=0.75))
    c.add(constellation(c, "perseus", 44, 330, 84, THREAD, rot=10, w=0.8, star=1.8, op=0.7))
    m31 = spiral_galaxy(c, "rc-m31", 498, 236, 46, tilt=0.3, rot=0.9, seed=5, n=700, core="#FFF4E0", arm="#E8D8FF", pink="#FFB0E0", blue="#B0D0FF")
    c.add(loupe(c, "rc-lg", 498, 236, 26, m31, ring=THREAD, bg=("#1A1040", "#05031A"), w=1.6))
    c.add(zoom_lines((470, 262), 3, (498, 236), 26, THREAD, 0.45))
    c.add(f'<circle cx="470" cy="262" r="2.2" fill="#FFFFFF"/>')
    c.add(f'<circle cx="270" cy="142" r="90" fill="{c.rgrad("rc-halo", [(0, "#F4E8FF", 0.6), (1, "#F4E8FF", 0)])}"/>')
    inner_shadow(c, wp, 22, 0.8)
    gold_line(c, wp, 2.4, "silver")
    rnd = random.Random(9)
    spring = []
    for side in (-1, 1):
        for k, (sp, h, op) in enumerate(((120, 150, 0.85), (150, 190, 0.6), (96, 120, 0.7))):
            x1 = 270 + side * (sp + 120)
            d = f"M270 948 C{f(270 + side * 60)} {f(948 - h)} {f(270 + side * (sp + 60))} {f(948 - h * 1.15)} {f(x1)} {f(948 - h * 0.7 + k * 10)}"
            spring.append(f'<path d="{d}" fill="none" stroke="#7FD8FF" stroke-width="{9 - 2 * k}" opacity="{op * 0.6}" filter="{ublur(c, "rc-sp", 4)}"/>'
                          f'<path d="{d}" fill="none" stroke="#E8F8FF" stroke-width="{1.6 - 0.3 * k}" opacity="{op}"/>')
    c.add(f'<g mask="{m}">{"".join(spring)}</g>')
    c.add(f'<ellipse cx="270" cy="950" rx="70" ry="16" fill="{c.rgrad("rc-src", [(0, "#E8F8FF", 0.9), (0.4, "#7FD8FF", 0.4), (1, "#7FD8FF", 0)])}"/>')
    drops = []
    for side, x0 in ((-1, 60), (1, 480)):
        for dx, dy, r in ((side * 18, 760, 6.5), (side * -10, 792, 5), (side * 26, 716, 5), (side * -6, 690, 4), (side * 14, 650, 3.6), (side * -2, 610, 3), (side * 20, 580, 2.6), (side * 6, 560, 2.2)):
            drops.append(drop(c, x0 + dx, dy, r))
        drops.append(gold_dust(77 + side, 40, (x0 - 34, 560, x0 + 34, 800), "#CFF0FF", 1.2, sparkles=0.15))
    c.add("".join(drops))
    mol = "".join(water_molecule(54 + dx, 842 + dy, 0.6, rot=rr) for dx, dy, rr in ((-14, -12, 20), (12, -8, -40), (-2, 12, 70), (18, 16, 10), (-20, 14, -20), (2, -24, 100)))
    c.add(loupe(c, "rc-l1", 54, 842, 34, mol, ring=SILVER))
    oxy = atom(c, "rc-ox", 66, 914, 21, "#9FD8FF", nucleus=("#FF7A6A", "#7AA8FF"), rot=20, w=0.8, seed=8)
    c.add(loupe(c, "rc-l2", 66, 914, 25, oxy, ring=SILVER))
    c.add(zoom_lines((78, 760), 6, (54, 842), 34, SILVER, 0.5), zoom_lines((54, 842), 8, (66, 914), 25, SILVER, 0.45))
    from cosmos import snowflake as _sf, hex_lattice as _hl
    flake = _sf(486, 842, 27, "#E8F4FF", 3, 0.9, rot=8)
    c.add(loupe(c, "rc-l3", 486, 842, 34, flake, ring=SILVER))
    ice = _hl(440, 876, 512, 952, 6.5, "#BFE6FF", 0.7, 0.8, atoms="#FF7A8A", keep=lambda x, y: (x - 474) ** 2 + (y - 914) ** 2 < 25 ** 2)
    c.add(loupe(c, "rc-l4", 474, 914, 25, ice, ring=SILVER))
    c.add(zoom_lines((462, 760), 6, (486, 842), 34, SILVER, 0.5), zoom_lines((486, 842), 8, (474, 914), 25, SILVER, 0.45))
    crest(c, 270, 140, 0.92, "silver", division=None, gem=GEM)
    bird(c, "mee-bisou-vole", 46, 470, 120, False, 14)
    bird(c, "meo-feu-artifice", 496, 520, 120, True, -14)
    stele(c, "nuit", y=784, title="Oracle", orn="stars", x0=104, x1=436)
    frame_border(c, "silver", 8, 2.4)
    c.save(OUT / f"{SLUG}-oracle-c.svg")
    register("oracle-c", "oracle", None, "C", "Pégase et la source Hippocrène",
             "Pégase bondit en fil d'or ; sa constellation, le Grand Carré, mène à Andromède et à sa galaxie, M31, l'objet le plus "
             "lointain que l'œil nu puisse voir, ici grossie dans une loupe. D'un coup de sabot il fit jaillir l'Hippocrène, la "
             "source des Muses : ses gouttes, sous la loupe, deviennent des molécules d'eau puis un atome d'oxygène, ou un flocon "
             "puis le réseau hexagonal de la glace.",
             "cotes : Mee (bisou volé) et Meo (feu d'artifice) se penchent par les côtés", None)


ALL = [orc_a, orc_b, orc_c]
