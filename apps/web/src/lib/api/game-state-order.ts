import { replaceEqualDeep } from '@tanstack/react-query';
import { shouldApplyGameState } from '@meeshy/shared/types/game-sync-order';

/**
 * L'ÉTAT DU JEU NE RECULE JAMAIS (#10898, #10900). Trois sources écrivent la progression en cache — la lecture
 * `GET /me/engagement`, la réponse de frappe et l'événement `game:updated` — et arrivent dans n'importe quel ordre.
 * Chacune porte `gameRevision` (millisecondes serveur) ; une écriture strictement plus ancienne que celle déjà en cache
 * est ignorée (`shouldApplyGameState`, la loi partagée — miroir Swift : `GameReadOrder.isCurrent`). Une source sans
 * révision (passerelle antérieure) s'applique comme hier.
 *
 * Posée comme `structuralSharing` de la clé : TOUTE écriture du cache y passe — résultat de requête, `setQueryData`
 * optimiste ou de restauration, et l'hydratation n'en a pas besoin (elle précède toute lecture).
 */
export const ENGAGEMENT_PROGRESS_QUERY_KEY = ['me', 'engagement'] as const;

const revisionOf = (value: unknown): number | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const revision: unknown = Reflect.get(value, 'gameRevision');
  return typeof revision === 'number' && Number.isFinite(revision) ? revision : undefined;
};

export function keepNewerGameState(previous: unknown, next: unknown): unknown {
  if (previous === undefined) return next;
  return shouldApplyGameState(revisionOf(next), revisionOf(previous)) ? replaceEqualDeep(previous, next) : previous;
}

/** La révision servie, lue sans croire la charge sur parole — `undefined` quand elle manque ou est illisible. */
export const servedGameRevision = (payload: unknown): number | undefined => revisionOf(payload);
