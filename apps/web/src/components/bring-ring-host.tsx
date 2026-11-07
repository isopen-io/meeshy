import { useEffect, useRef } from 'react';
import { useStore } from 'zustand/react';

import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import type { LiveSocketWatcher } from '@/lib/api/live-socket-watchers';
import { stopBring, type BringDeps } from '@/lib/bring/bring-api';
import { bindBringLive, bringStore, type BringStoreApi, type LiveBring } from '@/lib/bring/bring-live';
import { startTone, stopTone, type ToneKind } from '@/lib/calls/call-tones';
import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { knownPersonByIdInConversations } from '@/lib/profile/known-people-cache';
import { useCirclesCatalog } from '@/lib/use-circles-catalog';

/**
 * **L'ÉCRAN DE SONNERIE DU BRING, ONGLET OUVERT** (#13936, sous-lot
 * `proche-bring@web`) — iso du contrat iOS : le Bring force un son pour une
 * urgence extrême, jusqu'à ce qu'on l'arrête d'un geste ou jusqu'à `expiresAt`.
 *
 * - Le son est celui de l'appel (`call-tones.ts`, réutilisé, pas dupliqué), doublé
 *   de la vibration et du titre d'onglet — un navigateur qui refuse l'audio avant
 *   tout geste sonne quand même par ces deux voies.
 * - « Arrêter » coupe AU GESTE (optimiste), puis `DELETE /bring/:id` arrête les
 *   autres appareils. Un échec réseau ne refait pas sonner : l'expiration
 *   arrêtera les autres.
 * - L'expéditeur est nommé par les caches de l'onglet (la liste des
 *   conversations) ; inconnu, il est « Quelqu'un », jamais inventé.
 * - Aucun push web (contrat) : seul l'onglet ouvert sonne.
 */

export type BringTones = {
  readonly start: (kind: ToneKind, options?: { readonly titleLabel?: string }) => void;
  readonly stop: () => void;
};

const CALL_TONES: BringTones = { start: startTone, stop: stopTone };

type Watch = (watcher: LiveSocketWatcher) => () => void;

/** La socket vivante, chargée à la demande : le chunk `realtime` est à son plafond de poids. */
const watchRealtime: Watch = (watcher) => {
  let live = true;
  let stop: (() => void) | null = null;
  void import('@/lib/api/realtime').then(
    ({ watchLiveSocket }) => {
      if (live) stop = watchLiveSocket(watcher);
    },
    () => undefined,
  );
  return () => {
    live = false;
    stop?.();
  };
};

const viewerIdOf = (): string | null => resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id ?? null;

export function BringRingView({
  language,
  ring,
  name,
  onStop,
}: {
  readonly language: InterfaceLanguage;
  readonly ring: LiveBring;
  readonly name: string;
  readonly onStop: () => void;
}) {
  const stopRef = useRef<HTMLButtonElement>(null);
  useEffect(() => stopRef.current?.focus(), [ring.bringId]);
  const title = translateCircles(language, 'bring.incoming.title', { name });
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={`bring-title-${ring.bringId}`}
      aria-describedby={`bring-body-${ring.bringId}`}
      data-bring-ring={ring.bringId}
      className="fixed inset-0 z-[90] grid place-items-center px-4"
      style={{ backgroundColor: 'var(--color-error)' }}
    >
      <div className="grid w-full max-w-sm justify-items-center gap-4 text-center" style={{ color: 'var(--color-on-state)' }}>
        <span aria-hidden="true" className="text-[64px] leading-none motion-safe:animate-pulse">
          🔔
        </span>
        <h2 id={`bring-title-${ring.bringId}`} className="text-title font-bold">
          {title}
        </h2>
        <p id={`bring-body-${ring.bringId}`} className="text-body">
          {translateCircles(language, 'bring.incoming.body')}
        </p>
        <button
          ref={stopRef}
          type="button"
          data-bring-stop={ring.bringId}
          onClick={onStop}
          className="grid w-full place-items-center rounded-card px-6 text-title font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ minHeight: 64, backgroundColor: 'var(--color-on-state)', color: 'var(--color-error)', outlineColor: 'var(--color-on-state)' }}
        >
          {translateCircles(language, 'bring.incoming.stop')}
        </button>
      </div>
    </div>
  );
}

export function BringRingHost({
  language,
  store = bringStore,
  deps = apiDeps,
  tones = CALL_TONES,
  watch = watchRealtime,
}: {
  readonly language: InterfaceLanguage;
  readonly store?: BringStoreApi;
  readonly deps?: BringDeps;
  readonly tones?: BringTones;
  readonly watch?: Watch;
}) {
  const ready = useCirclesCatalog(language);
  const ring = useStore(store, (state) => state.incoming[0] ?? null);

  useEffect(() => watch((socket) => bindBringLive({ socket, store, viewerId: viewerIdOf })), [watch, store]);

  const bringId = ring?.bringId ?? null;
  const expiresAt = ring?.expiresAt ?? null;
  useEffect(() => {
    if (bringId === null || expiresAt === null || !ready) return undefined;
    tones.start('ring', { titleLabel: translateCircles(language, 'bring.tab') });
    const timer = setTimeout(() => store.getState().expire(), Math.max(0, Date.parse(expiresAt) - Date.now()));
    return () => {
      clearTimeout(timer);
      tones.stop();
    };
  }, [bringId, expiresAt, ready, language, store, tones]);

  if (ring === null || !ready) return null;
  const known = knownPersonByIdInConversations(appQueryClient, ring.fromUserId);
  const name = known?.displayName ?? known?.username ?? translateCircles(language, 'bring.incoming.someone');
  const stop = (): void => {
    store.getState().stop(ring.bringId);
    void stopBring(deps, ring.bringId);
  };
  return <BringRingView language={language} ring={ring} name={name} onStop={stop} />;
}
