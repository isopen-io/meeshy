"""Motifs de l'Empire céleste (créations originales) : nuages, flots, lanternes, fleurs, bambous, grues, koïs, éventails."""

import math
import random

from common import *  # noqa: F401,F403


# ---------------------------------------------------------------- nuages porte-bonheur (xiangyun)

CLOUD_LOBES = [(0, 0, 1.0, 0.9), (1.05, -0.42, 0.74, 1.4), (1.9, 0.04, 0.56, 0.4), (-0.9, 0.22, 0.5, 2.6)]


def cloud(card, cx, cy, s, fill, line, flip=False, lw=1.6, tail=True, hi=None, op=1):
    """Un nuage à volutes : lobes fondus en une silhouette, spirales gravées, une traîne effilée."""
    lobes = [(cx + (-x if flip else x) * s, cy + y * s, r * s, a) for x, y, r, a in CLOUD_LOBES]
    base = f'<ellipse cx="{fmt(cx + (-0.55 if flip else 0.55) * s)}" cy="{fmt(cy + 0.42 * s)}" rx="{fmt(1.75 * s)}" ry="{fmt(0.5 * s)}"/>'
    shapes = "".join(f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(r)}"/>' for x, y, r, _ in lobes) + base
    out = []
    if tail:
        k = -1 if flip else 1
        sp, _ = spine([(cx + k * 1.9 * s, cy + 0.62 * s), (cx + k * 2.9 * s, cy + 0.7 * s), (cx + k * 3.9 * s, cy + 0.32 * s), (cx + k * 4.4 * s, cy - 0.15 * s)], 40)
        td = ribbon_d(sp, lambda t: 0.5 * s * (1 - t) ** 1.2 + 0.4)
        out.append(f'<path d="{td}" fill="{fill}" stroke="{line}" stroke-width="{fmt(lw)}"/>')
    out.append(f'<g fill="{line}" stroke="{line}" stroke-width="{fmt(lw * 2)}">{shapes}</g>')
    out.append(f'<g fill="{fill}">{shapes}</g>')
    for x, y, r, a in lobes:
        pts = spiral_pts(x, y, r * 0.08, r * 0.7, a, 1.35, 40, cw=not flip)
        out.append(f'<path d="{poly_d(pts, False)}" fill="none" stroke="{line}" stroke-width="{fmt(lw)}" stroke-linecap="round"/>')
        if hi:
            pts2 = spiral_pts(x, y, r * 0.18, r * 0.82, a + 0.5, 0.6, 20, cw=not flip)
            out.append(f'<path d="{poly_d(pts2, False)}" fill="none" stroke="{hi}" stroke-width="{fmt(lw * 0.7)}" stroke-linecap="round" opacity="0.8"/>')
    return f'<g opacity="{op}">{"".join(out)}</g>'


# ---------------------------------------------------------------- motifs de surface

def seigaiha(card, name, r, bg, line, rings=4, lw=1.2, extra_line=None):
    """Motif des vagues de la mer bleue : éventails concentriques en écailles."""
    rings_svg = lambda cx, cy: (
        f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r)}" fill="{bg}"/>' +
        "".join(f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r * (1 - i / rings) - lw)}" fill="none" stroke="{(extra_line if (extra_line and i == 0) else line)}" stroke-width="{lw}"/>'
                for i in range(rings))
    )
    centers = [(r, -r / 2), (0, 0), (2 * r, 0), (r, r / 2), (0, r), (2 * r, r), (r, 1.5 * r)]
    body = "".join(rings_svg(x, y) for x, y in centers)
    card.def_once(name, f'<pattern id="{card.id(name)}" width="{fmt(2 * r)}" height="{fmt(r)}" patternUnits="userSpaceOnUse">{body}</pattern>')
    return f"url(#{card.id(name)})"


def fret(card, name, u, line, bg=None, lw=1.6):
    """Le motif « hui » : la grecque chinoise en spirale carrée, répétée en frise."""
    d = (f"M0 {fmt(u)} L0 {fmt(u * 0.1)} L{fmt(u * 0.9)} {fmt(u * 0.1)} L{fmt(u * 0.9)} {fmt(u * 0.75)} L{fmt(u * 0.3)} {fmt(u * 0.75)} "
         f"L{fmt(u * 0.3)} {fmt(u * 0.38)} L{fmt(u * 0.62)} {fmt(u * 0.38)} L{fmt(u * 0.62)} {fmt(u * 0.55)} M0 {fmt(u * 0.95)} L{fmt(u)} {fmt(u * 0.95)}")
    b = f'<rect width="{fmt(u)}" height="{fmt(u)}" fill="{bg}"/>' if bg else ""
    card.def_once(name, f'<pattern id="{card.id(name)}" width="{fmt(u)}" height="{fmt(u)}" patternUnits="userSpaceOnUse">{b}'
                        f'<path d="{d}" fill="none" stroke="{line}" stroke-width="{lw}" stroke-linecap="square"/></pattern>')
    return f"url(#{card.id(name)})"


def kikko(card, name, r, bg, line, lw=1.0, dot=None):
    """Écaille de tortue : le pavage d'hexagones (et, vu de près, le réseau d'un cristal)."""
    w = r * math.sqrt(3)
    h = r * 3
    def hexa(cx, cy):
        return "M" + " L".join(f"{fmt(cx + r * math.sin(math.radians(60 * i)))} {fmt(cy - r * math.cos(math.radians(60 * i)))}" for i in range(6)) + "Z"
    d = " ".join(hexa(x, y) for x, y in ((0, 0), (w, 0), (w / 2, 1.5 * r), (0, 3 * r), (w, 3 * r)))
    b = f'<rect width="{fmt(w)}" height="{fmt(h)}" fill="{bg}"/>' if bg else ""
    dots = "".join(f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(r * 0.14)}" fill="{dot}"/>' for x, y in ((0, 0), (w, 0), (w / 2, 1.5 * r), (0, 3 * r), (w, 3 * r))) if dot else ""
    card.def_once(name, f'<pattern id="{card.id(name)}" width="{fmt(w)}" height="{fmt(h)}" patternUnits="userSpaceOnUse">{b}'
                        f'<path d="{d}" fill="none" stroke="{line}" stroke-width="{lw}"/>{dots}</pattern>')
    return f"url(#{card.id(name)})"


def asanoha(card, name, s, bg, line, lw=0.8):
    """Feuille de chanvre : l'étoile à six branches tissée de triangles (géométrie sacrée du Japon)."""
    w, h = s * math.sqrt(3), s * 3
    pts = [(0, 0), (w, 0), (w / 2, 1.5 * s), (0, 3 * s), (w, 3 * s)]
    segs = []
    for cx, cy in pts:
        for i in range(6):
            a = math.radians(60 * i)
            x, y = cx + s * math.sin(a), cy - s * math.cos(a)
            segs.append(f"M{fmt(cx)} {fmt(cy)} L{fmt(x)} {fmt(y)}")
            a2 = math.radians(60 * i + 30)
            m = s / math.sqrt(3)
            x2, y2 = cx + m * math.sin(a2), cy - m * math.cos(a2)
            segs.append(f"M{fmt(x2)} {fmt(y2)} L{fmt(x)} {fmt(y)}")
            x3, y3 = cx + s * math.sin(a + math.radians(60)), cy - s * math.cos(a + math.radians(60))
            segs.append(f"M{fmt(x2)} {fmt(y2)} L{fmt(x3)} {fmt(y3)} M{fmt(x)} {fmt(y)} L{fmt(x3)} {fmt(y3)}")
    b = f'<rect width="{fmt(w)}" height="{fmt(h)}" fill="{bg}"/>' if bg else ""
    card.def_once(name, f'<pattern id="{card.id(name)}" width="{fmt(w)}" height="{fmt(h)}" patternUnits="userSpaceOnUse">{b}'
                        f'<path d="{" ".join(segs)}" fill="none" stroke="{line}" stroke-width="{lw}"/></pattern>')
    return f"url(#{card.id(name)})"


