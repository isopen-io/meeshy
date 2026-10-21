"""Aurores du Nord - le kit : géométrie, filtres, fenêtres photo, cadres, inscriptions."""

import math
import random

from base import W, H, f, pt, esc, SANS, CINZEL, CINZEL_DECO, HAND, GARAMOND, FRAUNCES, METALS, sparkle

DATE = "10 octobre 2026"
KICKER = "Nouveau rang · Aurores du Nord"

# ---------------------------------------------------------------- palette

GLACE_CLAIR = "#E8F7FF"
GLACE = "#9FD8F0"
GLACE_MOY = "#4FA6D6"
GLACE_FONCE = "#16395E"
NUIT = "#050B1A"
NUIT_BLEUE = "#0A1830"
AURORE_V = "#4DFFB4"
AURORE_V2 = "#1FD69A"
AURORE_C = "#7CF7FF"
AURORE_P = "#B07CFF"
AURORE_R = "#FF6FC8"
BOIS = "#2A1A10"
BOIS_FONCE = "#160C06"
BOIS_CLAIR = "#5A3A22"
OR = METALS["gold"]
ARGENT = METALS["silver"]
ETAIN = METALS["pewter"]
OR_ROUGE = METALS["redgold"]
PRISME = METALS["prism"]
OCRE_RUNE = "#C8462A"


# ---------------------------------------------------------------- géométrie

def smooth(pts, closed=False):
    """Catmull-Rom -> Bézier : une courbe lisse qui passe par les points."""
    n = len(pts)
    if n < 2:
        return ""
    d = [f"M{f(pts[0][0])} {f(pts[0][1])}"]
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = pts[i - 1] if (closed or i > 0) else pts[0]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if (closed or i + 2 < n) else pts[-1]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d.append(f"C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}")
    return " ".join(d) + (" Z" if closed else "")


def resample(pts, n):
    """Points régulièrement espacés le long d'une polyligne lissée (Catmull-Rom)."""
    dense = []
    m = len(pts)
    for i in range(m - 1):
        p0 = pts[i - 1] if i > 0 else pts[0]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[i + 2] if i + 2 < m else pts[-1]
        for k in range(12):
            t = k / 12
            t2, t3 = t * t, t * t * t
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            dense.append((x, y))
    dense.append(pts[-1])
    acc = [0.0]
    for i in range(1, len(dense)):
        acc.append(acc[-1] + math.dist(dense[i - 1], dense[i]))
    total = acc[-1] or 1
    out = []
    j = 0
    for k in range(n):
        target = total * k / (n - 1)
        while j < len(acc) - 2 and acc[j + 1] < target:
            j += 1
        seg = acc[j + 1] - acc[j] or 1
        t = (target - acc[j]) / seg
        out.append((dense[j][0] + (dense[j + 1][0] - dense[j][0]) * t, dense[j][1] + (dense[j + 1][1] - dense[j][1]) * t))
    return out


