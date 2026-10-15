"""Motifs de l'atelier « Royaumes de bronze ».

Chaque motif est dessiné dans un repère local centré, puis posé par une transformation.
Sources des formes :
  - plaques de bronze du royaume du Bénin (Edo, XVIe-XVIIe s.) : léopards, poissons-silures (le silure
    d'Olokun), manilles, rosettes, fond de « feuilles de rivière » (ebe-ame) ;
  - le Sika Dwa Kofi, tabouret d'or de l'Asantehene, et ses cloches ;
  - les murs à chevrons et la tour conique du Grand Zimbabwe, ses oiseaux de stéatite sur colonne ;
  - la Grande Mosquée de Djenné (banco, torons, œufs d'autruche au sommet des tours) ;
  - les parasols royaux akan (kyinie) et leurs pommeaux d'or, les tambours fontomfrom, le bâton d'or
    de l'okyeame (le porte-parole du roi), la kora du djeli mandingue, l'épée eben d'Edo, le kente.
"""

import math
import random
import itertools

from base import f, pt, W, H, METALS, sparkle

from base import nid  # noqa: E402,F401  le compteur des identifiants vit dans Card


def T(x, y, s=1.0, r=0.0, flip=False):
    sx = -s if flip else s
    return f"translate({f(x)} {f(y)}) rotate({f(r)}) scale({f(sx)} {f(s)})"


def grp(markup, x=0, y=0, s=1.0, r=0.0, flip=False, filt=None, op=None):
    a = f' filter="{filt}"' if filt else ""
    o = f' opacity="{op}"' if op is not None else ""
    return f'<g transform="{T(x, y, s, r, flip)}"{a}{o}>{markup}</g>'


# ---------------------------------------------------------------- filtres

def relief(card, name="relief", light="#FFF2D6", scale=3.0, blur=1.1, spec=1.0, exp=22, az=225, el=38,
           diffuse=1.65, drop=0.55, dy=3, sd=3):
    """Relief de fonte : la luminance de la forme devient une hauteur, éclairée de biais (bronze, or repoussé)."""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">'
        f'<feColorMatrix in="SourceGraphic" type="luminanceToAlpha" result="lum"/>'
        f'<feComposite in="lum" in2="SourceAlpha" operator="in" result="h"/>'
        f'<feGaussianBlur in="h" stdDeviation="{blur}" result="hb"/>'
        f'<feDiffuseLighting in="hb" surfaceScale="{scale}" diffuseConstant="1" lighting-color="#FFFFFF" result="df">'
        f'<feDistantLight azimuth="{az}" elevation="{el}"/></feDiffuseLighting>'
        f'<feComposite in="SourceGraphic" in2="df" operator="arithmetic" k1="{diffuse}" k2="0" k3="0" k4="0" result="shade"/>'
        f'<feSpecularLighting in="hb" surfaceScale="{scale}" specularConstant="{spec}" specularExponent="{exp}" lighting-color="{light}" result="sp">'
        f'<feDistantLight azimuth="{az}" elevation="{el}"/></feSpecularLighting>'
        f'<feComposite in="sp" in2="SourceAlpha" operator="in" result="sp2"/>'
        f'<feComposite in="shade" in2="sp2" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lit"/>'
        f'<feComposite in="lit" in2="SourceAlpha" operator="in" result="lit2"/>'
        f'<feGaussianBlur in="SourceAlpha" stdDeviation="{sd}" result="sb"/><feOffset in="sb" dx="0" dy="{dy}" result="so"/>'
        f'<feFlood flood-color="#000000" flood-opacity="{drop}"/><feComposite in2="so" operator="in" result="shadow"/>'
        f'<feMerge><feMergeNode in="shadow"/><feMergeNode in="lit2"/></feMerge></filter>',
    )
    return f"url(#{card.id(name)})"


def grain(card, name="grain", freq=0.85, color=(0.12, 0.06, 0.02), amount=1.6, bias=-0.9, seed=3, octaves=2):
    """Grain de matière (patine, granit, banco) posé sur la forme."""
    r, g_, b = color
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="{octaves}" seed="{seed}" result="n"/>'
        f'<feColorMatrix in="n" type="matrix" values="0 0 0 0 {r}  0 0 0 0 {g_}  0 0 0 0 {b}  {amount} 0 0 0 {bias}" result="sp"/>'
        f'<feComposite in="sp" in2="SourceAlpha" operator="in" result="sp2"/>'
        f'<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="sp2"/></feMerge></filter>',
    )
    return f"url(#{card.id(name)})"


def soft(card, sd):
    return card.blur(f"soft{sd}", sd)


def cyl(card, name, dark, mid, hi):
    """Dégradé horizontal de cylindre (hampe, tambour, colonne)."""
    return card.grad(name, [(0, dark), (0.25, mid), (0.42, hi), (0.6, mid), (1, dark)], 0, 0, 1, 0)


def vmetal(card, name, key):
    hi, mid, lo = METALS[key]
    return card.grad(name, [(0, hi), (0.35, mid), (0.55, lo), (0.75, mid), (1, hi)], 0, 0, 0, 1)


# ---------------------------------------------------------------- petits objets

def cowrie(card, x, y, s=1.0, r=0.0, back=False):
    """Cauri (Monetaria moneta), face ventrale : la fente dentée. Monnaie et parure royale."""
    body = card.rgrad("cowrie", [(0, "#FFFBF0", 1), (0.55, "#EFDDB5", 1), (1, "#B48A55", 1)], 0.38, 0.32, 0.72)
    if back:
        m = (
            f'<ellipse cx="0" cy="2" rx="11" ry="16" fill="#000000" opacity="0.3"/>'
            f'<ellipse rx="11" ry="16" fill="{body}" stroke="#8A6A3E" stroke-width="0.7"/>'
            f'<path d="M-6 -8 C-2 -12 3 -11 5 -7" fill="none" stroke="#FFFFFF" stroke-width="2" opacity="0.7" stroke-linecap="round"/>'
        )
        return grp(m, x, y, s, r)
    teeth = "".join(
        f'<line x1="-3.6" y1="{f(i * 2.3)}" x2="-0.7" y2="{f(i * 2.3)}"/><line x1="0.7" y1="{f(i * 2.3)}" x2="3.6" y2="{f(i * 2.3)}"/>'
        for i in range(-5, 6)
    )
    m = (
        f'<ellipse cx="0" cy="2" rx="11" ry="16" fill="#000000" opacity="0.3"/>'
        f'<ellipse rx="11" ry="16" fill="{body}" stroke="#8A6A3E" stroke-width="0.7"/>'
        f'<path d="M0 -14 C-3.4 -6 -3.4 6 0 14 C3.4 6 3.4 -6 0 -14Z" fill="#4A2C12"/>'
        f'<g stroke="#FBF1DC" stroke-width="1.1" stroke-linecap="round">{teeth}</g>'
        f'<ellipse cx="-5.5" cy="-7" rx="2.2" ry="4.5" fill="#FFFFFF" opacity="0.55"/>'
    )
    return grp(m, x, y, s, r)


def manilla(card, x, y, s=1.0, r=0.0, metal="copper"):
    """Manille : bracelet ouvert de cuivre ou de laiton, monnaie de la côte du Bénin."""
    hi, mid, lo = METALS[metal]
    stroke = card.grad(f"man-{metal}", [(0, hi), (0.5, mid), (1, lo)], 0, 0, 1, 1)
    x0, y0 = pt(0, 0, 20, 148)
    x1, y1 = pt(0, 0, 20, 212)
    arc = f"M{f(x0)} {f(y0)} A20 20 0 1 0 {f(x1)} {f(y1)}"
    m = (
        f'<path d="{arc}" fill="none" stroke="#000000" stroke-width="8" opacity="0.35" transform="translate(0 2.5)"/>'
        f'<path d="{arc}" fill="none" stroke="{stroke}" stroke-width="7" stroke-linecap="round"/>'
        f'<path d="{arc}" fill="none" stroke="{hi}" stroke-width="1.6" opacity="0.7" transform="translate(-1.3 -1.3)"/>'
        f'<ellipse cx="{f(x0 + 1)}" cy="{f(y0 + 3)}" rx="6.5" ry="4.2" fill="{mid}" stroke="{lo}" stroke-width="1" transform="rotate(-30 {f(x0 + 1)} {f(y0 + 3)})"/>'
        f'<ellipse cx="{f(x1 - 1)}" cy="{f(y1 + 3)}" rx="6.5" ry="4.2" fill="{mid}" stroke="{lo}" stroke-width="1" transform="rotate(30 {f(x1 - 1)} {f(y1 + 3)})"/>'
    )
    return grp(m, x, y, s, r)


def rosette(x, y, s, fill, line, boss, r=0.0):
    """Rosette des plaques d'Edo : quatre pétales, quatre feuilles, un bouton central."""
    big = "M0 -5 C6 -11 6 -19 0 -26 C-6 -19 -6 -11 0 -5Z"
    out = []
    for a in (0, 90, 180, 270):
        out.append(f'<path d="{big}" fill="{fill}" stroke="{line}" stroke-width="1.2" transform="rotate({a})"/>')
        out.append(f'<path d="M0 -8 L0 -22" stroke="{line}" stroke-width="0.9" transform="rotate({a})"/>')
    for a in (45, 135, 225, 315):
        out.append(f'<path d="{big}" fill="{fill}" stroke="{line}" stroke-width="1" transform="rotate({a}) scale(0.55)"/>')
    out.append(f'<circle r="7" fill="{boss}" stroke="{line}" stroke-width="1.4"/><circle r="3" fill="{line}"/>')
    return grp("".join(out), x, y, s, r)


def bell(x, y, s, fill, line, r=0.0):
    m = (
        f'<circle cx="0" cy="-14" r="2.4" fill="none" stroke="{line}" stroke-width="1.2"/>'
        f'<path d="M-6 0 C-6 -8 -4 -12 0 -12 C4 -12 6 -8 6 0 L8.5 3 L-8.5 3 Z" fill="{fill}" stroke="{line}" stroke-width="0.9"/>'
        f'<path d="M-3 -9 C-2 -10 0 -10.5 1 -10.5" stroke="#FFFFFF" stroke-width="1.2" opacity="0.6" fill="none"/>'
        f'<circle cx="0" cy="5.5" r="2.2" fill="{line}"/>'
    )
    return grp(m, x, y, s, r)


