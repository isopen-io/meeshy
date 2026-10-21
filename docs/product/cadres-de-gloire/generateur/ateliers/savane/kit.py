"""Afrique éternelle · Savane - le kit de composition : fenêtres photo, masques, plaques, cadres dorés."""

import math
import random

from base import W, H, f, pt, esc, SANS, CINZEL, CINZEL_DECO, HAND, GARAMOND, FRAUNCES, METALS, sparkle

from motifs import bevel, bead_line, MAASAI

DATE = "10 octobre 2026"


# ---------------------------------------------------------------- fenêtres

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


def ogive(x0, x1, spring, apex, y1, r=16):
    """Arc brisé (portes des mosquées de terre du Sahel)."""
    cx = (x0 + x1) / 2
    return (
        f"M{f(x0)} {f(spring)} C{f(x0)} {f(spring - (spring - apex) * 0.6)} {f(cx - 40)} {f(apex + 30)} {f(cx)} {f(apex)} "
        f"C{f(cx + 40)} {f(apex + 30)} {f(x1)} {f(spring - (spring - apex) * 0.6)} {f(x1)} {f(spring)} "
        f"L{f(x1)} {f(y1 - r)} Q{f(x1)} {f(y1)} {f(x1 - r)} {f(y1)} L{f(x0 + r)} {f(y1)} Q{f(x0)} {f(y1)} {f(x0)} {f(y1 - r)} Z"
    )


def oval(cx, cy, rx, ry):
    return f"M{f(cx - rx)} {f(cy)} A{f(rx)} {f(ry)} 0 1 1 {f(cx + rx)} {f(cy)} A{f(rx)} {f(ry)} 0 1 1 {f(cx - rx)} {f(cy)} Z"


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


def inner_shadow(card, d, w=30, sd=12, op=0.6, color="#000000"):
    return f'<g clip-path="{win_clip(card, d)}"><path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{op}" filter="{card.blur("ish", sd)}"/></g>'


def light_grade(card, d, color="#FFB257", cx=0.85, cy=0.0, op=0.32, name="lg"):
    """Une lumière d'ambiance sur la photo (étalonnage), dans la fenêtre seulement."""
    g = card.rgrad(name, [(0, color, op), (0.6, color, op * 0.35), (1, color, 0)], cx, cy, 0.9)
    return f'<g clip-path="{win_clip(card, d)}" style="mix-blend-mode:screen"><rect width="{W}" height="{H}" fill="{g}"/></g>'


def gold_rim(card, d, metal=("#FFF4C2", "#E8B53C", "#8A5A12"), w=5, name="rim"):
    hi, mid, lo = metal
    g = card.grad(name + "-g", [(0, hi), (0.3, mid), (0.5, lo), (0.7, mid), (1, hi)], 0, 0, 1, 1)
    return (
        f'<g filter="{bevel(card, name + "-bv", 1.0, 2.4, sd=4, dy=3, sop=0.7)}"><path d="{d}" fill="none" stroke="{g}" stroke-width="{w}"/></g>'
        f'<path d="{d}" fill="none" stroke="{hi}" stroke-width="0.8" opacity="0.7" transform="translate(0 0)"/>'
    )


# ---------------------------------------------------------------- inscription

from base import plate_layer  # noqa: E402  la couche « plate » et ses emplacements de texte