def normals(pts):
    out = []
    for i in range(len(pts)):
        a = pts[max(0, i - 1)]
        b = pts[min(len(pts) - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        n = math.hypot(dx, dy) or 1
        out.append((-dy / n, dx / n))
    return out


def ribbon(pts, w0, w1=None, n=40, wfn=None, cap=True):
    """Un ruban effilé le long d'une courbe : largeur w0 -> w1 (ou wfn(t))."""
    w1 = w0 if w1 is None else w1
    sp = resample(pts, n)
    nm = normals(sp)
    left, right = [], []
    for i, ((x, y), (nx, ny)) in enumerate(zip(sp, nm)):
        t = i / (n - 1)
        w = wfn(t) if wfn else w0 + (w1 - w0) * t
        left.append((x + nx * w / 2, y + ny * w / 2))
        right.append((x - nx * w / 2, y - ny * w / 2))
    poly = left + right[::-1]
    d = smooth(left) + " L" + smooth(right[::-1])[1:]
    return d + " Z"


def rrect(x0, y0, x1, y1, r):
    return (
        f"M{f(x0 + r)} {f(y0)} L{f(x1 - r)} {f(y0)} Q{f(x1)} {f(y0)} {f(x1)} {f(y0 + r)} L{f(x1)} {f(y1 - r)} "
        f"Q{f(x1)} {f(y1)} {f(x1 - r)} {f(y1)} L{f(x0 + r)} {f(y1)} Q{f(x0)} {f(y1)} {f(x0)} {f(y1 - r)} "
        f"L{f(x0)} {f(y0 + r)} Q{f(x0)} {f(y0)} {f(x0 + r)} {f(y0)} Z"
    )


def arch(x0, x1, spring, apex, y1, r=16):
    rx = (x1 - x0) / 2
    ry = spring - apex
    return (
        f"M{f(x0)} {f(spring)} A{f(rx)} {f(ry)} 0 0 1 {f(x1)} {f(spring)} L{f(x1)} {f(y1 - r)} Q{f(x1)} {f(y1)} {f(x1 - r)} {f(y1)} "
        f"L{f(x0 + r)} {f(y1)} Q{f(x0)} {f(y1)} {f(x0)} {f(y1 - r)} Z"
    )


def gable(x0, x1, spring, apex, y1, r=14):
    """Pignon : la fenêtre en forme de façade de halle (toit à deux pans)."""
    cx = (x0 + x1) / 2
    return (
        f"M{f(x0)} {f(spring)} L{f(cx - 14)} {f(apex + 7)} Q{f(cx)} {f(apex)} {f(cx + 14)} {f(apex + 7)} L{f(x1)} {f(spring)} "
        f"L{f(x1)} {f(y1 - r)} Q{f(x1)} {f(y1)} {f(x1 - r)} {f(y1)} L{f(x0 + r)} {f(y1)} Q{f(x0)} {f(y1)} {f(x0)} {f(y1 - r)} Z"
    )


def oval(cx, cy, rx, ry):
    return f"M{f(cx - rx)} {f(cy)} A{f(rx)} {f(ry)} 0 1 1 {f(cx + rx)} {f(cy)} A{f(rx)} {f(ry)} 0 1 1 {f(cx - rx)} {f(cy)} Z"


def octo(x0, y0, x1, y1, c):
    """Rectangle aux angles abattus (gravure sur pierre)."""
    return (
        f"M{f(x0 + c)} {f(y0)} L{f(x1 - c)} {f(y0)} L{f(x1)} {f(y0 + c)} L{f(x1)} {f(y1 - c)} L{f(x1 - c)} {f(y1)} "
        f"L{f(x0 + c)} {f(y1)} L{f(x0)} {f(y1 - c)} L{f(x0)} {f(y0 + c)} Z"
    )


def place(markup, x, y, s=1.0, flip=False, rot=0, op=1):
    sx = -s if flip else s
    o = f' opacity="{f(op)}"' if op != 1 else ""
    r = f" rotate({f(rot)})" if rot else ""
    return f'<g transform="translate({f(x)} {f(y)}){r} scale({f(sx)} {f(s)})"{o}>{markup}</g>'


# ---------------------------------------------------------------- filtres

def ublur(card, name, sd):
    card.def_once(name, f'<filter id="{card.id(name)}" filterUnits="userSpaceOnUse" x="-60" y="-60" width="{W + 120}" height="{H + 120}"><feGaussianBlur stdDeviation="{sd}"/></filter>')
    return f"url(#{card.id(name)})"


def bevel(card, name, surface=1.0, spec=2.2, sd=3, dy=2, sop=0.6, shadow=True):
    """Relief métallique : éclairage spéculaire + ombre portée."""
    sh = (
        f'<feDropShadow in="lit" dx="0" dy="{dy}" stdDeviation="{sd}" flood-color="#000000" flood-opacity="{sop}"/>'
        if shadow else ""
    )
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">'
        f'<feGaussianBlur in="SourceAlpha" stdDeviation="{surface}" result="b"/>'
        f'<feSpecularLighting in="b" surfaceScale="{spec}" specularConstant="0.9" specularExponent="18" lighting-color="#FFFFFF" result="s">'
        f'<feDistantLight azimuth="225" elevation="48"/></feSpecularLighting>'
        f'<feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>'
        f'<feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k1="0" k2="1" k3="0.75" k4="0" result="lit"/>'
        f"{sh}</filter>",
    )
    return f"url(#{card.id(name)})"


def noise_filter(card, name, freq="0.012", octaves=4, seed=3, a=2.4, b=-0.9):
    """La forme filtrée ne garde sa couleur que là où le bruit fractal est dense (nuages, voiles, nébuleuses)."""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" filterUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="{octaves}" seed="{seed}" result="n"/>'
        f'<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  {a} 0 0 0 {b}" result="m"/>'
        f'<feComposite in="SourceGraphic" in2="m" operator="in"/></filter>',
    )
    return f"url(#{card.id(name)})"