def nugget(card, x, y, s, seed, r=0.0):
    """Pépite d'or (l'or du Bambouk et du Bouré, celui de Mansa Musa)."""
    rnd = random.Random(seed)
    n = 9
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        rr = rnd.uniform(0.7, 1.0) * 10
        pts.append((rr * math.cos(a) * 1.2, rr * math.sin(a)))
    d = "M" + " L".join(f"{f(px)} {f(py)}" for px, py in pts) + "Z"
    fill = card.rgrad("nug", [(0, "#FFF6C8", 1), (0.45, "#F2C14E", 1), (1, "#8A5A12", 1)], 0.35, 0.3, 0.75)
    m = (
        f'<path d="{d}" fill="#000000" opacity="0.35" transform="translate(1 2.5)"/>'
        f'<path d="{d}" fill="{fill}" stroke="#7A4A0E" stroke-width="0.6" stroke-linejoin="round"/>'
        f'<path d="M-6 -4 L-1 -6 L2 -3" fill="none" stroke="#FFFFFF" stroke-width="1.3" opacity="0.8" stroke-linecap="round"/>'
    )
    return grp(m, x, y, s, r)


def gold_dust(x0, y0, x1, y1, n, seed, color="#FFD66B", rmax=1.6, avoid=True):
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if avoid and 95 < x < 445 and 300 < y < 700:
            continue
        rr = rnd.uniform(0.4, rmax)
        if rnd.random() < 0.12:
            out.append(sparkle(x, y, rr * 4, color, f(rnd.uniform(0.6, 1))))
        else:
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rr)}" fill="{color}" opacity="{f(rnd.uniform(0.35, 0.95))}"/>')
    return "".join(out)


# ---------------------------------------------------------------- Bénin

def leopard_head(card, x, y, s=1.0, metal=("#E9B877", "#A8692F", "#4A2810"), eyes="#F3E6C8"):
    """Tête de léopard d'Edo (masque de hanche, aquamanile) : le léopard est le roi de la brousse, l'Oba celui de la ville."""
    hi, mid, lo = metal
    face = card.rgrad("leo-face", [(0, hi, 1), (0.6, mid, 1), (1, lo, 1)], 0.45, 0.35, 0.75)
    spots_xy = [(-26, -30), (-14, -36), (0, -38), (14, -36), (26, -30), (-34, -16), (34, -16), (-20, -24), (20, -24),
                (-8, -28), (8, -28), (-38, 2), (38, 2), (-32, 16), (32, 16), (-24, 30), (24, 30), (-36, -4), (36, -4)]
    spots = "".join(
        f'<circle cx="{sx}" cy="{sy}" r="3.6" fill="{lo}" opacity="0.85"/><circle cx="{sx}" cy="{sy}" r="1.4" fill="{hi}"/>'
        for sx, sy in spots_xy
    )
    teeth = "".join(f'<path d="M{-12 + 4 * i} 33 L{-10 + 4 * i} 38 L{-8 + 4 * i} 33Z" fill="{eyes}"/>' for i in range(6))
    m = (
        f'<circle cx="-33" cy="-36" r="14" fill="{mid}" stroke="{lo}" stroke-width="2"/><circle cx="-33" cy="-36" r="7" fill="{lo}"/>'
        f'<circle cx="33" cy="-36" r="14" fill="{mid}" stroke="{lo}" stroke-width="2"/><circle cx="33" cy="-36" r="7" fill="{lo}"/>'
        f'<path d="M-46 -4 C-48 -40 -24 -50 0 -50 C24 -50 48 -40 46 -4 C44 24 28 46 0 50 C-28 46 -44 24 -46 -4Z" fill="{face}" stroke="{lo}" stroke-width="2.2"/>'
        f'{spots}'
        f'<path d="M-30 -14 C-24 -22 -10 -22 -4 -14" fill="none" stroke="{lo}" stroke-width="2.4"/>'
        f'<path d="M30 -14 C24 -22 10 -22 4 -14" fill="none" stroke="{lo}" stroke-width="2.4"/>'
        f'<path d="M-29 -8 C-22 -16 -10 -14 -6 -6 C-12 -2 -22 -2 -29 -8Z" fill="{eyes}" stroke="{lo}" stroke-width="1.6"/>'
        f'<path d="M29 -8 C22 -16 10 -14 6 -6 C12 -2 22 -2 29 -8Z" fill="{eyes}" stroke="{lo}" stroke-width="1.6"/>'
        f'<circle cx="-16" cy="-8" r="3.4" fill="#1A0E06"/><circle cx="16" cy="-8" r="3.4" fill="#1A0E06"/>'
        f'<path d="M-4 -12 L-6 10 M4 -12 L6 10" stroke="{lo}" stroke-width="1.6" fill="none"/>'
        f'<path d="M-10 10 L10 10 L0 20Z" fill="{lo}"/>'
        f'<path d="M0 20 C-4 26 -12 28 -22 24 M0 20 C4 26 12 28 22 24" fill="none" stroke="{lo}" stroke-width="2"/>'
        f'<ellipse cx="-12" cy="26" rx="11" ry="8" fill="{mid}" stroke="{lo}" stroke-width="1.4"/>'
        f'<ellipse cx="12" cy="26" rx="11" ry="8" fill="{mid}" stroke="{lo}" stroke-width="1.4"/>'
        + "".join(f'<circle cx="{sx}" cy="{sy}" r="1.2" fill="{lo}"/>' for sx, sy in ((-16, 24), (-10, 27), (-15, 30), (16, 24), (10, 27), (15, 30)))
        + f'<path d="M-14 32 C-8 44 8 44 14 32Z" fill="#2A1408" stroke="{lo}" stroke-width="1.2"/>{teeth}'
        f'<path d="M-9 34 L-7 42 L-5 34Z M9 34 L7 42 L5 34Z" fill="{eyes}"/>'
    )
    return grp(m, x, y, s)


def mudfish(card, x, y, s=1.0, r=0.0, flip=False, metal=("#E9B877", "#A8692F", "#4A2810")):
    """Le poisson-silure d'Olokun : il vit entre l'eau et la terre, comme l'Oba entre les hommes et les dieux."""
    hi, mid, lo = metal
    body = card.grad("mf-body", [(0, hi), (0.55, mid), (1, lo)], 0, 0, 0, 1)
    d = ("M60 0 C60 -10 52 -16 40 -17 C24 -18 0 -14 -30 -9 C-38 -8 -44 -6 -48 -4 C-56 -16 -68 -14 -71 0 "
         "C-68 14 -56 16 -48 4 C-44 6 -38 8 -30 9 C0 14 24 18 40 17 C52 16 60 10 60 0Z")
    chev = "".join(f'<path d="M{xx} -8 L{xx - 5} 0 L{xx} 8" fill="none" stroke="{lo}" stroke-width="1.2"/>' for xx in range(-28, 26, 8))
    m = (
        f'<path d="M57 2 C70 0 78 6 82 14 M57 6 C65 10 69 18 68 27 M55 -4 C67 -10 76 -10 84 -6 M53 9 C56 17 55 25 50 31" fill="none" stroke="{mid}" stroke-width="2.4" stroke-linecap="round"/>'
        f'<path d="M-42 -7 C-30 -17 -8 -22 20 -20 L22 -16 C-6 -17 -28 -13 -42 -5Z" fill="{hi}" stroke="{lo}" stroke-width="1"/>'
        f'<path d="M-40 7 C-28 15 -10 18 6 17 L8 14 C-10 14 -26 12 -40 5Z" fill="{mid}" stroke="{lo}" stroke-width="1"/>'
        f'<path d="{d}" fill="{body}" stroke="{lo}" stroke-width="1.8"/>'
        f'<path d="M-50 -2 L-66 -8 M-50 0 L-68 0 M-50 2 L-66 8" stroke="{lo}" stroke-width="1"/>'
        f'{chev}'
        + "".join(f'<circle cx="{xx}" cy="-12" r="1.2" fill="{lo}"/>' for xx in range(-20, 30, 7))
        + f'<path d="M30 -15 C25 -5 25 5 30 15" fill="none" stroke="{lo}" stroke-width="1.6"/>'
        f'<path d="M26 12 C20 22 10 26 4 24 C10 20 16 16 22 10Z" fill="{mid}" stroke="{lo}" stroke-width="1"/>'
        f'<circle cx="46" cy="-6" r="3.4" fill="{hi}" stroke="{lo}" stroke-width="1.3"/><circle cx="46" cy="-6" r="1.3" fill="{lo}"/>'
    )
    return grp(m, x, y, s, r, flip)


def leaf_pattern(card, name="leaf", color="#3B220E", bg=None, size=18, op=0.75):
    """Fond des plaques d'Edo : « feuilles de rivière » incisées en quadrilobes."""
    petal = f"M{size / 2} {size / 2} Q{size / 2 + 3.4} {size / 2 - 3.6} {size / 2} {size / 2 - 8} Q{size / 2 - 3.4} {size / 2 - 3.6} {size / 2} {size / 2}Z"
    petals = "".join(f'<path d="{petal}" transform="rotate({a} {size / 2} {size / 2})"/>' for a in (0, 90, 180, 270))
    bgm = f'<rect width="{size}" height="{size}" fill="{bg}"/>' if bg else ""
    card.def_once(
        name,
        f'<pattern id="{card.id(name)}" width="{size}" height="{size}" patternUnits="userSpaceOnUse">{bgm}'
        f'<g fill="none" stroke="{color}" stroke-width="0.9" opacity="{op}">{petals}</g>'
        f'<circle cx="{size / 2}" cy="{size / 2}" r="1" fill="{color}" opacity="{op}"/></pattern>',
    )
    return f"url(#{card.id(name)})"


