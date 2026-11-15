package me.meeshy.sdk.model

/**
 * **La matière du panneau secondaire d'un vocal** (le Prisme s'applique aussi à la transcription) : `langue -> texte` de
 * la transcription d'origine puis des transcriptions traduites non vides. Une langue d'origine inconnue n'est pas offerte.
 */
public object TranscriptSecondaryTexts {

    public fun of(
        transcription: ApiAttachmentTranscription?,
        translations: Map<String, ApiAttachmentTranslation>?,
    ): Map<String, String> {
        val result = LinkedHashMap<String, String>()
        val originalText = (transcription?.transcribedText ?: transcription?.text)?.trim()?.ifBlank { null }
        val originalCode = transcription?.language?.trim()?.lowercase()?.ifEmpty { null }
        if (originalText != null && originalCode != null) result[originalCode] = originalText
        translations.orEmpty().forEach { (language, entry) ->
            val code = language.trim().lowercase()
            val text = entry.transcription?.trim()?.ifBlank { null }
            if (code.isNotEmpty() && text != null) result.putIfAbsent(code, text)
        }
        return result
    }
}
