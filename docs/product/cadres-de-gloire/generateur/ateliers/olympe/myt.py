"""Mythe : trois cadres « du quark au quasar » — toute l'échelle de l'univers dans un seul cadre, les motifs de
l'Olympe devenus constellations ou incrustations. Blason prismatique, « Mythe nº 42 », série « Nº 42 / 100 »."""

import math
import random

from cadre import *  # noqa: F401,F403
from archi import column, TONES, pediment
from figures import smooth, horse, chariot, keraunos, amphora, owl
from cosmos import (star_field, outside, ublur, neb, constellation, thread, snowflake, koch, flower_of_life, hex_lattice,
                    diatom, pollen, flare, concentric, spiral_galaxy, small_galaxy, galaxy_cluster, supernova, black_hole, jet,
                    cosmic_web, atom, nucleus_balls, p_orbital, quarks, dna, neuron, cell, standing_wave, wave_packet, string_loop,
                    nebula_field, milky_band, particle_tracks, quantum_foam)
from orc import water_molecule

THREAD = "#FFE6A0"
TITLE = "Mythe nº 42"


def myth_crest(c, cx, cy, s):
    crest(c, cx, cy, s, "prism", division=None, gem="#FFFFFF", ink="#3A2A8A", edge="#FFFFFF")


def myth_stele(c, y, message=None, x0=96, x1=444):
    stele(c, "prisme", y=y, title=TITLE, message=message, orn=None, x0=x0, x1=x1)
    seal(c, x1 - 6, y - 2, "Nº 42", "/ 100", r=30)


def sun_disc(card, name, cx, cy, r):
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 3)}" fill="{card.rgrad(name + "-h", [(0, "#FFF4C2", 0.8), (0.3, "#FFC24A", 0.35), (1, "#FF7A1A", 0)])}"/>']
    out.append(sunburst(cx, cy, r * 1.05, r * 2.2, 24, "#FFE07A", 9, 0.85))
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{card.rgrad(name + "-c", [(0, "#FFFFFF", 1), (0.5, "#FFE9A0", 1), (1, "#FFB030", 1)])}"/>')
    return "".join(out)


# ---------------------------------------------------------------- A — Le Char d'Hélios

