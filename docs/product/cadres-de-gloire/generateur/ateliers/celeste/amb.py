"""Ambassadeur V → I : le rang où l'on choisit son atmosphère. Cinq portes de l'Empire céleste, de plus en plus riches."""

from beasts import *  # noqa: F401,F403
from archi import *  # noqa: F401,F403

GEM = "#E8372A"


def sky(card, stops, y1=H, win=None):
    m = f' mask="{mask_out(card, win)}"' if win else ""
    card.add(f'<rect width="{W}" height="{y1}" fill="{card.grad(nid("sky"), stops)}"{m}/>')


# ---------------------------------------------------------------- IV : la porte vermillon

def skyline(card, y, color, seed=3, x0=-10, x1=550, lit="#FFC870"):
    """Silhouettes de toits de palais à l'horizon, quelques fenêtres allumées."""
    rnd = random.Random(seed)
    out = []
    x = x0
    while x < x1:
        w = rnd.uniform(50, 90)
        h = rnd.uniform(10, 26)
        top = y - h
        out.append(f'<path d="M{fmt(x - 6)} {fmt(top + 8)} Q{fmt(x + w * 0.15)} {fmt(top + 4)} {fmt(x + w * 0.3)} {fmt(top)} L{fmt(x + w * 0.7)} {fmt(top)} '
                   f'Q{fmt(x + w * 0.85)} {fmt(top + 4)} {fmt(x + w + 6)} {fmt(top + 8)} L{fmt(x + w - 4)} {fmt(top + 11)} L{fmt(x + w - 4)} {fmt(y + 40)} L{fmt(x + 4)} {fmt(y + 40)} L{fmt(x + 4)} {fmt(top + 11)}Z" fill="{color}"/>')
        for _ in range(rnd.randint(0, 2)):
            out.append(f'<rect x="{fmt(x + rnd.uniform(10, w - 14))}" y="{fmt(top + 16)}" width="3" height="4" fill="{lit}" opacity="0.8"/>')
        x += w + rnd.uniform(4, 16)
    return "".join(out)


