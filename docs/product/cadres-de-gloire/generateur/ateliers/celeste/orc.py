"""Oracle A, B, C : le ciel s'ouvre (astres, constellations) et l'on entrevoit l'infime (cristaux, flocons, pollen, diatomées)."""

from beasts import *  # noqa: F401,F403
from archi import *  # noqa: F401,F403
from cosmos import *  # noqa: F401,F403
from scales import *  # noqa: F401,F403
from amb import sky

GEM = "#7FD8FF"
TRIGRAMS = {"qian": (1, 1, 1), "dui": (1, 1, 0), "li": (1, 0, 1), "zhen": (1, 0, 0), "xun": (0, 1, 1), "kan": (0, 1, 0), "gen": (0, 0, 1), "kun": (0, 0, 0)}
FUXI = ["qian", "xun", "kan", "gen", "kun", "zhen", "li", "dui"]


def trigram(cx, cy, rot, w, color, gap=6, lw=4, lines=(1, 1, 1)):
    out = []
    for i, solid in enumerate(lines):
        y = (1 - i) * gap
        if solid:
            out.append(f'<line x1="{fmt(-w / 2)}" y1="{fmt(y)}" x2="{fmt(w / 2)}" y2="{fmt(y)}" stroke="{color}" stroke-width="{lw}" stroke-linecap="round"/>')
        else:
            out.append(f'<line x1="{fmt(-w / 2)}" y1="{fmt(y)}" x2="{fmt(-w * 0.12)}" y2="{fmt(y)}" stroke="{color}" stroke-width="{lw}" stroke-linecap="round"/>'
                       f'<line x1="{fmt(w * 0.12)}" y1="{fmt(y)}" x2="{fmt(w / 2)}" y2="{fmt(y)}" stroke="{color}" stroke-width="{lw}" stroke-linecap="round"/>')
    return tf("".join(out), cx, cy, rot)


def comet(card, x, y, L, ang, color="#CFF0FF"):
    """Comète à double queue, comme celles des atlas de soie."""
    a = math.radians(ang)
    ex, ey = x + math.cos(a) * L, y + math.sin(a) * L
    out = [f'<path d="M{fmt(x)} {fmt(y)} L{fmt(ex - math.sin(a) * L * 0.12)} {fmt(ey + math.cos(a) * L * 0.12)} L{fmt(ex + math.sin(a) * L * 0.12)} {fmt(ey - math.cos(a) * L * 0.12)}Z" '
           f'fill="{lg(card, [(0, "#FFFFFF", 0.9), (1, color, 0)], user=(x, y, ex, ey))}" filter="{card.blur("cm-b", 2)}"/>',
           f'<path d="M{fmt(x)} {fmt(y)} Q{fmt(x + math.cos(a + 0.25) * L * 0.5)} {fmt(y + math.sin(a + 0.25) * L * 0.5)} {fmt(x + math.cos(a + 0.35) * L * 0.9)} {fmt(y + math.sin(a + 0.35) * L * 0.9)}" '
           f'stroke="{lg(card, [(0, "#9FD8FF", 0.8), (1, "#9FD8FF", 0)], user=(x, y, ex, ey))}" stroke-width="2" fill="none"/>',
           f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="9" fill="{card.rgrad("cm-h", [(0, "#FFFFFF", 0.9), (1, color, 0)])}"/><circle cx="{fmt(x)}" cy="{fmt(y)}" r="2.6" fill="#FFFFFF"/>']
    return "".join(out)


def bronze_mirror(card, cx, cy, r, inner, glow):
    """Miroir de bronze (les miroirs « TLV » portaient le cosmos au revers) : bord à grecque, face d'argent où l'on voit l'infime."""
    out = [f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r * 1.9)}" fill="{card.rgrad(nid("bm"), [(0, glow, 0.35), (1, glow, 0)])}"/>',
           f'<circle cx="{fmt(cx)}" cy="{fmt(cy + 2)}" r="{fmt(r + 2)}" fill="#000000" opacity="0.45" filter="{card.blur("bm-sh", 3)}"/>',
           f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r)}" fill="{card.grad("bm-rim", [(0, "#FFF1BE"), (0.4, "#C9A250"), (0.6, "#5A3A0A"), (1, "#E9C77A")], 0, 0, 1, 1)}"/>']
    for k in range(16):
        p1, p2 = pt(cx, cy, r * 0.84, k * 22.5), pt(cx, cy, r * 0.97, k * 22.5)
        out.append(f'<line x1="{fmt(p1[0])}" y1="{fmt(p1[1])}" x2="{fmt(p2[0])}" y2="{fmt(p2[1])}" stroke="#5A3A0A" stroke-width="1.2"/>')
    face = card.rgrad("bm-face", [(0, "#1A2440", 1), (0.7, "#0A1024", 1), (1, "#04060F", 1)], 0.4, 0.38, 0.7)
    out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r * 0.8)}" fill="{face}" stroke="#FFF1BE" stroke-width="0.8"/>')
    cid = clip(card, f"M{fmt(cx - r * 0.8)} {fmt(cy)} A{fmt(r * 0.8)} {fmt(r * 0.8)} 0 1 1 {fmt(cx + r * 0.8)} {fmt(cy)} A{fmt(r * 0.8)} {fmt(r * 0.8)} 0 1 1 {fmt(cx - r * 0.8)} {fmt(cy)}Z")
    out.append(f'<g clip-path="{cid}">{inner}<ellipse cx="{fmt(cx - r * 0.3)}" cy="{fmt(cy - r * 0.35)}" rx="{fmt(r * 0.45)}" ry="{fmt(r * 0.2)}" fill="#FFFFFF" opacity="0.12" transform="rotate(-30 {fmt(cx)} {fmt(cy)})"/></g>')
    out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(cy - r)}" r="3.2" fill="#C9A250" stroke="#5A3A0A" stroke-width="0.6"/>')
    return "".join(out)


