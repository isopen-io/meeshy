"""Égypte solaire - le ciel égyptien devenu cosmos : le corps de Nout, le disque des décans de Dendera, les portes des
douze heures, les anneaux d'Apophis, et les réseaux de l'infime (quartz, flocons, alvéoles)."""

import math
import random

from kit import *  # noqa: F401,F403
from motifs import *  # noqa: F401,F403
from motifs import _tr, _poly  # noqa: F401
from cosmos import *  # noqa: F401,F403
from afrique import HAND, agrad  # noqa: F401


def half_ellipse_band(cx, base, rx_o, ry_o, rx_i, ry_i):
    return (f"M{f(cx - rx_o)} {f(base)} A{f(rx_o)} {f(ry_o)} 0 0 1 {f(cx + rx_o)} {f(base)} L{f(cx + rx_i)} {f(base)} "
            f"A{f(rx_i)} {f(ry_i)} 0 0 0 {f(cx - rx_i)} {f(base)} Z")


def ell_window(cx, base, rx, ry, y_cut):
    hw = rx * math.sqrt(max(0.0, 1 - ((base - y_cut) / ry) ** 2))
    return f"M{f(cx - hw)} {f(y_cut)} A{f(rx)} {f(ry)} 0 0 1 {f(cx + hw)} {f(y_cut)} Z"


def nout_body(card, name, cx, base, rx_o, ry_o, rx_i, ry_i, metal=GOLD3, seed=8, n=1500, suns=True):
    """Nout arquée au-dessus du monde : un corps-voûte de lapis, la Voie lactée qui le parcourt, les étoiles sba,
    le soleil avalé le soir à l'ouest et remis au monde au matin à l'est."""
    hi, mid, lo = metal
    band = half_ellipse_band(cx, base, rx_o, ry_o, rx_i, ry_i)
    card.def_once(name + "-cl", f'<clipPath id="{card.id(name + "-cl")}"><path d="{band}"/></clipPath>')
    g = card.rgrad(name + "-g", [(0, "#0A1440", 1), (0.8, "#14307A", 1), (0.92, "#1E3E9A", 1), (1, "#0A1440", 1)], 0.5, 1.0, 1.0)
    rnd = random.Random(seed)
    rxm, rym = (rx_o + rx_i) / 2, (ry_o + ry_i) / 2
    th = (rx_o - rx_i)
    stars = []
    for _ in range(n):
        a = rnd.uniform(0, math.pi)
        off = rnd.gauss(0, th * 0.22)
        x = cx + (rxm + off) * math.cos(a)
        y = base - (rym + off * (rym / rxm)) * math.sin(a)
        r = rnd.uniform(0.25, 1.25) ** 1.4
        col = "#FFE9C0" if rnd.random() < 0.3 else ("#BFD8FF" if rnd.random() < 0.3 else "#FFFFFF")
        stars.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{col}" opacity="{f(rnd.uniform(0.35, 1))}"/>')
    glow_path = f"M{f(cx - rxm)} {f(base)} A{f(rxm)} {f(rym)} 0 0 1 {f(cx + rxm)} {f(base)}"
    sba = []
    for i in range(30):
        a = math.pi * (i + 0.5) / 30
        x = cx + rxm * math.cos(a)
        y = base - rym * math.sin(a)
        sba.append(sba_star(x, y, th * 0.13, GOLD_HI, 0.9, dot=False, rot=90 - math.degrees(a)))
    eg = card.grad(name + "-e", [(0, hi), (0.5, mid), (1, lo)], 0, 0, 1, 1)
    outer = f"M{f(cx - rx_o)} {f(base)} A{f(rx_o)} {f(ry_o)} 0 0 1 {f(cx + rx_o)} {f(base)}"
    inner = f"M{f(cx - rx_i)} {f(base)} A{f(rx_i)} {f(ry_i)} 0 0 1 {f(cx + rx_i)} {f(base)}"
    out = [f'<path d="{band}" fill="{g}"/>',
           f'<g clip-path="url(#{card.id(name + "-cl")})">'
           f'<path d="{glow_path}" fill="none" stroke="#CFE0FF" stroke-width="{f(th * 0.7)}" opacity="0.16" filter="{card.blur(name + "-gb", th * 0.25)}"/>'
           f'<path d="{glow_path}" fill="none" stroke="#FFE2B8" stroke-width="{f(th * 0.3)}" opacity="0.18" filter="{card.blur(name + "-gb2", th * 0.12)}"/>'
           f'{"".join(stars)}{"".join(sba)}</g>',
           f'<g filter="{bevel(card, name + "-bv", 0.8, 2, sd=3, dy=2)}"><path d="{outer}" fill="none" stroke="{eg}" stroke-width="3.2"/>'
           f'<path d="{inner}" fill="none" stroke="{eg}" stroke-width="3.2"/></g>',
           f'<path d="{outer}" fill="none" stroke="{hi}" stroke-width="0.8" opacity="0.7" transform="translate(0 6)"/>']
    if suns:
        for a, core, edge in ((math.pi * 0.86, "#FFB070", "#C8432B"), (math.pi * 0.14, "#FFF2C0", "#FF9A3A")):
            x = cx + rxm * math.cos(a)
            y = base - rym * math.sin(a)
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(th * 0.46)}" fill="{card.rgrad(name + core[1:], [(0, "#FFFFFF", 1), (0.4, core, 1), (1, edge, 1)])}" stroke="{mid}" stroke-width="1.6"/>')
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(th * 1.2)}" fill="{card.rgrad(name + core[1:] + "g", [(0, core, 0.5), (1, core, 0)])}"/>')
    return "".join(out)


