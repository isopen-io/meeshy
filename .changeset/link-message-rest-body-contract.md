---
"@meeshy/gateway": patch
---

Share-link send routes now return the whole message to its author, not a truncated shell

The 201 body of `POST /links/:identifier/messages` and `.../messages/auth` is
serialized by fast-json-stringify, which **silently drops every property the
response schema does not declare** — no error, no log, just an absent key. Both
schemas named five fields while the routes were building fifteen, so eleven were
truncated on every send: `conversationId`, `senderId`, `isEdited`, `editedAt`,
`deletedAt`, `replyToId`, `updatedAt`, the shared `location`, and most of the
sender.

The anonymous route was the worst case: it declared `sender: { type: 'null' }`,
so the participant it had just loaded from Prisma was serialized as literal
`null`. `use-anonymous-messages.ts` reads exactly that field to build the
author's own optimistic message, which therefore never had a sender. A location
shared through a share link came back with no location at all, and neither route
told the author which conversation its message belonged to — the same routing
gap the socket path closed one cycle earlier.

Root cause of the drift: each route built the message payload **twice**, once for
the `link:message:new` emit and once for the REST body. When `conversationId`
and `senderId` were added to the socket literal, the REST twin was left behind.
Both now derive from a single `buildLinkMessagePayload`, so the author and the
other participants receive the same object by construction, and one
`linkMessageSchema` declares that shape for both routes.

`sender` is a `Participant` (id, userId, displayName, avatar, type, language,
nested user), which is what the socket path has always delivered;
`messageSenderSchema` described a user shape a participant cannot satisfy and
only ever let the intersection through. The change is additive on the wire — no
previously present field was removed.
