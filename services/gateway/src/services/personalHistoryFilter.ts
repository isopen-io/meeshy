/**
 * The read half of the two per-user history-hiding features.
 *
 * The gateway has shipped both write halves for a long time:
 *   - `POST /api/conversations/:id/clear-history` writes
 *     `UserConversationPreferences.clearHistoryBefore` and broadcasts it to the
 *     user's other devices (`conversationPreferencesSync`);
 *   - `DELETE /api/messages/:id/delete-for-me` (and its bulk sibling) writes a
 *     `UserMessageDeletion` row.
 *
 * Nothing read either one back. Every message-serving query filtered on
 * `deletedAt: null` — the delete-for-EVERYONE tombstone — and on nothing else,
 * so "Message deleted from your view" and "Chat history cleared before X" were
 * both answers the API had no way of honouring: the next list, search, thread
 * or delta-sync served the content straight back. `@meeshy/shared` even ships
 * `filterDeletedMessages`/`getDeletedMessageIds` for exactly this, with zero
 * call sites.
 *
 * This module is the one place those two facts become a Prisma filter, so a
 * future read surface has one thing to call rather than two tables to remember.
 *
 * Two invariants the call sites depend on:
 *
 *   1. **It can only ever shrink a result set.** Callers already carry their own
 *      `createdAt` bounds (share-link history cut-off, `before`/`after` cursors)
 *      and, in `around` mode, an explicit `id: { in: [...] }` allowlist. Merging
 *      by spread would silently DROP the caller's bound when both sides set the
 *      same key; `applyPersonalHistoryHiding` merges bound-by-bound instead, and
 *      subtracts from an id allowlist rather than emitting an `in`/`notIn` pair
 *      whose intersection a reader has to compute in their head.
 *
 *   2. **A user with nothing hidden pays nothing.** The returned object is the
 *      caller's own when the hiding is empty, so the query plan of the
 *      overwhelming majority of reads is byte-identical to before.
 *
 * Failure posture: hiding history is a courtesy, showing a conversation is the
 * product. A lookup that throws degrades to `NO_PERSONAL_HIDING` (log + serve)
 * rather than failing the read — the opposite trade-off from an authorization
 * check, and deliberate.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { logger } from '../utils/logger';

export interface PersonalHistoryHiding {
  /** Messages strictly older than this instant are hidden from this user. */
  readonly clearHistoryBefore: Date | null;
  /** Individual messages this user removed from their own view. */
  readonly hiddenMessageIds: readonly string[];
}

export const NO_PERSONAL_HIDING: PersonalHistoryHiding = Object.freeze({
  clearHistoryBefore: null,
  hiddenMessageIds: Object.freeze([]) as readonly string[],
});

export const hidesNothing = (hiding: PersonalHistoryHiding): boolean =>
  hiding.clearHistoryBefore === null && hiding.hiddenMessageIds.length === 0;

type DateBound = { gte?: Date; gt?: Date; lt?: Date; lte?: Date };
type IdBound = { in?: string[]; notIn?: string[] };

const mergeCreatedAtLowerBound = (existing: unknown, cutoff: Date): DateBound => {
  if (existing === null || existing === undefined || typeof existing !== 'object') {
    return { gte: cutoff };
  }

  const bound = { ...(existing as DateBound) };
  // `gt` and `gte` both express a lower bound. Keeping whichever is stricter is
  // what makes this merge unable to widen: a share link that already starts the
  // history at `joinedAt` never loses that bound to a looser personal cut-off.
  const current = bound.gte ?? bound.gt;
  if (current !== undefined && current.getTime() >= cutoff.getTime()) {
    return bound;
  }

  delete bound.gt;
  return { ...bound, gte: cutoff };
};

