# Android — current loop

> ⚠ **MERGE PENDING (2026-07-06): PR #1562** (`claude/apps/android/message-effects-lifecycle`) is OPEN and
> must be squash-merged to `main` as **step 0** of the next run. Slice is complete: local `meeshy.sh check`
> green; at last check CI had 7/11 jobs green, 0 failures, 4 unrelated JS/TS/Python jobs still running. The
> GitHub MCP token expired before the final CI conclusion / merge could be confirmed. Next run: verify CI is
> fully green, then squash-merge #1562 before starting a new slice.


> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Chat — rich message features) — slice `message-effects-lifecycle` ✅
**Message-effects lifecycle (ephemeral / blurred / view-once)** — makes the rich-but-dead `MessageEffects`
model live and centralises, as an Android SSOT, the lifecycle logic iOS scatters across its message views.
Pure `:core:model` `MessageLifecyclePresentation.of(effects, createdAtMillis, nowMillis, revealed, viewCount)
→ MessageLifecycle` decides three independent axes — ephemeral (`Inactive`/`Counting(remaining,total)`/`Expired`,
skew-clamped, unknown-send-time → just-started, non-positive duration → inactive), blur (`None`/`Concealed`/
`Revealed`), view-once (`None`/`Available(remaining)`/`Consumed`, default max 1, coerced/clamped) — plus
stable-order appearance/persistent effect lists; the 3 missing iOS `MessageEffects` accessors ported. Wired
end-to-end with **no DB migration** (`ApiMessage.effects` rides the JSON payload): `BubbleContentBuilder` carries
`effects` (dropped on delete), `ChatScreen` renders a compact accent-coherent badge — 1 Hz clock ticking only
while an ephemeral message is visible, natural tap-to-reveal, EN/FR/ES/PT. +35 tests, `assembleDebug` +
`testDebugUnitTest` green, diff = `apps/android` only. Next: avatar/banner upload (last §K profile-edit item,
two-hop reuse of the story upload→publish graft) or the worker drain-list Robolectric test.

