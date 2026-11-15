package me.meeshy.ui.appearance

import androidx.compose.ui.graphics.ImageBitmap
import me.meeshy.sdk.model.appearance.AppearanceTilePlan
import me.meeshy.sdk.model.appearance.BoundedLruCache

/**
 * Le cache BORNÉ des tuiles (spec §§ 8.2, 13) : une tuile est rendue UNE fois en bitmap puis répétée par le
 * shader ; trente-deux entrées au plus, la plus ancienne tombe. Synchronisé : le rendu se fait sur le fil de
 * dessin, mais les aperçus (liste de modèles) peuvent s'y croiser.
 */
public class AppearanceTileCache(capacity: Int = AppearanceTilePlan.CACHE_CAPACITY) {
    private val storage = BoundedLruCache<String, ImageBitmap>(capacity)

    public val size: Int get() = synchronized(storage) { storage.size }

    public fun image(key: String, render: () -> ImageBitmap?): ImageBitmap? =
        synchronized(storage) { storage.getOrPut(key, render) }

    public fun clear(): Unit = synchronized(storage) { storage.clear() }

    public companion object {
        public val shared: AppearanceTileCache = AppearanceTileCache()
    }
}
