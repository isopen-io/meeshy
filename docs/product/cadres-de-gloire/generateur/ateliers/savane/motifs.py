"""Savane d'or - motifs terrestres : silhouettes animales, flore, artisanat, effets de lumière.

Toutes les silhouettes sont définies dans un repère local (pieds à y = 0, face à droite) et posées
par `place()` (translation, échelle, miroir).
"""

import math
import random

from base import W, H, f, pt, esc, SANS, CINZEL, HAND, GARAMOND, CINZEL_DECO

# ---------------------------------------------------------------- palette

OCRE = "#C8742A"
TERRE = "#5A2410"
BRULE = "#3A1608"
NUIT = "#0B1230"
OR_CLAIR = "#FFE9A8"
OR = "#E8B53C"
OR_FONCE = "#8A5A12"
IVOIRE = "#FFF4DC"
SIL = "#1A0C06"


def place(markup, x, y, s=1.0, flip=False, rot=0, op=1):
    sx = -s if flip else s
    o = f' opacity="{f(op)}"' if op != 1 else ""
    r = f" rotate({f(rot)})" if rot else ""
    return f'<g transform="translate({f(x)} {f(y)}){r} scale({f(sx)} {f(s)})"{o}>{markup}</g>'


def rimmed(d, fill, rim=None, dx=1.4, dy=0.8, extra=""):
    """Une silhouette pleine, avec un liseré de lumière décalé (contre-jour)."""
    if not rim:
        return f'<path d="{d}" fill="{fill}"/>{extra}'
    return f'<path d="{d}" fill="{rim}"/><g transform="translate({f(dx)} {f(dy)})"><path d="{d}" fill="{fill}"/>{extra}</g>'


# ---------------------------------------------------------------- animaux (repère local, face à droite)

LION = (
    "M36 -72 C60 -78 95 -76 120 -80 C122 -96 138 -110 156 -108 C168 -106 176 -100 181 -92 "
    "L190 -86 C196 -82 199 -76 197 -71 L190 -67 C188 -62 184 -60 179 -60 "
    "C178 -52 173 -44 167 -40 C163 -36 161 -30 160 -24 L162 -5 C164 -2 168 -1 170 0 L151 0 L152 -5 "
    "L150 -26 L145 -26 L145 -5 L147 0 L131 0 L134 -6 L132 -34 C120 -38 92 -40 72 -38 "
    "L67 -30 C65 -20 66 -10 67 -5 L70 0 L54 0 L55 -6 C53 -16 48 -24 45 -30 L41 -6 L44 0 L28 0 L31 -6 "
    "C30 -22 27 -42 29 -56 C30 -64 32 -69 36 -72 Z"
)
LION_BODY = (
    "M36 -72 C60 -78 95 -76 124 -84 L150 -70 C163 -60 166 -48 164 -38 C161 -32 160 -28 160 -24 "
    "L162 -5 C164 -2 168 -1 170 0 L151 0 L152 -5 L150 -26 L145 -26 L145 -5 L147 0 L131 0 L134 -6 L132 -34 "
    "C120 -38 92 -40 72 -38 L67 -30 C65 -20 66 -10 67 -5 L70 0 L54 0 L55 -6 C53 -16 48 -24 45 -30 "
    "L41 -6 L44 0 L28 0 L31 -6 C30 -22 27 -42 29 -56 C30 -64 32 -69 36 -72 Z"
)
LION_TAIL = "M33 -68 C22 -60 14 -50 12 -36 C11 -28 8 -24 5 -22"

LION_ROAR = (
    "M36 -72 C60 -78 92 -78 116 -84 C114 -100 124 -118 140 -126 C150 -131 160 -132 166 -128 "
    "L176 -136 C180 -139 186 -137 184 -131 L178 -122 L188 -116 C192 -113 190 -108 186 -108 L176 -110 "
    "C178 -100 176 -90 170 -82 C168 -66 166 -52 162 -42 C160 -34 160 -28 160 -24 L162 -5 C164 -2 168 -1 170 0 L151 0 L152 -5 "
    "L150 -26 L145 -26 L145 -5 L147 0 L131 0 L134 -6 L132 -34 C120 -38 92 -40 72 -38 "
    "L67 -30 C65 -20 66 -10 67 -5 L70 0 L54 0 L55 -6 C53 -16 48 -24 45 -30 L41 -6 L44 0 L28 0 L31 -6 "
    "C30 -22 27 -42 29 -56 C30 -64 32 -69 36 -72 Z"
)

ELEPHANT = (
    "M22 -104 C24 -116 40 -122 56 -118 C74 -114 92 -116 108 -124 C124 -132 146 -134 160 -126 "
    "C172 -120 180 -110 180 -96 C181 -80 184 -60 186 -40 C188 -24 190 -12 196 -6 C199 -3 197 2 192 0 "
    "C184 -6 176 -24 174 -44 C173 -54 168 -60 162 -62 C160 -50 158 -30 160 -4 L162 0 L136 0 L138 -6 "
    "C136 -24 134 -38 130 -48 C110 -52 84 -52 66 -48 C62 -36 62 -20 64 -6 L66 0 L40 0 L42 -6 "
    "C40 -30 30 -50 24 -64 C18 -78 18 -94 22 -104 Z"
)
ELEPHANT_EAR = "M146 -122 C126 -122 116 -102 120 -82 C122 -68 132 -60 144 -62 C154 -64 158 -82 156 -102 C155 -112 152 -120 146 -122 Z"
ELEPHANT_TUSK = "M170 -64 C176 -55 186 -52 196 -58"
ELEPHANT_TAIL = "M21 -98 C14 -88 12 -74 13 -60"

GIRAFFE = (
    "M16 -138 C34 -146 54 -154 70 -162 L104 -236 C106 -244 110 -250 116 -252 C124 -254 132 -250 140 -244 "
    "C146 -240 146 -234 140 -232 C132 -232 124 -234 118 -232 C112 -230 106 -222 100 -208 L86 -150 "
    "C84 -140 82 -128 78 -118 L81 -5 L85 0 L76 0 L72 -110 L67 -110 L69 -5 L73 0 L64 0 L60 -112 "
    "C48 -112 36 -112 28 -114 L31 -5 L35 0 L26 0 L22 -110 L18 -110 L19 -5 L23 0 L14 0 L10 -118 "
    "C8 -126 10 -134 16 -138 Z"
)
GIRAFFE_EXTRA = (
    "M113 -251 L111 -263 M121 -253 L121 -264"
)
GIRAFFE_TAIL = "M14 -134 C8 -120 6 -104 6 -92"

