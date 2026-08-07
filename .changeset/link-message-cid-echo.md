---
"@meeshy/gateway": patch
"@meeshy/shared": patch
---

Echo the clientMessageId back to a share-link message's author, and withhold it from its peers

The share-link send routes persist the `clientMessageId` the client sends
(`message.create` writes it) but never gave it back. Neither the 201 body nor
the `link:message:new` payload carried it, so an author had no way to tie the
server's message to the optimistic row already on screen: reconciliation by cid
is impossible when the cid never comes back, and the message renders twice.

The nominal `message:send` path settled this contract already (Phase 4 §6.2) and
splits it in two: the sender's payload keeps the cid so the by-cid promotion can
run; the peers' broadcast is stripped of it so a third party never learns the
sender's optimistic-id space. The share-link routes now follow the same rule
through the same helper — `buildLinkMessagePayload` builds the author's payload,
`stripClientMessageId` derives the peers'.

Consequently the 201 body and the socket payload are no longer byte-identical;
they are equal modulo `clientMessageId`, which is what the response-contract
test now asserts. `stripClientMessageId` became generic and type-preserving:
returning `Record<string, unknown>` re-widened every typed payload passing
through it, which is exactly what broke the typed `link:message:new` emit whose
contract requires `id`/`conversationId`/`senderId`.

Also declares `clientMessageId` in `sendMessageBodySchema`. Both routes read it
and the Zod schema requires it, but the published request contract omitted its
only mandatory field. Declared without `required`, so Zod stays the single
validator and the error body for a missing cid is unchanged.
