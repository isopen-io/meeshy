/**
 * Pure helper — converts a post's embedded JSON reactions array into
 * PostReaction insert rows.
 *
 * Extracted from migrate-post-reactions.ts so it can be unit-tested
 * independently of the Prisma client and I/O.
 *
 * Decision on intra-post duplicates:
 *   A post's `reactions` Json[] *could* theoretically contain duplicate
 *   (userId, emoji) pairs if a bug wrote them twice. We return ALL rows as-is
 *   rather than pre-deduplicating, because the DB @@unique([postId, userId, emoji])
 *   constraint will reject the second one via P2002. This keeps the function
 *   simple and correct — the caller is already handling P2002 gracefully.
 */

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export type ReactionRow = {
  readonly postId: string;
  readonly userId: string;
  readonly emoji: string;
  readonly createdAt: Date | undefined;
};

/**
 * A single entry from the embedded `Post.reactions: Json[]` field.
 * We cast the raw Json value to this shape and validate each field at runtime.
 */
type RawEmbeddedReaction = {
  userId?: unknown;
  emoji?: unknown;
  createdAt?: unknown;
};

/**
 * Convert embedded reaction entries for a single post into insert rows.
 *
 * Filters out:
 * - entries where `userId` is not a string
 * - entries where `userId` does not match a MongoDB ObjectId (24-char hex)
 * - entries where `emoji` is not a non-empty string
 *
 * Returns `{ rows, malformedCount }` so the caller can aggregate warnings.
 */
export function embeddedReactionsToRows(
  postId: string,
  rawReactions: unknown,
): { rows: readonly ReactionRow[]; malformedCount: number } {
  if (!Array.isArray(rawReactions) || rawReactions.length === 0) {
    return { rows: [], malformedCount: 0 };
  }

  const rows: ReactionRow[] = [];
  let malformedCount = 0;

  for (const raw of rawReactions as RawEmbeddedReaction[]) {
    if (
      typeof raw?.userId !== 'string' ||
      !OBJECT_ID_REGEX.test(raw.userId) ||
      typeof raw?.emoji !== 'string' ||
      raw.emoji.trim().length === 0
    ) {
      malformedCount += 1;
      continue;
    }

    const createdAt =
      typeof raw.createdAt === 'string' || raw.createdAt instanceof Date
        ? new Date(raw.createdAt as string)
        : undefined;

    rows.push({
      postId,
      userId: raw.userId,
      emoji: raw.emoji,
      createdAt: createdAt instanceof Date && !isNaN(createdAt.getTime())
        ? createdAt
        : undefined,
    });
  }

  return { rows, malformedCount };
}
