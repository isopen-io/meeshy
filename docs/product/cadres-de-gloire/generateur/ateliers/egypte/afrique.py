"""Égypte solaire - constructions africaines de la vallée du Nil et des hautes terres : pylônes de Koush, lions couchés,
dunes, caravanes, vanneries nubiennes, stèles d'Aksoum, colonnes palmiformes d'Amarna, falaise d'Abou Simbel."""

import math
import random

from kit import *  # noqa: F401,F403
from motifs import *  # noqa: F401,F403
from motifs import _tr, _poly  # noqa: F401
from archi import baboon, cowrie  # noqa: F401


# ---------------------------------------------------------------- sable et désert

def sand_ripples(seed, x0, y0, x1, y1, color, step=9, amp=3.0, w=1.0, op=0.35, wl=70):
    """Les rides du sable : des lignes ondulées serrées, plus espacées vers l'avant."""
    rnd = random.Random(seed)
    out = []
    y = y0
    k = 0
    while y < y1:
        ph = rnd.uniform(0, 6.28)
        pts = []
        x = x0
        while x <= x1 + 10:
            pts.append((x, y + amp * math.sin(x / wl + ph) + 1.6 * math.sin(x / 17 + ph * 2)))
            x += 10
        out.append(f'<path d="{_poly(pts, False)}" fill="none" stroke="{color}" stroke-width="{f(w)}" opacity="{f(op * rnd.uniform(0.6, 1))}"/>')
        y += step * (1 + 0.06 * k)
        k += 1
    return "".join(out)


def dune_layer(card, name, y, amp, wl, ph, fill, x0=-10, x1=W + 10, bottom=H + 10, crest=None, crest_w=1.4):
    """Une crête de dune douce, avec son liseré de lumière."""
    pts = []
    x = x0
    while x <= x1 + 12:
        pts.append((x, y - amp * (0.5 + 0.5 * math.sin(x / wl + ph)) - amp * 0.25 * math.sin(x / (wl * 0.37) + ph * 1.7)))
        x += 12
    d = f"M{f(x0)} {f(bottom)} L" + " L".join(f"{f(px)} {f(py)}" for px, py in pts) + f" L{f(x1 + 12)} {f(bottom)} Z"
    out = f'<path d="{d}" fill="{fill}"/>'
    if crest:
        out += f'<path d="{_poly(pts, False)}" fill="none" stroke="{crest}" stroke-width="{f(crest_w)}" opacity="0.75"/>'
    return out


CAMEL = ("M-19 0 L-18 -11 C-21 -13 -22 -17 -19 -20 C-15 -23 -12 -29 -6 -31 C-1 -32 4 -28 8 -23 L12 -22 C15 -24 17 -29 19 -34 "
         "C20 -37 24 -38 27 -36 L29 -34 L27 -33 L23 -33 C21 -28 19 -21 15 -16 L14 -12 L15 0 L13 0 L11 -11 L9 -11 L9 0 L7 0 L6 -12 "
         "L-7 -12 L-8 0 L-10 0 L-11 -11 L-13 -11 L-15 0 Z")


def camel(x, y, s, color, flip=False, rider=False, op=1):
    """Un dromadaire de caravane en silhouette (longueur ~50 * s)."""
    extra = f'<path d="M-6 -31 L-3 -44 C-1 -47 3 -47 4 -44 L4 -32 Z" fill="{color}"/>' if rider else ""
    return f'<g {_tr(x, y, s, flip)} opacity="{op}"><path d="{CAMEL}" fill="{color}"/>{extra}</g>'


def acacia(x, y, s, color, seed=3, op=1):
    """Un acacia du Sahel en parasol, en silhouette."""
    rnd = random.Random(seed)
    out = [f'<path d="M{f(x - 2 * s)} {f(y)} C{f(x - 1 * s)} {f(y - 18 * s)} {f(x - 8 * s)} {f(y - 30 * s)} {f(x - 22 * s)} {f(y - 38 * s)} '
           f'M{f(x + 2 * s)} {f(y)} C{f(x + 2 * s)} {f(y - 20 * s)} {f(x + 10 * s)} {f(y - 32 * s)} {f(x + 24 * s)} {f(y - 40 * s)}" '
           f'fill="none" stroke="{color}" stroke-width="{f(3 * s)}" stroke-linecap="round"/>']
    out.append(f'<path d="M{f(x - 2 * s)} {f(y)} L{f(x - 3 * s)} {f(y - 14 * s)} L{f(x + 3 * s)} {f(y - 14 * s)} L{f(x + 2 * s)} {f(y)} Z" fill="{color}"/>')
    for i in range(9):
        cx = x + (-36 + i * 9) * s + rnd.uniform(-3, 3) * s
        cy = y - (42 + 5 * math.sin(i)) * s
        out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rnd.uniform(9, 14) * s)}" ry="{f(rnd.uniform(4, 6) * s)}" fill="{color}"/>')
    return f'<g opacity="{op}">{"".join(out)}</g>'


# ---------------------------------------------------------------- Koush : pylône, tore, lion couché

def torus(card, name, x1, y1, x2, y2, w, metal=GOLD3, tie=None, every=7):
    """Le tore égyptien : la baguette ronde liée de rubans qui borde pylônes et naos."""
    hi, mid, lo = metal
    ang = math.degrees(math.atan2(y2 - y1, x2 - x1))
    ln = math.hypot(x2 - x1, y2 - y1)
    g = card.grad(name, [(0, lo), (0.3, hi), (0.55, mid), (1, lo)], 0, 0, 0, 1)
    ties = "".join(f'<line x1="{f(t)}" y1="{f(-w / 2 + 0.6)}" x2="{f(t + w * 0.7)}" y2="{f(w / 2 - 0.6)}" stroke="{tie or lo}" stroke-width="1.1" opacity="0.85"/>'
                   for t in [k * every for k in range(int(ln / every))])
    return (f'<g transform="translate({f(x1)} {f(y1)}) rotate({f(ang)})">'
            f'<rect x="0" y="{f(-w / 2)}" width="{f(ln)}" height="{f(w)}" rx="{f(w / 2)}" fill="{g}"/>{ties}</g>')


