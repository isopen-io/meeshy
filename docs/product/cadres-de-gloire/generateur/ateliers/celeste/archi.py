"""Architectures de l'Empire céleste : toits à tuiles vernissées, consoles, poutres peintes, torii, colonnes,
balustrades de marbre, mur et porte de lune, cloches de bronze, sphère armillaire, et la porte sculptée de la côte
swahilie (Lamu, Zanzibar)."""

import math
import random

from motifs import *  # noqa: F401,F403

GLAZE_JADE = ("#7FE0B4", "#2E9E74", "#0B4A36")
GLAZE_GOLD = ("#FFE68A", "#E2A82A", "#7A4A0A")
GLAZE_BLUE = ("#8FB8F0", "#2E5FB0", "#0E2558")
GLAZE_INK = ("#8A8E98", "#4A4E58", "#1C1E24")


def roof(card, cx, y, hw, h, glaze=GLAZE_JADE, curl=0.32, tile=11, ridge=True, pearl=True, ridge_col=None, uid="r", disc=None):
    """Toit à croupes vu de face : faîtage, arêtiers incurvés, coins relevés, tuiles canal et leurs disques."""
    hi, mid, lo = glaze
    rw = hw * 0.42
    tipx = hw * 1.08

    def top(dx):
        a = abs(dx)
        if a <= rw:
            return y
        u = min(1.0, (a - rw) / (tipx - rw))
        return y + h * ((1 - (1 - u) ** 2) * 0.94 - curl * max(0.0, (u - 0.68) / 0.32) ** 2.2)

    def bot(dx):
        u = abs(dx) / tipx
        return y + h - curl * h * max(0.0, (u - 0.58) / 0.42) ** 2.2

    xs = [-tipx + 2 * tipx * i / 120 for i in range(121)]
    outline = [(cx + dx, top(dx)) for dx in xs] + [(cx + dx, bot(dx)) for dx in reversed(xs)]
    g = card.grad(f"roof-{uid}", [(0, hi), (0.45, mid), (1, lo)])
    out = [f'<path d="{poly_d(outline)}" fill="#000000" opacity="0.4" transform="translate(0 6)" filter="{card.blur("roof-sh", 5)}"/>',
           f'<path d="{poly_d(outline)}" fill="{g}"/>']
    lines = []
    x = -tipx + tile * 0.5
    while x < tipx:
        t0, b0 = top(x) + 1.5, bot(x) - 3
        if b0 - t0 > 4:
            lines.append(f'<path d="M{fmt(cx + x)} {fmt(t0)} L{fmt(cx + x * 1.02)} {fmt(b0)}" stroke="{lo}" stroke-width="{fmt(tile * 0.32)}" opacity="0.55"/>')
            lines.append(f'<path d="M{fmt(cx + x + tile * 0.22)} {fmt(t0)} L{fmt(cx + x * 1.02 + tile * 0.22)} {fmt(b0)}" stroke="{hi}" stroke-width="{fmt(tile * 0.14)}" opacity="0.6"/>')
        x += tile
    out.append(f'<g clip-path="{clip(card, poly_d(outline))}">{"".join(lines)}'
               f'<path d="{poly_d([(cx + dx, top(dx) + h * 0.12) for dx in xs], False)}" fill="none" stroke="{lo}" stroke-width="1" opacity="0.6"/></g>')
    dc = disc or card.metal("gold")[0]
    x = -tipx + tile * 0.5
    discs = []
    while x < tipx:
        by = bot(x) - 2
        discs.append(f'<circle cx="{fmt(cx + x)}" cy="{fmt(by)}" r="{fmt(tile * 0.42)}" fill="{dc}" stroke="{lo}" stroke-width="0.7"/>'
                     f'<circle cx="{fmt(cx + x)}" cy="{fmt(by)}" r="{fmt(tile * 0.15)}" fill="{lo}" opacity="0.7"/>')
        x += tile
    out.append("".join(discs))
    out.append(f'<path d="{poly_d([(cx + dx, top(dx)) for dx in xs], False)}" fill="none" stroke="{hi}" stroke-width="2.2" opacity="0.9"/>')
    if ridge:
        rc = ridge_col or card.metal("gold")[0]
        rh = max(7, h * 0.16)
        out.append(f'<rect x="{fmt(cx - rw - 4)}" y="{fmt(y - rh)}" width="{fmt(2 * rw + 8)}" height="{fmt(rh + 2)}" rx="2" fill="{g}" stroke="{lo}" stroke-width="0.8"/>')
        out.append(f'<rect x="{fmt(cx - rw - 4)}" y="{fmt(y - rh)}" width="{fmt(2 * rw + 8)}" height="{fmt(rh * 0.3)}" fill="{rc}"/>')
        for side in (-1, 1):
            ex = cx + side * (rw + 2)
            sp_ = spiral_pts(ex + side * rh * 0.2, y - rh * 1.7, rh * 0.15, rh * 0.95, math.pi / 2 if side > 0 else math.pi / 2, 1.1, 30, cw=side < 0)
            d_ = f"M{fmt(ex - side * rh * 0.6)} {fmt(y - rh)} Q{fmt(ex - side * rh * 0.5)} {fmt(y - rh * 2.6)} {fmt(ex + side * rh * 0.7)} {fmt(y - rh * 2.4)} " \
                 f"Q{fmt(ex + side * rh * 1.2)} {fmt(y - rh * 1.6)} {fmt(ex + side * rh * 0.6)} {fmt(y - rh)}Z"
            out.append(f'<path d="{d_}" fill="{rc}" stroke="{lo}" stroke-width="0.8"/>')
            out.append(f'<path d="{poly_d(sp_, False)}" fill="none" stroke="{lo}" stroke-width="1"/>')
        if pearl:
            out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(y - rh - 5)}" r="{fmt(rh * 0.55)}" fill="{rc}" stroke="{lo}" stroke-width="0.8"/>')
    for side in (-1, 1):
        tx, ty = cx + side * tipx, top(side * tipx)
        out.append(f'<path d="M{fmt(tx)} {fmt(ty)} q{fmt(side * 6)} {fmt(-6)} {fmt(side * 4)} {fmt(-12)}" fill="none" stroke="{hi}" stroke-width="2.4" stroke-linecap="round"/>')
        out.append(f'<circle cx="{fmt(tx + side * 4)}" cy="{fmt(ty - 12)}" r="2.2" fill="{card.metal("gold")[0]}"/>')
    return "".join(out), top, bot


