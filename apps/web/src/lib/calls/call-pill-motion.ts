/**
 * **RIEN N'APPARAÎT NI NE DISPARAÎT D'UN COUP** (#17406, #17536 ; `CallChromeStow`
 * et `unfoldTransition` d'iOS, #17534) — les lois du mouvement du verre de la pilule.
 * Elles ne parlent que de transformation et d'opacité : le compositeur seul les porte,
 * la mise en page passe d'un coup à son état final (`check-animated-properties.mjs`).
 *
 * - le MORPHISME : le verre qui grandit pour contenir une option, un panneau ou les
 *   rangées d'un groupe, puis reprend sa forme, part de son ancienne taille vue comme
 *   une échelle de la nouvelle (FLIP), et la rejoint ;
 * - le RANGEMENT : un seul verre, celui de la pilule, se resserre autour des sous-titres
 *   — il garde son bord du bas, les sous-titres descendent d'autant qu'il perd ;
 * - « Réduire les animations » remplace le déplacement par un fondu court.
 *
 * Pur : `use-pill-motion.ts` mesure et joue, ces lois décident ce qui se joue.
 */
export type GlassSize = { readonly width: number; readonly height: number };

/** La durée du morphisme du verre — celle du FLIP de ma vignette. */
export const MORPH_MS = 260;

/** Ranger ou rendre les commandes : la durée de l'ancien fondu. */
export const STOW_MS = 300;

/** Sous « Réduire les animations » : un fondu court, sans déplacement. */
export const STOW_REDUCED_MS = 150;

/** En deçà, l'écart est un arrondi de mesure, pas un mouvement. */
const EPSILON_PX = 0.5;

export function morphKeyframes(from: GlassSize, to: GlassSize, reducedMotion: boolean): readonly Keyframe[] | null {
  if (reducedMotion || from.width <= 0 || from.height <= 0 || to.width <= 0 || to.height <= 0) return null;
  if (Math.abs(from.width - to.width) < EPSILON_PX && Math.abs(from.height - to.height) < EPSILON_PX) return null;
  return [{ transform: `scale(${from.width / to.width}, ${from.height / to.height})` }];
}

/**
 * Ce qui est POSÉ sur un verre qui se déforme depuis son bord du bas (le panneau et la bande de
 * looks au-dessus de la barre d'un mode) suit son bord du haut : la mise en page l'a déjà posé à
 * sa place finale, il en repart de l'écart de hauteur (FLIP) et la rejoint avec le verre.
 */
export function followKeyframes(from: GlassSize, to: GlassSize, reducedMotion: boolean): readonly Keyframe[] | null {
  if (reducedMotion || from.height <= 0 || to.height <= 0 || Math.abs(from.height - to.height) < EPSILON_PX) return null;
  return [{ transform: `translateY(${to.height - from.height}px)` }];
}

type StowInput = {
  /** La hauteur du verre, déployé. */
  readonly height: number;
  /** Où commencent, et combien mesurent, les sous-titres que le verre garde. */
  readonly keptTop: number;
  readonly keptHeight: number;
  /** Le liseré intérieur du verre. */
  readonly padding: number;
};

/** L'échelle verticale du verre rangé (ancré à son bord du bas) et la descente des sous-titres. */
export function stowedGlass({ height, keptTop, keptHeight, padding }: StowInput): { readonly scale: number; readonly shift: number } | null {
  if (height <= 0 || keptHeight <= 0) return null;
  return { scale: Math.min(1, (keptHeight + 2 * padding) / height), shift: Math.max(0, height - padding - (keptTop + keptHeight)) };
}

/** Le fondu court : l'opacité seule, jamais un déplacement. */
export const stowFadeKeyframes = (stowing: boolean): readonly Keyframe[] =>
  stowing
    ? [
        { opacity: 1, visibility: 'visible' },
        { opacity: 0, visibility: 'hidden' },
      ]
    : [{ opacity: 0 }, { opacity: 1 }];

