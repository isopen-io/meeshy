import { useEffect, useId, useState } from 'react';

import {
  isConversationEncryptionCatalogLoaded,
  loadConversationEncryptionCatalog,
  translateConversationEncryption,
} from '@/lib/i18n-conversation-encryption-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { encryptionExplanation, FACT_KEY, REGIME_SUMMARY_KEY, TOPIC_KEY } from '@/lib/view/conversation-encryption-explanation';

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

export function ConversationEncryptionSection({ conversation }: { readonly conversation: { readonly type: string; readonly encryptionMode?: string | null } }) {
  const language = currentInterfaceLanguage();
  const ready = useEncryptionCatalog(language);
  const headingId = useId();

  if (!ready) return <div aria-busy="true" className="px-4 pb-6" data-conversation-encryption-catalog-loading />;

  const t = (key: Parameters<typeof translateConversationEncryption>[1]): string => translateConversationEncryption(language, key);
  const explanation = encryptionExplanation({ mode: conversation.encryptionMode, isDirect: conversation.type === 'direct' });

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
    </section>
  );
}
