import React from 'react';
import { Badge } from '@/components/ui/badge';
import { RankingItem } from '@/hooks/use-ranking-data';
import { RANKING_CRITERIA } from './constants';
import { formatCount, getRankBadge, getTypeIcon, getTypeLabel } from './utils';
import { Clock } from 'lucide-react';

interface ConversationRankCardProps {
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

export const ConversationRankCard = React.memo(({ item, criterion }: ConversationRankCardProps) => {
  const currentCriterion = RANKING_CRITERIA.conversations.find(c => c.value === criterion);
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
          {item.avatar ? (
            <img
              src={item.avatar}
              alt={item.name}
              className="h-12 w-12 rounded-lg object-cover"
            />
          ) : (
            getTypeIcon(item.metadata?.type)
          )}
        </div>

        <div className="flex-1">
          <p className="font-semibold text-gray-900 dark:text-gray-100">
            {item.name}
          </p>
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="text-xs border-yellow-400 text-yellow-700">
              {getTypeLabel(item.metadata?.type)}
            </Badge>
            {item.metadata?.identifier && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {item.metadata.identifier}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-6">
        {criterion === 'recent_activity' && item.lastActivity ? (
          <div className="text-right">
            <div className="flex items-center space-x-2 text-gray-700 dark:text-gray-300">
              <Clock className="h-4 w-4" />
              <span className="text-sm">{formatDate(item.lastActivity)}</span>
            </div>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
});

ConversationRankCard.displayName = 'ConversationRankCard';
