"""Les six cadres des hauts faits : un par rareté, et le neutre. La plaque porte le titre VIVANT (emplacement `title`)."""

from base import Card, W, H, f, photo, bird, rays, METALS
from kit import (group, rrect, arch, oval, octo, ogive, deco_mask, noise, grain, rim, inner_shadow, grade, halo, lgrad, dust,
                 bright_stars, outer_frame, inscription, glints)
from ornements import medal, ribbon, laurel, confetti, bow, star_d

DATE = "10 octobre 2026"
PHOTO_FREE = (82, 246, 458, 716)

COPPER = METALS["copper"]
SILVER = METALS["silver"]
GOLD = METALS["gold"]
AMETHYST = ("#F3E4FF", "#A86BE0", "#4A1C7A")
PRISM = ("#FFFFFF", "#CFE3FF", "#4A5A8A")
IVORY = ("#FFFDF4", "#D9CBA3", "#7A6A42")


def kicker(rarete=None):
    return "Haut fait accompli" if rarete is None else f"Haut fait accompli · {rarete}"


def perches(card, mee, meo):
    bird(card, mee, 118, 96, 116, rotate=-10)
    bird(card, meo, 422, 96, 116, flip=True, rotate=10)


def ruban(card, mee, meo):
    bird(card, mee, 62, 772, 100, rotate=-6)
    bird(card, meo, 478, 772, 100, flip=True, rotate=6)


def _bg(card, name, stops):
    return f'<rect width="{W}" height="{H}" fill="{lgrad(card, name, stops)}"/>'


# ---------------------------------------------------------------- Commun : la première marche

def commun():
    c = Card("hf1")
    photo(c, top="#3A2A1E", bottom="#140C08", rim="#FFC27A", glow=0.2)
    win = rrect(82, 246, 458, 712, 24)
    with group(c, f'mask="{deco_mask(c, win)}"'):
        c.add(_bg(c, "bg", [(0, "#4A2E22", 1), (0.5, "#2E1A12", 1), (1, "#160A06", 1)]))
        c.add(f'<rect width="{W}" height="{H}" fill="#FFD9A8" opacity="0.5" filter="{noise(c, "lin", "0.9 0.3", 2, 4, 1.4, -0.9)}"/>')
        c.add(grain(c, "gr", 0.05))
        c.add(halo(c, 270, 120, 220, "#FFB27A", 0.3, "top-h", ry=150))
        c.add(laurel(c, 270, 150, 86, COPPER, "lw", leaves=7, size=18))
        c.add(confetti(21, 60, (0, 0, W, 240), ["#FFC27A", "#E8955A", "#FFF1DC"], size=(2.5, 5)))
        c.add(confetti(22, 40, (0, 720, W, 960), ["#FFC27A", "#E8955A", "#FFF1DC"], size=(2.5, 5)))
    c.add(inner_shadow(c, win, 36, 12, 0.5, name="ish"))
    c.add(grade(c, win, "#FFB27A", 0.5, 0.0, 0.22, 0.9, "warm"))
    c.add(rim(c, win, COPPER, 4, "rim"))
    c.add(ribbon(c, 270, 14, 128, 70, COPPER, ("#B8442A", "#E8955A"), "rb"))
    c.add(medal(c, 270, 150, 50, COPPER, "md", disc=("#3A1E12", "#1A0C06", "#080402"), glow="#FFB27A", glow_op=0.35))
    c.add(outer_frame(c, COPPER, inner_op=0.5))
    perches(c, "mee-bravo", "meo-salut")
    inscription(c, kicker("Commun"), "Premier mot", metal=COPPER, panel=("#2A1A14", "#0E0806"), accent="#FFD2A8", title_size=32,
                message="Ça commence !", msg_color="#FFE7C8", date=DATE)
    return c


# ---------------------------------------------------------------- Rare : l'étoile d'argent

