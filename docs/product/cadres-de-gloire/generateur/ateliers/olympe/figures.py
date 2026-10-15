"""Figures de l'atelier « Olympe » : amphore à figures noires, chouette d'Athéna, lyre, foudre de Zeus,
trépied à flamme, Pégase, aigle, char solaire.

Toutes stylisées et redessinées (styles géométrique et archaïque des vases attiques), sans visage réaliste.
"""

import math
import random

from common import f, pt


def limb(points, widths, color, joints=True):
    """Un membre effilé : polygone suivant une ligne brisée, avec une largeur par point (et des articulations rondes)."""
    left, right = [], []
    n = len(points)
    for i, (x, y) in enumerate(points):
        if i == 0:
            dx, dy = points[1][0] - x, points[1][1] - y
        elif i == n - 1:
            dx, dy = x - points[i - 1][0], y - points[i - 1][1]
        else:
            dx, dy = points[i + 1][0] - points[i - 1][0], points[i + 1][1] - points[i - 1][1]
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L, dx / L
        w = widths[i] / 2
        left.append((x + nx * w, y + ny * w))
        right.append((x - nx * w, y - ny * w))
    d = "M" + " L".join(f"{f(a)} {f(b)}" for a, b in left + list(reversed(right))) + "Z"
    out = [f'<path d="{d}" fill="{color}" stroke="{color}" stroke-width="0.6" stroke-linejoin="round"/>']
    if joints:
        for (x, y), w in zip(points[1:-1], widths[1:-1]):
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(w / 2)}" fill="{color}"/>')
    return "".join(out)


def _smooth(points, closed=False):
    """Catmull-Rom → Bézier : une courbe lisse passant par les points."""
    pts = points + points[:3] if closed else [points[0]] + points + [points[-1]]
    d = [f"M{f(pts[1][0])} {f(pts[1][1])}"]
    rng = range(1, len(pts) - 2)
    for i in rng:
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d.append(f"C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}")
    return " ".join(d) + ("Z" if closed else "")


def smooth(points, closed=False):
    return _smooth(points, closed)


# ---------------------------------------------------------------- l'amphore panathénaïque

AMPHORA_PROFILE = [(0.0, 0.17), (0.035, 0.17), (0.05, 0.12), (0.2, 0.115), (0.27, 0.2), (0.36, 0.42), (0.45, 0.47), (0.6, 0.43),
                   (0.75, 0.32), (0.87, 0.17), (0.9, 0.11), (0.93, 0.13), (0.97, 0.2), (1.0, 0.2)]


def amphora_path(cx, y0, h, profile=AMPHORA_PROFILE):
    right = [(cx + w * h, y0 + t * h) for t, w in profile]
    left = [(cx - w * h, y0 + t * h) for t, w in reversed(profile)]
    return _smooth(right + left, closed=True)


def runner(x, y, s, color, phase=0, flip=False, prop=None):
    """Un coureur stylisé à la manière des vases géométriques et archaïques : tête ronde, buste en triangle, membres en fuseaux."""
    m = -1 if flip else 1
    out = []
    hx, hy = x + m * 2 * s, y - 34 * s
    out.append(f'<circle cx="{f(hx)}" cy="{f(hy)}" r="{f(4.6 * s)}" fill="{color}"/>')
    out.append(f'<path d="M{f(hx - m * 3 * s)} {f(hy - 2 * s)} q{f(-m * 5 * s)} {f(2 * s)} {f(-m * 7 * s)} {f(7 * s)}" stroke="{color}" stroke-width="{f(2 * s)}" fill="none" stroke-linecap="round"/>')
    torso = f"M{f(x - 7 * s)} {f(y - 28 * s)} L{f(x + 7 * s)} {f(y - 28 * s)} L{f(x + m * 1.5 * s)} {f(y - 8 * s)} L{f(x - m * 1.5 * s)} {f(y - 8 * s)}Z"
    out.append(f'<path d="{torso}" fill="{color}"/>')
    sw = 1 if phase == 0 else -1
    out.append(limb([(x + m * 5 * s, y - 26 * s), (x + m * (12 * s), y - 20 * s * sw * 0 - 18 * s), (x + m * 17 * s, y - 28 * s)], [3.4 * s, 3 * s, 2.4 * s], color))
    out.append(limb([(x - m * 5 * s, y - 26 * s), (x - m * 12 * s, y - 18 * s), (x - m * 18 * s, y - 22 * s)], [3.4 * s, 3 * s, 2.4 * s], color))
    out.append(limb([(x, y - 9 * s), (x + m * 10 * s, y + 2 * s), (x + m * 8 * s, y + 14 * s), (x + m * 13 * s, y + 15 * s)], [6 * s, 4.4 * s, 3 * s, 2 * s], color))
    out.append(limb([(x, y - 9 * s), (x - m * 9 * s, y + 3 * s), (x - m * 18 * s, y + 6 * s), (x - m * 20 * s, y + 13 * s)], [6 * s, 4.4 * s, 3 * s, 2 * s], color))
    if prop == "discus":
        out.append(f'<circle cx="{f(x + m * 19 * s)}" cy="{f(y - 30 * s)}" r="{f(4.5 * s)}" fill="{color}"/>')
    elif prop == "javelin":
        out.append(f'<path d="M{f(x - m * 22 * s)} {f(y - 10 * s)} L{f(x + m * 30 * s)} {f(y - 40 * s)}" stroke="{color}" stroke-width="{f(1.4 * s)}"/>')
    elif prop == "torch":
        tx, ty = x + m * 17 * s, y - 28 * s
        out.append(f'<path d="M{f(tx)} {f(ty)} l{f(m * 3 * s)} {f(-9 * s)}" stroke="{color}" stroke-width="{f(2 * s)}"/>'
                   f'<path d="M{f(tx + m * 3 * s)} {f(ty - 9 * s)} c{f(-4 * s)} {f(-4 * s)} {f(0)} {f(-10 * s)} {f(2 * s)} {f(-12 * s)} c{f(1 * s)} {f(4 * s)} {f(5 * s)} {f(6 * s)} {f(-2 * s)} {f(12 * s)}Z" fill="{color}"/>')
    return "".join(out)


