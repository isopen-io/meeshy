import type { QueuedMessagePayload } from '@meeshy/shared/types/delivery-queue';

/**
 * Registre de la file de rejeu hors ligne PARTAGÉE du processus (#16706).
 *
 * ## Pourquoi un registre, et pas un paramètre
 *
 * Les sites qui DÉTRUISENT le contenu d'un message n'ont, pour la plupart,
 * aucun chemin vers la file. Relevé au cycle 143 : sur les dix écrivains de
 * `Message.deletedAt` et de l'effacement de contenu, un seul détient
 * l'instance (`MessageHandler`), trois n'atteignent qu'un
 * `MessageMutationManager` — une interface STRUCTURELLE qui n'expose que
 * `getIO` et `enqueueOfflineMessageMutation`, donc rien pour purger — et les
 * six autres n'ont que `prisma`.
 *
 * Faire descendre l'instance jusqu'à chacun d'eux voudrait dire élargir six
 * signatures et trois interfaces pour un canal best-effort, et surtout : la
 * purge serait alors un PARAMÈTRE, donc une garde que son absence désactive.
 * Le dépôt a déjà payé cette forme — « un paramètre dont l'absence désactive
 * une garde est un demi-correctif » (§ « Une garde de confidentialité se relit
 * CHEZ ELLE »). Le registre met la résolution DANS l'unité qui purge, où elle
 * ne peut pas être omise par un appelant.
 *
 * C'est le patron de `notification-service-registry.ts`, et il est ici pour la
 * même raison : l'instance VIVANTE est celle que `server.ts` construit et
 * injecte au `MeeshySocketIOManager` — la seule où les entrées de message sont
 * effectivement enfilées.
 *
 * ## Ce que le repli `undefined` veut dire
 *
 * Qu'il n'y a pas de file dans ce processus (test unitaire, script, outil).
 * Il ne veut PAS dire « purge inutile » : la tranche durable vit dans Redis,
 * partagée par toutes les instances, et c'est l'instance enregistrée qui la
 * porte. Un consommateur qui ne trouve rien ne purge rien et ne lève pas — la
 * garde de vivacité du drain (#16685) reste la seconde moitié, indépendante.
 */

/**
 * La seule capacité qu'un site de destruction demande à la file.
 *
 * Structurelle et MINIMALE à dessein : le module qui purge n'importe pas
 * `RedisDeliveryQueue`, donc aucun cycle d'imports entre `services/messaging`
 * et `services/`, et un double de test est un objet à une méthode.
 */
export type QueuedMessagePurger = {
  purgeMessage(messageId: string): Promise<number>;
};

/**
 * La seconde capacité, demandée par les MARQUES PERSONNELLES du lecteur
 * (#16688) : étoile, masquage « pour moi », restauration.
 *
 * Elle est ici pour la raison que le préambule de ce module donne pour la
 * purge, et elle est plus forte encore : les trois écrivains de ces marques
 * sont des routes REST et un service qui ne tiennent que `fastify` et `prisma`.
 * Aucun n'a de chemin vers la file, aucun n'atteint même un
 * `MessageMutationManager` — et ils n'ont rien à voir avec une CONVERSATION,
 * donc rien à faire chez `enqueueForOfflineParticipants`, dont l'audience est
 * l'audience d'une conversation.
 *
 * STRUCTURELLE et minimale, comme sa voisine : le module qui enfile n'importe
 * pas `RedisDeliveryQueue`, et un double de test est un objet à une méthode.
 */
export type QueuedPersonalMarkEnqueuer = {
  enqueue(userId: string, entry: QueuedMessagePayload): Promise<void>;
};

/**
 * Ce que le registre PEUT porter. La purge est requise — c'est la capacité pour
 * laquelle ce registre a été créé, et ses doubles existants ne déclarent qu'elle.
 * L'enfilage est OPTIONNEL AU TYPE et c'est délibéré, pour une raison qui n'est
 * pas celle que la loi du dépôt interdit (« un paramètre dont l'absence
 * désactive une garde est un demi-correctif ») :
 *
 *  - ce n'est pas un PARAMÈTRE de site d'appel, que chaque appelant pourrait
 *    omettre, mais une capacité résolue DANS l'unité qui enfile ;
 *  - ce n'est pas une GARDE — rien ici ne protège un secret ni ne refuse un
 *    accès : c'est un canal de livraison best-effort ;
 *  - et l'instance de PRODUCTION la porte par PREUVE DU COMPILATEUR, non par
 *    confiance : `delivery-queue-registry-capabilities.test.ts` affirme
 *    `RedisDeliveryQueue extends QueuedPersonalMarkEnqueuer`, de sorte qu'un
 *    renommage de `enqueue` ne compile plus.
 *
 * `undefined` garde exactement le sens que ce module lui donne déjà : il n'y a
 * pas de file dans ce processus.
 */
export type SharedDeliveryQueue = QueuedMessagePurger & Partial<QueuedPersonalMarkEnqueuer>;

let sharedDeliveryQueue: SharedDeliveryQueue | undefined;

export function setSharedDeliveryQueue(queue: SharedDeliveryQueue | undefined): void {
  sharedDeliveryQueue = queue;
}

export function getSharedDeliveryQueue(): QueuedMessagePurger | undefined {
  return sharedDeliveryQueue;
}

/**
 * La file du processus, vue par sa seule capacité d'ENFILAGE — ou `undefined`
 * quand ce processus n'en a pas, ou quand l'objet enregistré ne sait que
 * purger.
 *
 * Le test porte sur la MÉTHODE et non sur la présence de l'objet : un double
 * qui ne déclare que `purgeMessage` est un enregistrement parfaitement valide
 * (c'est la forme de tous ceux du dépôt), et lui demander d'enfiler lèverait
 * `is not a function` sur un chemin best-effort.
 */
export function getSharedPersonalMarkEnqueuer(): QueuedPersonalMarkEnqueuer | undefined {
  const queue = sharedDeliveryQueue;
  return queue && typeof queue.enqueue === 'function' ? (queue as QueuedPersonalMarkEnqueuer) : undefined;
}
