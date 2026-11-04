package me.meeshy.sdk.model.conversationlist

/**
 * La remontée en tête d'une conversation, vue depuis la LISTE (iOS `ConversationListReorderMotion`, #11212).
 *
 * Deux cas suppriment le ressort : Réduire les animations (la ligne change de place sans voyager) et le
 * défilement en cours, où un ressort viendrait se battre avec le doigt. Et SEULE la remontée s'anime :
 * un changement de filtre, une page ajoutée, un changement de compte ou une réconciliation se remplacent
 * sans ressort — [isBumpToTop] reconnaît la remontée à sa forme.
 */
object ConversationListReorderMotion {
    const val RESPONSE_SECONDS: Float = 0.35f
    const val DAMPING_FRACTION: Float = 0.86f

    /** Délai après le dernier tick de défilement au-delà duquel la liste est au repos (iOS 0,3 s). */
    const val SCROLL_SETTLE_MILLIS: Long = 300L

    /** Vrai quand la remontée doit voyager en ressort : ni Réduire les animations, ni défilement en cours. */
    fun animates(reduceMotion: Boolean, isScrolling: Boolean): Boolean = !reduceMotion && !isScrolling

    /**
     * Une remontée en tête : les MÊMES conversations, l'une passée en tête, les autres dans leur ordre
     * d'avant. Tout autre changement d'ordre (filtre, page, compte, liste réécrite) n'en est pas une.
     */
    fun isBumpToTop(previous: List<String>, current: List<String>): Boolean {
        val head = current.firstOrNull() ?: return false
        if (previous.size != current.size || previous.first() == head || head !in previous) return false
        return current.drop(1) == previous.filter { it != head }
    }

    fun isScrolling(lastTickMillis: Long?, nowMillis: Long): Boolean =
        lastTickMillis != null && nowMillis - lastTickMillis < SCROLL_SETTLE_MILLIS

    /** La décision complète : la liste anime sa remontée pour ce passage de [previous] à [current]. */
    fun shouldSpring(previous: List<String>?, current: List<String>, reduceMotion: Boolean, isScrolling: Boolean): Boolean =
        animates(reduceMotion, isScrolling) && isBumpToTop(previous ?: current, current)
}
