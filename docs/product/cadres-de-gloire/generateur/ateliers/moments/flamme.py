"""La Flamme - les jours d'affilée : 7 (braise), 30 (flamme), 100 (brasier), 365 (phénix).

De la braise qu'on garde au creux des mains jusqu'à l'oiseau de feu qui renaît chaque jour."""

import math
import random

from base import Card, W, H, f, pt, esc, photo, bird, mee_meo, sparkle, SANS, CINZEL, CINZEL_DECO, HAND
from kit import (group, rrect, arch, oval, circle_d, ring_d, ogive, octo, deco_mask, clip, bevel, noise, wobble, metal_grad,
                 rim, inner_shadow, grade, halo, lgrad, dust, outer_frame, inscription, smooth_closed, smooth_open)
from fire import (FIRE, GOLDFIRE, tongue_d, feather_d, fire_grads, fire_field, fire_streaks, row_spots, tall_spots, embers, sparks,
                  ribbon, smoke, flame_shape_d, days_number, veins)
from emblem import catmull, medal, ruban_birds

COPPER = ("#FFD9C2", "#D9774A", "#6E2C12")
EMBER_GOLD = ("#FFF1C8", "#F2A93B", "#7A3410")
REDGOLD = ("#FFE6B0", "#E0952B", "#6E220A")
IRON = ("#C9B8B0", "#5A4A46", "#1A1110")
SUNGOLD = ("#FFFBE0", "#FFC53D", "#9A4A0C")
PHOTO_FREE = (84, 256, 456, 724)


def kicker(word):
    return f"Flamme · {word}"


# ---------------------------------------------------------------- 7 jours : la braise

def ember_stone(card, cx, cy, r, seed, name="es"):
    """Une braise : pierre de charbon fendue, cœur blanc-jaune, croûte de cendre, fissures incandescentes."""
    rnd = random.Random(seed)
    pts = []
    for i in range(14):
        a = math.radians(i * 360 / 14)
        rr = r * rnd.uniform(0.88, 1.06)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a) * 0.92))
    d = smooth_closed(pts)
    hot = card.rgrad(name + "-hot", [(0, "#FFFBE0", 1), (0.28, "#FFD45A", 1), (0.55, "#FF7A1E", 1), (0.8, "#B8280C", 1), (1, "#3A0A04", 1)], 0.5, 0.48, 0.55)
    out = [halo(card, cx, cy, r * 2.6, "#FF7A1E", 0.55, name + "-h1"), halo(card, cx, cy, r * 1.4, "#FFD45A", 0.4, name + "-h2")]
    out.append(f'<path d="{d}" fill="#000000" opacity="0.6" transform="translate(0 7)" filter="{card.blur(name + "-sh", 7)}"/>')
    out.append(f'<path d="{d}" fill="{hot}"/>')
    ash_mask = card.def_once(
        name + "-am",
        f'<mask id="{card.id(name + "-am")}" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}">'
        f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.2)}" fill="{card.rgrad(name + "-amg", [(0, "#000000", 1), (0.42, "#000000", 1), (0.75, "#FFFFFF", 1), (1, "#FFFFFF", 1)])}"/></mask>',
    )
    out.append(
        f'<g mask="url(#{card.id(name + "-am")})" clip-path="{clip(card, d, name + "-c")}">'
        f'<g filter="{noise(card, name + "-ash", "0.07", 4, seed, 3.2, -1.25)}"><path d="{d}" fill="#24140F"/></g>'
        f'<g filter="{noise(card, name + "-ash2", "0.12", 3, seed + 4, 3.0, -1.6)}"><path d="{d}" fill="#7A6A64" opacity="0.8"/></g></g>'
    )
    cracks = []
    for k in range(9):
        a = rnd.uniform(0, 360)
        x, y = pt(cx, cy, r * 0.42, a)
        seg = [(x, y)]
        for _ in range(3):
            a += rnd.uniform(-35, 35)
            x, y = pt(x, y, r * rnd.uniform(0.16, 0.24), a)
            seg.append((x, y))
        cracks.append(f'<path d="M{" L".join(f"{f(px)} {f(py)}" for px, py in seg)}" fill="none" stroke="#FFC53D" stroke-width="{f(rnd.uniform(1, 2.2))}" stroke-linecap="round" stroke-linejoin="round"/>')
    out.append(f'<g clip-path="{clip(card, d, name + "-c2")}"><g filter="{card.blur(name + "-cg", 2)}">{"".join(cracks)}</g>{"".join(cracks)}</g>')
    out.append(f'<path d="{d}" fill="none" stroke="#FFB347" stroke-width="1.2" opacity="0.55"/>')
    return "".join(out), d


