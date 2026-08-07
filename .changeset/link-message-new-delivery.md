---
"@meeshy/web": patch
---

Share-link messages now reach the web message cache in real time

`handleLinkMessageNew` opens on `if (!linkConvId) return` — and the gateway never
put a `conversationId` in the payload, so every `link:message:new` was dropped on
the first line. This is the ONLY event the two share-link REST routes emit (there
is no companion `message:new`), which means no message sent through a share link
— by an anonymous participant or a registered one — ever appeared live for anyone
else in the conversation. It surfaced only on a manual refresh, and with
`staleTime: Infinity`, often not even then.

The handler also now carries the `landedInCache` fallback `handleNewMessage`
documents: when no cache entry exists yet (initial fetch in flight, conversation
never opened this session) the updater bails out on `if (!old) return old` and the
message would be lost for good, since nothing re-reads the server. The query is
invalidated instead.
