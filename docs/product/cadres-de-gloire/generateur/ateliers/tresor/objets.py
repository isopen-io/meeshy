"""Atelier « Trésor » — les objets : cordons, glands, bourses, cauris, chaînes, boucles, sceaux, gemmes, perles."""

import math
import random

from kit import (
    W, H, f, pt, esc, Card, lg, rg, metal_lin, cyl_grad, bevel, emboss, noise, soft, glint, halo, coin_use,
    coin_on_edge, signature_bars, grp, GOLD, GOLD_RICH, BRASS, STEEL, CHROME, CINZEL, SANS, nid,
)

# ---------------------------------------------------------------- échantillonnage de courbes


def bez(p0, p1, p2, p3, t):
    u = 1 - t
    x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0]
    y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
    return x, y


def sample(segs, step):
    """Points régulièrement espacés (x, y, angle) le long d'une suite de cubiques [(p0, p1, p2, p3), …]."""
    dense = []
    for p0, p1, p2, p3 in segs:
        for k in range(60):
            dense.append(bez(p0, p1, p2, p3, k / 60))
    dense.append(segs[-1][3])
    out = []
    acc = 0.0
    nxt = 0.0
    for (ax, ay), (bx, by) in zip(dense, dense[1:]):
        L = math.hypot(bx - ax, by - ay)
        while L > 0 and nxt <= acc + L:
            t = (nxt - acc) / L
            out.append((ax + (bx - ax) * t, ay + (by - ay) * t, math.degrees(math.atan2(by - ay, bx - ax))))
            nxt += step
        acc += L
    return out


def segs_d(segs):
    d = f"M{f(segs[0][0][0])} {f(segs[0][0][1])}"
    for _, p1, p2, p3 in segs:
        d += f" C{f(p1[0])} {f(p1[1])} {f(p2[0])} {f(p2[1])} {f(p3[0])} {f(p3[1])}"
    return d


def smooth(points, k=0.33):
    """Une suite de cubiques lisses (Catmull-Rom) passant par `points`."""
    segs = []
    pts = [points[0]] + list(points) + [points[-1]]
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        c1 = (p1[0] + (p2[0] - p0[0]) * k / 2, p1[1] + (p2[1] - p0[1]) * k / 2)
        c2 = (p2[0] - (p3[0] - p1[0]) * k / 2, p2[1] - (p3[1] - p1[1]) * k / 2)
        segs.append((p1, c1, c2, p2))
    return segs


def closed_smooth(points, k=0.33):
    n = len(points)
    segs = []
    for i in range(n):
        p0, p1, p2, p3 = points[(i - 1) % n], points[i], points[(i + 1) % n], points[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) * k / 2, p1[1] + (p2[1] - p0[1]) * k / 2)
        c2 = (p2[0] - (p3[0] - p1[0]) * k / 2, p2[1] - (p3[1] - p1[1]) * k / 2)
        segs.append((p1, c1, c2, p2))
    return segs


# ---------------------------------------------------------------- cordon torsadé, gland


def cord(card, segs, w=7.0, m=GOLD, key="cord", shadow=True):
    """Un cordon torsadé (le cordon de la bourse) le long de cubiques."""
    hi, mid, lo = m
    d = segs_d(segs)
    strand = lg(card, key + "-st", [(0, hi), (0.45, mid), (1, lo)], 0, 0, 0, 1)
    out = []
    if shadow:
        out.append(f'<path d="{d}" fill="none" stroke="#000000" stroke-width="{f(w * 1.1)}" opacity="0.5" transform="translate(1.5 3)" filter="{soft(card, 2)}" stroke-linecap="round"/>')
    out.append(f'<path d="{d}" fill="none" stroke="{lo}" stroke-width="{f(w)}" stroke-linecap="round"/>')
    for x, y, a in sample(segs, w * 0.62):
        out.append(
            f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(w * 0.5)}" ry="{f(w * 0.26)}" transform="rotate({f(a + 58)} {f(x)} {f(y)})" fill="{strand}" stroke="{lo}" stroke-width="0.35"/>'
        )
    return "".join(out)


