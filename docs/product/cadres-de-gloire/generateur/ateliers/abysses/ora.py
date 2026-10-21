"""Abysses - Orateur A, B, C : la voix et la lumière. Le chant des baleines, l'éclipse de la manta, l'aube de Ganvié."""

import math
import random

from common import *  # noqa: F401,F403
from sea import place, jellyfish, manta, manta_path, whale, school, manta2, manta2_path
from reef import coral, seafan, anemone, seagrass, scallop, mix
from afrique import stilt_house, pirogue, baobab, dhow, applique_band, abomey_tenture, far_village, egret, woven
from amb import reef_fish, soft_coral, reef_side


def sunburst(card, name, cx, cy, n, R, cols, op=0.4, width=0.55, a0=0, sd=2.5):
    """Rayons de lumière en éventail, fondus vers l'extérieur."""
    grads = []
    for k, col in enumerate(cols):
        gid = f"{name}-rg{k}"
        card.def_once(gid, f'<radialGradient id="{card.id(gid)}" gradientUnits="userSpaceOnUse" cx="{f(cx)}" cy="{f(cy)}" r="{f(R)}">'
                           f'<stop offset="0" stop-color="{col}" stop-opacity="{op}"/><stop offset="0.55" stop-color="{col}" stop-opacity="{op * 0.45}"/>'
                           f'<stop offset="1" stop-color="{col}" stop-opacity="0"/></radialGradient>')
        grads.append(f"url(#{card.id(gid)})")
    out = []
    for i in range(n):
        a = a0 + 360 * i / n
        half = 180 / n * width * (1.0 if i % 2 == 0 else 0.55)
        p1 = pt(cx, cy, R, a - half)
        p2 = pt(cx, cy, R, a + half)
        out.append(f'<path d="M{f(cx)} {f(cy)} L{f(p1[0])} {f(p1[1])} L{f(p2[0])} {f(p2[1])} Z" fill="{grads[i % len(grads)]}"/>')
    return f'<g filter="{blur(card, name + "-b", sd)}" style="mix-blend-mode:screen">{"".join(out)}</g>'


def song_arcs(card, name, cx, cy, n, r0, step, a0, a1, color, w=1.6, dash="6 5"):
    out = []
    for k in range(n):
        r = r0 + k * step
        p0 = pt(cx, cy, r, a0)
        p1 = pt(cx, cy, r, a1)
        large = 1 if (a1 - a0) > 180 else 0
        op = 0.9 * (1 - k / (n + 1))
        out.append(f'<path d="M{f(p0[0])} {f(p0[1])} A{f(r)} {f(r)} 0 {large} 1 {f(p1[0])} {f(p1[1])}" fill="none" stroke="{color}" stroke-width="{f(w)}" '
                   f'stroke-linecap="round" stroke-dasharray="{dash}" opacity="{f(op)}"/>')
    return f'<g filter="{glow(card, name + "-g", 2.2, 2)}">{"".join(out)}</g>'


# ---------------------------------------------------------------- Orateur A : le chant de la baleine

def song_ribbon(card, name, x, y0, y1, amp=16, cycles=7, cols=("#FFF1B8", "#FFD36E", "#BFFBFF"), phase=0.0):
    """Le chant de la baleine rendu visible : trois ondes d'or qui descendent le long de la photo, l'amplitude qui enfle et retombe."""
    out = []
    n = 160
    for k, col in enumerate(cols):
        pts = []
        for i in range(n + 1):
            t = i / n
            env = math.sin(math.pi * t) ** 0.7 * (0.55 + 0.45 * math.sin(t * 9 + k))
            pts.append((x + amp * env * math.sin(2 * math.pi * cycles * t + phase + k * 0.9), lerp(y0, y1, t)))
        out.append(f'<path d="{poly(pts, False)}" fill="none" stroke="{col}" stroke-width="{1.8 - k * 0.4}" opacity="{0.95 - k * 0.2}" stroke-linecap="round"/>')
    rnd = random.Random(int(x))
    for _ in range(14):
        t = rnd.random()
        out.append(sparkle(x + rnd.uniform(-amp, amp), lerp(y0, y1, t), rnd.uniform(2, 4.5), "#FFFFFF", rnd.uniform(0.6, 1)))
    return f'<g filter="{glow(card, name, 2.2, 2)}">{"".join(out)}</g>'


