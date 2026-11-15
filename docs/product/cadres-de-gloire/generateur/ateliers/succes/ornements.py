"""Les ornements des hauts faits : l'étoile, la médaille étoilée et son ruban, la couronne de laurier, les confettis."""

import random

from base import f, pt, sparkle
from kit import bevel, halo, metal_grad, ring_d


def star_d(cx, cy, r, inner=0.46, rot=-90, points=5):
    pts = []
    for i in range(points * 2):
        rr = r if i % 2 == 0 else r * inner
        pts.append(pt(cx, cy, rr, rot + 180 * i / points))
    return "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + " Z"


def leaf_d(x, y, length, width, angle):
    """Une feuille de laurier : deux arcs qui se rejoignent, orientée selon `angle` (degrés)."""
    tip = pt(x, y, length, angle)
    mid = pt(x, y, length * 0.5, angle)
    left = pt(mid[0], mid[1], width, angle - 90)
    right = pt(mid[0], mid[1], width, angle + 90)
    return (
        f"M{f(x)} {f(y)} Q{f(left[0])} {f(left[1])} {f(tip[0])} {f(tip[1])} "
        f"Q{f(right[0])} {f(right[1])} {f(x)} {f(y)} Z"
    )


def laurel(card, cx, cy, r, metal, name="laurel", a0=150, a1=30, leaves=9, size=22, stem_w=2.4):
    """Deux branches de laurier en relief, de part et d'autre d'un centre, le long d'un arc du bas vers le haut."""
    hi, mid, lo = metal
    g = metal_grad(card, name + "-g", metal)
    out = []
    for side in (-1, 1):
        start = 90 + side * 10
        end = 90 + side * (90 + (a0 - 90 if side < 0 else 90 - a1))
        pts = [pt(cx, cy, r, start + (end - start) * k / 14) for k in range(15)]
        out.append(f'<path d="M{" L".join(f"{f(x)} {f(y)}" for x, y in pts)}" fill="none" stroke="{g}" stroke-width="{stem_w}" stroke-linecap="round"/>')
        for k in range(leaves):
            t = (k + 1) / (leaves + 1)
            a = start + (end - start) * t
            x, y = pt(cx, cy, r, a)
            tangent = a + side * 90
            grow = size * (0.7 + 0.5 * (1 - abs(t - 0.5) * 2) ** 0.5)
            for turn in (-38, 38):
                out.append(f'<path d="{leaf_d(x, y, grow, grow * 0.28, tangent + turn)}" fill="{g}" stroke="{lo}" stroke-width="0.5"/>')
    return f'<g filter="{bevel(card, name + "-bv", 0.9, 2.2, sd=2, dy=2, sop=0.55)}">{"".join(out)}</g>'


def ribbon(card, cx, top, y, w, metal, colors, name="rb"):
    """Le ruban d'une médaille : deux pans tombant du haut du cadre vers la médaille, liserés de métal."""
    hi, mid, lo = metal
    c1, c2 = colors
    g = card.grad(name + "-g", [(0, c1), (0.5, c2), (1, c1)], 0, 0, 1, 0)
    out = []
    for side in (-1, 1):
        x0 = cx + side * w * 0.22
        x1 = cx + side * w * 0.5
        d = f"M{f(x0)} {f(top)} L{f(x1)} {f(top)} L{f(cx + side * w * 0.16)} {f(y)} L{f(cx - side * w * 0.06)} {f(y)} Z"
        out.append(f'<path d="{d}" fill="{g}"/>')
        out.append(f'<path d="{d}" fill="none" stroke="{mid}" stroke-width="1.2" opacity="0.8"/>')
    return f'<g filter="{card.shadow(name + "-sh", 0, 4, 5, "#000000", 0.45)}">{"".join(out)}</g>'


