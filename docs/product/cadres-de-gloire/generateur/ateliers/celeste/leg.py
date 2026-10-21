"""Légende V → I : l'immense et l'infime tissés aux motifs de l'Empire céleste ; de V à I, le cadre s'ouvre plus loin."""

from beasts import *  # noqa: F401,F403
from archi import *  # noqa: F401,F403
from cosmos import *  # noqa: F401,F403
from scales import *  # noqa: F401,F403
from amb import sky

GEM = "#E8372A"


def leg_crest(c, cy, s, division):
    c.add(f'<circle cx="270" cy="{cy}" r="{fmt(80 * s)}" fill="{c.rgrad("lc-halo", [(0, "#FFE7B0", 0.45), (1, "#FFE7B0", 0)])}"/>')
    crest(c, 270, cy, s, "obsidian", division=division, gem=GEM, ink=GOLD_HI, edge=GOLD)


def cosmic_bg(c, win, stops, seed, n_stars=180, nebulae=()):
    sky(c, stops, H, win)
    m = mask_out(c, win)
    n = len(c.body)
    for (x, y, rx, ry, c1, c2, op) in nebulae:
        nebula(c, nid("nb"), x, y, rx, ry, c1, c2, op)
    stars(c, seed, n_stars, (0, 0, W, H), "#FFFFFF", 1.4, keep_photo_clear=False)
    return m, n


def magpie(cx, cy, s, rot=0, flip=False, wing=0):
    """Pie en vol (création) : corps noir aux reflets bleus, ventre et miroirs blancs, longue queue."""
    up = -8 - wing * 6
    d = (f'<path d="M-14 0 C-8 -4 6 -4 12 -1 C16 0 18 2 14 3 C6 5 -6 5 -14 2Z" fill="#141826"/>'
         f'<path d="M-4 1 C0 4 8 4 10 1" fill="#F4F6FF"/>'
         f'<path d="M-12 1 L-30 4 L-30 0Z" fill="#1A2244"/>'
         f'<path d="M14 -1 L20 0 L14 2Z" fill="#141826"/><circle cx="13" cy="-0.5" r="0.8" fill="#FFFFFF"/>'
         f'<path d="M-2 -2 C-6 {up} -14 {up - 4} -22 {up - 2} C-16 {up + 4} -8 -2 -2 -1Z" fill="#1A2244"/>'
         f'<path d="M-8 {up + 1} C-12 {up - 1} -16 {up - 1} -19 {up}" stroke="#F4F6FF" stroke-width="1.6" fill="none"/>'
         f'<path d="M2 -2 C4 {up - 2} 0 {up - 8} -6 {up - 10} C-4 {up - 2} -2 -2 2 -1Z" fill="#202A55"/>')
    return tf(d, cx, cy, rot, s, flip)


def planet_lantern(card, cx, cy, s, body="#E0331F", ring="#FFE7A0"):
    """Lanterne-planète : une lanterne de papier ceinte d'un anneau, comme Saturne."""
    out = [f'<ellipse cx="{fmt(cx)}" cy="{fmt(cy)}" rx="{fmt(44 * s)}" ry="{fmt(10 * s)}" fill="none" stroke="{ring}" stroke-width="{fmt(3 * s)}" opacity="0.7" transform="rotate(-14 {fmt(cx)} {fmt(cy)})"/>',
           lantern(card, cx, cy, s, body=body, cord=60),
           f'<path d="M{fmt(cx - 44 * s)} {fmt(cy)} A{fmt(44 * s)} {fmt(10 * s)} 0 0 0 {fmt(cx + 44 * s)} {fmt(cy)}" fill="none" stroke="{ring}" stroke-width="{fmt(3.2 * s)}" opacity="0.9" transform="rotate(-14 {fmt(cx)} {fmt(cy)})"/>']
    return "".join(out)


# ---------------------------------------------------------------- V : la perle-lune et l'arche de glace

