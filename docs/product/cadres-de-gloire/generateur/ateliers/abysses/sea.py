"""Abysses - les créatures : méduses, raies manta, baleines à bosse, bancs de poissons d'argent,
hippocampes héraldiques, cténophores. Toutes en coordonnées locales, posées par transform."""

import math
import random

from base import W, H, f, pt
from kit import catmull, poly, smooth, ribbon, resample, normals, lerp, glow, blur, bevel, metal_grad, GOLD


def place(markup, x, y, s=1.0, rot=0, flip=False, op=1.0, extra=""):
    sc = f"scale({f(-s)} {f(s)})" if flip else f"scale({f(s)})"
    return f'<g transform="translate({f(x)} {f(y)}) rotate({f(rot)}) {sc}" opacity="{f(op)}"{extra}>{markup}</g>'


# ---------------------------------------------------------------- méduse

def jellyfish(card, name, r=40, bell="#7FE9FF", core="#FF8AD8", seed=1, tent=2.8, n_tent=14, arms=4, sway=1.0, lit=True, bell_op=1.0):
    """Une méduse en coordonnées locales (centre du bord de l'ombrelle en 0,0). Rendre avec `place`."""
    rnd = random.Random(seed)
    h = r * 0.95
    lobes = 10
    d = f"M{f(-r)} 0 C{f(-r * 1.02)} {f(-h * 1.3)} {f(r * 1.02)} {f(-h * 1.3)} {f(r)} 0"
    for i in range(lobes):
        xa = r - 2 * r * i / lobes
        xb = r - 2 * r * (i + 1) / lobes
        d += f" Q{f((xa + xb) / 2)} {f(r * 0.16)} {f(xb)} 0"
    d += " Z"
    gb = card.rgrad(name + "-bell", [(0, "#FFFFFF", 0.55), (0.45, bell, 0.16), (0.82, bell, 0.42), (1, bell, 0.85)], 0.5, 0.62, 0.62)
    out = []
    # tentacules
    tg = card.def_once(
        name + "-tg",
        f'<linearGradient id="{card.id(name + "-tg")}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="{f(r * tent * 1.2)}">'
        f'<stop offset="0" stop-color="{bell}" stop-opacity="0.95"/><stop offset="0.6" stop-color="{bell}" stop-opacity="0.45"/>'
        f'<stop offset="1" stop-color="{bell}" stop-opacity="0"/></linearGradient>',
    )
    for i in range(n_tent):
        x = -r * 0.94 + 1.88 * r * i / max(1, n_tent - 1)
        L = r * tent * rnd.uniform(0.75, 1.15)
        ph = rnd.uniform(0, 6.28)
        amp = r * 0.12 * sway
        pts = [(x + amp * math.sin(ph + k * 0.9) + k * sway * r * 0.01, r * 0.1 + L * k / 9) for k in range(10)]
        out.append(f'<path d="{smooth(pts, closed=False, n=5)}" fill="none" stroke="{tg}" stroke-width="{f(rnd.uniform(0.6, 1.3) * r / 40)}" stroke-linecap="round"/>')
    # bras oraux, festonnés
    ag = card.def_once(
        name + "-ag",
        f'<linearGradient id="{card.id(name + "-ag")}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="{f(r * tent * 0.75)}">'
        f'<stop offset="0" stop-color="{core}" stop-opacity="0.85"/><stop offset="0.7" stop-color="{core}" stop-opacity="0.35"/>'
        f'<stop offset="1" stop-color="{core}" stop-opacity="0"/></linearGradient>',
    )
    for i in range(arms):
        x = -r * 0.22 + 0.44 * r * i / max(1, arms - 1)
        L = r * tent * rnd.uniform(0.45, 0.65)
        ph = rnd.uniform(0, 6.28)
        spine = [(x + r * 0.14 * math.sin(ph + k * 0.8) * sway, r * 0.05 + L * k / 7) for k in range(8)]
        sm = resample(catmull(spine, 6), 40)
        nm = normals(sm)
        left, right = [], []
        for j, ((px, py), (nx, ny)) in enumerate(zip(sm, nm)):
            t = j / 39
            w = r * 0.15 * (1 - t * 0.7)
            fr = r * 0.05 * math.sin(j * 1.9)
            left.append((px + nx * (w + fr), py + ny * (w + fr)))
            right.append((px - nx * (w - fr), py - ny * (w - fr)))
        out.append(f'<path d="{poly(left + right[::-1])}" fill="{ag}"/>')
    # ombrelle
    out.append(f'<path d="{d}" fill="{gb}" opacity="{bell_op}"/>')
    for k in range(8):
        a = -70 + 140 * k / 7
        x2 = r * 0.92 * math.sin(math.radians(a))
        out.append(f'<path d="M0 {f(-h * 0.9)} Q{f(x2 * 0.6)} {f(-h * 0.75)} {f(x2)} {f(r * 0.04)}" fill="none" stroke="{bell}" stroke-width="{f(r / 60)}" opacity="0.45"/>')
    for k in range(4):
        a = math.radians(45 + 90 * k)
        cx, cy = r * 0.26 * math.cos(a), -h * 0.42 + r * 0.12 * math.sin(a)
        out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 0.17)}" ry="{f(r * 0.09)}" transform="rotate({f(math.degrees(a) + 90)} {f(cx)} {f(cy)})" fill="none" stroke="{core}" stroke-width="{f(r * 0.06)}" opacity="0.85"/>')
    out.append(f'<path d="{d}" fill="none" stroke="#FFFFFF" stroke-width="{f(r / 34)}" opacity="0.55"/>')
    out.append(f'<path d="M{f(-r * 0.62)} {f(-h * 0.55)} Q{f(-r * 0.5)} {f(-h * 1.0)} {f(-r * 0.05)} {f(-h * 0.98)}" fill="none" stroke="#FFFFFF" stroke-width="{f(r / 14)}" stroke-linecap="round" opacity="0.55"/>')
    body = "".join(out)
    if lit:
        return f'<g filter="{glow(card, name + "-gl", r / 7, 2)}">{body}</g>'
    return body


