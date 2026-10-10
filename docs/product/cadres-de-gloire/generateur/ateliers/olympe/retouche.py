"""Pièces dessinées à la retouche (2026-10-10) : phare d'Alexandrie détaillé, faisceau porteur d'Adinkra,
îlot de l'Olympe flottant, etc. Coordonnées absolues, chaînes SVG."""

import math
import random

from common import f, pt, ugrad, urgrad, W, H
from afrique import kente, adinkra, dwennimmen_horns
from base import adinkrahene


def pharos_rich(card, x, by, s=1.0, lit_from=-1, banners=True, seed=3):
    """Le phare d'Alexandrie : tour carrée à fenêtres éclairées de l'intérieur, corniche aux tritons d'or, étage
    octogonal, tambour rond, lanterne, feu et statue d'or ; deux longues bandes de kente pendues en bannières."""
    out = []
    k = lit_from
    x_lit, x_dark = (x - 40 * s, x + 40 * s) if k < 0 else (x + 40 * s, x - 40 * s)
    st = ugrad(card, f"phr-st{k}", [(0, "#D9BE92", 1), (0.22, "#FFF6E2", 1), (0.5, "#E9D2AA", 1), (0.8, "#A0845C", 1), (1, "#6B5236", 1)], x_lit, 0, x_dark, 0)
    warm = urgrad(card, "phr-warm", [(0, "#FFE7A8", 0.55), (1, "#FFE7A8", 0)], x, by - 452 * s, 260 * s)
    out.append(f'<ellipse cx="{f(x)}" cy="{f(by)}" rx="{f(70 * s)}" ry="{f(8 * s)}" fill="#000000" opacity="0.5"/>')
    # tour carrée
    t1 = f"M{f(x - 36 * s)} {f(by)} L{f(x - 28 * s)} {f(by - 272 * s)} L{f(x + 28 * s)} {f(by - 272 * s)} L{f(x + 36 * s)} {f(by)}Z"
    out.append(f'<path d="{t1}" fill="{st}"/>')
    out.append(f'<path d="{t1}" fill="{warm}"/>')
    for i in range(18):
        yy = by - 8 * s - i * 15 * s
        half = 36 * s - (36 - 28) * s * (i * 15 + 8) / 272
        out.append(f'<path d="M{f(x - half)} {f(yy)} L{f(x + half)} {f(yy)}" stroke="#6B5236" stroke-width="{f(0.5 * s)}" opacity="0.35"/>')
    rnd = random.Random(seed)
    for i in range(8):
        yy = by - 26 * s - i * 31 * s
        for dx in (-13, 0, 13):
            lit = rnd.random() < 0.55
            col = "#FFD27A" if lit else "#3A2A1E"
            out.append(f'<rect x="{f(x + dx * s - 2.6 * s)}" y="{f(yy - 10 * s)}" width="{f(5.2 * s)}" height="{f(10 * s)}" rx="{f(2.6 * s)}" fill="{col}" opacity="{0.95 if lit else 0.8}"/>')
            if lit:
                out.append(f'<rect x="{f(x + dx * s - 2.6 * s)}" y="{f(yy - 10 * s)}" width="{f(5.2 * s)}" height="{f(10 * s)}" rx="{f(2.6 * s)}" fill="#FFF4C2" opacity="0.6" filter="{card.blur("phr-wg", 2.2)}"/>')
    out.append(f'<rect x="{f(x - 22 * s)}" y="{f(by - 30 * s)}" width="{f(44 * s)}" height="{f(30 * s)}" fill="#2A1E16" opacity="0.0"/>')
    out.append(f'<path d="M{f(x - 9 * s)} {f(by)} L{f(x - 9 * s)} {f(by - 22 * s)} Q{f(x)} {f(by - 32 * s)} {f(x + 9 * s)} {f(by - 22 * s)} L{f(x + 9 * s)} {f(by)}Z" fill="#2A1A10"/>')
    # corniche et tritons d'angle
    out.append(f'<rect x="{f(x - 38 * s)}" y="{f(by - 282 * s)}" width="{f(76 * s)}" height="{f(10 * s)}" fill="{st}"/>')
    out.append(f'<rect x="{f(x - 38 * s)}" y="{f(by - 282 * s)}" width="{f(76 * s)}" height="{f(1.4 * s)}" fill="#FFF6E0"/>')
    for m in (-1, 1):
        tx = x + m * 33 * s
        ty = by - 282 * s
        out.append(f'<path d="M{f(tx)} {f(ty)} q{f(m * 2 * s)} {f(-10 * s)} {f(m * 1 * s)} {f(-16 * s)} q{f(m * 5 * s)} {f(-2 * s)} {f(m * 6 * s)} {f(-8 * s)} '
                   f'l{f(-m * 2 * s)} {f(-1 * s)} q{f(-m * 1 * s)} {f(4 * s)} {f(-m * 5 * s)} {f(5 * s)} q{f(-m * 4 * s)} {f(-6 * s)} {f(-m * 3 * s)} {f(-14 * s)} '
                   f'q{f(-m * 2 * s)} {f(8 * s)} {f(-m * 1 * s)} {f(14 * s)} q{f(-m * 2 * s)} {f(8 * s)} {f(m * 2 * s)} {f(20 * s)}Z" fill="#E8B53C"/>')
    # étage octogonal
    t2 = f"M{f(x - 22 * s)} {f(by - 282 * s)} L{f(x - 18 * s)} {f(by - 388 * s)} L{f(x + 18 * s)} {f(by - 388 * s)} L{f(x + 22 * s)} {f(by - 282 * s)}Z"
    out.append(f'<path d="{t2}" fill="{st}"/><path d="{t2}" fill="{warm}"/>')
    for dx in (-7, 7):
        out.append(f'<path d="M{f(x + dx * s)} {f(by - 282 * s)} L{f(x + dx * 0.82 * s)} {f(by - 388 * s)}" stroke="#6B5236" stroke-width="{f(1.1 * s)}" opacity="0.55"/>')
    for i in range(3):
        yy = by - 300 * s - i * 30 * s
        out.append(f'<rect x="{f(x - 2.4 * s)}" y="{f(yy - 10 * s)}" width="{f(4.8 * s)}" height="{f(10 * s)}" rx="{f(2.4 * s)}" fill="#FFD27A"/>')
    out.append(f'<rect x="{f(x - 25 * s)}" y="{f(by - 395 * s)}" width="{f(50 * s)}" height="{f(7 * s)}" fill="{st}"/>')
    # tambour et lanterne
    t3 = f"M{f(x - 13 * s)} {f(by - 395 * s)} L{f(x - 12 * s)} {f(by - 432 * s)} L{f(x + 12 * s)} {f(by - 432 * s)} L{f(x + 13 * s)} {f(by - 395 * s)}Z"
    out.append(f'<path d="{t3}" fill="{st}"/>')
    for dx in (-8, 0, 8):
        out.append(f'<rect x="{f(x + dx * s - 1.4 * s)}" y="{f(by - 428 * s)}" width="{f(2.8 * s)}" height="{f(30 * s)}" fill="#6B5236" opacity="0.5"/>')
    out.append(f'<path d="M{f(x - 17 * s)} {f(by - 432 * s)} L{f(x + 17 * s)} {f(by - 432 * s)} L{f(x + 13 * s)} {f(by - 438 * s)} L{f(x - 13 * s)} {f(by - 438 * s)}Z" fill="#E9D2AA"/>')
    fx, fy = x, by - 452 * s
    out.append(f'<rect x="{f(x - 11 * s)}" y="{f(by - 466 * s)}" width="{f(22 * s)}" height="{f(28 * s)}" fill="#FFE7A0"/>')
    for dx in (-11, -4, 4, 11):
        out.append(f'<rect x="{f(x + dx * s - 1.1 * s)}" y="{f(by - 466 * s)}" width="{f(2.2 * s)}" height="{f(28 * s)}" fill="#8A5A12"/>')
    out.append(f'<path d="M{f(x - 14 * s)} {f(by - 466 * s)} L{f(x)} {f(by - 480 * s)} L{f(x + 14 * s)} {f(by - 466 * s)}Z" fill="#E8B53C"/>')
    # statue d'or (silhouette debout, bras levé)
    sx, sy = x, by - 480 * s
    out.append(f'<path d="M{f(sx - 2.6 * s)} {f(sy)} L{f(sx - 2 * s)} {f(sy - 14 * s)} L{f(sx - 3.4 * s)} {f(sy - 22 * s)} L{f(sx)} {f(sy - 25 * s)} L{f(sx + 3.4 * s)} {f(sy - 22 * s)} '
               f'L{f(sx + 6 * s)} {f(sy - 34 * s)} L{f(sx + 7.4 * s)} {f(sy - 33.4 * s)} L{f(sx + 5 * s)} {f(sy - 19 * s)} L{f(sx + 2 * s)} {f(sy - 14 * s)} L{f(sx + 2.6 * s)} {f(sy)}Z" fill="#E8B53C"/>'
               f'<circle cx="{f(sx)}" cy="{f(sy - 28 * s)}" r="{f(3 * s)}" fill="#E8B53C"/>'
               f'<path d="M{f(sx + 6.6 * s)} {f(sy - 33 * s)} L{f(sx + 6.6 * s)} {f(sy - 42 * s)} M{f(sx + 4 * s)} {f(sy - 41 * s)} L{f(sx + 6.6 * s)} {f(sy - 44 * s)} L{f(sx + 9.2 * s)} {f(sy - 41 * s)}" stroke="#E8B53C" stroke-width="{f(1.2 * s)}" fill="none"/>')
    out.append(f'<circle cx="{f(fx)}" cy="{f(fy)}" r="{f(60 * s)}" fill="{card.rgrad("phr-fh", [(0, "#FFFFFF", 0.95), (0.25, "#FFE07A", 0.7), (0.6, "#FF9A3A", 0.25), (1, "#FF7A1A", 0)])}"/>')
    out.append(f'<path d="M{f(fx - 8 * s)} {f(fy + 12 * s)} C{f(fx - 11 * s)} {f(fy)} {f(fx - 2 * s)} {f(fy - 6 * s)} {f(fx)} {f(fy - 18 * s)} '
               f'C{f(fx + 3 * s)} {f(fy - 7 * s)} {f(fx + 11 * s)} {f(fy - 2 * s)} {f(fx + 8 * s)} {f(fy + 12 * s)}Z" fill="#FFF4C2"/>')
    if banners:
        for m, sd in ((-1, 2), (1, 5)):
            bx = x + m * 23 * s
            top = by - 280 * s
            L = 150 * s
            out.append(f'<g transform="rotate({f(m * 1.5)} {f(bx)} {f(top)})">{kente(bx - 5 * s, top, 10 * s, L, seed=sd, vertical=True, cell=11 * s)}'
                       f'<path d="M{f(bx - 5 * s)} {f(top + L)} L{f(bx)} {f(top + L + 9 * s)} L{f(bx + 5 * s)} {f(top + L)}Z" fill="#E8B53C"/></g>')
            out.append(f'<circle cx="{f(bx)}" cy="{f(top + 1)}" r="{f(2.4 * s)}" fill="#FFF4C2"/>')
    return "".join(out), (fx, fy)


