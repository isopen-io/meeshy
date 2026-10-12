"""Base commune des cadres de gloire Meeshy (planche de design, pas du code produit).

Repère : la story 9:16, 540 x 960. Chaque cadre est un SVG autonome rendu en JPEG par `render.mjs`
(polices Google chargées localement, Mee et Meo en data URI).

Couches d'un cadre, de bas en haut :
  1. photo()        - la photo de l'utilisateur (placeholder : deux silhouettes, lumière chaude)
  2. la décoration  - ce que chaque atelier dessine (bandes, ornements, ciel, astres…)
  3. crest()        - le blason du rang, avec la division en gemmes (V = 1 … I = 5)
  4. mee_meo()      - Mee et Meo dans une pose
  5. plaque()       - l'inscription : sur-titre, titre, date, et le MESSAGE optionnel de l'auteur

Polices disponibles (chargées par render.mjs) : 'Cinzel', 'Cinzel Decorative', 'Cormorant Garamond',
'Fraunces', 'Manrope', 'Caveat' (le message, manuscrit).
"""

import base64
import functools
import inspect
import json
import math
import os
import random
import re
import sys
from contextlib import contextmanager
from pathlib import Path

W, H = 540, 960
HERE = Path(__file__).resolve().parent
MEE_DIR = HERE.parent / "mee"

CINZEL = "'Cinzel', 'Cormorant Garamond', serif"
CINZEL_DECO = "'Cinzel Decorative', 'Cinzel', serif"
GARAMOND = "'Cormorant Garamond', serif"
FRAUNCES = "'Fraunces', serif"
SANS = "'Manrope', sans-serif"
HAND = "'Caveat', cursive"

MEE_POSES = sorted(p.stem for p in MEE_DIR.glob("*.png"))


