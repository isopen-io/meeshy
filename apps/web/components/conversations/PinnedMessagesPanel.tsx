'use client';

import { memo, useState } from 'react';
import { Pin, X, ChevronDown, ChevronUp } from 'lucide-react';
import { usePinnedMessagesQuery, useUnpinMessageMutation } from '@/hooks/queries/use-pinned-messages-query';
import { cn } from '@/lib/utils';
import { formatRelativeDate } from '@/utils/date-format';
import { useI18n } from '@/hooks/useI18n';

interface PinnedMessagesPanelProps {
  conversationId: string;
  onNavigateToMessage?: (messageId: string) => void;
  canPin?: boolean;
}

export const PinnedMessagesPanel = memo(function PinnedMessagesPanel({
  conversationId,
  onNavigateToMessage,
  canPin = false,
}: PinnedMessagesPanelProps) {
  const { t } = useI18n('bubbleStream');
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: pinnedMessages = [], isLoading } = usePinnedMessagesQuery(conversationId);
  const unpinMutation = useUnpinMessageMutation(conversationId);

  if (isLoading || pinnedMessages.length === 0) return null;

  const displayMessage = pinnedMessages[0];

  return (
    <div className="border-b border-border bg-muted/30 px-3 py-1.5">
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => {
          if (pinnedMessages.length > 1) {
            setIsExpanded((prev) => !prev);
          } else if (onNavigateToMessage) {
            onNavigateToMessage(displayMessage.id);
          }
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
      >
        <Pin className="h-3.5 w-3.5 text-primary flex-shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground truncate">
            {displayMessage.content || '📎 Pièce jointe'}
          </p>
        </div>
        {pinnedMessages.length > 1 && (
          <span className="text-xs text-muted-foreground flex-shrink-0 flex items-center gap-0.5">
            {pinnedMessages.length}
            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </span>
        )}
      </div>

      {isExpanded && pinnedMessages.length > 1 && (
        <ul className="mt-1.5 space-y-1" role="list" aria-label="Messages épinglés">
          {pinnedMessages.map((msg) => (
            <li
              key={msg.id}
              className={cn(
                'flex items-start gap-2 py-1 rounded-md px-1.5',
                'hover:bg-muted/60 cursor-pointer group'
              )}
              onClick={() => onNavigateToMessage?.(msg.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onNavigateToMessage?.(msg.id)}
            >
              <Pin className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" aria-hidden />
              <div className="flex-1 min-w-0">
                <p className="text-xs truncate">{msg.content || '📎 Pièce jointe'}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatRelativeDate(msg.createdAt, { t })}
                </p>
              </div>
              {canPin && (
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    unpinMutation.mutate(msg.id);
                  }}
                  aria-label="Désépingler"
                  type="button"
                >
                  <X className="h-3 w-3 text-destructive" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
