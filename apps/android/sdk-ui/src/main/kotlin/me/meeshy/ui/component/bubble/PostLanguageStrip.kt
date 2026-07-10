package me.meeshy.ui.component.bubble

import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPostTranslationEntry

/**
 * Prisme Linguistique — projects a post's (or story's) language-keyed translation
 * map into the same ordered flag strip used under chat bubbles.
 *
 * Posts store translations as a `Map<code, entry>` (vs. the message list form), so
 * this adapts the map into [LanguageResolver.TranslationLike] rows and delegates to
 * [MessageLanguageStrip] — one strip algorithm, no re-implementation (SSOT). The
 * read-only default surfaces only the post's original plus each configured content
 * language that actually has content; the strip is **empty** when the post is not
 * translated for the viewer (Prisme rule 1: show the original, nothing to explore).
 */
public object PostLanguageStrip {

    /**
     * Build the chip strip for a post.
     *
     * @param originalLanguage the post's source language (blank/null → no original
     *   chip is anchored).
     * @param translations the post's language-keyed translation entries (null/empty
     *   → empty strip).
     * @param preferences the viewer's configured content-language preferences.
     * @param showingOriginal true when the viewer has toggled back to the original.
     * @param activeCodeOverride the exact language the viewer switched to, when set —
     *   it wins over the [showingOriginal] default so the strip highlights it.
     * @param includeTranslatable when true, configured content languages that have no
     *   content yet are appended as translatable chips (on-demand request affordance).
     * @return an ordered, de-duplicated list of chips, or empty when the post is not
     *   translated for this viewer.
     */
    public fun build(
        originalLanguage: String?,
        translations: Map<String, ApiPostTranslationEntry>?,
        preferences: LanguageResolver.ContentLanguagePreferences,
        showingOriginal: Boolean = false,
        activeCodeOverride: String? = null,
        includeTranslatable: Boolean = false,
    ): List<LanguageChip> =
        MessageLanguageStrip.build(
            originalLanguage = originalLanguage,
            translations = translations.toTranslationRows(),
            preferences = preferences,
            showingOriginal = showingOriginal,
            activeCodeOverride = activeCodeOverride,
            includeTranslatable = includeTranslatable,
        )

    private fun Map<String, ApiPostTranslationEntry>?.toTranslationRows():
        List<LanguageResolver.TranslationLike> =
        this?.map { (code, entry) -> PostTranslationRow(code, entry.text) }.orEmpty()

    private data class PostTranslationRow(
        override val targetLanguage: String,
        override val translatedContent: String,
    ) : LanguageResolver.TranslationLike
}