def benin_plaque(card, x, y, w, h, inner, tones=("#C9925A", "#93592C", "#5E3518"), line="#3B220E"):
    """Plaque de palais d'Edo : fond de feuilles de rivière, bord perlé, rosettes d'angle, motif en haut relief."""
    hi, mid, lo = tones
    bg = card.grad("bp-bg", [(0, hi), (0.5, mid), (1, lo)], 0, 0, 0.4, 1)
    leaf = leaf_pattern(card, "bp-leaf", line)
    dots = []
    for i in range(int(w // 7)):
        dots.append(f'<circle cx="{f(x + 4 + i * 7)}" cy="{f(y + 4)}" r="1.4" fill="{hi}"/><circle cx="{f(x + 4 + i * 7)}" cy="{f(y + h - 4)}" r="1.4" fill="{hi}"/>')
    for i in range(int(h // 7)):
        dots.append(f'<circle cx="{f(x + 4)}" cy="{f(y + 4 + i * 7)}" r="1.4" fill="{hi}"/><circle cx="{f(x + w - 4)}" cy="{f(y + 4 + i * 7)}" r="1.4" fill="{hi}"/>')
    m = (
        f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="3" fill="{bg}" stroke="{lo}" stroke-width="1.5"/>'
        f'<rect x="{f(x + 8)}" y="{f(y + 8)}" width="{f(w - 16)}" height="{f(h - 16)}" fill="{leaf}"/>'
        f'<rect x="{f(x + 8)}" y="{f(y + 8)}" width="{f(w - 16)}" height="{f(h - 16)}" fill="none" stroke="{line}" stroke-width="1.2" opacity="0.7"/>'
        + "".join(dots)
        + rosette(x + 12, y + 12, 0.28, hi, line, mid)
        + rosette(x + w - 12, y + 12, 0.28, hi, line, mid)
        + rosette(x + 12, y + h - 12, 0.28, hi, line, mid)
        + rosette(x + w - 12, y + h - 12, 0.28, hi, line, mid)
        + inner
    )
    return m


def sankofa_bird(card, metal=("#FFF6CC", "#E8B53C", "#7A4A0E")):
    """L'oiseau Sankofa, pieds tournés vers l'avant, tête retournée vers l'œuf posé sur son dos :
    « retourne chercher ce que tu as laissé derrière toi ». Pommeau d'or des parasols et des bâtons akan."""
    hi, mid, lo = metal
    gold = card.grad("sk-gold", [(0, hi), (0.5, mid), (1, lo)], 0, 0, 1, 1)
    return (
        f'<path d="M-4 8 L-6 24 M8 8 L10 24" stroke="{lo}" stroke-width="3.2" stroke-linecap="round"/>'
        f'<path d="M-14 24 L0 24 M-6 24 L-2 20 M4 24 L18 24 M10 24 L14 20" stroke="{lo}" stroke-width="2.4" stroke-linecap="round"/>'
        f'<path d="M-24 -6 C-34 -14 -44 -30 -50 -40 C-42 -36 -36 -32 -30 -30 C-36 -38 -38 -46 -38 -52 C-30 -40 -24 -28 -16 -18Z" fill="{gold}" stroke="{lo}" stroke-width="1.2" stroke-linejoin="round"/>'
        f'<path d="M26 -8 C28 -22 16 -28 2 -26 C-14 -24 -26 -14 -28 -2 C-22 8 -6 12 8 10 C20 8 26 2 26 -8Z" fill="{gold}" stroke="{lo}" stroke-width="1.4"/>'
        f'<path d="M-20 -6 C-10 -14 4 -16 16 -12 C8 -4 -6 0 -20 -6Z" fill="none" stroke="{lo}" stroke-width="1" opacity="0.8"/>'
        f'<path d="M-16 -2 L-8 -6 M-10 2 L-2 -2 M-4 5 L4 1" stroke="{lo}" stroke-width="0.9" opacity="0.7"/>'
        f'<path d="M20 -20 C26 -36 22 -50 10 -54 C0 -57 -8 -50 -8 -42" fill="none" stroke="{lo}" stroke-width="7.4" stroke-linecap="round"/>'
        f'<path d="M20 -20 C26 -36 22 -50 10 -54 C0 -57 -8 -50 -8 -42" fill="none" stroke="{gold}" stroke-width="5.4" stroke-linecap="round"/>'
        f'<circle cx="-8" cy="-40" r="9" fill="{gold}" stroke="{lo}" stroke-width="1.3"/>'
        f'<circle cx="-5" cy="-43" r="2" fill="{lo}"/><circle cx="-4.4" cy="-43.6" r="0.7" fill="{hi}"/>'
        f'<path d="M-14 -36 L-15 -24 L-8 -32Z" fill="{mid}" stroke="{lo}" stroke-width="0.9"/>'
        f'<ellipse cx="-12" cy="-18" rx="7" ry="8.5" fill="#FFF8E4" stroke="{lo}" stroke-width="1.1" transform="rotate(-25 -12 -18)"/>'
        f'<ellipse cx="-14" cy="-21" rx="1.8" ry="3" fill="#FFFFFF"/>'
    )


def akrafokonmu(card, x, y, R=110, metal=("#FFF6CC", "#E8B53C", "#8A5A12"), filt=None):
    """L'akrafokonmu, disque d'or que portent sur la poitrine les « laveurs d'âme » du roi asante : un soleil repoussé."""
    hi, mid, lo = metal
    g = card.rgrad("ak-g", [(0, hi, 1), (0.5, mid, 1), (0.85, lo, 1), (1, mid, 1)], 0.42, 0.38, 0.7)
    out = [f'<circle r="{R}" fill="{g}" stroke="{lo}" stroke-width="2"/>']
    out.append("".join(f'<circle cx="{f(pt(0, 0, R * 0.95, a)[0])}" cy="{f(pt(0, 0, R * 0.95, a)[1])}" r="{f(R * 0.028)}" fill="{hi}" stroke="{lo}" stroke-width="0.6"/>' for a in range(0, 360, 6)))
    out.append(f'<circle r="{f(R * 0.89)}" fill="none" stroke="{lo}" stroke-width="1.6"/>')
    for i in range(32):
        a = i * 360 / 32
        L = R * (0.86 if i % 2 == 0 else 0.74)
        x0, y0 = pt(0, 0, R * 0.44, a - 4)
        x1, y1 = pt(0, 0, L, a)
        x2, y2 = pt(0, 0, R * 0.44, a + 4)
        out.append(f'<path d="M{f(x0)} {f(y0)} L{f(x1)} {f(y1)} L{f(x2)} {f(y2)}Z" fill="{hi if i % 2 == 0 else mid}" stroke="{lo}" stroke-width="0.8"/>')
    out.append(f'<circle r="{f(R * 0.44)}" fill="{g}" stroke="{lo}" stroke-width="1.4"/>')
    out.append("".join(f'<circle cx="{f(pt(0, 0, R * 0.38, a)[0])}" cy="{f(pt(0, 0, R * 0.38, a)[1])}" r="{f(R * 0.045)}" fill="none" stroke="{lo}" stroke-width="1"/>' for a in range(0, 360, 15)))
    for a in (0, 90, 180, 270):
        out.append(f'<path d="M0 0 C{f(R * 0.08)} {f(-R * 0.12)} {f(R * 0.06)} {f(-R * 0.26)} 0 {f(-R * 0.3)} C{f(-R * 0.06)} {f(-R * 0.26)} {f(-R * 0.08)} {f(-R * 0.12)} 0 0Z" fill="{hi}" stroke="{lo}" stroke-width="1" transform="rotate({a})"/>')
    out.append(f'<circle r="{f(R * 0.07)}" fill="{mid}" stroke="{lo}" stroke-width="1"/>')
    return grp("".join(out), x, y, 1, 0, False, filt)


def eben(card, x, y, s=1.0, r=0.0, metal="gold"):
    """L'eben d'Edo : épée de cérémonie à lame ajourée en éventail, qu'on fait tournoyer pour saluer l'Oba."""
    hi, mid, lo = METALS[metal]
    fill = card.grad(f"eben-{metal}", [(0, hi), (0.5, mid), (1, lo)], 0, 0, 1, 1)
    ring = "".join(f'<circle cx="{f(pt(0, -52, 22, a)[0])}" cy="{f(pt(0, -52, 22, a)[1])}" r="2.2" fill="#1A0E06"/>' for a in range(-100, 101, 25))
    holes = (
        ring
        + f'<path d="M0 -64 L6 -52 L0 -40 L-6 -52Z M-12 -52 L-6 -46 L-12 -40 L-18 -46Z M12 -52 L18 -46 L12 -40 L6 -46Z" fill="#1A0E06"/>'
        + f'<path d="M0 -34 L4 -18 L0 -2 L-4 -18Z" fill="#1A0E06"/>'
        + f'<circle cx="0" cy="-52" r="3" fill="{hi}"/>'
    )
    m = (
        f'<path d="M-5 36 C-6 10 -20 -26 -30 -52 C-34 -82 34 -82 30 -52 C20 -26 6 10 5 36Z" fill="{fill}" stroke="{lo}" stroke-width="1.6"/>'
        f'<path d="M-3 30 C-4 8 -16 -24 -24 -50 C-27 -74 27 -74 24 -50 C16 -24 4 8 3 30" fill="none" stroke="{lo}" stroke-width="0.9" opacity="0.7"/>'
        f'{holes}'
        f'<path d="M-16 36 L16 36 L13 42 L-13 42Z" fill="{mid}" stroke="{lo}" stroke-width="1.2"/>'
        f'<rect x="-4.5" y="42" width="9" height="34" rx="3" fill="{lo}"/>'
        + "".join(f'<line x1="-4.5" y1="{46 + i * 6}" x2="4.5" y2="{48 + i * 6}" stroke="{hi}" stroke-width="1.4"/>' for i in range(5))
        + f'<circle cx="0" cy="80" r="6.5" fill="{mid}" stroke="{lo}" stroke-width="1.2"/>'
    )
    return grp(m, x, y, s, r)


# ---------------------------------------------------------------- Asante

def golden_stool(card, x, y, s=1.0, bells=True, glow=True):
    """Le Sika Dwa Kofi : le tabouret d'or né un vendredi, descendu du ciel sur les genoux d'Osei Tutu, âme de la nation asante."""
    gold = card.grad("stool-g", [(0, "#FFF6CC"), (0.3, "#F5C94F"), (0.55, "#B07A16"), (0.75, "#E9B53C"), (1, "#FFE7A0")], 0, 0, 0, 1)
    goldh = card.grad("stool-h", [(0, "#8A5A12"), (0.25, "#E8B53C"), (0.45, "#FFF4C2"), (0.65, "#E8B53C"), (1, "#7A4A0E")], 0, 0, 1, 0)
    lo = "#6E430C"
    seat = "M-104 -62 C-80 -42 -40 -30 0 -30 C40 -30 80 -42 104 -62 L100 -44 C76 -22 40 -12 0 -12 C-40 -12 -76 -22 -100 -44Z"
    dots = "".join(f'<circle cx="{f(xx)}" cy="{f(-20 - 0.0022 * xx * xx)}" r="1.6" fill="{lo}"/>' for xx in range(-84, 88, 8))
    loz = "".join(f'<path d="M{xx} 58 L{xx + 6} 52 L{xx + 12} 58 L{xx + 6} 64Z" fill="none" stroke="{lo}" stroke-width="1.2"/>' for xx in range(-84, 80, 14))
    m = []
    if glow:
        m.append(f'<ellipse cx="0" cy="0" rx="150" ry="100" fill="{card.rgrad("stool-glow", [(0, "#FFD66B", 0.55), (1, "#FFD66B", 0)])}"/>')
    m.append(
        f'<path d="M-90 52 L90 52 L98 74 L-98 74Z" fill="{gold}" stroke="{lo}" stroke-width="1.6"/>'
        f'<rect x="-104" y="72" width="208" height="8" rx="2" fill="{goldh}" stroke="{lo}" stroke-width="1.2"/>'
        f'{loz}'
        f'<path d="M-78 -8 L-62 -8 L-58 52 L-80 52Z" fill="{goldh}" stroke="{lo}" stroke-width="1.4"/>'
        f'<path d="M78 -8 L62 -8 L58 52 L80 52Z" fill="{goldh}" stroke="{lo}" stroke-width="1.4"/>'
        f'<path d="M-30 -10 L30 -10 C22 8 22 30 32 52 L-32 52 C-22 30 -22 8 -30 -10Z" fill="{goldh}" stroke="{lo}" stroke-width="1.6"/>'
        f'<path d="M-24 2 C-10 10 10 10 24 2 M-22 18 C-8 26 8 26 22 18 M-24 34 C-10 42 10 42 24 34" fill="none" stroke="{lo}" stroke-width="1.3"/>'
        f'<circle cx="0" cy="12" r="5" fill="none" stroke="{lo}" stroke-width="1.3"/><circle cx="0" cy="28" r="5" fill="none" stroke="{lo}" stroke-width="1.3"/>'
        f'<path d="{seat}" fill="{gold}" stroke="{lo}" stroke-width="1.8"/>'
        f'<path d="M-100 -58 C-76 -38 -40 -26 0 -26 C40 -26 76 -38 100 -58" fill="none" stroke="#FFF8DA" stroke-width="2" opacity="0.8"/>'
        f'{dots}'
        f'<path d="M-96 -8 L96 -8 L94 -2 L-94 -2Z" fill="{gold}" stroke="{lo}" stroke-width="1"/>'
    )
    if bells:
        for bx, by, chain in ((-104, -62, 26), (104, -62, 26), (-80, -44, 40), (80, -44, 40)):
            links = "".join(f'<circle cx="{bx}" cy="{by + 4 + i * 5}" r="1.5" fill="none" stroke="{lo}" stroke-width="1"/>' for i in range(chain // 5))
            m.append(links + bell(bx, by + chain + 14, 1.1, "#F2C14E", lo))
    return grp("".join(m), x, y, s)


def kente(x, y, w, h, seed=0, palette=("#E8B53C", "#1E6B3C", "#A51F1F", "#14100C")):
    """Une bande de kente asante : alternance de blocs à chaîne rayée et de blocs à trame (motif oyokoman)."""
    gold, green, red, black = palette
    rnd = random.Random(seed)
    out = [f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="{gold}"/>']
    bw = h
    i = 0
    xx = x
    while xx < x + w - 0.5:
        bwi = min(bw, x + w - xx)
        if i % 2 == 0:
            stripes = [gold, green, gold, red, gold, black, gold, green, gold]
            sw = bwi / len(stripes)
            for k, c in enumerate(stripes):
                out.append(f'<rect x="{f(xx + k * sw)}" y="{f(y)}" width="{f(sw + 0.3)}" height="{f(h)}" fill="{c}"/>')
        else:
            base = rnd.choice([green, black, red])
            out.append(f'<rect x="{f(xx)}" y="{f(y)}" width="{f(bwi)}" height="{f(h)}" fill="{base}"/>')
            for k in range(3):
                out.append(f'<rect x="{f(xx)}" y="{f(y + h * (0.18 + k * 0.27))}" width="{f(bwi)}" height="{f(h * 0.1)}" fill="{gold}"/>')
            out.append(f'<path d="M{f(xx + bwi / 2)} {f(y + h * 0.2)} L{f(xx + bwi * 0.8)} {f(y + h / 2)} L{f(xx + bwi / 2)} {f(y + h * 0.8)} L{f(xx + bwi * 0.2)} {f(y + h / 2)}Z" fill="none" stroke="{gold}" stroke-width="{f(h * 0.07)}"/>')
        xx += bwi
        i += 1
    out.append(f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="none" stroke="#000000" stroke-opacity="0.35" stroke-width="1"/>')
    return "".join(out)


def parasol(card, x, y, s=1.0, colors=("#8E1B1B", "#E8B53C", "#1A1210"), finial="sankofa", shaft=200, tilt=0.0):
    """Le kyinie, parasol royal akan : il dit qu'un roi est là ; le pommeau d'or (ntuatire) porte un proverbe."""
    uid = nid("ps")
    c1, c2, c3 = colors
    dome = "M-86 0 C-86 -52 -50 -84 0 -84 C50 -84 86 -52 86 0Z"
    card.def_once(uid, f'<clipPath id="{card.id(uid)}"><path d="{dome}"/></clipPath>')
    gores = []
    n = 8
    for i in range(n):
        xa = -90 + 180 * i / n
        xb = -90 + 180 * (i + 1) / n
        col = (c1, c2, c3, c2)[i % 4]
        gores.append(f'<path d="M0 -90 L{f(xa)} 4 L{f(xb)} 4Z" fill="{col}"/>')
    seams = "".join(f'<path d="M0 -84 Q{f((-90 + 180 * i / n) * 0.55)} -50 {f(-90 + 180 * i / n)} 0" fill="none" stroke="#FFE08A" stroke-width="1.4"/>' for i in range(1, n))
    shade = card.rgrad("ps-shade", [(0, "#FFFFFF", 0.35), (0.5, "#FFFFFF", 0.0), (1, "#000000", 0.55)], 0.35, 0.25, 0.85)
    scal = []
    k = 10
    for i in range(k):
        xa = -86 + 172 * i / k
        xb = -86 + 172 * (i + 1) / k
        col = (c2, c1, c3)[i % 3]
        scal.append(f'<path d="M{f(xa)} -2 L{f(xb)} -2 L{f(xb)} 8 Q{f((xa + xb) / 2)} 26 {f(xa)} 8Z" fill="{col}" stroke="#FFE08A" stroke-width="1"/>')
        scal.append(f'<line x1="{f((xa + xb) / 2)}" y1="20" x2="{f((xa + xb) / 2)}" y2="34" stroke="#FFD66B" stroke-width="1.2"/><circle cx="{f((xa + xb) / 2)}" cy="36" r="2.6" fill="#FFD66B"/>')
    gold = card.grad("ps-gold", [(0, "#FFF4C2"), (0.5, "#E8B53C"), (1, "#8A5A12")], 0, 0, 1, 1)
    shaftg = cyl(card, "ps-shaft", "#6E430C", "#D9A33A", "#FFF0B8")
    fin = ""
    if finial == "sankofa":
        fin = grp(sankofa_bird(card), 0, -104, 0.62)
    elif finial == "star":
        fin = f'<circle cx="0" cy="-114" r="12" fill="{gold}" stroke="#7A4A0E" stroke-width="1"/>' + sparkle(0, -114, 24, "#FFF4C2", 0.9)
    elif finial == "egg":
        fin = (
            f'<path d="M-12 -98 C-14 -106 -8 -110 0 -110 C8 -110 14 -106 12 -98Z" fill="{gold}"/>'
            f'<ellipse cx="0" cy="-120" rx="9" ry="12" fill="#FFF6DC" stroke="#7A4A0E" stroke-width="1"/>'
        )
    elif finial == "leopard":
        fin = leopard_head(card, 0, -114, 0.32)
    m = (
        f'<rect x="-3" y="20" width="6" height="{shaft}" fill="{shaftg}"/>'
        f'<g clip-path="url(#{card.id(uid)})">{"".join(gores)}{seams}<path d="{dome}" fill="{shade}"/></g>'
        f'<path d="{dome}" fill="none" stroke="#FFE08A" stroke-width="1.6"/>'
        f'{"".join(scal)}'
        f'<rect x="-9" y="-96" width="18" height="12" rx="2" fill="{gold}" stroke="#7A4A0E" stroke-width="1"/>'
        f'{fin}'
    )
    return grp(m, x, y, s, tilt)


def drum(card, x, y, s=1.0, wood=("#6B3A1C", "#2A140A", "#A86A3A"), band="#E8B53C", r=0.0, symbol=True):
    """Le fontomfrom, tambour royal asante, et la voix de l'atumpan : on y « parle » la généalogie du roi."""
    dark, deep, light = wood
    bodyg = card.grad("drum-body", [(0, deep), (0.2, dark), (0.38, light), (0.55, dark), (1, deep)], 0, 0, 1, 0)
    skin = card.rgrad("drum-skin", [(0, "#FBF2DC", 1), (0.7, "#E6D0A4", 1), (1, "#B8935C", 1)], 0.45, 0.4, 0.6)
    gold = cyl(card, "drum-gold", "#7A4A0E", band, "#FFF4C2")
    pegs = "".join(f'<path d="M{f(xx - 2.6)} -76 L{f(xx + 2.6)} -76 L{f(xx + 1.6)} -62 L{f(xx - 1.6)} -62Z" fill="{light}" stroke="{deep}" stroke-width="0.8"/>' for xx in [-38 + 9.5 * i for i in range(9)])
    zig = []
    for i in range(8):
        xa = -38 + 9.5 * i
        zig.append(f"{f(xa)} -66 {f(xa + 4.75)} -36")
    cords = f'<polyline points="{" ".join(zig)} 38 -66" fill="none" stroke="#E9D7B0" stroke-width="1.4"/>'
    sym = ""
    if symbol:
        sym = (
            f'<g fill="none" stroke="{band}" stroke-width="2.2" opacity="0.9">'
            f'<circle cx="0" cy="8" r="8"/><circle cx="0" cy="8" r="16"/><circle cx="0" cy="8" r="3" fill="{band}"/></g>'
        )
    m = (
        f'<path d="M-46 -84 L46 -84 C44 -20 36 40 32 70 L-32 70 C-36 40 -44 -20 -46 -84Z" fill="{bodyg}" stroke="{deep}" stroke-width="1.4"/>'
        f'<path d="M-32 70 L32 70 L42 104 L-42 104Z" fill="{bodyg}" stroke="{deep}" stroke-width="1.2"/>'
        + "".join(f'<path d="M{xx} 76 L{xx + 8} 76 L{xx + 4} 98Z" fill="{deep}"/>' for xx in (-30, -14, 2, 18))
        + f'<rect x="-45" y="-34" width="90" height="7" fill="{gold}"/>'
        f'<rect x="-36" y="40" width="72" height="6" fill="{gold}"/>'
        f'<rect x="-42" y="104" width="84" height="5" fill="{gold}"/>'
        f'{sym}{pegs}{cords}'
        f'<ellipse cx="0" cy="-84" rx="47" ry="11" fill="{gold}"/>'
        f'<ellipse cx="0" cy="-86" rx="43" ry="9" fill="{skin}"/>'
        f'<ellipse cx="0" cy="-86" rx="30" ry="5.5" fill="none" stroke="#B8935C" stroke-width="0.8" opacity="0.6"/>'
    )
    return grp(m, x, y, s, r)


def okyeame_staff(card, x, y, s=1.0, length=420, finial="egg", r=0.0):
    """Le bâton d'or de l'okyeame, porte-parole du roi : on ne parle au roi, et le roi ne parle, que par lui."""
    shaft = cyl(card, "ok-shaft", "#6E430C", "#D9A33A", "#FFF4C2")
    gold = card.grad("ok-gold", [(0, "#FFF6CC"), (0.45, "#E8B53C"), (1, "#7A4A0E")], 0, 0, 1, 1)
    lo = "#6E430C"
    bands = []
    for yy in range(70, length - 20, 46):
        bands.append(f'<rect x="-7" y="{yy}" width="14" height="8" rx="2" fill="{shaft}" stroke="{lo}" stroke-width="0.8"/>')
        bands.append("".join(f'<line x1="-5" y1="{yy + 12 + i * 5}" x2="5" y2="{yy + 15 + i * 5}" stroke="{lo}" stroke-width="1" opacity="0.7"/>' for i in range(5)))
    if finial == "egg":
        fin = (
            f'<ellipse cx="0" cy="-26" rx="13" ry="17" fill="#FFF8E4" stroke="{lo}" stroke-width="1.2"/>'
            f'<ellipse cx="-4" cy="-32" rx="3.5" ry="6" fill="#FFFFFF" opacity="0.8"/>'
            f'<path d="M-20 -14 C-22 -2 -14 8 0 8 C14 8 22 -2 20 -14 C16 -8 10 -6 0 -6 C-10 -6 -16 -8 -20 -14Z" fill="{gold}" stroke="{lo}" stroke-width="1.2"/>'
            + "".join(f'<path d="M{xx} -12 C{xx - 1} -20 {xx + 5} -22 {xx + 6} -14" fill="{gold}" stroke="{lo}" stroke-width="1"/>' for xx in (-15, -8, -1, 6))
            + f'<path d="M20 -12 C26 -20 22 -30 16 -30 C14 -24 16 -18 14 -12Z" fill="{gold}" stroke="{lo}" stroke-width="1"/>'
        )
    elif finial == "sankofa":
        fin = grp(sankofa_bird(card), 0, -4, 0.85)
    else:
        fin = f'<circle cx="0" cy="-16" r="16" fill="{gold}" stroke="{lo}" stroke-width="1.2"/>' + sparkle(0, -16, 28, "#FFF4C2", 0.9)
    m = (
        f'<rect x="-5" y="40" width="10" height="{length - 40}" rx="3" fill="{shaft}"/>'
        + "".join(bands)
        + f'<path d="M-8 26 C-12 34 -10 44 -5 48 L5 48 C10 44 12 34 8 26Z" fill="{gold}" stroke="{lo}" stroke-width="1"/>'
        f'<rect x="-24" y="8" width="48" height="18" rx="3" fill="{gold}" stroke="{lo}" stroke-width="1.2"/>'
        + "".join(f'<circle cx="{xx}" cy="17" r="2" fill="{lo}" opacity="0.8"/>' for xx in range(-18, 20, 6))
        + fin
    )
    return grp(m, x, y, s, r)


# ---------------------------------------------------------------- Mandingue

def kora(card, x, y, s=1.0, r=0.0, string="#FFE7A0", glow=False, neck=350):
    """La kora du djeli : vingt et une cordes sur une calebasse, la mémoire chantée de l'empire du Mali."""
    cal = card.rgrad("kora-cal", [(0, "#D79A5E", 1), (0.6, "#8C4F22", 1), (1, "#3E1D0A", 1)], 0.4, 0.35, 0.7)
    skin = card.rgrad("kora-skin", [(0, "#FBF0D6", 1), (1, "#D6B884", 1)], 0.4, 0.4, 0.7)
    neckg = cyl(card, "kora-neck", "#3E1D0A", "#8C4F22", "#D79A5E")
    tacks = "".join(f'<circle cx="{f(pt(0, 40, 54, a)[0])}" cy="{f(pt(0, 40, 54, a)[1])}" r="1.8" fill="#E8B53C" stroke="#6E430C" stroke-width="0.5"/>' for a in range(0, 360, 15))
    strings = []
    step = (neck - 180) / 10
    for i in range(11):
        top = -(neck - 20) + i * step
        strings.append(f'<line x1="-6" y1="{f(-6 + i * 3)}" x2="-3" y2="{top}" />')
        strings.append(f'<line x1="6" y1="{f(-4 + i * 3)}" x2="3" y2="{top + 8}" />')
        strings.append(f'<line x1="-6" y1="{f(-6 + i * 3)}" x2="0" y2="96" /><line x1="6" y1="{f(-4 + i * 3)}" x2="0" y2="96" />')
    glo = f' filter="{soft(card, 2)}"' if glow else ""
    m = (
        f'<ellipse cx="0" cy="44" rx="66" ry="64" fill="{cal}" stroke="#2A1205" stroke-width="1.4"/>'
        f'<circle cx="0" cy="40" r="56" fill="{skin}" stroke="#8C4F22" stroke-width="1.2"/>'
        f'{tacks}'
        f'<path d="M-30 74 C-10 84 10 84 30 74" fill="none" stroke="#B8935C" stroke-width="1" opacity="0.7"/>'
        f'<rect x="-4.5" y="{-neck}" width="9" height="{neck + 50}" rx="4" fill="{neckg}"/>'
        f'<rect x="-26" y="-120" width="5" height="150" rx="2.5" fill="{neckg}"/>'
        f'<rect x="21" y="-120" width="5" height="150" rx="2.5" fill="{neckg}"/>'
        + "".join(f'<rect x="-6" y="{f(-(neck - 12) + i * step)}" width="12" height="4" rx="2" fill="#5A2A0E"/>' for i in range(11))
        + (f'<g stroke="{string}" stroke-width="2.4" opacity="0.6"{glo}>{"".join(strings)}</g>' if glow else "")
        + f'<g stroke="{string}" stroke-width="0.8" opacity="0.95">{"".join(strings)}</g>'
        f'<rect x="-9" y="-36" width="18" height="40" rx="3" fill="#F3E3C2" stroke="#6E430C" stroke-width="1"/>'
        + "".join(f'<line x1="-9" y1="{-32 + i * 3.4}" x2="-5" y2="{-32 + i * 3.4}" stroke="#6E430C" stroke-width="0.7"/><line x1="5" y1="{-32 + i * 3.4}" x2="9" y2="{-32 + i * 3.4}" stroke="#6E430C" stroke-width="0.7"/>' for i in range(11))
        + f'<circle cx="0" cy="98" r="5" fill="#E8B53C" stroke="#6E430C" stroke-width="1"/>'
    )
    return grp(m, x, y, s, r)


def djenne(card, x, y, s=1.0, mud=("#E2A868", "#B5733C", "#7C4620"), egg="#FFF8E8", lit=None):
    """La Grande Mosquée de Djenné : banco crépi chaque année par toute la ville, torons de rônier, œufs d'autruche au faîte."""
    hi, mid, lo = mud
    wall = card.grad(nid("dj-wall"), [(0, hi), (1, mid)], 0, 0, 0, 1)
    shade = lo
    out = []
    out.append(f'<path d="M-170 0 L-170 -72 L170 -72 L170 0Z" fill="{wall}"/>')
    for px in range(-166, 170, 12):
        out.append(f'<path d="M{px - 4} -72 L{px - 3} -82 C{px - 2} -86 {px + 2} -86 {px + 3} -82 L{px + 4} -72Z" fill="{mid}"/>')
    for bx in (-150, -128, -60, -40, 40, 60, 128, 150):
        out.append(f'<path d="M{bx - 5} 0 L{bx - 4} -86 C{bx - 3} -96 {bx + 3} -96 {bx + 4} -86 L{bx + 5} 0Z" fill="{hi}"/>')
        out.append(f'<path d="M{bx + 1} 0 L{bx + 1} -88 C{bx + 2} -94 {bx + 3} -92 {bx + 4} -86 L{bx + 5} 0Z" fill="{shade}" opacity="0.45"/>')
    for tx, th, tw in ((-94, 150, 46), (0, 186, 54), (94, 150, 46)):
        top = -th
        out.append(
            f'<path d="M{tx - tw / 2} 0 L{tx - tw / 2 + 5} {top + 18} C{tx - tw / 2 + 6} {top + 2} {tx - 8} {top - 6} {tx} {top - 8} '
            f'C{tx + 8} {top - 6} {tx + tw / 2 - 6} {top + 2} {tx + tw / 2 - 5} {top + 18} L{tx + tw / 2} 0Z" fill="{wall}"/>'
        )
        out.append(
            f'<path d="M{tx + 2} {top - 8} C{tx + 8} {top - 6} {tx + tw / 2 - 6} {top + 2} {tx + tw / 2 - 5} {top + 18} L{tx + tw / 2} 0 L{tx + 2} 0Z" fill="{shade}" opacity="0.38"/>'
        )
        for row in range(int(th // 22)):
            yy = top + 22 + row * 22
            if yy > -8:
                break
            for col in (-1, 0, 1):
                out.append(f'<rect x="{f(tx + col * tw * 0.28 - 3)}" y="{f(yy)}" width="6" height="2.2" rx="1" fill="#3A1E0C"/>')
        out.append(f'<ellipse cx="{tx}" cy="{top - 15}" rx="5.5" ry="7.5" fill="{egg}" stroke="{lo}" stroke-width="0.6"/>')
        out.append(f'<path d="M{tx - 4} {top - 8} L{tx + 4} {top - 8} L{tx + 2} {top - 4} L{tx - 2} {top - 4}Z" fill="{lo}"/>')
        out.append(f'<path d="M{tx - 6} {top + 30} L{tx - 6} {top + 52} C{tx - 6} {top + 58} {tx + 6} {top + 58} {tx + 6} {top + 52} L{tx + 6} {top + 30}Z" fill="#2A1408" opacity="0.7"/>')
    for row in (-56, -36, -16):
        for xx in range(-160, 164, 18):
            if any(abs(xx - tx) < 30 for tx in (-94, 0, 94)):
                continue
            out.append(f'<rect x="{xx - 3}" y="{row}" width="6" height="2" rx="1" fill="#3A1E0C" opacity="0.85"/>')
    out.append(f'<path d="M-12 0 L-12 -22 C-12 -34 12 -34 12 -22 L12 0Z" fill="#1E0E06"/>')
    if lit:
        out.append(f'<path d="M-170 0 L-170 -72 L170 -72 L170 0Z" fill="{lit}" opacity="0.25"/>')
    return grp("".join(out), x, y, s)


def camel(x, y, s, color, flip=False):
    """Silhouette d'un chameau de caravane (la route de l'or, du sel et des livres)."""
    d = ("M-30 0 L-28 -22 C-30 -30 -26 -36 -18 -36 C-12 -48 0 -48 4 -38 C8 -44 14 -44 16 -36 L22 -34 C26 -46 30 -56 36 -56 "
         "C42 -56 46 -52 44 -48 L38 -46 C34 -40 32 -30 28 -24 L26 0 L22 0 L20 -20 L4 -22 L0 0 L-4 0 L-6 -20 L-22 -22 L-24 0 Z")
    rider = f'<path d="M-4 -46 L-2 -62 L4 -62 L6 -46Z" fill="{color}"/><circle cx="1" cy="-66" r="4" fill="{color}"/>'
    return grp(f'<path d="{d}" fill="{color}"/>{rider}', x, y, s, 0, flip)


# ---------------------------------------------------------------- Grand Zimbabwe

def _shade(hexc, k):
    hexc = hexc.lstrip("#")
    r, g, b = (int(hexc[i:i + 2], 16) for i in (0, 2, 4))
    r, g, b = (max(0, min(255, int(v * k))) for v in (r, g, b))
    return f"#{r:02X}{g:02X}{b:02X}"


def stone_wall(card, x, y, w, h, seed=1, tones=("#B08A66", "#8C6A4C", "#6A4E36", "#C29A72"), mortar="#2E2016",
               chevrons=(), course=9, gold=None, band=30, bw=(14, 36)):
    """Mur de pierres sèches du Grand Zimbabwe : assises de granit inégales, sans mortier, frises à chevrons."""
    rnd = random.Random(seed)
    uid = nid("sw")
    card.def_once(uid, f'<clipPath id="{card.id(uid)}"><rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}"/></clipPath>')
    out = [f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="{mortar}"/>']
    yy = y
    while yy < y + h:
        if any(c0 <= yy - y < c0 + band for c0 in chevrons):
            yy += 1
            continue
        ch = rnd.uniform(course - 2.5, course + 2.5)
        xx = x - rnd.uniform(0, 20)
        while xx < x + w:
            bwi = rnd.uniform(*bw)
            col = _shade(rnd.choice(tones), rnd.uniform(0.86, 1.1))
            j = rnd.uniform(-0.6, 0.6)
            out.append(f'<path d="M{f(xx + 1)} {f(yy + 1 + j)} L{f(xx + bwi - 1)} {f(yy + 1)} L{f(xx + bwi - 0.6)} {f(yy + ch - 1)} L{f(xx + 0.6)} {f(yy + ch - 1 - j)}Z" fill="{col}"/>')
            if rnd.random() < 0.5:
                out.append(f'<path d="M{f(xx + 2)} {f(yy + 1.6)} L{f(xx + bwi - 3)} {f(yy + 1.6)}" stroke="#FFFFFF" stroke-width="1" opacity="0.12"/>')
            xx += bwi
        yy += ch
    for c0 in chevrons:
        cy0 = y + c0
        bandc = gold or tones[3]
        out.append(f'<rect x="{f(x)}" y="{f(cy0)}" width="{f(w)}" height="{band}" fill="{mortar}"/>')
        step = band * 0.9
        n = int(w // (step / 2)) + 4
        for i in range(n):
            xx = x + i * step / 2 - step
            up = i % 2 == 0
            for k, off in enumerate((0, 5.5)):
                col = bandc if k == 0 else _shade(tones[0], 0.95)
                if up:
                    d = f"M{f(xx + off)} {f(cy0 + band - 3)} L{f(xx + step / 2 + off)} {f(cy0 + 3)} L{f(xx + step / 2 + off + 4.5)} {f(cy0 + 3)} L{f(xx + off + 4.5)} {f(cy0 + band - 3)}Z"
                else:
                    d = f"M{f(xx + off)} {f(cy0 + 3)} L{f(xx + step / 2 + off)} {f(cy0 + band - 3)} L{f(xx + step / 2 + off + 4.5)} {f(cy0 + band - 3)} L{f(xx + off + 4.5)} {f(cy0 + 3)}Z"
                out.append(f'<path d="{d}" fill="{col}"/>')
        out.append(f'<rect x="{f(x)}" y="{f(cy0)}" width="{f(w)}" height="2.4" fill="{bandc}" opacity="0.75"/><rect x="{f(x)}" y="{f(cy0 + band - 2.4)}" width="{f(w)}" height="2.4" fill="{bandc}" opacity="0.75"/>')
    return f'<g clip-path="url(#{card.id(uid)})">{"".join(out)}</g>'


def chevron_band(x, y, w, h, color, back=None, step=12, width=3):
    """Une frise à chevrons (les assises en zigzag du mur d'enceinte du Grand Zimbabwe)."""
    pts = []
    xx = x
    up = True
    while xx <= x + w + step:
        pts.append(f"{f(xx)} {f(y + (2 if up else h - 2))}")
        xx += step / 2
        up = not up
    bg = f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="{back}"/>' if back else ""
    return bg + f'<polyline points="{" ".join(pts)}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="miter"/>'


def conical_tower(card, x, y, s=1.0, tones=("#B08A66", "#8C6A4C", "#6A4E36"), mortar="#2E2016"):
    """La tour conique de la Grande Enceinte : pleine, sans porte, la plus grande construction de pierre sèche au sud du Sahara."""
    hi, mid, lo = tones
    body = card.grad(nid("ct"), [(0, lo), (0.3, hi), (0.6, mid), (1, lo)], 0, 0, 1, 0)
    d = "M-36 0 L-28 -96 C-26 -108 26 -108 28 -96 L36 0Z"
    rows = "".join(f'<line x1="{f(-36 + 0.083 * (-yy))}" y1="{yy}" x2="{f(36 - 0.083 * (-yy))}" y2="{yy}" stroke="{mortar}" stroke-width="1" stroke-dasharray="{6 + (yy % 5)} 1.4"/>' for yy in range(-6, -100, -7))
    m = f'<path d="{d}" fill="{body}"/>{rows}<path d="{d}" fill="none" stroke="{mortar}" stroke-width="1"/>'
    return grp(m, x, y, s)


def zimbabwe_bird(card, x, y, s=1.0, flip=False, stone=("#6F7A62", "#3E4636", "#1E2419"), accent=None, column=130):
    """Oiseau de stéatite du Grand Zimbabwe : un rapace debout sur sa colonne, messager entre les ancêtres et les vivants."""
    hi, mid, lo = stone
    body = card.grad(nid("zb"), [(0, hi), (0.55, mid), (1, lo)], 0, 0, 1, 0.3)
    acc = accent or hi
    chev = "".join(f'<path d="M-9 {yy} L0 {yy + 7} L9 {yy}" fill="none" stroke="{acc}" stroke-width="1.6"/>' for yy in range(14, column - 8, 12))
    m = (
        f'<path d="M-10 6 L10 6 L12 {column} L-12 {column}Z" fill="{body}" stroke="{lo}" stroke-width="1"/>{chev}'
        f'<rect x="-20" y="-2" width="40" height="9" rx="3" fill="{body}" stroke="{lo}" stroke-width="1"/>'
        f'<path d="M-7 -36 L-3 -2 M5 -36 L7 -2" stroke="{mid}" stroke-width="6" stroke-linecap="round"/>'
        f'<path d="M-10 -1 L-2 -4 L4 -1 L12 -4 L16 -1" fill="none" stroke="{lo}" stroke-width="2.4" stroke-linecap="round"/>'
        f'<path d="M-14 -40 L-24 -6 L-16 -8 L-6 -36Z" fill="{mid}" stroke="{lo}" stroke-width="1"/>'
        f'<path d="M-14 -36 C-18 -60 -16 -86 -8 -100 C-4 -108 4 -112 10 -110 C16 -108 18 -100 18 -92 C26 -72 22 -48 10 -36 C2 -32 -8 -32 -14 -36Z" fill="{body}" stroke="{lo}" stroke-width="1.4"/>'
        f'<path d="M-12 -92 C2 -90 12 -76 10 -56 C8 -44 -2 -36 -14 -36Z" fill="{mid}" stroke="{lo}" stroke-width="1.2"/>'
        + "".join(f'<path d="M-12 {yy} L0 {yy + 6} L8 {yy}" fill="none" stroke="{acc}" stroke-width="1.2" opacity="0.85"/>' for yy in (-80, -70, -60, -50))
        + f'<circle cx="11" cy="-114" r="9" fill="{body}" stroke="{lo}" stroke-width="1.2"/>'
        f'<path d="M18 -120 C28 -121 31 -114 27 -107 L24 -110 L19 -110Z" fill="{mid}" stroke="{lo}" stroke-width="1"/>'
        f'<circle cx="13" cy="-116" r="2.4" fill="{acc}"/><circle cx="13" cy="-116" r="1" fill="{lo}"/>'
    )
    return grp(m, x, y, s, 0, flip)


# ---------------------------------------------------------------- cosmos

def black_hole(card, x, y, R, tilt=0.24, hole=0.3, hot=("#FFFFFF", "#FFE8A8", "#FFB347", "#E0602B", "#7A1E0E")):
    """Trou noir et disque d'accrétion : l'arrière du disque se courbe par-dessus l'ombre (lentille gravitationnelle)."""
    w, y1, o1, r1, d1 = hot
    rh = R * hole
    uid = nid("bh")
    disk = card.rgrad(f"{uid}-disk", [(0, w, 0), (hole * 0.92, w, 0), (hole * 1.02, w, 1), (hole * 1.4, y1, 0.95), (0.62, o1, 0.75), (0.82, r1, 0.4), (1, d1, 0)])
    ring = card.rgrad(f"{uid}-ring", [(0, w, 0), (0.62, w, 0), (0.7, w, 1), (0.78, y1, 0.85), (0.9, o1, 0.35), (1, r1, 0)])
    card.def_once(f"{uid}-top", f'<clipPath id="{card.id(uid + "-top")}"><rect x="{f(x - R * 1.2)}" y="{f(y - R * 1.2)}" width="{f(R * 2.4)}" height="{f(R * 1.2)}"/></clipPath>')
    card.def_once(f"{uid}-bot", f'<clipPath id="{card.id(uid + "-bot")}"><rect x="{f(x - R * 1.2)}" y="{f(y)}" width="{f(R * 2.4)}" height="{f(R * 1.2)}"/></clipPath>')
    halo = card.rgrad(f"{uid}-halo", [(0, o1, 0.0), (0.35, o1, 0.35), (1, r1, 0)])
    m = (
        f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(R * 1.15)}" fill="{halo}"/>'
        f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(R)}" ry="{f(R * tilt)}" fill="{disk}" clip-path="url(#{card.id(uid + "-top")})"/>'
        f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rh * 1.62)}" fill="{ring}"/>'
        f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rh)}" fill="#000000"/>'
        f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rh * 1.04)}" fill="none" stroke="{w}" stroke-width="{f(max(1.0, R * 0.012))}" opacity="0.95"/>'
        f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(R)}" ry="{f(R * tilt)}" fill="{disk}" clip-path="url(#{card.id(uid + "-bot")})"/>'
        f'<ellipse cx="{f(x)}" cy="{f(y + rh * 0.08)}" rx="{f(rh * 1.02)}" ry="{f(rh * 0.2)}" fill="#000000" opacity="0.6" clip-path="url(#{card.id(uid + "-bot")})"/>'
    )
    return m


def supernova(card, x, y, r, c1="#FFFFFF", c2="#FFB0D8", c3="#8A4BFF", seed=5, flare=True):
    rnd = random.Random(seed)
    uid = nid("sn")
    core = card.rgrad(f"{uid}-c", [(0, c1, 1), (0.12, c1, 0.95), (0.3, c2, 0.6), (0.65, c3, 0.25), (1, c3, 0)])
    fil = []
    for _ in range(70):
        a = rnd.uniform(0, 360)
        r0 = r * rnd.uniform(0.18, 0.35)
        r1 = r * rnd.uniform(0.45, 0.95)
        xa, ya = pt(x, y, r0, a)
        xb, yb = pt(x, y, r1, a + rnd.uniform(-6, 6))
        fil.append(f'<line x1="{f(xa)}" y1="{f(ya)}" x2="{f(xb)}" y2="{f(yb)}" stroke="{rnd.choice((c2, c3, c1))}" stroke-width="{f(rnd.uniform(0.6, 1.8))}" opacity="{f(rnd.uniform(0.25, 0.7))}"/>')
    shell = f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.72)}" fill="none" stroke="{c2}" stroke-width="{f(r * 0.05)}" opacity="0.35" filter="{soft(card, 3)}"/>'
    sp = ""
    if flare:
        sp = spikes(x, y, r * 1.1, c1, op=0.95) + spikes(x, y, r * 0.5, c1, op=0.6, rot=45)
    return f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{core}"/><g filter="{soft(card, 1)}">{"".join(fil)}</g>{shell}{sp}'


def quasar(card, x, y, length, angle=0.0, color="#9FD8FF", core="#FFFFFF", width=10):
    uid = nid("qs")
    jet_fade = card.def_once(
        f"{uid}-jm",
        f'<linearGradient id="{card.id(uid + "-jm")}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{core}" stop-opacity="1"/>'
        f'<stop offset="0.3" stop-color="{color}" stop-opacity="0.8"/><stop offset="1" stop-color="{color}" stop-opacity="0"/></linearGradient>',
    )
    d1 = f"M{f(-width / 2)} 0 L0 {f(-length)} L{f(width / 2)} 0Z"
    d2 = f"M{f(-width / 2)} 0 L0 {f(length)} L{f(width / 2)} 0Z"
    glow = card.rgrad(f"{uid}-g", [(0, core, 1), (0.2, color, 0.7), (1, color, 0)])
    m = (
        f'<g filter="{soft(card, 3)}"><path d="{d1}" fill="{jet_fade}"/><path d="{d2}" fill="{jet_fade}" transform="scale(1 -1) rotate(180)"/></g>'
        f'<path d="M-1.2 0 L0 {f(-length * 0.85)} L1.2 0Z" fill="{core}" opacity="0.9"/>'
        f'<path d="M-1.2 0 L0 {f(length * 0.85)} L1.2 0Z" fill="{core}" opacity="0.9"/>'
        f'<circle r="{f(width * 2.6)}" fill="{glow}"/>'
        f'<ellipse rx="{f(width * 2.2)}" ry="{f(width * 0.55)}" fill="{color}" opacity="0.55" transform="rotate(90)"/>'
        + spikes(0, 0, width * 3, core, op=1)
    )
    return grp(m, x, y, 1, angle)


def eclipse(card, x, y, r, corona="#FFE7A0", outer="#E0952B", seed=9, streamers=28):
    """Éclipse totale : le disque noir, la couronne solaire en flammèches, et l'anneau de diamant."""
    rnd = random.Random(seed)
    uid = nid("ec")
    glow = card.rgrad(f"{uid}-g", [(0, corona, 1), (0.34, corona, 0.95), (0.42, outer, 0.6), (0.7, outer, 0.18), (1, outer, 0)])
    st = []
    for i in range(streamers):
        a = 360 * i / streamers + rnd.uniform(-5, 5)
        L = r * rnd.uniform(1.4, 2.6)
        w = r * rnd.uniform(0.06, 0.14)
        x0, y0 = pt(x, y, r * 0.95, a - 4)
        x1, y1 = pt(x, y, L, a)
        x2, y2 = pt(x, y, r * 0.95, a + 4)
        st.append(f'<path d="M{f(x0)} {f(y0)} Q{f(pt(x, y, L * 0.6, a - 2)[0])} {f(pt(x, y, L * 0.6, a - 2)[1])} {f(x1)} {f(y1)} Q{f(pt(x, y, L * 0.6, a + 2)[0])} {f(pt(x, y, L * 0.6, a + 2)[1])} {f(x2)} {f(y2)}Z" fill="{corona}" opacity="{f(rnd.uniform(0.25, 0.6))}"/>')
    dx, dy = pt(x, y, r * 1.0, 40)
    m = (
        f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 2.8)}" fill="{glow}"/>'
        f'<g filter="{soft(card, 2)}">{"".join(st)}</g>'
        f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 1.06)}" fill="none" stroke="#FFFFFF" stroke-width="{f(r * 0.06)}" filter="{soft(card, 2)}"/>'
        f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="#050307"/>'
        + spikes(dx, dy, r * 0.9, "#FFFFFF", op=1)
        + f'<circle cx="{f(dx)}" cy="{f(dy)}" r="{f(r * 0.1)}" fill="#FFFFFF"/>'
    )
    return m