def tassel(card, x, y, L=60, w=26, m=GOLD, key="tas", sway=0.0):
    """Un gland : bouton, collerette, franges qui s'évasent."""
    hi, mid, lo = m
    knob = rg(card, key + "-k", [(0, hi), (0.6, mid), (1, lo)], 0.35, 0.3, 0.7)
    rnd = random.Random(int(x * 7 + y))
    out = [f'<ellipse cx="{f(x + sway * 0.2)}" cy="{f(y + L * 0.62)}" rx="{f(w * 0.55)}" ry="{f(L * 0.45)}" fill="#000000" opacity="0.35" filter="{soft(card, 3)}"/>']
    top = y + w * 0.5
    fr = []
    n = 26
    for i in range(n):
        t = i / (n - 1)
        x0 = x - w * 0.32 + w * 0.64 * t
        x1 = x - w * 0.62 + w * 1.24 * t + sway + rnd.uniform(-1.5, 1.5)
        y1 = top + L * rnd.uniform(0.86, 1.0)
        col = (lo, mid, hi)[min(2, int(abs(t - 0.38) < 0.22) + int(abs(t - 0.38) < 0.08))]
        fr.append(f'<path d="M{f(x0)} {f(top + 6)} Q{f(x0 + (x1 - x0) * 0.3)} {f(top + L * 0.5)} {f(x1)} {f(y1)}" stroke="{col}" stroke-width="1.6" fill="none" stroke-linecap="round"/>')
    out.append("".join(fr))
    out.append(f'<rect x="{f(x - w * 0.36)}" y="{f(top + 2)}" width="{f(w * 0.72)}" height="{f(w * 0.3)}" rx="2" fill="{knob}" stroke="{lo}" stroke-width="0.6"/>')
    out.append(f'<ellipse cx="{f(x)}" cy="{f(y + w * 0.2)}" rx="{f(w * 0.3)}" ry="{f(w * 0.36)}" fill="{knob}" stroke="{lo}" stroke-width="0.6"/>')
    out.append(f'<ellipse cx="{f(x - w * 0.09)}" cy="{f(y + w * 0.06)}" rx="{f(w * 0.08)}" ry="{f(w * 0.12)}" fill="#FFFFFF" opacity="0.7"/>')
    return "".join(out)


# ---------------------------------------------------------------- cuir

LEATHER = {
    "tan": ("#F0B878", "#B06A30", "#4A2208"),
    "brun": ("#C88A55", "#7A4320", "#2A1206"),
    "bordeaux": ("#D26A6A", "#7E1E28", "#2A060C"),
    "vert": ("#8FBF85", "#2F6440", "#0C2414"),
    "nuit": ("#8C86C8", "#3A3478", "#110E2A"),
    "noir": ("#7A6A60", "#2E2420", "#0A0706"),
}


def leather_fill(card, key, d, pal, cx=0.38, cy=0.32, grain=True, op=0.42, seed=3):
    hi, mid, lo = pal
    g = rg(card, key + "-lf", [(0, hi), (0.45, mid), (1, lo)], cx, cy, 0.78)
    out = [f'<path d="{d}" fill="{g}"/>']
    if grain:
        out.append(f'<path d="{d}" fill="#000000" opacity="{op}" filter="{noise(card, key + "-gr", "0.95", 2, seed, (0.08, 0.04, 0.02), 1.5, -0.62)}"/>')
        out.append(f'<path d="{d}" fill="#000000" opacity="0.35" filter="{noise(card, key + "-gm", "0.035", 3, seed + 4, (0.1, 0.05, 0.02), 1.3, -0.55)}"/>')
    return "".join(out)


