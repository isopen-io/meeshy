"""Atelier « Néon » : AMBASSADEUR V → I (métal or). Le rang où l'on choisit son atmosphère."""

import math
import random

from kit import *  # noqa: F401,F403
from afro import *  # noqa: F401,F403
from cosmos import *  # noqa: F401,F403


def brick_wall(card, base_col="#06030E", mortar="#06030E", bricks=("#221338", "#1C102F", "#261640")):
    name = nid("brk")
    card.def_once(name, f'<pattern id="{card.id(name)}" width="44" height="32" patternUnits="userSpaceOnUse">'
                        f'<rect width="44" height="32" fill="{base_col}"/>'
                        f'<rect x="1" y="1" width="41.5" height="14" rx="1.5" fill="{bricks[0]}"/><rect x="-21" y="17" width="41.5" height="14" rx="1.5" fill="{bricks[1]}"/><rect x="23" y="17" width="41.5" height="14" rx="1.5" fill="{bricks[2]}"/>'
                        f'<path d="M2 2 H41" stroke="#FFFFFF" stroke-width="0.6" opacity="0.07"/></pattern>')
    return f'<rect width="{W}" height="{H}" fill="url(#{card.id(name)})"/>'


def rain(seed, n, region=(0, 0, W, H), color="#BFE9FF", avoid=(82, 262, 458, 720)):
    rnd = random.Random(seed)
    out = []
    x0, y0, x1, y1 = region
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if avoid and avoid[0] < x < avoid[2] and avoid[1] < y < avoid[3]:
            continue
        L = rnd.uniform(10, 26)
        out.append(f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(x - L * 0.18)}" y2="{f(y + L)}" stroke="{color}" stroke-width="0.8" opacity="{f(rnd.uniform(0.12, 0.38))}"/>')
    return "".join(out)


def clip_mount(x, y, horizontal=False):
    if horizontal:
        return (f'<rect x="{f(x - 3)}" y="{f(y - 8)}" width="6" height="16" rx="1.5" fill="#9AA4B8" stroke="#1A1230" stroke-width="1"/>'
                f'<rect x="{f(x - 1)}" y="{f(y - 8)}" width="1.4" height="16" fill="#FFFFFF" opacity="0.7"/>')
    return (f'<rect x="{f(x - 8)}" y="{f(y - 3)}" width="16" height="6" rx="1.5" fill="#9AA4B8" stroke="#1A1230" stroke-width="1"/>'
            f'<rect x="{f(x - 8)}" y="{f(y - 1)}" width="16" height="1.4" fill="#FFFFFF" opacity="0.7"/>')


# ---------------------------------------------------------------- V : l'enseigne de minuit

