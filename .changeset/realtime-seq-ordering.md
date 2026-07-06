---
"@meeshy/gateway": patch
---

fix(realtime): serialize per-user `_seq` emission so events reach clients in strict allocation order

`emitWithSeq` allocated a monotonic per-user sequence number and then emitted in two steps separated by an `await`, with nothing serializing the two per user. Two concurrent emits for the same user (e.g. a notification fan-out burst) could resolve their DB round-trips out of order and emit `_seq=6` before `_seq=5`, making the client advance `lastSeq` past the earlier event — dropping it as stale or fabricating a phantom gap at reconnect, defeating the exact-gap-detection contract the mechanism exists for. Allocation+emit are now chained on a per-user promise so same-user events emit in strict order while distinct users stay concurrent.

Also fixes `RedisDeliveryQueue.peek(userId, 0)` returning the entire backlog instead of nothing (the `limit` count was coerced as a boolean).
