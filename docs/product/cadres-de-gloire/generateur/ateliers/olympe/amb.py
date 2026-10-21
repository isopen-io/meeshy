"""Ambassadeur : cinq cadres, de V à I — le rang où l'on choisit son atmosphère. Marbre, or, mer Égée ;
l'Afrique entre dans le temple au II (Adinkra dans les métopes, kente dans la frise, cauris en festons)."""

from cadre import *  # noqa: F401,F403
from archi import column, pediment, entablature, stylobate, triglyphs, TONES, cyl_fill, cycladic, bougainvillea, olive_tree, cypress
from figures import amphora, owl, tripod, horse, keraunos, smooth, runner
from cosmos import star_field, outside
from afrique import kente, cowrie, adinkra, palm
from ornements import meander_frame, anthemion

GEM = "#D8263A"


def sky(card, name, stops, y0=0, y1=960):
    return f'<rect x="0" y="{y0}" width="540" height="{y1 - y0}" fill="{card.grad(name, stops)}"/>'


# ---------------------------------------------------------------- V — L'Amphore des Panathénées

VASE = [(110, 16), (112, 38), (94, 46), (90, 100), (96, 148), (140, 186), (206, 222), (246, 258), (256, 320), (258, 520), (252, 640),
        (232, 730), (192, 810), (132, 862), (94, 884), (98, 900), (150, 914), (154, 944)]


def vase_path(cx=270):
    right = [(cx + x, y) for x, y in VASE]
    left = [(cx - x, y) for x, y in reversed(VASE)]
    return smooth(right + left, closed=True)


def tongues(x0, x1, y, h, n, c1, c2, line):
    out = []
    u = (x1 - x0) / n
    for i in range(n):
        cx = x0 + u * (i + 0.5)
        out.append(f'<path d="M{f(cx - u * 0.42)} {f(y)} L{f(cx + u * 0.42)} {f(y)} L{f(cx + u * 0.36)} {f(y + h * 0.7)} Q{f(cx)} {f(y + h * 1.1)} {f(cx - u * 0.36)} {f(y + h * 0.7)}Z" '
                   f'fill="{c1 if i % 2 else c2}" stroke="{line}" stroke-width="0.8"/>')
    return "".join(out)


