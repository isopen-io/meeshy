/**
 * Composant liste des conversations d'une communauté
 * Lazy loaded pour optimiser le bundle (bundle-dynamic-imports)
 */

import { memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageSquare, Lock } from 'lucide-react';
import type { Conversation } from '@meeshy/shared/types';

interface ConversationsListProps {
  conversations: Conversation[];
  isLoading: boolean;
  onConversationClick: (id: string) => void;
  tGroups: (key: string) => string;
}

function ConversationsList({
  conversations,
  isLoading,
  onConversationClick,
  tGroups
}: ConversationsListProps) {
  return (
    <div className="bg-background/80 dark:bg-background/90 backdrop-blur-sm rounded-2xl border border-border/30 dark:border-border/50 p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <MessageSquare className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-bold text-foreground">{tGroups('details.conversations')}</h2>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <span className="ml-2 text-muted-foreground">
            {tGroups('details.loadingConversations')}
          </span>
        </div>
      ) : conversations.length > 0 ? (
        <div className="space-y-3">
          {conversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              onClick={() => onConversationClick(conversation.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {tGroups('details.noConversations')}
          </h3>
          <p className="text-muted-foreground">{tGroups('details.noConversationsDescription')}</p>
        </div>
      )}
    </div>
  );
}

// ConversationItem memoized pour éviter les re-renders inutiles
const ConversationItem = memo(function ConversationItem({
  conversation,
  onClick
}: {
  conversation: Conversation;
  onClick: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl border border-border/20 dark:border-border/40 hover:bg-accent/50 dark:hover:bg-accent/70 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <div className="flex-shrink-0">
        <Avatar className="h-10 w-10">
          <AvatarImage src={conversation.avatar || undefined} />
          <AvatarFallback className="bg-primary/20 text-primary font-bold">
            {conversation.title?.substring(0, 2).toUpperCase() || 'C'}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground truncate">
            {conversation.title || `Conversation ${conversation.id.slice(-4)}`}
          </h3>
          {conversation.visibility === 'private' && (
            <Lock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          )}
        </div>
        <p className="text-sm text-muted-foreground truncate">
          {conversation.description || 'Aucune description'}
        </p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
          <span>{(conversation as any)._count?.members || 0} membres</span>
          <span>{(conversation as any)._count?.messages || 0} messages</span>
          {conversation.lastMessageAt && (
            <span>
              Dernière activité: {new Date(conversation.lastMessageAt).toLocaleDateString('fr-FR')}
            </span>
          )}
        </div>
      </div>
      <div className="flex-shrink-0">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
});

export default ConversationsList;
