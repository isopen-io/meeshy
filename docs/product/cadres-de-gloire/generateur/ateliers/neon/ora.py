"""Atelier « Néon » : ORATEUR A, B, C — la voix et la lumière."""

import math
import random

from kit import *  # noqa: F401,F403
from afro import *  # noqa: F401,F403
from cosmos import *  # noqa: F401,F403


def speaker(card, cx, cy, w, h, color=MAGENTA, cone=CYAN):
    """Une enceinte de scène : caisson sombre, deux haut-parleurs cerclés de néon."""
    out = [f'<rect x="{f(cx - w / 2)}" y="{f(cy - h / 2)}" width="{f(w)}" height="{f(h)}" rx="6" fill="#0C0718" stroke="#2E2050" stroke-width="1.5"/>']
    geo = []
    for k, (yy, r) in enumerate(((cy - h * 0.22, w * 0.18), (cy + h * 0.16, w * 0.34))):
        out.append(f'<circle cx="{f(cx)}" cy="{f(yy)}" r="{f(r)}" fill="{card.rgrad(f"cone{k}", [(0, "#3A2A60", 1), (0.7, "#120A24", 1), (1, "#05030C", 1)])}"/>')
        geo.append(f'<circle cx="{f(cx)}" cy="{f(yy)}" r="{f(r)}"/>')
        out.append(f'<circle cx="{f(cx)}" cy="{f(yy)}" r="{f(r * 0.3)}" fill="#1C1236" stroke="{cone}" stroke-width="0.8"/>')
    out.append(tube(card, "".join(geo), cone, 1.3, 4))
    out.append(tube(card, f'<rect x="{f(cx - w / 2)}" y="{f(cy - h / 2)}" width="{f(w)}" height="{f(h)}" rx="6"/>', color, 1.4, 5))
    return "".join(out)


# ---------------------------------------------------------------- A : la voix-laser

def ora_a():
    c = start("oa", "#2A1446", "#0B0617", "#FF8FE0")
    win = rrect_d(86, 266, 454, 714, 14)
    m = window(c, win)
    sky = c.grad("sky", [(0, "#12052E"), (0.35, "#0A0420"), (1, "#020108")])
    body = [f'<rect width="{W}" height="{H}" fill="{sky}"/>']
    body.append(nebula_cloud(c, 270, 170, 330, 200, "#6A2CB8", "#2A0C5A", 0.55, seed=4, freq=0.01))
    body.append(nebula_cloud(c, 120, 520, 200, 260, "#5A1A8A", "#1A0838", 0.4, seed=9, freq=0.012))
    body.append(nebula_cloud(c, 440, 560, 200, 260, "#1A4A8A", "#0A1838", 0.4, seed=12, freq=0.012))
    # le faisceau de lasers, depuis le blason
    cols = (MAGENTA, CYAN, LIME, YELLOW)
    for k, col in enumerate(cols):
        geo = []
        for i in range(9):
            a = 96 + k * 4.5 + i * 19.5
            x2, y2 = pt(270, 150, 1100, a)
            geo.append(f'<line x1="270" y1="150" x2="{f(x2)}" y2="{f(y2)}"/>')
        body.append(tube(c, "".join(geo), col, 0.9, 4, op=0.75))
    # ondes sonores autour du blason
    rings = "".join(f'<path d="{arc_d(270, 150, r, -70, 70)}"/><path d="{arc_d(270, 150, r, 110, 250)}"/>' for r in (96, 128, 164, 204))
    body.append(tube(c, rings, CYAN, 1.3, 5, op=0.85))
    body.append(glow_spot(c, 270, 150, 140, 140, MAGENTA, 0.6))
    # l'égaliseur, deux tours de segments
    for x, seed, lvl in ((16, 1, 26), (36, 2, 31), (56, 3, 22), (468, 4, 24), (488, 5, 33), (508, 6, 28)):
        body.append(eq_column(c, seed, x, 724, 14, 36, 8, 4, lvl))
    # la scène : plancher en grille
    body.append(f'<rect y="724" width="{W}" height="236" fill="{c.grad("stage", [(0, "#140832"), (1, "#030108")])}"/>')
    body.append(grid(c, 724, VIOLET, gap=40, nh=9, depth=0.75, w=1, halo=3, op=0.8))
    body.append(horizon_glow(c, 724, MAGENTA, op=0.9))
    c.add(f'<g mask="{m}">{"".join(body)}</g>')
    # l'oscilloscope
    c.add(tube(c, f'<path d="{wave_d(96, 444, 244, 14, 9, 0.6)}"/>', LIME, 1.4, 5))
    c.add(spill(c, win, MAGENTA, 30, 0.34))
    c.add(chrome_stroke(c, rrect_d(80, 260, 460, 720, 18), 5, "sunset"))
    c.add(tube(c, f'<path d="{rrect_d(88, 268, 452, 712, 12)}"/>', MAGENTA, 2, 7))
    c.add(speaker(c, 66, 682, 84, 112) + speaker(c, 474, 682, 84, 112, CYAN, MAGENTA))
    crest(c, 270, 150, 0.9, "redgold", division=None)
    plaque(c, "Orateur", "On l'a fait ensemble", c1=MAGENTA, c2=CYAN, chrome_kind="sunset", bulbs="#FFD27A", msg_color=CYAN)
    birds(c, [("mee-bisou-vole", 70, 600, 116, False, -8), ("meo-feu-artifice", 470, 600, 116, True, 6)], glow=MAGENTA)
    save(c, "orateur-a")
    register("orateur-a", "orateur", None, "A", "La Voix-Laser",
             "Le blason chante : les ondes sonores s'en échappent en arcs, un éventail de lasers balaie la fumée de la salle et l'égaliseur monte en tours de part et d'autre ; la scène est une grille de lumière et deux enceintes portent Mee, qui envoie un baiser à la salle, et Meo, sous ses feux d'artifice.",
             "libre : Mee (bisou volé) et Meo (feu d'artifice) sur les enceintes", "On l'a fait ensemble")


