"""Les six paliers de niveau, de la Lueur (niv. 10) à la Singularité (niv. 1000)."""

import math
import random

from base import Card, W, H, f, pt, esc, photo, bird, mee_meo, sparkle, SANS, CINZEL, CINZEL_DECO, HAND
from kit import (group, rrect, arch, oval, circle_d, ring_d, ogive, octo, deco_mask, clip, bevel, noise, wobble, metal_grad,
                 rim, inner_shadow, grade, halo, lgrad, dust, bright_stars, outer_frame, inscription, glints, smooth_closed,
                 smooth_open)
from infinis import scale_ladder, scale_ladder2, power_label, atom_glyph, GRAND, PETIT, GRAND_EXP, PETIT_EXP
from emblem import ruban_birds
from matiere import nucleus, element_tile, comets, cosmic_web, lattice
from cosmos import (level_ring, lucioles, spiral_path, grass, ridge, aurora, galaxy_rich, gas, pillar, shards, baobab, acacia, milky_way, spruce, forest, edge_on, globular, galaxy_spiral, spiked_star,
                    SILVER, ICE, GOLD, ROSE, PLATINUM, OBSIDIAN)

PHOTO_FREE = (84, 256, 456, 724)


def kicker(n):
    return f"Nouveau palier · Niveau {n}"


# ---------------------------------------------------------------- Lueur (niv. 10)

def lueur():
    c = Card("pl1")
    c.motif("afrique")
    photo(c, top="#2E2642", bottom="#120E1C", rim="#FFD9A0", glow=0.2)
    win = arch(82, 458, 418, 268, 728)
    ink = "#0B0716"
    with group(c, f'mask="{deco_mask(c, win)}"'):
        sky = lgrad(c, "sky", [(0, "#060A22", 1), (0.3, "#15184A", 1), (0.55, "#33295E", 1), (0.74, "#6C4470", 1), (0.83, "#A9657A", 1), (0.9, "#2A1A34", 1), (1, "#0E0A18", 1)])
        c.add(f'<rect width="{W}" height="{H}" fill="{sky}"/>')
        c.add(dust(11, 300, (0, 0, W, 700), ["#FFFFFF", "#DCE4FF", "#FFE9C8"], 0.3, 1.2, 0.25, 0.9))
        c.add(milky_way(c, "mw", 600, 720, -60, 110, 150, 17, 1100))
        c.add(bright_stars(12, 7, (20, 30, 520, 560), "#FFF6E0", 3, 6, avoid=PHOTO_FREE))
        mx, my = 470, 92
        c.add(halo(c, mx, my, 80, "#FFE7B8", 0.38, "moonh"))
        c.add(f'<path d="M{mx - 2} {my - 19} A19 19 0 1 0 {mx + 14} {my + 12} A15 15 0 1 1 {mx - 2} {my - 19} Z" fill="#FFF3D6"/>')
        c.add(halo(c, 270, 800, 320, "#FFB27A", 0.6, "hz", ry=96))
        c.add(halo(c, 40, 760, 160, "#FF9A6A", 0.35, "hzl", ry=70))
        hills_far = "M-10 960 L-10 792 Q60 776 140 782 Q230 790 300 778 Q390 766 460 780 Q510 788 560 782 L560 960 Z"
        hills_near = "M-10 960 L-10 814 Q80 800 170 808 Q270 820 360 804 Q450 792 560 808 L560 960 Z"
        c.add(f'<path d="{hills_far}" fill="#2A1A3C"/>')
        for i, (bx, bh, bw) in enumerate(((150, 30, 9), (232, 22, 7), (318, 26, 8), (404, 34, 10), (488, 20, 6))):
            c.add(baobab(90 + i, bx, 786, bw, bh, "#2A1A3C", 1.1))
        c.add(acacia(95, 196, 788, 22, 44, "#2A1A3C"), acacia(96, 446, 784, 18, 36, "#2A1A3C"))
        c.add(f'<path d="{hills_near}" fill="{ink}"/>')
        c.add(grass(13, -10, 560, 814, 10, 34, ink, 260, 7))
        tree = baobab(97, 6, 840, 150, 410, ink, 1.0, 10, reach=96, n=8, spread=170)
        c.add(f'<g filter="{c.blur("bbrim", 7)}" opacity="0.5" transform="translate(3 0)">{tree.replace(ink, "#FF9A6A")}</g>', tree)
        c.add(f'<path d="M100 840 C98 720 92 560 62 440" fill="none" stroke="#FFB27A" stroke-width="1.8" opacity="0.55" filter="{c.blur("bbr", 1.2)}"/>')
        g1, k1 = lucioles(14, [
            spiral_path(486, 810, 498, 300, 2.3, 22, 42, 2.0),
            spiral_path(500, 316, 336, 100, 0.9, 16, 22, 3.0),
            spiral_path(150, 300, 214, 120, 1.2, 18, 20, 1.2),
            spiral_path(70, 620, 120, 330, 1.6, 26, 26, 0.4),
        ])
        c.add(f'<g filter="{c.blur("ffg", 2.4)}">{"".join(g1)}</g>', "".join(k1))
        rnd = random.Random(15)
        loose = [(rnd.uniform(20, 520), rnd.uniform(740, 900)) for _ in range(26)]
        loose += [(rnd.uniform(90, 230), rnd.uniform(170, 330)) for _ in range(9)]
        g2, k2 = lucioles(16, [[p] for p in loose])
        c.add(f'<g filter="{c.blur("ffg", 2.4)}">{"".join(g2)}</g>', "".join(k2))
    c.add(inner_shadow(c, win, 40, 14, 0.55))
    c.add(grade(c, win, "#FFC27A", 0.5, 1.05, 0.3, 0.8, "warm"))
    c.add(rim(c, win, SILVER, 4))
    c.add(halo(c, 270, 150, 120, "#FFE3A6", 0.32, "lu-h"))
    inner = halo(c, 270, 170, 46, "#FFD58A", 0.65, "lu-in") + f'<circle cx="270" cy="182" r="3" fill="#FFF7D6"/>'
    level_ring(c, 270, 150, 60, 10, "LUEUR", SILVER, "lr", inner=inner, band=16, disc=("#2A2450", "#100C24", "#05040C"))
    c.add(sparkle(270, 64, 13, "#FFF6DA", 1), f'<circle cx="270" cy="64" r="4" fill="#FFFFFF"/>')
    c.add(outer_frame(c, SILVER, inner_op=0.45))
    mee_meo(c, "pied", "mee-montee-au-ciel", "meo-salut")
    inscription(c, kicker(10), "Palier Lueur", metal=SILVER, panel=("#211A3E", "#0A0816"), accent="#E6D6FF",
                message="Le voyage commence", msg_color="#FFE7B0")
    return c


