"""Abysses - le kit de composition : géométrie, filtres (biseau, lueur, caustiques, nuages),
eau (dégradés, rais de lumière, surface vue d'en dessous, bulles, neige marine), fenêtres et inscription."""

import math
import random

from base import W, H, f, pt, esc, SANS, CINZEL, CINZEL_DECO, HAND, GARAMOND, METALS, sparkle

DATE = "10 octobre 2026"
KICK = "Nouveau rang · Abysses"

GOLD = METALS["gold"]
REDGOLD = METALS["redgold"]
SILVER = METALS["silver"]
OBSIDIAN = METALS["obsidian"]

NACRE = ["#FBF6EE", "#EADCF2", "#D4F1F2", "#F6EAD0", "#DCD8F7", "#F3E2EA", "#D8F3E6", "#FBF6EE"]


# ---------------------------------------------------------------- géométrie

def lerp(a, b, t):
    return a + (b - a) * t


def catmull(pts, n=8, closed=False):
    """Échantillonne une spline de Catmull-Rom passant par `pts` (n points par segment)."""
    out = []
    m = len(pts)
    seg = m if closed else m - 1
    for i in range(seg):
        p0 = pts[(i - 1) % m] if closed else pts[max(0, i - 1)]
        p1 = pts[i % m]
        p2 = pts[(i + 1) % m]
        p3 = pts[(i + 2) % m] if closed else pts[min(m - 1, i + 2)]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            out.append((x, y))
    if not closed:
        out.append(pts[-1])
    return out


def poly(pts, closed=True):
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts)
    return d + (" Z" if closed else "")


def smooth(pts, closed=True, n=8):
    return poly(catmull(pts, n, closed), closed)


def resample(pts, count):
    """Points régulièrement espacés le long d'une polyligne."""
    seg = [math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1)]
    total = sum(seg) or 1
    out = []
    for k in range(count):
        target = total * k / max(1, count - 1)
        acc = 0
        for i, s in enumerate(seg):
            if acc + s >= target or i == len(seg) - 1:
                t = 0 if s == 0 else min(1, (target - acc) / s)
                out.append((lerp(pts[i][0], pts[i + 1][0], t), lerp(pts[i][1], pts[i + 1][1], t)))
                break
            acc += s
    return out


