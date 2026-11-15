"""Abysses - Ambassadeur V..I : le rang où l'on choisit son atmosphère. Métal or, du lagon à l'Atlantide."""

import math
import random

from common import *  # noqa: F401,F403
from common import _ENTRIES  # noqa: F401
from sea import place, jellyfish, manta, whale, school, seahorse, ctenophore, turtle, moorish_idol
from reef import coral, seafan, anemone, kelp, seagrass, scallop, starfish, mix
from kit import resample, normals
from shells import nautilus_cut, nautilus_shell
from afrique import chain_band, rosette, stud, lotus, dhow_below, dhow, cowrie

TEAK = ("#A8703E", "#6E4020", "#36190A")


# ---------------------------------------------------------------- motifs propres aux Ambassadeurs

def reef_fish(card, cx, cy, s=1.0, body="#FF9A3C", stripe="#FFFFFF", flip=False, rot=0):
    g = card.grad("rf-" + body.strip("#"), [(0, mix(body, "#FFFFFF", 0.35)), (1, mix(body, "#000000", 0.25))])
    d = "M14 0 C10 -9 -4 -10 -10 -3 L-18 -9 L-16 0 L-18 9 L-10 3 C-4 10 10 9 14 0 Z"
    st = "".join(f'<path d="M{x} -8 Q{x + 2} 0 {x} 8" fill="none" stroke="{stripe}" stroke-width="2.2" opacity="0.9"/>' for x in (-3, 5))
    fin = '<path d="M-2 -8 Q4 -15 9 -7" fill="{c}" opacity="0.8"/>'.replace("{c}", mix(body, "#000000", 0.2))
    eye = '<circle cx="9" cy="-2" r="1.6" fill="#0A0A12"/><circle cx="8.6" cy="-2.4" r="0.5" fill="#FFFFFF"/>'
    sc = f"scale({f(-s)} {f(s)})" if flip else f"scale({f(s)})"
    return f'<g transform="translate({f(cx)} {f(cy)}) rotate({f(rot)}) {sc}">{fin}<path d="{d}" fill="{g}"/>{st}{eye}</g>'


def tube_sponges(card, x, y, s=1.0, col="#8E4FD8", n=4, seed=1):
    rnd = random.Random(seed)
    g = card.grad("tube-" + col.strip("#"), [(0, mix(col, "#FFFFFF", 0.3)), (0.5, col), (1, mix(col, "#000000", 0.45))], 0, 0, 1, 0)
    out = []
    for i in range(n):
        h = rnd.uniform(40, 90) * s
        w = rnd.uniform(11, 16) * s
        xx = x + (i - n / 2) * 13 * s + rnd.uniform(-3, 3)
        a = rnd.uniform(-14, 14)
        out.append(f'<g transform="rotate({f(a)} {f(xx)} {f(y)})"><rect x="{f(xx - w / 2)}" y="{f(y - h)}" width="{f(w)}" height="{f(h)}" rx="{f(w / 2)}" fill="{g}"/>'
                   f'<ellipse cx="{f(xx)}" cy="{f(y - h + 3 * s)}" rx="{f(w / 2)}" ry="{f(w * 0.22)}" fill="#1A0630"/>'
                   f'<ellipse cx="{f(xx)}" cy="{f(y - h + 3 * s)}" rx="{f(w / 2)}" ry="{f(w * 0.22)}" fill="none" stroke="{mix(col, "#FFFFFF", 0.5)}" stroke-width="1"/></g>')
    return "".join(out)


def brain_coral(card, cx, cy, r, col="#C9A04A", seed=2):
    rnd = random.Random(seed)
    g = card.rgrad("brain-" + col.strip("#"), [(0, mix(col, "#FFFFFF", 0.4), 1), (0.7, col, 1), (1, mix(col, "#000000", 0.5), 1)], 0.45, 0.3, 0.75)
    clipid = card.id(f"bc{cx}{cy}")
    d = f"M{f(cx - r)} {f(cy)} A{f(r)} {f(r * 0.75)} 0 0 1 {f(cx + r)} {f(cy)} Z"
    card.def_once(f"bc{cx}{cy}", f'<clipPath id="{clipid}"><path d="{d}"/></clipPath>')
    maze = []
    for k in range(9):
        pts = [(cx - r + 2 * r * i / 20, cy - r * 0.75 + k * r * 0.1 + 3 * math.sin(i * 1.3 + k + rnd.random())) for i in range(21)]
        maze.append(f'<path d="{smooth(pts, False, 3)}" fill="none" stroke="{mix(col, "#000000", 0.45)}" stroke-width="1.3" opacity="0.7"/>')
    return f'<path d="{d}" fill="{g}"/><g clip-path="url(#{clipid})">{"".join(maze)}</g>'


def soft_coral(card, x, y, s, col="#FF6FA8", seed=3):
    """Corail mou en touffe : des grappes de polypes au bout de tiges charnues."""
    rnd = random.Random(seed)
    out = []
    for i in range(7):
        a = -60 + 120 * i / 6 + rnd.uniform(-8, 8)
        L = rnd.uniform(28, 46) * s
        x1, y1 = pt(x, y, L, a)
        out.append(f'<path d="M{f(x)} {f(y)} Q{f(pt(x, y, L * 0.5, a - 12)[0])} {f(pt(x, y, L * 0.5, a - 12)[1])} {f(x1)} {f(y1)}" stroke="{mix(col, "#000000", 0.2)}" stroke-width="{f(5 * s)}" stroke-linecap="round" fill="none"/>')
        for k in range(6):
            px, py = x1 + rnd.gauss(0, 5 * s), y1 + rnd.gauss(0, 5 * s)
            out.append(f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(rnd.uniform(2.2, 3.8) * s)}" fill="{mix(col, "#FFFFFF", rnd.uniform(0, 0.4))}"/>')
    return "".join(out)


def reef_side(card, side, seed, base_y=960, top=520, front=False):
    """Un massif de récif sur un côté (side=-1 gauche, 1 droite)."""
    rnd = random.Random(seed)
    x0 = 0 if side < 0 else W
    out = []
    if not front:
        out.append(seafan(seed, x0 - side * 34, base_y - 170, base_y - top - 160, 170, "#D23A5E", 0.75, side * -8, 1.3))
        out.append(seafan(seed + 1, x0 - side * 70, base_y - 120, 220, 130, "#F2A23A", 0.6, side * -20, 1.1))
        out.append(coral(seed + 2, x0 - side * 28, base_y - 110, 86, -side * 18, 11, 5, "#FF7A6B", "#FFE0D2", 26))
        out.append(coral(seed + 3, x0 - side * 66, base_y - 70, 70, -side * 30, 9, 4, "#F25C8C", "#FFD3E4", 30))
        out.append(tube_sponges(card, x0 - side * 18, base_y - 60, 1.1, "#8E4FD8", 4, seed))
    else:
        out.append(brain_coral(card, x0 - side * 40, base_y - 4, 46, "#C9A04A", seed))
        out.append(soft_coral(card, x0 - side * 74, base_y - 30, 1.1, "#FF6FA8", seed))
        out.append(anemone(card, f"an{seed}", x0 - side * 30, base_y - 40, 1.0, "#9A2E86", "#FF8AD8", "#BFFBFF", 24, seed))
    return "".join(out)


