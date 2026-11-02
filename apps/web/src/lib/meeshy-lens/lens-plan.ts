import type { Lens, LensLayer } from '@meeshy/shared/types/lens-format';

import type { Box } from '@/lib/calls/face-effects';

import { anchorPointOf, anchorScaleOf, type FrameSize, type LensAnchor } from './face-anchor';

/**
 * **CE QU'UNE LENS PEINT SUR UNE IMAGE** (W14, #11320) — PUR. Une lens lue
 * (`parseLens`, contrat MeeshyLens v1) devient, pour une image, une liste
 * ORDONNÉE d'opérations de dessin : la LUT d'abord (toute l'image), puis le
 * cadre, puis chaque sticker, texte et nuée de particules dans l'ordre de ses
 * couches. Rien ici ne touche un canevas : le peintre (`lens-paint.ts`) trace
 * ce que ce plan rend, et les goldens figent le plan.
 *
 * - **Ancrage** : une couche ancrée au visage suit la boîte du visage
 *   (`face-anchor.ts`) ; sa taille est en largeurs de visage. Ancrée à l'écran,
 *   sa taille est en petits côtés de l'image.
 * - **Prisme** : le texte d'une couche se lit dans la première langue du
 *   lecteur qu'elle porte, sinon en français (la langue obligatoire du contrat).
 * - **Dégradation** : `reduced` masque les couches que la lens nomme dans
 *   `fallbacks.reduced` et divise les particules par deux ; `minimal` masque
 *   aussi `fallbacks.minimal` et retire toute particule.
 * - **Temps** : les particules sont DÉTERMINISTES — la même image au même
 *   instant donne le même dessin.
 */
export type LensLevel = 'full' | 'reduced' | 'minimal';

export type LensDot = { readonly x: number; readonly y: number; readonly r: number; readonly alpha: number };

type ParticlesLayer = Extract<LensLayer, { readonly kind: 'particles' }>;

export type LensParticlePreset = ParticlesLayer['preset'];

export type LensDrawOp =
  | { readonly kind: 'lut'; readonly id: string; readonly asset: string; readonly intensity: number }
  | { readonly kind: 'frame'; readonly id: string; readonly motif: string; readonly opacity: number }
  | { readonly kind: 'sticker'; readonly id: string; readonly asset: string; readonly x: number; readonly y: number; readonly size: number; readonly rotation: number }
  | { readonly kind: 'text'; readonly id: string; readonly text: string; readonly language: string; readonly font: string; readonly color: string; readonly x: number; readonly y: number }
  | { readonly kind: 'particles'; readonly id: string; readonly preset: LensParticlePreset; readonly dots: readonly LensDot[] };

export type LensPlanInput = {
  readonly lens: Lens;
  readonly frame: FrameSize;
  readonly face: Box;
  /** Les langues du lecteur, dans l'ordre du Prisme. */
  readonly languages: readonly string[];
  readonly level: LensLevel;
  /** L'instant de l'image, en millisecondes. */
  readonly t: number;
};

const PARTICLE_COUNT: Readonly<Record<ParticlesLayer['density'], number>> = { low: 12, mid: 24, high: 40 };

const FALLING: ReadonlySet<LensParticlePreset> = new Set(['snow', 'petals', 'confetti']);

const PARTICLE_PERIOD_MS = 4000;
const GOLDEN = 0.6180339887;
const PLASTIC = 0.7548776662;
const DOT_RADIUS = 0.012;
const ANCHORED_FIELD = 1.2;

const fract = (value: number): number => value - Math.floor(value);

const round = (value: number): number => Math.round(value * 100) / 100;

const hiddenAt = (lens: Lens, level: LensLevel): ReadonlySet<string> => {
  if (level === 'full') return new Set();
  const reduced = lens.fallbacks?.reduced?.hide ?? [];
  const minimal = level === 'minimal' ? (lens.fallbacks?.minimal?.hide ?? []) : [];
  return new Set([...reduced, ...minimal]);
};

const particleCount = (density: ParticlesLayer['density'], level: LensLevel): number =>
  level === 'minimal' ? 0 : level === 'reduced' ? Math.ceil(PARTICLE_COUNT[density] / 2) : PARTICLE_COUNT[density];

/**
 * Une couche JOUÉE à ce palier s'ancre-t-elle au VISAGE ? Sinon la lens se joue
 * sans chercher de visage (W15, #11321) — une couche que le palier masque, ou
 * une nuée que `minimal` retire, ne réveille pas le modèle à 478 points.
 */
