"""Atelier « Trésor » — Coffret (50 Meeshes) et Coffre (100 Meeshes)."""

import math
import random

from cadre import *  # noqa: F401,F403
from objets import pearl, pearl_string, gem, cabochon, chain, coin_rain, coin_mound, smooth, closed_smooth, sample, segs_d, GEMS
from coffrets import (EBONY, ROSEWOOD, nacre_fill, ebony_fill, lozenge, star8, rosette, marquetry_band, quilted, coffret,
                      crown, chalice, gem_bezel)
from banque import (DARKSTEEL, brushed, lathe, sheen_disc, rivet_row, hexbolt, bolt_h, bolt_v, handwheel, dial_ring,
                    vault_face, open_door, lingot, lingot_stack)

ROSE_VELVET = ("#E0607E", "#8A1838", "#2A0612")
TEAL_VELVET = ("#5ED0C0", "#11665E", "#032824")


@plate_layer
def steel_plate(card, x0, y0, x1, y1, key="sp", r=14, m=STEEL):
    d = rrect(x0, y0, x1, y1, r)
    bv = bevel(card, key + "-bv", 1.2, 3.0, 0.9, 22, shadow=(0, 6, 7, 0.65))
    out = [f'<g filter="{bv}">{brushed(card, d, key, m, 0, 0, 1, 0.25, 2, "0.002 0.9", 9, 0.35)}</g>']
    out.append(f'<path d="{rrect(x0 + 6, y0 + 6, x1 - 6, y1 - 6, r - 4)}" fill="none" stroke="#FFFFFF" stroke-width="0.8" opacity="0.5"/>')
    out.append(f'<path d="{rrect(x0 + 7, y0 + 7, x1 - 7, y1 - 7, r - 5)}" fill="none" stroke="#2A3038" stroke-width="0.8" opacity="0.5"/>')
    for sx, sy in ((x0 + 16, y0 + 16), (x1 - 16, y0 + 16), (x0 + 16, y1 - 16), (x1 - 16, y1 - 16)):
        g = rg(card, key + "-scr", [(0, "#FFFFFF"), (0.4, m[0]), (1, m[2])], 0.35, 0.3, 0.7)
        out.append(f'<circle cx="{sx}" cy="{sy}" r="5.2" fill="{g}" stroke="{m[2]}" stroke-width="0.6"/>'
                   f'<line x1="{sx - 3.4}" y1="{sy + 1.4}" x2="{sx + 3.4}" y2="{sy - 1.4}" stroke="{m[2]}" stroke-width="1.2"/>')
    return "".join(out)


from base import plate_layer  # noqa: E402  la couche « plate » et ses emplacements de texte


@plate_layer(title="palier")
def engraved_inscription(card, palier, message=None, y=750, dark="#1C222A", accent="#34404E", title_size=40):
    hi = inscription(card, palier, message, y=y + 1.2, ink="#FFFFFF", accent="#FFFFFF", shadow=False, title_size=title_size, msg_color="#FFFFFF")
    lo = inscription(card, palier, message, y=y, ink=dark, accent=accent, shadow=False, title_size=title_size, msg_color="#3A2A10")
    return f'<g opacity="0.55">{hi}</g>{lo}'


# =============================================================== COFFRET