def f(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


def pt(cx, cy, r, deg):
    """Point à `r` de (cx, cy), angle en degrés depuis midi, sens horaire."""
    a = math.radians(deg)
    return cx + r * math.sin(a), cy - r * math.cos(a)


def esc(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


DATE_TEXT = "10 octobre 2026"
TEXT_RE = re.compile(r"<text(\s[^>]*)?>(.*?)</text>", re.S)
TAG_RE = re.compile(r"<[^>]+>")

# Les modules d'atelier dont l'appel ÉTIQUETTE le cadre en cours : un cadre qui dessine avec la bibliothèque
# africaine d'un atelier porte le motif « afrique », avec sa bibliothèque cosmique le motif « cosmos ».
MOTIF_MODULES = {"afrique": "afrique", "afro": "afrique", "cosmos": "cosmos", "infini": "cosmos", "infime": "cosmos", "infinis": "cosmos"}


class Card:
    """Un cadre en cours de dessin. `uid` préfixe les ids pour qu'aucun dégradé ne collisionne.

    Le cadre porte aussi ce que l'export (`lib/export.mjs`) relit : ses couches (`layer`, attribut `data-layer`),
    ses emplacements de texte (`data-slot` sur chaque `<text>`), ses motifs (`data-motifs`) et le compteur `nid`
    de ses identifiants — par cadre, pour qu'une régénération partielle rende des SVG identiques à l'octet.
    """

    current = None

    def __init__(self, uid="c"):
        self.uid = uid
        self.defs = []
        self.body = []
        self._ids = set()
        self._n = 0
        self._slots = {esc(DATE_TEXT): "date"}
        self._decor_texts = 0
        self._decor_keys = {}
        self.motifs = set()
        self.birds = 0
        Card.current = self

    def nid(self, prefix="k"):
        self._n += 1
        return f"{prefix}{self._n}"

    def motif(self, *names):
        self.motifs.update(names)
        return self

    def slots(self, **texts):
        """Déclare le contenu des emplacements vivants (kicker, title, message, date) : chaque `<text>` qui le porte
        reçoit `data-slot="<clé>"`."""
        for key, value in texts.items():
            if isinstance(value, str) and value:
                self._slots[esc(value)] = key
                self._slots[esc(value.upper())] = key
        return self

    @contextmanager
    def layer(self, kind):
        """Tout ce qui est ajouté dans le bloc tombe dans `<g data-layer="kind">` (un groupe sans attribut de rendu)."""
        start = len(self.body)
        yield self
        inner = "".join(self.body[start:])
        del self.body[start:]
        if inner:
            if kind == "plate":
                inner = self._tag_texts(inner, "plate")
            self.body.append(f'<g data-layer="{kind}">{inner}</g>')

    def _tag_texts(self, markup, scope):
        counter = [0]

        def tag(m):
            attrs, inner = m.group(1) or "", m.group(2)
            if "data-slot=" in attrs:
                return m.group(0)
            key = self._slots.get(TAG_RE.sub("", inner).strip()) if scope == "plate" else None
            if key is None:
                if scope == "plate":
                    counter[0] += 1
                    key = f"plate.{counter[0]}"
                else:
                    where = (TAG_RE.sub("", inner).strip(), *re.findall(r'\s(?:x|y|transform)="([^"]*)"', attrs))
                    if where not in self._decor_keys:
                        self._decor_texts += 1
                        self._decor_keys[where] = f"decor.{self._decor_texts}"
                    key = self._decor_keys[where]
            return f'<text data-slot="{key}"{attrs}>{inner}</text>'

        return TEXT_RE.sub(tag, markup)

    def id(self, name):
        return f"{self.uid}-{name}"

    def add(self, *parts):
        self.body.extend(parts)
        return self

    def def_once(self, name, markup):
        if name not in self._ids:
            self._ids.add(name)
            self.defs.append(markup)
        return f"url(#{self.id(name)})"

    def grad(self, name, stops, x1=0, y1=0, x2=0, y2=1):
        st = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
        return self.def_once(name, f'<linearGradient id="{self.id(name)}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{st}</linearGradient>')

    def rgrad(self, name, stops, cx=0.5, cy=0.5, r=0.5, fx=None, fy=None):
        st = "".join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops)
        focal = f' fx="{fx}" fy="{fy}"' if fx is not None else ""
        return self.def_once(name, f'<radialGradient id="{self.id(name)}" cx="{cx}" cy="{cy}" r="{r}"{focal}>{st}</radialGradient>')

    def blur(self, name, sd):
        self.def_once(name, f'<filter id="{self.id(name)}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="{sd}"/></filter>')
        return f"url(#{self.id(name)})"

    def glow(self, sd=6):
        return self.blur(f"glow{sd}", sd)

    def shadow(self, name="drop", dx=0, dy=6, sd=8, color="#000000", op=0.55):
        self.def_once(
            name,
            f'<filter id="{self.id(name)}" x="-30%" y="-30%" width="160%" height="160%">'
            f'<feDropShadow dx="{dx}" dy="{dy}" stdDeviation="{sd}" flood-color="{color}" flood-opacity="{op}"/></filter>',
        )
        return f"url(#{self.id(name)})"

    def metal(self, key):
        hi, mid, lo = METALS[key]
        fill = self.grad(f"m-{key}", [(0, hi), (0.42, mid), (0.5, lo), (0.62, mid), (1, hi)], 0, 0, 1, 1)
        return fill, hi, mid, lo

    def prism(self, name="prism", x1=0, y1=0, x2=1, y2=0):
        return self.grad(name, [(0, "#FF6FB1"), (0.2, "#FFD36E"), (0.42, "#6EF0C2"), (0.62, "#6EA8FF"), (0.82, "#B36EFF"), (1, "#FF6FB1")], x1, y1, x2, y2)

    def svg(self):
        motifs = f' data-motifs="{" ".join(sorted(self.motifs))}"' if self.motifs else ""
        body = self._tag_texts("".join(self.body), "decor")
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {W} {H}" width="{W}" height="{H}"{motifs}>'
            f'<defs><clipPath id="{self.id("win")}"><rect width="{W}" height="{H}" rx="28"/></clipPath>{"".join(self.defs)}</defs>'
            f'<g clip-path="url(#{self.id("win")})" data-layer="root">{body}</g></svg>'
        )

    def save(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_text(anchored(self.svg(), ANCHORS.get(Path(path).stem, [])))


# Les ancres corrigées de Mee et Meo (lot L2, règle d'empiètement) : `lib/anchors.json` donne, par cadre, un
# déplacement `dx`, `dy` (repère de design) et une échelle `scale` par oiseau, repéré par l'ordre de ses appels à
# bird() (`data-bird`). Ce qui suit un oiseau (`data-follows-bird`, la lueur posée sous lui) bouge avec lui. Le décor
# ne bouge pas. `lib/anchors.mjs` les calcule ; CADRES_ANCHORS=off rend le dessin validé du 2026-10-10 (référence L0).
ANCHORS = {} if os.environ.get("CADRES_ANCHORS") == "off" else json.loads((HERE / "anchors.json").read_text())
BIRD_TR = re.compile(r'(<g data-layer="birds" data-bird="(\d+)"[^>]*? transform=")translate\(([-\d.]+) ([-\d.]+)\)([^"]*)"')
FOLLOW_TR = re.compile(r'<g data-follows-bird="(\d+)">')


def anchored_spot(stem, index, x, y, size):
    """La place corrigée d'un oiseau, pour un atelier qui accroche quelque chose à lui (les queues du ruban tenues au
    bec) : ce qui s'accroche suit l'oiseau."""
    fix = next((f for f in ANCHORS.get(stem, []) if f["bird"] == index), {})
    return x + fix.get("dx", 0), y + fix.get("dy", 0), size * fix.get("scale", 1)


def anchored(svg, fixes):
    by_bird = {fix["bird"]: fix for fix in fixes}
    if not by_bird:
        return svg

    def bird_tr(m):
        fix = by_bird.get(int(m.group(2)))
        if not fix:
            return m.group(0)
        x, y = float(m.group(3)) + fix.get("dx", 0), float(m.group(4)) + fix.get("dy", 0)
        scale = fix.get("scale", 1)
        return f'{m.group(1)}translate({f(x)} {f(y)}){m.group(5)}{f" scale({scale})" if scale != 1 else ""}"'

    def follow_tr(m):
        fix = by_bird.get(int(m.group(1)))
        if not fix:
            return m.group(0)
        return f'<g data-follows-bird="{m.group(1)}" transform="translate({f(fix.get("dx", 0))} {f(fix.get("dy", 0))})">'

    return FOLLOW_TR.sub(follow_tr, BIRD_TR.sub(bird_tr, svg))


def nid(prefix="k"):
    """L'identifiant suivant du cadre en cours : le compteur vit dans `Card`, plus dans les ateliers."""
    if Card.current is None:
        raise RuntimeError("nid() appelé hors d'un cadre : créer la Card d'abord.")
    return Card.current.nid(prefix)


PLATE_VARIANT = os.environ.get("CADRES_PLATE")
PLATE_SAMPLE_MESSAGE = "On brille ensemble"


def plate_layer(fn=None, **aliases):
    """Une fonction d'inscription ou de panneau de plaque : tout ce qu'elle dessine — qu'elle l'ajoute au cadre ou
    qu'elle le RENDE en balisage — tombe dans la couche `plate`, et ses arguments `kicker`, `title`, `message`, `date`
    nomment les emplacements de texte qu'elle pose. `aliases` relie une clé à un autre argument :
    `@plate_layer(title="palier")`.

    `CADRES_PLATE=plain|message` rejoue la plaque dans l'AUTRE variante que celle du cadre (§ 5.1 : la hauteur du
    panneau change avec le message) : `plain` retire le message, `message` garde celui du cadre ou pose
    PLATE_SAMPLE_MESSAGE. Seule la plaque change ; l'exportateur vérifie que le décor reste identique au pixel."""
    if fn is None:
        return lambda f_: plate_layer(f_, **aliases)
    sig = inspect.signature(fn)
    names = {key: aliases.get(key, key) for key in ("kicker", "title", "message", "date")}
    message_arg = names["message"] if names["message"] in sig.parameters else None

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        bound = sig.bind(*args, **kwargs)
        bound.apply_defaults()
        if PLATE_VARIANT and message_arg:
            current = bound.arguments.get(message_arg)
            bound.arguments[message_arg] = None if PLATE_VARIANT == "plain" else (current or PLATE_SAMPLE_MESSAGE)
            args, kwargs = bound.args, bound.kwargs
        card = args[0]
        card.slots(**{key: bound.arguments.get(arg) for key, arg in names.items()})
        with card.layer("plate"):
            result = fn(*args, **kwargs)
        if isinstance(result, str) and result.lstrip().startswith("<"):
            return f'<g data-layer="plate">{card._tag_texts(result, "plate")}</g>'
        return result

    return wrapper


def _motif_probe(frame, event, arg):
    if event == "call" and Card.current is not None:
        motif = MOTIF_MODULES.get(frame.f_globals.get("__name__"))
        if motif:
            Card.current.motifs.add(motif)


sys.setprofile(_motif_probe)


METALS = {
    "slate": ("#E5E7EB", "#9CA3AF", "#4B5563"),
    "pewter": ("#F1F5F9", "#A8B2C1", "#56606F"),
    "bronze": ("#F6D2A8", "#C2834A", "#6B3E1E"),
    "copper": ("#FFD1B8", "#D9774A", "#7A3317"),
    "silver": ("#FFFFFF", "#C9D2DE", "#6D7889"),
    "jade": ("#D7FBEA", "#3FB68B", "#0E5A43"),
    "gold": ("#FFF4C2", "#E8B53C", "#8A5A12"),
    "redgold": ("#FFE6B0", "#E0952B", "#7A2E0E"),
    "rosegold": ("#FFE3D6", "#E59A7E", "#8B4A3A"),
    "obsidian": ("#9AA0B5", "#3A3F55", "#0B0D18"),
    "prism": ("#FFFFFF", "#B9A7FF", "#4C3BC4"),
}


# ---------------------------------------------------------------- la photo

def photo(card, top="#3A2A1E", bottom="#120C08", rim="#FFC27A", people=2, glow=0.22):
    """Le placeholder de la photo : deux silhouettes éclairées par l'arrière, un halo, du bokeh."""
    with card.layer("photo-bg"):
        card.add(f'<rect width="{W}" height="{H}" fill="{card.grad("ph-bg", [(0, top), (1, bottom)])}"/>')
        card.add(f'<ellipse cx="270" cy="470" rx="250" ry="290" fill="{card.rgrad("ph-halo", [(0, "#FFFFFF", glow), (1, "#FFFFFF", 0)])}"/>')
    with card.layer("photo"):
        _photo_people(card, rim, people)


def _photo_people(card, rim, people):
    rnd = random.Random(7)
    bokeh = "".join(
        f'<circle cx="{f(rnd.uniform(60, 480))}" cy="{f(rnd.uniform(260, 700))}" r="{f(rnd.uniform(8, 26))}" fill="{rim}" opacity="{f(rnd.uniform(0.05, 0.16))}"/>'
        for _ in range(16)
    )
    card.add(f'<g filter="{card.blur("ph-bokeh", 3)}">{bokeh}</g>')
    figs = [(222, 450, 64, 110, 330), (336, 482, 54, 250, 420)][:people]
    for cx, cy, r, x0, x1 in figs:
        body = f"M{x0} 760 Q{x0 + 8} {cy + 92} {cx} {cy + 82} Q{x1 - 8} {cy + 92} {x1} 760 Z"
        card.add(
            f'<g><circle cx="{cx}" cy="{cy}" r="{r}" fill="#0C0806" opacity="0.62"/>'
            f'<path d="{body}" fill="#0C0806" opacity="0.62"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{rim}" stroke-width="2.5" opacity="0.55"/>'
            f'<path d="M{x0} 760 Q{x0 + 8} {cy + 92} {cx} {cy + 82}" fill="none" stroke="{rim}" stroke-width="2" opacity="0.45"/></g>'
        )


# ---------------------------------------------------------------- Mee et Meo

_DATA = {}


def _data_uri(pose):
    if pose not in _DATA:
        raw = (MEE_DIR / f"{pose}.png").read_bytes()
        _DATA[pose] = "data:image/png;base64," + base64.b64encode(raw).decode()
    return _DATA[pose]


def bird(card, pose, x, y, size, flip=False, rotate=0, shadow=True):
    """Pose une image de Mee ou Meo, centrée en (x, y), largeur `size`."""
    tr = f"translate({f(x)} {f(y)}) rotate({rotate})" + (" scale(-1 1)" if flip else "")
    filt = f' filter="{card.shadow("bird", 0, 6, 6, "#000000", 0.45)}"' if shadow else ""
    index = card.birds
    card.birds += 1
    card.add(
        f'<g data-layer="birds" data-bird="{index}" data-pose="{pose}" transform="{tr}"{filt}><image href="{_data_uri(pose)}" x="{f(-size / 2)}" y="{f(-size / 2)}" '
        f'width="{f(size)}" height="{f(size)}" preserveAspectRatio="xMidYMid meet"/></g>'
    )


MEE_LAYOUTS = {
    # au pied du cadre, de part et d'autre de la plaque
    "pied": lambda: [(98, 700, 150, False, -6), (442, 700, 150, True, 6)],
    # perchés sur le haut du cadre, de chaque côté du blason
    "perches": lambda: [(118, 92, 120, False, -10), (422, 92, 120, True, 10)],
    # qui se penchent par les côtés, à mi-hauteur
    "cotes": lambda: [(40, 430, 140, False, 18), (500, 470, 140, True, -18)],
    # au-dessus de la plaque, qui tiennent le message
    "ruban": lambda: [(74, 760, 118, False, -4), (466, 760, 118, True, 4)],
    # un seul, en grand, qui pose dans la photo
    "selfie": lambda: [(420, 640, 190, True, 0)],
}


def mee_meo(card, layout="pied", mee="mee-fete", meo="meo-roi"):
    spots = MEE_LAYOUTS[layout]()
    poses = [mee, meo] if len(spots) == 2 else [meo]
    for (x, y, s, flip, rot), pose in zip(spots, poses):
        bird(card, pose, x, y, s, flip=flip, rotate=rot)


# ---------------------------------------------------------------- le blason

def signature(cx, cy, s, color):
    out = []
    for i, dx in enumerate((-14, 0, 14)):
        h = (16, 26, 16)[i] * s
        out.append(
            f'<line x1="{f(cx + dx * s)}" y1="{f(cy - h)}" x2="{f(cx + dx * s)}" y2="{f(cy + h)}" '
            f'stroke="{color}" stroke-width="{f(7 * s)}" stroke-linecap="round"/>'
        )
    return "".join(out)


def shield_path(cx, cy, s):
    return (
        f"M{f(cx)} {f(cy - 62 * s)} L{f(cx + 52 * s)} {f(cy - 48 * s)} L{f(cx + 52 * s)} {f(cy + 8 * s)} "
        f"Q{f(cx + 52 * s)} {f(cy + 52 * s)} {f(cx)} {f(cy + 74 * s)} Q{f(cx - 52 * s)} {f(cy + 52 * s)} {f(cx - 52 * s)} {f(cy + 8 * s)} "
        f"L{f(cx - 52 * s)} {f(cy - 48 * s)} Z"
    )


def crest(card, cx=270, cy=150, s=1.0, metal="gold", division=None, gem="#E04848", ink=None, edge=None):
    """Le blason du rang : écu de la matière, Signature gravée, division en gemmes sous la pointe (couche `crest`)."""
    with card.layer("crest"):
        return _crest(card, cx, cy, s, metal, division, gem, ink, edge)


def _crest(card, cx, cy, s, metal, division, gem, ink, edge):
    fill, hi, mid, lo = card.metal(metal)
    card.add(f'<path d="{shield_path(cx, cy + 4 * s, s)}" fill="#000000" opacity="0.35" filter="{card.blur("crest-sh", 6)}"/>')
    card.add(f'<path d="{shield_path(cx, cy, s)}" fill="{fill}" stroke="{edge or hi}" stroke-width="{f(3 * s)}"/>')
    card.add(f'<path d="{shield_path(cx, cy, s * 0.82)}" fill="none" stroke="{lo}" stroke-width="{f(1.2 * s)}" opacity="0.6"/>')
    card.add(signature(cx, cy + 4 * s, 0.9 * s, ink or lo))
    if division is not None:
        count = {5: 1, 4: 2, 3: 3, 2: 4, 1: 5}[division]
        for i in range(5):
            gx = cx + (i - 2) * 15 * s
            gy = cy + 96 * s
            on = i < count
            card.add(
                f'<path d="M{f(gx)} {f(gy - 6 * s)} L{f(gx + 5 * s)} {f(gy)} L{f(gx)} {f(gy + 6 * s)} L{f(gx - 5 * s)} {f(gy)} Z" '
                f'fill="{gem if on else "none"}" stroke="{hi}" stroke-width="{f(1.4 * s)}" opacity="{1 if on else 0.6}"/>'
            )
    return fill, hi, mid, lo


# ---------------------------------------------------------------- l'inscription

@plate_layer
def plaque(card, kicker, title, date="10 octobre 2026", message=None, y=748, style="cartouche",
           ink="#FFF4C2", accent="#E8B53C", panel="#0B0A1A", title_font=CINZEL, title_size=40, message_color=None):
    """L'inscription du moment. `style` : cartouche | ruban | parchemin | nu. `message` : la phrase de l'auteur."""
    box_h = 128 if message else 108
    if style == "cartouche":
        card.add(f'<rect x="58" y="{y}" width="424" height="{box_h}" rx="22" fill="{panel}" opacity="0.62"/>')
        card.add(f'<rect x="58" y="{y}" width="424" height="{box_h}" rx="22" fill="none" stroke="{accent}" stroke-width="1.6"/>')
        card.add(f'<rect x="66" y="{y + 8}" width="408" height="{box_h - 16}" rx="16" fill="none" stroke="{accent}" stroke-width="0.8" opacity="0.6"/>')
    elif style == "ruban":
        top, bot = y + 34, y + 86
        card.add(
            f'<path d="M36 {top + 8} L84 {top} L84 {bot} L36 {bot + 8} L52 {(top + bot) / 2 + 4} Z" fill="{accent}" opacity="0.75"/>'
            f'<path d="M504 {top + 8} L456 {top} L456 {bot} L504 {bot + 8} L488 {(top + bot) / 2 + 4} Z" fill="{accent}" opacity="0.75"/>'
            f'<path d="M80 {top} Q270 {top - 18} 460 {top} L460 {bot} Q270 {bot - 18} 80 {bot} Z" fill="{panel}" opacity="0.82" stroke="{accent}" stroke-width="2"/>'
        )
    elif style == "parchemin":
        card.add(
            f'<path d="M70 {y} Q270 {y - 10} 470 {y} L470 {y + box_h} Q270 {y + box_h + 10} 70 {y + box_h} Z" fill="#F3E3C2" opacity="0.93"/>'
            f'<ellipse cx="70" cy="{y + box_h / 2}" rx="12" ry="{box_h / 2 + 6}" fill="#D9C08F"/><ellipse cx="470" cy="{y + box_h / 2}" rx="12" ry="{box_h / 2 + 6}" fill="#D9C08F"/>'
        )
        ink, accent = "#3B2410", "#7A4A1A"
    base = y + (30 if style != "ruban" else 20)
    card.add(f'<text x="270" y="{base}" text-anchor="middle" font-family="{SANS}" font-weight="800" font-size="13" letter-spacing="4.5" fill="{accent}">{esc(kicker.upper())}</text>')
    card.add(f'<text x="270" y="{base + 44 if style != "ruban" else base + 50}" text-anchor="middle" font-family="{title_font}" font-weight="700" font-size="{title_size}" fill="{ink}">{esc(title)}</text>')
    if message:
        card.add(f'<text x="270" y="{base + 80 if style != "ruban" else base + 96}" text-anchor="middle" font-family="{HAND}" font-weight="700" font-size="27" fill="{message_color or ink}">{esc(message)}</text>')
        card.add(f'<text x="270" y="{base + 100 if style != "ruban" else base + 118}" text-anchor="middle" font-family="{SANS}" font-weight="500" font-size="12" letter-spacing="1" fill="{accent}" opacity="0.9">{esc(date)}</text>')
    else:
        card.add(f'<text x="270" y="{base + 70 if style != "ruban" else base + 80}" text-anchor="middle" font-family="{SANS}" font-weight="500" font-size="13" letter-spacing="1" fill="{accent}" opacity="0.9">{esc(date)}</text>')


# ---------------------------------------------------------------- ciel et astres

def stars(card, seed, n, region=(0, 0, W, H), color="#FFFFFF", rmax=1.8, keep_photo_clear=True):
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if keep_photo_clear and 90 < x < 450 and 300 < y < 720:
            continue
        r = rnd.uniform(0.35, rmax)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{color}" opacity="{f(rnd.uniform(0.35, 1))}"/>')
    card.add("".join(out))


def sparkle(cx, cy, r, color, op=1):
    k = 0.14
    return (
        f'<path d="M{f(cx)} {f(cy - r)} Q{f(cx + r * k)} {f(cy - r * k)} {f(cx + r)} {f(cy)} Q{f(cx + r * k)} {f(cy + r * k)} {f(cx)} {f(cy + r)} '
        f'Q{f(cx - r * k)} {f(cy + r * k)} {f(cx - r)} {f(cy)} Q{f(cx - r * k)} {f(cy - r * k)} {f(cx)} {f(cy - r)} Z" fill="{color}" opacity="{op}"/>'
    )


def galaxy(cx, cy, r, color, arms=3, tilt=0.45, rot=0.0, seed=11, n=320, core="#FFFFFF"):
    rnd = random.Random(seed)
    out = [f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(r * 0.16)}" ry="{f(r * 0.16 * tilt)}" fill="{core}" opacity="0.85"/>']
    for i in range(n):
        arm = i % arms
        t = rnd.random() ** 0.7
        ang = rot + arm * 2 * math.pi / arms + t * 3.4 + rnd.gauss(0, 0.22)
        rr = t * r
        x = cx + rr * math.cos(ang)
        y = cy + rr * math.sin(ang) * tilt
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(0.5, 1.9) * (1.2 - t))}" fill="{color}" opacity="{f(0.3 + 0.65 * (1 - t))}"/>')
    return "".join(out)


