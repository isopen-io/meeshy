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
 * - `captionsAlone` : la pilule est rangée (ou un mode a pris l'écran) : les
 *   sous-titres restent dans un verre à eux, à la place qu'elle occupait.
 */
export type CallPillText = 'none' | 'captions' | 'journal' | 'captionsAlone';

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

/** La largeur du verre qui porte du texte : toute la place moins une gouttière, jamais plus de 560 px (`PILL_TEXT_MAX_WIDTH`, écrit en toutes lettres : Tailwind lit les classes dans le source). */
export const PILL_TEXT_WIDTH_CLASS = 'w-[min(calc(100%-1.5rem),560px)]';

export const JOURNAL_HEIGHT_SHARE = 0.45;

export const JOURNAL_HEIGHT_MIN = 160;

export const JOURNAL_HEIGHT_MAX = 440;

/** La hauteur du journal dans la pilule : une part de la fenêtre, jamais sous un plancher lisible ni au-dessus d'un plafond (la grille de groupe garde sa place). */
export function callJournalHeight(windowHeight: number): number {
  return Math.min(Math.max(windowHeight * JOURNAL_HEIGHT_SHARE, JOURNAL_HEIGHT_MIN), JOURNAL_HEIGHT_MAX);
}

export type FooterLine = { readonly languages: string | null; readonly event: boolean };

/** Le pied des sous-titres : la paire de langues de la dernière phrase TRADUITE, qui dit comment voir l'original. Une capture n'est pas une parole. */
export function callCaptionsFooter(lines: readonly FooterLine[]): string | null {
  return lines.findLast((line) => !line.event && line.languages !== null)?.languages ?? null;
}
