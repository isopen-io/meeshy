package me.meeshy.app.stories

import android.graphics.Bitmap

/**
 * A count- and byte-bounded LRU of painted values, so the rail keeps a handful of tiny bitmaps and never grows with the
 * author's edits (iOS `SceneThumbnailStore`: 40 entries, 4 MB). Nothing in it is irreplaceable — the memory may empty it at
 * any moment ([clear], [SceneThumbnailPressure]) and a tile repaints from its sources.
 * Thread-safe: the tiles render on a background dispatcher and read from the main thread.
 */
internal class SlideThumbnailStore<K : Any, V : Any>(
    private val maxBytes: Int,
    private val maxEntries: Int = Int.MAX_VALUE,
    private val sizeOf: (V) -> Int,
) {
    private val entries = LinkedHashMap<K, V>(16, 0.75f, true)
    private var bytes = 0

    @get:Synchronized
    val size: Int get() = entries.size

    @Synchronized
    fun get(key: K): V? = entries[key]

    @Synchronized
    fun put(key: K, value: V) {
        entries.put(key, value)?.let { bytes -= sizeOf(it) }
        bytes += sizeOf(value)
        val eldest = entries.entries.iterator()
        while ((bytes > maxBytes || entries.size > maxEntries) && entries.size > 1 && eldest.hasNext()) {
            val victim = eldest.next()
            if (victim.key == key) continue
            bytes -= sizeOf(victim.value)
            eldest.remove()
        }
    }

    /** Empties the store (memory pressure). */
    @Synchronized
    fun clear() {
        entries.clear()
        bytes = 0
    }

    /** A removed scene leaves no picture behind: keeps only the entries whose key [keep] still accepts. */
    @Synchronized
    fun retainWhere(keep: (K) -> Boolean) {
        val iterator = entries.entries.iterator()
        while (iterator.hasNext()) {
            val entry = iterator.next()
            if (keep(entry.key)) continue
            bytes -= sizeOf(entry.value)
            iterator.remove()
        }
    }

    companion object {
        /** Forty tiles, 4 MB at most: ten slides, a few generations each. */
        const val MAX_ENTRIES = 40
        const val MAX_BYTES = 4 * 1024 * 1024

        val shared: SlideThumbnailStore<SlideThumbnailSpec, Bitmap> =
            SlideThumbnailStore(MAX_BYTES, MAX_ENTRIES) { it.allocationByteCount }
    }
}

/** When the system asks for memory back, the tiles go: they are rebuilt from the scene on the next look (iOS memory warning). */
internal object SceneThumbnailPressure {
    private const val TRIM_MEMORY_RUNNING_LOW = 10

    fun purges(trimLevel: Int): Boolean = trimLevel >= TRIM_MEMORY_RUNNING_LOW
}
