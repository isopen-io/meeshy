import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { RankingItem } from '@/hooks/use-ranking-data';
import { RANKING_CRITERIA, criterionLabelKey } from './constants';
import { formatCount, getRankBadge } from './utils';
import { useI18n } from '@/hooks/useI18n';

interface LinkRankCardProps {
  item: RankingItem;
  criterion: string;
}

export const LinkRankCard = React.memo(({ item, criterion }: LinkRankCardProps) => {
  const { t } = useI18n('admin');
  const currentCriterion = RANKING_CRITERIA.links.find(c => c.value === criterion);
  const isTopThree = item.rank && item.rank <= 3;

  return (
    <div
      className={`flex items-center justify-between p-4 rounded-lg transition-[color,box-shadow] hover:shadow-md ${
        isTopThree
          ? 'bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/10 dark:to-amber-900/10 border-2 border-yellow-300 dark:border-yellow-700'
          : 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className="flex items-center space-x-4 flex-1">
        <div className="flex items-center justify-center w-12">
          {item.rank && getRankBadge(item.rank)}
        </div>

        <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center text-2xl ring-2 ring-yellow-400">
          🔗
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-1">
            <Avatar className="h-6 w-6">
              <AvatarImage
                src={item.metadata?.creator?.avatar}
                alt={item.metadata?.creator?.displayName || item.metadata?.creator?.username}
              />
              <AvatarFallback className="text-xs">
                {(item.metadata?.creator?.displayName || item.metadata?.creator?.username || 'U').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {item.metadata?.creator?.displayName || item.metadata?.creator?.username}
            </span>
            <span className="text-xs text-gray-400">•</span>
            <Badge variant="outline" className="text-xs">
              {item.metadata?.shortCode ? t('ranking.linkTrackedBadge') : t('ranking.linkShareBadge')}
            </Badge>
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {item.name}
          </p>
          {item.metadata?.originalUrl && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {item.metadata.originalUrl}
            </p>
          )}
          {item.metadata?.conversation && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('ranking.conversationPrefix')} {item.metadata.conversation.title || item.metadata.conversation.identifier}
            </p>
          )}
          <div className="flex items-center space-x-3 mt-1 text-xs text-gray-500">
            {item.metadata?.totalClicks !== undefined && (
              <span>👁️ {formatCount(item.metadata.totalClicks)} {t('ranking.unitVisits')}</span>
            )}
            {item.metadata?.uniqueClicks !== undefined && (
              <span>👤 {formatCount(item.metadata.uniqueClicks)} {t('ranking.unitUnique')}</span>
            )}
            {item.currentUses !== undefined && (
              <span>✅ {formatCount(item.currentUses)} {t('ranking.unitUses')}</span>
            )}
            {item.maxUses !== undefined && item.maxUses > 0 && (
              <span>/ {formatCount(item.maxUses)} {t('ranking.unitMax')}</span>
            )}
          </div>
        </div>
      </div>

      <div className="text-right">
        <div className="flex items-center space-x-2">
          {currentCriterion && React.createElement(currentCriterion.icon, {
            className: 'h-5 w-5 text-yellow-600'
          })}
          <span className="text-2xl font-bold text-yellow-600">
            {formatCount(item.value)}
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {t(criterionLabelKey(criterion))}
        </p>
      </div>
    </div>
  );
});

LinkRankCard.displayName = 'LinkRankCard';
