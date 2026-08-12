/**
 * useCallRetryToast — surfaces a « Réessayer » toast after a transient call
 * failure (failed / connectionLost) for THIS conversation, wired to re-initiate
 * the same call type. Closes the emission↔action gap: the failure is detected
 * deep in the in-call UI (VideoCallInterface watchdog) which owns no
 * initiation; it posts `pendingRetry` to the store, and this hook — mounted at
 * the conversation level next to `startCall` — turns it into an actionable
 * toast. Manual single-tap retry (no surprising auto-retry). Backed by prod
 * 2026-07-12: ~16% of calls end in transient failures a retry often recovers.
 */

'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useCallStore } from '@/stores/call-store';
import { useI18n } from '@/hooks/useI18n';
import type { CallMediaType } from '@/hooks/conversations/use-video-call';

export function useCallRetryToast(
  conversationId: string | null,
  onRetry: (type: CallMediaType) => void,
): void {
  const pendingRetryMap = useCallStore((s) => s.pendingRetry);
  const clearCallRetry = useCallStore((s) => s.clearCallRetry);
  const { t } = useI18n('calls');

  // Keep onRetry in a ref so the effect fires only when a NEW retry offer
  // lands, never on the parent re-creating the callback.
  const onRetryRef = useRef(onRetry);
  useEffect(() => { onRetryRef.current = onRetry; }, [onRetry]);

  useEffect(() => {
    if (!conversationId) return;
    const pendingRetry = pendingRetryMap[conversationId];
    if (!pendingRetry) return;
    const type = pendingRetry.type;
    // Consume only THIS conversation's offer: other conversations' offers
    // (map keyed by conversationId) must survive to be surfaced later.
    clearCallRetry(conversationId);
    toast.error(t('toasts.callFailed'), {
      duration: 10_000,
      action: {
        label: t('toasts.retry'),
        onClick: () => onRetryRef.current(type),
      },
    });
  }, [pendingRetryMap, conversationId, clearCallRetry, t]);
}