def pouch(card, x, y, s=1.0, pal=LEATHER["tan"], rot=0.0, key="po", open_=False, cord_m=GOLD, mark=True, coins=0, seed=5, flip=False):
    """La bourse à cordon : un sac de cuir froncé, son cordon noué et ses glands, la Signature repoussée."""
    hi, mid, lo = pal
    body = ("M-22 -40 C-44 -30 -74 -6 -70 30 C-66 62 -38 80 0 80 C38 80 66 62 70 30 C74 -6 44 -30 22 -40 Z")
    if open_:
        ruff = ("M-24 -42 C-40 -50 -58 -60 -60 -74 Q-44 -70 -34 -80 Q-18 -72 -4 -82 Q10 -72 24 -81 Q38 -70 52 -78 Q62 -70 60 -66 "
                "C56 -56 40 -48 24 -42 Z")
    else:
        ruff = ("M-22 -40 C-32 -50 -46 -58 -44 -72 Q-34 -66 -26 -75 Q-14 -66 -4 -77 Q6 -66 16 -76 Q28 -66 36 -74 Q44 -68 46 -72 "
                "C46 -60 32 -50 22 -40 Z")
    out = [f'<ellipse cx="0" cy="84" rx="70" ry="12" fill="#000000" opacity="0.55" filter="{soft(card, 6)}"/>']
    out.append(leather_fill(card, key + "b", body, pal, seed=seed))
    out.append(leather_fill(card, key + "r", ruff, (hi, mid, lo), 0.5, 0.2, seed=seed + 1))
    if open_:
        inner = rg(card, key + "-in", [(0, "#120804"), (1, "#3A1C0A")], 0.5, 0.7, 0.6)
        out.append(f'<ellipse cx="0" cy="-70" rx="46" ry="10" fill="{inner}"/>')
        rnd = random.Random(seed)
        for i in range(7):
            out.append(coin_use(card, rnd.uniform(-34, 34), -72 + rnd.uniform(-4, 3), rnd.uniform(9, 12), rnd.uniform(0.35, 0.6), rnd.uniform(-20, 20)))
    pleats = []
    for i, dx in enumerate((-16, -8, 0, 8, 16)):
        ex = dx * 3.2
        pleats.append(f'<path d="M{dx} -38 Q{f(dx * 1.6)} -14 {f(ex)} {f(8 + abs(dx) * 0.4)}" stroke="{lo}" stroke-width="2.4" fill="none" opacity="0.55" stroke-linecap="round"/>')
        pleats.append(f'<path d="M{dx + 2.5} -38 Q{f(dx * 1.6 + 3)} -14 {f(ex + 3)} {f(8 + abs(dx) * 0.4)}" stroke="{hi}" stroke-width="1.2" fill="none" opacity="0.35" stroke-linecap="round"/>')
    for dx in (-30, -12, 8, 26):
        pleats.append(f'<path d="M{dx} -42 Q{dx + 2} -54 {dx - 3} -68" stroke="{lo}" stroke-width="1.6" fill="none" opacity="0.5" stroke-linecap="round"/>')
    out.append("".join(pleats))
    out.append(f'<path d="M-60 44 C-44 74 44 74 60 44" fill="none" stroke="{hi}" stroke-width="1.4" stroke-dasharray="4 3.5" opacity="0.65"/>')
    out.append(f'<path d="M-60 45.5 C-44 75.5 44 75.5 60 45.5" fill="none" stroke="{lo}" stroke-width="1" stroke-dasharray="4 3.5" opacity="0.6"/>')
    if mark:
        out.append(f'<g opacity="0.5" transform="translate(1.2 1.6)">{signature_bars(0, 26, 0.62, lo)}</g>')
        out.append(f'<g opacity="0.45">{signature_bars(0, 26, 0.62, hi)}</g>')
        out.append(f'<g opacity="0.55">{signature_bars(0, 26.6, 0.6, mid)}</g>')
    rim = lg(card, key + "-rim", [(0, "#FFFFFF", 0), (0.7, "#FFFFFF", 0), (1, "#FFE2B0", 0.45)], 0, 0, 1, 0.3)
    out.append(f'<path d="{body}" fill="{rim}"/>')
    out.append(cord(card, [((-26, -40), (-14, -46), (14, -46), (26, -40))], 6.5, cord_m, key + "-c", shadow=False))
    out.append(cord(card, [((22, -42), (40, -34), (44, -10), (36, 14))], 5, cord_m, key + "-c", shadow=True))
    out.append(cord(card, [((18, -40), (28, -24), (24, -6), (18, 10))], 5, cord_m, key + "-c", shadow=True))
    out.append(tassel(card, 36, 12, 34, 16, cord_m, key + "-t1", sway=3))
    out.append(tassel(card, 18, 8, 30, 14, cord_m, key + "-t2", sway=-2))
    return grp("".join(out), x, y, s, rot, flip)


def cowrie(card, x, y, s=1.0, rot=0.0, back=False):
    """Un cauri, face fendue (ou dos bombé)."""
    shell = rg(card, "cw-sh", [(0, "#FFFDF4"), (0.55, "#F0E2C2"), (1, "#B79A6A")], 0.4, 0.35, 0.7)
    if back:
        dome = rg(card, "cw-bk", [(0, "#FFF6E0"), (0.5, "#E6C99A"), (1, "#8C6A3C")], 0.4, 0.3, 0.75)
        inner = (f'<ellipse rx="9" ry="13" fill="{dome}" stroke="#7A5A2E" stroke-width="0.6"/>'
                 f'<ellipse cx="-2.5" cy="-4" rx="2.5" ry="5" fill="#FFFFFF" opacity="0.6"/>')
    else:
        teeth = "".join(f'<line x1="-3.4" y1="{k}" x2="-1.2" y2="{k}" stroke="#7A5A2E" stroke-width="0.8"/><line x1="1.2" y1="{k}" x2="3.4" y2="{k}" stroke="#7A5A2E" stroke-width="0.8"/>' for k in range(-8, 10, 3))
        inner = (f'<ellipse rx="9" ry="13" fill="{shell}" stroke="#8C6A3C" stroke-width="0.6"/>'
                 f'<path d="M0.4 -11 Q-1.6 -4 0.8 0 Q2.2 5 -0.4 11" stroke="#3A2410" stroke-width="2" fill="none" stroke-linecap="round"/>{teeth}'
                 f'<ellipse cx="-4" cy="-5" rx="1.8" ry="3.6" fill="#FFFFFF" opacity="0.75"/>')
    return f'<g transform="{f"translate({f(x)} {f(y)}) rotate({f(rot)}) scale({f(s)})"}" filter="{card.shadow("cw-d", 0, 1.2, 1, "#000000", 0.5)}">{inner}</g>'


