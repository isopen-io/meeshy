"""Orateur : trois constructions où la parole et la lumière portent — la toguna dogon, les cases-obus musgum,
les églises de lumière de Lalibela."""

from kit import *  # noqa: F401,F403
from archi import *  # noqa: F401,F403

METAL = "redgold"


def ora_a():
    """A — La Maison de la parole (toguna dogon, falaise de Bandiagara)."""
    c = start("oa", top="#3A2416", bottom="#120A06", rim="#FFC27A")
    sky = c.grad("oa-sky", [(0, "#24123A"), (0.45, "#9A3A4A"), (0.8, "#F08A4A"), (1, "#FFD08A")])
    c.add(f'<rect width="540" height="230" fill="{sky}"/>')
    halo(c, "oa-sun", 270, 132, 300, 200, "#FFD27A", 0.75)
    c.add(rays(270, 132, 70, 360, 49, "#FFE6A8", 2.2, -90, 90, 0.7).replace("<line", '<line opacity="0.26"'))
    c.add(cliff(c, -10, 92, 550, 236, ("#E0A06E", "#A8643E", "#55301A"), 6, 18, "#FFD08A"))
    c.add(f'<rect x="0" y="92" width="540" height="144" fill="{lgrad(c, "oa-mist", [(0, "#FFC890", 0.0), (1, "#FFC890", 0.25)])}"/>')
    for gx, gy, s in ((40, 220, 0.62), (84, 214, 0.5), (456, 214, 0.5), (500, 222, 0.62), (126, 210, 0.38), (414, 210, 0.38)):
        c.add(granary(c, gx, gy, s))
    c.add(waves(270, 132, 96, 22, 7, "#FFE6A8", 1.6, 0.75, -70, 70))
    shade = c.grad("oa-shade", [(0, "#1E0F08"), (1, "#3A2010")])
    m = window(c, "oa-win", 76, 270, 464, 730, 10)
    c.add(f'<rect x="0" y="236" width="540" height="724" fill="{shade}" mask="{m}"/>')
    c.add(f'<rect x="0" y="236" width="540" height="724" fill="{lgrad(c, "oa-light", [(0, "#000000", 0.6), (0.4, "#000000", 0), (1, "#FFB060", 0.18)])}" mask="{m}"/>')
    ground = c.grad("oa-ground", [(0, "#8A4A26"), (1, "#3A1C0C")])
    c.add(f'<path d="M0 744 L540 744 L540 960 L0 960Z" fill="{ground}" mask="{m}"/>')
    halo(c, "oa-gl", 270, 760, 300, 60, "#FFB060", 0.35)
    for gx, gy, s in ((26, 812, 0.7), (514, 812, 0.7), (64, 806, 0.5), (476, 806, 0.5)):
        c.add(granary(c, gx, gy, s))
    cloth = []
    for i in range(30):
        for j in range(4):
            col = ("#1E2A5A", "#E9E4D6")[(i + j) % 2] if j in (1, 2) else "#14204A"
            cloth.append(f'<rect x="{-10 + i * 19}" y="{904 + j * 14}" width="19" height="14" fill="{col}"/>')
    c.add(f'<g filter="{c.shadow("oa-cl", 0, -2, 3, "#000", 0.5)}">{"".join(cloth)}</g>')
    c.add("".join(f'<path d="M{-10 + i * 19} 904 l9.5 7 l9.5 -7" fill="none" stroke="#E9E4D6" stroke-width="1.2" opacity="0.7"/>' for i in range(30)))
    c.add(f'<g filter="{c.shadow("oa-pil", 4, 0, 5, "#000", 0.6)}">{toguna_pillar(c, 40, 238, 760, 40)}{toguna_pillar(c, 500, 238, 760, 40)}</g>')
    c.add(f'<g filter="{c.shadow("oa-roof", 0, 8, 7, "#000", 0.7)}">{togu_na(c, -14, 554, 264, 78, 8)}</g>')
    wp = window_path(76, 270, 464, 730, 10)
    inner_shadow(c, wp, 24, 0.85)
    gold_line(c, wp, 2.6, "redgold")
    crest(c, 270, 128, 0.86, METAL, division=None)
    bird(c, "mee-bravo", 128, 182, 104, False, -6)
    bird(c, "meo-salut", 412, 182, 104, True, 6)
    plate(c, "Orateur", "Ma voix porte loin", y=782, style="ebene", accent="#F6C77A", title_size=40)
    finish(c, "orateur-a", "orateur", None, "A", "La Maison de la parole",
           "Sous la falaise de Bandiagara et ses greniers coiffés de paille, la photo s'abrite sous une toguna, la « maison de la "
           "parole » des anciens dogon : huit couches de tiges de mil, des piliers sculptés de chevrons et de losanges, un toit si "
           "bas qu'on y parle assis — et que la voix porte sans qu'on la hausse.",
           "libre : Mee (bravo) et Meo (salut) perchés sur le toit de la toguna", "Ma voix porte loin")