def ora_a():
    c = start("oa")
    win = arch(84, 456, 252, 724, 24, 140)
    parts = [
        water(c, [(0, "#2FC2D6"), (0.25, "#0E7FA6"), (0.6, "#08426C"), (1, "#031A33")]),
        sunburst(c, "sb", 270, 150, 36, 760, ("#FFF1B8", "#BFFBFF"), 0.42),
        caustic_band(c, "ca", 0, 240, op=0.55, seed=21),
        surface(c, "sf", 14, "#DFFFFF", 9, 4, 0.75),
        light_ripples(c, lambda k: arch(84 - 14 - k * 16, 456 + 14 + k * 16, 252 - 14 - k * 16, 724 + 14 + k * 10, 24 + k * 4, 140 + k * 16), 6, 16, "#FFF1B8", 1.8, 0.75, "rip", None),
        song_arcs(c, "sl", 196, 110, 7, 14, 13, 30, 150, "#FFF1B8", 2, "8 5"),
        song_arcs(c, "sr", 344, 110, 7, 14, 13, 210, 330, "#FFF1B8", 2, "8 5"),
        seagrass(3, 0, 120, 960, 90, "#2E8C6E", 30), seagrass(4, 420, 540, 960, 90, "#2E8C6E", 30),
        reef_side(c, -1, 61, 980, 760), reef_side(c, 1, 67, 980, 760),
        marine_snow(23, 130),
        song_ribbon(c, "sgL", 44, 170, 700, 17, 8, phase=0.0),
        song_ribbon(c, "sgR", 496, 170, 700, 17, 8, phase=1.7),
    ]
    deco(c, win, parts)
    c.add(place(whale(c, "wl", "natural"), 92, 112, 0.8, -9))
    c.add(place(whale(c, "wr", "natural"), 448, 112, 0.8, 9, flip=True))
    window_finish(c, win, GOLD, 6, tint="#FFF1B8", tint_op=0.16, glow_col="#FFF1B8")
    c.add(reef_side(c, -1, 5, 968, 600, front=True), reef_side(c, 1, 9, 968, 600, front=True))
    c.add(halo(c, "crest-sun", 270, 146, 130, "#FFF4C2", 0.55))
    c.add(song_arcs(c, "sc", 270, 146, 4, 84, 16, -62, 62, "#FFFFFF", 1.4, "3 6"))
    crest_block(c, 270, 142, 0.86, "gold", None, halo_col=None)
    bird(c, "meo-serenade", 92, 690, 150, False, -4)
    bird(c, "mee-danse", 448, 690, 150, True, 4)
    inscription(c, "Orateur", "Écoute la mer chanter", style="abysse", metal=GOLD)
    c.add(outer_frame(c, GOLD, 10, 3.5, 24, "of"))
    save(c, "orateur-a")
    register("orateur-a", "orateur", None, "A", "Le Chant des baleines",
             "Deux baleines à bosse se répondent au-dessus du blason : leur chant devient des ondes d'or qui descendent le long de la photo, "
             "et l'arche résonne en cercles de lumière dans un éventail de rayons venus de la surface ; corail cerveau, coraux mous et anémones écoutent au pied du cadre.",
             "libre : Meo (sérénade) et Mee (danse) au pied de l'arche", "Écoute la mer chanter")


# ---------------------------------------------------------------- Orateur B : l'éclipse de la manta

