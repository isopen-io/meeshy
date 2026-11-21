import { useState } from 'react';

import { translateConversationEncryption } from '@/lib/i18n-conversation-encryption-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { PLAINTEXT_DIRECT_KEY } from '@/lib/view/conversation-encryption-explanation';
import { peerWithoutDeviceTitle, quoteDroppedNotice, redirectedToReadableNotice, writePlainLabel } from '@/lib/view/end-to-end-peer-without-device';
import type { PlaintextDirectGesture, PlaintextDirectOutcome } from '@/lib/view/plaintext-direct';
import { useConversationEncryptionCatalog } from '@/lib/view/use-conversation-encryption-catalog';

import { ThreadComposerChrome } from './thread-composer-chrome';

/**
 * **« <PRÉNOM> NE PEUT PAS RECEVOIR DE MESSAGES CHIFFRÉS »** (#20075, miroir
 * `EndToEndPeerWithoutDeviceBanner`, iOS #20074) — au-dessus du composeur d'un
 * tête-à-tête chiffré de bout en bout dont le pair n'a aucun appareil chiffré :
 * il dit, AVANT l'envoi, que ce qu'on écrit partira dans la conversation en
 * clair de la paire, et « Écrire sans chiffrement » l'ouvre tout de suite. Un
 * échec ou l'absence de réseau se dit sous le bouton, sans alerte. Monté par
 * `thread-sealed-direct-lock.tsx`, chargé à la demande.
 */
type GestureState = { readonly busy: boolean; readonly outcome: PlaintextDirectOutcome | null };

const MUTED = 'var(--color-ios-ink-2)';

export function EndToEndPeerWithoutDeviceBanner({ gesture, language }: { readonly gesture: PlaintextDirectGesture; readonly language: InterfaceLanguage }) {
  const ready = useConversationEncryptionCatalog(language);
  const [state, setState] = useState<GestureState>({ busy: false, outcome: null });
  if (!ready) return null;

  const t = (key: Parameters<typeof translateConversationEncryption>[1], params?: Readonly<Record<string, string>>): string =>
    translateConversationEncryption(language, key, params);
  const onWrite = async () => {
    setState({ busy: true, outcome: null });
    const outcome = await gesture.open().catch((): PlaintextDirectOutcome => 'failed');
    setState({ busy: false, outcome });
  };
  const feedback = state.outcome === 'failed' || state.outcome === 'offline' ? t(PLAINTEXT_DIRECT_KEY[state.outcome]) : '';

  return (
    <ThreadComposerChrome>
      <div role="note" data-peer-without-device="" className="flex flex-col items-center gap-1 px-4 pt-2">
        <p data-peer-without-device-title="" className="text-meta m-0 text-center" style={{ color: MUTED }}>
          {peerWithoutDeviceTitle(t, gesture.peerName)}
        </p>
        <button
          type="button"
          disabled={state.busy}
          aria-busy={state.busy}
          onClick={() => void onWrite()}
          data-peer-without-device-write-plain=""
          className="btn-press rounded-chip px-4 text-body font-semibold disabled:opacity-50"
          style={{ minHeight: 44, color: 'var(--accent)' }}
        >
          {state.busy ? t(PLAINTEXT_DIRECT_KEY.busy) : writePlainLabel(t)}
        </button>
        <p role="status" aria-live="polite" className="text-caption m-0" style={{ color: MUTED }} data-peer-without-device-status="">
          {feedback}
        </p>
      </div>
    </ThreadComposerChrome>
  );
}

/** L'avis de la conversation d'arrivée, chargé avec le bandeau (`readable-redirect-notice.tsx`). */
export function ReadableRedirectNoticeText({ peerName, quoteDropped, language }: { readonly peerName: string; readonly quoteDropped: boolean; readonly language: InterfaceLanguage }) {
  const ready = useConversationEncryptionCatalog(language);
  if (!ready) return null;
  return (
    <ThreadComposerChrome>
      <p role="status" aria-live="polite" data-readable-redirect-notice="" className="text-meta m-0 px-4 py-2 text-center" style={{ color: MUTED }}>
        {redirectedToReadableNotice((key, params) => translateConversationEncryption(language, key, params), peerName)}
      </p>
      {quoteDropped ? (
        <p data-readable-redirect-quote="" className="text-meta m-0 px-4 pb-2 text-center" style={{ color: MUTED }}>
          {quoteDroppedNotice((key) => translateConversationEncryption(language, key))}
        </p>
      ) : null}
    </ThreadComposerChrome>
  );
}
