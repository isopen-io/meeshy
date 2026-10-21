"""Abysses - l'Afrique des rivages : porte sculptée swahilie (Lamu, Zanzibar), boutre, baobab,
maisons sur pilotis de Ganvié, pirogue, cauris. Créations originales inspirées de ces architectures."""

import math
import random

from base import W, H, f, pt
from kit import poly, smooth, lerp, bevel, metal_grad, blur, glow, GOLD


# ---------------------------------------------------------------- cauri

def cowrie(card, cx, cy, s=1.0, rot=0, tint=("#FFFDF6", "#F1E2C4", "#B99A6A")):
    """Cauri vu du côté de l'ouverture : une perle de porcelaine fendue d'une bouche dentée."""
    a, b, c = tint
    g = card.rgrad("cowrie", [(0, a, 1), (0.55, b, 1), (1, c, 1)], 0.42, 0.38, 0.62)
    teeth = "".join(
        f'<line x1="{f(-2.2)}" y1="{f(y)}" x2="{f(2.2)}" y2="{f(y)}" stroke="#8C6A3E" stroke-width="0.9"/>' for y in (-7, -4.2, -1.4, 1.4, 4.2, 7)
    )
    body = (
        f'<ellipse cx="0" cy="0" rx="7.4" ry="11" fill="{g}"/>'
        f'<path d="M0 -10 C2.4 -5 -2.4 5 0 10" fill="none" stroke="#6B4A22" stroke-width="2.2" stroke-linecap="round"/>{teeth}'
        f'<ellipse cx="-3" cy="-5" rx="1.6" ry="3.2" fill="#FFFFFF" opacity="0.85"/>'
    )
    return f'<g transform="translate({f(cx)} {f(cy)}) rotate({f(rot)}) scale({f(s)})">{body}</g>'


# ---------------------------------------------------------------- porte swahilie

def chain_band(x, y0, y1, w, col, lo, link=16):
    """La chaîne sculptée des portes swahilies : des maillons ovales imbriqués."""
    out = []
    y = y0 + link * 0.6
    i = 0
    while y < y1 - link * 0.5:
        if i % 2 == 0:
            out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(w * 0.36)}" ry="{f(link * 0.62)}" fill="none" stroke="{col}" stroke-width="{f(w * 0.14)}"/>')
        else:
            out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(w * 0.1)}" ry="{f(link * 0.62)}" fill="{lo}" stroke="{col}" stroke-width="{f(w * 0.12)}"/>')
        y += link * 0.95
        i += 1
    return "".join(out)


def rosette(cx, cy, r, col, lo, petals=8):
    out = []
    for i in range(petals):
        a = 360 * i / petals
        x1, y1 = pt(cx, cy, r, a)
        c1 = pt(cx, cy, r * 0.75, a - 22)
        c2 = pt(cx, cy, r * 0.75, a + 22)
        out.append(f'<path d="M{f(cx)} {f(cy)} Q{f(c1[0])} {f(c1[1])} {f(x1)} {f(y1)} Q{f(c2[0])} {f(c2[1])} {f(cx)} {f(cy)} Z" fill="{col}" stroke="{lo}" stroke-width="0.6"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.24)}" fill="{lo}"/><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.14)}" fill="{col}"/>')
    return "".join(out)


def stud(card, cx, cy, r=6):
    """Clou de laiton conique des portes de Zanzibar."""
    g = card.rgrad("stud", [(0, "#FFFBE0", 1), (0.35, "#F2C65A", 1), (0.8, "#9A6414", 1), (1, "#5A3608", 1)], 0.38, 0.32, 0.7)
    return (f'<circle cx="{f(cx + 1)}" cy="{f(cy + 2)}" r="{f(r)}" fill="#000000" opacity="0.35"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/>'
            f'<circle cx="{f(cx - r * 0.3)}" cy="{f(cy - r * 0.35)}" r="{f(r * 0.22)}" fill="#FFFFFF" opacity="0.9"/>')


