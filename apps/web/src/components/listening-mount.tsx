import { lazy } from 'react';

import { OptionalChunk } from './optional-chunk';

/**
 * L'HÔTE DE L'ÉCOUTE REÇUE, ARMÉ DANS LE CHROME DIFFÉRÉ (#16729) — sur toutes les
 * routes d'un compte connecté, en un chunk à lui : la première peinture n'en paie
 * rien.
 */
const Host = lazy(() => import('./listening-host').then((m) => ({ default: m.ListeningHost })));

export function ListeningMount({ signedIn }: { readonly signedIn: boolean }) {
  if (!signedIn) return null;
  return (
    <OptionalChunk>
      <Host />
    </OptionalChunk>
  );
}
