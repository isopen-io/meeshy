# Push-tap navigation race + message sync — 2026-05-29

**Branch**: `claude/message-sync-notifications-LYtcU`

## Symptom (user)
"Je reçois une notification iOS message reçu, je touche, ça n'ouvre pas la
conversation concernée." (intermittent) + souhaite que tous les messages
reçus avant l'ouverture soient déjà présents dans la conversation.

## Root cause (tap-doesn't-open)
Cold/background launch lost-navigation race:
1. `AppDelegate.didReceive` → `PushNotificationManager.handleNotification` sets
   `@Published pendingNotificationPayload`.
2. `MeeshyApp.onReceive($pendingNotificationPayload)` → `handlePushNavigation`
   **posts** `.handlePushNotification` (NotificationCenter) **then immediately
   `clearPendingNotification()`** (MeeshyApp.swift:519-528).
3. On cold launch the splash is up and `RootView`/`iPadRootView`'s
   `.onReceive(.handlePushNotification)` is not mounted yet → the post reaches
   no observer → payload cleared → `RootView.task` recovery sees `nil` →
   app lands on the list instead of the conversation.

`NotificationCenter.post` only reaches already-mounted observers; a
`@Published` replays its current value to late subscribers. So the intent must
live on the published property until a mounted view consumes it.

## Fix
- Root views subscribe **directly** to
  `PushNotificationManager.shared.$pendingNotificationPayload`; on non-nil they
  navigate then `clearPendingNotification()`. Late mount (after splash) still
  receives the replayed value → no lost navigation.
- Remove the fragile NotificationCenter post-then-clear hop in `MeeshyApp`
  (and its now-unused `.handlePushNotification` plumbing in the root views +
  the cold-start `.task` recovery block that duplicated it).

## Message sync (already sound, verified)
- `ConversationSyncEngine.ensureMessages(for:)` fires on BOTH silent push
  (`AppDelegate.didReceiveRemoteNotification`) and foreground banner
  (`willPresent`), plus background prefetch (`BackgroundTaskManager`).
- On open, `ConversationViewModel.loadMessages` → `refreshMessagesFromAPI`
  re-fetches the latest page and merges, so messages received while the conv
  was closed are surfaced. No change needed here.

## force-refetch on push (message sync hardening)
`ConversationSyncEngine.ensureMessages` gained a `force: Bool` param:
- `force: false` (TTL-respecting, via protocol-extension convenience) — kept
  for `BackgroundTaskManager` prefetch (no per-message signal).
- `force: true` — used by both AppDelegate push paths (silent + foreground
  banner). A push is authoritative evidence the cache is behind, so the
  `.fresh` short-circuit (staleTTL 2min) must not suppress the fetch.

## Tests
- `PushNotificationManagerTests`:
  - `test_handleNotification_setsPendingPayloadWithConversationId` — pins the
    published navigation-intent contract the root views now consume directly.
  - `test_clearPendingNotification_resetsPayloadToNil` — single-consumption.
- `ConversationSyncEngineTests`:
  - `test_ensureMessages_force_alwaysRefetchesAcrossConsecutiveCalls` — two
    consecutive `force:true` calls both hit the network (bypass proven without
    coupling to mergeUpdate freshness timing).
- `MockConversationSyncEngine` updated to the new signature
  (`lastEnsureMessagesForce` tracker).
- (Root-view SwiftUI `.onReceive` wiring is not unit-testable without a host;
  the published contract tests pin the SDK side the views rely on.)
