import math
import random
import sys
from pathlib import Path

W, H = 540, 960
OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)

SERIF = "Georgia, 'Times New Roman', serif"
SANS = "'Avenir Next', 'Segoe UI', 'Helvetica Neue', sans-serif"


def f(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


def pt(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r * math.sin(a), cy - r * math.cos(a)


class Svg:
    def __init__(self):
        self.defs = []
        self.body = []

    def add(self, s):
        self.body.append(s)

    def grad(self, gid, stops, x1=0, y1=0, x2=0, y2=1):
        st = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
        self.defs.append(f'<linearGradient id="{gid}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{st}</linearGradient>')

    def rgrad(self, gid, stops, cx=0.5, cy=0.5, r=0.5):
        st = "".join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops)
        self.defs.append(f'<radialGradient id="{gid}" cx="{cx}" cy="{cy}" r="{r}">{st}</radialGradient>')

    def render(self):
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
            f'<defs>{"".join(self.defs)}'
            '<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>'
            '<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>'
            '<clipPath id="win"><rect x="0" y="0" width="540" height="960" rx="28"/></clipPath>'
            f'</defs><g clip-path="url(#win)">{"".join(self.body)}</g></svg>'
        )


METALS = {
    "slate": ("#E5E7EB", "#9CA3AF", "#4B5563"),
    "pewter": ("#F1F5F9", "#A8B2C1", "#56606F"),
    "bronze": ("#F6D2A8", "#C2834A", "#6B3E1E"),
    "copper": ("#FFD1B8", "#D9774A", "#7A3317"),
    "silver": ("#FFFFFF", "#C9D2DE", "#6D7889"),
    "jade": ("#D7FBEA", "#3FB68B", "#0E5A43"),
    "gold": ("#FFF4C2", "#E8B53C", "#8A5A12"),
    "rosegold": ("#FFE3D6", "#E59A7E", "#8B4A3A"),
    "prism": ("#FFFFFF", "#B9A7FF", "#4C3BC4"),
}


def metal(svg, key):
    hi, mid, lo = METALS[key]
    svg.grad(f"m-{key}", [(0, hi), (0.45, mid), (0.55, lo), (1, mid)], 0, 0, 1, 1)
    return f"url(#m-{key})", hi, mid, lo


def photo(svg, tone_top, tone_bottom, seed=1):
    svg.grad("bg", [(0, tone_top), (1, tone_bottom)])
    svg.add('<rect width="540" height="960" fill="url(#bg)"/>')
    svg.rgrad("halo", [(0, "#FFFFFF", 0.22), (1, "#FFFFFF", 0)], 0.5, 0.45, 0.5)
    svg.add('<ellipse cx="270" cy="470" rx="230" ry="260" fill="url(#halo)"/>')
    svg.add(
        '<g fill="#000" opacity="0.28">'
        '<circle cx="220" cy="440" r="64"/><path d="M110 700 Q120 540 220 530 Q320 540 330 700 Z"/>'
        '<circle cx="335" cy="470" r="52"/><path d="M250 720 Q258 585 335 576 Q412 585 420 720 Z"/></g>'
    )
    svg.add('<text x="270" y="612" text-anchor="middle" font-family="' + SANS + '" font-size="15" fill="#FFFFFF" opacity="0.5" letter-spacing="3">TA PHOTO · MEE &amp; MEO</text>')


def plaque(svg, kicker, title, fill, ink, edge, y=790, style="plain"):
    if style != "none":
        svg.add(f'<rect x="70" y="{y}" width="400" height="118" rx="20" fill="#0B0A1A" opacity="0.55"/>')
        svg.add(f'<rect x="70" y="{y}" width="400" height="118" rx="20" fill="none" stroke="{edge}" stroke-width="1.5" opacity="0.9"/>')
    svg.add(f'<text x="270" y="{y + 32}" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="15" letter-spacing="4" fill="{ink}">{kicker}</text>')
    svg.add(f'<text x="270" y="{y + 74}" text-anchor="middle" font-family="{SERIF}" font-weight="700" font-size="38" fill="{fill}">{title}</text>')
    svg.add(f'<text x="270" y="{y + 102}" text-anchor="middle" font-family="{SANS}" font-size="14" fill="{ink}" opacity="0.85">10 octobre 2026</text>')


def shield(svg, cx, cy, s, fill, edge, inner=None):
    d = (
        f"M{f(cx)} {f(cy - 62 * s)} L{f(cx + 52 * s)} {f(cy - 48 * s)} L{f(cx + 52 * s)} {f(cy + 8 * s)} "
        f"Q{f(cx + 52 * s)} {f(cy + 52 * s)} {f(cx)} {f(cy + 74 * s)} Q{f(cx - 52 * s)} {f(cy + 52 * s)} {f(cx - 52 * s)} {f(cy + 8 * s)} "
        f"L{f(cx - 52 * s)} {f(cy - 48 * s)} Z"
    )
    svg.add(f'<path d="{d}" fill="{fill}" stroke="{edge}" stroke-width="{f(3 * s)}"/>')
    if inner:
        svg.add(inner)


def signature(cx, cy, s, color):
    out = []
    for i, dx in enumerate((-14, 0, 14)):
        h = (16, 26, 16)[i] * s
        out.append(f'<line x1="{f(cx + dx * s)}" y1="{f(cy - h)}" x2="{f(cx + dx * s)}" y2="{f(cy + h)}" stroke="{color}" stroke-width="{f(7 * s)}" stroke-linecap="round"/>')
    return "".join(out)


def border(svg, m, color, w, r=22, opacity=1):
    svg.add(f'<rect x="{m}" y="{m}" width="{W - 2 * m}" height="{H - 2 * m}" rx="{r}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{opacity}"/>')


def vignette(svg, color, strength=0.75):
    svg.rgrad("vig", [(0.55, color, 0), (1, color, strength)], 0.5, 0.5, 0.75)
    svg.add('<rect width="540" height="960" fill="url(#vig)"/>')


def stars(svg, seed, n, region=(0, 0, W, H), color="#FFFFFF", rmax=1.8, avoid_center=True):
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if avoid_center and 80 < x < 460 and 260 < y < 760:
            continue
        r = rnd.uniform(0.4, rmax)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{color}" opacity="{f(rnd.uniform(0.35, 1))}"/>')
    svg.add("".join(out))


def sparkle(cx, cy, r, color, op=1):
    return (
        f'<path d="M{f(cx)} {f(cy - r)} Q{f(cx + r * 0.14)} {f(cy - r * 0.14)} {f(cx + r)} {f(cy)} Q{f(cx + r * 0.14)} {f(cy + r * 0.14)} {f(cx)} {f(cy + r)} '
        f'Q{f(cx - r * 0.14)} {f(cy + r * 0.14)} {f(cx - r)} {f(cy)} Q{f(cx - r * 0.14)} {f(cy - r * 0.14)} {f(cx)} {f(cy - r)} Z" fill="{color}" opacity="{op}"/>'
    )


# ---------- bands ----------

def meander_band(y, size, color, w, x0=40, x1=500):
    u = size
    d = []
    x = x0
    while x + 4 * u <= x1:
        d.append(
            f"M{f(x)} {f(y + 4 * u)} L{f(x)} {f(y)} L{f(x + 3 * u)} {f(y)} L{f(x + 3 * u)} {f(y + 3 * u)} L{f(x + u)} {f(y + 3 * u)} "
            f"L{f(x + u)} {f(y + u)} L{f(x + 2 * u)} {f(y + u)} L{f(x + 2 * u)} {f(y + 2 * u)}"
        )
        d.append(f"M{f(x)} {f(y + 4 * u)} L{f(x + 4 * u)} {f(y + 4 * u)}")
        x += 4 * u
    return f'<path d="{" ".join(d)}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linejoin="miter"/>'


def meander_vertical(x, size, color, w, y0, y1):
    u = size
    d = []
    y = y0
    while y + 4 * u <= y1:
        d.append(
            f"M{f(x + 4 * u)} {f(y)} L{f(x)} {f(y)} L{f(x)} {f(y + 3 * u)} L{f(x + 3 * u)} {f(y + 3 * u)} L{f(x + 3 * u)} {f(y + u)} "
            f"L{f(x + u)} {f(y + u)} L{f(x + u)} {f(y + 2 * u)} L{f(x + 2 * u)} {f(y + 2 * u)}"
        )
        d.append(f"M{f(x + 4 * u)} {f(y)} L{f(x + 4 * u)} {f(y + 4 * u)}")
        y += 4 * u
    return f'<path d="{" ".join(d)}" fill="none" stroke="{color}" stroke-width="{w}"/>'


