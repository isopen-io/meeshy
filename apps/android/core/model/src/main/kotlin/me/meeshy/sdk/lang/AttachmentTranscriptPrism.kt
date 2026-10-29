package me.meeshy.sdk.lang

import me.meeshy.sdk.model.ApiAttachmentTranscription
import me.meeshy.sdk.model.ApiAttachmentTranslation

/**
 * LA TRANSCRIPTION SERVIE d'une pièce audio ou vidéo, selon le Prisme (famille AUDIO du `CLAUDE.md` racine) — le site
 * unique que la ligne sous le lecteur de la bulle et la fiche Transcription lisent. Les langues du lecteur sont
 * parcourues DANS L'ORDRE : la première servie gagne, par la transcription d'origine si elle est déjà dans cette
 * langue, ou par une traduction ; sinon l'original (jamais une traduction prise au hasard).
 */
object AttachmentTranscriptPrism {

    data class Served(val text: String, val language: String?, val isTranslated: Boolean)

    fun served(
        transcription: ApiAttachmentTranscription?,
        translations: Map<String, ApiAttachmentTranslation>?,
        preferences: LanguageResolver.ContentLanguagePreferences,
    ): Served? {
        val originalText = originalText(transcription)
        val originalLanguage = transcription?.language?.trim()?.ifBlank { null }
        val byLanguage = translations.orEmpty()
        for (language in LanguageResolver.preferredContentLanguages(preferences)) {
            if (originalText != null && originalLanguage.equals(language, ignoreCase = true)) {
                return Served(originalText, originalLanguage, isTranslated = false)
            }
            val translated = byLanguage.entries
                .firstOrNull { it.key.equals(language, ignoreCase = true) }
                ?.value?.transcription?.trim()?.ifBlank { null }
            if (translated != null) return Served(translated, language, isTranslated = true)
        }
        return originalText?.let { Served(it, originalLanguage, isTranslated = false) }
    }

    /** Le texte d'origine, `transcribedText` d'abord (forme du serveur), `text` ensuite ; un blanc n'en est pas un. */
    fun originalText(transcription: ApiAttachmentTranscription?): String? =
        (transcription?.transcribedText ?: transcription?.text)?.trim()?.ifBlank { null }
}
