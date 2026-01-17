'use client';

import { MessageSquare, Search, UserPlus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/hooks/useI18n';
import { InfoIcon } from '../../components/InfoIcon';
import type { Conversation, User } from '@meeshy/shared/types';
import type { NewConversationData } from '../../types';

interface ConversationSectionProps {
  createNewConversation: boolean;
  selectedConversationId: string | null;
  conversations: Conversation[];
  newConversationData: NewConversationData;
  setNewConversationData: (data: NewConversationData | ((prev: NewConversationData) => NewConversationData)) => void;
  filteredUsers: User[];
  userSearchQuery: string;
  setUserSearchQuery: (query: string) => void;
  isLoadingUsers: boolean;
}

export function ConversationSection({
  createNewConversation,
  selectedConversationId,
  conversations,
  newConversationData,
  setNewConversationData,
  filteredUsers,
  userSearchQuery,
  setUserSearchQuery,
  isLoadingUsers
}: ConversationSectionProps) {
  const { t } = useI18n('modals');

  return (
    <Card className="border-2">
      <CardHeader className="bg-muted/30">
        <CardTitle className="text-lg flex items-center">
          <MessageSquare className="h-5 w-5 mr-2" />
          {createNewConversation
            ? t('createLinkModal.createNewConversation.title')
            : t('summary.conversation')}
        </CardTitle>
        <CardDescription>
          {createNewConversation
            ? t('createLinkModal.conversationForm.titleInfo')
            : t('createLinkModal.stepDescriptions.configureLink')}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        {createNewConversation ? (
          <>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Label htmlFor="conversationTitle" className="text-sm font-medium">
                  {t('createLinkModal.conversationForm.title')}
                </Label>
                <InfoIcon content={t('createLinkModal.conversationForm.titleInfo')} />
              </div>
              <Input
                id="conversationTitle"
                value={newConversationData.title}
                onChange={(e) =>
                  setNewConversationData((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder={t('createLinkModal.conversationForm.titlePlaceholder')}
                className="text-lg"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Label htmlFor="conversationDescription" className="text-sm font-medium">
                  {t('createLinkModal.conversationForm.description')}
                </Label>
                <InfoIcon content={t('createLinkModal.conversationForm.descriptionInfo')} />
              </div>
              <Textarea
                id="conversationDescription"
                value={newConversationData.description}
                onChange={(e) =>
                  setNewConversationData((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder={t('createLinkModal.conversationForm.descriptionPlaceholder')}
                className="min-h-[80px]"
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  {t('createLinkModal.conversationForm.baseMembers')}
                </Label>
                <Badge variant="secondary">
                  {t('createLinkModal.conversationForm.memberCount', {
                    count: newConversationData.memberIds.length
                  })}
                </Badge>
              </div>

              <div className="relative">
                {isLoadingUsers ? (
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                )}
                <Input
                  placeholder={t('createLinkModal.conversationForm.searchUsers')}
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {isLoadingUsers ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{t('createLinkModal.conversationForm.noUsersFound')}</p>
                  </div>
                ) : (
                  filteredUsers.map((user) => {
                    const isSelected = newConversationData.memberIds.includes(user.id);

                    const toggleUserSelection = () => {
                      if (isSelected) {
                        setNewConversationData((prev) => ({
                          ...prev,
                          memberIds: prev.memberIds.filter((id) => id !== user.id)
                        }));
                      } else {
                        setNewConversationData((prev) => ({
                          ...prev,
                          memberIds: [...prev.memberIds, user.id]
                        }));
                      }
                    };

                    return (
                      <div
                        key={user.id}
                        className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer"
                        onClick={toggleUserSelection}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            if (e.target.checked) {
                              setNewConversationData((prev) => ({
                                ...prev,
                                memberIds: [...prev.memberIds, user.id]
                              }));
                            } else {
                              setNewConversationData((prev) => ({
                                ...prev,
                                memberIds: prev.memberIds.filter((id) => id !== user.id)
                              }));
                            }
                          }}
                          className="rounded"
                        />
                        <div className="h-8 w-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                          <span className="text-xs font-medium text-white">
                            {user.displayName?.[0] ||
                              user.firstName?.[0] ||
                              user.username[0].toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {user.displayName ||
                              `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
                              user.username}
                          </p>
                          <p className="text-sm text-muted-foreground truncate">@{user.username}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium">
                  {conversations.find((c) => c.id === selectedConversationId)?.title}
                </h3>
                {conversations.find((c) => c.id === selectedConversationId)?.description && (
                  <p className="text-sm text-muted-foreground">
                    {conversations.find((c) => c.id === selectedConversationId)?.description}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