def table_coral(card, cx, cy, rx, col="#E8A04A"):
    g = card.rgrad("tab-" + col.strip("#"), [(0, mix(col, "#FFFFFF", 0.35), 1), (0.7, col, 1), (1, mix(col, "#000000", 0.4), 1)], 0.5, 0.3, 0.7)
    out = [f'<path d="M{f(cx - 5)} {f(cy + 40)} L{f(cx - 3)} {f(cy)} L{f(cx + 3)} {f(cy)} L{f(cx + 5)} {f(cy + 40)} Z" fill="{mix(col, "#000000", 0.45)}"/>']
    for k, s in enumerate((1.0, 0.82, 0.6)):
        out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy - k * 4)}" rx="{f(rx * s)}" ry="{f(rx * s * 0.22)}" fill="{g}" stroke="{mix(col, "#FFFFFF", 0.5)}" stroke-width="0.8"/>')
    return "".join(out)


def reef_wall(card, side, seed):
    """Un mur de récif dense, du fond jusqu'à mi-hauteur, sur un côté (side=-1 gauche, 1 droite)."""
    x0 = 0 if side < 0 else W
    X = lambda d: x0 - side * d
    back = [
        seafan(seed, X(30), 760, 330, 150, mix("#D23A5E", "#0B4A7A", 0.35), 0.8, side * -10, 1.4),
        seafan(seed + 1, X(54), 960, 300, 140, mix("#F2A23A", "#0B4A7A", 0.35), 0.75, side * -14, 1.3),
    ]
    mid = [
        coral(seed + 2, X(8), 960, 120, -side * 22, 15, 5, "#FF7A6B", "#FFE0D2", 28),
        coral(seed + 3, X(16), 820, 96, -side * 38, 12, 5, "#FF5C9A", "#FFD3E4", 30),
        coral(seed + 4, X(6), 640, 84, -side * 34, 11, 4, "#FF9A3C", "#FFE7C2", 28),
        coral(seed + 5, X(12), 520, 70, -side * 30, 9, 4, "#B05CFF", "#F0D8FF", 30),
        table_coral(card, X(46), 700, 42, "#E8A04A"),
        table_coral(card, X(36), 560, 32, "#5CC8B0"),
        brain_coral(card, X(30), 900, 40, "#C9A04A", seed),
        tube_sponges(card, X(30), 790, 0.9, "#8E4FD8", 4, seed),
        soft_coral(card, X(40), 610, 0.9, "#FF6FA8", seed),
        anemone(card, f"an{seed}a", X(34), 470, 0.75, "#9A2E86", "#FF8AD8", "#BFFBFF", 20, seed),
        anemone(card, f"an{seed}b", X(52), 870, 0.95, "#2E6A9A", "#7FF6FF", "#FFFFFF", 22, seed + 1),
    ]
    return f'<g opacity="0.9">{"".join(back)}</g>' + "".join(mid)


def gold_scallop_small(card, name, x, y, R, rot=0):
    return f'<g transform="rotate({f(rot)} {f(x)} {f(y)})">{scallop(card, name, x, y, R, GOLD, 13, 70)}</g>'


# ---------------------------------------------------------------- Ambassadeur V : les hippocampes d'or

def amb5():
    c = start("a5")
    win = rrect(84, 252, 456, 724, 30)
    parts = [
        water(c, [(0, "#2CCAD2"), (0.22, "#1192AC"), (0.55, "#0A5279"), (1, "#05223B")]),
        radial(c, "sun", 270, -60, 420, 330, "#EFFFFF", 0.55),
        shafts(c, "sh", 270, -420, 0, 860, 11, 5, spread=30, op=(0.08, 0.26)),
        caustic_band(c, "ca", 0, 300, op=0.7),
        surface(c, "sf", 22, "#DFFFFF", 4, 5, 0.85),
        f'<g opacity="0.45" filter="{blur(c, "hz", 2.5)}">{reef_side(c, -1, 11, 900, 640)}{reef_side(c, 1, 21, 900, 640)}</g>',
        f'<rect width="{W}" height="{H}" fill="{c.grad("haze", [(0, "#0A5279"), (1, "#0A5279")])}" opacity="0.25"/>',
        sand(c, "sand", 872),
        school(c, 8, lambda t: (-10 + 110 * t, 470 + 180 * t), 40, 9, (0.8, 1.2)),
        school(c, 9, lambda t: (550 - 110 * t, 420 + 200 * t), 40, 9, (0.8, 1.2)),
        bubble_column(c, 3, 46, 850, 290, 16, 1.5, 5.5),
        bubble_column(c, 8, 496, 840, 320, 14, 1.5, 5),
        marine_snow(4, 150),
    ]
    deco(c, win, parts)
    c.add(starfish(52, 926, 22, "#F2894E", 12), starfish(496, 912, 16, "#E8566A", -20, "#FFD0D8"))
    c.add(gold_scallop_small(c, "sc1", 120, 942, 30, -14), gold_scallop_small(c, "sc2", 432, 944, 26, 12))
    c.add(seagrass(5, 0, 70, 900, 70, "#2E8C6E", 18), seagrass(6, 470, 540, 896, 70, "#2E8C6E", 18))
    window_finish(c, win, GOLD, 6, tint="#BFFBFF", tint_op=0.18)
    for (x, y) in ((84, 252), (456, 252), (84, 724), (456, 724)):
        c.add(pearl(c, x + (10 if x < 270 else -10), y + (10 if y < 400 else -10), 7, "neutral"))
    c.add(pearl_string(c, 214, 204, 96, 270, 34, 4.2))
    c.add(pearl_string(c, 326, 204, 444, 270, 34, 4.2))
    c.add(place(seahorse(c, "hs1"), 168, 150, 1.32, 4, flip=True), place(seahorse(c, "hs2"), 372, 150, 1.32, -4))
    c.add(halo(c, "hs-glow", 270, 150, 190, "#FFF4C2", 0.35))
    crest_block(c, 270, 140, 0.86, "gold", 5)
    mee_meo(c, "pied", "mee-coucou", "meo-salut")
    inscription(c, "Ambassadeur V", style="nacre")
    c.add(outer_frame(c, GOLD, 10, 3.5, 24, "of"))
    save(c, "ambassadeur-5")
    register("ambassadeur-5", "ambassadeur", 5, "V", "Les Hippocampes d'or",
             "Deux hippocampes d'or, tenants héraldiques, gardent le blason au-dessus d'un lagon turquoise où dansent les caustiques ; "
             "des rangs de perles relient l'écu à la photo, le sable est semé d'étoiles de mer et de coquilles Saint-Jacques dorées.",
             "pied : Mee (coucou) et Meo (salut) sur le sable", None)