def spikes(cx, cy, r, color, w=None, op=1.0, rot=0):
    """Une étoile à aigrettes fines (diffraction), pour les astres très brillants."""
    w = w or max(1.2, r * 0.035)
    d = (f"M{f(cx)} {f(cy - r)} L{f(cx + w)} {f(cy)} L{f(cx)} {f(cy + r)} L{f(cx - w)} {f(cy)}Z "
         f"M{f(cx - r)} {f(cy)} L{f(cx)} {f(cy - w)} L{f(cx + r)} {f(cy)} L{f(cx)} {f(cy + w)}Z")
    return f'<path d="{d}" fill="{color}" opacity="{op}" transform="rotate({rot} {f(cx)} {f(cy)})"/><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(w * 1.8)}" fill="#FFFFFF" opacity="{op}"/>'


def constellation(points, edges, color="#FFE7A0", w=1.0, star=2.2, op=0.8, glow_color=None):
    lines = "".join(
        f'<line x1="{f(points[a][0])}" y1="{f(points[a][1])}" x2="{f(points[b][0])}" y2="{f(points[b][1])}" stroke="{color}" stroke-width="{w}" opacity="{f(op * 0.6)}"/>'
        for a, b in edges
    )
    dots = "".join(
        f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(star * 2.6)}" fill="{glow_color or color}" opacity="0.18"/><circle cx="{f(px)}" cy="{f(py)}" r="{f(star)}" fill="#FFFFFF" opacity="{op}"/>'
        for px, py in points
    )
    return lines + dots


