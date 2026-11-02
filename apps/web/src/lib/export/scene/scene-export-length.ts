/**
 * **LA LONGUEUR QU'« IMAGER » REND** (#13873, décision porteur du 2026-10-31).
 *
 * « Enregistrer » et « Partager » rendent TOUJOURS la composition entière. Seule
 * « Imager » propose, au-delà d'une minute, de n'en rendre qu'une partie : 1/4,
 * 2/4, 3/4 ou 4/4 — la LONGUEUR rendue depuis le DÉBUT (1/4 = le premier quart,
 * 4/4 = tout). Sous la minute, aucun choix n'est montré.
 */

export const IMAGER_LENGTH_THRESHOLD_MS = 60_000;

export const IMAGER_QUARTERS = [1, 2, 3, 4] as const;

export type ImagerQuarter = (typeof IMAGER_QUARTERS)[number];

export type ImagerLengthChoice = { readonly quarter: ImagerQuarter; readonly durationMs: number };

const usable = (ms: number): number => (Number.isFinite(ms) && ms > 0 ? ms : 0);

export function imagerLengthChoices(totalMs: number): readonly ImagerLengthChoice[] {
  const total = usable(totalMs);
  if (total <= IMAGER_LENGTH_THRESHOLD_MS) return [];
  return IMAGER_QUARTERS.map((quarter) => ({ quarter, durationMs: Math.round((total * quarter) / 4) }));
}

export function renderedLengthMs(params: { readonly totalMs: number; readonly quarter: ImagerQuarter | null }): number {
  const total = usable(params.totalMs);
  if (params.quarter === null || total <= IMAGER_LENGTH_THRESHOLD_MS) return total;
  return Math.round((total * params.quarter) / 4);
}
