package me.meeshy.sdk.model

import me.meeshy.sdk.lang.LanguageCodeNormalizer

/**
 * Appariement tolérant des codes de langue de la chaîne du lecteur (Prisme Linguistique).
 *
 * Les langues de l'application gardent leur casse d'origine (`en-US`, `FR`) alors que les clés
 * de traduction sont en ISO 639-1 : une égalité stricte manquerait `en-US` contre `en`, et le
 * texte d'un autre auteur resterait dans SA langue. Ce miroir de `StoryPrismeMatch.swift` replie
 * casse et région sur un code de base, par la même canonisation que l'aperçu de liste
 * ([LanguageCodeNormalizer.normalizeForDedup]) — une règle, un site.
 */
object StoryPrismeMatch {

    /** Code de langue de base (ISO 639-1 en minuscules) pour comparer sans casse ni région. */
    fun base(code: String): String = LanguageCodeNormalizer.normalizeForDedup(code)
}