def ora_b():
    c = start("ob")
    win = rrect(84, 262, 456, 724, 28)
    rnd = random.Random(8)
    sparks = "".join(sparkle(rnd.uniform(10, 530), rnd.uniform(240, 940), rnd.uniform(2, 5), rnd.choice(("#FFF1B8", "#BFFBFF")), rnd.uniform(0.5, 1)) for _ in range(40))
    mcx, mcy, ms = 270, 140, 2.1
    corona = "".join(f'<circle cx="{mcx}" cy="{mcy - 6}" r="{r}" fill="none" stroke="#FFF1B8" stroke-width="{w}" opacity="{o}"/>' for r, w, o in ((236, 1.6, 0.6), (250, 0.9, 0.45), (268, 0.7, 0.3), (292, 0.6, 0.2)))
    far1, _ = manta2(c, "mf1", "ventre", 100, "#0E3550", "#BFF4FF", 80)
    far2, _ = manta2(c, "mf2", "ventre", 100, "#0E3550", "#BFF4FF", 80)
    far3, _ = manta2(c, "mf3", "ombre", 100, "#0A2C46", "#9FE8FF", 80)
    parts = [
        water(c, [(0, "#2AB4D2"), (0.3, "#0C6894"), (0.65, "#06305A"), (1, "#020F24")]),
        radial(c, "corona", 270, 120, 330, 280, "#FFF6CF", 0.95, 0.25),
        sunburst(c, "sb", 270, 120, 56, 920, ("#FFF1B8", "#FFFFFF", "#BFFBFF"), 0.55, 0.5),
        caustic_band(c, "ca", 0, 220, op=0.45, seed=33),
        surface(c, "sf", 12, "#FFFBE6", 5, 4, 0.7),
        f'<g filter="{glow(c, "cor", 2.5, 2)}">{corona}</g>',
        f'<g opacity="0.75">{place(far1, 52, 470, 0.36, 24)}{place(far2, 496, 600, 0.3, -20)}</g>',
        f'<g opacity="0.45" filter="{blur(c, "farb", 1.2)}">{place(far3, 470, 330, 0.22, -12)}{place(far3, 74, 680, 0.2, 18)}</g>',
        school(c, 41, lambda t: (-10 + 560 * t, 860 + 40 * math.sin(t * 6)), 160, 14, (0.9, 1.6)),
        school(c, 42, lambda t: (20 + 60 * t, 740 - 300 * t), 40, 10, (0.8, 1.3)),
        f'<g filter="{glow(c, "spk", 1.4, 1)}">{sparks}</g>',
        marine_snow(29, 140),
        f'<g opacity="0.9">{seafan(71, 30, 990, 300, 150, "#08243C", 1, 8, 2.2)}{seafan(72, 512, 990, 280, 140, "#08243C", 1, -8, 2.2)}</g>',
        f'<g opacity="0.55" style="mix-blend-mode:screen">{seafan(71, 31, 988, 300, 150, "#FFD98A", 0.7, 8, 0.6)}{seafan(72, 513, 988, 280, 140, "#FFD98A", 0.7, -8, 0.6)}</g>',
        coral(73, 8, 980, 120, 18, 14, 5, "#0A2A44", "#14466A", 26, polyps=False),
        coral(74, 532, 980, 110, -18, 14, 5, "#0A2A44", "#14466A", 26, polyps=False),
        bubble_column(c, 51, 40, 760, 300, 14, 1.4, 4.6), bubble_column(c, 52, 500, 740, 320, 14, 1.4, 4.6),
        f'<path d="M{mcx} {mcy + 56 * ms} Q{mcx + 6} {mcy + 90 * ms} {mcx - 10} {mcy + 140 * ms}" fill="none" stroke="#0B2C48" stroke-width="4" stroke-linecap="round"/>',
    ]
    deco(c, win, parts)
    window_finish(c, win, GOLD, 6, tint="#FFF6CF", tint_op=0.2, glow_col="#FFF1B8")
    big, d = manta2(c, "mb", "ombre", 100, "#0B2C48", "#FFF1B8", 0)
    c.add(f'<g transform="translate({mcx} {mcy}) scale({ms})">'
          f'<path d="{d}" fill="#FFF6CF" opacity="0.7" filter="{blur(c, "mrim", 3)}"/>{big}</g>')
    c.add(halo(c, "crest-sun", 270, 150, 100, "#FFF4C2", 0.45))
    crest_block(c, 270, 150, 0.86, "gold", None, halo_col=None)
    pts = manta2_path(100)
    rimpts = [pts[i] for i in (4, 12, 18, 26, 34, 38)]
    c.add(f'<g filter="{glow(c, "rimsp", 1.5, 2)}">' + "".join(sparkle(mcx + x * ms, mcy + y * ms, s, "#FFFFFF", 1) for (x, y), s in zip(rimpts, (7, 9, 6, 6, 9, 7))) + "</g>")
    for x, y in ((96, 274), (444, 274), (96, 712), (444, 712)):
        c.add(pearl(c, x, y, 7, "gold"))
    mee_meo(c, "pied", "mee-wow", "meo-trophee")
    inscription(c, "Orateur", None, style="abysse", metal=GOLD)
    c.add(outer_frame(c, GOLD, 10, 3.5, 24, "of"))
    save(c, "orateur-b")
    register("orateur-b", "orateur", None, "B", "L'Éclipse de la manta",
             "Une raie manta géante passe devant le soleil de la surface : sa silhouette cernée d'or éclipse la lumière, "
             "qui jaillit tout autour en couronne de rayons ; d'autres mantas, vues par en dessous, montrent leur ventre blanc, et un banc d'argent tourne dans le halo.",
             "pied : Mee (wow) et Meo (trophée)", None)