# ---------------------------------------------------------------- B : la toguna électrique (Dogon)

def cliff_d(seed, y_top, y_bot, x0=-10, x1=550):
    rnd = random.Random(seed)
    pts = [(x0, y_bot)]
    x = x0
    y = y_top + 20
    while x < x1:
        x += rnd.uniform(14, 34)
        y = min(y_bot - 30, max(y_top, y + rnd.uniform(-16, 16)))
        pts.append((x, y))
    pts.append((x1, y_bot))
    return "M" + " L".join(f"{f(a)} {f(b)}" for a, b in pts), pts


def ora_b():
    c = start("ob", "#2E1838", "#0D0714", "#FFC27A")
    win = rrect_d(86, 266, 454, 714, 12)
    m = window(c, win)
    sky = c.grad("sky", [(0, "#07031C"), (0.06, "#1C0A3E"), (0.16, "#5A1650"), (0.24, "#0C0418"), (1, "#030108")])
    body = [f'<rect width="{W}" height="{H}" fill="{sky}"/>', stardust(61, 120, (0, 0, W, 60), avoid=None)]
    body.append(glow_spot(c, 270, 40, 320, 80, MAGENTA, 0.45))
    # la falaise de Bandiagara, ses maisons tellem dans la paroi, ses greniers sur l'éboulis
    body.append(bandiagara(c, 11, 46, 214))
    for x, s in ((26, 1.0), (58, 0.85), (92, 1.05), (132, 0.8), (168, 0.9), (372, 0.9), (410, 0.8), (448, 1.05), (484, 0.85), (516, 1.0)):
        body.append(granary(c, x, 186, s, YELLOW, ORANGE))
    # la parole rayonne : un éventail d'or derrière le blason, et ses ondes qui montent dans la nuit
    body.append(glow_spot(c, 270, 128, 230, 150, GOLD, 0.35))
    body.append(f'<g opacity="0.55">{tube(c, rays(270, 128, 80, 330, 23, GOLD, 1, -84, 84, 0.72), GOLD, 0.9, 4)}</g>')
    waves = "".join(f'<path d="{arc_d(270, 128, r, -64, 64)}"/>' for r in (78, 104, 132, 162, 194))
    body.append(tube(c, waves, MAGENTA, 1.4, 6, op=0.85))
    # le sol et sa bordure de kente
    body.append(f'<rect y="718" width="{W}" height="242" fill="{c.grad("gr", [(0, "#1A0C24"), (1, "#050208")])}"/>')
    body.append(horizon_glow(c, 718, ORANGE, op=0.8))
    body.append(kente(c, 0, 900, 540, 18, seed=21, op=0.9))
    body.append(glow_spot(c, 270, 900, 300, 50, ORANGE, 0.25))
    c.add(f'<g mask="{m}">{"".join(body)}</g>')
    # les poteaux fourchus, sculptés, qui portent le toit de part et d'autre de la photo
    for x, w_, seed in ((30, 30, 1), (68, 17, 2), (472, 17, 3), (510, 30, 4)):
        c.add(dogon_post(c, x, 258, 724, w_, ORANGE, "#FFB86B", seed, fork=22 if w_ > 20 else 16))
    c.add(spill(c, win, ORANGE, 26, 0.3))
    c.add(chrome_stroke(c, rrect_d(80, 260, 460, 720, 16), 4, "gold"))
    c.add(tube(c, f'<path d="{rrect_d(89, 269, 451, 711, 10)}"/>', MAGENTA, 1.7, 6))
    # le toit de mil, huit couches, et sa frange qui ombre le haut de la photo
    c.add(f'<rect x="-10" y="262" width="560" height="26" fill="#000000" opacity="0.55" filter="{ublur(c, 8)}"/>')
    c.add(toguna_roof(c, -14, 554, 182, 264, layers=7, color=YELLOW, edge=ORANGE))
    c.add(f'<ellipse cx="270" cy="134" rx="70" ry="74" fill="#07030C" opacity="0.65" filter="{ublur(c, 12)}"/>')
    crest(c, 270, 130, 0.84, "redgold", division=None)
    plaque(c, "Orateur", "Ma voix porte loin", c1=ORANGE, c2=MAGENTA, chrome_kind="sunset", msg_color=YELLOW)
    birds(c, [("mee-courage", 92, 702, 128, False, -4), ("meo-serenade", 448, 704, 124, True, 4)], glow=ORANGE)
    save(c, "orateur-b")
    register("orateur-b", "orateur", None, "B", "La Toguna électrique",
             "La photo s'abrite sous une toguna, la case à palabres des Dogon du Mali : un toit de mil en huit couches, plus épais que le passage qu'il abrite pour qu'on y parle assis — on ne s'y lève pas en colère —, porté par des poteaux fourchus sculptés de chevrons, de losanges et de damiers. Derrière, la falaise de Bandiagara, ses maisons tellem accrochées à la paroi et ses greniers coiffés de paille, s'allume en néon ; une bande de kente borde le sol.",
             "pied : Mee (courage !) et Meo (sérénade) au pied des poteaux", "Ma voix porte loin")


