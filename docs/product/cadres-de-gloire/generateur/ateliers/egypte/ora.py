"""Égypte solaire - Orateur A, B, C : la voix et la lumière (Amarna, Aksoum, Abou Simbel)."""

import math
import random

from kit import *  # noqa: F401,F403
from motifs import *  # noqa: F401,F403
from scene import *  # noqa: F401,F403
from archi import *  # noqa: F401,F403
from afrique import *  # noqa: F401,F403
from motifs import _mini_glyph, _poly  # noqa: F401
from cosmos import star_field  # noqa: F401

RANK = "Orateur"
METAL = "redgold"
RED3 = METALS["redgold"]


def tapered_ray(card, name, x0, y0, x1, y1, w0, w1, c0, c1, op0=1.0, op1=1.0):
    """Un rayon effilé, plus clair près de l'astre."""
    ang = math.atan2(y1 - y0, x1 - x0)
    nx, ny = -math.sin(ang), math.cos(ang)
    p = [(x0 + nx * w0 / 2, y0 + ny * w0 / 2), (x1 + nx * w1 / 2, y1 + ny * w1 / 2), (x1 - nx * w1 / 2, y1 - ny * w1 / 2), (x0 - nx * w0 / 2, y0 - ny * w0 / 2)]
    g = card.def_once(name, f'<linearGradient id="{card.id(name)}" gradientUnits="userSpaceOnUse" x1="{f(x0)}" y1="{f(y0)}" x2="{f(x1)}" y2="{f(y1)}">'
                            f'<stop offset="0" stop-color="{c0}" stop-opacity="{op0}"/><stop offset="1" stop-color="{c1}" stop-opacity="{op1}"/></linearGradient>')
    return f'<path d="{_poly(p)}" fill="{g}"/>'


# =============================================================== A - Les Mains d'Aton

