---
"@meeshy/gateway": patch
---

fix(realtime): bound the participant-id cache and reset the typing throttle on stop

Two correctness/reliability fixes in the Socket.IO realtime handlers:

- **`MessageHandler.participantIdCache` was an unbounded `Map`.** Its 5-minute TTL was only ever checked lazily on read, so a one-shot `(user, conversation)` sender that never sends in that conversation again — and never leaves it — left an entry that was never read again and therefore never evicted. On a long-lived gateway the map grew by one entry for every distinct `(user, conversation)` pair that has ever sent a message: steady, unbounded heap growth. It now uses the shared `BoundedTtlCache` (hard size cap + lazy/bulk TTL eviction), matching `StatusHandler.identityCache`, so memory is bounded regardless of read patterns.

- **`typing:stop` did not reset the `typing:start` throttle.** `handleTypingStart` throttles re-emits to once per 2s per `(user, conversation)`; `handleTypingStop` cleared the tracking but left the throttle timestamp in place. A user who paused (client sends `typing:stop`) and resumed typing inside the 2s window had the new `typing:start` swallowed, so peers saw no indicator even though the user was actively typing. `handleTypingStop` now clears the throttle entry so a restart begins a fresh burst and emits immediately.

Also adds `BoundedTtlCache.keys()` for prefix-scoped invalidation.
