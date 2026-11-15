import { lazy } from 'react';

import { OptionalChunk } from './optional-chunk';

/**
 * L'HÔTE DE LA BATTERIE REÇUE, ARMÉ DANS LE CHROME DIFFÉRÉ (#14147) — sur toutes les routes d'un compte connecté,
 * en un chunk à lui : la première peinture n'en paie rien.
 */
const Host = lazy(() => import('./battery-host').then((m) => ({ default: m.BatteryHost })));

export function BatteryMount({ signedIn }: { readonly signedIn: boolean }) {
  if (!signedIn) return null;
  return (
    <OptionalChunk>
      <Host />
    </OptionalChunk>
  );
}
