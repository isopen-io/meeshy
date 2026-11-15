"""Orateur A, B, C : la voix et la lumière — lanternes, phénix de l'aube, carillon de bronze."""

from beasts import *  # noqa: F401,F403
from archi import *  # noqa: F401,F403
from amb import sky, skyline

GEM = "#3FD6A0"


def pagoda_silhouette(card, cx, base, w, tiers, color, lit="#FFC870", tier_h=48, glow=True):
    """Pagode à étages en ombre chinoise, fenêtres allumées."""
    out = []
    y = base
    ww = w
    for k in range(tiers):
        out.append(f'<rect x="{fmt(cx - ww * 0.36)}" y="{fmt(y - tier_h * 0.62)}" width="{fmt(ww * 0.72)}" height="{fmt(tier_h * 0.62)}" fill="{color}"/>')
        for j in (-1, 0, 1):
            out.append(f'<rect x="{fmt(cx + j * ww * 0.2 - 2.5)}" y="{fmt(y - tier_h * 0.5)}" width="5" height="{fmt(tier_h * 0.3)}" rx="2" fill="{lit}" opacity="0.85"/>')
        ry = y - tier_h * 0.62
        out.append(f'<path d="M{fmt(cx - ww * 0.62)} {fmt(ry - 2)} Q{fmt(cx - ww * 0.4)} {fmt(ry - 6)} {fmt(cx - ww * 0.22)} {fmt(ry - tier_h * 0.38)} L{fmt(cx + ww * 0.22)} {fmt(ry - tier_h * 0.38)} '
                   f'Q{fmt(cx + ww * 0.4)} {fmt(ry - 6)} {fmt(cx + ww * 0.62)} {fmt(ry - 2)} L{fmt(cx + ww * 0.56)} {fmt(ry + 4)} L{fmt(cx - ww * 0.56)} {fmt(ry + 4)}Z" fill="{color}"/>')
        y = ry - tier_h * 0.38
        ww *= 0.86
    out.append(f'<line x1="{fmt(cx)}" y1="{fmt(y)}" x2="{fmt(cx)}" y2="{fmt(y - 34)}" stroke="{color}" stroke-width="3"/>')
    for k in range(4):
        out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(y - 8 - k * 7)}" r="{fmt(4 - k * 0.6)}" fill="{color}"/>')
    return "".join(out)


def garland(card, x0, y0, x1, y1, sag, n, s, seed=1):
    """Guirlande de lanternes rondes sur un fil en chaînette."""
    out = []
    pts = []
    for i in range(41):
        t = i / 40
        pts.append((lerp(x0, x1, t), lerp(y0, y1, t) + sag * 4 * t * (1 - t)))
    out.append(f'<path d="{poly_d(pts, False)}" fill="none" stroke="#2A1408" stroke-width="1.2"/>')
    for k in range(n):
        t = (k + 0.5) / n
        x, y = lerp(x0, x1, t), lerp(y0, y1, t) + sag * 4 * t * (1 - t)
        out.append(lantern(card, x, y + 22 * s + 6, s, cord=10, glow=True))
    return "".join(out)


# ---------------------------------------------------------------- A : la nuit des mille lanternes

