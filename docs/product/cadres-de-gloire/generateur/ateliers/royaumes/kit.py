"""Kit de la collection « Afrique éternelle · Royaumes » : l'inscription (sur-titre long), la sauvegarde, les écrins."""

from common import *  # noqa: F401,F403
from common import MANIFEST  # noqa: F401

KICK = "Nouveau rang · Afrique éternelle"
DATE = "10 octobre 2026"

PANELS = {
    "or": dict(panel=("#3A0C0E", "#140406"), edge="gold", ink="#FFF1D6", accent="#F2C76A"),
    "ebene": dict(panel=("#24160C", "#0C0704"), edge="gold", ink="#FFF1D6", accent="#F2C76A"),
    "bronze": dict(panel=("#2A170A", "#0E0804"), edge="bronze", ink="#FBEBD0", accent="#EFC28A"),
    "banco": dict(panel=("#4A2412", "#1E0C05"), edge="gold", ink="#FFF1D6", accent="#F6CB7A"),
    "kassena": dict(panel=("#1C1411", "#0A0706"), edge="gold", ink="#F4ECDC", accent="#F2C76A"),
    "pierre": dict(panel=("#1E1A16", "#0B0908"), edge="gold", ink="#FFF1D6", accent="#F2C76A"),
    "nuit": dict(panel=("#121436", "#06071A"), edge="gold", ink="#F4EEDD", accent="#E9C77A"),
    "mer": dict(panel=("#0A2A36", "#04101A"), edge="bronze", ink="#EFF8F4", accent="#F0B98A"),
    "violet": dict(panel=("#241038", "#0C0518"), edge="gold", ink="#FBF0DA", accent="#F0C878"),
    "cosmos": dict(panel=("#141030", "#06040F"), edge="rosegold", ink="#FFF3EA", accent="#FFC9B0"),
    "prisme": dict(panel=("#120E2A", "#05040C"), edge="prism", ink="#FFFFFF", accent="#E9DDFF"),
}


def _edge(card, key):
    if key == "prism":
        return card.prism("pl-prism", 0, 0, 1, 0), "#FFFFFF", "#B9A7FF", "#4C3BC4"
    hi, mid, lo = METALS[key]
    g = card.grad(f"pl-edge-{key}", [(0, hi), (0.25, mid), (0.5, lo), (0.75, mid), (1, hi)], 0, 0, 1, 0)
    return g, hi, mid, lo


from base import plate_layer  # noqa: E402  la couche « plate » et ses emplacements de texte


