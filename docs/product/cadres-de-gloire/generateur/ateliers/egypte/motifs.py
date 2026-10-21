"""Égypte solaire - les motifs : disque ailé, Khépri, ankh, oudjat, lotus, papyrus, pyramides de Gizeh et de Méroé,
colonnes papyriformes, gorge, cartouches, sphinx, felouque, palmiers, sistre, Aton, barque solaire, étoiles sba."""

import math
import random

from kit import (
    W, H, f, pt, GOLD3, GOLD, GOLD_HI, GOLD_LO, GOLD_D, LAPIS, LAPIS_D, LAPIS_L, TURQ, TURQ_L, TURQ_D,
    CARN, CARN_L, CARN_D, SAND, SAND_M, SAND_D, bevel,
)


def _poly(pts, close=True):
    return "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + (" Z" if close else "")


def _tr(x, y, s, flip=False, rot=0):
    return f'transform="translate({f(x)} {f(y)}) rotate({rot}) scale({f(-s if flip else s)} {f(s)})"'


# ---------------------------------------------------------------- soleil et uræus

def sun_disk(card, name, cx, cy, r, core="#FFF6D0", mid="#FFB43A", edge=CARN, rim_metal=GOLD3, glow=0.75, glow_color="#FFB347"):
    hi, m, lo = rim_metal
    out = []
    if glow:
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 3)}" fill="{card.rgrad(name + "-gl", [(0, glow_color, glow), (0.35, glow_color, glow * 0.35), (1, glow_color, 0)])}"/>')
    g = card.rgrad(name + "-f", [(0, core, 1), (0.55, mid, 1), (1, edge, 1)], 0.42, 0.38, 0.7)
    rg = card.grad(name + "-r", [(0, hi), (0.4, m), (0.6, lo), (1, hi)], 0, 0, 1, 1)
    out.append(f'<g filter="{bevel(card, name + "-bv", 1.4, 3, sd=4, dy=3, sop=0.6)}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}" stroke="{rg}" stroke-width="{f(max(2, r * 0.07))}"/></g>')
    return "".join(out)


URAEUS = (
    "M0 0 C-7 -2 -9 -9 -4 -13 C-1 -15 1 -18 0 -22 C-6 -24 -9 -31 -7 -38 C-5 -45 1 -48 6 -46 "
    "C10 -44 11 -40 9 -37 C12 -32 12 -26 8 -21 C6 -18 4 -15 6 -10 C9 -5 6 1 0 0 Z"
)


def uraeus(card, x, y, s, fill, stroke, flip=False):
    """L'uræus : le cobra dressé qui garde le disque solaire."""
    return (
        f'<g {_tr(x, y, s, flip)}><path d="{URAEUS}" fill="{fill}" stroke="{stroke}" stroke-width="{f(1.4 / s)}"/>'
        f'<path d="M-4 -36 C-2 -31 -2 -26 0 -22" fill="none" stroke="{stroke}" stroke-width="{f(1 / s)}" opacity="0.8"/>'
        f'<circle cx="5" cy="-41" r="1.4" fill="{stroke}"/></g>'
    )


# ---------------------------------------------------------------- ailes

def _strip(x0, y0, length, h, bendf, side, cx):
    """Une plume primaire horizontale, extrémité arrondie, courbée par `bendf`."""
    pts = []
    n = 14
    r = h / 2
    for i in range(n + 1):
        u = i / n * (length - r)
        pts.append((u, y0))
    for i in range(1, 12):
        a = -math.pi / 2 + math.pi * i / 12
        pts.append((length - r + r * math.cos(a), y0 + r + r * math.sin(a)))
    for i in range(n, -1, -1):
        u = i / n * (length - r)
        pts.append((u, y0 + h))
    out = []
    for u, y in pts:
        out.append((cx + side * (x0 + u), y - bendf(x0 + u)))
    return out


def horizontal_wing(card, name, cx, cy, side, x_in, span, thick, cols=(LAPIS, TURQ, CARN, TURQ, LAPIS), metal=GOLD3,
                    bend=16, coverts=0.34, rows=None, sw=1.2):
    """L'aile du disque solaire : un rang de couvertures en écailles, puis des rémiges horizontales étagées."""
    hi, mid, lo = metal
    L = span - x_in
    n = len(cols)
    hc = thick * coverts
    hs = (thick - hc) / n
    top = cy - thick / 2

    def bendf(x):
        u = max(0.0, (x - x_in) / L)
        return bend * u ** 1.7

    out = []
    gold = card.grad(name + "-gd", [(0, hi), (0.5, mid), (1, lo)], 0, 0, 0, 1)
    for j in range(n - 1, -1, -1):
        frac = 1 - 0.5 * (j / max(1, n - 1)) ** 1.15
        length = L * frac + x_in * 0
        y0 = top + hc + j * hs
        pts = _strip(x_in, y0, length, hs * 1.12, bendf, side, cx)
        c = cols[j]
        out.append(f'<path d="{_poly(pts)}" fill="{c}" stroke="{gold}" stroke-width="{sw}" stroke-linejoin="round"/>')
        hl = _poly([(cx + side * (x_in + u), y0 + hs * 0.35 - bendf(x_in + u)) for u in [k * (length - hs) / 8 for k in range(9)]], close=False)
        out.append(f'<path d="{hl}" fill="none" stroke="#FFFFFF" stroke-width="0.8" opacity="0.28"/>')
        if rows:
            for k in range(1, rows):
                u0 = (length - hs) * k / rows
                x = cx + side * (x_in + u0)
                out.append(f'<line x1="{f(x)}" y1="{f(y0 + 1 - bendf(x_in + u0))}" x2="{f(x)}" y2="{f(y0 + hs - bendf(x_in + u0))}" stroke="{lo}" stroke-width="0.7" opacity="0.6"/>')
    cl = L * 0.64
    cpts = []
    for i in range(15):
        u = i / 14 * cl
        cpts.append((cx + side * (x_in + u), top - bendf(x_in + u)))
    k = 7
    for i in range(k, -1, -1):
        u = i / k * cl
        cpts.append((cx + side * (x_in + u), top + hc + 1 - bendf(x_in + u)))
    out.append(f'<path d="{_poly(cpts)}" fill="{gold}" stroke="{lo}" stroke-width="0.9"/>')
    scales = []
    for row in range(2):
        yy = top + hc * (0.3 + 0.42 * row)
        cnt = 12
        for i in range(cnt):
            u = (i + 0.5 * row + 0.3) / cnt * cl * 0.98
            x = cx + side * (x_in + u)
            yb = yy - bendf(x_in + u)
            rr = hc * 0.22
            scales.append(f'<path d="M{f(x - side * rr)} {f(yb - rr)} A{f(rr)} {f(rr)} 0 0 {1 if side > 0 else 0} {f(x - side * rr)} {f(yb + rr)}" fill="none" stroke="{lo}" stroke-width="0.9" opacity="0.8"/>')
            scales.append(f'<circle cx="{f(x - side * rr * 0.4)}" cy="{f(yb)}" r="{f(rr * 0.42)}" fill="{(TURQ, CARN, LAPIS)[(i + row) % 3]}" opacity="0.9"/>')
    out.append("".join(scales))
    return "".join(out)


