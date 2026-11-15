"""Constructions africaines de la collection : la cour peinte de Tiébélé (Kassena), le palais d'Edo et ses tourelles
au python, les cases-obus des Musgum, la toguna et les greniers dogon sous la falaise de Bandiagara, les églises
taillées de Lalibela et leurs fenêtres axoumites, les reliefs des temples asante, les maisons de Djenné, les aloès et
kopjes du Grand Zimbabwe. Créations originales inspirées de ces architectures."""

import math
import random

from base import f, pt, sparkle
from motifs import nid, grp, soft, _shade  # noqa: F401
from motifs import relief, grain  # noqa: F401


def _j(rnd, a=0.8):
    return rnd.uniform(-a, a)


# ---------------------------------------------------------------- Tiébélé : la cour royale peinte des Kassena

KASSENA = dict(red="#A2432A", red2="#8A3320", black="#1B1311", white="#EFE4CF", ochre="#C9824A")


def tiebele_band(x0, x1, y, h, kind, seed=1, pal=KASSENA):
    """Un registre peint par les femmes kassena (Tiébélé) : triangles, losanges, échelles, damiers, calebasses brisées.
    Peint à la main : chaque sommet tremble un peu."""
    rnd = random.Random(seed)
    R, B, Wt, O = pal["red"], pal["black"], pal["white"], pal["ochre"]
    out = []
    if kind == "saw":
        s = h * 0.9
        x = x0 - s
        while x < x1 + s:
            out.append(f'<path d="M{f(x + _j(rnd))} {f(y + h)} L{f(x + s / 2 + _j(rnd))} {f(y + _j(rnd, 0.6))} L{f(x + s + _j(rnd))} {f(y + h)}Z" fill="{Wt}"/>')
            out.append(f'<path d="M{f(x + s / 2 + 1.8)} {f(y + 1)} L{f(x + s - 1.2)} {f(y + h - 2)} L{f(x + s + s / 2 - 1.8)} {f(y + 1)}Z" fill="{B}"/>')
            x += s
    elif kind == "loz":
        s = h * 1.15
        x = x0 + s / 2 - 4
        while x < x1 + s:
            cy = y + h / 2
            out.append(f'<path d="M{f(x)} {f(y + 1)} L{f(x + s / 2)} {f(cy)} L{f(x)} {f(y + h - 1)} L{f(x - s / 2)} {f(cy)}Z" fill="{B}"/>')
            out.append(f'<path d="M{f(x)} {f(y + 5)} L{f(x + s / 2 - 5)} {f(cy)} L{f(x)} {f(y + h - 5)} L{f(x - s / 2 + 5)} {f(cy)}Z" fill="{Wt}"/>')
            out.append(f'<path d="M{f(x)} {f(y + 9)} L{f(x + s / 2 - 10)} {f(cy)} L{f(x)} {f(y + h - 9)} L{f(x - s / 2 + 10)} {f(cy)}Z" fill="{R}"/>')
            out.append(f'<circle cx="{f(x + s / 2)}" cy="{f(cy)}" r="1.8" fill="{Wt}"/>')
            x += s
    elif kind == "ladder":
        out.append(f'<rect x="{f(x0)}" y="{f(y + 2)}" width="{f(x1 - x0)}" height="2.4" fill="{B}"/><rect x="{f(x0)}" y="{f(y + h - 4.4)}" width="{f(x1 - x0)}" height="2.4" fill="{B}"/>')
        x = x0 + 3
        while x < x1:
            out.append(f'<rect x="{f(x + _j(rnd, 0.5))}" y="{f(y + 6)}" width="3.2" height="{f(h - 12)}" fill="{Wt}"/>')
            x += 8
    elif kind == "check":
        s = h / 2
        k = 0
        x = x0
        while x < x1:
            for r in range(2):
                col = B if (k + r) % 2 == 0 else Wt
                out.append(f'<rect x="{f(x)}" y="{f(y + r * s)}" width="{f(s + 0.4)}" height="{f(s + 0.4)}" fill="{col}"/>')
            x += s
            k += 1
    elif kind == "calabash":
        s = h * 1.3
        x = x0 - 4
        k = 0
        while x < x1 + s:
            up = k % 2 == 0
            a, b, c = ((x, y + h - 2), (x + s / 2, y + 2), (x + s, y + h - 2)) if up else ((x, y + 2), (x + s / 2, y + h - 2), (x + s, y + 2))
            out.append(f'<path d="M{f(a[0])} {f(a[1])} L{f(b[0])} {f(b[1])} L{f(c[0])} {f(c[1])}Z" fill="{B if up else O}" stroke="{Wt}" stroke-width="1.6"/>')
            for t in (0.3, 0.55, 0.8):
                ya = a[1] + (b[1] - a[1]) * t
                xa = a[0] + (b[0] - a[0]) * t
                xc = c[0] + (b[0] - c[0]) * t
                out.append(f'<line x1="{f(xa)}" y1="{f(ya)}" x2="{f(xc)}" y2="{f(ya)}" stroke="{Wt}" stroke-width="1.1" opacity="0.85"/>')
            x += s / 2
            k += 1
    elif kind == "dots":
        x = x0 + 6
        while x < x1:
            out.append(f'<circle cx="{f(x + _j(rnd, 0.6))}" cy="{f(y + h / 2 + _j(rnd, 0.6))}" r="{f(h * 0.22)}" fill="{Wt}"/>')
            x += h * 0.9
    elif kind == "rule":
        out.append(f'<rect x="{f(x0)}" y="{f(y)}" width="{f(x1 - x0)}" height="{f(h * 0.5)}" fill="{B}"/><rect x="{f(x0)}" y="{f(y + h * 0.5)}" width="{f(x1 - x0)}" height="{f(h * 0.5)}" fill="{Wt}"/>')
    return "".join(out)


