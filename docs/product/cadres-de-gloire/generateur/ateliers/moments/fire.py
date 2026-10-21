"""Le feu : langues de flamme, champs de feu, braises, étincelles, fumée, rubans de flamme, écussons de feu."""

import math
import random

from base import W, H, f, pt, esc, sparkle, SANS, CINZEL
from kit import bevel, noise, wobble, metal_grad, halo, lgrad, smooth_closed, smooth_open, clip, ring_d, circle_d

FIRE = ("#8E1208", "#D8381A", "#FF8A1E", "#FFC75A")
GOLDFIRE = ("#B8281A", "#FF7A1E", "#FFC53D", "#FFF6D6")


def tongue_d(x, y, w, h, lean=0.0, curl=0.0):
    """Une langue de feu : base arrondie centrée en (x, y), pointe en (x + lean, y - h)."""
    tx, ty = x + lean, y - h
    return (
        f"M{f(x - w / 2)} {f(y)} "
        f"C{f(x - w * 0.66)} {f(y - h * 0.34)} {f(tx - w * 0.30 - curl)} {f(y - h * 0.64)} {f(tx)} {f(ty)} "
        f"C{f(tx + w * 0.10 + curl)} {f(y - h * 0.56)} {f(x + w * 0.64)} {f(y - h * 0.30)} {f(x + w / 2)} {f(y)} "
        f"Q{f(x)} {f(y + w * 0.28)} {f(x - w / 2)} {f(y)} Z"
    )


def feather_d(L, w, bend=0.0):
    """Une plume-flamme pointant vers le haut depuis (0, 0), longueur L, largeur w, cambrure `bend`."""
    return (
        f"M{f(-w * 0.18)} 0 C{f(-w * 0.62)} {f(-L * 0.22)} {f(-w * 0.52 + bend * 0.5)} {f(-L * 0.62)} {f(bend)} {f(-L)} "
        f"C{f(w * 0.30 + bend * 0.6)} {f(-L * 0.64)} {f(w * 0.62)} {f(-L * 0.26)} {f(w * 0.18)} 0 Z"
    )


LAYERS = ((1.0, 1.0, 0.72), (0.8, 0.82, 0.74), (0.6, 0.62, 0.78), (0.4, 0.4, 0.82))


def fire_grads(card, name, palette=FIRE):
    """Quatre dégradés verticaux, pointe transparente -> base pleine, du voile extérieur au cœur."""
    return [
        lgrad(card, f"{name}-l{k}", [(0, col, 0), (0.4, col, op * 0.75), (1, col, op)], 0, 0, 0, 1)
        for k, (col, (_, _, op)) in enumerate(zip(palette, LAYERS))
    ]


def fire_field(card, name, seed, spots, palette=FIRE, wob=("0.012 0.028", 26), glow=16, glow_op=0.7, blend=True, soft=0.9):
    """Un champ de feu. `spots` = [(x, y_base, w, h, lean)] ; chaque langue en quatre couches emboîtées, fondues en lumière."""
    rnd = random.Random(seed)
    grads = fire_grads(card, name, palette)
    groups = [[] for _ in LAYERS]
    for x, y, w, h, lean in spots:
        curl = rnd.uniform(-6, 6)
        for k, (sh, sw, _) in enumerate(LAYERS):
            groups[k].append(f'<path d="{tongue_d(x, y, w * sw, h * sh * rnd.uniform(0.94, 1.05), lean * sh, curl * sh)}" fill="{grads[k]}"/>')
    style = ' style="mix-blend-mode:screen"' if blend else ""
    wf = wobble(card, name + "-wb", wob[0], wob[1], seed % 97 + 1, 2, soft)
    out = []
    if glow:
        out.append(f'<g filter="{card.blur(name + "-gl", glow)}" opacity="{glow_op}"{style}>{"".join(groups[0])}</g>')
    out.extend(f'<g filter="{wf}"{style}>{"".join(g)}</g>' for g in groups)
    return "".join(out)