def waves(cx, cy, r0, step, n, color, w=1.4, op=0.6, a0=None, a1=None, dash=None):
    """Ondes concentriques (la voix qui porte, ou l'onde gravitationnelle)."""
    out = []
    for i in range(n):
        r = r0 + i * step
        o = op * (1 - i / (n + 1))
        da = f' stroke-dasharray="{dash}"' if dash else ""
        if a0 is None:
            out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{f(o)}"{da}/>')
        else:
            xa, ya = pt(cx, cy, r, a0)
            xb, yb = pt(cx, cy, r, a1)
            large = 1 if (a1 - a0) % 360 > 180 else 0
            out.append(f'<path d="M{f(xa)} {f(ya)} A{f(r)} {f(r)} 0 {large} 1 {f(xb)} {f(yb)}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{f(o)}"{da} stroke-linecap="round"/>')
    return "".join(out)


def milky_way(card, name, x0, y0, x1, y1, width, c1="#FFE7C8", c2="#B58AFF", seed=4, n=900):
    """Une bande de Voie lactée entre deux points : poussière d'étoiles et nuage diffus."""
    rnd = random.Random(seed)
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy)
    ang = math.degrees(math.atan2(dy, dx))
    cloud = card.rgrad(name, [(0, c1, 0.55), (0.45, c2, 0.25), (1, c2, 0)])
    out = [f'<ellipse cx="{f((x0 + x1) / 2)}" cy="{f((y0 + y1) / 2)}" rx="{f(L / 2)}" ry="{f(width)}" fill="{cloud}" transform="rotate({f(ang)} {f((x0 + x1) / 2)} {f((y0 + y1) / 2)})"/>']
    pts = []
    for _ in range(n):
        t = rnd.random()
        off = rnd.gauss(0, width * 0.45)
        px = x0 + dx * t - dy / L * off
        py = y0 + dy * t + dx / L * off
        pts.append(f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(rnd.uniform(0.3, 1.2))}" fill="#FFFFFF" opacity="{f(rnd.uniform(0.2, 0.9))}"/>')
    out.append("".join(pts))
    return "".join(out)


