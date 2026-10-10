"""Oracle : le ciel s'ouvre au-dessus des royaumes, et l'on entrevoit le minuscule — la graine, le cristal, la diatomée."""

from kit import *  # noqa: F401,F403
from archi import *  # noqa: F401,F403
from infini import *  # noqa: F401,F403

INK = "#F2C76A"


def oracle_crest(c, cx=270, cy=150, s=0.92):
    crest(c, cx, cy, s, "obsidian", division=None, ink=INK, edge=INK)


def sky(c, name, mask, stops, seed, n=520, region=(0, 0, 540, 960)):
    g = c.grad(name, stops)
    c.add(f'<rect width="540" height="960" fill="{g}" mask="{mask}"/>')
    c.add(f'<g mask="{mask}">{star_field(seed, n, *region)}</g>')


def orc_a():
    """A — La Graine et l'Étoile (cosmogonie dogon)."""
    c = start("ra", top="#241C3A", bottom="#0A0816", rim="#C8D8FF", glow=0.18)
    win = (78, 262, 462, 726, 24)
    m = window(c, "ra-win", *win)
    sky(c, "ra-sky", m, [(0, "#050824"), (0.45, "#0E1446"), (0.8, "#24164A"), (1, "#0A0614")], 5, 560)
    c.add(f'<g mask="{m}">{milky_way(c, "ra-mw", -40, 760, 580, 0, 90, "#E8E0FF", "#7A6ACF", 4, 1400)}</g>')
    sp = []
    for i in range(7 * 60):
        t = i / (7 * 60)
        a = t * 7 * 2 * math.pi
        r = 8 + t * 104
        sp.append(f"{f(270 + r * math.cos(a))} {f(136 + r * math.sin(a) * 0.92)}")
    c.add(f'<path d="M{" L".join(sp)}" fill="none" stroke="#F2C76A" stroke-width="1.1" opacity="0.38"/>')
    c.add(f'<circle cx="270" cy="136" r="116" fill="none" stroke="#F2C76A" stroke-width="0.8" opacity="0.5" stroke-dasharray="1 4"/>')
    sx, sy = 92, 116
    c.add(f'<g mask="{m}">')
    nebula(c, "ra-n1", 110, 150, 180, 150, "#4A6ACF", "#1A1A5A", 0.5)
    nebula(c, "ra-n2", 440, 170, 170, 140, "#AF6A3A", "#2A1A4A", 0.35)
    c.add("</g>")
    halo(c, "ra-sir", sx, sy, 100, 100, "#BFE0FF", 0.6)
    cma = [(sx, sy), (60, 168), (40, 226), (104, 214), (132, 250), (128, 176), (150, 70)]
    c.add(constellation(cma, [(0, 1), (1, 2), (1, 3), (3, 4), (0, 5), (5, 3), (0, 6)], "#BFD8FF", 1, 1.8, 0.75))
    c.add(f'<ellipse cx="{sx}" cy="{sy}" rx="44" ry="15" fill="none" stroke="#F2C76A" stroke-width="1" stroke-dasharray="3 3" opacity="0.85" transform="rotate(-24 {sx} {sy})"/>')
    bx, by = pt(sx, sy, 40, 70)
    c.add(f'<circle cx="{f(bx)}" cy="{f(by + 10)}" r="2.6" fill="#FFFFFF"/><circle cx="{f(bx)}" cy="{f(by + 10)}" r="7" fill="#BFE0FF" opacity="0.35"/>')
    c.add(spikes(sx, sy, 40, "#FFFFFF", op=1) + spikes(sx, sy, 22, "#BFE0FF", op=0.8, rot=45))
    c.add(f'<circle cx="{sx}" cy="{sy}" r="7" fill="#FFFFFF"/>')
    lx, ly, lr = 446, 124, 62
    c.add(f'<circle cx="{lx}" cy="{ly}" r="{lr}" fill="{c.rgrad("ra-lens", [(0, "#3A2A10", 1), (0.8, "#1A1206", 1), (1, "#0A0804", 1)])}"/>')
    c.def_once("ra-lc", f'<clipPath id="{c.id("ra-lc")}"><circle cx="{lx}" cy="{ly}" r="{lr - 3}"/></clipPath>')
    inside = (cell(c, lx - 34, ly + 30, 22, ("#FFE6A0", "#B08A3A", "#4A3410"), 4, 0.6) + cell(c, lx + 40, ly - 34, 18, ("#FFE6A0", "#B08A3A", "#4A3410"), 6, 0.5)
              + pollen(c, lx + 36, ly + 30, 9, seed=2) + pollen(c, lx - 38, ly - 30, 7, seed=5) + seed_spiral(c, lx, ly, 1.05))
    c.add(f'<g clip-path="url(#{c.id("ra-lc")})">{inside}</g>')
    c.add(f'<circle cx="{lx}" cy="{ly}" r="{lr}" fill="{c.rgrad("ra-glass", [(0, "#FFFFFF", 0), (0.75, "#FFFFFF", 0), (0.95, "#FFF4C2", 0.18), (1, "#FFF4C2", 0)], 0.4, 0.35, 0.6)}"/>')
    c.add(lens_ring(lx, ly, lr, "#F2C76A", 2.4))
    c.add(f'<path d="M{sx + 30} {sy - 18} C 200 30, 340 30, {lx - lr + 4} {ly - 26}" fill="none" stroke="#F2C76A" stroke-width="1" stroke-dasharray="1 5" stroke-linecap="round" opacity="0.9"/>')
    for i, yy in enumerate((304, 376, 448, 520, 592, 664)):
        r = 7 + i * 1.5
        c.add(pollen(c, 40, yy, r, seed=10 + i) if i % 2 == 0 else seed_spiral(c, 40, yy, 0.3 + i * 0.035))
    c.add(f'<path d="M40 300 L40 660" stroke="#F2C76A" stroke-width="0.7" opacity="0.5" stroke-dasharray="2 4"/>')
    ori = [(500, 296), (488, 360), (512, 420), (482, 470), (500, 520), (518, 590), (494, 664)]
    c.add(constellation(ori, [(i, i + 1) for i in range(len(ori) - 1)], "#BFD8FF", 0.9, 1.7, 0.85))
    c.add(spikes(500, 520, 12, "#FFFFFF", op=0.9))
    cliffp = "M0 960 L0 752 L40 748 L60 738 L120 742 L170 732 L220 740 L320 736 L380 744 L430 734 L480 742 L540 738 L540 960Z"
    c.add(f'<path d="{cliffp}" fill="{c.grad("ra-cliff", [(0, "#4A3A7A"), (0.4, "#2A1E4A"), (1, "#0A0614")])}"/>')
    c.add("".join(f'<path d="M{x} {y} l{d} 60" stroke="#8A7ACF" stroke-width="1" opacity="0.35"/>' for x, y, d in ((70, 748, -3), (150, 740, 2), (250, 742, -2), (350, 742, 3), (420, 740, -1), (500, 744, 2))))
    c.add(f'<path d="M0 752 L40 748 L60 738 L120 742 L170 732 L220 740 L320 736 L380 744 L430 734 L480 742 L540 738" fill="none" stroke="#8A9AFF" stroke-width="1.2" opacity="0.6"/>')
    for gx, s in ((34, 0.5), (66, 0.4), (474, 0.42), (508, 0.52)):
        c.add(granary(c, gx, 746, s, ("#6A5A9A", "#3A2E6A", "#1A1238"), ("#8A7AB0", "#4A3E7A", "#1A1238"), False))
    wp = window_path(*win)
    inner_shadow(c, wp, 22, 0.8)
    gold_line(c, wp, 2.2)
    oracle_crest(c, 270, 136, 0.86)
    mee_meo(c, "pied", "mee-wow", "meo-bravo")
    plate(c, "Oracle", None, y=786, style="nuit", title_size=42)
    finish(c, "oracle-a", "oracle", None, "A", "La Graine et l'Étoile",
           "La cosmogonie dogon relie la plus petite graine, le po (le fonio), où le monde dort enroulé en spirale, à l'étoile de "
           "Sirius et à son invisible compagne : à gauche l'astre et sa constellation, à droite la graine vue à la loupe parmi les "
           "pollens et les cellules, et derrière le blason la même spirale à sept tours ; en bas, la falaise de Bandiagara et ses "
           "greniers sous la nuit.",
           "pied : Mee (wow) et Meo (bravo) sur la falaise", None)


