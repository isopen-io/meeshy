"""Autres moments - le kit commun : fenêtres photo, masques, reliefs, matières, inscriptions."""

import math
import random
from contextlib import contextmanager

from base import W, H, f, pt, esc, SANS, CINZEL, CINZEL_DECO, HAND, GARAMOND, FRAUNCES, sparkle

DATE = "10 octobre 2026"


# ---------------------------------------------------------------- composition

@contextmanager
def group(card, attrs=""):
    """Tout ce qui est ajouté dans le bloc est enveloppé dans un <g attrs>."""
    start = len(card.body)
    yield
    inner = "".join(card.body[start:])
    del card.body[start:]
    card.body.append(f"<g {attrs}>{inner}</g>")


def rrect(x0, y0, x1, y1, r):
    return (
        f"M{f(x0 + r)} {f(y0)} L{f(x1 - r)} {f(y0)} Q{f(x1)} {f(y0)} {f(x1)} {f(y0 + r)} L{f(x1)} {f(y1 - r)} "
        f"Q{f(x1)} {f(y1)} {f(x1 - r)} {f(y1)} L{f(x0 + r)} {f(y1)} Q{f(x0)} {f(y1)} {f(x0)} {f(y1 - r)} "
        f"L{f(x0)} {f(y0 + r)} Q{f(x0)} {f(y0)} {f(x0 + r)} {f(y0)} Z"
    )


def arch(x0, x1, spring, apex, y1, r=18):
    rx, ry = (x1 - x0) / 2, spring - apex
    return (
        f"M{f(x0)} {f(spring)} A{f(rx)} {f(ry)} 0 0 1 {f(x1)} {f(spring)} L{f(x1)} {f(y1 - r)} Q{f(x1)} {f(y1)} {f(x1 - r)} {f(y1)} "
        f"L{f(x0 + r)} {f(y1)} Q{f(x0)} {f(y1)} {f(x0)} {f(y1 - r)} Z"
    )


def oval(cx, cy, rx, ry):
    return f"M{f(cx - rx)} {f(cy)} A{f(rx)} {f(ry)} 0 1 1 {f(cx + rx)} {f(cy)} A{f(rx)} {f(ry)} 0 1 1 {f(cx - rx)} {f(cy)} Z"


def circle_d(cx, cy, r):
    return oval(cx, cy, r, r)


def ring_d(cx, cy, r0, r1):
    """Un anneau (evenodd)."""
    return circle_d(cx, cy, r1) + " " + circle_d(cx, cy, r0)


def ogive(x0, x1, spring, apex, y1, r=18, k=0.55):
    cx = (x0 + x1) / 2
    return (
        f"M{f(x0)} {f(spring)} C{f(x0)} {f(spring - (spring - apex) * k)} {f(cx - 46)} {f(apex + 26)} {f(cx)} {f(apex)} "
        f"C{f(cx + 46)} {f(apex + 26)} {f(x1)} {f(spring - (spring - apex) * k)} {f(x1)} {f(spring)} "
        f"L{f(x1)} {f(y1 - r)} Q{f(x1)} {f(y1)} {f(x1 - r)} {f(y1)} L{f(x0 + r)} {f(y1)} Q{f(x0)} {f(y1)} {f(x0)} {f(y1 - r)} Z"
    )


def octo(x0, y0, x1, y1, c):
    """Rectangle aux angles coupés (art déco)."""
    return (
        f"M{f(x0 + c)} {f(y0)} L{f(x1 - c)} {f(y0)} L{f(x1)} {f(y0 + c)} L{f(x1)} {f(y1 - c)} L{f(x1 - c)} {f(y1)} "
        f"L{f(x0 + c)} {f(y1)} L{f(x0)} {f(y1 - c)} L{f(x0)} {f(y0 + c)} Z"
    )


def deco_mask(card, d, name="dm"):
    card.def_once(
        name,
        f'<mask id="{card.id(name)}" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}">'
        f'<rect width="{W}" height="{H}" fill="#FFFFFF"/><path d="{d}" fill="#000000"/></mask>',
    )
    return f"url(#{card.id(name)})"


def soft_mask(card, d, name="sm", feather=10):
    """Masque à bord adouci : la décoration fond dans la fenêtre au lieu de s'y couper net."""
    card.def_once(
        name,
        f'<mask id="{card.id(name)}" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}">'
        f'<rect width="{W}" height="{H}" fill="#FFFFFF"/><path d="{d}" fill="#000000" filter="{card.blur(name + "-f", feather)}"/></mask>',
    )
    return f"url(#{card.id(name)})"


