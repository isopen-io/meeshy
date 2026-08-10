---
'@meeshy/gateway': patch
---

Les notifications d'une story DÉTRUITE sont retirées avec elle — et l'expiration, elle, ne retire rien.

Le balayage des stories expirées (`ExpiredStoriesCleanupService`) est le **seul chemin de
hard-delete de post du gateway** : au bout de 7 jours il supprime définitivement les lignes `Post`
des stories périmées, leurs reposts et tous leurs commentaires. Il ne retirait pas les notifications
que ces posts avaient produites. Elles survivaient à leur cible, indéfiniment : une copie
dénormalisée d'un contenu qui n'existe plus (`content`, `metadata.commentPreview`, et
`metadata.firstAttachmentUrl`, la vignette d'un média supprimé), un `action: view_post` qui n'ouvre
plus qu'un 404, et un badge non lu que plus personne ne peut décrémenter — on ne lit pas ce qui
n'est plus là. Toutes les stories expirent, donc toutes finissaient par en laisser.

**L'expiration N'EST PAS le retrait, et le correctif n'y touche pas.** Tant que la story n'est que
périmée, sa notification reste une trace légitime : les deux clients l'affichent marquée
« expirée » à partir de `context.postExpiresAt` (web `notification-helpers`, iOS
`expiryLabel` / `isLinkedContentExpired`), et `getPostById` ne filtre pas l'expiration — la cible
répond encore. Estampiller `Notification.expiresAt` depuis l'échéance du post, par symétrie avec le
message éphémère, aurait donc masqué côté serveur des lignes que le produit montre délibérément, et
transformé en code mort l'affichage « expirée » des deux clients. C'est à la DESTRUCTION que les
deux appuis tombent ensemble, et c'est là que le retrait est ancré.

Le retrait précède les suppressions et **rejette** volontairement — même raison que la libération
des usages de sons juste à côté : `context.postId` n'a ni relation ni cascade, donc détruire les
posts après un retrait en échec laisserait des lignes que plus aucun chemin n'atteindrait, la passe
suivante ne voyant plus les posts. La passe horaire suivante rejoue tout.

`retractPostNotifications` prend désormais une **liste** de posts, comme son jumeau
`retractCommentNotifications` : ce qui part ensemble se retire ensemble, en un `$in` au lieu d'une
lecture par post. Son plafond de drainage rejette au lieu d'avertir — inatteignable tant que
l'entrée était un post unique, il ne l'est plus quand elle est une heure d'expirations de toute la
plateforme.

Aucune réparation de données : le correctif ne vaut que pour les destructions à venir. Les lignes
déjà orphelines demandent un script, sur le patron de `repair-mention-user-ids.ts`.