def light_beam(card, name, fx, fy, tx, ty, half_far, glyphs=(), glow=9, mask=None, color="#FFD06A"):
    """Un faisceau de phare : cône de lumière depuis (fx, fy) vers (tx, ty), demi-largeur `half_far` au bout ; il porte
    des glyphes (markup) placés le long de son axe, qui s'allument comme des néons d'or."""
    ang = math.atan2(ty - fy, tx - fx)
    nx, ny = -math.sin(ang), math.cos(ang)
    a = (fx + nx * 4, fy + ny * 4)
    b = (fx - nx * 4, fy - ny * 4)
    c_ = (tx - nx * half_far, ty - ny * half_far)
    d = (tx + nx * half_far, ty + ny * half_far)
    poly = f"M{f(a[0])} {f(a[1])} L{f(d[0])} {f(d[1])} L{f(c_[0])} {f(c_[1])} L{f(b[0])} {f(b[1])}Z"
    g1 = ugrad(card, name + "-g", [(0, "#FFF6D8", 0.85), (0.35, color, 0.4), (1, color, 0.03)], fx, fy, tx, ty)
    m = f' mask="{mask}"' if mask else ""
    out = [f'<path d="{poly}" fill="{g1}" filter="{card.blur(name + "-b", glow)}"{m}/>']
    core = f"M{f(fx)} {f(fy)} L{f(tx + nx * half_far * 0.35)} {f(ty + ny * half_far * 0.35)} L{f(tx - nx * half_far * 0.35)} {f(ty - ny * half_far * 0.35)}Z"
    g2 = ugrad(card, name + "-c", [(0, "#FFFFFF", 0.9), (0.5, "#FFF0C0", 0.35), (1, "#FFF0C0", 0)], fx, fy, tx, ty)
    out.append(f'<path d="{core}" fill="{g2}" filter="{card.blur(name + "-b2", 3)}"{m}/>')
    for g in glyphs:
        out.append(f'<g filter="{card.blur(name + "-gg", 3.2)}" opacity="0.9">{g}</g><g>{g}</g>')
    return "".join(out)


# ---------------------------------------------------------------- les Cyclades (Ambassadeur IV)

