"""Mythe : du quark au quasar. Toute l'échelle de l'univers dans un seul cadre, et les royaumes devenus constellations
ou incrustations. Blason de prisme, série numérotée (nº 42 / 100)."""

from leg_helpers import *  # noqa: F401,F403

PH = dict(top="#2A2440", bottom="#0A0814", rim="#E9DDFF")
TITLE = "Mythe nº 42"
NUM = "Nº 42 / 100"
PRISM = ("#FF6FB1", "#FFD36E", "#6EF0C2", "#6EA8FF", "#B36EFF")


def prism_line(c, path, w=2.6, name="ml-prism"):
    g = c.prism(name, 0, 0, 1, 1)
    c.add(f'<path d="{path}" fill="none" stroke="#000000" stroke-width="{w + 3}" opacity="0.45"/>')
    c.add(f'<path d="{path}" fill="none" stroke="{g}" stroke-width="{w}"/>')
    c.add(f'<path d="{path}" fill="none" stroke="#FFFFFF" stroke-width="0.7" opacity="0.6"/>')


def power(x, y, exp, color="#E9DDFF", size=8.5, anchor="start"):
    """« 10 puissance n » en petites capitales, l'exposant posé en haut."""
    return (f'<text x="{f(x)}" y="{f(y)}" text-anchor="{anchor}" font-family="{SANS}" font-weight="700" font-size="{size}" fill="{color}" opacity="0.9">10'
            f'<tspan dy="-3.6" font-size="{f(size * 0.72)}">{esc(exp)}</tspan></text>')


def stool_constellation(cx, cy, s, color="#FFE7A0"):
    """Le Sika Dwa tracé en étoiles : l'assise en croissant, la colonne, le socle."""
    P = [(-60, -26), (-30, -14), (0, -10), (30, -14), (60, -26), (-40, 0), (40, 0), (-14, 2), (14, 2), (-14, 26), (14, 26), (-56, 30), (56, 30)]
    pts = [(cx + x * s, cy + y * s) for x, y in P]
    E = [(0, 1), (1, 2), (2, 3), (3, 4), (1, 5), (3, 6), (2, 7), (2, 8), (7, 9), (8, 10), (5, 11), (6, 12), (11, 9), (10, 12), (9, 10)]
    return constellation(pts, E, color, 1.1, 2.0, 0.95, "#FFD27A")


def myth_crest(c, cx=270, cy=150, s=0.9):
    halo(c, nid("mh"), cx, cy, 120, 110, "#E9DDFF", 0.45)
    crest(c, cx, cy, s, "prism", division=None, edge="#FFFFFF")