def votive(card, x, y, label, lit=True, name="vt"):
    """Une petite lampe à huile : coupelle de bronze, flamme, halo, et l'initiale du jour."""
    bowl = f"M{f(x - 10)} {f(y)} Q{f(x)} {f(y + 11)} {f(x + 10)} {f(y)} Z"
    out = [halo(card, x, y - 10, 22, "#FFB347", 0.55, name + "-h")]
    fg = card.grad(name + "-fl", [(0, "#FFF6D6"), (0.45, "#FFD45A"), (1, "#FF6A1A")], 0, 1, 0, 0)
    out.append(f'<path d="{tongue_d(x, y - 1, 8, 20, 0.6)}" fill="{fg}"/>')
    out.append(f'<path d="{tongue_d(x, y - 1, 4, 9, 0)}" fill="#FFFFFF" opacity="0.9"/>')
    bg = card.grad(name + "-bw", [(0, "#FFE0B0"), (0.5, "#C2834A"), (1, "#5A2A10")], 0, 0, 0, 1)
    out.append(f'<path d="{bowl}" fill="{bg}"/>')
    out.append(f'<line x1="{f(x - 10)}" y1="{f(y)}" x2="{f(x + 10)}" y2="{f(y)}" stroke="#FFE9C8" stroke-width="1"/>')
    out.append(f'<text x="{f(x)}" y="{f(y + 21)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="8.5" fill="#FFD9A8" opacity="0.9">{label}</text>')
    return "".join(out)


def coal_bed(card, name, seed, y0, y1, n=120):
    """Un lit de braises : morceaux de charbon anguleux, serrés, dont les fentes et le dessous rougeoient."""
    rnd = random.Random(seed)
    lumps = []
    for _ in range(n):
        x = rnd.uniform(-20, W + 20)
        y = rnd.uniform(y0, y1)
        s = rnd.uniform(9, 20) * (0.7 + 0.5 * (y - y0) / max(1, y1 - y0))
        k = rnd.randint(5, 7)
        a0 = rnd.uniform(0, 60)
        pts = [(x + s * math.cos(math.radians(a0 + i * 360 / k + rnd.uniform(-14, 14))) * rnd.uniform(0.75, 1.15) * 1.25,
                y + s * math.sin(math.radians(a0 + i * 360 / k + rnd.uniform(-14, 14))) * rnd.uniform(0.75, 1.15) * 0.8) for i in range(k)]
        lumps.append((y, "M" + " L".join(f"{f(px)} {f(py)}" for px, py in pts) + " Z", x, y, s))
    lumps.sort()
    body = "".join(f'<path d="{d}" stroke-linejoin="round"/>' for _, d, *_ in lumps)
    hot = card.rgrad(name + "-g", [(0, "#FFE08A", 1), (0.35, "#FF8A1E", 1), (0.7, "#C2300E", 1), (1, "#3A0A04", 1)], 0.5, 0.85, 0.7)
    top = card.grad(name + "-top", [(0, "#3A2A26"), (0.45, "#140B09"), (1, "#0A0504")], 0, 0, 0, 1)
    rims = "".join(f'<path d="{d}" fill="none" stroke="#FF6A1A" stroke-width="2.2" opacity="0.8" transform="translate(0 1.6)"/>' for _, d, *_ in lumps)
    return (
        f'<g filter="{card.blur(name + "-gl", 10)}" opacity="0.95" fill="#FF6A1A">{body}</g>'
        f'<g filter="{card.blur(name + "-rg", 1.4)}">{rims}</g>'
        f'<g fill="{hot}">{body}</g>'
        f'<g filter="{veins(card, name + "-v", "0.06", seed, 6.0, -0.42)}" fill="{top}">{body}</g>'
        f'<g fill="none" stroke="#5A3A30" stroke-width="0.6" opacity="0.3">{body}</g>'
    )


