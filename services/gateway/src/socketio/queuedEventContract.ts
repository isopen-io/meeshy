import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { LinkMessageNewEventData } from '@meeshy/shared/types/socketio-events';
import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';
import type { Anonymized, ServerEventName, ServerEventPayload } from './serverEmit';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';

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
  expired: SERVER_EVENTS.MESSAGE_EXPIRED,
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
 *
 * **Le type de retour porte `undefined`, et ce n'est pas une précaution :
 * c'est la seule chose vraie que cette fonction puisse dire.** Son argument est
 * typé `QueuedEventType`, mais il ne l'est qu'à l'ÉCRITURE. À la lecture il
 * sort d'un `JSON.parse(...) as QueuedMessagePayload` — une AFFIRMATION, jamais
 * une vérification — sur des octets écrits jusqu'à 48 h plus tôt
 * (`DELIVERY_QUEUE_TTL_SECONDS`) par une version de la passerelle qui n'est pas
 * forcément celle qui relit. Un déploiement progressif suffit : deux versions
 * se partagent la même file Redis, et celle qui ne connaît pas un `eventType`
 * neuf le lit quand même.
 *
 * Déclarer `ServerEventName` tout court rendait cette recherche INFAILLIBLE au
 * compilateur alors qu'elle rend `undefined` en production — et le seul
 * consommateur émettait donc sous un nom absent. `emit(undefined, payload)` ne
 * lève PAS sur socket.io 4.8 (mesuré) : l'événement part anonyme, nul ne
 * l'écoute, et le destinataire hors ligne perd le message SANS TRACE. C'est la
 * famille « une déclaration présente, bien formée, et fausse contre son
 * producteur » — ici le producteur est Redis, pas un émetteur du dépôt.
 *
 * Rendre l'`undefined` VISIBLE au typage oblige chaque appelant à décider quoi
 * faire d'une entrée qu'il ne sait pas nommer. C'est tout l'objet du
 * changement : la valeur était déjà là, seul le type la cachait.
 */
export function drainedEventName(
  eventType: QueuedMessagePayload['eventType'],
): ServerEventName | undefined {
  return DRAINED_EVENT[eventType ?? 'new'];
}

/**
 * La charge relue est-elle seulement DIFFUSABLE ?
 *
 * Jumelle de `drainedEventName` pour l'autre moitié du couple. Le cycle 109 bis
 * a fermé le NOM ; celui-ci ferme le plancher de la CHARGE, et il s'arrête au
 * plancher — les douze événements de `DRAINED_EVENT` portent tous un objet, et
 * c'est la seule chose que les douze aient en commun. Valider chacune des douze
 * FORMES serait un autre lot, avec ses douze schémas ; refuser ce qui ne peut
 * être aucune des douze ne coûte qu'un `typeof`.
 *
 * Le trou qu'il ferme est celui que `drainedEventName` documente déjà pour le
 * nom, mot pour mot : `JSON.parse(…) as QueuedMessagePayload`
 * (`RedisDeliveryQueue.parseRawEntries`) est une AFFIRMATION, jamais une
 * vérification, et elle porte sur des octets écrits jusqu'à 48 h plus tôt
 * (`DELIVERY_QUEUE_TTL_SECONDS`) par une version de la passerelle qui n'est pas
 * forcément celle qui relit.
 *
 * **L'asymétrie qui l'a rendu invisible** : `linkMessageEmissions` EXIGE déjà
 * cette forme du message qu'il DÉPLIE — « un tableau est un `object` : sans ce
 * refus, une enveloppe dérivée enverrait une liste là où le client attend un
 * message » — pendant que l'enveloppe DONT il le dérive partait sans contrôle.
 * La valeur dérivée était gardée plus strictement que la valeur source.
 *
 * Une charge informe ne LÈVE nulle part : socket.io l'encode sans broncher, elle
 * part sous un nom d'événement parfaitement valide, et chaque décodeur client la
 * jette en silence. Le drain étant DESTRUCTIF, le message est alors perdu sans
 * recours et sans trace — exactement le coût qu'un nom absent avait avant le
 * cycle 109 bis.
 */
