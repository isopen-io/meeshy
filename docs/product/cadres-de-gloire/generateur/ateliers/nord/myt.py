"""Aurores du Nord - MYTHE A, B, C : « du quark au quasar ». Blason prisme, Mythe nº 42, Nº 42 / 100."""

import math
import random

from common import *  # noqa: F401,F403
from cosmos import (star_field, bright_stars, cstar, constellation, nebula, milky_way, spiral_galaxy, mini_galaxy, elliptical,
                    globular, galaxy_cluster, black_hole, quasar, jet, supernova, cosmic_web, atom, orbital, nucleus, dna,
                    neuron, cell, dendrite, ice_lattice, wave_packet, interference, particle_tracks, quantum_foam,
                    string_loop, open_string, SPECTRUM, corona_soft)
from beasts import world_tree, dragon_head2

TITLE = "Mythe nº 42"
BADGE = "Nº 42 / 100"
PRISM_C = ("#FF6FB1", "#FFD36E", "#6EF0C2", "#6EA8FF", "#B36EFF")


def prism_rim(c, d, name="prim", w=4):
    pr = c.prism(name, 0, 0, 1, 1)
    return (f'<path d="{d}" fill="none" stroke="{pr}" stroke-width="{f(w * 3)}" opacity="0.45" filter="{ublur(c, name + "-b", 5)}"/>'
            f'<path d="{d}" fill="none" stroke="{pr}" stroke-width="{f(w)}"/>'
            f'<path d="{d}" fill="none" stroke="#FFFFFF" stroke-width="0.8" opacity="0.7"/>')


def prism_frame(c, name="pf"):
    pr = c.prism(name, 0, 0, 1, 1)
    return (f'<rect x="12" y="12" width="{W - 24}" height="{H - 24}" rx="22" fill="none" stroke="{pr}" stroke-width="3.5"/>'
            f'<rect x="19" y="19" width="{W - 38}" height="{H - 38}" rx="17" fill="none" stroke="#FFFFFF" stroke-width="0.7" opacity="0.45"/>')


from base import plate_layer  # noqa: E402  la couche « plate » et ses emplacements de texte


@plate_layer
def mythe_plaque(c, message, y=790, w=430):
    inscription(c, TITLE, message, y=y, style="cosmos", metal=PRISME, panel=("#120C2E", "#04030C"), kicker=kicker(), w=w, title_size=40)
    c.add(numero_badge(c, 270, y, BADGE))


def mythe_crest(c, cx=270, cy=150, s=0.9, glow="#FFFFFF", r=80):
    crest_block(c, cx, cy, s, "prism", None, glow=glow, glow_r=r)


def deep(c, name, seed, stops=("#000006", "#05041A", "#0C0A2A", "#030210"), n=420):
    return sky(c, name, [(0, stops[0]), (0.35, stops[1]), (0.7, stops[2]), (1, stops[3])]) + star_field(seed, n, keep=KEEP)


# =============================================================== A — Fenrir dévore le soleil

FENRIR = [(118, -84, 1), (112, -100), (70, -106), (10, -108), (-40, -122), (-78, -138, 1), (-128, -142, 1), (-140, -110, 1), (-178, -96),
          (-214, -60), (-240, 10), (-236, 90), (-190, 130), (-120, 122), (-40, 110), (40, 98), (96, 92), (104, 78, 1),
          (60, 60), (0, 46), (-60, 14, 1), (0, -40), (60, -62), (110, -76, 1)]
FENRIR_FANGS = [((104, -75), (98, -48)), ((70, -64), (66, -44)), ((92, 79), (88, 54)), ((58, 60), (56, 42))]


def fenrir_at(ox, oy, s=1.0):
    return [(ox - x * s, oy + y * s) + ((1,) if len(p) > 2 else ()) for p in FENRIR for x, y in [p[:2]]]


