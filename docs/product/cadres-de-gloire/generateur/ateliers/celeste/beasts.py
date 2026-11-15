"""Les créatures de l'Empire céleste (créations originales) : dragon serpentin, fenghuang, grue, girafe-qilin."""

import math
import random

from motifs import *  # noqa: F401,F403

DRAGON_GOLD = dict(body="#E9B23E", hi="#FFF0B0", lo="#8A4E10", belly="#FFE7A8", fin="#D8321F", fin_hi="#FF8A4A",
                   mane="#E2431F", mane_hi="#FFB04A", horn="#FFF4D6", line="#5A2E08", eye="#FFF6C8")
DRAGON_JADE = dict(body="#3FB68B", hi="#C8F7E0", lo="#0C4A38", belly="#E4F6D6", fin="#E8B53C", fin_hi="#FFF0A8",
                   mane="#E8B53C", mane_hi="#FFF0A8", horn="#FFF4D6", line="#06261C", eye="#FFF6C8")
DRAGON_STAR = dict(body="#3B3F8F", hi="#BFD0FF", lo="#0B0F33", belly="#E8E4FF", fin="#8F7CFF", fin_hi="#E2D8FF",
                   mane="#7FC8FF", mane_hi="#FFFFFF", horn="#FFFFFF", line="#05071E", eye="#FFFFFF")
DRAGON_SILVER = dict(body="#C9D4E6", hi="#FFFFFF", lo="#4A5670", belly="#F4F7FF", fin="#6F8FD8", fin_hi="#CFE0FF",
                     mane="#9FB8F0", mane_hi="#FFFFFF", horn="#FFF6DA", line="#1C2236", eye="#FFF6C8")


def _feather(x, y, ang, L, w, fill, stroke=None, sw=0.6, rachis=None):
    ca, sa = math.cos(ang), math.sin(ang)
    tip = (x + ca * L, y + sa * L)
    nx, ny = -sa, ca
    c1 = (x + ca * L * 0.35 + nx * w, y + sa * L * 0.35 + ny * w)
    c2 = (x + ca * L * 0.35 - nx * w, y + sa * L * 0.35 - ny * w)
    c3 = (x + ca * L * 0.85 + nx * w * 0.8, y + sa * L * 0.85 + ny * w * 0.8)
    c4 = (x + ca * L * 0.85 - nx * w * 0.8, y + sa * L * 0.85 - ny * w * 0.8)
    st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    d = (f"M{fmt(x)} {fmt(y)} C{fmt(c1[0])} {fmt(c1[1])} {fmt(c3[0])} {fmt(c3[1])} {fmt(tip[0])} {fmt(tip[1])} "
         f"C{fmt(c4[0])} {fmt(c4[1])} {fmt(c2[0])} {fmt(c2[1])} {fmt(x)} {fmt(y)}Z")
    out = f'<path d="{d}" fill="{fill}"{st}/>'
    if rachis:
        out += f'<path d="M{fmt(x)} {fmt(y)} L{fmt(x + ca * L * 0.9)} {fmt(y + sa * L * 0.9)}" stroke="{rachis}" stroke-width="{fmt(sw * 1.2)}" opacity="0.7"/>'
    return out


# ---------------------------------------------------------------- la grue

