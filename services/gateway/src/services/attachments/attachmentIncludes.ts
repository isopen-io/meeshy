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
import {
  ATTACHMENT_PROTECTION_FIELDS,
  type AttachmentProtectionField,
} from '@meeshy/shared/utils/attachment-protection';

/**
 * Les trois colonnes de protection PROPRES à `MessageAttachment`
 * (`isViewOnce` / `isBlurred` / `effectFlags`), INDÉPENDANTES de leurs
 * homonymes sur le `Message` porteur — DÉRIVÉES de l'inventaire partagé
 * (`ATTACHMENT_PROTECTION_FIELDS`), jamais réécrites (#7014).
 *
 * Elle vivait dans `routes/admin/media-protection.ts`, qui la ré-exporte
 * désormais depuis ici : un fragment de `select` Prisma a son domicile dans ce
 * fichier — « Every gateway endpoint that returns or broadcasts a Message with
 * its attachments MUST select from one of these named shapes » — et son ancien
 * domicile, un module de ROUTE, rendait sa réutilisation par le canal SOCKET
 * impossible sans traîner `NotificationService` dans la couche temps réel.
 *
 * `Prisma.validator` n'est pas décoratif ici : il refuse à la compilation un
 * nom d'inventaire qui ne serait pas une colonne de `MessageAttachment`.
 */
const protectionFieldsSelect = Object.fromEntries(
  ATTACHMENT_PROTECTION_FIELDS.map((champ) => [champ, true])
) as { readonly [K in AttachmentProtectionField]: true };

export const attachmentProtectionSelect = Prisma.validator<Prisma.MessageAttachmentSelect>()(
  protectionFieldsSelect
);

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
 * LA FORME DU CANAL SOCKET (#7014, étendue #7070) — `attachmentMediaSelect`
 * PLUS la protection propre à la pièce jointe PLUS les familles que les
 * clients réels (iOS, web-v2, web legacy) lisent sur `message:new` /
 * `message:edited` et que #7070 a trouvées ABSENTES : forwarding, effets de
 * vue-unique, compteurs de consommation, fait ET mode du chiffrement.
 *
 * Toute requête dont le résultat part chez `serializeAttachmentForSocket`
 * sélectionne CELLE-CI, jamais `attachmentMediaSelect` nu. La raison est
 * mesurée : `attachmentMediaSelect` est délibérément SANS drapeau de
 * protection (son doc-comment : « No consumption-tracking, no security
 * flags »), si bien que `message:edited` et `message:attachment-updated`
 * remettaient au fil une pièce MUETTE sur sa propre protection — et
 * `maskedAttachment`, qui échoue OUVERTE quand on ne la nourrit pas, laissait
 * son `<img>` atteindre le DOM en clair.
 *
 * Elle porte le `select` et la projection ENSEMBLE, comme
 * `utils/recipient-language.ts` porte le sien avec sa descente : c'est la
 * projection trop étroite, jamais l'appel manquant, qui rend une garde
 * impossible en aval sans qu'aucun témoin ne rougisse (leçon 276). La liste de
 * protection n'est pas retapée — elle est SPREAD depuis
 * `attachmentProtectionSelect`, donc un quatrième canal la rejoint sans
 * qu'aucun site socket n'ait à s'en souvenir.
 *
 * ## Ce que #7070 AJOUTE, et ce qu'il refuse délibérément
 *
 * `MessageProcessor.saveMessage` relisait ses pièces par un `findMany` SANS
 * `select` : la ligne Prisma BRUTE (65 colonnes) atteignait `message:new` /
 * `message:edited` sur le chemin REST/ZMQ — le transport DOMINANT (toute pièce
 * jointe, tout DM chiffré, toute vue-unique partent par lui côté iOS). Cinq
 * familles manquaient ici pour que le chemin socket (déjà curaté) et le chemin
 * REST (désormais curaté par la MÊME forme) ne divergent plus :
 *
 *   - forwarding            : forwardedFromAttachmentId, isForwarded
 *   - effets vue-unique     : maxViewOnceCount, viewOnceCount (isViewOnce /
 *                             isBlurred / effectFlags viennent déjà de
 *                             attachmentProtectionSelect)
 *   - consommation          : deliveredToAllAt, viewedByAllAt,
 *                             downloadedByAllAt, listenedByAllAt,
 *                             watchedByAllAt, viewedCount, downloadedCount,
 *                             consumedCount
 *   - fait du chiffrement   : isEncrypted, encryptionMode
 *
 * `filePath` (chemin serveur), `encryptionIv` et `encryptionAuthTag` restent
 * HORS de cette forme, à dessein : ce sont des secrets de SERVEUR (le gateway
 * déchiffre lui-même la pièce, `AttachmentService.decryptAttachment`), et
 * aucun des quatre décodeurs clients ne les lit pour déchiffrer quoi que ce
 * soit côté device (mesuré, #7070 § 1.2/1.4). Les pousser à toute une room est
 * exactement la sur-divulgation que #7070 ferme, jamais une famille à
 * rattraper.
 */
export const attachmentSocketSelect = Prisma.validator<Prisma.MessageAttachmentSelect>()({
  ...attachmentMediaSelect,
  ...attachmentProtectionSelect,
  forwardedFromAttachmentId: true,
  isForwarded: true,
  maxViewOnceCount: true,
  viewOnceCount: true,
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
