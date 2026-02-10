'use client';

import {
  Plus,
  Search,
  MessageSquare,
  CheckCircle,
  ArrowRight
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/hooks/useI18n';
import type { Conversation } from '@meeshy/shared/types';

interface LinkTypeStepProps {
  conversations: Conversation[];
  filteredConversations: Conversation[];
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string | null) => void;
  createNewConversation: boolean;
  setCreateNewConversation: (create: boolean) => void;
  conversationSearchQuery: string;
  setConversationSearchQuery: (query: string) => void;
  isLoadingConversations: boolean;
  onSelectNewConversation: () => void;
}

const getConversationTypeLabel = (type: string): string => {
  switch (type) {
    case 'global':
      return 'Global Group';
    case 'group':
      return 'Private Group';
    case 'public':
      return 'Public Group';
    case 'broadcast':
      return 'Broadcast';
    case 'direct':
      return 'Direct';
    default:
      return type;
  }
};

export function LinkTypeStep({
  filteredConversations,
  selectedConversationId,
  setSelectedConversationId,
  createNewConversation,
  setCreateNewConversation,
  conversationSearchQuery,
  setConversationSearchQuery,
  isLoadingConversations,
  onSelectNewConversation
}: LinkTypeStepProps) {
  const { t } = useI18n('modals');

  return (
    <div className="space-y-6">
      <Card
        className={`border-2 border-dashed transition-[color,background-color,border-color] cursor-pointer ${
          createNewConversation
            ? 'border-primary bg-primary/5'
            : 'border-primary/20 hover:border-primary/40 hover:bg-primary/5'
        }`}
        onClick={onSelectNewConversation}
      >
        <CardContent className="p-6">
          <div className="flex items-center space-x-4">
            <div
              className={`h-12 w-12 rounded-full flex items-center justify-center ${
                createNewConversation
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-primary/10 text-primary'
              }`}
            >
              <Plus className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold">
                {t('createLinkModal.createNewConversation.title')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t('createLinkModal.createNewConversation.description')}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              {createNewConversation && <CheckCircle className="h-5 w-5 text-primary" />}
              <ArrowRight
                className={`h-4 w-4 ${
                  createNewConversation ? 'text-primary' : 'text-muted-foreground'
                }`}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            {t('createLinkModal.createNewConversation.orSelectExisting')}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('createLinkModal.search.conversations')}
            value={conversationSearchQuery}
            onChange={(e) => setConversationSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="space-y-3 max-h-64 overflow-y-auto p-1">
          {isLoadingConversations ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('createLinkModal.search.noConversationsFound')}</p>
            </div>
          ) : (
            filteredConversations.map((conversation) => (
              <Card
                key={conversation.id}
                className={`cursor-pointer transition-[color,border-color,box-shadow] hover:shadow-md ${
                  selectedConversationId === conversation.id
                    ? 'ring-1 ring-primary border-primary'
                    : 'hover:border-primary/50'
                }`}
                onClick={() => {
                  setSelectedConversationId(conversation.id);
                  setCreateNewConversation(false);
                }}
              >
                <CardContent className="p-2.5">
                  <div className="flex items-center space-x-2.5">
                    <div className="h-7 w-7 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate text-sm">{conversation.title}</h4>
                      {conversation.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {conversation.description}
                        </p>
                      )}
                      <div className="flex items-center space-x-2 mt-0.5">
                        <Badge variant="secondary" className="text-xs px-1 py-0">
                          {getConversationTypeLabel(conversation.type)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(conversation.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    {selectedConversationId === conversation.id && (
                      <CheckCircle className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
