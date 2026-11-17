package me.meeshy.sdk.notification

import me.meeshy.sdk.model.ApiNotification

/**
 * Le journal de ce que le TEMPS RÉEL a posé dans la cloche pendant qu'une relecture REST était en vol.
 *
 * Une resynchro (retour au premier plan, reconnexion, péremption) lit le compteur puis la liste ; le serveur répond avec
 * un état calculé AVANT une notification arrivée entre-temps par le socket. Poser ces réponses telles quelles effaçait
 * la ligne et ramenait le badge à sa valeur d'avant. La [generation] dit « le temps réel a parlé depuis mon départ » ;
 * les identifiants permettent de remettre en tête les lignes arrivées que la page n'a pas.
 *
 * Borné : au-delà de [capacity] arrivées pendant un seul vol, les plus anciennes sont oubliées (le prochain vol les
 * rapporte), jamais la mémoire n'enfle.
 */
internal class NotificationLiveArrivals(private val capacity: Int = DEFAULT_CAPACITY) {
    private val lock = Any()
    private var generation = 0L
    private val arrivals = ArrayDeque<Pair<Long, String>>()

    fun generation(): Long = synchronized(lock) { generation }

    /** Une valeur serveur-autoritative (`notification:counts`) vient d'être posée : une lecture partie avant est périmée. */
    fun counted() {
        synchronized(lock) { generation += 1 }
    }

    /** La ligne [id] entre dans la liste. À appeler AVANT l'insertion : une relecture qui finit entre les deux la retrouve. */
    fun arrived(id: String) {
        synchronized(lock) {
            generation += 1
            arrivals.addLast(generation to id)
            while (arrivals.size > capacity) arrivals.removeFirst()
        }
    }

    /**
     * La [page] servie, précédée des lignes arrivées depuis [since] que la page n'a pas et que la liste [current] garde
     * encore : une ligne supprimée entre-temps ne ressuscite pas, et la version COURANTE d'une ligne (lue depuis) gagne.
     * Le plus récent d'abord.
     */
    fun mergedInto(page: List<ApiNotification>, current: List<ApiNotification>?, since: Long): List<ApiNotification> {
        if (current == null) return page
        val ids = synchronized(lock) { arrivals.filter { it.first > since }.map { it.second } }
        if (ids.isEmpty()) return page
        val inPage = page.mapTo(HashSet(page.size)) { it.id }
        val currentById = current.associateBy { it.id }
        val survivors = ids.asReversed().distinct().filter { it !in inPage }.mapNotNull { currentById[it] }
        return survivors + page
    }

    private companion object {
        const val DEFAULT_CAPACITY = 64
    }
}
