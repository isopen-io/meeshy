import { impact } from '@/lib/view/haptics';

/**
 * K26 · MeeshyMotion — LA TABLE DES SEPT MOUVEMENTS (#18874, planche du profil).
 *
 * Ce n'est pas un composant qu'on voit : c'est la table que tous les autres
 * appellent. Sept jetons nommés, les mêmes sur iOS, Android et le web ; chacun
 * donne sa nature, sa durée, sa courbe et son retour haptique, et porte sa
 * version réduite (un fondu de 160 ms, ou l'arrêt pour une boucle).
 *
 * DES VALEURS SEULES : pas de vue, pas d'horloge, pas de singleton. Les
 * variables `--motion-*` de `styles/kit-motion.css` sont écrites depuis ces
 * mêmes nombres (`meeshy-motion.test.ts` les compare) : une valeur change ici,
 * et là, en une seule PR.
 *
 * LES QUATRE LOIS. Mouvement réduit donc fondu ; rien au-delà de 600 ms hors
 * boucle ; seulement `transform` et `opacity` ; un mouvement explique d'où vient
 * la chose.
 */
export const MEESHY_MOTION_TOKENS = ['morph', 'travel', 'flip', 'collapse', 'rise', 'float', 'pulse'] as const;

export type MeeshyMotionToken = (typeof MEESHY_MOTION_TOKENS)[number];
export type MeeshyMotionHaptic = 'light' | 'medium' | 'rigid' | 'none';
export type MeeshyMotionNature = 'spring' | 'timed' | 'driven' | 'loop';
export type MeeshyMotionHapticAt = 'touch' | 'landing' | 'midpoint' | 'lock' | 'never';
export type MeeshyMotionNamedName = 'reveal' | 'shimmer' | 'celebrate';

export type MeeshyMotionRange = { readonly from: number; readonly to: number };

export type MeeshyMotionRecipe = {
  readonly token: MeeshyMotionToken;
  readonly nature: MeeshyMotionNature;
  readonly durationMs: number;
  readonly response: number | null;
  readonly damping: number | null;
  readonly delayStepMs: number;
  readonly easing: string;
  readonly haptic: MeeshyMotionHaptic;
  readonly hapticAt: MeeshyMotionHapticAt;
  readonly range: MeeshyMotionRange | null;
  readonly isStopped: boolean;
};

export const MEESHY_MOTION_REDUCED_MS = 160;
export const MEESHY_MOTION_CASCADE_STEP_MS = 80;
export const MEESHY_MOTION_CASCADE_RANKS = 3;
export const MEESHY_MOTION_COLLAPSE_RANGE: MeeshyMotionRange = { from: 0, to: 220 };
export const MEESHY_MOTION_CURVE_POINTS = 13;
export const MEESHY_MOTION_REBOUND = { scales: [0.92, 1.06, 1], durationMs: 180 } as const;

const CURVE: Readonly<Record<'flip' | 'rise' | 'collapse' | 'float' | 'pulse' | 'reduced', string>> = {
  flip: 'cubic-bezier(.2, 0, 0, 1)',
  rise: 'cubic-bezier(.2, .9, .25, 1)',
  collapse: 'linear',
  float: 'ease-in-out',
  pulse: 'ease-out',
  reduced: 'ease-out',
};

type Row = Omit<MeeshyMotionRecipe, 'token' | 'isStopped' | 'easing'> & { readonly easing: string | null };

const row = (input: Partial<Row> & Pick<Row, 'nature' | 'durationMs' | 'haptic' | 'hapticAt'>): Row => ({
  response: null,
  damping: null,
  delayStepMs: 0,
  range: null,
  easing: null,
  ...input,
});

const TABLE: Readonly<Record<MeeshyMotionToken, Row>> = {
  morph: row({ nature: 'spring', durationMs: 420, response: 0.42, damping: 0.7, haptic: 'light', hapticAt: 'touch' }),
  travel: row({ nature: 'spring', durationMs: 560, response: 0.56, damping: 0.82, haptic: 'medium', hapticAt: 'landing' }),
  flip: row({ nature: 'spring', durationMs: 500, response: 0.5, damping: 0.86, easing: CURVE.flip, haptic: 'rigid', hapticAt: 'midpoint' }),
  collapse: row({ nature: 'driven', durationMs: 0, range: MEESHY_MOTION_COLLAPSE_RANGE, easing: CURVE.collapse, haptic: 'light', hapticAt: 'lock' }),
  rise: row({ nature: 'spring', durationMs: 360, response: 0.36, damping: 0.86, delayStepMs: MEESHY_MOTION_CASCADE_STEP_MS, easing: CURVE.rise, haptic: 'none', hapticAt: 'never' }),
  float: row({ nature: 'loop', durationMs: 9000, easing: CURVE.float, haptic: 'none', hapticAt: 'never' }),
  pulse: row({ nature: 'loop', durationMs: 2200, easing: CURVE.pulse, haptic: 'none', hapticAt: 'never' }),
};

