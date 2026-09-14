import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { JOIN_NOTICE_KIND, parseJoinNotice } from '@meeshy/shared/utils/join-notice';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { conversationMessageStatsService } from '../ConversationMessageStatsService';
import { recomputeConversationLastMessageAt } from './messageRemovalEffects';
import { DELETED_ACCOUNT_DISPLAY_NAME } from './deletedAccountDisplayName';

const log = enhancedLogger.child({ module: 'repairOrphanedMessageSenders' });

/**
 * La réparation UNIQUE des messages dont le `Participant` expéditeur n'existe
 * plus (#6501).
 *
 * ─── POURQUOI UN SEUL ORPHELIN SUFFIT ──────────────────────────────────────
 *
 * `Message.sender` est une relation REQUISE. Une lecture qui la charge et
 * rencontre UNE ligne sans expéditeur n'écarte pas la ligne : Prisma rejette la
 * lecture ENTIÈRE (« Inconsistent query result: Field sender is required to
 * return data, got `null` instead »). Le 2026-09-14, onze avis d'arrivée laissés
 * par un script de preuve ont ainsi rendu « Meeshy Global » illisible pour tout
 * le monde sur staging ; sept messages d'agent orphelins font la même chose à un
 * groupe de production.
 *
 * Mongo n'a pas de clé étrangère : ce ne sont pas les écritures qui garantissent
 * la relation, c'est la discipline de chaque effaceur. Il en existait deux qui
 * ne l'avaient pas (`MaintenanceService.cleanupExpiredData`, le script de
 * preuve) ; les deux sont corrigés, et cette réparation couvre ce qui est déjà
 * en base comme ce qu'un effaceur futur oublierait.
 *
 * ─── DEUX GESTES, CHOISIS PAR CE QUE LE MESSAGE EST ───────────────────────
 *
 * - Un AVIS D'ARRIVÉE (`messageSource: 'system'`, `parseJoinNotice`) n'a de
 *   sens que par son auteur : « X a rejoint » sans X n'annonce personne. Il est
 *   EFFACÉ — par Prisma, qui émule les `onDelete: Cascade` de ses enfants — puis
 *   l'horloge et les compteurs de la conversation sont recalculés, comme le fait
 *   déjà le balayage des messages vides.
 * - Tout AUTRE message appartient au fil des autres. Il reçoit un participant
 *   TOMBSTONE « Compte supprimé » — la même promesse que l'anonymisation d'un
 *   compte supprimé (#3632) : on ne détruit pas la conversation des autres.
 *   Le tombstone prend l'identifiant ORPHELIN, ce qui répare tous les messages
 *   de cet auteur sans en réécrire un seul. Un expéditeur NUL (champ requis que
 *   Prisma rejette aussi) reçoit un identifiant dérivé de la conversation, et ses
 *   messages y sont réaffectés.
 *
 * ─── CE QUE LE TOMBSTONE NE PEUT PAS FAIRE ────────────────────────────────
 *
 * - S'AUTHENTIFIER : `userId` nul, `type: 'user'` (toute lecture de session
 *   anonyme exige `type: 'anonymous'`), `isActive: false`, et un
 *   `sessionTokenHash` qui n'a pas la forme d'un SHA-256 hexadécimal — aucun
 *   jeton, haché par `hashSessionToken`, ne peut le reproduire.
 * - HEURTER l'index unique de production `(conversationId, userId,
 *   sessionTokenHash)` : deux tombstones `(C, null, null)` s'y percuteraient ; le
 *   marqueur porte l'identifiant du tombstone, il est donc unique.
 * - PARAÎTRE EN LIGNE : `lastActiveAt` à l'époque zéro, jamais « à l'instant ».
 * - Rendre un pseudo : `type: 'user'` fait résoudre le nom par
 *   `resolveParticipantDisplayName` ; `anonymous` aurait fait de « Compte
 *   supprimé » un handle `@`.
 *
 * ─── BORNÉE, BEST-EFFORT, IDEMPOTENTE ─────────────────────────────────────
 *
 * Les orphelins se trouvent par agrégation : un `$group` par paire
 * (conversation, expéditeur), puis un `$lookup` d'identifiants seuls — une
 * recherche par auteur, jamais une par message. La portée est la conversation
 * quand elle est fournie ; une liste VIDE ne répare rien (jamais une passe
 * globale par accident). Les paires se traitent par fournées de `batchSize` ;
 * une paire qui résiste se journalise et se compte sans arrêter les autres, et
 * une fournée qui ne répare plus rien arrête la passe. Rejouée, la réparation ne
 * fabrique rien : un tombstone déjà posé (P2002) n'est ni un échec ni un doublon.
 */

