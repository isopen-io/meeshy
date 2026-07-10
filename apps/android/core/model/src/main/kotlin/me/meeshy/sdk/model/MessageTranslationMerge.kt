package me.meeshy.sdk.model

/**
 * Prisme Linguistique — progressive translation merge (read side).
 *
 * A message reaches the client in its original language; the translator finishes
 * later and the gateway pushes `message:translated` / `message:translation`. This
 * upserts that translation into a cached [ApiMessage.translations] so the open
 * bubble re-renders in the viewer's preferred language the instant it lands — no
 * refetch, no reload. Faithful to the shared socket contract and to Rule 1 of the
 * Prisme: only non-blank translations are ever stored (an empty one would make the
 * bubble claim a translation exists when it does not — see `LanguageResolver`).
 */
object MessageTranslationMerge {

    /**
     * Merge one translation into [message], or return `null` when it is a no-op
     * (nothing to persist):
     *  - a deleted tombstone — translations are wiped on delete, never resurrected;
     *  - a blank [targetLanguage] or blank [translatedContent] — the Prisme never
     *    stores an empty translation;
     *  - an identical translation already present (same language, same content).
     *
     * Otherwise the returned copy has its [ApiMessage.translations] upserted: an
     * existing entry for [targetLanguage] (matched case-insensitively) is replaced
     * in place, order preserved; otherwise a new [ApiTextTranslation] is appended.
     */
    fun mergeTranslation(
        message: ApiMessage,
        targetLanguage: String,
        translatedContent: String,
    ): ApiMessage? {
        if (message.deletedAt != null) return null
        val language = targetLanguage.trim()
        if (language.isEmpty()) return null
        if (translatedContent.isBlank()) return null

        val existing = message.translations
        val index = existing.indexOfFirst { it.targetLanguage.equals(language, ignoreCase = true) }
        if (index >= 0 && existing[index].translatedContent == translatedContent) return null

        val entry = ApiTextTranslation(
            messageId = message.id,
            sourceLanguage = message.originalLanguage?.trim().orEmpty(),
            targetLanguage = language,
            translatedContent = translatedContent,
        )
        val merged = if (index >= 0) {
            existing.mapIndexed { i, current -> if (i == index) entry else current }
        } else {
            existing + entry
        }
        return message.copy(translations = merged)
    }
}