def odu(x, y, marks, color=INK, s=1.0):
    """Un signe d'Ifá (odu) : quatre rangées de traits simples ou doubles — l'écriture binaire des devins yoruba."""
    out = []
    for i, mk in enumerate(marks):
        yy = y + i * 9 * s
        if mk == 1:
            out.append(f'<line x1="{f(x)}" y1="{f(yy - 3 * s)}" x2="{f(x)}" y2="{f(yy + 3 * s)}" stroke="{color}" stroke-width="{f(2 * s)}" stroke-linecap="round"/>')
        else:
            out.append(f'<line x1="{f(x - 3 * s)}" y1="{f(yy - 3 * s)}" x2="{f(x - 3 * s)}" y2="{f(yy + 3 * s)}" stroke="{color}" stroke-width="{f(2 * s)}" stroke-linecap="round"/>'
                       f'<line x1="{f(x + 3 * s)}" y1="{f(yy - 3 * s)}" x2="{f(x + 3 * s)}" y2="{f(yy + 3 * s)}" stroke="{color}" stroke-width="{f(2 * s)}" stroke-linecap="round"/>')
    return "".join(out)


def orc_b():
    """B — Les Seize Cauris (Ifá)."""
    c = start("rb", top="#2A1A34", bottom="#0C0614", rim="#E8C8FF", glow=0.18)
    win = (80, 280, 460, 726, 18)
    m = window(c, "rb-win", *win)
    sky(c, "rb-sky", m, [(0, "#0A0420"), (0.5, "#1E0A36"), (1, "#0C0414")], 7, 420)
    c.add(f'<g mask="{m}">')
    nebula(c, "rb-n1", 120, 160, 200, 140, "#7A3AAF", "#2A0A4A", 0.5)
    nebula(c, "rb-n2", 440, 120, 160, 120, "#AF3A7A", "#2A0A4A", 0.35)
    c.add(flower_of_life(270, 150, 44, "#F2C76A", 0.8, 2, 0.32))
    c.add("</g>")
    cx, cy = 270, 150
    tray = c.rgrad("rb-tray", [(0, "#5A3418", 1), (0.8, "#3A1E0C", 1), (1, "#1E0E06", 1)])
    c.add(f'<circle cx="{cx}" cy="{cy}" r="104" fill="#000000" opacity="0.5" filter="{soft(c, 8)}"/>')
    c.add(f'<circle cx="{cx}" cy="{cy}" r="100" fill="none" stroke="{tray}" stroke-width="22"/>')
    c.add("".join(f'<line x1="{f(pt(cx, cy, 90, a)[0])}" y1="{f(pt(cx, cy, 90, a)[1])}" x2="{f(pt(cx, cy, 110, a)[0])}" y2="{f(pt(cx, cy, 110, a)[1])}" stroke="#1E0E06" stroke-width="2"/>' for a in range(0, 360, 10)))
    c.add(f'<circle cx="{cx}" cy="{cy}" r="111" fill="none" stroke="#C9A060" stroke-width="1.4"/><circle cx="{cx}" cy="{cy}" r="89" fill="none" stroke="#C9A060" stroke-width="1.4"/>')
    c.add(star_polygon(cx, cy, 100, 16, 5, "#F2C76A", 0.9, 0.55))
    for i in range(16):
        x, y = pt(cx, cy, 100, i * 22.5)
        c.add(cowrie(c, x, y, 0.62, i * 22.5, back=(i % 3 == 1)))
    halo(c, "rb-h", cx, cy, 80, 80, "#FFD27A", 0.35)
    for (x, y), stp in zip(((40, 300), (500, 300)), (((1, 2, 2, 1), (2, 1, 1, 2), (1, 1, 2, 2), (2, 2, 1, 1), (1, 2, 1, 2), (2, 1, 2, 1)),
                                                    ((2, 2, 1, 1), (1, 2, 1, 2), (2, 1, 2, 1), (1, 1, 2, 2), (1, 2, 2, 1), (2, 1, 1, 2)))):
        for k, mk in enumerate(stp):
            yy = y + k * 66
            c.add(f'<rect x="{x - 16}" y="{yy - 8}" width="32" height="44" rx="4" fill="#1A0A26" stroke="#C9A060" stroke-width="0.8" opacity="0.9"/>')
            c.add(odu(x - 6, yy, mk, INK, 0.9) + odu(x + 6, yy, tuple(reversed(mk)), INK, 0.9))
    c.add(constellation([(20, 40), (60, 70), (96, 50), (130, 86)], [(0, 1), (1, 2), (2, 3)], "#E9DDFF", 0.9, 1.6, 0.8))
    c.add(constellation([(420, 60), (452, 40), (494, 66), (520, 34)], [(0, 1), (1, 2), (2, 3)], "#E9DDFF", 0.9, 1.6, 0.8))
    wp = window_path(*win)
    inner_shadow(c, wp, 22, 0.8)
    gold_line(c, wp, 2.2)
    c.add(f'<rect x="0" y="880" width="540" height="80" fill="#140A06"/>')
    c.add(basket_weave(0, 884, 540, 960, 14))
    c.add(f'<rect x="0" y="880" width="540" height="80" fill="{lgrad(c, "rb-mat", [(0, "#000000", 0.55), (1, "#000000", 0.2)])}"/>')
    c.add(crystal(c, 30, 912, 1.0, ("#F4E8FF", "#B48AFF", "#4A2A8A"), 6, 4, -8))
    c.add(crystal(c, 512, 916, 0.9, ("#F4E8FF", "#C89AFF", "#4A2A8A"), 5, 9, 8))
    c.add(snowflake(52, 206, 24, "#E9DDFF", 1.0, 2, 0, 0.9) + snowflake(488, 200, 20, "#E9DDFF", 0.9, 2, 15, 0.85))
    c.add(f'<circle cx="52" cy="206" r="30" fill="#B48AFF" opacity="0.18"/><circle cx="488" cy="200" r="26" fill="#B48AFF" opacity="0.18"/>')
    for i, (x, y, r) in enumerate(((176, 924, 0), (214, 940, 60), (330, 930, 120), (366, 944, 20))):
        c.add(cowrie(c, x, y, 0.7, r, back=(i % 2 == 1)))
    oracle_crest(c, cx, cy, 0.84)
    plate(c, "Oracle", "À nos ancêtres", y=752, style="violet", title_size=42)
    duo(c, "ruban", "mee-coucou", "meo-cool")
    finish(c, "oracle-b", "oracle", None, "B", "Les Seize Cauris",
           "Seize cauris, le nombre du merindinlogun, tournent sur le plateau d'Ifá autour du blason, reliés en rosace étoilée sur une "
           "fleur de vie ; le long de la photo, les signes odu des devins yoruba, traits simples ou doubles, écrivent un code binaire ; "
           "au pied, une natte de raphia, des druses d'améthyste et deux flocons.",
           "ruban : Mee (coucou) et Meo (cool) au bord de l'inscription", "À nos ancêtres")


