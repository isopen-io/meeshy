package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.lang.LanguageCodeNormalizer
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.LanguageInfo

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