def braise():
    c = Card("fl7")
    photo(c, top="#3A2418", bottom="#140A06", rim="#FFB070", glow=0.22)
    win = rrect(82, 282, 458, 726, 28)
    with group(c, f'mask="{deco_mask(c, win)}"'):
        c.add(f'<rect width="{W}" height="{H}" fill="{lgrad(c, "bg", [(0, "#0C0605", 1), (0.5, "#1A0D09", 1), (0.85, "#3A1408", 1), (1, "#5A1A08", 1)])}"/>')
        c.add(halo(c, 270, 960, 420, "#FF6A1A", 0.5, "floor", ry=260))
        c.add(halo(c, 270, 150, 240, "#FF8A2E", 0.22, "top"))
        for i, (x, y0, y1, amp) in enumerate(((44, 800, 120, 30), (500, 810, 160, 26), (70, 520, 60, 22), (470, 560, 40, 24), (270, 300, 0, 40))):
            c.add(smoke(c, f"sm{i}", 80 + i, x, y0, y1, amp, 30, "#D9C2B4", 0.2 if i < 4 else 0.12))
        licks = row_spots(86, -10, 550, 900, lambda x: 46 + 40 * (abs(x - 270) / 270) ** 1.5, 18, 30, (16, 30), 8)
        c.add(fire_field(c, "lk", 87, licks, glow=10, glow_op=0.6, wob=("0.02 0.04", 12)))
        c.add(coal_bed(c, "bed", 81, 880, 980))
        c.add(halo(c, 20, 700, 120, "#FF6A1A", 0.22, "hl", ry=260), halo(c, 520, 700, 120, "#FF6A1A", 0.22, "hr", ry=260))
        g, k = embers(82, 90, (0, 40, W, 960), avoid=PHOTO_FREE)
        c.add(f'<g filter="{c.blur("eg", 2)}">{g}</g>', k)
        c.add(sparks(83, 40, (0, 200, W, 940), avoid=PHOTO_FREE))
        c.add(dust(84, 120, (0, 0, W, 300), ["#FFD9A8", "#FFFFFF"], 0.3, 0.9, 0.2, 0.6))
    c.add(inner_shadow(c, win, 40, 14, 0.55))
    c.add(grade(c, win, "#FF8A2E", 0.5, 1.1, 0.34, 0.85, "warm"))
    c.add(rim(c, win, COPPER, 4.5))
    stone, _ = ember_stone(c, 270, 138, 64, 85)
    c.add(stone)
    c.add(f'<text x="270" y="166" text-anchor="middle" font-family="{CINZEL}" font-weight="700" font-size="76" fill="#3A0C04" opacity="0.4" filter="{c.blur("n7b", 3)}">7</text>')
    c.add(f'<text x="270" y="164" text-anchor="middle" font-family="{CINZEL}" font-weight="700" font-size="76" fill="{c.grad("n7", [(0, "#5A1406"), (1, "#2A0602")])}">7</text>')
    for i, lab in enumerate("LMMJVSD"):
        c.add(votive(c, 168 + i * 34, 238, lab, name=f"vt{i}"))
    c.add(outer_frame(c, COPPER, inner_op=0.45))
    mee_meo(c, "pied", "mee-sourire", "meo-yo")
    inscription(c, kicker("Braise"), "7 jours", metal=COPPER, panel=("#2A1208", "#0C0503"), accent="#FFB27A", ink="#FFF1DC")
    return c


# ---------------------------------------------------------------- 30 jours : la flamme

def column_spots(seed, x0, x1, levels, wmin=30, wmax=56):
    """Une colonne de feu : plusieurs rangées de langues superposées, de la base au sommet."""
    rnd = random.Random(seed)
    out = []
    for base, hmin, hmax in levels:
        x = x0
        while x < x1:
            out.append((x, base + rnd.uniform(-10, 10), rnd.uniform(wmin, wmax), rnd.uniform(hmin, hmax), rnd.uniform(-8, 8)))
            x += rnd.uniform(12, 22)
    return out


