"""Égypte solaire - Mythe A, B, C : du quark au quasar, toute l'échelle de l'univers dans un seul cadre."""

import math
import random

from kit import *  # noqa: F401,F403
from motifs import *  # noqa: F401,F403
from scene import *  # noqa: F401,F403
from archi import *  # noqa: F401,F403
from cosmos import *  # noqa: F401,F403
from afrique import agrad  # noqa: F401
from ciel import *  # noqa: F401,F403
from motifs import _poly, _mini_glyph  # noqa: F401

RANK = "Mythe"
PRISM3 = METALS["prism"]
TITLE = "Mythe nº 42"
BADGE = "Nº 42 / 100"
PANEL = ("#0E0A26", "#04030C")
INS_METAL = ("#FFFFFF", "#C9BFFF", "#6A5AD8")
PR = ("#FF6FB1", "#FFD36E", "#6EF0C2", "#6EA8FF", "#B36EFF")


def mythe_crest(c, cx, cy, s, halo=0.45):
    c.add(f'<circle cx="{f(cx)}" cy="{f(cy + 6)}" r="{f(110 * s)}" fill="{c.rgrad("mh", [(0, "#FFFFFF", halo), (0.5, "#B9A7FF", halo * 0.4), (1, "#B9A7FF", 0)])}"/>')
    crest(c, cx, cy, s, "prism", division=None, gem="#FFFFFF", ink="#3A2A8A", edge="#FFFFFF")


def prism_frame(c):
    c.add(outer_frame(c, ("#FFFFFF", "#B9A7FF", "#4C3BC4"), prism=True, name="pf"))


def deep(card, name, top="#020208", mid="#080824", bot="#06030F"):
    return f'<rect width="{W}" height="{H}" fill="{card.grad(name, [(0, top), (0.5, mid), (1, bot)])}"/>'


def cubit_rod(card, name, x0, x1, y, h=9, left="10²⁶ m", right="10⁻³⁵ m"):
    """La coudée royale, la règle d'or des bâtisseurs égyptiens : ici elle mesure l'univers, du quasar au quark."""
    g = card.grad(name, [(0, GOLD_HI), (0.5, GOLD), (1, GOLD_LO)], 0, 0, 0, 1)
    out = [f'<rect x="{f(x0)}" y="{f(y)}" width="{f(x1 - x0)}" height="{f(h)}" rx="2" fill="{g}" filter="{bevel(card, name + "-bv", 0.6, 1.4, sd=2, dy=2)}"/>']
    n = 28
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        tall = h * (0.9 if i % 4 == 0 else 0.5)
        out.append(f'<line x1="{f(x)}" y1="{f(y + 1)}" x2="{f(x)}" y2="{f(y + tall)}" stroke="{GOLD_LO}" stroke-width="{0.9 if i % 4 == 0 else 0.6}"/>')
    for i in range(7):
        x = x0 + (x1 - x0) * (i + 0.5) / 7
        out.append(_mini_glyph(i, x, y + h + 9, 9, GOLD_HI, 0.8))
    out.append(f'<text x="{f(x0)}" y="{f(y - 5)}" font-family="{SANS}" font-weight="700" font-size="9" letter-spacing="0.5" fill="#C9BFFF">{left} · quasar</text>')
    out.append(f'<text x="{f(x1)}" y="{f(y - 5)}" text-anchor="end" font-family="{SANS}" font-weight="700" font-size="9" letter-spacing="0.5" fill="#C9BFFF">quark · {right}</text>')
    return "".join(out)


def cosmic_sistrum(card, name, cx, cy, s, metal=GOLD3):
    """Le sistre d'Hathor dont les tiges sont devenues des cordes qui vibrent, et les disques, des quarks."""
    hi, mid, lo = metal
    g = card.grad(name + "-g", [(0, hi), (0.5, mid), (1, lo)], 0, 0, 1, 1)
    out = [f'<path d="M-30 -60 C-34 -110 -22 -150 0 -152 C22 -150 34 -110 30 -60" fill="none" stroke="{g}" stroke-width="8" stroke-linecap="round"/>',
           f'<path d="M-36 -60 L36 -60 L30 -50 L-30 -50 Z" fill="{g}"/>']
    for i, yy in enumerate((-124, -100, -76)):
        out.append(open_string(-30, yy, 30, yy, (2 + i, 5 + i, 9), 6, PR[i * 2 % 5], 1.3, 0.95))
        for k, jx in enumerate((-14, 4, 18)):
            col = ("#FF4D6D", "#3DDC84", "#4D8BFF")[(k + i) % 3]
            out.append(f'<circle cx="{jx}" cy="{yy}" r="4.2" fill="{card.rgrad(name + col[1:], [(0, "#FFFFFF", 1), (0.4, col, 1), (1, col, 0.7)])}"/>')
    hg = card.grad(name + "-h", [(0, TURQ), (1, LAPIS)], 0, 0, 1, 0)
    out.append(f'<path d="M-9 -50 C-10 -30 -6 -10 -6 30 L-12 52 L12 52 L6 30 C6 -10 10 -30 9 -50 Z" fill="{hg}" stroke="{g}" stroke-width="2"/>')
    for k in range(4):
        out.append(f'<rect x="-9" y="{-44 + k * 7}" width="18" height="3.4" fill="{(CARN, hi, LAPIS, hi)[k]}"/>')
    out.append(f'<rect x="-14" y="50" width="28" height="7" rx="3" fill="{g}"/>')
    return f'<g transform="translate({f(cx)} {f(cy)}) scale({f(s)})" filter="{bevel(card, name + "-bv", 0.8, 1.8, sd=3, dy=3, sop=0.55)}">{"".join(out)}</g>'