def cloud_pattern(card, name, u, bg, line, lw=1):
    """Semis de petits nuages en volute (fond de brocart)."""
    d = []
    for cx, cy, fl in ((u * 0.25, u * 0.3, False), (u * 0.75, u * 0.8, True)):
        k = -1 if fl else 1
        d.append(f"M{fmt(cx - k * u * 0.14)} {fmt(cy + u * 0.06)} q{fmt(k * u * 0.02)} {fmt(-u * 0.12)} {fmt(k * u * 0.11)} {fmt(-u * 0.08)} "
                 f"q{fmt(k * u * 0.06)} {fmt(-u * 0.09)} {fmt(k * u * 0.14)} {fmt(-u * 0.01)} q{fmt(k * u * 0.08)} {fmt(u * 0.0)} {fmt(k * u * 0.07)} {fmt(u * 0.08)} "
                 f"M{fmt(cx - k * u * 0.03)} {fmt(cy - u * 0.02)} a{fmt(u * 0.035)} {fmt(u * 0.035)} 0 1 {1 if k > 0 else 0} {fmt(k * u * 0.05)} {fmt(u * 0.03)}")
    b = f'<rect width="{fmt(u)}" height="{fmt(u)}" fill="{bg}"/>' if bg else ""
    card.def_once(name, f'<pattern id="{card.id(name)}" width="{fmt(u)}" height="{fmt(u)}" patternUnits="userSpaceOnUse">{b}'
                        f'<path d="{" ".join(d)}" fill="none" stroke="{line}" stroke-width="{lw}" stroke-linecap="round"/></pattern>')
    return f"url(#{card.id(name)})"


def lacquer(card, x, y, w, h, name=None, base=VERM, hi=VERM_HI, lo=VERM_D, rx=0, extra=""):
    """Un panneau de laque vermillon : dégradé profond, reflet satiné en diagonale."""
    g = card.grad(name or nid("lq"), [(0, lo), (0.35, base), (0.55, hi), (0.75, base), (1, lo)], 0, 0, 1, 1)
    return f'<rect x="{fmt(x)}" y="{fmt(y)}" width="{fmt(w)}" height="{fmt(h)}" rx="{rx}" fill="{g}" {extra}/>'


# ---------------------------------------------------------------- lanternes

def lantern(card, cx, cy, s, body="#E0331F", dark="#7A0E08", cap=None, glow=True, cord=40, tassel=True, rot=0, light="#FFD27A"):
    """Lanterne de papier ronde : côtes, coiffes d'or, gland de soie, halo."""
    cap = cap or card.metal("gold")[0]
    rx, ry = 24 * s, 27 * s
    gb = card.rgrad(f"lan-{body}", [(0, "#FFE7A8", 1), (0.35, body, 1), (1, dark, 1)], 0.42, 0.42, 0.62)
    out = []
    if glow:
        out.append(f'<circle cx="0" cy="0" r="{fmt(rx * 2.3)}" fill="{card.rgrad("lan-glow", [(0, light, 0.55), (1, light, 0)])}"/>')
    if cord:
        out.append(f'<line x1="0" y1="{fmt(-ry - 6 * s)}" x2="0" y2="{fmt(-ry - cord * s)}" stroke="#2A1408" stroke-width="{fmt(1.4 * s)}"/>')
    out.append(f'<ellipse cx="0" cy="0" rx="{fmt(rx)}" ry="{fmt(ry)}" fill="{gb}"/>')
    for k in (0.28, 0.58, 0.85):
        out.append(f'<ellipse cx="0" cy="0" rx="{fmt(rx * k)}" ry="{fmt(ry)}" fill="none" stroke="{dark}" stroke-width="{fmt(0.9 * s)}" opacity="0.55"/>')
    out.append(f'<ellipse cx="0" cy="0" rx="{fmt(rx)}" ry="{fmt(ry)}" fill="none" stroke="{dark}" stroke-width="{fmt(1.2 * s)}" opacity="0.8"/>')
    out.append(f'<ellipse cx="{fmt(-rx * 0.35)}" cy="{fmt(-ry * 0.35)}" rx="{fmt(rx * 0.22)}" ry="{fmt(ry * 0.4)}" fill="#FFFFFF" opacity="0.22"/>')
    for yy, ww in ((-ry, 0.55), (ry, 0.5)):
        out.append(f'<rect x="{fmt(-rx * ww)}" y="{fmt(yy - 4 * s)}" width="{fmt(2 * rx * ww)}" height="{fmt(8 * s)}" rx="{fmt(2 * s)}" fill="{cap}" stroke="#6A3E08" stroke-width="{fmt(0.6 * s)}"/>')
    if tassel:
        out.append(f'<circle cx="0" cy="{fmt(ry + 8 * s)}" r="{fmt(3.2 * s)}" fill="{cap}"/>')
        for i in range(-3, 4):
            out.append(f'<line x1="{fmt(i * 0.6 * s)}" y1="{fmt(ry + 10 * s)}" x2="{fmt(i * 1.6 * s)}" y2="{fmt(ry + 30 * s)}" stroke="{body}" stroke-width="{fmt(1.3 * s)}"/>')
        out.append(f'<rect x="{fmt(-3 * s)}" y="{fmt(ry + 12 * s)}" width="{fmt(6 * s)}" height="{fmt(3 * s)}" fill="{cap}"/>')
    return tf("".join(out), cx, cy, rot)


def palace_lantern(card, cx, cy, s, panel="#FBE3B0", frame="#7A120C", glow=True):
    """Lanterne de palais hexagonale : cadre de laque, panneaux de soie peinte, couronne et glands rouges."""
    gold = card.metal("gold")[0]
    out = []
    if glow:
        out.append(f'<circle cx="0" cy="0" r="{fmt(70 * s)}" fill="{card.rgrad("pl-glow", [(0, "#FFC46A", 0.5), (1, "#FFC46A", 0)])}"/>')
    out.append(f'<line x1="0" y1="{fmt(-62 * s)}" x2="0" y2="{fmt(-200 * s)}" stroke="#2A0E06" stroke-width="{fmt(2 * s)}"/>')
    out.append(f'<path d="M{fmt(-30 * s)} {fmt(-40 * s)} L{fmt(-16 * s)} {fmt(-60 * s)} L{fmt(16 * s)} {fmt(-60 * s)} L{fmt(30 * s)} {fmt(-40 * s)}Z" fill="{frame}" stroke="{gold}" stroke-width="{fmt(1.5 * s)}"/>')
    for i in range(-2, 3):
        out.append(f'<path d="M{fmt(i * 14 * s)} {fmt(-42 * s)} q{fmt(4 * s)} {fmt(-10 * s)} {fmt(10 * s)} {fmt(-12 * s)}" fill="none" stroke="{gold}" stroke-width="{fmt(1.4 * s)}"/>')
    pg = card.grad("pl-panel", [(0, "#FFF6DC"), (0.5, panel), (1, "#E8B070")], 0, 0, 1, 0)
    out.append(f'<path d="M{fmt(-34 * s)} {fmt(-40 * s)} L{fmt(34 * s)} {fmt(-40 * s)} L{fmt(30 * s)} {fmt(40 * s)} L{fmt(-30 * s)} {fmt(40 * s)}Z" fill="{pg}"/>')
    for x in (-34, -12, 12, 34):
        out.append(f'<path d="M{fmt(x * s)} {fmt(-40 * s)} L{fmt(x * 0.88 * s)} {fmt(40 * s)}" stroke="{frame}" stroke-width="{fmt(3.4 * s)}"/>')
    out.append(cloud(card, -1 * s, -6 * s, 4.2 * s, "none", "#B0281A", lw=0.9 * s, tail=False))
    out.append(f'<path d="M{fmt(-36 * s)} {fmt(-44 * s)} L{fmt(36 * s)} {fmt(-44 * s)} L{fmt(36 * s)} {fmt(-38 * s)} L{fmt(-36 * s)} {fmt(-38 * s)}Z" fill="{gold}"/>')
    out.append(f'<path d="M{fmt(-32 * s)} {fmt(38 * s)} L{fmt(32 * s)} {fmt(38 * s)} L{fmt(24 * s)} {fmt(52 * s)} L{fmt(-24 * s)} {fmt(52 * s)}Z" fill="{frame}" stroke="{gold}" stroke-width="{fmt(1.5 * s)}"/>')
    for x in (-24, 0, 24):
        out.append(f'<circle cx="{fmt(x * s)}" cy="{fmt(56 * s)}" r="{fmt(3 * s)}" fill="{gold}"/>')
        for k in range(-2, 3):
            out.append(f'<line x1="{fmt(x * s + k * 0.6 * s)}" y1="{fmt(58 * s)}" x2="{fmt(x * s + k * 1.8 * s)}" y2="{fmt(92 * s)}" stroke="#C2201A" stroke-width="{fmt(1.5 * s)}"/>')
    return tf("".join(out), cx, cy)