# ---------------------------------------------------------------- raie manta (vue de dessus)

def manta_path(span=100, flap=0.0, bank=0.0):
    """Silhouette de raie manta, tête vers le haut (y<0). `flap` relève/abaisse les pointes, `bank` incline."""
    def half(m):
        tip_y = 6 + flap * 26 + bank * m * 18
        return [
            (m * 6, -34), (m * 11, -46), (m * 16, -56), (m * 21, -50), (m * 22, -38),
            (m * 40, -36), (m * 66, -22 + flap * 6 + bank * m * 6), (m * span * 0.88, -4 + flap * 18 + bank * m * 12), (m * span, tip_y),
            (m * span * 0.8, tip_y + 4), (m * 58, 16), (m * 36, 30), (m * 24, 46), (m * 18, 60), (m * 8, 62),
        ]
    r = half(1)
    l = half(-1)[::-1]
    pts = [(0, -32)] + r + [(2, 70)] + [(-2, 70)] + l
    return pts


def manta(card, name, style="dorsal", span=100, flap=0.0, bank=0.0, color="#0B2236", rimc="#9FF4FF", tail=150):
    """`style` : dorsal (marques d'épaules claires) | silhouette (contre-jour) | etoiles (pour le cosmos)."""
    pts = manta_path(span, flap, bank)
    d = smooth(pts, closed=True, n=6)
    out = []
    out.append(f'<path d="M0 64 Q4 {f(64 + tail * 0.5)} {f(-6)} {f(64 + tail)}" fill="none" stroke="{color if style != "etoiles" else rimc}" stroke-width="2.2" stroke-linecap="round" opacity="0.9"/>')
    if style == "dorsal":
        g = card.rgrad(name + "-dg", [(0, "#24506E", 1), (0.6, color, 1), (1, "#06121E", 1)], 0.5, 0.35, 0.65)
        out.append(f'<path d="{d}" fill="{g}"/>')
        for m in (1, -1):
            out.append(f'<path d="M{f(m * 14)} -26 Q{f(m * 44)} -26 {f(m * 66)} -10 Q{f(m * 40)} -14 {f(m * 18)} -6 Z" fill="#E8F6FA" opacity="0.8"/>')
        out.append(f'<path d="{d}" fill="none" stroke="{rimc}" stroke-width="1.4" opacity="0.6"/>')
        out.append(f'<path d="M0 -26 L0 50" stroke="#06121E" stroke-width="3" opacity="0.4" filter="{blur(card, name + "-sp", 2)}"/>')
    elif style == "silhouette":
        out.append(f'<path d="{d}" fill="{color}"/>')
        out.append(f'<path d="{d}" fill="none" stroke="{rimc}" stroke-width="1.6" opacity="0.75"/>')
    else:
        out.append(f'<path d="{d}" fill="{color}" opacity="0.55"/>')
        out.append(f'<path d="{d}" fill="none" stroke="{rimc}" stroke-width="1.3" opacity="0.9" filter="{glow(card, name + "-g", 2.5, 2)}"/>')
    return "".join(out)


