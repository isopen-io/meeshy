"""Atelier « Trésor » — l'ébénisterie et l'orfèvrerie : ébène, nacre, marqueterie, coffrets, couronnes."""

import math
import random

from kit import (
    W, H, f, pt, lg, rg, metal_lin, bevel, noise, soft, glint, halo, coin_use, signature_bars, grp, poly, clip,
    GOLD, GOLD_RICH, BRASS,
)
from objets import pearl, pearl_string, gem, cabochon, smooth, GEMS

EBONY = ("#6A4A36", "#2A1A12", "#0A0604")
ROSEWOOD = ("#B0603A", "#5E2414", "#1E0804")


def nacre_filter(card, name="nacre", freq="0.018 0.045", seed=7, octaves=3):
    """La nacre : un bruit doux projeté dans des pastels clairs (rose, menthe, lavande, crème), lustré."""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="{octaves}" seed="{seed}" result="n"/>'
        f'<feColorMatrix in="n" type="matrix" values="1.9 -0.5 0 0 -0.02  0 1.9 -0.6 0 0.0  -0.5 0 1.9 0 0.02  0 0 0 0 1" result="c"/>'
        f'<feComponentTransfer in="c" result="p"><feFuncR type="linear" slope="0.42" intercept="0.6"/>'
        f'<feFuncG type="linear" slope="0.42" intercept="0.58"/><feFuncB type="linear" slope="0.42" intercept="0.62"/></feComponentTransfer>'
        f'<feComposite in="p" in2="SourceAlpha" operator="in"/></filter>',
    )
    return f"url(#{card.id(name)})"


def nacre_fill(card, d, key="nc", seed=7, sheen=True):
    """Remplit `d` de nacre : fond irisé + lustre doux."""
    out = [f'<path d="{d}" fill="#F4EEF2"/>', f'<path d="{d}" fill="#FFFFFF" filter="{nacre_filter(card, key, seed=seed)}"/>']
    if sheen:
        sh = lg(card, key + "-sh", [(0, "#FFFFFF", 0.55), (0.45, "#FFFFFF", 0.05), (0.7, "#6E5A8A", 0.12), (1, "#FFFFFF", 0.3)], 0, 0, 1, 1)
        out.append(f'<path d="{d}" fill="{sh}"/>')
    return "".join(out)


def ebony_fill(card, d, key="eb", pal=EBONY, seed=4, vertical=False, cx=0.4, cy=0.3):
    hi, mid, lo = pal
    g = rg(card, key + "-g", [(0, hi), (0.5, mid), (1, lo)], cx, cy, 0.9)
    freq = "0.25 0.004" if vertical else "0.004 0.25"
    grain = noise(card, key + "-gr", freq, 3, seed, (0.85, 0.6, 0.42), 1.5, -0.62)
    return (f'<path d="{d}" fill="{g}"/>'
            f'<path d="{d}" fill="#000000" opacity="0.45" filter="{grain}"/>')


def lozenge(cx, cy, rx, ry):
    return f"M{f(cx)} {f(cy - ry)} L{f(cx + rx)} {f(cy)} L{f(cx)} {f(cy + ry)} L{f(cx - rx)} {f(cy)} Z"


def star8(cx, cy, r, k=0.42, rot=22.5):
    pts = []
    for i in range(16):
        rr = r if i % 2 == 0 else r * k
        pts.append(pt(cx, cy, rr, rot + i * 22.5))
    return poly(pts)


def rosette(card, cx, cy, r, key="ros", seed=3):
    """Rosace de marqueterie : étoile à huit branches en nacre, filet d'or, cœur d'ébène et petite gemme."""
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.06)}" fill="none" stroke="#E8B53C" stroke-width="{f(max(0.8, r * 0.05))}"/>']
    out.append(nacre_fill(card, star8(cx, cy, r, 0.5), key, seed))
    out.append(f'<path d="{star8(cx, cy, r, 0.5)}" fill="none" stroke="#C9A24A" stroke-width="{f(max(0.6, r * 0.03))}"/>')
    out.append(f'<path d="{star8(cx, cy, r * 0.5, 0.55, 0)}" fill="#1A0E08"/>')
    out.append(nacre_fill(card, star8(cx, cy, r * 0.36, 0.55, 0), key + "i", seed + 2, sheen=False))
    out.append(gem(cx, cy, r * 0.16, "rubis", 0, 8, 1.0, sparkle_=False))
    return "".join(out)


