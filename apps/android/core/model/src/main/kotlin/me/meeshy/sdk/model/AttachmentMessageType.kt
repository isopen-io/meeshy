package me.meeshy.sdk.model

/**
 * Infers the coarse gateway `messageType` label an attachment message carries from
 * the attachment's MIME. Port of the iOS inference in
 * `ConversationView+AttachmentHandlers.swift`
 * (`kind == .audio ? .audio : (mime.hasPrefix("video/") ? .video : .image)`),
 * generalised to the four wire labels the gateway understands and falling back to
 * the generic `"file"` for any non-media MIME.
 *
 * Reuses [MediaKindClassifier] as the single source of truth for image/video/audio
 * detection (parameter stripping, case-folding, blank/null handling) — there is no
 * second copy of the MIME rules here.
 */
object AttachmentMessageType {

    const val IMAGE: String = "image"
    const val VIDEO: String = "video"
    const val AUDIO: String = "audio"
    const val FILE: String = "file"

    /** Maps [mime] to its gateway message-type label; anything not image/video/audio is [FILE]. */
    fun forMime(mime: String?): String =
        when (MediaKindClassifier.fromMimeType(mime)) {
            MediaKind.IMAGE -> IMAGE
            MediaKind.VIDEO -> VIDEO
            MediaKind.AUDIO, MediaKind.AUDIO_TRANSLATION -> AUDIO
            null -> FILE
        }
}
