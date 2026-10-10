"""Afrique éternelle · Savane - ORACLE A, B, C : le ciel s'ouvre au-dessus de la savane, et l'on entrevoit le minuscule (argent)."""

from common import *  # noqa: F401,F403
from motifs import _taper  # noqa: F401


def baobab_flower(x, y, s, petal="#FFFFFF", stamen="#FFF4D8", stalk="#070403", seed=1):
    """Fleur de baobab : pendue à une longue tige, pétales blancs retroussés, pompon d'étamines - elle s'ouvre la nuit pour les chauves-souris."""
    rnd = random.Random(seed)
    ln = 26 * s
    fx, fy = x + 2 * s, y + ln
    out = [f'<path d="M{f(x)} {f(y)} Q{f(x + 4 * s)} {f(y + ln * 0.5)} {f(fx)} {f(fy)}" fill="none" stroke="{stalk}" stroke-width="{f(1.6 * s)}"/>']
    for i in range(5):
        a = -70 + i * 35
        x1, y1 = pt(fx, fy + 3 * s, 14 * s, a - 180 + 180)
        out.append(f'<path d="M{f(fx)} {f(fy + 2 * s)} Q{f(fx + (x1 - fx) * 0.4)} {f(fy + 14 * s)} {f(x1)} {f(y1)} Q{f(fx + (x1 - fx) * 0.8)} {f(fy + 2 * s)} {f(fx)} {f(fy + 2 * s)} Z" fill="{petal}" opacity="0.92"/>')
    for i in range(46):
        a = 180 + rnd.uniform(-70, 70)
        r = rnd.uniform(9, 15) * s
        x2, y2 = pt(fx, fy + 6 * s, r, a)
        out.append(f'<line x1="{f(fx)}" y1="{f(fy + 6 * s)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{stamen}" stroke-width="{f(0.45 * s)}" opacity="0.9"/>')
        out.append(f'<circle cx="{f(x2)}" cy="{f(y2)}" r="{f(0.8 * s)}" fill="#FFE6A0"/>')
    out.append(f'<line x1="{f(fx)}" y1="{f(fy + 6 * s)}" x2="{f(fx)}" y2="{f(fy + 22 * s)}" stroke="#FFFFFF" stroke-width="{f(0.9 * s)}"/>')
    return "".join(out)


def fruit_bat(x, y, s, color="#070403", flap=0.6, flip=False):
    """Une roussette en vol, la pollinisatrice des fleurs de baobab."""
    m = -1 if flip else 1
    k = flap
    d = (f"M0 0 C-6 -4 -14 {-10 * k} -24 {-14 * k} C-30 {-16 * k} -40 {-12 * k} -46 {-4 * k} "
         f"C-42 {-2 * k} -40 2 -36 2 C-34 -1 -30 -1 -28 3 C-25 0 -21 0 -18 4 C-15 1 -11 1 -8 5 C-5 3 -2 3 0 4 "
         f"C2 3 5 3 8 5 C11 1 15 1 18 4 C21 0 25 0 28 3 C30 -1 34 -1 36 2 C40 2 42 {-2 * k} 46 {-4 * k} "
         f"C40 {-12 * k} 30 {-16 * k} 24 {-14 * k} C14 {-10 * k} 6 -4 0 0 Z")
    return (f'<g transform="translate({f(x)} {f(y)}) scale({f(s * m)} {f(s)})"><path d="{d}" fill="{color}"/>'
            f'<ellipse cx="0" cy="2" rx="4" ry="7" fill="{color}"/><circle cx="0" cy="-5" r="3.6" fill="{color}"/>'
            f'<path d="M-2.6 -7.6 L-1.6 -11 L-0.6 -7.8 M2.6 -7.6 L1.6 -11 L0.6 -7.8" fill="{color}" stroke="{color}" stroke-width="0.8"/></g>')