# ---------------------------------------------------------------- A : le bagua des cieux

def orcA():
    c = start("ocA", "#26303A", "#0A0E14", "#CFE6FF")
    x0, y0, x1, y1, ch = 86, 262, 454, 716, 64
    win = win_octa(x0, y0, x1, y1, ch)
    sky(c, [(0, "#04061A"), (0.4, "#0B1640"), (0.75, "#0C2A44"), (1, "#050A14")], H, win)
    m = mask_out(c, win)
    n = len(c.body)
    c.add(milky_way(c, [(-40, 820), (120, 600), (300, 420), (580, 120)], 120, 8, n=700, op=0.75))
    stars(c, 77, 160, (0, 0, W, H), "#FFFFFF", 1.4)
    c.add(comet(c, 118, 92, 110, 208, "#CFF0FF"))
    orion = [(452, 40), (506, 52), (466, 92), (478, 96), (490, 100), (448, 150), (510, 140)]
    c.add(asterism(orion, [(0, 2), (1, 4), (2, 3), (3, 4), (2, 5), (4, 6)], "#FFE7C8", "#FFD27A", 1.8, 0.8, 0.5, (1.5, 1.2, 1.3, 1.3, 1.3, 1.1, 1.6)))
    c.add(f'<text x="480" y="176" text-anchor="middle" font-family="{CINZEL}" font-size="8" letter-spacing="2" fill="#FFE7C8" opacity="0.75">LES TROIS ÉTOILES</text>')
    sp, _ = spine([(60, 300), (30, 380), (58, 470), (28, 560), (56, 650), (36, 720)], 30)
    c.add(f'<g style="mix-blend-mode:screen">' + dragon(c, [(60, 300), (30, 380), (58, 470), (28, 560), (56, 650), (36, 720)], 0.6, dict(DRAGON_STAR, body="#4A6AD8", hi="#E8F0FF", lo="#1A2A7A", belly="#E8F0FF", line="#2A3A9A"), "az", wmax=24, scales=False, op=0.95, glow="#6A8AFF", legs=(0.25, 0.6), v=1) + "</g>")
    stars_pts = [(x, y) for x, y, _ in sp[::4]]
    c.add(constellation(stars_pts, [(i, i + 1) for i in range(len(stars_pts) - 1)], "#BFD8FF", 0.5, 2, 0.8, bright=(0, 3, 6)))
    since(c, n, f'mask="{m}"')
    band = win_octa(x0 - 22, y0 - 22, x1 + 22, y1 + 22, ch + 9)
    c.add(f'<path d="{band} {win}" fill-rule="evenodd" fill="{c.grad("bandA", [(0, "#2A3450"), (1, "#121A2E")])}"/>')
    c.add(f'<path d="{band} {win}" fill-rule="evenodd" fill="{lattice(c, "latA", 6, "#9FB8E8", "#EAF2FF", 0.6, 1.1)}" opacity="0.75"/>')
    metal_line(c, band, 2.4, "silver")
    frame_window(c, win, "silver", 3, 16, 0.8)
    mids = [((x0 + x1) / 2, y0 - 11, 0), (x1 - ch / 2 + 8, y0 + ch / 2 - 8, 45), (x1 + 11, (y0 + y1) / 2, 90), (x1 - ch / 2 + 8, y1 - ch / 2 + 8, 135),
            ((x0 + x1) / 2, y1 + 11, 180), (x0 + ch / 2 - 8, y1 - ch / 2 + 8, 225), (x0 - 11, (y0 + y1) / 2, 270), (x0 + ch / 2 - 8, y0 + ch / 2 - 8, 315)]
    for (mx, my, rot), name in zip(mids, FUXI):
        c.add(trigram(mx, my, rot, 30, "#F2D9A0", 5.4, 3.2, TRIGRAMS[name]))
    c.add(f'<line x1="500" y1="250" x2="500" y2="640" stroke="#C9A250" stroke-width="1.2"/>')
    views = ((326, snowflake(500, 326, 19, "#EAF4FF", 1.1, 3, 0, 1, 2), "#BFE0FF"),
             (452, flower_of_life(500, 452, 6.4, "#F2D9A0", 0.9, 2, 1), "#F2D9A0"),
             (578, pollen(c, 500, 578, 11, "#FFD36A", 3), "#FFD36A"))
    for y, inner, col in views:
        c.add(bronze_mirror(c, 500, y, 27, inner, col))
    c.add(f'<circle cx="500" cy="246" r="5" fill="#C9A250"/>')
    for k in range(-2, 3):
        c.add(f'<line x1="{500 + k}" y1="{612}" x2="{500 + k * 2.6}" y2="{646}" stroke="#D8321F" stroke-width="1.3"/>')
    c.add(f'<circle cx="270" cy="148" r="104" fill="{c.rgrad("armA", [(0, "#9FD8FF", 0.35), (1, "#9FD8FF", 0)])}"/>')
    c.add(armillary(c, 270, 148, 86, "#C9A250", "#FFF1BE", "#5A3A0A"))
    for side in (-1, 1):
        c.add(f'<path d="M{270 + side * 40} 232 Q{270 + side * 70} 246 {270 + side * 96} 236" stroke="#C9A250" stroke-width="4" fill="none"/>')
    vignette(c, "#02030A", 0.35)
    crest(c, 270, 150, 0.72, "silver", division=None, gem=GEM, ink="#2A3A5A")
    plate(c, "Oracle", y=760, style="argent")
    duo(c, [(84, 742, 116, False, -4), (456, 742, 116, True, 4)], "mee-wow", "meo-cool")
    finish(c, "oracle-a", "oracle", None, "A", "Le Bagua des cieux",
           "Le Yi Jing, le livre des oracles : la photo devient l'octogone du bagua, ses huit trigrammes gravés en or dans l'ordre du Ciel "
           "antérieur. Au-dessus, une sphère armillaire d'observatoire encercle le blason ; le ciel s'ouvre — Voie lactée, comète "
           "des atlas de soie, les Trois Étoiles du bonheur (la ceinture d'Orion), le Dragon azur de l'Orient en étoiles — et l'on "
           "entrevoit l'infime : la bande du bagua est un réseau cristallin, un atome à chaque nœud, et trois miroirs de bronze, "
           "suspendus comme des oracles, montrent un flocon fractal, la fleur de vie et un grain de pollen.",
           "pied : Mee (wow) et Meo (cool)", None)


