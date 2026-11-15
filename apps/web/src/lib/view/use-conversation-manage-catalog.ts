import { useEffect, useState } from 'react';

import { isConversationManageCatalogLoaded, loadConversationManageCatalog } from '@/lib/i18n-conversation-manage-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * Le catalogue de gestion (#10613, #7836) est-il prêt pour cette langue ? Il se
 * charge à l'ouverture de la feuille ; les contrôles de gestion attendent leurs
 * mots, la liste des membres (catalogue d'interface) n'attend rien.
 */
export function useConversationManageCatalog(language: InterfaceLanguage): boolean {
  const [ready, setReady] = useState(() => isConversationManageCatalogLoaded(language));
  useEffect(() => {
    if (isConversationManageCatalogLoaded(language)) {
      setReady(true);
      return undefined;
    }
    let live = true;
    setReady(false);
    void loadConversationManageCatalog(language).then(
      () => live && setReady(true),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [language]);
  return ready;
}
