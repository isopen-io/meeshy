# Instant App Foundation — Final Smoke Test Runbook

**Date:** 2026-05-06
**Phase:** 4 — Validation & Benchmarks
**Branch:** `dev` (post Phase 0–3 merges)

---

## Pre-requisites

- iOS build of latest `dev` (post-Phase 3 merge)
- iPhone SE 2 simulator (UDID: 30BFD3A6-C80B-489D-825E-5D14D6FCCAB5) AND a real iPhone 8 if available
- Test account with 500+ conversations, 5000+ messages, 100k cached messages
- Charles Proxy or Network Link Conditioner available for network simulation
- Instruments app (included in Xcode) for memory / FPS monitoring

---

## Targets (from plan, lines 11–15)

| Metric | Target |
|--------|--------|
| Scroll FPS — iPhone SE 2, 1000 msgs, 5 msg/s | 60 fps sustained |
| Cold start to interactive list (500 conversations cached) | < 500 ms |
| Airplane mode: open + read + search + compose | All functional |
| Reconnect after 30 min offline — outbox flush | No message loss; server-side dedup OK |

---

## Procedure

### Step 1 — Cold start (target < 500 ms)

1. Force-quit the app
2. Tap the icon; simultaneously start a stopwatch (or use Xcode Instruments → Time Profiler)
3. Stop when the conversation list is interactive (you can scroll or tap a row)
4. Record time

**Pass criterion:** < 500 ms with a warm Keychain (user already logged in).

---

### Step 2 — Open conversation with 5000 messages (target < 200 ms first paint)

1. Tap a conversation known to have 5000+ messages
2. Measure time from tap to first visible cell render (use Signposts in Time Profiler if precise measurement needed)
3. Verify: no flash of the LazyVStack fallback (Phase 1 fix)

**Pass criterion:** < 200 ms first paint.

---

### Step 3 — Receive burst of 20 messages (target: 60 fps scroll)

1. Open Charles Proxy or a test harness to emit 20 `message:new` Socket.IO events at 100 ms intervals into the active conversation
2. Scroll continuously during the burst
3. Monitor FPS via Core Animation instrument or the Xcode FPS gauge

**Verify:**
- 60 fps scroll sticky-to-bottom; no frame drops visible
- Typing indicator animation continues smoothly during the burst

**Pass criterion:** 60 fps sustained; no jank observable.

---

### Step 4 — Airplane mode — search 100k messages (target < 100 ms results)

1. Toggle airplane mode ON
2. Open Global Search → tap message search tab
3. Type "hello"
4. Verify FTS5 results appear immediately

**Pass criterion:** Results appear in < 100 ms (no spinner, no loading state).

---

### Step 5 — Compose 10 messages while offline

1. Stay in airplane mode (from step 4)
2. Send 10 messages with varied content (text, a reply, an attachment)
3. Verify: each message appears in the bubble list as `pending` instantly (optimistic update)
4. Toggle airplane mode OFF
5. Wait and observe state transitions

**Verify:**
- All 10 messages flush within 5 s after reconnect
- State transitions: `pending` → `sent` visible in UI
- No duplicate messages in the bubble list
- No duplicate messages from the receiver's perspective (server-side dedup via `localId`)

**Pass criterion:** All 10 messages sent, no loss, no duplicates.

---

### Step 6 — Multi-account login (Phase 3 Keychain namespace)

1. Logout from current account
2. Login as User A; send 5 messages to a conversation
3. Logout from User A
4. Login as User B
5. Attempt to access User A's conversation

**Verify:**
- User B cannot see User A's E2E session keys in Keychain (namespace isolation)
- User B cannot decrypt messages sent to User A's conversations
- No Keychain key bleed between accounts

**Pass criterion:** Session key isolation confirmed; cross-account decryption fails gracefully.

---

### Step 7 — 30-minute sustained scroll (target < 150 MB memory)

1. Open a long conversation
2. Scroll up/down continuously for 30 minutes
3. Monitor memory in Instruments → Allocations

**Verify:**
- Peak resident memory stays under 150 MB
- No crashes or OOM terminations
- Scroll remains smooth throughout (no progressive degradation)

**Pass criterion:** Memory < 150 MB peak; zero crashes.

---

### Step 8 — Reconnect after 30-min offline (outbox flush < 1 min for 50 messages)

1. Toggle airplane mode ON
2. Send 50 messages over the offline period (can be spread across 30 min or batched at the end)
3. Note timestamp of last sent message
4. Toggle airplane mode OFF
5. Note timestamp when last message shows `sent` state

**Verify:**
- All 50 messages flush within 1 minute of reconnect
- Status transitions: `pending` → `sent` for all 50
- No message lost; no duplicates on receiver side

**Pass criterion:** Full outbox flush within 60 s; no loss; no duplicates.

---

## Pass / Fail Summary

| Step | Description | Result | Notes |
|------|-------------|--------|-------|
| 1 | Cold start | | |
| 2 | Conversation first paint | | |
| 3 | 20-msg burst scroll FPS | | |
| 4 | Offline search latency | | |
| 5 | 10 offline messages → flush | | |
| 6 | Multi-account key isolation | | |
| 7 | 30-min sustained scroll memory | | |
| 8 | 30-min offline outbox flush | | |

**Phase passes only when all 8 steps are marked PASS within tolerance.**

---

## If a Target is Missed

1. Re-run the failing step with Time Profiler or Core Animation Instruments attached
2. Identify the bottleneck function / layer
3. Open a new ticket on the relevant Phase (0–3)
4. Compare the measured value against the baseline in `docs/superpowers/research/2026-05-06-instant-app-final-metrics.md`
5. Do not close Phase 4 until all targets are green

---

## Automated Benchmarks

For the measurable targets (scroll cost, search latency), automated XCTest benchmarks supplement this manual runbook:

```bash
./scripts/ios-perf-benchmark.sh
```

See `apps/ios/MeeshyTests/Performance/` for:
- `MessageListPerformanceTests.swift` — 1000-message load & window iteration benchmarks
- `SearchPerformanceTests.swift` — FTS5 search across 100k messages, target < 50 ms
