package me.meeshy.sdk.model

/**
 * Prisme Linguistique — progressive translation merge for posts (read side).
 *
 * The map-keyed sibling of [MessageTranslationMerge]. A post reaches the client in
 * its original language; an on-demand translation (the viewer tapped a configured
 * language the post has no content for yet) finishes later. This upserts that
 * translation into a cached [ApiPost.translations] map so the open feed card
 * re-renders in the requested language the instant it lands — no refetch, no reload.
 *
 * Faithful to Rule 1 of the Prisme: only non-blank translations are ever stored (an
 * empty one would make the card claim a translation exists when it does not — see
 * [LanguageResolver] and [me.meeshy.ui.component.bubble.LanguageFlagTapResolver],
 * whose `hasContent` guard treats a blank entry as no content).
 */
public object PostTranslationMerge {

    /**
     * Merge one translation into [post], or return `null` when it is a no-op
     * (nothing to persist):
     *  - a blank [targetLanguage] or blank [translatedText] — the Prisme never
     *    stores an empty translation;
     *  - an identical translation already present (same language, same text).
     *
     * Otherwise the returned copy has its [ApiPost.translations] upserted: an
     * existing entry for [targetLanguage] (matched case-insensitively) is replaced
     * in place under its original key, order preserved; otherwise a new
     * [ApiPostTranslationEntry] is appended under the trimmed [targetLanguage].
     */
    public fun mergeTranslation(
        post: ApiPost,
        targetLanguage: String,
        translatedText: String,
    ): ApiPost? {
        val language = targetLanguage.trim()
        if (language.isEmpty()) return null
        if (translatedText.isBlank()) return null

        val existing = post.translations.orEmpty()
        val matchKey = existing.keys.firstOrNull { it.equals(language, ignoreCase = true) }
        if (matchKey != null && existing[matchKey]?.text == translatedText) return null

        val entry = ApiPostTranslationEntry(text = translatedText)
        val merged = if (matchKey != null) {
            existing.mapValues { (key, value) -> if (key == matchKey) entry else value }
        } else {
            existing + (language to entry)
        }
        return post.copy(translations = merged)
    }
}
