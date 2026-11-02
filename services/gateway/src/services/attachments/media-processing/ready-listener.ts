/**
 * Le câblage de `handleMediaReady` dans la passerelle (#11264) : écoute des
 * événements de la file (`QueueEvents`, porté par Redis), relecture des lignes
 * par la forme du canal socket, émissions. Démarré seulement quand la file est
 * allumée (`MEDIA_QUEUE=bullmq`), et une seule instance émet (`listenerLease`).
 */
import { randomUUID } from 'crypto';
import { QueueEvents } from 'bullmq';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { attachmentSocketSelect } from '../attachmentIncludes';
import { MESSAGE_SIDE_PROTECTION_SELECT } from '../mediaSideContent';
import { emitAttachmentUpdated } from '../../../socketio/emitAttachmentUpdated';
import { serializeAttachmentForSocket, type SocketAttachmentRow } from '../../../socketio/serializeAttachmentForSocket';
import type { ConversationRoomEmitter } from '../../../socketio/emitToConversationParticipants';
import type { ServerEmitIO } from '../../../socketio/serverEmit';
import type { OfflineParticipantQueueDeps } from '../../../socketio/offlineParticipantQueue';
import type { SocialEventsHandler } from '../../../socketio/handlers/SocialEventsHandler';
import { postInclude, NOT_DELETED } from '../../posts/postIncludes';
import { withMentions } from '../../posts/postReferences';
import { WIRE_BROADCAST } from '../../posts/storyEffectsV3';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import { enhancedLogger } from '../../../utils/logger-enhanced.js';
import { MEDIA_QUEUE_NAME, mediaJobRef } from './jobs';
import { mediaQueueConnection } from './queue';
import { handleMediaReady, readMediaReadyNotice, type MediaReadyNotice, type MediaReadyPorts } from './ready-notifier';
import { listenerLease, type LeaseClient } from './listener-lease';
import { processAtRestFileAccess } from '../atRest/atRestFiles';
import { sealAttachmentIfAtRest } from '../atRest/sealAttachmentFiles';
import { gatewaySealDeps } from '../../messaging/sealMessageAttachments';

const logger = enhancedLogger.child({ module: 'media-ready-listener' });

const POST_MEDIA_READY_SELECT = {
  id: true, uploaderId: true, postId: true, processingState: true, thumbnailUrl: true, thumbHash: true, imageVariants: true, avifVariants: true, renditions: true,
} as const;

type BroadcastPost = Parameters<SocialEventsHandler['broadcastPostUpdated']>[0];

export type MediaReadyListenerDeps = {
  readonly prisma: PrismaClient;
  readonly io: ConversationRoomEmitter & ServerEmitIO;
  readonly deliveryQueue: OfflineParticipantQueueDeps['deliveryQueue'];
  readonly connectedUsers: () => { has(key: string): boolean };
  readonly socialEvents: () => Pick<SocialEventsHandler, 'broadcastPostUpdated' | 'broadcastStoryUpdated'> | null;
  /** Le magasin Redis de la passerelle, qui porte le bail de l'écoute. */
  readonly leaseStore: LeaseClient;
};

export function mediaReadyPorts(deps: MediaReadyListenerDeps): MediaReadyPorts {
  return {
    loadMessageAttachment: async (id) => {
      const row = await deps.prisma.messageAttachment.findUnique({
        where: { id },
        // `message` REMPLACE celui d'`attachmentSocketSelect` : il garde donc la
        // protection du porteur, sans quoi `servedDescription` servirait la
        // description d'une pièce d'un message protégé (#12333).
        select: { ...attachmentSocketSelect, processingState: true, message: { select: { conversationId: true, ...MESSAGE_SIDE_PROTECTION_SELECT } } },
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
    notifyPostReaders: async (postId) => {
      const social = deps.socialEvents();
      if (!social) return;
      const post = await deps.prisma.post.findFirst({ where: { id: postId, deletedAt: NOT_DELETED }, select: postInclude });
      if (!post) return;
      const wire = withMentions(post, WIRE_BROADCAST) as unknown as BroadcastPost;
      await (post.type === 'STORY'
        ? social.broadcastStoryUpdated(wire, post.authorId, { engagementReset: false })
        : social.broadcastPostUpdated(wire, post.authorId));
    },
    emitToUser: (userId, event, payload) => {
      deps.io.to(ROOMS.user(userId)).emit(event, payload);
    },
    serialize: (row) => ('uploaderId' in row ? row : serializeAttachmentForSocket(row as unknown as SocketAttachmentRow)),
    sealAtRest: async (id) => {
      const access = processAtRestFileAccess();
      if (!access) return;
      await sealAttachmentIfAtRest(gatewaySealDeps(deps.prisma, access), id).catch((error: unknown) =>
        logger.error('pièce jointe non scellée au repos après son rendu : la migration de rattrapage la reprendra', undefined, {
          code: 'SERVER_AT_REST_FILE_SEAL_FAILED', attachmentId: id, reason: error instanceof Error ? error.name : 'unknown',
        })
      );
    },
  };
}

export function startMediaReadyListener(deps: MediaReadyListenerDeps, redisUrl: string): { close(): Promise<void> } {
  const events = new QueueEvents(MEDIA_QUEUE_NAME, { connection: mediaQueueConnection(redisUrl) });
  const ports = mediaReadyPorts(deps);
  const lease = listenerLease(async () => deps.leaseStore, randomUUID());

  const notify = (notice: MediaReadyNotice | null): void => {
    if (notice === null) return;
    lease.holds()
      .then((held) => (held ? handleMediaReady(ports, notice) : undefined))
      .catch((error: unknown) => logger.error('media ready notification failed', error as Error));
  };

  events.on('progress', ({ data }) => notify(readMediaReadyNotice(data)));
  events.on('completed', ({ returnvalue }) => notify(readMediaReadyNotice(returnvalue)));
  events.on('failed', ({ jobId }) => {
    const ref = mediaJobRef(jobId);
    notify(ref ? { target: ref.target, recordIds: [ref.recordId], requireState: 'failed' } : null);
  });
  events.on('error', (error) => logger.error('QueueEvents error', error));
  logger.info('Écoute des médias prêts démarrée', { queue: MEDIA_QUEUE_NAME });
  return { close: () => events.close() };
}