def coffret_a():
    c = start("ca", "#2C1A28", "#0E0810", "#FFD9C0", 0.22)
    win = rrect(72, 262, 468, 712, 6)
    with masked(c, win, "w"):
        # le couvercle levé : cadre d'ébène marqueté, capitonnage, miroir
        lid = poly([(44, 14), (496, 14), (526, 240), (14, 240)])
        lid_in = poly([(70, 40), (470, 40), (494, 222), (46, 222)])
        c.add(bg(c, "#0A0604"))
        c.add(ebony_fill(c, lid, "lid", EBONY, 5, cx=0.5, cy=0.1))
        c.add(quilted(c, lid_in, "qv", ROSE_VELVET, 20, 0.5, 0.45))
        c.add(f'<path d="{lid_in}" fill="none" stroke="#E8B53C" stroke-width="2"/>')
        c.add(marquetry_band(c, 64, 22, 476, 34, "lmb", True, 3, 16))
        mg = lg(c, "mir", [(0, "#F8FBFF"), (0.35, "#AFC0D6"), (0.5, "#5C6B80"), (0.62, "#B8C6D8"), (1, "#E8EEF6")], 0, 0, 1, 1)
        c.add(gold_frame(c, ellipse_path(270, 134, 102, 84), "mf", GOLD, 9))
        c.add(f'<ellipse cx="270" cy="134" rx="98" ry="80" fill="{mg}"/>')
        c.add(f'<ellipse cx="270" cy="134" rx="98" ry="80" fill="{rg(c, "mirw", [(0, "#FFE7C8", 0.55), (1, "#FFE7C8", 0)], 0.5, 0.75, 0.6)}"/>')
        c.add(f'<path d="M196 106 L236 72 M206 122 L256 80" stroke="#FFFFFF" stroke-width="4" opacity="0.45" stroke-linecap="round"/>')
        # le bord du coffret et ses flancs
        rim = poly([(10, 240), (530, 240), (530, 262), (10, 262)])
        c.add(ebony_fill(c, rim, "rim", ("#8A6450", "#3A2418", "#120804"), 7))
        c.add(f'<line x1="10" y1="241" x2="530" y2="241" stroke="#FFE7B0" stroke-width="1.2" opacity="0.7"/>')
        sides = f"M0 262 L72 262 L72 712 L0 712 Z M468 262 L540 262 L540 712 L468 712 Z"
        c.add(ebony_fill(c, sides, "sd", EBONY, 8, vertical=True))
        c.add(marquetry_band(c, 22, 280, 50, 694, "smb1", False, 4, 22))
        c.add(marquetry_band(c, 490, 280, 518, 694, "smb2", False, 5, 22))
        front = "M0 712 L540 712 L540 960 L0 960 Z"
        c.add(ebony_fill(c, front, "fr", EBONY, 9, cx=0.5, cy=0.1))
        c.add(ebony_fill(c, poly([(0, 712), (540, 712), (540, 726), (0, 726)]), "frim", ("#9A7058", "#3A2418", "#120804"), 10))
        c.add(f'<line x1="0" y1="712.5" x2="540" y2="712.5" stroke="#FFE7B0" stroke-width="1.2" opacity="0.7"/>')
        c.add(marquetry_band(c, 18, 734, 522, 748, "fmb", True, 6, 16))
        c.add(marquetry_band(c, 18, 932, 522, 946, "fmb2", True, 7, 16))
        c.add(rosette(c, 36, 840, 20, "ros1", 3))
        c.add(rosette(c, 504, 840, 20, "ros2", 4))
        vg = rg(c, "vig", [(0.55, "#000000", 0), (1, "#000000", 0.6)], 0.5, 0.5, 0.8)
        c.add(f'<rect width="{W}" height="{H}" fill="{vg}"/>')
    # la doublure : parois intérieures de velours
    ig = lg(c, "wall", [(0, ROSE_VELVET[2]), (1, ROSE_VELVET[1])], 0, 0, 1, 0)
    ig2 = lg(c, "wall2", [(0, ROSE_VELVET[1]), (1, ROSE_VELVET[2])], 0, 0, 1, 0)
    c.add(f'<path d="{poly([(72, 262), (90, 276), (90, 696), (72, 712)])}" fill="{ig}"/>')
    c.add(f'<path d="{poly([(468, 262), (450, 276), (450, 696), (468, 712)])}" fill="{ig2}"/>')
    c.add(f'<path d="{poly([(72, 712), (90, 696), (450, 696), (468, 712)])}" fill="{ROSE_VELVET[1]}"/>')
    c.add(f'<path d="{poly([(72, 262), (468, 262), (450, 276), (90, 276)])}" fill="{ROSE_VELVET[2]}"/>')
    c.add(grade(c, win, "#FFC8A8", 0.5, 0.0, 0.18, 0.9, "gr"))
    c.add(window_depth(c, poly([(90, 276), (450, 276), (450, 696), (90, 696)]), 0.55, 30, 10, None, 1, "wd"))
    c.add(f'<path d="{win}" fill="none" stroke="#E8B53C" stroke-width="1.6"/>')
    gm = metal_lin(c, "hg", GOLD, 0, 0, 1, 1)
    hbv = bevel(c, "hgbv", 0.9, 2.6, 1.0, 22, shadow=(0, 2, 2, 0.6))
    for hx in (130, 410):
        c.add(f'<g filter="{hbv}"><rect x="{hx - 26}" y="228" width="52" height="24" rx="4" fill="{gm}"/><rect x="{hx - 30}" y="236" width="60" height="8" rx="4" fill="{gm}"/></g>')
    c.add(emblem(c, 270, 134, 52, "Coffret", halo_op=0.35))
    # ce qui déborde : perles, Meeshes, gemmes, et la lumière du trésor
    c.add(f'<g style="mix-blend-mode:screen">{halo(c, "tglow", 270, 712, 300, 110, "#FFC870", 0.55, 0.35)}</g>')
    c.add(coin_mound(c, 31, 270, 722, 196, 58, 150, 8, 13, gems=14))
    c.add(coin_rain(c, 32, 6, (120, 600, 420, 690), 7, 10, avoid=None))
    for x, y, r in ((150, 676, 8), (390, 668, 9), (270, 650, 7)):
        c.add(glint(x, y, r, "#FFFFFF", 0.95))
    rnd = random.Random(5)
    for k in range(7):
        x = 150 + k * 40 + rnd.uniform(-6, 6)
        c.add(pearl_string(c, smooth([(x - 14, 700 + rnd.uniform(-6, 4)), (x, 712), (x + 16, 704 + rnd.uniform(-4, 4))]), 2.6, shadow=False))
    c.add(pearl_string(c, smooth([(120, 690), (104, 712), (70, 760), (40, 830), (52, 900), (88, 930)]), 3.6))
    c.add(pearl_string(c, smooth([(150, 694), (128, 716), (100, 770), (92, 820)]), 3.0, tint="#FFEFF4"))
    c.add(pearl_string(c, smooth([(420, 690), (436, 712), (470, 760), (500, 830), (488, 900), (452, 930)]), 3.6))
    c.add(pearl_string(c, smooth([(392, 694), (414, 716), (444, 770), (450, 820)]), 3.0, tint="#FFEFF4"))
    c.add(gem(214, 700, 9, "emeraude", 10, 8, 0.62))
    c.add(gem(330, 698, 8, "saphir", 30, 8, 0.62))
    c.add(gem(270, 690, 10, "rubis", 0, 8, 0.62))
    birds(c, [("mee-amoureuse", 62, 226, 112, False, -8), ("meo-love", 478, 226, 112, True, 8)])
    c.add(text_panel(c, 104, 756, 436, 918, 18, "#120A08", 0.9, "#E8B53C", 1.6, "tp"))
    c.add(f'<path d="{rrect(111, 763, 429, 911, 13)}" fill="none" stroke="#E8B53C" stroke-width="0.8" opacity="0.6"/>')
    c.add(inscription(c, "Coffret", "Pour toi, maman", y=758, ink="#FFF1DA", accent="#F2C46A", title_size=40, msg_color="#FFD6E2"))
    save(c, "coffret", "Coffret", "a", "Le coffret de nacre",
         "Le cadre est un coffret à bijoux qu'on vient d'ouvrir : couvercle capitonné de velours rose et son miroir où brille la Meesh, "
         "ébène incrusté de nacre en losanges et en rosaces à huit branches, à la manière des coffrets de marqueterie de Damas ; "
         "au bord, un flot de Meeshes, de gemmes et de rangs de perles déborde dans la lumière du trésor.",
         "libre (aux charnières du couvercle)", "Pour toi, maman")