def amb5():
    from figures import runner
    c = start("a5", top="#3A2C22", bottom="#140E0A", rim="#FFD49A")
    wp = window_path(84, 272, 456, 700, 8)
    m = window(c, "a5-win", wp)
    clay = c.grad("a5-clay", [(0, "#8A3A16"), (0.25, "#D07A3E"), (0.42, "#F0A060"), (0.6, "#C8642E"), (1, "#7A3012")], 0, 0, 1, 0)
    glaze = c.grad("a5-glaze", [(0, "#000000"), (0.22, "#17110D"), (0.34, "#5A483C"), (0.42, "#2A201A"), (0.7, "#120C08"), (1, "#000000")], 0, 0, 1, 0)
    ink = "#17110D"
    c.add(f'<g mask="{m}"><rect width="540" height="960" fill="{c.grad("a5-bg", [(0, "#0B2447"), (0.55, "#1F4F8E"), (1, "#0B1E36")])}"/>'
          f'<ellipse cx="270" cy="470" rx="340" ry="460" fill="{c.rgrad("a5-spot", [(0, "#FFE7B0", 0.4), (1, "#FFE7B0", 0)])}"/>'
          f'{gold_dust(15, 120, (0, 0, 540, 960), "#FFE6A0", 1.3)}</g>')
    vp = vase_path()
    c.add(f'<ellipse cx="270" cy="944" rx="200" ry="14" fill="#000000" opacity="0.5" filter="{soft(c, 6)}"/>')
    for mm in (-1, 1):
        hd = f"M{270 + mm * 92} 64 C{270 + mm * 214} 40 {270 + mm * 236} 150 {270 + mm * 206} 224"
        c.add(f'<path d="{hd}" fill="none" stroke="#000000" stroke-width="26" stroke-linecap="round"/>'
              f'<path d="{hd}" fill="none" stroke="{ink}" stroke-width="22" stroke-linecap="round"/>'
              f'<path d="{hd}" fill="none" stroke="#6A5648" stroke-width="3" stroke-linecap="round" opacity="0.7" transform="translate({-mm * 5} -3)"/>')
    vclip = inside(c, "a5-vclip", vp)
    deco = []
    deco.append(f'<rect width="540" height="960" fill="{glaze}"/>')
    deco.append(f'<rect x="0" y="16" width="540" height="22" fill="{clay}"/>')
    deco.append(f'<rect x="0" y="60" width="540" height="86" fill="{clay}"/>')
    deco.append(anthemion(170, 128, 200, 52, ink, unit=50))
    deco.append(f'<rect x="0" y="226" width="540" height="40" fill="{clay}"/>')
    deco.append(tongues(20, 520, 226, 30, 26, ink, "#7A1E14", ink))
    deco.append(f'<rect x="70" y="262" width="400" height="452" fill="{clay}"/>')
    deco.append(f'<rect x="0" y="704" width="540" height="60" fill="{clay}"/>')
    rr = []
    for k, x in enumerate((72, 140, 208, 332, 400, 468)):
        rr.append(runner(x, 752, 1.05, ink, k % 2, False))
    deco.append("".join(rr))
    deco.append(f'<path d="M0 708 H540 M0 760 H540" stroke="{ink}" stroke-width="2"/>')
    deco.append(f'<rect x="0" y="764" width="540" height="110" fill="{glaze}"/>')
    deco.append(f'<rect x="0" y="874" width="540" height="22" fill="{clay}"/>')
    rays = "".join(f'<path d="M{f(150 + i * 12)} 896 L{f(156 + i * 12)} 874 L{f(162 + i * 12)} 896Z" fill="{ink}"/>' for i in range(20))
    deco.append(rays)
    for y in (16, 38, 60, 146, 226, 266, 704, 764, 874, 896):
        deco.append(f'<rect x="0" y="{y - 0.8}" width="540" height="1.6" fill="#E8B53C" opacity="0.85"/>')
    c.add(f'<g mask="{m}"><g clip-path="{vclip}">{"".join(deco)}</g></g>')
    c.add(f'<path d="{vp}" fill="none" stroke="#E8B53C" stroke-width="2"/>')
    c.add(f'<path d="{vp}" fill="{c.grad("a5-sheen", [(0, "#FFFFFF"), (1, "#FFFFFF")])}" opacity="0"/>')
    c.add(f'<path d="M86 330 Q70 470 92 640" fill="none" stroke="#FFFFFF" stroke-width="7" opacity="0.18" stroke-linecap="round" filter="{soft(c, 2)}"/>')
    rel = relief(c, "a5-rel", scale=2.0, blur=0.8, spec=0.9, exp=22, drop=0.5, dy=1.5, sd=1.4)
    inner_shadow(c, wp, 18, 0.7)
    gold_line(c, wp, 2.2)
    c.add(f'<circle cx="270" cy="150" r="74" fill="{c.rgrad("a5-halo", [(0, "#FFE7B0", 0.75), (1, "#FFE7B0", 0)])}"/>')
    crest(c, 270, 146, 0.86, "gold", division=5, gem=GEM)
    mee_meo(c, "perches", "mee-coucou", "meo-salut")
    stele(c, "argile", y=786, title="Ambassadeur V", orn=None, x0=104, x1=436)
    frame_border(c, "gold", 8, 2.2)
    c.save(OUT / f"{SLUG}-ambassadeur-5.svg")
    register("ambassadeur-5", "ambassadeur", 5, "V", "L'Amphore des Panathénées",
             "La photo devient le panneau réservé d'une grande amphore à figures noires, le vase de prix des Panathénées : "
             "chaîne de palmettes sur le col, languettes noires et pourpres à l'épaule, grecque au-dessus de la photo, frise de "
             "coureurs et rayons au pied, filets d'or et un vernis noir lustré.",
             "perches : Mee (coucou) et Meo (salut) sur les anses de l'amphore", None)


# ---------------------------------------------------------------- IV — Les Îles blanches

