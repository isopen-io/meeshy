"""Atelier « Trésor » — la touche d'Afrique de la salle au trésor : le kuduo (vase de laiton à couvercle où les Akan
gardaient la poudre d'or) et les abrammuo, les petits poids de laiton qui servaient à la peser."""

import math
import random

from kit import f, pt, lg, rg, metal_lin, bevel, soft, poly, grp

AKAN_BRASS = ("#FFE9A8", "#C9962E", "#4A3006")


def kuduo(card, x, y, s=1.0, key="kd", m=AKAN_BRASS, rot=0.0):
    """Le kuduo : pied ajouré évasé, panse ronde gravée (cercles concentriques, chevrons, chemin sinueux),
    couvercle en dôme et, au faîte, un petit oiseau qui se retourne."""
    hi, mid, lo = m
    g = lg(card, key + "-g", [(0, lo), (0.18, mid), (0.4, hi), (0.5, "#FFFFFF"), (0.6, hi), (0.85, mid), (1, lo)], 0, 0, 1, 0)
    gd = lg(card, key + "-gd", [(0, "#2A1A04"), (0.5, lo), (1, "#2A1A04")], 0, 0, 1, 0)
    bv = bevel(card, key + "-bv", 1.0, 2.8, 1.0, 22, shadow=(0, 3, 3, 0.6))
    ink = "#3A2404"
    out = [f'<ellipse cx="0" cy="2" rx="48" ry="8" fill="#000000" opacity="0.55" filter="{soft(card, 5)}"/>']
    foot = "M-34 0 L34 0 L24 -18 L-24 -18 Z"
    body = "M-24 -18 C-58 -24 -60 -62 -30 -76 L30 -76 C60 -62 58 -24 24 -18 Z"
    neck = "M-26 -76 L26 -76 L24 -84 L-24 -84 Z"
    lid = "M-30 -84 L30 -84 C30 -100 16 -110 0 -110 C-16 -110 -30 -100 -30 -84 Z"
    parts = [f'<path d="{foot}" fill="{g}"/>', f'<path d="{body}" fill="{g}"/>', f'<path d="{neck}" fill="{gd}"/>', f'<path d="{lid}" fill="{g}"/>']
    out.append(f'<g filter="{bv}">{"".join(parts)}</g>')
    for k in range(5):
        tx = -22 + k * 11
        out.append(f'<path d="M{f(tx - 3.5)} -3 L{f(tx + 3.5)} -3 L{f(tx)} -14 Z" fill="#1A1004"/>')
    out.append('<path d="M-46 -40 Q0 -34 46 -40" fill="none" stroke="#3A2404" stroke-width="1.2" opacity="0.8"/>')
    out.append('<path d="M-50 -52 Q0 -46 50 -52" fill="none" stroke="#3A2404" stroke-width="1.2" opacity="0.8"/>')
    zig = []
    for i in range(13):
        zx = -44 + i * 7.3
        zy = -43.5 + (3.5 if i % 2 else -3.5) - 0.6 * (1 - (zx / 46) ** 2) * 4
        zig.append(f"{f(zx)} {f(zy)}")
    out.append(f'<path d="M{" L".join(zig)}" fill="none" stroke="{ink}" stroke-width="1.1" opacity="0.85"/>')
    for cx in (-26, 0, 26):
        cy = -62 + abs(cx) * 0.08
        out.append("".join(f'<circle cx="{cx}" cy="{f(cy)}" r="{r}" fill="none" stroke="{ink}" stroke-width="0.9" opacity="0.85"/>' for r in (2.2, 4.6, 7)))
    for cx in (-30, -15, 0, 15, 30):
        out.append(f'<path d="M{cx - 4} -28 L{cx} -23 L{cx + 4} -28" fill="none" stroke="{ink}" stroke-width="1" opacity="0.8"/>')
    out.append('<path d="M-22 -92 Q0 -88 22 -92" fill="none" stroke="#3A2404" stroke-width="1" opacity="0.8"/>')
    out.append("".join(f'<circle cx="{f(-18 + i * 6)}" cy="{f(-98 + abs(-18 + i * 6) * 0.12)}" r="1.1" fill="{ink}" opacity="0.8"/>' for i in range(7)))
    bird = (f'<ellipse cx="0" cy="-118" rx="10" ry="6.5" fill="{g}"/>'
            f'<path d="M-8 -121 C-12 -134 -2 -138 4 -132 C7 -129 5 -125 1 -125" fill="none" stroke="{g}" stroke-width="4.2" stroke-linecap="round"/>'
            f'<circle cx="4.6" cy="-127.4" r="2.6" fill="{g}"/>'
            f'<path d="M9 -118 L15 -114 L9 -114 Z" fill="{g}"/>')
    out.append(f'<g filter="{bv}">{bird}</g>')
    out.append('<path d="M-36 -60 C-38 -46 -32 -32 -22 -24" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" opacity="0.55"/>')
    out.append('<path d="M-16 -104 Q-10 -108 -2 -108" fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" opacity="0.6"/>')
    return grp("".join(out), x, y, s, rot)