# ---------------------------------------------------------------- B : l'étang aux lunes

def lotus_pad(card, cx, cy, r, rot=0, col=("#4FAE6A", "#1E5A34")):
    """Feuille de lotus posée à plat sur l'eau : disque fendu, nervures rayonnantes, bord relevé."""
    g = card.grad(f"pad-{col[0]}", [(0, "#8AD88E"), (0.5, col[0]), (1, col[1])], 0, 0, 1, 1)
    notch = f"M0 0 L{fmt(r * math.cos(math.radians(-10)))} {fmt(r * math.sin(math.radians(-10)))} A{fmt(r)} {fmt(r)} 0 1 0 {fmt(r * math.cos(math.radians(10)))} {fmt(r * math.sin(math.radians(10)))}Z"
    veins = "".join(f'<path d="M0 0 Q{fmt(r * 0.5 * math.cos(math.radians(a + 4)))} {fmt(r * 0.5 * math.sin(math.radians(a + 4)))} {fmt(r * 0.94 * math.cos(math.radians(a)))} {fmt(r * 0.94 * math.sin(math.radians(a)))}" fill="none" stroke="#C8F2B8" stroke-width="0.8" opacity="0.55"/>' for a in range(24, 340, 22))
    return tf(f'<path d="{notch}" fill="#000000" opacity="0.35" transform="translate(3 5)" filter="{card.blur("pad-sh", 3)}"/><path d="{notch}" fill="{g}"/>'
              f'<path d="{notch}" fill="none" stroke="#2A7A40" stroke-width="1.6"/>{veins}<circle r="{fmt(r * 0.08)}" fill="#C8F2B8" opacity="0.7"/>', cx, cy, rot)


