"""Afrique éternelle · Savane - AMBASSADEUR V → I : la savane et ce que l'Afrique y a bâti (métal or)."""

from common import *  # noqa: F401,F403
from motifs import _taper  # noqa: F401


def aloe(x, gy, h, color, flower="#E8502A", seed=1, glow=None):
    """Aloès en candélabre (Aloe marlothii) : tige vêtue de feuilles sèches, rosette charnue, hampes de fleurs."""
    rnd = random.Random(seed)
    top = gy - h * 0.52
    out = [_taper(x, gy, x + rnd.uniform(-3, 3), top, h * 0.09, h * 0.07, color)]
    for i in range(7):
        y = gy - h * 0.08 - i * h * 0.06
        for s_ in (-1, 1):
            x2, y2 = pt(x, y, h * 0.1, s_ * (150 - i * 4))
            out.append(f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{color}" stroke-width="{f(h * 0.025)}" stroke-linecap="round"/>')
    for i in range(11):
        a = -125 + i * 25 + rnd.uniform(-6, 6)
        ln = h * rnd.uniform(0.28, 0.36)
        x1, y1 = pt(x, top, ln * 0.6, a)
        x2, y2 = pt(x1, y1, ln * 0.5, a + (40 if a > 0 else -40))
        a0 = math.radians(a)
        w = h * 0.04
        nx, ny = math.cos(a0) * w, math.sin(a0) * w
        out.append(f'<path d="M{f(x - nx)} {f(top - ny)} Q{f(x1)} {f(y1)} {f(x2)} {f(y2)} Q{f(x1 + nx * 0.4)} {f(y1 + ny * 0.4 + w)} {f(x + nx)} {f(top + ny)} Z" fill="{color}"/>')
    for k in range(rnd.choice((3, 4, 5))):
        a = -40 + k * 80 / 3 + rnd.uniform(-8, 8)
        bx, by = pt(x, top - h * 0.04, h * 0.2, a)
        cx_, cy_ = pt(bx, by, h * 0.16, a * 0.3)
        out.append(f'<path d="M{f(x)} {f(top)} Q{f(bx)} {f(by)} {f(cx_)} {f(cy_)}" fill="none" stroke="{color}" stroke-width="{f(h * 0.018)}"/>')
        if glow:
            out.append(f'<ellipse cx="{f(cx_)}" cy="{f(cy_ - h * 0.07)}" rx="{f(h * 0.05)}" ry="{f(h * 0.12)}" fill="{glow}" opacity="0.45"/>')
        out.append(f'<path d="M{f(cx_ - h * 0.022)} {f(cy_)} Q{f(cx_ - h * 0.03)} {f(cy_ - h * 0.1)} {f(cx_)} {f(cy_ - h * 0.17)} Q{f(cx_ + h * 0.03)} {f(cy_ - h * 0.1)} {f(cx_ + h * 0.022)} {f(cy_)} Z" fill="{flower}"/>')
    return "".join(out)


# =============================================================== V

def amb5():
    c = Card("a5")
    photo(c, "#4A2C1A", "#140A06", "#FFC27A", glow=0.24)
    win = rrect(62, 262, 478, 740, 18)
    m = deco_mask(c, win)
    hz = 262
    sky = c.grad("sky", [(0, "#1C0D2C"), (0.08, "#4E1A3A"), (0.16, "#A8352E"), (0.22, "#EE7A32"), (0.27, "#FFC066"),
                         (0.274, "#5A2A10"), (0.4, "#2E1409"), (0.7, "#1A0A04"), (1, "#0E0603")])
    d = [f'<rect width="{W}" height="{H}" fill="{sky}"/>']
    d.append(noise_layer(c, "clouds", (0, 30, 540, 170), "0.005 0.035", 4, 11, 2.8, -1.25,
                         c.grad("cl", [(0, "#FF8C6A"), (0.6, "#FFB070"), (1, "#FFD28A")])))
    d.append(light_rays(c, "rays", 270, hz - 10, 26, 320, "#FFD890", -88, 88, 4, 0.34))
    d.append(sun(c, "sun", 270, hz - 10, 96, haze=False))
    far = "M-10 {0} L-10 {1} Q60 {2} 130 {3} Q200 {4} 270 {5} Q340 {4} 410 {3} Q480 {2} 550 {1} L550 {0} Z".format(
        hz + 4, hz - 30, hz - 44, hz - 30, hz - 18, hz - 26)
    d.append(f'<path d="{far}" fill="#6A2A3A" opacity="0.55"/>')
    d.append(f'<path d="M-10 {hz + 4} L-10 {hz - 16} Q90 {hz - 30} 170 {hz - 18} Q270 {hz - 8} 370 {hz - 18} Q450 {hz - 30} 550 {hz - 16} L550 {hz + 4} Z" fill="#2A1006"/>')
    d.append(f'<ellipse cx="270" cy="{hz}" rx="420" ry="300" fill="{c.rgrad("spill", [(0, "#FF9A40", 0.4), (0.5, "#C05020", 0.12), (1, "#C05020", 0)])}"/>')
    hut = ("#E0A056", "#5E3214", "#1C0A04")
    rim = "#FFC27A"
    d.append(beehive_hut(c, "gh", 270, hz - 18, 46, 34, hut, lit=1, seed=2, rim=rim))
    back, front = kraal(270, hz - 9, 52, 6, "#1C0A04", seed=6, hmin=6, hmax=9)
    d.append(back)
    for x, fl in ((236, False), (262, False), (300, True)):
        d.append(place(nguni("#1C0A04"), x, hz - 7, 0.11, flip=fl))
    d.append(front)
    for x, gy, w, h, sd in ((190, hz - 8, 42, 32, 3), (122, hz - 2, 62, 47, 4), (40, hz + 4, 100, 78, 5)):
        d.append(beehive_hut(c, f"hl{x}", x, gy, w, h, hut, lit=1, seed=sd, rim=rim))
        d.append(beehive_hut(c, f"hr{x}", W - x, gy, w, h, hut, lit=-1, seed=sd + 10, rim=rim))
    d.append(grass(0, 540, hz + 6, 3, 10, SIL, seed=5, n=150, width=1.1, heads=0.1))
    d.append(flock(200, 120, 7, 70, 4, "#2A0E10", 0.45, 0.8))
    d.append(dust(5, 120, (0, 0, 540, 960), "#FFE2A0", 0.4, 1.4))
    masked(c, m, d)
    c.add(light_grade(c, win, "#FFB257", 0.5, 0.0, 0.3))
    c.add(inner_shadow(c, win))
    c.add(gold_rim(c, win, GOLD, 4))
    c.add(ilala_column(c, "ic1", 18, 56, 282, 728, lit=1))
    c.add(ilala_column(c, "ic2", 484, 522, 282, 728, lit=-1))
    c.add(f'<g filter="{earth(c, "lo-e", "0.03", 9, 1.4)}"><rect x="0" y="742" width="{W}" height="230" fill="{c.grad("lo", [(0, "#5A2A12"), (1, "#1A0904")])}"/></g>')
    c.add(f'<path d="M0 742 L540 742" stroke="#FFC27A" stroke-width="1.2" opacity="0.5"/>')
    c.add(grass(40, 500, 748, 8, 30, SIL, seed=12, n=200, width=1.8, heads=0.3))
    c.add(outer_frame(c, GOLD, 12, 3.5))
    gem_backing(c, 270, 112, 0.88)
    crest(c, 270, 112, 0.88, "gold", division=5, gem=CARNELIAN)
    birds(c, [("mee-coucou", 48, 146, 90, False, -6), ("meo-salut", 492, 146, 90, True, 6)])
    inscription(c, KICKER, "Ambassadeur V", y=784, style="ebene", metal=GOLD)
    save(c, "ambassadeur-5", "Ambassadeur", 5, "V", "Les Huttes en ruche du KwaZulu",
         "Au couchant, sur les collines du KwaZulu-Natal (Afrique du Sud), les huttes en ruche d'un umuzi zoulou se rangent en cercle autour de l'isibaya, l'enclos du bétail, la grande hutte face à l'entrée. "
         "Chaque iqhugwane est tissée comme un grand panier renversé - une armature de jeunes branches couverte de chaume, que retient un filet de cordes d'herbe - et les montants du cadre portent les losanges des paniers zoulous en palmier ilala.",
         "perchés sur les huttes (Mee coucou, Meo salut)", None)


# =============================================================== IV

def amb4():
    c = Card("a4")
    photo(c, "#4C2A18", "#160A06", "#FFB46A", glow=0.24)
    win = arch(90, 450, 410, 270, 736)
    m = deco_mask(c, win)
    hz = 334
    sky = c.grad("sky", [(0, "#2A0E33"), (0.12, "#7A2238"), (0.26, "#D6552C"), (0.33, "#FFB24F"), (0.346, "#FFD07A"), (0.348, "#2A1008"), (1, "#0E0503")])
    d = [f'<rect width="{W}" height="{H}" fill="{sky}"/>']
    d.append(noise_layer(c, "clouds", (0, 0, 540, 260), "0.006 0.03", 4, 21, 2.6, -1.2,
                         c.grad("cl", [(0, "#B04A6A"), (0.6, "#FF9A6A"), (1, "#FFC890")])))
    d.append(f'<ellipse cx="270" cy="{hz}" rx="330" ry="240" fill="{c.rgrad("glow", [(0, "#FFE0A0", 0.7), (0.5, "#FF9A50", 0.22), (1, "#FF9A50", 0)])}"/>')
    d.append(light_rays(c, "rays", 270, hz, 22, 360, "#FFE0A0", -80, 80, 4, 0.3))
    d.append(baobab(132, hz + 2, 92, SIL, seed=4))
    d.append(baobab(410, hz + 2, 78, SIL, seed=9))
    d.append(acacia(196, hz + 2, 30, SIL, seed=3, width=80))
    d.append(grass(0, 540, hz + 3, 3, 10, SIL, seed=2, n=180, width=1.1))
    d.append(flock(270, 214, 9, 120, 6, "#2A0E14", 0.45, 0.85, vshape=True))
    d.append(dust(7, 140, (0, 0, 540, 760), "#FFE2A0", 0.4, 1.6))
    masked(c, m, d)
    c.add(light_grade(c, win, "#FF9A4A", 0.5, 1.0, 0.3))
    c.add(inner_shadow(c, win))
    c.add(gold_rim(c, win, GOLD, 4))
    mat = ("#F6A46A", "#A04A22", "#2A0C04")
    wd = "M-10 990 L-10 760 Q60 748 140 752 Q270 744 400 752 Q480 748 550 760 L550 990 Z"
    c.add(f'<g filter="{earth(c, "wall-e", "0.03", 5, 1.6)}"><path d="{wd}" fill="{c.grad("wall", [(0, "#9A4A22"), (0.3, "#5A240E"), (1, "#1A0804")])}"/></g>')
    c.add(f'<path d="M-10 760 Q60 748 140 752 Q270 744 400 752 Q480 748 550 760" fill="none" stroke="#FFC890" stroke-width="2" opacity="0.7"/>')

    def cluster(sgn):
        lit = -sgn
        X = lambda v: v if sgn < 0 else W - v
        out_ = []
        bx, bw, btop = X(50), 96, 400
        out_.append(f'<ellipse cx="{f(bx)}" cy="772" rx="90" ry="14" fill="#000000" opacity="0.5" filter="{c.blur("tsh", 6)}"/>')
        out_.append(tower(c, f"big{sgn}", bx, btop, 790, bw, mat, lit=lit, seed=3 + sgn, door=None))
        out_.append(f'<path d="M{f(bx - bw / 2 - 5)} {btop + 3} L{f(bx + bw / 2 + 5)} {btop + 3} L{f(bx + bw / 2 + 2)} {btop + 13} L{f(bx - bw / 2 - 2)} {btop + 13} Z" fill="{mat[2]}" opacity="0.85"/>')
        for j in (-0.32, 0.32):
            gx = bx + j * bw
            out_.append(f'<rect x="{f(gx - 4)}" y="{btop + 16}" width="8" height="22" rx="3" fill="#4A1A08" transform="rotate({f(-j * 70)} {f(gx)} {btop + 18})"/>')
        gx, gw, gtop = X(58), 62, 318
        out_.append(tower(c, f"gr{sgn}", gx, gtop, btop + 6, gw, mat, lit=lit, seed=7 + sgn, rings=False, taper=0.04))
        out_.append(thatch_cone(c, f"gc{sgn}", gx, gtop + 4, 50, 66, lit=lit, seed=5 + sgn))
        for k_, yy in enumerate((btop + 90, btop + 200)):
            pts = " L".join(f"{f(bx - bw * 0.38 + j * bw * 0.076)} {f(yy + (5 if j % 2 else -5))}" for j in range(11))
            out_.append(f'<path d="M{pts}" fill="none" stroke="#2A0C04" stroke-width="2.2" opacity="0.65"/>')
            out_.append(f'<path d="M{pts}" fill="none" stroke="#FFD0A0" stroke-width="0.9" opacity="0.5" transform="translate(-0.8 -1.2)"/>')
        sx, sw, stop = X(14), 62, 584
        out_.append(f'<path d="M{f(X(-10))} 792 L{f(X(-10))} 660 Q{f(X(14))} 648 {f(X(40))} 652 L{f(X(40))} 792 Z" fill="{mat[1]}"/>')
        out_.append(tower(c, f"sm{sgn}", sx, stop, 796, sw, mat, lit=lit, seed=11 + sgn, door=None))
        out_.append(thatch_cone(c, f"sc{sgn}", sx, stop + 4, 44, 52, lit=lit, seed=9 + sgn))
        return "".join(out_)

    c.add(cluster(-1))
    c.add(cluster(1))
    c.add(outer_frame(c, GOLD, 12, 3.5))
    gem_backing(c, 270, 136, 0.95)
    crest(c, 270, 136, 0.95, "gold", division=4, gem=CARNELIAN)
    birds(c, [("mee-sourire", 58, 214, 92, False, -4), ("meo-yo", 482, 214, 92, True, 4)])
    inscription(c, KICKER, "Ambassadeur IV", "Ubuntu, toujours", y=788, style="ebene", metal=GOLD)
    save(c, "ambassadeur-4", "Ambassadeur", 4, "IV", "Les Takienta du Koutammakou",
         "Deux takienta, les maisons-forteresses de terre des Batammariba (Koutammakou, Togo et Bénin), gardent la photo comme elles gardent la famille : tours rondes reliées par des murs, et sur la terrasse les greniers à mil coiffés de leur chapeau de paille. "
         "Entre elles, baobabs et acacias se découpent sur le couchant.",
         "perchés sur les greniers (Mee sourire, Meo yo)", "Ubuntu, toujours")


# =============================================================== III

def amb3():
    c = Card("a3")
    photo(c, "#4A2A1A", "#140A06", "#FFC27A", glow=0.24)
    win = rrect(100, 338, 440, 740, 8)
    m = deco_mask(c, win)
    sky = c.grad("sky", [(0, "#1A1634"), (0.1, "#3E2452"), (0.2, "#9A4258"), (0.28, "#E8804E"), (0.34, "#FFC47A"), (0.38, "#FFE2A8")])
    d = [f'<rect width="{W}" height="{H}" fill="{sky}"/>']
    d.append(noise_layer(c, "clouds", (0, 20, 540, 200), "0.006 0.04", 4, 31, 2.6, -1.25, c.grad("cl", [(0, "#8A4A7A"), (1, "#FFB884")])))
    d.append(light_rays(c, "rays", 70, 186, 24, 520, "#FFE6B0", -10, 170, 4, 0.3))
    d.append(sun(c, "sun", 70, 186, 24, haze=False))
    for k, (y, col, op) in enumerate(((262, "#7A4A6A", 0.7), (300, "#5A3050", 0.85), (344, "#3A1E30", 1))):
        hp = f"M-10 {y + 40} L-10 {y} Q50 {y - 26 + k * 6} 120 {y - 6} Q200 {y + 14} 270 {y - 4} Q350 {y - 20} 420 {y - 2} Q490 {y + 12} 550 {y - 14} L550 {y + 400} L-10 {y + 400} Z"
        d.append(f'<path d="{hp}" fill="{col}" opacity="{op}"/>')
        d.append(f'<rect x="0" y="{y + 6}" width="{W}" height="26" fill="{c.grad(f"mist{k}", [(0, "#FFE6C800"), (0.5, "#FFE6C855"), (1, "#FFE6C800")], 0, 0, 0, 1)}"/>')
    d.append(raffia_palm(14, 560, 230, "#1E1018", seed=3, lean=0.04))
    d.append(raffia_palm(530, 580, 210, "#1E1018", seed=7, lean=-0.04))
    d.append(grass(0, 540, 742, 6, 22, "#1A0E14", seed=8, n=180, width=1.4, heads=0.3))
    wood = ("#E8AE6A", "#6A3A1C", "#2A1206")
    d.append(raffia_wall(44, 496, 300, 748))
    d.append(f'<g filter="{earth(c, "gr-e", "0.025 0.07", 6, 1.6)}"><rect x="0" y="742" width="{W}" height="230" fill="{c.grad("ground", [(0, "#9A4A22"), (0.3, "#5A240E"), (1, "#1A0804")])}"/></g>')
    masked(c, m, d)
    c.add(light_grade(c, win, "#FFB257", 0.1, 0.0, 0.3))
    c.add(inner_shadow(c, win))
    jamb = c.grad("jamb", [(0, "#8A5430"), (0.5, wood[1]), (1, wood[2])], 0, 0, 1, 0)
    bv = bevel(c, "carve", 1.0, 2.2, light="#FFE8C8", spec=0.6, exp=12, shadow=False)
    csh = c.shadow("carve-sh", 1.6, 1.8, 1, "#1A0804", 0.7)
    for x0, x1 in ((70, 100), (440, 470)):
        c.add(f'<rect x="{x0}" y="330" width="{x1 - x0}" height="414" fill="{jamb}" filter="{bevel(c, "jbv", 1.2, 2.4, sd=3, dy=2, sop=0.6)}"/>')
        c.add(f'<rect x="{x0 + 4}" y="336" width="{x1 - x0 - 8}" height="402" fill="none" stroke="{wood[2]}" stroke-width="1.2" opacity="0.7"/>')
        motifs_ = []
        for i, y in enumerate(range(374, 740, 64)):
            fn = (gf_frog, gf_spider, gf_lizard)[i % 3]
            motifs_.append(f'<g transform="translate({(x0 + x1) / 2} {y}) scale(0.62)">{fn(wood[0])}</g>')
            if y + 32 < 736:
                motifs_.append(f'<path d="M{x0 + 6} {y + 30} L{(x0 + x1) / 2} {y + 26} L{x1 - 6} {y + 30} M{x0 + 6} {y + 36} L{(x0 + x1) / 2} {y + 32} L{x1 - 6} {y + 36}" fill="none" stroke="{wood[0]}" stroke-width="1.6"/>')
        c.add(f'<g filter="{csh}"><g filter="{bv}">{"".join(motifs_)}</g></g>')
    c.add(f'<rect x="62" y="306" width="416" height="34" fill="{c.grad("lint", [(0, "#8A5430"), (0.5, wood[1]), (1, wood[2])], 0, 0, 0, 1)}" filter="{bevel(c, "jbv", 1.2, 2.4, sd=3, dy=2, sop=0.6)}"/>')
    c.add(f'<g filter="{csh}"><g filter="{bv}">{gf_serpent(92, 448, 324, 5, wood[0], w=5.2, waves=4.5, dots=wood[2])}</g></g>')
    c.add(f'<rect x="64" y="740" width="412" height="12" rx="3" fill="{wood[1]}" filter="{bevel(c, "jbv", 1.2, 2.4, sd=3, dy=2, sop=0.6)}"/>')
    c.add(gold_rim(c, win, GOLD, 3.5))
    c.add(f'<rect x="40" y="306" width="460" height="44" fill="{c.grad("eave", [(0, "#000000AA"), (1, "#00000000")])}"/>')
    c.add(achum_roof(c, "roof", 270, 26, 308, 230, rows=13, seed=5, lit=-1, side_w=40))
    c.add(outer_frame(c, GOLD, 10, 3))
    gem_backing(c, 270, 176, 0.84, "#1C1008", 0.8)
    crest(c, 270, 176, 0.84, "gold", division=3, gem=CARNELIAN)
    birds(c, [("mee-wow", 46, 270, 88, False, -6), ("meo-cool", 494, 270, 88, True, 6)])
    inscription(c, KICKER, "Ambassadeur III", "Le voyage continue", y=780, style="ebene", metal=GOLD)
    save(c, "ambassadeur-3", "Ambassadeur", 3, "III", "L'Achum de Bafut",
         "À Bafut, dans les Grassfields du nord-ouest du Cameroun, l'Achum, la case sacrée du palais du Fon, dresse au-dessus des collines son toit de chaume en pyramide, si pentu qu'il semble monter vers le ciel. "
         "La photo en passe la porte : sur le linteau ondule le serpent à deux têtes, et sur les montants veillent la grenouille, l'araignée et le lézard des portes sculptées des Grassfields, pendant que les palmiers raphia montent des vallées dans la brume du matin.",
         "perchés au bord du toit (Mee wow, Meo cool)", "Le voyage continue")


# =============================================================== II

TIBEB = ["#C8102E", "#F4C430", "#1F7A3A", "#1F4FA8", "#F4F1EA", "#101010"]


def tibeb(x, y, w, h, seed=3):
    """Tibeb : la bordure tissée des châles de coton éthiopiens (netela), losanges et croix en couleurs vives."""
    out = [f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="#F4F1EA"/>']
    cell = h * 1.1
    n = int(w // cell)
    for i in range(n):
        cx = x + (i + 0.5) * w / n
        col = TIBEB[i % 4]
        out.append(f'<path d="M{f(cx)} {f(y + h * 0.12)} L{f(cx + cell * 0.42)} {f(y + h / 2)} L{f(cx)} {f(y + h * 0.88)} L{f(cx - cell * 0.42)} {f(y + h / 2)} Z" fill="{col}"/>')
        out.append(f'<rect x="{f(cx - h * 0.09)}" y="{f(y + h * 0.36)}" width="{f(h * 0.18)}" height="{f(h * 0.28)}" fill="#F4F1EA"/>')
    out.append(f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h * 0.12)}" fill="#C8102E"/><rect x="{f(x)}" y="{f(y + h * 0.88)}" width="{f(w)}" height="{f(h * 0.12)}" fill="#1F7A3A"/>')
    return "".join(out)


def amb2():
    c = Card("a2")
    photo(c, "#4A2618", "#140806", "#FFB070", glow=0.24)
    win = rrect(66, 252, 474, 742, 20)
    m = deco_mask(c, win)
    hz = 240
    sky = c.grad("sky", [(0, "#22102E"), (0.1, "#5E1C46"), (0.19, "#C8463A"), (0.245, "#FFB24A"), (0.25, "#FFD88A"), (0.252, "#3A1608"), (1, "#0E0402")])
    d = [f'<rect width="{W}" height="{H}" fill="{sky}"/>']
    d.append(noise_layer(c, "clouds", (0, 10, 540, 150), "0.006 0.04", 4, 23, 2.6, -1.25, c.grad("cl", [(0, "#C05068"), (1, "#FFB070")])))
    d.append(light_rays(c, "rays", 270, hz - 6, 30, 330, "#FFE0A0", -90, 90, 5, 0.45))
    d.append(sun(c, "sun", 270, hz - 4, 64, haze=False))
    amba = c.grad("amba", [(0, "#8A3A5A"), (1, "#4A1A30")])
    d.append(f'<path d="M-10 {hz} L-10 {hz - 22} L30 {hz - 24} L44 {hz - 40} L112 {hz - 42} L126 {hz - 26} L170 {hz - 22} L186 {hz - 30} L214 {hz - 31} L226 {hz - 18} '
             f'L310 {hz - 16} L322 {hz - 34} L398 {hz - 36} L414 {hz - 22} L460 {hz - 26} L472 {hz - 44} L530 {hz - 46} L550 {hz - 30} L550 {hz} Z" fill="{amba}" opacity="0.85"/>')
    d.append(f'<path d="M-10 {hz + 2} Q90 {hz - 10} 180 {hz - 4} T360 {hz - 6} T550 {hz - 2} L550 {hz + 4} L-10 {hz + 4} Z" fill="#2A0E08"/>')
    d.append(acacia(150, hz - 2, 30, "#2A0E08", seed=3, width=86))
    d.append(acacia(392, hz - 2, 24, "#2A0E08", seed=6, width=66))
    d.append(place(lion("#2A0E08", "#FFB070"), 196, hz - 1, 0.22))
    d.append(flock(410, 120, 9, 120, 5, "#2A0E14", 0.45, 0.85))
    d.append(dust(9, 160, (0, 0, 540, 770), "#FFE6B0", 0.4, 1.6))
    masked(c, m, d)
    c.add(light_grade(c, win, "#FF8A4A", 0.5, 0.0, 0.28))
    c.add(inner_shadow(c, win))
    c.add(gold_rim(c, win, GOLD, 4))
    gran = ("#FFD8C0", "#B07A68", "#2E1A18")
    plat = c.grad("plat", [(0, "#8A6A5E"), (0.12, "#4A3430"), (1, "#140C0A")])
    c.add(f'<g filter="{earth(c, "pl-e", "0.08", 3, 1.2, "#FFF4EC")}"><path d="M-10 990 L-10 772 L550 772 L550 990 Z" fill="{plat}"/></g>')
    c.add(f'<rect x="-10" y="770" width="560" height="3" fill="{gran[0]}" opacity="0.6"/>')
    for y in (812, 852):
        c.add(f'<line x1="-10" y1="{y}" x2="550" y2="{y}" stroke="#000000" stroke-width="2" opacity="0.4"/>')
    for x, lit in ((52, 1), (488, -1)):
        c.add(f'<ellipse cx="{x}" cy="774" rx="56" ry="10" fill="#000000" opacity="0.5" filter="{c.blur("ssh", 5)}"/>')
        c.add(aksum_stela(c, f"st{x}", x, 116, 778, 80, gran, storeys=7, lit=lit, seed=x, glow="#FFB060"))
    c.add(outer_frame(c, GOLD, 12, 3.5))
    c.add(crest_halo(c, 270, 132, 110, "#FFE6A8", 0.5))
    gem_backing(c, 270, 132, 0.92)
    crest(c, 270, 132, 0.92, "gold", division=2, gem=CARNELIAN)
    birds(c, [("mee-bravo", 54, 86, 100, False, -8), ("meo-bravo", 486, 86, 100, True, 8)])
    tib = tibeb(0, 776, 540, 16) + tibeb(0, 940, 540, 12)
    c.add(tib)
    bands = tibeb(84, 793, 372, 8) + tibeb(84, 887, 372, 8)
    inscription(c, KICKER, "Ambassadeur II", y=790, style="ebene", metal=GOLD, extra=bands)
    save(c, "ambassadeur-2", "Ambassadeur", 2, "II", "Les Stèles d'Aksoum",
         "Deux stèles de granit d'Aksoum (Éthiopie), taillées il y a dix-sept siècles comme des tours à étages - fausses portes, fausses fenêtres, rangs de bouts de poutres - encadrent la photo comme une entrée royale. "
         "Derrière, le soleil se couche sur les ambas, ces montagnes tabulaires des hauts plateaux, et un lion veille sous l'acacia.",
         "perchés sur les stèles (Mee bravo, Meo bravo)", None)


# =============================================================== I

def stepped_gable(x0, x1, base, top, steps, cx=270, flat=70):
    """Le pignon à gradins d'une maison ndebele : de base (côtés) à top (sommet), en `steps` marches."""
    left = [(x0, base)]
    run = (cx - flat - x0 - 120) / steps
    rise = (base - top) / steps
    x, y = x0 + 120, base
    left.append((x, y))
    for i in range(steps):
        y -= rise
        left.append((x, y))
        x += run
        left.append((x, y))
    left[-1] = (cx - flat, top)
    right = [(2 * cx - px, py) for px, py in reversed(left)]
    return left + right


def amb1():
    c = Card("a1")
    photo(c, "#4E2C18", "#140A06", "#FFC27A", glow=0.24)
    win = rrect(86, 256, 454, 744, 8)
    m = deco_mask(c, win)
    nd = NDEBELE
    sky = c.grad("sky", [(0, "#1E1240"), (0.09, "#6A2A6A"), (0.18, "#E0603A"), (0.25, "#FFC060"), (0.3, "#FFE8A8")])
    d = [f'<rect width="{W}" height="300" fill="{sky}"/>']
    d.append(light_rays(c, "rays", 270, 70, 36, 420, "#FFF0C0", -180, 180, 5, 0.45))
    d.append(sky_glow(c, "sunh", 270, 70, 160, "#FFE6A0", 0.75))
    d.append(noise_layer(c, "clouds", (0, 20, 540, 140), "0.006 0.04", 4, 41, 2.6, -1.3, c.grad("cl", [(0, "#C05068"), (1, "#FFB070")])))
    for x, h, s_ in ((36, 132, 1), (96, 104, 2), (150, 70, 3), (394, 66, 4), (448, 108, 5), (506, 128, 6)):
        d.append(aloe(x, 232, h, "#2A0E10", "#FF7A3A", seed=s_, glow="#FFB060"))
    d.append(acacia(232, 232, 30, "#2A0E10", seed=4, width=90))
    gab = stepped_gable(-10, 550, 226, 62, 3)
    gd = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in gab) + " L550 990 L-10 990 Z"
    d.append(f'<g filter="{earth(c, "we", "0.05", 3, 1.0, "#FFFFFF")}"><path d="{gd}" fill="{nd["blanc"]}"/></g>')
    line = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in gab)
    d.append(f'<path d="{line}" fill="none" stroke="{nd["noir"]}" stroke-width="6"/>')
    for k, (off, col, w) in enumerate(((12, nd["jaune"], 9), (22, nd["noir"], 3), (30, nd["bleu"], 9), (40, nd["noir"], 3))):
        sub = stepped_gable(-10, 550, 226 + off, 62 + off, 3, flat=70 - off * 0.2)
        dd = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in sub)
        d.append(f'<path d="{dd}" fill="none" stroke="{col}" stroke-width="{w}"/>')
    diamond = [(270, 92), (338, 150), (270, 208), (202, 150)]
    for k, (sc, col) in enumerate(((1.0, nd["noir"]), (0.92, nd["rouge"]), (0.72, nd["noir"]), (0.66, nd["jaune"]))):
        pts = " L".join(f"{f(270 + (x - 270) * sc)} {f(150 + (y - 150) * sc)}" for x, y in diamond)
        d.append(f'<path d="M{pts} Z" fill="{col}"/>')
    mot = [("lampe", (nd["jaune"], nd["bleu"])), ("lame", (nd["rouge"], nd["vert"])), ("maison", (nd["bleu"], nd["rose"])),
           ("chevrons", (nd["vert"], nd["jaune"])), ("marches", (nd["rose"], nd["bleu"])), ("carres", (nd["jaune"], nd["rouge"]))]
    for side, x0 in ((0, 12), (1, 462)):
        for i in range(6):
            name, cols = mot[(i + side * 3) % 6]
            if side:
                cols = (cols[1], cols[0])
            d.append(ndebele_panel(x0, 262 + i * 80, 66, 80, name, cols))
    d.append(f'<rect x="-10" y="904" width="560" height="70" fill="{nd["noir"]}"/>')
    for i in range(28):
        x = i * 20
        d.append(f'<path d="M{x} 904 L{x + 10} 892 L{x + 20} 904 Z" fill="{(nd["rouge"], nd["jaune"], nd["bleu"], nd["vert"])[i % 4]}" stroke="{nd["noir"]}" stroke-width="2"/>')
    masked(c, m, d)
    c.add(f'<path d="{win}" fill="none" stroke="{nd["noir"]}" stroke-width="26"/>')
    c.add(f'<path d="{win}" fill="none" stroke="{nd["jaune"]}" stroke-width="12"/>')
    steps = []
    for i in range(int(368 / 16)):
        x = 90 + i * 16
        steps.append(f'<rect x="{x}" y="244" width="8" height="8" fill="{nd["noir"]}"/>')
    c.add("".join(steps))
    c.add(light_grade(c, win, "#FFB257", 0.5, 0.0, 0.3))
    c.add(inner_shadow(c, win))
    c.add(gold_rim(c, win, GOLD, 5))
    c.add(outer_frame(c, GOLD, 10, 5))
    for (x, y) in ((40, 40), (500, 40)):
        sym = (f'<path d="M{x} {y - 13} L{x + 13} {y} L{x} {y + 13} L{x - 13} {y} Z" fill="none" stroke="{GOLD[0]}" stroke-width="2.6"/>'
               f'<path d="M{x} {y - 6} L{x + 6} {y} L{x} {y + 6} L{x - 6} {y} Z" fill="{GOLD[0]}"/>')
        c.add(corner_jewel(c, x, y, 1, sym, GOLD, bg="#1A0A04"))
    gem_backing(c, 270, 142, 0.86, "#141414", 0.85)
    crest(c, 270, 142, 0.86, "gold", division=1, gem=CARNELIAN)
    pal = [nd["blanc"], nd["blanc"], nd["blanc"], nd["bleu"], nd["blanc"], nd["blanc"], nd["rouge"], nd["blanc"], nd["blanc"], nd["jaune"], nd["blanc"], nd["vert"]]
    beads = bead_line(84, 777, 456, 777, 3.4, colors=pal, block=2) + bead_line(84, 913, 456, 913, 3.4, colors=pal, block=2)
    inscription(c, KICKER, "Ambassadeur I", "Merci la famille", y=778, style="ebene", metal=GOLD, extra=beads)
    birds(c, [("mee-fete", 62, 744, 110, False, -4), ("meo-champagne", 478, 744, 110, True, 4)])
    save(c, "ambassadeur-1", "Ambassadeur", 1, "I", "La Cour ndebele",
         "La photo passe la porte d'une cour ndebele (Mpumalanga, Afrique du Sud) au lever du soleil : à main levée, les femmes y peignent cernes noirs et aplats francs - lampes, lames de rasoir, maisons, marches - et brodent les mêmes géométries en perles, comme sur l'inscription. "
         "Le blason brille sous le pignon à gradins, et derrière le mur les aloès dressent leurs candélabres de fleurs.",
         "ruban, au-dessus de l'inscription (Mee fête, Meo champagne)", "Merci la famille")


FRAMES = [amb5, amb4, amb3, amb2, amb1]
