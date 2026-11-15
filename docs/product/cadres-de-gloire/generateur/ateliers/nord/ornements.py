"""Aurores du Nord - ornements ajoutés à la reprise : bossettes de Borre (anneau et losange entrelacés),
cadre tressé complet autour de la fenêtre. Créations originales."""

import math

from base import f, pt
from kit import bevel, metal_grad, OR
from motifs import plait


def borre_boss(card, cx, cy, r, metal=OR, gem="#3FE8A8", name="bb", edge="#2A1606"):
    """Une bossette de Borre : disque d'or, anneau et losange noués, gemme au cœur."""
    hi, mid, lo = metal
    mg = metal_grad(card, name + "-g", metal)
    disk = card.rgrad(name + "-d", [(0, hi, 1), (0.55, mid, 1), (1, lo, 1)], 0.38, 0.32, 0.75)
    s = r * 0.7
    ring = f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.56)}" fill="none"'
    loz = f'<path d="M{f(cx - s)} {f(cy)} L{f(cx)} {f(cy - s)} L{f(cx + s)} {f(cy)} L{f(cx)} {f(cy + s)} Z" fill="none"'
    knot = (f'{ring} stroke="{edge}" stroke-width="{f(r * 0.24)}"/>{ring} stroke="{mg}" stroke-width="{f(r * 0.13)}"/>'
            f'{loz} stroke="{edge}" stroke-width="{f(r * 0.24)}" stroke-linejoin="round"/>{loz} stroke="{mg}" stroke-width="{f(r * 0.13)}" stroke-linejoin="round"/>')
    over = []
    for a in (45, 225):
        x1, y1 = pt(cx, cy, r * 0.56, a - 14)
        x2, y2 = pt(cx, cy, r * 0.56, a + 14)
        over.append(f'<path d="M{f(x1)} {f(y1)} A{f(r * 0.56)} {f(r * 0.56)} 0 0 1 {f(x2)} {f(y2)}" fill="none" stroke="{edge}" stroke-width="{f(r * 0.24)}"/>'
                    f'<path d="M{f(x1)} {f(y1)} A{f(r * 0.56)} {f(r * 0.56)} 0 0 1 {f(x2)} {f(y2)}" fill="none" stroke="{mg}" stroke-width="{f(r * 0.13)}"/>')
    gem_g = card.rgrad(name + "-gm", [(0, "#FFFFFF", 1), (0.35, gem, 1), (1, "#06281C", 1)], 0.35, 0.3, 0.7)
    body = (f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{disk}" stroke="{edge}" stroke-width="1.4"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.88)}" fill="none" stroke="{hi}" stroke-width="0.7" opacity="0.7"/>'
            + knot + "".join(over)
            + f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.2)}" fill="{gem_g}" stroke="{edge}" stroke-width="0.8"/>')
    return f'<g filter="{bevel(card, name + "-bv", 0.9, 2.4, sd=3, dy=2.5, sop=0.6)}">{body}</g>'


def plait_frame(card, name, x0, y0, x1, y1, fill, amp=5.5, period=30, w=3.6, edge="#2A1606", sides="tlrb"):
    """Une tresse d'or qui fait le tour d'une fenêtre rectangulaire (côtés choisis)."""
    out = []
    if "t" in sides:
        out.append(plait(card, name + "t", x0, y0, x1, amp, period, w, fill, edge))
    if "b" in sides:
        out.append(plait(card, name + "b", x0, y1, x1, amp, period, w, fill, edge))
    if "l" in sides:
        out.append(plait(card, name + "l", y0, x0, y1, amp, period, w, fill, edge, vertical=True))
    if "r" in sides:
        out.append(plait(card, name + "r", y0, x1, y1, amp, period, w, fill, edge, vertical=True))
    return "".join(out)