def amb5():
    c = start("a5", "#2C1747", "#0C0717", "#FF8FE0")
    win = rrect_d(84, 264, 456, 718, 16)
    m = window(c, win)
    loop = ("M118 730 L96 730 Q72 730 72 706 L72 276 Q72 252 96 252 L194 252 Q213 252 216 216.3 "
            "A84 84 0 1 1 324 216.3 Q327 252 346 252 L444 252 Q468 252 468 276 L468 706 Q468 730 444 730 L422 730")
    body = [brick_wall(c)]
    # la lumière du tube sur la brique : un lavis magenta qui s'éteint vers les bords
    body.append(f'<path d="{loop}" fill="none" stroke="{MAGENTA}" stroke-width="90" opacity="0.42" filter="{ublur(c, 34)}" style="mix-blend-mode:screen"/>')
    body.append(f'<path d="{loop}" fill="none" stroke="{PINK}" stroke-width="26" opacity="0.35" filter="{ublur(c, 10)}" style="mix-blend-mode:screen"/>')
    body.append(glow_spot(c, 270, 152, 170, 170, MAGENTA, 0.5))
    body.append(f'<rect width="{W}" height="{H}" fill="{c.rgrad("v5", [(0.35, "#05020C", 0), (1, "#05020C", 0.82)], 0.5, 0.4, 0.75)}"/>')
    # le trottoir mouillé : le néon y coule en traînées
    body.append(f'<rect y="878" width="{W}" height="82" fill="{c.grad("floor", [(0, "#160B2C"), (1, "#04020A")])}"/>')
    body.append(f'<line x1="0" y1="878" x2="{W}" y2="878" stroke="#4A2A7A" stroke-width="2"/>')
    body.append(streaks(c, 4, [72, 72, 468, 468], 880, 960, (MAGENTA, PINK), (8, 16), 0.85))
    body.append(streaks(c, 5, [88, 452], 880, 960, (CYAN,), (5, 9), 0.7))
    body.append(streaks(c, 6, [190, 270, 350], 880, 960, (MAGENTA, VIOLET), (14, 30), 0.35))
    body.append(ripples(4, 882, 958, "#04020A", 40, 0.9))
    body.append(rain(5, 220, color="#FFC2EC"))
    body.append(stardust(9, 30, (0, 0, W, 120), avoid=None))
    c.add(f'<g mask="{m}">{"".join(body)}</g>')
    # chaînettes qui suspendent l'enseigne
    for a in (-38, 38):
        x, y = pt(270, 152, 84, a)
        c.add(f'<line x1="{f(x + (a / 38) * 30)}" y1="0" x2="{f(x)}" y2="{f(y)}" stroke="#7D86A0" stroke-width="1.6" stroke-dasharray="3 2"/>')
        c.add(clip_mount(x, y + 2))
    c.add(spill(c, win, MAGENTA, 34, 0.4))
    c.add(inner_shade(c, win, 18, 0.5))
    c.add(tube(c, f'<path d="{loop}"/>', MAGENTA, 4.4, 13))
    c.add(tube(c, f'<path d="{rrect_d(86, 266, 454, 716, 14)}"/>', CYAN, 2.0, 6))
    for x, y in ((128, 730), (412, 730)):
        c.add(f'<rect x="{f(x - 7)}" y="{f(y - 5)}" width="14" height="10" rx="2" fill="#2A2238" stroke="#6D7690"/>')
    for y in (340, 480, 620):
        c.add(clip_mount(72, y, True) + clip_mount(468, y, True))
    for x in (140, 400):
        c.add(clip_mount(x, 252))
    c.add(sparkle(337, 112, 9, "#FFFFFF", 0.9) + sparkle(205, 190, 6, "#FFD6F5", 0.8))
    crest(c, 270, 152, 0.86, "gold", division=5, gem=MAGENTA)
    plaque(c, "Ambassadeur V", None, c1=MAGENTA, c2=CYAN, chrome_kind="gold")
    birds(c, [("mee-sourire", 92, 704, 132, False, -6), ("meo-cool", 448, 704, 132, True, 6)], glow=MAGENTA)
    save(c, "ambassadeur-5")
    register("ambassadeur-5", "ambassadeur", 5, "V", "L'Enseigne de minuit",
             "Un seul tube de néon magenta, plié d'un trait autour de la photo, s'enroule en auréole autour du blason ; l'enseigne pend à deux chaînettes devant un mur de briques sous une pluie fine, et sa lumière tombe sur le trottoir mouillé.",
             "pied : Mee (sourire) et Meo (cool) au bas de l'enseigne", None)


# ---------------------------------------------------------------- IV : la rue des enseignes (adinkra)