# ---------------------------------------------------------------- Orateur C : l'aube de Ganvié (Afrique)

def acadja(card, x, y, seed=2):
    """Acadja : les branchages plantés dans la lagune où les poissons viennent s'abriter."""
    rnd = random.Random(seed)
    out = []
    for i in range(9):
        bx = x + rnd.uniform(-22, 22)
        a = rnd.uniform(-14, 14)
        L = rnd.uniform(140, 260)
        x2, y2 = pt(bx, y + 200, L, a)
        out.append(f'<line x1="{f(bx)}" y1="{f(y + 200)}" x2="{f(x2)}" y2="{f(y2)}" stroke="#2A2014" stroke-width="{f(rnd.uniform(1.5, 3))}" opacity="0.75"/>')
        for k in range(3):
            t = rnd.uniform(0.3, 0.9)
            mx, my = bx + (x2 - bx) * t, y + 200 + (y2 - y - 200) * t
            ex, ey = pt(mx, my, rnd.uniform(14, 30), a + rnd.choice((-40, 40)))
            out.append(f'<line x1="{f(mx)}" y1="{f(my)}" x2="{f(ex)}" y2="{f(ey)}" stroke="#2A2014" stroke-width="1.2" opacity="0.7"/>')
    return f'<g opacity="0.8">{"".join(out)}</g>'


