import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type {
  ReactionUpdateEventData,
  ServerToClientEvents,
  SocketIOMessage,
} from '@meeshy/shared/types/socketio-events';

/**
 * La porte d'ÉMISSION, dérivée du contrat au lieu d'être redéclarée.
 *
 * Le cycle 103 a gouverné la CHARGE de `broadcastMessageMutation` — son
 * `payload` est passé d'un `Record<string, unknown>` à un type discriminé par
 * l'événement. Il a laissé ouvert ce que le journal nommait « la porte non typée
 * de toute diffusion » : la charge avait beau être juste, elle traversait un
 *
 * ```ts
 * to(room: string): { emit(event: string, payload: unknown): unknown }
 * ```
 *
 * qui accepte n'importe quel couple. **Gouverner la valeur sans gouverner le
 * canal ne garde que le site où la valeur est construite** — le canal reste
 * libre de la porter sous un autre nom d'événement, et libre de porter n'importe
 * quoi d'autre sous le bon.
 *
 * Cette surface était écrite HUIT fois à la main dans la passerelle
 * (`emitConversationPreviewUpdate`, `broadcastMessageMutation` par dérivation,
 * `broadcastReactionMutation`, `broadcastLinkMessage`, `emitMentionCreated`,
 * `emitUnreadCountsToRecipients`, `emitToConversationParticipants`,
 * `utils/socket-broadcast`), à chaque fois dans les mêmes termes et à chaque
 * fois sans lien avec `ServerToClientEvents`. Huit copies d'une déclaration qui
 * ne dit rien : c'est la forme exacte que prend une règle qu'aucun outil
 * n'applique.
 *
 * Elle reste STRUCTURALE — c'est ce qui lui permet d'accepter aussi bien le
 * `Server` de production que le `getIO()` nullable du manager ou un double de
 * test, sans qu'aucune route REST n'ait à importer la classe du manager. Ce qui
 * change n'est pas sa forme, c'est que le couple `(événement, charge)` est
 * désormais celui du contrat partagé.
 */
export type ServerEventName = keyof ServerToClientEvents;

/** La charge que le contrat associe à CET événement. */
export type ServerEventPayload<E extends ServerEventName> = Parameters<ServerToClientEvents[E]>[0];

/**
 * Les 120 couples `(événement, charge)` que le contrat autorise, en UNION de
 * tuples plutôt qu'en méthode générique.
 *
 * La forme générique — `emit<E extends ServerEventName>(event: E, payload:
 * ServerEventPayload<E>)` — est celle qu'on écrit spontanément, et le `Server`
 * de PRODUCTION ne la satisfait pas : socket.io décore sa propre carte
 * d'événements (`DecorateAcknowledgementsWithMultipleResponses`) avant d'en
 * dériver ses paramètres, et deux signatures génériques ne s'unifient pas à
 * travers ce mappage. L'union de tuples n'a pas ce problème : elle n'a pas de
 * paramètre de type à unifier, chaque site d'appel choisit son membre, et la
 * signature décorée de socket.io lui est assignable.
 */
export type ServerEmitArgs = {
  [E in ServerEventName]: [event: E, payload: ServerEventPayload<E>];
}[ServerEventName];

/**
 * Une cible de diffusion — ce que rend `io.to(room)`.
 *
 * Le retour est `unknown` et non `void` : socket.io rend `boolean`, certains
 * doubles rendent l'émetteur lui-même, et aucun appelant du dépôt ne lit cette
 * valeur. `unknown` accepte les deux sans mentir sur l'un ni sur l'autre.
 */
export interface ServerEmitTarget {
  emit(...args: ServerEmitArgs): unknown;
}

/** La surface Socket.IO minimale d'une diffusion vers une room nommée. */
export interface ServerEmitIO {
  to(room: string): ServerEmitTarget;
}