@plate_layer
def inscription(card, kicker, title, message=None, y=752, style="ebene", metal=("#FFF4C2", "#E8B53C", "#8A5A12"),
                panel=("#2A140A", "#0E0503"), ink="#FFF4DC", accent=None, title_size=40, w=424, date=DATE, msg_color=None,
                title_font=CINZEL, extra=""):
    """L'inscription du moment : sur-titre, titre en métal, message manuscrit de l'auteur, date."""
    hi, mid, lo = metal
    accent = accent or mid
    h = 134 if message else 110
    x0, x1 = 270 - w / 2, 270 + w / 2
    pg = card.grad("ins-pan", [(0, panel[0]), (1, panel[1])])
    out = []
    shadow = card.shadow("ins-sh", 0, 8, 10, "#000000", 0.6)
    frame_g = card.grad("ins-frame", [(0, hi), (0.35, mid), (0.5, lo), (0.65, mid), (1, hi)], 0, 0, 1, 1)
    bv = bevel(card, "ins-bv", 0.8, 2.0, shadow=False)
    if style == "soleil":
        bump = 30
        d = (
            f"M{f(x0 + 16)} {f(y)} L{f(270 - bump - 14)} {f(y)} C{f(270 - bump)} {f(y)} {f(270 - bump)} {f(y - bump * 0.9)} {f(270)} {f(y - bump * 0.95)} "
            f"C{f(270 + bump)} {f(y - bump * 0.9)} {f(270 + bump)} {f(y)} {f(270 + bump + 14)} {f(y)} L{f(x1 - 16)} {f(y)} Q{f(x1)} {f(y)} {f(x1)} {f(y + 16)} "
            f"L{f(x1)} {f(y + h - 16)} Q{f(x1)} {f(y + h)} {f(x1 - 16)} {f(y + h)} L{f(x0 + 16)} {f(y + h)} Q{f(x0)} {f(y + h)} {f(x0)} {f(y + h - 16)} "
            f"L{f(x0)} {f(y + 16)} Q{f(x0)} {f(y)} {f(x0 + 16)} {f(y)} Z"
        )
        out.append(f'<path d="{d}" fill="{pg}" opacity="0.92" filter="{shadow}"/>')
        out.append(f'<g filter="{bv}"><path d="{d}" fill="none" stroke="{frame_g}" stroke-width="3"/></g>')
        out.append(f'<path d="{rrect(x0 + 8, y + 8, x1 - 8, y + h - 8, 10)}" fill="none" stroke="{mid}" stroke-width="0.8" opacity="0.6"/>')
        for i in range(9):
            a = -80 + i * 20
            xa, ya = pt(270, y - 2, 9, a)
            xb, yb = pt(270, y - 2, 20 if i % 2 == 0 else 15, a)
            out.append(f'<line x1="{f(xa)}" y1="{f(ya)}" x2="{f(xb)}" y2="{f(yb)}" stroke="{hi}" stroke-width="1.6" stroke-linecap="round"/>')
        out.append(f'<circle cx="270" cy="{f(y - 2)}" r="6.5" fill="{frame_g}"/>')
    else:
        r = 18
        d = rrect(x0, y, x1, y + h, r)
        out.append(f'<path d="{d}" fill="{pg}" opacity="{0.9 if style != "nuit" else 0.8}" filter="{shadow}"/>')
        if style == "cosmos":
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
            out.append(f'<path d="{rrect(x0 + 8, y + 8, x1 - 8, y + h - 8, 11)}" fill="none" stroke="{mid}" stroke-width="0.8" opacity="0.65"/>')
            for sx in (x0, x1):
                out.append(f'<g filter="{bv}"><path d="M{f(sx)} {f(y + h / 2 - 11)} L{f(sx + 9)} {f(y + h / 2)} L{f(sx)} {f(y + h / 2 + 11)} L{f(sx - 9)} {f(y + h / 2)} Z" fill="{frame_g}"/></g>')
        if style == "perles":
            out.append(bead_line(x0 + 26, y - 1, x1 - 26, y - 1, 3.4, block=4))
            out.append(bead_line(x0 + 26, y + h + 1, x1 - 26, y + h + 1, 3.4, block=4))
    out.append(extra)
    tg = card.grad("ins-title", [(0, hi), (0.55, hi), (1, mid)], 0, 0, 0, 1)
    tsh = card.shadow("ins-tsh", 0, 2, 2, "#000000", 0.75)
    out.append(f'<text x="270" y="{f(y + 29)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="12" letter-spacing="{3.0 if len(kicker) > 26 else 4.2}" fill="{accent}">{esc(kicker.upper())}</text>')
    out.append(f'<text x="270" y="{f(y + 71)}" text-anchor="middle" font-family="{title_font}" font-weight="700" font-size="{title_size}" fill="{tg}" filter="{tsh}">{esc(title)}</text>')
    if message:
        out.append(f'<text x="270" y="{f(y + 104)}" text-anchor="middle" font-family="{HAND}" font-weight="700" font-size="28" fill="{msg_color or ink}">{esc(message)}</text>')
        out.append(f'<text x="270" y="{f(y + 123)}" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="11.5" letter-spacing="1.2" fill="{accent}" opacity="0.92">{esc(date)}</text>')
    else:
        out.append(f'<text x="270" y="{f(y + 95)}" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="12.5" letter-spacing="1.2" fill="{accent}" opacity="0.92">{esc(date)}</text>')
    card.add("".join(out))
    return y + h


# ---------------------------------------------------------------- cadres

def outer_frame(card, metal=("#FFF4C2", "#E8B53C", "#8A5A12"), m=12, w=4, r=22, inner=True, name="of"):
    hi, mid, lo = metal
    g = card.grad(name + "-g", [(0, hi), (0.25, mid), (0.5, lo), (0.75, mid), (1, hi)], 0, 0, 1, 1)
    out = [f'<g filter="{bevel(card, name + "-bv", 1.0, 2.6, sd=3, dy=2, sop=0.6)}"><rect x="{m}" y="{m}" width="{W - 2 * m}" height="{H - 2 * m}" rx="{r}" fill="none" stroke="{g}" stroke-width="{w}"/></g>']
    if inner:
        out.append(f'<rect x="{m + 7}" y="{m + 7}" width="{W - 2 * m - 14}" height="{H - 2 * m - 14}" rx="{r - 5}" fill="none" stroke="{mid}" stroke-width="0.9" opacity="0.7"/>')
    return "".join(out)