def flamme():
    c = Card("fl30")
    photo(c, top="#3A1C14", bottom="#140806", rim="#FFB070", glow=0.22)
    win = ogive(86, 454, 430, 270, 726, 26, 0.6)
    with group(c, f'mask="{deco_mask(c, win)}"'):
        c.add(f'<rect width="{W}" height="{H}" fill="{lgrad(c, "bg", [(0, "#12040A", 1), (0.4, "#220608", 1), (0.8, "#3A0A06", 1), (1, "#4A1006", 1)])}"/>')
        c.add(halo(c, 270, 170, 260, "#FF7A1E", 0.35, "tg"))
        c.add(fire_streaks(c, "stl", 30, (-20, 300, 130, 680), "#C2281A", 0.9))
        c.add(fire_streaks(c, "str", 31, (430, 300, 130, 680), "#C2281A", 0.9))
        sides = tall_spots(32, -30, 110, 990, 420, 760, 40, 64) + tall_spots(33, 430, 570, 990, 420, 760, 40, 64)
        low = tall_spots(34, 100, 440, 990, 180, 320, 44, 66)
        c.add(fire_field(c, "fl", 35, sides + low, glow=18, glow_op=0.75))
        crown = tall_spots(36, 196, 346, 246, 120, 200, 30, 44, (9, 15), 10)
        fade = c.def_once("crf", f'<linearGradient id="{c.id("crf")}" gradientUnits="userSpaceOnUse" x1="0" y1="150" x2="0" y2="244">'
                          '<stop offset="0" stop-color="#FFFFFF"/><stop offset="0.55" stop-color="#FFFFFF"/><stop offset="1" stop-color="#000000"/></linearGradient>')
        c.def_once("crm", f'<mask id="{c.id("crm")}" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="{fade}"/></mask>')
        c.add(f'<g mask="url(#{c.id("crm")})">{fire_field(c, "cr", 37, crown, glow=12, glow_op=0.7)}</g>')
        c.add(halo(c, 270, 236, 120, "#FF7A1E", 0.45, "crb", ry=34))
        g, k = embers(38, 140, (0, 20, W, 960), avoid=PHOTO_FREE)
        c.add(f'<g filter="{c.blur("eg", 2.2)}">{g}</g>', k)
        c.add(sparks(39, 70, (0, 20, W, 940), avoid=PHOTO_FREE, lmin=8, lmax=26))
    c.add(inner_shadow(c, win, 44, 15, 0.6))
    c.add(grade(c, win, "#FF7A1E", 0.0, 0.6, 0.26, 0.7, "gl"))
    c.add(grade(c, win, "#FF7A1E", 1.0, 0.6, 0.26, 0.7, "gr"))
    c.add(f'<path d="{win}" fill="none" stroke="#FFB347" stroke-width="8" opacity="0.5" filter="{c.blur("rg", 6)}"/>')
    c.add(rim(c, win, EMBER_GOLD, 5))
    cx, cy, s = 270, 150, 0.98
    d = flame_shape_d(cx, cy, s)
    c.add(halo(c, cx, cy - 10, 170, "#FFB347", 0.5, "bh"))
    c.add(f'<path d="{d}" fill="#000000" opacity="0.55" transform="translate(0 7)" filter="{c.blur("bsh", 7)}"/>')
    inner_fire = fire_field(c, "bi", 40, row_spots(41, cx - 60, cx + 60, cy + 90, lambda x: 150 - abs(x - cx) * 0.9, 30, 44, (8, 14), 4), glow=0)
    c.add(f'<path d="{d}" fill="{c.rgrad("bdisc", [(0, "#5A1406", 1), (0.7, "#2A0604", 1), (1, "#140202", 1)], 0.5, 0.65, 0.6)}"/>')
    c.add(f'<g clip-path="{clip(c, d, "bc")}" opacity="0.9">{inner_fire}</g>')
    g = metal_grad(c, "bm", EMBER_GOLD)
    c.add(f'<g filter="{bevel(c, "bbv", 1.1, 2.6, sd=3, dy=2, sop=0.5)}"><path d="{d}" fill="none" stroke="{g}" stroke-width="7"/></g>')
    c.add(f'<path d="{flame_shape_d(cx, cy + 4, s * 0.86)}" fill="none" stroke="#FFF1C8" stroke-width="0.9" opacity="0.6"/>')
    c.add(f'<circle cx="{cx}" cy="{cy + 22}" r="44" fill="{c.rgrad("ndk", [(0, "#2A0602", 0.75), (1, "#2A0602", 0)])}"/>')
    c.add(days_number(c, "n30", cx, cy + 16, 30, 56, c.grad("n30f", [(0, "#FFFFFF"), (0.5, "#FFF1C8"), (1, "#F2A93B")]), label_fill="#FFE9B8"))
    c.add(outer_frame(c, EMBER_GOLD, inner_op=0.5))
    mee_meo(c, "perches", "mee-fete", "meo-feu-artifice")
    inscription(c, kicker("Flamme vive"), "30 jours", metal=EMBER_GOLD, panel=("#3A0C06", "#120302"), accent="#FFC27A", ink="#FFF1DC",
                message="Le feu ne s'éteint pas", msg_color="#FFE3B0")
    return c


# ---------------------------------------------------------------- 100 jours : le brasier

def fire_wheel(card, cx, cy, r, seed, name="fw", n=26):
    """Une roue de feu : des langues tournées vers l'extérieur tout autour d'un disque."""
    rnd = random.Random(seed)
    grads = fire_grads(card, name)
    layers = [[], [], [], []]
    for i in range(n):
        a = i * 360 / n + rnd.uniform(-4, 4)
        L = r * rnd.uniform(0.7, 1.15) * (1.25 if i % 2 == 0 else 0.85)
        for k, sc in enumerate((1.0, 0.78, 0.56, 0.34)):
            layers[k].append(
                f'<path d="{tongue_d(0, 0, 30 * (0.55 + 0.45 * sc), L * sc, (L * 0.3 + rnd.uniform(-4, 4)) * sc, 6 * sc)}" fill="{grads[k]}" '
                f'transform="translate({f(cx)} {f(cy)}) rotate({f(a)}) translate(0 {f(-r * 0.62)})"/>'
            )
    wf = wobble(card, name + "-wb", "0.03", 12, seed, 2, 0.4)
    scr = ' style="mix-blend-mode:screen"'
    return (
        f'<g filter="{card.blur(name + "-gl", 12)}" opacity="0.8"{scr}>{"".join(layers[0])}</g>'
        + "".join(f'<g filter="{wf}"{scr}>{"".join(l)}</g>' for l in layers)
    )


