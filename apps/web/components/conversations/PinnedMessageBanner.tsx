'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Pin, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiService } from '@/services/api.service';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useI18n } from '@/hooks/useI18n';

interface PinnedMessage {
  id: string;
  content: string;
  originalContent: string;
  pinnedAt: string;
  pinnedBy: string;
  sender: {
    id: string;
    username: string;
  };
}

interface PinnedMessagesResponse {
  messages: PinnedMessage[];
}

interface PinnedMessageBannerProps {
  conversationId: string;
  onNavigateToMessage: (id: string) => void;
}

export function PinnedMessageBanner({ conversationId, onNavigateToMessage }: PinnedMessageBannerProps) {
  const { t } = useI18n('conversations');
  const [dismissed, setDismissed] = useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['pinned-messages', conversationId],
    queryFn: async () => {
      const response = await apiService.get<PinnedMessagesResponse>(
        `/conversations/${conversationId}/pinned-messages`,
        { limit: 1 }
      );
      return response.data ?? null;
    },
    staleTime: 30000,
  });

  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['pinned-messages', conversationId] });
    };

    const socket = meeshySocketIOService.getSocket();
    if (!socket) return;

    socket.on('message:pinned' as never, invalidate);
    socket.on('message:unpinned' as never, invalidate);

    return () => {
      socket.off('message:pinned' as never, invalidate);
      socket.off('message:unpinned' as never, invalidate);
    };
  }, [conversationId, queryClient]);

  const pinnedMessage = data?.messages?.[0];

  if (!pinnedMessage || dismissed) return null;

  const displayContent = pinnedMessage.content || pinnedMessage.originalContent;

  return (
    <AnimatePresence>
      <motion.div
        key="pinned-banner"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="overflow-hidden"
      >
        <div
          className={cn(
            'flex items-center gap-2 px-4 py-2',
            'bg-amber-50 dark:bg-amber-900/20',
            'border-b border-amber-200 dark:border-amber-800',
            'rounded-none w-full'
          )}
        >
          <Pin
            className="h-3.5 w-3.5 flex-shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />

          <button
            type="button"
            onClick={() => onNavigateToMessage(pinnedMessage.id)}
            className={cn(
              'flex-1 text-left text-sm truncate min-w-0',
              'text-amber-700 dark:text-amber-300',
              'hover:underline focus:outline-none focus-visible:underline'
            )}
          >
            <span className="font-medium">{pinnedMessage.sender.username}: </span>
            <span>{displayContent}</span>
          </button>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label={t('pinnedBanner.close')}
            className={cn(
              'flex-shrink-0 p-0.5 rounded',
              'text-amber-600 dark:text-amber-400',
              'hover:bg-amber-100 dark:hover:bg-amber-800/40',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500'
            )}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
