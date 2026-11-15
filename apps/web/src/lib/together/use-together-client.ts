import { useEffect, useMemo, useRef } from 'react';

import { apiDeps } from '@/lib/api/deps';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import type { WatchRealtime } from '@/lib/api/watch-realtime';
import type { SocketClient } from '@/lib/net/socket';

import { bindTogetherLive, createTogetherClient, type TogetherClient, type TogetherStoreApi } from './together-live';

export const togetherViewerId = (): string | null => resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id ?? null;

/**
 * Les gestes « ensemble » sur la socket vivante. `listen` : seul l'hôte du chrome
 * différé écoute les événements servis ; la fiche d'un Proche n'envoie que son
 * invitation, sur le MÊME store.
 */
export function useTogetherClient({ watch, store, listen }: { readonly watch: WatchRealtime; readonly store: TogetherStoreApi; readonly listen: boolean }): TogetherClient {
  const socketRef = useRef<SocketClient | null>(null);
  const client = useMemo(() => createTogetherClient({ socket: () => socketRef.current, store }), [store]);
  useEffect(
    () =>
      watch((socket) => {
        socketRef.current = socket;
        const unbind = listen ? bindTogetherLive({ socket, store, viewerId: togetherViewerId }) : () => undefined;
        return () => {
          unbind();
          if (socketRef.current === socket) socketRef.current = null;
        };
      }),
    [watch, store, listen],
  );
  return client;
}
