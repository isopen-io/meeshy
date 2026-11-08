package me.meeshy.sdk.model

/**
 * Le toucher d'un drapeau de langue dans le pied d'une bulle — port d'iOS `BubbleLanguageFlagController`.
 * Pur : il ne touche aucun état, il calcule la transition que la vue applique.
 *
 *  - une langue SANS contenu demande sa traduction (l'état ne bouge pas) ;
 *  - la langue d'origine, ou la langue primaire du Prisme, ramène le texte principal à elle et ferme le panneau ;
 *  - toute autre langue qui a du contenu ouvre le panneau SECONDAIRE sous le texte, ou le ferme si elle y était déjà.
 */
object BubbleFlagTap {

    enum class Action { SwitchPrimary, OpenSecondary, CloseSecondary, RequestTranslation, None }

    data class Context(val activeCode: String? = null, val secondaryCode: String? = null)

    data class Outcome(
        val activeCode: String?,
        val secondaryCode: String?,
        val action: Action,
        /** La langue à traduire, seulement pour [Action.RequestTranslation]. */
        val targetLanguage: String? = null,
    )

    /**
     * @param contentCodes les langues (hors origine) qui portent déjà un texte non vide.
     * @param preferredCode la langue primaire du Prisme du lecteur, ou null.
     */
    fun handleTap(
        code: String,
        current: Context,
        originalLanguage: String?,
        preferredCode: String?,
        contentCodes: Set<String>,
    ): Outcome {
        val tapped = code.normalizedCode()
            ?: return Outcome(current.activeCode, current.secondaryCode, Action.None)
        val original = originalLanguage.normalizedCode()
        val isOriginal = tapped == original
        val hasContent = isOriginal || contentCodes.any { it.normalizedCode() == tapped }
        return when {
            !hasContent -> Outcome(current.activeCode, current.secondaryCode, Action.RequestTranslation, tapped)
            isOriginal || tapped == preferredCode.normalizedCode() -> Outcome(tapped, null, Action.SwitchPrimary)
            tapped == current.secondaryCode.normalizedCode() ->
                Outcome(current.activeCode, null, Action.CloseSecondary)
            else -> Outcome(current.activeCode, tapped, Action.OpenSecondary)
        }
    }

    private fun String?.normalizedCode(): String? =
        this?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
}
