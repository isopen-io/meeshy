'use client';

import { memo, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  TooltipProvider,
} from '@/components/ui/tooltip';
import type { User, BubbleTranslation, ConversationType, TranslationModel } from '@meeshy/shared/types';
import { getLanguageInfo } from '@meeshy/shared/utils/languages';
import type { Message } from '@meeshy/shared/types/conversation';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import { useFixTranslationPopoverZIndex } from '@/hooks/use-fix-z-index';
import { useReactionsQuery } from '@/hooks/queries/use-reactions-query';
import { useAuth } from '@/hooks/use-auth';
import { MessageActionsBar } from './MessageActionsBar';
import { MessageHeader } from './MessageHeader';
import { MessageNameDate } from './MessageNameDate';
import { MessageContent } from './MessageContent';
import { MessageAttachmentsSection } from './MessageAttachmentsSection';
import { useMessageInteractions } from '@/hooks/use-message-interactions';
import { useMessageDisplay } from '@/hooks/use-message-display';

interface BubbleMessageNormalViewProps {
  message: Omit<Message, 'translations'> & {
    location?: string;
    originalLanguage: string;
    translations: BubbleTranslation[];
    originalContent: string;
    readStatus?: Array<{ userId: string; readAt: Date }>;
    attachments?: any[];
    reactionSummary?: Record<string, number>;
    currentUserReactions?: string[];
  };
  currentUser?: User;
  userLanguage: string;
  usedLanguages: string[];
  currentDisplayLanguage: string;
  isTranslating?: boolean;
  translationError?: string;
  conversationType?: ConversationType;
  userRole?: 'USER' | 'MEMBER' | 'MODERATOR' | 'ADMIN' | 'CREATOR' | 'AUDIT' | 'ANALYST' | 'BIGBOSS';
  conversationId?: string;
  isAnonymous?: boolean;
  currentAnonymousUserId?: string;

  // Actions du nouveau système
  onEnterReactionMode?: () => void;
  onEnterLanguageMode?: () => void;
  onEnterEditMode?: () => void;
  onEnterDeleteMode?: () => void;
  onEnterReportMode?: () => void;

  // Actions originales
  onForceTranslation?: (messageId: string, targetLanguage: string, model?: TranslationModel) => void;
  onEditMessage?: (messageId: string, newContent: string) => Promise<void> | void;
  onDeleteMessage?: (messageId: string) => Promise<void> | void;
  onLanguageSwitch?: (messageId: string, language: string) => void;
  onReplyMessage?: (message: Message) => void;
  onNavigateToMessage?: (messageId: string) => void;
  onImageClick?: (attachmentId: string) => void;
}