def lotus_flower(card, cx, cy, s, col=("#FFFFFF", "#F7A8C4", "#D84A80")):
    g = card.grad(f"lot-{col[1]}", [(0, col[2]), (0.6, col[1]), (1, col[0])], 0, 0, 0, 1)
    out = []
    for a, L, w in ((-70, 34, 11), (70, 34, 11), (-40, 40, 12), (40, 40, 12), (-14, 44, 12), (14, 44, 12), (0, 46, 13)):
        d = f"M0 0 C{fmt(-w)} {fmt(-L * 0.4)} {fmt(-w * 0.6)} {fmt(-L * 0.85)} 0 {fmt(-L)} C{fmt(w * 0.6)} {fmt(-L * 0.85)} {fmt(w)} {fmt(-L * 0.4)} 0 0Z"
        out.append(f'<path d="{d}" fill="{g}" stroke="{col[2]}" stroke-width="0.6" transform="rotate({a})"/>')
    out.append('<ellipse cx="0" cy="-8" rx="7" ry="4" fill="#F7D24A"/>')
    return tf("".join(out), cx, cy, 0, s)


def orcB():
    c = start("ocB", "#1E3436", "#081214", "#BFF3E8")
    win = win_begonia(84, 258, 456, 718, 34, 16)
    water = c.rgrad("pond", [(0, "#1E6A72", 1), (0.6, "#0C3A48", 1), (1, "#04141E", 1)], 0.5, 0.45, 0.75)
    c.add(f'<rect width="{W}" height="{H}" fill="{water}" mask="{mask_out(c, win)}"/>')
    m = mask_out(c, win)
    n = len(c.body)
    for (cx, cy, k) in ((60, 320, 9), (500, 620, 8), (270, 150, 10), (40, 840, 7)):
        for j in range(1, k):
            c.add(f'<circle cx="{cx}" cy="{cy}" r="{j * 22}" fill="none" stroke="#BFF3E8" stroke-width="{fmt(1.4 - j * 0.1)}" opacity="{fmt(0.45 - j * 0.04)}"/>')
    rnd = random.Random(5)
    c.add("".join(f'<circle cx="{fmt(rnd.uniform(0, W))}" cy="{fmt(rnd.uniform(0, H))}" r="{fmt(rnd.uniform(0.5, 1.6))}" fill="#E9FFF8" opacity="{fmt(rnd.uniform(0.2, 0.7))}"/>' for _ in range(120)))
    c.add(koi(c, 500, 330, 1.25, 110, 0.7, "kohaku", 2), koi(c, 40, 600, 1.3, -80, -0.6, "yamabuki", 4))
    c.add(koi(c, 496, 800, 1.0, -120, 0.5, "showa", 6), koi(c, 110, 210, 1.05, 160, -0.4, "kohaku", 9), koi(c, 440, 222, 0.9, 20, 0.5, "yamabuki", 3))
    c.add(diatom(492, 470, 22, "#BFF3FF"), diatom(36, 420, 16, "#FFE7A0"), diatom(60, 700, 12, "#BFF3FF"))
    c.add(pollen(c, 30, 640, 10, "#FFD36A", 2), pollen(c, 510, 860, 9, "#FFB0D0", 3), pollen(c, 520, 250, 7, "#FFD36A", 4))
    since(c, n, f'mask="{m}"')
    c.add(f'<path d="{win}" fill="none" stroke="#BFF3E8" stroke-width="16" opacity="0.2" filter="{c.blur("bw", 5)}"/>')
    c.add(f'<path d="{win}" fill="none" stroke="{c.grad("jadeB", [(0, "#BFF3DA"), (0.5, JADE), (1, JADE_D)], 0, 0, 1, 1)}" stroke-width="10"/>')
    frame_window(c, win, "silver", 2.4, 14, 0.75)
    c.add(lotus_pad(c, 30, 300, 40, 30), lotus_pad(c, 516, 470, 36, 200), lotus_pad(c, 22, 420, 26, 120))
    c.add(lotus_pad(c, 518, 600, 28, 300), lotus_pad(c, 474, 728, 34, 10), lotus_pad(c, 64, 730, 38, 160))
    c.add(lotus_flower(c, 34, 302, 0.9), lotus_flower(c, 514, 474, 0.8))
    for (dx, dy) in ((84, 258), (456, 258), (84, 718), (456, 718)):
        c.add(f'<circle cx="{dx}" cy="{dy}" r="24" fill="{c.rgrad("dia-g", [(0, "#BFF3FF", 0.4), (1, "#BFF3FF", 0)])}"/>'
              f'<circle cx="{dx}" cy="{dy}" r="19" fill="#06202A" stroke="{JADE_HI}" stroke-width="1.6"/>' + diatom(dx, dy, 17, "#E6FFF6", 24, 0.95))
    phases = [-0.9, -0.6, -0.3, 0.3, 0.6, 0.9]
    for k, ph in enumerate(phases):
        a = -64 + k * (128 / 5)
        px, py = pt(270, 230, 190, a)
        c.add(f'<circle cx="{fmt(px)}" cy="{fmt(py)}" r="15" fill="#04141E" stroke="#BFF3E8" stroke-width="0.6" opacity="0.6"/>')
        c.add(crescent(c, px, py, 14, 0.5 * abs(ph) + 0.05, 0.25, rot=(0 if ph < 0 else 180)))
    c.add(moon(c, 270, 150, 62, 0.6, ("#FFFFFF", "#E2ECF4", "#9AAABB")))
    vignette(c, "#02080A", 0.35)
    crest(c, 270, 150, 0.74, "silver", division=None, gem=GEM, ink="#2A3A5A")
    plate(c, "Oracle", message="Sous la même lune", y=758, style="argent")
    duo(c, [(70, 712, 104, False, -4), (470, 712, 104, True, 4)], "mee-bisou-vole", "meo-salut")
    finish(c, "oracle-b", "oracle", None, "B", "L'Étang aux lunes",
           "La photo est une fenêtre en fleur de pommier ouverte sur un étang de nuit : les koïs tournent entre les feuilles de lotus, "
           "les ronds dans l'eau se croisent en interférences, les six phases de la lune s'arquent autour de la pleine lune du blason — "
           "et, à la surface, flotte l'infime : grains de pollen hérissés et diatomées aux coques de verre, dont quatre rosaces "
           "ferment les angles de la fenêtre.",
           "feuilles de lotus : Mee (bisou volé) et Meo (salut)", "Sous la même lune")


