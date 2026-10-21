"""Atelier « Trésor » — la banque : acier brossé, porte de chambre forte, volant, cadran, pênes, lingots,
colonnes, fronton, marches de marbre, projecteurs."""

import math
import random

from kit import (
    W, H, f, pt, esc, lg, rg, metal_lin, cyl_grad, bevel, noise, veins, soft, glint, halo, coin_use, signature_bars,
    grp, poly, clip, circle_path, ellipse_path, GOLD, GOLD_RICH, BRASS, STEEL, CHROME, CINZEL, SANS,
)

DARKSTEEL = ("#C9D2DC", "#6B7684", "#1E242C")


# ---------------------------------------------------------------- matières


def brushed(card, d, key="bs", m=STEEL, x1=0, y1=0, x2=1, y2=0.35, bands=2, streak="0.0025 0.7", seed=5, op=0.45):
    """Acier brossé : dégradé métallique à bandes + stries fines."""
    g = metal_lin(card, key + "-g", m, x1, y1, x2, y2, bands)
    st = noise(card, key + "-st", streak, 2, seed, (0.12, 0.14, 0.17), 1.5, -0.55)
    return f'<path d="{d}" fill="{g}"/><path d="{d}" fill="#000000" opacity="{f(op)}" filter="{st}"/>'


def lathe(cx, cy, r0, r1, step=2.4, color="#FFFFFF", op=0.08, sy=1.0):
    """Les cercles de tournage d'une face usinée."""
    out = []
    r = r0
    k = 0
    while r < r1:
        out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r)}" ry="{f(r * sy)}" fill="none" stroke="{color if k % 2 else "#000000"}" stroke-width="0.7" opacity="{f(op)}"/>')
        r += step
        k += 1
    return "".join(out)


def sheen_disc(card, key, cx, cy, r, sy=1.0, op=0.55):
    """Le reflet en « papillon » d'une face tournée (deux secteurs clairs opposés)."""
    g = rg(card, key, [(0, "#FFFFFF", op), (1, "#FFFFFF", 0)], 0.5, 0.5, 0.5)
    out = []
    for a in (-35, 145):
        x1, y1 = pt(cx, cy, r, a - 16)
        x2, y2 = pt(cx, cy, r, a + 16)
        out.append(f'<path d="M{f(cx)} {f(cy)} L{f(x1)} {f(cy + (y1 - cy) * sy)} A{f(r)} {f(r * sy)} 0 0 1 {f(x2)} {f(cy + (y2 - cy) * sy)} Z" fill="{g}"/>')
    return f'<g filter="{soft(card, r * 0.06)}">{"".join(out)}</g>'


def rivet_row(card, points, r=3.0, m=STEEL, key="rvs"):
    g = rg(card, key, [(0, "#FFFFFF"), (0.35, m[0]), (0.75, m[1]), (1, m[2])], 0.35, 0.3, 0.7)
    return "".join(
        f'<circle cx="{f(x + r * 0.3)}" cy="{f(y + r * 0.45)}" r="{f(r * 1.05)}" fill="#000000" opacity="0.55"/>'
        f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{g}"/>'
        for x, y in points
    )


def hexbolt(card, x, y, r=6, m=STEEL, key="hb", rot=0):
    g = lg(card, key, [(0, m[0]), (0.5, m[1]), (1, m[2])], 0, 0, 1, 1)
    pts = [pt(x, y, r, rot + 30 + 60 * i) for i in range(6)]
    return (f'<path d="{poly([(px + 1, py + 1.6) for px, py in pts])}" fill="#000000" opacity="0.55"/>'
            f'<path d="{poly(pts)}" fill="{g}" stroke="{m[2]}" stroke-width="0.6"/>'
            f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.55)}" fill="none" stroke="{m[0]}" stroke-width="0.8" opacity="0.8"/>')


# ---------------------------------------------------------------- pêne, volant, cadran


