package me.meeshy.sdk.model.analytics.v2

/**
 * Ce que le lecteur a VU : la mesure du Prisme Linguistique. Elle DÉCRIT ce qui a
 * été servi, elle ne résout rien (la résolution reste `PrismTranslationResolver`).
 */
class SocialPrism(
    val displayedLanguage: String,
    val originalLanguage: String?,
    val translated: Boolean,
    translationSource: TranslationSource? = null,
) {
    enum class TranslationSource(val wire: String) {
        SERVER("server"),
        DEVICE("device"),
    }

    /** Une source n'a de sens que pour un contenu traduit ; sans précision, le serveur. */
    val translationSource: TranslationSource? =
        if (translated) translationSource ?: TranslationSource.SERVER else null

    override fun equals(other: Any?): Boolean =
        other is SocialPrism &&
            displayedLanguage == other.displayedLanguage &&
            originalLanguage == other.originalLanguage &&
            translated == other.translated &&
            translationSource == other.translationSource

    override fun hashCode(): Int =
        listOf(displayedLanguage, originalLanguage, translated, translationSource).hashCode()

    override fun toString(): String =
        "SocialPrism($displayedLanguage, original=$originalLanguage, translated=$translated, source=$translationSource)"

    companion object {
        /**
         * La langue servie par la descente du Prisme : [translationLanguage] nul
         * signifie que l'original a été servi. Rien à décrire sans langue d'origine.
         */
        fun served(
            translationLanguage: String?,
            originalLanguage: String?,
            source: TranslationSource? = null,
        ): SocialPrism? {
            if (translationLanguage != null) {
                return SocialPrism(translationLanguage, originalLanguage, translated = true, translationSource = source)
            }
            val original = originalLanguage ?: return null
            return SocialPrism(original, original, translated = false)
        }
    }
}
