# Fix « pour de bon » — synchronisation des états non-lus (conversations + notifications)

Branche : `fix/unread-read-sync` (depuis origin/dev ac60bc2de)
Diagnostic : 4 audits parallèles (web conversations, web notifications, gateway, iOS) — 2026-08-04.

## Phase G — Gateway (causes racines) — commit 83b8424fc
- [x] G1 (C4) : cascade → NotificationService PARTAGÉ (câblé io) via `notification-service-registry` ; enregistré par MeeshySocketIOManager
- [x] G2 (C1) : `notification:read` émis par markAsRead, `notification:deleted` par deleteNotification (room user) — web ET iOS les écoutaient déjà
- [x] G3 (C3) : cascade extraite (`syncConversationNotifications`, dédup TTL propre) appelée AVANT tous les early-returns + fire-and-forget sur le raccourci `unreadCount===0` de mark-read
- [x] G5 (C10) : route `DELETE /notifications/read` + `NotificationService.deleteAllRead`
- [x] G6 (C2) : `isRead: false` partout (emitCountsUpdate + badge push)
- [x] Bonus C6 : broadcastReadStatus (conversations/messages.ts) recompte le reste réel au lieu de 0 en dur
- [x] Tests gateway verts : 578 suites / 15 262 tests + tsc propre

## Phase W — Web (parité de consommation) — commit acf9fadb6
- [x] W1 : `notification:counts` câblé (valeur absolue autoritaire → pages + clé unreadCount)
- [x] W2 : ouverture conversation → `markScopeNotificationsRead` (nouveau module `lib/notifications/notification-read-sync`, patch cache + route coalescée 5 s)
- [x] W3 : post detail + page réel (n'émettait RIEN) + chaque slide de story (`useRecordStoryViewMutation`)
- [x] W4 : garde conversation active sur `conversation:unread-updated` (clamp 0)
- [x] W5 : reset optimiste à l'ouverture (nouveau module `lib/conversations/unread-cache`)
- [x] W6 : pastille « nouveaux messages » sur le bouton scroll (ConversationMessages)
- [x] W7 : BubbleStreamPage monte `useSeenMessages` + consommation à l'ouverture
- [x] W8 : décrément markAsRead gardé sur `wasUnread`
- [x] W9 : notification pour conversation active insérée lue + marquée serveur
- [x] Bonus : `notification:deleted` câblé (retrait de ligne multi-appareils)
- [x] Tests web verts : 499 suites / 11 636 tests

## Phase I — iOS (trous restants)
- [x] I1 (T1) : ReelsPlayerView → onPostOpened (seed + changement de réel) / onPostClosed (changement + disparition) + re-claim au dismiss de la sheet commentaires
- [x] I2 (T2a) : guard `showReadReceipts` retiré de `ConversationViewModel.markAsRead` (le gateway gate déjà la divulgation ; l'appel alimente le curseur → badge multi-appareils)
- [x] I3 (T5) : quick-action push + widget → `onConversationMarkedRead` (nouvelle API SDK sans déclaration de conversation active) + frontière `markConversationReadLocally`
- [x] I4 (T4) : CommentsSheetView (feed + réels) → onPostOpened à l'apparition / onPostClosed au dismiss
- [x] I5 (T2) : `NotificationCoordinator.applyConversationUnread` clampe la conversation OUVERTE à 0 (provider injectable, défaut MessageSocketManager.activeConversationId) — couvre socket ET push silencieuse (AppDelegate)
- [x] Build iOS OK (meeshy.sh, 90 s) + NotificationCoordinatorTests 35/35 sur simulateur

## Hors périmètre (documenté, non traité)
C5 champ mort `ConversationReadCursor.unreadCount` + index ; C8 admin clear-all sans counts ; ~~C9 friends.ts markRead artisanal~~ (RÉSOLU 2026-08-04 : `respondFriendRequest` passe par `NotificationService.markFriendRequestNotificationsAsRead` — un seul update Mongo indexé filtré sur `context.friendRequestId` + émission `notification:counts` pour la sync cloche multi-appareils ; fin du `findMany` de toutes les non-lues + filtre mémoire + N updates sans émission) ; C11 getUserNotifications mort ; C12 consolidation des 4 routes mark-read ; web : composants morts (NotificationBell, v2), routage push SW dupliqué, SW qui ne marque rien au tap ; iOS : T3 séparateur non implémenté (firstUnreadMessageId code mort), T6 previewMode marque lu, T7 warm-up DEBUG.

## Review
3 commits sur `fix/unread-read-sync` : 83b8424fc (gateway), acf9fadb6 (web), 3e341101c (iOS).

Chaîne réparée de bout en bout :
1. Toute lecture de conversation (n'importe quel chemin, y compris receipts périmés et raccourci 0-non-lu) déclenche la cascade notifications, qui émet réellement `notification:counts` (service partagé câblé io).
2. Les marquages unitaires émettent `notification:read`/`notification:deleted` — consommés par le web (handlers déjà écrits) ET iOS (handlers déjà écrits) → sync multi-appareils effective.
3. Le web consomme désormais tout ce que le serveur émet (counts) et déclenche les marquages par portée à l'ouverture de chaque surface (conversation, accueil, post, réel, story) — parité avec iOS.
4. iOS bouche ses 5 trous restants (réels, commentaires feed/réels, quick-actions, guard receipts, badge icône).

Gates : gateway 578 suites/15 262 tests + tsc ; web 499 suites/11 636 tests ; iOS build + tests SDK ciblés.
Vérification à chaud recommandée après merge : multi-appareils (lire sur A → cloche de B se met à jour), réel avec commentaire tardif, accueil meeshy.
