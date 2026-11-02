package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.LanguageInfo
import me.meeshy.sdk.model.StoryItem
import me.meeshy.ui.component.bubble.LanguageExplorerRow
import me.meeshy.ui.component.bubble.MessageDetailExplorer

/**
 * La sentinelle « Original » de l'explorateur (iOS `StoryReaderContentRules.originalLanguageOverride`) :
 * elle vide la chaîne du lecteur, si bien que la légende ET chaque texte du canevas retombent sur
 * leur propre texte, dans leur propre langue. Elle ne peut pas entrer en collision avec un code BCP-47.
 */
object StoryLanguageOverride {
    const val ORIGINAL: String = "__meeshy.original__"

    fun isOriginal(code: String?): Boolean = code == ORIGINAL
}

/** Le contenu de la langue COURANTE, en tête de la feuille : le texte réellement servi. */
@Immutable
data class StoryCurrentContent(
    val code: String?,
    val info: LanguageInfo?,
    val text: String,
)

/**
 * Ce que la feuille « Langues » d'une story montre (iOS `StoryLanguageDetailView`) : la carte du
 * contenu servi, l'entrée « Original » puis une ligne par langue (traduire / retraduire).
 * Les lignes viennent de [MessageDetailExplorer] — la même projection que l'explorateur d'un message.
 */
@Immutable
data class StoryLanguageExplorer(
    val current: StoryCurrentContent?,
    val originalSelected: Boolean,
    val rows: List<LanguageExplorerRow>,
)

object StoryLanguageExplorerBuilder {

    private data class CaptionRow(
        override val targetLanguage: String,
        override val translatedContent: String,
    ) : LanguageResolver.TranslationLike

    /**
     * @param resolved le texte que le lecteur sert VRAIMENT (issu de [StoryContentResolver]) : la
     *   carte de tête et la ligne cochée en sont la projection, donc ils disent la même langue.
     */
    fun build(
        item: StoryItem,
        preferences: LanguageResolver.ContentLanguagePreferences,
        resolved: ResolvedStoryText,
        override: String?,
        translatingCodes: Set<String>,
    ): StoryLanguageExplorer {
        val originalSelected = StoryLanguageOverride.isOriginal(override)
        val servedCode = resolved.languageCode.takeUnless { originalSelected }
        val rows = MessageDetailExplorer.build(
            originalLanguage = item.originalLanguage,
            content = item.content.orEmpty(),
            translations = item.translations.orEmpty().map { CaptionRow(it.language, it.content) },
            preferences = preferences,
            translatingCodes = translatingCodes,
            selectedCode = servedCode,
        ).rows
        val current = resolved.content.takeIf { it.isNotBlank() }?.let {
            StoryCurrentContent(code = servedCode, info = LanguageData.info(servedCode), text = it)
        }
        return StoryLanguageExplorer(current = current, originalSelected = originalSelected, rows = rows)
    }
}
