"""Aurores du Nord - les éclats d'Afrique fondus dans le Nord : la case-obus Musgum (Cameroun, Tchad) poudrée
de neige, le baobab sous le givre. Créations originales inspirées de l'architecture de terre et des paysages."""

import math
import random

from base import W, H, f, pt
from kit import smooth, ublur, texture_filter, bevel
from motifs import grow


def obus_radius(y, base_y, apex_y, rmax, k=1.7, p=0.95):
    u = min(1.0, max(0.0, (base_y - y) / (base_y - apex_y)))
    return rmax * (1 - u ** k) ** p


def obus_outline(cx, base_y, apex_y, rmax, n=40, k=1.7, p=0.95):
    ys = [base_y - (base_y - apex_y) * (i / n) for i in range(n + 1)]
    left = [(cx - obus_radius(y, base_y, apex_y, rmax, k, p), y) for y in ys]
    right = [(cx + obus_radius(y, base_y, apex_y, rmax, k, p), y) for y in ys[::-1]]
    pts = left[:-1] + [(cx, apex_y)] + right[1:]
    return smooth(pts) + " Z", pts


def case_obus(card, name, cx, base_y, apex_y, rmax, seed=5, earth=("#D08A52", "#9A5228", "#3E1A0A"),
              snow="#F4FBFF", rim_c="#7CFFD0", warm="#FFB86A", cols=13, rows=None, k=1.7, p=0.95, skip=None):
    """La case-obus des Musgum : un dôme de terre en ogive, couvert de reliefs en chevrons alignés sur les
    méridiens (les marches qui servent à grimper), chaque relief coiffé de neige. Repère : centre de la base.
    `skip(x, y)` -> True pour ne pas poser de relief (devant la porte)."""
    rnd = random.Random(seed)
    hi, mid, lo = earth
    d, outline = obus_outline(cx, base_y, apex_y, rmax, 48, k, p)
    body = card.grad(name + "-body", [(0, lo), (0.16, mid), (0.42, hi), (0.62, mid), (0.88, lo), (1, "#1A0904")], 0, 0, 1, 0)
    out = [f'<path d="{d}" fill="{body}"/>']
    out.append(f'<path d="{d}" fill="#E8B07A" opacity="0.22" filter="{texture_filter(card, name + "-tx", "0.05 0.09", seed, 5, "#FFE8CC", 1.25, 4, 210, 42)}"/>')
    shade = card.rgrad(name + "-sh", [(0, "#FFD8A8", 0.28), (0.5, "#FFD8A8", 0.05), (1, "#000000", 0)], 0.36, 0.3, 0.7)
    out.append(f'<path d="{d}" fill="{shade}"/>')
    vert = card.grad(name + "-v", [(0, "#000000"), (0.55, "#000000"), (1, "#000000")])
    out.append(f'<path d="{d}" fill="{card.grad(name + "-dk", [(0, "#120604"), (0.5, "#120604"), (1, "#120604")])}" opacity="0"/>')
    rows = rows or int((base_y - apex_y) / 23)
    ribs, chev_sh, chev, chev_hi, caps = [], [], [], [], []
    for j in range(cols):
        phi = -78 + 156 * j / (cols - 1)
        sphi = math.sin(math.radians(phi))
        cphi = math.cos(math.radians(phi))
        pts = []
        for i in range(rows + 1):
            y = base_y - (base_y - apex_y) * 0.97 * i / rows
            pts.append((cx + obus_radius(y, base_y, apex_y, rmax, k, p) * sphi, y))
        ribs.append(smooth(pts))
        for i in range(1, rows):
            t = i / rows
            y = base_y - (base_y - apex_y) * 0.97 * (i + 0.5) / rows
            R = obus_radius(y, base_y, apex_y, rmax, k, p)
            x = cx + R * sphi
            if skip and skip(x, y):
                continue
            s = cphi * (0.45 + 0.55 * (R / rmax) ** 0.5)
            if s < 0.18:
                continue
            ww = 13.5 * s
            hh = 12 * (0.7 + 0.3 * (R / rmax))
            d_c = f"M{f(x - ww)} {f(y + hh * 0.45)} L{f(x)} {f(y - hh * 0.55)} L{f(x + ww)} {f(y + hh * 0.45)} L{f(x + ww * 0.55)} {f(y + hh * 0.5)} L{f(x)} {f(y - hh * 0.05)} L{f(x - ww * 0.55)} {f(y + hh * 0.5)} Z"
            chev_sh.append(f'<path d="{d_c}" transform="translate(2.2 3.2)"/>')
            chev.append(f'<path d="{d_c}"/>')
            chev_hi.append(f"M{f(x - ww)} {f(y + hh * 0.45)} L{f(x)} {f(y - hh * 0.55)}")
            if rnd.random() < 0.82:
                caps.append(f'<path d="M{f(x - ww * 0.62)} {f(y + hh * 0.02)} Q{f(x)} {f(y - hh * 0.95)} {f(x + ww * 0.62)} {f(y + hh * 0.02)} Q{f(x)} {f(y - hh * 0.3)} {f(x - ww * 0.62)} {f(y + hh * 0.02)} Z"/>')
    out.append(f'<g fill="none" stroke="#2A0E04" stroke-width="2.4" opacity="0.35">{"".join(f"<path d=\"{r}\"/>" for r in ribs)}</g>')
    out.append(f'<g fill="none" stroke="#F0B07A" stroke-width="0.8" opacity="0.28" transform="translate(-1 0)">{"".join(f"<path d=\"{r}\"/>" for r in ribs)}</g>')
    out.append(f'<g fill="#140602" opacity="0.7" filter="{ublur(card, name + "-csb", 0.9)}">{"".join(chev_sh)}</g>')
    chev_g = card.grad(name + "-cg", [(0, "#F2B57A"), (0.5, "#B86A36"), (1, "#5A2810")], 0, 0, 0, 1)
    out.append(f'<g fill="{chev_g}" stroke="#2A0E04" stroke-width="0.7">{"".join(chev)}</g>')
    out.append(f'<path d="{" ".join(chev_hi)}" fill="none" stroke="#FFE8CC" stroke-width="1.1" opacity="0.85"/>')
    out.append(f'<g fill="{snow}" opacity="0.92">{"".join(caps)}</g>')
    cyl = card.grad(name + "-cyl", [(0, "#0A0302"), (0.14, "#0A0302"), (0.3, "#0A0302"), (0.7, "#0A0302"), (0.86, "#0A0302"), (1, "#0A0302")], 0, 0, 1, 0)
    cylm = card.def_once(name + "-cylg", f'<linearGradient id="{card.id(name + "-cylg")}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0A0302" stop-opacity="0.85"/><stop offset="0.2" stop-color="#0A0302" stop-opacity="0.35"/><stop offset="0.42" stop-color="#0A0302" stop-opacity="0"/><stop offset="0.66" stop-color="#0A0302" stop-opacity="0.1"/><stop offset="0.84" stop-color="#0A0302" stop-opacity="0.5"/><stop offset="1" stop-color="#0A0302" stop-opacity="0.9"/></linearGradient>')
    out.append(f'<path d="{d}" fill="{cylm}"/>')
    clip = card.id(name + "-clip")
    card.def_once(name + "-clip", f'<clipPath id="{clip}"><path d="{d}"/></clipPath>')
    out.append(f'<g clip-path="url(#{clip})"><path d="{d}" fill="none" stroke="{rim_c}" stroke-width="16" opacity="0.5" filter="{ublur(card, name + "-rb", 7)}" transform="translate(-4 -2)"/></g>')
    out.append(f'<path d="{d}" fill="none" stroke="{rim_c}" stroke-width="1.6" opacity="0.75"/>')
    cap = f"M{f(cx - 34)} {f(apex_y + 40)} Q{f(cx - 14)} {f(apex_y - 4)} {f(cx)} {f(apex_y - 3)} Q{f(cx + 14)} {f(apex_y - 4)} {f(cx + 34)} {f(apex_y + 40)} Q{f(cx)} {f(apex_y + 26)} {f(cx - 34)} {f(apex_y + 40)} Z"
    out.append(f'<path d="{cap}" fill="{snow}" opacity="0.95"/>')
    return "".join(out), d, outline