def lattice(cx, cy, r, color="#CFE6FF", atom="#FFFFFF", a=14):
    """La maille d'un cristal : atomes alignés en réseau hexagonal, liaisons fines."""
    out = []
    pts = []
    for i in range(-6, 7):
        for j in range(-6, 7):
            x = cx + a * (i + j * 0.5)
            y = cy + a * j * math.sqrt(3) / 2
            if math.hypot(x - cx, y - cy) < r * 1.15:
                pts.append((x, y))
    for (x, y) in pts:
        for dx, dy in ((a, 0), (a / 2, a * math.sqrt(3) / 2), (-a / 2, a * math.sqrt(3) / 2)):
            out.append(f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(x + dx)}" y2="{f(y + dy)}" stroke="{color}" stroke-width="1.1" opacity="0.7"/>')
    for k, (x, y) in enumerate(pts):
        big = (k % 3 == 0)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{3.6 if big else 2.3}" fill="{"#FFD27A" if big else atom}"/>')
    return "".join(out)


def hex_plate(x, y, r, color="#E8F4FF", rot=0, op=1.0):
    """Un cristal de glace en plaquette hexagonale : ceux qui, par milliards, dessinent le halo de 22° autour de la lune."""
    out = []
    for k, rr in enumerate((r, r * 0.62)):
        pts = " L".join(f"{f(pt(x, y, rr, rot + 60 * i)[0])} {f(pt(x, y, rr, rot + 60 * i)[1])}" for i in range(6))
        out.append(f'<path d="M{pts} Z" fill="{color if k == 0 else "none"}" fill-opacity="0.18" stroke="{color}" stroke-width="{1.4 if k == 0 else 0.8}"/>')
    for i in range(6):
        x1, y1 = pt(x, y, r * 0.62, rot + 60 * i)
        x2, y2 = pt(x, y, r, rot + 60 * i)
        out.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{color}" stroke-width="0.8"/>')
    return f'<g opacity="{f(op)}">{"".join(out)}</g>'


def mound_fractal(c, name, x, gy, h, color="#7FE8FF"):
    """La termitière vue aux rayons X : ses galeries se ramifient comme une fractale pour ventiler la colonie."""
    rnd = random.Random(7)
    lines = []

    def br(x0, y0, ang, ln, wd, depth):
        x1, y1 = pt(x0, y0, ln, ang)
        lines.append(f'<line x1="{f(x0)}" y1="{f(y0)}" x2="{f(x1)}" y2="{f(y1)}" stroke-width="{f(wd)}"/>')
        if depth:
            for da in (-26, 24):
                br(x1, y1, ang + da + rnd.uniform(-8, 8), ln * 0.72, wd * 0.7, depth - 1)

    for a in (-24, 0, 22):
        br(x, gy - 6, a, h * 0.26, 3.4, 5)
    body = "".join(lines)
    return (f'<g stroke="{color}" stroke-linecap="round" opacity="0.5" filter="{ublur(c, name + "-b", 3)}">{body}</g>'
            f'<g stroke="{color}" stroke-linecap="round" opacity="0.9">{body}</g>'
            f'<ellipse cx="{f(x)}" cy="{f(gy - 14)}" rx="{f(h * 0.16)}" ry="{f(h * 0.07)}" fill="{color}" opacity="0.45" filter="{ublur(c, name + "-q", 4)}"/>')


# =============================================================== A

