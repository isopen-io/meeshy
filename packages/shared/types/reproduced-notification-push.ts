/**
 * LE PUSH QUI CORRIGE UNE NOTIFICATION DÉJÀ ANNONCÉE SE DÉCLARE (#7342).
 *
 * Éditer un message, un post ou un commentaire réécrit chaque notification qui
 * en portait le texte, sous la MÊME identité, et la passerelle repousse la
 * version d'après (`NotificationService.pushReproducedNotification`). Ce champ
 * de `data` le DÉCLARE : la charge ne porte pas un événement neuf, elle
 * corrige une notification que le destinataire a déjà reçue.
 *
 * iOS et Android n'ont pas à le lire : un push de révocation retire d'abord la
 * bannière d'avant, puis le push nominal affiche celle d'après. Le web ne
 * reçoit pas la révocation (`NOTIFICATION_REVOCATION_PUSH_PLATFORMS`) ; son
 * service worker (`apps/web-v2/public/sw-push.js`, qui en porte le JUMEAU
 * faute de pouvoir importer ce module) lit ce champ pour REMPLACER la bannière
 * encore affichée de cette notification, et pour n'en lever aucune quand elle
 * ne l'est plus.
 *
 * Une chaîne, comme toute valeur de `data` : APNs et FCM ne transportent que
 * des chaînes.
 */
export const REPRODUCED_PUSH_FIELD = 'reproduced';
export const REPRODUCED_PUSH_VALUE = 'true';