def brackets(card, x0, x1, y, h, unit=22, colors=("#1F6B5A", "#2B4FA0", "#C8321F")):
    """La frise des consoles (dougong) sous l'avant-toit : blocs empilés verts, bleus et rouges, filets d'or."""
    gold = card.metal("gold")[0]
    out = [f'<rect x="{fmt(x0)}" y="{fmt(y)}" width="{fmt(x1 - x0)}" height="{fmt(h)}" fill="#14100E"/>']
    x = x0
    i = 0
    while x < x1:
        c = colors[i % 2]
        out.append(f'<path d="M{fmt(x + 2)} {fmt(y + h)} L{fmt(x + 2)} {fmt(y + h * 0.62)} L{fmt(x + unit * 0.2)} {fmt(y + h * 0.62)} L{fmt(x + unit * 0.2)} {fmt(y + h * 0.3)} '
                   f'L{fmt(x + unit * 0.8)} {fmt(y + h * 0.3)} L{fmt(x + unit * 0.8)} {fmt(y + h * 0.62)} L{fmt(x + unit - 2)} {fmt(y + h * 0.62)} L{fmt(x + unit - 2)} {fmt(y + h)}Z" fill="{c}" stroke="{gold}" stroke-width="0.7"/>')
        out.append(f'<rect x="{fmt(x + unit * 0.32)}" y="{fmt(y + 1)}" width="{fmt(unit * 0.36)}" height="{fmt(h * 0.3)}" fill="{colors[2]}" stroke="{gold}" stroke-width="0.6"/>')
        x += unit
        i += 1
    return "".join(out)


