"""Afrique éternelle · Savane - ce que les cinq familles de cadres partagent : sortie, manifeste, blasons, cadres."""

import json
import sys
from pathlib import Path

ATL = Path(__file__).resolve().parent
sys.path.insert(0, str(ATL.parent.parent / "lib"))
sys.path.insert(0, str(ATL))

from base import *  # noqa: E402,F401,F403
from motifs import *  # noqa: E402,F401,F403
from cosmos import *  # noqa: E402,F401,F403
from kit import *  # noqa: E402,F401,F403
from batir import *  # noqa: E402,F401,F403
from infime import *  # noqa: E402,F401,F403
from motifs import _taper  # noqa: E402,F401

OUT = ATL.parent.parent / "out" / "savane"
SLUG = "savane"
KICKER = "Nouveau rang · Afrique éternelle"
GOLD = METALS["gold"]
REDGOLD = METALS["redgold"]
SILVER = METALS["silver"]
PRISM = METALS["prism"]
OBS = METALS["obsidian"]
CARNELIAN = "#E2522B"
AMBER = "#FFB000"
SKY_GEM = "#7DD3FC"
VIOLET_GEM = "#C4A5FF"
MANIFEST = []


def save(c, name, rank, division, option, title, story, layout, message):
    c.save(OUT / f"{SLUG}-{name}.svg")
    MANIFEST.append({
        "file": f"{SLUG}-{name}.jpg", "rank": rank, "division": division, "option": option,
        "name": title, "story": story, "layout": layout, "message": message,
    })


def write_manifest():
    order = {"Ambassadeur": 0, "Orateur": 1, "Oracle": 2, "Légende": 3, "Mythe": 4}
    rows = sorted(MANIFEST, key=lambda m: (order[m["rank"]], -(m["division"] or 0), m["option"]))
    (OUT / "manifest.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2))


def gem_backing(c, cx, cy, s=1.0, color="#120804", op=0.72):
    gy = cy + 96 * s
    c.add(f'<rect x="{f(cx - 44 * s)}" y="{f(gy - 10 * s)}" width="{f(88 * s)}" height="{f(20 * s)}" rx="{f(10 * s)}" fill="{color}" opacity="{op}"/>')


def birds(c, spots):
    for pose, x, y, s, flip, rot in spots:
        bird(c, pose, x, y, s, flip=flip, rotate=rot)


def masked(c, m, parts):
    c.add(f'<g mask="{m}">{"".join(parts)}</g>')


def legende_crest(c, cx, cy, s, division):
    gem_backing(c, cx, cy, s)
    crest(c, cx, cy, s, "obsidian", division=division, gem=VIOLET_GEM, ink=GOLD[0], edge=GOLD[1])


from base import plate_layer  # noqa: E402  la couche « plate » et ses emplacements de texte


@plate_layer
def legende_plaque(c, title, message, y, extra=""):
    inscription(c, KICKER, title, message, y=y, style="ebene", metal=GOLD, panel=("#120E22", "#05040A"), extra=extra)


def mythe_crest(c, cx, cy, s, halo=0.4):
    c.add(crest_halo(c, cx, cy, 130, "#FFFFFF", halo, "mhalo"))
    crest(c, cx, cy, s, "prism", division=None, ink="#4C3BC4", edge="#FFFFFF")


def prism_frame(c, m=10, w=4):
    pr = c.prism("pf", 0, 0, 1, 1)
    c.add(f'<rect x="{m}" y="{m}" width="{W - 2 * m}" height="{H - 2 * m}" rx="22" fill="none" stroke="{pr}" stroke-width="{w}"/>')
    c.add(f'<rect x="{m + 7}" y="{m + 7}" width="{W - 2 * m - 14}" height="{H - 2 * m - 14}" rx="17" fill="none" stroke="#FFFFFF" stroke-width="0.8" opacity="0.5"/>')


def prism_rim(c, win, w=4):
    pr = c.prism("pr", 0, 0, 1, 1)
    c.add(f'<path d="{win}" fill="none" stroke="{pr}" stroke-width="{w + 6}" opacity="0.35" filter="{c.blur("prb", 4)}"/>')
    c.add(f'<path d="{win}" fill="none" stroke="{pr}" stroke-width="{w}"/>')
    c.add(f'<path d="{win}" fill="none" stroke="#FFFFFF" stroke-width="0.8" opacity="0.8"/>')


@plate_layer
def mythe_plaque(c, message, y):
    inscription(c, KICKER, "Mythe nº 42", message, y=y + 8, style="cosmos", metal=PRISM, panel=("#0C0A1E", "#04030A"),
                ink="#FFFFFF", accent="#D8CCFF")
    c.add(numero_badge(c, 270, y + 8))


def bogolan_column(x, y0, y1, w, ink, bg="#0A0814"):
    return f'<g transform="translate({f(x + w / 2)} {f(y0)}) rotate(90)">{bogolan_band(0, -w / 2, y1 - y0, w, bg, ink, seed=int(x), cell=w)}</g>'


def keep_photo(x, y, x0=70, y0=240, x1=470, y1=740):
    return x0 < x < x1 and y0 < y < y1


def sky_glow(c, name, cx, cy, r, color, op=0.6):
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{c.rgrad(name, [(0, color, op), (0.5, color, op * 0.3), (1, color, 0)])}"/>'