def my_a():
    """A — Du quark au quasar."""
    c = start("ma", **PH)
    win = (74, 276, 466, 724, 22)
    m = window(c, "ma-win", *win)
    cosmos(c, "ma-bg", m, "#0C0826", "#08061A", "#030208", seed=21, n=460,
           nebulae=[(120, 120, 240, 170, "#7A3AAF", "#1A0A40", 0.6), (440, 130, 220, 160, "#2A7AAF", "#0A1A40", 0.55), (270, 930, 320, 150, "#1A8A8A", "#06202A", 0.5)])
    c.add(f'<g mask="{m}">{cosmic_web(c, 0, 0, 540, 280, 31, "#C9A0FF", "#E9DDFF", 26, 2.0, 0.9, 0.4)}</g>')
    c.add(f'<g mask="{m}">{cloud(c, "ma-cl", 270, 150, 190, 120, "#FFB0E0", "#4A2A9A", 0.75, 12, 0.012, 60)}</g>')
    c.add(f'<g mask="{m}">{quasar(c, 270, 150, 300, 0, "#BFE0FF", "#FFFFFF", 16)}</g>')
    c.add(f'<g mask="{m}">{waves(270, 150, 90, 20, 5, "#E9DDFF", 1, 0.5)}</g>')
    c.add(galaxy_cluster(c, 70, 70, 40, 13, 40))
    c.add(galaxy_cluster(c, 474, 236, 30, 17, 30))
    c.add(stool_constellation(114, 212, 0.95))
    cw = [(430, 52), (452, 40), (474, 52), (478, 84), (452, 104), (426, 84)]
    c.add(constellation(cw, [(i, (i + 1) % 6) for i in range(6)] + [(1, 4)], "#FFE7A0", 0.9, 1.7, 0.9))
    c.add(f'<g mask="{m}">{quantum_foam(270, 960, 320, 8, "#7FF0E0", 180, 0.7, 0.6, "flat")}</g>')
    c.add(f'<g mask="{m}">{particle_tracks(270, 944, 260, 3, n=34, w=1.3)}</g>')
    for x, kind in ((62, "q"), (478, "n")):
        c.add(f'<circle cx="{x}" cy="896" r="40" fill="#07061A" opacity="0.8"/>')
        c.add(quarks(c, x, 896, 28) if kind == "q" else nucleus(c, x, 896, 26, 5, n=20))
        c.add(lens_ring(x, 896, 40, "#E9DDFF", 1.4))
    c.add(f'<g opacity="0.9">{sankofa(62, 818, 0.5, "#FFD27A")}</g>')
    c.add(string_loop(478, 820, 13, 6, "#9FE8FF", 1.2, (5, 7, 9)))
    x = 22
    c.add(f'<line x1="{x}" y1="40" x2="{x}" y2="760" stroke="#E9DDFF" stroke-width="0.8" opacity="0.6"/>')
    ladder = [("26", 46), ("21", 140), ("13", 230), ("0", 500), ("-5", 620), ("-10", 690), ("-35", 756)]
    for e, y in ladder:
        c.add(f'<line x1="{x - 5}" y1="{y}" x2="{x + 5}" y2="{y}" stroke="#E9DDFF" stroke-width="1.2"/>' + power(x + 8, y + 3, e + " m", "#E9DDFF", 8))
    for y in range(52, 756, 18):
        c.add(f'<line x1="{x - 2.5}" y1="{y}" x2="{x + 2.5}" y2="{y}" stroke="#E9DDFF" stroke-width="0.6" opacity="0.5"/>')
    c.add(f'<circle cx="{x}" cy="500" r="4" fill="#FFD36E"/><circle cx="{x}" cy="500" r="9" fill="#FFD36E" opacity="0.3"/>')
    c.add(open_string(518, 300, 518, 700, 5, 7, "#9FE8FF", 1.1, 0.85))
    c.add(open_string(518, 300, 518, 700, 3, 10, "#FF8FD0", 0.8, 0.6))
    wp = window_path(*win)
    c.add(f'<path d="{wp}" fill="none" stroke="{c.prism("ma-glow", 0, 0, 1, 1)}" stroke-width="10" opacity="0.5" filter="{soft(c, 6)}"/>')
    inner_shadow(c, wp, 24, 0.85)
    prism_line(c, wp, 2.6, "ma-pr")
    myth_crest(c, 270, 150, 0.86)
    mee_meo(c, "pied", "mee-wow", "meo-trophee")
    plate(c, TITLE, None, y=790, style="prisme", numero=NUM, title_size=40, w=372)
    finish(c, "mythe-a", "mythe", None, "A", "Du quark au quasar",
           "Toute l'échelle de l'univers en un cadre : en haut l'immense — un quasar jaillit du blason à travers la toile cosmique, "
           "entre deux amas de galaxies, et le tabouret d'or et un cauri brillent en constellations ; en bas l'infime — une gerbe "
           "de traces de particules, quarks, noyau, mousse quantique et cordes, avec un Sankofa ; une règle d'or court de 10²⁶ à "
           "10⁻³⁵ mètres et marque, au cœur de la photo, notre échelle.",
           "pied : Mee (wow) et Meo (trophée) au bord de la photo", None)