def oracle_a():
    c = Card("ra")
    photo(c, "#232848", "#0A0A16", "#A8C8FF", glow=0.2)
    win = rrect(62, 240, 478, 716, 20)
    m = deco_mask(c, win)
    sky = c.grad("sky", [(0, "#02030A"), (0.35, "#0A1236"), (0.66, "#1E2A5A"), (0.76, "#4A3A6A"), (0.815, "#D0782E"), (0.82, "#0A0604"), (1, "#050302")])
    d = [f'<rect width="{W}" height="{H}" fill="{sky}"/>']
    d.append(star_field(3, 700, (0, 0, 540, 790)))
    d.append(milky_way(c, "mw", (-30, 820), (60, 120), (600, 30), 92, seed=7))
    for i, (x, y, r) in enumerate(((196, 92, 5), (352, 60, 4), (30, 470, 6), (514, 520, 5), (260, 214, 3.5))):
        d.append(pollen(c, f"fp{i}", x, y, r, seed=i + 2))
    d.append(fruit_bat(150, 180, 0.62, "#0A0A18", 0.8))
    d.append(fruit_bat(420, 120, 0.48, "#0A0A18", 0.4, flip=True))
    masked(c, m, d)
    c.add(light_grade(c, win, "#8FB0FF", 0.2, 0.0, 0.2))
    c.add(horizon_glow(c, win, 640, 716, "#D0782E", 0.55))
    c.add(inner_shadow(c, win))
    c.add(gold_rim(c, win, SILVER, 3.5))
    c.add(f'<rect x="0" y="786" width="{W}" height="200" fill="#070403"/>')
    for x, h, sd in ((40, 78, 2), (110, 54, 3), (190, 40, 4), (350, 44, 5)):
        c.add(baobab(x, 788, h, "#070403", seed=sd))
    c.add(baobab(500, 800, 300, "#070403", seed=12))
    for i, (x, y, s_) in enumerate(((452, 594, 0.95), (486, 566, 0.8), (520, 600, 0.9), (430, 640, 0.7))):
        c.add(baobab_flower(x, y, s_, seed=i))
    c.add(fruit_bat(470, 690, 0.7, "#070403", 1.0, flip=True))
    c.add(grass(0, 540, 789, 3, 12, "#070403", seed=2, n=200, width=1.2))
    big = pollen(c, "lp", 76, 174, 26, seed=9, spikes=40) + pollen(c, "lp2", 104, 206, 10, seed=4) + pollen(c, "lp3", 52, 214, 7, seed=5)
    c.add(lens(c, "lens1", 78, 186, 44, big))
    c.add(f'<path d="M108 218 Q150 250 196 214" fill="none" stroke="#CFE0FF" stroke-width="0.8" stroke-dasharray="2 4" opacity="0.7"/>')
    c.add(outer_frame(c, SILVER, 12, 3))
    c.add(crest_halo(c, 270, 122, 100, "#CFE0FF", 0.35))
    crest(c, 270, 122, 0.92, "silver", division=None)
    birds(c, [("mee-montee-au-ciel", 420, 214, 96, True, 8)])
    bird(c, "meo-love", 72, 700, 120, rotate=-6)
    inscription(c, KICKER, "Oracle", "Sous les mêmes étoiles", y=800, style="nuit", metal=SILVER, panel=("#0E1430", "#05060F"))
    save(c, "oracle-a", "Oracle", None, "A", "La Nuit des fleurs de baobab",
         "La Voie lactée - « la colonne vertébrale de la nuit » des San du Kalahari - se lève sur les baobabs, dont les grandes fleurs blanches ne s'ouvrent que la nuit pour les roussettes qui les pollinisent. "
         "Une lentille d'argent grossit un grain de pollen hérissé, et d'autres grains flottent dans le ciel comme de petites lunes.",
         "Mee au ciel, Meo au pied (Mee montée au ciel, Meo love)", "Sous les mêmes étoiles")


# =============================================================== B