LION = ("M0 0 C-2 -8 2 -16 12 -19 C30 -24 60 -22 84 -27 C92 -29 98 -32 102 -36 L132 -20 L134 -6 C136 -4 140 -3 146 -3 "
        "C152 -3 154 4 148 4 L0 4 Z")


def recumbent_lion(x, base_y, s, color, mane=None, hi=None, flip=False, op=1, face=None):
    """Le lion couché, gardien des temples de Koush (Soleb, Gebel Barkal) : longueur ~150 * s."""
    mane = mane or color
    face = face or color
    tufts = "".join(f'<circle cx="{f(116 + 24 * math.cos(math.radians(a)))}" cy="{f(-36 + 26 * math.sin(math.radians(a)))}" r="8.5" fill="{mane}"/>'
                    for a in range(90, 400, 26))
    core = f'<ellipse cx="116" cy="-36" rx="24" ry="26" fill="{mane}"/>'
    head = ('M124 -54 C132 -60 142 -56 145 -48 L151 -42 C153 -38 152 -33 148 -31 L147 -26 C144 -21 136 -20 129 -23 '
            'C124 -30 121 -44 124 -54 Z')
    ear = '<path d="M126 -56 C124 -64 130 -66 133 -60 Z" fill="%s"/>' % mane
    tail = f'<path d="M4 -4 C-8 -2 -14 6 -6 10 C2 12 14 6 24 4" fill="none" stroke="{color}" stroke-width="3.2" stroke-linecap="round"/>'
    light = ""
    if hi:
        light = (f'<path d="M14 -19 C32 -24 60 -22 84 -27" fill="none" stroke="{hi}" stroke-width="1.4" opacity="0.7"/>'
                 f'<path d="M128 -55 C134 -59 141 -56 144 -49" fill="none" stroke="{hi}" stroke-width="1.2" opacity="0.8"/>'
                 f'<path d="M22 -8 C26 -16 40 -18 52 -12" fill="none" stroke="{hi}" stroke-width="1" opacity="0.5"/>')
    feat = (f'<path d="M136 -45 L142 -44" stroke="#3A1A08" stroke-width="1.4" stroke-linecap="round" opacity="0.8"/>'
            f'<path d="M148 -33 C145 -31 141 -31 139 -33" fill="none" stroke="#3A1A08" stroke-width="1" opacity="0.6"/>')
    return (f'<g {_tr(x, base_y, s, flip)} opacity="{op}"><path d="{LION}" fill="{color}"/>{tail}{tufts}{core}{ear}'
            f'<path d="{head}" fill="{face}"/>{feat}{light}</g>')


def pylon_tower(card, name, side, x_out_b, x_out_t, x_in, y_top, y_bot, lit=True, stone=("#F2C48C", "#D08A52", "#7A3E1E"),
                cornice_cols=(CARN, GOLD, "#1A0E08", GOLD, TURQ, GOLD), relief=GOLD, panel=True):
    """Une tour de pylône (Koush) : fruit des murs, tore aux arêtes, gorge peinte au sommet, panneau gravé."""
    m = 1 if side > 0 else -1

    def X(x):
        return x if side < 0 else W - x
    poly = [(X(x_out_b), y_bot), (X(x_out_t), y_top), (X(x_in), y_top), (X(x_in), y_bot)]
    hi_, mid_, lo_ = stone
    g = card.grad(name + "-st", [(0, hi_ if lit else mid_), (0.6, mid_ if lit else lo_), (1, lo_)], 0, 0, 0, 1)
    out = [f'<path d="{_poly(poly)}" fill="{g}" filter="{stone_filter(card, name + "-tx", "0.9 0.5", 6, 1.2, "#FFF2DC", 50, 1.12)}"/>']
    shade = card.grad(name + "-sh", [(0, "#000000"), (1, "#000000")], 0, 0, 1, 0)
    if not lit:
        out.append(f'<path d="{_poly(poly)}" fill="#2A0C1A" opacity="0.32"/>')
    for k in range(1, 18):
        yy = y_top + (y_bot - y_top) * k / 18
        t = (yy - y_top) / (y_bot - y_top)
        xo = x_out_t + (x_out_b - x_out_t) * t
        out.append(f'<line x1="{f(X(xo))}" y1="{f(yy)}" x2="{f(X(x_in))}" y2="{f(yy)}" stroke="{lo_}" stroke-width="0.6" opacity="0.28"/>')
    out.append(torus(card, name + "-to", X(x_out_t) + m * 0, y_top + 4, X(x_out_b), y_bot, 7))
    if panel:
        px0, px1 = x_out_t + 16, x_in - 12
        py0, py1 = y_top + 64, y_bot - 40
        cx = X((px0 + px1) / 2)
        out.append(f'<rect x="{f(min(X(px0), X(px1)))}" y="{f(py0)}" width="{f(abs(px1 - px0))}" height="{f(py1 - py0)}" fill="#000000" opacity="0.14"/>')
        out.append(f'<rect x="{f(min(X(px0), X(px1)))}" y="{f(py0)}" width="{f(abs(px1 - px0))}" height="{f(py1 - py0)}" fill="none" stroke="{lo_}" stroke-width="1" opacity="0.6"/>')
        return "".join(out), (cx, py0, py1, abs(px1 - px0))
    return "".join(out), None


