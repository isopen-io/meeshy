import { lazy } from 'react';

import { OptionalChunk } from './optional-chunk';

/**
 * L'HÔTE D'« EN APPEL » REÇU, ARMÉ DANS LE CHROME DIFFÉRÉ (#18753) — sur toutes les routes d'un compte connecté, en
 * un chunk à lui, comme l'alerte d'inactivité : la première peinture n'en paie rien.
 */
const Host = lazy(() => import('./phone-call-host').then((m) => ({ default: m.PhoneCallHost })));

export function PhoneCallMount({ signedIn }: { readonly signedIn: boolean }) {
  if (!signedIn) return null;
  return (
    <OptionalChunk>
      <Host />
    </OptionalChunk>
  );
}
