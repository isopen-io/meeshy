"""Architecture de l'atelier « Olympe » : colonnes (dorique, ionique, corinthienne), entablements, frontons,
degrés, temples ronds, maisons des Cyclades, phare d'Alexandrie, gradins de théâtre.

Toutes les formes sont redessinées à partir des ordres grecs (Vitruve en donne les proportions), aucune
copie d'œuvre. Chaque fonction rend une chaîne SVG en coordonnées absolues.
"""

import math
import random

from common import f, pt, nid, METALS

# tons : (lumière, clair, moyen, ombre, profond, trait sombre, trait clair)
TONES = {
    "marble": ("#FFFFFF", "#F4EFE5", "#DCD4C4", "#A79E8C", "#6E675B", "#8D8576", "#FFFFFF"),
    "warm": ("#FFF8EA", "#F3E4C8", "#D9C09A", "#A88A62", "#6B5236", "#8E7350", "#FFF6E0"),
    "stone": ("#FFF0D8", "#E8CFA4", "#C49E6E", "#8A6A44", "#4A3420", "#6E5034", "#FFF2DE"),
    "night": ("#DCE6F5", "#AFC0DA", "#7E92B4", "#4A5C80", "#22304E", "#33456A", "#E8F0FF"),
    "gold": ("#FFF6CF", "#F5D27A", "#E1A93A", "#A4701C", "#5E3A08", "#7A4E10", "#FFF4C2"),
    "rosegold": ("#FFEFE6", "#F2C3AE", "#DA9278", "#A0604C", "#5E3024", "#7E4434", "#FFE9DF"),
    "silver": ("#FFFFFF", "#E7ECF3", "#BFC8D6", "#7F8A9C", "#454E5E", "#5F6A7C", "#FFFFFF"),
    "obsidian": ("#9AA3C0", "#5A6284", "#343A56", "#1A1D2E", "#07080F", "#0B0D18", "#B9C3E8"),
}


def cyl_fill(card, tone, name=None):
    """Ombrage cylindrique d'un fût (gauche dans l'ombre, éclat à 30 %, retour de lumière au bord droit)."""
    li, cl, mo, om, pr, _, _ = TONES[tone]
    name = name or f"cyl-{tone}"
    return card.grad(name, [(0, om), (0.12, mo), (0.3, li), (0.48, cl), (0.72, mo), (0.9, om), (1, mo)], 0, 0, 1, 0)


def flat_fill(card, tone, name=None):
    li, cl, mo, om, pr, _, _ = TONES[tone]
    name = name or f"flat-{tone}"
    return card.grad(name, [(0, li), (0.55, cl), (1, mo)], 0, 0, 0, 1)


def _shaft(cx, ytop, ybot, w, taper=0.86):
    rb, rt = w / 2, w * taper / 2
    return f"M{f(cx - rb)} {f(ybot)} L{f(cx - rt)} {f(ytop)} L{f(cx + rt)} {f(ytop)} L{f(cx + rb)} {f(ybot)}Z"


def _flutes(cx, ytop, ybot, w, n, tone, taper=0.86, op=0.55):
    _, _, _, om, pr, dk, lt = TONES[tone]
    out = []
    for k in range(n):
        th = -88 + 176 * (k + 0.5) / n
        s = math.sin(math.radians(th))
        c = math.cos(math.radians(th))
        xb = cx + w / 2 * s
        xt = cx + w * taper / 2 * s
        sw = max(0.5, w * 0.05 * c)
        out.append(f'<path d="M{f(xb)} {f(ybot)} L{f(xt)} {f(ytop)}" stroke="{dk}" stroke-width="{f(sw)}" opacity="{f(op * (0.5 + 0.5 * c))}"/>')
        out.append(f'<path d="M{f(xb + sw * 1.1)} {f(ybot)} L{f(xt + sw * 1.0)} {f(ytop)}" stroke="{lt}" stroke-width="{f(sw * 0.6)}" opacity="{f(op * 0.8 * c)}"/>')
    return "".join(out)


def _hband(card, x0, x1, y, h, tone, name=None):
    """Une moulure horizontale arrondie (tore) : dégradé vertical clair au-dessus, ombre dessous."""
    li, cl, mo, om, pr, _, _ = TONES[tone]
    g = card.grad(name or f"tore-{tone}", [(0, mo), (0.3, li), (0.6, cl), (1, om)])
    return f'<rect x="{f(x0)}" y="{f(y)}" width="{f(x1 - x0)}" height="{f(h)}" rx="{f(h * 0.45)}" fill="{g}"/>'


def _slab(card, x0, x1, y, h, tone, name=None):
    li, cl, mo, om, pr, _, _ = TONES[tone]
    g = card.grad(name or f"slab-{tone}", [(0, li), (0.15, cl), (0.85, mo), (1, om)])
    return f'<rect x="{f(x0)}" y="{f(y)}" width="{f(x1 - x0)}" height="{f(h)}" fill="{g}"/>'