## Prior loop (Phase: Settings §L) — slice `settings-regional-content-language` ✅
**Regional (secondary content) language preference** — the last no-op Settings language row is now live. A
Prisme *content* preference (resolved via `LanguageResolver`, stored on the backend profile
`User.regionalLanguage`), NOT the device-local UI locale. Pure `:feature:settings`
`RegionalLanguageSelection.build(regionalCode, systemCode, query)` SSOT (options = full
`LanguageData.allLanguages`; primary/system language hidden unless it is the stored choice;
trimmed/case-insensitive marking + label lookup + name/nativeName/code search; empty query → all; unknown
code → no label, no crash). Wiring reuses `edit-profile-optimistic` — **no new store**:
`SettingsViewModel.setRegionalLanguage(code)` → `UserRepository.enqueueProfileEdit(
UpdateProfileRequest(regionalLanguage=…))` (optimistic session repaint + durable `UPDATE_PROFILE` + wake
worker on real `cmid`) + UI-only `setRegionalLanguageQuery`; `SettingsScreen` searchable flag+native-name
dialog (EN/FR/ES/PT). +24 tests, `assembleDebug`+`testDebugUnitTest` green, diff = `apps/android` only.
Next: the worker drain-list Robolectric test (PROGRESS.md "Next" #5).

## Prior loop (Phase: Settings §L) — slice `settings-notification-prefs-sync` ✅
**Offline-queued notification-preference backend sync** — wires the dead `OutboxKind.UPDATE_SETTINGS`/
`OutboxLanes.SETTINGS` end-to-end (mirrors `edit-profile-optimistic`). Pure `:core:model`
`NotificationPreferenceSyncBody.from(prefs)` (gateway `PATCH /me/preferences/notification` contract SSOT — all
30 fields, drops `extras`, `dndDays` as lowercase tokens); `core/network` `PreferencesApi`; `:sdk-core`
`NotificationPreferencesSyncRepository.enqueueSync` (session-gated, no optimistic flip — store is truth);
`OutboxCoalescer` `UPDATE_SETTINGS` latest-snapshot rule + `OutboxFlushWorker` sender; `SettingsViewModel`
local-first-then-sync funnel (persist → enqueue → wake worker on real `cmid`). +15 tests, `meeshy.sh check`
green, diff = `apps/android` only.

## Prior loop (Phase: Settings §L) — slice `settings-interface-language` ✅
**Persisted interface (UI chrome) language** — mirrors the theme slice one step further. Pure `:core:model`
`AppLanguage` SSOT (`supportedCodes` from `LanguageData.interfaceLanguages` fr/en/es/ar; `fromStorage`/
`storageValue` codec + `resolveInterfaceLocaleTag`; `"system"`/blank/absent/unsupported → `null` = follow
device). Durable DataStore-backed `InterfaceLanguageStore` (`:sdk-core`: `InMemoryInterfaceLanguageStore` +
`DataStoreInterfaceLanguageStore`, hydrates on cold start via `stateIn(Eagerly)`, `@Singleton` in `SdkModule`).
`SettingsViewModel` `setInterfaceLanguage` intent + `SettingsScreen` display-language dialog picker (System +
flags/native names, EN/FR/ES/PT); `MainActivity` re-localises the whole Compose tree live via `LanguageViewModel`
+ a `createConfigurationContext` provider (minSdk-26 safe, no AppCompat). Regional-language row left no-op on
purpose (Prisme content-preference, not app locale). +32 tests (`AppLanguageTest` 18, `InterfaceLanguageStoreTest`
9, `SettingsViewModelLanguageTest` 5). Full `assembleDebug` + all `testDebugUnitTest` green (system Gradle
8.14.3). Diff = `apps/android` only. See PROGRESS.md run log.

### Next
1. **Notification-preference toggles** (§L) — back the `settings_push_notifications` switch (today ephemeral
   `remember` state) with the local-first user-preference store; `UserNotificationPreferences` already exists.
   Same pure-codec + DataStore-store + ViewModel-intent shape.
2. **Regional (content) language preference** (§L) — the still-no-op `settings_regional_language` row; wire it
   through the Prisme *content*-preference / profile path (`LanguageResolver`, optimistic+offline), NOT the
   interface `InterfaceLanguageStore`.
3. Or the tracked **worker drain-list Robolectric test**, or pivot back to **Calls §H** platform-glue.

## Prior loop (Phase: Contacts / outbox hardening) — slice `outbox-lane-map-ssot` ✅
Structural close of the **lane-in-drain-list gotcha** (NOTES 2026-07-04). The `OutboxFlushWorker`
kept a hand-maintained `listOf(...)` of shared lanes to drain, disjoint from the `buildSenders()`
kind→sender registry — a kind could have a sender yet be stranded off the drain list (the BLOCK/FRIEND
bug). This slice makes that impossible: a pure `OutboxLaneMap` (`:sdk-core` `outbox/OutboxModel.kt`)
is the SSOT `OutboxKind → OutboxLaneAssignment` (`PerConversation` | `Shared(lane)`, exhaustive `when`),
and the worker now drains the **derived** `OutboxLaneMap.sharedDrainLanes` (deduped, stable enum order).
Also drops the always-empty `PRESENCE`/`SOCIAL` lanes (no kind maps there) — behaviour-preserving.
+9 pure tests. Full `assembleDebug` + all `testDebugUnitTest` green (system Gradle 8.14.3). Diff =
`apps/android` only (2 prod + 1 test). See PROGRESS.md run log.

### Next
1. **Mood-emoji presence** on friend rows — note: iOS sources it from a separate `StatusViewModel`
   (user mood-status system), so this needs that status feature first (larger, dependency-heavy). The
   **send compose-new UI** (dedicated user-search → connect surface) is the other Contacts gap.
2. Then Profile & Account (§K) or back to Calls platform glue (ConnectionService/WebRTC).

## Prior loop (Phase: Contacts) — slice `presence-away-indicator` ✅
The **three-state presence dot** on the Contacts friend row (iOS parity — `UserPresence.state`).
The `:core:model` `PresenceState`/`UserPresence` were dead code; this slice makes them live. Pure
`UserPresence.state(nowEpochMillis)` is the SSOT: offline → no dot, online → green, online-but-idle
> 5min (300s, iOS parity) → amber **away**; a null/blank/unparseable `lastActiveAt` stays online, an
exactly-at-threshold or future timestamp stays online. Backed by a new nullable
`isoToEpochMillisOrNull` (distinguishes "no reliable timestamp" from the epoch instant — `isoToEpochMillis`
now delegates to it) and the `FriendRequestUser.presenceState(now)` adapter (nullable `isOnline` → offline).
The friend row renders green/amber/none via a pure `presenceDotColor` mapping. +23 tests (8 IsoTime,
10 Presence, 5 FriendPresence). Full `assembleDebug` + all `testDebugUnitTest` green (system Gradle
8.14.3). Diff = `apps/android` only (4 prod + 3 test). See PROGRESS.md run log.

### Next
1. **Mood-emoji presence** on friend rows (last remaining Contacts-list display gap), or the **send
   compose-new UI** (dedicated user-search → connect surface), or the **worker drain-list test** (Robolectric).
2. Then Profile & Account (§K) or back to Calls platform glue (ConnectionService/WebRTC).

## Prior loop (Phase: Contacts) — slice `contacts-filter-counts` ✅
The **per-filter chip counts** on the Contacts list (iOS parity — "All/online chips show counts").
Pure `:core:model` `ContactList.counts(friends, query) → ContactFilterCounts` (all/online/offline sizes
under the active search; online+offline partition all by construction) is the SSOT, exposed on
`ContactsListUiState.filterCounts` and rendered as a `label  count` badge on each chip via
`ContactFilterCounts.forFilter`. **Surpasses iOS**, whose counts ignore the search field. +7 tests
(6 model, 1 VM). `:core:model` + `:feature:contacts` `testDebugUnitTest` + `:app:assembleDebug` green
(system Gradle 8.14.3). Diff = `apps/android` only. See PROGRESS.md run log.

## Prior loop (Phase: Contacts) — slice `contacts-friends-room-cache` ✅
The **friends Room cache for cold-start paint** (iOS `CacheCoordinator.friends`) — the Contacts tab
now paints the last-known friend list instantly on cold launch, surviving process death and working
offline, instead of blocking on the received/sent fetch behind a skeleton. `:core:database`
`FriendEntity`/`FriendDao` (DB v7→8; `sortIndex` preserves `ContactList`'s assembled order verbatim so
the ordering SSOT stays in `:core:model`), `:sdk-core` `FriendListRepository` (`cachedSnapshot` — cold
vs synced-empty via `sync_meta` — + `persist` write-through), and `ContactsListViewModel` rewired
cache-first (paint-from-cache → revalidate → write-through; unfriend prunes and writes through with no
refetch). +14 tests. Full `assembleDebug` + all `testDebugUnitTest` green (system Gradle 8.14.3; wrapper
8.11.1 dist is 403-blocked — see NOTES). Diff = `apps/android` only. See PROGRESS.md run log.

### Next
1. **Suggestions Room cache** for the Discover empty-query suggestions (iOS `CacheCoordinator.userSearch`)
   — the last in-memory-only cache gap; copy the `FriendListRepository` template. Or the **send
   compose-new UI** (dedicated user-search → connect surface).
2. Then Profile & Account (§K) or back to Calls platform glue (ConnectionService/WebRTC).

## Prior loop (Phase: Calls) — slice `call-ended-identity-teardown` ✅
The **identity-aware active-call teardown** — bug fix closing the `call-ended-signal-identity` follow-up.
The gateway fans `call:ended` out to every member USER room, so a busy user (active call + a waiting-call
banner) received the *waiting* call's teardown on the identity-less `events` stream, which the VM folded
blindly into the *active* FSM — tearing down the wrong call. Teardown is now identity-gated end-to-end.
- `core:model` `CallSignalMapper.map` returns `null` for `call:ended`/`call:missed` (off the FSM-facing
  stream). New pure `endedSignal(): CallEndedSignal?` (id + `RemoteHangUp`/`RingTimeout`) is the sole
  teardown decode; blank/absent id or malformed → `null`. New pure `CallEndedSignal(callId, event)`.
- `sdk-core` `CallSignalManager.endedCalls: SharedFlow<CallEndedSignal>` (was `String`) — `listen` routes
  teardown frames through `endedSignal` only.
- `feature:calls` `CallViewModel.onRemoteEnded(CallEndedSignal)` — active id → `dispatch(event)` (FSM
  teardown); waiting id → `RemotelyEnded` (dismiss banner, no `emitEnd`); neither → inert.
- Red→green tests across all three modules (mapper inert + 11 `endedSignal` cases; manager events-silent +
  rich endedCalls; VM active-end / waiting-untouched / missed-ringing / neither-inert / idle-inert). Full
  `assembleDebug` + all `testDebugUnitTest` green (via `/opt/gradle`; wrapper dist is 403-blocked — see
  NOTES). Diff = `apps/android` only (3 prod + 3 test + docs).

### Next
1. Real self-managed `ConnectionService`/`PhoneAccount` + full-screen call UI + foreground service (swaps
   the `LogTelecomCallReporter` `@Binds`); then WebRTC media transport (`stream-webrtc-android`).
2. Follow-up: `SocketManager.reconnectWithToken()` still has no caller (token-refresh re-attach slice).

## Prior loop (Phase: Calls) — slice `incoming-call-deeplink` ✅
The **incoming-call deep-link** — consumes the `MainActivity` launch/full-screen intent extras and routes
them into the NavHost, so a ring tap actually opens the incoming-call screen.
- `:app` pure `LaunchRouter.route(LaunchExtras) → String?` (SSOT): non-blank `callId` → `CallRoute.incoming`
  (call push wins; `isOutgoing=false` + server id ⇒ answerable ring); else non-blank `conversationId` →
  `Routes.chat` (shared message-tap path); else `null`.
- `CallRoute` refactored to a **static `call` path + all-optional query args** (a blank room / peer name
  can never collapse a required path segment → no `navigate()` crash). Added `incoming(...)` +
  `config(callId, incoming)`; outgoing/`redial` behaviour preserved.
- `:app` glue: `MeeshyApp(launchRoute, onLaunchRouteConsumed)` navigates via a `LaunchedEffect` once the
  graph is live + authenticated, then marks consumed; `MainActivity` extracts extras in `onCreate` +
  `onNewIntent`.
- +14 behavioural tests (8 router, 6 route). `assembleDebug` + all `testDebugUnitTest` green.
  Diff = `apps/android` only (6 files; MeeshyApp/MainActivity glue is exempt platform code).

## Prior loop (Phase: Calls) — slice `incoming-call-push-decision` ✅
The **pure incoming-call push decision core** — the brick before the Android Telecom/`ConnectionService`
full-screen-intent plumbing. When the app is backgrounded/killed the socket is down, so the gateway
delivers the ring as a data-only FCM push; this slice is the typed shape + gating that wiring consumes.
- `core:model` `me.meeshy.sdk.model.call.IncomingCallPush` — typed FCM `data`-map / VoIP payload at
  parity with the gateway `CallEventsHandler` (`type:"call"`) + `PushNotificationService` (`type:"voip_call"`):
  `callId`/`conversationId`/`callerUserId`/`callerName`/`isVideo`(string flag)/`iceServers`(JSON) + a
  blank-skipping `displayName`.
- `IncomingCallPushParser.parse(Map<String,String>) → IncomingCallPush?` — total, side-effect-free: a call
  iff `type ∈ {call,voip_call}` AND non-blank `callId`; leniently decodes `iceServers` (missing/malformed
  → `[]`, never drops the push); blank optionals → null.
- `SeenCallRing` — immutable pure port of the iOS `VoIPDedupRing` (capacity 24 / ttl 30s):
  `contains`/`insert`/`remove`, expiry-pruning + capacity-trimming, every mutation returns a new ring.
- `IncomingCallDecider.decide(push, context) → IncomingCallDecision` (`Ring` | `Ignore(reason:
  DUPLICATE/BUSY/SELF_INITIATED)`) — faithful to the iOS `VoIPPushManager`/`reportIncomingVoIPCall`
  ordering: self-fanout → duplicate (active-or-seen) → busy → ring.
- +39 behavioural tests (18 parser, 11 ring, 10 decider). `assembleDebug` + all `testDebugUnitTest` green.
  Diff = `apps/android` only (4 files, 0 production logic outside android).

## Prior loop (Phase: Calls) — slice `realtime-session-coordinator` ✅
The app-level socket-lifecycle caller — turns the whole realtime layer live. `:sdk-core` pure
`RealtimeLifecyclePlan.commandsFor(was, is)` + `@Singleton RealtimeSessionCoordinator`; `AuthViewModel`
drives it at init/login/logout. +16 tests. Diff = `apps/android` only.

## Prior loop (Phase: Calls) — slice `call-initiate-ack` ✅
The ACK-based `call:initiate` — mints the real server `callId` (+ mode / ICE servers / ttl). `core:model`
`SocketIceServer`/`CallInitiateAck`/`CallInitiateResult`/`CallInitiateAckParser`; `:sdk-core`
`CallSignalManager.emitInitiate(conversationId, isVideo)`. +26 tests. Diff = `apps/android` only.

## Prior loop (Phase: Calls) — slice `call-history-list` ✅
The recent/missed-calls **list UI** (`:feature:calls`) over the cache-first journal — pure
`CallHistoryList` + `CallTimeLabel`, UDF `CallHistoryViewModel` (SWR, missed filter, cursor paging,
pull-to-refresh), accent-coherent `CallHistoryScreen`. +30 tests. Diff = `apps/android` only.

## Prior loop (Phase: Calls) — slice `call-history-repository` ✅
The REST + Room cache-first layer under the call journal. `:core:network` `CallHistoryApi`
(`GET calls/history?cursor&limit&filter` → `ApiResponse<List<CallRecord>>`, wired into `MeeshyApi` +
`NetworkModule`); `:core:database` `CallHistoryEntity`/`CallHistoryDao` (DB **v6→v7**, destructive
fallback) + `DatabaseModule` provider; `:sdk-core` `CallHistoryCacheSource` (Room-backed
`SwrCacheSource`, port of `StoryCacheSource`) + `CallHistoryRepository` — cache-first `historyStream()`
(`CachePolicy.CallHistory` fresh 60s / keep 90d), `refresh()`, and cursor-paginated
`fetchPage(cursor, limit, missedOnly) → CallHistoryPage(records, nextCursor, hasMore)`. +17 tests,
`meeshy.sh check` green, diff = `apps/android` only.

## Next loop (see PROGRESS.md "Next")
1. The `initiate`-ACK slice (call-id lifecycle) → fold `CallSignalManager.events` into `CallViewModel`.
2. Calls-tab navigation wiring (`:app`) for `CallHistoryScreen`.
3. Then the WebRTC / Telecom / FCM full-screen-intent plumbing.
