'use client';

import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import type { Message } from '@meeshy/shared/types/conversation';
import type { ConversationType } from '@meeshy/shared/types';
import { formatFullDate } from '@/utils/date-format';
import { getUserDisplayName } from '@/utils/user-display-name';

interface UseMessageInteractionsProps {
  message: Partial<Message> & { id: string; content: string; createdAt: Date | string; senderId?: string; anonymousSenderId?: string; };
  currentUserId?: string;
  currentAnonymousUserId?: string;
  isAnonymous?: boolean;
  conversationId?: string;
  conversationType?: ConversationType;
  userRole?: 'USER' | 'MEMBER' | 'MODERATOR' | 'ADMIN' | 'CREATOR' | 'AUDIT' | 'ANALYST' | 'BIGBOSS';
  onEnterReactionMode?: () => void;
  onEnterEditMode?: () => void;
  onEnterDeleteMode?: () => void;
  onEnterReportMode?: () => void;
  onEditMessage?: (messageId: string, newContent: string) => Promise<void> | void;
  onDeleteMessage?: (messageId: string) => Promise<void> | void;
  t: (key: string) => string;
}

export function useMessageInteractions({
  message,
  currentUserId,
  currentAnonymousUserId,
  isAnonymous = false,
  conversationId,
  conversationType = 'direct',
  userRole = 'USER',
  onEnterReactionMode,
  onEnterEditMode,
  onEnterDeleteMode,
  onEnterReportMode,
  onEditMessage,
  onDeleteMessage,
  t,
}: UseMessageInteractionsProps) {
  // Détermine si c'est le message de l'utilisateur connecté
  const isOwnMessage = useMemo(() => {
    return Boolean(isAnonymous
      ? (currentAnonymousUserId && message.anonymousSenderId === currentAnonymousUserId)
      : (currentUserId && message.senderId === currentUserId));
  }, [isAnonymous, currentAnonymousUserId, currentUserId, message.anonymousSenderId, message.senderId]);

  // Permissions de modification (edit)
  const canModifyMessage = useCallback(() => {
    const messageAge = Date.now() - new Date(message.createdAt).getTime();
    const twentyFourHoursInMs = 24 * 60 * 60 * 1000;
    const hasSpecialPrivileges = ['MODERATOR', 'MODO', 'ADMIN', 'CREATOR', 'BIGBOSS'].includes(userRole);

    if (messageAge > twentyFourHoursInMs && !hasSpecialPrivileges) {
      return false;
    }

    if (onEnterEditMode) return true;

    if (isOwnMessage) return true;
    if (conversationType === 'group' || conversationType === 'public' || conversationType === 'global') {
      return hasSpecialPrivileges;
    }
    return false;
  }, [message.createdAt, userRole, onEnterEditMode, isOwnMessage, conversationType]);

  // Permissions de suppression (delete)
  const canDeleteMessage = useCallback(() => {
    if (onEnterDeleteMode) return true;

    if (['BIGBOSS', 'ADMIN', 'MODERATOR', 'MODO'].includes(userRole)) return true;

    const messageAge = Date.now() - new Date(message.createdAt).getTime();
    const twelveHours = 12 * 60 * 60 * 1000;

    if (messageAge > twelveHours) return false;
    return canModifyMessage();
  }, [onEnterDeleteMode, userRole, message.createdAt, canModifyMessage]);

  // Permissions de signalement (report)
  const canReportMessage = useCallback(() => {
    if (isAnonymous) return false;
    if (isOwnMessage) return false;
    return !!onEnterReportMode;
  }, [isAnonymous, isOwnMessage, onEnterReportMode]);

  // Handler pour copier le message complet
  const handleCopyMessage = useCallback(async (displayContent: string) => {
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';

      let messageUrl: string;

      if (conversationId) {
        if (currentPath.startsWith('/chat/')) {
          messageUrl = `${baseUrl}/chat/${conversationId}#message-${message.id}`;
        } else {
          messageUrl = `${baseUrl}/conversations/${conversationId}#message-${message.id}`;
        }
      } else {
        messageUrl = `${baseUrl}/message/${message.id}`;
      }

      const senderUser = message.anonymousSender || message.sender;
      const senderName = senderUser
        ? getUserDisplayName(senderUser, t('anonymous'))
        : t('unknownUser');

      const fullDate = formatFullDate(message.createdAt);
      const contentToCopy = `${fullDate} par ${senderName} :\n${displayContent}\n\n${messageUrl}`;

      await navigator.clipboard.writeText(contentToCopy);
      toast.success(t('messageCopied'));
    } catch (error) {
      console.error('Failed to copy message:', error);
      toast.error(t('copyFailed'));
    }
  }, [conversationId, message, t]);

  // Handler pour copier uniquement le lien
  const handleCopyMessageLink = useCallback(async () => {
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';

      let messageUrl: string;

      if (conversationId) {
        if (currentPath.startsWith('/chat/')) {
          messageUrl = `${baseUrl}/chat/${conversationId}#message-${message.id}`;
        } else {
          messageUrl = `${baseUrl}/conversations/${conversationId}#message-${message.id}`;
        }
      } else {
        messageUrl = `${baseUrl}/message/${message.id}`;
      }

      await navigator.clipboard.writeText(messageUrl);
      toast.success(t('linkCopied') || 'Lien copié !');
    } catch (error) {
      console.error('Failed to copy message link:', error);
      toast.error(t('copyFailed'));
    }
  }, [conversationId, message.id, t]);

  // Handler pour éditer le message
  const handleEditMessage = useCallback(async () => {
    if (onEnterEditMode) {
      onEnterEditMode();
    } else {
      const newContent = prompt(t('editMessagePrompt'), message.content);
      if (newContent && newContent.trim() !== message.content) {
        await onEditMessage?.(message.id, newContent.trim());
      }
    }
  }, [onEnterEditMode, onEditMessage, message.id, message.content, t]);

  // Handler pour supprimer le message
  const handleDeleteMessage = useCallback(async () => {
    if (onEnterDeleteMode) {
      onEnterDeleteMode();
    } else {
      const confirmed = confirm(t('deleteMessageConfirm'));
      if (confirmed) {
        await onDeleteMessage?.(message.id);
      }
    }
  }, [onEnterDeleteMode, onDeleteMessage, message.id, t]);

  // Handler pour signaler le message
  const handleReportMessage = useCallback(() => {
    if (onEnterReportMode) {
      onEnterReportMode();
    }
  }, [onEnterReportMode]);

  // Handler pour entrer en mode réaction
  const handleReactionClick = useCallback(() => {
    if (onEnterReactionMode) {
      onEnterReactionMode();
    }
  }, [onEnterReactionMode]);

  return {
    isOwnMessage,
    canModifyMessage,
    canDeleteMessage,
    canReportMessage,
    handleCopyMessage,
    handleCopyMessageLink,
    handleEditMessage,
    handleDeleteMessage,
    handleReportMessage,
    handleReactionClick,
  };
}