def falling_stars(x0, y0, x1, y1, n, seed, color="#FFE7A0", angle=200, length=(20, 70), avoid=True):
    """Une pluie d'étoiles filantes (traits dégradés vers une tête brillante)."""
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if avoid and 100 < x < 440 and 300 < y < 700:
            continue
        L = rnd.uniform(*length)
        a = math.radians(angle + rnd.uniform(-4, 4))
        tx, ty = x + L * math.sin(a), y - L * math.cos(a)
        w = rnd.uniform(0.8, 2.0)
        out.append(f'<line x1="{f(tx)}" y1="{f(ty)}" x2="{f(x)}" y2="{f(y)}" stroke="{color}" stroke-width="{f(w)}" stroke-linecap="round" opacity="{f(rnd.uniform(0.25, 0.6))}"/>')
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(w * 1.2)}" fill="#FFFFFF" opacity="0.95"/>')
    return "".join(out)


def bogolan(card, name, x0, y0, x1, y1, cell=34, ink="#EADBC0", ground="#2B1A10", seed=2, op=0.85):
    """Bogolan (bògòlanfini) bamana : toile teinte à la boue, signes géométriques réservés en clair, rangée par rangée."""
    rnd = random.Random(seed)
    out = [f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(x1 - x0)}" height="{f(y1 - y0)}" fill="{ground}"/>']
    rows = int((y1 - y0) // cell) + 1
    cols = int((x1 - x0) // cell) + 1
    kinds = ["dots", "zig", "cross", "square", "comb", "lozenge"]
    for r in range(rows):
        kind = kinds[(r + seed) % len(kinds)]
        cy = y0 + r * cell + cell / 2
        out.append(f'<line x1="{f(x0)}" y1="{f(y0 + r * cell)}" x2="{f(x1)}" y2="{f(y0 + r * cell)}" stroke="{ink}" stroke-width="1.6" opacity="{op}"/>')
        for k in range(cols):
            cx = x0 + k * cell + cell / 2
            s = cell / 34
            if kind == "dots":
                out.append("".join(f'<circle cx="{f(cx + dx * s)}" cy="{f(cy + dy * s)}" r="{f(2.2 * s)}" fill="{ink}" opacity="{op}"/>' for dx, dy in ((-8, -8), (8, -8), (0, 0), (-8, 8), (8, 8))))
            elif kind == "zig":
                out.append(f'<polyline points="{f(cx - 17 * s)} {f(cy + 6 * s)} {f(cx - 8.5 * s)} {f(cy - 6 * s)} {f(cx)} {f(cy + 6 * s)} {f(cx + 8.5 * s)} {f(cy - 6 * s)} {f(cx + 17 * s)} {f(cy + 6 * s)}" fill="none" stroke="{ink}" stroke-width="{f(2.4 * s)}" opacity="{op}"/>')
            elif kind == "cross":
                out.append(f'<path d="M{f(cx - 7 * s)} {f(cy)} L{f(cx + 7 * s)} {f(cy)} M{f(cx)} {f(cy - 7 * s)} L{f(cx)} {f(cy + 7 * s)}" stroke="{ink}" stroke-width="{f(3 * s)}" opacity="{op}"/>'
                           f'<circle cx="{f(cx - 12 * s)}" cy="{f(cy - 12 * s)}" r="{f(1.6 * s)}" fill="{ink}" opacity="{op}"/><circle cx="{f(cx + 12 * s)}" cy="{f(cy + 12 * s)}" r="{f(1.6 * s)}" fill="{ink}" opacity="{op}"/>')
            elif kind == "square":
                out.append(f'<rect x="{f(cx - 10 * s)}" y="{f(cy - 10 * s)}" width="{f(20 * s)}" height="{f(20 * s)}" fill="none" stroke="{ink}" stroke-width="{f(2 * s)}" opacity="{op}"/>'
                           f'<rect x="{f(cx - 4 * s)}" y="{f(cy - 4 * s)}" width="{f(8 * s)}" height="{f(8 * s)}" fill="{ink}" opacity="{op}"/>')
            elif kind == "comb":
                out.append("".join(f'<line x1="{f(cx + dx * s)}" y1="{f(cy - 9 * s)}" x2="{f(cx + dx * s)}" y2="{f(cy + 9 * s)}" stroke="{ink}" stroke-width="{f(2 * s)}" opacity="{op}"/>' for dx in (-12, -6, 0, 6, 12)))
            else:
                out.append(f'<path d="M{f(cx)} {f(cy - 11 * s)} L{f(cx + 11 * s)} {f(cy)} L{f(cx)} {f(cy + 11 * s)} L{f(cx - 11 * s)} {f(cy)}Z" fill="none" stroke="{ink}" stroke-width="{f(2 * s)}" opacity="{op}"/>'
                           f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(2.6 * s)}" fill="{ink}" opacity="{op}"/>')
    return "".join(out)


def manilla_bundle(card, x, y, s=1.0, n=3, metal="copper", cord="#C9A15A"):
    """Une liasse de manilles enfilées sur une cordelette, comme on les comptait au marché."""
    out = [f'<line x1="0" y1="-10" x2="0" y2="{n * 30 + 6}" stroke="{cord}" stroke-width="1.6"/>', f'<circle cx="0" cy="-12" r="3" fill="none" stroke="{cord}" stroke-width="1.4"/>']
    for i in range(n):
        out.append(manilla(card, 0, 18 + i * 30, 0.95, (-14, 10, -6, 12)[i % 4], metal))
    out.append(f'<path d="M-4 {n * 30 + 6} L0 {n * 30 + 20} L4 {n * 30 + 6}" fill="{cord}"/>')
    return grp("".join(out), x, y, s)


def guilloche(x0, y0, x1, y1, width, period, color, line, vertical=True, w=4.0):
    """Tresse (guilloche) des bordures de plaques d'Edo : deux brins entrelacés qui forment une chaîne d'yeux."""
    out = []
    L = (y1 - y0) if vertical else (x1 - x0)
    n = max(8, int(L / 3))
    for phase in (0, math.pi):
        pts = []
        for i in range(n + 1):
            t = i / n
            a = 2 * math.pi * t * L / period + phase
            off = width / 2 * math.sin(a)
            if vertical:
                pts.append(f"{f((x0 + x1) / 2 + off)} {f(y0 + t * L)}")
            else:
                pts.append(f"{f(x0 + t * L)} {f((y0 + y1) / 2 + off)}")
        d = "M" + " L".join(pts)
        out.append(f'<path d="{d}" fill="none" stroke="{line}" stroke-width="{f(w + 2.4)}" stroke-linecap="round"/>')
        out.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(w)}" stroke-linecap="round"/>')
    k = int(L / period * 2)
    for i in range(k):
        t = period / 4 + i * period / 2
        if vertical:
            cx, cy = (x0 + x1) / 2, y0 + t
        else:
            cx, cy = x0 + t, (y0 + y1) / 2
        if t < L:
            out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(width * 0.16)}" fill="{color}" stroke="{line}" stroke-width="1"/>')
    return "".join(out)