# ---------------------------------------------------------------- baleine à bosse (profil, tête à droite)

WHALE_TOP = [(130, 3), (124, -5), (110, -11), (90, -16), (62, -21), (32, -25), (2, -26), (-26, -23), (-38, -24),
             (-44, -31), (-50, -22), (-70, -14), (-95, -7), (-112, -4)]
WHALE_BOT = [(-112, 4), (-95, 7), (-70, 13), (-40, 21), (-6, 28), (30, 30), (60, 27), (90, 21), (112, 14), (126, 8)]


def whale_outline():
    return WHALE_TOP + WHALE_BOT


def fluke_path(m=1):
    """Une demi-nageoire caudale ; m=1 vers le haut, m=-1 vers le bas."""
    pts = [(-110, -2 * m), (-122, -12 * m), (-138, -26 * m), (-152, -33 * m), (-156, -30 * m), (-150, -22 * m), (-144, -16 * m),
           (-139, -10 * m), (-134, -5 * m), (-128, -1 * m)]
    return pts


def pectoral(m_scale=1.0):
    """La longue nageoire pectorale (un tiers du corps) : une aile effilée, bord d'attaque bosselé."""
    spine = [(60, 20), (40, 40), (18, 58), (-4, 74), (-24, 86)]
    sm = resample(catmull(spine, 8), 40)
    nm = normals(sm)
    left, right = [], []
    for i, ((x, y), (nx, ny)) in enumerate(zip(sm, nm)):
        t = i / 39
        w = (7 + 5 * math.sin(math.pi * min(1, t * 1.25))) * (1 - t) ** 0.6 * m_scale
        bump = 1.6 * abs(math.sin(i * 1.3)) if 0.15 < t < 0.85 else 0
        left.append((x + nx * (w + bump), y + ny * (w + bump)))
        right.append((x - nx * w * 0.8, y - ny * w * 0.8))
    return left + right[::-1]


