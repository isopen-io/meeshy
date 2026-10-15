"""La Réalisation du jour : le carnet de bord. Deux décorations : la page de carnet (papier, tampon, cases cochées)
et le journal d'explorateur (cuir, bandes de bogolan, boussole, sceaux de cire frappés d'Adinkra)."""

import math
import random

from base import (Card, W, H, f, pt, esc, photo, bird, mee_meo, sparkle, SANS, CINZEL, CINZEL_DECO, HAND, FRAUNCES, GARAMOND,
                  sankofa, nsoromma, akoma, adinkrahene, dwennimmen)
from kit import (group, rrect, circle_d, ring_d, deco_mask, clip, bevel, noise, wobble, metal_grad, rim, inner_shadow, grade, halo,
                 lgrad, dust, outer_frame, inscription, ring_text, smooth_closed, smooth_open)
from emblem import catmull

DAY = 283
DATE = "10 octobre 2026"
INK = "#24304E"
RED = "#C2362A"
BRASS = ("#FFF0C8", "#C99A44", "#5E3E10")


def kicker():
    return f"Réalisation du jour · Jour {DAY}"


def rot_rect(x0, y0, x1, y1, deg, cx=None, cy=None):
    """Le contour d'un rectangle tourné de `deg` degrés autour de son centre."""
    cx = (x0 + x1) / 2 if cx is None else cx
    cy = (y0 + y1) / 2 if cy is None else cy
    a = math.radians(deg)

    def r(x, y):
        dx, dy = x - cx, y - cy
        return cx + dx * math.cos(a) - dy * math.sin(a), cy + dx * math.sin(a) + dy * math.cos(a)

    pts = [r(x0, y0), r(x1, y0), r(x1, y1), r(x0, y1)]
    return "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts) + " Z"


def stamp_ink(card, name, seed, op=0.88):
    """Un encrage de tampon : l'encre manque par endroits (bruit), les bords boivent un peu."""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="{seed}" result="n"/>'
        f'<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.6 0 0 0 2.05" result="holes"/>'
        f'<feComposite in="SourceGraphic" in2="holes" operator="in" result="inked"/>'
        f'<feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="{seed + 1}" result="w"/>'
        f'<feDisplacementMap in="inked" in2="w" scale="2.2" xChannelSelector="R" yChannelSelector="G" result="d"/>'
        f'<feComponentTransfer in="d"><feFuncA type="linear" slope="{op}"/></feComponentTransfer></filter>',
    )
    return f"url(#{card.id(name)})"


def rubber_stamp(card, cx, cy, r, rot, name="st"):
    """Le tampon daté du carnet : double cercle, légende circulaire, JOUR et le nombre au centre."""
    out = [
        f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="{RED}" stroke-width="4"/>',
        f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r - 8)}" fill="none" stroke="{RED}" stroke-width="1.6"/>',
        f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.56)}" fill="none" stroke="{RED}" stroke-width="1.6"/>',
        ring_text(card, name + "-t", cx, cy, r - 19, "CARNET DE BORD", size=12, fill=RED, font=SANS, weight=800, spacing=3),
        ring_text(card, name + "-b", cx, cy, r - 11, DATE.upper(), size=10.5, fill=RED, font=SANS, weight=800, spacing=2.4, bottom=True),
        f'<text x="{f(cx)}" y="{f(cy - 11)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="10" letter-spacing="3" fill="{RED}">JOUR</text>',
        f'<text x="{f(cx)}" y="{f(cy + 20)}" text-anchor="middle" font-family="{CINZEL}" font-weight="700" font-size="34" fill="{RED}">{DAY}</text>',
    ]
    for sx in (-1, 1):
        x, y = cx + sx * (r - 15), cy + 3
        out.append(f'<path d="M{f(x)} {f(y - 4)} L{f(x + 1.4)} {f(y - 1.2)} L{f(x + 4)} {f(y)} L{f(x + 1.4)} {f(y + 1.2)} L{f(x)} {f(y + 4)} L{f(x - 1.4)} {f(y + 1.2)} L{f(x - 4)} {f(y)} L{f(x - 1.4)} {f(y - 1.2)} Z" fill="{RED}"/>')
    return f'<g transform="rotate({f(rot)} {f(cx)} {f(cy)})" filter="{stamp_ink(card, name + "-ink", 7)}">{"".join(out)}</g>'