def normals(pts):
    out = []
    n = len(pts)
    for i in range(n):
        a, b = pts[max(0, i - 1)], pts[min(n - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        l = math.hypot(dx, dy) or 1
        out.append((-dy / l, dx / l))
    return out


def ribbon(spine, widths, n=10, count=None):
    """Un ruban effilé le long d'une épine lisse : `widths` = largeurs aux points de l'épine (interpolées)."""
    sm = catmull(spine, n)
    count = count or len(sm)
    sm = resample(sm, count)
    ws = [_interp(widths, i / max(1, count - 1)) for i in range(count)]
    nm = normals(sm)
    left = [(x + nx * w / 2, y + ny * w / 2) for (x, y), (nx, ny), w in zip(sm, nm, ws)]
    right = [(x - nx * w / 2, y - ny * w / 2) for (x, y), (nx, ny), w in zip(sm, nm, ws)]
    return poly(left + right[::-1])


def _interp(vals, t):
    if len(vals) == 1:
        return vals[0]
    x = t * (len(vals) - 1)
    i = min(len(vals) - 2, int(x))
    return lerp(vals[i], vals[i + 1], x - i)


def rrect(x0, y0, x1, y1, r):
    return (
        f"M{f(x0 + r)} {f(y0)} L{f(x1 - r)} {f(y0)} Q{f(x1)} {f(y0)} {f(x1)} {f(y0 + r)} L{f(x1)} {f(y1 - r)} "
        f"Q{f(x1)} {f(y1)} {f(x1 - r)} {f(y1)} L{f(x0 + r)} {f(y1)} Q{f(x0)} {f(y1)} {f(x0)} {f(y1 - r)} "
        f"L{f(x0)} {f(y0 + r)} Q{f(x0)} {f(y0)} {f(x0 + r)} {f(y0)} Z"
    )


def arch(x0, x1, top, y1, r=18, rise=None):
    """Fenêtre en plein cintre : `top` = sommet de l'arc ; `rise` = hauteur de l'arc (défaut : demi-largeur)."""
    rx = (x1 - x0) / 2
    ry = rise if rise is not None else rx
    spring = top + ry
    return (
        f"M{f(x0)} {f(spring)} A{f(rx)} {f(ry)} 0 0 1 {f(x1)} {f(spring)} L{f(x1)} {f(y1 - r)} Q{f(x1)} {f(y1)} {f(x1 - r)} {f(y1)} "
        f"L{f(x0 + r)} {f(y1)} Q{f(x0)} {f(y1)} {f(x0)} {f(y1 - r)} Z"
    )


def ogive(x0, x1, top, spring, y1, r=18):
    cx = (x0 + x1) / 2
    return (
        f"M{f(x0)} {f(spring)} C{f(x0)} {f(spring - (spring - top) * 0.62)} {f(cx - 46)} {f(top + 34)} {f(cx)} {f(top)} "
        f"C{f(cx + 46)} {f(top + 34)} {f(x1)} {f(spring - (spring - top) * 0.62)} {f(x1)} {f(spring)} "
        f"L{f(x1)} {f(y1 - r)} Q{f(x1)} {f(y1)} {f(x1 - r)} {f(y1)} L{f(x0 + r)} {f(y1)} Q{f(x0)} {f(y1)} {f(x0)} {f(y1 - r)} Z"
    )


def oval(cx, cy, rx, ry):
    return f"M{f(cx - rx)} {f(cy)} A{f(rx)} {f(ry)} 0 1 1 {f(cx + rx)} {f(cy)} A{f(rx)} {f(ry)} 0 1 1 {f(cx - rx)} {f(cy)} Z"


def shell_arch(x0, x1, top, y1, lobes=9, depth=9, r=18):
    """Fenêtre au sommet festonné : un arc de coquille."""
    cx, rx = (x0 + x1) / 2, (x1 - x0) / 2
    spring = top + rx * 0.62
    pts = []
    for i in range(lobes * 6 + 1):
        a = math.pi - math.pi * i / (lobes * 6)
        lobe = abs(math.sin(math.pi * i / 6)) * depth
        rr = 1 - lobe / rx * 0.0
        x = cx + (rx) * math.cos(a)
        y = spring - (rx * 0.62 + lobe * 0.0) * math.sin(a) - lobe * math.sin(a) * 0.9 + depth * 0.9 * math.sin(a)
        pts.append((x, y))
    d = poly(pts, closed=False)
    return d + f" L{f(x1)} {f(y1 - r)} Q{f(x1)} {f(y1)} {f(x1 - r)} {f(y1)} L{f(x0 + r)} {f(y1)} Q{f(x0)} {f(y1)} {f(x0)} {f(y1 - r)} Z"


# ---------------------------------------------------------------- masques et filtres

def hole_mask(card, d, name="hm", feather=0):
    """Masque : tout est visible sauf la fenêtre `d` (la photo)."""
    filt = ""
    if feather:
        card.def_once(name + "-ff", f'<filter id="{card.id(name + "-ff")}" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="{feather}"/></filter>')
        filt = f' filter="url(#{card.id(name + "-ff")})"'
    card.def_once(
        name,
        f'<mask id="{card.id(name)}" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}">'
        f'<rect width="{W}" height="{H}" fill="#FFFFFF"/><path d="{d}" fill="#000000"{filt}/></mask>',
    )
    return f"url(#{card.id(name)})"


def clip(card, d, name="cl"):
    card.def_once(name, f'<clipPath id="{card.id(name)}"><path d="{d}"/></clipPath>')
    return f"url(#{card.id(name)})"


def bevel(card, name, blur=1.2, scale=2.6, dy=2.5, sd=3, sop=0.6, shadow=True, az=225, el=48, spec=1.0, exp=18, k3=0.85):
    """Relief métallique : lumière spéculaire sur l'alpha flouté, puis ombre portée."""
    sh = (f'<feDropShadow dx="0" dy="{dy}" stdDeviation="{sd}" flood-color="#000000" flood-opacity="{sop}"/>' if shadow else "")
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">'
        f'<feGaussianBlur in="SourceAlpha" stdDeviation="{blur}" result="b"/>'
        f'<feSpecularLighting in="b" surfaceScale="{scale}" specularConstant="{spec}" specularExponent="{exp}" lighting-color="#FFFFFF" result="s">'
        f'<feDistantLight azimuth="{az}" elevation="{el}"/></feSpecularLighting>'
        f'<feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>'
        f'<feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k1="0" k2="1" k3="{k3}" k4="0" result="lit"/>'
        f"{sh}</filter>",
    )
    return f"url(#{card.id(name)})"


def glow(card, name, sd=5, boost=2, x="-80%", w="260%"):
    """Bioluminescence : la forme, plus son halo flouté renforcé."""
    nodes = "".join('<feMergeNode in="b"/>' for _ in range(boost))
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="{x}" y="{x}" width="{w}" height="{w}" color-interpolation-filters="sRGB">'
        f'<feGaussianBlur in="SourceGraphic" stdDeviation="{sd}" result="b"/>'
        f'<feMerge>{nodes}<feMergeNode in="SourceGraphic"/></feMerge></filter>',
    )
    return f"url(#{card.id(name)})"


