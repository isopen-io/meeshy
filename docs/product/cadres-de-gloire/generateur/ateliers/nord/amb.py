"""Aurores du Nord - AMBASSADEUR V..I : le rang où l'on choisit son atmosphère. Métal or."""

import math
import random

from common import *  # noqa: F401,F403
from cosmos import star_field, bright_stars, cstar, nebula, corona_soft
from beasts import kente, cowrie, adinkra, RAVEN_SOAR, world_tree, dragon_head2
from ornements import borre_boss, plait_frame


def gold(c, name="gold", x1=0, y1=0, x2=1, y2=1):
    return metal_grad(c, name, OR, x1, y1, x2, y2)


def lantern(c, x, y, s=1.0, name="lan"):
    """Une lanterne de fer forgé, flamme chaude."""
    glow = c.rgrad(name + "-g", [(0, "#FFD27A", 0.75), (0.25, "#FF9A3D", 0.3), (1, "#FF9A3D", 0)])
    iron = "#14100C"
    return (f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(70 * s)}" fill="{glow}"/>'
            f'<g transform="translate({f(x)} {f(y)}) scale({f(s)})">'
            f'<path d="M0 -40 L0 -30" stroke="{iron}" stroke-width="2"/><circle cx="0" cy="-42" r="4" fill="none" stroke="{iron}" stroke-width="2"/>'
            f'<path d="M-13 -18 L0 -30 L13 -18 Z" fill="{iron}"/>'
            f'<rect x="-11" y="-18" width="22" height="30" fill="#FFB347" opacity="0.85"/>'
            f'<ellipse cx="0" cy="-2" rx="5" ry="9" fill="#FFF4C2"/>'
            f'<path d="M-11 -18 L-11 12 M11 -18 L11 12 M0 -18 L0 12 M-11 -3 L11 -3" stroke="{iron}" stroke-width="2"/>'
            f'<path d="M-14 12 L14 12 L10 18 L-10 18 Z" fill="{iron}"/></g>')


def mirror(markup):
    return f'<g transform="translate({W} 0) scale(-1 1)">{markup}</g>'


# =============================================================== V — le premier fjord

def amb5():
    c = start("a5", "#26364E", "#0A0E18", "#CFEFFF", 0.2)
    win = rrect(62, 264, 478, 732, 20)
    m = deco_mask(c, win)
    d = [boreal_sky(c, "sky", "#01030C", "#071A33", "#12385C", seed=5, nstars=320)]
    d.append(curtains(c, "au2", 168, 150, amp=24, waves=0.9, phase=2.2, fold=26, seed=6, top="#FF6FC8", mid="#9F7CFF", low="#E6D8FF", op=(0.1, 0.38)))
    d.append(curtains(c, "au1", 228, 210, amp=36, waves=1.15, phase=0.7, fold=42, seed=3, op=(0.22, 0.8)))
    d.append(curtains(c, "au3", 150, 120, amp=18, waves=1.6, phase=2.6, fold=24, seed=33, op=(0.1, 0.45)))
    d.append(bright_stars(c, 52, 7, (30, 30, 510, 170), keep=(200, 60, 340, 230), name="bs5"))
    d.append(mountains(c, "mt1", [(-20, 262), (38, 196), (96, 238), (150, 222), (214, 266), (326, 266), (388, 220), (446, 238), (504, 190), (560, 262)], 360, seed=4,
                       fill=("#3A6090", "#0B1A30"), snow_depth=34, rim_light="#BFFFE6"))
    for side in (-1, 1):
        x = 0 if side < 0 else W
        keys = [(x - side * 30, 250), (x + side * 76, 292), (x + side * 62, 430), (x + side * 80, 560), (x + side * 60, 700), (x + side * 90, 760)]
        if side > 0:
            keys = keys[::-1]
        d.append(mountains(c, f"cl{side}", keys, 980, seed=8 + side, fill=("#26507E", "#071224"), snow_depth=26, shade=0.5, rim_light="#9FFFD8"))
        for k, (yy, hh) in enumerate(((356, 46), (470, 58), (590, 64))):
            fx = 26 if side < 0 else W - 26
            d.append(fir(fx + side * (k % 2) * 12, yy, hh, "#03101C", "#CFE4F6", 30 + k + side, 0.55))
    d.append(water(c, "wa", 736, 960, "#1A4A7A", "#0A2440", "#BFFFE6", seed=6, glint_n=110))
    d.append(reflect(curtains(c, "au1r", 228, 210, amp=36, waves=1.15, phase=0.7, fold=42, seed=3), 736, 0.55, "rb", c, 3, 0.9))
    ice = c.grad("ice", [(0, "#E8F7FF"), (1, "#6F9CC4")])
    d.append(f'<path d="M-20 960 L-20 770 C40 762 90 784 120 820 C140 850 150 900 140 960 Z" fill="{ice}"/>')
    d.append(f'<path d="M560 960 L560 780 C500 772 450 796 420 830 C400 858 392 910 400 960 Z" fill="{ice}"/>')
    d.append(forest(4, -10, 120, 800, 46, 112, 8, "#03101C", "#DDEEFF", 0.8))
    d.append(forest(7, 420, 560, 808, 46, 120, 8, "#03101C", "#DDEEFF", 0.8))
    d.append(snowfall(3, 90, (0, 0, W, H), "#FFFFFF", 1.8))
    c.add(f'<g mask="{m}">{"".join(d)}</g>')
    c.add(grade(c, win, "#4DFFB4", 0.5, 0.0, 0.2, "gr"))
    c.add(inner_shadow(c, win, 30, 12, 0.6))
    c.add(gold_rim(c, win, OR, 5))
    c.add(f'<path d="M80 266 Q270 250 460 266" fill="none" stroke="#9FFFD8" stroke-width="3" opacity="0.55" filter="{ublur(c, "rimglow", 3)}"/>')
    c.add(plait_frame(c, "pf", 62, 264, 478, 732, gold(c, "plg"), 5, 28, 3.4, sides="tlr"))
    c.add(plait(c, "plb", 62, 732, 478, 5, 28, 3.4, gold(c, "plg"), "#2A1606"))
    for x, y in ((62, 264), (478, 264), (62, 732), (478, 732)):
        c.add(borre_boss(c, x, y, 15, OR, GEM_AURORE, name="bb"))
    for x, y in ((270, 264),):
        c.add(borre_boss(c, x, y, 11, OR, GEM_GLACE, name="bb"))
    c.add(fir(34, 770, 196, "#020A14", "#E8F4FF", 11, 0.85))
    c.add(fir(508, 780, 214, "#020A14", "#E8F4FF", 12, 0.85))
    c.add(outer_frame(c, OR, 12, 3.5))
    crest_block(c, 270, 128, 0.9, "gold", 5, GEM_AURORE, glow="#7CF7FF")
    birds(c, [("mee-coucou", 100, 708, 148, False, -6), ("meo-salut", 440, 708, 148, True, 6)])
    inscription(c, "Ambassadeur V", None, y=784, style="glace", metal=OR, panel=("#0E2640", "#040A16"), kicker=kicker())
    save(c, "ambassadeur-5", "Ambassadeur", 5, "V", "Le Premier Fjord",
         "Le premier soir au Nord : un rideau d'aurore se lève derrière le blason, au-dessus d'un fjord gelé dont l'eau noire le reflète ; "
         "les parois enneigées et leurs sapins encadrent la photo, que borde une tresse d'or de style de Borre clouée aux angles de bossettes nouées - anneau et losange entrelacés, gemme d'aurore au cœur (entrelacs viking, créations originales).",
         "pied : Mee (coucou) et Meo (salut) sur la rive gelée", None)


