/**
 * Direct-message block cache key.
 *
 * `_isDirectMessageBlocked` (MessageHandler) caches the bidirectional block
 * result under a SYMMETRIC key so either party's send warms the entry the other
 * party's send reads. Because it is symmetric, invalidating the single key on a
 * block/unblock clears the gate for BOTH directions.
 *
 * Single source of truth for the key format: the send-gate reader and the
 * block/unblock mutation routes MUST derive the key from here so the cache can
 * never be written under one shape and invalidated under another.
 */
export const BLOCK_CACHE_PREFIX = 'blocks:';

export const BLOCK_CACHE_TTL_SECONDS = 300;

export function blockCacheKey(userA: string, userB: string): string {
  const [a, b] = [userA, userB].sort();
  return `${BLOCK_CACHE_PREFIX}${a}:${b}`;
}
