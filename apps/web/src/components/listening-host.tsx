import { useEffect } from 'react';
import { useStore } from 'zustand/react';

import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import { loadNowPlayingSnapshot } from '@/lib/api/now-playing';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { watchRealtime, type WatchRealtime } from '@/lib/api/watch-realtime';
import { bindListeningLive, listeningStore, type ListeningStoreApi } from '@/lib/now-playing/listening-live';
import type { NowPlayingChangedEventData } from '@meeshy/shared/types/now-playing';

/**
 * **L'ÉCOUTE DE MES PROCHES ET DE MES SANGS, REÇUE SUR CET ONGLET** (#16729) —
 * l'hôte s'accroche à la socket vivante (et à chacune des suivantes), rattrape à
 * chaque accroche, et retire une écoute à son échéance. Il ne peint rien : les
 * avatars lisent le store (`useListeningBand`).
 */

const viewerIdOf = (): string | null => resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id ?? null;

const snapshotOf = (): Promise<ApiResult<readonly NowPlayingChangedEventData[]>> => loadNowPlayingSnapshot(apiDeps);

export function ListeningHost({
  store = listeningStore,
  watch = watchRealtime,
  snapshot = snapshotOf,
}: {
  readonly store?: ListeningStoreApi;
  readonly watch?: WatchRealtime;
  readonly snapshot?: () => Promise<ApiResult<readonly NowPlayingChangedEventData[]>>;
}) {
  const people = useStore(store, (state) => state.byUser);

  useEffect(() => watch((socket) => bindListeningLive({ socket, store, viewerId: viewerIdOf, snapshot })), [watch, store, snapshot]);

  useEffect(() => {
    const wait = store.getState().msUntilExpiry();
    if (wait === null) return undefined;
    const timer = setTimeout(() => store.getState().expire(), wait);
    return () => clearTimeout(timer);
  }, [store, people]);

  return null;
}
