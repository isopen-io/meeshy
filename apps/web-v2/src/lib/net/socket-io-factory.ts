import { io } from 'socket.io-client';

import type { SocketClient, SocketFactory } from './socket';

/**
 * LA FABRIQUE RÉELLE (#5793) — le SEUL fichier du dépôt qui importe
 * `socket.io-client`. Statique, mais atteint UNIQUEMENT par `api/realtime.ts`
 * (chargé en `import()` après la première peinture, `main.tsx`) : c'est ce
 * qui tient les ~13 Ko gzip de la bibliothèque hors du socle (§ 7 de la
 * spécification #5793 ; `vite.config.ts` § `manualChunks` la nomme `socketio`
 * pour que le gate de poids désigne un coupable si elle grossit).
 *
 * Miroir `MessageSocketManager.swift` (§ 1.1 de la spécification) :
 *  - poignée de main par `auth`, jamais un en-tête (`net/socket.ts`) ;
 *  - reconnexion INFINIE, 1 s → 16 s, gigue ±20 % (le comportement PAR DÉFAUT
 *    de `socket.io-client` applique la gigue AVANT le plafond, exactement ce
 *    que le doc-comment iOS exige) ;
 *  - AUCUNE option `transports` : l'ordre par défaut (polling puis upgrade
 *    WebSocket) reproduit déjà la forme iOS (poll → upgrade, jamais
 *    `forceWebsockets`) ;
 *  - `autoConnect: false` — c'est `createRealtimeConnection` (`api/socket.ts`)
 *    qui décide QUAND se connecter, jamais cette fabrique à sa construction.
 *
 * `base === ''` (DEV, proxy Vite) passe `undefined` à `io()` : même origine
 * que le document, comme `api/client.ts` le fait déjà pour `fetch`.
 */
export const createSocketIOClient: SocketFactory = ({ base, auth }) => {
  const socket = io(base === '' ? undefined : base, {
    path: '/socket.io/',
    auth: { token: auth.token, sessionToken: auth.sessionToken },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 16000,
    randomizationFactor: 0.2,
    reconnectionAttempts: Number.POSITIVE_INFINITY,
    autoConnect: false,
  });

  const client: SocketClient = {
    get connected() {
      return socket.connected;
    },
    connect: () => socket.connect(),
    disconnect: () => socket.disconnect(),
    on: (event, handler) => {
      socket.on(event, handler as (...args: readonly unknown[]) => void);
    },
    off: (event, handler) => {
      socket.off(event, handler as (...args: readonly unknown[]) => void);
    },
    emit: (event, payload) => {
      socket.emit(event, payload);
    },
  };
  return client;
};