def myt_a():
    from retouche import quadriga
    c = start("ma", top="#2A1E3A", bottom="#0C0816", rim="#FFE0B0")
    wp = window_path(96, 276, 444, 730, 16)
    m = window(c, "ma-win", wp)
    nebula_field(c, m, 51, [(270, 130, 320, 180, "#FFB04A", "#6A1A5A", 0.85), (40, 520, 130, 330, "#6A5AFF", "#0A0A5A", 0.75),
                            (500, 520, 130, 330, "#FF5A8A", "#5A0A3A", 0.7), (270, 900, 320, 120, "#4AC8FF", "#0A2A5A", 0.6)],
                 band=((-30, 640), (200, 360), (580, 140), 60))
    c.add(f'<g mask="{m}">{spiral_galaxy(c, "ma-g", 270, 140, 290, tilt=0.32, rot=0.5, seed=23, n=3000, core="#FFF6E0", arm="#FFB0E0", pink="#FF8FD0", blue="#8FB8FF")}</g>')
    trail = "M246 232 C170 250 96 236 40 262 C10 276 -10 300 -30 320"
    c.add(f'<g mask="{m}"><path d="{trail}" fill="none" stroke="#FF9A3A" stroke-width="58" opacity="0.35" filter="{ublur(c, "ma-tr", 16)}" stroke-linecap="round"/>'
          f'<path d="{trail}" fill="none" stroke="#FFD26A" stroke-width="22" opacity="0.55" filter="{ublur(c, "ma-tr1", 7)}" stroke-linecap="round"/>'
          f'<path d="{trail}" fill="none" stroke="#FFF8E0" stroke-width="5" opacity="0.8" filter="{ublur(c, "ma-tr2", 2)}" stroke-linecap="round"/>'
          f'{gold_dust(61, 120, (0, 214, 250, 330), "#FFF4C2", 1.5, keep=lambda x, y: abs(y - (232 + (246 - x) * 0.2)) < 40, sparkles=0.2)}</g>')
    c.add(constellation(c, "auriga", 450, 330, 110, THREAD, rot=8, w=0.9, star=2.0, op=0.75))
    rel = relief(c, "ma-rel", scale=2.2, blur=0.8, spec=1.2, exp=16, drop=0.5, dy=2, sd=2)
    gold = gold_fill(c)
    c.add(f'<circle cx="270" cy="140" r="150" fill="{c.rgrad("ma-sunh", [(0, "#FFF6D8", 0.95), (0.25, "#FFD26A", 0.6), (0.6, "#FF8A3A", 0.18), (1, "#FF8A3A", 0)])}"/>')
    c.add(f'<g filter="{ublur(c, "ma-cor", 1.2)}">{sunburst(270, 136, 62, 132, 36, "#FFE7A0", 6, 0.75)}</g>')
    c.add(f'<g filter="{c.shadow("ma-team", 0, 3, 4, "#000000", 0.5)}">{quadriga(c, 396, 200, 0.56, rot=-9, tones=("#FFEFB8", "#F5D27A", "#E1A93A", "#B8801C"), dx=17, dy=-9, rel=rel)}</g>')
    car = chariot(252, 238, 1.16, gold, wheel="#FFF4C2")
    c.add(f'<g filter="{rel}">{car}</g>')
    c.add(f'<circle cx="252" cy="238" r="40" fill="{c.rgrad("ma-wh", [(0, "#FFFFFF", 0.5), (1, "#FFE7A0", 0)])}"/>')
    web = cosmic_web(4, (14, 300, 86, 740), 22, "#B9A7FF", w=0.8, op=0.7, k=3, card=c, name="ma-web")
    c.add(f'<g mask="{m}">{web}{galaxy_cluster(3, 50, 330, 40, 16)}</g>')
    c.add(f'<g mask="{m}">{jet(c, "ma-q1", 46, 548, 22, 470, 6)}{jet(c, "ma-q2", 46, 548, 72, 626, 6)}</g>')
    c.add(f'<circle cx="46" cy="548" r="14" fill="{c.rgrad("ma-qc", [(0, "#FFFFFF", 1), (0.4, "#BFE6FF", 0.6), (1, "#BFE6FF", 0)])}"/>{flare(46, 548, 22, "#FFFFFF", 1, 0.05)}')
    c.add(f'<g mask="{m}">{particle_tracks(c, "ma-pt", 494, 560, 22, seed=7, L=150)}</g>')
    c.add(atom(c, "ma-atom", 494, 430, 34, "#FFD0C8", nucleus=("#FF8A7A", "#8AB8FF"), rot=15, w=0.9, seed=7))
    c.add(quarks(494, 500, 13, 1.0))
    c.add(f'<g mask="{m}">{quantum_foam(c, "ma-qf", (450, 640, 540, 760), 26, seed=3, color="#FFB0E0")}</g>')
    c.add(string_loop(494, 690, 16, THREAD, 6, 0.2, 1.1), string_loop(40, 420, 13, "#9FD8FF", 4, 0.22, 1.0))
    inner_shadow(c, wp, 22, 0.8)
    c.add(f'<path d="{wp}" fill="none" stroke="{c.prism("ma-pr", 0, 0, 1, 1)}" stroke-width="2.6"/>')
    myth_crest(c, 270, 134, 0.86)
    mee_meo(c, "pied", "mee-montee-au-ciel", "meo-feu-artifice")
    myth_stele(c, 796)
    frame_border(c, "prism", 8, 2.4)
    c.save(OUT / f"{SLUG}-mythe-a.svg")
    register("mythe-a", "mythe", None, "A", "Le Char d'Hélios",
             "Le blason est le soleil que porte le char d'Hélios : son quadrige d'or bondit à travers une galaxie spirale, sous "
             "le Cocher (Auriga), en laissant un sillage de feu ; d'un côté la toile cosmique, un amas et un quasar, de l'autre "
             "un atome, les quarks d'un proton, les traces d'une collision, une corde qui vibre et la mousse quantique — du quark au quasar.",
             "pied : Mee (montée au ciel) et Meo (feu d'artifice) au pied de la photo", None)


# ---------------------------------------------------------------- B — La Foudre-Quasar

def bolt(x0, y0, x1, y1, seed, segs=9, amp=14):
    rnd = random.Random(seed)
    pts = [(x0, y0)]
    for i in range(1, segs):
        t = i / segs
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t
        nx, ny = -(y1 - y0), (x1 - x0)
        L = math.hypot(nx, ny) or 1
        k = rnd.uniform(-amp, amp)
        pts.append((x + nx / L * k, y + ny / L * k))
    pts.append((x1, y1))
    return "M" + " L".join(f"{f(a)} {f(b)}" for a, b in pts)