def clip(card, d, name="wc"):
    card.def_once(name, f'<clipPath id="{card.id(name)}"><path d="{d}" clip-rule="evenodd"/></clipPath>')
    return f"url(#{card.id(name)})"


# ---------------------------------------------------------------- filtres

def bevel(card, name="bevel", blur=1.6, scale=3.2, light="#FFF6D8", spec=1.1, exp=18, shadow=True, sd=3, dy=3, sop=0.6,
          az=235, el=42):
    """Relief : lumière spéculaire posée sur l'alpha flouté, ombre portée en dessous."""
    sh = (
        f'<feGaussianBlur in="SourceAlpha" stdDeviation="{sd}" result="sb"/><feOffset in="sb" dy="{dy}" result="so"/>'
        f'<feComponentTransfer in="so" result="sop"><feFuncA type="linear" slope="{sop}"/></feComponentTransfer>'
        if shadow else ""
    )
    merge = '<feMergeNode in="sop"/>' if shadow else ""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">'
        f'<feGaussianBlur in="SourceAlpha" stdDeviation="{blur}" result="b"/>'
        f'<feSpecularLighting in="b" surfaceScale="{scale}" specularConstant="{spec}" specularExponent="{exp}" lighting-color="{light}" result="s">'
        f'<feDistantLight azimuth="{az}" elevation="{el}"/></feSpecularLighting>'
        f'<feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>'
        f'<feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k1="0" k2="1" k3="0.85" k4="0" result="lit"/>'
        f'{sh}<feMerge>{merge}<feMergeNode in="lit"/></feMerge></filter>',
    )
    return f"url(#{card.id(name)})"


def noise(card, name, freq="0.012", octaves=4, seed=3, a=2.4, b=-1.0, region=(0, 0, W, H)):
    """Découpe la source dans un bruit fractal : nuages, gaz, fumée (garde la couleur de la source)."""
    x, y, w, h = region
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" filterUnits="userSpaceOnUse" x="{x}" y="{y}" width="{w}" height="{h}" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="{octaves}" seed="{seed}" result="n"/>'
        f'<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  {a} 0 0 0 {b}" result="na"/>'
        f'<feComposite in="SourceGraphic" in2="na" operator="in"/></filter>',
    )
    return f"url(#{card.id(name)})"


def wobble(card, name, freq="0.02", scale=14, seed=2, octaves=2, blur=0):
    """Déformation organique (feu, fumée, encre) : la forme ondule."""
    b = f'<feGaussianBlur stdDeviation="{blur}"/>' if blur else ""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="{octaves}" seed="{seed}" result="t"/>'
        f'<feDisplacementMap in="SourceGraphic" in2="t" scale="{scale}" xChannelSelector="R" yChannelSelector="G"/>{b}</filter>',
    )
    return f"url(#{card.id(name)})"


def grain(card, name="grain", op=0.08, freq="0.9", region=(0, 0, W, H)):
    """Grain photographique très léger, pour casser l'aplat numérique."""
    x, y, w, h = region
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" filterUnits="userSpaceOnUse" x="{x}" y="{y}" width="{w}" height="{h}">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="2" seed="5"/>'
        f'<feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  {f(op * 6)} 0 0 0 -{f(op * 2.4)}"/></filter>',
    )
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" filter="url(#{card.id(name)})"/>'


# ---------------------------------------------------------------- matières

def metal_grad(card, name, metal, x1=0, y1=0, x2=1, y2=1):
    hi, mid, lo = metal
    return card.grad(name, [(0, hi), (0.28, mid), (0.5, lo), (0.72, mid), (1, hi)], x1, y1, x2, y2)


def rim(card, d, metal, w=5, name="rim", inner=None):
    """Le liseré de la fenêtre : un métal en relief, un fil de lumière à l'intérieur."""
    hi, mid, lo = metal
    g = metal_grad(card, name + "-g", metal)
    out = [f'<g filter="{bevel(card, name + "-bv", 1.0, 2.4, sd=4, dy=3, sop=0.7)}"><path d="{d}" fill="none" stroke="{g}" stroke-width="{w}"/></g>']
    out.append(f'<path d="{d}" fill="none" stroke="{inner or hi}" stroke-width="0.8" opacity="0.75"/>')
    return "".join(out)


def inner_shadow(card, d, w=34, sd=12, op=0.6, color="#000000", name="ish"):
    return f'<g clip-path="{clip(card, d, name + "-c")}"><path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{op}" filter="{card.blur(name, sd)}"/></g>'


def grade(card, d, color, cx=0.5, cy=0.0, op=0.3, r=0.9, name="lg", blend="screen"):
    """Une lumière d'ambiance posée sur la photo, dans la fenêtre seulement."""
    g = card.rgrad(name, [(0, color, op), (0.55, color, op * 0.35), (1, color, 0)], cx, cy, r)
    return f'<g clip-path="{clip(card, d, name + "-c")}" style="mix-blend-mode:{blend}"><rect width="{W}" height="{H}" fill="{g}"/></g>'


def halo(card, cx, cy, r, color, op=0.6, name="halo", ry=None):
    g = card.rgrad(name, [(0, color, op), (0.35, color, op * 0.45), (1, color, 0)])
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r)}" ry="{f(ry or r)}" fill="{g}"/>'


