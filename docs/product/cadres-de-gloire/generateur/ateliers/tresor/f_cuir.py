"""Atelier « Trésor » — les paliers de cuir : Bourse (1 Meesh) et Escarcelle (10 Meeshes)."""

import math
import random

from cadre import *  # noqa: F401,F403
from objets import (LEATHER, leather_fill, cord, tassel, pouch, cowrie, cowrie_pouch, embroidered_purse, pearl,
                    gem, chain, wax_seal, rivet, coin_rain, coin_mound, smooth, closed_smooth, sample, segs_d)
from cuir import tool, stitch, scroll_vine, leather_panel, belt, keeper, escarcelle, tag

SEAL_RED = ("#F06A5A", "#B3182A", "#4A0408")
SEAL_GREEN = ("#7FD6A0", "#1E7A4A", "#06301A")
RIB_BLUE = ("#7AA8FF", "#2348A8", "#0A1A4A")
RIB_GOLD = ("#FFE7A0", "#D9A23A", "#6A4410")


def rrect_points(x0, y0, x1, y1, r, step=14):
    """Des points réguliers sur le pourtour d'un rectangle arrondi, en partant du milieu du haut (sens horaire)."""
    pts = []
    cx = (x0 + x1) / 2

    def line(ax, ay, bx, by):
        n = max(1, int(math.hypot(bx - ax, by - ay) / step))
        return [(ax + (bx - ax) * k / n, ay + (by - ay) * k / n) for k in range(n)]

    def corner(ccx, ccy, a0):
        return [pt(ccx, ccy, r, a0 + 90 * k / 4) for k in range(4)]

    pts += line(cx, y0, x1 - r, y0)
    pts += corner(x1 - r, y0 + r, 0)
    pts += line(x1, y0 + r, x1, y1 - r)
    pts += corner(x1 - r, y1 - r, 90)
    pts += line(x1 - r, y1, x0 + r, y1)
    pts += corner(x0 + r, y1 - r, 180)
    pts += line(x0, y1 - r, x0, y0 + r)
    pts += corner(x0 + r, y0 + r, 270)
    pts += line(x0 + r, y0, cx, y0)
    return pts


def arch_points(x0, x1, spring, y1, step=14):
    """Points le long d'un arc en plein cintre (côté gauche du bas vers le haut, puis côté droit vers le bas)."""
    rx = (x1 - x0) / 2
    cx = (x0 + x1) / 2
    pts = []
    n = int((y1 - spring) / step)
    pts += [(x0, y1 - (y1 - spring) * k / n) for k in range(n)]
    m = int(math.pi * rx / step)
    pts += [pt(cx, spring, rx, -90 + 180 * k / m) for k in range(m + 1)]
    pts += [(x1, spring + (y1 - spring) * k / n) for k in range(1, n + 1)]
    return pts


# =============================================================== BOURSE

