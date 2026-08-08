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
 */

import type { FastifyInstance } from 'fastify';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type {
  ConversationPreferencesPayload,
  UserPreferencesConversationUpdatedEventData,
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
  readonly deletedForUserAt?: Date | null;
  readonly clearHistoryBefore?: Date | null;
}

export interface WriteConversationPreferencesParams {
  readonly userId: string;
  readonly conversationId: string;
  readonly data: ConversationPreferencesWrite;
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
 */
export async function writeConversationPreferences(
  fastify: FastifyInstance,
  { userId, conversationId, data }: WriteConversationPreferencesParams
) {
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