# ---------------------------------------------------------------- vannerie nubienne

def woven_plate(card, name, cx, cy, r, colors=("#C8432B", "#F2B23C", "#1F7A6E", "#2A2A6A", "#F6EEDC"), seed=1):
    """Un plateau tressé nubien (tabaq) : spirale de fibres teintes, motifs en dents et en losanges."""
    rnd = random.Random(seed)
    out = [f'<circle cx="{f(cx + 2)}" cy="{f(cy + 3)}" r="{f(r)}" fill="#000000" opacity="0.25"/>',
           f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="#E9D3A6"/>']
    rings = 6
    for k in range(rings):
        r0 = r * (k + 0.3) / rings
        r1 = r * (k + 1) / rings
        c = colors[(k + seed) % len(colors)]
        n = 6 + k * 4
        for i in range(n):
            if (i + k) % 2:
                continue
            a0 = i * 360 / n
            a1 = (i + 1) * 360 / n
            p = [pt(cx, cy, r0, a0), pt(cx, cy, r1, (a0 + a1) / 2), pt(cx, cy, r0, a1)] if k % 2 else [pt(cx, cy, r0, a0), pt(cx, cy, r1, a0), pt(cx, cy, r1, a1), pt(cx, cy, r0, a1)]
            out.append(f'<path d="{_poly(p)}" fill="{c}" opacity="0.92"/>')
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r1)}" fill="none" stroke="#8A6A3A" stroke-width="0.6" opacity="0.6"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="#6A4A22" stroke-width="{f(r * 0.06)}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{card.rgrad("wp-sheen", [(0, "#FFFFFF", 0.22), (1, "#FFFFFF", 0)], 0.35, 0.3, 0.6)}"/>')
    return "".join(out)


CROC = ("M-100 2 C-80 0 -60 -4 -40 -8 C-20 -12 0 -14 20 -14 C34 -14 44 -12 54 -10 L70 -10 C82 -10 94 -8 100 -5 "
        "C102 -3 100 0 96 0 L60 2 C50 6 36 8 20 8 C0 8 -20 6 -40 4 C-60 4 -80 4 -100 2 Z")


def painted_croc(x, y, s, color, scale_c=None, flip=False):
    """Le crocodile peint au-dessus des portes nubiennes, gardien du seuil (longueur ~200 * s)."""
    sc = scale_c or color
    legs = ('M34 6 L28 16 L20 18 L22 21 L34 19 L44 7 Z M-26 5 L-34 15 L-42 17 L-40 20 L-28 18 L-16 5 Z')
    ridge = "".join(f'<path d="M{xx - 3} {f(-9 - 4 * (1 - abs(xx - 10) / 100))} L{xx} {f(-14 - 4 * (1 - abs(xx - 10) / 100))} L{xx + 3} {f(-9 - 4 * (1 - abs(xx - 10) / 100))} Z" fill="{color}"/>'
                    for xx in range(-80, 50, 8))
    dots = "".join(f'<circle cx="{xx}" cy="{f(-3 + 0.02 * abs(xx))}" r="1.6" fill="{sc}"/>' for xx in range(-70, 50, 10))
    band = f'<path d="M-90 2 C-60 0 -20 -4 20 -4 C40 -4 60 -3 92 -3" fill="none" stroke="{sc}" stroke-width="1" opacity="0.6"/>'
    return (f'<g {_tr(x, y, s, flip)}><path d="{CROC}" fill="{color}"/>{ridge}<path d="{legs}" fill="{color}"/>{dots}{band}'
            f'<circle cx="64" cy="-9" r="2" fill="{sc}"/><path d="M70 -2 L96 -3" stroke="{sc}" stroke-width="0.9" opacity="0.7"/></g>')


def zir_jar(card, name, cx, base_y, s, clay=("#D9925A", "#A85A2E", "#5A2A12")):
    """La jarre à eau (zir) posée sur son support devant la maison : l'eau offerte au passant."""
    g = card.rgrad(name, [(0, clay[0], 1), (0.6, clay[1], 1), (1, clay[2], 1)], 0.35, 0.35, 0.75)
    return (f'<g {_tr(cx, base_y, s)}>'
            f'<path d="M-22 0 L-16 -26 L16 -26 L22 0 Z" fill="#6A4A2A"/><path d="M-20 -26 L20 -26 L18 -30 L-18 -30 Z" fill="#8A6A3A"/>'
            f'<path d="M-10 -30 C-30 -40 -34 -70 -22 -90 C-16 -100 -12 -104 -12 -110 L12 -110 C12 -104 16 -100 22 -90 C34 -70 30 -40 10 -30 Z" fill="{g}"/>'
            f'<rect x="-14" y="-114" width="28" height="6" rx="2" fill="{clay[1]}"/>'
            f'<path d="M-24 -76 C-8 -70 8 -70 24 -76" fill="none" stroke="#F6EEDC" stroke-width="2" opacity="0.7"/>'
            f'<path d="M-24 -66 C-8 -60 8 -60 24 -66" fill="none" stroke="#1F3F9A" stroke-width="1.6" opacity="0.7"/></g>')


# ---------------------------------------------------------------- Aksoum (Éthiopie)

