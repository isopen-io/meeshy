'use client';

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { MarkdownMessage } from '@/components/messages/MarkdownMessage';
import { MessageReactions } from '@/components/common/message-reactions';
import { MessageReplyPreview } from './MessageReplyPreview';
import { useMessageReadStatus, useReadStatusSummary } from '@/stores/conversation-ui-store';
import type { useReactionsQuery } from '@/hooks/queries/use-reactions-query';

type UseReactionsQueryReturn = ReturnType<typeof useReactionsQuery>;

const DeliveryIndicator = memo(function DeliveryIndicator({
  isOwnMessage,
  messageId,
  conversationId,
  isSending = false,
}: {
  isOwnMessage: boolean;
  messageId: string;
  conversationId: string;
  isSending?: boolean;
}) {
  const messageSummary = useMessageReadStatus(messageId);
  const conversationSummary = useReadStatusSummary(conversationId);

  if (!isOwnMessage) return null;

  // Horloge pendant l'envoi (message optimiste pas encore confirmé par le serveur)
  if (isSending) {
    return (
      <svg className="h-3 w-3 text-white/50 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Envoi en cours">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    );
  }

  // Per-message status takes priority, fallback to conversation-level summary
  const summary = messageSummary || conversationSummary;

  if (!summary) {
    return <Check className="h-3 w-3 text-white/60 flex-shrink-0" aria-label="Envoyé" />;
  }

  const { totalMembers, deliveredCount, readCount } = summary;

  if (totalMembers > 0 && readCount >= totalMembers) {
    return (
      <span className="inline-flex -space-x-1.5 flex-shrink-0" aria-label="Lu par tous">
        <Check className="h-3 w-3 text-sky-300" />
        <Check className="h-3 w-3 text-sky-300" />
      </span>
    );
  }

  if (readCount > 0) {
    return (
      <span className="inline-flex -space-x-1.5 flex-shrink-0" aria-label="Lu">
        <Check className="h-3 w-3 text-sky-300" />
        <Check className="h-3 w-3 text-sky-300" />
      </span>
    );
  }

  if (deliveredCount > 0) {
    return (
      <span className="inline-flex -space-x-1.5 flex-shrink-0" aria-label="Distribué">
        <Check className="h-3 w-3 text-white/60" />
        <Check className="h-3 w-3 text-white/60" />
      </span>
    );
  }

  return <Check className="h-3 w-3 text-white/60 flex-shrink-0" aria-label="Envoyé" />;
});

interface MessageContentProps {
  message: {
    id: string;
    content: string;
    conversationId: string;
    replyTo?: {
      id: string;
      content: string;
      createdAt: Date | string;
      sender?: unknown;
      attachments?: unknown[];
    };
  };
  displayContentWithMentions: string;
  replyToContent: string | null;
  isOwnMessage: boolean;
  isAnonymous: boolean;
  currentUserId?: string;
  currentAnonymousUserId?: string;
  conversationId?: string;
  messageReactionsHook: UseReactionsQueryReturn;
  onNavigateToMessage?: (messageId: string) => void;
  t: (key: string) => string;
  isSending?: boolean;
}

export const MessageContent = memo(function MessageContent({
  message,
  displayContentWithMentions,
  replyToContent,
  isOwnMessage,
  isAnonymous,
  currentUserId,
  currentAnonymousUserId,
  conversationId,
  messageReactionsHook,
  onNavigateToMessage,
  t,
  isSending = false,
}: MessageContentProps) {
  if (!message.content || !message.content.trim()) {
    return null;
  }

  return (
    <div className={cn(
      "relative flex w-full max-w-full mb-1 overflow-visible",
      isOwnMessage ? "ml-auto" : "mr-auto"
    )}>
      <Card
        className={cn(
          "relative transition-colors duration-200 border overflow-hidden py-0 w-full rounded-2xl",
          isOwnMessage
            ? 'bg-gradient-to-br from-indigo-500 to-indigo-700 dark:from-indigo-600 dark:to-indigo-800 border-indigo-400 dark:border-indigo-600 text-white shadow-md shadow-indigo-500/30 dark:shadow-indigo-900/40'
            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm shadow-gray-200/50 dark:shadow-gray-900/30'
        )}
      >
        <CardContent className="px-3.5 py-2.5 w-full break-words overflow-hidden overflow-wrap-anywhere">
          {/* Message de réponse (replyTo) */}
          {message.replyTo && (
            <MessageReplyPreview
              replyTo={message.replyTo}
              replyToContent={replyToContent}
              isOwnMessage={isOwnMessage}
              onNavigateToMessage={onNavigateToMessage}
              t={t}
            />
          )}

          {/* Contenu principal */}
          <div className="mb-0" style={{ position: 'relative', zIndex: 1 }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`content-${message.id}-${displayContentWithMentions.substring(0, 10)}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ position: 'relative', zIndex: 1 }}
              >
                <MarkdownMessage
                  content={displayContentWithMentions}
                  className={cn(
                    "text-sm sm:text-base break-words",
                    isOwnMessage
                      ? "text-white [&_code]:bg-white/15 [&_code]:text-white/95 [&_pre]:bg-white/10 [&_a]:text-indigo-200 [&_a]:underline"
                      : "text-gray-800 dark:text-gray-100 [&_a]:text-indigo-500 [&_a]:dark:text-indigo-400"
                  )}
                  enableTracking={true}
                  isOwnMessage={isOwnMessage}
                  onLinkClick={() => {}}
                />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Delivery status indicator for own messages */}
          {isOwnMessage && (
            <div className="flex justify-end px-1 pb-0.5 -mt-0.5">
              <DeliveryIndicator
                isOwnMessage={isOwnMessage}
                messageId={message.id}
                conversationId={conversationId || message.conversationId}
                isSending={isSending}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Réactions - Superposées en bas de la bulle */}
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
});
