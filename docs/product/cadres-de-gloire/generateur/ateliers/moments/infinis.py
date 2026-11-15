"""Les deux infinis : des médaillons d'échelle, de la Terre à la toile cosmique, de la cellule aux quarks."""

import math
import random

from base import f, pt, galaxy, sparkle
from kit import clip, circle_d, halo


def _earth(card, cx, cy, r):
    sea = card.rgrad("ear-s", [(0, "#7FD0FF", 1), (0.6, "#2A7AD8", 1), (1, "#0A2A6A", 1)], 0.35, 0.35, 0.7)
    rnd = random.Random(3)
    land = []
    for x, y, s in ((-0.3, -0.2, 0.42), (0.25, 0.15, 0.36), (0.05, -0.5, 0.22), (-0.15, 0.45, 0.2)):
        pts = [(cx + (x + s * math.cos(a) * rnd.uniform(0.6, 1.1)) * r, cy + (y + s * math.sin(a) * rnd.uniform(0.6, 1.1)) * r) for a in (i * math.pi / 4 for i in range(8))]
        land.append("M" + " L".join(f"{f(px)} {f(py)}" for px, py in pts) + " Z")
    return (
        f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.62)}" fill="{sea}"/>'
        f'<g clip-path="{clip(card, circle_d(cx, cy, r * 0.62), "ear-c")}"><path d="{" ".join(land)}" fill="#5AC27A" transform="scale(1)"/>'
        f'<circle cx="{f(cx + r * 0.25)}" cy="{f(cy + r * 0.2)}" r="{f(r * 0.62)}" fill="#000000" opacity="0.35"/></g>'
        f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.66)}" fill="none" stroke="#9FD8FF" stroke-width="1.4" opacity="0.7"/>'
    )


def _sun(card, cx, cy, r):
    rays = "".join(
        f'<line x1="{f(pt(cx, cy, r * 0.5, a)[0])}" y1="{f(pt(cx, cy, r * 0.5, a)[1])}" x2="{f(pt(cx, cy, r * (0.85 if i % 2 else 0.95), a)[0])}" '
        f'y2="{f(pt(cx, cy, r * (0.85 if i % 2 else 0.95), a)[1])}" stroke="#FFC24A" stroke-width="1.3" stroke-linecap="round"/>'
        for i, a in enumerate(range(0, 360, 20))
    )
    g = card.rgrad("sun-g", [(0, "#FFFFFF", 1), (0.4, "#FFE08A", 1), (1, "#FF7A1E", 1)])
    return halo(card, cx, cy, r * 0.95, "#FFB347", 0.6, "sun-h") + rays + f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.46)}" fill="{g}"/>'


def _galaxy(card, cx, cy, r):
    return halo(card, cx, cy, r * 0.8, "#B9A7FF", 0.5, "gx-h") + galaxy(cx, cy, r * 0.85, "#CFC2FF", 2, 0.55, 0.4, 5, 140, "#FFF4D8")


def _cluster(card, cx, cy, r):
    rnd = random.Random(8)
    out = [halo(card, cx, cy, r * 0.9, "#FFD9A8", 0.35, "cl-h")]
    for _ in range(16):
        x, y = cx + rnd.gauss(0, r * 0.28), cy + rnd.gauss(0, r * 0.24)
        s = rnd.uniform(1.4, 3.4)
        out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(s)}" ry="{f(s * 0.6)}" transform="rotate({f(rnd.uniform(0, 180))} {f(x)} {f(y)})" fill="#FFE9C8" opacity="{f(rnd.uniform(0.6, 1))}"/>')
    return "".join(out)


def _web(card, cx, cy, r):
    rnd = random.Random(12)
    nodes = [(cx + rnd.uniform(-0.75, 0.75) * r, cy + rnd.uniform(-0.75, 0.75) * r) for _ in range(14)]
    out = []
    for i, (x, y) in enumerate(nodes):
        near = sorted(nodes, key=lambda p: (p[0] - x) ** 2 + (p[1] - y) ** 2)[1:3]
        for px, py in near:
            out.append(f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(px)}" y2="{f(py)}" stroke="#B98CFF" stroke-width="1.1" opacity="0.8"/>')
    glow = "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="2.6" fill="#FFD6F2"/>' for x, y in nodes)
    return f'<g filter="{card.blur("web-b", 1.2)}">{"".join(out)}</g>{"".join(out)}<g filter="{card.blur("web-n", 1.5)}">{glow}</g>{glow}'


def _cell(card, cx, cy, r):
    g = card.rgrad("cel-g", [(0, "#BFFFE8", 0.25), (0.8, "#5AE6C0", 0.35), (1, "#5AE6C0", 0.9)])
    rnd = random.Random(4)
    org = "".join(f'<ellipse cx="{f(cx + rnd.uniform(-0.4, 0.4) * r)}" cy="{f(cy + rnd.uniform(-0.4, 0.4) * r)}" rx="{f(rnd.uniform(1.5, 3))}" ry="{f(rnd.uniform(1, 2))}" fill="#9FFFD8" opacity="0.8"/>' for _ in range(7))
    return (
        f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 0.7)}" ry="{f(r * 0.6)}" fill="{g}" stroke="#7FFFD4" stroke-width="1.2"/>'
        f'{org}<circle cx="{f(cx + r * 0.12)}" cy="{f(cy - r * 0.05)}" r="{f(r * 0.22)}" fill="#3AA88A" stroke="#BFFFE8" stroke-width="1"/>'
        f'<circle cx="{f(cx + r * 0.16)}" cy="{f(cy - r * 0.08)}" r="{f(r * 0.07)}" fill="#E8FFF6"/>'
    )