def brasier():
    c = Card("fl100")
    photo(c, top="#3A1A10", bottom="#140604", rim="#FFB070", glow=0.24)
    win = rrect(80, 286, 460, 726, 36)
    with group(c, f'mask="{deco_mask(c, win)}"'):
        c.add(f'<rect width="{W}" height="{H}" fill="{lgrad(c, "bg", [(0, "#120206", 1), (0.4, "#2A0406", 1), (0.75, "#4A0A06", 1), (1, "#6A1406", 1)])}"/>')
        c.add(halo(c, 270, 990, 520, "#C2281A", 0.55, "bh", ry=620))
        c.add(fire_streaks(c, "s1", 50, (-20, 180, W + 40, 800), "#C2281A", 1.0))
        c.add(fire_streaks(c, "s2", 51, (-20, 420, W + 40, 560), "#FF8A1E", 0.6, b=-1.6))
        back = tall_spots(52, -40, W + 40, 1000, 600, 980, 54, 84, (20, 32), 18)
        c.add(fire_field(c, "bk", 53, back, glow=22, glow_op=0.7, blend=False))
        front = tall_spots(54, -40, 110, 1000, 300, 620, 40, 64, (18, 28)) + tall_spots(55, 430, 580, 1000, 300, 620, 40, 64, (18, 28))
        c.add(fire_field(c, "fr", 56, front, glow=0))
        g, k = embers(58, 220, (0, 10, W, 960), avoid=PHOTO_FREE, rmax=2.8)
        c.add(f'<g filter="{c.blur("eg", 2.4)}">{g}</g>', k)
        c.add(sparks(59, 120, (0, 10, W, 950), avoid=PHOTO_FREE, lmin=10, lmax=34, drift=(-40, 40)))
    c.add(inner_shadow(c, win, 46, 16, 0.6))
    c.add(grade(c, win, "#FF6A1A", 0.5, 1.05, 0.3, 0.9, "gb"))
    c.add(grade(c, win, "#FFB347", 0.5, -0.05, 0.22, 0.8, "gt"))
    c.add(f'<path d="{win}" fill="none" stroke="#FF5A14" stroke-width="12" opacity="0.65" filter="{c.blur("hot", 8)}"/>')
    hot = c.grad("hotm", [(0, "#FFF1B0"), (0.2, "#FF9A2E"), (0.5, "#B8280C"), (0.8, "#FF8A1E"), (1, "#FFE08A")], 0, 0, 1, 1)
    c.add(f'<g filter="{bevel(c, "rbv", 1.0, 2.4, sd=4, dy=3, sop=0.7, light="#FFE6B0")}"><path d="{win}" fill="none" stroke="{hot}" stroke-width="6"/></g>')
    c.add(f'<path d="{win}" fill="none" stroke="#FFF6D6" stroke-width="0.9" opacity="0.8"/>')
    cx, cy = 270, 152
    c.add(halo(c, cx, cy, 200, "#FFD45A", 0.55, "wh"))
    c.add(fire_wheel(c, cx, cy, 104, 60))
    medal(c, cx, cy, 64, 100, "CENT JOURS DE FEU · LE GRAND BRASIER · ", REDGOLD, "md", top="JOURS",
          disc=("#5A1406", "#2A0604", "#0C0101"), inner=halo(c, cx, cy + 30, 50, "#FF6A1A", 0.6, "mi"), ink="#4A1206", size=46)
    c.add(outer_frame(c, REDGOLD, inner_op=0.5))
    bird(c, "mee-wow", 66, 448, 126, rotate=14)
    bird(c, "meo-cool", 474, 486, 126, flip=True, rotate=-14)
    inscription(c, kicker("Brasier"), "100 jours", metal=REDGOLD, panel=("#4A0A06", "#140202"), accent="#FFC27A", ink="#FFF1DC",
                title_size=42)
    return c


# ---------------------------------------------------------------- 365 jours : le phénix