def baobab_frost(card, name, x, y, h, seed=8, bark=("#3A2A22", "#140C08"), frost="#EAF6FF", rim_c="#7CFFD0", w=None):
    """Un baobab au givre : tronc-bouteille cannelé, couronne de branches trapues qui ressemblent à des racines,
    chaque branche ourlée de givre, liseré d'aurore. Repère : pied du tronc."""
    rnd = random.Random(seed)
    w = w or h * 0.34
    top = y - h * 0.6
    trunk = (f"M{f(x - w * 0.56)} {f(y)} C{f(x - w * 0.66)} {f(y - h * 0.22)} {f(x - w * 0.58)} {f(y - h * 0.44)} {f(x - w * 0.3)} {f(top)} "
             f"Q{f(x)} {f(top - h * 0.03)} {f(x + w * 0.3)} {f(top)} C{f(x + w * 0.58)} {f(y - h * 0.44)} {f(x + w * 0.68)} {f(y - h * 0.22)} {f(x + w * 0.58)} {f(y)} Z")
    g = card.grad(name + "-g", [(0, bark[1]), (0.3, bark[0]), (0.55, bark[1]), (1, "#05030A")], 0, 0, 1, 0)
    branches, tips = [], []
    for kk in range(8):
        a = -78 + kk * 22 + rnd.uniform(-5, 5)
        sx = x + (kk - 3.5) * w * 0.08
        grow(rnd, sx, top + 6, a, h * rnd.uniform(0.17, 0.25), w * 0.15, 3, spread=38, decay=0.62, wdecay=0.6, bend=12,
             out=branches, tips=tips, min_w=0.9, kids=(2, 3))
    bd = " ".join(branches)
    flutes = "".join(f'<path d="M{f(x + dx * w)} {f(y - 4)} C{f(x + dx * w * 1.05)} {f(y - h * 0.25)} {f(x + dx * w * 0.8)} {f(y - h * 0.45)} {f(x + dx * w * 0.5)} {f(top + 6)}" fill="none" stroke="#000000" stroke-width="1.6" opacity="0.35"/>'
                     for dx in (-0.36, -0.16, 0.04, 0.24, 0.42))
    out = [f'<path d="{trunk}" fill="{g}"/>{flutes}',
           f'<path d="{bd}" fill="{bark[1]}"/>',
           f'<path d="{bd}" fill="none" stroke="{frost}" stroke-width="0.9" opacity="0.55" transform="translate(-0.6 -1)"/>',
           f'<path d="{trunk}" fill="none" stroke="{rim_c}" stroke-width="1.4" opacity="0.6" transform="translate(-1 0)"/>']
    out.append("".join(f'<ellipse cx="{f(tx)}" cy="{f(ty - 1)}" rx="2.8" ry="1.3" fill="{frost}" opacity="0.9"/>' for tx, ty, _ in tips))
    out.append(f'<path d="M{f(x - w * 0.32)} {f(top + 2)} Q{f(x)} {f(top - 8)} {f(x + w * 0.32)} {f(top + 2)} Q{f(x)} {f(top + 4)} {f(x - w * 0.32)} {f(top + 2)} Z" fill="{frost}" opacity="0.9"/>')
    return "".join(out), tips