def painted_beam(card, x0, x1, y, h, base=("#1E5E8E", "#0E2E52"), green="#1F7A5E", uid="b"):
    """Poutre peinte (caihua) : bleus et verts, cartouche central, rosaces tournoyantes aux extrémités, filets d'or."""
    gold = card.metal("gold")[0]
    gb = card.grad(f"beam-{uid}", [(0, base[0]), (1, base[1])])
    w = x1 - x0
    cx = (x0 + x1) / 2
    out = [f'<rect x="{fmt(x0)}" y="{fmt(y)}" width="{fmt(w)}" height="{fmt(h)}" fill="{gb}"/>',
           f'<rect x="{fmt(x0)}" y="{fmt(y + h * 0.18)}" width="{fmt(w)}" height="{fmt(h * 0.64)}" fill="{green}" opacity="0.55"/>']
    cw = w * 0.34
    out.append(f'<path d="M{fmt(cx - cw / 2)} {fmt(y + h / 2)} L{fmt(cx - cw / 2 + h * 0.4)} {fmt(y + 2)} L{fmt(cx + cw / 2 - h * 0.4)} {fmt(y + 2)} '
               f'L{fmt(cx + cw / 2)} {fmt(y + h / 2)} L{fmt(cx + cw / 2 - h * 0.4)} {fmt(y + h - 2)} L{fmt(cx - cw / 2 + h * 0.4)} {fmt(y + h - 2)}Z" fill="{VERM_D}" stroke="{gold}" stroke-width="1.4"/>')
    out.append(cloud(card, cx - h * 0.4, y + h / 2, h * 0.16, gold, "#5A2A08", lw=0.7, tail=True))
    for ex in (x0 + h * 0.75, x1 - h * 0.75):
        for r, c in ((h * 0.42, gold), (h * 0.32, "#E9F2FF"), (h * 0.22, base[0]), (h * 0.1, gold)):
            out.append(f'<circle cx="{fmt(ex)}" cy="{fmt(y + h / 2)}" r="{fmt(r)}" fill="{c}"/>')
        for k in range(8):
            a = k * 45
            p1, p2 = pt(ex, y + h / 2, h * 0.12, a), pt(ex, y + h / 2, h * 0.4, a + 30)
            out.append(f'<path d="M{fmt(p1[0])} {fmt(p1[1])} Q{fmt(pt(ex, y + h / 2, h * 0.3, a)[0])} {fmt(pt(ex, y + h / 2, h * 0.3, a)[1])} {fmt(p2[0])} {fmt(p2[1])}" stroke="{base[1]}" stroke-width="1" fill="none"/>')
    for yy in (y + 1, y + h - 1):
        out.append(f'<line x1="{fmt(x0)}" y1="{fmt(yy)}" x2="{fmt(x1)}" y2="{fmt(yy)}" stroke="{gold}" stroke-width="2"/>')
    return "".join(out)


def column(card, x, y0, y1, w, base=VERM, uid="col", bands=True, dragon_band=False):
    """Colonne laquée vermillon : modelé cylindrique, bagues d'or, base de pierre."""
    g = card.grad(f"col-{uid}", [(0, VERM_D), (0.3, base), (0.45, VERM_HI), (0.62, base), (1, "#4A0806")], 0, 0, 1, 0)
    gold = card.metal("gold")[0]
    out = [f'<rect x="{fmt(x - w / 2)}" y="{fmt(y0)}" width="{fmt(w)}" height="{fmt(y1 - y0)}" fill="{g}"/>']
    if bands:
        for yy in (y0 + 6, y1 - 22):
            out.append(f'<rect x="{fmt(x - w / 2 - 1)}" y="{fmt(yy)}" width="{fmt(w + 2)}" height="10" fill="{metal_grad(card, "gold")}"/>')
            out.append(f'<rect x="{fmt(x - w / 2 - 1)}" y="{fmt(yy + 3.5)}" width="{fmt(w + 2)}" height="3" fill="{VERM_D}" opacity="0.6"/>')
    out.append(f'<path d="M{fmt(x - w / 2 - 6)} {fmt(y1)} L{fmt(x - w / 2 - 3)} {fmt(y1 - 12)} L{fmt(x + w / 2 + 3)} {fmt(y1 - 12)} L{fmt(x + w / 2 + 6)} {fmt(y1)}Z" fill="#CFC8BC" stroke="#8A8478" stroke-width="0.8"/>')
    return "".join(out)