# ---------------------------------------------------------------- Aurore (niv. 50)

def aurore():
    c = Card("pl2")
    photo(c, top="#1C2C3A", bottom="#081018", rim="#A6FFE4", glow=0.18)
    win = rrect(82, 266, 458, 726, 30)
    with group(c, f'mask="{deco_mask(c, win)}"'):
        sky = lgrad(c, "sky", [(0, "#01040E", 1), (0.45, "#03142A", 1), (0.75, "#06243A", 1), (1, "#020A14", 1)])
        c.add(f'<rect width="{W}" height="{H}" fill="{sky}"/>')
        c.add(dust(21, 320, (0, 0, W, 760), ["#FFFFFF", "#D8F6FF"], 0.3, 1.3, 0.25, 0.95))

        def base_a(x):
            edge = 330 * math.exp(-((x - 18) / 70) ** 2) + 330 * math.exp(-((x - 522) / 70) ** 2)
            return 256 + 10 * math.sin(x / 62) + edge

        def h_a(x):
            return 150 + 50 * math.sin(x / 41 + 1.3) + 60 * math.exp(-((x - 270) / 120) ** 2)

        def base_b(x):
            return 150 + 26 * math.sin(x / 55 + 2) + 180 * math.exp(-((x - 30) / 50) ** 2) + 160 * math.exp(-((x - 515) / 50) ** 2)

        c.add(milky_way(c, "mw", 600, 380, -60, -40, 130, 28, 700, ("#D8F6FF", "#E6DCFF", "#BFFFE8")))
        c.add(aurora(c, "auB", 22, -10, 550, base_b, lambda x: 110 + 40 * math.sin(x / 33), ("#FF6FD8", "#B26BFF", "#5B4BFF"), 3.4, 0.7))

        def base_c(x):
            return 196 + 18 * math.sin(x / 47 + 0.6) + 120 * math.exp(-((x - 60) / 60) ** 2) + 110 * math.exp(-((x - 480) / 60) ** 2)

        c.add(aurora(c, "auC", 29, -10, 550, base_c, lambda x: 96 + 30 * math.sin(x / 27 + 1), ("#7CFFC8", "#3AD8E0", "#9A6BFF"), 2.6, 0.62))
        c.add(aurora(c, "auA", 23, -10, 550, base_a, h_a, ("#5CFFB8", "#2EE6C8", "#B26BFF"), 3.0, 0.95))
        c.add(halo(c, 270, 900, 320, "#2EE6C8", 0.18, "lakeglow", ry=80))
        far = ridge(24, -10, 560, 0, [(-10, 812), (40, 760), (96, 790), (150, 736), (210, 784), (270, 748), (330, 790), (392, 730), (452, 780), (505, 742), (560, 790)], 10)
        near = ridge(25, -10, 560, 0, [(-10, 846), (70, 800), (140, 838), (230, 812), (300, 846), (380, 806), (470, 836), (560, 808)], 8)
        far_d = "M-10 960 L" + " L".join(f"{f(x)} {f(y)}" for x, y in far) + " L560 960 Z"
        near_d = "M-10 960 L" + " L".join(f"{f(x)} {f(y)}" for x, y in near) + " L560 960 Z"
        c.add(f'<path d="{far_d}" fill="{lgrad(c, "farg", [(0, "#1E4A5C", 1), (0.3, "#0C2434", 1), (1, "#050E18", 1)])}"/>')
        snow = " L".join(f"{f(x)} {f(y)}" for x, y in far)
        c.add(f'<path d="M{snow}" fill="none" stroke="#C8FFF0" stroke-width="2" opacity="0.55" stroke-linejoin="round"/>')
        c.add(f'<path d="{near_d}" fill="{lgrad(c, "nearg", [(0, "#0A1E2C", 1), (1, "#02060C", 1)])}"/>')
        c.add(f'<path d="M{" L".join(f"{f(x)} {f(y)}" for x, y in near)}" fill="none" stroke="#7FE8D0" stroke-width="1.2" opacity="0.4"/>')
        def near_y(x):
            for (ax, ay), (bx, by) in zip(near, near[1:]):
                if ax <= x <= bx:
                    return ay + (by - ay) * (x - ax) / max(1e-6, bx - ax) + 4
            return near[-1][1]

        c.add(f'<g filter="{c.blur("frg", 5)}" opacity="0.5">{forest(31, -10, 150, near_y, 40, 120, "#2EE6C8")}{forest(32, 400, 560, near_y, 40, 120, "#2EE6C8")}</g>')
        c.add(forest(31, -10, 150, near_y, 40, 120, "#02080E"), forest(32, 400, 560, near_y, 40, 120, "#02080E"))
        c.add(forest(33, 140, 410, near_y, 18, 46, "#030A12", (7, 12)))
        tall = spruce(34, 22, 870, 330, 92, "#010509") + spruce(35, 518, 880, 300, 84, "#010509")
        c.add(f'<g filter="{c.blur("tallg", 6)}" opacity="0.45">{tall.replace("#010509", "#3CFFC0")}</g>', tall)
        rnd = random.Random(26)
        c.add("".join(f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(x + rnd.uniform(14, 50))}" y2="{f(y)}" stroke="#7FFFD0" stroke-width="1" opacity="{f(rnd.uniform(0.08, 0.3))}"/>'
                      for x, y in ((rnd.uniform(0, 520), rnd.uniform(890, 950)) for _ in range(30))))
    c.add(inner_shadow(c, win, 40, 14, 0.5))
    c.add(grade(c, win, "#3CFFC0", 0.5, -0.05, 0.22, 0.9, "au-g"))
    c.add(rim(c, win, ICE, 4.5))
    inner = aurora(c, "auI", 27, 210, 330, lambda x: 196 + 6 * math.sin(x / 9), lambda x: 70, ("#5CFFB8", "#2EE6C8", "#B26BFF"), 3.0, 0.8)
    level_ring(c, 270, 152, 64, 50, "AURORE", ICE, "lr", inner=inner, glow="#46FFB4", glow_op=0.35, disc=("#0B2A3A", "#061624", "#02070C"))
    c.add(outer_frame(c, ICE, inner_op=0.45))
    mee_meo(c, "perches", "mee-coucou", "meo-cool")
    inscription(c, kicker(50), "Palier Aurore", metal=ICE, panel=("#06263A", "#020A12"), accent="#8FF5D8")
    return c


