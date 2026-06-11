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
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'AttachmentReactionHandler' });
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

export interface AttachmentReactionHandlerDependencies {
  io: SocketIOServer;
  prisma: PrismaClient;
  service: AttachmentReactionService;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
}

export class AttachmentReactionHandler {
  constructor(private deps: AttachmentReactionHandlerDependencies) {}

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
        await this.deps.service.addAttachmentReaction({
          attachmentId: data.attachmentId, messageId: data.messageId,
          participantId: resolved.participantId, emoji: data.emoji,
        });
      } else {
        await this.deps.service.removeAttachmentReaction({
          attachmentId: data.attachmentId, participantId: resolved.participantId, emoji: data.emoji,
        });
      }

      const reactionSummary = await this.deps.service.getReactionSummary(data.attachmentId);
      const event = action === 'add'
        ? SERVER_EVENTS.ATTACHMENT_REACTION_ADDED
        : SERVER_EVENTS.ATTACHMENT_REACTION_REMOVED;
      this.deps.io.to(ROOMS.conversation(conversationId)).emit(event, {
        attachmentId: data.attachmentId,
        messageId: data.messageId,
        conversationId,
        participantId: resolved.participantId,
        emoji: data.emoji,
        action,
        reactionSummary,
        timestamp: new Date().toISOString(),
      });

      callback?.({ success: true });
    } catch (error: unknown) {
      logger.error('attachment reaction failed', { action, error });
      callback?.({ success: false, error: error instanceof Error ? error.message : 'Failed' });
    }
  }
}