const springPoint = (response: number, damping: number, seconds: number): number => {
  const omega = (2 * Math.PI) / response;
  const damped = omega * Math.sqrt(1 - damping * damping);
  const decay = Math.exp(-damping * omega * seconds);
  return 1 - decay * (Math.cos(damped * seconds) + ((damping * omega) / damped) * Math.sin(damped * seconds));
};

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/**
 * Le ressort échantillonné en treize points pour `linear()` : l'image 0 vaut 0
 * et la dernière vaut 1 (le ressort s'y est posé à 1 % près). Un jeton qui n'est
 * pas un ressort rend une liste vide.
 */
export const meeshyMotionSpringCurve = (token: MeeshyMotionToken): readonly number[] => {
  const { response, damping, durationMs } = TABLE[token];
  if (response === null || damping === null) return [];
  const last = MEESHY_MOTION_CURVE_POINTS - 1;
  return Array.from({ length: MEESHY_MOTION_CURVE_POINTS }, (_, index) =>
    index === 0 ? 0 : index === last ? 1 : round3(springPoint(response, damping, ((durationMs / 1000) * index) / last)),
  );
};

const easingOf = (token: MeeshyMotionToken): string => {
  const given = TABLE[token].easing;
  if (given !== null) return given;
  return `linear(${meeshyMotionSpringCurve(token).join(', ')})`;
};

/** La raideur Android se déduit de la réponse iOS : (2π / réponse)². */
export const meeshyMotionStiffness = (response: number): number => (2 * Math.PI) ** 2 / (response * response);

const finite = (value: number): number => (Number.isFinite(value) ? value : 0);

/** Le décalage d'une cascade : 80 ms par rang, borné à trois, jamais négatif. */
export const meeshyMotionDelay = (index: number): number => {
  const rank = Math.min(Math.max(Math.trunc(finite(index)), 0), MEESHY_MOTION_CASCADE_RANKS);
  return rank * MEESHY_MOTION_CASCADE_STEP_MS;
};

/** Là où une cascade de `count` blocs est posée : jamais au-delà de 600 ms. */
export const meeshyMotionCascadeEnd = (count: number): number => meeshyMotionDelay(count - 1) + TABLE.rise.durationMs;

/** L'avancement d'un mouvement piloté par le défilement : de 0 à 1, borné aux deux bouts. */
export const meeshyMotionProgress = (offset: number, range: MeeshyMotionRange = MEESHY_MOTION_COLLAPSE_RANGE): number => {
  const span = range.to - range.from;
  if (!(span > 0)) return 0;
  return Math.min(Math.max((finite(offset) - range.from) / span, 0), 1);
};

const resolved = (token: MeeshyMotionToken): MeeshyMotionRecipe => {
  const { easing: _easing, ...values } = TABLE[token];
  return { token, ...values, easing: easingOf(token), isStopped: false };
};

const reducedOf = (recipe: MeeshyMotionRecipe): MeeshyMotionRecipe =>
  recipe.nature === 'loop'
    ? { ...recipe, durationMs: 0, easing: CURVE.reduced, isStopped: true }
    : { ...recipe, nature: 'timed', durationMs: MEESHY_MOTION_REDUCED_MS, response: null, damping: null, delayStepMs: 0, easing: CURVE.reduced, range: null };

/** La recette d'un jeton, en valeurs ; `reduce` vient de l'hôte, la recette ne lit aucun réglage. */
export const meeshyMotionRecipe = (token: MeeshyMotionToken, reduce = false): MeeshyMotionRecipe => (reduce ? reducedOf(resolved(token)) : resolved(token));

export const meeshyMotion: Readonly<Record<MeeshyMotionToken, MeeshyMotionRecipe>> = Object.fromEntries(MEESHY_MOTION_TOKENS.map((token) => [token, resolved(token)])) as Record<
  MeeshyMotionToken,
  MeeshyMotionRecipe
>;

const NAMED: Readonly<Record<MeeshyMotionNamedName, { readonly base: MeeshyMotionToken; readonly reduced: 'swap' | 'stop' }>> = {
  reveal: { base: 'rise', reduced: 'swap' },
  shimmer: { base: 'pulse', reduced: 'stop' },
  celebrate: { base: 'morph', reduced: 'stop' },
};

/**
 * Trois recettes nommées, qui composent les sept jetons sans en ajouter : le
 * squelette cède au contenu (échange sec en réduit), le reflet du squelette (aplat
 * fixe), une réussite (repli fixe, sans particule).
 */
export const meeshyMotionNamed = (name: MeeshyMotionNamedName, reduce = false): MeeshyMotionRecipe => {
  const { base, reduced } = NAMED[name];
  const recipe = { ...resolved(base), delayStepMs: 0 };
  if (!reduce) return recipe;
  return reduced === 'swap' ? { ...reducedOf(recipe), durationMs: 0 } : { ...reducedOf(recipe), durationMs: 0, isStopped: true };
};

/** Joue le retour d'un jeton, une fois ; `none` laisse l'hôte jouer le sien. */
export const meeshyMotionPlay = (haptic: MeeshyMotionHaptic): boolean => (haptic === 'none' ? false : impact(haptic));
