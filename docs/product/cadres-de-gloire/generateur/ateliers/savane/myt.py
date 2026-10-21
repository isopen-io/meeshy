"""Afrique éternelle · Savane - MYTHE A, B, C : « du quark au quasar », toute l'échelle de l'univers dans un cadre (prisme)."""

from common import *  # noqa: F401,F403
from motifs import _taper  # noqa: F401


def scale_tag(x, y, text, anchor="middle", color="#E8E0FF", op=0.85, size=9.5):
    return (f'<text x="{f(x)}" y="{f(y)}" text-anchor="{anchor}" font-family="{SANS}" font-weight="700" font-size="{size}" letter-spacing="0.6" '
            f'fill="{color}" opacity="{op}">{text}</text>')


def planet_earth(c, name, cx, cy, r):
    """La Terre vue de loin : océan, l'Afrique en ocre au centre, voile de nuages, terminateur."""
    g = c.rgrad(name + "-o", [(0, "#7FD0FF", 1), (0.6, "#1E5AB0", 1), (1, "#0A1A40", 1)], 0.5, 0.5, 0.62, 0.38, 0.32)
    s = r / 20
    africa = (f"M{f(cx - 6 * s)} {f(cy - 13 * s)} C{f(cx - 1 * s)} {f(cy - 15 * s)} {f(cx + 5 * s)} {f(cy - 13 * s)} {f(cx + 7 * s)} {f(cy - 9 * s)} "
              f"C{f(cx + 9 * s)} {f(cy - 6 * s)} {f(cx + 12 * s)} {f(cy - 5 * s)} {f(cx + 11 * s)} {f(cy - 1 * s)} C{f(cx + 8 * s)} {f(cy + 3 * s)} {f(cx + 6 * s)} {f(cy + 8 * s)} {f(cx + 3 * s)} {f(cy + 14 * s)} "
              f"C{f(cx + 1 * s)} {f(cy + 16 * s)} {f(cx - 1 * s)} {f(cy + 12 * s)} {f(cx - 1 * s)} {f(cy + 6 * s)} C{f(cx - 2 * s)} {f(cy + 1 * s)} {f(cx - 5 * s)} {f(cy - 2 * s)} {f(cx - 9 * s)} {f(cy - 3 * s)} "
              f"C{f(cx - 12 * s)} {f(cy - 5 * s)} {f(cx - 11 * s)} {f(cy - 10 * s)} {f(cx - 6 * s)} {f(cy - 13 * s)} Z")
    return (f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/>'
            f'<path d="{africa}" fill="#D8A050" opacity="0.95"/><path d="{africa}" fill="#5A8A3A" opacity="0.35" transform="translate({f(cx * 0.04)} {f(cy * 0.04)}) scale(0.96)"/>'
            f'<path d="M{f(cx - r * 0.8)} {f(cy - r * 0.3)} q{f(r * 0.5)} {f(-r * 0.2)} {f(r * 0.9)} 0 M{f(cx - r * 0.3)} {f(cy + r * 0.55)} q{f(r * 0.4)} {f(-r * 0.15)} {f(r * 0.9)} {f(-r * 0.05)}" fill="none" stroke="#FFFFFF" stroke-width="{f(r * 0.1)}" stroke-linecap="round" opacity="0.6"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{c.rgrad(name + "-t", [(0.55, "#000000", 0), (1, "#000000", 0.75)], 0.32, 0.3, 0.8)}"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r + 1)}" fill="none" stroke="#9FD8FF" stroke-width="1.2" opacity="0.7"/>')


def star_disc(c, name, cx, cy, r):
    return (f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.6)}" fill="{c.rgrad(name + "-h", [(0, "#FFE6A0", 0.7), (1, "#FF8A3A", 0)])}"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{c.rgrad(name + "-d", [(0, "#FFFFFF", 1), (0.5, "#FFE08A", 1), (1, "#FF8A3A", 1)])}"/>'
            + star_flare(cx, cy, r * 2.2, "#FFFFFF", 0.8, 0.05))