def mytA():
    c = start("mA", "#1C1834", "#06040F", "#E8DCFF", 0.22)
    win = rrect(84, 300, 456, 722, 26)
    m = deco_mask(c, win)
    d = [deep(c, "sky", 201)]
    d.append(nebula(c, "nb1", 90, 160, 150, 150, "#4FC3FF", "#0E1E50", 0.5, seed=3))
    d.append(nebula(c, "nb2", 470, 520, 120, 260, "#FF6FB1", "#3A0E4A", 0.4, seed=7))
    d.append(cosmic_web(c, "cw", 11, (18, 40, 150, 290), n=13, k=2, color="#9FB8FF", w=1.0, op=0.9))
    d.append(cosmic_web(c, "cw2", 15, (16, 300, 84, 760), n=8, k=2, color="#9FB8FF", w=0.9, op=0.75))
    d.append(galaxy_cluster(c, "gc", 6, 60, 520, 22, 8))
    d.append(quasar(c, "qs", 48, 790, 7, 120, 38, "#9FD8FF"))
    head = [(170, 92, 1), (184, 80), (230, 73), (290, 65), (338, 55), (374, 45), (404, 41), (414, 39, 1), (436, 12, 1), (462, 44, 1),
            (490, 50), (512, 44, 1), (520, 68, 1), (540, 62, 1), (546, 96, 1), (566, 140), (566, 300, 1), (520, 302, 1), (500, 288, 1), (486, 296, 1), (468, 280, 1),
            (452, 286, 1), (420, 268), (350, 262), (270, 256), (204, 246), (180, 236, 1), (216, 226), (270, 214), (330, 200), (372, 186), (398, 172, 1),
            (372, 156), (330, 136), (270, 118), (214, 106), (178, 100, 1)]
    pts = [(p[0], p[1]) for p in head]
    head_d = shape(head)
    neb = c.rgrad("fen", [(0, "#8A6CFF", 0.85), (0.55, "#3A22A0", 0.75), (1, "#120A40", 0.6)], 0.62, 0.38, 0.75)
    d.append(f'<path d="{head_d}" fill="#000000" opacity="0.6" filter="{ublur(c, "fsh", 10)}"/>')
    d.append(f'<path d="{head_d}" fill="{neb}"/>')
    d.append(f'<path d="{head_d}" fill="#C7A8FF" opacity="0.55" filter="{noise_filter(c, "fenn", "0.028", 4, 9, 2.8, -0.9)}"/>')
    d.append(f'<g clip-path="{win_clip(c, head_d, "fhc")}">{star_field(77, 260, (160, 0, 560, 310), rmax=1.4)}'
             f'<path d="M380 120 C420 160 470 190 540 200" fill="none" stroke="#1A0E50" stroke-width="30" opacity="0.5" filter="{ublur(c, "fcheek", 10)}"/></g>')
    rnd = random.Random(4)
    fur = []
    for k in range(22):
        t = k / 21
        x, y = 400 + 140 * t + rnd.uniform(-6, 6), 196 + 90 * t + rnd.uniform(-10, 10)
        fur.append(f"M{f(x)} {f(y)} q{f(rnd.uniform(10, 22))} {f(rnd.uniform(6, 16))} {f(rnd.uniform(18, 34))} {f(rnd.uniform(16, 30))}")
    for k in range(10):
        x, y = 420 + k * 12 + rnd.uniform(-4, 4), 60 + k * 3
        fur.append(f"M{f(x)} {f(y)} q{f(rnd.uniform(8, 16))} {f(rnd.uniform(-10, -4))} {f(rnd.uniform(20, 30))} {f(rnd.uniform(-4, 4))}")
    d.append(f'<path d="{" ".join(fur)}" fill="none" stroke="#D9CCFF" stroke-width="1.1" opacity="0.55" stroke-linecap="round"/>')
    d.append(f'<path d="M296 82 C330 78 352 74 380 66 M300 90 C334 88 360 84 392 80" fill="none" stroke="#E6ECFF" stroke-width="1" opacity="0.4"/>')
    d.append(f'<path d="{head_d}" fill="none" stroke="#DDE6FF" stroke-width="6" opacity="0.3" filter="{ublur(c, "frg", 3)}"/>')
    d.append(f'<path d="{head_d}" fill="none" stroke="#EEF2FF" stroke-width="1.1" opacity="0.7"/>')
    star_idx = [0, 2, 4, 6, 8, 10, 12, 14, 22, 24, 26, 28, 30, 31, 33, 35]
    cpts = [pts[i] for i in star_idx]
    d.append(constellation(c, cpts, [], "#E6ECFF", 0.85, 1.6, w=1.2, big=(0, 4, 9, 13), name="fc"))
    d.append(f'<ellipse cx="174" cy="94" rx="9" ry="7" fill="#05030F"/><circle cx="171" cy="91" r="2" fill="#FFFFFF" opacity="0.6"/>')
    for (x1, y1, x2, y2) in ((192, 103, 196, 132), (214, 106, 216, 128), (196, 240, 198, 210), (220, 228, 222, 206)):
        d.append(f'<path d="M{f(x1 - 4)} {f(y1)} Q{f(x2 - 1)} {f((y1 + y2) / 2)} {f(x2)} {f(y2)} Q{f(x2 + 2)} {f((y1 + y2) / 2)} {f(x1 + 4)} {f(y1)} Z" fill="#F4F0FF" stroke="#8A7CC8" stroke-width="0.6"/>')
    ex, ey = 364, 92
    d.append(f'<path d="M{f(ex - 18)} {f(ey + 4)} Q{f(ex - 2)} {f(ey - 10)} {f(ex + 16)} {f(ey - 4)} Q{f(ex)} {f(ey + 8)} {f(ex - 18)} {f(ey + 4)} Z" fill="#FFD36E"/>')
    d.append(f'<path d="M{f(ex - 26)} {f(ey - 6)} Q{f(ex - 4)} {f(ey - 22)} {f(ex + 22)} {f(ey - 14)}" fill="none" stroke="#EEF2FF" stroke-width="1.6" opacity="0.6"/>')
    d.append(cstar(c, ex, ey - 1, 2.4, "#FFF4C2", "#FF6A3D", name="feye"))
    d.append(black_hole(c, "bh", 270, 168, 40, 0.22, 2.8))
    d.append(open_string(470, 40, 520, 300, 6, 9, "#FFE27A", 1.8, 0.95))
    d.append(open_string(486, 38, 536, 298, 4, 13, "#9FFFE0", 1.1, 0.8))
    c.add(f'<g mask="{m}">{"".join(d)}</g>')
    c.add(grade(c, win, "#B07CFF", 0.5, 0.0, 0.22, "gr"))
    c.add(inner_shadow(c, win, 30, 12, 0.6))
    c.add(prism_rim(c, win))
    c.add(f'<circle cx="494" cy="400" r="40" fill="{c.rgrad("nucg", [(0, "#FF8FB8", 0.5), (1, "#FF8FB8", 0)])}"/>')
    c.add(nucleus(12, 494, 400, 30, 22))
    c.add(particle_tracks(c, "pt", 7, 494, 548, 64, 12))
    c.add(quantum_foam(c, "qf", 3, (468, 610, 530, 740), 26, rmax=8))
    for k, (y, kk) in enumerate(((650, 5), (700, 7))):
        c.add(string_loop(496 + (k % 2) * 10, y, 11, kk, 2.4, ("#FFE27A", "#9FFFE0")[k], 1.1))
    c.add(prism_frame(c))
    mythe_crest(c, 270, 162, 0.78, "#FFE7C2", 56)
    birds(c, [("mee-bisou-vole", 104, 724, 134, False, -6), ("meo-roi", 438, 724, 134, True, 6)])
    mythe_plaque(c, None, y=796)
    save(c, "mythe-a", "Mythe", None, "A", "Fenrir dévore le soleil",
         "Le loup Fenrir, fait de nébuleuse et tracé en constellation, ouvre la gueule sur le soleil devenu trou noir, disque d'accrétion et anneau de lumière : "
         "le blason brille entre ses crocs. Autour de son cou vibre Gleipnir, le lien plus fin que la soie, devenu corde quantique. "
         "D'un côté l'immense - toile cosmique, amas de galaxies, quasar - ; de l'autre l'infime - noyau atomique, traces de particules, mousse quantique, cordes.",
         "pied : Mee (bisou volé) et Meo (roi) sous la gueule du loup", None)