def white_house(card, x0, by, w, h, rnd, front="#FFF8EE", side="#B8C3DD", blue="#1F5FA8", warm_window=False, side_w=0.2):
    """Une maison chaulée : arêtes adoucies, face éclairée, flanc bleuté à droite, parapet, fenêtre et porte bleues."""
    out = []
    r = min(4, w * 0.12)
    out.append(f'<rect x="{f(x0)}" y="{f(by - h)}" width="{f(w)}" height="{f(h + 2)}" rx="{f(r)}" fill="{front}"/>')
    sw = w * side_w
    out.append(f'<rect x="{f(x0 + w - sw)}" y="{f(by - h)}" width="{f(sw)}" height="{f(h + 2)}" rx="{f(r * 0.6)}" fill="{side}"/>')
    out.append(f'<rect x="{f(x0)}" y="{f(by - h + 2.6)}" width="{f(w)}" height="2.2" fill="{side}" opacity="0.55"/>')
    out.append(f'<rect x="{f(x0 + 1)}" y="{f(by - h)}" width="{f(w - sw - 1)}" height="1.2" fill="#FFFFFF"/>')
    if rnd.random() < 0.75 and w > 18:
        wx = x0 + rnd.uniform(0.15, 0.5) * (w - sw - 8)
        wy = by - h + h * rnd.uniform(0.25, 0.4)
        col = "#FFD27A" if warm_window else blue
        out.append(f'<rect x="{f(wx)}" y="{f(wy)}" width="5.5" height="6.5" rx="0.8" fill="{col}"/>'
                   f'<rect x="{f(wx)}" y="{f(wy + 6)}" width="5.5" height="1.2" fill="{side}"/>')
    if rnd.random() < 0.6 and h > 18:
        dx = x0 + rnd.uniform(0.45, 0.75) * (w - sw - 7)
        out.append(f'<path d="M{f(dx)} {f(by)} L{f(dx)} {f(by - 9)} Q{f(dx + 3.5)} {f(by - 13)} {f(dx + 7)} {f(by - 9)} L{f(dx + 7)} {f(by)}Z" fill="{blue}"/>')
    if rnd.random() < 0.25:
        ax = x0 + w * 0.2
        out.append(f'<path d="M{f(ax)} {f(by)} L{f(ax)} {f(by - h * 0.45)} Q{f(ax + w * 0.18)} {f(by - h * 0.7)} {f(ax + w * 0.36)} {f(by - h * 0.45)} L{f(ax + w * 0.36)} {f(by)}Z" fill="{side}" opacity="0.8"/>')
    return "".join(out)


def blue_dome(card, cx, by, r, blue="#1F5FA8", white="#FFF8EE", side="#B8C3DD", cross="#E8B53C"):
    """Une chapelle à coupole bleue : tambour chaulé, calotte en dégradé, lanternon et croix d'or."""
    g = card.rgrad("cyc-dome", [(0, "#A8D4F6", 1), (0.45, blue, 1), (1, "#0B2C5C", 1)], 0.32, 0.28, 0.85)
    out = [f'<rect x="{f(cx - r * 1.1)}" y="{f(by - r * 0.7)}" width="{f(r * 2.2)}" height="{f(r * 0.7 + 1)}" rx="2" fill="{white}"/>',
           f'<rect x="{f(cx + r * 0.7)}" y="{f(by - r * 0.7)}" width="{f(r * 0.4)}" height="{f(r * 0.7 + 1)}" fill="{side}"/>',
           f'<rect x="{f(cx - r * 1.16)}" y="{f(by - r * 0.76)}" width="{f(r * 2.32)}" height="{f(r * 0.1)}" fill="#FFFFFF"/>',
           f'<path d="M{f(cx - r)} {f(by - r * 0.76)} C{f(cx - r)} {f(by - r * 2.0)} {f(cx + r)} {f(by - r * 2.0)} {f(cx + r)} {f(by - r * 0.76)}Z" fill="{g}"/>',
           f'<path d="M{f(cx - r * 0.55)} {f(by - r * 1.45)} Q{f(cx - r * 0.2)} {f(by - r * 1.72)} {f(cx + r * 0.1)} {f(by - r * 1.7)}" stroke="#FFFFFF" stroke-width="{f(r * 0.1)}" fill="none" opacity="0.6" stroke-linecap="round"/>',
           f'<rect x="{f(cx - r * 0.12)}" y="{f(by - r * 2.05)}" width="{f(r * 0.24)}" height="{f(r * 0.18)}" fill="{white}"/>',
           f'<path d="M{f(cx)} {f(by - r * 2.05)} V{f(by - r * 2.6)} M{f(cx - r * 0.18)} {f(by - r * 2.42)} H{f(cx + r * 0.18)}" stroke="{cross}" stroke-width="{f(max(1, r * 0.09))}"/>']
    return "".join(out)


def windmill(card, cx, by, s=1.0, white="#FFF8EE", side="#B8C3DD", roof="#7A4A2A", sail="#FFF4E0", rot=12):
    """Un moulin des Cyclades : tour ronde chaulée, toit conique de chaume, huit voiles triangulaires sur leurs vergues."""
    out = []
    tw, th = 26 * s, 50 * s
    out.append(f'<path d="M{f(cx - tw / 2)} {f(by)} L{f(cx - tw * 0.44)} {f(by - th)} L{f(cx + tw * 0.44)} {f(by - th)} L{f(cx + tw / 2)} {f(by)}Z" fill="{white}"/>')
    out.append(f'<path d="M{f(cx + tw * 0.18)} {f(by)} L{f(cx + tw * 0.2)} {f(by - th)} L{f(cx + tw * 0.44)} {f(by - th)} L{f(cx + tw / 2)} {f(by)}Z" fill="{side}"/>')
    out.append(f'<path d="M{f(cx - 3 * s)} {f(by)} v{f(-9 * s)} a{f(3 * s)} {f(3 * s)} 0 0 1 {f(6 * s)} 0 v{f(9 * s)}Z" fill="#1F5FA8"/>')
    out.append(f'<rect x="{f(cx - 2 * s)}" y="{f(by - th * 0.62)}" width="{f(4 * s)}" height="{f(5 * s)}" fill="#1F5FA8"/>')
    hx, hy = cx, by - th - 6 * s
    out.append(f'<path d="M{f(cx - tw * 0.5)} {f(by - th + 1)} Q{f(cx)} {f(by - th - 22 * s)} {f(cx + tw * 0.5)} {f(by - th + 1)}Z" fill="{roof}"/>')
    out.append(f'<path d="M{f(cx - tw * 0.5)} {f(by - th + 1)} Q{f(cx)} {f(by - th - 22 * s)} {f(cx + tw * 0.5)} {f(by - th + 1)}" stroke="#4A2A14" stroke-width="{f(0.8 * s)}" fill="none"/>')
    L = 46 * s
    for i in range(8):
        a = rot + i * 45
        ex, ey = pt(hx - 6 * s, hy, L, a)
        out.append(f'<path d="M{f(hx - 6 * s)} {f(hy)} L{f(ex)} {f(ey)}" stroke="#5A3A20" stroke-width="{f(1.2 * s)}"/>')
        mx, my = pt(hx - 6 * s, hy, L * 0.92, a)
        bx, by_ = pt(hx - 6 * s, hy, L * 0.92, a + 16)
        cx2, cy2 = pt(hx - 6 * s, hy, L * 0.25, a + 4)
        out.append(f'<path d="M{f(cx2)} {f(cy2)} L{f(mx)} {f(my)} Q{f((mx + bx) / 2)} {f((my + by_) / 2)} {f(bx)} {f(by_)}Z" fill="{sail}" stroke="#C9B48E" stroke-width="{f(0.5 * s)}" opacity="0.95"/>')
    out.append(f'<circle cx="{f(hx - 6 * s)}" cy="{f(hy)}" r="{f(2.4 * s)}" fill="#5A3A20"/>')
    return "".join(out)


