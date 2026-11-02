package me.meeshy.sdk.model.media

/**
 * **Combien de couches Lottie jouent à la fois** — miroir de `LottieLiveBudget` (iOS) et de `createLottieBudget` (web).
 *
 * - une couche qui ENTRE à l'écran demande une place ; libre, elle l'obtient ;
 * - une couche qui SORT garde sa place tant que personne n'en a besoin ;
 * - sous pression, la place la plus anciennement sortie est reprise ([claim]'s `evict`) ;
 * - toutes les places à l'écran ⇒ la nouvelle venue attend (image fixe) et perd son tour si elle ressort avant.
 *
 * Confiné à un seul fil (le fil principal) : aucune synchronisation.
 */
public class LottieLiveBudget(public val max: Int) {
    private class Entry(val grant: () -> Unit, val evict: () -> Unit) {
        var visible = false
        var held = false
        var asleepSince = 0
    }

    private val entries = LinkedHashMap<Int, Entry>()
    private val waiting = ArrayDeque<Int>()
    private var nextTicket = 0
    private var clock = 0

    /** Le nombre de couches qui tiennent une place. */
    public val holders: Int get() = entries.values.count { it.held }

    /** Inscrit une couche, sans place tant qu'elle n'est pas à l'écran. */
    public fun claim(grant: () -> Unit, evict: () -> Unit): Int {
        nextTicket += 1
        entries[nextTicket] = Entry(grant, evict)
        return nextTicket
    }

    public fun setVisible(ticket: Int, visible: Boolean) {
        val entry = entries[ticket] ?: return
        if (entry.visible == visible) return
        entry.visible = visible
        if (visible) {
            if (!entry.held) waiting.addLast(ticket)
        } else {
            waiting.remove(ticket)
            clock += 1
            entry.asleepSince = clock
        }
        pump()
    }

    /** La couche quitte la hiérarchie : sa place se libère pour la suivante. */
    public fun release(ticket: Int) {
        if (entries.remove(ticket) == null) return
        waiting.remove(ticket)
        pump()
    }

    private fun pump() {
        while (waiting.isNotEmpty()) {
            val next = waiting.first()
            if (holders >= max) {
                val victim = oldestAsleep() ?: return
                victim.held = false
                victim.evict()
            }
            waiting.removeFirst()
            entries[next]?.let {
                it.held = true
                it.grant()
            }
        }
    }

    private fun oldestAsleep(): Entry? =
        entries.values.filter { it.held && !it.visible }.minByOrNull { it.asleepSince }

    public companion object {
        /** Huit films vivants, toutes surfaces confondues. */
        public const val MAX_LIVE_LAYERS: Int = 8
    }
}