def ora_a():
    c = start("oa", "#4A2C1A", "#160A04", "#FFD08A", 0.26)
    win = rrect(94, 300, 446, 736, 16)
    sx, sy, sr = 270, 138, 84
    bg = c.rgrad("bg", [(0, "#FFF9E6", 1), (0.16, "#FFE6A6", 1), (0.36, "#F9B04E", 1), (0.62, "#D2662C", 1), (0.86, "#7A2810", 1), (1, "#3A0E04", 1)], 0.5, 0.14, 0.98)
    d = [f'<rect width="{W}" height="{H}" fill="{bg}"/>']
    for k in range(7):
        d.append(f'<circle cx="{sx}" cy="{sy}" r="{110 + k * 46}" fill="none" stroke="#FFFFFF" stroke-width="{f(1.6 - k * 0.15)}" opacity="{f(0.32 - k * 0.035)}"/>')
    d.append(sunburst(c, "sb", sx, sy, 96, 900, 72, "#FFFFFF", 0.28, 0, 360, 8, 2))
    rays = []
    hands = []
    for side in (-1, 1):
        for a in range(96, 160, 6):
            r1 = 214 / math.sin(math.radians(a))
            x1, y1 = pt(sx, sy, r1, side * a)
            if y1 > 700:
                continue
            x0, y0 = pt(sx, sy, sr + 4, side * a)
            rays.append(tapered_ray(c, f"r{side}{a}", x0, y0, x1, y1, 5.0, 2.2, "#FFFDF0", "#E8A23C", 0.95, 0.95))
            hands.append(aten_hand(x1, y1, side * a, 1.25, "url(#oa-hand)", "#9A5A14", GOLD_HI if (a // 6) % 2 else None))
        for a in (132, 142, 152, 162, 172):
            r1 = (292 - sy) / -math.cos(math.radians(a))
            x1, y1 = pt(sx, sy, r1, side * a)
            x0, y0 = pt(sx, sy, sr + 4, side * a)
            rays.append(tapered_ray(c, f"s{side}{a}", x0, y0, x1, y1, 4.6, 2.2, "#FFFDF0", "#E8A23C", 0.95, 0.95))
            hands.append(aten_hand(x1, y1, side * a, 1.15, "url(#oa-hand)", "#9A5A14", GOLD_HI))
    c.grad("hand", [(0, GOLD_HI), (0.5, GOLD), (1, "#B8701C")], 0, 0, 0, 1)
    d.append(f'<g filter="{c.blur("rglow", 4)}" opacity="0.55">{"".join(rays)}</g>')
    d.append(f'<g filter="{c.shadow("rsh", 0, 2, 1.5, "#7A2A08", 0.45)}">{"".join(rays)}{"".join(hands)}</g>')
    for side in (-1, 1):
        x0 = 270 + side * 236
        d.append(papyrus_stand(3 if side < 0 else 7, x0, 770, 250, 12, "#1E6A44", "#BFF0A0", spread=56, rim_side=-side, umbel=(16, 26), w=2.4, lean=0.15,
                               xlim=(0, 96) if side < 0 else (444, 540)))
        d.append(papyrus_stand(5 if side < 0 else 9, x0 + side * 12, 770, 180, 9, "#2F8A54", "#DFFFC0", spread=48, rim_side=-side, umbel=(14, 22), w=2.0, lean=0.12,
                               xlim=(0, 96) if side < 0 else (444, 540)))
        for k, (dx, dy, ph) in enumerate(((0, 560, 0), (18, 600, 1), (-6, 640, 0))):
            d.append(duck_flight(x0 + side * dx * -1, dy, 0.85, "#F2E2C2", ("#2A6AB8", "#1F8A7A", "#C8432B")[k], flip=side > 0, phase=ph))
    d.append(f'<rect x="0" y="770" width="{W}" height="200" fill="{c.grad("fl", [(0, "#6A2A10"), (1, "#2A0C04")])}"/>')
    d.append(f'<rect x="0" y="900" width="{W}" height="60" fill="{c.grad("pool", [(0, "#1F6A8A"), (1, "#0E3A52")])}"/>')
    d.append(zigzag_water(0, 540, 918, 4, 8, TURQ_L, rows=3, gap=8, w=1.2, op=0.6))
    for x in (40, 130, 410, 500):
        d.append(lotus_flower(c, f"pl{x}", x, 914, 0.3))
    d.append(dust(8, 160, (0, 0, W, 760), "#FFFFFF", 0.55, 1.3))
    decorate(c, win, d)
    finish_window(c, win, "#FFD27A", 0.5, 0.0, 0.42, RED3, 4.5)
    c.add(sun_disk(c, "aten", sx, sy, sr, core="#FFE6A0", mid="#F8963A", edge="#C8432B", rim_metal=GOLD3, glow=0.6, glow_color="#FFF2C0"))
    c.add(outer_frame(c, RED3))
    crest(c, sx, sy - 4, 0.86, METAL)
    birds(c, [("mee-montee-au-ciel", 96, 694, 136, False, -4), ("meo-cool", 444, 694, 136, True, 4)])
    inscription(c, KICK, "Orateur", "Merci pour la lumière", y=772, style="cartouche", metal=RED3, panel=("#4A1406", "#1A0602"))
    save(c, "orateur-a", RANK, None, "A", "Les Mains d'Aton",
         "Amarna, la ville-soleil d'Akhenaton (Égypte) : le disque d'Aton se lève derrière le blason et ses rayons descendent sur le monde "
         "en petites mains d'or qui tendent la clé de vie jusqu'au bord de la photo. Dans les fourrés de papyrus des sols peints du palais "
         "s'envolent les canards du Nil, au-dessus du bassin aux lotus.",
         "pied (Mee montée au ciel, Meo cool)", "Merci pour la lumière")


# =============================================================== B - Les Stèles d'Aksoum

def ora_b():
    c = start("ob", "#3A2A2E", "#120A10", "#FFD8A0", 0.24)
    win = rrect(106, 292, 434, 736, 14)
    hz = 332
    sky = c.grad("sky", [(0, "#0A1240"), (0.1, "#24286A"), (0.2, "#6A3E8A"), (0.28, "#D2747A"), (0.33, "#FFC08A"), (0.346, "#FFF0C8"),
                         (0.3465, "#5A3A5A"), (0.5, "#2E1E34"), (1, "#0E0A12")])
    d = [f'<rect width="{W}" height="{H}" fill="{sky}"/>']
    d.append(star_field(4, 90, (0, 0, W, 150), "#FFFFFF", 1.2, keep=(180, 40, 360, 240)))
    d.append(sunburst(c, "sb", 270, hz, 40, 640, 64, "#FFF2C8", 0.55, -100, 100, 9, 2.5))
    d.append(f'<ellipse cx="270" cy="{hz}" rx="320" ry="190" fill="{c.rgrad("sunglow", [(0, "#FFF6D8", 0.95), (0.25, "#FFC070", 0.55), (1, "#FF8040", 0)])}"/>')
    d.append(noise_layer(c, "cl", (0, 120, 540, 330), "0.004 0.05", 4, 23, 2.6, -1.35, c.grad("clg", [(0, "#8A4E9A"), (0.6, "#F09A8A"), (1, "#FFD8A0")]), op=0.6))
    d.append(amba(c, "am1", hz + 2, "#9A6E9A", seed=4))
    d.append(amba(c, "am2", hz + 26, "#6E4A74", seed=9))
    d.append(amba(c, "am3", hz + 60, "#3E2846", seed=13))
    d.append(f'<rect x="0" y="{hz - 40}" width="{W}" height="120" fill="{agrad(c, "haze", [(0, "#FFD0A0", 0), (0.5, "#FFC8A0", 0.35), (1, "#FFC8A0", 0)])}"/>')
    d.append(dust(5, 120, (0, 0, W, 760), "#FFF0D0", 0.5, 1.2))
    fx0, fx1, ftop, fbot = 452, 522, 352, 748
    d.append(f'<path d="M434 {ftop - 6} L540 {ftop - 14} L540 {fbot + 40} L434 {fbot + 40} Z" fill="#2A1A2A"/>')
    d.append(f'<path d="M444 {ftop} C470 {ftop - 6} 500 {ftop - 6} 530 {ftop - 2}" fill="none" stroke="#FFD8A0" stroke-width="2" opacity="0.7"/>')
    d.append(f'<rect x="{fx0}" y="{ftop}" width="{fx1 - fx0}" height="{fbot - ftop}" fill="{c.grad("fall", [(0, "#F6E2C8"), (0.4, "#BFD8E8"), (1, "#EAF4FF")])}" opacity="0.55"/>')
    d.append(waterfall(c, "wf", fx0, fx1, ftop, fbot, seed=7, color="#FFFFFF", op=0.9))
    d.append(rainbow(c, "rb", 487, fbot - 4, 58, 16, op=0.7))
    for k, (x, y, r) in enumerate(((442, 356, 20), (534, 344, 22), (446, 430, 14), (532, 470, 16), (442, 560, 14), (536, 640, 18), (444, 690, 16))):
        d.append(foliage(k + 3, x, y, r))
    d.append(f'<rect x="0" y="{fbot}" width="{W}" height="{H - fbot}" fill="{c.grad("gorge", [(0, "#2A1E30"), (1, "#0C080E")])}"/>')
    d.append(f'<ellipse cx="487" cy="{fbot + 8}" rx="120" ry="40" fill="{c.rgrad("mist", [(0, "#FFFFFF", 0.65), (1, "#FFFFFF", 0)])}"/>')
    d.append(f'<rect x="0" y="904" width="{W}" height="56" fill="{c.grad("river", [(0, "#4A6A8A"), (1, "#1A2A3A")])}"/>')
    rnd = random.Random(3)
    d.append("".join(f'<rect x="{f(rnd.uniform(0, 540))}" y="{f(rnd.uniform(908, 956))}" width="{f(rnd.uniform(6, 20))}" height="1.3" rx="0.6" fill="#FFE2B0" opacity="{f(rnd.uniform(0.3, 0.8))}"/>' for _ in range(50)))
    d.append(aksum_stela(c, "s3", 170, 300, 34, 150, storeys=4, light="right", stone=("#E8C8A8", "#B08A70", "#5A3E36")))
    d.append(aksum_stela(c, "s2", 110, 330, 46, 230, storeys=6, light="right", stone=("#F0D0AE", "#B88E6E", "#5E4034")))
    decorate(c, win, d)
    finish_window(c, win, "#FFCF90", 0.5, 0.0, 0.36, RED3, 4.2)
    c.add(f'<g filter="{c.shadow("stsh", 4, 6, 8, "#000000", 0.55)}">{aksum_stela(c, "s1", 54, 770, 74, 610, storeys=11, light="right", glow="#FFE2B0")}</g>')
    c.add(f'<rect x="12" y="760" width="110" height="14" fill="{c.grad("base", [(0, "#B88E6E"), (1, "#4A2E26")])}"/>')
    c.add(disk_crescent(c, "dc", 270, 168, 74))
    c.add(f'<circle cx="270" cy="126" r="70" fill="{c.rgrad("dcg", [(0, "#FFF6D0", 0.7), (1, "#FFD080", 0)])}"/>')
    c.add(outer_frame(c, RED3))
    crest(c, 270, 124, 0.86, METAL)
    birds(c, [("mee-danse", 124, 698, 132, False, -6), ("meo-serenade", 418, 700, 132, True, 6)])
    inscription(c, KICK, "Orateur", "Merci de m'avoir écouté", y=774, style="cartouche", metal=RED3, panel=("#2A1430", "#0E0610"))
    save(c, "orateur-b", RANK, None, "B", "Les Stèles d'Aksoum",
         "Sur les hautes terres d'Éthiopie, d'où le Nil Bleu emporte vers l'Égypte l'essentiel de sa crue : les grandes stèles d'Aksoum, "
         "monolithes sculptés en tours à étages avec fausse porte et fenêtres, prennent le premier soleil. Le blason se pose dans le disque "
         "et le croissant des rois d'Aksoum, et à droite grondent les chutes du Nil Bleu, la « fumée de l'eau », sous leur arc-en-ciel.",
         "pied (Mee danse, Meo sérénade)", "Merci de m'avoir écouté")


# =============================================================== C - Le Matin d'Abou Simbel

def ora_c():
    c = start("oc", "#4A3020", "#160A06", "#FFC890", 0.26)
    win = rrect(116, 304, 424, 736, 6)
    top = 92
    sky = c.grad("sky", [(0, "#2A3E86"), (0.45, "#C27A9A"), (0.8, "#FFC890"), (1, "#FFE6B0")])
    d = [f'<rect width="{W}" height="{top + 40}" fill="{sky}"/>']
    d.append(noise_layer(c, "cl", (0, 10, 540, 100), "0.006 0.05", 4, 31, 2.4, -1.3, "#FFE2C8", op=0.6))
    rock = c.grad("rock", [(0, "#F2B47A"), (0.3, "#C8743E"), (0.65, "#8A4422"), (1, "#3A140A")])
    cliff = (f"M0 {top + 30} L20 {top + 10} L48 {top + 18} L60 {top - 6} L96 {top - 10} L130 {top - 28} L170 {top - 34} L370 {top - 34} "
             f"L410 {top - 26} L446 {top - 12} L480 {top - 4} L500 {top + 14} L540 {top + 4} L540 {H} L0 {H} Z")
    d.append(f'<path d="{cliff}" fill="{rock}" filter="{stone_filter(c, "rk", "0.3 0.08", 5, 0.6, "#FFF0E0", 52, 1.08)}"/>')
    rnd = random.Random(8)
    for k in range(26):
        y = top + 30 + k * 34 + rnd.uniform(-6, 6)
        d.append(f'<path d="M0 {f(y)} Q140 {f(y + rnd.uniform(-8, 8))} 270 {f(y + rnd.uniform(-4, 4))} T540 {f(y + rnd.uniform(-8, 8))}" fill="none" stroke="#7A3A1E" stroke-width="{f(rnd.uniform(0.6, 1.6))}" opacity="0.2"/>')
    fx0, fx1, ftop = 70, 470, top - 22
    fac = f"M{fx0} {H} L{fx0 + 22} {ftop} L{fx1 - 22} {ftop} L{fx1} {H} Z"
    d.append(f'<path d="{fac}" fill="{c.grad("fac", [(0, "#FFDCA8"), (0.4, "#F2AE70"), (0.75, "#D08048"), (1, "#9A5028")])}" filter="{stone_filter(c, "fc", "0.5 0.2", 9, 0.45, "#FFF4E8", 58, 1.05)}"/>')
    d.append(f'<path d="{fac}" fill="{c.rgrad("facl", [(0, "#FFF6D8", 0.6), (0.6, "#FFD890", 0.14), (1, "#FFD890", 0)], 0.5, 0.25, 0.7)}"/>')
    d.append(torus(c, "tl", fx0 + 22, ftop, fx0, H, 7, GOLD3))
    d.append(torus(c, "tr", fx1 - 22, ftop, fx1, H, 7, GOLD3))
    d.append(f'<rect x="{fx0 + 14}" y="{ftop - 4}" width="{fx1 - fx0 - 28}" height="6" fill="#B8704A"/>')
    bab_g = "url(#oc-bab)"
    c.grad("bab", [(0, "#FFF0CC"), (0.5, "#F0B472"), (1, "#A86434")], 0, 0, 0, 1)
    for i in range(11):
        x = fx0 + 40 + i * (fx1 - fx0 - 80) / 10
        d.append(f'<g transform="translate(1.5 2)" opacity="0.45">{baboon_front(x, ftop - 5, 0.72, "#6A2E18")}</g>{baboon_front(x, ftop - 6, 0.72, bab_g, "#FFF6DC", "#D09460", "#F0C08E")}')
    d.append(f'<rect x="{fx0 + 18}" y="{ftop + 2}" width="{fx1 - fx0 - 36}" height="20" fill="#9A5A3A" opacity="0.32"/>')
    for i in range(27):
        x = fx0 + 34 + i * (fx1 - fx0 - 68) / 26
        d.append(uraeus(c, x, ftop + 22, 0.36, "#F2BE76", "#6A3018"))
    d.append(f'<rect x="{fx0 + 18}" y="{ftop + 26}" width="{fx1 - fx0 - 36}" height="3" fill="#8A4A2E" opacity="0.6"/>')
    nx0, nx1, ny0, ny1 = 198, 342, 112, 286
    d.append(f'<rect x="{nx0}" y="{ny0}" width="{nx1 - nx0}" height="{ny1 - ny0}" fill="#7A3A22" opacity="0.55"/>')
    d.append(f'<rect x="{nx0 + 6}" y="{ny0 + 6}" width="{nx1 - nx0 - 12}" height="{ny1 - ny0 - 6}" fill="{c.grad("niche", [(0, "#4A1C10"), (1, "#8A4A2C")])}"/>')
    for x, gl in ((150, [0, 7, 3]), (390, [6, 1, 4])):
        d.append(cartouche_v(c, f"ct{x}", x, 206, 34, 150, gl, metal=GOLD3, fill="#7A3E24", ink="#FFE6B8", bv=True))
    for side in (-1, 1):
        for k in range(3):
            x = 270 + side * (154 + 12 * k + 6)
            d.append(f'<rect x="{f(min(x, x + side * 10))}" y="{304 - 8 * k}" width="10" height="{f(H - 304 + 8 * k)}" fill="{("#E89A5E", "#B86A3A", "#7A3A1C")[k]}"/>')
    sg = c.grad("semag", [(0, "#FFF0C8"), (0.5, "#E8B060"), (1, "#9A6028")], 0, 0, 1, 1)
    for side in (-1, 1):
        x = 270 + side * 214
        d.append(f'<rect x="{x - 34}" y="420" width="68" height="196" rx="3" fill="#3A1408" opacity="0.18"/>')
        d.append(f'<rect x="{x - 34}" y="420" width="68" height="196" rx="3" fill="none" stroke="#7A3E22" stroke-width="1.2" opacity="0.6"/>')
        d.append(sema_tawy(c, f"st{side}", x, 600, 1.08, sg, "#6A3418", "#FFF6DC"))
    d.append(f'<g style="mix-blend-mode:screen">{sunburst(c, "nrays", 270, 186, 74, 420, 44, "#FFF0C0", 0.32, 0, 360, 6, 2)}</g>')
    d.append(f'<path d="M0 {H} L0 800 C80 780 140 820 200 860 L340 860 C400 820 460 780 540 800 L540 {H} Z" fill="{c.grad("sand", [(0, "#F6CA8E"), (1, "#C88A4E")])}"/>')
    d.append(sand_ripples(14, 0, 810, W, 960, "#8A4A22", 9, 2, 0.8, 0.28))
    d.append(f'<g style="mix-blend-mode:screen">{beam(c, "first", -60, 1000, 300, 470, 240, 80, "#FFE2A0", 0.3, 14)}</g>')
    d.append(dust(9, 160, (0, 0, W, 960), "#FFF2D0", 0.55, 1.2))
    decorate(c, win, d)
    c.add(light_grade(c, win, "#FFD27A", 0.5, 1.0, 0.36, "lgb", 1.0))
    c.add(light_grade(c, win, "#FFE8B0", 0.5, 0.0, 0.16, "lgt", 0.9))
    c.add(inner_shadow(c, win))
    c.add(rim(c, win, RED3, 4))
    c.add(f'<g style="mix-blend-mode:screen">{beam(c, "firstin", 120, 780, 290, 520, 70, 20, "#FFF2C8", 0.28, 10)}</g>')
    c.add(sun_disk(c, "rh", 270, 186, 68, core="#FFF4D0", mid="#FFB24A", edge=CARN, rim_metal=GOLD3, glow=0.6, glow_color="#FFD890"))
    c.add(outer_frame(c, RED3))
    crest(c, 270, 184, 0.8, METAL)
    birds(c, [("mee-fete", 96, 700, 136, False, -6), ("meo-roi", 444, 700, 136, True, 6)])
    inscription(c, KICK, "Orateur", "Le jour se lève pour nous", y=774, style="corniche", metal=RED3, panel=("#3A1206", "#140402"))
    save(c, "orateur-c", RANK, None, "C", "Le Matin d'Abou Simbel",
         "Abou Simbel, en Nubie : la façade taillée dans la falaise de grès regarde le soleil levant. Sur la corniche, la rangée de babouins "
         "lève les bras pour l'acclamer, sous eux la frise d'uræus ; le blason brille dans la niche de Rê-Horakhty, le sema-taouy noue le lotus "
         "et le papyrus des Deux Terres, et, comme chaque 22 octobre et 22 février, le premier rayon traverse la porte jusqu'au sanctuaire.",
         "pied (Mee fête, Meo roi)", "Le jour se lève pour nous")