def amphora(card, cx, y0, h, glaze="#17110D", clay="#C8642E", clay_hi="#E58A4E", figures="runners", seed=1, gold=None):
    """Une amphore panathénaïque à figures noires : panse vernissée, panneau d'argile réservé, coureurs ; anses en boucle.
    `gold` : un filet d'or (l'amphore de prix)."""
    out = []
    body = amphora_path(cx, y0, h)
    gl = card.grad("amph-gl", [(0, "#000000"), (0.22, glaze), (0.38, "#4A3A30"), (0.5, glaze), (1, "#000000")], 0, 0, 1, 0)
    for m in (-1, 1):
        hd = (f"M{f(cx + m * 0.11 * h)} {f(y0 + 0.08 * h)} C{f(cx + m * 0.3 * h)} {f(y0 + 0.02 * h)} {f(cx + m * 0.36 * h)} {f(y0 + 0.2 * h)} {f(cx + m * 0.3 * h)} {f(y0 + 0.33 * h)}")
        out.append(f'<path d="{hd}" fill="none" stroke="{glaze}" stroke-width="{f(h * 0.035)}" stroke-linecap="round"/>')
        out.append(f'<path d="{hd}" fill="none" stroke="#5A463A" stroke-width="{f(h * 0.008)}" stroke-linecap="round" transform="translate({f(-m * h * 0.006)} {f(-h * 0.006)})"/>')
    out.append(f'<path d="{body}" fill="{gl}"/>')
    px0, px1 = cx - 0.3 * h, cx + 0.3 * h
    py0, py1 = y0 + 0.36 * h, y0 + 0.66 * h
    clip = f"{card.uid}-amph-cl-{seed}"
    card.def_once(f"amph-cl-{seed}", f'<clipPath id="{clip}"><path d="{body}"/></clipPath>')
    cg = card.grad("amph-clay", [(0, "#8A3A16"), (0.3, clay), (0.45, clay_hi), (0.7, clay), (1, "#7A3012")], 0, 0, 1, 0)
    out.append(f'<g clip-path="url(#{clip})">')
    out.append(f'<rect x="{f(px0)}" y="{f(py0)}" width="{f(px1 - px0)}" height="{f(py1 - py0)}" fill="{cg}"/>')
    ty = y0 + 0.27 * h
    n = 14
    for i in range(n):
        x = cx - 0.36 * h + 0.72 * h * (i + 0.5) / n
        col = clay if i % 2 else glaze
        out.append(f'<path d="M{f(x - 0.022 * h)} {f(ty)} L{f(x + 0.022 * h)} {f(ty)} L{f(x)} {f(ty + 0.07 * h)}Z" fill="{col}" opacity="0.95"/>')
    out.append(f'<rect x="{f(cx - 0.5 * h)}" y="{f(y0 + 0.345 * h)}" width="{f(h)}" height="{f(0.012 * h)}" fill="{clay}"/>')
    out.append(f'<rect x="{f(cx - 0.5 * h)}" y="{f(y0 + 0.675 * h)}" width="{f(h)}" height="{f(0.012 * h)}" fill="{clay}"/>')
    for i in range(18):
        x = cx - 0.4 * h + 0.8 * h * i / 17
        out.append(f'<path d="M{f(x)} {f(y0 + 0.86 * h)} L{f(x + 0.012 * h)} {f(y0 + 0.78 * h)} L{f(x + 0.024 * h)} {f(y0 + 0.86 * h)}" fill="{clay}" opacity="0.8"/>')
    out.append("</g>")
    s = h / 150
    fy = py1 - 0.035 * h
    if figures == "runners":
        out.append(runner(cx - 0.13 * h, fy, s * 1.05, glaze, 0, False))
        out.append(runner(cx + 0.11 * h, fy, s * 1.05, glaze, 1, False))
    elif figures == "torch":
        out.append(runner(cx, fy, s * 1.2, glaze, 0, False, "torch"))
    elif figures == "discus":
        out.append(runner(cx, fy, s * 1.2, glaze, 0, True, "discus"))
    out.append(f'<path d="M{f(px0)} {f(py0 + 0.012 * h)} H{f(px1)} M{f(px0)} {f(py1 - 0.008 * h)} H{f(px1)}" stroke="{glaze}" stroke-width="{f(0.006 * h)}" opacity="0.7"/>')
    out.append(f'<path d="{body}" fill="{card.grad("amph-sheen", [(0, "#FFFFFF"), (1, "#FFFFFF")])}" opacity="0" />')
    out.append(f'<path d="M{f(cx - 0.36 * h)} {f(y0 + 0.4 * h)} Q{f(cx - 0.43 * h)} {f(y0 + 0.5 * h)} {f(cx - 0.36 * h)} {f(y0 + 0.66 * h)}" fill="none" stroke="#FFFFFF" stroke-width="{f(0.018 * h)}" opacity="0.22" stroke-linecap="round"/>')
    if gold:
        out.append(f'<path d="{body}" fill="none" stroke="{gold}" stroke-width="{f(0.008 * h)}" opacity="0.9"/>')
    return "".join(out)