def damask(card, key, color="#9FE6DA", op=0.14):
    out = []
    for j in range(-1, 11):
        for i in range(-1, 6):
            x = i * 120 + (60 if j % 2 else 0)
            y = j * 100
            out.append(f'<path d="M{x} {y - 34} C{x + 26} {y - 22} {x + 30} {y + 6} {x} {y + 34} C{x - 30} {y + 6} {x - 26} {y - 22} {x} {y - 34} Z" fill="none" stroke="{color}" stroke-width="2"/>'
                       f'<path d="M{x} {y - 18} C{x + 12} {y - 8} {x + 12} {y + 6} {x} {y + 16} C{x - 12} {y + 6} {x - 12} {y - 8} {x} {y - 18} Z" fill="{color}"/>'
                       f'<path d="M{x - 30} {y + 40} Q{x} {y + 30} {x + 30} {y + 40} M{x - 44} {y} Q{x - 54} {y - 20} {x - 40} {y - 34} M{x + 44} {y} Q{x + 54} {y - 20} {x + 40} {y - 34}" fill="none" stroke="{color}" stroke-width="1.6"/>')
    return f'<g opacity="{op}">{"".join(out)}</g>'


def coffret_b():
    c = start("cb", "#14302E", "#061212", "#FFE2B0", 0.22)
    cx, cy, rx, ry = 270, 490, 190, 236
    win = ellipse_path(cx, cy, rx, ry)
    with masked(c, win, "w"):
        vel = rg(c, "vel", [(0, "#2A8C80"), (0.5, "#0E4A44"), (1, "#03191A")], 0.5, 0.4, 0.85)
        c.add(bg(c, vel))
        c.add(damask(c, "dm"))
        c.add(f'<rect width="{W}" height="{H}" fill="#000000" opacity="0.25" filter="{noise(c, "vn", "1.2", 1, 4, (0, 0, 0), 1.2, -0.4)}"/>')
        c.add(halo(c, "top", 270, 150, 270, 200, "#FFE2A8", 0.3))
        vg = rg(c, "vig", [(0.55, "#000000", 0), (1, "#000000", 0.65)], 0.5, 0.5, 0.8)
        c.add(f'<rect width="{W}" height="{H}" fill="{vg}"/>')
        c.add(gold_frame(c, rrect(16, 16, 524, 944, 22), "bf", GOLD, 3))
    c.add(grade(c, win, "#FFE0B0", 0.5, 0.05, 0.16, 0.9, "gr"))
    c.add(window_depth(c, win, 0.7, 40, 14))
    c.add(gold_frame(c, ellipse_path(cx, cy, rx + 9, ry + 9), "ef", GOLD_RICH, 12))
    ring = [pt(0, 0, 1, a) for a in range(0, 360, 4)]
    c.add(pearl_string(c, closed_smooth([(cx + x * (rx + 24), cy + y * (ry + 24)) for x, y in ring], 0.5), 4.2))
    c.add(pearl_string(c, closed_smooth([(cx + x * (rx - 3), cy + y * (ry - 3)) for x, y in ring], 0.5), 2.4, shadow=False))
    for k, a in enumerate(range(0, 360, 30)):
        x, y = pt(0, 0, 1, a)
        if a in (0, 180):
            continue
        c.add(cabochon(c, cx + x * (rx + 9), cy + y * (ry + 9), 7.5, 6.2, ("rubis", "emeraude", "saphir", "amethyste")[k % 4], GOLD))
    # deux coffrets en haut ; festons de perles sur le haut du médaillon, pendeloques sur les flancs
    def anchor(a, extra=14):
        x, y = pt(0, 0, 1, a)
        return cx + x * (rx + extra), cy + y * (ry + extra)
    tops = [anchor(a) for a in (-64, -32, 0, 32, 64)]
    for (ax, ay), (bx, by) in zip(tops, tops[1:]):
        mx, my = (ax + bx) / 2, (ay + by) / 2
        c.add(pearl_string(c, smooth([(ax, ay), (mx, my + 26), (bx, by)]), 3.0))
        c.add(pearl_string(c, smooth([(ax, ay), (mx, my + 42), (bx, by)]), 2.2, tint="#FFEFF4", shadow=False))
    c.add(pearl_string(c, smooth([(130, 232), (150, 268), tops[0]]), 3.2))
    c.add(pearl_string(c, smooth([(410, 232), (390, 268), tops[-1]]), 3.2))
    kinds = ("rubis", "emeraude", "saphir", "amethyste", "topaze")
    for k, a in enumerate((-64, -32, 0, 32, 64, -100, 100, -132, 132, -160, 160)):
        ax, ay = anchor(a)
        L = 14 if abs(a) <= 64 else 22
        if abs(a) > 64:
            ax, ay = anchor(a, 16)
            c.add(f'<line x1="{f(ax)}" y1="{f(ay)}" x2="{f(ax)}" y2="{f(ay + L)}" stroke="#C9A24A" stroke-width="1.1"/>')
            c.add(pearl(c, ax, ay + L * 0.5, 2.8))
            c.add(pearl(c, ax, ay + L + 3, 4.4))
            c.add(gem(ax, ay + L + 15, 6, kinds[k % 5], 0, 8, 1.25, sparkle_=k % 3 == 0))
        c.add(cabochon(c, ax, ay, 5.6, 5.6, "diamant", GOLD))
    for k, x in enumerate((90, 450)):
        c.add(f'<g style="mix-blend-mode:screen">{halo(c, f"cfh{k}", x, 150, 120, 90, "#FFE2A0", 0.55)}</g>')
        c.add(godrays(c, f"cfg{k}", x, 158, [-40, -24, -10, 4, 18, 34], 150, 8, "#FFF0C0", 0.45, 5, 3 + k))
    c.add(coffret(c, 90, 246, 164, 82, 92, 18, "cf1", GOLD, TEAL_VELVET, 3, True, True, False, rosewood=True))
    c.add(coffret(c, 450, 246, 164, 82, 92, 18, "cf2", GOLD, ROSE_VELVET, 6, True, True, False))
    rnd = random.Random(12)
    for x, y in ((166, 258), (178, 280), (372, 260), (362, 282), (150, 300)):
        c.add(coin_use(c, x + rnd.uniform(-3, 3), y, rnd.uniform(8, 10), rnd.uniform(0.5, 1), rnd.uniform(-50, 50)))
    for x, y, r in ((60, 96, 8), (128, 120, 6), (480, 100, 8), (418, 128, 6)):
        c.add(glint(x, y, r, "#FFFFFF", 0.95))
    c.add(emblem(c, 270, 136, 54, "Coffret", halo_op=0.5))
    c.add(pearl_string(c, smooth([(200, 196), (232, 214), (270, 220), (308, 214), (340, 196)]), 3.0))
    c.add(gem(270, 222, 9, "emeraude", 0, 8, 1.0))
    c.add(dust(14, 70, (10, 10, 530, 950), ("#FFFFFF", "#FFE7C8"), 0.4, 1.5))
    mee_meo(c, "cotes", "mee-wow", "meo-yo")
    c.add(pearl_string(c, smooth([(118, 690), (70, 760), (44, 840), (60, 912), (110, 930)]), 3.4))
    c.add(pearl_string(c, smooth([(422, 690), (470, 760), (496, 840), (480, 912), (430, 930)]), 3.4))
    c.add(pearl_string(c, smooth([(90, 742), (52, 800), (36, 880)]), 2.4, tint="#FFEFF4"))
    c.add(pearl_string(c, smooth([(450, 742), (488, 800), (504, 880)]), 2.4, tint="#FFEFF4"))
    for x, y, r, kind in ((40, 930, 8, "rubis"), (500, 928, 8, "emeraude"), (72, 900, 6, "saphir"), (470, 900, 6, "amethyste")):
        c.add(gem(x, y, r, kind, 15, 8, 0.7))
    for x, y in ((24, 900), (516, 900), (88, 944), (452, 944)):
        c.add(coin_use(c, x, y, 10, 0.45, 20))
    c.add(f'<ellipse cx="270" cy="834" rx="196" ry="80" fill="#000000" opacity="0.55" transform="translate(0 6)" filter="{soft(c, 8)}"/>')
    c.add(f'<ellipse cx="270" cy="834" rx="196" ry="80" fill="#04201E" opacity="0.92"/>')
    c.add(gold_frame(c, ellipse_path(270, 834, 196, 80), "plf", GOLD_RICH, 6))
    c.add(pearl_string(c, closed_smooth([(270 + 184 * math.cos(math.radians(a)), 834 + 68 * math.sin(math.radians(a))) for a in range(0, 360, 6)], 0.5), 2.4, shadow=False))
    c.add(inscription(c, "Coffret", None, y=770, ink="#FFF6E6", accent="#F2C46A", title_size=40))
    save(c, "coffret", "Coffret", "b", "Les coffrets de perles",
         "Deux coffrets de bois précieux marquetés de nacre, ouverts de part et d'autre de la Meesh, débordent de Meeshes et de gemmes et laissent "
         "ruisseler leurs rangs de perles le long d'un médaillon d'or serti de cabochons, jusqu'au pied du cartouche, sur un velours de soie damassée vert d'eau.",
         "cotes", None)


