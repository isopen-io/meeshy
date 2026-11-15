"""Légende : les royaumes s'incrustent dans les deux infinis — l'immense (galaxies, nébuleuses, trous noirs) et l'infime
(cristaux, atomes, ADN, cellules, neurones) ; de V à I, le cadre s'ouvre de plus en plus loin dans les deux sens."""

from kit import *  # noqa: F401,F403
from archi import *  # noqa: F401,F403
from infini import *  # noqa: F401,F403

METAL = "rosegold"
GEM = "#7FE0FF"
PHOTO = dict(top="#33243A", bottom="#0E0A14", rim="#FFD2A8")


def cosmic_inset(card, x, y, w, h, kind, seed):
    """Un médaillon d'espace profond serti dans le bronze (galaxie, nébuleuse, supernova, amas)."""
    uid = nid("ci")
    card.def_once(uid, f'<clipPath id="{card.id(uid)}"><rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="3"/></clipPath>')
    rnd = random.Random(seed)
    bg = card.grad("ci-bg", [(0, "#0E0A28"), (1, "#05040C")])
    inner = [f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="{bg}"/>']
    inner.append("".join(f'<circle cx="{f(rnd.uniform(x, x + w))}" cy="{f(rnd.uniform(y, y + h))}" r="{f(rnd.uniform(0.3, 1.1))}" fill="#FFFFFF" opacity="{f(rnd.uniform(0.3, 1))}"/>' for _ in range(40)))
    cx, cy = x + w / 2, y + h / 2
    if kind == "galaxy":
        inner.append(galaxy_glow(card, f"ci-g{seed}", cx, cy, w * 0.46, "#FFD9A0", 0.5, seed * 0.7, seed, 260, angle=-30 + seed * 9))
    elif kind == "nebula":
        inner.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(w * 0.6)}" ry="{f(h * 0.4)}" fill="{card.rgrad("ci-neb", [(0, "#FF8FB0", 0.9), (0.5, "#8A4BFF", 0.45), (1, "#2A1060", 0)])}"/>')
        inner.append(f'<ellipse cx="{f(cx + 6)}" cy="{f(cy - 10)}" rx="{f(w * 0.3)}" ry="{f(h * 0.2)}" fill="{card.rgrad("ci-neb2", [(0, "#FFE2A0", 0.8), (1, "#FF8FB0", 0)])}"/>')
    elif kind == "supernova":
        inner.append(supernova(card, cx, cy, w * 0.42, "#FFFFFF", "#9FD8FF", "#4A6BFF", seed))
    elif kind == "blackhole":
        inner.append(black_hole(card, cx, cy, w * 0.44, 0.26, 0.3))
    else:
        inner.append("".join(f'<circle cx="{f(cx + rnd.gauss(0, w * 0.18))}" cy="{f(cy + rnd.gauss(0, h * 0.14))}" r="{f(rnd.uniform(0.6, 2.2))}" fill="{rnd.choice(("#FFFFFF", "#CFE0FF", "#FFE2A0"))}"/>' for _ in range(60)))
        inner.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(w * 0.3)}" fill="{card.rgrad("ci-cl", [(0, "#CFE0FF", 0.5), (1, "#CFE0FF", 0)])}"/>')
    return f'<g clip-path="url(#{card.id(uid)})">{"".join(inner)}</g>'


