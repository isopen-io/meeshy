package me.meeshy.sdk.model.scene

/**
 * Où en était la lecture d'une scène, pour la surface SUIVANTE — miroir de `ScenePlaybackPositions` (iOS, #6580).
 * La carte du fil joue en boucle, le doigt ouvre le plein écran : sans cette mémoire, vidéo et fond sonore
 * repartaient de zéro. Elle ne compte rien, elle MÉMORISE ce qu'une surface a déjà émis.
 *
 * Deux gardes : [FRESHNESS_MS] (au-delà, ce n'est plus une reprise mais un saut) et [CAPACITY] (un fil défile,
 * une mémoire non bornée est une fuite — l'entrée la plus ancienne cède).
 */
class ScenePlaybackPositions(private val nowMillis: () -> Long = System::currentTimeMillis) {

    private data class Entry(val seconds: Double, val atMillis: Long)

    private val entries = LinkedHashMap<String, Entry>()

    @Synchronized
    fun publish(seconds: Double, key: String) {
        if (!seconds.isFinite() || seconds < 0.0) return
        if (!entries.containsKey(key) && entries.size >= CAPACITY) entries.remove(entries.keys.first())
        entries[key] = Entry(seconds, nowMillis())
    }

    /** La position d'ouverture, ou `null` = « ouvre à zéro » (clé absente, périmée, ou position nulle). */
    @Synchronized
    fun position(key: String?): Double? {
        val entry = key?.let(entries::get) ?: return null
        if (nowMillis() - entry.atMillis > FRESHNESS_MS) return null
        return entry.seconds.takeIf { it > 0.0 }
    }

    @Synchronized
    fun reset() = entries.clear()

    companion object {
        const val FRESHNESS_MS: Long = 10_000
        const val CAPACITY: Int = 32

        /** La clé partagée par les deux surfaces : le PORTEUR de la scène et son rang (jamais l'id de scène seul). */
        fun key(carrierId: String?, sceneIndex: Int): String? =
            carrierId?.takeIf { it.isNotEmpty() }?.let { "$it#$sceneIndex" }
    }
}
