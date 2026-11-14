import { lazy } from 'react';

import { OptionalChunk } from './optional-chunk';

/** L'émetteur de ma position, armé dans le chrome différé (#18345) : un chunk à lui, rien à la première peinture. */
const Host = lazy(() => import('./shared-location-sharing-host').then((m) => ({ default: m.SharedLocationSharingHost })));

export function SharedLocationSharingMount({ signedIn }: { readonly signedIn: boolean }) {
  if (!signedIn) return null;
  return (
    <OptionalChunk>
      <Host />
    </OptionalChunk>
  );
}