def _molecule(card, cx, cy, r):
    pts = [pt(cx, cy, r * 0.42, a) for a in range(30, 390, 60)]
    out = []
    for i in range(6):
        a, b = pts[i], pts[(i + 1) % 6]
        out.append(f'<line x1="{f(a[0])}" y1="{f(a[1])}" x2="{f(b[0])}" y2="{f(b[1])}" stroke="#E6DEFF" stroke-width="1.6"/>')
        o = pt(cx, cy, r * 0.74, 30 + i * 60)
        out.append(f'<line x1="{f(a[0])}" y1="{f(a[1])}" x2="{f(o[0])}" y2="{f(o[1])}" stroke="#E6DEFF" stroke-width="1.1"/>')
        out.append(f'<circle cx="{f(o[0])}" cy="{f(o[1])}" r="2.4" fill="#FFFFFF"/>')
    for x, y in pts:
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="3.4" fill="{card.rgrad("mol-a", [(0, "#FFFFFF", 1), (1, "#6A7AFF", 1)], 0.35, 0.35, 0.7)}"/>')
    return "".join(out)


def _atom(card, cx, cy, r):
    out = [halo(card, cx, cy, r * 0.3, "#FFD45A", 0.8, "at-h")]
    for k, rot in enumerate((0, 60, 120)):
        out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 0.72)}" ry="{f(r * 0.26)}" fill="none" stroke="#8FD8FF" stroke-width="1.1" transform="rotate({rot} {f(cx)} {f(cy)})"/>')
        ex, ey = cx + r * 0.72 * math.cos(math.radians(40 + k * 90)), cy + r * 0.26 * math.sin(math.radians(40 + k * 90))
        out.append(f'<circle cx="{f(ex)}" cy="{f(ey)}" r="2.2" fill="#FFFFFF" transform="rotate({rot} {f(cx)} {f(cy)})"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.14)}" fill="#FFB347"/>')
    return "".join(out)


def _nucleus(card, cx, cy, r):
    rnd = random.Random(6)
    pro = card.rgrad("nu-p", [(0, "#FFC2B0", 1), (1, "#D8382A", 1)], 0.35, 0.35, 0.7)
    neu = card.rgrad("nu-n", [(0, "#E6EEFF", 1), (1, "#6A7A9A", 1)], 0.35, 0.35, 0.7)
    balls = []
    for i in range(13):
        a = i * 137.5
        rr = r * 0.12 * math.sqrt(i) * 1.15
        x, y = pt(cx, cy, rr, a)
        balls.append((-rr, f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.17)}" fill="{pro if rnd.random() < 0.5 else neu}"/>'))
    balls.sort()
    return "".join(b for _, b in balls)


def _quarks(card, cx, cy, r):
    cols = (("#FF5A6A", "#FFD0D6"), ("#4ADE80", "#D6FFE4"), ("#4A8CFF", "#D6E6FF"))
    pts = [pt(cx, cy, r * 0.42, a) for a in (0, 120, 240)]
    out = []
    for i in range(3):
        (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % 3]
        n = 9
        wav = []
        for k in range(n + 1):
            t = k / n
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            nx, ny = -(y1 - y0), (x1 - x0)
            L = math.hypot(nx, ny)
            off = 2.4 * math.sin(t * math.pi * 6)
            wav.append(f"{f(x + nx / L * off)} {f(y + ny / L * off)}")
        out.append(f'<path d="M{" L".join(wav)}" fill="none" stroke="#FFF4C2" stroke-width="1" opacity="0.85"/>')
    for (x, y), (c0, c1) in zip(pts, cols):
        g = card.rgrad(f"qk-{c0[1:]}", [(0, c1, 1), (1, c0, 1)], 0.35, 0.35, 0.7)
        out.append(halo(card, x, y, r * 0.3, c0, 0.5, f"qkh-{c0[1:]}") + f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.17)}" fill="{g}"/>')
    return "".join(out)


GRAND = (_earth, _sun, _galaxy, _cluster, _web)
PETIT = (_cell, _molecule, _atom, _nucleus, _quarks)