/**
 * Un couple `(événement, charge)` CORRÉLÉ — n'importe lequel des 120, mais
 * jamais un panachage de deux.
 *
 * Pour les émetteurs qui transportent le couple comme une DONNÉE (une liste
 * d'émissions à rejouer) plutôt que comme un flot de contrôle (un `switch` sur
 * un discriminant). Les seconds n'en ont pas besoin : leur `switch` corrèle sans
 * rien effacer, et c'est la forme à préférer partout où elle est possible.
 */
export type ServerEmission = {
  [E in ServerEventName]: { readonly event: E; readonly payload: ServerEventPayload<E> };
}[ServerEventName];

/**
 * Émet un couple DÉJÀ corrélé.
 *
 * TypeScript ne propage pas la corrélation d'une union discriminée à travers
 * l'accès à deux de ses propriétés (microsoft/TypeScript#30581) : lu depuis un
 * `ServerEmission`, le couple `(event, payload)` redevient deux unions
 * indépendantes, et `emit` le refuse à juste titre. Il n'existe pas de façon
 * d'exprimer l'appel sans effacer la corrélation le temps de le faire.
 *
 * Cet effacement vit ICI, **une fois**, derrière un paramètre dont le type est
 * précisément la garantie que l'effacement est sans conséquence — et nulle part
 * ailleurs. C'est la différence entre une exception nommée et une porte ouverte :
 * les huit `emit(event: string, payload: unknown)` que ce module remplace
 * étaient la seconde.
 */
export function emitServerEvent(target: ServerEmitTarget, emission: ServerEmission): void;
/**
 * La même chose depuis l'INTÉRIEUR d'une fonction générique sur l'événement.
 *
 * `emitToConversationParticipants<E>` et `broadcastToUser<E>` reçoivent le
 * couple déjà corrélé PAR LEUR SIGNATURE — c'est leurs appelants que le
 * compilateur vérifie — mais dans leur corps `E` n'est pas résolu, donc la
 * corrélation redevient inexprimable, exactement comme au-dessus. Même
 * situation, même erasure, même endroit.
 */
export function emitServerEvent<E extends ServerEventName>(
  target: ServerEmitTarget,
  event: E,
  payload: ServerEventPayload<E>,
): void;
export function emitServerEvent(
  target: ServerEmitTarget,
  emissionOrEvent: ServerEmission | ServerEventName,
  maybePayload?: unknown,
): void {
  const emit = target.emit as (event: ServerEventName, payload: unknown) => unknown;
  if (typeof emissionOrEvent === 'string') {
    emit(emissionOrEvent, maybePayload);
    return;
  }
  emit(emissionOrEvent.event, emissionOrEvent.payload);
}

/**
 * Un type anonyme DÉRIVÉ du contrat, jamais recopié.
 *
 * Le mappage homomorphe préserve les modificateurs (`readonly` compris) et ne
 * change rien à la forme ; ce qu'il change, c'est que le résultat est un type
 * OBJET anonyme et non une `interface`. Seuls les premiers reçoivent la
 * signature d'index implicite qui les rend assignables à
 * `Record<string, unknown>` — ce que les files hors ligne attendent de leur
 * charge. Sans lui, gouverner un `payload` obligerait à réintroduire au site
 * d'appel le cast qu'on cherche justement à retirer.
 *
 * Écrit au cycle 103 dans `broadcastMessageMutation`, hissé ici au cycle 104
 * parce que la jumelle des réactions en avait besoin mot pour mot.
 */
export type Anonymized<T> = { [K in keyof T]: T[K] };

/**
 * La même porte, vers un socket DÉJÀ tenu (pas de `to(room)`).
 *
 * `disconnectRevokedSessions` en est le seul porteur : il émet vers les sockets
 * que `fetchSockets()` lui rend, un par un.
 */
export interface ServerEmitSocket {
  emit(...args: ServerEmitArgs): unknown;
}