def lotus(cx, cy, s, col, lo):
    out = []
    for a, L in ((-58, 20), (-30, 26), (0, 30), (30, 26), (58, 20)):
        x1, y1 = pt(cx, cy, L * s, a)
        c1 = pt(cx, cy, L * s * 0.6, a - 24)
        c2 = pt(cx, cy, L * s * 0.6, a + 24)
        out.append(f'<path d="M{f(cx)} {f(cy)} Q{f(c1[0])} {f(c1[1])} {f(x1)} {f(y1)} Q{f(c2[0])} {f(c2[1])} {f(cx)} {f(cy)} Z" fill="{col}" stroke="{lo}" stroke-width="0.8"/>')
    out.append(f'<path d="M{f(cx - 16 * s)} {f(cy + 3 * s)} Q{f(cx)} {f(cy + 12 * s)} {f(cx + 16 * s)} {f(cy + 3 * s)}" fill="none" stroke="{col}" stroke-width="{f(3 * s)}" stroke-linecap="round"/>')
    return "".join(out)


# ---------------------------------------------------------------- boutre (dhow)

def dhow(cx, cy, s=1.0, hull="#1B120C", sail="#2A1E14", op=1.0, flip=False, rim=None):
    """Boutre à voile latine : coque à l'étrave inclinée, poupe haute, grande vergue oblique."""
    hullp = "M-62 0 L-54 -10 L60 -10 L74 -24 L70 -8 Q52 10 -40 10 Z"
    mast = '<line x1="6" y1="-10" x2="2" y2="-82" stroke="{c}" stroke-width="2.2"/>'.replace("{c}", hull)
    yard = f'<line x1="-58" y1="-30" x2="62" y2="-104" stroke="{hull}" stroke-width="2.4" stroke-linecap="round"/>'
    sailp = "M-54 -32 Q-6 -54 58 -101 Q30 -60 10 -14 L-40 -14 Z"
    rimm = f'<path d="{sailp}" fill="none" stroke="{rim}" stroke-width="1.2" opacity="0.8"/><path d="{hullp}" fill="none" stroke="{rim}" stroke-width="1" opacity="0.7"/>' if rim else ""
    sc = f"scale({f(-s)} {f(s)})" if flip else f"scale({f(s)})"
    return f'<g transform="translate({f(cx)} {f(cy)}) {sc}" opacity="{f(op)}"><path d="{sailp}" fill="{sail}"/>{mast}{yard}<path d="{hullp}" fill="{hull}"/>{rimm}</g>'


def dhow_below(cx, cy, s=1.0, col="#03131F", op=0.75):
    """La coque d'un boutre vue d'en dessous, à travers la surface."""
    return (f'<g transform="translate({f(cx)} {f(cy)}) scale({f(s)})" opacity="{f(op)}">'
            f'<path d="M-70 0 Q-60 14 -20 16 L44 14 Q66 10 78 -2 Q40 -6 -70 0 Z" fill="{col}"/>'
            f'<path d="M-62 2 Q0 9 70 0" fill="none" stroke="#000000" stroke-width="1" opacity="0.5"/></g>')


# ---------------------------------------------------------------- baobab