def sky_lantern(card, cx, cy, s, op=1):
    """Lanterne céleste qu'on lâche dans la nuit : trapèze de papier allumé de l'intérieur."""
    g = card.grad("sky-lan", [(0, "#FFE9B0"), (0.6, "#FFB24A"), (1, "#E2611E")])
    return tf(
        f'<circle cx="0" cy="2" r="22" fill="{card.rgrad("sky-glow", [(0, "#FFB860", 0.55), (1, "#FFB860", 0)])}"/>'
        f'<path d="M-7 -10 L7 -10 L9 9 Q0 12 -9 9Z" fill="{g}"/><ellipse cx="0" cy="8" rx="4" ry="2" fill="#FFF6D0"/>'
        f'<path d="M-7 -10 L7 -10" stroke="#C2521A" stroke-width="0.8"/>', cx, cy, 0, s, op=op)


# ---------------------------------------------------------------- fleurs, branches, bambous

def blossom(card, cx, cy, r, rot=0, petal="#FDE3EA", edge="#EE8FAE", center="#C2185B", op=1):
    gp = card.rgrad(f"bl-{petal}-{edge}", [(0, "#FFFFFF", 1), (0.45, petal, 1), (1, edge, 1)], 0.5, 1.0, 1.0)
    pd = (f"M0 0 C{fmt(-0.62 * r)} {fmt(-0.3 * r)} {fmt(-0.55 * r)} {fmt(-r)} {fmt(-0.14 * r)} {fmt(-r)} L0 {fmt(-0.84 * r)} "
          f"L{fmt(0.14 * r)} {fmt(-r)} C{fmt(0.55 * r)} {fmt(-r)} {fmt(0.62 * r)} {fmt(-0.3 * r)} 0 0Z")
    petals = "".join(f'<path d="{pd}" fill="{gp}" transform="rotate({72 * i})"/>' for i in range(5))
    stam = "".join(
        f'<line x1="0" y1="0" x2="{fmt(pt(0, 0, r * 0.42, a)[0])}" y2="{fmt(pt(0, 0, r * 0.42, a)[1])}" stroke="{center}" stroke-width="{fmt(r * 0.05)}"/>'
        f'<circle cx="{fmt(pt(0, 0, r * 0.45, a)[0])}" cy="{fmt(pt(0, 0, r * 0.45, a)[1])}" r="{fmt(r * 0.07)}" fill="#F7C64A"/>'
        for a in range(0, 360, 36))
    return tf(f'{petals}<circle r="{fmt(r * 0.16)}" fill="{center}" opacity="0.8"/>{stam}', cx, cy, rot, op=op)


def petal(cx, cy, r, rot, color="#F8BBD0", op=0.9):
    d = f"M0 0 C{fmt(-0.6 * r)} {fmt(-0.3 * r)} {fmt(-0.5 * r)} {fmt(-r)} {fmt(-0.1 * r)} {fmt(-r)} L0 {fmt(-0.85 * r)} L{fmt(0.1 * r)} {fmt(-r)} C{fmt(0.5 * r)} {fmt(-r)} {fmt(0.6 * r)} {fmt(-0.3 * r)} 0 0Z"
    return tf(f'<path d="{d}" fill="{color}"/>', cx, cy, rot, op=op)


def branch(card, pts, w0, w1, color="#2B1710", hi="#5A3424", n=80):
    sp, _ = spine(pts, n)
    d = ribbon_d(sp, lambda t: lerp(w0, w1, t))
    hl = poly_d(offset(sp, lambda t: -lerp(w0, w1, t) * 0.25), False)
    return f'<path d="{d}" fill="{color}"/><path d="{hl}" fill="none" stroke="{hi}" stroke-width="{fmt(max(0.6, w1 * 0.4))}" opacity="0.6"/>'


def sakura_branch(card, pts, w0, seed, n_flowers=14, r=(6, 11), twigs=4, petal_c="#FDE3EA", edge="#EE8FAE"):
    """Une branche de cerisier : bois sombre, rameaux, fleurs ouvertes et boutons."""
    rnd = random.Random(seed)
    out = [branch(card, pts, w0, 1.2)]
    sp, _ = spine(pts, 60)
    flowers = []
    for k in range(twigs):
        i = rnd.randint(8, 50)
        x, y, a = sp[i]
        side = rnd.choice((-1, 1))
        b = a + side * rnd.uniform(0.6, 1.1)
        L = rnd.uniform(30, 60)
        tw = [(x, y), (x + math.cos(b) * L * 0.5, y + math.sin(b) * L * 0.5 + rnd.uniform(-6, 6)), (x + math.cos(b) * L, y + math.sin(b) * L)]
        out.append(branch(card, tw, w0 * 0.35, 0.8, n=24))
        flowers.append(tw[-1])
        flowers.append(tw[1])
    for _ in range(n_flowers):
        x, y, a = sp[rnd.randint(10, 59)]
        flowers.append((x + rnd.uniform(-8, 8), y + rnd.uniform(-8, 8)))
    for x, y in flowers:
        rr = rnd.uniform(*r)
        if rnd.random() < 0.2:
            out.append(f'<ellipse cx="{fmt(x)}" cy="{fmt(y)}" rx="{fmt(rr * 0.35)}" ry="{fmt(rr * 0.5)}" fill="{edge}" transform="rotate({rnd.randint(0, 180)} {fmt(x)} {fmt(y)})"/>')
        else:
            out.append(blossom(card, x, y, rr, rnd.randint(0, 72), petal_c, edge))
    return "".join(out)


def bamboo(card, x, y0, y1, w, seed, color="#3E8E52", dark="#1C4A2A", leaves=True, lean=0):
    rnd = random.Random(seed)
    g = card.grad(f"bam-{color}", [(0, dark), (0.35, color), (0.55, "#9CD88E"), (0.8, color), (1, dark)], 0, 0, 1, 0)
    out = [f'<path d="M{fmt(x - w / 2)} {fmt(y1)} L{fmt(x - w / 2 + lean)} {fmt(y0)} L{fmt(x + w / 2 + lean)} {fmt(y0)} L{fmt(x + w / 2)} {fmt(y1)}Z" fill="{g}"/>']
    yy = y1
    while yy > y0 + 20:
        yy -= rnd.uniform(46, 64)
        xx = x + lean * (y1 - yy) / (y1 - y0)
        out.append(f'<path d="M{fmt(xx - w / 2 - 1)} {fmt(yy)} Q{fmt(xx)} {fmt(yy + 3)} {fmt(xx + w / 2 + 1)} {fmt(yy)}" fill="none" stroke="{dark}" stroke-width="2.2"/>'
                   f'<path d="M{fmt(xx - w / 2)} {fmt(yy - 2.5)} Q{fmt(xx)} {fmt(yy + 0.5)} {fmt(xx + w / 2)} {fmt(yy - 2.5)}" fill="none" stroke="#CDEFC0" stroke-width="1" opacity="0.7"/>')
        if leaves and rnd.random() < 0.7:
            out.append(bamboo_leaves(card, xx + rnd.choice((-1, 1)) * w * 0.4, yy, rnd.uniform(0.8, 1.15), rnd.randint(0, 999), color, dark))
    return "".join(out)


