'use client';

/**
 * ConversationView - Composant unifié pour afficher une conversation
 *
 * Élimine la duplication mobile/desktop en utilisant des props conditionnelles.
 * Respecte les Vercel React Best Practices et Web Interface Guidelines.
 *
 * @module components/conversations/ConversationView
 */

import React, { memo, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { ConversationHeader } from './ConversationHeader';
import { ConversationMessages } from './ConversationMessages';
import { MessageComposer } from '@/components/common/message-composer';
import { ConnectionStatusIndicator } from './connection-status-indicator';
import { FailedMessageBanner } from '@/components/messages/failed-message-banner';
import { getAuthToken } from '@/utils/token-utils';
import type { Conversation, ThreadMember, UserRoleEnum, Message, User } from '@meeshy/shared/types';
import type { FailedMessage } from '@/stores/failed-messages-store';
import type { LanguageChoice } from '@/types/bubble-stream';

// Types pour les indicateurs de frappe
interface TypingIndicator {
  userId: string;
  username: string;
  conversationId: string;
  timestamp: number;
}

interface TypingUser {
  id: string;
  displayName: string;
}

interface ConversationViewProps {
  // Données principales
  conversation: Conversation;
  currentUser: User;
  messages: Message[];
  participants: ThreadMember[];

  // État UI
  isMobile: boolean;
  isKeyboardOpen?: boolean;
  isConnected: boolean;

  // Langues et traduction
  selectedLanguage: string;
  usedLanguages: string[];
  userLanguage: string;

  // États de chargement
  isLoadingMessages: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;

  // Composer
  composerValue: string;
  languageChoices: LanguageChoice[];
  attachmentIds?: string[];

  // Typing
  typingUsers: TypingUser[];

  // Traduction en cours
  addTranslatingState: (messageId: string, targetLanguage: string) => void;
  isTranslating: (messageId: string, targetLanguage: string) => boolean;

  // Handlers - Messages
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onReplyMessage: (message: Message) => void;
  onNavigateToMessage: (messageId: string) => Promise<void>;
  onImageClick: (attachmentId: string) => void;
  onLoadMore: () => void;

  // Handlers - Composer
  onComposerChange: (value: string) => void;
  onSendMessage: () => void;
  onLanguageChange: (language: string) => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  onAttachmentsChange: (ids: string[], mimeTypes: string[]) => void;

  // Handlers - Failed messages
  onRetryFailedMessage: (msg: FailedMessage) => Promise<boolean>;
  onRestoreFailedMessage: (msg: FailedMessage) => void;

  // Handlers - Navigation et UI
  onBackToList: () => void;
  onStartCall: () => void;
  onOpenGallery: () => void;

  // Handlers - Participants
  onParticipantAdded?: (userId: string) => void;
  onParticipantRemoved?: (userId: string) => void;
  onLinkCreated?: (link: any) => void;

  // Refs
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  composerRef: React.RefObject<{
    focus: () => void;
    blur: () => void;
    clearAttachments?: () => void;
    clearMentionedUserIds?: () => void;
    getMentionedUserIds?: () => string[];
  } | null>;

  // i18n
  t: (key: string, params?: Record<string, string>) => string;
  tCommon: (key: string) => string;

  // Options
  showBackButton?: boolean;
}

/**
 * Transforme les typingUsers en format attendu par ConversationHeader
 */
function mapTypingUsers(users: TypingUser[], conversationId: string): TypingIndicator[] {
  return users.map(u => ({
    userId: u.id,
    username: u.displayName,
    conversationId,
    timestamp: Date.now(),
  }));
}

/**
 * Composant unifié pour afficher une conversation (mobile et desktop)
 */
export const ConversationView = memo(forwardRef<HTMLDivElement, ConversationViewProps>(
  function ConversationView(props, ref) {
    const {
      conversation,
      currentUser,
      messages,
      participants,
      isMobile,
      isKeyboardOpen = false,
      isConnected,
      selectedLanguage,
      usedLanguages,
      userLanguage,
      isLoadingMessages,
      isLoadingMore,
      hasMore,
      composerValue,
      languageChoices,
      typingUsers,
      addTranslatingState,
      isTranslating,
      onEditMessage,
      onDeleteMessage,
      onReplyMessage,
      onNavigateToMessage,
      onImageClick,
      onLoadMore,
      onComposerChange,
      onSendMessage,
      onLanguageChange,
      onKeyPress,
      onAttachmentsChange,
      onRetryFailedMessage,
      onRestoreFailedMessage,
      onBackToList,
      onStartCall,
      onOpenGallery,
      onParticipantAdded,
      onParticipantRemoved,
      onLinkCreated,
      scrollContainerRef,
      composerRef,
      t,
      tCommon,
      showBackButton = false,
    } = props;

    // Normaliser le type de conversation
    const conversationType = normalizeConversationType(conversation.type);

    // Token pour les attachments
    const token = typeof window !== 'undefined' ? getAuthToken()?.value : undefined;

    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col bg-white dark:bg-gray-950 overflow-hidden",
          isMobile
            ? "fixed inset-0 z-50"
            : "w-full h-full shadow-xl"
        )}
      >
        {/* Header */}
        <header
          className={cn(
            "flex-shrink-0 bg-gradient-to-r from-gray-50 to-gray-100",
            "dark:from-gray-900 dark:to-gray-800",
            "shadow-md border-b-2 border-gray-200 dark:border-gray-700",
            "transition-[max-height,padding] duration-300",
            isMobile && isKeyboardOpen && "max-h-14 overflow-hidden"
          )}
          role="banner"
        >
          <ConversationHeader
            conversation={conversation}
            currentUser={currentUser}
            conversationParticipants={participants}
            typingUsers={mapTypingUsers(typingUsers, conversation.id)}
            isMobile={isMobile}
            onBackToList={onBackToList}
            onParticipantRemoved={onParticipantRemoved || (() => {})}
            onParticipantAdded={onParticipantAdded || (() => {})}
            onLinkCreated={onLinkCreated || (() => {})}
            onStartCall={onStartCall}
            onOpenGallery={onOpenGallery}
            t={t}
            showBackButton={showBackButton}
          />

          {!isConnected && (
            <div className={cn("py-2", isMobile ? "px-4" : "px-6")}>
              <ConnectionStatusIndicator />
            </div>
          )}
        </header>

        {/* Messages */}
        <div
          ref={scrollContainerRef}
          className={cn(
            "flex-1 overflow-y-auto overflow-x-hidden min-h-0",
            isMobile
              ? "bg-transparent pb-4"
              : "bg-gradient-to-b from-gray-50/50 to-white dark:from-gray-900/50 dark:to-gray-950"
          )}
          role="region"
          aria-live="polite"
          aria-label={t('conversationLayout.messagesList')}
        >
          <ConversationMessages
            messages={messages}
            translatedMessages={messages as any}
            currentUser={currentUser}
            userLanguage={userLanguage}
            usedLanguages={usedLanguages}
            isLoadingMessages={isLoadingMessages}
            isLoadingMore={isLoadingMore}
            hasMore={hasMore}
            isMobile={isMobile}
            conversationType={conversationType}
            scrollContainerRef={scrollContainerRef}
            userRole={currentUser.role as UserRoleEnum}
            conversationId={conversation.id}
            addTranslatingState={addTranslatingState}
            isTranslating={isTranslating}
            onEditMessage={onEditMessage}
            onDeleteMessage={onDeleteMessage}
            onReplyMessage={onReplyMessage}
            onNavigateToMessage={onNavigateToMessage}
            onImageClick={onImageClick}
            onLoadMore={onLoadMore}
            t={t}
            tCommon={tCommon}
            reverseOrder={true}
          />
        </div>

        {/* Composer */}
        <div
          className={cn(
            "flex-shrink-0 bg-white/98 dark:bg-gray-950/98 backdrop-blur-xl",
            "border-t-2 border-gray-200 dark:border-gray-700 shadow-2xl",
            isMobile ? "p-4" : "p-6"
          )}
          style={isMobile ? { paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' } : undefined}
        >
          <FailedMessageBanner
            conversationId={conversation.id}
            onRetry={onRetryFailedMessage}
            onRestore={onRestoreFailedMessage}
          />

          <MessageComposer
            ref={composerRef}
            value={composerValue}
            onChange={onComposerChange}
            onSend={onSendMessage}
            selectedLanguage={selectedLanguage}
            onLanguageChange={onLanguageChange}
            placeholder={t('conversationLayout.writeMessage')}
            onKeyPress={onKeyPress}
            choices={languageChoices}
            onAttachmentsChange={onAttachmentsChange}
            token={token}
            userRole={currentUser.role}
            conversationId={conversation.id}
          />
        </div>
      </div>
    );
  }
));

/**
 * Normalise le type de conversation pour ConversationMessages
 */
function normalizeConversationType(type: string): 'direct' | 'group' | 'public' {
  if (type === 'anonymous') return 'direct';
  if (type === 'broadcast') return 'public';
  if (type === 'direct' || type === 'group' || type === 'public') {
    return type;
  }
  return 'direct';
}

ConversationView.displayName = 'ConversationView';
