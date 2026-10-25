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
import { LEAVABLE_ACTIVE_MODES, SERVER_BLIND_REGIME_FILTER, SERVER_READABLE_REGIME_FILTER } from './encryptionRegime';

export type DirectPair = { readonly userId: string; readonly peerId: string };

const bothActive = (pair: DirectPair): readonly Record<string, unknown>[] => [
  { participants: { some: { userId: pair.userId, isActive: true } } },
  { participants: { some: { userId: pair.peerId, isActive: true } } },
];

/**
 * Le serveur lit-il ce mode ? La MÊME liste positive que
 * `SERVER_READABLE_REGIME_FILTER` (et son inverse `SERVER_BLIND_REGIME_FILTER`) :
 * absent, nul, `server` ou `hybrid` exacts.
 * Tout le reste — `e2ee` quelle que soit sa casse, ou un mode inconnu — est
 * traité comme chiffré de bout en bout, partout dans ce fichier.
 */
export const serverReadsMode = (mode: string | null | undefined): boolean =>
  mode === null || mode === undefined || (LEAVABLE_ACTIVE_MODES as readonly string[]).includes(mode);

const lookup = (pair: DirectPair, regime: Readonly<Record<string, unknown>> | null): Record<string, unknown> => ({
  type: 'direct',
  AND: regime === null ? [...bothActive(pair)] : [...bothActive(pair), regime],
});

/**
 * Les `where` à essayer DANS L'ORDRE pour trouver le tête-à-tête à rouvrir ;
 * le premier trouvé gagne. Sans précision, deux recherches au plus : le
 * chiffré, puis n'importe lequel — le prix d'un tri que MongoDB ne sait pas
 * faire sur le régime, jusqu'à une clé de paire en base (#13010).
 */
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

/**
 * Les deux personnes d'un tête-à-tête, ou `null` s'il n'a pas exactement deux
 * membres actifs inscrits — un invité sans compte en est un troisième.
 */
export function pairOfMembers(userIds: readonly (string | null | undefined)[]): DirectPair | null {
  if (userIds.length !== 2 || userIds.some((id) => typeof id !== 'string' || id === '')) return null;
  const [userId, peerId] = userIds as readonly string[];
  return userId !== peerId ? { userId: userId!, peerId: peerId! } : null;
}

/**
 * L'AUTRE tête-à-tête de la paire déjà chiffré de bout en bout, ou `null`.
 * « Chiffré » se juge comme partout ici (`serverReadsMode`).
 */
export async function otherEndToEndDirectOf(
  prisma: Pick<PrismaClient, 'conversation'>,
  params: { readonly conversationId: string; readonly pair: DirectPair },
): Promise<string | null> {
  const others = await prisma.conversation.findMany({
    where: { type: 'direct', id: { not: params.conversationId }, AND: [...bothActive(params.pair)] },
    select: { id: true, encryptionMode: true },
  } as never) as ReadonlyArray<{ readonly id: string; readonly encryptionMode: string | null }>;
  return others.find((other) => !serverReadsMode(other.encryptionMode))?.id ?? null;
}