ZEBRA = (
    "M18 -86 C40 -92 80 -92 104 -90 C112 -100 120 -112 130 -120 C134 -128 138 -132 142 -128 "
    "C152 -118 160 -104 164 -92 C166 -86 162 -82 156 -84 C150 -86 146 -90 140 -96 "
    "C134 -88 128 -74 118 -60 L120 -5 L124 0 L114 0 L110 -54 L104 -54 L106 -5 L110 0 L100 0 L96 -54 "
    "C80 -50 60 -50 46 -54 L44 -5 L48 0 L38 0 L36 -52 L30 -52 L30 -5 L34 0 L24 0 L20 -58 "
    "C14 -66 12 -78 18 -86 Z"
)

GNU = (
    "M18 -64 C38 -68 66 -74 92 -84 C104 -92 118 -98 130 -94 C140 -90 148 -82 154 -72 "
    "C160 -62 166 -50 168 -42 C169 -37 165 -35 161 -38 C156 -44 150 -52 145 -56 "
    "C142 -50 138 -44 132 -42 L130 -4 L133 0 L124 0 L121 -40 L116 -40 L117 -4 L120 0 L111 0 L108 -42 "
    "C90 -42 62 -40 44 -42 L42 -4 L45 0 L36 0 L33 -40 L28 -40 L28 -4 L31 0 L22 0 L18 -46 "
    "C14 -52 13 -60 18 -64 Z"
)
GNU_EXTRA = "M128 -94 C122 -102 116 -104 110 -100 M134 -94 C138 -104 145 -106 150 -101 M18 -62 C10 -54 8 -44 8 -34 M140 -58 L138 -48 M146 -60 L146 -50"

ANTELOPE = (
    "M14 -60 C30 -66 60 -66 78 -64 C84 -72 88 -80 92 -86 C94 -90 98 -92 102 -90 L108 -84 "
    "C110 -82 108 -78 104 -79 L98 -80 C94 -72 90 -62 86 -52 L88 -4 L91 0 L84 0 L80 -46 L76 -46 L78 -4 L81 0 L74 0 L70 -46 "
    "C56 -42 40 -42 30 -46 L28 -4 L31 0 L24 0 L22 -42 L18 -42 L18 -4 L21 0 L14 0 L12 -46 C8 -52 9 -57 14 -60 Z"
)
ANTELOPE_HORNS = "M98 -90 C96 -102 92 -110 86 -116 M102 -90 C102 -102 100 -112 96 -120"


def _mane(cx, cy, rx, ry, n=15, k=0.2, rot=-18, seed=12):
    rnd = random.Random(seed)
    def at(r, deg):
        a = math.radians(deg + rot)
        return f"{f(cx + rx * r * math.cos(a))} {f(cy + ry * r * math.sin(a))}"
    step = 360 / n
    d = [f"M{at(1, 0)}"]
    for i in range(n):
        a0 = i * step
        kk = k * rnd.uniform(0.6, 1.3)
        d.append(f"Q{at(1 + kk * 1.9, a0 + step * 0.62)} {at(1, a0 + step)}")
    return " ".join(d) + " Z"


LION_HEAD = "M168 -100 C176 -102 184 -98 190 -88 C196 -84 199 -78 197 -72 L190 -67 C187 -62 183 -60 177 -60 L166 -64 Z"
LION_HEAD_ROAR = "M158 -108 C166 -116 180 -116 188 -111 L198 -106 C202 -104 203 -100 200 -98 L186 -93 L197 -87 C199 -84 197 -80 193 -79 C186 -77 178 -76 170 -78 L156 -90 Z"
LION_FANGS = "M195 -99 L193 -94 L191 -99 Z M191 -86 L189 -90 L187 -85 Z"


def lion(fill, rim=None, roar=False):
    """Lion (Panthera leo) de profil ; `roar` : tête levée, gueule ouverte, crocs."""
    head = LION_HEAD_ROAR if roar else LION_HEAD
    mane = _mane(148, -86, 34, 40, n=17, k=0.24, rot=-40, seed=5) if roar else _mane(150, -78, 30, 36, rot=-18)
    tail = f'<path d="{LION_TAIL}" fill="none" stroke="{fill}" stroke-width="3.2" stroke-linecap="round"/><ellipse cx="5" cy="-21" rx="4" ry="5" fill="{fill}"/>'
    ear = f'<path d="M{164 if roar else 168} {-112 if roar else -100} L{168 if roar else 172} {-120 if roar else -108} L{173 if roar else 176} {-111 if roar else -99} Z" fill="{fill}"/>'
    shapes = f'<path d="{LION_BODY}"/><path d="{mane}"/><path d="{head}"/>'
    fangs = f'<path d="{LION_FANGS}" fill="{rim or "#F4E3C4"}" transform="translate(1.4 0.8)"/>' if roar else ""
    if rim:
        return (
            f'<g fill="{rim}">{shapes}{ear}</g>'
            f'<g transform="translate(1.4 0.8)" fill="{fill}">{tail}{shapes}{ear}</g>{fangs}'
        )
    return f'<g fill="{fill}">{tail}{shapes}{ear}</g>{fangs}'


def elephant(fill, rim=None, tusk="#F4E3C4", ear=None):
    extra = (
        f'<path d="{ELEPHANT_TAIL}" fill="none" stroke="{fill}" stroke-width="2.6" stroke-linecap="round"/>'
        f'<path d="{ELEPHANT_EAR}" fill="{ear or fill}" stroke="{rim or fill}" stroke-width="1.2" stroke-opacity="0.55"/>'
        f'<path d="{ELEPHANT_TUSK}" fill="none" stroke="{tusk}" stroke-width="4.2" stroke-linecap="round"/>'
    )
    return rimmed(ELEPHANT, fill, rim, extra=extra)


