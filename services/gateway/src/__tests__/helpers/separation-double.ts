/**
 * LE DÉLÉGUÉ `user` QU'UN DOUBLE PRISMA DOIT PORTER POUR QUE LA PORTE DE
 * CONSOMMATION RÉPONDE « AUCUN BLOCAGE » (#20717).
 *
 * `canUserConsumePost` lit la séparation par blocage depuis #20717 — trois
 * méthodes, selon le chemin :
 *
 * | chemin | méthode lue | par |
 * |---|---|---|
 * | verdict UNITAIRE | `user.findFirst` | `isBlockedBetween` (les deux sens en une requête) |
 * | chemin de LOT | `user.findMany` + `user.findUnique` | `getBlockedUserIdsAmong` |
 *
 * **Un double qui n'en sert qu'une partie casse l'autre chemin EN SILENCE**, et
 * la garde étant FERMÉE sur l'échec, le symptôme n'est pas une erreur de double
 * mais un refus d'accès : une route qui rend 404, un lot d'impressions
 * `recorded: 0`. C'est la leçon « un double PARTIEL perd en silence ce que le
 * module GAGNE » (cycle 93), et le lot #20717 l'a payée sur 33 suites — chacune
 * manquant une méthode DIFFÉRENTE.
 *
 * D'où un site unique : les trois méthodes ensemble, ou rien. Les ajouter une
 * par une est exactement ce qui a produit l'écart.
 */

/** « Personne n'est bloqué », le cas nominal de tout témoin qui ne parle pas de blocage. */
export const noBlockUserDelegate = () => ({
  /** `isBlockedBetween` : aucune ligne ⇒ aucun blocage dans l'un ou l'autre sens. */
  findFirst: async () => null,
  /** `getBlockedUserIdsAmong`, sens « qui, parmi ces candidats, m'a bloqué ? ». */
  findMany: async () => [] as unknown[],
  /** `getBlockedUserIdsAmong`, sens « qui ai-je bloqué ? ». */
  findUnique: async () => ({ blockedUserIds: [] as string[] }),
});
