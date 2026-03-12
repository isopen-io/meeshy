import type { Message, Participant } from '@meeshy/shared/types';

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
  const now = new Date();
  return {
    id: tempId,
    _tempId: tempId,
    _localStatus: 'sending' as const,
    _sendPayload: sendPayload ?? {},
    conversationId,
    senderId,
    content,
    originalLanguage: language,
    messageType: 'text' as const,
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
    replyToId,
    translations: [] as readonly [],
    sender: sender ? {
      id: sender.id,
      displayName: sender.displayName,
      avatar: sender.avatar,
      isOnline: true,
      type: 'user' as const,
      conversationId,
      role: 'member',
      language,
      permissions: { canSendMessages: true, canSendFiles: true, canSendImages: true, canSendVideos: true, canSendAudios: true, canSendLocations: true, canSendLinks: true },
      isActive: true,
      joinedAt: new Date(),
      user: { id: sender.id, username: sender.username, displayName: sender.displayName, avatar: sender.avatar },
    } satisfies Participant : undefined,
  };
}