# ---------------------------------------------------------------- Edo : tourelle du palais et python de bronze

def benin_turret(card, x, y, s=1.0, height=230, base=96, roof=("#7A4A2A", "#4A2A16", "#2A160A"), metal=("#F0C890", "#B47A3E", "#5A3216"),
                 python=True, bird=True, side=1):
    """Tourelle pyramidale du palais de l'Oba (telle que la montrent les plaques) : bardeaux, oiseau de bronze au faîte,
    et le python de bronze qui descend la façade la tête la première, gardien du palais."""
    hi, mid, lo = metal
    rhi, rmid, rlo = roof
    top_w = 10
    body = card.grad(nid("bt"), [(0, rlo), (0.35, rhi), (0.55, rmid), (1, rlo)], 0, 0, 1, 0)
    d = f"M{f(-base / 2)} 0 L{f(-top_w / 2)} {f(-height)} L{f(top_w / 2)} {f(-height)} L{f(base / 2)} 0Z"
    out = [f'<path d="{d}" fill="{body}"/>']
    rows = int(height // 9)
    for i in range(1, rows):
        yy = -i * 9
        hw = base / 2 - (base / 2 - top_w / 2) * (i * 9 / height)
        n = max(2, int(hw * 2 / 9))
        arcs = "".join(f"a{f(hw * 2 / n / 2)} 3.2 0 0 0 {f(hw * 2 / n)} 0" for _ in range(n))
        out.append(f'<path d="M{f(-hw)} {f(yy)} {arcs}" fill="none" stroke="{rlo}" stroke-width="1.1" opacity="0.85"/>')
    out.append(f'<path d="{d}" fill="none" stroke="{rlo}" stroke-width="1.4"/>')
    gold = card.grad(nid("btg"), [(0, hi), (0.5, mid), (1, lo)], 0, 0, 1, 1)
    if python:
        pts_ = []
        for i in range(60):
            t = i / 59
            yy = -height * 0.92 + t * height * 0.86
            xx = side * math.sin(t * math.pi * 3.2) * (8 + t * 18)
            pts_.append((xx, yy))
        dp = "M" + " L".join(f"{f(a)} {f(b)}" for a, b in pts_)
        out.append(f'<path d="{dp}" fill="none" stroke="#000000" stroke-width="11" opacity="0.35" transform="translate(2 3)"/>')
        out.append(f'<path d="{dp}" fill="none" stroke="{lo}" stroke-width="10" stroke-linecap="round"/>')
        out.append(f'<path d="{dp}" fill="none" stroke="{gold}" stroke-width="8" stroke-linecap="round"/>')
        out.append(f'<path d="{dp}" fill="none" stroke="{lo}" stroke-width="7" stroke-dasharray="1.2 4" opacity="0.7"/>')
        out.append(f'<path d="{dp}" fill="none" stroke="{hi}" stroke-width="1.4" opacity="0.8" transform="translate(-1.6 -1)"/>')
        hx, hy = pts_[-1]
        out.append(f'<ellipse cx="{f(hx)}" cy="{f(hy + 9)}" rx="7" ry="11" fill="{gold}" stroke="{lo}" stroke-width="1.2"/>'
                   f'<circle cx="{f(hx - 3)}" cy="{f(hy + 12)}" r="1.4" fill="{lo}"/><circle cx="{f(hx + 3)}" cy="{f(hy + 12)}" r="1.4" fill="{lo}"/>')
    if bird:
        b = (f'<path d="M0 0 C-8 -6 -22 -10 -40 -6 C-30 -12 -20 -18 -6 -14 L0 -22 L6 -14 C20 -18 30 -12 40 -6 C22 -10 8 -6 0 0Z" fill="{gold}" stroke="{lo}" stroke-width="1.1"/>'
             f'<path d="M-30 -9 L-24 -12 M-20 -10 L-14 -13 M30 -9 L24 -12 M20 -10 L14 -13" stroke="{lo}" stroke-width="1"/>'
             f'<circle cx="0" cy="-24" r="4.2" fill="{gold}" stroke="{lo}" stroke-width="1"/><path d="M3 -25 L10 -22 L3 -21Z" fill="{mid}" stroke="{lo}" stroke-width="0.8"/>'
             f'<rect x="-1.5" y="0" width="3" height="10" fill="{mid}"/>')
        out.append(grp(b, 0, -height - 10, 1.0))
    return grp("".join(out), x, y, s)


def leopard_body(card, x, y, s=1.0, flip=False, tones=("#E9B877", "#A8692F", "#4A2810")):
    """Le léopard d'Edo en marche, de profil : bête royale (l'Oba est « le léopard de la ville »).
    Stylisé comme sur les plaques : corps tendu, queue enroulée, taches en rosettes."""
    hi, mid, lo = tones
    body = card.grad("lb-g", [(0, hi), (0.6, mid), (1, lo)], 0, 0, 0, 1)
    d = ("M-44 -14 C-30 -21 10 -21 30 -16 C36 -15 40 -20 44 -24 C48 -31 58 -31 62 -25 C66 -21 67 -15 63 -11 "
         "C59 -8 55 -8 51 -10 C47 -6 43 -4 41 0 L41 8 L44 28 L36 28 L33 7 C20 9 0 9 -16 7 L-20 28 L-28 28 L-31 5 "
         "C-41 5 -47 -3 -44 -14Z")
    far = (f'<path d="M27 4 L30 28 L24 28 L21 6Z" fill="{lo}"/><path d="M-34 0 L-36 28 L-42 28 L-42 -2Z" fill="{lo}"/>')
    tail = (f'<path d="M-44 -10 C-58 -6 -66 -22 -58 -32 C-54 -37 -47 -35 -49 -28" fill="none" stroke="{lo}" stroke-width="6.4" stroke-linecap="round"/>'
            f'<path d="M-44 -10 C-58 -6 -66 -22 -58 -32 C-54 -37 -47 -35 -49 -28" fill="none" stroke="{mid}" stroke-width="4.6" stroke-linecap="round"/>')
    rnd = random.Random(5)
    spots = []
    for _ in range(26):
        sx, sy = rnd.uniform(-38, 34), rnd.uniform(-15, 3)
        spots.append(f'<circle cx="{f(sx)}" cy="{f(sy)}" r="2.3" fill="none" stroke="{lo}" stroke-width="1.1"/><circle cx="{f(sx)}" cy="{f(sy)}" r="0.7" fill="{lo}"/>')
    head = (f'<path d="M50 -28 L50 -36 L56 -30Z" fill="{mid}" stroke="{lo}" stroke-width="0.8"/>'
            f'<circle cx="56" cy="-21" r="2.6" fill="{hi}" stroke="{lo}" stroke-width="1"/><circle cx="56.4" cy="-21" r="1" fill="{lo}"/>'
            f'<path d="M62 -15 L58 -14 M61 -12 L57 -12" stroke="{lo}" stroke-width="0.8"/>')
    m = far + tail + f'<path d="{d}" fill="{body}" stroke="{lo}" stroke-width="1.2"/>' + "".join(spots) + head
    return grp(m, x, y, s, 0, flip)


# ---------------------------------------------------------------- Musgum : la case-obus

def musgum_dome(card, x, y, w, h, tone=("#E8A970", "#B4693A", "#5C2E16"), seed=1, door=True, light=-1, ridge=13):
    """Case-obus musgum (teleuk) : coque d'argile en chaînette, côtes en V renversé qui servent d'échafaudage,
    oculus au sommet et porte en trou de serrure. Construite sans bois, d'une seule main de terre."""
    hi, mid, lo = tone
    uid = nid("mg")
    shell = f"M{f(-w / 2)} 0 C{f(-w / 2)} {f(-h * 0.62)} {f(-w * 0.17)} {f(-h * 0.98)} 0 {f(-h)} C{f(w * 0.17)} {f(-h * 0.98)} {f(w / 2)} {f(-h * 0.62)} {f(w / 2)} 0Z"
    stops = [(0, hi), (0.45, mid), (1, lo)] if light < 0 else [(0, lo), (0.55, mid), (1, hi)]
    body = card.grad(uid, stops, 0, 0, 1, 0)
    card.def_once(uid + "c", f'<clipPath id="{card.id(uid + "c")}"><path d="{shell}"/></clipPath>')
    out = [f'<path d="{shell}" fill="{body}"/>', f'<g clip-path="url(#{card.id(uid + "c")})">']

    def hw(yy):
        t = -yy / h
        return (w / 2) * max(0.0, (1 - t ** 2.1)) ** 0.62

    rows = int(h // ridge)
    for r in range(rows):
        yy = -r * ridge - ridge * 0.6
        half = hw(yy)
        if half < 8:
            continue
        n = max(2, int(half * 2 / 15))
        off = 0.5 if r % 2 else 0
        for k in range(n + 1):
            u = -1 + 2 * (k + off) / n
            if abs(u) > 1:
                continue
            xx = half * math.sin(u * math.pi / 2)
            sc = max(0.25, math.cos(u * math.pi / 2))
            ww = 5.5 * sc
            out.append(f'<path d="M{f(xx - ww)} {f(yy + 4.5)} L{f(xx)} {f(yy - 3.5)} L{f(xx + ww)} {f(yy + 4.5)}" fill="none" stroke="{lo}" stroke-width="2.4" opacity="0.55" stroke-linejoin="round"/>')
            out.append(f'<path d="M{f(xx - ww)} {f(yy + 3.5)} L{f(xx)} {f(yy - 4.5)}" fill="none" stroke="{hi}" stroke-width="1.6" opacity="0.8" stroke-linecap="round"/>')
    out.append(f'<path d="{shell}" fill="{lgrad_local(card, uid + "v")}"/>')
    out.append("</g>")
    out.append(f'<ellipse cx="0" cy="{f(-h + 2)}" rx="{f(w * 0.06)}" ry="3" fill="{lo}" stroke="{hi}" stroke-width="1"/>')
    if door:
        dw = w * 0.12
        out.append(f'<path d="M{f(-dw * 0.5)} 0 L{f(-dw * 0.55)} {f(-h * 0.16)} C{f(-dw * 1.1)} {f(-h * 0.2)} {f(-dw * 0.9)} {f(-h * 0.3)} 0 {f(-h * 0.3)} '
                   f'C{f(dw * 0.9)} {f(-h * 0.3)} {f(dw * 1.1)} {f(-h * 0.2)} {f(dw * 0.55)} {f(-h * 0.16)} L{f(dw * 0.5)} 0Z" fill="#1A0C06" stroke="{hi}" stroke-width="1" stroke-opacity="0.5"/>')
    del seed
    return grp("".join(out), x, y)


def lgrad_local(card, name):
    st = '<stop offset="0" stop-color="#FFE2B0" stop-opacity="0.25"/><stop offset="0.5" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.35"/>'
    return card.def_once(name, f'<linearGradient id="{card.id(name)}" x1="0" y1="0" x2="0" y2="1">{st}</linearGradient>')


# ---------------------------------------------------------------- Pays dogon

def togu_na(card, x0, x1, y, depth=64, layers=7, straw=("#D9B26A", "#A7803E", "#5E4220"), seed=3):
    """Le toit de la toguna, « maison de la parole » des anciens dogon : huit couches de tiges de mil empilées,
    si bas qu'on ne peut s'y tenir debout — on y parle assis, et l'on ne s'emporte pas."""
    rnd = random.Random(seed)
    hi, mid, lo = straw
    out = []
    lh = depth / layers
    for i in range(layers):
        yy = y - depth + i * lh
        inset = (layers - i) * 3
        g = card.grad(nid("tg"), [(0, hi), (0.7, mid), (1, lo)])
        out.append(f'<path d="M{f(x0 + inset)} {f(yy)} L{f(x1 - inset)} {f(yy)} L{f(x1 - inset + 4)} {f(yy + lh + 3)} L{f(x0 + inset - 4)} {f(yy + lh + 3)}Z" fill="{g}"/>')
        out.append(f'<path d="M{f(x0 + inset - 4)} {f(yy + lh + 2)} L{f(x1 - inset + 4)} {f(yy + lh + 2)}" stroke="#2A1A08" stroke-width="2.2" opacity="0.55"/>')
        strands = []
        xx = x0 + inset - 4
        while xx < x1 - inset + 4:
            L = rnd.uniform(lh * 0.6, lh * 1.5)
            strands.append(f'<line x1="{f(xx)}" y1="{f(yy + 1)}" x2="{f(xx + rnd.uniform(-1.4, 1.4))}" y2="{f(yy + L)}" stroke="{rnd.choice((hi, lo, mid))}" stroke-width="{f(rnd.uniform(0.6, 1.3))}" opacity="0.85"/>')
            xx += rnd.uniform(1.6, 3.4)
        out.append("".join(strands))
    xx = x0 - 6
    fr = []
    while xx < x1 + 6:
        L = rnd.uniform(6, 16)
        fr.append(f'<line x1="{f(xx)}" y1="{f(y + 2)}" x2="{f(xx + rnd.uniform(-2, 2))}" y2="{f(y + 2 + L)}" stroke="{rnd.choice((hi, mid, lo))}" stroke-width="{f(rnd.uniform(0.7, 1.4))}"/>')
        xx += rnd.uniform(1.4, 3)
    out.append("".join(fr))
    return "".join(out)


def toguna_pillar(card, x, y0, y1, w=30, wood=("#8A5A32", "#4A2A14", "#24140A"), seed=2):
    """Pilier sculpté de toguna : bois fourchu, registres de chevrons, losanges et damiers taillés."""
    hi, mid, lo = wood
    g = card.grad(nid("tp"), [(0, lo), (0.3, hi), (0.55, mid), (1, lo)], 0, 0, 1, 0)
    hgt = y1 - y0
    out = [f'<path d="M{f(x - w / 2)} {f(y1)} L{f(x - w / 2 + 2)} {f(y0 + 26)} L{f(x - w / 2 - 6)} {f(y0)} L{f(x - 4)} {f(y0 + 16)} L{f(x + 4)} {f(y0 + 16)} L{f(x + w / 2 + 6)} {f(y0)} L{f(x + w / 2 - 2)} {f(y0 + 26)} L{f(x + w / 2)} {f(y1)}Z" fill="{g}" stroke="{lo}" stroke-width="1"/>']
    reg = 0
    yy = y0 + 40
    while yy < y1 - 30:
        k = reg % 3
        if k == 0:
            for j in range(4):
                out.append(f'<path d="M{f(x - w / 2 + 4)} {f(yy + j * 7)} L{f(x)} {f(yy + j * 7 + 6)} L{f(x + w / 2 - 4)} {f(yy + j * 7)}" fill="none" stroke="{lo}" stroke-width="1.6"/>')
            yy += 34
        elif k == 1:
            out.append(f'<path d="M{f(x)} {f(yy)} L{f(x + w / 2 - 5)} {f(yy + 14)} L{f(x)} {f(yy + 28)} L{f(x - w / 2 + 5)} {f(yy + 14)}Z" fill="none" stroke="{lo}" stroke-width="1.6"/>'
                       f'<circle cx="{f(x)}" cy="{f(yy + 14)}" r="3" fill="{lo}"/>')
            yy += 38
        else:
            for j in range(3):
                for i in range(3):
                    if (i + j) % 2 == 0:
                        out.append(f'<rect x="{f(x - w / 2 + 5 + i * (w - 10) / 3)}" y="{f(yy + j * 6)}" width="{f((w - 10) / 3)}" height="6" fill="{lo}" opacity="0.8"/>')
            yy += 30
        out.append(f'<line x1="{f(x - w / 2 + 2)}" y1="{f(yy - 4)}" x2="{f(x + w / 2 - 2)}" y2="{f(yy - 4)}" stroke="{hi}" stroke-width="0.8" opacity="0.5"/>')
        reg += 1
    del hgt, seed
    return "".join(out)


def granary(card, x, y, s=1.0, mud=("#C98A52", "#9A5E30", "#5A3418"), straw=("#E2BF78", "#A8803E", "#5E4220"), door=True):
    """Grenier dogon : cube de banco sur pierres, chapeau conique de paille, petite porte de bois."""
    hi, mid, lo = mud
    shi, smid, slo = straw
    body = card.grad(nid("gr"), [(0, hi), (0.6, mid), (1, lo)], 0, 0, 1, 0)
    hat = card.grad(nid("gh"), [(0, shi), (0.5, smid), (1, slo)], 0, 0, 1, 0.3)
    m = [f'<path d="M-20 0 L-18 -40 L18 -40 L20 0Z" fill="{body}"/>',
         f'<path d="M-24 2 L24 2 L22 6 L-22 6Z" fill="{lo}" opacity="0.8"/>',
         f'<path d="M-28 -36 L0 -78 L28 -36 Q0 -30 -28 -36Z" fill="{hat}"/>']
    for k in range(7):
        a = -24 + k * 8
        m.append(f'<line x1="{a}" y1="-36" x2="{f(a * 0.2)}" y2="-74" stroke="{slo}" stroke-width="0.8" opacity="0.7"/>')
    m.append(f'<path d="M-2 -78 L0 -86 L2 -78Z" fill="{slo}"/>')
    if door:
        m.append(f'<rect x="-6" y="-30" width="12" height="15" rx="1.5" fill="#3A2210" stroke="{hi}" stroke-width="0.6"/>')
    return grp("".join(m), x, y, s)


def cliff(card, x0, y0, x1, y1, tone=("#D49A6A", "#9C5E3A", "#4A2614"), seed=6, dwellings=14, light="#FFC48A"):
    """La falaise de Bandiagara : grès strié de diaclases, habitations tellem nichées dans la paroi."""
    rnd = random.Random(seed)
    hi, mid, lo = tone
    g = card.grad(nid("cl"), [(0, hi), (0.55, mid), (1, lo)])
    top = [(x0, y0 + rnd.uniform(0, 14))]
    xx = x0
    while xx < x1:
        xx += rnd.uniform(18, 40)
        top.append((min(xx, x1), y0 + rnd.uniform(-6, 16)))
    d = f"M{f(x0)} {f(y1)} L" + " L".join(f"{f(a)} {f(b)}" for a, b in top) + f" L{f(x1)} {f(y1)}Z"
    out = [f'<path d="{d}" fill="{g}"/>']
    for _ in range(int((x1 - x0) / 9)):
        fx = rnd.uniform(x0, x1)
        fy0 = y0 + rnd.uniform(4, 30)
        fy1 = fy0 + rnd.uniform(20, (y1 - y0) * 0.8)
        out.append(f'<path d="M{f(fx)} {f(fy0)} L{f(fx + rnd.uniform(-4, 4))} {f(fy1)}" stroke="{lo}" stroke-width="{f(rnd.uniform(0.6, 1.8))}" opacity="{f(rnd.uniform(0.25, 0.6))}"/>')
    for k in range(3):
        yy = y0 + (y1 - y0) * (0.3 + 0.22 * k)
        out.append(f'<path d="M{f(x0)} {f(yy)} Q{f((x0 + x1) / 2)} {f(yy + rnd.uniform(-6, 6))} {f(x1)} {f(yy + rnd.uniform(-4, 4))}" fill="none" stroke="{hi}" stroke-width="1" opacity="0.35"/>')
    for _ in range(dwellings):
        dx = rnd.uniform(x0 + 8, x1 - 16)
        dy = rnd.uniform(y0 + (y1 - y0) * 0.25, y0 + (y1 - y0) * 0.7)
        dw, dh = rnd.uniform(6, 13), rnd.uniform(6, 11)
        out.append(f'<rect x="{f(dx)}" y="{f(dy)}" width="{f(dw)}" height="{f(dh)}" fill="{_shade(mid, 1.08)}" stroke="{lo}" stroke-width="0.6"/>'
                   f'<rect x="{f(dx + dw * 0.35)}" y="{f(dy + dh * 0.4)}" width="{f(dw * 0.3)}" height="{f(dh * 0.6)}" fill="#1A0C06"/>')
    out.append(f'<path d="{d}" fill="{lgrad_cliff(card, light)}"/>')
    return "".join(out)


def lgrad_cliff(card, light):
    name = nid("clL")
    st = f'<stop offset="0" stop-color="{light}" stop-opacity="0.35"/><stop offset="0.6" stop-color="{light}" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.25"/>'
    return card.def_once(name, f'<linearGradient id="{card.id(name)}" x1="0" y1="0" x2="1" y2="0.4">{st}</linearGradient>')


# ---------------------------------------------------------------- Lalibela

def lalibela_cross(card, cx, cy, s=1.0, rock=("#D98A66", "#A85A3E", "#5A2818"), light_from=-45):
    """L'église monolithe de Lalibela vue du ciel : trois croix grecques emboîtées, taillées d'un seul bloc
    de tuf rouge au fond d'un puits carré."""
    hi, mid, lo = rock

    def cross(a, b):
        return (f"M{f(-b)} {f(-a)} L{f(b)} {f(-a)} L{f(b)} {f(-b)} L{f(a)} {f(-b)} L{f(a)} {f(b)} L{f(b)} {f(b)} "
                f"L{f(b)} {f(a)} L{f(-b)} {f(a)} L{f(-b)} {f(b)} L{f(-a)} {f(b)} L{f(-a)} {f(-b)} L{f(-b)} {f(-b)}Z")

    roof = card.grad(nid("lr"), [(0, hi), (0.6, mid), (1, lo)], 0, 0, 1, 1)
    pit = card.grad(nid("lp"), [(0, "#1A0A06"), (1, "#3A160C")], 0, 0, 1, 1)
    out = [f'<rect x="-104" y="-104" width="208" height="208" rx="6" fill="{pit}"/>',
           f'<path d="{cross(98, 34)}" fill="#000000" opacity="0.55" transform="translate(9 9)"/>',
           f'<path d="{cross(96, 33)}" fill="{roof}" stroke="{lo}" stroke-width="1.4"/>',
           f'<path d="{cross(80, 25)}" fill="none" stroke="{lo}" stroke-width="2" opacity="0.8"/>',
           f'<path d="{cross(80, 25)}" fill="none" stroke="{hi}" stroke-width="1" opacity="0.6" transform="translate(-1.2 -1.2)"/>',
           f'<path d="{cross(62, 17)}" fill="none" stroke="{lo}" stroke-width="2" opacity="0.8"/>',
           f'<path d="{cross(62, 17)}" fill="none" stroke="{hi}" stroke-width="1" opacity="0.6" transform="translate(-1.2 -1.2)"/>',
           f'<rect x="-104" y="-104" width="208" height="208" rx="6" fill="none" stroke="{lo}" stroke-width="3"/>']
    del light_from
    return grp("".join(out), cx, cy, s)


def aksum_window(card, x, y, w, h, kind="cross", wood=("#E0A07A", "#A55A3C", "#4A2010"), beam=7):
    """Fenêtre axoumite taillée dans le roc : cadre à « têtes de singe » (bouts de poutres en saillie) et jour en croix ou en arc."""
    hi, mid, lo = wood
    out = [f'<rect x="{f(x - w / 2 - beam)}" y="{f(y - h / 2 - beam)}" width="{f(w + 2 * beam)}" height="{f(h + 2 * beam)}" fill="{mid}" stroke="{lo}" stroke-width="1"/>']
    for yy in (y - h / 2 - beam / 2, y + h / 2 + beam / 2):
        for xx in (x - w / 2 - beam - 3, x + w / 2 + beam + 3):
            out.append(f'<rect x="{f(xx - 4)}" y="{f(yy - 4)}" width="8" height="8" fill="{hi}" stroke="{lo}" stroke-width="0.8"/>')
    if kind == "cross":
        a, b = w / 2 - 2, w / 6
        out.append(f'<path d="M{f(x - b)} {f(y - h / 2 + 2)} L{f(x + b)} {f(y - h / 2 + 2)} L{f(x + b)} {f(y - b)} L{f(x + a)} {f(y - b)} L{f(x + a)} {f(y + b)} '
                   f'L{f(x + b)} {f(y + b)} L{f(x + b)} {f(y + h / 2 - 2)} L{f(x - b)} {f(y + h / 2 - 2)} L{f(x - b)} {f(y + b)} L{f(x - a)} {f(y + b)} L{f(x - a)} {f(y - b)} L{f(x - b)} {f(y - b)}Z" fill="#140604"/>')
    else:
        out.append(f'<path d="M{f(x - w / 2 + 3)} {f(y + h / 2 - 2)} L{f(x - w / 2 + 3)} {f(y - h / 2 + w / 2)} A{f(w / 2 - 3)} {f(w / 2 - 3)} 0 0 1 {f(x + w / 2 - 3)} {f(y - h / 2 + w / 2)} L{f(x + w / 2 - 3)} {f(y + h / 2 - 2)}Z" fill="#140604"/>')
    out.append(f'<rect x="{f(x - w / 2 - beam)}" y="{f(y - h / 2 - beam)}" width="{f(w + 2 * beam)}" height="2" fill="{hi}" opacity="0.6"/>')
    return "".join(out)


# ---------------------------------------------------------------- Asante : murs à reliefs et toit de chaume

def asante_relief_tile(s=1.0, color="#8A2A1C"):
    """Motif des temples asante (Besease, Bawjiase) : arabesques en relief, spirales, cornes de bélier et fougères."""
    c = color
    return (
        f'<path d="M0 30 C0 10 20 6 26 18 C30 26 22 32 16 28 C12 25 14 20 18 20" fill="none" stroke="{c}" stroke-width="4" stroke-linecap="round"/>'
        f'<path d="M60 30 C60 10 40 6 34 18 C30 26 38 32 44 28 C48 25 46 20 42 20" fill="none" stroke="{c}" stroke-width="4" stroke-linecap="round"/>'
        f'<path d="M30 34 L30 58 M22 44 L30 50 L38 44 M24 54 L30 58 L36 54" fill="none" stroke="{c}" stroke-width="3" stroke-linecap="round"/>'
        f'<path d="M30 4 L35 10 L30 16 L25 10Z" fill="{c}"/>'
    )


def thatch(card, x0, x1, y, depth=26, straw=("#C9A15A", "#8A6A32", "#4A3418"), seed=8):
    """Le bord d'un toit de chaume : un auvent de paille, frangé, qui jette son ombre."""
    rnd = random.Random(seed)
    hi, mid, lo = straw
    g = card.grad(nid("th"), [(0, lo), (0.5, mid), (1, hi)])
    out = [f'<rect x="{f(x0)}" y="{f(y - depth)}" width="{f(x1 - x0)}" height="{f(depth)}" fill="{g}"/>']
    xx = x0
    while xx < x1:
        L = rnd.uniform(depth * 0.5, depth * 1.25)
        out.append(f'<line x1="{f(xx)}" y1="{f(y - depth)}" x2="{f(xx + rnd.uniform(-2, 2))}" y2="{f(y - depth + L)}" stroke="{rnd.choice((hi, mid, lo))}" stroke-width="{f(rnd.uniform(0.6, 1.3))}" opacity="0.9"/>')
        xx += rnd.uniform(1.2, 2.6)
    xx = x0
    while xx < x1:
        L = rnd.uniform(4, 12)
        out.append(f'<line x1="{f(xx)}" y1="{f(y)}" x2="{f(xx + rnd.uniform(-1.5, 1.5))}" y2="{f(y + L)}" stroke="{rnd.choice((hi, mid))}" stroke-width="{f(rnd.uniform(0.6, 1.2))}"/>')
        xx += rnd.uniform(1.4, 2.8)
    out.append(f'<rect x="{f(x0)}" y="{f(y + 6)}" width="{f(x1 - x0)}" height="12" fill="{lgrad_th(card)}"/>')
    return "".join(out)


def lgrad_th(card):
    name = "thatch-shadow"
    st = '<stop offset="0" stop-color="#000000" stop-opacity="0.5"/><stop offset="1" stop-color="#000000" stop-opacity="0"/>'
    return card.def_once(name, f'<linearGradient id="{card.id(name)}" x1="0" y1="0" x2="0" y2="1">{st}</linearGradient>')


# ---------------------------------------------------------------- Grand Zimbabwe : kopje et aloès

def aloe(x, y, s=1.0, leaf="#5E7A4A", dark="#2E3E24", flower="#F07A3A", stalks=2, seed=3):
    """Aloès des collines du Zimbabwe : rosette de feuilles charnues dentées, hampes de fleurs orangées."""
    rnd = random.Random(seed)
    out = []
    for k in range(stalks):
        sx = rnd.uniform(-8, 8)
        hh = rnd.uniform(46, 70)
        out.append(f'<path d="M{f(sx)} -6 Q{f(sx + rnd.uniform(-6, 6))} {f(-hh / 2)} {f(sx + rnd.uniform(-5, 5))} {f(-hh)}" fill="none" stroke="{dark}" stroke-width="1.8"/>')
        tx = sx + rnd.uniform(-5, 5)
        for i in range(9):
            yy = -hh + i * 3.2
            out.append(f'<ellipse cx="{f(tx + rnd.uniform(-1.5, 1.5))}" cy="{f(yy)}" rx="2.2" ry="3.6" fill="{flower}" opacity="{f(1 - i * 0.05)}"/>')
        out.append(f'<ellipse cx="{f(tx)}" cy="{f(-hh - 3)}" rx="2.4" ry="4" fill="#FFB060"/>')
    for i in range(11):
        a = -80 + i * 16
        L = 26 + 8 * math.cos(math.radians(a * 1.1))
        x2, y2 = pt(0, 0, L, a)
        mx, my = pt(0, 0, L * 0.5, a)
        nx, ny = math.cos(math.radians(a)) * 4, math.sin(math.radians(a)) * 4
        out.append(f'<path d="M{f(-nx)} {f(-ny)} Q{f(mx - nx)} {f(my - ny)} {f(x2)} {f(y2)} Q{f(mx + nx)} {f(my + ny)} {f(nx)} {f(ny)}Z" fill="{leaf if i % 2 else dark}" stroke="{dark}" stroke-width="0.6"/>')
    return grp("".join(out), x, y, s)


def boulders(card, x, y, s=1.0, tone=("#9A8A78", "#6A5C4E", "#2E2620"), seed=4):
    """Un kopje : chaos de blocs de granit arrondis, en équilibre (la colline du Grand Zimbabwe)."""
    rnd = random.Random(seed)
    hi, mid, lo = tone
    g = card.grad(nid("bo"), [(0, hi), (0.6, mid), (1, lo)], 0, 0, 1, 1)
    out = []
    specs = [(-60, -20, 46, 30), (-10, -30, 54, 38), (46, -18, 40, 26), (0, -74, 34, 24), (-40, -60, 26, 20), (30, -56, 22, 18)]
    for dx, dy, rx, ry in specs:
        out.append(f'<ellipse cx="{f(dx + _j(rnd, 3))}" cy="{f(dy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{g}" stroke="{lo}" stroke-width="1"/>')
        out.append(f'<path d="M{f(dx - rx * 0.6)} {f(dy - ry * 0.4)} Q{f(dx)} {f(dy - ry * 0.95)} {f(dx + rx * 0.5)} {f(dy - ry * 0.55)}" fill="none" stroke="#FFFFFF" stroke-width="1.2" opacity="0.22"/>')
    return grp("".join(out), x, y, s)


# ---------------------------------------------------------------- Djenné : maisons à façade toucouleur

def djenne_house(card, x, y, w=90, h=110, mud=("#D9935A", "#A9643A", "#6A3818"), seed=1, door=True):
    """Maison de Djenné à façade « toucouleur » : pilastres coiffés de pinacles (sarafar), porte encadrée, fenêtres à claustra."""
    rnd = random.Random(seed)
    hi, mid, lo = mud
    g = card.grad(nid("dh"), [(0, hi), (1, mid)])
    out = [f'<rect x="{f(-w / 2)}" y="{f(-h)}" width="{f(w)}" height="{f(h)}" fill="{g}"/>']
    for px in (-w / 2 + 6, -w / 6, w / 6, w / 2 - 6):
        out.append(f'<path d="M{f(px - 4)} 0 L{f(px - 4)} {f(-h - 10)} C{f(px - 3)} {f(-h - 18)} {f(px + 3)} {f(-h - 18)} {f(px + 4)} {f(-h - 10)} L{f(px + 4)} 0Z" fill="{hi}"/>'
                   f'<path d="M{f(px + 1)} 0 L{f(px + 1)} {f(-h - 14)} C{f(px + 3)} {f(-h - 16)} {f(px + 4)} {f(-h - 12)} {f(px + 4)} {f(-h - 10)} L{f(px + 4)} 0Z" fill="{lo}" opacity="0.4"/>')
    for px in range(int(-w / 2) + 12, int(w / 2) - 8, 9):
        out.append(f'<path d="M{px - 2.5} {f(-h)} L{px - 2} {f(-h - 6)} C{px - 1} {f(-h - 9)} {px + 1} {f(-h - 9)} {px + 2} {f(-h - 6)} L{px + 2.5} {f(-h)}Z" fill="{mid}"/>')
    out.append(f'<rect x="{f(-w * 0.3)}" y="{f(-h * 0.62)}" width="{f(w * 0.6)}" height="5" fill="{lo}" opacity="0.6"/>')
    for wx in (-w * 0.26, w * 0.12):
        out.append(f'<rect x="{f(wx)}" y="{f(-h * 0.86)}" width="{f(w * 0.14)}" height="{f(h * 0.16)}" fill="#2A1408"/>'
                   + "".join(f'<line x1="{f(wx + k * w * 0.035)}" y1="{f(-h * 0.86)}" x2="{f(wx + k * w * 0.035)}" y2="{f(-h * 0.7)}" stroke="{mid}" stroke-width="1"/>' for k in range(1, 4)))
    if door:
        out.append(f'<rect x="{f(-w * 0.12)}" y="{f(-h * 0.42)}" width="{f(w * 0.24)}" height="{f(h * 0.42)}" fill="#24120A" stroke="{lo}" stroke-width="1.2"/>'
                   f'<rect x="{f(-w * 0.17)}" y="{f(-h * 0.47)}" width="{f(w * 0.34)}" height="4" fill="{lo}"/>')
    for _ in range(6):
        tx, ty = rnd.uniform(-w / 2 + 4, w / 2 - 6), rnd.uniform(-h * 0.95, -6)
        out.append(f'<rect x="{f(tx)}" y="{f(ty)}" width="6" height="2" rx="1" fill="#3A1E0C" opacity="0.8"/>')
    return grp("".join(out), x, y)


def toron_buttress(card, x, y0, y1, w=40, mud=("#D9935A", "#A9643A", "#6A3818"), side=1, seed=3, cone=True):
    """Contrefort de banco hérissé de torons (pieux de rônier) : on y grimpe chaque année pour le crépissage."""
    rnd = random.Random(seed)
    hi, mid, lo = mud
    g = card.grad(nid("tb"), [(0, hi), (0.55, mid), (1, lo)] if side > 0 else [(0, lo), (0.45, mid), (1, hi)], 0, 0, 1, 0)
    out = [f'<path d="M{f(x - w / 2)} {f(y1)} L{f(x - w / 2 + 3)} {f(y0 + 14)} C{f(x - w / 4)} {f(y0 - (12 if cone else 0))} {f(x + w / 4)} {f(y0 - (12 if cone else 0))} {f(x + w / 2 - 3)} {f(y0 + 14)} L{f(x + w / 2)} {f(y1)}Z" fill="{g}"/>']
    yy = y0 + 30
    k = 0
    while yy < y1 - 10:
        for dx in ((-w * 0.22, w * 0.22) if k % 2 == 0 else (0,)):
            L = rnd.uniform(14, 22)
            sx = x + dx
            out.append(f'<path d="M{f(sx)} {f(yy)} l{f(L * 0.92)} 2.4" stroke="#000000" stroke-width="3" opacity="0.28"/>'
                       f'<path d="M{f(sx - L * 0.15)} {f(yy)} l{f(L)} 0" stroke="#5A3A1E" stroke-width="3.2" stroke-linecap="round"/>'
                       f'<path d="M{f(sx - L * 0.15)} {f(yy - 0.8)} l{f(L)} 0" stroke="#B88A56" stroke-width="1" stroke-linecap="round" opacity="0.8"/>')
        yy += 30
        k += 1
    return "".join(out)