def wing(card, name, side, seed):
    """Une aile déployée : un bras (épaule -> coude -> poignet -> pointe) d'où pendent trois rangs de plumes-flammes."""
    rnd = random.Random(seed)
    cx = 270
    arm = [(cx + side * 34, 178), (cx + side * 108, 116), (cx + side * 190, 70), (cx + side * 262, 34), (cx + side * 300, 22)]
    path = catmull(arm, 40)
    rows = (
        ("p", 20, 0.1, 1.0, 196, 262, 96, 190, 34, [(0, "#FFF1C0", 1), (0.35, "#FF9A2E", 1), (0.75, "#D8261A", 0.95), (1, "#6A0818", 0.0)]),
        ("s", 17, 0.0, 0.86, 188, 236, 64, 110, 30, [(0, "#FFF6D6", 1), (0.4, "#FFB53C", 1), (0.85, "#F0581A", 0.95), (1, "#B81E10", 0.0)]),
        ("c", 14, 0.0, 0.7, 182, 218, 30, 46, 24, [(0, "#FFFBE6", 1), (0.5, "#FFD45A", 1), (1, "#FF8A1E", 0.4)]),
    )
    out = []
    for key, n, t0, t1, a0, a1, l0, l1, w, stops in rows:
        g = lgrad(card, f"{name}-{key}", stops, 0, 1, 0, 0)
        feathers, veins = [], []
        for i in range(n):
            t = t0 + (t1 - t0) * i / (n - 1)
            bx, by = path[min(len(path) - 1, int(t * (len(path) - 1)))]
            a = a0 + (a1 - a0) * t ** 1.1 + rnd.uniform(-3, 3)
            if side > 0:
                a = 360 - a
            L = l0 + (l1 - l0) * t ** 1.25 * rnd.uniform(0.92, 1.06)
            bend = rnd.uniform(-8, 8) - side * 6
            tr = f"translate({f(bx)} {f(by)}) rotate({f(a)})"
            feathers.append(f'<path d="{feather_d(L, w * rnd.uniform(0.9, 1.1), bend)}" fill="{g}" transform="{tr}"/>')
            veins.append(f'<path d="M0 0 Q{f(bend * 0.3)} {f(-L * 0.5)} {f(bend * 0.8)} {f(-L * 0.86)}" fill="none" stroke="#FFF6D6" stroke-width="0.8" opacity="0.55" transform="{tr}"/>')
        if key == "p":
            out.append(f'<g filter="{card.blur(name + "-pg", 10)}" opacity="0.75">{"".join(feathers)}</g>')
        out.append(f'<g filter="{wobble(card, f"{name}-w{key}", "0.035", 7, seed + len(key), 2)}">{"".join(feathers)}</g>')
        out.append("".join(veins))
    lead = ribbon(path, 16, 4)
    out.append(f'<path d="{lead}" fill="{lgrad(card, name + "-lead", [(0, "#FFFBE6", 1), (1, "#FFC53D", 0.6)], 0, 0, 1, 0)}" filter="{wobble(card, name + "-wl", "0.04", 4, seed, 2)}"/>')
    return "".join(out)


def tail(card, name, side, seed):
    """Les plumes de traîne : rubans de feu qui descendent le long de la photo, frangés de flammèches, finis en ocelles d'or."""
    rnd = random.Random(seed)
    glow, body, licks = [], [], []
    g = lgrad(card, name + "-g", [(0, "#FFF1C0", 1), (0.25, "#FFC53D", 1), (0.6, "#FF6A1A", 0.95), (1, "#B8141A", 0.9)], 0, 220, 0, 800, "userSpaceOnUse")
    lg = lgrad(card, name + "-lk", [(0, "#FFB347", 0), (1, "#FFD45A", 0.9)], 0, 0, 0, 1)
    for k, (dx, w0, end_y) in enumerate(((0, 18, 770), (18, 12, 690), (-16, 10, 612))):
        pts = [(270 + side * 10, 224), (270 + side * 70, 246 + k * 4), (270 + side * 150, 262 + k * 6), (270 + side * (212 - dx), 300 + k * 10),
               (270 + side * (232 - dx * 0.6), 400), (270 + side * (226 - dx * 0.4), end_y - 120), (270 + side * (236 - dx * 0.3), end_y)]
        pts = catmull(pts, 60)
        d = ribbon(pts, w0, 2.5)
        glow.append(f'<path d="{d}" fill="#FF6A1A"/>')
        body.append(f'<path d="{d}" fill="{g}"/>')
        body.append(f'<path d="{smooth_open(pts[::3])}" fill="none" stroke="#FFF6D6" stroke-width="0.9" opacity="0.7"/>')
        for i in range(4, len(pts) - 4, 3):
            x, y = pts[i]
            a = math.degrees(math.atan2(pts[i + 1][0] - pts[i - 1][0], -(pts[i + 1][1] - pts[i - 1][1])))
            for sgn in (-1, 1):
                L = rnd.uniform(10, 22) * (1 - i / len(pts) * 0.5)
                licks.append(f'<path d="{feather_d(L, 7, rnd.uniform(-3, 3))}" fill="{lg}" transform="translate({f(x)} {f(y)}) rotate({f(a + sgn * rnd.uniform(40, 70) - 180)})"/>')
        ex, ey = pts[-1]
        eye = (
            f'<g transform="translate({f(ex)} {f(ey + 6)})">'
            f'<path d="{tongue_d(0, 20, 24, 40, 0)}" fill="{card.grad(name + "-eo", [(0, "#FFD45A"), (0.5, "#FF6A1A"), (1, "#8E1208")], 0, 1, 0, 0)}"/>'
            f'<circle cx="0" cy="6" r="8" fill="#5A0610"/><circle cx="0" cy="6" r="5.4" fill="{card.rgrad(name + "-oc", [(0, "#FFFFFF", 1), (0.5, "#FFE08A", 1), (1, "#FFB347", 1)])}"/></g>'
        )
        body.append(eye)
        glow.append(eye)
    wf = wobble(card, name + "-wb", "0.03", 5, seed, 2, 0.4)
    return (
        f'<g filter="{card.blur(name + "-gl", 9)}" opacity="0.65">{"".join(glow)}</g>'
        f'<g filter="{wf}" style="mix-blend-mode:screen">{"".join(licks)}</g>'
        f'<g filter="{wf}">{"".join(body)}</g>'
    )