def amb4():
    from retouche import cyclades_village, blue_dome, windmill, bell_tower, bougainvillea_cascade, shutter
    c = start("a4", top="#2C3442", bottom="#0F1218", rim="#FFE2B0")
    wp = window_path(72, 262, 468, 744, 14, arch="flat")
    m = window(c, "a4-win", wp)
    HZ = 214
    bg = [sky(c, "a4-sky", [(0, "#0A2C62"), (0.38, "#2A66AE"), (0.72, "#86BBE6"), (0.9, "#FFE3B4"), (1, "#FFF6E0")], 0, HZ + 1)]
    bg.append(f'<circle cx="270" cy="178" r="230" fill="{c.rgrad("a4-sunh", [(0, "#FFF6DC", 1), (0.22, "#FFE3A0", 0.7), (1, "#FFE3A0", 0)])}"/>')
    bg.append(sunburst(270, 178, 64, 320, 40, "#FFF2C8", 3.4, 0.22))
    bg.append(f'<circle cx="270" cy="178" r="60" fill="{c.rgrad("a4-sun", [(0, "#FFFFFF", 1), (0.7, "#FFF0C0", 1), (1, "#FFD98A", 1)])}"/>')
    bg.append(f'<rect x="0" y="{HZ}" width="540" height="200" fill="{c.grad("a4-sea", [(0, "#4C8CCF"), (0.3, "#2463A8"), (1, "#0B2F66")])}"/>')
    bg.append(f'<path d="M150 {HZ + 1} Q178 {HZ - 9} 214 {HZ - 6} Q236 {HZ - 4} 250 {HZ + 1}Z" fill="#8C9CC6" opacity="0.85"/>'
              f'<path d="M318 {HZ + 1} Q352 {HZ - 12} 392 {HZ - 7} Q414 {HZ - 3} 430 {HZ + 1}Z" fill="#7E8EBE" opacity="0.9"/>')
    bg.append(f'<path d="M248 {HZ + 1} L292 {HZ + 1} L326 {HZ + 60} L214 {HZ + 60}Z" fill="{c.grad("a4-glit", [(0, "#FFF6D8"), (1, "#FFE3A0")])}" opacity="0.5" filter="{soft(c, 4)}"/>')
    bg.append(gold_dust(17, 90, (210, HZ + 2, 330, HZ + 56), "#FFFFFF", 1.3, sparkles=0.25))
    cliff = c.grad("a4-cliff", [(0, "#B4643E"), (0.3, "#8A3E2A"), (0.6, "#5A2A24"), (1, "#2A141A")])
    bg.append(f'<path d="M-10 190 L60 188 L150 200 L206 226 L222 300 L230 960 L-10 960Z" fill="{cliff}"/>')
    bg.append(f'<path d="M550 186 L470 186 L384 200 L334 228 L318 300 L310 960 L550 960Z" fill="{cliff}"/>')
    rnd = __import__("random").Random(31)
    for k in range(16):
        y = 230 + k * 18
        bg.append(f'<path d="M-10 {f(y)} Q100 {f(y + rnd.uniform(-8, 8))} 226 {f(y + 6)}" stroke="#E0A070" stroke-width="{f(rnd.uniform(0.6, 1.6))}" fill="none" opacity="0.35"/>'
                  f'<path d="M550 {f(y)} Q440 {f(y + rnd.uniform(-8, 8))} 314 {f(y + 6)}" stroke="#E0A070" stroke-width="{f(rnd.uniform(0.6, 1.6))}" fill="none" opacity="0.35"/>')
    c.add(f'<g mask="{m}">{"".join(bg)}</g>')
    vil = [windmill(c, 40, 150, 1.0, rot=14), windmill(c, 500, 140, 0.92, rot=-8)]
    vil.append(cyclades_village(c, 0, 0, [(176, 16, 24, 70, 160), (200, 16, 26, 26, 190), (226, 18, 28, -6, 204), (254, 18, 30, -10, 210), (284, 20, 30, -10, 210)], seed=4))
    vil.append(blue_dome(c, 128, 178, 15))
    vil.append(bell_tower(c, 196, 226, 0.8))
    vil.append(blue_dome(c, 60, 254, 12))
    vil.append(cyclades_village(c, 0, 0, [(172, 16, 24, 380, 470), (198, 16, 26, 350, 510), (224, 18, 28, 336, 546), (252, 18, 30, 330, 550), (282, 20, 30, 330, 550)], seed=9))
    vil.append(blue_dome(c, 418, 174, 17))
    vil.append(bell_tower(c, 346, 224, 0.86))
    vil.append(blue_dome(c, 486, 250, 12))
    c.add(f'<g mask="{m}" filter="{c.shadow("a4-vsh", 0, 1, 1.2, "#1A2A4A", 0.35)}">{"".join(vil)}</g>')
    wall = c.grad("a4-wall", [(0, "#FFFFFF"), (0.5, "#F6F4EE"), (1, "#E2E4E8")])
    plaster = marble_filter(c, "a4-pl", seed=21, freq=(0.02, 0.03), warp=20, vein="#C9CCD4", vein_op=0.18, cloud="#C9D3E2", cloud_op=0.4, fine=False)
    c.add(f'<g mask="{m}" filter="{plaster}"><rect x="0" y="744" width="540" height="216" fill="{wall}"/></g>')
    blue = "#1F5FA8"
    fr = window_path(56, 246, 484, 758, 22, arch="flat")
    c.add(f'<path d="{fr}" fill="none" stroke="#000000" stroke-width="28" opacity="0.18" transform="translate(4 6)" filter="{soft(c, 6)}" mask="{m}"/>')
    c.add(f'<path d="{fr}" fill="none" stroke="{c.grad("a4-blue", [(0, "#4F8FD8"), (0.5, blue), (1, "#123E78")])}" stroke-width="22" mask="{m}"/>')
    c.add(f'<path d="{window_path(45, 235, 495, 769, 30, arch="flat")}" fill="none" stroke="#9CCBEE" stroke-width="1.4" opacity="0.9" mask="{m}"/>')
    inner_shadow(c, wp, 24, 0.6, "#0B2447")
    gold_line(c, wp, 2)
    c.add(shutter(c, 45, 372, 742, 40, side=-1))
    c.add(shutter(c, 495, 372, 742, 40, side=1))
    c.add(bougainvillea_cascade(c, [(70, 268, 30), (40, 300, 28), (22, 344, 22), (14, 390, 16), (110, 252, 18), (16, 436, 12)], seed=3))
    c.add(bougainvillea_cascade(c, [(468, 262, 22), (500, 290, 22), (520, 330, 16), (440, 250, 14)], seed=8))
    c.add(bougainvillea_cascade(c, [(500, 778, 26), (520, 740, 18), (470, 800, 16), (524, 812, 14)], seed=5))
    rel = relief(c, "a4-rel", scale=2.0, blur=0.8, drop=0.4, dy=1.5, sd=1.4)
    gold = gold_fill(c)
    c.add(f'<rect x="0" y="928" width="540" height="32" fill="{c.grad("a4-sea2", [(0, "#2E7CC6"), (1, "#0B2447")])}"/>')
    c.add(f'<g filter="{rel}">{waves(10, 952, 520, 18, gold, period=26)}</g>')
    crest(c, 270, 152, 0.9, "gold", division=4, gem=GEM)
    mee_meo(c, "cotes", "mee-sourire", "meo-cool")
    stele(c, "lapis", y=770, title="Ambassadeur IV", message="Le voyage continue", orn="rosettes", x0=82, x1=458)
    frame_border(c, "gold", 8, 2.2)
    c.save(OUT / f"{SLUG}-ambassadeur-4.svg")
    register("ambassadeur-4", "ambassadeur", 4, "IV", "Les Îles blanches",
             "Une fenêtre des Cyclades aux volets bleus ouverts sur la caldeira : de part et d'autre du soleil couchant, deux "
             "villages chaulés dévalent la falaise rouge en terrasses, avec leurs coupoles bleues à croix d'or, leurs campaniles "
             "et leurs moulins à voiles ; les îles bleuissent à l'horizon et la bougainvillée déborde sur le cadre.",
             "cotes : Mee (sourire) et Meo (cool) se penchent sur les volets", "Le voyage continue")


