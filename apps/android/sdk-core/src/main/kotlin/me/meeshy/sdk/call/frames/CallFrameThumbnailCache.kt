package me.meeshy.sdk.call.frames

import android.content.ComponentCallbacks2
import android.graphics.Bitmap
import android.util.LruCache

/**
 * Les vignettes des cadres du carrousel (miroir de iOS `CallFrameThumbnailCache`, #8743, spec § 3) : rendues
 * pour la seule fenêtre visible, gardées dans un cache BORNÉ, clé = cadre x nombre de personnes x taille.
 *
 * Deux plafonds bornent ce que le Montage retient, quel que soit le catalogue : [countLimit] vignettes et
 * [costLimit] octets. Une vignette compte pour au moins `costLimit / countLimit` octets, de sorte qu'un seul
 * [LruCache] tient les deux bornes. Le cache se vide sous la pression mémoire ([trimMemory]).
 */
class CallFrameThumbnailCache(
    countLimit: Int = DEFAULT_COUNT_LIMIT,
    private val costLimit: Int = DEFAULT_COST_LIMIT,
) {
    private val floorCost = (costLimit / countLimit.coerceAtLeast(1)).coerceAtLeast(1)

    private val cache = object : LruCache<String, Bitmap>(costLimit) {
        override fun sizeOf(key: String, value: Bitmap): Int = costOf(value)
    }

    private fun costOf(bitmap: Bitmap): Int = maxOf(bitmap.byteCount, floorCost)

    fun image(frameId: String, people: Int, width: Int, height: Int): Bitmap? =
        cache.get(key(frameId, people, width, height))?.takeUnless { it.isRecycled }

    fun store(image: Bitmap, frameId: String, people: Int, width: Int, height: Int) {
        if (costOf(image) > costLimit) return
        cache.put(key(frameId, people, width, height), image)
    }

    fun removeAll() = cache.evictAll()

    /**
     * Sous pression mémoire, les vignettes sont reconstructibles : on les rend. `TRIM_MEMORY_UI_HIDDEN` (20) n'est qu'un
     * rappel (l'écran revient dans l'instant) et `RUNNING_MODERATE` (5) un palier léger : ils ne vident rien. Les paliers ne
     * sont pas ordonnés par gravité (UI_HIDDEN > RUNNING_LOW), d'où l'exclusion explicite.
     */
    fun trimMemory(level: Int) {
        if (level != ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN && level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) removeAll()
    }

    /** Le NOMBRE de vignettes gardées — `LruCache.size()` rend la somme des coûts (octets), pas le compte. */
    val size: Int get() = cache.snapshot().size

    companion object {
        const val DEFAULT_COUNT_LIMIT = 48
        const val DEFAULT_COST_LIMIT = 8 * 1024 * 1024

        val shared: CallFrameThumbnailCache by lazy { CallFrameThumbnailCache() }

        fun key(frameId: String, people: Int, width: Int, height: Int): String = "$frameId|$people|${width}x$height"
    }
}
