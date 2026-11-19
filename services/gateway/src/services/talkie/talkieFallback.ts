/**
 * Où part la copie vocale d'un talkie qui ne passe pas (#17141, précision du porteur du
 * 2026-11-08) : dans la conversation la PLUS RÉCENTE que l'émetteur partage avec le
 * destinataire — pas forcément la directe.
 *
 * **« La plus récente » est le RANG, pas le dernier message** (#19834, tranché par
 * #19835 le 2026-11-19). Les TROIS clients qui replient cette décision quand le
 * serveur ne la nomme pas la lisaient DÉJÀ ainsi — `listRankAt ?? lastMessageAt ??
 * updatedAt` sur le web (`apps/web/src/lib/talkie/talkie-voice-copy.ts`), sur iOS
 * (`apps/ios/Meeshy/Features/Talkie/TalkieVoiceCopy.swift`) et sur Android
 * (`TalkieVoiceCopySender.kt`) — et #9026 (directive porteur du 2026-10-01) définit
 * « récent » comme max(`lastMessageAt`, `lastActivityAt`) pour toute la liste. Des
 * quatre sites, le serveur était le SEUL à trier sur le dernier message : sur les
 * MÊMES données, la copie n'atterrissait pas au même endroit selon le chemin
 * emprunté. Les quatre disent désormais la même chose, et c'est le serveur qui a
 * bougé. C'est le CLIENT émetteur qui crée cette copie,
 * avec l'audio qu'il a enregistré : le serveur ne garde rien d'une voix refusée. Il lui
 * dit seulement où l'envoyer (`TalkieStartAck.conversationId`). L'émetteur est membre
 * actif de la conversation rendue : rien ne lui est appris qu'il ne voie déjà. Seuls les
 * échanges privés (direct, groupe) que le serveur lit sont candidats : une copie n'atterrit
 * ni dans une communauté, ni dans une conversation chiffrée où le clair serait refusé.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_BLIND_REGIME_FILTER } from '../conversations/encryptionRegime';
import { RANK_SELECT, highestRankedConversation } from '../conversations/highestRanked';

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
  const where = { id: { in: shared.map((p) => p.conversationId) }, isActive: true, deletedAt: null, type: { in: PRIVATE_TYPES }, NOT: SERVER_BLIND_REGIME_FILTER };
  const latest = await highestRankedConversation((stream) =>
    prisma.conversation.findFirst({ where: { ...where, ...stream.where }, orderBy: stream.orderBy, select: RANK_SELECT }),
  );
  return latest?.id ?? null;
}