# ---------------------------------------------------------------- III — La Couronne d'olivier

def amb3():
    c = start("a3", top="#3A2430", bottom="#130A10", rim="#FFD49A")
    cx, cy, rx, ry = 270, 492, 182, 242
    wp = window_path(cx - rx, cy - ry, cx + rx, cy + ry, arch="oval")
    m = window(c, "a3-win", wp)
    por = c.grad("a3-por", [(0, "#4E1244"), (0.5, "#3A0C34"), (1, "#1E0519")])
    speck = c.def_once("a3-spk", f'<filter id="{c.id("a3-spk")}" x="0" y="0" width="100%" height="100%">'
                                 f'<feTurbulence type="fractalNoise" baseFrequency="0.42" numOctaves="3" seed="7" result="n"/>'
                                 f'<feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 0.82  0 0 0 0 0.9  0 0 0 44 -32.2" result="s"/>'
                                 f'<feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>'
                                 f'<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="s2"/></feMerge></filter>')
    c.add(f'<g mask="{m}"><rect width="540" height="960" fill="{por}" filter="{speck}"/></g>')
    c.add(f'<g mask="{m}">{sunburst(270, 150, 40, 760, 64, "#FFD98A", 2.6, 0.12)}</g>')
    c.add(f'<ellipse cx="270" cy="160" rx="230" ry="170" fill="{c.rgrad("a3-glow", [(0, "#FFE7A8", 0.6), (1, "#FFE7A8", 0)])}" mask="{m}"/>')
    rel = relief(c, "a3-rel", scale=2.4, blur=0.9, spec=1.0, exp=20, drop=0.5, dy=2, sd=2)
    gold = gold_fill(c)
    c.add(f'<g filter="{rel}">{meander_frame(16, 16, 524, 944, 2.6, gold)}</g>')
    inner_shadow(c, wp, 24, 0.75)
    gold_line(c, wp, 2.6)
    c.add(f'<g filter="{rel}">{oval_wreath(cx, cy, rx + 14, ry + 12, gold, under="#F2CF6A", rib="#7A4E10", berries="#6A1A5C", n=30, L=34, w=12, gap=56, bottom_gap=30, seed=6)}</g>')
    bx, by = cx, cy + ry + 14
    rib = c.grad("a3-rib", [(0, "#9A2A84"), (0.5, "#6A1A5C"), (1, "#3E0C36")])
    c.add(f'<g filter="{c.shadow("a3-ribsh", 0, 3, 3, "#000000", 0.55)}">'
          f'<path d="M{bx} {by} C{bx - 40} {by - 26} {bx - 92} {by - 14} {bx - 84} {by + 14} C{bx - 74} {by + 34} {bx - 30} {by + 18} {bx} {by}Z" fill="{rib}"/>'
          f'<path d="M{bx} {by} C{bx + 40} {by - 26} {bx + 92} {by - 14} {bx + 84} {by + 14} C{bx + 74} {by + 34} {bx + 30} {by + 18} {bx} {by}Z" fill="{rib}"/>'
          f'<path d="M{bx - 6} {by + 4} C{bx - 30} {by + 40} {bx - 70} {by + 50} {bx - 110} {by + 44} L{bx - 98} {by + 58} L{bx - 120} {by + 62} C{bx - 64} {by + 70} {bx - 26} {by + 50} {bx - 2} {by + 10}Z" fill="{rib}"/>'
          f'<path d="M{bx + 6} {by + 4} C{bx + 30} {by + 40} {bx + 70} {by + 50} {bx + 110} {by + 44} L{bx + 98} {by + 58} L{bx + 120} {by + 62} C{bx + 64} {by + 70} {bx + 26} {by + 50} {bx + 2} {by + 10}Z" fill="{rib}"/>'
          f'<ellipse cx="{bx}" cy="{by + 2}" rx="12" ry="10" fill="#7A1E6A" stroke="#E8B53C" stroke-width="1.4"/></g>')
    for x, flip in ((64, False), (476, True)):
        c.add(f'<rect x="{x - 42}" y="742" width="84" height="16" rx="2" fill="{c.grad("a3-plinth", [(0, "#F4EFE5"), (1, "#B9B0A0")])}"/>')
        c.add(f'<g filter="{c.shadow("a3-amph", 0, 4, 4, "#000000", 0.6)}">{amphora(c, x, 614, 128, figures="runners" if not flip else "torch", seed=1 if not flip else 2, gold="#E8B53C")}</g>')
    c.add(gold_dust(13, 70, (20, 20, 520, 940), "#FFE6A0", 1.5, keep=outside(cx - rx, cy - ry, cx + rx, cy + ry, 6)))
    crest(c, 270, 150, 0.92, "gold", division=3, gem=GEM)
    mee_meo(c, "perches", "mee-bravo", "meo-trophee")
    stele(c, "pourpre", y=790, title="Ambassadeur III", message="Pour toi, maman", orn="palmette", x0=96, x1=444)
    c.save(OUT / f"{SLUG}-ambassadeur-3.svg")
    register("ambassadeur-3", "ambassadeur", 3, "III", "La Couronne d'olivier",
             "La couronne d'olivier des vainqueurs d'Olympie, en or, enserre la photo, nouée d'un ruban de pourpre ; deux "
             "amphores panathénaïques à figures noires (coureurs, porteur de flambeau), le prix des athlètes rempli d'huile "
             "sacrée, gardent la stèle sur un fond de porphyre et de grecque d'or.",
             "perches : Mee (bravo) et Meo (trophée) de part et d'autre du blason", "Pour toi, maman")


