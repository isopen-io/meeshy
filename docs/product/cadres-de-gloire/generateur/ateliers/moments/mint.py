"""La Monnaie : la Meesh frappée (tranche cannelée, grènetis, légende, Mee et Meo en relief), éclats de frappe, guillochis."""

import math
import random

from base import W, H, f, pt, esc, sparkle, SANS, CINZEL, CINZEL_DECO, _data_uri, signature
from kit import bevel, metal_grad, halo, ring_text, clip, ring_d, circle_d, lgrad, smooth_closed


def emboss(card, name, metal, elev=42, scale=3.2, az=225):
    """Relief d'une image : sa luminance devient une hauteur, éclairée et teintée dans le métal de la pièce."""
    hi, mid, lo = metal
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">'
        f'<feColorMatrix in="SourceGraphic" type="luminanceToAlpha" result="lum"/>'
        f'<feComposite in="lum" in2="SourceAlpha" operator="in" result="h"/>'
        f'<feGaussianBlur in="h" stdDeviation="0.6" result="hb"/>'
        f'<feDiffuseLighting in="hb" surfaceScale="{scale}" diffuseConstant="1.25" lighting-color="#FFFFFF" result="diff"><feDistantLight azimuth="{az}" elevation="{elev}"/></feDiffuseLighting>'
        f'<feSpecularLighting in="hb" surfaceScale="{scale}" specularConstant="0.9" specularExponent="18" lighting-color="{hi}" result="spec"><feDistantLight azimuth="{az}" elevation="{elev}"/></feSpecularLighting>'
        f'<feFlood flood-color="{mid}" result="base"/>'
        f'<feComposite in="base" in2="diff" operator="arithmetic" k1="1.15" result="shaded"/>'
        f'<feComposite in="spec" in2="shaded" operator="arithmetic" k2="0.7" k3="1" result="lit"/>'
        f'<feComposite in="lit" in2="SourceAlpha" operator="in" result="cut"/>'
        f'<feGaussianBlur in="SourceAlpha" stdDeviation="1.6" result="sb"/><feOffset in="sb" dx="1.2" dy="1.8" result="so"/>'
        f'<feComponentTransfer in="so" result="sop"><feFuncA type="linear" slope="0.55"/></feComponentTransfer>'
        f'<feFlood flood-color="{lo}"/><feComposite in2="sop" operator="in" result="shadow"/>'
        f'<feMerge><feMergeNode in="shadow"/><feMergeNode in="cut"/></feMerge></filter>',
    )
    return f"url(#{card.id(name)})"


def relief_image(card, pose, x, y, size, metal, name="rel"):
    return (
        f'<g filter="{emboss(card, name, metal)}"><image href="{_data_uri(pose)}" x="{f(x - size / 2)}" y="{f(y - size / 2)}" '
        f'width="{f(size)}" height="{f(size)}" preserveAspectRatio="xMidYMid meet"/></g>'
    )


