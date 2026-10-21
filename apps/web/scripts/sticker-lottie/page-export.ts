/**
 * L'EXPORT LOTTIE D'UN STICKER SVG, DANS LA PAGE (#10639) — n'importe quel
 * sticker dessiné en SVG et animé en CSS : Mee et Meo, les Instants, et demain
 * les packs. Ce module est bundlé (`shoot.ts`) et injecté dans le Chromium qui
 * filme les stickers. Il
 * lit le SVG déjà rendu : la géométrie depuis les attributs, les couleurs et
 * l'opacité depuis le style CALCULÉ, et le mouvement en jouant les animations
 * CSS image par image. Le navigateur reste la référence ; rien du CSS n'est
 * réinterprété.
 *
 * La DÉCOUPE, facultative (le liseré blanc et son ombre des Mee, un filtre
 * SVG sur le web), devient une seconde couche : le même dessin, chaque forme repeinte en
 * blanc et cernée d'un trait rond de `outline` unités ÉCRAN — l'épaisseur
 * suit l'échelle cumulée de la forme, comme une dilatation qui agit après le
 * mouvement. L'ombre est l'effet « Drop Shadow » de cette couche, que
 * lottie-ios rend en Core Animation. Une forme presque transparente (l'ombre
 * au sol) reste hors de la découpe, comme sur le web.
 */
import { parsePathData } from './geometry';
import { animatedValue, decomposeAffine, unwrapDegrees, type Affine, type AnimatedValue } from './keyframes';

export type DieCut = {
  readonly paper: readonly [number, number, number];
  readonly ink: readonly [number, number, number];
  readonly outline: number;
  readonly minCutOpacity: number;
  readonly shadow: { readonly opacity: number; readonly distance: number; readonly softness: number };
};

export type ExportOptions = {
  readonly fps: number;
  readonly frames: number;
  readonly scene: string;
  readonly box: { readonly x: number; readonly y: number; readonly size: number };
  readonly dieCut: DieCut | null;
};

type Item = { readonly ty: string } & { readonly [key: string]: unknown };
type Mode = 'art' | 'cut';
type Sample = { readonly matrix: Affine[]; readonly opacity: number[]; readonly scale: number[] };

const SHAPES = new Set(['path', 'circle', 'ellipse', 'rect']);
const r2 = (value: number): number => Math.round(value * 100) / 100 + 0;
const fixed = (k: number | readonly number[]): AnimatedValue => ({ a: 0, k });

const attr = (el: Element, name: string, fallback = 0): number => {
  const value = el.getAttribute(name);
  return value === null ? fallback : parseFloat(value);
};

const rgb = (css: string): { readonly color: readonly [number, number, number]; readonly alpha: number } | null => {
  const match = css.match(/rgba?\(([^)]+)\)/);
  if (match === null) return null;
  const parts = (match[1] as string).split(/[\s,/]+/).filter(Boolean).map(Number);
  return { color: [r2((parts[0] ?? 0) / 255), r2((parts[1] ?? 0) / 255), r2((parts[2] ?? 0) / 255)], alpha: parts[3] ?? 1 };
};

const fraction = (value: string | null, fallback: number): number => {
  if (value === null) return fallback;
  return value.endsWith('%') ? parseFloat(value) / 100 : parseFloat(value);
};

const dashes = (css: string): readonly Item[] | null => {
  if (css === '' || css === 'none') return null;
  const lengths = css.split(/[\s,]+/).map(parseFloat);
  return [...lengths.map((v, i) => ({ ty: 'dash', n: i % 2 === 0 ? 'd' : 'g', nm: i % 2 === 0 ? 'dash' : 'gap', v: fixed(v) })), { ty: 'dash', n: 'o', nm: 'offset', v: fixed(0) }];
};

const capOf = (css: string): number => (css === 'round' ? 2 : css === 'square' ? 3 : 1);
const joinOf = (css: string): number => (css === 'round' ? 2 : css === 'bevel' ? 3 : 1);

