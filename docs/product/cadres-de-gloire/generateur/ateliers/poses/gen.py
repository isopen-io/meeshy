"""Atelier « poses » : un cadre héros Ambassadeur I (Olympe), décliné en poses de Mee et Meo et en inscriptions.

Le cadre est IDENTIQUE d'une déclinaison à l'autre : seules la pose des oiseaux ou l'inscription changent.
Usage : python3 gen.py  → out/poses/*.svg + manifest.json
"""

import json
import math
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "lib"))
sys.path.insert(0, str(HERE))

from base import (  # noqa: E402
    CINZEL, GARAMOND, HAND, SANS, W, H, Card, adinkrahene, anchored_spot, bird, crest, esc, f, photo, pt, shield_path, signature, sparkle,
    stars, window_mask,
)
from afrique import (  # noqa: E402
    K_BLACK, K_GOLD, K_GOLD_HI, K_GREEN_D, akoma_ntoaso, gold_flecks, kente_band_along, kente_pattern, nkonsonkonson,
)
from kit import (  # noqa: E402
    GOLD, GOLD_HI, GOLD_LO, GOLD_MID, INK, IVORY, LAPIS, LAPIS_D, LAUREL, LAUREL_HI, RUBY, TYRIAN, TYRIAN_D,
    cloud_bank, emboss, feather, gold_d, gold_h, gold_v, laurel_branch, leaf, marble_h, marble_v, meander,
    palmette, ribbon_strip, rosette, ushadow, veins, volute, wing,
)

OUT = ROOT / "out" / "poses"
KICKER = "Nouveau rang · Olympe"
TITLE = "Ambassadeur I"
DATE = "10 octobre 2026"

WIN = (80, 250, 460, 722)          # fenêtre photo
APEX = 20                          # sommet du rampant
SLOPE = 0.6                        # pente du fronton
CORNICE = (182, 196)               # corniche horizontale
DENTILS = (196, 204)
FRIEZE = (204, 228)
ARCHI = (228, 248)
CAP = (248, 274)
SHAFT = (274, 698)
BASE_Y = (698, 722)
STEPS = (722, 758)
COLS = (44, 496)
CREST = (270, 112, 0.86)


def rake_top(x):
    return APEX + abs(270 - x) * SLOPE


# ---------------------------------------------------------------- la photo à trois

def photo3(c, top="#3A2A1E", bottom="#120C08", rim="#FFC27A", glow=0.22):
    with c.layer("photo-bg"):
        c.add(f'<rect width="{W}" height="{H}" fill="{c.grad("ph-bg", [(0, top), (1, bottom)])}"/>')
        c.add(f'<ellipse cx="270" cy="470" rx="250" ry="290" fill="{c.rgrad("ph-halo", [(0, "#FFFFFF", glow), (1, "#FFFFFF", 0)])}"/>')
    with c.layer("photo"):
        rnd = random.Random(7)
        bokeh = "".join(
            f'<circle cx="{f(rnd.uniform(60, 480))}" cy="{f(rnd.uniform(260, 700))}" r="{f(rnd.uniform(8, 26))}" fill="{rim}" opacity="{f(rnd.uniform(0.05, 0.16))}"/>'
            for _ in range(16)
        )
        c.add(f'<g filter="{c.blur("ph-bokeh", 3)}">{bokeh}</g>')
        figs = [(168, 488, 50, 76, 258), (380, 494, 48, 290, 470), (272, 446, 58, 172, 372)]
        for cx, cy, r, x0, x1 in figs:
            body = f"M{x0} 760 Q{x0 + 8} {cy + 88} {cx} {cy + 78} Q{x1 - 8} {cy + 88} {x1} 760 Z"
            c.add(
                f'<g><circle cx="{cx}" cy="{cy}" r="{r}" fill="#0C0806" opacity="0.62"/>'
                f'<path d="{body}" fill="#0C0806" opacity="0.62"/>'
                f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{rim}" stroke-width="2.5" opacity="0.55"/>'
                f'<path d="M{x0} 760 Q{x0 + 8} {cy + 88} {cx} {cy + 78}" fill="none" stroke="{rim}" stroke-width="2" opacity="0.45"/></g>'
            )


# ---------------------------------------------------------------- le ciel de l'aube

def sky(c):
    m = window_mask(c, "win-m", inset=WIN[0], top=WIN[1], bottom=WIN[3], r=4)
    g = c.grad("sky", [(0, "#050B22"), (0.12, "#0C1A47"), (0.26, "#24275E"), (0.45, "#4A3270"), (0.62, "#8A4C78"),
                        (0.74, "#D9876E"), (0.8, "#F6C27E"), (0.86, "#B86A80"), (1, "#2A1A48")])
    parts = [f'<rect width="{W}" height="{H}" fill="{g}"/>']
    # la gloire : rayons d'or qui partent de l'écu, visibles dans les coins du ciel
    rnd = random.Random(5)
    rays = []
    cx, cy, _ = CREST
    for i in range(46):
        a = -100 + i * (200 / 45) + rnd.uniform(-1.5, 1.5)
        if -8 < a < 8:
            continue
        x2, y2 = pt(cx, cy, 520, a)
        w = rnd.uniform(1.2, 5.5)
        rays.append(f'<line x1="{cx}" y1="{cy}" x2="{f(x2)}" y2="{f(y2)}" stroke="#FFD98A" stroke-width="{f(w)}" opacity="{f(rnd.uniform(0.08, 0.28))}"/>')
    parts.append(f'<g filter="{c.blur("rays", 1.6)}">{"".join(rays)}</g>')
    parts.append(f'<ellipse cx="270" cy="96" rx="250" ry="120" fill="{c.rgrad("aura", [(0, "#FFE2A0", 0.55), (0.5, "#F2A860", 0.18), (1, "#F2A860", 0)])}"/>')
    # lueur d'horizon sous le temple (le soleil se lève sous les nuées)
    parts.append(f'<ellipse cx="270" cy="760" rx="330" ry="110" fill="{c.rgrad("dawn", [(0, "#FFE0A0", 0.85), (0.45, "#F4A070", 0.35), (1, "#F4A070", 0)])}"/>')
    c.add(f'<g mask="{m}">{"".join(parts)}</g>')
    stars(c, 21, 120, region=(0, 0, W, 200), color="#FFF3D6", rmax=1.5, keep_photo_clear=False)
    c.add("".join(sparkle(x, y, r, "#FFF6DA", 0.9) for x, y, r in ((40, 52, 7), (500, 40, 6), (96, 24, 4), (450, 92, 4.5), (22, 128, 3.5), (520, 140, 3.5))))
    # nuées de fond, derrière les marches (masquées hors photo)
    c.add(f'<g mask="{m}">')
    cloud_bank(c, "cb-back", 700, -40, 580, 11, 14, 34, 62, "#FFD6A6", "#9A5B86", "#FFF0C8", dy=14, op=0.95, blur=2.2)
    c.add("</g>")


# ---------------------------------------------------------------- la fenêtre photo

