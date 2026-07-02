import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { BoundedTtlCache } from './bounded-cache.js';

// Cache immutable identifier → ObjectId (populated on first lookup). Bounded to
// CONVERSATION_ID_CACHE_MAX entries (FIFO eviction) — resolveConversationId is
// called on every conversation REST route (messages, participants, sharing,
// threads, stats, …) and the message-send validator, so an unbounded map would
// grow for the life of the gateway process across every distinct conversation
// identifier ever resolved. Mirrors the bound already applied to the sibling
// caches in socket-helpers.ts and MeeshySocketIOManager.
export const CONVERSATION_ID_CACHE_MAX = 2000;
const cache = new BoundedTtlCache<string, string>({ maxSize: CONVERSATION_ID_CACHE_MAX });
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export async function resolveConversationId(
  prisma: PrismaClient,
  identifier: string
): Promise<string | null> {
  if (OBJECT_ID_REGEX.test(identifier)) return identifier;
  const cached = cache.get(identifier);
  if (cached) return cached;
  const conversation = await prisma.conversation.findFirst({
    where: { identifier },
    select: { id: true }
  });
  if (conversation) {
    cache.set(identifier, conversation.id);
    return conversation.id;
  }
  return null;
}
