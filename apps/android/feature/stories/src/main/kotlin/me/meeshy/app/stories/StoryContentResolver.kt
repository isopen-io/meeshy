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
 */
object StoryContentResolver {

    fun resolve(item: StoryItem, prefs: ContentLanguagePreferences): ResolvedStoryText {
        val original = item.content.orEmpty()
        val candidates = item.translations.orEmpty().map {
            StoryTranslationLike(targetLanguage = it.language, translatedContent = it.content)
        }
        val match = LanguageResolver.preferredTranslation(candidates, prefs)
        return if (match != null) {
            ResolvedStoryText(content = match.translatedContent, isTranslated = true)
        } else {
            ResolvedStoryText(content = original, isTranslated = false)
        }
    }
}