def crane(card, cx, cy, s, flip=False, rot=0, white="#FBFBF7", ink="#141418", crown="#E2231A", op=1, wing=1.0):
    """Grue du Japon en vol (création) : rémiges blanches, secondaires noires, cou noir, calotte rouge."""
    out = []

    def wing_set(ox, oy, sc, shade):
        parts = []
        S, Wr = (ox + 6, oy - 6), (ox - 10, oy - 58 * wing)
        for i in range(9):
            t = i / 8
            bx, by = lerp(S[0], Wr[0], t), lerp(S[1], Wr[1], t)
            parts.append(_feather(bx, by, math.radians(178 - 22 * t), (40 - 6 * t) * sc, 6 * sc, ink))
        for i in range(7):
            ang = math.radians(196 + i * 9)
            parts.append(_feather(Wr[0], Wr[1], ang, (64 - abs(i - 2) * 4) * sc, 6.5 * sc, shade, "#B9B9B0", 0.6))
        parts.append(f'<path d="M{fmt(S[0] + 6)} {fmt(S[1] + 4)} C{fmt(S[0] + 4)} {fmt(S[1] - 30 * wing)} {fmt(Wr[0] + 12)} {fmt(Wr[1] + 6)} {fmt(Wr[0] + 2)} {fmt(Wr[1] - 6)} '
                     f'C{fmt(Wr[0] - 10)} {fmt(Wr[1] + 6)} {fmt(Wr[0] - 22)} {fmt(Wr[1] + 26)} {fmt(S[0] - 26)} {fmt(S[1] + 2)}Z" fill="{shade}"/>')
        for i in range(5):
            t = 0.15 + i * 0.17
            bx, by = lerp(S[0], Wr[0], t), lerp(S[1], Wr[1], t)
            parts.append(_feather(bx, by, math.radians(165), 16 * sc, 4.5 * sc, shade, "#C8C8C0", 0.5))
        return "".join(parts)

    out.append(tf(wing_set(-14, -2, 0.86, "#E4E6E2"), 0, 0, -8))
    out += [
        f'<path d="M-44 4 C-70 8 -86 10 -104 12" stroke="{ink}" stroke-width="2" fill="none" stroke-linecap="round"/>',
        f'<path d="M-44 6 C-70 12 -86 15 -102 19" stroke="{ink}" stroke-width="2" fill="none" stroke-linecap="round"/>',
        f'<path d="M-104 12 l-6 -3 M-104 12 l-6 2 M-102 19 l-6 -2 M-102 19 l-5 4" stroke="{ink}" stroke-width="1.4"/>',
        f'<path d="M-50 -6 C-34 -13 8 -13 26 -7 C36 -3 32 7 18 8 C0 10 -32 9 -48 3 C-56 0 -56 -4 -50 -6Z" fill="{white}"/>',
    ]
    for i in range(5):
        out.append(_feather(-36 + i * 3, -2, math.radians(170 + i * 6), 26, 5, ink))
    out += [
        f'<path d="M22 -5 C36 -10 54 -15 70 -18" fill="none" stroke="{ink}" stroke-width="6" stroke-linecap="round"/>',
        f'<path d="M24 -2 C36 -5 46 -8 54 -10" fill="none" stroke="{white}" stroke-width="2.6" stroke-linecap="round"/>',
        f'<ellipse cx="74" cy="-19" rx="7.5" ry="5.2" fill="{ink}"/>',
        f'<ellipse cx="72" cy="-23" rx="3.8" ry="2.4" fill="{crown}"/>',
        f'<path d="M66 -15 C62 -17 60 -19 58 -21" stroke="{white}" stroke-width="2.4" stroke-linecap="round"/>',
        f'<path d="M80 -20 L102 -17 L80 -15.5Z" fill="#A89C66"/>',
        f'<circle cx="76" cy="-20" r="1" fill="#FFFFFF"/>',
    ]
    out.append(wing_set(0, 0, 1.0, white))
    return tf("".join(out), cx, cy, rot, s, flip, op=op)


# ---------------------------------------------------------------- le dragon