def nebula(card, name, cx, cy, rx, ry, c1, c2, op=0.8):
    fill = card.rgrad(name, [(0, c1, op), (0.5, c2, op * 0.5), (1, c2, 0)])
    card.add(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{fill}"/>')


def rays(cx, cy, r0, r1, n, color, w, a0=-60, a1=60, alternate=0.8):
    out = []
    for i in range(n):
        a = a0 + (a1 - a0) * i / max(1, n - 1)
        x1, y1 = pt(cx, cy, r0, a)
        x2, y2 = pt(cx, cy, r1 if i % 2 == 0 else r1 * alternate, a)
        out.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{color}" stroke-width="{w}" stroke-linecap="round"/>')
    return "".join(out)


def vignette(card, color, strength=0.75):
    card.add(f'<rect width="{W}" height="{H}" fill="{card.rgrad("vig", [(0.5, color, 0), (1, color, strength)], 0.5, 0.5, 0.78)}"/>')


def border(card, m, color, w, r=22, opacity=1):
    card.add(f'<rect x="{m}" y="{m}" width="{W - 2 * m}" height="{H - 2 * m}" rx="{r}" fill="none" stroke="{color}" stroke-width="{w}" opacity="{opacity}"/>')


def window_mask(card, name, inset=48, top=230, bottom=740, r=26):
    """Un masque qui garde la photo visible dans une fenêtre et cache le reste (pour les décorations pleines)."""
    card.def_once(
        name,
        f'<mask id="{card.id(name)}"><rect width="{W}" height="{H}" fill="#FFFFFF"/>'
        f'<rect x="{inset}" y="{top}" width="{W - 2 * inset}" height="{bottom - top}" rx="{r}" fill="#000000"/></mask>',
    )
    return f"url(#{card.id(name)})"


# ---------------------------------------------------------------- Adinkra (bibliothèque minimale)

def adinkrahene(cx, cy, s, color, w=4):
    """Adinkrahene - le roi des Adinkra : grandeur, charisme. Trois cercles concentriques."""
    return "".join(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * s)}" fill="none" stroke="{color}" stroke-width="{f(w * s)}"/>' for r in (8, 18, 28))


