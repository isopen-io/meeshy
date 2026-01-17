'use client';

import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/hooks/useI18n';
import type { ConversationLink } from '@/hooks/use-link-validation';

interface JoinInfoProps {
  conversationLink: ConversationLink;
}

export function JoinInfo({ conversationLink }: JoinInfoProps) {
  const { t } = useI18n('joinPage');

  const getConversationTypeLabel = (type: string | undefined) => {
    switch (type) {
      case 'group': return t('group');
      case 'direct': return t('direct');
      case 'public': return t('public');
      case 'global': return t('global');
      default: return t('privateConversation');
    }
  };

  const getBadgeVariant = (type: string | undefined) => {
    switch (type) {
      case 'group':
      case 'global':
        return "default";
      case 'public':
        return "secondary";
      case 'direct':
        return "outline";
      default:
        return "secondary";
    }
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('type')}:</span>
        <Badge variant={getBadgeVariant(conversationLink.conversation?.type) as any}>
          {getConversationTypeLabel(conversationLink.conversation?.type)}
        </Badge>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('participants')}:</span>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {conversationLink.stats?.totalParticipants || 0} {t('members')}
          {conversationLink.stats && conversationLink.stats.anonymousCount > 0 && (
            <span className="text-xs text-gray-500 ml-1">
              {t('includingAnonymous', { count: conversationLink.stats.anonymousCount })}
            </span>
          )}
        </span>
      </div>

      {conversationLink.stats && conversationLink.stats.languageCount > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('spokenLanguages')}:</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {conversationLink.stats.languageCount} {t('languages')}
            </span>
            <div className="flex gap-1">
              {conversationLink.stats.spokenLanguages.slice(0, 3).map((lang: string) => (
                <span
                  key={lang}
                  className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full"
                >
                  {lang.toUpperCase()}
                </span>
              ))}
              {conversationLink.stats.languageCount > 3 && (
                <span className="text-xs text-gray-500">
                  +{conversationLink.stats.languageCount - 3}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('createdOn')}:</span>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {conversationLink.conversation?.createdAt ? new Date(conversationLink.conversation.createdAt).toLocaleDateString() : 'N/A'}
        </span>
      </div>

      {conversationLink.expiresAt && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('expiresOn')}:</span>
          <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center">
            <Clock className="h-4 w-4 mr-1" />
            {new Date(conversationLink.expiresAt).toLocaleDateString()}
          </span>
        </div>
      )}
    </div>
  );
}
