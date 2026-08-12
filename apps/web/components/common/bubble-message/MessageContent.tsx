'use client';

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, CornerUpRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ExpandableMessageText } from './ExpandableMessageText';
import { MessageReactions } from '@/components/common/message-reactions';
import { MessageReplyPreview } from './MessageReplyPreview';
import { DeliveryIndicator } from './DeliveryIndicator';
import type { useReactionsQuery } from '@/hooks/queries/use-reactions-query';
import type { TFunction } from '@/hooks/use-i18n';

type UseReactionsQueryReturn = ReturnType<typeof useReactionsQuery>;

interface MessageContentProps {
  message: {
    id: string;
    content: string;
    conversationId: string;
    forwardedFromId?: string;
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
  t: TFunction;
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
          "relative transition-colors duration-200 border overflow-hidden py-0 w-full rounded-2xl",
          isOwnMessage
            ? 'bg-gradient-to-br from-indigo-500 to-indigo-700 dark:from-indigo-600 dark:to-indigo-800 border-indigo-400 dark:border-indigo-600 text-white shadow-md shadow-indigo-500/30 dark:shadow-indigo-900/40'
            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm shadow-gray-200/50 dark:shadow-gray-900/30'
        )}
      >
        <CardContent className="px-3.5 py-2.5 w-full break-words overflow-hidden overflow-wrap-anywhere">
          {/* Forwarded indicator */}
          {message.forwardedFromId && (
            <div className={cn(
              "flex items-center gap-1 mb-1.5 text-xs font-medium",
              isOwnMessage ? "text-indigo-200" : "text-gray-400 dark:text-gray-500"
            )}>
              <CornerUpRight className="h-3 w-3 flex-shrink-0" />
              <span>{t('bubble.forwarded', 'Forwarded')}</span>
            </div>
          )}

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
                <ExpandableMessageText
                  content={displayContentWithMentions}
                  className={cn(
                    "text-sm sm:text-base break-words",
                    isOwnMessage
                      ? "text-white [&_code]:bg-white/15 [&_code]:text-white/95 [&_pre]:bg-white/10 [&_a]:text-indigo-200 [&_a]:underline"
                      : "text-gray-800 dark:text-gray-100 [&_a]:text-indigo-500 [&_a]:dark:text-indigo-400"
                  )}
                  isOwnMessage={isOwnMessage}
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