def cowrie_pouch(card, x, y, s=1.0, rot=0.0, key="cp", pal=LEATHER["brun"], seed=9):
    """La bourse de cauris : un sac de cuir rond cousu de cauris en rangs, frange de lanières terminées par des cauris."""
    hi, mid, lo = pal
    body = "M-24 -46 C-54 -40 -78 -10 -74 26 C-70 64 -38 84 0 84 C38 84 70 64 74 26 C78 -10 54 -40 24 -46 Z"
    out = [f'<ellipse cx="0" cy="88" rx="70" ry="12" fill="#000000" opacity="0.5" filter="{soft(card, 6)}"/>']
    out.append(leather_fill(card, key, body, pal, seed=seed))
    cid = key + "-clip"
    card.def_once(cid, f'<clipPath id="{card.id(cid)}"><path d="{body}"/></clipPath>')
    shells = []
    for row, yy in enumerate(range(-26, 84, 22)):
        off = 11 if row % 2 else 0
        for xx in range(-88 + off, 90, 22):
            shells.append(cowrie(card, xx, yy, 0.78, 90 if row % 2 else 90, back=False))
    out.append(f'<g clip-path="url(#{card.id(cid)})">{"".join(shells)}</g>')
    shade = rg(card, key + "-sd", [(0, "#000000", 0), (0.65, "#000000", 0.05), (1, "#000000", 0.55)], 0.42, 0.38, 0.66)
    out.append(f'<path d="{body}" fill="{shade}"/>')
    ruff = "M-24 -46 C-36 -56 -50 -62 -48 -76 Q-36 -70 -28 -80 Q-14 -70 -4 -82 Q8 -70 18 -81 Q30 -70 40 -79 Q50 -70 48 -74 C48 -62 36 -54 24 -46 Z"
    out.append(leather_fill(card, key + "r", ruff, pal, 0.5, 0.2, seed=seed + 2))
    out.append(cord(card, [((-28, -46), (-14, -52), (14, -52), (28, -46))], 7, ("#F6E3C0", "#B98C52", "#5A3A16"), key + "-c", shadow=False))
    for i, dx in enumerate((-30, -12, 8, 26)):
        L = 40 + (i % 2) * 14
        out.append(f'<path d="M{dx} 78 Q{dx + 4} {78 + L * 0.5} {dx - 2} {78 + L}" stroke="{mid}" stroke-width="3.2" fill="none" stroke-linecap="round"/>')
        out.append(cowrie(card, dx - 2, 78 + L + 8, 0.7, 6 * (i - 1.5)))
    return grp("".join(out), x, y, s, rot)


# ---------------------------------------------------------------- velours brodé