def blur(card, name, sd):
    card.def_once(name, f'<filter id="{card.id(name)}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="{sd}"/></filter>')
    return f"url(#{card.id(name)})"


def caustic_filter(card, name, freq="0.02 0.032", seed=3, k=7.0, octaves=1, gamma=1.6):
    """Caustiques : les plis du bruit de turbulence deviennent un réseau de lignes lumineuses."""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" filterUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="turbulence" baseFrequency="{freq}" numOctaves="{octaves}" seed="{seed}" result="t"/>'
        f'<feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -{k} 0 0 0 1" result="a"/>'
        f'<feComponentTransfer in="a" result="a2"><feFuncA type="gamma" amplitude="1" exponent="{gamma}" offset="0"/></feComponentTransfer>'
        f'<feComposite in="SourceGraphic" in2="a2" operator="in"/></filter>',
    )
    return f"url(#{card.id(name)})"


def cloud_filter(card, name, freq="0.012", seed=5, octaves=5, gain=1.7, cut=0.5, region=(0, 0, W, H)):
    """Nuages (nébuleuses, eau trouble) : l'alpha de la forme modulé par un bruit fractal."""
    x, y, w, h = region
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" filterUnits="userSpaceOnUse" x="{x}" y="{y}" width="{w}" height="{h}" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="{octaves}" seed="{seed}" result="n"/>'
        f'<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  {gain} 0 0 0 -{cut}" result="na"/>'
        f'<feComposite in="SourceGraphic" in2="na" operator="in"/></filter>',
    )
    return f"url(#{card.id(name)})"


def ripple_filter(card, name, freq="0.012 0.05", seed=2, scale=10):
    """Déforme ce qu'il touche comme vu à travers l'eau."""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="-20%" y="-20%" width="140%" height="140%">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="2" seed="{seed}" result="n"/>'
        f'<feDisplacementMap in="SourceGraphic" in2="n" scale="{scale}" xChannelSelector="R" yChannelSelector="G"/></filter>',
    )
    return f"url(#{card.id(name)})"


# ---------------------------------------------------------------- l'eau

def water(card, stops, name="water"):
    return f'<rect width="{W}" height="{H}" fill="{card.grad(name, stops)}"/>'


def radial(card, name, cx, cy, rx, ry, color, op, mid=0.4):
    g = card.rgrad(name, [(0, color, op), (mid, color, op * 0.45), (1, color, 0)])
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{g}"/>'


