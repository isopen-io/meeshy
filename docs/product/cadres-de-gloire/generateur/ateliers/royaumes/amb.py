"""Ambassadeur : cinq constructions africaines, de la cour peinte de Tiébélé au palais du Tabouret d'or.
Le rang où l'on choisit son atmosphère : chaque division est un autre royaume, et la richesse monte de V à I."""

from kit import *  # noqa: F401,F403
from archi import *  # noqa: F401,F403

GEM = CORAL


def amb5():
    """V — La Cour peinte de Tiébélé (Kassena, Burkina Faso)."""
    c = start("a5", top="#40281A", bottom="#140A06", rim="#FFC27A")
    win = (66, 252, 474, 730, 30)
    m = window(c, "a5-win", *win)
    sky = c.grad("a5-sky", [(0, "#2A1636"), (0.55, "#B4553A"), (1, "#F2A65A")])
    c.add(f'<rect width="540" height="100" fill="{sky}"/>')
    halo(c, "a5-sun", 270, 96, 220, 70, "#FFD08A", 0.6)
    pal = KASSENA
    bands = []
    seq = ["rule", "saw", "rule", "plain", "loz", "rule", "ladder", "plain", "check", "rule", "calabash", "rule", "plain",
           "saw", "rule", "loz", "plain", "dots", "rule", "ladder", "check", "plain", "calabash", "rule", "saw", "rule",
           "plain", "loz", "rule", "check", "plain", "ladder", "rule", "saw", "rule", "plain", "calabash", "rule", "dots",
           "loz", "rule", "plain", "saw", "rule", "check", "plain", "ladder", "rule", "loz"]
    heights = {"rule": 6, "saw": 24, "plain": 30, "loz": 26, "ladder": 22, "check": 14, "calabash": 26, "dots": 12}
    y = 82
    for i, k in enumerate(seq):
        h = heights[k]
        if k == "plain":
            bands.append(f'<rect x="0" y="{y}" width="540" height="{h}" fill="{pal["red"] if i % 2 else pal["red2"]}"/>')
        else:
            bands.append(f'<rect x="0" y="{y}" width="540" height="{h}" fill="{pal["red"]}"/>' + tiebele_band(-10, 550, y, h, k, seed=i))
        y += h
        if y > 960:
            break
    top_edge = ("M0 960 L0 92 C18 92 22 80 34 80 C48 80 50 90 70 90 L196 90 C210 90 212 84 226 84 L314 84 C328 84 330 90 344 90 "
                "L470 90 C490 90 492 80 506 80 C518 80 522 92 540 92 L540 960Z")
    c.def_once("a5-wall", f'<clipPath id="{c.id("a5-wall")}"><path d="{top_edge}"/></clipPath>')
    c.add(f'<g clip-path="url(#{c.id("a5-wall")})" mask="{m}"><g filter="{grain(c, "a5-grain", 0.8, (0.2, 0.08, 0.04), 1.5, -0.75)}">{"".join(bands)}</g>'
          f'<rect width="540" height="960" fill="{lgrad(c, "a5-rake", [(0, "#FFC070", 0.28), (0.5, "#FFC070", 0), (1, "#000000", 0.35)], 0, 0, 1, 1)}"/></g>')
    c.add(f'<path d="M0 92 C18 92 22 80 34 80 C48 80 50 90 70 90 L196 90 C210 90 212 84 226 84 L314 84 C328 84 330 90 344 90 L470 90 C490 90 492 80 506 80 C518 80 522 92 540 92" fill="none" stroke="{pal["white"]}" stroke-width="3"/>')
    c.add(f'<rect x="174" y="98" width="192" height="146" rx="10" fill="{pal["black"]}" stroke="{pal["white"]}" stroke-width="3"/>')
    c.add(f'<rect x="182" y="106" width="176" height="130" rx="6" fill="none" stroke="{pal["white"]}" stroke-width="1" stroke-dasharray="2 4"/>')
    halo(c, "a5-ch", 270, 160, 90, 70, "#FFB060", 0.25)
    x0, y0, x1, y1, r = win
    fr = window_path(x0 - 16, y0 - 16, x1 + 16, y1 + 16, r + 14)
    wp = window_path(*win)
    c.add(f'<path d="{fr} {wp}" fill="{pal["black"]}" fill-rule="evenodd" filter="{c.shadow("a5-fs", 0, 3, 4, "#000", 0.6)}"/>')
    pts = rrect_points(x0 - 9, y0 - 9, x1 + 9, y1 + 9, r + 7, 13)
    tri = []
    for i, (px, py, a) in enumerate(pts):
        tri.append(grp(f'<path d="M-5 3.5 L0 -4 L5 3.5Z" fill="{pal["white"]}"/>', px, py, 1, a))
    c.add("".join(tri))
    c.add(f'<path d="{fr}" fill="none" stroke="{pal["white"]}" stroke-width="2.4"/>')
    inner_shadow(c, wp, 22, 0.8)
    gold_line(c, wp, 2.6)
    c.add(gold_dust(0, 0, 540, 100, 30, 55, "#FFE7A0", 1.2, False))
    crest(c, 270, 158, 0.86, "gold", division=5, gem=GEM)
    mee_meo(c, "pied", "mee-sourire", "meo-salut")
    plate(c, "Ambassadeur V", None, y=780, style="kassena")
    finish(c, "ambassadeur-5", "ambassadeur", 5, "V", "La Cour peinte de Tiébélé",
           "La photo s'ouvre comme la porte d'une case de la cour royale de Tiébélé, au pays kassena (Burkina Faso) : sur l'enduit "
           "de latérite, les femmes peignent chaque saison sèche des registres de triangles, de losanges, d'échelles et de calebasses "
           "brisées, en noir de suie et en blanc de kaolin.",
           "pied : Mee (sourire) et Meo (salut) au seuil de la case", None)