def lagoon_house(card, name, x, wl, w, h, roof, stilt, seed, rim="#FFC48A", under=600):
    """Une maison de Ganvié au premier plan : paroi tressée, toit de paille à trois rangs, fenêtre allumée, échelle, pilotis."""
    rnd = random.Random(seed)
    fl = wl - stilt
    above = []
    for i in range(5):
        sx = x + 6 + (w - 12) * i / 4
        above.append(f'<line x1="{f(sx)}" y1="{f(fl)}" x2="{f(sx + rnd.uniform(-1.5, 1.5))}" y2="{f(wl + 2)}" stroke="#2A160C" stroke-width="4.5"/>'
                     f'<line x1="{f(sx - 1.4)}" y1="{f(fl)}" x2="{f(sx - 1.4)}" y2="{f(wl)}" stroke="{rim}" stroke-width="0.9" opacity="0.6"/>')
    above.append(f'<rect x="{f(x - 8)}" y="{f(fl - 4)}" width="{f(w + 16)}" height="6" fill="#2A160C"/><line x1="{f(x - 8)}" y1="{f(fl - 4)}" x2="{f(x + w + 8)}" y2="{f(fl - 4)}" stroke="{rim}" stroke-width="1" opacity="0.7"/>')
    above.append(woven(card, name, x, fl - h, w, h - 4, "#6A4428", "#2A160C", rim))
    above.append(f'<rect x="{f(x + w * 0.42)}" y="{f(fl - h * 0.74)}" width="{f(w * 0.18)}" height="{f(h * 0.7)}" fill="#120A06"/>')
    above.append(f'<rect x="{f(x + w * 0.12)}" y="{f(fl - h * 0.66)}" width="{f(w * 0.16)}" height="{f(h * 0.26)}" fill="#FFD27A"/>'
                 f'<rect x="{f(x + w * 0.12)}" y="{f(fl - h * 0.66)}" width="{f(w * 0.16)}" height="{f(h * 0.26)}" fill="#FFB04A" opacity="0.6" filter="{blur(card, name + "-wl", 3)}"/>')
    lx = x + w * 0.5
    above.append(f'<line x1="{f(lx - 5)}" y1="{f(fl)}" x2="{f(lx - 8)}" y2="{f(wl + 4)}" stroke="#2A160C" stroke-width="2"/><line x1="{f(lx + 5)}" y1="{f(fl)}" x2="{f(lx + 2)}" y2="{f(wl + 4)}" stroke="#2A160C" stroke-width="2"/>'
                 + "".join(f'<line x1="{f(lx - 5 - k * 0.7)}" y1="{f(fl + k * 7)}" x2="{f(lx + 5 - k * 0.7)}" y2="{f(fl + k * 7)}" stroke="#2A160C" stroke-width="1.6"/>' for k in range(1, 5)))
    for k, (dy, inset, col) in enumerate(((0, 0, "#7A4E26"), (-roof * 0.36, w * 0.08, "#8A5A2C"), (-roof * 0.68, w * 0.16, "#9A6632"))):
        y0r = fl - h + 6 + dy
        top = y0r - roof * 0.42
        rp = f"M{f(x - 14 + inset)} {f(y0r)} L{f(x + w * 0.2 + inset)} {f(top)} L{f(x + w * 0.8 - inset)} {f(top)} L{f(x + w + 14 - inset)} {f(y0r)} Z"
        straw = "".join(f'<line x1="{f(lerp(x - 14 + inset, x + w + 14 - inset, j / 26))}" y1="{f(y0r)}" x2="{f(lerp(x + w * 0.2 + inset, x + w * 0.8 - inset, j / 26))}" y2="{f(top)}" stroke="#2A160C" stroke-width="0.7" opacity="0.35"/>' for j in range(27))
        fringe = "".join(f'<line x1="{f(lerp(x - 14 + inset, x + w + 14 - inset, j / 30))}" y1="{f(y0r)}" x2="{f(lerp(x - 14 + inset, x + w + 14 - inset, j / 30) + 1)}" y2="{f(y0r + 4)}" stroke="{col}" stroke-width="1.2"/>' for j in range(31))
        above.append(f'<path d="{rp}" fill="{col}"/>{straw}{fringe}<path d="M{f(x - 14 + inset)} {f(y0r)} L{f(x + w * 0.2 + inset)} {f(top)} L{f(x + w * 0.8 - inset)} {f(top)}" fill="none" stroke="{rim}" stroke-width="1.3" opacity="0.8"/>')
    gid = card.id(name + "-stg")
    card.def_once(name + "-stg", f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="0" y1="{f(wl)}" x2="0" y2="{f(wl + under)}">'
                                 f'<stop offset="0" stop-color="#1A1208" stop-opacity="0.95"/><stop offset="0.45" stop-color="#0E2A30" stop-opacity="0.55"/>'
                                 f'<stop offset="1" stop-color="#0E2A30" stop-opacity="0"/></linearGradient>')
    below = []
    for i in range(5):
        sx = x + 6 + (w - 12) * i / 4
        pts = [(sx + 4 * math.sin(k * 0.8 + i * 1.7), wl + k * under / 10) for k in range(11)]
        below.append(f'<path d="{smooth(pts, closed=False, n=4)}" fill="none" stroke="url(#{gid})" stroke-width="5"/>')
        below.append(f'<path d="{smooth([(px + 1.5, py) for px, py in pts], closed=False, n=4)}" fill="none" stroke="#FFC48A" stroke-width="0.8" opacity="0.3"/>')
        below.append("".join(f'<ellipse cx="{f(sx + rnd.uniform(-2, 2))}" cy="{f(wl + 40 + k * 70 + rnd.uniform(-10, 10))}" rx="3.6" ry="2" fill="#7FA060" opacity="0.5"/>' for k in range(4)))
    return "".join(above), "".join(below)