# ---------------------------------------------------------------- la chouette d'Athéna

def owl(card, cx, cy, s, body="#C9A04A", dark="#5A3A10", light="#FFF1C4", eye="#FFD24A", pupil="#1A0E04", wings=0.0, feather_geo=None):
    """La chouette d'Athéna, de face. `wings` : 0 repliées, 1 grandes ouvertes. Repère : 100 = hauteur du corps."""
    out = []
    u = s
    if wings > 0:
        for m in (-1, 1):
            for row, (L, n, a0, a1, wcol) in enumerate(((150 * wings, 9, 18, 98, dark), (110 * wings, 8, 22, 92, body), (70 * wings, 7, 28, 86, light))):
                for i in range(n):
                    t = i / (n - 1)
                    a = a0 + (a1 - a0) * t
                    ax, ay = cx + m * 16 * u, cy - 10 * u
                    Lk = L * u * (1 - 0.25 * abs(t - 0.4))
                    tx, ty = pt(ax, ay, Lk, m * a)
                    wdt = 9 * u * (1 + 0.4 * (1 - row * 0.4))
                    nx, ny = math.cos(math.radians(m * a)), math.sin(math.radians(m * a))
                    mx, my = (ax + tx) / 2, (ay + ty) / 2
                    d = (f"M{f(ax)} {f(ay)} Q{f(mx + nx * wdt)} {f(my + ny * wdt)} {f(tx)} {f(ty)} Q{f(mx - nx * wdt * 0.5)} {f(my - ny * wdt * 0.5)} {f(ax)} {f(ay)}Z")
                    out.append(f'<path d="{d}" fill="{wcol}" stroke="{dark}" stroke-width="{f(0.8 * u)}" opacity="0.97"/>')
                    if row == 0:
                        out.append(f'<path d="M{f(ax)} {f(ay)} L{f(tx)} {f(ty)}" stroke="{light}" stroke-width="{f(0.6 * u)}" opacity="0.5"/>')
    bd = (f"M{f(cx)} {f(cy - 52 * u)} C{f(cx + 30 * u)} {f(cy - 54 * u)} {f(cx + 40 * u)} {f(cy - 20 * u)} {f(cx + 36 * u)} {f(cy + 10 * u)} "
          f"C{f(cx + 32 * u)} {f(cy + 40 * u)} {f(cx + 16 * u)} {f(cy + 50 * u)} {f(cx)} {f(cy + 52 * u)} C{f(cx - 16 * u)} {f(cy + 50 * u)} {f(cx - 32 * u)} {f(cy + 40 * u)} "
          f"{f(cx - 36 * u)} {f(cy + 10 * u)} C{f(cx - 40 * u)} {f(cy - 20 * u)} {f(cx - 30 * u)} {f(cy - 54 * u)} {f(cx)} {f(cy - 52 * u)}Z")
    bg = card.rgrad("owl-body", [(0, light, 1), (0.55, body, 1), (1, dark, 1)], 0.5, 0.4, 0.65)
    out.append(f'<path d="{bd}" fill="{bg}"/>')
    for m in (-1, 1):
        tuft = f"M{f(cx + m * 18 * u)} {f(cy - 50 * u)} L{f(cx + m * 30 * u)} {f(cy - 68 * u)} L{f(cx + m * 32 * u)} {f(cy - 40 * u)}Z"
        out.append(f'<path d="{tuft}" fill="{body}" stroke="{dark}" stroke-width="{f(0.8 * u)}"/>')
    for row in range(5):
        yy = cy + 4 * u + row * 8.5 * u
        half = 26 * u * (1 - row * 0.12)
        k = 5 - (row % 2)
        for i in range(k):
            xx = cx - half + (2 * half) * (i + 0.5) / k
            out.append(f'<path d="M{f(xx - 4 * u)} {f(yy)} Q{f(xx)} {f(yy + 6 * u)} {f(xx + 4 * u)} {f(yy)}" fill="none" stroke="{dark}" stroke-width="{f(1.1 * u)}" opacity="0.75"/>')
    if not wings:
        for m in (-1, 1):
            wg = (f"M{f(cx + m * 34 * u)} {f(cy - 14 * u)} C{f(cx + m * 44 * u)} {f(cy + 10 * u)} {f(cx + m * 38 * u)} {f(cy + 40 * u)} {f(cx + m * 20 * u)} {f(cy + 58 * u)} "
                  f"C{f(cx + m * 24 * u)} {f(cy + 30 * u)} {f(cx + m * 24 * u)} {f(cy)} {f(cx + m * 34 * u)} {f(cy - 14 * u)}Z")
            out.append(f'<path d="{wg}" fill="{dark}" opacity="0.85"/>')
            for k in range(4):
                out.append(f'<path d="M{f(cx + m * (33 - k * 2) * u)} {f(cy + (k * 12 - 6) * u)} q{f(m * 4 * u)} {f(8 * u)} {f(-m * 3 * u)} {f(14 * u)}" fill="none" stroke="{light}" stroke-width="{f(0.8 * u)}" opacity="0.5"/>')
    face = (f"M{f(cx)} {f(cy - 8 * u)} C{f(cx - 10 * u)} {f(cy - 2 * u)} {f(cx - 36 * u)} {f(cy - 8 * u)} {f(cx - 34 * u)} {f(cy - 30 * u)} "
            f"C{f(cx - 32 * u)} {f(cy - 48 * u)} {f(cx - 8 * u)} {f(cy - 46 * u)} {f(cx)} {f(cy - 36 * u)} C{f(cx + 8 * u)} {f(cy - 46 * u)} {f(cx + 32 * u)} {f(cy - 48 * u)} "
            f"{f(cx + 34 * u)} {f(cy - 30 * u)} C{f(cx + 36 * u)} {f(cy - 8 * u)} {f(cx + 10 * u)} {f(cy - 2 * u)} {f(cx)} {f(cy - 8 * u)}Z")
    out.append(f'<path d="{face}" fill="{light}" opacity="0.92"/>')
    out.append(f'<path d="{face}" fill="none" stroke="{dark}" stroke-width="{f(1.2 * u)}" opacity="0.7"/>')
    eg = card.rgrad("owl-eye", [(0, "#FFFFFF", 1), (0.35, eye, 1), (1, "#C27A10", 1)], 0.45, 0.4, 0.6)
    for m in (-1, 1):
        ex, ey = cx + m * 16 * u, cy - 26 * u
        out.append(f'<circle cx="{f(ex)}" cy="{f(ey)}" r="{f(13 * u)}" fill="{dark}" opacity="0.8"/>')
        out.append(f'<circle cx="{f(ex)}" cy="{f(ey)}" r="{f(11 * u)}" fill="{eg}"/>')
        out.append(f'<circle cx="{f(ex)}" cy="{f(ey)}" r="{f(5.5 * u)}" fill="{pupil}"/>')
        out.append(f'<circle cx="{f(ex - 2.4 * u)}" cy="{f(ey - 2.6 * u)}" r="{f(1.8 * u)}" fill="#FFFFFF"/>')
    out.append(f'<path d="M{f(cx - 4 * u)} {f(cy - 18 * u)} L{f(cx + 4 * u)} {f(cy - 18 * u)} L{f(cx)} {f(cy - 6 * u)}Z" fill="{dark}"/>')
    for m in (-1, 1):
        for k in (-1, 0, 1):
            fx = cx + m * 9 * u + k * 3 * u
            out.append(f'<path d="M{f(fx)} {f(cy + 48 * u)} l{f(k * 1.5 * u)} {f(7 * u)}" stroke="{dark}" stroke-width="{f(2 * u)}" stroke-linecap="round"/>')
    return "".join(out)