# =============================================================== COFFRE

def steel_wall(card, key, seams=(135, 270, 405), m=DARKSTEEL, bands=3):
    out = [brushed(card, full_rect(), key, m, 0, 0, 1, 0.3 if bands > 1 else 0.05, bands, "0.002 0.8", 7, 0.4 if bands > 1 else 0.3)]
    for x in seams:
        out.append(f'<line x1="{x}" y1="0" x2="{x}" y2="{H}" stroke="#0A0D12" stroke-width="2.4" opacity="0.8"/>'
                   f'<line x1="{x + 1.6}" y1="0" x2="{x + 1.6}" y2="{H}" stroke="#FFFFFF" stroke-width="0.8" opacity="0.25"/>')
        out.append(rivet_row(card, [(x - 9, y) for y in range(30, H, 46)] + [(x + 10, y) for y in range(30, H, 46)], 2.6, m, key + "-rv"))
    return "".join(out)


def coffre_a():
    c = start("ka", "#3A2C1C", "#100B06", "#FFD08A", 0.3)
    cx, cy, R = 270, 486, 206
    win = circle_path(cx, cy, R)
    with masked(c, win, "w"):
        c.add(steel_wall(c, "wall", (90, 450), ("#7E8A98", "#343C48", "#0A0D12"), 1))
        floor = "M0 760 L540 760 L540 960 L0 960 Z"
        c.add(f'<path d="{floor}" fill="{lg(c, "fl", [(0, "#2A3038"), (1, "#07090C")])}"/>')
        c.add(f'<line x1="0" y1="760" x2="540" y2="760" stroke="#9AA6B4" stroke-width="1" opacity="0.5"/>')
        vg = rg(c, "vig", [(0.4, "#000000", 0), (1, "#000000", 0.82)], 0.5, 0.5, 0.75)
        c.add(f'<rect width="{W}" height="{H}" fill="{vg}"/>')
        c.add(f'<g style="mix-blend-mode:screen">{halo(c, "spill", cx, cy, 360, 360, "#FFB84A", 0.75, 0.45)}</g>')
        c.add(godrays(c, "gods", cx, cy, list(range(-175, 185, 12)), 640, 4, "#FFE2A8", 0.55, 12, 7))
        c.add(godrays(c, "gods2", cx, cy, list(range(-169, 185, 24)), 560, 2, "#FFFFFF", 0.35, 5, 9))
        c.add(halo(c, "floorlight", cx, 790, 280, 50, "#FFC266", 0.55))
    c.add(grade(c, win, "#FFC266", 0.5, 0.5, 0.3, 0.8, "gr"))
    c.add(window_depth(c, win, 0.6, 30, 12))
    # la couronne d'acier de l'embrasure
    ring = circle_path(cx, cy, R + 42) + " " + circle_path(cx, cy, R)
    bv = bevel(c, "rbv", 2.0, 4.0, 1.0, 26, shadow=(0, 8, 10, 0.7))
    c.add(f'<g filter="{bv}"><path d="{ring}" fill-rule="evenodd" fill="{metal_lin(c, "ring", STEEL, 0, 0, 1, 1, 3)}"/></g>')
    c.add(lathe(cx, cy, R + 4, R + 40, 2.6, "#FFFFFF", 0.12))
    c.add(f'<circle cx="{cx}" cy="{cy}" r="{R + 21}" fill="none" stroke="#2A3038" stroke-width="1.4" opacity="0.7"/>')
    for k in range(18):
        a = k * 20 + 10
        x, y = pt(cx, cy, R + 21, a)
        hg = rg(c, "sock", [(0, "#000000"), (0.7, "#1A1E24"), (1, "#8A96A6")], 0.5, 0.5, 0.5)
        c.add(f'<circle cx="{f(x)}" cy="{f(y)}" r="8.5" fill="{hg}"/><circle cx="{f(x)}" cy="{f(y)}" r="8.5" fill="none" stroke="#FFFFFF" stroke-width="0.7" opacity="0.5"/>')
    c.add(f'<circle cx="{cx}" cy="{cy}" r="{R + 1}" fill="none" stroke="#FFD68A" stroke-width="2.2" opacity="0.9"/>')
    # la porte, grande ouverte
    from mecanique import open_vault_door
    c.add(open_vault_door(c, 470, cy, 236, 0.28, 40, "door", STEEL, 10))
    hm = cyl_grad(c, "hinge", CHROME)
    c.add(f'<rect x="500" y="{cy - 150}" width="22" height="60" rx="6" fill="{hm}"/><rect x="500" y="{cy + 90}" width="22" height="60" rx="6" fill="{hm}"/>')
    # l'or sur le seuil
    refl = lg(c, "refl", [(0, "#FFD68A", 0.45), (1, "#FFD68A", 0)])
    c.add(f'<ellipse cx="{cx}" cy="800" rx="200" ry="34" fill="{refl}" filter="{soft(c, 10)}" style="mix-blend-mode:screen"/>')
    c.add(dust(15, 90, (10, 10, 530, 940), ("#FFE7A0", "#FFFFFF"), 0.4, 1.7))
    # l'emblème, serti dans l'acier
    c.add(f'<g filter="{bv}"><circle cx="270" cy="128" r="70" fill="{metal_lin(c, "eb", STEEL, 0, 0, 1, 1, 2)}"/></g>')
    c.add(lathe(270, 128, 58, 70, 2.4, "#FFFFFF", 0.14))
    c.add(rivet_row(c, [pt(270, 128, 64, a) for a in range(0, 360, 30)], 2.4, STEEL, "erv"))
    c.add(emblem(c, 270, 128, 54, "Coffre", halo_op=0.45))
    mee_meo(c, "pied", "mee-wow", "meo-muscles")
    c.add(steel_plate(c, 96, 750, 444, 910, "pl"))
    c.add(engraved_inscription(c, "Coffre", "On l'a fait ensemble", y=752))
    save(c, "coffre", "Coffre", "a", "La chambre forte",
         "Le cadre est l'embrasure d'une chambre forte moderne : couronne d'acier tourné percée des logements des pênes, porte ronde grande ouverte "
         "— pênes chromés, volant, roues dentées sous la vitre — et la lumière dorée du coffre qui jaillit en faisceaux sur l'acier brossé et le seuil.",
         "pied", "On l'a fait ensemble")