def myt_b():
    from retouche import black_hole_crisp, lightning
    c = start("mb", top="#1E1A34", bottom="#0A0814", rim="#D8E8FF")
    wp = window_path(96, 274, 444, 730, 16)
    m = window(c, "mb-win", wp)
    nebula_field(c, m, 61, [(270, 150, 320, 190, "#5A8AFF", "#1A0A6A", 0.85), (50, 560, 130, 330, "#FF6AB8", "#4A0A3A", 0.7),
                            (490, 560, 130, 330, "#6AF0D8", "#0A3A4A", 0.6), (270, 900, 320, 120, "#B46AFF", "#2A0A5A", 0.6)],
                 band=((-20, 260), (270, 520), (560, 260), 50))
    bh_x, bh_y = 270, 144
    c.add(f'<g mask="{m}">{jet(c, "mb-j1", bh_x, bh_y, bh_x, -20, 12, "#BFE6FF")}</g>')
    bolts = [lightning(c, "mb-l1", 70, 150, 18, 30, seed=3, depth=2, amp=0.25, w=2.0),
             lightning(c, "mb-l2", 470, 150, 522, 26, seed=4, depth=2, amp=0.25, w=2.0),
             lightning(c, "mb-l3", 46, 168, 30, 430, seed=5, depth=2, amp=0.42, w=1.8, segs=12),
             lightning(c, "mb-l4", 494, 168, 512, 430, seed=6, depth=2, amp=0.42, w=1.8, segs=12)]
    c.add(f'<g mask="{m}">{"".join(bolts)}</g>')
    c.add(f'<g mask="{m}">{black_hole_crisp(c, "mb-bh", bh_x, bh_y, 58, tilt=0.14, rx_max=4.1)}</g>')
    c.add(constellation(c, "aquila", 488, 330, 96, THREAD, rot=-20, w=0.9, star=2.0, op=0.8))
    c.add(f'<g mask="{m}">{particle_tracks(c, "mb-pt", 46, 560, 26, seed=11, L=170)}</g>')
    c.add(f'<g mask="{m}">{quantum_foam(c, "mb-qf", (0, 640, 90, 760), 30, seed=8, color="#B9D8FF")}</g>')
    for i, (x, y, r, mo) in enumerate(((494, 480, 22, 5), (500, 570, 14, 3), (480, 650, 18, 7))):
        c.add(f'<g filter="{ublur(c, "mb-sg", 2)}" opacity="0.7">{string_loop(x, y, r, THREAD, mo, 0.22, 2.5, rot=i)}</g>{string_loop(x, y, r, THREAD, mo, 0.22, 1.1, rot=i)}')
    c.add(f'<g mask="{m}">{cosmic_web(14, (14, 250, 88, 420), 14, "#B9A7FF", w=0.8, op=0.7, k=3, card=c, name="mb-web")}</g>')
    c.add(f'<g mask="{m}">{galaxy_cluster(6, 470, 880, 60, 28)}{supernova(c, "mb-sn", 66, 880, 40, seed=31)}</g>')
    inner_shadow(c, wp, 22, 0.8)
    c.add(f'<path d="{wp}" fill="none" stroke="{c.prism("mb-pr", 0, 0, 1, 1)}" stroke-width="2.6"/>')
    myth_crest(c, bh_x, bh_y - 2, 0.74)
    mee_meo(c, "cotes", "mee-jackpot", "meo-champagne")
    myth_stele(c, 794, message="Jusqu'au bout de l'univers")
    frame_border(c, "prism", 8, 2.4)
    c.save(OUT / f"{SLUG}-mythe-b.svg")
    register("mythe-b", "mythe", None, "B", "La Foudre-Quasar",
             "La foudre de Zeus devient un quasar : le blason se tient dans l'ombre d'un trou noir, cerclé de son anneau de "
             "photons et du disque d'accrétion que la gravité replie au-dessus de lui ; un jet relativiste monte vers le ciel et "
             "des éclairs ramifiés courent jusqu'aux coins, sous l'Aigle de Zeus, porteur de la foudre ; autour, traces de "
             "particules, mousse quantique, cordes qui vibrent, toile cosmique, amas et supernova.",
             "cotes : Mee (jackpot) et Meo (champagne) se penchent par les côtés", "Jusqu'au bout de l'univers")


# ---------------------------------------------------------------- C — La Colonne des échelles

def label(x, y, mant, exp, color="#E9DDFF", size=9.5):
    return (f'<text x="{f(x)}" y="{f(y)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="{size}" letter-spacing="0.5" fill="{color}">'
            f'{mant}<tspan dy="-3.6" font-size="{f(size * 0.72)}">{exp}</tspan><tspan dy="3.6"> m</tspan></text>')


