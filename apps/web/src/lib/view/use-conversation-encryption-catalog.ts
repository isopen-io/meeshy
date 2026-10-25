import { useEffect, useState } from 'react';

import { isConversationEncryptionCatalogLoaded, loadConversationEncryptionCatalog } from '@/lib/i18n-conversation-encryption-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * LE CATALOGUE DU CHIFFREMENT, CHARGÉ À LA DEMANDE (#12880) — par la section
 * « Chiffrement » de la feuille de détails, et par le geste du bandeau d'un
 * tête-à-tête chiffré (#12986) : seul l'écran qui en montre un mot en paie les
 * octets. Rend `true` une fois le catalogue de la langue prêt.
 */
export function useConversationEncryptionCatalog(language: InterfaceLanguage): boolean {
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