def acanthus(cx, by, h, w, fill, vein, curl=1.0, lean=0.0, edge=None):
    """Une feuille d'acanthe vue de face : contour à lobes dentelés, nervures, pointe qui se recourbe en avant."""
    pts = []
    n = 40
    for i in range(n + 1):
        t = i / n
        y = by - h * t * 0.9
        env = math.sin(math.pi * min(1, t * 1.02)) ** 0.7 * (1 - 0.3 * t)
        lobe = 1 + 0.2 * abs(math.sin(t * math.pi * 5)) ** 3
        pts.append((cx + w / 2 * env * lobe + lean * h * t * t, y))
    right = pts
    left = [(2 * cx - x + 2 * lean * h * ((by - y) / h / 0.9) ** 2, y) for x, y in reversed(pts)]
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in right + left) + "Z"
    tx, ty = cx + lean * h * 0.81, by - h * 0.9
    out = [f'<path d="{d}" fill="{fill}" stroke="{edge or vein}" stroke-width="{f(max(0.5, w * 0.035))}" stroke-linejoin="round"/>']
    out.append(f'<path d="M{f(cx)} {f(by)} Q{f(cx + lean * h * 0.3)} {f(by - h * 0.5)} {f(tx)} {f(ty)}" fill="none" stroke="{vein}" stroke-width="{f(w * 0.07)}" opacity="0.75"/>')
    for k in (0.28, 0.5, 0.7):
        yy = by - h * k
        xx = cx + lean * h * k * k
        out.append(f'<path d="M{f(xx)} {f(yy)} Q{f(xx + w * 0.2)} {f(yy - h * 0.05)} {f(xx + w * 0.34)} {f(yy - h * 0.15)} '
                   f'M{f(xx)} {f(yy)} Q{f(xx - w * 0.2)} {f(yy - h * 0.05)} {f(xx - w * 0.34)} {f(yy - h * 0.15)}" fill="none" stroke="{vein}" stroke-width="{f(w * 0.045)}" opacity="0.6"/>')
    out.append(f'<path d="M{f(tx - w * 0.22)} {f(ty + h * 0.02)} Q{f(tx)} {f(ty - h * 0.14 * curl)} {f(tx + w * 0.22)} {f(ty + h * 0.02)} '
               f'Q{f(tx + w * 0.12)} {f(ty + h * 0.16)} {f(tx)} {f(ty + h * 0.14)} Q{f(tx - w * 0.12)} {f(ty + h * 0.16)} {f(tx - w * 0.22)} {f(ty + h * 0.02)}Z" '
               f'fill="{fill}" stroke="{edge or vein}" stroke-width="{f(max(0.5, w * 0.035))}"/>')
    return "".join(out)


def _volute_disc(card, x, y, r, tone, sense):
    li, cl, mo, om, pr, dk, lt = TONES[tone]
    g = card.rgrad(f"vol-{tone}", [(0, li, 1), (0.6, cl, 1), (1, om, 1)], 0.4, 0.35, 0.7)
    pts = []
    for i in range(80):
        t = i / 79
        a = math.radians(-90 + sense * t * 360 * 2.2)
        rr = r * (0.95 - 0.78 * t)
        pts.append((x + rr * math.cos(a), y + rr * math.sin(a)))
    d = "M" + " L".join(f"{f(a)} {f(b)}" for a, b in pts)
    return (f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{g}"/>'
            f'<path d="{d}" fill="none" stroke="{dk}" stroke-width="{f(r * 0.1)}" stroke-linecap="round" opacity="0.85"/>'
            f'<path d="{d}" fill="none" stroke="{lt}" stroke-width="{f(r * 0.04)}" stroke-linecap="round" opacity="0.7" transform="translate({f(-r * 0.06)} {f(-r * 0.06)})"/>'
            f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.16)}" fill="{dk}"/><circle cx="{f(x - r * 0.04)}" cy="{f(y - r * 0.04)}" r="{f(r * 0.08)}" fill="{lt}"/>')