def moon(card, x, y, r, tone=("#FFFBF0", "#EADFC6", "#B8AA8E"), seed=12):
    """Pleine lune d'ivoire, mers sombres et halo."""
    hi, mid, lo = tone
    rnd = random.Random(seed)
    uid = nid("mn")
    body = card.rgrad(f"{uid}-b", [(0, hi, 1), (0.7, mid, 1), (1, lo, 1)], 0.42, 0.38, 0.65)
    seas = "".join(
        f'<ellipse cx="{f(x + rnd.uniform(-0.55, 0.5) * r)}" cy="{f(y + rnd.uniform(-0.5, 0.5) * r)}" rx="{f(r * rnd.uniform(0.1, 0.28))}" ry="{f(r * rnd.uniform(0.08, 0.22))}" fill="{lo}" opacity="{f(rnd.uniform(0.18, 0.4))}"/>'
        for _ in range(9)
    )
    card.def_once(f"{uid}-c", f'<clipPath id="{card.id(uid + "-c")}"><circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}"/></clipPath>')
    glow = card.rgrad(f"{uid}-g", [(0, hi, 0.55), (0.4, hi, 0.18), (1, hi, 0)])
    return (
        f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 2.6)}" fill="{glow}"/>'
        f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{body}"/>'
        f'<g clip-path="url(#{card.id(uid + "-c")})" filter="{soft(card, 2)}">{seas}</g>'
    )