const mergeIdBound = (existing: unknown, hiddenMessageIds: readonly string[]): IdBound => {
  const hidden = new Set(hiddenMessageIds);

  // `where.id` is a bare string wherever a route addresses ONE message (thread
  // root, single-message fetch). Replacing it with a `notIn` would widen the
  // query from "this message" to "every message but the hidden ones" — the one
  // way this function could ever return MORE rows than it was given. It becomes
  // a one-element allowlist instead, which the subtraction below empties when
  // that very message is the hidden one.
  if (typeof existing === 'string') {
    return { in: hidden.has(existing) ? [] : [existing] };
  }

  if (existing === null || existing === undefined || typeof existing !== 'object') {
    return { notIn: [...hiddenMessageIds] };
  }

  const bound = { ...(existing as IdBound) };

  // An explicit allowlist (`around` mode builds one) is narrowed in place. An
  // `in` alongside a `notIn` would be correct for Prisma but leaves the real
  // result set implicit; subtracting keeps the query self-describing.
  if (Array.isArray(bound.in)) {
    return { ...bound, in: bound.in.filter((id) => !hidden.has(id)) };
  }

  return {
    ...bound,
    notIn: Array.isArray(bound.notIn) ? [...bound.notIn, ...hiddenMessageIds] : [...hiddenMessageIds],
  };
};

/**
 * Merge the hiding into a Prisma `Message` where clause.
 *
 * Returns the input untouched (same reference) when nothing is hidden, and a
 * new object otherwise — the caller's clause is never mutated.
 */
export function applyPersonalHistoryHiding<W extends Record<string, unknown>>(
  where: W,
  hiding: PersonalHistoryHiding
): W {
  if (hidesNothing(hiding)) return where;

  const next: Record<string, unknown> = { ...where };

  if (hiding.clearHistoryBefore !== null) {
    next.createdAt = mergeCreatedAtLowerBound(where.createdAt, hiding.clearHistoryBefore);
  }

  if (hiding.hiddenMessageIds.length > 0) {
    next.id = mergeIdBound(where.id, hiding.hiddenMessageIds);
  }

  return next as W;
}

/**
 * The history cut-off restated as an EXCLUSIVE lower bound, in integer
 * milliseconds — the shape an in-memory counter can merge with a read floor.
 *
 * `applyPersonalHistoryHiding` emits `createdAt: { gte: cutoff }`: a message
 * written at exactly the cut-off is still visible. The unread counters compare
 * `getTime()` values with a strict `>` (the read floor is exclusive:
 * `createdAt > lastRead`), so the two bounds can only be collapsed into a
 * single `Math.max` once they speak the same language. `Date#getTime()` is an
 * integer number of milliseconds, which makes `>= c` exactly `> c − 1` — an
 * equality, not an approximation.
 */
export const exclusiveFloorMsFor = (hiding: PersonalHistoryHiding): number | null =>
  hiding.clearHistoryBefore === null ? null : hiding.clearHistoryBefore.getTime() - 1;

export interface LoadPersonalHistoryHidingParams {
  /** Anonymous callers own neither table — they are served unfiltered. */
  readonly userId: string | undefined | null;
  readonly conversationId: string;
}

