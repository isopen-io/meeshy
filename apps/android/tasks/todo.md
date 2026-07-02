# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Calls) — slice `calls-tab-nav` ✅
The Calls **bottom-nav tab** — `CallHistoryScreen` was reachable-by-nobody dead UI (no route pointed at it).
- `Routes.CALLS` tab (`Call` icon, order Messages · Feed · **Calls** · Activity · Profile) mounts
  `CallHistoryScreen` in the `NavHost`; added to `tabRoutes` + `rememberTabs` + new `tab_calls` string.
- New pure `CallRoute.redial(record: CallRecord)` — the natural "tap a past call to call back" gesture:
  threads the journal row's conversation + resolved `displayName` + media straight into the outgoing-call
  `path(...)`, identical to a chat-header call. `onOpenCall` navigates via it.
- +4 `CallRouteTest` cases (conversation/name/media round trip, displayName-over-username + reserved-char
  encoding, audio-only, peer-absent group fallback). `assembleDebug` + `:app:testDebugUnitTest` green.
  Diff = `apps/android` only (4 files).

### Next
1. The WebRTC / Telecom / FCM full-screen-intent plumbing (incoming-call notification + ConnectionService).
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