def one_cell(c, name, cx, cy, r):
    g = c.rgrad(name, [(0, "#D8FFE8", 0.95), (0.7, "#3FB68B", 0.85), (1, "#0E5A43", 0.9)], 0.5, 0.5, 0.6, 0.4, 0.35)
    rnd = random.Random(5)
    pts = [(cx + r * (1 + rnd.uniform(-0.08, 0.08)) * math.cos(a), cy + r * 0.86 * (1 + rnd.uniform(-0.08, 0.08)) * math.sin(a)) for a in [i * math.pi / 5 for i in range(10)]]
    out = [f'<path d="{smooth_closed(pts)}" fill="{g}" stroke="#E8FFF2" stroke-width="1.2"/>']
    out.append(f'<circle cx="{f(cx + r * 0.1)}" cy="{f(cy - r * 0.05)}" r="{f(r * 0.32)}" fill="#7A3CC0" opacity="0.85"/><circle cx="{f(cx + r * 0.02)}" cy="{f(cy - r * 0.12)}" r="{f(r * 0.1)}" fill="#E8D8FF"/>')
    for a in (40, 150, 230, 320):
        x, y = pt(cx, cy, r * 0.6, a)
        out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(r * 0.18)}" ry="{f(r * 0.08)}" transform="rotate({a} {f(x)} {f(y)})" fill="#FFB0A0" opacity="0.8"/>')
    return "".join(out)


# =============================================================== A

def mythe_a():
    c = Card("ma")
    photo(c, "#2A2448", "#0A0A16", "#D8C8FF", glow=0.22)
    hz = 262
    win = rrect(92, 274, 448, 728, 22)
    m = deco_mask(c, win)
    sky = c.grad("sky", [(0, "#02020A"), (0.12, "#0A0624"), (0.22, "#2A1050"), (0.272, "#8A3A8A"), (0.274, "#0A0616"), (0.6, "#06040E"), (1, "#030208")])
    d = [f'<rect width="{W}" height="{H}" fill="{sky}"/>']
    d.append(star_field(61, 600, (0, 0, 540, 262)))
    d.append(grand_galaxy(c, "gal", 300, 190, 236, tilt=0.44, rot=2.2, seed=42))
    low = c.grad("low", [(0, "#0C0618"), (0.4, "#07040F"), (1, "#030208")])
    d.append(f'<rect x="0" y="{hz}" width="{W}" height="{H - hz}" fill="{low}"/>')
    d.append(nebula_cloud(c, "n2", 40, 520, 120, 300, "#FF6FB1", "#6A1A9A", 0.75, "0.014", 23, a=2.4, b=-0.6))
    d.append(nebula_cloud(c, "n3", 500, 520, 120, 300, "#3FD0C9", "#1A3A9A", 0.75, "0.014", 24, a=2.4, b=-0.6))
    d.append(star_field(62, 500, (0, hz + 10, 540, 960), bright=0.05))
    rim = "#FFE6F8"
    d.append(f'<rect x="0" y="{hz - 1}" width="{W}" height="2" fill="#FFFFFF" opacity="0.7"/>')
    d.append(baobab(62, hz + 4, 140, SIL, seed=17))
    d.append(acacia(186, hz + 3, 30, SIL, seed=13, width=84))
    d.append(place(elephant(SIL, rim), 136, hz + 3, 0.16))
    d.append(place(giraffe(SIL, rim), 352, hz + 3, 0.28))
    d.append(place(giraffe(SIL, rim), 388, hz + 3, 0.2))
    d.append(acacia(476, hz + 3, 50, SIL, seed=15, width=140))
    d.append(grass(0, 540, hz + 4, 3, 10, SIL, seed=33, n=200, width=1.1))
    d.append(cosmic_web(c, "cw", (8, 300, 84, 570), 11, seed=11, op=1.0, link=2.6, color="#B8A8FF"))
    d.append(quasar(c, "q", 46, 640, 46, 72, "#BFE6FF", width=6))
    d.append(constellation(c, "cg", "giraffe", 16, 760, 0.3, "#FFE6F4", "#FFC8E8", ghost=0.07, line_op=0.7, star_r=1.2))
    tr = tracks(c, "tr", 496, 372, 12, seed=9, length=150, w=1.5)
    d.append(f'<g opacity="0.6" filter="{ublur(c, "trb", 2.5)}">{tr}</g>{tr}')
    d.append(nucleus(c, "nu", 496, 520, 22, 16, seed=5))
    d.append(foam(c, "fo", (456, 580, 536, 700), 70, seed=4))
    d.append(strings(496, 640, 26, seed=3, color="#FFD0F0", n=2))
    d.append(open_string(462, 700, 530, 690, 4, 6, "#9FE8FF"))
    d.append(scale_tag(46, 296, "10²⁶ m"))
    d.append(scale_tag(496, 296, "10⁻³⁵ m"))
    masked(c, m, d)
    c.add(light_grade(c, win, "#E0B0FF", 0.5, 0.0, 0.34))
    c.add(inner_shadow(c, win))
    prism_rim(c, win)
    prism_frame(c)
    mythe_crest(c, 270, 104, 0.86, halo=0.18)
    mythe_plaque(c, None, 778)
    birds(c, [("mee-montee-au-ciel", 62, 748, 104, False, -4), ("meo-roi", 478, 748, 104, True, 4)])
    save(c, "mythe-a", "Mythe", None, "A", "L'Aube galactique",
         "Une galaxie spirale se lève sur la savane comme un soleil, et le baobab, les acacias, l'éléphant et les girafes se découpent devant ses bras. "
         "À gauche, l'infiniment grand : la toile cosmique et ses amas de galaxies, un quasar. À droite, l'infiniment petit : les traces de particules d'une collision, un noyau atomique, la mousse quantique et ses cordes - de 10²⁶ à 10⁻³⁵ mètre.",
         "ruban (Mee montée au ciel, Meo roi)", None)


