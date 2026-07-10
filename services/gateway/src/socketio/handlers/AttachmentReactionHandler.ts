/**
 * Attachment Reaction Handler (BUG2 A')
 * Gère les réactions par-image (ajout / suppression). Miroir de ReactionHandler,
 * substituant la clé attachment + réutilisant `resolveParticipantFromMessage`.
 */
import type { Socket, Server as SocketIOServer } from 'socket.io';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import type { SocketIOResponse } from '@meeshy/shared/types/socketio-events';
import { resolveParticipantFromMessage } from '../utils/participant-resolver';
import type { SocketUser } from '../utils/socket-helpers';
import { AttachmentReactionService } from '../../services/AttachmentReactionService';
import type { RedisDeliveryQueue } from '../../services/RedisDeliveryQueue';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { getSocketRateLimiter, SOCKET_RATE_LIMITS } from '../../utils/socket-rate-limiter.js';

const logger = enhancedLogger.child({ module: 'AttachmentReactionHandler' });
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

export interface AttachmentReactionHandlerDependencies {
  io: SocketIOServer;
  prisma: PrismaClient;
  service: AttachmentReactionService;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
  deliveryQueue?: RedisDeliveryQueue | null;
}

export class AttachmentReactionHandler {
  private rateLimiter = getSocketRateLimiter();
  private deliveryQueue: RedisDeliveryQueue | null;
  constructor(private deps: AttachmentReactionHandlerDependencies) {
    this.deliveryQueue = deps.deliveryQueue ?? null;
  }

  /**
   * Injected after construction by `MeeshySocketIOManager.setDeliveryQueue`
   * (the queue is created after the handlers), mirroring ReactionHandler.
   */
  setDeliveryQueue(queue: RedisDeliveryQueue): void {
    this.deliveryQueue = queue;
  }

  async handleAdd(
    socket: Socket,
    data: { attachmentId: string; messageId: string; emoji: string },
    callback?: (r: SocketIOResponse<unknown>) => void
  ): Promise<void> {
    await this._apply(socket, data, 'add', callback);
  }

  async handleRemove(
    socket: Socket,
    data: { attachmentId: string; messageId: string; emoji: string },
    callback?: (r: SocketIOResponse<unknown>) => void
  ): Promise<void> {
    await this._apply(socket, data, 'remove', callback);
  }

