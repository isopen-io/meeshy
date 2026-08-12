package me.meeshy.sdk.model

/**
 * Prisme Linguistique — progressive cloned-voice audio-translation merge (read side).
 *
 * A voice note reaches the client in its original language; the translator later renders
 * a **voice-cloned** version in each requested language and the gateway pushes
 * `audio:translation-ready` (and its progressive/completed siblings). This upserts that
 * translated audio into the matching cached [ApiMessageAttachment.translations] map so the
 * open audio bubble can play the viewer's-language cloned voice the instant it lands — no
 * refetch, no reload. The audio sibling of [AttachmentTranscriptionMerge]: the projection
 * (`BubbleContentBuilder`) already prefers the viewer's-language entry, so wiring this
 * merge into the cache is all the live cloned-voice playback needs.
 */
object AttachmentAudioTranslationMerge {

    /**
     * Merge one translated audio into [message], or return `null` when it is a no-op
     * (nothing to persist):
     *  - a deleted tombstone — a wiped message is never re-voiced;
     *  - a blank [language] — the Prisme never keys a translation on a blank language;
     *  - a blank [url] — an audio translation with no playable source is meaningless
     *    (it would make the bubble claim a cloned voice exists when it cannot play);
     *  - no attachment to attach it to — an explicit [attachmentId] that matches no
     *    attachment, or (when [attachmentId] is blank) a message with no audio attachment;
     *  - an identical translation already present under that language (same url, same
     *    transcription) — idempotent, a re-emitted event costs nothing.
     *
     * Target selection mirrors [AttachmentTranscriptionMerge]: a non-blank [attachmentId]
     * matches the attachment with that id; a blank/absent one falls back to the message's
     * first audio attachment (the single-voice-note common case). The translation is
     * upserted into the target's [ApiMessageAttachment.translations] under [language]
     * (matched case-insensitively so a re-cased key never duplicates); map order and every
     * other attachment are preserved.
     */
    fun mergeAudioTranslation(
        message: ApiMessage,
        attachmentId: String?,
        language: String,
        url: String,
        transcription: String = "",
        durationMs: Long? = null,
        format: String? = null,
        cloned: Boolean = false,
        quality: Double? = null,
        voiceModelId: String? = null,
        ttsModel: String? = null,
    ): ApiMessage? {
        if (message.deletedAt != null) return null
        val targetLanguage = language.trim()
        if (targetLanguage.isEmpty()) return null
        val playableUrl = url.trim()
        if (playableUrl.isEmpty()) return null

        val id = attachmentId?.trim().orEmpty()
        val index = if (id.isNotEmpty()) {
            message.attachments.indexOfFirst { it.id == id }
        } else {
            message.attachments.indexOfFirst { it.isAudioAttachment }
        }
        if (index < 0) return null

        val existing = message.attachments[index].translations.orEmpty()
        val existingKey = existing.keys.firstOrNull { it.equals(targetLanguage, ignoreCase = true) }
        val current = existingKey?.let { existing[it] }
        if (current != null && current.url == playableUrl && (current.transcription ?: "") == transcription) {
            return null
        }

        val entry = ApiAttachmentTranslation(
            type = "audio",
            transcription = transcription,
            url = playableUrl,
            durationMs = durationMs?.toInt(),
            format = format,
            cloned = cloned,
            quality = quality,
            voiceModelId = voiceModelId,
            ttsModel = ttsModel,
        )
        val merged = existing + ((existingKey ?: targetLanguage) to entry)
        val attachments = message.attachments.mapIndexed { i, attachment ->
            if (i == index) attachment.copy(translations = merged) else attachment
        }
        return message.copy(attachments = attachments)
    }

    private val ApiMessageAttachment.isAudioAttachment: Boolean
        get() = mimeType?.startsWith("audio/") == true
}