def amb4():
    c = start("a4", "#2A1640", "#0C0716", "#7FEFFF")
    win = rrect_d(86, 262, 454, 716, 14)
    m = window(c, win)
    sky = c.grad("sky", [(0, "#0B0626"), (0.18, "#2A0C4A"), (0.28, "#6A1466"), (0.34, "#16082E"), (1, "#05030C")])
    body = [f'<rect width="{W}" height="{H}" fill="{sky}"/>', stardust(21, 60, (0, 0, W, 200), avoid=None)]
    body.append(glow_spot(c, 270, 300, 300, 120, MAGENTA, 0.5))
    body.append(skyline(c, 7, 60, 480, 300, 30, 120, body="#0A0620", rim=MAGENTA, density=0.22, signs=0.25))
    # deux immeubles en premier plan, de chaque côté
    for x0, x1, seed in ((-4, 78, 11), (462, 544, 12)):
        g = c.grad(f"fac{seed}", [(0, "#140B2E"), (1, "#07040F")], 0, 0, 1, 0)
        body.append(f'<rect x="{x0}" y="96" width="{x1 - x0}" height="900" fill="{g}"/>')
        rnd = random.Random(seed)
        wins = []
        for row in range(26):
            for col in range(3):
                wx = x0 + 10 + col * 24
                wy = 116 + row * 32
                if rnd.random() < 0.42:
                    cc = rnd.choice(("#FFC36B", "#FFE9B0", "#7FEFFF", "#FF9AE0"))
                    wins.append(f'<rect x="{wx}" y="{wy}" width="13" height="18" fill="{cc}" opacity="{f(rnd.uniform(0.25, 0.75))}"/>')
                else:
                    wins.append(f'<rect x="{wx}" y="{wy}" width="13" height="18" fill="#1D1238" opacity="0.8"/>')
        body.append("".join(wins))
        body.append(f'<rect x="{x0}" y="92" width="{x1 - x0}" height="6" fill="#2A1B52"/>')
    # câbles de guirlandes au-dessus de la rue
    cables = []
    lights = []
    for k, (ya, sag) in enumerate(((112, 40), (176, 30), (236, 22))):
        d = f"M78 {ya} Q270 {ya + sag * 2} 462 {ya}"
        cables.append(f'<path d="{d}"/>')
        for i in range(1, 14):
            t = i / 14
            x = (1 - t) ** 2 * 78 + 2 * (1 - t) * t * 270 + t * t * 462
            y = (1 - t) ** 2 * ya + 2 * (1 - t) * t * (ya + sag * 2) + t * t * ya
            lights.append(bulb(c, x, y + 4, 1.8, ("#FFD27A", "#FF9AE0", "#7FEFFF")[(i + k) % 3], 0.95))
    body.append(fine("".join(cables), "#3A2A5A", 1.2, 0.9))
    body.append("".join(lights))
    # bitume mouillé
    body.append(f'<rect y="720" width="{W}" height="240" fill="{c.grad("asph", [(0, "#0E0820"), (1, "#020106")])}"/>')
    body.append(streaks(c, 3, [52, 98, 76, 448, 488, 470], 724, 960, (MAGENTA, CYAN, YELLOW, LIME, PINK), (5, 12), 0.55))
    body.append(ripples(8, 726, 958, "#020106", 50, 0.85))
    body.append(rain(14, 140, color="#FFD6F5"))
    c.add(f'<g mask="{m}">{"".join(body)}</g>')
    # enseignes-drapeaux adinkra, accrochées aux façades : six symboles, six couleurs, leur nom en petites capitales
    def nkyin(cx, cy, s, col):
        return nkyinkyim(cx - 21, cy - 7, cx + 21, 0.85, col, 3) + nkyinkyim(cx - 21, cy + 9, cx + 21, 0.85, col, 3)
    signs = [(nsoromma, 44, 336, 0.66, CYAN, "NSOROMMA"), (sankofa, 44, 470, 0.7, MAGENTA, "SANKOFA"), (akoma, 44, 604, 0.78, RED, "AKOMA"),
             (dwennimmen, 496, 340, 0.56, YELLOW, "DWENNIMMEN"), (adinkrahene, 496, 474, 0.86, LIME, "ADINKRAHENE"), (nkyin, 496, 608, 1.0, ORANGE, "NKYINKYIM")]
    for fn, x, y, s_, col, name in signs:
        wall_x = 0 if x < 270 else 540
        for dy in (-34, 34):
            c.add(f'<line x1="{wall_x}" y1="{y + dy}" x2="{x}" y2="{y + dy}" stroke="#8A93AA" stroke-width="2.2"/>'
                  f'<circle cx="{x + (-31 if x > 270 else 31)}" cy="{y + dy}" r="2" fill="#C9D2DE"/>')
        c.add(f'<rect x="{x - 33}" y="{y - 44}" width="66" height="88" rx="8" fill="{col}" opacity="0.22" filter="{ublur(c, 10)}"/>')
        c.add(adinkra_sign(c, fn, x, y - 6, s_, col, bw=62, bh=84, frame=mix(col, "#3A2A66", 0.6)))
        c.add(f'<rect x="{x - 31}" y="{y - 48}" width="62" height="84" rx="6" fill="none" stroke="{light(col, 0.3)}" stroke-width="1" opacity="0.6" transform="translate(0 6)"/>')
        c.add(label(x, y + 31, name, light(col, 0.4), 5.6 if len(name) > 9 else 6.2, "middle", 0.95, 0.6))
    c.add(spill(c, win, CYAN, 26, 0.3))
    c.add(chrome_stroke(c, rrect_d(80, 256, 460, 722, 18), 5, "gold"))
    c.add(tube(c, f'<path d="{rrect_d(88, 264, 452, 714, 12)}"/>', CYAN, 1.8, 6))
    crest(c, 270, 150, 0.9, "gold", division=4, gem=CYAN)
    plaque(c, "Ambassadeur IV", "Pour toi, maman", c1=CYAN, c2=MAGENTA, chrome_kind="gold", msg_color=PINK)
    birds(c, [("mee-coucou", 70, 748, 112, False, -6), ("meo-salut", 470, 748, 112, True, 6)], glow=CYAN)
    save(c, "ambassadeur-4")
    register("ambassadeur-4", "ambassadeur", 4, "IV", "La Rue des enseignes",
             "Une rue de nuit sous la pluie, guirlandes tendues d'une façade à l'autre ; les enseignes-drapeaux ne vendent rien : ce sont des symboles adinkra des Akan du Ghana tracés en néon — Nsoromma l'étoile, Sankofa le retour aux sources, Akoma le cœur, Dwennimmen les cornes du bélier, Adinkrahene le roi, Nkyinkyim le chemin sinueux — chacun signé de son nom, et leurs couleurs coulent sur le bitume mouillé.",
             "ruban : Mee (coucou) et Meo (salut) au bord de la plaque", "Pour toi, maman")


