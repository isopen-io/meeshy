'use client';

import { memo, useCallback, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { MessageAttachments } from '@/components/attachments/MessageAttachments';
import { MessageReactions } from '@/components/common/message-reactions';
import { getAttachmentType } from '@meeshy/shared/types/attachment';
import type { useReactionsQuery } from '@/hooks/queries/use-reactions-query';

type UseReactionsQueryReturn = ReturnType<typeof useReactionsQuery>;

interface MessageAttachmentsSectionProps {
  message: {
    id: string;
    content: string;
    conversationId: string;
    attachments?: any[];
  };
  isOwnMessage: boolean;
  isAnonymous: boolean;
  currentUserId?: string;
  currentAnonymousUserId?: string;
  conversationId?: string;
  token?: string;
  messageReactionsHook: UseReactionsQueryReturn;
  onImageClick?: (attachmentId: string) => void;
}

export const MessageAttachmentsSection = memo(function MessageAttachmentsSection({
  message,
  isOwnMessage,
  isAnonymous,
  currentUserId,
  currentAnonymousUserId,
  conversationId,
  token,
  messageReactionsHook,
  onImageClick,
}: MessageAttachmentsSectionProps) {
  const [deletedAttachmentIds, setDeletedAttachmentIds] = useState<string[]>([]);

  const handleAttachmentDeleted = useCallback((attachmentId: string) => {
    setDeletedAttachmentIds(prev => [...prev, attachmentId]);
  }, []);

  const visibleAttachments = useMemo(() => {
    return message.attachments?.filter(att => !deletedAttachmentIds.includes(att.id)) || [];
  }, [message.attachments, deletedAttachmentIds]);

  const hasAudioAttachments = useMemo(() => {
    return visibleAttachments.some(att => getAttachmentType(att.mimeType) === 'audio');
  }, [visibleAttachments]);

  if (!message.attachments || message.attachments.length === 0) {
    return null;
  }

  const hasTextContent = message.content && message.content.trim();

  if (!hasTextContent) {
    // Attachments seuls : avec réactions superposées
    return (
      <div className={cn(
        "relative mb-5 w-full max-w-full overflow-visible",
        isOwnMessage ? "ml-auto" : "mr-auto"
      )}>
        <MessageAttachments
          attachments={visibleAttachments}
          onImageClick={onImageClick}
          currentUserId={isAnonymous ? currentAnonymousUserId : currentUserId}
          token={token}
          onAttachmentDeleted={handleAttachmentDeleted}
          isOwnMessage={isOwnMessage}
        />

        {/* Réactions superposées */}
        <div
          className={cn(
            "absolute z-[99999] transition-transform duration-200",
            "group-hover/message:-translate-y-4",
            isOwnMessage ? "right-0" : "left-0"
          )}
          style={{
            pointerEvents: 'auto',
            bottom: '-14px'
          }}
        >
          <MessageReactions
            messageId={message.id}
            conversationId={conversationId || message.conversationId}
            currentUserId={currentUserId || ''}
            currentAnonymousUserId={currentAnonymousUserId}
            isAnonymous={isAnonymous}
            showAddButton={false}
            externalReactionsHook={messageReactionsHook}
          />
        </div>
      </div>
    );
  }

  // Attachments avec texte : pas de wrapper relative
  return (
    <div className={cn(
      "mb-1 inline-flex max-w-full overflow-hidden",
      isOwnMessage ? "ml-auto" : "mr-auto"
    )}>
      <MessageAttachments
        attachments={visibleAttachments}
        onImageClick={onImageClick}
        currentUserId={isAnonymous ? currentAnonymousUserId : currentUserId}
        token={token}
        onAttachmentDeleted={handleAttachmentDeleted}
        isOwnMessage={isOwnMessage}
      />
    </div>
  );
});