def bolt_h(card, x, y, L, r, key="pn", m=CHROME, cap="right"):
    """Un pêne cylindrique horizontal (chromé), embout arrondi."""
    g = cyl_grad(card, key, m, horizontal=True)
    x0, x1 = (x, x + L) if cap == "right" else (x - L, x)
    endx = x1 if cap == "right" else x0
    return (f'<rect x="{f(x0)}" y="{f(y - r + 2)}" width="{f(L)}" height="{f(2 * r)}" rx="{f(r)}" fill="#000000" opacity="0.5" filter="{soft(card, 2)}"/>'
            f'<rect x="{f(x0)}" y="{f(y - r)}" width="{f(L)}" height="{f(2 * r)}" rx="{f(r * 0.4)}" fill="{g}"/>'
            f'<ellipse cx="{f(endx)}" cy="{f(y)}" rx="{f(r * 0.45)}" ry="{f(r)}" fill="{g}" stroke="{m[2]}" stroke-width="0.5"/>')


def bolt_v(card, x, y, L, r, key="pnv", m=CHROME, cap="down"):
    g = cyl_grad(card, key, m)
    y0, y1 = (y, y + L) if cap == "down" else (y - L, y)
    endy = y1 if cap == "down" else y0
    return (f'<rect x="{f(x - r + 1.5)}" y="{f(y0 + 2)}" width="{f(2 * r)}" height="{f(L)}" rx="{f(r * 0.4)}" fill="#000000" opacity="0.5" filter="{soft(card, 2)}"/>'
            f'<rect x="{f(x - r)}" y="{f(y0)}" width="{f(2 * r)}" height="{f(L)}" rx="{f(r * 0.4)}" fill="{g}"/>'
            f'<ellipse cx="{f(x)}" cy="{f(endy)}" rx="{f(r)}" ry="{f(r * 0.45)}" fill="{g}" stroke="{m[2]}" stroke-width="0.5"/>')


def handwheel(card, cx, cy, r, spokes=5, key="hw", m=CHROME, rot=0.0, sx=1.0, rim=False):
    """Le volant de la porte : rayons chromés effilés, boules aux extrémités, moyeu."""
    hi, mid, lo = m
    g = lg(card, key + "-g", [(0, lo), (0.35, mid), (0.5, "#FFFFFF"), (0.65, mid), (1, lo)], 0, 0, 0, 1)
    ball = rg(card, key + "-b", [(0, "#FFFFFF"), (0.3, hi), (0.75, mid), (1, lo)], 0.35, 0.3, 0.7)
    bv = bevel(card, key + "-bv", 1.0, 3.0, 1.2, 26, shadow=(2, 5, 4, 0.6))
    parts = []
    if rim:
        parts.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 0.82 * sx)}" ry="{f(r * 0.82)}" fill="none" stroke="{mid}" stroke-width="{f(r * 0.07)}"/>')
    for i in range(spokes):
        a = rot + 360 * i / spokes
        L = r * 0.86
        w0, w1 = r * 0.075, r * 0.045
        shape = f"M0 {f(-w0)} L{f(L)} {f(-w1)} L{f(L)} {f(w1)} L0 {f(w0)} Z"
        parts.append(f'<g transform="translate({f(cx)} {f(cy)}) scale({f(sx)} 1) rotate({f(a - 90)})"><path d="{shape}" fill="{g}"/>'
                     f'<circle cx="{f(L + r * 0.06)}" cy="0" r="{f(r * 0.12)}" fill="{ball}"/></g>')
    parts.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 0.24 * sx)}" ry="{f(r * 0.24)}" fill="{ball}"/>')
    parts.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 0.15 * sx)}" ry="{f(r * 0.15)}" fill="none" stroke="{lo}" stroke-width="{f(r * 0.02)}"/>')
    return f'<g filter="{bv}">{"".join(parts)}</g>'