def _dragon_head(card, P, s, uid):
    """Tête de dragon (création) en repère local : museau vers +x, sommet du crâne vers -y."""
    gold = card.grad(f"dh-{uid}", [(0, P["hi"]), (0.45, P["body"]), (1, P["lo"])], 0, 0, 0, 1)
    mane = card.grad(f"dm-{uid}", [(0, P["mane_hi"]), (1, P["mane"])], 1, 0, 0, 1)
    out = []
    for i, (bx, by, a, L) in enumerate(((8, -6, 200, 46), (4, 2, 188, 52), (2, 10, 172, 40), (12, -14, 214, 40), (14, 12, 160, 30))):
        sp, _ = spine([(bx, by), (bx + math.cos(math.radians(a)) * L * 0.5, by + math.sin(math.radians(a)) * L * 0.5 - 6),
                       (bx + math.cos(math.radians(a)) * L, by + math.sin(math.radians(a)) * L + 4)], 24)
        out.append(f'<path d="{ribbon_d(sp, lambda t: 14 * (1 - t) ** 0.9 + 0.5)}" fill="{mane}" stroke="{P["line"]}" stroke-width="0.6"/>')
    for k, (hx, hy) in enumerate(((22, -20), (16, -18))):
        sp, _ = spine([(hx, hy), (hx - 14, hy - 18), (hx - 34, hy - 26), (hx - 52, hy - 22)], 30)
        out.append(f'<path d="{ribbon_d(sp, lambda t: 6.5 * (1 - t) + 0.6)}" fill="{P["horn"]}" stroke="{P["line"]}" stroke-width="0.8" opacity="{1 if k == 0 else 0.8}"/>')
        tx, ty, _ = sp[12]
        sp2, _ = spine([(tx, ty), (tx - 4, ty - 10), (tx - 2, ty - 18)], 12)
        out.append(f'<path d="{ribbon_d(sp2, lambda t: 3.6 * (1 - t) + 0.4)}" fill="{P["horn"]}" stroke="{P["line"]}" stroke-width="0.7"/>')
    out.append(f'<path d="M10 8 C18 14 30 22 50 18 C56 17 60 20 58 24 C50 30 30 30 16 24 C8 20 4 14 10 8Z" fill="{gold}" stroke="{P["line"]}" stroke-width="1"/>')
    out.append(f'<path d="M24 8 C34 12 46 14 56 12 L56 18 C44 22 32 20 22 14Z" fill="#5A0A0A"/>')
    out.append(f'<path d="M30 14 C44 16 58 14 70 6 C76 2 80 6 76 10 C72 13 70 9 72 8" fill="none" stroke="#E2431F" stroke-width="3" stroke-linecap="round"/>')
    out.append(f'<path d="M0 -14 C8 -24 22 -26 32 -22 C38 -20 44 -18 48 -16 C54 -20 62 -20 66 -14 C70 -8 68 -2 62 0 '
               f'C50 2 40 6 26 8 C14 10 4 8 0 4Z" fill="{gold}" stroke="{P["line"]}" stroke-width="1.1"/>')
    out.append(f'<path d="M6 -10 C18 -18 30 -18 44 -14" fill="none" stroke="{P["hi"]}" stroke-width="2" opacity="0.8"/>')
    for i in range(6):
        x = 28 + i * 6
        out.append(f'<path d="M{x} {fmt(6.5 - i * 0.9)} l2 4 l2 -4.6Z" fill="#FFFFFF"/>')
    for i in range(5):
        x = 30 + i * 5.5
        out.append(f'<path d="M{x} {fmt(14 + i * 0.4)} l2 -3.6 l2 3.8Z" fill="#FFFFFF"/>')
    out.append(f'<path d="M58 -2 l1.5 7 l2.5 -7.2Z M50 15 l1.8 -6 l2.2 6.2Z" fill="#FFFFFF"/>')
    out.append(f'<path d="M24 -20 C30 -26 40 -24 44 -18 C38 -20 30 -20 24 -16Z" fill="{P["mane"]}" stroke="{P["line"]}" stroke-width="0.8"/>')
    out.append(f'<ellipse cx="34" cy="-12" rx="6.2" ry="4.6" fill="{P["eye"]}" stroke="{P["line"]}" stroke-width="1"/>')
    out.append(f'<circle cx="35.5" cy="-12" r="2.6" fill="#140A04"/><circle cx="36.4" cy="-13" r="0.9" fill="#FFFFFF"/>')
    out.append(f'<path d="{poly_d(spiral_pts(60, -10, 0.6, 4.2, 0, 1.3, 20), False)}" fill="none" stroke="{P["line"]}" stroke-width="1.3"/>')
    out.append(f'<path d="M10 -2 C16 0 20 4 22 8" fill="none" stroke="{P["line"]}" stroke-width="0.9" opacity="0.7"/>')
    for k, (sx_, sy_, pts) in enumerate((
        (64, -6, [(64, -6), (84, -14), (96, 0), (88, 22), (100, 40)]),
        (62, 0, [(62, 0), (76, 10), (72, 30), (86, 46), (80, 64)]),
    )):
        sp, _ = spine(pts, 40)
        out.append(f'<path d="{ribbon_d(sp, lambda t: 2.6 * (1 - t) + 0.3)}" fill="{P["mane_hi"] if k == 0 else P["horn"]}" stroke="{P["line"]}" stroke-width="0.4"/>')
    for i, (bx, by) in enumerate(((22, 24), (32, 26), (42, 24))):
        sp, _ = spine([(bx, by), (bx - 4, by + 10), (bx - 12, by + 18)], 14)
        out.append(f'<path d="{ribbon_d(sp, lambda t: 6 * (1 - t) + 0.4)}" fill="{mane}" stroke="{P["line"]}" stroke-width="0.5"/>')
    return "".join(out)