def oraA():
    c = start("orA", "#2E2234", "#0E0A14", "#FFC98A")
    win = win_rect(86, 262, 454, 720, 16)
    sky(c, [(0, "#05061C"), (0.35, "#141C4E"), (0.7, "#3A2462"), (1, "#5A2A5A")], H, win)
    m = mask_out(c, win)
    n = len(c.body)
    c.add(f'<circle cx="270" cy="150" r="260" fill="{c.rgrad("halo-a", [(0, "#FFE2A0", 0.6), (0.35, "#FF9A50", 0.22), (1, "#FF7A40", 0)])}"/>')
    c.add(rays(270, 150, 60, 420, 64, "#FFD98A", 1.4, -180, 180, 0.55).replace("<line", '<line opacity="0.22"'))
    stars(c, 5, 110, (0, 0, W, H), "#FFF4D0", 1.3)
    rnd = random.Random(14)
    for _ in range(46):
        x, y = rnd.uniform(0, W), rnd.uniform(20, 860)
        if 70 < x < 470 and 250 < y < 730:
            continue
        sc = 0.35 + (y / 960) * 0.9
        c.add(sky_lantern(c, x, y, sc * rnd.uniform(0.8, 1.2), op=rnd.uniform(0.7, 1)))
    c.add(pagoda_silhouette(c, 30, 900, 120, 7, "#140A1E"), pagoda_silhouette(c, 512, 900, 110, 6, "#140A1E"))
    since(c, n, f'mask="{m}"')
    c.add(f'<rect x="0" y="842" width="{W}" height="118" fill="{c.grad("river-a", [(0, "#1A1240"), (1, "#05040E")])}"/>')
    rnd = random.Random(3)
    c.add("".join(f'<rect x="{fmt(rnd.uniform(0, W))}" y="{fmt(rnd.uniform(850, 955))}" width="{fmt(rnd.uniform(2, 4))}" height="{fmt(rnd.uniform(8, 24))}" rx="2" fill="#FFB860" opacity="{fmt(rnd.uniform(0.2, 0.7))}"/>' for _ in range(60)))
    frame_window(c, win, "redgold", 3, 16, 0.8)
    c.add(f'<path d="{win}" fill="none" stroke="#FFC46A" stroke-width="10" opacity="0.25" filter="{c.blur("wa-g", 6)}"/>')
    c.add(garland(c, -10, 196, 230, 212, 46, 4, 0.62, 1), garland(c, 310, 212, 550, 196, 46, 4, 0.62, 2))
    vignette(c, "#05040E", 0.3)
    crest(c, 270, 150, 0.86, "redgold", division=None, gem=GEM)
    plate(c, "Orateur", message="Merci la team !", y=752, style="indigo")
    duo(c, [(68, 752, 108, False, -4), (472, 750, 110, True, 4)], "mee-danse", "meo-serenade")
    finish(c, "orateur-a", "orateur", None, "A", "La Nuit des mille lanternes",
           "La fête des lanternes : des centaines de lanternes célestes montent dans la nuit indigo, deux guirlandes de lanternes rouges "
           "se croisent au-dessus de la photo, les pagodes s'allument sur la rive et le blason rayonne comme une voix qui porte.",
           "pied : Mee (danse) et Meo (sérénade) sur la rive", "Merci la team !")


# ---------------------------------------------------------------- B : le phénix de l'aube

def oraB():
    c = start("orB", "#3A2A20", "#120A06", "#FFD08A")
    win = win_arch(90, 262, 450, 718, 14)
    sky(c, [(0, "#3A1046"), (0.18, "#A8325A"), (0.36, "#F2804A"), (0.55, "#FBC46A"), (0.75, "#F7A85A"), (1, "#8A3A3A")], H, win)
    m = mask_out(c, win)
    n = len(c.body)
    c.add(f'<circle cx="270" cy="150" r="200" fill="{c.rgrad("sun-b", [(0, "#FFFBE0", 1), (0.35, "#FFE7A0", 0.85), (0.6, "#FFB860", 0.3), (1, "#FF9040", 0)])}"/>')
    c.add(rays(270, 150, 150, 520, 48, "#FFF1C0", 3, -180, 180, 0.7).replace("<line", '<line opacity="0.18"'))
    c.add(karst(c, -20, 560, 860, [(20, 300, 40), (90, 210, 34), (450, 240, 36), (520, 320, 40), (270, 120, 60)], "#7A3A5A", "#F7A85A", seed=4))
    c.add(karst(c, -20, 560, 900, [(40, 200, 36), (140, 130, 40), (400, 150, 38), (500, 230, 36)], "#4A1E3A", "#C8704A", seed=7))
    c.add(f'<rect x="0" y="860" width="{W}" height="100" fill="{c.grad("mist-b", [(0, "#F7C9A0"), (1, "#5A2A3A")])}" opacity="0.85"/>')
    for x, y, s_, fl in ((40, 420, 14, False), (500, 520, 13, True), (30, 650, 12, False), (510, 760, 14, True), (120, 856, 16, False), (430, 870, 15, True)):
        c.add(cloud(c, x, y, s_, "#FFF4E6", "#C8704A", flip=fl, hi="#FFFFFF", op=0.92))
    since(c, n, f'mask="{m}"')
    tails = [
        ([(262, 200), (170, 250), (70, 330), (40, 470), (64, 600), (40, 712)], 16, "#E8B53C", "#D8321F"),
        ([(278, 200), (370, 250), (470, 330), (500, 470), (476, 600), (500, 712)], 16, "#E8B53C", "#D8321F"),
        ([(262, 204), (190, 270), (120, 360), (100, 480)], 11, "#3FB68B", "#E8B53C"),
        ([(278, 204), (350, 270), (420, 360), (440, 480)], 11, "#3FB68B", "#E8B53C"),
        ([(266, 206), (220, 250), (176, 290)], 8, "#E8B53C", "#3FB68B"),
        ([(274, 206), (320, 250), (364, 290)], 8, "#E8B53C", "#3FB68B"),
    ]
    frame_window(c, win, "redgold", 3.2, 16, 0.75)
    c.add(phoenix(c, 270, 172, 1.1, head_dir=1, tails=tails, spread=0.95, uid="phB", tilt=36,
                  neck=[(0, -10), (6, -40), (-4, -70), (8, -96)]))
    vignette(c, "#2A0A0A", 0.3)
    crest(c, 270, 178, 0.8, "redgold", division=None, gem=GEM)
    plate(c, "Orateur", y=756, style="laque-or")
    duo(c, [(72, 756, 108, False, -4), (470, 758, 108, True, 4)], "mee-wow", "meo-feu-artifice")
    finish(c, "orateur-b", "orateur", None, "B", "Le Phénix de l'aube",
           "Le fenghuang, oiseau de l'harmonie, se lève avec le soleil au-dessus des pitons dans la brume : ailes de vermillon et d'or "
           "déployées, aigrette à ocelles, et quatre longues rectrices qui descendent de part et d'autre de la photo, "
           "comme la voix qui s'élève et se répand.",
           "pied : Mee (wow) et Meo (feu d'artifice) dans les nuages", None)


