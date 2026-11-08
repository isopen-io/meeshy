package me.meeshy.sdk.model.scene

/**
 * La fenêtre glissante de prélecture du lecteur de stories — miroir de `StoryReaderPrefetcher.windowIndices`
 * (iOS) : `[N-1, N, N+1, N+2]`. Une slide d'avance en arrière pour le retour, DEUX en avant parce que la
 * navigation avant domine ; tout ce qui sort de la fenêtre est évincé pour borner la mémoire.
 *
 * Pur : aucune horloge, aucun lecteur — le plan dit QUOI préparer et QUOI libérer, l'hôte exécute.
 */
object StoryReaderWindow {

    const val BEHIND: Int = 1
    const val AHEAD: Int = 2

    /** Les rangs gardés autour de [current], bornés à `0 until count` ; vide si le rang courant n'existe pas. */
    fun indices(current: Int, count: Int): List<Int> {
        if (count <= 0 || current !in 0 until count) return emptyList()
        return (maxOf(0, current - BEHIND)..minOf(count - 1, current + AHEAD)).toList()
    }

    /**
     * Ce que l'hôte doit faire : [prepare] les slides voulues pas encore chaudes (dans l'ordre de lecture,
     * la courante d'abord), [evict] celles qui sont chaudes sans être voulues.
     */
    data class Plan(val desired: Set<String>, val prepare: List<String>, val evict: Set<String>)

    /**
     * [ids] : les slides du groupe, dans l'ordre. [warm] : celles déjà préparées. [extraWarm] : slides gardées
     * chaudes HORS fenêtre (l'entrée des groupes voisins) — protégées de l'éviction tant qu'elles sont passées.
     * Un rang courant invalide évince tout.
     */
    fun plan(ids: List<String>, current: Int, warm: Set<String>, extraWarm: List<String> = emptyList()): Plan {
        val window = indices(current, ids.size)
        if (window.isEmpty()) return Plan(emptySet(), emptyList(), warm.toSet())
        val ordered = (listOf(ids[current]) + window.map { ids[it] } + extraWarm).distinct()
        val desired = ordered.toSet()
        return Plan(desired = desired, prepare = ordered.filter { it !in warm }, evict = warm - desired)
    }
}
