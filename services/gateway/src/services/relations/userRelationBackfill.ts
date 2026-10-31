/**
 * LE RATTRAPAGE DES LIENS (#13926) — chaque demande d'amitié ACCEPTÉE donne une
 * ligne `UserRelation` FRIEND/FRIEND (origine `backfill-friend`).
 *
 * - Seule une demande `accepted` compte : `pending`, `rejected` et `blocked` ne
 *   font pas un ami. Une demande dont l'émetteur est le receveur est ignorée.
 * - Une paire portée par plusieurs lignes (A→B, B→A, doublons — `FriendRequest`
 *   n'a pas d'unique de paire) ne donne qu'UNE ligne de lien.
 * - Une demande acceptée se lit FRIEND : la ligne absente est créée, une ligne
 *   née plus bas est RELEVÉE (`backfillFriendship`). Une ligne plus haute, ou
 *   portant une baisse gravée depuis l'acceptation, n'est jamais touchée. Deux
 *   passes donnent le même état.
 * - La date d'acceptation est `respondedAt`, à défaut `updatedAt` ; elle date
 *   le niveau (à défaut `now`) et départage une baisse gravée.
 *
 * `dryRun` compte sans rien écrire, en enchaînant les demandes d'une même
 * paire sur la ligne PROJETÉE : il rend le compte que rendrait l'écriture.
 * Pagination par curseur d'identifiant : un lot ne relit jamais les précédents.
 *
 * À jouer sur le staging ; en production SEULEMENT avec le feu vert du porteur
 * et une sauvegarde vérifiée (#9223).
 */
import { relationPairKey } from '@meeshy/shared/types/relation';
import {
  backfillFriendship,
  friendshipBackfillPlan,
  friendshipBackfillProjection,
  type UserRelationDb,
  type UserRelationRow,
} from './userRelationWriter';

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
  readonly raised: number;
  readonly alreadyPresent: number;
  readonly skippedSelf: number;
};

type Outcome = 'created' | 'raised' | 'alreadyPresent' | 'skippedSelf';

const OUTCOME_OF_WRITE = { created: 'created', raised: 'raised', unchanged: 'alreadyPresent', ignored: 'skippedSelf' } as const;
const OUTCOME_OF_PLAN = { create: 'created', raise: 'raised', keep: 'alreadyPresent' } as const;

const DEFAULT_BATCH = 200;

export async function backfillUserRelations(
  db: UserRelationBackfillDb,
  options: UserRelationBackfillOptions,
): Promise<UserRelationBackfillReport> {
  const take = options.batchSize ?? DEFAULT_BATCH;
  const projected = new Map<string, UserRelationRow | null>();

  const settle = async (row: AcceptedRequest): Promise<Outcome> => {
    if (row.senderId === row.receiverId) return 'skippedSelf';
    const acceptedAt = row.respondedAt ?? row.updatedAt ?? null;
    if (!options.dryRun) {
      return OUTCOME_OF_WRITE[
        await backfillFriendship(db, { userA: row.senderId, userB: row.receiverId, acceptedAt, now: options.now })
      ];
    }
    const pair = relationPairKey(row.senderId, row.receiverId);
    const key = `${pair.userLowId}:${pair.userHighId}`;
    const current = projected.has(key)
      ? projected.get(key) ?? null
      : await db.userRelation.findUnique({ where: { userLowId_userHighId: pair } });
    projected.set(key, friendshipBackfillProjection(current, pair, acceptedAt));
    return OUTCOME_OF_PLAN[friendshipBackfillPlan(current, acceptedAt)];
  };

  let report: UserRelationBackfillReport = { scanned: 0, created: 0, raised: 0, alreadyPresent: 0, skippedSelf: 0 };
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