  private async _apply(
    socket: Socket,
    data: { attachmentId: string; messageId: string; emoji: string },
    action: 'add' | 'remove',
    callback?: (r: SocketIOResponse<unknown>) => void
  ): Promise<void> {
    try {
      if (!data?.attachmentId || !data?.messageId || !data?.emoji) {
        callback?.({ success: false, error: 'Invalid payload' });
        return;
      }
      // Garde : un messageId optimiste non réconcilié (cid_*) ferait throw
      // prisma (P2023). Mirror de ReactionHandler._resolveParticipantId.
      if (!OBJECT_ID.test(data.messageId) || !OBJECT_ID.test(data.attachmentId)) {
        logger.warn('attachment reaction — invalid/unreconciled id, skipping', {
          messageId: data.messageId, attachmentId: data.attachmentId,
        });
        callback?.({ success: false, error: 'Could not resolve participant' });
        return;
      }
      const userIdOrToken = this.deps.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        callback?.({ success: false, error: 'User not authenticated' });
        return;
      }

      const rateLimit = action === 'add' ? SOCKET_RATE_LIMITS.REACTION_ADD : SOCKET_RATE_LIMITS.REACTION_REMOVE;
      const rateLimitAllowed = await this.rateLimiter.checkLimit(userIdOrToken, rateLimit);
      if (!rateLimitAllowed) {
        callback?.({ success: false, error: 'Rate limit exceeded' });
        return;
      }

      const resolved = await resolveParticipantFromMessage({
        prisma: this.deps.prisma,
        userIdOrToken,
        messageId: data.messageId,
        connectedUsers: this.deps.connectedUsers,
      });
      if (!resolved) {
        callback?.({ success: false, error: 'Could not resolve participant' });
        return;
      }
      const conversationId = await this.deps.service.resolveConversationId(data.messageId);
      if (!conversationId) {
        callback?.({ success: false, error: 'Message not found' });
        return;
      }

      // Sécurité (IDOR) — lier l'attachment au message fourni. Sans ça, un client
      // pourrait réagir à une PJ d'une autre conversation en passant un messageId
      // dont il EST participant + un attachmentId étranger.
      const att = await this.deps.prisma.messageAttachment.findUnique({
        where: { id: data.attachmentId },
        select: { messageId: true },
      });
      if (!att || att.messageId !== data.messageId) {
        callback?.({ success: false, error: 'Attachment not found' });
        return;
      }

      if (action === 'add') {
        const { changed } = await this.deps.service.addAttachmentReaction({
          attachmentId: data.attachmentId, messageId: data.messageId,
          participantId: resolved.participantId, emoji: data.emoji,
        });
        if (!changed) {
          // Idempotent no-op: the participant already had exactly this emoji on
          // this attachment (optimistic double-fire, a socket retry after a lost
          // ACK, or a second device echoing the same tap). Reply success but
          // skip the ATTACHMENT_REACTION_ADDED broadcast — re-emitting it spams
          // every socket in the conversation room. Mirrors ReactionHandler's
          // `unchanged` guard (iter 134).
          callback?.({ success: true });
          return;
        }
      } else {
        const removed = await this.deps.service.removeAttachmentReaction({
          attachmentId: data.attachmentId, participantId: resolved.participantId, emoji: data.emoji,
        });
        if (!removed) {
          // Idempotent: the reaction is already absent. Reply success (nothing
          // changed, no broadcast) — re-emitting ATTACHMENT_REACTION_REMOVED
          // would clear the indicator for peers who still hold their own, and
          // replying error would make the client roll its optimistic un-react
          // back and re-show a reaction that is gone. Mirrors ReactionHandler's
          // already-absent guard.
          callback?.({ success: true });
          return;
        }
      }

      const reactionSummary = await this.deps.service.getReactionSummary(data.attachmentId);
      const event = action === 'add'
        ? SERVER_EVENTS.ATTACHMENT_REACTION_ADDED
        : SERVER_EVENTS.ATTACHMENT_REACTION_REMOVED;
      const payload = {
        attachmentId: data.attachmentId,
        messageId: data.messageId,
        conversationId,
        participantId: resolved.participantId,
        emoji: data.emoji,
        action,
        reactionSummary,
        timestamp: new Date().toISOString(),
      };
      this.deps.io.to(ROOMS.conversation(conversationId)).emit(event, payload);

      void this._enqueueOfflineAttachmentReactionEvent(
        conversationId,
        resolved.participantId,
        action === 'add' ? 'attachment-reaction-added' : 'attachment-reaction-removed',
        data,
        payload,
      );

      callback?.({ success: true });
    } catch (error: unknown) {
      logger.error('attachment reaction failed', { action, error });
      callback?.({ success: false, error: error instanceof Error ? error.message : 'Failed' });
    }
  }

  /**
   * Offline delivery queue for attachment reaction add/remove — the exact
   * mirror of `ReactionHandler._enqueueOfflineReactionEvent`. Without it an
   * attachment reaction toggled while a participant is offline is only
   * broadcast to the live conversation room, so the offline peer's cached
   * per-attachment `reactionSummary` stays stale until an unrelated full
   * refetch. On reconnect `MeeshySocketIOManager._drainedEventName` replays the
   * queued entry as ATTACHMENT_REACTION_ADDED / ATTACHMENT_REACTION_REMOVED
   * with the same payload as the live emit.
   *
   * The actor is excluded by participant id (never on message content) and
   * every online peer is skipped since they already received the live
   * broadcast. `dedupKey` is scoped to (attachmentId, reactor, emoji) — finer
   * than a message reaction's (messageId, reactor, emoji) because one message
   * can carry several attachments each with their own reactions; the default
   * (messageId, eventType) dedup would otherwise collapse reactions on
   * different attachments of the same message into one.
   */
  private async _enqueueOfflineAttachmentReactionEvent(
    conversationId: string,
    actorParticipantId: string | null | undefined,
    eventType: 'attachment-reaction-added' | 'attachment-reaction-removed',
    data: { attachmentId: string; messageId: string; emoji: string },
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.deliveryQueue) return;
    try {
      const participants = await this.deps.prisma.participant.findMany({
        where: { conversationId, isActive: true },
        select: { id: true, userId: true },
      });
      const dedupKey = `${data.attachmentId}:${actorParticipantId ?? 'unknown'}:${data.emoji}`;
      for (const p of participants) {
        const queueKey = p.userId ?? p.id;
        if (p.id === actorParticipantId || this.deps.connectedUsers.has(queueKey)) continue;
        this.deliveryQueue.enqueue(queueKey, {
          messageId: data.messageId,
          conversationId,
          payload,
          enqueuedAt: new Date().toISOString(),
          eventType,
          dedupKey,
        }).catch((err) => logger.warn('Failed to enqueue offline attachment reaction event', { userId: queueKey, eventType, error: err }));
      }
    } catch (err) {
      logger.warn('Failed to fetch participants for offline attachment reaction enqueue', { conversationId, eventType, error: err });
    }
  }
}
