package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.lang.LanguageCodeNormalizer
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.LanguageInfo
import me.meeshy.ui.component.bubble.LanguageChip

/**
 * La traduction SECONDAIRE du détail d'un post (iOS `PostDetailSecondaryTranslationPanel`) : un
 * second texte posé sous le texte lu, dans une autre langue, sans le remplacer.
 */
@Immutable
data class PostSecondaryTranslation(
    val code: String,
    val info: LanguageInfo?,
    val content: String,
) {
    companion object {
        /**
         * @param secondaryCode la langue demandée en second ; `null` ⇒ aucun panneau.
         * @param activeCode la langue DÉJÀ lue : la répéter dessous serait un doublon, donc rien.
         * Une langue sans contenu (ni original, ni traduction non vide) ne rend rien : jamais un
         * panneau vide.
         */
        fun of(post: ApiPost, secondaryCode: String?, activeCode: String?): PostSecondaryTranslation? {
            val code = secondaryCode?.trim()?.lowercase()?.takeIf { it.isNotEmpty() } ?: return null
            val canonical = LanguageCodeNormalizer.normalizeForDedup(code)
            if (activeCode?.let(LanguageCodeNormalizer::normalizeForDedup) == canonical) return null
            val content = when {
                post.originalLanguage?.let(LanguageCodeNormalizer::normalizeForDedup) == canonical -> post.content.orEmpty()
                else -> post.translations.orEmpty().entries
                    .firstOrNull { LanguageCodeNormalizer.normalizeForDedup(it.key) == canonical && it.value.text.isNotBlank() }
                    ?.value?.text.orEmpty()
            }
            if (content.isBlank()) return null
            return PostSecondaryTranslation(code = code, info = LanguageData.info(code), content = content)
        }
    }
}

/**
 * La bande de drapeaux du DÉTAIL d'un post (iOS `PostDetailView.buildAvailableFlags`) : l'original
 * et les langues du lecteur qui ont un contenu, SANS la langue déjà lue (c'est le texte au-dessus),
 * et la puce marquée est celle du panneau secondaire ouvert — jamais celle du texte principal.
 */
object PostDetailLanguageStrip {

    fun of(
        strip: List<LanguageChip>,
        displayedCode: String?,
        originalCode: String?,
        secondaryCode: String?,
    ): List<LanguageChip> {
        val displayed = (displayedCode ?: originalCode).canonical()
        val secondary = secondaryCode.canonical()
        return strip
            .filterNot { it.isTranslatable }
            .filterNot { displayed != null && it.code.canonical() == displayed }
            .map { it.copy(isActive = secondary != null && it.code.canonical() == secondary) }
    }

    private fun String?.canonical(): String? =
        this?.takeIf { it.isNotBlank() }?.let(LanguageCodeNormalizer::normalizeForDedup)
}