def bell_tower(card, cx, by, s=1.0, white="#FFF8EE", side="#B8C3DD", blue="#1F5FA8", bell="#E8B53C"):
    """Un campanile des Cyclades : façade chaulée à deux étages d'arcades, cloches de bronze, croix."""
    w, h = 30 * s, 70 * s
    out = [f'<path d="M{f(cx - w / 2)} {f(by)} L{f(cx - w / 2)} {f(by - h)} Q{f(cx)} {f(by - h - 16 * s)} {f(cx + w / 2)} {f(by - h)} L{f(cx + w / 2)} {f(by)}Z" fill="{white}"/>',
           f'<rect x="{f(cx + w * 0.3)}" y="{f(by - h)}" width="{f(w * 0.2)}" height="{f(h)}" fill="{side}"/>']
    for row, (yy, n) in enumerate(((by - h * 0.82, 1), (by - h * 0.5, 2))):
        aw = w * (0.36 if n == 1 else 0.3)
        for k in range(n):
            ax = cx - (n - 1) * aw * 0.62 + k * aw * 1.24
            out.append(f'<path d="M{f(ax - aw / 2)} {f(yy + aw * 1.1)} L{f(ax - aw / 2)} {f(yy)} A{f(aw / 2)} {f(aw / 2)} 0 0 1 {f(ax + aw / 2)} {f(yy)} L{f(ax + aw / 2)} {f(yy + aw * 1.1)}Z" fill="#3A5A8A"/>')
            out.append(f'<path d="M{f(ax - aw * 0.3)} {f(yy + aw * 0.9)} Q{f(ax - aw * 0.3)} {f(yy + aw * 0.2)} {f(ax)} {f(yy + aw * 0.2)} Q{f(ax + aw * 0.3)} {f(yy + aw * 0.2)} {f(ax + aw * 0.3)} {f(yy + aw * 0.9)}Z" fill="{bell}"/>')
    out.append(f'<path d="M{f(cx)} {f(by - h - 12 * s)} V{f(by - h - 26 * s)} M{f(cx - 4 * s)} {f(by - h - 21 * s)} H{f(cx + 4 * s)}" stroke="{bell}" stroke-width="{f(1.6 * s)}"/>')
    return "".join(out)


def cyclades_village(card, x0, x1, rows, seed=4, mirror=False, blue="#1F5FA8"):
    """Un village en terrasses : rangées de maisons chaulées de l'arrière vers l'avant
    (`rows` = [(y_base, h_min, h_max)] ou [(y_base, h_min, h_max, xa, xb)] pour une rangée plus courte)."""
    rnd = random.Random(seed)
    out = []
    for i, row in enumerate(rows):
        by, hmin, hmax = row[:3]
        xa, xb = (row[3], row[4]) if len(row) == 5 else (x0, x1)
        x = xa - rnd.uniform(0, 14)
        while x < xb:
            w = rnd.uniform(18, 40)
            h = rnd.uniform(hmin, hmax)
            out.append(white_house(card, x, by + rnd.uniform(-3, 3), w, h, rnd, blue=blue, warm_window=rnd.random() < 0.18))
            x += w - rnd.uniform(0, 4)
    return "".join(out)


def bougainvillea_cascade(card, pts, seed=3, size=1.0, density=1.0):
    """Une cascade de bougainvillée : grappes de bractées magenta (trois pétales en cœur), feuilles ovales, profondeur."""
    rnd = random.Random(seed)
    back, front = [], []
    cols = ("#B0105E", "#D6237A", "#F0489A", "#FF7DB8", "#C2186E")
    for (x, y, r) in pts:
        n = int(r * 1.6 * density)
        for _ in range(n):
            a = rnd.uniform(0, 360)
            d = r * rnd.random() ** 0.7
            px, py = pt(x, y, d, a)
            if rnd.random() < 0.3:
                L = rnd.uniform(5, 8) * size
                rot = rnd.uniform(0, 180)
                back.append(f'<ellipse cx="{f(px)}" cy="{f(py)}" rx="{f(L * 0.36)}" ry="{f(L * 0.7)}" fill="{rnd.choice(("#2F5A22", "#3F6B2A", "#4E7E30"))}" transform="rotate({f(rot)} {f(px)} {f(py)})"/>')
                continue
            s = rnd.uniform(0.7, 1.15) * size
            col = rnd.choice(cols)
            layer = front if rnd.random() < 0.55 else back
            rot0 = rnd.uniform(0, 120)
            petals = []
            for k in range(3):
                pa = rot0 + k * 120
                qx, qy = pt(px, py, 3.0 * s, pa)
                petals.append(f'<ellipse cx="{f(qx)}" cy="{f(qy)}" rx="{f(2.6 * s)}" ry="{f(3.4 * s)}" fill="{col}" transform="rotate({f(pa)} {f(qx)} {f(qy)})"/>')
            petals.append(f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(0.9 * s)}" fill="#FFF2C8"/>')
            if layer is back:
                layer.append(f'<g opacity="0.75">{"".join(petals)}</g>')
            else:
                layer.append("".join(petals))
    shade = card.shadow("bgv-sh", 0, 1.5, 1.2, "#3A0020", 0.45)
    return f'<g filter="{shade}">{"".join(back)}</g><g filter="{shade}">{"".join(front)}</g>'


def shutter(card, hinge_x, y0, y1, width, side=-1, blue="#2A6CB8", dark="#123E78", light="#7FB2E8", slats=22):
    """Un volet de bois peint ouvert vers le spectateur : panneau en trapèze, cadre, persiennes ombrées, gond."""
    out = []
    ox = hinge_x + side * width
    grow = 10
    pts = [(hinge_x, y0), (ox, y0 - grow), (ox, y1 + grow), (hinge_x, y1)]
    d = "M" + " L".join(f"{f(a)} {f(b)}" for a, b in pts) + "Z"
    g = card.grad(f"sh-{side}", [(0, dark), (0.5, blue), (1, light)] if side < 0 else [(0, light), (0.5, blue), (1, dark)], 0, 0, 1, 0)
    out.append(f'<path d="{d}" fill="#000000" opacity="0.35" transform="translate({side * -4} 6)" filter="{card.blur("sh-b", 5)}"/>')
    out.append(f'<path d="{d}" fill="{g}"/>')
    inset = 6
    def lerp(t, a, b):
        return a + (b - a) * t
    def edge_y(t, top=True):
        return lerp(t, y0, y0 - grow) + (inset if top else 0) if top else lerp(t, y1, y1 + grow) - inset
    xa, xb = hinge_x + side * inset, ox - side * inset
    for half in (0, 1):
        ya = lerp(half / 2, y0 + inset, y1 - inset)
        yb = lerp((half + 1) / 2, y0 + inset, y1 - inset) - 3
        n = slats // 2
        for k in range(n):
            t = (k + 0.5) / n
            yy = lerp(t, ya, yb)
            gy = yy + (yy - (y0 + y1) / 2) / ((y1 - y0) / 2) * grow * 0.9
            out.append(f'<path d="M{f(xa)} {f(yy)} L{f(xb)} {f(gy)}" stroke="{dark}" stroke-width="2.6" opacity="0.75"/>'
                       f'<path d="M{f(xa)} {f(yy - 2.2)} L{f(xb)} {f(gy - 2.4)}" stroke="{light}" stroke-width="1" opacity="0.65"/>')
    mid = (y0 + y1) / 2
    out.append(f'<path d="M{f(hinge_x)} {f(mid)} L{f(ox)} {f(mid)}" stroke="{dark}" stroke-width="5"/>')
    out.append(f'<path d="{d}" fill="none" stroke="{dark}" stroke-width="3"/>')
    for yy in (y0 + 30, y1 - 30):
        out.append(f'<rect x="{f(hinge_x - 4)}" y="{f(yy - 5)}" width="8" height="10" rx="2" fill="#5A4A3A"/>')
    return "".join(out)


