package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.lang.LanguageResolver.ContentLanguagePreferences
import me.meeshy.sdk.model.StoryItem

/** A story slide's text resolved through the Prisme Linguistique. */
@Immutable
data class ResolvedStoryText(
    val content: String,
    val isTranslated: Boolean,
    val languageCode: String? = null,
)

private data class StoryTranslationLike(
    override val targetLanguage: String,
    override val translatedContent: String,
) : LanguageResolver.TranslationLike

/**
 * Prisme Linguistique resolution for a story slide's text.
 *
 * Rule 1: when no translation targets a preferred language, the ORIGINAL content
 * is shown ([isTranslated] = false) — never an arbitrary translation.
 *
 * [overrideLanguage] is the ephemeral "Exploration" pick from the language
 * bar (iOS `sessionLanguageOverride` parity): it is tried FIRST, without
 * removing the user's preference chain — an override with no matching
 * translation falls back to the normal Prisme resolution.
 */
object StoryContentResolver {

    fun resolve(
        item: StoryItem,
        prefs: ContentLanguagePreferences,
        overrideLanguage: String? = null,
    ): ResolvedStoryText {
        val original = item.content.orEmpty()
        val candidates = item.translations.orEmpty().map {
            StoryTranslationLike(targetLanguage = it.language, translatedContent = it.content)
        }
        val overrideMatch = overrideLanguage?.let { override ->
            candidates.firstOrNull {
                it.targetLanguage.equals(override, ignoreCase = true) &&
                    it.translatedContent.isNotBlank()
            }
        }
        val match = overrideMatch ?: LanguageResolver.preferredTranslation(candidates, prefs)
        return if (match != null) {
            ResolvedStoryText(
                content = match.translatedContent,
                isTranslated = true,
                languageCode = match.targetLanguage,
            )
        } else {
            ResolvedStoryText(content = original, isTranslated = false, languageCode = null)
        }
    }
}