def winged_disk(card, name, cx, cy, span, r, thick=None, cols=(LAPIS, TURQ, CARN, TURQ, LAPIS), metal=GOLD3, disk=True,
                uraei=True, bend=16, bv=True, rows=None):
    """Le disque solaire ailé (Behedety) : deux ailes étagées, deux uræus, le disque au centre."""
    thick = thick or r * 1.5
    x_in = r * 0.55
    wings = horizontal_wing(card, name + "-r", cx, cy, 1, x_in, span / 2, thick, cols, metal, bend, rows=rows)
    wings += horizontal_wing(card, name + "-l", cx, cy, -1, x_in, span / 2, thick, cols, metal, bend, rows=rows)
    filt = f' filter="{bevel(card, name + "-wbv", 0.9, 1.8, sd=4, dy=4, sop=0.55)}"' if bv else ""
    out = [f"<g{filt}>{wings}</g>"]
    if uraei:
        hi, mid, lo = metal
        ug = card.grad(name + "-ug", [(0, hi), (0.6, mid), (1, lo)], 0, 0, 0, 1)
        out.append(uraeus(card, cx - r * 0.98, cy + r * 0.98, r * 0.03 * 1.0 + 0.55, ug, lo, flip=True))
        out.append(uraeus(card, cx + r * 0.98, cy + r * 0.98, r * 0.03 * 1.0 + 0.55, ug, lo))
    if disk:
        out.append(sun_disk(card, name + "-sun", cx, cy, r, glow=0))
    return "".join(out)


def fan_wing(card, name, cx, cy, side, R, a0, a1, tiers, metal=GOLD3, taper=0.35, sw=1.0):
    """Aile déployée de pectoral : plumes rayonnant de l'épaule, trois rangs cloisonnés.

    `tiers` : [(r0, r1, nombre, couleurs)] en fractions de R, du rang extérieur au rang intérieur."""
    hi, mid, lo = metal
    gold = card.grad(name + "-fg", [(0, hi), (0.5, mid), (1, lo)], 0, 0, 1, 1)
    out = []
    for r0, r1, cnt, cols in tiers:
        da = (a1 - a0) / cnt
        for i in range(cnt):
            aa, ab = a0 + i * da, a0 + (i + 1) * da
            am = (aa + ab) / 2
            kf = 1 - taper * ((am - a0) / (a1 - a0))
            rr0, rr1 = r0 * R * (1 - taper * 0.5 * ((am - a0) / (a1 - a0))), r1 * R * kf
            p = []
            for t in range(5):
                a = aa + (ab - aa) * t / 4
                p.append(pt(cx, cy, rr0, side * a))
            tipw = (ab - aa) * 0.5
            for t in range(7):
                a = ab - (ab - aa) * t / 6
                bulge = math.sin(math.pi * t / 6) * rr1 * math.radians(tipw) * 0.9
                p.append(pt(cx, cy, rr1 + bulge, side * a))
            c = cols[i % len(cols)]
            out.append(f'<path d="{_poly(p)}" fill="{c}" stroke="{gold}" stroke-width="{sw}" stroke-linejoin="round"/>')
            mx, my = pt(cx, cy, (rr0 + rr1) / 2, side * am)
            x2, y2 = pt(cx, cy, rr1 * 0.96, side * am)
            out.append(f'<line x1="{f(mx)}" y1="{f(my)}" x2="{f(x2)}" y2="{f(y2)}" stroke="#FFFFFF" stroke-width="0.7" opacity="0.3"/>')
    return "".join(out)


def pectoral_wings(card, name, cx, cy, R, a0=62, a1=172, metal=GOLD3, bv=True,
                   tiers=None, sw=1.0):
    tiers = tiers or [
        (0.55, 1.0, 11, (LAPIS, TURQ)),
        (0.32, 0.62, 9, (TURQ, CARN)),
        (0.0, 0.38, 7, (GOLD, "#F6C452")),
    ]
    inner = fan_wing(card, name + "-r", cx, cy, 1, R, a0, a1, tiers, metal, sw=sw) + fan_wing(card, name + "-l", cx, cy, -1, R, a0, a1, tiers, metal, sw=sw)
    filt = f' filter="{bevel(card, name + "-bv", 0.9, 1.8, sd=4, dy=4, sop=0.55)}"' if bv else ""
    return f"<g{filt}>{inner}</g>"


# ---------------------------------------------------------------- Khépri

def scarab(card, name, cx, cy, s, shell=(LAPIS_L, LAPIS, LAPIS_D), metal=GOLD3, legs=True, hold_sun=False, sun_r=24, bv=True):
    """Khépri, le scarabée qui pousse le soleil levant (vu de dessus, tête en haut)."""
    hi, mid, lo = metal
    sg = card.rgrad(name + "-sh", [(0, shell[0], 1), (0.55, shell[1], 1), (1, shell[2], 1)], 0.38, 0.3, 0.8)
    gold = card.grad(name + "-g", [(0, hi), (0.5, mid), (1, lo)], 0, 0, 1, 1)
    w = 4.2
    out = []
    if legs:
        legs_d = [
            [(-22, -24), (-34, -38), (-30, -58), (-20, -70)],
            [(-30, 0), (-48, 4), (-54, 24)],
            [(-24, 34), (-40, 50), (-34, 72)],
        ]
        lg = []
        for leg in legs_d:
            for m in (1, -1):
                d = _poly([(x * m, y) for x, y in leg], close=False)
                lg.append(f'<path d="{d}" fill="none" stroke="{gold}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>')
                for (xa, ya), (xb, yb) in zip(leg[1:], leg[2:]):
                    mxx, myy = (xa + xb) / 2 * m, (ya + yb) / 2
                    lg.append(f'<path d="M{f(mxx)} {f(myy)} l{f(-3 * m)} {f(-2)}" stroke="{gold}" stroke-width="2" stroke-linecap="round"/>')
        out.append("".join(lg))
    if hold_sun:
        out.append(f'<circle cx="0" cy="{f(-70 - sun_r * 0.9)}" r="{f(sun_r)}" fill="{card.rgrad(name + "-sun", [(0, "#FFF2C0", 1), (0.6, "#FF9E3A", 1), (1, CARN, 1)])}" stroke="{gold}" stroke-width="2.4"/>')
    out.append(f'<path d="M-30 0 C-33 30 -18 60 0 64 C18 60 33 30 30 0 Z" fill="{sg}" stroke="{gold}" stroke-width="2.6"/>')
    out.append('<path d="M0 2 L0 62" stroke="%s" stroke-width="2.2"/>' % gold)
    for m in (1, -1):
        out.append(f'<path d="M{f(m * 6)} 8 C{f(m * 14)} 22 {f(m * 16)} 40 {f(m * 8)} 56" fill="none" stroke="#FFFFFF" stroke-width="1.6" opacity="0.28"/>')
    out.append(f'<path d="M-31 1 C-34 -14 -24 -29 0 -31 C24 -29 34 -14 31 1 Z" fill="{sg}" stroke="{gold}" stroke-width="2.6"/>')
    out.append(f'<path d="M-20 -6 C-20 -18 -10 -24 0 -25" fill="none" stroke="#FFFFFF" stroke-width="1.6" opacity="0.3"/>')
    teeth = " ".join(f"L{f(-12 + i * 4)} {f(-46 - (2 if i % 2 else 0))}" for i in range(7))
    out.append(f'<path d="M-16 -29 C-18 -36 -15 -44 -12 -46 {teeth} C15 -44 18 -36 16 -29 Z" fill="{sg}" stroke="{gold}" stroke-width="2.2" stroke-linejoin="round"/>')
    inner = "".join(out)
    filt = f' filter="{bevel(card, name + "-bv", 0.9, 1.8, sd=3, dy=3, sop=0.55)}"' if bv else ""
    return f'<g transform="translate({f(cx)} {f(cy)}) scale({f(s)})"{filt}>{inner}</g>'


def shen(card, name, cx, cy, r, metal=GOLD3, fill=CARN):
    """Le shen : l'anneau d'éternité, noué sur une barre."""
    hi, mid, lo = metal
    g = card.grad(name, [(0, hi), (0.5, mid), (1, lo)], 0, 0, 1, 1)
    return (
        f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{fill}" stroke="{g}" stroke-width="{f(r * 0.32)}"/>'
        f'<rect x="{f(cx - r * 1.1)}" y="{f(cy + r * 0.92)}" width="{f(r * 2.2)}" height="{f(r * 0.42)}" rx="{f(r * 0.12)}" fill="{g}"/>'
    )


# ---------------------------------------------------------------- symboles