# ---------------------------------------------------------------- C : le carillon et les cauris (Afrique)

def bell_rack(c, y, x0, x1, post_w=34):
    """Portique de carillon : poutre laquée vermillon, poteaux habillés de kente, glands de cauris."""
    out = []
    for px in (x0, x1):
        out.append(column(c, px, y, 900, post_w, uid=f"p{int(px)}", bands=False))
        for k, sy in enumerate((y + 60, y + 250, y + 440)):
            out.append(kente_band(c, px - post_w / 2 - 1, sy, post_w + 2, 34, seed=int(px) + k))
            out.append(f'<rect x="{fmt(px - post_w / 2 - 1)}" y="{fmt(sy)}" width="{fmt(post_w + 2)}" height="34" fill="{c.grad("post-sh", [(0, "#000000"), (0.4, "#FFFFFF"), (1, "#000000")], 0, 0, 1, 0)}" opacity="0.25"/>')
            out.append(f'<path d="M{fmt(px - 4)} {fmt(sy + 34)} l-5 26 l6 -4 l4 6Z" fill="#E8B53C"/><path d="M{fmt(px + 2)} {fmt(sy + 34)} l3 22 l4 -5 l2 6Z" fill="#1E7A3E"/>')
    beam = c.grad("rack", [(0, VERM_HI), (0.4, VERM), (1, VERM_D)])
    out.append(f'<rect x="{fmt(x0 - post_w)}" y="{fmt(y - 22)}" width="{fmt(x1 - x0 + 2 * post_w)}" height="28" rx="4" fill="{beam}" stroke="{GOLD}" stroke-width="1.6"/>')
    out.append(f'<rect x="{fmt(x0 - post_w + 6)}" y="{fmt(y - 14)}" width="{fmt(x1 - x0 + 2 * post_w - 12)}" height="12" fill="{fret(c, "frC", 12, GOLD, VERM_D, 1.1)}"/>')
    for ex, k in ((x0 - post_w, -1), (x1 + post_w, 1)):
        out.append(f'<path d="M{fmt(ex)} {fmt(y - 22)} q{fmt(k * 22)} -6 {fmt(k * 22)} 12 q0 14 {fmt(-k * 14)} 14 q{fmt(-k * 8)} 0 {fmt(-k * 8)} -8" fill="{VERM}" stroke="{GOLD}" stroke-width="1.6"/>')
    for kx in (x0 + 40, (x0 + x1) / 2 - 64, (x0 + x1) / 2 + 64, x1 - 40):
        out.append(kente_band(c, kx - 9, y - 22, 18, 28, seed=int(kx)))
    return "".join(out)