# ---------------------------------------------------------------- III : le soleil de la grille (baobabs)

def mountains_geo(seed, x0, x1, base, hmin, hmax, n):
    rnd = random.Random(seed)
    pts = [(x0, base)]
    step = (x1 - x0) / n
    for i in range(n):
        pts.append((x0 + (i + 0.5) * step + rnd.uniform(-6, 6), base - rnd.uniform(hmin, hmax)))
        pts.append((x0 + (i + 1) * step, base - rnd.uniform(0, hmin * 0.5)))
    pts[-1] = (x1, base)
    outline = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts)
    wire = []
    for (ax, ay), (bx, by) in zip(pts[1::2], pts[3::2]):
        mx = (ax + bx) / 2
        wire.append(f'<path d="M{f(ax)} {f(ay)} L{f(mx)} {f(base)} L{f(bx)} {f(by)}"/>')
        wire.append(f'<path d="M{f(ax)} {f(ay)} L{f(ax - step * 0.25)} {f(base)} M{f(ax)} {f(ay)} L{f(ax + step * 0.2)} {f(base)}"/>')
    return outline, "".join(wire)


def amb3():
    c = start("a3", "#3A1440", "#0E0616", "#FFB36B")
    win = rrect_d(84, 262, 456, 718, 14)
    m = window(c, win)
    hy = 252
    sky = c.grad("sky", [(0, "#090420"), (0.12, "#1E0A44"), (0.22, "#6A1660"), (0.262, "#FF4F8B"), (0.263, "#0A0418"), (1, "#020108")])
    body = [f'<rect width="{W}" height="{H}" fill="{sky}"/>', stardust(31, 110, (0, 0, W, 200), avoid=None)]
    scene = [sun(c, 270, 222, 124, YELLOW, ORANGE, MAGENTA, bands=7, clip_y=hy, band_from=-0.32)]
    ol, wire = mountains_geo(4, -10, 200, hy, 26, 78, 4)
    or_, wire2 = mountains_geo(9, 340, 550, hy, 30, 70, 4)
    scene.append(f'<path d="{ol} Z" fill="#12052A"/><path d="{or_} Z" fill="#12052A"/>')
    scene.append(fine(wire + wire2, CYAN, 0.9, 0.55))
    scene.append(tube(c, f'<path d="{ol}"/><path d="{or_}"/>', CYAN, 1.6, 5))
    scene.append(baobab_neon(c, 150, hy, 62, ORANGE, seed=12, lw=1.3, halo=4, fill=("#2A0A2A", "#12041E")))
    scene.append(baobab_neon(c, 404, hy, 54, ORANGE, seed=21, lw=1.2, halo=4, fill=("#2A0A2A", "#12041E")))
    scene.append(baobab_neon(c, 58, hy, 168, YELLOW, seed=3, lw=2.0, halo=7, girth=0.46))
    scene.append(baobab_neon(c, 484, hy, 140, YELLOW, seed=8, lean=-4, lw=1.9, halo=7, girth=0.48))
    body.append("".join(scene))
    body.append(f'<rect y="{hy}" width="{W}" height="{H - hy}" fill="{c.grad("floor", [(0, "#1A0630"), (1, "#05010C")])}"/>')
    body.append(reflect(c, "".join(scene), hy, 0.62, 2.6, 0.42, hy + 210))
    body.append(horizon_glow(c, hy, MAGENTA, op=1))
    body.append(grid(c, hy, MAGENTA, gap=44, nh=15, depth=0.42, w=1.5, halo=5))
    body.append(glow_spot(c, 270, 960, 380, 220, VIOLET, 0.35))
    c.add(f'<g mask="{m}">{"".join(body)}</g>')
    c.add(spill(c, win, MAGENTA, 28, 0.32))
    c.add(chrome_stroke(c, rrect_d(78, 256, 462, 724, 18), 6, "gold"))
    c.add(tube(c, f'<path d="{rrect_d(87, 265, 453, 715, 11)}"/>', CYAN, 1.6, 5))
    crest(c, 270, 152, 0.9, "gold", division=3, gem=CYAN)
    plaque(c, "Ambassadeur III", None, c1=MAGENTA, c2=CYAN, chrome_kind="gold", style="hud")
    birds(c, [("mee-bravo", 94, 702, 136, False, -4), ("meo-bravo", 446, 702, 136, True, 4)], glow=MAGENTA)
    save(c, "ambassadeur-3")
    register("ambassadeur-3", "ambassadeur", 3, "III", "Le Soleil de la grille",
             "Le soleil à bandes se couche derrière le blason sur une grille de lumière qui file à l'infini ; sur l'horizon, entre des montagnes en fil de fer, quatre baobabs de la savane africaine — troncs-bouteilles énormes, branches courtes tordues comme des racines tendues au ciel — sont tracés en néon jaune et orange, comme si la nuit électrique gardait la mémoire de l'arbre à palabres, sous lequel on se réunit pour parler.",
             "pied : Mee et Meo (bravo) sur la grille", None)