/* ------------------------------------------------------------------------- *
 * Le cliquet de la porte — au TYPE, sans une ligne de code exécutable.
 *
 * Une porte typée qu'on peut relâcher sans qu'un témoin tombe n'est pas une
 * garde, c'est une décoration : les huit surfaces que ce module remplace ont
 * chacune été écrite de bonne foi. Ces alias échouent à la COMPILATION si la
 * porte cesse de refuser ce pour quoi elle existe, et `tsc --noEmit` est un gate
 * de CI — le cliquet est donc gardé par le même outil que la production.
 *
 * Ils vivent ICI, dans le module qu'ils gardent, plutôt que dans `__tests__/` :
 * `tsconfig.json` EXCLUT les tests, et n'inclut `src/socketio/**` que par
 * atteignabilité depuis `server.ts`. Un cliquet posé dans un fichier que
 * personne n'importe n'est jamais lu par le compilateur — donc jamais rouge.
 * ------------------------------------------------------------------------- */

/** Échoue à compiler dès que `T` n'est plus `true`. */
type Assert<T extends true> = T;
type IsAssignable<A, B> = [A] extends [B] ? true : false;
type Refuses<A, B> = IsAssignable<A, B> extends true ? false : true;

/**
 * 1. Le couple JUSTE passe. Sans cette ligne, un cliquet qui refuse TOUT
 *    passerait pour un cliquet qui refuse ce qu'il faut.
 */
type _AcceptsTheRightPair = Assert<
  IsAssignable<[typeof SERVER_EVENTS.MESSAGE_EDITED, SocketIOMessage], ServerEmitArgs>
>;

/**
 * 2. Le couple FAUX ne passe pas — une réaction servie sous `message:edited`.
 *    C'est la moitié que `emit(event: string, payload: unknown)` acceptait.
 */
type _RefusesAMismatchedPair = Assert<
  Refuses<[typeof SERVER_EVENTS.MESSAGE_EDITED, ReactionUpdateEventData], ServerEmitArgs>
>;

/**
 * 3. Un nom d'événement UNION avec la charge d'un SEUL de ses membres ne passe
 *    pas.
 *
 * C'est la moitié que personne ne soupçonnait, et elle est mesurée : le `Server`
 * de socket.io est pourtant paramétré par `ServerToClientEvents`, mais sur un
 * `Ev` UNION son `EventParams` s'effondre en UNION de tuples de paramètres, si
 * bien qu'une charge correspondant à N'IMPORTE lequel des membres passe sous
 * n'importe quel autre. Quatre émetteurs de la passerelle — `ReactionHandler`,
 * `AttachmentReactionHandler`, `PostReactionHandler`, `SocialEventsHandler` —
 * émettent avec un nom calculé sur un `Server` typé : ils AVAIENT l'air gardés,
 * et ne l'étaient pas. C'est le cas le plus coûteux, parce qu'il ne ressemble à
 * rien (règle du cycle 92 bis : « un schéma qui marche peut cacher une fuite au
 * lieu de l'empêcher »).
 */
type _RefusesAUnionEventName = Assert<
  Refuses<
    [
      typeof SERVER_EVENTS.MESSAGE_EDITED | typeof SERVER_EVENTS.REACTION_ADDED,
      ReactionUpdateEventData,
    ],
    ServerEmitArgs
  >
>;

/**
 * 4. La porte que ce module REMPLACE n'est plus assignable à la porte typée.
 *    Réintroduire `emit(event: string, payload: unknown)` quelque part et le
 *    faire passer pour un `ServerEmitTarget` ne compile pas.
 */
type _RefusesTheOldUntypedDoor = Assert<
  Refuses<[string, unknown], ServerEmitArgs>
>;

export type ServerEmitRatchet = [
  _AcceptsTheRightPair,
  _RefusesAMismatchedPair,
  _RefusesAUnionEventName,
  _RefusesTheOldUntypedDoor,
];