def light_stool(c, cx, cy, s):
    """Le Sika Dwa tracé en lumière, assise courbe posée sur l'horizon du trou noir."""
    g = c.prism("mb-st", 0, 0, 1, 0)
    seat = f"M{f(cx - 104 * s)} {f(cy - 62 * s)} C{f(cx - 80 * s)} {f(cy - 42 * s)} {f(cx - 40 * s)} {f(cy - 30 * s)} {f(cx)} {f(cy - 30 * s)} C{f(cx + 40 * s)} {f(cy - 30 * s)} {f(cx + 80 * s)} {f(cy - 42 * s)} {f(cx + 104 * s)} {f(cy - 62 * s)}"
    body = (f"M{f(cx - 30 * s)} {f(cy - 12 * s)} C{f(cx - 22 * s)} {f(cy + 8 * s)} {f(cx - 22 * s)} {f(cy + 30 * s)} {f(cx - 32 * s)} {f(cy + 52 * s)} "
            f"M{f(cx + 30 * s)} {f(cy - 12 * s)} C{f(cx + 22 * s)} {f(cy + 8 * s)} {f(cx + 22 * s)} {f(cy + 30 * s)} {f(cx + 32 * s)} {f(cy + 52 * s)} "
            f"M{f(cx - 70 * s)} {f(cy - 8 * s)} L{f(cx - 76 * s)} {f(cy + 52 * s)} M{f(cx + 70 * s)} {f(cy - 8 * s)} L{f(cx + 76 * s)} {f(cy + 52 * s)} "
            f"M{f(cx - 98 * s)} {f(cy + 60 * s)} L{f(cx + 98 * s)} {f(cy + 60 * s)}")
    out = f'<g filter="{soft(c, 3)}" opacity="0.8"><path d="{seat}" fill="none" stroke="{g}" stroke-width="7"/><path d="{body}" fill="none" stroke="{g}" stroke-width="5"/></g>'
    out += f'<path d="{seat}" fill="none" stroke="#FFFFFF" stroke-width="1.8"/><path d="{body}" fill="none" stroke="#FFFFFF" stroke-width="1.2" opacity="0.9"/>'
    return out


