'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { Users } from 'lucide-react';
import { getUserStatus } from '@/lib/user-status';
import { getLanguageDisplayName, getLanguageFlag } from '@/utils/language-utils';
import type { User } from '@meeshy/shared/types';
import { useI18n } from '@/hooks/use-i18n';

interface ActiveUsersSectionProps {
  activeUsers: User[];
}

/**
 * Section displaying active users in the conversation
 * Shows up to 6 users with online status and language
 */
export function ActiveUsersSection({ activeUsers }: ActiveUsersSectionProps) {
  const { t } = useI18n('conversations');
  const displayUsers = activeUsers.slice(0, 6);
  const remainingCount = activeUsers.length - 6;

  if (activeUsers.length === 0) {
    return (
      <div className="text-center py-4">
        <Users className="h-8 w-8 mx-auto mb-2 text-gray-400" />
        <p className="text-sm text-gray-500">{t('conversationDetails.noActiveUsers')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {displayUsers.map((user) => (
        <div
          key={user.id}
          className="flex items-center space-x-3 p-2 rounded hover:bg-accent cursor-pointer transition-colors"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.avatar} alt={user.firstName} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
              {(user.firstName || user.username || 'U').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {user.firstName && user.lastName
                ? `${user.firstName} ${user.lastName}`
                : user.username}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {getLanguageDisplayName(user.systemLanguage)} {getLanguageFlag(user.systemLanguage)}
            </p>
          </div>
          <OnlineIndicator
            isOnline={getUserStatus(user) === 'online'}
            status={getUserStatus(user)}
            size="sm"
          />
        </div>
      ))}

      {remainingCount > 0 && (
        <div className="text-center pt-2">
          <p className="text-xs text-gray-500">
            {t('conversationDetails.otherActiveUsers', { count: remainingCount })}
          </p>
        </div>
      )}
    </div>
  );
}
