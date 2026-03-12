import type { Message } from '@meeshy/shared/types';

type SendPayload = {
  attachmentIds?: string[];
  attachmentMimeTypes?: string[];
  mentionedUserIds?: string[];
};

export type OptimisticMessage = Message & {
  _tempId: string;
  _localStatus: 'sending' | 'failed';
  _sendPayload: SendPayload;
};

export function createOptimisticMessage(
  content: string,
  senderId: string,
  conversationId: string,
  language: string,
  replyToId?: string,
  sender?: { id: string; username: string; displayName: string; avatar?: string },
  sendPayload?: SendPayload,
): OptimisticMessage {
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id: tempId,
    _tempId: tempId,
    _localStatus: 'sending',
    _sendPayload: sendPayload ?? {},
    conversationId,
    senderId,
    content,
    originalLanguage: language,
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    replyToId,
    sender: sender ? {
      id: sender.id,
      username: sender.username,
      displayName: sender.displayName,
      avatar: sender.avatar,
    } : undefined,
  };
}