def coffre_b():
    from mecanique import gear, massive_bolt, guide_block, bar_v, rod, spider_wheel
    c = start("kb", "#2A2C30", "#0C0E12", "#FFD9A0", 0.26)
    win = rrect(90, 280, 450, 722, 16)
    with masked(c, win, "w"):
        c.add(brushed(c, full_rect(), "door", ("#AEB8C4", "#4E5866", "#14181E"), 0, 0, 1, 0.6, 2, "0.003 0.6", 5, 0.3))
        c.add(lathe(270, 150, 20, 620, 2.6, "#FFFFFF", 0.06))
        vg = rg(c, "vig", [(0.35, "#000000", 0), (1, "#000000", 0.7)], 0.5, 0.42, 0.85)
        c.add(f'<rect width="{W}" height="{H}" fill="{vg}"/>')
        c.add(f'<path d="{rrect(76, 266, 464, 736, 24)}" fill="none" stroke="#FFC266" stroke-width="30" opacity="0.55" filter="{soft(c, 16)}"/>')
        # le train d'engrenages derrière le cadran
        c.add(gear(c, 112, 126, 64, 18, "g1", BRASS, 6))
        c.add(gear(c, 428, 126, 64, 18, "g2", BRASS, -4))
        c.add(gear(c, 40, 226, 30, 10, "g3", BRASS, 12, holes=0))
        c.add(gear(c, 500, 226, 30, 10, "g4", BRASS, -8, holes=0))
        c.add(gear(c, 270, 150, 112, 34, "g0", BRASS, 3))
        # les bielles qui tirent les barres de pênes
        c.add(rod(c, (148, 160), (62, 300), 9, "rd1"))
        c.add(rod(c, (392, 160), (478, 300), 9, "rd2"))
        # barres de pênes et pênes massifs, rentrés : la serrure vient de s'ouvrir
        c.add(bar_v(c, 66, 296, 712, 18, "bl"))
        c.add(bar_v(c, 474, 296, 712, 18, "br"))
        for y in (330, 425, 520, 615, 700):
            c.add(massive_bolt(c, 66, y, 72, 18, "pnl", "left"))
            c.add(massive_bolt(c, 474, y, 72, 18, "pnr", "right"))
            c.add(guide_block(c, 24, y, 24, 50, "gbl"))
            c.add(guide_block(c, 516, y, 24, 50, "gbr"))
        for y in (330, 425, 520, 615, 700):
            c.add(f'<circle cx="66" cy="{y}" r="6" fill="#1A1F26"/><circle cx="474" cy="{y}" r="6" fill="#1A1F26"/>')
        glass = lg(c, "glass", [(0, "#FFFFFF", 0.0), (0.42, "#FFFFFF", 0.0), (0.47, "#FFFFFF", 0.14), (0.5, "#FFFFFF", 0.04), (0.55, "#FFFFFF", 0.1), (0.6, "#FFFFFF", 0)], 0, 0, 1, 0.55)
        c.add(f'<rect width="{W}" height="{H}" fill="{glass}"/>')
    c.add(grade(c, win, "#FFC266", 0.5, 0.5, 0.14, 0.9, "gr"))
    c.add(window_depth(c, win, 0.55, 30, 12))
    bz = rrect(82, 272, 458, 730, 22) + " " + win
    bv = bevel(c, "bzbv", 1.6, 3.6, 1.0, 26, shadow=(0, 6, 8, 0.7))
    c.add(f'<g filter="{bv}"><path d="{bz}" fill-rule="evenodd" fill="{metal_lin(c, "bz", CHROME, 0, 0, 1, 1, 3)}"/></g>')
    c.add(f'<path d="{win}" fill="none" stroke="#FFD68A" stroke-width="2" opacity="0.9"/>')
    c.add(rivet_row(c, [(x, 262) for x in range(98, 450, 28)], 2.6, STEEL, "rv"))
    # le volant, le cadran, l'emblème
    c.add(spider_wheel(c, 270, 150, 132, 3, "sw", 0))
    c.add(dial_ring(c, 270, 150, 52, 86, "dl", CHROME))
    c.add(emblem(c, 270, 150, 50, "Coffre", halo_op=0.0, glints=True))
    c.add(glint(456, 276, 12, "#FFF2D0", 1))
    c.add(glint(84, 724, 9, "#FFF2D0", 0.9))
    c.add(dust(16, 40, (10, 260, 530, 760), ("#FFE7A0",), 0.4, 1.4))
    for hx, hy in ((24, 24), (516, 24), (24, 936), (516, 936)):
        c.add(hexbolt(c, hx, hy, 9, STEEL, "hbx"))
    mee_meo(c, "ruban", "mee-bravo", "meo-cool")
    c.add(steel_plate(c, 126, 760, 414, 892, "pl"))
    c.add(engraved_inscription(c, "Coffre", None, y=762, title_size=38))
    save(c, "coffre", "Coffre", "b", "Le cœur de la serrure",
         "Derrière la vitre de la porte, toute la mécanique d'une chambre forte : cadran à chiffres dont la Meesh est le bouton, volant chromé "
         "à trois poignées, roues dentées de laiton, bielles et barres de pênes — les dix pênes massifs viennent de rentrer, et la lumière filtre au bord.",
         "ruban", None)