def column(card, cx, y0, y1, w, order="ionic", tone="marble", flutes=12, cap_tone=None, base=True):
    """Une colonne entière : chapiteau en haut à y0, base en bas à y1, fût de diamètre w (en bas)."""
    cap_tone = cap_tone or tone
    li, cl, mo, om, pr, dk, lt = TONES[tone]
    out = []
    if order == "doric":
        cap_h, base_h = w * 0.42, 0.0
    elif order == "corinthian":
        cap_h, base_h = w * 1.15, w * 0.5
    else:
        cap_h, base_h = w * 0.62, w * 0.5
    if not base:
        base_h = 0
    ytop, ybot = y0 + cap_h, y1 - base_h
    taper = 0.86 if order != "doric" else 0.78
    out.append(f'<path d="{_shaft(cx, ytop, ybot, w, taper)}" fill="{cyl_fill(card, tone)}"/>')
    out.append(_flutes(cx, ytop, ybot, w, flutes if order != "doric" else max(8, flutes - 2), tone, taper))
    tw = w * taper
    # base attique : plinthe, tore, scotie, tore
    if base_h:
        b = ybot
        out.append(_hband(card, cx - w * 0.6, cx + w * 0.6, b, w * 0.13, tone))
        out.append(f'<rect x="{f(cx - w * 0.54)}" y="{f(b + w * 0.13)}" width="{f(w * 1.08)}" height="{f(w * 0.07)}" fill="{om}"/>')
        out.append(_hband(card, cx - w * 0.68, cx + w * 0.68, b + w * 0.2, w * 0.15, tone))
        out.append(_slab(card, cx - w * 0.72, cx + w * 0.72, b + w * 0.35, w * 0.15, tone))
    ct = cap_tone
    cli, ccl, cmo, com, cpr, cdk, clt = TONES[ct]
    if order == "doric":
        out.append(f'<rect x="{f(cx - tw / 2)}" y="{f(ytop - w * 0.03)}" width="{f(tw)}" height="{f(w * 0.06)}" fill="{cdk}" opacity="0.5"/>')
        ech = f"M{f(cx - tw / 2)} {f(ytop)} C{f(cx - tw * 0.62)} {f(ytop - w * 0.1)} {f(cx - w * 0.68)} {f(y0 + w * 0.2)} {f(cx - w * 0.66)} {f(y0 + w * 0.16)} L{f(cx + w * 0.66)} {f(y0 + w * 0.16)} C{f(cx + w * 0.68)} {f(y0 + w * 0.2)} {f(cx + tw * 0.62)} {f(ytop - w * 0.1)} {f(cx + tw / 2)} {f(ytop)}Z"
        out.append(f'<path d="{ech}" fill="{cyl_fill(card, ct)}"/>')
        out.append(_slab(card, cx - w * 0.7, cx + w * 0.7, y0, w * 0.16, ct))
    elif order == "ionic":
        out.append(f'<rect x="{f(cx - tw * 0.52)}" y="{f(ytop - w * 0.06)}" width="{f(tw * 1.04)}" height="{f(w * 0.06)}" rx="{f(w * 0.03)}" fill="{ccl}"/>')
        ey = y0 + w * 0.3
        out.append(f'<rect x="{f(cx - w * 0.56)}" y="{f(ey)}" width="{f(w * 1.12)}" height="{f(w * 0.2)}" rx="{f(w * 0.05)}" fill="{cyl_fill(card, ct)}"/>')
        for k in range(5):
            ex = cx - w * 0.4 + w * 0.2 * k
            out.append(f'<ellipse cx="{f(ex)}" cy="{f(ey + w * 0.1)}" rx="{f(w * 0.065)}" ry="{f(w * 0.075)}" fill="{cli}" stroke="{cdk}" stroke-width="{f(w * 0.02)}"/>')
        vy = y0 + w * 0.28
        cush = (f"M{f(cx - w * 0.78)} {f(y0 + w * 0.1)} L{f(cx + w * 0.78)} {f(y0 + w * 0.1)} L{f(cx + w * 0.78)} {f(y0 + w * 0.22)} "
                f"Q{f(cx)} {f(y0 + w * 0.34)} {f(cx - w * 0.78)} {f(y0 + w * 0.22)}Z")
        out.append(f'<path d="{cush}" fill="{flat_fill(card, ct)}"/>')
        out.append(f'<path d="M{f(cx - w * 0.6)} {f(y0 + w * 0.2)} Q{f(cx)} {f(y0 + w * 0.3)} {f(cx + w * 0.6)} {f(y0 + w * 0.2)}" fill="none" stroke="{cdk}" stroke-width="{f(w * 0.03)}" opacity="0.6"/>')
        out.append(_volute_disc(card, cx - w * 0.66, vy, w * 0.24, ct, -1))
        out.append(_volute_disc(card, cx + w * 0.66, vy, w * 0.24, ct, 1))
        out.append(_slab(card, cx - w * 0.8, cx + w * 0.8, y0, w * 0.11, ct))
    else:
        bell_top = y0 + w * 0.15
        hh = cap_h
        out.append(f'<rect x="{f(cx - tw * 0.52)}" y="{f(ytop - w * 0.06)}" width="{f(tw * 1.04)}" height="{f(w * 0.06)}" rx="{f(w * 0.03)}" fill="{ccl}"/>')
        bell = (f"M{f(cx - tw / 2)} {f(ytop)} C{f(cx - tw / 2)} {f(ytop - hh * 0.5)} {f(cx - w * 0.62)} {f(bell_top + hh * 0.2)} {f(cx - w * 0.66)} {f(bell_top)} "
                f"L{f(cx + w * 0.66)} {f(bell_top)} C{f(cx + w * 0.62)} {f(bell_top + hh * 0.2)} {f(cx + tw / 2)} {f(ytop - hh * 0.5)} {f(cx + tw / 2)} {f(ytop)}Z")
        out.append(f'<path d="{bell}" fill="{cpr}"/>')
        lf = card.grad(f"acan-{ct}", [(0, cli), (0.45, ccl), (1, cmo)], 0, 0, 0, 1)
        lf2 = card.grad(f"acan2-{ct}", [(0, ccl), (0.6, cmo), (1, com)], 0, 0, 0, 1)
        for m in (-1, 1):
            sx, sy = cx + m * w * 0.26, ytop - hh * 0.45
            out.append(f'<path d="M{f(sx)} {f(sy)} C{f(sx + m * w * 0.08)} {f(sy - hh * 0.25)} {f(cx + m * w * 0.5)} {f(bell_top + w * 0.2)} {f(cx + m * w * 0.68)} {f(bell_top + w * 0.08)}" '
                       f'fill="none" stroke="{ccl}" stroke-width="{f(w * 0.075)}" stroke-linecap="round"/>')
            out.append(f'<path d="M{f(sx)} {f(sy)} C{f(sx - m * w * 0.02)} {f(sy - hh * 0.25)} {f(cx + m * w * 0.18)} {f(bell_top + w * 0.2)} {f(cx + m * w * 0.1)} {f(bell_top + w * 0.1)}" '
                       f'fill="none" stroke="{ccl}" stroke-width="{f(w * 0.05)}" stroke-linecap="round"/>')
            out.append(_volute_disc(card, cx + m * w * 0.7, bell_top + w * 0.1, w * 0.13, ct, m))
            out.append(_volute_disc(card, cx + m * w * 0.1, bell_top + w * 0.13, w * 0.06, ct, -m))
        for m in (-1, 1):
            out.append(acanthus(cx + m * w * 0.6, ytop - hh * 0.04, hh * 0.68, w * 0.4, lf2, cdk, lean=m * 0.14))
        out.append(acanthus(cx, ytop - hh * 0.02, hh * 0.74, w * 0.42, lf2, cdk))
        for m in (-1, 1):
            out.append(acanthus(cx + m * w * 0.3, ytop, hh * 0.44, w * 0.38, lf, cdk, lean=m * 0.05))
        for m in (-1, 1):
            out.append(acanthus(cx + m * w * 0.66, ytop + hh * 0.02, hh * 0.4, w * 0.3, lf, cdk, lean=m * 0.22))
        ab = (f"M{f(cx - w * 0.86)} {f(y0)} Q{f(cx)} {f(y0 + w * 0.07)} {f(cx + w * 0.86)} {f(y0)} L{f(cx + w * 0.8)} {f(bell_top)} "
              f"Q{f(cx)} {f(bell_top + w * 0.05)} {f(cx - w * 0.8)} {f(bell_top)}Z")
        out.append(f'<path d="{ab}" fill="{flat_fill(card, ct)}" stroke="{cdk}" stroke-width="{f(w * 0.02)}"/>')
        for k in range(8):
            px, py = pt(cx, y0 + w * 0.09, w * 0.06, 45 * k)
            out.append(f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(w * 0.032)}" fill="{cli}" stroke="{cdk}" stroke-width="{f(w * 0.01)}"/>')
        out.append(f'<circle cx="{f(cx)}" cy="{f(y0 + w * 0.09)}" r="{f(w * 0.03)}" fill="{cmo}"/>')
    return "".join(out)


