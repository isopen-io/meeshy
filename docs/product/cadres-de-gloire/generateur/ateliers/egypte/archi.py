"""Égypte solaire - les constructions africaines du Nil : maison peinte de Nubie, pylônes, frises, hérons, babouins."""

import math
import random

from kit import *  # noqa: F401,F403
from motifs import *  # noqa: F401,F403
from motifs import _tr, _poly  # noqa: F401


# ---------------------------------------------------------------- soleil levant et pyramides éclairées

def rising_sun(card, name, cx, cy, r, horizon=None, core="#FFF7DC", mid="#FFC45E", edge="#F0662A", haze="#5A1E3A", bands=4, glow=0.75):
    """Le soleil bas : disque sans contour, cœur blanc, bord rouge, quelques bandes de brume qui le traversent."""
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 3.2)}" fill="{card.rgrad(name + "-gl", [(0, "#FFC070", glow), (0.3, "#FF9040", glow * 0.35), (1, "#FF7030", 0)])}"/>']
    g = card.rgrad(name + "-d", [(0, core, 1), (0.45, core, 1), (0.7, mid, 1), (0.93, edge, 1), (1, edge, 0.0)], 0.5, 0.5, 0.5)
    clip = ""
    if horizon is not None:
        card.def_once(name + "-hc", f'<clipPath id="{card.id(name + "-hc")}"><rect x="0" y="0" width="{W}" height="{f(horizon)}"/></clipPath>')
        clip = f' clip-path="url(#{card.id(name + "-hc")})"'
    disk = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.04)}" fill="{g}"/>']
    rnd = random.Random(len(name))
    for i in range(bands):
        y = cy + r * (0.15 + 0.2 * i) * (1 if i % 2 else -0.6)
        hw = r * rnd.uniform(1.0, 1.5)
        disk.append(f'<rect x="{f(cx - hw)}" y="{f(y)}" width="{f(2 * hw)}" height="{f(r * rnd.uniform(0.03, 0.06))}" rx="2" fill="{haze}" opacity="{f(rnd.uniform(0.25, 0.45))}"/>')
    out.append(f'<g{clip}>{"".join(disk)}</g>')
    return "".join(out)


def pyramid_shaded(card, name, cx, base_y, w, h, light="left", lit=("#FFD38A", "#E9954A"), dark=("#7A3A1A", "#3A1A0C"),
                   courses=9, cap=None, haze=0.0, haze_color="#F2A070", ridge=0.1):
    """Pyramide aux faces dégradées : la face au soleil, la face d'ombre, les assises, le pyramidion qui brille."""
    ax = cx
    rx = cx + (w * ridge if light == "left" else -w * ridge)
    lg = card.grad(name + "-l", [(0, lit[0]), (1, lit[1])], 0, 0, 0, 1)
    dg = card.grad(name + "-k", [(0, dark[0]), (1, dark[1])], 0, 0, 0, 1)
    left_fill, right_fill = (lg, dg) if light == "left" else (dg, lg)
    out = [
        f'<path d="M{f(cx - w / 2)} {f(base_y)} L{f(ax)} {f(base_y - h)} L{f(rx)} {f(base_y)} Z" fill="{left_fill}"/>',
        f'<path d="M{f(rx)} {f(base_y)} L{f(ax)} {f(base_y - h)} L{f(cx + w / 2)} {f(base_y)} Z" fill="{right_fill}"/>',
    ]
    for k in range(1, courses):
        t = k / courses
        yy = base_y - h * t
        xl = cx - w / 2 * (1 - t)
        xr = cx + w / 2 * (1 - t)
        xm = rx + (ax - rx) * t
        out.append(f'<path d="M{f(xl)} {f(yy)} L{f(xm)} {f(yy)} L{f(xr)} {f(yy)}" fill="none" stroke="#000000" stroke-width="0.6" opacity="0.14"/>')
    if cap:
        k = 0.13
        out.append(f'<path d="M{f(ax - w / 2 * k)} {f(base_y - h * (1 - k))} L{f(ax)} {f(base_y - h)} L{f(ax + w / 2 * k)} {f(base_y - h * (1 - k))} Z" fill="{cap}"/>')
        out.append(f'<circle cx="{f(ax)}" cy="{f(base_y - h)}" r="{f(max(2, w * 0.05))}" fill="{card.rgrad(name + "-gl", [(0, "#FFFFFF", 0.95), (1, "#FFE7A0", 0)])}"/>')
    if haze:
        out.append(f'<path d="M{f(cx - w / 2)} {f(base_y)} L{f(ax)} {f(base_y - h)} L{f(cx + w / 2)} {f(base_y)} Z" fill="{haze_color}" opacity="{haze}"/>')
    return "".join(out)