def corner_jewel(card, x, y, s, symbol, metal=("#FFF4C2", "#E8B53C", "#8A5A12"), name="cj", bg="#1A0A04"):
    """Médaillon d'angle - à la manière des poids à peser l'or akan (abrammuo)."""
    hi, mid, lo = metal
    g = card.grad(name + "-g", [(0, hi), (0.4, mid), (0.55, lo), (1, hi)], 0, 0, 1, 1)
    bv = bevel(card, name + "-bv", 1.0, 2.4, sd=3, dy=2, sop=0.65)
    return (
        f'<g filter="{bv}"><circle cx="{f(x)}" cy="{f(y)}" r="{f(26 * s)}" fill="{g}"/></g>'
        f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(20 * s)}" fill="{bg}"/>'
        f'<g filter="{bv}">{symbol}</g>'
    )


def crest_halo(card, cx, cy, r, color, op=0.6, name="chalo"):
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{card.rgrad(name, [(0, color, op), (0.5, color, op * 0.35), (1, color, 0)])}"/>'


def numero_badge(card, cx, cy, text="Nº 42 / 100", name="nb"):
    pr = card.prism(name + "-p", 0, 0, 1, 0)
    return (
        f'<rect x="{f(cx - 62)}" y="{f(cy - 13)}" width="124" height="26" rx="13" fill="#07060F" opacity="0.88"/>'
        f'<rect x="{f(cx - 62)}" y="{f(cy - 13)}" width="124" height="26" rx="13" fill="none" stroke="{pr}" stroke-width="1.6"/>'
        f'<text x="{f(cx)}" y="{f(cy + 5)}" text-anchor="middle" font-family="{CINZEL}" font-weight="700" font-size="14" letter-spacing="1.5" fill="#FFFFFF">{esc(text)}</text>'
    )


def ground(x0, x1, y, amp, color, seed=1, step=18):
    rnd = random.Random(seed)
    pts = []
    x = x0
    while x <= x1 + step:
        pts.append(f"{f(x)} {f(y - amp * (0.5 + 0.5 * math.sin(x / 70 + seed)) - rnd.uniform(0, amp * 0.3))}")
        x += step
    return f'<path d="M{f(x0)} {H + 10} L{" L".join(pts)} L{f(x1 + step)} {H + 10} Z" fill="{color}"/>'


def horizon_glow(card, d, y0, y1, color="#FFB04A", op=0.9, name="hglow"):
    """Le couchant qui entre par le bas de la photo : il détache les silhouettes posées devant."""
    g = card.grad(name, [(0, color + "00"), (0.55, color + "66"), (1, color)], 0, 0, 0, 1)
    return f'<g clip-path="{win_clip(card, d)}" opacity="{op}"><rect x="0" y="{f(y0)}" width="{W}" height="{f(y1 - y0)}" fill="{g}"/></g>'


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


def hollow(seed=3, x0=72, x1=468, spring=440, apex=262, y1=742, jit=7):
    """L'ouverture d'un tronc creux : une arche organique."""
    rnd = random.Random(seed)
    cx, rx, ry = (x0 + x1) / 2, (x1 - x0) / 2, spring - apex
    pts = []
    for i in range(7):
        pts.append((x0 + rnd.uniform(-jit, jit), y1 - 20 - i * (y1 - 20 - spring) / 6))
    for i in range(1, 12):
        a = math.radians(180 - i * 15)
        r = 1 + rnd.uniform(-jit, jit) / rx
        pts.append((cx + rx * r * math.cos(a), spring - ry * r * math.sin(a)))
    for i in range(7):
        pts.append((x1 + rnd.uniform(-jit, jit), spring + i * (y1 - 20 - spring) / 6))
    pts.append((x1 - 30, y1 + rnd.uniform(-3, 3)))
    pts.append((cx, y1 + 4))
    pts.append((x0 + 30, y1 + rnd.uniform(-3, 3)))
    return smooth_closed(pts)


def bark_filter(card, name="bark", freq="0.055 0.006", seed=9, scale=5, light="#FFF2DC"):
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" filterUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="4" seed="{seed}" result="n"/>'
        f'<feDiffuseLighting in="n" surfaceScale="{scale}" lighting-color="{light}" diffuseConstant="1.15" result="l"><feDistantLight azimuth="200" elevation="38"/></feDiffuseLighting>'
        f'<feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1="1.3" k2="0" k3="0" k4="0" result="t"/>'
        f'<feComposite in="t" in2="SourceAlpha" operator="in"/></filter>',
    )
    return f"url(#{card.id(name)})"