def amb4():
    """IV — L'Enceinte du Grand Zimbabwe."""
    c = start("a4", top="#3E2C1F", bottom="#120C08")
    sky = c.grad("a4-sky", [(0, "#160E2A"), (0.4, "#5A2A40"), (0.75, "#C2542C"), (1, "#F6A84A")])
    c.add(f'<rect x="0" y="0" width="540" height="230" fill="{sky}"/>')
    c.def_once("a4-skyc", f'<clipPath id="{c.id("a4-skyc")}"><rect width="540" height="230"/></clipPath>')
    n0 = len(c.body)
    halo(c, "a4-sun", 270, 214, 300, 120, "#FFC867", 0.7)
    wrap_clip(c, n0, f'url(#{c.id("a4-skyc")})')
    c.add(f'<circle cx="270" cy="206" r="58" fill="#FFE0A0" opacity="0.6" filter="{soft(c, 10)}"/>')
    for i, (yy, x0, x1, op) in enumerate(((58, -20, 260, 0.35), (84, 300, 560, 0.3), (120, 40, 200, 0.25), (140, 360, 520, 0.28))):
        c.add(f'<path d="M{x0} {yy} Q{(x0 + x1) / 2} {yy - 10} {x1} {yy} Q{(x0 + x1) / 2} {yy + 6} {x0} {yy}Z" fill="#FFB27A" opacity="{op}" filter="{soft(c, 2)}"/>')
    c.add(stars(c, 41, 40, (0, 0, 540, 70), "#FFE7C8", 1.1, False) or "")
    hill = "M0 206 L0 176 C40 168 70 150 110 156 C140 146 170 160 190 176 L190 206Z"
    c.add(f'<path d="{hill}" fill="#3A2028"/>')
    c.add(boulders(c, 92, 170, 0.62, ("#5A3E44", "#3A2630", "#1E1218"), 4))
    c.add(grp(conical_tower(c, 0, 0, 1, ("#7A5A4A", "#5A4036", "#2E1E1A"), "#24160F"), 446, 214, 0.86))
    c.add(aloe(372, 214, 0.9, "#4E6A3A", "#22301A", "#FF7A2A", 2, 3), aloe(176, 216, 0.8, "#4E6A3A", "#22301A", "#FF8A3A", 1, 7))
    stones = ("#9C8C7A", "#82766A", "#AE9A84", "#8E7E6C")
    gold_band = "#E8B53C"
    wall_top = "M0 214 Q270 196 540 214 L540 960 L0 960Z"
    c.def_once("a4-wt", f'<clipPath id="{c.id("a4-wt")}"><path d="{wall_top}"/></clipPath>')
    walls = [stone_wall(c, 0, 196, 540, 764, 3, stones, "#2A221C", chevrons=(26, 210, 400), gold=gold_band, course=14, bw=(22, 50))]
    wm = window(c, "a4-win", 64, 252, 476, 730, 14)
    rw = relief(c, "a4-rel", light="#FFE2B0", scale=2.2, blur=0.9, spec=0.6, exp=26, el=40, drop=0.0)
    c.add(f'<g clip-path="url(#{c.id("a4-wt")})" mask="{wm}"><g filter="{rw}"><g filter="{grain(c, "a4-grain", 0.9, (0.1, 0.06, 0.03), 1.2, -0.7)}">{"".join(walls)}</g></g>'
          f'<rect x="0" y="190" width="540" height="770" fill="{lgrad(c, "a4-light", [(0, "#FFA050", 0.45), (0.3, "#FF9040", 0.08), (0.75, "#000000", 0.3), (1, "#000000", 0.6)])}"/>'
          f'<rect x="0" y="190" width="540" height="770" fill="{lgrad(c, "a4-rk", [(0, "#FFB060", 0.25), (0.4, "#000000", 0), (1, "#000000", 0.4)], 0, 0, 1, 0)}"/></g>')
    c.add(f'<path d="M0 214 Q270 196 540 214" fill="none" stroke="#FFD58A" stroke-width="2.4"/>')
    wp = window_path(64, 252, 476, 730, 14)
    for xx, flip in ((64, 1), (476, -1)):
        c.add(f'<rect x="{xx - (14 if flip > 0 else 0)}" y="252" width="14" height="478" fill="{lgrad(c, f"a4-bull{flip}", [(0, "#000000", 0.0 if flip > 0 else 0.5), (1, "#000000", 0.5 if flip > 0 else 0.0)], 0, 0, 1, 0)}"/>')
    inner_shadow(c, wp, 28, 0.85)
    gold_line(c, wp, 3)
    stone = ("#8E9A7E", "#55604A", "#262C1E")
    c.add(zimbabwe_bird(c, 40, 198, 0.92, False, stone, "#F2C76A", column=6))
    c.add(zimbabwe_bird(c, 500, 198, 0.92, True, stone, "#F2C76A", column=6))
    c.add("".join(f'<path d="M{x} {y} l5 -2.6 l5 2.6" fill="none" stroke="#2A1408" stroke-width="1.5" opacity="0.7"/>' for x, y in ((150, 100), (166, 90), (360, 110), (378, 102))))
    crest(c, 270, 150, 0.94, "gold", division=4, gem=GEM)
    mee_meo(c, "pied", "mee-sourire", "meo-cool")
    plate(c, "Ambassadeur IV", "Bâtis pour durer", y=774, style="pierre")
    finish(c, "ambassadeur-4", "ambassadeur", 4, "IV", "L'Enceinte du Grand Zimbabwe",
           "La photo passe l'étroit passage de la Grande Enceinte du Grand Zimbabwe : granit posé sans mortier, frises à chevrons "
           "dorées, la tour conique pleine derrière le mur, le kopje et ses blocs en équilibre, des aloès en fleur sur la crête, "
           "et deux oiseaux de stéatite qui veillent au couchant.",
           "pied : Mee (sourire) et Meo (cool) au pied du mur", "Bâtis pour durer")