def nsoromma(cx, cy, s, color):
    """Nsoromma - l'enfant des cieux : une étoile, le gardien."""
    out = [f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(9 * s)}" fill="{color}"/>']
    for i in range(8):
        a = 45 * i
        x1, y1 = pt(cx, cy, 14 * s, a)
        x2, y2 = pt(cx, cy, 30 * s, a)
        lx, ly = pt(cx, cy, 22 * s, a - 12)
        out.append(f'<path d="M{f(x1)} {f(y1)} Q{f(lx)} {f(ly)} {f(x2)} {f(y2)}" fill="none" stroke="{color}" stroke-width="{f(4 * s)}" stroke-linecap="round"/>')
    return "".join(out)


def dwennimmen(cx, cy, s, color):
    """Dwennimmen - les cornes du bélier : force et humilité."""
    def horn(m):
        return (
            f"M{f(cx)} {f(cy - 4 * s)} C{f(cx + m * 18 * s)} {f(cy - 30 * s)} {f(cx + m * 46 * s)} {f(cy - 18 * s)} {f(cx + m * 44 * s)} {f(cy + 6 * s)} "
            f"C{f(cx + m * 42 * s)} {f(cy + 24 * s)} {f(cx + m * 22 * s)} {f(cy + 22 * s)} {f(cx + m * 22 * s)} {f(cy + 8 * s)} "
            f"C{f(cx + m * 22 * s)} {f(cy - 2 * s)} {f(cx + m * 32 * s)} {f(cy - 2 * s)} {f(cx + m * 32 * s)} {f(cy + 6 * s)}"
        )
    return (
        f'<path d="{horn(1)}" fill="none" stroke="{color}" stroke-width="{f(5 * s)}" stroke-linecap="round"/>'
        f'<path d="{horn(-1)}" fill="none" stroke="{color}" stroke-width="{f(5 * s)}" stroke-linecap="round"/>'
        f'<path d="M{f(cx)} {f(cy - 4 * s)} L{f(cx)} {f(cy + 30 * s)}" stroke="{color}" stroke-width="{f(5 * s)}" stroke-linecap="round"/>'
    )