def ring_text(card, name, cx, cy, r, text, size=10, fill="#FFFFFF", font=SANS, weight=800, spacing=3, offset="50%",
              extra="", bottom=False, full=False):
    """Un texte qui suit un cercle : arc du haut (défaut), arc du bas lisible à l'endroit, ou tour complet (`full`)."""
    if bottom:
        d = f"M{f(cx - r)} {f(cy)} A{f(r)} {f(r)} 0 0 0 {f(cx + r)} {f(cy)}"
    elif full:
        d = f"M{f(cx - r)} {f(cy)} A{f(r)} {f(r)} 0 1 1 {f(cx + r)} {f(cy)} A{f(r)} {f(r)} 0 1 1 {f(cx - r)} {f(cy)}"
    else:
        d = f"M{f(cx - r)} {f(cy)} A{f(r)} {f(r)} 0 0 1 {f(cx + r)} {f(cy)}"
    card.def_once(name, f'<path id="{card.id(name)}" d="{d}"/>')
    if full:
        length = 2 * math.pi * r - size * 0.6
        return (
            f'<text font-family="{font}" font-weight="{weight}" font-size="{size}" fill="{fill}" textLength="{f(length)}" lengthAdjust="spacing" {extra}>'
            f'<textPath href="#{card.id(name)}" startOffset="0">{esc(text)}</textPath></text>'
        )
    return (
        f'<text font-family="{font}" font-weight="{weight}" font-size="{size}" letter-spacing="{spacing}" fill="{fill}" {extra}>'
        f'<textPath href="#{card.id(name)}" startOffset="{offset}" text-anchor="middle">{esc(text)}</textPath></text>'
    )


def lgrad(card, name, stops, x1=0, y1=0, x2=0, y2=1, units=""):
    """Dégradé linéaire avec opacité par arrêt : stops = [(offset, couleur, opacité)]."""
    st = "".join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops)
    u = f' gradientUnits="{units}"' if units else ""
    return card.def_once(name, f'<linearGradient id="{card.id(name)}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"{u}>{st}</linearGradient>')


def glints(points, color="#FFFFFF"):
    return "".join(sparkle(x, y, r, color, op) for x, y, r, op in points)