def acadja_bundle(card, x, y, seed=2, h=300, n=16, col="#3A2A16"):
    """Acadja : un parc de branchages fichés dans la vase de la lagune, où les poissons s'abritent et se nourrissent."""
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        bx = x + rnd.uniform(-30, 30)
        a = rnd.uniform(-10, 10)
        L = rnd.uniform(h * 0.55, h)
        x2, y2 = pt(bx, y, L, a)
        out.append(f'<path d="M{f(bx)} {f(y)} Q{f(pt(bx, y, L * 0.5, a + rnd.uniform(-6, 6))[0])} {f(pt(bx, y, L * 0.5, a)[1])} {f(x2)} {f(y2)}" fill="none" stroke="{col}" stroke-width="{f(rnd.uniform(1.4, 3.2))}" stroke-linecap="round"/>')
        for k in range(4):
            t = rnd.uniform(0.2, 0.95)
            mx, my = bx + (x2 - bx) * t, y + (y2 - y) * t
            ex, ey = pt(mx, my, rnd.uniform(10, 26), a + rnd.choice((-48, 48)))
            out.append(f'<line x1="{f(mx)}" y1="{f(my)}" x2="{f(ex)}" y2="{f(ey)}" stroke="{col}" stroke-width="1.1"/>')
            if rnd.random() < 0.4:
                out.append(f'<ellipse cx="{f(ex)}" cy="{f(ey)}" rx="3" ry="1.6" fill="#6E9A4A" opacity="0.7" transform="rotate({f(rnd.uniform(-40, 40))} {f(ex)} {f(ey)})"/>')
    return f'<g opacity="0.9">{"".join(out)}</g>'


def tilapia(card, cx, cy, s=1.0, flip=False, col="#C9B07A"):
    g = card.grad("tilg", [(0, "#F4E7C4"), (0.5, col), (1, "#6E5A38")])
    body = "M16 0 C12 -10 -2 -12 -12 -6 L-20 -11 L-18 0 L-20 11 L-12 6 C-2 12 12 10 16 0 Z"
    dors = "M-10 -7 C-4 -14 6 -14 12 -8 C4 -10 -4 -9 -10 -7 Z"
    bars = "".join(f'<path d="M{x} -8 Q{x + 1} 0 {x} 8" fill="none" stroke="#5A4A2A" stroke-width="1.6" opacity="0.4"/>' for x in (-6, 0, 6))
    sc = f"scale({f(-s)} {f(s)})" if flip else f"scale({f(s)})"
    return (f'<g transform="translate({f(cx)} {f(cy)}) {sc}"><path d="{dors}" fill="#8A6E3E"/><path d="{body}" fill="{g}"/>{bars}'
            f'<circle cx="10" cy="-2" r="1.7" fill="#0A0A12"/><circle cx="9.5" cy="-2.5" r="0.5" fill="#FFFFFF"/></g>')