def bronze_frame(card, x, y, w, h, tones=("#E2AE72", "#9A602E", "#5E3518"), line="#3B220E"):
    """Un cadre de bronze à bord perlé et rosettes d'angle (la monture des plaques d'Edo), sans fond."""
    hi, mid, lo = tones
    g = card.grad("bf-g", [(0, hi), (0.5, mid), (1, lo)], 0, 0, 0.4, 1)
    uid = nid("bf")
    out = [f'<path d="M{f(x)} {f(y)} h{f(w)} v{f(h)} h{f(-w)}Z M{f(x + 9)} {f(y + 9)} v{f(h - 18)} h{f(w - 18)} v{f(-(h - 18))}Z" fill="{g}" fill-rule="evenodd" stroke="{lo}" stroke-width="1.2"/>']
    for i in range(int(w // 7)):
        out.append(f'<circle cx="{f(x + 4 + i * 7)}" cy="{f(y + 4.5)}" r="1.4" fill="{hi}"/><circle cx="{f(x + 4 + i * 7)}" cy="{f(y + h - 4.5)}" r="1.4" fill="{hi}"/>')
    for i in range(int(h // 7)):
        out.append(f'<circle cx="{f(x + 4.5)}" cy="{f(y + 4 + i * 7)}" r="1.4" fill="{hi}"/><circle cx="{f(x + w - 4.5)}" cy="{f(y + 4 + i * 7)}" r="1.4" fill="{hi}"/>')
    for px, py in ((x + 4.5, y + 4.5), (x + w - 4.5, y + 4.5), (x + 4.5, y + h - 4.5), (x + w - 4.5, y + h - 4.5)):
        out.append(rosette(px, py, 0.3, hi, line, mid))
    del uid
    return "".join(out)


def nebula_parasol(card, x, y, s, palette, finial="star", shaft=200, tilt=0.0, seed=1):
    """Un parasol royal akan dont le dôme est une nébuleuse ; franges d'or et d'étoiles, pommeau d'astre."""
    c1, c2, c3 = palette
    uid = nid("np")
    dome = "M-86 0 C-86 -52 -50 -84 0 -84 C50 -84 86 -52 86 0Z"
    card.def_once(uid, f'<clipPath id="{card.id(uid)}"><path d="{dome}"/></clipPath>')
    neb = card.rgrad(f"{uid}-n", [(0, c1, 1), (0.45, c2, 1), (1, c3, 1)], 0.42, 0.7, 0.75)
    rnd = random.Random(seed)
    st = "".join(f'<circle cx="{f(rnd.uniform(-86, 86))}" cy="{f(rnd.uniform(-84, 0))}" r="{f(rnd.uniform(0.4, 1.5))}" fill="#FFFFFF" opacity="{f(rnd.uniform(0.4, 1))}"/>' for _ in range(70))
    seams = "".join(f'<path d="M0 -84 Q{f((-90 + 180 * i / 8) * 0.55)} -50 {f(-90 + 180 * i / 8)} 0" fill="none" stroke="#FFE08A" stroke-width="1.1" opacity="0.8"/>' for i in range(1, 8))
    fringe = []
    for i in range(10):
        xa = -86 + 172 * i / 10
        xb = -86 + 172 * (i + 1) / 10
        fringe.append(f'<path d="M{f(xa)} -2 L{f(xb)} -2 L{f(xb)} 6 Q{f((xa + xb) / 2)} 22 {f(xa)} 6Z" fill="{c3}" stroke="#FFE08A" stroke-width="1"/>')
        fringe.append(f'<line x1="{f((xa + xb) / 2)}" y1="18" x2="{f((xa + xb) / 2)}" y2="32" stroke="#FFE08A" stroke-width="1"/>')
        fringe.append(sparkle((xa + xb) / 2, 36, 5, "#FFF4C2", 0.95))
    shaftg = lgrad(card, "np-shaft", [(0, "#FFF4C2", 0.95), (1, "#FFE08A", 0)])
    gold = card.grad("np-gold", [(0, "#FFF4C2"), (0.5, "#E8B53C"), (1, "#8A5A12")], 0, 0, 1, 1)
    fin = f'<circle cx="0" cy="-112" r="10" fill="#FFFFFF" filter="{soft(card, 4)}"/>' + spikes(0, -112, 26, "#FFFFFF") if finial == "star" else grp(sankofa_bird(card), 0, -104, 0.62)
    m = (
        f'<rect x="-2.5" y="18" width="5" height="{shaft}" fill="{shaftg}"/>'
        f'<g clip-path="url(#{card.id(uid)})"><path d="{dome}" fill="{neb}"/>{st}{seams}'
        f'<path d="{dome}" fill="{card.rgrad("np-sh", [(0, "#FFFFFF", 0.25), (0.6, "#FFFFFF", 0), (1, "#000000", 0.45)], 0.35, 0.25, 0.85)}"/></g>'
        f'<path d="{dome}" fill="none" stroke="#FFE08A" stroke-width="1.6"/>'
        f'{"".join(fringe)}'
        f'<rect x="-9" y="-96" width="18" height="12" rx="2" fill="{gold}" stroke="#7A4A0E" stroke-width="1"/>{fin}'
    )
    return grp(m, x, y, s, tilt)


def cowrie_galaxy(card, x, y, r, angle, seed):
    """Une galaxie vue par la tranche, dont la bande de poussière dessine la fente d'un cauri."""
    uid = nid("cg")
    body = card.rgrad(f"{uid}-b", [(0, "#FFF8E8", 1), (0.35, "#FFE2B0", 0.8), (0.7, "#B48AFF", 0.3), (1, "#6A4BFF", 0)])
    rnd = random.Random(seed)
    dots = "".join(f'<circle cx="{f(rnd.gauss(0, r * 0.35))}" cy="{f(rnd.gauss(0, r * 0.12))}" r="{f(rnd.uniform(0.3, 1))}" fill="#FFFFFF" opacity="{f(rnd.uniform(0.3, 0.9))}"/>' for _ in range(40))
    lane = "".join(f'<line x1="{f(i * r * 0.08)}" y1="-1.4" x2="{f(i * r * 0.08)}" y2="1.4" stroke="#FFE2B0" stroke-width="0.8" opacity="0.7"/>' for i in range(-8, 9))
    m = (f'<ellipse rx="{f(r)}" ry="{f(r * 0.42)}" fill="{body}"/>{dots}'
         f'<path d="M{f(-r * 0.8)} 0 C{f(-r * 0.3)} {f(-r * 0.07)} {f(r * 0.3)} {f(-r * 0.07)} {f(r * 0.8)} 0 C{f(r * 0.3)} {f(r * 0.07)} {f(-r * 0.3)} {f(r * 0.07)} {f(-r * 0.8)} 0Z" fill="#1A0E10" opacity="0.85"/>{lane}'
         f'<ellipse rx="{f(r * 0.1)}" ry="{f(r * 0.08)}" fill="#FFFFFF" opacity="0.9"/>')
    return grp(m, x, y, 1, angle)


LEOPARD = {
    "tail": [(22, 176), (30, 132), (56, 104), (92, 94)],
    "back": [(92, 94), (148, 62), (214, 42), (288, 38), (356, 48), (414, 74)],
    "belly": [(110, 118), (190, 96), (280, 86), (360, 92), (408, 108)],
    "hind1": [(110, 100), (96, 150), (80, 196)],
    "hind2": [(134, 108), (138, 160), (124, 206)],
    "front1": [(414, 74), (448, 126), (470, 182)],
    "front2": [(404, 100), (424, 150), (434, 200)],
    "head": [(414, 74), (446, 70), (476, 78), (500, 96), (482, 108), (446, 100), (414, 74)],
    "ear": [(446, 70), (452, 52), (466, 66)],
}


def leopard_constellation(card, color="#FFE2A0"):
    """Un léopard qui bondit par-dessus le blason, dessiné en étoiles ; ses taches sont des rosettes d'astres."""
    sil = ("M22 176 C26 140 50 108 92 94 C140 60 214 38 288 36 C356 42 400 60 416 72 C440 64 470 70 500 96 C492 108 468 110 448 102 "
           "C430 110 424 140 470 182 L460 190 C432 160 414 130 404 108 C380 96 300 84 210 96 C170 102 140 112 136 120 "
           "C142 150 130 190 124 206 L114 204 C116 180 112 150 108 124 C100 150 92 180 80 196 L72 192 C82 160 90 130 100 106 C70 110 40 140 34 176Z")
    glow = card.rgrad("leo-neb", [(0, color, 0.5), (0.6, "#FF9A5A", 0.22), (1, "#FF9A5A", 0)], 0.6, 0.4, 0.7)
    out = [f'<path d="{sil}" fill="{glow}" filter="{soft(card, 5)}"/>']
    edges = []
    pts = []
    for chain in LEOPARD.values():
        for a, b in zip(chain, chain[1:]):
            edges.append(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="{color}" stroke-width="1.1" opacity="0.7"/>')
        pts.extend(chain)
    out.append("".join(edges))
    seen = set()
    for x, y in pts:
        if (x, y) in seen:
            continue
        seen.add((x, y))
        out.append(f'<circle cx="{x}" cy="{y}" r="6" fill="{color}" opacity="0.22"/><circle cx="{x}" cy="{y}" r="2.2" fill="#FFFFFF"/>')
    for x, y in ((170, 74), (238, 60), (300, 56), (350, 66), (200, 82), (262, 70), (330, 78), (386, 82), (150, 92), (460, 86)):
        out.append(f'<circle cx="{x}" cy="{y}" r="4.6" fill="none" stroke="{color}" stroke-width="1.2" opacity="0.85"/><circle cx="{x}" cy="{y}" r="1.2" fill="#FFFFFF"/>')
    out.append(spikes(482, 88, 9, "#FFFFFF"))
    return "".join(out)


def star_chevrons(x, y0, y1, amp, step, color, seed, phase=0):
    """Une frise à chevrons du Grand Zimbabwe redessinée en étoiles : chaque sommet est un astre."""
    rnd = random.Random(seed)
    pts = []
    yy = y0
    k = phase
    while yy <= y1:
        pts.append((x + (amp if k % 2 == 0 else -amp), yy))
        yy += step
        k += 1
    lines = "".join(f'<line x1="{f(a[0])}" y1="{f(a[1])}" x2="{f(b[0])}" y2="{f(b[1])}" stroke="{color}" stroke-width="1.4" opacity="0.75"/>' for a, b in zip(pts, pts[1:]))
    dots = "".join(f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(rnd.uniform(4, 7))}" fill="{color}" opacity="0.22"/><circle cx="{f(px)}" cy="{f(py)}" r="{f(rnd.uniform(1.6, 2.6))}" fill="#FFFFFF"/>' for px, py in pts)
    return lines + dots


def sunburst_rays(card, cx, cy):
    fill = card.rgrad("l1-sb", [(0, "#FFF4C2", 0.7), (0.5, "#FFE2A0", 0.25), (1, "#FFE2A0", 0)], 0.5, 0.5, 0.5)
    out = []
    for i in range(36):
        a = 90 + 180 * i / 35
        L = 460 if i % 2 == 0 else 320
        x0, y0 = pt(cx, cy, 30, a - 1.6)
        x1, y1 = pt(cx, cy, L, a)
        x2, y2 = pt(cx, cy, 30, a + 1.6)
        out.append(f"M{f(x0)} {f(y0)} L{f(x1)} {f(y1)} L{f(x2)} {f(y2)}Z")
    return f'<path d="{" ".join(out)}" fill="{fill}"/>'


