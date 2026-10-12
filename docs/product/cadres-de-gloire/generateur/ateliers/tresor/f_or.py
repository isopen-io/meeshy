"""Atelier « Trésor » — Trésor (500 Meeshes) et Réserve (1 000 Meeshes)."""

import math
import random

from cadre import *  # noqa: F401,F403
from objets import pearl, pearl_string, gem, cabochon, chain, coin_rain, coin_mound, smooth, closed_smooth, sample, segs_d, GEMS
from coffrets import crown, chalice, gem_bezel, quilted
from banque import (lingot, lingot_stack, column, steps, marble, beam, engraved, rivet_row)
from f_cuir import rrect_points, arch_points

CRIMSON = ("#E0505E", "#8A1024", "#2A040A")
MARBLE = ("#FFFFFF", "#EFE7DA", "#B5A893")
NIGHT_MARBLE = ("#F4EEE6", "#C9BFB0", "#5E5868")


def lean_left(peak=-0.55, width=1.15):
    return lambda u: max(0.0, 1 - abs((u - peak) / width) ** 1.8)


from base import plate_layer  # noqa: E402  la couche « plate » et ses emplacements de texte


@plate_layer
def gold_cartouche(card, x0, y0, x1, y1, key="gc", panel="#140A02", op=0.86):
    """Un cartouche d'or : panneau sombre, double filet biseauté, volutes aux extrémités."""
    d = rrect(x0, y0, x1, y1, 22)
    out = [f'<path d="{d}" fill="#000000" opacity="0.6" transform="translate(0 8)" filter="{soft(card, 10)}"/>',
           f'<path d="{d}" fill="{panel}" opacity="{f(op)}"/>']
    out.append(gold_frame(card, d, key + "-o", GOLD_RICH, 6))
    out.append(f'<path d="{rrect(x0 + 9, y0 + 9, x1 - 9, y1 - 9, 15)}" fill="none" stroke="#E8B53C" stroke-width="1" opacity="0.7"/>')
    g = metal_lin(card, key + "-v", GOLD_RICH, 0, 0, 1, 1)
    bv = bevel(card, key + "-vbv", 1.0, 3.0, 1.0, 22, shadow=(0, 3, 3, 0.6))
    my = (y0 + y1) / 2
    vol = []
    for sx, ex in ((-1, x0), (1, x1)):
        vol.append(f'<path d="M{f(ex)} {f(my - 26)} C{f(ex + sx * 26)} {f(my - 30)} {f(ex + sx * 30)} {f(my - 4)} {f(ex + sx * 14)} {f(my)} '
                   f'C{f(ex + sx * 30)} {f(my + 4)} {f(ex + sx * 26)} {f(my + 30)} {f(ex)} {f(my + 26)} '
                   f'C{f(ex + sx * 12)} {f(my + 16)} {f(ex + sx * 12)} {f(my - 16)} {f(ex)} {f(my - 26)} Z" fill="{g}"/>')
        vol.append(f'<circle cx="{f(ex + sx * 18)}" cy="{f(my)}" r="5" fill="{g}"/>')
    vol.append(f'<path d="M{f((x0 + x1) / 2 - 30)} {f(y0)} Q{f((x0 + x1) / 2)} {f(y0 - 22)} {f((x0 + x1) / 2 + 30)} {f(y0)} Z" fill="{g}"/>')
    out.append(f'<g filter="{bv}">{"".join(vol)}</g>')
    out.append(gem((x0 + x1) / 2, y0 - 8, 6.5, "rubis", 0, 8, 1.0, sparkle_=False))
    return "".join(out)


# =============================================================== TRÉSOR