def baobab(cx, base_y, s=1.0, col="#1A0E08", seed=4):
    """Baobab : tronc en bouteille, couronne de branches courtes et tordues."""
    rnd = random.Random(seed)
    tw, th = 22 * s, 64 * s
    trunk = (f"M{f(cx - tw)} {f(base_y)} C{f(cx - tw * 1.25)} {f(base_y - th * 0.5)} {f(cx - tw * 0.7)} {f(base_y - th * 0.9)} {f(cx - tw * 0.55)} {f(base_y - th)} "
             f"L{f(cx + tw * 0.55)} {f(base_y - th)} C{f(cx + tw * 0.7)} {f(base_y - th * 0.9)} {f(cx + tw * 1.25)} {f(base_y - th * 0.5)} {f(cx + tw)} {f(base_y)} Z")
    out = [f'<path d="{trunk}" fill="{col}"/>']

    def branch(x0, y0, a, L, w, d):
        x1, y1 = pt(x0, y0, L, a)
        out.append(f'<path d="M{f(x0)} {f(y0)} Q{f(pt(x0, y0, L * 0.5, a + rnd.uniform(-20, 20))[0])} {f(pt(x0, y0, L * 0.5, a + rnd.uniform(-20, 20))[1])} {f(x1)} {f(y1)}" fill="none" stroke="{col}" stroke-width="{f(w)}" stroke-linecap="round"/>')
        if d > 0:
            for da in (-28, 26):
                branch(x1, y1, a + da + rnd.uniform(-10, 10), L * 0.62, w * 0.6, d - 1)

    for a in (-62, -34, -8, 16, 40, 66):
        x0 = cx + a / 66 * tw * 0.5
        branch(x0, base_y - th + 2 * s, a, 30 * s * rnd.uniform(0.8, 1.15), 7 * s, 2)
    for _ in range(40):
        a = rnd.uniform(-75, 75)
        lx, ly = pt(cx, base_y - th - 4 * s, rnd.uniform(34, 62) * s, a)
        out.append(f'<circle cx="{f(lx)}" cy="{f(ly)}" r="{f(rnd.uniform(1.2, 2.6) * s)}" fill="{col}"/>')
    return "".join(out)


# ---------------------------------------------------------------- Ganvié : maisons sur pilotis

def stilt_house(card, name, x, water_y, w=96, h=46, roof=40, stilt=34, wall="#2B1A12", thatch="#3A2414", rim="#FFB066", seed=1, under=110):
    """Maison de Ganvié : murs de bambou, toit de paille en croupe, pilotis plongés dans la lagune."""
    rnd = random.Random(seed)
    fl = water_y - stilt
    out = []
    for i in range(4):
        sx = x + 8 + (w - 16) * i / 3
        out.append(f'<line x1="{f(sx)}" y1="{f(fl)}" x2="{f(sx + rnd.uniform(-1.5, 1.5))}" y2="{f(water_y + 2)}" stroke="{wall}" stroke-width="5"/>')
        out.append(f'<line x1="{f(sx - 1.5)}" y1="{f(fl)}" x2="{f(sx - 1.5)}" y2="{f(water_y)}" stroke="{rim}" stroke-width="0.9" opacity="0.6"/>')
    out.append(f'<rect x="{f(x - 6)}" y="{f(fl - 4)}" width="{f(w + 12)}" height="6" fill="{wall}"/>')
    body = f'<rect x="{f(x)}" y="{f(fl - h)}" width="{f(w)}" height="{f(h)}" fill="{wall}"/>'
    slats = "".join(f'<line x1="{f(x + 4 + k * 6)}" y1="{f(fl - h + 2)}" x2="{f(x + 4 + k * 6)}" y2="{f(fl - 4)}" stroke="#000000" stroke-width="0.8" opacity="0.35"/>' for k in range(int(w / 6)))
    door = f'<rect x="{f(x + w * 0.4)}" y="{f(fl - h * 0.72)}" width="{f(w * 0.2)}" height="{f(h * 0.68)}" fill="#120A06"/>'
    win = f'<rect x="{f(x + w * 0.12)}" y="{f(fl - h * 0.66)}" width="{f(w * 0.16)}" height="{f(h * 0.26)}" fill="{rim}" opacity="0.75"/>'
    rp = f"M{f(x - 14)} {f(fl - h + 4)} L{f(x + w * 0.22)} {f(fl - h - roof)} L{f(x + w * 0.78)} {f(fl - h - roof)} L{f(x + w + 14)} {f(fl - h + 4)} Z"
    straw = "".join(
        f'<line x1="{f(lerp(x - 14, x + w + 14, k / 22))}" y1="{f(fl - h + 4)}" x2="{f(lerp(x + w * 0.22, x + w * 0.78, k / 22))}" y2="{f(fl - h - roof)}" stroke="#000000" stroke-width="0.7" opacity="0.3"/>'
        for k in range(23)
    )
    out.append(body + slats + door + win)
    out.append(f'<path d="{rp}" fill="{thatch}"/>{straw}')
    out.append(f'<path d="M{f(x - 14)} {f(fl - h + 4)} L{f(x + w * 0.22)} {f(fl - h - roof)} L{f(x + w * 0.78)} {f(fl - h - roof)}" fill="none" stroke="{rim}" stroke-width="1.6" opacity="0.85"/>')
    above = "".join(out)
    below = []
    gid = card.id(name + "-stg")
    card.def_once(name + "-stg", f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="0" y1="{f(water_y)}" x2="0" y2="{f(water_y + under)}">'
                                 f'<stop offset="0" stop-color="#1A1208" stop-opacity="0.95"/><stop offset="0.5" stop-color="#0E2A30" stop-opacity="0.6"/>'
                                 f'<stop offset="1" stop-color="#0E2A30" stop-opacity="0"/></linearGradient>')
    for i in range(4):
        sx = x + 8 + (w - 16) * i / 3
        pts = [(sx + 4 * math.sin(k * 0.8 + i * 1.7), water_y + k * under / 10) for k in range(11)]
        below.append(f'<path d="{smooth(pts, closed=False, n=4)}" fill="none" stroke="url(#{gid})" stroke-width="5"/>')
        below.append(f'<path d="{smooth([(px + 1.5, py) for px, py in pts], closed=False, n=4)}" fill="none" stroke="#FFC48A" stroke-width="0.8" opacity="0.35"/>')
    return above, "".join(below)


