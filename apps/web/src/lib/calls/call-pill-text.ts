import type { CallScreenLayer } from './call-screen-layer';

/**
 * **CE QUE LA PILULE PORTE DE TEXTE** (#17343, #17479) — miroir de `CallPillText`
 * d'iOS. Les sous-titres et le journal vivent DANS le verre de la pilule, au-dessus
 * de sa rangée de base, en duo comme en groupe ; le journal s'ouvre à la place des
 * sous-titres ; `(…)` les range tous deux et refermer les actions les rend ; un
 * toucher qui range la pilule laisse les sous-titres dans un verre sans rangée de
 * base (loi 11 de `docs/product/appels-vue-finale.md`).
 *
 * - `none` : rien au-dessus de la rangée de base ;
 * - `captions` : les deux dernières lignes, dans le verre de la pilule ;
 * - `journal` : tout l'appel, à la place des sous-titres ;
 * - `captionsAlone` : la pilule est rangée (G1.3, #17536) : UN SEUL verre, le sien,
 *   reste à l'écran, privé de sa rangée de base, et se resserre autour des
 *   sous-titres. Quand un mode a pris l'écran, la pilule n'existe pas : ils
 *   portent alors le verre des sous-titres seuls.
 */
export type CallPillText = 'none' | 'captions' | 'journal' | 'captionsAlone';

/** Les sous-titres sont dans le verre : au repos, ou seuls quand la pilule est rangée (`CallPillText.showsCaptionsBand`, iOS). */
export const pillShowsCaptionsBand = (text: CallPillText): boolean => text === 'captions' || text === 'captionsAlone';

/** Rangée, la pilule ne s'efface pas : son verre reste, et se resserre autour des sous-titres (`staysWhenChromeStowed`, iOS). */
export const pillStaysWhenChromeStowed = (text: CallPillText): boolean => text === 'captionsAlone';

/** Le journal ouvert dans la pilule prend une part de la fenêtre : en audio, l'avatar se réduit en en-tête compact pour lui laisser la place (#17529, `compactsAudioLayout`, iOS). */
export const pillCompactsAudioStage = (text: CallPillText): boolean => text === 'journal';

/** La rangée de base (`(…)` · Micro · Sortie · Fin) est dans le verre : jamais pour les sous-titres seuls (`hasBaseRow`, iOS). */
export const pillHasBaseRow = (text: CallPillText): boolean => text !== 'captionsAlone';

export type CallPillTextInput = {
  /** Le réglage Sous-titres : le journal, lui, garde tout l'appel sous-titres allumés ou non (#17342). */
  readonly captionsOn: boolean;
  readonly layer: CallScreenLayer;
  /** Les commandes sont visibles : un toucher sur la scène les a rangées, ou non. */
  readonly chromeShown: boolean;
};

export function callPillText({ captionsOn, layer, chromeShown }: CallPillTextInput): CallPillText {
  const alone: CallPillText = captionsOn ? 'captionsAlone' : 'none';
  if (layer.kind === 'mode' || !chromeShown) return alone;
  if (layer.kind === 'panel' && layer.panel === 'journal') return 'journal';
  return captionsOn && layer.kind === 'idle' ? 'captions' : 'none';
}

/** UNE largeur pour le verre qui porte du texte et pour les sous-titres rangés : l'œil ne balaie pas tout l'écran, quelle que soit la fenêtre (P3.10). */
export const PILL_TEXT_MAX_WIDTH = 560;

/**
 * UNE borne pour toute pilule, duo comme groupe (#17935) : celle qui a grandi (les deux
 * rangées d'un groupe, un panneau) prend la largeur de celle qui porte du texte ; seule la
 * pilule au repos sans texte épouse sa rangée de base. Ouvrir (…) sur les sous-titres d'un
 * groupe ne change donc que la hauteur du verre. Vecteurs de `CallPillWidth` (iOS, Android).
 */
export const pillTakesBound = (text: CallPillText, grown: boolean): boolean => grown || text !== 'none';

/** La largeur du verre borné : toute la place moins une gouttière, jamais plus de 560 px (`PILL_TEXT_MAX_WIDTH`, écrit en toutes lettres : Tailwind lit les classes dans le source). */
export const PILL_TEXT_WIDTH_CLASS = 'w-[min(calc(100%-1.5rem),560px)]';