def dial_ring(card, cx, cy, r0, r1, key="dl", m=CHROME, face="#0E1116", numbers=True, ink="#E9EEF5", marker="#E8B53C"):
    """La couronne du cadran à chiffres : bezel chromé moleté, graduations 0–99, chiffres, index doré."""
    hi, mid, lo = m
    bz = metal_lin(card, key + "-bz", m, 0, 0, 1, 1, 2)
    bv = bevel(card, key + "-bv", 1.0, 3.0, 1.1, 24, shadow=(0, 4, 4, 0.6))
    out = [f'<g filter="{bv}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r1)}" fill="{bz}"/></g>']
    knurl = "".join(
        f'<line x1="{f(pt(cx, cy, r1 - 0.5, a)[0])}" y1="{f(pt(cx, cy, r1 - 0.5, a)[1])}" x2="{f(pt(cx, cy, r1 - r1 * 0.06, a)[0])}" y2="{f(pt(cx, cy, r1 - r1 * 0.06, a)[1])}" stroke="{lo}" stroke-width="1" opacity="0.6"/>'
        for a in range(0, 360, 4)
    )
    out.append(knurl)
    rf = r1 * 0.92
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(rf)}" fill="{face}"/>')
    ticks = []
    for i in range(100):
        a = i * 3.6
        L = (rf - r0) * (0.42 if i % 10 == 0 else 0.26 if i % 5 == 0 else 0.15)
        x1, y1 = pt(cx, cy, rf - 1.5, a)
        x2, y2 = pt(cx, cy, rf - 1.5 - L, a)
        ticks.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{ink}" stroke-width="{1.4 if i % 10 == 0 else 0.8}"/>')
    out.append("".join(ticks))
    if numbers:
        fs = (rf - r0) * 0.34
        for i in range(0, 100, 10):
            a = i * 3.6
            tx, ty = pt(cx, cy, rf - (rf - r0) * 0.68, a)
            out.append(f'<text x="{f(tx)}" y="{f(ty + fs * 0.36)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="{f(fs)}" fill="{ink}" transform="rotate({f(a)} {f(tx)} {f(ty)})">{i}</text>')
    mx, my = pt(cx, cy, r1 + 2, 0)
    out.append(f'<path d="M{f(mx - 7)} {f(my - 12)} L{f(mx + 7)} {f(my - 12)} L{f(mx)} {f(my + 1)} Z" fill="{marker}" stroke="#7A4A0A" stroke-width="0.8"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r0)}" fill="{lo}" opacity="0.9"/>')
    return "".join(out)


# ---------------------------------------------------------------- porte de chambre forte


def vault_face(card, cx, cy, R, key="vf", m=STEEL, sx=1.0, bolts=12, mech=False, seed=3):
    """La face d'une porte ronde (vue de face si sx=1, de biais si sx<1) : tôle tournée, couronne de boulons,
    et, si `mech`, le mécanisme visible derrière une vitre (engrenage central, bielles vers chaque pêne)."""
    hi, mid, lo = m
    d = ellipse_path(cx, cy, R * sx, R)
    out = [brushed(card, d, key + "-f", m, 0, 0, 1, 0.6, 2, "0.003 0.5", seed, 0.35)]
    out.append(lathe(cx, cy, R * 0.1, R * 0.98, 3.2, "#FFFFFF", 0.1, 1) if sx == 1 else "")
    out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(R * 0.86 * sx)}" ry="{f(R * 0.86)}" fill="none" stroke="{lo}" stroke-width="{f(R * 0.025)}" opacity="0.7"/>')
    out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(R * 0.875 * sx)}" ry="{f(R * 0.875)}" fill="none" stroke="{hi}" stroke-width="{f(R * 0.008)}" opacity="0.7"/>')
    for i in range(bolts):
        a = 360 * i / bolts + 180 / bolts
        bx, by = pt(0, 0, R * 0.93, a)
        out.append(hexbolt(card, cx + bx * sx, cy + by, R * 0.035, m, key + "-hb"))
    if mech:
        glass = ellipse_path(cx, cy, R * 0.8 * sx, R * 0.8)
        out.append(f'<path d="{glass}" fill="#0A0D12" opacity="0.75"/>')
        gm = metal_lin(card, key + "-br", BRASS, 0, 0, 1, 1)
        bvm = bevel(card, key + "-bvm", 0.8, 2.2, 1.0, 20, shadow=(1, 2, 2, 0.6))
        mech_parts = []
        n = 8
        for i in range(n):
            a = 360 * i / n
            x1, y1 = pt(0, 0, R * 0.2, a)
            x2, y2 = pt(0, 0, R * 0.66, a)
            mech_parts.append(f'<line x1="{f(cx + x1 * sx)}" y1="{f(cy + y1)}" x2="{f(cx + x2 * sx)}" y2="{f(cy + y2)}" stroke="{gm}" stroke-width="{f(R * 0.05)}" stroke-linecap="round"/>')
            mech_parts.append(f'<ellipse cx="{f(cx + x2 * sx)}" cy="{f(cy + y2)}" rx="{f(R * 0.06 * sx)}" ry="{f(R * 0.06)}" fill="{gm}"/>')
        cog = []
        teeth = 18
        for i in range(teeth * 2):
            a = 360 * i / (teeth * 2)
            rr = R * (0.26 if i % 2 == 0 else 0.22)
            x, y = pt(0, 0, rr, a)
            cog.append((cx + x * sx, cy + y))
        mech_parts.append(f'<path d="{poly(cog)}" fill="{gm}"/>')
        mech_parts.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(R * 0.1 * sx)}" ry="{f(R * 0.1)}" fill="#3A2A10"/>')
        out.append(f'<g filter="{bvm}">{"".join(mech_parts)}</g>')
        gl = lg(card, key + "-gl", [(0, "#FFFFFF", 0.22), (0.4, "#FFFFFF", 0.02), (0.55, "#FFFFFF", 0.12), (1, "#FFFFFF", 0)], 0, 0, 1, 1)
        out.append(f'<path d="{glass}" fill="{gl}"/>')
        out.append(f'<path d="{glass}" fill="none" stroke="{hi}" stroke-width="{f(R * 0.012)}" opacity="0.8"/>')
    return "".join(out)


