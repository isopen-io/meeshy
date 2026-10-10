"""Aurores du Nord - ORATEUR A, B, C : la voix, la lumière. Métal or rouge (l'or des runes)."""

import math
import random

from common import *  # noqa: F401,F403
from cosmos import star_field, bright_stars, cstar, corona_soft
from beasts import kente, cowrie, adinkra, baobab, gjallarhorn, dragon_head2
from base import nsoromma
from ornements import borre_boss, plait_frame


def rgold(c, name="rgold", x1=0, y1=0, x2=1, y2=1):
    return metal_grad(c, name, OR_ROUGE, x1, y1, x2, y2)


def sound_rings(c, name, cx, cy, r0, r1, step, color, w=2.2, op=0.75):
    rings = []
    k = 0
    r = r0
    while r < r1:
        fade = (1 - (r - r0) / (r1 - r0)) ** 0.8
        rings.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="{color}" stroke-width="{f(w * (1.4 if k % 3 == 0 else 0.7))}" opacity="{f(op * fade)}"'
                     + (' stroke-dasharray="2 6"' if k % 3 == 2 else "") + "/>")
        r += step * (1 + k * 0.06)
        k += 1
    body = "".join(rings)
    return f'<g filter="{ublur(c, name + "-b", 4)}" opacity="0.8">{body}</g>{body}'


def light_rays(c, name, cx, cy, r0, r1, n, color, a0=0, a1=360, seed=3, w=(1, 6), op=(0.08, 0.3)):
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        a = a0 + (a1 - a0) * (i + rnd.uniform(-0.3, 0.3)) / n
        ww = rnd.uniform(*w)
        x1, y1 = pt(cx, cy, r0, a - ww * 0.05)
        x2, y2 = pt(cx, cy, r1, a - ww * 0.5)
        x3, y3 = pt(cx, cy, r1, a + ww * 0.5)
        x4, y4 = pt(cx, cy, r0, a + ww * 0.05)
        out.append(f'<path d="M{f(x1)} {f(y1)} L{f(x2)} {f(y2)} L{f(x3)} {f(y3)} L{f(x4)} {f(y4)} Z" opacity="{f(rnd.uniform(*op))}"/>')
    g = c.def_once(name + "-g", f'<radialGradient id="{c.id(name + "-g")}" gradientUnits="userSpaceOnUse" cx="{f(cx)}" cy="{f(cy)}" r="{f(r1)}">'
                   f'<stop offset="0" stop-color="{color}" stop-opacity="1"/><stop offset="0.5" stop-color="{color}" stop-opacity="0.5"/><stop offset="1" stop-color="{color}" stop-opacity="0"/></radialGradient>')
    return f'<g fill="{g}" filter="{ublur(c, name + "-b", 1.5)}" style="mix-blend-mode:screen">{"".join(out)}</g>'


# =============================================================== A — le cor de Heimdall

