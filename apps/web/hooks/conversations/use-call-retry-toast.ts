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
  const pendingRetry = useCallStore((s) => s.pendingRetry);
  const clearCallRetry = useCallStore((s) => s.clearCallRetry);
  const { t } = useI18n('calls');

  // Keep onRetry in a ref so the effect fires only when a NEW retry offer
  // lands, never on the parent re-creating the callback.
  const onRetryRef = useRef(onRetry);
  useEffect(() => { onRetryRef.current = onRetry; }, [onRetry]);

  useEffect(() => {
    if (!pendingRetry || !conversationId || pendingRetry.conversationId !== conversationId) return;
    const type = pendingRetry.type;
    // Consume the offer immediately: the toast now owns the retry; leaving it
    // set would re-fire on the next render.
    clearCallRetry();
    toast.error(t('calls.toasts.callFailed'), {
      duration: 10_000,
      action: {
        label: t('calls.toasts.retry'),
        onClick: () => onRetryRef.current(type),
      },
    });
  }, [pendingRetry, conversationId, clearCallRetry, t]);
}
