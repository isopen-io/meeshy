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
 *   le tête-à-tête que le serveur ne lit pas (`e2ee`, ou un mode inconnu) s'il
 *   existe, sinon le plus récemment actif — le comportement d'avant tant
 *   qu'une paire n'a qu'un régime. Jamais une bascule silencieuse vers le
 *   clair : écrire dans le fil lisible n'y attire pas l'autre, et un ancien
 *   client qui ne distingue pas les deux fils retombe dans le chiffré.
 * - `plaintext: true` : le tête-à-tête lisible, ou rien (l'appelant le crée).
 *
 * Une paire, ce sont deux participations ACTIVES : un tête-à-tête que l'un a
 * quitté n'est plus celui de la paire.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isEndToEndMode, SERVER_BLIND_REGIME_FILTER, SERVER_READABLE_REGIME_FILTER } from './encryptionRegime';

export type DirectPair = { readonly userId: string; readonly peerId: string };

const bothActive = (pair: DirectPair): readonly Record<string, unknown>[] => [
  { participants: { some: { userId: pair.userId, isActive: true } } },
  { participants: { some: { userId: pair.peerId, isActive: true } } },
];

const lookup = (pair: DirectPair, regime: Readonly<Record<string, unknown>> | null): Record<string, unknown> => ({
  type: 'direct',
  AND: regime === null ? [...bothActive(pair)] : [...bothActive(pair), regime],
});

/** Les `where` à essayer DANS L'ORDRE pour trouver le tête-à-tête à rouvrir ; le premier trouvé gagne. */
export function directLookupWheres(pair: DirectPair, request: { readonly plaintext: boolean }): readonly Record<string, unknown>[] {
  return request.plaintext
    ? [lookup(pair, SERVER_READABLE_REGIME_FILTER)]
    : [lookup(pair, SERVER_BLIND_REGIME_FILTER), lookup(pair, null)];
}

/** Le premier tête-à-tête trouvé par `find` le long des `where`, ou `null`. */
export async function firstFound<T>(
  wheres: readonly Record<string, unknown>[],
  find: (where: Record<string, unknown>) => Promise<T | null>,
): Promise<T | null> {
  const [where, ...rest] = wheres;
  if (where === undefined) return null;
  return (await find(where)) ?? firstFound(rest, find);
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