def rare():
    c = Card("hf2")
    photo(c, top="#1E2A4A", bottom="#0A0E1E", rim="#CFE3FF", glow=0.2)
    win = arch(82, 458, 420, 262, 712)
    with group(c, f'mask="{deco_mask(c, win)}"'):
        c.add(_bg(c, "bg", [(0, "#0A1030", 1), (0.45, "#162459", 1), (0.8, "#1E2F6E", 1), (1, "#070A1C", 1)]))
        c.add(dust(31, 260, (0, 0, W, H), ["#FFFFFF", "#DCE4FF", "#BFD2FF"], 0.3, 1.3, 0.25, 0.9, avoid=PHOTO_FREE))
        c.add(bright_stars(32, 9, (16, 16, 524, 944), "#F4F8FF", 3, 7, avoid=(60, 230, 480, 730)))
        c.add(halo(c, 270, 150, 160, "#9FC2FF", 0.3, "mh"))
        c.add(halo(c, 270, 880, 300, "#4A6AD8", 0.3, "bh", ry=80))
        c.add(laurel(c, 270, 150, 88, SILVER, "lw", leaves=8, size=19))
    c.add(inner_shadow(c, win, 36, 12, 0.55, name="ish"))
    c.add(grade(c, win, "#9FC2FF", 0.5, 0.0, 0.22, 0.9, "cool"))
    c.add(rim(c, win, SILVER, 4, "rim"))
    c.add(ribbon(c, 270, 14, 128, 70, SILVER, ("#1F3C9C", "#5E86E8"), "rb"))
    c.add(medal(c, 270, 150, 52, SILVER, "md", disc=("#1A2448", "#0C1230", "#04061A"), glow="#BFD2FF", glow_op=0.4))
    c.add(glints([(60, 300, 7, 0.9), (486, 640, 6, 0.8), (40, 820, 5, 0.8), (500, 860, 7, 0.9)], "#FFFFFF"))
    c.add(outer_frame(c, SILVER, inner_op=0.5))
    perches(c, "mee-sourire", "meo-cool")
    inscription(c, kicker("Rare"), "Première conversation", metal=SILVER, panel=("#141C3C", "#06091C"), accent="#CFE3FF", title_size=30,
                message="Bien joué", msg_color="#EAF2FF", date=DATE)
    return c


# ---------------------------------------------------------------- Épique : l'orage violet

def epique():
    c = Card("hf3")
    photo(c, top="#2C1A4A", bottom="#0E0820", rim="#E2C8FF", glow=0.22)
    win = octo(82, 250, 458, 712, 30)
    with group(c, f'mask="{deco_mask(c, win)}"'):
        c.add(_bg(c, "bg", [(0, "#160A2E", 1), (0.4, "#3A1A6A", 1), (0.75, "#2A0F52", 1), (1, "#0A0418", 1)]))
        c.add(dust(41, 200, (0, 0, W, H), ["#FFFFFF", "#E2C8FF", "#C58CFF"], 0.3, 1.2, 0.2, 0.8, avoid=PHOTO_FREE))
        for (hx, hy, hr, op) in ((40, 300, 120, 0.4), (500, 520, 140, 0.4), (60, 860, 160, 0.35), (480, 880, 130, 0.35)):
            c.add(halo(c, hx, hy, hr, "#B06CFF", op, f"h{hx}{hy}"))
        bolt = "M250 20 L236 86 L262 80 L240 150 L286 72 L260 78 L278 20 Z"
        c.add(f'<path d="{bolt}" fill="#F3E4FF" opacity="0.9" filter="{c.blur("bolt", 1.2)}" transform="translate(-200 0) rotate(-12 250 80)"/>')
        c.add(f'<path d="{bolt}" fill="#F3E4FF" opacity="0.9" filter="{c.blur("bolt", 1.2)}" transform="translate(206 0) scale(-1 1) translate(-540 0) rotate(12 250 80)"/>')
        c.add(laurel(c, 270, 150, 90, AMETHYST, "lw", leaves=8, size=20))
    c.add(inner_shadow(c, win, 36, 12, 0.55, name="ish"))
    c.add(grade(c, win, "#C58CFF", 0.5, 0.0, 0.24, 0.9, "violet"))
    c.add(rim(c, win, AMETHYST, 4, "rim"))
    c.add(ribbon(c, 270, 14, 128, 72, AMETHYST, ("#5A1EA8", "#9A5CE8"), "rb"))
    c.add(medal(c, 270, 150, 54, AMETHYST, "md", disc=("#2A1248", "#140826", "#06020E"), glow="#C58CFF", glow_op=0.45, rays_n=16, rays_color="#E2C8FF"))
    c.add(outer_frame(c, AMETHYST, inner_op=0.5))
    ruban(c, "mee-wow", "meo-feu-artifice")
    inscription(c, kicker("Épique"), "Cent messages", metal=AMETHYST, panel=("#1E1038", "#0A0618"), accent="#E2C8FF", title_size=32, date=DATE)
    return c