def amb3():
    """III — Les Tourelles du palais d'Edo."""
    c = start("a3", top="#3A2616", bottom="#100A06")
    rf = relief(c, "a3-rel", scale=2.6, el=36)
    sky = c.grad("a3-sky", [(0, "#1E0E10"), (0.6, "#6A2A1A"), (1, "#C25A2A")])
    c.add(f'<rect width="540" height="250" fill="{sky}"/>')
    halo(c, "a3-sun", 270, 200, 300, 150, "#FFB060", 0.7)
    c.add(stars(c, 31, 30, (0, 0, 540, 90), "#FFE7C8", 1.0, False) or "")
    roof = c.grad("a3-roof", [(0, "#6A3A1E"), (1, "#2A140A")])
    c.add(f'<path d="M0 250 L0 196 L70 178 L470 178 L540 196 L540 250Z" fill="{roof}"/>')
    c.add("".join(f'<path d="M0 {y} L540 {y}" stroke="#1A0A04" stroke-width="1" opacity="0.6" stroke-dasharray="7 2"/>' for y in range(186, 250, 7)))
    c.add(grp(benin_turret(c, 0, 0, 1.0, 196, 92, side=1), 70, 250, 1, filt=rf))
    c.add(grp(benin_turret(c, 0, 0, 1.0, 196, 92, side=-1), 470, 250, 1, filt=rf))
    deep = c.grad("a3-deep", [(0, "#24150B"), (1, "#0C0704")])
    m = window(c, "a3-win", 88, 252, 452, 728, 6)
    tones = ("#D9A066", "#9A602E", "#5E3518")
    c.add(f'<rect x="0" y="248" width="540" height="712" fill="{deep}" mask="{m}"/>')
    c.add(f'<rect x="0" y="248" width="540" height="712" fill="{leaf_pattern(c, "a3-leaf", "#6E4422", None, 22, 0.35)}" mask="{m}"/>')
    cl = cowrie(c, -9, -10, 0.85, -20) + cowrie(c, 9, -10, 0.85, 20) + cowrie(c, 0, 14, 0.85, 0)
    inner = [mudfish(c, 0, 0, 0.5, -90, False, tones), rosette(0, 0, 1.15, tones[0], "#3B220E", tones[1]), manilla(c, 0, 0, 1.25, 0, "copper"),
             cl, eben(c, 0, 0, 0.42), mudfish(c, 0, 0, 0.5, -90, True, tones)]
    for i, y0 in enumerate((254, 412, 570)):
        for j, (x0, flip) in enumerate(((14, False), (456, True))):
            motif = inner[(i * 2 + j) % 6]
            c.add(grp(benin_plaque(c, x0, y0, 70, 152, grp(motif, x0 + 35, y0 + 76)), filt=rf))
    bottom = benin_plaque(c, 14, 732, 512, 214, "", tones)
    c.add(grp(bottom, filt=rf))
    c.add(grp(mudfish(c, -48, 0, 0.62, 0, False, tones) + mudfish(c, 48, 0, 0.62, 0, True, tones), 270, 920, 1, filt=rf))
    wp = window_path(88, 252, 452, 728, 6)
    inner_shadow(c, wp, 22, 0.8)
    gold_line(c, wp, 2.4, "bronze")
    halo(c, "a3-halo", 270, 140, 120, 100, "#FFD08A", 0.4)
    c.add(grp(leopard_body(c, 0, 0, 1.0, False, ("#F0C890", "#B47A3E", "#5A3216")), 162, 150, 1, filt=rf),
          grp(leopard_body(c, 0, 0, 1.0, True, ("#F0C890", "#B47A3E", "#5A3216")), 378, 150, 1, filt=rf))
    crest(c, 270, 136, 0.92, "gold", division=3, gem=GEM)
    plate(c, "Ambassadeur III", None, y=772, style="bronze", w=372, title_size=36)
    duo(c, "ruban", "mee-wow", "meo-bravo")
    finish(c, "ambassadeur-3", "ambassadeur", 3, "III", "Les Tourelles du palais d'Edo",
           "Le palais de l'Oba du Bénin tel que le montrent ses plaques : deux tourelles à bardeaux coiffées d'oiseaux de bronze, "
           "un python de bronze qui descend chacune la tête la première ; en contrebas, les piliers plaqués de bronze — léopards "
           "royaux, silures d'Olokun, rosettes, manilles, cauris et épée eben.",
           "ruban : Mee (wow) et Meo (bravo) au bord de la plaque", None)


