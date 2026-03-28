'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, Trash2, Users } from 'lucide-react';
import type { Notification } from '@/types/notification';
import { buildNotificationTitle, buildNotificationContent, getNotificationIcon } from '@/utils/notification-helpers';

type TranslateFunction = (key: string, params?: Record<string, string>) => string;

type NotificationItemProps = {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  onClick: (notification: Notification) => void;
  formatTimeAgo: (date: Date | string | null) => string;
  t: TranslateFunction;
  compact?: boolean;
  index?: number;
};

export const NotificationItem = memo(function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
  onClick,
  formatTimeAgo,
  t,
  compact = false,
  index = 0,
}: NotificationItemProps) {
  const isUnread = !notification.state.isRead;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ delay: index * 0.03 }}
      onClick={() => onClick(notification)}
      className={cn(
        'backdrop-blur-xl rounded-2xl shadow-lg shadow-black/5 dark:shadow-black/20 border cursor-pointer transition-all hover:scale-[1.02] group',
        isUnread
          ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-200/50 dark:border-blue-800/40 hover:bg-blue-100/80 dark:hover:bg-blue-950/60 opacity-100'
          : 'bg-white/60 dark:bg-gray-900/60 border-white/30 dark:border-gray-700/40 hover:bg-white/80 dark:hover:bg-gray-900/80 opacity-75'
      )}
    >
      <div className={cn('flex items-start gap-4', compact ? 'p-3' : 'p-4')}>
        <div className="relative flex-shrink-0">
          <Avatar className={cn(compact ? 'h-10 w-10' : 'h-12 w-12', 'ring-2 ring-white/50 dark:ring-gray-800/50')}>
            <AvatarImage src={notification.actor?.avatar || undefined} />
            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-semibold">
              {(notification.actor?.displayName || notification.actor?.username || 'U').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="absolute -bottom-1 -right-1 text-sm leading-none select-none">
            {getNotificationIcon(notification).emoji}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn(
                'font-semibold text-sm leading-snug',
                isUnread
                  ? 'text-gray-900 dark:text-white'
                  : 'text-gray-700 dark:text-gray-300'
              )}>
                {buildNotificationTitle(notification, t)}
              </span>
              {isUnread && (
                <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              )}
            </div>
            <span className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap tabular-nums">
              {formatTimeAgo(notification.state.createdAt)}
            </span>
          </div>

          {(() => {
            const body = buildNotificationContent(notification, t);
            return body ? (
              <p className={cn(
                'text-sm mb-1 line-clamp-2',
                isUnread
                  ? 'text-gray-800 dark:text-gray-200'
                  : 'text-gray-600 dark:text-gray-400'
              )}>
                {body}
              </p>
            ) : null;
          })()}

          {!compact && notification.context?.conversationTitle && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mt-1">
              <Users className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">
                {notification.context.conversationType === 'direct'
                  ? t('conversationTypes.private')
                  : notification.context.conversationTitle}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {isUnread && (
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onMarkAsRead(notification.id);
              }}
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 hover:bg-white/50 dark:hover:bg-gray-800/50"
              aria-label={t('actions.markAsRead')}
            >
              <Check className="h-4 w-4" />
            </Button>
          )}
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(notification.id);
            }}
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400"
            aria-label={t('actions.delete')}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
});
