# Instant App Foundation — Final Metrics

**Date:** 2026-05-06
**Branch:** `dev` (post Phase 0–3 merges)

This document is the source of truth for Phase 4 acceptance.
Each "TBD" must be filled with measured values before the Phase 0–3 work is considered shipped.

---

## Targets vs Actuals

| Metric | Target | Phase 0 baseline | Post-Phase 3 actual |
|--------|--------|-----------------|---------------------|
| Cold start to interactive (500 conversations cached) | < 500 ms | TBD (Phase 0 closeout) | TBD (run smoke test step 1) |
| Conversation first paint (5k messages) | < 200 ms | TBD | TBD (smoke test step 2) |
| Scroll FPS (1000 msgs, 5 msg/s burst) | 60 fps | TBD | TBD (smoke test step 3) |
| Decrypt p95 latency | < 10 ms | TBD (CryptoSignposts baseline, Task 0.5) | TBD |
| FTS5 search latency — 100k messages | < 50 ms | n/a (FTS5 did not exist pre-Phase 2) | TBD (SearchPerformanceTests) |
| FTS5 search latency — scoped to conversation | < 50 ms | n/a | TBD (SearchPerformanceTests) |
| Offline search latency (airplane mode) | < 100 ms | n/a | TBD (smoke test step 4) |
| Memory peak — 30-min sustained scroll | < 150 MB | TBD | TBD (smoke test step 7) |
| Outbox flush after 30 min offline (50 messages) | < 60 s | n/a (outbox did not exist pre-Phase 3) | TBD (smoke test step 8) |
| Offline compose — optimistic UI latency | < 16 ms | n/a | TBD (smoke test step 5) |

---

## Methodology

### Cold start
Stopwatch from icon-tap to scrollable conversation list interaction.
Alternatively: Instruments → Time Profiler → `signpost` from `MeeshyApp.init` to first `LazyVStack` or `UICollectionView` render.

### First paint
Instruments → Signposts: `ConversationView.onAppear` → first cell displayed.
Target: the `MessageStore.loadInitial()` path, not a network call.

### Scroll FPS
Instruments → Core Animation / FPS Gauge.
Scenario: open 1000-message conversation, trigger 5 msg/s via Socket.IO injection, scroll continuously for 2 minutes.

### Decrypt p95 latency
`CryptoSignposts.beginDecrypt` / `endDecrypt` markers (added in Task 0.5).
Collect at least 100 samples during a normal conversation session.
p95 = 95th percentile of elapsed intervals.

### FTS5 search latency
Automated: `XCTClockMetric` in `SearchPerformanceTests` (5 iterations).
Manual: stopwatch from search query commit to first result row rendered.

### Memory peak
Instruments → Allocations → "Peak Resident Memory" column.
Session: 30 minutes of continuous scroll in a 5000-message conversation.

### Outbox flush
Log timestamps from `OutboxFlusher.flush()` start (first item dequeued) to last record deletion confirmation.
Scenario: 50 messages queued during 30-min airplane mode, then airplane off.

---

## How to Run

### Automated benchmarks
```bash
# From repo root — requires RUN_PERF_BENCHMARKS=1
./scripts/ios-perf-benchmark.sh
```

Tests run: `MessageListPerformanceTests`, `SearchPerformanceTests`
Results: `apps/ios/test-results/perf/*.xcresult`

### Manual smoke test
Follow the 8-step procedure in:
`docs/superpowers/runbooks/2026-05-06-instant-app-smoke-test.md`

---

## Phase Acceptance Criteria

Phase 4 (and by extension Phase 0–3) is **ACCEPTED** when:
1. All 8 smoke test steps are PASS
2. `SearchPerformanceTests` passes with < 50 ms measured latency
3. `MessageListPerformanceTests` establishes a stable baseline (no regressions vs prior run)
4. All TBD cells in the table above are filled

Phase 4 is **NOT ACCEPTED** if any target is missed. Open a regression ticket on the relevant Phase before closing.

---

## Notes

- Pre-Phase 2 there was no FTS5 index; the search latency baseline is therefore "full table scan" which is unbounded on 100k rows. The Phase 2 FTS5 migration is the entire reason for the < 50 ms target being achievable.
- Pre-Phase 3 there was no offline outbox; the flush metric only applies to the post-Phase 3 implementation.
- The decrypt p95 target assumes the CryptoSignposts instrumentation from Task 0.5 is merged. If it was deferred, measure manually with a Time Profiler custom interval.