def giraffe(fill, rim=None):
    extra = (
        f'<path d="{GIRAFFE_EXTRA}" stroke="{fill}" stroke-width="3" stroke-linecap="round"/>'
        f'<circle cx="111" cy="-264" r="2.6" fill="{fill}"/><circle cx="121" cy="-265" r="2.6" fill="{fill}"/>'
        f'<path d="M110 -246 L98 -250 L106 -242 Z" fill="{fill}"/>'
        f'<path d="{GIRAFFE_TAIL}" fill="none" stroke="{fill}" stroke-width="2" stroke-linecap="round"/><ellipse cx="6" cy="-90" rx="2.5" ry="5" fill="{fill}"/>'
    )
    return rimmed(GIRAFFE, fill, rim, extra=extra)


def zebra(fill, rim=None):
    return rimmed(ZEBRA, fill, rim, extra=f'<path d="M18 -82 C10 -74 8 -62 9 -52" fill="none" stroke="{fill}" stroke-width="2.4" stroke-linecap="round"/>')


def gnu(fill, rim=None):
    """Gnou bleu (Connochaetes taurinus), l'animal de la Grande Migration du Serengeti."""
    return rimmed(GNU, fill, rim, extra=f'<path d="{GNU_EXTRA}" fill="none" stroke="{fill}" stroke-width="2.6" stroke-linecap="round"/>')


def outline(d, stroke, w=1.2, fill=None, fop=0.12, extra=None):
    """Une silhouette en trait lumineux - l'animal devenu lumière."""
    x = f'<path d="{extra}" fill="none" stroke="{stroke}" stroke-width="{w}" stroke-linecap="round"/>' if extra else ""
    return f'<path d="{d}" fill="{fill or stroke}" fill-opacity="{fop}" stroke="{stroke}" stroke-width="{w}" stroke-linejoin="round"/>{x}'


def antelope(fill, rim=None):
    return rimmed(ANTELOPE, fill, rim, extra=f'<path d="{ANTELOPE_HORNS}" fill="none" stroke="{fill}" stroke-width="2.6" stroke-linecap="round"/>')


def crane(fill, crown="#E8B53C", rim=None, wings=False, cheek="#F4F1EA", wattle="#C8102E", wing_fill=None):
    """Grue royale (Balearica regulorum) : corps fuselé, cou en S, couronne de soies dorées ; ailes ouvertes pour la danse."""
    body = ("M95 -92 C96 -80 88 -68 70 -64 C52 -61 36 -64 26 -68 C18 -70 10 -72 5 -77 "
            "C12 -81 16 -86 22 -90 C34 -100 56 -106 76 -104 C86 -103 93 -99 95 -92 Z")
    neck = "M86 -98 C96 -112 90 -126 97 -138 C99 -143 101 -146 104 -148"
    out = []
    if wings:
        far = ("M80 -100 C92 -128 110 -152 132 -178 Q130 -166 121 -161 Q128 -152 117 -148 "
               "Q122 -139 110 -137 Q113 -127 101 -125 L94 -104 Z")
        near = ("M68 -98 C60 -124 50 -150 34 -180 Q47 -178 52 -167 Q61 -169 63 -157 Q72 -159 74 -147 "
                "Q83 -147 85 -135 Q94 -133 93 -121 L92 -100 Z")
        out.append(f'<path d="{far}" fill="{wing_fill or fill}" opacity="0.88"/>')
        out.append(f'<path d="{near}" fill="{wing_fill or fill}"/>')
        out.append(f'<path d="M66 -104 C62 -122 56 -138 50 -150 Q60 -148 66 -138 Q74 -134 80 -122 L86 -106 Z" fill="{cheek}" opacity="0.32"/>')
        out.append(f'<path d="M38 -176 Q47 -175 51 -166 Q60 -167 62 -157" fill="none" stroke="{crown}" stroke-width="1.6" opacity="0.8"/>')
    out.append(f'<path d="{body}" fill="{fill}"/>')
    out.append(f'<path d="M36 -94 C52 -100 70 -100 86 -94" fill="none" stroke="{cheek}" stroke-width="2.2" opacity="0.4"/>')
    out.append(f'<path d="{neck}" fill="none" stroke="{fill}" stroke-width="6.5" stroke-linecap="round"/>')
    out.append(f'<circle cx="106" cy="-150" r="6.2" fill="{fill}"/>')
    out.append(f'<path d="M110 -153 L123 -147 L110 -145 Z" fill="{fill}"/>')
    out.append(f'<ellipse cx="105" cy="-150" rx="2.5" ry="3.4" fill="{cheek}" opacity="0.92"/>')
    out.append(f'<ellipse cx="109" cy="-142" rx="1.5" ry="2.5" fill="{wattle}"/>')
    out.append(f'<path d="M62 -64 L60 -32 L62 0 M71 -64 L73 -32 L69 0" fill="none" stroke="{fill}" stroke-width="2.6" stroke-linecap="round"/>')
    for i in range(17):
        a = -70 + i * 8.5
        x1, y1 = pt(103, -156, 2, a)
        x2, y2 = pt(103, -156, 19 + 4 * math.sin(i * 1.7), a)
        out.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{crown}" stroke-width="1.3" stroke-linecap="round"/>')
        out.append(f'<circle cx="{f(x2)}" cy="{f(y2)}" r="1.6" fill="{crown}"/>')
    if rim:
        out.insert(0, f'<g transform="translate(-1.4 -0.8)"><path d="{body}" fill="{rim}"/><path d="{neck}" fill="none" stroke="{rim}" stroke-width="6.5"/></g>')
    return "".join(out)


def flyer(x, y, s, color, flap=1.0, op=1):
    """Un oiseau en vol, battement d'ailes (silhouette en m)."""
    k = 6 * flap
    return (
        f'<path d="M{f(x - 12 * s)} {f(y - 1 * s)} Q{f(x - 6 * s)} {f(y - k * s)} {f(x)} {f(y + 1.5 * s)} '
        f'Q{f(x + 6 * s)} {f(y - k * s)} {f(x + 12 * s)} {f(y - 1 * s)} Q{f(x + 6 * s)} {f(y - k * 0.4 * s)} {f(x)} {f(y + 3.4 * s)} '
        f'Q{f(x - 6 * s)} {f(y - k * 0.4 * s)} {f(x - 12 * s)} {f(y - 1 * s)} Z" fill="{color}" opacity="{f(op)}"/>'
    )