def ankh(cx, cy, s, fill, stroke=None, sw=1.2, op=1):
    """L'ankh, la clé de vie (hauteur 100 * s)."""
    d = (
        "M0 -50 C-17 -50 -21 -30 -11 -17 L-27 -19 L-28 -5 L-6 -7 L-9 48 L9 48 L6 -7 L28 -5 L27 -19 L11 -17 C21 -30 17 -50 0 -50 Z "
        "M0 -41 C-9 -41 -11 -29 -3 -19 L3 -19 C11 -29 9 -41 0 -41 Z"
    )
    st = f' stroke="{stroke}" stroke-width="{f(sw / s)}"' if stroke else ""
    return f'<g {_tr(cx, cy, s)} opacity="{op}"><path d="{d}" fill="{fill}" fill-rule="evenodd"{st}/></g>'


def wedjat(cx, cy, s, color, iris=None, w=4.5, op=1, flip=False):
    """L'œil oudjat (l'œil d'Horus) : sourcil, amande, trait de fard, larme droite et spirale."""
    iris = iris or color
    sw = f(w)
    d_brow = "M-38 -27 C-20 -36 18 -36 46 -28 L52 -24 L46 -22 C18 -28 -18 -28 -38 -21 Z"
    d_eye = "M-36 0 C-20 -18 16 -20 34 -4 C16 8 -16 10 -36 0 Z"
    return (
        f'<g {_tr(cx, cy, s, flip)} opacity="{op}">'
        f'<path d="{d_brow}" fill="{color}"/>'
        f'<path d="{d_eye}" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linejoin="round"/>'
        f'<circle cx="0" cy="-4" r="9.5" fill="{iris}"/>'
        f'<path d="M34 -4 L64 -4" stroke="{color}" stroke-width="{sw}" stroke-linecap="round"/>'
        f'<path d="M-6 8 C-7 18 -8 28 -12 40 L-4 40 C-2 30 0 18 0 8 Z" fill="{color}"/>'
        f'<path d="M8 8 C14 22 24 30 34 34 C42 37 46 30 40 26 C36 23 31 27 34 31" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round"/>'
        f"</g>"
    )


def sba_star(cx, cy, r, color, op=1, dot=True, rot=0):
    """L'étoile égyptienne (sba) : cinq bras fins, un point au cœur - les plafonds des tombes."""
    pts = []
    for i in range(10):
        a = rot + i * 36
        rr = r if i % 2 == 0 else r * 0.24
        pts.append(pt(cx, cy, rr, a))
    out = f'<path d="{_poly(pts)}" fill="{color}" opacity="{op}"/>'
    if dot:
        out += f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.16)}" fill="#FFFFFF" opacity="{f(op * 0.8)}"/>'
    return out


def djed(cx, cy, s, fill, stroke=None):
    """Le djed : le pilier de la stabilité (hauteur 100 * s)."""
    bars = "".join(f'<rect x="-20" y="{-46 + i * 9}" width="40" height="5" rx="1.5"/>' for i in range(4))
    st = f' stroke="{stroke}" stroke-width="{f(1 / s)}"' if stroke else ""
    return (
        f'<g {_tr(cx, cy, s)} fill="{fill}"{st}>{bars}'
        f'<path d="M-9 -50 L9 -50 L9 -12 L11 44 L18 50 L-18 50 L-11 44 L-9 -12 Z"/>'
        f'</g>'
    )


def was_sceptre(cx, cy, s, fill):
    """Le sceptre ouas : la puissance (hauteur 100 * s)."""
    return (
        f'<g {_tr(cx, cy, s)} fill="{fill}">'
        f'<path d="M-2 -38 L2 -38 L3 44 L8 50 L4 52 L0 46 L-4 52 L-8 50 L-3 44 Z"/>'
        f'<path d="M-3 -36 C-6 -44 -4 -50 4 -52 L14 -50 L8 -46 L4 -46 C1 -44 2 -40 3 -36 Z"/></g>'
    )


def maat_feather(cx, cy, s, fill, vein="#FFFFFF"):
    """La plume de Maât : la justesse, l'ordre du monde (hauteur 100 * s)."""
    return (
        f'<g {_tr(cx, cy, s)}><path d="M0 50 C-2 20 -10 -10 -6 -36 C-4 -48 8 -54 12 -46 C16 -38 6 -36 8 -26 C10 -6 6 24 2 50 Z" fill="{fill}"/>'
        f'<path d="M1 48 C0 16 -2 -14 2 -40" fill="none" stroke="{vein}" stroke-width="1" opacity="0.5"/></g>'
    )


# ---------------------------------------------------------------- flore

def lotus_flower(card, name, cx, cy, s, petal=(LAPIS_L, "#9CC1FF", "#FFFFFF"), sepal=("#2F8F5B", "#7FD39A"), metal=GOLD3, edge=True, op=1):
    """Le lotus bleu (Nymphaea caerulea) de profil : la fleur d'où naît le soleil (hauteur ~70 * s)."""
    hi, mid, lo = metal
    pg = card.grad(name + "-p", [(0, petal[2]), (0.45, petal[1]), (1, petal[0])], 0, 0, 0, 1)
    sg = card.grad(name + "-s", [(0, sepal[1]), (1, sepal[0])], 0, 0, 0, 1)
    st = f' stroke="{mid}" stroke-width="{f(1.1 / s)}"' if edge else ""
    petals = []
    for ang, ln, wd in ((-58, 52, 10), (58, 52, 10), (-30, 64, 12), (30, 64, 12), (0, 72, 13)):
        petals.append(f'<path d="M0 0 C{-wd} {-ln * 0.4} {-wd * 0.6} {-ln * 0.85} 0 {-ln} C{wd * 0.6} {-ln * 0.85} {wd} {-ln * 0.4} 0 0 Z" transform="rotate({ang})" fill="{pg}"{st}/>')
    sep = [f'<path d="M0 2 C{-wd} {-ln * 0.35} {-wd * 0.5} {-ln * 0.8} 0 {-ln} C{wd * 0.5} {-ln * 0.8} {wd} {-ln * 0.35} 0 2 Z" transform="rotate({ang})" fill="{sg}"{st}/>'
           for ang, ln, wd in ((-44, 46, 9), (44, 46, 9), (-14, 40, 9), (14, 40, 9))]
    return f'<g {_tr(cx, cy, s)} opacity="{op}">{"".join(petals)}{"".join(sep)}<ellipse cx="0" cy="2" rx="9" ry="5" fill="{sg}"/></g>'


def lotus_bud(card, name, cx, cy, s, petal=(LAPIS_L, "#9CC1FF", "#FFFFFF"), sepal=("#2F8F5B", "#7FD39A"), metal=GOLD3, op=1):
    hi, mid, lo = metal
    pg = card.grad(name + "-bp", [(0, petal[2]), (0.5, petal[1]), (1, petal[0])], 0, 0, 0, 1)
    sg = card.grad(name + "-bs", [(0, sepal[1]), (1, sepal[0])], 0, 0, 0, 1)
    return (
        f'<g {_tr(cx, cy, s)} opacity="{op}"><path d="M0 0 C-12 -16 -8 -40 0 -54 C8 -40 12 -16 0 0 Z" fill="{pg}" stroke="{mid}" stroke-width="{f(1 / s)}"/>'
        f'<path d="M0 2 C-14 -10 -12 -30 -3 -40 C-4 -22 -2 -10 0 2 Z" fill="{sg}"/><path d="M0 2 C14 -10 12 -30 3 -40 C4 -22 2 -10 0 2 Z" fill="{sg}"/></g>'
    )