def amb2():
    """II — Djenné, la ville de banco."""
    c = start("a2", top="#4A2A18", bottom="#140A05", rim="#FFB066")
    sky = c.grad("a2-sky", [(0, "#1E0E2A"), (0.3, "#5E2440"), (0.62, "#C2542C"), (1, "#F6B050")])
    c.add(f'<rect x="0" y="0" width="540" height="262" fill="{sky}"/>')
    halo(c, "a2-sun-h", 270, 196, 280, 180, "#FFD27A", 0.7)
    c.add(rays(270, 196, 80, 320, 41, "#FFE2A0", 2.0, -88, 88, 0.7).replace("<line", '<line opacity="0.2"'))
    c.add(f'<circle cx="270" cy="196" r="68" fill="#FFE2A0" opacity="0.9" filter="{soft(c, 6)}"/>')
    c.add("".join(f'<path d="M{f(x)} {f(y)} q4 -4 8 0 q4 -4 8 0" fill="none" stroke="#2A0E14" stroke-width="1.5" opacity="0.75"/>'
                  for x, y in ((104, 62), (126, 48), (148, 58), (400, 70), (424, 58), (446, 76))))
    c.add(f'<g filter="{grain(c, "a2-gh", 0.75, (0.25, 0.12, 0.05), 1.2, -0.7)}">'
          + djenne_house(c, 52, 262, 92, 104, ("#C8834A", "#9A5A30", "#5E3018"), 2)
          + djenne_house(c, 488, 262, 92, 96, ("#C8834A", "#9A5A30", "#5E3018"), 5) + "</g>")
    c.add(f'<g filter="{grain(c, "a2-grain", 0.75, (0.25, 0.12, 0.05), 1.2, -0.7)}">'
          + djenne(c, 270, 262, 1.14, ("#D48E52", "#A9643A", "#6A3818")) + "</g>")
    base = c.grad("a2-base", [(0, "#B5733C"), (1, "#5A3018")])
    m2 = window(c, "a2-win", 70, 272, 470, 728, 6)
    side = [f'<rect x="0" y="250" width="540" height="710" fill="{base}"/>']
    c.add(f'<g mask="{m2}"><g filter="{grain(c, "a2-grain2", 0.7, (0.25, 0.12, 0.05), 1.3, -0.72, seed=9)}">{"".join(side)}'
          + toron_buttress(c, 30, 252, 960, 50, ("#D29050", "#A9643A", "#6A3818"), 1, 3)
          + toron_buttress(c, 510, 252, 960, 50, ("#D29050", "#A9643A", "#6A3818"), -1, 4) + "</g>"
          + f'<rect x="0" y="250" width="540" height="710" fill="{lgrad(c, "a2-glow", [(0, "#FFB25A", 0.45), (0.3, "#FF9040", 0.06), (1, "#000000", 0.5)])}"/></g>')
    wp = window_path(70, 272, 470, 728, 6)
    frame = c.grad("a2-frame", [(0, "#6A3C1E"), (0.5, "#3E200E"), (1, "#2A140A")], 0, 0, 1, 1)
    c.add(f'<path d="{window_path(58, 260, 482, 740, 10)} {wp}" fill="{frame}" fill-rule="evenodd" filter="{c.shadow("a2-fr", 0, 3, 5, "#000", 0.65)}"/>')
    c.add(f'<path d="{window_path(62, 264, 478, 736, 8)}" fill="none" stroke="#C99258" stroke-width="1.2" opacity="0.8"/>')
    studs = rrect_points(63, 265, 477, 735, 8, 15)
    c.add(beads_on_path([(x, y) for x, y, _ in studs], "#F2C76A", 2.1))
    c.add(beads_on_path([(x - 0.6, y - 0.6) for x, y, _ in studs], "#FFF4C2", 0.8))
    inner_shadow(c, wp, 22, 0.85)
    c.add(gold_dust(0, 0, 540, 262, 70, 22, "#FFE7A0", 1.3, False))
    crest(c, 270, 150, 0.94, "gold", division=2, gem=GEM)
    yb = plate(c, "Ambassadeur II", "Le voyage continue", y=772, style="banco")
    duo(c, "ruban", "mee-lettre", "meo-serenade")
    for i in range(26):
        x = 64 + i * 16.5
        c.add(f'<circle cx="{f(x)}" cy="{yb + 12}" r="2.2" fill="#E8B53C"/><circle cx="{f(x - 0.6)}" cy="{yb + 11.4}" r="0.8" fill="#FFF4C2"/>')
    finish(c, "ambassadeur-2", "ambassadeur", 2, "II", "Djenné, la ville de banco",
           "La Grande Mosquée de Djenné se dresse au-dessus de la photo dans un couchant de cuivre, entre deux maisons à façade "
           "toucouleur ; les contreforts de banco hérissés de torons, où l'on grimpe chaque année pour le crépissage, "
           "encadrent une porte cloutée de laiton.",
           "ruban : Mee (lettre) et Meo (sérénade) sur le mur de banco", "Le voyage continue")