def pirogue(cx, cy, s=1.0, col="#1A0E08", band=("#E84A3A", "#F2C14E", "#2E9E8E"), pole=True, rim="#FFB066"):
    """Pirogue monoxyle aux bandes peintes, une perche plantée."""
    hull = "M-70 -4 Q-74 -12 -78 -16 Q-40 -2 0 -2 Q40 -2 78 -16 Q74 -12 70 -4 Q0 12 -70 -4 Z"
    bands = "".join(f'<path d="M-66 {f(-6 + k * 2.6)} Q0 {f(4 + k * 2.6)} 66 {f(-6 + k * 2.6)}" fill="none" stroke="{c}" stroke-width="1.8" opacity="0.9"/>' for k, c in enumerate(band))
    p = f'<line x1="30" y1="-2" x2="58" y2="-92" stroke="{col}" stroke-width="2"/>' if pole else ""
    return f'<g transform="translate({f(cx)} {f(cy)}) scale({f(s)})">{p}<path d="{hull}" fill="{col}"/>{bands}<path d="M-78 -16 Q-40 -2 0 -2 Q40 -2 78 -16" fill="none" stroke="{rim}" stroke-width="1.2" opacity="0.8"/></g>'


# ---------------------------------------------------------------- frise d'appliqués (inspirée des tentures fon d'Abomey)

