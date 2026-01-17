'use client';

import { memo } from 'react';
import Link from 'next/link';
import { Ghost } from 'lucide-react';
import { getUserDisplayName } from '@/utils/user-display-name';
import { formatRelativeDate } from '@/utils/date-format';
import { cn } from '@/lib/utils';
import type { MessageSender, AnonymousSender } from './types';

interface MessageNameDateProps {
  message: {
    createdAt: Date | string;
    sender?: MessageSender;
    anonymousSender?: AnonymousSender;
  };
  isOwnMessage: boolean;
  t: (key: string) => string;
}

export const MessageNameDate = memo(function MessageNameDate({
  message,
  isOwnMessage,
  t,
}: MessageNameDateProps) {
  const user = message.anonymousSender || message.sender;
  const username = message.anonymousSender?.username || message.sender?.username;
  const displayName = getUserDisplayName(user, t('anonymous'));
  const isAnonymous = !!message.anonymousSender;

  return (
    <div className={cn(
      "flex items-center gap-1 mb-0.5 px-1",
      isOwnMessage && "flex-row-reverse"
    )}>
      {isAnonymous ? (
        <span className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1">
          <Ghost className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
          {displayName}
        </span>
      ) : username ? (
        <Link
          href={`/u/${username}`}
          className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        >
          {displayName}
        </Link>
      ) : (
        <span className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300">
          {displayName}
        </span>
      )}
      <span className="text-gray-400 dark:text-gray-500">•</span>
      <time className="text-xs text-gray-500 dark:text-gray-400">
        {formatRelativeDate(message.createdAt, { t })}
      </time>
    </div>
  );
});