def amb5():
    c = start("am5", "#3A2A22", "#120A08", "#FFC98A")
    win = win_rect(84, 278, 456, 722, 10)
    sky(c, [(0, "#0E1440"), (0.35, "#3A2468"), (0.62, "#B4507A"), (0.8, "#F2A35E"), (1, "#F7C77A")], 270)
    c.add(moon(c, 270, 118, 70, 0.5, ("#FFF8E2", "#F7E3B0", "#D8B878")))
    stars(c, 21, 60, (0, 0, W, 150), "#FFFFFF", 1.2)
    c.add(cloud(c, 66, 120, 14, "#FBE6C8", "#B4507A", hi="#FFFFFF", op=0.85), cloud(c, 474, 150, 12, "#FBE6C8", "#B4507A", flip=True, op=0.8))
    c.add(skyline(c, 236, "#5A2850", 3), skyline(c, 252, "#3A1636", 8))
    c.add(f'<path d="M0 252H{W}V{H}H0Z {win}" fill-rule="evenodd" fill="{lg(c, [(0, VERM_HI, 1), (0.3, VERM, 1), (1, VERM_D, 1)], user=(0, 252, 0, 960))}"/>')
    c.add(f'<path d="M0 252H{W}V{H}H0Z {win}" fill-rule="evenodd" fill="{lg(c, [(0, "#FFFFFF", 0), (0.5, "#FFFFFF", 0.12), (1, "#FFFFFF", 0)], 0, 0, 1, 0.3)}"/>')
    for x0 in (14, 474):
        c.add(f'<rect x="{x0}" y="318" width="52" height="396" rx="4" fill="none" stroke="{GOLD}" stroke-width="1.4" opacity="0.8"/>')
        c.add(door_nails(c, x0 + 15, 340, 2, 7, 22, 54, 5.2))
    c.add(knocker(c, 40, 530, 0.8), knocker(c, 500, 530, 0.8))
    c.add(f'<path d="M{84 - 16} {278 - 16} H{456 + 16} V{722 + 16} H{84 - 16}Z" fill="none" stroke="{fret(c, "fr5", 12, GOLD, None, 1.4)}" stroke-width="11"/>')
    c.add(brackets(c, 40, 500, 252, 16, 20))
    r, top, bot = roof(c, 270, 206, 246, 48, GLAZE_JADE, 0.36, 11, pearl=False, uid="r5")
    c.add(r)
    frame_window(c, win, "gold", 3.4, 16, 0.75)
    c.add(lantern(c, 104, 318, 0.95, cord=40), lantern(c, 436, 318, 0.95, cord=40))
    for x, fl in ((96, False), (444, True)):
        c.add(cloud(c, x, 708, 9, GOLD_HI, GOLD_LO, flip=fl, tail=False))
    c.add(f'<rect x="0" y="900" width="{W}" height="60" fill="{c.grad("step5", [(0, "#E2DACB"), (1, "#8A8274")])}"/>')
    c.add(f'<rect x="0" y="900" width="{W}" height="22" fill="{seigaiha(c, "sg5", 11, "#D8CFBE", "#A89E8C", 3, 0.9)}" opacity="0.8"/>')
    c.add(f'<rect x="0" y="900" width="{W}" height="2" fill="#FFFFFF" opacity="0.6"/>')
    vignette(c, "#120404", 0.42)
    crest(c, 270, 116, 0.8, "gold", division=4, gem=GEM)
    plate(c, "Ambassadeur IV", y=756, style="laque")
    duo(c, [(86, 742, 118, False, -4), (454, 742, 118, True, 4)], "mee-sourire", "meo-salut")
    finish(c, "ambassadeur-4", "ambassadeur", 4, "IV", "La Porte vermillon",
           "Au soir, une porte de palais s'ouvre sur la photo : laque vermillon, clous d'or en rangs, heurtoirs à tête de lion, "
           "un auvent de tuiles vernissées vert jade sur sa frise de consoles, deux lanternes de papier rouge et, derrière, "
           "les toits de la cité sous la pleine lune — l'entrée dans l'Empire céleste.",
           "pied : Mee (sourire) et Meo (salut) sur le seuil", None)


# ---------------------------------------------------------------- V : la porte de lune

def swallow(cx, cy, s, rot=0):
    """Hirondelle en vol (création) : ailes en faux, queue fourchue, gorge rousse — le retour du printemps."""
    d = ('<path d="M0 0 C-10 -6 -26 -14 -44 -12 C-30 -8 -16 -2 -6 4Z" fill="#1A1C2E"/>'
         '<path d="M0 0 C10 -8 24 -20 40 -24 C30 -14 18 -4 6 4Z" fill="#22263A"/>'
         '<path d="M-6 2 C-2 -2 6 -2 10 2 C6 6 -2 6 -6 2Z" fill="#1A1C2E"/>'
         '<path d="M10 2 L16 1 L10 4Z" fill="#1A1C2E"/><circle cx="8" cy="2" r="1.4" fill="#C8502A"/>'
         '<path d="M-6 3 L-22 12 M-6 3 L-18 14" stroke="#1A1C2E" stroke-width="1.6" stroke-linecap="round"/>')
    return tf(d, cx, cy, rot, s * 1.4)