def flock(cx, cy, n, spread, seed, color, smin=0.5, smax=1.1, vshape=False):
    rnd = random.Random(seed)
    out = []
    for i in range(n):
        if vshape:
            side = 1 if i % 2 else -1
            k = (i + 1) // 2
            x, y = cx + side * k * spread * 0.12, cy + k * spread * 0.07
        else:
            x, y = cx + rnd.gauss(0, spread * 0.5), cy + rnd.gauss(0, spread * 0.22)
        out.append(flyer(x, y, rnd.uniform(smin, smax), color, rnd.uniform(0.4, 1.2)))
    return "".join(out)


# ---------------------------------------------------------------- flore

def _taper(x0, y0, x1, y1, w0, w1, color):
    a = math.atan2(y1 - y0, x1 - x0) + math.pi / 2
    c, s = math.cos(a), math.sin(a)
    return (
        f'<path d="M{f(x0 + c * w0 / 2)} {f(y0 + s * w0 / 2)} L{f(x1 + c * w1 / 2)} {f(y1 + s * w1 / 2)} '
        f'L{f(x1 - c * w1 / 2)} {f(y1 - s * w1 / 2)} L{f(x0 - c * w0 / 2)} {f(y0 - s * w0 / 2)} Z" fill="{color}"/>'
        f'<circle cx="{f(x1)}" cy="{f(y1)}" r="{f(w1 / 2)}" fill="{color}"/>'
    )


def baobab(x, gy, h, color, seed=1, spread=1.0, lean=0.0, crown=1.0):
    """Baobab (Adansonia digitata) : tronc-bouteille massif, couronne de branches courtes et noueuses comme des racines."""
    rnd = random.Random(seed)
    w = h * 0.46
    top = gy - h * 0.56
    tw, tt = w * 0.5, w * 0.36
    lx = lean * h
    d = (
        f"M{f(x - tw * 1.12)} {f(gy)} C{f(x - tw * 0.96)} {f(gy - h * 0.06)} {f(x - tw * 1.06)} {f(gy - h * 0.3)} {f(x - tt * 1.08 + lx * 0.5)} {f(top + h * 0.12)} "
        f"C{f(x - tt * 0.98 + lx)} {f(top + h * 0.04)} {f(x - tt + lx)} {f(top + 2)} {f(x - tt + lx)} {f(top)} "
        f"L{f(x + tt + lx)} {f(top)} C{f(x + tt * 1.02 + lx)} {f(top + h * 0.05)} {f(x + tt * 1.1 + lx * 0.5)} {f(top + h * 0.13)} {f(x + tw * 1.04)} {f(gy - h * 0.3)} "
        f"C{f(x + tw * 1.0)} {f(gy - h * 0.08)} {f(x + tw * 1.16)} {f(gy - 2)} {f(x + tw * 1.2)} {f(gy)} Z"
    )
    out = [f'<path d="{d}" fill="{color}"/>']

    def branch(x0, y0, ang, ln, wd, depth):
        mid_a = ang + rnd.uniform(-16, 16)
        xm, ym = pt(x0, y0, ln * 0.5, ang)
        x1, y1 = pt(xm, ym, ln * 0.5, mid_a)
        out.append(_taper(x0, y0, xm, ym, wd, wd * 0.82, color))
        out.append(_taper(xm, ym, x1, y1, wd * 0.82, wd * 0.6, color))
        if depth > 0:
            for _ in range(rnd.choice((2, 3, 3))):
                na = mid_a + rnd.uniform(-34, 34)
                na = max(-95, min(95, na))
                branch(x1, y1, na, ln * rnd.uniform(0.5, 0.7), wd * 0.58, depth - 1)
        else:
            for _ in range(rnd.choice((2, 3))):
                x2, y2 = pt(x1, y1, ln * rnd.uniform(0.35, 0.6), mid_a + rnd.uniform(-35, 35))
                out.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{color}" stroke-width="{f(max(0.7, wd * 0.32))}" stroke-linecap="round"/>')

    n = rnd.choice((6, 7, 7, 8))
    for i in range(n):
        u = (i - (n - 1) / 2) / ((n - 1) / 2)
        base_a = u * 74 * spread + rnd.uniform(-7, 7)
        bx = x + lx + u * tt * 0.82
        by = top + 6 + abs(u) * h * 0.04
        branch(bx, by, base_a, h * rnd.uniform(0.13, 0.19) * crown, tt * 0.56, 2)
    return "".join(out)


