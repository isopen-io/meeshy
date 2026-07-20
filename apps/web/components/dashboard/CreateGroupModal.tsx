'use client';

import { Users, Shield, Eye, Search, X, Check } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { User } from '@/types';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupName: string;
  setGroupName: (name: string) => void;
  groupDescription: string;
  setGroupDescription: (desc: string) => void;
  isGroupPrivate: boolean;
  setIsGroupPrivate: (isPrivate: boolean) => void;
  availableUsers: User[];
  selectedUsers: User[];
  groupSearchQuery: string;
  setGroupSearchQuery: (query: string) => void;
  isLoadingUsers: boolean;
  isCreatingGroup: boolean;
  currentUser: User | undefined;
  toggleUserSelection: (user: User) => void;
  onCreateGroup: () => void;
}

export function CreateGroupModal({
  isOpen,
  onClose,
  groupName,
  setGroupName,
  groupDescription,
  setGroupDescription,
  isGroupPrivate,
  setIsGroupPrivate,
  availableUsers,
  selectedUsers,
  groupSearchQuery,
  setGroupSearchQuery,
  isLoadingUsers,
  isCreatingGroup,
  currentUser,
  toggleUserSelection,
  onCreateGroup,
}: CreateGroupModalProps) {
  const { t } = useI18n('dashboard');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span className="dark:text-gray-100">{t('createGroupModal.title')}</span>
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            {t('createGroupModal.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Group name */}
          <div>
            <Label htmlFor="groupName" className="text-sm font-medium dark:text-gray-200">
              {t('createGroupModal.nameLabel')}
            </Label>
            <Input
              id="groupName"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={t('createGroupModal.namePlaceholder')}
              className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="groupDescription" className="text-sm font-medium dark:text-gray-200">
              {t('createGroupModal.descriptionLabel')}
            </Label>
            <Textarea
              id="groupDescription"
              value={groupDescription}
              onChange={(e) => setGroupDescription(e.target.value)}
              placeholder={t('createGroupModal.descriptionPlaceholder')}
              className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
              rows={2}
            />
          </div>

          {/* Privacy */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium dark:text-gray-200">{t('createGroupModal.privateLabel')}</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isGroupPrivate
                  ? t('createGroupModal.privateHint')
                  : t('createGroupModal.publicHint')}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              {isGroupPrivate ? (
                <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              ) : (
                <Eye className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              )}
              <Switch checked={isGroupPrivate} onCheckedChange={setIsGroupPrivate} />
            </div>
          </div>

          {/* User search */}
          <div>
            <Label htmlFor="userSearch" className="text-sm font-medium dark:text-gray-200">
              {t('createGroupModal.searchLabel')}
            </Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
              <Input
                id="userSearch"
                value={groupSearchQuery}
                onChange={(e) => setGroupSearchQuery(e.target.value)}
                placeholder={t('createGroupModal.searchPlaceholder')}
                className="pl-10 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
              />
            </div>
          </div>

          {/* Selected users */}
          {selectedUsers.length > 0 && (
            <div>
              <Label className="text-sm font-medium dark:text-gray-200">
                {t('createGroupModal.selectedMembers', { count: selectedUsers.length + 1 })}
              </Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {/* Current user (admin) */}
                <Badge variant="default" className="flex items-center gap-1">
                  {currentUser?.displayName || currentUser?.username}
                  <Shield className="h-3 w-3" />
                </Badge>
                {/* Selected members */}
                {selectedUsers.map((user) => (
                  <Badge
                    key={user.id}
                    variant="secondary"
                    className="flex items-center gap-1 dark:bg-gray-700 dark:text-gray-300"
                  >
                    {user.displayName || user.username}
                    <button
                      type="button"
                      aria-label={t('createGroupModal.removeMember', { name: user.displayName || user.username })}
                      onClick={() => toggleUserSelection(user)}
                    >
                      <X className="h-3 w-3 cursor-pointer" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Users list */}
          <div>
            <Label className="text-sm font-medium dark:text-gray-200">{t('createGroupModal.availableUsers')}</Label>
            <ScrollArea className="h-48 mt-2 border rounded-lg dark:border-gray-600 dark:bg-gray-700/50">
              {isLoadingUsers ? (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 dark:border-blue-400 mx-auto mb-2"></div>
                  {t('createGroupModal.loadingUsers')}
                </div>
              ) : availableUsers.length === 0 ? (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                  {groupSearchQuery.trim()
                    ? t('createGroupModal.noUsersFound')
                    : t('createGroupModal.noUsersAvailable')}
                </div>
              ) : (
                <div className="p-2">
                  {availableUsers.map((user) => {
                    const isSelected = selectedUsers.some((u) => u.id === user.id);
                    return (
                      <div
                        key={user.id}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelected}
                        aria-label={t(
                          isSelected
                            ? 'createGroupModal.deselectMember'
                            : 'createGroupModal.selectMember',
                          { name: user.displayName || user.username }
                        )}
                        className={`flex items-center space-x-3 p-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600/50 ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
                            : ''
                        }`}
                        onClick={() => toggleUserSelection(user)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleUserSelection(user);
                          }
                        }}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.avatar} />
                          <AvatarFallback className="dark:bg-gray-600 dark:text-gray-300">
                            {(user.displayName || user.username).charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="font-medium text-sm dark:text-gray-100">
                            {user.displayName || user.username}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">@{user.username}</p>
                        </div>
                        {isSelected && <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Actions */}
          <div className="flex space-x-3 pt-4">
            <Button
              onClick={onCreateGroup}
              disabled={!groupName.trim() || isCreatingGroup}
              className="flex-1 dark:bg-blue-700 dark:text-gray-100 dark:hover:bg-blue-800"
            >
              <Users className="mr-2 h-4 w-4" />
              {isCreatingGroup ? t('createGroupModal.creating') : t('createGroupModal.create')}
            </Button>
            <Button
              onClick={onClose}
              variant="outline"
              className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {t('createGroupModal.cancel')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