def aksum_stela(card, name, cx, base_y, w, h, storeys=8, light="left", stone=("#F4D7B0", "#C99A6A", "#6E4A32"), glow=None):
    """Une grande stèle d'Aksoum : monolithe de granite sculpté en tour à étages - fausse porte, fenêtres à meneaux,
    rangées de têtes de poutres (« têtes de singe ») - coiffé d'un sommet arrondi."""
    hi, mid, lo = stone
    lg = card.grad(name + "-f", [(0, hi), (0.5, mid), (1, lo)], 0 if light == "left" else 1, 0, 1 if light == "left" else 0, 0)
    tw = w * 0.84
    side_w = w * 0.16
    top = base_y - h
    head_r = tw / 2
    m = 1 if light == "left" else -1
    out = []
    face = (f"M{f(cx - w / 2)} {f(base_y)} L{f(cx - tw / 2)} {f(top + head_r)} A{f(head_r)} {f(head_r * 1.1)} 0 0 1 {f(cx + tw / 2)} {f(top + head_r)} "
            f"L{f(cx + w / 2)} {f(base_y)} Z")
    out.append(f'<path d="{face}" fill="{lg}" filter="{stone_filter(card, name + "-tx", "0.8 0.4", 9, 1.1, "#FFF2DC", 52, 1.1)}"/>')
    sx = cx + m * w / 2
    sxt = cx + m * tw / 2
    out.append(f'<path d="M{f(sx)} {f(base_y)} L{f(sxt)} {f(top + head_r)} L{f(sxt + m * side_w * 0.8)} {f(top + head_r + 6)} L{f(sx + m * side_w)} {f(base_y)} Z" fill="{lo}" opacity="0.92"/>')
    door_h = h * 0.12
    out.append(f'<rect x="{f(cx - w * 0.2)}" y="{f(base_y - door_h)}" width="{f(w * 0.4)}" height="{f(door_h)}" fill="{lo}" opacity="0.75"/>')
    out.append(f'<circle cx="{f(cx + w * 0.1)}" cy="{f(base_y - door_h * 0.5)}" r="{f(w * 0.03)}" fill="{hi}" opacity="0.8"/>')
    band_top = base_y - door_h - 6
    seg = (band_top - (top + head_r * 1.6)) / storeys
    for k in range(storeys):
        y0 = band_top - k * seg
        t = (base_y - y0) / h
        half = w / 2 - (w - tw) / 2 * t
        out.append(f'<rect x="{f(cx - half)}" y="{f(y0 - seg * 0.18)}" width="{f(half * 2)}" height="{f(seg * 0.18)}" fill="{lo}" opacity="0.35"/>')
        nb = 5
        for j in range(nb):
            bx = cx - half * 0.8 + j * half * 1.6 / (nb - 1)
            out.append(f'<circle cx="{f(bx)}" cy="{f(y0 - seg * 0.09)}" r="{f(seg * 0.07)}" fill="{hi}" opacity="0.75"/>')
        wy0 = y0 - seg * 0.9
        ww = half * 0.32
        for wx in (cx - half * 0.45, cx + half * 0.45):
            out.append(f'<rect x="{f(wx - ww / 2)}" y="{f(wy0)}" width="{f(ww)}" height="{f(seg * 0.6)}" fill="{lo}" opacity="0.6"/>')
            out.append(f'<path d="M{f(wx)} {f(wy0)} L{f(wx)} {f(wy0 + seg * 0.6)} M{f(wx - ww / 2)} {f(wy0 + seg * 0.3)} L{f(wx + ww / 2)} {f(wy0 + seg * 0.3)}" stroke="{mid}" stroke-width="{f(max(0.8, ww * 0.12))}"/>')
    if glow:
        out.append(f'<path d="M{f(cx - m * w / 2)} {f(base_y)} L{f(cx - m * tw / 2)} {f(top + head_r)}" stroke="{glow}" stroke-width="2" opacity="0.8"/>')
    return "".join(out)