def tresor_a():
    c = start("ta", "#4A2E12", "#160C04", "#FFD27A", 0.3)
    c.motif("afrique")
    x0, x1, spring, y1 = 84, 456, 432, 716
    win = arch(x0, x1, spring, y1, 20)
    with masked(c, win, "w"):
        c.add(bg(c, lg(c, "hall", [(0, "#1E0E02"), (0.35, "#5A3008"), (0.7, "#3A1C04"), (1, "#120802")])))
        cxa = (x0 + x1) / 2
        for k, off in enumerate((150, 112, 76, 42)):
            rx = (x1 - x0) / 2 + off
            d = arch(cxa - rx, cxa + rx, spring, 1000, 0)
            shade = 0.85 - k * 0.12
            g = rg(c, f"ring{k}", [(0, "#FFD27A", 0.0), (0.82, "#C88A2A", 0.55 + k * 0.08), (1, "#3A1C04", 0.95)], 0.5, (spring - 60) / 1000, 0.62)
            c.add(f'<path d="{d}" fill="{lg(c, f"rf{k}", [(0, "#2A1404"), (1, "#0E0602")])}" opacity="{f(shade)}"/>')
            c.add(f'<path d="{d}" fill="none" stroke="{metal_lin(c, f"rs{k}", GOLD, 0, 0, 1, 1, 2)}" stroke-width="{4 - k * 0.5}"/>')
            n = 9 + k * 2
            for i in range(n):
                a = -80 + 160 * i / (n - 1)
                px, py = pt(cxa, spring, rx - 18, a)
                if py > 330 and k < 3:
                    continue
                c.add(f'<rect x="{f(px - 9)}" y="{f(py - 9)}" width="18" height="18" rx="2" fill="#140802" opacity="0.8" transform="rotate({f(a)} {f(px)} {f(py)})"/>')
                c.add(f'<circle cx="{f(px)}" cy="{f(py)}" r="4.2" fill="#F0C24B"/><circle cx="{f(px - 1)}" cy="{f(py - 1)}" r="1.5" fill="#FFF8D6"/>')
        c.add(godrays(c, "gods", 270, -80, [-26, -16, -8, 0, 8, 16, 26], 1000, 6, "#FFE2A0", 0.5, 7, 4))
        c.add(halo(c, "top", 270, 150, 300, 220, "#FFD27A", 0.45))
        c.add(dust(31, 220, (0, 0, 540, 960), ("#FFE7A0", "#FFFFFF"), 0.4, 1.9, keep=False))
    c.add(grade(c, win, "#FFD27A", 0.5, 0.0, 0.3, 0.9, "gr"))
    c.add(window_depth(c, win, 0.6, 30, 12))
    c.add(gold_frame(c, win, "wf", GOLD_RICH, 9))
    # les montagnes de Meeshes
    c.add(coin_mound(c, 41, 70, 760, 150, 300, 330, 9, 15, gems=18, lean=lean_left(-0.6, 1.2)))
    c.add(coin_mound(c, 42, 470, 760, 150, 280, 330, 9, 15, gems=18, lean=lean_left(0.6, 1.2)))
    c.add(crown(c, 64, 470, 0.92, "cr", GOLD_RICH, -12))
    from akan import kuduo, goldweight
    c.add(kuduo(c, 464, 586, 0.95, "kd", rot=4))
    for k, (x, y, s, r) in enumerate(((34, 552, 1.3, -8), (98, 612, 1.2, 10), (122, 652, 1.1, -4), (404, 668, 1.2, 6), (430, 646, 1.0, -10), (512, 600, 1.3, 4), (58, 742, 1.3, -6))):
        c.add(goldweight(c, x, y, s, k % 3, "gw", rot=r))
    c.add(pearl_string(c, smooth([(10, 600), (60, 640), (120, 620), (150, 680)]), 3.6))
    c.add(pearl_string(c, smooth([(530, 610), (480, 660), (420, 640), (392, 700)]), 3.6))
    c.add(coin_mound(c, 43, 270, 960, 300, 230, 520, 9, 15, gems=24, lean=lambda u: max(0.0, 0.55 + 0.45 * abs(u) ** 1.4)))
    for x, y, r in ((40, 380, 14), (500, 420, 12), (150, 560, 9), (400, 600, 10), (30, 720, 11), (520, 700, 10)):
        c.add(glint(x, y, r, "#FFFFFF", 0.95))
    c.add(emblem(c, 270, 148, 58, "Trésor", halo_op=0.6))
    birds(c, [("mee-jackpot", 76, 362, 118, False, -6), ("meo-roi", 470, 384, 112, True, 6)])
    c.add(gold_cartouche(c, 92, 754, 448, 912, "gc"))
    c.add(inscription(c, "Trésor", "Merci la famille", y=756, ink="#FFF4C8", accent="#F6C85A", title_size=42))
    save(c, "tresor", "Trésor", "a", "La salle au trésor",
         "Sous des arcs dorés à caissons qui s'enfoncent dans la lumière, deux montagnes de Meeshes semées de gemmes et une couronne ; "
         "touche d'Afrique, un kuduo — le vase de laiton à couvercle où les Akan du Ghana gardaient la poudre d'or — trône sur l'or, "
         "entouré des abrammuo, les petits poids gravés qui servaient à la peser.",
         "libre (sur les montagnes de Meeshes)", "Merci la famille")


def drape(card, side, key):
    """Un rideau de velours relevé : plis verticaux, embrasse d'or et gland."""
    s = 1 if side == "left" else -1
    ex = 0 if side == "left" else W
    d = (f"M{ex - s * 10} -10 L{ex + s * 150} -10 C{ex + s * 120} 200 {ex + s * 60} 420 {ex + s * 74} 560 "
         f"C{ex + s * 90} 700 {ex + s * 60} 860 {ex + s * 40} 970 L{ex - s * 10} 970 Z")
    out = [f'<path d="{d}" fill="#000000" opacity="0.55" transform="translate({s * 10} 6)" filter="{soft(card, 10)}"/>']
    folds = []
    for k in range(9):
        t = k / 8
        folds.append((t, CRIMSON[0] if k % 2 else CRIMSON[2]))
    g = lg(card, key + "-f", [(t, c_) for t, c_ in folds], 0 if side == "left" else 1, 0, 1 if side == "left" else 0, 0)
    out.append(f'<path d="{d}" fill="{CRIMSON[1]}"/>')
    out.append(f'<path d="{d}" fill="{g}" opacity="0.55"/>')
    sh = lg(card, key + "-sh", [(0, "#000000", 0.0), (0.5, "#000000", 0.1), (1, "#000000", 0.55)], 0, 0, 0, 1)
    out.append(f'<path d="{d}" fill="{sh}"/>')
    out.append(f'<path d="{d}" fill="#000000" opacity="0.2" filter="{noise(card, key + "-n", "1.1", 1, 7, (0, 0, 0), 1.2, -0.4)}"/>')
    out.append(f'<path d="M{ex + s * 150} -10 C{ex + s * 120} 200 {ex + s * 60} 420 {ex + s * 74} 560 C{ex + s * 90} 700 {ex + s * 60} 860 {ex + s * 40} 970" '
               f'fill="none" stroke="#F0C24B" stroke-width="3" opacity="0.85"/>')
    return "".join(out)


