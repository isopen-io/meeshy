'use client';

import React, { memo, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { getUserStatus } from '@/lib/user-status';
import { Check, X, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SmartSearch } from '../smart-search';
import { useI18n } from '@/hooks/useI18n';
import type { User } from '@/types';

interface MemberSelectionStepProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  availableUsers: User[];
  selectedUsers: User[];
  onToggleUser: (user: User) => void;
  isLoading: boolean;
}

function getUserDisplayName(user: User): string {
  return user.displayName || user.username || user.firstName || user.lastName || 'Unknown User';
}

function getUserAccentColor(userId: string): string {
  const colors = [
    'bg-blue-100 text-blue-800 border-blue-200',
    'bg-green-100 text-green-800 border-green-200',
    'bg-purple-100 text-purple-800 border-purple-200',
    'bg-pink-100 text-pink-800 border-pink-200',
    'bg-yellow-100 text-yellow-800 border-yellow-200',
    'bg-indigo-100 text-indigo-800 border-indigo-200',
    'bg-red-100 text-red-800 border-red-200',
    'bg-teal-100 text-teal-800 border-teal-200',
    'bg-orange-100 text-orange-800 border-orange-200',
    'bg-cyan-100 text-cyan-800 border-cyan-200'
  ];

  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

const MemberSelectionStepComponent: React.FC<MemberSelectionStepProps> = ({
  searchQuery,
  onSearchChange,
  availableUsers,
  selectedUsers,
  onToggleUser,
  isLoading
}) => {
  const { t } = useI18n('modals');

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return availableUsers;
    return availableUsers.filter(user =>
      user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.displayName && user.displayName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (user.firstName && user.firstName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (user.lastName && user.lastName.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [availableUsers, searchQuery]);

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium flex items-center gap-2 mb-2 dark:text-gray-200">
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          {t('createConversationModal.members.title')}
        </Label>
        <Input
          placeholder={t('createConversationModal.members.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
          aria-label={t('createConversationModal.members.searchPlaceholder')}
        />

        {searchQuery.length >= 2 && (
          <div className="mt-2 border rounded-lg bg-background dark:bg-gray-800 dark:border-gray-700 shadow-sm max-h-48 overflow-y-auto">
            {isLoading ? (
              <div className="p-3 text-center text-sm text-muted-foreground dark:text-gray-400">
                {t('createConversationModal.members.loading')}
              </div>
            ) : filteredUsers.length > 0 ? (
              <div className="p-1">
                {filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                      selectedUsers.some(u => u.id === user.id) && "bg-primary/10 border border-primary/20"
                    )}
                    onClick={() => onToggleUser(user)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onToggleUser(user);
                      }
                    }}
                    aria-pressed={selectedUsers.some(u => u.id === user.id)}
                    aria-label={`${selectedUsers.some(u => u.id === user.id) ? 'Désélectionner' : 'Sélectionner'} ${getUserDisplayName(user)}`}
                  >
                    <div className="relative flex-shrink-0">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatar} alt="" />
                        <AvatarFallback>
                          {getUserDisplayName(user).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <OnlineIndicator
                        isOnline={getUserStatus(user) === 'online'}
                        status={getUserStatus(user)}
                        size="sm"
                        className="absolute -bottom-0.5 -right-0.5"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">
                        {getUserDisplayName(user)}
                      </p>
                      <p className="text-xs text-muted-foreground">@{user.username || 'utilisateur'}</p>
                    </div>
                    <Check
                      className={cn(
                        "h-4 w-4",
                        selectedUsers.some(u => u.id === user.id) ? "opacity-100 text-primary" : "opacity-0"
                      )}
                      aria-hidden="true"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3 text-center text-sm text-muted-foreground dark:text-gray-400">
                {t('createConversationModal.members.noUsersFound')}
              </div>
            )}
          </div>
        )}

        {!searchQuery && (
          <div className="mt-2">
            <SmartSearch
              searchQuery={searchQuery}
              onSearch={onSearchChange}
              onUserSelect={onToggleUser}
              selectedUsers={selectedUsers}
            />
          </div>
        )}
      </div>

      {selectedUsers.length > 0 && (
        <div>
          <Label className="text-sm font-medium mb-2 dark:text-gray-200">
            {t('createConversationModal.members.selectedMembers', { count: selectedUsers.length })}
          </Label>
          <div className="flex flex-wrap gap-2">
            {selectedUsers.map(user => (
              <Badge
                key={user.id}
                variant="outline"
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 border-2",
                  getUserAccentColor(user.id)
                )}
              >
                <Avatar className="h-4 w-4">
                  <AvatarImage src={user.avatar} />
                  <AvatarFallback className="text-xs">
                    {getUserDisplayName(user).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">
                  {getUserDisplayName(user)}
                </span>
                <button
                  type="button"
                  onClick={() => onToggleUser(user)}
                  className="ml-1 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                  aria-label={`Retirer ${getUserDisplayName(user)}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const MemberSelectionStep = memo(MemberSelectionStepComponent);