# =============================================================== B — l'arbre qui relie les univers

def bubble_universe(c, name, x, y, r, seed, tint=("#7CF7FF", "#B07CFF")):
    rnd = random.Random(seed)
    cid = c.id(name + "-c")
    c.def_once(name + "-c", f'<clipPath id="{cid}"><circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}"/></clipPath>')
    inner = (f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{c.rgrad(name + "-bg", [(0, tint[1], 0.55), (1, "#04030E", 0.95)])}"/>'
             + mini_galaxy(c, name + "-g", x + rnd.uniform(-r * 0.2, r * 0.2), y + rnd.uniform(-r * 0.2, r * 0.2), r * 0.55, rnd.uniform(0.4, 0.8), rnd.uniform(0, 180), tint[0], "#FFFFFF", "#FF9FD8", seed)
             + star_field(seed, int(r * 2), (x - r, y - r, x + r, y + r), rmax=1.0))
    pr = c.prism(name + "-p", 0, 0, 1, 1)
    return (f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 1.5)}" fill="{c.rgrad(name + "-h", [(0, tint[0], 0.3), (1, tint[0], 0)])}"/>'
            f'<g clip-path="url(#{cid})">{inner}</g>'
            f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="none" stroke="{pr}" stroke-width="1.4"/>'
            f'<path d="M{f(x - r * 0.6)} {f(y - r * 0.45)} A{f(r * 0.75)} {f(r * 0.75)} 0 0 1 {f(x - r * 0.1)} {f(y - r * 0.75)}" fill="none" stroke="#FFFFFF" stroke-width="1.4" opacity="0.7" stroke-linecap="round"/>')