def check_box(x, y, s, ink, tick, rnd):
    """Une case tracée à la main, et sa coche."""
    j = lambda: rnd.uniform(-1.2, 1.2)
    box = (f'<path d="M{f(x + j())} {f(y + j())} L{f(x + s + j())} {f(y + j())} L{f(x + s + j())} {f(y + s + j())} L{f(x + j())} {f(y + s + j())} Z" '
           f'fill="none" stroke="{ink}" stroke-width="1.6" stroke-linejoin="round"/>')
    tk = (f'<path d="M{f(x + s * 0.12)} {f(y + s * 0.5)} Q{f(x + s * 0.3)} {f(y + s * 0.62)} {f(x + s * 0.42)} {f(y + s * 0.95)} '
          f'Q{f(x + s * 0.7)} {f(y + s * 0.2)} {f(x + s * 1.25)} {f(y - s * 0.35)}" fill="none" stroke="{tick}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>')
    return box + tk


def washi(card, name, cx, cy, w, h, rot, color, pattern="stripes", op=0.78):
    """Un ruban de masquage : bande translucide aux bouts déchirés, motif imprimé."""
    rnd = random.Random(len(name) * 7 + int(cx))
    x0, x1 = cx - w / 2, cx + w / 2
    y0, y1 = cy - h / 2, cy + h / 2
    left = [(x0 + rnd.uniform(-2.5, 2.5), y0 + (y1 - y0) * i / 6) for i in range(7)]
    right = [(x1 + rnd.uniform(-2.5, 2.5), y1 - (y1 - y0) * i / 6) for i in range(7)]
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in left + right) + " Z"
    pat = []
    if pattern == "stripes":
        for k in range(-10, 30):
            xx = x0 + k * 9
            pat.append(f'<path d="M{f(xx)} {f(y1)} L{f(xx + h)} {f(y0)}" stroke="#FFFFFF" stroke-width="3.2" opacity="0.55"/>')
    else:
        for k in range(int(w / 10) + 2):
            for m in range(int(h / 10) + 1):
                pat.append(f'<circle cx="{f(x0 + 5 + k * 10 + (m % 2) * 5)}" cy="{f(y0 + 5 + m * 10)}" r="1.8" fill="#FFFFFF" opacity="0.7"/>')
    return (
        f'<g transform="rotate({f(rot)} {f(cx)} {f(cy)})" opacity="{op}" filter="{card.shadow(name + "-sh", 0, 1.5, 1.5, "#000000", 0.25)}">'
        f'<path d="{d}" fill="{color}"/><g clip-path="{clip(card, d, name + "-c")}">{"".join(pat)}</g></g>'
    )


def doodle_star(x, y, s, ink, w=1.6):
    pts = []
    for i in range(10):
        rr = s if i % 2 == 0 else s * 0.45
        pts.append(pt(x, y, rr, i * 36))
    return f'<path d="M{" L".join(f"{f(px)} {f(py)}" for px, py in pts)} Z" fill="none" stroke="{ink}" stroke-width="{w}" stroke-linejoin="round"/>'


from base import plate_layer  # noqa: E402  la couche « plate » et ses emplacements de texte