# ---------------------------------------------------------------- Ambassadeur IV : le jardin de corail

def amb4():
    c = start("a4")
    win = arch(84, 456, 252, 724, 24, 130)
    fish_arc = lambda t: (30 + 480 * t, 330 - 250 * math.sin(math.pi * t))
    parts = [
        water(c, [(0, "#16A9C4"), (0.3, "#0B6E96"), (0.66, "#073E66"), (1, "#031B33")]),
        radial(c, "sun", 270, -80, 400, 300, "#E6FFFF", 0.5),
        shafts(c, "sh", 290, -380, 0, 900, 12, 7, spread=34, op=(0.08, 0.24)),
        caustic_band(c, "ca", 0, 260, op=0.6, seed=6),
        surface(c, "sf", 18, "#D2FFFF", 6, 4, 0.8),
        school(c, 12, fish_arc, 220, 14, (0.9, 1.6)),
        f'<g opacity="0.45" filter="{blur(c, "hz", 2.2)}">{reef_side(c, -1, 31, 760, 420)}{reef_side(c, 1, 41, 760, 440)}</g>',
        reef_wall(c, -1, 3),
        reef_wall(c, 1, 17),
        marine_snow(9, 140),
    ]
    deco(c, win, parts)
    c.add(reef_fish(c, 50, 400, 1.2, "#FF9A3C", "#FFFFFF", False, -8), reef_fish(c, 492, 372, 1.1, "#FFD23C", "#2A4BFF", True, 6),
          reef_fish(c, 30, 560, 0.9, "#3C8DFF", "#FFE14A", False, 4), reef_fish(c, 510, 600, 1.0, "#FF5A7A", "#FFFFFF", True, -10))
    window_finish(c, win, GOLD, 6, tint="#BFFBFF", tint_op=0.16)
    c.add(coral(71, 92, 732, 54, 24, 8, 3, "#FF7A6B", "#FFE0D2", 30), coral(72, 448, 732, 50, -24, 8, 3, "#FF5C9A", "#FFD3E4", 30))
    c.add(reef_side(c, -1, 5, 968, 600, front=True), reef_side(c, 1, 9, 968, 600, front=True))
    c.add(bubble_column(c, 14, 470, 700, 300, 12, 1.4, 4.5), bubble_column(c, 15, 66, 690, 330, 10, 1.3, 4))
    crest_block(c, 270, 140, 0.86, "gold", 4, halo_col="#FFFFFF", halo_op=0.4)
    inscription(c, "Ambassadeur IV", "Le voyage continue", style="nacre")
    mee_meo(c, "ruban", "mee-sourire", "meo-cool")
    c.add(outer_frame(c, GOLD, 10, 3.5, 24, "of"))
    save(c, "ambassadeur-4")
    register("ambassadeur-4", "ambassadeur", 4, "IV", "Le Jardin de corail",
             "La photo s'ouvre dans une arche au cœur d'un récif : murs de gorgones, coraux cornes-de-cerf, coraux tabulaires, éponges-tubes, "
             "corail cerveau et anémones aux pointes luminescentes ; un banc de poissons d'argent trace une auréole au-dessus du blason.",
             "ruban : Mee (sourire) et Meo (cool) posés sur la plaque", "Le voyage continue")


# ---------------------------------------------------------------- Ambassadeur III : la porte de Zanzibar (Afrique)

def teak(card):
    return card.grad("teak", [(0, TEAK[0]), (0.5, TEAK[1]), (1, TEAK[2])], 0, 0, 1, 0)


def carved(card, markup):
    return f'<g filter="{bevel(card, "carve", 0.8, 2.2, 1.5, 1.5, 0.55)}">{markup}</g>'


