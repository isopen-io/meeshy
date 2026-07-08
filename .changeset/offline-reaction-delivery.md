---
"@meeshy/gateway": patch
"@meeshy/shared": patch
---

Offline delivery queue for reactions — a reaction added or removed while a participant is offline is now replayed on reconnect, closing the gap that only covered message edits/deletes.

Gateway: `ReactionHandler` enqueues `reaction-added`/`reaction-removed` events for offline conversation participants (excluding the reacting actor and every online peer), mirroring the existing `MessageHandler` edit/delete enqueue. On reconnect `MeeshySocketIOManager` drains these entries and replays them as `reaction:added` / `reaction:removed`, so an offline peer's cached reaction counts converge instead of staying stale until an unrelated full refetch. The single-reaction swap path also queues the replaced emoji's removal. Reaction entries never carry a delivery receipt.

Shared: `QueuedMessagePayload.eventType` gains `'reaction-added'` and `'reaction-removed'`.
