# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Calls) — slice `call-ended-signal-identity` ✅
The **`RemotelyEnded` socket driver** — a call-waiting banner now auto-dismisses when its caller hangs up
(or the ring times out) before the user acts, driving the already-tested `CallWaitingReducer.RemotelyEnded`
branch from a real signal (parity with iOS `clearPendingIncomingCall(ifMatching:)`).
- `core:model` pure `CallSignalMapper.endedCallId(eventName, rawJson): String?` — decodes the `callId` of a
  `call:ended`/`call:missed` frame; non-teardown / blank / absent / malformed → `null`. `map` untouched.
- `sdk-core` `CallSignalManager.endedCalls: SharedFlow<String>` — republishes the ended id per teardown
  frame in `listen`, the same parallel-stream pattern as `incomingOffers`; identity-less `events` unchanged.
- `feature:calls` `CallViewModel.onRemoteEnded` — folds a match on the *pending* call's id into
  `RemotelyEnded` (stop the 15s timer + clear the banner), **no** `emitEnd` (caller already ended it); inert
  for no-banner / other-call ids so the active call is untouched.
- +15 behavioural tests (7 mapper, 4 manager, 4 VM). Full `assembleDebug` + all `testDebugUnitTest` green
  (via `/opt/gradle`; the wrapper dist download is 403-blocked in this container — see NOTES). Diff =
  `apps/android` only (3 prod + 3 test).

### Next
1. **Identity-aware active-call teardown** — the identity-less `events` fold still routes a *waiting* call's
   `call:ended` → `RemoteHangUp` into the *active* FSM; gate the FSM teardown on the active `callId`.
2. `ConnectionService`/Telecom integration + ringback tone (system call UI); then WebRTC media transport.
3. Follow-up: `SocketManager.reconnectWithToken()` still has no caller (token-refresh re-attach slice).

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