# ---------------------------------------------------------------- la lyre d'Apollon

def lyre(card, cx, y_top, y_box, half, fill, dark, string="#FFF4C2", strings=7, box="chelys", string_mask=None, glow=None):
    """La lyre : caisse (carapace de tortue ou caisse de cithare) en bas, deux bras en cornes, joug en haut, cordes."""
    out = []
    ya = y_top
    yb = y_box
    for m in (-1, 1):
        arm = (f"M{f(cx + m * half * 0.55)} {f(yb)} C{f(cx + m * half * 1.25)} {f(yb - (yb - ya) * 0.25)} {f(cx + m * half * 1.2)} {f(yb - (yb - ya) * 0.6)} "
               f"{f(cx + m * half * 0.9)} {f(ya + (yb - ya) * 0.12)} C{f(cx + m * half * 0.78)} {f(ya + 4)} {f(cx + m * half * 0.9)} {f(ya - 18)} {f(cx + m * half * 1.08)} {f(ya - 26)}")
        out.append(f'<path d="{arm}" fill="none" stroke="{dark}" stroke-width="27" stroke-linecap="round"/>')
        out.append(f'<path d="{arm}" fill="none" stroke="{fill}" stroke-width="21" stroke-linecap="round"/>')
        out.append(f'<path d="{arm}" fill="none" stroke="{dark}" stroke-width="1.4" stroke-linecap="round" opacity="0.6" stroke-dasharray="2 9"/>')
        out.append(f'<path d="{arm}" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity="0.5" transform="translate({f(-m * 5)} 0)"/>')
        tx, ty = cx + m * half * 1.08, ya - 26
        sp = []
        for i in range(50):
            t = i / 49
            a = math.radians(90 + m * (-90 + t * 330))
            rr = 16 * (1 - 0.75 * t)
            sp.append((tx + m * 6 + rr * math.cos(a) * m, ty - 4 + rr * math.sin(a)))
        d = "M" + " L".join(f"{f(a)} {f(b)}" for a, b in sp)
        out.append(f'<path d="{d}" fill="none" stroke="{dark}" stroke-width="9" stroke-linecap="round"/>'
                   f'<path d="{d}" fill="none" stroke="{fill}" stroke-width="6" stroke-linecap="round"/>')
        bx, by = cx + m * half * 0.55, yb
        out.append(f'<circle cx="{f(bx)}" cy="{f(by)}" r="13" fill="{fill}" stroke="{dark}" stroke-width="2"/>'
                   f'<circle cx="{f(bx)}" cy="{f(by)}" r="6" fill="{dark}" opacity="0.6"/><circle cx="{f(bx - 3)}" cy="{f(by - 3)}" r="3" fill="#FFFFFF" opacity="0.7"/>')
    out.append(f'<rect x="{f(cx - half * 1.02)}" y="{f(ya - 8)}" width="{f(half * 2.04)}" height="16" rx="8" fill="{fill}" stroke="{dark}" stroke-width="2"/>')
    out.append(f'<rect x="{f(cx - half * 1.0)}" y="{f(ya - 6)}" width="{f(half * 2.0)}" height="3" rx="1.5" fill="#FFFFFF" opacity="0.5"/>')
    xs = [cx - half * 0.42 + half * 0.84 * i / (strings - 1) for i in range(strings)]
    for x in xs:
        out.append(f'<circle cx="{f(x)}" cy="{f(ya)}" r="3.2" fill="{dark}"/>')
    st = []
    for i, x in enumerate(xs):
        xb = cx - half * 0.3 + half * 0.6 * i / (strings - 1)
        st.append(f'<path d="M{f(x)} {f(ya + 6)} L{f(xb)} {f(yb + 16)}" stroke="{string}" stroke-width="1.6"/>')
    sm = f' mask="{string_mask}"' if string_mask else ""
    if glow:
        out.append(f'<g{sm} filter="{glow}" opacity="0.9">{"".join(st).replace("1.6", "5")}</g>')
    out.append(f'<g{sm}>{"".join(st)}</g>')
    return "".join(out)


