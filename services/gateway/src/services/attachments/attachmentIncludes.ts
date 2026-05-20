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
 */

/**
 * Render-ready attachment shape.
 *
 * Field set:
 *   File:       id, messageId, fileName, originalName, mimeType, fileSize,
 *               fileUrl, thumbnailUrl, width, height, thumbHash
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
export const attachmentMediaSelect = {
  id: true,
  messageId: true,
  fileName: true,
  originalName: true,
  mimeType: true,
  fileSize: true,
  fileUrl: true,
  thumbnailUrl: true,
  thumbHash: true,
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
} as const;

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
export const attachmentFullSelect = {
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
} as const;

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
export const attachmentForwardPreviewSelect = {
  id: true,
  mimeType: true,
  thumbnailUrl: true,
  fileUrl: true,
} as const;
