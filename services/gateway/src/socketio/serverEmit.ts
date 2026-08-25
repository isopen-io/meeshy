import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type {
  ReactionUpdateEventData,
  ServerToClientEvents,
  SocketIOMessage,
} from '@meeshy/shared/types/socketio-events';
import { enhancedLogger } from '../utils/logger-enhanced';

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

/**
 * La surface Socket.IO minimale d'une diffusion vers une room nommée.
 *
 * `to` accepte AUSSI un tableau depuis le cycle 108 — socket.io déclare
 * `to(room: Room | Room[])`, et `CallCleanupService` diffuse `call:ended` vers
 * l'audience de terminaison COMPLÈTE (room d'appel, room de conversation, et la
 * room personnelle de chaque membre) en une seule émission. Élargir un PARAMÈTRE
 * n'affaiblit aucun appelant existant : c'est la position contravariante, et les
 * dizaines de sites qui passent une chaîne restent vérifiés à l'identique.
 */
export interface ServerEmitIO {
  to(room: string | string[]): ServerEmitTarget;
}

/**
 * Un socket DISTANT rendu par `fetchSockets()` — la surface qu'en LIT le dépôt.
 *
 * Volontairement réduite à `leave` : c'est tout ce que `CallCleanupService` en
 * fait (évincer les sockets d'une room d'appel morte), et `NotificationService`
 * n'en lit même pas les éléments, seulement la LONGUEUR (présence, pour décider
 * d'un e-mail immédiat). Déclarer plus serait recopier socket.io au lieu de
 * nommer ce dont on dépend.
 */
export interface ServerRoomSocket {
  leave(room: string): unknown;
}

/** Ce que rend `io.in(room)` — une room LUE plutôt qu'écrite. */
export interface ServerRoomHandle {
  fetchSockets(): Promise<readonly ServerRoomSocket[]>;
}

/**
 * La porte d'émission ÉLARGIE à la lecture de room.
 *
 * Deux services diffusent ET inspectent la room qu'ils viennent de servir —
 * présence avant repli e-mail, éviction après terminaison d'appel. Ils prenaient
 * pour cela le `Server` NU de socket.io, dont la carte d'événements par défaut
 * (`DefaultEventsMap`) type `emit` en `(ev: string, ...args: any[])` : leurs
 * émissions n'étaient gouvernées par RIEN.
 *
 * Séparer les deux surfaces plutôt que d'ajouter `in` à `ServerEmitIO` garde la
 * porte de base à sa taille — la vaste majorité des émetteurs ne lit aucune
 * room, et n'a pas à déclarer qu'elle le pourrait.
 */
export interface ServerEmitIOWithRooms extends ServerEmitIO {
  in(room: string): ServerRoomHandle;
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
  // `target.emit(...)` en APPEL DE MÉTHODE, jamais une référence extraite.
  //
  // La version précédente faisait `const emit = target.emit` puis `emit(...)` :
  // la méthode partait DÉTACHÉE de son objet, donc `this` valait `undefined` à
  // l'exécution. `BroadcastOperator.emit` (socket.io) lit `this.adapter` dès sa
  // première ligne — chaque émission levait donc
  // `TypeError: Cannot read properties of undefined (reading 'adapter')`.
  //
  // Mesuré en production le 2026-08-25, sur les QUATORZE sites qui empruntent
  // cette porte. Le défaut est resté invisible parce que la plupart des
  // broadcasts sont `async` : l'exception y devenait une promesse rejetée que
  // personne n'attendait, et la route rendait 200 en n'ayant rien émis. Seuls
  // les broadcasts SYNCHRONES la laissaient remonter — d'où le 500 du favori et
  // du like de commentaire, seuls symptômes visibles d'une panne générale du
  // temps réel social.
  //
  // Le cast reste nécessaire (la corrélation événement/charge n'est pas
  // exprimable ici, cf. le doc-comment des surcharges), mais il porte désormais
  // sur l'APPEL et non sur une référence à la fonction.
  const emitting = target as { emit: (event: ServerEventName, payload: unknown) => unknown };
  if (typeof emissionOrEvent === 'string') {
    emitting.emit(emissionOrEvent, maybePayload);
    return;
  }
  emitting.emit(emissionOrEvent.event, emissionOrEvent.payload);
}

/**
 * Émet SANS jamais faire échouer l'appelant.
 *
 * Un broadcast temps réel est un EFFET DE BORD d'une écriture déjà committée.
 * Le laisser remonter, c'est répondre 500 pour une opération qui a RÉUSSI : le
 * client applique alors son rollback optimiste pendant que la base dit
 * l'inverse — une désynchronisation garantie, pire que l'absence de temps réel.
 *
 * Mesuré le 2026-08-25 : `POST /posts/:postId/bookmark` rendait 500 alors que la
 * ligne `PostBookmark` VENAIT D'ÊTRE ÉCRITE. Le favori existait en base, le
 * client l'effaçait de l'écran.
 *
 * Les broadcasts `async` avaient déjà cette propriété — par accident, leur
 * exception devenant une promesse rejetée que personne n'attend. Les
 * synchrones ne l'avaient pas. Cette porte la leur donne EXPRÈS, et surtout
 * elle JOURNALISE : une émission perdue en silence est ce qui a laissé la panne
 * de `emitServerEvent` vivre sans témoin.
 */
export function safeBroadcast(label: string, emit: () => void): void {
  try {
    emit();
  } catch (error) {
    enhancedLogger.error(`[broadcast] ${label}`, error);
  }
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
 * porte cesse de refuser ce pour quoi elle existe.
 *
 * **Ce qui les rend rouges en CI a CHANGÉ, et la note qui suit a déjà été
 * périmée une fois** — appliquons-lui la règle du cycle 105 plutôt que de la
 * laisser vieillir.
 *
 * Au cycle 104, l'étape « Type-check » de `ci.yml` portait
 * `continue-on-error: true` : un `tsc --noEmit` rouge ne faisait échouer aucun
 * job, et seul `ts-jest` (job de TEST) rougissait, parce que les suites
 * atteignent ce module par leurs imports et que `TS2344` n'est pas dans son
 * `diagnostics.ignoreCodes`.
 *
 * Le cycle 105 bis a retiré cette amnistie : le type-check des trois packages
 * de contrat (`shared`, `gateway`, `agent`) est désormais BLOQUANT, et le
 * `include` du `tsconfig` est passé de dix-huit répertoires énumérés à la main
 * à un glob RÉCURSIF sur `src`. Les deux voies gardent donc ce cliquet
 * aujourd'hui, et la seconde ne dépend plus de l'atteignabilité depuis
 * `server.ts`.
 *
 * Ce qui NE change pas, et qui reste la raison de les poser ici : `tsconfig.json`
 * EXCLUT les tests. Un cliquet de type posé dans `__tests__/` n'est lu que par
 * `ts-jest`, dont l'`ignoreCodes` couvre précisément `2322` et `2345` — les deux
 * codes qu'un couple `(événement, charge)` dépareillé produit. **La production
 * est le seul endroit d'où ce cliquet peut mordre.**
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