# ---------------------------------------------------------------- C : la grue et les flocons

def pine(card, x, y, ang, L, seed=1, snow=True):
    """Branche de pin sous la neige : rameau noueux, éventails d'aiguilles, coussins de neige."""
    rnd = random.Random(seed)
    a = math.radians(ang)
    pts = [(x, y)]
    for i in range(1, 5):
        pts.append((x + math.cos(a) * L * i / 4 + rnd.uniform(-8, 8), y + math.sin(a) * L * i / 4 + rnd.uniform(-8, 8)))
    out = [branch(card, pts, 9, 2, "#2A1A12", "#5A3A24")]
    sp, _ = spine(pts, 30)
    for i in range(6, 30, 4):
        bx, by, ba = sp[i]
        for side in (-1, 1):
            cx, cy = bx + math.cos(ba + side * 0.9) * 16, by + math.sin(ba + side * 0.9) * 16
            needles = "".join(f'<line x1="{fmt(cx)}" y1="{fmt(cy)}" x2="{fmt(cx + math.cos(t) * 15)}" y2="{fmt(cy + math.sin(t) * 15)}" stroke="#1E5A3A" stroke-width="1.3"/>'
                              for t in [ba + side * 0.9 + (j - 6) * 0.22 for j in range(13)])
            out.append(f'<line x1="{fmt(bx)}" y1="{fmt(by)}" x2="{fmt(cx)}" y2="{fmt(cy)}" stroke="#3A2A1A" stroke-width="1.6"/>' + needles)
            if snow:
                out.append(f'<ellipse cx="{fmt(cx)}" cy="{fmt(cy - 6)}" rx="12" ry="4.5" fill="#F4F8FF" opacity="0.95"/>')
    return "".join(out)