def disk_crescent(card, name, cx, cy, r, metal=GOLD3):
    """Le disque et le croissant des rois d'Aksoum, frappés sur leurs monnaies d'or avant le IVe siècle."""
    hi, mid, lo = metal
    g = card.grad(name + "-g", [(0, hi), (0.5, mid), (1, lo)], 0, 0, 1, 1)
    card.def_once(name + "-m", f'<mask id="{card.id(name + "-m")}" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="#FFFFFF"/>'
                               f'<circle cx="{f(cx)}" cy="{f(cy - r * 0.36)}" r="{f(r * 0.92)}" fill="#000000"/></mask>')
    return (f'<g filter="{bevel(card, name + "-bv", 1.0, 2.4, sd=4, dy=3)}">'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}" mask="url(#{card.id(name + "-m")})"/></g>')


def amba(card, name, y, fill, seed=2, x0=-10, x1=W + 10):
    """Les ambas : plateaux tabulaires des hautes terres d'Éthiopie, falaises à pic et sommets plats."""
    rnd = random.Random(seed)
    pts = [(x0, y)]
    x = x0
    while x < x1:
        flat = rnd.uniform(30, 80)
        hh = rnd.uniform(20, 70)
        pts += [(x + 6, y - hh), (x + flat, y - hh - rnd.uniform(-4, 4)), (x + flat + 8, y - rnd.uniform(0, 12))]
        x += flat + rnd.uniform(14, 40)
    pts += [(x1, y), (x1, H + 10), (x0, H + 10)]
    return f'<path d="{_poly(pts)}" fill="{fill}"/>'


def rainbow(card, name, cx, cy, r, w, op=0.55):
    cols = ["#FF5A5A", "#FFA43A", "#FFE45A", "#6EE07A", "#5AB8FF", "#8A6AFF"]
    out = []
    for i, c in enumerate(cols):
        rr = r - i * w / len(cols)
        out.append(f'<path d="M{f(cx - rr)} {f(cy)} A{f(rr)} {f(rr)} 0 0 1 {f(cx + rr)} {f(cy)}" fill="none" stroke="{c}" stroke-width="{f(w / len(cols) + 0.6)}"/>')
    return f'<g opacity="{op}" filter="{card.blur(name + "-b", 2.2)}">{"".join(out)}</g>'


def waterfall(card, name, x0, x1, y0, y1, seed=3, color="#EAF6FF", op=0.85):
    """Une chute d'eau : des filets verticaux qui s'effilochent, la brume en bas."""
    rnd = random.Random(seed)
    out = []
    for i in range(int((x1 - x0) / 2.2)):
        x = x0 + i * 2.2 + rnd.uniform(-0.8, 0.8)
        ya = y0 + rnd.uniform(0, 8)
        yb = y1 - rnd.uniform(0, 30)
        out.append(f'<line x1="{f(x)}" y1="{f(ya)}" x2="{f(x + rnd.uniform(-2, 2))}" y2="{f(yb)}" stroke="{color}" stroke-width="{f(rnd.uniform(0.6, 1.8))}" opacity="{f(rnd.uniform(0.3, 0.9))}"/>')
    out.append(f'<ellipse cx="{f((x0 + x1) / 2)}" cy="{f(y1)}" rx="{f((x1 - x0) * 1.1)}" ry="22" fill="{card.rgrad(name + "-mist", [(0, "#FFFFFF", 0.8), (1, "#FFFFFF", 0)])}"/>')
    return f'<g opacity="{op}">{"".join(out)}</g>'


# ---------------------------------------------------------------- Amarna

def palm_column(card, name, cx, y_top, y_bot, w, stone=("#F7E2B6", "#D7AE72", "#8A6234"), paint=(TURQ, LAPIS, CARN, GOLD), metal=GOLD3):
    """Colonne palmiforme : fût lisse, liens peints, chapiteau de palmes liées qui s'ouvrent (Amarna, le palais du roi)."""
    hi, mid, lo = metal
    sg = card.grad(name + "-s", [(0, stone[2]), (0.25, stone[1]), (0.45, stone[0]), (0.7, stone[1]), (1, stone[2])], 0, 0, 1, 0)
    cap_h = w * 1.6
    shaft_top = y_top + cap_h
    bw = w * 0.5
    out = [f'<rect x="{f(cx - w * 0.62)}" y="{f(y_bot - w * 0.18)}" width="{f(w * 1.24)}" height="{f(w * 0.18)}" rx="{f(w * 0.08)}" fill="{sg}"/>',
           f'<path d="M{f(cx - bw)} {f(y_bot - w * 0.18)} L{f(cx - bw * 0.88)} {f(shaft_top)} L{f(cx + bw * 0.88)} {f(shaft_top)} L{f(cx + bw)} {f(y_bot - w * 0.18)} Z" fill="{sg}"/>']
    for i in range(5):
        out.append(f'<rect x="{f(cx - bw * 0.9)}" y="{f(shaft_top + 2 + i * w * 0.09)}" width="{f(bw * 1.8)}" height="{f(w * 0.06)}" fill="{paint[i % len(paint)]}"/>')
    fronds = 9
    for i in range(fronds):
        t = (i + 0.5) / fronds
        a = -60 + 120 * t
        xb = cx - bw * 0.8 + t * bw * 1.6
        xt = cx + math.sin(math.radians(a)) * w * 1.05
        yt = y_top + (1 - math.cos(math.radians(a))) * cap_h * 0.5
        c = (TURQ, "#3FB68B", LAPIS)[i % 3]
        out.append(f'<path d="M{f(xb - 3)} {f(shaft_top)} Q{f((xb + xt) / 2 - 6)} {f((shaft_top + yt) / 2)} {f(xt - 5)} {f(yt)} '
                   f'Q{f(xt)} {f(yt - 6)} {f(xt + 5)} {f(yt)} Q{f((xb + xt) / 2 + 6)} {f((shaft_top + yt) / 2)} {f(xb + 3)} {f(shaft_top)} Z" fill="{c}" stroke="{mid}" stroke-width="1"/>')
        out.append(f'<path d="M{f(xb)} {f(shaft_top)} Q{f((xb + xt) / 2)} {f((shaft_top + yt) / 2)} {f(xt)} {f(yt)}" fill="none" stroke="{hi}" stroke-width="0.8" opacity="0.7"/>')
    out.append(f'<rect x="{f(cx - w * 0.5)}" y="{f(y_top - w * 0.2)}" width="{f(w)}" height="{f(w * 0.22)}" fill="{sg}" stroke="{lo}" stroke-width="0.6"/>')
    return "".join(out)


DUCK = ("M-16 0 C-10 -6 0 -8 8 -6 C12 -10 16 -12 20 -10 L26 -9 L20 -7 C18 -4 14 -1 8 0 C0 3 -10 3 -16 0 Z")


def duck_flight(x, y, s, body, wing, flip=False, phase=0):
    """Un canard des marais qui s'envole (les sols peints du palais d'Amarna)."""
    up = -14 if phase == 0 else -4
    return (f'<g {_tr(x, y, s, flip)}><path d="{DUCK}" fill="{body}"/>'
            f'<path d="M-6 -4 C-10 {up} -2 {up - 8} 10 {up - 6} C6 {up + 2} 4 -2 2 -4 Z" fill="{wing}"/>'
            f'<path d="M-4 -3 C-16 {up + 2} -24 {up + 4} -30 {up + 10} C-20 {up + 10} -10 -2 -2 -2 Z" fill="{wing}" opacity="0.85"/>'
            f'<circle cx="17" cy="-9" r="1" fill="#1A0A04"/></g>')


# ---------------------------------------------------------------- Abou Simbel

def baboon_relief(card, name, x, y, s, metal=GOLD3, shade="#5A2A12"):
    """Un babouin en relief doré, bras levés vers le soleil levant."""
    hi, mid, lo = metal
    g = card.grad(name, [(0, hi), (0.5, mid), (1, lo)], 0, 0, 1, 1)
    return (f'<g transform="translate({f(x + 1.2)} {f(y + 1.6)})" opacity="0.6">{baboon(0, 0, s, shade)}</g>'
            f'{baboon(x, y, s, g, hi)}')


# ---------------------------------------------------------------- bords du Nil

def papyrus_stand(seed, x, base_y, h, n, color, rim=None, spread=50, lean=0.22, umbel=(13, 22), rim_side=1, w=2.0, op=1, xlim=None):
    """Un massif de papyrus au premier plan : tiges effilées, ombelles en plumeau, liseré de lumière du côté du soleil."""
    rnd = random.Random(seed)
    stems = []
    for _ in range(n):
        x0 = x + rnd.uniform(-spread / 2, spread / 2)
        hh = h * rnd.uniform(0.55, 1.0)
        ln = rnd.uniform(-lean, lean)
        if xlim:
            xt = min(max(x0 + ln * hh, xlim[0]), xlim[1])
            ln = (xt - x0) / hh
        stems.append((hh, x0, ln))
    stems.sort()
    out = []
    for hh, x0, ln in stems:
        x1, y1 = x0 + ln * hh, base_y - hh
        cx_, cy_ = x0 + ln * hh * 0.25, base_y - hh * 0.55
        out.append(f'<path d="M{f(x0 - w)} {f(base_y)} Q{f(cx_)} {f(cy_)} {f(x1 - 0.6)} {f(y1)} L{f(x1 + 0.6)} {f(y1)} Q{f(cx_ + w * 0.5)} {f(cy_)} {f(x0 + w)} {f(base_y)} Z" fill="{color}"/>')
        r = rnd.uniform(*umbel) * (0.6 + 0.4 * hh / h)
        a0 = math.degrees(math.atan2(ln, 1))
        fan = []
        for k in range(15):
            a = a0 - 62 + 124 * k / 14 + rnd.uniform(-3, 3)
            ex, ey = pt(x1, y1, r * rnd.uniform(0.85, 1.05), a)
            fan.append((ex, ey))
        poly = [(x1, y1)] + fan
        out.append(f'<path d="{_poly(poly)}" fill="{color}" opacity="0.55"/>')
        out.append("".join(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(ex)}" y2="{f(ey)}" stroke="{color}" stroke-width="0.9"/>' for ex, ey in fan))
        out.append("".join(f'<circle cx="{f(ex)}" cy="{f(ey)}" r="1.1" fill="{color}"/>' for ex, ey in fan))
        if rim:
            lit = [p for p in fan if (p[0] - x1) * rim_side > 0]
            out.append("".join(f'<circle cx="{f(ex)}" cy="{f(ey)}" r="1.2" fill="{rim}" opacity="0.85"/>' for ex, ey in lit))
            out.append(f'<path d="M{f(x0 + w * rim_side)} {f(base_y)} Q{f(cx_ + w * 0.6 * rim_side)} {f(cy_)} {f(x1 + 0.6 * rim_side)} {f(y1)}" fill="none" stroke="{rim}" stroke-width="0.7" opacity="0.6"/>')
    return f'<g opacity="{op}">{"".join(out)}</g>'


def agrad(card, name, stops, x1=0, y1=0, x2=0, y2=1):
    """Dégradé linéaire avec opacités : [(offset, couleur, opacité)]."""
    st = "".join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops)
    return card.def_once(name, f'<linearGradient id="{card.id(name)}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{st}</linearGradient>')


def behedety_wing(card, name, cx, cy, side, x_in, half, thick, tiers, coverts, metal=GOLD3, rise=14, feather=6.0):
    """L'aile du disque d'Edfou, plume par plume : une bande de couvertures en écailles, puis des rangs de rémiges
    horizontales, chaque rang d'une couleur, découpé en plumes au bord festonné, la pointe arrondie, relevée vers le bout."""
    hi, mid, lo = metal
    L = half - x_in
    out = []

    def lift(u):
        return rise * (max(u, 0) / L) ** 1.8

    hc = thick * 0.3
    top = cy - thick / 2
    n = len(tiers)
    hs = (thick - hc) / n
    for j in range(n - 1, -1, -1):
        length = L * (1 - 0.14 * j)
        y0 = top + hc + j * hs - 1
        h = hs * 1.25
        fill = tiers[j]
        cnt = max(2, int(length / feather))
        upper = [(cx + side * (x_in + length * t / 16), y0 - lift(length * t / 16)) for t in range(17)]
        tipx, tipy = cx + side * (x_in + length + h * 0.5), y0 + h * 0.5 - lift(length)
        lower = []
        for k in range(cnt, -1, -1):
            u = length * k / cnt
            lower.append((cx + side * (x_in + u), y0 + h - lift(u)))
            if k > 0:
                um = length * (k - 0.5) / cnt
                lower.append((cx + side * (x_in + um), y0 + h + 2.2 - lift(um)))
        d = _poly(upper, False) + f" Q{f(tipx)} {f(upper[-1][1])} {f(tipx)} {f(tipy)} Q{f(tipx)} {f(lower[0][1])} {f(lower[0][0])} {f(lower[0][1])} L" + " L".join(f"{f(x)} {f(y)}" for x, y in lower[1:]) + " Z"
        out.append(f'<path d="{d}" fill="{fill}" stroke="{lo}" stroke-width="0.7"/>')
        for k in range(1, cnt):
            u = length * k / cnt
            out.append(f'<line x1="{f(cx + side * (x_in + u))}" y1="{f(y0 + 1 - lift(u))}" x2="{f(cx + side * (x_in + u - side * 0))}" y2="{f(y0 + h - 1 - lift(u))}" stroke="{lo}" stroke-width="0.55" opacity="0.55"/>')
        out.append(f'<path d="{_poly(upper, False)}" fill="none" stroke="{hi}" stroke-width="1.2"/>')
        vein = _poly([(cx + side * (x_in + length * t / 16), y0 + h * 0.4 - lift(length * t / 16)) for t in range(17)], close=False)
        out.append(f'<path d="{vein}" fill="none" stroke="#FFFFFF" stroke-width="0.8" opacity="0.22"/>')
    cl = L * 0.6
    for rr in range(2):
        yy = top + hc * (0.3 + 0.48 * rr)
        cnt = int(cl / 9)
        for k in range(cnt):
            u = k * 9 + (4.5 if rr else 0)
            x = cx + side * (x_in + u)
            y = yy - lift(u)
            c = coverts[(k + rr) % len(coverts)]
            out.append(f'<path d="M{f(x - side * 4.6)} {f(y - 5)} L{f(x + side * 4.6)} {f(y - 5)} L{f(x + side * 4.6)} {f(y + 2)} '
                       f'Q{f(x)} {f(y + 9)} {f(x - side * 4.6)} {f(y + 2)} Z" fill="{c}" stroke="{lo}" stroke-width="0.6"/>')
    cov_top = _poly([(cx + side * (x_in + u), top - 1 - lift(u)) for u in [cl * t / 10 for t in range(11)]], close=False)
    out.append(f'<path d="{cov_top}" fill="none" stroke="{hi}" stroke-width="2.2" stroke-linecap="round"/>')
    return "".join(out)


def winged_sun(card, name, cx, cy, span, r, thick, tiers, coverts, metal=GOLD3, rise=14, disk=True):
    hi, mid, lo = metal
    wings = (behedety_wing(card, name + "r", cx, cy, 1, r * 0.82, span / 2, thick, tiers, coverts, metal, rise)
             + behedety_wing(card, name + "l", cx, cy, -1, r * 0.82, span / 2, thick, tiers, coverts, metal, rise))
    out = [f'<g filter="{bevel(card, name + "-bv", 0.8, 1.6, sd=4, dy=4, sop=0.55)}">{wings}</g>']
    if disk:
        out.append(sun_disk(card, name + "-sun", cx, cy, r, glow=0))
    return "".join(out)


HAND = ("M-2.6 0 L2.6 0 C3.6 3 4.3 6 4.3 9 L4.3 14.6 Q4.3 15.6 3.4 15.6 Q2.5 15.6 2.5 14.6 L2.5 9.6 L2.2 9.6 L2.2 17.1 "
        "Q2.2 18.1 1.25 18.1 Q0.3 18.1 0.3 17.1 L0.3 9.8 L0 9.8 L0 18.1 Q0 19.1 -0.95 19.1 Q-1.9 19.1 -1.9 18.1 L-1.9 9.8 "
        "L-2.2 9.8 L-2.2 16.6 Q-2.2 17.6 -3.1 17.6 Q-4 17.6 -4 16.6 L-4 8.6 C-4.6 9.6 -6 11 -7 11.2 Q-7.9 11.2 -7.6 10.3 "
        "C-6.6 8.6 -5.2 6.6 -4.4 4.6 C-3.6 2.6 -3 1 -2.6 0 Z")


def aten_hand(x, y, ang, s, color, line=None, holding=None):
    """La main au bout d'un rayon d'Aton, doigts ouverts dans le sens du rayon ; elle tend parfois l'ankh par sa boucle."""
    st = f' stroke="{line}" stroke-width="{f(0.5)}"' if line else ""
    out = f'<path d="{HAND}" fill="{color}"{st}/>'
    if holding:
        out += ankh(0, 15 + 50 * 0.17, 0.17, holding, line, 0.6)
    return f'<g transform="translate({f(x)} {f(y)}) rotate({f(ang + 180)}) scale({f(s)})">{out}</g>'


BABOON2 = ("M-14 0 C-18 -6 -18 -16 -12 -22 C-10 -28 -8 -32 -4 -34 C-2 -38 2 -40 6 -40 C10 -40 12 -38 13 -36 L20 -33 "
           "C22 -32 22 -29 20 -28 L14 -27 C12 -24 10 -22 8 -20 C10 -14 12 -8 12 -2 L16 -2 C18 -2 18 1 16 1 L-14 1 Z")


def adoring_baboon(x, y, s, color, hi=None, shade=None):
    """Un babouin de Thot assis, les deux bras levés vers le soleil qui se lève (hauteur ~48 * s)."""
    arms = (f'<path d="M3 -25 C9 -29 13 -37 15 -47" fill="none" stroke="{color}" stroke-width="3.6" stroke-linecap="round"/>'
            f'<path d="M6 -21 C12 -25 17 -31 20 -41" fill="none" stroke="{color}" stroke-width="3.4" stroke-linecap="round"/>'
            f'<circle cx="15" cy="-48" r="2.2" fill="{color}"/><circle cx="20.5" cy="-42" r="2.1" fill="{color}"/>')
    mane = f'<path d="M-12 -21 C-12 -30 -6 -38 2 -39 L1 -30 C-3 -26 -8 -22 -12 -17 Z" fill="{shade or color}" opacity="0.55"/>'
    light = ""
    if hi:
        light = (f'<path d="M-15 -4 C-18 -12 -16 -20 -12 -23 C-9 -29 -6 -34 -2 -36" fill="none" stroke="{hi}" stroke-width="1.2" opacity="0.8"/>'
                 f'<path d="M15 -47 C13 -38 9 -30 3 -25" fill="none" stroke="{hi}" stroke-width="0.9" opacity="0.7"/>')
    eye = f'<circle cx="11" cy="-34" r="1" fill="#2A0E04" opacity="0.8"/>'
    return f'<g {_tr(x, y, s)}><path d="{BABOON2}" fill="{color}"/>{mane}{arms}{eye}{light}</g>'


def foliage(seed, cx, cy, r, dark="#173E26", mid="#2E6A3E", light="#5FA05A", n=26):
    """Une touffe de feuillage des hautes terres : des feuilles ovales empilées, sombres dessous, éclairées dessus."""
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        a = rnd.uniform(0, 360)
        rr = r * rnd.random() ** 0.6
        x, y = pt(cx, cy, rr, a)
        t = (cy - y + r) / (2 * r)
        col = light if t > 0.66 else (mid if t > 0.33 else dark)
        out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(r * 0.32)}" ry="{f(r * 0.16)}" fill="{col}" transform="rotate({f(rnd.uniform(-60, 60))} {f(x)} {f(y)})"/>')
    out.sort(key=lambda s_: 0)
    return "".join(out)


