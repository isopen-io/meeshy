package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.lang.LanguageResolver.ContentLanguagePreferences
import me.meeshy.sdk.lang.ReaderPrism
import me.meeshy.sdk.model.StoryDerivedContent
import me.meeshy.sdk.model.StoryItem
import java.util.Locale

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
 * Rule 3: the slide's original language competes at its own RANK — a French story read by
 * `["fr", "en"]` stays French even when an English translation exists.
 *
 * [overrideLanguage] is the ephemeral "Exploration" pick from the language
 * bar (iOS `sessionLanguageOverride` parity): it is tried FIRST, without
 * removing the user's preference chain — an override with no matching
 * translation falls back to the normal Prisme resolution.
 */
object StoryContentResolver {

    /**
     * Le lecteur lu par le prisme STRICT : la locale appareil (rang 4) entre aussi pour un
     * participant anonyme ou un serveur qui ne l'a pas encore vue, jamais de repli « fr ».
     */
    internal fun readerPrefs(
        prefs: ContentLanguagePreferences,
        current: Locale = Locale.getDefault(),
    ): ContentLanguagePreferences {
        val device = ReaderPrism.deviceLocale(stored = prefs.deviceLocale, current = current)
        return object : ContentLanguagePreferences {
            override val systemLanguage: String? = prefs.systemLanguage
            override val regionalLanguage: String? = prefs.regionalLanguage
            override val customDestinationLanguage: String? = prefs.customDestinationLanguage
            override val deviceLocale: String? = device
        }
    }

    /** Les langues du prisme strict, dans l'ordre des rangs ; vide : aucune préférence, l'original est servi. */
    fun readerLanguages(prefs: ContentLanguagePreferences, current: Locale = Locale.getDefault()): List<String> =
        ReaderPrism.resolve(prefs, current)

    /**
     * Ce que la scène rend en légende : une légende dérivée des objets texte (l'index de recherche
     * de la passerelle) n'est jamais rendue, la scène la montre déjà.
     */
    fun resolve(
        item: StoryItem,
        prefs: ContentLanguagePreferences,
        overrideLanguage: String? = null,
    ): ResolvedStoryText {
        val resolved = resolveContent(item, readerPrefs(prefs), overrideLanguage)
        val overlayTexts = item.storyEffects?.textObjects.orEmpty().map { it.text }
        val caption = StoryDerivedContent.caption(item.content, resolved.content, overlayTexts).orEmpty()
        return resolved.copy(content = caption)
    }

    private fun resolveContent(
        item: StoryItem,
        prefs: ContentLanguagePreferences,
        overrideLanguage: String?,
    ): ResolvedStoryText {
        val original = item.content.orEmpty()
        if (StoryLanguageOverride.isOriginal(overrideLanguage)) {
            return ResolvedStoryText(content = original, isTranslated = false, languageCode = null)
        }
        val candidates = item.translations.orEmpty().map {
            StoryTranslationLike(targetLanguage = it.language, translatedContent = it.content)
        }
        val overrideMatch = overrideLanguage?.let { override ->
            candidates.firstOrNull {
                it.targetLanguage.equals(override, ignoreCase = true) &&
                    it.translatedContent.isNotBlank()
            }
        }
        val match = overrideMatch ?: LanguageResolver.preferredTranslation(candidates, prefs, originalLanguage = item.originalLanguage)
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
