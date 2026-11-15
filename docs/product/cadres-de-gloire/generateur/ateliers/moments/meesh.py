"""Les Meeshes frappées : nº 1 (la première), nº 10 (argent), nº 100 (édition or), nº 1000 (édition prisme).

La pièce est frappée en grand, en haut du cadre ; chaque édition a son écrin, sa lumière et ses éclats."""

import math
import random

from base import Card, W, H, f, pt, esc, photo, bird, mee_meo, sparkle, SANS, CINZEL, CINZEL_DECO, HAND
from kit import (group, rrect, arch, oval, circle_d, ring_d, ogive, octo, deco_mask, clip, bevel, noise, wobble, metal_grad,
                 rim, inner_shadow, grade, halo, lgrad, dust, bright_stars, outer_frame, inscription, smooth_closed, smooth_open, glints)
from mint import coin, strike_burst, flakes, guilloche, guilloche_band, laurel
from emblem import catmull, ruban_birds
from cosmos import spiked_star

ROSEGOLD = ("#FFE9DE", "#E8A48A", "#7E3A2C")
SILVER = ("#FFFFFF", "#CBD5E2", "#56627A")
GOLD = ("#FFF6CC", "#E8B53C", "#7A4E0E")
PRISM = ("#FFFFFF", "#D8CCFF", "#4C3BA4")
PHOTO_FREE = (84, 256, 456, 724)
DATE_LEGEND = "OCTOBRE 2026"


def kicker(edition):
    return f"Meesh frappée · {edition}"


# ---------------------------------------------------------------- nº 1 : la première

def petal(x, y, s, rot, fill, op=0.9):
    return (
        f'<path d="M0 {f(-s)} C{f(s * 0.7)} {f(-s * 0.7)} {f(s * 0.62)} {f(s * 0.5)} 0 {f(s)} C{f(-s * 0.5)} {f(s * 0.4)} {f(-s * 0.8)} {f(-s * 0.6)} 0 {f(-s)} Z" '
        f'fill="{fill}" opacity="{f(op)}" transform="translate({f(x)} {f(y)}) rotate({f(rot)})"/>'
    )


def bow(card, cx, cy, name="bow"):
    """Un nœud de satin : deux boucles, un nœud serré, deux pans coupés en V."""
    sat = card.grad(name + "-s", [(0, "#FFD6E0"), (0.35, "#F08AA8"), (0.7, "#C2456A"), (1, "#7A1A3A")], 0, 0, 0, 1)
    sat2 = card.grad(name + "-s2", [(0, "#7A1A3A"), (0.4, "#D85A80"), (0.6, "#FFC2D2"), (1, "#A8304E")], 0, 0, 1, 0)
    out = []
    for sx in (-1, 1):
        tail = (f"M{f(cx + sx * 4)} {f(cy + 4)} C{f(cx + sx * 16)} {f(cy + 22)} {f(cx + sx * 26)} {f(cy + 38)} {f(cx + sx * 34)} {f(cy + 56)} "
                f"L{f(cx + sx * 24)} {f(cy + 50)} L{f(cx + sx * 20)} {f(cy + 62)} C{f(cx + sx * 14)} {f(cy + 42)} {f(cx + sx * 6)} {f(cy + 24)} {f(cx - sx * 2)} {f(cy + 8)} Z")
        out.append(f'<path d="{tail}" fill="{sat2}"/>')
    for sx in (-1, 1):
        loop = (f"M{f(cx)} {f(cy)} C{f(cx + sx * 20)} {f(cy - 30)} {f(cx + sx * 62)} {f(cy - 30)} {f(cx + sx * 58)} {f(cy - 4)} "
                f"C{f(cx + sx * 56)} {f(cy + 18)} {f(cx + sx * 22)} {f(cy + 14)} {f(cx)} {f(cy)} Z")
        inner = (f"M{f(cx + sx * 8)} {f(cy - 2)} C{f(cx + sx * 22)} {f(cy - 18)} {f(cx + sx * 46)} {f(cy - 18)} {f(cx + sx * 46)} {f(cy - 4)}")
        out.append(f'<path d="{loop}" fill="{sat}"/>')
        out.append(f'<path d="{inner}" fill="none" stroke="#7A1A3A" stroke-width="1.6" opacity="0.5"/>')
        out.append(f'<path d="M{f(cx + sx * 14)} {f(cy - 14)} Q{f(cx + sx * 34)} {f(cy - 24)} {f(cx + sx * 50)} {f(cy - 14)}" fill="none" stroke="#FFFFFF" stroke-width="2" opacity="0.55" stroke-linecap="round"/>')
    out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy + 1)}" rx="10" ry="11" fill="{sat}"/>')
    out.append(f'<path d="M{f(cx - 5)} {f(cy - 7)} Q{f(cx)} {f(cy - 9)} {f(cx + 4)} {f(cy - 6)}" fill="none" stroke="#FFFFFF" stroke-width="1.6" opacity="0.6"/>')
    return f'<g filter="{card.shadow(name + "-sh", 0, 4, 4, "#2A0410", 0.55)}">{"".join(out)}</g>'


