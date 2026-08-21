package me.meeshy.sdk.model

/**
 * Prisme Linguistique — on-demand translation merge for stories (read side).
 *
 * The list-keyed sibling of [PostTranslationMerge]. A story reaches the client in
 * its original language; when the viewer taps a configured language the story has
 * no content for yet, an on-demand translation is pulled and upserted into the
 * story's [StoryItem.translations] list so the open viewer can switch to it the
 * instant it lands — no refetch, no reload.
 *
 * Faithful to Rule 1 of the Prisme: only non-blank translations are ever stored (an
 * empty one would make the slide claim a translation exists when it does not — see
 * [me.meeshy.sdk.lang.LanguageResolver], whose resolution treats a blank entry as no
 * content).
 */
public object StoryTranslationMerge {

    /**
     * Merge one translation into [item], or return `null` when it is a no-op
     * (nothing to persist):
     *  - a blank [targetLanguage] or blank [translatedText] — the Prisme never
     *    stores an empty translation;
     *  - an identical translation already present (same language matched
     *    case-insensitively, same text).
     *
     * Otherwise the returned copy has its [StoryItem.translations] upserted: an
     * existing entry for [targetLanguage] (matched case-insensitively) is replaced
     * in place, position and original casing preserved; otherwise a new
     * [StoryTranslation] is appended under the trimmed [targetLanguage].
     */
    public fun mergeTranslation(
        item: StoryItem,
        targetLanguage: String,
        translatedText: String,
    ): StoryItem? {
        val language = targetLanguage.trim()
        if (language.isEmpty()) return null
        if (translatedText.isBlank()) return null

        val existing = item.translations.orEmpty()
        val matchIndex = existing.indexOfFirst { it.language.equals(language, ignoreCase = true) }
        if (matchIndex >= 0 && existing[matchIndex].content == translatedText) return null

        val merged = if (matchIndex >= 0) {
            existing.mapIndexed { index, entry ->
                if (index == matchIndex) entry.copy(content = translatedText) else entry
            }
        } else {
            existing + StoryTranslation(language = language, content = translatedText)
        }
        return item.copy(translations = merged)
    }
}