def applique_band(card, x0, y0, x1, h=40, seed=3):
    """Une bande de tissu noir où sont cousues des formes de couleur vive : poissons, soleils, pirogues, étoiles, croissants."""
    rnd = random.Random(seed)
    cols = ("#E8402F", "#F2C230", "#2E9E5A", "#2F6FD0", "#F4EFE6", "#E86A2F")
    out = [f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(x1 - x0)}" height="{f(h)}" fill="#0E0B0A"/>',
           f'<rect x="{f(x0)}" y="{f(y0 + 2)}" width="{f(x1 - x0)}" height="{f(h - 4)}" fill="none" stroke="#F2C230" stroke-width="1" stroke-dasharray="3 2" opacity="0.8"/>']
    cy = y0 + h / 2
    x = x0 + 22
    k = 0
    while x < x1 - 20:
        col = cols[k % len(cols)]
        kind = k % 5
        if kind == 0:
            out.append(f'<path d="M{f(x - 14)} {f(cy)} Q{f(x - 2)} {f(cy - 10)} {f(x + 10)} {f(cy)} Q{f(x - 2)} {f(cy + 10)} {f(x - 14)} {f(cy)} Z M{f(x + 10)} {f(cy)} L{f(x + 17)} {f(cy - 7)} L{f(x + 17)} {f(cy + 7)} Z" fill="{col}"/>'
                       f'<circle cx="{f(x - 7)}" cy="{f(cy - 2)}" r="1.6" fill="#0E0B0A"/>')
        elif kind == 1:
            out.append(f'<circle cx="{f(x)}" cy="{f(cy)}" r="8" fill="{col}"/>' + "".join(
                f'<line x1="{f(pt(x, cy, 11, a)[0])}" y1="{f(pt(x, cy, 11, a)[1])}" x2="{f(pt(x, cy, 15, a)[0])}" y2="{f(pt(x, cy, 15, a)[1])}" stroke="{col}" stroke-width="2.2" stroke-linecap="round"/>' for a in range(0, 360, 45)))
        elif kind == 2:
            out.append(f'<path d="M{f(x - 17)} {f(cy - 2)} Q{f(x)} {f(cy + 14)} {f(x + 17)} {f(cy - 2)} Q{f(x)} {f(cy + 6)} {f(x - 17)} {f(cy - 2)} Z" fill="{col}"/>'
                       f'<line x1="{f(x + 4)}" y1="{f(cy + 3)}" x2="{f(x + 10)}" y2="{f(cy - 14)}" stroke="{col}" stroke-width="1.8"/>')
        elif kind == 3:
            out.append(f'<path d="{poly([pt(x, cy, 12 if i % 2 == 0 else 5, i * 36) for i in range(10)])}" fill="{col}"/>')
        else:
            out.append(f'<path d="M{f(x + 4)} {f(cy - 12)} A12 12 0 1 0 {f(x + 4)} {f(cy + 12)} A15 15 0 0 1 {f(x + 4)} {f(cy - 12)} Z" fill="{col}"/>')
        x += 44
        k += 1
    return "".join(out)


# ---------------------------------------------------------------- tenture d'appliqués d'Abomey (palais royaux du Danhomè)

def _stitch(d, col="#F4EFE6"):
    return f'<path d="{d}" fill="none" stroke="{col}" stroke-width="0.8" stroke-dasharray="2 1.6" opacity="0.85"/>'


def ap_shark(x, y, s, col):
    """Le requin, emblème du roi Béhanzin."""
    body = "M-30 2 C-20 -7 -2 -10 14 -7 C22 -5 28 -2 32 1 C27 5 20 7 10 7 L3 7 L-1 15 L-4 7 C-12 7 -22 6 -30 2 Z"
    tail = "M-28 2 L-40 -12 L-35 2 L-40 14 Z"
    dors = "M-4 -9 L3 -24 L8 -8 Z"
    out = (f'<path d="{tail}" fill="{col}"/><path d="{dors}" fill="{col}"/><path d="{body}" fill="{col}"/>'
           f'<path d="M-24 3 C-8 6 10 6 28 2" fill="none" stroke="#F4EFE6" stroke-width="2.2" opacity="0.9"/>'
           f'<circle cx="20" cy="-2" r="1.8" fill="#0E0B0A"/>' + "".join(f'<path d="M{8 + k * 3} -3 l-1 5" stroke="#0E0B0A" stroke-width="0.8"/>' for k in range(3))
           + _stitch(body) + _stitch(tail) + _stitch(dors))
    return f'<g transform="translate({f(x)} {f(y)}) scale({f(s)})">{out}</g>'


