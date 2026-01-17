import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RankingItem } from '@/hooks/use-ranking-data';
import { RANKING_CRITERIA } from './constants';
import { formatCount, getRankBadge } from './utils';
import { Clock } from 'lucide-react';

interface UserRankCardProps {
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

export const UserRankCard = React.memo(({ item, criterion }: UserRankCardProps) => {
  const currentCriterion = RANKING_CRITERIA.users.find(c => c.value === criterion);
  const isTopThree = item.rank && item.rank <= 3;

  return (
    <div
      className={`flex items-center justify-between p-4 rounded-lg transition-all hover:shadow-md ${
        isTopThree
          ? 'bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/10 dark:to-amber-900/10 border-2 border-yellow-300 dark:border-yellow-700'
          : 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className="flex items-center space-x-4 flex-1">
        <div className="flex items-center justify-center w-12">
          {item.rank && getRankBadge(item.rank)}
        </div>

        <Avatar className="h-12 w-12 ring-2 ring-yellow-400">
          <AvatarImage src={item.avatar} alt={item.name} />
          <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-amber-500 text-white">
            {(item.name || 'U').charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1">
          <p className="font-semibold text-gray-900 dark:text-gray-100">
            {item.name}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            @{item.metadata?.username}
          </p>
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

UserRankCard.displayName = 'UserRankCard';