def embroidered_purse(card, x, y, s=1.0, rot=0.0, key="ep", velvet=("#E05A7A", "#8E1236", "#2C0410"), thread=GOLD, pearls=True, seed=4):
    """Bourse brodée : velours à rabat, rinceaux de fil d'or, médaillon à la Signature, frange de perles."""
    hi, mid, lo = velvet
    body = "M-62 -30 L62 -30 C66 20 60 60 40 78 Q0 98 -40 78 C-60 60 -66 20 -62 -30 Z"
    flap = "M-66 -34 Q0 -50 66 -34 L58 -6 Q30 26 0 34 Q-30 26 -58 -6 Z"
    vel = rg(card, key + "-v", [(0, hi), (0.4, mid), (1, lo)], 0.4, 0.3, 0.8)
    vel2 = rg(card, key + "-v2", [(0, hi), (0.5, mid), (1, lo)], 0.45, 0.1, 0.9)
    th, tm, tl = thread
    tg = lg(card, key + "-th", [(0, th), (0.5, tm), (1, tl)], 0, 0, 1, 1)
    bv = bevel(card, "ep-bv", 0.6, 2.0, 0.9, 16, shadow=(0, 0.8, 0.6, 0.6))
    out = [f'<ellipse cx="0" cy="96" rx="64" ry="10" fill="#000000" opacity="0.5" filter="{soft(card, 6)}"/>']
    out.append(f'<path d="{body}" fill="{vel}"/>')
    out.append(f'<path d="{body}" fill="#000000" opacity="0.18" filter="{noise(card, key + "-n", "1.1", 1, seed, (0, 0, 0), 1.2, -0.4)}"/>')
    emb = []
    for m in (1, -1):
        emb.append(f'<path d="M0 64 C{m * 18} 60 {m * 34} 44 {m * 30} 26 C{m * 27} 12 {m * 12} 14 {m * 16} 26 C{m * 19} 34 {m * 28} 30 {m * 26} 22" stroke="{tg}" stroke-width="2.2" fill="none" stroke-linecap="round"/>')
        emb.append(f'<path d="M{m * 30} 26 C{m * 46} 30 {m * 52} 50 {m * 44} 66" stroke="{tg}" stroke-width="1.8" fill="none" stroke-linecap="round"/>')
        for lx, ly, la in ((m * 40, 40, m * 40), (m * 48, 56, m * 70), (m * 22, 52, m * -30)):
            emb.append(f'<ellipse cx="{lx}" cy="{ly}" rx="5.5" ry="2.4" transform="rotate({la} {lx} {ly})" fill="{tg}"/>')
        emb.append(f'<circle cx="{m * 26}" cy="22" r="2.6" fill="{tg}"/>')
    emb.append(f'<circle cx="0" cy="64" r="4" fill="{tg}"/>')
    out.append(f'<g filter="{bv}">{"".join(emb)}</g>')
    out.append(f'<path d="{flap}" fill="{vel2}"/>')
    out.append(f'<path d="{flap}" fill="#000000" opacity="0.18" filter="{noise(card, key + "-n", "1.1", 1, seed, (0, 0, 0), 1.2, -0.4)}"/>')
    out.append(f'<g filter="{bv}"><path d="M-58 -26 Q0 -40 58 -26 L52 -6 Q28 20 0 27 Q-28 20 -52 -6 Z" fill="none" stroke="{tg}" stroke-width="2"/>'
               f'<path d="M-50 -20 Q0 -32 50 -20" fill="none" stroke="{tg}" stroke-width="1" stroke-dasharray="2 3"/>'
               f'<circle cx="0" cy="8" r="13" fill="none" stroke="{tg}" stroke-width="2.2"/>{signature_bars(0, 8.5, 0.32, tg)}</g>')
    if pearls:
        rnd = random.Random(seed)
        pp = []
        for i in range(-5, 6):
            px = i * 8.6
            base_y = 82 + 12 * (1 - (i / 6) ** 2)
            L = 10 + rnd.uniform(0, 14) + 10 * (1 - abs(i) / 6)
            pp.append(f'<line x1="{f(px)}" y1="{f(base_y)}" x2="{f(px)}" y2="{f(base_y + L)}" stroke="{tm}" stroke-width="0.8"/>')
            for k in range(int(L // 5)):
                pp.append(pearl(card, px, base_y + 4 + k * 5, 2.3))
            pp.append(pearl(card, px, base_y + L + 2, 3.4))
        out.append("".join(pp))
    out.append(cord(card, [((-58, -34), (-50, -96), (50, -96), (58, -34))], 4.5, thread, key + "-c"))
    out.append(tassel(card, -64, -32, 30, 13, thread, key + "-t1", -2))
    out.append(tassel(card, 64, -32, 30, 13, thread, key + "-t2", 2))
    return grp("".join(out), x, y, s, rot)


# ---------------------------------------------------------------- perles, gemmes


def pearl(card, x, y, r, tint="#FFF6F0"):
    g = rg(card, "pearl-" + tint[1:], [(0, "#FFFFFF"), (0.35, tint), (0.8, "#CDBFC8"), (1, "#7E7280")], 0.36, 0.32, 0.7)
    return (f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{g}"/>'
            f'<circle cx="{f(x - r * 0.32)}" cy="{f(y - r * 0.36)}" r="{f(r * 0.22)}" fill="#FFFFFF" opacity="0.9"/>')


def pearl_string(card, segs, r=3.2, gap=0.3, tint="#FFF6F0", shadow=True):
    pts = sample(segs, r * (2 + gap))
    out = []
    if shadow:
        out.append(f'<path d="{segs_d(segs)}" fill="none" stroke="#000000" stroke-width="{f(r * 2)}" stroke-linecap="round" opacity="0.4" transform="translate(1 2.5)" filter="{soft(card, 1.8)}"/>')
    out += [pearl(card, x, y, r, tint) for x, y, _ in pts]
    return "".join(out)


GEMS = {
    "rubis": ("#FF9AAE", "#E0244A", "#5E0618"),
    "emeraude": ("#9CF5C8", "#14A86A", "#03402A"),
    "saphir": ("#A8C8FF", "#2F6BFF", "#0A1E66"),
    "amethyste": ("#E2C2FF", "#9B4DFF", "#3A0E78"),
    "topaze": ("#FFE6A0", "#FFA820", "#7A3E00"),
    "diamant": ("#FFFFFF", "#D8ECFF", "#7C98B8"),
    "turquoise": ("#C6FFF4", "#2CC7B5", "#0A5048"),
}


def gem(cx, cy, r, kind="rubis", rot=0.0, sides=8, sy=1.0, sparkle_=True):
    """Une gemme taillée vue de dessus : table, couronne de facettes claires et sombres, éclat."""
    hi, mid, lo = GEMS[kind]
    outer = []
    inner = []
    for i in range(sides):
        a = rot + 360 * i / sides
        x, y = pt(0, 0, r, a)
        outer.append((x, y * sy))
        x2, y2 = pt(0, 0, r * 0.55, a + 180 / sides)
        inner.append((x2, y2 * sy))
    parts = [f'<path d="{"M" + " L".join(f"{f(x)} {f(y)}" for x, y in outer)} Z" fill="{lo}"/>']
    for i in range(sides):
        a, b = outer[i], outer[(i + 1) % sides]
        c = inner[i]
        p = inner[i - 1]
        shade = (hi, mid, lo, mid)[i % 4]
        parts.append(f'<path d="M{f(a[0])} {f(a[1])} L{f(b[0])} {f(b[1])} L{f(c[0])} {f(c[1])} Z" fill="{shade}" opacity="0.92"/>')
        parts.append(f'<path d="M{f(a[0])} {f(a[1])} L{f(c[0])} {f(c[1])} L{f(p[0])} {f(p[1])} Z" fill="{(mid, lo, mid, hi)[i % 4]}" opacity="0.85"/>')
    parts.append(f'<path d="{"M" + " L".join(f"{f(x)} {f(y)}" for x, y in inner)} Z" fill="{mid}"/>')
    parts.append(f'<path d="{"M" + " L".join(f"{f(x)} {f(y)}" for x, y in inner[:4])}" fill="none" stroke="{hi}" stroke-width="{f(max(0.4, r * 0.05))}" opacity="0.8"/>')
    parts.append(f'<path d="{"M" + " L".join(f"{f(x)} {f(y)}" for x, y in outer)} Z" fill="none" stroke="{lo}" stroke-width="{f(max(0.4, r * 0.06))}"/>')
    parts.append(f'<ellipse cx="{f(-r * 0.25)}" cy="{f(-r * 0.3 * sy)}" rx="{f(r * 0.22)}" ry="{f(r * 0.12 * sy)}" fill="#FFFFFF" opacity="0.75" transform="rotate(-30 {f(-r * 0.25)} {f(-r * 0.3 * sy)})"/>')
    g = f'<g transform="translate({f(cx)} {f(cy)})">{"".join(parts)}</g>'
    if sparkle_:
        g += glint(cx + r * 0.35, cy - r * 0.4 * sy, r * 0.55, "#FFFFFF", 0.9, cross=r > 7)
    return g


def cabochon(card, cx, cy, rx, ry, kind="rubis", setting=GOLD):
    hi, mid, lo = GEMS[kind]
    g = rg(card, "cab-" + kind, [(0, hi), (0.35, mid), (1, lo)], 0.38, 0.3, 0.72)
    sh, sm, sl = setting
    sg = lg(card, "cabset", [(0, sh), (0.5, sm), (1, sl)], 0, 0, 1, 1)
    prongs = "".join(
        f'<circle cx="{f(cx + rx * 1.02 * math.cos(math.radians(a)))}" cy="{f(cy + ry * 1.02 * math.sin(math.radians(a)))}" r="{f(max(1.2, rx * 0.16))}" fill="{sg}"/>'
        for a in (45, 135, 225, 315)
    )
    return (f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx * 1.18)}" ry="{f(ry * 1.18)}" fill="{sg}" stroke="{sl}" stroke-width="0.6"/>'
            f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{g}"/>{prongs}'
            f'<ellipse cx="{f(cx - rx * 0.3)}" cy="{f(cy - ry * 0.38)}" rx="{f(rx * 0.32)}" ry="{f(ry * 0.18)}" fill="#FFFFFF" opacity="0.8"/>')