def ora_c():
    c = start("oc")
    win = rrect(84, 256, 456, 724, 26)
    wl = 238
    sky = c.grad("sky", [(0, "#1C1040"), (0.3, "#5A2462"), (0.55, "#B8456A"), (0.78, "#F2875A"), (1, "#FFD27A")])
    rnd = random.Random(5)
    clouds = "".join(
        f'<ellipse cx="{f(rnd.uniform(-20, 560))}" cy="{f(y)}" rx="{f(rnd.uniform(60, 150))}" ry="{f(rnd.uniform(3, 6))}" fill="{col}" opacity="{f(rnd.uniform(0.35, 0.7))}"/>'
        for y, col in ((44, "#7A3A7A"), (58, "#A44A78"), (82, "#D86A70"), (96, "#E8806A"), (118, "#F49A62"), (66, "#9A4478"), (132, "#FFB86A"), (150, "#FFC478"))
        for _ in range(2))
    egrets = "".join(egret(x, y, s, "#2A1430", fl) for x, y, s, fl in ((130, 70, 0.9, 0.2), (156, 54, 0.7, 0.8), (176, 76, 0.6, 0.4), (388, 60, 0.75, 0.6), (410, 76, 0.6, 0.1)))
    above = [
        f'<rect width="{W}" height="{wl}" fill="{sky}"/>',
        f'<g filter="{blur(c, "cl", 2)}">{clouds}</g>',
        sunburst(c, "sb", 270, 200, 40, 560, ("#FFE7A8", "#FFB27A", "#FFF4D6"), 0.55),
        f'<circle cx="270" cy="200" r="200" fill="{c.rgrad("sunh", [(0, "#FFE7A8", 0.65), (0.4, "#FFB27A", 0.25), (1, "#FFB27A", 0)])}"/>',
        f'<circle cx="270" cy="204" r="88" fill="{c.rgrad("sun", [(0, "#FFFBE6", 1), (0.55, "#FFE08A", 1), (1, "#FF9A5C", 1)])}"/>',
        far_village(118, 236, wl - 1, "#6A2E4A", 3, 5, 0.85), far_village(304, 420, wl - 1, "#6A2E4A", 7, 5, 0.85),
        f'<path d="M150 {wl} Q200 {wl - 7} 250 {wl - 5} Q320 {wl - 8} 400 {wl}" fill="#5A2440" opacity="0.7"/>',
        baobab(196, wl - 4, 0.34, "#4A1E38", 7), baobab(366, wl - 5, 0.3, "#4A1E38", 9),
        egrets,
    ]
    hl, bl = lagoon_house(c, "hl", -6, wl, 98, 50, 50, 42, 2)
    hr, br = lagoon_house(c, "hr", 448, wl, 98, 50, 50, 42, 5)
    above += [f'<g filter="{c.shadow("hsh", 0, 0, 8, "#FF9A5C", 0.7)}">{hl}{hr}</g>',
              pirogue(170, wl - 1, 0.6, "#2A160C", rim="#FFC48A"), pirogue(380, wl, 0.44, "#2A160C", pole=False, rim="#FFC48A")]
    glints = "".join(f'<rect x="{f(270 + rnd.gauss(0, 46))}" y="{f(wl - 4 + rnd.uniform(-2, 3))}" width="{f(rnd.uniform(6, 26))}" height="1.5" fill="#FFF6D2" opacity="{f(rnd.uniform(0.5, 1))}"/>' for _ in range(40))
    sun_below = (f'<g filter="{blur(c, "sunb", 10)}" style="mix-blend-mode:screen"><ellipse cx="270" cy="{wl + 30}" rx="150" ry="40" fill="#FFD27A" opacity="0.55"/>'
                 f'<path d="M190 {wl} L350 {wl} L420 940 L120 940 Z" fill="#FFE0A0" opacity="0.12"/></g>')
    parts = [
        water(c, [(0, "#2A9AA0"), (0.28, "#0F6A7E"), (0.62, "#073A5A"), (1, "#03162A")]),
        sun_below,
        f'<g opacity="0.85">{bl}{br}</g>',
        shafts(c, "sh", 270, -420, wl, 720, 13, 13, spread=30, color="#FFE2A8", op=(0.1, 0.28), wt=(24, 56), wb=(60, 130), sd=9),
        caustic_band(c, "ca", wl, wl + 220, "#FFE7B8", 15, op=0.6),
        acadja_bundle(c, 30, 900, 3, 420, 16), acadja_bundle(c, 512, 900, 5, 420, 16),
        school(c, 5, lambda t: (8 + 76 * t, 420 + 300 * t), 60, 12, (0.9, 1.4), colors=("#F6E8C2", "#C9B07A", "#8A7448", "#F6E8C2")),
        school(c, 6, lambda t: (532 - 76 * t, 380 + 340 * t), 60, 12, (0.9, 1.4), colors=("#F6E8C2", "#C9B07A", "#8A7448", "#F6E8C2")),
        seagrass(9, 0, 120, 960, 120, "#3F8A5A", 46), seagrass(10, 420, 540, 960, 120, "#3F8A5A", 46),
        bubble_column(c, 7, 52, 880, 300, 12, 1.3, 4.2), bubble_column(c, 8, 490, 870, 320, 12, 1.3, 4.2),
        marine_snow(31, 140, "#FFE9C8"),
        "".join(above),
        glints,
        f'<rect x="0" y="{wl - 1}" width="{W}" height="2" fill="#FFF1C2" opacity="0.85"/>',
        f'<path d="M0 {wl + 1} Q135 {wl + 8} 270 {wl + 2} Q405 {wl - 4} 540 {wl + 3}" fill="none" stroke="#FFF6D2" stroke-width="1.2" opacity="0.6"/>',
    ]
    deco(c, win, parts)
    window_finish(c, win, GOLD, 6, tint="#FFD9A0", tint_op=0.24, glow_col="#FFD27A")
    c.add(tilapia(c, 44, 560, 1.1), tilapia(c, 500, 640, 1.0, True), tilapia(c, 60, 690, 0.8, False, "#B8A070"))
    c.add(f'<g filter="{c.shadow("apsh", 0, 3, 4, "#000000", 0.6)}">{abomey_tenture(c, 22, 896, 518, 48)}</g>')
    c.add(halo(c, "crest-sun", 270, 150, 120, "#FFF4C2", 0.55))
    crest_block(c, 270, 142, 0.86, "gold", None, halo_col=None)
    bird(c, "mee-sourire", 50, 72, 88, False, -4)
    bird(c, "meo-bravo", 490, 72, 88, True, 4)
    inscription(c, "Orateur", "Le jour se lève sur nous", style="abysse", metal=GOLD)
    c.add(outer_frame(c, GOLD, 10, 3.5, 24, "of"))
    save(c, "orateur-c")
    register("orateur-c", "orateur", None, "C", "L'Aube de Ganvié",
             "Une touche d'Afrique entre ciel et lagune : le soleil se lève derrière le blason sur Ganvié, la cité lacustre du lac Nokoué au Bénin — "
             "maisons de bambou tressé et de paille sur pilotis, village lointain, pirogues, aigrettes et baobabs sur la rive ; sous la surface, le soleil se brise "
             "en rais d'or le long des pilotis et des acadjas, les parcs de branchages où s'abritent les tilapias. Au pied du cadre, une tenture d'appliqués "
             "inspirée de celles des palais d'Abomey : le poisson échappé de la nasse de Houégbadja, le requin de Béhanzin, le soleil et la pirogue.",
             "perches : Mee (sourire) et Meo (bravo) sur les toits de paille", "Le jour se lève sur nous")


ALL = [ora_a, ora_b, ora_c]