def roof_only(card):
    """Le toit de la toguna, seul, au-dessus de la photo (les piliers sont dessinés à part)."""
    full = toguna(card, 270, 262, 540, 112, roof=YELLOW, post=ORANGE, layers=5)
    return full


# ---------------------------------------------------------------- C : l'antenne de minuit

def city_grid(card, seed, color_a="#FFB347", color_b=CYAN):
    """La ville vue d'en haut : des rues qui brillent comme les pistes d'un circuit, des îlots piquetés de fenêtres."""
    rnd = random.Random(seed)
    xs = [0]
    while xs[-1] < W:
        xs.append(xs[-1] + rnd.uniform(34, 70))
    ys = [0]
    while ys[-1] < H:
        ys.append(ys[-1] + rnd.uniform(34, 64))
    major = []
    minor = []
    for i, x in enumerate(xs):
        (major if i % 3 == 0 else minor).append(f'<line x1="{f(x)}" y1="0" x2="{f(x)}" y2="{H}"/>')
    for j, y in enumerate(ys):
        (major if j % 3 == 1 else minor).append(f'<line x1="0" y1="{f(y)}" x2="{W}" y2="{f(y)}"/>')
    diag = '<path d="M-20 900 L240 520 L560 380"/>'
    dots = []
    for a, b in zip(xs, xs[1:]):
        for c_, d in zip(ys, ys[1:]):
            for _ in range(int((b - a) * (d - c_) / 260)):
                x, y = rnd.uniform(a + 5, b - 5), rnd.uniform(c_ + 5, d - 5)
                dots.append(f'<rect x="{f(x)}" y="{f(y)}" width="2" height="2" fill="{rnd.choice(("#FFE2A8", "#FFFFFF", "#9FF3FF", "#FFB3E6"))}" opacity="{f(rnd.uniform(0.2, 0.8))}"/>')
    return (fine("".join(minor), color_a, 0.7, 0.35) + tube(card, "".join(major), color_a, 1.1, 4, op=0.75)
            + tube(card, diag, color_b, 2.2, 6, op=0.85) + "".join(dots))


