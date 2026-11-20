import { lazy } from 'react';

import { OptionalChunk } from './optional-chunk';

/**
 * L'HÔTE DE LA CHUTE DÉTECTÉE REÇUE, ARMÉ DANS LE CHROME DIFFÉRÉ (#18748) — sur toutes les routes d'un compte connecté,
 * en un chunk à lui, comme l'alerte d'inactivité : la première peinture n'en paie rien.
 */
const Host = lazy(() => import('./fall-host').then((m) => ({ default: m.FallHost })));

export function FallMount({ signedIn }: { readonly signedIn: boolean }) {
  if (!signedIn) return null;
  return (
    <OptionalChunk>
      <Host />
    </OptionalChunk>
  );
}
