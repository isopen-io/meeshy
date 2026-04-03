import { Users as UsersIcon, MessageSquare } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatConversationDate } from '@/utils/date-format';
import type { DashboardCommunity } from '@/services/dashboard.service';

interface CommunitiesWidgetProps {
  communities: DashboardCommunity[];
  t: (key: string, params?: Record<string, string>) => string;
  onCommunityClick: (id: string) => void;
  onViewAll: () => void;
  onCreateCommunity: () => void;
}

export function CommunitiesWidget({
  communities,
  t,
  onCommunityClick,
  onViewAll,
  onCreateCommunity,
}: CommunitiesWidgetProps) {
  return (
    <Card className="bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2 text-gray-900 dark:text-gray-100">
            <UsersIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            <span>{t('recentCommunities')}</span>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onViewAll}
            className="dark:text-gray-300 dark:hover:text-gray-100 dark:hover:bg-gray-700"
          >
            {t('actions.viewAll')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {communities.map((community) => {
            const initials = (community.name ?? '').slice(0, 2).toUpperCase();

            return (
              <div
                key={community.id}
                className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                onClick={() => onCommunityClick(community.id)}
                style={{ contentVisibility: 'auto', containIntrinsicSize: '76px' }}
              >
                <Avatar className="h-10 w-10">
                  {community.avatar && <AvatarImage src={community.avatar} alt={community.name} />}
                  <AvatarFallback className="dark:bg-gray-700 dark:text-gray-300 text-xs">
                    {initials || <UsersIcon className="h-5 w-5" />}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {community.name}
                    </p>
                    <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
                      {community.isPrivate && (
                        <Badge
                          variant="secondary"
                          className="text-xs dark:bg-gray-700 dark:text-gray-300"
                        >
                          {t('communities.private')}
                        </Badge>
                      )}
                      {community.updatedAt && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {formatConversationDate(community.updatedAt, { t })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge
                      variant="outline"
                      className="text-xs dark:border-gray-600 dark:text-gray-300"
                    >
                      {t('communities.membersCount', {
                        count: (community.memberCount ?? community.members?.length ?? 0).toString(),
                      })}
                    </Badge>
                    {(community.conversationCount ?? 0) > 0 && (
                      <Badge
                        variant="outline"
                        className="text-xs dark:border-gray-600 dark:text-gray-300"
                      >
                        <MessageSquare className="h-3 w-3 mr-1" />
                        {t('communities.conversationsCount', {
                          count: (community.conversationCount ?? 0).toString(),
                        })}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {communities.length === 0 && (
            <div className="text-center py-8">
              <UsersIcon className="h-12 w-12 text-gray-300 dark:text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                {t('emptyStates.noRecentCommunities')}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                onClick={onCreateCommunity}
              >
                {t('actions.createCommunityButton')}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
