"""Mythe A, B, C : du quark au quasar — toute l'échelle de l'univers dans un cadre, l'Empire céleste en incrustations."""

from beasts import *  # noqa: F401,F403
from archi import *  # noqa: F401,F403
from cosmos import *  # noqa: F401,F403
from scales import *  # noqa: F401,F403
from amb import sky

TITLE = "Mythe nº 42"
NUM = "Nº 42 / 100"


def myth_crest(c, cy=150, s=0.84, halo="#E9DDFF"):
    c.add(f'<circle cx="270" cy="{cy}" r="{fmt(92 * s)}" fill="{c.rgrad("my-halo", [(0, halo, 0.55), (1, halo, 0)])}"/>')
    crest(c, 270, cy, s, "prism", None, gem="#FFFFFF", ink="#3A2A8A", edge="#FFFFFF")


def pow10(n):
    n = n.replace("-", "−")
    return f'10<tspan dy="-3.4" font-size="6.4">{n}</tspan><tspan dy="3.4" font-size="7.4"> m</tspan>'


def scale_lantern(c, cx, cy, r, content, label, power, cord=24, ring=None):
    """Lanterne-médaillon : une vitre ronde montrant une échelle de l'univers, coiffes d'or, gland, étiquette."""
    gold = c.metal("gold")[0]
    ring = ring or c.prism("ml-prism", 0, 0, 1, 1)
    out = [f'<line x1="{fmt(cx)}" y1="{fmt(cy - r - 6)}" x2="{fmt(cx)}" y2="{fmt(cy - r - cord)}" stroke="#C9B48A" stroke-width="1"/>',
           f'<rect x="{fmt(cx - r * 0.5)}" y="{fmt(cy - r - 7)}" width="{fmt(r)}" height="7" rx="2" fill="{gold}"/>',
           f'<rect x="{fmt(cx - r * 0.45)}" y="{fmt(cy + r)}" width="{fmt(r * 0.9)}" height="6" rx="2" fill="{gold}"/>']
    for k in range(-2, 3):
        out.append(f'<line x1="{fmt(cx + k)}" y1="{fmt(cy + r + 6)}" x2="{fmt(cx + k * 2.4)}" y2="{fmt(cy + r + 22)}" stroke="#E8372A" stroke-width="1.2"/>')
    out.append(scale_medallion(c, cx, cy, r, content, None, None, ring="#E9DDFF"))
    out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r)}" fill="none" stroke="{ring}" stroke-width="2"/>')
    out.append(f'<text x="{fmt(cx)}" y="{fmt(cy + r + 34)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="8" letter-spacing="1.2" fill="#FFFFFF">{esc(label)}</text>')
    out.append(f'<text x="{fmt(cx)}" y="{fmt(cy + r + 44)}" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="8" fill="#E9DDFF">{power}</text>')
    return "".join(out)


# ---------------------------------------------------------------- A : le dragon et le quasar

