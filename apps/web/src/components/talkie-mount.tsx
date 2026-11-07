import { lazy } from 'react';

import { currentInterfaceLanguage } from '@/lib/interface-language';

import { OptionalChunk } from './optional-chunk';

/**
 * L'HÔTE DU TALKIE REÇU, ARMÉ DANS LE CHROME DIFFÉRÉ (#16638) — sur toutes les
 * routes d'un compte connecté, en un chunk à lui : la première peinture n'en
 * paie rien, et l'hôte s'accroche lui-même à la socket vivante.
 */
const Host = lazy(() => import('./talkie-host').then((m) => ({ default: m.TalkieHost })));

export function TalkieMount({ signedIn }: { readonly signedIn: boolean }) {
  if (!signedIn) return null;
  return (
    <OptionalChunk>
      <Host language={currentInterfaceLanguage()} />
    </OptionalChunk>
  );
}
