/**
 * Canonical Prisma `select` shapes for the `MessageAttachment` model.
 *
 * Mirrors the discipline established for PostMedia in
 * `services/posts/postIncludes.ts`. Drift between local copies of these
 * shapes is the same class of latent bug that R1-R3 fixed on the Post side:
 * five separate route files (admin/content, links, notifications,
 * messages edit endpoint, threads parent) were silently dropping the two
 * Prisme Linguistique JSON fields (`transcription`, `translations`),
 * leaving multilingual audio/video unrenderable in those contexts.
 *
 * Every gateway endpoint that returns or broadcasts a Message with its
 * attachments MUST select from one of these three named shapes. The
 * regression tests in __tests__/attachmentIncludes.test.ts lock the
 * field membership down.
 *
 * Three canonical shapes:
 *
 *   - attachmentMediaSelect          : render-ready (file + codecs + Prisme).
 *                                      No consumption-tracking, no security flags.
 *                                      For link previews, notifications, admin
 *                                      lists, thread parents, message-list
 *                                      bodies — anywhere the UI renders the
 *                                      attachment but doesn't display its
 *                                      delivery/read counters.
 *
 *   - attachmentFullSelect           : everything in attachmentMediaSelect
 *                                      plus denormalized consumption counters
 *                                      (viewedCount, viewedByAllAt, …),
 *                                      view-once / blur / effects state, and
 *                                      encryption envelope. For message
 *                                      detail / thread parent endpoints that
 *                                      need to render the consumption strip.
 *
 *   - attachmentForwardPreviewSelect : the absolute minimum needed to
 *                                      preview an attachment when it is
 *                                      embedded inside a forwarded message
 *                                      (id + mime + thumbnail + url).
 *
 * Every select is wrapped in `Prisma.validator<Prisma.MessageAttachmentSelect>()`
 * so a typo or a stale field name fails the TypeScript build instead of
 * failing at runtime. The `AttachmentMediaPayload` / `AttachmentFullPayload`
 * / `AttachmentForwardPreviewPayload` type exports give every consumer a
 * fully-typed Prisma result — no `as any` cast.
 */

import { Prisma } from '@meeshy/shared/prisma/client';

/**
 * Render-ready attachment shape.
 *
 * Field set:
 *   File:       id, messageId, fileName, originalName, mimeType, fileSize,
 *               fileUrl, thumbnailUrl, width, height, thumbHash, imageVariants
 *   Audio/video: duration, bitrate, sampleRate, codec, channels, fps,
 *               videoCodec
 *   Document:   pageCount, lineCount
 *   Uploader:   uploadedBy, isAnonymous, createdAt
 *   Misc:       metadata
 *   Prisme:     transcription, translations
 *
 * The Prisme pair is the critical addition vs the pre-R4 local copies in
 * admin/content.ts, routes/links/prisma-queries.ts, notifications-secured.ts,
 * routes/messages.ts (edit endpoint), and routes/conversations/threads.ts —
 * all of which omitted both fields. Clients in those flows could not render
 * multilingual audio/video without re-fetching the attachment from another
 * endpoint.
 */
export const attachmentMediaSelect = Prisma.validator<Prisma.MessageAttachmentSelect>()({
  id: true,
  messageId: true,
  fileName: true,
  originalName: true,
  mimeType: true,
  fileSize: true,
  fileUrl: true,
  thumbnailUrl: true,
  thumbHash: true,
  imageVariants: true,
  width: true,
  height: true,
  duration: true,
  bitrate: true,
  sampleRate: true,
  codec: true,
  channels: true,
  fps: true,
  videoCodec: true,
  pageCount: true,
  lineCount: true,
  metadata: true,
  uploadedBy: true,
  isAnonymous: true,
  createdAt: true,
  transcription: true,
  translations: true,
  // La provenance voyage avec le média : la feuille de partage lit ce drapeau
  // sur l'attachement livré par la LISTE de messages pour décider si publier
  // demande confirmation. Absent d'ici, la garde ne se déclenche jamais.
  capturedInApp: true,
  // BUG2 A' — réactions par-image (agrégées au mapping en reactionSummary + currentUserReactions)
  reactions: { select: { emoji: true, participantId: true } },
});

/**
 * Render-ready + consumption-tracking + security envelope.
 *
 * Used by endpoints that render the consumption strip (viewed-by, listened-by,
 * watched-by) and the view-once / blur / effects UI — typically the
 * message detail endpoint and the thread parent preview.
 *
 * Adds, on top of attachmentMediaSelect:
 *   Forwarding:    forwardedFromAttachmentId, isForwarded
 *   Effects:       isViewOnce, maxViewOnceCount, viewOnceCount,
 *                  isBlurred, effectFlags
 *   Consumption:   deliveredToAllAt, viewedByAllAt, downloadedByAllAt,
 *                  listenedByAllAt, watchedByAllAt,
 *                  viewedCount, downloadedCount, consumedCount
 *   Encryption:    isEncrypted, encryptionMode, encryptionIv,
 *                  encryptionAuthTag
 */