def lens_world(c, name, x, y, r, content, tint=("#7CF7FF", "#B07CFF")):
    """Un univers-bulle qui montre une échelle : l'immense (trou noir, amas, quasar) ou l'infime (atome, noyau, traces, cordes)."""
    cid = c.id(name + "-c")
    c.def_once(name + "-c", f'<clipPath id="{cid}"><circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}"/></clipPath>')
    pr = c.prism(name + "-p", 0, 0, 1, 1)
    return (f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 1.5)}" fill="{c.rgrad(name + "-h", [(0, tint[0], 0.3), (1, tint[0], 0)])}"/>'
            f'<g clip-path="url(#{cid})"><circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{c.rgrad(name + "-bg", [(0, tint[1], 0.45), (1, "#04030E", 0.97)])}"/>{content}</g>'
            f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="none" stroke="{pr}" stroke-width="1.4"/>'
            f'<path d="M{f(x - r * 0.6)} {f(y - r * 0.45)} A{f(r * 0.75)} {f(r * 0.75)} 0 0 1 {f(x - r * 0.1)} {f(y - r * 0.75)}" fill="none" stroke="#FFFFFF" stroke-width="1.4" opacity="0.7" stroke-linecap="round"/>')


def mytB():
    c = start("mB", "#1A1A36", "#05040F", "#E0E8FF", 0.22)
    win = oval(270, 500, 184, 222)
    m = deco_mask(c, win)
    d = [deep(c, "sky", 211, ("#000006", "#060820", "#0E0C30", "#030210"))]
    d.append(nebula(c, "nb1", 80, 200, 160, 200, "#3FE8C8", "#0E2A5A", 0.45, seed=13))
    d.append(nebula(c, "nb2", 460, 240, 160, 200, "#FF6FB1", "#3A0E5A", 0.45, seed=15))
    d.append(nebula(c, "nb3", 270, 60, 260, 70, "#FFD36E", "#5A2A6A", 0.35, seed=17))
    c.add(f'<g mask="{m}">{"".join(d)}</g>')
    c.add(grade(c, win, "#9F7CFF", 0.5, 0.0, 0.2, "gr"))
    c.add(inner_shadow(c, win, 30, 12, 0.6))
    segs, tips = world_tree(c, "wt", seed=31, base=(270, 950), spread=1.0, crown_y=150, side_x=(78, 462), waist=(360, 620), twig_len=40, depth=3)
    body = " ".join(segs)
    pr = c.prism("trp", 0, 0, 1, 1)
    tree = (f'<g filter="{ublur(c, "tgl", 7)}" opacity="0.7"><path d="{body}" fill="{pr}"/></g>'
            f'<path d="{body}" fill="{pr}" opacity="0.55"/><path d="{body}" fill="none" stroke="#FFFFFF" stroke-width="0.5" opacity="0.6"/>')
    c.add(f'<g mask="{deco_mask(c, win, "tm")}">{tree}</g>')
    rnd = random.Random(3)
    out_tips = [t for t in tips if not (80 < t[0] < 460 and 270 < t[1] < 730) and t[1] < 780]
    for i, (x, y, a) in enumerate(out_tips[::3]):
        c.add(globular(i, x, y, 4, 12, "#FFFFFF"))
    worlds = [(70, 250, 28), (470, 250, 28), (46, 420, 26), (494, 420, 26), (54, 588, 24), (486, 572, 24), (150, 92, 24), (390, 92, 24)]
    tints = [("#7CF7FF", "#2A6CFF"), ("#FFB0E8", "#B03CFF"), ("#FFE27A", "#FF6A3D"), ("#9FFFD8", "#1FA67A"), ("#BFD4FF", "#5A3CFF"),
             ("#FF9F7A", "#C8462A"), ("#DDF2FF", "#4FA6D6"), ("#FFD9A8", "#B07CFF")]
    for i, (x, y, r) in enumerate(worlds):
        if i == 0:
            c.add(bubble_universe(c, f"bu{i}", x, y, r, i + 3, tints[i % len(tints)]))
            continue
        content = {
            2: black_hole(c, "lbh", x, y, r * 0.26, 0.26, 2.9),
            4: galaxy_cluster(c, "lgc", 5, x, y, r * 0.7, 7),
            6: quasar(c, "lqs", x, y, r * 0.18, r * 0.95, -30, "#BFE6FF"),
            1: atom(c, "lat", x, y, r * 0.72, 3, 20, "#FFB0E8", nucleus_seed=3),
            3: nucleus(9, x, y, r * 0.78, 18),
            5: particle_tracks(c, "lpt", 11, x, y, r * 0.95, 9),
            7: string_loop(x, y, r * 0.42, 5, 2.6, "#FFE27A", 1.3) + string_loop(x + 2, y + 1, r * 0.62, 7, 2.0, "#9FFFE0", 0.9, 0.6)
               + quantum_foam(c, "lqf", 4, (x - r, y - r, x + r, y + r), 10, rmax=4),
        }[i]
        c.add(lens_world(c, f"lw{i}", x, y, r, content, tints[i % len(tints)]))
    c.add(f'<g opacity="0.85">{quasar(c, "tq", 270, 40, 5, 70, 90, "#FFE7C2")}</g>')
    c.add(prism_rim(c, win))
    c.add(particle_tracks(c, "pt1", 4, 34, 860, 44, 8))
    c.add(particle_tracks(c, "pt2", 9, 506, 860, 44, 8))
    c.add(quantum_foam(c, "qf", 8, (20, 920, 520, 952), 40, rmax=5))
    c.add(prism_frame(c))
    mythe_crest(c, 270, 150, 0.88, "#FFFFFF", 70)
    birds(c, [("duo-mee-selfie", 412, 690, 176, False, 0)])
    mythe_plaque(c, "Ensemble, partout", y=790)
    save(c, "mythe-b", "Mythe", None, "B", "L'Arbre des univers",
         "Yggdrasil est devenu la toile cosmique : ses branches de lumière prismatique sont des filaments de matière, des amas d'étoiles naissent à leurs nœuds, "
         "et les mondes y pendent comme des univers-bulles : à gauche l'immense - galaxie, trou noir et son disque, amas de galaxies, quasar -, à droite l'infime - atome, noyau, traces de particules, cordes dans la mousse quantique. "
         "Au faîte, un quasar crache ses jets au-dessus du blason.",
         "selfie : Mee et Meo (selfie à deux) dans la photo", "Ensemble, partout")


