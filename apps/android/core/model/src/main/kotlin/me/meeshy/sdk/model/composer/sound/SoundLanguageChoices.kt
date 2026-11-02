package me.meeshy.sdk.model.composer.sound

/**
 * Les langues que la feuille propose pour un son — miroir de `AudioPostComposerView.suggestedLocales` et `initialLocale`
 * (iOS) : la langue primaire de l'auteur, sa langue régionale, celle de l'appareil, puis les langues de l'application,
 * sans doublon et au plus [SUGGESTION_CAP] ; « Plus » ouvre les autres. Une langue choisie hors des suggestions y reste
 * visible, à la dernière place.
 */
object SoundLanguageChoices {
    const val SUGGESTION_CAP: Int = 5
    const val FALLBACK: String = "fr"
    val SHIPPED: List<String> = listOf("fr", "en", "es", "de", "it", "pt", "ar")

    fun initial(systemLanguage: String?, deviceLanguage: String?): String =
        normalized(systemLanguage) ?: normalized(deviceLanguage) ?: FALLBACK

    fun suggested(systemLanguage: String?, regionalLanguage: String?, deviceLanguage: String?, selected: String): List<String> {
        val chips = (listOfNotNull(normalized(systemLanguage), normalized(regionalLanguage), normalized(deviceLanguage)) + SHIPPED)
            .distinct()
            .take(SUGGESTION_CAP)
        val chosen = normalized(selected) ?: return chips
        return if (chosen in chips) chips else chips.dropLast(1) + chosen
    }

    /** `pt-BR`, `de_DE`, ` PT ` ⇒ `pt`, `de`, `pt` ; un code vide ou illisible ⇒ `null`. */
    fun normalized(code: String?): String? =
        code?.trim()?.lowercase()?.substringBefore('-')?.substringBefore('_')?.takeIf { it.length in 2..3 && it.all(Char::isLetter) }
}
