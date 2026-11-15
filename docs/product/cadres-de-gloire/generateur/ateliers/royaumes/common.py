"""Outils communs aux cadres de l'atelier « Royaumes de bronze » (au-dessus de lib/base.py)."""

import json
import math
import random
import sys
from pathlib import Path

ATL = Path(__file__).resolve().parent
ROOT = ATL.parents[1]
sys.path.insert(0, str(ROOT / "lib"))
sys.path.insert(0, str(ATL))

from base import *  # noqa: E402,F401,F403
import base  # noqa: E402
from motifs import *  # noqa: E402,F401,F403

SLUG = "royaumes"
OUT = ROOT / "out" / SLUG

GOLD = "#E8B53C"
GOLD_HI = "#FFF4C2"
GOLD_LO = "#8A5A12"
IVORY = "#F6EBD3"
CORAL = "#E2583E"
OBS = "#0D0A0E"
COPPER = "#D9774A"
VELVET = "#5A0F12"

MANIFEST = []


def start(uid, top="#3A2A1E", bottom="#120C08", rim="#FFC27A", glow=0.22):
    c = Card(uid)
    photo(c, top, bottom, rim, 2, glow)
    return c


def wrap_since(card, n, filt):
    seg = "".join(card.body[n:])
    del card.body[n:]
    card.add(f'<g filter="{filt}">{seg}</g>')


from base import plate_layer  # noqa: E402  la couche « plate » et ses emplacements de texte


@plate_layer
def inscription(card, kicker, title, message=None, y=748, style="nu", shadow=True, **kw):
    """La plaque de base, avec une ombre portée sur le texte pour qu'il tienne sur n'importe quel fond."""
    n = len(card.body)
    plaque(card, kicker, title, message=message, y=y, style=style, **kw)
    if shadow:
        wrap_since(card, n, card.shadow("txt", 0, 1.5, 2.2, "#000000", 0.9))


def window(card, name, x0=44, y0=236, x1=496, y1=736, r=24, arch=None):
    """Masque qui garde la photo visible dans une fenêtre (rectangle ou arc en plein cintre/brisé)."""
    if arch == "round":
        rx = (x1 - x0) / 2
        hole = (f'<path d="M{x0} {y1 - r} L{x0} {y0 + rx} A{rx} {rx} 0 0 1 {x1} {y0 + rx} L{x1} {y1 - r} '
                f'Q{x1} {y1} {x1 - r} {y1} L{x0 + r} {y1} Q{x0} {y1} {x0} {y1 - r}Z" fill="#000000"/>')
    elif arch == "pointed":
        cx = (x0 + x1) / 2
        sh = (x1 - x0) * 0.62
        hole = (f'<path d="M{x0} {y1 - r} L{x0} {y0 + sh * 0.7} Q{x0} {y0 + sh * 0.12} {cx} {y0} Q{x1} {y0 + sh * 0.12} {x1} {y0 + sh * 0.7} '
                f'L{x1} {y1 - r} Q{x1} {y1} {x1 - r} {y1} L{x0 + r} {y1} Q{x0} {y1} {x0} {y1 - r}Z" fill="#000000"/>')
    else:
        hole = f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" rx="{r}" fill="#000000"/>'
    card.def_once(name, f'<mask id="{card.id(name)}"><rect width="{W}" height="{H}" fill="#FFFFFF"/>{hole}</mask>')
    return f"url(#{card.id(name)})"


def window_path(x0=44, y0=236, x1=496, y1=736, r=24, arch=None):
    if arch == "round":
        rx = (x1 - x0) / 2
        return (f"M{x0} {y1 - r} L{x0} {y0 + rx} A{rx} {rx} 0 0 1 {x1} {y0 + rx} L{x1} {y1 - r} "
                f"Q{x1} {y1} {x1 - r} {y1} L{x0 + r} {y1} Q{x0} {y1} {x0} {y1 - r}Z")
    if arch == "pointed":
        cx = (x0 + x1) / 2
        sh = (x1 - x0) * 0.62
        return (f"M{x0} {y1 - r} L{x0} {y0 + sh * 0.7} Q{x0} {y0 + sh * 0.12} {cx} {y0} Q{x1} {y0 + sh * 0.12} {x1} {y0 + sh * 0.7} "
                f"L{x1} {y1 - r} Q{x1} {y1} {x1 - r} {y1} L{x0 + r} {y1} Q{x0} {y1} {x0} {y1 - r}Z")
    return f"M{x0 + r} {y0} L{x1 - r} {y0} Q{x1} {y0} {x1} {y0 + r} L{x1} {y1 - r} Q{x1} {y1} {x1 - r} {y1} L{x0 + r} {y1} Q{x0} {y1} {x0} {y1 - r} L{x0} {y0 + r} Q{x0} {y0} {x0 + r} {y0}Z"