def amb4():
    c = start("am4", "#3C2E2A", "#140E0C", "#FFD3B0")
    win = win_moon(270, 490, 198, 244)
    sky(c, [(0, "#1E1648"), (0.12, "#5A3478"), (0.2, "#D47C9A"), (0.26, "#F6C9A8")], 300, win)
    c.add(crescent(c, 440, 70, 26, 0.36, 0.6))
    stars(c, 41, 50, (0, 0, W, 170), "#FFFFFF", 1.1)
    wall = lg(c, [(0, "#FBF7EE", 1), (0.6, "#ECE4D4", 1), (1, "#CFC4AE", 1)], user=(0, 240, 0, 960))
    c.add(f'<path d="M0 240H{W}V{H}H0Z {win}" fill-rule="evenodd" fill="{wall}"/>')
    rnd = random.Random(4)
    stains = "".join(f'<ellipse cx="{fmt(rnd.uniform(0, W))}" cy="{fmt(rnd.uniform(250, 960))}" rx="{fmt(rnd.uniform(20, 70))}" ry="{fmt(rnd.uniform(10, 30))}" fill="#B8AA90" opacity="{fmt(rnd.uniform(0.04, 0.1))}"/>' for _ in range(30))
    c.add(f'<g mask="{mask_out(c, win)}" filter="{c.blur("stain", 8)}">{stains}</g>')
    c.add(tile_coping(c, -10, 550, 244, 18))
    c.add(f'<path d="{win}" fill="none" stroke="#000000" stroke-width="30" opacity="0.18" filter="{c.blur("mg4", 6)}"/>')
    c.add(f'<path d="{win}" fill="none" stroke="#A39C90" stroke-width="22"/>')
    rim = []
    for k in range(64):
        a = k * 360 / 64
        p1 = (270 + 198 * math.sin(math.radians(a)), 490 - 244 * math.cos(math.radians(a)))
        p2 = (270 + 220 * math.sin(math.radians(a)), 490 - 266 * math.cos(math.radians(a)))
        rim.append(f"M{fmt(p1[0])} {fmt(p1[1])} L{fmt(p2[0])} {fmt(p2[1])}")
    c.add(f'<path d="{" ".join(rim)}" stroke="#7E776A" stroke-width="1.2"/>')
    c.add(f'<path d="{win_moon(270, 490, 220, 266)}" fill="none" stroke="#C9C2B4" stroke-width="2"/>')
    inner_shadow(c, win, 16, 0.7)
    metal_line(c, win, 2.6, "gold")
    c.add(f'<rect x="0" y="900" width="{W}" height="60" fill="{c.grad("pave4", [(0, "#8E877A"), (1, "#4A453C")])}"/>')
    for x in range(-20, 560, 46):
        c.add(f'<path d="M{x} 900 L{x - 14} 960" stroke="#3A362F" stroke-width="1.4"/>')
    for x, s_, sd in ((500, 20, 3), (522, 16, 9), (478, 14, 11)):
        c.add(bamboo(c, x, 120, 960, s_, sd))
    c.add(sakura_branch(c, [(-20, 182), (60, 196), (150, 226), (230, 244), (300, 262)], 13, 7, 34, (6, 11), 6))
    c.add(sakura_branch(c, [(-10, 330), (40, 318), (80, 290), (120, 282)], 7, 12, 8, (5, 9)))
    c.add(sakura_branch(c, [(560, 300), (500, 290), (470, 270)], 6, 17, 6, (5, 8)))
    rnd = random.Random(9)
    for _ in range(26):
        x, y = rnd.uniform(10, 530), rnd.uniform(200, 900)
        if 120 < x < 420 and 300 < y < 700:
            continue
        c.add(petal(x, y, rnd.uniform(4, 7), rnd.uniform(0, 360), rnd.choice(("#F8BBD0", "#FDE3EA", "#F48FB1")), 0.9))
    c.add(stone_lantern(c, 40, 760, 0.8))
    c.add(cloud(c, 70, 108, 12, "#FBE3D8", "#B4507A", hi="#FFFFFF", op=0.85), cloud(c, 356, 58, 9, "#FBE3D8", "#B4507A", flip=True, op=0.7))
    for (x, y, sc, rot) in ((176, 70, 0.5, -10), (204, 96, 0.38, 6), (380, 128, 0.42, 12)):
        c.add(swallow(x, y, sc, rot))
    vignette(c, "#1A0E14", 0.35)
    crest(c, 270, 126, 0.82, "gold", division=5, gem=GEM)
    plate(c, "Ambassadeur V", message="Pour toi, maman", y=752, style="laque")
    duo(c, [(110, 214, 98, False, -6), (432, 214, 98, True, 6)], "mee-amoureuse", "meo-love")
    finish(c, "ambassadeur-5", "ambassadeur", 5, "V", "La Porte de lune",
           "Dans le mur chaulé d'un jardin de lettrés, une porte ronde « de lune » cadre la photo ; un cerisier en fleurs "
           "passe par-dessus le chaperon de tuiles grises, des bambous montent la garde, une lanterne de pierre s'allume au pied du mur, "
           "les hirondelles rentrent au crépuscule et les pétales tombent.",
           "perchés : Mee (amoureuse) et Meo (love) sur le chaperon du mur", "Pour toi, maman")


