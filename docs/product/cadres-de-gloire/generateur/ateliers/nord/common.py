"""Aurores du Nord - l'atelier : enregistrement, scènes communes (ciel boréal, fjord, rivages), oiseaux."""

import json
import math
import random
from pathlib import Path

from base import (W, H, f, pt, esc, Card, photo, crest, bird, METALS, sparkle, CINZEL, CINZEL_DECO, SANS, HAND,
                  GARAMOND, FRAUNCES)
from kit import (rrect, arch, gable, oval, octo, place, ublur, bevel, noise_filter, texture_filter, deco_mask, win_clip,
                 inner_shadow, grade, metal_grad, rim, outer_frame, halo, gem_backing, numero_badge, inscription, smooth,
                 ribbon, resample, normals, shape, OR, ARGENT, ETAIN, OR_ROUGE, PRISME, DATE)
from motifs import (aurora, aurora_path, corona, mountains, fir, forest, snowfall, snowflake, ground_snow, shard,
                    ice_cluster, rune, rune_line, rune_ring, plait, ring_chain, beast_head, serpent, round_shield,
                    drinking_horn, silhouette, dragon_head, drakkar, grow, limb_with_twigs, leaves, standing_stone, moon,
                    SHIELD_PAINTS, RAVEN_FLY, RAVEN_PERCH, RAVEN_WING_FAR, WOLF_STAND)

ATL = Path(__file__).resolve().parent
OUT = ATL.parent.parent / "out" / "nord"
SLUG = "nord"
MANIFEST = []
OBSIDIENNE = METALS["obsidian"]
GEM_AURORE = "#3FE8A8"
GEM_GLACE = "#7CDCFF"
KEEP = (92, 300, 448, 700)


def kicker(rank_word="Nouveau rang"):
    return f"{rank_word} · Aurores du Nord"


def save(c, name, rank, division, option, title, story, layout, message):
    c.save(OUT / f"{SLUG}-{name}.svg")
    MANIFEST.append({"file": f"{SLUG}-{name}.jpg", "rank": rank, "division": division, "option": option,
                     "name": title, "story": story, "layout": layout, "message": message})


def write_manifest():
    order = ["ambassadeur", "orateur", "oracle", "legende", "mythe"]
    rows = sorted(MANIFEST, key=lambda r: (order.index(r["rank"].lower().replace("é", "e")), -(r["division"] or 0), r["option"]))
    (OUT / "manifest.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2))


def start(uid, top="#22314A", bottom="#080C16", rim_c="#BFE6FF", glow=0.2, people=2):
    c = Card(uid)
    photo(c, top, bottom, rim_c, people, glow)
    return c


def birds(c, spots):
    for pose, x, y, s, flip, rot in spots:
        bird(c, pose, x, y, s, flip=flip, rotate=rot)


def crest_glow(c, cx, cy, s, color, op=0.55, r=95, name="cg"):
    c.add(halo(c, cx, cy, r * s, color, op, name))


def crest_block(c, cx, cy, s, metal, division, gem=GEM_AURORE, glow=None, backing="#040A16", glow_r=95, edge=None, ink=None):
    if glow:
        crest_glow(c, cx, cy, s, glow, 0.55, glow_r)
    if division is not None:
        gem_backing(c, cx, cy, s, backing, 0.78)
    crest(c, cx, cy, s, metal, division=division, gem=gem, edge=edge, ink=ink)


# ---------------------------------------------------------------- scènes

def sky(c, name, stops, y0=0, y1=H):
    g = c.grad(name, stops)
    return f'<rect x="0" y="{f(y0)}" width="{W}" height="{f(y1 - y0)}" fill="{g}"/>'


def boreal_sky(c, name="sky", top="#01040E", mid="#071A33", low="#0F2E4E", seed=3, nstars=260, keep=KEEP):
    out = [sky(c, name, [(0, top), (0.32, mid), (0.62, low), (1, "#0A1A30")])]
    from cosmos import star_field
    out.append(star_field(seed, nstars, keep=keep))
    return "".join(out)


def curtains(c, name, y, h=200, x0=-60, x1=600, amp=40, waves=1.2, phase=0.4, fold=30, seed=2, top="#B07CFF", mid="#4DFFB4", low="#D8FFF0", density=2.2, op=(0.2, 0.62), skew=0):
    return aurora(c, name, aurora_path(x0, x1, y, amp, waves, phase, fold, 3), h, top=top, mid=mid, low=low, seed=seed, density=density, op=op, skew=skew)


def water(c, name, y0, y1=H, top="#0C2440", bottom="#02060E", glints="#BFE6FF", seed=4, glint_n=60, x0=0, x1=W):
    rnd = random.Random(seed)
    out = [f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(x1 - x0)}" height="{f(y1 - y0)}" fill="{c.grad(name, [(0, top), (1, bottom)])}"/>']
    lines = []
    for _ in range(glint_n):
        y = rnd.uniform(y0 + 3, y1)
        x = rnd.uniform(x0, x1)
        L = rnd.uniform(8, 44) * (1 - (y - y0) / max(1, y1 - y0) * 0.4)
        lines.append(f'<line x1="{f(x - L / 2)}" y1="{f(y)}" x2="{f(x + L / 2)}" y2="{f(y)}" stroke="{glints}" stroke-width="{f(rnd.uniform(0.6, 1.4))}" opacity="{f(rnd.uniform(0.15, 0.55))}" stroke-linecap="round"/>')
    out.append("".join(lines))
    return "".join(out)


def reflect(markup, axis_y, op=0.45, blur_name=None, c=None, sd=3, squash=0.6):
    tr = f"translate(0 {f(axis_y)}) scale(1 {f(-squash)}) translate(0 {f(-axis_y)})"
    filt = f' filter="{ublur(c, blur_name, sd)}"' if c and blur_name else ""
    return f'<g opacity="{f(op)}"{filt}><g transform="{tr}">{markup}</g></g>'


def snow_bank(c, name, x0, x1, y, amp, color=("#EAF6FF", "#9CC4E4"), seed=1, step=14):
    g = c.grad(name, [(0, color[0]), (1, color[1])])
    return ground_snow(x0, x1, y, amp, g, seed, step)


def rune_band(c, name, x0, y, x1, size, color, seed=3, w=1.5, panel=None, h=None):
    out = []
    if panel:
        hh = h or size * 1.7
        out.append(f'<rect x="{f(x0 - size * 0.5)}" y="{f(y - (hh - size) / 2)}" width="{f(x1 - x0 + size)}" height="{f(hh)}" rx="{f(hh / 2)}" fill="{panel}" opacity="0.75"/>')
    out.append(rune_line(seed, x0, y, x1, size, color, w))
    return "".join(out)


def gold_rim(c, d, metal=OR, w=5, name="rim"):
    return rim(c, d, metal, w, name)


def glow_text(c, x, y, text, size, color, font=CINZEL, op=1.0, anchor="middle", ls=2, weight=700, glow=None, name="gt"):
    t = f'<text x="{f(x)}" y="{f(y)}" text-anchor="{anchor}" font-family="{font}" font-weight="{weight}" font-size="{f(size)}" letter-spacing="{f(ls)}" fill="{color}" opacity="{f(op)}">{esc(text)}</text>'
    if glow:
        return f'<g filter="{ublur(c, name, 2.5)}" opacity="0.8"><text x="{f(x)}" y="{f(y)}" text-anchor="{anchor}" font-family="{font}" font-weight="{weight}" font-size="{f(size)}" letter-spacing="{f(ls)}" fill="{glow}">{esc(text)}</text></g>{t}'
    return t
