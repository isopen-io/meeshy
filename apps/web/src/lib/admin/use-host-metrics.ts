import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { HostMetricsSnapshot } from '@meeshy/shared/types/admin-ops';
import { ADMIN_METRICS_CLIENT_EVENTS, ADMIN_METRICS_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/admin-metrics-event-names';
import { SESSION_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/session-event-names';

import type { AdminDeps } from '@/lib/api/admin';
import { ADMIN_OPS_METRICS_KEY, decodeHostSample, decodeHostSnapshot, loadHostMetrics } from '@/lib/api/admin-ops';
import { unwrap } from '@/lib/api/client';
import type { SocketClient } from '@/lib/net/socket';

import { mergeSnapshot } from './host-metrics';

/**
 * **L'HÔTE EN DIRECT** (#10396) — l'instantané (cache d'abord : un écran rouvert montre la
 * dernière heure sans attendre), puis la socket : `admin-metrics:subscribe` rend
 * l'instantané dans son accusé et chaque échantillon arrive sur `admin-metrics:sample`.
 * Sans socket (ou sans accusé), le REPLI relit `?since=<dernier point>` toutes les 5 s.
 * Quitter l'écran se désabonne et arrête la relecture.
 *
 * **ET L'ABONNEMENT SE REFAIT À CHAQUE RÉ-AUTHENTIFICATION** (#20304). C'est le
 * seul des six consommateurs de `watchLiveSocket` qui ne se contente pas
 * d'ÉCOUTER : son `subscribe` fait joindre une room côté passerelle
 * (`AdminMetricsHandler.handleSubscribe`, unique `socket.join(ROOMS.adminHostMetrics())`
 * du dépôt), et une room est tenue PAR SOCKET. Une reconnexion socket.io — celle
 * que `bindAppStatePresence` provoque elle-même après 10 s d'onglet masqué — donne
 * une socket neuve côté serveur, que rien ne remet dans cette room : `AuthHandler`
 * reconstruit `user:`, `feed:`, les conversations et la room d'appareil E2EE, pas
 * celle-ci. Et `createLiveSocketWatchers` ne rejoue ses observateurs que si l'OBJET
 * de connexion change, ce qu'une reconnexion ne fait pas.
 *
 * Le réabonnement vient donc de l'observateur lui-même, sur `authenticated` — le
 * motif de `publication-rooms.ts`, `conversation-viewing.ts` et
 * `call-socket-bridge.ts`. `live` retombe sur `'disconnect'` : sans cela l'écran
 * AFFIRMERAIT le direct au-dessus de courbes gelées, et le repli par sondage, qui
 * est gardé sur `live`, resterait désarmé pour toujours.
 */
export type LiveSource = (watcher: (socket: SocketClient) => () => void) => Promise<() => void>;

const POLL_MS = 5000;

/** La socket vivante de l'application, chargée à la demande : le chunk d'administration ne l'embarque pas. */
export const appLiveSource: LiveSource = async (watcher) => {
  const { watchLiveSocket } = await import('@/lib/api/realtime');
  return watchLiveSocket(watcher);
};

export function useHostMetrics(params: { readonly deps: AdminDeps; readonly enabled: boolean; readonly liveSource?: LiveSource | null; readonly pollMs?: number }) {
  const { deps, enabled, liveSource = appLiveSource, pollMs = POLL_MS } = params;
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);
  const query = useQuery({
    queryKey: ADMIN_OPS_METRICS_KEY,
    queryFn: async ({ signal }) => unwrap(await loadHostMetrics({ ...deps, signal })),
    enabled,
    staleTime: pollMs,
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    if (!enabled || liveSource === null) return;
    let stopped = false;
    let stop: (() => void) | null = null;
    const merge = (incoming: Partial<HostMetricsSnapshot> & { readonly samples: HostMetricsSnapshot['samples'] }) =>
      queryClient.setQueryData<HostMetricsSnapshot>(ADMIN_OPS_METRICS_KEY, (before) => (before === undefined ? (decodeHostSnapshot(incoming) ?? before) : mergeSnapshot(before, incoming)));
    void liveSource((socket) => {
      const onSample = (raw: unknown) => {
        const sample = decodeHostSample(raw);
        if (sample !== null) merge({ samples: [sample] });
      };
      /* L'optionalité porte sur TOUTE la chaîne : une socket sans accusé
         (bouchon de fixtures, faux socket de témoin) ne déclenche ni `then` ni
         `catch`, et `live` reste faux — donc le sondage tient l'écran. */
      const subscribe = (): void => {
        socket
          .emitWithAck?.(ADMIN_METRICS_CLIENT_EVENTS.ADMIN_METRICS_SUBSCRIBE, {}, 5000)
          .then((ack) => {
            const answer = ack as { readonly ok?: unknown; readonly snapshot?: unknown } | null;
            const snapshot = answer?.ok === true ? decodeHostSnapshot(answer.snapshot) : null;
            if (snapshot === null || stopped) return;
            merge(snapshot);
            setLive(true);
          })
          .catch(() => setLive(false));
      };
      const onAuthenticated = (): void => {
        if (!stopped) subscribe();
      };
      /* La coupure RETIRE l'écran du direct : la room est perdue côté
         passerelle, donc plus aucun échantillon n'arrivera avant le
         réabonnement — et c'est `live` qui garde le repli par sondage. */
      const onDisconnect = (): void => setLive(false);
      socket.on(ADMIN_METRICS_SERVER_EVENTS.ADMIN_METRICS_SAMPLE, onSample);
      socket.on(SESSION_SERVER_EVENTS.AUTHENTICATED, onAuthenticated);
      socket.on('disconnect', onDisconnect);
      subscribe();
      return () => {
        socket.off(ADMIN_METRICS_SERVER_EVENTS.ADMIN_METRICS_SAMPLE, onSample);
        socket.off(SESSION_SERVER_EVENTS.AUTHENTICATED, onAuthenticated);
        socket.off('disconnect', onDisconnect);
        socket.emit(ADMIN_METRICS_CLIENT_EVENTS.ADMIN_METRICS_UNSUBSCRIBE, {});
        setLive(false);
      };
    })
      .then((detach) => {
        if (stopped) detach();
        else stop = detach;
      })
      .catch(() => setLive(false));
    return () => {
      stopped = true;
      stop?.();
    };
  }, [enabled, liveSource, queryClient]);

  useEffect(() => {
    if (!enabled || live) return;
    const timer = setInterval(() => {
      const current = queryClient.getQueryData<HostMetricsSnapshot>(ADMIN_OPS_METRICS_KEY);
      const since = current?.samples.at(-1)?.at;
      void loadHostMetrics({ ...deps, ...(since === undefined ? {} : { since }) }).then((result) => {
        if (!result.ok) return;
        queryClient.setQueryData<HostMetricsSnapshot>(ADMIN_OPS_METRICS_KEY, (before) => (before === undefined ? result.data : mergeSnapshot(before, result.data)));
      });
    }, pollMs);
    return () => clearInterval(timer);
  }, [enabled, live, deps, pollMs, queryClient]);

  return { query, live };
}