def stylobate(card, x0, x1, y, steps=3, h=16, inset=10, tone="marble"):
    """Les degrés du temple (crépis) : marches qui s'élargissent vers le bas."""
    li, cl, mo, om, pr, dk, lt = TONES[tone]
    out = []
    for i in range(steps):
        yy = y + i * h
        a, b = x0 - i * inset, x1 + i * inset
        out.append(f'<rect x="{f(a)}" y="{f(yy)}" width="{f(b - a)}" height="{f(h)}" fill="{card.grad(f"step-{tone}", [(0, li), (0.18, cl), (0.8, mo), (1, om)])}"/>')
        out.append(f'<rect x="{f(a)}" y="{f(yy)}" width="{f(b - a)}" height="1.4" fill="{lt}" opacity="0.8"/>')
    return "".join(out)


def pediment(card, x0, x1, yb, h, tone="marble", rim=10, tymp=None, cornice=12):
    """Un fronton : corniche horizontale, deux rampants, tympan en retrait. Rend (markup, chemin du tympan)."""
    li, cl, mo, om, pr, dk, lt = TONES[tone]
    cx = (x0 + x1) / 2
    ya = yb - h
    out = []
    outer = f"M{f(x0 - rim)} {f(yb)} L{f(cx)} {f(ya - rim * 1.2)} L{f(x1 + rim)} {f(yb)}Z"
    out.append(f'<path d="{outer}" fill="{card.grad(f"ped-o-{tone}", [(0, li), (0.6, cl), (1, mo)])}"/>')
    k = rim * 1.1
    inner = f"M{f(x0 + k * 1.8)} {f(yb - rim * 0.6)} L{f(cx)} {f(ya + k * 0.9)} L{f(x1 - k * 1.8)} {f(yb - rim * 0.6)}Z"
    tf = tymp or card.grad(f"ped-t-{tone}", [(0, om), (0.5, mo), (1, om)])
    out.append(f'<path d="{inner}" fill="{tf}"/>')
    out.append(f'<path d="M{f(x0 + k * 1.8)} {f(yb - rim * 0.6)} L{f(cx)} {f(ya + k * 0.9)} L{f(x1 - k * 1.8)} {f(yb - rim * 0.6)}" fill="none" stroke="{pr}" stroke-width="2" opacity="0.6"/>')
    out.append(f'<path d="M{f(x0 - rim)} {f(yb)} L{f(cx)} {f(ya - rim * 1.2)} L{f(x1 + rim)} {f(yb)}" fill="none" stroke="{lt}" stroke-width="1.6" opacity="0.9"/>')
    out.append(_slab(card, x0 - rim * 1.6, x1 + rim * 1.6, yb - 2, cornice, tone))
    out.append(f'<rect x="{f(x0 - rim * 1.6)}" y="{f(yb - 2)}" width="{f(x1 - x0 + rim * 3.2)}" height="1.4" fill="{lt}"/>')
    return "".join(out), inner


