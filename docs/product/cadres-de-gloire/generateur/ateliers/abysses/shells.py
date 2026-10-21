"""Abysses - le nautile, redessiné : coupe nacrée à cloisons, coquille tigrée, et nautile de lumière
(la même spirale logarithmique, qui devient galaxie au Mythe)."""

import math
import random

from base import f
from kit import poly, smooth, lerp, bevel, metal_grad, nacre_grad, glow, blur, GOLD

B = math.log(3.0) / (2 * math.pi)
TE = 4 * math.pi


def spiral_fn(cx, cy, size, rot=0.0, mirror=False):
    a = size / math.exp(B * TE)
    rr = math.radians(rot)

    def P(th, k=1.0):
        r = a * math.exp(B * th) * k
        x = r * math.cos(th + rr)
        return (cx - x if mirror else cx + x, cy + r * math.sin(th + rr))
    return P


def _aperture(P, bulge=0.32):
    po, pi_ = P(TE), P(TE - 2 * math.pi)
    fwd = P(TE + 0.2)
    fwd_i = P(TE - 2 * math.pi + 0.2)
    mx, my = (po[0] + pi_[0]) / 2, (po[1] + pi_[1]) / 2
    fx, fy = (fwd[0] + fwd_i[0]) / 2 - mx, (fwd[1] + fwd_i[1]) / 2 - my
    l = math.hypot(fx, fy) or 1
    dist = math.hypot(po[0] - pi_[0], po[1] - pi_[1])
    return (mx + fx / l * dist * bulge, my + fy / l * dist * bulge)