export function isDeliverableQueuedPayload(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload);
}

/**
 * L'entrée relue porte-t-elle une conversation qu'on puisse INTERROGER ?
 *
 * Troisième garde de la frontière de désérialisation, et la seule des trois qui
 * ne protège pas l'entrée d'elle-même : elle protège **les AUTRES entrées**
 * d'elle.
 *
 * `drainedEventName` ferme le NOM et `isDeliverableQueuedPayload` la CHARGE ;
 * les deux se prononcent sur une entrée en la lisant seule, et une entrée
 * refusée n'emporte qu'elle. `conversationId` n'a pas cette propriété : le drain
 * l'AGRÈGE — un seul `conversationId: { in: [...] }` porte la totalité du lot —
 * pour deux requêtes qui décident du sort de tous :
 *
 * 1. `_dropEndedMemberships`, le gate d'AUTORISATION du rejeu ;
 * 2. la résolution des participants qui porte les accusés de remise.
 *
 * **Le plancher est la forme ObjectId, pas « une chaîne ».** Mesuré contre le
 * client Prisma généré du dépôt, sans base : `undefined`, `null`, un nombre et
 * un objet sont refusés côté CLIENT (`PrismaClientValidationError`) ; une chaîne
 * qui n'est pas un ObjectId atteint le moteur et lève
 * `PrismaClientKnownRequestError: Malformed ObjectID`. Les deux moitiés
 * atterrissent dans le même `catch`, donc s'arrêter à `typeof === 'string'`
 * laisserait la seconde ouverte — et la seconde est la plus plausible, le dépôt
 * portant DEUX façons de nommer une conversation (`normalizeConversationId`
 * traduit un identifiant lisible en ObjectId).
 *
 * Ce que la garde vaut, et c'est le point : le `catch` de
 * `_dropEndedMemberships` échoue OUVERT **par décision** — « une absence de
 * réponse n'autorise rien à conclure », écrite pour une base indisponible. Il ne
 * peut pas distinguer « la base n'a pas répondu » de « nous ne lui avons jamais
 * posé de question valide », et la seconde rend le gate d'autorisation
 * INOPÉRANT pour le lot ENTIER — l'arriéré des conversations qu'un lecteur a
 * quittées, ou d'où il a été banni, rejoué en entier à cause d'une seule entrée
 * illisible. Aucun `catch` ne peut réparer ça : la seule réponse est de ne pas
 * mettre l'entrée dans la question.
 */
