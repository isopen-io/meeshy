import type { GloryDivision, GloryDivision5, GloryRankOrMythic, MythicSeatRef } from '@meeshy/shared/utils/game/glory';

/**
 * LE RANG SERVI (#9636) — ce que les écrans lisent du bloc `glory` (ou du
 * `standing` d'un autre) pour le DIRE et le DESSINER. Sans la géométrie du
 * blason (`ranks.ts`) : le bandeau, le guide et les transitions le lisent sans
 * en payer le poids.
 */

/**
 * La division que le serveur sert : `division5` (V = 5 … I = 1) quand il la
 * porte, sinon la division héritée (III, II, I) d'un serveur d'avant #9636.
 */
export const servedDivision = (glory: { readonly division: GloryDivision | null; readonly division5?: GloryDivision5 | null | undefined }): GloryDivision5 | null =>
  glory.division5 ?? glory.division;

/** Le rang tel que le serveur le sert (bloc `glory` ou `standing` d'un autre). */
export type ServedRank = {
  readonly rank: GloryRankOrMythic;
  readonly division: GloryDivision | null;
  readonly division5?: GloryDivision5 | null | undefined;
  readonly mythic?: MythicSeatRef | null | undefined;
};

/** Le rang à MONTRER : la division V..I (ou héritée), la place du Mythe quand elle est servie. */
export type ShownRank = { readonly rank: GloryRankOrMythic; readonly division: GloryDivision5 | null; readonly mythic: MythicSeatRef | null };

export const shownRank = (served: ServedRank): ShownRank => ({
  rank: served.rank,
  division: servedDivision(served),
  mythic: served.rank === 'mythe' ? (served.mythic ?? null) : null,
});