def nautilus_cut(card, name, cx, cy, size, rot=0.0, mirror=False, metal=GOLD, per_turn=13, line=None, nacre=None, lit=False, op=1.0, shadow=True, body_turn=0.3):
    """Coupe de nautile : `size` = rayon extérieur à l'ouverture. Loges nacrées, cloisons d'or, siphon, ouverture galbée."""
    P = spiral_fn(cx, cy, size, rot, mirror)
    hi, mid, lo = metal
    edge = line or metal_grad(card, name + "-edge", metal)
    outer = [P(TE - 2 * math.pi + 2 * math.pi * i / 160) for i in range(161)]
    ap = _aperture(P)
    pin = P(TE - 2 * math.pi)
    shape = poly(outer, closed=False) + f" Q{f(ap[0])} {f(ap[1])} {f(pin[0])} {f(pin[1])} Z"
    nac = nacre or nacre_grad(card, name + "-nac", 0, 0, 1, 1)
    out = [f'<path d="{shape}" fill="{nac}"/>']
    tb = TE - 2 * math.pi * body_turn
    body_o = [P(tb + (TE - tb) * i / 40) for i in range(41)]
    body_i = [P(TE - 2 * math.pi - (TE - tb) * i / 40) for i in range(41)]
    cb = _septum_ctrl(P, tb)
    bd = poly(body_o, closed=False) + f" Q{f(ap[0])} {f(ap[1])} {f(pin[0])} {f(pin[1])}" + "".join(f" L{f(x)} {f(y)}" for x, y in body_i[1:]) + f" Q{f(cb[0])} {f(cb[1])} {f(body_o[0][0])} {f(body_o[0][1])} Z"
    hollow = card.rgrad(name + "-hol", [(0, "#FFF6FA", 0.0), (0.45, "#E7C9E6", 0.35), (0.8, "#6E5C9A", 0.55), (1, "#2A2350", 0.75)], 0.75, 0.3, 0.95)
    sheen = card.grad(name + "-shn", [(0, "#9FF4FF"), (0.35, "#FFD6F0"), (0.7, "#FFF4D6"), (1, "#B9A7FF")], 0, 0, 1, 1)
    out.append(f'<path d="{bd}" fill="{sheen}" opacity="0.55"/><path d="{bd}" fill="{hollow}"/>')
    step = 2 * math.pi / per_turn
    th = tb
    septa = []
    while th > 1.2:
        septa.append(th)
        th -= step
    shades = [card.rgrad(name + f"-ch{k}", [(0, "#FFFFFF", 0.0), (0.45, c, 0.2), (1, c, 0.62)], 0.95, 0.5, 1.0) for k, c in enumerate(("#9C6BD6", "#3FA7C9", "#D67BA8"))]
    for i in range(len(septa) - 1):
        t0, t1 = septa[i], septa[i + 1]
        arc_o = [P(t0 - (t0 - t1) * j / 8) for j in range(9)]
        arc_i = [P(t1 - 2 * math.pi + (t0 - t1) * j / 8) for j in range(9)]
        c0 = _septum_ctrl(P, t0)
        c1 = _septum_ctrl(P, t1)
        d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in arc_o)
        d += f" Q{f(c1[0])} {f(c1[1])} {f(arc_i[0][0])} {f(arc_i[0][1])}"
        d += "".join(f" L{f(x)} {f(y)}" for x, y in arc_i[1:])
        d += f" Q{f(c0[0])} {f(c0[1])} {f(arc_o[0][0])} {f(arc_o[0][1])} Z"
        out.append(f'<path d="{d}" fill="{shades[i % 3]}"/>')
    for t in septa:
        po, pi_ = P(t), P(t - 2 * math.pi)
        c = _septum_ctrl(P, t)
        dist = math.hypot(po[0] - pi_[0], po[1] - pi_[1])
        out.append(f'<path d="M{f(po[0])} {f(po[1])} Q{f(c[0])} {f(c[1])} {f(pi_[0])} {f(pi_[1])}" fill="none" stroke="{edge}" stroke-width="{f(max(0.7, dist * 0.065))}" stroke-linecap="round"/>')
        out.append(f'<path d="M{f(po[0])} {f(po[1])} Q{f(c[0])} {f(c[1])} {f(pi_[0])} {f(pi_[1])}" fill="none" stroke="#FFFFFF" stroke-width="{f(max(0.3, dist * 0.015))}" opacity="0.7" transform="translate(-0.6 -0.6)"/>')
    sip = []
    for i in range(160):
        t = tb - i * (tb - 1.4) / 159
        po, pi_ = P(t), P(t - 2 * math.pi)
        sip.append((lerp(pi_[0], po[0], 0.42), lerp(pi_[1], po[1], 0.42)))
    out.append(f'<path d="{poly(sip, False)}" fill="none" stroke="{mid}" stroke-width="{f(size * 0.02)}" stroke-dasharray="{f(size * 0.025)} {f(size * 0.035)}" stroke-linecap="round" opacity="0.85"/>')
    wall = [P(0.6 + (TE - 0.6) * i / 300) for i in range(301)]
    out.append(f'<path d="{poly(wall, False)}" fill="none" stroke="{edge}" stroke-width="{f(size * 0.03)}" stroke-linecap="round"/>')
    out.append(f'<path d="{shape}" fill="none" stroke="{edge}" stroke-width="{f(size * 0.05)}" stroke-linejoin="round"/>')
    out.append(f'<path d="{poly(outer[40:130], False)}" fill="none" stroke="#FFFFFF" stroke-width="{f(size * 0.012)}" opacity="0.8"/>')
    filt = bevel(card, name + "-bv", 1.1, 2.4, 4 if shadow else 0, 6, 0.55 if shadow else 0, shadow=shadow)
    if lit:
        filt = glow(card, name + "-gl", size * 0.04, 1)
    return f'<g opacity="{f(op)}" filter="{filt}">{"".join(out)}</g>'


def _septum_ctrl(P, t):
    po, pi_ = P(t), P(t - 2 * math.pi)
    back = P(t - 0.35)
    mx, my = (po[0] + pi_[0]) / 2, (po[1] + pi_[1]) / 2
    bm = P(t - 2 * math.pi - 0.35)
    tx, ty = (back[0] + bm[0]) / 2 - mx, (back[1] + bm[1]) / 2 - my
    return (mx + tx * 1.1, my + ty * 1.1)