export function isAddressableConversationId(conversationId: unknown): conversationId is string {
  return isValidObjectId(conversationId);
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
  | { eventType?: undefined; payload: QueuedPayloadFor<'new'>; readonly atRest: boolean }
  | QueuedVariantFor<QueuedEventType>;

/**
 * #12822 — les familles dont la charge porte le TEXTE d'un message, ou ce qui
 * voyage avec lui (traductions, transcription, noms de fichiers).
 *
 * Leur producteur DÉCLARE le régime de la conversation (`atRest`) : `true`
 * scelle l'entrée avant Redis (`RedisDeliveryQueue`, 48 h, AOF), `false` la
 * laisse telle quelle. Le champ est REQUIS au type, pour que le compilateur
 * prouve qu'aucun producteur n'a oublié la question — l'oubli rangeait le clair
 * d'une conversation chiffrée au repos (le lien de partage, troisième audit).
 * Les autres familles (suppression, expiration, épingle, réactions) ne portent
 * que des identifiants et un emoji : elles ne déclarent rien.
 */
export type TextBearingQueuedEvent = 'new' | 'edited' | 'translation' | 'link-message' | 'attachment-updated';

type AtRestDeclarationFor<K extends QueuedEventType> = K extends TextBearingQueuedEvent
  ? { readonly atRest: boolean }
  : { readonly atRest?: never };

/**
 * La forme RUNTIME de `TextBearingQueuedEvent`, et le `Record` est ce qui
 * interdit à la liste de dériver du type : ajouter un membre à l'union sans
 * l'ajouter ici ne compile plus. Une seconde énumération écrite à la main
 * aurait divergé au premier `eventType` neuf — c'est exactement la jumelle que
 * ce fichier existe pour empêcher.
 */
const TEXT_BEARING_TABLE: Record<TextBearingQueuedEvent, true> = {
  new: true,
  edited: true,
  translation: true,
  'link-message': true,
  'attachment-updated': true,
};

/**
 * Le même ensemble en `Set`, parce que le test d'appartenance porte sur une
 * valeur venue de Redis : `'constructor' in TEXT_BEARING_TABLE` est VRAI, et
 * `eventType` sort d'un `JSON.parse(...) as QueuedMessagePayload` — une
 * AFFIRMATION, jamais une vérification. Le sens de l'erreur serait ici
 * inoffensif (une entrée de trop est GARDÉE, donc relue), mais une garde ne se
 * repose pas sur la direction de sa propre faille.
 */
const TEXT_BEARING = new Set<string>(Object.keys(TEXT_BEARING_TABLE));

/**
 * Cette entrée transporte-t-elle le TEXTE du message ?
 *
 * C'est la question qui CADRE la garde de vivacité du rejeu (#16685), et le
 * cadrage est la moitié difficile du lot : une garde de vivacité posée sur
 * TOUTES les entrées serait un défaut PIRE que celui qu'elle corrige.
 * `'deleted'` et `'expired'` ont pour UNIQUE objet d'annoncer la mort du
 * message — les refuser PARCE QUE le message est mort laisserait le client
 * afficher indéfiniment un message détruit, et la garde aurait l'air de
 * marcher.
 *
 * | famille | la charge porte | la garde de vivacité |
 * |---|---|---|
 * | `new` `edited` `translation` `link-message` `attachment-updated` | le TEXTE | **s'applique** |
 * | `deleted` `expired` | la MORT du message | **doit passer** |
 * | `pinned` `unpinned` + les quatre réactions | des identifiants, un emoji | rien à garder |
 *
 * L'ensemble n'est pas choisi pour ce lot : c'est `TextBearingQueuedEvent`
 * (#12822), déjà déclaré pour décider qui doit SCELLER sa charge avant Redis.
 * Les deux questions sont distinctes — « faut-il chiffrer au repos ? » et
 * « faut-il revérifier que le message existe encore ? » — et ont la même
 * réponse pour une raison qui n'est pas une coïncidence : **toutes deux portent
 * sur la présence d'un secret dans la charge.**
 *
 * L'absence d'`eventType` vaut `'new'`, la forme héritée — donc GARDÉE. C'est
 * le bon défaut : une entrée dont on ne sait pas ce qu'elle porte est traitée
 * comme si elle portait le secret.
 */
export function carriesMessageText(eventType: QueuedMessagePayload['eventType']): boolean {
  return TEXT_BEARING.has(eventType ?? 'new');
}

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
  [K in T]: { eventType: K; payload: QueuedPayloadFor<K> } & AtRestDeclarationFor<K>;
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
 * plusieurs paramètres). Fermée aux familles qui portent du texte (#12822) :
 * l'effacement y forgerait une variante sans sa déclaration `atRest`. Quand l'appelant tient une union DISCRIMINÉE, le
 * `switch` reste préférable : il corrèle sans rien effacer.
 */
export function queuedVariantOf<T extends Exclude<QueuedEventType, TextBearingQueuedEvent>>(
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

/**
 * `'deleted'` et `'expired'` portent la MÊME charge — `{messageId,
 * conversationId}` des deux côtés — précisément la condition qui rend une
 * inversion silencieuse (§ commentaire des paires `added`/`removed`
 * ci-dessus). L'ancre porte donc sur le NOM, pas sur la forme : un rejeu
 * d'expiration sous `message:deleted` ferait perdre la distinction que
 * `MESSAGE_EXPIRED` existe pour porter, sans qu'aucun test de forme ne le
 * voie.
 */
type _DeletedMapsToMessageDeleted = AssertQueue<
  Same<(typeof DRAINED_EVENT)['deleted'], typeof SERVER_EVENTS.MESSAGE_DELETED>
>;
type _ExpiredMapsToMessageExpired = AssertQueue<
  Same<(typeof DRAINED_EVENT)['expired'], typeof SERVER_EVENTS.MESSAGE_EXPIRED>
>;

export type QueuedEventContractRatchet = [
  _ReactionsMapToTheirOwnEvent,
  _ReactionRemovalMapsToItsOwnEvent,
  _LinkMessageStoresTheEnvelope,
  _NewMapsToMessageNew,
  _EditedMapsToMessageEdited,
  _DeletedMapsToMessageDeleted,
  _ExpiredMapsToMessageExpired,
];

/**
 * Les familles dont l'arrivée PROUVE que le message n'a plus de texte à garder
 * (#16706).
 *
 * C'est la TROISIÈME question qu'on pose à un `eventType`, après « doit-il
 * sceller sa charge ? » (#12822) et « la garde de vivacité s'applique-t-elle ? »
 * (#16685) — et c'est exactement la ligne du milieu du tableau de
 * `carriesMessageText`, lue dans l'autre sens. Là où cette garde-ci dit « ces
 * deux-là doivent PASSER, leur objet est d'annoncer la mort », celle-ci ajoute :
 * **et leur passage est le moment où le texte doit QUITTER la file.**
 *
 * La symétrie est le point du lot. `messageLivenessOf` rend `gone` sur
 * exactement deux causes — `deletedAt` non nul (suppression, rappel, brûlage
 * d'un éphémère) et `expiresAt` passé — et ces deux causes sont ce que ces deux
 * familles ANNONCENT. La purge ne porte donc aucun prédicat à elle : elle
 * applique, au STOCKAGE, le verdict que le drain applique déjà à la REMISE.
 * Deux prédicats auraient divergé au premier cas de mort de plus ; il n'y en a
 * qu'un, et il vit dans `services/messages/message-liveness.ts`.
 *
 * `pinned` / `unpinned` et les quatre réactions sont dehors, et pas par
 * omission : ils laissent le message vivant et lisible. Les purger reviendrait à
 * détruire un contenu que personne n'a retiré, sur la foi d'un événement
 * COSMÉTIQUE — le défaut symétrique de celui qu'on ferme, et le plus cher des
 * deux puisqu'il perd un message que le destinataire n'a pas encore lu.
 */
export type DestroysMessageQueuedEvent = Extract<QueuedEventType, 'deleted' | 'expired'>;

/**
 * Même construction que `TEXT_BEARING_TABLE`, et pour la même raison : un
 * `Record` exhaustif sur l'union interdit à la liste d'exécution de dériver du
 * type. Ajouter une famille de mort à l'union sans l'ajouter ici ne compile
 * plus.
 */
const DESTROYS_MESSAGE_TABLE: Record<DestroysMessageQueuedEvent, true> = {
  deleted: true,
  expired: true,
};

const DESTROYS_MESSAGE = new Set<string>(Object.keys(DESTROYS_MESSAGE_TABLE));

/**
 * Cette entrée annonce-t-elle que le message est mort ?
 *
 * `Set` et non `in`, pour la raison écrite sur `TEXT_BEARING` : la valeur
 * interrogée vient d'un `JSON.parse(…) as QueuedMessagePayload`, et
 * `'constructor' in TABLE` est VRAI. Ici le sens de l'erreur ne serait PAS
 * inoffensif — une famille admise par accident ferait purger le texte d'un
 * message vivant — donc la garde ne se repose pas sur la direction de sa faille.
 *
 * L'absence d'`eventType` vaut `'new'`, donc FAUX : une entrée dont on ne sait
 * pas ce qu'elle porte n'autorise rien à détruire.
 */
export function announcesMessageDeath(eventType: QueuedMessagePayload['eventType']): boolean {
  return DESTROYS_MESSAGE.has(eventType ?? 'new');
}