export const attachmentFullSelect = Prisma.validator<Prisma.MessageAttachmentSelect>()({
  ...attachmentMediaSelect,
  forwardedFromAttachmentId: true,
  isForwarded: true,
  isViewOnce: true,
  maxViewOnceCount: true,
  viewOnceCount: true,
  isBlurred: true,
  effectFlags: true,
  deliveredToAllAt: true,
  viewedByAllAt: true,
  downloadedByAllAt: true,
  listenedByAllAt: true,
  watchedByAllAt: true,
  viewedCount: true,
  downloadedCount: true,
  consumedCount: true,
  isEncrypted: true,
  encryptionMode: true,
  encryptionIv: true,
  encryptionAuthTag: true,
});

/**
 * Bare attachment shape for the "this message was forwarded" preview.
 *
 * Used when a forwarded message renders the source attachment as a chip
 * inline. Renderer just needs to know the type (mimeType), show a
 * thumbnail (thumbnailUrl), open the file on tap (fileUrl), and link
 * back to the original (id).
 *
 * Do NOT add transcription/translations here — forward chips don't render
 * playable media; the user taps through to the full message for playback.
 */
export const attachmentForwardPreviewSelect = Prisma.validator<Prisma.MessageAttachmentSelect>()({
  id: true,
  mimeType: true,
  thumbnailUrl: true,
  fileUrl: true,
});

/**
 * The exact field set `AttachmentService.toAttachment()` reads to build its
 * public `Attachment` shape (`getAttachment`, `getAttachmentsByIds`).
 *
 * #4166 — `getAttachment` used to `findUnique`/`findMany` with NO `select`
 * at all: the ENTIRE `MessageAttachment` row (transcription, translations,
 * encryptionIv, every consumption counter…) was loaded and immediately
 * discarded by `toAttachment`, which only ever reads the 26 fields below.
 * This shape mirrors `toAttachment`'s parameter type exactly — it is not a
 * narrower contract than what the method already served, it is the same
 * contract made explicit at the query.
 */
export const attachmentServiceRowSelect = Prisma.validator<Prisma.MessageAttachmentSelect>()({
  id: true,
  messageId: true,
  fileName: true,
  originalName: true,
  mimeType: true,
  fileSize: true,
  fileUrl: true,
  thumbnailUrl: true,
  width: true,
  height: true,
  duration: true,
  bitrate: true,
  sampleRate: true,
  codec: true,
  channels: true,
  uploadedBy: true,
  isAnonymous: true,
  createdAt: true,
  isForwarded: true,
  capturedInApp: true,
  isViewOnce: true,
  viewOnceCount: true,
  isBlurred: true,
  viewedCount: true,
  downloadedCount: true,
  consumedCount: true,
  isEncrypted: true,
});

/**
 * Root-row shape needed by `AttachmentTranslateService.translate()` — the
 * dispatcher that decides how to translate an attachment and, for audio,
 * drives cache lookup, forwarding-chain resolution, and job-mapping
 * bookkeeping (`verifyUserAccess`, `translateAudio`).
 *
 * #4166, critère 4 — `POST /attachments/:attachmentId/translate` reads this
 * row for its own consent gate (`mimeType`), then handed off to
 * `translate()`, which read the SAME row again via a bare `include` (every
 * scalar column: transcription, translations, encryptionIv…) for a handful
 * of fields — two round-trips for one row. This shape lets the route read
 * ONCE and pass the row through (`translate`'s `preloadedAttachment` param).
 *
 * `message` is reduced to `{ id, conversationId }` — the only two fields
 * `translate()` reads off it (`verifyUserAccess`, job-mapping bookkeeping).
 * `senderId`, present on the old bare `include`, was never read from THIS
 * particular join (the forwarding-chain walk in `_findOriginalAttachmentAndSender`
 * resolves its own sender from a DIFFERENT attachment id, via its own query).
 */
export const attachmentTranslateSelect = Prisma.validator<Prisma.MessageAttachmentSelect>()({
  id: true,
  messageId: true,
  mimeType: true,
  uploadedBy: true,
  isForwarded: true,
  forwardedFromAttachmentId: true,
  duration: true,
  filePath: true,
  message: {
    select: {
      id: true,
      conversationId: true,
    },
  },
});

// ============================================================================
// Derived payload types — consumers get fully-typed Prisma results, no casts.
// ============================================================================

/** Render-ready attachment payload (file + codecs + Prisme). */
export type AttachmentMediaPayload = Prisma.MessageAttachmentGetPayload<{
  select: typeof attachmentMediaSelect;
}>;

/** Full attachment payload (= media + counters + view-once + encryption). */
export type AttachmentFullPayload = Prisma.MessageAttachmentGetPayload<{
  select: typeof attachmentFullSelect;
}>;

/** Forward chip preview payload — just enough to render the chip. */
export type AttachmentForwardPreviewPayload = Prisma.MessageAttachmentGetPayload<{
  select: typeof attachmentForwardPreviewSelect;
}>;

/** `AttachmentService.toAttachment()`'s input row — see `attachmentServiceRowSelect`. */
export type AttachmentServiceRowPayload = Prisma.MessageAttachmentGetPayload<{
  select: typeof attachmentServiceRowSelect;
}>;

/** `AttachmentTranslateService.translate()`'s input row — see `attachmentTranslateSelect`. */
export type AttachmentTranslateRowPayload = Prisma.MessageAttachmentGetPayload<{
  select: typeof attachmentTranslateSelect;
}>;
