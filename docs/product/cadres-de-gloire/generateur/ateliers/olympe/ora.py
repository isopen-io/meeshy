"""Orateur : trois cadres rayonnants — la voix et la lumière. La lyre d'Apollon, le phare d'Alexandrie bâti sur la
rive africaine (baobab, kente, Nsoromma dans le ciel), le théâtre d'Épidaure dont les gradins sont des ondes."""

from cadre import *  # noqa: F401,F403
from archi import theatre_tiers, pharos, cypress, TONES
from figures import lyre, smooth, flame_shape
from cosmos import star_field, outside, ublur, concentric, neb
from afrique import kente, baobab, palm, adinkra

GEM = "#FF9A1A"


# ---------------------------------------------------------------- A — La Lyre d'Apollon

def ora_a():
    c = start("oa", top="#3A2416", bottom="#140A06", rim="#FFC27A")
    wp = window_path(98, 262, 442, 730, 10)
    m = window(c, "oa-win", wp)
    bg = [f'<rect width="540" height="960" fill="{c.grad("oa-bg", [(0, "#2A0A16"), (0.12, "#6E1A1E"), (0.3, "#C2482A"), (0.55, "#7A2414"), (1, "#24080A")])}"/>']
    bg.append(f'<circle cx="270" cy="140" r="420" fill="{c.rgrad("oa-sun", [(0, "#FFF4D0", 1), (0.12, "#FFD26A", 0.85), (0.35, "#FF8A3A", 0.35), (1, "#FF8A3A", 0)])}"/>')
    bg.append(sunburst(270, 140, 60, 980, 80, "#FFE7A8", 2.4, 0.22))
    bg.append(sunburst(270, 140, 60, 600, 40, "#FFFFFF", 1.2, 0.14))
    c.add(f'<g mask="{m}">{"".join(bg)}</g>')
    c.add(f'<g mask="{m}">{gold_dust(21, 160, (0, 0, 540, 960), "#FFE6A0", 1.6, sparkles=0.12)}</g>')
    rel = relief(c, "oa-rel", scale=2.6, blur=0.9, spec=1.1, exp=18, drop=0.5, dy=2, sd=2)
    gold = gold_fill(c, "redgold")
    glow = ublur(c, "oa-sglow", 2.4)
    c.add(f'<g filter="{rel}">{lyre(c, 270, 224, 782, 196, gold, "#5E2408", string="#FFF4C2", strings=7, string_mask=m, glow=glow)}</g>')
    inner_shadow(c, wp, 22, 0.75)
    gold_line(c, wp, 2.4, "redgold")
    c.add(f'<circle cx="270" cy="140" r="96" fill="{c.rgrad("oa-halo", [(0, "#FFFFFF", 0.85), (0.4, "#FFE7A8", 0.5), (1, "#FFE7A8", 0)])}"/>')
    c.add(f'<g filter="{rel}">{wreath(270, 146, 78, gold, rib="#7A2E0E", n=13, L=28, w=10, gap=70, bottom_gap=40, seed=8)}</g>')
    for m_ in (-1, 1):
        c.add(f'<g filter="{rel}">{branch((270 + m_ * 218, 700), (270 + m_ * 262, 480), (270 + m_ * 214, 300), 16, 24, 8, gold, rib="#7A2E0E", berries="#FFF4C2", seed=3 + m_)}</g>')
    crest(c, 270, 136, 0.9, "redgold", division=None, gem=GEM)
    mee_meo(c, "pied", "mee-danse", "meo-serenade")
    stele(c, "aube", y=790, title="Orateur", message="Ma voix porte loin", orn="palmette", x0=84, x1=456)
    frame_border(c, "redgold", 8, 2.4)
    c.save(OUT / f"{SLUG}-orateur-a.svg")
    register("orateur-a", "orateur", None, "A", "La Lyre d'Apollon",
             "La photo prend place entre les bras d'une immense lyre d'or rouge dont la stèle est la caisse ; ses sept cordes "
             "vibrent de lumière, le blason se lève comme le soleil d'Apollon dans une gloire de rayons, ceint du laurier de Daphné.",
             "pied : Mee (danse) et Meo (sérénade) au pied de la lyre", "Ma voix porte loin")


# ---------------------------------------------------------------- B — Le Phare d'Alexandrie

