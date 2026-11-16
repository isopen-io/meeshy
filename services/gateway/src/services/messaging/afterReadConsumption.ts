import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { EphemeralRecipientExpiryService } from '../EphemeralRecipientExpiryService';
import { broadcastMessageMutation, type MessageMutationManager } from '../../socketio/broadcastMessageMutation';
import { consumeAfterReadMessages } from './consumeAfterReadMessages';
import { earlyBurnMayReachSender } from './afterReadEarlyBurnGate';
import { claimSenderBurn } from './afterReadSenderBurn';

export type AfterReadAnnouncePrisma = PrismaClient;

export interface ConsumeAfterReadAndAnnounceParams {
  readonly prisma: AfterReadAnnouncePrisma;
  readonly manager: MessageMutationManager | null | undefined;
  readonly conversationId: string;
  /** `Participant.id` du lecteur qui quitte. */
  readonly participantId: string;
  /** La clé de room du lecteur (`User.id`, ou `Participant.id` d'un invité). */
  readonly readerKey: string;
  readonly messageIds: readonly string[];
  readonly now: Date;
  readonly onError?: (error: unknown) => void;
}

/**
 * « Vu puis quitté » (#8302, #18556), en UN site pour les deux portes qui le
 * constatent — la route que le client appelle en sortant, et le serveur qui
 * voit le lecteur partir sans qu'elle ait été appelée.
 *
 * La flamme-œil disparaît chez le lecteur (`expireNow`, sa room personnelle) ;
 * et quand tous les destinataires actifs l'ont vue puis quittée, elle brûle
 * chez l'expéditeur aussi, sur tous ses appareils — la destruction au repos
 * garde, elle, sa grâce. Ce feu est un accusé de lecture : un destinataire qui
 * a coupé les siens le retient, et l'expéditeur garde alors la bulle jusqu'à la
 * destruction.
 *
 * Le feu annoncé est GRAVÉ sur la ligne de l'expéditeur (`claimSenderBurn`) :
 * la gravure est write-once et son gagnant est le seul à annoncer, si bien
 * qu'un rejeu — la route après le départ constaté, ou l'inverse — n'annonce pas
 * deux fois, et qu'une annonce manquée se rattrape au rejeu suivant. Une
 * échéance encore À VENIR (copie bornée dont un décompte court) est gravée sans
 * rien annoncer : le balayage par lecteur l'annoncera à son heure.
 */
export async function consumeAfterReadAndAnnounce(
  params: ConsumeAfterReadAndAnnounceParams,
): Promise<{ consumed: string[] }> {
  const { prisma, manager, conversationId, now, onError } = params;
  const { consumed, entries, seenByAll } = await consumeAfterReadMessages(prisma, {
    conversationId,
    participantId: params.participantId,
    messageIds: params.messageIds,
    now,
  });

  const expiry = new EphemeralRecipientExpiryService(prisma, {
    now: () => now,
    resolveIO: () => manager?.getIO(),
  });
  if (entries.length > 0) await expiry.expireNow(entries);

  for (const flame of seenByAll) {
    const mayBurn = await earlyBurnMayReachSender({
      prisma,
      conversationId,
      senderParticipantId: flame.senderId,
      onError,
    });
    if (!mayBurn) continue;

    const senderEntry = await claimSenderBurn(prisma, {
      messageId: flame.id,
      conversationId,
      senderParticipantId: flame.senderId,
      at: flame.at,
    }).catch((error: unknown) => {
      onError?.(error);
      return null;
    });
    if (!senderEntry || flame.at.getTime() > now.getTime()) continue;

    await expiry.expireNow([senderEntry]);
    await broadcastMessageMutation({
      prisma,
      manager,
      conversationId,
      actorUserId: params.readerKey,
      eventType: 'expired',
      authorId: flame.senderId,
      messageId: flame.id,
      payload: { messageId: flame.id, conversationId },
      onError,
    });
  }

  return { consumed };
}