def tortoise_box(card, cx, cy, rx, ry, fill, dark, light):
    """La caisse de la lyre en carapace de tortue (la chelys d'Hermès) : dôme d'écailles."""
    out = [f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{fill}" stroke="{dark}" stroke-width="2.4"/>']
    for i in range(-2, 3):
        for j in range(-1, 2):
            x = cx + i * rx * 0.36 + (j % 2) * rx * 0.18
            y = cy + j * ry * 0.5
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 0.75:
                continue
            r = rx * 0.15
            hx = " L".join(f"{f(x + r * math.cos(math.radians(60 * k + 30)))} {f(y + r * 0.8 * math.sin(math.radians(60 * k + 30)))}" for k in range(6))
            out.append(f'<path d="M{hx}Z" fill="none" stroke="{dark}" stroke-width="1.6" opacity="0.8"/>')
            out.append(f'<path d="M{hx}Z" fill="{light}" opacity="0.18"/>')
    out.append(f'<ellipse cx="{f(cx - rx * 0.25)}" cy="{f(cy - ry * 0.45)}" rx="{f(rx * 0.4)}" ry="{f(ry * 0.18)}" fill="#FFFFFF" opacity="0.28"/>')
    return "".join(out)


# ---------------------------------------------------------------- la foudre de Zeus

def keraunos(cx, cy, L, fill, dark, rot=0, w=1.0):
    """Le foudre de Zeus tel que le montrent les monnaies : poignée annelée, trois dards en zigzag de chaque côté."""
    out = []
    h = L / 2
    for m in (-1, 1):
        mid = (f"M{f(cx - 5 * w)} {f(cy + m * h * 0.16)} L{f(cx - 10 * w)} {f(cy + m * h * 0.42)} L{f(cx + 4 * w)} {f(cy + m * h * 0.5)} "
               f"L{f(cx - 6 * w)} {f(cy + m * h * 0.76)} L{f(cx + 8 * w)} {f(cy + m * h * 0.8)} L{f(cx)} {f(cy + m * h * 1.0)} "
               f"L{f(cx + 14 * w)} {f(cy + m * h * 0.74)} L{f(cx + 2 * w)} {f(cy + m * h * 0.7)} L{f(cx + 14 * w)} {f(cy + m * h * 0.44)} "
               f"L{f(cx + 2 * w)} {f(cy + m * h * 0.36)} L{f(cx + 5 * w)} {f(cy + m * h * 0.16)}Z")
        out.append(f'<path d="{mid}" fill="{fill}" stroke="{dark}" stroke-width="{f(1.2 * w)}" stroke-linejoin="round"/>')
        for side in (-1, 1):
            prong = (f"M{f(cx + side * 6 * w)} {f(cy + m * h * 0.18)} C{f(cx + side * 26 * w)} {f(cy + m * h * 0.3)} {f(cx + side * 30 * w)} {f(cy + m * h * 0.55)} "
                     f"{f(cx + side * 18 * w)} {f(cy + m * h * 0.82)} C{f(cx + side * 22 * w)} {f(cy + m * h * 0.55)} {f(cx + side * 16 * w)} {f(cy + m * h * 0.36)} {f(cx + side * 4 * w)} {f(cy + m * h * 0.26)}Z")
            out.append(f'<path d="{prong}" fill="{fill}" stroke="{dark}" stroke-width="{f(1.2 * w)}"/>')
    out.append(f'<rect x="{f(cx - 7 * w)}" y="{f(cy - h * 0.2)}" width="{f(14 * w)}" height="{f(h * 0.4)}" rx="{f(4 * w)}" fill="{fill}" stroke="{dark}" stroke-width="{f(1.2 * w)}"/>')
    for k in (-0.14, 0, 0.14):
        out.append(f'<rect x="{f(cx - 9 * w)}" y="{f(cy + k * h - 2.4 * w)}" width="{f(18 * w)}" height="{f(4.8 * w)}" rx="{f(2.4 * w)}" fill="{fill}" stroke="{dark}" stroke-width="{f(1 * w)}"/>')
    g = "".join(out)
    return f'<g transform="rotate({f(rot)} {f(cx)} {f(cy)})">{g}</g>'


# ---------------------------------------------------------------- le trépied et la flamme

def tripod(card, cx, by, s, metal, dark, flame=True):
    out = []
    top = by - 92 * s
    for dx, lean in ((-30, -6), (30, 6), (0, 0)):
        x0 = cx + dx * s * 0.45
        out.append(f'<path d="M{f(x0)} {f(top + 14 * s)} L{f(cx + dx * s + lean * s)} {f(by)}" stroke="{dark}" stroke-width="{f(6 * s)}" stroke-linecap="round"/>')
        out.append(f'<path d="M{f(x0)} {f(top + 14 * s)} L{f(cx + dx * s + lean * s)} {f(by)}" stroke="{metal}" stroke-width="{f(3.6 * s)}" stroke-linecap="round"/>')
        out.append(f'<path d="M{f(cx + dx * s + lean * s - 5 * s)} {f(by)} h{f(10 * s)}" stroke="{metal}" stroke-width="{f(3 * s)}" stroke-linecap="round"/>')
    out.append(f'<path d="M{f(cx - 22 * s)} {f(by - 40 * s)} L{f(cx + 22 * s)} {f(by - 40 * s)}" stroke="{metal}" stroke-width="{f(2.4 * s)}"/>')
    bowl = f"M{f(cx - 34 * s)} {f(top)} Q{f(cx - 32 * s)} {f(top + 28 * s)} {f(cx)} {f(top + 30 * s)} Q{f(cx + 32 * s)} {f(top + 28 * s)} {f(cx + 34 * s)} {f(top)}Z"
    out.append(f'<path d="{bowl}" fill="{metal}" stroke="{dark}" stroke-width="{f(1.4 * s)}"/>')
    out.append(f'<ellipse cx="{f(cx)}" cy="{f(top)}" rx="{f(34 * s)}" ry="{f(5 * s)}" fill="{dark}"/>')
    for m in (-1, 1):
        out.append(f'<circle cx="{f(cx + m * 26 * s)}" cy="{f(top - 9 * s)}" r="{f(8 * s)}" fill="none" stroke="{metal}" stroke-width="{f(2.6 * s)}"/>')
    out.append(f'<path d="M{f(cx - 30 * s)} {f(top + 9 * s)} Q{f(cx)} {f(top + 16 * s)} {f(cx + 30 * s)} {f(top + 9 * s)}" fill="none" stroke="{dark}" stroke-width="{f(1 * s)}" opacity="0.6"/>')
    if flame:
        fy = top - 4 * s
        out.append(f'<ellipse cx="{f(cx)}" cy="{f(fy - 30 * s)}" rx="{f(60 * s)}" ry="{f(70 * s)}" fill="{card.rgrad("tri-fl-h", [(0, "#FFE7A0", 0.6), (0.4, "#FF9A3A", 0.25), (1, "#FF6A1A", 0)])}"/>')
        out.append(flame_shape(cx, fy, 26 * s, 64 * s, "#FF8A2A"))
        out.append(flame_shape(cx, fy, 17 * s, 46 * s, "#FFC94A"))
        out.append(flame_shape(cx, fy, 8 * s, 26 * s, "#FFF6D0"))
    return "".join(out)


def flame_shape(cx, by, w, h, color):
    return (f'<path d="M{f(cx - w)} {f(by)} C{f(cx - w * 1.2)} {f(by - h * 0.4)} {f(cx - w * 0.2)} {f(by - h * 0.5)} {f(cx - w * 0.3)} {f(by - h * 0.78)} '
            f'C{f(cx + w * 0.1)} {f(by - h * 0.6)} {f(cx + w * 0.3)} {f(by - h * 0.85)} {f(cx + w * 0.1)} {f(by - h)} '
            f'C{f(cx + w * 0.9)} {f(by - h * 0.7)} {f(cx + w * 1.3)} {f(by - h * 0.35)} {f(cx + w)} {f(by)}Z" fill="{color}"/>')


# ---------------------------------------------------------------- Pégase

def _bez3(p0, p1, p2, p3, t):
    u = 1 - t
    x = u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0]
    y = u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]
    return x, y