def open_door(card, cx, cy, R, sx=0.32, thick=34, key="od", m=STEEL, bolts=10, seed=4):
    """La porte ronde ouverte, vue presque de profil : son épaisseur, sa face intérieure (mécanisme sous vitre),
    et la couronne de pênes qui dépassent de sa tranche."""
    hi, mid, lo = m
    out = []
    ed = lg(card, key + "-ed", [(0, lo), (0.3, mid), (0.55, hi), (0.8, mid), (1, lo)], 0, 0, 0, 1)
    out.append(f'<ellipse cx="{f(cx + thick * 0.6)}" cy="{f(cy + 10)}" rx="{f(R * sx + thick)}" ry="{f(R + 6)}" fill="#000000" opacity="0.55" filter="{soft(card, 12)}"/>')
    bl = []
    g = cyl_grad(card, key + "-bl", CHROME, horizontal=True)
    for i in range(bolts):
        a = 180 + (i + 0.5) * 180 / bolts
        x, y = pt(0, 0, R * 0.9, a)
        x2, y2 = pt(0, 0, R * 1.16, a)
        bx, by = cx + x * sx, cy + y
        ex, ey = cx + x2 * sx - 6, cy + y2
        L = math.hypot(ex - bx, ey - by)
        ang = math.degrees(math.atan2(ey - by, ex - bx))
        bl.append(f'<g transform="translate({f(bx)} {f(by)}) rotate({f(ang)})"><rect x="0" y="-6.5" width="{f(L)}" height="13" rx="3" fill="{g}"/>'
                  f'<ellipse cx="{f(L)}" cy="0" rx="3" ry="6.5" fill="{g}" stroke="{CHROME[2]}" stroke-width="0.5"/></g>')
    band = (f"M{f(cx)} {f(cy - R)} L{f(cx + thick)} {f(cy - R)} A{f(R * sx)} {f(R)} 0 0 1 {f(cx + thick)} {f(cy + R)} "
            f"L{f(cx)} {f(cy + R)} A{f(R * sx)} {f(R)} 0 0 0 {f(cx)} {f(cy - R)} Z")
    out.append(f'<path d="{band}" fill="{ed}"/>')
    ring_lines = "".join(
        f'<path d="M{f(cx + k)} {f(cy - R)} A{f(R * sx)} {f(R)} 0 0 1 {f(cx + k)} {f(cy + R)}" fill="none" stroke="{lo if j % 2 else hi}" stroke-width="0.8" opacity="0.45"/>'
        for j, k in enumerate(range(6, int(thick), 6))
    )
    out.append(ring_lines)
    out.append("".join(bl))
    out.append(vault_face(card, cx, cy, R, key + "-face", m, sx, 12, mech=True, seed=seed))
    out.append(handwheel(card, cx, cy, R * 0.34, 3, key + "-hw", CHROME, 20, sx * 1.3))
    return "".join(out)


# ---------------------------------------------------------------- lingots