def coin(card, cx, cy, r, metal, legend, number, pose="duo-main-dans-la-main", name="coin", field=None, rim_fill=None,
         face_fill=None, numeral_fill=None, edge=None, pose_size=None, pose_dy=-0.13, number_label="Nº", tilt=0.0, relief=None):
    """La Meesh, vue de face : tranche cannelée en épaisseur, listel, grènetis, légende circulaire, relief, numéro."""
    hi, mid, lo = metal
    out = []
    out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy + r * 0.12)}" rx="{f(r * 1.02)}" ry="{f(r)}" fill="#000000" opacity="0.55" filter="{card.blur(name + "-sh", r * 0.09)}"/>')
    th = r * 0.075
    eg = edge or card.grad(name + "-edge", [(0, lo), (0.5, mid), (1, lo)], 0, 0, 1, 0)
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy + th)}" r="{f(r)}" fill="{eg}"/>')
    n_reeds = int(math.pi * r / 2.6)
    reeds = []
    for i in range(n_reeds + 1):
        x0, y0 = pt(cx, cy, r, 90 + 180 * i / n_reeds)
        reeds.append(f'<line x1="{f(x0)}" y1="{f(y0)}" x2="{f(x0)}" y2="{f(y0 + th + 1)}" stroke="{lo}" stroke-width="0.9" opacity="0.75"/>')
    out.append(f'<g clip-path="{clip(card, circle_d(cx, cy + th, r), name + "-ec")}">{"".join(reeds)}</g>')
    face = face_fill or metal_grad(card, name + "-face", metal, 0.1, 0, 0.9, 1)
    out.append(f'<g filter="{bevel(card, name + "-bv", 1.4, 3.0, sd=2, dy=1, sop=0.3)}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{face}"/></g>')
    rf = rim_fill or metal_grad(card, name + "-rim", metal, 1, 0, 0, 1)
    out.append(f'<g filter="{bevel(card, name + "-rbv", 1.0, 2.6, shadow=False)}"><path d="{ring_d(cx, cy, r * 0.88, r * 0.985)}" fill-rule="evenodd" fill="{rf}"/></g>')
    fg = field or card.rgrad(name + "-field", [(0, hi, 1), (0.6, mid, 1), (1, lo, 1)], 0.38, 0.3, 0.85)
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.88)}" fill="{fg}" opacity="0.9"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.88)}" fill="none" stroke="{lo}" stroke-width="1.6" opacity="0.7" filter="{card.blur(name + "-fi", 1.2)}"/>')
    beads = []
    nb = int(2 * math.pi * r * 0.83 / 5.2)
    for i in range(nb):
        x, y = pt(cx, cy, r * 0.83, i * 360 / nb)
        beads.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 0.014 + 0.6)}" fill="{hi}"/>')
    out.append(f'<g filter="{bevel(card, name + "-bdv", 0.5, 1.6, shadow=False)}">{"".join(beads)}</g>')
    tr = r * 0.71
    words = legend
    out.append(ring_text(card, name + "-lg-s", cx + 0.6, cy + 0.9, tr, words, size=r * 0.105, fill=lo, font=CINZEL, weight=700, full=True, extra='opacity="0.6"'))
    out.append(ring_text(card, name + "-lg", cx, cy, tr, words, size=r * 0.105, fill=hi, font=CINZEL, weight=700, full=True))
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.6)}" fill="none" stroke="{lo}" stroke-width="0.8" opacity="0.7"/>')
    ps = pose_size or r * 0.98
    out.append(f'<g clip-path="{clip(card, circle_d(cx, cy, r * 0.6), name + "-pc")}">{relief_image(card, pose, cx, cy + r * pose_dy, ps, relief or metal, name + "-em")}</g>')
    nf = numeral_fill or card.grad(name + "-num", [(0, lo), (1, lo)], 0, 0, 0, 1)
    num = f"{number_label} {number}" if number_label else str(number)
    fs = r * 0.18
    cw = fs * 0.62 * len(num) + r * 0.16
    ny = cy + r * 0.44
    cart = metal_grad(card, name + "-cart", metal, 0, 0, 0, 1)
    out.append(
        f'<g filter="{bevel(card, name + "-cbv", 0.8, 2.2, sd=2, dy=1.5, sop=0.55)}">'
        f'<path d="M{f(cx - cw / 2)} {f(ny - fs * 0.62)} L{f(cx + cw / 2)} {f(ny - fs * 0.62)} L{f(cx + cw / 2 + fs * 0.4)} {f(ny)} L{f(cx + cw / 2)} {f(ny + fs * 0.62)} '
        f'L{f(cx - cw / 2)} {f(ny + fs * 0.62)} L{f(cx - cw / 2 - fs * 0.4)} {f(ny)} Z" fill="{cart}" stroke="{lo}" stroke-width="0.6"/></g>'
    )
    out.append(
        f'<text x="{f(cx)}" y="{f(ny + fs * 0.36)}" text-anchor="middle" font-family="{CINZEL}" font-weight="700" font-size="{f(fs)}" '
        f'fill="{nf}" stroke="{hi}" stroke-width="0.8" stroke-opacity="0.6" paint-order="stroke">{esc(num)}</text>'
    )
    gl = card.grad(name + "-gloss", [(0, "#FFFFFF"), (1, "#FFFFFF")], 0, 0, 1, 1)
    out.append(
        f'<path d="M{f(cx - r * 0.7)} {f(cy - r * 0.7)} A{f(r)} {f(r)} 0 0 1 {f(cx + r * 0.62)} {f(cy - r * 0.78)} '
        f'Q{f(cx)} {f(cy - r * 0.45)} {f(cx - r * 0.7)} {f(cy - r * 0.7)} Z" fill="#FFFFFF" opacity="0.16"/>'
    )
    return "".join(out)


def strike_burst(card, name, cx, cy, r0, r1, n, seed, colors, w=(0.6, 2.4), op=(0.25, 0.8)):
    """Éclats de frappe : des rais vifs qui partent de la tranche de la pièce."""
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        a = rnd.uniform(0, 360)
        a0 = r0 * rnd.uniform(0.98, 1.1)
        a1 = r1 * rnd.uniform(0.45, 1.0)
        x0, y0 = pt(cx, cy, a0, a)
        x1, y1 = pt(cx, cy, a1, a)
        out.append(f'<line x1="{f(x0)}" y1="{f(y0)}" x2="{f(x1)}" y2="{f(y1)}" stroke="{rnd.choice(colors)}" stroke-width="{f(rnd.uniform(*w))}" stroke-linecap="round" opacity="{f(rnd.uniform(*op))}"/>')
    return "".join(out)


