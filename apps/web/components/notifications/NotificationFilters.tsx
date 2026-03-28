'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Bell,
  MessageSquare,
  Users,
  Phone,
  UserPlus,
  Heart,
} from 'lucide-react';
import type { Notification } from '@/types/notification';

export type FilterType = 'all' | 'new_message' | 'conversation' | 'missed_call' | 'friend_request' | 'mention' | 'reaction';

type FilterOption = {
  value: FilterType;
  label: string;
  labelShort?: string;
  icon: typeof MessageSquare;
};

type TranslateFunction = (key: string, params?: Record<string, string>) => string;

type NotificationFiltersProps = {
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  notifications: Notification[];
  t: TranslateFunction;
};

function getFilterOptions(t: TranslateFunction): FilterOption[] {
  return [
    { value: 'all', label: t('filters.all'), labelShort: t('filters.all'), icon: Bell },
    { value: 'new_message', label: t('filters.messages'), labelShort: t('filters.messagesShort'), icon: MessageSquare },
    { value: 'mention', label: t('filters.mentions'), labelShort: t('filters.mentionsShort'), icon: MessageSquare },
    { value: 'reaction', label: t('filters.reactions'), labelShort: t('filters.reactionsShort'), icon: Heart },
    { value: 'conversation', label: t('filters.conversations'), labelShort: t('filters.conversationsShort'), icon: Users },
    { value: 'missed_call', label: t('filters.calls'), labelShort: t('filters.callsShort'), icon: Phone },
    { value: 'friend_request', label: t('filters.friendRequests'), labelShort: t('filters.friendRequestsShort'), icon: UserPlus },
  ];
}

function countByFilter(notifications: Notification[], filter: FilterType): number {
  if (filter === 'all') return notifications.length;

  return notifications.filter((n) => {
    switch (filter) {
      case 'new_message': return n.type === 'new_message' || n.type === 'message';
      case 'mention': return n.type === 'user_mentioned' || n.type === 'mention';
      case 'reaction': return n.type === 'message_reaction' || n.type === 'reaction';
      case 'conversation': return n.type === 'conversation' || n.type === 'new_conversation';
      case 'missed_call': return n.type === 'missed_call';
      case 'friend_request': return n.type === 'friend_request';
      default: return false;
    }
  }).length;
}

export function matchesFilter(notification: Notification, filter: FilterType): boolean {
  if (filter === 'all') return true;

  switch (filter) {
    case 'new_message': return notification.type === 'new_message' || notification.type === 'message';
    case 'mention': return notification.type === 'user_mentioned' || notification.type === 'mention';
    case 'reaction': return notification.type === 'message_reaction' || notification.type === 'reaction';
    case 'conversation': return notification.type === 'conversation' || notification.type === 'new_conversation';
    case 'missed_call': return notification.type === 'missed_call';
    case 'friend_request': return notification.type === 'friend_request';
    default: return false;
  }
}

export const NotificationFilters = memo(function NotificationFilters({
  activeFilter,
  onFilterChange,
  notifications,
  t,
}: NotificationFiltersProps) {
  const filters = getFilterOptions(t);

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
      {filters.map((filter) => {
        const Icon = filter.icon;
        const count = countByFilter(notifications, filter.value);
        const isActive = activeFilter === filter.value;

        return (
          <motion.button
            key={filter.value}
            onClick={() => onFilterChange(filter.value)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              'flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
              isActive
                ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25'
                : 'backdrop-blur-sm bg-white/50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:bg-white/70 dark:hover:bg-gray-800/70 border border-white/30 dark:border-gray-700/40'
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{filter.label}</span>
            <span className="sm:hidden">{filter.labelShort || filter.label}</span>
            {count > 0 && (
              <span className={cn(
                'px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums',
                isActive
                  ? 'bg-white/20 text-white'
                  : 'bg-gray-200/50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300'
              )}>
                {count}
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
});
