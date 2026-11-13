import { lazy } from 'react';

import { currentInterfaceLanguage } from '@/lib/interface-language';

import { OptionalChunk } from './optional-chunk';

/**
 * L'HÔTE DE « ENSEMBLE », ARMÉ DANS LE CHROME DIFFÉRÉ (#17055) — sur toutes les
 * routes d'un compte connecté, en un chunk à lui : la première peinture n'en paie
 * rien, et l'hôte s'accroche lui-même à la socket vivante.
 */
const Host = lazy(() => import('./together-host').then((m) => ({ default: m.TogetherHost })));

export function TogetherMount({ signedIn }: { readonly signedIn: boolean }) {
  if (!signedIn) return null;
  return (
    <OptionalChunk>
      <Host language={currentInterfaceLanguage()} />
    </OptionalChunk>
  );
}
