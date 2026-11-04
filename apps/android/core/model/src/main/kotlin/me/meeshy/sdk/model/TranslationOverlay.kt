package me.meeshy.sdk.model

import me.meeshy.sdk.model.translation.ServerTranslationAdmission

/** Une traduction de texte retenue localement, unique par (message, langue). */
data class StoredTextTranslation(
    val messageId: String,
    val language: String,
    val content: String,
    val sourceLanguage: String = "",
    val model: String? = null,
    val confidence: Double? = null,
)

/** Une transcription retenue localement, unique par (message, pièce jointe). */
data class StoredTranscription(
    val messageId: String,
    val attachmentId: String,
    val text: String,
    val language: String? = null,
    val confidence: Double? = null,
    val durationMs: Int? = null,
)

/** Une piste audio traduite retenue localement, unique par (message, pièce jointe, langue). */
data class StoredAudioTranslation(
    val messageId: String,
    val attachmentId: String,
    val language: String,
    val url: String,
    val transcription: String = "",
    val durationMs: Int? = null,
    val format: String? = null,
    val cloned: Boolean = false,
    val quality: Double? = null,
    val voiceModelId: String? = null,
    val ttsModel: String? = null,
)

/**
 * La projection des lignes dédiées vers un [ApiMessage] : les traductions, transcriptions et
 * pistes audio déjà reçues se superposent à la charge du message, sans changer ce que l'écran
 * lit. Une ligne AJOUTE une langue que la charge ne porte pas ; pour une langue que la charge SERVIE porte déjà, la
 * charge l'emporte : elle est la traduction du texte que le serveur sert MAINTENANT (une retraduction, ou la traduction
 * d'un texte édité, alors qu'une trame socket ne dit pas de quel texte elle vient). Une langue hors [prism] n'est pas
 * projetée. Rend l'instance reçue quand rien ne
 * change : aucun re-rendu inutile.
 *
 * Un message dont le contenu est PROTÉGÉ ou PURGÉ ([refuses]) ne reçoit jamais de ligne : sa traduction et sa
 * transcription ne vivent que dans sa charge, qui part avec lui (purge de la vue unique, pierre tombale, échéance).
 */
object TranslationOverlay {

    /**
     * `true` quand aucune ligne dédiée ne doit être ni écrite ni projetée sur [message] : supprimé, vue unique
     * (ouverte ou non), éphémère, flouté, masqué par un effet, chiffré, ou portant une pièce masquée ou chiffrée.
     * Fail-closed : la projection ne réinjecte jamais le clair d'un contenu que la charge a retiré.
     */
    fun refuses(message: ApiMessage): Boolean =
        message.deletedAt != null ||
            message.consumedByMe == true ||
            message.expiresAt != null ||
            QuotePropagation.holdsProtectedContent(message) ||
            !ServerTranslationAdmission.admits(message, conversationEncryptionMode = null) ||
            message.attachments.any { it.isEncrypted == true || it.protectionVerdict == AttachmentProtectionVerdict.Masked }

    fun apply(
        message: ApiMessage,
        texts: List<StoredTextTranslation>,
        transcriptions: List<StoredTranscription>,
        audioTranslations: List<StoredAudioTranslation>,
        prism: List<String>? = null,
    ): ApiMessage {
        if (refuses(message)) return message
        val withTexts = overlayTexts(message, texts, prism)
        val withAttachments = overlayAttachments(withTexts, transcriptions, audioTranslations, prism)
        return withAttachments
    }

    private fun admits(prism: List<String>?, language: String): Boolean =
        prism == null || prism.any { it.trim().equals(language.trim(), ignoreCase = true) }

    private fun overlayTexts(message: ApiMessage, texts: List<StoredTextTranslation>, prism: List<String>?): ApiMessage {
        var current = message.translations
        texts.forEach { row ->
            val language = row.language.trim()
            if (language.isEmpty() || row.content.isBlank() || !admits(prism, language)) return@forEach
            val index = current.indexOfFirst { it.targetLanguage.equals(language, ignoreCase = true) }
            if (index >= 0 && current[index].translatedContent.isNotBlank()) return@forEach
            val entry = ApiTextTranslation(
                messageId = message.id,
                sourceLanguage = row.sourceLanguage,
                targetLanguage = language,
                translatedContent = row.content,
                translationModel = row.model,
                confidenceScore = row.confidence,
            )
            current = if (index >= 0) current.mapIndexed { i, old -> if (i == index) entry else old } else current + entry
        }
        return if (current == message.translations) message else message.copy(translations = current)
    }

    private fun overlayAttachments(
        message: ApiMessage,
        transcriptions: List<StoredTranscription>,
        audioTranslations: List<StoredAudioTranslation>,
        prism: List<String>?,
    ): ApiMessage {
        if (message.attachments.isEmpty() || (transcriptions.isEmpty() && audioTranslations.isEmpty())) return message
        val attachments = message.attachments.map { attachment ->
            var next = attachment
            transcriptions.firstOrNull { it.attachmentId == attachment.id && it.text.isNotBlank() }?.let { row ->
                val held = next.transcription
                if (held == null || (held.transcribedText ?: held.text) != row.text) {
                    next = next.copy(
                        transcription = ApiAttachmentTranscription(
                            text = row.text,
                            language = row.language,
                            confidence = row.confidence,
                            durationMs = row.durationMs,
                        ),
                    )
                }
            }
            audioTranslations.filter { it.attachmentId == attachment.id && it.url.isNotBlank() && admits(prism, it.language) }
                .forEach { row ->
                    val held = next.translations.orEmpty()
                    val key = held.keys.firstOrNull { it.equals(row.language.trim(), ignoreCase = true) }
                    val current = key?.let { held[it] }
                    if (current != null && current.url == row.url && (current.transcription ?: "") == row.transcription) {
                        return@forEach
                    }
                    val entry = ApiAttachmentTranslation(
                        type = "audio",
                        transcription = row.transcription,
                        url = row.url,
                        durationMs = row.durationMs,
                        format = row.format,
                        cloned = row.cloned,
                        quality = row.quality,
                        voiceModelId = row.voiceModelId,
                        ttsModel = row.ttsModel,
                    )
                    next = next.copy(translations = held + ((key ?: row.language.trim()) to entry))
                }
            next
        }
        return if (attachments == message.attachments) message else message.copy(attachments = attachments)
    }
}
