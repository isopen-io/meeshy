import { useState } from 'react';

import { translateConversationEncryption } from '@/lib/i18n-conversation-encryption-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { PLAINTEXT_DIRECT_KEY } from '@/lib/view/conversation-encryption-explanation';
import type { PlaintextDirectGesture, PlaintextDirectOutcome } from '@/lib/view/plaintext-direct';
import { useConversationEncryptionCatalog } from '@/lib/view/use-conversation-encryption-catalog';

/**
 * **« OUVRIR UNE CONVERSATION NON CHIFFRÉE AVEC <NOM> »** (#12966) — le seul
 * geste d'un tête-à-tête chiffré de bout en bout : il mène À CÔTÉ, jamais vers
 * le clair dans ce fil (`openPlaintextDirect` refuse le fil d'où l'on part et
 * tout fil vu chiffré). Posé par la fiche Chiffrement et par le bandeau qui
 * remplace le composeur (#12986) ; `marker` nomme ses attributs de repère.
 * Un échec ou l'absence de réseau se dit sous le bouton, sans alerte.
 */
type GestureState = { readonly busy: boolean; readonly outcome: PlaintextDirectOutcome | null };

const MUTED = 'var(--color-ios-ink-2)';

export function PlaintextDirectAction({
  gesture,
  language,
  marker,
}: {
  readonly gesture: PlaintextDirectGesture;
  readonly language: InterfaceLanguage;
  readonly marker: 'conversation-encryption' | 'write-restriction';
}) {
  const ready = useConversationEncryptionCatalog(language);
  const [state, setState] = useState<GestureState>({ busy: false, outcome: null });
  if (!ready) return null;

  const onOpen = async () => {
    setState({ busy: true, outcome: null });
    const outcome = await gesture.open().catch((): PlaintextDirectOutcome => 'failed');
    setState({ busy: false, outcome });
  };
  const feedback = state.outcome === 'failed' || state.outcome === 'offline' ? translateConversationEncryption(language, PLAINTEXT_DIRECT_KEY[state.outcome]) : '';
  const label = state.busy
    ? translateConversationEncryption(language, PLAINTEXT_DIRECT_KEY.busy)
    : translateConversationEncryption(language, PLAINTEXT_DIRECT_KEY.open, { name: gesture.peerName });

  return (
    <div className="flex flex-col gap-1 px-4 pt-1">
      <button
        type="button"
        disabled={state.busy}
        aria-busy={state.busy}
        onClick={() => void onOpen()}
        {...{ [`data-${marker}-open-plaintext`]: '' }}
        className="flex items-center justify-center gap-2 rounded-chip px-4 text-body font-semibold disabled:opacity-50"
        style={{ minHeight: 44, color: 'var(--accent)', border: '1px solid var(--accent)' }}
      >
        {label}
      </button>
      <p role="status" aria-live="polite" className="text-caption" style={{ color: MUTED }} {...{ [`data-${marker}-open-plaintext-status`]: '' }}>
        {feedback}
      </p>
    </div>
  );
}