def legV():
    c = start("lgV", "#2A2638", "#0C0A14", "#D8D0FF")
    win = win_arch(90, 250, 450, 716, 12)
    band = win_arch(62, 222, 478, 744, 22)
    m, n = cosmic_bg(c, win, [(0, "#050418"), (0.5, "#120E3A"), (1, "#06051A")], 101, 170,
                     ((90, 300, 160, 120, "#6A3AA8", "#2A1A5A", 0.55), (470, 620, 150, 180, "#1E6A8A", "#0E2A4A", 0.5), (440, 120, 140, 90, "#A84A8A", "#3A1A4A", 0.4)))
    c.add(galaxy_cluster(486, 900, 40, 3), galaxy_cluster(64, 904, 30, 5))
    since(c, n, f'mask="{m}"')
    c.add(f'<path d="{band} {win}" fill-rule="evenodd" fill="{c.grad("iceV", [(0, "#16245A"), (0.5, "#0A1236"), (1, "#141E4E")], 0, 0, 1, 1)}" opacity="0.92"/>')
    c.add(f'<path d="{band} {win}" fill-rule="evenodd" fill="{lattice(c, "latV", 7.5, "#9FD0FF", "#EAF6FF", 0.7, 1.5)}" opacity="0.85"/>')
    c.add(f'<path d="{band} {win}" fill-rule="evenodd" fill="{lg(c, [(0, "#FFFFFF", 0.0), (0.45, "#DDEEFF", 0.22), (0.55, "#FFFFFF", 0.0)], 0, 0, 1, 1, name="iceV-sheen")}"/>')
    metal_line(c, band, 2.4, "silver")
    frame_window(c, win, "gold", 3, 16, 0.8)
    for (x, y, r, sd, rot) in ((496, 330, 30, 1, 8), (508, 468, 16, 2, 20), (490, 604, 24, 3, 0), (34, 812, 14, 4, 12), (510, 742, 11, 5, 4)):
        c.add(f'<circle cx="{x}" cy="{y}" r="{r * 1.7}" fill="{c.rgrad("sfV", [(0, "#BFE0FF", 0.45), (1, "#BFE0FF", 0)])}"/>')
        c.add(snowflake(x, y, r, "#F2F8FF", 1.5 if r > 20 else 1.1, 3 if r > 14 else 2, rot, 0.95, sd))
    ctrl = [(388, 128), (330, 76), (250, 56), (170, 82), (104, 156), (56, 256), (40, 366), (66, 476), (36, 586), (58, 690), (40, 780)]
    c.add(dragon(c, ctrl, 1.0, DRAGON_SILVER, "sv", wmax=26, legs=(0.18, 0.5), v=1, glow="#9FB8FF"))
    rnd = random.Random(31)
    sp, _ = spine(ctrl, 120)
    for i in range(30, 118, 9):
        x, y, a = sp[i]
        c.add(snowflake(x + 30 + rnd.uniform(0, 14), y + rnd.uniform(-10, 10), rnd.uniform(4, 7), "#FFFFFF", 0.8, 1, rnd.uniform(0, 60), 0.85, i))
    c.add(flaming_pearl(c, 474, 92, 34, "#FFFFFF", "#EAF0FF", "#B8C4E8", ("#9FB8FF", "#FFFFFF"), n=8))
    c.add(moon(c, 474, 92, 30, 0, ("#FFFFFF", "#EEF2FA", "#B6C0D8")))
    vignette(c, "#02020A", 0.3)
    leg_crest(c, 150, 0.8, 5)
    plate(c, "Légende V", y=756, style="obsidienne")
    duo(c, [(92, 742, 114, False, -4), (448, 742, 114, True, 4)], "mee-lettre", "meo-yo")
    finish(c, "legende-5", "legende", 5, "V", "La Perle-lune et l'arche de glace",
           "Un dragon d'argent (création) s'élance par-dessus la photo pour saisir la perle-lune parmi les nébuleuses ; sur son "
           "passage la nuit gèle. L'arche qui encadre la photo est taillée dans la glace et, vue de près, ses mailles sont le réseau "
           "hexagonal du cristal, un atome à chaque nœud ; des flocons fractals tombent le long du cadre — de la Lune au cristal, "
           "le premier pas vers les deux infinis.",
           "pied : Mee (lettre) et Meo (yo)", None)