def whale(card, name, style="natural", body="#0E2A40", belly="#6E93A8", rimc="#A6F2FF", pect=True):
    """`style` : natural | silhouette | etoiles (corps de lumière pour le cosmos)."""
    outline = whale_outline()
    d = smooth(outline, closed=True, n=6)
    fl_up = smooth(fluke_path(1), closed=True, n=5)
    fl_dn = smooth(fluke_path(-1), closed=True, n=5)
    pec = poly(pectoral(), closed=True)
    out = []
    if style == "natural":
        g = card.grad(name + "-bg", [(0, "#1A3F58"), (0.45, body), (0.62, body), (1, belly)], 0, 0, 0, 1)
        pg = card.grad(name + "-pg", [(0, "#F2FAFC"), (0.6, "#BFD6E0"), (1, "#5F8091")], 0, 0, 1, 1)
        out.append(f'<path d="{fl_dn}" fill="{body}"/><path d="{fl_up}" fill="{g}"/>')
        out.append(f'<path d="{d}" fill="{g}"/>')
        for k in range(7):
            yy = 18 + k * 1.9
            out.append(f'<path d="M{f(116 - k * 3)} {f(yy - 6)} Q{f(70)} {f(yy + 6)} {f(14 + k * 3)} {f(yy + 9)}" fill="none" stroke="#0A1C2B" stroke-width="0.8" opacity="0.45"/>')
        out.append('<path d="M127 6 Q100 9 66 9" fill="none" stroke="#06121C" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>')
        out.append('<circle cx="72" cy="4" r="2.3" fill="#020A12"/><circle cx="71.4" cy="3.4" r="0.7" fill="#FFFFFF" opacity="0.8"/>')
        rnd = random.Random(3)
        for k in range(9):
            x = 122 - k * 6
            y = -6 - k * 1.3 + rnd.uniform(-1, 1)
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="1.4" fill="#3B6580" opacity="0.8"/>')
        out.append(f'<path d="{d}" fill="none" stroke="{rimc}" stroke-width="1.1" opacity="0.45"/>')
        if pect:
            out.append(f'<path d="{pec}" fill="{pg}"/><path d="{pec}" fill="none" stroke="#FFFFFF" stroke-width="0.8" opacity="0.6"/>')
    elif style == "silhouette":
        out.append(f'<path d="{fl_dn}" fill="{body}"/><path d="{fl_up}" fill="{body}"/><path d="{d}" fill="{body}"/>')
        if pect:
            out.append(f'<path d="{pec}" fill="{body}"/>')
        out.append(f'<path d="{d}" fill="none" stroke="{rimc}" stroke-width="1.4" opacity="0.6"/>')
    else:
        g = card.rgrad(name + "-sg", [(0, "#BFE9FF", 0.55), (0.6, body, 0.4), (1, body, 0.15)], 0.6, 0.45, 0.7)
        for p in (fl_dn, fl_up, d):
            out.append(f'<path d="{p}" fill="{g}"/>')
        if pect:
            out.append(f'<path d="{pec}" fill="{g}"/>')
        edge = "".join(f'<path d="{p}" fill="none" stroke="{rimc}" stroke-width="1.2"/>' for p in ((fl_dn, fl_up, d, pec) if pect else (fl_dn, fl_up, d)))
        out.append(f'<g filter="{glow(card, name + "-eg", 2.2, 2)}" opacity="0.95">{edge}</g>')
        out.append('<path d="M127 6 Q100 9 66 9" fill="none" stroke="#DFF6FF" stroke-width="1" opacity="0.6"/>')
        out.append('<circle cx="72" cy="4" r="2" fill="#FFFFFF"/>')
    return "".join(out)


# ---------------------------------------------------------------- poissons d'argent

FISH_D = "M8 0 Q3 -3 -4 -0.8 L-8 -3 L-6.6 0 L-8 3 L-4 0.8 Q3 3 8 0 Z"


def fish_defs(card):
    card.def_once("fish", f'<path id="{card.id("fish")}" d="{FISH_D}"/>')
    return card.id("fish")


def school(card, seed, curve, n, spread=10, size=(0.9, 1.7), colors=("#E9F3F8", "#9FB6C6", "#FFFFFF", "#6F8798"), flash="#FFFFFF", op=(0.55, 1.0), avoid=None):
    """Un banc : `curve(t)` -> (x, y) ; chaque poisson suit la tangente, dispersé de `spread`."""
    fid = fish_defs(card)
    sg = card.grad("fish-sil", [(0, colors[0]), (0.45, colors[1]), (0.55, colors[3]), (1, colors[0])], 0, 0, 0, 1)
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        t = rnd.random()
        x, y = curve(t)
        x2, y2 = curve(min(1, t + 0.004))
        x1, y1 = curve(max(0, t - 0.004))
        a = math.degrees(math.atan2(y2 - y1, x2 - x1))
        nx, ny = -(y2 - y1), (x2 - x1)
        l = math.hypot(nx, ny) or 1
        off = rnd.gauss(0, spread)
        px, py = x + nx / l * off, y + ny / l * off
        if avoid and avoid[0] < px < avoid[2] and avoid[1] < py < avoid[3]:
            continue
        s = rnd.uniform(*size)
        fill = flash if rnd.random() < 0.12 else sg
        out.append(f'<use href="#{fid}" transform="translate({f(px)} {f(py)}) rotate({f(a + rnd.gauss(0, 8))}) scale({f(s)})" fill="{fill}" opacity="{f(rnd.uniform(*op))}"/>')
    return "".join(out)