def inner_shadow(card, path, w=18, op=0.7):
    """Une ombre intérieure autour de la fenêtre : la photo semble enchâssée sous le cadre."""
    uid = nid("is")
    card.def_once(uid, f'<clipPath id="{card.id(uid)}"><path d="{path}"/></clipPath>')
    card.add(f'<g clip-path="url(#{card.id(uid)})"><path d="{path}" fill="none" stroke="#000000" stroke-width="{w}" opacity="{op}" filter="{card.blur("is-blur", w * 0.45)}"/></g>')


def gold_line(card, path, w=3, key="gold", inner=True):
    hi, mid, lo = METALS[key]
    g = card.grad(f"gl-{key}", [(0, hi), (0.3, mid), (0.5, lo), (0.7, mid), (1, hi)], 0, 0, 1, 1)
    card.add(f'<path d="{path}" fill="none" stroke="{lo}" stroke-width="{w + 2}" opacity="0.8"/>')
    card.add(f'<path d="{path}" fill="none" stroke="{g}" stroke-width="{w}"/>')
    if inner:
        card.add(f'<path d="{path}" fill="none" stroke="{hi}" stroke-width="0.8" opacity="0.7"/>')


def beads_on_path(points, color, r=1.6, op=1):
    return "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{r}" fill="{color}" opacity="{op}"/>' for x, y in points)


def rrect_points(x0, y0, x1, y1, r, step):
    """Points régulièrement espacés le long d'un rectangle arrondi, avec l'angle de la tangente."""
    segs = []
    n_arc = 10

    def arc(cx, cy, a0):
        return [(cx + r * math.cos(math.radians(a0 + 90 * k / n_arc)), cy + r * math.sin(math.radians(a0 + 90 * k / n_arc))) for k in range(n_arc + 1)]

    poly = [(x0 + r, y0), (x1 - r, y0)] + arc(x1 - r, y0 + r, -90) + [(x1, y1 - r)] + arc(x1 - r, y1 - r, 0) + [(x0 + r, y1)] + arc(x0 + r, y1 - r, 90) + [(x0, y0 + r)] + arc(x0 + r, y0 + r, 180)
    poly.append(poly[0])
    for (ax, ay), (bx, by) in zip(poly, poly[1:]):
        segs.append((ax, ay, bx, by, math.hypot(bx - ax, by - ay)))
    total = sum(s[4] for s in segs)
    out = []
    d = 0.0
    while d < total - 1:
        acc = 0.0
        for ax, ay, bx, by, L in segs:
            if acc + L >= d and L > 0:
                t = (d - acc) / L
                out.append((ax + (bx - ax) * t, ay + (by - ay) * t, math.degrees(math.atan2(by - ay, bx - ax))))
                break
            acc += L
        d += step
    return out


def lgrad(card, name, stops, x1=0, y1=0, x2=0, y2=1):
    """Dégradé linéaire avec opacité par arrêt : [(offset, couleur, opacité)]."""
    st = "".join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops)
    return card.def_once(name, f'<linearGradient id="{card.id(name)}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{st}</linearGradient>')