def dragon(card, ctrl, s=1.0, P=None, uid="d", n=170, wmax=22, legs=(0.2, 0.56), fins=True, scales=True, head=True, tail=True, op=1, glow=None, v=1, leg_len=1.0):
    """Dragon serpentin (création) : corps le long d'une spline `ctrl` (de la tête à la queue), écailles, nageoire
    dorsale, ventre annelé, pattes griffues, crinière de flammes, moustaches."""
    P = P or DRAGON_GOLD
    sp, L = spine(ctrl, n)
    wf = lambda t: wmax * s * (0.72 + 0.28 * math.sin(math.pi * min(1, t * 2.6))) * (1 - 0.86 * t ** 1.5) + 1.2
    out = []
    if glow:
        out.append(f'<path d="{poly_d([(x, y) for x, y, _ in sp], False)}" fill="none" stroke="{glow}" stroke-width="{fmt(wmax * s * 2.4)}" stroke-linecap="round" opacity="0.35" filter="{card.blur("dglow", 10)}"/>')
    if fins:
        fin_g = card.grad(f"fin-{uid}", [(0, P["fin_hi"]), (1, P["fin"])], 0, 0, 0, 1)
        top = offset(sp, lambda t: -v * wf(t) * 0.45)
        fs = []
        for i in range(6, n - 6, 4):
            t = i / (n - 1)
            x, y = top[i]
            a = sp[i][2]
            nx, ny = v * math.sin(a), -v * math.cos(a)
            hgt = wf(t) * 0.75
            back = (top[min(n - 1, i + 4)])
            tip = (x + nx * hgt + math.cos(a) * hgt * 0.9, y + ny * hgt + math.sin(a) * hgt * 0.9)
            fs.append(f'<path d="M{fmt(x)} {fmt(y)} Q{fmt(x + nx * hgt * 0.7)} {fmt(y + ny * hgt * 0.7)} {fmt(tip[0])} {fmt(tip[1])} '
                      f'Q{fmt(back[0] + nx * hgt * 0.2)} {fmt(back[1] + ny * hgt * 0.2)} {fmt(back[0])} {fmt(back[1])}Z" fill="{fin_g}" stroke="{P["line"]}" stroke-width="0.6"/>')
        out.append("".join(fs))
    if tail:
        tx, ty, ta = sp[-1]
        tg = card.grad(f"tl-{uid}", [(0, P["mane_hi"]), (1, P["mane"])], 0, 0, 1, 1)
        for k, da in enumerate((-0.8, -0.35, 0.1, 0.55, 0.95)):
            L2 = wmax * s * (2.4 - abs(da))
            sp2, _ = spine([(tx, ty), (tx + math.cos(ta + da) * L2 * 0.5, ty + math.sin(ta + da) * L2 * 0.5),
                            (tx + math.cos(ta + da * 1.4) * L2, ty + math.sin(ta + da * 1.4) * L2)], 20)
            out.append(f'<path d="{ribbon_d(sp2, lambda t: wmax * s * 0.5 * (1 - t) ** 0.8 + 0.4)}" fill="{tg}" stroke="{P["line"]}" stroke-width="0.6"/>')
    leg_svgs = []
    for lt in legs:
        i = int(lt * (n - 1))
        x, y, a = sp[i]
        wv = wf(lt)
        side = v
        nx, ny = -math.sin(a) * side, math.cos(a) * side
        bx, by = x + nx * wv * 0.3, y + ny * wv * 0.3
        knee = (bx + nx * wv * 1.7 * leg_len + math.cos(a) * wv * 1.1 * leg_len, by + ny * wv * 1.7 * leg_len + math.sin(a) * wv * 1.1 * leg_len)
        foot = (knee[0] + nx * wv * 0.9 * leg_len - math.cos(a) * wv * 1.3 * leg_len, knee[1] + ny * wv * 0.9 * leg_len - math.sin(a) * wv * 1.3 * leg_len)
        lsp, _ = spine([(bx, by), knee, foot], 30)
        lg_ = card.grad(f"leg-{uid}", [(0, P["hi"]), (0.5, P["body"]), (1, P["lo"])], 0, 0, 1, 1)
        leg = f'<path d="{ribbon_d(lsp, lambda t: wv * (0.9 - 0.45 * t))}" fill="{lg_}" stroke="{P["line"]}" stroke-width="0.9"/>'
        kx, ky = knee
        for da in (-0.5, 0, 0.5):
            ang = a + math.pi + da
            sp3, _ = spine([(kx, ky), (kx + math.cos(ang) * wv * 0.9, ky + math.sin(ang) * wv * 0.9 - 3), (kx + math.cos(ang) * wv * 1.6, ky + math.sin(ang) * wv * 1.6)], 12)
            leg = f'<path d="{ribbon_d(sp3, lambda t: wv * 0.28 * (1 - t) + 0.3)}" fill="{P["mane"]}" stroke="{P["line"]}" stroke-width="0.5"/>' + leg
        fx, fy = foot
        fa = math.atan2(foot[1] - knee[1], foot[0] - knee[0])
        for da in (-0.9, -0.3, 0.3, 0.9):
            ang = fa + da
            cx1, cy1 = fx + math.cos(ang) * wv * 0.8, fy + math.sin(ang) * wv * 0.8
            cx2, cy2 = cx1 + math.cos(ang + 1.2) * wv * 0.5, cy1 + math.sin(ang + 1.2) * wv * 0.5
            leg += (f'<path d="M{fmt(fx)} {fmt(fy)} L{fmt(cx1)} {fmt(cy1)}" stroke="{P["body"]}" stroke-width="{fmt(wv * 0.26)}" stroke-linecap="round"/>'
                    f'<path d="M{fmt(cx1)} {fmt(cy1)} Q{fmt(cx1 + math.cos(ang) * 3)} {fmt(cy1 + math.sin(ang) * 3)} {fmt(cx2)} {fmt(cy2)}" stroke="{P["horn"]}" stroke-width="{fmt(max(1.2, wv * 0.14))}" fill="none" stroke-linecap="round"/>')
        leg += f'<circle cx="{fmt(fx)}" cy="{fmt(fy)}" r="{fmt(wv * 0.3)}" fill="{P["body"]}" stroke="{P["line"]}" stroke-width="0.6"/>'
        leg_svgs.append(leg)
    out.append("".join(leg_svgs[1:]))
    body_d = ribbon_d(sp, wf)
    gb = card.grad(f"db-{uid}", [(0, P["lo"]), (0.5, P["body"]), (1, P["lo"])], 0, 0, 1, 1)
    out.append(f'<path d="{body_d}" fill="{P["body"]}" stroke="{P["line"]}" stroke-width="1.2"/>')
    cid = nid("dbc")
    card.def_once(cid, f'<clipPath id="{card.id(cid)}"><path d="{body_d}"/></clipPath>')
    inner = []
    belly = offset(sp, lambda t: wf(t) * 0.3)
    inner.append(f'<path d="{poly_d([(x, y) for x, y, _ in sp], False)}" fill="none" stroke="{P["lo"]}" stroke-width="{fmt(wmax * s * 0.5)}" opacity="0.0"/>')
    bl, br = sides(sp, lambda t: wf(t) * 1.0)
    belly_band = poly_d(offset(sp, lambda t: v * wf(t) * 0.12) + offset(sp, lambda t: v * wf(t) * 0.55)[::-1])
    inner.append(f'<path d="{belly_band}" fill="{P["belly"]}"/>')
    for i in range(2, n - 2, 2):
        t = i / (n - 1)
        x1, y1 = offset([sp[i]], v * wf(t) * 0.12)[0]
        x2, y2 = offset([sp[i]], v * wf(t) * 0.55)[0]
        inner.append(f'<line x1="{fmt(x1)}" y1="{fmt(y1)}" x2="{fmt(x2)}" y2="{fmt(y2)}" stroke="{P["lo"]}" stroke-width="0.7" opacity="0.7"/>')
    if scales:
        for i in range(3, n - 3, 2):
            t = i / (n - 1)
            x, y, a = sp[i]
            wv = wf(t)
            r = wv * 0.2
            if r < 1.1:
                continue
            ca, sa = math.cos(a), math.sin(a)
            for k in (-0.4, -0.14):
                kk = v * (k + (0.13 if (i // 2) % 2 else 0))
                cx, cy = x - sa * kk * wv, y + ca * kk * wv
                p1 = (cx - sa * r, cy + ca * r)
                p2 = (cx + sa * r, cy - ca * r)
                q = (cx + ca * r * 2.0, cy + sa * r * 2.0)
                inner.append(f'<path d="M{fmt(p1[0])} {fmt(p1[1])} Q{fmt(q[0])} {fmt(q[1])} {fmt(p2[0])} {fmt(p2[1])}Z" fill="{P["hi"]}" fill-opacity="0.22" stroke="{P["lo"]}" stroke-width="{fmt(max(0.5, r * 0.22))}" stroke-opacity="0.8"/>')
    inner.append(f'<path d="{poly_d(offset(sp, lambda t: -v * wf(t) * 0.3), False)}" fill="none" stroke="{P["hi"]}" stroke-width="{fmt(wmax * s * 0.12)}" opacity="0.55" stroke-linecap="round"/>')
    inner.append(f'<path d="{poly_d(offset(sp, lambda t: v * wf(t) * 0.48), False)}" fill="none" stroke="{P["lo"]}" stroke-width="{fmt(wmax * s * 0.14)}" opacity="0.5"/>')
    out.append(f'<g clip-path="url(#{card.id(cid)})">{"".join(inner)}</g>')
    out.append(leg_svgs[0] if leg_svgs else "")
    if head:
        hx, hy, ha = sp[0]
        ang = ha + math.pi
        hs = wmax * s / 18
        flipv = math.cos(ang) < 0
        deg = math.degrees(ang)
        h_svg = _dragon_head(card, P, hs, uid)
        out.append(f'<g transform="translate({fmt(hx)} {fmt(hy)}) rotate({fmt(deg)}) scale({fmt(hs)} {fmt(-hs if flipv else hs)}) translate(-6 0)">{h_svg}</g>')
    return f'<g opacity="{op}">{"".join(out)}</g>'


# ---------------------------------------------------------------- le phénix (fenghuang)

def plume(card, ctrl, w, c_base, c_tip, eye=True, uid="p", barbs=True, eye_cols=("#0E5A43", "#3FB68B", "#E8B53C", "#D8321F")):
    """Une rectrice de phénix : tige souple, barbes en dents de scie, ocelle au bout."""
    sp, L = spine(ctrl, 70)
    g = card.grad(f"pl-{uid}-{c_base}-{c_tip}", [(0, c_base), (1, c_tip)], 0, 0, 1, 1)
    prof = lambda t: w * (0.25 + 0.75 * math.sin(math.pi * min(1, t * 1.15)) ** 0.6) if t < 0.88 else w * 0.9 * (1 - (t - 0.88) * 6)
    out = []
    left, right = sides(sp, prof)
    if barbs:
        ser = []
        for i in range(2, len(sp) - 2, 2):
            for side, pts in ((1, left), (-1, right)):
                x, y = pts[i]
                a = sp[i][2]
                nx, ny = -math.sin(a) * side, math.cos(a) * side
                L2 = prof(i / 69) * 0.5
                ser.append(f"M{fmt(x)} {fmt(y)} L{fmt(x + nx * L2 + math.cos(a) * L2 * 1.4)} {fmt(y + ny * L2 + math.sin(a) * L2 * 1.4)}")
        out.append(f'<path d="{" ".join(ser)}" stroke="{c_tip}" stroke-width="1.6" stroke-linecap="round" opacity="0.85"/>')
    out.append(f'<path d="{poly_d(left + right[::-1])}" fill="{g}"/>')
    out.append(f'<path d="{poly_d([(x, y) for x, y, _ in sp[:62]], False)}" fill="none" stroke="#FFF4C2" stroke-width="1" opacity="0.8"/>')
    if eye:
        ex, ey, ea = sp[60]
        for k, (col, rr) in enumerate(zip(eye_cols, (1.0, 0.72, 0.48, 0.26))):
            out.append(f'<ellipse cx="{fmt(ex)}" cy="{fmt(ey)}" rx="{fmt(w * 0.95 * rr)}" ry="{fmt(w * 0.62 * rr)}" fill="{col}" transform="rotate({fmt(math.degrees(ea))} {fmt(ex)} {fmt(ey)})"/>')
    return "".join(out)


def phoenix_wing(card, sx, sy, s, flip=False, cols=("#E8B53C", "#D8321F", "#3FB68B", "#FFF1BE"), spread=1.0, tilt=0):
    """Une aile déployée : rémiges longues, couvertures en écailles, du vermillon à l'or."""
    k = -1 if flip else 1
    out = []
    tl = tilt if not flip else -tilt
    gp = card.grad(f"pw-p-{cols[0]}", [(0, cols[3]), (0.35, cols[0]), (1, cols[1])], 0, 1, 0, 0)
    gs = card.grad(f"pw-s-{cols[0]}", [(0, cols[3]), (0.5, cols[0]), (1, "#B8501A")], 0, 1, 0, 0)
    for i in range(11):
        t = i / 10
        a = math.radians(-90 - k * (14 + 70 * t * spread) - tl) if not flip else math.radians(-90 + (14 + 70 * t * spread) - tl)
        L = (150 - 60 * t) * s
        out.append(_feather(sx + k * 10 * s * t, sy - 6 * s * t, a, L, 11 * s, gp, "#7A1E0E", 0.8, rachis="#FFF4C2"))
    for i in range(9):
        t = i / 8
        a = math.radians(-90 - k * (24 + 66 * t * spread) - tl) if not flip else math.radians(-90 + (24 + 66 * t * spread) - tl)
        L = (92 - 30 * t) * s
        out.append(_feather(sx + k * 8 * s * t, sy, a, L, 10 * s, gs, "#6A3A08", 0.7, rachis="#FFF4C2"))
    gc = card.grad(f"pw-c-{cols[2]}", [(0, "#BFF3DA"), (1, cols[2])], 0, 0, 0, 1)
    for row in range(3):
        for i in range(6 - row):
            t = (i + 0.5) / (6 - row)
            a = math.radians(-90 - k * (30 + 56 * t) - tl) if not flip else math.radians(-90 + (30 + 56 * t) - tl)
            r0 = (14 + row * 16) * s
            bx, by = sx + math.cos(a) * r0 * 0.6, sy + math.sin(a) * r0 * 0.6
            out.append(_feather(bx, by, a, (26 - row * 3) * s, 7 * s, gc if row == 0 else (gp if row == 2 else gs), "#0E3A2A", 0.6))
    return "".join(out)


def phoenix(card, cx, cy, s=1.0, head_dir=1, tails=None, wings=True, spread=1.0, uid="ph", body_c=("#FFE08A", "#D8321F"), tilt=0, neck=None, body=True):
    """Fenghuang (création) aux ailes déployées, tête de profil, aigrette à ocelles ; `tails` = splines de rectrices."""
    out = []
    for k, (ctrl, w, cb, ct) in enumerate(tails or []):
        out.append(plume(card, ctrl, w, cb, ct, uid=f"{uid}{k}"))
    if wings:
        out.append(phoenix_wing(card, cx - 14 * s, cy - 6 * s, s, False, spread=spread, tilt=tilt))
        out.append(phoenix_wing(card, cx + 14 * s, cy - 6 * s, s, True, spread=spread, tilt=tilt))
    gb = card.grad(f"phb-{uid}", [(0, body_c[0]), (1, body_c[1])], 0, 0, 0, 1)
    hd = head_dir
    nk = neck or [(0, -6), (4, -30), (-2, -52), (10, -70)]
    neck, _ = spine([(cx + hd * x * s, cy + y * s) for x, y in nk], 40)
    out.append(f'<path d="{ribbon_d(neck, lambda t: 17 * s * (1 - t * 0.45))}" fill="{gb}" stroke="#7A1E0E" stroke-width="1"/>')
    if body:
        out.append(f'<ellipse cx="{fmt(cx)}" cy="{fmt(cy + 14 * s)}" rx="{fmt(22 * s)}" ry="{fmt(34 * s)}" fill="{gb}" stroke="#7A1E0E" stroke-width="1"/>')
    for row in range(4 if body else 0):
        for i in range(3 + row % 2):
            x = cx + (i - (2 + row % 2) / 2) * 11 * s
            y = cy + (2 + row * 11) * s
            out.append(f'<path d="M{fmt(x - 5 * s)} {fmt(y)} Q{fmt(x)} {fmt(y + 9 * s)} {fmt(x + 5 * s)} {fmt(y)}" fill="none" stroke="#B8501A" stroke-width="1" opacity="0.8"/>')
    hx, hy = cx + hd * (nk[-1][0] + 2) * s, cy + (nk[-1][1] - 4) * s
    for k, (da, L) in enumerate(((-150, 46), (-128, 54), (-108, 40))):
        a = math.radians(da if hd > 0 else -180 - da)
        ctrl = [(hx, hy - 4 * s), (hx + math.cos(a) * L * s * 0.5, hy + math.sin(a) * L * s * 0.5 - 4 * s), (hx + math.cos(a) * L * s, hy + math.sin(a) * L * s)]
        out.append(plume(card, ctrl, 5 * s, "#E8B53C", "#D8321F", uid=f"{uid}cr{k}", barbs=False))
    out.append(f'<ellipse cx="{fmt(hx)}" cy="{fmt(hy)}" rx="{fmt(12 * s)}" ry="{fmt(10 * s)}" fill="{gb}" stroke="#7A1E0E" stroke-width="1"/>')
    bx = hx + hd * 10 * s
    out.append(f'<path d="M{fmt(bx)} {fmt(hy - 5 * s)} Q{fmt(bx + hd * 16 * s)} {fmt(hy - 2 * s)} {fmt(bx + hd * 14 * s)} {fmt(hy + 8 * s)} Q{fmt(bx + hd * 8 * s)} {fmt(hy + 2 * s)} {fmt(bx)} {fmt(hy + 4 * s)}Z" fill="#F2C24A" stroke="#7A4A08" stroke-width="0.8"/>')
    out.append(f'<path d="M{fmt(hx + hd * 4 * s)} {fmt(hy + 6 * s)} q{fmt(hd * 4 * s)} {fmt(10 * s)} {fmt(hd * 10 * s)} {fmt(8 * s)} q{fmt(-hd * 2 * s)} {fmt(-6 * s)} {fmt(hd * 2 * s)} {fmt(-8 * s)}Z" fill="#D8321F"/>')
    out.append(f'<circle cx="{fmt(hx + hd * 3 * s)}" cy="{fmt(hy - 2 * s)}" r="{fmt(2.8 * s)}" fill="#140A04" stroke="#FFF1BE" stroke-width="{fmt(1.2 * s)}"/>')
    out.append(f'<path d="M{fmt(hx - hd * 2 * s)} {fmt(hy - 6 * s)} q{fmt(hd * 6 * s)} {fmt(-4 * s)} {fmt(hd * 12 * s)} 0" fill="none" stroke="#3FB68B" stroke-width="{fmt(1.6 * s)}"/>')
    return "".join(out)


# ---------------------------------------------------------------- la girafe-qilin (Malindi, 1414)

def giraffe(card, cx, cy, s=1.0, flip=False, harness=True):
    """La girafe offerte par l'ambassade de Malindi, saluée comme un qilin : robe réticulée, licol de soie rouge."""
    cid = nid("gir")
    torso = "M-40 -8 C-30 -26 22 -34 38 -22 C48 -14 46 6 36 12 C14 18 -22 16 -38 8 C-46 4 -46 -2 -40 -8Z"
    neck = "M22 -24 C30 -60 44 -100 58 -128 L72 -124 C62 -96 54 -56 44 -14Z"
    head = "M54 -130 C58 -142 72 -146 82 -140 C92 -134 98 -126 96 -120 C92 -116 84 -118 76 -120 C70 -118 62 -118 58 -122Z"
    legs = []
    for x0, ph in ((-34, 0.0), (-22, 1.0), (26, 0.4), (36, 1.4)):
        kx = x0 + math.sin(ph) * 4
        legs.append(f"M{x0 - 6} 0 L{x0 + 6} 0 L{fmt(kx + 3.2)} 42 Q{fmt(kx + 4.5)} 46 {fmt(kx + 3)} 50 L{fmt(kx + 2.2)} 82 L{fmt(kx - 2.6)} 82 L{fmt(kx - 3)} 50 Q{fmt(kx - 4.5)} 46 {fmt(kx - 3.2)} 42Z")
    sil = "".join(f'<path d="{d}"/>' for d in [torso, neck, head] + legs)
    upper = "".join(f'<path d="{d}"/>' for d in [torso, neck, head]) + '<rect x="-60" y="0" width="120" height="34"/>'
    card.def_once(cid, f'<clipPath id="{card.id(cid)}"><path d="{torso}"/><path d="{neck}"/><path d="{head}"/></clipPath>')
    rnd = random.Random(5)
    patches = []
    for gx in range(-60, 110, 11):
        for gy in range(-160, 100, 11):
            x, y = gx + rnd.uniform(-2, 2) + (5.5 if (gy // 11) % 2 else 0), gy + rnd.uniform(-2, 2)
            r = rnd.uniform(5.6, 6.4)
            pts = [(x + math.cos(a) * r * rnd.uniform(0.85, 1.15), y + math.sin(a) * r * rnd.uniform(0.85, 1.15)) for a in [i * math.pi / 3 + rnd.uniform(-0.2, 0.2) for i in range(6)]]
            patches.append(f'<path d="{poly_d(pts)}" fill="#B4561E"/>')
    out = [f'<g fill="#F6E2B8">{sil}</g>', f'<g clip-path="url(#{card.id(cid)})">{"".join(patches)}'
           f'<rect x="-60" y="-160" width="170" height="260" fill="{card.grad("gir-sh", [(0, "#FFFFFF"), (0.5, "#FFFFFF"), (1, "#3A1A08")], 0, 0, 0, 1)}" opacity="0.25"/></g>']
    out.append(f'<g fill="none" stroke="#5A2A0C" stroke-width="1">{"".join(f"<path d=\"{d}\"/>" for d in [torso, neck, head] + legs)}</g>')
    out.append('<path d="M62 -140 L60 -154 M68 -142 L68 -156" stroke="#5A2A0C" stroke-width="2.4" stroke-linecap="round"/>'
               '<circle cx="60" cy="-155" r="2.6" fill="#3A1A08"/><circle cx="68" cy="-157" r="2.6" fill="#3A1A08"/>'
               '<path d="M58 -136 l-10 -6 l8 10Z" fill="#E8C690" stroke="#5A2A0C" stroke-width="0.8"/>'
               '<circle cx="76" cy="-134" r="2.2" fill="#1A0A04"/><circle cx="76.6" cy="-134.6" r="0.7" fill="#FFFFFF"/>'
               '<path d="M-42 -4 C-52 4 -56 20 -54 40" stroke="#5A2A0C" stroke-width="1.6" fill="none"/>'
               '<path d="M-54 38 q-4 8 0 12 q4 -4 0 -12Z" fill="#3A1A08"/>')
    for x in (-34, -22, 26, 36):
        out.append(f'<rect x="{x - 4}" y="82" width="8" height="5" rx="1.5" fill="#2A1206"/>')
    out.append('<path d="M56 -126 C48 -100 38 -64 26 -28" stroke="#6A300C" stroke-width="3" fill="none" stroke-dasharray="2 1.4"/>')
    if harness:
        out.append('<path d="M60 -124 L92 -124 M70 -128 L74 -118 M60 -124 C62 -110 68 -104 74 -100" stroke="#C8201A" stroke-width="2.6" fill="none" stroke-linecap="round"/>'
                   '<path d="M30 -24 C20 -6 -6 -6 -14 -26" stroke="#C8201A" stroke-width="3" fill="none"/>'
                   '<circle cx="74" cy="-100" r="3" fill="#E8B53C"/>'
                   '<path d="M74 -98 l-3 14 l3 -2 l3 2Z" fill="#C8201A"/>'
                   '<path d="M-12 -26 C-8 -38 16 -40 26 -30 L28 -20 C14 -26 -2 -24 -10 -16Z" fill="#E8B53C" opacity="0.9"/>')
    return tf("".join(out), cx, cy, 0, s, flip)