# ---------------------------------------------------------------- hippocampe héraldique (regard vers la gauche)

def seahorse(card, name, metal=GOLD, fill=None, edge=None):
    hi, mid, lo = metal
    g = fill or metal_grad(card, name + "-g", metal)
    spine = [(9, -30), (7, -20), (1, -8), (-2, 4), (-1, 15), (2, 26), (2, 36), (-1, 45), (-6, 53), (-13, 56), (-19, 52), (-19, 45), (-14, 42), (-10, 45), (-11, 49)]
    widths = [15, 20, 25, 26, 23, 17, 11, 8, 6, 5, 4, 3.4, 2.8, 2.4, 2]
    body = ribbon(spine, widths, n=8, count=90)
    head = "M2 -46 C6 -55 20 -54 22 -44 C24 -36 18 -30 10 -30 C6 -31 3 -34 1 -38 Z"
    snout = "M3 -44 L-20 -40 C-24 -40 -26 -37 -24 -35 L-20 -35 L2 -36 Z"
    crown = "M8 -52 L7 -61 L11 -55 L13 -63 L15 -54 L19 -59 L18 -50 Z"
    fin = "M12 -2 C26 -6 30 6 26 16 C22 12 18 8 11 8 Z"
    out = [f'<path d="{fin}" fill="{g}" opacity="0.85"/>']
    for k in range(5):
        out.append(f'<path d="M13 {f(-1 + k * 2)} L{f(25 - k * 0.5)} {f(-2 + k * 4.5)}" stroke="{lo}" stroke-width="0.6" opacity="0.7"/>')
    out.append(f'<path d="{body}" fill="{g}"/><path d="{head}" fill="{g}"/><path d="{snout}" fill="{g}"/><path d="{crown}" fill="{g}"/>')
    sm = resample(catmull(spine, 8), 26)
    nm = normals(sm)
    for i in range(1, 22):
        (x, y), (nx, ny) = sm[i], nm[i]
        w = [15, 20, 25, 26, 23, 17, 11, 8, 6, 5, 4, 3.4, 2.8, 2.4, 2][min(14, int(i / 25 * 14))] / 2
        out.append(f'<path d="M{f(x - nx * w * 0.95)} {f(y - ny * w * 0.95)} L{f(x + nx * w * 0.95)} {f(y + ny * w * 0.95)}" stroke="{lo}" stroke-width="0.9" opacity="0.65"/>')
        out.append(f'<circle cx="{f(x - nx * w)}" cy="{f(y - ny * w)}" r="1.1" fill="{hi}"/>')
    out.append(f'<circle cx="11" cy="-44" r="3.2" fill="{lo}"/><circle cx="10.4" cy="-44.6" r="1.1" fill="#FFFFFF"/>')
    out.append(f'<path d="M4 -34 Q-1 -24 -4 -10" fill="none" stroke="{hi}" stroke-width="1" opacity="0.7"/>')
    return f'<g filter="{bevel(card, name + "-bv", 0.9, 2.2, 2, 2.5, 0.6)}">{"".join(out)}</g>'


# ---------------------------------------------------------------- cténophore (peigne irisé)