def ora_b():
    """B — L'Écho des cases-obus (Musgum)."""
    c = start("ob", top="#3A2030", bottom="#120810", rim="#FFC090")
    sky = c.grad("ob-sky", [(0, "#120C30"), (0.32, "#3A1A52"), (0.6, "#B24A5A"), (0.82, "#F4925A"), (1, "#FFD394")])
    win = "M84 728 L84 470 C84 330 176 250 270 250 C364 250 456 330 456 470 L456 728Z"
    c.def_once("ob-m", f'<mask id="{c.id("ob-m")}"><rect width="540" height="960" fill="#FFFFFF"/><path d="{win}" fill="#000000"/></mask>')
    m = f"url(#{c.id('ob-m')})"
    c.add(f'<rect width="540" height="960" fill="{sky}" mask="{m}"/>')
    c.add(f'<g mask="{m}">')
    stars(c, 12, 70, (0, 0, 540, 260), "#FFFFFF", 1.3, False)
    halo(c, "ob-sun", 270, 140, 320, 300, "#FFD27A", 0.6)
    c.add(f'<g filter="{soft(c, 1.5)}">' + rays(270, 140, 90, 560, 33, "#FFE6B0", 5, -150, 150, 0.55).replace("<line", '<line opacity="0.16"') + "</g>")
    c.add(waves(270, 140, 104, 34, 5, "#FFE6B0", 2.2, 0.75, -80, 80))
    c.add(waves(270, 140, 121, 34, 4, "#FFB98A", 1.0, 0.5, -76, 76))
    ground = c.grad("ob-gr", [(0, "#8A4424"), (1, "#24100A")])
    c.add(f'<path d="M0 740 Q270 726 540 740 L540 960 L0 960Z" fill="{ground}"/>')
    c.add(f'<path d="M0 740 Q270 726 540 740" fill="none" stroke="#FFC890" stroke-width="1.4" opacity="0.6"/>')
    c.add("</g>")
    c.add(f'<g filter="{c.shadow("ob-dsh", 0, 6, 8, "#000", 0.6)}">'
          + musgum_dome(c, 34, 790, 170, 590, ("#F0B07A", "#B4693A", "#4E2412"), 1, True, 1, 15)
          + musgum_dome(c, 506, 790, 170, 590, ("#F0B07A", "#B4693A", "#4E2412"), 2, True, -1, 15) + "</g>")
    inner_shadow(c, win, 24, 0.8)
    gold_line(c, win, 3, "redgold")
    c.add(gold_dust(0, 0, 540, 960, 120, 77, "#FFE6B0", 1.4))
    crest(c, 270, 136, 0.9, METAL, division=None)
    mee_meo(c, "pied", "mee-danse", "meo-yo")
    plate(c, "Orateur", None, y=786, style="banco", title_size=42)
    finish(c, "orateur-b", "orateur", None, "B", "L'Écho des cases-obus",
           "La photo s'ouvre dans la voûte d'une case-obus musgum (nord du Cameroun) : une coque d'argile en chaînette, montée à la "
           "main sans un morceau de bois, hérissée de côtes en V qui servent d'échelle ; à l'aube, la voix du chef y résonne et "
           "ses ondes d'or montent au-dessus du village.",
           "pied : Mee (danse) et Meo (yo) au pied des cases", None)