# ---------------------------------------------------------------- l'Olympe flottant (Légende V)

def rock_filter(card, name, freq="0.03 0.05", seed=4, scale=3.2, az=215, el=52, k1=1.3):
    """Texture de roche : un bruit fractal éclairé de biais multiplie la couleur de la forme."""
    card.def_once(name, f'<filter id="{card.id(name)}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">'
                        f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="4" seed="{seed}" result="n"/>'
                        f'<feDiffuseLighting in="n" surfaceScale="{scale}" diffuseConstant="1" lighting-color="#FFFFFF" result="l">'
                        f'<feDistantLight azimuth="{az}" elevation="{el}"/></feDiffuseLighting>'
                        f'<feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="{k1}" k2="0" k3="0" k4="0" result="t"/>'
                        f'<feComposite in="t" in2="SourceAlpha" operator="in"/></filter>')
    return f"url(#{card.id(name)})"


def _jitter_line(p0, p1, n, amp, rnd):
    pts = []
    for i in range(n + 1):
        t = i / n
        x = p0[0] + (p1[0] - p0[0]) * t
        y = p0[1] + (p1[1] - p0[1]) * t
        if 0 < i < n:
            x += rnd.uniform(-amp, amp)
            y += rnd.uniform(-amp * 0.4, amp * 0.4)
        pts.append((x, y))
    return pts


def temple_small(card, cx, by, s, glow="#FFD27A", gold="#E8B53C", n=6):
    """Un petit temple périptère : degrés, colonnes claires sur une cella éclairée de l'intérieur, fronton liseré d'or."""
    w = 70 * s
    h = 30 * s
    out = [f'<ellipse cx="{f(cx)}" cy="{f(by - h * 0.6)}" rx="{f(w * 0.8)}" ry="{f(h * 1.1)}" fill="{card.rgrad("ts-glow", [(0, glow, 0.55), (1, glow, 0)])}"/>']
    out.append(f'<rect x="{f(cx - w / 2 + 3 * s)}" y="{f(by - h - 2 * s)}" width="{f(w - 6 * s)}" height="{f(h)}" fill="{glow}"/>')
    out.append(f'<rect x="{f(cx - w / 2 + 3 * s)}" y="{f(by - h - 2 * s)}" width="{f(w - 6 * s)}" height="{f(h)}" fill="{card.grad("ts-in", [(0, "#FFF4D0"), (1, "#C26A1A")])}" opacity="0.65"/>')
    for k in range(n):
        x = cx - w / 2 + 5 * s + k * (w - 10 * s) / (n - 1)
        out.append(f'<rect x="{f(x - 2.6 * s)}" y="{f(by - h - 2 * s)}" width="{f(5.2 * s)}" height="{f(h)}" fill="#F4EEF8"/>'
                   f'<rect x="{f(x + 0.8 * s)}" y="{f(by - h - 2 * s)}" width="{f(1.8 * s)}" height="{f(h)}" fill="#A99CC8"/>')
    for i, (dx, hh) in enumerate(((0, 2.2), (2.5, 2.2), (5, 2.2))):
        out.append(f'<rect x="{f(cx - w / 2 - dx * s)}" y="{f(by - 2 * s + i * 2.2 * s)}" width="{f(w + 2 * dx * s)}" height="{f(hh * s)}" fill="{("#FFFFFF", "#E6DCF4", "#C8BCE4")[i]}"/>')
    out.append(f'<rect x="{f(cx - w / 2 - 1 * s)}" y="{f(by - h - 7 * s)}" width="{f(w + 2 * s)}" height="{f(5 * s)}" fill="#F4EEF8"/>')
    out.append(f'<path d="M{f(cx - w / 2 - 3 * s)} {f(by - h - 7 * s)} L{f(cx)} {f(by - h - 20 * s)} L{f(cx + w / 2 + 3 * s)} {f(by - h - 7 * s)}Z" fill="#FFFFFF"/>')
    out.append(f'<path d="M{f(cx - w / 2 - 3 * s)} {f(by - h - 7 * s)} L{f(cx)} {f(by - h - 20 * s)} L{f(cx + w / 2 + 3 * s)} {f(by - h - 7 * s)}" fill="none" stroke="{gold}" stroke-width="{f(1.4 * s)}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(by - h - 12 * s)}" r="{f(2 * s)}" fill="{gold}"/>')
    return "".join(out)


