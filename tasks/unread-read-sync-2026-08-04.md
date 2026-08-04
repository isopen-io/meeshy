# Fix « pour de bon » — synchronisation des états non-lus (conversations + notifications)

Branche : `fix/unread-read-sync` (depuis origin/dev ac60bc2de)
Diagnostic : 4 audits parallèles (web conversations, web notifications, gateway, iOS) — 2026-08-04.

## Phase G — Gateway (causes racines)
- [ ] G1 (C4) : cascade conversation→notifications émet dans le vide — `MessageReadStatusService.ts:962` instancie `new NotificationService(prisma)` SANS `io` → injecter le service décoré (avec io)
- [ ] G2 (C1) : émettre `notification:read` (markAsRead unitaire) et `notification:deleted` (delete) — événements déclarés/écoutés mais jamais émis
- [ ] G3 (C3) : la cascade saute sur 4 early-returns (dédup TTL 2 s :774-786, 0 message :764, curseur périmé :887, `unreadCount===0` messages.ts:1581) → cascade indépendante du résultat de markMessagesAsRead
- [ ] G5 (C10) : `DELETE /notifications/read` appelé par le web matche `DELETE /notifications/:id` avec id="read" → 404 ; ajouter la route
- [ ] G6 (C2) : harmoniser le prédicat non-lu sur `isRead` (emitCountsUpdate + badge push utilisent `readAt: null`, non indexé, divergent)
- [ ] Tests gateway (bun) verts

## Phase W — Web (parité de consommation)
- [ ] W1 : câbler `notification:counts` (reçu et jeté — singleton:159, onCounts:217 sans abonné) → resync compteur cloche
- [ ] W2 : ouverture conversation → `POST /notifications/conversation/:id/read` + patch optimiste cache RQ notifications
- [ ] W3 : ouverture post / réel / story → `POST /notifications/post/:postId/read` + patch cache (post detail, reel page, story viewer)
- [ ] W4 : garde conversation active sur `conversation:unread-updated` (use-socket-cache-sync :566-583 → clamp 0 si active)
- [ ] W5 : reset optimiste `unreadCount: 0` à l'ouverture d'une conversation (cache conversations.infinite())
- [ ] W6 : badge « nouveaux messages » sur le bouton scroll-to-bottom (ConversationMessages) — indicateur intra-conversation
- [ ] W7 : BubbleStreamPage (conversation d'accueil) : mark-as-read jamais déclenché → le déclencher
- [ ] W8 : `markAsRead` optimiste décrémente sans vérifier `isRead` → dérive du compteur (use-notifications-query.ts:100)
- [ ] W9 : notification arrivant pour la conversation active : insérée non-lue mais compteur non incrémenté → la marquer consommée (cache + serveur), miroir iOS `markConsumedOnArrival`
- [ ] Tests web verts

## Phase I — iOS (trous restants)
- [ ] I1 (T1) : ReelsPlayerView n'appelle jamais `onPostOpened`/`onPostClosed` → seed + adaptiveOnChange(currentId) + disparition
- [ ] I2 (T2a) : retirer `guard showReadReceipts` de `ConversationViewModel.markAsRead` (:3604) — aligné sur ConversationListViewModel (gateway gate déjà)
- [ ] I3 (T5) : quick-action « marquer lu » push + widget : ajouter marquage notifications (portée conversation) + frontière locale `markConversationReadLocally`
- [ ] I4 (T4) : FeedCommentsSheet/CommentsSheetView (feed + réels) : `onPostOpened` à la présentation + `onPostClosed` au dismiss
- [ ] I5 (T2) : gate badge icône/widget sur la conversation ouverte (NotificationCoordinator.applyConversationUnread + AppDelegate push silencieuse)
- [ ] Build iOS OK

## Hors périmètre (documenté, non traité)
C5 champ mort `ConversationReadCursor.unreadCount` + index ; C8 admin clear-all sans counts ; C9 friends.ts markRead artisanal ; C11 getUserNotifications mort ; C12 consolidation des 4 routes mark-read ; web : composants morts (NotificationBell, v2), routage push SW dupliqué, SW qui ne marque rien au tap ; iOS : T3 séparateur non implémenté (firstUnreadMessageId code mort), T6 previewMode marque lu, T7 warm-up DEBUG.

## Review
(à compléter en fin de chantier)