def ora_c():
    """C — La Lumière de Lalibela."""
    c = start("oc", top="#3A2018", bottom="#120806", rim="#FFC8A0")
    win = (90, 284, 450, 728, 6)
    m = window(c, "oc-win", *win)
    rock = c.grad("oc-rock", [(0, "#E08A5E"), (0.35, "#B4583A"), (0.75, "#7A3020"), (1, "#3A140A")], 0, 0, 0.6, 1)
    c.add(f'<g mask="{m}"><g filter="{grain(c, "oc-gr", 0.55, (0.25, 0.08, 0.04), 1.6, -0.6, seed=4, octaves=3)}">'
          f'<rect width="540" height="960" fill="{rock}"/></g>')
    rnd = random.Random(3)
    gouges = "".join(f'<path d="M{f(x)} {f(y)} l{f(rnd.uniform(-2, 2))} {f(rnd.uniform(10, 22))}" stroke="#3A140A" stroke-width="1.2" opacity="0.35"/>'
                     for x, y in ((rnd.uniform(0, 540), rnd.uniform(0, 960)) for _ in range(260)))
    c.add(gouges)
    for y in (290, 410, 530, 650, 770, 890):
        c.add(f'<path d="M0 {y} L540 {y}" stroke="#2A0E06" stroke-width="3" opacity="0.35"/><path d="M0 {y + 2} L540 {y + 2}" stroke="#FFC8A0" stroke-width="1" opacity="0.3"/>')
    c.add(f'<rect width="540" height="960" fill="{c.rgrad("oc-vig", [(0.35, "#000000", 0), (1, "#1A0602", 0.7)], 0.3, 0.2, 0.95)}"/>')
    for x, y, k in ((40, 340, "cross"), (40, 500, "arc"), (40, 650, "cross"), (500, 340, "arc"), (500, 500, "cross"), (500, 650, "arc")):
        c.add(aksum_window(c, x, y, 26, 54, k, ("#E8A884", "#A85A3C", "#4A1A0C"), 6))
    c.add("</g>")
    n0 = len(c.body)
    halo(c, "oc-sky", 270, 150, 280, 170, "#FFD8A0", 0.55)
    c.add(waves(270, 150, 124, 20, 6, "#FFE6B0", 1.4, 0.75))
    c.add(rays(270, 150, 112, 230, 36, "#FFE6B0", 1.2, -180, 180, 0.8).replace("<line", '<line opacity="0.35"'))
    wrap_since(c, n0, None) if False else None
    seg = "".join(c.body[n0:])
    del c.body[n0:]
    c.add(f'<g mask="{m}">{seg}</g>')
    c.add(f'<rect x="156" y="34" width="228" height="228" rx="10" fill="#000000" opacity="0.5" filter="{soft(c, 10)}"/>')
    c.add(lalibela_cross(c, 270, 146, 1.06, ("#FFD0A8", "#D07850", "#5A2416")))
    beams = []
    for x0, wdt, op in ((-80, 80, 0.5), (40, 46, 0.38), (130, 100, 0.45), (290, 56, 0.32), (380, 30, 0.28)):
        beams.append(f'<path d="M{x0} -20 L{x0 + wdt} -20 L{x0 + wdt + 420} 980 L{x0 + 420} 980Z" fill="{lgrad(c, f"oc-b{x0}", [(0, "#FFF2D0", op), (1, "#FFE0A0", 0)])}"/>')
    c.add(f'<g mask="{m}"><g filter="{soft(c, 5)}" style="mix-blend-mode:screen">{"".join(beams)}</g></g>')
    rnd2 = random.Random(9)
    motes = "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd2.uniform(0.5, 1.6))}" fill="#FFF2D0" opacity="{f(rnd2.uniform(0.3, 0.9))}"/>'
                    for x, y in ((rnd2.uniform(0, 540), rnd2.uniform(0, 960)) for _ in range(160)) if not (90 < x < 450 and 268 < y < 724))
    c.add(motes)
    x0, y0, x1, y1, r = win
    fr = c.grad("oc-fr", [(0, "#E8A884"), (0.5, "#A85A3C"), (1, "#5A2416")], 0, 0, 1, 1)
    outer = window_path(x0 - 18, y0 - 18, x1 + 18, y1 + 18, 4)
    wp = window_path(*win)
    c.add(f'<path d="{outer} {wp}" fill="{fr}" fill-rule="evenodd" filter="{c.shadow("oc-fs", 0, 4, 5, "#000", 0.6)}"/>')
    heads = []
    for yy in range(int(y0 + 24), int(y1 - 10), 58):
        for xx in (x0 - 18 - 6, x1 + 18 - 6):
            heads.append(f'<rect x="{xx}" y="{yy}" width="12" height="12" fill="#D9906C" stroke="#4A1A0C" stroke-width="1"/><rect x="{xx}" y="{yy}" width="12" height="3" fill="#FFD0B0" opacity="0.6"/>')
    for xx in range(int(x0 + 20), int(x1 - 10), 58):
        for yy in (y0 - 18 - 6, y1 + 18 - 6):
            heads.append(f'<rect x="{xx}" y="{yy}" width="12" height="12" fill="#D9906C" stroke="#4A1A0C" stroke-width="1"/><rect x="{xx}" y="{yy}" width="12" height="3" fill="#FFD0B0" opacity="0.6"/>')
    c.add("".join(heads))
    inner_shadow(c, wp, 22, 0.85)
    gold_line(c, wp, 2.2, "redgold")
    crest(c, 270, 146, 0.66, METAL, division=None)
    plate(c, "Orateur", "Pour toi, maman", y=776, style="ebene", accent="#F6C77A", title_size=40)
    duo(c, "ruban", "mee-amoureuse", "meo-serenade")
    finish(c, "orateur-c", "orateur", None, "C", "La Lumière de Lalibela",
           "Au-dessus de la photo, l'église Saint-Georges de Lalibela vue du ciel : trois croix emboîtées taillées d'un seul bloc de "
           "tuf rouge au fond de leur puits ; autour, la tranchée de roc, ses fenêtres axoumites et leurs « têtes de singe », et les "
           "rais du matin où monte le chant.",
           "ruban : Mee (amoureuse) et Meo (sérénade) au bord de l'inscription", "Pour toi, maman")


ALL = [ora_a, ora_b, ora_c]