# ---------------------------------------------------------------- Galaxie (niv. 90)

def galaxie():
    c = Card("pl3")
    photo(c, top="#251E3E", bottom="#0C0A18", rim="#CDBBFF", glow=0.2)
    win = oval(270, 494, 192, 232)
    with group(c, f'mask="{deco_mask(c, win)}"'):
        c.add(f'<rect width="{W}" height="{H}" fill="{c.rgrad("bg", [(0, "#1A1240", 1), (0.6, "#08061A", 1), (1, "#020108", 1)], 0.5, 0.2, 0.9)}"/>')
        c.add(gas(c, "g1", 80, 760, 220, 160, "#C2318F", 0.55, "0.009", 31))
        c.add(gas(c, "g2", 470, 560, 180, 260, "#2A6CFF", 0.45, "0.01", 32))
        c.add(gas(c, "g3", 300, 920, 300, 90, "#7A3FE4", 0.5, "0.012", 33))
        c.add(dust(34, 420, (0, 0, W, H), ["#FFFFFF", "#CFE0FF", "#FFE8C8"], 0.3, 1.3, 0.25, 0.95))
        c.add(halo(c, 270, 158, 200, "#FFD9A0", 0.42, "bulge", ry=110))
        c.add(galaxy_spiral(c, "gal", 270, 156, 300, 0.56, -12, 2, 1.15, 35, 0.2, n_stars=1800))
        c.add(edge_on(c, "eo", 494, 400, 48, -62))
        c.add(globular(41, 486, 612, 14), halo(c, 486, 612, 18, "#FFE9C8", 0.4, "glh"))
        c.add(globular(42, 40, 452, 10), halo(c, 40, 452, 14, "#FFE9C8", 0.35, "glh2"))
        c.add(galaxy_rich(c, "gal2", 76, 648, 56, 0.5, 38, 2, 36, 260, arm_color="#FFC2E8", knot="#9FD4FF"))
        c.add(galaxy_rich(c, "gal3", 470, 836, 34, 0.42, -50, 2, 37, 160, arm_color="#BFE2FF"))
        c.add(bright_stars(38, 9, (16, 20, 524, 940), "#FFFFFF", 3, 8, avoid=(70, 250, 470, 740)))
    c.add(inner_shadow(c, win, 44, 16, 0.55))
    c.add(grade(c, win, "#B9A0FF", 0.5, -0.1, 0.25, 0.9, "ga-g"))
    rnd = random.Random(39)
    beads = []
    for i in range(54):
        a = math.radians(i * 360 / 54)
        x, y = 270 + 206 * math.cos(a), 494 + 246 * math.sin(a)
        rr = 1.6 if i % 3 else 2.8
        beads.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rr)}" fill="#FFF0C8" opacity="{0.95 if i % 3 == 0 else 0.6}"/>')
    c.add(f'<g filter="{c.blur("bd", 1.2)}">{"".join(beads)}</g>', "".join(beads))
    c.add(rim(c, win, GOLD, 5))
    inner = galaxy_rich(c, "galI", 270, 156, 46, 0.5, -20, 2, 40, 220, arm_color="#FFE2A8", knot="#FF9FD0")
    level_ring(c, 270, 150, 66, 90, "GALAXIE", GOLD, "lr", inner=inner, glow="#FFE0A0", glow_op=0.35)
    c.add(outer_frame(c, GOLD, inner_op=0.5))
    bird(c, "mee-wow", 92, 312, 128, rotate=-8)
    bird(c, "meo-bravo", 456, 676, 128, flip=True, rotate=6)
    inscription(c, kicker(90), "Palier Galaxie", metal=GOLD, panel=("#1C1440", "#06040F"), accent="#F5D58A",
                message="On ira jusqu'aux étoiles", msg_color="#FFF2D0")
    return c