def papyrus_umbel(card, name, cx, cy, s, green=("#1F6B45", "#57B477", "#B7E8A6"), metal=GOLD3, op=1, edge=True):
    """L'ombelle du papyrus : un éventail de fines tiges, deux bractées à la base (hauteur ~60 * s)."""
    hi, mid, lo = metal
    gg = card.grad(name + "-u", [(0, green[2]), (0.5, green[1]), (1, green[0])], 0, 0, 0, 1)
    rays_ = "".join(
        f'<line x1="0" y1="-10" x2="{f(30 * math.sin(math.radians(a)))}" y2="{f(-10 - 46 * math.cos(math.radians(a)))}" stroke="{green[0]}" stroke-width="0.8" opacity="0.7"/>'
        for a in range(-36, 37, 8)
    )
    st = f' stroke="{mid}" stroke-width="{f(1.1 / s)}"' if edge else ""
    return (
        f'<g {_tr(cx, cy, s)} opacity="{op}"><path d="M0 -8 L-30 -48 C-24 -60 -10 -64 0 -64 C10 -64 24 -60 30 -48 Z" fill="{gg}"{st}/>{rays_}'
        f'<path d="M0 2 C-10 -4 -14 -12 -12 -20 C-6 -14 -2 -10 0 -8 C2 -10 6 -14 12 -20 C14 -12 10 -4 0 2 Z" fill="{green[0]}"{st}/></g>'
    )


def reed_clump(seed, x, base_y, h, n, color, spread=60, umbel=True, op=1, w=2.2):
    """Un massif de papyrus en silhouette (bord du Nil)."""
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        x0 = x + rnd.uniform(-spread / 2, spread / 2)
        lean = rnd.uniform(-0.35, 0.35)
        hh = h * rnd.uniform(0.6, 1.05)
        x1, y1 = x0 + lean * hh, base_y - hh
        out.append(f'<path d="M{f(x0)} {f(base_y)} Q{f(x0 + lean * hh * 0.3)} {f(base_y - hh * 0.6)} {f(x1)} {f(y1)}" fill="none" stroke="{color}" stroke-width="{f(w)}" stroke-linecap="round"/>')
        if umbel:
            r = hh * rnd.uniform(0.12, 0.17)
            a = math.degrees(math.atan2(lean, 1))
            out.append(f'<path d="M{f(x1)} {f(y1)} L{f(x1 - r)} {f(y1 - r * 1.3)} Q{f(x1)} {f(y1 - r * 1.75)} {f(x1 + r)} {f(y1 - r * 1.3)} Z" fill="{color}" transform="rotate({f(a)} {f(x1)} {f(y1)})"/>')
    return f'<g opacity="{op}">{"".join(out)}</g>'


def palm(x, base_y, h, lean, color, seed=1, fronds=11, op=1):
    """Un palmier dattier en silhouette : stipe annelé, couronne de palmes qui retombent."""
    rnd = random.Random(seed)
    tx, ty = x + lean * h, base_y - h
    out = [f'<path d="M{f(x - 4.5)} {f(base_y)} Q{f(x + lean * h * 0.25)} {f(base_y - h * 0.6)} {f(tx - 2)} {f(ty)} L{f(tx + 2)} {f(ty)} Q{f(x + lean * h * 0.25 + 4)} {f(base_y - h * 0.6)} {f(x + 4.5)} {f(base_y)} Z" fill="{color}"/>']
    for k in range(1, 12):
        t = k / 12
        px = x + (tx - x) * t + lean * h * 0.25 * 2 * t * (1 - t)
        py = base_y - h * t
        out.append(f'<path d="M{f(px - 4.6 + t * 2)} {f(py)} l{f(9.2 - t * 4)} -2" stroke="{color}" stroke-width="1.6" opacity="0.6"/>')
    for i in range(fronds):
        a = -165 + 330 * i / (fronds - 1) + rnd.uniform(-7, 7)
        ln = h * rnd.uniform(0.34, 0.48)
        if abs(a) > 120:
            ln *= 0.7
        sa, ca = math.sin(math.radians(a)), math.cos(math.radians(a))
        ex = tx + ln * sa * 0.92
        ey = ty - ln * ca * 0.7 + ln * 0.3
        mx = tx + ln * sa * 0.5
        my = ty - ln * ca * 0.5 - ln * 0.2
        out.append(f'<path d="M{f(tx)} {f(ty)} Q{f(mx)} {f(my)} {f(ex)} {f(ey)}" fill="none" stroke="{color}" stroke-width="{f(h * 0.016 + 1.2)}" stroke-linecap="round"/>')
        for k in range(2, 13):
            t = k / 13
            px = (1 - t) ** 2 * tx + 2 * (1 - t) * t * mx + t * t * ex
            py = (1 - t) ** 2 * ty + 2 * (1 - t) * t * my + t * t * ey
            ll = ln * 0.2 * (1 - t * 0.55)
            dx = ex - mx
            for sgn in (-1, 1):
                qx, qy = px + sgn * ll * 0.32 + dx * 0.03, py + ll * 0.95
                out.append(f'<line x1="{f(px)}" y1="{f(py)}" x2="{f(qx)}" y2="{f(qy)}" stroke="{color}" stroke-width="1.15" stroke-linecap="round"/>')
    out.append(f'<ellipse cx="{f(tx)}" cy="{f(ty + 3)}" rx="{f(h * 0.03 + 2)}" ry="{f(h * 0.025 + 2)}" fill="{color}"/>')
    return f'<g opacity="{op}">{"".join(out)}</g>'


# ---------------------------------------------------------------- architecture et paysages

def pyramid(cx, base_y, w, h, lit="#F2B860", dark="#5A2A14", ridge=0.12, cap=None, op=1):
    """Une pyramide de Gizeh : la face éclairée et la face d'ombre, l'arête légèrement décalée."""
    ax = cx
    rx = cx + w * ridge
    out = (
        f'<path d="M{f(cx - w / 2)} {f(base_y)} L{f(ax)} {f(base_y - h)} L{f(rx)} {f(base_y)} Z" fill="{lit}"/>'
        f'<path d="M{f(rx)} {f(base_y)} L{f(ax)} {f(base_y - h)} L{f(cx + w / 2)} {f(base_y)} Z" fill="{dark}"/>'
    )
    if cap:
        k = 0.12
        out += f'<path d="M{f(ax - w / 2 * k)} {f(base_y - h * (1 - k))} L{f(ax)} {f(base_y - h)} L{f(ax + w / 2 * k)} {f(base_y - h * (1 - k))} Z" fill="{cap}"/>'
    return f'<g opacity="{op}">{out}</g>'


def giza(x, base_y, s, lit="#F2B860", dark="#5A2A14", cap=None, flip=False, op=1):
    """Le plateau de Gizeh : Khéops, Khéphren (son revêtement au sommet), Mykérinos et les reines."""
    m = -1 if flip else 1
    parts = [
        pyramid(x + m * 150 * s, base_y, 70 * s, 44 * s, lit, dark),
        pyramid(x + m * 128 * s, base_y, 28 * s, 18 * s, lit, dark),
        pyramid(x + m * 98 * s, base_y - 2 * s, 150 * s, 96 * s, lit, dark, cap=cap),
        pyramid(x, base_y, 170 * s, 106 * s, lit, dark),
    ]
    return f'<g opacity="{op}">{"".join(parts)}</g>'