# ---------------------------------------------------------------- Légendaire : le soleil d'or

def legendaire():
    c = Card("hf4")
    photo(c, top="#3E2A12", bottom="#160C04", rim="#FFE2A0", glow=0.24)
    win = ogive(82, 458, 430, 262, 712)
    with group(c, f'mask="{deco_mask(c, win)}"'):
        c.add(_bg(c, "bg", [(0, "#4A2E08", 1), (0.35, "#7A4E12", 1), (0.7, "#3E2408", 1), (1, "#160C02", 1)]))
        c.add(halo(c, 270, 150, 260, "#FFD37A", 0.5, "sun"))
        c.add(f'<g opacity="0.55">{rays(270, 150, 70, 300, 25, "#FFE2A0", 3, -180, 0, 0.7)}</g>')
        c.add(f'<g opacity="0.35">{rays(270, 150, 70, 420, 31, "#FFE2A0", 2, 0, 180, 0.75)}</g>')
        c.add(dust(51, 160, (0, 0, W, H), ["#FFF6DC", "#FFD37A", "#FFFFFF"], 0.3, 1.4, 0.3, 0.9, avoid=PHOTO_FREE))
        c.add(confetti(52, 70, (0, 0, W, H), ["#FFD37A", "#FFF1C2", "#E8A23C"], avoid=PHOTO_FREE, size=(3, 7)))
        c.add(laurel(c, 270, 150, 96, GOLD, "lw", leaves=10, size=22, stem_w=3))
    c.add(inner_shadow(c, win, 36, 12, 0.5, name="ish"))
    c.add(grade(c, win, "#FFD37A", 0.5, 0.0, 0.26, 0.9, "gold"))
    c.add(rim(c, win, GOLD, 5, "rim"))
    c.add(ribbon(c, 270, 14, 128, 76, GOLD, ("#B3182A", "#E8503C"), "rb"))
    c.add(medal(c, 270, 150, 56, GOLD, "md", disc=("#3A2208", "#1A0E04", "#080401"), glow="#FFE2A0", glow_op=0.5, rays_n=24, rays_color="#FFF1C2"))
    c.add(outer_frame(c, GOLD, w=4, inner_op=0.6))
    ruban(c, "mee-fete", "meo-trophee")
    inscription(c, kicker("Légendaire"), "Mille mots offerts", metal=GOLD, panel=("#2A1A08", "#0E0802"), accent="#FFE2A0", title_size=32,
                message="Une légende !", msg_color="#FFF1C2", date=DATE)
    return c


# ---------------------------------------------------------------- Mythique : le prisme

