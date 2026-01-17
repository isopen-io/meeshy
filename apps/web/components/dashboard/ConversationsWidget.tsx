import { MessageSquare, Users as UsersIcon, User as UserIcon } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { Conversation } from '@/types';
import { LastMessagePreview } from '@/app/dashboard/LastMessagePreview';

interface ConversationsWidgetProps {
  conversations: Conversation[];
  currentLanguage: string;
  t: (key: string, params?: Record<string, string>) => string;
  onConversationClick: (id: string) => void;
  onViewAll: () => void;
  onStartConversation: () => void;
}

export function ConversationsWidget({
  conversations,
  currentLanguage,
  t,
  onConversationClick,
  onViewAll,
  onStartConversation,
}: ConversationsWidgetProps) {
  return (
    <Card className="bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2 text-gray-900 dark:text-gray-100">
            <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span>{t('recentConversations')}</span>
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
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
              onClick={() => onConversationClick(conversation.id)}
              style={{ contentVisibility: 'auto', containIntrinsicSize: '76px' }}
            >
              <Avatar className="h-10 w-10">
                <AvatarFallback className="dark:bg-gray-700 dark:text-gray-300">
                  {conversation.type === 'group' ? (
                    <UsersIcon className="h-5 w-5" />
                  ) : (
                    <UserIcon className="h-5 w-5" />
                  )}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {conversation.title}
                  </p>
                  <div className="flex items-center space-x-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {conversation.lastMessage &&
                        new Date(conversation.lastMessage.createdAt).toLocaleTimeString(
                          currentLanguage,
                          {
                            hour: '2-digit',
                            minute: '2-digit',
                          }
                        )}
                    </p>
                  </div>
                </div>
                {conversation.lastMessage && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    <LastMessagePreview
                      message={conversation.lastMessage}
                      currentLanguage={currentLanguage}
                      t={t}
                    />
                  </p>
                )}
              </div>
            </div>
          ))}

          {conversations.length === 0 && (
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 text-gray-300 dark:text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                {t('emptyStates.noRecentConversations')}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                onClick={onStartConversation}
              >
                {t('actions.startConversation')}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