def meroe_pyramid(cx, base_y, w, h, lit="#E9A15C", dark="#4A1F10", chapel=True, truncated=False, op=1):
    """Pyramide nubienne de Méroé : pente raide (~70°), petite chapelle à pylône au pied."""
    top = base_y - h
    tw = w * 0.1 if truncated else 0
    out = [
        f'<path d="M{f(cx - w / 2)} {f(base_y)} L{f(cx - tw)} {f(top)} L{f(cx + w * 0.06)} {f(top)} L{f(cx + w * 0.06)} {f(base_y)} Z" fill="{lit}"/>',
        f'<path d="M{f(cx + w * 0.06)} {f(base_y)} L{f(cx + w * 0.06)} {f(top)} L{f(cx + tw)} {f(top)} L{f(cx + w / 2)} {f(base_y)} Z" fill="{dark}"/>',
    ]
    if not truncated:
        out[0] = f'<path d="M{f(cx - w / 2)} {f(base_y)} L{f(cx)} {f(top)} L{f(cx + w * 0.06)} {f(base_y)} Z" fill="{lit}"/>'
        out[1] = f'<path d="M{f(cx + w * 0.06)} {f(base_y)} L{f(cx)} {f(top)} L{f(cx + w / 2)} {f(base_y)} Z" fill="{dark}"/>'
    for k in range(1, 6):
        yy = base_y - h * k / 6
        half = w / 2 * (1 - k / 6)
        out.append(f'<line x1="{f(cx - half)}" y1="{f(yy)}" x2="{f(cx + half)}" y2="{f(yy)}" stroke="{dark}" stroke-width="0.6" opacity="0.35"/>')
    if chapel:
        cw, chh = w * 0.42, h * 0.16
        x0 = cx - cw / 2
        out.append(f'<path d="M{f(x0)} {f(base_y)} L{f(x0 + cw * 0.08)} {f(base_y - chh)} L{f(x0 + cw * 0.92)} {f(base_y - chh)} L{f(x0 + cw)} {f(base_y)} Z" fill="{lit}" stroke="{dark}" stroke-width="0.6"/>')
        out.append(f'<rect x="{f(cx - cw * 0.12)}" y="{f(base_y - chh * 0.62)}" width="{f(cw * 0.24)}" height="{f(chh * 0.62)}" fill="{dark}"/>')
    return f'<g opacity="{op}">{"".join(out)}</g>'


def meroe_field(seed, x0, x1, base_y, hmin, hmax, lit, dark, n=6, op=1):
    rnd = random.Random(seed)
    items = []
    for i in range(n):
        cx = x0 + (x1 - x0) * (i + rnd.uniform(0.15, 0.85)) / n
        h = rnd.uniform(hmin, hmax)
        items.append((h, cx))
    items.sort()
    out = [meroe_pyramid(cx, base_y + rnd.uniform(-2, 3), h * 0.58, h, lit, dark, chapel=h > hmin * 1.2, truncated=rnd.random() < 0.3) for h, cx in items]
    return f'<g opacity="{op}">{"".join(out)}</g>'


def obelisk(card, name, cx, base_y, w, h, stone=("#E8C590", "#B8864A", "#6E4520"), tip=GOLD3, glyphs=True):
    """Un obélisque : fût effilé, pyramidion d'électrum qui attrape le soleil."""
    hi, mid, lo = tip
    sg = card.grad(name + "-s", [(0, stone[0]), (0.5, stone[1]), (1, stone[2])], 0, 0, 1, 0)
    tg = card.grad(name + "-t", [(0, hi), (0.5, mid), (1, lo)], 0, 0, 1, 0)
    tw = w * 0.62
    pyr = w * 0.55
    out = [
        f'<path d="M{f(cx - w / 2)} {f(base_y)} L{f(cx - tw / 2)} {f(base_y - h)} L{f(cx + tw / 2)} {f(base_y - h)} L{f(cx + w / 2)} {f(base_y)} Z" fill="{sg}"/>',
        f'<path d="M{f(cx - tw / 2)} {f(base_y - h)} L{f(cx)} {f(base_y - h - pyr)} L{f(cx + tw / 2)} {f(base_y - h)} Z" fill="{tg}"/>',
    ]
    if glyphs:
        gy = base_y - h + 18
        for g in range(5):
            yy = gy + g * h * 0.16
            if yy > base_y - 20:
                break
            ww = tw * 0.5
            out.append(_mini_glyph(g, cx, yy, ww * 0.9, stone[2], 0.55))
    return "".join(out)


def _mini_glyph(i, x, y, s, color, op=1):
    """Glyphes minuscules et rares, pour graver un fût ou un cartouche (jamais un mur de texte)."""
    k = s / 20
    kinds = [
        f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(6 * k)}" fill="none" stroke="{color}" stroke-width="{f(1.6 * k)}"/><circle cx="{f(x)}" cy="{f(y)}" r="{f(1.6 * k)}" fill="{color}"/>',
        ankh(x, y, 0.2 * k, color),
        f'<path d="M{f(x - 9 * k)} {f(y)} l{f(3 * k)} {f(-3 * k)} l{f(3 * k)} {f(3 * k)} l{f(3 * k)} {f(-3 * k)} l{f(3 * k)} {f(3 * k)} l{f(3 * k)} {f(-3 * k)}" fill="none" stroke="{color}" stroke-width="{f(1.5 * k)}"/>',
        sba_star(x, y, 7 * k, color, dot=False),
        maat_feather(x, y, 0.16 * k, color, color),
        djed(x, y, 0.17 * k, color),
        f'<path d="M{f(x - 8 * k)} {f(y + 4 * k)} A{f(8 * k)} {f(8 * k)} 0 0 1 {f(x + 8 * k)} {f(y + 4 * k)} Z" fill="{color}"/>',
        was_sceptre(x, y, 0.17 * k, color),
    ]
    return f'<g opacity="{op}">{kinds[i % len(kinds)]}</g>'


def cartouche_v(card, name, cx, cy, w, h, glyphs, metal=GOLD3, fill="#1A0F06", ink=GOLD, bv=True):
    """Un cartouche vertical (l'ovale du nom royal, noué en bas) avec deux ou trois glyphes stylisés."""
    hi, mid, lo = metal
    g = card.grad(name + "-g", [(0, hi), (0.5, mid), (1, lo)], 0, 0, 1, 1)
    r = w / 2
    d = (f"M{f(cx - r)} {f(cy - h / 2 + r)} A{f(r)} {f(r)} 0 0 1 {f(cx + r)} {f(cy - h / 2 + r)} L{f(cx + r)} {f(cy + h / 2 - r)} "
         f"A{f(r)} {f(r)} 0 0 1 {f(cx - r)} {f(cy + h / 2 - r)} Z")
    filt = f' filter="{bevel(card, name + "-bv", 0.8, 1.6, sd=2, dy=2, sop=0.5)}"' if bv else ""
    out = [f'<g{filt}><path d="{d}" fill="{fill}" stroke="{g}" stroke-width="{f(max(2, w * 0.09))}"/>'
           f'<rect x="{f(cx - r * 1.05)}" y="{f(cy + h / 2 + 2)}" width="{f(r * 2.1)}" height="{f(max(3, w * 0.12))}" rx="1.5" fill="{g}"/></g>']
    n = len(glyphs)
    for i, gi in enumerate(glyphs):
        yy = cy - h / 2 + r * 0.9 + (h - r * 1.8) * (i + 0.5) / n
        out.append(_mini_glyph(gi, cx, yy, w * 0.62, ink))
    return "".join(out)