def mast(card, cx, top, base, w0=40, w1=6, color="#9AA4C0"):
    geo = [f'<line x1="{f(cx - w0 / 2)}" y1="{f(base)}" x2="{f(cx - w1 / 2)}" y2="{f(top)}"/><line x1="{f(cx + w0 / 2)}" y1="{f(base)}" x2="{f(cx + w1 / 2)}" y2="{f(top)}"/>']
    n = 12
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        y0, y1 = base + (top - base) * t0, base + (top - base) * t1
        wa, wb = w0 + (w1 - w0) * t0, w0 + (w1 - w0) * t1
        geo.append(f'<line x1="{f(cx - wa / 2)}" y1="{f(y0)}" x2="{f(cx + wb / 2)}" y2="{f(y1)}"/><line x1="{f(cx + wa / 2)}" y1="{f(y0)}" x2="{f(cx - wb / 2)}" y2="{f(y1)}"/>'
                   f'<line x1="{f(cx - wb / 2)}" y1="{f(y1)}" x2="{f(cx + wb / 2)}" y2="{f(y1)}"/>')
    lights = "".join(bulb(card, cx + s * (w0 + (w1 - w0) * t) / 2, base + (top - base) * t, 1.8, RED) for t in (0.33, 0.66) for s in (-1, 1))
    return fine("".join(geo), color, 1.1, 0.95) + lights + bulb(card, cx, top - 6, 3, RED)


def tuner_dial(card, x0, y0, x1, y1, needle=98.6, color=CYAN, needle_col=RED):
    """Le cadran d'un tuner FM, vertical : verre sombre, graduations 88-108 MHz, aiguille rouge."""
    w, h = x1 - x0, y1 - y0
    d = rrect_d(x0, y0, x1, y1, 10)
    g = card.grad(nid("tun"), [(0, "#0E0828"), (1, "#05030F")])
    out = [f'<path d="{d}" fill="{g}" opacity="0.92"/>', chrome_stroke(card, d, 3, "cool")]
    cx = x0 + w * 0.42
    ticks = []
    labels = []
    for k in range(0, 41):
        mhz = 88 + k * 0.5
        y = y1 - 22 - (h - 44) * k / 40
        L = 12 if k % 4 == 0 else 6
        ticks.append(f'<line x1="{f(cx - L / 2)}" y1="{f(y)}" x2="{f(cx + L / 2)}" y2="{f(y)}"/>')
        if k % 8 == 0:
            labels.append(label(x1 - 8, y + 2.5, f"{int(mhz)}", light(color, 0.4), 7.5, "end", 0.9, 0.4))
    out.append(fine("".join(ticks), color, 0.9, 0.8))
    out.append(fine(f'<line x1="{f(cx)}" y1="{f(y0 + 18)}" x2="{f(cx)}" y2="{f(y1 - 18)}"/>', color, 0.6, 0.4))
    out.append("".join(labels))
    out.append(label((x0 + x1) / 2, y0 + 13, "MHz", light(color, 0.5), 6.5, "middle", 0.8, 1.5))
    ny = y1 - 22 - (h - 44) * (needle - 88) / 20
    out.append(tube(card, f'<line x1="{f(x0 + 6)}" y1="{f(ny)}" x2="{f(x1 - 6)}" y2="{f(ny)}"/>', needle_col, 1.6, 6))
    out.append(bulb(card, x0 + 6, ny, 2.4, needle_col))
    return "".join(out)


def scope(card, x0, y0, x1, y1, color=LIME, seed=3):
    """Un oscilloscope vertical : la voix en onde, sur sa grille."""
    w, h = x1 - x0, y1 - y0
    d = rrect_d(x0, y0, x1, y1, 10)
    g = card.grad(nid("sco"), [(0, "#04140C"), (1, "#020806")])
    out = [f'<path d="{d}" fill="{g}" opacity="0.92"/>', chrome_stroke(card, d, 3, "cool")]
    grid_ = "".join(f'<line x1="{f(x0 + 6)}" y1="{f(y)}" x2="{f(x1 - 6)}" y2="{f(y)}"/>' for y in [y0 + 10 + k * (h - 20) / 12 for k in range(13)])
    grid_ += "".join(f'<line x1="{f(x)}" y1="{f(y0 + 8)}" x2="{f(x)}" y2="{f(y1 - 8)}"/>' for x in [x0 + 8 + k * (w - 16) / 4 for k in range(5)])
    out.append(fine(grid_, color, 0.5, 0.22))
    cx = (x0 + x1) / 2
    pts = []
    n = 220
    rnd = random.Random(seed)
    for i in range(n + 1):
        t = i / n
        y = y0 + 12 + (h - 24) * t
        env = (0.35 + 0.65 * abs(math.sin(t * math.pi * 3.2))) * math.sin(math.pi * t) ** 0.4
        xx = cx + (w * 0.36) * env * math.sin(t * 2 * math.pi * 17) * (0.75 + 0.25 * math.sin(t * 41))
        pts.append(f"{f(xx)} {f(y)}")
    out.append(tube(card, '<path d="M' + " L".join(pts) + '"/>', color, 1.0, 4))
    return "".join(out)


