/**
 * Single writer for `UserConversationPreferences`.
 *
 * The row is per-USER, not per-device, so every write owes three things that
 * only work as a set:
 *   1. persist the change;
 *   2. bump `version` — the schema calls it "monotonic" and every client drops
 *      an incoming payload whose `version` is `<=` its local snapshot;
 *   3. broadcast the resulting snapshot to `user:{id}` so the user's other
 *      devices converge without waiting for an unrelated full refetch.
 *
 * Doing (3) without (2) emits an event every device discards; doing (2)
 * without (3) advances a counter nobody receives. Keeping them in one function
 * is what stops a new writer from honouring only part of the contract — the
 * three deletion routes (`delete-for-me`, `restore-for-me`, `clear-history`)
 * each did exactly that, silently, while writing the very two fields
 * (`deletedForUserAt`, `clearHistoryBefore`) that `ConversationPreferencesPayload`
 * declares and the iOS `ConversationStoreSocketBridge` already maps onto
 * `userState`.
 *
 * The batch reorder (`reorderConversationPreferences`) is the one write that
 * legitimately skips (2): order is broadcast by `USER_PREFERENCES_REORDERED`,
 * which carries no version. It still owes (1) and (3), and it owed neither —
 * see its own comment.
 */

import type { FastifyInstance } from 'fastify';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type {
  ConversationPreferencesPayload,
  UserPreferencesConversationUpdatedEventData,
  UserPreferencesReorderedEventData,
} from '@meeshy/shared/types/socketio-events';
import { broadcastToUser } from '../utils/socket-broadcast';

export interface ConversationPrefRow {
  isPinned: boolean;
  isMuted: boolean;
  mentionsOnly: boolean;
  isArchived: boolean;
  tags: string[];
  categoryId: string | null;
  orderInCategory: number | null;
  customName: string | null;
  reaction: string | null;
  readingMode: string;
  deletedForUserAt: Date | null;
  clearHistoryBefore: Date | null;
  version: number;
}

export const toPreferencesPayload = (row: ConversationPrefRow): ConversationPreferencesPayload => ({
  isPinned: row.isPinned,
  isMuted: row.isMuted,
  mentionsOnly: row.mentionsOnly,
  isArchived: row.isArchived,
  tags: row.tags ?? [],
  categoryId: row.categoryId,
  orderInCategory: row.orderInCategory,
  customName: row.customName,
  reaction: row.reaction,
  readingMode: row.readingMode,
  deletedForUserAt: row.deletedForUserAt ? row.deletedForUserAt.toISOString() : null,
  clearHistoryBefore: row.clearHistoryBefore ? row.clearHistoryBefore.toISOString() : null,
});

/**
 * Every column a caller may set. Deliberately excludes `version`: the counter
 * belongs to this module, never to a call site.
 */
export interface ConversationPreferencesWrite {
  readonly isPinned?: boolean;
  readonly isMuted?: boolean;
  readonly mentionsOnly?: boolean;
  readonly isArchived?: boolean;
  readonly tags?: string[];
  readonly categoryId?: string | null;
  readonly orderInCategory?: number | null;
  readonly customName?: string | null;
  readonly reaction?: string | null;
  readonly readingMode?: string;
  readonly deletedForUserAt?: Date | null;
  readonly clearHistoryBefore?: Date | null;
}

export interface WriteConversationPreferencesParams {
  readonly userId: string;
  readonly conversationId: string;
  readonly data: ConversationPreferencesWrite;
}

/**
 * Why a write was refused. Both ids a caller supplies name rows this user may
 * not be entitled to, and the two cases warrant different answers: not being in
 * a conversation is a permission fact the caller already knows, while a
 * category id that is not theirs must not be confirmed to exist at all.
 */
export type ConversationPreferencesScopeReason = 'not-a-participant' | 'category-not-owned';

export class ConversationPreferencesScopeError extends Error {
  constructor(readonly reason: ConversationPreferencesScopeReason) {
    super(reason);
    this.name = 'ConversationPreferencesScopeError';
  }
}

