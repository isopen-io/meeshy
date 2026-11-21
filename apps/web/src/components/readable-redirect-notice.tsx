import { useEffect } from 'react';
import type { StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand/react';

import type { InterfaceLanguage } from '@/lib/interface-language';
import type { ReadableRedirectNoticeState } from '@/lib/view/readable-redirect-notices';

import { ReadableRedirectNoticeText } from './end-to-end-peer-without-device-banner';

export const READABLE_REDIRECT_NOTICE_MS = 6000;

/**
 * L'AVIS DE LA CONVERSATION D'ARRIVÉE (#20075) — « Ana ne reçoit pas le chiffré
 * : message parti dans votre conversation en clair. » au-dessus du composeur
 * de la conversation lisible qui vient de s'ouvrir, le temps de le lire. Seule
 * la conversation que l'avis nomme le montre ; chargé à la demande par
 * `thread-write-lock.tsx`, seulement quand un avis la nomme.
 */
export function ReadableRedirectNotice({
  conversationId,
  notices,
  language,
}: {
  readonly conversationId: string;
  readonly notices: StoreApi<ReadableRedirectNoticeState>;
  readonly language: InterfaceLanguage;
}) {
  const notice = useStore(notices, (state) => (state.notice?.conversationId === conversationId ? state.notice : null));
  const peerName = notice?.peerName ?? null;
  useEffect(() => {
    if (peerName === null) return undefined;
    const timer = setTimeout(() => notices.getState().clear(conversationId), READABLE_REDIRECT_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [peerName, notices, conversationId]);
  return peerName === null ? null : <ReadableRedirectNoticeText peerName={peerName} quoteDropped={notice?.quoteDropped === true} language={language} />;
}