def web_band(card, name, cx, base, rx_o, ry_o, rx_i, ry_i, seed=12):
    """Le corps de Nout tissé de la toile cosmique : filaments, nœuds d'amas, galaxies, sous un contour d'or et de prisme."""
    band = half_ellipse_band(cx, base, rx_o, ry_o, rx_i, ry_i)
    card.def_once(name + "-cl", f'<clipPath id="{card.id(name + "-cl")}"><path d="{band}"/></clipPath>')
    rnd = random.Random(seed)
    rxm, rym = (rx_o + rx_i) / 2, (ry_o + ry_i) / 2
    th = rx_o - rx_i
    nodes = []
    for i in range(70):
        a = math.pi * (i + rnd.uniform(-0.3, 0.3)) / 69
        off = rnd.uniform(-th * 0.45, th * 0.45)
        nodes.append((cx + (rxm + off) * math.cos(a), base - (rym + off * rym / rxm) * math.sin(a)))
    lines = []
    for i, (x, y) in enumerate(nodes):
        near = sorted(range(len(nodes)), key=lambda j: (nodes[j][0] - x) ** 2 + (nodes[j][1] - y) ** 2)[1:4]
        for j in near:
            xb, yb = nodes[j]
            lines.append(f'<path d="M{f(x)} {f(y)} L{f(xb)} {f(yb)}" stroke="{PR[(i + j) % 5]}" stroke-width="{f(rnd.uniform(0.5, 1.4))}" opacity="{f(rnd.uniform(0.45, 0.9))}"/>')
    knots = "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(3, 7))}" fill="{card.rgrad(name + "-k", [(0, "#FFFFFF", 0.9), (0.3, "#C9B8FF", 0.6), (1, "#C9B8FF", 0)])}"/>' for x, y in nodes)
    stars = star_field(seed + 3, 700, (cx - rx_o, base - ry_o, cx + rx_o, base), "#FFFFFF", 1.1)
    pr = card.prism(name + "-pr", 0, 0, 1, 1)
    outer = f"M{f(cx - rx_o)} {f(base)} A{f(rx_o)} {f(ry_o)} 0 0 1 {f(cx + rx_o)} {f(base)}"
    inner = f"M{f(cx - rx_i)} {f(base)} A{f(rx_i)} {f(ry_i)} 0 0 1 {f(cx + rx_i)} {f(base)}"
    return (f'<path d="{band}" fill="{card.rgrad(name + "-bg", [(0, "#140A3A", 1), (0.85, "#1E1460", 1), (1, "#0A0620", 1)], 0.5, 1.0, 1.0)}"/>'
            f'<g clip-path="url(#{card.id(name + "-cl")})">{stars}<g filter="{card.blur(name + "-lb", 1.6)}">{"".join(lines)}</g>{"".join(lines)}{knots}</g>'
            f'<path d="{outer}" fill="none" stroke="{pr}" stroke-width="3"/><path d="{inner}" fill="none" stroke="{pr}" stroke-width="3"/>'
            f'<path d="{outer}" fill="none" stroke="#FFFFFF" stroke-width="0.8" opacity="0.6" transform="translate(0 6)"/>')


def eye_of_night(card, name, cx, cy, s):
    """L'œil d'Horus dont la pupille est un trou noir : celui qui voit tout, jusqu'à l'horizon des événements."""
    return (f'<g filter="{card.glow(5)}" opacity="0.6">{wedjat(cx, cy, s, "#FFE29A", w=4.2)}</g>'
            f'{wedjat(cx, cy, s, card.grad(name, [(0, GOLD_HI), (0.5, GOLD), (1, GOLD_LO)], 0, 0, 1, 1), iris="#000000", w=4.2)}'
            + black_hole(card, name + "bh", cx, cy - 4 * s, 7.5 * s, tilt=0.25, disk=2.6))


