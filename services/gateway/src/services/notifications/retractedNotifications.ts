/**
 * Le contrat « ces lignes de notification n'existent plus », isolé de ses
 * producteurs.
 *
 * Il est né côté message (`retractMessageNotifications`), pour un retrait qui a
 * déjà eu lieu : l'écriture durable appartient à la liste d'effets du retrait,
 * et elle ne doit pas dépendre du câblage socket. Le retrait d'un POST a
 * exactement le même besoin, avec la même implémentation en face
 * (`NotificationService.announceNotificationsRetracted`).
 *
 * Le déclarer une seconde fois sous le domaine `posts/` aurait fabriqué deux
 * ports rivaux pour une seule règle — la configuration même qui avait produit
 * les listes d'effets divergentes que ces modules existent pour empêcher. Il
 * vit donc ici, à côté de son unique implémenteur, et `messaging/` le
 * ré-exporte pour que ses importateurs historiques n'aient rien à changer.
 */

/** Une ligne `Notification` retirée, réduite à ce que l'annonce doit adresser. */
export interface RetractedNotification {
  readonly id: string;
  readonly userId: string;
}

/**
 * La seule chose dont les chemins de retrait aient besoin du
 * `NotificationService` : dire aux appareils connectés que ces lignes
 * n'existent plus.
 *
 * Un port étroit plutôt que le service entier, pour la même raison que
 * `PostSoundReleaser` : l'unité déclare ce qu'elle appelle, et un test
 * l'observe sans monter un service qui parle à Redis, à APNs et à Socket.IO.
 * Le défaut est le service PARTAGÉ du processus — le seul câblé avec `io`, donc
 * le seul capable d'émettre.
 */
export interface RetractedNotificationAnnouncer {
  announceNotificationsRetracted(retracted: readonly RetractedNotification[]): Promise<void>;
}