# =============================================================== IV — le portail de la stavkirke

def shingles(c, name, clip_d, x0, y0, x1, y1, r, fill, edge):
    rows = []
    y = y0
    k = 0
    while y < y1 + r:
        off = (k % 2) * r
        x = x0 - r + off
        while x < x1 + r:
            rows.append(f"M{f(x - r)} {f(y)} A{f(r)} {f(r * 1.15)} 0 0 0 {f(x + r)} {f(y)}")
            x += 2 * r
        y += r * 0.9
        k += 1
    cid = c.id(name + "-cl")
    c.def_once(name + "-cl", f'<clipPath id="{cid}"><path d="{clip_d}"/></clipPath>')
    return (f'<g clip-path="url(#{cid})"><path d="{clip_d}" fill="{edge}"/>'
            f'<path d="{" ".join(rows)}" fill="{fill}" stroke="{edge}" stroke-width="1.3"/>'
            f'<path d="{clip_d}" fill="{c.grad(name + "-sh", [(0, "#000000"), (1, "#000000")])}" opacity="0.0"/></g>')


def stave_tiers(x, y, s, color, gold_c=None):
    """La silhouette d'une stavkirke : toits étagés, têtes de dragon aux pignons, flèche."""
    out = []
    for k, (w, h, dy) in enumerate(((150, 36, 0), (112, 32, -40), (78, 28, -76), (48, 26, -108))):
        yy = y + dy * s
        out.append(f'<path d="M{f(x - w * s / 2)} {f(yy)} L{f(x)} {f(yy - h * s)} L{f(x + w * s / 2)} {f(yy)} Z" fill="{color}"/>')
        out.append(f'<rect x="{f(x - w * s * 0.36)}" y="{f(yy)}" width="{f(w * s * 0.72)}" height="{f(10 * s)}" fill="{color}"/>')
        for sx in (-1, 1):
            ex = x + sx * w * s * 0.5
            out.append(f'<path d="M{f(ex)} {f(yy)} q{f(sx * 7 * s)} {f(-10 * s)} {f(sx * 3 * s)} {f(-20 * s)} q{f(-sx * 3 * s)} {f(-2 * s)} {f(-sx * 7 * s)} {f(2 * s)}" fill="none" stroke="{color}" stroke-width="{f(2.4 * s)}" stroke-linecap="round"/>')
    out.append(f'<path d="M{f(x - 6 * s)} {f(y - 134 * s)} L{f(x)} {f(y - 186 * s)} L{f(x + 6 * s)} {f(y - 134 * s)} Z" fill="{color}"/>')
    if gold_c:
        out.append(sparkle(x, y - 190 * s, 5 * s, gold_c, 0.9))
    return "".join(out)