/**
 * Upsert the row, bump its version, broadcast the new snapshot, return the row
 * (with `category` included, which the PUT route echoes back to the caller).
 *
 * The first-ever upsert starts at version 1 rather than the schema default 0
 * so every broadcast carries `version >= 1`. Clients apply
 * `incoming.version <= local -> drop` against a snapshot that also starts at 0,
 * so a first event at version 0 would be indistinguishable from "nothing has
 * happened yet" and be discarded.
 *
 * Scope belongs here, not at the call sites, for the same reason the version
 * bump does: the row is reachable only through this function, so this is the
 * one place a future writer cannot forget. `reorderConversationPreferences`
 * already filtered on membership; this half of the module did not, which is the
 * asymmetry that made the gap visible.
 *
 * Both ids arrive from the caller and both are checked:
 *
 * - **Membership** — the write is an upsert, so an unscoped call lets any
 *   authenticated caller mint rows against arbitrary conversation ids and make
 *   the server broadcast `USER_PREFERENCES_UPDATED` for them. The predicate is
 *   the one `GET /conversations` filters on and the three `user-deletions.ts`
 *   routes already check, so nothing a client can see becomes unwritable.
 * - **Category ownership** — `UserConversationCategory` is per-user and
 *   private, and the row returned here carries the joined category into the
 *   PUT's response body and into every later GET. Unchecked, a caller could
 *   attach someone else's category and read back its name, colour and icon.
 *   Every route in `me/preferences/categories.ts` scopes to `{ id, userId }`;
 *   this was the one writer of `categoryId` that did not. `null` means
 *   uncategorize and needs no lookup.
 *
 * The three `user-deletions.ts` callers keep their own pre-checks: they answer
 * with a message of their own, and the check here can then only fire on a
 * membership lost mid-request.
 */
export async function writeConversationPreferences(
  fastify: FastifyInstance,
  { userId, conversationId, data }: WriteConversationPreferencesParams
) {
  const membership = await fastify.prisma.participant.findFirst({
    where: { userId, conversationId, isActive: true },
    select: { id: true },
  });
  if (!membership) {
    throw new ConversationPreferencesScopeError('not-a-participant');
  }

  if (data.categoryId != null) {
    const category = await fastify.prisma.userConversationCategory.findFirst({
      where: { id: data.categoryId, userId },
      select: { id: true },
    });
    if (!category) {
      throw new ConversationPreferencesScopeError('category-not-owned');
    }
  }

  const row = await fastify.prisma.userConversationPreferences.upsert({
    where: { userId_conversationId: { userId, conversationId } },
    create: { userId, conversationId, ...data, version: 1 },
    update: { ...data, version: { increment: 1 } },
    include: { category: true },
  });

  const eventPayload: UserPreferencesConversationUpdatedEventData = {
    userId,
    conversationId,
    version: (row as unknown as ConversationPrefRow).version ?? 0,
    reset: false,
    preferences: toPreferencesPayload(row as unknown as ConversationPrefRow),
  };
  broadcastToUser(fastify, userId, SERVER_EVENTS.USER_PREFERENCES_UPDATED, eventPayload);

  return row;
}

export interface ConversationOrderUpdate {
  readonly conversationId: string;
  readonly orderInCategory: number;
}

export interface ReorderConversationPreferencesParams {
  readonly userId: string;
  readonly updates: readonly ConversationOrderUpdate[];
}

/**
 * Batch drag-reorder. Persists `orderInCategory` for every conversation the
 * user is actually in, then broadcasts **one** `USER_PREFERENCES_REORDERED`
 * describing exactly what was written. Returns those same updates.
 *
 * Two departures from `writeConversationPreferences`, both deliberate:
 *
 * - **No version bump.** Order sits outside the versioned path:
 *   `USER_PREFERENCES_REORDERED` carries no version and iOS `applyRemoteReorder`
 *   applies it ungated. Incrementing here would advance a counter that no
 *   broadcast delivers — the half-contract this module exists to prevent — and
 *   would cost one `USER_PREFERENCES_UPDATED` per dragged row instead of one
 *   event per drag.
 * - **A membership filter.** The write is an upsert, so an unscoped batch would
 *   let any authenticated caller mint preference rows against arbitrary
 *   conversation ids. `updateMany` used to absorb that for the wrong reason: it
 *   matched nothing, for anybody.
 *
 * Updates are de-duplicated last-wins; two concurrent upserts on the same
 * unique key race.
 */