export function lensUsesFace(lens: Lens, level: LensLevel = 'full'): boolean {
  const hidden = hiddenAt(lens, level);
  return lens.layers.some(
    (layer) => !hidden.has(layer.id) && 'anchor' in layer && layer.anchor?.type === 'face' && (layer.kind !== 'particles' || particleCount(layer.density, level) > 0),
  );
}

type Field = { readonly left: number; readonly top: number; readonly width: number; readonly height: number; readonly scale: number };

const fieldOf = (anchor: LensAnchor | undefined, frame: FrameSize, face: Box): Field => {
  if (anchor === undefined) return { left: 0, top: 0, width: frame.width, height: frame.height, scale: Math.min(frame.width, frame.height) };
  const at = anchorPointOf(anchor, frame, face);
  const scale = anchorScaleOf(anchor, frame, face);
  const side = scale * ANCHORED_FIELD;
  return { left: at.x - side / 2, top: at.y - side / 2, width: side, height: side, scale };
};

export function particleDots(input: { readonly preset: LensParticlePreset; readonly count: number; readonly field: Field; readonly t: number }): readonly LensDot[] {
  const { preset, count, field, t } = input;
  const falling = FALLING.has(preset);
  return Array.from({ length: count }, (_, index) => {
    const u = fract((index + 1) * GOLDEN);
    const phase = fract((index + 1) * PLASTIC + t / PARTICLE_PERIOD_MS);
    const y = falling ? field.top + phase * field.height : field.top + (1 - phase) * field.height;
    return {
      x: round(field.left + u * field.width),
      y: round(y),
      r: round(field.scale * DOT_RADIUS * (0.6 + 0.8 * u)),
      alpha: round(Math.sin(phase * Math.PI)),
    };
  });
}

const servedText = (text: Extract<LensLayer, { readonly kind: 'text' }>['text'], languages: readonly string[]): { readonly text: string; readonly language: string } => {
  const entries: Readonly<Record<string, string | undefined>> = text;
  const language = languages.find((candidate) => entries[candidate] !== undefined) ?? 'fr';
  return { text: entries[language] ?? text.fr, language };
};

const DEGREES = Math.PI / 180;

function opOf(layer: LensLayer, input: LensPlanInput): LensDrawOp | null {
  const { frame, face } = input;
  switch (layer.kind) {
    case 'lut':
      return { kind: 'lut', id: layer.id, asset: layer.asset, intensity: layer.intensity ?? 1 };
    case 'frame':
      return { kind: 'frame', id: layer.id, motif: layer.motif, opacity: layer.opacity ?? 1 };
    case 'sticker': {
      const at = anchorPointOf(layer.anchor, frame, face);
      const size = round(layer.size * anchorScaleOf(layer.anchor, frame, face));
      return { kind: 'sticker', id: layer.id, asset: layer.asset, x: round(at.x), y: round(at.y), size, rotation: (layer.rotation ?? 0) * DEGREES };
    }
    case 'text': {
      const at = anchorPointOf(layer.anchor, frame, face);
      const served = servedText(layer.text, input.languages);
      const px = Math.max(1, Math.round(layer.size * frame.height));
      return { kind: 'text', id: layer.id, ...served, font: `${px}px "${layer.font}"`, color: layer.color, x: round(at.x), y: round(at.y) };
    }
    case 'particles': {
      const count = particleCount(layer.density, input.level);
      if (count === 0) return null;
      return { kind: 'particles', id: layer.id, preset: layer.preset, dots: particleDots({ preset: layer.preset, count, field: fieldOf(layer.anchor, frame, face), t: input.t }) };
    }
  }
}

/** La couche LUT que la lens joue à ce palier — la première, comme le plan la place en tête — ou `null`. */
export function lensLutOf(lens: Lens, level: LensLevel): Extract<LensDrawOp, { readonly kind: 'lut' }> | null {
  const hidden = hiddenAt(lens, level);
  const layer = lens.layers.find((candidate): candidate is Extract<LensLayer, { readonly kind: 'lut' }> => candidate.kind === 'lut' && !hidden.has(candidate.id));
  return layer === undefined ? null : { kind: 'lut', id: layer.id, asset: layer.asset, intensity: layer.intensity ?? 1 };
}

const LUT_FIRST = (a: LensDrawOp, b: LensDrawOp): number => Number(b.kind === 'lut') - Number(a.kind === 'lut');

export function planLens(input: LensPlanInput): readonly LensDrawOp[] {
  const hidden = hiddenAt(input.lens, input.level);
  return input.lens.layers
    .filter((layer) => !hidden.has(layer.id))
    .flatMap((layer) => {
      const op = opOf(layer, input);
      return op === null ? [] : [op];
    })
    .sort(LUT_FIRST);
}
