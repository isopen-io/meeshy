import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { EphemeralRecipientExpiryService } from '../EphemeralRecipientExpiryService';
import { broadcastMessageMutation, type MessageMutationManager } from '../../socketio/broadcastMessageMutation';
import { consumeAfterReadMessages } from './consumeAfterReadMessages';
import { earlyBurnMayReachSender } from './afterReadEarlyBurnGate';

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
 * et quand il était le DERNIER destinataire actif à l'avoir vue, elle brûle
 * aussitôt chez tous ceux qui l'ont à l'écran, expéditeur compris, sur tous
 * leurs appareils — la destruction au repos garde, elle, sa grâce. Ce feu est
 * un accusé de lecture : un destinataire qui a coupé les siens le retient.
 */
export async function consumeAfterReadAndAnnounce(
  params: ConsumeAfterReadAndAnnounceParams,
): Promise<{ consumed: string[] }> {
  const { prisma, manager, conversationId, now, onError } = params;
  const { consumed, entries, fullyConsumed } = await consumeAfterReadMessages(prisma, {
    conversationId,
    participantId: params.participantId,
    messageIds: params.messageIds,
    now,
  });

  if (entries.length > 0) {
    const expiry = new EphemeralRecipientExpiryService(prisma, {
      now: () => now,
      resolveIO: () => manager?.getIO(),
    });
    await expiry.expireNow(entries);
  }

  for (const burnt of fullyConsumed) {
    const mayBurn = await earlyBurnMayReachSender({
      prisma,
      conversationId,
      senderParticipantId: burnt.senderId,
      onError,
    });
    if (!mayBurn) continue;
    await broadcastMessageMutation({
      prisma,
      manager,
      conversationId,
      actorUserId: params.readerKey,
      eventType: 'expired',
      authorId: burnt.senderId,
      messageId: burnt.id,
      payload: { messageId: burnt.id, conversationId },
      onError,
    });
  }

  return { consumed };
}