def shafts(card, name, sx, sy, y0, length, n, seed, spread=34, color="#CFFBFF", op=(0.12, 0.34), wt=(6, 22), wb=(30, 80), sd=7):
    """Rais de lumière tombant de la surface, issus d'une source lointaine au-dessus."""
    rnd = random.Random(seed)
    g = card.grad(name + "-g", [(0, color), (0.55, color), (1, color)], 0, 0, 0, 1)
    fade = card.def_once(
        name + "-fade",
        f'<linearGradient id="{card.id(name + "-fade")}" gradientUnits="userSpaceOnUse" x1="0" y1="{f(y0)}" x2="0" y2="{f(y0 + length)}">'
        f'<stop offset="0" stop-color="#FFFFFF" stop-opacity="1"/><stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0.55"/>'
        f'<stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>',
    )
    card.def_once(name + "-m", f'<mask id="{card.id(name + "-m")}" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="{fade}"/></mask>')
    out = []
    for i in range(n):
        a = math.radians(-spread + 2 * spread * (i + rnd.uniform(-0.35, 0.35)) / max(1, n - 1))
        xt = sx + (y0 - sy) * math.tan(a)
        xb = sx + (y0 + length - sy) * math.tan(a)
        w0, w1 = rnd.uniform(*wt), rnd.uniform(*wb)
        o = rnd.uniform(*op)
        out.append(f'<path d="M{f(xt - w0 / 2)} {f(y0)} L{f(xt + w0 / 2)} {f(y0)} L{f(xb + w1 / 2)} {f(y0 + length)} L{f(xb - w1 / 2)} {f(y0 + length)} Z" fill="{g}" opacity="{f(o)}"/>')
    return f'<g mask="url(#{card.id(name + "-m")})" style="mix-blend-mode:screen"><g filter="{blur(card, name + "-bl", sd)}">{"".join(out)}</g></g>'


def caustics(card, name, x, y, w, h, stops, freq="0.02 0.032", seed=3, k=7.0, op=1.0, octaves=1, gamma=1.6):
    """Un panneau de caustiques, coloré/fondu par un dégradé vertical `stops`."""
    g = card.grad(name + "-g", stops)
    filt = caustic_filter(card, name + "-f", freq, seed, k, octaves, gamma)
    return f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="{g}" filter="{filt}" opacity="{op}" style="mix-blend-mode:screen"/>'


def surface(card, name, y=46, color="#BDF7FF", seed=4, amp=6, op=0.9):
    """La surface vue d'en dessous : un plafond de lumière ondulé."""
    rnd = random.Random(seed)
    pts = [(-10, -10)]
    x = -10
    while x < W + 30:
        pts.append((x, y + amp * math.sin(x / 23 + rnd.uniform(-0.4, 0.4)) + rnd.uniform(-amp, amp) * 0.5))
        x += 18
    pts.append((W + 30, -10))
    g = card.grad(name + "-g", [(0, "#FFFFFF"), (0.5, color), (1, color)])
    edge = poly(catmull(pts[1:-1], 6, False), closed=False)
    return (
        f'<path d="{poly([pts[0]] + catmull(pts[1:-1], 6, False) + [pts[-1]])}" fill="{g}" opacity="{op}"/>'
        f'<path d="{edge}" fill="none" stroke="#FFFFFF" stroke-width="2" opacity="0.8" filter="{blur(card, name + "-eb", 1.5)}"/>'
    )


def snow(seed, n, region=(0, 0, W, H), color="#CFF6FF", rmin=0.4, rmax=1.6, op=(0.2, 0.75), avoid=(96, 300, 444, 700)):
    """Neige marine : poussière en suspension qui donne la profondeur."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if avoid and avoid[0] < x < avoid[2] and avoid[1] < y < avoid[3]:
            continue
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(rmin, rmax))}" fill="{color}" opacity="{f(rnd.uniform(*op))}"/>')
    return "".join(out)


def bubble(card, cx, cy, r, color="#E8FDFF", op=1.0):
    g = card.rgrad("bub", [(0, "#FFFFFF", 0.0), (0.72, color, 0.08), (0.93, color, 0.55), (1, color, 0.9)])
    hl = r * 0.55
    return (
        f'<g opacity="{f(op)}"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/>'
        f'<path d="M{f(cx - hl)} {f(cy - r * 0.2)} A{f(hl)} {f(hl)} 0 0 1 {f(cx - r * 0.1)} {f(cy - hl * 1.05)}" fill="none" stroke="#FFFFFF" stroke-width="{f(max(0.7, r * 0.16))}" stroke-linecap="round" opacity="0.9"/>'
        f'<circle cx="{f(cx + r * 0.38)}" cy="{f(cy + r * 0.4)}" r="{f(r * 0.12)}" fill="#FFFFFF" opacity="0.6"/></g>'
    )


def bubble_column(card, seed, x, y0, y1, n, rmin=1.5, rmax=6, drift=10, color="#E8FDFF"):
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        t = i / max(1, n - 1)
        y = lerp(y0, y1, t) + rnd.uniform(-8, 8)
        r = lerp(rmax, rmin, t) * rnd.uniform(0.6, 1.1)
        out.append(bubble(card, x + math.sin(t * 7 + seed) * drift + rnd.uniform(-3, 3), y, r, color, rnd.uniform(0.6, 1)))
    return "".join(out)


def bokeh(card, name, seed, n, region, color, rmin=10, rmax=34, op=(0.08, 0.26), sd=6):
    """Bulles et particules hors de la mise au point, au premier plan : la profondeur de champ."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        r = rnd.uniform(rmin, rmax)
        out.append(f'<circle cx="{f(rnd.uniform(x0, x1))}" cy="{f(rnd.uniform(y0, y1))}" r="{f(r)}" fill="{color}" opacity="{f(rnd.uniform(*op))}"/>'
                   f'')
    return f'<g filter="{blur(card, name, sd)}">{"".join(out)}</g>'