# ---------------------------------------------------------------- III : le pavillon de jade

def valance(card, x0, x1, y, h):
    """Lambrequin ajouré sous la poutre (gualuo) : grecque d'or en écoinçons."""
    gold = card.metal("gold")[0]
    out = []
    for side in (-1, 1):
        ex = x0 if side < 0 else x1
        d = (f"M{fmt(ex)} {fmt(y)} L{fmt(ex - side * 120)} {fmt(y)} Q{fmt(ex - side * 70)} {fmt(y + 8)} {fmt(ex - side * 40)} {fmt(y + h * 0.5)} "
             f"Q{fmt(ex - side * 14)} {fmt(y + h * 0.8)} {fmt(ex)} {fmt(y + h)}Z")
        out.append(f'<path d="{d}" fill="{fret(card, "valf", 9, gold, "#3A0806", 1.1)}" stroke="{gold}" stroke-width="2"/>')
    return "".join(out)


def amb3():
    c = start("am3", "#34282A", "#120C0C", "#FFC98A")
    win = win_rect(88, 250, 452, 716, 8)
    sky(c, [(0, "#060A26"), (0.5, "#16245A"), (1, "#2C3A7A")], 220)
    stars(c, 33, 90, (0, 0, W, 160), "#FFFFFF", 1.3)
    c.add(f'<path d="M0 150H{W}V{H}H0Z {win}" fill-rule="evenodd" fill="{c.grad("wall3", [(0, "#5A0E0A"), (1, "#2A0504")])}"/>')
    c.add(f'<path d="M0 150H{W}V{H}H0Z {win}" fill-rule="evenodd" fill="{cloud_pattern(c, "cp3", 46, None, "#E8B53C", 1.1)}" opacity="0.35"/>')
    r, top, bot = roof(c, 270, 64, 236, 78, GLAZE_JADE, 0.34, 12, uid="r3")
    c.add(brackets(c, 30, 510, 142, 22))
    c.add(painted_beam(c, 22, 518, 164, 30, uid="b3"))
    c.add(r)
    c.add(valance(c, 70, 470, 194, 50))
    c.add(column(c, 46, 194, 760, 34, uid="c3l"), column(c, 494, 194, 760, 34, uid="c3r"))
    frame_window(c, win, "gold", 3.2, 18, 0.8)
    for x in (112, 428):
        c.add(palace_lantern(c, x, 312, 0.62))
    c.add(f'<rect x="0" y="740" width="{W}" height="220" fill="{c.grad("terr3", [(0, "#E9E4DA"), (1, "#9C968A")])}"/>')
    c.add(f'<g opacity="0.25">{"".join(f"<path d=\'M{x} 740 L{x - 30} 960\' stroke=\'#6A645A\' stroke-width=\'1\'/>" for x in range(0, 600, 40))}</g>')
    c.add(balustrade(c, 20, 520, 686, 64, 7, uid="bal3"))
    c.add(f'<rect x="0" y="738" width="{W}" height="4" fill="#FFFFFF" opacity="0.6"/>')
    vignette(c, "#0A0404", 0.4)
    c.add(f'<rect x="222" y="86" width="96" height="150" rx="8" fill="#14100A" stroke="{GOLD}" stroke-width="2"/>')
    crest(c, 270, 150, 0.8, "gold", division=3, gem=GEM)
    plate(c, "Ambassadeur III", y=770, style="jade")
    duo(c, [(58, 666, 106, False, -2), (482, 666, 106, True, 2)], "mee-bravo", "meo-bravo")
    finish(c, "ambassadeur-3", "ambassadeur", 3, "III", "Le Pavillon aux tuiles de jade",
           "La façade d'un pavillon impérial : toit à croupes de tuiles vernissées vert jade et coins relevés, frise de consoles "
           "dougong, poutre peinte de bleus et de verts, colonnes laquées, lanternes de palais aux panneaux de soie et "
           "balustrade de marbre blanc à têtes de nuage.",
           "balustrade : Mee (bravo) et Meo (bravo) debout aux deux bouts de la balustrade", None)