def balustrade(card, x0, x1, y, h, posts=6, marble=("#FFFFFF", "#E4E0D8", "#A9A398"), uid="bal"):
    """Balustrade de marbre blanc : rampe, panneaux ajourés en vase, poteaux coiffés de nuages."""
    hi, mid, lo = marble
    g = card.grad(f"bal-{uid}", [(0, hi), (0.6, mid), (1, lo)])
    out = [f'<rect x="{fmt(x0)}" y="{fmt(y + h * 0.78)}" width="{fmt(x1 - x0)}" height="{fmt(h * 0.3)}" fill="{g}" stroke="{lo}" stroke-width="0.8"/>']
    step = (x1 - x0) / (posts - 1)
    for i in range(posts - 1):
        px = x0 + i * step
        out.append(f'<rect x="{fmt(px)}" y="{fmt(y + h * 0.22)}" width="{fmt(step)}" height="{fmt(h * 0.08)}" fill="{g}" stroke="{lo}" stroke-width="0.6"/>')
        out.append(f'<rect x="{fmt(px)}" y="{fmt(y + h * 0.36)}" width="{fmt(step)}" height="{fmt(h * 0.42)}" fill="{mid}" stroke="{lo}" stroke-width="0.6"/>')
        vx = px + step / 2
        out.append(f'<path d="M{fmt(vx - step * 0.18)} {fmt(y + h * 0.42)} Q{fmt(vx)} {fmt(y + h * 0.36)} {fmt(vx + step * 0.18)} {fmt(y + h * 0.42)} '
                   f'Q{fmt(vx + step * 0.3)} {fmt(y + h * 0.6)} {fmt(vx + step * 0.14)} {fmt(y + h * 0.72)} L{fmt(vx - step * 0.14)} {fmt(y + h * 0.72)} '
                   f'Q{fmt(vx - step * 0.3)} {fmt(y + h * 0.6)} {fmt(vx - step * 0.18)} {fmt(y + h * 0.42)}Z" fill="{lo}" opacity="0.55"/>')
    for i in range(posts):
        px = x0 + i * step
        out.append(f'<rect x="{fmt(px - 6)}" y="{fmt(y + h * 0.1)}" width="12" height="{fmt(h * 0.9)}" fill="{g}" stroke="{lo}" stroke-width="0.8"/>')
        out.append(f'<path d="M{fmt(px - 7)} {fmt(y + h * 0.12)} Q{fmt(px - 9)} {fmt(y - h * 0.08)} {fmt(px)} {fmt(y - h * 0.12)} Q{fmt(px + 9)} {fmt(y - h * 0.08)} {fmt(px + 7)} {fmt(y + h * 0.12)}Z" fill="{hi}" stroke="{lo}" stroke-width="0.8"/>')
        out.append(f'<path d="{poly_d(spiral_pts(px, y - h * 0.01, 0.5, 4.2, 0, 1.2, 16), False)}" fill="none" stroke="{lo}" stroke-width="0.9"/>')
    return "".join(out)


def torii(card, cx, base_y, w, h, color=VERM, uid="to"):
    """Torii (création) : deux piliers vermillon, linteau supérieur aux extrémités relevées, entretoise traversante."""
    g = card.grad(f"tor-{uid}", [(0, VERM_D), (0.35, color), (0.5, VERM_HI), (0.7, color), (1, VERM_D)], 0, 0, 1, 0)
    gt = card.grad(f"tort-{uid}", [(0, VERM_HI), (1, VERM_D)])
    pw = w * 0.075
    out = []
    for side in (-1, 1):
        px = cx + side * w * 0.34
        out.append(f'<path d="M{fmt(px - pw * 0.42)} {fmt(base_y - h * 0.92)} L{fmt(px + pw * 0.42)} {fmt(base_y - h * 0.92)} L{fmt(px + pw * 0.55)} {fmt(base_y)} L{fmt(px - pw * 0.55)} {fmt(base_y)}Z" fill="{g}"/>')
        out.append(f'<rect x="{fmt(px - pw * 0.6)}" y="{fmt(base_y - h * 0.06)}" width="{fmt(pw * 1.2)}" height="{fmt(h * 0.06)}" fill="#141212"/>')
    ny = base_y - h * 0.7
    out.append(f'<rect x="{fmt(cx - w * 0.47)}" y="{fmt(ny)}" width="{fmt(w * 0.94)}" height="{fmt(h * 0.05)}" fill="{gt}"/>')
    out.append(f'<rect x="{fmt(cx - pw * 0.35)}" y="{fmt(base_y - h * 0.9)}" width="{fmt(pw * 0.7)}" height="{fmt(h * 0.2)}" fill="{gt}"/>')
    out.append(f'<rect x="{fmt(cx - w * 0.07)}" y="{fmt(base_y - h * 0.86)}" width="{fmt(w * 0.14)}" height="{fmt(h * 0.11)}" fill="#141212" stroke="{card.metal("gold")[0]}" stroke-width="1.4"/>')
    ky = base_y - h * 0.92
    kw = w * 0.62
    sh = (f"M{fmt(cx - kw * 0.92)} {fmt(ky)} Q{fmt(cx)} {fmt(ky + h * 0.02)} {fmt(cx + kw * 0.92)} {fmt(ky)} L{fmt(cx + kw * 0.92)} {fmt(ky - h * 0.045)} "
          f"Q{fmt(cx)} {fmt(ky - h * 0.025)} {fmt(cx - kw * 0.92)} {fmt(ky - h * 0.045)}Z")
    out.append(f'<path d="{sh}" fill="{gt}"/>')
    kt = ky - h * 0.045
    ka = (f"M{fmt(cx - kw * 1.08)} {fmt(kt - h * 0.07)} Q{fmt(cx - kw * 0.6)} {fmt(kt + h * 0.005)} {fmt(cx)} {fmt(kt)} Q{fmt(cx + kw * 0.6)} {fmt(kt + h * 0.005)} {fmt(cx + kw * 1.08)} {fmt(kt - h * 0.07)} "
          f"L{fmt(cx + kw * 1.06)} {fmt(kt - h * 0.11)} Q{fmt(cx + kw * 0.6)} {fmt(kt - h * 0.045)} {fmt(cx)} {fmt(kt - h * 0.05)} Q{fmt(cx - kw * 0.6)} {fmt(kt - h * 0.045)} {fmt(cx - kw * 1.06)} {fmt(kt - h * 0.11)}Z")
    out.append(f'<path d="{ka}" fill="{gt}"/>')
    kb = (f"M{fmt(cx - kw * 1.06)} {fmt(kt - h * 0.11)} Q{fmt(cx - kw * 0.6)} {fmt(kt - h * 0.045)} {fmt(cx)} {fmt(kt - h * 0.05)} Q{fmt(cx + kw * 0.6)} {fmt(kt - h * 0.045)} {fmt(cx + kw * 1.06)} {fmt(kt - h * 0.11)} "
          f"L{fmt(cx + kw * 1.1)} {fmt(kt - h * 0.135)} Q{fmt(cx + kw * 0.6)} {fmt(kt - h * 0.07)} {fmt(cx)} {fmt(kt - h * 0.075)} Q{fmt(cx - kw * 0.6)} {fmt(kt - h * 0.07)} {fmt(cx - kw * 1.1)} {fmt(kt - h * 0.135)}Z")
    out.append(f'<path d="{kb}" fill="#141212"/>')
    return "".join(out)