# ---------------------------------------------------------------- Nébuleuse (niv. 101)

def nebuleuse():
    c = Card("pl4")
    photo(c, top="#2E1C30", bottom="#100A14", rim="#FFB7D5", glow=0.2)
    win = ogive(84, 456, 414, 254, 728)
    with group(c, f'mask="{deco_mask(c, win)}"'):
        c.add(f'<rect width="{W}" height="{H}" fill="#07040E"/>')
        c.add(gas(c, "n1", 270, 160, 360, 230, "#E0368C", 0.9, "0.0105", 41))
        c.add(gas(c, "n2", 60, 470, 200, 330, "#20C4C0", 0.8, "0.012", 42))
        c.add(gas(c, "n3", 490, 300, 200, 240, "#FFB347", 0.75, "0.011", 43))
        c.add(gas(c, "n4", 470, 640, 190, 260, "#7B3FE4", 0.85, "0.012", 44))
        c.add(gas(c, "n5", 270, 880, 360, 150, "#C2318F", 0.7, "0.01", 45))
        c.add(gas(c, "n6", 270, 120, 200, 120, "#FFE6F2", 0.55, "0.016", 46, a=3, b=-1.4))
        c.add(dust(47, 380, (0, 0, W, H), ["#FFFFFF", "#FFE0F0", "#D0F4FF"], 0.3, 1.2, 0.3, 1))
        c.add(gas(c, "n7", 70, 420, 120, 200, "#FFD27A", 0.55, "0.016", 56))
        c.add(gas(c, "n8", 480, 470, 110, 220, "#7FF0E0", 0.5, "0.016", 57))
        specs = ((30, 150, 70, 322, "#FFC27A", 1), (-14, 90, 22, 470, "#FFB0D0", 1), (516, 132, 482, 380, "#FFB0D8", -1), (560, 90, 528, 520, "#9FF4E8", -1))
        for i, (xb, wb, tx, ty, rimc, side) in enumerate(specs):
            d = pillar(48 + i, xb, wb, tx, ty)
            back = i in (1, 3)
            dx = 5 * side
            rg = lgrad(c, f"rg{i}", [(0, "#FFFFFF", 1), (0.06, rimc, 1), (0.45, rimc, 0.55), (1, rimc, 0.08)])
            wg = lgrad(c, f"wg{i}", [(0, "#FFF8EC", 1), (0.35, "#FFF4E0", 0.5), (1, "#FFF4E0", 0)])
            c.add(f'<path d="{d}" fill="{rg}" transform="translate({dx} -9)" filter="{c.blur(f"pr{i}", 5)}"/>')
            c.add(f'<g filter="{noise(c, f"prn{i}", "0.045", 3, 80 + i, 3.0, -0.9)}"><path d="{d}" fill="{wg}" transform="translate({dx * 0.7} -5)"/></g>')
            pg = lgrad(c, f"pg{i}", [(0, "#4A2420" if not back else "#3A1A2A", 1), (0.12, "#2A1014", 1), (0.5, "#140608", 1), (1, "#06020A", 1)])
            lit = lgrad(c, f"pl{i}", [(0, rimc, 0.0), (0.7, rimc, 0.08), (1, rimc, 0.5)], 0 if side > 0 else 1, 0, 1 if side > 0 else 0, 0)
            c.add(f'<g filter="{wobble(c, f"pw{i}", "0.03", 9, 50 + i, 3, 0.6)}" opacity="{0.82 if back else 1}"><path d="{d}" fill="{pg}"/>'
                  f'<path d="{d}" fill="{lit}"/>'
                  f'<g filter="{noise(c, f"pn{i}", "0.02", 4, 60 + i, 2.2, -1.1)}" opacity="0.5"><path d="{d}" fill="{lgrad(c, f"pt{i}", [(0, "#B8604A", 1), (0.5, "#5A2A2A", 1), (1, "#2A1018", 1)])}"/></g>'
                  f'<g filter="{c.blur(f"pkb{i}", 2.5)}"><g filter="{noise(c, f"pk{i}", "0.035", 3, 70 + i, 2.4, -1.4)}" opacity="0.45"><path d="{d}" fill="#000000"/></g></g></g>')
            c.add(halo(c, tx, ty - 14, 40 if not back else 26, rimc, 0.75, f"tip{i}"))
            c.add(sparkle(tx, ty - 16, 13 if not back else 8, "#FFFFFF", 1), f'<circle cx="{f(tx)}" cy="{f(ty - 16)}" r="{2.8 if not back else 1.8}" fill="#FFFFFF"/>')
            rnd = random.Random(70 + i)
            for _ in range(3 if not back else 2):
                px, py = tx + side * rnd.uniform(-6, 18), ty + rnd.uniform(40, 240)
                c.add(halo(c, px, py, 10, rimc, 0.7, f"pd{i}"), f'<ellipse cx="{f(px)}" cy="{f(py)}" rx="6" ry="1.5" fill="{rimc}" opacity="0.9" transform="rotate({f(rnd.uniform(-30, 30))} {f(px)} {f(py)})"/>'
                      f'<circle cx="{f(px)}" cy="{f(py)}" r="1.4" fill="#FFFFFF"/>')
        c.add(bright_stars(49, 10, (16, 20, 524, 940), "#FFFFFF", 3, 9, avoid=(70, 250, 470, 740)))
        for k, (sx, sy, sr, sc) in enumerate(((132, 232, 30, "#DCEBFF"), (418, 206, 40, "#E6F0FF"), (486, 300, 18, "#FFE6F2"), (60, 160, 16, "#DCEBFF"),
                                              (178, 70, 12, "#FFF0E0"), (372, 92, 14, "#DCEBFF"), (40, 620, 14, "#DCEBFF"), (508, 640, 12, "#FFE6F2"))):
            c.add(spiked_star(c, f"js{k}", sx, sy, sr, sc))
    c.add(inner_shadow(c, win, 44, 16, 0.55))
    c.add(grade(c, win, "#FF6FB8", 0.15, 0.05, 0.22, 0.9, "ne-g1"))
    c.add(grade(c, win, "#30D0C8", 0.95, 0.5, 0.18, 0.8, "ne-g2"))
    c.add(rim(c, win, ROSE, 5))
    inner = gas(c, "nI", 270, 150, 60, 50, "#FF5FB0", 0.9, "0.04", 52) + gas(c, "nI2", 250, 170, 40, 30, "#30D0C8", 0.8, "0.05", 53)
    level_ring(c, 270, 150, 66, 101, "NÉBULEUSE", ROSE, "lr", inner=inner, glow="#FF5FB0", glow_op=0.4, disc=("#3A1438", "#160818", "#06020A"))
    c.add(outer_frame(c, ROSE, inner_op=0.5))
    inscription(c, kicker(101), "Palier Nébuleuse", metal=ROSE, panel=("#2A0E2A", "#0A040C"), accent="#FFB8CC",
                title_size=34, message="Merci la famille", msg_color="#FFE6F0")
    ruban_birds(c, "mee-amoureuse", "meo-love")
    return c


