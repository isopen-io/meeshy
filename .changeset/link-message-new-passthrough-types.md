---
"@meeshy/web": patch
---

Propagate `LinkMessageNewEventData` through the socket pass-throughs

`messaging.service` types its `link:message:new` listeners with the shared
`LinkMessageNewEventData`, but the orchestrator and the socket facade re-declared
`{ message: Record<string, unknown> }` in their pure pass-throughs, re-widening the
type on the way to the handler. The payload contract now requires `id`,
`conversationId` and `senderId`; without this, that hardening stops at
`messaging.service` and never reaches the consumer that depends on it.