def floating_island(card, name="fo2", seed=4, peaks=((114, 40), (430, 52)), lit="#C9B4F0", mid="#6A55A0", deep="#24163E", under="#0C0618"):
    """Le mont Olympe arraché à la Terre : arêtes et ravines ombrées, neiges déchiquetées, roche texturée, ventre de roche
    hérissé de racines et de cristaux qui luisent."""
    rnd = random.Random(seed)
    top = [(16, 236), (36, 196), (58, 126), (78, 100), (96, 70), peaks[0], (134, 64), (152, 84), (176, 102), (198, 132), (228, 168), (270, 198),
           (310, 170), (338, 142), (360, 114), (386, 96), (410, 74), peaks[1], (452, 80), (470, 100), (488, 122), (506, 176), (524, 236)]
    bottom = [(524, 236), (516, 262), (498, 282), (486, 326), (470, 378), (456, 324), (440, 288), (400, 278), (330, 288), (270, 294), (210, 288),
              (140, 278), (100, 288), (86, 324), (70, 378), (56, 322), (42, 282), (24, 262)]
    sil = top + bottom[1:]
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in sil) + "Z"
    body = ugrad(card, name + "-g", [(0, lit, 1), (0.35, mid, 1), (0.68, deep, 1), (1, under, 1)], 0, 40, 0, 380)
    clip = card.def_once(name + "-clip", f'<clipPath id="{card.id(name + "-clip")}"><path d="{d}"/></clipPath>')
    inner = [f'<rect x="0" y="0" width="540" height="400" fill="{body}"/>']
    base_y = 244
    ridge_sets = []
    for (px, py) in peaks:
        feet = [px - 130, px - 92, px - 60, px - 30, px - 6, px + 22, px + 52, px + 86, px + 126]
        lines = [_jitter_line((px, py), (fx, base_y + rnd.uniform(-6, 6)), 7, 9, rnd) for fx in feet]
        ridge_sets.append(lines)
        for i in range(len(lines) - 1):
            poly = lines[i] + list(reversed(lines[i + 1]))
            dd = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in poly) + "Z"
            mx = (lines[i][-1][0] + lines[i + 1][-1][0]) / 2
            right = mx > px
            if right:
                col, op = "#06021A", 0.42 + 0.12 * (i % 2)
            else:
                col, op = ("#FFE6F4", 0.16) if i % 2 else ("#3A2060", 0.18)
            inner.append(f'<path d="{dd}" fill="{col}" opacity="{f(op)}"/>')
        for ln in lines[1:-1]:
            dd = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in ln[:5])
            inner.append(f'<path d="{dd}" fill="none" stroke="#FFF0FA" stroke-width="0.7" opacity="0.18"/>')
    inner.append(f'<rect x="0" y="236" width="540" height="160" fill="{ugrad(card, name + "-ug", [(0, "#000000", 0.15), (1, "#000000", 0.7)], 0, 236, 0, 380)}"/>')
    for k in range(40):
        x = rnd.uniform(20, 520)
        inner.append(f'<path d="M{f(x)} 250 L{f(x + rnd.uniform(-6, 6))} {f(250 + rnd.uniform(30, 120))}" stroke="#000000" stroke-width="{f(rnd.uniform(0.6, 2))}" opacity="0.3"/>')
    rock = rock_filter(card, name + "-rk", seed=seed)
    out = [f'<g filter="{rock}"><g clip-path="{clip}">{"".join(inner)}</g></g>']
    snow = card.grad(name + "-snow", [(0, "#FFFFFF"), (0.55, "#F4ECFF"), (1, "#C9B8F0")])
    for (px, py), lines in zip(peaks, ridge_sets):
        pts = []
        for i, ln in enumerate(lines[1:-1]):
            k = rnd.uniform(0.34, 0.5) if i % 2 == 0 else rnd.uniform(0.16, 0.24)
            j = min(len(ln) - 1, max(1, int(k * (len(ln) - 1))))
            t = k * (len(ln) - 1) - j
            x = ln[j][0] + (ln[min(j + 1, len(ln) - 1)][0] - ln[j][0]) * t
            y = ln[j][1] + (ln[min(j + 1, len(ln) - 1)][1] - ln[j][1]) * t
            pts.append((x, y))
            if i < len(lines) - 3:
                nx_ = lines[i + 2]
                jj = max(1, int(0.14 * (len(nx_) - 1)))
                pts.append(((x + nx_[jj][0]) / 2, (y + nx_[jj][1]) / 2 - rnd.uniform(4, 10)))
        dd = f"M{f(px)} {f(py - 2)} " + " ".join(f"L{f(x)} {f(y)}" for x, y in pts) + "Z"
        out.append(f'<path d="{dd}" fill="{snow}"/>')
        rs = f"M{f(px)} {f(py - 2)} " + " ".join(f"L{f(x)} {f(y)}" for x, y in pts if x > px) + "Z"
        out.append(f'<path d="{rs}" fill="#7A68B0" opacity="0.5"/>')
    cr = []
    for x, y in ((80, 300), (92, 336), (462, 300), (476, 340), (300, 286), (230, 284)):
        for j in range(3):
            h = rnd.uniform(8, 16)
            a = rnd.uniform(-25, 25)
            col = rnd.choice(("#9FF0FF", "#FFB6F0", "#D6C6FF"))
            cr.append(f'<path d="M{f(x - 2.5)} {f(y)} L{f(x)} {f(y + h)} L{f(x + 2.5)} {f(y)} L{f(x)} {f(y - 2)}Z" fill="{col}" transform="rotate({f(a)} {f(x)} {f(y)})"/>')
    out.append(f'<g filter="{card.blur(name + "-crg", 3)}" opacity="0.9">{"".join(cr)}</g><g>{"".join(cr)}</g>')
    out.append(f'<path d="{d}" fill="none" stroke="#FFE6F8" stroke-width="1" opacity="0.4"/>')
    return "".join(out)


# ---------------------------------------------------------------- constellations ajoutées

import cosmos as _cosmos  # noqa: E402

_cosmos.CONST.setdefault("auriga", ([(0.62, 0.16, 1), (0.28, 0.22, 2), (0.2, 0.6, 2), (0.5, 0.94, 2), (0.84, 0.64, 2), (0.74, 0.32, 3), (0.8, 0.38, 3), (0.86, 0.42, 3)],
                                    [(0, 1), (1, 2), (2, 3), (3, 4), (4, 0), (0, 5), (5, 6), (6, 7)]))


def quadriga(card, x, y, s, rot=-12, tones=("#FFF6D0", "#F5D27A", "#E1A93A", "#B8801C"), stroke="#5E3A08", dx=26, dy=-22, rel=None):
    """Le quadrige : quatre chevaux en échelon (le plus proche le plus clair), crinières étoilées."""
    from figures import horse
    team = []
    for k in (3, 2, 1, 0):
        team.append(horse(x + k * dx * s / 0.52, y + k * dy * s / 0.52, s, tones[k], stroke=stroke, sw=1.4))
    g = "".join(team)
    if rel:
        g = f'<g filter="{rel}">{g}</g>'
    return f'<g transform="rotate({f(rot)} {f(x)} {f(y)})">{g}</g>'


# ---------------------------------------------------------------- le quasar (Mythe B)