def bamboo_leaves(card, x, y, s, seed, color="#3E8E52", dark="#1C4A2A"):
    rnd = random.Random(seed)
    g = card.grad(f"leaf-{color}", [(0, "#8ACB7C"), (0.5, color), (1, dark)], 0, 0, 1, 1)
    out = []
    side = rnd.choice((-1, 1))
    for i in range(rnd.randint(3, 5)):
        a = side * rnd.uniform(20, 75) + rnd.uniform(-10, 10) + (180 if side < 0 else 0) * 0
        L = rnd.uniform(26, 40) * s
        wl = L * 0.16
        d = f"M0 0 Q{fmt(L * 0.45)} {fmt(-wl)} {fmt(L)} 0 Q{fmt(L * 0.45)} {fmt(wl)} 0 0Z"
        rot = (a if side > 0 else 180 - a) + rnd.uniform(-15, 25)
        out.append(tf(f'<path d="{d}" fill="{g}"/><path d="M0 0 L{fmt(L * 0.9)} 0" stroke="{dark}" stroke-width="0.6" opacity="0.6"/>', x, y, rot))
    return "".join(out)


# ---------------------------------------------------------------- oiseaux et poissons

def crane(card, cx, cy, s, flip=False, rot=0, white="#FBFBF7", ink="#141418", crown="#E2231A", wing_up=1.0, op=1):
    """Grue du Japon en vol (création) : ailes blanches aux rémiges noires, cou noir, calotte rouge."""
    u = wing_up
    far = (f"M-6 -4 C-14 {fmt(-30 * u)} -34 {fmt(-58 * u)} -64 {fmt(-78 * u)} C-58 {fmt(-62 * u)} -60 {fmt(-58 * u)} -54 {fmt(-48 * u)} "
           f"C-50 {fmt(-40 * u)} -44 {fmt(-30 * u)} -26 -6Z")
    near = (f"M-10 -2 C-8 {fmt(-36 * u)} 4 {fmt(-70 * u)} -6 {fmt(-104 * u)} C2 {fmt(-96 * u)} 4 {fmt(-92 * u)} 8 {fmt(-82 * u)} "
            f"C12 {fmt(-72 * u)} 16 {fmt(-50 * u)} 12 -4Z")
    out = [f'<g fill="{white}" opacity="0.92">'
           f'<path d="{far}"/></g>',
           f'<path d="M-22 -8 C-30 {fmt(-26 * u)} -48 {fmt(-46 * u)} -64 {fmt(-78 * u)} C-58 {fmt(-62 * u)} -58 {fmt(-58 * u)} -54 {fmt(-48 * u)} C-48 {fmt(-36 * u)} -40 {fmt(-24 * u)} -26 -6Z" fill="{ink}" opacity="0.85"/>',
           ]
    for i in range(5):
        a = -0.3 - i * 0.12
        out.append(f'<path d="M{fmt(-56 - i * 1.5)} {fmt((-60 + i * 4) * u)} l{fmt(-8 * math.cos(a))} {fmt(-10 * u)}" stroke="{ink}" stroke-width="2.4" stroke-linecap="round"/>')
    out += [
        f'<path d="M-46 4 L-96 12 M-46 6 L-94 18" stroke="{ink}" stroke-width="1.8" stroke-linecap="round"/>',
        f'<path d="M-46 -6 C-30 -12 10 -12 26 -6 C34 -2 30 6 18 7 C0 9 -30 8 -46 2 C-54 0 -54 -4 -46 -6Z" fill="{white}"/>',
        f'<path d="M-46 -6 C-56 -10 -64 -2 -60 6 C-52 6 -48 2 -44 2Z" fill="{ink}"/>',
        f'<path d="M22 -6 C36 -10 50 -14 64 -16" fill="none" stroke="{ink}" stroke-width="5.2" stroke-linecap="round"/>',
        f'<ellipse cx="68" cy="-17" rx="7" ry="5" fill="{ink}"/>',
        f'<ellipse cx="66" cy="-21" rx="3.4" ry="2.2" fill="{crown}"/>',
        f'<path d="M73 -18 L92 -15 L73 -14Z" fill="#9C8C55"/>',
        f'<path d="M64 -14 C60 -13 58 -12 56 -12" stroke="{white}" stroke-width="2" opacity="0.9"/>',
        f'<path d="M-6 -2 C-6 {fmt(-36 * u)} 6 {fmt(-70 * u)} -6 {fmt(-104 * u)} C2 {fmt(-96 * u)} 4 {fmt(-92 * u)} 8 {fmt(-82 * u)} '
        f'C12 {fmt(-72 * u)} 16 {fmt(-50 * u)} 12 -4Z" fill="{white}"/>',
        f'<path d="M-6 {fmt(-104 * u)} C2 {fmt(-96 * u)} 4 {fmt(-92 * u)} 8 {fmt(-82 * u)} C9 {fmt(-76 * u)} 10 {fmt(-68 * u)} 10 {fmt(-60 * u)} C4 {fmt(-70 * u)} 0 {fmt(-86 * u)} -6 {fmt(-104 * u)}Z" fill="{ink}"/>',
    ]
    for i in range(4):
        out.append(f'<path d="M{fmt(-3 + i * 3)} {fmt((-100 + i * 8) * u)} l{fmt(-4 + i)} {fmt(-12 * u)}" stroke="{ink}" stroke-width="2.6" stroke-linecap="round"/>')
    out.append(f'<path d="M0 {fmt(-30 * u)} C2 {fmt(-50 * u)} 4 {fmt(-60 * u)} 2 {fmt(-74 * u)}" stroke="#D8D8D0" stroke-width="0.8" fill="none"/>')
    return tf("".join(out), cx, cy, rot, s, flip, op=op)