# ---------------------------------------------------------------- Supernova (niv. 400)

def supernova():
    c = Card("pl5")
    photo(c, top="#20243A", bottom="#0A0C16", rim="#BFE8FF", glow=0.22)
    win = octo(80, 270, 460, 726, 28)
    cx, cy = 270, 150
    with group(c, f'mask="{deco_mask(c, win)}"'):
        c.add(f'<rect width="{W}" height="{H}" fill="{c.rgrad("bg", [(0, "#FFFFFF", 1), (0.06, "#BFF0FF", 1), (0.2, "#4A3AA8", 1), (0.48, "#160C36", 1), (1, "#04020C", 1)], 0.5, 0.156, 0.95)}"/>')
        c.add(dust(51, 300, (0, 0, W, H), ["#FFFFFF", "#CFEFFF"], 0.3, 1.2, 0.25, 0.9))
        for i, (r0, r1, col, op, seed) in enumerate(((560, 650, "#4A6CFF", 0.5, 54), (330, 400, "#FF5FB0", 0.8, 55), (168, 210, "#9FF0FF", 0.95, 56))):
            g = c.rgrad(f"sh{i}", [(0, col, 0), (r0 / r1, col, 0), ((r0 + r1) / 2 / r1, col, op), (1, col, 0)])
            c.add(f'<g filter="{noise(c, f"shn{i}", "0.022", 4, seed, 2.8, -0.9)}"><circle cx="{cx}" cy="{cy}" r="{r1}" fill="{g}"/></g>')
        rnd = random.Random(57)
        rays, rays_glow = [], []
        for i in range(340):
            a = rnd.uniform(0, 360)
            r0 = rnd.uniform(60, 110)
            r1 = rnd.uniform(160, 980) * (1 if i % 4 else 1.3)
            x0, y0 = pt(cx, cy, r0, a)
            x1, y1 = pt(cx, cy, r1, a)
            col = rnd.choice(("#FFFFFF", "#9FE8FF", "#FF9AD5", "#FFE59A", "#FFFFFF"))
            w = rnd.uniform(0.4, 2.0)
            g = f'<line x1="{f(x0)}" y1="{f(y0)}" x2="{f(x1)}" y2="{f(y1)}" stroke="{col}" stroke-width="{f(w)}" stroke-linecap="round" opacity="{f(rnd.uniform(0.08, 0.5))}"/>'
            rays.append(g)
            if i % 3 == 0:
                rays_glow.append(g)
        c.add(f'<g filter="{c.blur("rg", 3)}">{"".join(rays_glow)}</g>', "".join(rays))
        c.add(comets(c, "cm1", 58, 160, (cx, cy), 140, 980, (70, 258, 470, 736), ["#BFF4FF", "#FFC2E8", "#FFF1B0", "#E6DEFF"], (16, 60), (1.4, 3.6)))
    c.add(inner_shadow(c, win, 44, 16, 0.5))
    c.add(grade(c, win, "#C8F0FF", 0.5, -0.15, 0.34, 0.95, "su-g"))
    c.add(rim(c, win, PLATINUM, 5))
    c.add(comets(c, "cm2", 59, 50, (cx, cy), 200, 560, (96, 290, 444, 712), ["#FFFFFF", "#BFF4FF", "#FFC2E8"], (20, 54), (2, 4)))
    forged = (("C", 6, "#9FE8FF", 44, 334, 40, -10), ("O", 8, "#FFC2E8", 494, 300, 38, 12), ("Si", 14, "#FFF1B0", 40, 486, 36, 8),
              ("Fe", 26, "#FFB08A", 498, 452, 42, -8), ("Au", 79, "#FFD45A", 46, 640, 44, 6), ("Ne", 10, "#D8C8FF", 116, 58, 32, -14),
              ("Ca", 20, "#BFF4FF", 428, 62, 32, 12))
    for k, (sym, z, col, x, y, sz, rot) in enumerate(forged):
        c.add(element_tile(c, x, y, sz, sym, z, col, rot, f"el{k}", trail_from=(cx, cy)))
    for k, (x, y, r) in enumerate(((150, 252, 12), (392, 246, 11), (26, 566, 9), (514, 536, 10), (90, 734, 9))):
        c.add(nucleus(c, x, y, r, 90 + k, f"nu{k}"))
    flare = (
        f'<g filter="{c.blur("fl", 2.5)}"><ellipse cx="{cx}" cy="{cy}" rx="250" ry="5" fill="#FFFFFF" opacity="0.9"/>'
        f'<ellipse cx="{cx}" cy="{cy}" rx="4" ry="120" fill="#FFFFFF" opacity="0.8"/></g>'
        + halo(c, cx, cy, 170, "#FFFFFF", 0.85, "core")
    )
    inner = halo(c, cx, cy, 52, "#BFF0FF", 0.7, "sI")
    level_ring(c, cx, cy, 66, 400, "SUPERNOVA", PLATINUM, "lr", inner=inner, rays_markup=flare, disc=("#2C3A80", "#121A48", "#050818"),
               num_fill=c.grad("snum", [(0, "#FFFFFF"), (0.6, "#E6F6FF"), (1, "#8FCBFF")]), ink="#3A4A80")
    c.add(outer_frame(c, PLATINUM, inner_op=0.5))
    bird(c, "meo-feu-artifice", 440, 652, 170, flip=True)
    inscription(c, kicker(400), "Palier Supernova", metal=PLATINUM, panel=("#1A1C4A", "#05061A"), accent="#BFE6FF", shape="octo",
                border=c.prism("ins-pr", 0, 0, 1, 1), title_size=38)
    return c