@plate_layer
def paper_label(card, kicker_text, title, message=None, y=752):
    """L'étiquette de kraft collée au bas de la page : sur-titre tamponné, titre à l'encre, mot manuscrit, date."""
    h = 134 if message else 112
    x0, x1 = 64, 476
    rnd = random.Random(5)
    top = [(x0 + (x1 - x0) * i / 24, y + rnd.uniform(-1.6, 1.6)) for i in range(25)]
    bot = [(x1 - (x1 - x0) * i / 24, y + h + rnd.uniform(-1.6, 1.6)) for i in range(25)]
    d = "M" + " L".join(f"{f(px)} {f(py)}" for px, py in top + bot) + " Z"
    kraft = card.grad("kraft", [(0, "#E2C79A"), (1, "#C9A673")], 0, 0, 0, 1)
    out = [
        f'<g transform="rotate(-1.2 270 {f(y + h / 2)})">',
        f'<path d="{d}" fill="{kraft}" filter="{card.shadow("lab-sh", 0, 6, 8, "#000000", 0.45)}"/>',
        f'<path d="{d}" fill="#6A4A20" opacity="0.5" filter="{noise(card, "labN", "0.8", 2, 9, 1.2, -0.62)}"/>',
        f'<text x="270" y="{f(y + 29)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="12" letter-spacing="3.6" fill="{RED}">{esc(kicker_text.upper())}</text>',
        f'<text x="270" y="{f(y + 70)}" text-anchor="middle" font-family="{FRAUNCES}" font-weight="700" font-size="38" fill="#2A1A0C">{esc(title)}</text>',
    ]
    if message:
        out.append(f'<text x="270" y="{f(y + 103)}" text-anchor="middle" font-family="{HAND}" font-weight="700" font-size="28" fill="{INK}">{esc(message)}</text>')
        out.append(f'<text x="270" y="{f(y + 123)}" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="11.5" letter-spacing="1.2" fill="#5A3E1A">{DATE}</text>')
    else:
        out.append(f'<text x="270" y="{f(y + 95)}" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="12" letter-spacing="1.2" fill="#5A3E1A">{DATE}</text>')
    out.append("</g>")
    out.append(washi(card, "lt1", 92, y + 4, 70, 22, -28, "#E86A8A", "dots"))
    out.append(washi(card, "lt2", 448, y + h - 2, 70, 22, -24, "#5AB6C8", "stripes"))
    card.add("".join(out))