def lotus_band(y, color, accent, x0=40, x1=500, step=46):
    out = []
    x = x0 + step / 2
    while x < x1:
        out.append(f'<path d="M{f(x)} {f(y - 26)} Q{f(x + 12)} {f(y - 6)} {f(x)} {f(y + 6)} Q{f(x - 12)} {f(y - 6)} {f(x)} {f(y - 26)} Z" fill="{color}"/>')
        out.append(f'<path d="M{f(x - 4)} {f(y + 4)} Q{f(x - 22)} {f(y - 4)} {f(x - 20)} {f(y - 18)} Q{f(x - 8)} {f(y - 8)} {f(x - 4)} {f(y + 4)} Z" fill="{accent}"/>')
        out.append(f'<path d="M{f(x + 4)} {f(y + 4)} Q{f(x + 22)} {f(y - 4)} {f(x + 20)} {f(y - 18)} Q{f(x + 8)} {f(y - 8)} {f(x + 4)} {f(y + 4)} Z" fill="{accent}"/>')
        out.append(f'<circle cx="{f(x + step / 2)}" cy="{f(y + 2)}" r="3" fill="{color}"/>')
        x += step
    out.append(f'<line x1="{x0}" y1="{y + 12}" x2="{x1}" y2="{y + 12}" stroke="{color}" stroke-width="2"/>')
    return "".join(out)


def interlace_band(y, color, under, x0=40, x1=500, amp=12, period=40, w=5):
    def wave(phase):
        pts = []
        x = x0
        while x <= x1:
            pts.append((x, y + amp * math.sin((x - x0) / period * 2 * math.pi + phase)))
            x += 4
        return "M" + " L".join(f"{f(a)} {f(b)}" for a, b in pts)

    return (
        f'<path d="{wave(0)}" fill="none" stroke="{under}" stroke-width="{w + 4}" stroke-linecap="round"/>'
        f'<path d="{wave(0)}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round"/>'
        f'<path d="{wave(math.pi)}" fill="none" stroke="{under}" stroke-width="{w + 4}" stroke-linecap="round"/>'
        f'<path d="{wave(math.pi)}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round"/>'
        f'<line x1="{x0}" y1="{y - amp - 8}" x2="{x1}" y2="{y - amp - 8}" stroke="{color}" stroke-width="1.5"/>'
        f'<line x1="{x0}" y1="{y + amp + 8}" x2="{x1}" y2="{y + amp + 8}" stroke="{color}" stroke-width="1.5"/>'
    )


def mandala(cx, cy, r, color, accent, petals=12):
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="none" stroke="{color}" stroke-width="2"/>']
    for i in range(petals):
        a = 360 / petals * i
        px, py = pt(cx, cy, r * 0.62, a)
        tx, ty = pt(cx, cy, r * 0.98, a)
        lx, ly = pt(cx, cy, r * 0.62, a - 360 / petals / 2)
        rx, ry = pt(cx, cy, r * 0.62, a + 360 / petals / 2)
        out.append(f'<path d="M{f(lx)} {f(ly)} Q{f(px)} {f(py)} {f(tx)} {f(ty)} Q{f(px)} {f(py)} {f(rx)} {f(ry)}" fill="none" stroke="{color}" stroke-width="2"/>')
        dx, dy = pt(cx, cy, r * 0.4, a)
        out.append(f'<circle cx="{f(dx)}" cy="{f(dy)}" r="{f(r * 0.06)}" fill="{accent}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.22)}" fill="{accent}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 0.62)}" fill="none" stroke="{color}" stroke-width="1.2"/>')
    return "".join(out)


def seigaiha_band(y0, rows, color, bg, r=22, x0=20, x1=520):
    out = []
    for row in range(rows):
        y = y0 + row * r * 0.5
        off = 0 if row % 2 == 0 else r
        x = x0 - r + off
        while x < x1 + r:
            for k in (1, 0.72, 0.44):
                out.append(f'<path d="M{f(x - r * k)} {f(y)} A{f(r * k)} {f(r * k)} 0 0 1 {f(x + r * k)} {f(y)}" fill="{bg if k == 1 else "none"}" stroke="{color}" stroke-width="1.6"/>')
            x += 2 * r
    return "".join(out)


def stepfret_band(y, color, accent, u=10, x0=40, x1=500, flip=False):
    out = []
    x = x0
    s = -1 if flip else 1
    while x + 6 * u <= x1:
        d = (
            f"M{f(x)} {f(y)} L{f(x)} {f(y - s * 3 * u)} L{f(x + u)} {f(y - s * 3 * u)} L{f(x + u)} {f(y - s * 2 * u)} L{f(x + 2 * u)} {f(y - s * 2 * u)} "
            f"L{f(x + 2 * u)} {f(y - s * u)} L{f(x + 3 * u)} {f(y - s * u)} L{f(x + 3 * u)} {f(y)} Z"
        )
        out.append(f'<path d="{d}" fill="{color}"/>')
        out.append(
            f'<path d="M{f(x + 3.6 * u)} {f(y - s * 0.4 * u)} L{f(x + 3.6 * u)} {f(y - s * 2.6 * u)} L{f(x + 5.6 * u)} {f(y - s * 2.6 * u)} L{f(x + 5.6 * u)} {f(y - s * 1.2 * u)} L{f(x + 4.6 * u)} {f(y - s * 1.2 * u)}" '
            f'fill="none" stroke="{accent}" stroke-width="{f(u * 0.45)}"/>'
        )
        x += 6 * u
    out.append(f'<line x1="{x0}" y1="{y + s * 3}" x2="{x1}" y2="{y + s * 3}" stroke="{color}" stroke-width="2.5"/>')
    return "".join(out)


def cloud_scroll(cx, cy, s, color, mirror=1):
    d = (
        f"M{f(cx)} {f(cy)} q{f(mirror * 18 * s)} {f(-26 * s)} {f(mirror * 40 * s)} {f(-6 * s)} q{f(mirror * 10 * s)} {f(14 * s)} {f(mirror * -6 * s)} {f(18 * s)} "
        f"q{f(mirror * -12 * s)} 0 {f(mirror * -8 * s)} {f(-10 * s)} M{f(cx)} {f(cy)} q{f(mirror * -14 * s)} {f(-30 * s)} {f(mirror * 10 * s)} {f(-44 * s)} "
        f"q{f(mirror * 22 * s)} {f(-8 * s)} {f(mirror * 26 * s)} {f(12 * s)} q{f(mirror * 2 * s)} {f(12 * s)} {f(mirror * -10 * s)} {f(12 * s)} q{f(mirror * -8 * s)} 0 {f(mirror * -6 * s)} {f(-8 * s)}"
    )
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{f(4 * s)}" stroke-linecap="round"/>'


def tree_branches(x, y0, y1, color, side=1, seed=3):
    rnd = random.Random(seed)
    out = [f'<path d="M{x} {y1} C{x + side * 6} {(y0 + y1) / 2} {x - side * 6} {(y0 + y1) / 2} {x} {y0}" fill="none" stroke="{color}" stroke-width="5" stroke-linecap="round"/>']
    for i in range(9):
        y = y0 + (y1 - y0) * (i + 0.5) / 9
        L = rnd.uniform(26, 48)
        out.append(f'<path d="M{x} {f(y)} q{f(side * L * 0.5)} {f(-L * 0.2)} {f(side * L)} {f(-L * 0.55)}" fill="none" stroke="{color}" stroke-width="2.5" stroke-linecap="round"/>')
        out.append(f'<circle cx="{f(x + side * L)}" cy="{f(y - L * 0.55)}" r="3" fill="{color}"/>')
    return "".join(out)


def runes(y, color, x0=90, x1=450, seed=9):
    rnd = random.Random(seed)
    out = []
    x = x0
    while x < x1:
        h = 18
        k = rnd.randint(0, 4)
        segs = [f"M{f(x)} {f(y)} l0 {h}"]
        if k == 0:
            segs.append(f"M{f(x)} {f(y)} l9 6 M{f(x)} {f(y + 7)} l9 6")
        elif k == 1:
            segs.append(f"M{f(x)} {f(y + 4)} l9 -4 l0 {h}")
        elif k == 2:
            segs.append(f"M{f(x)} {f(y + 9)} l9 -9 M{f(x)} {f(y + 9)} l9 9")
        elif k == 3:
            segs.append(f"M{f(x - 5)} {f(y + 6)} l10 6")
        else:
            segs.append(f"M{f(x)} {f(y)} l9 9 l-9 9")
        out.append(f'<path d="{" ".join(segs)}" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round"/>')
        x += 22
    return "".join(out)


# ---------- African motifs ----------

def kente_strip(x, y0, y1, w, colors, seed=1):
    rnd = random.Random(seed)
    out = []
    y = y0
    i = 0
    while y < y1:
        h = rnd.choice((14, 18, 22, 30))
        c = colors[i % len(colors)]
        out.append(f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(min(h, y1 - y))}" fill="{c}"/>')
        if h >= 22:
            for k in range(3):
                out.append(f'<rect x="{f(x + w * (0.15 + 0.3 * k))}" y="{f(y + 4)}" width="{f(w * 0.12)}" height="{f(h - 8)}" fill="{colors[(i + 2) % len(colors)]}"/>')
        else:
            out.append(f'<line x1="{f(x)}" y1="{f(y + h / 2)}" x2="{f(x + w)}" y2="{f(y + h / 2)}" stroke="{colors[(i + 1) % len(colors)]}" stroke-width="2" stroke-dasharray="4 3"/>')
        y += h
        i += 1
    return "".join(out)