def ap_nasse(x, y, s, col_trap, col_fish):
    """Le poisson échappé de la nasse, emblème du roi Houégbadja."""
    trap = "M-34 -12 L-6 -5 L-6 5 L-34 12 Z"
    hatch = "".join(f'<line x1="{f(-34 + k * 4)}" y1="{f(-12 + k * 1)}" x2="{f(-34 + k * 4)}" y2="{f(12 - k * 1)}" stroke="#0E0B0A" stroke-width="1"/>' for k in range(1, 7))
    hatch += '<line x1="-34" y1="0" x2="-6" y2="0" stroke="#0E0B0A" stroke-width="1"/>'
    fish = "M2 0 Q14 -11 28 -2 L36 -9 L34 0 L36 9 L28 2 Q14 11 2 0 Z"
    out = (f'<path d="{trap}" fill="{col_trap}"/>{hatch}<ellipse cx="-34" cy="0" rx="3" ry="12" fill="{col_trap}" stroke="#0E0B0A" stroke-width="1"/>'
           f'<path d="{fish}" fill="{col_fish}"/><circle cx="9" cy="-2" r="1.7" fill="#0E0B0A"/>'
           f'<path d="M16 -6 Q19 0 16 6" fill="none" stroke="#0E0B0A" stroke-width="1"/>' + _stitch(trap) + _stitch(fish))
    return f'<g transform="translate({f(x)} {f(y)}) scale({f(s)})">{out}</g>'


def ap_sun(x, y, s, col, col2):
    rays_ = "".join(f'<path d="M{f(pt(0, 0, 11, a - 9)[0])} {f(pt(0, 0, 11, a - 9)[1])} L{f(pt(0, 0, 19, a)[0])} {f(pt(0, 0, 19, a)[1])} L{f(pt(0, 0, 11, a + 9)[0])} {f(pt(0, 0, 11, a + 9)[1])} Z" fill="{col}"/>' for a in range(0, 360, 30))
    out = f'{rays_}<circle cx="0" cy="0" r="10" fill="{col}"/><circle cx="0" cy="0" r="5.5" fill="{col2}"/>' + _stitch("M-10 0 A10 10 0 1 1 10 0 A10 10 0 1 1 -10 0 Z")
    return f'<g transform="translate({f(x)} {f(y)}) scale({f(s)})">{out}</g>'


def ap_pirogue(x, y, s, col, col2):
    hull = "M-30 -2 Q0 14 30 -2 Q0 6 -30 -2 Z"
    out = (f'<line x1="10" y1="2" x2="24" y2="-20" stroke="{col2}" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="25" cy="-22" rx="3" ry="6" fill="{col2}" transform="rotate(32 25 -22)"/>'
           f'<path d="{hull}" fill="{col}"/>' + _stitch(hull) +
           "".join(f'<path d="M{-14 + k * 7} 9 q3 -3 6 0" fill="none" stroke="#2F6FD0" stroke-width="1.6"/>' for k in range(5)))
    return f'<g transform="translate({f(x)} {f(y)}) scale({f(s)})">{out}</g>'


def abomey_tenture(card, x0, y0, x1, h=46):
    """Une tenture d'appliqués inspirée de celles des palais d'Abomey : drap noir, ourlets rouge et or, panneaux cousus
    d'emblèmes (le requin, le poisson échappé de la nasse, le soleil, la pirogue)."""
    out = [f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(x1 - x0)}" height="{f(h)}" fill="#0E0B0A"/>',
           f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(x1 - x0)}" height="4" fill="#C8322A"/>',
           f'<rect x="{f(x0)}" y="{f(y0 + h - 4)}" width="{f(x1 - x0)}" height="4" fill="#C8322A"/>',
           f'<rect x="{f(x0)}" y="{f(y0 + 4)}" width="{f(x1 - x0)}" height="1.6" fill="#F2C230"/>',
           f'<rect x="{f(x0)}" y="{f(y0 + h - 5.6)}" width="{f(x1 - x0)}" height="1.6" fill="#F2C230"/>']
    n = 6
    pw = (x1 - x0) / n
    cy = y0 + h / 2
    figs = [
        lambda x: ap_nasse(x, cy, 0.78, "#F2C230", "#E8402F"),
        lambda x: ap_sun(x, cy, 0.88, "#F2C230", "#E8402F"),
        lambda x: ap_shark(x, cy + 1, 0.82, "#2F6FD0"),
        lambda x: ap_pirogue(x, cy + 2, 0.86, "#E8402F", "#F4EFE6"),
        lambda x: ap_shark(x, cy + 1, 0.82, "#2E9E5A"),
        lambda x: ap_nasse(x, cy, 0.78, "#2E9E5A", "#F2C230"),
    ]
    for i in range(n):
        px = x0 + pw * i
        if i:
            out.append(f'<rect x="{f(px - 1.2)}" y="{f(y0 + 6)}" width="2.4" height="{f(h - 12)}" fill="#F2C230" opacity="0.85"/>')
        out.append(figs[i](px + pw / 2))
    return "".join(out)