def black_hole_crisp(card, name, cx, cy, r, tilt=0.15, rx_max=4.2, seed=7):
    """Un trou noir vu presque par la tranche : ombre, anneau de photons, face cachée du disque lentillée au-dessus et
    au-dessous de l'ombre, disque d'accrétion strié, plus brillant du côté qui vient vers nous (effet Doppler)."""
    rnd = random.Random(seed)
    hot = ugrad(card, name + "-dop", [(0, "#DDF0FF", 1), (0.25, "#FFFFFF", 1), (0.5, "#FFE2A0", 1), (0.78, "#FF8A3A", 1), (1, "#B8301A", 1)], cx - r * rx_max, 0, cx + r * rx_max, 0)
    out = []
    out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * rx_max * 1.15)}" ry="{f(r * 2.6)}" fill="{card.rgrad(name + "-halo", [(0, "#FFB347", 0.5), (0.45, "#C2410C", 0.18), (1, "#C2410C", 0)])}"/>')
    card.def_once(name + "-up", f'<clipPath id="{card.id(name + "-up")}"><rect x="-100" y="-100" width="{W + 200}" height="{f(cy + 100)}"/></clipPath>')
    card.def_once(name + "-dn", f'<clipPath id="{card.id(name + "-dn")}"><rect x="-100" y="{f(cy)}" width="{W + 200}" height="{f(H)}"/></clipPath>')
    streaks = []
    n = 46
    for i in range(n):
        t = i / (n - 1)
        rx = r * (1.45 + (rx_max - 1.45) * t)
        ry = rx * tilt
        wd = rnd.uniform(0.5, 2.6) * (1.2 - t * 0.6)
        op = rnd.uniform(0.35, 1.0) * (1 - t * 0.55)
        streaks.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="none" stroke="{hot}" stroke-width="{f(wd)}" opacity="{f(op)}"/>')
    disk = "".join(streaks)
    glow = card.blur(name + "-gl", r * 0.12)
    out.append(f'<g clip-path="url(#{card.id(name + "-up")})"><g filter="{glow}" opacity="0.8">{disk}</g>{disk}</g>')
    lens = []
    for k in range(14):
        t = k / 13
        a_rx = r * (1.22 + 0.7 * t)
        a_ry = r * (1.18 + 0.45 * t)
        wd = rnd.uniform(0.8, 3.2) * (1.1 - t * 0.5)
        lens.append(f'<path d="M{f(cx - a_rx)} {f(cy)} A{f(a_rx)} {f(a_ry)} 0 0 1 {f(cx + a_rx)} {f(cy)}" fill="none" stroke="{hot}" stroke-width="{f(wd)}" opacity="{f(rnd.uniform(0.4, 0.95) * (1 - t * 0.5))}"/>')
    for k in range(5):
        t = k / 4
        a_rx = r * (1.12 + 0.18 * t)
        a_ry = r * (1.1 + 0.1 * t)
        lens.append(f'<path d="M{f(cx - a_rx)} {f(cy)} A{f(a_rx)} {f(a_ry)} 0 0 0 {f(cx + a_rx)} {f(cy)}" fill="none" stroke="{hot}" stroke-width="{f(rnd.uniform(0.6, 1.6))}" opacity="{f(rnd.uniform(0.35, 0.7))}"/>')
    lens_s = "".join(lens)
    out.append(f'<g filter="{glow}" opacity="0.85">{lens_s}</g>{lens_s}')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.07)}" fill="none" stroke="#FFF6E0" stroke-width="{f(r * 0.05)}" filter="{card.blur(name + "-pr", 2)}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.06)}" fill="none" stroke="#FFFFFF" stroke-width="1.2"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="#000000"/>')
    out.append(f'<g clip-path="url(#{card.id(name + "-dn")})"><g filter="{glow}" opacity="0.8">{disk}</g>{disk}</g>')
    return "".join(out)


def lightning(card, name, x0, y0, x1, y1, seed=1, depth=3, amp=0.22, color="#BFE6FF", w=2.2, segs=9):
    """Un éclair ramifié : tracé principal en zigzag, branches qui se détachent et s'amenuisent, halo."""
    rnd = random.Random(seed)
    paths = []

    def bolt_pts(ax, ay, bx, by, n, a):
        L = math.hypot(bx - ax, by - ay) or 1
        nx, ny = -(by - ay) / L, (bx - ax) / L
        pts = [(ax, ay)]
        for i in range(1, n):
            t = i / n
            k = rnd.uniform(-1, 1) * L * a / n * 2.2
            pts.append((ax + (bx - ax) * t + nx * k, ay + (by - ay) * t + ny * k))
        pts.append((bx, by))
        return pts

    def grow(ax, ay, bx, by, wd, d):
        pts = bolt_pts(ax, ay, bx, by, segs, amp)
        paths.append(("M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts), wd))
        if d <= 0:
            return
        for i in range(2, len(pts) - 2):
            if rnd.random() < 0.32:
                px, py = pts[i]
                L = math.hypot(bx - ax, by - ay) * rnd.uniform(0.25, 0.45)
                ang = math.atan2(by - ay, bx - ax) + rnd.choice((-1, 1)) * rnd.uniform(0.4, 0.9)
                grow(px, py, px + math.cos(ang) * L, py + math.sin(ang) * L, wd * 0.55, d - 1)

    grow(x0, y0, x1, y1, w, depth)
    glow = "".join(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(wd * 4)}" stroke-linejoin="round" stroke-linecap="round"/>' for d, wd in paths)
    core = "".join(f'<path d="{d}" fill="none" stroke="#FFFFFF" stroke-width="{f(wd)}" stroke-linejoin="round" stroke-linecap="round"/>' for d, wd in paths)
    return f'<g filter="{card.blur(name + "-lg", 3.2)}" opacity="0.75">{glow}</g>{core}'


# ---------------------------------------------------------------- loupes (Oracle)

def loupe(card, name, cx, cy, r, inner, ring="#DCE6F5", bg=("#0E2A48", "#06101E"), w=2.2):
    """Une loupe : disque de verre sombre où l'on voit ce qui est trop petit pour l'œil, cerclé de métal, reflet."""
    clip = card.def_once(name + "-cl", f'<clipPath id="{card.id(name + "-cl")}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}"/></clipPath>')
    g = card.rgrad(name + "-bg", [(0, bg[0], 0.95), (1, bg[1], 0.95)], 0.45, 0.4, 0.7)
    return (f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r + 6)}" fill="{card.rgrad(name + "-h", [(0, ring, 0.35), (1, ring, 0)])}"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/>'
            f'<g clip-path="{clip}">{inner}</g>'
            f'<path d="M{f(cx - r * 0.7)} {f(cy - r * 0.45)} A{f(r * 0.85)} {f(r * 0.85)} 0 0 1 {f(cx + r * 0.1)} {f(cy - r * 0.82)}" fill="none" stroke="#FFFFFF" stroke-width="{f(r * 0.1)}" stroke-linecap="round" opacity="0.35"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="{ring}" stroke-width="{f(w)}"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r + 3)}" fill="none" stroke="{ring}" stroke-width="0.6" opacity="0.6"/>')


def zoom_lines(a, ra, b, rb, color="#DCE6F5", op=0.5):
    """Les deux tangentes qui relient une petite chose à sa loupe (le « zoom » des planches scientifiques)."""
    (ax, ay), (bx, by) = a, b
    ang = math.atan2(by - ay, bx - ax)
    nx, ny = -math.sin(ang), math.cos(ang)
    return (f'<path d="M{f(ax + nx * ra)} {f(ay + ny * ra)} L{f(bx + nx * rb)} {f(by + ny * rb)} M{f(ax - nx * ra)} {f(ay - ny * ra)} L{f(bx - nx * rb)} {f(by - ny * rb)}" '
            f'stroke="{color}" stroke-width="0.7" stroke-dasharray="2 2.5" opacity="{op}"/>')


# ---------------------------------------------------------------- paysage grec (Orateur C)

