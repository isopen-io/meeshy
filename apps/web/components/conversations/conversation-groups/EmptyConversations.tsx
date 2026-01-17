'use client';

import { memo } from 'react';
import { MessageSquare } from 'lucide-react';

interface EmptyConversationsProps {
  searchQuery: string;
  t: (key: string) => string;
}

export const EmptyConversations = memo(function EmptyConversations({
  searchQuery,
  t
}: EmptyConversationsProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-3" />
      <p className="text-sm text-muted-foreground">
        {searchQuery ? t('noConversationsFound') : t('noConversations')}
      </p>
    </div>
  );
});