def mythique():
    c = Card("hf5")
    photo(c, top="#14163A", bottom="#06061A", rim="#E6F0FF", glow=0.22)
    win = oval(270, 480, 188, 234)
    prism = c.prism("prism", 0, 0, 1, 1)
    with group(c, f'mask="{deco_mask(c, win)}"'):
        c.add(_bg(c, "bg", [(0, "#06061C", 1), (0.5, "#0E1038", 1), (1, "#040410", 1)]))
        c.add(dust(61, 340, (0, 0, W, H), ["#FFFFFF", "#CFE3FF", "#FFD6F2", "#D6FFF2"], 0.3, 1.3, 0.25, 0.95, avoid=PHOTO_FREE))
        c.add(bright_stars(62, 10, (16, 16, 524, 944), "#FFFFFF", 3, 8, avoid=(60, 230, 480, 730)))
        for (hx, hy, hr, col, op) in ((70, 120, 170, "#FF7AD9", 0.35), (480, 160, 150, "#7AD9FF", 0.35), (60, 860, 170, "#7AFFC8", 0.3), (490, 850, 160, "#B57AFF", 0.35)):
            c.add(halo(c, hx, hy, hr, col, op, f"n{hx}{hy}"))
        c.add(f'<path d="{star_d(270, 150, 118, 0.42, -90, 8)}" fill="none" stroke="{prism}" stroke-width="2.2" opacity="0.75"/>')
        c.add(laurel(c, 270, 150, 92, PRISM, "lw", leaves=9, size=20))
    c.add(inner_shadow(c, win, 36, 12, 0.5, name="ish"))
    c.add(grade(c, win, "#B57AFF", 0.5, 0.0, 0.22, 0.9, "iris"))
    c.add(f'<g filter="{c.shadow("prim", 0, 3, 4, "#000000", 0.5)}"><path d="{win}" fill="none" stroke="{prism}" stroke-width="6"/></g>')
    c.add(f'<path d="{win}" fill="none" stroke="#FFFFFF" stroke-width="1" opacity="0.8"/>')
    c.add(ribbon(c, 270, 14, 128, 76, PRISM, ("#2A2F7A", "#6A7AE8"), "rb"))
    c.add(medal(c, 270, 150, 56, PRISM, "md", disc=("#141A48", "#0A0E30", "#04061A"), glow="#CFE3FF", glow_op=0.5, star_fill=prism, rays_n=32, rays_color="#E6F0FF"))
    c.add(f'<g filter="{c.shadow("of-sh", 0, 2, 3, "#000000", 0.5)}"><rect x="12" y="12" width="{W - 24}" height="{H - 24}" rx="24" fill="none" stroke="{prism}" stroke-width="4"/></g>')
    c.add(f'<rect x="19" y="19" width="{W - 38}" height="{H - 38}" rx="19" fill="none" stroke="#FFFFFF" stroke-width="0.9" opacity="0.6"/>')
    c.add(glints([(44, 260, 8, 0.95), (498, 300, 6, 0.9), (36, 700, 6, 0.9), (506, 740, 8, 0.95)], "#FFFFFF"))
    ruban(c, "mee-jackpot", "meo-champagne")
    inscription(c, kicker("Mythique"), "Dix mille mots", metal=PRISM, panel=("#10143A", "#06081C"), accent="#E6F0FF", title_size=32,
                border=prism, title_fill=prism, date=DATE)
    return c


# ---------------------------------------------------------------- Neutre : le ruban