def phoenix_head(card, name="ph"):
    """Cou, tête de profil (bec tourné vers la droite), aigrette de trois plumes."""
    out = []
    plumes = []
    for k, pts in enumerate((
        [(262, 66), (244, 46), (226, 34), (204, 30), (186, 34)],
        [(264, 62), (252, 38), (240, 22), (222, 12), (204, 12)],
        [(268, 58), (264, 36), (258, 20), (246, 6), (232, 0)],
    )):
        plumes.append(f'<path d="{ribbon(catmull(pts, 18), 8, 1.5)}" fill="{card.grad(name + "-pl", [(0, "#FFF1C0"), (0.5, "#FFB53C"), (1, "#E8401A")], 1, 0, 0, 0)}"/>')
        tx, ty = pts[-1]
        plumes.append(f'<circle cx="{f(tx)}" cy="{f(ty)}" r="3.2" fill="#FFE08A"/>')
    out.append(f'<g filter="{card.blur(name + "-pgl", 4)}" opacity="0.8">{"".join(plumes)}</g>{"".join(plumes)}')
    neck = ribbon(catmull([(270, 132), (262, 112), (264, 92), (274, 76)], 20), 40, 22)
    out.append(f'<path d="{neck}" fill="{card.grad(name + "-nk", [(0, "#FFD45A"), (0.6, "#FF9A2E"), (1, "#E8501A")], 0, 0, 0, 1)}"/>')
    scales = []
    for row, (yy, xs) in enumerate(((84, (262, 272, 282)), (98, (256, 266, 276)), (112, (254, 264, 274, 284)))):
        for x in xs:
            scales.append(f'<path d="M{f(x - 5)} {f(yy)} Q{f(x)} {f(yy + 10)} {f(x + 5)} {f(yy)}" fill="none" stroke="#FFF1C0" stroke-width="1" opacity="0.6"/>')
    out.append("".join(scales))
    head = smooth_closed([(266, 70), (272, 58), (284, 54), (294, 60), (296, 70), (288, 78), (274, 80)])
    out.append(f'<path d="{head}" fill="{card.rgrad(name + "-hd", [(0, "#FFFBE6", 1), (0.5, "#FFD45A", 1), (1, "#FF8A1E", 1)], 0.6, 0.35, 0.7)}"/>')
    out.append(f'<path d="M293 62 Q306 62 314 70 Q306 70 298 74 Z" fill="{card.grad(name + "-bk", [(0, "#FFF1C0"), (1, "#C27A1A")], 0, 0, 1, 0)}"/>')
    out.append('<path d="M296 70 Q304 70 310 69" fill="none" stroke="#7A3A10" stroke-width="0.8"/>')
    out.append('<ellipse cx="285" cy="64" rx="3.2" ry="2.6" fill="#2A0A1A"/><circle cx="286" cy="63.2" r="1" fill="#FFFFFF"/>')
    out.append('<path d="M280 61 Q285 58 290 61" fill="none" stroke="#B8280C" stroke-width="1.2" stroke-linecap="round"/>')
    return "".join(out)


