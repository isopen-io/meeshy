package me.meeshy.ui.sticker.template

import android.graphics.Bitmap
import android.util.LruCache
import android.util.SizeF

/** Le dessin d'un gabarit ET SA TAILLE en dp : ne pas la recalculer depuis le bitmap, la densité pouvant avoir été plafonnée. */
public class StickerTemplateRender(public val bitmap: Bitmap, public val size: SizeF)

/**
 * Le cache des rendus — le même gabarit ne se redessine pas. Une cellule de bulle rejoue sa rastérisation à chaque
 * réapparition et la feuille redessine ses vignettes : scroller loin puis revenir ne doit pas refaire tourner le canevas
 * pour un dessin IDENTIQUE. Le plafond qui compte est celui des OCTETS (24 Mo), pas celui des entrées.
 */
internal class StickerTemplateImageCache(maxBytes: Int = MAX_BYTES) {
    private val cache = object : LruCache<String, StickerTemplateRender>(maxBytes) {
        override fun sizeOf(key: String, value: StickerTemplateRender): Int = bitmapCost(value.bitmap)
    }

    fun get(key: String): StickerTemplateRender? = synchronized(cache) { cache.get(key) }

    fun put(key: String, render: StickerTemplateRender) {
        synchronized(cache) { cache.put(key, render) }
    }

    fun clear() = synchronized(cache) { cache.evictAll() }

    companion object {
        const val MAX_BYTES: Int = 24 * 1024 * 1024

        /** La clé d'un rendu : ce qui le fait DIFFÉRER — gabarit, emplacements TRIÉS, mesures, densité — et rien d'autre. */
        fun key(drawerId: String, slots: Map<String, String>, metrics: StickerTemplateMetrics, density: Float): String =
            listOf(
                drawerId,
                slots.keys.sorted().joinToString("\u001F") { "$it=${slots[it]}" },
                metrics.fontSize, metrics.horizontalPadding, metrics.verticalPadding, metrics.gap, density,
            ).joinToString("|")

        fun bitmapCost(bitmap: Bitmap): Int = bitmap.width.coerceAtLeast(0) * bitmap.height.coerceAtLeast(0) * 4
    }
}