def texture_filter(card, name, freq="0.6 0.04", seed=9, scale=4, light="#FFF2DC", k=1.25, octaves=4, azimuth=210, elevation=40):
    """Texture éclairée (bois, pierre, glace) appliquée à la forme."""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" filterUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="{octaves}" seed="{seed}" result="n"/>'
        f'<feDiffuseLighting in="n" surfaceScale="{scale}" lighting-color="{light}" diffuseConstant="1.1" result="l"><feDistantLight azimuth="{azimuth}" elevation="{elevation}"/></feDiffuseLighting>'
        f'<feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="{k}" k2="0" k3="0" k4="0" result="t"/>'
        f'<feComposite in="t" in2="SourceAlpha" operator="in"/></filter>',
    )
    return f"url(#{card.id(name)})"


# ---------------------------------------------------------------- fenêtres photo

def deco_mask(card, d, name="dm"):
    card.def_once(
        name,
        f'<mask id="{card.id(name)}" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}">'
        f'<rect width="{W}" height="{H}" fill="#FFFFFF"/><path d="{d}" fill="#000000"/></mask>',
    )
    return f"url(#{card.id(name)})"


def win_clip(card, d, name="wc"):
    card.def_once(name, f'<clipPath id="{card.id(name)}"><path d="{d}"/></clipPath>')
    return f"url(#{card.id(name)})"


def inner_shadow(card, d, w=30, sd=12, op=0.6, color="#000000", name="ish"):
    return f'<g clip-path="{win_clip(card, d, name + "-c")}"><path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{op}" filter="{card.blur(name, sd)}"/></g>'


def grade(card, d, color, cx=0.5, cy=0.0, op=0.3, name="grade", blend="screen"):
    """Étalonnage : une lumière d'ambiance posée sur la photo, dans la fenêtre seulement."""
    g = card.rgrad(name, [(0, color, op), (0.6, color, op * 0.35), (1, color, 0)], cx, cy, 0.9)
    return f'<g clip-path="{win_clip(card, d, name + "-c")}" style="mix-blend-mode:{blend}"><rect width="{W}" height="{H}" fill="{g}"/></g>'


def metal_grad(card, name, metal, x1=0, y1=0, x2=1, y2=1):
    hi, mid, lo = metal
    return card.grad(name, [(0, hi), (0.28, mid), (0.5, lo), (0.72, mid), (1, hi)], x1, y1, x2, y2)


def rim(card, d, metal=OR, w=5, name="rim", inner=True):
    """Le liseré métallique de la fenêtre photo."""
    hi, mid, lo = metal
    g = metal_grad(card, name + "-g", metal)
    out = [f'<g filter="{bevel(card, name + "-bv", 1.0, 2.4, sd=4, dy=3, sop=0.7)}"><path d="{d}" fill="none" stroke="{g}" stroke-width="{w}"/></g>']
    if inner:
        out.append(f'<path d="{d}" fill="none" stroke="{hi}" stroke-width="0.8" opacity="0.65"/>')
    return "".join(out)


def outer_frame(card, metal=OR, m=12, w=4, r=22, inner=True, name="of", op=1):
    hi, mid, lo = metal
    g = metal_grad(card, name + "-g", metal)
    out = [f'<g opacity="{f(op)}" filter="{bevel(card, name + "-bv", 1.0, 2.6, sd=3, dy=2, sop=0.6)}"><rect x="{m}" y="{m}" width="{W - 2 * m}" height="{H - 2 * m}" rx="{r}" fill="none" stroke="{g}" stroke-width="{w}"/></g>']
    if inner:
        out.append(f'<rect x="{m + 7}" y="{m + 7}" width="{W - 2 * m - 14}" height="{H - 2 * m - 14}" rx="{max(2, r - 5)}" fill="none" stroke="{mid}" stroke-width="0.9" opacity="{f(0.7 * op)}"/>')
    return "".join(out)


