"""Atelier « Trésor » — la mécanique de la chambre forte : engrenages de laiton, pênes chromés massifs, guides,
barre de pênes, bielles, volant à poignées."""

import math

from kit import f, pt, lg, rg, metal_lin, bevel, soft, poly, BRASS, CHROME, STEEL

CHROME_DARK = ("#1A1F26", "#5A6676", "#E8EEF4")


def chrome_cyl(card, key, vertical=False):
    """Un cylindre chromé : reflets durs, bandes sombres (le chrome réfléchit la pièce sombre)."""
    stops = [(0, "#161A20"), (0.1, "#4A5462"), (0.24, "#D8E0EA"), (0.33, "#FFFFFF"), (0.42, "#B8C4D2"), (0.56, "#2A3038"),
             (0.7, "#5A6676"), (0.86, "#A8B4C4"), (1, "#20262E")]
    return lg(card, key, stops, 0, 0, 1, 0) if vertical else lg(card, key, stops, 0, 0, 0, 1)


def chrome_ball(card, key):
    return rg(card, key, [(0, "#FFFFFF"), (0.14, "#F0F4F8"), (0.32, "#9AA6B6"), (0.55, "#2A3038"), (0.78, "#5A6676"), (0.92, "#B8C4D2"), (1, "#3A424E")], 0.36, 0.3, 0.72)


def gear(card, cx, cy, r, teeth, key="gr", m=BRASS, rot=0.0, holes=5, depth=None, shadow=True):
    """Un engrenage de laiton : denture trapézoïdale, jante, rayons évidés, moyeu et goupille."""
    hi, mid, lo = m
    depth = depth or max(4.0, r * 0.11)
    pts = []
    for i in range(teeth):
        a = rot + 360 * i / teeth
        step = 360 / teeth
        for da, rr in ((-0.5, r - depth), (-0.3, r - depth), (-0.18, r), (0.18, r), (0.3, r - depth)):
            pts.append(pt(cx, cy, rr, a + da * step))
    d = poly(pts)
    cut = ""
    if holes and r > 34:
        rin, rout = r * 0.34, r - depth - r * 0.14
        for i in range(holes):
            a0 = rot + 360 * i / holes + 360 / holes * 0.16
            a1 = rot + 360 * (i + 1) / holes - 360 / holes * 0.16
            p1, p2 = pt(cx, cy, rout, a0), pt(cx, cy, rout, a1)
            p3, p4 = pt(cx, cy, rin, a1 - 6), pt(cx, cy, rin, a0 + 6)
            cut += (f" M{f(p1[0])} {f(p1[1])} A{f(rout)} {f(rout)} 0 0 1 {f(p2[0])} {f(p2[1])} L{f(p3[0])} {f(p3[1])} "
                    f"A{f(rin)} {f(rin)} 0 0 0 {f(p4[0])} {f(p4[1])} Z")
    g = metal_lin(card, key + "-g", m, 0, 0, 1, 1, 2)
    bv = bevel(card, key + "-bv", max(0.8, r * 0.02), 3.2, 1.0, 24, shadow=(1, 4, 4, 0.65) if shadow else None)
    out = [f'<g filter="{bv}"><path d="{d}{cut}" fill-rule="evenodd" fill="{g}"/></g>']
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r - depth - 2)}" fill="none" stroke="{lo}" stroke-width="0.9" opacity="0.7"/>')
    if r > 34:
        out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.3)}" fill="none" stroke="{lo}" stroke-width="0.9" opacity="0.7"/>')
    hub = rg(card, key + "-hub", [(0, "#FFFFFF"), (0.3, hi), (0.7, mid), (1, lo)], 0.38, 0.32, 0.7)
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.17 + 3)}" fill="{hub}" stroke="{lo}" stroke-width="0.8"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.06 + 1.5)}" fill="#2A1A06"/>')
    return "".join(out)