# =============================================================== B

def mythe_b():
    c = Card("mb")
    photo(c, "#2E2238", "#0A0812", "#FFD0B0", glow=0.22)
    win = arch(76, 464, 420, 276, 728)
    m = deco_mask(c, win)
    sky = c.grad("sky", [(0, "#020108"), (0.4, "#0C0620"), (0.7, "#1A0A30"), (0.8, "#4A1A3A"), (1, "#05030A")])
    d = [f'<rect width="{W}" height="{H}" fill="{sky}"/>']
    d.append(nebula_cloud(c, "n1", 60, 520, 140, 320, "#FF6FB1", "#6A1A9A", 0.85, "0.013", 33, a=2.4, b=-0.6))
    d.append(nebula_cloud(c, "n2", 480, 540, 140, 320, "#6EA8FF", "#2A1A9A", 0.85, "0.013", 34, a=2.4, b=-0.6))
    d.append(nebula_cloud(c, "n3", 270, 120, 320, 150, "#FFB347", "#8A1A4A", 0.6, "0.012", 35))
    d.append(star_field(71, 1100, (0, 0, 540, 960), bright=0.06))
    d.append(waves(270, 112, 200, 12, 34, "#E8E0FF", 1.4, 0.5, ry=0.6))
    d.append(black_hole(c, "bh", 270, 114, 54, tilt=0.21, disk=4.0))
    for r_, a0, a1, col in ((236, 216, 258, "#CFE0FF"), (250, 100, 140, "#FFD0F0"), (226, 296, 326, "#D8FFE8"), (262, 58, 82, "#CFE0FF")):
        x0_, y0_ = pt(270, 114, r_, a0)
        x1_, y1_ = pt(270, 114, r_, a1)
        d.append(f'<path d="M{f(x0_)} {f(y0_)} A{r_} {r_} 0 0 1 {f(x1_)} {f(y1_)}" fill="none" stroke="{col}" stroke-width="2.6" opacity="0.7" filter="{c.blur("arc", 1)}"/>')
    d.append(cosmic_web(c, "cw", (6, 300, 72, 520), 8, seed=7, op=0.95, link=2.0))
    d.append(quasar(c, "q", 40, 590, 70, 80, "#BFE6FF", width=7))
    d.append(spiral_galaxy(c, "g1", 40, 690, 22, rot=0.6, tilt=0.6, seed=43, color="#FFE0F0", arm_tint="#FF9AD0"))
    d.append(quarks(c, "qk", 500, 352, 20, rot=10))
    d.append(strings(500, 446, 24, seed=8, color="#FFD0F0", n=3))
    d.append(foam(c, "fo", (468, 486, 536, 586), 56, seed=9))
    d.append(atom(c, "at", 500, 636, 26, nucleus_r=6, nucleons=9, w=1))
    d.append(constellation(c, "cl", "lion", 128, 300, 0.36, "#FFE6C8", "#FFD0A0", ghost=0.07, line_op=0.7, star_r=1.2))
    d.append(scale_tag(40, 292, "10²⁶ m"))
    d.append(scale_tag(500, 300, "10⁻¹⁸ m"))
    masked(c, m, d)
    c.add(light_grade(c, win, "#FFB070", 0.5, 0.0, 0.3))
    c.add(horizon_glow(c, win, 630, 728, "#FF8AC0", 0.55))
    c.add(inner_shadow(c, win))
    prism_rim(c, win)
    ground = c.grad("gr", [(0, "#05030A"), (1, "#020105")])
    c.add(f'<rect x="0" y="770" width="{W}" height="220" fill="{ground}"/>')
    roots = []
    rnd = random.Random(4)
    for i in range(9):
        a = 180 + (i - 4) * 16
        x0, y0 = 270 + (i - 4) * 8, 792
        x1, y1 = pt(x0, y0, rnd.uniform(110, 170), a)
        roots.append(open_string(x0, y0, x1, y1, rnd.choice((3, 4, 5)), rnd.uniform(3, 6), ("#FFD0F0", "#9FE8FF", "#FFE6A8")[i % 3], 1.1, 0.75))
    c.add(f'<g opacity="0.9">{"".join(roots)}</g>')
    c.add(foam(c, "fo2", (20, 900, 520, 960), 90, seed=12, rmax=7))
    c.add(f'<g opacity="0.85">{baobab(270, 792, 116, "#2A1A4A", seed=19)}</g>')
    c.add(baobab(270, 794, 112, "#05030A", seed=19))
    c.add(acacia(70, 772, 40, "#05030A", seed=3, width=110))
    c.add(acacia(470, 772, 36, "#05030A", seed=5, width=100))
    c.add(grass(0, 540, 773, 3, 14, "#05030A", seed=36, n=200, width=1.2))
    prism_frame(c)
    mythe_crest(c, 270, 150, 0.8)
    birds(c, [("mee-wow", 54, 446, 112, False, 12), ("meo-trophee", 492, 724, 96, True, -8)])
    mythe_plaque(c, "On ira jusqu'aux étoiles", 778)
    save(c, "mythe-b", "Mythe", None, "B", "L'Horizon des événements",
         "Au zénith, un trou noir couronne le blason de son disque d'accrétion ; sa gravité courbe la lumière des galaxies en arcs et plisse l'espace en ondes. "
         "À gauche la toile cosmique et un quasar, à droite trois quarks liés par leurs gluons, des cordes qui vibrent, la mousse quantique et l'atome ; et sous le baobab, les racines deviennent des cordes qui plongent dans l'écume de l'espace-temps.",
         "Mee au côté, Meo au pied (Mee wow, Meo trophée)", "On ira jusqu'aux étoiles")


