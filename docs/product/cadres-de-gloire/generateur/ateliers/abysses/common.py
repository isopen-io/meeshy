"""Abysses - l'ossature commune des cadres : chemins, enregistrement au manifeste, couches standard
(photo, décor masqué, fenêtre, blason, oiseaux, inscription)."""

import json
import math
import random
import sys
from pathlib import Path

ATL = Path(__file__).resolve().parent
sys.path.insert(0, str(ATL.parent.parent / "lib"))
sys.path.insert(0, str(ATL))

import base  # noqa: E402
from base import W, H, f, pt, Card, photo, crest, bird, mee_meo, MEE_LAYOUTS, sparkle  # noqa: E402,F401
from kit import (rrect, arch, ogive, oval, hole_mask, clip, bevel, glow, blur, inner_shadow, rim, grade, outer_frame,  # noqa: E402,F401
                 inscription, halo, gem_plate, water, radial, shafts, caustic_filter, surface, snow, bubble, bubble_column,
                 bokeh, pearl, pearl_string, metal_grad, nacre_grad, catmull, poly, smooth, lerp, GOLD, REDGOLD, SILVER, OBSIDIAN)

base.METALS["platinum"] = ("#FFFFFF", "#C9D3E0", "#66748A")
PLATINUM = base.METALS["platinum"]
OBS = ("#B9C2DA", "#3C4260", "#0A0C18")

OUT = ATL.parent.parent / "out" / "abysses"
SLUG = "abysses"
ORDER = ["ambassadeur-5", "ambassadeur-4", "ambassadeur-3", "ambassadeur-2", "ambassadeur-1", "orateur-a", "orateur-b", "orateur-c",
         "oracle-a", "oracle-b", "oracle-c", "legende-5", "legende-4", "legende-3", "legende-2", "legende-1", "mythe-a", "mythe-b", "mythe-c"]
_ENTRIES = {}

WIN = (84, 250, 456, 724)


def register(short, rank, division, option, name, story, layout, message):
    _ENTRIES[short] = {
        "file": f"{SLUG}-{short}.jpg", "rank": rank, "division": division, "option": option, "name": name,
        "story": story, "layout": layout, "message": message,
    }


def write_manifest():
    path = OUT / "manifest.json"
    old = {}
    if path.exists():
        for e in json.loads(path.read_text()):
            old[e["file"].replace(f"{SLUG}-", "").replace(".jpg", "")] = e
    old.update(_ENTRIES)
    entries = [old[k] for k in ORDER if k in old]
    path.write_text(json.dumps(entries, ensure_ascii=False, indent=2))


def save(card, short):
    card.save(OUT / f"{SLUG}-{short}.svg")


# ---------------------------------------------------------------- couches

def start(uid, tones=("#3A2C24", "#110C0A", "#FFC98E")):
    c = Card(uid)
    photo(c, tones[0], tones[1], tones[2])
    return c


def deco(card, win_d, parts, name="hole"):
    """Tout le décor de fond, masqué par la fenêtre de la photo."""
    card.add(f'<g mask="{hole_mask(card, win_d, name)}">{"".join(parts)}</g>')


def fade(card, name, y0, y1, a0=1.0, a1=0.0, x0=0, x1=W):
    """Un masque en dégradé vertical : opacité a0 en y0, a1 en y1."""
    card.def_once(
        name,
        f'<linearGradient id="{card.id(name + "-lg")}" gradientUnits="userSpaceOnUse" x1="0" y1="{f(y0)}" x2="0" y2="{f(y1)}">'
        f'<stop offset="0" stop-color="#FFFFFF" stop-opacity="{a0}"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="{a1}"/></linearGradient>'
        f'<mask id="{card.id(name)}" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}"><rect x="{x0}" y="0" width="{x1 - x0}" height="{H}" fill="url(#{card.id(name + "-lg")})"/></mask>',
    )
    return f"url(#{card.id(name)})"


def caustic_band(card, name, y0, y1, color="#CFFBFF", seed=3, freq="0.018 0.03", k=7.0, op=0.85, gamma=1.6):
    """Caustiques qui dansent sous la surface, fondues vers le bas."""
    filt = caustic_filter(card, name + "-f", freq, seed, k, 1, gamma)
    m = fade(card, name + "-m", y0, y1, 1, 0)
    return f'<g mask="{m}" opacity="{op}" style="mix-blend-mode:screen"><rect x="0" y="{f(y0)}" width="{W}" height="{f(y1 - y0)}" fill="{color}" filter="{filt}"/></g>'


def window_finish(card, d, metal=GOLD, w=6, inner=True, ish=0.55, tint=None, tint_op=0.22, glow_col=None, name="win"):
    """Ombre intérieure sur la photo, lumière d'eau, cerclage de métal biseauté (et halo optionnel)."""
    if ish:
        card.add(inner_shadow(card, d, 40, 14, ish, "#00060E", name + "-ish"))
    if tint:
        card.add(grade(card, d, tint, 0.5, 0.0, tint_op, name + "-gr", 0.9))
    if glow_col:
        card.add(f'<path d="{d}" fill="none" stroke="{glow_col}" stroke-width="10" opacity="0.5" filter="{blur(card, name + "-hg", 6)}"/>')
    card.add(rim(card, d, metal, w, name + "-rim", inner))