def marquetry_band(card, x0, y0, x1, y1, key="mq", horizontal=True, seed=5, step=18):
    """Une bande de marqueterie : losanges de nacre alternés, petits points d'or, filets."""
    out = []
    if horizontal:
        cy = (y0 + y1) / 2
        hh = (y1 - y0) / 2
        x = x0 + step / 2
        k = 0
        ds = []
        while x < x1:
            ds.append(lozenge(x, cy, step * 0.42, hh * 0.72))
            out.append(f'<circle cx="{f(x + step / 2)}" cy="{f(cy)}" r="{f(hh * 0.16)}" fill="#E8B53C"/>')
            x += step
            k += 1
        out.insert(0, nacre_fill(card, " ".join(ds), key, seed))
        out.append(f'<line x1="{f(x0)}" y1="{f(y0)}" x2="{f(x1)}" y2="{f(y0)}" stroke="#E8B53C" stroke-width="1.2"/>'
                   f'<line x1="{f(x0)}" y1="{f(y1)}" x2="{f(x1)}" y2="{f(y1)}" stroke="#E8B53C" stroke-width="1.2"/>')
    else:
        cx = (x0 + x1) / 2
        hw = (x1 - x0) / 2
        y = y0 + step / 2
        ds = []
        while y < y1:
            ds.append(lozenge(cx, y, hw * 0.72, step * 0.42))
            out.append(f'<circle cx="{f(cx)}" cy="{f(y + step / 2)}" r="{f(hw * 0.16)}" fill="#E8B53C"/>')
            y += step
        out.insert(0, nacre_fill(card, " ".join(ds), key, seed))
        out.append(f'<line x1="{f(x0)}" y1="{f(y0)}" x2="{f(x0)}" y2="{f(y1)}" stroke="#E8B53C" stroke-width="1.2"/>'
                   f'<line x1="{f(x1)}" y1="{f(y0)}" x2="{f(x1)}" y2="{f(y1)}" stroke="#E8B53C" stroke-width="1.2"/>')
    return "".join(out)


def quilted(card, d, key="qv", velvet=("#C23A5A", "#6E0F2A", "#22040E"), cell=16, cx=0.5, cy=0.4):
    """Un capitonnage de velours : losanges, boutons, ombre douce."""
    hi, mid, lo = velvet
    g = rg(card, key + "-g", [(0, hi), (0.55, mid), (1, lo)], cx, cy, 0.8)
    c = clip(card, d, key + "-c")
    lines = []
    for k in range(-40, 40):
        lines.append(f"M{k * cell} -10 l700 700 M{k * cell + 700} -10 l-700 700")
    out = [f'<path d="{d}" fill="{g}"/>', f'<g clip-path="{c}">']
    out.append(f'<path d="{" ".join(lines)}" stroke="{lo}" stroke-width="1.4" opacity="0.55" fill="none"/>')
    out.append(f'<path d="{" ".join(lines)}" stroke="{hi}" stroke-width="0.7" opacity="0.25" fill="none" transform="translate(1.2 0)"/>')
    out.append("</g>")
    return "".join(out)


# ---------------------------------------------------------------- le coffret


