---
'@meeshy/gateway': patch
---

Supprimer un post laissait derrière lui toutes les notifications qu'il avait produites — avec
l'extrait de son contenu et la vignette de son média.

`applyPostRemovalEffects` est l'unité qui NOMME tout ce qu'un retrait de post doit écrire en base,
créée précisément parce que la console avait rattrapé un par un, à trois cycles d'intervalle, ce que
le service faisait et qu'elle ne faisait pas. Elle listait l'audit de modération, la coupure des
liens de partage et la libération des usages de sons. Elle n'a jamais listé les **notifications**,
alors que son jumeau côté message (`applyMessageRemovalEffects`) les retire depuis deux cycles.

Rien ne les en retirait. Le retrait d'un post est **doux** (`deletedAt`), donc aucun
`onDelete: Cascade` ne se déclenche — et il n'y a de toute façon aucune relation à ne pas
déclencher : le lien vit dans `context.postId`, un chemin dans un blob JSON. Chaque `post_comment`,
`comment_reply`, `comment_like`, `post_repost`, `story_new_comment`, `story_thread_reply`,
`friend_story_comment`, `friend_new_story`, `friend_new_post` et `user_mentioned` de ce post
survivait donc indéfiniment, avec la copie **dénormalisée** que `createNotification` en a prise —
`content`, `metadata.commentPreview`, et `metadata.firstAttachmentUrl`, la vignette du média retiré.
Aucun filtre à la lecture ne peut les rattraper : la ligne ne relit jamais le post. Le
`action: view_post` qu'elles portent n'ouvre plus qu'un écran 404, et leur badge non lu n'est plus
décrémentable — on ne consomme pas ce qui n'est plus là. Le diagnostic du 2026-08-04 en comptait
**≈ 8 100 non lues** en production.

Cinquième occurrence du même mécanisme après les `TrackingLink`, les `Mention`, les `Notification`
d'un message rappelé et celles d'une demande d'amitié supprimée : une ligne dénormalisée survit au
retrait de son référent parce que le retrait ne l'a jamais nommée. C'est la plus large des cinq.

**Retrait plutôt que neutralisation**, même arbitrage et même geste que le rappel d'un message : une
notification dont le post n'existe plus n'a rien à afficher **et** rien où mener, et
`notification:deleted` est le seul geste que les clients savent déjà recevoir (écouté par le web et
par le SDK iOS), doublé d'un `notification:counts` par destinataire sans lequel la cloche resterait
sur un compteur incluant des lignes que le serveur vient de supprimer.

Deux différences de forme avec le jumeau message, et elles décident toute l'implémentation :

- **Aucune colonne ne porte le lien.** `Notification.messageId` existe ; rien d'équivalent pour un
  post. La seule trace est `context.postId`, que l'API Prisma ne sait pas filtrer sur MongoDB —
  d'où la commande brute, exactement comme `markPostNotificationsAsRead`. Et le filtre n'est **pas**
  scopé à un `userId` : un post notifie une AUDIENCE (auteur, commentateurs du fil, amis prévenus de
  la publication), donc la relecture projette `userId` et l'annonce se groupe par destinataire.
- **Le lot n'est pas la fin.** L'audience d'un post dépasse la taille d'un lot bien plus vite que
  les quelques destinataires d'un message ; une lecture unique laisserait la queue en base sans le
  moindre signal, puisque le premier lot, lui, a réussi. D'où le drainage, par lots de 200 en
  série — taille modeste délibérément, `announceNotificationsRetracted` déclenchant un recalcul de
  compteurs par destinataire distinct : le lot borne la rafale, et l'enchaînement en série garde le
  pic à un lot quelle que soit l'audience.

La suppression porte sur les ids **relus** et non sur le prédicat : l'ensemble supprimé et
l'ensemble annoncé sont identiques par construction, et aucune ligne ne peut disparaître sans son
`notification:deleted`. La course avec une notification créée pendant le retrait est fermée de
l'autre côté, à l'admission — `canNotifyAboutPost` passe par `loadPostAcl`, qui rend `null` pour un
post supprimé.

Le retrait est placé **juste après l'audit** et avant les deux autres effets : l'audit reste le
premier écrit (c'est la trace de modération), mais le retrait est le seul des quatre dont le retard
se voit, l'extrait et la vignette restant affichés dans l'inbox de toute l'audience tant qu'il n'a
pas eu lieu. Il est **best-effort** comme les trois autres — `deletedAt` est déjà committé quand la
liste s'exécute, et un retrait qui échoue ne doit jamais transformer une suppression réussie en 500.

Les deux routes qui retirent un post (`DELETE /posts/:postId` via `PostService.deletePost`, et
`DELETE /admin/posts/:postId` qui écrit `deletedAt` en direct) n'ont **rien à câbler** : l'annonceur
se résout par défaut sur le service partagé du processus, le seul branché avec `io`, exactement
comme chez le jumeau message. Le port `RetractedNotificationAnnouncer` déménage de `messaging/` vers
`notifications/`, à côté de son unique implémenteur — le déclarer une seconde fois sous `posts/`
aurait fabriqué deux ports rivaux pour une seule règle, la configuration même que ces modules
existent pour empêcher ; `messaging/` le ré-exporte pour ses importateurs historiques.

Couvert (RED→GREEN, rouges observés sur les deux surfaces) par 9 tests sur l'unité de retrait et 3
sur la liste d'effets, dont deux témoins re-vérifiés par sonde — chaque ligne repart vers **son**
destinataire (le double rend des `userId` tous différents, un retrait qui les confondrait
adresserait des appareils qui n'ont jamais eu la ligne), et le drainage va bien au-delà d'un lot
plein. Ne rattrape pas les lignes déjà orphelines en base : action humaine, sur le patron des
scripts de réparation existants.
