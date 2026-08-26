import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { ClientToServerEvents } from '@meeshy/shared/types/socketio-events';
import type { CallMediaToggleClientEvent, CallMediaToggleEvent } from '@meeshy/shared/types/video-call';

/**
 * La porte d'ÉCOUTE, dérivée du contrat au lieu d'être redéclarée.
 *
 * `serverEmit.ts` (cycle 104) gouverne ce que la passerelle ÉMET. Sa jumelle —
 * ce qu'elle REÇOIT — est restée ouverte quatre cycles de suite (104, 105, 106
 * l'ont chacun nommée en suivi). C'est la moitié **hostile** du contrat : ce
 * qu'on émet vient de soi, ce qu'on écoute vient du réseau.
 *
 * Ce qui l'a laissée ouverte n'est pas un oubli de déclaration mais un CAST.
 * `MeeshySocketIOManager` déclare bien son `io` avec les deux cartes du contrat,
 * puis le passe à `CallEventsHandler` en les effaçant :
 *
 * ```ts
 * io: this.io as SocketIOServer,   // ← Server SANS générique = DefaultEventsMap
 * ```
 *
 * Cinq fois, vers le sous-système temps réel le plus complexe du dépôt. Sous
 * `DefaultEventsMap`, `socket.on(n'importe quoi, (data: n'importe quoi) => …)`
 * compile — et les vingt-deux sites d'écoute de la signalisation d'appel
 * déclaraient donc chacun la forme de ce qu'ils recevaient.
 *
 * **Un cast est une porte** (cycle 105). Celui-ci n'ouvrait pas un appel : il
 * ouvrait un sous-système entier, dans les deux sens à la fois.
 */
export type ClientEventName = keyof ClientToServerEvents;

/** Le listener que le contrat associe à CET événement. */
export type ClientEventListener<E extends ClientEventName> = ClientToServerEvents[E];

/**
 * La charge que le contrat associe à CET événement.
 *
 * `Parameters<…>[0]` et non le listener entier : c'est la charge qu'un site
 * d'écoute nomme, et c'est sur elle que porte le désaccord quand il y en a un.
 * Vaut `undefined` pour les événements sans charge (`call:check-active`,
 * `feed:subscribe`, dont le premier paramètre est déjà l'ack).
 */
export type ClientEventPayload<E extends ClientEventName> = Parameters<ClientToServerEvents[E]>[0];

/**
 * Les couples `(événement, listener)` que le contrat autorise, en UNION de
 * tuples plutôt qu'en méthode générique — même raison qu'à l'émission
 * (`ServerEmitArgs`) : deux signatures génériques ne s'unifient pas à travers le
 * mappage que socket.io applique à sa carte d'événements, une union de tuples
 * n'a pas de paramètre de type à unifier.
 */
export type ClientListenArgs = {
  [E in ClientEventName]: [event: E, listener: ClientEventListener<E>];
}[ClientEventName];

/**
 * La surface Socket.IO minimale d'une INSCRIPTION à un événement client.
 *
 * Structurale, comme ses jumelles d'émission : elle accepte aussi bien le
 * `Socket` de production que le double d'un harnais de test, sans qu'aucun
 * appelant n'ait à importer une classe.
 */
export interface ClientReceiveSocket {
  on(...args: ClientListenArgs): unknown;
}

