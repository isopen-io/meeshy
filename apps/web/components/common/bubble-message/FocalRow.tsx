'use client';

import React, { memo, useCallback, useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { User, BubbleTranslation, ConversationType, TranslationModel } from '@meeshy/shared/types';
import { getLanguageInfo } from '@meeshy/shared/utils/languages';
import type { Message } from '@meeshy/shared/types/conversation';
import { useI18n } from '@/hooks/useI18n';
import { cn } from '@/lib/utils';
import { useReactionsQuery } from '@/hooks/queries/use-reactions-query';
import { useAuth } from '@/hooks/use-auth';
import { useMessageInteractions } from '@/hooks/use-message-interactions';
import { useMessageDisplay } from '@/hooks/use-message-display';
import { usePrivacyPreferences } from '@/stores/user-preferences-store';
import { useCurrentInterfaceLanguage } from '@/stores/language-store';
import { formatTime } from '@/utils/date-format';
import { getUserDisplayName } from '@/utils/user-display-name';
import { MessageActionsBar } from './MessageActionsBar';
import { MessageAttachmentsSection } from './MessageAttachmentsSection';
import { MessageReadStatusDetails } from './MessageReadStatusDetails';
import { MessageReplyPreview } from './MessageReplyPreview';
import { ExpandableMessageText } from './ExpandableMessageText';
import { DeliveryIndicator } from './DeliveryIndicator';
import { MessageReactions } from '@/components/common/message-reactions';

/**
 * FocalRow — la rangée PLATE du mode Focal, sœur de `BubbleMessageNormalView`.
 *
 * Source : `docs/design/2026-08-15-focal-spec-integration.html` § 3.
 *
 * Aucune bulle. La hiérarchie vient de la perspective au défilement
 * (`useFocalScroller`), pas du chrome : la seule « carte » de tout l'écran est
 * le message au point (`data-focal-focused`), stylée en CSS pour rester sur le
 * chemin compositor.
 *
 * Elle sert les DEUX densités retenues par le verdict :
 * - `focal`  → la perspective est active au-dessus d'elle ;
 * - `script` → la même rangée, uniforme, sans perspective.
 *
 * `BubbleMessageNormalView` n'est pas touchée : elle reste la vue « bulles »
 * historique, à un tap via la Lentille.
 *
 * Cotes : pastille 22 · nom 13 extrabold (« Toi » en accent) · point médian ·
 * heure 12 · texte 15 / interligne 1.42 · retrait 29 aligné sur le nom.
 */
interface FocalRowProps {
  message: Omit<Message, 'translations'> & {
    location?: string;
    originalLanguage: string;
    translations: BubbleTranslation[];
    originalContent: string;
    readStatus?: Array<{ userId: string; readAt: Date }>;
    attachments?: unknown[];
    reactionSummary?: Record<string, number>;
    currentUserReactions?: string[];
  };
  currentUser?: User;
  userLanguage: string;
  currentDisplayLanguage: string;
  usedLanguages?: readonly string[];
  translationError?: string;
  conversationType?: ConversationType;
  userRole?: 'USER' | 'MEMBER' | 'MODERATOR' | 'ADMIN' | 'CREATOR' | 'AUDIT' | 'ANALYST' | 'BIGBOSS';
  conversationId?: string;
  isAnonymous?: boolean;
  currentAnonymousUserId?: string;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  onEnterReactionMode?: () => void;
  onEnterLanguageMode?: () => void;
  onEnterEditMode?: () => void;
  onEnterDeleteMode?: () => void;
  onEnterReportMode?: () => void;
  onEditMessage?: (messageId: string, newContent: string, originalLanguage: string) => Promise<void> | void;
  onDeleteMessage?: (messageId: string) => Promise<void> | void;
  onLanguageSwitch?: (messageId: string, language: string) => void;
  onReplyMessage?: (message: Message) => void;
  onForwardMessage?: (message: Message) => void;
  onNavigateToMessage?: (messageId: string) => void;
  onImageClick?: (attachmentId: string) => void;
  onForceTranslation?: (messageId: string, targetLanguage: string, model?: TranslationModel) => void;
}

// Les enfants réutilisés attendent chacun une forme structurelle précise du
// message. On dérive ces formes de leurs propres props plutôt que de traverser
// par `as unknown` : le cast reste explicite mais reste vérifié côté cible.
type AttachmentsMessage = React.ComponentProps<typeof MessageAttachmentsSection>['message'];
type ReplyPreviewProps = React.ComponentProps<typeof MessageReplyPreview>;
type ActionsBarMessage = React.ComponentProps<typeof MessageActionsBar>['message'];
type InteractionsMessage = Parameters<typeof useMessageInteractions>[0]['message'];
type DisplayMessage = Parameters<typeof useMessageDisplay>[0]['message'];

const AVATAR_INITIAL_COUNT = 1;

function initialOf(name: string): string {
  return name.trim().slice(0, AVATAR_INITIAL_COUNT).toUpperCase() || '?';
}

export const FocalRow = memo(function FocalRow({
  message,
  currentUser,
  userLanguage,
  currentDisplayLanguage,
  usedLanguages = [],
  translationError,
  conversationType = 'direct',
  userRole = 'USER',
  conversationId,
  isAnonymous = false,
  currentAnonymousUserId,
  isFirstInGroup = true,
  isLastInGroup = true,
  onEnterReactionMode,
  onEnterLanguageMode,
  onEnterEditMode,
  onEnterDeleteMode,
  onEnterReportMode,
  onEditMessage,
  onDeleteMessage,
  onLanguageSwitch,
  onReplyMessage,
  onForwardMessage,
  onNavigateToMessage,
  onImageClick,
}: FocalRowProps) {
  const { t: tBubble } = useI18n('bubbleStream');
  const { t: tReport } = useI18n('reportMessage');
  const locale = useCurrentInterfaceLanguage();
  const { token } = useAuth();
  const [showReadStatusDetails, setShowReadStatusDetails] = useState(false);
  const { preferences: privacyPreferences } = usePrivacyPreferences();

  const messageReactionsHook = useReactionsQuery({
    messageId: message.id,
    currentUserId: isAnonymous ? currentAnonymousUserId : (currentUser?.id || ''),
    isAnonymous,
    enabled: !!currentUser || !!currentAnonymousUserId,
    initialReactionSummary: message.reactionSummary,
    initialCurrentUserReactions: message.currentUserReactions,
  });

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
    message: message as unknown as InteractionsMessage,
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

  const {
    displayContent,
    displayContentWithMentions,
    replyToContent,
    availableVersions,
  } = useMessageDisplay({
    message: message as unknown as DisplayMessage,
    currentDisplayLanguage,
    usedLanguages,
  });

  const handleCopy = useCallback(async () => {
    await handleCopyMessage(displayContent);
  }, [handleCopyMessage, displayContent]);

  const handleQuickReaction = useCallback(
    (emoji: string) => {
      messageReactionsHook.addReaction(emoji);
    },
    [messageReactionsHook]
  );

  const senderName = isOwnMessage
    ? tBubble('bubble.you', 'Toi')
    : getUserDisplayName(
        message.sender as unknown as Parameters<typeof getUserDisplayName>[0],
        tBubble('anonymous')
      );

  const originalLanguage = message.originalLanguage || 'fr';
  const isTranslated = currentDisplayLanguage !== originalLanguage;
  const hasText = Boolean(message.content && message.content.trim());

  return (
    <TooltipProvider>
      <article
        id={`message-${message.id}`}
        className={cn('focal-row group/message px-4', isLastInGroup ? 'pb-2' : 'pb-0.5')}
        aria-label={`${senderName}, ${formatTime(new Date(message.createdAt), locale)}`}
      >
        {isFirstInGroup && (
          <header className="focal-row__identity flex items-center gap-2 pt-2.5">
            <span
              className="focal-row__avatar inline-flex flex-none items-center justify-center rounded-full text-[11px] font-bold text-white"
              aria-hidden="true"
            >
              {initialOf(senderName)}
            </span>
            <span
              className={cn(
                'text-[13px] font-extrabold leading-none',
                isOwnMessage ? 'focal-row__name--own' : 'text-gray-900 dark:text-gray-100'
              )}
            >
              {senderName}
            </span>
            <span className="text-gray-400 dark:text-gray-500" aria-hidden="true">
              ·
            </span>
            <time
              className="text-[12px] font-medium text-gray-500 dark:text-gray-400"
              dateTime={new Date(message.createdAt).toISOString()}
            >
              {formatTime(new Date(message.createdAt), locale)}
            </time>
          </header>
        )}

        <div className="focal-row__body">
          {message.replyTo && (
            <MessageReplyPreview
              replyTo={message.replyTo as unknown as ReplyPreviewProps['replyTo']}
              replyToContent={replyToContent}
              isOwnMessage={isOwnMessage}
              onNavigateToMessage={onNavigateToMessage}
              t={tBubble}
            />
          )}

          <MessageAttachmentsSection
            message={message as unknown as AttachmentsMessage}
            isOwnMessage={isOwnMessage}
            isAnonymous={isAnonymous}
            currentUserId={currentUser?.id}
            currentAnonymousUserId={currentAnonymousUserId}
            conversationId={conversationId}
            token={token || undefined}
            messageReactionsHook={messageReactionsHook}
            onImageClick={onImageClick}
          />

          {hasText && (
            <div className="focal-row__text">
              <ExpandableMessageText
                content={displayContentWithMentions}
                className="text-[15px] leading-[1.42] text-gray-900 dark:text-gray-100 break-words [&_a]:text-indigo-500 [&_a]:dark:text-indigo-400"
                isOwnMessage={false}
              />
            </div>
          )}

          <div className="focal-row__meta flex items-center gap-2 text-[10.5px] text-gray-500 dark:text-gray-400">
            {isTranslated && (
              <span
                className="inline-flex items-center gap-1"
                title={tBubble('bubble.translatedFrom', 'Traduit')}
              >
                <span aria-hidden="true">🌐</span>
                <span>{getLanguageInfo(originalLanguage)?.flag ?? originalLanguage}</span>
                <span aria-hidden="true">→</span>
                <span>
                  {getLanguageInfo(currentDisplayLanguage)?.flag ?? currentDisplayLanguage}
                </span>
              </span>
            )}

            <MessageReactions
              messageId={message.id}
              conversationId={conversationId || message.conversationId}
              currentUserId={currentUser?.id || ''}
              currentAnonymousUserId={currentAnonymousUserId}
              isAnonymous={isAnonymous}
              showAddButton={false}
              externalReactionsHook={messageReactionsHook}
            />

            {isOwnMessage && (
              <DeliveryIndicator
                isOwnMessage={isOwnMessage}
                messageId={message.id}
                conversationId={conversationId || message.conversationId}
              />
            )}
          </div>

          <MessageActionsBar
            message={message as unknown as ActionsBarMessage}
            isOwnMessage={isOwnMessage}
            canReportMessage={canReportMessage()}
            canEditMessage={canModifyMessage()}
            canDeleteMessage={canDeleteMessage()}
            onReply={onReplyMessage ? () => onReplyMessage(message as unknown as Message) : undefined}
            onForward={onForwardMessage && !message.isViewOnce ? () => onForwardMessage(message as unknown as Message) : undefined}
            onReaction={handleReactionClick}
            onQuickReaction={handleQuickReaction}
            onCopy={handleCopy}
            onReport={canReportMessage() ? handleReportMessage : undefined}
            onEdit={canModifyMessage() ? handleEditMessage : undefined}
            onDelete={canDeleteMessage() ? handleDeleteMessage : undefined}
            onViewInfo={
              isOwnMessage && privacyPreferences.showReadReceipts
                ? () => setShowReadStatusDetails(true)
                : undefined
            }
            t={tBubble}
            tReport={tReport}
            translationError={translationError}
            currentDisplayLanguage={currentDisplayLanguage}
            originalLanguage={originalLanguage}
            userLanguage={userLanguage}
            availableVersions={availableVersions}
            onLanguageSwitch={
              onLanguageSwitch ? (lang: string) => onLanguageSwitch(message.id, lang) : () => {}
            }
            onEnterLanguageMode={onEnterLanguageMode}
            getLanguageInfo={getLanguageInfo}
          />
        </div>
      </article>

      {isOwnMessage && (
        <MessageReadStatusDetails
          messageId={message.id}
          open={showReadStatusDetails}
          onOpenChange={setShowReadStatusDetails}
        />
      )}
    </TooltipProvider>
  );
});
