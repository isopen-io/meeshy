import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { LinkMessageNewEventData } from '@meeshy/shared/types/socketio-events';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import type { Anonymized, ServerEventName, ServerEventPayload } from './serverEmit';

/**
 * Un `eventType` de file, absence comprise.
 *
 * `QueuedMessagePayload.eventType` est OPTIONNEL, et son absence n'est pas un
 * oubli : elle vaut `'new'`, la forme des entrées écrites avant que le champ
 * n'existe. La table ci-dessous doit donc couvrir `'new'` — et le repli de
 * `drainedEventName` reste ce qui traduit l'absence.
 */
export type QueuedEventType = NonNullable<QueuedMessagePayload['eventType']>;

/**
 * **La** correspondance `eventType` de file → événement serveur.
 *
 * Elle vivait dans une chaîne de onze `if` (`_drainedEventName`), qui est la
 * forme sous laquelle une règle se met à diverger : rien n'y oblige à traiter
 * un `eventType` neuf, et le repli final (`return MESSAGE_NEW`) le rejouerait
 * silencieusement sous le mauvais nom.
 *
 * Le `satisfies Record<QueuedEventType, ServerEventName>` rend la table
 * EXHAUSTIVE au compilateur : ajouter un membre à l'union sans l'ajouter ici ne
 * compile plus. C'est le seul endroit du dépôt qui sait quel événement une
 * entrée de file rejoue.
 *
 * `'link-message'` y figure avec `LINK_MESSAGE_NEW`, et le choix est celui de
 * ce qui est STOCKÉ. Ce type rejoue DEUX événements (cf. `linkMessageEmissions`) :
 * `link:message:new` porte l'ENVELOPPE `{ message }`, `message:new` porte le
 * message lui-même. La file, elle, ne stocke que l'enveloppe — c'est elle que
 * `linkMessageEmissions` reçoit et déplie. Mapper vers `MESSAGE_NEW` aurait
 * donc typé la charge enfilée comme un `SocketIOMessage`, c'est-à-dire un cran
 * TROP BAS, et un appelant qui aurait enfilé le message nu aurait compilé pour
 * produire un rejeu non routable (pas de `conversationId` au premier niveau).
 * `drainedEmissions` traite ce cas avant de consulter la table ; l'entrée existe
 * pour que la table reste TOTALE, sans quoi l'exhaustivité serait une exception
 * à retenir plutôt qu'une propriété vérifiée.
 */
export const DRAINED_EVENT = {
  new: SERVER_EVENTS.MESSAGE_NEW,
  edited: SERVER_EVENTS.MESSAGE_EDITED,
  deleted: SERVER_EVENTS.MESSAGE_DELETED,
  'reaction-added': SERVER_EVENTS.REACTION_ADDED,
  'reaction-removed': SERVER_EVENTS.REACTION_REMOVED,
  'attachment-reaction-added': SERVER_EVENTS.ATTACHMENT_REACTION_ADDED,
  'attachment-reaction-removed': SERVER_EVENTS.ATTACHMENT_REACTION_REMOVED,
  'attachment-updated': SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED,
  translation: SERVER_EVENTS.MESSAGE_TRANSLATION,
  pinned: SERVER_EVENTS.MESSAGE_PINNED,
  unpinned: SERVER_EVENTS.MESSAGE_UNPINNED,
  'link-message': SERVER_EVENTS.LINK_MESSAGE_NEW,
} as const satisfies Record<QueuedEventType, ServerEventName>;

/**
 * L'événement serveur qu'une entrée de file rejoue. L'absence d'`eventType`
 * vaut `'new'` — la forme héritée.
 */
export function drainedEventName(eventType: QueuedMessagePayload['eventType']): ServerEventName {
  return DRAINED_EVENT[eventType ?? 'new'];
}

/**
 * La charge que le CONTRAT associe au rejeu de ce `eventType`.
 *
 * C'est la clé du lot : elle relie la file au contrat de fil, si bien qu'une
 * charge ENFILÉE est désormais tenue à la même forme qu'une charge ÉMISE en
 * direct. Jusqu'ici les deux moitiés étaient indépendantes —
 * `enqueueForOfflineParticipants` prenait `payload: Record<string, unknown>`,
 * donc un transport pouvait diffuser la bonne forme et enfiler une autre, et le
 * seul témoin de la divergence aurait été un client hors ligne au mauvais
 * moment.
 *
 * `Anonymized` pour la même raison qu'ailleurs : la file stocke du JSON, et sa
 * couche de persistance attend un type assignable à `Record<string, unknown>` —
 * ce qu'une `interface` n'est pas.
 */
export type QueuedPayloadFor<T extends QueuedEventType> = Anonymized<
  ServerEventPayload<(typeof DRAINED_EVENT)[T]>
>;

/**
 * Les couples `(eventType, payload)` qu'un appelant a le droit d'enfiler —
 * en union de tuples-objets, donc CORRÉLÉS.
 *
 * `'new'` apparaît deux fois, avec et sans le champ : l'`eventType` absent est
 * la forme héritée, et les appelants qui l'omettent (le chemin d'envoi nominal)
 * ne doivent pas être forcés de l'écrire pour rester typés.
 */
