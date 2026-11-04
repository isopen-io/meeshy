package me.meeshy.sdk.model

import me.meeshy.sdk.lang.LanguageCodeNormalizer

/** Une langue dans laquelle le post CITÉ se lit : son code, son drapeau, et si c'est celle du panneau secondaire ouvert. */
data class RepostLanguageFlag(
    val code: String,
    val flag: String,
    val isActive: Boolean = false,
)

/**
 * L'état de langue PROPRE au post cité (iOS `FeedPostCard+Repost` : drapeaux et panneau secondaire de l'embed), indépendant
 * de celui du post extérieur. Une langue n'est offerte que si le post cité la sert réellement : l'original, ou une traduction
 * non vide. La langue déjà lue dans l'embed n'est jamais répétée en drapeau.
 */
object RepostEmbedLanguages {

    /** Les langues servies par le post cité, l'original d'abord, dédoublonnées par code canonique. */
    fun available(repost: ApiRepostOf): List<String> {
        val original = repost.originalLanguage?.trim()?.takeIf { it.isNotEmpty() && !repost.content.isNullOrBlank() }
        val translated = repost.translations.orEmpty().filterValues { it.text.isNotBlank() }.keys.map { it.trim() }.filter { it.isNotEmpty() }
        return (listOfNotNull(original) + translated).distinctBy(LanguageCodeNormalizer::normalizeForDedup)
    }

    /** Les drapeaux de l'embed : [available] sans la langue lue ([displayed]) ; la puce de [secondary] est marquée. */
    fun flags(repost: ApiRepostOf, displayed: String?, secondary: String?): List<RepostLanguageFlag> {
        val read = displayed?.takeIf { it.isNotBlank() }?.let(LanguageCodeNormalizer::normalizeForDedup)
        val open = secondary?.takeIf { it.isNotBlank() }?.let(LanguageCodeNormalizer::normalizeForDedup)
        return available(repost)
            .filterNot { read != null && LanguageCodeNormalizer.normalizeForDedup(it) == read }
            .map { code ->
                RepostLanguageFlag(
                    code = code,
                    flag = LanguageData.info(code)?.flag ?: code.uppercase(),
                    isActive = open != null && LanguageCodeNormalizer.normalizeForDedup(code) == open,
                )
            }
    }

    /** Le texte du post cité dans [code] (panneau secondaire) ; `null` quand cette langue n'a aucun contenu. */
    fun textIn(repost: ApiRepostOf, code: String): String? {
        val canonical = LanguageCodeNormalizer.normalizeForDedup(code)
        val original = repost.originalLanguage?.let(LanguageCodeNormalizer::normalizeForDedup)
        if (original == canonical) return repost.content?.takeIf { it.isNotBlank() }
        return repost.translations.orEmpty().entries
            .firstOrNull { LanguageCodeNormalizer.normalizeForDedup(it.key) == canonical && it.value.text.isNotBlank() }
            ?.value?.text
    }
}