def scale_medallion(card, cx, cy, r, draw, name, ring):
    """Un médaillon de verre sombre, cerclé de prisme, où vit une échelle du monde."""
    disc = card.rgrad("sm-disc", [(0, "#1A1440", 1), (1, "#04030C", 1)], 0.5, 0.4, 0.6)
    return (
        f'<circle cx="{f(cx)}" cy="{f(cy + 3)}" r="{f(r)}" fill="#000000" opacity="0.6" filter="{card.blur("sm-sh", 4)}"/>'
        f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{disc}"/>'
        f'<g clip-path="{clip(card, circle_d(cx, cy, r - 1.5), name + "-c")}">{draw(card, cx, cy, r)}</g>'
        f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="{ring}" stroke-width="1.8"/>'
        f'<path d="M{f(cx - r * 0.7)} {f(cy - r * 0.55)} A{f(r)} {f(r)} 0 0 1 {f(cx + r * 0.55)} {f(cy - r * 0.72)}" fill="none" stroke="#FFFFFF" stroke-width="1.2" opacity="0.45"/>'
    )


def scale_ladder(card, x, ys, draws, ring, name, thread_to=None, thread_color="#B9A7FF"):
    """Une échelle de médaillons reliés par un fil de lumière, qui monte vers la singularité."""
    out = []
    y_top, y_bot = min(ys), max(ys)
    out.append(f'<line x1="{f(x)}" y1="{f(y_bot)}" x2="{f(x)}" y2="{f(y_top)}" stroke="{thread_color}" stroke-width="1.2" opacity="0.6" stroke-dasharray="1 4" stroke-linecap="round"/>')
    if thread_to:
        tx, ty = thread_to
        d = f"M{f(x)} {f(y_top)} C{f(x)} {f(y_top - 80)} {f(tx + (x - tx) * 0.2)} {f(ty + 40)} {f(tx)} {f(ty)}"
        out.append(f'<path d="{d}" fill="none" stroke="{thread_color}" stroke-width="3" opacity="0.5" filter="{card.blur(name + "-tg", 3)}"/>')
        out.append(f'<path d="{d}" fill="none" stroke="#FFFFFF" stroke-width="1" opacity="0.85"/>')
    for i, (y, draw) in enumerate(zip(ys, draws)):
        out.append(scale_medallion(card, x, y, 24, draw, f"{name}{i}", ring))
    return "".join(out)


def atom_glyph(cx, cy, r, color, op=0.85, rot=0):
    return (
        f'<g transform="rotate({rot} {f(cx)} {f(cy)})" opacity="{op}">'
        + "".join(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r)}" ry="{f(r * 0.34)}" fill="none" stroke="{color}" stroke-width="0.9" transform="rotate({a} {f(cx)} {f(cy)})"/>' for a in (0, 60, 120))
        + f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.18)}" fill="{color}"/></g>'
    )


GRAND_EXP = ("7", "9", "21", "23", "26")
PETIT_EXP = ("−5", "−9", "−10", "−14", "−18")


def power_label(x, y, exp, color="#E6DEFF", size=8.5, unit=" m", anchor="middle", weight=700):
    """« 10^n m » composé à la main : l'exposant monte d'un cran, en plus petit."""
    from base import SANS
    return (
        f'<text x="{f(x)}" y="{f(y)}" text-anchor="{anchor}" font-family="{SANS}" font-weight="{weight}" font-size="{size}" fill="{color}" letter-spacing="0.4">'
        f'10<tspan dy="{f(-size * 0.42)}" font-size="{f(size * 0.72)}">{exp}</tspan><tspan dy="{f(size * 0.42)}">{unit}</tspan></text>'
    )


def scale_ladder2(card, x, ys, draws, exps, ring, name, thread_to=None, thread_color="#B9A7FF", r=27, label_color="#E6DEFF"):
    """L'échelle des puissances de dix : des lentilles de verre reliées par un fil de lumière, chacune légendée de sa taille."""
    out = []
    y_top, y_bot = min(ys), max(ys)
    out.append(f'<line x1="{f(x)}" y1="{f(y_bot)}" x2="{f(x)}" y2="{f(y_top)}" stroke="{thread_color}" stroke-width="2.4" opacity="0.35" filter="{card.blur(name + "-lg", 2)}"/>')
    out.append(f'<line x1="{f(x)}" y1="{f(y_bot)}" x2="{f(x)}" y2="{f(y_top)}" stroke="{thread_color}" stroke-width="1" opacity="0.8" stroke-dasharray="1 4" stroke-linecap="round"/>')
    if thread_to:
        tx, ty = thread_to
        d = f"M{f(x)} {f(y_top - r)} C{f(x)} {f(y_top - r - 70)} {f(tx + (x - tx) * 0.2)} {f(ty + 40)} {f(tx)} {f(ty)}"
        out.append(f'<path d="{d}" fill="none" stroke="{thread_color}" stroke-width="4" opacity="0.55" filter="{card.blur(name + "-tg", 3)}"/>')
        out.append(f'<path d="{d}" fill="none" stroke="#FFFFFF" stroke-width="1.1" opacity="0.9"/>')
    for i, (y, draw, e) in enumerate(zip(ys, draws, exps)):
        out.append(halo(card, x, y, r * 1.5, thread_color, 0.35, name + "-mh"))
        out.append(scale_medallion(card, x, y, r, draw, f"{name}{i}", ring))
        out.append(f'<rect x="{f(x - 19)}" y="{f(y + r + 2)}" width="38" height="12" rx="6" fill="#06040F" opacity="0.75"/>')
        out.append(power_label(x, y + r + 11, e, label_color, 8.2))
    return "".join(out)
