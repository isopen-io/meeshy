# Comment Media (image/video/audio) + Unified Comment Display — iOS full-stack

## Architecture decision
Comment media **reuses the `PostMedia` model** (nullable FK pattern, same structure,
same TUS upload, same audio pipeline). A comment owns ONE `PostMedia` linked via a new
nullable `commentId`. Audio pipeline reuses `PostAudioService` + ZMQ `postId`/`postMediaId`
routing, disambiguated at the handler by `PostMedia.commentId` (zero translator/Python change).

## Layer 1 — Prisma schema (packages/shared/prisma/schema.prisma)
- [ ] `PostMedia`: add `commentId String? @db.ObjectId` + relation `comment PostComment?` + index `[commentId, order]`
- [ ] `PostComment`: add `media PostMedia[] @relation("CommentMedia")`
- [ ] Regenerate Prisma client

## Layer 2 — Shared types (packages/shared/types)
- [ ] Socket event `COMMENT_MEDIA_UPDATED: 'comment:media-updated'` + payload type
- [ ] Comment type carries `media`

## Layer 3 — Gateway (services/gateway)
- [ ] `CreateCommentSchema`: add `mediaId?` (single) + `mobileTranscription?`; relax `content` min when media present
- [ ] TUS handler: accept `uploadcontext === 'comment'` → PostMedia (postId=null pending)
- [ ] `PostCommentService.addComment`: link mediaId via `commentId`, persist mobileTranscription, return media; comment includes select media (getComments/getReplies/addComment)
- [ ] comments route: trigger `processPostAudio` for audio comment media; broadcast comment with media
- [ ] `PostAudioService`: after persist, branch on `media.commentId` → broadcast `comment:media-updated` (else post:updated)
- [ ] `SocialEventsHandler.broadcastCommentMediaUpdated`
- [ ] Tests (RED→GREEN) for media linking + audio routing branch

## Layer 4 — SDK (packages/MeeshySDK)
- [ ] `APIPostComment.media: [APIPostMedia]?`
- [ ] `FeedComment` media field + `CommentRecord` persistence
- [ ] `PostService.addComment(mediaId:, mobileTranscription:)` + `CreateCommentRequest`
- [ ] `SocialSocketManager`: `comment:media-updated` publisher
- [ ] SDK tests (decode roundtrip)

## Layer 5 — iOS app (apps/ios)
- [ ] Unified comment row component: inline media (reuse BubbleAttachmentView/media viewers) + fullscreen, likes, language flags, reply/replies/voir
- [ ] Comment composer: enable single media (photo/camera/file/voice) for `.comment` mode; TUS upload (uploadcontext=comment); send via addComment(mediaId)
- [ ] Wire unified component into FeedCommentsSheet + other comment surfaces
- [ ] socket comment:media-updated → update cached comment media
- [ ] iOS tests

## Notes
- User will provide a branch later for keyboard/composer updates → realign callbacks then.
- Single media per comment (requirement: "un et unique média").

## Review
(to fill at end)
