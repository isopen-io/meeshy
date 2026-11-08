import { useQueries, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand/react';
import { getUserPresenceStatus } from '@meeshy/shared/utils/user-presence';

import { apiDeps } from '@/lib/api/deps';
import { publicProfileQueryOptions, type PublicProfileView } from '@/lib/api/public-profile';
import { appQueryClient } from '@/lib/api/query-client';
import { sharedLocationsQueryOptions, type SharedLocationDeps } from '@/lib/api/shared-locations';
import { watchRealtime, type WatchRealtime } from '@/lib/api/watch-realtime';
import { useCirclesCatalog } from '@/lib/use-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { bboxQuery, fitView, panView, viewBbox, zoomView, type GeoBbox, type MapSize, type MapView } from '@/lib/map/slippy';
import { useOnline } from '@/lib/net/online';
import { knownPersonByIdInConversations, servedPresenceByIdInConversations } from '@/lib/profile/known-people-cache';
import { bindSharedLocationsLive, sharedLocationsStore, type SharedLocationsStoreApi } from '@/lib/shared-locations/shared-locations-live';
import { initialsOf } from '@/lib/view/conversation';

import { SharedLocationsMapView, type SharedLocationPerson } from './shared-locations-map-view';

/**
 * **LA CARTE DES POSITIONS PARTAGÉES, SON HÔTE** (#16984) — l'état de la vue et le
 * branchement de la vue pure (`shared-locations-map-view.tsx`).
 *
 * - **Cache d'abord** : le magasin (`shared-locations-live.ts`) se peint au premier
 *   rendu ; le rattrapage `GET /relations/locations?bbox=` ne fait que le compléter,
 *   jamais de spinner sur un magasin non vide.
 * - **Par emprise** : le premier rattrapage de chaque ouverture couvre le MONDE (un lien
 *   qui partage loin de la vue initiale est trouvé, et une fin manquée pendant que la
 *   carte était fermée est effacée partout) ; ensuite, seule la zone visible est
 *   demandée, avec 300 ms de calme (un glisser ne fait pas une requête par pixel).
 *   Chaque rattrapage fait foi dans SON emprise (`merge` avec sa portée).
 * - **Les états** : un premier rattrapage en cours ne dit pas « personne », un échec le
 *   dit et propose de réessayer.
 * - **Le direct** : `location:share-changed|ended` via la socket vivante, chargée à la
 *   demande (`watchRealtime`).
 * - **Le terme** : le serveur n'émet rien à l'échéance, un seul minuteur armé sur la
 *   prochaine `expiresAt` retire ce qui est échu.
 * - **Les noms, les visages et la présence** viennent des caches de l'onglet (liste des
 *   conversations), puis de la fiche publique de qui n'y figure pas (au plus quarante,
 *   comme l'onglet « Cercles ») — chacun tel que le serveur l'a servi, présence comprise
 *   (loi d'amitié) : rien n'est inventé, une personne inconnue est « Quelqu'un ».
 */

const PROFILE_FETCH_CAP = 40;

const personOfProfile = (view: PublicProfileView, now: number): SharedLocationPerson => {
  const name = view.profile.displayName ?? view.profile.username;
  const presence =
    view.presence === null
      ? undefined
      : getUserPresenceStatus({ isOnline: view.presence.isOnline, ...(view.presence.lastActiveAt === null ? {} : { lastActiveAt: view.presence.lastActiveAt }) }, now);
  return { name, initials: initialsOf(name), avatar: view.profile.avatar ?? undefined, presence };
};

const DEFAULT_SIZE: MapSize = { width: 360, height: 480 };
const REQUEST_CALM_MS = 300;
const MAX_TIMER_MS = 2 ** 31 - 1;
const WORLD: GeoBbox = { minLongitude: -180, minLatitude: -90, maxLongitude: 180, maxLatitude: 90 };
const DEFAULT_VIEW: Pick<MapView, 'center' | 'zoom'> = { center: { latitude: 20, longitude: 0 }, zoom: 2 };

const bboxOfQuery = (query: string): GeoBbox => {
  const [minLongitude = -180, minLatitude = -90, maxLongitude = 180, maxLatitude = 90] = query.split(',').map(Number);
  return { minLongitude, minLatitude, maxLongitude, maxLatitude };
};

function useMeasuredWidth(ref: { readonly current: HTMLElement | null }): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (node === null || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setWidth(Math.round(node.clientWidth) || null));
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** Une valeur PRIMITIVE : un objet neuf à chaque rendu relancerait le minuteur sans fin. */
function useCalm<T extends string | number>(value: T, ms: number): T {
  const [calm, setCalm] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setCalm(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return calm;
}

const timeFormatter = (language: InterfaceLanguage) => {
  const format = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' });
  return (iso: string): string => format.format(new Date(iso));
};

export function SharedLocationsMap({
  language,
  store = sharedLocationsStore,
  deps = apiDeps,
  watch = watchRealtime,
  initialView,
}: {
  readonly language: InterfaceLanguage;
  readonly store?: SharedLocationsStoreApi;
  readonly deps?: SharedLocationDeps;
  readonly watch?: WatchRealtime;
  readonly initialView?: Pick<MapView, 'center' | 'zoom'>;
}) {
  const ready = useCirclesCatalog(language);
  const online = useOnline();
  const frame = useRef<HTMLDivElement>(null);
  const measured = useMeasuredWidth(frame);
  const size: MapSize = { width: Math.min(measured ?? DEFAULT_SIZE.width, 720), height: DEFAULT_SIZE.height };
  const byUser = useStore(store, (state) => state.byUser);
  const locations = useMemo(() => Object.values(byUser), [byUser]);
  const [view, setView] = useState<Pick<MapView, 'center' | 'zoom'>>(() => initialView ?? (locations.length === 0 ? DEFAULT_VIEW : fitView(locations, size)));
  const placed = useRef(initialView !== undefined || locations.length > 0);
  const [caughtUp, setCaughtUp] = useState(false);

  useEffect(() => {
    if (placed.current || locations.length === 0) return;
    placed.current = true;
    setView(fitView(locations, size));
  }, [locations, size.width, size.height]);

  useEffect(() => watch((socket) => bindSharedLocationsLive({ socket, store })), [watch, store]);

  const calmQuery = useCalm(bboxQuery(viewBbox({ ...view, ...size })), REQUEST_CALM_MS);
  const bbox = caughtUp ? bboxOfQuery(calmQuery) : WORLD;
  const caught = useQuery({ ...sharedLocationsQueryOptions(deps, bbox), staleTime: 15_000, refetchOnMount: 'always' }, appQueryClient);
  useEffect(() => {
    if (caught.data === undefined) return;
    store.getState().merge(caught.data.items, { bbox: caught.data.bbox, requestedAt: caught.data.requestedAt });
    /* Un monde servi par le cache d'une visite précédente ne suffit pas : on attend celui de CETTE ouverture. */
    if (caught.isFetchedAfterMount && bboxQuery(caught.data.bbox) === bboxQuery(WORLD)) setCaughtUp(true);
  }, [caught.data, caught.isFetchedAfterMount, store]);

  const nextTerm = useMemo(() => store.getState().nextExpiry(), [store, byUser]);
  useEffect(() => {
    if (nextTerm === null) return undefined;
    const timer = setTimeout(() => store.getState().expire(), Math.min(MAX_TIMER_MS, Math.max(0, nextTerm - Date.now()) + 5));
    return () => clearTimeout(timer);
  }, [nextTerm, store]);

  const status = caught.isError ? 'failed' : caughtUp || caught.data !== undefined ? 'ready' : 'loading';
  const unnamed = useMemo(
    () => locations.map((location) => location.userId).filter((id) => knownPersonByIdInConversations(appQueryClient, id) === null).slice(0, PROFILE_FETCH_CAP),
    [locations],
  );
  const profiles = useQueries({ queries: unnamed.map((id) => ({ ...publicProfileQueryOptions({ ...deps, handle: id }), enabled: online })) }, appQueryClient);
  const profileOf = (userId: string): PublicProfileView | undefined => profiles[unnamed.indexOf(userId)]?.data;

  if (!ready) return <div ref={frame} aria-busy="true" />;
  const personOf = (userId: string): SharedLocationPerson => {
    const known = knownPersonByIdInConversations(appQueryClient, userId);
    const profile = known === null ? profileOf(userId) : undefined;
    if (profile !== undefined) return personOfProfile(profile, Date.now());
    const name = known?.displayName ?? known?.username ?? null;
    const presence = servedPresenceByIdInConversations(appQueryClient, userId);
    return { name, initials: initialsOf(name ?? '?'), avatar: known?.avatar ?? undefined, presence };
  };
  return (
    <div ref={frame}>
      <SharedLocationsMapView
        language={language}
        locations={locations}
        view={{ ...view, ...size }}
        personOf={personOf}
        formatTime={timeFormatter(language)}
        online={online}
        status={status}
        onRetry={() => void caught.refetch()}
        onZoom={(delta) => setView((current) => zoomView({ ...current, ...size }, delta))}
        onPan={(dx, dy) => setView((current) => panView({ ...current, ...size }, dx, dy))}
      />
    </div>
  );
}