def feather(bx, by, tx, ty, wd, fill, dark, sw=0.8, rib=None):
    """Une rémige en capsule : base large, bout arrondi."""
    dx, dy = tx - bx, ty - by
    L = math.hypot(dx, dy) or 1
    ux, uy = dx / L, dy / L
    nx, ny = -uy, ux
    w0, w1 = wd * 0.5, wd * 0.42
    ex, ey = tx - ux * w1, ty - uy * w1
    d = (f"M{f(bx + nx * w0)} {f(by + ny * w0)} L{f(ex + nx * w1)} {f(ey + ny * w1)} "
         f"Q{f(tx + nx * w1)} {f(ty + ny * w1)} {f(tx + ux * w1 * 0.4)} {f(ty + uy * w1 * 0.4)} "
         f"Q{f(tx - nx * w1)} {f(ty - ny * w1)} {f(ex - nx * w1)} {f(ey - ny * w1)} L{f(bx - nx * w0)} {f(by - ny * w0)}Z")
    out = f'<path d="{d}" fill="{fill}" stroke="{dark}" stroke-width="{f(sw)}" stroke-linejoin="round"/>'
    if rib:
        out += f'<path d="M{f(bx)} {f(by)} L{f(ex)} {f(ey)}" stroke="{rib}" stroke-width="{f(sw * 0.8)}" opacity="0.55"/>'
    return out