# ---------------------------------------------------------------- IV : le phénix-nébuleuse

def nebula_plume(card, ctrl, w, cols, uid, op=0.85):
    sp, _ = spine(ctrl, 60)
    out = []
    for k, (col, ww, blur) in enumerate(((cols[0], w * 2.2, 10), (cols[1], w * 1.2, 5), ("#FFFFFF", w * 0.25, 2))):
        out.append(f'<path d="{poly_d([(x, y) for x, y, _ in sp], False)}" fill="none" stroke="{col}" stroke-width="{fmt(ww)}" stroke-linecap="round" opacity="{fmt(op * (0.55 if k < 2 else 0.5))}" filter="{card.blur(f"np{blur}", blur)}"/>')
    rnd = random.Random(len(ctrl) * 7 + int(ctrl[0][0]))
    for _ in range(70):
        x, y, a = sp[rnd.randint(0, 59)]
        o = rnd.gauss(0, w * 0.6)
        out.append(f'<circle cx="{fmt(x - math.sin(a) * o)}" cy="{fmt(y + math.cos(a) * o)}" r="{fmt(rnd.uniform(0.4, 1.4))}" fill="#FFFFFF" opacity="{fmt(rnd.uniform(0.4, 1))}"/>')
    return "".join(out), sp


def ocellus(card, x, y, r, col, inner):
    """L'œil d'une rectrice : anneaux de nébuleuse autour d'un objet de l'infime."""
    return (f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(r * 2.1)}" fill="{card.rgrad(nid("oc"), [(0, col, 0.55), (0.5, col, 0.18), (1, col, 0)])}"/>'
            f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(r * 1.42)}" fill="none" stroke="{col}" stroke-width="{fmt(r * 0.16)}" opacity="0.55"/>'
            f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(r * 1.2)}" fill="none" stroke="#FFFFFF" stroke-width="0.8" opacity="0.6"/>' + inner)


def legIV():
    c = start("lgIV", "#2E2238", "#0E0812", "#FFC8F0")
    win = win_ruyi(88, 236, 452, 716, 12)
    m, n = cosmic_bg(c, win, [(0, "#0A0420"), (0.45, "#2A0C40"), (1, "#08041A")], 303, 170,
                     ((100, 600, 160, 220, "#A82A8A", "#3A0A4A", 0.45), (460, 420, 140, 220, "#1E7A9A", "#0A2A4A", 0.45)))
    c.add(supernova(c, 270, 150, 124, 5, "#FF9AD5", "#7FE0FF", flare=False))
    c.add(galaxy_cluster(480, 880, 40, 4), galaxy_cluster(60, 890, 30, 8))
    since(c, n, f'mask="{m}"')
    plumes = (([(250, 190), (150, 250), (70, 360), (42, 500), (46, 650)], ("#FF6AB8", "#FFB0E0")),
              ([(290, 190), (390, 250), (470, 360), (498, 500), (494, 650)], ("#4AD8FF", "#B0F0FF")),
              ([(260, 196), (180, 280), (110, 350), (70, 410)], ("#B07AFF", "#E0C8FF")),
              ([(280, 196), (360, 280), (430, 350), (470, 410)], ("#FFB04A", "#FFE0A0")))
    for ctrl, cols in plumes:
        svg, sp = nebula_plume(c, ctrl, 18, cols, "p")
        c.add(svg)
    frame_window(c, win, "gold", 3, 16, 0.8)
    c.add(ocellus(c, 46, 650, 26, "#FF6AB8", cell(c, 46, 650, 24, 3, membrane="#FFB0E0", cyto=("#5A1A5A", "#1A0A2A"))))
    c.add(ocellus(c, 494, 650, 26, "#4AD8FF", cell(c, 494, 650, 24, 4, membrane="#B0F0FF", cyto=("#0E4A6A", "#06142A"))))
    c.add(ocellus(c, 66, 414, 16, "#B07AFF", diatom(66, 414, 17, "#E0C8FF", 20)))
    c.add(ocellus(c, 474, 414, 16, "#FFB04A", pollen(c, 474, 414, 12, "#FFD36A", 2)))
    c.add(phoenix(c, 270, 172, 0.95, head_dir=-1, tails=[], spread=0.95, uid="phN", tilt=36,
                  neck=[(0, -10), (6, -40), (-4, -70), (8, -96)], body_c=("#FFD27A", "#C8287A")))
    vignette(c, "#04020A", 0.3)
    leg_crest(c, 178, 0.78, 4)
    plate(c, "Légende IV", y=756, style="obsidienne")
    duo(c, [(90, 742, 114, False, -4), (450, 742, 114, True, 4)], "mee-jackpot", "meo-champagne")
    finish(c, "legende-4", "legende", 4, "IV", "Le Phénix-nébuleuse",
           "Le fenghuang déploie ses ailes devant une supernova ; ses quatre rectrices sont devenues des nébuleuses rose, cyan, violette "
           "et or qui coulent de part et d'autre de la photo, et l'ocelle au bout de chacune s'ouvre sur l'infime : deux cellules "
           "vivantes, une diatomée de verre, un grain de pollen. Des amas de galaxies brillent au pied du cadre.",
           "pied : Mee (jackpot) et Meo (champagne)", None)


