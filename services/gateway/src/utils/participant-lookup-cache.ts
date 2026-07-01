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
 */

export type CachedParticipant = {
  id: string;
  conversationId: string;
  isActive: boolean;
};

type Entry = { participant: CachedParticipant; expiresAt: number };

const TTL_MS = 30_000;
const cache = new Map<string, Entry>();

function cacheKey(participantId: string, conversationId: string): string {
  return `${participantId}:${conversationId}`;
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
  cache.set(cacheKey(participantId, conversationId), {
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