def tile_coping(card, x0, x1, y, h=16, glaze=GLAZE_INK):
    """Le chaperon de tuiles grises qui coiffe un mur de jardin."""
    hi, mid, lo = glaze
    g = card.grad("coping", [(0, hi), (1, lo)])
    out = [f'<rect x="{fmt(x0)}" y="{fmt(y - h)}" width="{fmt(x1 - x0)}" height="{fmt(h)}" fill="{g}"/>',
           f'<rect x="{fmt(x0)}" y="{fmt(y - h - 5)}" width="{fmt(x1 - x0)}" height="6" rx="2" fill="{mid}" stroke="{lo}" stroke-width="0.6"/>']
    x = x0 + 4
    while x < x1:
        out.append(f'<line x1="{fmt(x)}" y1="{fmt(y - h + 1)}" x2="{fmt(x)}" y2="{fmt(y - 2)}" stroke="{lo}" stroke-width="2.2" opacity="0.6"/>')
        out.append(f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="3.4" fill="{mid}" stroke="{lo}" stroke-width="0.6"/>')
        x += 9
    return "".join(out)


def stone_lantern(card, cx, base_y, s=1.0, lit=True):
    """Lanterne de pierre de jardin : socle, fût, chambre de lumière, toit recourbé, joyau."""
    g = card.grad("stone", [(0, "#C9C4BA"), (1, "#6E6A62")], 0, 0, 1, 0)
    out = []
    if lit:
        out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(base_y - 64 * s)}" r="{fmt(40 * s)}" fill="{card.rgrad("stl-glow", [(0, "#FFD27A", 0.55), (1, "#FFD27A", 0)])}"/>')
    out.append(f'<path d="M{fmt(cx - 20 * s)} {fmt(base_y)} L{fmt(cx - 16 * s)} {fmt(base_y - 8 * s)} L{fmt(cx + 16 * s)} {fmt(base_y - 8 * s)} L{fmt(cx + 20 * s)} {fmt(base_y)}Z" fill="{g}"/>')
    out.append(f'<rect x="{fmt(cx - 6 * s)}" y="{fmt(base_y - 46 * s)}" width="{fmt(12 * s)}" height="{fmt(38 * s)}" fill="{g}"/>')
    out.append(f'<rect x="{fmt(cx - 18 * s)}" y="{fmt(base_y - 52 * s)}" width="{fmt(36 * s)}" height="{fmt(7 * s)}" fill="{g}"/>')
    out.append(f'<rect x="{fmt(cx - 13 * s)}" y="{fmt(base_y - 76 * s)}" width="{fmt(26 * s)}" height="{fmt(24 * s)}" fill="{g}"/>')
    out.append(f'<rect x="{fmt(cx - 7 * s)}" y="{fmt(base_y - 72 * s)}" width="{fmt(14 * s)}" height="{fmt(16 * s)}" fill="{"#FFC85A" if lit else "#2A2620"}"/>')
    out.append(f'<path d="M{fmt(cx - 30 * s)} {fmt(base_y - 74 * s)} Q{fmt(cx - 16 * s)} {fmt(base_y - 80 * s)} {fmt(cx)} {fmt(base_y - 96 * s)} Q{fmt(cx + 16 * s)} {fmt(base_y - 80 * s)} {fmt(cx + 30 * s)} {fmt(base_y - 74 * s)} '
               f'L{fmt(cx + 26 * s)} {fmt(base_y - 78 * s)} L{fmt(cx - 26 * s)} {fmt(base_y - 78 * s)}Z" fill="{g}"/>')
    out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(base_y - 100 * s)}" r="{fmt(5 * s)}" fill="{g}"/><path d="M{fmt(cx)} {fmt(base_y - 111 * s)} q{fmt(4 * s)} {fmt(5 * s)} 0 {fmt(8 * s)} q{fmt(-4 * s)} {fmt(-3 * s)} 0 {fmt(-8 * s)}Z" fill="{g}"/>')
    return "".join(out)