def ora_b():
    from afrique import baobab_rich, felucca, dwennimmen_horns
    from retouche import pharos_rich, light_beam
    from base import adinkrahene, akoma, sankofa
    c = start("ob", top="#22283A", bottom="#0A0C14", rim="#FFD49A")
    wp = window_path(100, 252, 440, 730, 16)
    m = window(c, "ob-win", wp)
    HZ = 756
    bg = [f'<rect width="540" height="960" fill="{c.grad("ob-bg", [(0, "#04061C"), (0.22, "#0E1646"), (0.46, "#2A2464"), (0.62, "#6E2E5E"), (0.72, "#D0603E"), (0.776, "#FFC47A"), (0.7875, "#FFE9B8"), (0.788, "#1A3866"), (1, "#050C1C")])}"/>']
    bg.append(f'<ellipse cx="190" cy="{HZ}" rx="360" ry="190" fill="{c.rgrad("ob-hz", [(0, "#FFE6B0", 0.85), (0.3, "#FF9A50", 0.45), (1, "#FF7A3A", 0)])}"/>')
    bg.append(f'<ellipse cx="60" cy="{HZ - 20}" rx="170" ry="230" fill="{c.rgrad("ob-hz3", [(0, "#FFE0A0", 0.9), (0.35, "#FF8A50", 0.55), (1, "#C04A5A", 0)])}"/>')
    c.add(f'<g mask="{m}">{"".join(bg)}</g>')
    c.add(f'<g mask="{m}">{star_field(12, 300, (0, 0, 540, 640), rmax=1.4)}</g>')
    rel = relief(c, "ob-rel", scale=2.2, blur=0.8, spec=1.0, exp=18, drop=0.45, dy=1.5, sd=1.4)
    gold = gold_fill(c, "redgold")
    stars_ = "".join(adinkra("nsoromma", x, y, s_, "#FFD98A") for x, y, s_ in ((48, 330, 0.22), (66, 470, 0.16), (476, 116, 0.2), (420, 52, 0.16), (36, 560, 0.13)))
    c.add(f'<g mask="{m}"><g filter="{c.blur("ob-nsg", 3)}" opacity="0.8">{stars_}</g>{stars_}</g>')
    fx, fy = 494, 772 - 452 * 1.16
    tx, ty = -60, 30
    def on_axis(t):
        return fx + (tx - fx) * t, fy + (ty - fy) * t
    neon = "#FFE9A8"
    g1x, g1y = on_axis(0.2)
    g2x, g2y = on_axis(0.6)
    g3x, g3y = on_axis(0.78)
    glyphs = [adinkrahene(g1x, g1y, 0.5, neon, 3.2), akoma(g2x, g2y, 0.62, neon) if False else sankofa(g2x, g2y, 0.62, neon),
              dwennimmen_horns(g3x, g3y, 0.78, neon, 3.6)]
    c.add(light_beam(c, "ob-beam", fx, fy, tx, ty, 132, glyphs, glow=10, mask=m))
    sea = [f'<rect x="0" y="{HZ}" width="540" height="{960 - HZ}" fill="{c.grad("ob-sea", [(0, "#2A4A7E"), (0.25, "#14284E"), (1, "#040A18")])}"/>']
    rnd = __import__("random").Random(5)
    for i in range(110):
        y = HZ + 4 + (rnd.random() ** 1.6) * 200
        x = rnd.uniform(0, 540)
        L = rnd.uniform(6, 30) * (0.6 + (y - HZ) / 200)
        sea.append(f'<path d="M{f(x)} {f(y)} h{f(L)}" stroke="#FFD98A" stroke-width="1.1" opacity="{f(rnd.uniform(0.15, 0.55))}" stroke-linecap="round"/>')
    for i in range(46):
        y = HZ + 6 + i * 4.4
        w_ = 6 + i * 0.9
        sea.append(f'<path d="M{f(494 - w_ / 2 + rnd.uniform(-6, 6))} {f(y)} h{f(w_ * rnd.uniform(0.4, 1))}" stroke="#FFE7A8" stroke-width="1.4" opacity="{f(0.85 - i * 0.015)}" stroke-linecap="round"/>')
    c.add("".join(sea))
    c.add(f'<rect x="0" y="{HZ - 1}" width="540" height="1.5" fill="#FFF0C8" opacity="0.9"/>')
    c.add(felucca(352, 788, 0.42, "#1A1020", "#F6D9A8", 0.85))
    c.add(f'<path d="M418 774 L540 770 L540 798 L410 800Z" fill="{c.grad("ob-mole", [(0, "#8A6A4A"), (1, "#3A2A1E")])}"/>'
          f'<path d="M418 774 L540 770" stroke="#FFE2B0" stroke-width="1.2" opacity="0.8"/>')
    ph, (lx, ly) = pharos_rich(c, 494, 772, 1.16, lit_from=-1)
    c.add(f'<g filter="{c.shadow("ob-ph", -4, 4, 5, "#000000", 0.55)}">{ph}</g>')
    land = [f'<path d="M-10 960 L-10 744 C30 736 70 742 110 752 C140 760 160 770 176 790 C180 820 170 900 160 960Z" fill="#140A14"/>',
            f'<path d="M-10 744 C30 736 70 742 110 752 C140 760 160 770 176 790" fill="none" stroke="#FF9A50" stroke-width="1.4" opacity="0.75"/>']
    land.append(baobab_rich(c, 50, 748, 250, "#1A0C18", "#FFC27A", seed=4, lean=-4, light_from=1, rim_op=1))
    c.add(f'<g mask="{m}">{"".join(land)}</g>')
    inner_shadow(c, wp, 22, 0.8)
    gold_line(c, wp, 2.4, "redgold")
    c.add(f'<circle cx="270" cy="140" r="92" fill="{c.rgrad("ob-halo", [(0, "#FFF2D0", 0.65), (1, "#FFF2D0", 0)])}"/>')
    crest(c, 270, 140, 0.92, "redgold", division=None, gem=GEM)
    bird(c, "mee-coucou", 58, 786, 100, False, -6)
    bird(c, "meo-salut", 494, 404, 92, True, 4)
    stele(c, "lapis", y=806, title="Orateur", orn="stars", x0=84, x1=456)
    frame_border(c, "redgold", 8, 2.2)
    c.save(OUT / f"{SLUG}-orateur-b.svg")
    register("orateur-b", "orateur", None, "B", "Le Phare d'Alexandrie",
             "Le phare d'Alexandrie, merveille grecque bâtie sur la rive africaine, porte deux longues bandes de kente en "
             "bannières, et son faisceau traverse le ciel derrière le blason en allumant comme des néons d'or trois symboles "
             "Adinkra des Akan (Adinkrahene, Sankofa, Dwennimmen) ; sur le promontoire, un baobab et des palmiers en contre-jour, "
             "une felouque sur la mer, et les étoiles sont des Nsoromma, « l'enfant des cieux ».",
             "libre : Mee (coucou) sur le promontoire, Meo (salut) sur la corniche du phare", None)


