---
"@meeshy/web": patch
---

A failed message now actually spends its three retries instead of stopping after one

`useAutoRetryFailedMessages` advertises a budget of `MAX_RETRY_COUNT = 3`
automatic attempts, paced `RETRY_DELAY_MS` apart. It could only ever spend one.

The flush is an effect keyed on `[isReady, rearm]`. It takes a snapshot of the
queue, sweeps it once, and re-arms itself only when it stopped *early* — a
readiness flap mid-flush. A sweep that ran to completion with messages still
queued re-armed nothing, and `isReady` was already `true`, so no dependency
would ever change again. On a connection that never drops, a message whose send
failed for a transient reason got exactly one retry and then sat in the failed
queue untouched: not delivered, not marked exhausted, `retryCount` stuck at 1,
its remaining budget unspendable. The only way to buy a second attempt was to
lose the connection and get it back — the one condition the feature exists to
survive without.

The same gap stranded work queued *behind* an in-flight sweep: a message that
failed while the flush was running was not in that sweep's snapshot, and nothing
scheduled another one.

A sweep now also re-arms when it drained its snapshot but the store still owes
attempts. This cannot spin: every sweep increments `retryCount` for each message
it attempts, so each pass strictly shrinks the remaining budget and the
re-arm condition goes false after `MAX_RETRY_COUNT` passes at the latest —
termination is driven by the budget, not by wall time.

The existing suite could not see any of this: every test drove the hook with a
frozen store whose actions recorded calls without changing `failedMessages`, so
a second sweep was indistinguishable from no second sweep. The new tests use a
store that applies its updates the way the real zustand store does.