def ora_c():
    c = start("oc", "#22163E", "#0A0716", "#7FEFFF")
    win = rrect_d(86, 266, 454, 714, 14)
    m = window(c, win)
    sky = c.grad("sky", [(0, "#06031A"), (0.16, "#170838"), (0.27, "#4A0F5A"), (0.29, "#0A0418"), (1, "#020108")])
    sky_layer = [f'<rect width="{W}" height="{H}" fill="{sky}"/>', stardust(71, 140, (0, 0, W, 260), avoid=None)]
    sky_layer.append(glow_spot(c, 270, 66, 300, 260, MAGENTA, 0.5))
    # les ondes : des anneaux qui partent de la pointe du pylône et couvrent toute la nuit
    rings = []
    for i, r in enumerate(range(34, 980, 30)):
        col = (MAGENTA, CYAN, VIOLET)[i % 3]
        op = max(0.18, 0.95 - i * 0.03)
        rings.append(tube(c, f'<circle cx="270" cy="66" r="{r}"/>', col, 1.6 if i < 8 else 1.1, 6, op=op))
    sky_layer.append("".join(rings))
    city = skyline(c, 44, -10, 550, 264, 40, 150, body="#0A0620", rim=MAGENTA, density=0.32, antenna=0.45, signs=0.4, wmin=18, wmax=40)
    body = sky_layer + [city]
    # la rue mouillée : la ville et ses ondes s'y reflètent
    body.append(f'<rect y="722" width="{W}" height="238" fill="{c.grad("wet", [(0, "#0C0624"), (1, "#020106")])}"/>')
    body.append(reflect(c, city, 722, 0.5, 2.4, 0.5, 900).replace('matrix(1 0 0 -0.5 0', 'matrix(1 0 0 -0.5 0', 1))
    body.append(streaks(c, 9, [30, 60, 110, 170, 230, 310, 370, 430, 480, 512], 726, 960, (MAGENTA, CYAN, YELLOW), (3, 9), 0.55))
    body.append(ripples(41, 728, 958, "#020106", 50, 0.8))
    c.add(f'<g mask="{m}">{"".join(body)}</g>')
    # le pylône d'émission, chromé, qui monte derrière le blason
    c.add(mast(c, 270, 54, 268, 74, 8, "#C9D2E8"))
    c.add(glow_spot(c, 270, 58, 60, 60, "#FFFFFF", 0.7) + bulb(c, 270, 52, 4, RED))
    # le cadran du tuner et l'oscilloscope de la voix
    c.add(tuner_dial(c, 10, 300, 74, 690, 98.6))
    c.add(scope(c, 466, 300, 530, 690))
    c.add(spill(c, win, CYAN, 28, 0.32))
    c.add(chrome_stroke(c, rrect_d(80, 260, 460, 720, 18), 5, "cool"))
    c.add(tube(c, f'<path d="{rrect_d(88, 268, 452, 712, 12)}"/>', CYAN, 2, 7))
    # l'enseigne ON AIR, allumée
    box = rrect_d(18, 222, 112, 252, 6)
    c.add(f'<path d="{box}" fill="#1A0408" opacity="0.9"/>' + tube(c, f'<path d="{box}"/>', RED, 1.6, 6))
    c.add(neon_text(c, 65, 243, "ON AIR", RED, 17, SANS, 800, ls=2, halo=4))
    box2 = rrect_d(428, 222, 522, 252, 6)
    c.add(f'<path d="{box2}" fill="#04141A" opacity="0.9"/>' + tube(c, f'<path d="{box2}"/>', CYAN, 1.6, 6))
    c.add(neon_text(c, 475, 243, "98.6 FM", CYAN, 16, SANS, 800, ls=1.5, halo=4))
    c.add(glow_spot(c, 270, 148, 110, 110, MAGENTA, 0.5))
    crest(c, 270, 148, 0.88, "redgold", division=None)
    plaque(c, "Orateur", None, c1=CYAN, c2=MAGENTA, chrome_kind="cool", style="pill")
    birds(c, [("mee-danse", 94, 704, 130, False, -6), ("meo-yo", 446, 704, 130, True, 6)], glow=CYAN)
    save(c, "orateur-c")
    register("orateur-c", "orateur", None, "C", "L'Antenne de minuit",
             "À minuit, le blason est hissé au sommet d'un pylône d'émission chromé : sa voix part en anneaux de lumière qui couvrent toute la ville, et la rue mouillée les renvoie ; d'un côté, le cadran du tuner s'est arrêté sur 98,6 ; de l'autre, l'oscilloscope dessine la voix ; l'enseigne « ON AIR » est allumée.",
             "pied : Mee (casque) et Meo (yo) au pied du pylône", None)


ALL = [ora_a, ora_b, ora_c]
