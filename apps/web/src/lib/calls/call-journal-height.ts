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
