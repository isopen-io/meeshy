import React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { ConversationDropdown } from './ConversationDropdown';
import { User } from '@/types';
import { getUserStatus } from '@/lib/user-status';
import {
  MoreVertical,
  UserPlus,
  X,
  UserCheck,
  MessageSquare,
  Phone,
  Users
} from 'lucide-react';

interface ContactsListProps {
  users: User[];
  searchQuery: string;
  getUserDisplayName: (user: User) => string;
  formatLastSeen: (user: User) => string;
  getPendingRequestWithUser: (userId: string) => any | undefined;
  onSendRequest: (userId: string) => void;
  onCancelRequest: (requestId: string) => void;
  onStartConversation: (userId: string) => void;
  t: (key: string, params?: any) => string;
}

const ContactsList = React.memo<ContactsListProps>(({
  users,
  searchQuery,
  getUserDisplayName,
  formatLastSeen,
  getPendingRequestWithUser,
  onSendRequest,
  onCancelRequest,
  onStartConversation,
  t
}) => {
  const router = useRouter();

  if (users.length === 0) {
    return (
      <Card className="border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
        <CardContent className="flex flex-col items-center justify-center py-16 px-6">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 blur-3xl rounded-full"></div>
            <div className="relative p-6 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-3xl">
              <Users className="h-16 w-16 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-foreground dark:text-gray-100 mb-3 text-center">
            {searchQuery ? t('messages.noContactsFound') : t('messages.noContacts')}
          </h3>
          <p className="text-muted-foreground dark:text-gray-400 text-base text-center max-w-md">
            {searchQuery
              ? t('messages.noContactsFoundDescription')
              : t('messages.noContactsDescription')
            }
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      {users.map((contact) => {
        const pendingRequest = getPendingRequestWithUser(contact.id);

        return (
          <Card key={contact.id} className="relative border-2 hover:border-primary/50 hover:shadow-xl transition-all duration-200 overflow-hidden group bg-white dark:bg-gray-950 dark:border-gray-800">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 dark:from-blue-500/10 dark:to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-0"></div>

            <CardContent className="relative z-10 p-4 sm:p-6">
              <div className="flex items-start space-x-3 sm:space-x-4">
                <div className="relative flex-shrink-0">
                  <Avatar className="h-12 w-12 sm:h-16 sm:w-16 border-2 border-white dark:border-gray-700 shadow-lg">
                    <AvatarImage src={contact.avatar} alt={getUserDisplayName(contact)} />
                    <AvatarFallback className="text-sm sm:text-lg font-bold">
                      {getUserDisplayName(contact).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <OnlineIndicator
                    isOnline={getUserStatus(contact) === 'online'}
                    status={getUserStatus(contact)}
                    size="md"
                    className="absolute -bottom-0.5 -right-0.5"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white break-words flex-1">
                      {getUserDisplayName(contact)}
                    </h3>

                    <div className="flex flex-row items-center gap-2 flex-shrink-0">
                      <Badge
                        variant={contact.isOnline ? 'default' : 'secondary'}
                        className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-semibold flex-shrink-0 whitespace-nowrap ${
                          contact.isOnline
                            ? 'bg-green-500 hover:bg-green-600'
                            : 'bg-gray-400 hover:bg-gray-500'
                        }`}
                      >
                        {contact.isOnline ? t('status.online') : t('status.offline')}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 sm:h-10 sm:w-10 p-0 hover:bg-gray-200 dark:hover:bg-gray-700 flex-shrink-0">
                            <MoreVertical className="h-4 w-4 sm:h-5 sm:w-5" />
                            <span className="sr-only">{t('actions.menu')}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 z-[100] dark:bg-gray-900 dark:border-gray-700">
                          {pendingRequest ? (
                            <DropdownMenuItem
                              onClick={() => onCancelRequest(pendingRequest.id)}
                              className="py-3 text-orange-600 dark:text-orange-400"
                            >
                              <X className="h-4 w-4 mr-3" />
                              <span className="font-medium">{t('actions.cancel')}</span>
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => onSendRequest(contact.id)}
                              className="py-3 dark:hover:bg-gray-800"
                            >
                              <UserPlus className="h-4 w-4 mr-3" />
                              <span className="font-medium">{t('actions.add')}</span>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => router.push(`/u/${contact.id}`)}
                            className="py-3 dark:hover:bg-gray-800"
                          >
                            <UserCheck className="h-4 w-4 mr-3" />
                            <span className="font-medium">{t('actions.viewProfile')}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onStartConversation(contact.id)}
                            className="py-3 dark:hover:bg-gray-800"
                          >
                            <MessageSquare className="h-4 w-4 mr-3" />
                            <span className="font-medium">{t('actions.message')}</span>
                          </DropdownMenuItem>
                          {contact.phoneNumber && (
                            <DropdownMenuItem className="py-3 dark:hover:bg-gray-800">
                              <Phone className="h-4 w-4 mr-3" />
                              <span className="font-medium">{t('actions.call')}</span>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <button
                    onClick={() => router.push(`/u/${contact.id}`)}
                    className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline mb-2 sm:mb-3 break-all transition-colors cursor-pointer text-left"
                  >
                    @{contact.username}
                  </button>

                  <div className="flex items-center space-x-2 mb-3">
                    <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${contact.isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                    <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium">
                      {formatLastSeen(contact)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {pendingRequest ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onCancelRequest(pendingRequest.id)}
                        className="flex items-center gap-2 h-9 px-4 border-2 border-orange-500 text-orange-600 hover:bg-orange-50 dark:border-orange-600 dark:text-orange-400 dark:hover:bg-orange-950/30 shadow-md hover:shadow-lg transition-all"
                      >
                        <X className="h-4 w-4" />
                        <span className="text-sm">{t('actions.cancel')}</span>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => onSendRequest(contact.id)}
                        className="flex items-center gap-2 h-9 px-4 bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-800 shadow-md hover:shadow-lg transition-all"
                      >
                        <UserPlus className="h-4 w-4" />
                        <span className="text-sm">{t('actions.add')}</span>
                      </Button>
                    )}

                    <ConversationDropdown
                      userId={contact.id}
                      onCreateNew={() => onStartConversation(contact.id)}
                    />
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

ContactsList.displayName = 'ContactsList';

export default ContactsList;