def coffret(card, cx, by, w=180, h=96, lid=110, depth=22, key="cft", m=GOLD, velvet=("#C23A5A", "#6E0F2A", "#22040E"),
            seed=3, mirror=True, fill_coins=True, pearls_over=True, rosewood=False):
    """Un coffret à bijoux ouvert, vu de face et un peu d'en haut : couvercle levé (velours capitonné et miroir),
    ouverture garnie de Meeshes, de perles et de gemmes, façade d'ébène marquetée de nacre, ferrures d'or."""
    hi, mid, lo = m
    x0, x1 = cx - w / 2, cx + w / 2
    top = by - h
    out = [f'<ellipse cx="{f(cx)}" cy="{f(by + 6)}" rx="{f(w * 0.56)}" ry="{f(10)}" fill="#000000" opacity="0.6" filter="{soft(card, 6)}"/>']
    wood = ROSEWOOD if rosewood else EBONY
    gm = metal_lin(card, key + "-gm", m, 0, 0, 1, 1)
    bv = bevel(card, key + "-bv", 0.8, 2.4, 1.0, 22, shadow=(0.6, 1.6, 1.2, 0.55))
    # couvercle levé
    ly0 = top - depth - lid
    lid_out = poly([(x0 + 6, top - depth + 2), (x1 - 6, top - depth + 2), (x1 - 14, ly0), (x0 + 14, ly0)])
    lid_in = poly([(x0 + 16, top - depth - 4), (x1 - 16, top - depth - 4), (x1 - 22, ly0 + 10), (x0 + 22, ly0 + 10)])
    out.append(ebony_fill(card, lid_out, key + "-lw", wood, seed + 1, cx=0.5, cy=0.1))
    out.append(quilted(card, lid_in, key + "-q", velvet))
    if mirror:
        my = (ly0 + top - depth) / 2
        mg = lg(card, key + "-mir", [(0, "#F8FBFF"), (0.35, "#A9B8CC"), (0.5, "#5C6B80"), (0.62, "#B8C6D8"), (1, "#E8EEF6")], 0, 0, 1, 1)
        out.append(f'<ellipse cx="{f(cx)}" cy="{f(my)}" rx="{f(w * 0.2 + 3)}" ry="{f(lid * 0.3 + 3)}" fill="{gm}" filter="{bv}"/>')
        out.append(f'<ellipse cx="{f(cx)}" cy="{f(my)}" rx="{f(w * 0.2)}" ry="{f(lid * 0.3)}" fill="{mg}"/>')
        out.append(f'<path d="M{f(cx - w * 0.12)} {f(my - lid * 0.14)} L{f(cx - w * 0.02)} {f(my - lid * 0.24)}" stroke="#FFFFFF" stroke-width="3" opacity="0.7" stroke-linecap="round"/>')
    out.append(f'<path d="{lid_out}" fill="none" stroke="{hi}" stroke-width="1" opacity="0.45"/>')
    # ouverture
    opening = poly([(x0, top), (x1, top), (x1 - 8, top - depth), (x0 + 8, top - depth)])
    ig = lg(card, key + "-in", [(0, velvet[2]), (1, velvet[1])])
    out.append(f'<path d="{opening}" fill="{ig}"/>')
    if fill_coins:
        rnd = random.Random(seed)
        items = []
        for _ in range(26):
            items.append((rnd.uniform(x0 + 14, x1 - 14), rnd.uniform(top - depth - 6, top + 2), rnd.uniform(7, 11), rnd.uniform(0.3, 0.55), rnd.uniform(-20, 20)))
        items.sort(key=lambda t: t[1])
        for x, y, r, t, a in items:
            out.append(coin_use(card, x, y, r, t, a))
        for k, kind in enumerate(("rubis", "emeraude", "saphir", "amethyste")):
            out.append(gem(x0 + w * (0.2 + 0.2 * k) + rnd.uniform(-6, 6), top - depth * 0.4 + rnd.uniform(-5, 3), 6.5, kind, rnd.uniform(0, 40), 8, 0.62, sparkle_=k % 2 == 0))
    # façade
    front = poly([(x0, top), (x1, top), (x1, by), (x0, by)])
    out.append(ebony_fill(card, front, key + "-fw", wood, seed, cx=0.35, cy=0.2))
    out.append(marquetry_band(card, x0 + 10, top + 8, x1 - 10, top + 20, key + "-mb1", True, seed, 14))
    out.append(marquetry_band(card, x0 + 10, by - 20, x1 - 10, by - 8, key + "-mb2", True, seed + 1, 14))
    out.append(rosette(card, cx, (top + by) / 2 + 1, min(h * 0.24, 26), key + "-rs", seed))
    for sx in (-1, 1):
        rx = cx + sx * w * 0.3
        out.append(nacre_fill(card, lozenge(rx, (top + by) / 2 + 1, 13, 17), key + "-lz", seed + 3, sheen=False))
        out.append(f'<path d="{lozenge(rx, (top + by) / 2 + 1, 13, 17)}" fill="none" stroke="{mid}" stroke-width="1"/>')
        out.append(f'<path d="{lozenge(rx, (top + by) / 2 + 1, 5, 7)}" fill="{mid}"/>')
    fit = []
    for sx in (-1, 1):
        ex = x0 if sx < 0 else x1
        fit.append(f'<path d="M{f(ex)} {f(top)} L{f(ex - sx * 22)} {f(top)} L{f(ex - sx * 22)} {f(top + 5)} L{f(ex - sx * 5)} {f(top + 5)} L{f(ex - sx * 5)} {f(top + 22)} L{f(ex)} {f(top + 22)} Z" fill="{gm}"/>')
        fit.append(f'<path d="M{f(ex)} {f(by)} L{f(ex - sx * 22)} {f(by)} L{f(ex - sx * 22)} {f(by - 5)} L{f(ex - sx * 5)} {f(by - 5)} L{f(ex - sx * 5)} {f(by - 22)} L{f(ex)} {f(by - 22)} Z" fill="{gm}"/>')
        fit.append(f'<ellipse cx="{f(ex - sx * 8)}" cy="{f(by + 5)}" rx="9" ry="6" fill="{gm}"/>')
    fit.append(f'<path d="M{f(cx - 11)} {f(top - 1)} L{f(cx + 11)} {f(top - 1)} L{f(cx + 9)} {f(top + 20)} Q{f(cx)} {f(top + 27)} {f(cx - 9)} {f(top + 20)} Z" fill="{gm}"/>')
    out.append(f'<g filter="{bv}">{"".join(fit)}</g>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(top + 9)}" r="2.6" fill="#1A0E06"/><path d="M{f(cx - 1.4)} {f(top + 10)} L{f(cx + 1.4)} {f(top + 10)} L{f(cx + 2)} {f(top + 17)} L{f(cx - 2)} {f(top + 17)} Z" fill="#1A0E06"/>')
    out.append(f'<line x1="{f(x0)}" y1="{f(top + 0.6)}" x2="{f(x1)}" y2="{f(top + 0.6)}" stroke="#FFFFFF" stroke-width="1" opacity="0.4"/>')
    if pearls_over:
        out.append(pearl_string(card, smooth([(x0 + w * 0.18, top - 4), (x0 + w * 0.26, top + h * 0.5), (x0 + w * 0.12, by + 14), (x0 - 8, by + 24)]), 3.3))
        out.append(pearl_string(card, smooth([(x1 - w * 0.3, top - 6), (x1 - w * 0.18, top + h * 0.45), (x1 - w * 0.28, top + h * 0.9)]), 2.8, tint="#FFEFF4"))
    return "".join(out)


