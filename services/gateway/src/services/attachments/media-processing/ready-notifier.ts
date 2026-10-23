/**
 * Qui apprend qu'un média a avancé (#11264).
 *
 * Le worker tourne dans un AUTRE processus que Socket.IO : la passerelle écoute
 * les événements de la file (`QueueEvents` de BullMQ, porté par Redis) — un
 * rendu écrit (`progress`, la vignette avant le rendu vidéo), une tâche finie
 * (`completed`), une tâche abandonnée (`failed`) — et prévient :
 * - les lecteurs d'une conversation par `message:attachment-updated`, l'événement
 *   qu'iOS, le web et (par `attachmentId`, audit S9 défaut 5) Android décodent,
 *   avec ses trois audiences (`emitAttachmentUpdated`) ;
 * - les lecteurs d'un post ou d'une story par la rediffusion du post
 *   (`post:updated` / `story:updated`, ce que fait déjà l'arrivée d'une piste audio) ;
 * - l'auteur de l'envoi par `attachment:ready`, échec compris — c'est lui qui
 *   attend la vignette de ce qu'il vient d'envoyer.
 * Une pièce pas encore rattachée à un message ne prévient que son auteur : le
 * `message:new` portera la ligne déjà finie.
 *
 * Toutes les lignes qui partagent les octets (copies de diffusion et de
 * transfert) sont prévenues : le worker les a toutes écrites.
 */
import { SERVER_EVENTS, type AttachmentReadyEventData, type MediaProcessingState } from '@meeshy/shared/types/socketio-events';
import { enhancedLogger } from '../../../utils/logger-enhanced.js';
import type { MediaJobTarget } from './jobs';

const logger = enhancedLogger.child({ module: 'media-ready-notifier' });

type ReadyMessageAttachment = {
  readonly id: string;
  readonly messageId: string | null;
  readonly uploadedBy: string;
  readonly processingState: string | null;
  readonly message: { readonly conversationId: string } | null;
};

type ReadyPostMedia = {
  readonly id: string;
  readonly uploaderId: string | null;
  readonly postId: string | null;
  readonly processingState: string | null;
};

export type MediaReadyPorts = {
  loadMessageAttachment(id: string): Promise<ReadyMessageAttachment | null>;
  loadPostMedia(id: string): Promise<ReadyPostMedia | null>;
  emitAttachmentUpdated(params: { conversationId: string; messageId: string; attachment: ReadyMessageAttachment }): Promise<void>;
  /** Rediffuse le post (ou la story) à ses lecteurs, par la porte qui sert déjà ses mises à jour. */
  notifyPostReaders(postId: string): Promise<void>;
  emitToUser(userId: string, event: typeof SERVER_EVENTS.ATTACHMENT_READY, payload: AttachmentReadyEventData): void;
  /** La forme du canal socket, protection comprise (`serializeAttachmentForSocket`, fail-closed). */
  serialize(row: ReadyMessageAttachment | ReadyPostMedia): unknown;
};

export type MediaReadyNotice = {
  readonly target: MediaJobTarget;
  readonly recordIds: readonly string[];
  /** Ne prévenir que si la ligne est dans cet état (un `failed` de file qui n'a rien écrit ne dit rien). */
  readonly requireState?: MediaProcessingState;
};

const stateOf = (value: string | null): MediaProcessingState =>
  value === 'pending' || value === 'failed' ? value : 'ready';

async function notifyPostMedia(ports: MediaReadyPorts, id: string, requireState?: MediaProcessingState): Promise<void> {
  const media = await ports.loadPostMedia(id);
  if (!media || (requireState && stateOf(media.processingState) !== requireState)) return;
  if (media.postId) await ports.notifyPostReaders(media.postId);
  if (media.uploaderId) {
    ports.emitToUser(media.uploaderId, SERVER_EVENTS.ATTACHMENT_READY, {
      attachmentId: media.id, target: 'postMedia', messageId: null, conversationId: null, processingState: stateOf(media.processingState), attachment: ports.serialize(media),
    });
  }
}

async function notifyMessageAttachment(ports: MediaReadyPorts, id: string, requireState?: MediaProcessingState): Promise<void> {
  const attachment = await ports.loadMessageAttachment(id);
  if (!attachment || (requireState && stateOf(attachment.processingState) !== requireState)) return;
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
}

export async function handleMediaReady(ports: MediaReadyPorts, notice: MediaReadyNotice): Promise<void> {
  for (const id of notice.recordIds) {
    try {
      await (notice.target === 'postMedia'
        ? notifyPostMedia(ports, id, notice.requireState)
        : notifyMessageAttachment(ports, id, notice.requireState));
    } catch (error) {
      logger.error('Média traité, mais la notification a échoué (le prochain chargement le servira)', { id, error });
    }
  }
}

/** Ce qu'un événement de file porte, lu comme une donnée Redis : rien ne s'y croit sur parole. */
export function readMediaReadyNotice(value: unknown): MediaReadyNotice | null {
  const parsed = typeof value === 'string' ? safeJson(value) : value;
  if (!parsed || typeof parsed !== 'object') return null;
  const raw = parsed as Record<string, unknown>;
  if (raw.target !== 'messageAttachment' && raw.target !== 'postMedia') return null;
  const ids = Array.isArray(raw.recordIds) ? raw.recordIds.filter((id): id is string => typeof id === 'string' && /^[0-9a-f]{24}$/i.test(id)) : [];
  return ids.length > 0 ? { target: raw.target, recordIds: ids } : null;
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