def acacia(x, gy, h, color, seed=2, width=None, lean=0.0):
    """Acacia parasol (Vachellia tortilis) : tronc fourchu, couronne plate, mince et très large."""
    rnd = random.Random(seed)
    cw = width or h * 1.9
    ctop = gy - h
    tx = x + lean * h * 0.35
    fork = gy - h * 0.38
    out = [_taper(x, gy, tx, fork, h * 0.075, h * 0.05, color)]
    stems = rnd.choice((3, 4, 4))
    for k in range(stems):
        u = (k - (stems - 1) / 2) / ((stems - 1) / 2)
        ex = tx + u * cw * 0.3 + rnd.uniform(-5, 5)
        ey = ctop + h * 0.1
        mx, my = (tx + ex) / 2 + rnd.uniform(-6, 6), (fork + ey) / 2
        out.append(_taper(tx, fork, mx, my, h * 0.045, h * 0.03, color))
        out.append(_taper(mx, my, ex, ey, h * 0.03, h * 0.016, color))
        for _ in range(3):
            fx = ex + rnd.uniform(-cw * 0.13, cw * 0.13)
            out.append(f'<line x1="{f(ex)}" y1="{f(ey)}" x2="{f(fx)}" y2="{f(ctop + h * 0.05)}" stroke="{color}" stroke-width="{f(h * 0.011)}" stroke-linecap="round"/>')
    for _ in range(70):
        t = rnd.uniform(-1, 1)
        cx = tx + t * cw * 0.5
        thick = max(0.15, 1 - t ** 4)
        ry = rnd.uniform(h * 0.028, h * 0.05) * thick
        cy = ctop + ry * 0.9 + rnd.uniform(-1, 1) + (h * 0.02 * thick if rnd.random() < 0.4 else 0)
        rx = rnd.uniform(cw * 0.05, cw * 0.1) * (0.6 + 0.4 * thick)
        out.append(f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{color}"/>')
    for _ in range(26):
        t = rnd.uniform(-0.9, 0.9)
        cx = tx + t * cw * 0.5
        out.append(f'<ellipse cx="{f(cx)}" cy="{f(ctop + h * 0.075 + rnd.uniform(0, h * 0.03))}" rx="{f(rnd.uniform(cw * 0.02, cw * 0.05))}" ry="{f(h * 0.022)}" fill="{color}"/>')
    return "".join(out)


def grass(x0, x1, gy, hmin, hmax, color, seed=3, n=None, width=1.6, heads=0.25, op=1):
    rnd = random.Random(seed)
    n = n or int((x1 - x0) / 2.2)
    out = []
    for _ in range(n):
        x = rnd.uniform(x0, x1)
        h = rnd.uniform(hmin, hmax)
        bend = rnd.uniform(-0.35, 0.35) * h
        out.append(f'<path d="M{f(x)} {f(gy)} Q{f(x + bend * 0.2)} {f(gy - h * 0.6)} {f(x + bend)} {f(gy - h)}" fill="none" stroke="{color}" stroke-width="{f(rnd.uniform(0.6, 1.0) * width)}" stroke-linecap="round"/>')
        if rnd.random() < heads:
            hx, hy = x + bend, gy - h
            ang = math.degrees(math.atan2(bend, h)) if h else 0
            out.append(f'<ellipse cx="{f(hx)}" cy="{f(hy - 5)}" rx="{f(width * 1.3)}" ry="7" fill="{color}" transform="rotate({f(ang)} {f(hx)} {f(hy)})"/>')
    o = f' opacity="{f(op)}"' if op != 1 else ""
    return f"<g{o}>{''.join(out)}</g>"


def termite_mound(x, gy, h, color, seed=4):
    """Termitière-cathédrale (Macrotermes) : flèches de terre accolées."""
    rnd = random.Random(seed)
    out = []
    spires = rnd.choice((3, 4, 5))
    for i in range(spires):
        sx = x + (i - (spires - 1) / 2) * h * 0.16 + rnd.uniform(-4, 4)
        sh = h * (1.0 if i == spires // 2 else rnd.uniform(0.45, 0.8))
        sw = h * rnd.uniform(0.12, 0.2)
        tip = sx + rnd.uniform(-sw * 0.3, sw * 0.3)
        out.append(
            f'<path d="M{f(sx - sw)} {f(gy)} C{f(sx - sw * 0.9)} {f(gy - sh * 0.5)} {f(tip - sw * 0.25)} {f(gy - sh * 0.85)} {f(tip)} {f(gy - sh)} '
            f'C{f(tip + sw * 0.25)} {f(gy - sh * 0.85)} {f(sx + sw * 0.9)} {f(gy - sh * 0.5)} {f(sx + sw)} {f(gy)} Z" fill="{color}"/>'
        )
    out.append(f'<ellipse cx="{f(x)}" cy="{f(gy)}" rx="{f(h * 0.42)}" ry="{f(h * 0.06)}" fill="{color}"/>')
    return "".join(out)


def kopje(x, gy, w, h, color, seed=5):
    """Kopje : un chaos de granite arrondi qui émerge de la plaine."""
    rnd = random.Random(seed)
    out = []
    for i in range(6):
        bx = x + rnd.uniform(-w * 0.4, w * 0.4)
        bw = w * rnd.uniform(0.25, 0.45)
        bh = h * rnd.uniform(0.4, 1.0) * (1 - abs(bx - x) / w)
        out.append(f'<ellipse cx="{f(bx)}" cy="{f(gy - bh * 0.4)}" rx="{f(bw)}" ry="{f(bh * 0.6)}" fill="{color}"/>')
    out.append(f'<path d="M{f(x - w * 0.62)} {f(gy)} Q{f(x - w * 0.3)} {f(gy - h * 0.9)} {f(x + w * 0.05)} {f(gy - h)} Q{f(x + w * 0.4)} {f(gy - h * 0.8)} {f(x + w * 0.62)} {f(gy)} Z" fill="{color}"/>')
    return "".join(out)


def weaver_nest(x, y, s, color):
    """Nid de tisserin suspendu."""
    return (
        f'<line x1="{f(x)}" y1="{f(y - 10 * s)}" x2="{f(x)}" y2="{f(y)}" stroke="{color}" stroke-width="{f(1.2 * s)}"/>'
        f'<path d="M{f(x)} {f(y)} C{f(x + 9 * s)} {f(y)} {f(x + 11 * s)} {f(y + 14 * s)} {f(x + 6 * s)} {f(y + 20 * s)} '
        f'L{f(x + 4 * s)} {f(y + 28 * s)} L{f(x)} {f(y + 28 * s)} L{f(x)} {f(y + 20 * s)} C{f(x - 8 * s)} {f(y + 18 * s)} {f(x - 9 * s)} {f(y)} {f(x)} {f(y)} Z" fill="{color}"/>'
    )


# ---------------------------------------------------------------- lumière et poussière

def dust(seed, n, region, color, rmin=0.4, rmax=2.0, keep=True, opmin=0.25, opmax=0.9):
    rnd = random.Random(seed)
    x0, y0, x1, y1 = region
    out = []
    for _ in range(n):
        x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
        if keep and 100 < x < 440 and 300 < y < 700:
            continue
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(rnd.uniform(rmin, rmax))}" fill="{color}" opacity="{f(rnd.uniform(opmin, opmax))}"/>')
    return "".join(out)


def sun(card, name, cx, cy, r, core="#FFF7D6", mid="#FFC24A", edge="#F0662A", halo="#FF9A3C", haze=True, haze_color="#5A1E0C"):
    out = []
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 3.2)}" fill="{card.rgrad(name + "-h2", [(0, halo, 0.42), (0.35, halo, 0.16), (1, halo, 0)])}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.5)}" fill="{card.rgrad(name + "-h1", [(0.55, "#FFE1A0", 0.6), (1, "#FFE1A0", 0)])}"/>')
    out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{card.rgrad(name + "-d", [(0, core, 1), (0.55, mid, 1), (1, edge, 1)], 0.5, 0.42, 0.62)}"/>')
    if haze:
        for i, (dy, hh, op) in enumerate(((0.18, 0.05, 0.28), (0.36, 0.07, 0.34), (0.55, 0.06, 0.4), (0.72, 0.09, 0.45))):
            y = cy + r * dy
            half = math.sqrt(max(0, r * r - (y - cy) ** 2)) + 6
            out.append(f'<rect x="{f(cx - half)}" y="{f(y)}" width="{f(2 * half)}" height="{f(r * hh)}" rx="{f(r * hh / 2)}" fill="{haze_color}" opacity="{f(op)}"/>')
    return "".join(out)