def giza_group(card, name, x, base_y, s, light="left", flip=False, cap="#FFE7B0", lit=("#FFD38A", "#E9954A"), dark=("#7A3A1A", "#3A1A0C")):
    """Gizeh : Khéops, Khéphren (son revêtement au sommet), Mykérinos et les pyramides des reines, du plus loin au plus près."""
    m = -1 if flip else 1
    items = [
        (150, 0, 52, 33, 0.35), (170, 0, 34, 22, 0.3), (128, 0, 70, 45, 0.25),
        (98, -2, 150, 96, 0.12), (0, 0, 170, 106, 0.0),
    ]
    out = []
    for i, (dx, dy, w, h, hz) in enumerate(items):
        out.append(pyramid_shaded(card, f"{name}-{i}", x + m * dx * s, base_y + dy * s, w * s, h * s, light, lit, dark,
                                  courses=max(4, int(h * s / 7)), cap=cap if i == 3 else None, haze=hz))
    return "".join(out)


# ---------------------------------------------------------------- Méroé, Koush

def meroe_tall(card, name, cx, base_y, w, h, light="left", lit=("#F6B070", "#C0602E"), dark=("#6A2A16", "#2E1008"), steps=18, chapel=True):
    """Grande pyramide de Méroé (Soudan) : pente raide, gradins visibles, arête à bourrelet, chapelle-pylône au pied."""
    top = base_y - h
    lg = card.grad(name + "-l", [(0, lit[0]), (1, lit[1])], 0, 0, 0, 1)
    dg = card.grad(name + "-k", [(0, dark[0]), (1, dark[1])], 0, 0, 0, 1)
    rx = cx + (w * 0.08 if light == "left" else -w * 0.08)
    lf, rf = (lg, dg) if light == "left" else (dg, lg)
    out = [f'<path d="M{f(cx - w / 2)} {f(base_y)} L{f(cx)} {f(top)} L{f(rx)} {f(base_y)} Z" fill="{lf}"/>',
           f'<path d="M{f(rx)} {f(base_y)} L{f(cx)} {f(top)} L{f(cx + w / 2)} {f(base_y)} Z" fill="{rf}"/>']
    for k in range(1, steps):
        t = k / steps
        yy = base_y - h * t
        xl, xr = cx - w / 2 * (1 - t), cx + w / 2 * (1 - t)
        xm = rx + (cx - rx) * t
        out.append(f'<path d="M{f(xl)} {f(yy)} L{f(xm)} {f(yy)}" stroke="#2A0E06" stroke-width="0.8" opacity="0.28"/>')
        out.append(f'<path d="M{f(xm)} {f(yy)} L{f(xr)} {f(yy)}" stroke="#000000" stroke-width="0.8" opacity="0.2"/>')
    ridge = "#FFE2B0" if light == "left" else "#FFD09A"
    out.append(f'<path d="M{f(cx)} {f(top)} L{f(rx)} {f(base_y)}" stroke="{ridge}" stroke-width="1.2" opacity="0.4"/>')
    if chapel:
        cw, ch = w * 0.4, h * 0.13
        x0 = cx - cw / 2
        out.append(f'<path d="M{f(x0)} {f(base_y)} L{f(x0 + cw * 0.1)} {f(base_y - ch)} L{f(x0 + cw * 0.9)} {f(base_y - ch)} L{f(x0 + cw)} {f(base_y)} Z" fill="{lg}" stroke="#3A1408" stroke-width="0.8"/>')
        out.append(f'<rect x="{f(x0 + cw * 0.06)}" y="{f(base_y - ch - 3)}" width="{f(cw * 0.88)}" height="3" fill="#FFD7A0" opacity="0.7"/>')
        out.append(f'<rect x="{f(cx - cw * 0.11)}" y="{f(base_y - ch * 0.66)}" width="{f(cw * 0.22)}" height="{f(ch * 0.66)}" fill="#2A0E06"/>')
    return "".join(out)