# ---------------------------------------------------------------- chaînes, boucles, sceaux


def chain(card, segs, link=9.0, m=GOLD, key="ch", w=None):
    """Une chaîne à maillons alternés (à plat / sur la tranche) le long de cubiques."""
    hi, mid, lo = m
    w = w or link * 0.26
    g = lg(card, key + "-g", [(0, hi), (0.5, mid), (1, lo)], 0, 0, 1, 1)
    pts = sample(segs, link * 0.92)
    out = [f'<path d="{segs_d(segs)}" fill="none" stroke="#000000" stroke-width="{f(link * 0.7)}" opacity="0.35" transform="translate(1.5 3)" filter="{soft(card, 2.2)}"/>']
    for i, (x, y, a) in enumerate(pts):
        if i % 2 == 0:
            out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(link * 0.62)}" ry="{f(link * 0.36)}" transform="rotate({f(a)} {f(x)} {f(y)})" fill="none" stroke="{lo}" stroke-width="{f(w + 1)}"/>'
                       f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(link * 0.62)}" ry="{f(link * 0.36)}" transform="rotate({f(a)} {f(x)} {f(y)})" fill="none" stroke="{g}" stroke-width="{f(w)}"/>')
        else:
            out.append(f'<rect x="{f(x - link * 0.62)}" y="{f(y - w * 0.75)}" width="{f(link * 1.24)}" height="{f(w * 1.5)}" rx="{f(w * 0.75)}" transform="rotate({f(a)} {f(x)} {f(y)})" fill="{g}" stroke="{lo}" stroke-width="0.6"/>'
                       f'<rect x="{f(x - link * 0.45)}" y="{f(y - w * 0.3)}" width="{f(link * 0.7)}" height="{f(w * 0.4)}" rx="{f(w * 0.2)}" transform="rotate({f(a)} {f(x)} {f(y)})" fill="#FFFFFF" opacity="0.55"/>')
    return "".join(out)


