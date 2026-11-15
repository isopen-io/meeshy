"""Atelier « Néon » : MYTHE A, B, C — du quark au quasar. Blason prisme, « Mythe nº 42 », « Nº 42 / 100 »."""

import math
import random

from kit import *  # noqa: F401,F403
from cosmos import *  # noqa: F401,F403
from orc import space  # noqa: E402

TITLE = "Mythe nº 42"
BADGE = "Nº 42 / 100"


def myth_crest(c, cy=150, s=0.88):
    crest(c, 270, cy, s, "prism", division=None, ink="#4C3BC4", edge="#FFFFFF")


def star_grid(card, hy, vx=270, y_end=H + 60, gap=44, nv=12, nh=9, depth=0.6, colors=(CYAN, MAGENTA, "#FFFFFF")):
    """La grille devenue constellation : seules ses intersections brillent, reliées par des traits ténus."""
    span = y_end - hy
    rows = [hy + span / (1 + depth * k ** 1.25) for k in range(nh)]
    out = []
    rnd = random.Random(int(hy))
    lines = []
    for y in rows:
        t = (y - hy) / span
        for k in range(-nv, nv + 1):
            x = vx + k * gap * t
            if -10 < x < W + 10:
                out.append(star(card, x, y, 0.5 + 1.4 * t, rnd.choice(colors), min(1, 0.3 + t)))
        lines.append(f'<line x1="-20" y1="{f(y)}" x2="{W + 20}" y2="{f(y)}"/>')
    for k in range(-nv, nv + 1):
        lines.append(f'<line x1="{f(vx + k * gap * 0.02)}" y1="{f(hy + span * 0.02)}" x2="{f(vx + k * gap)}" y2="{f(y_end)}"/>')
    return fine("".join(lines), VIOLET, 0.6, 0.35, "1 5") + "".join(out)


# ---------------------------------------------------------------- A : la singularité électrique

def my_a():
    c = start("ya", "#20163E", "#090716", "#D9C2FF")
    win = rrect_d(92, 274, 448, 712, 16)
    m = window(c, win)
    body = [space(c, 151, "#0A0428", "#05021A", n=420, clouds=((90, 420, 160, 300, "#6A1AAA", "#1A0838", 0.5, 4), (460, 480, 160, 300, "#1A5AAA", "#081838", 0.45, 8)))]
    # le quasar : un laser vertical qui jaillit de la singularité
    body.append(quasar(c, 270, 150, 900, 90, CYAN, 6, L2=900))
    # macro : la toile cosmique, ses nœuds d'amas, une galaxie et un arc de lentille, à gauche
    body.append(web_strip(c, 6, 6, 286, 80, 700, 22, VIOLET, PINK))
    body.append(cluster(c, 14, 46, 230, 34))
    body.append(galaxy_wire(c, 44, 470, 24, 2, 1.1, 0.5, 0.3, -24, ("#FFB3E6", "#BFE9FF"), 2, 0.8, 3, dots=40, seed=4))
    body.append(pow10(46, 262, "10", "26", light(VIOLET, 0.5), 7.5, "middle", 0.9, " m"))
    # micro : une collision et ses traces, la mousse quantique, des cordes qui vibrent, à droite
    body.append(glow_spot(c, 497, 352, 46, 46, CYAN, 0.35))
    body.append(tracks(c, 3, 497, 352, 14, scale=0.55))
    body.append(foam(c, 5, 497, 512, 38, 70))
    body.append(open_strings(c, 470, 590, 526, 690, 4))
    body.append(pow10(494, 262, "10", "-35", light(MAGENTA, 0.5), 7.5, "middle", 0.9, " m"))
    body.append(star_grid(c, 740))
    c.add(f'<g mask="{m}">{"".join(body)}</g>')
    # le trou noir cerné d'anneaux, le blason dans son ombre, le disque qui repasse devant
    rx, ry = 230, 30
    c.add(black_hole(c, 270, 150, 64, rx, ry, (ORANGE, YELLOW, MAGENTA, CYAN, VIOLET), 5, w=2.2))
    myth_crest(c, 150, 0.84)
    front = "".join(f'<path d="M{f(270 - rx * (1 + i * 0.16))} 150 A{f(rx * (1 + i * 0.16))} {f(ry * (1 + i * 0.16))} 0 0 0 {f(270 + rx * (1 + i * 0.16))} 150"/>' for i in range(2))
    c.add(tube(c, front, YELLOW, 1.6, 6, op=0.9))
    c.add(label(270, 252, "SINGULARITÉ · HORIZON DES ÉVÉNEMENTS", light(YELLOW, 0.5), 6.5, "middle", 0.8, 1.6))
    c.add(spill(c, win, VIOLET, 28, 0.34))
    c.add(chrome_stroke(c, rrect_d(86, 268, 454, 718, 20), 5, "prism"))
    c.add(tube(c, f'<path d="{win}"/>', "#B98CFF", 2, 7))
    c.add(fine(brackets_geo(74, 258, 466, 728, 28), CYAN, 1.5, 0.9))
    plaque(c, TITLE, "On brille ensemble", y=756, c1="#B98CFF", c2=CYAN, chrome_kind="prism", msg_color=YELLOW, badge=BADGE)
    birds(c, [("duo-mee-trinquer", 112, 680, 196, False, -3)], glow=VIOLET)
    save(c, "mythe-a")
    register("mythe-a", "mythe", None, "A", "La Singularité électrique",
             "Le blason prisme est posé dans l'ombre d'un trou noir cerné d'anneaux de lumière, dont le disque d'accrétion repasse devant lui ; un quasar en jaillit comme un laser. À gauche la toile cosmique et ses amas (10²⁶ m), à droite les traces de particules, la mousse quantique et les cordes (10⁻³⁵ m) ; la grille de néon, au pied, n'est plus que constellation.",
             "duo : Mee et Meo trinquent ensemble, au pied de la toile cosmique", "On brille ensemble")


