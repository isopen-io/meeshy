"""Géométrie de l'atelier « Empire céleste » : splines, rubans effilés, spirales, transformations."""

import math


def fmt(v):
    return f"{v:.1f}".rstrip("0").rstrip(".")


def catmull(pts, n=14):
    out = []
    for i in range(len(pts) - 1):
        p0 = pts[i - 1] if i > 0 else pts[i]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[i + 2] if i + 2 < len(pts) else pts[i + 1]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(tuple(
                0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                       + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)
                for j in (0, 1)
            ))
    out.append(tuple(pts[-1]))
    return out


def resample(poly, n):
    """`n` points régulièrement espacés le long de la polyligne, avec l'angle de la tangente (radians)."""
    seg = [math.dist(poly[i], poly[i + 1]) for i in range(len(poly) - 1)]
    total = sum(seg) or 1.0
    out = []
    j, acc = 0, 0.0
    for k in range(n):
        d = total * k / (n - 1)
        while j < len(seg) - 1 and acc + seg[j] < d:
            acc += seg[j]
            j += 1
        t = 0 if seg[j] == 0 else (d - acc) / seg[j]
        t = max(0.0, min(1.0, t))
        x = poly[j][0] + (poly[j + 1][0] - poly[j][0]) * t
        y = poly[j][1] + (poly[j + 1][1] - poly[j][1]) * t
        a = math.atan2(poly[j + 1][1] - poly[j][1], poly[j + 1][0] - poly[j][0])
        out.append((x, y, a))
    sm = []
    for i, (x, y, _) in enumerate(out):
        a0 = out[max(0, i - 1)]
        a1 = out[min(n - 1, i + 1)]
        sm.append((x, y, math.atan2(a1[1] - a0[1], a1[0] - a0[0])))
    return sm, total


def spine(ctrl, n=120, sub=16):
    return resample(catmull(ctrl, sub), n)


def sides(samples, wfn):
    left, right = [], []
    n = len(samples)
    for i, (x, y, a) in enumerate(samples):
        t = i / (n - 1)
        w = wfn(t) / 2
        nx, ny = -math.sin(a), math.cos(a)
        left.append((x + nx * w, y + ny * w))
        right.append((x - nx * w, y - ny * w))
    return left, right


def poly_d(pts, close=True):
    d = "M" + " L".join(f"{fmt(x)} {fmt(y)}" for x, y in pts)
    return d + ("Z" if close else "")


def ribbon_d(samples, wfn):
    left, right = sides(samples, wfn)
    return poly_d(left + right[::-1])


def offset(samples, k):
    """Polyligne décalée de `k` (fonction de t ou constante) le long de la normale."""
    n = len(samples)
    out = []
    for i, (x, y, a) in enumerate(samples):
        t = i / max(1, n - 1)
        kk = k(t) if callable(k) else k
        out.append((x - math.sin(a) * kk, y + math.cos(a) * kk))
    return out


def spiral_pts(cx, cy, r0, r1, a0, turns, n=60, cw=True):
    out = []
    for i in range(n + 1):
        t = i / n
        r = r0 + (r1 - r0) * t
        a = a0 + (1 if cw else -1) * turns * 2 * math.pi * t
        out.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return out


def tf(content, x=0, y=0, rot=0, s=1, flip=False, sy=None, op=None, extra=""):
    parts = [f"translate({fmt(x)} {fmt(y)})"]
    if rot:
        parts.append(f"rotate({fmt(rot)})")
    sx = -s if flip else s
    sy = s if sy is None else sy
    if sx != 1 or sy != 1:
        parts.append(f"scale({fmt(sx)} {fmt(sy)})")
    o = f' opacity="{fmt(op)}"' if op is not None else ""
    return f'<g transform="{" ".join(parts)}"{o}{extra}>{content}</g>'


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    a = [int(c1[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(c2[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(lerp(a[i], b[i], t)):02X}" for i in range(3))