def halo(card, name, cx, cy, rx, ry, color, op):
    card.add(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{card.rgrad(name, [(0, color, op), (1, color, 0)])}"/>')


def seal(card, x, y, text1, text2, metal="prism"):
    """Un sceau numéroté (la série limitée du Mythe)."""
    fill = card.prism("seal-prism", 0, 0, 1, 1) if metal == "prism" else card.metal(metal)[0]
    card.add(
        f'<g filter="{card.shadow("seal-sh", 0, 3, 4, "#000000", 0.6)}">'
        f'<circle cx="{x}" cy="{y}" r="34" fill="{fill}"/>'
        f'<circle cx="{x}" cy="{y}" r="28" fill="#0B0814" opacity="0.88"/>'
        f'<circle cx="{x}" cy="{y}" r="25" fill="none" stroke="{fill}" stroke-width="0.8" stroke-dasharray="1.5 2.5"/>'
        f'<text x="{x}" y="{y - 4}" text-anchor="middle" font-family="{CINZEL}" font-weight="700" font-size="13" fill="#FFFFFF">{esc(text1)}</text>'
        f'<text x="{x}" y="{y + 12}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="9" letter-spacing="1.5" fill="#E9DDFF">{esc(text2)}</text></g>'
    )


def register(file, rank, division, option, name, story, layout, message):
    MANIFEST.append({"file": file, "rank": rank, "division": division, "option": option, "name": name,
                     "story": story, "layout": layout, "message": message})


def write_manifest():
    path = OUT / "manifest.json"
    existing = []
    if path.exists():
        existing = [m for m in json.loads(path.read_text()) if m["file"] not in {x["file"] for x in MANIFEST}]
    order = ["ambassadeur-5", "ambassadeur-4", "ambassadeur-3", "ambassadeur-2", "ambassadeur-1", "orateur-a", "orateur-b", "orateur-c",
             "oracle-a", "oracle-b", "oracle-c", "legende-5", "legende-4", "legende-3", "legende-2", "legende-1", "mythe-a", "mythe-b", "mythe-c"]
    allm = existing + MANIFEST

    def key(m):
        stem = m["file"].replace(SLUG + "-", "").replace(".jpg", "")
        return order.index(stem) if stem in order else 99

    path.write_text(json.dumps(sorted(allm, key=key), ensure_ascii=False, indent=2))


def cosmos(card, name, mask, top="#0B0824", mid="#08061A", bottom="#030208", seed=1, n=420, nebulae=(), bright=8):
    """Fond d'espace profond masqué par la fenêtre : dégradé, nébuleuses, champ d'étoiles colorées, quelques astres à aigrettes."""
    g = card.grad(name, [(0, top), (0.5, mid), (1, bottom)])
    card.add(f'<rect width="540" height="960" fill="{g}" mask="{mask}"/>')
    card.add(f'<g mask="{mask}">')
    for i, (cx, cy, rx, ry, c1, c2, op) in enumerate(nebulae):
        nebula(card, f"{name}-n{i}", cx, cy, rx, ry, c1, c2, op)
    rnd = random.Random(seed)
    pts = []
    for _ in range(n):
        x, y = rnd.uniform(0, 540), rnd.uniform(0, 960)
        col = rnd.choice(("#FFFFFF", "#FFFFFF", "#FFF1D0", "#CFE0FF", "#FFD6E8"))
        pts.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(0.3, 1.5))}" fill="{col}" opacity="{f(rnd.uniform(0.3, 1))}"/>')
    card.add("".join(pts))
    for _ in range(bright):
        x, y = rnd.uniform(10, 530), rnd.uniform(10, 950)
        card.add(spikes(x, y, rnd.uniform(6, 12), "#FFFFFF", op=0.85))
    card.add("</g>")


def galaxy_glow(card, name, cx, cy, r, color, tilt=0.42, rot=0.0, seed=11, n=520, core="#FFFFFF", glow_op=0.55, angle=0):
    """Une galaxie spirale avec son halo diffus (le dessin de base.galaxy, enveloppé d'une lueur)."""
    g = card.rgrad(name, [(0, core, glow_op), (0.25, color, glow_op * 0.6), (1, color, 0)])
    inner = (f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 1.15)}" ry="{f(r * 1.15 * tilt)}" fill="{g}"/>'
             + galaxy(cx, cy, r, color, 3, tilt, rot, seed, n, core))
    return f'<g transform="rotate({angle} {f(cx)} {f(cy)})">{inner}</g>'


def cloud_filter(card, name, freq=0.011, octaves=4, seed=3, disp=70, sharp=2.2, bias=-0.55):
    """Filtre de nébuleuse : la forme est déchirée par un bruit fractal et son opacité modulée en volutes."""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="{octaves}" seed="{seed}" result="t"/>'
        f'<feDisplacementMap in="SourceGraphic" in2="t" scale="{disp}" xChannelSelector="R" yChannelSelector="G" result="d"/>'
        f'<feColorMatrix in="t" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  {sharp} 0 0 0 {bias}" result="ta"/>'
        f'<feComposite in="d" in2="ta" operator="in"/></filter>',
    )
    return f"url(#{card.id(name)})"


def cloud(card, name, cx, cy, rx, ry, c1, c2, op=0.9, seed=3, freq=0.011, disp=70, rot=0):
    """Une nébuleuse à volutes (dégradé déchiré par le filtre de nuage)."""
    g = card.rgrad(name + "-g", [(0, c1, op), (0.45, c2, op * 0.75), (1, c2, 0)])
    filt = cloud_filter(card, name + "-f", freq, 4, seed, disp)
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{g}" filter="{filt}" transform="rotate({rot} {f(cx)} {f(cy)})"/>'


def star_field(seed, n, x0=0, y0=0, x1=540, y1=960, glow_every=9):
    """Champ d'étoiles dense, quelques-unes auréolées."""
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        col = rnd.choice(("#FFFFFF", "#FFFFFF", "#FFF1D0", "#CFE0FF", "#FFD6E8", "#BFF5FF"))
        r = rnd.uniform(0.3, 1.4) if i % glow_every else rnd.uniform(1.4, 2.4)
        if i % glow_every == 0:
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 3.4)}" fill="{col}" opacity="0.18"/>')
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{col}" opacity="{f(rnd.uniform(0.35, 1))}"/>')
    return "".join(out)
