'use client';

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { MarkdownMessage } from '@/components/messages/MarkdownMessage';
import { MessageReactions } from '@/components/common/message-reactions';
import { MessageReplyPreview } from './MessageReplyPreview';
import { useReadStatusSummary } from '@/stores/conversation-store';
import type { useReactionsQuery } from '@/hooks/queries/use-reactions-query';

type UseReactionsQueryReturn = ReturnType<typeof useReactionsQuery>;

const DeliveryIndicator = memo(function DeliveryIndicator({
  isOwnMessage,
  conversationId,
}: {
  isOwnMessage: boolean;
  conversationId: string;
}) {
  const summary = useReadStatusSummary(conversationId);

  if (!isOwnMessage) return null;

  if (!summary) {
    return <Check className="h-3 w-3 text-gray-400 flex-shrink-0" />;
  }

  const { totalMembers, deliveredCount, readCount } = summary;

  if (totalMembers > 0 && readCount >= totalMembers) {
    return (
      <span className="inline-flex -space-x-1.5 flex-shrink-0">
        <Check className="h-3 w-3 text-indigo-400" />
        <Check className="h-3 w-3 text-indigo-400" />
      </span>
    );
  }

  if (deliveredCount > 0) {
    return (
      <span className="inline-flex -space-x-1.5 flex-shrink-0">
        <Check className="h-3 w-3 text-gray-400" />
        <Check className="h-3 w-3 text-gray-400" />
      </span>
    );
  }

  return <Check className="h-3 w-3 text-gray-400 flex-shrink-0" />;
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
      sender?: any;
      attachments?: any[];
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
          "relative transition-colors duration-200 border shadow-none overflow-hidden py-0 w-full",
          isOwnMessage
            ? 'bg-gradient-to-br from-blue-400 to-blue-500 dark:from-gray-700 dark:to-gray-800 border-blue-400 dark:border-gray-600 text-white'
            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        )}
      >
        <CardContent className="p-1 w-full break-words overflow-hidden overflow-wrap-anywhere">
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
                      ? "text-white [&_code]:bg-white/10 [&_code]:text-white/90 [&_pre]:bg-white/10"
                      : "text-gray-800 dark:text-gray-100"
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
                conversationId={conversationId || message.conversationId}
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
