package me.meeshy.sdk.model

/**
 * Source de vérité des langues dans lesquelles le TEXTE d'une story est lisible, donc des
 * drapeaux que le lecteur propose à l'exploration. Miroir de `StoryTextLanguageAvailability.swift`.
 *
 * Le texte vit à deux endroits et les deux comptent : les objets texte du canvas (le texte
 * réellement affiché, chacun avec sa langue source et ses traductions) et la légende du post.
 * Les codes sont repliés en base ISO 639-1 (`fr-FR`, `FR` et `fr` donnent une seule entrée).
 */
object StoryTextLanguageAvailability {

    /**
     * Codes disponibles pour le contenu textuel, triés alphabétiquement (résultat déterministe).
     * L'union est voulue : une langue couverte par un seul texte reste proposée, les autres
     * textes retombant sur leur original (règle 1 du Prisme).
     */
    fun availableLanguages(
        effects: StoryEffects?,
        postTranslations: List<StoryTranslation>?,
    ): List<String> {
        val canvas = effects?.textObjects.orEmpty()
            .filter { it.text.isNotBlank() }
            .flatMap { listOfNotNull(it.sourceLanguage) + it.translations.orEmpty().keys }
        val caption = postTranslations.orEmpty().map { it.language }
        return (canvas + caption)
            .filter { it.isNotBlank() }
            .map(StoryPrismeMatch::base)
            .distinct()
            .sorted()
    }

    /** Vrai dès qu'il existe un texte à traduire, sur le canvas ou en légende. */
    fun hasTranslatableText(effects: StoryEffects?, content: String?): Boolean =
        !content.isNullOrBlank() || effects?.textObjects.orEmpty().any { it.text.isNotBlank() }
}
