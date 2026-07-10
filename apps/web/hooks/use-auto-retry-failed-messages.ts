'use client';

import { useEffect, useRef } from 'react';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useFailedMessagesStore } from '@/stores/failed-messages-store';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';

const MAX_RETRY_COUNT = 3;
const RETRY_DELAY_MS = 2000;

export function useAutoRetryFailedMessages() {
  const isOnline = useNetworkStatus();
  const isRetrying = useRef(false);

  useEffect(() => {
    if (!isOnline || isRetrying.current) return;

    const store = useFailedMessagesStore.getState();
    const retryable = store.failedMessages.filter(m => m.retryCount < MAX_RETRY_COUNT);

    if (retryable.length === 0) return;

    const diagnostics = meeshySocketIOService.getConnectionDiagnostics();
    if (!diagnostics.isConnected) return;

    isRetrying.current = true;

    const retrySequential = async () => {
      for (const msg of retryable) {
        store.incrementRetryCount(msg.id);
        try {
          await meeshySocketIOService.sendMessage(
            msg.conversationId,
            msg.content,
            msg.originalLanguage,
            msg.replyToId,
            undefined,
            msg.attachmentIds?.length ? msg.attachmentIds : undefined,
          );
          store.removeFailedMessage(msg.id);
        } catch {
          if (msg.retryCount + 1 >= MAX_RETRY_COUNT) {
            store.updateFailedMessage(msg.id, { error: 'Max retries exceeded' });
          }
        }
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
      isRetrying.current = false;
    };

    const timeout = setTimeout(retrySequential, RETRY_DELAY_MS);
    return () => {
      clearTimeout(timeout);
      isRetrying.current = false;
    };
  }, [isOnline]);
}