# ---------------------------------------------------------------- III : la rivière céleste (le Bouvier et la Tisserande)

def legIII():
    c = start("lgIII", "#262A3A", "#0A0C14", "#D8E4FF")
    win = win_rect(92, 262, 448, 716, 14)
    m, n = cosmic_bg(c, win, [(0, "#03041A"), (0.5, "#0C1440"), (1, "#04061A")], 202, 150)
    nebula(c, "nIII1", 470, 160, 160, 140, "#5A7AE8", "#0A1A4A", 0.4)
    nebula(c, "nIII2", 80, 820, 160, 140, "#B04AC8", "#1A0A3A", 0.35)
    c.add(milky_way(c, [(620, -60), (430, 210), (270, 480), (120, 730), (-80, 1020)], 250, 12, n=2200))
    c.add(constellation([(52, 70), (40, 96), (62, 104), (70, 80)], [(0, 1), (1, 2), (2, 3), (3, 0)], "#CFE6FF", 0.5, 1.6, 0.8))
    c.add(constellation([(470, 196), (452, 214), (488, 178), (500, 132)], [(0, 1), (0, 2), (2, 3)], "#FFE7C8", 0.5, 1.6, 0.8))
    since(c, n, f'mask="{m}"')
    frame_window(c, win, "gold", 3, 16, 0.8)
    left = [(84, 120), (60, 200), (42, 300), (54, 400), (38, 500), (52, 600), (42, 700)]
    right = [(470, 220), (492, 300), (502, 400), (488, 500), (502, 600), (492, 700)]
    c.add(helix_along(c, left, 8.5, 9, ("#7FD8FF", "#FF9AD5"), lw=2.2, glow="#7FB8FF", rung_every=4))
    c.add(helix_along(c, right, 7.5, 9, ("#FFD27A", "#FF9AD5"), lw=2.2, glow="#FFB86A", rung_every=4))
    pts = []
    for i in range(41):
        t = i / 40
        pts.append((lerp(84, 470, t), lerp(112, 202, t) - 84 * 4 * t * (1 - t)))
    c.add(f'<path d="{poly_d(pts, False)}" fill="none" stroke="#FFE7F4" stroke-width="44" opacity="0.18" stroke-linecap="round" filter="{c.blur("brg", 12)}"/>')
    c.add(helix_along(c, pts, 7, 10, ("#7FD8FF", "#FF9AD5"), lw=2.4, glow="#FFFFFF", n=240, rung_every=3))
    sp, _ = resample(pts, 120)
    rnd = random.Random(7)
    for i in range(8, 112, 7):
        x, y, a = sp[i]
        c.add(magpie(x + rnd.uniform(-3, 3), y - 16 + rnd.uniform(-3, 3), 1.25, math.degrees(a) * 0.4 + rnd.uniform(-10, 10), i > 60, rnd.uniform(0, 1)))
    c.add(f'<circle cx="84" cy="110" r="52" fill="{c.rgrad("vega", [(0, "#FFFFFF", 0.95), (0.3, "#9FD8FF", 0.45), (1, "#9FD8FF", 0)])}"/>' + sparkle(84, 110, 34, "#FFFFFF"))
    c.add(f'<circle cx="470" cy="200" r="46" fill="{c.rgrad("altair", [(0, "#FFFFFF", 0.95), (0.3, "#FFD9A0", 0.45), (1, "#FFD9A0", 0)])}"/>' + sparkle(470, 200, 30, "#FFFFFF"))
    c.add(f'<text x="132" y="150" text-anchor="start" font-family="{CINZEL}" font-size="9" letter-spacing="2" fill="#CFE6FF" opacity="0.85">VÉGA</text>')
    c.add(f'<text x="424" y="246" text-anchor="end" font-family="{CINZEL}" font-size="9" letter-spacing="2" fill="#FFE7C8" opacity="0.85">ALTAÏR</text>')
    vignette(c, "#02020A", 0.3)
    leg_crest(c, 168, 0.76, 3)
    plate(c, "Légende III", message="Jusqu'aux étoiles", y=756, style="obsidienne")
    duo(c, [(80, 754, 108, False, -4), (462, 754, 108, True, 4)], "mee-bisou-vole", "meo-love")
    finish(c, "legende-3", "legende", 3, "III", "La Rivière céleste",
           "La légende du Bouvier et de la Tisserande : séparés par la Rivière céleste, la Voie lactée, ils se retrouvent une nuit par an "
           "sur un pont de pies. Ici le pont qui relie Véga à Altaïr est une double hélice d'ADN, et de chaque étoile descend, le long "
           "de la photo, le fil de soie de la Tisserande — tordu lui aussi en double hélice : la galaxie et la molécule de vie tissent le même cadre.",
           "pied : Mee (bisou volé) et Meo (love)", "Jusqu'aux étoiles")


