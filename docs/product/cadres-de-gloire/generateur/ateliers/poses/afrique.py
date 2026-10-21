"""La touche d'Afrique de l'atelier « poses » : l'étoffe kente et les Adinkra d'or, offerts à l'Ambassadeur.

Le kente est l'étoffe tissée en bandes étroites des Asante et des Ewe (Ghana, Togo) ; les Adinkra sont les
symboles imprimés des Akan. Ici, deux cadres seulement les portent, comme les présents d'un pays hôte.
"""

import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "lib"))

from base import f, pt  # noqa: E402

K_GOLD = "#F2B632"
K_GOLD_HI = "#FFE07A"
K_GREEN = "#1E7A3A"
K_GREEN_D = "#0E4A22"
K_RED = "#C8281E"
K_BLACK = "#15100A"
K_BLUE = "#1C3F8C"


def kente_block(x, y, w, h, kind):
    """Un bloc de tissage : `kind` choisit le motif (rayures de chaîne, damier, losange, échelle)."""
    out = []
    if kind == "gold":
        out.append(f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="{K_GOLD}"/>')
        for i in range(1, 4):
            yy = y + h * i / 4
            out.append(f'<line x1="{f(x)}" y1="{f(yy)}" x2="{f(x + w)}" y2="{f(yy)}" stroke="{K_BLACK}" stroke-width="0.9" opacity="0.75"/>')
        out.append(f'<rect x="{f(x + w * 0.38)}" y="{f(y)}" width="{f(w * 0.24)}" height="{f(h)}" fill="{K_GREEN}"/>')
    elif kind == "green":
        out.append(f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="{K_GREEN}"/>')
        out.append(f'<rect x="{f(x + w * 0.2)}" y="{f(y)}" width="{f(w * 0.12)}" height="{f(h)}" fill="{K_GOLD}"/>')
        out.append(f'<rect x="{f(x + w * 0.68)}" y="{f(y)}" width="{f(w * 0.12)}" height="{f(h)}" fill="{K_GOLD}"/>')
    elif kind == "check":
        n = 4
        cw, ch = w / n, h / n
        for i in range(n):
            for j in range(n):
                col = K_GOLD if (i + j) % 2 == 0 else K_BLACK
                out.append(f'<rect x="{f(x + i * cw)}" y="{f(y + j * ch)}" width="{f(cw + 0.2)}" height="{f(ch + 0.2)}" fill="{col}"/>')
    elif kind == "red":
        out.append(f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="{K_RED}"/>')
        cx, cy = x + w / 2, y + h / 2
        out.append(f'<path d="M{f(cx)} {f(y + h * 0.12)} L{f(x + w * 0.86)} {f(cy)} L{f(cx)} {f(y + h * 0.88)} L{f(x + w * 0.14)} {f(cy)} Z" fill="{K_GOLD}"/>')
        out.append(f'<path d="M{f(cx)} {f(y + h * 0.34)} L{f(x + w * 0.64)} {f(cy)} L{f(cx)} {f(y + h * 0.66)} L{f(x + w * 0.36)} {f(cy)} Z" fill="{K_BLACK}"/>')
    elif kind == "black":
        out.append(f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="{K_BLACK}"/>')
        for i in range(1, 6):
            xx = x + w * i / 6
            out.append(f'<line x1="{f(xx)}" y1="{f(y)}" x2="{f(xx)}" y2="{f(y + h)}" stroke="{K_GOLD}" stroke-width="0.9"/>')
    return "".join(out)


KENTE_SEQ = ["gold", "black", "red", "green", "check", "gold", "green", "black", "red", "check"]


def kente_band_along(c, x0, x1, y_of, t0, t1, block=13, seed=0):
    """Une lisière de kente qui suit une courbe : y_of(x) donne le haut de la lisière, t0..t1 son épaisseur."""
    out = []
    n = int((x1 - x0) // block)
    step = (x1 - x0) / n
    for i in range(n):
        xa, xb = x0 + i * step, x0 + (i + 1) * step
        kind = KENTE_SEQ[(i + seed) % len(KENTE_SEQ)]
        ya, yb = y_of(xa), y_of(xb)
        # le bloc est dessiné droit puis cisaillé pour suivre la pente locale
        shear = (yb - ya) / step
        out.append(
            f'<g transform="matrix(1 {shear:.5f} 0 1 0 {ya - shear * xa:.3f})">{kente_block(xa, t0, step + 0.3, t1 - t0, kind)}</g>'
        )
    return "".join(out)


def kente_pattern(c, name="kente-pat", size=26, rot=0):
    """Un motif de kente en tuile, pour les queues de la banderole."""
    s = size
    tile = (
        kente_block(0, 0, s / 2, s / 2, "gold") + kente_block(s / 2, 0, s / 2, s / 2, "red")
        + kente_block(0, s / 2, s / 2, s / 2, "green") + kente_block(s / 2, s / 2, s / 2, s / 2, "check")
    )
    c.def_once(
        name,
        f'<pattern id="{c.id(name)}" patternUnits="userSpaceOnUse" width="{s}" height="{s}" patternTransform="rotate({rot})">{tile}</pattern>',
    )
    return f"url(#{c.id(name)})"


# ---------------------------------------------------------------- Adinkra d'or

def akoma_ntoaso(cx, cy, s, fill, edge, w=1.0):
    """Akoma ntoaso - les cœurs liés : l'entente, l'unité de ceux qui s'accordent.

    Quatre cœurs dont les pointes se rejoignent sur un anneau central, aux quatre diagonales."""
    out = []
    for a in (45, 135, 225, 315):
        hx, hy = pt(cx, cy, 14.5 * s, a)
        d = (
            f"M0 {f(8 * s)} C{f(-10 * s)} {f(1 * s)} {f(-9 * s)} {f(-9 * s)} 0 {f(-4 * s)} "
            f"C{f(9 * s)} {f(-9 * s)} {f(10 * s)} {f(1 * s)} 0 {f(8 * s)} Z"
        )
        out.append(f'<path transform="translate({f(hx)} {f(hy)}) rotate({f(a)})" d="{d}" fill="{fill}" stroke="{edge}" stroke-width="{f(0.7 * w)}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(5.2 * s)}" fill="none" stroke="{fill}" stroke-width="{f(2.8 * s)}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(6.6 * s)}" fill="none" stroke="{edge}" stroke-width="{f(0.6 * w)}" opacity="0.8"/>')
    return "".join(out)


def nkonsonkonson(x0, x1, cy, s, color, w=1.6):
    """Nkonsonkonson - les maillons de la chaîne : nous sommes liés, dans la vie comme dans la mort.

    Une chaîne horizontale de maillons ovales, alternativement de face et de chant."""
    out = []
    link = 13 * s
    n = int((x1 - x0) // (link * 0.78))
    span = n * link * 0.78
    x = x0 + ((x1 - x0) - span) / 2 + link * 0.39
    for i in range(n):
        if i % 2 == 0:
            out.append(f'<ellipse cx="{f(x)}" cy="{f(cy)}" rx="{f(link * 0.5)}" ry="{f(link * 0.3)}" fill="none" stroke="{color}" stroke-width="{f(w)}"/>')
        else:
            out.append(f'<ellipse cx="{f(x)}" cy="{f(cy)}" rx="{f(link * 0.5)}" ry="{f(link * 0.1)}" fill="{color}"/>')
        x += link * 0.78
    return "".join(out)


def gold_flecks(x0, y0, x1, y1, n, seed, color="#F5D27A"):
    """Les paillettes de pyrite du lapis-lazuli."""
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        r = rnd.uniform(0.35, 1.1)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{color}" opacity="{f(rnd.uniform(0.25, 0.8))}"/>')
    return "".join(out)