def lingot(card, x, y, w=64, h=16, d=26, key="lg", m=GOLD_RICH, stamp=True, rot=0.0):
    """Un lingot vu de trois quarts : face avant trapézoïdale, dessus frappé, flanc ; (x, y) = milieu du bas avant."""
    hi, mid, lo = m
    t = h * 0.5
    dx, dy = d * 0.55, -d * 0.45
    fa = [(x - w / 2, y), (x + w / 2, y), (x + w / 2 - t, y - h), (x - w / 2 + t, y - h)]
    top = [(x - w / 2 + t, y - h), (x + w / 2 - t, y - h), (x + w / 2 - t + dx * 0.8, y - h + dy * 0.8), (x - w / 2 + t + dx * 0.8, y - h + dy * 0.8)]
    side = [(x + w / 2, y), (x + w / 2 + dx, y + dy), (x + w / 2 - t + dx * 0.8, y - h + dy * 0.8), (x + w / 2 - t, y - h)]
    gf = lg(card, key + "-f", [(0, mid), (0.5, lo), (1, "#5A3606")], 0, 0, 0, 1)
    gt = lg(card, key + "-t", [(0, "#FFFFFF"), (0.25, hi), (0.6, mid), (1, hi)], 0, 0, 1, 0.4)
    gs = lg(card, key + "-s", [(0, mid), (1, lo)], 0, 0, 1, 0)
    out = [f'<path d="{poly(fa)}" fill="{gf}"/>', f'<path d="{poly(side)}" fill="{gs}"/>', f'<path d="{poly(top)}" fill="{gt}"/>']
    out.append(f'<path d="{poly(top)}" fill="none" stroke="#FFF8D6" stroke-width="0.7" opacity="0.8"/>')
    out.append(f'<line x1="{f(fa[3][0])}" y1="{f(fa[3][1])}" x2="{f(fa[2][0])}" y2="{f(fa[2][1])}" stroke="#FFFFFF" stroke-width="0.9" opacity="0.75"/>')
    if stamp and w > 40:
        p0, p1, p3 = top[0], top[1], top[3]
        a, b = p1[0] - p0[0], p1[1] - p0[1]
        c, dd = p3[0] - p0[0], p3[1] - p0[1]
        unit = (f'<rect x="0.22" y="0.18" width="0.56" height="0.64" rx="0.05" fill="none" stroke="{lo}" stroke-width="0.035" opacity="0.7"/>'
                f'<rect x="0.38" y="0.36" width="0.05" height="0.28" fill="{lo}" opacity="0.8"/>'
                f'<rect x="0.475" y="0.27" width="0.05" height="0.46" fill="{lo}" opacity="0.8"/>'
                f'<rect x="0.57" y="0.36" width="0.05" height="0.28" fill="{lo}" opacity="0.8"/>')
        out.append(f'<g transform="matrix({f(a)} {f(b)} {f(c)} {f(dd)} {f(p0[0])} {f(p0[1])})">{unit}</g>')
    o = f' transform="rotate({f(rot)} {f(x)} {f(y)})"' if rot else ""
    return f"<g{o}>{''.join(out)}</g>"


def lingot_stack(card, cx, by, rows=(4, 3, 2, 1), w=58, h=15, d=24, key="ls", m=GOLD_RICH, shadow=True):
    """Une pile de lingots en pyramide (rangées du bas vers le haut)."""
    out = []
    if shadow:
        out.append(f'<ellipse cx="{f(cx + d * 0.3)}" cy="{f(by + 2)}" rx="{f(rows[0] * w * 0.55)}" ry="9" fill="#000000" opacity="0.6" filter="{soft(card, 6)}"/>')
    for k, n in enumerate(rows):
        y = by - k * h
        x0 = cx - (n - 1) * (w - h * 0.5) / 2
        for i in range(n):
            out.append(lingot(card, x0 + i * (w - h * 0.5), y, w, h, d, key, m))
    return "".join(out)


# ---------------------------------------------------------------- architecture


def marble(card, d, key="mb", base=("#FFFFFF", "#ECE6DC", "#B8AFA2"), vein=(0.32, 0.28, 0.26), seed=4, freq="0.012 0.024", cx=0.4, cy=0.3, op=0.55):
    hi, mid, lo = base
    g = rg(card, key + "-g", [(0, hi), (0.6, mid), (1, lo)], cx, cy, 0.9)
    v = veins(card, key + "-v", freq, 5, seed, vein, "0 0 0 0 0 0 0 0 0.85 0.3 0 0 0 0 0 0 0", 0.35)
    return f'<path d="{d}" fill="{g}"/><path d="{d}" fill="#000000" opacity="{f(op)}" filter="{v}"/>'