def massive_bolt(card, x, y, L, r, key="mb", cap="left"):
    """Un pêne massif chromé, vu de face : fût, chanfrein, embout bombé, ombre portée."""
    g = chrome_cyl(card, key + "-c")
    x0, x1 = (x - L, x) if cap == "left" else (x, x + L)
    ex = x0 if cap == "left" else x1
    end = rg(card, key + "-e", [(0, "#FFFFFF"), (0.25, "#C8D2DE"), (0.6, "#4A5462"), (1, "#1A1F26")], 0.4 if cap == "left" else 0.6, 0.3, 0.8)
    s = -1 if cap == "left" else 1
    return (f'<rect x="{f(x0)}" y="{f(y - r + 4)}" width="{f(L)}" height="{f(2 * r)}" rx="{f(r * 0.3)}" fill="#000000" opacity="0.55" filter="{soft(card, 3)}"/>'
            f'<rect x="{f(x0)}" y="{f(y - r)}" width="{f(L)}" height="{f(2 * r)}" fill="{g}"/>'
            f'<ellipse cx="{f(ex)}" cy="{f(y)}" rx="{f(r * 0.36)}" ry="{f(r)}" fill="{g}"/>'
            f'<ellipse cx="{f(ex + s * r * 0.08)}" cy="{f(y)}" rx="{f(r * 0.26)}" ry="{f(r * 0.8)}" fill="{end}"/>'
            f'<line x1="{f(ex - s * r * 0.5)}" y1="{f(y - r)}" x2="{f(ex - s * r * 0.5)}" y2="{f(y + r)}" stroke="#0E1116" stroke-width="1" opacity="0.6"/>')


def guide_block(card, x, y, w, h, key="gb", m=BRASS):
    """Le guide de laiton où coulisse un pêne : bloc biseauté, deux vis."""
    hi, mid, lo = m
    g = metal_lin(card, key + "-g", m, 0, 0, 1, 1)
    bv = bevel(card, key + "-bv", 1.0, 3.0, 1.0, 22, shadow=(0, 3, 3, 0.6))
    sc = rg(card, key + "-sc", [(0, "#FFFFFF"), (0.4, hi), (1, lo)], 0.35, 0.3, 0.7)
    out = [f'<g filter="{bv}"><rect x="{f(x - w / 2)}" y="{f(y - h / 2)}" width="{f(w)}" height="{f(h)}" rx="3" fill="{g}"/></g>']
    for sy in (-1, 1):
        cy = y + sy * h * 0.36
        out.append(f'<circle cx="{f(x)}" cy="{f(cy)}" r="2.6" fill="{sc}" stroke="{lo}" stroke-width="0.5"/>'
                   f'<line x1="{f(x - 1.8)}" y1="{f(cy + 0.8)}" x2="{f(x + 1.8)}" y2="{f(cy - 0.8)}" stroke="{lo}" stroke-width="0.8"/>')
    return "".join(out)


def bar_v(card, x, y0, y1, w, key="bv"):
    """La barre de pênes, verticale, chromée."""
    g = chrome_cyl(card, key + "-c", vertical=True)
    return (f'<rect x="{f(x - w / 2 + 3)}" y="{f(y0 + 4)}" width="{f(w)}" height="{f(y1 - y0)}" rx="{f(w * 0.3)}" fill="#000000" opacity="0.5" filter="{soft(card, 3)}"/>'
            f'<rect x="{f(x - w / 2)}" y="{f(y0)}" width="{f(w)}" height="{f(y1 - y0)}" rx="{f(w * 0.3)}" fill="{g}"/>')


