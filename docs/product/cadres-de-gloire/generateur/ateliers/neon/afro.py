"""Atelier « Néon » : les constructions africaines, redessinées en tubes de néon et en LED.

Grande Mosquée de Djenné (toron, piliers, œufs d'autruche), case-obus musgum (chevrons en relief),
façades peintes ndebele, bandes de kente, baobab, toguna dogon (la case à palabres), greniers dogon,
symboles adinkra en enseignes.
"""

import math
import random

from kit import *  # noqa: F401,F403


# ---------------------------------------------------------------- Djenné

def djenne(card, cx, base, w, h, color="#FFB43B", toron=GOLD, glass=("#1E0E33", "#0A0515"), egg="#FFF6E0", lw=2.4, pilaster_op=0.55):
    """La façade est de la Grande Mosquée de Djenné : trois tours à piliers coiffés de pinacles et d'œufs d'autruche,
    les toron (poutres de rônier) en saillie, le mur à créneaux. Rend le balisage."""
    tw_c, tw_s = w * 0.2, w * 0.16
    wall_top = base - h * 0.5
    towers = [(cx - w * 0.33, tw_s, h * 0.8), (cx, tw_c, h), (cx + w * 0.33, tw_s, h * 0.8)]
    pieces, studs, eggs = [], [], []
    # le mur et ses petits pinacles
    x0, x1 = cx - w / 2, cx + w / 2
    n_cren = int(w // 17)
    d = [f"M{f(x0)} {f(base)} L{f(x0)} {f(wall_top + 6)}"]
    step = w / n_cren
    for i in range(n_cren):
        a = x0 + i * step
        d.append(f"L{f(a + step * 0.2)} {f(wall_top + 6)} L{f(a + step * 0.44)} {f(wall_top - 14)} Q{f(a + step * 0.5)} {f(wall_top - 19)} {f(a + step * 0.56)} {f(wall_top - 14)} L{f(a + step * 0.8)} {f(wall_top + 6)}")
    d.append(f"L{f(x1)} {f(wall_top + 6)} L{f(x1)} {f(base)}")
    wall = " ".join(d)
    pieces.append((wall + "Z", f'<path d="{wall}"/>', []))
    for i in range(n_cren):
        a = x0 + i * step + step * 0.5
        eggs.append((a, wall_top - 21, 1.6))
    # rangées de toron sur le mur
    for row in range(3):
        yy = wall_top + 22 + row * 26
        if yy > base - 8:
            break
        for i in range(n_cren):
            studs.append((x0 + (i + 0.5) * step, yy))
    # les tours
    for tx, tw, th in towers:
        top = base - th
        tl, tr = tx - tw / 2, tx + tw / 2
        inset = tw * 0.08
        npin = 5 if tw == tw_c else 3
        pw = (tw - 2 * inset) / npin
        p = [f"M{f(tl)} {f(base)} L{f(tl + inset)} {f(top + 18)}"]
        for k in range(npin):
            a = tl + inset + k * pw
            ph = 34 if (k == npin // 2) else 26
            p.append(f"L{f(a + pw * 0.1)} {f(top + 18)} L{f(a + pw * 0.42)} {f(top + 18 - ph * 0.9)} Q{f(a + pw * 0.5)} {f(top + 18 - ph)} {f(a + pw * 0.58)} {f(top + 18 - ph * 0.9)} L{f(a + pw * 0.9)} {f(top + 18)}")
            eggs.append((a + pw * 0.5, top + 18 - ph - 3.5, 2.6 if k == npin // 2 else 2))
        p.append(f"L{f(tr - inset)} {f(top + 18)} L{f(tr)} {f(base)}")
        tp = " ".join(p)
        fines = []
        pieces.append((tp + "Z", f'<path d="{tp}"/>', fines))
        for k in range(npin):
            a = tl + inset + (k + 0.5) * pw
            fines.append(f'<line x1="{f(a - pw * 0.3)}" y1="{f(top + 22)}" x2="{f(a - pw * 0.32 - (tx - a) * 0.03)}" y2="{f(base - 4)}"/>'
                         f'<line x1="{f(a + pw * 0.3)}" y1="{f(top + 22)}" x2="{f(a + pw * 0.32 - (tx - a) * 0.03)}" y2="{f(base - 4)}"/>')
        rows = int((th - 30) // 22)
        for r in range(rows):
            yy = top + 34 + r * 22
            for k in range(npin + 1):
                a = tl + inset + k * pw
                studs.append((a, yy))
        # la niche du mihrab au pied de la tour centrale
        if tw == tw_c:
            nd = f"M{f(tx - tw * 0.16)} {f(base)} L{f(tx - tw * 0.16)} {f(base - 34)} Q{f(tx)} {f(base - 52)} {f(tx + tw * 0.16)} {f(base - 34)} L{f(tx + tw * 0.16)} {f(base)}"
            fines.append(f'<path d="{nd}"/>')
    g = card.grad(nid("dj"), [(0, glass[0]), (1, glass[1])])
    out = [glow_spot(card, cx, base - h * 0.3, w * 0.55, h * 0.6, color, 0.2)]
    for i, (fill_d, geo, fines) in enumerate(pieces):
        out.append(f'<path d="{fill_d}" fill="{g}"/>')
        if fines:
            out.append(fine("".join(fines), color, 1, pilaster_op))
        out.append(tube(card, geo, color, lw if i else lw * 0.85, 8))
    out.append(f'<g filter="{ublur(card, 2)}" opacity="0.9">' + "".join(f'<rect x="{f(x - 3.4)}" y="{f(y - 1.3)}" width="6.8" height="2.6" fill="{toron}"/>' for x, y in studs) + "</g>")
    out.append("".join(f'<rect x="{f(x - 3)}" y="{f(y - 1)}" width="6" height="2" rx="1" fill="{light(toron, 0.5)}"/>' for x, y in studs))
    out.append("".join(bulb(card, x, y, r, egg, 1) for x, y, r in eggs))
    return "".join(out)


# ---------------------------------------------------------------- case-obus musgum

def musgum_d(cx, base, w, h):
    return (f"M{f(cx - w / 2)} {f(base)} C{f(cx - w / 2)} {f(base - h * 0.55)} {f(cx - w * 0.2)} {f(base - h * 0.92)} {f(cx)} {f(base - h)} "
            f"C{f(cx + w * 0.2)} {f(base - h * 0.92)} {f(cx + w / 2)} {f(base - h * 0.55)} {f(cx + w / 2)} {f(base)}")


def musgum(card, cx, base, w, h, color=ORANGE, rib=YELLOW, glass=("#2A0F2E", "#0C0514"), lw=2.2, ribs=5):
    """La case-obus des Musgum (Cameroun, Tchad) : coque d'argile en ogive, couverte de chevrons en relief
    qui servent d'échelle aux bâtisseurs."""
    d = musgum_d(cx, base, w, h)
    g = card.grad(nid("mg"), [(0, glass[0]), (1, glass[1])])
    out = [f'<path d="{d} Z" fill="{g}"/>']
    chev = []
    for k in range(-(ribs // 2), ribs // 2 + 1):
        t = k / (ribs / 2 + 0.6)
        y = base - 8
        while True:
            # demi-largeur de la coque à cette hauteur (approx. par une ogive)
            u = (base - y) / h
            if u >= 0.93:
                break
            half = (w / 2) * (1 - u ** 2.2) ** 0.62
            x = cx + t * half
            s = 3.2 * (1 - u * 0.5)
            chev.append(f'<path d="M{f(x - s)} {f(y + s * 0.9)} L{f(x)} {f(y)} L{f(x + s)} {f(y + s * 0.9)}"/>')
            y -= 8.5 * (1 - u * 0.35)
    out.append(fine("".join(chev), rib, 1.1, 0.85))
    door = f"M{f(cx - w * 0.09)} {f(base)} L{f(cx - w * 0.09)} {f(base - h * 0.16)} Q{f(cx)} {f(base - h * 0.26)} {f(cx + w * 0.09)} {f(base - h * 0.16)} L{f(cx + w * 0.09)} {f(base)}"
    out.append(f'<path d="{door}" fill="#040208"/>')
    out.append(tube(card, f'<path d="{d}"/><path d="{door}"/>', color, lw, 7))
    return "".join(out)


# ---------------------------------------------------------------- façades ndebele

ND = {"y": "#FFC928", "r": "#F0303A", "b": "#2C63FF", "g": "#25C25A", "p": "#C23BFF", "k": "#0A0712", "w": "#F4EEFA"}


def ndebele(card, x, y, w, h, seed=1, ground=None, lit=1.0, outline=MAGENTA, units=None):
    """Une façade peinte ndebele (Afrique du Sud) en panneau lumineux : fond clair, cernes noirs épais,
    escaliers, losanges, chevrons et « lames » en aplats de couleurs franches."""
    rnd = random.Random(seed)
    ground = ground or ND["w"]
    out = [f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="{ground}" opacity="{0.92 * lit}"/>']
    uh = units or max(28, w * 0.9)
    n = max(1, int(h // uh))
    uh = h / n
    k = ND["k"]
    sw = max(1.6, w * 0.045)
    cols = ["y", "r", "b", "g", "p"]
    for i in range(n):
        ux, uy = x, y + i * uh
        c1, c2 = ND[rnd.choice(cols)], ND[rnd.choice(cols)]
        kind = (seed + i) % 4
        m = w * 0.1
        if kind == 0:  # escalier symétrique
            steps = 3
            pts = []
            for s in range(steps):
                pts.append((ux + m + s * (w - 2 * m) / (2 * steps), uy + uh - m - s * (uh - 2 * m) / steps))
            dd = f"M{f(ux + m)} {f(uy + uh - m)} "
            for s in range(steps):
                sx = ux + m + s * (w - 2 * m) / (2 * steps)
                sy = uy + uh - m - (s + 1) * (uh - 2 * m) / steps
                dd += f"L{f(sx)} {f(sy)} L{f(sx + (w - 2 * m) / (2 * steps))} {f(sy)} "
            for s in range(steps - 1, -1, -1):
                sx = ux + w - m - s * (w - 2 * m) / (2 * steps)
                sy = uy + uh - m - (s + 1) * (uh - 2 * m) / steps
                dd += f"L{f(sx - (w - 2 * m) / (2 * steps))} {f(sy)} L{f(sx)} {f(sy)} "
            dd += f"L{f(ux + w - m)} {f(uy + uh - m)} Z"
            out.append(f'<path d="{dd}" fill="{c1}" stroke="{k}" stroke-width="{f(sw)}" stroke-linejoin="miter"/>')
        elif kind == 1:  # losange double
            cxu, cyu = ux + w / 2, uy + uh / 2
            out.append(f'<path d="M{f(cxu)} {f(uy + m)} L{f(ux + w - m)} {f(cyu)} L{f(cxu)} {f(uy + uh - m)} L{f(ux + m)} {f(cyu)}Z" fill="{c1}" stroke="{k}" stroke-width="{f(sw)}"/>')
            out.append(f'<path d="M{f(cxu)} {f(uy + uh * 0.32)} L{f(ux + w * 0.68)} {f(cyu)} L{f(cxu)} {f(uy + uh * 0.68)} L{f(ux + w * 0.32)} {f(cyu)}Z" fill="{c2}" stroke="{k}" stroke-width="{f(sw * 0.8)}"/>')
        elif kind == 2:  # chevrons empilés
            for j in range(3):
                yy = uy + m + j * (uh - 2 * m) / 3
                hh = (uh - 2 * m) / 3
                cc = c1 if j % 2 == 0 else c2
                out.append(f'<path d="M{f(ux + m)} {f(yy + hh)} L{f(ux + w / 2)} {f(yy + hh * 0.2)} L{f(ux + w - m)} {f(yy + hh)} L{f(ux + w - m)} {f(yy + hh * 0.55)} L{f(ux + w / 2)} {f(yy - hh * 0.25)} L{f(ux + m)} {f(yy + hh * 0.55)}Z" fill="{cc}" stroke="{k}" stroke-width="{f(sw * 0.8)}"/>')
        else:  # la « lame » : hexagone allongé à encoches
            cyu = uy + uh / 2
            hh = uh * 0.22
            dd = (f"M{f(ux + m)} {f(cyu)} L{f(ux + m + hh)} {f(cyu - hh)} L{f(ux + w / 2 - 3)} {f(cyu - hh)} L{f(ux + w / 2)} {f(cyu - hh * 0.4)} L{f(ux + w / 2 + 3)} {f(cyu - hh)} "
                  f"L{f(ux + w - m - hh)} {f(cyu - hh)} L{f(ux + w - m)} {f(cyu)} L{f(ux + w - m - hh)} {f(cyu + hh)} L{f(ux + w / 2 + 3)} {f(cyu + hh)} L{f(ux + w / 2)} {f(cyu + hh * 0.4)} "
                  f"L{f(ux + w / 2 - 3)} {f(cyu + hh)} L{f(ux + m + hh)} {f(cyu + hh)}Z")
            out.append(f'<rect x="{f(ux + m * 0.6)}" y="{f(uy + m * 0.6)}" width="{f(w - m * 1.2)}" height="{f(uh - m * 1.2)}" fill="{c2}" stroke="{k}" stroke-width="{f(sw)}"/>')
            out.append(f'<path d="{dd}" fill="{c1}" stroke="{k}" stroke-width="{f(sw * 0.8)}"/>')
        out.append(f'<line x1="{f(x)}" y1="{f(uy)}" x2="{f(x + w)}" y2="{f(uy)}" stroke="{k}" stroke-width="{f(sw * 1.3)}"/>')
    out.append(f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="none" stroke="{k}" stroke-width="{f(sw * 1.6)}"/>')
    panel = "".join(out)
    glow = f'<rect x="{f(x - 4)}" y="{f(y - 4)}" width="{f(w + 8)}" height="{f(h + 8)}" fill="{outline}" opacity="{0.35 * lit}" filter="{ublur(card, 9)}"/>'
    return glow + f'<g opacity="{lit}">{panel}</g>' + tube(card, f'<rect x="{f(x - 2)}" y="{f(y - 2)}" width="{f(w + 4)}" height="{f(h + 4)}"/>', outline, 1.3, 4)


# ---------------------------------------------------------------- kente

KENTE = ["#F5B800", "#0E9F48", "#E0202E", "#0B0710", "#2257D6"]


def kente(card, x0, y, x1, h, seed=3, glow=True, op=1.0, vertical=False):
    """Une bande de kente (Asante, Ewe) en LED : blocs à chaîne apparente (rayures fines) et à trame apparente (barres)."""
    rnd = random.Random(seed)
    out = []
    pos = x0
    L = x1 - x0
    i = 0
    while pos < x1:
        bw = rnd.choice((h * 0.9, h * 1.2, h * 0.6))
        bw = min(bw, x1 - pos)
        if i % 2 == 0:
            n = 6
            for k in range(n):
                c = KENTE[(k + i) % 3]
                out.append(("r", pos + k * bw / n, y, bw / n, h, c))
        else:
            c1 = rnd.choice(KENTE[:3] + KENTE[4:])
            out.append(("r", pos, y, bw, h, KENTE[3]))
            for k in range(3):
                out.append(("r", pos + 1, y + h * (0.15 + k * 0.28), bw - 2, h * 0.16, c1 if k != 1 else KENTE[0]))
        pos += bw
        i += 1
    rects = []
    for _, rx, ry, rw, rh, c in out:
        if vertical:
            rx, ry, rw, rh = x0 + (ry - y) + 0, y + (rx - x0), rh, rw
        rects.append(f'<rect x="{f(rx)}" y="{f(ry)}" width="{f(rw + 0.3)}" height="{f(rh + 0.3)}" fill="{c}"/>')
    body = "".join(rects)
    if vertical:
        frame = f'<rect x="{f(x0)}" y="{f(y)}" width="{f(h)}" height="{f(L)}" fill="none" stroke="#0B0710" stroke-width="1.2"/>'
    else:
        frame = f'<rect x="{f(x0)}" y="{f(y)}" width="{f(L)}" height="{f(h)}" fill="none" stroke="#0B0710" stroke-width="1.2"/>'
    g = f'<g filter="{ublur(card, 5)}" opacity="0.55">{body}</g>' if glow else ""
    return f'<g opacity="{op}">{g}{body}{frame}</g>'


# ---------------------------------------------------------------- baobab

def baobab_geo(x, base, h, seed=2, lean=0.0):
    """Le baobab : tronc en bouteille, couronne de branches comme des racines tendues au ciel. Rend la géométrie (traits)."""
    rnd = random.Random(seed)
    tw = h * 0.36
    crown = base - h * 0.62
    trunk = (f"M{f(x - tw * 0.5)} {f(base)} C{f(x - tw * 0.62)} {f(base - h * 0.25)} {f(x - tw * 0.42)} {f(crown + h * 0.12)} {f(x - tw * 0.3)} {f(crown)} "
             f"M{f(x + tw * 0.5)} {f(base)} C{f(x + tw * 0.62)} {f(base - h * 0.25)} {f(x + tw * 0.42)} {f(crown + h * 0.12)} {f(x + tw * 0.3)} {f(crown)}")
    geo = [f'<path d="{trunk}"/>', f'<path d="M{f(x - tw * 0.55)} {f(base)} L{f(x + tw * 0.55)} {f(base)}"/>']

    def branch(bx, by, ang, ln, depth):
        ex, ey = bx + ln * math.sin(math.radians(ang)), by - ln * math.cos(math.radians(ang))
        cxm, cym = bx + ln * 0.5 * math.sin(math.radians(ang - 12)), by - ln * 0.5 * math.cos(math.radians(ang - 12))
        geo.append(f'<path d="M{f(bx)} {f(by)} Q{f(cxm)} {f(cym)} {f(ex)} {f(ey)}"/>')
        if depth > 0:
            for da in (-28 + rnd.uniform(-8, 8), 24 + rnd.uniform(-8, 8)):
                branch(ex, ey, ang + da, ln * rnd.uniform(0.52, 0.66), depth - 1)

    for i, a in enumerate((-62, -30, -4, 24, 56)):
        sx = x + (i - 2) * tw * 0.14
        branch(sx, crown + 4, a + lean + rnd.uniform(-6, 6), h * rnd.uniform(0.2, 0.28), 2)
    return "".join(geo)


# ---------------------------------------------------------------- toguna dogon

def toguna(card, cx, base, w, h, roof=YELLOW, post=ORANGE, glass=("#1A0C2C", "#08040F"), layers=7):
    """La toguna des Dogon (Mali) : la case à palabres, basse, sous un toit épais de tiges de mil empilées,
    portée par des piliers sculptés. On y parle assis : on ne s'y lève pas en colère."""
    roof_h = h * 0.5
    roof_top = base - h
    roof_bot = roof_top + roof_h
    out = []
    # piliers
    n = 8
    pg = card.grad(nid("tgp"), [(0, "#2A1636"), (1, "#0C0612")])
    pgeo = []
    carve = []
    for i in range(n):
        px = cx - w * 0.42 + i * (w * 0.84) / (n - 1)
        pw = w * 0.045
        sway = (i % 3 - 1) * 2
        d = (f"M{f(px - pw)} {f(base)} C{f(px - pw * 1.2)} {f(base - (base - roof_bot) * 0.5)} {f(px - pw * 0.7 + sway)} {f(roof_bot + 6)} {f(px - pw * 1.1 + sway)} {f(roof_bot)} "
             f"L{f(px + pw * 1.1 + sway)} {f(roof_bot)} C{f(px + pw * 0.7 + sway)} {f(roof_bot + 6)} {f(px + pw * 1.2)} {f(base - (base - roof_bot) * 0.5)} {f(px + pw)} {f(base)}Z")
        out.append(f'<path d="{d}" fill="{pg}"/>')
        pgeo.append(f'<path d="{d}"/>')
        yy = roof_bot + 10
        while yy < base - 8:
            carve.append(f'<path d="M{f(px - pw * 0.6)} {f(yy)} L{f(px)} {f(yy + 5)} L{f(px + pw * 0.6)} {f(yy)}"/>')
            yy += 9

    out.append(fine("".join(carve), light(post, 0.3), 0.9, 0.75))
    out.append(tube(card, "".join(pgeo), post, 1.3, 4))
    # le toit : couches de tiges de mil, épaisses, presque de même largeur, aux bords effilochés
    rg = card.grad(nid("tgr"), [(0, glass[0]), (1, glass[1])])
    thatch = card.grad(nid("tgt"), [(0, "#000000"), (0.55, dark(roof, 0.72)), (1, dark(roof, 0.45))])
    rnd = random.Random(5)
    lay_geo = []
    hatch = []
    for k in range(layers):
        y0 = roof_top + roof_h * k / layers
        y1 = roof_top + roof_h * (k + 1) / layers
        spread = w * (0.5 + rnd.uniform(-0.03, 0.03) + (0.02 if k == layers - 1 else 0))
        x0, x1 = cx - spread, cx + spread
        d = f"M{f(x0)} {f(y1)} Q{f(x0 - 6)} {f((y0 + y1) / 2)} {f(x0 + 4)} {f(y0)} L{f(x1 - 4)} {f(y0)} Q{f(x1 + 6)} {f((y0 + y1) / 2)} {f(x1)} {f(y1)}Z"
        out.append(f'<path d="{d}" fill="{rg}"/>')
        out.append(f'<path d="{d}" fill="{thatch}" opacity="0.55"/>')
        lay_geo.append(f'<path d="M{f(x0)} {f(y1)} L{f(x1)} {f(y1)}"/>')
        xx = x0 + 2
        while xx < x1 - 2:
            hatch.append(f'<line x1="{f(xx)}" y1="{f(y1 - 1)}" x2="{f(xx + rnd.uniform(-2.5, 2.5))}" y2="{f(y1 - rnd.uniform(3, (y1 - y0) * 0.6))}"/>')
            xx += rnd.uniform(4, 8)
        for side in (-1, 1):
            ex = cx + side * spread
            for _ in range(5):
                yy = rnd.uniform(y0, y1)
                hatch.append(f'<line x1="{f(ex)}" y1="{f(yy)}" x2="{f(ex + side * rnd.uniform(3, 9))}" y2="{f(yy + rnd.uniform(-2, 3))}"/>')
    hatch_bot = []
    xx = cx - w * 0.5
    while xx < cx + w * 0.5:
        hatch_bot.append(f'<line x1="{f(xx)}" y1="{f(roof_bot)}" x2="{f(xx + rnd.uniform(-2, 2))}" y2="{f(roof_bot + rnd.uniform(3, 9))}"/>')
        xx += rnd.uniform(2, 4)
    top_geo = f'<path d="M{f(cx - w * 0.5 + 4)} {f(roof_top)} L{f(cx + w * 0.5 - 4)} {f(roof_top)}"/>'
    out.append(fine("".join(hatch), light(roof, 0.2), 0.6, 0.5))
    out.append(fine("".join(hatch_bot), roof, 0.8, 0.75))
    out.append(tube(card, "".join(lay_geo), post, 0.9, 4, op=0.85))
    out.append(tube(card, top_geo, roof, 1.8, 7))
    return "".join(out)


def granary(card, cx, base, s, color=YELLOW, roof=ORANGE):
    """Un grenier dogon : tour d'argile carrée, coiffée d'un chapeau de paille conique."""
    w, h = 18 * s, 26 * s
    body = f'<path d="M{f(cx - w / 2)} {f(base)} L{f(cx - w * 0.44)} {f(base - h)} L{f(cx + w * 0.44)} {f(base - h)} L{f(cx + w / 2)} {f(base)}Z"/>'
    hat = f'<path d="M{f(cx - w * 0.7)} {f(base - h + 2)} L{f(cx)} {f(base - h - 18 * s)} L{f(cx + w * 0.7)} {f(base - h + 2)}Z"/>'
    door = f'<rect x="{f(cx - 3 * s)}" y="{f(base - h * 0.62)}" width="{f(6 * s)}" height="{f(7 * s)}"/>'
    return (f'<path d="M{f(cx - w / 2)} {f(base)} L{f(cx - w * 0.44)} {f(base - h)} L{f(cx + w * 0.44)} {f(base - h)} L{f(cx + w / 2)} {f(base)}Z" fill="#0E0718"/>'
            f'<path d="M{f(cx - w * 0.7)} {f(base - h + 2)} L{f(cx)} {f(base - h - 18 * s)} L{f(cx + w * 0.7)} {f(base - h + 2)}Z" fill="#160A20"/>'
            + tube(card, body + door, color, 1.0, 3) + tube(card, hat, roof, 1.1, 3))


# ---------------------------------------------------------------- adinkra en enseigne

def adinkra_sign(card, fn, cx, cy, s, color, box=True, bw=54, bh=64, frame=None):
    """Une enseigne-drapeau : un caisson sombre, un symbole adinkra en tube de néon."""
    out = []
    if box:
        frame = frame or "#3A2A66"
        out.append(f'<rect x="{f(cx - bw / 2)}" y="{f(cy - bh / 2)}" width="{bw}" height="{bh}" rx="6" fill="#0A0616" stroke="{frame}" stroke-width="1.2"/>')
        out.append(f'<rect x="{f(cx - bw / 2)}" y="{f(cy - bh / 2)}" width="{bw}" height="{bh}" rx="6" fill="{color}" opacity="0.08"/>')
    sym = fn(cx, cy, s, color)
    core = fn(cx, cy, s * 1.0, light(color, 0.65))
    out.append(f'<g filter="{ublur(card, 6)}" opacity="0.95">{sym}</g><g filter="{ublur(card, 1.5)}">{sym}</g><g opacity="0.85" transform="translate({f(cx)} {f(cy)}) scale(0.985) translate({f(-cx)} {f(-cy)})">{core}</g>')
    return "".join(out)


def kente_v(card, x, y0, y1, w, seed=3, glow=True, op=1.0):
    """Une bande de kente verticale, de y0 à y1, large de w."""
    return kente(card, x, y0, x + (y1 - y0), w, seed=seed, glow=glow, op=op, vertical=True)


# ---------------------------------------------------------------- Djenné, la façade entière (redessin 2026-10-10)

def sugarloaf(xl, xr, yt, ph):
    """Un pinacle en « pain de sucre » : cône d'argile aux flancs bombés, pointe arrondie (de xl à xr, base yt)."""
    xc = (xl + xr) / 2
    pw = xr - xl
    return (f"L{f(xl)} {f(yt)} C{f(xl - pw * 0.04)} {f(yt - ph * 0.62)} {f(xc - pw * 0.2)} {f(yt - ph)} {f(xc)} {f(yt - ph)} "
            f"C{f(xc + pw * 0.2)} {f(yt - ph)} {f(xr + pw * 0.04)} {f(yt - ph * 0.62)} {f(xr)} {f(yt)}")


def djenne_facade(card, base, towers, wall_top, wall_pil=34, color="#FFB43B", toron=GOLD, egg="#FFF6E0",
                  fill=("#2A1530", "#120A1C"), batter=0.035, lw=2.2, row=22, x0=-30, x1=570, pil_op=0.5):
    """La façade est de la Grande Mosquée de Djenné, en entier : le mur rythmé de piliers coiffés de pains de sucre,
    trois tours-minarets battues (plus larges au pied), leurs piliers et leurs pinacles à œuf d'autruche, et la grille
    des toron (poutres de rônier) qui hérisse toute la façade.
    `towers` : [(cx, largeur au sommet, y du sommet, nb de piliers, hauteur du pinacle central)]."""
    g = card.grad(nid("djf"), [(0, fill[0]), (1, fill[1])])
    out = []
    eggs, studs, pil_lines = [], [], []
    # ---- le mur et ses piliers
    n = int((x1 - x0) // wall_pil)
    d = [f"M{f(x0)} {f(base)} L{f(x0)} {f(wall_top)}"]
    pw = 12
    for i in range(n):
        xc = x0 + (i + 0.5) * wall_pil
        if any(abs(xc - tx) < tw / 2 + (base - wt) * batter * 0.15 + 10 for tx, tw, wt, _, _ in towers):
            continue
        d.append(sugarloaf(xc - pw * 0.7, xc + pw * 0.7, wall_top, 24))
        eggs.append((xc, wall_top - 26, 1.7))
        pil_lines.append(f'<line x1="{f(xc - pw / 2)}" y1="{f(wall_top + 2)}" x2="{f(xc - pw / 2 - 1)}" y2="{f(base)}"/>'
                         f'<line x1="{f(xc + pw / 2)}" y1="{f(wall_top + 2)}" x2="{f(xc + pw / 2 + 1)}" y2="{f(base)}"/>')
        y = wall_top + 16
        while y < base - 6:
            studs.append((xc, y, pw + 9))
            y += row
    d.append(f"L{f(x1)} {f(wall_top)} L{f(x1)} {f(base)}")
    wall = " ".join(d)
    out.append(f'<path d="{wall} Z" fill="{g}"/>')
    out.append(tube(card, f'<path d="{" ".join(d[:-1])} L{f(x1)} {f(wall_top)}"/>', color, lw * 0.85, 7))
    # ---- les tours
    for tx, tw, top, npil, ph_c in towers:
        bb = (base - top) * batter
        tl, tr = tx - tw / 2, tx + tw / 2
        ppw = tw * (0.15 if npil <= 3 else 0.12)
        xs = [tl + ppw / 2 + k * (tw - ppw) / (npil - 1) for k in range(npil)]
        p = [f"M{f(tl - bb)} {f(base)} L{f(tl)} {f(top)}"]
        for k, xc in enumerate(xs):
            mid = k == npil // 2
            corner = k in (0, npil - 1)
            ph = ph_c if mid else (ph_c * 0.78 if corner else ph_c * 0.6)
            p.append(sugarloaf(xc - ppw * 0.68, xc + ppw * 0.68, top, ph))
            eggs.append((xc, top - ph - 3, 2.8 if mid else 2.1))
        p.append(f"L{f(tr)} {f(top)} L{f(tr + bb)} {f(base)}")
        tp = " ".join(p)
        tg = card.grad(nid("djt"), [(0, mix(fill[0], "#4A2238", 0.35)), (1, fill[1])])
        out.append(f'<path d="{tp} Z" fill="{tg}"/>')
        lines = []
        for xc in xs:
            for s in (-1, 1):
                xa = xc + s * ppw / 2
                xb = xa + (xa - tx) / (tw / 2) * bb
                lines.append(f'<line x1="{f(xa)}" y1="{f(top + 3)}" x2="{f(xb)}" y2="{f(base)}"/>')
        out.append(fine("".join(lines), color, 1.0, pil_op + 0.15))
        out.append(tube(card, f'<path d="{tp}"/>', color, lw, 8))
        y = top + 14
        while y < base - 6:
            t = (y - top) / (base - top)
            for xc in xs[1:-1]:
                xx = xc + (xc - tx) / (tw / 2) * bb * t
                studs.append((xx, y, ppw + 8))
            studs.append((tl - bb * t + 2, y, 18))
            studs.append((tr + bb * t - 2, y, 18))
            y += row
    out.append(fine("".join(pil_lines), color, 0.9, pil_op))
    shade = "".join(f'<rect x="{f(x - L / 2)}" y="{f(y + 1.2)}" width="{f(L)}" height="2.4" fill="#000000"/>' for x, y, L in studs)
    out.append(f'<g opacity="0.55">{shade}</g>')
    bar = "".join(f'<rect x="{f(x - L / 2)}" y="{f(y - 1.3)}" width="{f(L)}" height="2.6" rx="1.2" fill="{toron}"/>' for x, y, L in studs)
    core = "".join(f'<rect x="{f(x - L / 2 + 1)}" y="{f(y - 0.7)}" width="{f(L - 2)}" height="1.4" rx="0.7" fill="{light(toron, 0.6)}"/>' for x, y, L in studs)
    out.append(f'<g filter="{ublur(card, 2.4)}" opacity="0.85">{bar}</g>{bar}{core}')
    out.append("".join(bulb(card, x, y, r, egg, 1) for x, y, r in eggs))
    return "".join(out)


# ---------------------------------------------------------------- baobab plein (redessin 2026-10-10)

def baobab_neon(card, x, base, h, color=YELLOW, seed=2, lean=0.0, fill=("#1A0A2A", "#0A0414"), lw=2.0, halo=6, girth=0.42):
    """Le baobab (Adansonia) : un tronc-bouteille énorme, et une couronne plate de grosses branches courtes,
    tordues comme des racines tendues au ciel. Tronc plein (verre sombre) cerné de néon ; branches en tubes dégressifs."""
    rnd = random.Random(seed)
    bw = h * girth
    crown = base - h * 0.56
    tw = bw * 0.62
    trunk = (f"M{f(x - bw / 2)} {f(base)} C{f(x - bw * 0.62)} {f(base - h * 0.22)} {f(x - tw * 0.62)} {f(crown + h * 0.16)} {f(x - tw / 2)} {f(crown)} "
             f"Q{f(x)} {f(crown - h * 0.05)} {f(x + tw / 2)} {f(crown)} "
             f"C{f(x + tw * 0.62)} {f(crown + h * 0.16)} {f(x + bw * 0.62)} {f(base - h * 0.22)} {f(x + bw / 2)} {f(base)}")
    g = card.grad(nid("bao"), [(0, fill[0]), (1, fill[1])], 0, 0, 1, 0)
    lv = [[], [], []]

    def branch(bx, by, ang, ln, depth):
        ex, ey = pt(bx, by, ln, ang)
        bend = rnd.uniform(14, 30) * (-1 if ang > 0 else 1)
        mx, my = pt(bx, by, ln * 0.55, ang + bend)
        lv[2 - depth].append(f'<path d="M{f(bx)} {f(by)} Q{f(mx)} {f(my)} {f(ex)} {f(ey)}"/>')
        if depth > 0:
            k = 2 if depth == 2 else 3
            for j in range(k):
                da = (j - (k - 1) / 2) * rnd.uniform(26, 40) + rnd.uniform(-8, 8)
                branch(ex, ey, ang * 0.7 + da, ln * rnd.uniform(0.45, 0.6), depth - 1)

    angs = (-82, -58, -30, -8, 14, 36, 62, 84)
    for i, a in enumerate(angs):
        sx = x + (i - 3.5) * tw * 0.13
        ln = h * rnd.uniform(0.22, 0.3) * (1.08 if abs(a) > 50 else 0.9)
        branch(sx, crown + 3 + abs(a) * 0.06, a + lean + rnd.uniform(-5, 5), ln, 2)
    out = [f'<path d="{trunk} Z" fill="{g}"/>']
    bark = "".join(f'<path d="M{f(x + o * bw * 0.3)} {f(base - 4)} C{f(x + o * bw * 0.36)} {f(base - h * 0.2)} {f(x + o * tw * 0.3)} {f(crown + h * 0.14)} {f(x + o * tw * 0.22)} {f(crown + 6)}"/>' for o in (-0.8, -0.2, 0.45))
    out.append(fine(bark, color, 0.8, 0.35))
    out.append(tube(card, "".join(lv[2]), color, lw * 0.45, halo * 0.5, op=0.85))
    out.append(tube(card, "".join(lv[1]), color, lw * 0.8, halo * 0.7))
    out.append(tube(card, "".join(lv[0]), color, lw * 1.25, halo))
    out.append(tube(card, f'<path d="{trunk}"/>', color, lw * 1.1, halo))
    return "".join(out)


# ---------------------------------------------------------------- toguna : toit de mil et poteaux fourchus (redessin 2026-10-10)

def toguna_roof(card, x0, x1, y_top, y_bot, layers=8, color=YELLOW, edge=ORANGE, seed=5, straw=("#3A2414", "#160C08")):
    """Le toit de la toguna : huit couches de tiges de mil croisées, épaisses comme le passage qu'elles abritent ;
    chaque couche montre au front la tranche de ses tiges (en chevrons alternés) et le bas s'effiloche en frange."""
    rnd = random.Random(seed)
    out = []
    th = (y_bot - y_top) / layers
    hatch, seams = [], []
    g = card.grad(nid("tgs"), [(0, straw[0]), (1, straw[1])])
    # la silhouette : un dos bombé, des flancs irréguliers
    top_pts = []
    n = 28
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        u = (x - (x0 + x1) / 2) / ((x1 - x0) / 2)
        y = y_top + 18 * u * u + rnd.uniform(-2.5, 2.5)
        top_pts.append((x, y))
    sil = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in top_pts) + f" L{f(x1 + 6)} {f(y_bot)} L{f(x0 - 6)} {f(y_bot)}Z"
    out.append(f'<path d="{sil}" fill="{g}"/>')
    for k in range(layers):
        ya = y_top + k * th
        yb = ya + th
        # couture entre couches : ligne ondulée
        pts = []
        x = x0 - 6
        while x <= x1 + 6:
            u = (x - (x0 + x1) / 2) / ((x1 - x0) / 2)
            pts.append(f"{f(x)} {f(yb + 4 * u * u * (1 - k / layers) + rnd.uniform(-1.2, 1.2))}")
            x += 9
        seams.append('<path d="M' + " L".join(pts) + '"/>')
        slant = 4 if k % 2 == 0 else -4
        x = x0 + rnd.uniform(0, 4)
        while x < x1:
            u = (x - (x0 + x1) / 2) / ((x1 - x0) / 2)
            y0_ = ya + 10 * u * u * (1 - k / layers) * (1 if k == 0 else 0.6) + 2
            hatch.append(f'<line x1="{f(x)}" y1="{f(yb - 1)}" x2="{f(x + slant)}" y2="{f(max(y0_, yb - th + 2))}"/>')
            x += rnd.uniform(3.2, 5.5)
    fringe = []
    x = x0
    while x < x1:
        L = rnd.uniform(4, 14)
        fringe.append(f'<line x1="{f(x)}" y1="{f(y_bot)}" x2="{f(x + rnd.uniform(-2, 2))}" y2="{f(y_bot + L)}"/>')
        x += rnd.uniform(2, 3.6)
    out.append(fine("".join(hatch), light(color, 0.15), 0.7, 0.55))
    out.append(tube(card, "".join(seams), edge, 0.9, 4, op=0.8))
    out.append(fine("".join(fringe), color, 0.8, 0.8))
    out.append(tube(card, '<path d="M' + " L".join(f"{f(x)} {f(y)}" for x, y in top_pts) + '"/>', color, 2.0, 7))
    return "".join(out)


def dogon_post(card, x, y_top, y_bot, w, color=ORANGE, carve="#FFB86B", seed=1, fork=26):
    """Un poteau de toguna : tronc de bois taillé, fourche en Y qui reçoit le toit, bandes sculptées
    (chevrons, losanges, damier, zigzag) — la parole y est écrite en géométrie."""
    rnd = random.Random(seed)
    sway = rnd.uniform(-2, 2)
    d = (f"M{f(x - w / 2)} {f(y_bot)} C{f(x - w * 0.62)} {f(y_bot - (y_bot - y_top) * 0.4)} {f(x - w * 0.42 + sway)} {f(y_top + fork + 30)} {f(x - w * 0.5 + sway)} {f(y_top + fork)} "
         f"L{f(x - w * 0.95 + sway)} {f(y_top)} L{f(x - w * 0.55 + sway)} {f(y_top)} L{f(x + sway)} {f(y_top + fork * 0.62)} "
         f"L{f(x + w * 0.55 + sway)} {f(y_top)} L{f(x + w * 0.95 + sway)} {f(y_top)} L{f(x + w * 0.5 + sway)} {f(y_top + fork)} "
         f"C{f(x + w * 0.42 + sway)} {f(y_top + fork + 30)} {f(x + w * 0.62)} {f(y_bot - (y_bot - y_top) * 0.4)} {f(x + w / 2)} {f(y_bot)}Z")
    g = card.grad(nid("dpo"), [(0, "#3A1E1A"), (0.5, "#24120F"), (1, "#0E0607")], 0, 0, 1, 0)
    out = [f'<path d="{d}" fill="{g}"/>']
    carv = []
    y = y_top + fork + 14
    band = 0
    hw = w * 0.34
    while y < y_bot - 18:
        kind = (band + seed) % 4
        bh = 34
        if kind == 0:
            for j in range(4):
                yy = y + j * 8
                carv.append(f'<path d="M{f(x - hw)} {f(yy)} L{f(x)} {f(yy + 6)} L{f(x + hw)} {f(yy)}"/>')
        elif kind == 1:
            carv.append(f'<path d="M{f(x)} {f(y)} L{f(x + hw)} {f(y + bh / 2 - 2)} L{f(x)} {f(y + bh - 4)} L{f(x - hw)} {f(y + bh / 2 - 2)}Z"/>'
                        f'<path d="M{f(x)} {f(y + 8)} L{f(x + hw * 0.5)} {f(y + bh / 2 - 2)} L{f(x)} {f(y + bh - 12)} L{f(x - hw * 0.5)} {f(y + bh / 2 - 2)}Z"/>')
        elif kind == 2:
            s = hw / 2
            for i in range(4):
                for j in range(4):
                    if (i + j) % 2 == 0:
                        carv.append(f'<rect x="{f(x - hw + i * s)}" y="{f(y + j * s * 1.05)}" width="{f(s)}" height="{f(s)}"/>')
        else:
            pts = " L".join(f"{f(x + (hw if j % 2 else -hw))} {f(y + j * 5.5)}" for j in range(6))
            carv.append(f'<path d="M{pts}"/>')
        carv.append(f'<line x1="{f(x - hw - 2)}" y1="{f(y + bh)}" x2="{f(x + hw + 2)}" y2="{f(y + bh)}"/>')
        y += bh + 8
        band += 1
    out.append(fine("".join(carv), carve, 0.9, 0.85))
    out.append(tube(card, f'<path d="{d}"/>', color, 1.4, 5))
    return "".join(out)


def bandiagara(card, seed, y_top, y_bot, color=ORANGE, face=("#3A1838", "#160A20"), dwell=("#FFB86B", "#FFD9A0")):
    """La falaise de Bandiagara : un front de grès strié, et dans sa paroi les petites maisons des Tellem, perchées."""
    rnd = random.Random(seed)
    pts = [(-10, y_top + 20)]
    x = -10
    y = y_top + 20
    while x < 550:
        x += rnd.uniform(10, 24)
        y = min(y_top + 34, max(y_top, y + rnd.uniform(-9, 9)))
        pts.append((x, y))
    edge = "M" + " L".join(f"{f(a)} {f(b)}" for a, b in pts)
    g = card.grad(nid("bdg"), [(0, face[0]), (1, face[1])])
    out = [f'<path d="{edge} L550 {f(y_bot)} L-10 {f(y_bot)}Z" fill="{g}"/>']
    stri = []
    for a, b in pts[1:-1:2]:
        L = rnd.uniform(30, (y_bot - b) * 0.9)
        stri.append(f'<path d="M{f(a)} {f(b + 3)} q{f(rnd.uniform(-4, 4))} {f(L / 2)} {f(rnd.uniform(-3, 3))} {f(L)}"/>')
    out.append(fine("".join(stri), color, 0.7, 0.35))
    for yy in (y_top + 52, y_top + 86):
        out.append(fine(f'<path d="M-10 {f(yy)} Q140 {f(yy - 6)} 270 {f(yy + 3)} T550 {f(yy - 2)}"/>', color, 0.6, 0.25))
    houses = []
    for _ in range(26):
        hx = rnd.choice((rnd.uniform(6, 186), rnd.uniform(354, 534)))
        hy = rnd.uniform(y_top + 44, y_bot - 26)
        hw, hh = rnd.uniform(5, 9), rnd.uniform(5, 8)
        houses.append(f'<rect x="{f(hx)}" y="{f(hy)}" width="{f(hw)}" height="{f(hh)}" fill="{rnd.choice(dwell)}" opacity="{f(rnd.uniform(0.55, 1))}"/>'
                      f'<rect x="{f(hx - 1)}" y="{f(hy - 2)}" width="{f(hw + 2)}" height="2" fill="#0A0410" opacity="0.8"/>')
    hs = "".join(houses)
    out.append(f'<g filter="{ublur(card, 2.5)}" opacity="0.8">{hs}</g>{hs}')
    out.append(tube(card, f'<path d="{edge}"/>', color, 1.6, 6))
    return "".join(out)