def ctenophore(card, name, r=18, color="#BFF8FF"):
    g = card.rgrad(name + "-g", [(0, "#FFFFFF", 0.35), (0.7, color, 0.12), (1, color, 0.5)])
    out = [f'<ellipse cx="0" cy="0" rx="{f(r * 0.62)}" ry="{f(r)}" fill="{g}"/>']
    cols = ["#FF5FD2", "#FFD45F", "#5FFFB4", "#5FB8FF", "#B25FFF", "#FF7F5F", "#5FFFF0", "#FF5F8F"]
    for k in range(8):
        xk = -r * 0.55 + r * 1.1 * k / 7
        curve = f"M{f(xk * 0.35)} {f(-r * 0.95)} Q{f(xk * 1.15)} 0 {f(xk * 0.35)} {f(r * 0.95)}"
        out.append(f'<path d="{curve}" fill="none" stroke="{cols[k]}" stroke-width="{f(r * 0.07)}" stroke-dasharray="{f(r * 0.06)} {f(r * 0.07)}" opacity="0.95"/>')
    out.append(f'<ellipse cx="0" cy="0" rx="{f(r * 0.62)}" ry="{f(r)}" fill="none" stroke="#FFFFFF" stroke-width="0.8" opacity="0.6"/>')
    return f'<g filter="{glow(card, name + "-gl", r / 5, 2)}">{"".join(out)}</g>'


# ---------------------------------------------------------------- tortue verte (vue de dessus, tête vers le haut)

def turtle(card, name, shell=("#C9A15A", "#7A5A2A", "#3A2A12"), skin=("#9DB08A", "#5E7350", "#2C3A24"), rimc="#DFFFFF"):
    """Tortue verte qui nage, vue de dessus : carapace à écailles, longues nageoires antérieures, tête écaillée."""
    sh_hi, sh_mid, sh_lo = shell
    sk_hi, sk_mid, sk_lo = skin
    sg = card.rgrad(name + "-sg", [(0, sh_hi, 1), (0.6, sh_mid, 1), (1, sh_lo, 1)], 0.45, 0.38, 0.7)
    kg = card.grad(name + "-kg", [(0, sk_hi), (0.6, sk_mid), (1, sk_lo)], 0, 0, 1, 1)
    out = []
    for m in (1, -1):
        fl = (f"M{f(m * 14)} -16 C{f(m * 34)} -30 {f(m * 58)} -24 {f(m * 70)} -4 C{f(m * 72)} 2 {f(m * 66)} 4 {f(m * 60)} 0 "
              f"C{f(m * 46)} -10 {f(m * 30)} -8 {f(m * 18)} -2 Z")
        out.append(f'<path d="{fl}" fill="{kg}"/>')
        for k in range(4):
            t = 0.25 + k * 0.18
            x = m * (18 + 46 * t)
            out.append(f'<path d="M{f(x)} {f(-14 - 8 * math.sin(t * 3))} l{f(m * 4)} 7" stroke="{sk_lo}" stroke-width="0.8" opacity="0.6"/>')
        out.append(f'<path d="M{f(m * 12)} 20 C{f(m * 22)} 22 {f(m * 30)} 32 {f(m * 28)} 40 C{f(m * 22)} 40 {f(m * 14)} 32 {f(m * 9)} 26 Z" fill="{kg}"/>')
    out.append(f'<path d="M-3 30 L0 42 L3 30 Z" fill="{sk_mid}"/>')
    out.append(f'<ellipse cx="0" cy="-34" rx="9" ry="11" fill="{kg}"/>')
    out.append(f'<path d="M-6 -38 L0 -42 L6 -38 L4 -32 L-4 -32 Z" fill="none" stroke="{sk_lo}" stroke-width="0.8" opacity="0.7"/>')
    out.append(f'<circle cx="-5.5" cy="-37" r="1.6" fill="#0A0A0A"/><circle cx="5.5" cy="-37" r="1.6" fill="#0A0A0A"/>')
    shell_d = "M0 -26 C16 -26 24 -14 24 4 C24 20 14 32 0 34 C-14 32 -24 20 -24 4 C-24 -14 -16 -26 0 -26 Z"
    out.append(f'<path d="{shell_d}" fill="{sg}"/>')
    scutes = [
        "M-6 -20 L6 -20 L9 -10 L0 -5 L-9 -10 Z", "M-9 -10 L0 -5 L9 -10 L10 3 L0 8 L-10 3 Z", "M-10 3 L0 8 L10 3 L9 16 L0 20 L-9 16 Z",
        "M-9 16 L0 20 L9 16 L6 27 L-6 27 Z",
    ]
    for m in (1, -1):
        scutes += [f"M{f(m * 6)} -20 L{f(m * 9)} -10 L{f(m * 19)} -8 L{f(m * 16)} -19 Z", f"M{f(m * 9)} -10 L{f(m * 10)} 3 L{f(m * 21)} 4 L{f(m * 19)} -8 Z",
                   f"M{f(m * 10)} 3 L{f(m * 9)} 16 L{f(m * 18)} 18 L{f(m * 21)} 4 Z", f"M{f(m * 9)} 16 L{f(m * 6)} 27 L{f(m * 12)} 28 L{f(m * 18)} 18 Z"]
    for d in scutes:
        out.append(f'<path d="{d}" fill="{sh_hi}" opacity="0.18" stroke="{sh_lo}" stroke-width="1.1" stroke-linejoin="round"/>')
    out.append(f'<path d="{shell_d}" fill="none" stroke="{sh_lo}" stroke-width="2.4"/>')
    out.append(f'<path d="{shell_d}" fill="none" stroke="{rimc}" stroke-width="0.9" opacity="0.6"/>')
    out.append(f'<path d="M-14 -18 Q-4 -24 8 -22" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" opacity="0.45"/>')
    return "".join(out)