export async function loadPersonalHistoryHiding(
  prisma: PrismaClient,
  { userId, conversationId }: LoadPersonalHistoryHidingParams
): Promise<PersonalHistoryHiding> {
  if (!userId) return NO_PERSONAL_HIDING;

  try {
    const [prefs, deletions] = await Promise.all([
      prisma.userConversationPreferences.findFirst({
        where: { userId, conversationId },
        select: { clearHistoryBefore: true },
      }),
      prisma.userMessageDeletion.findMany({
        where: { userId, message: { conversationId } },
        select: { messageId: true },
      }),
    ]);

    const clearHistoryBefore = prefs?.clearHistoryBefore ?? null;
    const hiddenMessageIds = deletions.map((d) => d.messageId);

    if (clearHistoryBefore === null && hiddenMessageIds.length === 0) return NO_PERSONAL_HIDING;

    return { clearHistoryBefore, hiddenMessageIds };
  } catch (error) {
    logger.warn('[personalHistoryFilter] hiding lookup failed, serving unfiltered', {
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NO_PERSONAL_HIDING;
  }
}

export interface LoadPersonalHistoryHidingByUserParams {
  /** Anonymous participants own neither table; `null`/`undefined` entries are dropped. */
  readonly userIds: ReadonlyArray<string | null | undefined>;
  readonly conversationId: string;
}

/**
 * Batched sibling for the surfaces that read ONE conversation on behalf of MANY
 * users at once — the unread fan-out, which recomputes every recipient's badge
 * on every committed message.
 *
 * Mirror image of `loadPersonalHistoryHidingByConversation` (one user, many
 * conversations); same contract, same failure posture, and same absence
 * convention: a user who hides nothing is absent from the map, so the read is
 * `map.get(userId) ?? NO_PERSONAL_HIDING`.
 *
 * A conversation whose participants are ALL anonymous — the normal shape behind
 * a share link — issues no query at all.
 */
export async function loadPersonalHistoryHidingByUser(
  prisma: PrismaClient,
  { userIds, conversationId }: LoadPersonalHistoryHidingByUserParams
): Promise<Map<string, PersonalHistoryHiding>> {
  const result = new Map<string, PersonalHistoryHiding>();
  const ids = [...new Set(userIds.filter((id): id is string => typeof id === 'string' && id.length > 0))];
  if (ids.length === 0) return result;

  try {
    const [prefs, deletions] = await Promise.all([
      prisma.userConversationPreferences.findMany({
        where: { conversationId, userId: { in: ids }, clearHistoryBefore: { not: null } },
        select: { userId: true, clearHistoryBefore: true },
      }),
      prisma.userMessageDeletion.findMany({
        where: { userId: { in: ids }, message: { conversationId } },
        select: { userId: true, messageId: true },
      }),
    ]);

    const cutoffs = new Map<string, Date>();
    for (const row of prefs) {
      if (row.clearHistoryBefore) cutoffs.set(row.userId, row.clearHistoryBefore);
    }

    const hidden = new Map<string, string[]>();
    for (const row of deletions) {
      const bucket = hidden.get(row.userId);
      if (bucket) bucket.push(row.messageId);
      else hidden.set(row.userId, [row.messageId]);
    }

    for (const userId of new Set([...cutoffs.keys(), ...hidden.keys()])) {
      result.set(userId, {
        clearHistoryBefore: cutoffs.get(userId) ?? null,
        hiddenMessageIds: hidden.get(userId) ?? [],
      });
    }

    return result;
  } catch (error) {
    logger.warn('[personalHistoryFilter] per-user hiding lookup failed, serving unfiltered', {
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return new Map();
  }
}

export interface LoadPersonalHistoryHidingByConversationParams {
  readonly userId: string | undefined | null;
  readonly conversationIds: readonly string[];
}

/**
 * Batched sibling for the surfaces that read across many conversations at once
 * (conversation list preview, delta sync). Conversations that hide nothing are
 * absent from the map, so `map.get(id) ?? NO_PERSONAL_HIDING` is the read.
 */
export async function loadPersonalHistoryHidingByConversation(
  prisma: PrismaClient,
  { userId, conversationIds }: LoadPersonalHistoryHidingByConversationParams
): Promise<Map<string, PersonalHistoryHiding>> {
  const result = new Map<string, PersonalHistoryHiding>();
  if (!userId || conversationIds.length === 0) return result;

  try {
    const ids = [...conversationIds];
    const [prefs, deletions] = await Promise.all([
      prisma.userConversationPreferences.findMany({
        where: { userId, conversationId: { in: ids }, clearHistoryBefore: { not: null } },
        select: { conversationId: true, clearHistoryBefore: true },
      }),
      prisma.userMessageDeletion.findMany({
        where: { userId, message: { conversationId: { in: ids } } },
        select: { messageId: true, message: { select: { conversationId: true } } },
      }),
    ]);

    const cutoffs = new Map<string, Date>();
    for (const row of prefs) {
      if (row.clearHistoryBefore) cutoffs.set(row.conversationId, row.clearHistoryBefore);
    }

    const hidden = new Map<string, string[]>();
    for (const row of deletions) {
      const conversationId = row.message?.conversationId;
      if (!conversationId) continue;
      const bucket = hidden.get(conversationId);
      if (bucket) bucket.push(row.messageId);
      else hidden.set(conversationId, [row.messageId]);
    }

    for (const conversationId of new Set([...cutoffs.keys(), ...hidden.keys()])) {
      result.set(conversationId, {
        clearHistoryBefore: cutoffs.get(conversationId) ?? null,
        hiddenMessageIds: hidden.get(conversationId) ?? [],
      });
    }

    return result;
  } catch (error) {
    logger.warn('[personalHistoryFilter] batched hiding lookup failed, serving unfiltered', {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Map();
  }
}
