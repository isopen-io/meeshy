package me.meeshy.sdk.model.mood

/**
 * L'ANCRAGE (iOS `anchorStatusAsPost`) : republier une humeur éphémère en POST permanent. Un commentaire ajouté fait
 * une citation, l'absence de commentaire un repost simple.
 */
object StatusAnchor {
    sealed interface Plan {
        data object SimpleRepost : Plan

        data class Quote(val comment: String) : Plan
    }

    /**
     * [prefill] est la phrase de la source que le composeur pré-remplit : la renvoyer telle quelle ne déclare aucun
     * commentaire de l'auteur.
     */
    fun plan(comment: String?, prefill: String? = null): Plan {
        val trimmed = comment?.trim().orEmpty()
        val untouched = prefill != null && trimmed == prefill.trim()
        return if (trimmed.isEmpty() || untouched) Plan.SimpleRepost else Plan.Quote(trimmed)
    }
}
