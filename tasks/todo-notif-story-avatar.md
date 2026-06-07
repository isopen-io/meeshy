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