# ---------------------------------------------------------------- couronne, calice


def crown(card, x, y, s=1.0, key="cr", m=GOLD_RICH, rot=0.0, gems=("rubis", "emeraude", "saphir"), center_coin=True):
    """Une couronne ouverte : bandeau orné de cabochons, cinq fleurons perlés, la Meesh au fleuron central."""
    hi, mid, lo = m
    gm = metal_lin(card, key + "-gm", m, 0, 0, 1, 1)
    gb = lg(card, key + "-gb", [(0, lo), (0.5, mid), (1, lo)], 0, 0, 1, 0)
    bv = bevel(card, key + "-bv", 1.0, 3.0, 1.0, 22, shadow=(0, 3, 2.5, 0.55))
    back = "M-58 -4 Q0 -18 58 -4 L58 4 Q0 -10 -58 4 Z"
    peaks = ("M-62 2 L-70 -40 Q-62 -24 -52 -22 Q-38 -26 -34 -58 Q-30 -32 -17 -30 Q-4 -34 0 -78 Q4 -34 17 -30 "
             "Q30 -32 34 -58 Q38 -26 52 -22 Q62 -24 70 -40 L62 2 Q0 16 -62 2 Z")
    band = "M-62 -2 Q0 14 62 -2 L62 22 Q0 38 -62 22 Z"
    out = [f'<ellipse cx="0" cy="34" rx="70" ry="10" fill="#000000" opacity="0.5" filter="{soft(card, 6)}"/>']
    out.append(f'<path d="{back}" fill="{gb}"/>')
    inner = rg(card, key + "-in", [(0, "#8E1236"), (1, "#2C0410")], 0.5, 0.8, 0.7)
    out.append(f'<path d="M-56 -2 Q0 -16 56 -2 L50 -34 Q0 -56 -50 -34 Z" fill="{inner}" opacity="0.9"/>')
    out.append(f'<g filter="{bv}"><path d="{peaks}" fill="{gm}"/><path d="{band}" fill="{gm}"/></g>')
    out.append(f'<path d="M-62 2 Q0 18 62 2" fill="none" stroke="{lo}" stroke-width="1.2" opacity="0.7"/>')
    out.append(f'<path d="M-62 19 Q0 35 62 19" fill="none" stroke="{lo}" stroke-width="1.2" opacity="0.7"/>')
    for i, gx in enumerate((-40, -14, 14, 40)):
        gy = 10 + 6 * (1 - (gx / 62) ** 2) + 2
        out.append(cabochon(card, gx, gy, 6.5, 5.2, gems[i % len(gems)], m))
    for px, py in ((-70, -40), (-34, -58), (34, -58), (70, -40)):
        out.append(pearl(card, px, py - 5, 5.2))
    for gx in (-27, 0, 27):
        gy = 10 + 6 * (1 - (gx / 62) ** 2) + 2
        out.append(pearl(card, gx, gy, 2.6))
    if center_coin:
        out.append(coin_use(card, 0, -90, 12.5, 1.0, 0, m, key + "-cc"))
    else:
        out.append(gem(0, -86, 9, "rubis", 0, 8, 1.0))
    out.append(f'<path d="M-50 -1 Q-20 8 -4 9" stroke="#FFFFFF" stroke-width="1.6" fill="none" opacity="0.5" stroke-linecap="round"/>')
    return grp("".join(out), x, y, s, rot)