def oraA():
    c = start("oA", "#2E2440", "#0C0A16", "#FFD9A0", 0.24)
    win = arch(80, 460, 390, 272, 732)
    m = deco_mask(c, win)
    d = [sky(c, "sky", [(0, "#04020C"), (0.3, "#140C2E"), (0.62, "#24164A"), (1, "#0A0818")])]
    d.append(star_field(31, 300, keep=KEEP))
    d.append(f'<circle cx="270" cy="150" r="460" fill="{c.rgrad("bellglow", [(0, "#FFE7A8", 0.75), (0.25, "#FF9A3D", 0.32), (0.6, "#B0408A", 0.12), (1, "#B0408A", 0)])}"/>')
    d.append(light_rays(c, "lr", 270, 150, 60, 620, 54, "#FFE2A0", seed=4))
    d.append(sound_rings(c, "sr", 270, 150, 118, 720, 30, "#FFD27A", 2.0, 0.7))
    d.append(curtains(c, "au1", 520, 260, amp=50, waves=1.0, phase=0.4, fold=40, seed=21, op=(0.08, 0.4)))
    hills = c.grad("hills", [(0, "#4A3A6E"), (1, "#0A0818")])
    d.append(f'<path d="M-20 760 C60 712 140 700 220 730 C300 760 380 700 460 690 C510 684 540 700 560 712 L560 960 L-20 960 Z" fill="{hills}"/>')
    d.append(f'<path d="M-20 760 C60 712 140 700 220 730 C300 760 380 700 460 690 C510 684 540 700 560 712" fill="none" stroke="#FFE2C0" stroke-width="3" opacity="0.8"/>')
    d.append(f'<path d="M-20 820 C80 790 180 800 270 830 C360 860 460 800 560 790 L560 960 L-20 960 Z" fill="#0C0A1C"/>')
    d.append(forest(22, -10, 90, 812, 40, 90, 5, "#06040E", "#F0E2F0", 0.6))
    d.append(forest(23, 450, 560, 800, 40, 90, 5, "#06040E", "#F0E2F0", 0.6))
    c.add(f'<g mask="{m}">{"".join(d)}</g>')
    c.add(grade(c, win, "#FFB347", 0.5, 0.0, 0.26, "gr"))
    c.add(inner_shadow(c, win, 30, 12, 0.6))
    c.add(gold_rim(c, win, OR_ROUGE, 5))
    horn_pts = [(214, 196), (136, 252), (82, 360), (62, 480), (66, 580), (82, 640)]
    horn, _, _ = gjallarhorn(c, "gh", horn_pts, 120, 9, metal=OR_ROUGE, horn=("#FFF4DA", "#E8C890", "#7A4A1A"), bands=(0.12, 0.34, 0.58, 0.8))
    c.add(horn)
    bell_rim = rgold(c, "bell", 0, 0, 1, 1)
    throat = c.rgrad("throat", [(0, "#1E0A04", 1), (0.35, "#4A1E08", 1), (0.7, "#A8561A", 1), (0.9, "#F4C070", 1), (1, "#FFF2C8", 1)], 0.5, 0.5, 0.5)
    tilt = 'transform="rotate(-10 270 152)"'
    c.add(f'<g filter="{c.shadow("bsh", 0, 8, 12, "#000000", 0.6)}"><ellipse cx="270" cy="152" rx="106" ry="92" fill="{throat}" {tilt}/></g>')
    for k, (rx, ry, op) in enumerate(((80, 70, 0.5), (62, 54, 0.4), (46, 40, 0.3))):
        c.add(f'<ellipse cx="{272 + k * 2}" cy="{154 + k * 2}" rx="{rx}" ry="{ry}" fill="none" stroke="#FFD27A" stroke-width="{1.6 - k * 0.4}" opacity="{op}" {tilt}/>')
    c.add(f'<circle cx="270" cy="150" r="70" fill="{c.rgrad("throatglow", [(0, "#FFF4C2", 0.6), (1, "#FFF4C2", 0)])}"/>')
    c.add(f'<g filter="{bevel(c, "bbv", 1.2, 3.0, sd=4, dy=3, sop=0.5)}"><ellipse cx="270" cy="152" rx="106" ry="92" fill="none" stroke="{bell_rim}" stroke-width="17" {tilt}/></g>')
    c.add(f'<ellipse cx="270" cy="152" rx="117" ry="103" fill="none" stroke="{bell_rim}" stroke-width="2.5" opacity="0.8" {tilt}/>')
    c.add(f'<g {tilt}>{rune_ring(14, 270, 152, 106, 9, "#4A1A06", 1.3)}</g>')
    c.add(outer_frame(c, OR_ROUGE, 12, 3.5))
    crest_block(c, 270, 146, 0.8, "redgold", None)
    birds(c, [("mee-danse", 104, 724, 132, False, -6), ("meo-serenade", 440, 716, 140, True, 4)])
    inscription(c, "Orateur", "Que tout le Nord l'entende", y=784, style="nuit", metal=OR_ROUGE, panel=("#1E1030", "#08050F"), kicker=kicker(), title_size=42)
    save(c, "orateur-a", "Orateur", None, "A", "Le Cor de Heimdall",
         "Le blason sonne au fond du Gjallarhorn, le cor de Heimdall que l'on entend dans les neuf mondes : sa corne d'ivoire cerclée d'or rouge "
         "descend le long de la photo, son pavillon gravé de runes rayonne en ondes d'or et en rayons qui traversent le ciel violet du Nord.",
         "ruban : Mee (danse) et Meo (sérénade) chantent au pied de la photo", "Que tout le Nord l'entende")


# =============================================================== B — la case-obus sous l'aurore (Afrique fondue dans le Nord)

DOOR_B = "M108 740 C100 650 80 540 82 444 C84 330 176 262 270 256 C364 262 456 330 458 444 C460 540 440 650 432 740 Z"