def window_frost(c):
    """Le givre qui prend la fenêtre en cloche : des aiguilles de glace poussent du cadre, se ramifient à 60°, et s'arrêtent avant les visages."""
    rnd = random.Random(44)
    seeds = []
    for y in range(400, 716, 26):
        seeds.append((84, y, 180 + rnd.uniform(-35, 35), rnd.uniform(26, 44), 2))
        seeds.append((456, y + 13, rnd.uniform(-35, 35), rnd.uniform(26, 44), 2))
    for y in (470, 560, 640, 700):
        seeds.append((86, y, rnd.uniform(-25, 25), rnd.uniform(22, 34), 2))
        seeds.append((454, y - 20, 180 + rnd.uniform(-25, 25), rnd.uniform(22, 34), 2))
    for x, y, a in ((80, 382, 210), (78, 330, 200), (100, 296, 235), (150, 278, 250), (200, 258, 260), (240, 240, 265),
                    (460, 382, 330), (462, 330, 340), (440, 296, 305), (390, 278, 290), (340, 258, 280), (300, 240, 275)):
        seeds.append((x, y, a + rnd.uniform(-12, 12), rnd.uniform(24, 40), 2))
    for x, y, a in ((88, 712, 300), (452, 712, 240), (90, 690, 330), (450, 690, 210)):
        seeds.append((x, y, a, 46, 3))
    avoid = lambda x, y: 124 < x < 416 and 300 < y < 690
    f = frost(seeds, "#F2F8FF", 1.4, 7, avoid, 0.7)
    return (f'<g filter="{c.blur("frost-g", 3)}" opacity="0.7">' + f.replace('stroke="#F2F8FF"', 'stroke="#9FD0FF"') + "</g>" + f'<g opacity="0.92">{f}</g>')


