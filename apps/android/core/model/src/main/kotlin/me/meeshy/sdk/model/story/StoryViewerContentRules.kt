package me.meeshy.sdk.model.story

/**
 * Ce que le lecteur de story DÉRIVE de l'exploration de langue (miroir de `StoryReaderContentRules` et de
 * `StoryLanguageQuickBar.override(afterTapping:)` / `StoryLanguageDetailView` côté iOS) : fonctions pures.
 */
object StoryViewerContentRules {

    /**
     * Sentinelle « Original » : une story est multilingue par nature (chaque overlay a sa langue d'écriture), donc
     * revenir à l'original ne peut pas passer par la langue d'origine de la story. « Original » VIDE la chaîne : chaque
     * texte retombe sur le sien. Ne peut pas entrer en collision avec un code BCP-47.
     */
    const val ORIGINAL_LANGUAGE_OVERRIDE: String = "__meeshy.original__"

    /** Délai au-delà duquel le spinner « Retraduire » est coupé (le modèle peut rendre un texte identique). */
    const val RETRANSLATE_TIMEOUT_MILLIS: Long = 20_000L

    /** Longueur de l'aperçu d'une ligne de langue. */
    const val ROW_PREVIEW_LENGTH: Int = 50

    /** L'override d'exploration passe en tête de la chaîne, sans doublon ; `Original` la vide. */
    fun viewerLanguageChain(base: List<String>, override: String?): List<String> {
        if (override.isNullOrEmpty()) return base
        if (override == ORIGINAL_LANGUAGE_OVERRIDE) return emptyList()
        return listOf(override) + base.filter { it != override }
    }

    /** Toucher la langue déjà choisie la relâche (retour au Prisme) ; toute autre se choisit ; « Original » ne se relâche pas. */
    fun overrideAfterTapping(id: String, current: String?): String? {
        if (current == null || current == ORIGINAL_LANGUAGE_OVERRIDE) return id
        return if (sameLanguage(id, current)) null else id
    }

    /** Une retraduction est en vol tant que le texte affiché n'a pas bougé depuis la demande. */
    fun isRetranslating(baseline: String?, currentText: String?): Boolean =
        baseline != null && baseline == currentText

    fun isRetranslationExpired(startedAt: Long, now: Long): Boolean = now - startedAt >= RETRANSLATE_TIMEOUT_MILLIS

    fun rowPreview(text: String): String =
        if (text.length <= ROW_PREVIEW_LENGTH) text else text.take(ROW_PREVIEW_LENGTH) + "…"

    private fun sameLanguage(lhs: String, rhs: String): Boolean {
        val a = lhs.lowercase()
        val b = rhs.lowercase()
        if (a == b) return true
        val baseA = a.substringBefore('-')
        return baseA.isNotEmpty() && baseA == b.substringBefore('-')
    }
}