def rod(card, a, b, w, key="rod"):
    """Une bielle chromée entre deux points, articulée par deux tourillons."""
    (x1, y1), (x2, y2) = a, b
    L = math.hypot(x2 - x1, y2 - y1)
    ang = math.degrees(math.atan2(y2 - y1, x2 - x1))
    g = chrome_cyl(card, key + "-c")
    ball = chrome_ball(card, key + "-b")
    return (f'<g transform="translate({f(x1)} {f(y1)}) rotate({f(ang)})">'
            f'<rect x="0" y="{f(-w / 2 + 3)}" width="{f(L)}" height="{f(w)}" rx="{f(w / 2)}" fill="#000000" opacity="0.45" filter="{soft(card, 2.5)}"/>'
            f'<rect x="0" y="{f(-w / 2)}" width="{f(L)}" height="{f(w)}" rx="{f(w / 2)}" fill="{g}"/></g>'
            f'<circle cx="{f(x1)}" cy="{f(y1)}" r="{f(w * 0.75)}" fill="{ball}"/><circle cx="{f(x2)}" cy="{f(y2)}" r="{f(w * 0.75)}" fill="{ball}"/>')


def spider_wheel(card, cx, cy, r, spokes=3, key="sw", rot=0.0):
    """Le volant chromé de la porte : rayons coniques, poignées cylindriques moletées, moyeu bombé."""
    out = []
    ball = chrome_ball(card, key + "-b")
    grip = chrome_cyl(card, key + "-gp")
    sp = chrome_cyl(card, key + "-sp")
    for i in range(spokes):
        a = rot + 360 * i / spokes
        L = r * 0.78
        w0, w1 = r * 0.085, r * 0.05
        shape = f"M0 {f(-w0)} L{f(L)} {f(-w1)} L{f(L)} {f(w1)} L0 {f(w0)} Z"
        knurl = "".join(f'<line x1="{f(L + r * 0.03 + k)}" y1="{f(-r * 0.075)}" x2="{f(L + r * 0.03 + k)}" y2="{f(r * 0.075)}" stroke="#1A1F26" stroke-width="0.7" opacity="0.5"/>'
                        for k in range(2, int(r * 0.2), 3))
        out.append(f'<g transform="translate({f(cx)} {f(cy)}) rotate({f(a - 90)})">'
                   f'<path d="{shape}" fill="#000000" opacity="0.5" transform="translate(3 5)" filter="{soft(card, 3)}"/>'
                   f'<path d="{shape}" fill="{sp}"/>'
                   f'<rect x="{f(L + 2)}" y="{f(-r * 0.085 + 4)}" width="{f(r * 0.24)}" height="{f(r * 0.17)}" rx="{f(r * 0.085)}" fill="#000000" opacity="0.5" filter="{soft(card, 3)}"/>'
                   f'<rect x="{f(L)}" y="{f(-r * 0.085)}" width="{f(r * 0.24)}" height="{f(r * 0.17)}" rx="{f(r * 0.085)}" fill="{grip}"/>{knurl}</g>')
    out.append(f'<circle cx="{f(cx + 3)}" cy="{f(cy + 5)}" r="{f(r * 0.22)}" fill="#000000" opacity="0.5" filter="{soft(card, 4)}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.22)}" fill="{ball}"/>')
    return "".join(out)