def crescent(x, y, r, color, rot=-30, glow=None):
    d = f"M{f(x)} {f(y - r)} A{f(r)} {f(r)} 0 1 0 {f(x)} {f(y + r)} A{f(r * 0.78)} {f(r * 0.86)} 0 1 1 {f(x)} {f(y - r)}Z"
    return f'<path d="{d}" fill="{color}" transform="rotate({rot} {f(x)} {f(y)})"/>'


def mat_weave(x0, y0, x1, y1, cell=10, c1="#C9A15A", c2="#8C6A3A", line="#4A3418"):
    """Natte de raphia tressée (on y jette les cauris)."""
    out = [f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(x1 - x0)}" height="{f(y1 - y0)}" fill="{c2}"/>']
    j = 0
    yy = y0
    while yy < y1:
        xx = x0 + (cell / 2 if j % 2 else 0) - cell
        while xx < x1:
            out.append(f'<rect x="{f(xx + 0.6)}" y="{f(yy + 0.6)}" width="{f(cell * 2 - 1.2)}" height="{f(cell - 1.2)}" rx="2" fill="{c1}"/>')
            out.append(f'<line x1="{f(xx + 2)}" y1="{f(yy + cell / 2)}" x2="{f(xx + cell * 2 - 2)}" y2="{f(yy + cell / 2)}" stroke="{line}" stroke-width="0.5" opacity="0.5"/>')
            xx += cell * 2
        yy += cell
        j += 1
    return "".join(out)



def opele(card, x, y, s=1.0, pods=4, gap=64, tone=("#B07A4A", "#5A3218", "#2A1408"), bead="#E8B53C"):
    """L'opele, chaîne divinatoire d'Ifá : quatre demi-cosses par brin, jetées pour lire l'odu."""
    hi, mid, lo = tone
    pod = card.rgrad("op-pod", [(0, hi, 1), (0.6, mid, 1), (1, lo, 1)], 0.4, 0.35, 0.7)
    out = [f'<line x1="0" y1="0" x2="0" y2="{pods * gap}" stroke="{bead}" stroke-width="1.3"/>']
    for i in range(pods):
        yy = gap * (i + 0.5)
        out.append(f'<path d="M0 {f(yy - 22)} C14 {f(yy - 14)} 14 {f(yy + 14)} 0 {f(yy + 22)} C-14 {f(yy + 14)} -14 {f(yy - 14)} 0 {f(yy - 22)}Z" fill="{pod}" stroke="{lo}" stroke-width="1"/>')
        out.append(f'<path d="M0 {f(yy - 16)} C6 {f(yy - 8)} 6 {f(yy + 8)} 0 {f(yy + 16)}" fill="none" stroke="#F2D2A8" stroke-width="1.2" opacity="0.6"/>')
        for k in (-1, 1):
            out.append(f'<circle cx="0" cy="{f(yy + k * (gap / 2))}" r="2.8" fill="{bead}"/>')
    out.append(f'<circle cx="0" cy="{pods * gap + 6}" r="4" fill="#E2583E"/>')
    return grp("".join(out), x, y, s)


def basket_weave(x0, y0, x1, y1, cell=16, c1="#D2A964", c2="#9C743E", line="#5A3F1E"):
    """Natte de raphia en armure panier : carrés alternés de brins couchés et de brins debout."""
    out = [f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(x1 - x0)}" height="{f(y1 - y0)}" fill="{line}"/>']
    j = 0
    yy = y0
    while yy < y1:
        i = 0
        xx = x0
        while xx < x1:
            horiz = (i + j) % 2 == 0
            for k in range(3):
                if horiz:
                    out.append(f'<rect x="{f(xx + 0.6)}" y="{f(yy + 0.6 + k * cell / 3)}" width="{f(cell - 1.2)}" height="{f(cell / 3 - 1.2)}" rx="1.5" fill="{c1 if k != 1 else c2}"/>')
                else:
                    out.append(f'<rect x="{f(xx + 0.6 + k * cell / 3)}" y="{f(yy + 0.6)}" width="{f(cell / 3 - 1.2)}" height="{f(cell - 1.2)}" rx="1.5" fill="{c2 if k != 1 else c1}"/>')
            xx += cell
            i += 1
        yy += cell
        j += 1
    return "".join(out)