def swahili_door(card, cx=270, cy=246, R=212, jw=40, y_bot=752):
    """Porte sculptée de la côte swahilie : imposte en demi-lune (éventail d'or, rosaces, dents de scie, chaîne de clous),
    linteau dentelé, jambages à chaîne sculptée et clous de laiton, socles au lotus."""
    hi, mid, lo = GOLD
    g = teak(card)
    gold = metal_grad(card, "dg", GOLD)
    xl, xr = 84 - jw, 456
    out = []
    tym = f"M{f(cx - R)} {f(cy)} A{f(R)} {f(R)} 0 0 1 {f(cx + R)} {f(cy)} Z"
    out.append(f'<path d="{tym}" fill="{g}"/>')
    out.append(f'<path d="{tym}" fill="{card.rgrad("tymsh", [(0.45, "#000000", 0), (1, "#000000", 0.5)], 0.5, 1, 1)}"/>')
    bands = []
    for k in range(26):
        a0, a1 = -90 + 180 * k / 26, -90 + 180 * (k + 1) / 26
        am = (a0 + a1) / 2
        x, y = pt(cx, cy, R - 11, am)
        bands.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="4.6" ry="10" fill="none" stroke="{gold}" stroke-width="2.2" transform="rotate({f(am + 90)} {f(x)} {f(y)})"/>')
    bands.append(f'<path d="M{f(cx - R + 3)} {f(cy)} A{f(R - 3)} {f(R - 3)} 0 0 1 {f(cx + R - 3)} {f(cy)}" fill="none" stroke="{gold}" stroke-width="3"/>')
    bands.append(f'<path d="M{f(cx - R + 22)} {f(cy)} A{f(R - 22)} {f(R - 22)} 0 0 1 {f(cx + R - 22)} {f(cy)}" fill="none" stroke="{gold}" stroke-width="2"/>')
    for k in range(13):
        a = -82 + 164 * k / 12
        x, y = pt(cx, cy, R - 36, a)
        bands.append(rosette(x, y, 9, mid, lo))
    bands.append(f'<path d="M{f(cx - R + 50)} {f(cy)} A{f(R - 50)} {f(R - 50)} 0 0 1 {f(cx + R - 50)} {f(cy)}" fill="none" stroke="{gold}" stroke-width="2"/>')
    rr = R - 58
    bands.append("".join(
        f'<path d="M{f(pt(cx, cy, rr, a)[0])} {f(pt(cx, cy, rr, a)[1])} L{f(pt(cx, cy, rr - 9, a + 3.5)[0])} {f(pt(cx, cy, rr - 9, a + 3.5)[1])} L{f(pt(cx, cy, rr, a + 7)[0])} {f(pt(cx, cy, rr, a + 7)[1])}" fill="none" stroke="{gold}" stroke-width="1.6"/>'
        for a in range(-90, 90, 7)))
    for k in range(17):
        a = -80 + 160 * k / 16
        x1, y1 = pt(cx, cy, 44, a)
        x2, y2 = pt(cx, cy, rr - 14, a)
        c1 = pt(cx, cy, (rr - 14) * 0.6, a - 4.5)
        c2 = pt(cx, cy, (rr - 14) * 0.6, a + 4.5)
        bands.append(f'<path d="M{f(x1)} {f(y1)} Q{f(c1[0])} {f(c1[1])} {f(x2)} {f(y2)} Q{f(c2[0])} {f(c2[1])} {f(x1)} {f(y1)} Z" fill="{gold}" opacity="0.88"/>')
    bands.append(f'<path d="M{f(cx - 46)} {f(cy)} A46 46 0 0 1 {f(cx + 46)} {f(cy)} Z" fill="{gold}"/>')
    out.append(carved(card, "".join(bands)))
    for k in range(9):
        a = -80 + 160 * k / 8
        x, y = pt(cx, cy, R - 23, a + 10)
        out.append(stud(card, x, y, 3.2))
    out.append(f'<rect x="{f(xl)}" y="{f(cy - 6)}" width="{f(xr + jw - xl)}" height="26" fill="{g}"/>')
    lint = [f'<rect x="{f(xl)}" y="{f(cy - 6)}" width="{f(xr + jw - xl)}" height="26" fill="none" stroke="{gold}" stroke-width="2"/>']
    lint.append("".join(f'<path d="M{x} {f(cy + 15)} L{x + 7} {f(cy - 1)} L{x + 14} {f(cy + 15)}" fill="none" stroke="{gold}" stroke-width="1.6"/>' for x in range(int(xl) + 6, int(xr + jw) - 10, 14)))
    out.append(carved(card, "".join(lint)))
    for x0 in (xl, xr):
        out.append(f'<rect x="{f(x0)}" y="{f(cy + 20)}" width="{f(jw)}" height="{f(y_bot - cy - 20)}" fill="{g}"/>')
        j = [f'<rect x="{f(x0 + 2)}" y="{f(cy + 22)}" width="{f(jw - 4)}" height="{f(y_bot - cy - 24)}" fill="none" stroke="{gold}" stroke-width="1.6"/>',
             f'<line x1="{f(x0 + jw * 0.72)}" y1="{f(cy + 26)}" x2="{f(x0 + jw * 0.72)}" y2="{f(y_bot - 54)}" stroke="{gold}" stroke-width="1.2" opacity="0.8"/>',
             chain_band(x0 + jw * 0.36, cy + 28, y_bot - 54, 18, gold, TEAK[2], 17)]
        out.append(carved(card, "".join(j)))
        for k in range(12):
            out.append(stud(card, x0 + jw * 0.86, cy + 40 + k * 34, 3.4))
        out.append(f'<rect x="{f(x0)}" y="{f(y_bot - 52)}" width="{f(jw)}" height="52" fill="{g}"/>')
        out.append(carved(card, lotus(x0 + jw / 2, y_bot - 12, 0.82, mid, lo) + f'<rect x="{f(x0 + 2)}" y="{f(y_bot - 50)}" width="{f(jw - 4)}" height="48" fill="none" stroke="{gold}" stroke-width="1.6"/>'))
    return "".join(out)


def door_shape(cx=270, cy=246, R=212, jw=40, y_bot=752):
    xl, xr = 84 - jw, 456 + jw
    return (f"M{f(xl)} {f(y_bot)} L{f(xl)} {f(cy - 6)} L{f(cx - R)} {f(cy - 6)} A{f(R)} {f(R)} 0 0 1 {f(cx + R)} {f(cy - 6)} "
            f"L{f(xr)} {f(cy - 6)} L{f(xr)} {f(y_bot)} Z")


def barnacles(seed, x0, x1, y0, y1, n=10, col="#E6EEF0"):
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        x, y, r = rnd.uniform(x0, x1), rnd.uniform(y0, y1), rnd.uniform(2, 3.8)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{col}" opacity="0.85"/><circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.45)}" fill="#3A4A50" opacity="0.8"/>')
    return "".join(out)