def bourse_a():
    c = start("ba", "#3A2416", "#120A06", "#FFC27A", 0.24)
    win = rrect(78, 246, 462, 722, 26)
    pal = ("#C98A50", "#7A4220", "#241006")
    with masked(c, win, "w"):
        c.add(leather_panel(c, "bg", full_rect(), pal, seed=21, cx=0.5, cy=0.38, mottle=0.4))
        c.add(tool(scroll_vine(38, 280, 38, 690, 11, 6), pal, 2.2, 1.0))
        c.add(tool(scroll_vine(502, 280, 502, 690, 11, 6), pal, 2.2, 1.0))
        c.add(tool(scroll_vine(70, 44, 200, 44, 8, 3) + " " + scroll_vine(340, 44, 470, 44, 8, 3), pal, 1.8, 0.9))
        c.add(tool(scroll_vine(150, 214, 230, 214, 5, 2) + " " + scroll_vine(310, 214, 390, 214, 5, 2), pal, 1.5, 0.8))
        c.add(tool(rrect(60, 228, 480, 740, 36), pal, 2.4))
        c.add(tool(rrect(26, 26, 514, 934, 18), pal, 1.6))
        c.add(stitch(rrect(16, 16, 524, 944, 22), "#F2D394", 1.6))
        c.add(stitch(rrect(68, 236, 472, 732, 30), "#F2D394", 1.3, "4 3"))
        vg = rg(c, "vig", [(0.55, "#000000", 0), (1, "#000000", 0.7)], 0.5, 0.5, 0.78)
        c.add(f'<rect width="{W}" height="{H}" fill="{vg}"/>')
        c.add(halo(c, "top", 270, 150, 260, 170, "#FFC870", 0.35))
        for rx_, ry_ in ((52, 906), (488, 906)):
            petals = " ".join(f"M{f(rx_)} {f(ry_)} Q{f(pt(rx_, ry_, 14, a - 22)[0])} {f(pt(rx_, ry_, 14, a - 22)[1])} {f(pt(rx_, ry_, 22, a)[0])} {f(pt(rx_, ry_, 22, a)[1])} Q{f(pt(rx_, ry_, 14, a + 22)[0])} {f(pt(rx_, ry_, 14, a + 22)[1])} {f(rx_)} {f(ry_)} Z" for a in range(0, 360, 45))
            c.add(tool(petals, pal, 1.4, 0.9))
            c.add(tool(f"M{rx_ - 26} {ry_} A26 26 0 1 1 {rx_ + 26} {ry_} A26 26 0 1 1 {rx_ - 26} {ry_}", pal, 1.4, 0.8))
        c.add(godrays(c, "gods", 270, -60, [-14, -6, 2, 9, 16], 520, 7, "#FFD99A", 0.35, 8, 3))
    c.add(grade(c, win, "#FFB257", 0.5, 0.0, 0.22, 0.9, "gr"))
    c.add(window_depth(c, win, 0.7, 40, 14))
    loop = closed_smooth(rrect_points(70, 238, 470, 730, 34, 22), 0.5)
    c.add(cord(c, loop, 7.5, GOLD, "cd"))
    # le nœud et les glands
    c.add(cord(c, [((246, 226), (252, 210), (288, 214), (294, 236))], 8, GOLD, "cd", shadow=True))
    c.add(cord(c, [((294, 222), (288, 208), (252, 206), (246, 238))], 8, GOLD, "cd", shadow=True))
    c.add(cord(c, [((254, 238), (238, 252), (226, 268), (222, 292))], 6, GOLD, "cd"))
    c.add(cord(c, [((286, 238), (302, 252), (314, 268), (318, 292))], 6, GOLD, "cd"))
    c.add(tassel(c, 222, 290, 46, 20, GOLD, "t1", -3))
    c.add(tassel(c, 318, 290, 46, 20, GOLD, "t2", 3))
    c.add(cord(c, [((262, 214), (258, 196), (262, 186), (268, 176))], 5, GOLD, "cd", shadow=False))
    c.add(emblem(c, 270, 150, 56, "Bourse"))
    # bourses
    c.add(pouch(c, 470, 640, 0.62, LEATHER["vert"], rot=-10, key="pg", seed=12, cord_m=GOLD))
    c.add(pouch(c, 446, 664, 0.9, LEATHER["bordeaux"], rot=8, key="pb", seed=7, cord_m=GOLD))
    stream = [(150, 588), (172, 600), (190, 622), (198, 650), (204, 680), (206, 708)]
    rnd = random.Random(3)
    for i, (x, y) in enumerate(stream):
        c.add(coin_use(c, x + rnd.uniform(-5, 5), y, rnd.uniform(9, 12), rnd.uniform(0.4, 1.0), rnd.uniform(-50, 50)))
    c.add(halo(c, "pool", 200, 730, 170, 60, "#FFC870", 0.45))
    c.add(coin_mound(c, 9, 212, 742, 60, 30, 34, 8, 12, gems=2))
    for x, y, r, t, a in ((40, 930, 11, 0.4, 10), (64, 922, 9, 0.45, -20), (500, 928, 10, 0.4, 30), (60, 760, 9, 0.5, 0), (478, 752, 9, 0.5, 12)):
        c.add(coin_use(c, x, y, r, t, a))
    c.add(pouch(c, 96, 646, 0.95, LEATHER["tan"], rot=24, key="pt", open_=True, seed=5, cord_m=GOLD))
    for x, y, r in ((168, 576, 7), (214, 640, 6), (232, 724, 8), (120, 566, 5)):
        c.add(glint(x, y, r, "#FFF6D0", 0.9))
    c.add(dust(4, 70, (20, 20, 520, 940), ("#FFE7A0", "#FFFFFF"), 0.4, 1.6))
    birds(c, [("mee-lettre", 112, 186, 112, False, -6), ("meo-bravo", 428, 186, 112, True, 6)])
    c.add(tag(c, 92, 748, 356, 166, ("#9A5E34", "#4A2410", "#1A0804"), "tg", 6))
    c.add(inscription(c, "Bourse", "Ma toute première !", y=752, ink="#FFF1C8", accent="#F2C46A", title_size=40))
    save(c, "bourse", "Bourse", "a", "La première bourse",
         "Un champ de cuir repoussé, une cordelière d'or nouée sous la Meesh comme un sceau de fortune, et trois bourses à cordon "
         "— l'une renversée laisse s'échapper ses pièces en ruisseau. Les bourses de cuir des marchés et des foires, offertes à qui commence à garder.",
         "perches (sur la cordelière)", "Ma toute première !")