def pylon_win(x0t, x1t, y0, x0b, x1b, y1, r=12):
    """Fenêtre en pylône : les montants s'inclinent vers l'intérieur (fruit), linteau droit."""
    return (f"M{f(x0t + r)} {f(y0)} L{f(x1t - r)} {f(y0)} Q{f(x1t)} {f(y0)} {f(x1t + 1)} {f(y0 + r)} L{f(x1b)} {f(y1 - r)} "
            f"Q{f(x1b)} {f(y1)} {f(x1b - r)} {f(y1)} L{f(x0b + r)} {f(y1)} Q{f(x0b)} {f(y1)} {f(x0b)} {f(y1 - r)} "
            f"L{f(x0t - 1)} {f(y0 + r)} Q{f(x0t)} {f(y0)} {f(x0t + r)} {f(y0)} Z")


def crescent(card, name, cx, cy, r, color="#FFF4D8", phase=0.38, rot=-25, glow=0.45):
    card.def_once(name + "-m", f'<mask id="{card.id(name + "-m")}"><rect width="{W}" height="{H}" fill="#FFFFFF"/>'
                               f'<circle cx="{f(cx + r * phase * 1.5)}" cy="{f(cy - r * phase * 0.6)}" r="{f(r * 0.92)}" fill="#000000" transform="rotate({rot} {f(cx)} {f(cy)})"/></mask>')
    return (f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 3)}" fill="{card.rgrad(name + "-g", [(0, color, glow), (1, color, 0)])}"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{color}" mask="url(#{card.id(name + "-m")})"/>')


def ram_head(cx, cy, s, color, horn=None):
    """Le bélier d'Amon, protecteur des rois de Koush (profil stylisé, cornes enroulées)."""
    horn = horn or color
    return (
        f'<g {_tr(cx, cy, s)}><path d="M-20 -6 C-20 -20 -8 -28 6 -26 C18 -24 26 -14 28 -2 L34 10 C36 16 30 20 24 16 L14 10 C6 12 -6 12 -14 6 C-18 4 -20 0 -20 -6 Z" fill="{color}"/>'
        f'<path d="M-6 -20 C-22 -26 -32 -12 -26 0 C-22 8 -10 8 -8 0 C-6 -6 -12 -10 -16 -6" fill="none" stroke="{horn}" stroke-width="4.5" stroke-linecap="round"/>'
        f'<circle cx="12" cy="-12" r="2" fill="#1A0A04"/>'
        f'<circle cx="0" cy="-34" r="7" fill="{horn}"/></g>'
    )


# ---------------------------------------------------------------- la maison peinte de Nubie (Gharb Soheil, Assouan)

def triangle_row(x0, x1, y, h, step, fills, outline=None, down=False, op=1):
    """Rangée de triangles peints (frise des façades nubiennes)."""
    out = []
    n = int((x1 - x0) / step)
    for i in range(n):
        xa = x0 + i * step
        if down:
            d = f"M{f(xa)} {f(y)} L{f(xa + step)} {f(y)} L{f(xa + step / 2)} {f(y + h)} Z"
        else:
            d = f"M{f(xa)} {f(y + h)} L{f(xa + step / 2)} {f(y)} L{f(xa + step)} {f(y + h)} Z"
        st = f' stroke="{outline}" stroke-width="0.8"' if outline else ""
        out.append(f'<path d="{d}" fill="{fills[i % len(fills)]}"{st}/>')
    return f'<g opacity="{op}">{"".join(out)}</g>'