def my_b():
    """B — Le Trône des deux infinis."""
    c = start("mb", **PH)
    win = (80, 300, 460, 726, 26)
    m = window(c, "mb-win", *win)
    g = c.grad("mb-bg", [(0, "#140828"), (0.5, "#0A0818"), (1, "#03040A")])
    c.add(f'<rect width="540" height="960" fill="{g}" mask="{m}"/>')
    split = c.grad("mb-split", [(0, "#3A0A3A"), (0.5, "#000000"), (1, "#06303A")], 0, 0, 1, 0)
    c.add(f'<rect width="540" height="960" fill="{split}" opacity="0.6" mask="{m}"/>')
    c.add(f'<g mask="{m}">{star_field(41, 300, 0, 0, 270, 960)}{quantum_foam(420, 520, 240, 12, "#7FF0E0", 140, 0.6, 0.55)}</g>')
    c.add(f'<g mask="{m}">{cosmic_web(c, 0, 280, 80, 940, 17, "#E0A0FF", "#FFE7F0", 12, 2.6, 1.0, 0.75)}</g>')
    c.add(f'<g mask="{m}">{black_hole(c, 66, 168, 128, 0.24, 0.3)}</g>')
    c.add(galaxy_cluster(c, 120, 60, 30, 3, 30))
    c.add(f'<g mask="{m}">{waves(66, 168, 150, 22, 5, "#FFB86B", 1, 0.4)}</g>')
    c.add(f'<g mask="{m}">{waves(476, 176, 80, 18, 6, "#7FF0E0", 1, 0.45)}</g>')
    c.add(f'<circle cx="476" cy="176" r="66" fill="{c.rgrad("mb-nh", [(0, "#FFE2A0", 0.5), (1, "#6EF0C2", 0)])}"/>')
    c.add(nucleus(c, 476, 176, 40, 11, n=22))
    c.add(quarks(c, 476, 176, 18))
    c.add(f'<circle cx="476" cy="176" r="56" fill="none" stroke="#E9DDFF" stroke-width="1" stroke-dasharray="2 4" opacity="0.7"/>')
    for i, (y, n) in enumerate(((330, 3), (420, 5), (510, 2), (600, 4))):
        col = ("#FF8FD0", "#9FE8FF", "#FFD36E", "#B36EFF")[i]
        c.add(open_string(474, y, 528, y + 40, n, 6, col, 1.3, 0.95))
    c.add(string_loop(500, 676, 10, 3, "#9FE8FF", 1.1, (5, 7, 9)))
    c.add(particle_tracks(496, 700, 60, 21, n=10))
    for i, (y, r) in enumerate(((380, 16), (520, 14), (650, 12))):
        c.add(galaxy_glow(c, f"mb-g{i}", 34, y, r, ("#FFD9F0", "#FFE2A0", "#CFE0FF")[i], 0.45, i * 1.3, 30 + i, 160, angle=-30 + i * 25))
    c.add(light_stool(c, 270, 214, 0.92))
    wp = window_path(*win)
    inner_shadow(c, wp, 24, 0.85)
    prism_line(c, wp, 2.8, "mb-pr")
    for x, y in ((40, 860), (500, 862)):
        pts = [(x - 16, y - 18), (x, y - 26), (x + 16, y - 18), (x + 18, y + 4), (x, y + 22), (x - 18, y + 4)]
        c.add(constellation(pts, [(i, (i + 1) % 6) for i in range(6)] + [(1, 4)], "#FFE7A0", 0.9, 1.6, 0.85))
    myth_crest(c, 270, 150, 0.82)
    mee_meo(c, "cotes", "mee-amoureuse", "meo-love")
    plate(c, TITLE, "Ubuntu, toujours", y=774, style="prisme", numero=NUM, title_size=40)
    finish(c, "mythe-b", "mythe", None, "B", "Le Trône des deux infinis",
           "Le tabouret d'or, tracé en lumière, trône entre les deux bouts de l'échelle : à gauche un trou noir et son disque "
           "d'accrétion, les filaments de la toile cosmique et des galaxies ; à droite un noyau atomique ouvert sur ses trois quarks, "
           "la mousse quantique, des cordes qui vibrent et des traces de particules ; deux cauris brillent en constellations.",
           "cotes : Mee (amoureuse) et Meo (love) se penchent par les côtés", "Ubuntu, toujours")


def planet(c, cx, cy, r):
    g = c.rgrad(nid("pl"), [(0, "#9FE0FF", 1), (0.6, "#2A7ACF", 1), (1, "#0A1A4A", 1)], 0.35, 0.35, 0.75)
    return (f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{g}"/>'
            f'<path d="M{f(cx - r * 0.6)} {f(cy - r * 0.2)} q{f(r * 0.3)} {f(-r * 0.3)} {f(r * 0.6)} 0 t{f(r * 0.5)} {f(r * 0.2)}" fill="none" stroke="#7FE0A0" stroke-width="{f(r * 0.25)}" opacity="0.8" stroke-linecap="round"/>'
            f'<circle cx="{f(cx + r * 0.25)}" cy="{f(cy + r * 0.2)}" r="{f(r)}" fill="#000000" opacity="0.35" clip-path="none"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r * 1.25)}" fill="none" stroke="#9FE0FF" stroke-width="1" opacity="0.4"/>')