# ---------------------------------------------------------------- II : l'ambassade de Malindi (Afrique)

def swahili_frame(c, x0, x1, y_top, y_bot, jamb=56):
    """La porte sculptée de la côte swahilie : chambranles à chaîne et rosaces, linteau, tympan rayonnant, clous de laiton."""
    wood = c.grad("teak", [(0, "#4A2412"), (0.5, "#2A1208"), (1, "#180904")], 0, 0, 1, 0)
    gold = GOLD
    cx = (x0 + x1) / 2
    out = []
    for jx in (x0 - jamb, x1):
        out.append(f'<rect x="{fmt(jx)}" y="{fmt(y_top)}" width="{fmt(jamb)}" height="{fmt(y_bot - y_top)}" fill="{wood}" stroke="#0E0602" stroke-width="1"/>')
        out.append(chain_band(c, jx + jamb * 0.3, y_top + 8, y_bot - 8, jamb * 0.34, "#1E0E06", gold))
        out.append(f'<rect x="{fmt(jx + jamb * 0.55)}" y="{fmt(y_top + 6)}" width="{fmt(jamb * 0.36)}" height="{fmt(y_bot - y_top - 12)}" fill="#1E0E06" stroke="{gold}" stroke-width="0.8"/>')
        for yy in range(int(y_top + 30), int(y_bot - 20), 52):
            out.append(rosette(jx + jamb * 0.73, yy, 9, gold, 8, VERM))
            out.append(f'<path d="M{fmt(jx + jamb * 0.73)} {yy + 14} q-4 12 0 24 q4 -12 0 -24Z" fill="{gold}" opacity="0.8"/>')
    lt = y_top - 30
    out.append(f'<rect x="{fmt(x0 - jamb)}" y="{fmt(lt)}" width="{fmt(x1 - x0 + 2 * jamb)}" height="34" fill="{wood}" stroke="#0E0602" stroke-width="1"/>')
    out.append(f'<rect x="{fmt(x0 - jamb + 6)}" y="{fmt(lt + 6)}" width="{fmt(x1 - x0 + 2 * jamb - 12)}" height="22" fill="#1E0E06" stroke="{gold}" stroke-width="0.8"/>')
    for k in range(13):
        out.append(rosette(x0 - jamb + 24 + k * (x1 - x0 + 2 * jamb - 48) / 12, lt + 17, 8, gold, 6))
    R = 112
    fan_d = f"M{fmt(cx - R)} {fmt(lt)} A{R} {R} 0 0 1 {fmt(cx + R)} {fmt(lt)}Z"
    out.append(f'<path d="{fan_d}" fill="{wood}" stroke="#0E0602" stroke-width="1"/>')
    for k in range(13):
        a = -90 + k * 15
        p1, p2 = pt(cx, lt, 28, a), pt(cx, lt, R - 14, a)
        pc = pt(cx, lt, R - 50, a)
        out.append(f'<path d="M{fmt(p1[0])} {fmt(p1[1])} L{fmt(p2[0])} {fmt(p2[1])}" stroke="{gold}" stroke-width="1.2"/>')
        out.append(f'<ellipse cx="{fmt(pc[0])}" cy="{fmt(pc[1])}" rx="5" ry="16" fill="{gold}" opacity="0.85" transform="rotate({a} {fmt(pc[0])} {fmt(pc[1])})"/>')
    out.append(f'<path d="M{fmt(cx - R + 6)} {fmt(lt)} A{R - 6} {R - 6} 0 0 1 {fmt(cx + R - 6)} {fmt(lt)}" fill="none" stroke="{gold}" stroke-width="2"/>')
    out.append(f'<path d="M{fmt(cx - R)} {fmt(lt)} A{R} {R} 0 0 1 {fmt(cx + R)} {fmt(lt)}" fill="none" stroke="{gold}" stroke-width="3"/>')
    for k in range(15):
        p = pt(cx, lt, R + 1, -84 + k * 12)
        out.append(stud(c, p[0], p[1], 4.2))
    for jx in (x0 - 6, x1 + 6):
        for yy in range(int(y_top + 20), int(y_bot), 46):
            out.append(stud(c, jx, yy, 5))
    return "".join(out)


