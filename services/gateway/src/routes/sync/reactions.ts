import type { FastifyInstance } from 'fastify';
import { Prisma } from '@meeshy/shared/prisma/client';
import type { CursorKey, SyncCursor } from './cursor';
import { encodeSyncCursor } from './cursor';
import type { SyncIdentity } from './identity';
import { resolveSyncMembership } from './membership';
import { trimToByteBudget, SYNC_MAX_PAGE_BYTES } from './budget';
import { makeSyncCollectionSchema, type SyncCollectionResult } from './schema-shared';
import { selectForFields, restrictFields, type ColumnPlan, type FieldSet } from '../../utils/sparse-fieldset';

/**
 * Collection `reactions` de `/sync` (issue #4171, critère 1) — même forme que
 * `messages` pour `added`/`modified`/`truncated`/`nextCursor`, RLS fail-closed
 * par appartenance ET par plancher d'historique (une réaction sur un message
 * antérieur au plancher d'un lien sans historique ne doit pas fuiter — elle
 * révélerait à la fois l'existence du message et QUI y a réagi).
 *
 * ## `deleted` est TOUJOURS vide, et ce n'est pas un oubli
 *
 * `Reaction` (schema.prisma) n'a AUCUNE colonne `deletedAt` : `ReactionService`
 * retire une ligne par `prisma.reaction.deleteMany(...)`, une suppression
 * PHYSIQUE, sans tombstone. Aucun delta ne peut donc énumérer « les réactions
 * retirées depuis `since` » sans une colonne ou une table de suivi — que
 * `packages/shared/prisma/schema.prisma` est INTERDIT à ce lot (§ territoire
 * de l'issue #4171). La FORME de la collection reste complète
 * (`added`/`modified`/`deleted`/`truncated`/`nextCursor`, comme demandé par le
 * critère 1), mais `deleted` y est structurellement vide — documenté ici,
 * repris en suivi plutôt que masqué (`restant` du rapport de lot).
 *
 * Un retrait de réaction RESTE observable indirectement par la collection
 * `messages` : `updateMessageReactionSummary` réécrit `Message.reactionSummary`
 * / `reactionCount` à CHAQUE add/remove, ce qui bascule `Message.updatedAt` et
 * fait donc réapparaître le message dans le flux `modified` de `messages` —
 * sans dire QUI a retiré quoi, ce que seule cette collection promet.
 */

/**
 * `messageId`/`participantId`/`emoji`/`createdAt`/`updatedAt` sont la ligne ;
 * `conversationId` est porté par la relation `message` pour le routage client
 * et la RLS, jamais dupliqué en base.
 */
export const syncReactionSelect = Prisma.validator<Prisma.ReactionSelect>()({
  id: true,
  messageId: true,
  participantId: true,
  emoji: true,
  createdAt: true,
  updatedAt: true,
  message: { select: { conversationId: true } },
});

type SyncReactionRow = Prisma.ReactionGetPayload<{ select: typeof syncReactionSelect }>;

/**
 * Ce que `?fields=reactions.…` peut nommer (#4173).
 *
 * Le vocabulaire est celui de la ligne SERVIE, pas des colonnes : `conversationId`
 * n'est pas une colonne de `Reaction` — il vient de la relation `message`, que
 * le plan ci-dessous déclare comme SON coût. C'est exactement la distinction que
 * `ColumnPlan.columns` porte, et la raison pour laquelle un vocabulaire relevé
 * mécaniquement sur le `select` aurait été FAUX ici.
 */
export const SYNC_REACTION_SERVED_FIELDS = [
  'id',
  'messageId',
  'conversationId',
  'participantId',
  'emoji',
  'createdAt',
  'updatedAt',
] as const;

export const syncReactionPlan: ColumnPlan<typeof syncReactionSelect> = {
  full: syncReactionSelect,
  // `id` + `updatedAt` portent le keyset ; `createdAt` décide added/modified.
  pinned: ['id', 'createdAt', 'updatedAt'],
  columns: {
    conversationId: ['message'],
  },
};

