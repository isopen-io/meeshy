'use client';

import { memo } from 'react';
import Link from 'next/link';
import { Ghost, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { getUserDisplayName } from '@/utils/user-display-name';
import { formatRelativeDate } from '@/utils/date-format';
import { cn } from '@/lib/utils';
import { AttachmentPreviewReply } from '@/components/attachments/AttachmentPreviewReply';
import type { MessageSender, AnonymousSender } from './types';

interface MessageReplyPreviewProps {
  replyTo: {
    id: string;
    content: string;
    createdAt: Date | string;
    sender?: MessageSender;
    anonymousSender?: AnonymousSender;
    attachments?: any[];
  };
  replyToContent: string | null;
  isOwnMessage: boolean;
  onNavigateToMessage?: (messageId: string) => void;
  t: (key: string) => string;
}

export const MessageReplyPreview = memo(function MessageReplyPreview({
  replyTo,
  replyToContent,
  isOwnMessage,
  onNavigateToMessage,
  t,
}: MessageReplyPreviewProps) {
  const replyUsername = replyTo.anonymousSender?.username || replyTo.sender?.username;
  const replyUser = replyTo.anonymousSender || replyTo.sender;
  const replyDisplayName = getUserDisplayName(replyUser, t('unknownUser'));
  const isReplyAnonymous = !!replyTo.anonymousSender;

  return (
    <motion.div
      initial={{ opacity: 0, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mb-1"
    >
      <div
        onClick={() => {
          if (replyTo.id && onNavigateToMessage) {
            onNavigateToMessage(replyTo.id);
          }
        }}
        className={cn(
          "relative overflow-hidden rounded-md border-l-2 px-2 py-1.5 cursor-pointer transition-colors duration-200 group text-xs",
          isOwnMessage
            ? "bg-white/20 border-white/40 backdrop-blur-sm hover:bg-white/30"
            : "bg-gray-50/90 dark:bg-gray-700/40 border-blue-400 dark:border-blue-500 hover:bg-gray-100/90 dark:hover:bg-gray-700/60"
        )}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 mb-1">
              {isReplyAnonymous ? (
                <span className={cn(
                  "text-xs font-semibold truncate flex items-center gap-1",
                  isOwnMessage ? "text-white/90" : "text-gray-700 dark:text-gray-200"
                )}>
                  <Ghost className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                  {replyDisplayName}
                </span>
              ) : replyUsername ? (
                <Link
                  href={`/u/${replyUsername}`}
                  className={cn(
                    "text-xs font-semibold truncate hover:underline transition-colors cursor-pointer",
                    isOwnMessage
                      ? "text-white/90 hover:text-white"
                      : "text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400"
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  {replyDisplayName}
                </Link>
              ) : (
                <span className={cn(
                  "text-xs font-semibold truncate",
                  isOwnMessage ? "text-white/90" : "text-gray-700 dark:text-gray-200"
                )}>
                  {replyDisplayName}
                </span>
              )}
              <span className={cn(
                "text-[10px]",
                isOwnMessage ? "text-white/60" : "text-gray-500 dark:text-gray-400"
              )}>
                {formatRelativeDate(replyTo.createdAt, { t })}
              </span>
            </div>
            <p className={cn(
              "text-xs line-clamp-2 leading-snug",
              isOwnMessage ? "text-white/80" : "text-gray-600 dark:text-gray-300"
            )}>
              {replyToContent || replyTo.content}
            </p>
            {replyTo.attachments && replyTo.attachments.length > 0 && (
              <AttachmentPreviewReply
                attachments={replyTo.attachments}
                isOwnMessage={isOwnMessage}
              />
            )}
          </div>
          <MessageCircle className={cn(
            "h-3 w-3 flex-shrink-0 mt-0.5",
            isOwnMessage ? "text-white/50" : "text-blue-500/50 dark:text-blue-400/50"
          )} />
        </div>
      </div>
    </motion.div>
  );
});
