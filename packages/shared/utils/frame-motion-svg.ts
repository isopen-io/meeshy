/**
 * LES MOUVEMENTS D'UN CADRE, RENDUS PAR LE GPU (#10935) — fonctions PURES, sans
 * DOM, communes aux contours d'avatar (`appearance-svg.ts`) et aux cadres de
 * bannière (`banner-frame-svg.ts`). Un mouvement déclaré (`frame-decor.ts`)
 * devient une COUCHE : les chemins qu'il anime quittent le dessin fixe pour un
 * `<svg>` posé dans un `<span>` que le navigateur compose, animé sur `transform`
 * et `opacity` SEULS — jamais un redessin par image. Le reflet (`sweep`) est un
 * bandeau de lumière qui glisse, découpé à la forme de ses cibles (masque), sa
 * cible restant dans le dessin fixe.
 *
 * Les cibles qui bougent EXACTEMENT ensemble (même chaîne de mouvements, même
 * origine, même délai) partagent une couche ; un décalage (`stagger`) ou une
 * origine propre (`self`) en fait des couches distinctes. Les couches se posent
 * AU-DESSUS du dessin fixe, dans l'ordre du document.
 *
 * `FRAME_MOTION_CSS` est la seule feuille de style de ces couches : mouvement
 * réduit ⇒ tout s'arrête et le cadre fixe reste ; `[data-frame-paused]` (hors
 * écran) et `:root[data-app-hidden]` (application en arrière-plan) les figent.
 */
import type { FrameGradient, FrameMotion, FrameMotionKind, FrameMotionOrigin } from '../types/frame-decor.js';

export type Bounds = { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number };
export type Point = { readonly x: number; readonly y: number };

const round2 = (value: number): number => Math.round(value * 100) / 100;
export const num = (value: number): string => String(round2(value));

// ── Les bornes d'un chemin ──────────────────────────────────────────────

const ARITY: Readonly<Record<string, number>> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
const TOKENS = /[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;

/**
 * La boîte d'un chemin, points de contrôle compris (enveloppe prudente) : elle
 * sert d'ORIGINE aux mouvements `self` / `top` / `bottom`, jamais de découpe.
 */
export function pathBounds(d: string): Bounds | null {
  const tokens = d.match(TOKENS) ?? [];
  const points: Point[] = [];
  let command = '';
  let [x, y, startX, startY] = [0, 0, 0, 0];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index]!;
    if (/^[A-Za-z]$/.test(token)) {
      command = token;
      index += 1;
      if (command.toLowerCase() === 'z') [x, y] = [startX, startY];
      continue;
    }
    const lower = command.toLowerCase();
    const arity = ARITY[lower] ?? 0;
    if (arity === 0) {
      index += 1;
      continue;
    }
    const args = tokens.slice(index, index + arity).map(Number);
    index += arity;
    if (args.length < arity || args.some((value) => !Number.isFinite(value))) break;
    const relative = command !== command.toUpperCase();
    const at = (dx: number, dy: number): Point => (relative ? { x: x + dx, y: y + dy } : { x: dx, y: dy });
    const end = (point: Point): void => {
      points.push(point);
      [x, y] = [point.x, point.y];
    };
    switch (lower) {
      case 'm':
        end(at(args[0]!, args[1]!));
        [startX, startY] = [x, y];
        command = relative ? 'l' : 'L';
        break;
      case 'h':
        end({ x: relative ? x + args[0]! : args[0]!, y });
        break;
      case 'v':
        end({ x, y: relative ? y + args[0]! : args[0]! });
        break;
      case 'a':
        end(at(args[5]!, args[6]!));
        break;
      default: {
        const pairs = Array.from({ length: arity / 2 }, (_, pair) => at(args[pair * 2]!, args[pair * 2 + 1]!));
        points.push(...pairs.slice(0, -1));
        end(pairs.at(-1)!);
      }
    }
  }
  if (points.length === 0) return null;
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

// ── Le plan des couches ─────────────────────────────────────────────────

export type MotionElement = { readonly group?: string | undefined; readonly bounds: Bounds | null };

/** Un mouvement appliqué à une couche, dans le repère du dessin (viewBox). */
export type MotionStep = {
  readonly kind: Exclude<FrameMotionKind, 'sweep'>;
  readonly duration: number;
  readonly delay: number;
  readonly direction: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
  readonly timing: string;
  readonly origin: Point;
  /** Les propriétés que les images clés lisent (`--fm-from`, `--fm-to`, `--fm-s`, `--fm-o`). */
  readonly vars: Readonly<Record<string, string>>;
};

export type MotionLayer = { readonly elements: readonly number[]; readonly chain: readonly MotionStep[] };
export type SweepLayer = { readonly elements: readonly number[]; readonly duration: number; readonly delay: number; readonly reverse: boolean };

