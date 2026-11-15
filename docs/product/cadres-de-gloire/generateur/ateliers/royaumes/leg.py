"""Légende : les royaumes s'incrustent dans les deux infinis. De V à I, le cadre s'ouvre de plus en plus loin dans les deux
sens — de la Voie lactée au cristal (V) jusqu'à la toile des amas et au réseau des neurones (I)."""

from leg_helpers import *  # noqa: F401,F403


def micro_inset(card, x, y, w, h, kind, seed):
    """Un médaillon de l'infiniment petit serti dans le bronze (atome, ADN, cellule, cristal, neurone)."""
    uid = nid("mi")
    card.def_once(uid, f'<clipPath id="{card.id(uid)}"><rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="3"/></clipPath>')
    bg = card.grad("mi-bg", [(0, "#06242A"), (1, "#020A10")])
    rnd = random.Random(seed)
    inner = [f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="{bg}"/>']
    inner.append("".join(f'<circle cx="{f(rnd.uniform(x, x + w))}" cy="{f(rnd.uniform(y, y + h))}" r="{f(rnd.uniform(0.4, 1.4))}" fill="#9FFFE0" opacity="{f(rnd.uniform(0.15, 0.5))}"/>' for _ in range(26)))
    cx, cy = x + w / 2, y + h / 2
    if kind == "atom":
        inner.append(atom(card, cx, cy, w * 0.4, "#9FE8FF", rot=30))
    elif kind == "dna":
        inner.append(dna(cx, y + 6, cx, y + h - 6, w * 0.26, 2.2, w=1.8))
    elif kind == "cell":
        inner.append(cell(card, cx, cy, w * 0.36, seed=seed))
    elif kind == "crystal":
        inner.append(lattice(cx, cy, 0.5, 2, "#BFF0FF", "#FFFFFF"))
    else:
        inner.append(neuron(cx, cy - 16, 0.9, "#FFD27A", seed, (180, 54)))
    return f'<g clip-path="url(#{card.id(uid)})">{"".join(inner)}</g>'


def quartz_chain(x, y0, y1, color="#E9DDFF", si="#FFE7A0", o="#FF9A8A", step=22):
    """Le réseau du quartz (SiO₂) déplié en ruban : tétraèdres d'oxygène autour de chaque silicium."""
    out = []
    pts = []
    k = 0
    y = y0
    while y <= y1:
        pts.append((x + (11 if k % 2 else -11), y))
        y += step / 2
        k += 1
    for a, b in zip(pts, pts[1:]):
        out.append(f'<line x1="{f(a[0])}" y1="{f(a[1])}" x2="{f(b[0])}" y2="{f(b[1])}" stroke="{color}" stroke-width="1" opacity="0.7"/>')
    for a, b in zip(pts, pts[2:]):
        out.append(f'<line x1="{f(a[0])}" y1="{f(a[1])}" x2="{f(b[0])}" y2="{f(b[1])}" stroke="{color}" stroke-width="1" opacity="0.45"/>')
    for a, b, c in zip(pts, pts[1:], pts[2:]):
        cx, cy = (a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="5" fill="{si}" opacity="0.2"/><circle cx="{f(cx)}" cy="{f(cy)}" r="2.2" fill="{si}"/>')
    for px, py in pts:
        out.append(f'<circle cx="{f(px)}" cy="{f(py)}" r="3.2" fill="{o}" opacity="0.9"/><circle cx="{f(px - 0.8)}" cy="{f(py - 0.8)}" r="1" fill="#FFFFFF" opacity="0.8"/>')
    return "".join(out)


from base import plate_layer  # noqa: E402  la couche « plate » et ses emplacements de texte


@plate_layer
def leg_plate(c, title, message=None, y=780, **kw):
    return plate(c, title, message, y=y, style="cosmos", **kw)


def leg5():
    """V — Les Murs de la Voie lactée."""
    c = start("l5", **PHOTO)
    m = window(c, "l5-win", 72, 252, 468, 728, 24)
    cosmos(c, "l5-bg", m, "#0A0A26", "#090718", "#040309", seed=5, n=420,
           nebulae=[(430, 130, 240, 170, "#6A3A9A", "#1A1240", 0.65), (80, 360, 200, 240, "#9A4A2A", "#2A1020", 0.45), (470, 640, 160, 220, "#2A5A9A", "#0A1030", 0.4)])
    c.add(f'<g mask="{m}">{cloud(c, "l5-cl", 150, 120, 220, 120, "#B07AFF", "#3A1A7A", 0.7, 6, 0.012, 60)}'
          f'{cloud(c, "l5-cl2", 430, 300, 150, 200, "#FF9A7A", "#5A1A4A", 0.5, 9, 0.012, 60)}</g>')
    c.add(f'<g mask="{m}">{milky_way(c, "l5-mw", -80, 900, 620, -60, 110, "#FFE7C8", "#9A7AFF", 4, 2200)}</g>')
    ghost = zimbabwe_bird(c, 0, 0, 1, False, ("#FFE7A0", "#C9A15A", "#6E5A2A"), "#FFFFFF", column=30)
    c.add(grp(ghost, 452, 216, 0.95, op=0.22))
    bpts = [(462, 106), (484, 110), (450, 122), (436, 152), (434, 188), (456, 186), (468, 154), (444, 216), (456, 216), (424, 212)]
    c.add(constellation(bpts, [(0, 1), (0, 2), (2, 3), (3, 4), (4, 9), (2, 6), (6, 5), (5, 4), (4, 7), (5, 8)], "#FFE7A0", 1, 2, 0.9))
    for x, ph in ((26, 0), (50, 1)):
        c.add(star_chevrons(x, 272, 700, 9, 26, "#F2C76A", 60 + x, ph))
    c.add(f'<rect x="478" y="262" width="54" height="450" rx="10" fill="#0A0818" opacity="0.55" stroke="#C9B6FF" stroke-width="0.6" stroke-opacity="0.5"/>')
    c.add(quartz_chain(505, 300, 694))
    c.add(f'<circle cx="505" cy="268" r="26" fill="#0A0818" opacity="0.7"/>' + atom(c, 505, 268, 22, "#E9DDFF", ("#FFE7A0", "#C9A15A"), 3, 20, True, 0.9))
    c.add(grp(conical_tower(c, 0, 0, 1, ("#4A4462", "#34304A", "#1C1A2A"), "#100E18"), 470, 752, 1.0))
    c.add(f'<path d="M434 752 L506 752" stroke="#C9B6FF" stroke-width="1" opacity="0.6"/>')
    stones = ("#4E4C66", "#3E3C54", "#5E5A76", "#46445C")
    wall = stone_wall(c, 0, 730, 540, 230, 13, stones, "#12101C", chevrons=(14,), gold="#F2C76A", course=13, bw=(20, 44))
    c.def_once("l5-wclip", f'<clipPath id="{c.id("l5-wclip")}"><path d="M0 960 L0 748 C120 728 420 728 540 748 L540 960Z"/></clipPath>')
    rw = relief(c, "l5-rel", light="#C9D2FF", scale=2.0, blur=0.9, spec=0.5, exp=26, el=40, drop=0.0)
    c.add(f'<g clip-path="url(#{c.id("l5-wclip")})"><g filter="{rw}">{wall}</g>'
          f'<rect x="0" y="720" width="540" height="240" fill="{lgrad(c, "l5-wl", [(0, "#8A7AFF", 0.12), (1, "#000000", 0.55)])}"/></g>')
    c.add(f'<path d="M0 748 C120 728 420 728 540 748" fill="none" stroke="#F2C76A" stroke-width="1.6" opacity="0.8"/>')
    c.add(crystal(c, 58, 748, 0.62, ("#FFFFFF", "#D8C8FF", "#5A4A9A"), 5, 11, -6))
    wp = window_path(72, 252, 468, 728, 24)
    inner_shadow(c, wp, 24, 0.85)
    gold_line(c, wp, 2.8, "rosegold")
    halo(c, "l5-halo", 270, 150, 140, 110, "#FFD9C0", 0.4)
    crest(c, 270, 150, 1.0, METAL, division=5, gem=GEM)
    mee_meo(c, "perches", "mee-coucou", "meo-champagne")
    leg_plate(c, "Légende V", None, y=792, w=392)
    finish(c, "legende-5", "legende", 5, "V", "Les Murs de la Voie lactée",
           "Sous la Voie lactée, les frises à chevrons du Grand Zimbabwe se redessinent en étoiles à gauche de la photo ; à droite, "
           "le granit du mur vu au plus près, le réseau du quartz, silicium et oxygène ; le mur et la tour conique gardent le bas "
           "du cadre, l'oiseau de stéatite devient constellation.",
           "perches : Mee (coucou) et Meo (champagne) dans la Voie lactée", None)


def leg4():
    """IV — Le Léopard céleste."""
    c = start("l4", **PHOTO)
    m = window(c, "l4-win", 92, 252, 448, 726, 18)
    cosmos(c, "l4-bg", m, "#140A26", "#0A0716", "#040309", seed=6, n=380,
           nebulae=[(280, 100, 320, 170, "#B04A2A", "#3A0E2A", 0.7), (270, 920, 300, 150, "#3A2A8A", "#120A30", 0.5)])
    c.add(leopard_constellation(c))
    rf = relief(c, "l4-rel", scale=2.4, el=38, drop=0.6)
    big = ["galaxy", "nebula", "blackhole"]
    small = ["atom", "dna", "cell"]
    for i, y0 in enumerate((254, 414, 574)):
        c.add(cosmic_inset(c, 14 + 9, y0 + 9, 50, 134, big[i], 10 + i * 2))
        c.add(grp(bronze_frame(c, 14, y0, 68, 152), filt=rf))
        c.add(micro_inset(c, 458 + 9, y0 + 9, 50, 134, small[i], 20 + i))
        c.add(grp(bronze_frame(c, 458, y0, 68, 152), filt=rf))
    c.add(grp(benin_plaque(c, 14, 736, 512, 210, "", ("#D9A066", "#9A602E", "#5E3518")), filt=rf))
    c.add(cosmic_inset(c, 88, 750, 364, 138, "cluster", 77))
    c.add(f'<rect x="88" y="750" width="364" height="138" rx="3" fill="#05040C" opacity="0.45"/>')
    c.add(grp(mudfish(c, -52, 0, 0.6, 0, False) + mudfish(c, 52, 0, 0.6, 0, True), 270, 916, 1, filt=rf))
    wp = window_path(92, 252, 448, 726, 18)
    inner_shadow(c, wp, 22, 0.85)
    gold_line(c, wp, 2.6, "rosegold")
    crest(c, 270, 156, 0.96, METAL, division=4, gem=GEM)
    mee_meo(c, "pied", "mee-bravo", "meo-bravo")
    leg_plate(c, "Légende IV", None, y=764, w=356, title_size=36)
    finish(c, "legende-4", "legende", 4, "IV", "Le Léopard céleste",
           "Le léopard, bête royale des bronzes d'Edo, bondit par-dessus le blason en constellation ; les plaques de bronze qui "
           "bordent la photo s'ouvrent à gauche sur l'immense — galaxie, nébuleuse, trou noir — et à droite sur l'infime — atome, "
           "double hélice d'ADN, cellule.",
           "pied : Mee (bravo) et Meo (bravo) au pied des plaques", None)


def leg3():
    """III — L'Or de Mansa Musa."""
    c = start("l3", **PHOTO)
    m = window(c, "l3-win", 66, 262, 458, 728, 22)
    cosmos(c, "l3-bg", m, "#120A24", "#0A0716", "#050309", seed=7, n=360,
           nebulae=[(270, 110, 330, 170, "#C07A2A", "#2A1030", 0.55), (60, 520, 160, 260, "#7A3A9A", "#1A0A30", 0.35)])
    c.add(f'<g mask="{m}">{galaxy_glow(c, "l3-gal", 270, 112, 250, "#FFD27A", 0.36, 0.6, 21, 1100, "#FFFFFF", 0.7, -10)}</g>')
    c.add(supernova(c, 64, 58, 34, "#FFFFFF", "#FFB0D8", "#8A4BFF", 3))
    rnd = random.Random(33)
    stream = []
    for i in range(420):
        t = rnd.random()
        bx = (1 - t) ** 3 * 100 + 3 * (1 - t) ** 2 * t * 30 + 3 * (1 - t) * t * t * 80 + t ** 3 * 200
        by = (1 - t) ** 3 * 236 + 3 * (1 - t) ** 2 * t * 170 + 3 * (1 - t) * t * t * 90 + t ** 3 * 100
        sp = 4 + 14 * t
        stream.append(f'<circle cx="{f(bx + rnd.gauss(0, sp))}" cy="{f(by + rnd.gauss(0, sp))}" r="{f(rnd.uniform(0.4, 1.8))}" fill="{rnd.choice(("#FFE7A0", "#FFD27A", "#FFF4C2"))}" opacity="{f(rnd.uniform(0.4, 1))}"/>')
    c.add(f'<g mask="{m}">{"".join(stream)}</g>')
    rnd2 = random.Random(35)
    rain = []
    for i in range(240):
        t = rnd2.random()
        x2 = 32 + 16 * math.sin(t * 6 + 1) + rnd2.gauss(0, 5 + 7 * t)
        rain.append(f'<circle cx="{f(x2)}" cy="{f(270 + t * 460)}" r="{f(rnd2.uniform(0.4, 1.5))}" fill="#FFD27A" opacity="{f(rnd2.uniform(0.25, 0.85))}"/>')
    c.add(f'<g mask="{m}">{"".join(rain)}</g>')
    dune = c.grad("l3-dune", [(0, "#7A3A1A"), (1, "#2A0E06")])
    c.add(f'<path d="M0 266 L0 236 C60 222 120 214 190 222 C260 230 330 214 400 218 C450 220 500 230 540 226 L540 266Z" fill="{dune}"/>')
    c.add(f'<path d="M0 236 C60 222 120 214 190 222 C260 230 330 214 400 218 C450 220 500 230 540 226" fill="none" stroke="#FFC27A" stroke-width="1.6" opacity="0.8"/>')
    c.add(grp(djenne(c, 0, 0, 1, ("#4A2010", "#3A180C", "#24100A")), 476, 224, 0.24))
    for i, x in enumerate((70, 112, 154, 336, 378)):
        yy = 221 + 3 * math.sin(x / 40)
        c.add(camel(x, yy, 0.42, "#1A0A06"))
        c.add(f'<line x1="{x - 12}" y1="{f(yy - 14)}" x2="{x + 8}" y2="{f(yy - 14)}" stroke="#E8B53C" stroke-width="2" opacity="0.8"/>')
    lx, ly, lr = 482, 400, 48
    c.add(f'<circle cx="{lx}" cy="{ly}" r="{lr}" fill="{c.rgrad("l3-lens", [(0, "#3A2408", 1), (1, "#120A04", 1)])}"/>')
    c.add(lattice(lx, ly, 0.66, 2, "#FFD27A", "#FFF4C2", 1.0, 0.95))
    c.add(lens_ring(lx, ly, lr, "#F2C76A", 2.2))
    c.add(f'<circle cx="{lx}" cy="590" r="52" fill="#0A0818" opacity="0.6"/>')
    c.add(atom(c, lx, 590, 44, "#FFD27A", ("#FFF4C2", "#E8B53C"), 4, 20, True, 1.1))
    c.add(f'<path d="M{lx} {ly + lr + 4} L{lx} 540 M{lx} 640 L{lx} 736" stroke="#F2C76A" stroke-width="1" stroke-dasharray="1 4" stroke-linecap="round"/>')
    fd = c.grad("l3-fd", [(0, "#8A4520"), (0.5, "#5A2810"), (1, "#24100A")])
    c.add(f'<path d="M0 960 L0 748 C80 726 150 740 230 734 C320 728 400 712 470 726 C500 732 520 740 540 736 L540 960Z" fill="{fd}"/>')
    c.add(f'<path d="M0 748 C80 726 150 740 230 734 C320 728 400 712 470 726 C500 732 520 740 540 736" fill="none" stroke="#FFC27A" stroke-width="1.6" opacity="0.7"/>')
    c.add(f'<ellipse cx="270" cy="930" rx="260" ry="40" fill="{c.rgrad("l3-refl", [(0, "#FFD27A", 0.35), (1, "#FFD27A", 0)])}"/>')
    c.add(gold_dust(0, 900, 540, 960, 140, 39, "#FFE7A0", 1.4, False))
    c.add(nugget(c, lx, 742, 1.1, 51, 10))
    for k, (x, y) in enumerate(((44, 930), (96, 944), (452, 936), (500, 924))):
        c.add(nugget(c, x, y, 0.55, 50 + k, k * 40))
    wp = window_path(66, 262, 458, 728, 22)
    inner_shadow(c, wp, 24, 0.85)
    gold_line(c, wp, 2.8, "rosegold")
    crest(c, 270, 140, 0.98, METAL, division=3, gem=GEM)
    leg_plate(c, "Légende III", "Jusqu'aux étoiles", y=772)
    duo(c, "ruban", "mee-jackpot", "meo-trophee")
    finish(c, "legende-3", "legende", 3, "III", "L'Or de Mansa Musa",
           "Une caravane de l'empire du Mali longe la crête des dunes jusqu'à Djenné ; la poussière d'or de Mansa Musa s'élève et "
           "devient le bras d'une galaxie spirale ; à droite, une pépite du Bouré se laisse voir de plus en plus près — son réseau "
           "cristallin à la loupe, puis l'atome d'or et ses orbites.",
           "ruban : Mee (jackpot) et Meo (trophée) au bord de l'inscription", "Jusqu'aux étoiles")


def leg2():
    """II — Les Parasols de lumière."""
    c = start("l2", **PHOTO)
    m = window(c, "l2-win", 70, 262, 470, 728, 200, arch="round")
    cosmos(c, "l2-bg", m, "#0A1028", "#08081C", "#04030A", seed=8, n=420,
           nebulae=[(270, 120, 260, 160, "#2A6A9A", "#120A30", 0.55), (270, 880, 320, 140, "#8A2A6A", "#1A0A30", 0.5)])
    c.add(f'<g mask="{m}">{cloud(c, "l2-cl", 270, 70, 230, 90, "#5AA0E0", "#2A1A6A", 0.7, 5, 0.012, 60)}</g>')
    c.add(f'<g mask="{m}">{quasar(c, 270, 140, 330, 0, "#9FD8FF", "#FFFFFF", 12)}</g>')
    c.add(waves(270, 140, 120, 22, 4, "#9FD8FF", 1, 0.45))
    c.add(dna(70, 268, 46, 740, 13, 4.2, "#FFB0D0", "#FFE2A0", w=2.2))
    c.add(dna(470, 268, 494, 740, 13, 4.2, "#9FE8FF", "#B9A7FF", w=2.2))
    c.add(f'<g mask="{m}">{nebula_parasol(c, 86, 214, 1.06, ("#FFE2A0", "#E0567A", "#3A0E4A"), "star", 0, 12, 3)}</g>')
    c.add(f'<g mask="{m}">{nebula_parasol(c, 454, 214, 1.06, ("#E0FFF6", "#3AA0C8", "#0E1A4A"), "star", 0, -12, 4)}</g>')
    for i, (x, y, r, a) in enumerate(((22, 470, 18, 80), (518, 500, 18, -80), (24, 640, 14, 70), (516, 660, 14, -70))):
        c.add(cowrie_galaxy(c, x, y, r, a, 40 + i))
    c.add(molecule(150, 256, 0.62, "#9FE8FF", rot=10) + molecule(392, 252, 0.58, "#FFB0D0", rot=40, kind="star"))
    wp = window_path(70, 262, 470, 728, 200, arch="round")
    inner_shadow(c, wp, 24, 0.85)
    gold_line(c, wp, 3, "rosegold")
    c.add(beads_on_path([(x, y) for x, y, _ in rrect_points(62, 254, 478, 736, 30, 11) if y > 470], "#FFE2A0", 1.5, 0.9))
    crest(c, 270, 140, 0.98, METAL, division=2, gem=GEM)
    mee_meo(c, "pied", "mee-sourire", "meo-roi")
    yb = leg_plate(c, "Légende II", "Ensemble, on règne", y=772)
    c.add(f'<g opacity="0.9">{kente(110, yb + 6, 320, 12, 11, ("#E8B53C", "#1E5A8A", "#8A2A6A", "#0A0614"))}</g>')
    finish(c, "legende-2", "legende", 2, "II", "Les Parasols de lumière",
           "Les parasols royaux akan ont pour dôme des nébuleuses et, pour hampes, deux doubles hélices d'ADN qui descendent le "
           "long de la photo ; un quasar jaillit derrière le blason, des molécules perlent sous les franges et des galaxies vues "
           "par la tranche dessinent des cauris dans la nuit.",
           "pied : Mee (sourire) et Meo (roi) sous les parasols", "Ensemble, on règne")


def leg1():
    """I — La Descente du Sika Dwa."""
    c = start("l1", **PHOTO)
    m = window(c, "l1-win", 66, 292, 474, 728, 24)
    cosmos(c, "l1-bg", m, "#1A0A2A", "#0C0718", "#040309", seed=9, n=420,
           nebulae=[(270, 70, 340, 200, "#FFB86B", "#6A1A5A", 0.85), (80, 600, 160, 260, "#5A2A9A", "#120A30", 0.4), (470, 520, 150, 240, "#9A3A5A", "#1A0A20", 0.4)])
    c.add(f'<g mask="{m}">{cosmic_web(c, 0, 0, 540, 300, 11, "#C9A0FF", "#FFE7F0", 26, 2.4, 0.9, 0.55)}</g>')
    c.add(f'<g mask="{m}">{cloud(c, "l1-cl", 270, 40, 300, 110, "#FFC890", "#8A2A6A", 0.75, 8, 0.011, 70)}</g>')
    c.add(f'<g mask="{m}">{sunburst_rays(c, 270, 30)}</g>')
    c.add(f'<g mask="{m}">{black_hole(c, 66, 122, 46, 0.26, 0.3)}</g>')
    c.add(galaxy_cluster(c, 474, 96, 46, 4, 46))
    c.add(supernova(c, 486, 250, 22, "#FFFFFF", "#9FD8FF", "#4A6BFF", 6))
    c.add(f'<g mask="{m}">{falling_stars(0, 0, 540, 960, 110, 17, "#FFE7A0", 200, (18, 70))}</g>')
    c.add(f'<g mask="{m}">{gold_dust(0, 0, 540, 960, 160, 18, "#FFE7A0", 1.6, False)}</g>')
    for k in range(6):
        x = 196 + k * 30
        c.add(f'<line x1="{x}" y1="0" x2="{x}" y2="{40 + (k % 2) * 16}" stroke="{lgrad(c, "l1-tr", [(0, "#FFF4C2", 0), (1, "#FFF4C2", 0.7)])}" stroke-width="2"/>')
    c.add(golden_stool(c, 270, 100, 0.78))
    for bx in (189, 351):
        c.add(waves(bx, 156, 10, 9, 4, "#FFF4C2", 1, 0.7, 120, 240))
    c.add(sparkle(160, 90, 12, "#FFFFFF", 0.95), sparkle(382, 80, 10, "#FFFFFF", 0.95))
    nl = [(34, 350, 70), (30, 500, 110), (40, 650, 60)]
    nr = [(506, 360, 250), (510, 510, 290), (500, 660, 240)]
    for i, (x, y, a) in enumerate(nl):
        c.add(neuron(x, y, 0.8, "#FFD27A", 30 + i, (a + 90, 70 if i < 2 else 0), 6, 1.4))
    for i, (x, y, a) in enumerate(nr):
        c.add(neuron(x, y, 0.8, "#FFB0D0", 40 + i, (a + 90, 70 if i < 2 else 0), 6, 1.4))
    wp = window_path(66, 292, 474, 728, 24)
    inner_shadow(c, wp, 24, 0.85)
    gold_line(c, wp, 3, "rosegold")
    c.add(cell(c, 44, 900, 30, seed=7) + cell(c, 498, 898, 26, ("#FFE0F0", "#C04A8A", "#4A0A2A"), 9))
    c.add(dna(16, 760, 76, 830, 9, 1.6, "#9FE8FF", "#FFB0D0", w=1.6) + dna(464, 830, 524, 760, 9, 1.6, "#FFE2A0", "#9FE8FF", w=1.6))
    c.add(atom(c, 270, 930, 24, "#9FE8FF", rot=15))
    halo(c, "l1-ch", 270, 222, 100, 80, "#FFD9C0", 0.45)
    crest(c, 270, 224, 0.74, METAL, division=1, gem=GEM)
    mee_meo(c, "pied", "mee-montee-au-ciel", "meo-feu-artifice")
    leg_plate(c, "Légende I", "Le ciel nous attend", y=770)
    finish(c, "legende-1", "legende", 1, "I", "La Descente du Sika Dwa",
           "Comme dans la légende asante, le tabouret d'or descend du ciel au son de ses cloches, sous un portail de nébuleuse tendu "
           "sur la toile cosmique, entre un trou noir, un amas de galaxies et une supernova ; le long de la photo s'allume un réseau "
           "de neurones — le sunsum, l'âme de la nation — et, à ses pieds, cellules, ADN et atome.",
           "pied : Mee (montée au ciel) et Meo (feu d'artifice)", "Le ciel nous attend")


ALL = [leg5, leg4, leg3, leg2, leg1]
