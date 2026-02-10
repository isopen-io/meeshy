import React from 'react';
import { lazy, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { getUserStatus } from '@/lib/user-status';
import { User } from '@/types';
import {
  MoreVertical,
  UserCheck,
  MessageSquare,
  Mail
} from 'lucide-react';

const ConversationDropdown = lazy(() => import('../ConversationDropdown'));

interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: string;
  sender?: User;
  receiver?: User;
}

interface ConnectedContactsTabProps {
  friendRequests: FriendRequest[];
  currentUserId?: string;
  getUserDisplayName: (user: User) => string;
  onStartConversation: (userId: string) => void;
  t: (key: string, params?: any) => string;
}

const ConnectedContactsTab = React.memo<ConnectedContactsTabProps>(({
  friendRequests,
  currentUserId,
  getUserDisplayName,
  onStartConversation,
  t
}) => {
  const router = useRouter();
  const connectedRequests = friendRequests.filter(r => r.status === 'accepted');

  if (connectedRequests.length === 0) {
    return (
      <Card className="border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
        <CardContent className="flex flex-col items-center justify-center py-16 px-6">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 blur-3xl rounded-full"></div>
            <div className="relative p-6 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-3xl">
              <UserCheck className="h-16 w-16 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-foreground mb-3 text-center">{t('messages.noConnectedContacts')}</h3>
          <p className="text-muted-foreground text-base text-center max-w-md">
            {t('messages.noConnectedContactsDescription')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      {connectedRequests.map((request) => {
        const otherUser = request.senderId === currentUserId ? request.receiver : request.sender;
        const otherUserId = request.senderId === currentUserId ? request.receiverId : request.senderId;

        if (!otherUser) return null;

        return (
          <Card key={request.id} className="relative border-2 hover:border-purple-500/50 hover:shadow-xl transition-[color,box-shadow] duration-200 overflow-hidden group bg-white dark:bg-gray-950">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-0"></div>

            <CardContent className="relative z-10 p-4 sm:p-6">
              <div className="flex items-start space-x-3 sm:space-x-4">
                <div className="relative flex-shrink-0">
                  <Avatar className="h-12 w-12 sm:h-16 sm:w-16 border-2 border-white shadow-lg">
                    <AvatarImage src={otherUser.avatar} alt={getUserDisplayName(otherUser)} />
                    <AvatarFallback className="text-sm sm:text-lg font-bold">
                      {getUserDisplayName(otherUser).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <OnlineIndicator
                    isOnline={getUserStatus(otherUser) === 'online'}
                    status={getUserStatus(otherUser)}
                    size="md"
                    className="absolute -bottom-0.5 -right-0.5"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white break-words flex-1">
                      {getUserDisplayName(otherUser)}
                    </h3>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 sm:h-10 sm:w-10 p-0 hover:bg-gray-200 dark:hover:bg-gray-700 flex-shrink-0">
                          <MoreVertical className="h-4 w-4 sm:h-5 sm:w-5" />
                          <span className="sr-only">{t('actions.menu')}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56 z-[100] dark:bg-gray-900 dark:border-gray-700">
                        <DropdownMenuItem
                          onClick={() => router.push(`/u/${otherUserId}`)}
                          className="py-3 dark:hover:bg-gray-800"
                        >
                          <UserCheck className="h-4 w-4 mr-3" />
                          <span className="font-medium">{t('actions.viewProfile')}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onStartConversation(otherUserId)}
                          className="py-3 dark:hover:bg-gray-800"
                        >
                          <MessageSquare className="h-4 w-4 mr-3" />
                          <span className="font-medium">{t('actions.message')}</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <button
                    onClick={() => router.push(`/u/${otherUserId}`)}
                    className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline mb-2 sm:mb-3 break-all transition-colors cursor-pointer text-left"
                  >
                    @{otherUser.username}
                  </button>

                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                      <div className="flex items-center space-x-2">
                        <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${otherUser.isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
                        <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium">
                          {otherUser.isOnline ? t('status.online') : t('status.offline')}
                        </span>
                      </div>

                      {otherUser.email && (
                        <div className="flex items-center space-x-2 min-w-0">
                          <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 flex-shrink-0" />
                          <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 truncate">
                            {otherUser.email}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="mt-3">
                      <Suspense fallback={<div className="h-9 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />}>
                        <ConversationDropdown
                          userId={otherUserId}
                          onCreateNew={() => onStartConversation(otherUserId)}
                        />
                      </Suspense>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
});

ConnectedContactsTab.displayName = 'ConnectedContactsTab';

export default ConnectedContactsTab;