def amb4():
    c = start("a4", "#3C2A1C", "#120C08", "#FFC890", 0.24)
    win = gable(96, 444, 384, 296, 734, 14)
    m = deco_mask(c, win)
    slope = 252 / 300
    d = [boreal_sky(c, "sky", "#01030C", "#08203C", "#123A5E", seed=9, nstars=220)]
    d.append(curtains(c, "au1", 200, 180, amp=30, waves=1.0, phase=1.6, fold=36, seed=8))
    d.append(curtains(c, "au2", 130, 110, amp=20, waves=0.7, phase=0.3, fold=20, seed=18, top="#FF6FC8", mid="#B07CFF", low="#F0E0FF", op=(0.08, 0.3)))
    d.append(stave_tiers(90, 300, 0.62, "#040A14", "#FFD36E"))
    d.append(stave_tiers(450, 300, 0.62, "#040A14", "#FFD36E"))
    wall = c.grad("wall", [(0, "#3A2414"), (0.5, "#4A2E18"), (1, "#1A0E06")], 0, 0, 1, 0)
    d.append(f'<path d="M-30 470 L270 218 L570 470 L570 960 L-30 960 Z" fill="{wall}"/>')
    d.append(f'<path d="M-30 470 L270 218 L570 470 L570 960 L-30 960 Z" fill="#B07A48" opacity="0.2" filter="{texture_filter(c, "wood", "0.008 0.25", 8, 4, "#FFE6C4", 1.2, 4)}"/>')
    d.append("".join(f'<line x1="{x}" y1="200" x2="{x}" y2="{H}" stroke="#0C0603" stroke-width="2" opacity="0.6"/>' for x in range(18, 540, 36)))
    field = "M-30 380 L270 128 L570 380 L570 436 L270 184 L-30 436 Z"
    d.append(shingles(c, "sh", field, -30, 110, 570, 440, 10, "#3A2416", "#0E0704"))
    d.append(f'<path d="{field}" fill="{c.grad("shd", [(0, "#000000"), (1, "#000000")])}" opacity="0.25"/>')
    d.append(f'<path d="M-30 380 L270 128 L570 380" fill="none" stroke="#F4FBFF" stroke-width="9" stroke-linejoin="round"/>')
    d.append(f'<path d="M-30 386 L270 134 L570 386" fill="none" stroke="#8FB4D4" stroke-width="2.4" opacity="0.8"/>')
    icicles = []
    for side in (-1, 1):
        for k in range(8, 14):
            x = 270 + side * (40 + k * 22)
            y = 218 + abs(x - 270) * slope + 34
            icicles.append(f'<path d="M{f(x - 2.5)} {f(y)} L{f(x)} {f(y + 8 + (k * 7) % 13)} L{f(x + 2.5)} {f(y)} Z" fill="#E8F7FF" opacity="0.85"/>')
    c.add(f'<g mask="{m}">{"".join(d)}</g>')
    c.add(grade(c, win, "#FFB347", 0.5, 1.0, 0.2, "gr"))
    c.add(inner_shadow(c, win, 34, 14, 0.7))
    board = c.grad("board", [(0, "#5A381E"), (1, "#24130A")], 0, 0, 0, 1)
    left_board = "M-30 436 L270 184 L270 218 L-30 470 Z"
    ang = math.degrees(math.atan2(-252, 300))
    plait_l = plait(c, "rpl", 0, 0, 382, 4.6, 24, 3.2, gold(c, "rg"), "#1A0C04")
    left = (f'<path d="{left_board}" fill="{board}" stroke="#0C0603" stroke-width="2"/>'
            f'<g transform="translate(-30 453) rotate({f(ang)})">{plait_l}</g>')
    c.add(f'<g filter="{c.shadow("bsh", 0, 6, 8, "#000000", 0.6)}">{left}{mirror(left)}</g>')
    c.add("".join(icicles))
    fin = gold(c, "fin")
    for side in (-1, 1):
        ext = [(270 - side * 30, 228), (270 + side * 10, 194), (270 + side * 44, 150), (270 + side * 66, 110)]
        c.add(f'<path d="{ribbon(ext, 26, 18, n=20)}" fill="{board}" stroke="#0C0603" stroke-width="2"/>')
        rot = -58 if side > 0 else 58
        sc = "1.05 1.05" if side > 0 else "-1.05 1.05"
        c.add(f'<g filter="{bevel(c, "fbv", 1.0, 2.4, sd=4, dy=3, sop=0.6)}"><g transform="translate({270 + side * 64} 112) rotate({rot}) scale({sc})">'
              f'{dragon_head2(fin, "#2A1606", "#7CF7FF", mane=True)}</g></g>')
    post = c.grad("post", [(0, "#24140A"), (0.5, "#4E3018"), (1, "#1A0C04")], 0, 0, 1, 0)
    for side in (-1, 1):
        x0 = 24 if side < 0 else 456
        c.add(f'<rect x="{x0}" y="470" width="60" height="420" rx="4" fill="{post}" stroke="#0C0603" stroke-width="2"/>')
        c.add(f'<rect x="{x0 + 5}" y="476" width="50" height="408" rx="3" fill="none" stroke="{OR[1]}" stroke-width="1.2" opacity="0.8"/>')
        for ph in (0.0, math.pi):
            pts = [(x0 + 30 + 15 * math.sin(i * 0.95 + ph), 872 - i * 30) for i in range(14)]
            c.add(serpent(c, f"ps{side}{int(ph)}", pts, 10, gold(c, "sg"), "#1A0C04", head=True, head_s=0.5))
    for x in (64, 476):
        c.add(lantern(c, x, 470, 0.85, "lan"))
    c.add(gold_rim(c, win, OR, 5))
    c.add(snow_bank(c, "sb", -20, 560, 902, 16, ("#EAF6FF", "#7FA8CC"), seed=3))
    c.add(snowfall(5, 80, (0, 0, W, 300), "#FFFFFF", 1.8, keep_clear=False))
    c.add(outer_frame(c, OR, 12, 3.5))
    crest_block(c, 270, 196, 0.8, "gold", 3, GEM_AURORE, glow="#FFD36E", glow_r=80)
    birds(c, [("mee-sourire", 102, 232, 100, False, -24), ("meo-cool", 438, 232, 100, True, 24)])
    inscription(c, "Ambassadeur III", "Merci la famille", y=770, style="bois", metal=OR, kicker=kicker())
    save(c, "ambassadeur-3", "Ambassadeur", 3, "III", "Le Portail de la stavkirke",
         "On entre dans la photo par le portail d'une église en bois debout : toit d'écailles sous la neige, rives sculptées d'une tresse d'or, "
         "deux têtes de dragon dressées au faîte comme sur les pignons des stavkirker, et sur les montants des serpents entrelacés "
         "à la manière d'Urnes (création originale), entre deux lanternes allumées et la silhouette d'autres églises sous l'aurore.",
         "perches : Mee (sourire) et Meo (cool) sur le toit enneigé", "Merci la famille")


