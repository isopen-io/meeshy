import { lazy } from 'react';

import { OptionalChunk } from './optional-chunk';

/**
 * L'HÔTE DU TÉLÉPHONE INJOIGNABLE REÇU, ARMÉ DANS LE CHROME DIFFÉRÉ (#18737) — sur toutes les routes d'un compte
 * connecté, en un chunk à lui, comme la batterie : la première peinture n'en paie rien.
 */
const Host = lazy(() => import('./phone-reachability-host').then((m) => ({ default: m.PhoneReachabilityHost })));

export function PhoneReachabilityMount({ signedIn }: { readonly signedIn: boolean }) {
  if (!signedIn) return null;
  return (
    <OptionalChunk>
      <Host />
    </OptionalChunk>
  );
}