# ---------------------------------------------------------------- II : le cerisier-neurone

def neuro_tree(card, x, y, a, L, w, depth, rnd, segs, nodes, tips):
    x2, y2 = x + math.cos(a) * L, y + math.sin(a) * L
    mx, my = (x + x2) / 2 + rnd.uniform(-L * 0.12, L * 0.12), (y + y2) / 2 + rnd.uniform(-L * 0.12, L * 0.12)
    segs.append((f"M{fmt(x)} {fmt(y)} Q{fmt(mx)} {fmt(my)} {fmt(x2)} {fmt(y2)}", w))
    if depth == 0:
        tips.append((x2, y2))
        return
    nodes.append((x2, y2, w))
    k = 2 if rnd.random() < 0.75 else 3
    for j in range(k):
        da = (j - (k - 1) / 2) * rnd.uniform(0.45, 0.7) + rnd.uniform(-0.15, 0.15)
        neuro_tree(card, x2, y2, a + da, L * rnd.uniform(0.62, 0.8), w * 0.66, depth - 1, rnd, segs, nodes, tips)


def inside(x, y, box=(96, 266, 444, 716), pad=8):
    return box[0] - pad < x < box[2] + pad and box[1] - pad < y < box[3] + pad


def twigs(x, y, a, L, w, depth, rnd, segs, nodes, tips):
    x2, y2 = x + math.cos(a) * L, y + math.sin(a) * L
    if inside(x2, y2):
        tips.append((x, y))
        return
    mx, my = (x + x2) / 2 + rnd.uniform(-L * 0.12, L * 0.12), (y + y2) / 2 + rnd.uniform(-L * 0.12, L * 0.12)
    segs.append((f"M{fmt(x)} {fmt(y)} Q{fmt(mx)} {fmt(my)} {fmt(x2)} {fmt(y2)}", w))
    if depth == 0:
        tips.append((x2, y2))
        return
    nodes.append((x2, y2, w))
    for da in (-rnd.uniform(0.35, 0.65), rnd.uniform(0.35, 0.65)):
        twigs(x2, y2, a + da, L * rnd.uniform(0.62, 0.8), w * 0.66, depth - 1, rnd, segs, nodes, tips)