def neutre():
    c = Card("hf0")
    photo(c, top="#4A4034", bottom="#1E1812", rim="#FFF1DC", glow=0.2)
    win = rrect(82, 246, 458, 712, 20)
    with group(c, f'mask="{deco_mask(c, win)}"'):
        c.add(_bg(c, "bg", [(0, "#F4EBD8", 1), (0.6, "#E6D9BE", 1), (1, "#CDBB95", 1)]))
        c.add(f'<rect width="{W}" height="{H}" fill="#8A7652" opacity="0.5" filter="{noise(c, "lin", "0.7 0.25", 2, 6, 1.5, -1.0)}"/>')
        c.add(grain(c, "gr", 0.05))
        wood = lgrad(c, "wood", [(0, "#C9A26A", 1), (0.5, "#9C7440", 1), (1, "#6A4A22", 1)], 0, 0, 1, 0)
        for x in (28, 496):
            c.add(f'<rect x="{x}" y="20" width="16" height="{H - 40}" rx="4" fill="{wood}"/>')
        for y in (28, 916):
            c.add(f'<rect x="20" y="{y}" width="{W - 40}" height="16" rx="4" fill="{wood}"/>')
        c.add(halo(c, 270, 130, 160, "#FFFFFF", 0.5, "hh"))
        c.add(confetti(71, 50, (0, 0, W, 236), ["#D9CBA3", "#B9A77A", "#FFFFFF"], size=(2.5, 5)))
    c.add(inner_shadow(c, win, 30, 10, 0.45, name="ish"))
    c.add(grade(c, win, "#FFFFFF", 0.5, 0.0, 0.14, 0.9, "soft"))
    c.add(rim(c, win, IVORY, 4, "rim", inner="#FFFFFF"))
    band = lgrad(c, "band", [(0, "#8E6A3A", 1), (0.5, "#C49A5C", 1), (1, "#8E6A3A", 1)], 0, 0, 1, 0)
    c.add(f'<rect x="246" y="20" width="48" height="112" fill="{band}"/>')
    c.add(f'<path d="M246 132 L294 132 L270 152 Z" fill="{band}"/>')
    c.add(bow(c, 270, 150, 30, "#C49A5C", "#6A4A22", "bow"))
    c.add(outer_frame(c, IVORY, inner_op=0.5, inner_color="#B9A77A"))
    perches(c, "mee-coucou", "meo-bravo")
    inscription(c, kicker(), "Premier partage", metal=IVORY, panel=("#3A3024", "#1A140C"), accent="#F4EBD8", title_size=32,
                message="Fait !", msg_color="#FFF8E8", date=DATE)
    return c


FRAMES = [
    ("succes-common", commun, dict(rank="Haut fait", division=None, option="commun", name="La Première Marche",
     story="Un cuir chaud aux confettis de cuivre, une médaille de cuivre étoilée sous son ruban rouge, et deux branches de laurier qui s'ouvrent : la marche la plus commune, celle que tout le monde franchit un jour, et qu'on fête quand même.",
     layout="perchés (Mee bravo, Meo salut)", message="Ça commence !")),
    ("succes-rare", rare, dict(rank="Haut fait", division=None, option="rare", name="L'Étoile d'argent",
     story="Une nuit bleue semée d'étoiles autour d'une arche, une médaille d'argent sous un ruban bleu roi, et le laurier d'argent qui l'entoure : le haut fait que peu accomplissent, et que la nuit salue d'une étoile.",
     layout="perchés (Mee sourire, Meo cool)", message="Bien joué")),
    ("succes-epic", epique, dict(rank="Haut fait", division=None, option="épique", name="L'Orage violet",
     story="Un ciel d'améthyste traversé d'éclairs, une fenêtre taillée à pans coupés, une médaille violette rayonnante tenue par Mee et Meo : l'orage qu'on a traversé, et qu'on raconte.",
     layout="ruban (Mee wow, Meo feu d'artifice)", message=None)),
    ("succes-legendary", legendaire, dict(rank="Haut fait", division=None, option="légendaire", name="Le Soleil d'or",
     story="Un soleil d'or dont les rayons emplissent le cadre, une couronne de laurier à dix feuilles, une médaille d'or sous son ruban pourpre, des confettis d'or : le haut fait qu'on ne croise qu'une fois, et qu'on raconte encore.",
     layout="ruban (Mee fête, Meo trophée)", message="Une légende !")),
    ("succes-mythic", mythique, dict(rank="Haut fait", division=None, option="mythique", name="Le Prisme",
     story="Un cosmos aux nébuleuses rose, cyan, menthe et violette, une fenêtre ovale cerclée d'un prisme, une médaille de lumière à trente-deux rayons et une étoile à huit branches : le haut fait de presque personne, à la couleur de toutes les lumières.",
     layout="ruban (Mee jackpot, Meo champagne)", message=None)),
    ("succes-neutre", neutre, dict(rank="Haut fait", division=None, option="neutre · sans rareté", name="Le Ruban",
     story="Un papier de lin crème sous un cadre de bois clair, un ruban de soie noué en haut, aucune médaille, aucune marque de rareté : le cadre d'un haut fait dont on ne dit pas la rareté — il est accompli, c'est tout ce que le cadre affirme.",
     layout="perchés (Mee coucou, Meo bravo)", message="Fait !")),
]
