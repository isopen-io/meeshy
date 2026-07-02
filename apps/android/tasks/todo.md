# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Calls) — slice `realtime-session-coordinator` ✅
The app-level socket-lifecycle caller — turns the whole realtime layer live. It was **dead code**:
nothing called `SocketManager.connect()` and no manager's `attach()` ran, so `CallSignalManager.events`
(and every `message:*`/social frame) never flowed.
- `:sdk-core` pure `RealtimeLifecyclePlan.commandsFor(was, is)` owns the ordering (sign-in →
  `[Connect, Attach]`, connect-before-attach since `on()` no-ops on a null socket) + edge-only invariants
  (act only on real auth transitions; **attach paired with every connect** so logout→login re-attaches on
  the new socket).
- `:sdk-core` `@Singleton RealtimeSessionCoordinator.onAuthenticatedChanged(isAuthenticated)` holds the
  edge (`@Synchronized`) and dispatches the plan's commands (connect / attach message+social+call /
  disconnect) to the SDK singletons. `AuthViewModel` drives it at init (restored token) / login / logout.
- +16 tests (5 `RealtimeLifecyclePlanTest`, 6 `RealtimeSessionCoordinatorTest`, +5 `AuthViewModelTest`).
  `assembleDebug` + `testDebugUnitTest` green (system Gradle `/opt/gradle`, wrapper 403s — see NOTES).
  Diff = `apps/android` only (2 modified, 4 new).

### Next
1. A Calls-tab nav entry threading the real `conversationId` into the outgoing `CallConfig` + wiring
   `CallHistoryScreen` (`:app`, own explicit run since it touches nav).
2. Then the WebRTC / Telecom / FCM full-screen-intent plumbing.
3. Follow-up: `SocketManager.reconnectWithToken()` has no caller yet — a token-refresh slice must
   re-attach after it (same attach-per-connect rule).

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
