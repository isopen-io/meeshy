import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RankingItem } from '@/hooks/use-ranking-data';
import { RANKING_CRITERIA } from './constants';
import { formatCount, getRankBadge, getMessageTypeIcon } from './utils';

interface MessageRankCardProps {
  item: RankingItem;
  criterion: string;
}

function formatDate(dateString: string | undefined) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export const MessageRankCard = React.memo(({ item, criterion }: MessageRankCardProps) => {
  const currentCriterion = RANKING_CRITERIA.messages.find(c => c.value === criterion);
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
          {getMessageTypeIcon(item.metadata?.messageType as string | undefined)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-1">
            <Avatar className="h-6 w-6">
              <AvatarImage
                src={item.metadata?.sender?.avatar}
                alt={item.metadata?.sender?.displayName || item.metadata?.sender?.username}
              />
              <AvatarFallback className="text-xs">
                {(item.metadata?.sender?.displayName || item.metadata?.sender?.username || 'U').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {item.metadata?.sender?.displayName || item.metadata?.sender?.username}
            </span>
            <span className="text-xs text-gray-400">•</span>
            <span className="text-xs text-gray-500">
              {item.metadata?.conversation?.title || item.metadata?.conversation?.identifier}
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
            {item.name}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {formatDate(item.metadata?.createdAt)}
          </p>
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
          {currentCriterion?.label}
        </p>
      </div>
    </div>
  );
});

MessageRankCard.displayName = 'MessageRankCard';
