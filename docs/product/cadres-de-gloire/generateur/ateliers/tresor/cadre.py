"""Atelier « Trésor » — l'outillage commun des cadres : départ, groupes masqués, fenêtre, emblème, enregistrement."""

from contextlib import contextmanager

from kit import (  # noqa: F401
    W, H, f, pt, esc, Card, photo, bird, mee_meo, sparkle, stars, nebula, rays, vignette, border, METALS,
    CINZEL, CINZEL_DECO, GARAMOND, FRAUNCES, SANS, HAND, OUT, DATE, GOLD, GOLD_RICH, BRASS, STEEL, CHROME,
    rrect, arch, circle_path, ellipse_path, poly, T, grp, lg, rg, metal_lin, cyl_grad, bevel, emboss, noise, veins,
    soft, screen, multiply, overlay, deco_mask, clip, inner_shadow, grade, godrays, glint, dust, halo,
    signature_bars, coin_face_def, coin_use, coin_on_edge, meesh_coin, inscription, register, write_manifest,
)

PHOTO_FREE = (150, 370, 400, 600)


def start(uid, top="#3A2A1E", bottom="#120C08", rim="#FFC27A", glow=0.22):
    c = Card(uid)
    photo(c, top, bottom, rim, 2, glow)
    return c


@contextmanager
def group(card, attrs):
    n = len(card.body)
    yield
    seg = "".join(card.body[n:])
    del card.body[n:]
    card.add(f"<g {attrs}>{seg}</g>")


def masked(card, d, name="win", feather=0):
    return group(card, f'mask="{deco_mask(card, d, name, feather)}"')


def window_depth(card, d, op=0.75, w=40, sd=14, rim=None, rim_w=1.4, name="wd"):
    """Profondeur de la fenêtre : ombre intérieure, et un liseré lumineux."""
    out = [inner_shadow(card, d, w, sd, op, "#000000", name)]
    if rim:
        out.append(f'<path d="{d}" fill="none" stroke="{rim}" stroke-width="{f(rim_w)}"/>')
    return "".join(out)


def emblem(card, cx, cy, r, palier, key="mc", halo_op=0.55, m=GOLD_RICH, glints=True):
    return meesh_coin(card, cx, cy, r, m, "MEESHY", palier.upper(), key, halo_op, glints)


def save(card, stem, palier, option, name, story, layout, message):
    file = f"tresor-{stem}-{option}"
    card.save(OUT / f"{file}.svg")
    register(f"{file}.jpg", palier, option, name, story, layout, message)


def birds(card, spots):
    """spots = [(pose, x, y, taille, retourné, rotation)]."""
    for pose, x, y, s, flip, rot in spots:
        bird(card, pose, x, y, s, flip=flip, rotate=rot)


def bg(card, fill):
    return f'<rect width="{W}" height="{H}" fill="{fill}"/>'


def full_rect():
    return f"M0 0 L{W} 0 L{W} {H} L0 {H} Z"


def gold_frame(card, d, key="gf", m=GOLD, w=7, inner=True):
    """Un filet d'or biseauté qui suit `d`."""
    g = metal_lin(card, key + "-g", m, 0, 0, 1, 1, 3)
    bv = bevel(card, key + "-bv", 1.0, 3.0, 1.1, 24, shadow=(0, 2, 2.5, 0.6))
    out = [f'<path d="{d}" fill="none" stroke="{g}" stroke-width="{f(w)}" filter="{bv}"/>']
    if inner:
        out.append(f'<path d="{d}" fill="none" stroke="{m[2]}" stroke-width="0.8" opacity="0.8"/>')
    return "".join(out)


from base import plate_layer  # noqa: E402  la couche « plate » et ses emplacements de texte


@plate_layer
def text_panel(card, x0, y0, x1, y1, r=20, fill="#0B0A12", op=0.78, stroke=None, sw=1.5, key="tp", blur_shadow=True):
    d = rrect(x0, y0, x1, y1, r)
    out = []
    if blur_shadow:
        out.append(f'<path d="{d}" fill="#000000" opacity="0.55" transform="translate(0 6)" filter="{soft(card, 8)}"/>')
    out.append(f'<path d="{d}" fill="{fill}" opacity="{f(op)}"/>')
    if stroke:
        out.append(f'<path d="{d}" fill="none" stroke="{stroke}" stroke-width="{f(sw)}"/>')
    return "".join(out)
