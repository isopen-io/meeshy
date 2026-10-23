/**
 * Qui apprend qu'un média est prêt (#11264).
 *
 * Le worker tourne dans un AUTRE processus que Socket.IO : la passerelle écoute
 * les fins de tâches de la file (`QueueEvents` de BullMQ, porté par Redis) et
 * prévient :
 * - les lecteurs d'une conversation par `message:attachment-updated`, l'événement
 *   qu'iOS et le web savent DÉJÀ appliquer (un ancien client se met à jour sans
 *   rien connaître de la file), avec ses trois audiences (`emitAttachmentUpdated`) ;
 * - l'auteur de l'envoi par `attachment:ready`, pièce de message comme média de
 *   post — c'est lui qui attend la vignette de ce qu'il vient d'envoyer.
 * Une pièce pas encore rattachée à un message ne prévient que son auteur : le
 * `message:new` portera la ligne déjà finie.
 */
import { SERVER_EVENTS, type AttachmentReadyEventData, type MediaProcessingState } from '@meeshy/shared/types/socketio-events';
import { enhancedLogger } from '../../../utils/logger-enhanced.js';
import type { MediaJobOutcome } from './process-job';

const logger = enhancedLogger.child({ module: 'media-ready-notifier' });

type ReadyMessageAttachment = {
  readonly id: string;
  readonly messageId: string | null;
  readonly uploadedBy: string;
  readonly processingState: string | null;
  readonly message: { readonly conversationId: string } | null;
};

type ReadyPostMedia = { readonly id: string; readonly uploaderId: string | null; readonly processingState: string | null };

export type MediaReadyPorts = {
  loadMessageAttachment(id: string): Promise<ReadyMessageAttachment | null>;
  loadPostMedia(id: string): Promise<ReadyPostMedia | null>;
  emitAttachmentUpdated(params: { conversationId: string; messageId: string; attachment: ReadyMessageAttachment }): Promise<void>;
  emitToUser(userId: string, event: typeof SERVER_EVENTS.ATTACHMENT_READY, payload: AttachmentReadyEventData): void;
  /** La forme du canal socket, protection comprise (`serializeAttachmentForSocket`, fail-closed). */
  serialize(row: ReadyMessageAttachment | ReadyPostMedia): unknown;
};

const stateOf = (value: string | null): MediaProcessingState =>
  value === 'pending' || value === 'failed' ? value : 'ready';

export async function handleMediaJobCompleted(ports: MediaReadyPorts, outcome: MediaJobOutcome): Promise<void> {
  if (outcome.status !== 'done') return;
  try {
    if (outcome.target === 'postMedia') {
      const media = await ports.loadPostMedia(outcome.recordId);
      if (media?.uploaderId) {
        ports.emitToUser(media.uploaderId, SERVER_EVENTS.ATTACHMENT_READY, {
          attachmentId: media.id, target: 'postMedia', messageId: null, conversationId: null, processingState: stateOf(media.processingState), attachment: ports.serialize(media),
        });
      }
      return;
    }
    const attachment = await ports.loadMessageAttachment(outcome.recordId);
    if (!attachment) return;
    const conversationId = attachment.message?.conversationId ?? null;
    if (attachment.messageId && conversationId) {
      await ports.emitAttachmentUpdated({ conversationId, messageId: attachment.messageId, attachment });
    }
    ports.emitToUser(attachment.uploadedBy, SERVER_EVENTS.ATTACHMENT_READY, {
      attachmentId: attachment.id,
      target: 'messageAttachment',
      messageId: attachment.messageId,
      conversationId,
      processingState: stateOf(attachment.processingState),
      attachment: ports.serialize(attachment),
    });
  } catch (error) {
    logger.error('Média prêt, mais la notification a échoué (le prochain chargement le servira)', error as Error);
  }
}