/** `id` et `messageId` — sans le second, une réaction servie ne dit pas à quel
 *  message elle s'accroche, ce qui la rend inapplicable côté client. */
const SYNC_REACTION_SERVED_PINNED = ['id', 'messageId'] as const;

function serializeSyncReaction(row: SyncReactionRow): Record<string, unknown> {
  // Chaque champ est lu en OPTIONNEL : depuis #4173 la ligne peut n'avoir été
  // chargée que sur une partie de ses colonnes, et la relation `message` n'est
  // ouverte que si `conversationId` a été demandé.
  const brut = row as Partial<SyncReactionRow>;
  return {
    id: row.id,
    messageId: brut.messageId,
    conversationId: brut.message?.conversationId,
    participantId: brut.participantId,
    emoji: brut.emoji,
    createdAt: brut.createdAt,
    updatedAt: brut.updatedAt,
  };
}

const syncReactionSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    messageId: { type: 'string' },
    conversationId: { type: 'string' },
    participantId: { type: 'string' },
    emoji: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const syncReactionCollectionSchema = makeSyncCollectionSchema(syncReactionSchema);

export async function syncReactions(opts: {
  prisma: FastifyInstance['prisma'];
  identity: SyncIdentity;
  sinceDate: Date;
  cap: number;
  scope?: string;
  cursor?: SyncCursor;
  /** `?fields=reactions.…` déjà analysé — `null` ⇒ le profil par défaut. */
  fields?: FieldSet;
}): Promise<SyncCollectionResult<Record<string, unknown>>> {
  const { prisma, identity, sinceDate, cap, scope, cursor } = opts;
  const fields = opts.fields ?? null;

  const membership = await resolveSyncMembership({ prisma, identity, scope });
  if (membership.conversationIds.length === 0) {
    return {
      added: [],
      modified: [],
      deleted: [],
      truncated: membership.droppedCount > 0,
      nextCursor: membership.droppedCount > 0 ? encodeSyncCursor(cursor ?? {}) : null,
    };
  }
  const { conversationIds, historyFloor } = membership;

  const changedRows = await prisma.reaction.findMany({
    where: {
      message: {
        conversationId: { in: [...conversationIds] },
        ...historyFloor,
      },
      ...(cursor?.c
        ? {
            OR: [
              { updatedAt: { gt: new Date(cursor.c.u) } },
              { updatedAt: new Date(cursor.c.u), id: { gt: cursor.c.i } },
            ],
          }
        : { updatedAt: { gt: sinceDate } }),
    },
    select: selectForFields(syncReactionPlan, fields),
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    take: cap + 1,
  });
  const capTruncated = changedRows.length > cap;
  const cappedRows = capTruncated ? changedRows.slice(0, cap) : changedRows;

  // Le budget se mesure sur la ligne PRISMA, jamais sur la forme sérialisée —
  // même patron que `syncMessages` (`routes/sync/budget.ts`,
  // `trimToByteBudget` : « approximation par excès du même ordre de
  // grandeur »). Le keyset reste ancré sur cette même ligne.
  const budgeted = trimToByteBudget(cappedRows, SYNC_MAX_PAGE_BYTES);
  const deliveredRows = budgeted.page;
  const truncated = capTruncated || budgeted.truncated || membership.droppedCount > 0;

  const servir = (r: SyncReactionRow): Record<string, unknown> =>
    restrictFields(serializeSyncReaction(r), fields, SYNC_REACTION_SERVED_PINNED);
  const added = deliveredRows.filter((r) => r.createdAt > sinceDate).map(servir);
  const modified = deliveredRows.filter((r) => r.createdAt <= sinceDate).map(servir);

  const lastDelivered = deliveredRows[deliveredRows.length - 1];
  const cKey: CursorKey | undefined = lastDelivered
    ? { u: lastDelivered.updatedAt.toISOString(), i: lastDelivered.id }
    : cursor?.c;

  const nextKey: Record<string, CursorKey> = {};
  if (cKey) nextKey.c = cKey;
  const nextCursor = truncated ? encodeSyncCursor(nextKey) : null;

  return { added, modified, deleted: [], truncated, nextCursor };
}
