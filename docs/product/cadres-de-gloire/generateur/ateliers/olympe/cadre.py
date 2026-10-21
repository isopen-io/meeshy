"""Pièces communes des cadres « Olympe » : stèle de l'inscription, bordure, couronne ovale, guirlandes."""

import math
import random

from common import *  # noqa: F401,F403
from common import f, pt, W, H, METALS, Card, inscription, gold_fill, gold_h, gold_v, marble_filter, relief, soft
from ornements import meander, palmette, rosette, beads, oves, leaf_d, wreath, branch, quad_points, star8, waves, spiral
from base import crest, mee_meo, bird, CINZEL, CINZEL_DECO, GARAMOND, SANS, HAND, esc

DATE = "10 octobre 2026"

STELE = {
    # fond, bord, encre du titre, accent (sur-titre, date), couleur du message
    "marbre": (None, "gold", "#2A1C0E", "#94650F", "#5A1A4E"),
    "lapis": (("#16447E", "#0B2447", "#06152C"), "gold", "#FFF4D6", "#F2C45A", "#FFE7A8"),
    "pourpre": (("#6A1A5C", "#3E0C36", "#200518"), "gold", "#FFF1D2", "#F2C45A", "#FFD9F0"),
    "nuit": (("#18244A", "#0C1430", "#060A1C"), "silver", "#F3F6FF", "#C9D6F2", "#FFE6A0"),
    "aube": (("#5A1E14", "#2E0E0A", "#160604"), "redgold", "#FFF0D8", "#FFC46A", "#FFE2B0"),
    "argile": (("#E08A4A", "#C8642E", "#9A4418"), "gold", "#17110D", "#4A1606", "#17110D"),
    "obsidienne": (("#1C1730", "#0C0A18", "#040308"), "gold", "#FFF4D6", "#F2C45A", "#FFE6A0"),
    "prisme": (("#1A1240", "#0C0824", "#05030F"), "prism", "#FFFFFF", "#E9DDFF", "#FFE6F6"),
}


def stele(card, style="lapis", y=752, message=None, x0=64, x1=476, title="", orn="palmette", title_size=38, kicker=KICKER,
          seal=None, rim_w=1.8):
    """La stèle de l'inscription : un panneau (marbre, lapis, porphyre, nuit, obsidienne, prisme) à double filet,
    acrotère en palmette ou rosettes d'angle, et le texte posé dessus."""
    bg, rim, ink, accent, msg = STELE[style]
    h = 140 if message else 112
    top = y - 4
    out = []
    shp = f'<rect x="{f(x0)}" y="{f(top)}" width="{f(x1 - x0)}" height="{f(h)}" rx="10"/>'
    out.append(f'<rect x="{f(x0)}" y="{f(top + 6)}" width="{f(x1 - x0)}" height="{f(h)}" rx="10" fill="#000000" opacity="0.45" filter="{card.blur("stele-sh", 8)}"/>')
    if style == "marbre":
        mf = marble_filter(card, "stele-mb", seed=11, freq=(0.006, 0.02), warp=50, vein="#8A8276", vein_op=0.55, cloud="#CFC6B6", cloud_op=0.35)
        g = card.grad("stele-mg", [(0, "#FFFFFF"), (0.5, "#F3EEE4"), (1, "#DCD3C2")])
        out.append(f'<g filter="{mf}"><rect x="{f(x0)}" y="{f(top)}" width="{f(x1 - x0)}" height="{f(h)}" rx="10" fill="{g}"/></g>')
    elif style == "prisme":
        g = card.grad("stele-bg", [(0, bg[0]), (0.5, bg[1]), (1, bg[2])])
        out.append(f'<rect x="{f(x0)}" y="{f(top)}" width="{f(x1 - x0)}" height="{f(h)}" rx="10" fill="{g}" opacity="0.92"/>')
    else:
        g = card.grad(f"stele-bg-{style}", [(0, bg[0]), (0.45, bg[1]), (1, bg[2])])
        out.append(f'<rect x="{f(x0)}" y="{f(top)}" width="{f(x1 - x0)}" height="{f(h)}" rx="10" fill="{g}" opacity="0.94"/>')
        out.append(f'<rect x="{f(x0)}" y="{f(top)}" width="{f(x1 - x0)}" height="{f(h * 0.45)}" rx="10" fill="{card.grad("stele-sheen", [(0, "#FFFFFF"), (1, "#FFFFFF")])}" opacity="0.06"/>')
    if rim == "prism":
        rf = card.prism("stele-prism", 0, 0, 1, 1)
        hi = "#FFFFFF"
    else:
        rf = card.grad(f"stele-rim-{rim}", [(0, METALS[rim][0]), (0.3, METALS[rim][1]), (0.5, METALS[rim][2]), (0.7, METALS[rim][1]), (1, METALS[rim][0])], 0, 0, 1, 1)
        hi = METALS[rim][0]
    out.append(f'<rect x="{f(x0)}" y="{f(top)}" width="{f(x1 - x0)}" height="{f(h)}" rx="10" fill="none" stroke="{rf}" stroke-width="{rim_w + 1}"/>')
    out.append(f'<rect x="{f(x0 + 7)}" y="{f(top + 7)}" width="{f(x1 - x0 - 14)}" height="{f(h - 14)}" rx="6" fill="none" stroke="{rf}" stroke-width="0.9" opacity="0.8"/>')
    if orn == "palmette":
        out.append(f'<g filter="{card.shadow("stele-orn", 0, 1.5, 1.5, "#000000", 0.5)}">{palmette(270, top + 2, 30, rf, 9, 150, True)}</g>')
    elif orn == "rosettes":
        for x in (x0 + 7, x1 - 7):
            out.append(rosette(x, top + h / 2, 9, rf, 8, hi))
    elif orn == "stars":
        for x in (x0 + 18, x1 - 18):
            out.append(star8(x, top + h / 2, 9, rf))
    card.add("".join(out))
    inscription(card, title, message=message, y=y, style="nu", ink=ink, accent=accent, title_size=title_size, kicker=kicker,
                message_color=msg, shadow=style not in ("marbre", "argile"))