def baboon_front(x, y, s, color, hi=None, shade=None, face=None):
    """Un babouin de face, assis, les deux bras levés pour acclamer le soleil (la corniche d'Abou Simbel) : hauteur ~44 * s."""
    shade = shade or color
    face = face or shade
    arms = "".join(
        f'<path d="M{m * 8} -21 C{m * 15} -23 {m * 18} -29 {m * 18} -38" fill="none" stroke="{color}" stroke-width="3.6" stroke-linecap="round"/>'
        f'<ellipse cx="{m * 18}" cy="-40.5" rx="2.6" ry="3.2" fill="{color}"/>'
        for m in (-1, 1))
    body = (f'<path d="M-11 0 C-14 -8 -12 -18 -7 -22 L7 -22 C12 -18 14 -8 11 0 Z" fill="{color}"/>'
            f'<ellipse cx="-7" cy="-1.5" rx="6.5" ry="3.4" fill="{color}"/><ellipse cx="7" cy="-1.5" rx="6.5" ry="3.4" fill="{color}"/>')
    cape = f'<ellipse cx="0" cy="-27" rx="12.5" ry="10" fill="{color}"/>'
    head = (f'<ellipse cx="0" cy="-31" rx="7" ry="7.5" fill="{shade}"/>'
            f'<ellipse cx="0" cy="-26.5" rx="4.2" ry="5" fill="{face}"/>'
            f'<circle cx="-2.6" cy="-33" r="0.9" fill="#2A0E04"/><circle cx="2.6" cy="-33" r="0.9" fill="#2A0E04"/>')
    light = ""
    if hi:
        light = (f'<path d="M-12 -27 C-11 -33 -6 -37 0 -37" fill="none" stroke="{hi}" stroke-width="1.1" opacity="0.8"/>'
                 f'<path d="M-18 -38 C-18 -30 -15 -24 -9 -22" fill="none" stroke="{hi}" stroke-width="0.8" opacity="0.6"/>')
    return f'<g {_tr(x, y, s)}>{body}{arms}{cape}{head}{light}</g>'