export async function reorderConversationPreferences(
  fastify: FastifyInstance,
  { userId, updates }: ReorderConversationPreferencesParams
): Promise<ConversationOrderUpdate[]> {
  const deduped = [...new Map(updates.map((u) => [u.conversationId, u])).values()];
  if (deduped.length === 0) return [];

  const memberships = await fastify.prisma.participant.findMany({
    where: {
      userId,
      conversationId: { in: deduped.map((u) => u.conversationId) },
      isActive: true,
    },
    select: { conversationId: true },
  });
  const joined = new Set(memberships.map((m: { conversationId: string }) => m.conversationId));
  const applicable = deduped.filter((u) => joined.has(u.conversationId));
  if (applicable.length === 0) return [];

  await Promise.all(
    applicable.map((update) =>
      fastify.prisma.userConversationPreferences.upsert({
        where: { userId_conversationId: { userId, conversationId: update.conversationId } },
        create: {
          userId,
          conversationId: update.conversationId,
          orderInCategory: update.orderInCategory,
        },
        update: { orderInCategory: update.orderInCategory },
      })
    )
  );

  const eventPayload: UserPreferencesReorderedEventData = {
    userId,
    updates: applicable.map((u) => ({
      conversationId: u.conversationId,
      orderInCategory: u.orderInCategory,
    })),
  };
  broadcastToUser(fastify, userId, SERVER_EVENTS.USER_PREFERENCES_REORDERED, eventPayload);

  return applicable;
}

export interface DetachConversationsFromCategoryParams {
  readonly userId: string;
  readonly categoryId: string;
}

/**
 * Detach every conversation attached to a category the user is deleting, and
 * return the conversation ids actually written.
 *
 * It lives here for the reason the whole module exists: `categoryId` is a
 * column of `UserConversationPreferences`, so clearing it is a preference write
 * and owes the same three things as any other — persist, bump `version`,
 * broadcast the resulting snapshot to `user:{id}`. The delete route did none of
 * them: it wrote to `ConversationPreference`, the generic key/value store,
 * which declares neither `categoryId` nor any link to a category. The generated
 * client rejects that call before any round-trip (`PrismaClientValidationError`,
 * "Unknown argument `categoryId`"), so the surrounding `$transaction` threw and
 * **no conversation category could ever be deleted**.
 *
 * Two departures from `writeConversationPreferences`, both forced by the shape
 * of the write:
 *
 * - **One `updateMany`, not N upserts.** Every row it touches already exists —
 *   a row cannot carry a `categoryId` without existing — so there is nothing to
 *   create, and the id set is bounded by one category's worth of conversations.
 * - **The snapshot is re-read, not returned by the write.** `updateMany` gives
 *   a count, never rows, and the broadcast must carry the version the write
 *   just produced: a payload built from the pre-write snapshot would be dropped
 *   by every client (`incoming.version <= local -> drop`).
 *
 * Scope is the `userId` in the filter itself: a category id belonging to
 * someone else selects no row of this user's, so the batch is bounded by
 * construction and the broadcast names only what was written.
 *
 * The events are `USER_PREFERENCES_UPDATED`, one per detached conversation —
 * the event the three clients already decode for this row. Widening
 * `CATEGORY_DELETED` to carry the ids instead would cost a contract change on
 * three strict decoders for something the versioned per-row event already says.
 */
export async function detachConversationsFromCategory(
  fastify: FastifyInstance,
  { userId, categoryId }: DetachConversationsFromCategoryParams
): Promise<string[]> {
  const attached = await fastify.prisma.userConversationPreferences.findMany({
    where: { userId, categoryId },
    select: { conversationId: true },
  });
  if (attached.length === 0) return [];

  const conversationIds = attached.map((row: { conversationId: string }) => row.conversationId);

  await fastify.prisma.userConversationPreferences.updateMany({
    where: { userId, categoryId },
    data: { categoryId: null, version: { increment: 1 } },
  });

  // Pas d'`include: { category: true }` ici, contrairement à
  // `writeConversationPreferences` : après le détachement la catégorie est
  // `null` par construction, et `toPreferencesPayload` ne lit que `categoryId`.
  const rows = await fastify.prisma.userConversationPreferences.findMany({
    where: { userId, conversationId: { in: conversationIds } },
  });

  for (const row of rows as unknown as (ConversationPrefRow & { conversationId: string })[]) {
    const eventPayload: UserPreferencesConversationUpdatedEventData = {
      userId,
      conversationId: row.conversationId,
      version: row.version ?? 0,
      reset: false,
      preferences: toPreferencesPayload(row),
    };
    broadcastToUser(fastify, userId, SERVER_EVENTS.USER_PREFERENCES_UPDATED, eventPayload);
  }

  return conversationIds;
}