def light_rays(card, name, cx, cy, n, r1, color, a0=-90, a1=90, width=7, op=0.35, seed=9, blend=True):
    """Des rais de lumière en éventail, qui s'éteignent en s'éloignant."""
    rnd = random.Random(seed)
    gid = card.id(name)
    card.def_once(
        name,
        f'<radialGradient id="{gid}" gradientUnits="userSpaceOnUse" cx="{f(cx)}" cy="{f(cy)}" r="{f(r1)}">'
        f'<stop offset="0" stop-color="{color}" stop-opacity="{op}"/><stop offset="0.55" stop-color="{color}" stop-opacity="{op * 0.4}"/>'
        f'<stop offset="1" stop-color="{color}" stop-opacity="0"/></radialGradient>',
    )
    out = []
    for i in range(n):
        a = a0 + (a1 - a0) * (i + 0.5) / n + rnd.uniform(-2, 2)
        wd = width * rnd.uniform(0.5, 1.4)
        x1, y1 = pt(cx, cy, r1, a - wd / 2)
        x2, y2 = pt(cx, cy, r1, a + wd / 2)
        out.append(f'<path d="M{f(cx)} {f(cy)} L{f(x1)} {f(y1)} L{f(x2)} {f(y2)} Z"/>')
    st = ' style="mix-blend-mode:screen"' if blend else ""
    return f'<g fill="url(#{gid})"{st}>{"".join(out)}</g>'


# ---------------------------------------------------------------- filtres

def bevel(card, name="bevel", blur=1.6, scale=3.2, light="#FFF6D8", spec=1.1, exp=18, shadow=True, sd=3, dy=3, sop=0.6):
    """Un relief métallique : éclairage spéculaire sur l'alpha flouté, ombre portée en dessous."""
    sh = (
        f'<feGaussianBlur in="SourceAlpha" stdDeviation="{sd}" result="sb"/><feOffset in="sb" dy="{dy}" result="so"/>'
        f'<feComponentTransfer in="so" result="sop"><feFuncA type="linear" slope="{sop}"/></feComponentTransfer>'
        if shadow else ""
    )
    merge = '<feMergeNode in="sop"/>' if shadow else ""
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">'
        f'<feGaussianBlur in="SourceAlpha" stdDeviation="{blur}" result="b"/>'
        f'<feSpecularLighting in="b" surfaceScale="{scale}" specularConstant="{spec}" specularExponent="{exp}" lighting-color="{light}" result="s">'
        f'<feDistantLight azimuth="235" elevation="42"/></feSpecularLighting>'
        f'<feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>'
        f'<feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k1="0" k2="1" k3="0.85" k4="0" result="lit"/>'
        f'{sh}<feMerge>{merge}<feMergeNode in="lit"/></feMerge></filter>',
    )
    return f"url(#{card.id(name)})"