# ---------------------------------------------------------------- poisson-cocher (idole des Maures)

def moorish_idol(card, name, s=1.0):
    """Poisson-cocher : corps haut et comprimé, museau en tube, deux larges bandes noires sur fond blanc et jaune,
    long filament dorsal blanc (tête à droite)."""
    clipid = card.id(name + "-c")
    body = ("M26 4 L20 2 C16 -12 6 -22 -6 -22 C-14 -20 -18 -10 -18 0 C-18 10 -14 22 -6 24 C6 24 16 16 20 6 Z")
    card.def_once(name + "-c", f'<clipPath id="{clipid}"><path d="{body}"/></clipPath>')
    stripes = (f'<rect x="-30" y="-40" width="70" height="80" fill="#F7F3E6"/>'
               f'<path d="M-30 -40 L-6 -40 L-12 40 L-30 40 Z" fill="#F2C230"/>'
               f'<path d="M-20 -40 L-10 -40 L-14 40 L-24 40 Z" fill="#111018"/>'
               f'<path d="M6 -40 L16 -40 L13 40 L3 40 Z" fill="#111018"/>'
               f'<path d="M-4 -40 L4 -40 L2 40 L-6 40 Z" fill="#FFFFFF" opacity="0.7"/>')
    out = [f'<path d="M-2 -21 C-6 -40 -22 -54 -48 -58 C-26 -48 -16 -36 -10 -20 Z" fill="#F7F3E6"/>',
           f'<path d="M-2 -21 C-6 -40 -22 -54 -48 -58" fill="none" stroke="#111018" stroke-width="0.6" opacity="0.5"/>',
           f'<path d="M-17 0 L-30 -9 L-27 0 L-30 9 Z" fill="#111018"/><path d="M-30 -9 L-27 0 L-30 9" fill="none" stroke="#F7F3E6" stroke-width="1.2"/>',
           f'<path d="M-6 24 C-10 30 -16 32 -20 30 C-14 28 -10 24 -8 18 Z" fill="#111018"/>',
           f'<g clip-path="url(#{clipid})">{stripes}</g>',
           f'<path d="{body}" fill="none" stroke="#111018" stroke-width="0.8" opacity="0.7"/>',
           '<path d="M20 2 L28 3 L28 5 L20 6 Z" fill="#E8902A"/>',
           '<circle cx="11" cy="-3" r="2.2" fill="#F7F3E6"/><circle cx="11" cy="-3" r="1.5" fill="#0A0A12"/>']
    return f'<g transform="scale({f(s)})">{"".join(out)}</g>'


# ---------------------------------------------------------------- raie manta, dessin fin (vue de dessous)