def fire_streaks(card, name, seed, region, color, op=1.0, freq="0.022 0.0045", a=3.0, b=-1.2):
    """Un voile de feu peint : un dégradé montant découpé dans un bruit étiré à la verticale."""
    x, y, w, h = region
    g = lgrad(card, name + "-sg", [(0, color, 0), (0.5, color, op * 0.6), (1, color, op)], 0, 0, 0, 1)
    return (
        f'<g filter="{noise(card, name + "-n", freq, 4, seed, a, b, (x - 20, y - 20, w + 40, h + 40))}" style="mix-blend-mode:screen">'
        f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="{g}"/></g>'
    )


def row_spots(seed, x0, x1, base, hfn, wmin=26, wmax=48, step=(10, 20), lean=10):
    """Des langues serrées le long d'une base horizontale ; `hfn(x)` donne la hauteur."""
    rnd = random.Random(seed)
    out = []
    x = x0
    while x < x1:
        w = rnd.uniform(wmin, wmax)
        out.append((x, base + rnd.uniform(-6, 6), w, hfn(x) * rnd.uniform(0.7, 1.15), rnd.uniform(-lean, lean)))
        x += rnd.uniform(*step)
    rnd.shuffle(out)
    out.sort(key=lambda s: -s[3])
    return out


def embers(seed, n, region, avoid=None, colors=("#FFD45A", "#FF8A1E", "#FFB347", "#FFF1B0"), rmin=0.6, rmax=2.4):
    """Braises volantes : un point chaud et son halo."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    glow, core = [], []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if avoid and avoid[0] < x < avoid[2] and avoid[1] < y < avoid[3]:
            continue
        r = rnd.uniform(rmin, rmax)
        c = rnd.choice(colors)
        glow.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 3.4)}" fill="{c}" opacity="{f(rnd.uniform(0.15, 0.4))}"/>')
        core.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{c}" opacity="{f(rnd.uniform(0.7, 1))}"/>')
    return "".join(glow), "".join(core)


def sparks(seed, n, region, avoid=None, colors=("#FFE9A0", "#FFB347", "#FFFFFF"), lmin=6, lmax=22, drift=(-30, 30)):
    """Étincelles : des traits courts, montants, légèrement courbes."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if avoid and avoid[0] < x < avoid[2] and avoid[1] < y < avoid[3]:
            continue
        L = rnd.uniform(lmin, lmax)
        a = rnd.uniform(*drift)
        x2, y2 = pt(x, y, L, a)
        mx, my = pt(x, y, L * 0.5, a + rnd.uniform(-25, 25))
        out.append(f'<path d="M{f(x)} {f(y)} Q{f(mx)} {f(my)} {f(x2)} {f(y2)}" fill="none" stroke="{rnd.choice(colors)}" stroke-width="{f(rnd.uniform(0.6, 1.6))}" stroke-linecap="round" opacity="{f(rnd.uniform(0.5, 1))}"/>')
    return "".join(out)


