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

let sharedDeliveryQueue: QueuedMessagePurger | undefined;

export function setSharedDeliveryQueue(queue: QueuedMessagePurger | undefined): void {
  sharedDeliveryQueue = queue;
}

export function getSharedDeliveryQueue(): QueuedMessagePurger | undefined {
  return sharedDeliveryQueue;
}