def carnet():
    c = Card("ja")
    photo(c, top="#3A2C20", bottom="#140E08", rim="#FFD9A8", glow=0.22)
    win = rot_rect(92, 300, 448, 716, -1.8)
    with group(c, f'mask="{deco_mask(c, win)}"'):
        c.add(f'<rect width="{W}" height="{H}" fill="#F3E8D2"/>')
        c.add(f'<rect width="{W}" height="{H}" fill="#9A7A4A" opacity="0.35" filter="{noise(c, "pap", "0.65", 3, 4, 1.4, -0.7)}"/>')
        c.add(f'<rect width="{W}" height="{H}" fill="#B8925A" opacity="0.5" filter="{noise(c, "pap2", "0.006", 3, 6, 1.6, -0.75)}"/>')
        c.add("".join(f'<line x1="0" y1="{y}" x2="{W}" y2="{y}" stroke="#8FB0D8" stroke-width="0.8" opacity="0.6"/>' for y in range(56, 960, 26)))
        c.add(f'<line x1="46" y1="0" x2="46" y2="{H}" stroke="#E07A7A" stroke-width="1.2" opacity="0.7"/>')
        for y in (120, 480, 840):
            c.add(f'<circle cx="22" cy="{y}" r="8" fill="#1A1410" opacity="0.85"/><circle cx="22" cy="{y}" r="8" fill="none" stroke="#C9B48A" stroke-width="1"/>')
        c.add(f'<circle cx="470" cy="902" r="40" fill="none" stroke="#8A5A2A" stroke-width="5" opacity="0.18" filter="{c.blur("cof", 1.5)}"/>')
        c.add(f'<circle cx="470" cy="902" r="40" fill="none" stroke="#8A5A2A" stroke-width="1" opacity="0.3"/>')
        c.add(rubber_stamp(c, 142, 152, 70, -11))
        rnd = random.Random(3)
        lines = [
            ("Missions du jour", None),
            ("Écrire à trois amis", "#2E9E5A"),
            ("Traduire un message", "#2E9E5A"),
            ("Publier une story", "#2E9E5A"),
        ]
        out = []
        x0, y0 = 262, 92
        out.append(f'<text x="{x0}" y="{y0}" font-family="{HAND}" font-weight="700" font-size="27" fill="{INK}">{esc(lines[0][0])}</text>')
        out.append(f'<path d="M{x0} {y0 + 7} Q{x0 + 90} {y0 + 3} {x0 + 186} {y0 + 8}" fill="none" stroke="{RED}" stroke-width="2" stroke-linecap="round"/>')
        for i, (txt, tick) in enumerate(lines[1:]):
            yy = y0 + 38 + i * 34
            out.append(check_box(x0, yy - 15, 16, INK, tick, rnd))
            out.append(f'<text x="{x0 + 26}" y="{yy}" font-family="{HAND}" font-weight="600" font-size="22" fill="{INK}">{esc(txt)}</text>')
        out.append(f'<text x="{x0 + 176}" y="{y0 + 146}" font-family="{HAND}" font-weight="700" font-size="25" fill="{RED}" transform="rotate(-7 {x0 + 190} {y0 + 140})">3 / 3 !</text>')
        out.append(f'<path d="M{x0 + 170} {y0 + 152} q30 6 62 -6" fill="none" stroke="{RED}" stroke-width="1.6" stroke-linecap="round"/>')
        out.append(doodle_star(500, 70, 11, RED))
        out.append(doodle_star(232, 250, 7, INK, 1.3))
        out.append(f'<text x="260" y="270" font-family="{HAND}" font-weight="700" font-size="22" fill="{INK}" transform="rotate(-3 300 266)">nous, ce jour-là</text>')
        out.append(f'<path d="M398 258 C414 260 420 272 418 290 M411 283 L418 292 L424 282" fill="none" stroke="{INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>')
        c.add(f'<g filter="{wobble(c, "hand", "0.05", 1.2, 4, 2)}">{"".join(out)}</g>')
        c.add(f'<path d="M478 540 c-8 -12 -26 -4 -16 10 l16 16 l16 -16 c10 -14 -8 -22 -16 -10 Z" fill="none" stroke="{RED}" stroke-width="1.8" transform="rotate(10 478 548)"/>')
        c.add(doodle_star(500, 640, 7, INK, 1.2))
        c.add(doodle_star(40, 600, 6, RED, 1.2))
    polaroid = rot_rect(80, 288, 460, 728, -1.8)
    c.add(f'<path d="{polaroid} {win}" fill-rule="evenodd" fill="#FBF8F2" filter="{c.shadow("pol", 0, 5, 7, "#3A2A1A", 0.5)}"/>')
    c.add(f'<path d="{win}" fill="none" stroke="#000000" stroke-width="10" opacity="0.18" filter="{c.blur("pin", 4)}"/>')
    c.add(washi(c, "w1", 98, 300, 104, 28, -38, "#F2B544", "stripes"))
    c.add(washi(c, "w2", 444, 294, 104, 28, 34, "#7FB8E0", "dots"))
    mee_meo(c, "pied", "mee-coucou", "meo-bravo")
    paper_label(c, kicker(), "3 missions sur 3", message="Une belle journée")
    return c


# ---------------------------------------------------------------- B : le journal d'explorateur