def diamond_chain(x0, x1, y, h, step, fill, line, op=1):
    out = [f'<line x1="{f(x0)}" y1="{f(y)}" x2="{f(x1)}" y2="{f(y)}" stroke="{line}" stroke-width="1.4"/>']
    n = int((x1 - x0) / step)
    for i in range(n):
        cx = x0 + (i + 0.5) * step
        out.append(f'<path d="M{f(cx)} {f(y - h / 2)} L{f(cx + step * 0.32)} {f(y)} L{f(cx)} {f(y + h / 2)} L{f(cx - step * 0.32)} {f(y)} Z" fill="{fill}" stroke="{line}" stroke-width="1"/>')
        out.append(f'<circle cx="{f(cx)}" cy="{f(y)}" r="{f(h * 0.12)}" fill="{line}"/>')
    return f'<g opacity="{op}">{"".join(out)}</g>'


def vertical_zigzag(x, y0, y1, amp, step, color, w=3, op=1):
    pts = []
    y = y0
    k = 0
    while y <= y1:
        pts.append(f"{f(x + (amp if k % 2 else -amp))} {f(y)}")
        y += step
        k += 1
    return f'<path d="M{" L".join(pts)}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linejoin="round" opacity="{op}"/>'


def nubian_plate(card, name, cx, cy, r, rim_c="#2D6FB8", motif="#2D6FB8", ground="#FBF6EC"):
    """Une assiette de faïence scellée dans le mur : les maisons nubiennes en portent au-dessus des portes."""
    g = card.rgrad(name, [(0, "#FFFFFF", 1), (0.7, ground, 1), (1, "#D9CDB8", 1)], 0.4, 0.35, 0.7)
    out = [f'<circle cx="{f(cx + 1.5)}" cy="{f(cy + 2.5)}" r="{f(r)}" fill="#000000" opacity="0.28"/>',
           f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}" stroke="{rim_c}" stroke-width="{f(r * 0.12)}"/>',
           f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.72)}" fill="none" stroke="{motif}" stroke-width="{f(r * 0.05)}"/>']
    for i in range(8):
        a = i * 45
        px, py = pt(cx, cy, r * 0.45, a)
        out.append(f'<path d="M{f(cx)} {f(cy)} Q{f(pt(cx, cy, r * 0.3, a - 25)[0])} {f(pt(cx, cy, r * 0.3, a - 25)[1])} {f(px)} {f(py)} Q{f(pt(cx, cy, r * 0.3, a + 25)[0])} {f(pt(cx, cy, r * 0.3, a + 25)[1])} {f(cx)} {f(cy)} Z" fill="{motif}" opacity="0.85"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.1)}" fill="#E8B53C"/>')
    out.append(f'<ellipse cx="{f(cx - r * 0.35)}" cy="{f(cy - r * 0.4)}" rx="{f(r * 0.3)}" ry="{f(r * 0.14)}" fill="#FFFFFF" opacity="0.7" transform="rotate(-30 {f(cx - r * 0.35)} {f(cy - r * 0.4)})"/>')
    return "".join(out)


