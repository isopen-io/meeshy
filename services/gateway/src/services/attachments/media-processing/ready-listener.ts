/**
 * Le câblage de `handleMediaJobCompleted` dans la passerelle (#11264) : écoute
 * des fins de tâches de la file (`QueueEvents`, porté par Redis), relecture de
 * la ligne par la forme du canal socket, émissions. Démarré seulement quand la
 * file est allumée (`MEDIA_QUEUE=bullmq`).
 */
import { QueueEvents } from 'bullmq';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { attachmentSocketSelect } from '../attachmentIncludes';
import { emitAttachmentUpdated } from '../../../socketio/emitAttachmentUpdated';
import { serializeAttachmentForSocket, type SocketAttachmentRow } from '../../../socketio/serializeAttachmentForSocket';
import type { ConversationRoomEmitter } from '../../../socketio/emitToConversationParticipants';
import type { OfflineParticipantQueueDeps } from '../../../socketio/offlineParticipantQueue';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { enhancedLogger } from '../../../utils/logger-enhanced.js';
import { MEDIA_QUEUE_NAME } from './jobs';
import { mediaQueueConnection } from './queue';
import { handleMediaJobCompleted, type MediaReadyPorts } from './ready-notifier';
import type { MediaJobOutcome } from './process-job';

const logger = enhancedLogger.child({ module: 'media-ready-listener' });

const POST_MEDIA_READY_SELECT = {
  id: true, uploaderId: true, processingState: true, thumbnailUrl: true, thumbHash: true, imageVariants: true, avifVariants: true, renditions: true,
} as const;

export type MediaReadyListenerDeps = {
  readonly prisma: PrismaClient;
  readonly io: ConversationRoomEmitter & { to(room: string): { emit(event: string, payload: unknown): unknown } };
  readonly deliveryQueue: OfflineParticipantQueueDeps['deliveryQueue'];
  readonly connectedUsers: () => { has(key: string): boolean };
};

export function mediaReadyPorts(deps: MediaReadyListenerDeps): MediaReadyPorts {
  return {
    loadMessageAttachment: async (id) => {
      const row = await deps.prisma.messageAttachment.findUnique({
        where: { id },
        select: { ...attachmentSocketSelect, processingState: true, message: { select: { conversationId: true } } },
      });
      return row as never;
    },
    loadPostMedia: async (id) => deps.prisma.postMedia.findUnique({ where: { id }, select: POST_MEDIA_READY_SELECT }) as never,
    emitAttachmentUpdated: async ({ conversationId, messageId, attachment }) =>
      emitAttachmentUpdated({
        io: deps.io,
        prisma: deps.prisma,
        deliveryQueue: deps.deliveryQueue,
        connectedUsers: deps.connectedUsers(),
        conversationId,
        messageId,
        attachment: attachment as unknown as SocketAttachmentRow,
      }),
    emitToUser: (userId, event, payload) => {
      deps.io.to(ROOMS.user(userId)).emit(event, payload);
    },
    serialize: (row) => ('uploaderId' in row ? row : serializeAttachmentForSocket(row as unknown as SocketAttachmentRow)),
  };
}

export function startMediaReadyListener(deps: MediaReadyListenerDeps, redisUrl: string): { close(): Promise<void> } {
  const events = new QueueEvents(MEDIA_QUEUE_NAME, { connection: mediaQueueConnection(redisUrl) });
  const ports = mediaReadyPorts(deps);
  events.on('completed', ({ returnvalue }) => {
    const outcome = (typeof returnvalue === 'string' ? JSON.parse(returnvalue) : returnvalue) as MediaJobOutcome;
    handleMediaJobCompleted(ports, outcome).catch((error: unknown) => logger.error('media ready notification failed', error as Error));
  });
  events.on('error', (error) => logger.error('QueueEvents error', error));
  logger.info('Écoute des médias prêts démarrée', { queue: MEDIA_QUEUE_NAME });
  return { close: () => events.close() };
}