/**
 * RÉGLAGES DU MODE EFFETS (P8b.6, `CallEffectsSettingsMotion` d'iOS) — le panneau Luminosité ·
 * Flou du fond remplace la bande de looks : elle et ses puces repartent en fondu pendant que le
 * panneau monte depuis la barre, ≈ 200 ms, et il y redescend au retour. Sous « Réduire les
 * animations », un fondu court sans montée : l'écran ne change jamais d'un coup.
 */
export const SWAP_MS = 200;

/** De combien le panneau monte depuis la barre. */
const SWAP_RISE_PX = 20;

export const swapMs = (reducedMotion: boolean): number => (reducedMotion ? STOW_REDUCED_MS : SWAP_MS);

/**
 * LA FORME DU DÉPART ET DE L'ARRIVÉE — `rise` : le panneau monte depuis la barre ; `scale` : la
 * capsule de l'en-tête grandit depuis son bord de fin (P9.8, `.scale(scale: 0.8, anchor: .trailing)`
 * d'iOS ; l'ancre est `transform-origin`, dans `call-motion.css`).
 */
export type SwapShape = 'rise' | 'scale';

const SCALE_FROM = 0.8;

const SWAP_SHAPES: Readonly<Record<SwapShape, { readonly shown: string; readonly hidden: string }>> = {
  rise: { shown: 'translateY(0)', hidden: `translateY(${SWAP_RISE_PX}px)` },
  scale: { shown: 'scale(1)', hidden: `scale(${SCALE_FROM})` },
};

export function swapKeyframes(entering: boolean, reducedMotion: boolean, shape: SwapShape = 'rise'): readonly Keyframe[] {
  const { shown: at, hidden: away } = SWAP_SHAPES[shape];
  const shown: Keyframe = reducedMotion ? { opacity: 1 } : { opacity: 1, transform: at };
  const hidden: Keyframe = reducedMotion ? { opacity: 0 } : { opacity: 0, transform: away };
  return entering ? [hidden, shown] : [shown, hidden];
}

/**
 * L'AVATAR DU DUO AUDIO SE RÉDUIT VERS L'EN-TÊTE COMPACT (#17529, loi 6, P9b ; `CallCompactAudioHeader`
 * d'iOS) — quand le journal s'ouvre dans la pilule, la mise en page pose d'un coup l'avatar à 56 px en
 * haut, le nom et la durée à côté ; l'avatar en repart de sa place et de sa taille d'avant, vues comme
 * une translation de son centre et une échelle de la nouvelle (FLIP ; l'avatar est carré), et la
 * rejoint, pendant que le nom et la durée arrivent en fondu. Le chemin inverse au retour. Sous
 * « Réduire les animations », aucun déplacement : un fondu court.
 */
export const PORTRAIT_MORPH_MS = 200;

export type MorphRect = { readonly x: number; readonly y: number; readonly width: number };

/** L'avatar de la scène audio, celui que le morphisme déplace. */
export const STAGE_PORTRAIT = '[data-call-incoming-portrait]';

/** Le nom et la durée, qui rejoignent l'avatar en fondu. */
export const STAGE_LABEL = '[data-call-stage-label]';

export const portraitMorphMs = (reducedMotion: boolean): number => (reducedMotion ? STOW_REDUCED_MS : PORTRAIT_MORPH_MS);

export function portraitMorphKeyframes(first: MorphRect, last: MorphRect, reducedMotion: boolean): readonly Keyframe[] | null {
  if (reducedMotion || first.width <= 0 || last.width <= 0) return null;
  const dx = first.x + first.width / 2 - (last.x + last.width / 2);
  const dy = first.y + first.width / 2 - (last.y + last.width / 2);
  const scale = first.width / last.width;
  if (Math.abs(dx) < EPSILON_PX && Math.abs(dy) < EPSILON_PX && Math.abs(first.width - last.width) < EPSILON_PX) return null;
  return [{ transform: `translate(${dx}px, ${dy}px) scale(${scale})` }, { transform: 'none' }];
}