def openwork_parapet(x0, x1, y, h, step, color, hole="#0A1630"):
    """Le parapet ajouré des toits nubiens : merlons en dents de scie, petites ouvertures triangulaires."""
    out = []
    n = int((x1 - x0) / step)
    pts = [f"{f(x0)} {f(y + h)}"]
    for i in range(n):
        xa = x0 + i * step
        pts += [f"{f(xa)} {f(y + h * 0.35)}", f"{f(xa + step / 2)} {f(y)}", f"{f(xa + step)} {f(y + h * 0.35)}"]
    pts.append(f"{f(x0 + n * step)} {f(y + h)}")
    out.append(f'<path d="M{" L".join(pts)} Z" fill="{color}"/>')
    for i in range(n):
        xa = x0 + i * step + step / 2
        out.append(f'<path d="M{f(xa - step * 0.16)} {f(y + h * 0.82)} L{f(xa)} {f(y + h * 0.45)} L{f(xa + step * 0.16)} {f(y + h * 0.82)} Z" fill="{hole}"/>')
    return "".join(out)


def mud_dome(card, name, cx, base_y, r, lit="#E9B27A", dark="#8A4E2A"):
    g = card.rgrad(name, [(0, lit, 1), (0.7, dark, 1), (1, dark, 1)], 0.35, 0.3, 0.9)
    return (f'<path d="M{f(cx - r)} {f(base_y)} A{f(r)} {f(r * 0.9)} 0 0 1 {f(cx + r)} {f(base_y)} Z" fill="{g}"/>'
            f'<circle cx="{f(cx)}" cy="{f(base_y - r * 0.9 - 3)}" r="2.6" fill="{dark}"/>')