@plate_layer
def plate(card, title, message=None, y=760, style="or", w=424, kicker=KICK, numero=None, title_size=38,
          ornament="losange", ink=None, accent=None, opacity=0.93, h=None):
    """L'inscription : un panneau émaillé à double filet de métal, sur-titre long, titre, message manuscrit, date."""
    p = PANELS[style]
    ink = ink or p["ink"]
    accent = accent or p["accent"]
    edge, hi, mid, lo = _edge(card, p["edge"])
    h = h or (138 if message else 114)
    x0 = (W - w) / 2
    top, bot = p["panel"]
    fill = card.grad(f"pl-fill-{style}", [(0, top), (1, bot)])
    card.add(f'<rect x="{f(x0)}" y="{f(y + 6)}" width="{f(w)}" height="{f(h)}" rx="16" fill="#000000" opacity="0.55" filter="{card.blur("pl-sh", 9)}"/>')
    card.add(f'<rect x="{f(x0)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="16" fill="{fill}" opacity="{opacity}"/>')
    card.add(f'<rect x="{f(x0)}" y="{f(y)}" width="{f(w)}" height="{f(h * 0.45)}" rx="16" fill="{lgrad(card, "pl-gloss", [(0, "#FFFFFF", 0.08), (1, "#FFFFFF", 0)])}"/>')
    card.add(f'<rect x="{f(x0)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="16" fill="none" stroke="{lo}" stroke-width="4" opacity="0.7"/>')
    card.add(f'<rect x="{f(x0)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="16" fill="none" stroke="{edge}" stroke-width="2.4"/>')
    card.add(f'<rect x="{f(x0 + 7)}" y="{f(y + 7)}" width="{f(w - 14)}" height="{f(h - 14)}" rx="11" fill="none" stroke="{edge}" stroke-width="0.8" opacity="0.75"/>')
    if ornament == "losange":
        for cx, cy in ((x0 + 7, y + h / 2), (x0 + w - 7, y + h / 2)):
            card.add(f'<path d="M{f(cx)} {f(cy - 9)} L{f(cx + 6)} {f(cy)} L{f(cx)} {f(cy + 9)} L{f(cx - 6)} {f(cy)}Z" fill="{edge}" stroke="{lo}" stroke-width="0.8"/>')
        card.add(f'<path d="M270 {f(y - 7)} L278 {f(y)} L270 {f(y + 7)} L262 {f(y)}Z" fill="{edge}" stroke="{lo}" stroke-width="0.8"/>')
    elif ornament == "cauris":
        card.add(cowrie(card, x0 + 7, y + h / 2, 0.55, 0), cowrie(card, x0 + w - 7, y + h / 2, 0.55, 0), cowrie(card, 270, y, 0.55, 90))
    if numero:
        pw = 104
        card.add(f'<rect x="{f(270 - pw / 2)}" y="{f(y - 11)}" width="{pw}" height="22" rx="11" fill="#0B0814" stroke="{edge}" stroke-width="1.6"/>')
        card.add(f'<text x="270" y="{f(y + 4.2)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="11" letter-spacing="2" fill="#FFFFFF">{esc(numero)}</text>')
    n = len(card.body)
    if message:
        ky, ty, my, dy = y + 30, y + 70, y + 102, y + 124
    else:
        ky, ty, my, dy = y + 32, y + 76, None, y + 99
    card.add(f'<text x="270" y="{f(ky)}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="11" letter-spacing="2.4" fill="{accent}">{esc(kicker.upper())}</text>')
    card.add(f'<text x="270" y="{f(ty)}" text-anchor="middle" font-family="{CINZEL}" font-weight="700" font-size="{title_size}" fill="{ink}">{esc(title)}</text>')
    if message:
        card.add(f'<text x="270" y="{f(my)}" text-anchor="middle" font-family="{HAND}" font-weight="700" font-size="26" fill="{ink}">{esc(message)}</text>')
    card.add(f'<text x="270" y="{f(dy)}" text-anchor="middle" font-family="{SANS}" font-weight="600" font-size="11.5" letter-spacing="1.2" fill="{accent}" opacity="0.92">{esc(DATE)}</text>')
    wrap_since(card, n, card.shadow("txt", 0, 1.4, 1.8, "#000000", 0.85))
    return y + h


def finish(card, short, rank, division, option, name, story, layout, message):
    card.save(OUT / f"{SLUG}-{short}.svg")
    register(f"{SLUG}-{short}.jpg", rank, division, option, name, story, layout, message)


def clip(card, path):
    uid = nid("clp")
    card.def_once(uid, f'<clipPath id="{card.id(uid)}"><path d="{path}"/></clipPath>')
    return f"url(#{card.id(uid)})"


def frame_window(card, path, metal="gold", w=3, shadow=26, op=0.85):
    """La fenêtre de la photo : ombre intérieure (la photo semble enchâssée) et filet de métal."""
    inner_shadow(card, path, shadow, op)
    gold_line(card, path, w, metal)


def dots_on(path_pts, color, r=1.4, op=0.9, every=1):
    return "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{r}" fill="{color}" opacity="{op}"/>' for i, (x, y, _) in enumerate(path_pts) if i % every == 0)


def wrap_clip(card, n, clip_url):
    seg = "".join(card.body[n:])
    del card.body[n:]
    card.add(f'<g clip-path="{clip_url}">{seg}</g>')


DUO = {
    "ruban": [(54, 742, 110, False, -6), (486, 742, 110, True, 6)],
    "rebord": [(58, 726, 112, False, -4), (482, 726, 112, True, 4)],
}


def duo(card, layout, mee, meo):
    """Mee et Meo posés APRÈS l'inscription (assis sur son rebord, devant elle), sans toucher au texte."""
    for (x, y, s, flip, rot), pose in zip(DUO[layout], (mee, meo)):
        bird(card, pose, x, y, s, flip=flip, rotate=rot)
