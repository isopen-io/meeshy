---
"@meeshy/web": patch
---

Route the anonymous sender's REST fallback to the share-link endpoint

When a `message:send` ack comes back as an error (not a timeout) and the socket
is still connected, `MessagingService` retries over REST. It always retried on
`POST /conversations/:id/messages`, which authenticates on a JWT. An anonymous
share-link participant has no JWT — only an `anon_*` session token — so that
retry answered 401 for every one of them: the recovery path could not recover
anything, and the message was lost with no second chance.

Their endpoint already existed (`POST /links/:identifier/messages`, authenticated
by `X-Session-Token`), and so did its client wrapper — `AnonymousChatService.sendMessage`,
reachable from nothing since its only caller was a dead hook. The fallback now
asks `anonymousChatService.canSendViaLink()` which pipe to take; registered
senders keep the conversations route unchanged.

Two things the wiring had to get right, or the fix would only trade a lost
message for a doubled one:

- The caller's `clientMessageId` travels with the request instead of the service
  minting a fresh one. It is the only key that ties the server message back to
  the optimistic row already on screen.
- `AnonymousChatService.sendMessage` now declares what the route actually
  returns — `{ messageId, message }`, not `Message`. The old signature was a
  lie its single caller papered over with a double cast reading both shapes.

`hooks/use-anonymous-messages.ts` is removed: nothing imported it, and it was
where that cast lived.
