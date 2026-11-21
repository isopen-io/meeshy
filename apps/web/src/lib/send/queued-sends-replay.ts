import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { SocketClient } from '../net/socket';

/**
 * LE REJEU DES ENVOIS EN FILE À LA (RÉ)AUTHENTIFICATION DU TEMPS RÉEL (#20224).
 *
 * Les deux files d'envoi du web ne se vidaient que sur trois déclencheurs :
 * le lancement, l'événement `online` du navigateur, et un changement de compte.
 * `online` suit `navigator.onLine`, donc le réseau de l'APPAREIL — et quand
 * c'est la PASSERELLE qui redémarre (déploiement, rotation d'image,
 * ré-routage), le réseau de l'appareil ne bouge pas : `navigator.onLine` reste
 * `true` du début à la fin, et aucun `online` ne se lève JAMAIS.
 *
 * Un message composé pendant cette fenêtre échoue en `status: 0` (le `fetch`
 * est rejeté), entre dans la classe de rejeu automatique, et personne ne la
 * rejoue : la socket se rouvre, le fil redevient vivant et reçoit les messages
 * des autres normalement, pendant que la bulle garde « Réessayer » jusqu'à ce
 * que l'utilisateur la touche.
 *
 * La jumelle iOS porte exactement ce déclencheur, avec sa raison écrite
 * (`ConversationSocketHandler.triggerSyncIfNeeded` → `OutboxFlushTrigger.flushNow`) :
 * « OutboxRetryScheduler covers the network-reconnect path (NWPathMonitor) but
 * a socket reconnect without a NW path change (e.g. server restart) would
 * leave queued outbox records stranded until the next foreground. »
 *
 * `AUTHENTICATED` est le MÊME signal que `replayAppRowGestures` emploie déjà
 * pour la file des gestes de rangée (`api/app-row-gestures.ts` : « rejeu au
 * retour du réseau, à chaque (ré)authentification du temps réel ») — pas un
 * nouveau cycle de vie, le cycle de vie que le dépôt a déjà choisi.
 *
 * Les instances sont chargées en `import()` PARESSEUX : le module d'envoi
 * (`perform-send`, les pièces jointes, IndexedDB) n'entre pas dans le graphe
 * STATIQUE du chunk `realtime`, que `budgets.json › on_demand_chunks.realtime`
 * plafonne. Chaque promesse détachée porte son `.catch` — un `void p` sans lui
 * termine le process sous Node 22, et la règle du dépôt ne fait pas d'exception
 * pour un canal best-effort.
 *
 * Un rejeu de trop ne coûte rien : `flush` est idempotent (`replaying ??=`),
 * FIFO, s'arrête à la première coupure, et relit `online` à chaque entrée.
 */
const flushBothQueues = (): void => {
  void import('./outbox-durability-instance')
    .then(({ outboxDurability }) => outboxDurability.flush())
    .catch(() => undefined);
  void import('./send-queue-instance')
    .then(({ sendQueue }) => sendQueue.flush())
    .catch(() => undefined);
};

export function bindQueuedSendsReplay(params: {
  readonly socket: SocketClient;
  /** TÉMOIN seulement — la production prend les deux files de l'application. */
  readonly flush?: () => void;
}): () => void {
  const { socket, flush = flushBothQueues } = params;
  const onAuthenticated = (): void => flush();
  socket.on<unknown>(SERVER_EVENTS.AUTHENTICATED, onAuthenticated);
  return () => socket.off<unknown>(SERVER_EVENTS.AUTHENTICATED, onAuthenticated);
}