# =============================================================== C — Jörmungandr, l'uroboros cosmique

SCALES = [
    ("-18", "quark"), ("-15", "noyau"), ("-10", "atome"), ("-9", "molécule"), ("-8", "ADN"), ("-5", "cellule"), ("0", "nous"),
    ("4", "montagne"), ("7", "Terre"), ("9", "Soleil"), ("21", "galaxie"), ("23", "amas"), ("25", "toile"), ("26", "quasar"),
]


def scale_icon(c, kind, x, y, k):
    if kind == "quark":
        return "".join(f'<circle cx="{f(x + dx)}" cy="{f(y + dy)}" r="2.4" fill="{col}"/>' for (dx, dy), col in zip(((-3, 2), (3, 2), (0, -3)), ("#FF4F6E", "#4DFFB4", "#4FC3FF")))
    if kind == "noyau":
        return nucleus(k, x, y, 8, 9)
    if kind == "atome":
        return (f'<g fill="none" stroke="#9FE8FF" stroke-width="0.8">' + "".join(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="8" ry="3" transform="rotate({a} {f(x)} {f(y)})"/>' for a in (0, 60, 120))
                + f'</g><circle cx="{f(x)}" cy="{f(y)}" r="2" fill="#FF8FB8"/>')
    if kind == "molécule":
        return (f'<line x1="{f(x - 5)}" y1="{f(y + 3)}" x2="{f(x)}" y2="{f(y - 1)}" stroke="#FFFFFF" stroke-width="1.2"/><line x1="{f(x + 5)}" y1="{f(y + 3)}" x2="{f(x)}" y2="{f(y - 1)}" stroke="#FFFFFF" stroke-width="1.2"/>'
                f'<circle cx="{f(x)}" cy="{f(y - 1)}" r="3.6" fill="#FF6A6A"/><circle cx="{f(x - 5.5)}" cy="{f(y + 3.5)}" r="2.2" fill="#FFFFFF"/><circle cx="{f(x + 5.5)}" cy="{f(y + 3.5)}" r="2.2" fill="#FFFFFF"/>')
    if kind == "ADN":
        a = "M" + " L".join(f"{f(x - 8 + i)} {f(y + 4 * math.sin(i * 0.8))}" for i in range(17))
        b = "M" + " L".join(f"{f(x - 8 + i)} {f(y - 4 * math.sin(i * 0.8))}" for i in range(17))
        return f'<path d="{a}" stroke="#7CF7FF" stroke-width="1.2" fill="none"/><path d="{b}" stroke="#FF8FD0" stroke-width="1.2" fill="none"/>'
    if kind == "cellule":
        return f'<circle cx="{f(x)}" cy="{f(y)}" r="7.5" fill="#1A6B8A" stroke="#7CF7FF" stroke-width="1"/><circle cx="{f(x + 1.5)}" cy="{f(y - 1)}" r="3" fill="#B07CFF"/>'
    if kind == "nous":
        return f'<path d="M{f(x)} {f(y + 6)} C{f(x - 9)} {f(y)} {f(x - 7)} {f(y - 7)} {f(x)} {f(y - 3)} C{f(x + 7)} {f(y - 7)} {f(x + 9)} {f(y)} {f(x)} {f(y + 6)} Z" fill="#FF6FB1"/>'
    if kind == "montagne":
        return f'<path d="M{f(x - 8)} {f(y + 5)} L{f(x)} {f(y - 6)} L{f(x + 8)} {f(y + 5)} Z" fill="#4F7CB0"/><path d="M{f(x - 3)} {f(y - 2)} L{f(x)} {f(y - 6)} L{f(x + 3)} {f(y - 2)} Z" fill="#FFFFFF"/>'
    if kind == "Terre":
        return (f'<circle cx="{f(x)}" cy="{f(y)}" r="7" fill="#2E6CD0"/><path d="M{f(x - 4)} {f(y - 4)} q4 2 2 6 q-3 1 -4 -2 Z M{f(x + 2)} {f(y + 1)} q4 -1 4 3 q-3 2 -4 -3 Z" fill="#4DD08A"/>'
                f'<circle cx="{f(x - 2)}" cy="{f(y - 2)}" r="7" fill="none" stroke="#FFFFFF" stroke-width="0.6" opacity="0.4"/>')
    if kind == "Soleil":
        return f'<circle cx="{f(x)}" cy="{f(y)}" r="9" fill="{c.rgrad("sun", [(0, "#FFFFFF", 1), (0.5, "#FFD36E", 1), (1, "#FF8A3D", 0)])}"/>'
    if kind == "galaxie":
        return mini_galaxy(c, "sg", x, y, 8, 0.6, 20, "#BFD4FF", "#FFF4DC", "#FF9FD8", seed=k)
    if kind == "amas":
        return globular(k, x, y, 6, 30, "#FFE2B8")
    if kind == "toile":
        return f'<path d="M{f(x - 7)} {f(y - 5)} L{f(x)} {f(y)} L{f(x + 7)} {f(y - 4)} M{f(x)} {f(y)} L{f(x - 2)} {f(y + 7)} M{f(x)} {f(y)} L{f(x + 6)} {f(y + 6)}" stroke="#9FB8FF" stroke-width="1" fill="none"/>' + "".join(f'<circle cx="{f(x + dx)}" cy="{f(y + dy)}" r="1.4" fill="#FFE2B8"/>' for dx, dy in ((-7, -5), (0, 0), (7, -4), (-2, 7), (6, 6)))
    return (f'<line x1="{f(x - 9)}" y1="{f(y + 6)}" x2="{f(x + 9)}" y2="{f(y - 6)}" stroke="#BFE6FF" stroke-width="1.6"/>'
            f'<circle cx="{f(x)}" cy="{f(y)}" r="3" fill="#FFFFFF"/>')


def mytC():
    c = start("mC", "#1A1A36", "#05040F", "#E0E8FF", 0.22)
    win = rrect(96, 300, 444, 706, 30)
    m = deco_mask(c, win)
    d = [deep(c, "sky", 221, ("#000006", "#04061C", "#0A0C2C", "#030210"))]
    d.append(nebula(c, "nb1", 90, 140, 170, 120, "#4FC3FF", "#1A1A6A", 0.5, seed=23))
    d.append(nebula(c, "nb2", 450, 880, 170, 110, "#FF6FB1", "#3A0E5A", 0.45, seed=25))
    d.append(quasar(c, "qs", 470, 92, 9, 150, 50, "#BFE6FF"))
    d.append(spiral_galaxy(c, "g1", 74, 880, 52, 0.45, -20, seed=7, n=500))
    d.append(curtains(c, "au1", 238, 170, amp=26, waves=1.1, phase=0.9, fold=30, seed=61, top="#B36EFF", mid="#6EF0C2", low="#E8FFF8", op=(0.12, 0.5)))
    d.append(black_hole(c, "bh", 80, 100, 12, 0.24, 3.0))
    c.add(f'<g mask="{m}">{"".join(d)}</g>')
    c.add(grade(c, win, "#7CF7FF", 0.5, 0.0, 0.2, "gr"))
    c.add(inner_shadow(c, win, 30, 12, 0.6))
    c.add(prism_rim(c, win, "wr", 3))
    loop = [(236, 752), (150, 752), (72, 742), (60, 640), (58, 500), (62, 360), (86, 282), (170, 260), (270, 256), (370, 260), (454, 282),
            (478, 360), (482, 500), (480, 640), (468, 742), (390, 754), (318, 760)]
    n = 240

    def wfn(t):
        return 40 * (0.14 + 0.86 * min(1, t / 0.3)) if t < 0.97 else 40

    sp = resample(loop, n)
    nm = normals(sp)
    bodyd = ribbon(loop, 40, n=n, wfn=wfn)
    belly = ribbon(loop, 18, n=n, wfn=lambda t: wfn(t) * 0.42)
    sg = c.def_once("sbody", f'<linearGradient id="{c.id("sbody")}" gradientUnits="userSpaceOnUse" x1="0" y1="250" x2="0" y2="760">'
                    f'<stop offset="0" stop-color="#1FD6B0"/><stop offset="0.5" stop-color="#0E6E7A"/><stop offset="1" stop-color="#2A2A8A"/></linearGradient>')
    c.add(f'<path d="{bodyd}" fill="#7CF7FF" opacity="0.5" filter="{ublur(c, "sgl", 8)}"/>')
    c.add(f'<path d="{bodyd}" fill="{sg}" stroke="#021712" stroke-width="1.6"/>')
    c.add(f'<path d="{belly}" fill="#BFFFF0" opacity="0.35" filter="{ublur(c, "bel", 3)}"/>')
    c.add(f'<path d="{bodyd}" fill="#7C6CFF" opacity="0.4" filter="{noise_filter(c, "sbn", "0.04", 3, 11, 2.6, -1.0)}"/>')
    scl = []
    for i in range(6, n - 4, 3):
        (x, y), (nx, ny) = sp[i], nm[i]
        ww = wfn(i / (n - 1)) * 0.42
        x2, y2 = sp[i + 2]
        scl.append(f'<path d="M{f(x + nx * ww)} {f(y + ny * ww)} Q{f(x2)} {f(y2)} {f(x - nx * ww)} {f(y - ny * ww)}" fill="none" stroke="#BFFFF0" stroke-width="0.7" opacity="0.45"/>')
    c.add("".join(scl))
    pr = c.prism("spine", 0, 0, 1, 1)
    spine = smooth([(x + nx * wfn(i / (n - 1)) * 0.36, y + ny * wfn(i / (n - 1)) * 0.36) for i, ((x, y), (nx, ny)) in enumerate(zip(sp, nm))][4::4])
    c.add(f'<path d="{spine}" fill="none" stroke="{pr}" stroke-width="1.6" opacity="0.9"/>')
    k = len(SCALES)
    for j, (exp, kind) in enumerate(SCALES):
        t = 0.05 + 0.87 * j / (k - 1)
        i = int(t * (n - 1))
        (x, y), (nx, ny) = sp[i], nm[i]
        c.add(f'<circle cx="{f(x)}" cy="{f(y)}" r="20" fill="{c.rgrad("medg", [(0, "#FFFFFF", 0.35), (1, "#FFFFFF", 0)])}"/>')
        c.add(f'<circle cx="{f(x)}" cy="{f(y)}" r="15.5" fill="#05040E" stroke="{c.prism("med", 0, 0, 1, 1)}" stroke-width="2"/>')
        c.add(f'<g transform="translate({f(x)} {f(y)}) scale(1.3) translate({f(-x)} {f(-y)})">{scale_icon(c, kind, x, y, j)}</g>')
        il = min(n - 2, i + 9)
        (lx, ly) = sp[il]
        tx, ty = sp[il + 1][0] - sp[il - 1][0], sp[il + 1][1] - sp[il - 1][1]
        ang = math.degrees(math.atan2(ty, tx))
        if 90 < ang % 360 < 270:
            ang += 180
        c.add(f'<g transform="translate({f(lx)} {f(ly)}) rotate({f(ang)})"><rect x="-21" y="-8" width="42" height="16" rx="8" fill="#04030E" opacity="0.88" stroke="#BFFFF0" stroke-width="0.7"/>'
              f'<text x="0" y="3.5" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="9.5" fill="#FFFFFF">'
              f'10<tspan dy="-3" font-size="6.5">{exp}</tspan><tspan dy="3"> m</tspan></text></g>')
    hx, hy = sp[-1]
    c.add(f'<g filter="{ublur(c, "hgl", 4)}" opacity="0.6"><g transform="translate({f(hx)} {f(hy)}) rotate(-5) scale(-0.82 0.82)">{dragon_head2("#7CF7FF", "#021712", "#FFE27A", horn=True, mane=True)}</g></g>')
    c.add(f'<g filter="{bevel(c, "hbv", 0.9, 2.2, sd=3, dy=2, sop=0.6)}"><g transform="translate({f(hx)} {f(hy)}) rotate(-5) scale(-0.82 0.82)">'
          f'{dragon_head2(c.grad("hd", [(0, "#5FFFD8"), (1, "#1A5A8A")], 0, 0, 1, 1), "#021712", "#FFE27A", "#3A0820", "#FF6FB1", horn=True, mane=True)}</g></g>')
    c.add(prism_frame(c))
    mythe_crest(c, 270, 150, 0.9, "#BFFFF0", 80)
    birds(c, [("mee-danse", 68, 822, 108, False, -6), ("meo-feu-artifice", 472, 822, 108, True, 6)])
    mythe_plaque(c, "De l'atome aux étoiles", y=800, w=360)
    save(c, "mythe-c", "Mythe", None, "C", "Jörmungandr, l'uroboros",
         "Jörmungandr, le serpent-monde qui encercle Midgard en se mordant la queue, fait le tour de la photo : sur ses écailles, quatorze médaillons gradués "
         "vont du quark (10⁻¹⁸ m) au quasar (10²⁶ m) - noyau, atome, molécule d'eau, ADN, cellule, nous, montagne, Terre, Soleil, galaxie, amas, toile cosmique. "
         "Là où la tête mord la queue, le plus grand rejoint le plus petit : l'uroboros cosmique.",
         "pied : Mee (danse) et Meo (feu d'artifice) de part et d'autre de l'inscription", "De l'atome aux étoiles")


ALL = [mytA, mytB, mytC]
