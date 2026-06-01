# Lessons

## 2026-04-17 — iOS background stability

1. **`didReceiveRemoteNotification` must await async work before the completion handler.** Calling `completionHandler(.newData)` synchronously before async subtasks finish lets iOS suspend the process mid-flight. Wrap in `beginBackgroundTask` + a tiny actor that guarantees the handler fires exactly once whether the happy path or the OS expiration wins.

2. **Delivery receipts belong in the push path, not the socket path alone.** Sender-side double-check cursors depend on the recipient calling `markAsReceived`. If the recipient never opens the app, the socket path never fires. The APN pipeline is the correct hook — emit `ack(conversationId:)` from `didReceiveRemoteNotification`.

3. **`fatalError` in singleton init crashes the app on disk-full / permission-change / cold wake from push.** Return a degraded in-memory fallback and expose an `isEphemeral` flag so callers can decide whether to persist. Never `fatalError` on initialisation paths that run during background wakes.

4. **Decryption can return an empty array — `msgArray[0]` is a crash.** When mutating via `decryptMessagesIfNeeded(&:)`, guard `first` before indexing. Force-unwrap on collections that were mutated by background tasks is a guaranteed crash in low-memory scenarios.

5. **`AVAudioSession` interruption / route-change observers must be installed exactly once, centrally.** Four players configuring the session independently with no observer leaves the app in a bad state after a phone call or AirPods disconnect. Centralise in a single actor and fan out events via a `PassthroughSubject`.

6. **`willResignActive` is not enough for cache flushes.** It fires on control-center pulls and transient hand-offs, but NOT reliably on full background → terminate. Also observe `didEnterBackground` and `willTerminate` with a synchronous semaphore wait (≤4s) on terminate.

7. **Timer.scheduledTimer on singletons with `[weak self]` closures never fires `deinit`.** Singletons live forever, so weak captures don't break the retain cycle — but the timer keeps firing in background. Explicitly stop timers in `prepareForBackground()` and rearm in `resumeFromBackground()`.

8. **`MKLocalSearch.start { ... }` strongly retains its closure.** Without `[weak self]`, a dismissed picker leaks, and worse, the completion task may write into a zombie view model. Apple search APIs should always be captured weakly.

9. **Route tasks in `@MainActor { Task { await ... } }` through a small actor state machine when multiple exit points exist.** Otherwise a race between happy-path completion and OS expiration leads to double-call of `completionHandler`.

10. **Backgrounding is a single state transition — orchestrate it.** Multiple `.background` handlers scattered across the app invariably drift out of sync. A single `BackgroundTransitionCoordinator` with explicit ordering (players → cache → push → sockets → BG tasks → widgets) makes the lifecycle auditable.

## Prod debugging — agent/translator (2026-06-01)

11. **Prefer a maintained library over a hand-rolled parser, even if absent from node_modules.** "Pas de lib dispo" is not a reason to reinvent — `npm view <pkg>` first. For repairing loose LLM JSON, `jsonrepair` (CJS+ESM, zero-dep) handles trailing commas, single quotes, unquoted keys AND truncation (LLM hitting maxTokens) — a custom scanner missed truncation entirely. Reuse > creation (matches the standing feedback memory).

12. **Never label a behavior "by design" without proving it from the product intent.** Claimed the agent's reactions-only output in dead conversations was "expected" — wrong. The Animator's whole purpose is to revive dead conversations by impersonating multiple users. The burst mechanism existed in the prompt but was never wired to low activity. Verify intent (CLAUDE.md, product docs) before excusing a gap as design.

13. **A hung process with thread-count 1 + ~0% CPU + frozen logs = deadlock, not load.** The translator held a global `threading.Lock` (synthesis serialization) across a never-returning `_model.generate()`; all 37 workers piled behind it. Fix: per-call `asyncio.wait_for` watchdog so a stuck synthesis exits the `with lock:` and frees everyone. Caveat: `run_in_executor` threads can't be truly killed — the watchdog breaks the deadlock but leaks the stuck thread (real fix = killable subprocess).

14. **Rapid sequential pushes to main can leave service images unbuilt.** docker.yml is change-detecting (builds only services whose files changed) AND has a concurrency group that cancels in-progress runs when a newer push arrives. A burst of small per-service commits → each new push cancels the previous run mid-build → the earlier commit's service image is never pushed (observed: fix(prod) built only `agent`, gateway/translator/web cancelled). After a burst of pushes, ALWAYS verify per-service build success (`gh run view <id> --json jobs`) and, if any were cancelled, dispatch a full rebuild: `gh workflow run docker.yml -f services=all`. Better: batch related fixes into ONE commit, or push, wait for the build, then push again.