def bogolan_band(card, name, x0, y0, x1, y1, seed):
    """Une bande de bogolan (toile de boue du Mali) : fond brun profond, motifs peints à la terre claire, cellule par cellule."""
    rnd = random.Random(seed)
    cream, ground = "#EADBC0", "#3A2416"
    w = x1 - x0
    cx = (x0 + x1) / 2
    out = [f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(w)}" height="{f(y1 - y0)}" fill="{ground}"/>']
    out.append(f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(w)}" height="{f(y1 - y0)}" fill="#6A4428" opacity="0.6" filter="{noise(card, name + "-n", "0.08", 3, seed, 1.6, -0.6)}"/>')
    for x in (x0 + 4, x1 - 4):
        out.append(f'<line x1="{f(x)}" y1="{f(y0)}" x2="{f(x)}" y2="{f(y1)}" stroke="{cream}" stroke-width="2"/>')
    for k in range(int((y1 - y0) / 7)):
        y = y0 + 3.5 + k * 7
        for x in (x0 + 9, x1 - 9):
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="1.4" fill="{cream}"/>')
    y = y0 + 8
    kinds = ["zig", "diamond", "dots", "cross", "comb", "circles"]
    i = 0
    while y < y1 - 50:
        h = 52
        kind = kinds[(i + seed) % len(kinds)]
        cy = y + h / 2
        out.append(f'<line x1="{f(x0 + 13)}" y1="{f(y)}" x2="{f(x1 - 13)}" y2="{f(y)}" stroke="{cream}" stroke-width="1.6"/>')
        iw = w - 30
        if kind == "zig":
            pts = []
            for k in range(7):
                pts.append(f"{f(x0 + 15 + iw * k / 6)} {f(cy + (8 if k % 2 else -8))}")
            out.append(f'<path d="M{" L".join(pts)}" fill="none" stroke="{cream}" stroke-width="2.4" stroke-linejoin="round"/>')
            out.append(f'<path d="M{" L".join(pts)}" fill="none" stroke="{cream}" stroke-width="1.2" transform="translate(0 12)"/>')
        elif kind == "diamond":
            for s in (16, 10, 4):
                out.append(f'<path d="M{f(cx)} {f(cy - s)} L{f(cx + s * 0.9)} {f(cy)} L{f(cx)} {f(cy + s)} L{f(cx - s * 0.9)} {f(cy)} Z" fill="none" stroke="{cream}" stroke-width="1.8"/>')
        elif kind == "dots":
            for m in range(3):
                for n in range(3):
                    out.append(f'<circle cx="{f(cx + (n - 1) * 8)}" cy="{f(cy + (m - 1) * 13)}" r="2.4" fill="{cream}"/>')
        elif kind == "cross":
            out.append(f'<path d="M{f(cx - 10)} {f(cy - 14)} L{f(cx + 10)} {f(cy + 14)} M{f(cx + 10)} {f(cy - 14)} L{f(cx - 10)} {f(cy + 14)}" stroke="{cream}" stroke-width="2.6" stroke-linecap="round"/>')
            for sx, sy in ((-10, 0), (10, 0), (0, -18), (0, 18)):
                out.append(f'<circle cx="{f(cx + sx)}" cy="{f(cy + sy)}" r="2" fill="{cream}"/>')
        elif kind == "comb":
            out.append(f'<line x1="{f(x0 + 15)}" y1="{f(cy - 8)}" x2="{f(x1 - 15)}" y2="{f(cy - 8)}" stroke="{cream}" stroke-width="2.2"/>')
            for k in range(6):
                xx = x0 + 17 + (iw - 4) * k / 5
                out.append(f'<line x1="{f(xx)}" y1="{f(cy - 8)}" x2="{f(xx)}" y2="{f(cy + 12)}" stroke="{cream}" stroke-width="1.8" stroke-linecap="round"/>')
        else:
            for k in (-1, 1):
                out.append(f'<circle cx="{f(cx)}" cy="{f(cy + k * 12)}" r="8" fill="none" stroke="{cream}" stroke-width="1.8"/><circle cx="{f(cx)}" cy="{f(cy + k * 12)}" r="2.2" fill="{cream}"/>')
        y += h
        i += 1
    out.append(f'<line x1="{f(x0 + 13)}" y1="{f(y)}" x2="{f(x1 - 13)}" y2="{f(y)}" stroke="{cream}" stroke-width="1.6"/>')
    return f'<g filter="{wobble(card, name + "-wb", "0.06", 1.6, seed, 2)}">{"".join(out)}</g>'