def goldweight(card, x, y, s=1.0, kind=0, key="gw", m=AKAN_BRASS, rot=0.0):
    """Un abrammuo, petit poids de laiton à peser la poudre d'or : bloc vu de trois quarts, motif gravé sur le dessus."""
    hi, mid, lo = m
    ft = lg(card, key + "-t", [(0, "#FFF6D0"), (0.5, hi), (1, mid)], 0, 0, 1, 1)
    ff = lg(card, key + "-f", [(0, mid), (1, lo)], 0, 0, 0, 1)
    fs = lg(card, key + "-s", [(0, lo), (1, "#2A1A04")], 0, 0, 1, 0)
    w, h, d = 14, 7, 8
    if kind == 2:
        w, h = 12, 11
    front = poly([(-w / 2, 0), (w / 2, 0), (w / 2, -h), (-w / 2, -h)])
    top = poly([(-w / 2, -h), (w / 2, -h), (w / 2 + d * 0.6, -h - d * 0.5), (-w / 2 + d * 0.6, -h - d * 0.5)])
    side = poly([(w / 2, 0), (w / 2 + d * 0.6, -d * 0.5), (w / 2 + d * 0.6, -h - d * 0.5), (w / 2, -h)])
    out = [f'<ellipse cx="2" cy="1" rx="11" ry="3" fill="#000000" opacity="0.5" filter="{soft(card, 1.5)}"/>',
           f'<path d="{front}" fill="{ff}"/>', f'<path d="{side}" fill="{fs}"/>', f'<path d="{top}" fill="{ft}"/>']
    tcx, tcy = d * 0.3, -h - d * 0.25
    ink = "#4A3006"
    if kind == 0:
        sp = []
        for i in range(22):
            a = i * 0.62
            rr = 0.25 * i
            sp.append(f"{f(tcx + rr * math.cos(a))} {f(tcy + rr * math.sin(a) * 0.5)}")
        out.append(f'<path d="M{" L".join(sp)}" fill="none" stroke="{ink}" stroke-width="0.7"/>')
    elif kind == 1:
        out.append(f'<path d="M{f(tcx - 5)} {f(tcy)} L{f(tcx + 5)} {f(tcy)} M{f(tcx)} {f(tcy - 2.4)} L{f(tcx)} {f(tcy + 2.4)}" stroke="{ink}" stroke-width="0.8"/>')
        out.append("".join(f'<circle cx="{f(tcx + dx)}" cy="{f(tcy + dy)}" r="0.7" fill="{ink}"/>' for dx, dy in ((-3, -1.3), (3, -1.3), (-3, 1.3), (3, 1.3))))
    else:
        out.append(f'<path d="M{f(-w / 2 + 2)} {f(-h + 3)} L{f(w / 2 - 2)} {f(-h + 3)} M{f(-w / 2 + 2)} {f(-h + 6)} L{f(w / 2 - 2)} {f(-h + 6)}" stroke="{ink}" stroke-width="0.7" opacity="0.8"/>')
        out.append("".join(f'<circle cx="{f(tcx + dx)}" cy="{f(tcy)}" r="{f(r)}" fill="none" stroke="{ink}" stroke-width="0.6"/>' for dx, r in ((0, 1.2), (0, 2.6))))
    out.append(f'<path d="{top}" fill="none" stroke="#FFF8D6" stroke-width="0.4" opacity="0.8"/>')
    return grp("".join(out), x, y, s, rot)
