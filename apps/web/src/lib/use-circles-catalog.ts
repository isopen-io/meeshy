import { useEffect, useState } from 'react';

import { isCirclesCatalogLoaded, loadCirclesCatalog } from './i18n-circles-catalog';
import type { InterfaceLanguage } from './interface-language';

/**
 * Le catalogue « Mes cercles » (#13938) chargé à la demande : `false` tant
 * qu'il n'est pas là, puis le rendu suivant le lit de façon synchrone. Module
 * léger — Découvrir l'importe sans emporter l'onglet « Cercles ».
 */
export function useCirclesCatalog(language: InterfaceLanguage): boolean {
  const [, setLoaded] = useState<InterfaceLanguage | null>(null);
  useEffect(() => {
    if (isCirclesCatalogLoaded(language)) return undefined;
    let live = true;
    loadCirclesCatalog(language).then(
      () => {
        if (live) setLoaded(language);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [language]);
  return isCirclesCatalogLoaded(language);
}
