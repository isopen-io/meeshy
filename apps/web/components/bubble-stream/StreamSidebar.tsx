/**
 * StreamSidebar - Sidebar optimisée pour BubbleStream
 *
 * Affiche les statistiques de langues, utilisateurs actifs, et tendances.
 * Utilise React.memo pour éviter les re-renders inutiles.
 *
 * @module components/bubble-stream/StreamSidebar
 */

'use client';

import { memo } from 'react';
import { Languages, Users, TrendingUp, ChevronDown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import {
  FoldableSection,
  LanguageIndicators,
  SidebarLanguageHeader,
  type LanguageStats
} from '@/lib/bubble-stream-modules';
import { TrendingSection } from '@/components/common/trending-section';
import type { User } from '@meeshy/shared/types';

interface StreamSidebarProps {
  // Statistiques de langues
  messageLanguageStats: LanguageStats[];
  activeLanguageStats: LanguageStats[];
  userLanguage: string;

  // Utilisateurs actifs
  activeUsers: User[];

  // Tendances
  trendingHashtags: string[];

  // i18n
  t: (key: string, params?: Record<string, string | number>) => string;
  tCommon: (key: string) => string;
}

/**
 * Composant StreamSidebar avec optimisation React.memo
 */
export const StreamSidebar = memo(function StreamSidebar({
  messageLanguageStats,
  activeLanguageStats,
  userLanguage,
  activeUsers,
  trendingHashtags,
  t,
  tCommon,
}: StreamSidebarProps) {

  return (
    <aside className="hidden xl:flex xl:w-80 xl:flex-col bg-white/60 dark:bg-gray-900/80 backdrop-blur-lg border-l border-blue-200/30 dark:border-gray-800/50">
      <div className="flex-1 overflow-y-auto p-6 scroll-hidden">
        <SidebarLanguageHeader
          languageStats={messageLanguageStats}
          userLanguage={userLanguage}
        />

        <FoldableSection
          title={t('bubbleStream.activeLanguages')}
          icon={<Languages className="h-4 w-4 mr-2" />}
          defaultExpanded={true}
        >
          <LanguageIndicators languageStats={activeLanguageStats} />
        </FoldableSection>

        <FoldableSection
          title={`${tCommon('sidebar.activeUsers')} (${activeUsers.length})`}
          icon={<Users className="h-4 w-4 mr-2" />}
          defaultExpanded={true}
        >
          <div className="space-y-3">
            {activeUsers.slice(0, 6).map((activeUser, index) => (
              <UserItem key={`${activeUser.id}-${index}`} user={activeUser} />
            ))}

            {activeUsers.length > 6 && (
              <div className="max-h-48 overflow-y-auto space-y-3 pr-1 border-t border-gray-100 dark:border-gray-700 pt-3 mt-3 scroll-hidden">
                {activeUsers.slice(6).map((activeUser, index) => (
                  <UserItem key={`${activeUser.id}-${index + 6}`} user={activeUser} />
                ))}
              </div>
            )}
          </div>
        </FoldableSection>

        <div className="opacity-60 saturate-50 bg-gray-50/50 dark:bg-gray-800/50 rounded-lg p-2 mt-6">
          <Card className="mb-6 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-gray-200/50 dark:border-gray-700/50 shadow-lg dark:shadow-gray-900/30">
            <CardContent className="p-0">
              <div className="flex items-center justify-between p-4 bg-gray-50/80 dark:bg-gray-700/50">
                <h3 className="font-semibold text-gray-500 dark:text-gray-400 flex items-center">
                  <TrendingUp className="h-4 w-4 mr-2 text-gray-400 dark:text-gray-500" />
                  {tCommon('sidebar.trends')}
                </h3>
                <ChevronDown className="h-4 w-4 text-gray-300 dark:text-gray-600" />
              </div>

              <div className="hidden">
                <div className="px-4 pb-4 border-t border-gray-100">
                  <div className="mt-3 opacity-70">
                    <TrendingSection hashtags={trendingHashtags} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </aside>
  );
});

StreamSidebar.displayName = 'StreamSidebar';

/**
 * Composant UserItem avec memo pour optimiser les re-renders
 */
const UserItem = memo(function UserItem({ user }: { user: User }) {
  return (
    <div className="flex items-center space-x-3 p-2 rounded hover:bg-gray-50/80 dark:hover:bg-gray-700/50 cursor-pointer transition-colors">
      <Avatar className="h-8 w-8">
        <AvatarImage src={user.avatar || undefined} alt={user.firstName} />
        <AvatarFallback className="bg-gradient-to-br from-blue-400 to-indigo-500 text-white">
          {user.firstName?.charAt(0)}{user.lastName?.charAt(0)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {user.firstName} {user.lastName}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          @{user.username}
        </p>
      </div>
      <div className="w-2 h-2 bg-green-500 rounded-full" />
    </div>
  );
});

UserItem.displayName = 'UserItem';
