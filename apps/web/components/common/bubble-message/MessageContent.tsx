'use client';

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { MarkdownMessage } from '@/components/messages/MarkdownMessage';
import { MessageReactions } from '@/components/common/message-reactions';
import { MessageReplyPreview } from './MessageReplyPreview';
import type { useReactionsQuery } from '@/hooks/queries/use-reactions-query';

type UseReactionsQueryReturn = ReturnType<typeof useReactionsQuery>;

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
      anonymousSender?: any;
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
  onAddReactionClick?: () => void;
  conversationColor?: string;
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
  onAddReactionClick,
  conversationColor,
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
        </CardContent>
      </Card>

      {/* Réactions - Par-dessus le message, angle bas-gauche */}
      <div
        className={cn(
          "absolute z-[99999] transition-transform duration-200",
          "left-1"
        )}
        style={{
          pointerEvents: 'auto',
          bottom: '2px'
        }}
      >
        <MessageReactions
          messageId={message.id}
          conversationId={conversationId || message.conversationId}
          currentUserId={currentUserId || ''}
          currentAnonymousUserId={currentAnonymousUserId}
          isAnonymous={isAnonymous}
          showAddButton={true}
          onAddReactionClick={onAddReactionClick}
          externalReactionsHook={messageReactionsHook}
          conversationColor={conversationColor}
        />
      </div>
    </div>
  );
});