# ---------------------------------------------------------------- cloches de bronze

def bell(card, cx, top_y, w, h, uid="bell", bronze=("#F2D9A0", "#B8862E", "#4A3008"), patina="#2E8C78"):
    """Cloche de temple (création) : anse en double dragon stylisé, bandes, bossettes, siège de frappe en lotus."""
    hi, mid, lo = bronze
    g = card.grad(f"bell-{uid}", [(0, lo), (0.25, mid), (0.42, hi), (0.58, mid), (1, lo)], 0, 0, 1, 0)
    out = []
    out.append(f'<path d="M{fmt(cx - w * 0.16)} {fmt(top_y + h * 0.04)} Q{fmt(cx - w * 0.2)} {fmt(top_y - h * 0.14)} {fmt(cx)} {fmt(top_y - h * 0.16)} Q{fmt(cx + w * 0.2)} {fmt(top_y - h * 0.14)} {fmt(cx + w * 0.16)} {fmt(top_y + h * 0.04)}" fill="none" stroke="{g}" stroke-width="{fmt(w * 0.07)}"/>')
    body = (f"M{fmt(cx - w * 0.36)} {fmt(top_y + h * 0.06)} Q{fmt(cx - w * 0.38)} {fmt(top_y)} {fmt(cx)} {fmt(top_y)} Q{fmt(cx + w * 0.38)} {fmt(top_y)} {fmt(cx + w * 0.36)} {fmt(top_y + h * 0.06)} "
            f"L{fmt(cx + w * 0.42)} {fmt(top_y + h * 0.92)} Q{fmt(cx + w * 0.5)} {fmt(top_y + h)} {fmt(cx + w * 0.5)} {fmt(top_y + h)} L{fmt(cx - w * 0.5)} {fmt(top_y + h)} "
            f"Q{fmt(cx - w * 0.5)} {fmt(top_y + h)} {fmt(cx - w * 0.42)} {fmt(top_y + h * 0.92)}Z")
    out.append(f'<path d="{body}" fill="{g}" stroke="{lo}" stroke-width="1"/>')
    inner = []
    for yy in (0.16, 0.6, 0.86):
        inner.append(f'<rect x="{fmt(cx - w * 0.6)}" y="{fmt(top_y + h * yy)}" width="{fmt(w * 1.2)}" height="{fmt(h * 0.025)}" fill="{lo}" opacity="0.7"/>')
        inner.append(f'<rect x="{fmt(cx - w * 0.6)}" y="{fmt(top_y + h * yy - 1.5)}" width="{fmt(w * 1.2)}" height="1.2" fill="{hi}" opacity="0.7"/>')
    for xx in (-0.12, 0.12):
        inner.append(f'<rect x="{fmt(cx + w * xx - 1)}" y="{fmt(top_y + h * 0.16)}" width="2.4" height="{fmt(h * 0.44)}" fill="{lo}" opacity="0.6"/>')
    for col in (-0.3, -0.22, 0.22, 0.3):
        for row in range(4):
            bx, by = cx + w * col, top_y + h * (0.22 + row * 0.09)
            inner.append(f'<circle cx="{fmt(bx)}" cy="{fmt(by)}" r="{fmt(w * 0.025)}" fill="{hi}" stroke="{lo}" stroke-width="0.6"/>')
    inner.append(f'<circle cx="{fmt(cx - w * 0.2)}" cy="{fmt(top_y + h * 0.73)}" r="{fmt(w * 0.07)}" fill="none" stroke="{lo}" stroke-width="1.6"/>')
    for k in range(8):
        p = pt(cx - w * 0.2, top_y + h * 0.73, w * 0.05, k * 45)
        inner.append(f'<circle cx="{fmt(p[0])}" cy="{fmt(p[1])}" r="{fmt(w * 0.016)}" fill="{lo}"/>')
    inner.append(f'<path d="{body}" fill="{patina}" opacity="0.18"/>')
    out.append(f'<g clip-path="{clip(card, body)}">{"".join(inner)}</g>')
    return "".join(out)


