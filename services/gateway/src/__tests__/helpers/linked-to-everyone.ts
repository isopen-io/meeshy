/**
 * Un graphe où TOUT LE MONDE (sauf `unlinked`) est lié à tout le monde, au niveau `level` — pour les
 * suites qui éprouvent la FORME d'une notification (contenu, langue, priorité,
 * débit) et non la règle de lien (#14168, témoins : `mention-lien-14168.test.ts`).
 *
 * `userRelationRows` répond à `niveauxParmi` / `comptesAuMoins` par une ligne par
 * paire demandée ; `aliveAndUnblocked` enveloppe un `user.findMany` existant :
 * personne n'est bloqué, tout candidat est vivant, toute autre lecture (langues)
 * passe à l'implémentation d'origine.
 */
import { relationPairKey, type RelationLevel } from '@meeshy/shared/types/relation';

type InClause = { readonly in?: readonly string[] };
type PairClause = { readonly userLowId?: string | InClause; readonly userHighId?: string | InClause };
type RelationQuery = { readonly where?: { readonly OR?: readonly PairClause[] } };

const ids = (clause: string | InClause | undefined): readonly string[] =>
  typeof clause === 'string' ? [clause] : clause?.in ?? [];

export const userRelationRows =
  (level: RelationLevel = 'FRIEND', unlinked: readonly string[] = []) =>
  async (args?: RelationQuery) => {
    const pairs = (args?.where?.OR ?? [])
      .flatMap((clause) => ids(clause.userLowId).flatMap((a) => ids(clause.userHighId).map((b) => [a, b] as const)))
      .filter(([a, b]) => !unlinked.includes(a) && !unlinked.includes(b));
    return pairs.map(([a, b], index) => ({
      id: `rel-${index}`,
      ...relationPairKey(a, b),
      grantedByLow: level,
      grantedByHigh: level,
      transitions: [],
      updatedAt: new Date(2026, 9, 1),
    }));
  };

type UserQuery = {
  readonly where: { readonly id?: InClause; readonly blockedUserIds?: unknown; readonly deletedAt?: null; readonly isActive?: boolean };
};

export const aliveAndUnblocked =
  (origin: (args: UserQuery) => unknown = async () => []) =>
  async (args: UserQuery) => {
    if (args.where.blockedUserIds !== undefined) return [];
    if (args.where.deletedAt === null && args.where.isActive === true) return (args.where.id?.in ?? []).map((id) => ({ id }));
    return origin(args);
  };