def halo(card, cx, cy, r, color, op=0.6, name="halo"):
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{card.rgrad(name, [(0, color, op), (0.45, color, op * 0.35), (1, color, 0)])}"/>'


def gem_backing(card, cx, cy, s=1.0, color="#050A16", op=0.75):
    gy = cy + 96 * s
    card.add(f'<rect x="{f(cx - 44 * s)}" y="{f(gy - 10 * s)}" width="{f(88 * s)}" height="{f(20 * s)}" rx="{f(10 * s)}" fill="{color}" opacity="{f(op)}"/>')


def numero_badge(card, cx, cy, text="Nº 42 / 100", name="nb"):
    pr = card.prism(name + "-p", 0, 0, 1, 0)
    return (
        f'<rect x="{f(cx - 64)}" y="{f(cy - 13)}" width="128" height="26" rx="13" fill="#05060F" opacity="0.92"/>'
        f'<rect x="{f(cx - 64)}" y="{f(cy - 13)}" width="128" height="26" rx="13" fill="none" stroke="{pr}" stroke-width="1.6"/>'
        f'<text x="{f(cx)}" y="{f(cy + 5)}" text-anchor="middle" font-family="{CINZEL}" font-weight="700" font-size="14" letter-spacing="1.5" fill="#FFFFFF">{esc(text)}</text>'
    )


# ---------------------------------------------------------------- l'inscription

from base import plate_layer  # noqa: E402  la couche « plate » et ses emplacements de texte