export type MotionPlan = {
  readonly layers: readonly MotionLayer[];
  readonly sweeps: readonly SweepLayer[];
  /** Les éléments qui quittent le dessin fixe (le reflet laisse sa cible en place). */
  readonly animated: ReadonlySet<number>;
};

const DEFAULT_ORIGIN: Readonly<Record<Exclude<FrameMotionKind, 'sweep' | 'twinkle'>, FrameMotionOrigin>> = {
  rotate: 'frame',
  pulse: 'self',
  skew: 'top',
};

const originOf = (motion: FrameMotion, bounds: Bounds | null, center: Point): Point => {
  if (motion.kind === 'twinkle' || motion.kind === 'sweep') return center;
  const origin = motion.origin ?? DEFAULT_ORIGIN[motion.kind];
  if (origin === 'frame' || bounds === null) return center;
  const x = (bounds.minX + bounds.maxX) / 2;
  if (origin === 'top') return { x, y: bounds.minY };
  if (origin === 'bottom') return { x, y: bounds.maxY };
  return { x, y: (bounds.minY + bounds.maxY) / 2 };
};

const stepOf = (motion: FrameMotion, delay: number, origin: Point): MotionStep | null => {
  const reverse = motion.direction === 'reverse';
  const base = { duration: motion.duration, delay, origin };
  switch (motion.kind) {
    case 'rotate': {
      const amplitude = motion.amplitude ?? 360;
      if (motion.direction === 'alternate') {
        return { ...base, kind: 'rotate', direction: 'alternate', timing: 'ease-in-out', vars: { '--fm-from': `${num(-amplitude)}deg`, '--fm-to': `${num(amplitude)}deg` } };
      }
      return { ...base, kind: 'rotate', direction: reverse ? 'reverse' : 'normal', timing: amplitude === 360 ? 'linear' : 'ease-in-out', vars: { '--fm-from': '0deg', '--fm-to': `${num(amplitude)}deg` } };
    }
    case 'pulse':
      return { ...base, kind: 'pulse', direction: 'normal', timing: 'ease-in-out', vars: { '--fm-s': num(1 + (motion.amplitude ?? 0.1)) } };
    case 'twinkle':
      return { ...base, kind: 'twinkle', direction: 'normal', timing: 'ease-in-out', vars: { '--fm-o': num(1 - (motion.amplitude ?? 0.75)) } };
    case 'skew': {
      const amplitude = motion.amplitude ?? 7;
      return { ...base, kind: 'skew', direction: reverse ? 'alternate-reverse' : 'alternate', timing: 'ease-in-out', vars: { '--fm-from': `${num(-amplitude)}deg`, '--fm-to': `${num(amplitude)}deg` } };
    }
    case 'sweep':
      return null;
  }
};

/** Les éléments que désigne un mouvement, cible par cible puis dans l'ordre du document. */
const targetsOf = (motion: FrameMotion, elements: readonly MotionElement[]): readonly number[] =>
  motion.targets.flatMap((target) => elements.flatMap((element, index) => (element.group === target ? [index] : [])));

const stepKey = (step: MotionStep): string => JSON.stringify(step);

export function frameMotionLayers({ elements, motions, center }: { readonly elements: readonly MotionElement[]; readonly motions: readonly FrameMotion[]; readonly center: Point }): MotionPlan {
  const chains = elements.map((): MotionStep[] => []);
  const sweeps: SweepLayer[] = [];
  motions.forEach((motion) => {
    const targets = targetsOf(motion, elements);
    if (targets.length === 0) return;
    if (motion.kind === 'sweep') {
      sweeps.push({ elements: targets, duration: motion.duration, delay: motion.delay ?? 0, reverse: motion.direction === 'reverse' });
      return;
    }
    targets.forEach((element, order) => {
      const step = stepOf(motion, (motion.delay ?? 0) + order * (motion.stagger ?? 0), originOf(motion, elements[element]!.bounds, center));
      if (step !== null) chains[element]!.push(step);
    });
  });
  const grouped = new Map<string, { elements: number[]; chain: readonly MotionStep[] }>();
  chains.forEach((chain, element) => {
    if (chain.length === 0) return;
    const key = chain.map(stepKey).join('|');
    const layer = grouped.get(key);
    if (layer === undefined) grouped.set(key, { elements: [element], chain });
    else layer.elements.push(element);
  });
  const layers = [...grouped.values()];
  return { layers, sweeps, animated: new Set(layers.flatMap((layer) => layer.elements)) };
}

// ── Le balisage des couches ─────────────────────────────────────────────

const KEYFRAME: Readonly<Record<MotionStep['kind'], string>> = { rotate: 'fm-rotate', pulse: 'fm-pulse', twinkle: 'fm-twinkle', skew: 'fm-skew' };