export type RepairOrphanedMessageSendersOptions = {
  /** La portée d'une lecture qui vient d'échouer. */
  readonly conversationId?: string;
  /** La portée d'une passe groupée. Une liste vide ne répare rien. */
  readonly conversationIds?: readonly string[];
  /** Paires (conversation, expéditeur) orphelines traitées par agrégation. */
  readonly batchSize?: number;
};

export type RepairOrphanedMessageSendersResult = {
  readonly deletedNotices: number;
  readonly tombstoned: number;
  readonly reassignedMessages: number;
  readonly failures: number;
};

export const TOMBSTONE_SESSION_MARKER_PREFIX = 'tombstone:';

export const tombstoneSessionMarker = (participantId: string): string =>
  `${TOMBSTONE_SESSION_MARKER_PREFIX}${participantId}`;

export const nullSenderTombstoneId = (conversationId: string): string =>
  createHash('sha256').update(`orphaned-null-sender:${conversationId}`).digest('hex').slice(0, 24);

const DEFAULT_BATCH_SIZE = 200;
const NOTICE_PAGE_SIZE = 500;
const OBJECT_ID = /^[0-9a-f]{24}$/i;
const NEVER_ACTIVE = new Date(0);

const NOTHING_REPAIRED: RepairOrphanedMessageSendersResult = {
  deletedNotices: 0,
  tombstoned: 0,
  reassignedMessages: 0,
  failures: 0,
};

type RawDocument = Record<string, unknown>;
type OrphanedPair = { readonly conversationId: string; readonly senderId: string | null };
type PairOutcome = Omit<RepairOrphanedMessageSendersResult, 'failures'>;

const objectId = (id: string): Prisma.InputJsonObject => ({ $oid: id });

function readObjectId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || !('$oid' in value)) return null;
  const raw = (value as { $oid: unknown }).$oid;
  return typeof raw === 'string' ? raw : null;
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function aggregate(prisma: PrismaClient, pipeline: Prisma.InputJsonObject[]): Promise<RawDocument[]> {
  const rows: unknown = await prisma.message.aggregateRaw({ pipeline, options: { allowDiskUse: true } });
  return Array.isArray(rows) ? (rows as RawDocument[]) : [];
}

function resolveScope(options: RepairOrphanedMessageSendersOptions): readonly string[] | null {
  const requested =
    options.conversationIds ?? (options.conversationId === undefined ? null : [options.conversationId]);
  return requested === null ? null : [...new Set(requested.filter((id) => OBJECT_ID.test(id)))];
}

const pairFilter = (pair: OrphanedPair): Prisma.InputJsonObject => ({
  conversationId: objectId(pair.conversationId),
  senderId: pair.senderId === null ? null : objectId(pair.senderId),
});

const idOnlyLookup = (from: string, localField: string, as: string): Prisma.InputJsonObject => ({
  $lookup: { from, localField, foreignField: '_id', pipeline: [{ $project: { _id: 1 } }], as },
});

async function findOrphanedPairs(
  prisma: PrismaClient,
  scope: readonly string[] | null,
  limit: number
): Promise<OrphanedPair[]> {
  const scopeStage: Prisma.InputJsonObject[] =
    scope === null ? [] : [{ $match: { conversationId: { $in: scope.map(objectId) } } }];
  const rows = await aggregate(prisma, [
    ...scopeStage,
    { $group: { _id: { conversationId: '$conversationId', senderId: { $ifNull: ['$senderId', null] } } } },
    idOnlyLookup('Participant', '_id.senderId', 'sender'),
    { $match: { sender: { $size: 0 } } },
    idOnlyLookup('Conversation', '_id.conversationId', 'conversation'),
    { $match: { conversation: { $size: 1 } } },
    { $limit: limit },
    { $project: { _id: 1 } },
  ]);
  return rows.flatMap((row) => {
    const key = row._id && typeof row._id === 'object' ? (row._id as RawDocument) : {};
    const conversationId = readObjectId(key.conversationId);
    return conversationId ? [{ conversationId, senderId: readObjectId(key.senderId) }] : [];
  });
}

async function findJoinNoticeIds(
  prisma: PrismaClient,
  pair: OrphanedPair,
  after: string | null = null
): Promise<string[]> {
  const rows = await aggregate(prisma, [
    {
      $match: {
        ...pairFilter(pair),
        messageSource: 'system',
        'metadata.kind': JOIN_NOTICE_KIND,
        ...(after === null ? {} : { _id: { $gt: objectId(after) } }),
      },
    },
    { $sort: { _id: 1 } },
    { $limit: NOTICE_PAGE_SIZE },
    { $project: { _id: 1, metadata: 1 } },
  ]);
  const notices = rows.flatMap((row) => {
    const id = readObjectId(row._id);
    return id && parseJoinNotice(row.metadata) ? [id] : [];
  });
  const last = readObjectId(rows[rows.length - 1]?._id);
  if (rows.length < NOTICE_PAGE_SIZE || !last) return notices;
  return [...notices, ...(await findJoinNoticeIds(prisma, pair, last))];
}