def limb_hands(card, x, y, s, color, line, flip=False):
    """Les deux mains de Nout posées au sol, doigts vers la terre."""
    return "".join(f'<g transform="translate({f(x + dx)} {f(y - 18 * s)}) scale({f(-s if flip else s)} {f(s)})"><path d="{HAND}" fill="{color}" stroke="{line}" stroke-width="0.6"/></g>'
                   for dx in (-8, 8))


def feet(x, y, s, color, line):
    """Les deux pieds de Nout posés à l'est."""
    d = "M-4 -24 L4 -24 L5 -6 C10 -5 18 -3 20 0 C20 3 16 4 10 4 L-4 4 C-6 0 -5 -10 -4 -24 Z"
    return "".join(f'<g transform="translate({f(x + dx)} {f(y)}) scale({f(s)})"><path d="{d}" fill="{color}" stroke="{line}" stroke-width="0.6"/></g>' for dx in (-10, 8))


def nout_head(card, name, x, y, s, metal=GOLD3, hair=LAPIS_D):
    """La tête de Nout, de profil, penchée vers la terre : une longue perruque de lapis, un diadème d'or."""
    hi, mid, lo = metal
    g = card.grad(name, [(0, hi), (0.5, mid), (1, lo)], 0, 0, 1, 1)
    wig = "M-14 -16 C-14 -26 -4 -32 6 -30 C14 -28 18 -20 16 -12 L16 26 C10 30 2 30 -4 26 L-14 18 Z"
    face = "M6 -22 C12 -22 16 -16 16 -10 L19 -6 L16 -4 L17 0 L15 2 C14 8 10 10 6 10 Z"
    strands = "".join(f'<line x1="{-10 + k * 5}" y1="-8" x2="{-10 + k * 5}" y2="{24 - abs(k - 2)}" stroke="{mid}" stroke-width="0.6" opacity="0.6"/>' for k in range(5))
    return (f'<g {_tr(x, y, s)}><path d="{face}" fill="{g}"/><path d="{wig}" fill="{hair}" stroke="{mid}" stroke-width="1"/>{strands}'
            f'<path d="M-12 -18 C-4 -26 8 -26 14 -20" fill="none" stroke="{g}" stroke-width="2.6"/></g>')


def decan_ring(card, name, cx, cy, r0, r1, n=36, metal=GOLD3, ground="#0B1847", seed=3):
    """L'anneau des 36 décans : chaque décan, une étoile sur sa barque, se lève tour à tour pendant dix jours."""
    hi, mid, lo = metal
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r1)}" fill="{ground}"/>',
           f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r1)}" fill="none" stroke="{mid}" stroke-width="2.4"/>',
           f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r0)}" fill="none" stroke="{mid}" stroke-width="1.6"/>']
    rm = (r0 + r1) / 2
    sz = (r1 - r0) * 0.42
    for i in range(n):
        a = i * 360 / n
        x, y = pt(cx, cy, rm, a)
        boat = (f'<path d="M{f(-sz)} 0 Q0 {f(sz * 0.5)} {f(sz)} 0 L{f(sz * 1.1)} {f(-sz * 0.35)} Q0 {f(sz * 0.2)} {f(-sz * 1.1)} {f(-sz * 0.35)} Z" fill="{mid}"/>'
                + sba_star(0, -sz * 0.75, sz * 0.62, hi, 1, dot=False))
        out.append(f'<g transform="translate({f(x)} {f(y)}) rotate({f(a)})">{boat}</g>')
        xa, ya = pt(cx, cy, r0, a + 180 / n)
        xb, yb = pt(cx, cy, r1, a + 180 / n)
        out.append(f'<line x1="{f(xa)}" y1="{f(ya)}" x2="{f(xb)}" y2="{f(yb)}" stroke="{lo}" stroke-width="0.8" opacity="0.8"/>')
    return "".join(out)