def entablature(card, x0, x1, y, tone="marble", arch_h=26, frieze_h=34, frieze=None, dentil=True):
    """Entablement : corniche à denticules, frise (contenu libre), architrave à trois fasces. Rend (markup, y bas)."""
    li, cl, mo, om, pr, dk, lt = TONES[tone]
    out = []
    yy = y
    out.append(_slab(card, x0 - 8, x1 + 8, yy, 10, tone))
    yy += 10
    if dentil:
        out.append(f'<rect x="{f(x0)}" y="{f(yy)}" width="{f(x1 - x0)}" height="8" fill="{om}"/>')
        n = int((x1 - x0) / 11)
        u = (x1 - x0) / n
        out.append("".join(f'<rect x="{f(x0 + u * i + u * 0.18)}" y="{f(yy)}" width="{f(u * 0.64)}" height="7" fill="{cl}"/>' for i in range(n)))
        yy += 8
    fr0 = yy
    out.append(f'<rect x="{f(x0)}" y="{f(yy)}" width="{f(x1 - x0)}" height="{f(frieze_h)}" fill="{card.grad(f"frz-{tone}", [(0, mo), (0.2, cl), (1, mo)])}"/>')
    if frieze:
        out.append(frieze(x0, yy, x1, yy + frieze_h))
    yy += frieze_h
    out.append(f'<rect x="{f(x0)}" y="{f(yy)}" width="{f(x1 - x0)}" height="3" fill="{pr}" opacity="0.6"/>')
    yy += 3
    fh = arch_h / 3
    for i in range(3):
        a = x0 + (2 - i) * 2.5
        b = x1 - (2 - i) * 2.5
        out.append(f'<rect x="{f(a)}" y="{f(yy)}" width="{f(b - a)}" height="{f(fh)}" fill="{card.grad(f"fas-{tone}", [(0, li), (1, mo)])}"/>')
        out.append(f'<rect x="{f(a)}" y="{f(yy + fh - 1)}" width="{f(b - a)}" height="1" fill="{om}"/>')
        yy += fh
    return "".join(out), yy, fr0


def triglyphs(x0, y0, x1, y1, color, shade, n=6):
    """Triglyphes d'une frise dorique ; rend (markup, centres des métopes)."""
    u = (x1 - x0) / n
    tw = u * 0.32
    out = []
    centers = []
    for i in range(n + 1):
        x = x0 + u * i - tw / 2
        a, b = max(x0, x), min(x1, x + tw)
        out.append(f'<rect x="{f(a)}" y="{f(y0)}" width="{f(b - a)}" height="{f(y1 - y0)}" fill="{color}"/>')
        for g in (0.3, 0.65):
            gx = x + tw * g
            if x0 < gx < x1:
                out.append(f'<rect x="{f(gx - tw * 0.07)}" y="{f(y0 + 3)}" width="{f(tw * 0.14)}" height="{f(y1 - y0 - 6)}" fill="{shade}"/>')
        if i < n:
            centers.append((x0 + u * (i + 0.5), (y0 + y1) / 2))
    return "".join(out), centers


# ---------------------------------------------------------------- paysage

def cypress(x, by, h, color, w=None):
    w = w or h * 0.16
    return (f'<path d="M{f(x)} {f(by - h)} C{f(x + w * 0.5)} {f(by - h * 0.75)} {f(x + w * 0.62)} {f(by - h * 0.3)} {f(x + w * 0.3)} {f(by)} '
            f'L{f(x - w * 0.3)} {f(by)} C{f(x - w * 0.62)} {f(by - h * 0.3)} {f(x - w * 0.5)} {f(by - h * 0.75)} {f(x)} {f(by - h)}Z" fill="{color}"/>')