@plate_layer
def inscription(card, title, message=None, y=752, style="bois", metal=OR, panel=("#24170E", "#0C0704"),
                ink="#FFF4DC", accent=None, title_size=40, w=430, date=DATE, msg_color=None, kicker=KICKER,
                title_font=CINZEL, extra="", band=None, op=0.93):
    """L'inscription : sur-titre, titre en métal, message manuscrit de l'auteur, date.

    style : bois (planche sculptée) | glace (verre givré) | pierre (stèle) | cosmos (prisme) | nuit
    band  : un ornement de bord (markup) posé par-dessus le cadre.
    """
    hi, mid, lo = metal
    accent = accent or mid
    h = 134 if message else 112
    x0, x1 = 270 - w / 2, 270 + w / 2
    pg = card.grad("ins-pan", [(0, panel[0]), (1, panel[1])])
    out = []
    shadow = card.shadow("ins-sh", 0, 8, 12, "#000000", 0.65)
    frame_g = metal_grad(card, "ins-frame", metal)
    bv = bevel(card, "ins-bv", 0.8, 2.0, shadow=False)
    if style == "pierre":
        d = octo(x0, y, x1, y + h, 14)
        out.append(f'<path d="{d}" fill="{pg}" opacity="{f(op)}" filter="{shadow}"/>')
        out.append(f'<path d="{d}" fill="#8A929C" opacity="0.18" filter="{texture_filter(card, "ins-stone", "0.09", 4, 3, "#FFFFFF", 1.2, 4)}"/>')
        out.append(f'<g filter="{bv}"><path d="{d}" fill="none" stroke="{frame_g}" stroke-width="2.6"/></g>')
        out.append(f'<path d="{octo(x0 + 8, y + 8, x1 - 8, y + h - 8, 10)}" fill="none" stroke="{mid}" stroke-width="0.8" opacity="0.6"/>')
    else:
        r = 18 if style != "bois" else 10
        d = rrect(x0, y, x1, y + h, r)
        out.append(f'<path d="{d}" fill="{pg}" opacity="{f(op)}" filter="{shadow}"/>')
        if style == "bois":
            out.append(f'<path d="{d}" fill="#B07A48" opacity="0.16" filter="{texture_filter(card, "ins-wood", "0.012 0.32", 8, 4, "#FFE6C4", 1.25, 4)}"/>')
        if style == "glace":
            ice = card.grad("ins-ice", [(0, "#FFFFFF"), (0.5, "#BFE8FF"), (1, "#FFFFFF")], 0, 0, 1, 1)
            out.append(f'<path d="{d}" fill="{card.grad("ins-gl", [(0, "#BFE8FF"), (0.4, "#BFE8FF00"), (1, "#7FC8FF")])}" opacity="0.18"/>')
            out.append(f'<path d="{d}" fill="none" stroke="{ice}" stroke-width="2"/>')
            out.append(f'<path d="{rrect(x0 + 7, y + 7, x1 - 7, y + h - 7, 12)}" fill="none" stroke="{hi}" stroke-width="0.7" opacity="0.5"/>')
        elif style == "cosmos":
            pr = card.prism("ins-prism", 0, 0, 1, 1)
            out.append(f'<path d="{d}" fill="none" stroke="{pr}" stroke-width="2.4"/>')
            out.append(f'<path d="{rrect(x0 + 7, y + 7, x1 - 7, y + h - 7, 12)}" fill="none" stroke="{hi}" stroke-width="0.7" opacity="0.5"/>')
        elif style == "nuit":
            out.append(f'<path d="{d}" fill="none" stroke="{frame_g}" stroke-width="1.8"/>')
            out.append(f'<path d="{rrect(x0 + 7, y + 7, x1 - 7, y + h - 7, 12)}" fill="none" stroke="{hi}" stroke-width="0.7" opacity="0.45"/>')
            for sx, sy in ((x0 + 22, y + 22), (x1 - 22, y + 22), (x0 + 22, y + h - 22), (x1 - 22, y + h - 22)):
                out.append(sparkle(sx, sy, 6, hi, 0.9))
        else:
            out.append(f'<g filter="{bv}"><path d="{d}" fill="none" stroke="{frame_g}" stroke-width="3"/></g>')
            out.append(f'<path d="{rrect(x0 + 8, y + 8, x1 - 8, y + h - 8, 6)}" fill="none" stroke="{mid}" stroke-width="0.8" opacity="0.65"/>')
            for sx in (x0, x1):
                out.append(f'<g filter="{bv}"><path d="M{f(sx)} {f(y + h / 2 - 12)} L{f(sx + 9)} {f(y + h / 2)} L{f(sx)} {f(y + h / 2 + 12)} L{f(sx - 9)} {f(y + h / 2)} Z" fill="{frame_g}"/></g>')
    if band:
        out.append(band)
    out.append(extra)
    tg = card.grad("ins-title", [(0, hi), (0.55, hi), (1, mid)], 0, 0, 0, 1)
    tsh = card.shadow("ins-tsh", 0, 2, 2, "#000000", 0.8)
    out.append(f'<text x="270" y="{f(y + 29)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="11.5" letter-spacing="3.4" fill="{accent}">{esc(kicker.upper())}</text>')
    out.append(f'<text x="270" y="{f(y + 71)}" text-anchor="middle" font-family="{title_font}" font-weight="700" font-size="{title_size}" fill="{tg}" filter="{tsh}">{esc(title)}</text>')
    if message:
        out.append(f'<text x="270" y="{f(y + 104)}" text-anchor="middle" font-family="{HAND}" font-weight="700" font-size="28" fill="{msg_color or ink}">{esc(message)}</text>')
        out.append(f'<text x="270" y="{f(y + 123)}" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="11.5" letter-spacing="1.2" fill="{accent}" opacity="0.92">{esc(date)}</text>')
    else:
        out.append(f'<text x="270" y="{f(y + 96)}" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="12.5" letter-spacing="1.2" fill="{accent}" opacity="0.92">{esc(date)}</text>')
    card.add("".join(out))
    return y + h


def shape(points):
    """Contour fermé : points (x, y) lissés, (x, y, 1) = angle vif."""
    runs = []
    cur = []
    for p in points:
        cur.append((p[0], p[1]))
        if len(p) > 2 and p[2]:
            runs.append(cur)
            cur = [(p[0], p[1])]
    if cur:
        runs.append(cur)
    if len(runs) > 1:
        runs[0] = runs[-1] + runs[0][1:] if runs[-1] else runs[0]
        runs = runs[:-1]
    d = ""
    for i, run in enumerate(runs):
        seg = smooth(run) if len(run) > 2 else "M" + " L".join(f"{f(x)} {f(y)}" for x, y in run)
        d += seg if i == 0 else " L" + seg[1:]
    return d + " Z"