def premiere():
    c = Card("ms1")
    photo(c, top="#3A2228", bottom="#140A0C", rim="#FFC2B0", glow=0.22)
    win = arch(84, 456, 446, 302, 726)
    cx, cy = 270, 150
    with group(c, f'mask="{deco_mask(c, win)}"'):
        c.add(f'<rect width="{W}" height="{H}" fill="{lgrad(c, "vel", [(0, "#3A0A1E", 1), (0.5, "#4E0E26", 1), (1, "#22040F", 1)])}"/>')
        c.add(f'<rect width="{W}" height="{H}" filter="{noise(c, "velN", "0.9", 2, 3, 1.4, -0.55)}" fill="#FF9FB8" opacity="0.18"/>')
        for i, x in enumerate((26, 62, 478, 514)):
            c.add(f'<rect x="{x - 14}" y="300" width="28" height="660" fill="{lgrad(c, f"fold{i}", [(0, "#000000", 0), (0.5, "#FFB8C8", 0.12), (1, "#000000", 0)], 0, 0, 1, 0)}" filter="{c.blur("fb", 3)}"/>')
        lid = f"M0 0 L{W} 0 L{W} 470 Q270 430 0 470 Z"
        pleats = []
        for i in range(48):
            a0 = i * 7.5
            pts = [pt(cx, cy, rr, a0 + 6 * math.sin(rr / 140)) for rr in range(0, 920, 40)]
            pts2 = [pt(cx, cy, rr, a0 + 3.2 + 6 * math.sin(rr / 140 + 0.4)) for rr in range(0, 920, 40)]
            col = "#FFF4EE" if i % 2 == 0 else "#EBCFC6"
            pleats.append(f'<path d="M{" L".join(f"{f(x)} {f(y)}" for x, y in pts + pts2[::-1])} Z" fill="{col}"/>')
        satin = c.rgrad("satin", [(0, "#FFFFFF", 0.0), (0.35, "#F6D2CC", 0.15), (1, "#7A2A3A", 0.7)], 0.5, 0.16, 0.9)
        c.add(f'<g clip-path="{clip(c, lid, "lidc")}"><rect width="{W}" height="{H}" fill="#F2DDD4"/><g filter="{c.blur("pl", 3.2)}" opacity="0.85">{"".join(pleats)}</g>'
              f'<rect width="{W}" height="{H}" fill="{satin}"/>'
              f'<rect width="{W}" height="{H}" fill="{c.rgrad("lidl", [(0, "#FFFFFF", 0.55), (1, "#FFFFFF", 0)], 0.5, 0.15, 0.4)}"/></g>')
        c.add(f'<path d="M0 476 Q270 436 {W} 476 L{W} 540 Q270 500 0 540 Z" fill="#12020A" opacity="0.6" filter="{c.blur("lidsh", 9)}"/>')
        piping = metal_grad(c, "pip", ROSEGOLD, 0, 0, 1, 0)
        c.add(f'<g filter="{bevel(c, "pipbv", 0.9, 2.2, sd=3, dy=3, sop=0.6)}"><path d="M0 470 Q270 430 {W} 470" fill="none" stroke="{piping}" stroke-width="6"/>'
              f'<path d="M0 478 Q270 438 {W} 478" fill="none" stroke="{piping}" stroke-width="2.4"/></g>')
        hg = metal_grad(c, "hinge", ROSEGOLD, 0, 0, 0, 1)
        for hx in (40, 500):
            hy = 470 - 40 * (1 - ((hx - 270) / 270) ** 2) + 2
            c.add(f'<g filter="{bevel(c, "hgbv", 1.0, 2.6, sd=3, dy=3, sop=0.6)}">'
                  f'<rect x="{hx - 16}" y="{f(hy - 13)}" width="32" height="26" rx="4" fill="{hg}"/>'
                  f'<rect x="{hx - 16}" y="{f(hy - 3)}" width="32" height="6" fill="{c.grad("hgk", [(0, "#7E3A2C"), (0.5, "#FFE9DE"), (1, "#7E3A2C")], 0, 0, 1, 0)}"/></g>'
                  f'<circle cx="{hx - 9}" cy="{f(hy - 8)}" r="1.6" fill="#7E3A2C"/><circle cx="{hx + 9}" cy="{f(hy - 8)}" r="1.6" fill="#7E3A2C"/>'
                  f'<circle cx="{hx - 9}" cy="{f(hy + 8)}" r="1.6" fill="#7E3A2C"/><circle cx="{hx + 9}" cy="{f(hy + 8)}" r="1.6" fill="#7E3A2C"/>')
        c.add(halo(c, cx, cy, 230, "#FFFFFF", 0.5, "spot"))
        rnd = random.Random(11)
        pg = c.grad("pet", [(0, "#FFD6DE"), (0.6, "#F08AA8"), (1, "#B83A62")], 0, 0, 1, 1)
        petals = []
        for _ in range(26):
            x, y = rnd.uniform(10, 530), rnd.uniform(260, 950)
            if 76 < x < 464 and 290 < y < 736:
                continue
            petals.append(petal(x, y, rnd.uniform(6, 12), rnd.uniform(0, 360), pg, rnd.uniform(0.7, 0.95)))
        c.add(f'<g filter="{c.shadow("pets", 0, 3, 2.5, "#000000", 0.5)}">{"".join(petals)}</g>')
        c.add(dust(12, 160, (0, 240, W, H), ["#FFE3C8", "#FFFFFF", "#FFC2D0"], 0.4, 1.4, 0.3, 0.9, avoid=PHOTO_FREE))
    c.add(inner_shadow(c, win, 40, 14, 0.5))
    c.add(grade(c, win, "#FFC2B0", 0.5, -0.1, 0.26, 0.9, "gr"))
    c.add(rim(c, win, ROSEGOLD, 5))
    c.add(f'<ellipse cx="{cx}" cy="{cy + 104}" rx="100" ry="16" fill="#3A0A1E" opacity="0.45" filter="{c.blur("cush", 7)}"/>')
    c.add(coin(c, cx, cy, 98, ROSEGOLD, f"MEESH Nº 1 · LA PREMIÈRE · {DATE_LEGEND} · ", 1, "duo-main-dans-la-main", "cn", pose_size=122, pose_dy=-0.12))
    c.add(bow(c, cx, cy + 112))
    c.add(glints([(cx - 66, cy - 62, 11, 1), (cx + 80, cy + 30, 7, 0.9), (cx + 40, cy - 92, 5, 0.8)]))
    c.add(outer_frame(c, ROSEGOLD, inner_op=0.5))
    mee_meo(c, "pied", "mee-lettre", "meo-serenade")
    inscription(c, kicker("La première"), "Meesh nº 1", metal=ROSEGOLD, panel=("#4A0E26", "#1A0410"), accent="#FFC2B0", ink="#FFF1EA",
                message="Ma toute première", msg_color="#FFE3D6")
    return c