def mytA():
    c = start("myA", "#241E38", "#0A0814", "#E0D0FF")
    win = win_rect(100, 268, 440, 712, 16)
    sky(c, [(0, "#03020F"), (0.5, "#0E0A2A"), (1, "#03020F")], H, win)
    m = mask_out(c, win)
    n = len(c.body)
    nebula(c, "nA1", 270, 140, 240, 150, "#7A3AC8", "#1A0A3A", 0.55)
    nebula(c, "nA2", 480, 600, 140, 260, "#2A6AC8", "#0A1A3A", 0.45)
    nebula(c, "nA3", 60, 600, 140, 260, "#C83A8A", "#3A0A2A", 0.4)
    stars(c, 606, 220, (0, 0, W, H), "#FFFFFF", 1.4, keep_photo_clear=False)
    c.add(cosmic_web(c, (440, 300, 560, 900), 13, 22, "#8FB0FF", "#FFE9F7", 3, 0.5))
    c.add(quantum_foam(c, (-10, 300, 100, 900), 5, 60, "#E0B0FF", op=0.5))
    c.add(f'<circle cx="270" cy="140" r="150" fill="{c.rgrad("gal-g", [(0, "#FFF4E0", 0.7), (0.2, "#FFB8E0", 0.35), (1, "#6A3AC8", 0)])}"/>')
    c.add(galaxy(270, 140, 150, "#FFD8F0", 3, 0.42, -0.3, 42, 900, "#FFFFFF"))
    c.add(galaxy(270, 140, 120, "#BFD8FF", 3, 0.42, 0.75, 43, 500, "#FFFFFF"))
    since(c, n, f'mask="{m}"')
    frame_window(c, win, "prism", 3, 16, 0.8)
    c.add(f'<path d="{win}" fill="none" stroke="{c.prism("wA", 0, 0, 1, 1)}" stroke-width="3"/>')
    ctrl = [(118, 104), (196, 56), (300, 42), (410, 64), (470, 130), (440, 200), (340, 238), (220, 240), (120, 222), (70, 190), (46, 250)]
    c.add(dragon(c, ctrl, 1.0, DRAGON_GOLD, "myA", n=200, wmax=24, legs=(0.3, 0.62), v=1, glow="#FFD27A", leg_len=0.8))
    c.add(f'<circle cx="40" cy="214" r="70" fill="{c.rgrad("qA-halo", [(0, "#BFE8FF", 0.5), (0.4, "#9FD8FF", 0.16), (1, "#9FD8FF", 0)])}"/>')
    c.add(quasar(c, 40, 214, 15, 8, "#9FE8FF", 6))
    for (cx, cy, content, label, power) in (
        (44, 360, nucleus(c, 44, 360, 13, n=11), "NOYAU", pow10("-14")),
        (44, 500, particle_tracks(44, 500, 4, 7, "#9FE8FF", 0.35), "PARTICULES", pow10("-18")),
        (44, 640, quantum_foam(c, (20, 616, 68, 664), 7, 14, "#E0B0FF", op=0.8) + string_loop(44, 640, 13, 6, 0.2, "#FFB0E8", 1.3), "CORDES", pow10("-35")),
        (496, 360, black_hole(c, 496, 360, 8, 0.3, -12), "TROU NOIR", pow10("13")),
        (496, 500, galaxy_cluster(496, 500, 22, 6), "AMAS", pow10("23")),
        (496, 640, cosmic_web(c, (470, 616, 522, 664), 3, 12, "#8FB0FF", "#FFE9F7", 2, 0.9), "TOILE", pow10("25")),
    ):
        c.add(scale_lantern(c, cx, cy, 26, content, label, power))
    c.add(string_loop(44, 760, 12, 6, 0.2, "#FFB0E8", 1.2), string_loop(496, 760, 10, 5, 0.25, "#9FE8FF", 1.2))
    vignette(c, "#02020A", 0.25)
    myth_crest(c, 140, 0.8)
    plate(c, TITLE, message="Du quark au quasar", y=760, style="prisme", numero=NUM, title_size=36, w=380)
    duo(c, [(96, 748, 104, False, -4), (452, 754, 104, True, 4)], "mee-wow", "meo-feu-artifice")
    finish(c, "mythe-a", "mythe", None, "A", "Le Dragon et le quasar",
           "Le dragon d'or s'enroule autour d'une galaxie spirale et la perle qu'il poursuit est devenue un quasar aux jets relativistes. "
           "De part et d'autre de la photo pendent des lanternes-médaillons : à gauche l'infime (noyau, traces de particules, mousse "
           "quantique, cordes), à droite l'immense (trou noir, amas, toile cosmique), sur un fond de nébuleuses et de filaments.",
           "pied : Mee (wow) et Meo (feu d'artifice)", "Du quark au quasar")


# ---------------------------------------------------------------- B : la pagode des échelles