def door_face(card, cx, cy, R, key="df", m=STEEL):
    """La face intérieure d'une porte ronde, vue de face (on l'écrase ensuite en perspective) : tôle tournée,
    couronne de boulons, vitre sur le mécanisme (roue centrale, bielles, quatre chariots de pênes), volant."""
    from kit import ellipse_path
    from banque import brushed, lathe, hexbolt
    hi, mid, lo = m
    d = ellipse_path(cx, cy, R, R)
    out = [brushed(card, d, key + "-f", m, 0, 0, 1, 0.6, 2, "0.003 0.5", 4, 0.35)]
    out.append(lathe(cx, cy, R * 0.82, R * 0.99, 3.0, "#FFFFFF", 0.12))
    for i in range(16):
        a = 360 * i / 16 + 11.25
        bx, by = pt(cx, cy, R * 0.91, a)
        out.append(hexbolt(card, bx, by, R * 0.036, m, key + "-hb"))
    gr = R * 0.78
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(gr + 6)}" fill="none" stroke="{lo}" stroke-width="4" opacity="0.8"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(gr)}" fill="#07090D"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(gr)}" fill="{rg(card, key + "-in", [(0, "#FFB84A", 0.35), (1, "#FFB84A", 0)])}"/>')
    for i in range(4):
        a = 90 * i + 45
        x2, y2 = pt(cx, cy, gr * 0.78, a)
        x1, y1 = pt(cx, cy, R * 0.2, a + 25)
        out.append(rod(card, (x1, y1), (x2, y2), R * 0.045, key + "-rd"))
        out.append(guide_block(card, x2, y2, R * 0.1, R * 0.1, key + "-gb"))
    out.append(gear(card, cx, cy, R * 0.3, 22, key + "-g", BRASS, 4))
    for i in range(4):
        a = 90 * i
        x, y = pt(cx, cy, gr * 0.62, a)
        out.append(gear(card, x, y, R * 0.11, 10, key + f"-p{i}", BRASS, a, holes=0))
    gl = lg(card, key + "-gl", [(0, "#FFFFFF", 0.3), (0.4, "#FFFFFF", 0.03), (0.55, "#FFFFFF", 0.14), (1, "#FFFFFF", 0)], 0, 0, 1, 1)
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(gr)}" fill="{gl}"/>')
    out.append(spider_wheel(card, cx, cy, R * 0.42, 3, key + "-sw", 20))
    return "".join(out)


def open_vault_door(card, cx, cy, R, sx=0.3, thick=40, key="ovd", m=STEEL, bolts=10):
    """La porte ronde grande ouverte, presque de profil : tranche épaisse, pênes qui dépassent, face intérieure en perspective."""
    hi, mid, lo = m
    out = [f'<ellipse cx="{f(cx + thick * 0.6)}" cy="{f(cy + 10)}" rx="{f(R * sx + thick)}" ry="{f(R + 6)}" fill="#000000" opacity="0.55" filter="{soft(card, 12)}"/>']
    ed = lg(card, key + "-ed", [(0, lo), (0.3, mid), (0.55, hi), (0.8, mid), (1, lo)], 0, 0, 0, 1)
    band = (f"M{f(cx)} {f(cy - R)} L{f(cx + thick)} {f(cy - R)} A{f(R * sx)} {f(R)} 0 0 1 {f(cx + thick)} {f(cy + R)} "
            f"L{f(cx)} {f(cy + R)} A{f(R * sx)} {f(R)} 0 0 0 {f(cx)} {f(cy - R)} Z")
    out.append(f'<path d="{band}" fill="{ed}"/>')
    out.append("".join(
        f'<path d="M{f(cx + k)} {f(cy - R)} A{f(R * sx)} {f(R)} 0 0 1 {f(cx + k)} {f(cy + R)}" fill="none" stroke="{lo if j % 2 else hi}" stroke-width="0.8" opacity="0.45"/>'
        for j, k in enumerate(range(6, int(thick), 6))))
    for i in range(bolts):
        a = 180 + (i + 0.5) * 180 / bolts
        x, y = pt(0, 0, R * 0.9, a)
        x2, y2 = pt(0, 0, R * 1.14, a)
        bx, by = cx + x * sx, cy + y
        ex, ey = cx + x2 * sx - 8, cy + y2
        L = math.hypot(ex - bx, ey - by)
        ang = math.degrees(math.atan2(ey - by, ex - bx))
        g = chrome_cyl(card, key + "-bl")
        end = chrome_ball(card, key + "-be")
        out.append(f'<g transform="translate({f(bx)} {f(by)}) rotate({f(ang)})"><rect x="0" y="-8" width="{f(L)}" height="16" rx="3" fill="{g}"/>'
                   f'<ellipse cx="{f(L)}" cy="0" rx="4" ry="8" fill="{end}"/></g>')
    face = door_face(card, cx, cy, R, key + "-face", m)
    out.append(f'<g transform="translate({f(cx)} {f(cy)}) scale({f(sx)} 1) translate({f(-cx)} {f(-cy)})">{face}</g>')
    return "".join(out)
