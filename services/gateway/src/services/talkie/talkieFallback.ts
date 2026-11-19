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
import { listRankFromColumns } from '@meeshy/shared/utils/conversation-list-rank';
import { SERVER_BLIND_REGIME_FILTER } from '../conversations/encryptionRegime';
import { unsetOrNull } from '../../utils/prisma-unset';

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
  // #19803 — `deletedAt` se LIT en disant l'absence. Aucun des onze chemins de
  // création de `Conversation` ne l'écrit (seuls l'obsolescence et
  // `MessageTranslationService` la posent), donc `{ deletedAt: null }` — une
  // ÉGALITÉ sous MongoDB — n'appariait AUCUNE conversation : **ce repli ne
  // rendait jamais rien, pour aucune paire.** La décision « lecture plutôt
  // qu'écriture » n'est pas nouvelle : la jumelle `directPair.ts` pose la même
  // question sur la même table et l'a tranchée ainsi (#14643), et 100 % des
  // lignes en base sont dans l'état « clé absente » — écrire à la création n'en
  // rattraperait aucune.
  const candidates = await prisma.conversation.findMany({
    where: {
      id: { in: shared.map((p) => p.conversationId) },
      isActive: true,
      type: { in: PRIVATE_TYPES },
      NOT: SERVER_BLIND_REGIME_FILTER,
      ...unsetOrNull('deletedAt'),
    },
    select: { id: true, lastMessageAt: true, lastActivityAt: true },
  });
  // #19834 — « la PLUS RÉCENTE » est le RANG, pas le dernier message. Depuis
  // #9026 le rang d'une ligne est max(`lastMessageAt`, `lastActivityAt`), et les
  // clients élisent la destination de la copie vocale sur `listRankAt` servi
  // (`pickTalkieCopyDestination`, web ; `TalkieVoiceCopySender`, Android). Trier
  // ici sur `lastMessageAt` seul nommait donc une AUTRE conversation dès qu'une
  // réaction, un appel ou une épingle en avait remonté une — divergence restée
  // indétectable tant que le filtre ci-dessus n'appariait rien, et atteignable
  // depuis que #19800 a rendu `lastActivityAt` vivante.
  //
  // Le `max` de deux colonnes ne s'écrit pas en `orderBy` Prisma — c'est l'objet
  // des deux flux de `routes/conversations/utils/list-rank.ts`. Ici la machinerie
  // est inutile : l'ensemble candidat est DÉJÀ borné par les conversations
  // partagées de la paire, donc le rang se calcule sur place, par la règle
  // partagée et non par une seconde copie d'elle.
  const rank = (row: { readonly lastMessageAt?: Date | null; readonly lastActivityAt?: Date | null }): number =>
    listRankFromColumns(row)?.getTime() ?? Number.NEGATIVE_INFINITY;
  const latest = candidates.reduce<(typeof candidates)[number] | null>(
    (best, row) => (best === null || rank(row) > rank(best) ? row : best),
    null,
  );
  return latest?.id ?? null;
}
