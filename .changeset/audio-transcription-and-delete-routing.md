---
"@meeshy/web": patch
---

Realtime cache routing: transcription-ready and message deletes now reach the conversation that owns them

- `audio:transcription-ready` was routed to the hook's active conversation and dropped
  entirely on the conversation-list view, so a voice note transcribed while reading
  another chat never reached its cache. It is now routed by the event's own
  `conversationId`, attaches to the attachment named by `attachmentId` (instead of the
  first audio attachment, which mis-attributed every transcription on a multi-voice-note
  message), and reads the language from `transcription.language` (the payload has no
  root-level `language`, so it was always `undefined`).
- `message:deleted` was applied only to the active conversation, leaving deletes in every
  other conversation unapplied. The message is now located by id across all cached message
  lists, including identifier-keyed alias entries, and the conversation-list preview
  advances using the conversation the deleted message actually belonged to.