def wing(cx, cy, s, fill, dark, light, flip=False, rot=0, rows=3, spread=1.0, n=14, lift=1.0, rib=True):
    """Une aile en faucille, à la manière archaïque : bord d'attaque qui monte et se recourbe, rémiges en capsules
    qui pendent vers l'arrière en trois rangs (primaires, secondaires, couvertures). Repère : l'aile monte vers
    l'arrière (la gauche) depuis l'attache (cx, cy) ; `flip` la tourne vers la droite."""
    m = -1 if flip else 1
    p0, p1, p2, p3 = (0, 0), (-12 * spread, -64 * lift), (-56 * spread, -116 * lift), (-112 * spread, -122 * lift)

    def P(px, py):
        return cx + m * px * s, cy + py * s

    out = []
    layers = ((1.0, fill, 17), (0.6, light, 15), (0.3, fill, 13))[:rows]
    for li, (k, col, wd0) in enumerate(layers):
        for i in range(n):
            t = i / (n - 1)
            bx, by = _bez3(p0, p1, p2, p3, t * 0.97)
            ang = -158 + 128 * t ** 0.85
            L = (30 + 78 * t ** 0.75) * k + 6
            tx, ty = pt(bx, by, L, ang)
            A, B = P(bx, by), P(tx, ty)
            out.append(feather(A[0], A[1], B[0], B[1], wd0 * s, col, dark, 0.8 * s, light if (rib and li == 0) else None))
    edge = [P(*_bez3(p0, p1, p2, p3, i / 30)) for i in range(31)]
    lead = "M" + " L".join(f"{f(a)} {f(b)}" for a, b in edge)
    out.append(f'<path d="{lead}" fill="none" stroke="{dark}" stroke-width="{f(12 * s)}" stroke-linecap="round"/>')
    out.append(f'<path d="{lead}" fill="none" stroke="{fill}" stroke-width="{f(9 * s)}" stroke-linecap="round"/>')
    out.append(f'<path d="{lead}" fill="none" stroke="{light}" stroke-width="{f(2.2 * s)}" stroke-linecap="round" opacity="0.85"/>')
    g = "".join(out)
    return f'<g transform="rotate({f(rot)} {f(cx)} {f(cy)})">{g}</g>' if rot else g


def horse(x, y, s, color, flip=False, wing_fill=None, wing_dark=None, wing_light=None, pose="gallop", stroke=None, sw=1.0):
    """Un cheval à la manière des frises classiques — encolure arquée, tête fine, poitrail puissant, jambes nerveuses —
    tourné vers la droite (repère : ~200 de long, origine au centre du corps). Avec `wing_fill`, c'est Pégase."""
    m = -1 if flip else 1

    def P(px, py):
        return (x + m * px * s, y + py * s)

    def path(pts):
        return smooth([P(a, b) for a, b in pts], closed=True)

    st = f' stroke="{stroke}" stroke-width="{f(sw * s)}" stroke-linejoin="round"' if stroke else ""
    out = []
    if wing_fill:
        wx, wy = P(10, -20)
        out.append(wing(wx, wy, s * 0.82, wing_fill, wing_dark, wing_light, flip=flip))
    if pose == "gallop":
        legs_back = [([(28, 10), (42, 28), (38, 44), (50, 50)], [13, 8, 5, 4]), ([(-28, 12), (-32, 32), (-44, 46), (-40, 58)], [16, 9, 5, 4])]
        legs_front = [([(38, 6), (58, 20), (76, 24), (92, 20)], [14, 8, 5, 4]), ([(-42, 8), (-60, 24), (-82, 32), (-98, 32)], [19, 9, 5, 4])]
    else:
        legs_back = [([(30, 6), (48, -2), (58, 10), (60, 20)], [13, 8, 5, 4]), ([(-28, 12), (-26, 36), (-36, 54), (-32, 66)], [16, 9, 5, 4])]
        legs_front = [([(38, 2), (54, -12), (68, -6), (72, 6)], [14, 8, 5, 4]), ([(-42, 10), (-46, 34), (-56, 52), (-52, 66)], [19, 9, 5, 4])]
    shade = "#000000"
    for pts, ws in legs_back:
        q = [P(a, b) for a, b in pts]
        out.append(f'<g opacity="0.88">{limb(q, [w * s for w in ws], color)}</g>')
        hx, hy = q[-1]
        out.append(f'<ellipse cx="{f(hx)}" cy="{f(hy)}" rx="{f(3.6 * s)}" ry="{f(2.8 * s)}" fill="{color}"/>')
    tail = [(-56, -12), (-74, -22), (-92, -14), (-104, 4), (-98, 22)]
    for k, w in enumerate((8, 5.5, 4)):
        pts = [P(a + k * 3, b + k * 7) for a, b in tail]
        out.append(f'<path d="{smooth(pts)}" fill="none" stroke="{color}" stroke-width="{f(w * s)}" stroke-linecap="round"/>')
    out.append(f'<path d="{path([(-58, -8), (-48, -22), (-22, -20), (6, -22), (28, -26), (44, -14), (48, 6), (34, 18), (6, 20), (-24, 18), (-48, 14), (-62, 2)])}" fill="{color}"{st}/>')
    out.append(f'<path d="{path([(18, -22), (30, -40), (44, -56), (56, -68), (68, -66), (64, -52), (56, -36), (50, -18), (48, 2), (34, 6)])}" fill="{color}"{st}/>')
    out.append(f'<path d="{path([(54, -70), (64, -78), (74, -72), (88, -56), (96, -46), (94, -38), (86, -38), (74, -46), (62, -54)])}" fill="{color}"{st}/>')
    e1, e2, e3 = P(58, -74), P(62, -88), P(68, -76)
    out.append(f'<path d="M{f(e1[0])} {f(e1[1])} L{f(e2[0])} {f(e2[1])} L{f(e3[0])} {f(e3[1])}Z" fill="{color}"/>')
    ex, ey = P(72, -62)
    out.append(f'<circle cx="{f(ex)}" cy="{f(ey)}" r="{f(1.6 * s)}" fill="{shade}" opacity="0.45"/>')
    mane = [(58, -72), (48, -64), (40, -54), (32, -42), (22, -30), (16, -24), (8, -28), (16, -36), (10, -40), (24, -48), (18, -54), (32, -60), (28, -66), (42, -70), (40, -76), (52, -78)]
    out.append(f'<path d="{path(mane)}" fill="{color}"{st}/>')
    for k in range(4):
        t = k / 3
        a, b = P(22 + 30 * t, -32 - 38 * t)
        c2 = P(14 + 30 * t, -34 - 38 * t)
        out.append(f'<path d="M{f(a)} {f(b)} L{f(c2[0])} {f(c2[1])}" stroke="{shade}" stroke-width="{f(0.8 * s)}" opacity="0.25"/>')
    for pts, ws in legs_front:
        q = [P(a, b) for a, b in pts]
        out.append(limb(q, [w * s for w in ws], color))
        hx, hy = q[-1]
        out.append(f'<ellipse cx="{f(hx)}" cy="{f(hy)}" rx="{f(3.8 * s)}" ry="{f(3 * s)}" fill="{color}"/>')
    return "".join(out)