# ---------------------------------------------------------------- II : la mosquée de lumière (Djenné)

def buttress(card, x, y0, y1, w, color, toron=GOLD):
    g = card.grad(nid("bt"), [(0, "#1E0E33"), (1, "#0A0515")], 0, 0, 1, 0)
    d = f"M{f(x - w / 2)} {f(y1)} L{f(x - w / 2 + 3)} {f(y0)} L{f(x + w / 2 - 3)} {f(y0)} L{f(x + w / 2)} {f(y1)}Z"
    studs = []
    yy = y0 + 20
    while yy < y1 - 10:
        studs.append(f'<rect x="{f(x - w / 2 - 4)}" y="{f(yy - 1.2)}" width="8" height="2.4" rx="1" fill="{toron}"/><rect x="{f(x + w / 2 - 4)}" y="{f(yy - 1.2)}" width="8" height="2.4" rx="1" fill="{toron}"/>'
                     f'<rect x="{f(x - 3)}" y="{f(yy + 10)}" width="6" height="2.2" rx="1" fill="{toron}" opacity="0.8"/>')
        yy += 26
    s = "".join(studs)
    return (f'<path d="{d}" fill="{g}"/>' + fine(f'<line x1="{f(x)}" y1="{f(y0 + 6)}" x2="{f(x)}" y2="{f(y1 - 4)}"/>', color, 0.9, 0.4)
            + tube(card, f'<path d="{d}"/>', color, 1.8, 6) + f'<g filter="{ublur(card, 2)}">{s}</g>{s}')


def nebula_band(card):
    """Une voie lactée discrète qui traverse le ciel en diagonale."""
    rnd = random.Random(77)
    g = card.rgrad("vl", [(0, "#C9A8FF", 0.35), (0.6, "#6A2CA8", 0.15), (1, "#6A2CA8", 0)])
    dots = "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(0.3, 1))}" fill="#FFFFFF" opacity="{f(rnd.uniform(0.3, 0.9))}"/>'
                   for x, y in ((rnd.uniform(0, 540), 0) for _ in range(160)) for y in [rnd.gauss(150 - (x - 270) * 0.25, 18)])
    return f'<ellipse cx="270" cy="150" rx="330" ry="44" fill="{g}" transform="rotate(-14 270 150)"/>' + dots