def koi(card, cx, cy, s, rot=0, bend=0.0, kind="kohaku", seed=1, op=1):
    """Carpe koï vue de dessus (création) : corps fuselé, nageoires de voile, robe tachetée."""
    rnd = random.Random(seed)
    ctrl = [(48, 0), (20, bend * 4), (-10, bend * 12), (-36, bend * 26)]
    sp, _ = spine(ctrl, 60)
    prof = lambda t: 26 * (math.sin(math.pi * min(1, (t * 0.92 + 0.08))) ** 0.75) * (1 - 0.65 * t) + 2
    body = ribbon_d(sp, prof)
    base_c, spots = {
        "kohaku": ("#FBF6EE", ["#E2401E", "#D9361A"]),
        "yamabuki": ("#F6C04A", ["#FFE08A", "#E89A20"]),
        "showa": ("#F7F1E8", ["#141414", "#E0441C"]),
        "ogon": ("#EADFC8", ["#C9B48A", "#FFFFFF"]),
        "asagi": ("#7FA2C8", ["#E2763A", "#C8DBEF"]),
        "encre": ("#1A1A22", ["#3A3A48", "#E8B53C"]),
    }[kind]
    tx, ty, ta = sp[-1]
    tail = (f"M{fmt(tx + 4)} {fmt(ty)} C{fmt(tx - 12)} {fmt(ty - 6)} {fmt(tx - 30)} {fmt(ty - 22 + bend * 10)} {fmt(tx - 40)} {fmt(ty - 14 + bend * 14)} "
            f"C{fmt(tx - 30)} {fmt(ty - 4 + bend * 10)} {fmt(tx - 30)} {fmt(ty + 4 + bend * 10)} {fmt(tx - 40)} {fmt(ty + 14 + bend * 14)} "
            f"C{fmt(tx - 28)} {fmt(ty + 22 + bend * 10)} {fmt(tx - 12)} {fmt(ty + 6)} {fmt(tx + 4)} {fmt(ty)}Z")
    fin_c = base_c if kind != "encre" else "#2A2A36"
    out = [f'<path d="{tail}" fill="{fin_c}" opacity="0.7"/>']
    for k in range(-3, 4):
        out.append(f'<path d="M{fmt(tx)} {fmt(ty)} L{fmt(tx - 36)} {fmt(ty + k * 5 + bend * 12)}" stroke="#FFFFFF" stroke-width="0.6" opacity="0.4"/>')
    x1, y1, a1 = sp[14]
    for side in (-1, 1):
        fx, fy = x1 - math.sin(a1) * side * 10, y1 + math.cos(a1) * side * 10
        out.append(f'<path d="M{fmt(fx)} {fmt(fy)} q{fmt(-14)} {fmt(side * 10)} {fmt(-24)} {fmt(side * 22)} q{fmt(10)} {fmt(-side * 4)} {fmt(18)} {fmt(-side * 20)}Z" fill="{fin_c}" opacity="0.75"/>')
    cid = nid("koi")
    card.def_once(cid, f'<clipPath id="{card.id(cid)}"><path d="{body}"/></clipPath>')
    gbody = card.rgrad(f"koi-{kind}", [(0, "#FFFFFF", 0.35), (1, "#000000", 0.25)], 0.5, 0.5, 0.6)
    out.append(f'<path d="{body}" fill="{base_c}"/>')
    sp_svg = []
    for i in range(rnd.randint(2, 4)):
        x, y, _ = sp[rnd.randint(4, 44)]
        sp_svg.append(f'<ellipse cx="{fmt(x + rnd.uniform(-5, 5))}" cy="{fmt(y + rnd.uniform(-8, 8))}" rx="{fmt(rnd.uniform(9, 17))}" ry="{fmt(rnd.uniform(6, 11))}" fill="{spots[i % 2]}" transform="rotate({rnd.randint(-30, 30)} {fmt(x)} {fmt(y)})"/>')
    out.append(f'<g clip-path="url(#{card.id(cid)})">{"".join(sp_svg)}<path d="{body}" fill="{gbody}"/>'
               f'<path d="{poly_d([(x, y) for x, y, _ in sp[2:50]], False)}" stroke="#FFFFFF" stroke-width="2" opacity="0.35" fill="none"/></g>')
    hx, hy, ha = sp[3]
    for side in (-1, 1):
        out.append(f'<circle cx="{fmt(hx - math.sin(ha) * side * 7)}" cy="{fmt(hy + math.cos(ha) * side * 7)}" r="1.6" fill="#141414"/>')
    return tf("".join(out), cx, cy, rot, s, op=op)


# ---------------------------------------------------------------- flots

def wave_crest(card, x, y, w, h, body="#1C3F86", deep="#0B1D4A", foam="#F4F1E6", line="#0A1636", flip=False, curl=1.0):
    """Une lame qui se dresse et s'enroule ; l'écume se déchire en griffes (inspiration estampe, création)."""
    k = -1 if flip else 1
    cxs, cys = 0.64 * w, -0.66 * h
    back = [(0, 0), (0.22 * w, -0.25 * h), (0.42 * w, -0.78 * h), (0.62 * w, -1.02 * h), (0.86 * w, -0.94 * h)]
    sp_pts = back + [(cxs + math.cos(a) * r, cys + math.sin(a) * r) for a, r in
                     ((-0.25, 0.24 * w * curl), (0.45, 0.2 * w * curl), (1.2, 0.15 * w * curl), (2.0, 0.1 * w * curl), (2.8, 0.06 * w * curl))]
    sp, _ = spine(sp_pts, 90)
    lip = ribbon_d(sp, lambda t: max(1.2, 0.3 * h * (1 - t) ** 0.8))
    bodyd = poly_d([(x0, y0) for x0, y0, _ in sp[:46]] + [(w * 0.98, -0.3 * h), (w * 1.1, 0), (0, 0)])
    g = card.grad(f"wv-{body}", [(0, body), (1, deep)])
    out = [f'<path d="{bodyd}" fill="{g}"/>', f'<path d="{lip}" fill="{body}" stroke="{line}" stroke-width="1"/>']
    for j in range(1, 4):
        stripe = offset(sp[4:60], 0.07 * h * j)
        out.append(f'<path d="{poly_d(stripe, False)}" fill="none" stroke="{foam}" stroke-width="{fmt(1.4 - j * 0.25)}" opacity="{fmt(0.75 - j * 0.15)}"/>')
    outer = offset(sp, lambda t: -max(0.6, 0.15 * h * (1 - t) ** 0.8))
    for i in range(30, 82, 4):
        px, py = outer[i]
        a = sp[i][2] - math.pi / 2
        L = 0.11 * h * (1.1 - i / 90)
        tip = (px + math.cos(a) * L + math.cos(sp[i][2]) * L * 0.7, py + math.sin(a) * L + math.sin(sp[i][2]) * L * 0.7)
        out.append(f'<path d="M{fmt(px)} {fmt(py)} Q{fmt(px + math.cos(a) * L)} {fmt(py + math.sin(a) * L)} {fmt(tip[0])} {fmt(tip[1])}" '
                   f'fill="none" stroke="{foam}" stroke-width="{fmt(2.4 * (1.1 - i / 90))}" stroke-linecap="round"/>')
        out.append(f'<circle cx="{fmt(tip[0])}" cy="{fmt(tip[1])}" r="{fmt(1.3 * (1.1 - i / 90))}" fill="{foam}"/>')
    out.append(f'<path d="{poly_d(outer[24:84], False)}" fill="none" stroke="{foam}" stroke-width="2.2" stroke-linecap="round"/>')
    return tf("".join(out), x, y, 0, 1, flip)


def wave_band(card, y, h, seed, body="#1C3F86", deep="#0B1D4A", foam="#F4F1E6", x0=-30, x1=570, rows=2, w=(90, 130)):
    """Une mer de lames alignées, rangée arrière plus sombre, rangée avant plus haute."""
    rnd = random.Random(seed)
    out = []
    for r in range(rows):
        yy = y + r * h * 0.45
        xx = x0 - rnd.uniform(0, 50) - r * 40
        b = mix(body, deep, 0.35 * (rows - 1 - r))
        while xx < x1:
            ww = rnd.uniform(*w)
            out.append(wave_crest(card, xx, yy, ww, h * rnd.uniform(0.7, 1.0) * (0.75 + 0.25 * r), b, deep, foam, flip=False))
            xx += ww * rnd.uniform(0.62, 0.8)
        out.append(f'<rect x="{x0}" y="{fmt(yy - 2)}" width="{x1 - x0}" height="{fmt(h * 2)}" fill="{deep}"/>')
    return "".join(out)


def sea_cliff(card, y, h, x0=0, x1=W, colors=("#1F3F8A", "#2E7D8C", "#E8B53C", "#C23A2A", "#F4EBD8")):
    """Le bas des robes impériales : l'eau debout en rayures diagonales, les flots enroulés et le rocher."""
    out = []
    stripe_h = h * 0.55
    sy = y + h - stripe_h
    cl = nid("lishui")
    card.def_once(cl, f'<clipPath id="{card.id(cl)}"><rect x="{x0}" y="{fmt(sy)}" width="{x1 - x0}" height="{fmt(stripe_h + 40)}"/></clipPath>')
    st = []
    i = 0
    for xx in range(int(x0) - 300, int(x1) + 40, 12):
        c = colors[i % len(colors)]
        st.append(f'<path d="M{xx} {fmt(sy + stripe_h + 40)} L{xx + 160} {fmt(sy - 120)} L{xx + 172} {fmt(sy - 120)} L{xx + 12} {fmt(sy + stripe_h + 40)}Z" fill="{c}"/>')
        st.append(f'<path d="M{xx + 6} {fmt(sy + stripe_h + 40)} L{xx + 166} {fmt(sy - 120)}" stroke="#FFFFFF" stroke-width="0.8" opacity="0.35"/>')
        i += 1
    out.append(f'<g clip-path="url(#{card.id(cl)})">{"".join(st)}</g>')
    return "".join(out)


