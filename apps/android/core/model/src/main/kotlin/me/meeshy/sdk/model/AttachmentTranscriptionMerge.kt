package me.meeshy.sdk.model

/**
 * Prisme Linguistique — progressive transcription merge (read side).
 *
 * A voice message reaches the client before Whisper finishes; the transcription
 * lands later and the gateway pushes `transcription:ready`. This upserts that
 * transcription onto the matching cached [ApiMessageAttachment] so the open audio
 * bubble shows its transcription the instant it lands — no refetch, no reload. The
 * sibling of [MessageTranslationMerge] for the text side: `BubbleContentBuilder`'s
 * `resolveTranscription` already reads `attachment.transcription`, so wiring this
 * merge into the cache is all that a live transcription needs.
 */
object AttachmentTranscriptionMerge {

    /**
     * Merge one transcription into [message], or return `null` when it is a no-op
     * (nothing to persist):
     *  - a deleted tombstone — a wiped message is never re-transcribed;
     *  - a blank [text] — the Prisme never stores an empty transcription (it would
     *    make the bubble claim a transcription exists when it does not);
     *  - no attachment to attach it to — an explicit [attachmentId] that matches no
     *    attachment, or (when [attachmentId] is blank) a message with no audio
     *    attachment at all;
     *  - an identical transcription already present on the target (same text, same
     *    language) — idempotent, a re-emitted event costs nothing.
     *
     * Target selection: a non-blank [attachmentId] matches the attachment with that
     * id; a blank/absent [attachmentId] falls back to the message's first audio
     * attachment (the single-voice-note common case). The target attachment's
     * [ApiMessageAttachment.transcription] is replaced in place, list order and every
     * other attachment preserved.
     */
    fun mergeTranscription(
        message: ApiMessage,
        attachmentId: String?,
        text: String,
        language: String? = null,
        confidence: Double? = null,
        durationMs: Long? = null,
    ): ApiMessage? {
        if (message.deletedAt != null) return null
        if (text.isBlank()) return null

        val id = attachmentId?.trim().orEmpty()
        val index = if (id.isNotEmpty()) {
            message.attachments.indexOfFirst { it.id == id }
        } else {
            message.attachments.indexOfFirst { it.isAudioAttachment }
        }
        if (index < 0) return null

        val normalizedLanguage = language?.trim()?.ifBlank { null }
        val current = message.attachments[index].transcription
        if (current != null &&
            (current.transcribedText ?: current.text) == text &&
            normalizedLanguage.equalsIgnoreCase(current.language?.trim()?.ifBlank { null })
        ) {
            return null
        }

        val transcription = ApiAttachmentTranscription(
            text = text,
            language = normalizedLanguage,
            confidence = confidence,
            durationMs = durationMs?.toInt(),
        )
        val attachments = message.attachments.mapIndexed { i, attachment ->
            if (i == index) attachment.copy(transcription = transcription) else attachment
        }
        return message.copy(attachments = attachments)
    }

    private val ApiMessageAttachment.isAudioAttachment: Boolean
        get() = mimeType?.startsWith("audio/") == true

    private fun String?.equalsIgnoreCase(other: String?): Boolean =
        if (this == null || other == null) this == other else this.equals(other, ignoreCase = true)
}