def compass(card, cx, cy, r, name="cp"):
    """La boussole de laiton : graduations, rose des vents à seize branches, plaque centrale « Jour 283 »."""
    hi, mid, lo = BRASS
    out = [f'<circle cx="{f(cx)}" cy="{f(cy + 6)}" r="{f(r)}" fill="#000000" opacity="0.55" filter="{card.blur(name + "-sh", 7)}"/>']
    g = metal_grad(card, name + "-m", BRASS)
    out.append(f'<g filter="{bevel(card, name + "-bv", 1.2, 2.8, sd=2, dy=1, sop=0.4)}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/></g>')
    face = card.rgrad(name + "-face", [(0, "#F6EAD0", 1), (0.8, "#E2CDA2", 1), (1, "#B89A62", 1)], 0.45, 0.4, 0.65)
    ri = r * 0.84
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(ri)}" fill="{face}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(ri)}" fill="none" stroke="#000000" stroke-width="5" opacity="0.35" filter="{card.blur(name + "-is", 3)}"/>')
    ticks = []
    for i in range(72):
        a = i * 5
        L = 7 if i % 6 == 0 else 3.5
        x0, y0 = pt(cx, cy, ri - 1, a)
        x1, y1 = pt(cx, cy, ri - 1 - L, a)
        ticks.append(f'<line x1="{f(x0)}" y1="{f(y0)}" x2="{f(x1)}" y2="{f(y1)}" stroke="#4A3418" stroke-width="{1.2 if i % 6 == 0 else 0.7}"/>')
    out.append("".join(ticks))
    for a, lab in ((0, "N"), (90, "E"), (180, "S"), (270, "O")):
        x, y = pt(cx, cy, ri - 16, a)
        out.append(f'<text x="{f(x)}" y="{f(y + 4.5)}" text-anchor="middle" font-family="{CINZEL}" font-weight="700" font-size="12" fill="{RED if lab == "N" else "#3A2410"}">{lab}</text>')
    star = []
    for i in range(16):
        a = i * 22.5
        L = ri * (0.66 if i % 4 == 0 else 0.5 if i % 2 == 0 else 0.36)
        wv = 7 if i % 4 == 0 else 5
        tip = pt(cx, cy, L, a)
        l, rr = pt(cx, cy, wv, a - 90), pt(cx, cy, wv, a + 90)
        dark = "#7A5A28" if i % 4 == 0 else "#A88448"
        star.append((i % 4 == 0, f'<path d="M{f(cx)} {f(cy)} L{f(l[0])} {f(l[1])} L{f(tip[0])} {f(tip[1])} Z" fill="{dark}"/>'
                     f'<path d="M{f(cx)} {f(cy)} L{f(rr[0])} {f(rr[1])} L{f(tip[0])} {f(tip[1])} Z" fill="#F0DCAA"/>'))
    out.append("".join(s for big, s in star if not big))
    out.append("".join(s for big, s in star if big))
    plate = card.rgrad(name + "-pl", [(0, "#3A2A1C", 1), (1, "#1A120A", 1)], 0.5, 0.4, 0.6)
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.4)}" fill="{plate}" stroke="{hi}" stroke-width="2"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.4 - 4)}" fill="none" stroke="{mid}" stroke-width="0.8"/>')
    out.append(f'<text x="{f(cx)}" y="{f(cy - 8)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="8" letter-spacing="2.6" fill="{hi}">JOUR</text>')
    out.append(f'<text x="{f(cx)}" y="{f(cy + 15)}" text-anchor="middle" font-family="{CINZEL}" font-weight="700" font-size="25" fill="{card.grad(name + "-n", [(0, "#FFFFFF"), (0.5, hi), (1, mid)], 0, 0, 0, 1)}">{DAY}</text>')
    out.append(f'<path d="M{f(cx - r * 0.62)} {f(cy - r * 0.62)} A{f(r)} {f(r)} 0 0 1 {f(cx + r * 0.5)} {f(cy - r * 0.76)} Q{f(cx)} {f(cy - r * 0.4)} {f(cx - r * 0.62)} {f(cy - r * 0.62)} Z" fill="#FFFFFF" opacity="0.22"/>')
    return "".join(out)