# ---------------------------------------------------------------- montagnes dans la brume

def karst(card, x0, x1, base, peaks, color, mist="#FFFFFF", mist_op=0.0, seed=3, rough=3):
    """Une rangée de pitons karstiques (paysage shanshui) qui se noient dans la brume."""
    rnd = random.Random(seed)
    pts = []
    n = 120
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        hgt = 0
        for px, ph, pw in peaks:
            hgt = max(hgt, ph * math.exp(-((x - px) / pw) ** 2 * 1.6))
        hgt += rnd.uniform(-rough, rough) * (hgt / 100 + 0.2)
        pts.append((x, base - hgt))
    d = poly_d([(x0, base + 30)] + pts + [(x1, base + 30)])
    g = card.grad(nid("kst"), [(0, color), (0.55, color), (1, mist)])
    return f'<path d="{d}" fill="{g}"/>' + (f'<rect x="{x0}" y="{fmt(base - 40)}" width="{x1 - x0}" height="70" fill="{lg(card, [(0, mist, 0), (1, mist, mist_op)])}"/>' if mist_op else "")


# ---------------------------------------------------------------- éventail, perle, cauris, kente

def fan(card, cx, cy, r0, r1, a0, a1, paper=("#F7EBD3", "#E9D4A8"), rib="#3A1A0C", edge=None, painting=""):
    """Éventail pliant : lames de bambou laqué, papier plissé, peinture découpée dans l'arc."""
    edge = edge or card.metal("gold")[0]
    n = 16
    out = []
    p0 = pt(cx, cy, r1, a0)
    p1 = pt(cx, cy, r1, a1)
    q0 = pt(cx, cy, r0, a0)
    q1 = pt(cx, cy, r0, a1)
    sector = f"M{fmt(q0[0])} {fmt(q0[1])} L{fmt(p0[0])} {fmt(p0[1])} A{r1} {r1} 0 0 1 {fmt(p1[0])} {fmt(p1[1])} L{fmt(q1[0])} {fmt(q1[1])} A{r0} {r0} 0 0 0 {fmt(q0[0])} {fmt(q0[1])}Z"
    for i in range(n):
        aa, bb = a0 + (a1 - a0) * i / n, a0 + (a1 - a0) * (i + 1) / n
        A, B, C, D = pt(cx, cy, r0, aa), pt(cx, cy, r1, aa), pt(cx, cy, r1, bb), pt(cx, cy, r0, bb)
        out.append(f'<path d="M{fmt(A[0])} {fmt(A[1])} L{fmt(B[0])} {fmt(B[1])} L{fmt(C[0])} {fmt(C[1])} L{fmt(D[0])} {fmt(D[1])}Z" fill="{paper[i % 2]}"/>')
    if painting:
        out.append(f'<g clip-path="{clip(card, sector)}">{painting}</g>')
    for i in range(n):
        aa, bb = a0 + (a1 - a0) * i / n, a0 + (a1 - a0) * (i + 1) / n
        A, B, C, D = pt(cx, cy, r0, aa), pt(cx, cy, r1, aa), pt(cx, cy, r1, bb), pt(cx, cy, r0, bb)
        out.append(f'<path d="M{fmt(A[0])} {fmt(A[1])} L{fmt(B[0])} {fmt(B[1])} L{fmt(C[0])} {fmt(C[1])} L{fmt(D[0])} {fmt(D[1])}Z" fill="#000000" opacity="{0.0 if i % 2 else 0.08}"/>')
    out.append(f'<path d="{sector}" fill="none" stroke="{edge}" stroke-width="2"/>')
    for i in range(n + 1):
        aa = a0 + (a1 - a0) * i / n
        A, B = pt(cx, cy, 6, aa), pt(cx, cy, r0 + 4, aa)
        out.append(f'<line x1="{fmt(A[0])}" y1="{fmt(A[1])}" x2="{fmt(B[0])}" y2="{fmt(B[1])}" stroke="{rib}" stroke-width="3" stroke-linecap="round"/>')
    out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="5" fill="{edge}" stroke="{rib}" stroke-width="1"/>')
    return "".join(out)


def flaming_pearl(card, cx, cy, r, core="#FFFFFF", mid="#CFE6FF", rim="#9A7CFF", flame=("#FF6A2A", "#FFC94A"), n=7, rot=0):
    """La perle flamboyante que poursuivent les dragons : sphère nacrée, langues de feu en spirale."""
    out = [f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r * 2.6)}" fill="{card.rgrad("pearl-glow", [(0, "#FFE9B8", 0.7), (0.4, "#FFB45A", 0.25), (1, "#FF8A3A", 0)])}"/>']
    for i in range(n):
        a = rot + i * 360 / n
        pts = []
        for k in range(14):
            t = k / 13
            rr = r * (0.95 + 0.9 * t)
            aa = a + t * 50
            pts.append(pt(cx, cy, rr, aa))
        sp = [(x, y, 0) for x, y in pts]
        sp2, _ = resample(pts, 30)
        d = ribbon_d(sp2, lambda t: r * 0.5 * (1 - t) ** 1.1 + 0.3)
        out.append(f'<path d="{d}" fill="{flame[i % 2]}" opacity="0.92"/>')
    g = card.rgrad("pearl", [(0, core, 1), (0.45, mid, 1), (1, rim, 1)], 0.38, 0.35, 0.7)
    out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r)}" fill="{g}"/>')
    out.append(f'<ellipse cx="{fmt(cx - r * 0.32)}" cy="{fmt(cy - r * 0.38)}" rx="{fmt(r * 0.3)}" ry="{fmt(r * 0.18)}" fill="#FFFFFF" opacity="0.85" transform="rotate(-30 {fmt(cx - r * 0.32)} {fmt(cy - r * 0.38)})"/>')
    return "".join(out)


def cowrie(card, cx, cy, s, rot=0):
    """Un cauri : coquille ivoire, fente dentelée — monnaie de la Chine des Shang comme de l'Afrique de l'Ouest."""
    g = card.rgrad("cowrie", [(0, "#FFFDF4", 1), (0.6, "#F1E2C0", 1), (1, "#B89A68", 1)], 0.4, 0.35, 0.7)
    teeth = "".join(f'<line x1="{fmt(-1.6)}" y1="{fmt(-7 + i * 2.8)}" x2="{fmt(1.6)}" y2="{fmt(-7 + i * 2.8)}" stroke="#7A5A30" stroke-width="0.7"/>' for i in range(6))
    return tf(f'<ellipse rx="7.5" ry="10.5" fill="{g}" stroke="#8A6A3A" stroke-width="0.6"/>'
              f'<path d="M0 -8.5 Q-1.6 0 0 8.5 Q1.6 0 0 -8.5Z" fill="#5A3A1A"/>{teeth}', cx, cy, rot, s)


KENTE = ("#E8B53C", "#1E7A3E", "#C8261E", "#141414", "#E8B53C", "#2856A8")


