/**
 * Short-lived in-process memoization of the (participantId, conversationId) →
 * Participant lookup performed on every message send (MessagingService
 * `messaging.participantLookup` step). Cuts the per-message DB round-trip for
 * the common case of an active participant sending several messages in a row.
 *
 * TTL-bounded rather than strictly invalidated everywhere a Participant could
 * change, because most mutation sites (leave/ban/unban/kick/delete-for-me)
 * already call `invalidateParticipantLookup` explicitly — the TTL is a bounded
 * fallback for any path that doesn't. Size + TTL bounding is delegated to the
 * shared `BoundedTtlCache` idiom (see conversation-id-cache / StatusHandler).
 *
 * `unban` manquait à cette liste et ne l'appelait pas : pendant les 30 s
 * suivantes, la personne réintégrée restait `isActive: false` pour le chemin
 * d'envoi, et chacun de ses messages était refusé sans qu'aucune ligne en base
 * ne le justifie. Le fallback TTL borne ce genre d'oubli, il ne le rattrape
 * pas — une demi-minute est très au-delà du délai où quelqu'un qu'on vient de
 * débannir essaie d'écrire.
 */

import { BoundedTtlCache } from './bounded-cache.js';
import type { ParticipantPermissions, AnonymousRightsOverride } from '@meeshy/shared/prisma/client';

export type CachedParticipant = {
  id: string;
  conversationId: string;
  isActive: boolean;
  /**
   * L'instantané figé au join — porté depuis #4855 pour que
   * `MessagingService.handleMessage` puisse résoudre `canSendMessages` sans
   * lecture Prisma supplémentaire. `PATCH …/participants/:id/rights` doit
   * invalider cette entrée (voir son appelant) : sans quoi une révocation ne
   * prend effet qu'au bout du TTL.
   */
  permissions: ParticipantPermissions;
  anonymousSession: { rights: AnonymousRightsOverride | null } | null;
};

const TTL_MS = 30_000;
export const PARTICIPANT_LOOKUP_CACHE_MAX = 5_000;
const cache = new BoundedTtlCache<string, CachedParticipant>({
  maxSize: PARTICIPANT_LOOKUP_CACHE_MAX,
  ttlMs: TTL_MS
});

function cacheKey(participantId: string, conversationId: string): string {
  return `${participantId}:${conversationId}`;
}

export function getCachedParticipant(
  participantId: string,
  conversationId: string
): CachedParticipant | undefined {
  return cache.get(cacheKey(participantId, conversationId));
}

export function cacheParticipant(
  participantId: string,
  conversationId: string,
  participant: CachedParticipant
): void {
  cache.set(cacheKey(participantId, conversationId), participant);
}

export function invalidateParticipantLookup(participantId: string, conversationId: string): void {
  cache.delete(cacheKey(participantId, conversationId));
}

export function resetParticipantLookupCache(): void {
  cache.clear();
}