# =============================================================== III — la pierre runique

def amb3():
    c = start("a3", "#2A3446", "#0A0D14", "#E0F0FF", 0.2)
    win = shape([(80, 730, 1), (76, 520), (84, 384), (122, 304), (192, 266), (270, 258), (348, 266), (418, 304), (456, 384), (464, 520), (460, 730, 1)])
    m = deco_mask(c, win)
    d = [boreal_sky(c, "sky", "#02040C", "#0A1A30", "#1A3050", seed=12, nstars=260)]
    d.append(moon(c, "mn", 440, 88, 28, glow=3.4))
    d.append(curtains(c, "au1", 176, 150, amp=24, waves=0.8, phase=3.0, fold=30, seed=11, op=(0.12, 0.48)))
    d.append(mountains(c, "mt", [(-20, 360), (60, 300), (140, 340), (220, 300), (300, 330), (380, 290), (470, 330), (560, 300)], 520, seed=6, fill=("#2C4C74", "#0A1626"), snow_depth=40))
    stone_d = shape([(10, 960, 1), (4, 640), (14, 380), (58, 228), (150, 128), (270, 92), (390, 128), (482, 228), (526, 380), (536, 640), (530, 960, 1)])
    sg = c.grad("stone", [(0, "#5E6A78"), (0.5, "#3E4A58"), (1, "#1A222C")], 0, 0, 1, 1)
    d.append(f'<g filter="{c.shadow("ssh", 0, 10, 16, "#000000", 0.7)}"><path d="{stone_d}" fill="{sg}"/></g>')
    d.append(f'<path d="{stone_d}" fill="#C8D2DC" opacity="0.3" filter="{texture_filter(c, "stx", "0.06", 5, 4, "#FFFFFF", 1.3, 5)}"/>')
    d.append(f'<path d="{stone_d}" fill="{c.rgrad("moonlit", [(0, "#DCEBFF", 0.32), (0.6, "#9FC0E0", 0.06), (1, "#000000", 0)], 0.85, 0.08, 0.8)}"/>')
    d.append(f'<path d="{stone_d}" fill="{c.rgrad("aurlit", [(0, "#4DFFB4", 0.18), (1, "#4DFFB4", 0)], 0.0, 0.3, 0.6)}"/>')
    rnd = random.Random(4)
    lich = "".join(f'<circle cx="{f(rnd.uniform(20, 520))}" cy="{f(rnd.uniform(140, 940))}" r="{f(rnd.uniform(2, 9))}" fill="{rnd.choice(("#9FD8C0", "#E8D68A"))}" opacity="{f(rnd.uniform(0.08, 0.22))}"/>' for _ in range(90))
    d.append(f'<g filter="{ublur(c, "lb", 1.2)}">{lich}</g>')
    patches = []
    for cxp, cyp, rr, col in ((70, 300, 34, "#E8962E"), (40, 520, 28, "#D8B04A"), (500, 360, 30, "#E8962E"), (486, 600, 36, "#C9C27A"),
                              (180, 150, 22, "#D8B04A"), (380, 140, 26, "#E8962E"), (30, 760, 30, "#E8962E"), (512, 790, 26, "#D8B04A")):
        for _ in range(70):
            a, dd = rnd.uniform(0, 360), rr * rnd.random() ** 0.8
            x, y = pt(cxp, cyp, dd, a * 1.0)
            patches.append(f'<circle cx="{f(x)}" cy="{f(y * 1.0)}" r="{f(rnd.uniform(1.5, 5.5) * (1 - dd / rr * 0.5))}" fill="{col}" opacity="{f(rnd.uniform(0.2, 0.5))}"/>')
    d.append(f'<g clip-path="{win_clip(c, stone_d, "stc")}" filter="{ublur(c, "lp", 1.1)}">{"".join(patches)}</g>')
    d.append(f'<path d="{stone_d}" fill="none" stroke="#DDE6EE" stroke-width="2" opacity="0.35"/>')
    from kit import resample as _rs
    top = _rs([(14, 380), (58, 228), (150, 128), (270, 92), (390, 128), (482, 228), (526, 380)], 60)
    rs = random.Random(21)
    upper = [(x, y - 1) for x, y in top]
    lower = []
    for i, (x, y) in enumerate(top):
        t = i / (len(top) - 1)
        depth = (6 + 10 * math.sin(math.pi * t) ** 0.6) * (1 + 0.5 * math.sin(i * 1.7)) + rs.uniform(0, 4)
        lower.append((x + (1 if x > 270 else -1) * depth * 0.3 * (abs(x - 270) / 270), y + depth))
    cap = smooth(upper) + " L" + smooth(lower[::-1])[1:] + " Z"
    d.append(f'<path d="{cap}" fill="{c.grad("scap", [(0, "#FFFFFF"), (1, "#B9D4EC")])}" opacity="0.95"/>')
    d.append(f'<path d="{smooth(lower)}" fill="none" stroke="#7FA0C0" stroke-width="1.2" opacity="0.5"/>')
    c.add(f'<g mask="{m}">{"".join(d)}</g>')
    c.add(grade(c, win, "#9FD8FF", 0.5, 0.0, 0.16, "gr"))
    c.add(inner_shadow(c, win, 36, 14, 0.75))
    loop = [(140, 776), (78, 752), (56, 600), (58, 420), (92, 294), (170, 226), (270, 208), (370, 226), (448, 294), (482, 420), (484, 600), (470, 732), (420, 774), (340, 792), (262, 788), (226, 778)]
    groove = ribbon(loop, 46, 40, n=120)
    c.add(f'<path d="{groove}" fill="#0A0E14" opacity="0.45" filter="{ublur(c, "grv", 3)}"/>')
    c.add(f'<path d="{ribbon(loop, 40, 40, n=160, wfn=lambda t: 36 if t < 0.88 else 36 * max(0.12, (1 - t) / 0.12))}" fill="#C8462A" opacity="0.9"/>')
    c.add(serpent(c, "srp", loop, 30, gold(c, "sgd"), "#2A1004", head=False, runes_seed=21, rune_color="#5A1A08", rune_size=14, n=180))
    c.add(f'<g filter="{bevel(c, "hbv", 0.9, 2.2, sd=3, dy=2, sop=0.6)}"><g transform="translate(140 776) rotate(-8) scale(0.95)">'
          f'{dragon_head2(gold(c, "sgd"), "#2A1004", "#7CF7FF", "#5A1A08", "#C8462A", horn=False, mane=True)}</g></g>')
    c.add(f'<path d="{win}" fill="none" stroke="#C8462A" stroke-width="3" opacity="0.9"/>')
    c.add(f'<path d="{win}" fill="none" stroke="#F4E6C8" stroke-width="1" opacity="0.6" transform="translate(0 2)"/>')
    for x, y, fl in ((104, 170, False), (436, 170, True)):
        c.add(f'<g filter="{c.shadow("rvs", 0, 3, 3, "#000000", 0.6)}">{place(silhouette(RAVEN_PERCH, "#04070E", "#9FFFE0", 1.3, -0.9), x, y, 1.15, fl)}</g>')
        ex = x + (31 if not fl else -31) * 1.15
        c.add(f'<circle cx="{f(ex)}" cy="{f(y - 43 * 1.15)}" r="1.4" fill="#BFFFE8"/>')
    c.add(snow_bank(c, "sb", -20, 560, 930, 22, ("#EAF6FF", "#8FB4D4"), seed=7))
    c.add(outer_frame(c, OR, 12, 3.5))
    crest_block(c, 270, 134, 0.86, "gold", 4, GEM_AURORE, glow="#BFE6FF", backing="#1A222C")
    birds(c, [("mee-wow", 66, 470, 122, False, 14), ("meo-bravo", 474, 488, 122, True, -14)])
    inscription(c, "Ambassadeur IV", None, y=806, style="pierre", metal=OR, panel=("#3A4450", "#161C24"), kicker=kicker())
    save(c, "ambassadeur-4", "Ambassadeur", 4, "IV", "La Pierre runique",
         "La photo est gravée dans une pierre levée sous la lune : un serpent d'or porte une inscription runique tout autour et se mord la queue, "
         "comme les serpents des pierres runiques d'Uppland (création originale), sur un lit d'ocre rouge - ces pierres étaient peintes à l'origine ; "
         "la neige coiffe la pierre, le lichen orangé la mouchette, et Huginn et Muninn, les corbeaux d'Odin, veillent perchés sur ses épaules.",
         "cotes : Mee (wow) et Meo (bravo) se penchent hors de la pierre", None)