VP = (270, 480)


def persp(x_in, y, x_out):
    """Projette un point du bord de la fenêtre (x_in, y) vers le bord avant (x_out) depuis le point de fuite."""
    k = (x_out - VP[0]) / (x_in - VP[0])
    return x_out, VP[1] + (y - VP[1]) * k


def leaf(card, side, key, x_in, y0, y1, x_out, m=STEEL):
    """Un battant blindé rabattu contre la paroi, en perspective : tôles, rivets et volant fuyants, pênes sortis."""
    s = 1 if side == "left" else -1
    a, b = persp(x_in, y0, x_out), persp(x_in, y1, x_out)
    face = poly([a, (x_in, y0), (x_in, y1), b])
    out = [brushed(card, face, key + "-f", m, 0, 0, 1, 0.1, 2, "0.002 0.8", 3, 0.3)]
    for t in [k / 6 for k in range(1, 6)]:
        y = y0 + (y1 - y0) * t
        p = persp(x_in, y, x_out)
        out.append(f'<line x1="{f(x_in)}" y1="{f(y)}" x2="{f(p[0])}" y2="{f(p[1])}" stroke="#0A0D12" stroke-width="1.8" opacity="0.7"/>'
                   f'<line x1="{f(x_in)}" y1="{f(y + 1.6)}" x2="{f(p[0])}" y2="{f(p[1] + 2.4)}" stroke="#FFFFFF" stroke-width="0.7" opacity="0.25"/>')
    for t in (0.18, 0.5, 0.82):
        xx = x_in + (x_out - x_in) * t
        ya = persp(x_in, y0, xx)[1]
        yb = persp(x_in, y1, xx)[1]
        out.append(f'<line x1="{f(xx)}" y1="{f(ya)}" x2="{f(xx)}" y2="{f(yb)}" stroke="#0A0D12" stroke-width="1.4" opacity="0.5"/>')
        rv = []
        for k in range(12):
            yy = ya + (yb - ya) * (k + 0.5) / 12
            rv.append((xx + s * 5, yy))
        out.append(rivet_row(card, rv, 1.6 + 2.2 * t, STEEL, key + "-rv"))
    wx = x_in + (x_out - x_in) * 0.48
    dark = lg(card, key + "-dk", [(0, "#000000", 0.75), (1, "#000000", 0.0)], 1 if side == "left" else 0, 0, 0 if side == "left" else 1, 0)
    out.append(f'<path d="{face}" fill="{dark}"/>')
    lit = lg(card, key + "-lit", [(0, "#FFC266", 0.85), (0.35, "#FFC266", 0.18), (1, "#FFC266", 0)], 1 if side == "left" else 0, 0, 0 if side == "left" else 1, 0)
    out.append(f'<path d="{face}" fill="{lit}" style="mix-blend-mode:screen"/>')
    hub = rg(card, key + "-hub", [(0, "#FFFFFF", 0.0), (0.6, "#000000", 0.0), (1, "#000000", 0.5)])
    out.append(f'<ellipse cx="{f(wx)}" cy="{VP[1]}" rx="{f(98 * 0.42)}" ry="98" fill="{metal_lin(card, key + "-plate", STEEL, 0, 0, 1, 1, 2)}" opacity="0.85"/>')
    out.append(f'<ellipse cx="{f(wx)}" cy="{VP[1]}" rx="{f(98 * 0.42)}" ry="98" fill="none" stroke="#0A0D12" stroke-width="2" opacity="0.7"/>')
    out.append(lathe(wx, VP[1], 10, 96, 4, "#FFFFFF", 0.12, 1).replace('rx=', 'data-x=') if False else "")
    from mecanique import spider_wheel, gear
    sq = f'translate({f(wx)} {VP[1]}) scale(0.42 1) translate({f(-wx)} {-VP[1]})'
    out.append(f'<g transform="{sq}">{gear(card, wx, VP[1], 62, 20, key + "-gr", BRASS, 5)}{spider_wheel(card, wx, VP[1], 92, 3, key + "-hw", 25)}</g>')
    for y in (300, 390, 480, 570, 660):
        out.append(bolt_h(card, x_in - s * 4, y, 22, 10, key + "-bl", CHROME, "right" if side == "left" else "left"))
    return "".join(out)