def amb3():
    c = start("a3")
    win = rrect(84, 266, 456, 724, 4)
    dshape = door_shape()
    door = swahili_door(c)
    water_on_door = (f'<g clip-path="{clip(c, dshape, "dclip")}">'
                     f'<rect width="{W}" height="{H}" fill="{c.grad("dwash", [(0, "#3FD3D8"), (0.45, "#0B6E8E"), (1, "#05304E")])}" opacity="0.07" style="mix-blend-mode:screen"/>'
                     f'{caustic_band(c, "cad", 0, 760, "#FFF6DA", 23, "0.024 0.036", 7.5, 0.3)}</g>')
    parts = [
        water(c, [(0, "#4FDCDC"), (0.18, "#17A6BE"), (0.5, "#0A5E86"), (1, "#03213A")]),
        radial(c, "sun", 270, -40, 420, 300, "#F2FFFF", 0.7),
        caustic_band(c, "ca", 0, 260, op=0.8, seed=9),
        surface(c, "sf", 14, "#E6FFFF", 2, 4, 0.85),
        f'<g filter="{blur(c, "dshad", 7)}" opacity="0.35"><ellipse cx="128" cy="70" rx="110" ry="16" fill="#03202F"/></g>',
        dhow_below(122, 26, 1.5, "#04202E", 0.92),
        f'<path d="M18 26 Q120 44 236 22" fill="none" stroke="#DFFFFF" stroke-width="1.4" opacity="0.6"/>',
        shafts(c, "sh", 300, -360, 0, 940, 11, 11, spread=28, op=(0.1, 0.26)),
        f'<g opacity="0.5" filter="{blur(c, "hz", 2.2)}">{reef_side(c, -1, 81, 980, 760)}{reef_side(c, 1, 87, 980, 760)}</g>',
        school(c, 4, lambda t: (330 + 220 * t, 64 + 46 * math.sin(t * 3.2)), 46, 8, (0.8, 1.3)),
        marine_snow(12, 120),
        radial(c, "doorglow", 270, 210, 300, 250, "#FFF0B8", 0.4),
        f'<g filter="{c.shadow("doorsh", 0, 8, 10, "#00101C", 0.6)}">{door}</g>',
        water_on_door,
        barnacles(3, 46, 80, 300, 690, 9), barnacles(4, 460, 494, 320, 700, 9), barnacles(5, 70, 470, 238, 262, 8),
        encrust(c, 41, 46, 82, 600, 748, 14), encrust(c, 43, 458, 494, 590, 748, 14), encrust(c, 45, 120, 420, 236, 262, 10),
        seafan(3, 18, 960, 300, 140, "#E0485A", 0.92, 10, 1.4),
        seafan(4, 522, 960, 280, 130, "#F2A23A", 0.88, -10, 1.3),
        coral(5, 24, 960, 92, 12, 12, 5, "#FF7A6B", "#FFE0D2"),
        coral(6, 516, 960, 86, -14, 12, 5, "#FF5C8C", "#FFD3E4"),
        sand(c, "sand", 900, ("#F2E2B8", "#C9A46A", "#6E5030"), 4),
    ]
    deco(c, win, parts)
    window_finish(c, win, GOLD, 4, tint="#BFFBFF", tint_op=0.14)
    c.add(f'<g filter="{c.shadow("cw-sh", 0, 2, 2, "#000000", 0.5)}">{"".join(cowrie(c, 270 + (i - 7) * 23, 736, 1.0, 90) for i in range(15))}</g>')
    c.add(starfish(64, 470, 15, "#F2894E", 18), starfish(476, 600, 13, "#E8566A", -12, "#FFD0D8"))
    c.add(anemone(c, "anL", 64, 300, 0.62, "#9A2E86", "#FF8AD8", "#BFFBFF", 18, 3), anemone(c, "anR", 476, 300, 0.62, "#2E6A9A", "#7FF6FF", "#FFFFFF", 18, 4))
    c.add(place(turtle(c, "tt"), 470, 74, 0.82, -38))
    c.add(place(moorish_idol(c, "mi1"), 36, 372, 1.05, -6), place(moorish_idol(c, "mi2"), 506, 528, 0.95, 8, flip=True))
    c.add(reef_fish(c, 30, 640, 0.95, "#FFD23C", "#2A2A40", False, -6), reef_fish(c, 512, 410, 0.9, "#FFB23C", "#FFFFFF", True, 8))
    c.add(f'<g filter="{c.shadow("cw2", 0, 2, 2, "#000000", 0.45)}">' + "".join(cowrie(c, x, y, 0.9, r) for x, y, r in ((36, 932, 20), (60, 944, -30), (494, 936, 40), (512, 922, -10), (470, 946, 70))) + "</g>")
    c.add(soft_coral(c, 30, 790, 1.0, "#FF6FA8", 3), soft_coral(c, 512, 798, 0.9, "#FF9E6F", 5))
    c.add(bubble_column(c, 9, 252, 240, 30, 6, 1.2, 3.5))
    crest_block(c, 270, 142, 0.86, "gold", 3, halo_col="#FFE7A8", halo_op=0.5)
    bird(c, "mee-bisou-vole", 70, 210, 104, False, -6)
    bird(c, "meo-bravo", 470, 210, 104, True, 6)
    inscription(c, "Ambassadeur III", "Merci la famille", style="nacre")
    c.add(outer_frame(c, GOLD, 10, 3.5, 24, "of"))
    save(c, "ambassadeur-3")
    register("ambassadeur-3", "ambassadeur", 3, "III", "La Porte de Zanzibar",
             "Une touche d'Afrique au fond du lagon : la photo passe sous une porte sculptée de la côte swahilie (Lamu, Stone Town de Zanzibar) "
             "engloutie dans l'eau turquoise — imposte en demi-lune à éventail d'or et rosaces, jambages à chaîne sculptée, clous de laiton, lotus aux socles —, "
             "que les coraux, les anémones et les balanes ont colonisée ; une tortue verte passe au-dessus, deux poissons-cochers la gardent, "
             "la coque d'un boutre glisse à la surface et un rang de cauris de l'océan Indien court sous la photo.",
             "libre : Mee (bisou volé) et Meo (bravo) perchés sur le linteau", "Merci la famille")


# ---------------------------------------------------------------- Ambassadeur II : les lanternes de méduses

def lantern(card, name, x, y_top, y_bell, r, bell, core, seed, tent=2.6):
    """Une méduse-lanterne suspendue à un rang de perles, coiffée d'une calotte d'or."""
    cy = y_bell + 0.93 * r
    out = [pearl_string(card, x, y_top, x + 0.01, y_bell - 4, 2, 2.6, "neutral", 0.8)]
    out.append(f'<g filter="{glow(card, name + "-h", r * 0.5, 1)}"><circle cx="{f(x)}" cy="{f(cy - r * 0.45)}" r="{f(r * 1.25)}" fill="{bell}" opacity="0.16"/></g>')
    out.append(place(jellyfish(card, name, r, bell, core, seed, tent, 12 if r > 20 else 9, 4), x, cy, 1.0, 0))
    cap = metal_grad(card, "lcap", GOLD)
    out.append(f'<g filter="{bevel(card, "lcap-bv", 0.6, 1.6, 1, 1.5, 0.5)}"><path d="M{f(x - r * 0.32)} {f(y_bell + 3)} Q{f(x)} {f(y_bell - r * 0.3)} {f(x + r * 0.32)} {f(y_bell + 3)} Z" fill="{cap}"/>'
               f'<circle cx="{f(x)}" cy="{f(y_bell - r * 0.18)}" r="{f(max(2.2, r * 0.1))}" fill="{cap}"/></g>')
    return "".join(out)


def siphonophore(card, name, pts, col="#9FF4FF", n=34, seed=1):
    """Siphonophore : une colonie en chaîne, cloches translucides et filaments pêcheurs le long d'un fil de lumière."""
    rnd = random.Random(seed)
    sp = resample(catmull(pts, 10), n)
    nm = normals(sp)
    out = [f'<path d="{poly(catmull(pts, 10), False)}" fill="none" stroke="{col}" stroke-width="0.9" opacity="0.7"/>']
    for i, ((x, y), (nx, ny)) in enumerate(zip(sp, nm)):
        rr = 3.6 * (1 - i / n * 0.6)
        out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(rr)}" ry="{f(rr * 0.6)}" fill="{col}" opacity="{f(0.35 + 0.4 * rnd.random())}"/>')
        if i % 3 == 0:
            L = rnd.uniform(8, 20)
            out.append(f'<path d="M{f(x)} {f(y)} q{f(nx * L * 0.3 + 2)} {f(L * 0.5)} {f(nx * L * 0.5)} {f(L)}" fill="none" stroke="{col}" stroke-width="0.5" opacity="0.6"/>')
    return f'<g filter="{glow(card, name, 2.2, 2)}">{"".join(out)}</g>'


def sea_pen(card, name, x, y, h, col="#FF9FE8", lean=0, seed=1):
    """Plume de mer : une tige et des feuillets de polypes qui s'allument quand on la frôle."""
    rnd = random.Random(seed)
    top = (x + lean, y - h)
    out = [f'<path d="M{f(x)} {f(y)} Q{f(x + lean * 0.3)} {f(y - h * 0.5)} {f(top[0])} {f(top[1])}" fill="none" stroke="{mix(col, "#2A0A30", 0.4)}" stroke-width="3" stroke-linecap="round"/>']
    for k in range(16):
        t = 0.25 + 0.75 * k / 15
        px, py = x + lean * t * t, y - h * t
        L = 16 * math.sin(math.pi * (t - 0.2) / 0.85) + 4
        for m in (1, -1):
            ex, ey = px + m * L, py - L * 0.45
            out.append(f'<path d="M{f(px)} {f(py)} Q{f(px + m * L * 0.5)} {f(py - L * 0.1)} {f(ex)} {f(ey)}" fill="none" stroke="{col}" stroke-width="2.2" stroke-linecap="round" opacity="0.85"/>'
                       f'<circle cx="{f(ex)}" cy="{f(ey)}" r="1.4" fill="#FFFFFF" opacity="{f(rnd.uniform(0.6, 1))}"/>')
    return f'<g filter="{glow(card, name, 2.5, 2)}">{"".join(out)}</g>'