def olive_tree(x, by, h, trunk, leaves, silver=None, seed=3, spread=1.0):
    """Un olivier : tronc noueux torsadé, couronne en nuages de feuilles lancéolées argentées."""
    rnd = random.Random(seed)
    out = []
    tw = h * 0.09
    t = (f"M{f(x - tw)} {f(by)} C{f(x - tw * 0.4)} {f(by - h * 0.18)} {f(x - tw * 1.8)} {f(by - h * 0.3)} {f(x - tw * 0.6)} {f(by - h * 0.46)} "
         f"C{f(x - tw * 2.2)} {f(by - h * 0.55)} {f(x - h * 0.3 * spread)} {f(by - h * 0.6)} {f(x - h * 0.36 * spread)} {f(by - h * 0.66)} "
         f"L{f(x - h * 0.3 * spread)} {f(by - h * 0.68)} C{f(x - tw)} {f(by - h * 0.6)} {f(x)} {f(by - h * 0.56)} {f(x + tw * 0.2)} {f(by - h * 0.62)} "
         f"C{f(x + tw * 0.6)} {f(by - h * 0.66)} {f(x + h * 0.26 * spread)} {f(by - h * 0.62)} {f(x + h * 0.34 * spread)} {f(by - h * 0.7)} "
         f"L{f(x + h * 0.36 * spread)} {f(by - h * 0.66)} C{f(x + tw * 1.6)} {f(by - h * 0.52)} {f(x + tw * 0.4)} {f(by - h * 0.4)} {f(x + tw * 1.2)} {f(by - h * 0.26)} "
         f"C{f(x + tw * 1.6)} {f(by - h * 0.12)} {f(x + tw * 0.8)} {f(by - h * 0.04)} {f(x + tw * 1.4)} {f(by)}Z")
    out.append(f'<path d="{t}" fill="{trunk}"/>')
    blobs = [(-0.34, 0.72, 0.2), (0.32, 0.74, 0.2), (0, 0.8, 0.24), (-0.16, 0.92, 0.18), (0.18, 0.9, 0.18), (-0.46, 0.66, 0.13), (0.46, 0.68, 0.13)]
    for bx, byy, br in blobs:
        cx, cy, r = x + bx * h * spread, by - byy * h, br * h
        for _ in range(int(26 * br / 0.2)):
            a = rnd.uniform(0, 360)
            d = r * rnd.random() ** 0.5
            lx, ly = pt(cx, cy, d, a)
            L = h * rnd.uniform(0.05, 0.08)
            col = silver if (silver and rnd.random() < 0.35) else leaves
            rot = rnd.uniform(-70, 70) + (a if rnd.random() < 0.5 else 0)
            out.append(f'<ellipse cx="{f(lx)}" cy="{f(ly)}" rx="{f(L * 0.22)}" ry="{f(L * 0.5)}" fill="{col}" transform="rotate({f(rot)} {f(lx)} {f(ly)})"/>')
    return "".join(out)


def cycladic(card, x, by, s=1.0, seed=2, white="#FBFAF6", shade="#C9D3E2", blue="#1F5FA8", door="#2C6FB8", dome=True, lit_side=1):
    """Un hameau des Cyclades : cubes chaulés empilés, ombres bleutées, portes et volets bleus, une coupole."""
    rnd = random.Random(seed)
    out = []
    blocks = [(-60, 0, 54, 40), (-14, 0, 46, 52), (26, 0, 58, 34), (-44, -40, 40, 30), (6, -52, 36, 28), (30, -34, 36, 26)]
    for bx, byy, bw, bh in blocks:
        x0 = x + bx * s
        y1 = by + byy * s
        y0 = y1 - bh * s
        w = bw * s
        out.append(f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(w)}" height="{f(bh * s)}" fill="{white}"/>')
        sw = w * 0.22
        sx = x0 + w - sw if lit_side > 0 else x0
        out.append(f'<rect x="{f(sx)}" y="{f(y0)}" width="{f(sw)}" height="{f(bh * s)}" fill="{shade}" opacity="0.9"/>')
        out.append(f'<rect x="{f(x0 - 1)}" y="{f(y0 - 2.2 * s)}" width="{f(w + 2)}" height="{f(2.6 * s)}" fill="{white}"/>')
        if rnd.random() < 0.7:
            dw, dh = 7 * s, 12 * s
            dx = x0 + rnd.uniform(0.15, 0.55) * w
            out.append(f'<rect x="{f(dx)}" y="{f(y1 - dh)}" width="{f(dw)}" height="{f(dh)}" fill="{door}"/>')
        if rnd.random() < 0.8:
            wx = x0 + rnd.uniform(0.2, 0.6) * w
            out.append(f'<rect x="{f(wx)}" y="{f(y0 + bh * s * 0.25)}" width="{f(6 * s)}" height="{f(7 * s)}" fill="{blue}"/>')
    if dome:
        dx, dy = x + 30 * s, by - 34 * s - 26 * s
        r = 17 * s
        g = card.rgrad("dome-g", [(0, "#8CC4F0", 1), (0.5, blue, 1), (1, "#0D3366", 1)], 0.35, 0.3, 0.8)
        out.append(f'<rect x="{f(dx - r * 1.05)}" y="{f(dy)}" width="{f(r * 2.1)}" height="{f(8 * s)}" fill="{white}"/>')
        out.append(f'<path d="M{f(dx - r)} {f(dy)} A{f(r)} {f(r * 1.05)} 0 0 1 {f(dx + r)} {f(dy)}Z" fill="{g}"/>')
        out.append(f'<path d="M{f(dx)} {f(dy - r * 1.05)} V{f(dy - r * 1.6)} M{f(dx - 3 * s)} {f(dy - r * 1.4)} H{f(dx + 3 * s)}" stroke="{white}" stroke-width="{f(1.4 * s)}"/>')
        bx = x - 44 * s
        out.append(f'<rect x="{f(bx)}" y="{f(by - 40 * s - 44 * s)}" width="{f(16 * s)}" height="{f(44 * s)}" fill="{white}"/>'
                   f'<path d="M{f(bx + 3 * s)} {f(by - 40 * s - 30 * s)} v{f(-8 * s)} a{f(5 * s)} {f(5 * s)} 0 0 1 {f(10 * s)} 0 v{f(8 * s)}Z" fill="{blue}"/>'
                   f'<path d="M{f(bx - 1)} {f(by - 84 * s)} L{f(bx + 8 * s)} {f(by - 94 * s)} L{f(bx + 17 * s)} {f(by - 84 * s)}Z" fill="{white}"/>'
                   f'<path d="M{f(bx + 8 * s)} {f(by - 94 * s)} V{f(by - 102 * s)} M{f(bx + 5 * s)} {f(by - 99 * s)} H{f(bx + 11 * s)}" stroke="{white}" stroke-width="{f(1.2 * s)}"/>')
    return "".join(out)


