import { useEffect, useRef, useState } from 'react';

import { loadSendSheetCatalog, translateSendSheet } from '@/lib/i18n-send-sheet-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import type { SendQueue } from '@/lib/send/send-queue';
import { sendQueue } from '@/lib/send/send-queue-instance';
import { sendToastOf, type SendToast } from '@/lib/send/send-toast';
import { href, navigate } from '@/routes/route-table';

import { BUTTON } from './ui-chrome';

export { startSendQueue } from '@/lib/send/send-queue-instance';

/**
 * LE TOAST D'APRÈS L'ENVOI (D5, #10949) — « Envoyé à Ana · Ouvrir », AUCUNE
 * navigation imposée. Il vit hors de la feuille : un envoi parti feuille
 * fermée, ou repris au lancement suivant, se dit aussi. Un envoi ne se dit
 * qu'une fois.
 */
export const SEND_TOAST_MS = 4000;

export function SendToastHost({ queue = sendQueue }: { readonly queue?: SendQueue }) {
  const [toast, setToast] = useState<SendToast | null>(null);
  const told = useRef(new Set<string>());

  useEffect(() => {
    const check = (): void => {
      queue.jobs().forEach((queued) => {
        const next = sendToastOf(queued);
        if (next === null) return;
        const said = `${queued.id}:${next.kind === 'failed' ? 'failed' : 'sent'}`;
        if (told.current.has(said)) return;
        told.current.add(said);
        void loadSendSheetCatalog(currentInterfaceLanguage()).then(() => setToast(next), () => undefined);
      });
    };
    const unsubscribers = new Map<string, () => void>();
    const follow = (): void => {
      queue.jobs().forEach((queued) => {
        if (!unsubscribers.has(queued.id)) unsubscribers.set(queued.id, queued.run.subscribe(check));
      });
      check();
    };
    const stop = queue.subscribe(follow);
    follow();
    return () => {
      stop();
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [queue]);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), SEND_TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (toast === null) return null;
  const language = currentInterfaceLanguage();
  const text =
    toast.kind === 'one'
      ? translateSendSheet(language, 'sendSheet.toast.sent', { name: toast.name })
      : toast.kind === 'failed'
        ? translateSendSheet(language, 'sendSheet.toast.failed')
        : translateSendSheet(language, 'sendSheet.toast.sentMany', { count: String(toast.count) });
  return (
    <div role="status" aria-live="polite" data-send-toast={toast.kind} className="send-toast fixed inset-x-4 bottom-6 z-50 mx-auto flex max-w-md items-center gap-3 rounded-card px-4 py-3 shadow-lg" style={{ backgroundColor: 'var(--color-ios-ink)', color: 'var(--color-ios-card)' }}>
      <span className="min-w-0 flex-1 truncate text-body font-medium">{text}</span>
      {toast.kind === 'one' ? (
        <button
          type="button"
          data-send-toast-open=""
          onClick={() => {
            setToast(null);
            navigate(href('thread', { conversation: toast.conversationId }));
          }}
          className={`${BUTTON.secondary} shrink-0`}
        >
          {translateSendSheet(language, 'sendSheet.toast.open')}
        </button>
      ) : null}
      {toast.kind === 'failed' && toast.retryable ? (
        <button
          type="button"
          data-send-toast-retry=""
          onClick={() => {
            setToast(null);
            void queue.flush();
          }}
          className={`${BUTTON.secondary} shrink-0`}
        >
          {translateSendSheet(language, 'sendSheet.state.retry')}
        </button>
      ) : null}
    </div>
  );
}
