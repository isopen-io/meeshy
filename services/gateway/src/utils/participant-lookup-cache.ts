/**
 * Short-lived in-process memoization of the (participantId, conversationId) →
 * Participant lookup performed on every message send (MessagingService
 * `messaging.participantLookup` step). Cuts the per-message DB round-trip for
 * the common case of an active participant sending several messages in a row.
 *
 * TTL-bounded rather than strictly invalidated everywhere a Participant could
 * change, because most mutation sites (leave/ban/kick/delete-for-me) already
 * call `invalidateParticipantLookup` explicitly — the TTL is a bounded
 * fallback for any path that doesn't.
 *
 * The TTL alone does NOT reclaim memory: an entry is only deleted lazily on a
 * later `get` of the same key, so a (participant, conversation) pair that sends
 * a few messages then goes quiet leaves an expired entry in the Map for the
 * life of the process. Since this is populated on the hottest write path (every
 * message send), the Map is size-bounded (FIFO, expired-first eviction on
 * overflow) — mirroring the bounds already applied to the sibling identity /
 * conversationId caches.
 */

export type CachedParticipant = {
  id: string;
  conversationId: string;
  isActive: boolean;
};

type Entry = { participant: CachedParticipant; expiresAt: number };

const TTL_MS = 30_000;
export const PARTICIPANT_LOOKUP_CACHE_MAX = 5000;
const cache = new Map<string, Entry>();

function cacheKey(participantId: string, conversationId: string): string {
  return `${participantId}:${conversationId}`;
}

function evictForInsert(key: string, now: number): void {
  if (cache.has(key) || cache.size < PARTICIPANT_LOOKUP_CACHE_MAX) return;
  // At capacity with a new key: reclaim expired entries first (the common case —
  // the TTL is short), then FIFO-evict the oldest if still full. Kept off the
  // normal path: this only runs once the cache reaches the cap.
  for (const [entryKey, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(entryKey);
  }
  while (cache.size >= PARTICIPANT_LOOKUP_CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey === undefined) break;
    cache.delete(firstKey);
  }
}

export function getCachedParticipant(
  participantId: string,
  conversationId: string
): CachedParticipant | undefined {
  const key = cacheKey(participantId, conversationId);
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.participant;
}

export function cacheParticipant(
  participantId: string,
  conversationId: string,
  participant: CachedParticipant
): void {
  const now = Date.now();
  const key = cacheKey(participantId, conversationId);
  evictForInsert(key, now);
  cache.set(key, { participant, expiresAt: now + TTL_MS });
}

export function invalidateParticipantLookup(participantId: string, conversationId: string): void {
  cache.delete(cacheKey(participantId, conversationId));
}

export function resetParticipantLookupCache(): void {
  cache.clear();
}