def drum(card, x, y, w, h, icon, mant, exp, key):
    pr = card.prism("drum-pr", 0, 0, 1, 1)
    out = [f'<rect x="{f(x - w / 2)}" y="{f(y)}" width="{f(w)}" height="{f(h - 3)}" rx="6" fill="{card.grad("drum-bg", [(0, "#1E1640"), (0.5, "#0E0A24"), (1, "#05030F")], 0, 0, 1, 0)}" opacity="0.92"/>',
           f'<rect x="{f(x - w / 2)}" y="{f(y)}" width="{f(w)}" height="{f(h - 3)}" rx="6" fill="none" stroke="{pr}" stroke-width="1.2"/>',
           f'<circle cx="{f(x)}" cy="{f(y + h * 0.42)}" r="{f(h * 0.36)}" fill="{card.rgrad("drum-m", [(0, "#2A1E5A", 1), (1, "#0A0618", 1)])}" stroke="{pr}" stroke-width="0.8"/>',
           f'<g clip-path="{inside(card, f"drum-{key}", f"M{f(x - h * 0.36)} {f(y + h * 0.42)} a{f(h * 0.36)} {f(h * 0.36)} 0 1 0 {f(h * 0.72)} 0 a{f(h * 0.36)} {f(h * 0.36)} 0 1 0 {f(-h * 0.72)} 0Z")}">{icon(x, y + h * 0.42, h * 0.3)}</g>',
           label(x, y + h - 9, mant, exp)]
    return "".join(out)


