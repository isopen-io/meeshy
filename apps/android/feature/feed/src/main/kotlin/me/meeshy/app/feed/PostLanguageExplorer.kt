package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.lang.LanguageCodeNormalizer
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.lang.ReaderPrism
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.LanguageInfo
import kotlin.math.roundToInt

/** Une traduction disponible du post (iOS `PostTranslationSheet.translationsSection`). */
@Immutable
data class PostLanguageRow(
    val code: String,
    val info: LanguageInfo?,
    val text: String,
    val confidencePercent: Int?,
    val isActive: Boolean,
)

/**
 * Ce que l'explorateur de langues d'un post montre : l'original, les traductions disponibles et
 * les langues du lecteur qu'il n'a pas encore (iOS `PostTranslationSheet`). Pur, bâti avec la MÊME
 * langue active que celle qui a servi le texte de la carte — l'étiquette et le texte lu ne
 * peuvent donc pas dire deux langues.
 */
@Immutable
data class PostLanguageExplorer(
    val originalCode: String?,
    val originalInfo: LanguageInfo?,
    val originalText: String,
    val originalIsActive: Boolean,
    val translations: List<PostLanguageRow>,
    val missing: List<String>,
)

object PostLanguageExplorerBuilder {

    /**
     * @param activeCode la langue effectivement servie, telle que
     *   [FeedPostBuilder.resolveActiveCode] la résout (descente du Prisme ou choix explicite) ;
     *   `null` ⇒ l'original est servi.
     * @return `null` tant que le post ne porte aucune traduction : il n'y a rien à explorer.
     */
    fun build(
        post: ApiPost,
        preferences: LanguageResolver.ContentLanguagePreferences,
        activeCode: String?,
    ): PostLanguageExplorer? {
        val original = post.originalLanguage.canonical()
        val active = activeCode.canonical()
        val originalActive = active == null || active == original

        val translations = post.translations.orEmpty()
            .filter { it.value.text.isNotBlank() }
            .map { (code, entry) -> Triple(code.trim().lowercase(), code.canonical(), entry) }
            .filter { it.second != null }
            .sortedBy { it.first }
            .distinctBy { it.second }
        if (translations.isEmpty()) return null

        val rows = translations.map { (code, canonicalCode, entry) ->
            PostLanguageRow(
                code = code,
                info = LanguageData.info(code),
                text = entry.text,
                confidencePercent = entry.confidenceScore?.let { (it * 100).roundToInt() },
                isActive = !originalActive && canonicalCode == active,
            )
        }
        val held = buildSet {
            original?.let(::add)
            translations.forEach { it.second?.let(::add) }
        }
        val missing = ReaderPrism.resolve(preferences)
            .mapNotNull { language -> language.trim().lowercase().takeIf { it.isNotEmpty() } }
            .distinctBy { it.canonical() }
            .filter { it.canonical() !in held }

        return PostLanguageExplorer(
            originalCode = post.originalLanguage?.trim()?.lowercase()?.takeIf { it.isNotEmpty() },
            originalInfo = LanguageData.info(post.originalLanguage),
            originalText = post.content.orEmpty(),
            originalIsActive = originalActive,
            translations = rows,
            missing = missing,
        )
    }

    private fun String?.canonical(): String? =
        this?.takeIf { it.isNotBlank() }?.let(LanguageCodeNormalizer::normalizeForDedup)
}