async function hasMessagesLeft(prisma: PrismaClient, pair: OrphanedPair): Promise<boolean> {
  const rows = await aggregate(prisma, [{ $match: pairFilter(pair) }, { $limit: 1 }, { $project: { _id: 1 } }]);
  return rows.length > 0;
}

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';

async function createTombstone(
  prisma: PrismaClient,
  conversationId: string,
  participantId: string,
  leftAt: Date
): Promise<boolean> {
  try {
    await prisma.participant.create({
      data: {
        id: participantId,
        conversationId,
        type: 'user',
        userId: null,
        displayName: DELETED_ACCOUNT_DISPLAY_NAME,
        role: 'member',
        permissions: {},
        isActive: false,
        isOnline: false,
        lastActiveAt: NEVER_ACTIVE,
        leftAt,
        sessionTokenHash: tombstoneSessionMarker(participantId),
      },
      select: { id: true },
    });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

async function reassignNullSenders(prisma: PrismaClient, conversationId: string, tombstoneId: string): Promise<number> {
  const result = await prisma.$runCommandRaw({
    update: 'Message',
    updates: [
      {
        q: { conversationId: objectId(conversationId), senderId: null },
        u: { $set: { senderId: objectId(tombstoneId) } },
        multi: true,
      },
    ],
  });
  return typeof result.nModified === 'number' ? result.nModified : 0;
}

async function repairPair(prisma: PrismaClient, pair: OrphanedPair, now: Date): Promise<PairOutcome> {
  const noticeIds = await findJoinNoticeIds(prisma, pair);
  const deletedNotices =
    noticeIds.length === 0 ? 0 : (await prisma.message.deleteMany({ where: { id: { in: noticeIds } } })).count;

  if (!(await hasMessagesLeft(prisma, pair))) {
    return { deletedNotices, tombstoned: 0, reassignedMessages: 0 };
  }

  const tombstoneId = pair.senderId ?? nullSenderTombstoneId(pair.conversationId);
  const created = await createTombstone(prisma, pair.conversationId, tombstoneId, now);
  const reassignedMessages =
    pair.senderId === null ? await reassignNullSenders(prisma, pair.conversationId, tombstoneId) : 0;

  return { deletedNotices, tombstoned: created ? 1 : 0, reassignedMessages };
}

async function recomputeConversationAfterRepair(prisma: PrismaClient, conversationId: string): Promise<void> {
  try {
    await recomputeConversationLastMessageAt(prisma, conversationId);
  } catch (error) {
    log.warn('lastMessageAt not recomputed after orphan repair', { conversationId, error: errorMessage(error) });
  }
  try {
    await conversationMessageStatsService.recomputeIfTracked(prisma, conversationId);
  } catch (error) {
    log.warn('message stats not recomputed after orphan repair', { conversationId, error: errorMessage(error) });
  }
}

const changed = (outcome: PairOutcome): boolean =>
  outcome.deletedNotices + outcome.tombstoned + outcome.reassignedMessages > 0;

export async function repairOrphanedMessageSenders(
  prisma: PrismaClient,
  options: RepairOrphanedMessageSendersOptions = {}
): Promise<RepairOrphanedMessageSendersResult> {
  const scope = resolveScope(options);
  if (scope !== null && scope.length === 0) return NOTHING_REPAIRED;

  const batchSize = Math.max(1, Math.floor(options.batchSize ?? DEFAULT_BATCH_SIZE));
  const now = new Date();
  const touchedConversations = new Set<string>();
  let totals = NOTHING_REPAIRED;

  for (;;) {
    const pairs = await findOrphanedPairs(prisma, scope, batchSize);
    let progressed = false;

    for (const pair of pairs) {
      try {
        const outcome = await repairPair(prisma, pair, now);
        if (outcome.deletedNotices + outcome.reassignedMessages > 0) touchedConversations.add(pair.conversationId);
        progressed = progressed || changed(outcome);
        totals = {
          deletedNotices: totals.deletedNotices + outcome.deletedNotices,
          tombstoned: totals.tombstoned + outcome.tombstoned,
          reassignedMessages: totals.reassignedMessages + outcome.reassignedMessages,
          failures: totals.failures,
        };
      } catch (error) {
        totals = { ...totals, failures: totals.failures + 1 };
        log.warn('orphaned message sender not repaired', {
          conversationId: pair.conversationId,
          senderId: pair.senderId,
          error: errorMessage(error),
        });
      }
    }

    if (pairs.length < batchSize || !progressed) break;
  }

  for (const conversationId of touchedConversations) {
    await recomputeConversationAfterRepair(prisma, conversationId);
  }

  if (changed(totals) || totals.failures > 0) {
    log.info('orphaned message senders repaired', { scope: scope ?? 'all-conversations', ...totals });
  }
  return totals;
}
