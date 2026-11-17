import { useEffect } from 'react';
import { useStore } from 'zustand/react';

import type { WatchRealtime } from '@/lib/api/watch-realtime';
import type { GeoBbox } from '@/lib/map/slippy';

import { bindSharedLocationsLive, type SharedLocationsStoreApi } from './shared-locations-live';

/**
 * **L'ENTRETIEN DU MAGASIN DES POSITIONS, PARTAGÉ PAR SES HÔTES** (#16984, revue #18881) — tout écran qui
 * LIT le magasin le tient à jour, sinon il lit ce que la dernière carte ouverte y a laissé :
 * - le direct (`location:share-changed|ended`) via la socket vivante ;
 * - le terme : le serveur n'émet rien à l'échéance, un seul minuteur armé sur la prochaine `expiresAt`
 *   retire ce qui est échu (un partage dure au plus 8 h, bien sous le plafond d'un `setTimeout`).
 *
 * Le rattrapage reste à chaque hôte : la carte demande par emprise, la fiche le monde.
 */
export const SHARED_LOCATIONS_WORLD: GeoBbox = { minLongitude: -180, minLatitude: -90, maxLongitude: 180, maxLatitude: 90 };

const MAX_TIMER_MS = 2 ** 31 - 1;

export function useSharedLocationsUpkeep({ store, watch }: { readonly store: SharedLocationsStoreApi; readonly watch: WatchRealtime }): void {
  useEffect(() => watch((socket) => bindSharedLocationsLive({ socket, store })), [watch, store]);
  const nextTerm = useStore(store, (state) => state.nextExpiry());
  useEffect(() => {
    if (nextTerm === null) return undefined;
    const timer = setTimeout(() => store.getState().expire(), Math.min(MAX_TIMER_MS, Math.max(0, nextTerm - Date.now()) + 5));
    return () => clearTimeout(timer);
  }, [nextTerm, store]);
}
