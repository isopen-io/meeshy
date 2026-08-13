/**
 * Le contrat « ces lignes de notification ont changé de texte », isolé de ses
 * producteurs.
 *
 * Le jumeau de `retractedNotifications`, et pour la même raison : l'écriture
 * durable appartient à la liste d'effets de l'édition, et elle ne doit pas
 * dépendre du câblage socket. Il vit ici, à côté de son unique implémenteur
 * (`NotificationService.announceNotificationsReproduced`), et `messaging/`
 * l'importe.
 *
 * Pourquoi « reproduite » et non « mise à jour » : l'annonce n'est pas UN
 * événement de modification — il n'en existe pas dans le contrat client. C'est
 * un COUPLE `notification:deleted` + `notification:new`, c'est-à-dire
 * littéralement l'annulation de la notification envoyée suivie de sa
 * reproduction sur le nouveau contenu. Le nom dit ce qui part sur le fil.
 */

/** Une ligne `Notification` réécrite, réduite à ce que l'annonce doit adresser. */
export interface ReproducedNotification {
  readonly id: string;
  readonly userId: string;
}

/**
 * La seule chose dont les chemins d'édition aient besoin du
 * `NotificationService` : dire aux appareils connectés que ces lignes portent
 * désormais un autre texte.
 *
 * Un port étroit plutôt que le service entier, exactement comme
 * `RetractedNotificationAnnouncer` : l'unité déclare ce qu'elle appelle, et un
 * test l'observe sans monter un service qui parle à Redis, à APNs et à
 * Socket.IO.
 */
export interface ReproducedNotificationAnnouncer {
  announceNotificationsReproduced(reproduced: readonly ReproducedNotification[]): Promise<void>;
}
