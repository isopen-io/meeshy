package me.meeshy.sdk.model.translation

/**
 * **Les langues que la feuille « Traduire l'audio » propose** : celles du lecteur d'abord, dans l'ordre du Prisme, puis le
 * catalogue, sans la langue d'origine de la pièce (la traduire n'a pas de sens), dédoublonnées, en minuscules et bornées.
 */
public object AudioTranslationLanguages {

    public const val DEFAULT_LIMIT: Int = 12

    public fun of(
        readerLanguages: List<String>,
        originalLanguage: String?,
        catalog: List<String>,
        limit: Int = DEFAULT_LIMIT,
    ): List<String> {
        val original = originalLanguage?.trim()?.lowercase()
        return (readerLanguages + catalog)
            .map { it.trim().lowercase() }
            .filter { it.isNotEmpty() && it != original }
            .distinct()
            .take(limit)
    }
}
