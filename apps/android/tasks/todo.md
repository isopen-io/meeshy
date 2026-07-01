# Android — current loop

> Live state and the next slice now live in
> **`apps/android/tasks/android-routine/PROGRESS.md`**. The loop procedure is in
> `apps/android/tasks/android-routine/ROUTINE.md`. This file is a short pointer.

## This loop (Phase: Calls) — slice `call-history-list` ✅
The recent/missed-calls **list UI** (`:feature:calls`) over the cache-first journal.
- Pure `CallHistoryList` (`combine` de-dups stream+paged by `callId`, stream order first;
  `filter` narrows to missed). Pure `CallTimeLabel` (ISO → relative label: same-day time /
  yesterday / weekday / date-with-optional-year, empty on unparsable).
- UDF `CallHistoryViewModel` over `CallHistoryRepository.historyStream()` — SWR flags
  (skeleton only on cold empty), client-side missed-only filter, cursor-paged infinite scroll
  via `fetchPage` (de-dup, cursor advance, `hasMore`/re-entrancy/failure gating), pull-to-refresh
  that resets paging. Immutable `CallHistoryUiState` with `isFilteredEmpty`.
- Accent-coherent `CallHistoryScreen` glue: `MeeshyAvatar` rows, direction icon (missed = error
  colour), relative time, All/Missed `FilterChip`s, cold skeleton, empty states, pull-to-refresh.
- +30 tests (`CallHistoryListTest` 7, `CallTimeLabelTest` 7, `CallHistoryViewModelTest` 16).
  +10 strings × 4 locales. `meeshy.sh check` green, diff = `apps/android` only.

### Next
1. Fold `CallSignalManager.events` into `CallViewModel` once the `initiate`-ACK call-id lifecycle
   lands (an `initiate`-ACK slice giving the outgoing call its server call-id).
2. Wire `CallHistoryScreen` into a Calls tab / navigation entry once the app shell exposes one
   (currently reachable as a standalone screen; nav host wiring touches `:app`).
3. Then the WebRTC / Telecom / FCM full-screen-intent plumbing.

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