# ---------------------------------------------------------------- perles et métal

def pearl(card, cx, cy, r, tint="neutral", shadow=True):
    tints = {
        "neutral": ("#FFFFFF", "#F4EEEA", "#D7CCD6", "#8E8399"),
        "rose": ("#FFFFFF", "#FBE9EC", "#E2C3CF", "#94687D"),
        "aqua": ("#FFFFFF", "#ECF8F7", "#BFDCE0", "#5F8590"),
        "gold": ("#FFFFFF", "#FBF0D6", "#E5CC94", "#8C6A2E"),
        "black": ("#E9F3FF", "#7C8AA6", "#2F3550", "#0C0F1E"),
    }
    a, b, c, d = tints[tint]
    g = card.rgrad("pearl-" + tint, [(0, a, 1), (0.3, b, 1), (0.78, c, 1), (1, d, 1)], 0.5, 0.5, 0.62, 0.36, 0.3)
    irid = card.rgrad("pearl-ir", [(0.6, "#7FF0FF", 0), (0.86, "#FF9FD8", 0.22), (1, "#7FF0FF", 0.35)])
    sh = f'<ellipse cx="{f(cx + r * 0.2)}" cy="{f(cy + r * 0.85)}" rx="{f(r * 0.9)}" ry="{f(r * 0.35)}" fill="#000000" opacity="0.28"/>' if shadow else ""
    return (
        f'{sh}<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{irid}"/>'
        f'<ellipse cx="{f(cx - r * 0.32)}" cy="{f(cy - r * 0.36)}" rx="{f(r * 0.22)}" ry="{f(r * 0.15)}" fill="#FFFFFF" opacity="0.95" transform="rotate(-35 {f(cx - r * 0.32)} {f(cy - r * 0.36)})"/>'
    )


def pearl_string(card, x0, y0, x1, y1, sag, r, tint="neutral", gap=0.6, thread="#E8D9A8"):
    """Un rang de perles drapé (chaînette) entre deux points."""
    pts = []
    for i in range(80):
        t = i / 79
        pts.append((lerp(x0, x1, t), lerp(y0, y1, t) + sag * 4 * t * (1 - t)))
    total = sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(79))
    count = max(2, int(total / (2 * r + gap)))
    beads = resample(pts, count)
    th = f'<path d="{poly(pts, closed=False)}" fill="none" stroke="{thread}" stroke-width="0.8" opacity="0.6"/>'
    return th + "".join(pearl(card, x, y, r, tint, shadow=False) for x, y in beads)


def metal_grad(card, name, metal, angle=(0, 0, 1, 1)):
    hi, mid, lo = metal
    return card.grad(name, [(0, hi), (0.28, mid), (0.5, lo), (0.72, mid), (1, hi)], *angle)


def nacre_grad(card, name, x1=0, y1=0, x2=1, y2=1, stops=None):
    cols = stops or NACRE
    return card.grad(name, [(round(i / (len(cols) - 1), 3), c) for i, c in enumerate(cols)], x1, y1, x2, y2)


# ---------------------------------------------------------------- fenêtres et bordures

def rim(card, d, metal=GOLD, w=5, name="rim", inner=True):
    hi, mid, lo = metal
    g = metal_grad(card, name + "-g", metal)
    out = f'<g filter="{bevel(card, name + "-bv", 1.0, 2.6, 2.5, 3, 0.7)}"><path d="{d}" fill="none" stroke="{g}" stroke-width="{w}"/></g>'
    if inner:
        out += f'<path d="{d}" fill="none" stroke="{hi}" stroke-width="0.8" opacity="0.75"/>'
    return out


