package me.meeshy.app.chat

import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.translation.AudioTranslationLanguages
import me.meeshy.sdk.model.translation.DeviceTranslationEligibility
import me.meeshy.ui.component.bubble.BubbleContent

/**
 * Ce que la feuille « Traduire l'audio » sait d'un message (loi pure, l'écran n'est qu'une projection) : ses vocaux OUVERTS,
 * les langues proposées (celles de l'explorateur, qui mènent déjà avec le Prisme du lecteur, sans la langue d'origine du vocal),
 * les pistes déjà dans le cache et le refus de chiffrement. `null` quand rien n'est traduisible : aucun vocal, ou un vocal
 * protégé (vue unique, flou, éphémère, chiffré) — ni pastille, ni feuille, ni demande.
 */
internal object AudioTranslationInputs {

    fun of(
        bubble: BubbleContent,
        attachments: List<ApiMessageAttachment>,
        explorerLanguages: List<String>,
        conversationEncryptionMode: String?,
        conversationShownSealed: Boolean,
    ): AudioTranslationSheetInput? {
        if (bubble.audios.isEmpty() || bubble.audios.any { ChatVoiceQueue.isProtected(bubble, it) }) return null
        val voices = bubble.audios.map { AudioTranslationTarget(it.attachmentId, it.originalLanguage?.trim()?.lowercase()?.ifEmpty { null }) }
        val ready = attachments.flatMap { attachment ->
            attachment.translations.orEmpty()
                .filterValues { !it.url.isNullOrBlank() }
                .keys.map { language -> "${attachment.id}|${language.trim().lowercase()}" }
        }.toSet()
        val languages = AudioTranslationLanguages.of(
            readerLanguages = explorerLanguages,
            originalLanguage = voices.firstNotNullOfOrNull { it.sourceLanguage },
            catalog = emptyList(),
        )
        if (languages.isEmpty()) return null
        val refused = conversationShownSealed || bubble.isEndToEndSealed || !DeviceTranslationEligibility.serverReadsMessage(
            conversationEncryptionMode = conversationEncryptionMode,
            isEncrypted = false,
            encryptionMode = null,
        )
        return AudioTranslationSheetInput(bubble.messageId, voices, languages, refused, ready)
    }
}
