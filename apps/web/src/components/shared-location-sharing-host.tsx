import { useEffect } from 'react';

import { sessionStore } from '@/lib/api/session';
import { sharedLocationSharingCenter } from '@/lib/shared-locations/shared-location-sharing-live';

/**
 * MON PARTAGE DE POSITION REPREND AU CHARGEMENT (#18345) — sans attendre qu'une fiche
 * s'ouvre : une liste gardée d'un chargement précédent se remet à suivre la position,
 * ses échéances se soldent, et un changement de compte abandonne le centre du compte
 * quitté. Ne rend rien.
 */
export function SharedLocationSharingHost() {
  useEffect(() => {
    const sync = (): void => void sharedLocationSharingCenter();
    sync();
    return sessionStore.subscribe(sync);
  }, []);
  return null;
}