# =============================================================== II — le drakkar (Afrique fondue dans le Nord)

def amb2():
    c = start("a2", "#2E3448", "#0C0E16", "#FFE2B8", 0.22)
    win = "M80 270 L460 270 Q476 480 468 700 Q270 720 72 700 Q64 480 80 270 Z"
    m = deco_mask(c, win)
    d = [boreal_sky(c, "sky", "#02030B", "#0A1A34", "#163A60", seed=14, nstars=300)]
    d.append(moon(c, "mn", 92, 96, 26, glow=3.0))
    d.append(curtains(c, "au1", 210, 200, amp=40, waves=1.3, phase=0.2, fold=40, seed=13))
    d.append(curtains(c, "au2", 150, 120, amp=20, waves=0.9, phase=1.2, fold=20, seed=15, top="#FF6FC8", mid="#B07CFF", low="#F0E0FF", op=(0.08, 0.32)))
    d.append(water(c, "sea", 812, 960, "#0E2A48", "#01040A", "#9FFFD8", seed=8, glint_n=90))
    d.append(reflect(curtains(c, "au1r", 210, 200, amp=40, waves=1.3, phase=0.2, fold=40, seed=13), 812, 0.38, "rb", c, 3, 0.45))
    rnd = random.Random(3)
    waves_d = " ".join(f"M{f(x)} {f(y)} q8 -6 16 0 t16 0" for x, y in ((rnd.uniform(-10, 530), rnd.uniform(830, 950)) for _ in range(40)))
    d.append(f'<path d="{waves_d}" fill="none" stroke="#BFE6FF" stroke-width="1.1" opacity="0.45"/>')
    c.add(f'<g mask="{m}">{"".join(d)}</g>')
    sail_outer = "M60 254 L480 254 Q498 480 490 718 Q270 742 50 718 Q42 480 60 254 Z"
    cid = c.id("sail")
    c.def_once("sail", f'<clipPath id="{cid}"><path d="{sail_outer}"/></clipPath>')
    strips = "".join(kente(x, 240, 32, 520, seed=x, vertical=True) for x in range(40, 500, 32))
    sail_m = deco_mask(c, win, "sm")
    c.add(f'<g mask="{sail_m}"><g clip-path="url(#{cid})">{strips}'
          f'<path d="{sail_outer}" fill="{c.rgrad("sailsh", [(0.6, "#000000", 0), (1, "#000000", 0.35)])}"/></g>'
          f'<path d="{sail_outer}" fill="none" stroke="#2A1606" stroke-width="2.5"/></g>')
    c.add(grade(c, win, "#FFD36E", 0.5, 0.0, 0.18, "gr"))
    c.add(inner_shadow(c, win, 28, 12, 0.6))
    c.add(gold_rim(c, win, OR, 4))
    wood = c.grad("wood", [(0, "#7A5030"), (1, "#24120A")], 0, 0, 0, 1)
    c.add(f'<line x1="270" y1="34" x2="270" y2="262" stroke="#1A0C04" stroke-width="13"/><line x1="270" y1="34" x2="270" y2="262" stroke="{wood}" stroke-width="9"/>')
    for x1 in (44, 496):
        c.add(f'<line x1="270" y1="40" x2="{x1}" y2="246" stroke="#C9B48A" stroke-width="1.2" opacity="0.8"/>')
        c.add(f'<line x1="{x1}" y1="252" x2="{x1 - 14 if x1 < 270 else x1 + 14}" y2="760" stroke="#C9B48A" stroke-width="1.2" opacity="0.8"/>')
    c.add(f'<g filter="{c.shadow("ysh", 0, 4, 4, "#000000", 0.6)}"><path d="{ribbon([(30, 256), (150, 249), (270, 247), (390, 249), (510, 256)], 13, 13, n=30, wfn=lambda t: 6 + 8 * math.sin(math.pi * t))}" fill="{wood}" stroke="#1A0C04" stroke-width="1.6"/></g>')
    vane = gold(c, "vane")
    c.add(f'<g filter="{bevel(c, "vbv", 0.9, 2.4, sd=3, dy=2, sop=0.6)}"><path d="M274 30 L330 30 Q334 64 274 80 Z" fill="{vane}" stroke="#5A3A0E" stroke-width="1"/>'
          + "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="2.2" fill="#3A220A"/>' for x, y in ((316, 40), (318, 52), (306, 62), (292, 70)))
          + f'<g transform="translate(300 30) scale(0.34)">{dragon_head2(vane, "#5A3A0E", "#7CF7FF")}</g></g>')
    hull = "M-40 752 C60 742 160 738 270 738 C380 738 480 742 580 752 L560 818 C470 858 370 870 270 870 C170 870 70 858 -20 818 Z"
    c.add(f'<g filter="{c.shadow("hsh", 0, 8, 10, "#000000", 0.7)}"><path d="{hull}" fill="{wood}" stroke="#1A0C04" stroke-width="2"/></g>')
    for k, yy in enumerate((762, 784, 806, 828)):
        c.add(f'<path d="M-30 {yy} C120 {yy - 12 + k * 3} 420 {yy - 12 + k * 3} 570 {yy}" fill="none" stroke="#1A0C04" stroke-width="1.2" opacity="0.7"/>')
        c.add(f'<path d="M-30 {yy + 1.5} C120 {yy - 10.5 + k * 3} 420 {yy - 10.5 + k * 3} 570 {yy + 1.5}" fill="none" stroke="#FFE2B8" stroke-width="0.6" opacity="0.15"/>')
    c.add(f'<path d="M-40 752 C60 742 160 738 270 738 C380 738 480 742 580 752" fill="none" stroke="{gold(c, "gw")}" stroke-width="3"/>')
    prow = [(-14, 812), (12, 760), (28, 690), (40, 610), (66, 566), (96, 548)]
    stern = [(548, 812), (520, 760), (500, 690), (494, 622), (502, 576), (522, 560), (536, 574), (526, 590)]
    for pts, w0, w1 in ((prow, 30, 16), (stern, 30, 7)):
        c.add(f'<g filter="{c.shadow("psh", 0, 6, 6, "#000000", 0.6)}"><path d="{ribbon(pts, w0, w1, n=50)}" fill="{wood}" stroke="#1A0C04" stroke-width="1.8"/></g>')
        c.add(f'<path d="{smooth(pts[:-1])}" fill="none" stroke="{gold(c, "pg")}" stroke-width="2.2"/>')
    c.add(f'<g filter="{bevel(c, "dbv", 1.0, 2.4, sd=4, dy=3, sop=0.6)}"><g transform="translate(96 548) rotate(32) scale(-1.0 1.0)">{dragon_head2(gold(c, "dh"), "#2A1606", "#7CF7FF")}</g></g>')
    shields = {58: ("adinkra", "dwennimmen", ("#F2E6CF", "#121010")), 104: ("paint", "quart", ("#B3261E", "#F2E6CF")),
               150: ("adinkra", "nsoromma", ("#1E7A46", "#E8B53C")), 390: ("paint", "spirale", ("#1F4E8C", "#F2E6CF")),
               436: ("adinkra", "adinkrahene", ("#E8B53C", "#121010")), 482: ("paint", "rayons", ("#F2E6CF", "#7A1F1A"))}
    for i, (x, (kind, pat, cols)) in enumerate(shields.items()):
        y = 742
        if kind == "paint":
            c.add(round_shield(c, x, y, 21, cols, pat, OR, name=f"s{i}", studs=8, rot=i * 20))
        else:
            c.add(round_shield(c, x, y, 21, cols, "plain", OR, name=f"s{i}", studs=0))
            c.add(f'<circle cx="{x}" cy="{y}" r="17" fill="{cols[0]}"/>')
            c.add(adinkra(pat, x, y, 0.38 if pat != "adinkrahene" else 0.5, cols[1]))
            for k in range(10):
                sx, sy = pt(x, y, 19, k * 36)
                c.add(cowrie(sx, sy, 0.26, k * 36))
    birds(c, [("mee-fete", 104, 206, 104, False, -6), ("meo-cool", 436, 206, 104, True, 6)])
    c.add(outer_frame(c, OR, 12, 3.5))
    crest_block(c, 270, 150, 0.86, "gold", 2, GEM_AURORE, glow="#FFD36E", glow_r=90)
    inscription(c, "Ambassadeur II", "Le voyage continue", y=786, style="nuit", metal=OR, panel=("#101C30", "#04070E"), kicker=kicker(), w=400)
    c.motif("afrique")
    save(c, "ambassadeur-2", "Ambassadeur", 2, "II", "Le Drakkar au kente",
         "La photo devient la voile d'un drakkar qui file sous l'aurore, tête de dragon d'or à la proue et girouette viking au mât. "
         "L'Afrique est montée à bord : la voile est bordée de kente tissé (or, vert, rouge, noir) et, entre les boucliers peints, "
         "trois boucliers portent les symboles adinkra Dwennimmen (force et humilité), Nsoromma (l'enfant des cieux) et Adinkrahene, cerclés de cauris.",
         "perches : Mee (fête) et Meo (cool) sur la vergue", "Le voyage continue")