# ---------------------------------------------------------------- Singularité (niv. 1000)

def accretion(card, name, cx, cy, rx, ry, half, inner=0.34):
    """Une moitié du disque d'accrétion : `half` = 'back' (au-dessus) ou 'front' (devant, en bas)."""
    g = card.rgrad(name + "-g", [(0, "#FFFFFF", 0), (inner - 0.01, "#FFFFFF", 0), (inner, "#FFFFFF", 1), (inner + 0.08, "#FFE6B0", 1),
                                 (0.55, "#FF9A3C", 0.9), (0.78, "#C2361A", 0.55), (1, "#5A0E2A", 0)])
    dop = lgrad(card, name + "-dop", [(0, "#FFFFFF", 0.0), (0.35, "#000000", 0.0), (1, "#000000", 0.55)], 0, 0, 1, 0)
    half_clip = f"M{f(cx - rx - 10)} {f(cy)} L{f(cx + rx + 10)} {f(cy)} L{f(cx + rx + 10)} {f(cy - ry - 10)} L{f(cx - rx - 10)} {f(cy - ry - 10)} Z" if half == "back" \
        else f"M{f(cx - rx - 10)} {f(cy)} L{f(cx + rx + 10)} {f(cy)} L{f(cx + rx + 10)} {f(cy + ry + 10)} L{f(cx - rx - 10)} {f(cy + ry + 10)} Z"
    streak = noise(card, name + "-st", "0.004 0.09", 3, 71 if half == "back" else 72, 1.8, -0.3)
    body = (
        f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{g}"/>'
    )
    return (
        f'<g clip-path="{clip(card, half_clip, name + "-hc")}">'
        f'<g filter="{card.blur(name + "-bl", 6)}" opacity="0.8">{body}</g>'
        f'<g filter="{streak}">{body}</g>'
        f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{dop}"/></g>'
    )