def eagle(x, y, s, color, flip=False, light=None, dark=None, head_left=False):
    """L'aigle de Zeus en vol, ailes levées, à la manière des monnaies archaïques (repère : ~220 d'envergure)."""
    light = light or color
    dark = dark or color
    m = -1 if flip else 1
    out = []
    out.append(wing(x - 8 * s, y - 4 * s, s * 0.9, color, dark, light, flip=False, spread=1.0, lift=0.75))
    out.append(wing(x + 8 * s, y - 4 * s, s * 0.9, color, dark, light, flip=True, spread=1.0, lift=0.75))

    def P(px, py):
        return (x + m * px * s, y + py * s)

    out.append(f'<path d="{smooth([P(-11, -10), P(0, -16), P(11, -10), P(13, 14), P(6, 34), P(-6, 34), P(-13, 14)], closed=True)}" fill="{color}"/>')
    tail = [P(-6, 30), P(-20, 62), P(-8, 58), P(0, 66), P(8, 58), P(20, 62), P(6, 30)]
    out.append(f'<path d="M{" L".join(f"{f(a)} {f(b)}" for a, b in tail)}Z" fill="{color}" stroke="{dark}" stroke-width="{f(0.8 * s)}"/>')
    head = smooth([P(-7, -12), P(-4, -28), P(6, -32), P(16, -28), P(22, -22), P(14, -20), P(8, -12)], closed=True)
    out.append(f'<path d="{head}" fill="{color}"/>')
    bx, by = P(20, -23)
    out.append(f'<path d="M{f(bx)} {f(by - 3 * s)} q{f(m * 6 * s)} {f(1 * s)} {f(m * 4 * s)} {f(7 * s)} l{f(-m * 5 * s)} {f(-3 * s)}Z" fill="{dark}"/>')
    ex, ey = P(9, -26)
    out.append(f'<circle cx="{f(ex)}" cy="{f(ey)}" r="{f(1.8 * s)}" fill="{dark}"/>')
    for side in (-1, 1):
        a = P(side * 6, 32)
        b = P(side * 10, 44)
        out.append(f'<path d="M{f(a[0])} {f(a[1])} L{f(b[0])} {f(b[1])}" stroke="{color}" stroke-width="{f(3 * s)}" stroke-linecap="round"/>')
    return "".join(out)


def chariot(x, y, s, color, flip=False, wheel=None):
    """Le char d'Hélios : caisse, grande roue à rayons, timon (repère : la roue au centre)."""
    m = -1 if flip else 1
    wheel = wheel or color
    out = []
    r = 26 * s
    out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="none" stroke="{wheel}" stroke-width="{f(3.4 * s)}"/>')
    for k in range(8):
        a = 22.5 * k
        x2, y2 = pt(x, y, r, a)
        x1, y1 = pt(x, y, r, a + 180)
        out.append(f'<path d="M{f(x1)} {f(y1)} L{f(x2)} {f(y2)}" stroke="{wheel}" stroke-width="{f(1.6 * s)}"/>')
    out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(5 * s)}" fill="{wheel}"/>')
    box = f"M{f(x - m * 22 * s)} {f(y - 8 * s)} L{f(x - m * 24 * s)} {f(y - 40 * s)} Q{f(x)} {f(y - 30 * s)} {f(x + m * 22 * s)} {f(y - 16 * s)} L{f(x + m * 18 * s)} {f(y - 8 * s)}Z"
    out.append(f'<path d="{box}" fill="{color}"/>')
    out.append(f'<path d="M{f(x + m * 18 * s)} {f(y - 12 * s)} Q{f(x + m * 60 * s)} {f(y - 10 * s)} {f(x + m * 92 * s)} {f(y - 34 * s)}" fill="none" stroke="{color}" stroke-width="{f(3 * s)}" stroke-linecap="round"/>')
    return "".join(out)