# ---------------------------------------------------------------- B : du quark au quasar

def my_b():
    c = start("yb", "#22163E", "#0A0716", "#FFC2EC")
    win = rrect_d(92, 274, 448, 712, 16)
    m = window(c, win)
    body = [space(c, 161, "#100430", "#06021C", n=440, clouds=((80, 150, 220, 170, "#AA1A8A", "#3A0838", 0.55, 2), (470, 150, 200, 160, "#1A5AAA", "#081838", 0.5, 6), (60, 600, 160, 260, "#5A1AAA", "#1A0838", 0.4, 9), (480, 600, 160, 260, "#AA1A5A", "#3A0828", 0.35, 12)))]
    # en haut, une toile cosmique ténue
    body.append(f'<g opacity="0.55">{cosmic_web(c, 17, 10, 14, 530, 70, 12, VIOLET, PINK, k=2, w=0.7)}</g>')
    # à gauche, le champ profond : une spirale, une elliptique, un amas et ses arcs de lentille
    body.append(galaxy_wire(c, 44, 322, 30, 2, 1.15, 0.55, 0.3, -24, (MAGENTA, CYAN), 3, 0.9, 3, dots=70, seed=4))
    body.append(elliptical(c, 42, 448, 30, 18, seed=5, rot=-20))
    body.append(cluster(c, 8, 44, 574, 30))
    lens = "".join(f'<path d="{arc_d(44, 574, r, a0, a0 + sp)}"/>' for r, a0, sp in ((38, 300, 70), (44, 110, 60), (33, 200, 44)))
    body.append(tube(c, lens, "#BFE9FF", 1.0, 3, op=0.9))
    rnd = random.Random(31)
    deep = []
    for _ in range(70):
        x, y = rnd.uniform(4, 84), rnd.uniform(280, 720)
        s_ = rnd.uniform(0.8, 2.6)
        deep.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(s_ * 1.7)}" ry="{f(s_ * 0.7)}" fill="{rnd.choice(("#FFE6B0", "#BFE9FF", "#FFC2EC"))}" opacity="{f(rnd.uniform(0.3, 0.75))}" transform="rotate({f(rnd.uniform(0, 180))} {f(x)} {f(y)})"/>')
    body.append(f'<g filter="{ublur(c, 0.5)}">{"".join(deep)}</g>')
    # à droite, la chambre à bulles et le diagramme de Feynman
    body.append(glow_spot(c, 497, 360, 50, 50, CYAN, 0.35))
    body.append(tracks(c, 21, 497, 360, 14, scale=0.6))
    body.append(tracks(c, 8, 488, 468, 8, colors=(MAGENTA, YELLOW, LIME), scale=0.45))
    body.append(feynman(c, 497, 610, 150, 56))
    body.append(star_grid(c, 760, colors=(MAGENTA, CYAN, YELLOW)))
    c.add(f'<g mask="{m}">{"".join(body)}</g>')
    # le faisceau : du quasar (à gauche) au proton et ses quarks (à droite), le blason posé dessus
    g = lgrad(c, "beam", [(0, "#FFFFFF", 1), (0.5, MAGENTA, 0.9), (1, CYAN, 0.9)], user=(64, 0, 476, 0))
    c.add(f'<rect x="64" y="138" width="412" height="24" fill="{g}" opacity="0.45" filter="{ublur(c, 10)}"/>')
    c.add(f'<rect x="64" y="145" width="412" height="10" fill="{g}" opacity="0.75" filter="{ublur(c, 3)}"/>')
    c.add(f'<rect x="64" y="148.5" width="412" height="3" fill="{g}"/>' + f'<line x1="64" y1="150" x2="476" y2="150" stroke="#FFFFFF" stroke-width="0.8" opacity="0.9"/>')
    c.add(fine("".join(f'<line x1="{x}" y1="138" x2="{x}" y2="162"/>' for x in range(110, 440, 22)), "#FFFFFF", 0.6, 0.25))
    echoes = "".join(f'<circle cx="64" cy="150" r="{r}"/>' for r in (40, 62, 88))
    c.add(tube(c, echoes, "#FFB3E6", 0.9, 4, op=0.55, dash="10 6"))
    c.add(quasar(c, 64, 150, 120, 90, MAGENTA, 6, L2=120, glow=1.3))
    c.add(nucleus(c, 476, 150, 30, 16, 5))
    c.add(loupe(c, 476, 150, 40, YELLOW, quarks(c, 476, 150, 17, 1.3), None))
    c.add(label(64, 254, "QUASAR", light(MAGENTA, 0.5), 7.5, "middle", 0.95, 2))
    c.add(pow10(64, 266, "10", "26", "#FFFFFF", 7, "middle", 0.8))
    c.add(label(476, 214, "QUARKS", light(YELLOW, 0.4), 7.5, "middle", 0.95, 2))
    c.add(pow10(476, 226, "10", "-18", "#FFFFFF", 7, "middle", 0.8))
    c.add(spill(c, win, MAGENTA, 28, 0.34))
    c.add(chrome_stroke(c, rrect_d(86, 268, 454, 718, 20), 5, "prism"))
    c.add(tube(c, f'<path d="{win}"/>', MAGENTA, 2, 7))
    c.add(glow_spot(c, 270, 150, 110, 100, "#B98CFF", 0.55))
    myth_crest(c)
    plaque(c, TITLE, "Jusqu'au bout de l'univers", y=756, c1=MAGENTA, c2=CYAN, chrome_kind="prism", msg_color=CYAN, badge=BADGE, style="hud")
    birds(c, [("mee-lettre", 96, 702, 126, False, -6), ("meo-champagne", 444, 702, 126, True, 6)], glow=MAGENTA)
    save(c, "mythe-b")
    register("mythe-b", "mythe", None, "B", "Du quark au quasar",
             "Un seul faisceau de lumière traverse le ciel et porte le blason prisme : il part d'un quasar, à douze milliards d'années-lumière, et finit dans un proton où la loupe trouve trois quarks liés par des gluons. Sur le flanc gauche, le champ profond — une spirale, une elliptique, un amas qui courbe la lumière ; sur le flanc droit, les traces d'une collision en chambre à bulles et un diagramme de Feynman où deux particules s'annihilent en lumière.",
             "pied : Mee (clin d'œil) et Meo (champagne) au pied du cadre", "Jusqu'au bout de l'univers")