def column(card, x, top, bottom, w=44, key="col", stone=("#FFFFFF", "#E9E1D4", "#8E8478"), light="#FFC77A", night=True, flutes=7):
    """Une colonne cannelée (base attique, fût, chapiteau à volutes), éclairée par en dessous la nuit."""
    hi, mid, lo = stone
    out = []
    cap_h = w * 0.62
    base_h = w * 0.42
    shaft_top = top + cap_h
    shaft_bot = bottom - base_h
    sw = w * 0.78
    sg = lg(card, key + "-sh", [(0, lo), (0.22, mid), (0.42, hi), (0.6, mid), (1, lo)], 0, 0, 1, 0)
    out.append(f'<rect x="{f(x - sw / 2)}" y="{f(shaft_top)}" width="{f(sw)}" height="{f(shaft_bot - shaft_top)}" fill="{sg}"/>')
    fl = []
    for i in range(flutes):
        fx = x - sw / 2 + sw * (i + 0.5) / flutes
        k = abs((i + 0.5) / flutes - 0.42)
        fl.append(f'<line x1="{f(fx)}" y1="{f(shaft_top + 4)}" x2="{f(fx)}" y2="{f(shaft_bot - 4)}" stroke="{lo}" stroke-width="{f(sw / flutes * 0.42)}" stroke-linecap="round" opacity="{f(0.25 + k * 0.5)}"/>')
        fl.append(f'<line x1="{f(fx + sw / flutes * 0.26)}" y1="{f(shaft_top + 4)}" x2="{f(fx + sw / flutes * 0.26)}" y2="{f(shaft_bot - 4)}" stroke="#FFFFFF" stroke-width="0.8" opacity="{f(0.4 - k * 0.5 if k < 0.6 else 0)}"/>')
    out.append("".join(fl))
    cg = lg(card, key + "-cg", [(0, lo), (0.3, mid), (0.5, hi), (0.75, mid), (1, lo)], 0, 0, 1, 0)
    out.append(f'<rect x="{f(x - w * 0.62)}" y="{f(top)}" width="{f(w * 1.24)}" height="{f(cap_h * 0.24)}" fill="{cg}"/>')
    out.append(f'<path d="M{f(x - w * 0.55)} {f(top + cap_h * 0.24)} L{f(x + w * 0.55)} {f(top + cap_h * 0.24)} Q{f(x + w * 0.42)} {f(top + cap_h * 0.6)} {f(x + sw * 0.55)} {f(top + cap_h * 0.82)} L{f(x - sw * 0.55)} {f(top + cap_h * 0.82)} Q{f(x - w * 0.42)} {f(top + cap_h * 0.6)} {f(x - w * 0.55)} {f(top + cap_h * 0.24)} Z" fill="{cg}"/>')
    for sx in (-1, 1):
        vx, vy = x + sx * w * 0.46, top + cap_h * 0.48
        rr = cap_h * 0.26
        out.append(f'<circle cx="{f(vx)}" cy="{f(vy)}" r="{f(rr)}" fill="{cg}" stroke="{lo}" stroke-width="0.8"/>'
                   f'<path d="M{f(vx)} {f(vy - rr * 0.55)} A{f(rr * 0.55)} {f(rr * 0.55)} 0 1 {0 if sx < 0 else 1} {f(vx + sx * rr * 0.3)} {f(vy + rr * 0.3)}" fill="none" stroke="{lo}" stroke-width="1"/>'
                   f'<circle cx="{f(vx)}" cy="{f(vy)}" r="{f(rr * 0.18)}" fill="{lo}"/>')
    out.append(f'<rect x="{f(x - sw * 0.56)}" y="{f(top + cap_h * 0.82)}" width="{f(sw * 1.12)}" height="{f(cap_h * 0.18)}" fill="{cg}"/>')
    out.append(f'<rect x="{f(x - sw * 0.58)}" y="{f(shaft_bot)}" width="{f(sw * 1.16)}" height="{f(base_h * 0.3)}" rx="{f(base_h * 0.15)}" fill="{cg}"/>')
    out.append(f'<rect x="{f(x - sw * 0.66)}" y="{f(shaft_bot + base_h * 0.3)}" width="{f(sw * 1.32)}" height="{f(base_h * 0.32)}" rx="{f(base_h * 0.16)}" fill="{cg}"/>')
    out.append(f'<rect x="{f(x - w * 0.62)}" y="{f(shaft_bot + base_h * 0.62)}" width="{f(w * 1.24)}" height="{f(base_h * 0.38)}" fill="{cg}"/>')
    if night:
        up = lg(card, key + "-up", [(0, light, 0.0), (0.55, light, 0.12), (1, light, 0.62)], 0, 0, 0, 1)
        out.append(f'<rect x="{f(x - w * 0.62)}" y="{f(top)}" width="{f(w * 1.24)}" height="{f(bottom - top)}" fill="{up}" style="mix-blend-mode:screen"/>')
        dark = lg(card, key + "-dk", [(0, "#0A1030", 0.5), (0.5, "#0A1030", 0.15), (1, "#0A1030", 0)], 0, 0, 0, 1)
        out.append(f'<rect x="{f(x - w * 0.62)}" y="{f(top)}" width="{f(w * 1.24)}" height="{f(bottom - top)}" fill="{dark}" style="mix-blend-mode:multiply"/>')
    return "".join(out)