def stepped_arch(x0, x1, spring, apex, y1, gap, colors, w=None):
    """Encadrement de porte peint : arcs emboîtés de couleurs, comme les portes de Gharb Soheil."""
    out = []
    for i, c in enumerate(colors):
        k = (i + 1) * gap
        d = arch_outline(x0 - k, x1 + k, spring, apex - k, y1)
        out.append((d, c))
    return "".join(f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{f(w or gap)}"/>' for d, c in reversed(out))


def arch_outline(x0, x1, spring, apex, y1):
    rx = (x1 - x0) / 2
    ry = spring - apex
    return f"M{f(x0)} {f(y1)} L{f(x0)} {f(spring)} A{f(rx)} {f(ry)} 0 0 1 {f(x1)} {f(spring)} L{f(x1)} {f(y1)}"


# ---------------------------------------------------------------- perles, cauris, plafonds étoilés

def cowrie(cx, cy, s, rot=0, shell="#FBF3E2", slit="#5A3A1E"):
    """Un cauri : la coquille-monnaie et parure, des comptoirs de l'océan Indien jusqu'à la Nubie et au Sahel."""
    return (
        f'<g transform="translate({f(cx)} {f(cy)}) rotate({rot}) scale({f(s)})">'
        f'<ellipse cx="0" cy="0" rx="7" ry="10" fill="{shell}" stroke="#C9B48E" stroke-width="0.8"/>'
        f'<path d="M0 -8 C-2 -4 -2 4 0 8 C2 4 2 -4 0 -8 Z" fill="{slit}"/>'
        + "".join(f'<line x1="{-1.6 if i % 2 else 1.6}" y1="{-6 + i * 2}" x2="{-3 if i % 2 else 3}" y2="{-6 + i * 2}" stroke="{slit}" stroke-width="0.7"/>' for i in range(7))
        + f'<ellipse cx="-3" cy="-4" rx="2" ry="3" fill="#FFFFFF" opacity="0.6"/></g>'
    )


def bead_strand(card, name, x, y0, y1, colors, r=4.2, gap=1.0, cowrie_every=0, metal=GOLD3, vertical=True):
    """Un rang de perles (faïence bleue de Kerma, cornaline, or, cauris)."""
    hi, mid, lo = metal
    gold = card.rgrad(name + "-gb", [(0, hi, 1), (0.6, mid, 1), (1, lo, 1)], 0.35, 0.3, 0.7)
    out = []
    y = y0
    i = 0
    while y <= y1:
        c = colors[i % len(colors)]
        if cowrie_every and i % cowrie_every == cowrie_every - 1:
            out.append(cowrie(x, y + r * 1.4, r * 0.16))
            y += r * 3.2 + gap
        elif c == "gold":
            out.append(f'<circle cx="{f(x)}" cy="{f(y + r * 0.7)}" r="{f(r * 0.7)}" fill="{gold}"/>')
            y += r * 1.4 + gap
        else:
            out.append(f'<rect x="{f(x - r)}" y="{f(y)}" width="{f(2 * r)}" height="{f(r * 2.4)}" rx="{f(r * 0.9)}" fill="{c}"/>'
                       f'<rect x="{f(x - r * 0.55)}" y="{f(y + r * 0.3)}" width="{f(r * 0.45)}" height="{f(r * 1.6)}" rx="1" fill="#FFFFFF" opacity="0.35"/>')
            y += r * 2.4 + gap
        i += 1
    return "".join(out)


def star_ceiling(x0, y0, x1, y1, step, color, ground=None, r=None, op=1):
    """Le plafond des tombes : étoiles sba en quinconce sur fond de lapis."""
    out = []
    if ground:
        out.append(f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(x1 - x0)}" height="{f(y1 - y0)}" fill="{ground}"/>')
    r = r or step * 0.28
    j = 0
    y = y0 + step / 2
    while y < y1:
        x = x0 + step / 2 + (step / 2 if j % 2 else 0)
        while x < x1:
            out.append(sba_star(x, y, r, color, op, dot=False))
            x += step
        y += step * 0.86
        j += 1
    return "".join(out)


# ---------------------------------------------------------------- la voix : le Bennou, les babouins, les ondes

def bennu(card, name, x, y, s, metal=GOLD3, accent=LAPIS, flip=False, cry=True):
    """Le Bennou, le héron d'Héliopolis dont le cri rompit le silence du premier matin (hauteur ~100 * s, pieds en (x, y))."""
    hi, mid, lo = metal
    g = card.grad(name + "-g", [(0, hi), (0.5, mid), (1, lo)], 0, 0, 1, 1)
    parts = [
        f'<path d="M-3 -30 L-5 0 M4 -30 L7 0" stroke="{g}" stroke-width="2.6" stroke-linecap="round"/>',
        f'<path d="M-9 0 L1 0 M2 0 L12 0" stroke="{g}" stroke-width="2" stroke-linecap="round"/>',
        f'<path d="M-30 -40 L-46 -27 L-40 -26 L-30 -34 Z" fill="{accent}" stroke="{g}" stroke-width="1"/>',
        f'<path d="M-32 -42 C-26 -58 4 -63 18 -52 C25 -47 25 -39 18 -33 C8 -27 -14 -27 -32 -36 Z" fill="{g}"/>',
        f'<path d="M-24 -44 C-14 -52 2 -54 14 -48" fill="none" stroke="{lo}" stroke-width="1.2"/>',
        f'<path d="M-20 -38 C-10 -44 2 -46 12 -42" fill="none" stroke="{accent}" stroke-width="2.2" opacity="0.9"/>',
        f'<path d="M13 -50 C24 -60 9 -72 15 -82 C18 -88 23 -93 28 -93 L31 -88 C27 -86 23 -82 23 -76 C21 -66 31 -57 22 -47 Z" fill="{g}"/>',
        f'<circle cx="28" cy="-90" r="4.4" fill="{g}"/><circle cx="29.4" cy="-91" r="1.2" fill="#1A0A04"/>',
        f'<path d="M31 -92.5 L52 -100 L32 -89 Z" fill="{g}"/>',
        f'<path d="M31 -88.5 L50 -86 L31 -86.4 Z" fill="{g}"/>' if cry else f'<path d="M31 -91 L52 -94 L31 -88 Z" fill="{g}"/>',
        f'<path d="M25 -94 C18 -103 8 -106 -2 -102" fill="none" stroke="{g}" stroke-width="1.6" stroke-linecap="round"/>',
        f'<path d="M25 -93 C16 -99 8 -100 1 -96" fill="none" stroke="{g}" stroke-width="1.3" stroke-linecap="round"/>',
    ]
    inner = "".join(parts)
    return f'<g {_tr(x, y, s, flip)} filter="{bevel(card, name + "-bv", 0.6, 1.4, sd=2, dy=2, sop=0.5)}">{inner}</g>'


def voice_arcs(cx, cy, r0, n, step, color, a0=-50, a1=50, w=2.0, op=0.8, dash=None):
    """Les ondes d'une voix : arcs concentriques qui s'élargissent et s'effacent."""
    out = []
    for i in range(n):
        r = r0 + i * step
        x1, y1 = pt(cx, cy, r, a0)
        x2, y2 = pt(cx, cy, r, a1)
        large = 1 if (a1 - a0) > 180 else 0
        da = f' stroke-dasharray="{dash}"' if dash else ""
        out.append(f'<path d="M{f(x1)} {f(y1)} A{f(r)} {f(r)} 0 {large} 1 {f(x2)} {f(y2)}" fill="none" stroke="{color}" stroke-width="{f(w * (1 - i / (n + 2)))}" '
                   f'stroke-linecap="round" opacity="{f(op * (1 - i / (n + 1)))}"{da}/>')
    return "".join(out)


BABOON = (
    "M-12 0 C-17 -10 -15 -24 -7 -30 C-4 -36 2 -40 7 -38 C10 -37 12 -35 13 -33 L18 -31 C19 -29 17 -27 14 -27 "
    "L11 -27 C9 -24 8 -22 9 -19 C13 -16 16 -10 15 -4 L16 0 Z"
)


def baboon(x, y, s, color, hi=None):
    """Un babouin de Thot assis de profil, bras levés : sur la corniche d'Abou Simbel, ils acclament le soleil levant."""
    arms = (f'<path d="M2 -23 C8 -26 13 -30 17 -37" fill="none" stroke="{color}" stroke-width="3.8" stroke-linecap="round"/>'
            f'<path d="M5 -19 C11 -21 17 -24 22 -30" fill="none" stroke="{color}" stroke-width="3.4" stroke-linecap="round"/>'
            f'<path d="M-6 -30 C-10 -26 -12 -20 -10 -14 L-4 -20 Z" fill="{color}"/>')
    light = ""
    if hi:
        light = (f'<path d="M-13 -6 C-15 -16 -12 -26 -6 -31 C-3 -35 2 -38 6 -38" fill="none" stroke="{hi}" stroke-width="1.2" opacity="0.7"/>'
                 f'<path d="M17 -37 C13 -30 8 -26 2 -23" fill="none" stroke="{hi}" stroke-width="0.9" opacity="0.6"/>')
    return f'<g {_tr(x, y, s)}><path d="{BABOON}" fill="{color}"/>{arms}<circle cx="10" cy="-33" r="1" fill="{hi or "#000"}" opacity="0.8"/>{light}</g>'


def falcon_sun(card, name, cx, cy, s, metal=GOLD3, disk=CARN):
    """Le faucon solaire debout, le disque sur la tête (Rê-Horakhty), en silhouette d'or."""
    hi, mid, lo = metal
    g = card.grad(name + "-g", [(0, hi), (0.5, mid), (1, lo)], 0, 0, 1, 1)
    d = ("M-6 0 L-4 -14 C-14 -18 -18 -32 -14 -44 C-12 -52 -6 -58 0 -60 C2 -66 8 -70 14 -68 C18 -66 20 -62 18 -58 "
         "L22 -56 L16 -54 C16 -46 14 -38 12 -30 C14 -20 12 -10 8 -4 L6 0 Z")
    return (f'<g {_tr(cx, cy, s)} filter="{bevel(card, name + "-bv", 0.7, 1.6, sd=2, dy=2)}"><path d="{d}" fill="{g}"/>'
            f'<path d="M-12 -40 C-6 -30 0 -22 8 -12" fill="none" stroke="{lo}" stroke-width="1.2"/>'
            f'<circle cx="10" cy="-62" r="1.6" fill="#1A0A04"/>'
            f'<circle cx="6" cy="-84" r="13" fill="{disk}" stroke="{g}" stroke-width="2"/></g>')


def was_tall(card, name, x, y_top, y_bot, metal=GOLD3, flip=False, w=6):
    """Un grand sceptre ouas : tête d'animal de Seth en crochet, fût droit, base fourchue - deux d'entre eux portent le ciel."""
    hi, mid, lo = metal
    g = card.grad(name + "-g", [(0, hi), (0.5, mid), (1, lo)], 0, 0, 1, 0)
    m = -1 if flip else 1
    head = (f"M{f(x - m * w / 2)} {f(y_top + 30)} C{f(x - m * w / 2)} {f(y_top + 10)} {f(x + m * 2)} {f(y_top)} {f(x + m * 14)} {f(y_top + 2)} "
            f"L{f(x + m * 30)} {f(y_top + 10)} L{f(x + m * 26)} {f(y_top + 15)} L{f(x + m * 12)} {f(y_top + 12)} "
            f"C{f(x + m * 6)} {f(y_top + 14)} {f(x + m * w / 2)} {f(y_top + 20)} {f(x + m * w / 2)} {f(y_top + 30)} Z")
    ears = f"M{f(x + m * 4)} {f(y_top + 2)} L{f(x - m * 2)} {f(y_top - 12)} L{f(x + m * 8)} {f(y_top + 1)} Z"
    fork = (f"M{f(x - w / 2)} {f(y_bot - 26)} L{f(x - 10)} {f(y_bot)} L{f(x - 5)} {f(y_bot)} L{f(x)} {f(y_bot - 12)} "
            f"L{f(x + 5)} {f(y_bot)} L{f(x + 10)} {f(y_bot)} L{f(x + w / 2)} {f(y_bot - 26)} Z")
    return (f'<g filter="{bevel(card, name + "-bv", 0.8, 2, sd=3, dy=2)}">'
            f'<rect x="{f(x - w / 2)}" y="{f(y_top + 26)}" width="{f(w)}" height="{f(y_bot - y_top - 50)}" fill="{g}"/>'
            f'<path d="{head}" fill="{g}"/><path d="{ears}" fill="{g}"/><path d="{fork}" fill="{g}"/>'
            + "".join(f'<rect x="{f(x - w / 2 - 1.5)}" y="{f(y_top + 60 + k * (y_bot - y_top - 140) / 3)}" width="{f(w + 3)}" height="5" rx="1.5" fill="{(LAPIS, CARN, TURQ, LAPIS)[k]}"/>' for k in range(4))
            + '</g>')


def pt_sky(card, name, x0, x1, y, h, metal=GOLD3, ground="#0B1847", stars=7):
    """Le hiéroglyphe du ciel (pt) : une dalle aux extrémités qui retombent, semée d'étoiles."""
    hi, mid, lo = metal
    g = card.grad(name + "-g", [(0, hi), (0.5, mid), (1, lo)], 0, 0, 1, 0)
    d = (f"M{f(x0)} {f(y + h + 12)} L{f(x0 + 6)} {f(y + 4)} Q{f(x0 + 10)} {f(y)} {f(x0 + 20)} {f(y)} L{f(x1 - 20)} {f(y)} "
         f"Q{f(x1 - 10)} {f(y)} {f(x1 - 6)} {f(y + 4)} L{f(x1)} {f(y + h + 12)} L{f(x1 - 14)} {f(y + h)} L{f(x0 + 14)} {f(y + h)} Z")
    st = "".join(sba_star(x0 + 40 + i * (x1 - x0 - 80) / (stars - 1), y + h / 2, h * 0.32, hi, 1, dot=False) for i in range(stars))
    return (f'<g filter="{bevel(card, name + "-bv", 0.8, 2, sd=4, dy=3)}"><path d="{d}" fill="{ground}" stroke="{g}" stroke-width="3"/></g>{st}')