def chime_bell(card, cx, cy, s, rot=0, uid="cb"):
    """Cloche de carillon (bianzhong) : bronze aplati, bossettes en rangs, anse oblique."""
    g = card.grad(f"cb-{uid}", [(0, "#4A3008"), (0.3, "#B8862E"), (0.45, "#F2D9A0"), (0.62, "#B8862E"), (1, "#3A2406")], 0, 0, 1, 0)
    body = "M-14 -22 L14 -22 L19 18 Q0 12 -19 18Z"
    out = [f'<rect x="-2.5" y="-36" width="5" height="16" fill="#8A5A12"/><circle cx="0" cy="-38" r="4" fill="none" stroke="#8A5A12" stroke-width="2"/>',
           f'<path d="{body}" fill="{g}" stroke="#3A2406" stroke-width="0.8"/>']
    for row in range(3):
        for col in (-1, 1):
            for k in range(3):
                out.append(f'<circle cx="{fmt(col * (6 + k * 3.4))}" cy="{fmt(-15 + row * 7)}" r="1.4" fill="#F2D9A0" stroke="#4A3008" stroke-width="0.4"/>')
    out.append('<rect x="-2" y="-20" width="4" height="22" fill="#4A3008" opacity="0.5"/>')
    out.append('<path d="M-17 10 Q0 5 17 10" stroke="#2E8C78" stroke-width="2" opacity="0.5" fill="none"/>')
    return tf("".join(out), cx, cy, rot, s)


# ---------------------------------------------------------------- la sphère armillaire

def armillary(card, cx, cy, r, bronze="#C9A250", hi="#FFF1BE", lo="#5A3A0A", ticks=True, tilt=23.5):
    """Sphère armillaire d'observatoire (création) : méridien, horizon, équateur incliné, écliptique, graduations."""
    out = []
    rings = [(r, r, 0, 4.2), (r, r * 0.26, 0, 3.6), (r * 0.92, r * 0.34, -tilt, 3.0), (r * 0.92, r * 0.92 * 0.18, 90, 2.4), (r * 0.84, r * 0.4, tilt + 12, 2.2)]
    for rx, ry, rot, w in rings:
        out.append(f'<ellipse cx="{fmt(cx)}" cy="{fmt(cy)}" rx="{fmt(rx)}" ry="{fmt(ry)}" fill="none" stroke="{lo}" stroke-width="{fmt(w + 2)}" transform="rotate({rot} {fmt(cx)} {fmt(cy)})"/>')
        out.append(f'<ellipse cx="{fmt(cx)}" cy="{fmt(cy)}" rx="{fmt(rx)}" ry="{fmt(ry)}" fill="none" stroke="{bronze}" stroke-width="{fmt(w)}" transform="rotate({rot} {fmt(cx)} {fmt(cy)})"/>')
        out.append(f'<ellipse cx="{fmt(cx)}" cy="{fmt(cy - w * 0.25)}" rx="{fmt(rx)}" ry="{fmt(ry)}" fill="none" stroke="{hi}" stroke-width="0.7" opacity="0.7" transform="rotate({rot} {fmt(cx)} {fmt(cy)})"/>')
    if ticks:
        tk = []
        for k in range(0, 360, 5):
            p1, p2 = pt(cx, cy, r - 2, k), pt(cx, cy, r + (5 if k % 30 == 0 else 2.5), k)
            tk.append(f"M{fmt(p1[0])} {fmt(p1[1])} L{fmt(p2[0])} {fmt(p2[1])}")
        out.append(f'<path d="{" ".join(tk)}" stroke="{hi}" stroke-width="0.8"/>')
    out.append(f'<line x1="{fmt(cx)}" y1="{fmt(cy - r - 10)}" x2="{fmt(cx)}" y2="{fmt(cy + r + 10)}" stroke="{bronze}" stroke-width="2" transform="rotate({-tilt} {fmt(cx)} {fmt(cy)})"/>')
    return "".join(out)