def bougainvillea(x, y, r, seed, colors=("#D6237A", "#F0489A", "#B0105E", "#FF7DB8"), leaf="#3F6B2A", n=70):
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        a = rnd.uniform(0, 360)
        d = r * rnd.random() ** 0.6
        px, py = pt(x, y, d, a)
        if rnd.random() < 0.25:
            out.append(f'<ellipse cx="{f(px)}" cy="{f(py)}" rx="{f(r * 0.06)}" ry="{f(r * 0.1)}" fill="{leaf}" transform="rotate({f(rnd.uniform(0, 180))} {f(px)} {f(py)})"/>')
        else:
            rr = r * rnd.uniform(0.04, 0.075)
            col = rnd.choice(colors)
            out.append(f'<path d="M{f(px)} {f(py - rr)} L{f(px + rr * 0.95)} {f(py + rr * 0.6)} L{f(px - rr * 0.95)} {f(py + rr * 0.6)}Z" fill="{col}" '
                       f'transform="rotate({f(rnd.uniform(0, 120))} {f(px)} {f(py)})" stroke="{col}" stroke-width="{f(rr * 0.5)}" stroke-linejoin="round"/>')
    return "".join(out)


def pharos(card, x, by, s=1.0, stone="warm", fire=True):
    """Le phare d'Alexandrie : socle carré à fenêtres, étage octogonal, tambour rond, lanterne et feu."""
    li, cl, mo, om, pr, dk, lt = TONES[stone]
    out = []
    g = card.grad("pharos-st", [(0, om), (0.25, cl), (0.55, li), (0.85, mo), (1, om)], 0, 0, 1, 0)
    t1 = (f"M{f(x - 34 * s)} {f(by)} L{f(x - 27 * s)} {f(by - 270 * s)} L{f(x + 27 * s)} {f(by - 270 * s)} L{f(x + 34 * s)} {f(by)}Z")
    out.append(f'<path d="{t1}" fill="{g}"/>')
    for i in range(9):
        yy = by - 18 * s - i * 28 * s
        for dx in (-12, 0, 12):
            out.append(f'<rect x="{f(x + dx * s - 2.4 * s)}" y="{f(yy - 9 * s)}" width="{f(4.8 * s)}" height="{f(9 * s)}" rx="{f(2.4 * s)}" fill="{pr}" opacity="0.75"/>')
    out.append(f'<rect x="{f(x - 34 * s)}" y="{f(by - 278 * s)}" width="{f(68 * s)}" height="{f(9 * s)}" fill="{cl}"/>')
    t2 = f"M{f(x - 22 * s)} {f(by - 270 * s)} L{f(x - 18 * s)} {f(by - 380 * s)} L{f(x + 18 * s)} {f(by - 380 * s)} L{f(x + 22 * s)} {f(by - 270 * s)}Z"
    out.append(f'<path d="{t2}" fill="{g}"/>')
    out.append(f'<path d="M{f(x - 6 * s)} {f(by - 270 * s)} L{f(x - 5 * s)} {f(by - 380 * s)} M{f(x + 6 * s)} {f(by - 270 * s)} L{f(x + 5 * s)} {f(by - 380 * s)}" stroke="{om}" stroke-width="{f(1.2 * s)}" opacity="0.6"/>')
    out.append(f'<rect x="{f(x - 24 * s)}" y="{f(by - 386 * s)}" width="{f(48 * s)}" height="{f(7 * s)}" fill="{cl}"/>')
    t3 = f"M{f(x - 13 * s)} {f(by - 380 * s)} L{f(x - 12 * s)} {f(by - 430 * s)} L{f(x + 12 * s)} {f(by - 430 * s)} L{f(x + 13 * s)} {f(by - 380 * s)}Z"
    out.append(f'<path d="{t3}" fill="{g}"/>')
    for dx in (-8, 0, 8):
        out.append(f'<rect x="{f(x + dx * s - 1.6 * s)}" y="{f(by - 424 * s)}" width="{f(3.2 * s)}" height="{f(36 * s)}" fill="{om}" opacity="0.6"/>')
    out.append(f'<path d="M{f(x - 16 * s)} {f(by - 430 * s)} L{f(x + 16 * s)} {f(by - 430 * s)} L{f(x + 11 * s)} {f(by - 440 * s)} L{f(x - 11 * s)} {f(by - 440 * s)}Z" fill="{cl}"/>')
    if fire:
        fx, fy = x, by - 452 * s
        out.append(f'<circle cx="{f(fx)}" cy="{f(fy)}" r="{f(40 * s)}" fill="{card.rgrad("ph-fire-h", [(0, "#FFF4C2", 0.9), (0.3, "#FFC24A", 0.5), (1, "#FF7A1A", 0)])}"/>')
        out.append(f'<path d="M{f(fx - 9 * s)} {f(fy + 12 * s)} C{f(fx - 12 * s)} {f(fy)} {f(fx - 2 * s)} {f(fy - 6 * s)} {f(fx)} {f(fy - 20 * s)} '
                   f'C{f(fx + 3 * s)} {f(fy - 8 * s)} {f(fx + 12 * s)} {f(fy - 2 * s)} {f(fx + 9 * s)} {f(fy + 12 * s)}Z" fill="#FFE07A"/>'
                   f'<path d="M{f(fx - 4 * s)} {f(fy + 12 * s)} C{f(fx - 5 * s)} {f(fy + 4 * s)} {f(fx)} {f(fy)} {f(fx)} {f(fy - 8 * s)} C{f(fx + 2 * s)} {f(fy + 2 * s)} {f(fx + 5 * s)} {f(fy + 5 * s)} {f(fx + 4 * s)} {f(fy + 12 * s)}Z" fill="#FFFFFF"/>')
    return "".join(out)