def chalice(card, x, y, s=1.0, key="chal", m=GOLD_RICH, rot=0.0):
    """Un calice d'or serti, débordant de perles."""
    hi, mid, lo = m
    gm = lg(card, key + "-g", [(0, lo), (0.2, mid), (0.42, hi), (0.5, "#FFFFFF"), (0.6, hi), (0.85, mid), (1, lo)], 0, 0, 1, 0)
    bv = bevel(card, key + "-bv", 1.0, 2.6, 0.9, 20, shadow=(0, 3, 2.5, 0.55))
    cup = "M-34 -60 Q-36 -18 -8 -4 L-5 18 Q-24 26 -26 36 L26 36 Q24 26 5 18 L8 -4 Q36 -18 34 -60 Z"
    out = [f'<ellipse cx="0" cy="38" rx="34" ry="7" fill="#000000" opacity="0.5" filter="{soft(card, 4)}"/>']
    out.append(f'<g filter="{bv}"><path d="{cup}" fill="{gm}"/><ellipse cx="0" cy="-60" rx="34" ry="8" fill="{gm}"/></g>')
    out.append(f'<ellipse cx="0" cy="-60" rx="30" ry="6" fill="#3A1A04"/>')
    for k in range(9):
        out.append(pearl(card, -24 + k * 6, -62 - (4 if k % 2 else 0), 3.4))
    out.append(cabochon(card, 0, -34, 6, 7, "emeraude", m))
    out.append(cabochon(card, -18, -40, 3.6, 4.2, "rubis", m))
    out.append(cabochon(card, 18, -40, 3.6, 4.2, "saphir", m))
    out.append(f'<ellipse cx="0" cy="6" rx="8" ry="3.4" fill="{gm}" stroke="{lo}" stroke-width="0.6"/>')
    return grp("".join(out), x, y, s, rot)


def gem_bezel(card, d_points, kinds=("rubis", "emeraude", "saphir", "amethyste"), r=5.0, m=GOLD):
    """Une rangée de cabochons sertis le long d'une suite de points."""
    return "".join(cabochon(card, x, y, r, r * 0.82, kinds[i % len(kinds)], m) for i, (x, y) in enumerate(d_points))
