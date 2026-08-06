---
"@meeshy/gateway": patch
---

fix(gateway/zmq): a malformed translation_completed frame no longer poisons the
(taskId, targetLanguage) dedup slot

`ZmqMessageHandler.handleTranslationCompleted` stamped `resultKey` as processed
*before* validating the payload. A malformed frame (missing `result` /
`result.messageId`) therefore consumed the dedup slot and early-returned; the
translator's at-least-once re-delivery of the valid result for the same
`taskId+targetLanguage` was then dropped by the `has(resultKey)` guard, leaving
the recipient stranded on the untranslated original (Prisme violation). The
dedup `add` + LRU trim now run only after validation succeeds, so only accepted
events consume a slot.