def papyrus_column(card, name, cx, y_top, y_bot, w, stone=("#F1D7A4", "#C99A58", "#7A5326"), paint=(LAPIS, TURQ, CARN, GOLD),
                   metal=GOLD3, capital="open", lit=True):
    """Colonne papyriforme : fût fasciculé, feuilles du pied, cinq liens peints, chapiteau en ombelle ouverte."""
    hi, mid, lo = metal
    sg = card.grad(name + "-s", [(0, stone[2]), (0.25, stone[1]), (0.45, stone[0]), (0.7, stone[1]), (1, stone[2])], 0, 0, 1, 0)
    cap_h = w * 1.25
    abacus_h = w * 0.26
    cap_top = y_top + abacus_h
    shaft_top = cap_top + cap_h
    out = []
    bw = w * 0.5
    out.append(f'<rect x="{f(cx - w * 0.6)}" y="{f(y_bot - w * 0.16)}" width="{f(w * 1.2)}" height="{f(w * 0.16)}" rx="{f(w * 0.06)}" fill="{sg}"/>')
    shaft = (f"M{f(cx - bw * 0.82)} {f(y_bot - w * 0.16)} C{f(cx - bw * 1.15)} {f(y_bot - w * 0.6)} {f(cx - bw)} {f(y_bot - w * 1.2)} {f(cx - bw)} {f(y_bot - w * 1.6)} "
             f"L{f(cx - bw * 0.86)} {f(shaft_top)} L{f(cx + bw * 0.86)} {f(shaft_top)} L{f(cx + bw)} {f(y_bot - w * 1.6)} "
             f"C{f(cx + bw)} {f(y_bot - w * 1.2)} {f(cx + bw * 1.15)} {f(y_bot - w * 0.6)} {f(cx + bw * 0.82)} {f(y_bot - w * 0.16)} Z")
    out.append(f'<path d="{shaft}" fill="{sg}"/>')
    for k in (-0.6, -0.2, 0.2, 0.6):
        out.append(f'<line x1="{f(cx + k * bw)}" y1="{f(shaft_top + 6)}" x2="{f(cx + k * bw * 1.05)}" y2="{f(y_bot - w * 0.5)}" stroke="{stone[2]}" stroke-width="1" opacity="0.45"/>')
    leaf_y = y_bot - w * 0.18
    for i in range(5):
        lx = cx - bw * 0.95 + i * bw * 0.475
        c = paint[i % len(paint)]
        out.append(f'<path d="M{f(lx - bw * 0.22)} {f(leaf_y)} L{f(lx)} {f(leaf_y - w * 0.85)} L{f(lx + bw * 0.22)} {f(leaf_y)} Z" fill="{c}" stroke="{lo}" stroke-width="0.6" opacity="0.92"/>')
    band_y = shaft_top + w * 0.05
    for i in range(5):
        c = paint[i % len(paint)]
        out.append(f'<rect x="{f(cx - bw * 0.88)}" y="{f(band_y + i * w * 0.1)}" width="{f(bw * 1.76)}" height="{f(w * 0.075)}" fill="{c}"/>')
    if capital == "open":
        cap = (f"M{f(cx - bw * 0.86)} {f(shaft_top)} C{f(cx - bw)} {f(shaft_top - cap_h * 0.5)} {f(cx - w * 1.1)} {f(cap_top + cap_h * 0.15)} {f(cx - w * 1.08)} {f(cap_top)} "
               f"L{f(cx + w * 1.08)} {f(cap_top)} C{f(cx + w * 1.1)} {f(cap_top + cap_h * 0.15)} {f(cx + bw)} {f(shaft_top - cap_h * 0.5)} {f(cx + bw * 0.86)} {f(shaft_top)} Z")
    else:
        cap = (f"M{f(cx - bw * 0.86)} {f(shaft_top)} C{f(cx - w * 0.95)} {f(shaft_top - cap_h * 0.45)} {f(cx - w * 0.5)} {f(cap_top + 2)} {f(cx - w * 0.3)} {f(cap_top)} "
               f"L{f(cx + w * 0.3)} {f(cap_top)} C{f(cx + w * 0.5)} {f(cap_top + 2)} {f(cx + w * 0.95)} {f(shaft_top - cap_h * 0.45)} {f(cx + bw * 0.86)} {f(shaft_top)} Z")
    out.append(f'<path d="{cap}" fill="{sg}"/>')
    cid = card.id(name + "-capc")
    card.def_once(name + "-capc", f'<clipPath id="{cid}"><path d="{cap}"/></clipPath>')
    leaves = []
    nl = 9
    for i in range(nl):
        t = (i + 0.5) / nl
        xt = cx - w * 1.08 + t * w * 2.16
        xb = cx - bw * 0.8 + t * bw * 1.6
        c = paint[i % 2] if i % 2 == 0 else stone[0]
        leaves.append(f'<path d="M{f(xb)} {f(shaft_top)} L{f(xt - w * 0.11)} {f(cap_top)} L{f(xt + w * 0.11)} {f(cap_top)} Z" fill="{c}" opacity="{0.85 if i % 2 == 0 else 0.35}"/>')
    for i in range(nl * 2):
        t = (i + 0.5) / (nl * 2)
        xt = cx - w * 1.08 + t * w * 2.16
        leaves.append(f'<line x1="{f(cx - bw * 0.8 + t * bw * 1.6)}" y1="{f(shaft_top)}" x2="{f(xt)}" y2="{f(cap_top + 1)}" stroke="{stone[2]}" stroke-width="0.5" opacity="0.5"/>')
    lower = card.grad(name + "-capsh", [(0, "#FFFFFF"), (0.6, "#000000")], 0, 0, 0, 1)
    out.append(f'<g clip-path="url(#{cid})">{"".join(leaves)}<rect x="{f(cx - w * 1.2)}" y="{f(cap_top)}" width="{f(w * 2.4)}" height="{f(cap_h)}" fill="{lower}" opacity="0.18" style="mix-blend-mode:multiply"/></g>')
    out.append(f'<rect x="{f(cx - w * 1.12)}" y="{f(cap_top - 3)}" width="{f(w * 2.24)}" height="5" rx="2" fill="{mid}"/>')
    out.append(f'<rect x="{f(cx - w * 0.55)}" y="{f(y_top)}" width="{f(w * 1.1)}" height="{f(abacus_h)}" fill="{sg}" stroke="{stone[2]}" stroke-width="0.6"/>')
    if lit:
        out.append(f'<rect x="{f(cx - bw)}" y="{f(shaft_top)}" width="{f(bw * 0.5)}" height="{f(y_bot - shaft_top - w * 0.6)}" fill="#FFFFFF" opacity="0.06"/>')
    return "".join(out)


def block_border(x0, y0, x1, y1, cell=12, cols=(LAPIS, GOLD, CARN, GOLD, TURQ, GOLD), sep="#120A04", vertical=False, op=1):
    """La bordure à damier des tombes : petits rectangles peints séparés d'un filet sombre."""
    out = [f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(x1 - x0)}" height="{f(y1 - y0)}" fill="{sep}"/>']
    if vertical:
        n = int((y1 - y0) / cell)
        for i in range(n):
            out.append(f'<rect x="{f(x0 + 1.4)}" y="{f(y0 + i * cell + 1.4)}" width="{f(x1 - x0 - 2.8)}" height="{f(cell - 2.8)}" fill="{cols[i % len(cols)]}"/>')
    else:
        n = int((x1 - x0) / cell)
        for i in range(n):
            out.append(f'<rect x="{f(x0 + i * cell + 1.4)}" y="{f(y0 + 1.4)}" width="{f(cell - 2.8)}" height="{f(y1 - y0 - 2.8)}" fill="{cols[i % len(cols)]}"/>')
    return f'<g opacity="{op}">{"".join(out)}</g>'


def lotus_frieze(card, name, x0, x1, y, s, petal=(LAPIS_L, "#9CC1FF", "#FFFFFF"), metal=GOLD3, stem="#2F8F5B", op=1):
    """La frise de lotus : fleurs et boutons alternés, liés par des tiges en arceaux."""
    hi, mid, lo = metal
    step = 34 * s
    n = int((x1 - x0) / step)
    out = []
    for i in range(n + 1):
        x = x0 + i * step
        if i < n:
            out.append(f'<path d="M{f(x)} {f(y)} Q{f(x + step / 2)} {f(y - 16 * s)} {f(x + step)} {f(y)}" fill="none" stroke="{mid}" stroke-width="{f(1.4 * s)}"/>')
        if i % 2 == 0:
            out.append(lotus_flower(card, name, x, y, 0.4 * s, petal, metal=metal))
        else:
            out.append(lotus_bud(card, name, x, y, 0.5 * s, petal, metal=metal))
    return f'<g opacity="{op}">{"".join(out)}</g>'