def hex_lattice(cx, cy, r, cell, color, w=0.8, op=0.6, clip=None):
    """Le réseau du quartz vu de très près : des alvéoles hexagonales, la même forme à toutes les échelles."""
    out = []
    h = cell * math.sqrt(3)
    rows = int(r * 2 / h) + 3
    cols = int(r * 2 / (cell * 1.5)) + 3
    for i in range(-cols // 2, cols // 2 + 1):
        for j in range(-rows // 2, rows // 2 + 1):
            x = cx + i * cell * 1.5
            y = cy + j * h + (h / 2 if i % 2 else 0)
            if math.hypot(x - cx, y - cy) > r:
                continue
            pts = [(x + cell * math.cos(math.radians(60 * k)), y + cell * math.sin(math.radians(60 * k))) for k in range(6)]
            out.append(f'<path d="{_poly(pts)}" fill="none" stroke="{color}" stroke-width="{w}"/>')
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(cell * 0.14)}" fill="{color}"/>')
    return f'<g opacity="{op}">{"".join(out)}</g>'


def hour_gate(card, name, x, y, s, metal=GOLD3, star=True, k=0):
    """Une des douze portes de la nuit (Livre des Portes) : un petit pylône, sa porte, l'étoile de l'heure."""
    hi, mid, lo = metal
    g = card.grad(name, [(0, hi), (0.5, mid), (1, lo)], 0, 0, 1, 1)
    out = [f'<path d="M-14 12 L-11 -10 L-3 -10 L-3 12 Z M14 12 L11 -10 L3 -10 L3 12 Z" fill="{g}"/>',
           f'<rect x="-3" y="-4" width="6" height="16" fill="#060A20"/>',
           f'<rect x="-16" y="-13" width="32" height="3" fill="{g}"/>',
           f'<rect x="-3" y="-4" width="6" height="16" fill="{card.rgrad(name + "-in", [(0, "#FFE8B0", 0.9), (1, "#FFE8B0", 0)])}"/>']
    if star:
        out.append(sba_star(0, -22, 5, hi, 1, dot=True))
    return f'<g {_tr(x, y, s)}>{"".join(out)}</g>'


def serpent_coils(card, name, pts, w, body=("#3A2A6A", "#120A26"), scale="#7FE0FF", hi="#E0D0FF", seed=4, head=None):
    """Apophis, le serpent du chaos que la barque doit vaincre chaque nuit : de lourds anneaux luisants, écaillés.
    `head` : (x, y, angle) de la tête."""
    path = "M" + f"{f(pts[0][0])} {f(pts[0][1])}"
    for i in range(1, len(pts) - 1, 2):
        path += f" Q{f(pts[i][0])} {f(pts[i][1])} {f(pts[i + 1][0])} {f(pts[i + 1][1])}"
    out = [f'<path d="{path}" fill="none" stroke="#000000" stroke-width="{f(w + 8)}" stroke-linecap="round" opacity="0.55" filter="{card.blur(name + "-sh", 5)}"/>',
           f'<path d="{path}" fill="none" stroke="{body[1]}" stroke-width="{f(w)}" stroke-linecap="round"/>',
           f'<path d="{path}" fill="none" stroke="{body[0]}" stroke-width="{f(w * 0.72)}" stroke-linecap="round"/>',
           f'<path d="{path}" fill="none" stroke="{scale}" stroke-width="{f(w * 0.62)}" stroke-dasharray="1.2 4.2" opacity="0.5"/>',
           f'<path d="{path}" fill="none" stroke="{GOLD}" stroke-width="{f(w * 0.2)}" stroke-dasharray="5 7" opacity="0.7"/>',
           f'<path d="{path}" fill="none" stroke="{hi}" stroke-width="{f(w * 0.1)}" stroke-linecap="round" opacity="0.55" transform="translate(0 {f(-w * 0.26)})"/>']
    if head:
        x, y, ang = head
        hd = (f'<path d="M0 {f(-w * 0.5)} C{f(w * 0.9)} {f(-w * 0.7)} {f(w * 1.7)} {f(-w * 0.4)} {f(w * 2.0)} 0 C{f(w * 1.7)} {f(w * 0.4)} {f(w * 0.9)} {f(w * 0.6)} 0 {f(w * 0.5)} Z" fill="{body[0]}" stroke="{body[1]}" stroke-width="1.2"/>'
              f'<circle cx="{f(w * 1.2)}" cy="{f(-w * 0.18)}" r="{f(w * 0.12)}" fill="{GOLD_HI}"/>'
              f'<path d="M{f(w * 2.0)} 0 l{f(w * 0.5)} {f(-w * 0.12)} m{f(-w * 0.5)} {f(w * 0.12)} l{f(w * 0.5)} {f(w * 0.14)}" stroke="#FF6A6A" stroke-width="1.2" fill="none"/>')
        out.append(f'<g transform="translate({f(x)} {f(y)}) rotate({f(ang)})">{hd}</g>')
    return "".join(out)


def hour_sun(card, name, x, y, r, phase, metal=GOLD3):
    """Le soleil à l'une des douze heures de la nuit : il rougit, s'éteint dans la Douat, puis renaît en or."""
    hi, mid, lo = metal
    cols = [("#FFB070", "#C8432B"), ("#E87A50", "#8A2A20"), ("#B04A50", "#4A1830"), ("#6A3A7A", "#2A1440"), ("#3A3A8A", "#141444"),
            ("#2A3A9A", "#0E1A50"), ("#2A4AAA", "#101E5A"), ("#3A6ACA", "#142A6A"), ("#6A9AE0", "#2A4A8A"), ("#B0D0F0", "#5A7AAA"),
            ("#FFE8A8", "#E0A040"), ("#FFF6D0", "#FFB43A")][phase]
    g = card.rgrad(f"{name}", [(0, "#FFFFFF", 0.9), (0.35, cols[0], 1), (1, cols[1], 1)], 0.4, 0.35, 0.7)
    out = [f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 2.2)}" fill="{card.rgrad(name + "-g", [(0, cols[0], 0.45), (1, cols[0], 0)])}"/>',
           f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{g}" stroke="{mid}" stroke-width="1.4"/>',
           sba_star(x, y - r - 7, 4.2, hi, 1, dot=False)]
    return "".join(out)