/** Le style d'un `<span>` de couche : `scale` convertit le repère du dessin en pixels de la boîte. */
const stepStyle = (step: MotionStep, scale: number): string =>
  [
    'position:absolute',
    'inset:0',
    `animation-name:${KEYFRAME[step.kind]}`,
    `animation-duration:${num(step.duration)}s`,
    `animation-delay:${num(step.delay)}s`,
    `animation-timing-function:${step.timing}`,
    `animation-direction:${step.direction}`,
    `transform-origin:${num(step.origin.x * scale)}px ${num(step.origin.y * scale)}px`,
    ...Object.entries(step.vars).map(([name, value]) => `${name}:${value}`),
  ].join(';');

/** Une couche animée : ses mouvements s'emboîtent (un `<span>` chacun), le dessin au cœur. */
export const motionLayerMarkup = (chain: readonly MotionStep[], scale: number, svg: string): string =>
  chain.reduceRight((inner, step) => `<span class="fm" style="${stepStyle(step, scale)}">${inner}</span>`, svg);

/** La largeur du bandeau de lumière, dans le repère du dessin. */
const SHEEN = 0.3;

/**
 * Un reflet : un bandeau incliné qui traverse la boîte, découpé (`mask-image`) à la
 * forme de ses cibles. `maskSvg` porte les cibles en blanc, à la taille de la boîte.
 */
export const sweepLayerMarkup = ({ sweep, maskSvg, width, height }: { readonly sweep: SweepLayer; readonly maskSvg: string; readonly width: number; readonly height: number }): string => {
  const band = Math.max(height * SHEEN, 8);
  const mask = `url('data:image/svg+xml,${encodeURIComponent(maskSvg)}')`;
  const holder = `position:absolute;inset:0;overflow:hidden;pointer-events:none;-webkit-mask-image:${mask};mask-image:${mask};-webkit-mask-size:100% 100%;mask-size:100% 100%`;
  const moving = [
    'position:absolute',
    'top:0',
    `left:${num(-band * 2)}px`,
    `width:${num(band)}px`,
    'height:100%',
    'animation-name:fm-sweep',
    `animation-duration:${num(sweep.duration)}s`,
    `animation-delay:${num(sweep.delay)}s`,
    'animation-timing-function:cubic-bezier(.45,.05,.35,1)',
    `animation-direction:${sweep.reverse ? 'reverse' : 'normal'}`,
    `--fm-dx:${num(width + band * 3)}px`,
  ].join(';');
  const sheen = 'display:block;width:100%;height:100%;transform:skewX(-24deg);background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.55),rgba(255,255,255,0))';
  return `<span data-frame-sweep style="${holder}"><span class="fm" style="${moving}"><span style="${sheen}"></span></span></span>`;
};

/**
 * La feuille de style des couches, injectée UNE fois par le client. Les images clés
 * ne touchent que `transform` et `opacity` : le compositeur les joue seul.
 */
export const FRAME_MOTION_CSS = [
  '@keyframes fm-rotate{from{transform:rotate(var(--fm-from))}to{transform:rotate(var(--fm-to))}}',
  '@keyframes fm-pulse{0%,100%{transform:scale(1)}50%{transform:scale(var(--fm-s))}}',
  '@keyframes fm-twinkle{0%,100%{opacity:1}50%{opacity:var(--fm-o)}}',
  '@keyframes fm-skew{from{transform:skewX(var(--fm-from))}to{transform:skewX(var(--fm-to))}}',
  '@keyframes fm-sweep{0%{transform:translateX(0)}55%,100%{transform:translateX(var(--fm-dx))}}',
  '.fm{animation-iteration-count:infinite;animation-fill-mode:both;will-change:transform,opacity;pointer-events:none}',
  '.fm>svg{display:block}',
  '[data-frame-paused] .fm,:root[data-app-hidden] .fm{animation-play-state:paused}',
  '@media (prefers-reduced-motion: reduce){.fm{animation:none!important;will-change:auto}[data-frame-sweep]{display:none}}',
].join('');

// ── Les dégradés ────────────────────────────────────────────────────────

/** Un dégradé linéaire en fractions de la boîte du chemin qui le porte (unités par défaut de SVG). */
export const linearGradientMarkup = (id: string, gradient: FrameGradient, palette: readonly string[]): string => {
  const stops = gradient.stops
    .map((stop) => `<stop offset="${num(stop.at)}" stop-color="${palette[stop.color] ?? '#000000'}"${stop.opacity === undefined ? '' : ` stop-opacity="${num(stop.opacity)}"`}/>`)
    .join('');
  return `<linearGradient id="${id}" x1="${num(gradient.x1)}" y1="${num(gradient.y1)}" x2="${num(gradient.x2)}" y2="${num(gradient.y2)}">${stops}</linearGradient>`;
};

/** L'identifiant d'un rendu, sans caractère qui casserait un `url(#…)`. */
export const scopeId = (...parts: readonly (string | number)[]): string => parts.map((part) => (typeof part === 'number' ? num(part) : part)).join('-').replace(/[^A-Za-z0-9-]/g, '_');
