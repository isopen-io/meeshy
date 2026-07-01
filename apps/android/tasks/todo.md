# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Calls) — slice `call-initiate-ack` ✅
The ACK-based `call:initiate` — mints the real server `callId` (+ mode / ICE servers / ttl) the
outgoing-call VM will key every emit by. Parity with iOS `emitCallInitiate` (10s ACK budget).
- `core:model`: pure `SocketIceServer` (+ `IceServerUrlsSerializer` normalising the gateway's
  single-string-**or**-array `urls` → `List`), `CallInitiateAck`
  (`callId`/`mode`/`iceServers`/`ttlSeconds`), sealed `CallInitiateResult`
  (`Success`/`ServerError`/`Malformed`/`Timeout`), and the total `CallInitiateAckParser.parse(rawJson)`
  — the single tested SSOT for the ACK wire contract (`success:true` + non-blank `callId` → `Success`;
  else gateway error `error.message` → bare-string `error` → `"unknown error"`; undecodable → `Malformed`).
- `:sdk-core`: `CallSignalManager.emitInitiate(conversationId, isVideo)` — suspend transport emitting
  `{conversationId, type}`, awaiting the ACK in `withTimeoutOrNull(10_000)`, delegating the body to the
  parser, mapping a missing/non-object ACK to `Timeout`.
- +26 tests (`CallInitiateAckParserTest` 21, `CallSignalManagerTest` +5). Full `assembleDebug` +
  `testDebugUnitTest` green (system Gradle `/opt/gradle`, wrapper 403s through proxy — see NOTES).
  Diff = `apps/android` only.

### Next
1. **VM-fold (highest value now):** fold `CallSignalManager.events` into `CallViewModel`
   (`viewModelScope`), add a `startOutgoing` intent calling `emitInitiate` → store the minted `callId`
   in `CallUiState` (Ringing on `Success`, error surface on `ServerError`/`Timeout`/`Malformed`), and
   route accept/decline/hang-up/mute/camera intents to the outbound emits keyed by that `callId`.
2. App-level `CallSignalManager.attach()` lifecycle caller; wire `CallHistoryScreen` into a Calls tab
   (`:app`) once the app shell exposes one.
3. Then the WebRTC / Telecom / FCM full-screen-intent plumbing.

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
