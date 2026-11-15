package me.meeshy.app.stories

/**
 * **Les vignettes d'une vidéo, une à une** (#14300). Chaque instant de [times] prend la première image que l'un des
 * décodages de [grabs] rend, dans l'ordre (le décodage nominal, puis son repli). La suite rend la bande DÉJÀ garnie après
 * chaque nouvelle vignette : rien n'attend la dernière. Un instant que rien ne décode est sauté. Pure.
 */
internal object VideoFrameCollector {

    fun <T : Any> partials(times: List<Long>, grabs: List<(Long) -> T?>): Sequence<List<T>> = sequence {
        var kept = emptyList<T>()
        times.forEach { at ->
            val frame = grabs.firstNotNullOfOrNull { grab -> grab(at) } ?: return@forEach
            kept = kept + frame
            yield(kept)
        }
    }
}

/** Une mémoire bornée qui oublie la plus anciennement LUE (#14300) : rouvrir « Couper » ne relance aucune extraction. */
internal class BoundedMemory<K : Any, V : Any>(private val capacity: Int) {
    private val entries = object : LinkedHashMap<K, V>(capacity, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<K, V>?): Boolean = size > capacity
    }

    @Synchronized
    operator fun get(key: K): V? = entries[key]

    @Synchronized
    fun put(key: K, value: V) {
        entries[key] = value
    }
}