def kente_band_h(y, h, colors, seed=1, x0=0, x1=W):
    rnd = random.Random(seed)
    out = []
    x = x0
    i = 0
    while x < x1:
        w = rnd.choice((14, 18, 22, 30))
        c = colors[i % len(colors)]
        out.append(f'<rect x="{f(x)}" y="{f(y)}" width="{f(min(w, x1 - x))}" height="{f(h)}" fill="{c}"/>')
        if w >= 22:
            for k in range(3):
                out.append(f'<rect x="{f(x + 4)}" y="{f(y + h * (0.15 + 0.3 * k))}" width="{f(w - 8)}" height="{f(h * 0.12)}" fill="{colors[(i + 2) % len(colors)]}"/>')
        x += w
        i += 1
    return "".join(out)


def ram_horns(cx, cy, s, color):
    """Dwennimmen — les cornes du bélier : force et humilité."""
    def horn(m):
        return (
            f"M{f(cx)} {f(cy - 4 * s)} C{f(cx + m * 18 * s)} {f(cy - 30 * s)} {f(cx + m * 46 * s)} {f(cy - 18 * s)} {f(cx + m * 44 * s)} {f(cy + 6 * s)} "
            f"C{f(cx + m * 42 * s)} {f(cy + 24 * s)} {f(cx + m * 22 * s)} {f(cy + 22 * s)} {f(cx + m * 22 * s)} {f(cy + 8 * s)} "
            f"C{f(cx + m * 22 * s)} {f(cy - 2 * s)} {f(cx + m * 32 * s)} {f(cy - 2 * s)} {f(cx + m * 32 * s)} {f(cy + 6 * s)}"
        )
    return (
        f'<path d="{horn(1)}" fill="none" stroke="{color}" stroke-width="{f(5 * s)}" stroke-linecap="round"/>'
        f'<path d="{horn(-1)}" fill="none" stroke="{color}" stroke-width="{f(5 * s)}" stroke-linecap="round"/>'
        f'<path d="M{f(cx)} {f(cy - 4 * s)} L{f(cx)} {f(cy + 30 * s)}" stroke="{color}" stroke-width="{f(5 * s)}" stroke-linecap="round"/>'
    )


def sankofa_heart(cx, cy, s, color):
    """Sankofa — retourner chercher ce qu'on a laissé : le carnet de route."""
    return (
        f'<path d="M{f(cx)} {f(cy + 30 * s)} C{f(cx - 40 * s)} {f(cy + 6 * s)} {f(cx - 38 * s)} {f(cy - 26 * s)} {f(cx - 14 * s)} {f(cy - 24 * s)} '
        f'C{f(cx - 4 * s)} {f(cy - 23 * s)} {f(cx)} {f(cy - 14 * s)} {f(cx)} {f(cy - 10 * s)} C{f(cx)} {f(cy - 14 * s)} {f(cx + 4 * s)} {f(cy - 23 * s)} {f(cx + 14 * s)} {f(cy - 24 * s)} '
        f'C{f(cx + 38 * s)} {f(cy - 26 * s)} {f(cx + 40 * s)} {f(cy + 6 * s)} {f(cx)} {f(cy + 30 * s)} Z" fill="none" stroke="{color}" stroke-width="{f(4 * s)}"/>'
        f'<path d="M{f(cx - 14 * s)} {f(cy - 24 * s)} c{f(-10 * s)} {f(-8 * s)} {f(-4 * s)} {f(-20 * s)} {f(6 * s)} {f(-16 * s)}" fill="none" stroke="{color}" stroke-width="{f(4 * s)}" stroke-linecap="round"/>'
        f'<path d="M{f(cx + 14 * s)} {f(cy - 24 * s)} c{f(10 * s)} {f(-8 * s)} {f(4 * s)} {f(-20 * s)} {f(-6 * s)} {f(-16 * s)}" fill="none" stroke="{color}" stroke-width="{f(4 * s)}" stroke-linecap="round"/>'
        f'<circle cx="{f(cx - 22 * s)}" cy="{f(cy + 10 * s)}" r="{f(3.5 * s)}" fill="{color}"/><circle cx="{f(cx + 22 * s)}" cy="{f(cy + 10 * s)}" r="{f(3.5 * s)}" fill="{color}"/>'
    )


def gye_nyame_like(cx, cy, s, color):
    """Une étoile d'Adinkra simplifiée (Nsoromma — l'enfant des cieux)."""
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(9 * s)}" fill="{color}"/>']
    for i in range(8):
        a = 45 * i
        x1, y1 = pt(cx, cy, 14 * s, a)
        x2, y2 = pt(cx, cy, 30 * s, a)
        lx, ly = pt(cx, cy, 22 * s, a - 12)
        out.append(f'<path d="M{f(x1)} {f(y1)} Q{f(lx)} {f(ly)} {f(x2)} {f(y2)}" fill="none" stroke="{color}" stroke-width="{f(4 * s)}" stroke-linecap="round"/>')
    return "".join(out)


def ndebele_band(y, h, x0, x1, palette, seed=4):
    rnd = random.Random(seed)
    out = [f'<rect x="{x0}" y="{y}" width="{x1 - x0}" height="{h}" fill="#F7F1E3"/>']
    x = x0
    i = 0
    while x < x1:
        w = rnd.choice((34, 44, 52))
        c = palette[i % len(palette)]
        k = i % 3
        if k == 0:
            out.append(f'<path d="M{f(x + 4)} {f(y + h - 6)} L{f(x + w / 2)} {f(y + 6)} L{f(x + w - 4)} {f(y + h - 6)} Z" fill="{c}" stroke="#141414" stroke-width="3"/>')
        elif k == 1:
            out.append(f'<rect x="{f(x + 6)}" y="{f(y + 6)}" width="{f(w - 12)}" height="{f(h - 12)}" fill="{c}" stroke="#141414" stroke-width="3"/>')
            out.append(f'<rect x="{f(x + w / 2 - 5)}" y="{f(y + 12)}" width="10" height="{f(h - 24)}" fill="#F7F1E3" stroke="#141414" stroke-width="2"/>')
        else:
            out.append(f'<path d="M{f(x + 6)} {f(y + 6)} L{f(x + w - 6)} {f(y + 6)} L{f(x + w - 6)} {f(y + h / 2)} L{f(x + w / 2)} {f(y + h - 6)} L{f(x + 6)} {f(y + h / 2)} Z" fill="{c}" stroke="#141414" stroke-width="3"/>')
        out.append(f'<line x1="{f(x + w)}" y1="{y}" x2="{f(x + w)}" y2="{y + h}" stroke="#141414" stroke-width="4"/>')
        x += w
        i += 1
    out.append(f'<rect x="{x0}" y="{y}" width="{x1 - x0}" height="{h}" fill="none" stroke="#141414" stroke-width="5"/>')
    return "".join(out)


def ndebele_band_v(x, w, y0, y1, palette, seed=5):
    rnd = random.Random(seed)
    out = [f'<rect x="{x}" y="{y0}" width="{w}" height="{y1 - y0}" fill="#F7F1E3"/>']
    y = y0
    i = 0
    while y < y1:
        h = rnd.choice((34, 44, 52))
        c = palette[i % len(palette)]
        if i % 2 == 0:
            out.append(f'<path d="M{f(x + 6)} {f(y + 4)} L{f(x + w - 6)} {f(y + h / 2)} L{f(x + 6)} {f(y + h - 4)} Z" fill="{c}" stroke="#141414" stroke-width="3"/>')
        else:
            out.append(f'<rect x="{f(x + 6)}" y="{f(y + 6)}" width="{f(w - 12)}" height="{f(h - 12)}" fill="{c}" stroke="#141414" stroke-width="3"/>')
        out.append(f'<line x1="{x}" y1="{f(y + h)}" x2="{x + w}" y2="{f(y + h)}" stroke="#141414" stroke-width="4"/>')
        y += h
        i += 1
    out.append(f'<rect x="{x}" y="{y0}" width="{w}" height="{y1 - y0}" fill="none" stroke="#141414" stroke-width="5"/>')
    return "".join(out)


def bogolan_field(x0, y0, x1, y1, ink, seed=7):
    rnd = random.Random(seed)
    out = []
    y = y0 + 10
    row = 0
    while y < y1 - 10:
        k = row % 4
        if k == 0:
            out.append(f'<path d="M{x0 + 6} {f(y)} ' + " ".join(f"L{f(x)} {f(y + (6 if (j % 2) else -6))}" for j, x in enumerate(range(x0 + 14, x1 - 6, 8))) + f'" fill="none" stroke="{ink}" stroke-width="2.4"/>')
        elif k == 1:
            for x in range(x0 + 10, x1 - 6, 12):
                out.append(f'<circle cx="{x}" cy="{f(y)}" r="2.6" fill="{ink}"/>')
        elif k == 2:
            for x in range(x0 + 12, x1 - 8, 22):
                out.append(f'<path d="M{x - 6} {f(y)} l12 0 M{x} {f(y - 6)} l0 12" stroke="{ink}" stroke-width="2.4"/>')
        else:
            out.append(f'<line x1="{x0 + 4}" y1="{f(y)}" x2="{x1 - 4}" y2="{f(y)}" stroke="{ink}" stroke-width="4"/>')
        y += 18
        row += 1
    return "".join(out)


