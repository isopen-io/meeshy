package me.meeshy.sdk.cache.store

/**
 * Le niveau 1 d'un [CacheStore] (iOS `CacheCoordinator`) : les dernieres cles lues, gardees en memoire pour qu'une relecture
 * s'ouvre sans requete Room. Borne a [capacity] cles, la moins recemment utilisee sort la premiere. Il ne contient que des
 * copies : le disque reste la source de verite, et le L1 se vide sans rien perdre (pression memoire, deconnexion).
 */
class MemoryL1<V : Any>(val capacity: Int = DEFAULT_CAPACITY) {

    init {
        require(capacity > 0) { "capacity must be positive" }
    }

    private val entries = object : LinkedHashMap<String, V>(capacity + 1, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, V>): Boolean = size > capacity
    }

    @Synchronized
    operator fun get(key: String): V? = entries[key]

    @Synchronized
    fun put(key: String, value: V) {
        entries[key] = value
    }

    @Synchronized
    fun remove(key: String) {
        entries.remove(key)
    }

    @Synchronized
    fun clear() {
        entries.clear()
    }

    @Synchronized
    fun keys(): List<String> = entries.keys.toList()

    val size: Int
        @Synchronized get() = entries.size

    companion object {
        const val DEFAULT_CAPACITY = 20
    }
}