# =============================================================== A - Khépri pousse le quasar

def myt_a():
    c = start("ma", "#24223A", "#08080F", "#C8D8FF", 0.2)
    win = cartouche_win(100, 306, 440, 734)
    d = [deep(c, "bg")]
    d.append(deep_field(c, "df", (0, 0, W, H), 160, seed=12, op=0.7))
    d.append(star_field(31, 760, (0, 0, W, H), "#FFFFFF", 1.3, tint=("#FFE9C0", "#BFD8FF", "#FFC0D8")))
    d.append(nebula_cloud(c, "nb1", 270, 160, 330, 170, "#4A7AFF", "#2A1A8A", 0.6, seed=41))
    d.append(nebula_cloud(c, "nb2", 330, 120, 180, 90, "#FF6FB1", "#5A1A8A", 0.5, seed=43))
    d.append(nebula_cloud(c, "sideL", 50, 540, 120, 280, "#5A4AFF", "#1A1A6A", 0.55, seed=49))
    d.append(nebula_cloud(c, "sideR", 490, 540, 120, 280, "#FF5AA0", "#4A1A6A", 0.5, seed=51))
    d.append(cosmic_web(c, "cw", (0, 230, 100, 880), seed=5, n=26, k=3, color="#B9A7FF"))
    d.append(galaxy_cluster(c, "gc", 66, 72, 52, 14, seed=7))
    d.append(black_hole(c, "bh", 52, 470, 18, tilt=0.24, disk=3.0, rot=-18))
    for i, (x, y, r) in enumerate(((40, 640, 16), (74, 720, 12), (30, 800, 10))):
        d.append(spiral_galaxy(c, f"sg{i}", x, y, r, 0.45, i * 1.3, seed=60 + i, n=120, glow_op=0.5))
    d.append(particle_tracks(9, 470, 250, 26, ("#FF8FD0", "#9FE8FF", "#FFE9A8", "#B9A7FF"), 110, 1.1, 0.9, 60, 300))
    d.append(quantum_foam(c, "qf", (446, 560, 540, 880), seed=4, n=120, color="#C9BFFF", rmax=8))
    for k, (y, m) in enumerate(((610, (2, 5, 9)), (700, (3, 7, 11)), (790, (2, 6, 10)))):
        d.append(open_string(452, y, 528, y + 18, m, 8, PR[k + 1], 1.4, 0.95))
    d.append(nebula_cloud(c, "lobeL", 30, 160, 80, 60, "#FF6FD0", "#6A2AA8", 0.8, seed=45))
    d.append(nebula_cloud(c, "lobeR", 510, 160, 80, 60, "#6FD8FF", "#2A3AA8", 0.8, seed=47))
    d.append(quasar(c, "qs", 270, 160, 300, 0, "#BFE6FF", "#FFFFFF", 20))
    d.append(f'<ellipse cx="270" cy="160" rx="150" ry="24" fill="none" stroke="#FFD9A0" stroke-width="2.4" opacity="0.6" filter="{c.blur("acc", 2)}"/>')
    d.append(f'<g opacity="0.28" transform="translate(270 270) scale(1.4)">{scarab(c, "ghost", 0, 0, 1.0, legs=True, bv=False)}</g>')
    d.append(shape_constellation("scarab", 270, 270, 1.3, "#FFE29A", r=2.6, line_op=0.9, glow_color="#FFE29A"))
    d.append(f'<rect x="0" y="896" width="{W}" height="70" fill="{agrad(c, "bot", [(0, "#04030C", 0), (1, "#04030C", 0.85)])}"/>')
    d.append(cubit_rod(c, "cub", 40, 500, 918))
    decorate(c, win, d)
    finish_window(c, win, "#B8C8FF", 0.5, 0.0, 0.26, PRISM3, 4)
    c.add(f'<rect x="{f(270 - 186)}" y="738" width="372" height="8" rx="3" fill="{c.prism("tie", 0, 0, 1, 0)}"/>')
    c.add(lens(c, "lnq", 486, 420, 34, proton_quarks(c, "pq", 486, 420, 28), PRISM3, "#0A0820"))
    c.add(lens(c, "lnn", 486, 520, 30, nucleus_ball(c, "nb", 486, 520, 20, 11), PRISM3, "#0A0820"))
    prism_frame(c)
    mythe_crest(c, 270, 158, 0.86)
    birds(c, [("mee-fete", 60, 352, 110, False, 10), ("meo-champagne", 480, 650, 110, True, -10)])
    inscription(c, KICK, TITLE, y=772, style="prisme", metal=INS_METAL, panel=PANEL, badge=BADGE, accent="#C9BFFF")
    save(c, "mythe-a", RANK, None, "A", "Khépri pousse le quasar",
         "Du quark au quasar : Khépri, devenu constellation d'or, pousse un quasar dont les jets traversent le ciel, et le blason prisme brille en "
         "son cœur ; la photo est inscrite dans un cartouche, comme un nom royal. À gauche l'immense : la toile cosmique, un amas de galaxies, un trou "
         "noir et son disque ; à droite l'infime : les traces d'une collision, le noyau, le proton et ses trois quarks, les cordes et la mousse quantique. "
         "Au pied du cadre, la coudée royale des bâtisseurs mesure l'univers d'un bout à l'autre.",
         "côtés (Mee fête, Meo champagne)", None)


