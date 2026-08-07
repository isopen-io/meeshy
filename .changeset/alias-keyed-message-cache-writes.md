---
"@meeshy/web": patch
---

Realtime cache routing: every message write now reaches the alias-keyed cache entry

A conversation can be cached under two keys at once — its resolved ObjectId
(`/conversations/:id`) and its identifier, since the home page mounts the global
conversation as `"meeshy"`. Socket payloads only ever carry the ObjectId, so six
handlers writing to the single key `queryKeys.messages.infinite(objectId)`
silently no-op'd on the alias entry, and with `staleTime: Infinity` nothing
re-read it: the home-page bubble stayed frozen on pre-event state until a manual
refresh.

The six now route through `messageCacheKeysFor`, the same helper the new-message,
edit, translation and transcription handlers already use:

- `audio:translation-ready` — translated audio never appeared on the home page
- `message:attachment-updated` — async attachment enrichment was lost
- `attachment:status-updated` — listened/watched/viewed/downloaded marks were lost
- `message:pinned` / `message:unpinned` — pin state diverged between the two views
- `link:message:new` — link-preview messages never appeared on the home page

`attachment:status-updated` additionally stamps its consumption timestamp once per
event rather than once per cache entry, so a single consumption cannot land two
different times now that the write fans out, and an unrecognised action is rejected
before the field name is used as a computed key.