def amb2():
    c = start("am2", "#3A2A20", "#120A06", "#FFC98A")
    win = win_rect(92, 258, 448, 716, 6)
    sky(c, [(0, "#1A1446"), (0.1, "#5A2E6A"), (0.2, "#E0805A"), (0.28, "#F7C46A"), (0.34, "#FBE2A0")], 360, win)
    c.add(f'<circle cx="270" cy="250" r="160" fill="{c.rgrad("sun2", [(0, "#FFF4C8", 0.9), (0.4, "#FFD27A", 0.4), (1, "#FFB050", 0)])}"/>')
    c.add(cloud(c, 60, 118, 13, "#FFE7C0", "#C0603A", hi="#FFFFFF", op=0.9), cloud(c, 470, 70, 11, "#FFE7C0", "#C0603A", flip=True, op=0.8))
    c.add(f'<rect x="0" y="176" width="{W}" height="50" fill="{c.grad("sea2", [(0, "#3A6AA8"), (1, "#0E2A5E")])}"/>')
    rnd = random.Random(2)
    c.add("".join(f'<line x1="{fmt(x)}" y1="{fmt(y)}" x2="{fmt(x + rnd.uniform(8, 26))}" y2="{fmt(y)}" stroke="#FFE6B0" stroke-width="1" opacity="{fmt(rnd.uniform(0.3, 0.8))}"/>' for x, y in [(rnd.uniform(0, 520), rnd.uniform(180, 220)) for _ in range(40)]))
    c.add(f'<path d="M0 226H{W}V{H}H0Z {win}" fill-rule="evenodd" fill="{c.grad("wall2", [(0, VERM), (1, VERM_D)])}"/>')
    c.add(f'<path d="M0 226H{W}V{H}H0Z {win}" fill-rule="evenodd" fill="{cloud_pattern(c, "cp2", 40, None, GOLD, 1)}" opacity="0.4"/>')
    c.add(swahili_frame(c, 92, 448, 248, 724, 58))
    frame_window(c, win, "gold", 3, 16, 0.75)
    c.add(giraffe(c, 96, 152, 0.74))
    c.add(cloud(c, 66, 214, 15, "#FFF4DE", "#B05A3A", hi="#FFFFFF"), cloud(c, 150, 222, 10, "#FFF4DE", "#B05A3A", flip=True, tail=False))
    c.add(treasure_ship(c, 462, 196, 0.6))
    c.add(cloud(c, 420, 214, 11, "#FFF4DE", "#B05A3A", tail=False), cloud(c, 520, 210, 9, "#FFF4DE", "#B05A3A", flip=True, tail=False))
    c.add(f'<rect x="0" y="724" width="{W}" height="236" fill="#0B1D4A"/>')
    c.add(wave_band(c, 790, 80, 11, rows=2, w=(80, 120)))
    vignette(c, "#0A0604", 0.35)
    crest(c, 270, 140, 0.8, "gold", division=2, gem=GEM)
    plate(c, "Ambassadeur II", message="Le voyage continue", y=760, style="laque")
    duo(c, [(70, 742, 116, False, -6), (478, 750, 110, True, 6)], "mee-coucou", "meo-selfie")
    c.motif("afrique")
    finish(c, "ambassadeur-2", "ambassadeur", 2, "II", "L'Ambassade de Malindi",
           "En 1414, l'ambassade de Malindi, sur la côte swahilie, offrit une girafe à la cour Ming, qui la salua comme un qilin. "
           "La photo passe une porte sculptée de Lamu et de Zanzibar — chaînes, rosaces, tympan rayonnant, clous de laiton — "
           "ouverte dans un mur vermillon ; au ciel, la girafe-qilin sur son nuage et une jonque de la flotte des trésors.",
           "pied : Mee (coucou) et Meo (selfie) sur les flots, au pied de la porte", "Le voyage continue")


