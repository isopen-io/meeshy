---
"@meeshy/gateway": patch
"@meeshy/shared": patch
"@meeshy/web": patch
---

Share-link messages now reach the client: `link:message:new` carries its `conversationId`

Both routes that broadcast `link:message:new` (`POST /links/:id/messages` and
`POST /links/:id/messages/auth`) assembled the payload field by field and omitted
`conversationId` — even though each builds its room name from that very value.
The web handler routes the cache write on `message.conversationId` and returns
early without it, so **every message posted through a share link was dropped by
the web client**: no bubble, no conversation-list bump, and with
`staleTime: Infinity` nothing re-read it until a manual reload.

Nothing could catch this: `LinkMessageNewEventData.message` was typed
`Record<string, unknown>`, so the omission was invisible to the compiler at both
emit sites.

- Both emitters now include `conversationId`.
- `LinkMessageNewEventData.message` requires `id` and `conversationId`, which
  turns the omission into a compile error at the emit site (verified by mutation).
- The web orchestrator and socket facade stop re-declaring the payload shape in
  their pass-throughs and use the shared type, so the tightened contract actually
  reaches the handler.
