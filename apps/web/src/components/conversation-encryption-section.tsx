import { useId } from 'react';
import { useStore } from 'zustand/react';

import { endToEndRegimeLedger, endToEndSealed } from '@/lib/end-to-end-regime-ledger';
import { translateConversationEncryption } from '@/lib/i18n-conversation-encryption-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { encryptionExplanation, FACT_KEY, REGIME_SUMMARY_KEY, TOPIC_KEY } from '@/lib/view/conversation-encryption-explanation';
import type { PlaintextDirectGesture } from '@/lib/view/plaintext-direct';
import { useConversationEncryptionCatalog } from '@/lib/view/use-conversation-encryption-catalog';

import { PlaintextDirectAction } from './plaintext-direct-action';

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
  const ready = useConversationEncryptionCatalog(language);
  const headingId = useId();
  const sealedIds = useStore(endToEndRegimeLedger, (state) => state.sealed);
  const sealed = conversation.id !== undefined && endToEndSealed({ sealed: sealedIds }, { conversationId: conversation.id });

  if (!ready) return <div aria-busy="true" className="px-4 pb-6" data-conversation-encryption-catalog-loading />;

  const t = (key: Parameters<typeof translateConversationEncryption>[1], params?: Readonly<Record<string, string>>): string =>
    translateConversationEncryption(language, key, params);
  const isDirect = conversation.type === 'direct';
  const explanation = encryptionExplanation({ mode: sealed ? 'e2ee' : conversation.encryptionMode, isDirect });
  const offeredGesture = isDirect && explanation.regime === 'end-to-end' ? plaintextDirect : undefined;

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
      {offeredGesture === undefined ? null : <PlaintextDirectAction gesture={offeredGesture} language={language} marker="conversation-encryption" />}
    </section>
  );
}