# ---------------------------------------------------------------- I : les deux dragons et la perle

def amb1():
    c = start("am1", "#3A2620", "#120806", "#FFC98A")
    win = win_rect(96, 262, 444, 712, 8)
    c.add(f'<path d="M0 0H{W}V{H}H0Z {win}" fill-rule="evenodd" fill="{c.grad("bg1", [(0, "#4A0806"), (0.35, "#8E1A10"), (1, "#3A0604")])}"/>')
    c.add(f'<path d="M0 0H{W}V{H}H0Z {win}" fill-rule="evenodd" fill="{cloud_pattern(c, "cp1", 44, None, GOLD, 1.1)}" opacity="0.38"/>')
    n = len(c.body)
    c.add(f'<circle cx="270" cy="120" r="230" fill="{c.rgrad("halo1", [(0, "#FFE7A0", 0.6), (0.45, "#FF9A40", 0.2), (1, "#FF7A30", 0)])}"/>')
    c.add(rays(270, 70, 40, 260, 44, "#FFD98A", 1.6, -180, 180, 0.62).replace("<line", '<line opacity="0.3"'))
    since(c, n, f'mask="{mask_out(c, win)}"')
    c.add(f'<path d="M{96 - 18} {262 - 18} H{444 + 18} V{712 + 18} H{96 - 18}Z" fill="none" stroke="{fret(c, "fr1", 13, GOLD, "#3A0604", 1.4)}" stroke-width="13"/>')
    c.add(f'<path d="M{96 - 26} {262 - 26} H{444 + 26} V{712 + 26} H{96 - 26}Z" fill="none" stroke="{GOLD}" stroke-width="1.6"/>')
    c.add(f'<rect x="0" y="852" width="{W}" height="108" fill="#0B1D4A"/>')
    c.add(sea_cliff(c, 840, 120))
    c.add(robe_rock(c, 44, 900, 70, 74, "l"), robe_rock(c, 496, 900, 70, 74, "r"))
    c.add(wave_band(c, 880, 40, 21, rows=1, w=(60, 90)))
    frame_window(c, win, "gold", 3.6, 18, 0.8)
    for x, y, s_, fl in ((60, 40, 13, False), (480, 40, 13, True), (34, 250, 10, False), (506, 250, 10, True)):
        c.add(cloud(c, x, y, s_, GOLD_HI, GOLD_LO, flip=fl, hi="#FFFFFF"))
    left = [(150, 88), (104, 66), (56, 96), (34, 178), (58, 262), (34, 352), (56, 446), (32, 540), (54, 630), (36, 720), (50, 800)]
    right = [(540 - x, y) for x, y in left]
    c.add(dragon(c, left, 1.0, DRAGON_GOLD, "L", wmax=26, legs=(0.17, 0.5), v=-1, leg_len=0.9))
    c.add(dragon(c, right, 1.0, DRAGON_GOLD, "R", wmax=26, legs=(0.17, 0.5), v=1, leg_len=0.9))
    c.add(flaming_pearl(c, 270, 56, 20, flame=("#FF5A2A", "#FFC94A"), n=8))
    vignette(c, "#1A0202", 0.3)
    crest(c, 270, 158, 0.8, "gold", division=1, gem=GEM)
    plate(c, "Ambassadeur I", message="Merci la famille", y=748, style="laque")
    duo(c, [(66, 726, 106, False, -6), (474, 726, 106, True, 6)], "mee-fete", "meo-roi")
    finish(c, "ambassadeur-1", "ambassadeur", 1, "I", "Les Deux Dragons et la perle",
           "Deux dragons d'or serpentins (création) montent le long de la photo et se disputent, au-dessus du blason, la perle flamboyante "
           "de la sagesse ; laque rouge semée de nuages d'or, grecque « hui » autour de la fenêtre et, au pied, l'eau debout, les flots "
           "et les rochers des robes impériales.",
           "pied : Mee (fête) et Meo (roi) au pied des dragons", "Merci la famille")


def build():
    amb5()
    amb4()
    amb3()
    amb2()
    amb1()
