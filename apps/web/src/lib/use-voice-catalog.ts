import { useEffect, useState } from 'react';

import { isVoiceCatalogLoaded, loadVoiceCatalog } from './i18n-voice-catalog';
import type { InterfaceLanguage } from './interface-language';

/** Charge le catalogue de la voix (#16419) et rend `true` une fois lisible — la section des réglages et la note sous mon vocal l'attendent. */
export function useVoiceCatalog(language: InterfaceLanguage): boolean {
  const [, setLoaded] = useState<InterfaceLanguage | null>(null);
  useEffect(() => {
    if (isVoiceCatalogLoaded(language)) return undefined;
    let live = true;
    loadVoiceCatalog(language).then(
      () => {
        if (live) setLoaded(language);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [language]);
  return isVoiceCatalogLoaded(language);
}