def sema_tawy(card, name, cx, base_y, s, color, line, hi=None):
    """Le sema-taouy, l'union des Deux Terres : lotus du Sud et papyrus du Nord noués autour du signe du souffle,
    gravé sur les trônes des colosses d'Abou Simbel (hauteur ~110 * s)."""
    out = []
    w = 2.6
    stems = [(-1, -46, -92), (-1, -30, -70), (1, 46, -92), (1, 30, -70)]
    for side, ex, ey in stems:
        out.append(f'<path d="M0 -38 C{side * 10} -46 {ex * 0.6} {ey * 0.7} {ex} {ey}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round"/>')
    for side, ex, ey in stems:
        if side < 0:
            out.append(f'<path d="M{ex} {ey} C{ex - 8} {ey - 6} {ex - 8} {ey - 14} {ex - 2} {ey - 20} C{ex} {ey - 12} {ex + 4} {ey - 12} {ex + 6} {ey - 20} '
                       f'C{ex + 10} {ey - 14} {ex + 8} {ey - 6} {ex} {ey} Z" fill="{color}" stroke="{line}" stroke-width="0.8"/>')
        else:
            out.append(f'<path d="M{ex} {ey} L{ex - 12} {ey - 16} Q{ex} {ey - 24} {ex + 12} {ey - 16} Z" fill="{color}" stroke="{line}" stroke-width="0.8"/>')
            out.append("".join(f'<line x1="{ex}" y1="{ey}" x2="{f(ex + k * 3)}" y2="{f(ey - 18 + abs(k))}" stroke="{line}" stroke-width="0.5" opacity="0.7"/>' for k in range(-3, 4)))
    out.append(f'<rect x="-3.5" y="-78" width="7" height="78" rx="2" fill="{color}" stroke="{line}" stroke-width="0.8"/>')
    out.append("".join(f'<line x1="-3.5" y1="{-70 + k * 8}" x2="3.5" y2="{-70 + k * 8}" stroke="{line}" stroke-width="0.7"/>' for k in range(9)))
    out.append(f'<path d="M0 -76 C-10 -78 -16 -88 -12 -98 C-8 -106 0 -104 0 -98 C0 -104 8 -106 12 -98 C16 -88 10 -78 0 -76 Z" fill="{color}" stroke="{line}" stroke-width="0.8"/>')
    out.append(f'<ellipse cx="0" cy="-38" rx="9" ry="4" fill="none" stroke="{line}" stroke-width="1.6"/><ellipse cx="0" cy="-32" rx="9" ry="4" fill="none" stroke="{line}" stroke-width="1.6"/>')
    if hi:
        out.append(f'<path d="M-2 -76 L-2 -2" stroke="{hi}" stroke-width="1" opacity="0.6"/>')
    return f'<g {_tr(cx, base_y, s)}>{"".join(out)}</g>'