def coffre_c():
    c = start("kc", "#3A2A16", "#0C0804", "#FFE6B0", 0.26)
    x0, y0, x1, y1 = 96, 238, 444, 728
    win = rrect(x0, y0, x1, y1, 8)
    with masked(c, win, "w"):
        c.add(bg(c, "#06080C"))
        ceil = poly([persp(x0, y0, -40), persp(x1, y0, 580), (x1, y0), (x0, y0)])
        floor = poly([persp(x0, y1, -40), persp(x1, y1, 580), (x1, y1), (x0, y1)])
        c.add(brushed(c, ceil, "ceil", DARKSTEEL, 0, 0, 0, 1, 2, "0.6 0.002", 6, 0.3))
        c.add(f'<path d="{floor}" fill="{lg(c, "fl", [(0, "#4A3A24"), (0.25, "#1E1A16"), (1, "#050608")])}"/>')
        for k in range(-6, 7):
            xb = 270 + k * 70
            c.add(f'<line x1="{f(270 + k * 70 * (x1 - 270) / 270 * 0.92)}" y1="{y1}" x2="{f(xb * 1.9 - 270 * 0.9)}" y2="1000" stroke="#000000" stroke-width="1.6" opacity="0.6"/>')
        for yy in (760, 800, 856, 930):
            c.add(f'<line x1="0" y1="{yy}" x2="540" y2="{yy}" stroke="#000000" stroke-width="1.4" opacity="0.5"/>')
        for k in range(-4, 5):
            c.add(f'<line x1="{f(270 + k * 40)}" y1="{y0}" x2="{f(270 + k * 120)}" y2="0" stroke="#0A0D12" stroke-width="1.6" opacity="0.6"/>')
        c.add(leaf(c, "left", "lf", x0, y0, y1, -40))
        c.add(leaf(c, "right", "rf", x1, y0, y1, 580))
        c.add(godrays(c, "gods", 270, 480, list(range(-180, 180, 10)), 640, 5, "#FFC872", 0.6, 4, 9))
        c.add(f'<g style="mix-blend-mode:screen">{halo(c, "burst", 270, 484, 320, 380, "#FFB04A", 0.6, 0.3)}</g>')
        pool = rg(c, "pool", [(0, "#FFD68A", 0.7), (0.5, "#FFD68A", 0.18), (1, "#FFD68A", 0)])
        c.add(f'<ellipse cx="270" cy="760" rx="260" ry="70" fill="{pool}" style="mix-blend-mode:screen"/>')
        c.add(dust(17, 240, (0, 0, 540, 960), ("#FFE7A0", "#FFFFFF"), 0.4, 1.8, keep=False))
        rnd = random.Random(23)
        for k in range(48):
            a = rnd.uniform(0, 360)
            dist = rnd.uniform(250, 520)
            x, y = pt(270, 480, dist, a)
            if not (-10 < x < 550 and -10 < y < 970):
                continue
            r = 5 + (dist - 250) * 0.085
            if rnd.random() < 0.3:
                c.add(coin_on_edge(c, x, y, r, rnd.uniform(-60, 60)))
            else:
                c.add(coin_use(c, x, y, r, rnd.uniform(0.4, 1), rnd.uniform(-60, 60)))
    c.add(grade(c, win, "#FFE6B0", 0.5, 0.5, 0.16, 0.85, "gr"))
    c.add(window_depth(c, win, 0.35, 24, 10))
    c.add(f'<path d="{win}" fill="none" stroke="#FFF6DD" stroke-width="10" opacity="0.5" filter="{soft(c, 7)}"/>')
    c.add(f'<path d="{win}" fill="none" stroke="#FFFBEE" stroke-width="2.4"/>')
    for gx, gy, gr_ in ((x0, y0, 16), (x1, y0, 12), (x1, y1, 14), (x0, y1, 10)):
        c.add(glint(gx, gy, gr_, "#FFFFFF", 0.95))
    c.add(halo(c, "eh", 270, 118, 160, 120, "#FFE6A8", 0.45))
    c.add(emblem(c, 270, 120, 56, "Coffre", halo_op=0.0))
    mee_meo(c, "perches", "mee-danse", "meo-trophee")
    c.add(text_panel(c, 92, 772, 448, 904, 20, "#0A0C10", 0.82, None, 1.6, "tp"))
    c.add(gold_frame(c, rrect(92, 772, 448, 904, 20), "pf", CHROME, 3))
    c.add(inscription(c, "Coffre", None, y=778, ink="#FFF4D8", accent="#FFC266", title_size=40))
    save(c, "coffre", "Coffre", "c", "La porte entrouverte",
         "On entre dans la chambre forte : les deux battants blindés sont rabattus contre les parois, pênes encore sortis, et la lumière d'or "
         "jaillit du fond, ruisselle sur le sol et emporte des Meeshes vers nous.",
         "perches", None)


FRAMES = {
    "coffret-a": coffret_a,
    "coffret-b": coffret_b,
    "coffre-a": coffre_a,
    "coffre-b": coffre_b,
    "coffre-c": coffre_c,
}
