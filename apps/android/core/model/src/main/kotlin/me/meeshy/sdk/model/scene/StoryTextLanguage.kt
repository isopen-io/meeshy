package me.meeshy.sdk.model.scene

import me.meeshy.sdk.lang.LanguageCodeNormalizer

/**
 * La langue dans laquelle un texte est ÉCRIT (iOS `TextEditToolOptions.languageChoices / normalisedCode`) : la base
 * de toute traduction par le Prisme. Une langue source fausse ne se voit pas à l'écriture, elle ne se paie qu'à la
 * traduction — d'où ce choix explicite.
 */
object StoryTextLanguage {
    /** Les langues de l'interface Meeshy, dans l'ordre d'iOS. */
    val interfaceLanguages: List<String> = listOf("fr", "en", "es", "de", "it", "pt", "ar")

    /** Réduit un code au format des pastilles (`pt-BR` → `pt`), ou `null` s'il n'y a rien d'exploitable. */
    fun normalised(raw: String?): String? =
        raw?.trim()?.takeIf { it.isNotEmpty() }?.let(LanguageCodeNormalizer::normalizeForDedup)

    /** Les pastilles : la langue déjà posée en tête si elle sort du lot — jamais de liste vide, jamais de perte du choix. */
    fun choices(current: String?): List<String> {
        val code = normalised(current) ?: return interfaceLanguages
        return if (code in interfaceLanguages) interfaceLanguages else listOf(code) + interfaceLanguages
    }
}
