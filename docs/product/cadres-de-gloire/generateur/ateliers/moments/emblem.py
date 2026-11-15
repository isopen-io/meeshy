"""Emblèmes partagés : la médaille gravée (nombre + couronne de texte), l'échantillonnage de courbes."""

import math

from base import f, esc, SANS, CINZEL
from kit import bevel, metal_grad, halo, ring_text, clip, ring_d, circle_d


def catmull(pts, n):
    """Échantillonne `n` points le long d'une courbe Catmull-Rom passant par `pts`."""
    segs = len(pts) - 1
    out = []
    for k in range(n):
        u = k / (n - 1) * segs
        i = min(int(u), segs - 1)
        t = u - i
        p0, p1, p2 = pts[max(0, i - 1)], pts[i], pts[i + 1]
        p3 = pts[min(len(pts) - 1, i + 2)]
        t2, t3 = t * t, t * t * t
        out.append(tuple(
            0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)
            for j in (0, 1)
        ))
    return out


def medal(card, cx, cy, r, number, words, metal, name="md", top="", inner="", band=16, glow=None, glow_op=0.5,
          disc=("#2A1408", "#120804", "#050201"), num_fill=None, ink=None, size=None, under="", top_fill=None):
    """Une médaille : bande de métal gravée d'une phrase qui fait le tour, disque où brille le nombre."""
    hi, mid, lo = metal
    out = []
    if glow:
        out.append(halo(card, cx, cy, r * 2.2, glow, glow_op, name + "-glow"))
    out.append(under)
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy + 6)}" r="{f(r)}" fill="#000000" opacity="0.5" filter="{card.blur(name + "-sh", 7)}"/>')
    ri = r - band
    dg = card.rgrad(name + "-disc", [(0, disc[0], 1), (0.7, disc[1], 1), (1, disc[2], 1)], 0.5, 0.38, 0.62)
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(ri)}" fill="{dg}"/>')
    if inner:
        out.append(f'<g clip-path="{clip(card, circle_d(cx, cy, ri), name + "-ic")}">{inner}</g>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(ri)}" fill="none" stroke="#000000" stroke-width="8" opacity="0.45" filter="{card.blur(name + "-is", 4)}"/>')
    g = metal_grad(card, name + "-band", metal)
    out.append(f'<g filter="{bevel(card, name + "-bv", 1.1, 2.6, sd=3, dy=2, sop=0.5)}"><path d="{ring_d(cx, cy, ri, r)}" fill-rule="evenodd" fill="{g}"/></g>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r - 2.2)}" fill="none" stroke="{lo}" stroke-width="0.7" opacity="0.7"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(ri + 2.2)}" fill="none" stroke="{lo}" stroke-width="0.7" opacity="0.7"/>')
    tr = ri + band / 2 - 3.1
    fs = min(8.6, band * 0.54)
    out.append(ring_text(card, name + "-tp", cx, cy + 0.7, tr, words, size=fs, fill=hi, weight=800, full=True, extra='opacity="0.55"'))
    out.append(ring_text(card, name + "-tp2", cx, cy, tr, words, size=fs, fill=ink or lo, weight=800, full=True))
    size = size or {1: 60, 2: 54, 3: 44, 4: 34}[len(str(number))]
    nf = num_fill or card.grad(name + "-num", [(0, "#FFFFFF"), (0.45, hi), (0.8, mid), (1, lo)], 0, 0, 0, 1)
    if top:
        out.append(f'<text x="{f(cx)}" y="{f(cy - ri * 0.42)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="7.5" letter-spacing="2.6" fill="{top_fill or hi}" opacity="0.9">{esc(top)}</text>')
    out.append(
        f'<g filter="{bevel(card, name + "-nbv", 0.9, 2.2, sd=2, dy=2, sop=0.8)}"><text x="{f(cx)}" y="{f(cy + size * 0.36)}" text-anchor="middle" '
        f'font-family="{CINZEL}" font-weight="700" font-size="{size}" fill="{nf}">{esc(str(number))}</text></g>'
    )
    card.add("".join(out))


def ruban_birds(card, mee, meo, y=770, size=100, dx=62):
    """Mee et Meo qui tiennent l'inscription par ses deux bouts (posés APRÈS elle, un peu plus petits que la mise en page « ruban »)."""
    from base import bird
    bird(card, mee, dx, y, size, rotate=-6)
    bird(card, meo, 540 - dx, y, size, flip=True, rotate=6)
