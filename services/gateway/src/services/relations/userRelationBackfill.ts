/**
 * LE RATTRAPAGE DES LIENS (#13926) — chaque demande d'amitié ACCEPTÉE donne une
 * ligne `UserRelation` FRIEND/FRIEND (origine `backfill-friend`).
 *
 * - Seule une demande `accepted` compte : `pending`, `rejected` et `blocked` ne
 *   font pas un ami. Une demande dont l'émetteur est le receveur est ignorée.
 * - Une paire portée par plusieurs lignes (A→B, B→A, doublons — `FriendRequest`
 *   n'a pas d'unique de paire) ne donne qu'UNE ligne de lien.
 * - Création seulement si la ligne MANQUE, jamais un écrasement : rejoué après
 *   une montée de niveau, il ne la défait pas. Deux passes donnent le même état.
 * - La date d'entrée est celle de l'acceptation d'origine (`respondedAt`, à
 *   défaut `updatedAt`, à défaut `now`).
 *
 * `dryRun` compte sans rien écrire. Pagination par curseur d'identifiant : un
 * lot ne relit jamais les précédents.
 *
 * À jouer sur le staging ; en production SEULEMENT avec le feu vert du porteur
 * et une sauvegarde vérifiée (#9223).
 */
import { relationPairKey } from '@meeshy/shared/types/relation';
import { createFriendshipIfAbsent, type UserRelationDb } from './userRelationWriter';

type AcceptedRequest = {
  readonly id: string;
  readonly senderId: string;
  readonly receiverId: string;
  readonly respondedAt?: Date | null;
  readonly updatedAt?: Date | null;
};

export interface UserRelationBackfillDb extends UserRelationDb {
  readonly friendRequest: {
    findMany(args: {
      where: { status: 'accepted' };
      select: { id: true; senderId: true; receiverId: true; respondedAt: true; updatedAt: true };
      orderBy: { id: 'asc' };
      take: number;
      cursor?: { id: string };
      skip?: number;
    }): PromiseLike<ReadonlyArray<AcceptedRequest>>;
  };
}

export type UserRelationBackfillOptions = {
  readonly dryRun: boolean;
  readonly now: Date;
  readonly batchSize?: number;
};

export type UserRelationBackfillReport = {
  readonly scanned: number;
  readonly created: number;
  readonly alreadyPresent: number;
  readonly skippedSelf: number;
};

type Outcome = 'created' | 'alreadyPresent' | 'skippedSelf';

const DEFAULT_BATCH = 200;

export async function backfillUserRelations(
  db: UserRelationBackfillDb,
  options: UserRelationBackfillOptions,
): Promise<UserRelationBackfillReport> {
  const take = options.batchSize ?? DEFAULT_BATCH;
  const seenInDryRun = new Set<string>();

  const settle = async (row: AcceptedRequest): Promise<Outcome> => {
    if (row.senderId === row.receiverId) return 'skippedSelf';
    const at = row.respondedAt ?? row.updatedAt ?? options.now;
    if (!options.dryRun) {
      return (await createFriendshipIfAbsent(db, { userA: row.senderId, userB: row.receiverId, at })) === 'created'
        ? 'created'
        : 'alreadyPresent';
    }
    const pair = relationPairKey(row.senderId, row.receiverId);
    const key = `${pair.userLowId}:${pair.userHighId}`;
    const present = seenInDryRun.has(key) || (await db.userRelation.findUnique({ where: { userLowId_userHighId: pair } })) !== null;
    seenInDryRun.add(key);
    return present ? 'alreadyPresent' : 'created';
  };

  let report: UserRelationBackfillReport = { scanned: 0, created: 0, alreadyPresent: 0, skippedSelf: 0 };
  let cursor: string | null = null;
  for (;;) {
    const rows: ReadonlyArray<AcceptedRequest> = await db.friendRequest.findMany({
      where: { status: 'accepted' },
      select: { id: true, senderId: true, receiverId: true, respondedAt: true, updatedAt: true },
      orderBy: { id: 'asc' },
      take,
      ...(cursor === null ? {} : { cursor: { id: cursor }, skip: 1 }),
    });
    for (const row of rows) {
      const outcome = await settle(row);
      report = { ...report, scanned: report.scanned + 1, [outcome]: report[outcome] + 1 };
    }
    if (rows.length < take) return report;
    cursor = rows[rows.length - 1].id;
  }
}