def arch_garland(card, cx=270, spring=402, rx=186, ry=150, off=14, n=21, skip=46):
    """Une guirlande de petites coquilles d'or et de perles qui suit l'arche."""
    out = []
    for i in range(n):
        a = math.pi * i / (n - 1)
        x = cx - (rx + off) * math.cos(a)
        y = spring - (ry + off) * math.sin(a)
        if abs(x - cx) < skip:
            continue
        nx, ny = -math.cos(a) * ry, -math.sin(a) * rx
        rot = math.degrees(math.atan2(nx, -ny))
        if i % 2 == 0:
            out.append(f'<g transform="translate({f(x)} {f(y)}) rotate({f(rot)})">{scallop(card, "gsc", 0, 8, 15, GOLD, 9, 66, False)}</g>')
        else:
            out.append(pearl(card, x, y, 5.2, "rose", shadow=False))
    return "".join(out)


def amb2():
    c = start("a2")
    win = arch(84, 456, 252, 724, 24, 150)
    rnd = random.Random(4)
    plankton = "".join(
        f'<circle cx="{f(rnd.uniform(0, W))}" cy="{f(rnd.uniform(0, H))}" r="{f(rnd.uniform(0.6, 2.2))}" fill="{rnd.choice(("#7FF6FF", "#FF9FE8", "#BFA8FF", "#FFE7A8"))}" opacity="{f(rnd.uniform(0.4, 1))}"/>'
        for _ in range(240)
    )
    parts = [
        water(c, [(0, "#1B4C8E"), (0.3, "#0D2A62"), (0.7, "#070F38"), (1, "#03061A")]),
        radial(c, "sun", 270, -80, 380, 280, "#9FD8FF", 0.45),
        shafts(c, "sh", 270, -400, 0, 820, 11, 2, spread=30, op=(0.05, 0.15)),
        radial(c, "glL", 60, 300, 220, 360, "#7FF6FF", 0.16),
        radial(c, "glR", 480, 330, 220, 360, "#FF8AD8", 0.15),
        f'<g opacity="0.3" filter="{blur(c, "bigj", 5)}">{place(jellyfish(c, "bj1", 80, "#7FF6FF", "#BFA8FF", 11, 2.2, 14, 4, 1.0, False), 96, 330, 1.0, 12)}'
        f'{place(jellyfish(c, "bj2", 72, "#FF9FE8", "#FFE7A8", 12, 2.2, 14, 4, 1.0, False), 450, 390, 1.0, -10)}</g>',
        f'<g filter="{glow(c, "pk", 2, 2)}">{plankton}</g>',
        siphonophore(c, "sp1", [(10, 470), (40, 520), (22, 600), (54, 680), (30, 760)], "#9FF4FF", 30, 1),
        siphonophore(c, "sp2", [(530, 520), (500, 580), (520, 650), (494, 720), (516, 800)], "#FFB8F0", 30, 2),
        place(ctenophore(c, "ct1", 16), 52, 640, 1.0, 20),
        place(ctenophore(c, "ct2", 13, "#FFD8F6"), 496, 470, 1.0, -16),
        place(jellyfish(c, "js3", 13, "#FFE7A8", "#FF9FE8", 7, 2.6, 8, 3), 44, 790, 1.0, 4),
        place(jellyfish(c, "js4", 11, "#BFA8FF", "#7FF6FF", 8, 2.6, 8, 3), 500, 840, 1.0, -6),
        sea_pen(c, "pen1", 26, 980, 190, "#FF9FE8", 10, 1),
        sea_pen(c, "pen2", 514, 980, 170, "#7FF6FF", -8, 2),
        sea_pen(c, "pen3", 60, 990, 120, "#FFE7A8", 14, 3),
        sea_pen(c, "pen4", 484, 990, 130, "#BFA8FF", -14, 4),
    ]
    deco(c, win, parts)
    c.add(f'<g transform="translate(270 218)">{scallop(c, "crown", 0, 0, 132, GOLD, 19, 80)}</g>')
    window_finish(c, win, GOLD, 6, glow_col="#9FE8FF")
    c.add(arch_garland(c))
    c.add(lantern(c, "L1", 62, 12, 150, 40, "#7FF6FF", "#FF8AD8", 1, 2.4))
    c.add(lantern(c, "L2", 138, 12, 58, 23, "#FFE7A8", "#FF9FE8", 3, 2.3))
    c.add(lantern(c, "L3", 30, 12, 392, 21, "#BFA8FF", "#7FF6FF", 5, 2.6))
    c.add(lantern(c, "R1", 478, 12, 176, 38, "#FF9FE8", "#7FF6FF", 2, 2.4))
    c.add(lantern(c, "R2", 402, 12, 52, 23, "#9FF4FF", "#FFE7A8", 4, 2.3))
    c.add(lantern(c, "R3", 512, 12, 430, 20, "#FFE7A8", "#BFA8FF", 6, 2.6))
    for x in (62, 138, 30, 478, 402, 512):
        c.add(f'<g filter="{bevel(c, "hook-bv", 0.6, 1.6, 1, 1.5, 0.5)}"><circle cx="{x}" cy="14" r="5" fill="none" stroke="{metal_grad(c, "hook", GOLD)}" stroke-width="2.6"/></g>')
    c.add(bokeh(c, "bk", 6, 26, (0, 0, W, H), "#BFE6FF", 6, 22, (0.05, 0.16), 5))
    crest_block(c, 270, 142, 0.86, "gold", 2, halo_col="#FFE7A8", halo_op=0.4)
    bird(c, "meo-selfie", 450, 664, 168, True, 0)
    inscription(c, "Ambassadeur II", "Pour toi, maman", style="nacre")
    c.add(outer_frame(c, GOLD, 10, 3.5, 24, "of"))
    save(c, "ambassadeur-2")
    register("ambassadeur-2", "ambassadeur", 2, "II", "Les Lanternes de méduses",
             "Dans la zone crépusculaire, des méduses bioluminescentes pendent comme des lanternes au bout de rangs de perles, coiffées de calottes d'or ; "
             "une grande coquille Saint-Jacques couronne le blason, une guirlande de coquilles et de perles roses suit l'arche, des siphonophores dérivent en chaînes de lumière "
             "et des plumes de mer s'allument au pied du cadre.",
             "selfie : Meo prend la photo", "Pour toi, maman")