def deep_field(card, name, region, n=120, seed=5, keep=None, op=1.0):
    """Le champ profond : des milliers de galaxies lointaines, spirales minuscules, elliptiques dorées, arcs rougis par la distance."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    cols = ("#FFE6C0", "#FFD0A0", "#D8E4FF", "#FFB0A0", "#C8B8FF", "#FFFFFF")
    for i in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if keep and keep[0] < x < keep[2] and keep[1] < y < keep[3]:
            continue
        r = rnd.uniform(1.2, 4.2) * (1.6 if rnd.random() < 0.08 else 1)
        c = rnd.choice(cols)
        rot = rnd.uniform(0, 180)
        t = rnd.uniform(0.25, 0.9)
        out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(r * 1.8)}" ry="{f(r * 1.8 * t)}" fill="{c}" opacity="{f(0.18 * op)}" transform="rotate({f(rot)} {f(x)} {f(y)})"/>')
        out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(r * 0.8)}" ry="{f(r * 0.8 * t)}" fill="{c}" opacity="{f(0.7 * op)}" transform="rotate({f(rot)} {f(x)} {f(y)})"/>')
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.3)}" fill="#FFFFFF" opacity="{f(0.9 * op)}"/>')
        if r > 3.2 and rnd.random() < 0.6:
            for arm in (0, 180):
                a0 = math.radians(rot + arm)
                pts = [(x + r * 0.4 * k * math.cos(a0 + 0.5 * k), y + r * 0.4 * k * t * math.sin(a0 + 0.5 * k)) for k in range(0, 6)]
                out.append(f'<path d="{_poly(pts, False)}" fill="none" stroke="{c}" stroke-width="0.7" opacity="{f(0.6 * op)}"/>')
    return "".join(out)


def water_molecule(x, y, s, rot=0, o="#FF5A6A", h="#F2F6FF", bond="#FFE9C0"):
    """Une molécule d'eau : l'oxygène et ses deux hydrogènes à 104,5 degrés."""
    a = math.radians(52.25)
    hx, hy = 14 * math.sin(a), 14 * math.cos(a)
    return (f'<g transform="translate({f(x)} {f(y)}) rotate({f(rot)}) scale({f(s)})">'
            f'<line x1="0" y1="0" x2="{f(-hx)}" y2="{f(hy)}" stroke="{bond}" stroke-width="2.2"/><line x1="0" y1="0" x2="{f(hx)}" y2="{f(hy)}" stroke="{bond}" stroke-width="2.2"/>'
            f'<circle cx="0" cy="0" r="7" fill="{o}"/><circle cx="-2" cy="-2" r="2.5" fill="#FFFFFF" opacity="0.55"/>'
            f'<circle cx="{f(-hx)}" cy="{f(hy)}" r="4.4" fill="{h}"/><circle cx="{f(hx)}" cy="{f(hy)}" r="4.4" fill="{h}"/></g>')


def benzene(x, y, r, color, w=1.4, op=0.9, rot=0):
    """Un cycle aromatique : l'hexagone et son anneau d'électrons partagés."""
    pts = [pt(x, y, r, rot + 60 * k) for k in range(6)]
    out = f'<path d="{_poly(pts)}" fill="none" stroke="{color}" stroke-width="{w}"/><circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.55)}" fill="none" stroke="{color}" stroke-width="{f(w * 0.8)}"/>'
    out += "".join(f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(r * 0.16)}" fill="{color}"/>' for px, py in pts)
    return f'<g opacity="{op}">{out}</g>'


def papyrus_capital(card, name, cx, y_top, w, h, metal=GOLD3, paint=(LAPIS, TURQ, CARN)):
    """Un chapiteau papyriforme ouvert, en or et émaux, posé sur un fût quelconque."""
    hi, mid, lo = metal
    g = card.grad(name, [(0, lo), (0.3, hi), (0.6, mid), (1, lo)], 0, 0, 1, 0)
    bell = (f"M{f(cx - w * 0.22)} {f(y_top + h)} C{f(cx - w * 0.3)} {f(y_top + h * 0.5)} {f(cx - w * 0.52)} {f(y_top + h * 0.15)} {f(cx - w * 0.5)} {f(y_top)} "
            f"L{f(cx + w * 0.5)} {f(y_top)} C{f(cx + w * 0.52)} {f(y_top + h * 0.15)} {f(cx + w * 0.3)} {f(y_top + h * 0.5)} {f(cx + w * 0.22)} {f(y_top + h)} Z")
    out = [f'<path d="{bell}" fill="{g}"/>']
    for i in range(7):
        t = (i + 0.5) / 7
        xt = cx - w * 0.5 + t * w
        xb = cx - w * 0.2 + t * w * 0.4
        out.append(f'<path d="M{f(xb)} {f(y_top + h)} L{f(xt - w * 0.05)} {f(y_top + 2)} L{f(xt + w * 0.05)} {f(y_top + 2)} Z" fill="{paint[i % 3]}" opacity="0.85"/>')
    out.append(f'<rect x="{f(cx - w * 0.54)}" y="{f(y_top - 5)}" width="{f(w * 1.08)}" height="6" rx="2" fill="{g}"/>')
    for k in range(3):
        out.append(f'<rect x="{f(cx - w * 0.23)}" y="{f(y_top + h + k * 5)}" width="{f(w * 0.46)}" height="3.4" fill="{paint[k]}"/>')
    return f'<g filter="{bevel(card, name + "-bv", 0.8, 1.8, sd=3, dy=2)}">{"".join(out)}</g>'


def pow10_lens(card, name, cx, cy, r, inner, label, ring=GOLD3, ground="#06101E", label_color="#FFE9C0", side=1):
    out = lens(card, name, cx, cy, r, inner, ring, ground, True, False)
    out += (f'<text x="{f(cx)}" y="{f(cy + r + 16)}" text-anchor="middle" font-family="{SANS}" font-weight="700" font-size="9.5" '
            f'letter-spacing="0.6" fill="{label_color}" opacity="0.95">{label}</text>')
    return out
