package me.meeshy.sdk.model.story

/**
 * La file de préparation des voisines : idempotente par clé de slide, annulable tant qu'une préparation n'a pas
 * démarré. Pure — l'hôte tire [next], exécute, puis rend [complete] ou [fail].
 *
 * - [plan] remplace l'ordre des préparations EN ATTENTE : ce qui n'est plus voulu et n'a pas démarré est annulé
 *   (et rendu), ce qui a démarré n'est jamais interrompu, ce qui est déjà fait ou en cours n'est pas replanifié.
 * - [fail] libère la clé : une panne n'est pas mémorisée comme un succès.
 */
class StoryNeighborPrefetchQueue<K : Any> {
    private var pending: List<K> = emptyList()
    private val started = LinkedHashSet<K>()
    private val done = LinkedHashSet<K>()

    val inFlight: Set<K> get() = started.toSet()
    val pendingKeys: List<K> get() = pending

    /** Rend les clés annulées (en attente, plus voulues). */
    fun plan(ordered: List<K>): List<K> {
        val wanted = ordered.distinct()
        val cancelled = pending.filter { it !in wanted }
        pending = wanted.filter { it !in started && it !in done }
        done.retainAll(wanted.toSet())
        return cancelled
    }

    /** La prochaine préparation à démarrer, marquée démarrée ; `null` si rien n'attend. */
    fun next(): K? {
        val key = pending.firstOrNull() ?: return null
        pending = pending.drop(1)
        started += key
        return key
    }

    fun complete(key: K) {
        if (started.remove(key)) done += key
    }

    fun fail(key: K) {
        started.remove(key)
    }

    /** Fermeture du lecteur : tout est oublié. */
    fun clear() {
        pending = emptyList()
        started.clear()
        done.clear()
    }
}