# ---------------------------------------------------------------- C : l'échelle de lumière

def medallion(card, cx, cy, r, color, content):
    clip = nid("md")
    card.def_once(clip, f'<clipPath id="{card.id(clip)}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}"/></clipPath>')
    return (f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="#07031A"/>'
            f'<g clip-path="url(#{card.id(clip)})">{content}</g>' + tube(card, f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}"/>', color, 1.4, 4))


def my_c():
    c = start("yc", "#20163E", "#090716", "#BFE9FF")
    win = rrect_d(96, 280, 444, 712, 16)
    m = window(c, win)
    body = [space(c, 171, "#0C0430", "#05021A", n=380, clouds=((270, 120, 300, 160, "#5A1AAA", "#1A0840", 0.55, 3),))]
    # le tunnel des puissances de dix, qui fuit vers le blason
    tunnel = []
    for i in range(1, 9):
        k = 0.82 ** i
        x0 = 270 + (40 - 270) * k
        x1 = 270 + (500 - 270) * k
        y0 = 150 + (300 - 150) * k
        y1 = 150 + (960 - 150) * k
        tunnel.append(f'<path d="{rrect_d(x0, y0 - 140 * k, x1, y1, 30 * k)}"/>')
    body.append(tube(c, "".join(tunnel), VIOLET, 1.1, 5, op=0.8))
    body.append(fine("".join(f'<line x1="270" y1="150" x2="{x}" y2="{y}"/>' for x, y in ((0, 0), (540, 0), (0, 960), (540, 960))), VIOLET, 0.6, 0.35, "2 4"))
    body.append(star_grid(c, 760))
    body.append(quasar(c, 470, 84, 120, -38, CYAN, 4, L2=90, glow=0.7))
    c.add(f'<g mask="{m}">{"".join(body)}</g>')
    # les deux colonnes : l'immense à gauche, l'infime à droite, reliées par une fibre de lumière
    left = [("26", "TOILE", lambda x, y: cosmic_web(c, 2, x - 24, y - 24, x + 24, y + 24, 7, VIOLET, PINK, w=0.8)),
            ("23", "AMAS", lambda x, y: cluster(c, 5, x, y, 18)),
            ("21", "GALAXIE", lambda x, y: galaxy_wire(c, x, y, 20, 2, 1.1, 0.6, 0.2, -20, (MAGENTA, CYAN), 2, 0.7, 2, dots=30, seed=2)),
            ("9", "ÉTOILE", lambda x, y: glow_spot(c, x, y, 18, 18, YELLOW, 1) + sparkle(x, y, 16, "#FFFFFF", 0.95)),
            ("7", "TERRE", lambda x, y: planet(c, x, y, 13, "#3FA6FF", "#0A2A5A"))]
    right = [("-5", "CELLULE", lambda x, y: cell(c, x, y, 17, LIME, MAGENTA, 3, 0.9)),
             ("-9", "MOLÉCULE", lambda x, y: molecule(c, x - 7, y - 4, 7, ((0, 0), (1, 0)), LIME, MAGENTA, 0.9, 0, False)),
             ("-10", "ATOME", lambda x, y: atom(c, x, y, 18, 6, 3, (MAGENTA, CYAN, YELLOW), 0.8, 20, 3.5, True, 2)),
             ("-15", "NOYAU", lambda x, y: nucleus(c, x, y, 10, 12, 4)),
             ("-35", "CORDE", lambda x, y: tube(c, f'<path d="{string_loop_d(x, y, 12, 5, 0.25)}"/>', MAGENTA, 1, 3))]
    for col_x, items, color in ((44, left, CYAN), (496, right, MAGENTA)):
        ys = [300 + i * 96 for i in range(len(items))]
        c.add(tube(c, f'<line x1="{col_x}" y1="{ys[0]}" x2="{col_x}" y2="{ys[-1]}"/>', color, 1.2, 4, op=0.8))
        for (e, name, fn), y in zip(items, ys):
            c.add(medallion(c, col_x, y, 26, color, fn(col_x, y)))
            c.add(f'<rect x="{col_x - 34}" y="{y + 30}" width="68" height="24" rx="6" fill="#05020F" opacity="0.85"/>')
            c.add(label(col_x, y + 40, name, light(color, 0.45), 6.5, "middle", 0.95, 1.2))
            c.add(pow10(col_x, y + 51, "10", e, "#FFFFFF", 7, "middle", 0.85))
    c.add(spill(c, win, CYAN, 28, 0.32))
    c.add(chrome_stroke(c, rrect_d(90, 274, 450, 718, 20), 5, "prism"))
    c.add(tube(c, f'<path d="{win}"/>', CYAN, 2, 7))
    rings = reticle_geo(270, 150, 92, 6, 8) + f'<circle cx="270" cy="150" r="104"/>'
    c.add(tube(c, rings, CYAN, 1.1, 5, op=0.85))
    c.add(tube(c, '<ellipse cx="270" cy="150" rx="128" ry="34" transform="rotate(-16 270 150)"/>', MAGENTA, 1.4, 5, op=0.85))
    c.add(glow_spot(c, 270, 150, 120, 110, "#B98CFF", 0.5))
    myth_crest(c)
    c.add(label(270, 30, "DU QUARK AU QUASAR · 61 PUISSANCES DE DIX", light(CYAN, 0.5), 7, "middle", 0.85, 1.6))
    plaque(c, TITLE, "Pour toujours, ensemble", y=756, c1=CYAN, c2=MAGENTA, chrome_kind="prism", msg_color=PINK, badge=BADGE)
    birds(c, [("duo-on-danse", 88, 88, 150, False, -6)], glow=MAGENTA)
    save(c, "mythe-c")
    register("mythe-c", "mythe", None, "C", "L'Échelle de lumière",
             "Deux colonnes de médaillons de néon tiennent toute l'échelle de l'univers : à gauche l'immense — toile cosmique, amas, galaxie, étoile, Terre — à droite l'infime — cellule, molécule, atome, noyau, corde ; derrière la photo, un tunnel de cadres emboîtés fuit vers le blason prisme, comme un zoom de soixante et une puissances de dix.",
             "duo : Mee et Meo dansent ensemble dans le coin du ciel", "Pour toujours, ensemble")


ALL = [my_a, my_b, my_c]