export function exportSticker(o: ExportOptions): { readonly animation: unknown; readonly unsupported: readonly string[] } {
  const root = document.querySelector(o.scene);
  if (!(root instanceof SVGGraphicsElement)) throw new Error(`aucune scène « ${o.scene} » dans la page`);
  const unsupported: string[] = [];

  const visible = (el: Element): boolean => {
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };
  const nodes: SVGGraphicsElement[] = [];
  const walk = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      const tag = child.tagName.toLowerCase();
      if (!(child instanceof SVGGraphicsElement) || !visible(child)) continue;
      if (tag === 'g') {
        nodes.push(child);
        walk(child);
      } else if (SHAPES.has(tag)) nodes.push(child);
      else if (tag !== 'defs' && tag !== 'style' && tag !== 'title') unsupported.push(tag);
    }
  };
  walk(root);
  const known = new Set<Element>(nodes);

  const local = (el: SVGGraphicsElement): DOMMatrix => {
    const style = getComputedStyle(el);
    if (style.transform === 'none') return new DOMMatrix();
    const [ox = 0, oy = 0] = style.transformOrigin.split(' ').map(parseFloat);
    const box = style.transformBox === 'fill-box' ? el.getBBox() : { x: 0, y: 0 };
    const cx = box.x + ox;
    const cy = box.y + oy;
    return new DOMMatrix().translate(cx, cy).multiply(new DOMMatrix(style.transform)).translate(-cx, -cy);
  };

  const animations = document.getAnimations();
  const seek = (ms: number) =>
    animations.forEach((animation) => {
      animation.pause();
      animation.currentTime = ms;
    });
  const rootMatrix = root.getCTM() ?? new DOMMatrix();
  const rootDet = Math.abs(rootMatrix.a * rootMatrix.d - rootMatrix.b * rootMatrix.c) || 1;
  const samples = new Map<Element, Sample>(nodes.map((n) => [n, { matrix: [], opacity: [], scale: [] }]));
  for (let frame = 0; frame < o.frames; frame += 1) {
    seek((frame * 1000) / o.fps);
    for (const n of nodes) {
      const s = samples.get(n) as Sample;
      const m = local(n);
      const ctm = n.getCTM() ?? new DOMMatrix();
      s.matrix.push([m.a, m.b, m.c, m.d, m.e, m.f]);
      s.opacity.push(parseFloat(getComputedStyle(n).opacity));
      s.scale.push(Math.sqrt(Math.abs(ctm.a * ctm.d - ctm.b * ctm.c) / rootDet));
    }
  }
  seek(0);

  const loop = { loopFrames: o.frames };
  const transform = (el: Element, mode: Mode): Item => {
    const s = samples.get(el) as Sample;
    const parts = s.matrix.map(decomposeAffine);
    const rotation = unwrapDegrees(parts.map((p) => p.rotation));
    const cutOpacity = (value: number) => Math.min(1, Math.max(0, 5 * value - 0.9));
    return {
      ty: 'tr',
      a: fixed([0, 0]),
      p: animatedValue(parts.map((p) => p.position), { epsilon: 0.12, ...loop }),
      s: animatedValue(parts.map((p) => p.scale), { epsilon: 0.4, ...loop }),
      r: animatedValue(rotation.map((r) => [r]), { epsilon: 0.25, ...loop }),
      o: animatedValue(s.opacity.map((v) => [(mode === 'cut' ? cutOpacity(v) : v) * 100]), { epsilon: 1, ...loop }),
      sk: fixed(0),
      sa: fixed(0),
    };
  };

  const geometry = (el: Element): readonly Item[] => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'circle') {
      const r = attr(el, 'r');
      return [{ ty: 'el', p: fixed([r2(attr(el, 'cx')), r2(attr(el, 'cy'))]), s: fixed([r2(2 * r), r2(2 * r)]) }];
    }
    if (tag === 'ellipse') return [{ ty: 'el', p: fixed([r2(attr(el, 'cx')), r2(attr(el, 'cy'))]), s: fixed([r2(2 * attr(el, 'rx')), r2(2 * attr(el, 'ry'))]) }];
    if (tag === 'rect') {
      const w = attr(el, 'width');
      const h = attr(el, 'height');
      return [{ ty: 'rc', p: fixed([r2(attr(el, 'x') + w / 2), r2(attr(el, 'y') + h / 2)]), s: fixed([r2(w), r2(h)]), r: fixed(r2(attr(el, 'rx', attr(el, 'ry')))) }];
    }
    return parsePathData(el.getAttribute('d') ?? '').map((shape) => ({
      ty: 'sh',
      ks: { a: 0, k: { c: shape.closed, v: shape.vertices.map((p) => p.map(r2)), i: shape.inTangents.map((p) => p.map(r2)), o: shape.outTangents.map((p) => p.map(r2)) } },
    }));
  };

  const gradient = (el: SVGGraphicsElement, url: string, ty: 'gf' | 'gs', opacity: number): Item => {
    const id = (url.match(/#([^")]+)/) ?? [])[1] ?? '';
    const g = document.getElementById(id);
    if (g === null) throw new Error(`dégradé introuvable : ${id}`);
    const box = el.getBBox();
    const stops = Array.from(g.querySelectorAll('stop'));
    const colors = stops.flatMap((stop) => [fraction(stop.getAttribute('offset'), 0), ...(rgb(getComputedStyle(stop).stopColor)?.color ?? [0, 0, 0])]);
    const alphas = stops.flatMap((stop) => [fraction(stop.getAttribute('offset'), 0), r2((rgb(getComputedStyle(stop).stopColor)?.alpha ?? 1) * parseFloat(getComputedStyle(stop).stopOpacity || '1'))]);
    const translucent = alphas.some((value, index) => index % 2 === 1 && value < 1);
    const at = (fx: number, fy: number) => [r2(box.x + fx * box.width), r2(box.y + fy * box.height)];
    const linear = g.tagName.toLowerCase() === 'lineargradient';
    const cx = fraction(g.getAttribute('cx'), 0.5);
    const cy = fraction(g.getAttribute('cy'), 0.5);
    const radius = fraction(g.getAttribute('r'), 0.5) * Math.sqrt((box.width * box.width + box.height * box.height) / 2);
    const start = linear ? at(fraction(g.getAttribute('x1'), 0), fraction(g.getAttribute('y1'), 0)) : at(cx, cy);
    const end = linear ? at(fraction(g.getAttribute('x2'), 1), fraction(g.getAttribute('y2'), 0)) : [r2((start[0] as number) + radius), start[1] as number];
    return { ty, o: fixed(r2(opacity * 100)), r: 1, t: linear ? 1 : 2, s: fixed(start), e: fixed(end), g: { p: stops.length, k: fixed(translucent ? [...colors, ...alphas] : colors) } };
  };

  const ownOpacity = (el: Element): number => {
    let value = parseFloat(el.getAttribute('fill-opacity') ?? '1');
    for (let n: Element | null = el; n !== null && n !== root; n = n.parentElement) value *= parseFloat(n.getAttribute('opacity') ?? '1');
    return value;
  };

  const paints = (el: SVGGraphicsElement, mode: Mode): readonly Item[] => {
    const style = getComputedStyle(el);
    const width = parseFloat(style.strokeWidth) || 0;
    const stroked = style.stroke !== 'none' && width > 0;
    const filled = style.fill !== 'none';
    const pattern = stroked ? dashes(style.strokeDasharray) : null;
    if (mode === 'cut' && o.dieCut !== null) {
      const cutOf = o.dieCut;
      const scale = (samples.get(el) as Sample).scale;
      const cut: Item = {
        ty: 'st',
        c: fixed([...cutOf.paper, 1]),
        o: fixed(100),
        w: animatedValue(scale.map((k) => [(stroked ? width : 0) + (2 * cutOf.outline) / Math.max(k, 0.05)]), { epsilon: 0.15, ...loop }),
        lc: 2,
        lj: 2,
        ml: 4,
        ...(pattern === null ? {} : { d: pattern }),
      };
      return filled ? [cut, { ty: 'fl', c: fixed([...cutOf.paper, 1]), o: fixed(100), r: 1 }] : [cut];
    }
    const out: Item[] = [];
    if (stroked) {
      const opacity = parseFloat(style.strokeOpacity);
      const common = { w: fixed(r2(width)), lc: capOf(style.strokeLinecap), lj: joinOf(style.strokeLinejoin), ml: 4, ...(pattern === null ? {} : { d: pattern }) };
      const solid = rgb(style.stroke);
      if (style.stroke.startsWith('url')) out.push({ ...gradient(el, style.stroke, 'gs', opacity), ...common });
      else if (solid !== null) out.push({ ty: 'st', c: fixed([...solid.color, 1]), o: fixed(r2(opacity * solid.alpha * 100)), ...common });
    }
    if (filled) {
      const opacity = parseFloat(style.fillOpacity);
      const solid = rgb(style.fill);
      if (style.fill.startsWith('url')) out.push(gradient(el, style.fill, 'gf', opacity));
      else if (solid !== null) out.push({ ty: 'fl', c: fixed([...solid.color, 1]), o: fixed(r2(opacity * solid.alpha * 100)), r: 1 });
    }
    return out;
  };

  const build = (el: SVGGraphicsElement, mode: Mode): Item | null => {
    const isGroup = el.tagName.toLowerCase() === 'g';
    if (!isGroup && mode === 'cut' && ownOpacity(el) < (o.dieCut?.minCutOpacity ?? 0)) return null;
    const items = isGroup ? children(el, mode) : [...geometry(el), ...paints(el, mode)];
    return { ty: 'gr', it: [...items, transform(el, mode)] };
  };
  const children = (el: Element, mode: Mode): readonly Item[] =>
    Array.from(el.children)
      .filter((child): child is SVGGraphicsElement => known.has(child))
      .reverse()
      .map((child) => build(child, mode))
      .filter((item): item is Item => item !== null);

  const shadow = (cut: DieCut) => ({
    ty: 25,
    nm: 'Drop Shadow',
    np: 8,
    ix: 1,
    en: 1,
    ef: [
      { ty: 2, nm: 'Shadow Color', ix: 1, v: fixed([...cut.ink, 1]) },
      { ty: 0, nm: 'Opacity', ix: 2, v: fixed(r2(cut.shadow.opacity * 255)) },
      { ty: 0, nm: 'Direction', ix: 3, v: fixed(180) },
      { ty: 0, nm: 'Distance', ix: 4, v: fixed(cut.shadow.distance) },
      { ty: 0, nm: 'Softness', ix: 5, v: fixed(cut.shadow.softness) },
      { ty: 7, nm: 'Shadow Only', ix: 6, v: fixed(0) },
    ],
  });
  const layer = (mode: Mode, ind: number) => ({
    ddd: 0,
    ind,
    ty: 4,
    nm: mode,
    sr: 1,
    ip: 0,
    op: o.frames,
    st: 0,
    bm: 0,
    ks: { o: fixed(100), r: fixed(0), p: fixed([-o.box.x, -o.box.y, 0]), a: fixed([0, 0, 0]), s: fixed([100, 100, 100]) },
    shapes: children(root, mode),
    ...(mode === 'cut' && o.dieCut !== null ? { ef: [shadow(o.dieCut)] } : {}),
  });
  return {
    animation: { v: '5.12.0', fr: o.fps, ip: 0, op: o.frames, w: o.box.size, h: o.box.size, nm: 'mee', ddd: 0, assets: [], layers: o.dieCut === null ? [layer('art', 1)] : [layer('art', 1), layer('cut', 2)] },
    unsupported,
  };
}
