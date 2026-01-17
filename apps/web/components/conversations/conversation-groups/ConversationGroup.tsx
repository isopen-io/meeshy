'use client';

import { memo, useCallback } from 'react';
import { Pin, ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Conversation } from '@meeshy/shared/types';

interface ConversationGroupProps {
  type: 'pinned' | 'category' | 'uncategorized';
  categoryId?: string;
  categoryName?: string;
  conversations: Conversation[];
  sectionId: string;
  isCollapsed: boolean;
  hasUnreadMessages: boolean;
  onToggleSection: (sectionId: string) => void;
  t: (key: string) => string;
  categoriesLength: number;
  children: React.ReactNode;
}

export const ConversationGroup = memo(function ConversationGroup({
  type,
  categoryName,
  sectionId,
  isCollapsed,
  hasUnreadMessages,
  onToggleSection,
  t,
  categoriesLength,
  conversations,
  children
}: ConversationGroupProps) {
  const handleToggle = useCallback(() => {
    onToggleSection(sectionId);
  }, [sectionId, onToggleSection]);

  // Afficher le header pour pinned, category, ou uncategorized si des catégories existent
  const shouldShowHeader = type === 'pinned' || type === 'category' || (type === 'uncategorized' && categoriesLength > 0);

  return (
    <div className="mb-4">
      {/* Header de section */}
      {shouldShowHeader && (
        <div
          className="flex items-center gap-2 px-2 py-1.5 mb-1 cursor-pointer hover:bg-accent/50 rounded-md transition-colors"
          onClick={handleToggle}
        >
          {/* Chevron pour indiquer si la section est ouverte ou fermée */}
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}

          {type === 'pinned' ? (
            <>
              <Pin className="h-4 w-4 text-primary fill-current flex-shrink-0" />
              <h4 className={cn(
                "text-xs font-semibold text-muted-foreground uppercase tracking-wide",
                hasUnreadMessages && "font-bold text-foreground"
              )}>
                {t('conversationsList.pinned') || 'Épinglées'}
              </h4>
            </>
          ) : type === 'uncategorized' ? (
            <>
              <Folder className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <h4 className={cn(
                "text-xs font-semibold text-muted-foreground uppercase tracking-wide",
                hasUnreadMessages && "font-bold text-foreground"
              )}>
                {t('conversationsList.uncategorized') || 'Non catégorisées'}
              </h4>
            </>
          ) : (
            <>
              <Folder className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <h4 className={cn(
                "text-xs font-semibold text-muted-foreground uppercase tracking-wide",
                hasUnreadMessages && "font-bold text-foreground"
              )}>
                {categoryName}
              </h4>
            </>
          )}
          <Badge variant="secondary" className="ml-auto h-5 px-2 text-[10px]">
            {conversations.length}
          </Badge>
        </div>
      )}

      {/* Conversations du groupe - masquées si collapsed, sauf pour uncategorized sans catégories */}
      {(!isCollapsed || (type === 'uncategorized' && categoriesLength === 0)) && (
        <div className="space-y-1">
          {children}
        </div>
      )}
    </div>
  );
});