def medal(card, cx, cy, r, metal, name="md", disc=("#2A1408", "#120804", "#050201"), glow=None, glow_op=0.45, star=True,
          star_fill=None, band=14, rays_n=0, rays_color=None):
    """Une médaille ronde : bande de métal en relief, disque sombre, étoile de métal au centre, rayons optionnels."""
    hi, mid, lo = metal
    out = []
    if glow:
        out.append(halo(card, cx, cy, r * 2.3, glow, glow_op, name + "-glow"))
    if rays_n:
        for i in range(rays_n):
            a = -90 + 360 * i / rays_n
            x1, y1 = pt(cx, cy, r + 6, a)
            x2, y2 = pt(cx, cy, r + (34 if i % 2 == 0 else 20), a)
            out.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{rays_color or hi}" stroke-width="2.4" stroke-linecap="round" opacity="0.85"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy + 6)}" r="{f(r)}" fill="#000000" opacity="0.5" filter="{card.blur(name + "-sh", 7)}"/>')
    ri = r - band
    dg = card.rgrad(name + "-disc", [(0, disc[0], 1), (0.7, disc[1], 1), (1, disc[2], 1)], 0.5, 0.38, 0.62)
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(ri)}" fill="{dg}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(ri)}" fill="none" stroke="#000000" stroke-width="8" opacity="0.45" filter="{card.blur(name + "-is", 4)}"/>')
    g = metal_grad(card, name + "-band", metal)
    out.append(f'<g filter="{bevel(card, name + "-bv", 1.1, 2.6, sd=3, dy=2, sop=0.5)}"><path d="{ring_d(cx, cy, ri, r)}" fill-rule="evenodd" fill="{g}"/></g>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r - 2.2)}" fill="none" stroke="{lo}" stroke-width="0.7" opacity="0.7"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(ri + 2.2)}" fill="none" stroke="{lo}" stroke-width="0.7" opacity="0.7"/>')
    if star:
        sg = star_fill or card.grad(name + "-star", [(0, "#FFFFFF"), (0.45, hi), (0.8, mid), (1, lo)], 0, 0, 0, 1)
        out.append(f'<g filter="{bevel(card, name + "-sbv", 0.9, 2.4, sd=2, dy=2, sop=0.7)}"><path d="{star_d(cx, cy + 2, ri * 0.72)}" fill="{sg}"/></g>')
        out.append(sparkle(cx - ri * 0.3, cy - ri * 0.34, 5, "#FFFFFF", 0.9))
    return "".join(out)


def confetti(seed, n, region, colors, avoid=None, size=(3, 7)):
    """Des confettis : petits rectangles tournés, semés hors de la zone `avoid`."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if avoid and avoid[0] < x < avoid[2] and avoid[1] < y < avoid[3]:
            continue
        w, h = rnd.uniform(*size), rnd.uniform(*size) * 0.55
        out.append(
            f'<rect x="{f(x - w / 2)}" y="{f(y - h / 2)}" width="{f(w)}" height="{f(h)}" rx="1" fill="{rnd.choice(colors)}" '
            f'opacity="{f(rnd.uniform(0.5, 0.95))}" transform="rotate({f(rnd.uniform(0, 180))} {f(x)} {f(y)})"/>'
        )
    return "".join(out)


def bow(card, cx, cy, s, color, dark, name="bow"):
    """Un nœud de ruban : deux boucles, deux pans, un cœur."""
    loop_l = f"M{f(cx)} {f(cy)} C{f(cx - s * 1.4)} {f(cy - s * 1.1)} {f(cx - s * 1.5)} {f(cy + s * 0.6)} {f(cx)} {f(cy)} Z"
    loop_r = f"M{f(cx)} {f(cy)} C{f(cx + s * 1.4)} {f(cy - s * 1.1)} {f(cx + s * 1.5)} {f(cy + s * 0.6)} {f(cx)} {f(cy)} Z"
    tail_l = f"M{f(cx)} {f(cy)} L{f(cx - s * 0.9)} {f(cy + s * 1.3)} L{f(cx - s * 0.55)} {f(cy + s * 1.1)} L{f(cx - s * 0.3)} {f(cy + s * 1.4)} Z"
    tail_r = f"M{f(cx)} {f(cy)} L{f(cx + s * 0.9)} {f(cy + s * 1.3)} L{f(cx + s * 0.55)} {f(cy + s * 1.1)} L{f(cx + s * 0.3)} {f(cy + s * 1.4)} Z"
    out = [f'<path d="{d}" fill="{color}" stroke="{dark}" stroke-width="1"/>' for d in (tail_l, tail_r, loop_l, loop_r)]
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(s * 0.3)}" fill="{dark}"/>')
    return f'<g filter="{card.shadow(name + "-sh", 0, 2, 3, "#000000", 0.4)}">{"".join(out)}</g>'