def kanaga(cx, cy, s, color):
    """Le masque Kanaga des Dogon : le ciel et la terre reliés."""
    return (
        f'<path d="M{f(cx)} {f(cy - 50 * s)} L{f(cx)} {f(cy + 50 * s)} M{f(cx - 36 * s)} {f(cy - 28 * s)} L{f(cx + 36 * s)} {f(cy - 28 * s)} '
        f'M{f(cx - 36 * s)} {f(cy + 22 * s)} L{f(cx + 36 * s)} {f(cy + 22 * s)} M{f(cx - 36 * s)} {f(cy - 28 * s)} l0 {f(-16 * s)} M{f(cx + 36 * s)} {f(cy - 28 * s)} l0 {f(-16 * s)} '
        f'M{f(cx - 36 * s)} {f(cy + 22 * s)} l0 {f(16 * s)} M{f(cx + 36 * s)} {f(cy + 22 * s)} l0 {f(16 * s)}" fill="none" stroke="{color}" stroke-width="{f(5 * s)}" stroke-linecap="round"/>'
        f'<rect x="{f(cx - 9 * s)}" y="{f(cy - 72 * s)}" width="{f(18 * s)}" height="{f(22 * s)}" rx="{f(4 * s)}" fill="{color}"/>'
    )


def serpent(path_pts, color, scale_color, w=10):
    d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in path_pts)
    out = [f'<path d="{d}" fill="none" stroke="#06221F" stroke-width="{w + 5}" stroke-linecap="round" stroke-linejoin="round"/>',
           f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>',
           f'<path d="{d}" fill="none" stroke="{scale_color}" stroke-width="{w * 0.35}" stroke-dasharray="3 7" stroke-linecap="round"/>']
    return "".join(out)


def baobab(x, y, s, color, mirror=1):
    out = [
        f'<path d="M{f(x - 22 * s)} {f(y)} C{f(x - 26 * s)} {f(y - 60 * s)} {f(x - 18 * s)} {f(y - 120 * s)} {f(x - 14 * s)} {f(y - 150 * s)} '
        f'L{f(x + 14 * s)} {f(y - 150 * s)} C{f(x + 18 * s)} {f(y - 120 * s)} {f(x + 26 * s)} {f(y - 60 * s)} {f(x + 22 * s)} {f(y)} Z" fill="{color}"/>'
    ]
    for a, L in ((-55, 60), (-25, 74), (5, 66), (35, 72), (62, 56)):
        bx, by = pt(x, y - 150 * s, L * s, a)
        out.append(f'<path d="M{f(x)} {f(y - 146 * s)} Q{f((x + bx) / 2)} {f(by + 12 * s)} {f(bx)} {f(by)}" fill="none" stroke="{color}" stroke-width="{f(7 * s)}" stroke-linecap="round"/>')
        for b in (-28, 0, 28):
            tx, ty = pt(bx, by, 18 * s, a + b)
            out.append(f'<path d="M{f(bx)} {f(by)} L{f(tx)} {f(ty)}" stroke="{color}" stroke-width="{f(3 * s)}" stroke-linecap="round"/>')
    for r in (-40, -14, 14, 40):
        out.append(f'<path d="M{f(x + r * 0.35 * s)} {f(y)} q{f(r * 0.6 * s)} {f(10 * s)} {f(r * s)} {f(22 * s)}" fill="none" stroke="{color}" stroke-width="{f(4 * s)}" stroke-linecap="round"/>')
    return "".join(out)


def galaxy(cx, cy, r, color, arms=3, tilt=0.45, rot=0, seed=11, n=260):
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        arm = i % arms
        t = rnd.random() ** 0.7
        ang = rot + arm * 2 * math.pi / arms + t * 3.4 + rnd.gauss(0, 0.22)
        rr = t * r
        x = cx + rr * math.cos(ang)
        y = cy + rr * math.sin(ang) * tilt
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(0.5, 1.9) * (1.2 - t))}" fill="{color}" opacity="{f(0.35 + 0.6 * (1 - t))}"/>')
    return "".join(out)