# ---------------------------------------------------------------- II — Le Banquet des Éthiopiens

def amb2():
    from afrique import meroe, dunes, kente_sash, dwennimmen_horns, adinkra_cloth
    c = start("a2", top="#3A2A1E", bottom="#120C08", rim="#FFC27A")
    wp = window_path(88, 304, 452, 734, 6)
    m = window(c, "a2-win", wp)
    HZ = 214
    bg = [sky(c, "a2-sky", [(0, "#0C0724"), (0.07, "#251046"), (0.135, "#5E1E52"), (0.185, "#B8443C"), (0.212, "#F79A48"), (0.2225, "#FFE3A6"),
                            (0.2235, "#3A1C2A"), (0.4, "#24122A"), (1, "#0E0812")])]
    bg.append(f'<ellipse cx="270" cy="{HZ}" rx="380" ry="120" fill="{c.rgrad("a2-sun", [(0, "#FFF4D0", 0.95), (0.25, "#FFC06A", 0.6), (0.6, "#E0603A", 0.2), (1, "#E0603A", 0)])}"/>')
    bg.append(star_field(4, 140, (0, 0, 540, 150), rmax=1.3))
    c.add(f'<g mask="{m}">{"".join(bg)}</g>')
    # la skyline de Koush : dunes, pyramides de Méroé et palmiers, en contre-jour sur le couchant
    sil, sil2 = "#2A1230", "#1A0A1E"
    sk = [dunes(-10, 200, HZ + 2, 22, "#4A1E36", seed=2, n=3), dunes(340, 550, HZ + 2, 20, "#4A1E36", seed=5, n=3)]
    far = "#5A2440"
    for x, h in ((70, 70), (112, 52), (150, 40)):
        sk.append(meroe(c, x, HZ - 4, h, far, "#FF9A58", "#FFD08A", light_from=1, chapel=False))
    for x, h in ((470, 74), (428, 50), (392, 38)):
        sk.append(meroe(c, x, HZ - 4, h, far, "#FF9A58", "#FFD08A", light_from=-1, chapel=False))
    for x, h in ((22, 138), (92, 96)):
        sk.append(meroe(c, x, HZ + 2, h, sil, "#FF8A48", "#FFD08A", light_from=1))
    for x, h in ((520, 146), (452, 90)):
        sk.append(meroe(c, x, HZ + 2, h, sil, "#FF8A48", "#FFD08A", light_from=-1))
    for x, h, ln, sd in ((58, 66, -6, 3), (128, 46, 8, 5), (486, 60, 6, 7), (412, 44, -8, 9)):
        sk.append(palm(x, HZ + 4, h, sil2, seed=sd, lean=ln))
    sk.append(dunes(-10, 190, HZ + 4, 10, sil2, seed=11, n=4))
    sk.append(dunes(350, 550, HZ + 4, 10, sil2, seed=13, n=4))
    c.add(f'<g mask="{m}">{"".join(sk)}</g>')
    nile = [f'<rect x="0" y="{HZ + 4}" width="540" height="{740 - HZ}" fill="{c.grad("a2-nile", [(0, "#5A2A3A"), (0.06, "#2A1A3E"), (1, "#0C0A1A")])}"/>']
    rnd = __import__("random").Random(9)
    for _ in range(60):
        y = rnd.uniform(HZ + 10, 740)
        L = rnd.uniform(6, 22)
        nile.append(f'<path d="M{f(rnd.uniform(0, 540))} {f(y)} h{f(L)}" stroke="#FFC27A" stroke-width="1" opacity="{f(rnd.uniform(0.15, 0.5))}"/>')
    c.add(f'<g mask="{m}">{"".join(nile)}</g>')
    tone = "warm"
    mf = marble_filter(c, "a2-mb", seed=9, freq=(0.006, 0.02), warp=50, vein="#9A7E58", vein_op=0.35, cloud="#C9A878", cloud_op=0.3)
    tymp_fill = c.grad("a2-tymp", [(0, "#1C3B78"), (1, "#0B1E44")])
    ped, tymp = pediment(c, 40, 500, HZ, 124, tone, rim=10, tymp=tymp_fill, cornice=12)
    ent, ybot, fr0 = entablature(c, 16, 524, HZ - 2, tone, arch_h=22, frieze_h=46, frieze=lambda a, b, cc, d: "", dentil=False)
    c.add(f'<g filter="{mf}">{ped}{ent}</g>')
    tclip = inside(c, "a2-tclip", tymp)
    c.add(f'<g clip-path="{tclip}">{adinkra_cloth(c, 60, 92, 480, 220, 26, "#E8B53C", 0.42, seed=1)}'
          f'<rect x="0" y="80" width="540" height="140" fill="{c.rgrad("a2-tglow", [(0, "#FFE7A8", 0.55), (1, "#FFE7A8", 0)])}"/></g>')
    tri, centers = triglyphs(16, fr0, 524, fr0 + 46, "#1C3F78", "#0C2244", n=6)
    c.add(tri)
    rel = relief(c, "a2-rel", scale=2.4, blur=0.9, spec=1.0, exp=20, drop=0.45, dy=1.5, sd=1.4)
    gold = gold_fill(c)
    met = c.grad("a2-met", [(0, "#C4502E"), (0.55, "#9A3420"), (1, "#6E2014")])
    names = ["nsoromma", "dwennimmen", "akoma", "adinkrahene", "sankofa", "nsoromma"]
    for (mx, my), nm in zip(centers, names):
        c.add(f'<rect x="{f(mx - 27)}" y="{f(fr0 + 3)}" width="54" height="40" fill="{met}"/>'
              f'<rect x="{f(mx - 27)}" y="{f(fr0 + 3)}" width="54" height="40" fill="none" stroke="#3A0E08" stroke-width="1.2" opacity="0.6"/>')
        sym = dwennimmen_horns(mx, my, 0.62, gold, 4.4) if nm == "dwennimmen" else adinkra(nm, mx, my, 0.66, gold)
        c.add(f'<g filter="{rel}">{sym}</g>')
    ky = fr0 + 46 + 3
    c.add(f'<g filter="{c.shadow("a2-kt", 0, 2, 1.5, "#000000", 0.5)}">{kente(16, ky, 508, 16, seed=3, cell=22)}</g>')
    cols = "".join(column(c, x, ybot, 736, 46, "doric", tone, flutes=12) for x in (40, 500))
    c.add(f'<g filter="{mf}">{cols}</g>')
    for x, sd in ((40, 2), (500, 6)):
        c.add(f'<g filter="{c.shadow("a2-sash", 0, 2, 1.5, "#000000", 0.45)}">{kente_sash(c, x, ybot + 46, 40, 18, seed=sd, bulge=4)}'
              f'{kente_sash(c, x, 676, 44, 14, seed=sd + 1, bulge=4)}</g>')
        tas = []
        for k, dx in enumerate((-12, 0, 12)):
            for j in range(3):
                tas.append(cowrie(c, x + dx, ybot + 74 + j * 13 + (k == 1) * 5, 0.62, 0))
            tas.append(f'<circle cx="{f(x + dx)}" cy="{f(ybot + 68 + (k == 1) * 5)}" r="2.2" fill="#E8B53C"/>')
        c.add(f'<g filter="{c.shadow("a2-cw2", 0, 1.5, 1, "#000000", 0.6)}">{"".join(tas)}</g>')
    c.add(f'<rect x="0" y="736" width="540" height="224" fill="{c.grad("a2-pod", [(0, "#E8D2AC"), (1, "#9A7E58")])}" filter="{mf}"/>')
    c.add(f'<g filter="{mf}">{stylobate(c, 0, 540, 736, 3, 13, 0, tone)}</g>')
    c.add(kente(0, 736, 540, 13, seed=5, cell=24))
    c.add(f'<rect x="0" y="912" width="540" height="22" fill="#1C3F78"/>')
    c.add(f'<g filter="{rel}">{meander(14, 914.5, 512, 1.9, gold, rails=False)}</g>')
    row = "".join(cowrie(c, 30 + i * 24, 900, 0.7, 90) for i in range(21))
    c.add(f'<g filter="{c.shadow("a2-cw3", 0, 1.5, 1, "#000000", 0.55)}">{row}</g>')
    inner_shadow(c, wp, 20, 0.7)
    gold_line(c, wp, 2.2)
    for x0, x1, seed in ((70, 200, 1), (340, 470, 2)):
        pts = []
        mx = (x0 + x1) / 2
        for i, (x, y, a, t) in enumerate(quad_points((x0, ybot + 4), (mx, ybot + 62), (x1, ybot + 4), 15)):
            pts.append(cowrie(c, x, y, 0.98, a + 90))
            if i % 3 == 1:
                pts.append(f'<circle cx="{f(x)}" cy="{f(y + 11)}" r="3.4" fill="{gold}"/>')
        c.add(f'<g filter="{c.shadow("a2-cw", 0, 2, 1.5, "#000000", 0.6)}">{"".join(pts)}</g>')
    c.add(f'<circle cx="270" cy="140" r="84" fill="{c.rgrad("a2-halo", [(0, "#FFE7A8", 0.75), (1, "#FFE7A8", 0)])}"/>')
    crest(c, 270, 126, 0.8, "gold", division=2, gem=GEM)
    mee_meo(c, "ruban", "mee-lettre", "meo-bravo")
    stele(c, "lapis", y=780, title="Ambassadeur II", message="Merci la famille", orn="rosettes", x0=96, x1=444)
    frame_border(c, "gold", 8, 2.2)
    c.save(OUT / f"{SLUG}-ambassadeur-2.svg")
    register("ambassadeur-2", "ambassadeur", 2, "II", "Le Banquet des Éthiopiens",
             "Homère fait descendre les dieux de l'Olympe festoyer chez les « Éthiopiens irréprochables », que les Grecs "
             "situaient au royaume de Koush : derrière le temple, les pyramides de Méroé et leurs palmiers se découpent sur le "
             "couchant du Nil. Le tympan est une toile adinkra estampée d'or, les métopes portent Nsoromma, Dwennimmen, Akoma, "
             "Adinkrahene et Sankofa, le kente ashanti ceint la frise et les colonnes, et les cauris pendent en festons.",
             "ruban : Mee (lettre) et Meo (bravo) au bord de la stèle", "Merci la famille")


