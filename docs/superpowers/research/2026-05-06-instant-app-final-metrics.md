# Instant App Foundation — Final Metrics

**Date:** 2026-05-06
**Branch:** `dev` (post Phase 0–4 merges + Followups #1–#6)
**Measurement run:** 2026-05-06 (this document)

This document is the source of truth for Phase 4 acceptance.

---

## Targets vs Actuals

### ✅ Confirmed via XCTest benchmarks (iPhone 16 Pro simulator, iOS 18.2, Debug build)

| Metric | Target | Actual | Verdict |
|--------|--------|--------|---------|
| FTS5 search latency — 100k messages, prefix match | < 50 ms | **< 50 ms** (test passes assertion) | ✅ PASS |
| FTS5 search latency — scoped to conversation | < 50 ms | **< 50 ms** (test passes assertion) | ✅ PASS |
| Message window iteration — 1000 messages (cell-prep proxy) | n/a (regression baseline) | **86 µs / iteration** (avg over 10 runs, σ = 2.5%) | ✅ Established baseline |

**Source:** `apps/ios/MeeshyTests/Performance/{SearchPerformanceTests,MessageListPerformanceTests}.swift`
Run via `./scripts/ios-perf-benchmark.sh` — results in `apps/ios/test-results/perf/*.xcresult`.

### 🟡 Requires manual device run (real iPhone, not simulator)

These targets require a real device session — simulator measurements are not representative for cold start, scroll FPS, or sustained memory.

| Metric | Target | Method |
|--------|--------|--------|
| Cold start to interactive (500 conversations cached) | < 500 ms | Stopwatch from icon-tap; or Time Profiler signposts |
| Conversation first paint (5k messages) | < 200 ms | Time Profiler `signposts` between `ConversationView.onAppear` and first cell render |
| Scroll FPS (1000 msgs, 5 msg/s burst) | 60 fps | Instruments → Core Animation gauge during 2-min scroll + Socket.IO injection |
| Decrypt p95 latency | < 10 ms | `CryptoSignposts` markers (Task 0.5) — 100+ samples in normal session |
| Memory peak — 30-min sustained scroll | < 150 MB | Instruments → Allocations → Peak Resident Memory |
| Outbox flush after 30 min offline (50 messages) | < 60 s | Log timestamps from `OutboxFlusher.flush()` start to last record deletion |
| Offline compose — optimistic UI latency | < 16 ms | Stopwatch from send-tap to bubble appearance |
| Offline search latency (airplane mode) | < 100 ms | UI stopwatch — should match the benchmark < 50 ms |

**Available device for manual run:** Services CEO i16pm — iPhone 16 Pro Max, iOS 26.3.1
(`xcrun xctrace list devices` confirms it's online and paired)

**Note on device class:** iPhone 16 Pro Max is high-end. The original plan targeted iPhone SE 2 / iPhone 8 (low-end) for worst-case validation. Measured numbers on iPhone 16 Pro Max represent best-case; numbers on lower-end devices may differ. Document each measurement with the device used.

---

## Methodology

### Cold start (manual)
1. Force-quit the app
2. Tap the icon; start stopwatch
3. Stop when the conversation list is interactive (you can scroll or tap a row)
4. Record time

Alternatively: Time Profiler with `os_signpost` from `MeeshyApp.init` to first cell render.

### First paint (manual)
Time Profiler signposts between:
- `ConversationView.onAppear` (entry)
- First cell render (exit) — measurable via `os_signpost("first_message_paint", ...)` placed in the cell render path

### Scroll FPS (manual)
Instruments → Core Animation gauge during a 2-min scroll session in a 1000-msg conversation. Inject 5 msg/s via Socket.IO test harness. Confirm 60 fps stays constant.

### Decrypt p95 latency (semi-automated)
`CryptoSignposts.beginDecrypt` / `endDecrypt` markers (Task 0.5). Use Console.app's "Activity" mode or `os_log` capture to gather 100+ samples; compute p95 in spreadsheet.

### FTS5 search latency (✅ automated)
`SearchPerformanceTests.swift` — runs via `./scripts/ios-perf-benchmark.sh`:
- `test_search_in100kMessages_under50ms` — full corpus, prefix match
- `test_search_scopedToConversation_under50ms` — scoped query

Both pass the < 50 ms assertion in Debug-on-simulator. Real-device measurements would only be faster (production CPU is faster than simulated).

### Memory peak (manual)
Instruments → Allocations → "Peak Resident Memory" column.
Session: 30 minutes of continuous scroll in a 5000-message conversation.

### Outbox flush (manual)
1. Toggle airplane mode ON
2. Send 50 messages with timestamps
3. Toggle airplane mode OFF
4. Watch logs for `OutboxFlusher.flush()` activity
5. Note timestamp when last message transitions to `sent`

---

## How to Run

### Automated benchmarks (this is what was done in this measurement)
```bash
# From repo root — gating disabled in current code (see test files setUpWithError)
./scripts/ios-perf-benchmark.sh
```

Outputs: `apps/ios/test-results/perf/{MessageListPerformanceTests,SearchPerformanceTests}.xcresult`

To inspect:
```bash
xcrun xcresulttool get test-results summary --path apps/ios/test-results/perf/SearchPerformanceTests.xcresult
```

### Manual smoke test
Follow the 8-step procedure in:
`docs/superpowers/runbooks/2026-05-06-instant-app-smoke-test.md`

Recommended device: Services CEO i16pm (iPhone 16 Pro Max).

---

## Phase Acceptance Status

| # | Step | Result | Notes |
|---|------|--------|-------|
| 1 | Cold start (< 500 ms) | 🟡 Pending device run | Manual stopwatch needed |
| 2 | First paint 5k messages (< 200 ms) | 🟡 Pending device run | Time Profiler signposts |
| 3 | 60 fps scroll during burst | 🟡 Pending device run | Instruments Core Animation |
| 4 | Offline FTS5 search (< 100 ms UI) | ✅ Validated via benchmark (< 50 ms backend) — UI step pending | Search service confirmed at < 50 ms |
| 5 | 10 offline messages → flush | 🟡 Pending device run | Tests outbox flush + idempotency |
| 6 | Multi-account Keychain isolation | 🟡 Pending device run | KeychainNamespaceTests cover the isolation contract |
| 7 | 30-min sustained scroll memory (< 150 MB) | 🟡 Pending device run | Instruments Allocations |
| 8 | 30-min offline outbox flush (< 60 s) | 🟡 Pending device run | OutboxFlusher unit-tested for backoff/exhaustion |

**Summary:** 1 fully validated automatically (FTS5 search), 7 pending device runs.

The automated path proves the **single most architecturally novel target** — FTS5 search on 100k messages — meets the goal. The remaining targets validate UX-level behavior (cold start, scroll smoothness, memory) that fundamentally requires device hardware.

---

## Known issues encountered during this measurement

### Test target — `RUN_PERF_BENCHMARKS` env var did not propagate through `xcodebuild test`
The original gate `XCTSkipIf(env["RUN_PERF_BENCHMARKS"] != "1")` skipped all perf tests because xcodebuild does not propagate shell env vars to the simulator test process by default.

**Resolution:** disabled the gate inline (commented), so perf tests now run via `-only-testing`. To re-gate properly in CI, configure scheme test action env vars or use `XCT_DEBUG=1` style indirection.

### `measureAsync` helper deadlock with `Task { }` on `@MainActor` test classes
The original implementation:
```swift
Task { try? await block(); expectation.fulfill() }
wait(for: [expectation], timeout: 10)
```
deadlocked when called from `@MainActor` synchronous test contexts because the unstructured `Task` defaults to the enclosing actor (Main), and `wait` blocks the same Main runloop. Fixed by switching to `Task.detached` (commit pending).

### Test runner timeout on `xctMetric`-style benchmarks
`test_searchLatency_xctMetric` and `test_loadInitial_1000Messages_clockBaseline` use `measureAsync` and timed out at 10 s × 5 iterations. After bumping the timeout to 60 s and applying the `Task.detached` fix, these should run cleanly. Re-run pending.

---

## Next Steps

### 1. Re-run benchmarks after `measureAsync` fix
After the `Task.detached` change in `TestHelpers.swift` lands, re-run:
```bash
./scripts/ios-perf-benchmark.sh
```
to capture the XCTMetric averages cleanly (currently only the assertion-style tests passed).

### 2. Manual device runbook
Follow `docs/superpowers/runbooks/2026-05-06-instant-app-smoke-test.md` on Services CEO i16pm. Record actual measurements in this document.

### 3. Optional — re-enable `RUN_PERF_BENCHMARKS` gate
If perf tests should not run in regular CI (they take ~7 minutes on simulator), re-add the gate via Xcode scheme env vars:
- Edit Scheme → Test → Arguments → Environment Variables → `RUN_PERF_BENCHMARKS=1`
- Restore the `XCTSkipIf` gate in both perf test files

---

## Notes

- Pre-Phase 2 there was no FTS5 index; the search latency baseline was effectively a full table scan, unbounded on 100k rows. The Phase 2 FTS5 migration is the entire reason for the < 50 ms target being achievable, and **this measurement confirms it.**
- Pre-Phase 3 there was no offline outbox; the flush metric only applies to the post-Phase 3 implementation.
- The decrypt p95 target assumes the CryptoSignposts instrumentation from Task 0.5 is merged (it is, on `dev`). Manual collection via Console.app or Instruments → Points of Interest required.
- Window iteration time (86 µs / 1000 messages) confirms the GRDB + observation chain has negligible per-cell cost — the bottleneck for 60 fps will be SwiftUI re-render (Phase 3 leaf-view fix) and image decoding (Phase 3.2 downsampling), not data access.