def dust(seed, n, region, colors, rmin=0.4, rmax=1.6, opmin=0.3, opmax=1.0, avoid=None):
    """Poussière d'étoiles / d'étincelles. `avoid` = (x0, y0, x1, y1) laissé libre."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if avoid and avoid[0] < x < avoid[2] and avoid[1] < y < avoid[3]:
            continue
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(rmin, rmax))}" fill="{rnd.choice(colors)}" opacity="{f(rnd.uniform(opmin, opmax))}"/>')
    return "".join(out)


def bright_stars(seed, n, region, color="#FFFFFF", rmin=4, rmax=10, avoid=None):
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if avoid and avoid[0] < x < avoid[2] and avoid[1] < y < avoid[3]:
            continue
        r = rnd.uniform(rmin, rmax)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.45)}" fill="{color}" opacity="0.25"/>')
        out.append(sparkle(x, y, r, color, 0.95))
    return "".join(out)


# ---------------------------------------------------------------- cadre extérieur

def outer_frame(card, metal, m=12, w=3.5, r=24, name="of", inner_op=0.6, inner_color=None):
    hi, mid, lo = metal
    g = metal_grad(card, name + "-g", metal)
    return (
        f'<g filter="{bevel(card, name + "-bv", 1.0, 2.6, sd=3, dy=2, sop=0.6)}"><rect x="{m}" y="{m}" width="{W - 2 * m}" height="{H - 2 * m}" rx="{r}" fill="none" stroke="{g}" stroke-width="{w}"/></g>'
        f'<rect x="{m + 7}" y="{m + 7}" width="{W - 2 * m - 14}" height="{H - 2 * m - 14}" rx="{r - 5}" fill="none" stroke="{inner_color or mid}" stroke-width="0.9" opacity="{inner_op}"/>'
    )


# ---------------------------------------------------------------- l'inscription

from base import plate_layer  # noqa: E402  la couche « plate » et ses emplacements de texte


@plate_layer
def inscription(card, kicker, title, message=None, y=752, metal=("#FFF4C2", "#E8B53C", "#8A5A12"), panel=("#1A1030", "#07050F"),
                ink="#FFF6E6", accent=None, title_size=40, w=424, date=DATE, msg_color=None, title_font=CINZEL,
                border=None, panel_op=0.9, shape="rrect", ornaments=True, extra="", title_fill=None, kicker_color=None):
    """L'inscription : sur-titre, titre en métal, message manuscrit de l'auteur, date.

    `border` : une url de dégradé pour le liseré (prisme, feu…) ; sinon le métal en relief.
    `shape` : rrect | octo | tab (onglet à encoche, pour le carnet).
    """
    hi, mid, lo = metal
    accent = accent or mid
    h = 134 if message else 110
    x0, x1 = 270 - w / 2, 270 + w / 2
    pg = card.grad("ins-pan", [(0, panel[0]), (1, panel[1])])
    out = []
    shadow = card.shadow("ins-sh", 0, 8, 12, "#000000", 0.6)
    frame_g = border or metal_grad(card, "ins-frame", metal)
    bv = bevel(card, "ins-bv", 0.8, 2.0, shadow=False)
    if shape == "octo":
        d, d2 = octo(x0, y, x1, y + h, 16), octo(x0 + 8, y + 8, x1 - 8, y + h - 8, 11)
    else:
        d, d2 = rrect(x0, y, x1, y + h, 18), rrect(x0 + 8, y + 8, x1 - 8, y + h - 8, 11)
    out.append(f'<path d="{d}" fill="{pg}" opacity="{panel_op}" filter="{shadow}"/>')
    out.append(f'<g filter="{bv}"><path d="{d}" fill="none" stroke="{frame_g}" stroke-width="2.6"/></g>')
    out.append(f'<path d="{d2}" fill="none" stroke="{mid}" stroke-width="0.8" opacity="0.6"/>')
    if ornaments:
        for sx in (x0, x1):
            out.append(f'<g filter="{bv}"><path d="M{f(sx)} {f(y + h / 2 - 11)} L{f(sx + 8)} {f(y + h / 2)} L{f(sx)} {f(y + h / 2 + 11)} L{f(sx - 8)} {f(y + h / 2)} Z" fill="{frame_g}"/></g>')
    out.append(extra)
    tg = title_fill or card.grad("ins-title", [(0, "#FFFFFF"), (0.45, hi), (1, mid)], 0, 0, 0, 1)
    tsh = card.shadow("ins-tsh", 0, 2, 2.5, "#000000", 0.8)
    out.append(f'<text x="270" y="{f(y + 29)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="12" letter-spacing="4" fill="{kicker_color or accent}">{esc(kicker.upper())}</text>')
    out.append(f'<text x="270" y="{f(y + 71)}" text-anchor="middle" font-family="{title_font}" font-weight="700" font-size="{title_size}" fill="{tg}" filter="{tsh}">{esc(title)}</text>')
    if message:
        out.append(f'<text x="270" y="{f(y + 104)}" text-anchor="middle" font-family="{HAND}" font-weight="700" font-size="28" fill="{msg_color or ink}">{esc(message)}</text>')
        out.append(f'<text x="270" y="{f(y + 123)}" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="11.5" letter-spacing="1.2" fill="{accent}" opacity="0.92">{esc(date)}</text>')
    else:
        out.append(f'<text x="270" y="{f(y + 95)}" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="12" letter-spacing="1.2" fill="{accent}" opacity="0.92">{esc(date)}</text>')
    card.add("".join(out))
    return y + h


def smooth_closed(pts):
    """Courbe fermée lisse (Catmull-Rom) passant par les points."""
    n = len(pts)
    d = [f"M{f(pts[0][0])} {f(pts[0][1])}"]
    for i in range(n):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d.append(f"C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}")
    return " ".join(d) + " Z"


def smooth_open(pts):
    """Courbe ouverte lisse passant par les points."""
    d = [f"M{f(pts[0][0])} {f(pts[0][1])}"]
    n = len(pts)
    for i in range(n - 1):
        p0, p1, p2 = pts[max(0, i - 1)], pts[i], pts[i + 1]
        p3 = pts[min(n - 1, i + 2)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d.append(f"C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}")
    return " ".join(d)