def frame_border(card, metal="gold", m=10, w=2.4, inner=True, r=22):
    hi, mid, lo = METALS[metal]
    g = card.grad(f"fb-{metal}", [(0, hi), (0.25, mid), (0.5, lo), (0.75, mid), (1, hi)], 0, 0, 1, 1)
    card.add(f'<rect x="{m}" y="{m}" width="{W - 2 * m}" height="{H - 2 * m}" rx="{r}" fill="none" stroke="{lo}" stroke-width="{w + 2}" opacity="0.8"/>')
    card.add(f'<rect x="{m}" y="{m}" width="{W - 2 * m}" height="{H - 2 * m}" rx="{r}" fill="none" stroke="{g}" stroke-width="{w}"/>')
    if inner:
        card.add(f'<rect x="{m + 7}" y="{m + 7}" width="{W - 2 * m - 14}" height="{H - 2 * m - 14}" rx="{r - 6}" fill="none" stroke="{mid}" stroke-width="0.8" opacity="0.65"/>')


def oval_wreath(cx, cy, rx, ry, fill, under=None, rib=None, berries=None, n=26, L=30, w=11, gap=40, bottom_gap=22, seed=4, angle=38):
    """Une couronne d'olivier ovale : deux rameaux qui montent depuis le nœud du bas le long d'une ellipse."""
    rnd = random.Random(seed)
    out = []

    def E(a):
        r = math.radians(a)
        return cx + rx * math.sin(r), cy - ry * math.cos(r)

    for m in (-1, 1):
        a0 = 180 + bottom_gap / 2 if m < 0 else 180 - bottom_gap / 2
        a1 = 360 - gap / 2 if m < 0 else gap / 2
        angs = [a0 + (a1 - a0) * i / (n - 1) for i in range(n)]
        stem = [E(a) for a in angs]
        out.append(f'<path d="M{" L".join(f"{f(x)} {f(y)}" for x, y in stem)}" fill="none" stroke="{fill}" stroke-width="{f(w * 0.24)}" stroke-linecap="round"/>')
        for i, a in enumerate(angs):
            x, y = E(a)
            xn, yn = E(a + (0.5 if (a1 > a0) else -0.5))
            tang = math.degrees(math.atan2(xn - x, -(yn - y)))
            t = i / (n - 1)
            k = 1 - 0.35 * t
            for side in (-1, 1):
                rot = tang + side * (angle + rnd.uniform(-6, 6))
                col = under if (under and (i + (side > 0)) % 3 == 0) else fill
                out.append(f'<g transform="translate({f(x)} {f(y)}) rotate({f(rot)})"><path d="{leaf_d(L * k, w * k)}" fill="{col}"/>'
                           + (f'<path d="M0 {f(-L * k * 0.1)} L0 {f(-L * k * 0.85)}" stroke="{rib}" stroke-width="{f(w * k * 0.09)}" opacity="0.7"/>' if rib else "")
                           + "</g>")
            if berries and i % 3 == 1 and t < 0.92:
                bx, by = x + (cx - x) * 0.06, y + (cy - y) * 0.06
                out.append(f'<ellipse cx="{f(bx)}" cy="{f(by)}" rx="{f(w * 0.36)}" ry="{f(w * 0.46)}" fill="{berries}"/>'
                           f'<circle cx="{f(bx - w * 0.1)}" cy="{f(by - w * 0.15)}" r="{f(w * 0.12)}" fill="#FFFFFF" opacity="0.6"/>')
    return "".join(out)