def inner_shadow(card, d, w=34, sd=14, op=0.6, color="#00060E", name="ish"):
    return f'<g clip-path="{clip(card, d, name + "-c")}"><path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{op}" filter="{blur(card, name, sd)}"/></g>'


def grade(card, d, color, cx=0.5, cy=0.0, op=0.3, name="grade", r=0.9):
    """Lumière d'ambiance posée sur la photo (dans la fenêtre seulement)."""
    g = card.rgrad(name, [(0, color, op), (0.6, color, op * 0.3), (1, color, 0)], cx, cy, r)
    return f'<g clip-path="{clip(card, d, name + "-c")}" style="mix-blend-mode:screen"><rect width="{W}" height="{H}" fill="{g}"/></g>'


def outer_frame(card, metal=GOLD, m=12, w=4, r=24, name="of", inner=True, opacity=1):
    hi, mid, lo = metal
    g = card.grad(name + "-g", [(0, hi), (0.25, mid), (0.5, lo), (0.75, mid), (1, hi)], 0, 0, 1, 1)
    out = [f'<g opacity="{opacity}" filter="{bevel(card, name + "-bv", 1.0, 2.6, 2, 3, 0.6)}"><rect x="{m}" y="{m}" width="{W - 2 * m}" height="{H - 2 * m}" rx="{r}" fill="none" stroke="{g}" stroke-width="{w}"/></g>']
    if inner:
        out.append(f'<rect x="{m + 7}" y="{m + 7}" width="{W - 2 * m - 14}" height="{H - 2 * m - 14}" rx="{r - 5}" fill="none" stroke="{mid}" stroke-width="0.9" opacity="{0.7 * opacity}"/>')
    return "".join(out)


def gem_plate(card, cx, cy, s=1.0, color="#04121E", op=0.78):
    gy = cy + 96 * s
    return f'<rect x="{f(cx - 44 * s)}" y="{f(gy - 10 * s)}" width="{f(88 * s)}" height="{f(20 * s)}" rx="{f(10 * s)}" fill="{color}" opacity="{op}"/>'


def halo(card, name, cx, cy, r, color, op=0.6):
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{card.rgrad(name, [(0, color, op), (0.45, color, op * 0.35), (1, color, 0)])}"/>'


# ---------------------------------------------------------------- l'inscription

from base import plate_layer  # noqa: E402  la couche « plate » et ses emplacements de texte