# ---------------------------------------------------------------- I — L'Acropole d'or

def amb1():
    c = start("a1", top="#3A2A1E", bottom="#120C08", rim="#FFD49A")
    wp = window_path(92, 292, 448, 728, 6)
    m = window(c, "a1-win", wp)
    bg = [sky(c, "a1-sky", [(0, "#160A2E"), (0.16, "#3E1A5A"), (0.3, "#9A3A6A"), (0.42, "#F08A4A"), (0.52, "#FFD98A"), (0.6, "#FFF0C8"), (1, "#E8B86A")])]
    bg.append(f'<g opacity="0.5">{sunburst(270, 180, 90, 820, 72, "#FFF2C8", 2.2, 0.3)}</g>')
    c.add(f'<g mask="{m}">{"".join(bg)}</g>')
    c.add(f'<g mask="{m}">{star_field(8, 60, (0, 0, 540, 90), rmax=1.2)}</g>')
    tone = "marble"
    mf = marble_filter(c, "a1-mb", seed=12, freq=(0.0055, 0.018), warp=70, vein="#77706A", vein_op=0.45, cloud="#C9C0B0", cloud_op=0.3, gold=True, gold_color="#E2A93A")
    tymp_fill = c.grad("a1-tymp", [(0, "#1B3E78"), (1, "#0B2447")])
    ped, tymp = pediment(c, 34, 506, 214, 124, tone, rim=11, tymp=tymp_fill, cornice=13)
    ent, ybot, fr0 = entablature(c, 12, 528, 212, tone, arch_h=20, frieze_h=30, frieze=lambda a, b, cc, d: "", dentil=True)
    c.add(f'<g filter="{mf}">{ped}{ent}</g>')
    rel = relief(c, "a1-rel", scale=2.6, blur=0.9, spec=1.1, exp=18, drop=0.5, dy=2, sd=1.8)
    gold = gold_fill(c)
    c.add(f'<rect x="12" y="{f(fr0)}" width="516" height="30" fill="#0B2447"/>')
    c.add(f'<g filter="{rel}">{anthemion(20, fr0 + 24, 500, 22, gold, unit=30)}</g>')
    tclip = inside(c, "a1-tclip", tymp)
    c.add(f'<g clip-path="{tclip}"><g filter="{rel}">{sunburst(270, 204, 26, 110, 26, gold, 5, 0.9, -90, 90)}</g></g>')
    c.add(f'<g filter="{rel}">{horse(166, 189, 0.34, gold, flip=False, wing_fill=gold, wing_dark="#7A4E10", wing_light="#FFF4C2", pose="rear")}'
          f'{horse(374, 189, 0.34, gold, flip=True, wing_fill=gold, wing_dark="#7A4E10", wing_light="#FFF4C2", pose="rear")}</g>')
    cols = "".join(column(c, x, ybot, 736, 50, "corinthian", tone, cap_tone="gold") for x in (42, 498))
    c.add(f'<g filter="{mf}">{cols}</g>')
    caps = "".join(column(c, x, ybot, ybot + 58, 50, "corinthian", "gold", base=False) for x in (42, 498))
    c.add(f'<g filter="{rel}"><g clip-path="url(#{c.id("a1-capclip")})">{caps}</g></g>')
    c.def_once("a1-capclip", f'<clipPath id="{c.id("a1-capclip")}"><rect x="0" y="{f(ybot)}" width="540" height="58"/></clipPath>')
    c.add(f'<rect x="0" y="736" width="540" height="224" fill="{c.grad("a1-pod", [(0, "#F4EFE5"), (1, "#B9B0A0")])}" filter="{mf}"/>')
    c.add(f'<g filter="{mf}">{stylobate(c, 0, 540, 736, 3, 12, 0, tone)}</g>')
    for y in (736, 748, 760):
        c.add(f'<rect x="0" y="{y}" width="540" height="1.6" fill="#E8B53C" opacity="0.9"/>')
    c.add(f'<rect x="0" y="914" width="540" height="24" fill="#0B2447"/>')
    c.add(f'<g filter="{rel}">{meander(12, 917, 516, 2.0, gold, rails=False)}</g>')
    inner_shadow(c, wp, 22, 0.75)
    gold_line(c, wp, 2.6)
    for x0, x1 in ((72, 200), (340, 468)):
        c.add(f'<g filter="{rel}">{festoon(c, x0, ybot + 6, x1, ybot + 6, 30, gold, "#FFF0B8", "#8A5A12", 14, 16, 6.4, ribbon="#5B1A4E", berries="#FFF4C2")}</g>')
    c.add(f'<g filter="{c.shadow("a1-tri", 0, 4, 4, "#000000", 0.55)}">{tripod(c, 44, 900, 0.62, gold, "#5E3A08")}{tripod(c, 496, 900, 0.62, gold, "#5E3A08")}</g>')
    c.add(f'<g filter="{rel}">{owl(c, 270, 52, 0.42, body="#E1A93A", dark="#6A420C", light="#FFF1C4")}</g>')
    c.add(f'<circle cx="270" cy="150" r="70" fill="{c.rgrad("a1-halo", [(0, "#FFF6D8", 0.8), (1, "#FFF6D8", 0)])}"/>')
    crest(c, 270, 152, 0.8, "gold", division=1, gem=GEM)
    bird(c, "mee-fete", 92, 690, 132, False, -6)
    bird(c, "meo-roi", 448, 690, 132, True, 6)
    stele(c, "marbre", y=780, title="Ambassadeur I", message="On l'a fait ensemble", orn="palmette", x0=96, x1=444)
    frame_border(c, "gold", 8, 2.6)
    c.save(OUT / f"{SLUG}-ambassadeur-1.svg")
    register("ambassadeur-1", "ambassadeur", 1, "I", "L'Acropole d'or",
             "Le sommet du rang : un portique corinthien au marbre veiné d'or, une frise de palmettes, deux Pégase d'or affrontés "
             "dans le fronton autour du soleil, la chouette d'Athéna en acrotère, des festons de laurier et deux trépieds où brûle "
             "la flamme, sous un couchant pourpre et or.",
             "pied : Mee (fête) et Meo (roi) sur les degrés, près des trépieds", "On l'a fait ensemble")


ALL = [amb5, amb4, amb3, amb2, amb1]
