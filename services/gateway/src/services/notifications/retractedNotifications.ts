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

/**
 * Une ligne `Notification` retirée, réduite à ce que l'annonce doit adresser.
 *
 * `conversationId` — `context.conversationId` de la ligne, quand elle en porte
 * un — n'est pas lu par le socket : il sert au push de RÉVOCATION
 * (`notificationRevocationPush`), parce que le web et Android indexent leurs
 * bannières par conversation et ne savent retirer qu'à cette maille. Un
 * producteur qui ne le relit pas (posts, commentaires, demandes d'ami) ne
 * prive personne : ses lignes n'ont pas de conversation.
 *
 * `type` voyage POUR `conversationId`, et n'a de sens qu'avec lui. Le gateway
 * pose `data.conversationId = context.conversationId || ''` pour TOUS les types
 * (`createNotification`), réactions et mentions comprises : seul le type dit si
 * la bannière a été posée sous l'index de la CONVERSATION — ce que fait un
 * arrivage de message, qui remplace la précédente du fil — ou sous le sien.
 * Sans lui, Android annulait la bannière du dernier message d'une conversation
 * en retirant une simple réaction.
 *
 * `pushSent` — `delivery.pushSent` de la ligne — est la CONDITION du push de
 * révocation, et il est OBLIGATOIRE pour cette raison : il n'y a de bannière à
 * retirer que là où un push est parti. Le champ n'est vrai qu'après réception
 * effective par au moins un appareil (GW7, `NotificationService`) ; une ligne
 * jamais poussée — préférences fermées, aucun token, transport en panne — ne
 * doit réveiller aucun téléphone, et l'audience d'un post se compte en dizaines
 * de milliers de lignes.
 */
export interface RetractedNotification {
  readonly id: string;
  readonly userId: string;
  readonly conversationId?: string | null;
  readonly type?: string | null;
  readonly pushSent: boolean;
}

function conversationIdOf(context: unknown): string | null {
  if (!context || typeof context !== 'object') return null;
  const value = (context as { readonly conversationId?: unknown }).conversationId;
  return typeof value === 'string' && value !== '' ? value : null;
}

function pushWasSent(delivery: unknown): boolean {
  if (!delivery || typeof delivery !== 'object') return false;
  return (delivery as { readonly pushSent?: unknown }).pushSent === true;
}

/**
 * Le site UNIQUE qui lit le blob d'une ligne pour l'annonce — que le blob
 * vienne d'un `findMany` Prisma ou d'une commande brute. `conversationId` et
 * `type` ne sont posés que si la ligne porte une conversation, pour que
 * l'annonce d'une ligne sans conversation reste minimale.
 *
 * `delivery` est un paramètre REQUIS, et c'est délibéré : un producteur qui ne
 * le projette pas doit ROUGIR à la compilation. Le laisser optionnel ferait
 * d'un `select` incomplet une révocation SILENCIEUSEMENT perdue — le mode de
 * panne exact qu'un inventaire de champs à tenir à jour finit toujours par
 * produire.
 */
export function retractedNotificationOf(row: {
  readonly id: string;
  readonly userId: string;
  readonly context?: unknown;
  readonly type?: unknown;
  readonly delivery: unknown;
}): RetractedNotification {
  const pushSent = pushWasSent(row.delivery);
  const conversationId = conversationIdOf(row.context);
  if (!conversationId) return { id: row.id, userId: row.userId, pushSent };
  const type = typeof row.type === 'string' && row.type !== '' ? row.type : null;
  return { id: row.id, userId: row.userId, conversationId, type, pushSent };
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
