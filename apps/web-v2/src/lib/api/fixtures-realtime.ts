import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';

import { CONVERSATION_ID, VIEWER_ID } from './fixtures-base';

/**
 * LE BOUCHON DE FIXTURES (#5793, § 3.5 de la spécification) — le SEUL
 * `SocketFactory` qu'une source `fixtures` instancie (`api/realtime.ts`).
 * Élagué sous `VITE_DATA_SOURCE=gateway` (`vite.config.ts` § `FIXTURE_MODULE`
 * : ce fichier commence par `fixtures`, donc `__FIXTURES__` fait disparaître
 * toute référence à `createFixturesSocketClient` d'un build `gateway`).
 *
 * Rejoue, aux MÊMES noms et aux MÊMES formes que la passerelle réelle :
 *  - `authenticated`, SYNCHRONE à `connect()` (copié de
 *    `AuthHandler.ts:364-368`) ;
 *  - un keepalive de frappe (`typing:start` toutes les 3 s, miroir
 *    `StatusHandler.ts:334-340` / constante iOS `typingReemitInterval`)
 *    depuis Amina Diallo sur la conversation « Équipe déploiement » — la
 *    même donnée que `use-reader-*.js` sert déjà partout ailleurs, jamais un
 *    nom inventé.
 *
 * `emit` est un NO-OP : les fixtures n'ont aucun correspondant réel à qui
 * parler — un `typing:start` émis ici n'aurait aucun consommateur, jamais
 * une boucle vers soi-même.
 */
const TYPING_KEEPALIVE_MS = 3000;

export const createFixturesSocketClient: SocketFactory = () => {
  const handlers = new Map<string, Set<SocketHandler>>();
  let connected = false;
  let keepalive: ReturnType<typeof setInterval> | undefined;

  const fire = (event: string, payload: unknown): void => {
    for (const handler of handlers.get(event) ?? []) handler(payload);
  };

  const client: SocketClient = {
    get connected() {
      return connected;
    },
    connect: () => {
      if (connected) return;
      connected = true;
      fire(SERVER_EVENTS.AUTHENTICATED, {
        success: true,
        user: { id: VIEWER_ID, language: 'fr', isAnonymous: false },
        version: 'fixtures',
      });
      keepalive = setInterval(() => {
        fire(SERVER_EVENTS.TYPING_START, {
          userId: 'u-amina',
          username: 'amina.diallo',
          displayName: 'Amina Diallo',
          conversationId: CONVERSATION_ID,
          isTyping: true,
        });
      }, TYPING_KEEPALIVE_MS);
    },
    disconnect: () => {
      connected = false;
      if (keepalive !== undefined) clearInterval(keepalive);
      keepalive = undefined;
    },
    on: (event, handler) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler as SocketHandler);
      handlers.set(event, set);
    },
    off: (event, handler) => {
      handlers.get(event)?.delete(handler as SocketHandler);
    },
    emit: () => {
      /* Voir le doc-comment du fichier — aucun correspondant réel. */
    },
  };
  return client;
};