def theatre_tiers(card, cx, cy, r0, r1, n, tone="warm", a0=-100, a1=100, aisles=9, light=None, aisle_w=None, aisle_op=0.55):
    """Les gradins d'un théâtre vus d'en haut : rangées concentriques (arcs) et escaliers rayonnants."""
    li, cl, mo, om, pr, dk, lt = TONES[tone]
    out = []
    for i in range(n):
        r = r0 + (r1 - r0) * i / (n - 1)
        x1, y1 = pt(cx, cy, r, a0)
        x2, y2 = pt(cx, cy, r, a1)
        big = 1 if (a1 - a0) > 180 else 0
        d = f"M{f(x1)} {f(y1)} A{f(r)} {f(r)} 0 {big} 1 {f(x2)} {f(y2)}"
        step = (r1 - r0) / (n - 1)
        out.append(f'<path d="{d}" fill="none" stroke="{om}" stroke-width="{f(step * 0.98)}" opacity="0.95"/>')
        out.append(f'<path d="{d}" fill="none" stroke="{cl}" stroke-width="{f(step * 0.5)}" transform="translate(0 {f(-step * 0.18)})" opacity="0.95"/>')
        out.append(f'<path d="{d}" fill="none" stroke="{lt}" stroke-width="{f(max(0.6, step * 0.08))}" transform="translate(0 {f(-step * 0.42)})" opacity="0.9"/>')
    for k in range(aisles):
        a = a0 + (a1 - a0) * (k + 0.5) / aisles
        xa, ya = pt(cx, cy, r0 - 4, a)
        xb, yb = pt(cx, cy, r1 + 4, a)
        aw = aisle_w or (r1 - r0) / n * 0.9
        out.append(f'<path d="M{f(xa)} {f(ya)} L{f(xb)} {f(yb)}" stroke="{pr}" stroke-width="{f(aw)}" opacity="{aisle_op}"/>')
        out.append(f'<path d="M{f(xa)} {f(ya)} L{f(xb)} {f(yb)}" stroke="{lt}" stroke-width="{f(aw * 0.5)}" opacity="{aisle_op * 0.9}" stroke-dasharray="1.2 3.2"/>')
    return "".join(out)