def orcC():
    c = start("ocC", "#2A3040", "#0A0C14", "#DDE8FF")
    win = win_kato(84, 232, 456, 716, 12)
    sky(c, [(0, "#020414"), (0.45, "#0E1840"), (0.8, "#1E2A5A"), (1, "#0A0E24")], H, win)
    m = mask_out(c, win)
    n = len(c.body)
    stars(c, 88, 150, (0, 0, W, H), "#FFFFFF", 1.3)
    grus = [(372, 40), (400, 66), (430, 84), (452, 112), (488, 104), (520, 120), (424, 120), (404, 150), (470, 74)]
    c.add(constellation(grus, [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (2, 6), (6, 7), (2, 8)], "#CFE0FF", 0.55, 1.8, 0.8, bright=(3, 6)))
    c.add(f'<text x="470" y="160" text-anchor="middle" font-family="{CINZEL}" font-size="9" letter-spacing="2" fill="#CFE0FF" opacity="0.7">GRUS</text>')
    c.add(karst(c, -20, 560, 900, [(20, 330, 34), (90, 220, 30), (450, 250, 30), (528, 360, 34)], "#3A4A72", "#9AAAD0", seed=2, rough=2))
    c.add(karst(c, -20, 560, 900, [(0, 200, 26), (60, 140, 26), (490, 170, 26), (548, 230, 28)], "#E4ECFF", "#5A6A9A", seed=5, rough=1.5))
    c.add(f'<rect x="0" y="860" width="{W}" height="100" fill="{c.grad("mistC", [(0, "#AAB8E0"), (1, "#1E2A5A")])}" opacity="0.9"/>')
    rnd = random.Random(12)
    for _ in range(40):
        x, y = rnd.uniform(0, W), rnd.uniform(200, 940)
        c.add(f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(rnd.uniform(0.8, 2.2))}" fill="#FFFFFF" opacity="{fmt(rnd.uniform(0.4, 0.9))}"/>')
    since(c, n, f'mask="{m}"')
    c.add(f'<path d="{win}" fill="none" stroke="#DDE8FF" stroke-width="14" opacity="0.18" filter="{c.blur("kw", 5)}"/>')
    c.add(f'<path d="{win}" fill="none" stroke="#141A30" stroke-width="12"/>')
    frame_window(c, win, "silver", 3, 16, 0.75)
    c.add(sakura_branch(c, [(560, 600), (500, 586), (468, 560), (452, 520)], 9, 21, 9, (5, 8), 2, "#FFFFFF", "#E0405A"))
    c.add(sakura_branch(c, [(-20, 470), (30, 452), (70, 420)], 7, 23, 6, (5, 7), 1, "#FFFFFF", "#E0405A"))
    for (x, y, r, d, sd) in ((40, 300, 26, 3, 1), (506, 400, 20, 3, 2), (24, 600, 15, 2, 3), (514, 640, 12, 2, 4)):
        c.add(f'<circle cx="{x}" cy="{y}" r="{r * 1.5}" fill="{c.rgrad("sf-g", [(0, "#BFD8FF", 0.35), (1, "#BFD8FF", 0)])}"/>')
        c.add(snowflake(x, y, r, "#EEF5FF", 1.2 if r > 15 else 0.9, d, sd * 7, 0.95, sd))
    inner_shadow(c, win, 12, 0.32, "#DDEEFF")
    c.add(window_frost(c))
    c.add(moon(c, 270, 142, 68, 0.55, ("#FFFFFF", "#E6EEF8", "#A4B2C8")))
    c.add(crane(c, 130, 236, 0.95, False, -8))
    c.add(crane(c, 430, 196, 0.48, True, 6, op=0.9), crane(c, 470, 236, 0.36, True, 4, op=0.8))
    vignette(c, "#01020A", 0.35)
    crest(c, 270, 142, 0.74, "silver", division=None, gem=GEM, ink="#2A3A5A")
    plate(c, "Oracle", y=760, style="argent")
    duo(c, [(76, 756, 106, False, -4), (464, 756, 106, True, 4)], "mee-montee-au-ciel", "meo-bravo")
    finish(c, "oracle-c", "oracle", None, "C", "La Grue et les flocons",
           "Une nuit d'hiver à travers une fenêtre en cloche de temple : trois grues du Japon passent devant la pleine lune, la constellation "
           "de la Grue (Grus) s'allume, la montagne enneigée sort de la brume, des pruniers fleurissent sous la neige — et le givre prend "
           "la fenêtre : de son cadre poussent des aiguilles de glace qui se ramifient à soixante degrés, la fractale même du cristal "
           "que l'on retrouve, en grand, dans chaque flocon.",
           "pied : Mee (montée au ciel) et Meo (bravo)", None)


def build():
    orcA()
    orcB()
    orcC()