def scale_icon(c, kind, cx, cy, seed):
    if kind == "corde":
        return string_loop(cx, cy, 12, seed, "#FF8FD0", 1.2)
    if kind == "mousse":
        return quantum_foam(cx, cy, 20, seed, "#7FF0E0", 26, 0.6, 0.9)
    if kind == "quarks":
        return quarks(c, cx, cy, 15, 0.8)
    if kind == "noyau":
        return nucleus(c, cx, cy, 13, seed, n=12)
    if kind == "atome":
        return atom(c, cx, cy, 17, "#9FE8FF", rot=seed * 10, w=1)
    if kind == "molécule":
        return molecule(cx, cy, 0.55, "#9FE8FF", rot=seed * 7)
    if kind == "ADN":
        return dna(cx - 4, cy - 20, cx + 4, cy + 20, 7, 1.6, w=1.4)
    if kind == "cellule":
        return cell(c, cx, cy, 17, seed=seed)
    if kind == "planète":
        return planet(c, cx, cy, 13)
    if kind == "étoile":
        return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="14" fill="{c.rgrad("si-sun", [(0, "#FFFFFF", 1), (0.3, "#FFE2A0", 0.9), (1, "#FF9A3A", 0)])}"/>' + spikes(cx, cy, 18, "#FFFFFF", op=0.9)
    if kind == "nébuleuse":
        return (f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="24" ry="17" fill="{c.rgrad(nid("sin"), [(0, "#FFE2F0", 0.95), (0.4, "#FF6FB1", 0.7), (1, "#6A3AAF", 0)])}"/>'
                + cloud(c, nid("sic"), cx - 4, cy + 2, 18, 12, "#FFB0D8", "#8A4BFF", 0.9, seed, 0.06, 10) + spikes(cx + 6, cy - 4, 6, "#FFFFFF", op=0.9))
    if kind == "galaxie":
        return galaxy_glow(c, nid("sig"), cx, cy, 17, "#FFE2C0", 0.5, seed, seed, 160, angle=-25)
    if kind == "amas":
        return galaxy_cluster(c, cx, cy, 18, seed, 22)
    if kind == "toile":
        return cosmic_web(c, cx - 22, cy - 22, cx + 22, cy + 22, seed, "#C9A0FF", "#FFE7F0", 8, 2.6, 0.7, 0.8)
    if kind == "quasar":
        return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="20" fill="{c.rgrad(nid("siq"), [(0, "#BFE0FF", 0.7), (1, "#3A6AFF", 0)])}"/>' + quasar(c, cx, cy, 28, 35, "#9FD8FF", "#FFFFFF", 5)
    return black_hole(c, cx, cy, 22, 0.26, 0.3)


