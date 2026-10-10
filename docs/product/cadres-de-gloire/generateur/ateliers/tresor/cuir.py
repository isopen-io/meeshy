"""Atelier « Trésor » — le cuir : repoussé, piqûres, ceinture, escarcelle à fermoir."""

import math
import random

from kit import (
    W, H, f, pt, lg, rg, metal_lin, cyl_grad, bevel, noise, soft, glint, halo, coin_use, signature_bars, grp,
    GOLD, GOLD_RICH, BRASS,
)
from objets import LEATHER, leather_fill, cord, tassel, rivet, smooth, segs_d, chain, wax_seal


def tool(d, pal, w=2.0, op=1.0, fill=False):
    """Un trait repoussé : sillon sombre, lèvre claire, fond du sillon."""
    hi, mid, lo = pal
    if fill:
        return (f'<g opacity="{f(op)}"><path d="{d}" fill="{lo}" opacity="0.75" transform="translate(0.9 1.2)"/>'
                f'<path d="{d}" fill="{hi}" opacity="0.4" transform="translate(-0.7 -0.8)"/>'
                f'<path d="{d}" fill="{mid}"/></g>')
    return (f'<g opacity="{f(op)}" fill="none" stroke-linecap="round" stroke-linejoin="round">'
            f'<path d="{d}" stroke="{lo}" stroke-width="{f(w * 1.15)}" opacity="0.8" transform="translate(0.8 1.1)"/>'
            f'<path d="{d}" stroke="{hi}" stroke-width="{f(w * 0.8)}" opacity="0.45" transform="translate(-0.6 -0.7)"/>'
            f'<path d="{d}" stroke="{mid}" stroke-width="{f(w * 0.75)}"/></g>')


def stitch(d, color="#F4D9A0", w=1.5, dash="5 3.6", op=0.85):
    return (f'<path d="{d}" fill="none" stroke="#000000" stroke-width="{f(w + 0.6)}" stroke-dasharray="{dash}" opacity="{f(op * 0.55)}" transform="translate(0.6 1)"/>'
            f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(w)}" stroke-dasharray="{dash}" stroke-linecap="round" opacity="{f(op)}"/>')


