package me.meeshy.sdk.model.feed

/**
 * La retenue de tête du fil (#16676, miroir de la loi iOS `FeedHeadHold`) : tant que le lecteur n'est pas en haut du
 * fil, ou que le fil n'est pas à l'écran, les posts qui ARRIVENT en tête (un `post:created` de la socket, le résultat
 * d'une relecture silencieuse) restent hors de la liste affichée et se comptent dans la bannière « nouveaux posts ».
 * La liste ne bouge donc jamais au-dessus du post en lecture, et la position que l'écran restaure au retour (un index,
 * pas un post) retombe sur le même post.
 *
 * L'ancre est ce que le lecteur VOIT : posée quand la retenue commence, elle s'étend à chaque post qui s'affiche
 * pendant la retenue (une page chargée en queue). Est retenu tout ce qui PRÉCÈDE, dans la liste candidate, le premier
 * post ancré ; un post retenu puis supprimé quitte donc la candidate, et la retenue avec elle. Rien ne se retient sans
 * ancre (le premier chargement s'affiche toujours) ni quand plus aucun post ancré ne subsiste.
 *
 * La retenue se lève quand le lecteur revient en haut, touche la bannière ou tire pour rafraîchir : ce qu'elle gardait
 * entre alors en tête, dans l'ordre de la candidate.
 */
data class FeedHeadHold(private val anchor: Set<String>? = null) {

    val isHolding: Boolean get() = anchor != null

    /** Le pilotage de l'écran : [holding] commence la retenue sur [displayedIds] (si la liste n'est pas vide), ou la lève. */
    fun steered(holding: Boolean, displayedIds: Collection<String>): FeedHeadHold = when {
        !holding -> release()
        anchor != null || displayedIds.isEmpty() -> this
        else -> FeedHeadHold(displayedIds.toSet())
    }

    fun release(): FeedHeadHold = if (anchor == null) this else FeedHeadHold()

    /** Partage [candidate] entre ce qui s'affiche et ce qui attend ; [Split.next] est la retenue après cet affichage. */
    fun <T> split(candidate: List<T>, idOf: (T) -> String): Split<T> {
        val anchored = anchor ?: return Split(candidate, emptyList(), this)
        val firstAnchored = candidate.indexOfFirst { idOf(it) in anchored }
        val heldCount = firstAnchored.coerceAtLeast(0)
        val displayed = candidate.drop(heldCount)
        val unseen = displayed.map(idOf).filterNot { it in anchored }
        return Split(
            displayed = displayed,
            held = candidate.take(heldCount),
            next = if (unseen.isEmpty()) this else FeedHeadHold(anchored + unseen),
        )
    }

    data class Split<T>(val displayed: List<T>, val held: List<T>, val next: FeedHeadHold)

    companion object {
        /**
         * Le fil retient quand il n'est pas à l'écran ([displayed] faux : quitté, recouvert, en arrière-plan) ou quand le
         * premier élément visible est un post : [headItems] compte ce qui le précède (rail, porte du composeur, envois).
         */
        fun holds(displayed: Boolean, firstVisibleItemIndex: Int, headItems: Int): Boolean =
            !displayed || firstVisibleItemIndex >= headItems

        /** La bannière n'annonce jamais moins de posts que la retenue n'en garde, ni moins que les arrivées non vues. */
        fun bannerCount(arrivals: Int, held: Int): Int = maxOf(arrivals, held)
    }
}