def legII():
    c = start("lgII", "#202838", "#080A12", "#C8D8FF")
    win = win_rect(96, 266, 444, 716, 18)
    m, n = cosmic_bg(c, win, [(0, "#02041A"), (0.5, "#0A1236"), (1, "#03041A")], 404, 140,
                     ((440, 160, 160, 120, "#2A4AA8", "#0A1A4A", 0.45), (90, 560, 120, 200, "#6A2A8A", "#1A0A3A", 0.35)))
    c.add(cosmic_web(c, (0, 0, W, 960), 9, 54, "#7F9FFF", "#FFE9F7", 3, 0.28))
    for x, y, r, sd in ((480, 120, 22, 3), (66, 110, 16, 4), (500, 440, 14, 5)):
        c.add(galaxy(x, y, r, "#E9DDFF", 2, 0.5, sd * 0.7, sd, 110))
    since(c, n, f'mask="{m}"')
    rnd = random.Random(21)
    segs, nodes, tips = [], [], []
    limbs = [([(34, 980), (46, 820), (36, 640), (54, 480), (62, 360), (110, 262), (196, 236)], 15, 6),
             ([(62, 360), (40, 250), (70, 150), (130, 90)], 8, 3),
             ([(196, 236), (300, 244), (400, 240), (470, 270), (500, 360), (486, 470), (504, 600)], 6, 2.5)]
    for ctrl, w0, w1 in limbs:
        sp, _ = spine(ctrl, 60)
        for i in range(59):
            t = i / 59
            x, y, _ = sp[i]
            x2, y2, _ = sp[i + 1]
            segs.append((f"M{fmt(x)} {fmt(y)} L{fmt(x2)} {fmt(y2)}", lerp(w0, w1, t)))
        for i in range(6, 60, 7):
            x, y, a = sp[i]
            ax = -1 if x < 270 else 1
            out_a = math.atan2(-0.6 if y > 300 else -1, ax) if y > 250 else math.atan2(-1, rnd.uniform(-1, 1))
            nodes.append((x, y, lerp(w0, w1, i / 59)))
            twigs(x, y, out_a + rnd.uniform(-0.4, 0.4), rnd.uniform(34, 52), lerp(w0, w1, i / 59) * 0.5, 3, rnd, segs, nodes, tips)
            if y < 260:
                twigs(x, y, -math.pi / 2 + rnd.uniform(-0.6, 0.6), rnd.uniform(30, 44), lerp(w0, w1, i / 59) * 0.45, 2, rnd, segs, nodes, tips)
    c.add(f'<g filter="{c.blur("nt-g", 4)}" opacity="0.75">' + "".join(f'<path d="{d}" fill="none" stroke="#7F7CFF" stroke-width="{fmt(w * 2.4)}" stroke-linecap="round"/>' for d, w in segs) + "</g>")
    c.add("".join(f'<path d="{d}" fill="none" stroke="#C8D0FF" stroke-width="{fmt(max(0.7, w))}" stroke-linecap="round"/>' for d, w in segs))
    for x, y, w in nodes[::2]:
        c.add(f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(max(2.4, w * 0.6))}" fill="{c.rgrad("soma2", [(0, "#FFFFFF", 1), (0.5, "#B8C8FF", 1), (1, "#7F7CFF", 0.4)])}"/>')
    for x, y in tips:
        if inside(x, y, pad=2):
            continue
        c.add(f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="11" fill="#FFB0D8" opacity="0.2"/>')
        c.add(blossom(c, x, y, rnd.uniform(5.5, 8.5), rnd.randint(0, 72), "#FFE6F2", "#FF7AB8", "#C2185B"))
    c.add(planet_lantern(c, 486, 300, 0.62), planet_lantern(c, 150, 200, 0.5, body="#E8B53C", ring="#BFE8FF"))
    neu, _ = neuron(c, 500, 700, 0.8, 5, "#B8E0FF", "#7FB8FF", 3, 200, 4, None)
    c.add(neu)
    frame_window(c, win, "gold", 3, 16, 0.8)
    vignette(c, "#02020A", 0.3)
    leg_crest(c, 140, 0.8, 2)
    plate(c, "Légende II", message="Ensemble, plus loin", y=756, style="obsidienne")
    bird(c, "duo-main-dans-la-main", 398, 188, 158)
    finish(c, "legende-2", "legende", 2, "II", "Le Cerisier-neurone",
           "Un cerisier dont les branches sont des neurones : il monte le long de la photo et la couronne, chaque fourche est un soma qui "
           "s'allume, chaque fleur un bouton synaptique. Derrière, la toile cosmique dessine le même réseau à l'échelle des galaxies ; "
           "deux lanternes-planètes pendent aux rameaux.",
           "perchés : Mee et Meo main dans la main sur la branche-neurone qui couronne la photo", "Ensemble, plus loin")


# ---------------------------------------------------------------- I : le dragon de la Voie lactée

def infime_rail(c, y, items, x0=22, x1=518):
    """Balustrade de laque noire où huit fenêtres rondes s'ouvrent sur l'infime, du quark au neurone."""
    gold = c.metal("gold")[0]
    out = [f'<rect x="{x0}" y="{y - 26}" width="{x1 - x0}" height="52" rx="10" fill="#000000" opacity="0.5" filter="{c.blur("rail-sh", 6)}"/>',
           f'<rect x="{x0}" y="{y - 24}" width="{x1 - x0}" height="48" rx="8" fill="{c.grad("rail", [(0, "#1C1838"), (1, "#07060F")])}"/>',
           f'<rect x="{x0}" y="{y - 24}" width="{x1 - x0}" height="48" rx="8" fill="{fret(c, "rail-fr", 10, "#3A3268", None, 1)}" opacity="0.6"/>',
           f'<rect x="{x0}" y="{y - 24}" width="{x1 - x0}" height="48" rx="8" fill="none" stroke="{gold}" stroke-width="1.6"/>',
           f'<rect x="{x0 + 4}" y="{y - 20}" width="{x1 - x0 - 8}" height="40" rx="6" fill="none" stroke="{gold}" stroke-width="0.6" opacity="0.7"/>']
    xs = [x0 + 30 + i * (x1 - x0 - 60) / (len(items) - 1) for i in range(len(items))]
    for k in range(len(xs) - 1):
        mx = (xs[k] + xs[k + 1]) / 2
        out.append(f'<path d="M{fmt(mx)} {y - 14} l4 14 l-4 14 l-4 -14Z" fill="{gold}" opacity="0.85"/>')
    for (fn, col), x in zip(items, xs):
        out.append(scale_medallion(c, x, y, 18, fn(x, y), None, None, ring=col, bg=("#14102E", "#05040F")))
    return "".join(out)


def legI():
    c = start("lgI", "#24203A", "#0A0814", "#E0D0FF")
    win = win_rect(98, 270, 442, 712, 16)
    m, n = cosmic_bg(c, win, [(0, "#020212"), (0.5, "#0E0A30"), (1, "#020212")], 505, 220,
                     ((80, 240, 140, 160, "#5A3AA8", "#1A0A4A", 0.5), (480, 760, 150, 200, "#A83A6A", "#3A0A2A", 0.4)))
    c.add(milky_way(c, [(-40, 140), (200, 60), (420, 20), (600, 40)], 110, 31, n=900, op=0.85))
    c.add(galaxy(80, 74, 50, "#CFE0FF", 2, 0.42, 0.4, 7, 360))
    c.add(supernova(c, 486, 560, 30, 4))
    c.add(galaxy(476, 830, 36, "#FFD8F0", 2, 0.5, 1.2, 12, 220))
    c.add(galaxy_cluster(60, 830, 46, 9))
    since(c, n, f'mask="{m}"')
    c.add(black_hole(c, 270, 150, 54, 0.26, -10))
    frame_window(c, win, "gold", 3, 16, 0.8)
    ctrl = [(396, 62), (456, 92), (494, 164), (496, 276), (470, 386), (500, 500), (472, 616), (446, 740), (270, 770), (110, 772), (60, 690), (40, 580), (70, 470), (40, 360), (80, 250), (140, 170)]
    PSTAR = dict(DRAGON_STAR, body="#5A64D8", hi="#E8ECFF", lo="#1A2070", belly="#E8ECFF", fin="#B9A7FF", fin_hi="#FFFFFF",
                 mane="#9FD8FF", mane_hi="#FFFFFF", horn="#FFFFFF", line="#2A3290", eye="#E8F4FF")
    c.add(f'<g style="mix-blend-mode:screen" opacity="0.92">{dragon(c, ctrl, 1.0, PSTAR, "mw", n=260, wmax=28, legs=(), v=1, glow="#8FA8FF")}</g>')
    sp, _ = spine(ctrl, 260)
    rnd = random.Random(8)
    c.add(star_body(sp, rnd, 7, 1, 1.7))
    for i in range(10, 250, 20):
        x, y, _ = sp[i]
        c.add(sparkle(x, y, rnd.uniform(4, 8), "#FFFFFF", 0.9))
    vignette(c, "#02020A", 0.25)
    items = [(lambda x, y: quarks(c, x, y, 14), "#FFB0E8"), (lambda x, y: nucleus(c, x, y, 7.5, n=9), "#FFD27A"),
             (lambda x, y: atom(c, x, y, 14, "#BFF3E8", electrons=False, lw=0.8), "#BFF3E8"), (lambda x, y: benzene(x, y, 7.5, "#BFE8FF"), "#BFE8FF"),
             (lambda x, y: dna(c, x - 12, y + 9, x + 12, y - 9, 1.2, 4.5, lw=1), "#FF9AD5"), (lambda x, y: cell(c, x, y, 13, 6), "#7FF0C8"),
             (lambda x, y: neuron(c, x, y, 0.34, 9, "#B8E0FF", "#7FB8FF", 3, 0, 5)[0], "#B8E0FF"), (lambda x, y: wave_packet(x - 14, y, x + 14, 6, 0.9, "#9FE8FF", 1, 1), "#9FE8FF")]
    c.add(infime_rail(c, 924, items))
    leg_crest(c, 156, 0.74, 1)
    plate(c, "Légende I", message="Le ciel nous attend", y=752, style="obsidienne")
    duo(c, [(82, 752, 108, False, -4), (458, 752, 108, True, 4)], "mee-courage", "meo-muscles")
    finish(c, "legende-1", "legende", 1, "I", "Le Dragon de la Voie lactée",
           "Le dragon est devenu la Voie lactée : un corps de lumière semé d'étoiles qui fait le tour complet de la photo et poursuit, "
           "au-dessus du blason, une perle devenue trou noir, son disque d'accrétion en feu. Galaxies spirales, supernova, amas et "
           "nébuleuses d'un côté ; au pied, une balustrade de laque dont les huit fenêtres rondes s'ouvrent sur l'infime — quarks, "
           "noyau, atome, molécule, ADN, cellule, neurone, paquet d'ondes : le cadre s'ouvre au plus loin dans les deux sens.",
           "pied : Mee (courage) et Meo (muscles)", "Le ciel nous attend")


def build():
    legV()
    legIV()
    legIII()
    legII()
    legI()