# =============================================================== I — Yggdrasil d'or

def golden_apple(c, x, y, r=5, name="apple"):
    g = c.rgrad(name, [(0, "#FFFBE0", 1), (0.35, "#FFD54A", 1), (1, "#B8740E", 1)], 0.35, 0.3, 0.7)
    return (f'<circle cx="{f(x)}" cy="{f(y + r * 0.2)}" r="{f(r * 2.4)}" fill="{c.rgrad(name + "-gl", [(0, "#FFE27A", 0.55), (1, "#FFE27A", 0)])}"/>'
            f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{g}"/>'
            f'<path d="M{f(x)} {f(y - r)} q1 -3 3 -4" stroke="#5A3A0E" stroke-width="1" fill="none"/>')


def amb1():
    c = start("a1", "#2C2A3E", "#0C0A14", "#FFE6B0", 0.24)
    win = oval(270, 494, 190, 234)
    m = deco_mask(c, win)
    d = [boreal_sky(c, "sky", "#01020A", "#081830", "#10304E", seed=21, nstars=360)]
    d.append(corona_soft(c, "cor", 270, 128, 30, 380, 220, colors=("#4DFFB4", "#B07CFF"), seed=5))
    d.append(curtains(c, "au1", 340, 240, amp=50, waves=1.0, phase=1.0, fold=50, seed=17, op=(0.12, 0.5)))
    well = c.rgrad("well", [(0, "#BFFFE6", 0.9), (0.3, "#4DFFB4", 0.45), (1, "#1FD69A", 0)])
    d.append(f'<ellipse cx="270" cy="900" rx="280" ry="100" fill="{well}"/>')
    d.append(snow_bank(c, "sb", -20, 560, 934, 16, ("#DFF6FF", "#6F98BC"), seed=9))
    c.add(f'<g mask="{m}">{"".join(d)}</g>')
    c.add(grade(c, win, "#FFD36E", 0.5, 0.0, 0.22, "gr"))
    c.add(inner_shadow(c, win, 34, 14, 0.65))
    segs, tips = world_tree(c, "wt", seed=11, base=(270, 930), spread=1.1, crown_y=150, side_x=(64, 476), waist=(330, 600), twig_len=50, depth=3)
    tg = gold(c, "tg", 0, 0, 1, 1)
    body = " ".join(segs)
    c.add(f'<g filter="{ublur(c, "tglow", 8)}" opacity="0.6"><path d="{body}" fill="#FFB347"/></g>')
    c.add(f'<g filter="{bevel(c, "tbv", 1.0, 2.6, sd=4, dy=3, sop=0.65)}"><path d="{body}" fill="{tg}"/></g>')
    keep_tips = [t for t in tips if not (100 < t[0] < 440 and 284 < t[1] < 720)]
    c.add(f'<g filter="{ublur(c, "lglow", 4)}" opacity="0.7">{leaves(6, keep_tips, "#7CFFD0", r=5, n=3, spread=8)}</g>')
    c.add(leaves(5, keep_tips, "#5DFFC0", r=3.6, n=8, spread=8, alt="#FFE27A"))
    rnd = random.Random(8)
    apples = [t for t in keep_tips if t[1] < 700]
    rnd.shuffle(apples)
    c.add("".join(golden_apple(c, x, y + 4, 4.6, "ap") for x, y, _ in apples[:14]))
    c.add(gold_rim(c, win, OR, 5))
    c.add(f'<path d="{oval(270, 494, 200, 244)}" fill="none" stroke="{OR[1]}" stroke-width="1" opacity="0.7" stroke-dasharray="2 5"/>')
    for x, y, fl in ((116, 214, False), (424, 214, True)):
        c.add(f'<g filter="{bevel(c, "rbv", 0.8, 2.2, sd=3, dy=2, sop=0.6)}">{place(silhouette(RAVEN_PERCH, gold(c, "rv")), x, y, 1.35, fl)}</g>')
    c.add(outer_frame(c, OR, 12, 3.5))
    c.add(rune_band(c, "rb", 150, 26, 390, 13, OR[1], seed=8, w=1.4))
    crest_block(c, 270, 128, 0.92, "gold", 1, GEM_AURORE, glow="#FFE27A", glow_r=100)
    birds(c, [("mee-bravo", 92, 726, 140, False, -6), ("meo-trophee", 448, 726, 140, True, 6)])
    inscription(c, "Ambassadeur I", "On l'a fait ensemble", y=782, style="bois", metal=OR, kicker=kicker())
    save(c, "ambassadeur-1", "Ambassadeur", 1, "I", "Yggdrasil d'or",
         "Le frêne-monde Yggdrasil devient le cadre : son tronc d'or se fend autour de la photo, ses racines boivent au puits lumineux d'Urd, "
         "sa couronne de feuilles d'aurore porte le blason sous une couronne boréale et les pommes d'or d'Idunn ; "
         "Huginn et Muninn, les corbeaux d'Odin, y sont perchés, sous une ligne de runes du futhark ancien.",
         "pied : Mee (bravo) et Meo (trophée) sur les racines", "On l'a fait ensemble")


ALL = [amb5, amb4, amb3, amb2, amb1]
