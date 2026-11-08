import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sharedLocationsQueryOptions, type SharedLocationDeps } from '@/lib/api/shared-locations';
import { watchRealtime, type WatchRealtime } from '@/lib/api/watch-realtime';
import { useCirclesCatalog } from '@/lib/use-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { fitView, panView, viewBbox, zoomView, type MapSize, type MapView } from '@/lib/map/slippy';
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
 * - **Par emprise** : seule la zone visible est demandée, la requête suit la carte avec
 *   300 ms de calme (un glisser ne fait pas une requête par pixel).
 * - **Le direct** : `location:share-changed|ended` via la socket vivante, chargée à la
 *   demande (`watchRealtime`).
 * - **Le terme** : le serveur n'émet rien à l'échéance, un seul minuteur armé sur la
 *   prochaine `expiresAt` retire ce qui est échu.
 * - **Les noms et la présence** viennent des caches de l'onglet (liste des
 *   conversations) : rien n'est inventé, une personne inconnue est « Quelqu'un ».
 */

const DEFAULT_SIZE: MapSize = { width: 360, height: 480 };
const REQUEST_CALM_MS = 300;
const MAX_TIMER_MS = 2 ** 31 - 1;

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

function useCalm<T>(value: T, ms: number): T {
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
  const [view, setView] = useState<Pick<MapView, 'center' | 'zoom'>>(initialView ?? { center: { latitude: 20, longitude: 0 }, zoom: 2 });
  const placed = useRef(initialView !== undefined);

  useEffect(() => {
    if (placed.current || locations.length === 0) return;
    placed.current = true;
    setView(fitView(locations, size));
  }, [locations, size.width, size.height]);

  useEffect(() => watch((socket) => bindSharedLocationsLive({ socket, store })), [watch, store]);

  const bbox = useCalm(viewBbox({ ...view, ...size }), REQUEST_CALM_MS);
  const caught = useQuery({ ...sharedLocationsQueryOptions(deps, bbox), staleTime: 15_000 }, appQueryClient);
  useEffect(() => {
    if (caught.data !== undefined) store.getState().merge(caught.data);
  }, [caught.data, store]);

  const nextTerm = useMemo(() => store.getState().nextExpiry(), [store, byUser]);
  useEffect(() => {
    if (nextTerm === null) return undefined;
    const timer = setTimeout(() => store.getState().expire(), Math.min(MAX_TIMER_MS, Math.max(0, nextTerm - Date.now()) + 5));
    return () => clearTimeout(timer);
  }, [nextTerm, store]);

  if (!ready) return <div ref={frame} aria-busy="true" />;
  const personOf = (userId: string): SharedLocationPerson => {
    const known = knownPersonByIdInConversations(appQueryClient, userId);
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
        onZoom={(delta) => setView((current) => zoomView({ ...current, ...size }, delta))}
        onPan={(dx, dy) => setView((current) => panView({ ...current, ...size }, dx, dy))}
      />
    </div>
  );
}