def tresor_b():
    c = start("tb", "#3A0E14", "#12040A", "#FFC27A", 0.26)
    win = rrect(86, 266, 454, 716, 18)
    with masked(c, win, "w"):
        c.add(bg(c, rg(c, "wall", [(0, "#6A1020"), (0.6, "#2A0610"), (1, "#0E0206")], 0.5, 0.4, 0.8)))
        dam = []
        for j in range(-1, 12):
            for i in range(-1, 7):
                x, y = i * 96 + (48 if j % 2 else 0), j * 90
                dam.append(f'<path d="M{x} {y - 26} Q{x + 22} {y} {x} {y + 26} Q{x - 22} {y} {x} {y - 26} Z" fill="none" stroke="#F0C24B" stroke-width="1.2"/>'
                           f'<circle cx="{x}" cy="{y}" r="3" fill="#F0C24B"/>')
        c.add(f'<g opacity="0.16">{"".join(dam)}</g>')
        c.add(halo(c, "top", 270, 170, 300, 220, "#FFC870", 0.45))
        c.add(godrays(c, "gods", 270, 160, list(range(-180, 180, 15)), 520, 5, "#FFD99A", 0.3, 6, 5))
        c.add(drape(c, "left", "dl"))
        c.add(drape(c, "right", "dr"))
        c.add(coin_rain(c, 51, 26, (20, 240, 520, 760), 8, 14, avoid=(80, 250, 460, 720)))
    c.add(grade(c, win, "#FFC27A", 0.5, 0.0, 0.24, 0.9, "gr"))
    c.add(window_depth(c, win, 0.65, 34, 12))
    bz = rrect(70, 250, 470, 732, 26) + " " + win
    bv = bevel(c, "bzbv", 1.4, 3.4, 1.0, 24, shadow=(0, 6, 8, 0.7))
    c.add(f'<g filter="{bv}"><path d="{bz}" fill-rule="evenodd" fill="{metal_lin(c, "bz", GOLD_RICH, 0, 0, 1, 1, 4)}"/></g>')
    c.add(f'<path d="{rrect(78, 258, 462, 724, 22)}" fill="none" stroke="#7A4A0A" stroke-width="1" opacity="0.7"/>')
    pts = rrect_points(78, 258, 462, 724, 22, 38)
    kinds = ("rubis", "emeraude", "saphir", "amethyste", "diamant")
    for k, (x, y) in enumerate(pts):
        if k % 2:
            c.add(pearl(c, x, y, 3.6))
        else:
            c.add(cabochon(c, x, y, 6.2, 5.2, kinds[(k // 2) % 5], GOLD))
    # tas au pied des rideaux
    c.add(coin_mound(c, 52, 76, 770, 110, 120, 140, 9, 14, gems=10, lean=lean_left(-0.5, 1.3)))
    c.add(coin_mound(c, 53, 464, 770, 110, 120, 140, 9, 14, gems=10, lean=lean_left(0.5, 1.3)))
    # embrasses
    from objets import tassel, cord
    c.add(cord(c, [((-6, 548), (30, 540), (70, 548), (84, 562)), ((84, 562), (90, 576), (60, 582), (64, 584))], 7, GOLD, "tbl"))
    c.add(cord(c, [((546, 548), (510, 540), (470, 548), (456, 562)), ((456, 562), (450, 576), (480, 582), (476, 584))], 7, GOLD, "tbr"))
    c.add(tassel(c, 64, 584, 56, 24, GOLD, "tsl", -2))
    c.add(tassel(c, 476, 584, 56, 24, GOLD, "tsr", 2))
    # la couronne qui porte la Meesh
    c.add(crown(c, 270, 214, 1.6, "cr", GOLD_RICH, 0, ("rubis", "emeraude", "saphir"), center_coin=False))
    c.add(emblem(c, 270, 150, 48, "Trésor", halo_op=0.35))
    mee_meo(c, "cotes", "mee-bisou-vole", "meo-champagne")
    c.add(text_panel(c, 96, 766, 444, 898, 20, "#2A040C", 0.92, None, 1.6, "tp"))
    c.add(gold_frame(c, rrect(96, 766, 444, 898, 20), "pf", GOLD_RICH, 5))
    fr = "".join(f'<line x1="{x}" y1="898" x2="{x}" y2="{906 + (x % 3) * 2}" stroke="#F0C24B" stroke-width="1.6"/>' for x in range(110, 432, 5))
    c.add(fr)
    c.add(inscription(c, "Trésor", None, y=772, ink="#FFF1D6", accent="#F6C85A", title_size=42))
    save(c, "tresor", "Trésor", "b", "La couronne du trésor",
         "Les rideaux de velours cramoisi s'ouvrent sur une photo sertie d'or, de cabochons et de perles ; au-dessus, une couronne ouverte porte la Meesh "
         "comme une pierre de sacre, et les pièces pleuvent jusqu'aux tas d'or au pied des tentures.",
         "cotes", None)


# =============================================================== RÉSERVE

def night_sky(card, key, top="#040820", mid="#13204E", low="#3A2F5E", seed=3, n=220):
    out = [bg(card, lg(card, key, [(0, top), (0.55, mid), (1, low)]))]
    rnd = random.Random(seed)
    st = []
    for _ in range(n):
        x, y = rnd.uniform(0, W), rnd.uniform(0, 700)
        st.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(0.3, 1.5))}" fill="#FFFFFF" opacity="{f(rnd.uniform(0.3, 0.95))}"/>')
    out.append("".join(st))
    return "".join(out)


def firework(card, cx, cy, r, color, key, n=28, seed=1):
    rnd = random.Random(seed)
    out = [halo(card, key, cx, cy, r * 1.2, r * 1.2, color, 0.35)]
    for i in range(n):
        a = 360 * i / n + rnd.uniform(-4, 4)
        L = r * rnd.uniform(0.7, 1.0)
        x1, y1 = pt(cx, cy, r * 0.2, a)
        x2, y2 = pt(cx, cy, L, a)
        out.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2 + L * 0.06)}" stroke="{color}" stroke-width="1.3" stroke-linecap="round" opacity="0.85"/>')
        out.append(f'<circle cx="{f(x2)}" cy="{f(y2 + L * 0.06)}" r="1.8" fill="#FFFFFF"/>')
    return "".join(out)


def pediment(card, x0, x1, apex_y, base_y, key="pd", stone=NIGHT_MARBLE, light="#FFC77A", relief=None):
    """Un fronton triangulaire : corniche rampante moulurée, tympan, éclairage par en dessous."""
    hi, mid, lo = stone
    cx = (x0 + x1) / 2
    outer = poly([(x0 - 14, base_y), (cx, apex_y - 16), (x1 + 14, base_y)])
    inner = poly([(x0 + 24, base_y - 8), (cx, apex_y + 16), (x1 - 24, base_y - 8)])
    out = [f'<path d="{outer}" fill="#000000" opacity="0.5" transform="translate(0 6)" filter="{soft(card, 8)}"/>']
    og = lg(card, key + "-o", [(0, hi), (0.6, mid), (1, lo)], 0, 0, 0, 1)
    out.append(f'<path d="{outer}" fill="{og}"/>')
    out.append(f'<path d="{poly([(x0 - 14, base_y), (cx, apex_y - 16)])}" stroke="#FFFFFF" stroke-width="1.4" fill="none" opacity="0.8"/>')
    for k, w in ((6, 1), (12, 1)):
        out.append(f'<path d="{poly([(x0 - 14 + k * 1.6, base_y - k * 0.2), (cx, apex_y - 16 + k), (x1 + 14 - k * 1.6, base_y - k * 0.2)], close=False)}" stroke="{lo}" stroke-width="{w}" fill="none" opacity="0.7"/>')
    tg = lg(card, key + "-t", [(0, "#8E8494"), (1, "#3E3848")], 0, 0, 0, 1)
    out.append(f'<path d="{inner}" fill="{tg}"/>')
    out.append(inner_shadow(card, inner, 16, 6, 0.6, "#000000", key + "-is"))
    if relief:
        out.append(relief)
    up = lg(card, key + "-up", [(0, light, 0.0), (1, light, 0.45)], 0, 0, 0, 1)
    out.append(f'<path d="{outer}" fill="{up}" style="mix-blend-mode:screen"/>')
    return "".join(out)