def noise_layer(card, name, region, freq="0.006 0.028", octaves=4, seed=3, a=2.6, b=-1.15, fill=None):
    """Une couche de nuages / brume : bruit fractal découpé dans la forme `fill` (couleur et alpha de la source)."""
    x, y, w, h = region
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" filterUnits="userSpaceOnUse" x="{x}" y="{y}" width="{w}" height="{h}" color-interpolation-filters="sRGB">'
        f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="{octaves}" seed="{seed}" result="n"/>'
        f'<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  {a} 0 0 0 {b}" result="m"/>'
        f'<feComposite in="SourceGraphic" in2="m" operator="in"/></filter>',
    )
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" filter="url(#{card.id(name)})"/>'


def grain(card, name="grain", op=0.08, region=(0, 0, W, H)):
    x, y, w, h = region
    card.def_once(
        name,
        f'<filter id="{card.id(name)}" filterUnits="userSpaceOnUse" x="{x}" y="{y}" width="{w}" height="{h}">'
        f'<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5"/>'
        f'<feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="{op}"/></feComponentTransfer></filter>',
    )
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" filter="url(#{card.id(name)})" style="mix-blend-mode:overlay"/>'


# ---------------------------------------------------------------- artisanat

def bogolan_band(x, y, w, h, bg, ink, seed=6, cell=None):
    """Bande de bogolan (Mali) : cases alternées - points, croix, chevrons, carrés concentriques, peignes."""
    rnd = random.Random(seed)
    cell = cell or h
    out = [f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="{bg}"/>']
    n = int(w // cell)
    pad = (w - n * cell) / 2
    kinds = ["dots", "cross", "chev", "sq", "comb", "diamond"]
    for i in range(n):
        cx = x + pad + i * cell + cell / 2
        cy = y + h / 2
        k = kinds[(i + seed) % len(kinds)] if i % 2 == 0 else ("dots" if i % 4 == 1 else "bar")
        r = cell * 0.32
        if k == "dots":
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if (dx + dy) % 2 == 0:
                        out.append(f'<circle cx="{f(cx + dx * r * 0.7)}" cy="{f(cy + dy * r * 0.7)}" r="{f(cell * 0.06)}" fill="{ink}"/>')
        elif k == "cross":
            out.append(f'<path d="M{f(cx - r)} {f(cy - r)} L{f(cx + r)} {f(cy + r)} M{f(cx + r)} {f(cy - r)} L{f(cx - r)} {f(cy + r)}" stroke="{ink}" stroke-width="{f(cell * 0.09)}" stroke-linecap="round"/>')
        elif k == "chev":
            for j in (-1, 0, 1):
                out.append(f'<path d="M{f(cx - r)} {f(cy + j * r * 0.6 + r * 0.25)} L{f(cx)} {f(cy + j * r * 0.6 - r * 0.25)} L{f(cx + r)} {f(cy + j * r * 0.6 + r * 0.25)}" fill="none" stroke="{ink}" stroke-width="{f(cell * 0.06)}"/>')
        elif k == "sq":
            for rr in (r, r * 0.55):
                out.append(f'<rect x="{f(cx - rr)}" y="{f(cy - rr)}" width="{f(2 * rr)}" height="{f(2 * rr)}" fill="none" stroke="{ink}" stroke-width="{f(cell * 0.06)}"/>')
            out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(cell * 0.06)}" fill="{ink}"/>')
        elif k == "comb":
            out.append(f'<line x1="{f(cx - r)}" y1="{f(cy - r)}" x2="{f(cx + r)}" y2="{f(cy - r)}" stroke="{ink}" stroke-width="{f(cell * 0.07)}"/>')
            for j in range(5):
                xx = cx - r + j * r / 2
                out.append(f'<line x1="{f(xx)}" y1="{f(cy - r)}" x2="{f(xx)}" y2="{f(cy + r)}" stroke="{ink}" stroke-width="{f(cell * 0.05)}"/>')
        elif k == "diamond":
            out.append(f'<path d="M{f(cx)} {f(cy - r)} L{f(cx + r)} {f(cy)} L{f(cx)} {f(cy + r)} L{f(cx - r)} {f(cy)} Z" fill="none" stroke="{ink}" stroke-width="{f(cell * 0.06)}"/>')
            out.append(f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(cell * 0.07)}" fill="{ink}"/>')
        else:
            out.append(f'<line x1="{f(cx)}" y1="{f(cy - r * 1.1)}" x2="{f(cx)}" y2="{f(cy + r * 1.1)}" stroke="{ink}" stroke-width="{f(cell * 0.05)}"/>')
    out.append(f'<line x1="{f(x)}" y1="{f(y + 1)}" x2="{f(x + w)}" y2="{f(y + 1)}" stroke="{ink}" stroke-width="1.4"/>')
    out.append(f'<line x1="{f(x)}" y1="{f(y + h - 1)}" x2="{f(x + w)}" y2="{f(y + h - 1)}" stroke="{ink}" stroke-width="1.4"/>')
    return "".join(out)


MAASAI = ["#C8102E", "#F4F1EA", "#1F4FA8", "#F08A1C", "#1F7A3A", "#F4C430", "#F4F1EA", "#C8102E", "#101010"]


def maasai_collar(cx, cy, r0, rings, bead, a0=-90, a1=90, colors=MAASAI, block=6, gap=1.15, shine=True):
    """Collier perlé maasaï : anneaux concentriques de perles, couleurs en blocs alternés."""
    out = []
    for k in range(rings):
        r = r0 + k * bead * 2 * gap
        circ = math.radians(a1 - a0) * r
        n = int(circ / (bead * 2.25))
        for i in range(n + 1):
            a = a0 + (a1 - a0) * i / max(1, n)
            x, y = pt(cx, cy, r, a)
            c = colors[((i // block) + k) % len(colors)]
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(bead)}" fill="{c}"/>')
            if shine:
                out.append(f'<circle cx="{f(x - bead * 0.3)}" cy="{f(y - bead * 0.35)}" r="{f(bead * 0.32)}" fill="#FFFFFF" opacity="0.55"/>')
    return "".join(out)


def bead_line(x0, y0, x1, y1, bead, colors=MAASAI, block=5, shine=True):
    n = int(math.hypot(x1 - x0, y1 - y0) / (bead * 2.25))
    out = []
    for i in range(n + 1):
        t = i / max(1, n)
        x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(bead)}" fill="{colors[(i // block) % len(colors)]}"/>')
        if shine:
            out.append(f'<circle cx="{f(x - bead * 0.3)}" cy="{f(y - bead * 0.35)}" r="{f(bead * 0.3)}" fill="#FFFFFF" opacity="0.5"/>')
    return "".join(out)


KENTE = ["#E8B53C", "#1F7A3A", "#C8102E", "#101010"]


def kente_band(x, y, w, h, seed=8, palette=KENTE):
    """Bande de kente (Ashanti, Ghana) : chaîne rayée, blocs de trame alternés."""
    rnd = random.Random(seed)
    out = [f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="{palette[0]}"/>']
    bw = h * 1.2
    n = int(w // bw) + 1
    for i in range(n):
        bx = x + i * bw
        if i % 2 == 0:
            for j in range(6):
                c = palette[(j + i // 2) % len(palette)]
                out.append(f'<rect x="{f(bx)}" y="{f(y + j * h / 6)}" width="{f(bw)}" height="{f(h / 12)}" fill="{c}"/>')
        else:
            c = palette[1 + (i // 2) % (len(palette) - 1)]
            out.append(f'<rect x="{f(bx)}" y="{f(y)}" width="{f(bw)}" height="{f(h)}" fill="{c}"/>')
            out.append(f'<path d="M{f(bx + bw * 0.2)} {f(y + h / 2)} L{f(bx + bw / 2)} {f(y + h * 0.2)} L{f(bx + bw * 0.8)} {f(y + h / 2)} L{f(bx + bw / 2)} {f(y + h * 0.8)} Z" fill="{palette[0]}"/>')
            for j in range(4):
                out.append(f'<rect x="{f(bx + j * bw / 4)}" y="{f(y)}" width="{f(bw / 12)}" height="{f(h)}" fill="{palette[3]}" opacity="0.5"/>')
    clip = f"kclip{seed}"
    return f'<g>{"".join(out)}</g>'


def tuareg_cross(cx, cy, s, color, w=3):
    """Croix d'Agadez (Touaregs, Niger) : anneau au sommet, bras en losange."""
    return (
        f'<g fill="none" stroke="{color}" stroke-width="{f(w * s)}" stroke-linejoin="round">'
        f'<circle cx="{f(cx)}" cy="{f(cy - 24 * s)}" r="{f(9 * s)}"/>'
        f'<path d="M{f(cx)} {f(cy - 15 * s)} L{f(cx + 9 * s)} {f(cy + 4 * s)} L{f(cx)} {f(cy + 30 * s)} L{f(cx - 9 * s)} {f(cy + 4 * s)} Z"/>'
        f'<path d="M{f(cx - 22 * s)} {f(cy - 4 * s)} L{f(cx - 9 * s)} {f(cy + 4 * s)} M{f(cx + 22 * s)} {f(cy - 4 * s)} L{f(cx + 9 * s)} {f(cy + 4 * s)}"/>'
        f'<circle cx="{f(cx - 24 * s)}" cy="{f(cy - 5 * s)}" r="{f(3 * s)}" fill="{color}"/><circle cx="{f(cx + 24 * s)}" cy="{f(cy - 5 * s)}" r="{f(3 * s)}" fill="{color}"/>'
        f'<circle cx="{f(cx)}" cy="{f(cy + 4 * s)}" r="{f(3 * s)}" fill="{color}"/></g>'
    )


def baobab_tall(x, gy, top, base_w, top_w, color, seed=1, blen=60, a0=-60, a1=70, n=7, depth=2, bw=None, flip=False, twigs=(2, 3), twig_len=(0.35, 0.6), tips=None):
    """Un baobab dont on règle le tronc (hauteur, largeurs) et l'éventail de la couronne - pour border un cadre."""
    rnd = random.Random(seed)
    m = -1 if flip else 1
    d = (
        f"M{f(x - m * base_w / 2)} {f(gy)} C{f(x - m * base_w * 0.46)} {f(gy - (gy - top) * 0.4)} {f(x - m * top_w * 0.62)} {f(top + (gy - top) * 0.25)} {f(x - m * top_w / 2)} {f(top)} "
        f"L{f(x + m * top_w / 2)} {f(top)} C{f(x + m * top_w * 0.62)} {f(top + (gy - top) * 0.25)} {f(x + m * base_w * 0.48)} {f(gy - (gy - top) * 0.4)} {f(x + m * base_w / 2)} {f(gy)} Z"
    )
    out = [f'<path d="{d}" fill="{color}"/>']
    bw = bw or top_w * 0.34

    def branch(x0, y0, ang, ln, wd, dep):
        mid_a = ang + rnd.uniform(-14, 14)
        xm, ym = pt(x0, y0, ln * 0.5, ang)
        x1, y1 = pt(xm, ym, ln * 0.5, mid_a)
        out.append(_taper(x0, y0, xm, ym, wd, wd * 0.82, color))
        out.append(_taper(xm, ym, x1, y1, wd * 0.82, wd * 0.6, color))
        if tips is not None:
            tips.append((x1, y1, dep))
        if dep > 0:
            for _ in range(rnd.choice((2, 3, 3))):
                na = max(-110, min(110, mid_a + rnd.uniform(-34, 34)))
                branch(x1, y1, na, ln * rnd.uniform(0.5, 0.72), wd * 0.58, dep - 1)
        else:
            for _ in range(rnd.choice(twigs)):
                x2, y2 = pt(x1, y1, ln * rnd.uniform(*twig_len), mid_a + rnd.uniform(-35, 35))
                out.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{color}" stroke-width="{f(max(0.7, wd * 0.32))}" stroke-linecap="round"/>')

    for i in range(n):
        u = i / (n - 1)
        a = (a0 + (a1 - a0) * u + rnd.uniform(-6, 6)) * m
        bx = x + (u - 0.5) * top_w * 0.8 * m
        branch(bx, top + 4, a, blen * rnd.uniform(0.8, 1.15), bw, depth)
    return "".join(out)


def grandidieri(x, gy, h, w, color, seed=1):
    """Baobab de Grandidier (Madagascar, l'Allée des baobabs) : fût droit, couronne plate."""
    rnd = random.Random(seed)
    top = gy - h
    out = [
        f'<path d="M{f(x - w * 0.58)} {f(gy)} C{f(x - w * 0.5)} {f(gy - h * 0.3)} {f(x - w * 0.5)} {f(top + h * 0.2)} {f(x - w * 0.42)} {f(top)} '
        f'L{f(x + w * 0.42)} {f(top)} C{f(x + w * 0.5)} {f(top + h * 0.2)} {f(x + w * 0.5)} {f(gy - h * 0.3)} {f(x + w * 0.58)} {f(gy)} Z" fill="{color}"/>'
    ]
    n = rnd.choice((5, 6, 7))
    for i in range(n):
        u = (i - (n - 1) / 2) / ((n - 1) / 2)
        a = u * 70 + rnd.uniform(-8, 8)
        bx = x + u * w * 0.32
        x1, y1 = pt(bx, top + 3, h * rnd.uniform(0.08, 0.13), a)
        out.append(_taper(bx, top + 3, x1, y1, w * 0.2, w * 0.1, color))
        for _ in range(3):
            x2, y2 = pt(x1, y1, h * rnd.uniform(0.04, 0.08), a + rnd.uniform(-40, 30))
            out.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{color}" stroke-width="{f(max(0.8, w * 0.05))}" stroke-linecap="round"/>')
    out.append(f'<ellipse cx="{f(x)}" cy="{f(top - h * 0.02)}" rx="{f(w * 0.8)}" ry="{f(h * 0.03)}" fill="{color}"/>')
    return "".join(out)


def baobab_fruit(x, y, s, fill, stalk="#1A0C06"):
    """Pain de singe : le fruit du baobab, ovale velouté pendu à une longue tige."""
    ln = 16 * s
    return (
        f'<path d="M{f(x)} {f(y)} Q{f(x + 2 * s)} {f(y + ln * 0.5)} {f(x)} {f(y + ln)}" fill="none" stroke="{stalk}" stroke-width="{f(1.3 * s)}"/>'
        f'<ellipse cx="{f(x)}" cy="{f(y + ln + 9 * s)}" rx="{f(4.6 * s)}" ry="{f(9.5 * s)}" fill="{fill}"/>'
        f'<ellipse cx="{f(x - 1.4 * s)}" cy="{f(y + ln + 6 * s)}" rx="{f(1.4 * s)}" ry="{f(4 * s)}" fill="#FFFFFF" opacity="0.45"/>'
    )