def festoon(card, x0, y0, x1, y1, sag, fill, under=None, rib=None, n=16, L=18, w=7, seed=2, ribbon=None, berries=None):
    """Une guirlande de laurier suspendue entre deux points (feston) : feuilles serrées qui convergent vers le creux."""
    rnd = random.Random(seed)
    mx = (x0 + x1) / 2
    pts = quad_points((x0, y0), (mx, max(y0, y1) + sag * 2), (x1, y1), n)
    out = []
    for i, (x, y, a, t) in enumerate(pts):
        k = 0.8 + 0.45 * math.sin(math.pi * t)
        dirn = a if t < 0.5 else a + 180
        for j, side in enumerate((-1, 1, 0)):
            rot = dirn + side * (30 + rnd.uniform(-6, 6))
            col = under if (under and (i + j) % 3 == 0) else fill
            out.append(f'<g transform="translate({f(x)} {f(y)}) rotate({f(rot)})"><path d="{leaf_d(L * k, w * k)}" fill="{col}"/>'
                       + (f'<path d="M0 {f(-L * k * 0.1)} L0 {f(-L * k * 0.8)}" stroke="{rib}" stroke-width="0.6" opacity="0.7"/>' if rib else "") + "</g>")
        if berries and i % 2 == 0 and 0.1 < t < 0.9:
            out.append(f'<circle cx="{f(x)}" cy="{f(y + 2)}" r="{f(w * 0.38)}" fill="{berries}"/>')
    if ribbon:
        for x, y in ((x0, y0), (x1, y1)):
            out.append(f'<path d="M{f(x)} {f(y)} q-7 20 -3 38 l6 -7 l6 5 q-3 -20 -9 -36Z" fill="{ribbon}"/>'
                       f'<circle cx="{f(x)}" cy="{f(y)}" r="5" fill="{fill}"/>')
    return "".join(out)


def gold_dust(seed, n, region=(0, 0, W, H), color="#FFE6A0", rmax=1.6, keep=None, sparkles=0.1):
    from base import sparkle
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if keep and not keep(x, y):
            continue
        r = rnd.uniform(0.4, rmax)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{color}" opacity="{f(rnd.uniform(0.4, 1))}"/>')
        if rnd.random() < sparkles:
            out.append(sparkle(x, y, r * 4.5, color, 0.85))
    return "".join(out)


def sunburst(cx, cy, r0, r1, n, color, w0=6, op=0.35, a0=0, a1=360):
    """Une gloire : rayons triangulaires alternés autour d'un point."""
    out = []
    for i in range(n):
        a = a0 + (a1 - a0) * i / n
        L = r1 if i % 2 == 0 else r1 * 0.72
        xa, ya = pt(cx, cy, r0, a - w0 / 2)
        xb, yb = pt(cx, cy, r0, a + w0 / 2)
        xt, yt = pt(cx, cy, L, a)
        out.append(f"M{f(xa)} {f(ya)} L{f(xt)} {f(yt)} L{f(xb)} {f(yb)}Z")
    return f'<path d="{" ".join(out)}" fill="{color}" opacity="{f(op)}"/>'