def amb2():
    c = start("a2", "#2E1A3A", "#0D0814", "#FFC27A")
    win = rrect_d(86, 268, 454, 716, 12)
    m = window(c, win)
    sky = c.grad("sky", [(0, "#07031A"), (0.16, "#1A0838"), (0.3, "#3A0F48"), (0.42, "#0C0520"), (1, "#020108")])
    body = [f'<rect width="{W}" height="{H}" fill="{sky}"/>', stardust(41, 170, (0, 0, W, 200), avoid=None)]
    body.append(nebula_band(c))
    body.append(glow_spot(c, 270, 120, 330, 170, MAGENTA, 0.5))
    body.append(glow_spot(c, 270, 70, 150, 110, ORANGE, 0.35))
    # la façade : le mur aux piliers, les trois tours-minarets, la grille des toron
    towers = [(270, 134, 66, 5, 46), (110, 94, 108, 3, 34), (430, 94, 108, 3, 34)]
    body.append(djenne_facade(c, 744, towers, 180, wall_pil=34, color="#FFB43B", toron=GOLD, fill=("#4E2832", "#1A0C1A"), row=26))
    body.append(glow_spot(c, 40, 720, 120, 160, ORANGE, 0.35) + glow_spot(c, 500, 720, 120, 160, ORANGE, 0.35))
    # la lune au-dessus du minaret
    body.append(glow_spot(c, 470, 52, 60, 60, "#FFE6B0", 0.45) + f'<circle cx="470" cy="52" r="15" fill="#FFF3D6"/><circle cx="476" cy="47" r="13" fill="#1A0838"/>')
    # le parvis surélevé (la plate-forme de terre) et le fleuve en crue
    body.append(f'<rect x="-10" y="724" width="560" height="26" fill="{c.grad("plinth", [(0, "#3A1C34"), (1, "#140A1C")])}"/>')
    body.append(tube(c, '<line x1="-10" y1="724" x2="550" y2="724"/>', "#FFB43B", 1.6, 6))
    body.append(fine("".join(f'<line x1="{x}" y1="727" x2="{x}" y2="748"/>' for x in range(14, 540, 28)), "#FFB43B", 0.8, 0.35))
    body.append(f'<rect y="750" width="{W}" height="210" fill="{c.grad("riv", [(0, "#0D0624"), (1, "#020108")])}"/>')
    body.append(streaks(c, 6, [22, 38, 56, 74, 112, 150, 196, 270, 344, 390, 428, 466, 484, 502, 518], 890, 960, ("#FFB43B", "#FFD27A", MAGENTA, GOLD), (3, 10), 0.75))
    body.append(ripples(12, 892, 958, "#020108", 46, 0.9))
    body.append(fine('<line x1="0" y1="890" x2="540" y2="890"/>', "#FFB43B", 1, 0.55))
    c.add(f'<g mask="{m}">{"".join(body)}</g>')
    # le blason, détaché du minaret par une ombre
    c.add(f'<ellipse cx="270" cy="178" rx="74" ry="80" fill="#0A0412" opacity="0.7" filter="{ublur(c, 14)}"/>')
    c.add(spill(c, win, ORANGE, 26, 0.3))
    c.add(chrome_stroke(c, rrect_d(80, 262, 460, 722, 16), 5, "gold"))
    c.add(tube(c, f'<path d="{rrect_d(89, 271, 451, 713, 10)}"/>', MAGENTA, 1.7, 6))
    crest(c, 270, 178, 0.74, "gold", division=2, gem=MAGENTA)
    plaque(c, "Ambassadeur II", "Le voyage continue", y=754, c1=ORANGE, c2=MAGENTA, chrome_kind="gold", msg_color=YELLOW)
    birds(c, [("mee-wow", 94, 702, 126, False, -6), ("meo-roi", 446, 702, 126, True, 6)], glow=ORANGE)
    save(c, "ambassadeur-2")
    register("ambassadeur-2", "ambassadeur", 2, "II", "La Mosquée de lumière",
             "La photo s'ouvre comme une porte dans la façade de la Grande Mosquée de Djenné (Mali), la plus grande construction de terre crue au monde, redessinée en néon d'ambre : ses trois tours-minarets battues, ses piliers coiffés de pinacles en pain de sucre et d'œufs d'autruche, et la grille des toron — les poutres de rônier qui hérissent la façade et servent d'échafaudage à la fête du crépissage — devenus des diodes d'or ; au pied, le parvis surélevé et la crue du Bani.",
             "pied : Mee (wow) et Meo (roi) sur le parvis de la mosquée", "Le voyage continue")