export const BubbleMessageNormalView = memo(function BubbleMessageNormalView({
  message,
  currentUser,
  userLanguage,
  usedLanguages = [],
  currentDisplayLanguage,
  isTranslating = false,
  translationError,
  conversationType = 'direct',
  userRole = 'USER',
  conversationId,
  isAnonymous = false,
  currentAnonymousUserId,
  onEnterReactionMode,
  onEnterLanguageMode,
  onEnterEditMode,
  onEnterDeleteMode,
  onEnterReportMode,
  onForceTranslation,
  onEditMessage,
  onDeleteMessage,
  onLanguageSwitch,
  onReplyMessage,
  onNavigateToMessage,
  onImageClick
}: BubbleMessageNormalViewProps) {
  const { t: tBubble } = useI18n('bubbleStream');
  const { t: tReport } = useI18n('reportMessage');
  const messageRef = useRef<HTMLDivElement>(null);
  const { token } = useAuth();

  // Hook pour fixer les z-index des popovers
  useFixTranslationPopoverZIndex();

  // Hook centralisé pour gérer les réactions (React Query)
  const messageReactionsHook = useReactionsQuery({
    messageId: message.id,
    currentUserId: isAnonymous ? currentAnonymousUserId : (currentUser?.id || ''),
    isAnonymous,
    enabled: !!currentUser || !!currentAnonymousUserId,
    initialReactionSummary: message.reactionSummary,
    initialCurrentUserReactions: message.currentUserReactions
  });

  // Hook pour gérer les interactions (permissions, actions)
  const {
    isOwnMessage,
    canModifyMessage,
    canDeleteMessage,
    canReportMessage,
    handleCopyMessage,
    handleEditMessage,
    handleDeleteMessage,
    handleReportMessage,
    handleReactionClick,
  } = useMessageInteractions({
    message: message as any,
    currentUserId: currentUser?.id,
    currentAnonymousUserId,
    isAnonymous,
    conversationId,
    conversationType,
    userRole,
    onEnterReactionMode,
    onEnterEditMode,
    onEnterDeleteMode,
    onEnterReportMode,
    onEditMessage,
    onDeleteMessage,
    t: tBubble,
  });

  // Hook pour gérer l'affichage des traductions
  const {
    displayContent,
    displayContentWithMentions,
    replyToContent,
    availableVersions,
  } = useMessageDisplay({
    message: message as any,
    currentDisplayLanguage,
  });

  // Handler pour les quick reactions
  const handleQuickReaction = useCallback((emoji: string) => {
    messageReactionsHook.addReaction(emoji);
  }, [messageReactionsHook]);

  // Handler pour la copie du message
  const handleCopy = useCallback(async () => {
    await handleCopyMessage(displayContent);
  }, [handleCopyMessage, displayContent]);

  return (
    <TooltipProvider>
      <motion.div
        id={`message-${message.id}`}
        ref={messageRef}
        className={cn(
          "bubble-message group/message grid grid-cols-10 gap-1 sm:gap-1.5 mb-2 px-2 sm:px-4"
        )}
      >
        {/* Empty space for sent messages (20% mobile = 2 cols / 40% desktop = 4 cols) */}
        {isOwnMessage && <div className="col-span-2 sm:col-span-4" />}

        {/* Message content area (80% mobile = 8 cols / 60% desktop = 6 cols) */}
        <div className={cn(
          "col-span-8 sm:col-span-6 flex gap-1 sm:gap-1.5 max-w-[90vw]",
          isOwnMessage ? "flex-row-reverse" : "flex-row"
        )}>
          {/* Message Header with Avatar */}
          <MessageHeader
            message={message as any}
            isOwnMessage={isOwnMessage}
            t={tBubble}
          />

          {/* Message content wrapper */}
          <div className={cn(
            "flex flex-col flex-1",
            isOwnMessage ? "items-end" : "items-start"
          )}>
            {/* Name and Date */}
            <MessageNameDate
              message={message as any}
              isOwnMessage={isOwnMessage}
              t={tBubble}
            />

            {/* Attachments (before text bubble) */}
            <MessageAttachmentsSection
              message={message as any}
              isOwnMessage={isOwnMessage}
              isAnonymous={isAnonymous}
              currentUserId={currentUser?.id}
              currentAnonymousUserId={currentAnonymousUserId}
              conversationId={conversationId}
              token={token || undefined}
              messageReactionsHook={messageReactionsHook}
              onImageClick={onImageClick}
              onAddReactionClick={handleReactionClick}
            />

            {/* Message Content (text bubble with reactions) */}
            <MessageContent
              message={message as any}
              displayContentWithMentions={displayContentWithMentions}
              replyToContent={replyToContent}
              isOwnMessage={isOwnMessage}
              isAnonymous={isAnonymous}
              currentUserId={currentUser?.id}
              currentAnonymousUserId={currentAnonymousUserId}
              conversationId={conversationId}
              messageReactionsHook={messageReactionsHook}
              onNavigateToMessage={onNavigateToMessage}
              onAddReactionClick={handleReactionClick}
              t={tBubble}
            />

            {/* Actions Bar */}
            <MessageActionsBar
              message={message as unknown as Message}
              isOwnMessage={isOwnMessage}
              canReportMessage={canReportMessage()}
              canEditMessage={canModifyMessage()}
              canDeleteMessage={canDeleteMessage()}
              onReply={onReplyMessage ? () => onReplyMessage(message as unknown as Message) : undefined}
              onReaction={handleReactionClick}
              onQuickReaction={handleQuickReaction}
              onCopy={handleCopy}
              onReport={canReportMessage() ? handleReportMessage : undefined}
              onEdit={canModifyMessage() ? handleEditMessage : undefined}
              onDelete={canDeleteMessage() ? handleDeleteMessage : undefined}
              t={tBubble}
              tReport={tReport}
              translationError={translationError}
              currentDisplayLanguage={currentDisplayLanguage}
              originalLanguage={message.originalLanguage || 'fr'}
              userLanguage={userLanguage}
              availableVersions={availableVersions}
              onLanguageSwitch={onLanguageSwitch ? (lang: string) => onLanguageSwitch(message.id, lang) : () => {}}
              onEnterLanguageMode={onEnterLanguageMode}
              getLanguageInfo={getLanguageInfo}
            />
          </div>
        </div>

        {/* Empty space for received messages */}
        {!isOwnMessage && <div className="col-span-2 sm:col-span-4" />}
      </motion.div>
    </TooltipProvider>
  );
});