export type QueuedEventVariant =
  | { eventType?: undefined; payload: QueuedPayloadFor<'new'> }
  | { [T in QueuedEventType]: { eventType: T; payload: QueuedPayloadFor<T> } }[QueuedEventType];

/**
 * Le sous-ensemble corrélé des variantes, pour les relais qui n'en portent que
 * quelques-unes — `enqueueOfflineMessageMutation` (quatre), la file de
 * réactions (deux), celle des réactions de pièce jointe (deux).
 *
 * Chacun de ces relais déclarait jusqu'ici un `eventType` en union ET un
 * `payload: Record<string, unknown>` — deux unions indépendantes de plus, à
 * chaque étage. Le contrat se perdait donc AVANT d'atteindre la file, quand
 * bien même la file l'aurait exigé.
 */
export type QueuedVariantFor<T extends QueuedEventType> = {
  [K in T]: { eventType: K; payload: QueuedPayloadFor<K> };
}[T];

/**
 * Corrèle un couple `(eventType, payload)` que l'appelant tient déjà séparé.
 *
 * Même limite de TypeScript que pour `emitServerEvent` — la corrélation ne
 * traverse pas une variable générique (microsoft/TypeScript#30581) — donc même
 * réponse : l'erasure vit ICI, une fois, derrière des paramètres dont les types
 * SONT la garantie qu'elle est sans conséquence. `eventType: T` et
 * `payload: QueuedPayloadFor<T>` ne peuvent pas être dépareillés au site
 * d'appel ; c'est seulement leur RÉUNION que le compilateur ne sait pas nommer.
 *
 * À n'employer que là où le couple arrive déjà séparé (une signature héritée à
 * plusieurs paramètres). Quand l'appelant tient une union DISCRIMINÉE, le
 * `switch` reste préférable : il corrèle sans rien effacer.
 */
export function queuedVariantOf<T extends QueuedEventType>(
  eventType: T,
  payload: QueuedPayloadFor<T>,
): QueuedVariantFor<T> {
  return { eventType, payload } as QueuedVariantFor<T>;
}

/* ------------------------------------------------------------------------- *
 * Le cliquet de la file — au TYPE, comme celui de la porte (`serverEmit.ts`).
 *
 * Ce que `satisfies` garde déjà : la table est TOTALE. Ce qu'il ne garde pas :
 * qu'elle dise VRAI. Une entrée peut être exhaustive et pointer le mauvais
 * événement — et alors la charge enfilée serait tenue à la forme d'un autre
 * événement que celui rejoué, ce qui est exactement le défaut que ce lot ferme,
 * réintroduit par la table censée l'empêcher.
 *
 * Les assertions ci-dessous ancrent les correspondances dont une inversion
 * serait SILENCIEUSE parce que les deux charges se ressemblent — c'est là, et
 * seulement là, qu'un cliquet a de la valeur.
 * ------------------------------------------------------------------------- */

type AssertQueue<T extends true> = T;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * Les deux paires `added`/`removed` ne doivent pas se croiser, et leur
 * inversion ne se verrait PAS : les deux membres de chaque paire portent la
 * même charge, donc l'échange compilerait et rejouerait une réaction sous le
 * nom du retrait.
 */
type _ReactionsMapToTheirOwnEvent = AssertQueue<
  Same<(typeof DRAINED_EVENT)['reaction-added'], typeof SERVER_EVENTS.REACTION_ADDED>
>;
type _ReactionRemovalMapsToItsOwnEvent = AssertQueue<
  Same<(typeof DRAINED_EVENT)['reaction-removed'], typeof SERVER_EVENTS.REACTION_REMOVED>
>;

/**
 * `'link-message'` porte l'ENVELOPPE, pas le message nu. Le pointer vers
 * `MESSAGE_NEW` — l'erreur commise puis corrigée en écrivant ce lot — typerait
 * la charge enfilée un cran trop bas, et un appelant qui enfilerait le message
 * nu compilerait pour produire un rejeu non routable.
 */
type _LinkMessageStoresTheEnvelope = AssertQueue<
  Same<QueuedPayloadFor<'link-message'>, Anonymized<LinkMessageNewEventData>>
>;

/**
 * `'new'` et `'edited'` portent tous deux un message ENTIER — c'est ce qui rend
 * leur confusion possible et sans symptôme au typage. L'ancre porte donc sur le
 * NOM, pas sur la forme.
 */
type _NewMapsToMessageNew = AssertQueue<
  Same<(typeof DRAINED_EVENT)['new'], typeof SERVER_EVENTS.MESSAGE_NEW>
>;
type _EditedMapsToMessageEdited = AssertQueue<
  Same<(typeof DRAINED_EVENT)['edited'], typeof SERVER_EVENTS.MESSAGE_EDITED>
>;

export type QueuedEventContractRatchet = [
  _ReactionsMapToTheirOwnEvent,
  _ReactionRemovalMapsToItsOwnEvent,
  _LinkMessageStoresTheEnvelope,
  _NewMapsToMessageNew,
  _EditedMapsToMessageEdited,
];
