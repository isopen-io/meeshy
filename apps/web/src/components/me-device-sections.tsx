import { lazy, Suspense } from 'react';

import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **CE QUE MON TÉLÉPHONE DIT À MES PROCHES, DANS MON PROFIL** (#14147, #18737, #18738, #18753) — ma batterie, mon téléphone
 * injoignable, ma vérification d'inactivité et « en appel ». La route `/me` n'en porte qu'UN nom, et sa carte de préchargement qu'un fichier : son budget de poids
 * est serré (`budgets.json`), chaque panneau garde son chunk et ses dépendances ici.
 */
const MeBatterySection = lazy(() => import('./battery-panel').then((m) => ({ default: m.MeBatterySection })));
const MePhoneReachabilityRow = lazy(() => import('./phone-reachability-panel').then((m) => ({ default: m.MePhoneReachabilityRow })));
const MeInactivityRow = lazy(() => import('./inactivity-panel').then((m) => ({ default: m.MeInactivityRow })));
const MePhoneCallRow = lazy(() => import('./phone-call-panel').then((m) => ({ default: m.MePhoneCallRow })));

export function MeDeviceSections({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <Suspense fallback={null}>
      <MeBatterySection language={language}>
        <Suspense fallback={null}>
          <MePhoneReachabilityRow language={language} />
          <MeInactivityRow language={language} />
          <MePhoneCallRow language={language} />
        </Suspense>
      </MeBatterySection>
    </Suspense>
  );
}