def buckle(card, x, y, w=60, h=44, m=BRASS, key="bk", rot=0.0, strap=None):
    """Une boucle de ceinture en laiton : cadre, ardillon, passant."""
    hi, mid, lo = m
    g = metal_lin(card, key + "-g", m, 0, 0, 1, 1)
    bv = bevel(card, key + "-bv", 1.1, 3.2, 1.0, 22, shadow=(0, 3, 2.5, 0.6))
    inner = (f'<rect x="{f(-w / 2)}" y="{f(-h / 2)}" width="{f(w)}" height="{f(h)}" rx="{f(h * 0.22)}" fill="none" stroke="{g}" stroke-width="{f(h * 0.2)}"/>'
             f'<rect x="{f(-w * 0.08)}" y="{f(-h * 0.06)}" width="{f(w * 0.56)}" height="{f(h * 0.12)}" rx="{f(h * 0.06)}" fill="{g}"/>'
             f'<rect x="{f(-w * 0.12)}" y="{f(-h / 2 - 2)}" width="{f(w * 0.08)}" height="{f(h + 4)}" rx="2" fill="{g}"/>')
    return f'<g transform="translate({f(x)} {f(y)}) rotate({f(rot)})" filter="{bv}">{inner}</g>'


def rivet(card, x, y, r=3.2, m=BRASS, key="rv"):
    hi, mid, lo = m
    g = rg(card, key, [(0, "#FFFFFF"), (0.35, hi), (0.75, mid), (1, lo)], 0.35, 0.3, 0.7)
    return (f'<circle cx="{f(x + r * 0.25)}" cy="{f(y + r * 0.4)}" r="{f(r * 1.05)}" fill="#000000" opacity="0.5"/>'
            f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{g}"/>')


def wax_seal(card, x, y, r=30, color=("#F06A5A", "#B3182A", "#4A0408"), key="ws", ribbon=None, rot=0.0, seed=3):
    """Un sceau de cire : galette irrégulière, empreinte à la Signature, rubans."""
    hi, mid, lo = color
    rnd = random.Random(seed)
    pts = []
    for i in range(18):
        a = 360 * i / 18
        rr = r * rnd.uniform(0.9, 1.08)
        pts.append(pt(0, 0, rr, a))
    from_segs = closed_smooth(pts, 0.5)
    d = segs_d(from_segs) + " Z"
    g = rg(card, key + "-g", [(0, hi), (0.5, mid), (1, lo)], 0.38, 0.32, 0.75)
    bv = bevel(card, key + "-bv", r * 0.06, 3.5, 0.7, 14, shadow=(1, 3, 3, 0.6))
    deb = bevel(card, key + "-db", 0.8, -2.5, 0.8, 16, shadow=None)
    out = []
    if ribbon:
        rh, rm, rl = ribbon
        rbg = lg(card, key + "-rb", [(0, rh), (0.5, rm), (1, rl)], 0, 0, 1, 0)
        out.append(f'<path d="M-10 6 L-22 {f(r * 2.6)} L-14 {f(r * 2.3)} L-6 {f(r * 2.7)} L4 8 Z" fill="{rbg}" filter="{card.shadow("rb-sh", 0, 2, 2, "#000000", 0.5)}"/>')
        out.append(f'<path d="M6 6 L20 {f(r * 2.5)} L26 {f(r * 2.15)} L34 {f(r * 2.45)} L16 4 Z" fill="{rbg}" filter="{card.shadow("rb-sh", 0, 2, 2, "#000000", 0.5)}"/>')
    out.append(f'<path d="{d}" fill="{g}" filter="{bv}"/>')
    out.append(f'<circle r="{f(r * 0.68)}" fill="{mid}" filter="{deb}"/>')
    out.append(f'<circle r="{f(r * 0.68)}" fill="none" stroke="{lo}" stroke-width="{f(r * 0.04)}" opacity="0.6"/>')
    out.append(f'<g filter="{deb}">{signature_bars(0, r * 0.03, r * 0.0135, mid, w=7)}</g>')
    out.append(f'<g opacity="0.5" transform="translate({f(-r * 0.02)} {f(-r * 0.03)})">{signature_bars(0, r * 0.03, r * 0.0135, "none", w=7)}</g>')
    beads = "".join(f'<circle cx="{f(pt(0, 0, r * 0.56, a)[0])}" cy="{f(pt(0, 0, r * 0.56, a)[1])}" r="{f(r * 0.03)}" fill="{lo}" opacity="0.7"/>' for a in range(0, 360, 15))
    out.append(beads)
    out.append(f'<ellipse cx="{f(-r * 0.4)}" cy="{f(-r * 0.5)}" rx="{f(r * 0.22)}" ry="{f(r * 0.1)}" transform="rotate(-35 {f(-r * 0.4)} {f(-r * 0.5)})" fill="#FFFFFF" opacity="0.45"/>')
    return f'<g transform="translate({f(x)} {f(y)}) rotate({f(rot)})">{"".join(out)}</g>'


# ---------------------------------------------------------------- pluie et tas de pièces


def coin_rain(card, seed, n, region, rmin=8, rmax=16, m=GOLD, key="cf", avoid=(110, 300, 430, 700), trail=True):
    """Des Meeshes qui tombent en tournoyant, avec une traînée de lumière."""
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    tries = 0
    while len(out) < n and tries < n * 20:
        tries += 1
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if avoid and avoid[0] < x < avoid[2] and avoid[1] < y < avoid[3]:
            continue
        r = rnd.uniform(rmin, rmax)
        piece = ""
        if trail:
            tg = lg(card, "trail", [(0, "#FFE7A0", 0), (1, "#FFE7A0", 0.55)], 0, 0, 0, 1)
            piece += f'<rect x="{f(x - r * 0.18)}" y="{f(y - r * 4.5)}" width="{f(r * 0.36)}" height="{f(r * 4.2)}" rx="{f(r * 0.18)}" fill="{tg}"/>'
        if rnd.random() < 0.35:
            piece += coin_on_edge(card, x, y, r, rnd.uniform(-40, 40), m, key)
        else:
            piece += coin_use(card, x, y, r, rnd.uniform(0.35, 1.0), rnd.uniform(-60, 60), m, key)
        out.append(piece)
    return "".join(out)


def coin_mound(card, seed, cx, base_y, half_w, height, n, rmin=9, rmax=15, m=GOLD, key="cf", gems=0, gem_kinds=("rubis", "emeraude", "saphir", "amethyste", "diamant"), skew=0.0, lean=None):
    """Un tas de Meeshes en dôme : pièces couchées en perspective, quelques-unes debout, gemmes mêlées ; rangées de l'arrière vers l'avant."""
    rnd = random.Random(seed)
    items = []
    for _ in range(n):
        u = rnd.uniform(-1, 1)
        prof = (1 - abs(u) ** 1.7) if lean is None else lean(u)
        top = base_y - height * max(0.0, prof)
        y = rnd.uniform(top, base_y)
        x = cx + u * half_w + skew * (base_y - y)
        items.append(("c", x, y, rnd.uniform(rmin, rmax), rnd.uniform(0.28, 0.55), rnd.uniform(-25, 25), rnd.random()))
    for _ in range(gems):
        u = rnd.uniform(-0.85, 0.85)
        prof = (1 - abs(u) ** 1.7) if lean is None else lean(u)
        top = base_y - height * prof
        y = rnd.uniform(top + 6, base_y - 4)
        items.append(("g", cx + u * half_w, y, rnd.uniform(rmin * 0.6, rmax * 0.9), rnd.choice(gem_kinds), rnd.uniform(0, 45), 0))
    items.sort(key=lambda it: it[2])
    out = []
    for it in items:
        if it[0] == "c":
            _, x, y, r, t, a, p = it
            if p < 0.08:
                out.append(coin_use(card, x, y - r * 0.5, r, rnd.uniform(0.75, 0.95), a * 0.6, m, key))
            elif p < 0.13:
                out.append(coin_on_edge(card, x, y - r * 0.4, r, a * 2, m, key))
            else:
                out.append(coin_use(card, x, y, r, t, a, m, key))
        else:
            _, x, y, r, kind, a, _ = it
            out.append(gem(x, y, r, kind, a, 8, 0.62, sparkle_=rnd.random() < 0.5))
    return "".join(out)