# ---------------------------------------------------------------- I : Afropolis

def light_trails(card, seed, y0, y1, n, colors, from_left=True):
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        ya = rnd.uniform(y0, y1)
        yb = ya - rnd.uniform(30, 90)
        c = rnd.choice(colors)
        d = f"M-20 {f(ya + 40)} C160 {f(ya)} 380 {f(yb + 20)} 560 {f(yb)}" if from_left else f"M560 {f(ya + 40)} C380 {f(ya)} 160 {f(yb + 20)} -20 {f(yb)}"
        out.append((d, c, rnd.uniform(0.8, 2.2)))
    return "".join(tube(card, f'<path d="{d}"/>', col, w, 4, op=0.9) for d, col, w in out)


def amb1():
    c = start("a1", "#2C1846", "#0B0716", "#FFD27A")
    win = rrect_d(88, 266, 452, 716, 14)
    m = window(c, win)
    sky = c.grad("sky", [(0, "#0C0428"), (0.2, "#2C0B4E"), (0.3, "#5C1160"), (0.4, "#120628"), (1, "#020108")])
    body = [f'<rect width="{W}" height="{H}" fill="{sky}"/>', stardust(51, 90, (0, 0, W, 160), avoid=None)]
    body.append(glow_spot(c, 270, 230, 340, 150, MAGENTA, 0.55))
    # arrière-plan : skyline lointaine
    body.append(skyline(c, 23, -10, 550, 268, 40, 150, body="#0F0828", rim=VIOLET, density=0.18, antenna=0.4, wmin=14, wmax=30))
    # plan moyen : les tours africaines
    mid = []
    for x0, y0, w0, seed, col in ((16, 64, 66, 2, MAGENTA), (458, 52, 66, 7, CYAN)):
        mid.append(f'<rect x="{x0}" y="{y0}" width="{w0}" height="{270 - y0}" fill="#0B0620"/>')
        mid.append(f'<rect x="{x0 + w0 / 2 - 1}" y="{y0 - 26}" width="2" height="26" fill="#0B0620"/>' + bulb(c, x0 + w0 / 2, y0 - 27, 1.6, RED))
        mid.append(ndebele(c, x0 + 8, y0 + 10, w0 - 16, 126, seed=seed, outline=col, lit=0.74, ground="#CFC5E2"))
        rnd = random.Random(seed)
        mid.append("".join(f'<rect x="{x0 + 8 + i * 9}" y="{y0 + 146 + j * 10}" width="4" height="5" fill="{rnd.choice((YELLOW, CYAN, PINK))}" opacity="{f(rnd.uniform(0.3, 0.9))}"/>'
                           for i in range(int((w0 - 12) // 9)) for j in range(int((270 - y0 - 150) // 10)) if rnd.random() < 0.4))
    mid.append(f'<path d="{musgum_d(146, 268, 82, 210)} Z" fill="#0B0620"/>')
    mid.append(musgum(c, 146, 268, 82, 210, color=ORANGE, rib=YELLOW))
    mid.append(f'<path d="{musgum_d(394, 268, 70, 176)} Z" fill="#0B0620"/>')
    mid.append(musgum(c, 394, 268, 70, 176, color=MAGENTA, rib=PINK))
    mid.append(f'<rect x="196" y="150" width="20" height="118" fill="#0B0620"/>' + kente_v(c, 198, 156, 268, 16, seed=4))
    mid.append(f'<rect x="326" y="132" width="20" height="136" fill="#0B0620"/>' + kente_v(c, 328, 138, 268, 16, seed=9))
    body.append("".join(mid))
    # le monorail
    rail = "M-20 246 C120 226 420 226 560 246"
    body.append(tube(c, f'<path d="{rail}"/>', CYAN, 2, 6))
    body.append("".join(f'<rect x="{x}" y="{f(232.5 - 3 + abs(x - 270) * 0.03)}" width="9" height="5" rx="1" fill="#FFF3C0" opacity="0.95"/>' for x in range(300, 420, 12)))
    # drones
    rnd = random.Random(3)
    body.append("".join(bulb(c, rnd.uniform(20, 520), rnd.uniform(20, 90), 1.4, rnd.choice((CYAN, MAGENTA, YELLOW)), 0.9) for _ in range(9)))
    # tours latérales
    for x0, seed, col in ((0, 31, MAGENTA), (470, 32, CYAN)):
        body.append(f'<rect x="{x0}" y="262" width="70" height="700" fill="{c.grad(f"t{seed}", [(0, "#120A2C"), (1, "#05030C")])}"/>')
    body.append(kente_v(c, 14, 300, 704, 16, seed=12, op=0.85))
    body.append(kente_v(c, 510, 300, 704, 16, seed=13, op=0.85))
    body.append(ndebele(c, 42, 312, 28, 360, seed=5, outline=MAGENTA, lit=0.78, units=34, ground="#D8CFE8"))
    body.append(ndebele(c, 470, 312, 28, 360, seed=6, outline=CYAN, lit=0.78, units=34, ground="#D8CFE8"))
    # l'autoroute de lumière
    body.append(f'<rect y="724" width="{W}" height="236" fill="{c.grad("road", [(0, "#0A0520"), (1, "#020106")])}"/>')
    body.append(light_trails(c, 5, 800, 940, 7, (RED, "#FF6A3D", "#FFFFFF", "#FFE6A8")))
    body.append(ripples(19, 760, 958, "#020106", 30, 0.6))
    c.add(f'<g mask="{m}">{"".join(body)}</g>')
    # le blason, ses lasers d'or et son anneau
    fan = rays(270, 150, 70, 260, 15, GOLD, 1.4, -78, 78, 0.7)
    c.add(f'<g opacity="0.75">{tube(c, fan, GOLD, 1.0, 5)}</g>')
    c.add(glow_spot(c, 270, 150, 120, 110, GOLD, 0.55))
    ring = f'<ellipse cx="270" cy="170" rx="92" ry="22"/>'
    c.add(tube(c, ring, CYAN, 1.6, 5, op=0.85))
    c.add(spill(c, win, MAGENTA, 26, 0.3))
    c.add(chrome_stroke(c, rrect_d(80, 258, 460, 724, 20), 7, "gold"))
    c.add(tube(c, f'<path d="{rrect_d(91, 269, 449, 713, 11)}"/>', MAGENTA, 1.8, 6))
    c.add(fine(brackets_geo(70, 248, 470, 734, 34), CYAN, 1.6, 0.95))
    crest(c, 270, 150, 0.94, "gold", division=1, gem=MAGENTA)
    c.add(f'<path d="M178 170 A92 22 0 0 0 362 170" fill="none" stroke="{light(CYAN, 0.6)}" stroke-width="1.6" opacity="0.9"/>')
    plaque(c, "Ambassadeur I", "Merci la famille", c1=GOLD, c2=CYAN, chrome_kind="gold", msg_color=YELLOW)
    birds(c, [("mee-fete", 92, 700, 134, False, -6), ("meo-champagne", 448, 700, 134, True, 6)], glow=GOLD)
    save(c, "ambassadeur-1")
    register("ambassadeur-1", "ambassadeur", 1, "I", "Afropolis",
             "Une mégapole africaine de l'an 2100 : des tours vêtues de façades ndebele (Afrique du Sud) en panneaux lumineux, des colonnes de kente (Ghana) en LED, deux gratte-ciel en ogive qui reprennent la case-obus musgum (Cameroun) et ses chevrons ; un monorail traverse la nuit, l'autoroute file en traînées de lumière et des lasers d'or saluent le blason.",
             "pied : Mee (fête) et Meo (champagne) sur l'autoroute de lumière", "Merci la famille")


ALL = [amb5, amb4, amb3, amb2, amb1]
