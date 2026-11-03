package me.meeshy.sdk.model.sticker

/**
 * Un cache à budget d'octets, du moins récemment servi au plus récent (LRU) : une entrée qui dépasse le budget évince les plus
 * anciennes. Pur et sans Android, pour que les plafonds des caches d'images fixes et de films se prouvent sur la JVM.
 */
class ByteBudgetCache<K : Any, V : Any>(private val maxBytes: Long, private val sizeOf: (V) -> Long) {
    private val entries = LinkedHashMap<K, V>(16, 0.75f, true)
    private var bytes = 0L

    val sizeBytes: Long
        @Synchronized get() = bytes
    val count: Int
        @Synchronized get() = entries.size

    @Synchronized
    operator fun get(key: K): V? = entries[key]

    @Synchronized
    fun put(key: K, value: V) {
        val size = sizeOf(value).coerceAtLeast(0)
        if (size > maxBytes) {
            remove(key)
            return
        }
        entries.put(key, value)?.let { bytes -= sizeOf(it).coerceAtLeast(0) }
        bytes += size
        val iterator = entries.entries.iterator()
        while (bytes > maxBytes && iterator.hasNext()) {
            val eldest = iterator.next()
            if (eldest.key == key) continue
            bytes -= sizeOf(eldest.value).coerceAtLeast(0)
            iterator.remove()
        }
    }

    @Synchronized
    fun remove(key: K): V? = entries.remove(key)?.also { bytes -= sizeOf(it).coerceAtLeast(0) }

    @Synchronized
    fun clear() {
        entries.clear()
        bytes = 0
    }
}