def crest_block(card, cx=270, cy=142, s=0.86, metal="gold", division=None, gem="#3FE0D0", halo_col="#BFFBFF", halo_op=0.45, plate=True, ink=None):
    if halo_col:
        card.add(halo(card, "crest-halo", cx, cy + 6, 96 * s, halo_col, halo_op))
    if plate and division is not None:
        card.add(gem_plate(card, cx, cy, s, "#04121E", 0.8))
    return crest(card, cx, cy, s, metal, division, gem, ink=ink)


def marine_snow(seed, n=140, color="#CFF6FF", region=(0, 0, W, H)):
    return snow(seed, n, region, color, 0.4, 1.5, (0.15, 0.7), (WIN[0], WIN[1], WIN[2], WIN[3]))


def sand(card, name, y, color=("#E9D2A0", "#B38A55", "#5E4326"), seed=2, ripples=True):
    rnd = random.Random(seed)
    pts = [(-20, y + 10)]
    for i in range(14):
        x = -20 + (W + 40) * i / 13
        pts.append((x, y + 14 * math.sin(i * 0.9 + seed) + rnd.uniform(-6, 6)))
    pts.append((W + 20, y + 10))
    top = catmull(pts, 6)
    d = poly(top + [(W + 20, H + 10), (-20, H + 10)])
    g = card.grad(name + "-g", [(0, color[0]), (0.35, color[1]), (1, color[2])])
    out = [f'<path d="{d}" fill="{g}"/>']
    if ripples:
        for k in range(7):
            yy = y + 22 + k * 11
            amp = 3 + k * 0.4
            rp = [(x, yy + amp * math.sin(x / (18 + k * 2) + k)) for x in range(-10, W + 20, 10)]
            out.append(f'<path d="{poly(rp, False)}" fill="none" stroke="#FFF2CF" stroke-width="0.9" opacity="{f(0.35 - k * 0.03)}"/>')
    return "".join(out)


def gold_coins(card, seed, cx, cy, spread, n=14, metal=GOLD):
    rnd = random.Random(seed)
    hi, mid, lo = metal
    g = card.grad("coin-g", [(0, hi), (0.45, mid), (1, lo)], 0, 0, 1, 1)
    out = []
    items = []
    for _ in range(n):
        x = cx + rnd.gauss(0, spread)
        y = cy + abs(rnd.gauss(0, spread * 0.25))
        items.append((y, x, rnd.uniform(6, 10), rnd.uniform(0.35, 1), rnd.uniform(-30, 30)))
    items.sort()
    for y, x, r, tilt, rot in items:
        out.append(f'<g transform="translate({f(x)} {f(y)}) rotate({f(rot)})"><ellipse cx="0" cy="1.6" rx="{f(r)}" ry="{f(r * tilt)}" fill="{lo}"/>'
                   f'<ellipse cx="0" cy="0" rx="{f(r)}" ry="{f(r * tilt)}" fill="{g}"/><ellipse cx="0" cy="0" rx="{f(r * 0.7)}" ry="{f(r * tilt * 0.7)}" fill="none" stroke="{lo}" stroke-width="0.7" opacity="0.7"/>'
                   f'<ellipse cx="{f(-r * 0.3)}" cy="{f(-r * tilt * 0.3)}" rx="{f(r * 0.25)}" ry="{f(r * tilt * 0.18)}" fill="#FFFFFF" opacity="0.8"/></g>')
    return f'<g filter="{card.shadow("coin-sh", 0, 2, 2, "#000000", 0.5)}">{"".join(out)}</g>'


def gem(card, cx, cy, r, color="#E0245E", hi="#FFD1E0"):
    g = card.rgrad("gem-" + color.strip("#"), [(0, hi, 1), (0.5, color, 1), (1, "#200010", 1)], 0.4, 0.35, 0.7)
    pts = [pt(cx, cy, r, 45 * i + 22.5) for i in range(8)]
    inner = [pt(cx, cy, r * 0.55, 45 * i + 22.5) for i in range(8)]
    facets = "".join(f'<line x1="{f(inner[i][0])}" y1="{f(inner[i][1])}" x2="{f(pts[i][0])}" y2="{f(pts[i][1])}" stroke="{hi}" stroke-width="0.6" opacity="0.6"/>' for i in range(8))
    return (f'<path d="{poly(pts)}" fill="{g}"/><path d="{poly(inner)}" fill="none" stroke="{hi}" stroke-width="0.7" opacity="0.8"/>{facets}'
            + sparkle(cx - r * 0.3, cy - r * 0.35, r * 0.5, "#FFFFFF", 0.95))


def light_ripples(card, d_fn, n, step, color, w=1.2, op0=0.6, name="rip", dash=None):
    """Ondes concentriques autour d'une forme : `d_fn(k)` rend le chemin du k-ième anneau."""
    out = []
    for k in range(n):
        o = op0 * (1 - k / n)
        da = f' stroke-dasharray="{dash}"' if dash else ""
        out.append(f'<path d="{d_fn(k)}" fill="none" stroke="{color}" stroke-width="{f(w * (1 - k / (n * 1.6)))}" opacity="{f(o)}"{da}/>')
    return f'<g filter="{glow(card, name + "-g", 2, 1)}">{"".join(out)}</g>'