def zigzag_water(x0, x1, y, amp, step, color, rows=3, gap=8, w=1.6, op=1):
    """Le signe de l'eau (n) : des lignes brisées, les eaux primordiales du Noun."""
    out = []
    for r in range(rows):
        yy = y + r * gap
        pts = []
        x = x0
        up = True
        while x <= x1:
            pts.append((x, yy - (amp if up else 0)))
            x += step
            up = not up
        out.append(f'<path d="{_poly(pts, False)}" fill="none" stroke="{color}" stroke-width="{f(w)}" stroke-linejoin="round" opacity="{f(op * (1 - r * 0.18))}"/>')
    return "".join(out)


SPHINX = (
    "M0 0 L1 -12 C1 -30 12 -42 32 -45 C58 -48 96 -45 120 -49 C128 -51 134 -56 138 -64 "
    "L140 -76 C141 -92 152 -103 166 -104 C174 -104 178 -100 179 -94 L180 -89 L185 -84 L181 -81 L181 -77 "
    "L178 -74 L177 -69 C176 -65 173 -63 170 -60 L168 -48 C171 -40 172 -30 172 -20 L176 -14 "
    "C192 -14 214 -14 227 -10 C233 -8 233 -2 227 0 Z"
)
SPHINX_NEMES = "M140 -76 C141 -92 152 -103 166 -104 C170 -104 173 -103 175 -101 L168 -90 L166 -66 L160 -48 L150 -50 L138 -64 Z"
SPHINX_HAUNCH = "M14 -6 C10 -24 22 -36 40 -34 C54 -32 60 -20 58 -8"


def sphinx(x, base_y, s, color, flip=False, nemes=None, op=1):
    """Le sphinx couché, en contre-jour (longueur ~232 * s, hauteur ~104 * s)."""
    extra = ""
    if nemes:
        stripes = "".join(f'<path d="M{150 + i * 3} {-98 + i * 2} L{144 + i * 3} {-56 + i}" stroke="{nemes}" stroke-width="1" opacity="0.35"/>' for i in range(5))
        extra = (f'<path d="{SPHINX_NEMES}" fill="{nemes}" opacity="0.45"/>{stripes}'
                 f'<path d="{SPHINX_HAUNCH}" fill="none" stroke="{nemes}" stroke-width="1.6" opacity="0.4"/>'
                 f'<path d="M172 -20 L176 -14 C192 -14 214 -14 227 -10" fill="none" stroke="{nemes}" stroke-width="1.4" opacity="0.5"/>')
    tail = f'<path d="M4 -6 C-6 -2 -10 6 -4 8 C2 10 10 6 18 4" fill="none" stroke="{color}" stroke-width="3" stroke-linecap="round"/>'
    return f'<g {_tr(x, base_y, s, flip)} opacity="{op}"><path d="{SPHINX}" fill="{color}"/>{tail}{extra}</g>'


def felucca(x, y, s, color, sail=None, flip=False, op=1):
    """Une felouque du Nil : coque basse, grande voile latine sur une vergue inclinée."""
    sail = sail or color
    return (
        f'<g {_tr(x, y, s, flip)} opacity="{op}">'
        f'<path d="M-34 -4 Q-6 8 36 -6 L32 -2 Q0 10 -30 0 Z" fill="{color}"/>'
        f'<path d="M-32 -3 Q0 6 34 -5 L33 -3 Q0 8 -31 -1 Z" fill="{color}"/>'
        f'<line x1="2" y1="-4" x2="4" y2="-58" stroke="{color}" stroke-width="1.6"/>'
        f'<path d="M-26 -8 L30 -92 C22 -60 18 -30 18 -8 Z" fill="{sail}"/>'
        f'<line x1="-28" y1="-6" x2="32" y2="-95" stroke="{color}" stroke-width="1.6"/></g>'
    )


def ibis_flight(x, y, s, color, flip=False, op=1, phase=0):
    """Un ibis en vol, cou tendu, ailes en arc (silhouette lointaine)."""
    up = -6 if phase == 0 else 4
    return (
        f'<g {_tr(x, y, s, flip)} opacity="{op}">'
        f'<path d="M-14 0 C-6 -2 4 -2 10 0 C4 2 -6 2 -14 0 Z" fill="{color}"/>'
        f'<path d="M10 0 L18 -1 C22 0 25 3 26 7" fill="none" stroke="{color}" stroke-width="1.3" stroke-linecap="round"/>'
        f'<path d="M-14 0 L-20 1" stroke="{color}" stroke-width="1.6"/>'
        f'<path d="M-4 -1 C-8 {up - 6} -16 {up - 10} -22 {up - 8} C-14 {up - 4} -8 {up} -2 1 Z" fill="{color}"/>'
        f'<path d="M0 -1 C2 {up - 6} 8 {up - 10} 14 {up - 9} C8 {up - 4} 4 {up} 2 1 Z" fill="{color}"/></g>'
    )


# ---------------------------------------------------------------- objets sacrés

def sistrum(card, name, cx, cy, s, metal=GOLD3, handle=(TURQ, LAPIS), jingle="#FFF4C2"):
    """Le sistre (sesheshet) : un arceau, trois tiges, des disques qui tintent - la voix de la fête (hauteur ~200 * s)."""
    hi, mid, lo = metal
    g = card.grad(name + "-g", [(0, hi), (0.5, mid), (1, lo)], 0, 0, 1, 1)
    out = []
    out.append(f'<path d="M-30 -60 C-34 -110 -22 -150 0 -152 C22 -150 34 -110 30 -60" fill="none" stroke="{g}" stroke-width="9" stroke-linecap="round"/>')
    out.append(f'<path d="M-30 -60 C-34 -110 -22 -150 0 -152 C22 -150 34 -110 30 -60" fill="none" stroke="{hi}" stroke-width="1.6" opacity="0.6" transform="translate(-1.5 -1)"/>')
    for i, yy in enumerate((-118, -96, -74)):
        half = 28 - (2 if i == 0 else 0)
        out.append(f'<line x1="{-half - 6}" y1="{yy}" x2="{half + 6}" y2="{yy}" stroke="{g}" stroke-width="3.2" stroke-linecap="round"/>')
        for jx in (-14, 0, 14):
            out.append(f'<ellipse cx="{jx}" cy="{yy}" rx="3" ry="8" fill="{jingle}" stroke="{lo}" stroke-width="0.9"/>')
        out.append(f'<path d="M{-half - 10} {yy - 4} q-4 4 0 8 M{half + 10} {yy - 4} q4 4 0 8" fill="none" stroke="{g}" stroke-width="2"/>')
    out.append(f'<path d="M-36 -60 L36 -60 L30 -50 L-30 -50 Z" fill="{g}"/>')
    hg = card.grad(name + "-h", [(0, handle[0]), (1, handle[1])], 0, 0, 1, 0)
    out.append(f'<path d="M-9 -50 C-10 -30 -6 -10 -6 30 L-12 52 L12 52 L6 30 C6 -10 10 -30 9 -50 Z" fill="{hg}" stroke="{g}" stroke-width="2"/>')
    for k in range(4):
        out.append(f'<rect x="-9" y="{-44 + k * 7}" width="18" height="3.4" fill="{(CARN, hi, LAPIS, hi)[k]}"/>')
    out.append(f'<path d="M-30 -50 C-28 -40 -14 -36 -9 -40 M30 -50 C28 -40 14 -36 9 -40" fill="none" stroke="{g}" stroke-width="3"/>')
    out.append(f'<rect x="-14" y="50" width="28" height="7" rx="3" fill="{g}"/>')
    inner = "".join(out)
    return f'<g transform="translate({f(cx)} {f(cy)}) scale({f(s)})" filter="{bevel(card, name + "-bv", 0.8, 1.8, sd=3, dy=3, sop=0.55)}">{inner}</g>'


