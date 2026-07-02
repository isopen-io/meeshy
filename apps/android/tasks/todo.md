# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Calls) — slice `incoming-call-push-decision` ✅
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

### Next
1. `MeeshyFcmService` call-push routing: route a `type ∈ {call,voip_call}` data push through the parser +
   decider, hold the live `SeenCallRing`, and on `Ring` fire a full-screen `ConnectionService` /
   CATEGORY_CALL notification → the call screen (Android-platform glue).
2. Then the actual WebRTC media transport (peer connection, ICE, SDP over `CallSignalManager`).
3. Follow-up: `SocketManager.reconnectWithToken()` has no caller yet — a token-refresh slice must
   re-attach after it (same attach-per-connect rule).

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