def oracle_b():
    c = Card("rb")
    photo(c, "#202A44", "#0A0A16", "#A8C8FF", glow=0.2)
    win = ogive(62, 478, 430, 246, 738)
    m = deco_mask(c, win)
    sky = c.grad("sky", [(0, "#03040E"), (0.4, "#0B1440"), (0.7, "#142A5A"), (0.8, "#1E4A6A"), (0.82, "#060807"), (1, "#030403")])
    d = [f'<rect width="{W}" height="{H}" fill="{sky}"/>']
    d.append(nebula_cloud(c, "neb", 120, 120, 170, 110, "#3A5ACF", "#1A1A6A", 0.45, "0.012", 9))
    d.append(star_field(5, 650, (0, 0, 540, 790)))
    belt = [(60, 196), (100, 176), (140, 156)]
    for x, y in belt:
        d.append(place(outline(ZEBRA, "#E8EEFF", 1.6 / 0.24, fop=0.1), x - 24, y + 36, 0.24, rot=-26))
    for x, y in belt:
        d.append(cstar(x, y, 3.2, "#FFFFFF"))
    for x, y in ((112, 210), (116, 224), (121, 240)):
        d.append(cstar(x, y, 1.4, "#DDE6FF"))
    d.append(f'<circle cx="118" cy="226" r="14" fill="{c.rgrad("orneb", [(0, "#FF8FB8", 0.4), (1, "#7A3CFF", 0)])}"/>')
    hy = [(432, 150), (412, 132), (394, 112), (444, 128), (456, 106)]
    d.append(cstar(432, 150, 4.2, "#FFB36A"))
    d.append("".join(f'<line x1="{f(hy[i][0])}" y1="{f(hy[i][1])}" x2="{f(hy[j][0])}" y2="{f(hy[j][1])}" stroke="#FFD9A0" stroke-width="1" opacity="0.5"/>' for i, j in ((0, 1), (1, 2), (0, 3), (3, 4))))
    d.extend(cstar(x, y, 1.6, "#FFE6C0") for x, y in hy[1:])
    d.append(f'<path d="M462 190 Q500 150 470 104" fill="none" stroke="#FFD9A0" stroke-width="2" opacity="0.8"/>'
             f'<line x1="462" y1="190" x2="470" y2="104" stroke="#FFD9A0" stroke-width="0.8" opacity="0.7"/>')
    d.append(f'<path d="M466 148 Q300 18 128 212" fill="none" stroke="#FFD9A0" stroke-width="1.2" stroke-dasharray="2 6" opacity="0.75"/>')
    d.append(f'<path d="M132 204 L127 214 L138 210" fill="none" stroke="#FFD9A0" stroke-width="1.4" opacity="0.8"/>')
    for i, (dx, dy) in enumerate(((0, 0), (10, -6), (16, 4), (6, 9), (-8, 6), (22, -2), (-4, -9))):
        d.append(cstar(486 + dx, 52 + dy, 2.2 if i < 3 else 1.5, "#CFE0FF"))
    d.append(f'<circle cx="490" cy="52" r="26" fill="{c.rgrad("ple", [(0, "#8FB8FF", 0.35), (1, "#8FB8FF", 0)])}"/>')
    d.append(f'<circle cx="54" cy="64" r="22" fill="#F4F1EA"/><circle cx="64" cy="58" r="21" fill="#060A22"/>')
    d.append(snowflake(70, 330, 16, "#CFE6FF", 1, seed=3, op=0.75))
    d.append(snowflake(486, 300, 12, "#CFE6FF", 0.9, seed=5, op=0.65))
    masked(c, m, d)
    c.add(light_grade(c, win, "#8FB0FF", 0.5, 0.0, 0.2))
    c.add(horizon_glow(c, win, 650, 738, "#2E6A8A", 0.7))
    c.add(inner_shadow(c, win))
    c.add(gold_rim(c, win, SILVER, 3.5))
    c.add(f'<rect x="0" y="770" width="{W}" height="220" fill="#060807"/>')
    mound = termite_mound(70, 772, 128, "#060807", seed=3)
    c.add(mound)
    c.def_once("mclip", f'<clipPath id="{c.id("mclip")}">{mound}</clipPath>')
    c.add(f'<g clip-path="url(#{c.id("mclip")})">{mound_fractal(c, "mf", 70, 772, 150)}</g>')
    c.add(f'<g opacity="0.35" filter="{ublur(c, "mglow", 6)}" clip-path="url(#{c.id("mclip")})">{mound_fractal(c, "mf2", 70, 772, 150)}</g>')
    c.add(acacia(300, 774, 40, "#060807", seed=21, width=110))
    for x, sc in ((180, 0.26), (214, 0.23), (246, 0.25)):
        c.add(place(zebra("#060807", "#7FB8E8"), x, 774, sc))
    for i, (x, h, w, a) in enumerate(((452, 70, 20, -16), (474, 104, 26, -2), (498, 82, 22, 12), (518, 56, 16, 24), (436, 46, 14, -30))):
        c.add(crystal(c, f"cr{i}", x, 778, h, w, a, op=0.95))
    c.add(f'<ellipse cx="478" cy="760" rx="60" ry="30" fill="{c.rgrad("crg", [(0, "#BFE6FF", 0.45), (1, "#BFE6FF", 0)])}"/>')
    c.add(grass(0, 540, 774, 4, 18, "#060807", seed=13, n=200, width=1.3))
    c.add(lens(c, "lens1", 470, 640, 40, lattice(470, 640, 40)))
    c.add(f'<path d="M478 682 L478 700" stroke="#CFE0FF" stroke-width="0.8" stroke-dasharray="2 3" opacity="0.8"/>')
    c.add(outer_frame(c, SILVER, 12, 3))
    c.add(crest_halo(c, 270, 122, 100, "#CFE0FF", 0.3))
    crest(c, 270, 120, 0.92, "silver", division=None)
    birds(c, [("mee-wow", 64, 596, 108, False, -6), ("meo-feu-artifice", 452, 252, 96, True, 6)])
    inscription(c, KICKER, "Oracle", y=792, style="nuit", metal=SILVER, panel=("#0E1430", "#05060F"))
    save(c, "oracle-b", "Oracle", None, "B", "Les Trois Zèbres et le cristal",
         "Le ciel des /Xam, peuple san d'Afrique australe : la ceinture d'Orion y est trois zèbres, et Aldébaran un chasseur dont la flèche est retombée trop court. "
         "En bas, l'infiniment petit : la termitière dévoile ses galeries ramifiées comme une fractale, et une lentille montre la maille hexagonale des cristaux de quartz qui poussent à ses pieds.",
         "de part et d'autre (Mee wow, Meo feu d'artifice)", None)


