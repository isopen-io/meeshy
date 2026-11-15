/**
 * La remise d'un avis de capture (#9629 b, #9630) — jamais à la room.
 *
 * `MeeshySocketIOManager.broadcastMessage` émet `message:new` à
 * `ROOMS.conversation(id)`, pousse `conversation:updated` à chaque participant
 * et recompte le non-lu de toute la salle : exactement les trois sorties qu'un
 * avis de capture ne doit pas prendre. Il dit qu'un message existe et à quelle
 * heure il a été envoyé ; il ne part donc qu'à son AUDIENCE, calculée par
 * `captureNoticeAudience`, chacun sur sa room PERSONNELLE (`userId ?? id`).
 *
 * | sortie | ici |
 * |---|---|
 * | `message:new` | room personnelle de chaque destinataire |
 * | `conversation:updated` | aucune — la ligne est silencieuse |
 * | non-lu | l'auteur du message capturé seul |
 * | file hors ligne | aucune — au retour, la page et `/sync` servent l'avis filtré |
 *
 * La file hors ligne ne le porte pas, et c'est une décision : elle rejoue à la
 * reconnexion ce que chaque client recharge de toute façon, et le transport
 * REST n'y a pas accès. Un même avis par deux chemins (rejoué, puis rechargé)
 * n'apporterait rien ; un chemin de plus à filtrer, si.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Message } from '@meeshy/shared/types/index';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

import type { CaptureNoticeDeliver } from '../services/messaging/contentCaptureNotices';
import { MessageReadStatusService } from '../services/MessageReadStatusService';
import { enhancedLogger } from '../utils/logger-enhanced';
import { participantUserRoomTargets } from './emitToConversationParticipants';
import {
  emitUnreadCountsToRecipients,
  type UnreadBridgeBuilder,
  type UnreadCountReader,
} from './emitUnreadCountsToRecipients';
import { buildMessageNewPayload } from './messageNewPayload';
import type { ServerEmitIO } from './serverEmit';
import { stripClientMessageId } from './utils/message-ack-shaping';

const logger = enhancedLogger.child({ module: 'CaptureNoticeDelivery' });

export type CaptureNoticeDeliveryContext = {
  readonly io: ServerEmitIO;
  readonly prisma: PrismaClient;
  readonly readStatusService: UnreadCountReader;
  readonly bridgeService?: UnreadBridgeBuilder;
};

function noticePayload(message: Message, conversationId: string) {
  return stripClientMessageId({
    ...buildMessageNewPayload(message, { conversationId, translations: [], attachments: [], replyTo: undefined }),
    originalContent: message.content,
    metadata: message.metadata || undefined,
  });
}

export function captureNoticeDelivery(ctx: CaptureNoticeDeliveryContext): CaptureNoticeDeliver {
  return async ({ message, conversationId, recipients, unreadRecipients }) => {
    const notice = message as Message;
    const payload = noticePayload(notice, conversationId);
    for (const { room } of participantUserRoomTargets(recipients)) {
      ctx.io.to(room).emit(SERVER_EVENTS.MESSAGE_NEW, payload);
    }
    if (unreadRecipients.length === 0) return;
    await emitUnreadCountsToRecipients({
      io: ctx.io,
      prisma: ctx.prisma,
      readStatusService: ctx.readStatusService,
      bridgeService: ctx.bridgeService,
      conversationId,
      senderId: notice.senderId,
      participants: unreadRecipients,
      onError: (error) => logger.warn('capture notice unread count failed', { conversationId, error }),
    });
  };
}

type SocketGateway = {
  getManager(): { getIO(): ServerEmitIO } | null | undefined;
} | null | undefined;

/** Le transport REST : le serveur Socket.IO du manager, quand l'instance en a un. */
export function captureNoticeDeliveryThrough(gateway: SocketGateway, prisma: PrismaClient): CaptureNoticeDeliver {
  return async (delivery) => {
    const io = gateway?.getManager()?.getIO();
    if (!io) return;
    await captureNoticeDelivery({ io, prisma, readStatusService: new MessageReadStatusService(prisma) })(delivery);
  };
}
