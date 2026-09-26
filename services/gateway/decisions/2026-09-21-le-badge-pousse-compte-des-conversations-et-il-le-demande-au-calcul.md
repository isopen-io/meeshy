## 2026-09-21 : Le badge poussé compte des CONVERSATIONS, et il le demande au calcul de la liste

**Statut** : Accepté (D-L1, spécification `docs/superpowers/specs/2026-09-21-lecture-et-accuses-design.md` § 3 ; #7218, #7001)

**Contexte** : `aps.badge` et `data.unreadCount` (le miroir App Group que la NSE écrit pour le widget, `apps/ios/MeeshyNotificationExtension/NotificationService.swift:345-348`) portaient le nombre de NOTIFICATIONS non lues. L'app, elle, badge des CONVERSATIONS (`NotificationCoordinator.conversationUnreadTotal` → `ConversationReadLedger.total(excludingOpen:excludingMuted:)`), et web-v2 aussi (`countUnreadConversations`). Une demande d'ami faisait donc monter l'icône, puis le premier passage au premier plan la recalait sur un autre nombre. D-L1 tranche : le badge d'icône compte les conversations non lues hors muettes ; la CLOCHE (`notification:counts`) garde son compte de notifications.

**Décision** :
- **Un site unique**, `computeConversationUnreadBadge` (`services/notifications/conversationUnreadBadge.ts`), appelé par les DEUX producteurs de push : la création (`NotificationService.create`) et le renvoi qui remplace une bannière révoquée (`pushReproducedNotification`).
- **Le non-lu se DEMANDE à `MessageReadStatusService.getUnreadCountsForUser`**, la fonction qui alimente déjà `unreadCountMap` de `GET /conversations` — donc le même nombre que la liste, que web-v2 projette ensuite en badge. Le masquage personnel (historique effacé, messages retirés de sa propre vue) voyage avec le calcul.
- **Jamais `ConversationReadCursor.unreadCount`.** Ce champ dénormalisé n'est écrit qu'à `0` par l'avance de curseur et à `1` par le geste « marquer non lu » : rien ne l'incrémente à l'arrivée d'un message. Un badge bâti dessus compterait les seules conversations marquées non lues À LA MAIN — zéro pour presque tout le monde. `getUnreadCount` le dit depuis son propre doc-comment (« intentionally ignored », `MessageReadStatusService.ts:170-176`).
- **Les muettes sortent AVANT le comptage** : même borne que `excludingMuted` côté iOS, et une requête de comptage épargnée par conversation muette.
- **Une panne omet le badge, elle n'en sert pas un à `0`.** `getUnreadCountsForUser` avale ses erreurs et rend une carte VIDE ; servir le `0` qui en découle EFFACERAIT l'icône d'un destinataire qui a des non-lus. La carte incomplète lève, et l'appelant retombe sur le repli historique : push sans badge.

**Alternatives rejetées** :
- **Lire le champ dénormalisé** (moins cher d'une requête par conversation) : il ne dit pas le non-lu, et ses témoins ne peuvent verdir que sur un faux Prisma qui invente des valeurs que la base ne porte pas.
- **Recalculer le non-lu ici** : ferait une SECONDE loi du non-lu, donc un badge qui change de valeur selon le chemin qui a parlé en dernier — ce que `getUnreadCountsForParticipants` interdit déjà en toutes lettres.

**Conséquences** :
- **Coût** : 2 requêtes + une par conversation non muette du destinataire, par push. C'est le prix de la parité avec la liste ; le mutualiser entre les destinataires d'un même éventail est le lot G2 (« un seul calcul du non-lu alimente la liste et le push »).
- **Écart iOS consigné, non soldé** : `ConversationReadLedger` SOMME encore des messages là où D-L1 compte des conversations (#7236, `décision-produit`). Tant qu'elle n'est pas tranchée, l'icône peut afficher un nombre au premier plan et un autre app fermée.
- La ligne `Notification` et la cloche ne changent pas : `visibleNotificationsWhere` garde ses six autres lectures.
- **Amendement au merge avec G2 (#7199)** : `getUnreadCountsForUser` délègue désormais son comptage message par message à `computeUnreadCounts` (`unreadCountsCore.ts`), qui AVALE sa propre panne et rend des zéros plutôt que de la laisser remonter (voir sa propre décision ci-dessous). Le « jamais servir 0 sur panne » de ce lot ne couvre donc plus une panne de LA REQUÊTE DE MESSAGES elle-même — seulement une panne plus haut (participants, curseurs, mute). Consigné, non bloquant : `computeConversationUnreadBadge` demande toujours une carte complète et lève si elle ne l'est pas, mais la source qui pouvait la rendre incomplète pour cette raison précise a changé de comportement sous lui, hors de son contrôle.

**Tests** : `conversationUnreadBadge.test.ts` (9) sur un faux Prisma FIDÈLE à la base — curseurs à `unreadCount: 0`, non-lu porté par les messages postérieurs au curseur — 6 rouges sur l'implémentation qui lisait le champ dénormalisé ; `NotificationService.conversationBadge.test.ts` (7), dont le second site du badge et le refus de servir `0` sur panne. Les deux fichiers modélisent, depuis le merge avec #7199, `message.findMany` (plus `message.count`) et font lever le témoin de panne sur `conversationReadCursor.findMany`.
