# Attachment Cache-at-Send Design

## Problem
When a user sends a message with attachments, the attachment does not appear immediately. The flow is:
1. TUS upload (file sent to server)
2. Local temp file deleted
3. Optimistic message inserted with empty attachments
4. Socket `message:new` arrives with attachment URLs
5. UI renders attachment component which downloads the file from server

The user re-downloads their own file that they just uploaded.

## Solution
Cache media data locally at upload time + include attachments in the optimistic message.

## Modified Flow
```
User records/selects media
  -> TUS upload -> TusUploadResult { id, fileUrl, thumbnailUrl }
  -> [NEW] Read temp file data BEFORE deleting
  -> [NEW] MediaCacheManager.store(data, for: tusResult.fileUrl)
  -> [NEW] MediaCacheManager.store(thumbData, for: tusResult.thumbnailUrl) if image/video
  -> Delete temp file
  -> [NEW] Build MeeshyMessageAttachment from TusUploadResult
  -> viewModel.sendMessage(content:, attachmentIds:, localAttachments:)
  -> [MODIFIED] Optimistic message includes localAttachments
  -> REST response -> replace temp ID, KEEP attachments
  -> Socket message:new -> URLs match -> cache hit -> 0 download
```

## Files to Modify

### 1. ConversationView+AttachmentHandlers.swift
- After each `uploadFile()`, read file data before deleting temp file
- Store in MediaCacheManager with TUS result URLs as keys
- Build array of MeeshyMessageAttachment from TusUploadResult
- Pass localAttachments to viewModel.sendMessage()

### 2. ConversationViewModel.swift - sendMessage()
- Add `localAttachments: [MeeshyMessageAttachment]` parameter
- Optimistic message includes these attachments instead of empty array
- After REST response: keep attachments when replacing temp -> real ID

### 3. ConversationSocketHandler.swift
- Existing logic already handles this: only replaces if local attachments are empty
- No change needed (the condition `delegate.messages[idx].attachments.isEmpty` prevents overwrite)

## URL Matching
TUS upload returns full absolute URLs (e.g. `https://gate.meeshy.me/api/v1/attachments/file/2026/03/...`).
The same URLs are stored in MongoDB and broadcast in `message:new` unchanged.
MediaCacheManager keys by djb2 hash of URL string -> guaranteed cache hit.

## Edge Cases
- Upload fails: no cache, no optimistic attachment -> existing error handling
- Socket arrives before REST: temp_xxx ID won't match -> socket treats as new message, REST replacement corrects
- All attachment types: audio, images, videos, documents all use same TUS pipeline
