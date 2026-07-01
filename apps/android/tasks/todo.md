# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Calls) — slice `call-viewmodel-signal-fold` ✅
The VM-fold — turns the call screen into a live two-way socket endpoint by folding
`CallSignalManager.events` into `CallViewModel`, placing outgoing calls via the ACK, and keying every
outbound emit by the real `callId`.
- `CallConfig` gains `conversationId` (outgoing `emitInitiate` target) + `callId` (id an incoming call
  already carries); both default `""` so `:app`'s placeholder compiles unchanged.
- `CallViewModel` `@Inject`s `CallSignalManager`: `init` collects `events` in `viewModelScope` and
  reduces each mapped `CallEvent` through the unchanged FSM; outgoing `start` rings optimistically then
  `emitInitiate` mints `callId` (`Success`) or settles `Ended(Failed)` (`ServerError`/`Timeout`/
  `Malformed`, gateway message surfaced); accept→`emitJoin`, decline/hangUp→`emitEnd`, mute→
  `emitToggleAudio`, camera→`emitToggleVideo`, all `emitIfIdentified`-guarded (inert while `callId` blank).
- +14 tests (28 total in `CallViewModelTest`; all 14 prior preserved). Whole-project `assembleDebug` +
  `testDebugUnitTest` green (system Gradle `/opt/gradle`, wrapper 403s through proxy — see NOTES).
  Diff = `apps/android` only (3 code files).

### Next
1. **App-level `CallSignalManager.attach()` lifecycle caller** — an app-startup hook so inbound `events`
   begin flowing (currently nothing calls `attach()`).
2. A Calls-tab nav entry threading the real `conversationId` into the outgoing `CallConfig` + wiring
   `CallHistoryScreen` (`:app`, own explicit run since it touches nav).
3. Then the WebRTC / Telecom / FCM full-screen-intent plumbing.

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