def singularite():
    c = Card("pl6")
    photo(c, top="#1C1832", bottom="#08060F", rim="#D7C8FF", glow=0.2)
    win = arch(84, 456, 432, 286, 728)
    cx, cy, rh = 270, 162, 60
    with group(c, f'mask="{deco_mask(c, win)}"'):
        c.add(f'<rect width="{W}" height="{H}" fill="{c.rgrad("bg", [(0, "#2A1A5A", 1), (0.3, "#0C0824", 1), (1, "#010006", 1)], 0.5, 0.17, 0.95)}"/>')
        spirals = []
        for k in range(16):
            pts = []
            for i in range(60):
                t = i / 59
                rr = 70 + t * 900
                a = math.radians(k * 22.5 + 260 * (1 - t) ** 2)
                pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a) * 0.86))
            spirals.append(f'<path d="{smooth_open(pts)}" fill="none" stroke="#8C7BFF" stroke-width="1" opacity="0.22"/>')
        for k, rr in enumerate((110, 150, 205, 280, 380, 510, 680, 900)):
            spirals.append(f'<ellipse cx="{cx}" cy="{f(cy + k * 6)}" rx="{rr}" ry="{f(rr * 0.86)}" fill="none" stroke="#8C7BFF" stroke-width="0.9" opacity="{f(0.28 - k * 0.025)}"/>')
        c.add("".join(spirals))
        rnd = random.Random(73)
        arcs = []
        for _ in range(520):
            rr = 72 + (rnd.random() ** 1.6) * 900
            a = rnd.uniform(0, 360)
            span = min(70, 14 * (140 / rr) ** 1.5 + 0.4)
            x0, y0 = pt(cx, cy, rr, a)
            x1, y1 = pt(cx, cy, rr, a + span)
            if 84 < x0 < 456 and 286 < y0 < 728:
                continue
            col = rnd.choice(("#FFFFFF", "#CFE0FF", "#FFE6C8", "#D8C8FF"))
            arcs.append(f'<path d="M{f(x0)} {f(y0)} A{f(rr)} {f(rr)} 0 0 1 {f(x1)} {f(y1)}" fill="none" stroke="{col}" stroke-width="{f(rnd.uniform(0.5, 1.5))}" stroke-linecap="round" opacity="{f(rnd.uniform(0.35, 0.95))}"/>')
        c.add("".join(arcs))
        c.add(f'<g opacity="0.75">{cosmic_web(c, "web", 78, (-20, 230, 120, 960), 26, "#FFB070", "#FFE6C8", 0.75)}</g>')
        c.add(f'<g opacity="0.55">{cosmic_web(c, "web2", 79, (-20, -20, 230, 130), 16, "#FFB070", "#FFE6C8", 0.6)}</g>')
        c.add(lattice(c, "lat", (430, 220, 600, 980), 22, "#8FD8FF", 0.42, 8))
        c.add(lattice(c, "lat2", (300, -20, 600, 130), 18, "#8FD8FF", 0.3, -6))
        c.add(gas(c, "s1", 70, 700, 160, 260, "#5A3FE4", 0.6, "0.011", 74))
        c.add(gas(c, "s2", 480, 620, 140, 280, "#C2318F", 0.5, "0.012", 75))
        c.add(gas(c, "s3", 270, 900, 340, 110, "#3A2AA8", 0.6, "0.012", 76))
        c.add(bright_stars(77, 8, (16, 300, 524, 940), "#FFFFFF", 3, 8, avoid=(70, 270, 470, 740)))
    c.add(inner_shadow(c, win, 44, 16, 0.6))
    c.add(grade(c, win, "#FFB070", 0.5, -0.12, 0.22, 0.9, "si-g1"))
    c.add(grade(c, win, "#8C7BFF", 0.5, 1.1, 0.2, 0.8, "si-g2"))
    c.add(f'<path d="{win}" fill="none" stroke="{c.prism("rimp", 0, 0, 1, 1)}" stroke-width="7" opacity="0.6" filter="{c.blur("rimpg", 5)}"/>')
    c.add(rim(c, win, OBSIDIAN, 4.5, "rim", inner="#D8C8FF"))
    c.add(f'<path d="{win}" fill="none" stroke="{c.prism("rimp2", 0, 1, 1, 0)}" stroke-width="2"/>')
    drx, dry = 262, 44
    c.add(halo(c, cx, cy, 300, "#FF9A3C", 0.28, "bh-h", ry=120))
    c.add(accretion(c, "dk", cx, cy + 8, drx, dry, "back"))
    lens = c.rgrad("lens", [(0, "#FFFFFF", 0), (0.70, "#FFFFFF", 0), (0.76, "#FFF1D0", 1), (0.86, "#FF9A3C", 0.7), (1, "#C2361A", 0)])
    c.add(f'<g clip-path="{clip(c, f"M0 0 L{W} 0 L{W} {cy + 10} L0 {cy + 10} Z", "lc")}"><ellipse cx="{cx}" cy="{cy + 4}" rx="{rh * 1.62}" ry="{rh * 1.5}" fill="{lens}" filter="{c.blur("lensb", 2)}"/></g>')
    ring_glow = f'<circle cx="{cx}" cy="{cy}" r="{rh + 3}" fill="none" stroke="{c.prism("pr-g", 0, 0, 1, 1)}" stroke-width="6" filter="{c.blur("prg", 4)}"/>'
    level_ring(c, cx, cy, rh, 1000, "SINGULARITÉ", OBSIDIAN, "lr", inner="", band=15, disc=("#000000", "#000000", "#000000"),
               num_fill=c.prism("numP", 0, 0, 1, 1), ink="#B9A7FF", rays_markup=ring_glow)
    c.add(f'<circle cx="{cx}" cy="{cy}" r="{rh + 1.5}" fill="none" stroke="{c.prism("pr", 0, 0, 1, 1)}" stroke-width="2.2"/>')
    c.add(accretion(c, "dkf", cx, cy + 8, drx, dry, "front"))
    c.add(outer_frame(c, OBSIDIAN, inner_op=0.8, inner_color="#B9A7FF"))
    c.add(f'<rect x="12" y="12" width="{W - 24}" height="{H - 24}" rx="24" fill="none" stroke="{c.prism("ofp", 0, 0, 1, 1)}" stroke-width="1.6" opacity="0.9"/>')
    ys = [600, 526, 452, 378, 304]
    c.add(scale_ladder2(c, 46, ys, GRAND, GRAND_EXP, c.prism("lad", 0, 0, 1, 1), "lg", (98, 182), "#FFB070", label_color="#FFE6C8"))
    c.add(scale_ladder2(c, 494, ys, PETIT, PETIT_EXP, c.prism("lad", 0, 0, 1, 1), "lp", (442, 182), "#8FD8FF", label_color="#D6F2FF"))
    c.add(f'<g filter="{c.shadow("tagsh", 0, 3, 4, "#000000", 0.6)}"><rect x="214" y="716" width="112" height="22" rx="11" fill="#0A0818" stroke="{c.prism("tagp", 0, 0, 1, 0)}" stroke-width="1.4"/></g>')
    c.add(power_label(262, 731, "0", "#FFFFFF", 9.5, anchor="end"), f'<text x="278" y="731" font-family="{SANS}" font-weight="800" font-size="9" letter-spacing="2.2" fill="#FFE6C8">NOUS</text>')
    c.add(f'<circle cx="270" cy="727.5" r="1.8" fill="#D8C8FF"/>')
    bird(c, "duo-meo-trinquer", 150, 700, 176, rotate=-4)
    inscription(c, kicker(1000), "Palier Singularité", metal=PLATINUM, panel=("#140E30", "#030208"), accent="#D8C8FF",
                border=c.prism("ins-pr", 0, 0, 1, 1), title_size=36, title_fill=c.grad("tP", [(0, "#FFFFFF"), (0.5, "#F2E8FF"), (1, "#B9A7FF")]),
                message="On l'a fait ensemble", msg_color="#FFE6C8")
    ry = 914
    ruler = c.def_once("ruler", f'<linearGradient id="{c.id("ruler")}" gradientUnits="userSpaceOnUse" x1="70" y1="0" x2="470" y2="0">'
                       '<stop offset="0" stop-color="#FFB070"/><stop offset="0.43" stop-color="#FFFFFF"/><stop offset="1" stop-color="#8FD8FF"/></linearGradient>')
    ticks = []
    for k in range(62):
        x = 70 + 400 * k / 61
        big = k % 10 == 0 or k == 26
        ticks.append(f'<line x1="{f(x)}" y1="{ry - (5 if big else 2.5)}" x2="{f(x)}" y2="{ry + (5 if big else 2.5)}" stroke="{ruler}" stroke-width="{1.1 if big else 0.6}"/>')
    c.add(f'<line x1="70" y1="{ry}" x2="470" y2="{ry}" stroke="{ruler}" stroke-width="1"/>', f'<g>{"".join(ticks)}</g>')
    xu = 70 + 400 * 26 / 61
    c.add(f'<circle cx="{f(xu)}" cy="{ry}" r="3.4" fill="#FFFFFF"/>', halo(c, xu, ry, 12, "#FFFFFF", 0.6, "uh"))
    c.add(power_label(70, ry + 18, "26", "#FFE6C8", 8, anchor="start"), power_label(470, ry + 18, "−35", "#D6F2FF", 8, anchor="end"))
    c.add(f'<text x="{f(xu)}" y="{ry + 18}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="7.5" letter-spacing="2" fill="#FFFFFF" opacity="0.9">NOUS</text>')
    c.add(f'<text x="70" y="{ry - 9}" font-family="{SANS}" font-weight="800" font-size="7" letter-spacing="2" fill="#FFB070" opacity="0.85">L\'INFINIMENT GRAND</text>')
    c.add(f'<text x="470" y="{ry - 9}" text-anchor="end" font-family="{SANS}" font-weight="800" font-size="7" letter-spacing="2" fill="#8FD8FF" opacity="0.85">L\'INFINIMENT PETIT</text>')
    return c


