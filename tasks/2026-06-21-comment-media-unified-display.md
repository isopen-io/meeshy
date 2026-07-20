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
- [x] CommentMediaView: inline image/video/audio + fullscreen (reuse ProgressiveCachedImage/MeeshyVideoPlayer/AudioPlayerView/ConversationMediaGalleryView) + audio Prisme
- [x] CommentRowView renders comment.media.first inline (used by FeedCommentsSheet AND PostDetailView via ThreadedCommentSection → unified)
- [x] Send pipeline: CommentMediaUploader (TUS uploadcontext=comment) + FeedCommentsSheet.sendComment(text:media:) optimistic + addComment(mediaId:mobileTranscription:)
- [x] socket comment:media-updated → applyCommentMediaUpdate (FeedCommentsSheet + PostDetailViewModel)
- [x] FeedComment.media flows through all mappers (toFeedPost, loadReplies, commentAdded socket, PostDetailViewModel)
- [x] PostServiceProviding convenience extension (text-only addComment) + mocks updated
- [ ] FOLLOW-UP (user's keyboard/composer branch): wire composer media-attach UI → sendComment(media:)
- [ ] FOLLOW-UP: StoryCommentRowView media (separate story-overlay component)
- [ ] FOLLOW-UP: CommentRecord GRDB media column (cold-start persistence)
- [ ] iOS tests (cannot compile Swift in this Linux env — pending CI/macOS)

## Notes
- User will provide a branch later for keyboard/composer updates → realign callbacks then.
- Single media per comment (requirement: "un et unique média").

## Review

### Livré (3 commits poussés sur claude/dazzling-rubin-5ih1zt)
1. **Backend + SDK foundation** — Prisma (PostMedia.commentId + PostComment.media),
   gateway (schema mediaId/mobileTranscription, TUS uploadcontext=comment, addComment
   link + audio trigger, PostAudioService owner disambiguation, comment:media-updated),
   SDK (APIPostComment.media, FeedComment.media, addComment(mediaId:), socket publisher).
2. **iOS** — CommentMediaView (inline + fullscreen image/video/audio Prisme),
   CommentRowView media (unifie FeedCommentsSheet + PostDetailView via ThreadedCommentSection),
   send pipeline (CommentMediaUploader + sendComment(text:media:)), realtime updates.
3. **Tests** — gateway suite verte (6789 pass, 0 fail), 3 nouveaux tests media-linking.

### Vérifié
- Gateway: `tsc --noEmit` 0 erreur ; `jest` 224 suites / 6789 tests OK.
- Shared: `npm run build` OK.
- Prisma: schema validé + client régénéré (commentId présent).

### NON vérifiable dans cet env (Linux, pas de toolchain Swift)
- Compilation SDK/iOS — code écrit selon les patterns existants, à builder via
  `./apps/ios/meeshy.sh build` (macOS) / CI.

### À faire par l'utilisateur (branche clavier/composer annoncée)
- Brancher l'UI d'attachement média du composer commentaire → `FeedCommentsSheet.sendComment(text:media:)`
  en passant un `PendingCommentMedia` (le point d'entrée est prêt).

### Follow-ups optionnels
- StoryCommentRowView (média des commentaires de stories — composant overlay distinct).
- CommentRecord GRDB : colonne média pour persistance cold-start (sinon re-fetch au load).
