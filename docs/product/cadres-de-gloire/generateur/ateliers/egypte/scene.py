"""Égypte solaire - la mise en scène : nuages, poussière d'or, faisceaux, finitions et enregistrement."""

import math
import random

from kit import (
    W, H, f, pt, OUT, SLUG, record, cloud_filter, bird, crest, deco_mask, light_grade, inner_shadow, rim, GOLD3,
)


def noise_layer(card, name, region, freq, octaves, seed, a, b, fill, op=1):
    """Une nappe (nuages, voiles, sable soulevé) : la couleur ne reste que là où le bruit est dense."""
    x0, y0, x1, y1 = region
    filt = cloud_filter(card, name + "-f", freq, octaves, seed, a, b)
    return f'<g filter="{filt}" opacity="{op}"><rect x="{f(x0)}" y="{f(y0)}" width="{f(x1 - x0)}" height="{f(y1 - y0)}" fill="{fill}"/></g>'


def dust(seed, n, region, color, op=0.6, rmax=1.6, keep=None, glow=False):
    """Poussière d'or en suspension (ou étoiles) ; `keep` : zone (x0, y0, x1, y1) à laisser vide."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if keep and keep[0] < x < keep[2] and keep[1] < y < keep[3]:
            continue
        r = rnd.uniform(0.3, rmax)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{color}" opacity="{f(rnd.uniform(0.25, 1) * op)}"/>')
    return "".join(out)


def beam(card, name, x0, y0, x1, y1, w0, w1, color, op=0.35, sd=6):
    """Un faisceau de lumière qui s'élargit de (x0, y0) vers (x1, y1)."""
    ang = math.atan2(y1 - y0, x1 - x0)
    nx, ny = -math.sin(ang), math.cos(ang)
    p = [(x0 + nx * w0 / 2, y0 + ny * w0 / 2), (x1 + nx * w1 / 2, y1 + ny * w1 / 2),
         (x1 - nx * w1 / 2, y1 - ny * w1 / 2), (x0 - nx * w0 / 2, y0 - ny * w0 / 2)]
    g = card.def_once(
        name,
        f'<linearGradient id="{card.id(name)}" gradientUnits="userSpaceOnUse" x1="{f(x0)}" y1="{f(y0)}" x2="{f(x1)}" y2="{f(y1)}">'
        f'<stop offset="0" stop-color="{color}" stop-opacity="{op}"/><stop offset="1" stop-color="{color}" stop-opacity="0"/></linearGradient>',
    )
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in p) + " Z"
    return f'<path d="{d}" fill="{g}" filter="{card.blur(name + "-b", sd)}"/>'


def sunburst(card, name, cx, cy, r0, r1, n, color, op=0.5, a0=0, a1=360, width=4.0, sd=1.2):
    """Rayons en éventail, alternés longs et courts, adoucis."""
    out = []
    for i in range(n):
        a = a0 + (a1 - a0) * (i + 0.5) / n
        rr = r1 if i % 2 == 0 else r1 * 0.72
        wa = width / max(r0, 1)
        x1, y1 = pt(cx, cy, r0, a - math.degrees(wa))
        x2, y2 = pt(cx, cy, r0, a + math.degrees(wa))
        x3, y3 = pt(cx, cy, rr, a)
        out.append(f'<path d="M{f(x1)} {f(y1)} L{f(x3)} {f(y3)} L{f(x2)} {f(y2)} Z" fill="{color}"/>')
    g = card.rgrad(name + "-fade", [(0, "#FFFFFF", 1), (0.7, "#FFFFFF", 0.5), (1, "#FFFFFF", 0)], 0.5, 0.5, 0.5)
    card.def_once(name + "-m", f'<mask id="{card.id(name + "-m")}" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}">'
                               f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r1)}" fill="{g}"/></mask>')
    return f'<g mask="url(#{card.id(name + "-m")})" opacity="{op}" filter="{card.blur(name + "-sb", sd)}">{"".join(out)}</g>'


def gem_backing(card, cx, cy, s=1.0, color="#0E0703", op=0.75):
    gy = cy + 96 * s
    return f'<rect x="{f(cx - 44 * s)}" y="{f(gy - 10 * s)}" width="{f(88 * s)}" height="{f(20 * s)}" rx="{f(10 * s)}" fill="{color}" opacity="{op}"/>'


def birds(card, spots):
    """[(pose, x, y, taille, miroir, rotation)]"""
    for pose, x, y, s, flip, rot in spots:
        bird(card, pose, x, y, s, flip=flip, rotate=rot)


def decorate(card, win, parts, name="dm"):
    """Pose la décoration pleine autour de la fenêtre photo (la fenêtre reste transparente)."""
    m = deco_mask(card, win, name)
    card.add(f'<g mask="{m}">{"".join(parts)}</g>')
    return m


def finish_window(card, win, grade="#FFB257", gx=0.5, gy=0.0, gop=0.3, metal=GOLD3, w=4.5, shadow=True):
    card.add(light_grade(card, win, grade, gx, gy, gop))
    if shadow:
        card.add(inner_shadow(card, win))
    card.add(rim(card, win, metal, w))


def save(card, name, rank, division, option, title, story, layout, message):
    card.save(OUT / f"{SLUG}-{name}.svg")
    record(f"{SLUG}-{name}.jpg", rank, division, option, title, story, layout, message)


def place(markup, x, y, s=1.0, rot=0, flip=False):
    return f'<g transform="translate({f(x)} {f(y)}) rotate({f(rot)}) scale({f(-s if flip else s)} {f(s)})">{markup}</g>'