def cowrie_string(c, x, y0, n, step=11, rot=0):
    return f'<line x1="{fmt(x)}" y1="{fmt(y0)}" x2="{fmt(x)}" y2="{fmt(y0 + n * step)}" stroke="#3A1A08" stroke-width="1"/>' + "".join(cowrie(c, x, y0 + 6 + i * step, 0.62, rot) for i in range(n))


def oraC():
    c = start("orC", "#24302A", "#0A100E", "#FFD08A")
    win = win_rect(92, 282, 448, 718, 10)
    sky(c, [(0, "#04140F"), (0.3, "#0C3A2C"), (0.7, "#0A2A20"), (1, "#040C08")], H, win)
    m = mask_out(c, win)
    n = len(c.body)
    c.add(f'<circle cx="270" cy="130" r="300" fill="{c.rgrad("halo-c", [(0, "#FFF0B0", 0.6), (0.3, "#E8B53C", 0.25), (1, "#E8B53C", 0)])}"/>')
    for k in range(1, 13):
        r = 50 + k * 34
        c.add(f'<circle cx="270" cy="130" r="{r}" fill="none" stroke="#FFE7A0" stroke-width="{fmt(2.2 - k * 0.12)}" opacity="{fmt(0.55 - k * 0.035)}"/>')
    c.add(f'<rect x="0" y="0" width="{W}" height="{H}" fill="{asanoha(c, "asC", 26, None, "#E8B53C", 0.6)}" opacity="0.12"/>')
    since(c, n, f'mask="{m}"')
    c.add(f'<circle cx="270" cy="130" r="76" fill="none" stroke="{c.grad("bi", [(0, "#BFF3DA"), (0.5, JADE), (1, JADE_D)], 0, 0, 1, 1)}" stroke-width="22"/>')
    c.add(f'<circle cx="270" cy="130" r="76" fill="none" stroke="#FFFFFF" stroke-width="0.8" opacity="0.5" stroke-dasharray="2 5"/>')
    c.add(bell_rack(c, 236, 34, 506))
    frame_window(c, win, "redgold", 3.2, 16, 0.8)
    for i, (x, sc) in enumerate(((92, 1.0), (146, 1.1), (200, 1.2), (340, 1.2), (394, 1.1), (448, 1.0))):
        c.add(cowrie_string(c, x, 236, 2, 10))
        c.add(chime_bell(c, x, 290 + sc * 10, sc * 0.92, 0, uid=f"c{i}"))
    for x in (34, 506):
        c.add(cowrie_string(c, x, 214, 5, 10))
    c.add(f'<rect x="0" y="900" width="{W}" height="60" fill="#120804"/>')
    c.add(kente_band(c, 0, 900, W, 14, seed=9))
    c.add("".join(cowrie(c, 14 + i * 26, 934, 0.85, 90) for i in range(21)))
    vignette(c, "#020604", 0.3)
    crest(c, 270, 132, 0.8, "redgold", division=None, gem=GEM)
    plate(c, "Orateur", message="On l'a fait ensemble", y=756, style="jade")
    duo(c, [(80, 756, 108, False, -4), (466, 758, 108, True, 4)], "mee-bravo", "meo-trophee")
    c.motif("afrique")
    finish(c, "orateur-c", "orateur", None, "C", "Le Carillon et les cauris",
           "Un portique de carillon : six cloches de bronze à bossettes (bianzhong) sous une poutre laquée, un disque de jade bi derrière "
           "le blason, et des ondes d'or qui se propagent comme la voix. Un peu d'Afrique y est tissé : les poteaux sont habillés de bandes "
           "à la manière du kente d'Asante et les cloches pendent à des cordons de cauris — le coquillage qui fut monnaie dans la Chine des "
           "Shang comme en Afrique de l'Ouest.",
           "pied : Mee (bravo) et Meo (trophée) sous le portique", "On l'a fait ensemble")


def build():
    oraA()
    oraB()
    oraC()