def my_c():
    """C — Le Kente de l'univers."""
    c = start("mc", **PH)
    win = (80, 262, 460, 726, 16)
    m = window(c, "mc-win", *win)
    cosmos(c, "mc-bg", m, "#0C0826", "#08061A", "#030208", seed=23, n=380,
           nebulae=[(270, 120, 300, 160, "#AF3A8A", "#1A0A40", 0.55), (270, 880, 300, 140, "#3A6AAF", "#0A1A40", 0.5)])
    c.add(f'<g mask="{m}">{cloud(c, "mc-c1", 100, 220, 200, 160, "#FF6FB1", "#4A1A8A", 0.6, 3, 0.012, 60)}'
          f'{cloud(c, "mc-c2", 450, 520, 180, 260, "#6EA8FF", "#1A2A7A", 0.55, 7, 0.011, 70)}'
          f'{cloud(c, "mc-c3", 80, 700, 160, 200, "#6EF0C2", "#0A3A4A", 0.45, 11, 0.012, 60)}'
          f'{galaxy_glow(c, "mc-gal", 270, 150, 150, "#FFD9F0", 0.42, 0.4, 7, 900, "#FFFFFF", 0.6, -12)}</g>')
    kente_col = ("#E8B53C", "#1E8A5C", "#C8323C", "#14100C")
    left = ["mousse", "corde", "quarks", "noyau", "atome", "molécule", "ADN", "cellule"]
    right = ["planète", "étoile", "trou noir", "nébuleuse", "galaxie", "amas", "toile", "quasar"]
    exps_l = ["-35", "-34", "-18", "-15", "-10", "-9", "-8", "-5"]
    exps_r = ["7", "9", "13", "17", "21", "23", "25", "26"]
    bw, bh = 56, 62
    x_l, x_r = 12, 472
    y0 = 252
    step = 83
    for i in range(8):
        for col, items, exps, x in (("l", left, exps_l, x_l), ("r", right, exps_r, x_r)):
            idx = 7 - i if col == "l" else i
            yy = y0 - 100 + i * step
            uid = nid("kb")
            c.def_once(uid, f'<clipPath id="{c.id(uid)}"><rect x="{x}" y="{yy}" width="{bw}" height="{bh}" rx="6"/></clipPath>')
            c.add(f'<rect x="{x}" y="{yy}" width="{bw}" height="{bh}" rx="6" fill="#07061A" opacity="0.92"/>')
            c.add(f'<g clip-path="url(#{c.id(uid)})">{scale_icon(c, items[idx], x + bw / 2, yy + bh / 2 - 4, 3 + i)}</g>')
            c.add(power(x + bw / 2, yy + bh - 4, exps[idx] + " m", "#E9DDFF", 7.5, "middle"))
            prism_line(c, f"M{x + 6} {yy} L{x + bw - 6} {yy} Q{x + bw} {yy} {x + bw} {yy + 6} L{x + bw} {yy + bh - 6} Q{x + bw} {yy + bh} {x + bw - 6} {yy + bh} L{x + 6} {yy + bh} Q{x} {yy + bh} {x} {yy + bh - 6} L{x} {yy + 6} Q{x} {yy} {x + 6} {yy}Z", 1.2, f"mc-p{col}{i}")
            if i < 7:
                sy = yy + bh + 3
                stripes = "".join(f'<rect x="{x + 4}" y="{f(sy + k * 3)}" width="{bw - 8}" height="3" fill="{kente_col[k % 4]}"/>' for k in range(int((step - bh - 6) / 3)))
                c.add(f'<g opacity="0.9">{stripes}</g>')
    top = "".join(f'<rect x="{f(76 + k * 10)}" y="44" width="10" height="16" fill="{kente_col[k % 4] if k % 6 else "#FFF4C2"}"/>' for k in range(39))
    c.add(f'<g opacity="0.85">{top}</g>')
    pr = c.prism("mc-adk", 0, 0, 1, 1)
    c.add("".join(f'<circle cx="270" cy="150" r="{r}" fill="none" stroke="{pr}" stroke-width="{w}" opacity="0.9"/>' for r, w in ((34, 2.2), (72, 2.2), (110, 2.6))))
    c.add("".join(f'<circle cx="270" cy="150" r="{r}" fill="none" stroke="#FFFFFF" stroke-width="6" opacity="0.12" filter="{soft(c, 3)}"/>' for r in (72, 110)))
    wp = window_path(*win)
    c.add(f'<path d="{wp}" fill="none" stroke="{c.prism("mc-glow", 0, 0, 1, 1)}" stroke-width="10" opacity="0.5" filter="{soft(c, 6)}"/>')
    inner_shadow(c, wp, 24, 0.85)
    prism_line(c, wp, 2.8, "mc-pr")
    c.add(f'<path d="M84 930 L456 930" stroke="#E9DDFF" stroke-width="0.8" opacity="0.6"/>')
    myth_crest(c, 270, 150, 0.9)
    mee_meo(c, "perches", "mee-fete", "meo-champagne")
    yb = plate(c, TITLE, "Notre royaume grandit", y=772, style="prisme", numero=NUM, title_size=40, w=392)
    bot = "".join(f'<rect x="{f(76 + k * 10)}" y="{yb + 14}" width="10" height="14" fill="{kente_col[k % 4] if k % 6 else "#FFF4C2"}"/>' for k in range(39))
    c.add(f'<g opacity="0.85">{bot}</g>')
    finish(c, "mythe-c", "mythe", None, "C", "Le Kente de l'univers",
           "Le cadre est tissé comme un kente : entre ses rayures d'or, de vert et de rouge, chaque bloc ouvre une échelle de "
           "l'univers — à gauche, de la corde et de la mousse quantique aux quarks, au noyau, à l'atome, à l'ADN et à la cellule ; "
           "à droite, de la planète à l'étoile, au trou noir, à la nébuleuse, aux galaxies et à leurs amas, à la toile cosmique "
           "et au quasar. Les trois anneaux d'Adinkrahene, le roi des symboles, cerclent le blason au cœur d'une galaxie.",
           "perches : Mee (fête) et Meo (champagne) de part et d'autre du blason", "Notre royaume grandit")


ALL = [my_a, my_b, my_c]
