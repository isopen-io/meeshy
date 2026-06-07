# Tasks — Notifications sync, Stories seen-ring, Conversation avatar

## 1. Notification center sync (open conversation → mark its notifications read)
- [x] Gateway: `markConversationNotificationsAsRead` → emit `notification:counts` after marking (updateMany + emit).
- [x] Gateway: add route `POST /notifications/conversation/:conversationId/read` (io-enabled service).
- [x] SDK `NotificationService`: add `markConversationRead(conversationId:)`.
- [x] SDK `NotificationToastManager`:
      - add `conversationNotificationsRead` publisher,
      - `onConversationOpened` → emit local event + call backend mark + refresh count,
      - `handleNewNotification` → when conv is active, mark the incoming notif read (don't leave it unread).
- [x] SDK `NotificationListViewModel`: subscribe to `conversationNotificationsRead` → mark matching rows read locally.

## 2. Story seen / transcendent ring
- Already in place: markViewed persists (POST /posts/:id/view), ring uses `hasUnviewed`, ring reappears on new story.
- [x] Gap: viewer must open at the FIRST UNVIEWED story when tapping a profile/avatar/tray.
      - Add `startAtFirstUnviewed` to `StoryViewerView` (onAppear picks first `!isViewed`),
      - thread through `StoryViewerContainer` + `StoryViewerRequest`,
      - set `true` at tap entry points (tray/header/feed), keep `false` for reply/notification/specific-slide.

## 3. Conversation header avatar (clarified by user)
- Keep story ring + story opening + profil/conversation/message entries + mood/presence badge.
- [x] Fix duplicate story menu entry: remove custom "Voir les stories" (SDK already adds a single "Voir la story").
- Presence audit: PresenceManager complete (socket user:status + presence:snapshot + REST refresh + disk persist + away decay). OK.

## 4. Revue « consommé → marqué lu » étendue (2e itération)
- [x] Gateway: `markPostNotificationsAsRead(userId, postId)` (filtre context.postId) + emit counts.
- [x] Gateway: `markNotificationsByTypesAsRead(userId, types)` (filtre colonne type) + emit counts.
- [x] Gateway: `recordView` retourne `boolean` (1ère vue) ; route /posts/:id/view marque les notifs du post (borné à la 1ère vue).
- [x] Gateway: route `POST /notifications/read-by-types`.
- [x] SDK `NotificationService.markRead(types:)`.
- [x] iOS `StatusBubbleController.show` → enregistre la vue du statut (sauf le sien) → notif friend_new_mood lue.
- [x] iOS `FriendRequestListViewModel.loadRequests` → marque friend_request/contact_request/friend_accepted/contact_accepted lus.
- Couvert auto (déjà /view côté iOS): feed posts vus, stories vues.
- Limite connue: réactions sur TON propre contenu se vident au tap de la notif (recordView ignore l'auteur, par design anti-inflation de vues).