def kente_band(card, x, y, w, h, seed=5, vertical=False, op=1):
    """Une bande tissée à la manière du kente d'Asante : blocs de chaîne et de trame, or, vert, rouge, noir."""
    rnd = random.Random(seed)
    out = []
    L = h if vertical else w
    pos = 0
    i = 0
    while pos < L:
        bl = rnd.choice((10, 14, 18, 24))
        bl = min(bl, L - pos)
        c = KENTE[i % len(KENTE)]
        kind = i % 3
        if vertical:
            out.append(f'<rect x="{fmt(x)}" y="{fmt(y + pos)}" width="{fmt(w)}" height="{fmt(bl)}" fill="{c}"/>')
            if kind == 0:
                for j in range(3):
                    out.append(f'<rect x="{fmt(x + w * (0.2 + 0.25 * j))}" y="{fmt(y + pos)}" width="{fmt(w * 0.1)}" height="{fmt(bl)}" fill="#141414" opacity="0.8"/>')
            elif kind == 1:
                for j in range(int(bl // 4)):
                    out.append(f'<rect x="{fmt(x)}" y="{fmt(y + pos + j * 4)}" width="{fmt(w)}" height="1.4" fill="#F6E7B0" opacity="0.7"/>')
            else:
                out.append(f'<rect x="{fmt(x + w * 0.3)}" y="{fmt(y + pos + bl * 0.2)}" width="{fmt(w * 0.4)}" height="{fmt(bl * 0.6)}" fill="{KENTE[(i + 2) % 6]}"/>')
        else:
            out.append(f'<rect x="{fmt(x + pos)}" y="{fmt(y)}" width="{fmt(bl)}" height="{fmt(h)}" fill="{c}"/>')
            if kind == 0:
                for j in range(3):
                    out.append(f'<rect x="{fmt(x + pos)}" y="{fmt(y + h * (0.2 + 0.25 * j))}" width="{fmt(bl)}" height="{fmt(h * 0.1)}" fill="#141414" opacity="0.8"/>')
            elif kind == 1:
                for j in range(int(bl // 4)):
                    out.append(f'<rect x="{fmt(x + pos + j * 4)}" y="{fmt(y)}" width="1.4" height="{fmt(h)}" fill="#F6E7B0" opacity="0.7"/>')
            else:
                out.append(f'<rect x="{fmt(x + pos + bl * 0.2)}" y="{fmt(y + h * 0.3)}" width="{fmt(bl * 0.6)}" height="{fmt(h * 0.4)}" fill="{KENTE[(i + 2) % 6]}"/>')
        pos += bl
        i += 1
    return f'<g opacity="{op}">{"".join(out)}</g>'


# ---------------------------------------------------------------- astres familiers

def moon(card, cx, cy, r, glow=0.55, tint=("#FFFBEA", "#F3DFA8", "#C9A866"), craters=True, phase=None, sky="#0A0F2E"):
    """La lune pleine (ou croissante si `phase` donne le décalage de l'ombre), mers grises, halo."""
    hi, mid, lo = tint
    out = []
    if glow:
        out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r * 2.6)}" fill="{card.rgrad(nid("mg"), [(0, hi, glow), (0.4, mid, glow * 0.35), (1, mid, 0)])}"/>')
    out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r)}" fill="{card.rgrad(nid("mb"), [(0, hi, 1), (0.7, mid, 1), (1, lo, 1)], 0.42, 0.4, 0.62)}"/>')
    if craters:
        rnd = random.Random(int(cx + cy))
        for _ in range(7):
            a, d = rnd.uniform(0, 360), rnd.uniform(0, r * 0.65)
            px, py = pt(cx, cy, d, a)
            rr = rnd.uniform(r * 0.08, r * 0.24)
            out.append(f'<circle cx="{fmt(px)}" cy="{fmt(py)}" r="{fmt(rr)}" fill="{lo}" opacity="0.28"/>')
    if phase is not None:
        out.append(f'<circle cx="{fmt(cx + phase * r)}" cy="{fmt(cy - phase * r * 0.15)}" r="{fmt(r * 1.02)}" fill="{sky}"/>')
    return "".join(out)


def door_nails(card, x0, y0, cols, rows, dx, dy, r):
    """Les clous d'or des portes vermillon du palais (neuf rangs de neuf)."""
    g = card.rgrad("nail", [(0, "#FFF6D0", 1), (0.45, "#E8B53C", 1), (1, "#6A4208", 1)], 0.35, 0.3, 0.7)
    out = []
    for i in range(cols):
        for j in range(rows):
            x, y = x0 + i * dx, y0 + j * dy
            out.append(f'<circle cx="{fmt(x)}" cy="{fmt(y + 1.6)}" r="{fmt(r)}" fill="#2A0604" opacity="0.5"/><circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(r)}" fill="{g}"/>')
    return "".join(out)


def knocker(card, cx, cy, s=1.0):
    """Heurtoir de porte (pushou) : masque de lion stylisé, anneau d'or."""
    gold = card.metal("gold")[0]
    out = [f'<circle r="20" fill="#000000" opacity="0.4" transform="translate(0 2)"/>']
    for k in range(12):
        p = pt(0, 0, 16, k * 30)
        out.append(f'<circle cx="{fmt(p[0])}" cy="{fmt(p[1])}" r="6" fill="{gold}" stroke="#6A4208" stroke-width="0.6"/>')
    out.append(f'<circle r="15" fill="{gold}" stroke="#6A4208" stroke-width="1"/>')
    out.append('<circle cx="-5" cy="-3" r="2.6" fill="#3A1A04"/><circle cx="5" cy="-3" r="2.6" fill="#3A1A04"/>'
               '<path d="M-6 6 Q0 10 6 6" stroke="#3A1A04" stroke-width="1.6" fill="none"/><path d="M-3 2 L0 -1 L3 2Z" fill="#6A4208"/>')
    out.append(f'<circle cx="0" cy="30" r="14" fill="none" stroke="#6A4208" stroke-width="5"/><circle cx="0" cy="30" r="14" fill="none" stroke="{gold}" stroke-width="3.2"/>')
    return tf("".join(out), cx, cy, 0, s)