def ribbon(pts, w0, w1, closed_tip=True):
    """Un ruban effilé le long d'une polyligne : largeur w0 au départ, w1 à l'arrivée."""
    n = len(pts)
    left, right = [], []
    for i, (x, y) in enumerate(pts):
        a = pts[max(0, i - 1)]
        b = pts[min(n - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L, dx / L
        t = i / (n - 1)
        w = (w0 + (w1 - w0) * t) / 2
        left.append((x + nx * w, y + ny * w))
        right.append((x - nx * w, y - ny * w))
    return smooth_closed(left + right[::-1])


def smoke(card, name, seed, x, y0, y1, amp=26, w=34, color="#B9A6A0", op=0.22, turns=2.2):
    """Une volute de fumée : un ruban fin qui monte en ondulant, s'élargit et se dissout."""
    rnd = random.Random(seed)
    out = []
    for k in range(3):
        pts = []
        ph = rnd.uniform(0, 6)
        for i in range(18):
            t = i / 17
            pts.append((x + k * 6 + amp * t * math.sin(ph + t * turns * 2 * math.pi), y0 + (y1 - y0) * t))
        g = lgrad(card, f"{name}-g{k}", [(0, color, op), (0.6, color, op * 0.6), (1, color, 0)], 0, y0, 0, y1, "userSpaceOnUse")
        out.append(f'<path d="{ribbon(pts, 2 + k, w * (0.5 + 0.3 * k))}" fill="{g}"/>')
    return f'<g filter="{card.blur(name + "-b", 4)}">{"".join(out)}</g>'


def flame_shape_d(cx, cy, s):
    """La silhouette de l'écusson de feu : ventre rond, pointe en volute."""
    R = 58 * s
    by = cy + 18 * s
    return (
        f"M{f(cx - R)} {f(by)} A{f(R)} {f(R)} 0 0 0 {f(cx + R)} {f(by)} "
        f"C{f(cx + R)} {f(by - 44 * s)} {f(cx + 26 * s)} {f(cy - 40 * s)} {f(cx + 30 * s)} {f(cy - 74 * s)} "
        f"C{f(cx + 12 * s)} {f(cy - 60 * s)} {f(cx + 6 * s)} {f(cy - 78 * s)} {f(cx + 2 * s)} {f(cy - 104 * s)} "
        f"C{f(cx - 20 * s)} {f(cy - 74 * s)} {f(cx - 20 * s)} {f(cy - 58 * s)} {f(cx - 30 * s)} {f(cy - 48 * s)} "
        f"C{f(cx - 34 * s)} {f(cy - 62 * s)} {f(cx - 30 * s)} {f(cy - 70 * s)} {f(cx - 26 * s)} {f(cy - 80 * s)} "
        f"C{f(cx - 60 * s)} {f(cy - 52 * s)} {f(cx - R)} {f(by - 30 * s)} {f(cx - R)} {f(by)} Z"
    )


def days_number(card, name, cx, cy, number, size, fill, label="JOURS", label_fill="#FFE9B8", stroke="#3A0A04", sw=0):
    """Le nombre de jours, gravé, avec son libellé."""
    st = f' stroke="{stroke}" stroke-width="{sw}" paint-order="stroke"' if sw else ""
    return (
        f'<g filter="{bevel(card, name + "-bv", 0.9, 2.2, sd=2.5, dy=2, sop=0.85)}"><text x="{f(cx)}" y="{f(cy + size * 0.35)}" text-anchor="middle" '
        f'font-family="{CINZEL}" font-weight="700" font-size="{size}" fill="{fill}"{st}>{esc(str(number))}</text></g>'
        f'<text x="{f(cx)}" y="{f(cy + size * 0.35 + 15)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="8.5" letter-spacing="3" fill="{label_fill}">{label}</text>'
    )


def veins(card, name, freq="0.05", seed=3, a=7.0, b=-0.25, octaves=3):
    """Une croûte fendue : couvre la source sauf le long de fines veines (bruit de turbulence absolu)."""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" filterUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="turbulence" baseFrequency="{freq}" numOctaves="{octaves}" seed="{seed}" result="n"/>'
        f'<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  {a} 0 0 0 {b}" result="na"/>'
        f'<feComposite in="SourceGraphic" in2="na" operator="in"/></filter>',
    )
    return f"url(#{card.id(name)})"


def tall_spots(seed, x0, x1, base, hmin, hmax, wmin=36, wmax=64, step=(12, 22), lean=14):
    """Des langues hautes, toutes nées d'une même base (le bas du cadre)."""
    rnd = random.Random(seed)
    out = []
    x = x0
    while x < x1:
        out.append((x, base + rnd.uniform(-8, 8), rnd.uniform(wmin, wmax), rnd.uniform(hmin, hmax), rnd.uniform(-lean, lean)))
        x += rnd.uniform(*step)
    out.sort(key=lambda s: -s[3])
    return out