def tower(c, cx, base, tiers, w=84, tier_h=96, glaze=GLAZE_JADE, uid="t"):
    """Pagode à six étages : chaque étage ouvre une fenêtre ronde sur une échelle de l'univers."""
    out = []
    y = base
    for k, (content, label, power) in enumerate(tiers):
        bw = w * (1 - k * 0.04)
        top = y - tier_h
        body_top = top + 22
        out.append(f'<rect x="{fmt(cx - bw / 2)}" y="{fmt(body_top)}" width="{fmt(bw)}" height="{fmt(y - body_top)}" fill="{c.grad("tw-wall", [(0, VERM_D), (0.3, VERM), (0.5, VERM_HI), (0.7, VERM), (1, VERM_D)], 0, 0, 1, 0)}"/>')
        out.append(f'<rect x="{fmt(cx - bw / 2 + 4)}" y="{fmt(body_top + 4)}" width="{fmt(bw - 8)}" height="{fmt(y - body_top - 8)}" fill="none" stroke="{GOLD}" stroke-width="0.9"/>')
        mcy = body_top + 28
        out.append(scale_medallion(c, cx, mcy, 23, content, None, None, ring="#FFE7A0"))
        sh = c.shadow("tw-txt", 0, 0.8, 1, "#000000", 0.9)
        out.append(f'<text x="{fmt(cx)}" y="{fmt(mcy + 34)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="7.6" letter-spacing="0.8" fill="#FFF1D0" filter="{sh}">{esc(label)}</text>')
        out.append(f'<text x="{fmt(cx)}" y="{fmt(mcy + 43)}" text-anchor="middle" font-family="{SANS}" font-weight="700" font-size="7.4" fill="#FFE7A0" filter="{sh}">{power}</text>')
        r, _, _ = roof(c, cx, top + 6, bw * 0.62, 18, glaze, 0.4, 6, ridge=False, uid=f"{uid}{k}")
        out.append(r)
        y = top + 6
    out.append(f'<line x1="{fmt(cx)}" y1="{fmt(y)}" x2="{fmt(cx)}" y2="{fmt(y - 44)}" stroke="{GOLD}" stroke-width="2.4"/>')
    for k in range(5):
        out.append(f'<ellipse cx="{fmt(cx)}" cy="{fmt(y - 8 - k * 7)}" rx="{fmt(7 - k)}" ry="2" fill="{GOLD}"/>')
    out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(y - 48)}" r="5" fill="{c.prism("tw-p", 0, 0, 1, 1)}"/>')
    return "".join(out)


def gate_lintel(c, y, x0, x1):
    """Le linteau du portique (pailou) posé sur les deux pagodes : toit vernissé, poutre de laque, inscription d'or."""
    cx = (x0 + x1) / 2
    out = []
    r, _, _ = roof(c, cx, y - 30, (x1 - x0) / 2 * 0.86, 22, GLAZE_JADE, 0.42, 8, ridge=True, pearl=False, uid="lin")
    out.append(r)
    beam = c.grad("lin-beam", [(0, VERM_HI), (0.45, VERM), (1, VERM_D)])
    out.append(f'<rect x="{x0}" y="{y - 10}" width="{x1 - x0}" height="30" rx="3" fill="{beam}" stroke="{GOLD}" stroke-width="1.6"/>')
    out.append(f'<rect x="{x0 + 5}" y="{y - 6}" width="{x1 - x0 - 10}" height="22" fill="none" stroke="{GOLD}" stroke-width="0.7" opacity="0.8"/>')
    out.append(f'<rect x="{cx - 112}" y="{y - 7}" width="224" height="24" rx="2" fill="#140608" stroke="{GOLD}" stroke-width="1.2"/>')
    out.append(f'<text x="{cx}" y="{y + 10}" text-anchor="middle" font-family="{CINZEL}" font-weight="700" font-size="12.5" letter-spacing="3.2" '
               f'fill="{c.metal("gold")[0]}">DU QUARK AU QUASAR</text>')
    for ex in (48, 492):
        out.append(f'<rect x="{ex - 6}" y="{y + 20}" width="12" height="{116}" fill="{c.grad("lin-post", [(0, VERM_D), (0.5, VERM_HI), (1, VERM_D)], 0, 0, 1, 0)}" stroke="{GOLD}" stroke-width="0.8"/>')
        for yy in (y + 40, y + 76, y + 112):
            out.append(f'<rect x="{ex - 8}" y="{yy}" width="16" height="4" rx="1" fill="{GOLD}"/>')
    for k in range(2):
        for ex in (x0 + 70 + k * 40, x1 - 70 - k * 40):
            out.append(f'<circle cx="{ex}" cy="{y + 5}" r="5" fill="{c.prism("lin-gem", 0, 0, 1, 1)}" stroke="{GOLD}" stroke-width="0.8"/>')
    return "".join(out)