def manta2_path(span=100):
    """Raie manta, tête vers le haut : petites nageoires céphaliques enroulées, ailes triangulaires aux pointes rejetées
    en arrière, bord de fuite légèrement concave, disque du corps et nageoires pelviennes."""
    k = span / 100

    def half(m):
        return [(m * x * k, y * k) for x, y in (
            (6, -30), (9, -38), (11, -47), (15, -51), (18, -48), (18, -39), (21, -31),
            (36, -30), (56, -24), (74, -12), (89, 2), (100, 16),
            (92, 18), (76, 16), (60, 17), (46, 22), (34, 31), (26, 41),
            (21, 48), (15, 53), (7, 56))]
    return [(0, -29)] + half(1) + [(0, 58)] + half(-1)[::-1]


def manta2(card, name, style="ventre", span=100, body="#0B2C48", rimc="#FFF1B8", tail=90):
    """`style` : ventre (vue de dessous : ventre blanc, fentes branchiales) | ombre (contre-jour cerné de lumière)."""
    pts = manta2_path(span)
    k = span / 100
    d = smooth(pts, closed=True, n=5)
    out = [f'<path d="M0 {f(56 * k)} Q{f(3 * k)} {f((56 + tail * 0.5) * k)} {f(-5 * k)} {f((56 + tail) * k)}" fill="none" stroke="{body}" stroke-width="{f(2.4 * k)}" stroke-linecap="round"/>']
    if style == "ventre":
        g = card.rgrad(name + "-vg", [(0, "#F4F8FA", 1), (0.55, "#DCE8EE", 1), (0.8, "#5E7E96", 1), (1, body, 1)], 0.5, 0.42, 0.62)
        out.append(f'<path d="{d}" fill="{body}"/>')
        belly = smooth([(0, -24 * k), (16 * k, -22 * k), (40 * k, -14 * k), (60 * k, 0), (44 * k, 12 * k), (24 * k, 34 * k), (10 * k, 48 * k), (0, 50 * k),
                        (-10 * k, 48 * k), (-24 * k, 34 * k), (-44 * k, 12 * k), (-60 * k, 0), (-40 * k, -14 * k), (-16 * k, -22 * k)], True, 5)
        out.append(f'<path d="{belly}" fill="{g}"/>')
        for m in (1, -1):
            for i in range(5):
                y = (-6 + i * 6) * k
                out.append(f'<path d="M{f(m * (12 + i * 0.8) * k)} {f(y)} Q{f(m * 17 * k)} {f(y - 1.5 * k)} {f(m * (22 - i * 0.6) * k)} {f(y + 1 * k)}" fill="none" stroke="#2A4458" stroke-width="{f(1.1 * k)}" stroke-linecap="round" opacity="0.8"/>')
        rnd = random.Random(7)
        for _ in range(9):
            x, y = rnd.uniform(-14, 14) * k, rnd.uniform(8, 36) * k
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(1, 2.4) * k)}" fill="#3A5468" opacity="0.6"/>')
        out.append(f'<path d="M{f(-8 * k)} {f(-27 * k)} Q0 {f(-23 * k)} {f(8 * k)} {f(-27 * k)}" fill="none" stroke="#2A4458" stroke-width="{f(1.6 * k)}" stroke-linecap="round"/>')
        out.append(f'<path d="{d}" fill="none" stroke="{rimc}" stroke-width="{f(1.2 * k)}" opacity="0.85"/>')
    else:
        g = card.rgrad(name + "-og", [(0, "#14456A", 1), (0.7, body, 1), (1, "#041526", 1)], 0.5, 0.45, 0.65)
        out.append(f'<path d="{d}" fill="{g}"/>')
        for m in (1, -1):
            out.append(f'<path d="M{f(m * 14 * k)} {f(-24 * k)} Q{f(m * 46 * k)} {f(-22 * k)} {f(m * 70 * k)} {f(-6 * k)} Q{f(m * 42 * k)} {f(-12 * k)} {f(m * 18 * k)} {f(-6 * k)} Z" fill="#FFFFFF" opacity="0.07"/>')
        out.append(f'<path d="{d}" fill="none" stroke="{rimc}" stroke-width="{f(1.1 * k)}" opacity="0.95"/>')
    return "".join(out), d