def _door_half(y):
    if y > 740 or y < 256:
        return 0
    if y >= 444:
        t = (y - 444) / (740 - 444)
        return 188 - 26 * t * t
    t = (444 - y) / (444 - 256)
    return 188 * (1 - t ** 2.1) ** 0.62


def oraB():
    from afrique import case_obus
    c = start("oB", "#3A2A20", "#0E0806", "#FFC890", 0.22)
    win = DOOR_B
    m = deco_mask(c, win)
    d = [boreal_sky(c, "sky", "#01020A", "#071630", "#0E2C4C", seed=41, nstars=340)]
    d.append(corona_soft(c, "cor", 270, 64, 30, 760, 300, colors=("#4DFFB4", "#B07CFF"), seed=9, op=(0.14, 0.66), w=(0.6, 2.8)))
    d.append(light_rays(c, "lr", 270, 64, 40, 700, 44, "#FFE2A0", seed=12, w=(1, 5), op=(0.05, 0.22)))
    d.append(curtains(c, "au1", 330, 170, amp=26, waves=1.3, phase=1.8, fold=30, seed=24, op=(0.12, 0.55)))
    d.append(cstar(c, 478, 96, 1.6, "#FFF2C0", "#FFD36E", name="ns"))
    d.append(mountains(c, "mt", [(-20, 470), (40, 420), (90, 452), (150, 430), (260, 470), (370, 430), (440, 396), (500, 430), (560, 410)], 600, seed=5,
                       fill=("#24486E", "#081426"), snow_depth=26, rim_light="#9FFFD8"))
    d.append(forest(13, -10, 70, 560, 50, 120, 4, "#040A14", "#E0F0FF", 0.8))
    d.append(forest(14, 470, 560, 560, 50, 120, 4, "#040A14", "#E0F0FF", 0.8))
    dome, dome_d, _ = case_obus(c, "dome", 270, 830, 40, 252, seed=6, cols=15, k=2.0, p=0.74,
                                skip=lambda x, y: abs(x - 270) < _door_half(y) + 20)
    warm = c.rgrad("dw", [(0, "#FFB86A", 0.6), (0.45, "#FF8A3D", 0.2), (1, "#FF8A3D", 0)], 0.5, 0.52, 0.62)
    clip = win_clip(c, dome_d, "domec")
    d.append(f'<g filter="{c.shadow("dsh", 0, 0, 18, "#000000", 0.75)}">{dome}</g>')
    d.append(f'<g clip-path="{clip}" style="mix-blend-mode:screen"><rect x="0" y="160" width="{W}" height="720" fill="{warm}"/></g>')
    c.add(f'<g mask="{m}">{"".join(d)}</g>')
    c.add(grade(c, win, "#FFB347", 0.5, 0.0, 0.24, "gr"))
    c.add(inner_shadow(c, win, 34, 14, 0.7))
    reveal = c.grad("rev", [(0, "#6A3416"), (0.5, "#3A1808"), (1, "#6A3416")], 0, 0, 1, 0)
    c.add(f'<path d="{win}" fill="none" stroke="{reveal}" stroke-width="24"/>')
    c.add(f'<path d="{win}" fill="none" stroke="#FFD9A8" stroke-width="1" opacity="0.4" transform="translate(0 -12) scale(1)"/>')
    c.add(gold_rim(c, win, OR_ROUGE, 5))
    from kit import resample
    ring_pts = []
    for i in range(0, 41):
        y = 736 - i * (736 - 262) / 40
        ring_pts.append((270 - _door_half(y) - 15, y))
    ring_pts += [(270, 241)] + [(540 - x, y) for x, y in ring_pts[::-1]]
    ring = resample(ring_pts, 36)
    rnd = random.Random(3)
    c.add("".join(cowrie(x, y, 0.6, rnd.uniform(-25, 25)) for x, y in ring[1:-1]))
    drift = c.grad("drift", [(0, "#F6FBFF"), (0.6, "#C8E0F4"), (1, "#7FA8CC")])
    c.add(f'<path d="M-20 960 L-20 742 C40 728 90 752 150 748 C210 744 240 764 270 762 C300 760 330 744 390 748 C450 752 500 726 560 740 L560 960 Z" fill="{drift}"/>')
    c.add(f'<path d="M-20 742 C40 728 90 752 150 748 C210 744 240 764 270 762 C300 760 330 744 390 748 C450 752 500 726 560 740" fill="none" stroke="#FFFFFF" stroke-width="2" opacity="0.9"/>')
    c.add(f'<path d="M-20 770 C60 760 150 784 270 780 C390 776 480 758 560 768 L560 800 L-20 800 Z" fill="#6F98C4" opacity="0.35" filter="{ublur(c, "drs", 6)}"/>')
    rnd2 = random.Random(17)
    c.add("".join(sparkle(rnd2.uniform(20, 520), rnd2.uniform(744, 778), rnd2.uniform(2, 4.5), "#FFFFFF", rnd2.uniform(0.5, 0.95)) for _ in range(16)))
    c.add(snowfall(31, 80, (0, 0, W, 740), "#FFFFFF", 1.7))
    c.add(outer_frame(c, OR_ROUGE, 12, 3.5))
    crest_block(c, 270, 150, 0.84, "redgold", None, glow="#FFE2A0", glow_r=96)
    birds(c, [("mee-bisou-vole", 58, 652, 128, False, 10), ("meo-yo", 484, 664, 128, True, -10)])
    inscription(c, "Orateur", "D'un continent à l'autre", y=782, style="bois", metal=OR_ROUGE, kicker=kicker(), title_size=42)
    save(c, "orateur-b", "Orateur", None, "B", "La Case-obus sous l'aurore",
         "L'Afrique est venue au Nord : la photo s'ouvre par la porte d'une case-obus des Musgum (Cameroun, Tchad), dôme de terre en ogive "
         "dont les reliefs en chevrons - les marches qui servent à y grimper - sont poudrés de neige, la porte cerclée de cauris. "
         "Au-dessus, l'aurore se resserre en couronne sur son faîte et rayonne comme une voix, entre les sapins et les montagnes du fjord.",
         "cotes : Mee (bisou volé) et Meo (yo) au seuil de la case", "D'un continent à l'autre")