def entablature(card, x0, x1, y0, y1, key="en", stone=NIGHT_MARBLE, text=None, size=19, light="#FFC77A"):
    hi, mid, lo = stone
    d = f"M{x0} {y0} L{x1} {y0} L{x1} {y1} L{x0} {y1} Z"
    g = lg(card, key + "-g", [(0, hi), (0.5, mid), (1, lo)], 0, 0, 0, 1)
    out = [f'<path d="{d}" fill="#000000" opacity="0.5" transform="translate(0 6)" filter="{soft(card, 6)}"/>', f'<path d="{d}" fill="{g}"/>']
    out.append(marble(card, d, key + "-m", stone, (0.3, 0.27, 0.3), 5, op=0.35))
    h = y1 - y0
    out.append(f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{f(h * 0.2)}" fill="{lo}" opacity="0.5"/>')
    out.append(f'<line x1="{x0}" y1="{f(y0 + h * 0.2)}" x2="{x1}" y2="{f(y0 + h * 0.2)}" stroke="#FFFFFF" stroke-width="1" opacity="0.6"/>')
    out.append(f'<line x1="{x0}" y1="{f(y1 - h * 0.18)}" x2="{x1}" y2="{f(y1 - h * 0.18)}" stroke="{lo}" stroke-width="1.2" opacity="0.8"/>')
    if text:
        ty = y0 + h * 0.62
        out.append(f'<text x="{f((x0 + x1) / 2)}" y="{f(ty + 1.2)}" text-anchor="middle" font-family="{CINZEL}" font-weight="900" font-size="{size}" letter-spacing="7" fill="#3A2A10" opacity="0.8">{esc(text)}</text>')
        out.append(f'<text x="{f((x0 + x1) / 2)}" y="{f(ty)}" text-anchor="middle" font-family="{CINZEL}" font-weight="900" font-size="{size}" letter-spacing="7" fill="{metal_lin(card, key + "-gl", GOLD_RICH, 0, 0, 0, 1)}">{esc(text)}</text>')
    up = lg(card, key + "-up", [(0, light, 0.05), (1, light, 0.35)], 0, 0, 0, 1)
    out.append(f'<path d="{d}" fill="{up}" style="mix-blend-mode:screen"/>')
    return "".join(out)


def laurel(cx, cy, r, color, a0=200, a1=340, side=1, n=9):
    out = []
    for i in range(n):
        a = a0 + (a1 - a0) * i / (n - 1)
        x, y = pt(cx, cy, r, a)
        rot = a + (90 if side > 0 else -90)
        out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="6" ry="2.6" fill="{color}" transform="rotate({f(a + 50)} {f(x)} {f(y)})"/>')
    out.append(f'<path d="M{f(pt(cx, cy, r, a0)[0])} {f(pt(cx, cy, r, a0)[1])} A{r} {r} 0 0 1 {f(pt(cx, cy, r, a1)[0])} {f(pt(cx, cy, r, a1)[1])}" fill="none" stroke="{color}" stroke-width="1.4"/>')
    return "".join(out)


def palmette(card, x, y, s=1.0, key="pal"):
    """Un acrotère en palmette dorée."""
    g = metal_lin(card, key, GOLD_RICH, 0, 0, 1, 1)
    bv = bevel(card, key + "-bv", 0.8, 2.6, 1.0, 20, shadow=(0, 2, 2, 0.6))
    leaves = []
    for a in (-60, -36, -12, 12, 36, 60):
        leaves.append(f'<ellipse cx="0" cy="-16" rx="4.2" ry="15" fill="{g}" transform="rotate({a})"/>')
    leaves.append(f'<path d="M-12 2 Q0 -8 12 2 L10 8 L-10 8 Z" fill="{g}"/><circle cx="0" cy="-2" r="4" fill="{g}"/>')
    return f'<g transform="translate({f(x)} {f(y)}) scale({f(s)})" filter="{bv}">{"".join(leaves)}</g>'


def lamp_post(card, x, ground, h=120, key="lp"):
    """Un lampadaire de bronze à globe allumé."""
    g = cyl_grad(card, key + "-g", ("#E8C890", "#7A5A2A", "#2A1A08"))
    top = ground - h
    out = [halo(card, key + "-h", x, top - 4, 70, 70, "#FFD48A", 0.55)]
    out.append(f'<rect x="{f(x - 3.5)}" y="{f(top + 10)}" width="7" height="{f(h - 10)}" fill="{g}"/>')
    out.append(f'<path d="M{f(x - 12)} {f(ground)} L{f(x + 12)} {f(ground)} L{f(x + 7)} {f(ground - 16)} L{f(x - 7)} {f(ground - 16)} Z" fill="{g}"/>')
    out.append(f'<path d="M{f(x - 10)} {f(top + 12)} L{f(x + 10)} {f(top + 12)} L{f(x + 6)} {f(top + 6)} L{f(x - 6)} {f(top + 6)} Z" fill="{g}"/>')
    glob = rg(card, key + "-gl", [(0, "#FFFFFF"), (0.4, "#FFF0C8"), (1, "#FFB85A")], 0.4, 0.35, 0.6)
    out.append(f'<circle cx="{f(x)}" cy="{f(top - 6)}" r="12" fill="{glob}"/>')
    out.append(f'<path d="M{f(x - 5)} {f(top - 18)} L{f(x + 5)} {f(top - 18)} L{f(x)} {f(top - 26)} Z" fill="{g}"/>')
    return "".join(out)


def dentils(x0, x1, y, h=8, step=12, color="#8E8478", light="#FFFFFF"):
    out = []
    x = x0
    while x < x1:
        out.append(f'<rect x="{f(x)}" y="{f(y)}" width="{f(step * 0.55)}" height="{f(h)}" fill="{color}" opacity="0.85"/>'
                   f'<rect x="{f(x)}" y="{f(y)}" width="{f(step * 0.55)}" height="1.4" fill="{light}" opacity="0.6"/>')
        x += step
    return "".join(out)


def skyline(card, key, x0, x1, base, seed=3, color="#0A0E26"):
    rnd = random.Random(seed)
    out = []
    x = x0
    while x < x1:
        w = rnd.uniform(26, 50)
        h = rnd.uniform(70, 190)
        out.append(f'<rect x="{f(x)}" y="{f(base - h)}" width="{f(w + 1)}" height="{f(h)}" fill="{color}"/>')
        for wy in range(int(base - h + 8), int(base - 6), 11):
            for wx in range(int(x + 5), int(x + w - 4), 8):
                if rnd.random() < 0.38:
                    out.append(f'<rect x="{wx}" y="{wy}" width="3.4" height="5" fill="#FFD48A" opacity="{f(rnd.uniform(0.5, 1))}"/>')
        x += w + rnd.uniform(2, 8)
    return "".join(out)


def reserve_a():
    c = start("ra", "#3A2C24", "#100A0C", "#FFD9A0", 0.26)
    win = rrect(98, 254, 442, 722, 6)
    with masked(c, win, "w"):
        c.add(night_sky(c, "sky", "#030616", "#0E1A46", "#2A2A5A", 5, 260))
        for k, (x, a, col) in enumerate(((-20, 22, "#FFF2D0"), (560, -22, "#FFF2D0"), (120, 40, "#D8E4FF"), (420, -40, "#D8E4FF"))):
            c.add(beam(c, f"b{k}", x, 900, a, 1100, 7, col, 0.55, 5))
        wall = "M0 192 L540 192 L540 960 L0 960 Z"
        c.add(marble(c, wall, "wall", ("#F6E8D0", "#B8A285", "#3A3038"), (0.3, 0.26, 0.24), 9, op=0.3))
        c.add(f'<path d="{wall}" fill="{lg(c, "wsh", [(0, "#0A1030", 0.6), (0.6, "#0A1030", 0.2), (1, "#FFB45A", 0.25)])}"/>')
        c.add(f'<path d="{rrect(84, 240, 456, 736, 10)}" fill="none" stroke="#1E1206" stroke-width="22"/>')
        c.add(gold_frame(c, rrect(90, 246, 450, 730, 8), "door", BRASS, 6))
        rel = (laurel(270, 136, 56, "#E8C77A", 200, 330, 1) + laurel(270, 136, 56, "#E8C77A", 30, 160, 1)
               + lingot_stack(c, 160, 184, (3, 2, 1), 28, 8, 12, "rl", shadow=False)
               + lingot_stack(c, 380, 184, (3, 2, 1), 28, 8, 12, "rl", shadow=False))
        c.add(pediment(c, 26, 514, 42, 192, "pd", NIGHT_MARBLE, "#FFC77A", rel))
        c.add(palmette(c, 270, 36, 1.0, "pal"))
        c.add(entablature(c, -10, 550, 192, 248, "en", NIGHT_MARBLE, "RÉSERVE MEESHY", 21))
        c.add(dentils(-6, 546, 192, 7, 12, "#6A6270"))
        c.add(column(c, 46, 248, 728, 62, "cl", ("#FFFFFF", "#E6D8C4", "#6A6270"), "#FFC77A", True, 8))
        c.add(column(c, 494, 248, 728, 62, "cr", ("#FFFFFF", "#E6D8C4", "#6A6270"), "#FFC77A", True, 8))
        c.add(steps(c, 30, 510, 728, 4, 9, 8, "st", ("#F6F0E6", "#CFC5B6", "#6A6270"), 14, "#FFC77A"))
        plaza = "M0 796 L540 796 L540 960 L0 960 Z"
        c.add(f'<path d="{plaza}" fill="{lg(c, "pz", [(0, "#2A2230"), (1, "#07060C")])}"/>')
        for x in (30, 150, 270, 390, 510):
            c.add(f'<rect x="{x - 6}" y="800" width="12" height="160" fill="{lg(c, "rf", [(0, "#FFD48A", 0.4), (1, "#FFD48A", 0)])}" filter="{soft(c, 4)}"/>')
        carpet = poly([(206, 722), (334, 722), (352, 796), (188, 796)])
        c.add(f'<path d="{carpet}" fill="{lg(c, "cp", [(0, "#7A0A1C"), (1, "#B3182A")])}"/>')
        c.add(f'<path d="M206 722 L188 796 M334 722 L352 796" stroke="#F0C24B" stroke-width="2"/>')
        for k in range(4):
            yy = 728 + k * 17
            c.add(f'<line x1="{f(206 - k * 4.4)}" y1="{yy + 8}" x2="{f(334 + k * 4.4)}" y2="{yy + 8}" stroke="#3A040C" stroke-width="1" opacity="0.6"/>')
        c.add(halo(c, "fl1", 46, 730, 70, 26, "#FFC77A", 0.7))
        c.add(halo(c, "fl2", 494, 730, 70, 26, "#FFC77A", 0.7))
    c.add(grade(c, win, "#FFD9A0", 0.5, 0.0, 0.26, 0.9, "gr"))
    c.add(window_depth(c, win, 0.7, 34, 12))
    sw = smooth([(104, 262), (190, 298), (270, 306), (350, 298), (436, 262)])
    c.add(f'<path d="{segs_d(sw)}" fill="none" stroke="#5A3A08" stroke-width="7" opacity="0.6" transform="translate(0 3)" filter="{soft(c, 2)}"/>')
    for x, y, a in sample(sw, 7):
        c.add(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="6" ry="2.6" fill="#E8C77A" transform="rotate({f(a + 40)} {f(x)} {f(y)})"/>'
              f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="6" ry="2.6" fill="#B8862A" transform="rotate({f(a - 40)} {f(x)} {f(y)})"/>')
    c.add(gem(270, 308, 7, "rubis", 0, 8, 1.0))
    c.add(emblem(c, 270, 136, 44, "Réserve", halo_op=0.5))
    c.add(lamp_post(c, 140, 796, 96, "lp1"))
    c.add(lamp_post(c, 400, 796, 96, "lp2"))
    c.add(lingot_stack(c, 58, 930, (4, 3, 2, 1), 38, 11, 16, "ls1"))
    c.add(lingot_stack(c, 482, 930, (4, 3, 2, 1), 38, 11, 16, "ls2"))
    c.add(halo(c, "lsg1", 58, 900, 70, 46, "#FFD27A", 0.35))
    c.add(halo(c, "lsg2", 482, 900, 70, 46, "#FFD27A", 0.35))
    birds(c, [("meo-roi", 50, 150, 96, False, -4), ("mee-fete", 490, 150, 96, True, 4)])
    c.add(text_panel(c, 120, 800, 420, 924, 18, "#0A0C1E", 0.88, None, 1.6, "tp"))
    c.add(gold_frame(c, rrect(120, 800, 420, 924, 18), "pf", GOLD_RICH, 4))
    c.add(inscription(c, "Réserve", None, y=802, ink="#FFF4DC", accent="#F6C85A", title_size=40))
    save(c, "reserve", "Réserve", "a", "La façade de la Réserve",
         "La photo s'ouvre comme la grande porte d'une banque néoclassique : fronton gravé « RÉSERVE MEESHY » où la Meesh tient lieu de médaillon entre lauriers et lingots, "
         "colonnes cannelées éclairées par en dessous, tapis rouge sur les marches de marbre, lampadaires et piles d'or, sous les projecteurs d'une nuit de fête.",
         "libre (sur l'entablement)", None)


def reserve_b():
    from cosmos import deep_space, golden_galaxy, roundel, zoom_cone, scale_label
    c = start("rb", "#22284A", "#0A0C1A", "#FFD9A0", 0.24)
    win = rrect(86, 250, 454, 688, 18)
    with masked(c, win, "w"):
        c.add(deep_space(c, "sky", 7))
        c.add(golden_galaxy(c, 270, 134, 262, "gx", 0.36, 0.5, 11))
        for x, a in ((150, -14), (390, 14)):
            c.add(beam(c, f"bm{x}", x, 700, a, 760, 6, "#FFE6B0", 0.4, 6))
    c.add(grade(c, win, "#FFD9A0", 0.5, 0.0, 0.18, 0.9, "gr"))
    c.add(window_depth(c, win, 0.6, 30, 12))
    c.add(gold_frame(c, win, "wf", GOLD_RICH, 4))
    c.add(f'<path d="{rrect(94, 258, 446, 680, 12)}" fill="none" stroke="#FFE2A0" stroke-width="0.8" opacity="0.5"/>')
    # les deux échelles de loupes : l'infiniment grand à gauche, l'infiniment petit à droite
    ys = (292, 390, 488, 586)
    R = 29
    rails = (
        (45, (("toile", "10", "24", (8, -5), 4.2), ("galaxie", "10", "21", (11, 3), 3.6), ("soleil", "10", "13", (7.2, -5.3), 3.0), ("terre", "10", "7", None, 0))),
        (495, (("lingot", "10", "-1", (-2, -6), 4.0), ("cristal", "10", "-9", (2.6, -9.6), 3.4), ("atome", "10", "-10", (0, 0), 3.6), ("noyau", "10", "-14", None, 0))),
    )
    for side, (rx, items) in enumerate(rails):
        for k, (kind, mant, exp, focus, fr) in enumerate(items):
            y = ys[k]
            c.add(roundel(c, rx, y, R, kind, f"rd{side}{k}"))
            if focus:
                s = R / 30
                c.add(zoom_cone(c, (rx + focus[0] * s, y + focus[1] * s), fr * s, (rx, ys[k + 1]), R, f"zc{side}{k}"))
        for k, (kind, mant, exp, focus, fr) in enumerate(items):
            y = ys[k] + R + 13
            c.add(f'<rect x="{rx - 19}" y="{y - 9.5}" width="38" height="13" rx="6.5" fill="#0A0820" opacity="0.88" stroke="#E8C77A" stroke-width="0.6"/>')
            c.add(scale_label(rx, y, mant, exp))
    for x, y, r in ((40, 60, 9), (500, 210, 7), (130, 36, 5), (420, 52, 6), (230, 232, 4), (520, 120, 5)):
        c.add(glint(x, y, r, "#FFFFFF", 0.9))
    c.add(emblem(c, 270, 134, 50, "Réserve", halo_op=0.7))
    # le bâtiment, vu d'en bas : fronton, frise (l'inscription), chapiteaux
    stone = ("#FFFBF4", "#E8DCC8", "#9A8C7A")
    rel = (f'<g filter="{bevel(c, "relbv", 0.8, 2.2, 0.9, 18, shadow=(0, 1.5, 1.2, 0.5))}">{signature_bars(270, 738, 0.66, "#E8C77A", w=7)}</g>'
           + laurel(270, 738, 32, "#E8C77A", 200, 320, 1) + laurel(270, 738, 32, "#E8C77A", 40, 160, 1)
           + "".join(sparkle(x, y, r_, "#F0D08A", 0.9) for x, y, r_ in ((170, 752, 7), (206, 728, 4), (370, 752, 7), (334, 728, 4), (120, 762, 4), (420, 762, 4))))
    c.add(pediment(c, -10, 550, 664, 772, "pd", stone, "#FFC77A", rel))
    c.add(palmette(c, 270, 652, 0.9, "pal"))
    c.add(dentils(-6, 546, 772, 7, 12, "#9A8C7A"))
    c.add(entablature(c, -10, 550, 772, 900, "en", stone, None, light="#FFC77A"))
    c.add(entablature(c, -10, 550, 904, 926, "ar", stone, "RÉSERVE MEESHY", 13, light="#FFC77A"))
    for k, x in enumerate((40, 160, 380, 500)):
        c.add(column(c, x, 926, 1060, 70, f"cl{k}", ("#FFFFFF", "#E2D8C8", "#7A7068"), "#FFC77A", True, 8))
    c.add(gold_frame(c, rrect(108, 782, 432, 900, 10), "frz", GOLD_RICH, 3))
    for rx_ in (64, 476):
        c.add(f'<circle cx="{rx_}" cy="838" r="20" fill="none" stroke="#C9A24A" stroke-width="2"/>'
              f'<circle cx="{rx_}" cy="838" r="12" fill="#E8C77A" opacity="0.8"/>')
        c.add(signature_bars(rx_, 838, 0.24, "#7A4A0A", w=7))
    hi_ = inscription(c, "Réserve", None, y=774 + 1.2, ink="#FFFFFF", accent="#FFFFFF", shadow=False, title_size=44)
    lo_ = inscription(c, "Réserve", None, y=774, ink="#3A2410", accent="#7A4A0A", shadow=False, title_size=44, sub_color="#4A3418")
    c.add(f'<g opacity="0.6">{hi_}</g>{lo_}')
    birds(c, [("mee-montee-au-ciel", 94, 686, 104, False, -6), ("meo-bravo", 444, 690, 100, True, 6)])
    save(c, "reserve", "Réserve", "b", "La Réserve des étoiles",
         "Au sommet du Trésor, la Réserve s'ouvre sur le cosmos : la Meesh devient le cœur d'or d'une galaxie spirale, et deux échelles de loupes "
         "descendent les puissances de dix — à gauche l'infiniment grand (toile cosmique, galaxie, système solaire, Terre), à droite l'infiniment petit "
         "(lingot, maille cristalline de l'or, atome d'or à 79 électrons, noyau). En bas, le fronton de la banque porte l'inscription.",
         "libre (sur le fronton)", None)


def coffers(card, key, vp=(270, 330), top=0, bottom=236, color="#2A1A0C"):
    """Une voûte à caissons vue d'en dessous : caissons en perspective, double ressaut, rosace d'or au fond de chacun."""
    cx = vp[0]
    rows = [236, 216, 190, 154, 104, 34, -60]

    def X(k, y):
        fr = (y - top) / (bottom - top)
        return cx + k * (20 + 58 * (1 - fr))

    rib = lg(card, key + "-rib", [(0, "#F4E2B4"), (0.5, "#C9A55E"), (1, "#7A5A24")], 0, 0, 0, 1)
    rec = lg(card, key + "-rec", [(0, "#1A0E04"), (1, "#4A3012")], 0, 0, 0, 1)
    rec2 = lg(card, key + "-rec2", [(0, "#0E0602"), (1, "#2E1C08")], 0, 0, 0, 1)
    rbv = bevel(card, key + "-rbv", 0.6, 2.0, 1.0, 20, shadow=None)
    out = [f'<rect x="0" y="-10" width="540" height="{bottom + 10}" fill="{rib}"/>']
    ros = []
    for j in range(len(rows) - 1):
        ya, yb = rows[j], rows[j + 1]
        for k in range(-9, 9):
            q = [(X(k, ya), ya), (X(k + 1, ya), ya), (X(k + 1, yb), yb), (X(k, yb), yb)]
            if max(p[0] for p in q) < -20 or min(p[0] for p in q) > 560:
                continue

            def inset(t):
                mx = sum(p[0] for p in q) / 4
                my = sum(p[1] for p in q) / 4
                return [(mx + (p[0] - mx) * (1 - t), my + (p[1] - my) * (1 - t)) for p in q]

            out.append(f'<path d="{poly(inset(0.12))}" fill="{rec}"/>')
            out.append(f'<path d="{poly(inset(0.3))}" fill="{rec2}"/>')
            i1 = inset(0.12)
            out.append(f'<path d="M{f(i1[3][0])} {f(i1[3][1])} L{f(i1[2][0])} {f(i1[2][1])}" stroke="#FFE7B0" stroke-width="0.9" opacity="0.5"/>')
            mx = sum(p[0] for p in q) / 4
            my = sum(p[1] for p in q) / 4
            w = abs(q[1][0] - q[0][0])
            r = w * 0.13
            if r > 1.6:
                petals = "".join(f'<ellipse cx="{f(mx)}" cy="{f(my - r * 0.55)}" rx="{f(r * 0.32)}" ry="{f(r * 0.6)}" transform="rotate({a} {f(mx)} {f(my)})" fill="#F0C24B"/>' for a in range(0, 360, 45))
                ros.append(petals + f'<circle cx="{f(mx)}" cy="{f(my)}" r="{f(r * 0.35)}" fill="#FFF4C2"/>')
    out.append(f'<g filter="{rbv}">{"".join(ros)}</g>')
    out.append(f'<rect x="0" y="-10" width="540" height="{bottom + 10}" fill="{lg(card, key + "-sh", [(0, "#000000", 0.35), (0.7, "#000000", 0.0), (1, "#FFD27A", 0.15)], 0, 0, 0, 1)}"/>')
    return "".join(out)


def reserve_c():
    c = start("rc", "#3A2C1C", "#120C06", "#FFD9A0", 0.28)
    x0, x1, spring, y1 = 98, 442, 424, 716
    win = arch(x0, x1, spring, y1, 16)
    with masked(c, win, "w"):
        c.add(marble(c, full_rect(), "wall", ("#FFF8EC", "#E2D2B8", "#8A7458"), (0.36, 0.3, 0.24), 6, op=0.4))
        ceil = "M0 0 L540 0 L540 236 L0 236 Z"
        c.add(f'<path d="{ceil}" fill="{lg(c, "ceil", [(0, "#120A04"), (1, "#3A2410")])}"/>')
        c.add(coffers(c, "cf", (270, 330), 0, 236))
        c.add(f'<g style="mix-blend-mode:screen">{halo(c, "ocl", 270, 142, 230, 170, "#FFD27A", 0.6)}</g>')
        c.add(f'<rect x="0" y="230" width="540" height="14" fill="{metal_lin(c, "cor", GOLD_RICH, 0, 0, 0, 1, 2)}"/>')
        c.add(f'<rect x="0" y="244" width="540" height="6" fill="#000000" opacity="0.35"/>')
        floor = "M0 730 L540 730 L540 960 L0 960 Z"
        c.add(f'<path d="{floor}" fill="#1E1A14"/>')
        vp = (270, 520)
        tiles = []
        for j in range(8):
            ya = 730 + (j ** 1.6) * 7
            yb = 730 + ((j + 1) ** 1.6) * 7
            for i in range(-12, 12):
                def X(i_, y_):
                    return vp[0] + i_ * 46 * (y_ - vp[1]) / (730 - vp[1])
                if (i + j) % 2 == 0:
                    tiles.append(f'<path d="{poly([(X(i, ya), ya), (X(i + 1, ya), ya), (X(i + 1, yb), yb), (X(i, yb), yb)])}" fill="#F2E8D8"/>')
                else:
                    tiles.append(f'<path d="{poly([(X(i, ya), ya), (X(i + 1, ya), ya), (X(i + 1, yb), yb), (X(i, yb), yb)])}" fill="#1E3A30"/>')
        c.add("".join(tiles))
        refl = lg(c, "refl", [(0, "#FFE6B0", 0.6), (1, "#FFE6B0", 0)])
        c.add(f'<path d="M110 730 L430 730 L520 960 L20 960 Z" fill="{refl}" style="mix-blend-mode:screen" filter="{soft(c, 6)}"/>')
        c.add(f'<line x1="0" y1="730" x2="540" y2="730" stroke="#E8C77A" stroke-width="2"/>')
        # l'archivolte de marbre et sa clé d'or
        cxa = (x0 + x1) / 2
        rxa = (x1 - x0) / 2
        band = arch(x0 - 26, x1 + 26, spring, y1, 0)
        c.add(f'<path d="{band}" fill="#000000" opacity="0.45" transform="translate(0 6)" filter="{soft(c, 8)}"/>')
        c.add(marble(c, band, "arc", ("#FFFFFF", "#F0E6D4", "#B8A88E"), (0.34, 0.3, 0.26), 8, op=0.4))
        for k in range(13):
            a = -90 + 180 * k / 12
            xa, ya = pt(cxa, spring, rxa, a)
            xb, yb = pt(cxa, spring, rxa + 26, a)
            c.add(f'<line x1="{f(xa)}" y1="{f(ya)}" x2="{f(xb)}" y2="{f(yb)}" stroke="#9A8A70" stroke-width="1" opacity="0.8"/>')
        c.add(gold_frame(c, arch(x0 - 26, x1 + 26, spring, y1, 0), "ao", GOLD_RICH, 4))
        for sx in (-1, 1):
            px = 270 + sx * 236
            c.add(column(c, px, 250, 730, 56, f"col{sx}", ("#FFFFFF", "#EDE3D2", "#9A8C7A"), "#FFC77A", False, 8))
        c.add(lingot_stack(c, 78, 728, (4, 3, 2, 1), 44, 12, 18, "ls1"))
        c.add(lingot_stack(c, 462, 728, (4, 3, 2, 1), 44, 12, 18, "ls2"))
        c.add(halo(c, "gl", 270, 470, 320, 360, "#FFE6B0", 0.25))
    c.add(grade(c, win, "#FFE6B0", 0.5, 0.0, 0.24, 0.9, "gr"))
    c.add(window_depth(c, win, 0.55, 28, 10))
    c.add(gold_frame(c, win, "wf", GOLD_RICH, 4))
    key_ = poly([(250, 246), (290, 246), (284, 282), (256, 282)])
    c.add(f'<path d="{key_}" fill="{metal_lin(c, "key", GOLD_RICH, 0, 0, 1, 1)}" filter="{bevel(c, "kbv", 1, 3, 1, 22, shadow=(0, 3, 3, 0.6))}"/>')
    c.add(signature_bars(270, 264, 0.32, "#7A4A0A", w=7))
    # l'oculus doré où pend la Meesh
    c.add(f'<line x1="270" y1="0" x2="270" y2="80" stroke="#C9A24A" stroke-width="2"/>')
    c.add(chain(c, smooth([(270, 0), (270, 40), (270, 84)]), 8, GOLD, "chn"))
    c.add(f'<circle cx="270" cy="142" r="76" fill="none" stroke="{metal_lin(c, "oc", GOLD_RICH, 0, 0, 1, 1, 2)}" stroke-width="8" filter="{bevel(c, "ocbv", 1, 3, 1, 22, shadow=(0, 4, 4, 0.6))}"/>')
    c.add(rays(270, 142, 84, 118, 36, "#FFE2A0", 1.6, -180, 175, 0.8))
    c.add(emblem(c, 270, 142, 58, "Réserve", halo_op=0.5))
    bird(c, "duo-mee-selfie", 416, 662, 214, flip=True, rotate=0)
    pl = rrect(104, 762, 436, 918, 16)
    c.add(f'<path d="{pl}" fill="#000000" opacity="0.55" transform="translate(0 8)" filter="{soft(c, 10)}"/>')
    c.add(marble(c, pl, "plq", ("#FFFFFF", "#F2EADC", "#BDB09A"), (0.34, 0.3, 0.26), 12, op=0.35))
    c.add(gold_frame(c, pl, "plf", GOLD_RICH, 5))
    hi_ = inscription(c, "Réserve", "Bâtie pierre à pierre", y=764 + 1.2, ink="#FFFFFF", accent="#FFFFFF", shadow=False, title_size=40, msg_color="#FFFFFF")
    lo_ = inscription(c, "Réserve", "Bâtie pierre à pierre", y=764, ink="#2E2010", accent="#8A5A12", shadow=False, title_size=40, sub_color="#4A3418", msg_color="#7A3A10")
    c.add(f'<g opacity="0.6">{hi_}</g>{lo_}')
    save(c, "reserve", "Réserve", "c", "Le grand hall",
         "À l'intérieur de la Réserve : voûte à caissons ornés de rosaces d'or, Meesh suspendue dans un oculus rayonnant, archivolte de marbre à clé d'or, "
         "colonnes, murs de lingots et sol en damier qui reflète la lumière — on y entre en selfie avec Mee et Meo.",
         "selfie (le duo)", "Bâtie pierre à pierre")


FRAMES = {
    "tresor-a": tresor_a,
    "tresor-b": tresor_b,
    "reserve-a": reserve_a,
    "reserve-b": reserve_b,
    "reserve-c": reserve_c,
}