def adire(card, key="ad"):
    """Un fond de toile teinte à l'indigo, motifs réservés (cercles, points, croisillons, rayures), tissage."""
    out = []
    cell = 54
    rnd = random.Random(4)
    for j in range(-1, 19):
        for i in range(-1, 11):
            x, y = i * cell + (cell / 2 if j % 2 else 0), j * cell
            kind = (i + j * 3) % 4
            col = "#8FA6F0"
            if kind == 0:
                out.append("".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{rr}" fill="none" stroke="{col}" stroke-width="2.2"/>' for rr in (6, 13, 20)))
            elif kind == 1:
                out.append("".join(f'<circle cx="{f(x + dx)}" cy="{f(y + dy)}" r="3" fill="{col}"/>' for dx, dy in ((-10, -10), (10, -10), (-10, 10), (10, 10), (0, 0))))
                out.append(f'<path d="M{f(x - 18)} {f(y)} L{f(x + 18)} {f(y)} M{f(x)} {f(y - 18)} L{f(x)} {f(y + 18)}" stroke="{col}" stroke-width="1.4" opacity="0.7"/>')
            elif kind == 2:
                out.append("".join(f'<line x1="{f(x - 20)}" y1="{f(y + k)}" x2="{f(x + 20)}" y2="{f(y + k)}" stroke="{col}" stroke-width="2"/>' for k in (-14, -7, 0, 7, 14)))
            else:
                out.append(f'<path d="M{f(x)} {f(y - 20)} L{f(x + 20)} {f(y)} L{f(x)} {f(y + 20)} L{f(x - 20)} {f(y)} Z" fill="none" stroke="{col}" stroke-width="2"/>'
                           f'<circle cx="{f(x)}" cy="{f(y)}" r="4" fill="{col}"/>')
    disp = card.def_once(key + "-dp", f'<filter id="{card.id(key + "-dp")}" x="-5%" y="-5%" width="110%" height="110%">'
                         f'<feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="5" result="t"/>'
                         f'<feDisplacementMap in="SourceGraphic" in2="t" scale="5"/><feGaussianBlur stdDeviation="0.7"/></filter>')
    return f'<g filter="{disp}" opacity="0.32">{"".join(out)}</g>'


def bourse_b():
    c = start("bb", "#211C3E", "#0A0816", "#FFD08A", 0.22)
    c.motif("afrique")
    x0, x1, spring, y1 = 82, 458, 434, 722
    win = arch(x0, x1, spring, y1, 22)
    with masked(c, win, "w"):
        c.add(bg(c, lg(c, "ind", [(0, "#24357E"), (0.5, "#16205A"), (1, "#080C2C")])))
        c.add(adire(c))
        c.add(f'<rect width="{W}" height="{H}" fill="#000000" opacity="0.35" filter="{noise(c, "weave", "0.9 0.45", 2, 3, (0.5, 0.6, 1), 1.3, -0.6)}"/>')
        vg = rg(c, "vig", [(0.5, "#03051A", 0), (1, "#03051A", 0.8)], 0.5, 0.45, 0.8)
        c.add(f'<rect width="{W}" height="{H}" fill="{vg}"/>')
        c.add(halo(c, "top", 270, 150, 230, 170, "#FFC870", 0.32))
        c.add(halo(c, "low", 270, 940, 330, 120, "#FF9A50", 0.25))
    c.add(grade(c, win, "#FFB86A", 0.5, 0.1, 0.18, 0.9, "gr"))
    c.add(window_depth(c, win, 0.75, 40, 14, "#E8B53C", 1.6))
    # la double guirlande de cauris
    pts = arch_points(x0 - 12, x1 + 12, spring, y1 - 6, 6)
    segs = smooth(pts, 0.5)
    c.add(f'<path d="{segs_d(segs)}" fill="none" stroke="#3A2410" stroke-width="3" opacity="0.8"/>')
    beads = []
    for k, (x, y, a) in enumerate(sample(segs, 21)):
        beads.append(cowrie(c, x, y, 0.82, a + 90))
    for k, (x, y, a) in enumerate(sample(segs, 21)[:-1]):
        nx, ny, _ = sample(segs, 21)[k + 1]
        bx, by = (x + nx) / 2, (y + ny) / 2
        col = "#E2583E" if k % 2 else "#E8B53C"
        beads.append(f'<circle cx="{f(bx)}" cy="{f(by)}" r="3.4" fill="{col}" stroke="#3A1A08" stroke-width="0.6"/>'
                     f'<circle cx="{f(bx - 1)}" cy="{f(by - 1)}" r="1" fill="#FFFFFF" opacity="0.7"/>')
    c.add("".join(beads))
    pts2 = arch_points(x0 + 9, x1 - 9, spring, y1 - 4, 6)
    segs2 = smooth(pts2, 0.5)
    c.add("".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="2.2" fill="#F6E3C0" opacity="0.85"/>' for x, y, _ in sample(segs2, 9)))
    # l'emblème dans sa couronne de cauris
    ring = []
    for k in range(22):
        a = 360 * k / 22
        x, y = pt(270, 150, 80, a)
        ring.append(cowrie(c, x, y, 0.9, a))
    c.add("".join(ring))
    c.add(emblem(c, 270, 150, 56, "Bourse"))
    # les deux bourses suspendues
    c.add(cord(c, [((80, 334), (64, 348), (56, 366), (60, 398))], 5, ("#F6E3C0", "#B98C52", "#5A3A16"), "cdl"))
    c.add(cowrie_pouch(c, 60, 466, 0.88, rot=-5, key="cwp", seed=9))
    c.add(cord(c, [((460, 334), (476, 350), (482, 372), (478, 404))], 4.5, GOLD, "cdr"))
    c.add(embroidered_purse(c, 478, 500, 0.86, rot=6, key="emb", velvet=("#E05A7A", "#8E1236", "#2C0410")))
    rnd = random.Random(8)
    tg_ = lg(c, "trail", [(0, "#FFE7A0", 0), (1, "#FFE7A0", 0.5)])
    for x, y in ((56, 600), (46, 636), (62, 668), (484, 610), (494, 644), (478, 672)):
        r = rnd.uniform(7, 10)
        c.add(f'<rect x="{f(x - 1.6)}" y="{f(y - 30)}" width="3.2" height="26" rx="1.6" fill="{tg_}"/>')
        c.add(coin_use(c, x, y, r, rnd.uniform(0.4, 1), rnd.uniform(-60, 60)))
    c.add(dust(5, 60, (10, 10, 530, 950), ("#FFE7A0", "#C9D6FF"), 0.4, 1.5))
    mee_meo(c, "pied", "mee-coucou", "meo-salut")
    c.add(text_panel(c, 84, 752, 456, 884, 22, "#0A0E2E", 0.86, "#E8B53C", 1.6, "tp"))
    for k in range(13):
        c.add(cowrie(c, 130 + k * 23.3, 752, 0.62, 90))
    rnd2 = random.Random(21)
    for k in range(11):
        fx = 126 + k * 28.8
        L = 24 + (k % 2) * 12 + rnd2.uniform(-3, 3)
        c.add(f'<path d="M{f(fx)} 884 Q{f(fx + 2)} {f(884 + L * 0.5)} {f(fx)} {f(884 + L)}" stroke="#C9A060" stroke-width="1.4" fill="none"/>')
        c.add(f'<circle cx="{f(fx + 0.6)}" cy="{f(884 + L * 0.45)}" r="3.2" fill="{"#E2583E" if k % 2 else "#E8B53C"}" stroke="#3A1A08" stroke-width="0.6"/>')
        c.add(cowrie(c, fx, 884 + L + 9, 0.6, 0, back=k % 3 == 1))
    c.add(inscription(c, "Bourse", None, y=758, ink="#FFF1C8", accent="#F2C46A"))
    save(c, "bourse", "Bourse", "b", "Cauris et broderies",
         "Sur une toile teinte à l'indigo aux motifs réservés, à la manière de l'adire yoruba, une arche ourlée de cauris enfilés et de perles de corail ; "
         "une bourse de cuir cousue de cauris — monnaie et parure de l'Afrique de l'Ouest — répond à une aumônière de velours brodée d'or, "
         "et une frange de cauris pend sous l'inscription.",
         "pied", None)


# =============================================================== ESCARCELLE

def escarcelle_a():
    c = start("ea", "#2E1C12", "#100804", "#FFC27A", 0.22)
    win = rrect(80, 262, 460, 724, 18)
    pal = ("#A8483E", "#5A1418", "#1A0406")
    with masked(c, win, "w"):
        c.add(leather_panel(c, "bg", full_rect(), pal, seed=31, cx=0.5, cy=0.4, mottle=0.4))
        lat = []
        for k in range(-20, 30):
            lat.append(f"M{k * 36} 0 l960 960 M{k * 36} 0 l-960 960")
        c.add(f'<g opacity="0.55">{tool(" ".join(lat), pal, 1.0, 0.6)}</g>')
        for j in range(0, 28):
            for i in range(0, 16):
                x, y = i * 36 + (18 if j % 2 else 0), j * 36 + 18
                c.add(f'<circle cx="{x}" cy="{y}" r="1.6" fill="{pal[0]}" opacity="0.35"/>')
        c.add(f'<path d="{rrect(64, 246, 476, 740, 30)}" fill="none" stroke="#1A0604" stroke-width="20" opacity="0.6"/>')
        c.add(tool(rrect(62, 244, 478, 742, 30), pal, 2.4))
        c.add(stitch(rrect(70, 252, 470, 734, 24), "#F2D394", 1.3, "4 3"))
        c.add(stitch(rrect(16, 16, 524, 944, 22), "#F2D394", 1.6))
        band = "M28 40 L512 40 L512 128 L28 128 Z"
        c.add(f'<path d="{band}" fill="#1A0406" opacity="0.35"/>')
        c.add(tool(band, pal, 2.0))
        c.add(stitch("M36 50 L504 50", "#F2D394", 1.3, "4 3"))
        c.add(stitch("M36 118 L504 118", "#F2D394", 1.3, "4 3"))
        gild = ("#FFF4C2", "#D9A23A", "#5A3606")
        c.add(tool(scroll_vine(50, 84, 222, 84, 13, 4) + " " + scroll_vine(318, 84, 490, 84, 13, 4), gild, 2.0, 0.95))
        fl = " ".join(f"M270 84 Q{f(pt(270, 84, 12, a - 26)[0])} {f(pt(270, 84, 12, a - 26)[1])} {f(pt(270, 84, 22, a)[0])} {f(pt(270, 84, 22, a)[1])} Q{f(pt(270, 84, 12, a + 26)[0])} {f(pt(270, 84, 12, a + 26)[1])} 270 84 Z" for a in range(0, 360, 45))
        c.add(tool(fl, gild, 1.4, 0.95))
        c.add(f'<circle cx="270" cy="84" r="4" fill="#E8B53C"/>')
        vg = rg(c, "vig", [(0.5, "#000000", 0), (1, "#000000", 0.75)], 0.5, 0.5, 0.8)
        c.add(f'<rect width="{W}" height="{H}" fill="{vg}"/>')
        c.add(halo(c, "top", 270, 190, 260, 150, "#FFC870", 0.3))
    c.add(grade(c, win, "#FFB257", 0.5, 0.0, 0.2, 0.9, "gr"))
    c.add(window_depth(c, win, 0.7, 40, 14))
    c.add(belt(c, -10, 550, 200, 46, LEATHER["brun"], "blt", BRASS, seed=9))
    for kx in (82, 458):
        c.add(keeper(c, kx, 200, 54, 18, BRASS, "kp"))
    for kx in (24, 140, 400, 516):
        cg_ = rg(c, "concho", [(0, "#FFFFFF"), (0.3, "#FBE7B0"), (0.7, "#C9A24A"), (1, "#5E4614")], 0.38, 0.32, 0.7)
        c.add(f'<circle cx="{kx + 1}" cy="203" r="12" fill="#000000" opacity="0.5"/><circle cx="{kx}" cy="200" r="11" fill="{cg_}"/>'
              f'<circle cx="{kx}" cy="200" r="6" fill="none" stroke="#5E4614" stroke-width="1"/>')
    # chaînes en feston le long de la fenêtre, et leurs sceaux
    cm = metal_lin(c, "cnr", BRASS, 0, 0, 1, 1)
    cbv = bevel(c, "cnrbv", 0.9, 2.6, 1.0, 20, shadow=(0.6, 2, 2, 0.6))
    for sx_, sy_, cx_, cy_ in ((1, 1, 62, 244), (-1, 1, 478, 244), (1, -1, 62, 742), (-1, -1, 478, 742)):
        c.add(f'<path d="M{cx_} {cy_} L{cx_ + sx_ * 46} {cy_} Q{cx_ + sx_ * 30} {cy_ + sy_ * 8} {cx_ + sx_ * 20} {cy_ + sy_ * 20} Q{cx_ + sx_ * 8} {cy_ + sy_ * 30} {cx_} {cy_ + sy_ * 46} Z" fill="{cm}" filter="{cbv}"/>')
        c.add(rivet(c, cx_ + sx_ * 10, cy_ + sy_ * 10, 3, BRASS, "rvc"))
    c.add(chain(c, smooth([(104, 400), (66, 470), (58, 540), (70, 610), (88, 650)]), 9, GOLD, "chl"))
    c.add(chain(c, smooth([(436, 400), (474, 470), (482, 540), (470, 610), (452, 650)]), 9, GOLD, "chr"))
    c.add(wax_seal(c, 90, 664, 24, SEAL_RED, "wsl", RIB_BLUE, -8, 3))
    c.add(wax_seal(c, 450, 664, 24, SEAL_GREEN, "wsr", RIB_GOLD, 8, 5))
    c.add(escarcelle(c, 84, 308, 0.78, LEATHER["brun"], LEATHER["tan"], "e1", BRASS, -3, None, False, 11))
    c.add(escarcelle(c, 456, 308, 0.78, LEATHER["noir"], LEATHER["bordeaux"], "e2", BRASS, 3, None, False, 4, flip=True))
    # la grande boucle qui sertit l'emblème
    bm = metal_lin(c, "bk", BRASS, 0, 0, 1, 1, 2)
    bv = bevel(c, "bkbv", 1.2, 3.4, 1.1, 24, shadow=(0, 4, 4, 0.65))
    c.add(f'<g filter="{bv}"><ellipse cx="270" cy="196" rx="84" ry="76" fill="none" stroke="{bm}" stroke-width="16"/>'
          f'<rect x="178" y="190" width="14" height="14" rx="3" fill="{bm}"/><rect x="348" y="190" width="14" height="14" rx="3" fill="{bm}"/></g>')
    c.add(f'<ellipse cx="270" cy="196" rx="84" ry="76" fill="none" stroke="#5E4614" stroke-width="1" opacity="0.8"/>')
    for a in range(0, 360, 30):
        x, y = pt(270, 196, 84, a)
        c.add(f'<circle cx="{f(270 + (x - 270))}" cy="{f(y)}" r="2.4" fill="#FFF6D0" opacity="0.85"/>')
    c.add(emblem(c, 270, 194, 58, "Escarcelle", halo_op=0.3))
    c.add(dust(6, 50, (10, 10, 530, 950), ("#FFE7A0",), 0.4, 1.5))
    mee_meo(c, "ruban", "mee-fete", "meo-champagne")
    c.add(tag(c, 120, 752, 300, 136, ("#7A3A24", "#3A140A", "#140402"), "tg", 6))
    c.add(inscription(c, "Escarcelle", None, y=756, ink="#FFF1C8", accent="#F2C46A", title_size=36))
    save(c, "escarcelle", "Escarcelle", "a", "La ceinture du voyageur",
         "Sous une frise de cuir aux rinceaux dorés au fer, une ceinture de cuir repoussé barre le cadre ; sa grande boucle de laiton sertit la Meesh, "
         "et deux escarcelles à fermoir y pendent, comme celles des marchands et des pèlerins. Des chaînes d'or descendent en feston jusqu'à deux sceaux de cire.",
         "ruban", None)


def escarcelle_b():
    c = start("eb", "#33200F", "#120904", "#FFC890", 0.24)
    win = rrect(80, 262, 460, 690, 18)
    pal = LEATHER["brun"]
    flap_pal = ("#B8524A", "#6A1C20", "#22060A")
    with masked(c, win, "w"):
        c.add(bg(c, lg(c, "top", [(0, "#1E120A"), (1, "#0C0604")])))
        body = "M8 232 L532 232 L532 960 L8 960 Z"
        c.add(leather_panel(c, "bd", body, pal, seed=41, cx=0.5, cy=0.4, mottle=0.4))
        gus = lg(c, "gus", [(0, "#000000", 0.6), (0.07, "#000000", 0.2), (0.1, "#000000", 0), (0.9, "#000000", 0), (0.93, "#000000", 0.2), (1, "#000000", 0.6)], 0, 0, 1, 0)
        c.add(f'<path d="{body}" fill="{gus}"/>')
        c.add(stitch("M44 246 L44 940", "#E9C98A", 1.3, "4 3"))
        c.add(stitch("M496 246 L496 940", "#E9C98A", 1.3, "4 3"))
        c.add(tool(scroll_vine(24, 300, 24, 680, 9, 6), pal, 1.6, 0.85))
        c.add(tool(scroll_vine(516, 300, 516, 680, 9, 6), pal, 1.6, 0.85))
        c.add(f'<path d="{rrect(66, 248, 474, 704, 28)}" fill="none" stroke="#120804" stroke-width="18" opacity="0.55"/>')
        c.add(tool(rrect(64, 246, 476, 706, 28), pal, 2.4))
        c.add(stitch(rrect(72, 254, 468, 698, 22), "#F2D394", 1.3, "4 3"))
        c.add(halo(c, "hz", 270, 120, 300, 160, "#FFB45A", 0.28))
    c.add(grade(c, win, "#FFB257", 0.5, 0.0, 0.2, 0.9, "gr"))
    c.add(window_depth(c, win, 0.7, 40, 14))
    c.add(belt(c, -10, 550, 44, 40, LEATHER["noir"], "blt", BRASS, seed=12))
    gm = metal_lin(c, "br", BRASS, 0, 0, 1, 1, 2)
    bv = bevel(c, "brbv", 1.0, 3.2, 1.1, 22, shadow=(0, 4, 4, 0.65))
    c.add(f'<g filter="{bv}"><circle cx="270" cy="84" r="16" fill="none" stroke="{gm}" stroke-width="7"/></g>')
    # le fermoir : une barre de laiton gravée sur toute la largeur
    bar = "M14 222 Q270 196 526 222 L526 246 Q270 220 14 246 Z"
    c.add(f'<path d="{bar}" fill="#000000" opacity="0.6" transform="translate(0 8)" filter="{soft(c, 6)}"/>')
    c.add(f'<g filter="{bv}"><path d="{bar}" fill="{gm}"/><circle cx="14" cy="234" r="16" fill="{gm}"/><circle cx="526" cy="234" r="16" fill="{gm}"/>'
          f'<circle cx="270" cy="212" r="22" fill="{gm}"/></g>')
    c.add(f'<path d="M24 228 Q270 203 516 228" fill="none" stroke="#5E4614" stroke-width="1.2" opacity="0.8"/>'
          f'<path d="M24 240 Q270 215 516 240" fill="none" stroke="#5E4614" stroke-width="1.2" opacity="0.8"/>')
    c.add(tool(scroll_vine(40, 234, 230, 220, 4, 6) + " " + scroll_vine(310, 220, 500, 234, 4, 6), BRASS, 1.0, 0.7))
    c.add(f'<path d="M30 226 Q150 210 240 206" stroke="#FFFFFF" stroke-width="1.6" fill="none" opacity="0.5" stroke-linecap="round"/>')
    c.add(chain(c, smooth([(16, 250), (30, 420), (22, 560), (36, 700)]), 9, GOLD, "chl"))
    c.add(chain(c, smooth([(524, 250), (510, 420), (518, 560), (504, 700)]), 9, GOLD, "chr"))
    c.add(chain(c, smooth([(270, 92), (270, 104)]), 8, BRASS, "chm"))
    c.add(emblem(c, 270, 154, 54, "Escarcelle", halo_op=0.45))
    # le rabat : la plaque
    flap = "M-6 684 L546 684 L546 792 Q430 900 270 944 Q110 900 -6 792 Z"
    flap_in = "M18 704 L522 704 L522 784 Q414 880 270 920 Q126 880 18 784 Z"
    rnd = random.Random(14)
    peek = []
    for k in range(13):
        peek.append((70 + k * 33 + rnd.uniform(-8, 8), 684 + rnd.uniform(-10, 0), rnd.uniform(15, 19), rnd.uniform(-35, 35)))
    for x, y, r, a in sorted(peek, key=lambda t: t[1]):
        c.add(coin_use(c, x, y, r, 1.0, a))
    for x, kind in ((150, "rubis"), (300, "emeraude"), (410, "saphir")):
        c.add(gem(x, 680, 8, kind, 10, 8, 1.0))
    c.add(f'<path d="{flap}" fill="#000000" opacity="0.65" transform="translate(0 10)" filter="{soft(c, 9)}"/>')
    c.add(leather_fill(c, "fl", flap, flap_pal, 0.5, 0.2, True, 0.35, 44))
    fsh = lg(c, "fsh", [(0, "#FFFFFF", 0.16), (0.2, "#FFFFFF", 0), (1, "#000000", 0.45)])
    c.add(f'<path d="{flap}" fill="{fsh}"/>')
    c.add(tool(flap_in, flap_pal, 2.2))
    c.add(stitch("M8 694 L532 694 L532 788 Q422 890 270 932 Q118 890 8 788 Z", "#F2D394", 1.4))
    for x, y in ((34, 716), (506, 716), (150, 868), (390, 868)):
        c.add(rivet(c, x, y, 4, BRASS, "rv"))
    fm = (f'<path d="M248 896 L292 896 L298 926 L270 950 L242 926 Z" fill="{gm}"/>'
          f'{signature_bars(270, 921, 0.36, "#5E4614", w=7)}')
    c.add(f'<g filter="{bv}">{fm}</g>')
    c.add(wax_seal(c, 62, 790, 22, SEAL_RED, "wsl", RIB_GOLD, -10, 4))
    c.add(wax_seal(c, 478, 790, 22, SEAL_RED, "wsr", RIB_GOLD, 10, 7))
    birds(c, [("mee-sourire", 128, 168, 112, False, -4), ("meo-serenade", 412, 166, 112, True, 4)])
    c.add(inscription(c, "Escarcelle", "Le voyage continue", y=704, ink="#FFE7A8", accent="#F2C46A", title_size=38, msg_color="#FFF4D6"))
    save(c, "escarcelle", "Escarcelle", "b", "Le rabat scellé",
         "Le cadre entier devient une escarcelle : le fermoir de laiton gravé tient lieu de linteau, la photo se loge dans le cuir "
         "piqué, et l'inscription est dorée au fer sur le rabat, fermé d'un fermail à la Signature et de deux sceaux de cire.",
         "libre (perchés sur le fermoir)", "Le voyage continue")
