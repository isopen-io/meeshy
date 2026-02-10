import React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { getUserStatus } from '@/lib/user-status';
import { User } from '@/types';
import { UserX, UserPlus } from 'lucide-react';

interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: string;
  updatedAt: string;
  sender?: User;
  receiver?: User;
}

interface RefusedRequestsTabProps {
  friendRequests: FriendRequest[];
  currentUserId?: string;
  getUserDisplayName: (user: User) => string;
  onSendRequest: (userId: string) => void;
  t: (key: string, params?: any) => string;
}

const RefusedRequestsTab = React.memo<RefusedRequestsTabProps>(({
  friendRequests,
  currentUserId,
  getUserDisplayName,
  onSendRequest,
  t
}) => {
  const router = useRouter();
  const refusedRequests = friendRequests.filter(r => r.status === 'rejected');

  if (refusedRequests.length === 0) {
    return (
      <Card className="border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
        <CardContent className="flex flex-col items-center justify-center py-16 px-6">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 to-orange-500/20 blur-3xl rounded-full"></div>
            <div className="relative p-6 bg-gradient-to-br from-red-100 to-orange-100 dark:from-red-900/30 dark:to-orange-900/30 rounded-3xl">
              <UserX className="h-16 w-16 text-red-600 dark:text-red-400" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-foreground mb-3 text-center">{t('messages.noRefusedRequests')}</h3>
          <p className="text-muted-foreground text-base text-center max-w-md">
            {t('messages.noRefusedRequestsDescription')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      {refusedRequests.map((request) => {
        const isCurrentUserSender = request.senderId === currentUserId;
        const otherUser = isCurrentUserSender ? request.receiver : request.sender;
        const otherUserId = isCurrentUserSender ? request.receiverId : request.senderId;

        if (!otherUser) return null;

        return (
          <Card key={request.id} className="relative border-2 hover:border-red-500/50 hover:shadow-xl transition-[color,box-shadow] duration-200 overflow-hidden group bg-white dark:bg-gray-950">
            <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 to-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-0"></div>

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
                  <h3 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white mb-1 break-words">
                    {getUserDisplayName(otherUser)}
                  </h3>
                  <button
                    onClick={() => router.push(`/u/${otherUserId}`)}
                    className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline mb-2 break-all transition-colors cursor-pointer text-left"
                  >
                    @{otherUser.username}
                  </button>
                  <p className="text-xs sm:text-sm text-gray-500 font-medium mb-3">
                    {t('messages.requestRejected', { date: new Date(request.updatedAt).toLocaleDateString() })}
                  </p>

                  <div className="flex items-center gap-2">
                    {isCurrentUserSender ? (
                      <Badge variant="outline" className="text-red-600 border-red-200 px-3 py-1.5 font-semibold">
                        <UserX className="h-4 w-4 mr-2" />
                        {t('status.rejected')}
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onSendRequest(otherUserId)}
                        className="flex items-center space-x-2 h-10 px-4 border-2 shadow-md hover:shadow-lg transition-[color,box-shadow]"
                      >
                        <UserPlus className="h-4 w-4" />
                        <span>{t('actions.resend')}</span>
                      </Button>
                    )}
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

RefusedRequestsTab.displayName = 'RefusedRequestsTab';

export default RefusedRequestsTab;
