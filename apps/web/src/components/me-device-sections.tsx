import { lazy, Suspense } from 'react';

import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **CE QUE MON TÉLÉPHONE DIT À MES PROCHES, DANS MON PROFIL** (#14147, #18737, #18738) — ma batterie, mon téléphone
 * injoignable et ma vérification d'inactivité. La route `/me` n'en porte qu'UN nom, et sa carte de préchargement qu'un fichier : son budget de poids
 * est serré (`budgets.json`), chaque panneau garde son chunk et ses dépendances ici.
 */
const MeBatterySection = lazy(() => import('./battery-panel').then((m) => ({ default: m.MeBatterySection })));
const MePhoneReachabilityRow = lazy(() => import('./phone-reachability-panel').then((m) => ({ default: m.MePhoneReachabilityRow })));
const MeInactivityRow = lazy(() => import('./inactivity-panel').then((m) => ({ default: m.MeInactivityRow })));

export function MeDeviceSections({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <Suspense fallback={null}>
      <MeBatterySection language={language}>
        <Suspense fallback={null}>
          <MePhoneReachabilityRow language={language} />
          <MeInactivityRow language={language} />
        </Suspense>
      </MeBatterySection>
    </Suspense>
  );
}
