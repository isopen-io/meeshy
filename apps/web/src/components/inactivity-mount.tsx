import { lazy } from 'react';

import { OptionalChunk } from './optional-chunk';

/**
 * L'HÔTE DE L'ALERTE D'INACTIVITÉ REÇUE, ARMÉ DANS LE CHROME DIFFÉRÉ (#18738) — sur toutes les routes d'un compte
 * connecté, en un chunk à lui, comme le téléphone injoignable : la première peinture n'en paie rien.
 */
const Host = lazy(() => import('./inactivity-host').then((m) => ({ default: m.InactivityHost })));

export function InactivityMount({ signedIn }: { readonly signedIn: boolean }) {
  if (!signedIn) return null;
  return (
    <OptionalChunk>
      <Host />
    </OptionalChunk>
  );
}
