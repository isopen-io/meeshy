/**
 * LES TÊTE-À-TÊTE D'UNE PAIRE DE PERSONNES (#12966, décision porteur du
 * 2026-10-25).
 *
 * Une conversation chiffrée de bout en bout ne repasse jamais en clair
 * (#12949) : pour échanger en clair avec la même personne, un SECOND
 * tête-à-tête existe à côté du chiffré. Une paire a donc au plus UN
 * tête-à-tête `e2ee` et au plus UN tête-à-tête que le serveur lit (sans mode,
 * `server` ou `hybrid` — `SERVER_READABLE_REGIME_FILTER`).
 *
 * - Sans précision (tout ancien client, « ouvrir la conversation avec X ») :
 *   le tête-à-tête le plus récemment actif, quel que soit son régime — le
 *   comportement d'avant, à l'identique.
 * - `plaintext: true` : le tête-à-tête lisible, ou rien (l'appelant le crée).
 *
 * Une paire, ce sont deux participations ACTIVES : un tête-à-tête que l'un a
 * quitté n'est plus celui de la paire.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isEndToEndMode, SERVER_READABLE_REGIME_FILTER } from './encryptionRegime';

export type DirectPair = { readonly userId: string; readonly peerId: string };

const bothActive = (pair: DirectPair): readonly Record<string, unknown>[] => [
  { participants: { some: { userId: pair.userId, isActive: true } } },
  { participants: { some: { userId: pair.peerId, isActive: true } } },
];

/** Le `where` de la recherche du tête-à-tête à rouvrir. */
export function directLookupWhere(pair: DirectPair, request: { readonly plaintext: boolean }): Record<string, unknown> {
  return {
    type: 'direct',
    AND: request.plaintext ? [...bothActive(pair), SERVER_READABLE_REGIME_FILTER] : [...bothActive(pair)],
  };
}

/** Les deux personnes d'un tête-à-tête, ou `null` s'il n'en reste pas deux actives. */
export function pairOfMembers(userIds: readonly (string | null | undefined)[]): DirectPair | null {
  const distinct = [...new Set(userIds.filter((id): id is string => typeof id === 'string' && id !== ''))];
  return distinct.length === 2 ? { userId: distinct[0]!, peerId: distinct[1]! } : null;
}

/**
 * L'AUTRE tête-à-tête de la paire déjà chiffré de bout en bout, ou `null`.
 * Le mode se juge comme partout (`isEndToEndMode`, casse comprise).
 */
export async function otherEndToEndDirectOf(
  prisma: Pick<PrismaClient, 'conversation'>,
  params: { readonly conversationId: string; readonly pair: DirectPair },
): Promise<string | null> {
  const others = await prisma.conversation.findMany({
    where: { type: 'direct', id: { not: params.conversationId }, AND: [...bothActive(params.pair)] },
    select: { id: true, encryptionMode: true },
  } as never) as ReadonlyArray<{ readonly id: string; readonly encryptionMode: string | null }>;
  return others.find((other) => isEndToEndMode(other.encryptionMode))?.id ?? null;
}