def palm_silhouette(color="#3A1620"):
    """Un rônier (palmier Borassus) en contre-jour : tronc renflé, éventail de palmes."""
    fronds = "".join(
        f'<path d="M0 -118 Q{f(pt(0, -118, 26, a)[0])} {f(pt(0, -118, 26, a)[1] - 6)} {f(pt(0, -118, 44, a + 8)[0])} {f(pt(0, -118, 44, a + 8)[1])}" fill="none" stroke="{color}" stroke-width="4" stroke-linecap="round"/>'
        for a in range(-120, 130, 20))
    return f'<path d="M-4 0 C-6 -40 -2 -80 -3 -118 L3 -118 C2 -80 6 -40 4 0Z" fill="{color}"/>{fronds}<circle cx="0" cy="-116" r="7" fill="{color}"/>'


def amb1():
    """I — Le Palais du Tabouret d'or."""
    c = start("a1", top="#4A2C1A", bottom="#140906", rim="#FFC27A")
    m = window(c, "a1-win", 58, 252, 482, 726, 18, arch="round")
    wall = c.rgrad("a1-wall", [(0, "#8A2A1C", 1), (0.6, "#5A160E", 1), (1, "#2A0806", 1)], 0.5, 0.42, 0.75)
    c.add(f'<rect width="540" height="960" fill="{wall}" mask="{m}"/>')
    c.def_once("a1-tile", f'<pattern id="{c.id("a1-tile")}" width="60" height="62" patternUnits="userSpaceOnUse">{asante_relief_tile(1, "#C4553A")}</pattern>')
    rf = relief(c, "a1-rel", light="#FFD8B0", scale=2.4, blur=1.0, spec=0.5, exp=20, el=42, drop=0.35, dy=2, sd=1.5)
    c.add(f'<g mask="{m}"><g filter="{rf}"><rect x="0" y="40" width="540" height="920" fill="url(#{c.id("a1-tile")})" opacity="0.9"/></g></g>')
    c.add(f'<rect width="540" height="960" fill="{c.rgrad("a1-vig", [(0.4, "#000000", 0), (1, "#000000", 0.6)], 0.5, 0.45, 0.75)}" mask="{m}"/>')
    c.add(thatch(c, -10, 550, 46, 46, ("#D8B068", "#9A743A", "#4A3418"), 8))
    k = kente(0, 0, 720, 30, 4)
    kshade = lgrad(c, "a1-kshade", [(0, "#000000", 0.5), (0.45, "#000000", 0), (1, "#000000", 0.55)], 0, 0, 1, 0)
    for x0 in (16, 494):
        c.add(f'<g transform="translate({x0 + 30} 238) rotate(90)">{k}</g>')
        c.add(f'<rect x="{x0}" y="238" width="30" height="722" fill="{kshade}"/>')
        c.add(f'<rect x="{x0 - 3}" y="232" width="36" height="8" rx="2" fill="{c.metal("gold")[0]}" stroke="#7A4A0E" stroke-width="1"/>')
    c.add(parasol(c, 84, 200, 0.98, ("#7A1418", "#E8B53C", "#14100C"), "sankofa", 420, 12))
    c.add(parasol(c, 456, 200, 0.98, ("#14100C", "#E8B53C", "#7A1418"), "egg", 420, -12))
    border(c, 8, "#8A5A12", 5, 26)
    border(c, 8, c.metal("gold")[0], 3, 26)
    wp = window_path(58, 252, 482, 726, 18, arch="round")
    inner_shadow(c, wp, 26, 0.85)
    gold_line(c, wp, 4)
    pts = rrect_points(58, 252, 482, 726, 18, 9)
    c.add(beads_on_path([(x, y) for x, y, _ in pts if y > 470], "#FFE08A", 1.5, 0.9))
    halo(c, "a1-halo", 270, 148, 180, 140, "#FFD27A", 0.55)
    c.add(f'<g opacity="0.85">{adinkrahene(270, 148, 3.4, "#F5C94F", 1.2)}</g>')
    c.add(rays(270, 148, 104, 156, 25, "#FFE08A", 1.4, -80, 80, 0.75))
    c.add(gold_dust(20, 60, 520, 940, 170, 61, "#FFE08A", 1.6))
    crest(c, 270, 148, 0.95, "gold", division=1, gem=GEM)
    c.add(f'<g filter="{c.shadow("cloth", 0, 3, 3, "#000", 0.6)}"><path d="M176 730 L364 730 L384 752 L156 752Z" fill="#1A120C"/>{kente(160, 732, 220, 18, 9)}</g>')
    c.add(golden_stool(c, 270, 680, 0.6))
    c.add(sparkle(186, 640, 9, "#FFF4C2", 0.9), sparkle(356, 634, 8, "#FFF4C2", 0.85), sparkle(214, 612, 5, "#FFF4C2", 0.8), sparkle(330, 606, 5, "#FFF4C2", 0.8))
    mee_meo(c, "pied", "mee-fete", "meo-roi")
    yb = plate(c, "Ambassadeur I", "Merci la famille", y=778, style="or")
    c.add(f'<g filter="{c.shadow("k-sh", 0, 2, 2, "#000", 0.6)}">{kente(120, yb + 6, 300, 14, 7)}</g>')
    finish(c, "ambassadeur-1", "ambassadeur", 1, "I", "Le Palais du Tabouret d'or",
           "La cour d'un palais asante : toit de chaume, murs d'argile rouge aux arabesques en relief comme ceux des temples de "
           "Besease, piliers drapés de kente, parasols royaux kyinie aux pommeaux d'or ; au pied de la photo, posé sur son étoffe "
           "car il ne touche jamais le sol, le Sika Dwa Kofi, le tabouret d'or.",
           "pied : Mee (fête) et Meo (roi) de part et d'autre du tabouret d'or", "Merci la famille")


ALL = [amb5, amb4, amb3, amb2, amb1]