# ---------------------------------------------------------------- C — Le Théâtre d'Épidaure

def ora_c():
    c = start("oc", top="#3A2A1E", bottom="#120C08", rim="#FFD49A")
    wp = window_path(96, 260, 444, 726, 12)
    m = window(c, "oc-win", wp)
    ox, oy = 270, 880
    bg = [f'<rect width="540" height="960" fill="{c.grad("oc-sky", [(0, "#120A2A"), (0.08, "#3A1A4A"), (0.16, "#B4503A"), (0.22, "#F6B25A"), (1, "#2A1A10")])}"/>']
    c.add(f'<g mask="{m}">{"".join(bg)}</g>')
    c.add(f'<g mask="{m}">{star_field(3, 50, (0, 0, 540, 80), rmax=1.2)}</g>')
    from retouche import cypress_fine, stone_pine, rock_filter
    hills = (f'<path d="M-10 186 Q60 120 140 150 Q200 170 250 136 Q320 100 400 140 Q470 170 550 124 L550 260 L-10 260Z" fill="#5A2A3A" opacity="0.85"/>'
             f'<path d="M-10 200 Q80 160 170 182 Q260 200 340 170 Q430 146 550 180 L550 260 L-10 260Z" fill="#3A1A26"/>')
    trees = (cypress_fine(26, 196, 86, "#160E10", "#FFB070", 1, -1) + cypress_fine(52, 200, 62, "#160E10", "#FFB070", 2, -1)
             + stone_pine(96, 196, 70, "#160E10", "#FFB070", 3) + cypress_fine(510, 194, 92, "#160E10", "#FFB070", 4, 1)
             + cypress_fine(486, 200, 58, "#160E10", "#FFB070", 5, 1) + stone_pine(440, 196, 64, "#160E10", "#FFB070", 6))
    c.add(f'<g mask="{m}">{hills}{trees}</g>')
    tiers = theatre_tiers(c, ox, oy, 180, 720, 30, "stone", -96, 96, aisles=11, aisle_w=7, aisle_op=0.4)
    rk = rock_filter(c, "oc-rk", freq="0.05 0.08", seed=6, scale=2.2, az=200, el=58, k1=1.25)
    c.add(f'<g mask="{m}"><g filter="{rk}">{tiers}</g></g>')
    c.add(f'<rect width="540" height="960" fill="{c.grad("oc-sh", [(0, "#C2481A"), (0.5, "#FFD9A0"), (1, "#5A2A6A")], 0, 0, 1, 0)}" opacity="0.32" mask="{m}"/>')
    c.add(f'<rect width="540" height="960" fill="{ugrad(c, "oc-dk", [(0, "#000000", 0), (0.55, "#000000", 0.1), (1, "#1A0A04", 0.55)], 0, 160, 0, 960)}" mask="{m}"/>')
    waves_ = []
    for i, r in enumerate((240, 340, 450, 570, 700)):
        x1, y1 = pt(ox, oy, r, -96)
        x2, y2 = pt(ox, oy, r, 96)
        d = f"M{f(x1)} {f(y1)} A{r} {r} 0 0 1 {f(x2)} {f(y2)}"
        waves_.append(f'<path d="{d}" fill="none" stroke="#FFC24A" stroke-width="16" opacity="{f(0.55 - i * 0.06)}" filter="{ublur(c, "oc-wb", 7)}"/>'
                      f'<path d="{d}" fill="none" stroke="#FFF4C2" stroke-width="2.4" opacity="{f(1 - i * 0.1)}"/>')
    c.add(f'<g mask="{m}">{"".join(waves_)}</g>')
    c.add(f'<g mask="{m}">{gold_dust(41, 120, (0, 100, 540, 960), "#FFF4C2", 1.4, sparkles=0.12)}</g>')
    orch = c.rgrad("oc-orch", [(0, "#FFF2D8", 1), (0.7, "#E9CFA0", 1), (1, "#B08A5A", 1)])
    c.add(f'<circle cx="{ox}" cy="{oy}" r="168" fill="{orch}"/>')
    c.add(concentric(ox, oy, 40, 26, 6, "#B08A5A", 1.2, 0.6, fade=False))
    c.add(f'<circle cx="{ox}" cy="{oy}" r="168" fill="none" stroke="#7A5A34" stroke-width="3"/>')
    inner_shadow(c, wp, 22, 0.75)
    gold_line(c, wp, 2.4, "redgold")
    rel = relief(c, "oc-rel", scale=2.4, blur=0.9, spec=1.0, exp=20, drop=0.45, dy=2, sd=1.8)
    gold = gold_fill(c, "redgold")
    c.add(f'<circle cx="270" cy="140" r="90" fill="{c.rgrad("oc-halo", [(0, "#FFF2D0", 0.75), (1, "#FFF2D0", 0)])}"/>')
    c.add(concentric(270, 140, 70, 14, 5, "#FFE7A8", 1.2, 0.6))
    crest(c, 270, 136, 0.92, "redgold", division=None, gem=GEM)
    mee_meo(c, "pied", "mee-bravo", "meo-yo")
    stele(c, "aube", y=786, title="Orateur", message="Merci à vous tous", orn="palmette", x0=84, x1=456)
    frame_border(c, "redgold", 8, 2.4)
    c.save(OUT / f"{SLUG}-orateur-c.svg")
    register("orateur-c", "orateur", None, "C", "Le Théâtre d'Épidaure",
             "Vu de l'orchestre, le théâtre d'Épidaure déploie ses gradins de calcaire en demi-cercles qui deviennent des ondes "
             "d'or : dans ce théâtre, un murmure prononcé au centre s'entend jusqu'au dernier rang ; les cyprès et les pins "
             "parasols des collines d'Argolide veillent au couchant derrière le blason.",
             "pied : Mee (bravo) et Meo (yo) dans l'orchestre", "Merci à vous tous")


ALL = [ora_a, ora_b, ora_c]