# ---------------------------------------------------------------- Ambassadeur I : Atlantide

NACRE_COL = ["#F6F2FF", "#DCEAF4", "#C2B3E0", "#F3E6DA", "#D4F1EE", "#F6F2FF"]
ABALONE = ["#1E8F9A", "#3FD0B8", "#4A7FE0", "#8A5AD8", "#2FB8C8", "#7FF0D0", "#3A6AD0"]


def column(card, x0, x1, y0, y1, name):
    """Colonne de nacre cannelée, chapiteau à volutes de nautile, base à tores."""
    w = x1 - x0
    cx = (x0 + x1) / 2
    shaft = card.grad(name + "-sh", [(0, "#8F86B8"), (0.2, "#E9E4FF"), (0.45, "#FFFFFF"), (0.7, "#CFE3F0"), (1, "#5E6A9A")], 0, 0, 1, 0)
    out = [f'<rect x="{f(x0 + 4)}" y="{f(y0)}" width="{f(w - 8)}" height="{f(y1 - y0)}" fill="{shaft}"/>']
    for k in range(1, 6):
        xx = x0 + 4 + (w - 8) * k / 6
        out.append(f'<line x1="{f(xx)}" y1="{f(y0 + 4)}" x2="{f(xx)}" y2="{f(y1 - 4)}" stroke="#6E6A9A" stroke-width="1.6" opacity="0.45"/>')
        out.append(f'<line x1="{f(xx + 1.6)}" y1="{f(y0 + 4)}" x2="{f(xx + 1.6)}" y2="{f(y1 - 4)}" stroke="#FFFFFF" stroke-width="0.8" opacity="0.6"/>')
    out.append(f'<rect x="{f(x0 + 4)}" y="{f(y0)}" width="{f(w - 8)}" height="{f(y1 - y0)}" fill="{nacre_grad(card, name + "-ir", 0, 0, 0.5, 1, ["#FFB8E0", "#9FF4FF", "#D9C2FF", "#FFE7B8", "#9FF4FF", "#FFB8E0"])}" opacity="0.42" style="mix-blend-mode:multiply"/>')
    gold = metal_grad(card, name + "-g", GOLD)
    cap = (f'<rect x="{f(x0 - 6)}" y="{f(y0 - 30)}" width="{f(w + 12)}" height="10" fill="{gold}"/>'
           f'<path d="M{f(x0 + 2)} {f(y0 - 20)} Q{f(cx)} {f(y0 - 4)} {f(x1 - 2)} {f(y0 - 20)} L{f(x1 - 4)} {f(y0)} L{f(x0 + 4)} {f(y0)} Z" fill="{gold}"/>')
    base_ = (f'<rect x="{f(x0 - 2)}" y="{f(y1)}" width="{f(w + 4)}" height="8" rx="4" fill="{gold}"/>'
             f'<rect x="{f(x0 - 8)}" y="{f(y1 + 8)}" width="{f(w + 16)}" height="12" fill="{gold}"/>')
    out.append(f'<g filter="{bevel(card, name + "-bv", 1, 2.4, 2, 3, 0.5)}">{cap}{base_}</g>')
    out.append(nautilus_cut(card, name + "-v1", x0 - 2, y0 - 12, 18, 200, False, shadow=False))
    out.append(nautilus_cut(card, name + "-v2", x1 + 2, y0 - 12, 18, -20, True, shadow=False))
    out.append(encrust(card, len(name) * 7 + int(x0), x0 + 4, x1 - 4, y1 - 120, y1 - 4, 16))
    out.append(encrust(card, len(name) * 3 + int(x0), x0 + 4, x1 - 4, y0 + 4, y0 + 60, 7))
    return f'<g filter="{card.shadow(name + "-ds", 0, 4, 6, "#000000", 0.5)}">{"".join(out)}</g>'


def archivolt(card, cx, cy, r0, r1, n=17):
    gold = metal_grad(card, "av-g", GOLD)
    nac = nacre_grad(card, "av-n", 0, 0, 1, 1, ABALONE)
    out = []
    for k in range(n):
        a0 = -90 + 180 * k / n + 0.6
        a1 = -90 + 180 * (k + 1) / n - 0.6
        p = [pt(cx, cy, r0, a0), pt(cx, cy, r1, a0), pt(cx, cy, r1, a1), pt(cx, cy, r0, a1)]
        d = f"M{f(p[0][0])} {f(p[0][1])} L{f(p[1][0])} {f(p[1][1])} A{f(r1)} {f(r1)} 0 0 1 {f(p[2][0])} {f(p[2][1])} L{f(p[3][0])} {f(p[3][1])} A{f(r0)} {f(r0)} 0 0 0 {f(p[0][0])} {f(p[0][1])} Z"
        out.append(f'<path d="{d}" fill="{gold if k % 2 else nac}"/>')
    out.append(f'<path d="M{f(cx - r1)} {f(cy)} A{f(r1)} {f(r1)} 0 0 1 {f(cx + r1)} {f(cy)}" fill="none" stroke="{gold}" stroke-width="3"/>')
    out.append(f'<path d="M{f(cx - r0)} {f(cy)} A{f(r0)} {f(r0)} 0 0 1 {f(cx + r0)} {f(cy)}" fill="none" stroke="{gold}" stroke-width="3"/>')
    return f'<g filter="{bevel(card, "av-bv", 1, 2.4, 3, 4, 0.55)}">{"".join(out)}</g>'


def rose_window(card, cx, cy, r):
    """Rosace de nacre et d'or : seize pétales, huit pétales, trois anneaux, une perle au cœur."""
    gold = metal_grad(card, "rw-g", GOLD)
    nac = nacre_grad(card, "rw-n", 0, 0, 1, 1, ABALONE)
    pearl_n = card.rgrad("rw-p", [(0, "#FFFFFF", 1), (0.55, "#F3E6F4", 1), (1, "#B9A7D8", 1)], 0.4, 0.35, 0.7)
    glass = card.rgrad("rw-glass", [(0, "#FFF4C2", 0.65), (0.5, "#0C5C84", 0.8), (1, "#06294C", 0.92)])
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{glass}"/>']
    for i in range(16):
        a = 360 * i / 16
        x, y = pt(cx, cy, r * 0.8, a)
        out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(r * 0.17)}" ry="{f(r * 0.095)}" fill="{nac}" stroke="{gold}" stroke-width="1.6" transform="rotate({f(a + 90)} {f(x)} {f(y)})"/>')
        x2, y2 = pt(cx, cy, r * 0.97, a + 11.25)
        out.append(f'<circle cx="{f(x2)}" cy="{f(y2)}" r="{f(r * 0.035)}" fill="{gold}"/>')
    for i in range(8):
        a = 360 * i / 8 + 22.5
        x, y = pt(cx, cy, r * 0.48, a)
        out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(r * 0.17)}" ry="{f(r * 0.1)}" fill="{pearl_n}" stroke="{gold}" stroke-width="1.4" transform="rotate({f(a + 90)} {f(x)} {f(y)})"/>')
    for k in (1.0, 0.63, 0.3):
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * k)}" fill="none" stroke="{gold}" stroke-width="{f(3 if k == 1 else 2)}"/>')
    return f'<g filter="{bevel(card, "rw-bv", 1, 2.4, 3, 4, 0.55)}">{"".join(out)}</g>'