def hand(x, y, ang, s, color, holding=None):
    """Une petite main au bout d'un rayon d'Aton (orientée selon `ang`, degrés depuis midi)."""
    d = ("M-3 0 L3 0 L4 6 L4.6 12 C4.6 13 3.4 13 3.4 12 L3 8 L2.6 13.5 C2.6 14.5 1.4 14.5 1.4 13.5 L1.2 8.4 L0.6 14 "
         "C0.6 15 -0.6 15 -0.6 14 L-0.8 8.4 L-1.4 13.2 C-1.4 14.2 -2.6 14.2 -2.6 13.2 L-2.6 7.6 L-4.8 9.6 C-5.6 10.2 -6.4 9.4 -5.8 8.6 L-4 6 Z")
    out = f'<path d="{d}" fill="{color}"/>'
    if holding:
        out += f'<g transform="translate(0 22) rotate(180)">{ankh(0, 0, 0.16, holding)}</g>'
    return f'<g transform="translate({f(x)} {f(y)}) rotate({f(ang + 180)}) scale({f(s)})">{out}</g>'


def aten_rays(cx, cy, r0, lengths, angles, color, w=2.2, hands=True, hand_color=None, ankh_every=3, ankh_color=None, op=1):
    """Les rayons d'Aton : des traits qui descendent du disque et finissent en mains offrant la vie."""
    out = []
    for i, (a, ln) in enumerate(zip(angles, lengths)):
        x1, y1 = pt(cx, cy, r0, a)
        x2, y2 = pt(cx, cy, r0 + ln, a)
        out.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{color}" stroke-width="{w}" stroke-linecap="round"/>')
        if hands:
            hold = (ankh_color or color) if ankh_every and i % ankh_every == 1 else None
            out.append(hand(x2, y2, a, 1.5, hand_color or color, hold))
    return f'<g opacity="{op}">{"".join(out)}</g>'


def barque(card, name, cx, y, s, metal=GOLD3, hull=None, cabin=None, sun=True, sun_r=None, oars=True, bv=True, flip=False, line=None):
    """La barque solaire de Râ : coque en fuseau aux extrémités papyriformes, naos à baldaquin, rames-gouvernails.

    (cx, y) : le milieu du pont. Longueur ~260 * s."""
    hi, mid, lo = metal
    g = card.grad(name + "-g", [(0, hi), (0.45, mid), (1, lo)], 0, 0, 0, 1)
    hull = hull or g
    line = line or lo
    out = []
    hull_d = ("M-112 -2 C-80 14 70 14 110 -2 C120 -6 126 -16 128 -30 C131 -44 140 -52 150 -50 C142 -46 138 -36 138 -24 "
              "C136 -8 124 4 104 10 C60 24 -70 24 -110 10 C-126 4 -136 -10 -138 -26 C-139 -34 -136 -40 -130 -42 "
              "C-130 -30 -124 -12 -112 -2 Z")
    out.append(f'<path d="{hull_d}" fill="{hull}" stroke="{line}" stroke-width="1.4"/>')
    for k in range(-90, 100, 18):
        out.append(f'<line x1="{k}" y1="2" x2="{k + 2}" y2="14" stroke="{line}" stroke-width="1" opacity="0.6"/>')
    out.append(f'<path d="M-112 -2 C-80 10 70 10 110 -2" fill="none" stroke="{hi}" stroke-width="1.2" opacity="0.8"/>')
    out.append(f'<path d="M150 -50 L158 -64 C150 -66 144 -60 150 -50 Z M150 -50 L164 -54 C160 -60 152 -58 150 -50 Z M150 -50 L160 -44 C156 -40 150 -44 150 -50 Z" fill="{hull}" stroke="{line}" stroke-width="0.8"/>')
    out.append(f'<path d="M-130 -42 L-138 -56 C-130 -58 -124 -52 -130 -42 Z M-130 -42 L-144 -46 C-140 -52 -132 -50 -130 -42 Z" fill="{hull}" stroke="{line}" stroke-width="0.8"/>')
    cab = cabin or g
    out.append(f'<path d="M-30 4 L-30 -40 L30 -40 L30 4 Z" fill="{LAPIS_D}" stroke="{cab}" stroke-width="3"/>')
    out.append(f'<path d="M-38 -40 L38 -40 L34 -50 L-34 -50 Z" fill="{cab}"/>')
    for k in (-20, -8, 4, 16):
        out.append(f'<line x1="{k + 2}" y1="-48" x2="{k + 2}" y2="-42" stroke="{line}" stroke-width="1.6"/>')
    out.append(f'<path d="M-22 -36 L-22 0 M22 -36 L22 0" stroke="{cab}" stroke-width="2"/>')
    out.append(f'<g>{ankh(0, -18, 0.3, hi)}</g>')
    if oars:
        for k, off in enumerate((0, 12)):
            out.append(f'<line x1="{-98 + off}" y1="-36" x2="{-70 + off}" y2="26" stroke="{g}" stroke-width="3" stroke-linecap="round"/>')
            out.append(f'<path d="M{-74 + off} 16 L{-66 + off} 34 L{-74 + off} 36 L{-80 + off} 20 Z" fill="{g}"/>')
        out.append(f'<line x1="-104" y1="-4" x2="-90" y2="-44" stroke="{g}" stroke-width="2.4"/>')
        out.append(f'<line x1="-84" y1="-4" x2="-74" y2="-44" stroke="{g}" stroke-width="2.4"/>')
    if sun:
        sr = sun_r or 20
        out.append(f'<circle cx="0" cy="{f(-50 - sr)}" r="{f(sr)}" fill="{card.rgrad(name + "-sun", [(0, "#FFF6D0", 1), (0.55, "#FFB43A", 1), (1, CARN, 1)])}" stroke="{g}" stroke-width="2.4"/>')
    inner = "".join(out)
    filt = f' filter="{bevel(card, name + "-bv", 0.8, 1.6, sd=3, dy=3, sop=0.5)}"' if bv else ""
    return f'<g {_tr(cx, y, s, flip)}{filt}>{inner}</g>'


def broad_collar(card, name, cx, cy, r0, r1, a0=-90, a1=90, rows=None, metal=GOLD3, drops=True):
    """Le collier ousekh : rangs concentriques de perles cylindriques, pendeloques en gouttes au bord."""
    hi, mid, lo = metal
    rows = rows or [LAPIS, GOLD, TURQ, GOLD, CARN, GOLD]
    out = []
    n = len(rows)
    dr = (r1 - r0) / (n + (1.4 if drops else 0))
    for i, c in enumerate(rows):
        ra, rb = r0 + i * dr, r0 + (i + 1) * dr
        seg = max(8, int((a1 - a0) * (ra + rb) / 2 * math.pi / 180 / 7))
        for k in range(seg):
            aa = a0 + (a1 - a0) * k / seg
            ab = a0 + (a1 - a0) * (k + 0.82) / seg
            p = [pt(cx, cy, ra + 0.6, aa), pt(cx, cy, rb - 0.6, aa), pt(cx, cy, rb - 0.6, ab), pt(cx, cy, ra + 0.6, ab)]
            out.append(f'<path d="{_poly(p)}" fill="{c}"/>')
    if drops:
        ra = r0 + n * dr
        cnt = max(10, int((a1 - a0) * ra * math.pi / 180 / 10))
        for k in range(cnt):
            a = a0 + (a1 - a0) * (k + 0.5) / cnt
            x1, y1 = pt(cx, cy, ra, a)
            x2, y2 = pt(cx, cy, ra + dr * 1.4, a)
            xa, ya = pt(cx, cy, ra + dr * 0.9, a - 2.4)
            xb, yb = pt(cx, cy, ra + dr * 0.9, a + 2.4)
            c = (CARN, TURQ, LAPIS)[k % 3]
            out.append(f'<path d="M{f(x1)} {f(y1)} Q{f(xa)} {f(ya)} {f(x2)} {f(y2)} Q{f(xb)} {f(yb)} {f(x1)} {f(y1)} Z" fill="{c}" stroke="{mid}" stroke-width="0.8"/>')
    return f'<g filter="{bevel(card, name + "-bv", 0.6, 1.4, sd=3, dy=3, sop=0.5)}">{"".join(out)}</g>'