def flakes(card, name, seed, n, region, metal, avoid=None, size=(3, 9)):
    """Paillettes de métal : de petits éclats plats qui tournoient, chacun accrochant la lumière."""
    rnd = random.Random(seed)
    hi, mid, lo = metal
    g = metal_grad(card, name + "-g", metal)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if avoid and avoid[0] < x < avoid[2] and avoid[1] < y < avoid[3]:
            continue
        s = rnd.uniform(*size)
        pts = [pt(x, y, s * rnd.uniform(0.6, 1.0), a) for a in (rnd.uniform(0, 60), rnd.uniform(100, 160), rnd.uniform(190, 250), rnd.uniform(280, 340))]
        out.append(f'<path d="M{" L".join(f"{f(px)} {f(py)}" for px, py in pts)} Z" fill="{g}" stroke="{hi}" stroke-width="0.4" opacity="{f(rnd.uniform(0.6, 1))}"/>')
        if rnd.random() < 0.2:
            out.append(sparkle(x, y, s * 1.4, "#FFFFFF", 0.9))
    return "".join(out)


def guilloche(cx, cy, R, r, d, color, w=0.6, op=0.8, steps=720, rot=0.0, scale=1.0):
    """Un guillochis : une hypotrochoïde (rosace de graveur)."""
    k = (R - r) / r
    turns = r // math.gcd(int(R), int(r))
    pts = []
    for i in range(steps * int(turns) + 1):
        t = i * 2 * math.pi / steps
        x = (R - r) * math.cos(t) + d * math.cos(k * t)
        y = (R - r) * math.sin(t) - d * math.sin(k * t)
        a = math.radians(rot)
        xr, yr = x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)
        pts.append(f"{f(cx + xr * scale)} {f(cy + yr * scale)}")
    return f'<path d="M{" L".join(pts)} Z" fill="none" stroke="{color}" stroke-width="{w}" opacity="{op}"/>'


def guilloche_band(x0, y0, x1, y1, color, n=7, amp=None, w=0.55, op=0.7, waves=9, vertical=True):
    """Une bande de guillochis : des sinusoïdes déphasées qui s'entrelacent."""
    out = []
    if vertical:
        amp = amp or (x1 - x0) / 2
        cx = (x0 + x1) / 2
        for k in range(n):
            ph = k * 2 * math.pi / n
            pts = []
            for i in range(161):
                t = i / 160
                y = y0 + (y1 - y0) * t
                x = cx + amp * math.sin(ph + t * waves * 2 * math.pi) * (0.55 + 0.45 * math.cos(t * 2 * math.pi * 3 + ph))
                pts.append(f"{f(x)} {f(y)}")
            out.append(f'<path d="M{" L".join(pts)}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{op}"/>')
    else:
        amp = amp or (y1 - y0) / 2
        cy = (y0 + y1) / 2
        for k in range(n):
            ph = k * 2 * math.pi / n
            pts = []
            for i in range(161):
                t = i / 160
                x = x0 + (x1 - x0) * t
                y = cy + amp * math.sin(ph + t * waves * 2 * math.pi) * (0.55 + 0.45 * math.cos(t * 2 * math.pi * 3 + ph))
                pts.append(f"{f(x)} {f(y)}")
            out.append(f'<path d="M{" L".join(pts)}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{op}"/>')
    return "".join(out)


def laurel(card, cx, cy, r, a0, a1, side, metal, name="lau", n=11, leaf=15):
    """Une branche de laurier qui suit un arc (de a0 à a1, degrés depuis midi), feuilles par paires."""
    hi, mid, lo = metal
    g = metal_grad(card, name + "-g", metal)
    out = []
    pts = [pt(cx, cy, r, a0 + (a1 - a0) * i / 40) for i in range(41)]
    out.append(f'<path d="M{" L".join(f"{f(x)} {f(y)}" for x, y in pts)}" fill="none" stroke="{g}" stroke-width="2.4" stroke-linecap="round"/>')
    for i in range(n):
        t = (i + 0.5) / n
        a = a0 + (a1 - a0) * t
        x, y = pt(cx, cy, r, a)
        tang = a + (90 if a1 > a0 else -90)
        s = leaf * (1.1 - 0.45 * t)
        for sgn in (-1, 1):
            ang = tang + sgn * 38 + 180
            out.append(
                f'<path d="M0 0 C{f(-s * 0.36)} {f(-s * 0.35)} {f(-s * 0.22)} {f(-s * 0.85)} 0 {f(-s)} C{f(s * 0.22)} {f(-s * 0.85)} {f(s * 0.36)} {f(-s * 0.35)} 0 0 Z" '
                f'fill="{g}" transform="translate({f(x)} {f(y)}) rotate({f(ang)})"/>'
            )
            out.append(f'<path d="M0 0 L0 {f(-s * 0.85)}" stroke="{lo}" stroke-width="0.6" opacity="0.7" transform="translate({f(x)} {f(y)}) rotate({f(ang)})"/>')
    ex, ey = pt(cx, cy, r, a1)
    out.append(f'<circle cx="{f(ex)}" cy="{f(ey)}" r="3.4" fill="{g}"/>')
    return f'<g filter="{bevel(card, name + "-bv", 0.7, 2.0, sd=2, dy=2, sop=0.6)}">{"".join(out)}</g>'