def myt_c():
    c = start("mc", top="#221A38", bottom="#0A0814", rim="#E8D8FF")
    wp = window_path(100, 282, 440, 730, 14)
    m = window(c, "mc-win", wp)
    nebula_field(c, m, 71, [(270, 130, 320, 180, "#FF6AC8", "#3A0A6A", 0.8), (40, 520, 120, 330, "#4AC8FF", "#0A1A5A", 0.6),
                            (500, 520, 120, 330, "#FFB04A", "#5A1A0A", 0.6), (270, 900, 320, 120, "#8A6AFF", "#1A0A5A", 0.6)],
                 band=((-20, 120), (270, 300), (560, 120), 50))
    pr = c.prism("mc-pr", 0, 0, 1, 0)
    ped = (f"M10 250 L270 92 L530 250Z")
    c.add(f'<path d="{ped}" fill="#0A0618" opacity="0.7"/>')
    c.add(f'<g clip-path="{inside(c, "mc-pclip", ped)}">{cosmic_web(21, (20, 90, 520, 250), 34, "#E9DDFF", w=0.8, op=0.8, k=3, card=c, name="mc-web")}'
          f'{galaxy_cluster(4, 120, 220, 30, 12)}{galaxy_cluster(5, 420, 220, 30, 12)}</g>')
    c.add(f'<path d="{ped}" fill="none" stroke="{pr}" stroke-width="3"/><path d="M10 250 L530 250" stroke="{pr}" stroke-width="4"/>')
    c.add(f'<path d="M30 244 L270 102 L510 244" fill="none" stroke="#FFFFFF" stroke-width="0.8" opacity="0.6"/>')
    c.add(label(270, 240, "10", "26", "#FFFFFF", 10))
    w, top, bot = 70, 262, 742
    n = 6
    h = (bot - top) / n
    rnd = random.Random(2)
    left = [
        ("amph", lambda x, y, r: amphora(c, x, y - r * 1.15, r * 2.3, seed=9), "10", "0"),
        ("neur", lambda x, y, r: neuron(c, "mc-ne", x, y + r * 0.2, r * 0.026, "#FFD36E", "#FFB0E0", seed=4, axon=(180, r * 30), depth=3), "10", "−4"),
        ("cell", lambda x, y, r: cell(c, "mc-ce", x, y, r * 0.95, seed=3), "10", "−5"),
        ("dna", lambda x, y, r: dna(x, y - r, y + r, r * 0.42, r * 1.2, "#FF6A7A", "#7FE0FF", w=1.6), "10", "−9"),
        ("atom", lambda x, y, r: atom(c, "mc-at", x, y, r * 0.95, "#9FD8FF", w=0.8, seed=3), "10", "−10"),
        ("quark", lambda x, y, r: quarks(x, y, r * 0.45, 0.8), "10", "−18"),
    ]
    right = [
        ("clus", lambda x, y, r: galaxy_cluster(7, x, y, r, 18), "10", "23"),
        ("gal", lambda x, y, r: spiral_galaxy(c, "mc-gal", x, y, r * 0.95, tilt=0.5, rot=0.5, seed=4, n=260), "10", "21"),
        ("neb", lambda x, y, r: neb(c, "mc-nb", x, y, r * 0.9, r * 0.7, "#FF6AB8", "#5A1A8A", 0.95, freq=0.06, seed=5, a=2.2, b=-0.5) + star_field(5, 14, (x - r, y - r, x + r, y + r), rmax=1), "10", "17"),
        ("sys", lambda x, y, r: "".join(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(r * k)}" ry="{f(r * k * 0.4)}" fill="none" stroke="#FFE6A0" stroke-width="0.7"/>' for k in (0.35, 0.6, 0.85))
         + f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.16)}" fill="#FFE07A"/><circle cx="{f(x + r * 0.6)}" cy="{f(y + r * 0.1)}" r="2" fill="#9FD8FF"/>', "10", "13"),
        ("sun", lambda x, y, r: sun_disc(c, "mc-sun", x, y, r * 0.42), "10", "9"),
        ("earth", lambda x, y, r: f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.7)}" fill="{c.rgrad("mc-earth", [(0, "#BFE6FF", 1), (0.5, "#2A7CC6", 1), (1, "#0B2447", 1)], 0.35, 0.35, 0.7)}"/>'
         f'<path d="M{f(x - r * 0.4)} {f(y - r * 0.2)} q{f(r * 0.2)} {f(-r * 0.3)} {f(r * 0.4)} {f(-r * 0.1)} q{f(r * 0.1)} {f(r * 0.3)} {f(-r * 0.2)} {f(r * 0.4)}Z M{f(x + r * 0.1)} {f(y + r * 0.2)} q{f(r * 0.3)} {f(-r * 0.1)} {f(r * 0.3)} {f(r * 0.2)} q{f(-r * 0.1)} {f(r * 0.2)} {f(-r * 0.3)} {f(r * 0.1)}Z" fill="#E8F2D8" opacity="0.85"/>', "10", "7"),
    ]
    for i, (key, icon, mant, exp) in enumerate(left):
        c.add(drum(c, 46, top + i * h, w, h, icon, mant, exp, key))
    for i, (key, icon, mant, exp) in enumerate(right):
        c.add(drum(c, 494, top + i * h, w, h, icon, mant, exp, key))
    for x in (46, 494):
        c.add(f'<rect x="{f(x - w / 2 - 6)}" y="252" width="{f(w + 12)}" height="10" rx="3" fill="{pr}"/>')
    c.add(f'<rect x="0" y="744" width="540" height="216" fill="{c.grad("mc-floor", [(0, "#140C30"), (1, "#05030C")])}"/>')
    c.add(f'<rect x="0" y="744" width="540" height="3" fill="{pr}"/>')
    c.add(quantum_foam(c, "mc-qf", (10, 752, 530, 950), 120, seed=13, color="#C8B8FF", rmin=2, rmax=9, op=0.85))
    c.add(label(40, 940, "10", "−35", "#FFFFFF", 10))
    inner_shadow(c, wp, 22, 0.8)
    c.add(f'<path d="{wp}" fill="none" stroke="{c.prism("mc-pr2", 0, 0, 1, 1)}" stroke-width="2.6"/>')
    c.add(f'<circle cx="270" cy="168" r="80" fill="{c.rgrad("mc-halo", [(0, "#FFFFFF", 0.7), (1, "#FFFFFF", 0)])}"/>')
    myth_crest(c, 270, 166, 0.78)
    mee_meo(c, "perches", "mee-wow", "meo-trophee")
    myth_stele(c, 798, message="Ensemble, plus loin")
    frame_border(c, "prism", 8, 2.4)
    c.save(OUT / f"{SLUG}-mythe-c.svg")
    register("mythe-c", "mythe", None, "C", "La Colonne des échelles",
             "Un temple de l'univers entier : la colonne de gauche monte du quark (10⁻¹⁸ m) à l'atome, l'ADN, la cellule, le neurone "
             "et l'amphore grecque à hauteur d'homme ; celle de droite, de la Terre au Soleil, au système solaire, à une nébuleuse, "
             "une galaxie et un amas ; le fronton est la toile cosmique (10²⁶ m) et le sol la mousse quantique (10⁻³⁵ m).",
             "perches : Mee (wow) et Meo (trophée) sur les rampants du fronton cosmique", "Ensemble, plus loin")


ALL = [myt_a, myt_b, myt_c]
