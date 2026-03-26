import type { Message, Participant, Attachment } from '@meeshy/shared/types';
import type { MessageType } from '@meeshy/shared/types/socketio-events';

type SendPayload = {
  attachmentIds?: string[];
  attachmentMimeTypes?: string[];
  mentionedUserIds?: string[];
};

export type OptimisticMessage = Message & {
  readonly _tempId: string;
  readonly _localStatus: 'sending' | 'failed';
  readonly _sendPayload: SendPayload;
};

interface OptimisticMessageOptions {
  content: string;
  senderId: string;
  conversationId: string;
  language: string;
  replyToId?: string;
  replyTo?: Message;
  forwardedFromId?: string;
  forwardedFromConversationId?: string;
  sender?: { id: string; userId: string; username: string; displayName: string; avatar?: string };
  sendPayload?: SendPayload;
  attachments?: readonly Attachment[];
  messageType?: MessageType;
}

export function createOptimisticMessage(opts: OptimisticMessageOptions): OptimisticMessage;
export function createOptimisticMessage(
  content: string,
  senderId: string,
  conversationId: string,
  language: string,
  replyToId?: string,
  sender?: { id: string; userId: string; username: string; displayName: string; avatar?: string },
  sendPayload?: SendPayload,
): OptimisticMessage;
export function createOptimisticMessage(
  contentOrOpts: string | OptimisticMessageOptions,
  senderId?: string,
  conversationId?: string,
  language?: string,
  replyToId?: string,
  sender?: { id: string; userId: string; username: string; displayName: string; avatar?: string },
  sendPayload?: SendPayload,
): OptimisticMessage {
  const opts: OptimisticMessageOptions = typeof contentOrOpts === 'string'
    ? { content: contentOrOpts, senderId: senderId!, conversationId: conversationId!, language: language!, replyToId, sender, sendPayload }
    : contentOrOpts;

  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date();
  return {
    id: tempId,
    _tempId: tempId,
    _localStatus: 'sending' as const,
    _sendPayload: opts.sendPayload ?? {},
    conversationId: opts.conversationId,
    senderId: opts.senderId,
    content: opts.content,
    originalLanguage: opts.language,
    messageType: opts.messageType ?? 'text' as const,
    messageSource: 'user' as const,
    isEdited: false,
    isEncrypted: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    createdAt: now,
    updatedAt: now,
    timestamp: now,
    replyToId: opts.replyToId,
    replyTo: opts.replyTo,
    forwardedFromId: opts.forwardedFromId,
    forwardedFromConversationId: opts.forwardedFromConversationId,
    attachments: opts.attachments,
    translations: [] as readonly [],
    sender: opts.sender ? {
      id: opts.sender.id,
      userId: opts.sender.userId,
      displayName: opts.sender.displayName,
      avatar: opts.sender.avatar,
      isOnline: true,
      type: 'user' as const,
      conversationId: opts.conversationId,
      role: 'member',
      language: opts.language,
      permissions: { canSendMessages: true, canSendFiles: true, canSendImages: true, canSendVideos: true, canSendAudios: true, canSendLocations: true, canSendLinks: true },
      isActive: true,
      joinedAt: new Date(),
      user: { id: opts.sender.userId, username: opts.sender.username, displayName: opts.sender.displayName, avatar: opts.sender.avatar },
    } satisfies Participant : undefined,
  };
}
