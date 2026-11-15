/**
 * Où part la copie vocale d'un talkie qui ne passe pas (#17141, précision du porteur du
 * 2026-11-08) : dans la conversation la PLUS RÉCENTE que l'émetteur partage avec le
 * destinataire — pas forcément la directe. C'est le CLIENT émetteur qui crée cette copie,
 * avec l'audio qu'il a enregistré : le serveur ne garde rien d'une voix refusée. Il lui
 * dit seulement où l'envoyer (`TalkieStartAck.conversationId`). L'émetteur est membre
 * actif de la conversation rendue : rien ne lui est appris qu'il ne voie déjà. Seuls les
 * échanges privés (direct, groupe) que le serveur lit sont candidats : une copie n'atterrit
 * ni dans une communauté, ni dans une conversation chiffrée où le clair serait refusé.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_BLIND_REGIME_FILTER } from '../conversations/encryptionRegime';

/** Une copie privée ne part que dans un échange privé : jamais une communauté, une diffusion ou un fil public. */
const PRIVATE_TYPES = ['direct', 'group'];

export async function mostRecentSharedConversation(
  prisma: Pick<PrismaClient, 'participant' | 'conversation'>,
  fromUserId: string,
  toUserId: string,
): Promise<string | null> {
  const mine = await prisma.participant.findMany({ where: { userId: fromUserId, isActive: true }, select: { conversationId: true } });
  if (mine.length === 0) return null;
  const shared = await prisma.participant.findMany({
    where: { userId: toUserId, isActive: true, conversationId: { in: mine.map((p) => p.conversationId) } },
    select: { conversationId: true },
  });
  if (shared.length === 0) return null;
  const latest = await prisma.conversation.findFirst({
    where: { id: { in: shared.map((p) => p.conversationId) }, isActive: true, deletedAt: null, type: { in: PRIVATE_TYPES }, NOT: SERVER_BLIND_REGIME_FILTER },
    orderBy: { lastMessageAt: 'desc' },
    select: { id: true },
  });
  return latest?.id ?? null;
}