# ---------------------------------------------------------------- Ganvié : village lointain, aigrettes

def far_village(x0, x1, water_y, col="#5A2840", seed=3, n=7, op=0.8):
    """Une rangée de maisons sur pilotis au loin, en silhouette."""
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        x = lerp(x0, x1, (i + rnd.uniform(0, 0.5)) / n)
        w = rnd.uniform(14, 24)
        hh = rnd.uniform(7, 11)
        st = rnd.uniform(5, 8)
        fl = water_y - st
        out.append("".join(f'<line x1="{f(x + k * w / 3)}" y1="{f(fl)}" x2="{f(x + k * w / 3)}" y2="{f(water_y)}" stroke="{col}" stroke-width="1"/>' for k in range(4)))
        out.append(f'<rect x="{f(x)}" y="{f(fl - hh)}" width="{f(w)}" height="{f(hh)}" fill="{col}"/>')
        out.append(f'<path d="M{f(x - 3)} {f(fl - hh + 1)} L{f(x + w * 0.25)} {f(fl - hh - 7)} L{f(x + w * 0.75)} {f(fl - hh - 7)} L{f(x + w + 3)} {f(fl - hh + 1)} Z" fill="{col}"/>')
    return f'<g opacity="{op}">{"".join(out)}</g>'


def egret(x, y, s, col="#2A1430", flap=0.0):
    """Une aigrette en vol, ailes en arc."""
    up = -10 - flap * 6
    d = (f"M{f(x - 16 * s)} {f(y + up * s * 0.3)} Q{f(x - 8 * s)} {f(y + up * s)} {f(x)} {f(y)} Q{f(x + 8 * s)} {f(y + up * s)} {f(x + 16 * s)} {f(y + up * s * 0.3)} "
         f"Q{f(x + 8 * s)} {f(y + up * s * 0.6)} {f(x)} {f(y + 2 * s)} Q{f(x - 8 * s)} {f(y + up * s * 0.6)} {f(x - 16 * s)} {f(y + up * s * 0.3)} Z")
    return f'<path d="{d}" fill="{col}"/><path d="M{f(x)} {f(y)} l{f(5 * s)} {f(-1 * s)}" stroke="{col}" stroke-width="{f(1.4 * s)}" stroke-linecap="round"/>'


def woven(card, name, x, y, w, h, base="#5A3A22", line="#2A160C", rim="#FFC48A"):
    """Une paroi de bambou tressé : lattes verticales et liens horizontaux."""
    g = card.grad(name + "-wg", [(0, mix_hex(base, "#FFFFFF", 0.15)), (1, mix_hex(base, "#000000", 0.35))], 0, 0, 1, 0)
    out = [f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="{g}"/>']
    out += [f'<line x1="{f(x + k * 4)}" y1="{f(y)}" x2="{f(x + k * 4)}" y2="{f(y + h)}" stroke="{line}" stroke-width="0.7" opacity="0.5"/>' for k in range(1, int(w / 4))]
    out += [f'<line x1="{f(x)}" y1="{f(y + k * h / 4)}" x2="{f(x + w)}" y2="{f(y + k * h / 4)}" stroke="{rim}" stroke-width="0.8" opacity="0.35"/>' for k in range(1, 4)]
    return "".join(out)


def mix_hex(a, b, t):
    ca = [int(a.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)]
    cb = [int(b.lstrip("#")[i:i + 2], 16) for i in (0, 2, 4)]
    return "#%02X%02X%02X" % tuple(round(lerp(x, y, t)) for x, y in zip(ca, cb))
