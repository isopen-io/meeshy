'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/query-keys';
import { messagesService } from '@/services/conversations/messages.service';

export type MessageStatusEntry = {
  participantId: string;
  displayName: string;
  avatar?: string | null;
  deliveredAt: string | null;
  receivedAt: string | null;
  readAt: string | null;
  readDevice?: string | null;
};

export type MessageStatusDetailsResult = {
  statuses: MessageStatusEntry[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
};

export function useMessageStatusDetails(
  messageId: string | null,
  options: { enabled?: boolean; filter?: 'all' | 'delivered' | 'read' | 'unread' } = {}
) {
  const { enabled = true, filter = 'all' } = options;

  return useQuery<MessageStatusDetailsResult>({
    queryKey: queryKeys.messages.statusDetails(messageId ?? ''),
    queryFn: () => messagesService.getMessageStatusDetails(messageId!, { filter, limit: 50 }),
    enabled: enabled && !!messageId,
    staleTime: 30_000,
  });
}