def encrust(card, seed, x0, x1, y0, y1, n=14):
    """Coraux et anémones minuscules qui ont colonisé la pierre."""
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        col = rnd.choice(("#FF7A6B", "#FF9FE8", "#FFD36E", "#7FF6FF", "#B05CFF"))
        r = rnd.uniform(1.6, 3.6)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{col}" opacity="0.85"/><circle cx="{f(x - r * 0.3)}" cy="{f(y - r * 0.3)}" r="{f(r * 0.35)}" fill="#FFFFFF" opacity="0.6"/>')
    return "".join(out)


def far_ruins(card):
    col = "#2A7A9C"
    out = []
    for x, h, w in ((14, 150, 18), (48, 120, 16), (82, 96, 14), (440, 100, 14), (474, 128, 16), (508, 160, 18)):
        out.append(f'<rect x="{x}" y="{248 - h}" width="{w}" height="{h}" fill="{col}"/><rect x="{x - 4}" y="{240 - h}" width="{w + 8}" height="8" fill="{col}"/>')
    out.append(f'<path d="M6 104 L104 128 L104 136 L6 112 Z" fill="{col}"/><path d="M430 140 L534 92 L534 100 L430 148 Z" fill="{col}"/>')
    return f'<g opacity="0.55" filter="{blur(card, "ruins", 1.6)}">{"".join(out)}</g>'


def steps(card):
    nac = card.grad("step-n", [(0, "#E8F0F6"), (0.5, "#B6C8DC"), (1, "#6F86A6")])
    gold = metal_grad(card, "step-g", GOLD)
    out = []
    for k, (y, inset) in enumerate(((772, 14), (812, 6), (856, 0))):
        out.append(f'<rect x="{inset}" y="{y}" width="{W - 2 * inset}" height="{44 if k < 2 else 120}" fill="{nac}"/>')
        out.append(f'<rect x="{inset}" y="{y}" width="{W - 2 * inset}" height="4" fill="{gold}"/>')
    out.append(f'<rect x="0" y="772" width="{W}" height="200" fill="#0A3A5E" opacity="0.32"/>')
    return f'<g filter="{bevel(card, "step-bv", 1, 2, 2, 3, 0.45)}">{"".join(out)}</g>'


def tym_rays():
    rays_ = []
    for a in range(-84, 86, 8):
        x2, y2 = pt(270, 262, 190, a)
        rays_.append(f'<line x1="270" y1="262" x2="{f(x2)}" y2="{f(y2)}" stroke="#FFF4C2" stroke-width="1.2"/>')
    return f'<g opacity="0.55">{"".join(rays_)}</g>'


def amb1():
    c = start("a1")
    win = rrect(84, 270, 456, 726, 8)
    parts = [
        water(c, [(0, "#1A95B4"), (0.3, "#0C5C84"), (0.7, "#06294C"), (1, "#020F22")]),
        radial(c, "sun", 270, -60, 420, 360, "#EFFFFF", 0.6),
        caustic_band(c, "ca", 0, 250, op=0.6, seed=12),
        surface(c, "sf", 14, "#D8FFFF", 8, 4, 0.75),
        far_ruins(c),
        place(whale(c, "wh", "natural"), 128, 70, 0.5, -6),
        school(c, 21, lambda t: (330 + 200 * t, 70 + 30 * math.sin(t * 5)), 70, 9, (0.8, 1.3)),
        shafts(c, "sh", 270, -380, 0, 960, 13, 3, spread=30, op=(0.1, 0.3), sd=8),
        f'<path d="M50 266 A220 220 0 0 1 490 266 Z" fill="{c.rgrad("tym", [(0, "#BFFBFF", 0.35), (0.7, "#0C5C84", 0.15), (1, "#06294C", 0)], 0.5, 1, 1)}"/>',
        tym_rays(),
        marine_snow(17, 140),
        steps(c),
    ]
    deco(c, win, parts)
    c.add(rose_window(c, 270, 158, 98))
    c.add(archivolt(c, 270, 266, 196, 222))
    c.add(column(c, 22, 78, 266, 744, "colL"), column(c, 462, 518, 266, 744, "colR"))
    c.add(f'<rect x="78" y="262" width="384" height="8" fill="{metal_grad(c, "lint", GOLD)}" filter="{bevel(c, "lint-bv", 1, 2, 2, 2, 0.5)}"/>')
    window_finish(c, win, GOLD, 5, tint="#BFFBFF", tint_op=0.14)
    c.add(anemone(c, "anL", 40, 748, 0.8, "#9A2E86", "#FF8AD8", "#BFFBFF", 20, 3), anemone(c, "anR", 500, 748, 0.8, "#2E6A9A", "#7FF6FF", "#FFFFFF", 20, 4))
    c.add(gold_coins(c, 3, 70, 900, 34, 26), gold_coins(c, 4, 470, 906, 30, 22))
    c.add(pearl(c, 120, 912, 8, "neutral"), pearl(c, 418, 920, 7, "rose"), pearl(c, 32, 934, 6, "black"))
    c.add(gem(c, 100, 930, 9, "#E0245E"), gem(c, 448, 940, 8, "#2457E0", "#D1E0FF"))
    c.add(bubble_column(c, 31, 40, 700, 300, 14, 1.4, 5))
    crest_block(c, 270, 150, 0.86, "gold", 1, halo_col="#FFF4C2", halo_op=0.5)
    c.add(f'<g transform="translate(270 44)">{scallop(c, "key", 0, 0, 24, GOLD, 11, 70)}</g>')
    mee_meo(c, "pied", "mee-fete", "meo-roi")
    inscription(c, "Ambassadeur I", "On l'a fait ensemble", style="nacre", medal="pearl")
    c.add(outer_frame(c, GOLD, 10, 4, 24, "of"))
    save(c, "ambassadeur-1")
    register("ambassadeur-1", "ambassadeur", 1, "I", "Atlantide",
             "La photo prend place au seuil d'un temple englouti : colonnes de nacre cannelées aux chapiteaux à volutes de nautile, "
             "archivolte de claveaux d'or et de nacre, rosace de nacre derrière le blason, coquille Saint-Jacques en clé de voûte ; une baleine à bosse passe dans les rais de lumière "
             "et l'or des épaves, perles et pierres, ruisselle sur les marches.",
             "pied : Mee (fête) et Meo (roi) sur les marches du temple", "On l'a fait ensemble")


ALL = [amb5, amb4, amb3, amb2, amb1]