# =============================================================== B - La Barque des galaxies

def myt_b():
    c = start("mb", "#24223A", "#08080F", "#FFD8C8", 0.2)
    win = arch(98, 442, 400, 312, 734)
    d = [deep(c, "bg", "#030208", "#0C0828", "#08030F")]
    d.append(star_field(37, 760, (0, 0, W, H), "#FFFFFF", 1.3, tint=("#FFE9C0", "#FFC8E0")))
    d.append(deep_field(c, "df", (0, 300, W, H), 90, seed=14, op=0.6))
    d.append(spiral_galaxy(c, "big", 270, 196, 250, tilt=0.42, rot=-0.18, seed=21, n=2600, arm="#C8B8FF", pink="#FF8FD0", blue="#8FB8FF", glow_op=0.75, arm_op=0.38))
    d.append(supernova(c, "sn", 54, 360, 34, seed=55))
    d.append(galaxy_cluster(c, "gc", 58, 480, 42, 12, seed=9))
    d.append(cosmic_web(c, "cw", (0, 520, 96, 890), seed=8, n=20, k=3, color="#B9A7FF"))
    d.append(black_hole(c, "bh", 52, 640, 17, tilt=0.22, disk=3.0, rot=12))
    d.append(spiral_galaxy(c, "sg1", 40, 760, 14, 0.45, 0.6, seed=71, n=120, glow_op=0.5))
    d.append(particle_tracks(13, 490, 380, 24, ("#FF8FD0", "#9FE8FF", "#FFE9A8", "#B9A7FF"), 90, 1.0, 0.9, 0, 360))
    d.append(quantum_foam(c, "qfs", (446, 430, 540, 600), seed=17, n=50, color="#C9BFFF", rmax=6))
    d.append(quantum_foam(c, "qf", (0, 896, W, 960), seed=7, n=150, color="#C9BFFF"))
    d.append(shape_constellation("ankh", 470, 66, 0.72, "#FFE29A", r=2, glow_color="#FFE29A"))
    d.append(shape_constellation("barque", 82, 70, 0.62, "#FFE29A", r=2, glow_color="#FFE29A"))
    decorate(c, win, d)
    finish_window(c, win, "#FFC8D8", 0.5, 0.0, 0.26, PRISM3, 4)
    c.add(f'<g filter="{c.shadow("bqs", 0, 6, 6, "#000000", 0.5)}">{barque(c, "bq", 270, 268, 1.06, sun=False)}</g>')
    c.add(f'<circle cx="270" cy="196" r="56" fill="{c.rgrad("core", [(0, "#FFFFFF", 0.8), (0.4, "#FFE8C0", 0.4), (1, "#FFE8C0", 0)])}"/>')
    c.add(cosmic_sistrum(c, "sis", 490, 770, 0.98))
    c.add(lens(c, "lnd", 488, 520, 32, atom(c, "at", 488, 520, 24, 3, 0.3, "#BFE8FF", w=0.9, n_nuc=9), PRISM3, "#0A0820"))
    prism_frame(c)
    mythe_crest(c, 270, 170, 0.84)
    birds(c, [("duo-on-danse", 388, 208, 138, False, 0)])
    inscription(c, KICK, TITLE, "Jusqu'aux étoiles", y=772, style="prisme", metal=INS_METAL, panel=PANEL, badge=BADGE, accent="#C9BFFF")
    save(c, "mythe-b", RANK, None, "B", "La Barque des galaxies",
         "La barque de Rê ne longe plus le Nil : elle traverse une galaxie spirale entière, le blason prisme posé au-dessus de son naos, sous les "
         "constellations de la barque et de l'ankh. D'un côté un amas de galaxies, la toile cosmique, un trou noir et une supernova ; de l'autre "
         "les traces d'une collision et l'atome, et le sistre d'Hathor dont les tiges sont devenues des cordes qui vibrent et les disques, des quarks ; "
         "au pied du cadre, la mousse quantique.",
         "duo sur le pont de la barque (Mee et Meo dansent)", "Jusqu'aux étoiles")