def cypress_fine(x, by, h, dark="#1A1410", rim="#FF9A50", seed=1, rim_side=-1):
    """Un cyprès en flamme : fuseau de feuillage en écailles, liseré de couchant d'un côté."""
    rnd = random.Random(seed)
    w = h * 0.16
    pts_l, pts_r = [], []
    for i in range(13):
        t = i / 12
        yy = by - h * t
        half = w * math.sin(math.pi * min(1, (t * 0.92 + 0.06))) ** 0.8 * (1 - t * 0.35)
        pts_l.append((x - half * rnd.uniform(0.85, 1.1), yy))
        pts_r.append((x + half * rnd.uniform(0.85, 1.1), yy))
    pts = pts_l + [(x, by - h * 1.04)] + list(reversed(pts_r))
    d = "M" + " L".join(f"{f(a)} {f(b)}" for a, b in pts) + "Z"
    side = pts_l if rim_side < 0 else pts_r
    rd = "M" + " L".join(f"{f(a)} {f(b)}" for a, b in side)
    return f'<path d="{d}" fill="{dark}" stroke="{dark}" stroke-width="1.2" stroke-linejoin="round"/><path d="{rd}" fill="none" stroke="{rim}" stroke-width="1" opacity="0.7"/>'


def stone_pine(x, by, h, dark="#1A1410", rim="#FF9A50", seed=2):
    """Un pin parasol : tronc fin et incliné, couronne plate en nuage."""
    rnd = random.Random(seed)
    tx, ty = x + h * 0.12, by - h * 0.7
    out = [f'<path d="M{f(x - 2)} {f(by)} Q{f(x + h * 0.02)} {f(by - h * 0.4)} {f(tx)} {f(ty)} L{f(tx + 3)} {f(ty)} Q{f(x + h * 0.06)} {f(by - h * 0.4)} {f(x + 3)} {f(by)}Z" fill="{dark}"/>']
    blobs = []
    for k in range(9):
        bx = tx + rnd.uniform(-h * 0.38, h * 0.38)
        byy = ty - rnd.uniform(0, h * 0.14)
        r = h * rnd.uniform(0.1, 0.16)
        blobs.append(f'<ellipse cx="{f(bx)}" cy="{f(byy)}" rx="{f(r * 1.5)}" ry="{f(r * 0.75)}" fill="{dark}"/>')
    out.append("".join(blobs))
    out.append(f'<path d="M{f(tx - h * 0.4)} {f(ty - h * 0.05)} Q{f(tx)} {f(ty - h * 0.26)} {f(tx + h * 0.42)} {f(ty - h * 0.06)}" fill="none" stroke="{rim}" stroke-width="1" opacity="0.6"/>')
    return "".join(out)


# ---------------------------------------------------------------- Légende I : la lyre cosmique

def pythagoras_tree(x0, y0, x1, y1, depth, color, angle=36.87, w=0.7, op=0.9, leaf="#FFF4C2"):
    """L'arbre de Pythagore : sur chaque carré, un triangle rectangle (3-4-5) porte deux carrés plus petits, à l'infini."""
    out = []

    def sq(ax, ay, bx, by, d):
        dx, dy = bx - ax, by - ay
        nx, ny = dy, -dx
        cx_, cy_ = bx + nx, by + ny
        dx_, dy_ = ax + nx, ay + ny
        k = d / depth
        fill_op = 0.06 + 0.22 * (1 - k)
        out.append(f'<path d="M{f(ax)} {f(ay)} L{f(bx)} {f(by)} L{f(cx_)} {f(cy_)} L{f(dx_)} {f(dy_)}Z" fill="{leaf if d < 2 else color}" fill-opacity="{f(fill_op if d >= 2 else 0.7)}" '
                   f'stroke="{color}" stroke-width="{f(max(0.3, w * (0.5 + k)))}" opacity="{f(op)}"/>')
        if d <= 0:
            return
        hx, hy = cx_ - dx_, cy_ - dy_
        L = math.hypot(hx, hy)
        t = math.radians(angle)
        ux, uy = hx / L, hy / L
        rx = ux * math.cos(t) + uy * math.sin(t)
        ry = -ux * math.sin(t) + uy * math.cos(t)
        px, py = dx_ + rx * L * math.cos(t), dy_ + ry * L * math.cos(t)
        sq(dx_, dy_, px, py, d - 1)
        sq(px, py, cx_, cy_, d - 1)

    sq(x0, y0, x1, y1, depth)
    return "".join(out)


def lyre_bridge(card, x0, x1, y, pegs, color="#E8B53C", hi="#FFF4C2", lo="#7A4E10"):
    """Un chevalet d'or : barre ronde et chevilles aux points d'attache des cordes."""
    g = card.grad("lb-g", [(0, hi), (0.45, color), (1, lo)])
    out = [f'<rect x="{f(x0)}" y="{f(y - 3.5)}" width="{f(x1 - x0)}" height="7" rx="3.5" fill="{g}" stroke="{lo}" stroke-width="0.6"/>']
    for px in pegs:
        out.append(f'<circle cx="{f(px)}" cy="{f(y)}" r="4.6" fill="{g}" stroke="{lo}" stroke-width="0.6"/><circle cx="{f(px - 1.2)}" cy="{f(y - 1.4)}" r="1.4" fill="#FFFFFF" opacity="0.8"/>')
    return "".join(out)


def quantum_atom(card, name, cx, cy, r, color="#9FD8FF", op=0.75):
    """Un atome quantique : nuage d'orbitales p (trois paires de lobes) autour d'un noyau, une orbite de Bohr en filigrane."""
    from cosmos import p_orbital, nucleus_balls
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.1)}" fill="{card.rgrad(name + "-h", [(0, color, 0.25), (1, color, 0)])}"/>']
    for k, rot in enumerate((0, 60, 120)):
        out.append(p_orbital(card, f"{name}-p{k}", cx, cy, r, color, rot=rot, op=op))
    out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 1.05)}" ry="{f(r * 0.32)}" fill="none" stroke="{color}" stroke-width="0.6" opacity="0.6" transform="rotate(-20 {f(cx)} {f(cy)})"/>')
    out.append(nucleus_balls(cx, cy, r * 0.12, ("#FF7A6A", "#7AA8FF"), 3))
    return "".join(out)


def ringed_planet(card, name, cx, cy, r, col="#FFD36E", ring="#FFE6A0", tilt=0.3, rot=-18):
    g = card.rgrad(name, [(0, "#FFFFFF", 1), (0.35, col, 1), (1, "#2A1A30", 1)], 0.35, 0.35, 0.75)
    back = f'<path d="M{f(cx - r * 2.1)} {f(cy)} A{f(r * 2.1)} {f(r * 2.1 * tilt)} 0 0 1 {f(cx + r * 2.1)} {f(cy)}" fill="none" stroke="{ring}" stroke-width="{f(r * 0.32)}" opacity="0.7"/>'
    front = f'<path d="M{f(cx - r * 2.1)} {f(cy)} A{f(r * 2.1)} {f(r * 2.1 * tilt)} 0 0 0 {f(cx + r * 2.1)} {f(cy)}" fill="none" stroke="{ring}" stroke-width="{f(r * 0.32)}" opacity="0.85"/>'
    return f'<g transform="rotate({f(rot)} {f(cx)} {f(cy)})">{back}<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/>{front}</g>'
