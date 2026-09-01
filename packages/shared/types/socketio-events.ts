/**
 * Types unifiés pour les événements Socket.IO Meeshy
 * Remplace les anciens types WebSocket pour correspondre à la nouvelle architecture Socket.IO
 *
 * ## La convention de nommage — source de vérité (CLAUDE.md)
 *
 * **Format** : `entity:action-word` — deux-points et tirets, **JAMAIS
 * d'underscore**. Les rooms suivent la même règle sous la forme
 * `entity:${id}`. Exemples : `message:new`, `message:send-with-attachments`,
 * `reaction:added`, `typing:start`.
 *
 * Quatre noms de POIGNÉE DE MAIN dérogent, parce qu'ils appartiennent au
 * transport et non au produit : `authenticate`, `authenticated`, `error`,
 * `heartbeat`. Une seule dérogation PRODUIT est assumée — `read-status:updated`
 * hyphène l'entité — et elle est gardée par son propre témoin.
 *
 * Trois témoins font respecter tout cela, et **aucun ne lit le texte d'un
 * fichier** : ils importent les cartes et vérifient leurs VALEURS à
 * l'exécution. La découpe ci-dessous ne peut donc pas les rétrécir.
 *
 * - `__tests__/types/socketio-events.test.ts` — la forme de CHAQUE nom déclaré
 *   dans `SERVER_EVENTS` ∪ `CLIENT_EVENTS`, et l'absence d'underscore ;
 * - `__tests__/ci/socket-event-name-gate.test.ts` — tout nom épelé en clair par
 *   iOS ou Android appartient au contrat ;
 * - `__tests__/ci/socket-event-emitter-gate.test.ts` — tout nom déclaré du
 *   contrat a un émetteur, ou est déclaré réservé.
 *
 * ## Façade de ré-export (#4645)
 *
 * Les charges vivent dans `./socketio-events/`, un fichier par domaine. Ce
 * module garde son adresse et ré-exporte l'intégralité de leur surface : les
 * 244 importeurs de `@meeshy/shared/types/socketio-events` (et de
 * `./socketio-events.js`) sont inchangés.
 *
 * Le graphe mesuré est un **DAG à moyeu unique** : `./socketio-events/
 * event-maps.js` — les deux cartes `ServerToClientEvents` et
 * `ClientToServerEvents` — référence les vingt et un autres domaines, et rien
 * n'en revient. C'est ce qui l'empêche d'être découpé par domaine : il EST le
 * point de rencontre. La seule autre arête inter-domaines est
 * `socket → user` (`AuthenticatedSocket` porte un `SocketIOUser`).
 *
 * @module @meeshy/shared/types/socketio-events
 */

export * from './socketio-events/event-names.js';
export * from './socketio-events/rate-limits.js';
export * from './socketio-events/auth.js';
export * from './socketio-events/user.js';
export * from './socketio-events/presence.js';
export * from './socketio-events/message.js';
export * from './socketio-events/conversation.js';
export * from './socketio-events/participant.js';
export * from './socketio-events/notification.js';
export * from './socketio-events/friend-request.js';
export * from './socketio-events/attachment.js';
export * from './socketio-events/reaction.js';
export * from './socketio-events/social.js';
export * from './socketio-events/audio.js';
export * from './socketio-events/translation.js';
export * from './socketio-events/location.js';
export * from './socketio-events/preferences.js';
export * from './socketio-events/category.js';
export * from './socketio-events/link.js';
export * from './socketio-events/agent.js';
export * from './socketio-events/socket.js';
export * from './socketio-events/event-maps.js';