def nautilus_shell(card, name, cx, cy, size, rot=0.0, mirror=False, metal=GOLD, stripe="#A2441E", base=("#FFF9EC", "#F3E1C0", "#C9A27A")):
    """Nautile vu de profil : coquille crème tigrée de flammes rousses, ombilic nacré."""
    P = spiral_fn(cx, cy, size, rot, mirror)
    outer = [P(TE - 2 * math.pi + 2 * math.pi * i / 160) for i in range(161)]
    ap = _aperture(P, 0.22)
    pin = P(TE - 2 * math.pi)
    shape = poly(outer, closed=False) + f" Q{f(ap[0])} {f(ap[1])} {f(pin[0])} {f(pin[1])} Z"
    a, b, c = base
    um = P(TE - 2 * math.pi, 0.0)
    g = card.rgrad(name + "-g", [(0, a, 1), (0.6, b, 1), (1, c, 1)], 0.5, 0.5, 0.65)
    out = [f'<path d="{shape}" fill="{g}"/>']
    clipid = card.id(name + "-clip")
    card.def_once(name + "-clip", f'<clipPath id="{clipid}"><path d="{shape}"/></clipPath>')
    stripes = []
    rnd = random.Random(3)
    for i in range(22):
        t = TE - 2 * math.pi + 0.15 + i * 0.2
        if t > TE - 1.3:
            break
        po = P(t)
        pin = P(t - 0.7, 0.16)
        mid = P(t - math.pi * 0.08, 0.72)
        fade = 1 - (t - (TE - 2 * math.pi)) / (2 * math.pi - 1.3)
        wob = [(lerp(pin[0], po[0], k / 10) + 2.5 * math.sin(k * 1.4 + i), lerp(pin[1], po[1], k / 10) + 2.5 * math.cos(k * 1.4 + i)) for k in range(11)]
        stripes.append(f'<path d="{smooth(wob, closed=False, n=4)}" fill="none" stroke="{stripe}" stroke-width="{f(size * (0.05 + 0.03 * rnd.random()))}" stroke-linecap="round" opacity="{f(0.25 + 0.7 * fade)}"/>')
    out.append(f'<g clip-path="url(#{clipid})">{"".join(stripes)}</g>')
    out.append(f'<path d="{shape}" fill="{card.rgrad(name + "-sh", [(0.55, "#000000", 0), (1, "#3A1A08", 0.35)], 0.45, 0.45, 0.6)}"/>')
    nac = nacre_grad(card, name + "-um", 0, 0, 1, 1)
    ux, uy = P(TE, 0.0)
    out.append(f'<circle cx="{f(ux)}" cy="{f(uy)}" r="{f(size * 0.09)}" fill="{card.rgrad(name + "-cal", [(0, "#8A6A8A", 1), (0.7, "#3A2440", 1), (1, "#1A0E1E", 1)], 0.4, 0.35, 0.7)}"/>')
    edge = metal_grad(card, name + "-edge", metal)
    out.append(f'<path d="{shape}" fill="none" stroke="{edge}" stroke-width="{f(size * 0.04)}"/>')
    out.append(f'<path d="M{f(P(TE)[0])} {f(P(TE)[1])} Q{f(ap[0])} {f(ap[1])} {f(pin[0])} {f(pin[1])}" fill="none" stroke="#5A2A10" stroke-width="{f(size * 0.05)}" stroke-linecap="round" opacity="0.6"/>')
    return f'<g filter="{bevel(card, name + "-bv", 1.1, 2.4, 4, 6, 0.55)}">{"".join(out)}</g>'


def nautilus_light(card, name, cx, cy, size, rot=0.0, mirror=False, col="#9FF4FF", per_turn=12, w=1.2, op=1.0):
    """Le nautile tracé en lumière (Oracle, Légende) : mur et cloisons en filaments lumineux."""
    P = spiral_fn(cx, cy, size, rot, mirror)
    out = []
    wall = [P(0.6 + (TE - 0.6) * i / 300) for i in range(301)]
    outer = [P(TE - 2 * math.pi + 2 * math.pi * i / 160) for i in range(161)]
    out.append(f'<path d="{poly(outer)}" fill="{card.rgrad(name + "-f", [(0, col, 0.02), (1, col, 0.16)])}"/>')
    out.append(f'<path d="{poly(wall, False)}" fill="none" stroke="{col}" stroke-width="{f(w * 1.4)}"/>')
    out.append(f'<path d="{poly(outer)}" fill="none" stroke="{col}" stroke-width="{f(w * 1.8)}"/>')
    th = TE - 2 * math.pi / 3
    while th > 1.2:
        po, pi_ = P(th), P(th - 2 * math.pi)
        c = _septum_ctrl(P, th)
        out.append(f'<path d="M{f(po[0])} {f(po[1])} Q{f(c[0])} {f(c[1])} {f(pi_[0])} {f(pi_[1])}" fill="none" stroke="{col}" stroke-width="{f(w)}" opacity="0.85"/>')
        out.append(f'<circle cx="{f(po[0])}" cy="{f(po[1])}" r="{f(w * 1.6)}" fill="#FFFFFF"/>')
        th -= 2 * math.pi / per_turn
    return f'<g opacity="{f(op)}" filter="{glow(card, name + "-g", 2.4, 2)}">{"".join(out)}</g>'


def spiral_points(cx, cy, size, rot=0.0, mirror=False, t0=0.6, t1=TE, n=200):
    P = spiral_fn(cx, cy, size, rot, mirror)
    return [P(t0 + (t1 - t0) * i / (n - 1)) for i in range(n)]
