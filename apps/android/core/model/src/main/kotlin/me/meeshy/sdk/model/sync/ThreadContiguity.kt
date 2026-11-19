package me.meeshy.sdk.model.sync

/**
 * La CONTIGUÏTÉ de l'historique détenu d'un fil (#18929, #19114, #19046 F12) — règle pure, en horloge SERVEUR seulement.
 *
 * [watermark] : l'instant (`createdAt`, ms) jusqu'auquel l'historique détenu est prouvé SANS TROU, depuis le plus ancien
 * message détenu. Il n'avance que par une lecture contiguë — la fenêtre récente et le balayage `after=` qui la rejoint, ou
 * une page arrière qui referme le trou —, jamais par un message poussé (préchargement d'un push), un événement du socket
 * ou l'accusé d'un envoi : ces lignes-là sont isolées, et un balayage parti d'elles sautait les messages qui les précèdent.
 *
 * [gapTop] : quand un trou subsiste entre [watermark] et la fenêtre récente (balayage arrêté à son plafond, retour au
 * présent), l'instant du plus ancien message du segment contigu qui le surplombe — la fenêtre, puis ce que la pagination
 * arrière lui ajoute. Le fil n'affiche que ce segment, et la pagination arrière part de lui jusqu'à rejoindre [watermark] :
 * le trou est toujours au bord de ce qui se lit, jamais un saut invisible au milieu.
 *
 * Chaque transition n'affirme que ce qu'une lecture a prouvé : un filigrane plus bas que le vrai coûte une relecture, un
 * filigrane plus haut ferait sauter des messages — la règle ne se trompe que dans le premier sens.
 */
data class ThreadContiguity(val watermark: Long? = null, val gapTop: Long? = null) {

    /** Les instants servis d'une page de la fenêtre récente : son plus ancien et son plus récent message. */
    data class Span(val oldest: Long, val newest: Long)

    /** Ce qu'a fait le balayage `after=` au-delà de la fenêtre. */
    sealed interface Sweep {
        /** Lu jusqu'à la fenêtre, ou inutile parce que la fenêtre rejoignait ce qui était détenu. */
        data object Complete : Sweep

        /** Volontairement omis : le retour au présent (#14670) pose la fenêtre seule. */
        data object Skipped : Sweep

        /** Arrêté à son plafond après avoir lu jusqu'à [newestRead] (`null` : il n'a rien lu). */
        data class Ceiling(val newestRead: Long?) : Sweep
    }

    /** Le départ du balayage `after=` : le filigrane, ou faute de lui (cache écrit avant lui) le plus récent détenu. */
    fun sweepFrom(heldUpTo: Long?): Long? = watermark ?: heldUpTo

    /**
     * F12 — `If-None-Match` ne part que si rien n'est détenu au-delà de la page que le validateur décrit : sans trou, le
     * filigrane EST le plus récent de cette page. Une ligne arrivée après elle (socket, accusé), puis supprimée sans que
     * l'événement n'arrive, laissait la fenêtre identique : le 304 la gardait, elle et son clair. Avec un trou, jamais : un
     * 304 arrêterait le balayage qui le comble.
     */
    fun mayRevalidateConditionally(heldUpTo: Long?): Boolean {
        val described = watermark ?: return false
        return gapTop == null && (heldUpTo == null || heldUpTo <= described)
    }

    /** Ce que prouve une revalidation qui a lu la fenêtre [window] (`null` : page vide), et au-delà le balayage [sweep]. */
    fun afterRevalidation(heldUpTo: Long?, window: Span?, sweep: Sweep): ThreadContiguity {
        if (window == null) return ThreadContiguity(watermark, gapTop = null)
        val from = sweepFrom(heldUpTo)
        if (from == null || window.oldest <= from) return ThreadContiguity(window.newest, gapTop = null)
        return when (sweep) {
            Sweep.Complete -> ThreadContiguity(window.newest, gapTop = null)
            Sweep.Skipped -> ThreadContiguity(from, gapTop = window.oldest)
            is Sweep.Ceiling -> {
                val reached = maxOf(from, sweep.newestRead ?: from)
                if (reached >= window.oldest) ThreadContiguity(window.newest, gapTop = null)
                else ThreadContiguity(reached, gapTop = window.oldest)
            }
        }
    }

    /**
     * Ce que prouve une page arrière lue AVANT la ligne [cursorAt] du segment qui surplombe le trou : elle lui est
     * contiguë. Si elle rejoint le filigrane, ou si le serveur n'a plus rien avant elle ([exhausted], page vide), le trou est
     * refermé jusqu'au curseur ; sinon elle abaisse le haut du trou. Sans trou, elle ne prouve rien de neuf.
     */
    fun afterOlderPage(cursorAt: Long, pageOldest: Long?, exhausted: Boolean): ThreadContiguity {
        val top = gapTop ?: return this
        val floor = watermark
        val joined = pageOldest == null || exhausted || (floor != null && pageOldest <= floor)
        if (joined) return ThreadContiguity(maxOf(floor ?: cursorAt, cursorAt), gapTop = null)
        return copy(gapTop = minOf(top, pageOldest ?: top))
    }
}