def wax_seal(card, cx, cy, r, symbol, seed, name="ws"):
    """Un sceau de cire rouge, bord coulé irrégulier, frappé d'un symbole Adinkra en creux."""
    rnd = random.Random(seed)
    pts = []
    for i in range(18):
        a = math.radians(i * 20)
        rr = r * rnd.uniform(0.92, 1.12)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d = smooth_closed(pts)
    wax = card.rgrad(name + "-w", [(0, "#E2483A", 1), (0.6, "#A81E1A", 1), (1, "#5A0A0C", 1)], 0.4, 0.35, 0.7)
    out = [f'<g filter="{bevel(card, name + "-bv", 2.2, 4.2, light="#FFD0C0", spec=0.9, exp=14, sd=3, dy=3, sop=0.6)}"><path d="{d}" fill="{wax}"/></g>']
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.7)}" fill="#7A1012" opacity="0.55"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.7)}" fill="none" stroke="#3A0406" stroke-width="1.2" opacity="0.7"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.7)}" fill="none" stroke="#FF8A7A" stroke-width="0.9" opacity="0.5" transform="translate(0.8 1)"/>')
    sym_dark = symbol(cx + 0.8, cy + 1.2, r * 0.022, "#3A0406")
    sym = symbol(cx, cy, r * 0.022, "#F2836E")
    out.append(f'<g opacity="0.8" filter="{card.blur(name + "-sd", 0.7)}">{sym_dark}</g>')
    out.append(f'<g filter="{bevel(card, name + "-sbv", 0.6, 2.0, light="#FFE0D0", spec=1.2, shadow=False)}">{sym}</g>')
    return "".join(out)


def ribbon_marker(card, x, y0, y1, w, color, name="rb"):
    g = card.grad(name + "-g", [(0, color), (0.5, "#E8505A"), (1, color)], 0, 0, 1, 0)
    return (
        f'<path d="M{f(x - w / 2)} {f(y0)} L{f(x + w / 2)} {f(y0)} L{f(x + w / 2)} {f(y1)} L{f(x)} {f(y1 - 12)} L{f(x - w / 2)} {f(y1)} Z" '
        f'fill="{g}" filter="{card.shadow(name + "-sh", 2, 4, 3, "#000000", 0.5)}"/>'
        f'<line x1="{f(x - w / 2 + 3)}" y1="{f(y0)}" x2="{f(x - w / 2 + 3)}" y2="{f(y1 - 3)}" stroke="#FFFFFF" stroke-width="0.6" opacity="0.4"/>'
    )


def contours(card, cx, cy, n, seed, step=14):
    """Des courbes de niveau gaufrées dans le cuir : une carte en relief, sans encre."""
    rnd = random.Random(seed)
    phases = [rnd.uniform(0, 6) for _ in range(3)]
    out = []
    for k in range(1, n + 1):
        r = k * step
        pts = []
        for i in range(24):
            a = i * 2 * math.pi / 24
            rr = r * (1 + 0.18 * math.sin(3 * a + phases[0]) + 0.1 * math.sin(5 * a + phases[1] + k * 0.2))
            pts.append((cx + rr * math.cos(a) * 1.25, cy + rr * math.sin(a)))
        d = smooth_closed(pts)
        out.append(f'<path d="{d}" fill="none" stroke="#1A0C04" stroke-width="1.6" opacity="0.55"/>')
        out.append(f'<path d="{d}" fill="none" stroke="#C99A6A" stroke-width="0.8" opacity="0.35" transform="translate(0.8 1.2)"/>')
    return "".join(out)