# =============================================================== C

def oracle_c():
    c = Card("rc")
    photo(c, "#26244A", "#0A0A18", "#C0B0FF", glow=0.22)
    win = arch(70, 470, 412, 268, 736)
    m = deco_mask(c, win)
    sky = c.grad("sky", [(0, "#05030F"), (0.3, "#1A1040"), (0.6, "#3A1E5A"), (0.78, "#7A3A6A"), (0.8, "#0A0508"), (1, "#050204")])
    d = [f'<rect width="{W}" height="{H}" fill="{sky}"/>']
    d.append(star_field(9, 600, (0, 0, 540, 780)))
    mx, my, mr, ring = 270, 150, 90, 136
    d.append(f'<circle cx="{mx}" cy="{my}" r="180" fill="{c.rgrad("mh", [(0, "#E8E0FF", 0.5), (0.4, "#B8A8FF", 0.15), (1, "#B8A8FF", 0)])}"/>')
    d.append(f'<circle cx="{mx}" cy="{my}" r="{mr}" fill="{c.rgrad("moon", [(0, "#FFFFFF", 1), (0.7, "#E8E4F4", 1), (1, "#C8C0E0", 1)], 0.42, 0.4, 0.62)}"/>')
    d.append(flower_of_life(mx, my, 22, "#8A80C0", 0.9, 2, 0.4))
    tips = []
    tree = baobab_tall(270, 1000, 300, 420, 250, "#0A0612", seed=14, blen=118, a0=-88, a1=88, n=11, depth=2, bw=40, twigs=(2, 3), twig_len=(0.3, 0.5), tips=tips)
    d.append(tree)
    rnd = random.Random(12)
    glow = []
    for x, y, dep in tips:
        if dep == 0:
            glow.append(cstar(x, y, 1.8 if rnd.random() < 0.7 else 2.8, "#FFE6A8"))
            x2, y2 = x + rnd.uniform(-30, 30), y - rnd.uniform(20, 60)
            glow.append(f'<path d="M{f(x)} {f(y)} Q{f(x + rnd.uniform(-20, 20))} {f((y + y2) / 2)} {f(x2)} {f(y2)}" fill="none" stroke="#FFE6A8" stroke-width="0.8" opacity="0.5"/>')
    d.append("".join(glow))
    d.append(f'<circle cx="{mx}" cy="{my}" r="{ring + 7}" fill="none" stroke="#FFB0A0" stroke-width="3" opacity="0.4" filter="{c.blur("halo0", 2)}"/>')
    d.append(f'<circle cx="{mx}" cy="{my}" r="{ring}" fill="none" stroke="#E8F0FF" stroke-width="8" opacity="0.32" filter="{c.blur("halo", 3)}"/>')
    d.append(f'<circle cx="{mx}" cy="{my}" r="{ring}" fill="none" stroke="#FFFFFF" stroke-width="0.8" opacity="0.5"/>')
    for i, a in enumerate(range(-150, 180, 30)):
        x, y = pt(mx, my, ring, a)
        if y > 268:
            continue
        d.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="16" fill="{c.rgrad("ic", [(0, "#CFE6FF", 0.55), (1, "#CFE6FF", 0)])}"/>')
        d.append(snowflake(x, y, 10, "#FFFFFF", 1.1, rot=a, seed=i) if i % 2 == 0 else hex_plate(x, y, 8, "#E8F4FF", rot=a))
    d.append(dust(9, 120, (0, 0, 540, 780), "#FFE6A8", 0.5, 1.6))
    masked(c, m, d)
    c.add(light_grade(c, win, "#B8A8FF", 0.5, 0.0, 0.2))
    c.add(inner_shadow(c, win))
    c.add(gold_rim(c, win, SILVER, 3.5))
    c.add(f'<path d="M-10 990 L-10 790 Q120 770 160 744 Q270 730 380 744 Q420 770 550 790 L550 990 Z" fill="#0A0612"/>')
    c.add(f'<path d="M150 760 Q110 772 40 778 M390 760 Q430 772 500 776 M200 750 Q170 770 120 790 M340 750 Q370 770 420 790" stroke="#0A0612" stroke-width="7" stroke-linecap="round" fill="none"/>')
    c.add(grass(0, 540, 792, 3, 10, "#0A0612", seed=3, n=160, width=1.1))
    flake = snowflake(468, 640, 30, "#FFFFFF", 1.4, seed=2) + f'<path d="{koch(468, 640, 34, 3, 0)}" fill="none" stroke="#9FD8FF" stroke-width="0.9" opacity="0.7"/>'
    c.add(lens(c, "lens1", 468, 640, 40, flake))
    c.add(outer_frame(c, SILVER, 12, 3))
    crest(c, 270, 136, 0.86, "silver", division=None)
    bird(c, "duo-coucou", 126, 706, 210, rotate=-4)
    inscription(c, KICKER, "Oracle", "Plus haut que les baobabs", y=790, style="nuit", metal=SILVER, panel=("#14103A", "#06040F"))
    save(c, "oracle-c", "Oracle", None, "C", "Les Racines du ciel",
         "Selon une légende répandue d'un bout à l'autre du continent, les dieux ont planté le baobab à l'envers : ses branches sont des racines qui boivent le ciel, et chacune s'allume en étoile. "
         "La pleine lune porte un halo, qu'allument des milliards de cristaux de glace hexagonaux : la lentille d'argent en grossit un, flocon fractal.",
         "duo au pied, qui salue (Mee et Meo, coucou)", "Plus haut que les baobabs")


FRAMES = [oracle_a, oracle_b, oracle_c]
