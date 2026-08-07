---
"@meeshy/shared": patch
---

`link:message:new` now carries the routing keys its consumers need

Socket.IO does not transport the room name to the receiving side, so the payload
is the only routing a client has. `LinkMessageNewEventData.message` was typed
`Record<string, unknown>` — a shape that expressed no contract at all — and the
gateway built it without `conversationId` or `senderId`. Both are now required by
the type and emitted by both share-link routes.