# =============================================================== C - Nout, toile cosmique

def myt_c():
    c = start("mc", "#24223A", "#08080F", "#D8C8FF", 0.2)
    cx, base = 270, 780
    rxo, ryo, rxi, ryi = 258, 640, 210, 568
    win = ell_window(cx, base, rxi - 8, ryi - 8, 734)
    d = [deep(c, "bg", "#020208", "#0A0626", "#08030F")]
    d.append(star_field(41, 800, (0, 0, W, H), "#FFFFFF", 1.3, tint=("#FFE9C0", "#BFD8FF")))
    d.append(nebula_cloud(c, "nb1", 80, 200, 170, 200, "#6A4AFF", "#1A1A6A", 0.6, seed=61))
    d.append(nebula_cloud(c, "nb2", 470, 200, 170, 200, "#FF5AA8", "#4A1A6A", 0.55, seed=63))
    d.append(quasar(c, "qs", 74, 120, 70, -35, "#BFE6FF", "#FFFFFF", 9))
    d.append(galaxy_cluster(c, "gc", 64, 300, 40, 12, seed=11))
    d.append(black_hole(c, "bh", 46, 450, 14, tilt=0.22, disk=2.8, rot=-10))
    d.append(particle_tracks(17, 470, 140, 24, ("#FF8FD0", "#9FE8FF", "#FFE9A8", "#B9A7FF"), 90, 1.0, 0.9, 0, 360))
    d.append(nucleus_ball(c, "nb", 492, 320, 18, 11))
    d.append(quantum_foam(c, "qf", (440, 380, 540, 560), seed=9, n=60, color="#C9BFFF", rmax=7))
    d.append(web_band(c, "nout", cx, base, rxo, ryo, rxi, ryi))
    d.append(f'<rect x="0" y="776" width="{W}" height="190" fill="{c.grad("geb", [(0, "#0A0620"), (1, "#020208")])}"/>')
    d.append(quantum_foam(c, "qf2", (0, 896, W, 960), seed=11, n=140, color="#C9BFFF"))
    for k, (x0, y0, x1, y1) in enumerate(((16, 912, 150, 938), (390, 938, 524, 912))):
        d.append(open_string(x0, y0, x1, y1, (2, 5, 9), 9, PR[k * 2], 1.4, 0.9))
    decorate(c, win, d)
    finish_window(c, win, "#C8B8FF", 0.5, 0.0, 0.24, PRISM3, 4)
    hg = c.grad("hand", [(0, GOLD_HI), (0.5, GOLD), (1, GOLD_LO)], 0, 0, 1, 1)
    c.add(f'<g filter="{c.shadow("hs", 0, 0, 4, "#FFD890", 0.8)}">{limb_hands(c, 34, 790, 1.8, hg, GOLD_LO)}</g>')
    c.add(f'<g filter="{c.shadow("fs", 0, 0, 4, "#FFD890", 0.8)}">{feet(498, 778, 1.2, hg, GOLD_LO)}</g>')
    c.add(eye_of_night(c, "eye", 270, 104, 1.2))
    prism_frame(c)
    mythe_crest(c, 270, 186, 0.8, 0.5)
    birds(c, [("mee-amoureuse", 60, 548, 108, False, 12), ("meo-love", 480, 548, 108, True, -12)])
    inscription(c, KICK, TITLE, "Ensemble, jusqu'au bout", y=772, style="prisme", metal=INS_METAL, panel=PANEL, badge=BADGE, accent="#C9BFFF")
    save(c, "mythe-c", RANK, None, "C", "Nout, toile cosmique",
         "Nout s'arque une dernière fois, et son corps n'est plus semé d'étoiles mais tissé de la toile cosmique, filaments et amas de galaxies "
         "aux couleurs du prisme. Au sommet, l'œil d'Horus a pour pupille un trou noir ; du côté de ses mains, un quasar, un amas et un trou noir ; "
         "du côté de ses pieds, les traces de particules, le noyau et la mousse quantique, et sous elle les cordes qui vibrent : l'univers entier tient "
         "sous le ciel égyptien, et Mee et Meo se posent sur le corps de la déesse.",
         "côtés, posés sur le corps de Nout (Mee amoureuse, Meo love)", "Ensemble, jusqu'au bout")
