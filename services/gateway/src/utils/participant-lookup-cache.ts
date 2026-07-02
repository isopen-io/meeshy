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
 * The TTL protects freshness but not memory: a lazily-checked `expiresAt` only
 * evicts a key when the SAME key is read again after expiry, so a participant
 * who sends one message then never returns leaves a cold entry forever. A
 * size-triggered sweep (drop expired entries first, then FIFO-evict the oldest)
 * caps the map — same idiom as `StatusHandler._cacheIdentity` and
 * `conversation-id-cache`.
 */

export type CachedParticipant = {
  id: string;
  conversationId: string;
  isActive: boolean;
};

type Entry = { participant: CachedParticipant; expiresAt: number };

const TTL_MS = 30_000;
export const PARTICIPANT_LOOKUP_CACHE_MAX = 5_000;
const cache = new Map<string, Entry>();

function cacheKey(participantId: string, conversationId: string): string {
  return `${participantId}:${conversationId}`;
}

function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
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
  const key = cacheKey(participantId, conversationId);
  if (!cache.has(key) && cache.size >= PARTICIPANT_LOOKUP_CACHE_MAX) {
    evictExpired();
    if (cache.size >= PARTICIPANT_LOOKUP_CACHE_MAX) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) cache.delete(oldestKey);
    }
  }
  cache.set(key, {
    participant,
    expiresAt: Date.now() + TTL_MS
  });
}

export function invalidateParticipantLookup(participantId: string, conversationId: string): void {
  cache.delete(cacheKey(participantId, conversationId));
}

export function resetParticipantLookupCache(): void {
  cache.clear();
}