def mytB():
    c = start("myB", "#26203A", "#0A0814", "#E0D0FF")
    win = win_rect(104, 270, 436, 712, 14)
    sky(c, [(0, "#04031A"), (0.45, "#120C36"), (1, "#05041A")], H, win)
    m = mask_out(c, win)
    n = len(c.body)
    c.add(milky_way(c, [(-40, 200), (200, 120), (380, 60), (600, 20)], 120, 77, n=800, op=0.8))
    stars(c, 707, 160, (0, 0, W, H), "#FFFFFF", 1.3, keep_photo_clear=False)
    nebula(c, "nB1", 270, 120, 220, 120, "#B04AC8", "#1A0A3A", 0.45)
    since(c, n, f'mask="{m}"')
    frame_window(c, win, "prism", 3, 16, 0.8)
    c.add(f'<path d="{win}" fill="none" stroke="{c.prism("wB", 0, 0, 1, 1)}" stroke-width="3"/>')
    specs_left = [(lambda x, y: cell(c, x, y, 18, 3), "CELLULE", pow10("-5")),
                  (lambda x, y: dna(c, x - 18, y + 12, x + 18, y - 12, 1.5, 6, lw=1.4), "ADN", pow10("-9")),
                  (lambda x, y: atom(c, x, y, 18, "#9FE8FF"), "ATOME", pow10("-10")),
                  (lambda x, y: nucleus(c, x, y, 11, n=11), "NOYAU", pow10("-14")),
                  (lambda x, y: particle_tracks(x, y, 9, 6, "#9FE8FF", 0.3) + quarks(c, x, y, 9), "QUARKS", pow10("-18")),
                  (lambda x, y: string_loop(x, y, 12, 6, 0.2, "#FFB0E8", 1.2) + quantum_foam(c, (x - 22, y - 22, x + 22, y + 22), 3, 14, "#E0B0FF", op=0.8), "CORDES", pow10("-35"))]
    specs_right = [(lambda x, y: planet(c, x, y, 14, "#BFE8FF", "#1E5AA8", bands=False) + f'<circle cx="{fmt(x + 5)}" cy="{fmt(y - 4)}" r="4" fill="#5ACB7A" opacity="0.8"/>', "TERRE", pow10("7")),
                   (lambda x, y: f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="16" fill="{c.rgrad("sun-t", [(0, "#FFFFFF", 1), (0.5, "#FFD27A", 1), (1, "#FF7A30", 1)])}"/>', "SOLEIL", pow10("9")),
                   (lambda x, y: black_hole(c, x, y, 7, 0.3, -12), "TROU NOIR", pow10("13")),
                   (lambda x, y: galaxy(x, y, 22, "#FFD8F0", 2, 0.5, 0.2, 9, 160), "GALAXIE", pow10("21")),
                   (lambda x, y: galaxy_cluster(x, y, 16, 5), "AMAS", pow10("23")),
                   (lambda x, y: cosmic_web(c, (x - 24, y - 24, x + 24, y + 24), 8, 12, "#8FB0FF", "#FFE9F7", 2, 0.9), "TOILE COSMIQUE", pow10("25"))]

    def build_tiers(cx, specs):
        out = []
        y = 900
        for k, (fn, label, power) in enumerate(specs):
            top = y - 96
            mcy = top + 22 + 28
            out.append((fn(cx, mcy), label, power))
            y = top + 6
        return out

    c.add(gate_lintel(c, 236, 14, 526))
    c.add(tower(c, 48, 900, build_tiers(48, specs_left), uid="tl"))
    c.add(tower(c, 492, 900, build_tiers(492, specs_right), glaze=GLAZE_GOLD, uid="tr"))
    c.add(f'<circle cx="474" cy="70" r="60" fill="{c.rgrad("qB-halo", [(0, "#BFE8FF", 0.45), (1, "#9FD8FF", 0)])}"/>')
    c.add(quasar(c, 474, 70, 11, -40, "#9FE8FF", 6.5))
    c.add(galaxy(74, 70, 44, "#FFD8F0", 2, 0.42, 0.5, 21, 320))
    vignette(c, "#02020A", 0.2)
    myth_crest(c, 128, 0.78)
    plate(c, TITLE, y=770, style="prisme", numero=NUM, title_size=34, w=330)
    duo(c, [(140, 750, 96, False, -4), (400, 750, 96, True, 4)], "mee-sourire", "meo-roi")
    finish(c, "mythe-b", "mythe", None, "B", "La Pagode des échelles",
           "Deux pagodes à six étages encadrent la photo et chaque étage ouvre sa fenêtre sur une puissance de dix : à gauche on descend "
           "de la cellule à l'ADN, à l'atome, au noyau, aux quarks et aux cordes ; à droite on monte de la Terre au Soleil, au trou noir, "
           "à la galaxie, à l'amas et à la toile cosmique. Les deux tours portent le linteau d'un portique (pailou) gravé « Du quark au "
           "quasar » ; au-dessus, une galaxie spirale et un quasar aux jets relativistes.",
           "pied : Mee (sourire) et Meo (roi) au pied des pagodes", None)


# ---------------------------------------------------------------- C : les anneaux de jade

def mytC():
    c = start("myC", "#22202E", "#08070E", "#E8DCC8")
    cx, cy, rx, ry = 270, 484, 166, 212
    win = win_moon(cx, cy, rx, ry)
    sky(c, [(0, "#05040C"), (0.5, "#0C0A1C"), (1, "#040308")], H, win)
    m = mask_out(c, win)
    n = len(c.body)
    nebula(c, "nC1", 70, 300, 170, 250, "#7A3AC8", "#1A0A3A", 0.5)
    nebula(c, "nC2", 480, 640, 160, 260, "#2A8AA8", "#0A1A3A", 0.45)
    nebula(c, "nC3", 270, 110, 240, 120, "#C8883A", "#2A1A0A", 0.4)
    stars(c, 808, 200, (0, 0, W, H), "#FFFFFF", 1.3, keep_photo_clear=False)
    c.add(cosmic_web(c, (0, 0, W, H), 31, 46, "#E8C68A", "#FFF1D0", 2, 0.22))
    c.add(galaxy(494, 912, 46, "#FFD8F0", 2, 0.46, 0.9, 14, 460, "#FFFFFF"))
    c.add(galaxy_cluster(478, 92, 34, 11))
    c.add(f'<circle cx="62" cy="80" r="64" fill="{c.rgrad("qC-halo", [(0, "#BFE8FF", 0.45), (1, "#9FD8FF", 0)])}"/>')
    c.add(quasar(c, 62, 80, 11, 32, "#9FE8FF", 6))
    c.add(quantum_foam(c, (0, 800, 90, 960), 9, 30, "#B9A7FF", op=0.55))
    c.add(particle_tracks(40, 900, 21, 8, "#FFE7A0", 0.75, 0.8, colors=("#FFE7A0", "#FFB0E8", "#9FE8FF")))
    c.add(nucleus(c, 40, 900, 13, n=13))
    since(c, n, f'mask="{m}"')
    # l'anneau d'orbite : électrons à gauche, planètes à droite — l'atome et le système solaire
    orx, ory = rx + 80, ry + 80
    c.add(f'<path d="{win_moon(cx, cy, orx, ory)}" fill="none" stroke="#BFD8FF" stroke-width="1" stroke-dasharray="1.5 4" opacity="0.7"/>')
    c.add(f'<path d="{win_moon(cx, cy, orx, ory)}" fill="none" stroke="{c.prism("orbC", 0, 0, 1, 1)}" stroke-width="0.6" opacity="0.8"/>')
    for deg in (204, 232, 262, 292, 322):
        x, y = cx + orx * math.sin(math.radians(deg)), cy - ory * math.cos(math.radians(deg))
        c.add(f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="11" fill="{c.rgrad("eC", [(0, "#BFF3FF", 0.75), (1, "#7FD8FF", 0)])}"/>'
              f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="3.2" fill="#FFFFFF"/>' + sparkle(x, y, 9, "#FFFFFF", 0.8))
    for deg, r, c1, c2, ring in ((40, 13, "#FFE2A0", "#C8701A", "#F2D9A0"), (74, 9, "#BFE8FF", "#1E5AA8", None), (112, 11, "#FFB89A", "#8A2A1A", None), (146, 7, "#E9DDFF", "#5A3AA8", None)):
        x, y = cx + orx * math.sin(math.radians(deg)), cy - ory * math.cos(math.radians(deg))
        c.add(planet(c, x, y, r, c1, c2, ring=ring))
    # la double hélice qui fait le tour
    c.add(helix_along(c, ellipse_pts(cx, cy, rx + 50, ry + 50, 360), 30, 7, ("#9FE8FF", "#FFB0E8"), lw=1.8, n=720, glow="#B9A7FF", rung_every=4, dense=True))
    # le disque de jade bi, dont les grains sont des galaxies
    bi = win_moon(cx, cy, rx + 32, ry + 32)
    c.add(f'<path d="{bi}" fill="none" stroke="#000000" stroke-width="12" opacity="0.5" filter="{c.blur("biC-sh", 6)}"/>')
    c.add(f'<path d="{bi} {win}" fill-rule="evenodd" fill="{c.grad("biC", [(0, "#BFF3DA"), (0.3, "#3FB68B"), (0.55, "#0E5A43"), (0.8, "#2E9E74"), (1, "#BFF3DA")], 0, 0, 1, 1)}"/>')
    c.add(f'<path d="{bi} {win}" fill-rule="evenodd" fill="{lg(c, [(0, "#FFFFFF", 0.0), (0.4, "#FFFFFF", 0.0), (0.5, "#FFFFFF", 0.28), (0.6, "#FFFFFF", 0.0)], 0, 0, 1, 1, name="biC-sheen")}"/>')
    c.add(gu_spirals(c, bi, win, cx, cy, rx + 3, ry + 3, rx + 29, ry + 29, "#E6FFF2", 2, 34, 5.2, 0.8, 3))
    c.add(f'<path d="{bi}" fill="none" stroke="{c.metal("gold")[0]}" stroke-width="2.6"/>')
    frame_window(c, win, "gold", 2.6, 16, 0.8)
    c.add(f'<path d="{win}" fill="none" stroke="{c.prism("winC", 0, 0, 1, 1)}" stroke-width="1.2"/>')
    drag = [(150, 44), (178, 30), (206, 40), (226, 26)]
    c.add(asterism(drag, [(0, 1), (1, 2), (2, 3)], "#FFE7A0", "#FFD27A", 1.8, 0.8, 0.5, (1.6, 1, 1, 1.2)))
    crane_c = [(316, 26), (340, 40), (364, 30), (388, 46), (352, 58)]
    c.add(asterism(crane_c, [(0, 1), (1, 2), (2, 3), (1, 4)], "#CFE0FF", "#9FC8FF", 1.8, 0.8, 0.5, (1, 1.6, 1, 1, 1)))
    c.add(f'<circle cx="270" cy="124" r="120" fill="{c.rgrad("bhC-g", [(0, "#FFE7A0", 0.25), (1, "#FFE7A0", 0)])}"/>')
    c.add(black_hole(c, 270, 124, 42, 0.24, -8, ("#FFFFFF", "#FFE9B0", "#E8B53C", "#8A4A1A")))
    vignette(c, "#000000", 0.25)
    myth_crest(c, 124, 0.72, "#FFE7A0")
    plate(c, TITLE, message="Plus loin que les étoiles", y=772, style="prisme", numero=NUM, title_size=34, w=400)
    duo(c, [(84, 748, 110, False, -4), (456, 748, 110, True, 4)], "mee-danse", "meo-serenade")
    finish(c, "mythe-c", "mythe", None, "C", "Les Anneaux de jade",
           "La photo est au cœur d'un disque de jade bi, et chaque anneau change d'échelle : les grains du jade, vus de loin, sont des "
           "galaxies ; autour court une double hélice d'ADN ; plus loin une même orbite porte des électrons d'un côté et des planètes de "
           "l'autre — l'atome et le système solaire. Au-dessus, un trou noir d'or et d'encre, un quasar, un amas et les astérismes du "
           "Dragon et de la Grue ; en bas, les traces d'un noyau dans la chambre à bulles, la mousse quantique et une galaxie spirale.",
           "pied : Mee (danse) et Meo (sérénade)", "Plus loin que les étoiles")


def build():
    mytA()
    mytB()
    mytC()