# ---------------------------------------------------------------- nº 10 : argent

def milled(card, d, color, w=10, name="ml"):
    """La tranche cannelée posée autour d'une fenêtre : des stries serrées perpendiculaires au bord."""
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" stroke-dasharray="1.3 2.4" opacity="0.85"/>'


def argent():
    c = Card("ms10")
    photo(c, top="#24303E", bottom="#0A0E16", rim="#CFE6FF", glow=0.22)
    win = rrect(84, 290, 456, 726, 22)
    cx, cy = 270, 150
    with group(c, f'mask="{deco_mask(c, win)}"'):
        c.add(f'<rect width="{W}" height="{H}" fill="{c.rgrad("bg", [(0, "#1E3258", 1), (0.5, "#0C1832", 1), (1, "#040812", 1)], 0.5, 0.18, 0.95)}"/>')
        line = "#A8C2E8"
        c.add(f'<g opacity="0.75">{guilloche(cx, cy, 200, 47, 120, line, 0.45, 0.45, 110)}{guilloche(cx, cy, 150, 37, 64, line, 0.4, 0.5, 110, 4)}</g>')
        for x0 in (14, 466):
            c.add(guilloche_band(x0, 300, x0 + 60, 940, line, 7, None, 0.55, 0.6, 11))
        for (gx, gy) in ((56, 914), (484, 914)):
            c.add(guilloche(gx, gy, 72, 19, 50, line, 0.4, 0.55, 100))
        c.add(halo(c, cx, cy, 260, "#DCEBFF", 0.45, "flash"))
        for i, (r, w, op) in enumerate(((112, 3, 0.7), (138, 1.6, 0.5), (176, 1, 0.35), (230, 0.8, 0.22))):
            c.add(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#FFFFFF" stroke-width="{w}" opacity="{op}" filter="{c.blur(f"sw{i}", 1.2 + i)}"/>')
        burst = strike_burst(c, "sb", cx, cy, 100, 420, 120, 13, ["#FFFFFF", "#DCEBFF", "#9FC2FF"], (0.6, 2.2), (0.3, 0.9))
        c.add(f'<g filter="{c.blur("sbg", 2)}">{burst}</g>', burst)
        c.add(flakes(c, "fk", 14, 70, (0, 0, W, 960), SILVER, avoid=PHOTO_FREE, size=(3, 8)))
        c.add(bright_stars(15, 8, (10, 240, 530, 950), "#FFFFFF", 3, 7, avoid=(70, 270, 470, 740)))
    c.add(inner_shadow(c, win, 40, 14, 0.5))
    c.add(grade(c, win, "#CFE6FF", 0.5, -0.1, 0.26, 0.9, "gr"))
    c.add(milled(c, win, "#DDE6F2", 13))
    c.add(rim(c, win, SILVER, 5))
    c.add(coin(c, cx, cy, 104, SILVER, f"MEESH Nº 10 · ARGENT · {DATE_LEGEND} · ", 10, "meo-salut", "cn"))
    c.add(glints([(cx - 70, cy - 60, 12, 1), (cx + 80, cy + 22, 8, 0.9)]))
    c.add(outer_frame(c, SILVER, inner_op=0.5))
    bird(c, "mee-bravo", 66, 444, 126, rotate=14)
    bird(c, "meo-muscles", 474, 486, 126, flip=True, rotate=-14)
    inscription(c, kicker("Argent"), "Meesh nº 10", metal=SILVER, panel=("#16264A", "#060A18"), accent="#CFE0F8", ink="#FFFFFF")
    return c


# ---------------------------------------------------------------- nº 100 : édition or

def deco_fan(cx, cy, r0, r1, a0, a1, n, color, op=0.9, w=1.2):
    out = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        x0, y0 = pt(cx, cy, r0, a)
        x1, y1 = pt(cx, cy, r1, a)
        out.append(f'<line x1="{f(x0)}" y1="{f(y0)}" x2="{f(x1)}" y2="{f(y1)}" stroke="{color}" stroke-width="{w}" opacity="{op}"/>')
    return "".join(out)


def or_edition():
    c = Card("ms100")
    photo(c, top="#2E2418", bottom="#0E0A06", rim="#FFD98A", glow=0.22)
    win = octo(82, 296, 458, 726, 34)
    cx, cy = 270, 150
    gold = metal_grad(c, "gl", GOLD)
    with group(c, f'mask="{deco_mask(c, win)}"'):
        c.add(f'<rect width="{W}" height="{H}" fill="{c.rgrad("bg", [(0, "#2A200E", 1), (0.45, "#120E08", 1), (1, "#050403", 1)], 0.5, 0.16, 0.95)}"/>')
        rays = []
        for i in range(36):
            a0, a1 = i * 10, i * 10 + 5
            p0, p1 = pt(cx, cy, 900, a0), pt(cx, cy, 900, a1)
            rays.append(f'<path d="M{cx} {cy} L{f(p0[0])} {f(p0[1])} L{f(p1[0])} {f(p1[1])} Z" fill="#E8B53C" opacity="0.12"/>')
        c.add("".join(rays))
        c.add(halo(c, cx, cy, 250, "#FFD98A", 0.5, "gh"))
        steps = "".join(
            f'<path d="{octo(82 - k * 14, 296 - k * 14, 458 + k * 14, 726 + k * 14, 34 + k * 6)}" fill="none" stroke="{gold}" stroke-width="{1.4 if k % 2 else 0.8}" opacity="{0.9 - k * 0.12}"/>'
            for k in range(1, 5)
        )
        c.add(steps)
        for sx, a0, a1 in ((30, 0, 90), (510, -90, 0)):
            c.add(deco_fan(sx, 932, 10, 120, a0, a1, 14, "#E8B53C", 0.6, 1))
            c.add(f'<path d="M{sx - 0.1} 932 m-34 0 a34 34 0 0 1 68 0" fill="none" stroke="{gold}" stroke-width="2"/>')
        rnd = random.Random(21)
        leaves = []
        for _ in range(30):
            x, y = rnd.uniform(10, 530), rnd.uniform(240, 950)
            if 70 < x < 470 and 286 < y < 736:
                continue
            s = rnd.uniform(4, 11)
            pts = [(x + s * math.cos(a) * rnd.uniform(0.6, 1.2), y + s * math.sin(a) * rnd.uniform(0.4, 1)) for a in (i * math.pi / 3 for i in range(6))]
            leaves.append(f'<path d="{smooth_closed(pts)}" fill="{gold}" opacity="{f(rnd.uniform(0.7, 1))}" transform="rotate({f(rnd.uniform(0, 90))} {f(x)} {f(y)})"/>')
        c.add(f'<g filter="{c.shadow("lvs", 0, 2, 2, "#000000", 0.6)}">{"".join(leaves)}</g>')
        c.add(dust(22, 160, (0, 0, W, H), ["#FFE9A8", "#FFFFFF"], 0.3, 1.2, 0.3, 0.9, avoid=PHOTO_FREE))
    c.add(inner_shadow(c, win, 40, 14, 0.5))
    c.add(grade(c, win, "#FFD98A", 0.5, -0.1, 0.26, 0.9, "gr"))
    c.add(rim(c, win, GOLD, 5))
    c.add(f'<path d="{octo(92, 306, 448, 716, 28)}" fill="none" stroke="#FFE9A8" stroke-width="0.8" opacity="0.7"/>')
    c.add(laurel(c, cx, cy, 116, 196, 330, -1, GOLD, "lauL", 12, 17))
    c.add(laurel(c, cx, cy, 116, 164, 30, 1, GOLD, "lauR", 12, 17))
    burst = strike_burst(c, "sb", cx, cy, 104, 220, 60, 23, ["#FFF6CC", "#FFE08A", "#FFFFFF"], (0.6, 1.8), (0.3, 0.8))
    c.add(f'<g filter="{c.blur("sbg", 1.6)}">{burst}</g>')
    c.add(coin(c, cx, cy, 100, GOLD, f"MEESH Nº 100 · ÉDITION OR · {DATE_LEGEND} · ", 100, "duo-bravo", "cn", pose_size=128, pose_dy=-0.1))
    c.add(glints([(cx - 74, cy - 62, 13, 1), (cx + 86, cy + 24, 8, 0.9), (cx + 30, cy - 96, 6, 0.8)]))
    c.add(outer_frame(c, GOLD, inner_op=0.55))
    inscription(c, kicker("Édition or"), "Meesh nº 100", metal=GOLD, panel=("#2A200E", "#0A0804"), accent="#F5D58A", ink="#FFF6E0",
                shape="octo", message="Cent fois merci", msg_color="#FFF2D0")
    ruban_birds(c, "mee-jackpot", "meo-champagne")
    return c


# ---------------------------------------------------------------- nº 1000 : édition prisme

SPECTRUM = ("#FF4D6D", "#FF9F40", "#FFE14D", "#5CFF8A", "#40C8FF", "#5B6CFF", "#B04DFF")


def spectrum_fan(card, name, ox, oy, a0, spread, r, op=0.55):
    """Un éventail de lumière décomposée : sept bandes de couleur qui s'ouvrent depuis (ox, oy)."""
    out = []
    n = len(SPECTRUM)
    for i, col in enumerate(SPECTRUM):
        b0 = a0 + spread * i / n
        b1 = a0 + spread * (i + 1) / n
        p0, p1 = pt(ox, oy, r, b0), pt(ox, oy, r, b1)
        g = card.rgrad(f"{name}-{i}", [(0, col, op), (0.7, col, op * 0.5), (1, col, 0)], 0, 0, 1)
        out.append(f'<path d="M{f(ox)} {f(oy)} L{f(p0[0])} {f(p0[1])} L{f(p1[0])} {f(p1[1])} Z" fill="{col}" opacity="{f(op)}"/>')
    return f'<g filter="{card.blur(name + "-b", 6)}" style="mix-blend-mode:screen">{"".join(out)}</g>'


def quartz(card, cx, cy, s, rot, palette):
    """Une pointe de quartz : trois faces éclairées depuis le haut à gauche, arêtes vives, reflet."""
    def P(x, y):
        a = math.radians(rot)
        return cx + (x * math.cos(a) - y * math.sin(a)) * s, cy + (x * math.sin(a) + y * math.cos(a)) * s

    tip = P(0, -1)
    A, B, C, D = P(-0.3, -0.5), P(-0.3, 0.82), P(-0.07, 0.94), P(-0.07, -0.42)
    E, F, G, H = P(0.13, 0.94), P(0.13, -0.42), P(0.3, 0.82), P(0.3, -0.5)

    def poly(*pts):
        return "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + " Z"

    l, m, r = palette
    out = [
        f'<path d="{poly(tip, A, B, C, D)}" fill="{l}" opacity="0.9"/>',
        f'<path d="{poly(tip, D, C, E, F)}" fill="{m}" opacity="0.95"/>',
        f'<path d="{poly(tip, F, E, G, H)}" fill="{r}" opacity="0.88"/>',
        f'<path d="M{f(tip[0])} {f(tip[1])} L{f(D[0])} {f(D[1])} L{f(C[0])} {f(C[1])} M{f(tip[0])} {f(tip[1])} L{f(F[0])} {f(F[1])} L{f(E[0])} {f(E[1])}" '
        f'fill="none" stroke="#FFFFFF" stroke-width="{f(max(0.6, s * 0.02))}" opacity="0.75"/>',
        f'<path d="{poly(tip, A, B, C, E, G, H)}" fill="none" stroke="#FFFFFF" stroke-width="{f(max(0.6, s * 0.018))}" opacity="0.5"/>',
    ]
    hx, hy = P(-0.16, -0.3)
    out.append(f'<path d="M{f(hx)} {f(hy)} L{f(P(-0.12, 0.5)[0])} {f(P(-0.12, 0.5)[1])}" stroke="#FFFFFF" stroke-width="{f(s * 0.05)}" stroke-linecap="round" opacity="0.35"/>')
    return "".join(out)


def crystal(card, name, cx, cy, s, rot, seed):
    """Une druse de cristaux taillés : une grande pointe et deux plus petites, facettes irisées, halo de lumière décomposée."""
    rnd = random.Random(seed)
    pals = [
        (card.grad("qz-l", [(0, "#F2EDFF"), (1, "#7A68D8")], 0, 0, 0, 1), card.grad("qz-m", [(0, "#FFFFFF"), (0.6, "#D6F4FF"), (1, "#7FC8F0")], 0, 0, 0, 1),
         card.grad("qz-r", [(0, "#FFE6F6"), (1, "#9A58C8")], 0, 0, 0, 1)),
        (card.grad("qz-l2", [(0, "#FFF6E0"), (1, "#C88A4A")], 0, 0, 0, 1), card.grad("qz-m2", [(0, "#FFFFFF"), (1, "#FFD6EC")], 0, 0, 0, 1),
         card.grad("qz-r2", [(0, "#E6FFF6"), (1, "#4AA8A0")], 0, 0, 0, 1)),
    ]
    pal = pals[seed % 2]
    out = [halo(card, cx, cy, s * 1.3, "#D8CCFF", 0.45, name + "-h")]
    out.append(quartz(card, cx - s * 0.36, cy + s * 0.32, s * 0.55, rot - 28, pal))
    out.append(quartz(card, cx + s * 0.34, cy + s * 0.38, s * 0.48, rot + 30, pals[(seed + 1) % 2]))
    out.append(quartz(card, cx, cy, s * 0.9, rot, pal))
    out.append(sparkle(cx - s * 0.08, cy - s * 0.82, s * 0.22, "#FFFFFF", 0.95))
    return f'<g filter="{card.shadow(name + "-sh", 0, 4, 4, "#000000", 0.5)}">{"".join(out)}</g>'


def prisme():
    c = Card("ms1000")
    photo(c, top="#262038", bottom="#0A0816", rim="#E6DEFF", glow=0.22)
    win = octo(82, 300, 458, 726, 40)
    cx, cy = 270, 152
    with group(c, f'mask="{deco_mask(c, win)}"'):
        c.add(f'<rect width="{W}" height="{H}" fill="{c.rgrad("bg", [(0, "#241A4A", 1), (0.5, "#0C0820", 1), (1, "#030208", 1)], 0.5, 0.16, 0.95)}"/>')
        c.add(dust(31, 240, (0, 0, W, H), ["#FFFFFF", "#E6DEFF", "#C2F2FF"], 0.3, 1.2, 0.25, 0.9))
        beam = lgrad(c, "beam", [(0, "#FFFFFF", 0), (0.6, "#FFFFFF", 0.6), (1, "#FFFFFF", 0.95)], 0, 0, 1, 1)
        c.add(f'<path d="M-40 -30 L-6 -60 L{cx + 10} {cy - 4} L{cx - 6} {cy + 10} Z" fill="{beam}" filter="{c.blur("bm", 3)}"/>')
        c.add(spiked_star(c, "src", 30, 30, 34, "#FFFFFF"))
        c.add(spectrum_fan(c, "fl", cx, cy, 196, 44, 900, 0.5))
        c.add(spectrum_fan(c, "fr", cx, cy, 120, 44, 900, 0.5))
        c.add(spectrum_fan(c, "fd", cx, cy, 166, 28, 900, 0.22))
        for i, (x, y, s, r) in enumerate(((40, 340, 46, -14), (500, 420, 40, 16), (30, 640, 34, 8), (512, 690, 42, -10), (46, 910, 50, 6), (494, 920, 44, -8))):
            c.add(crystal(c, f"cr{i}", x, y, s, r, 40 + i))
        c.add(bright_stars(33, 14, (10, 10, 530, 950), "#FFFFFF", 3, 9, avoid=(70, 280, 470, 740)))
    c.add(inner_shadow(c, win, 40, 14, 0.5))
    c.add(grade(c, win, "#E6DEFF", 0.5, -0.1, 0.24, 0.9, "gr"))
    c.add(f'<path d="{win}" fill="none" stroke="{c.prism("rp", 0, 0, 1, 1)}" stroke-width="9" opacity="0.55" filter="{c.blur("rpg", 6)}"/>')
    c.add(rim(c, win, PRISM, 4.5))
    c.add(f'<path d="{win}" fill="none" stroke="{c.prism("rp2", 1, 0, 0, 1)}" stroke-width="1.6"/>')
    c.add(halo(c, cx, cy, 190, "#FFFFFF", 0.55, "ch"))
    burst = strike_burst(c, "sb", cx, cy, 106, 260, 90, 34, list(SPECTRUM) + ["#FFFFFF"] * 3, (0.6, 2.0), (0.4, 0.95))
    c.add(f'<g filter="{c.blur("sbg", 1.6)}">{burst}</g>', burst)
    holo = c.def_once("holo", f'<linearGradient id="{c.id("holo")}" x1="0" y1="0" x2="1" y2="1">'
                      + "".join(f'<stop offset="{f(i / 10)}" stop-color="{col}"/>' for i, col in enumerate(("#FFFFFF", "#FFC2E6", "#C8B4FF", "#9FE8FF", "#FFFFFF", "#FFF0A8", "#FFB8DA", "#B8A4FF", "#A8F0FF", "#FFFFFF", "#FFD0EE")))
                      + "</linearGradient>")
    field = c.def_once("holoF", f'<linearGradient id="{c.id("holoF")}" x1="0.1" y1="1" x2="0.9" y2="0">'
                       + "".join(f'<stop offset="{f(i / 8)}" stop-color="{col}"/>' for i, col in enumerate(("#E8DEFF", "#FFE0F2", "#FFFFFF", "#D6F6FF", "#EDE4FF", "#FFF6D6", "#FFFFFF", "#F2D8FF", "#DCF2FF")))
                       + "</linearGradient>")
    c.add(coin(c, cx, cy, 104, PRISM, f"MEESH Nº 1000 · ÉDITION PRISME · {DATE_LEGEND} · ", 1000, "duo-on-danse", "cn", face_fill=holo, rim_fill=holo,
               pose_size=118, field=field, numeral_fill=c.grad("np", [(0, "#3A1E8A"), (1, "#5A2AA8")]), relief=("#FFFFFF", "#A898F4", "#2E2088")))
    sheen = "".join(f'<path d="M{f(cx - 140 + k * 46)} {f(cy + 120)} L{f(cx - 60 + k * 46)} {f(cy - 120)} L{f(cx - 48 + k * 46)} {f(cy - 120)} L{f(cx - 128 + k * 46)} {f(cy + 120)} Z" fill="#FFFFFF" opacity="{0.22 if k % 2 else 0.12}"/>' for k in range(6))
    c.add(f'<g clip-path="{clip(c, circle_d(cx, cy, 104), "shc")}" style="mix-blend-mode:screen">{sheen}</g>')
    c.add(f'<circle cx="{cx}" cy="{cy}" r="104" fill="{c.prism("cover", 0, 0, 1, 1)}" opacity="0.18" style="mix-blend-mode:color"/>')
    c.add(glints([(cx - 76, cy - 64, 14, 1), (cx + 88, cy + 26, 9, 1), (cx + 34, cy - 100, 7, 0.9), (cx - 96, cy + 40, 6, 0.8)]))
    c.add(outer_frame(c, PRISM, inner_op=0.6))
    c.add(f'<rect x="12" y="12" width="{W - 24}" height="{H - 24}" rx="24" fill="none" stroke="{c.prism("ofp", 0, 0, 1, 1)}" stroke-width="1.6" opacity="0.9"/>')
    mee_meo(c, "selfie", meo="meo-selfie")
    inscription(c, kicker("Édition prisme"), "Meesh nº 1000", metal=PRISM, panel=("#1C1440", "#05030F"), accent="#D8CCFF", ink="#FFFFFF",
                border=c.prism("ins-pr", 0, 0, 1, 1), title_size=38, shape="octo", message="Mille mercis", msg_color="#FFE6F6",
                title_fill=c.grad("tP", [(0, "#FFFFFF"), (0.5, "#F2E8FF"), (1, "#C2B2FF")]))
    return c


FRAMES = [
    ("moments-meesh-1", premiere, dict(rank="Meesh frappée", division=None, option="nº 1 · la première", name="L'Écrin",
     story="La toute première Meesh repose dans son écrin ouvert : un couvercle de satin plissé en soleil sur ses charnières d'or rose, un velours grenat, une pièce d'or rose où Mee et Meo se tiennent la main en relief, et quelques pétales tombés là, comme après une fête.",
     layout="pied (Mee lettre, Meo sérénade)", message="Ma toute première")),
    ("moments-meesh-10", argent, dict(rank="Meesh frappée", division=None, option="nº 10 · argent", name="La Frappe d'argent",
     story="La pièce d'argent vient d'être frappée : onde de choc, rais blancs et paillettes de métal jaillissent sur un fond de guillochis bleu nuit, ces rosaces de graveur des billets et des montres ; la fenêtre porte une tranche cannelée.",
     layout="côtés (Mee bravo, Meo muscles, rentrés dans le cadre)", message=None)),
    ("moments-meesh-100", or_edition, dict(rank="Meesh frappée", division=None, option="nº 100 · édition or", name="L'Édition d'or",
     story="Une pièce d'or couronnée de laurier rayonne dans un soleil Art déco ; des cadres en gradins et des éventails dorés encadrent la photo, et des feuilles d'or tombent comme une pluie de fête.",
     layout="ruban (Mee jackpot, Meo champagne)", message="Cent fois merci")),
    ("moments-meesh-1000", prisme, dict(rank="Meesh frappée", division=None, option="nº 1000 · édition prisme", name="L'Édition Prisme",
     story="Un rai de lumière blanche, venu d'une étoile, frappe la pièce holographique et se décompose en deux éventails d'arc-en-ciel qui coulent de part et d'autre de la photo, entre des druses de quartz aux facettes irisées.",
     layout="selfie (Meo selfie)", message="Mille mercis")),
]