# =============================================================== C — le soleil de minuit

def oraC():
    c = start("oC", "#3E2A22", "#120A08", "#FFD8A0", 0.26)
    win = octo(70, 272, 470, 730, 26)
    m = deco_mask(c, win)
    hz = 272
    d = [sky(c, "sky", [(0, "#120C30"), (0.1, "#3A1E52"), (0.2, "#A04A62"), (0.26, "#F08A4A"), (0.283, "#FFD27A"), (0.2834, "#2A1A30"), (0.6, "#140C1C"), (1, "#05030A")])]
    d.append(star_field(51, 60, (0, 0, W, 120), keep=None, op=(0.2, 0.7)))
    d.append(light_rays(c, "lr", 270, hz - 18, 40, 700, 70, "#FFE2A0", seed=7, w=(1.5, 7), op=(0.08, 0.32)))
    d.append(f'<circle cx="270" cy="{hz - 18}" r="300" fill="{c.rgrad("sunglow", [(0, "#FFF6D0", 0.9), (0.2, "#FFC870", 0.5), (0.5, "#FF7A4A", 0.15), (1, "#FF7A4A", 0)])}"/>')
    d.append(f'<circle cx="270" cy="{hz - 18}" r="58" fill="{c.rgrad("sun", [(0, "#FFFFFF", 1), (0.6, "#FFF2C0", 1), (1, "#FFD27A", 1)])}"/>')
    d.append(mountains(c, "mt", [(-20, hz - 4), (40, hz - 70), (110, hz - 30), (170, hz - 54), (220, hz - 6)], hz + 40, seed=31,
                       fill=("#4A2A4A", "#1A0E1E"), snow=("#FFE6C8", "#E8A08A"), snow_depth=22, rim_light="#FFD27A"))
    d.append(mountains(c, "mt2", [(320, hz - 6), (380, hz - 60), (440, hz - 34), (500, hz - 80), (560, hz - 20)], hz + 40, seed=37,
                       fill=("#4A2A4A", "#1A0E1E"), snow=("#FFE6C8", "#E8A08A"), snow_depth=22, rim_light="#FFD27A"))
    d.append(water(c, "wa", hz, 960, "#3A2238", "#05030A", "#FFD27A", seed=21, glint_n=160))
    rnd = random.Random(9)
    path = "".join(f'<line x1="{f(270 - L / 2)}" y1="{f(y)}" x2="{f(270 + L / 2)}" y2="{f(y)}" stroke="#FFE7A8" stroke-width="{f(rnd.uniform(1, 2.6))}" opacity="{f(rnd.uniform(0.4, 0.95))}" stroke-linecap="round"/>'
                   for y, L in ((rnd.uniform(hz + 4, 960), rnd.uniform(20, 120)) for _ in range(90)))
    d.append(f'<g filter="{ublur(c, "glit", 0.8)}">{path}</g>')
    for side in (-1, 1):
        x = 0 if side < 0 else W
        keys = [(x - side * 30, hz + 10), (x + side * 56, hz + 40), (x + side * 48, 480), (x + side * 64, 620), (x + side * 50, 760), (x + side * 70, 820)]
        d.append(mountains(c, f"cl{side}", keys if side < 0 else keys[::-1], 980, seed=40 + side, fill=("#3A2238", "#0E0610"), snow=("#FFE6C8", "#C88A7A"), snow_depth=18, shade=0.5, rim_light="#FFC870"))
    c.add(f'<g mask="{m}">{"".join(d)}</g>')
    c.add(grade(c, win, "#FFB347", 0.5, 0.0, 0.28, "gr"))
    c.add(inner_shadow(c, win, 30, 12, 0.6))
    c.add(gold_rim(c, win, OR_ROUGE, 5))
    post = c.grad("post", [(0, "#1A0C08"), (0.5, "#4A2A1A"), (1, "#140806")], 0, 0, 1, 0)
    for x in (40, 500):
        c.add(f'<rect x="{x - 15}" y="300" width="30" height="404" rx="6" fill="{post}" stroke="#0A0402" stroke-width="1.5"/>')
        c.add(f'<rect x="{x - 15}" y="300" width="30" height="404" rx="6" fill="#FFB86A" opacity="0.12" filter="{texture_filter(c, "pwood", "0.01 0.3", 8, 4, "#FFE6C4", 1.2, 4)}"/>')
        c.add(plait(c, f"pp{x}", 304, x, 700, 6.5, 30, 3.6, rgold(c, "rcg"), "#2A0E04", vertical=True))
        for y in (300, 704):
            c.add(borre_boss(c, x, y, 13, OR_ROUGE, "#FF8A5C", name="bbc"))
    for side in (-1, 1):
        pts = [(270 + side * 26, 62), (270 + side * 74, 96), (270 + side * 128, 150), (270 + side * 160, 214)]
        c.add(drinking_horn(c, f"hn{side}", pts, 34, 4, metal=OR_ROUGE, horn=("#FFF2D8", "#C9965A", "#4A2810")))
    rnd = random.Random(4)
    drops = "".join(f'<circle cx="{f(270 + rnd.gauss(0, 16))}" cy="{f(48 + rnd.gauss(0, 10))}" r="{f(rnd.uniform(1, 3))}" fill="#FFE27A" opacity="{f(rnd.uniform(0.6, 1))}"/>' for _ in range(26))
    c.add(f'<g filter="{ublur(c, "drg", 2)}">{drops}</g>{drops}')
    c.add(sparkle(270, 46, 16, "#FFFFFF", 0.95))
    c.add(outer_frame(c, OR_ROUGE, 12, 3.5))
    crest_block(c, 270, 158, 0.86, "redgold", None, glow="#FFE2A0", glow_r=80)
    birds(c, [("mee-fete", 102, 712, 140, False, -6), ("meo-champagne", 438, 712, 140, True, 6)])
    inscription(c, "Orateur", "Skål, les amis !", y=786, style="bois", metal=OR_ROUGE, kicker=kicker(), title_size=42)
    save(c, "orateur-c", "Orateur", None, "C", "Le Soleil de minuit",
         "Au cœur de l'été boréal, le soleil ne se couche pas : il rase les montagnes, embrase le fjord d'un chemin d'or et lance ses rayons derrière le blason. "
         "Au-dessus, deux cornes à boire cerclées d'or rouge s'entrechoquent - « skål ! » - et deux piliers de bois sombre, tressés d'or rouge à la manière de Borre et cloutés de bossettes nouées, bordent la photo.",
         "pied : Mee (fête) et Meo (champagne) trinquent aux coins de la photo", "Skål, les amis !")


ALL = [oraA, oraB, oraC]