def explorateur():
    c = Card("jb")
    c.motif("afrique")
    photo(c, top="#33261A", bottom="#120C08", rim="#FFD9A8", glow=0.22)
    win = rrect(84, 296, 456, 726, 14)
    with group(c, f'mask="{deco_mask(c, win)}"'):
        leather = c.rgrad("lea", [(0, "#6A4226", 1), (0.6, "#4A2A16", 1), (1, "#24130A", 1)], 0.5, 0.3, 0.85)
        c.add(f'<rect width="{W}" height="{H}" fill="{leather}"/>')
        c.add(f'<rect width="{W}" height="{H}" fill="#1A0C04" opacity="0.6" filter="{noise(c, "grainL", "0.55", 3, 8, 2.2, -1.05)}"/>')
        c.add(f'<rect width="{W}" height="{H}" fill="#C08A5A" opacity="0.25" filter="{noise(c, "grainH", "0.035", 3, 9, 1.8, -0.9)}"/>')
        c.add(f'<rect x="30" y="30" width="{W - 60}" height="{H - 60}" rx="16" fill="none" stroke="#E8D2A8" stroke-width="1.6" stroke-dasharray="6 5" opacity="0.8"/>')
        c.add(bogolan_band(c, "bgL", 28, 300, 80, 940, 1))
        c.add(bogolan_band(c, "bgR", 460, 300, 512, 940, 4))
        c.add(contours(c, 96, 186, 9, 21))
        c.add(contours(c, 452, 212, 7, 22))
        c.add(contours(c, 270, 990, 6, 23, 30))
    c.add(inner_shadow(c, win, 40, 14, 0.55))
    c.add(grade(c, win, "#FFC27A", 0.5, -0.1, 0.24, 0.9, "gr"))
    c.add(rim(c, win, BRASS, 4.5))
    for (x, y) in ((84, 296), (456, 296), (84, 726), (456, 726)):
        c.add(f'<g filter="{bevel(c, "cbv", 0.8, 2.2, sd=2, dy=2, sop=0.6)}"><path d="M{x - 14 if x < 270 else x + 14} {y} L{x} {y} L{x} {y - 14 if y < 500 else y + 14}" fill="none" stroke="{metal_grad(c, "cg", BRASS)}" stroke-width="7" stroke-linecap="square"/></g>')
    c.add(ribbon_marker(c, 410, 0, 262, 20, "#A81E2A"))
    c.add(compass(c, 270, 150, 78))
    seals = ((84, 410, sankofa, 11), (456, 520, nsoromma, 12), (84, 630, dwennimmen, 13))
    for i, (x, y, sym, seed) in enumerate(seals):
        c.add(wax_seal(c, x, y, 30, sym, seed, f"ws{i}"))
    mee_meo(c, "perches", "mee-danse", "meo-roi")
    inscription(c, kicker(), "3 missions sur 3", metal=BRASS, panel=("#3A2414", "#140A04"), accent="#E8C27A", ink="#FFF1DC", title_size=36,
                title_font=FRAUNCES)
    return c


FRAMES = [
    ("moments-jour-a", carnet, dict(rank="Réalisation du jour", division=None, option="décoration A · la page de carnet", name="La Page du jour",
     story="La photo est collée dans un carnet à grands carreaux avec deux bouts de ruban de masquage ; un tampon rouge date le « Jour 283 », et à côté, à la main, les trois missions du jour cochées une à une, « 3 / 3 ! ».",
     layout="pied (Mee coucou, Meo bravo)", message="Une belle journée")),
    ("moments-jour-b", explorateur, dict(rank="Réalisation du jour", division=None, option="décoration B · le journal d'explorateur", name="Le Journal d'explorateur",
     story="Un journal de cuir cousu main : une boussole de laiton indique le Jour 283, deux bandes de bogolan, la toile peinte à la boue du Mali, bordent la photo, et trois sceaux de cire frappés d'Adinkra ghanéens — Sankofa (revenir chercher ce qu'on a appris), Nsoromma (l'étoile qui veille) et Dwennimmen (la force humble) — scellent les trois missions accomplies.",
     layout="perchés (Mee danse, Meo roi)", message=None)),
]