def orc_c():
    """C — La Mer d'Olokun."""
    c = start("rc", top="#1A2A3A", bottom="#06101A", rim="#BFF0FF", glow=0.18)
    win = (84, 276, 456, 724, 26)
    m = window(c, "rc-win", *win)
    sky(c, "rc-sky", m, [(0, "#040A20"), (0.24, "#0C1A46"), (0.27, "#0E3A52"), (0.6, "#08283A"), (1, "#020A12")], 9, 260, (0, 0, 540, 250))
    c.add(f'<g mask="{m}">')
    c.add(f'<rect x="0" y="252" width="540" height="708" fill="{lgrad(c, "rc-depth", [(0, "#1AA0A8", 0.25), (0.4, "#0A4A5A", 0.1), (1, "#000000", 0.4)])}"/>')
    c.add(f'<path d="M0 252 L540 252" stroke="#BFF0FF" stroke-width="1.2" opacity="0.6"/>')
    rnd = random.Random(4)
    for i in range(16):
        side = i % 2
        x = rnd.uniform(18, 70) if side == 0 else rnd.uniform(470, 522)
        y = 300 + (i // 2) * 52 + rnd.uniform(-10, 10)
        kind = ("centric", "pennate", "radiolaire")[i % 3]
        c.add(diatom(c, x, y, rnd.uniform(11, 18), kind, ("#E6FFFB", "#7FF0E0", "#1E7A80"), rnd.uniform(0, 180)))
    c.add("".join(f'<circle cx="{f(rnd.uniform(0, 540))}" cy="{f(rnd.uniform(260, 960))}" r="{f(rnd.uniform(0.5, 1.6))}" fill="#BFF8FF" opacity="{f(rnd.uniform(0.2, 0.7))}"/>' for _ in range(120)))
    c.add("</g>")
    c.add(moon(c, 270, 140, 66))
    c.add(constellation([(40, 50), (80, 90), (64, 140), (110, 176)], [(0, 1), (1, 2), (2, 3)], "#DDF6FF", 0.9, 1.7, 0.8))
    c.add(constellation([(430, 40), (470, 76), (512, 60), (496, 120)], [(0, 1), (1, 2), (1, 3)], "#DDF6FF", 0.9, 1.7, 0.8))
    rf = relief(c, "rc-rel", scale=2.4, el=38)
    c.add(grp(mudfish(c, 0, 0, 0.82, 0, False), 148, 136, 1, -20, filt=rf), grp(mudfish(c, 0, 0, 0.82, 0, True), 392, 136, 1, 20, filt=rf))
    coral = c.rgrad("rc-coral", [(0, "#FFB7A0", 1), (0.5, "#E2583E", 1), (1, "#7A1E10", 1)], 0.35, 0.3, 0.7)
    for x, n in ((74, 13), (466, 13)):
        beads = []
        for k in range(n):
            y = 286 + k * 18 + (8 if x > 270 else 0)
            beads.append(f'<ellipse cx="{x}" cy="{y}" rx="5.6" ry="7.6" fill="{coral}"/><circle cx="{x - 1.6}" cy="{y - 2.4}" r="1.4" fill="#FFFFFF" opacity="0.6"/>')
        c.add(f'<line x1="{x}" y1="270" x2="{x}" y2="{286 + n * 18}" stroke="#C9A060" stroke-width="0.8"/><g filter="{c.shadow("rc-bd", 0, 2, 1.5, "#000", 0.5)}">{"".join(beads)}</g>')
    wp = window_path(*win)
    inner_shadow(c, wp, 22, 0.8)
    gold_line(c, wp, 2.4, "bronze")
    for k in range(7):
        y = 742 + k * 30
        c.add(f'<path d="M-20 {y} ' + " ".join(f"q 15 -9 30 0 t 30 0" for _ in range(10)) + f'" fill="none" stroke="#D9A066" stroke-width="1.2" opacity="{0.25 + 0.08 * (k % 3)}"/>')
    for i, (x, y, r) in enumerate(((30, 912, 20), (70, 936, -40), (468, 930, 50), (510, 906, -10))):
        c.add(cowrie(c, x, y, 0.75, r, back=(i % 2 == 1)))
    oracle_crest(c, 270, 140, 0.8)
    mee_meo(c, "cotes", "mee-bisou-vole", "meo-love")
    plate(c, "Oracle", "Sous la même lune", y=772, style="mer", title_size=42)
    finish(c, "oracle-c", "oracle", None, "C", "La Mer d'Olokun",
           "Deux silures de bronze, l'emblème d'Olokun, dieu des eaux profondes du Bénin, tournent autour d'une pleine lune d'ivoire ; "
           "les perles de corail de l'Oba, qui viennent de son royaume, pendent le long de la photo, et dans la mer flottent ses "
           "joyaux invisibles : diatomées et radiolaires, géométries de verre à l'échelle du micron.",
           "cotes : Mee (bisou volé) et Meo (love) se penchent par les côtés", "Sous la même lune")


ALL = [orc_a, orc_b, orc_c]