def bead_and_reel(x0, y0, x1, y1, step=13):
    """Rang de perles et pirouettes : une perle oblongue, deux pastilles, le long des quatre bords."""
    out = []

    def run(ax, ay, bx, by):
        length = math.hypot(bx - ax, by - ay)
        n = int(length // step)
        ang = math.degrees(math.atan2(by - ay, bx - ax))
        for i in range(n):
            t = (i + 0.5) / n
            x, y = ax + (bx - ax) * t, ay + (by - ay) * t
            out.append(f'<g transform="translate({f(x)} {f(y)}) rotate({f(ang)})"><ellipse cx="0" cy="0" rx="3.6" ry="2.3"/>'
                       f'<ellipse cx="{f(step / 2 - 1.6)}" cy="0" rx="0.9" ry="1.9"/><ellipse cx="{f(step / 2 + 1.6)}" cy="0" rx="0.9" ry="1.9"/></g>')

    run(x0, y0, x1, y0)
    run(x1, y0, x1, y1)
    run(x1, y1, x0, y1)
    run(x0, y1, x0, y0)
    return "".join(out)


def window_frame(c):
    x0, y0, x1, y1 = WIN
    c.add(f'<rect x="{x0 + 3}" y="{y0 + 3}" width="{x1 - x0 - 6}" height="{y1 - y0 - 6}" fill="none" stroke="#1A0E06" stroke-width="14" opacity="0.55" filter="{c.blur("win-in", 6)}"/>')
    c.add(f'<rect x="{x0 - 2}" y="{y0}" width="{x1 - x0 + 4}" height="{y1 - y0}" fill="none" stroke="{gold_v(c)}" stroke-width="2.2"/>')
    c.add(f'<g fill="{gold_v(c)}" filter="{emboss(c, "emb-bead", az=225, el=40, scale=1.6, k=0.9)}">{bead_and_reel(x0 + 5, y0 + 5, x1 - 5, y1 - 5)}</g>')
    c.add(f'<rect x="{x0 + 10}" y="{y0 + 10}" width="{x1 - x0 - 20}" height="{y1 - y0 - 20}" fill="none" stroke="{GOLD}" stroke-width="0.8" opacity="0.65"/>')


# ---------------------------------------------------------------- colonnes ioniques

def column(c, cx):
    sx0, sx1 = SHAFT
    top_w, bot_w = 36, 42
    g = marble_h(c)
    vein = veins(c, "veins-col", seed=8, freq="0.02 0.0045", color="#7D8798", strength=1.05)
    shaft = f"M{f(cx - top_w / 2)} {sx0} Q{f(cx - bot_w / 2 - 1.5)} {f((sx0 + sx1) / 2)} {f(cx - bot_w / 2)} {sx1} L{f(cx + bot_w / 2)} {sx1} Q{f(cx + bot_w / 2 + 1.5)} {f((sx0 + sx1) / 2)} {f(cx + top_w / 2)} {sx0} Z"
    c.add(f'<path d="{shaft}" fill="#000000" opacity="0.35" transform="translate(5 4)" filter="{c.blur("col-sh", 5)}"/>')
    c.add(f'<path d="{shaft}" fill="{g}"/>')
    c.add(f'<path d="{shaft}" fill="#FFFFFF" filter="{vein}" opacity="0.55"/>')
    for k in range(1, 7):
        t = k / 7
        xt = cx - top_w / 2 + top_w * t
        xb = cx - bot_w / 2 + bot_w * t
        c.add(
            f'<path d="M{f(xt)} {sx0 + 8} L{f(xb)} {sx1 - 6}" stroke="#8F826E" stroke-width="1.5" stroke-linecap="round" opacity="0.55"/>'
            f'<path d="M{f(xt + 1.6)} {sx0 + 8} L{f(xb + 1.8)} {sx1 - 6}" stroke="#FFFFFF" stroke-width="0.9" stroke-linecap="round" opacity="0.55"/>'
        )
    gv = gold_v(c)
    # astragale d'or en haut du fût
    c.add(f'<rect x="{f(cx - top_w / 2 - 2)}" y="{sx0 - 2}" width="{top_w + 4}" height="6" rx="3" fill="{gv}" stroke="{GOLD_LO}" stroke-width="0.6"/>')
    # chapiteau : échine à oves, abaque, volutes
    y0, y1 = CAP
    c.add(f'<path d="M{f(cx - 26)} {y0 + 10} Q{f(cx)} {y0 + 30} {f(cx + 26)} {y0 + 10} Z" fill="{marble_v(c)}" stroke="#A89A84" stroke-width="0.6"/>')
    for i in range(-2, 3):
        c.add(f'<ellipse cx="{f(cx + i * 9)}" cy="{y0 + 15}" rx="3.4" ry="4.6" fill="{gv}" stroke="{GOLD_LO}" stroke-width="0.5"/>')
    c.add(f'<path d="M{f(cx - 36)} {y0 + 4} Q{f(cx)} {y0 + 12} {f(cx + 36)} {y0 + 4} L{f(cx + 36)} {y0 + 11} Q{f(cx)} {y0 + 19} {f(cx - 36)} {y0 + 11} Z" fill="{gv}" stroke="{GOLD_LO}" stroke-width="0.7"/>')
    c.add(f'<rect x="{f(cx - 38)}" y="{y0}" width="76" height="5" fill="{marble_v(c)}" stroke="#A89A84" stroke-width="0.5"/>')
    emb = emboss(c)
    c.add(f'<g filter="{emb}">{volute(cx - 30, y0 + 13, 10.5, 1.75, gv, 3.2, mirror=False)}{volute(cx + 30, y0 + 13, 10.5, 1.75, gv, 3.2, mirror=True)}</g>')
    # base : deux tores et une plinthe
    b0, b1 = BASE_Y
    c.add(f'<rect x="{f(cx - bot_w / 2 - 4)}" y="{b0}" width="{bot_w + 8}" height="7" rx="3.5" fill="{marble_v(c)}" stroke="#9C8E78" stroke-width="0.6"/>')
    c.add(f'<rect x="{f(cx - bot_w / 2 - 2)}" y="{b0 + 6}" width="{bot_w + 4}" height="4" fill="{gv}"/>')
    c.add(f'<rect x="{f(cx - bot_w / 2 - 7)}" y="{b0 + 9}" width="{bot_w + 14}" height="8" rx="4" fill="{marble_v(c)}" stroke="#9C8E78" stroke-width="0.6"/>')
    c.add(f'<rect x="{f(cx - bot_w / 2 - 9)}" y="{b0 + 16}" width="{bot_w + 18}" height="8" fill="{marble_v(c, "plinth", "#F6F0E4", "#BDB19C")}" stroke="#9C8E78" stroke-width="0.6"/>')


# ---------------------------------------------------------------- entablement et fronton

def entablature(c):
    vein = veins(c, "veins-ent", seed=3, freq="0.005 0.03", color="#7A8597", strength=1.0)
    a0, a1 = ARCHI
    # architrave à trois fasces
    c.add(f'<rect x="0" y="{a0}" width="{W}" height="{a1 - a0}" fill="{marble_v(c, "archi", "#FBF6EC", "#CDBFA6")}"/>')
    for i, yy in enumerate((a0 + 6, a0 + 12)):
        c.add(f'<line x1="0" y1="{yy}" x2="{W}" y2="{yy}" stroke="#A8987E" stroke-width="0.9" opacity="0.8"/><line x1="0" y1="{yy + 1}" x2="{W}" y2="{yy + 1}" stroke="#FFFFFF" stroke-width="0.7" opacity="0.6"/>')
    c.add(f'<rect x="0" y="{a1 - 1.5}" width="{W}" height="3" fill="#2A1A0C" opacity="0.4" filter="{c.blur("archi-sh", 2)}"/>')
    # frise de lapis, grecque d'or
    fr0, fr1 = FRIEZE
    c.add(f'<rect x="0" y="{fr0}" width="{W}" height="{fr1 - fr0}" fill="{c.grad("lapis-fr", [(0, "#1B3C86"), (0.5, LAPIS), (1, LAPIS_D)])}"/>')
    c.add(f'<g filter="{emboss(c)}">{meander(-6, W + 6, fr0 + 3, fr1 - fr0 - 6, gold_v(c), None)}</g>')
    c.add(f'<line x1="0" y1="{fr0 + 0.6}" x2="{W}" y2="{fr0 + 0.6}" stroke="{GOLD_HI}" stroke-width="1.2"/><line x1="0" y1="{fr1 - 0.6}" x2="{W}" y2="{fr1 - 0.6}" stroke="{GOLD}" stroke-width="1.2"/>')
    # denticules
    d0, d1 = DENTILS
    c.add(f'<rect x="0" y="{d0}" width="{W}" height="{d1 - d0}" fill="#5C4E3C"/>')
    c.add("".join(f'<rect x="{x}" y="{d0}" width="7" height="{d1 - d0 - 1}" fill="{marble_v(c, "dent", "#FFFBF2", "#CFC3AE")}"/>' for x in range(-2, W, 11)))
    # corniche
    k0, k1 = CORNICE
    c.add(f'<rect x="0" y="{k0}" width="{W}" height="{k1 - k0}" fill="{marble_v(c, "corn", "#FFFDF6", "#D4C8B2")}"/>')
    c.add(f'<rect x="0" y="{k0}" width="{W}" height="{k1 - k0}" fill="#FFFFFF" filter="{vein}" opacity="0.5"/>')
    c.add(f'<line x1="0" y1="{k0 + 1}" x2="{W}" y2="{k0 + 1}" stroke="{gold_h(c)}" stroke-width="2.4"/>')
    c.add(f'<line x1="0" y1="{k1 - 1}" x2="{W}" y2="{k1 - 1}" stroke="#9C8C72" stroke-width="1"/>')


def tympanum_pts():
    t = APEX + 16
    half = (CORNICE[0] - t) / SLOPE
    return (270, t), (270 - half, CORNICE[0]), (270 + half, CORNICE[0])


def pediment(c):
    (ax, ay), (lx, ly), (rx, ry) = tympanum_pts()
    tri = f"M{f(ax)} {f(ay)} L{f(lx)} {f(ly)} L{f(rx)} {f(ry)} Z"
    c.def_once("tymp-clip", f'<clipPath id="{c.id("tymp-clip")}"><path d="{tri}"/></clipPath>')
    fill = c.rgrad("tymp", [(0, "#2C5BB8", 1), (0.45, "#163A85", 1), (1, "#081945", 1)], 0.5, 0.62, 0.62)
    c.add(f'<path d="{tri}" fill="{fill}"/>')
    # rayons de gloire dans le tympan
    cx, cy, _ = CREST
    rr = "".join(
        f'<path d="M{cx} {cy} L{f(pt(cx, cy, 300, a - 2.2)[0])} {f(pt(cx, cy, 300, a - 2.2)[1])} L{f(pt(cx, cy, 300, a + 2.2)[0])} {f(pt(cx, cy, 300, a + 2.2)[1])} Z" fill="#FFD47A" opacity="{0.16 if i % 2 else 0.08}"/>'
        for i, a in enumerate(range(-180, 180, 9))
    )
    c.add(f'<g clip-path="url(#{c.id("tymp-clip")})">{rr}')
    stars(c, 44, 70, region=(30, 40, 510, 182), color="#FFE7AE", rmax=1.2, keep_photo_clear=False)
    c.add(f'<path d="{tri}" fill="none" stroke="#000000" stroke-width="14" opacity="0.45" filter="{c.blur("tymp-in", 6)}"/></g>')
    # rampants de marbre, filet d'or
    vein = veins(c, "veins-rake", seed=6, freq="0.012 0.012", color="#7A8597", strength=1.0)
    t0 = APEX
    lt = (270 - (CORNICE[1] - t0) / SLOPE, CORNICE[1])
    rt = (270 + (CORNICE[1] - t0) / SLOPE, CORNICE[1])
    rake = f"M270 {t0} L{f(rt[0])} {f(rt[1])} L{f(rx + 8)} {f(CORNICE[1])} L270 {f(ay)} L{f(lx - 8)} {f(CORNICE[1])} L{f(lt[0])} {f(lt[1])} Z"
    c.add(f'<path d="{rake}" fill="#000000" opacity="0.45" transform="translate(0 6)" filter="{c.blur("rake-sh", 6)}"/>')
    c.add(f'<path d="{rake}" fill="{marble_v(c, "rake", "#FFFDF6", "#D6CAB3")}"/>')
    c.add(f'<path d="{rake}" fill="#FFFFFF" filter="{vein}" opacity="0.5"/>')
    gh = gold_h(c)
    c.add(f'<path d="M{f(lt[0])} {f(lt[1])} L270 {t0} L{f(rt[0])} {f(rt[1])}" fill="none" stroke="{gh}" stroke-width="2.6" stroke-linejoin="miter"/>')
    c.add(f'<path d="M{f(lx - 8)} {f(CORNICE[1])} L270 {f(ay)} L{f(rx + 8)} {f(CORNICE[1])}" fill="none" stroke="{GOLD}" stroke-width="1.4" opacity="0.9"/>')
    # oves sur le rampant
    eggs = []
    for side in (-1, 1):
        for i in range(1, 15):
            x = 270 + side * i * 17
            y = APEX + i * 17 * SLOPE + 8
            if y > CORNICE[0] - 2:
                continue
            eggs.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="2.6" ry="3.6" transform="rotate({f(side * 59)} {f(x)} {f(y)})" fill="{GOLD}" opacity="0.85"/>')
    c.add("".join(eggs))


def victory_wings(c):
    fp = c.grad("wing-p", [(0, "#FFF3C4"), (0.45, "#E9B847"), (1, "#8C5A14")], 0, 0, 0, 1)
    fs = c.grad("wing-s", [(0, "#FFF6D2"), (0.5, "#F1C65A"), (1, "#A06A18")], 0, 0, 0, 1)
    fc = c.grad("wing-c", [(0, "#FFFBE6"), (0.6, "#F6D57A"), (1, "#C08A2A")], 0, 0, 0, 1)
    emb = emboss(c, "emb-wing", az=250, el=48, scale=2.2, k=0.7)
    left = wing((226, 98), (148, 130), 247, 232, (fp, fs, fc), "#6E440C")
    right = wing((226, 98), (148, 130), 247, 232, (fp, fs, fc), "#6E440C", mirror=True)
    (ax, ay), (lx, ly), (rx, ry) = tympanum_pts()
    c.add(f'<g filter="{c.shadow("wing-sh", 0, 4, 4, "#02061A", 0.6)}"><g clip-path="url(#{c.id("tymp-clip")})"><g filter="{emb}">{left}{right}</g></g></g>')


def acroteria(c):
    gv = gold_v(c)
    emb = emboss(c)
    c.add(f'<g filter="{emb}">{palmette(270, APEX + 2, 1.05, gv, GOLD_LO)}{palmette(18, CORNICE[0] - 2, 0.8, gv, GOLD_LO)}{palmette(522, CORNICE[0] - 2, 0.8, gv, GOLD_LO)}</g>')


def crest_and_wreath(c):
    cx, cy, s = CREST
    gv = gold_v(c)
    # tablette des gemmes, sur la corniche
    gy = cy + 96 * s
    c.add(f'<rect x="{f(cx - 40)}" y="{f(gy - 11)}" width="80" height="22" rx="11" fill="{c.grad("gem-plate", [(0, "#14306E"), (1, LAPIS_D)])}" stroke="{gv}" stroke-width="2"/>')
    # halo
    c.add(f'<circle cx="{cx}" cy="{cy}" r="84" fill="{c.rgrad("halo", [(0, "#FFF2C0", 0.75), (0.55, "#FFD070", 0.25), (1, "#FFD070", 0)])}"/>')
    # couronne de laurier d'or
    lf = c.grad("leaf-gold", [(0, "#FFF5C8"), (0.5, "#EDBB46"), (1, "#9A6514")], 0, 0, 1, 1)
    emb = emboss(c, "emb-leaf", az=230, el=45, scale=2.0, k=0.75)
    left = laurel_branch(cx, cy + 6, 70, 78, 196, 344, 13, lf, "#7A4C10", "#A87018", berry="#FFF0B0", size=1.0, seed=3)
    right = laurel_branch(cx, cy + 6, 70, 78, 164, 16, 13, lf, "#7A4C10", "#A87018", berry="#FFF0B0", size=1.0, seed=9)
    c.add(f'<g filter="{c.shadow("wr-sh", 0, 3, 3, "#06102E", 0.6)}"><g filter="{emb}">{left}{right}</g></g>')
    crest(c, cx, cy, s, "gold", division=1, gem=RUBY, ink="#6B420E")
    # l'écu est guilloché : un soleil de traits fins gravés depuis la pointe, sous la Signature
    c.def_once("shield-clip", f'<clipPath id="{c.id("shield-clip")}"><path d="{shield_path(cx, cy, s * 0.8)}"/></clipPath>')
    burst = "".join(
        f'<line x1="{cx}" y1="{f(cy + 58 * s)}" x2="{f(pt(cx, cy + 58 * s, 150, a)[0])}" y2="{f(pt(cx, cy + 58 * s, 150, a)[1])}" stroke="#8A5A12" stroke-width="0.7" opacity="0.38"/>'
        for a in range(-60, 61, 4)
    )
    rings = "".join(f'<circle cx="{cx}" cy="{f(cy + 58 * s)}" r="{r}" fill="none" stroke="#FFF4C8" stroke-width="0.6" opacity="0.35"/>' for r in range(24, 140, 16))
    c.add(f'<g clip-path="url(#{c.id("shield-clip")})">{burst}{rings}</g>')
    c.add(signature(cx, cy + 4 * s, 0.9 * s, "#6B420E"))
    # éclat sur l'écu
    c.add(f'<path d="M{cx - 30} {cy - 40} L{cx - 4} {cy - 46} L{cx - 22} {cy + 10} Z" fill="#FFFFFF" opacity="0.22"/>')
    c.add(sparkle(cx + 34, cy - 44, 11, "#FFFFFF", 0.95) + sparkle(cx - 44, cy + 28, 6, "#FFF6D6", 0.85))


# ---------------------------------------------------------------- guirlandes de laurier vert

def swag_point(a, b, ctrl, t):
    x = (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * ctrl[0] + t * t * b[0]
    y = (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * ctrl[1] + t * t * b[1]
    dx = 2 * (1 - t) * (ctrl[0] - a[0]) + 2 * t * (b[0] - ctrl[0])
    dy = 2 * (1 - t) * (ctrl[1] - a[1]) + 2 * t * (b[1] - ctrl[1])
    ln = math.hypot(dx, dy) or 1
    return x, y, dx / ln, dy / ln


def heading(dx, dy):
    """Direction (dx, dy) en degrés depuis midi, sens horaire."""
    return math.degrees(math.atan2(dx, -dy))


def bow(x, y, s, fill, edge):
    loops = (
        f'<path d="M{f(x)} {f(y)} C{f(x - 10 * s)} {f(y - 14 * s)} {f(x - 24 * s)} {f(y - 8 * s)} {f(x - 20 * s)} {f(y + 2 * s)} C{f(x - 17 * s)} {f(y + 8 * s)} {f(x - 7 * s)} {f(y + 4 * s)} {f(x)} {f(y)} Z" fill="{fill}" stroke="{edge}" stroke-width="0.8"/>'
        f'<path d="M{f(x)} {f(y)} C{f(x + 10 * s)} {f(y - 14 * s)} {f(x + 24 * s)} {f(y - 8 * s)} {f(x + 20 * s)} {f(y + 2 * s)} C{f(x + 17 * s)} {f(y + 8 * s)} {f(x + 7 * s)} {f(y + 4 * s)} {f(x)} {f(y)} Z" fill="{fill}" stroke="{edge}" stroke-width="0.8"/>'
        f'<path d="M{f(x - 13 * s)} {f(y - 4 * s)} C{f(x - 11 * s)} {f(y - 7 * s)} {f(x - 6 * s)} {f(y - 6 * s)} {f(x - 3 * s)} {f(y - 2 * s)}" fill="none" stroke="#FFFFFF" stroke-width="{f(1.2 * s)}" opacity="0.35"/>'
        f'<path d="M{f(x + 13 * s)} {f(y - 4 * s)} C{f(x + 11 * s)} {f(y - 7 * s)} {f(x + 6 * s)} {f(y - 6 * s)} {f(x + 3 * s)} {f(y - 2 * s)}" fill="none" stroke="#FFFFFF" stroke-width="{f(1.2 * s)}" opacity="0.35"/>'
    )
    return loops


def falling_tail(x, y, length, amp, phase, width, front, back, edge, twist=0.55):
    pts = []
    n = 26
    for i in range(n + 1):
        sd = i / n
        pts.append((x + amp * math.sin(phase + sd * math.pi * 1.5) - amp * math.sin(phase), y + sd * length))
    return ribbon_strip(pts, width, front, back, edge, twist_at=twist, fork=True, edge_w=0.7)


def festoons(c):
    """Deux festons de laurier, liés de pourpre, suspendus aux volutes des chapiteaux et aux rosaces de l'architrave."""
    dark = c.grad("lf-dark", [(0, "#58753A"), (0.5, "#34501E"), (1, "#1C2E0E")], 0, 0, 1, 1)
    mid = c.grad("lf-mid", [(0, "#A9C870"), (0.5, "#678E38"), (1, "#2E4A16")], 0, 0, 1, 1)
    lite = c.grad("lf-lite", [(0, "#CFE39A"), (0.45, "#7FA448"), (1, "#36581A")], 0, 0, 1, 1)
    gl = c.grad("leaf-gold2", [(0, "#FFF2C0"), (0.5, "#E2AE40"), (1, "#8A5A12")], 0, 0, 1, 1)
    rib = c.grad("rib-f", [(0, "#B8489A"), (0.5, "#7E2268"), (1, TYRIAN_D)], 0, 0, 1, 0)
    rib_back = c.grad("rib-b", [(0, "#4A0E40"), (1, "#22051E")], 0, 0, 1, 0)
    gv = gold_v(c)
    emb = emboss(c, "emb-fest", az=230, el=50, scale=1.6, k=0.5)
    back_layer, front_layer, wraps, ends = [], [], [], []
    for side in (-1, 1):
        a = (270 + side * 197, 262)     # sur la volute intérieure du chapiteau
        b = (270 + side * 84, 252)      # sous la rosace de l'architrave
        ctrl = (270 + side * 140, 356)
        rnd = random.Random(40 + side)
        n = 52
        for i in range(n + 1):
            t = i / n
            x, y, tx, ty = swag_point(a, b, ctrl, t)
            nx, ny = -ty, tx
            thick = math.sin(math.pi * t) ** 0.7
            r = 5 + 11 * thick
            toward = -1 if t < 0.5 else 1
            dx, dy = tx * toward, ty * toward

            def fan(u, k):
                vx, vy = dx + nx * u * k, dy + ny * u * k
                return heading(vx, vy)

            for k in range(3):
                u = rnd.uniform(-1, 1)
                bx, by = x + nx * u * r * 0.55, y + ny * u * r * 0.55
                back_layer.append(leaf(bx, by, fan(u, 0.75) + rnd.uniform(-6, 6), 17 + 10 * thick, 6.6 + 3 * thick, dark if k == 0 else mid, "#1A2A0A"))
            for k in range(2):
                u = rnd.uniform(-0.6, 0.6)
                bx, by = x + nx * u * r * 0.4, y + ny * u * r * 0.4
                fill = gl if rnd.random() < 0.22 else lite
                front_layer.append(leaf(bx, by, fan(u, 0.55) + rnd.uniform(-5, 5), 14 + 9 * thick, 5.6 + 2.6 * thick, fill, "#24340F" if fill != gl else "#7A4C10"))
            if rnd.random() < 0.3 and 0.1 < t < 0.9:
                u = rnd.uniform(-0.6, 0.6)
                front_layer.append(f'<circle cx="{f(x + nx * u * r)}" cy="{f(y + ny * u * r)}" r="2.5" fill="{gv}" stroke="{GOLD_LO}" stroke-width="0.4"/>')
        # trois liens de pourpre cerclés d'or serrent le feston
        for t in (0.27, 0.5, 0.73):
            x, y, tx, ty = swag_point(a, b, ctrl, t)
            nx, ny = -ty, tx
            r = 5 + 11 * math.sin(math.pi * t) ** 0.7 + 2
            x1, y1, x2, y2 = x + nx * r, y + ny * r, x - nx * r, y - ny * r
            qx, qy = x + tx * 4, y + ty * 4
            d = f"M{f(x1)} {f(y1)} Q{f(qx)} {f(qy)} {f(x2)} {f(y2)}"
            wraps.append(f'<path d="{d}" fill="none" stroke="{GOLD_LO}" stroke-width="7.6" stroke-linecap="round"/>'
                         f'<path d="{d}" fill="none" stroke="{gv}" stroke-width="6.4" stroke-linecap="round"/>'
                         f'<path d="{d}" fill="none" stroke="{rib}" stroke-width="3" stroke-linecap="round"/>')
        # nœuds et rubans qui tombent
        for (ex, ey), ln, amp, ph in ((a, 66, 5 * side, 0.3), (b, 50, -4 * side, 1.2)):
            ends.append(falling_tail(ex - 3, ey + 2, ln, amp, ph, 6.4, rib, rib_back, GOLD))
            ends.append(falling_tail(ex + 3, ey + 2, ln * 0.82, -amp, ph + 0.8, 6.0, rib, rib_back, GOLD, twist=0.45))
            ends.append(bow(ex, ey, 0.82, rib, GOLD))
            ends.append(rosette(ex, ey, 7.5, gv, GOLD_LO))
    sh = c.shadow("fest-sh", 0, 5, 3.5, "#120800", 0.55)
    c.add(f'<g filter="{sh}"><g filter="{emb}">{"".join(back_layer)}{"".join(front_layer)}</g></g>')
    c.add(f'<g filter="{c.shadow("wrap-sh", 0, 1.5, 1, "#100008", 0.5)}">{"".join(wraps)}</g>')
    c.add(f'<g filter="{c.shadow("end-sh", 0, 4, 3, "#100008", 0.5)}">{"".join(ends)}</g>')


# ---------------------------------------------------------------- les marches, les nuées

def steps(c):
    vein = veins(c, "veins-steps", seed=12, freq="0.004 0.03", color="#7A8597", strength=1.0)
    y = STEPS[0]
    for i, (h_top, h_rise, inset) in enumerate(((4, 8, 0), (4, 8, 0), (4, 8, 0))):
        c.add(f'<rect x="{inset}" y="{y}" width="{W - 2 * inset}" height="{h_top}" fill="#FFFCF4"/>')
        c.add(f'<rect x="{inset}" y="{y + h_top}" width="{W - 2 * inset}" height="{h_rise}" fill="{marble_v(c, f"rise{i}", "#E4DACA", "#B7A88F")}"/>')
        c.add(f'<rect x="{inset}" y="{y}" width="{W - 2 * inset}" height="{h_top + h_rise}" fill="#FFFFFF" filter="{vein}" opacity="0.45"/>')
        c.add(f'<line x1="0" y1="{y + h_top}" x2="{W}" y2="{y + h_top}" stroke="{GOLD}" stroke-width="0.8" opacity="0.7"/>')
        y += h_top + h_rise
    c.add(f'<rect x="0" y="{y}" width="{W}" height="6" fill="#2A1430" opacity="0.5" filter="{c.blur("step-sh", 3)}"/>')


def lower_clouds(c):
    """L'aurore se lève sous la mer de nuées : un soleil d'or à demi noyé, ses rayons fendent les nuages."""
    c.def_once("below-steps", f'<clipPath id="{c.id("below-steps")}"><rect x="0" y="{STEPS[1] + 1}" width="{W}" height="{H}"/></clipPath>')
    clip = f'clip-path="url(#{c.id("below-steps")})"'
    c.add(f'<g {clip}>')
    c.add(f'<rect x="0" y="{STEPS[1]}" width="{W}" height="{H - STEPS[1]}" fill="{c.grad("dawn-sky", [(0, "#F7C98C"), (0.35, "#E8907E"), (0.7, "#7E4A86"), (1, "#2A1846")])}"/>')
    sx, sy = 270, 900
    c.add(f'<ellipse cx="{sx}" cy="{sy}" rx="360" ry="210" fill="{c.rgrad("sun-glow", [(0, "#FFF6D8", 1), (0.22, "#FFDD94", 0.85), (0.55, "#F49A6C", 0.35), (1, "#F49A6C", 0)])}"/>')
    rnd = random.Random(14)
    beams = []
    for i in range(34):
        a = -88 + i * (176 / 33) + rnd.uniform(-1.2, 1.2)
        x1, y1 = pt(sx, sy, 40, a)
        x2, y2 = pt(sx, sy, 520, a)
        w = 3 + 9 * (i % 3 == 0) + rnd.uniform(0, 4)
        beams.append(f'<path d="M{f(x1)} {f(y1)} L{f(pt(sx, sy, 520, a - w / 9)[0])} {f(pt(sx, sy, 520, a - w / 9)[1])} L{f(pt(sx, sy, 520, a + w / 9)[0])} {f(pt(sx, sy, 520, a + w / 9)[1])} Z" fill="#FFF0C6" opacity="{f(rnd.uniform(0.1, 0.26))}"/>')
    c.add(f'<g filter="{c.blur("beams", 2.2)}">{"".join(beams)}</g>')
    c.add(f'<circle cx="{sx}" cy="{sy}" r="58" fill="#FFFBEA" filter="{c.blur("sun", 12)}"/>')
    c.add("</g>")
    cloud_bank(c, "cb-mid", 800, -70, 610, 23, 16, 28, 56, "#FFF1D0", "#E9A48C", "#FFF8E6", dy=12, op=1, blur=1.2, lift=4, shade="#B0688A")
    cloud_bank(c, "cb-low", 872, -60, 600, 31, 14, 36, 64, "#FFD9AA", "#B6708E", "#FFEACB", dy=16, op=1, blur=1.1, lift=4, shade="#5E3A72")
    cloud_bank(c, "cb-front", 950, -50, 590, 41, 12, 40, 62, "#C98E9E", "#3A2252", "#FFD2A4", dy=10, op=1, blur=1.0, lift=4, shade="#1A0E2E")
    # le stylobate jette son ombre sur les premières nuées
    c.add(f'<rect x="0" y="{STEPS[1]}" width="{W}" height="18" fill="#3A1A3A" opacity="0.35" filter="{c.blur("stylo-sh2", 5)}"/>')


def phyllobolia(c):
    """La pluie de feuilles : à Olympie, on jetait au vainqueur des feuilles et des fleurs (phyllobolia).

    Trois plans : quelques feuilles d'or lointaines le long des colonnes, puis, au premier plan, deux grandes
    feuilles floues qui passent devant l'objectif — la profondeur de champ d'une vraie photo."""
    lg = c.grad("leaf-gold", [(0, "#FFF5C8"), (0.5, "#EDBB46"), (1, "#9A6514")], 0, 0, 1, 1)
    lf = c.grad("leaf-green", [(0, LAUREL_HI), (0.5, "#6E8A3C"), (1, "#2E4418")], 0, 0, 1, 1)
    far = [(22, 236, 150, 0.55, "g"), (512, 214, -140, 0.55, "g"), (70, 330, -30, 0.6, "g"), (470, 350, 40, 0.6, "v"),
           (18, 520, 110, 0.6, "g"), (524, 470, -100, 0.62, "g"), (66, 600, 20, 0.55, "v"), (476, 620, -20, 0.55, "g")]
    out = "".join(leaf(x, y, a, 27 * s, 10 * s, lg if k == "g" else lf, "#6A420E" if k == "g" else "#24340F") for x, y, a, s, k in far)
    c.add(f'<g filter="{c.shadow("phy-sh", 2, 4, 2.5, "#100400", 0.45)}"><g filter="{emboss(c, "emb-phy", az=230, el=50, scale=1.5, k=0.5)}">{out}</g></g>')


def dust(c):
    rnd = random.Random(77)
    out = []
    for _ in range(70):
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        if WIN[0] + 10 < x < WIN[2] - 10 and WIN[1] + 30 < y < WIN[3] - 20:
            continue
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(0.5, 1.8))}" fill="#FFE8A8" opacity="{f(rnd.uniform(0.3, 0.9))}"/>')
    c.add(f'<g>{"".join(out)}</g>')
    c.add("".join(sparkle(x, y, r, "#FFF6DA", 0.95) for x, y, r in ((470, 258, 8), (64, 712, 7), (512, 600, 5), (30, 330, 5))))


def card_border(c):
    c.add(f'<rect x="7" y="7" width="{W - 14}" height="{H - 14}" rx="22" fill="none" stroke="{gold_d(c)}" stroke-width="3"/>')
    c.add(f'<rect x="12" y="12" width="{W - 24}" height="{H - 24}" rx="18" fill="none" stroke="{GOLD}" stroke-width="0.8" opacity="0.6"/>')


def frame(c, people=2):
    if people == 3:
        photo3(c)
    else:
        photo(c)
    sky(c)
    card_border(c)
    window_frame(c)
    for x in COLS:
        column(c, x)
    entablature(c)
    pediment(c)
    victory_wings(c)
    acroteria(c)
    crest_and_wreath(c)
    festoons(c)
    steps(c)
    lower_clouds(c)
    phyllobolia(c)
    dust(c)


# ---------------------------------------------------------------- inscriptions

from base import plate_layer  # noqa: E402  la couche « plate » et ses emplacements de texte


@plate_layer
def text_block(c, y_kicker, y_title, y_msg, y_date, message, ink, accent, title_fill, msg_fill, halo=None, size=40):
    if halo:
        c.add(f'<text x="270" y="{y_title}" text-anchor="middle" font-family="{CINZEL}" font-weight="700" font-size="{size}" fill="none" stroke="{halo}" stroke-width="5" opacity="0.55" filter="{c.blur("txt-h", 2)}">{esc(TITLE)}</text>')
    c.add(f'<text x="270" y="{y_kicker}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="12.5" letter-spacing="4.2" fill="{accent}">{esc(KICKER.upper())}</text>')
    c.add(f'<text x="270" y="{y_title}" text-anchor="middle" font-family="{CINZEL}" font-weight="700" font-size="{size}" fill="{title_fill}">{esc(TITLE)}</text>')
    if message:
        c.add(f'<text x="270" y="{y_msg}" text-anchor="middle" font-family="{HAND}" font-weight="700" font-size="29" fill="{msg_fill}">{esc(message)}</text>')
    c.add(f'<text x="270" y="{y_date}" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="12" letter-spacing="1.2" fill="{accent}" opacity="0.95">{esc(DATE)}</text>')


def title_gold(c):
    return c.grad("title-gold", [(0, "#FFFBE8"), (0.45, "#FBDD8A"), (0.7, "#E9B847"), (1, "#C08A2A")])


def ansa(x0, y, h, m):
    """Une anse en queue d'aronde, accrochée au flanc de la table (m = -1 à gauche, +1 à droite)."""
    def P(dx, fy):
        return f"{f(x0 + m * dx)} {f(y + h * fy)}"
    outer = f"M{P(0, 0.33)} Q{P(18, 0.27)} {P(44, 0.06)} Q{P(33, 0.5)} {P(44, 0.94)} Q{P(18, 0.73)} {P(0, 0.67)} Z"
    inner = f"M{P(4, 0.38)} Q{P(19, 0.33)} {P(37, 0.17)} Q{P(28, 0.5)} {P(37, 0.83)} Q{P(19, 0.67)} {P(4, 0.62)} Z"
    return outer, inner


@plate_layer
def cartouche(c, message=None, adinkra=False):
    """Tabula ansata : une table de lapis-lazuli piquée de pyrite, cerclée d'or, à deux anses en queue d'aronde.

    `adinkra` : les anses portent l'Akoma ntoaso (les cœurs liés) et le filet devient la chaîne Nkonsonkonson."""
    h = 142 if message else 114
    y = 760 if message else 772
    x0, x1 = 104, 436
    gv = gold_v(c)
    lapis = c.grad("tab", [(0, "#1D4192"), (0.5, "#10296A"), (1, "#071233")])
    lapis_in = c.grad("tab-in", [(0, "#173A86"), (1, "#081640")])
    body = f"M{x0} {y} L{x1} {y} L{x1} {y + h} L{x0} {y + h} Z"
    lo, li = ansa(x0, y, h, -1)
    ro, ri = ansa(x1, y, h, 1)
    c.add(f'<g filter="{c.shadow("tab-sh", 0, 10, 10, "#0A0418", 0.7)}"><path d="{lo}" fill="{gv}" stroke="{GOLD_LO}" stroke-width="0.8"/><path d="{ro}" fill="{gv}" stroke="{GOLD_LO}" stroke-width="0.8"/>'
          f'<path d="{body}" fill="{lapis}"/></g>')
    c.add(f'<path d="{li}" fill="{lapis_in}" stroke="{GOLD_LO}" stroke-width="0.6"/><path d="{ri}" fill="{lapis_in}" stroke="{GOLD_LO}" stroke-width="0.6"/>')
    c.add(gold_flecks(x0 + 4, y + 4, x1 - 4, y + h - 4, 120, 5))
    c.add(f'<rect x="{x0 + 1.5}" y="{y + 1.5}" width="{x1 - x0 - 3}" height="{h - 3}" fill="none" stroke="{gv}" stroke-width="4"/>')
    c.add(f'<rect x="{x0 + 4}" y="{y + 4}" width="{x1 - x0 - 8}" height="{h - 8}" fill="none" stroke="#02081E" stroke-width="1.4" opacity="0.7"/>')
    c.add(f'<rect x="{x0 + 9}" y="{y + 9}" width="{x1 - x0 - 18}" height="{h - 18}" fill="none" stroke="{GOLD}" stroke-width="0.9" opacity="0.8"/>')
    for (cx, cy) in ((x0 + 9, y + 9), (x1 - 9, y + 9), (x0 + 9, y + h - 9), (x1 - 9, y + h - 9)):
        c.add(f'<path d="M{cx} {cy - 4} L{cx + 4} {cy} L{cx} {cy + 4} L{cx - 4} {cy} Z" fill="{gv}" stroke="{GOLD_LO}" stroke-width="0.5"/>')
    if adinkra:
        emb = emboss(c, "emb-adk", az=225, el=45, scale=1.6, k=0.8)
        c.add(f'<g filter="{emb}">{adinkrahene(x0 - 20, y + h / 2, 0.42, gv, 3.4)}{adinkrahene(x1 + 20, y + h / 2, 0.42, gv, 3.4)}</g>')
        c.add(f'<g filter="{emb}">{nkonsonkonson(184, 356, y + 40, 0.82, gv, 1.5)}</g>')
        # le sceau des cœurs liés, à la place de la palmette
        my = y - 8
        c.add(f'<circle cx="270" cy="{my}" r="38" fill="{c.rgrad("seal-halo", [(0, "#FFE7A0", 0.75), (1, "#FFE7A0", 0)])}" />')
        c.add(f'<g filter="{c.shadow("seal-sh", 0, 4, 4, "#0A0418", 0.6)}"><circle cx="270" cy="{my}" r="26" fill="{gv}" stroke="{GOLD_LO}" stroke-width="0.8"/></g>')
        c.add("".join(f'<circle cx="{f(pt(270, my, 23.4, a)[0])}" cy="{f(pt(270, my, 23.4, a)[1])}" r="1.1" fill="{GOLD_LO}" opacity="0.7"/>' for a in range(0, 360, 15)))
        c.add(f'<circle cx="270" cy="{my}" r="21" fill="{lapis_in}" stroke="{GOLD_LO}" stroke-width="0.6"/>')
        c.add(f'<g filter="{emb}">{akoma_ntoaso(270, my, 0.82, gv, GOLD_LO)}</g>')
    else:
        for bx in (x0 - 20, x1 + 20):
            c.add(f'<circle cx="{bx}" cy="{y + h / 2}" r="5.5" fill="{gv}" stroke="{GOLD_LO}" stroke-width="0.6"/><circle cx="{bx - 1.6}" cy="{y + h / 2 - 1.6}" r="1.6" fill="#FFFFFF" opacity="0.7"/>')
        c.add(f'<line x1="196" y1="{y + 40}" x2="344" y2="{y + 40}" stroke="{GOLD}" stroke-width="0.8" opacity="0.7"/><path d="M270 {y + 36} l4 4 l-4 4 l-4 -4 Z" fill="{GOLD}"/>')
    if not adinkra:
        c.add(f'<g filter="{emboss(c)}">{palmette(270, y + 3, 0.7, gv, GOLD_LO)}</g>')
    if message:
        text_block(c, y + 30, y + 78, y + 108, y + 127, message, IVORY, GOLD, title_gold(c), "#FFF1D2", size=38)
    else:
        text_block(c, y + 30, y + 78, None, y + 100, None, IVORY, GOLD, title_gold(c), "#FFF1D2", size=38)


RIB_CY = 832
RIB_X = (92, 448)


@plate_layer
def ribbon(c, message=None, held=False):
    """Banderole de pourpre bordée d'or ; quand `held`, ses bouts remontent jusqu'au bec de Mee et Meo."""
    rib = c.grad("ban", [(0, "#A3388A"), (0.45, "#74205F"), (1, "#3A0B32")])
    back = c.grad("ban-back", [(0, "#4A0E40"), (1, "#22051E")])
    gv = gold_v(c)
    cy = RIB_CY
    x0, x1 = RIB_X
    top_l, top_c = cy - 36, cy - 56
    bot_l, bot_c = cy + 34, cy + 14
    tails = ""
    if not held:
        tails = (
            f'<path d="M{x0 + 6} {top_l + 12} L{x0 - 46} {top_l + 24} L{x0 - 28} {cy + 18} L{x0 - 52} {bot_l + 22} L{x0 + 6} {bot_l + 8} Z" fill="{back}" stroke="{GOLD}" stroke-width="1"/>'
            f'<path d="M{x1 - 6} {top_l + 12} L{x1 + 46} {top_l + 24} L{x1 + 28} {cy + 18} L{x1 + 52} {bot_l + 22} L{x1 - 6} {bot_l + 8} Z" fill="{back}" stroke="{GOLD}" stroke-width="1"/>'
        )
    main = f"M{x0} {top_l} Q270 {top_c} {x1} {top_l} L{x1} {bot_l} Q270 {bot_c} {x0} {bot_l} Z"
    c.add(f'<g filter="{c.shadow("ban-sh", 0, 8, 8, "#0A0418", 0.65)}">{tails}<path d="{main}" fill="{rib}"/></g>')
    c.add(f'<path d="M{x0} {top_l + 4} Q270 {top_c + 4} {x1} {top_l + 4}" fill="none" stroke="{gv}" stroke-width="2.4"/>')
    c.add(f'<path d="M{x0} {bot_l - 4} Q270 {bot_c - 4} {x1} {bot_l - 4}" fill="none" stroke="{gv}" stroke-width="2.4"/>')
    c.add(f'<path d="M{x0} {top_l + 9} Q270 {top_c + 9} {x1} {top_l + 9}" fill="none" stroke="{GOLD}" stroke-width="0.7" opacity="0.6"/>')
    c.add(f'<path d="M{x0} {bot_l - 9} Q270 {bot_c - 9} {x1} {bot_l - 9}" fill="none" stroke="{GOLD}" stroke-width="0.7" opacity="0.6"/>')
    c.add(f'<path d="M{x0 + 14} {top_l + 16} Q270 {top_c + 4} {x1 - 14} {top_l + 16}" fill="none" stroke="#FFFFFF" stroke-width="6" opacity="0.1"/>')
    arc_id = c.id("ban-arc")
    c.def_once("ban-arc", f'<path id="{arc_id}" d="M{x0 + 12} {cy + 18} Q270 {cy - 14} {x1 - 12} {cy + 18}"/>')
    c.add(f'<text font-family="{CINZEL}" font-weight="700" font-size="34" fill="{title_gold(c)}" text-anchor="middle" stroke="#2A0626" stroke-width="0.6"><textPath href="#{arc_id}" startOffset="50%">{esc(TITLE)}</textPath></text>')
    c.add(f'<text x="270" y="{cy - 30}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="11.5" letter-spacing="4" fill="{GOLD_HI}">{esc(KICKER.upper())}</text>')
    yb = bot_c + 46
    if message:
        c.add(f'<text x="270" y="{yb}" text-anchor="middle" font-family="{HAND}" font-weight="700" font-size="32" fill="#FFF6E2" stroke="#2A1236" stroke-width="5" paint-order="stroke">{esc(message)}</text>')
        yb += 24
    c.add(f'<text x="270" y="{yb}" text-anchor="middle" font-family="{SANS}" font-weight="700" font-size="12" letter-spacing="1.4" fill="{GOLD_HI}" stroke="#2A1236" stroke-width="3.5" paint-order="stroke">{esc(DATE)}</text>')


def ribbon_tails_to_beaks(c, beaks):
    """Les deux bouts de la banderole, remontés jusqu'au bec : dessinés APRÈS les oiseaux."""
    back = c.grad("ban-back", [(0, "#4A0E40"), (1, "#22051E")])
    rib = c.grad("ban", [(0, "#A3388A"), (0.45, "#74205F"), (1, "#3A0B32")])
    cy = RIB_CY
    x0, x1 = RIB_X
    for (bx, by), xe, s in ((beaks[0], x0, 1), (beaks[1], x1, -1)):
        # le pli : le ruban se retourne au bout de la banderole
        fold = f"M{xe} {cy - 36} L{xe - s * 14} {cy - 28} L{xe - s * 6} {cy + 30} L{xe} {cy + 34} Z"
        tail = (
            f"M{xe - s * 14} {cy - 28} Q{f(xe - s * 18)} {cy - 58} {f(bx + s * 5)} {f(by + 2)} "
            f"L{f(bx - s * 5)} {f(by + 3)} Q{f(xe - s * 46)} {cy - 30} {xe - s * 6} {cy + 30} Z"
        )
        c.add(f'<g filter="{c.shadow("tail-sh", 0, 4, 3, "#0A0418", 0.5)}"><path d="{tail}" fill="{back}" stroke="{GOLD}" stroke-width="1.1"/></g>')
        c.add(f'<path d="{fold}" fill="{rib}" stroke="{GOLD}" stroke-width="1"/>')
        c.add(f'<path d="M{f(bx - 6)} {f(by + 1)} L{f(bx + 6)} {f(by + 1)} L{f(bx + 4)} {f(by + 6)} L{f(bx - 4)} {f(by + 6)} Z" fill="{back}" stroke="{GOLD}" stroke-width="0.8"/>')


KX = (96, 444)
K_TOP = (KX[0], RIB_CY - 50, RIB_CY - 70)     # bord haut : (x0, y aux bouts, y du point de contrôle)
K_BOT = (RIB_CY + 34, RIB_CY + 14)


def k_top(x):
    t = (x - KX[0]) / (KX[1] - KX[0])
    return (1 - t) ** 2 * K_TOP[1] + 2 * (1 - t) * t * K_TOP[2] + t * t * K_TOP[1]


def k_bot(x):
    t = (x - KX[0]) / (KX[1] - KX[0])
    return (1 - t) ** 2 * K_BOT[0] + 2 * (1 - t) * t * K_BOT[1] + t * t * K_BOT[0]


@plate_layer
def ribbon_kente(c, message=None):
    """L'étoffe d'honneur : une bande de kente tissée — lisières de blocs or, vert, rouge et noir, champ d'ébène
    au fil d'or — que Mee et Meo tiennent au bec. Le présent qu'on offre à l'hôte d'honneur, porté jusqu'à l'Olympe."""
    x0, x1 = KX
    cy = RIB_CY
    main = f"M{x0} {K_TOP[1]} Q270 {K_TOP[2]} {x1} {K_TOP[1]} L{x1} {K_BOT[0]} Q270 {K_BOT[1]} {x0} {K_BOT[0]} Z"
    field = c.grad("k-field", [(0, "#2A1E10"), (0.5, K_BLACK), (1, "#060402")])
    c.add(f'<g filter="{c.shadow("ban-sh", 0, 8, 8, "#0A0418", 0.65)}"><path d="{main}" fill="{field}"/></g>')
    c.def_once("k-clip", f'<clipPath id="{c.id("k-clip")}"><path d="{main}"/></clipPath>')
    weave = "".join(
        f'<path d="M{x} {f(k_top(x))} L{x} {f(k_bot(x))}" stroke="{K_GOLD}" stroke-width="0.6" opacity="0.09"/>' for x in range(x0 + 3, x1, 4)
    )
    top_band = kente_band_along(c, x0, x1, k_top, 3, 15, block=14, seed=0)
    bot_band = kente_band_along(c, x0, x1, k_bot, -15, -3, block=14, seed=5)
    c.add(f'<g clip-path="url(#{c.id("k-clip")})">{weave}{top_band}{bot_band}</g>')
    gv = gold_v(c)
    c.add(f'<path d="M{x0} {K_TOP[1] + 1.5} Q270 {K_TOP[2] + 1.5} {x1} {K_TOP[1] + 1.5}" fill="none" stroke="{gv}" stroke-width="2.6"/>')
    c.add(f'<path d="M{x0} {K_BOT[0] - 1.5} Q270 {K_BOT[1] - 1.5} {x1} {K_BOT[0] - 1.5}" fill="none" stroke="{gv}" stroke-width="2.6"/>')
    for d in (16.5, -16.5):
        yy = (K_TOP[1] + d + 0.0) if d > 0 else (K_BOT[0] + d)
        cc = (K_TOP[2] + d) if d > 0 else (K_BOT[1] + d)
        c.add(f'<path d="M{x0} {yy} Q270 {cc} {x1} {yy}" fill="none" stroke="{K_GOLD_HI}" stroke-width="0.9" opacity="0.85"/>')
    c.add(f'<path d="M{x0 + 14} {K_TOP[1] + 26} Q270 {K_TOP[2] + 20} {x1 - 14} {K_TOP[1] + 26}" fill="none" stroke="#FFFFFF" stroke-width="7" opacity="0.06"/>')
    arc_id = c.id("ban-arc")
    c.def_once("ban-arc", f'<path id="{arc_id}" d="M{x0 + 12} {cy + 15} Q270 {cy - 17} {x1 - 12} {cy + 15}"/>')
    c.add(f'<text font-family="{CINZEL}" font-weight="700" font-size="34" fill="{title_gold(c)}" text-anchor="middle" stroke="#1A0C02" stroke-width="0.6"><textPath href="#{arc_id}" startOffset="50%">{esc(TITLE)}</textPath></text>')
    kick_id = c.id("k-kick")
    c.def_once("k-kick", f'<path id="{kick_id}" d="M{x0} {K_TOP[1] + 27} Q270 {K_TOP[2] + 27} {x1} {K_TOP[1] + 27}"/>')
    c.add(f'<text font-family="{SANS}" font-weight="800" font-size="11" letter-spacing="4" fill="{K_GOLD_HI}" text-anchor="middle"><textPath href="#{kick_id}" startOffset="50%">{esc(KICKER.upper())}</textPath></text>')
    yb = K_BOT[1] + 52
    if message:
        c.add(f'<text x="270" y="{yb}" text-anchor="middle" font-family="{HAND}" font-weight="700" font-size="32" fill="#FFF6E2" stroke="#2A1236" stroke-width="5" paint-order="stroke">{esc(message)}</text>')
        yb += 24
    c.add(f'<text x="270" y="{yb}" text-anchor="middle" font-family="{SANS}" font-weight="700" font-size="12" letter-spacing="1.4" fill="{GOLD_HI}" stroke="#2A1236" stroke-width="3.5" paint-order="stroke">{esc(DATE)}</text>')


def kente_tails_to_beaks(c, beaks):
    """Les deux bouts de l'étoffe, remontés jusqu'au bec de Mee et Meo, tissés du même kente."""
    pat = kente_pattern(c, "k-tail", 22, 0)
    x0, x1 = KX
    for (bx, by), xe, s in ((beaks[0], x0, 1), (beaks[1], x1, -1)):
        yt, yb = K_TOP[1], K_BOT[0]
        fold = f"M{xe} {yt} L{xe - s * 14} {yt + 8} L{xe - s * 6} {yb - 4} L{xe} {yb} Z"
        tail = (
            f"M{xe - s * 14} {yt + 8} Q{f(xe - s * 18)} {yt - 22} {f(bx + s * 6)} {f(by + 2)} "
            f"L{f(bx - s * 6)} {f(by + 3)} Q{f(xe - s * 48)} {yt + 6} {xe - s * 6} {yb - 4} Z"
        )
        c.add(f'<g filter="{c.shadow("tail-sh", 0, 4, 3, "#0A0418", 0.5)}"><path d="{tail}" fill="{pat}" stroke="{GOLD}" stroke-width="1.2"/></g>')
        c.add(f'<path d="{tail}" fill="#000000" opacity="0.18"/>')
        c.add(f'<path d="{fold}" fill="{K_BLACK}" stroke="{GOLD}" stroke-width="1"/>')
        c.add(f'<path d="M{f(bx - 7)} {f(by + 1)} L{f(bx + 7)} {f(by + 1)} L{f(bx + 5)} {f(by + 7)} L{f(bx - 5)} {f(by + 7)} Z" fill="{K_GOLD}" stroke="{GOLD_LO}" stroke-width="0.8"/>')


@plate_layer
def parchment(c, message=None):
    """Un volumen déroulé : papyrus doré, bâtons d'ébène aux pommeaux d'or."""
    h = 146 if message else 114
    y = 768 if message else 774
    x0, x1 = 92, 448
    paper = c.grad("pap", [(0, "#FBF0D6"), (0.5, "#F1DDB2"), (1, "#E2C690")])
    edge = c.rgrad("pap-edge", [(0.6, "#B07A3A", 0), (1, "#8A5A22", 0.45)], 0.5, 0.5, 0.72)
    body = f"M{x0} {y + 4} Q270 {y - 6} {x1} {y + 4} L{x1} {y + h - 4} Q270 {y + h + 6} {x0} {y + h - 4} Z"
    c.add(f'<g filter="{c.shadow("pap-sh", 0, 10, 10, "#0A0418", 0.7)}"><path d="{body}" fill="{paper}"/></g>')
    c.add(f'<path d="{body}" fill="{edge}"/>')
    c.add(f'<path d="{body}" fill="#FFFFFF" filter="{veins(c, "fibres", seed=19, freq="0.002 0.09", color="#B0874A", strength=0.9)}" opacity="0.35"/>')
    rod = c.grad("rod", [(0, "#5A3A1E"), (0.35, "#C89A62"), (0.5, "#F2D7A6"), (0.7, "#9A6A36"), (1, "#3A2410")], 0, 0, 1, 0)
    gv = gold_v(c)
    for x in (x0 - 2, x1 + 2):
        c.add(f'<rect x="{x - 13}" y="{y - 10}" width="26" height="{h + 20}" rx="13" fill="{rod}" stroke="#4A2C12" stroke-width="0.8"/>')
        c.add(f'<rect x="{x - 4}" y="{y - 26}" width="8" height="{h + 52}" rx="4" fill="{c.grad("ebony", [(0, "#3A2A20"), (0.5, "#120A06"), (1, "#3A2A20")], 0, 0, 1, 0)}"/>')
        c.add(f'<circle cx="{x}" cy="{y - 28}" r="8" fill="{gv}" stroke="{GOLD_LO}" stroke-width="0.8"/><circle cx="{x}" cy="{y + h + 28}" r="8" fill="{gv}" stroke="{GOLD_LO}" stroke-width="0.8"/>')
        c.add(f'<circle cx="{x - 2.5}" cy="{y - 31}" r="2.2" fill="#FFFFFF" opacity="0.7"/><circle cx="{x - 2.5}" cy="{y + h + 25}" r="2.2" fill="#FFFFFF" opacity="0.7"/>')
    c.add(meander(x0 + 22, x1 - 22, y + h - 19, 9, "#A0602A"))
    accent = "#8A2E1A"
    title_fill = c.grad("ink-title", [(0, "#4A2A10"), (1, "#24120A")])
    if message:
        text_block(c, y + 26, y + 66, y + 98, y + 119, message, INK, accent, title_fill, "#3A1E0A")
    else:
        text_block(c, y + 28, y + 70, None, y + 90, None, INK, accent, title_fill, "#3A1E0A")


# ---------------------------------------------------------------- Mee et Meo

POSES = {
    # au pied du cadre, debout sur le stylobate
    "pied": lambda mee, meo: [(mee, 100, 680, 132, False, -4), (meo, 440, 680, 132, True, 4)],
    # perchés sur les rampants du fronton
    "perches": lambda mee, meo: [(mee, 104, 84, 110, False, -6), (meo, 436, 78, 110, True, 6)],
    # penchés par les côtés, à mi-hauteur, derrière les colonnes
    "cotes": lambda mee, meo: [(mee, 52, 462, 150, False, 16), (meo, 488, 540, 150, True, -16)],
    # qui tiennent au bec les extrémités du ruban
    "ruban": lambda mee, meo: [(mee, 58, 736, 108, False, -4), (meo, 482, 736, 108, True, 4)],
    # un seul, en grand, qui pose dans la photo
    "selfie": lambda mee, meo: [(meo, 414, 640, 198, True, 2)],
}


def birds(c, layout, mee, meo):
    for pose, x, y, s, flip, rot in POSES[layout](mee, meo):
        bird(c, pose, x, y, s, flip=flip, rotate=rot)


def beak(pose, x, y, s, flip, rot):
    """Où tombe le bec d'une pose une fois posée (pixels orange de l'image)."""
    import numpy as np
    from PIL import Image
    im = np.array(Image.open(ROOT / "mee" / f"{pose}.png").convert("RGBA")).astype(int)
    r, g, b, a = im[..., 0], im[..., 1], im[..., 2], im[..., 3]
    m = (a > 200) & (r > 220) & (g > 110) & (g < 175) & (b < 80)
    ys, xs = np.nonzero(m)
    h, w = m.shape
    k = s / max(w, h)
    lx, ly = (xs.mean() - w / 2) * k, (ys.mean() - h / 2) * k
    if flip:
        lx = -lx
    t = math.radians(rot)
    return x + lx * math.cos(t) - ly * math.sin(t), y + lx * math.sin(t) + ly * math.cos(t)


# ---------------------------------------------------------------- les déclinaisons

VARIANTS = [
    dict(file="poses-pied", layout="pied", mee="mee-fete", meo="meo-trophee", style="cartouche", message=None,
         name="Le Seuil des Victorieux",
         story="Mee en fête et Meo brandissant sa coupe montent la garde sur le stylobate, au pied des colonnes ioniques ; sous eux, l'aurore se lève sur la mer de nuées de l'Olympe, comme pour les athlètes couronnés au seuil du temple."),
    dict(file="poses-perches", layout="perches", mee="mee-coucou", meo="meo-roi", style="cartouche", message=None,
         name="Les Gardiens du Fronton",
         story="Perchés sur les rampants de marbre, de part et d'autre de l'écu guilloché aux ailes de la Victoire, Mee salue et Meo trône couronné, comme les acrotères vivants du sanctuaire."),
    dict(file="poses-cotes", layout="cotes", mee="mee-wow", meo="meo-bravo", style="cartouche", message=None,
         name="Le Regard entre les Colonnes",
         story="Mee et Meo se penchent depuis le péristyle pour voir la photo, émerveillés et applaudissant, entre les fûts cannelés et sous les festons de laurier liés de pourpre."),
    dict(file="poses-ruban", layout="ruban", mee="mee-sourire", meo="meo-salut", style="kente-tenu", message="Merci la famille",
         name="L'Étoffe d'Honneur",
         story="Comme les colombes des frises antiques, Mee et Meo tiennent au bec une bande de kente, l'étoffe tissée en bandes étroites des Asante et des Ewe qu'on offre à l'hôte d'honneur : l'Ambassadeur la porte jusqu'à l'Olympe."),
    dict(file="poses-selfie", layout="selfie", mee=None, meo="meo-selfie", style="cartouche", message=None,
         name="Le Selfie du Péristyle",
         story="Meo s'invite en grand dans la photo, téléphone levé, sous les festons de laurier noués de pourpre qui pendent des volutes d'or ; la pluie de feuilles d'or d'Olympie (la phyllobolia) tombe le long des colonnes."),
    dict(file="poses-message-cartouche", layout="pied", mee="mee-amoureuse", meo="meo-love", style="cartouche", message="Pour toi, maman",
         name="La Dédicace de Lapis",
         story="Le message est gravé dans une tabula ansata de lapis-lazuli piqué de pyrite, aux anses d'or en queue d'aronde, la table votive des sanctuaires gréco-romains ; les cœurs de Mee et Meo l'escortent."),
    dict(file="poses-message-ruban", layout="perches", mee="mee-bravo", meo="meo-champagne", style="ruban", message="On l'a fait ensemble",
         name="La Banderole de Pourpre",
         story="Une banderole de pourpre tyrienne à queues fourchues porte le titre sur son arc et le message au-dessous ; Mee et Meo trinquent depuis le fronton."),
    dict(file="poses-message-parchemin", layout="cotes", mee="mee-montee-au-ciel", meo="meo-serenade", style="parchemin", message="Le voyage continue",
         name="Le Volumen de l'Aède",
         story="Le message est écrit sur un volumen de papyrus déroulé entre deux bâtons d'ébène à pommeaux d'or, souligné d'une grecque ; Mee monte au ciel sur son nuage et Meo lui joue la sérénade."),
    dict(file="poses-groupe", layout="pied", mee="mee-danse", meo="meo-feu-artifice", style="cartouche-adinkra", message="Ensemble, on va plus loin", people=3,
         name="Les Cœurs Liés",
         story="La photo de groupe à trois prend place sous l'écu ailé de la Victoire ; la table de lapis porte en or l'Akoma ntoaso, les cœurs liés des Adinkra akan, et la chaîne Nkonsonkonson, avec le proverbe africain du chemin fait ensemble."),
]


def held_spots(v):
    """Les places des oiseaux qui tiennent le ruban, ancres corrigées comprises (lib/anchors.json) : le bec bouge,
    la queue suit."""
    return [(pose, *anchored_spot(v["file"], i, x, y, s), flip, rot) for i, (pose, x, y, s, flip, rot) in enumerate(POSES[v["layout"]](v["mee"], v["meo"]))]


def held(c, draw):
    """Les queues du ruban tenues au bec SUIVENT les oiseaux (`data-follows-bird`) : elles ne sont pas du décor."""
    start = len(c.body)
    draw()
    inner = "".join(c.body[start:])
    del c.body[start:]
    c.add(f'<g data-follows-bird="ruban">{inner}</g>')


def build(v):
    c = Card("p-" + v["file"].replace("poses-", ""))
    c.slots(kicker=KICKER, title=TITLE, message=v["message"], date=DATE)
    frame(c, v.get("people", 2))
    style = v["style"]
    if style == "ruban-tenu":
        ribbon(c, v["message"], held=True)
        birds(c, v["layout"], v["mee"], v["meo"])
        held(c, lambda: ribbon_tails_to_beaks(c, [beak(*sp) for sp in held_spots(v)]))
    elif style == "kente-tenu":
        ribbon_kente(c, v["message"])
        birds(c, v["layout"], v["mee"], v["meo"])
        held(c, lambda: kente_tails_to_beaks(c, [beak(*sp) for sp in held_spots(v)]))
    elif style == "cartouche-adinkra":
        cartouche(c, v["message"], adinkra=True)
        birds(c, v["layout"], v["mee"], v["meo"])
    else:
        {"cartouche": cartouche, "ruban": ribbon, "parchemin": parchment}[style](c, v["message"])
        birds(c, v["layout"], v["mee"], v["meo"])
    c.save(OUT / f"{v['file']}.svg")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1].split(",")) if len(sys.argv) > 1 else None
    for v in VARIANTS:
        if only and v["file"] not in only:
            continue
        build(v)
    manifest = [
        {
            "file": v["file"] + ".jpg",
            "rank": "Ambassadeur",
            "division": 1,
            "option": v["file"].replace("poses-", ""),
            "name": v["name"],
            "story": v["story"],
            "layout": v["layout"],
            "message": v["message"],
        }
        for v in VARIANTS
    ]
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