FRAMES = [
    ("moments-palier-lueur", lueur, dict(rank="Palier de niveau", division=None, option="Lueur · niveau 10", name="La Première Lueur",
     story="Au soir du niveau 10, sur la savane, un baobab tend ses branches-racines vers la Voie lactée ; une seule étoile s'allume au-dessus de l'anneau d'argent et des lucioles montent en spirale des herbes : la toute petite lumière qui annonce le voyage.",
     layout="pied (Mee montée au ciel, Meo salut)", message="Le voyage commence")),
    ("moments-palier-aurore", aurore, dict(rank="Palier de niveau", division=None, option="Aurore · niveau 50", name="Le Rideau boréal",
     story="Trois rideaux d'aurore polaire, verts, turquoise et violets, ondulent autour de la photo sous la Voie lactée ; en bas, une forêt d'épicéas boréale et des crêtes enneigées au bord d'un lac gelé, et l'anneau de glace du 50 en garde un fragment dans son disque.",
     layout="perchés (Mee coucou, Meo cool)", message=None)),
    ("moments-palier-galaxie", galaxie, dict(rank="Palier de niveau", division=None, option="Galaxie · niveau 90", name="La Spirale d'or",
     story="Une galaxie spirale immense enroule ses bras bleutés, ses couloirs de poussière et ses nébuleuses roses autour de l'anneau d'or du 90 ; une galaxie vue par la tranche, une compagne rose, deux amas globulaires et un collier d'étoiles ourlent la photo ovale.",
     layout="coins (Mee wow en haut à gauche, Meo bravo en bas à droite)", message="On ira jusqu'aux étoiles")),
    ("moments-palier-nebuleuse", nebuleuse, dict(rank="Palier de niveau", division=None, option="Nébuleuse · niveau 101", name="La Pouponnière d'étoiles",
     story="Des piliers de poussière ourlés de lumière montent à travers des nappes de gaz magenta, turquoise et or ; à leur pointe naissent des étoiles, de jeunes soleils brillent de leurs six aigrettes de diffraction et, le long des flancs, de minuscules disques forment des planètes : une pouponnière stellaire.",
     layout="ruban (Mee amoureuse, Meo love)", message="Merci la famille")),
    ("moments-palier-supernova", supernova, dict(rank="Palier de niveau", division=None, option="Supernova · niveau 400", name="L'Éclat",
     story="L'anneau du 400 est au cœur d'une étoile qui explose : ondes de choc en coquilles, rais de lumière, éclats en traînée, et les éléments qu'elle vient de forger (carbone, oxygène, silicium, fer, or, néon, calcium) filent vers le bord du cadre avec leurs noyaux ; l'infiniment petit naît de l'infiniment grand.",
     layout="selfie (Meo feu d'artifice)", message=None)),
    ("moments-palier-singularite", singularite, dict(rank="Palier de niveau", division=None, option="Singularité · niveau 1000", name="Entre les deux infinis",
     story="À la singularité, l'infiniment grand et l'infiniment petit se rejoignent : deux échelles de lentilles en puissances de dix montent vers le trou noir qui porte l'anneau du 1000, à gauche sur la toile cosmique (de la Terre, 10⁷ m, aux filaments de l'Univers, 10²⁶ m), à droite sur un réseau d'atomes (de la cellule, 10⁻⁵ m, aux quarks, 10⁻¹⁸ m). Sous la photo, l'étiquette « 10⁰ m · NOUS » et une règle de 10²⁶ à 10⁻³⁵ m disent où nous sommes : entre les deux.",
     layout="duo libre (Mee et Meo trinquent, au bord de l'inscription)", message="On l'a fait ensemble")),
]
