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
 * d'iOS ; l'ancre est `transform-origin`, dans `call-motion.css`) ; `fade` : la capsule de la une
 * repart sur place, en fondu (U1.12) ; `bottom` et `end` : le bandeau des autres repart par le bord
 * du bas, ou — en colonne — par le bord de FIN de l'écran (U2.10), et revient par le même chemin ; `top` : le bandeau « Vous partagez » repart par le bord du haut, comme l'en-tête (P16.6).
 */
export type SwapShape = 'rise' | 'scale' | 'fade' | 'bottom' | 'end' | 'top';

const SCALE_FROM = 0.8;

const SWAP_SHAPES: Readonly<Record<SwapShape, { readonly shown: string; readonly hidden: string }>> = {
  rise: { shown: 'translateY(0)', hidden: `translateY(${SWAP_RISE_PX}px)` },
  scale: { shown: 'scale(1)', hidden: `scale(${SCALE_FROM})` },
  fade: { shown: 'none', hidden: 'none' },
  bottom: { shown: 'translateY(0)', hidden: 'translateY(100%)' },
  end: { shown: 'translateX(0)', hidden: 'translateX(100%)' },
  top: { shown: 'translateY(0)', hidden: 'translateY(-100%)' },
};

/** `rtl` : le bord de FIN est à gauche. */
export function swapKeyframes(entering: boolean, reducedMotion: boolean, shape: SwapShape = 'rise', rtl = false): readonly Keyframe[] {
  const { shown: at, hidden } = SWAP_SHAPES[shape];
  const away = rtl && shape === 'end' ? 'translateX(-100%)' : hidden;
  const shown: Keyframe = reducedMotion ? { opacity: 1 } : { opacity: 1, transform: at };
  const gone: Keyframe = reducedMotion ? { opacity: 0 } : { opacity: 0, transform: away };
  return entering ? [gone, shown] : [shown, gone];
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

/**
 * **L'ÉCRAN D'APPEL ET LA CAPSULE S'ÉCHANGENT EN MOUVEMENT** (S1.7, S2.1, #17774 ; `CallShareCapsuleMotion`
 * d'iOS #17765, `CallCapsuleTransitions` d'Android #17772) — lancer le partage contracte l'écran vers la capsule, la
 * toucher le redéploie : l'un repart (180 ms) pendant que l'autre arrive (220 ms), par un fondu et une échelle de
 * 0,92 à 1, la transformation et l'opacité seules. « Réduire les animations » ne garde que le fondu, 120 ms. La
 * capsule qui devient pastille ordinaire (ou l'inverse) quand le partage finit ou commence prend le même mouvement.
 */
export const VIEW_IN_MS = 220;
export const VIEW_OUT_MS = 180;
export const VIEW_REDUCED_MS = 120;
const VIEW_SCALE_FROM = 0.92;

export const viewSwapMs = (entering: boolean, reducedMotion: boolean): number => (reducedMotion ? VIEW_REDUCED_MS : entering ? VIEW_IN_MS : VIEW_OUT_MS);

/** `seen` : la transformation sous laquelle la vue qui repart se voit (l'écran que le glissé vers le bas a laissé sous le doigt) — elle s'y contracte, sans revenir d'abord à sa place. */
export function viewSwapKeyframes(entering: boolean, reducedMotion: boolean, seen = 'none'): readonly Keyframe[] {
  if (reducedMotion) return entering ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }];
  const scaled = `scale(${VIEW_SCALE_FROM})`;
  if (entering) return [{ opacity: 0, transform: scaled }, { opacity: 1, transform: 'none' }];
  return seen === 'none' ? [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: scaled }] : [{ opacity: 1, transform: seen }, { opacity: 0, transform: `${seen} ${scaled}` }];
}

/**
 * **LA PILE DES BANDEAUX SE REFERME EN MOUVEMENT** (S2.6, #17774) — un bandeau qui change de place parce qu'un
 * autre arrive ou repart repart de sa place d'avant, vue comme une translation (FLIP), et rejoint la sienne : la
 * mise en page passe d'un coup à son état final, seule la transformation bouge. Sous « Réduire les animations »,
 * un fondu court au lieu du déplacement.
 */
export function bannerCloseKeyframes(delta: number, reducedMotion: boolean): readonly Keyframe[] | null {
  if (Math.abs(delta) < EPSILON_PX) return null;
  return reducedMotion ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: `translateY(${delta}px)` }, { transform: 'none' }];
}
