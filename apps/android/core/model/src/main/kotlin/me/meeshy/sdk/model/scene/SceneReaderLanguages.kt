package me.meeshy.sdk.model.scene

import me.meeshy.sdk.lang.PrismTranslation
import me.meeshy.sdk.lang.PrismTranslationResolver
import me.meeshy.sdk.lang.ReaderPrism

/**
 * Les langues du lecteur, DANS L'ORDRE du Prisme (système, régionale, personnalisée, appareil).
 * Injectées à tous les objets de la scène qui portent une langue, et seule entrée linguistique
 * du plan de rendu. La descente passe par [PrismTranslationResolver] : sans traduction vers une
 * langue préférée on sert l'original (`null`), jamais la première traduction trouvée.
 */
public data class SceneReaderLanguages(val languages: List<String> = emptyList()) {

    /** La traduction servie pour un texte, ou `null` : afficher l'original. */
    public fun serve(
        sourceLanguage: String?,
        translations: Map<String, String>?,
    ): PrismTranslation? {
        if (translations.isNullOrEmpty()) return null
        return PrismTranslationResolver.resolve(sourceLanguage, translations, languages)
    }

    public companion object {
        public val NONE: SceneReaderLanguages = SceneReaderLanguages()

        public fun of(
            systemLanguage: String?,
            regionalLanguage: String?,
            customDestinationLanguage: String?,
            deviceLocale: String?,
        ): SceneReaderLanguages = SceneReaderLanguages(
            ReaderPrism.resolve(systemLanguage, regionalLanguage, customDestinationLanguage, deviceLocale),
        )
    }
}