# ---------------------------------------------------------------- la côte swahilie

def chain_band(card, x, y0, y1, w, wood="#2A1408", gold="#E8B53C"):
    """Bande sculptée « chaîne » des portes swahilies : maillons entrelacés, signe de sécurité."""
    out = [f'<rect x="{fmt(x - w / 2)}" y="{fmt(y0)}" width="{fmt(w)}" height="{fmt(y1 - y0)}" fill="{wood}"/>']
    yy = y0 + w * 0.5
    i = 0
    while yy < y1 - w * 0.4:
        out.append(f'<ellipse cx="{fmt(x)}" cy="{fmt(yy)}" rx="{fmt(w * 0.3)}" ry="{fmt(w * 0.55)}" fill="none" stroke="{gold}" stroke-width="{fmt(w * 0.12)}"/>')
        yy += w * 0.75
        i += 1
    return "".join(out)


def rosette(cx, cy, r, color, n=8, center=None):
    out = []
    for k in range(n):
        a = k * 360 / n
        p = pt(cx, cy, r * 0.55, a)
        out.append(f'<ellipse cx="{fmt(p[0])}" cy="{fmt(p[1])}" rx="{fmt(r * 0.2)}" ry="{fmt(r * 0.45)}" fill="{color}" transform="rotate({fmt(a)} {fmt(p[0])} {fmt(p[1])})"/>')
    out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r * 0.22)}" fill="{center or color}"/>')
    return "".join(out)


def stud(card, cx, cy, r):
    g = card.rgrad("stud", [(0, "#FFF6D0", 1), (0.45, "#E2B048", 1), (1, "#6A4208", 1)], 0.35, 0.3, 0.7)
    return f'<circle cx="{fmt(cx)}" cy="{fmt(cy + 1.5)}" r="{fmt(r)}" fill="#000000" opacity="0.45"/><circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r)}" fill="{g}"/>'


def treasure_ship(card, cx, cy, s, sails=("#C8402A", "#A8301E"), flip=False):
    """Jonque de la flotte des trésors (création) : coque à château arrière, voiles lattées, flammes de soie."""
    out = []
    hull = "M-80 -6 L74 -10 Q86 -12 90 -22 L94 -20 Q92 2 70 12 L-60 14 Q-80 12 -90 -2 L-96 -26 L-84 -24Z"
    out.append(f'<path d="{hull}" fill="{card.grad("hull", [(0, "#6A3418"), (1, "#2A1006")])}" stroke="#1A0804" stroke-width="1"/>')
    out.append('<path d="M-84 -12 L80 -14" stroke="#E8B53C" stroke-width="1.6"/><path d="M-80 2 L72 0" stroke="#C8402A" stroke-width="2.4"/>')
    for i in range(9):
        out.append(f'<circle cx="{-60 + i * 15}" cy="-4" r="2" fill="#E8B53C"/>')
    out.append('<path d="M-96 -26 L-70 -24 L-72 -10 L-92 -10Z" fill="#8A3A18" stroke="#1A0804" stroke-width="0.8"/>')
    for k, (mx, mh, sw) in enumerate(((-60, 70, 34), (-22, 96, 44), (18, 104, 46), (52, 80, 36), (80, 52, 22))):
        out.append(f'<line x1="{mx}" y1="-10" x2="{mx}" y2="{-10 - mh}" stroke="#2A1006" stroke-width="2"/>')
        top = -10 - mh + 4
        bot = -18
        sail = f"M{mx - sw * 0.55} {top + 6} Q{mx} {top - 6} {mx + sw * 0.5} {top + 2} L{mx + sw * 0.6} {bot} L{mx - sw * 0.5} {bot}Z"
        out.append(f'<path d="{sail}" fill="{sails[k % 2]}" stroke="#5A1A0A" stroke-width="0.8"/>')
        nb = 6
        for j in range(1, nb):
            yy = top + (bot - top) * j / nb
            out.append(f'<line x1="{mx - sw * 0.53}" y1="{fmt(yy)}" x2="{mx + sw * 0.57}" y2="{fmt(yy)}" stroke="#3A0E06" stroke-width="1" opacity="0.8"/>')
        out.append(f'<path d="M{mx} {-10 - mh} l10 3 l-10 3Z" fill="#E8B53C"/>')
    return tf("".join(out), cx, cy, 0, s, flip)