def crescent(card, cx, cy, r, off=0.42, glow=0.5, tint=("#FFFBEA", "#F6E0A8"), rot=-20):
    """Croissant de lune : un disque masqué par son double décalé, halo doux."""
    mid = nid("cres")
    ox, oy = pt(0, 0, r * off * 2, 90 + rot)
    card.def_once(mid, f'<mask id="{card.id(mid)}" maskUnits="userSpaceOnUse" x="{fmt(cx - r * 2)}" y="{fmt(cy - r * 2)}" width="{fmt(r * 4)}" height="{fmt(r * 4)}">'
                       f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r)}" fill="#FFFFFF"/><circle cx="{fmt(cx + ox)}" cy="{fmt(cy + oy)}" r="{fmt(r * 0.92)}" fill="#000000"/></mask>')
    out = []
    if glow:
        out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r * 2.4)}" fill="{card.rgrad(nid("cg"), [(0, tint[0], glow * 0.6), (1, tint[1], 0)])}"/>')
    out.append(f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(r)}" fill="{card.rgrad(nid("cb"), [(0, tint[0], 1), (1, tint[1], 1)])}" mask="url(#{card.id(mid)})"/>')
    return "".join(out)


def robe_rock(card, x, base, w, h, uid="rk"):
    """Le rocher des robes impériales : trois pics striés jade et or qui sortent des flots."""
    g = card.grad(f"rr-{uid}", [(0, "#E6FFF2"), (0.35, JADE), (1, JADE_D)])
    out = []
    for k, (dx, hh, ww) in enumerate(((-0.3, 0.7, 0.42), (0.3, 0.75, 0.42), (0, 1.0, 0.5))):
        px, ph, pw = x + dx * w, h * hh, w * ww
        d = (f"M{fmt(px - pw)} {fmt(base)} C{fmt(px - pw * 0.7)} {fmt(base - ph * 0.5)} {fmt(px - pw * 0.4)} {fmt(base - ph * 0.9)} {fmt(px)} {fmt(base - ph)} "
             f"C{fmt(px + pw * 0.4)} {fmt(base - ph * 0.9)} {fmt(px + pw * 0.7)} {fmt(base - ph * 0.5)} {fmt(px + pw)} {fmt(base)}Z")
        out.append(f'<path d="{d}" fill="{g}" stroke="{GOLD}" stroke-width="1.4"/>')
        for j in range(1, 4):
            sc = 1 - j * 0.22
            d2 = (f"M{fmt(px - pw * sc)} {fmt(base)} C{fmt(px - pw * 0.7 * sc)} {fmt(base - ph * 0.5 * sc)} {fmt(px - pw * 0.4 * sc)} {fmt(base - ph * 0.9 * sc)} {fmt(px)} {fmt(base - ph * sc)} "
                  f"C{fmt(px + pw * 0.4 * sc)} {fmt(base - ph * 0.9 * sc)} {fmt(px + pw * 0.7 * sc)} {fmt(base - ph * 0.5 * sc)} {fmt(px + pw * sc)} {fmt(base)}")
            out.append(f'<path d="{d2}" fill="none" stroke="{GOLD_HI}" stroke-width="0.9" opacity="0.7"/>')
    return "".join(out)


KOI_ROBES = {
    "kohaku": ("#FBF6EE", ["#E2401E", "#D9361A"], "#F2E2D2"),
    "yamabuki": ("#F6C04A", ["#FFE08A", "#E89A20"], "#FFE7A0"),
    "showa": ("#F7F1E8", ["#141414", "#E0441C"], "#E8E0D8"),
    "ogon": ("#EADFC8", ["#C9B48A", "#FFFFFF"], "#F6EEDA"),
    "encre": ("#16161E", ["#3A3A4C", "#C9D2E8"], "#3A3A4C"),
    "or": ("#E8B53C", ["#FFF1BE", "#B8801A"], "#FFE7A0"),
}


def koi_curve(card, ctrl, w, kind="kohaku", seed=1, fin_len=1.0, op=1, uid=None):
    """Carpe koï le long d'une spline (de la tête à la queue) : tête ronde, nageoires de voile à rayons, robe tachetée."""
    rnd = random.Random(seed)
    base_c, spots, fin_c = KOI_ROBES[kind]
    sp, L = spine(ctrl, 90)

    def prof(t):
        if t < 0.26:
            return w * (0.5 + 0.5 * math.sin(math.pi / 2 * t / 0.26))
        return w * (1 - 0.84 * ((t - 0.26) / 0.74) ** 1.25)

    body = ribbon_d(sp, prof)
    hx, hy, ha = sp[0]
    head = f'<circle cx="{fmt(hx + math.cos(ha) * w * 0.12)}" cy="{fmt(hy + math.sin(ha) * w * 0.12)}" r="{fmt(w * 0.26)}"/>'
    out = []
    tx, ty, ta = sp[-1]
    fl = w * 2.2 * fin_len
    for side in (-1, 1):
        a1 = ta + side * 0.38
        a2 = ta + side * 0.08
        p1 = (tx + math.cos(a1) * fl, ty + math.sin(a1) * fl)
        p2 = (tx + math.cos(a2) * fl * 0.72, ty + math.sin(a2) * fl * 0.72)
        c1 = (tx + math.cos(ta + side * 0.7) * fl * 0.5, ty + math.sin(ta + side * 0.7) * fl * 0.5)
        lobe = f"M{fmt(tx)} {fmt(ty)} Q{fmt(c1[0])} {fmt(c1[1])} {fmt(p1[0])} {fmt(p1[1])} Q{fmt(p2[0] + math.cos(a1) * 4)} {fmt(p2[1] + math.sin(a1) * 4)} {fmt(p2[0])} {fmt(p2[1])} Z"
        out.append(f'<path d="{lobe}" fill="{fin_c}" opacity="0.62"/>')
        for k in range(5):
            aa = lerp(a2, a1, k / 4)
            ll = fl * lerp(0.72, 1.0, k / 4)
            out.append(f'<line x1="{fmt(tx)}" y1="{fmt(ty)}" x2="{fmt(tx + math.cos(aa) * ll * 0.95)}" y2="{fmt(ty + math.sin(aa) * ll * 0.95)}" stroke="#FFFFFF" stroke-width="0.6" opacity="0.45"/>')
    px, py, pa = sp[22]
    for side in (-1, 1):
        nx, ny = -math.sin(pa) * side, math.cos(pa) * side
        bx, by = px + nx * prof(0.24) * 0.4, py + ny * prof(0.24) * 0.4
        tip = (bx + nx * w * 0.9 * fin_len + math.cos(pa) * w * 0.9, by + ny * w * 0.9 * fin_len + math.sin(pa) * w * 0.9)
        tip2 = (bx + nx * w * 0.3 + math.cos(pa) * w * 1.15, by + ny * w * 0.3 + math.sin(pa) * w * 1.15)
        out.append(f'<path d="M{fmt(bx)} {fmt(by)} Q{fmt(tip[0])} {fmt(tip[1])} {fmt(tip2[0])} {fmt(tip2[1])}Z" fill="{fin_c}" opacity="0.7"/>')
    cid = nid("koic")
    card.def_once(cid, f'<clipPath id="{card.id(cid)}"><path d="{body}"/>{head}</clipPath>')
    shade = card.grad(f"koish-{kind}", [(0, "#000000"), (0.5, "#FFFFFF"), (1, "#000000")], 0, 0, 1, 1)
    out.append(f'<g fill="{base_c}"><path d="{body}"/>{head}</g>')
    inner = []
    for i in range(rnd.randint(3, 5)):
        x, y, a = sp[rnd.randint(6, 62)]
        inner.append(f'<ellipse cx="{fmt(x + rnd.uniform(-w * 0.2, w * 0.2))}" cy="{fmt(y + rnd.uniform(-w * 0.3, w * 0.3))}" rx="{fmt(rnd.uniform(w * 0.4, w * 0.8))}" ry="{fmt(rnd.uniform(w * 0.25, w * 0.45))}" '
                     f'fill="{spots[i % 2]}" transform="rotate({fmt(math.degrees(a) + rnd.uniform(-30, 30))} {fmt(x)} {fmt(y)})"/>')
    for i in range(6, 80, 3):
        x, y, a = sp[i]
        for k in (-0.25, 0, 0.25):
            r = prof(i / 89) * 0.12
            cx, cy = x - math.sin(a) * k * prof(i / 89), y + math.cos(a) * k * prof(i / 89)
            inner.append(f'<path d="M{fmt(cx - math.sin(a) * r)} {fmt(cy + math.cos(a) * r)} Q{fmt(cx + math.cos(a) * r * 1.6)} {fmt(cy + math.sin(a) * r * 1.6)} {fmt(cx + math.sin(a) * r)} {fmt(cy - math.cos(a) * r)}" fill="none" stroke="#FFFFFF" stroke-width="0.5" opacity="0.35"/>')
    inner.append(f'<path d="{poly_d([(x, y) for x, y, _ in sp[3:80]], False)}" fill="none" stroke="#FFFFFF" stroke-width="{fmt(w * 0.12)}" opacity="0.3"/>')
    out.append(f'<g clip-path="url(#{card.id(cid)})">{"".join(inner)}<path d="{body}" fill="{shade}" opacity="0.12"/></g>')
    for side in (-1, 1):
        ex, ey = hx - math.sin(ha) * side * w * 0.26 + math.cos(ha) * w * 0.12, hy + math.cos(ha) * side * w * 0.26 + math.sin(ha) * w * 0.12
        out.append(f'<circle cx="{fmt(ex)}" cy="{fmt(ey)}" r="{fmt(max(1.2, w * 0.06))}" fill="#141414"/>')
    out.append(f'<path d="{poly_d([(x, y) for x, y, _ in sp[30:76]], False)}" fill="none" stroke="{fin_c}" stroke-width="{fmt(w * 0.08)}" opacity="0.7"/>')
    return f'<g opacity="{op}">{"".join(out)}</g>'