def steps(card, x0, x1, y, n=4, rise=12, tread=10, key="stp", stone=("#FFFFFF", "#E6DED2", "#9A9084"), spread=14, glow=None):
    """Des marches de marbre, de la plus haute (y) vers le bas, chacune plus large."""
    hi, mid, lo = stone
    out = []
    tg = lg(card, key + "-t", [(0, mid), (0.5, hi), (1, mid)], 0, 0, 1, 0)
    fg = lg(card, key + "-fr", [(0, lo), (1, mid)], 0, 0, 0, 1)
    for i in range(n):
        a = x0 - spread * i
        b = x1 + spread * i
        yt = y + i * (rise + tread)
        out.append(f'<rect x="{f(a)}" y="{f(yt)}" width="{f(b - a)}" height="{f(tread)}" fill="{tg}"/>')
        out.append(f'<rect x="{f(a)}" y="{f(yt + tread)}" width="{f(b - a)}" height="{f(rise)}" fill="{fg}"/>')
        out.append(f'<line x1="{f(a)}" y1="{f(yt + 0.5)}" x2="{f(b)}" y2="{f(yt + 0.5)}" stroke="#FFFFFF" stroke-width="1" opacity="0.7"/>')
        out.append(f'<line x1="{f(a)}" y1="{f(yt + tread)}" x2="{f(b)}" y2="{f(yt + tread)}" stroke="{lo}" stroke-width="1" opacity="0.8"/>')
    if glow:
        gg = lg(card, key + "-gl", [(0, glow, 0.55), (1, glow, 0)], 0, 0, 0, 1)
        out.append(f'<rect x="{f(x0 - spread * n)}" y="{f(y)}" width="{f(x1 - x0 + 2 * spread * n)}" height="{f(n * (rise + tread))}" fill="{gg}" style="mix-blend-mode:screen"/>')
    return "".join(out)


def beam(card, key, x, y, angle, length, width, color="#FFF2D0", op=0.55, blur=5):
    """Un faisceau de projecteur qui monte dans la nuit (angle en degrés depuis la verticale)."""
    x1, y1 = pt(x, y, length, angle - width / 2)
    x2, y2 = pt(x, y, length, angle + width / 2)
    g = rg(card, key, [(0, color, op), (0.5, color, op * 0.35), (1, color, 0)], x, y, length, units="user")
    return f'<path d="M{f(x - 3)} {f(y)} L{f(x1)} {f(y1)} L{f(x2)} {f(y2)} L{f(x + 3)} {f(y)} Z" fill="{g}" filter="{soft(card, blur)}" style="mix-blend-mode:screen"/>'


def engraved(text, x, y, size, color_dark="#5A4A3A", color_light="#FFFFFF", font=CINZEL, spacing=6, weight=700, fill="#C8BBA8"):
    """Un texte gravé dans la pierre : creux sombre, lèvre claire."""
    t = esc(text)
    return (f'<text x="{f(x)}" y="{f(y + 1.2)}" text-anchor="middle" font-family="{font}" font-weight="{weight}" font-size="{f(size)}" letter-spacing="{f(spacing)}" fill="{color_light}" opacity="0.75">{t}</text>'
            f'<text x="{f(x)}" y="{f(y)}" text-anchor="middle" font-family="{font}" font-weight="{weight}" font-size="{f(size)}" letter-spacing="{f(spacing)}" fill="{color_dark}">{t}</text>')
