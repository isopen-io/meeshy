/**
 * **LA HAUTEUR DU JOURNAL DANS LA PILULE** (#17343) — miroir de `CallJournalSizing`
 * d'iOS. Son module à lui : seul le chunk du journal l'importe, l'écran d'appel lui
 * remet la hauteur de la fenêtre (`budgets.json` › `call_overlay.dynamic_only`).
 */

export const JOURNAL_HEIGHT_SHARE = 0.45;

export const JOURNAL_HEIGHT_MIN = 160;

export const JOURNAL_HEIGHT_MAX = 440;

/** La hauteur du journal dans la pilule : une part de la fenêtre, jamais sous un plancher lisible ni au-dessus d'un plafond (la grille de groupe garde sa place). */
export function callJournalHeight(windowHeight: number): number {
  return Math.min(Math.max(windowHeight * JOURNAL_HEIGHT_SHARE, JOURNAL_HEIGHT_MIN), JOURNAL_HEIGHT_MAX);
}

/** Le plancher lisible quand la fenêtre est basse : une phrase, qui défile (`MINIMUM_LIST_DP`, Android) ; « Revenir au direct » reste. */
export const JOURNAL_COMPACT_FLOOR = 44;

/** La tête du journal (48) et l'écart qui la suit (6) : repliées dans le pied quand la fenêtre n'a pas la place d'une phrase (`plan.folded`). */
export const JOURNAL_HEAD = 54;

/**
 * Ce que le journal du duo audio laisse autour de lui (#18488 ; `reservedAround`, iOS), mesuré au navigateur : l'en-tête
 * de l'appel (44), l'avatar compact avec son anneau (`avatar` + 24), la pilule SANS sa liste (tête, pied « Journal »,
 * rangée de base, marges : 193) et les écarts de part et d'autre de la scène et sous la pilule — 8 + 8 + 8 quand la
 * hauteur est compacte (`tight`, l'écran les resserre), 16 + 16 + 24 sinon.
 */
export const journalAround = ({ avatar, tight }: { readonly avatar: number; readonly tight: boolean }): number => 44 + (avatar + 24) + 193 + (tight ? 24 : 56);

export type JournalStage = { readonly avatar: number; readonly tight: boolean };

/**
 * Le journal ne prend que ce qu'il reste dans la fenêtre : la pilule entière, (…) compris, y reste. Quand même une
 * phrase n'y tient pas, la tête « Journal · Traduit | Original » se replie dans le pied, à côté de « Journal » (`folded`) ;
 * seul le plancher lisible peut alors dépasser.
 */
export function journalPlan(windowHeight: number, stage: JournalStage): { readonly folded: boolean; readonly list: number } {
  const around = journalAround(stage);
  const folded = windowHeight - around < JOURNAL_COMPACT_FLOOR;
  return { folded, list: Math.max(JOURNAL_COMPACT_FLOOR, Math.min(callJournalHeight(windowHeight), windowHeight - around + (folded ? JOURNAL_HEAD : 0))) };
}
