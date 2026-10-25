import { useEffect, useId, useState } from 'react';
import { useStore } from 'zustand/react';

import { endToEndRegimeLedger, endToEndSealed } from '@/lib/end-to-end-regime-ledger';

import {
  isConversationEncryptionCatalogLoaded,
  loadConversationEncryptionCatalog,
  translateConversationEncryption,
} from '@/lib/i18n-conversation-encryption-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { encryptionExplanation, FACT_KEY, PLAINTEXT_DIRECT_KEY, REGIME_SUMMARY_KEY, TOPIC_KEY } from '@/lib/view/conversation-encryption-explanation';
import type { PlaintextDirectGesture, PlaintextDirectOutcome } from '@/lib/view/plaintext-direct';

/**
 * **LA SECTION « CHIFFREMENT » DE LA FEUILLE DE DÉTAILS** (#12880) — miroir de
 * la fiche Chiffrement d'iOS (`ConversationEncryptionDetailSheet` +
 * `ConversationEncryptionExplanationSections`) : en mots simples, le mode de la
 * conversation ouverte, qui peut la lire, ce qui fonctionne et ce qui manque,
 * ce qui n'est pas encore livré, les appareils et la bascule. Le web ne
 * bascule pas le chiffrement : il l'explique. Le résumé se lit d'emblée ; le
 * détail s'ouvre d'un geste (`<details>`, clavier et lecteur d'écran compris).
 *
 * CHARGÉE À LA DEMANDE avec son catalogue (`conversation-details-sheet.tsx`,
 * `lazy()`) : le fil et la liste n'en paient aucun octet.
 */
const MUTED = 'var(--color-ios-ink-2)';

function useEncryptionCatalog(language: InterfaceLanguage): boolean {
  const [ready, setReady] = useState(() => isConversationEncryptionCatalogLoaded(language));
  useEffect(() => {
    if (isConversationEncryptionCatalogLoaded(language)) {
      setReady(true);
      return;
    }
    let live = true;
    setReady(false);
    void loadConversationEncryptionCatalog(language).then(
      () => live && setReady(true),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [language]);
  return ready;
}

type GestureState = { readonly busy: boolean; readonly outcome: PlaintextDirectOutcome | null };

/**
 * #12949 — une conversation que ce compte a VUE chiffrée de bout en bout se
 * décrit comme telle, même servie sans mode : elle ne repasse jamais en clair.
 */
export function ConversationEncryptionSection({
  conversation,
  plaintextDirect,
}: {
  readonly conversation: { readonly id?: string; readonly type: string; readonly encryptionMode?: string | null };
  readonly plaintextDirect?: PlaintextDirectGesture | undefined;
}) {
  const language = currentInterfaceLanguage();
  const ready = useEncryptionCatalog(language);
  const headingId = useId();
  const sealedIds = useStore(endToEndRegimeLedger, (state) => state.sealed);
  const sealed = conversation.id !== undefined && endToEndSealed({ sealed: sealedIds }, { conversationId: conversation.id });
  const [gesture, setGesture] = useState<GestureState>({ busy: false, outcome: null });

  if (!ready) return <div aria-busy="true" className="px-4 pb-6" data-conversation-encryption-catalog-loading />;

  const t = (key: Parameters<typeof translateConversationEncryption>[1], params?: Readonly<Record<string, string>>): string =>
    translateConversationEncryption(language, key, params);
  const isDirect = conversation.type === 'direct';
  const explanation = encryptionExplanation({ mode: sealed ? 'e2ee' : conversation.encryptionMode, isDirect });
  const offersPlaintextDirect = isDirect && explanation.regime === 'end-to-end' && plaintextDirect !== undefined;
  const onOpenPlaintextDirect = async () => {
    if (plaintextDirect === undefined) return;
    setGesture({ busy: true, outcome: null });
    const outcome = await plaintextDirect.open().catch((): PlaintextDirectOutcome => 'failed');
    setGesture({ busy: false, outcome });
  };
  const gestureFeedback = gesture.outcome === 'failed' || gesture.outcome === 'offline' ? t(PLAINTEXT_DIRECT_KEY[gesture.outcome]) : '';

  return (
    <section aria-labelledby={headingId} className="pb-6" data-conversation-encryption={explanation.regime}>
      <h4 id={headingId} className="px-4 pb-2 text-caption font-semibold uppercase" style={{ color: MUTED }}>
        {t('conversationEncryption.section')}
      </h4>
      <details className="px-4">
        <summary className="cursor-pointer pb-3 text-body font-semibold" style={{ minHeight: 44 }} data-conversation-encryption-summary>
          {t(REGIME_SUMMARY_KEY[explanation.regime])}
        </summary>
        {explanation.sections.map((section) => (
          <div key={section.topic} className="pb-3" data-conversation-encryption-topic={section.topic}>
            <h5 className="pb-1 text-caption font-semibold" style={{ color: MUTED }}>
              {t(TOPIC_KEY[section.topic])}
            </h5>
            <ul className="flex flex-col gap-1 text-body">
              {section.facts.map((fact) => (
                <li key={fact} data-conversation-encryption-fact={fact}>
                  {t(FACT_KEY[fact])}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </details>
      {offersPlaintextDirect ? (
        <div className="flex flex-col gap-1 px-4 pt-1">
          <button
            type="button"
            disabled={gesture.busy}
            aria-busy={gesture.busy}
            onClick={() => void onOpenPlaintextDirect()}
            data-conversation-encryption-open-plaintext
            className="flex items-center justify-center gap-2 rounded-chip px-4 text-body font-semibold disabled:opacity-50"
            style={{ minHeight: 44, color: 'var(--accent)', border: '1px solid var(--accent)' }}
          >
            {gesture.busy ? t(PLAINTEXT_DIRECT_KEY.busy) : t(PLAINTEXT_DIRECT_KEY.open, { name: plaintextDirect.peerName })}
          </button>
          <p role="status" aria-live="polite" className="text-caption" style={{ color: MUTED }} data-conversation-encryption-open-plaintext-status>
            {gestureFeedback}
          </p>
        </div>
      ) : null}
    </section>
  );
}
