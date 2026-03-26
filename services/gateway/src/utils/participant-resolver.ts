import type { PrismaClient } from '@meeshy/shared/prisma/client';

export async function resolveParticipantId(
  prisma: PrismaClient,
  userId: string,
  conversationId: string
): Promise<string | null> {
  const participant = await prisma.participant.findFirst({
    where: { userId, conversationId, isActive: true },
    select: { id: true }
  });
  return participant?.id ?? null;
}

export async function resolveSenderUserId(
  prisma: PrismaClient,
  senderId: string
): Promise<string | null> {
  const participant = await prisma.participant.findUnique({
    where: { id: senderId },
    select: { userId: true }
  });
  return participant?.userId ?? null;
}
