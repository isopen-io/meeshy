import { conversationStore } from '@/lib/conversation-store';
import { createSocketIOClient } from '@/lib/net/socket-io-factory';
import type { SocketFactory } from '@/lib/net/socket';
import { outboxStore } from '@/lib/send/outbox-store';

import { apiConfig } from './config';
import { apiDeps } from './deps';
import { createFixturesSocketClient } from './fixtures-realtime';
import { appQueryClient } from './query-client';
import { setTypingEmitter } from './typing-emit';
import { sessionStore } from './session';
import { createRealtimeConnection, type RealtimeConnection } from './socket';
import { typingStore } from './typing-store';
import { resolveViewer } from './viewer';

/**
 * L'AMORÇAGE DU TEMPS RÉEL (#5793) — chargé EN `import()` (`main.tsx`), APRÈS
 * la première peinture, jamais dans le socle : c'est ce qui tient
 * `socket.io-client` (~13 Ko gzip, mesuré § 7 de la spécification) HORS de
 * `first_paint`. `vite.config.ts` § `manualChunks` nomme ses dépendances
 * vendor `socketio` pour que le gate de poids désigne un coupable si elles
 * grossissent.
 *
 * UNE connexion par IDENTITÉ (motif `query-client.ts` § « purge sur
 * changement d'identité ») : `authenticated` OUVRE la connexion, `anonymous`
 * la FERME — jamais un socket par écran. `connectedToken` est la clé
 * d'identité : un `establish()` qui pose un jeton DIFFÉRENT (changement de
 * compte sur le même navigateur, D-6) reconstruit la connexion plutôt que de
 * la réutiliser à tort.
 */
const socketFactory: SocketFactory =
  __FIXTURES__ && apiConfig.source === 'fixtures' ? createFixturesSocketClient : createSocketIOClient;

let connection: RealtimeConnection | null = null;
let connectedToken: string | null = null;

function currentViewerId(): string {
  return resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id ?? '';
}

function syncConnection(): void {
  /**
   * FIXTURES ⇒ TOUJOURS CONNECTÉ, même doctrine que la garde de route
   * (`session-guard.ts` : « FIXTURES ⇒ TOUJOURS `allow` — le POC et ses
   * captures n'ont pas de session réelle à faire respecter »). Sous
   * fixtures, `sessionStore` reste `anonymous` — AUCUN écran de connexion
   * n'exige `establish()` — donc guetter `authenticated` n'ouvrirait JAMAIS
   * de connexion et le bouchon de fixtures ne s'exécuterait pour personne.
   * Le jeton est un LITTÉRAL sans conséquence : `createFixturesSocketClient`
   * (`fixtures-realtime.ts`) ne le lit jamais.
   */
  if (__FIXTURES__ && apiConfig.source === 'fixtures') {
    if (connection !== null) return;
    connection = createRealtimeConnection(
      { token: 'fixtures', sessionToken: 'fixtures' },
      {
        base: apiConfig.base,
        socketFactory,
        queryClient: appQueryClient,
        typing: typingStore,
        conversationStore,
        outbox: outboxStore,
        viewerId: currentViewerId,
        onClearSession: () => undefined,
      },
    );
    return;
  }

  const session = sessionStore.getState().session;
  if (session.status !== 'authenticated') {
    connection?.destroy();
    connection = null;
    connectedToken = null;
    return;
  }
  if (connection !== null && connectedToken === session.token) return;
  connection?.destroy();
  connectedToken = session.token;
  connection = createRealtimeConnection(
    { token: session.token, sessionToken: session.sessionToken },
    {
      base: apiConfig.base,
      socketFactory,
      queryClient: appQueryClient,
      typing: typingStore,
      conversationStore,
      outbox: outboxStore,
      viewerId: currentViewerId,
      onClearSession: () => sessionStore.getState().clearSession(),
    },
  );
}

sessionStore.subscribe(syncConnection);
// La session peut déjà être authentifiée au moment où ce module se charge
// (restauration `localStorage`, `main.tsx` § « LA SESSION EST TENUE » —
// exécutée AVANT ce `import()` : sans cet appel explicite, une session
// restaurée n'ouvrirait jamais de connexion, faute d'un CHANGEMENT d'état à
// observer). Sous fixtures, c'est aussi cet appel qui ouvre la connexion
// (aucun événement `sessionStore` ne survient jamais).
syncConnection();

/**
 * L'ÉMISSION S'ENREGISTRE, ELLE NE S'IMPORTE PAS (revue-correction #5793) —
 * `view/use-typing-emitter.ts` appelle `emitTyping` depuis `typing-emit.ts`,
 * un module SANS dépendance. L'importer DEPUIS ce fichier-ci faisait de
 * `socket.io-client` une dépendance STATIQUE du chunk du fil (mesuré sur
 * `dist/assets/thread-*.js`), ce que le libellé `on_demand_chunks` de
 * `budgets.json` niait — et ce que les 40+ surfaces à venir auraient copié.
 * Le sens de la dépendance est donc inversé ICI : le possesseur s'annonce.
 *
 * La connexion est relue À CHAQUE APPEL (jamais capturée) : `syncConnection`
 * la remplace sur tout changement d'identité, et un émetteur figé parlerait
 * alors dans un socket détruit.
 */
setTypingEmitter((conversationId, isTyping) => connection?.emitTyping(conversationId, isTyping));
