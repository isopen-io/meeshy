import { useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand/react';

import type { GloryAtmosphere } from '@meeshy/shared/types/glory-atmospheres';

import { apiOrigin } from '@/lib/api/api-origin';
import { httpTransport } from '@/lib/api/client';
import { newClientMessageId } from '@/lib/api/client-message-id';
import { apiDeps } from '@/lib/api/deps';
import type { GameBlock } from '@meeshy/shared/types/game';
import { packQueryKeys } from '@/lib/api/pack-query-keys';
import type { ApiResult } from '@/lib/api/http';
import { loadFramePackCatalogue, loadInstalledFramePacks, type FramePackSummary } from '@/lib/api/packs-glory-frame';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { bumpGloryCatalogEpoch } from '@/lib/game-photo/glory-catalog-epoch';
import { createOfflineQueue } from '@/lib/offline-queue';
import { safeLocalStorage } from '@/lib/storage';

import {
  ATMOSPHERE_SCREEN_SHOWINGS,
  atmosphereDeferralsOf,
  atmosphereTilesOf,
  chooseAtmosphere,
  flushAtmosphereQueue,
  noteAtmosphereDeferred,
  shouldOfferAtmosphere,
  type AtmosphereDeps,
  type AtmosphereGate,
  type AtmosphereJob,
  type AtmosphereTile,
} from './atmosphere';

/**
 * LA PORTE D'ATMOSPHÈRE DE L'APPLICATION (#10163, L10b) — `useAtmosphereGate` câble la loi (`atmosphere.ts`)
 * sur le vrai transport, le cache de requêtes, le stockage de l'appareil et UNE file d'écritures partagée par
 * tous les écrans qui photographient (le dernier choix gagne), vidée au retour du réseau. Les tuiles ne se
 * chargent que si l'écran peut se montrer (atmosphère absente, reports non épuisés) ou si l'hôte les demande
 * (les réglages) : Progression ne paie pas la boutique pour un compte qui a déjà choisi.
 */
const FRAME_KEYS = packQueryKeys('glory-frame');
const STALE_TIME = 5 * 60_000;

const queue = createOfflineQueue<AtmosphereJob>();

const appDeps = (): AtmosphereDeps => ({
  transport: httpTransport,
  client: appQueryClient,
  queue,
  isOnline: () => navigator.onLine,
  requestId: newClientMessageId,
  onInstalled: bumpGloryCatalogEpoch,
});

const useViewerKey = (): string => {
  const session = useStore(sessionStore, (state) => state.session);
  return resolveViewer({ source: apiDeps.source, session }).id ?? 'anonymous';
};

/** Une liste de packs, ou l'erreur du port : la même loi que la boutique (`frame-pack-shop.tsx`) sur les mêmes clés. */
const listed = async (loading: Promise<ApiResult<readonly FramePackSummary[]>>): Promise<readonly FramePackSummary[]> => {
  const result = await loading;
  if (!result.ok) throw new Error(result.error);
  return result.data;
};

/** Les sept tuiles, la même valeur de rangée que la boutique ; sans résumé (rien lu, ancien serveur), les noms suffisent. */
export function useAtmosphereTiles(enabled: boolean): readonly AtmosphereTile[] {
  const catalogue = useQuery(
    { queryKey: FRAME_KEYS.catalogue, enabled, staleTime: STALE_TIME, retry: false, queryFn: ({ signal }) => listed(loadFramePackCatalogue({ ...apiDeps, signal })) },
    appQueryClient,
  );
  const installed = useQuery(
    { queryKey: FRAME_KEYS.installed, enabled, staleTime: STALE_TIME, retry: false, queryFn: ({ signal }) => listed(loadInstalledFramePacks({ ...apiDeps, signal })) },
    appQueryClient,
  );
  const summaries = catalogue.data;
  const shelf = installed.data;
  return useMemo(() => atmosphereTilesOf({ catalogue: summaries ?? [], installed: shelf ?? [], origin: apiOrigin() }), [summaries, shelf]);
}

export function useAtmosphereGate(game: GameBlock | null | undefined, options: { readonly tiles?: boolean } = {}): AtmosphereGate {
  const userId = useViewerKey();
  const current = game?.photo?.atmosphere ?? null;
  const mayShow = current === null && atmosphereDeferralsOf(safeLocalStorage(), userId) < ATMOSPHERE_SCREEN_SHOWINGS;
  const tiles = useAtmosphereTiles(options.tiles === true || mayShow);

  useEffect(() => {
    const flush = (): void => void flushAtmosphereQueue(appDeps());
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, []);

  const offers = useCallback((stepId: string) => shouldOfferAtmosphere({ stepId, atmosphere: current, deferrals: atmosphereDeferralsOf(safeLocalStorage(), userId) }), [current, userId]);
  const choose = useCallback((atmosphere: GloryAtmosphere) => chooseAtmosphere(atmosphere, appDeps()), []);
  const defer = useCallback(() => noteAtmosphereDeferred(safeLocalStorage(), userId), [userId]);

  return useMemo(() => ({ current, tiles, offers, choose, defer }), [current, tiles, offers, choose, defer]);
}
