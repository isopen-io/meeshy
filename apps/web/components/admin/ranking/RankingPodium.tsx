import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Trophy, Medal } from 'lucide-react';
import { RankingItem } from '@/hooks/use-ranking-data';
import { MEDAL_COLORS } from './constants';
import { formatCount, getTypeIcon } from './utils';

interface RankingPodiumProps {
  rankings: RankingItem[];
  entityType: 'users' | 'conversations' | 'messages' | 'links';
  criterion: string;
}

export function RankingPodium({ rankings, entityType, criterion }: RankingPodiumProps) {
  if (criterion === 'recent_activity' || entityType === 'messages' || entityType === 'links' || rankings.length < 3) {
    return null;
  }

  const renderAvatar = (ranking: RankingItem, size: 'sm' | 'md' | 'lg') => {
    const sizeClasses = {
      sm: 'h-16 w-16',
      md: 'h-20 w-20',
      lg: 'h-24 w-24'
    };

    const textSizes = {
      sm: 'text-xl',
      md: 'text-2xl',
      lg: 'text-3xl'
    };

    const ringColors = {
      0: 'ring-yellow-400 dark:ring-yellow-500',
      1: 'ring-gray-300 dark:ring-gray-600',
      2: 'ring-amber-600 dark:ring-amber-700'
    };

    const index = (ranking.rank || 1) - 1;

    if (entityType === 'users') {
      return (
        <Avatar className={`${sizeClasses[size]} ring-4 ${ringColors[index as 0 | 1 | 2]}`}>
          <AvatarImage src={ranking.avatar} alt={ranking.displayName || ranking.username} />
          <AvatarFallback className={`${textSizes[size]} bg-gradient-to-br from-yellow-400 to-amber-500 text-white`}>
            {(ranking.displayName || ranking.username || 'U').charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      );
    }

    return (
      <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center ${textSizes[size]} ring-4 ${ringColors[index as 0 | 1 | 2]}`}>
        {getTypeIcon(ranking.type)}
      </div>
    );
  };

  return (
    <Card className="border-yellow-200 dark:border-yellow-800">
      <CardHeader className="bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20">
        <CardTitle className="flex items-center space-x-2">
          <Trophy className="h-5 w-5 text-yellow-600" />
          <span>Podium des champions</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-8">
        <div className="grid grid-cols-3 gap-4">
          {rankings[1] && (
            <div className="text-center pt-8">
              <div className="relative inline-block">
                {renderAvatar(rankings[1], 'md')}
                <div className="absolute -bottom-2 -right-2 bg-gray-100 dark:bg-gray-700 rounded-full p-2">
                  <Medal className={`h-6 w-6 ${MEDAL_COLORS[1]}`} />
                </div>
              </div>
              <p className="font-semibold mt-3 text-gray-900 dark:text-gray-100">
                {rankings[1].name}
              </p>
              <p className="text-2xl font-bold text-gray-600 dark:text-gray-400 mt-1">
                {formatCount(rankings[1].value)}
              </p>
            </div>
          )}

          {rankings[0] && (
            <div className="text-center">
              <div className="relative inline-block">
                {renderAvatar(rankings[0], 'lg')}
                <div className="absolute -bottom-2 -right-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-full p-2">
                  <Medal className={`h-8 w-8 ${MEDAL_COLORS[0]}`} />
                </div>
              </div>
              <p className="font-bold text-lg mt-3 text-gray-900 dark:text-gray-100">
                {rankings[0].name}
              </p>
              <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-500 mt-1">
                {formatCount(rankings[0].value)}
              </p>
              <Trophy className="h-6 w-6 text-yellow-600 mx-auto mt-2" />
            </div>
          )}

          {rankings[2] && (
            <div className="text-center pt-12">
              <div className="relative inline-block">
                {renderAvatar(rankings[2], 'sm')}
                <div className="absolute -bottom-2 -right-2 bg-amber-100 dark:bg-amber-900/30 rounded-full p-2">
                  <Medal className={`h-5 w-5 ${MEDAL_COLORS[2]}`} />
                </div>
              </div>
              <p className="font-semibold mt-3 text-gray-900 dark:text-gray-100">
                {rankings[2].name}
              </p>
              <p className="text-xl font-bold text-amber-700 dark:text-amber-600 mt-1">
                {formatCount(rankings[2].value)}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
