package me.meeshy.app.stories

import android.graphics.Bitmap

/**
 * A byte-bounded LRU of painted values, so the rail keeps a handful of tiny bitmaps and never grows with the author's edits.
 * Thread-safe: the tiles render on a background dispatcher and read from the main thread.
 */
internal class SlideThumbnailStore<K : Any, V : Any>(private val maxBytes: Int, private val sizeOf: (V) -> Int) {
    private val entries = LinkedHashMap<K, V>(16, 0.75f, true)
    private var bytes = 0

    @Synchronized
    fun get(key: K): V? = entries[key]

    @Synchronized
    fun put(key: K, value: V) {
        entries.put(key, value)?.let { bytes -= sizeOf(it) }
        bytes += sizeOf(value)
        val eldest = entries.entries.iterator()
        while (bytes > maxBytes && entries.size > 1 && eldest.hasNext()) {
            val victim = eldest.next()
            if (victim.key == key) continue
            bytes -= sizeOf(victim.value)
            eldest.remove()
        }
    }

    companion object {
        /** About fifty tiles of 74×132 px: ten slides, a few generations each, 2 MB at most. */
        private const val MAX_BYTES = 2 * 1024 * 1024

        val shared: SlideThumbnailStore<SlideThumbnailSpec, Bitmap> =
            SlideThumbnailStore(MAX_BYTES) { it.allocationByteCount }
    }
}