# =============================================================== C

def mythe_c():
    c = Card("mc")
    photo(c, "#28244A", "#0A0A16", "#C8E0FF", glow=0.22)
    cx, cy, RX, RY = 270, 486, 236, 292
    win = oval(cx, cy, 190, 238)
    m = deco_mask(c, win)
    sky = c.grad("sky", [(0, "#02020A"), (0.5, "#0A0828"), (1, "#05030C")])
    d = [f'<rect width="{W}" height="{H}" fill="{sky}"/>']
    d.append(nebula_cloud(c, "n1", 120, 260, 220, 300, "#B36EFF", "#2A0A6A", 0.85, "0.01", 51, a=2.4, b=-0.65))
    d.append(nebula_cloud(c, "n2", 430, 700, 220, 300, "#FF6FB1", "#3A0A5A", 0.8, "0.01", 52, a=2.4, b=-0.65))
    d.append(nebula_cloud(c, "n4", 450, 240, 160, 200, "#3FD0C9", "#0A2A5A", 0.7, "0.012", 54, a=2.4, b=-0.7))
    d.append(star_field(81, 900, (0, 0, 540, 960), bright=0.06))
    ring = f"M{f(cx - RX)} {cy} A{RX} {RY} 0 1 1 {f(cx + RX)} {cy} A{RX} {RY} 0 1 1 {f(cx - RX)} {cy}"
    d.append(f'<path d="{ring}" fill="none" stroke="#CFE0FF" stroke-width="80" opacity="0.2" filter="{c.blur("rb", 22)}"/>')
    for i, (col, seed_) in enumerate((("#FF9AD8", 7), ("#9FC8FF", 8), ("#FFE6B0", 9))):
        d.append(f'<g filter="{cloud_filter(c, f"rcf{i}", "0.022", 5, seed_, 2.4, -0.75)}"><path d="{ring}" fill="none" stroke="{col}" stroke-width="{58 - i * 12}" opacity="0.8" filter="{c.blur(f"rb{i}", 9)}"/></g>')
    rnd = random.Random(5)
    st = []
    for _ in range(1700):
        a = rnd.uniform(0, 2 * math.pi)
        off = rnd.gauss(0, 17)
        st.append(f'<circle cx="{f(cx + (RX + off) * math.cos(a))}" cy="{f(cy + (RY + off * 1.2) * math.sin(a))}" r="{f(rnd.uniform(0.3, 1.1))}" fill="#FFFFFF" opacity="{f(rnd.uniform(0.4, 1))}"/>')
    d.append("".join(st))
    d.append(quasar(c, "q", 270, 112, 300, 0, "#BFE6FF", width=12))
    d.append(cluster(6, 478, 96, 28, 220))
    d.append(spiral_galaxy(c, "g1", 62, 96, 40, rot=0.7, tilt=0.5, seed=52))
    masked(c, m, d)

    def on_ring(deg):
        a = math.radians(deg)
        return cx + RX * math.sin(a), cy - RY * math.cos(a)

    herd = [(GNU, GNU_EXTRA, 0.24, 140), (ZEBRA, None, 0.24, 156), (GIRAFFE, None, 0.19, 206), (GNU, GNU_EXTRA, 0.24, 222)]
    cols = ["#FFE6C8", "#E8F4FF", "#FFD8F0", "#E0FFF4", "#FFF0D0"]
    glow = c.blur("hglow", 3)
    for i, (dd, ex, sc, deg) in enumerate(herd):
        x, y = on_ring(deg)
        right = math.cos(math.radians(deg)) < 0
        sx = sc if right else -sc
        art = outline(dd, cols[i], 1.5 / sc, fop=0.22, extra=ex)
        c.add(f'<g transform="translate({f(x)} {f(y)}) scale({f(sx)} {f(sc)}) translate(-90 50)"><g filter="{glow}" opacity="0.8">{art}</g>{art}</g>')
    meds = [
        (36, "toile cosmique", "10²⁵ m", lambda X, Y, R: cosmic_web(c, "mw-cw", (X - R, Y - R, X + R, Y + R), 7, seed=3, link=2.0)),
        (64, "galaxie", "10²¹ m", lambda X, Y, R: spiral_galaxy(c, "mw-g", X, Y, R * 0.9, rot=0.4, tilt=0.55, seed=8, n=260)),
        (92, "étoile", "10⁹ m", lambda X, Y, R: star_disc(c, "mw-s", X, Y, R * 0.5)),
        (120, "Terre", "10⁷ m", lambda X, Y, R: planet_earth(c, "mw-e", X, Y, R * 0.78)),
        (240, "cellule", "10⁻⁵ m", lambda X, Y, R: one_cell(c, "mw-c", X, Y, R * 0.72)),
        (268, "ADN", "10⁻⁹ m", lambda X, Y, R: dna(X, Y - R, Y + R, R * 0.38, R * 1.1, w=2)),
        (296, "atome", "10⁻¹⁰ m", lambda X, Y, R: atom(c, "mw-a", X, Y, R * 0.85, nucleus_r=R * 0.16, nucleons=8, w=0.9)),
        (324, "quarks", "10⁻¹⁸ m", lambda X, Y, R: quarks(c, "mw-q", X, Y, R * 0.5)),
    ]
    pr = PRISM
    for deg, label, size, draw in meds:
        x, y = on_ring(deg)
        R = 23
        c.add(lens(c, f"md{deg}", x, y, R, draw(x, y, R), pr, bg="#06051A", w=3.5))
        lx = min(max(x, 52), 488)
        pw = max(56, len(label) * 6.2 + 14)
        lx = min(max(x, 14 + pw / 2), 526 - pw / 2)
        c.add(f'<rect x="{f(lx - pw / 2)}" y="{f(y + R + 6)}" width="{f(pw)}" height="25" rx="8" fill="#06051A" opacity="0.62"/>')
        c.add(scale_tag(lx, y + R + 16, label.upper(), "middle", "#FFFFFF", 0.95, 8.5))
        c.add(scale_tag(lx, y + R + 27, size, "middle", "#D8CCFF", 0.9, 8.5))
    c.add(light_grade(c, win, "#C8B0FF", 0.5, 0.0, 0.3))
    c.add(inner_shadow(c, win))
    prism_rim(c, win)
    prism_frame(c)
    mythe_crest(c, 270, 116, 0.88)
    bird(c, "duo-mee-trinquer", 270, 738, 150)
    mythe_plaque(c, "Ensemble, plus loin", 782)
    save(c, "mythe-c", "Mythe", None, "C", "L'Anneau des échelles",
         "La Voie lactée se referme en anneau autour de la photo et porte toute l'échelle du monde : en descendant à droite, la toile cosmique, une galaxie, une étoile, la Terre et l'Afrique ; en bas, les bêtes de la Grande Migration du Serengeti galopent à hauteur de vie ; en remontant à gauche, la cellule, l'ADN, l'atome et les quarks. "
         "Au sommet, là où l'immense et l'infime se rejoignent comme le serpent-arc-en-ciel Aido-Hwedo des Fon qui se mord la queue autour du monde, brille le blason.",
         "duo qui trinque, au pied de l'anneau", "Ensemble, plus loin")


FRAMES = [mythe_a, mythe_b, mythe_c]
