/**
 * LE PUSH QUI CORRIGE UNE NOTIFICATION DÉJÀ ANNONCÉE SE DÉCLARE (#7342).
 *
 * Éditer un message, un post ou un commentaire réécrit chaque notification qui
 * en portait le texte, sous la MÊME identité, et la passerelle repousse la
 * version d'après (`NotificationService.pushReproducedNotification`). Ce champ
 * de `data` le DÉCLARE : la charge ne porte pas un événement neuf, elle
 * corrige une notification que le destinataire a déjà reçue.
 *
 * iOS n'a pas à le lire : le même push porte `REPLACES_NOTIFICATION_FIELD`
 * (ci-dessous), que son extension honore avant d'afficher. Le web ne
 * reçoit pas la révocation (`NOTIFICATION_REVOCATION_PUSH_PLATFORMS`) ; son
 * service worker (`apps/web/public/sw-push.js`, qui en porte le JUMEAU
 * faute de pouvoir importer ce module) lit ce champ pour REMPLACER la bannière
 * encore affichée de cette notification, et pour n'en lever aucune quand elle
 * ne l'est plus.
 *
 * Une chaîne, comme toute valeur de `data` : APNs et FCM ne transportent que
 * des chaînes.
 */
export const REPRODUCED_PUSH_FIELD = 'reproduced';
export const REPRODUCED_PUSH_VALUE = 'true';

/**
 * L'ANNULATION VOYAGE AVEC LE REMPLACEMENT. Le push d'une notification
 * réécrite nomme la bannière qu'il remplace (l'identité de la ligne, inchangée
 * par la réécriture) ; l'extension de notification iOS la retire AVANT
 * d'afficher la nouvelle version.
 *
 * Une révocation silencieuse séparée ne le garantit pas : APNs n'ordonne pas
 * deux pushes, iOS bride le silencieux et ne le livre jamais à une app tuée —
 * livré APRÈS le remplacement, il effaçait la version d'après ; jamais livré,
 * il laissait la version d'avant à côté d'elle. Porté par le remplacement
 * lui-même, il ne peut ni arriver après lui, ni se perdre sans lui.
 */
export const REPLACES_NOTIFICATION_FIELD = 'replacesNotificationId';

/**
 * LE PUSH D'UNE RÉACTION REMPLACE LA BANNIÈRE DU MÊME ACTEUR SUR LE MÊME SUJET.
 *
 * Changer sa réaction (❤️ → 😂) retire une notification et en crée une AUTRE :
 * deux identités, donc rien que `REPLACES_NOTIFICATION_FIELD` puisse nommer —
 * la ligne d'avant est déjà supprimée quand la nouvelle part. Le retrait
 * voyage en push silencieux, qu'iOS ne garantit pas : la bannière d'avant
 * restait à côté de la nouvelle.
 *
 * Ce champ déclare que la bannière livrée du même `type`, du même acteur
 * (`senderId`) et du même sujet (`commentId`, sinon `messageId`, sinon
 * `postId`) est remplacée — l'extension iOS la retire avant d'afficher.
 */
export const REPLACES_ACTOR_SUBJECT_FIELD = 'replacesActorSubject';
export const REPLACES_ACTOR_SUBJECT_VALUE = 'true';