@plate_layer
def inscription(card, title, message=None, y=752, style="nacre", metal=GOLD, panel=("#0A2438", "#030E19"), ink="#FFF6DA",
                accent=None, kicker=KICK, title_size=40, w=424, date=DATE, msg_color=None, title_font=CINZEL, medal=None, numero=None,
                panel_op=0.9):
    """La plaque : sur-titre, titre en métal, message manuscrit, date. `medal` : 'shell' | 'pearl' | None."""
    hi, mid, lo = metal
    accent = accent or mid
    h = 134 if message else 110
    x0, x1 = 270 - w / 2, 270 + w / 2
    d = rrect(x0, y, x1, y + h, 18)
    pg = card.grad("ins-pan", [(0, panel[0]), (1, panel[1])])
    out = [f'<path d="{d}" fill="{pg}" opacity="{panel_op}" filter="{card.shadow("ins-sh", 0, 8, 12, "#000000", 0.6)}"/>']
    fg = metal_grad(card, "ins-fr", metal)
    if style == "nacre":
        out.append(f'<g filter="{bevel(card, "ins-bv", 0.8, 2.0, shadow=False)}"><path d="{d}" fill="none" stroke="{fg}" stroke-width="3"/></g>')
        out.append(f'<path d="{rrect(x0 + 8, y + 8, x1 - 8, y + h - 8, 11)}" fill="none" stroke="{nacre_grad(card, "ins-nac", 0, 0, 1, 0)}" stroke-width="1.1" opacity="0.8"/>')
        for sx, sy in ((x0 + 3, y + 3), (x1 - 3, y + 3), (x0 + 3, y + h - 3), (x1 - 3, y + h - 3)):
            out.append(pearl(card, sx, sy, 6.5, "neutral", shadow=False))
        for sx in (x0, x1):
            out.append(f'<g filter="{bevel(card, "ins-bv2", 0.8, 2.0, shadow=False)}"><path d="M{f(sx)} {f(y + h / 2 - 12)} L{f(sx + 8)} {f(y + h / 2)} L{f(sx)} {f(y + h / 2 + 12)} L{f(sx - 8)} {f(y + h / 2)} Z" fill="{fg}"/></g>')
    elif style == "abysse":
        cg = card.grad("ins-cy", [(0, "#7FF6FF"), (0.5, hi), (1, "#7FF6FF")], 0, 0, 1, 0)
        out.append(f'<path d="{d}" fill="none" stroke="{cg}" stroke-width="1.8" opacity="0.95"/>')
        out.append(f'<path d="{d}" fill="none" stroke="#7FF6FF" stroke-width="5" opacity="0.35" filter="{blur(card, "ins-glw", 4)}"/>')
        out.append(f'<path d="{rrect(x0 + 7, y + 7, x1 - 7, y + h - 7, 12)}" fill="none" stroke="{hi}" stroke-width="0.7" opacity="0.45"/>')
        for sx, sy in ((x0 + 20, y + 20), (x1 - 20, y + 20), (x0 + 20, y + h - 20), (x1 - 20, y + h - 20)):
            out.append(sparkle(sx, sy, 5.5, "#BFFBFF", 0.9))
    elif style == "cosmos":
        pr = card.prism("ins-prism", 0, 0, 1, 1)
        out.append(f'<path d="{d}" fill="none" stroke="{pr}" stroke-width="2.4"/>')
        out.append(f'<path d="{d}" fill="none" stroke="{pr}" stroke-width="6" opacity="0.35" filter="{blur(card, "ins-glw", 4)}"/>')
        out.append(f'<path d="{rrect(x0 + 7, y + 7, x1 - 7, y + h - 7, 12)}" fill="none" stroke="#FFFFFF" stroke-width="0.7" opacity="0.4"/>')
    if medal == "pearl":
        out.append(f'<circle cx="270" cy="{f(y)}" r="13" fill="{fg}" filter="{bevel(card, "ins-md", 0.8, 2.2)}"/>')
        out.append(pearl(card, 270, y, 8.5, "neutral", shadow=False))
    if numero:
        pr = card.prism("ins-nb", 0, 0, 1, 0)
        out.append(
            f'<rect x="208" y="{f(y - 14)}" width="124" height="27" rx="13.5" fill="#05060F" opacity="0.92"/>'
            f'<rect x="208" y="{f(y - 14)}" width="124" height="27" rx="13.5" fill="none" stroke="{pr}" stroke-width="1.6"/>'
            f'<text x="270" y="{f(y + 5)}" text-anchor="middle" font-family="{CINZEL}" font-weight="700" font-size="14" letter-spacing="1.5" fill="#FFFFFF">{esc(numero)}</text>'
        )
    tg = card.grad("ins-title", [(0, hi), (0.55, hi), (1, mid)], 0, 0, 0, 1)
    tsh = card.shadow("ins-tsh", 0, 2, 2, "#000000", 0.8)
    ky = y + (33 if numero else 29)
    out.append(f'<text x="270" y="{f(ky)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="12" letter-spacing="4" fill="{accent}">{esc(kicker.upper())}</text>')
    out.append(f'<text x="270" y="{f(y + 72)}" text-anchor="middle" font-family="{title_font}" font-weight="700" font-size="{title_size}" fill="{tg}" filter="{tsh}">{esc(title)}</text>')
    if message:
        out.append(f'<text x="270" y="{f(y + 105)}" text-anchor="middle" font-family="{HAND}" font-weight="700" font-size="28" fill="{msg_color or ink}">{esc(message)}</text>')
        out.append(f'<text x="270" y="{f(y + 124)}" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="11.5" letter-spacing="1.2" fill="{accent}" opacity="0.92">{esc(date)}</text>')
    else:
        out.append(f'<text x="270" y="{f(y + 96)}" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="12.5" letter-spacing="1.2" fill="{accent}" opacity="0.92">{esc(date)}</text>')
    card.add("".join(out))
    return y + h