def phenix():
    c = Card("fl365")
    photo(c, top="#3A2018", bottom="#120806", rim="#FFC27A", glow=0.24)
    win = arch(84, 456, 450, 300, 726)
    with group(c, f'mask="{deco_mask(c, win)}"'):
        c.add(f'<rect width="{W}" height="{H}" fill="{lgrad(c, "bg", [(0, "#10041E", 1), (0.3, "#3A0A2A", 1), (0.65, "#5A0E20", 1), (1, "#6A1A10", 1)])}"/>')
        c.add(dust(61, 220, (0, 0, W, 520), ["#FFFFFF", "#FFE9C8", "#FFD0E0"], 0.3, 1.1, 0.25, 0.85))
        c.add(halo(c, 270, 160, 330, "#FFB347", 0.55, "rad"))
        rays = []
        for i in range(48):
            a = -90 + i * 180 / 47
            rays.append(f'<path d="M270 160 L{f(pt(270, 160, 900, a - 1.2)[0])} {f(pt(270, 160, 900, a - 1.2)[1])} L{f(pt(270, 160, 900, a + 1.2)[0])} {f(pt(270, 160, 900, a + 1.2)[1])} Z" fill="#FFE08A" opacity="{0.07 if i % 2 else 0.13}"/>')
        c.add(f'<g>{"".join(rays)}</g>')
        low = tall_spots(62, -30, 570, 1000, 160, 380, 44, 70, (14, 24), 12)
        c.add(fire_field(c, "lo", 63, low, glow=18, glow_op=0.7))
        c.add(tail(c, "tl", -1, 64))
        c.add(tail(c, "tr", 1, 65))
        g, k = embers(66, 150, (0, 10, W, 960), avoid=PHOTO_FREE, colors=("#FFE08A", "#FFB347", "#FFFFFF", "#FF8A1E"))
        c.add(f'<g filter="{c.blur("eg", 2.2)}">{g}</g>', k)
        rnd = random.Random(67)
        drift = []
        for _ in range(16):
            x, y = rnd.uniform(20, 520), rnd.uniform(300, 940)
            if 70 < x < 470 and 280 < y < 740:
                continue
            drift.append(f'<path d="{feather_d(rnd.uniform(14, 24), 8, rnd.uniform(-3, 3))}" fill="{c.grad("drf", [(0, "#FFF1C0"), (1, "#FF6A1A")], 0, 1, 0, 0)}" transform="translate({f(x)} {f(y)}) rotate({f(rnd.uniform(-60, 60))})" opacity="0.9"/>')
        c.add("".join(drift))
    c.add(inner_shadow(c, win, 44, 16, 0.55))
    c.add(grade(c, win, "#FFB347", 0.5, -0.1, 0.3, 0.9, "gt"))
    c.add(grade(c, win, "#FF5A1F", 0.5, 1.1, 0.24, 0.8, "gb"))
    c.add(rim(c, win, SUNGOLD, 5))
    c.add(wing(c, "wl", -1, 70))
    c.add(wing(c, "wr", 1, 71))
    c.add(phoenix_head(c))
    cx, cy = 270, 172
    medal(c, cx, cy, 56, 365, "UN AN DE FLAMME · RENAÎTRE CHAQUE JOUR · ", SUNGOLD, "md", top="JOURS", band=15, glow="#FFE08A", glow_op=0.6,
          disc=("#7A1A06", "#3A0804", "#120202"), inner=halo(c, cx, cy + 30, 46, "#FF8A1E", 0.7, "mi"), ink="#6E2A08", size=40,
          num_fill=c.grad("n365", [(0, "#FFFFFF"), (0.5, "#FFF1C0"), (1, "#FFC53D")]))
    c.add(outer_frame(c, SUNGOLD, inner_op=0.55))
    inscription(c, kicker("Phénix"), "365 jours", metal=SUNGOLD, panel=("#3A0A1A", "#100206"), accent="#FFD27A", ink="#FFF6E0",
                message="Un an, chaque jour", msg_color="#FFE3B0", title_size=42)
    ruban_birds(c, "mee-bisou-vole", "meo-trophee")
    return c


FRAMES = [
    ("moments-flamme-7", braise, dict(rank="Flamme", division=None, option="7 jours d'affilée · braise", name="Les Sept Braises",
     story="Une braise fendue garde le chiffre 7 au creux de son cœur blanc ; sous elle, sept petites lampes à huile, une par jour de la semaine, toutes allumées, et en bas un lit de charbons fendus d'où de petites flammes reprennent.",
     layout="pied (Mee sourire, Meo yo)", message=None)),
    ("moments-flamme-30", flamme, dict(rank="Flamme", division=None, option="30 jours d'affilée · flamme", name="La Flamme vive",
     story="Deux colonnes de feu montent de part et d'autre d'une fenêtre en ogive, comme une flamme qui s'élance ; l'écusson en forme de goutte de feu porte le 30, et des étincelles s'envolent jusqu'à Mee et Meo perchés.",
     layout="perchés (Mee fête, Meo feu d'artifice)", message="Le feu ne s'éteint pas")),
    ("moments-flamme-100", brasier, dict(rank="Flamme", division=None, option="100 jours d'affilée · brasier", name="Le Grand Brasier",
     story="Tout le cadre brûle : un mur de flammes encercle la photo, son liseré est un fer porté au rouge, et une roue de feu tournoie autour de la médaille du 100 dans une pluie d'étincelles.",
     layout="côtés (Mee wow, Meo cool, rentrés dans le cadre)", message=None)),
    ("moments-flamme-365", phenix, dict(rank="Flamme", division=None, option="365 jours d'affilée · phénix", name="Le Phénix",
     story="La flamme devient oiseau : un phénix déploie ses ailes de plumes-flammes au-dessus de la photo, porte la médaille solaire du 365 sur son poitrail, et ses plumes de traîne descendent le long du cadre jusqu'à leurs ocelles d'or ; il renaît chaque jour, comme la série.",
     layout="ruban (Mee bisou volé, Meo trophée)", message="Un an, chaque jour")),
]