/* ------------------------------------------------------------------------- *
 * Le cliquet de la porte — au TYPE, sans une ligne de code exécutable.
 *
 * Même emplacement et même raison qu'à l'émission : `tsconfig.json` EXCLUT les
 * tests, et l'`ignoreCodes` de `ts-jest` couvre `2322`/`2345`. **La production
 * est le seul endroit d'où ce cliquet peut mordre.**
 *
 * PORTÉE MESURÉE, et elle n'est pas celle qu'on espère. Les deux moitiés ont été
 * passées au compilateur sous le `tsconfig` réel de la passerelle AVANT d'être
 * écrites ici — une porte qu'on annonce plus stricte qu'elle n'est vaut moins
 * que pas de porte, parce que personne n'ira vérifier derrière (cycle 105,
 * « un émetteur qui a l'air gardé et ne l'est pas ») :
 *
 * | ce qu'on écoute | mesure |
 * |---|---|
 * | un nom d'événement ABSENT du contrat | **TS2345 — refusé** |
 * | une charge SANS RECOUVREMENT avec la déclarée | **TS2345 — refusé** |
 * | une charge divergente mais assignable dans UN sens | **ACCEPTÉ** |
 *
 * La troisième ligne est la limite, et elle est structurelle : la passerelle
 * compile en `strictFunctionTypes: false`, donc les paramètres se comparent
 * BIVARIAMMENT. `CallMediaToggleEvent` (`participantId`/`mediaType` requis) est
 * assignable à `CallMediaToggleClientEvent`, et passait donc sous
 * `call:toggle-audio` sans un mot. Cette porte ne l'aurait jamais dit — c'est
 * la lecture du fil, pas le compilateur, qui a trouvé ce défaut-là.
 *
 * Ce que la porte garde vraiment est donc précis, et suffit à motiver le lot :
 * **aucun événement ne peut plus être ÉCOUTÉ sans être DÉCLARÉ.** C'est
 * exactement la faute qui a laissé `call:analytics` vivre trois clients
 * émetteurs, un validateur Zod et un agrégat de production sans figurer nulle
 * part dans le contrat.
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
  IsAssignable<
    [typeof CLIENT_EVENTS.CALL_TOGGLE_AUDIO, (data: CallMediaToggleClientEvent) => void],
    ClientListenArgs
  >
>;

/**
 * 2. La porte que ce module remplace n'est plus assignable à la porte typée.
 *    Réintroduire un `on(event: string, listener: (...args: any[]) => void)`
 *    quelque part et le faire passer pour une inscription gouvernée ne compile
 *    pas. C'est le pendant exact de `_RefusesTheOldUntypedDoor`.
 */
type _RefusesTheUntypedDoor = Assert<
  Refuses<[string, (...args: readonly unknown[]) => void], ClientListenArgs>
>;

/**
 * 3. `call:analytics` est DÉCLARÉ.
 *
 * Ce cliquet-ci ne garde pas une forme, il garde une EXISTENCE — et c'est le
 * seul du module qui aurait attrapé le défaut du cycle 107. Retirer
 * `CALL_ANALYTICS` du contrat en laissant son listener vivre casse la
 * compilation ici, à l'endroit où la raison est écrite, plutôt que six mois plus
 * tard chez le troisième client qui retranscrit la forme de travers.
 */
type _AnalyticsIsDeclared = Assert<
  IsAssignable<typeof CLIENT_EVENTS.CALL_ANALYTICS, ClientEventName>
>;

/**
 * 4. La charge de `call:toggle-*` en RÉCEPTION n'est pas celle de la DIFFUSION.
 *
 * Les deux types se ressemblent au point d'avoir été confondus pendant toute la
 * vie du listener ; la seule chose qui les sépare est que la diffusion PROMET
 * `participantId` et `mediaType`, que le fil ne porte jamais. Cette assertion
 * gèle la séparation dans le sens où elle est vraie : le client n'est PAS
 * assignable à la diffusion. Ré-aliaser l'un sur l'autre la fait tomber.
 *
 * Le sens inverse est vrai et ne prouve rien — c'est précisément la bivariance
 * qui a laissé le défaut passer (voir le tableau ci-dessus). Ne pas l'asserter
 * en croyant l'avoir gardé.
 */
type _ClientToggleIsNotTheBroadcast = Assert<
  Refuses<CallMediaToggleClientEvent, CallMediaToggleEvent>
>;

/**
 * 5. `call:toggle-*` ne promet plus d'ack.
 *
 * Le contrat en déclarait un REQUIS ; aucun client ne l'envoie et la passerelle
 * ne l'appelle jamais. Un client écrit contre cette déclaration l'aurait attendu
 * indéfiniment. Geler l'arité à UN paramètre empêche la promesse de revenir.
 */
type _ClientToggleHasNoAck = Assert<
  IsAssignable<Parameters<ClientToServerEvents[typeof CLIENT_EVENTS.CALL_TOGGLE_AUDIO]>['length'], 1>
>;

export type ClientReceiveRatchet = [
  _AcceptsTheRightPair,
  _RefusesTheUntypedDoor,
  _AnalyticsIsDeclared,
  _ClientToggleIsNotTheBroadcast,
  _ClientToggleHasNoAck,
];