def nebula(svg, gid, cx, cy, rx, ry, c1, c2, op=0.8):
    svg.rgrad(gid, [(0, c1, op), (0.5, c2, op * 0.5), (1, c2, 0)])
    svg.add(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="url(#{gid})"/>')


# ---------- the cards ----------

def card(name, build):
    svg = Svg()
    build(svg)
    (OUT / f"{name}.svg").write_text(svg.render())


def murmure_a(svg):
    photo(svg, "#3B4252", "#1E222B")
    border(svg, 24, "#E5E7EB", 2)
    shield(svg, 270, 120, 0.9, metal(svg, "slate")[0], "#E5E7EB", signature(270, 124, 0.8, "#1F2937"))
    plaque(svg, "NOUVEAU RANG", "Murmure IV", "#FFFFFF", "#E5E7EB", "#9CA3AF")


def murmure_b(svg):
    photo(svg, "#3B4252", "#1E222B")
    svg.add('<path d="M24 120 L24 46 Q24 24 46 24 L240 24 M300 24 L494 24 Q516 24 516 46 L516 120 M516 840 L516 914 Q516 936 494 936 L46 936 Q24 936 24 914 L24 840" fill="none" stroke="#E5E7EB" stroke-width="2"/>')
    svg.add('<circle cx="270" cy="24" r="4" fill="#E5E7EB"/>')
    shield(svg, 270, 120, 0.9, metal(svg, "slate")[0], "#E5E7EB", signature(270, 124, 0.8, "#1F2937"))
    plaque(svg, "NOUVEAU RANG", "Murmure IV", "#FFFFFF", "#E5E7EB", "#9CA3AF")


def echo_a(svg):
    photo(svg, "#334155", "#111827")
    border(svg, 20, "#CBD5E1", 2.5)
    border(svg, 32, "#CBD5E1", 1, r=16, opacity=0.7)
    for cx, cy in ((32, 32), (508, 32), (32, 928), (508, 928)):
        svg.add(f'<circle cx="{cx}" cy="{cy}" r="7" fill="#0F172A" stroke="#CBD5E1" stroke-width="2"/>')
    shield(svg, 270, 120, 0.9, metal(svg, "pewter")[0], "#F1F5F9", signature(270, 124, 0.8, "#1F2937"))
    plaque(svg, "NOUVEAU RANG", "Écho V", "#FFFFFF", "#E2E8F0", "#A8B2C1")


def echo_b(svg):
    photo(svg, "#334155", "#111827")
    border(svg, 24, "#CBD5E1", 2)
    for cx, cy, a0 in ((24, 24, 90), (516, 24, 180), (24, 936, 0), (516, 936, 270)):
        for r in (30, 46, 62):
            x1, y1 = pt(cx, cy, r, a0)
            x2, y2 = pt(cx, cy, r, a0 + 90)
            svg.add(f'<path d="M{f(x1)} {f(y1)} A{r} {r} 0 0 1 {f(x2)} {f(y2)}" fill="none" stroke="#CBD5E1" stroke-width="{2.4 - r / 40}" opacity="{1 - r / 90}"/>')
    shield(svg, 270, 120, 0.9, metal(svg, "pewter")[0], "#F1F5F9", signature(270, 124, 0.8, "#1F2937"))
    plaque(svg, "NOUVEAU RANG", "Écho V", "#FFFFFF", "#E2E8F0", "#A8B2C1")


def voix_a(svg):
    photo(svg, "#3A2A1E", "#120C08")
    fill, hi, mid, lo = metal(svg, "bronze")
    svg.add(f'<rect x="16" y="16" width="508" height="44" fill="#1A120C" opacity="0.6"/><rect x="16" y="900" width="508" height="44" fill="#1A120C" opacity="0.6"/>')
    svg.add(meander_band(24, 7, mid, 2.6, 22, 518))
    svg.add(meander_band(908, 7, mid, 2.6, 22, 518))
    border(svg, 16, mid, 2.5)
    shield(svg, 270, 150, 0.95, fill, hi, signature(270, 154, 0.85, lo))
    plaque(svg, "NOUVEAU RANG", "Voix III", hi, "#F6D2A8", mid)


def voix_b(svg):
    photo(svg, "#2E3A2C", "#0E140D")
    fill, hi, mid, lo = metal(svg, "bronze")
    svg.add('<rect x="16" y="16" width="508" height="58" fill="#0E140D" opacity="0.6"/><rect x="16" y="886" width="508" height="58" fill="#0E140D" opacity="0.6"/>')
    svg.add(lotus_band(50, mid, "#3FB68B", 22, 518))
    svg.add(f'<g transform="translate(0 960) scale(1 -1)">{lotus_band(50, mid, "#3FB68B", 22, 518)}</g>')
    border(svg, 16, mid, 2.5)
    shield(svg, 270, 160, 0.95, fill, hi, signature(270, 164, 0.85, lo))
    plaque(svg, "NOUVEAU RANG", "Voix III", hi, "#F6D2A8", mid)


def conteur_a(svg):
    photo(svg, "#1F3B33", "#0A1612")
    fill, hi, mid, lo = metal(svg, "copper")
    svg.add('<rect x="14" y="14" width="512" height="62" fill="#0A1612" opacity="0.65"/><rect x="14" y="884" width="512" height="62" fill="#0A1612" opacity="0.65"/>')
    svg.add(interlace_band(45, mid, "#0A1612", 22, 518))
    svg.add(interlace_band(915, mid, "#0A1612", 22, 518))
    for x in (14, 526):
        svg.add(f'<line x1="{x}" y1="76" x2="{x}" y2="884" stroke="{mid}" stroke-width="3"/>')
    for cx, cy in ((44, 45), (496, 45), (44, 915), (496, 915)):
        svg.add(f'<circle cx="{cx}" cy="{cy}" r="17" fill="#0A1612" stroke="{mid}" stroke-width="3"/><circle cx="{cx}" cy="{cy}" r="7" fill="none" stroke="{hi}" stroke-width="2"/>')
    shield(svg, 270, 165, 1, fill, hi, signature(270, 169, 0.9, lo))
    plaque(svg, "NOUVEAU RANG", "Conteur II", hi, "#FFD1B8", mid)


def conteur_b(svg):
    photo(svg, "#3B1F33", "#160A13")
    fill, hi, mid, lo = metal(svg, "copper")
    border(svg, 18, mid, 3)
    border(svg, 28, mid, 1.2, r=16)
    for cx, cy in ((70, 70), (470, 70), (70, 890), (470, 890)):
        svg.add(f'<circle cx="{cx}" cy="{cy}" r="56" fill="#160A13" opacity="0.7"/>')
        svg.add(mandala(cx, cy, 50, mid, "#E9A23B", 12))
    shield(svg, 270, 150, 1, fill, hi, signature(270, 154, 0.9, lo))
    plaque(svg, "NOUVEAU RANG", "Conteur II", hi, "#FFD1B8", mid)


def passeur_a(svg):
    photo(svg, "#24324A", "#0A1020")
    fill, hi, mid, lo = metal(svg, "silver")
    border(svg, 18, mid, 3)
    svg.add(f'<rect x="18" y="18" width="70" height="924" fill="#0A1020" opacity="0.5"/><rect x="452" y="18" width="70" height="924" fill="#0A1020" opacity="0.5"/>')
    svg.add(tree_branches(54, 90, 870, mid, 1, 3))
    svg.add(tree_branches(486, 90, 870, mid, -1, 5))
    svg.add(runes(40, hi, 120, 430, 9))
    svg.add(runes(902, hi, 120, 430, 12))
    shield(svg, 270, 165, 1, fill, hi, signature(270, 169, 0.9, lo))
    plaque(svg, "NOUVEAU RANG", "Passeur I", hi, "#E5ECF5", mid)


def passeur_b(svg):
    photo(svg, "#3A1D1D", "#140808")
    fill, hi, mid, lo = metal(svg, "silver")
    red = "#C8332B"
    border(svg, 16, red, 6)
    border(svg, 28, mid, 2, r=16)
    for (cx, cy, m) in ((50, 70, 1), (490, 70, -1), (50, 900, 1), (490, 900, -1)):
        svg.add(cloud_scroll(cx, cy, 1.4, mid, m))
        svg.add(cloud_scroll(cx + m * 40, cy + (24 if cy < 400 else -24), 0.9, hi, m))
    svg.add(f'<circle cx="270" cy="58" r="30" fill="{red}" opacity="0.9"/>')
    shield(svg, 270, 170, 1, fill, hi, signature(270, 174, 0.9, lo))
    plaque(svg, "NOUVEAU RANG", "Passeur I", hi, "#F5E6E6", mid)


def polyglotte_a(svg):
    photo(svg, "#123B4A", "#04141B")
    fill, hi, mid, lo = metal(svg, "jade")
    svg.add('<rect x="0" y="0" width="540" height="96" fill="#0B2A35"/><rect x="0" y="864" width="540" height="96" fill="#0B2A35"/>')
    svg.add(seigaiha_band(30, 5, mid, "#0B2A35", 22))
    svg.add(f'<g transform="translate(0 960) scale(1 -1)">{seigaiha_band(30, 5, mid, "#0B2A35", 22)}</g>')
    svg.add('<circle cx="270" cy="230" r="120" fill="#D94A3A" opacity="0.18"/>')
    border(svg, 14, mid, 3)
    shield(svg, 270, 175, 1.05, fill, hi, signature(270, 179, 0.95, lo))
    plaque(svg, "NOUVEAU RANG", "Polyglotte V", hi, "#D7FBEA", mid)


def polyglotte_b(svg):
    photo(svg, "#3D2B12", "#140D04")
    fill, hi, mid, lo = metal(svg, "jade")
    svg.add('<rect x="0" y="0" width="540" height="70" fill="#7A3B12"/><rect x="0" y="890" width="540" height="70" fill="#7A3B12"/>')
    svg.add(stepfret_band(54, mid, "#F2C14E", 10, 20, 520))
    svg.add(stepfret_band(906, mid, "#F2C14E", 10, 20, 520, flip=True))
    svg.add('<rect x="0" y="70" width="22" height="820" fill="#7A3B12"/><rect x="518" y="70" width="22" height="820" fill="#7A3B12"/>')
    for y in range(90, 880, 34):
        svg.add(f'<rect x="6" y="{y}" width="10" height="18" fill="{mid}"/><rect x="524" y="{y}" width="10" height="18" fill="{mid}"/>')
    shield(svg, 270, 165, 1.05, fill, hi, signature(270, 169, 0.95, lo))
    plaque(svg, "NOUVEAU RANG", "Polyglotte V", hi, "#FCE7B4", mid)


KENTE = ("#E8B53C", "#1F7A3A", "#B3261E", "#111111")


def laurel(cx, cy, r, color):
    out = []
    for m in (1, -1):
        for i in range(6):
            a = m * (110 + i * 22)
            x, y = pt(cx, cy, r, a)
            out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="7" ry="15" fill="{color}" transform="rotate({f(a + m * 35)} {f(x)} {f(y)})"/>')
    return "".join(out)


def ambassadeur_a(svg):
    photo(svg, "#4A2A10", "#170B03")
    fill, hi, mid, lo = metal(svg, "gold")
    svg.add(kente_strip(0, 0, 960, 44, KENTE, 1))
    svg.add(kente_strip(496, 0, 960, 44, KENTE, 2))
    svg.add(kente_band_h(0, 40, KENTE, 3, 44, 496))
    svg.add(kente_band_h(920, 40, KENTE, 4, 44, 496))
    svg.add(f'<rect x="44" y="40" width="452" height="880" fill="none" stroke="{hi}" stroke-width="3"/>')
    svg.add('<path d="M180 40 L180 120 Q270 160 360 120 L360 40 Z" fill="#170B03" opacity="0.8"/>')
    svg.add(ram_horns(110, 110, 0.9, hi))
    svg.add(ram_horns(430, 110, 0.9, hi))
    svg.add(sankofa_heart(110, 860, 0.9, hi))
    svg.add(sankofa_heart(430, 860, 0.9, hi))
    svg.add(laurel(270, 150, 92, mid))
    shield(svg, 270, 150, 1.1, fill, hi, signature(270, 154, 1, lo))
    plaque(svg, "NOUVEAU RANG", "Ambassadeur IV", hi, "#FCE7B4", mid, y=760)


def ambassadeur_b(svg):
    photo(svg, "#3A2416", "#120A05")
    fill, hi, mid, lo = metal(svg, "gold")
    pal = ("#E8B53C", "#1E4FA8", "#B3261E", "#1F7A3A", "#111111")
    svg.add(ndebele_band(0, 74, 0, 540, pal, 4))
    svg.add(ndebele_band(886, 74, 0, 540, pal[::-1], 6))
    svg.add(ndebele_band_v(0, 46, 74, 886, pal, 7))
    svg.add(ndebele_band_v(494, 46, 74, 886, pal[::-1], 8))
    svg.add(laurel(270, 165, 92, mid))
    shield(svg, 270, 165, 1.1, fill, hi, signature(270, 169, 1, lo))
    plaque(svg, "NOUVEAU RANG", "Ambassadeur IV", hi, "#FCE7B4", mid, y=760)


def rays(cx, cy, r0, r1, n, color, w, a0=-60, a1=60):
    out = []
    for i in range(n):
        a = a0 + (a1 - a0) * i / (n - 1)
        x1, y1 = pt(cx, cy, r0, a)
        x2, y2 = pt(cx, cy, r1 if i % 2 == 0 else r1 * 0.82, a)
        out.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{color}" stroke-width="{w}" stroke-linecap="round"/>')
    return "".join(out)


def orateur_a(svg):
    photo(svg, "#2A1A3E", "#0C0614")
    fill, hi, mid, lo = metal(svg, "gold")
    vignette(svg, "#0C0614", 0.6)
    svg.add('<path d="M120 0 Q270 120 420 0 Z" fill="#6B3E1E"/>')
    svg.add(f'<path d="M120 0 Q270 120 420 0" fill="none" stroke="{hi}" stroke-width="3"/>')
    for i in range(11):
        x = 34 + i * 2.2
        svg.add(f'<line x1="{f(x)}" y1="70" x2="{f(x + 6)}" y2="900" stroke="{hi}" stroke-width="1.2" opacity="0.8"/>')
        svg.add(f'<line x1="{f(506 - i * 2.2)}" y1="70" x2="{f(500 - i * 2.2)}" y2="900" stroke="{hi}" stroke-width="1.2" opacity="0.8"/>')
    for y in range(100, 900, 60):
        svg.add(f'<rect x="28" y="{y}" width="38" height="6" rx="3" fill="{mid}"/><rect x="474" y="{y}" width="38" height="6" rx="3" fill="{mid}"/>')
    svg.add(rays(270, 190, 104, 150, 13, mid, 4, -70, 70))
    svg.add(f'<ellipse cx="270" cy="950" rx="200" ry="60" fill="#6B3E1E"/><ellipse cx="270" cy="950" rx="200" ry="60" fill="none" stroke="{hi}" stroke-width="3"/>')
    svg.add(laurel(270, 190, 92, mid))
    shield(svg, 270, 190, 1.15, fill, hi, signature(270, 194, 1.05, lo))
    plaque(svg, "NOUVEAU RANG", "Orateur III", hi, "#FCE7B4", mid, y=740)


def orateur_b(svg):
    svg.grad("bg", [(0, "#C9A27A"), (1, "#6E4A2C")])
    svg.add('<rect width="540" height="960" fill="url(#bg)"/>')
    fill, hi, mid, lo = metal(svg, "gold")
    svg.add('<rect x="0" y="0" width="540" height="960" fill="#2B1A0E"/>')
    svg.add(bogolan_field(0, 0, 540, 140, "#E8D5B5", 7))
    svg.add(bogolan_field(0, 820, 540, 960, "#E8D5B5", 8))
    svg.add('<rect x="0" y="140" width="56" height="680" fill="#2B1A0E"/><rect x="484" y="140" width="56" height="680" fill="#2B1A0E"/>')
    svg.add(f'<g>{bogolan_field(0, 140, 56, 820, "#E8D5B5", 9)}</g><g>{bogolan_field(484, 140, 540, 820, "#E8D5B5", 10)}</g>')
    inner = Svg()
    photo(inner, "#4A3220", "#1C1108")
    svg.defs.extend(inner.defs)
    svg.add(f'<svg x="56" y="140" width="428" height="680" viewBox="56 140 428 680" preserveAspectRatio="xMidYMid slice">{"".join(inner.body)}</svg>')
    svg.add(f'<rect x="56" y="140" width="428" height="680" fill="none" stroke="{hi}" stroke-width="3"/>')
    svg.add(rays(270, 150, 96, 136, 13, mid, 4, -70, 70))
    svg.add(laurel(270, 150, 88, mid))
    shield(svg, 270, 150, 1.1, fill, hi, signature(270, 154, 1, lo))
    plaque(svg, "NOUVEAU RANG", "Orateur III", hi, "#FCE7B4", mid, y=690)


def oracle_a(svg):
    svg.grad("bg", [(0, "#0B1030"), (1, "#03040E")])
    svg.add('<rect width="540" height="960" fill="url(#bg)"/>')
    photo_layer = Svg()
    photo(photo_layer, "#1B2350", "#070A1C")
    svg.defs.extend(photo_layer.defs)
    svg.add("".join(photo_layer.body))
    fill, hi, mid, lo = metal(svg, "gold")
    stars(svg, 21, 260, color="#E8EEFF")
    svg.add(f'<ellipse cx="270" cy="200" rx="230" ry="70" fill="none" stroke="{mid}" stroke-width="1.5" opacity="0.7" transform="rotate(-12 270 200)"/>')
    svg.add(sparkle(470, 160, 26, "#FFFFFF"))
    svg.add('<circle cx="470" cy="160" r="22" fill="#9EC1FF" opacity="0.3" filter="url(#glow)"/>')
    svg.add(sparkle(486, 176, 8, "#FFFFFF", 0.8))
    svg.add(kanaga(60, 480, 0.9, mid))
    svg.add(kanaga(480, 480, 0.9, mid))
    for y0 in (40, 900):
        for x in range(40, 520, 30):
            svg.add(f'<rect x="{x}" y="{y0}" width="20" height="20" fill="none" stroke="{mid}" stroke-width="2" transform="rotate(45 {x + 10} {y0 + 10})"/>')
    border(svg, 14, hi, 2.5)
    svg.add(laurel(270, 200, 96, mid))
    svg.add(gye_nyame_like(270, 82, 0.9, hi))
    shield(svg, 270, 200, 1.15, fill, hi, signature(270, 204, 1.05, lo))
    plaque(svg, "NOUVEAU RANG", "Oracle II", hi, "#E8EEFF", mid, y=740)


def oracle_b(svg):
    photo(svg, "#0F3B3A", "#03110F")
    fill, hi, mid, lo = metal(svg, "gold")
    for k in range(9):
        y = 20 + k * 8
        svg.add(f'<path d="M0 {y} ' + " ".join(f"Q{x + 15} {y + (6 if k % 2 else -6)} {x + 30} {y}" for x in range(0, 540, 30)) + f'" fill="none" stroke="#2FB3A8" stroke-width="1.6" opacity="{0.9 - k * 0.08}"/>')
        y2 = 940 - k * 8
        svg.add(f'<path d="M0 {y2} ' + " ".join(f"Q{x + 15} {y2 + (6 if k % 2 else -6)} {x + 30} {y2}" for x in range(0, 540, 30)) + f'" fill="none" stroke="#2FB3A8" stroke-width="1.6" opacity="{0.9 - k * 0.08}"/>')
    pts = []
    for i in range(0, 361):
        t = i / 360
        if t < 0.25:
            x, y = 34, 880 - t / 0.25 * 800
        elif t < 0.5:
            x, y = 34 + (t - 0.25) / 0.25 * 472, 80
        elif t < 0.75:
            x, y = 506, 80 + (t - 0.5) / 0.25 * 800
        else:
            x, y = 506 - (t - 0.75) / 0.25 * 300, 880
        wob = 10 * math.sin(t * 2 * math.pi * 14)
        if t < 0.25 or 0.5 <= t < 0.75:
            x += wob
        else:
            y += wob
        pts.append((x, y))
    svg.add(serpent(pts, "#1F8F82", hi, 12))
    hx, hy = pts[-1]
    svg.add(f'<ellipse cx="{f(hx - 10)}" cy="{f(hy)}" rx="20" ry="12" fill="#1F8F82" stroke="#06221F" stroke-width="3"/><circle cx="{f(hx - 18)}" cy="{f(hy - 3)}" r="3" fill="{hi}"/>')
    svg.add('<circle cx="270" cy="210" r="140" fill="#2FB3A8" opacity="0.15" filter="url(#soft)"/>')
    svg.add(laurel(270, 200, 96, mid))
    shield(svg, 270, 200, 1.15, fill, hi, signature(270, 204, 1.05, lo))
    plaque(svg, "NOUVEAU RANG", "Oracle II", hi, "#D9FFF8", mid, y=740)


def legende_a(svg):
    svg.grad("bg", [(0, "#120B2E"), (0.6, "#0A0620"), (1, "#1B0E06")])
    svg.add('<rect width="540" height="960" fill="url(#bg)"/>')
    inner = Svg()
    photo(inner, "#2B1E4A", "#140A1E")
    svg.defs.extend(inner.defs)
    svg.add(f'<g opacity="0.9">{"".join(inner.body)}</g>')
    fill, hi, mid, lo = metal(svg, "gold")
    nebula(svg, "neb1", 270, 120, 330, 170, "#7C4DFF", "#1B0E3A", 0.75)
    nebula(svg, "neb2", 110, 60, 160, 90, "#FF6FB1", "#2A0B2A", 0.55)
    svg.add(galaxy(270, 110, 300, "#FFF4E0", 2, 0.22, 0.3, 31, 420))
    stars(svg, 33, 300, color="#FFFFFF")
    svg.add('<rect x="0" y="800" width="540" height="160" fill="#1B0E06"/>')
    svg.add(f'<path d="M0 800 Q270 760 540 800" fill="#1B0E06"/>')
    svg.add(baobab(70, 950, 1.15, "#050302"))
    svg.add(baobab(470, 950, 1.0, "#050302"))
    svg.add(f'<path d="M0 806 Q270 766 540 806" fill="none" stroke="{mid}" stroke-width="2.5"/>')
    for x in (150, 210, 330, 390):
        svg.add(f'<path d="M{x} 790 l0 -14" stroke="{hi}" stroke-width="2"/>')
    svg.add(ram_horns(270, 330 - 260, 0.7, hi))
    svg.add(laurel(270, 200, 100, mid))
    svg.add(rays(270, 200, 112, 168, 17, hi, 3, -80, 80))
    shield(svg, 270, 200, 1.2, fill, hi, signature(270, 204, 1.1, lo))
    border(svg, 12, hi, 2)
    plaque(svg, "NOUVEAU RANG", "Légende I", hi, "#FCE7B4", mid, y=660)


def legende_b(svg):
    svg.grad("bg", [(0, "#2A0E00"), (1, "#050208")])
    svg.add('<rect width="540" height="960" fill="url(#bg)"/>')
    inner = Svg()
    photo(inner, "#3A1A10", "#0C0508")
    svg.defs.extend(inner.defs)
    svg.add("".join(inner.body))
    fill, hi, mid, lo = metal(svg, "gold")
    svg.rgrad("sn", [(0, "#FFFFFF", 1), (0.12, "#FFE08A", 0.95), (0.35, "#FF7A1A", 0.55), (0.7, "#8B1E3F", 0.25), (1, "#000000", 0)])
    svg.add('<circle cx="270" cy="150" r="300" fill="url(#sn)"/>')
    rnd = random.Random(41)
    for i in range(90):
        a = rnd.uniform(-180, 180)
        r0, r1 = rnd.uniform(60, 120), rnd.uniform(160, 340)
        x1, y1 = pt(270, 150, r0, a)
        x2, y2 = pt(270, 150, r1, a)
        svg.add(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="#FFE7B0" stroke-width="{f(rnd.uniform(0.6, 2))}" opacity="{f(rnd.uniform(0.25, 0.8))}"/>')
    for m in (1, -1):
        for k in range(7):
            y = 150 + k * 12
            svg.add(f'<path d="M{270 + m * 70} {y} Q{270 + m * (150 + k * 14)} {y - 30 + k * 4} {270 + m * (250 - k * 10)} {y + 12}" fill="none" stroke="{hi}" stroke-width="{4 - k * 0.4}" stroke-linecap="round"/>')
    svg.add(f'<path d="M{270 - 56} 236 Q270 270 {270 + 56} 236" fill="none" stroke="{mid}" stroke-width="5"/>')
    for x0 in (14, 498):
        for y in range(300, 900, 46):
            svg.add(f'<path d="M{x0 + 14} {y} l14 22 l-14 22 l-14 -22 Z" fill="none" stroke="{mid}" stroke-width="2"/>')
            svg.add(f'<circle cx="{x0 + 14}" cy="{y + 22}" r="3" fill="{hi}"/>')
    stars(svg, 43, 160, color="#FFE7B0")
    border(svg, 10, hi, 2)
    shield(svg, 270, 160, 1.15, fill, hi, signature(270, 164, 1.05, lo))
    plaque(svg, "NOUVEAU RANG", "Légende I", hi, "#FFE7B0", mid, y=740)


def mythe_a(svg):
    svg.add('<rect width="540" height="960" fill="#020108"/>')
    inner = Svg()
    photo(inner, "#1A1240", "#05030F")
    svg.defs.extend(inner.defs)
    svg.add(f'<g opacity="0.85">{"".join(inner.body)}</g>')
    fill, hi, mid, lo = metal(svg, "prism")
    svg.grad("prismline", [(0, "#FF6FB1"), (0.25, "#FFD36E"), (0.5, "#6EF0C2"), (0.75, "#6EA8FF"), (1, "#B36EFF")], 0, 0, 1, 0)
    nebula(svg, "q1", 270, 150, 280, 120, "#6EA8FF", "#1A1240", 0.7)
    svg.add('<ellipse cx="270" cy="150" rx="210" ry="34" fill="none" stroke="url(#prismline)" stroke-width="10" opacity="0.85"/>')
    svg.add('<ellipse cx="270" cy="150" rx="150" ry="22" fill="none" stroke="#FFFFFF" stroke-width="3" opacity="0.7"/>')
    svg.add('<path d="M262 150 L240 -40 L300 -40 L278 150 Z" fill="#BFD8FF" opacity="0.5" filter="url(#glow)"/>')
    svg.add('<path d="M262 150 L240 990 L300 990 L278 150 Z" fill="#BFD8FF" opacity="0.18" filter="url(#glow)"/>')
    svg.add('<circle cx="270" cy="150" r="40" fill="#FFFFFF" filter="url(#glow)"/>')
    stars(svg, 51, 420, color="#FFFFFF", rmax=2)
    svg.add(galaxy(80, 860, 90, "#FFD9F0", 2, 0.5, 1.0, 52, 160))
    svg.add(galaxy(470, 820, 70, "#D6E6FF", 3, 0.6, 2.0, 53, 140))
    for m in (1, -1):
        for i in range(6):
            x = 270 + m * (130 + i * 28)
            svg.add(sparkle(x, 260 + i * 10, 6 - i * 0.6, "#FFFFFF", 0.8))
    svg.add('<rect x="10" y="10" width="520" height="940" rx="26" fill="none" stroke="url(#prismline)" stroke-width="4"/>')
    svg.add(gye_nyame_like(70, 470, 0.8, "#CFC3FF"))
    svg.add(gye_nyame_like(470, 470, 0.8, "#CFC3FF"))
    shield(svg, 270, 150, 1.1, fill, "#FFFFFF", signature(270, 154, 1, "#2A1E7A"))
    plaque(svg, "NOUVEAU RANG", "Mythe n° 42", "#FFFFFF", "#DCD3FF", "#B9A7FF", y=740)
    svg.add('<text x="270" y="250" text-anchor="middle" font-family="' + SANS + '" font-size="13" letter-spacing="5" fill="#DCD3FF">QUASAR · Nº 42 / 100</text>')


def mythe_b(svg):
    svg.add('<rect width="540" height="960" fill="#010006"/>')
    inner = Svg()
    photo(inner, "#140C30", "#03020A")
    svg.defs.extend(inner.defs)
    svg.add(f'<g opacity="0.85">{"".join(inner.body)}</g>')
    fill, hi, mid, lo = metal(svg, "prism")
    svg.grad("prismline", [(0, "#FF6FB1"), (0.25, "#FFD36E"), (0.5, "#6EF0C2"), (0.75, "#6EA8FF"), (1, "#B36EFF")], 0, 0, 1, 0)
    svg.add(galaxy(270, 480, 520, "#E9E2FF", 2, 0.95, 0.6, 61, 900))
    svg.rgrad("disk", [(0.0, "#000000", 1), (0.42, "#000000", 1), (0.5, "#FFB45E", 0.95), (0.62, "#FF5E3A", 0.6), (1, "#3A0B5E", 0)])
    svg.add('<ellipse cx="270" cy="150" rx="230" ry="110" fill="url(#disk)"/>')
    svg.add('<circle cx="270" cy="150" r="62" fill="#000000" stroke="#FFD9A0" stroke-width="2.5"/>')
    svg.add('<path d="M120 150 Q270 60 420 150" fill="none" stroke="#FFE2B8" stroke-width="3" opacity="0.8"/>')
    svg.add('<path d="M150 150 Q270 230 390 150" fill="none" stroke="#FF9E5E" stroke-width="2" opacity="0.7"/>')
    stars(svg, 62, 300, color="#FFFFFF")
    cons = [(60, 330), (96, 300), (130, 330), (96, 370), (60, 330)]
    svg.add('<path d="M' + " L".join(f"{x} {y}" for x, y in cons) + '" fill="none" stroke="#CFC3FF" stroke-width="1.2" opacity="0.8"/>')
    for x, y in cons[:-1]:
        svg.add(sparkle(x, y, 7, "#FFFFFF"))
    cons2 = [(480, 600), (450, 640), (480, 680), (510, 640), (480, 600), (480, 720)]
    svg.add('<path d="M' + " L".join(f"{x} {y}" for x, y in cons2) + '" fill="none" stroke="#CFC3FF" stroke-width="1.2" opacity="0.8"/>')
    for x, y in cons2:
        svg.add(sparkle(x, y, 6, "#FFFFFF"))
    svg.add('<rect x="10" y="10" width="520" height="940" rx="26" fill="none" stroke="url(#prismline)" stroke-width="4"/>')
    svg.add('<rect x="22" y="22" width="496" height="916" rx="20" fill="none" stroke="#FFFFFF" stroke-width="1" opacity="0.4"/>')
    shield(svg, 270, 150, 0.85, fill, "#FFFFFF", signature(270, 154, 0.78, "#2A1E7A"))
    plaque(svg, "NOUVEAU RANG", "Mythe n° 42", "#FFFFFF", "#DCD3FF", "#B9A7FF", y=760)
    svg.add('<text x="270" y="282" text-anchor="middle" font-family="' + SANS + '" font-size="13" letter-spacing="5" fill="#FFD9A0">HORIZON · Nº 42 / 100</text>')


# ---------- other moments ----------

def tier_card(name, label, level, n_stars, c1, c2, seed):
    def build(svg):
        photo(svg, c1, c2)
        ring = "#EAF2FF"
        svg.add(f'<circle cx="270" cy="150" r="96" fill="none" stroke="{ring}" stroke-width="3" opacity="0.5"/>')
        svg.add(f'<circle cx="270" cy="150" r="78" fill="none" stroke="{ring}" stroke-width="10" stroke-dasharray="460 60" stroke-linecap="round"/>')
        svg.add(f'<text x="270" y="166" text-anchor="middle" font-family="{SERIF}" font-weight="700" font-size="48" fill="#FFFFFF">{level}</text>')
        rnd = random.Random(seed)
        for i in range(n_stars):
            a = 360 / n_stars * i
            x, y = pt(270, 150, 118, a)
            svg.add(sparkle(x, y, 6 + rnd.random() * 4, "#FFFFFF", 0.9))
        if n_stars >= 12:
            stars(svg, seed, 140 + n_stars * 6)
        if n_stars >= 20:
            svg.add(galaxy(270, 880, 200, "#E9E2FF", 2, 0.3, 0.4, seed, 300))
        border(svg, 18, ring, 2, opacity=0.8)
        plaque(svg, f"NIVEAU {level}", f"Palier {label}", "#FFFFFF", "#EAF2FF", "#9EB7FF")
    card(name, build)


def treasury_card(name, label, coins, chest):
    def build(svg):
        photo(svg, "#3A2A10", "#120B03")
        fill, hi, mid, lo = metal(svg, "gold")
        border(svg, 16, mid, 3)
        for i in range(coins):
            x = 40 + (i * 37) % 470
            y = 900 - (i // 13) * 18
            svg.add(f'<ellipse cx="{x}" cy="{y}" rx="16" ry="7" fill="{fill}" stroke="{lo}" stroke-width="1.5"/>')
        if chest:
            svg.add(f'<rect x="200" y="120" width="140" height="90" rx="10" fill="#6B3E1E" stroke="{hi}" stroke-width="4"/>')
            svg.add(f'<path d="M200 140 Q270 70 340 140" fill="#7A4A22" stroke="{hi}" stroke-width="4"/>')
            svg.add(f'<rect x="258" y="150" width="24" height="30" rx="4" fill="{fill}"/>')
            svg.add(f'<circle cx="270" cy="120" r="70" fill="{hi}" opacity="0.18" filter="url(#soft)"/>')
        else:
            svg.add(f'<circle cx="270" cy="160" r="70" fill="{fill}" stroke="{hi}" stroke-width="4"/>')
            svg.add(signature(270, 160, 1.3, lo))
        plaque(svg, "TRÉSOR", label, hi, "#FCE7B4", mid, y=720)
    card(name, build)


def flame_card(name, days, intensity):
    def build(svg):
        photo(svg, "#3A1408", "#0E0402")
        rnd = random.Random(days)
        for side in (0, 1):
            for i in range(intensity):
                y = 920 - i * (840 / intensity)
                h = rnd.uniform(30, 60) * (1 + intensity / 20)
                x = 18 if side == 0 else 522
                m = 1 if side == 0 else -1
                svg.add(f'<path d="M{x} {f(y)} q{f(m * h * 0.6)} {f(-h * 0.3)} {f(m * h * 0.2)} {f(-h)} q{f(m * h * 0.5)} {f(h * 0.4)} {f(m * -h * 0.2)} {f(h)} Z" fill="#FF7A1A" opacity="0.85"/>')
                svg.add(f'<path d="M{x} {f(y)} q{f(m * h * 0.35)} {f(-h * 0.2)} {f(m * h * 0.1)} {f(-h * 0.65)} q{f(m * h * 0.3)} {f(h * 0.3)} {f(m * -h * 0.1)} {f(h * 0.65)} Z" fill="#FFD36E"/>')
        svg.add('<path d="M270 70 C230 130 230 180 270 220 C310 180 310 130 270 70 Z" fill="#FF7A1A"/><path d="M270 120 C252 150 252 180 270 200 C288 180 288 150 270 120 Z" fill="#FFD36E"/>')
        svg.add('<circle cx="270" cy="160" r="90" fill="#FF7A1A" opacity="0.2" filter="url(#soft)"/>')
        plaque(svg, "FLAMME", f"{days} jours", "#FFFFFF", "#FFD9B0", "#FF9E5E")
    card(name, build)


def meesh_card(name, number, edition):
    def build(svg):
        photo(svg, "#1E1B4B", "#0B0920")
        key = {"argent": "silver", "or": "gold", "prisme": "prism"}[edition]
        fill, hi, mid, lo = metal(svg, key)
        for i in range(24):
            a = 15 * i
            x1, y1 = pt(270, 160, 92, a)
            x2, y2 = pt(270, 160, 92 + (30 if i % 2 == 0 else 16), a)
            svg.add(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{mid}" stroke-width="3" stroke-linecap="round"/>')
        svg.add(f'<circle cx="270" cy="160" r="84" fill="{fill}" stroke="{hi}" stroke-width="4"/>')
        svg.add(f'<text x="270" y="178" text-anchor="middle" font-family="{SERIF}" font-weight="700" font-size="{48 if number < 1000 else 36}" fill="{lo}">{number}</text>')
        border(svg, 16, mid, 3)
        border(svg, 26, mid, 1, r=16)
        if edition == "prisme":
            svg.grad("prismline", [(0, "#FF6FB1"), (0.25, "#FFD36E"), (0.5, "#6EF0C2"), (0.75, "#6EA8FF"), (1, "#B36EFF")], 0, 0, 1, 0)
            svg.add('<rect x="16" y="16" width="508" height="928" rx="22" fill="none" stroke="url(#prismline)" stroke-width="6"/>')
            stars(svg, number, 200)
        plaque(svg, "MEESH FRAPPÉE", f"Meesh n° {number}", hi, "#E0DCFF", mid)
    card(name, build)


def daily_card(svg):
    photo(svg, "#1F2A44", "#0A0F1C")
    svg.add('<rect x="18" y="18" width="504" height="924" rx="22" fill="none" stroke="#F2E8D5" stroke-width="2" stroke-dasharray="10 8"/>')
    svg.add('<circle cx="430" cy="140" r="70" fill="none" stroke="#E8B53C" stroke-width="4"/><circle cx="430" cy="140" r="58" fill="none" stroke="#E8B53C" stroke-width="1.5"/>')
    svg.add(f'<text x="430" y="132" text-anchor="middle" font-family="{SANS}" font-weight="700" font-size="14" letter-spacing="2" fill="#E8B53C">JOUR</text>')
    svg.add(f'<text x="430" y="166" text-anchor="middle" font-family="{SERIF}" font-weight="700" font-size="34" fill="#E8B53C">283</text>')
    svg.add('<path d="M60 120 l40 0 M60 140 l70 0 M60 160 l55 0" stroke="#F2E8D5" stroke-width="3" stroke-linecap="round" opacity="0.7"/>')
    plaque(svg, "RÉALISATION DU JOUR", "3 missions sur 3", "#FFFFFF", "#F2E8D5", "#E8B53C")


CARDS = {
    "murmure-a": murmure_a, "murmure-b": murmure_b,
    "echo-a": echo_a, "echo-b": echo_b,
    "voix-a": voix_a, "voix-b": voix_b,
    "conteur-a": conteur_a, "conteur-b": conteur_b,
    "passeur-a": passeur_a, "passeur-b": passeur_b,
    "polyglotte-a": polyglotte_a, "polyglotte-b": polyglotte_b,
    "ambassadeur-a": ambassadeur_a, "ambassadeur-b": ambassadeur_b,
    "orateur-a": orateur_a, "orateur-b": orateur_b,
    "oracle-a": oracle_a, "oracle-b": oracle_b,
    "legende-a": legende_a, "legende-b": legende_b,
    "mythe-a": mythe_a, "mythe-b": mythe_b,
    "jour": daily_card,
}

for key, fn in CARDS.items():
    card(key, fn)

tier_card("palier-comete", "Comète", 60, 6, "#16213E", "#070B18", 1)
tier_card("palier-galaxie", "Galaxie", 90, 12, "#1A1240", "#05030F", 2)
tier_card("palier-quasar", "Quasar", 300, 16, "#0E1A3A", "#02040C", 3)
tier_card("palier-singularite", "Singularité", 1000, 24, "#0A0418", "#000000", 4)
treasury_card("tresor-bourse", "Bourse", 4, False)
treasury_card("tresor-coffret", "Coffret", 14, False)
treasury_card("tresor-coffre", "Coffre", 26, True)
treasury_card("tresor-reserve", "Réserve", 52, True)
flame_card("flamme-7", 7, 4)
flame_card("flamme-30", 30, 8)
flame_card("flamme-100", 100, 14)
flame_card("flamme-365", 365, 22)
meesh_card("meesh-40", 40, "argent")
meesh_card("meesh-100", 100, "or")
meesh_card("meesh-1000", 1000, "prisme")
print(len(list(OUT.glob("*.svg"))))