def sankofa(cx, cy, s, color):
    """Sankofa - revenir chercher ce qu'on a laissé : le carnet de route."""
    return (
        f'<path d="M{f(cx)} {f(cy + 30 * s)} C{f(cx - 40 * s)} {f(cy + 6 * s)} {f(cx - 38 * s)} {f(cy - 26 * s)} {f(cx - 14 * s)} {f(cy - 24 * s)} '
        f'C{f(cx - 4 * s)} {f(cy - 23 * s)} {f(cx)} {f(cy - 14 * s)} {f(cx)} {f(cy - 10 * s)} C{f(cx)} {f(cy - 14 * s)} {f(cx + 4 * s)} {f(cy - 23 * s)} {f(cx + 14 * s)} {f(cy - 24 * s)} '
        f'C{f(cx + 38 * s)} {f(cy - 26 * s)} {f(cx + 40 * s)} {f(cy + 6 * s)} {f(cx)} {f(cy + 30 * s)} Z" fill="none" stroke="{color}" stroke-width="{f(4 * s)}"/>'
        f'<path d="M{f(cx - 14 * s)} {f(cy - 24 * s)} c{f(-10 * s)} {f(-8 * s)} {f(-4 * s)} {f(-20 * s)} {f(6 * s)} {f(-16 * s)}" fill="none" stroke="{color}" stroke-width="{f(4 * s)}" stroke-linecap="round"/>'
        f'<path d="M{f(cx + 14 * s)} {f(cy - 24 * s)} c{f(10 * s)} {f(-8 * s)} {f(4 * s)} {f(-20 * s)} {f(-6 * s)} {f(-16 * s)}" fill="none" stroke="{color}" stroke-width="{f(4 * s)}" stroke-linecap="round"/>'
        f'<circle cx="{f(cx - 22 * s)}" cy="{f(cy + 10 * s)}" r="{f(3.5 * s)}" fill="{color}"/><circle cx="{f(cx + 22 * s)}" cy="{f(cy + 10 * s)}" r="{f(3.5 * s)}" fill="{color}"/>'
    )


def akoma(cx, cy, s, color):
    """Akoma - le cœur : patience et endurance."""
    return (
        f'<path d="M{f(cx)} {f(cy + 26 * s)} C{f(cx - 36 * s)} {f(cy + 2 * s)} {f(cx - 30 * s)} {f(cy - 26 * s)} {f(cx)} {f(cy - 10 * s)} '
        f'C{f(cx + 30 * s)} {f(cy - 26 * s)} {f(cx + 36 * s)} {f(cy + 2 * s)} {f(cx)} {f(cy + 26 * s)} Z" fill="{color}"/>'
    )


def nkyinkyim(x0, y, x1, s, color, w=4):
    """Nkyinkyim - le chemin sinueux : l'initiative, la persévérance (une ligne brisée)."""
    pts = []
    x = x0
    up = True
    while x <= x1:
        pts.append(f"{f(x)} {f(y - (8 * s if up else -8 * s))}")
        x += 10 * s
        up = not up
    return f'<path d="M{" L".join(pts)}" fill="none" stroke="{color}" stroke-width="{f(w)}" stroke-linejoin="round"/>'
