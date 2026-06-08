import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { LruMap } from './lru-map';

const cache = new LruMap<string, string>(5_000);
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