def scroll_vine(x0, y0, x1, y1, amp=10, n=4):
    """Un rinceau : une tige ondulante et des volutes alternées (pour le repoussé)."""
    out = []
    L = math.hypot(x1 - x0, y1 - y0)
    ang = math.atan2(y1 - y0, x1 - x0)
    ux, uy = math.cos(ang), math.sin(ang)
    nx, ny = -uy, ux
    pts = []
    steps = 40
    for k in range(steps + 1):
        t = k / steps
        s = math.sin(t * math.pi * n) * amp
        pts.append((x0 + ux * L * t + nx * s, y0 + uy * L * t + ny * s))
    out.append("M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts))
    for i in range(n):
        t = (i + 0.5) / n
        side = 1 if i % 2 == 0 else -1
        bx = x0 + ux * L * t + nx * amp * side
        by = y0 + uy * L * t + ny * amp * side
        r = amp * 0.9
        cx, cy = bx + nx * side * r * 0.9, by + ny * side * r * 0.9
        spiral = []
        for k in range(26):
            a = k / 25 * 1.7 * math.pi
            rr = r * (1 - k / 32)
            spiral.append((cx + rr * math.cos(a + ang), cy + rr * math.sin(a + ang) * side))
        out.append("M" + f"{f(bx)} {f(by)} L" + " L".join(f"{f(x)} {f(y)}" for x, y in spiral))
    return " ".join(out)


def leather_panel(card, key, d, pal, seed=3, cx=0.4, cy=0.3, mottle=0.35):
    """Un champ de cuir (fond de cadre) : dégradé, grain, marbrure."""
    return leather_fill(card, key, d, pal, cx, cy, True, mottle, seed)


# ---------------------------------------------------------------- la ceinture


def belt(card, x0, x1, y, h=40, pal=LEATHER["brun"], key="belt", m=BRASS, holes=True, seed=8):
    """Une ceinture de cuir repoussé : tranches, piqûres, losanges repoussés, œillets de laiton."""
    hi, mid, lo = pal
    top, bot = y - h / 2, y + h / 2
    d = f"M{f(x0)} {f(top)} L{f(x1)} {f(top)} L{f(x1)} {f(bot)} L{f(x0)} {f(bot)} Z"
    out = [f'<rect x="{f(x0)}" y="{f(bot - 2)}" width="{f(x1 - x0)}" height="10" fill="#000000" opacity="0.55" filter="{soft(card, 5)}"/>']
    out.append(leather_fill(card, key, d, pal, 0.5, 0.2, True, 0.4, seed))
    sh = lg(card, key + "-sh", [(0, "#FFFFFF", 0.22), (0.18, "#FFFFFF", 0), (0.8, "#000000", 0), (1, "#000000", 0.45)])
    out.append(f'<path d="{d}" fill="{sh}"/>')
    out.append(f'<line x1="{f(x0)}" y1="{f(top + 0.8)}" x2="{f(x1)}" y2="{f(top + 0.8)}" stroke="{hi}" stroke-width="1.2" opacity="0.6"/>')
    out.append(stitch(f"M{f(x0)} {f(top + 5)} L{f(x1)} {f(top + 5)}", "#E9C98A", 1.3))
    out.append(stitch(f"M{f(x0)} {f(bot - 5)} L{f(x1)} {f(bot - 5)}", "#E9C98A", 1.3))
    lz = []
    step = h * 0.9
    x = x0 + step / 2
    while x < x1:
        lz.append(f"M{f(x - step * 0.36)} {f(y)} L{f(x)} {f(y - h * 0.22)} L{f(x + step * 0.36)} {f(y)} L{f(x)} {f(y + h * 0.22)} Z")
        x += step
    out.append(tool(" ".join(lz), pal, 1.4, 0.9))
    if holes:
        x = x0 + step
        while x < x1 - step / 2:
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="2.2" fill="#140804"/>')
            x += step * 2
    return "".join(out)


def keeper(card, x, y, h=48, w=16, m=BRASS, key="kp"):
    """Un passant de laiton qui serre la ceinture."""
    g = metal_lin(card, key, m, 0, 0, 1, 0)
    bv = bevel(card, key + "-bv", 0.9, 2.4, 0.9, 18, shadow=(1, 2, 2, 0.6))
    return (f'<g filter="{bv}"><rect x="{f(x - w / 2)}" y="{f(y - h / 2)}" width="{f(w)}" height="{f(h)}" rx="3" fill="{g}"/>'
            f'<line x1="{f(x)}" y1="{f(y - h / 2 + 4)}" x2="{f(x)}" y2="{f(y + h / 2 - 4)}" stroke="{m[2]}" stroke-width="1" opacity="0.6"/></g>')


# ---------------------------------------------------------------- l'escarcelle


def escarcelle(card, x, y, s=1.0, pal=LEATHER["brun"], flap_pal=None, key="esc", m=BRASS, rot=0.0, seal=None, coins=False, seed=11, flip=False):
    """L'escarcelle de ceinture : fermoir de laiton gravé à anneau, sac de cuir, rabat repoussé, rivets, fermail
    à la Signature ; un sceau de cire pend au fermail. Origine 0,0 = milieu du fermoir ; ~150 x 220."""
    hi, mid, lo = pal
    fp = flap_pal or pal
    fh, fm, fl = fp
    out = []
    body = "M-66 -50 C-74 0 -78 70 -52 104 Q0 134 52 104 C78 70 74 0 66 -50 Z"
    flap = "M-70 -54 L70 -54 C72 -24 70 -2 64 10 Q36 40 0 48 Q-36 40 -64 10 C-70 -2 -72 -24 -70 -54 Z"
    flap_in = "M-61 -46 L61 -46 C62 -22 61 -4 56 6 Q32 32 0 39 Q-32 32 -56 6 C-61 -4 -62 -22 -61 -46 Z"
    out.append(f'<ellipse cx="0" cy="128" rx="70" ry="12" fill="#000000" opacity="0.5" filter="{soft(card, 7)}"/>')
    out.append(leather_fill(card, key + "b", body, pal, 0.4, 0.45, True, 0.4, seed))
    side = lg(card, key + "-side", [(0, "#000000", 0.55), (0.16, "#000000", 0), (0.84, "#000000", 0), (1, "#000000", 0.6)], 0, 0, 1, 0)
    out.append(f'<path d="{body}" fill="{side}"/>')
    out.append(tool(scroll_vine(-46, 82, 46, 82, 8, 4), pal, 1.7, 0.9))
    out.append(tool("M-40 104 Q0 122 40 104", pal, 1.4, 0.8))
    out.append(stitch("M-60 -2 C-66 50 -56 90 -32 110", "#E9C98A", 1.2, "4 3"))
    out.append(stitch("M60 -2 C66 50 56 90 32 110", "#E9C98A", 1.2, "4 3"))
    if coins:
        rnd = random.Random(seed)
        for i in range(3):
            out.append(coin_use(card, -58 + i * 8 + rnd.uniform(-2, 2), 30 + i * 12, 9, 0.9, 80 + rnd.uniform(-8, 8)))
    out.append(f'<path d="{flap}" fill="#000000" opacity="0.5" transform="translate(0 5)" filter="{soft(card, 3)}"/>')
    out.append(leather_fill(card, key + "f", flap, fp, 0.42, 0.25, True, 0.35, seed + 3))
    fsh = lg(card, key + "-fsh", [(0, "#FFFFFF", 0.18), (0.3, "#FFFFFF", 0), (1, "#000000", 0.35)])
    out.append(f'<path d="{flap}" fill="{fsh}"/>')
    out.append(tool(flap_in, fp, 1.8))
    out.append(stitch("M-66 -50 L66 -50 C67 -24 66 -4 60 8 Q34 36 0 44 Q-34 36 -60 8 C-66 -4 -67 -24 -66 -50", "#F2D394", 1.3, "4.5 3.2"))
    out.append(tool(scroll_vine(-50, -26, -6, -26, 6, 2) + " " + scroll_vine(6, -26, 50, -26, 6, 2), fp, 1.4, 0.85))
    g = metal_lin(card, key + "-m", m, 0, 0, 1, 1)
    bv = bevel(card, key + "-bv", 0.9, 2.8, 1.0, 20, shadow=(0.8, 2.2, 1.6, 0.6))
    for rx, ry in ((-58, -38), (58, -38), (-50, 6), (50, 6)):
        out.append(rivet(card, rx, ry, 3, m, key + "-rv"))
    fermail = (f'<path d="M-15 18 L15 18 L18 36 L0 52 L-18 36 Z" fill="{g}"/>'
               f'<path d="M-10 23 L10 23 L12 35 L0 46 L-12 35 Z" fill="none" stroke="{m[2]}" stroke-width="1"/>'
               f'{signature_bars(0, 33, 0.3, m[2], w=7)}')
    out.append(f'<g filter="{bv}">{fermail}</g>')
    bar = ("M-80 -66 Q0 -82 80 -66 L80 -52 Q0 -68 -80 -52 Z")
    frame = (f'<path d="{bar}" fill="{g}"/>'
             f'<path d="M-76 -61 Q0 -76 76 -61" fill="none" stroke="{m[2]}" stroke-width="1" opacity="0.8"/>'
             f'<circle cx="-82" cy="-59" r="9" fill="{g}"/><circle cx="82" cy="-59" r="9" fill="{g}"/>'
             f'<circle cx="0" cy="-74" r="12" fill="{g}"/>'
             f'<circle cx="0" cy="-74" r="7" fill="none" stroke="{m[2]}" stroke-width="1.2"/>'
             f'<path d="M-8 -86 L-8 -98 Q0 -112 8 -98 L8 -86" fill="none" stroke="{g}" stroke-width="5"/>'
             f'<circle cx="0" cy="-110" r="11" fill="none" stroke="{g}" stroke-width="5"/>')
    out.append(f'<g filter="{bv}">{frame}</g>')
    out.append(f'<path d="M-70 -62 Q-30 -70 0 -71" stroke="#FFFFFF" stroke-width="1.4" fill="none" opacity="0.55" stroke-linecap="round"/>')
    for gx in (-44, -22, 22, 44):
        out.append(f'<circle cx="{gx}" cy="{f(-60 - 8 * (1 - (gx / 80) ** 2))}" r="1.6" fill="{m[0]}"/>')
    if seal:
        out.append(f'<path d="M0 50 Q-6 90 2 128" stroke="#3A1A08" stroke-width="3.4" fill="none" opacity="0.6"/>'
                   f'<path d="M0 50 Q-6 90 2 128" stroke="#D8B26A" stroke-width="2" fill="none"/>')
        out.append(wax_seal(card, 2, 142, 18, seal, key + "-ws", None, 0, seed))
    return grp("".join(out), x, y, s, rot, flip)


def tag(card, x, y, w, h, pal=LEATHER["tan"], key="tag", seed=5):
    """Une étiquette de cuir cousue (support de plaque)."""
    hi, mid, lo = pal
    d = f"M{f(x + 18)} {f(y)} L{f(x + w - 18)} {f(y)} Q{f(x + w)} {f(y)} {f(x + w)} {f(y + 18)} L{f(x + w)} {f(y + h - 18)} Q{f(x + w)} {f(y + h)} {f(x + w - 18)} {f(y + h)} L{f(x + 18)} {f(y + h)} Q{f(x)} {f(y + h)} {f(x)} {f(y + h - 18)} L{f(x)} {f(y + 18)} Q{f(x)} {f(y)} {f(x + 18)} {f(y)} Z"
    di = f"M{f(x + 20)} {f(y + 7)} L{f(x + w - 20)} {f(y + 7)} Q{f(x + w - 7)} {f(y + 7)} {f(x + w - 7)} {f(y + 20)} L{f(x + w - 7)} {f(y + h - 20)} Q{f(x + w - 7)} {f(y + h - 7)} {f(x + w - 20)} {f(y + h - 7)} L{f(x + 20)} {f(y + h - 7)} Q{f(x + 7)} {f(y + h - 7)} {f(x + 7)} {f(y + h - 20)} L{f(x + 7)} {f(y + 20)} Q{f(x + 7)} {f(y + 7)} {f(x + 20)} {f(y + 7)} Z"
    out = [f'<path d="{d}" fill="#000000" opacity="0.6" transform="translate(0 6)" filter="{soft(card, 6)}"/>']
    out.append(leather_fill(card, key, d, pal, 0.5, 0.25, True, 0.35, seed))
    sh = lg(card, key + "-sh", [(0, "#FFFFFF", 0.14), (0.25, "#FFFFFF", 0), (1, "#000000", 0.4)])
    out.append(f'<path d="{d}" fill="{sh}"/>')
    out.append(stitch(di, "#F2D394", 1.4))
    return "".join(out)
